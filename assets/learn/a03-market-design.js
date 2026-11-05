// a03-market-design.js — Analyst lesson A3, "Energy-only or capacity market? How wholesale markets are designed for high
// renewable shares" (step cards, closed-form, Learn W4, 2026-11-05).
//
// Data (read through data-src): town_year.json (SPP's 2025 hourly shapes, EIA-930), cf_targets.json (EIA's 2025 capacity
// factors), 07-cost.json (lesson 7: gas heat rates, upkeep and building costs, the gas price, 4% real over 30 years) and
// assets/learn/data/a03-market-design.json (the Plains market, the two designs, two hours, five arrangements around the
// world with their sources, a reference block written by the test).
//
// The model (closed-form: one year of hourly clearing, no solver, no randomness; pure, exported for Node):
//   hourly inputs  demand_t = 4,000 MW x SPP's 2025 demand shape; wind and solar = LX.townProfile (method "scale", EIA's
//                  2025 monthly then annual capacity factors) for 3,000 MW and the solar slider's MW
//   offers         wind and solar at minus the production credit ($25/MWh, illustrative); coal $24/MWh (illustrative);
//                  gas at heat rate x $3.85/MMBtu + variable upkeep (lesson 7): combined cycle $27.54, peakers $39.37
//   available      coal 1,000 MW x 92%, combined cycle 1,600 MW x 95%, peakers (slider) x 93%; wind and solar as above
//   clearing       uniform price, cheapest first; the marginal offer sets the price. Spare = available - demand. If spare <
//                  0, the price is the design's cap and -spare MW go unserved. If 0 <= spare < 600 MW, the price is the
//                  offer + (cap - offer) (1 - spare/600)^2 (a scarcity adder). Ties: wind and solar offer the same, so they
//                  share a partly used block in proportion to their output.
//   designs        energy-only: cap $5,000/MWh. Capacity market: cap $1,000/MWh (illustrative) and a capacity price equal
//                  to a new peaker's missing money (its yearly fixed cost minus its energy margin, at least 0), paid on every
//                  rated MW (units at their availability, wind 16% and solar 15%: lesson A5's ratings, held fixed).
//   per class      energy margin = sum over hours (price - running cost) x output (wind and solar also earn the credit),
//                  per kW installed; fixed cost = building cost x CRF(4%, 30 years) + fixed upkeep (lesson 7, 2025 $).
//   consumers      energy payments (price x demand served) + capacity payments, per MWh of demand (the credit is paid by
//                  taxpayers, outside this bill).
// Every number the page states comes from these functions; _tests/learn/test_a03-market-design.js checks them.
(function () {
  "use strict";
  var T = 8760, MD = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  // ---------------------------------------------------------------- pure model
  function crf(r, n) { return r / (1 - Math.pow(1 + r, -n)); }
  function setup(D, year, targets, profile, L7) {
    var G = D.market, o = { year: year, targets: targets, method: G.profileMethod, monthlyCF: G.monthlyCF, monthDays: MD };
    var w = profile("wind", 1, o).mw, s = profile("solar", 1, o).mw, d = new Float64Array(T), wf = new Float64Array(T), sf = new Float64Array(T);
    for (var i = 0; i < T; i++) { d[i] = G.peakMW * year.demand[i] / 1000; wf[i] = w[i]; sf[i] = s[i]; }
    var cost = {}, fixed = {}, k = crf(L7.finance.wacc / 100, L7.finance.life);
    G.units.forEach(function (u) { cost[u.id] = u.offer != null ? u.offer : L7.techs[u.tech].heatRate * L7.fuel.gas + L7.techs[u.tech].vom; });
    ["wind", "solar", "cc", "peaker"].forEach(function (t) { fixed[t === "peaker" ? "ct" : t] = L7.techs[t].capex * k + L7.techs[t].fom; });
    return { d: d, w: wf, s: sf, cost: cost, fixed: fixed, crf: k, gas: L7.fuel.gas };
  }
  function avail(D, id, ctMW) { var u = D.market.units.filter(function (x) { return x.id === id; })[0]; return (id === "ct" ? ctMW : u.mw) * u.avail; }
  // one hour: o = {solar MW, ct MW, design "eo"|"cm"}
  function hour(D, X, t, o) {
    var G = D.market, cap = D.designs[o.design].cap, R = D.designs.reserve, cr = -G.credit;
    var W = G.windMW * X.w[t], S = o.solar * X.s[t], d = X.d[t];
    var blocks = [{ key: "ren", mw: W + S, offer: cr }, { key: "coal", mw: avail(D, "coal"), offer: X.cost.coal }, { key: "cc", mw: avail(D, "cc"), offer: X.cost.cc }, { key: "ct", mw: avail(D, "ct", o.ct), offer: X.cost.ct }];
    var left = d, run = {}, marg = blocks[0], tot = 0;
    blocks.forEach(function (b) { var u = Math.max(0, Math.min(b.mw, left)); run[b.key] = u; if (u > 0) marg = b; left -= u; tot += b.mw; });
    var spare = tot - d, price, adder = 0, short = 0;
    if (spare < 0) { price = cap; short = -spare; }
    else { price = marg.offer; if (spare < R) { adder = (cap - marg.offer) * Math.pow(1 - spare / R, 2); price += adder; } }
    var share = W + S > 0 ? run.ren / (W + S) : 0;
    return { t: t, d: d, W: W, S: S, Wd: W * share, Sd: S * share, run: run, blocks: blocks, marginal: marg.key, offer: marg.offer, spare: spare, adder: adder, price: price, short: short };
  }
  function year(D, X, o) {
    var P = new Float64Array(T), m = { coal: 0, cc: 0, ct: 0, wind: 0, solar: 0 }, e = { solarMWh: 0, solarValue: 0, windMWh: 0, windValue: 0 };
    var neg = 0, scarce = 0, short = 0, unserved = 0, pay = 0, served = 0, demand = 0, top = -Infinity, cr = D.market.credit;
    for (var t = 0; t < T; t++) {
      var h = hour(D, X, t, o), p = h.price; P[t] = p;
      if (p < 0) neg++; if (h.adder > 0) scarce++; if (h.short > 0) { short++; unserved += h.short; }
      if (p > top) top = p;
      m.coal += (p - X.cost.coal) * h.run.coal; m.cc += (p - X.cost.cc) * h.run.cc; m.ct += (p - X.cost.ct) * h.run.ct;
      m.wind += (p + cr) * h.Wd; m.solar += (p + cr) * h.Sd;
      e.solarMWh += h.Sd; e.solarValue += p * h.Sd; e.windMWh += h.Wd; e.windValue += p * h.Wd;
      pay += p * (h.d - h.short); served += h.d - h.short; demand += h.d;
    }
    var avg = 0; for (t = 0; t < T; t++) avg += P[t]; avg /= T;
    var perKW = { wind: m.wind / (D.market.windMW * 1000), solar: o.solar > 0 ? m.solar / (o.solar * 1000) : null, cc: m.cc / (avail(D, "cc") / D.market.units[1].avail * 1000), ct: o.ct > 0 ? m.ct / (o.ct * 1000) : null };
    var r = { o: o, prices: P, avg: avg, neg: neg, scarce: scarce, short: short, unserved: unserved, top: top, perKW: perKW, energyPay: pay, demand: demand,
              solarCapture: e.solarMWh > 0 ? e.solarValue / e.solarMWh : null, windCapture: e.windValue / e.windMWh };
    r.solarRatio = r.solarCapture != null ? r.solarCapture / avg : null;
    // the capacity market: the price that gives a new peaker its fixed cost, paid on every rated MW
    var Rt = D.designs.ratings, rated = Rt.coal * 1000 + Rt.cc * 1600 + Rt.ct * o.ct + Rt.wind * D.market.windMW + Rt.solar * o.solar;
    r.capPrice = o.design === "cm" ? Math.max(0, (X.fixed.ct - (perKW.ct || 0)) / Rt.ct) : 0;   // $ per rated kW a year (a new peaker is rated at its availability)
    r.rated = rated; r.capPay = r.capPrice * rated * 1000;
    r.consumer = (pay + r.capPay) / demand;   // $ per MWh of demand
    r.covers = {};
    ["wind", "solar", "cc", "ct"].forEach(function (k) { if (perKW[k] != null) r.covers[k] = perKW[k] + (o.design === "cm" ? r.capPrice * Rt[k] : 0) - X.fixed[k]; });
    return r;
  }
  // the smallest peaker fleet (slider steps) at which a new peaker does not cover its fixed cost from energy-only prices:
  // the energy-only market's own resting point lies between it and the step below
  function restingPoint(D, X, solar) {
    var G = D.market.peakers, prev = null;
    for (var c = G.min; c <= G.max; c += G.step) { var r = year(D, X, { solar: solar, ct: c, design: "eo" }); if (r.covers.ct < 0) return { below: prev, above: { ct: c, r: r } }; prev = { ct: c, r: r }; }
    return { below: prev, above: null };
  }
  function dayIndex(date) { var m = +date.slice(5, 7), d = +date.slice(8, 10), s = 0; for (var i = 0; i < m - 1; i++) s += MD[i]; return s + d - 1; }
  function hourOf(H) { return dayIndex(H.date) * 24 + H.hour; }
  // sorted prices for a duration curve, clipped for drawing
  function duration(P) { return Array.prototype.slice.call(P).sort(function (a, b) { return b - a; }); }

  // ---------------------------------------------------------------- formats and texts (shared by the page and the test)
  var MINUS = "−";
  function usd(v) { return (v < 0 ? MINUS : "") + "$" + (Math.round(Math.abs(v) * 100) / 100).toFixed(2); }
  function usd0(v) { return (v < 0 ? MINUS : "") + "$" + Math.round(Math.abs(v)).toLocaleString("en-US"); }
  function int(v) { return Math.round(v).toLocaleString("en-US"); }
  function pct(f) { return Math.round(100 * f) + "%"; }
  function mwday(perKWyr) { return usd0(perKWyr * 1000 / 365); }   // $/kW-year to $/MW-day, whole dollars
  function coverText(k, v) { return (v >= 0 ? "covers its cost, " + usd0(v) + " to spare" : "falls " + usd0(-v) + " short") + " per kW a year"; }
  function solarText(a, b) {
    return "From " + int(a.o.solar) + " to " + int(b.o.solar) + " MW of solar, its capture price falls from " + usd(a.solarCapture) + " to " + usd(b.solarCapture) + " per MWh and negative-price hours rise from " + int(a.neg) + " to " + int(b.neg) + ". **Solar sells most when the price is lowest.**";
  }
  var fm = { usd: usd, usd0: usd0, int: int, pct: pct, mwday: mwday };
  var model = { T: T, MD: MD, crf: crf, setup: setup, avail: avail, hour: hour, year: year, restingPoint: restingPoint, dayIndex: dayIndex, hourOf: hourOf, duration: duration, coverText: coverText, solarText: solarText, fm: fm };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX || !window.LX.H) return;

  // ================================================================ the page
  var LX = window.LX, H = LX.H, SLUG = "a03-market-design", KEY = "a3-own";
  function css() {
    if (document.getElementById("a3-css")) return;
    H("style", { id: "a3-css", text: [
      ".a3-lab .lx-stepcard{grid-template-columns:minmax(0,1fr)}.a3-lab .lx-step-act{grid-template-columns:minmax(0,1fr)}.a3-lab .lx-stepcard>*,.a3-lab .lx-step-act>*{min-width:0}",
      ".a3-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}",
      ".a3-row .lx-btn.ghost[aria-pressed=\"true\"]{background:var(--lx-accent-soft);border-color:var(--lx-accent);color:var(--lx-ink)}",
      ".a3-kpis{display:flex;flex-wrap:wrap;gap:8px}",
      ".a3-kpi{display:grid;padding:7px 11px;border:1px solid var(--lx-line);border-radius:10px;background:var(--lx-surface-2);min-width:104px}",
      ".a3-kpi small{font-size:12px;color:var(--lx-ink-3);font-family:var(--lx-f-display)}.a3-kpi b{font-family:var(--lx-f-mono);font-size:16px;font-weight:600}",
      ".a3-kpi.bad b{color:var(--lx-bad)}.a3-kpi.good b{color:var(--lx-good)}",
      ".a3-tbl{overflow-x:auto;max-width:100%}.a3-tbl table{width:100%;border-collapse:collapse;font-size:14px}",
      ".a3-tbl th,.a3-tbl td{padding:5px 6px;border-bottom:1px solid var(--lx-line);text-align:right;font-weight:400;vertical-align:top}",
      ".a3-tbl th:first-child,.a3-tbl td:first-child{text-align:left}",
      ".a3-tbl thead th{font-family:var(--lx-f-display);font-size:12px;color:var(--lx-ink-3);vertical-align:bottom}",
      ".a3-tbl td{font-family:var(--lx-f-mono);font-variant-numeric:tabular-nums}.a3-tbl td:first-child{font-family:var(--lx-f-body)}",
      ".a3-tbl td.ok{color:var(--lx-good)}.a3-tbl td.no{color:var(--lx-bad)}",
      ".a3-note{font-size:13.5px;color:var(--lx-ink-3);margin:0}",
      "@media (max-width:560px){.a3-tbl table{font-size:12.5px}.a3-tbl th,.a3-tbl td{padding:4px 3px}.a3-tbl .ph{display:none}}"
    ].join("\n") }, document.head);
  }
  function kpi(host, label, value, tone) { var k = H("div", { class: "a3-kpi" + (tone ? " " + tone : "") }, host); H("small", { text: label }, k); H("b", { text: value }, k); return k; }
  function table(host, head, rows, label) {
    var w = H("div", { class: "a3-tbl", tabindex: "0", role: "region", "aria-label": label }, host), t = H("table", null, w), hr = H("tr", null, H("thead", null, t));
    var ph = head.map(function (x) { return x.charAt(0) === "~"; });
    head.forEach(function (x, i) { H("th", { scope: "col", class: ph[i] ? "ph" : "", text: x.replace(/^~/, "") }, hr); });
    var b = H("tbody", null, t);
    rows.forEach(function (r) { var tr = H("tr", null, b); r.forEach(function (c, i) { var td = H("td", { class: (ph[i] ? "ph " : "") + (c && c.cls ? c.cls : "") }, tr); td.textContent = c && c.text != null ? c.text : c; }); });
    return w;
  }
  var NAMES = { wind: "Wind farm", solar: "Solar farm", cc: "Gas combined cycle", ct: "Gas peaker" };

  LX.mount(SLUG, function (live, data, root) {
    css(); root.classList.add("a3-lab");
    var D = data.a03_market_design, G = D.market, X = setup(D, data.town_year, data.cf_targets, LX.townProfile, data["07_cost"]);
    var own = LX.store.get(KEY, {}) || {}; function remember(k, v) { own[k] = v; LX.store.set(KEY, own); }
    var ST = { solar: G.solar.value, ct: G.peakers.value }, cache = {};
    function get(o) { var k = o.solar + "|" + o.ct + "|" + o.design; if (!cache[k]) cache[k] = year(D, X, o); return cache[k]; }
    function base(design) { return get({ solar: ST.solar, ct: ST.ct, design: design || "eo" }); }
    function coverRows(r) { return ["wind", "solar", "cc", "ct"].filter(function (k) { return r.covers[k] != null; }).map(function (k) { var v = r.covers[k]; return [NAMES[k], usd0(r.perKW[k] + (r.o.design === "cm" ? r.capPrice * D.designs.ratings[k] : 0)), usd0(X.fixed[k]), { text: v >= 0 ? "yes" : "no", cls: v >= 0 ? "ok" : "no" }]; }); }

    var steps = [
      // 1 one hour on the stack
      { text: "Every hour, offers stack up from cheapest to dearest and the last one needed sets the price for all. Look at two hours of the Plains market.",
        build: function (act, api) {
          var row = H("div", { class: "a3-row", role: "group", "aria-label": "Hour" }, act), host = H("div", null, act), note = H("p", { class: "a3-note", "aria-live": "polite" }, act), seen = {};
          var NM = { ren: ["Wind and solar", "var(--lx-wind)"], coal: ["Coal steam", "var(--lx-steel)"], cc: ["Gas combined cycle", "var(--lx-cc)"], ct: ["Gas peakers", "var(--lx-pk)"] };
          // the hour's offers as blocks (as wide as their MW, as high as their offer), drawn on LX.Plot: lesson 8's supply
          // stack at a regional scale (LX.SupplyStack's MW ticks are fixed for a town's few hundred MW)
          function stack(h) {
            host.innerHTML = ""; var P1 = LX.Plot(host, { box: true, text: "Text version of the hour's offers" }), x0 = 0, bars = [];
            h.blocks.forEach(function (b) { var used = h.run[b.key]; bars.push({ x0: x0, x1: x0 + used, y0: Math.min(0, b.offer), y1: Math.max(0, b.offer), color: NM[b.key][1] }); if (b.mw > used) bars.push({ x0: x0 + used, x1: x0 + b.mw, y0: Math.min(0, b.offer), y1: Math.max(0, b.offer), color: NM[b.key][1], op: 0.3 }); x0 += b.mw; });
            P1.render({ x: { min: 0, max: 10000, ticks: [[0, "0"], [2500, "2,500"], [5000, "5,000"], [7500, "7,500"], [10000, "10,000 MW"]], ticksN: [[0, "0"], [5000, "5,000"], [10000, "10,000 MW"]] },
              y: { min: -40, max: 60, step: 20, fmt: function (v) { return (v < 0 ? "−$" : "$") + Math.abs(v); }, unit: "$/MWh offered" }, bars: bars,
              marks: [{ x: h.d, y: 55, kind: "ring", vline: true, label: "Demand " + int(h.d) + " MW" }],
              legend: ["ren", "coal", "cc", "ct"].map(function (k) { return { label: NM[k][0], color: NM[k][1] }; }),
              aria: "Offers stacked cheapest first, with demand at " + int(h.d) + " MW; the last offer needed is " + usd(h.offer) + "/MWh.",
              text: { head: ["Offer", "MW available", "MW used", "$/MWh offered"], rows: h.blocks.map(function (b) { return [NM[b.key][0], int(b.mw), int(h.run[b.key]), usd(b.offer)]; }) } });
          }
          D.hours.forEach(function (hh) {
            var bt = H("button", { type: "button", class: "lx-btn ghost small", "aria-pressed": "false", text: hh.label }, row);
            bt.addEventListener("click", function () {
              Array.prototype.forEach.call(row.children, function (x) { x.setAttribute("aria-pressed", x === bt ? "true" : "false"); });
              var h = hour(D, X, hourOf(hh), { solar: ST.solar, ct: ST.ct, design: "eo" });
              stack(h);
              note.textContent = hh.label + " (" + hh.date + ", hour starting " + hh.hour + ":00 standard time): demand " + int(h.d) + " MW, spare " + int(h.spare) + " MW, last offer " + usd(h.offer) + ", price " + usd(h.price) + "/MWh" + (h.adder > 0 ? " with a scarcity adder of " + usd(h.adder) + "." : ".");
              seen[hh.id] = h;
              if (seen.noon && seen.eve) { api.done(); remember("hours", true); api.saw("Midday: wind and sun exceed demand, so a credit-backed offer sets " + usd(seen.noon.price) + ". Evening: only " + int(seen.eve.spare) + " MW spare, so [[scarcity-price|scarcity pricing]] lifts the price to " + usd(seen.eve.price) + "."); }
            });
          });
          H("p", { class: "a3-note", text: G.creditNote }, act);
        } },
      // 2 a year of prices
      { text: "Now all 8,760 hours of a year. Sort the prices from highest to lowest: a few hours are very high, most sit at a coal or gas plant's offer.",
        build: function (act, api) {
          var go = H("button", { type: "button", class: "lx-btn small", html: LX.icon("play") + "Clear the year" }, H("div", { class: "a3-row" }, act)), out = H("div", { "aria-live": "polite" }, act);
          go.addEventListener("click", function () {
            var r = base("eo"), s = duration(r.prices); out.innerHTML = "";
            var k = H("div", { class: "a3-kpis" }, out);
            kpi(k, "Average price", usd(r.avg) + "/MWh"); kpi(k, "Negative-price hours", int(r.neg)); kpi(k, "Scarcity hours", int(r.scarce), "bad"); kpi(k, "Hours short", int(r.short), r.short ? "bad" : "good");
            var P1 = LX.Plot(H("div", null, out), { box: true, text: "Text version of the price duration curve" });
            P1.render({ x: { min: 0, max: T, ticks: [[0, "0"], [2190, "2,190"], [4380, "4,380"], [6570, "6,570"], [8760, "8,760 h"]], ticksN: [[0, "0"], [4380, "4,380"], [8760, "8,760 h"]] },
              y: { min: -50, max: 200, step: 50, fmt: function (v) { return (v < 0 ? "−$" : "$") + Math.abs(v); }, unit: "$/MWh" },
              lines: [{ values: s.map(function (v) { return Math.max(-50, Math.min(200, v)); }), x0: 0.5, color: "var(--lx-accent)", width: 2 }],
              refs: [{ y: 0, label: "Zero", dash: "4 4" }],
              aria: "Prices of the year sorted from highest to lowest; the axis stops at $200, and " + int(s.filter(function (v) { return v > 200; }).length) + " hours lie above it.",
              text: { head: ["Hours", "At or above"], rows: [[int(s.filter(function (v) { return v >= 1000; }).length), "$1,000/MWh"], [int(s.filter(function (v) { return v >= 200; }).length), "$200/MWh"], [int(s.filter(function (v) { return v >= 0; }).length), "$0/MWh"], [int(T), "the lowest, " + usd(s[T - 1])]] } });
            H("p", { class: "a3-note", text: "The axis stops at $200: " + int(s.filter(function (v) { return v > 200; }).length) + " hours lie above it, up to " + usd0(r.top) + "/MWh." }, out);
            api.done(); remember("year", r.avg);
            api.saw(int(r.scarce) + " scarcity hours" + (r.short ? " and " + int(r.short) + " hours short" : "") + " reach up to " + usd0(r.top) + "/MWh, while " + int(r.neg) + " hours go [[negative-price|negative]]. The average, " + usd(r.avg) + ", hides both ends.");
          });
          H("p", { class: "a3-note", html: LX.rich(D.designs.curve.replace("the price is the cap", "the price is the cap ([[offer-cap|offer cap]])")) }, act);
        } },
      // 3 solar grows
      { text: "Add solar: every solar farm sells in the same sunny hours. Watch solar's [[capture-price|capture price]], the average price its output earns.",
        build: function (act, api) {
          var out = H("div", { "aria-live": "polite" }, act), first = base("eo");
          function show(v) {
            var r = get({ solar: v, ct: ST.ct, design: "eo" }); out.innerHTML = "";
            var k = H("div", { class: "a3-kpis" }, out);
            kpi(k, "Solar's capture price", r.solarCapture != null ? usd(r.solarCapture) + "/MWh" : "–"); kpi(k, "Average price", usd(r.avg) + "/MWh"); kpi(k, "Capture ratio", r.solarRatio != null ? pct(r.solarRatio) : "–"); kpi(k, "Negative-price hours", int(r.neg));
            if (v >= 2800 && first.solarCapture != null) { api.done(); remember("solar", v); api.saw(solarText(first, r)); }
          }
          LX.Slider(act, { label: "Solar on the Plains market", min: G.solar.min, max: G.solar.max, step: G.solar.step, value: ST.solar, fmt: function (v) { return int(v) + " MW"; }, onChange: function (v) { show(v); } });
          show(ST.solar);
          H("p", { class: "a3-note", text: "Real: " + D.solarValue.what + " (" + D.solarValue.source.label + ")." }, act);
        } },
      // 4 does a new plant pay
      { text: "In an [[energy-only-market|energy-only market]], plants earn only from selling energy. Does each kind of new plant earn back its building and upkeep costs?",
        build: function (act, api) {
          var out = H("div", null, act);
          var pr = LX.Predict(act, { id: "a3-peaker", fresh: true, q: "Will a new gas peaker cover its costs from energy prices alone?", answer: base("eo").covers.ct >= 0 ? "yes" : "no",
            options: [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }],
            feedback: { yes: "", no: "" },
            onPick: function () {
              var r = base("eo"); out.innerHTML = "";
              table(out, ["New plant", "Earns ($/kW a year)", "Fixed cost ($/kW a year)", "Covers it?"], coverRows(r), "What each new plant earns against its fixed cost, energy-only");
              pr.reveal("With " + int(ST.ct) + " MW of peakers, a new peaker " + coverText("ct", r.covers.ct) + ": it runs mostly in the " + int(r.scarce) + " scarcity hours.");
              api.done(); remember("covers", r.covers);
              api.saw("A peaker lives on a few scarcity hours; wind and solar on many ordinary ones, plus the credit. **A shortfall is [[missing-money|missing money]]: energy-only, rare high prices are the pay for being there.**");
            } });
        } },
      // 5 the resting point
      { text: "If peakers lose money, some retire; if they earn more than their cost, more are built. Move the peaker fleet and find where a new one just pays.",
        build: function (act, api) {
          var out = H("div", { "aria-live": "polite" }, act), moved = false;
          function show(v) {
            ST.ct = v; var r = get({ solar: ST.solar, ct: v, design: "eo" }); out.innerHTML = "";
            var k = H("div", { class: "a3-kpis" }, out);
            kpi(k, "A new peaker", r.covers.ct >= 0 ? "pays, +" + usd0(r.covers.ct) : "loses " + usd0(-r.covers.ct), r.covers.ct >= 0 ? "good" : "bad"); kpi(k, "Scarcity hours", int(r.scarce)); kpi(k, "Hours short", int(r.short), r.short ? "bad" : "good"); kpi(k, "Unserved", int(r.unserved) + " MWh");
            if (moved) {
              var rp = restingPoint(D, X, ST.solar); api.done(); remember("ct", v);
              api.saw(rp.below && rp.above ? "A new peaker pays at " + int(rp.below.ct) + " MW but not at " + int(rp.above.ct) + " MW. At " + int(rp.below.ct) + " MW the year has " + int(rp.below.r.short) + " hours short: **an energy-only market buys reliability through those prices.**"
                : "Across this range a new peaker " + (rp.above ? "never pays" : "always pays") + ": the resting point lies outside it.");
            }
          }
          LX.Slider(act, { label: "Gas peakers on the market", min: G.peakers.min, max: G.peakers.max, step: G.peakers.step, value: ST.ct, fmt: function (v) { return int(v) + " MW"; }, onChange: function (v) { moved = true; show(v); } });
          show(ST.ct);
        } },
      // 6 capacity market
      { text: "A [[capacity-market|capacity market]] adds a second payment: a planner sets how much capacity to buy, energy prices stop at a lower cap, and the capacity price fills a new peaker's gap.",
        build: function (act, api) {
          var seg = H("div", { class: "lx-seg", role: "group", "aria-label": "Market design" }, act), out = H("div", { "aria-live": "polite" }, act), seen = {};
          function show(dz) {
            Array.prototype.forEach.call(seg.children, function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-k") === dz ? "true" : "false"); });
            var r = base(dz), eo = base("eo"), cm = base("cm"); out.innerHTML = "";
            var k = H("div", { class: "a3-kpis" }, out);
            kpi(k, "Consumers pay", usd(r.consumer) + "/MWh"); kpi(k, "Capacity price", dz === "cm" ? mwday(r.capPrice) + "/MW-day" : "none"); kpi(k, "Highest price", usd0(r.top) + "/MWh"); kpi(k, "Hours short", int(r.short), r.short ? "bad" : "good");
            table(out, ["New plant", "Earns ($/kW a year)", "Fixed cost ($/kW a year)", "Covers it?"], coverRows(r), "What each new plant earns against its fixed cost, " + D.designs[dz].label);
            seen[dz] = true;
            if (seen.eo && seen.cm) { api.done(); remember("design", true);
              api.saw("With " + int(ST.ct) + " MW of peakers, consumers pay " + usd(eo.consumer) + "/MWh energy-only and " + usd(cm.consumer) + "/MWh with a capacity market at " + mwday(cm.capPrice) + "/MW-day. **The same fleet, paid in different hours and by different rules.**"); }
          }
          ["eo", "cm"].forEach(function (dz) { var b = H("button", { type: "button", "aria-pressed": "false", "data-k": dz, text: D.designs[dz].label }, seg); b.addEventListener("click", function () { show(dz); }); });
          H("p", { class: "a3-note", text: "Capacity market: energy capped at $" + int(D.designs.cm.cap) + "/MWh (illustrative), the capacity price paid on rated MW. " + D.designs.ratingsNote }, act);
        } },
      // 7 real prices
      { text: "PJM's 2028/29 capacity auction cleared at its cap of $325/MW-day and short of its target. Does that mean blackouts are coming?",
        build: function (act, api) {
          var pr = LX.Predict(act, { id: "a3-pjm", fresh: true, q: "", title: false, answer: "no",
            options: [{ value: "yes", label: "Yes, outages are certain" }, { value: "no", label: "No, reserves are thinner than the target" }],
            feedback: { no: "Yes: the shortfall is measured against PJM's 1-in-10 criterion; it means thinner reserves, not certain outages.", yes: "Not so: the shortfall is measured against PJM's 1-in-10 criterion; it means thinner reserves, not certain outages." },
            onPick: function () { pr.reveal("PJM's 2028/29 auction was 6,831 MW short of its reliability requirement, with a 14.7% reserve margin (PJM release, 14 July 2026)."); api.done(); remember("pjm", true); api.saw("A capacity price is set by a demand curve, a cap and a forecast. **Read it with the rules that made it: lesson [[lesson:a05-adequacy|A5]] shows how the requirement is set.**"); } });
        } },
      // 8 around the world
      { text: "Grids organize this differently. Match each arrangement to where it is used.",
        build: function (act, api) {
          LX.CardSort(act, { bins: D.world.map(function (w) { return { id: w.id, label: w.label }; }),
            cards: D.world.map(function (w) { return { id: "c-" + w.id, text: w.how, bin: w.id, why: w.facts }; }),
            onCheck: function (g) { if (g.placed < g.total) return; api.done(); LX.progress.done(SLUG); remember("world", g.right); api.saw(g.right + " of " + g.total + " matched. Each design answers the same question, who pays to have enough capacity, with different rules; **none is free of trade-offs.**"); } });
        } }
    ];
    var cardsHost = H("div", null, live);
    var cards = LX.StepCards(cardsHost, { id: "a3-steps", steps: steps });
    LX.demo(root, function (state) {
      var m = /^step-(\d+)$/.exec(state), n = state === "mid" ? 2 : m ? +m[1] : 0;
      if (!n) return null;
      cards.go(Math.min(steps.length, n) - 1);
      var bs = cardsHost.querySelectorAll(".lx-step-act .lx-btn, .lx-step-act .lx-seg button");
      if (n === 1) { Array.prototype.forEach.call(bs, function (b) { b.click(); }); }
      else if (n === 2 && bs[0]) bs[0].click();
      else if (n === 4 || n === 7) { var c = cardsHost.querySelector(".lx-step-act .lx-choice"); if (c) c.click(); }
      else if (n === 6) { Array.prototype.forEach.call(bs, function (b) { b.click(); }); }
      return { view: state };
    }, cards);
    root.lxLesson = { model: model, X: X, cache: cache, cards: cards };
    explain(D);
  });

  // ---------------------------------------------------------------- explain layer: comparison table, flowchart, concept map, steelman
  function explain(D) {
    var x = document.getElementById("a3-explain"); if (!x) return;
    x.innerHTML = ""; x.classList.add("is-live");
    var R = D.reference || {};
    var rows = [
      { key: "eo", name: "Energy-only with scarcity pricing", who: "investors, from expected prices", pays: "a few scarcity hours", risk: "spikes for buyers; uncertain revenue for plants", ex: "ERCOT" },
      { key: "cm", name: "Capacity market", who: "a planner's requirement", pays: "energy plus a capacity price", risk: "rules and forecasts set the price; consumers pay for the MW bought", ex: "PJM, MISO, NYISO, ISO-NE" },
      { key: "res", name: "Reserve products", who: "the operator's reserve needs", pays: "prices for spare capacity, hour by hour", risk: "depends on how the demand curves are drawn", ex: "both kinds of market" }
    ];
    LX.CompareTable(H("div", { class: "lx-xcard" }, x), {
      title: "Three ways to pay for enough capacity", text: true,
      columns: [{ key: "name", label: "Design", main: true }, { key: "who", label: "How much capacity: set by" }, { key: "pays", label: "What pays a peaker" }, { key: "risk", label: "Trade-off" }, { key: "ex", label: "Where" }],
      rows: rows, sorts: [{ label: "As listed", order: ["eo", "cm", "res"], note: R.eo ? "Plains market, " + int(R.ct) + " MW of peakers: consumers pay " + usd(R.eo.consumer) + "/MWh energy-only and " + usd(R.cm.consumer) + "/MWh with a capacity market." : "" }]
    });
    LX.Flowchart(H("div", { class: "lx-xcard" }, x), {
      title: "How one hour's price forms", lede: "Trace two hours of the Plains market.",
      nodes: {
        s: { t: "Stack the offers", tN: ["Stack the", "offers"], s: "cheapest first", sN: "cheapest first" },
        m: { t: "Find the last one needed", tN: ["Last one", "needed"], s: "it sets the price", sN: "sets the price" },
        q: { t: "Spare under 600 MW?", tN: ["Spare under", "600 MW?"], k: "q" },
        a: { t: "Add the scarcity adder", tN: ["Add the", "scarcity adder"], s: "up to the cap", sN: "up to the cap" },
        p: { t: "One price for everyone", tN: ["One price for", "everyone"], k: "end" }
      },
      cols: 2, at: { s: [0, 0], m: [0, 1], q: [0, 2], a: [1, 2], p: [1, 3] }, colsN: 2, atN: { s: [0, 0], m: [0, 1], q: [0, 2], a: [1, 2], p: [1, 3] },
      edges: [["s", "m"], ["m", "q"], ["q", "a", "yes"], ["a", "p"], ["q", "p", "no", { v: true }]],
      traces: [{ label: "Spring midday", path: ["s", "m", "q", "p"], text: R.noon ? "Wind and sun set " + usd(R.noon.price) + "." : "Wind and sun set the price." },
               { label: "Summer evening", path: ["s", "m", "q", "a", "p"], text: R.eve ? "Spare " + int(R.eve.spare) + " MW: " + usd(R.eve.price) + "." : "The adder lifts the price." }], sel: 1
    });
    LX.ConceptMap(H("div", { class: "lx-xcard" }, x), {
      title: "Who pays whom", lede: "Tap a node to see its part.",
      groups: { buy: ["Buyers", "var(--lx-demand)"], run: ["Operator and rules", "var(--lx-accent)"], sell: ["Sellers", "var(--lx-cc)"] },
      cols: 3, rows: 2, colsN: 3, rowsN: 2, sel: "op",
      nodes: [
        { id: "cons", g: "buy", label: "Consumers", at: [0, 0], atN: [0, 0], text: "Pay for energy, and in a capacity market for capacity too, through their bills." },
        { id: "op", g: "run", label: "Grid operator", lines: ["Grid", "operator"], at: [1, 0], atN: [1, 0], text: "Runs the hourly market and, where there is one, the capacity auction." },
        { id: "reg", g: "run", label: "Regulators", at: [2, 0], atN: [2, 0], text: "Approve the rules: caps, demand curves, requirements. FERC for most U.S. markets; states for utilities." },
        { id: "gen", g: "sell", label: "Plants", at: [0, 1], atN: [0, 1], text: "Earn energy margins; peakers depend on scarcity hours or a capacity price." },
        { id: "plan", g: "run", label: "Planner", at: [1, 1], atN: [1, 1], text: "Sets how much capacity a capacity market buys, from an adequacy study (A5)." },
        { id: "inv", g: "sell", label: "Investors", at: [2, 1], atN: [2, 1], text: "Build when expected revenue covers cost; both designs try to make that happen." }
      ],
      edges: [["cons", "op", "pay"], ["op", "gen", "pays"], ["reg", "op", "rules"], ["plan", "op", "requirement"], ["inv", "gen", "build"]]
    });
    LX.Steelman(H("div", { class: "lx-xcard" }, x), { title: "Energy-only or capacity market: the strongest case for each",
      sides: [{ key: "eo", title: "For energy-only", points: ["Prices show when and where capacity is short, and reward whatever helps then, including storage and flexible demand.", "No planner has to forecast demand or set a requirement years ahead."] },
              { key: "cm", title: "For a capacity market", points: ["Steadier revenue for plants, so less depends on a few extreme hours and on caps holding.", "The amount of capacity follows a stated reliability standard."] }],
      note: "Which matters more depends on a region's goals, its rules and its risks; this lesson takes no side." });
  }
})();
