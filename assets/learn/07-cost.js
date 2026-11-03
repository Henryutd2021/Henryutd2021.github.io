// 07-cost.js — Lesson 7, "What does electricity cost to make?" (step cards, Analyst tier; W1, 2026-11-02).
//
// Data: assets/learn/data/07-cost.json (the calculator's inputs with sources and dates: EIA AEO2026 cost assumptions in 2025
// dollars, EIA's 2025 capacity factors and gas cost, the 2025 ATB's financial assumptions), assets/learn/data/town.json
// (Prairie Town's fleet; illustrative) and assets/learn/data/town_days.json (real SPP days from EIA-930, as shapes).
//
// Model (closed form; everything in real 2025 dollars, so the discount rate is a real rate):
//   capital recovery factor  CRF(r, n) = r / (1 - (1 + r)^-n), and 1/n when r = 0
//   MWh per kW per year      E = CF x 8760 / 1000
//   LCOE ($/MWh)             = (CRF x capex + FOM) / E + heat rate x gas price + VOM
//                              capex in $/kW, FOM in $/kW-yr, heat rate in MMBtu/MWh, gas in $/MMBtu, VOM in $/MWh
//   (the ATB's form with FCR = CRF, i.e. without taxes, depreciation or credits; no transmission, no degradation)
//   present value            PV = x / (1 + r)^t
//   WACC blend               nominal = d x debt rate + (1 - d) x equity rate;  real = (1 + nominal) / (1 + inflation) - 1
//                            (no tax shield: a teaching simplification, named in Go deeper)
//   NPV per kW at a price p  -capex + sum over t = 1..n of (p x E - FOM - (fuel + VOM) x E) / (1 + r)^t;  NPV = 0 at p = LCOE
//   tornado                  one input at a time, low and high, the others at their defaults; rows sorted by swing
//   "when the energy arrives" one real day, Prairie Town's fleet: each hour, one more MWh saves the running cost of the most
//                            expensive plant still needed (cheapest first, no ramp limits): $0 if wind and sun are spilled,
//                            the combined-cycle plant's $40 or the peaker's $100. A plant's average value per MWh is its
//                            output-weighted average of those hourly savings ("round the clock" = 1 MW every hour).
// Every number the page states is checked against this model by _tests/learn/test_07-cost.js.
(function () {
  "use strict";

  // ---------------------------------------------------------------- pure model (no DOM; exported for Node)
  var HOURS_PER_YEAR = 8760, TECHS = ["wind", "solar", "cc", "peaker"];
  function crf(r, n) { return r === 0 ? 1 / n : r / (1 - Math.pow(1 + r, -n)); }
  function pv(x, r, t) { return x / Math.pow(1 + r, t); }
  function realRate(nominal, inflation) { return (1 + nominal) / (1 + inflation) - 1; }
  function blend(fin, debtShare) {   // shares and rates in %; returns rates in %
    var n = debtShare / 100 * fin.debtRate + (1 - debtShare / 100) * fin.equityRate;
    return { nominal: n, real: realRate(n / 100, fin.inflation / 100) * 100 };
  }
  // the inputs of one plant: the data file's defaults, then any overrides ({capex, fom, vom, heatRate, cf, wacc, life, gas})
  function inputs(D, key, over) {
    var t = D.techs[key], o = over || {};
    var p = { key: key, capex: t.capex, fom: t.fom, vom: t.vom, heatRate: t.heatRate, cf: t.cf, wacc: D.finance.wacc, life: D.finance.life, gas: D.fuel.gas };
    Object.keys(o).forEach(function (k) { if (o[k] != null) p[k] = o[k]; });
    return p;
  }
  function lcoe(p) {
    var E = p.cf / 100 * HOURS_PER_YEAR / 1000, f = crf(p.wacc / 100, p.life);
    var capital = f * p.capex / E, fom = p.fom / E, fuel = p.heatRate * p.gas, vom = p.vom;
    return { capital: capital, fom: fom, fuel: fuel, vom: vom, total: capital + fom + fuel + vom, E: E, crf: f,
             annual: f * p.capex + p.fom, capShare: capital / (capital + fom + fuel + vom) };
  }
  function npv(p, price) {
    var L = lcoe(p), r = p.wacc / 100, net = price * L.E - p.fom - (L.fuel + L.vom) * L.E, s = -p.capex, path = [s];
    for (var t = 1; t <= p.life; t++) { s += pv(net, r, t); path.push(s); }
    return { npv: s, path: path, costs: p.capex + (p.fom + (L.fuel + L.vom) * L.E) / crf(r, p.life), revenue: price * L.E / crf(r, p.life) };
  }
  // one-at-a-time sensitivity of LCOE; ranges from the data file
  function tornado(D, key, base) {
    var b = inputs(D, key, base), t = D.techs[key], rows = [], R = D.tornadoRanges;
    function row(name, label, lo, hi, loText, hiText) {
      var a = lcoe(Object.assign({}, b, (function () { var o = {}; o[name] = lo; return o; })())).total;
      var z = lcoe(Object.assign({}, b, (function () { var o = {}; o[name] = hi; return o; })())).total;
      rows.push({ name: name, label: label, lo: lo, hi: hi, loText: loText, hiText: hiText, atLo: a, atHi: z, min: Math.min(a, z), max: Math.max(a, z), swing: Math.abs(z - a) });
    }
    row("capex", "Building cost", b.capex * (1 + R.capex[0] / 100), b.capex * (1 + R.capex[1] / 100), "−" + Math.abs(R.capex[0]) + "%", "+" + R.capex[1] + "%");
    row("cf", "Capacity factor", t.cfRange[0], t.cfRange[1], t.cfRange[0] + "%", t.cfRange[1] + "%");
    row("wacc", "WACC (real)", D.finance.waccRange[0], D.finance.waccRange[1], D.finance.waccRange[0] + "%", D.finance.waccRange[1] + "%");
    row("life", "Lifetime", D.finance.lifeRange[0], D.finance.lifeRange[1], D.finance.lifeRange[0] + " yr", D.finance.lifeRange[1] + " yr");
    row("fom", "Fixed O&M", b.fom * (1 + R.fom[0] / 100), b.fom * (1 + R.fom[1] / 100), "−" + Math.abs(R.fom[0]) + "%", "+" + R.fom[1] + "%");
    if (t.heatRate > 0) row("gas", "Gas price", D.fuel.gasRange[0], D.fuel.gasRange[1], "$" + D.fuel.gasRange[0].toFixed(2), "$" + D.fuel.gasRange[1].toFixed(2));
    rows.sort(function (x, y) { return y.swing - x.swing; });
    return { base: lcoe(b).total, rows: rows };
  }
  // the "when the energy arrives" day: hourly value of one more MWh, and each plant's average value per MWh
  function arrival(town, days, D, solarMW) {
    var B = D.blindspot, d = days.days[B.day], f = town.fleet, hours = [], spilled = 0;
    var sMW = solarMW == null ? B.solarMW : solarMW;
    for (var t = 0; t < 24; t++) {
      var dem = Math.round(d.demand[t] / 1000 * B.demandPeakMW), w = Math.round(d.wind[t] / 1000 * f.wind.mw), s = Math.round(d.solar[t] / 1000 * sMW);
      var res = dem - f.nuclear.mw - w - s, lam, who;
      if (res <= 0) { lam = 0; who = "spill"; spilled += -res; }
      else if (res <= f.cc.mw) { lam = f.cc.cost; who = "cc"; }
      else if (res <= f.cc.mw + f.peaker.mw) { lam = f.peaker.cost; who = "peaker"; }
      else { lam = NaN; who = "short"; }
      hours.push({ t: t, demand: dem, wind: w, solar: s, residual: res, value: lam, setBy: who });
    }
    function avg(get) { var a = 0, b = 0; hours.forEach(function (h) { var q = get(h); a += q * h.value; b += q; }); return b > 0 ? a / b : 0; }
    return { hours: hours, solarMW: sMW, spilled: spilled, date: d.date,
             value: { solar: avg(function (h) { return h.solar; }), wind: avg(function (h) { return h.wind; }), flat: avg(function () { return 1; }) } };
  }
  var model = { TECHS: TECHS, crf: crf, pv: pv, realRate: realRate, blend: blend, inputs: inputs, lcoe: lcoe, npv: npv, tornado: tornado, arrival: arrival };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H, S = LX.S, LESSON = "07-cost";
  var PARTS = [{ key: "capital", label: "Building the plant", color: "var(--lx-tier-2)" }, { key: "fom", label: "Fixed upkeep", color: "var(--lx-tier-5)" },
               { key: "fuel", label: "Fuel", color: "var(--lx-tier-4)" }, { key: "vom", label: "Upkeep per MWh", color: "var(--lx-ink-3)", words: "upkeep per MWh" }];
  function usd(v, d) { return (v < 0 ? "−\u2060$" : "$") + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: d == null ? 2 : d, maximumFractionDigits: d == null ? 2 : d }); }
  function pct(v, d) { return (v < 0 ? "−" : "") + Math.abs(v).toFixed(d == null ? 1 : d) + "%"; }

  // lesson-local styles (tokens only, so day and night both work); the cost split, tornado and Steelman card are shared components
  function css() {
    if (document.getElementById("lx7-css")) return;
    H("style", { id: "lx7-css", text: [
      ".lx7-detail{font-size:14.5px;color:var(--lx-ink-2)}",
      ".lx7-pv{display:grid;gap:6px}",
      ".lx7-pvrow{display:grid;grid-template-columns:6.2em minmax(0,1fr) 5.5em;gap:10px;align-items:center;font-size:14px}",
      ".lx7-pvrow .lx-split-bar{height:22px}",
      ".lx7-pvrow b{font-family:var(--lx-f-mono);font-weight:600;text-align:right}",
      ".lx7-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px}",
      ".lx7-tile{border:1px solid var(--lx-line);border-radius:10px;padding:8px 12px;background:var(--lx-surface-2);display:grid;gap:2px}",
      ".lx7-tile span{font-size:12.5px;color:var(--lx-ink-3)}",
      ".lx7-tile b{font-family:var(--lx-f-mono);font-size:18px;font-weight:600;color:var(--lx-ink)}",
      ".lx7-tile small{font-size:12.5px;color:var(--lx-ink-2)}",
      ".lx7-big{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}",
      ".lx7-big b{font-family:var(--lx-f-mono);font-size:30px;font-weight:600;color:var(--lx-ink)}",
      ".lx7-big span{font-size:14px;color:var(--lx-ink-3)}",
      ".lx7-chart{position:relative}.lx7-chart svg{display:block;width:100%;height:auto}",
      ".lx7-chart text{font-family:var(--lx-f-mono);font-size:11px;fill:var(--lx-ink-3)}",
      ".lx7-chart text.lab{font-family:var(--lx-f-body);font-size:12px;fill:var(--lx-ink-2)}",
      ".lx7-tabs{display:flex;flex-wrap:wrap;gap:8px;align-items:center}",
      "@media (max-width:560px){.lx7-pvrow{grid-template-columns:4.6em minmax(0,1fr) 4.8em}.lx7-big b{font-size:26px}}"
    ].join("\n") }, document.head);
  }

  function seg(host, label, opts, cur, on) {
    var g = H("div", { class: "lx-seg", role: "group", "aria-label": label }, host), bs = {};
    opts.forEach(function (op) {
      bs[op[0]] = H("button", { type: "button", "aria-pressed": op[0] === cur ? "true" : "false", text: op[1], onclick: function () {
        Object.keys(bs).forEach(function (k) { bs[k].setAttribute("aria-pressed", k === op[0] ? "true" : "false"); }); on(op[0]); } }, g);
    });
    return g;
  }
  function textAlt(host, title) { var d = H("details", { class: "lx-textalt" }, host); H("summary", { text: title || "Text version" }, d); var b = H("div", null, d); return b; }
  function splitText(L) { return LX.CostSplit.text(PARTS, L, usd); }
  function splitRow(k, L, T) { return { key: k, label: T[k].short, color: T[k].color, values: L, total: L.total, aria: T[k].label + ": " + usd(L.total) + " per MWh; " + splitText(L) }; }

  function view(live, data, root) {
    css();
    var D = data["07_cost"], town = data.town, days = data.town_days, T = D.techs, fin = D.finance;
    var base = {}; model.TECHS.forEach(function (k) { base[k] = lcoe(inputs(D, k)); });
    var S_ = { calc: { tech: "wind" }, over: {}, torn: "wind" };
    model.TECHS.forEach(function (k) { S_.over[k] = {}; });

    var steps = [
      // 1 predict: capital share
      { text: "Building a plant costs money once; running it costs money every year. Over a whole life, which spends the larger share of its cost on building the plant?",
        build: function (act, api) {
          var p = LX.Predict(act, { id: "c7-share", q: "", title: false, answer: "wind", fresh: true,
            options: [{ value: "wind", label: "The wind farm", color: T.wind.color }, { value: "cc", label: "The gas combined-cycle plant", color: T.cc.color }, { value: "same", label: "About the same" }],
            feedback: { wind: "The wind farm. Its fuel is free, so nearly all its cost is the plant itself.", cc: "The gas plant buys fuel every hour it runs, so fuel is its biggest cost.", same: "They differ a lot, because one of them buys fuel every hour." },
            onPick: function () {
              p.reveal("Building the plant is " + pct(base.wind.capShare * 100, 0) + " of the wind farm's cost per MWh, but only " + pct(base.cc.capShare * 100, 0) + " of the gas plant's.");
              api.done();
            } });
        } },
      // 2 the four-part split
      { text: "Every MWh carries four costs: building the plant, fixed upkeep, fuel, and upkeep that grows with output. Tap each plant to see how its cost per MWh splits, at U.S. averages.",
        build: function (act, api) {
          var seen = {}, det;
          var split = LX.CostSplit(act, { parts: PARTS, key: false, fmt: function (v) { return usd(v, 0); },
            rows: model.TECHS.map(function (k) { return splitRow(k, base[k], T); }),
            onPick: function (k) {
              var L = base[k];
              seen[k] = 1;
              det.innerHTML = LX.rich("**" + T[k].label + "**: " + usd(L.total) + "/MWh at a " + pct(T[k].cf) + " [[capacity-factor|capacity factor]]: " + splitText(L) + ".").replace(/\*\*(.+?)\*\*/, "<b>$1</b>");
              if (Object.keys(seen).length >= 3) {
                api.done();
                api.saw("Wind and solar are almost all building cost; the combined-cycle plant is mostly fuel. The peaker runs only " + pct(T.peaker.cf) + " of the year, so each of its MWh carries " + usd(base.peaker.capital) + " of building cost.");
              }
            } });
          det = H("p", { class: "lx7-detail", "aria-live": "polite" }, act);
          split.key(act);
          var alt = textAlt(act);
          var ul = H("ul", null, alt);
          model.TECHS.forEach(function (k) { H("li", { text: T[k].label + ": " + usd(base[k].total) + " per MWh (" + splitText(base[k]) + ")." }, ul); });
        } },
      // 3 discounting
      { text: "A dollar later is worth less than a dollar now: today's dollar could earn a return meanwhile. Slide the [[discount-rate|discount rate]] and see what $100 paid in 10, 20 or 30 years is worth today.",
        build: function (act, api) {
          var Dd = D.discount, rows = H("div", { class: "lx7-pv" }, act);
          var sl = LX.Slider(act, { label: "Discount rate", color: "var(--lx-tier-2)", min: 0, max: Dd.rateMax, step: 0.5, value: Dd.rate, fmt: function (v) { return v.toFixed(1) + "% a year"; }, onChange: function () { draw(true); } });
          var alt = textAlt(act);
          function draw(user) {
            var r = sl.val() / 100; rows.innerHTML = ""; alt.innerHTML = "";
            var ul = H("ul", null, alt);
            Dd.years.forEach(function (y) {
              var v = pv(Dd.amount, r, y), rw = H("div", { class: "lx7-pvrow" }, rows);
              H("span", { text: y === 0 ? "Today" : "In " + y + " years" }, rw);
              LX.CostSplit.bar(rw, [{ color: "var(--lx-tier-2)", value: v }], 100);
              H("b", { text: usd(v) }, rw);
              H("li", { text: "$100 " + (y === 0 ? "today" : "in " + y + " years") + " is worth " + usd(v) + " today at " + sl.val().toFixed(1) + "%." }, ul);
            });
            if (user) {
              api.done();
              api.saw("At " + sl.val().toFixed(1) + "%, $100 in 30 years is worth " + usd(pv(Dd.amount, r, 30)) + " today. Long-lived plants feel the rate most, because most of their output lies far ahead.");
            }
          }
          draw(false);
        } },
      // 4 WACC
      { text: "Where does the rate come from? A plant is paid for with loans and with owners' money, and owners take more risk, so they want more. The blend is the [[wacc|WACC]]. Slide the loan share.",
        build: function (act, api) {
          var tiles = H("div", { class: "lx7-grid" }, act), mix = LX.CostSplit.bar(act, [], 100, { height: 14 });
          var sl = LX.Slider(act, { label: "Share paid with loans", color: "var(--lx-tier-5)", min: 0, max: 80, step: 5, value: fin.debtShare, fmt: function (v) { return v + "%"; },
            hint: function () { return "Loans at " + fin.debtRate + "%, owners at " + fin.equityRate + "% (illustrative); inflation " + fin.inflation + "%."; }, onChange: draw });
          var tW = tile("Blend (WACC)"), tR = tile("After inflation (real)"), tWi = tile("Wind LCOE"), tC = tile("Gas CC LCOE");
          function tile(l) { var t = H("div", { class: "lx7-tile", "aria-live": "polite" }, tiles); H("span", { text: l }, t); return { b: H("b", null, t), s: H("small", null, t) }; }
          var allEq = blend(fin, 0), wEq = lcoe(inputs(D, "wind", { wacc: allEq.real })).total, cEq = lcoe(inputs(D, "cc", { wacc: allEq.real })).total;
          function draw(user) {
            var b = blend(fin, sl.val()), w = lcoe(inputs(D, "wind", { wacc: b.real })).total, c = lcoe(inputs(D, "cc", { wacc: b.real })).total;
            LX.CostSplit.fill(mix, [{ color: "var(--lx-tier-5)", value: sl.val() }, { color: "var(--lx-tier-3)", value: 100 - sl.val() }], 100);
            tW.b.textContent = pct(b.nominal, 2); tW.s.textContent = sl.val() + "% loans, " + (100 - sl.val()) + "% owners";
            tR.b.textContent = pct(b.real, 2); tR.s.textContent = "the rate LCOE uses here";
            tWi.b.textContent = usd(w); tWi.s.textContent = "all owners' money: " + usd(wEq);
            tC.b.textContent = usd(c); tC.s.textContent = "all owners' money: " + usd(cEq);
            if (user !== false) {
              api.done();
              api.saw("Going from all owners' money to " + sl.val() + "% loans changes wind's LCOE by " + pct((w / wEq - 1) * 100) + " but the gas plant's by only " + pct((c / cEq - 1) * 100) + ": wind's cost is mostly capital.");
            }
          }
          draw(false);
        } },
      // 5 find the price that pays back
      { text: "LCOE is the steady price per MWh that pays back everything over the plant's life, once money is discounted. Move the price until the wind farm's discounted cash ends at zero.",
        build: function (act, api) {
          var p = inputs(D, "wind"), L = lcoe(p), chart = H("div", { class: "lx7-chart" }, act), tiles = H("div", { class: "lx7-grid" }, act);
          var tC = tile("Discounted costs, per kW"), tR = tile("Discounted sales, per kW"), tN = tile("Left at year " + p.life);
          function tile(l) { var t = H("div", { class: "lx7-tile", "aria-live": "polite" }, tiles); H("span", { text: l }, t); return H("b", null, t); }
          var sl = LX.Slider(act, { label: "Price the wind farm is paid", color: T.wind.color, min: 20, max: 80, step: 0.5, value: 30, fmt: function (v) { return "$" + v.toFixed(2) + "/MWh"; }, onChange: function () { draw(true); } });
          var alt = textAlt(act), svg = null;
          function draw(user) {
            var price = sl.val(), N = npv(p, price), W = Math.max(280, chart.clientWidth || 600), Hh = W < 480 ? 180 : 210, m = { l: 62, r: 10, t: 12, b: 24 };
            var lo = -Math.ceil(p.capex / 500) * 500, hi = 1000, iw = W - m.l - m.r, ih = Hh - m.t - m.b;
            var x = function (t) { return m.l + t / p.life * iw; }, y = function (v) { return m.t + (hi - v) / (hi - lo) * ih; };
            if (svg) svg.remove();
            svg = S("svg", { viewBox: "0 0 " + W + " " + Hh, width: W, height: Hh, role: "img", "aria-label": "Cumulative discounted cash of the wind farm per kW over " + p.life + " years at " + usd(price) + "/MWh: it ends at " + usd(N.npv, 0) + "." }, chart);
            [-2000, -1500, -1000, -500, 0, 500, 1000].filter(function (v) { return v >= lo && v <= hi; }).forEach(function (v) {
              S("path", { d: "M" + m.l + " " + y(v) + "H" + (W - m.r), stroke: v === 0 ? "var(--lx-ink-3)" : "var(--lx-line)", "stroke-width": v === 0 ? 1.5 : 1 }, svg);
              S("text", { x: m.l - 6, y: y(v) + 4, "text-anchor": "end" }, svg).textContent = usd(v, 0);
            });
            [0, 10, 20, 30].forEach(function (t) { S("text", { x: x(t), y: Hh - 6, "text-anchor": t === 0 ? "start" : t === 30 ? "end" : "middle" }, svg).textContent = "year " + t; });
            var d = N.path.map(function (v, t) { return (t ? "L" : "M") + x(t).toFixed(1) + " " + y(Math.max(lo, Math.min(hi, v))).toFixed(1); }).join(" ");
            S("path", { d: d, fill: "none", stroke: T.wind.color, "stroke-width": 2.5 }, svg);
            var end = N.path[N.path.length - 1];
            S("circle", { cx: x(p.life), cy: y(Math.max(lo, Math.min(hi, end))), r: 5, fill: Math.abs(end) < 10 ? "var(--lx-good)" : "var(--lx-ink)" }, svg);
            tC.textContent = usd(N.costs, 0); tR.textContent = usd(N.revenue, 0); tN.textContent = usd(end, 0);
            alt.innerHTML = ""; H("p", { text: "At " + usd(price) + "/MWh the wind farm's discounted sales are " + usd(N.revenue, 0) + " per kW against discounted costs of " + usd(N.costs, 0) + "; after " + p.life + " years it is left with " + usd(end, 0) + " per kW. It ends at zero at " + usd(L.total) + "/MWh, its LCOE." }, alt);
            if (user && Math.abs(price - L.total) <= 0.5) {
              api.done();
              api.saw("Close to zero: the wind farm's LCOE is " + usd(L.total) + "/MWh at " + fin.wacc + "% over " + fin.life + " years. Any lower and it never pays back; any higher and it earns more than its cost of money.");
            } else if (user) api.saw(end < 0 ? "Still short by " + usd(-end, 0) + " per kW after " + p.life + " years: raise the price." : "It earns " + usd(end, 0) + " per kW more than it needs: lower the price.", true);
          }
          draw(false);
          if (window.ResizeObserver) new ResizeObserver(function () { if (LX.visible(chart)) draw(false); }).observe(chart);
        } },
      // 6 the calculator
      { text: "Now the full calculator. Pick a plant, then change its building cost, capacity factor, rate or gas price. Defaults are U.S. averages in 2025 dollars, from EIA and the ATB.",
        build: function (act, api) { calculator(act, api); } },
      // 7 tornado
      { text: "Which input moves the LCOE most? Guess first. Then each bar swings one input from low to high while the others stay at their defaults: a [[tornado-chart|tornado chart]].",
        build: function (act, api) {
          var box = H("div", null, act), out = H("div", { hidden: true, style: "display:grid;gap:10px" }, act);
          var p = LX.Predict(box, { id: "c7-torn", q: "For the wind farm, which input moves the LCOE most?", answer: "cf", fresh: true,
            options: [{ value: "capex", label: "Building cost" }, { value: "cf", label: "Capacity factor" }, { value: "wacc", label: "WACC" }, { value: "fom", label: "Fixed O&M" }],
            feedback: { cf: "The capacity factor: every cost is divided by the MWh the wind actually gives.", capex: "Building cost matters, but the capacity factor's range moves LCOE further.",
                        wacc: "The rate matters a lot, yet the capacity factor's range moves LCOE further.", fom: "Fixed upkeep is a small slice of wind's cost." },
            onPick: function () {
              var tw = tornado(D, "wind");
              p.reveal("Over the ranges used here, the capacity factor moves wind's LCOE from " + usd(tw.rows[0].min) + " to " + usd(tw.rows[0].max) + ".");
              out.hidden = false; drawT(); api.done();
              api.saw("A tornado ranks inputs over the ranges you choose: change the ranges and the order can change. Try the gas plant: its fuel price leads.");
            } });
          var tabs = H("div", { class: "lx7-tabs" }, out);
          seg(tabs, "Plant", model.TECHS.map(function (k) { return [k, T[k].short]; }), "wind", function (k) { S_.torn = k; drawT(); });
          var tc = LX.Tornado(out, { fmt: function (v) { return usd(v, 0); }, fmtAlt: function (v) { return usd(v); }, measure: "LCOE" });
          function drawT() {
            var k = S_.torn, tw = tornado(D, k);
            tc.draw({ base: tw.base, rows: tw.rows, lede: "**" + T[k].label + "**: " + usd(tw.base) + "/MWh at the defaults (black line).",
                      note: T[k].cfNote + " " + D.tornadoRanges.note + (T[k].heatRate ? " " + D.fuel.gasNote : "") });
          }
        } },
      // 8 when the energy arrives
      { text: "LCOE prices every MWh the same, whatever the hour. On Prairie Town's hottest day, one more MWh saves $0, $40 or $100, depending on the hour. Grow the solar farm and watch what its MWh are worth.",
        build: function (act, api) { arrivalStep(act, api); } }
    ];

    // ---- step 6: the calculator
    function calculator(act, api) {
      var c = S_.calc, top = H("div", { class: "lx7-tabs" }, act), sliders = H("div", { style: "display:grid;gap:12px" }, act);
      seg(top, "Plant", model.TECHS.map(function (k) { return [k, T[k].short]; }), c.tech, function (k) { c.tech = k; build(); });
      var big = H("div", { class: "lx7-big", "aria-live": "polite" }, act), sb = LX.CostSplit(act, { parts: PARTS, fmt: function (v) { return usd(v, 0); } });
      var foot = H("p", { class: "lx-hint" }, act), reset = H("button", { class: "lx-link", type: "button", text: "Back to the defaults" }, act);
      var alt = textAlt(act), sl = {};
      reset.addEventListener("click", function () { S_.over[c.tech] = {}; build(); });
      function cur() { return inputs(D, c.tech, S_.over[c.tech]); }
      function build() {
        sliders.innerHTML = ""; var k = c.tech, t = T[k], p = cur();
        // EIA's default can sit between two steps of a slider (a capacity factor of 33.8% on a 0.5% grid): it is shown as it
        // is until the reader moves the slider; LX.Slider itself keeps values on its grid
        function add(name, o) {
          var v0 = p[name], moved = false, f = o.fmt;
          sl[name] = LX.Slider(sliders, Object.assign({ color: t.color, value: v0, onChange: function (v) { moved = true; S_.over[k][name] = v; draw(true); } }, o,
            { fmt: function (v) { return f(!moved && Math.abs(v - v0) < o.step / 2 ? v0 : v); } }));
        }
        add("capex", { label: "Building cost", min: Math.round(t.capex * 0.5 / 10) * 10, max: Math.round(t.capex * 1.5 / 10) * 10, step: 10, fmt: function (v) { return usd(v, 0) + "/kW"; },
          hint: function () { return "Default " + usd(t.capex, 0) + "/kW: EIA's AEO2026 overnight cost."; } });
        add("cf", { label: "Capacity factor", min: 5, max: 95, step: 0.5, fmt: function (v) { return pct(v); }, hint: function () { return t.cfNote; } });
        add("wacc", { label: "WACC (real)", min: 0, max: 12, step: 0.5, fmt: function (v) { return pct(v); }, hint: function () { return fin.waccNote; } });
        if (t.heatRate > 0) add("gas", { label: "Gas price", min: 1.5, max: 12, step: 0.05, fmt: function (v) { return "$" + v.toFixed(2) + "/MMBtu"; }, hint: function () { return D.fuel.gasNote; } });
        draw(false);
      }
      function draw(user) {
        var k = c.tech, p = cur(), L = lcoe(p), t = T[k];
        big.innerHTML = ""; H("b", { text: usd(L.total) }, big); H("span", { text: "per MWh · " + t.label }, big);
        sb.set([splitRow(k, L, T)], Math.max(L.total, 120));
        foot.textContent = "Capital recovery factor " + L.crf.toFixed(4) + " · " + L.E.toFixed(3) + " MWh per kW per year · " + fin.life + "-year life. No taxes, credits or grid costs.";
        alt.innerHTML = ""; H("p", { text: t.label + ": LCOE " + usd(L.total) + " per MWh = " + splitText(L) + "." }, alt);
        LX.store.set("c7-calc", { tech: k, inputs: p, L: L });
        if (user) { api.done(); api.saw(t.short + " at your inputs: " + usd(L.total) + "/MWh, of which " + pct(L.capShare * 100, 0) + " is building the plant."); }
      }
      build();
    }

    // ---- step 8: when the energy arrives
    function arrivalStep(act, api) {
      var B = D.blindspot, chart = H("div", { class: "lx7-chart" }, act), tiles = H("div", { class: "lx7-grid" }, act);
      function tile(l, col) { var t = H("div", { class: "lx7-tile", "aria-live": "polite", style: "border-left:4px solid " + col }, tiles); H("span", { text: l }, t); return { b: H("b", null, t), s: H("small", null, t) }; }
      var tS = tile("A solar MWh saves", T.solar.color), tW = tile("A wind MWh saves", T.wind.color), tF = tile("A round-the-clock MWh saves", "var(--lx-ink-3)");
      var sl = LX.Slider(act, { label: "Solar farm size", color: T.solar.color, min: B.solarMW, max: B.solarMax, step: B.solarStep, value: B.solarMW, fmt: function (v) { return v + " MW"; },
        hint: function (lo, hi, max, v) { return v === B.solarMW ? "Prairie Town's solar farm today." : "Its LCOE stays the same at every size: same panels, same sun."; }, onChange: function () { draw(true); } });
      var legend = H("div", { class: "lx-legend", "aria-hidden": "true" }, act);
      [["Solar output", T.solar.color], ["Wind output", T.wind.color], ["Saves $40 (combined-cycle last)", "var(--lx-cc)"], ["Saves $100 (peaker last)", "var(--lx-pk)"], ["Saves $0 (sun or wind spilled)", "var(--lx-line-2)"]]
        .forEach(function (l) { var s = H("span", null, legend); H("i", { style: "--c:" + l[1] }, s); H("span", { text: l[0] }, s); });
      var alt = textAlt(act), svg = null;
      function draw(user) {
        var A = arrival(town, days, D, sl.val()), W = Math.max(280, chart.clientWidth || 600), Hh = W < 480 ? 230 : 250, m = { l: 40, r: 8, t: 14, b: 22 };
        var gap = 30, h1 = (Hh - m.t - m.b - gap) * 0.52, h2 = Hh - m.t - m.b - gap - h1, iw = W - m.l - m.r, bw = iw / 24;
        var yMW = function (v) { return m.t + h1 - v / 500 * h1; }, top2 = m.t + h1 + gap, yV = function (v) { return top2 + h2 - v / 100 * h2; };
        if (svg) svg.remove();
        svg = S("svg", { viewBox: "0 0 " + W + " " + Hh, width: W, height: Hh, role: "img", "aria-label": "Top: hourly solar and wind output on " + B.dateLabel + ". Bottom: what one more MWh saves each hour, $0, $40 or $100." }, chart);
        [0, 250, 500].forEach(function (v) { S("path", { d: "M" + m.l + " " + yMW(v) + "H" + (W - m.r), stroke: "var(--lx-line)" }, svg); S("text", { x: m.l - 6, y: yMW(v) + 4, "text-anchor": "end" }, svg).textContent = v; });
        S("text", { x: m.l, y: m.t - 3, class: "lab" }, svg).textContent = "Output, MW";
        [0, 40, 100].forEach(function (v) { S("path", { d: "M" + m.l + " " + yV(v) + "H" + (W - m.r), stroke: "var(--lx-line)" }, svg); S("text", { x: m.l - 6, y: yV(v) + 4, "text-anchor": "end" }, svg).textContent = "$" + v; });
        S("text", { x: m.l, y: top2 - 10, class: "lab" }, svg).textContent = "What one more MWh saves, $/MWh";
        var ds = "", dw = "";
        A.hours.forEach(function (h, t) {
          var x0 = m.l + t * bw;
          ds += (t ? "L" : "M") + (x0 + bw / 2).toFixed(1) + " " + yMW(h.solar).toFixed(1);
          dw += (t ? "L" : "M") + (x0 + bw / 2).toFixed(1) + " " + yMW(h.wind).toFixed(1);
          var col = h.setBy === "cc" ? "var(--lx-cc)" : h.setBy === "peaker" ? "var(--lx-pk)" : "var(--lx-line-2)";
          S("rect", { x: x0 + 1, y: h.value > 0 ? yV(h.value) : yV(0) - 3, width: Math.max(1, bw - 2), height: h.value > 0 ? yV(0) - yV(h.value) : 3, fill: col, rx: 1 }, svg);
        });
        S("path", { d: ds + "L" + (m.l + 23.5 * bw).toFixed(1) + " " + yMW(0) + "L" + (m.l + bw / 2).toFixed(1) + " " + yMW(0) + "Z", fill: T.solar.color, "fill-opacity": 0.25, stroke: "none" }, svg);
        S("path", { d: ds, fill: "none", stroke: T.solar.color, "stroke-width": 2.2 }, svg);
        S("path", { d: dw, fill: "none", stroke: T.wind.color, "stroke-width": 2.2 }, svg);
        [0, 6, 12, 18, 24].forEach(function (h) { S("text", { x: m.l + h * bw, y: Hh - 5, "text-anchor": h === 0 ? "start" : h === 24 ? "end" : "middle" }, svg).textContent = (h < 10 ? "0" : "") + h + ":00"; });
        tS.b.textContent = usd(A.value.solar); tS.s.textContent = "average per MWh it makes";
        tW.b.textContent = usd(A.value.wind); tW.s.textContent = "the town's 150 MW wind farm";
        tF.b.textContent = usd(A.value.flat); tF.s.textContent = "1 MW in every hour";
        alt.innerHTML = "";
        var tb = H("table", { class: "lx-mini-table" }, H("div", { class: "lx-scroll-x" }, alt)), hr = H("tr", null, H("thead", null, tb));
        ["Hour", "Demand", "Wind", "Solar", "One more MWh saves"].forEach(function (x) { H("th", { scope: "col", text: x }, hr); });
        var body = H("tbody", null, tb);
        A.hours.forEach(function (h) { var r = H("tr", null, body); [LX.fmt.hh(h.t), h.demand, h.wind, h.solar, "$" + h.value].forEach(function (x) { H("td", { text: x }, r); }); });
        LX.store.set("c7-arrival", { solarMW: A.solarMW, solar: A.value.solar, wind: A.value.wind, flat: A.value.flat });
        if (user && A.solarMW >= 400) {
          api.done();
          api.saw("At " + A.solarMW + " MW, a solar MWh saves only " + usd(A.value.solar) + " on average, against " + usd(arrival(town, days, D).value.solar) + " at 200 MW: the new sun arrives in hours already full of sun. Its LCOE never changed.");
        } else if (user) api.saw("A bigger solar farm: keep going to 400 MW or more.", true);
      }
      draw(false);
      if (window.ResizeObserver) new ResizeObserver(function () { if (LX.visible(chart)) draw(false); }).observe(chart);
      H("a", { class: "lx-btn small", style: "justify-self:start", href: "#explain", html: "See it all as diagrams" + LX.icon("arrow") }, act);
    }

    var cards = LX.StepCards(live, { steps: steps, onStep: function (i) { if (i === steps.length - 1) LX.progress.done(LESSON); } });
    // demo states (core.js LX.demo): "step-N" (or the address #lx-step-N) opens step N with its action done; "mid" = step 3
    LX.demo(root, function (state) {
      var n = state === "mid" ? 3 : +((/^step-(\d+)$/.exec(state) || [])[1] || 0); if (!n) return null;
      demo(Math.min(steps.length, n) - 1); return { view: "step " + n };
    }, cards);
    function demo(i) {
      cards.go(i);
      var card = cards.el;
      if (i === 0) { var b = card.querySelector(".lx-choice"); if (b) b.click(); }
      if (i === 1) card.querySelectorAll(".lx-split-row").forEach(function (b, j) { if (j < 3) b.click(); });
      if (i === 6) { var c = card.querySelectorAll(".lx-choice")[1]; if (c) c.click(); }
      if (i === 7) { var pl = card.querySelectorAll(".lx-ctl-row button")[1]; for (var k = 0; k < 4; k++) pl.click(); }
      if (i >= 2 && i <= 5) { var pls = card.querySelector(".lx-ctl-row button:last-child"); if (pls) for (var q = 0; q < (i === 4 ? 30 : 2); q++) pls.click(); }
    }
    root.lxLesson = { model: model, data: D, demo: demo, cards: cards };
    buildExplain(D, town, days, base);
  }

  // ---------------------------------------------------------------- the explain layer
  function buildExplain(D, town, days, base) {
    var host = document.getElementById("cost-explain"); if (!host) return;
    host.innerHTML = ""; host.classList.add("is-live");
    var T = D.techs, fin = D.finance;
    // 1 the equation, symbol by symbol, with the wind farm's (or the reader's) numbers (LX.EquationCard, components/equation.js)
    var saved = LX.store.get("c7-calc", null), k = saved && T[saved.tech] ? saved.tech : "wind";
    var p = saved && T[saved.tech] ? saved.inputs : inputs(D, k), L = lcoe(p);
    var sy = function (name, words, here) { return { sym: LX.esc(name), name: name, words: words, you: here }; };
    LX.EquationCard(H("div", { class: "lx-xcard" }, host), {
      title: "The LCOE equation, symbol by symbol",
      lede: "Tap a symbol. The numbers are " + (saved ? "your last calculator settings for the " + T[k].label.toLowerCase() : "the onshore wind farm's defaults") + ".",
      label: "LCOE equation",
      rows: [{ parts: [{ k: "lcoe" }, "=", { frac: [[{ k: "crf" }, "×", { k: "capex" }, "+", { k: "fom" }], [{ k: "cf" }]] }, "+", { k: "fuel" }, "+", { k: "vom" }] }],
      symbols: {
        lcoe: sy("LCOE", "Levelized cost of electricity: the steady price per MWh that repays every cost over the plant's life.", usd(L.total) + "/MWh"),
        crf: sy("CRF", "Capital recovery factor: the share of the building cost to repay each year, with interest, so it is paid off over the life.", L.crf.toFixed(4) + " (at " + pct(p.wacc) + " over " + p.life + " years)"),
        capex: sy("C", "Building (overnight) cost per kW of capacity.", usd(p.capex, 0) + "/kW"),
        fom: sy("FOM", "Fixed upkeep per kW per year, paid whether the plant runs or not.", usd(p.fom) + "/kW-yr"),
        cf: sy("CF × 8.76", "MWh each kW makes in a year: the capacity factor times 8,760 hours, divided by 1,000.", L.E.toFixed(3) + " MWh per kW-yr"),
        fuel: sy("fuel", "Fuel per MWh: the heat rate (MMBtu per MWh) times the gas price.", usd(L.fuel) + "/MWh"),
        vom: sy("VOM", "Upkeep that grows with output, per MWh.", usd(L.vom) + "/MWh")
      },
      fields: [{ key: "you", label: null, alt: "Here" }],
      sel: "crf",
      hint: "CRF = r ÷ (1 − (1 + r)^−n), with r the real WACC and n the life in years; when r = 0 it is simply 1 ÷ n."
    });

    // 2 the four plants compared
    var c2 = H("div", { class: "lx-xcard" }, host), c3 = H("div", { class: "lx-xcard" }, host);
    LX.CompareTable(c2, {
      title: "The four plants at U.S. averages",
      columns: [{ key: "name", label: "Plant", main: true }, { key: "capex", label: "Building cost", num: true, phoneHide: true },
                { key: "cf", label: "Capacity factor", num: true, phoneHide: true }, { key: "lcoe", label: "LCOE, $/MWh", phone: "LCOE", num: true, bar: { max: 110 } },
                { key: "share", label: "Share: building", phone: "Building", num: true }],
      rows: model.TECHS.map(function (kk) {
        var Lk = base[kk];
        return { key: kk, color: T[kk].color, name: T[kk].label, note: T[kk].heatRate ? "gas at $" + D.fuel.gas.toFixed(2) + "/MMBtu" : "no fuel bill",
                 capex: usd(T[kk].capex, 0) + "/kW", cf: pct(T[kk].cf), lcoe: { text: usd(Lk.total), value: Lk.total }, share: { text: pct(Lk.capShare * 100, 0), value: Lk.capShare } };
      }),
      sorts: [{ label: "By LCOE", order: model.TECHS.slice().sort(function (a, b) { return base[a].total - base[b].total; }), ranked: true, note: "Cheapest per MWh first, at " + fin.wacc + "% real over " + fin.life + " years. The ranking says nothing about when each MWh arrives." },
              { label: "By building share", order: model.TECHS.slice().sort(function (a, b) { return base[b].capShare - base[a].capShare; }), ranked: true, note: "The higher the building share, the more the rate and the capacity factor matter." }]
    });
    // 3 cause and effect: a higher rate hits capital-heavy plants harder
    var hi = 7, Lw = lcoe(inputs(D, "wind", { wacc: hi })), Lc = lcoe(inputs(D, "cc", { wacc: hi }));
    LX.CausalChain(c3, {
      title: "Why a higher rate hits wind harder",
      links: [{ title: "Money costs more", text: "The real WACC rises.", value: pct(fin.wacc) + " → " + pct(hi) },
              { title: "Yearly repayment grows", text: "The capital recovery factor rises.", value: base.wind.crf.toFixed(4) + " → " + Lw.crf.toFixed(4) },
              { title: "Wind's LCOE jumps", text: "Its cost is mostly the plant.", value: usd(base.wind.total) + " → " + usd(Lw.total) },
              { title: "Gas moves less", text: "Its cost is mostly fuel.", value: usd(base.cc.total) + " → " + usd(Lc.total) }],
      note: "Wind's LCOE rises " + pct((Lw.total / base.wind.total - 1) * 100) + ", the combined-cycle plant's " + pct((Lc.total / base.cc.total - 1) * 100) + ". Financing conditions can change which plant looks cheapest."
    });
    // 4 steelman: is LCOE a fair yardstick?
    LX.Steelman(H("div", { class: "lx-xcard" }, host), {
      title: "Is LCOE a fair yardstick? The strongest case on each side",
      sides: [{ key: "for", title: "For: a common, checkable yardstick", points: ["One number per plant, built from public inputs anyone can audit.", "Comparable across studies when the basis (dollars, rate, life) is stated.", "A good first screen of what a plant costs to make power."] },
              { key: "against", title: "Against: it misses what the grid buys", points: ["It ignores when and where the MWh arrive, and how firm they are.", "It leaves out grid, balancing and backup costs that a plant imposes on others.", "EIA warns that direct LCOE comparisons across technologies are misleading, and pairs LCOE with a value measure."] }],
      note: "Both are true at once: LCOE answers \"what does a MWh cost to make?\", not \"what is a MWh worth?\". Lesson 8 asks what it is worth, hour by hour."
    });
  }

  LX.mount("cost", function (live, data, root) { view(live, data, root); });
})();
