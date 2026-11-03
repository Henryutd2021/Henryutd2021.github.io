// a01-project-tea.js — Analyst lesson A1, "Is this project worth building? Cash flows, discounting and the cost of capital"
// (step cards, Learn W3, 2026-11-03).
//
// Data (read through data-src):
//   assets/learn/data/07-cost.json        lesson 7's wind farm and finance, so every input agrees with lessons 7, 12, 13
//                                         and toolbox K3: building cost $1,712/kW and fixed upkeep $34.57/kW-yr (EIA,
//                                         AEO2026 assumptions, Table 3, 2025 dollars), capacity factor 33.8% (EIA, 2025
//                                         fleet), 4% real over 30 years (2025 ATB), the illustrative loan (5%) and owner
//                                         (10%) rates with 2.5% inflation, and the tornado ranges
//   assets/learn/data/a01-project-tea.json the farm's size (150 MW, Prairie Town's wind farm), the illustrative sale price
//                                         ($50/MWh), slider ranges, the timeline's illustrative calendar and the myth's
//                                         smaller farm
// One price year: every dollar is a real 2025 dollar, so every rate is a real rate (as in lesson 7 and K3).
//
// Model (closed form; the project's pre-tax cash flows before any debt payments):
//   yearly output        E = MW × 8,760 h × CF                                        (MWh a year)
//   year 0               −C, with C = 1,000 × MW × building cost ($ per kW)           (the whole outlay at once; no
//                                                                                     interest during construction)
//   years 1..n           net = p × E − F, with F = 1,000 × MW × fixed upkeep          (sales at a fixed price p, $/MWh)
//   present value        net ÷ (1 + r)^t;  NPV(r) = −C + net × AF(r, n),  AF(r, n) = (1 − (1 + r)^−n) ÷ r  (K3)
//   IRR                  the r with NPV(r) = 0 (bisection). One outlay, then equal positive years: NPV falls as r
//                        rises, so there is exactly one IRR (the test checks it on a grid)
//   simple payback       the first whole year whose running sum of cash is ≥ 0 (Short, Packey and Holt 1995, p. 56);
//                        C ÷ net is the same in fractional years
//   discounted payback   the first whole year whose running sum of discounted cash is ≥ 0 (p. 57); none if it never is
//   break-even price     p* = (CRF(r, n) × C + F) ÷ E: NPV(p*) = 0. Per kW this is lesson 7's LCOE, (CRF × capex + FOM)
//                        ÷ (CF × 8.76), $45.11/MWh for the wind farm, and 1 MW costs 1,000 × (CRF × capex + FOM) =
//                        $133,575 a year (lessons 7 and 13, K3)
//   WACC (no taxes)      nominal = d × r_loans + (1 − d) × r_owners;  real = (1 + nominal) ÷ (1 + inflation) − 1  (lesson 7)
//   tornado              NPV with one input at its low and its high value, the others at their defaults
// Every number the page states is checked against this model by _tests/learn/test_a01-project-tea.js (it also writes
// the no-JS tables: --write).
(function () {
  "use strict";
  var DR = (typeof window !== "undefined" && window.LX && window.LX.Drill) || require("./components/drill.js");
  var NA = (typeof window !== "undefined" && window.LX && window.LX.NumAnswer) || require("./components/numanswer.js");

  // ---------------------------------------------------------------- pure model (no DOM; exported for Node)
  var HOURS = 8760;
  function crf(r, n) { return r === 0 ? 1 / n : r / (1 - Math.pow(1 + r, -n)); }
  function annuity(r, n) { return r === 0 ? n : (1 - Math.pow(1 + r, -n)) / r; }
  function pv(x, r, t) { return x / Math.pow(1 + r, t); }
  function realRate(nominal, inflation) { return (1 + nominal) / (1 + inflation) - 1; }
  // the project's inputs: lesson 7's wind farm and finance, A1's farm and price, then any overrides
  // (mw, capex $/kW, fom $/kW-yr, cf %, price $/MWh, rate % real, life years)
  function inputs(D7, DA, over) {
    var w = D7.techs.wind, f = D7.finance, p = { mw: DA.farm.mw, capex: w.capex, fom: w.fom, cf: w.cf, price: DA.price, rate: f.wacc, life: f.life };
    if (over) Object.keys(over).forEach(function (k) { if (over[k] != null) p[k] = over[k]; });
    return p;
  }
  function energy(p) { return p.mw * HOURS * p.cf / 100; }
  function outlay(p) { return 1000 * p.mw * p.capex; }
  function upkeep(p) { return 1000 * p.mw * p.fom; }
  function sales(p) { return p.price * energy(p); }
  function net(p) { return sales(p) - upkeep(p); }
  function npv(p, rate) { var r = (rate == null ? p.rate : rate) / 100; return -outlay(p) + net(p) * annuity(r, p.life); }
  // year by year: t, cash (year 0 the outlay), its present value, and the running sums of both
  function flows(p, rate) {
    var r = (rate == null ? p.rate : rate) / 100, out = [], cum = 0, cumPV = 0;
    for (var t = 0; t <= p.life; t++) {
      var cash = t === 0 ? -outlay(p) : net(p), v = pv(cash, r, t);
      cum += cash; cumPV += v;
      out.push({ t: t, cash: cash, pv: v, cum: cum, cumPV: cumPV });
    }
    return out;
  }
  // the IRR in %: bisection on NPV(r) = 0 between −50% and 100% (NPV falls as r rises for these cash flows)
  function irr(p) {
    var lo = -50, hi = 100;
    if (npv(p, lo) < 0 || npv(p, hi) > 0) return null;
    for (var i = 0; i < 200; i++) { var m = (lo + hi) / 2; if (npv(p, m) > 0) lo = m; else hi = m; }
    return (lo + hi) / 2;
  }
  function payback(p, rate) {
    var F = flows(p, rate), s = null, d = null;
    F.forEach(function (y) { if (y.t > 0 && s === null && y.cum >= 0) s = y.t; if (y.t > 0 && d === null && y.cumPV >= 0) d = y.t; });
    return { simple: s, discounted: d, years: outlay(p) / net(p) };
  }
  // the IRR in % of an outlay C now and A a year for n years (the drill's projects)
  function irrOf(C, A, n) {
    var lo = -50, hi = 100;
    for (var i = 0; i < 200; i++) { var m = (lo + hi) / 2; if (-C + A * annuity(m / 100, n) > 0) lo = m; else hi = m; }
    return (lo + hi) / 2;
  }
  function breakEven(p) { return (crf(p.rate / 100, p.life) * outlay(p) + upkeep(p)) / energy(p); }
  function lcoePerKW(p) { return (crf(p.rate / 100, p.life) * p.capex + p.fom) / (p.cf / 100 * HOURS / 1000); }
  function perMWYear(p) { return 1000 * (crf(p.rate / 100, p.life) * p.capex + p.fom); }
  function wacc(fin, debtShare) {   // shares and rates in %; returns rates in %
    var nom = debtShare / 100 * fin.debtRate + (1 - debtShare / 100) * fin.equityRate;
    return { nominal: nom, real: realRate(nom / 100, fin.inflation / 100) * 100 };
  }
  // the tornado: NPV with one input at a time at its low and high values ($), rows sorted by swing
  function tornado(D7, DA, base) {
    var p = inputs(D7, DA, base), w = D7.techs.wind, f = D7.finance, R = D7.tornadoRanges, T = DA.tornado, rows = [];
    function row(k, label, lo, hi, loText, hiText) {
      var a = {}, z = {}; a[k] = lo; z[k] = hi;
      var atLo = npv(inputs(D7, DA, Object.assign({}, base, a))), atHi = npv(inputs(D7, DA, Object.assign({}, base, z)));
      rows.push({ key: k, label: label, lo: lo, hi: hi, loText: loText, hiText: hiText, atLo: atLo, atHi: atHi, swing: Math.abs(atHi - atLo) });
    }
    row("price", "Sale price", T.price[0], T.price[1], "$" + T.price[0], "$" + T.price[1]);
    row("cf", "Capacity factor", w.cfRange[0], w.cfRange[1], w.cfRange[0] + "%", w.cfRange[1] + "%");
    row("capex", "Building cost", p.capex * (1 + R.capex[0] / 100), p.capex * (1 + R.capex[1] / 100), "−" + Math.abs(R.capex[0]) + "%", "+" + R.capex[1] + "%");
    row("rate", "Discount rate", f.waccRange[0], f.waccRange[1], f.waccRange[0] + "% real", f.waccRange[1] + "% real");
    row("life", "Life", f.lifeRange[0], f.lifeRange[1], f.lifeRange[0] + " yr", f.lifeRange[1] + " yr");
    row("fom", "Fixed upkeep", p.fom * (1 + R.fom[0] / 100), p.fom * (1 + R.fom[1] / 100), "−" + Math.abs(R.fom[0]) + "%", "+" + R.fom[1] + "%");
    rows.sort(function (x, y) { return y.swing - x.swing; });
    return { base: npv(p), rows: rows };
  }
  // the project's milestones on an illustrative calendar (year 0 = schedule.buildYear)
  function milestones(p, DA) {
    var y0 = DA.schedule.buildYear, pb = payback(p);
    return { build: y0, first: y0 + 1, simple: pb.simple == null ? null : y0 + pb.simple, discounted: pb.discounted == null ? null : y0 + pb.discounted, end: y0 + p.life, pb: pb };
  }

  // ---------------------------------------------------------------- number formats (the test reads the page with these)
  function usd(v, d) { d = d == null ? 2 : d; return (v < 0 ? "−$" : "$") + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }); }
  function musd(v, d) { d = d == null ? 1 : d; var x = +(v / 1e6).toFixed(d); return (x < 0 ? "−$" : "$") + Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }) + "M"; }
  function signed(v) { return (v > 0 ? "+" : "") + musd(v); }
  function pct(v, d) { return (v < 0 ? "−" : "") + Math.abs(v).toFixed(d == null ? 1 : d) + "%"; }
  function usdM(v) { return (v < 0 ? "−" : "") + Math.abs(v).toFixed(1); }
  function mwh(v) { return Math.round(v).toLocaleString("en-US"); }

  // the page's story numbers
  function story(D7, DA) {
    var p = inputs(D7, DA), f = D7.finance, s = { p: p, fin: f };
    s.E = energy(p); s.C = outlay(p); s.S = sales(p); s.F = upkeep(p); s.net = net(p);
    s.sum = s.net * p.life; s.pvNet = s.net * annuity(p.rate / 100, p.life); s.npv = npv(p);
    s.irr = irr(p); s.pb = payback(p); s.be = breakEven(p); s.lcoe = lcoePerKW(p); s.perMW = perMWYear(p);
    s.npvLE = npv(p, 0) ; s.pvLast = pv(s.net, p.rate / 100, p.life); s.pvFirst = pv(s.net, p.rate / 100, 1);
    s.life20 = inputs(D7, DA, { life: f.lifeRange[0] }); s.npv20 = npv(s.life20); s.pb20 = payback(s.life20); s.irr20 = irr(s.life20);
    s.w60 = wacc(f, f.debtShare); s.npv60 = npv(p, s.w60.real);
    s.w40 = wacc(f, 40); s.npv40 = npv(p, s.w40.real); s.w0 = wacc(f, 0); s.npv0 = npv(p, s.w0.real); s.w80 = wacc(f, 80); s.npv80 = npv(p, s.w80.real);
    s.npv7 = npv(p, 7); s.npvAt45 = npv(inputs(D7, DA, { price: 45 })); s.npvAt46 = npv(inputs(D7, DA, { price: 46 }));
    s.small = inputs(D7, DA, { mw: DA.compare.mw, cf: DA.compare.cf }); s.npvSmall = npv(s.small); s.irrSmall = irr(s.small);
    s.tor = tornado(D7, DA); s.ms = milestones(p, DA);
    return s;
  }

  // the calculations the cards print (pure, so the test can recompute each from the operands it shows)
  function texts(s) {
    var p = s.p, R = pct(p.rate, 0);
    return {
      build: "Year 0 spends " + musd(s.C) + ". Years 1 to " + p.life + " each sell " + musd(s.S) + " and spend " + musd(s.F) + " on upkeep: " + musd(s.net) + " net. Added up without discounting, that is " + musd(s.sum) + ".",
      disc: "At " + R + ", the " + p.life + " net years are worth " + musd(s.pvNet) + " today. Minus the " + musd(s.C) + " outlay, the [[net-present-value|NPV]] is " + signed(s.npv) + ": the farm is worth building at this rate and price.",
      wacc: function (d) { var W = wacc(s.fin, d), v = npv(p, W.real); return d + "% loans: " + pct(W.nominal, 1) + " nominal, " + pct(W.real, 2) + " real; NPV " + signed(v) + "."; },
      waccSaw: "With these rates, moving from 40% to 60% loans takes the NPV from " + signed(s.npv40) + " to " + signed(s.npv60) + ". Financing alone can decide the answer.",
      irr: "The NPV reaches zero at " + pct(s.irr, 2) + ": the [[internal-rate-of-return|internal rate of return]]. It is above the " + R + " rate, so the NPV at " + R + " is positive.",
      pay: "Payback stays in year " + s.pb.simple + ", but the NPV falls from " + signed(s.npv) + " to " + signed(s.npv20) + ". Payback is blind to every year after it.",
      be: "The NPV crosses zero at " + usd(s.be) + "/MWh, lesson 7's LCOE for the same farm. Below it, the NPV is negative: the farm would not earn its " + R + ".",
      tor: function (guess) {
        var top = s.tor.rows[0], second = s.tor.rows[1];
        return (guess === top.key ? "Right. " : "") + top.label + " moves the NPV most (" + musd(top.swing) + " across its range), then " + second.label.toLowerCase() + " (" + musd(second.swing) + "). Other ranges could change the order.";
      }
    };
  }

  // ---------------------------------------------------------------- no-JS tables (written into the page by the test)
  function staticBlocks(s) {
    var p = s.p, F = flows(p), pick = [0, 1, 2, 10, s.pb.simple, s.pb.discounted, 30];
    var rows = F.filter(function (y) { return pick.indexOf(y.t) >= 0; }).map(function (y) {
      return "<tr><td>" + y.t + "</td><td>" + musd(y.cash) + "</td><td>" + musd(y.pv) + "</td><td>" + musd(y.cum) + "</td><td>" + musd(y.cumPV) + "</td></tr>";
    }).join("\n");
    var cash = '<table class="a1-static" aria-label="The wind farm\'s cash flows, in millions of 2025 dollars">\n' +
      '<thead><tr><th scope="col">Year</th><th scope="col">Cash</th><th scope="col">Worth today at ' + pct(p.rate, 0) + '</th><th scope="col">Running sum</th><th scope="col">Running sum, discounted</th></tr></thead>\n<tbody>\n' + rows + "\n</tbody></table>";
    var yard = '<table class="a1-static" aria-label="Four yardsticks for the same farm">\n<thead><tr><th scope="col">Yardstick</th><th scope="col">This farm</th></tr></thead>\n<tbody>\n' +
      "<tr><td>Net present value at " + pct(p.rate, 0) + "</td><td>" + signed(s.npv) + "</td></tr>\n" +
      "<tr><td>Internal rate of return</td><td>" + pct(s.irr, 2) + "</td></tr>\n" +
      "<tr><td>Simple payback</td><td>year " + s.pb.simple + "</td></tr>\n" +
      "<tr><td>Discounted payback at " + pct(p.rate, 0) + "</td><td>year " + s.pb.discounted + "</td></tr>\n" +
      "<tr><td>Break-even price</td><td>" + usd(s.be) + "/MWh</td></tr>\n</tbody></table>";
    return { cash: cash, yard: yard };
  }

  // ---------------------------------------------------------------- practice drill items (LX.Drill; seeded, so tests can replay them)
  var KINDS = ["npv", "payback", "irr", "wacc", "breakeven", "pick"];
  function drillItem(k, r) {
    var kind = KINDS[k % KINDS.length], pick = function (a) { return a[Math.floor(r() * a.length)]; };
    if (kind === "npv") {
      var C = pick([80, 100, 120, 150, 200]), A = pick([8, 10, 12, 15]), n = pick([10, 15, 20, 25]), rr = pick([3, 4, 5, 6, 8]);
      var af = annuity(rr / 100, n), v = -C + A * af;
      return { kind: kind, q: "A project costs $" + C + "M now and nets $" + A + "M at the end of each year for " + n + " years. Its NPV at " + rr + "%, in $M to one decimal?", answer: Math.round(v * 10) / 10, tol: 0.15, unit: "$M",
               why: "In $M: −" + C + " + " + A + " × " + af.toFixed(3) + ((-C + A * +af.toFixed(3)).toFixed(1) === v.toFixed(1) ? " = " : " ≈ ") + usdM(v) + "; the annuity factor at " + rr + "% over " + n + " years is " + af.toFixed(3) + "." };
    }
    if (kind === "payback") {
      var C2 = pick([50, 60, 90, 120, 150]), A2 = pick([7, 8, 11, 13, 17]), yrs = C2 / A2, ans = Math.ceil(yrs - 1e-9);
      return { kind: kind, q: "A project costs $" + C2 + "M and nets $" + A2 + "M a year. In which year does its running sum first reach zero (simple payback)?", answer: ans, tol: 0, unit: "year",
               why: C2 + " ÷ " + A2 + " = " + yrs.toFixed(2) + " years, so the running sum first reaches zero at the end of year " + ans + "." };
    }
    if (kind === "irr") {
      // the yearly cash is rounded to the cent, so the exact IRR sits a hair away from the round rate (the why says so)
      var n3 = pick([10, 20, 30]), rt = pick([3, 4, 5, 6, 7, 8]), C3 = 100, Ar = Math.round(C3 / annuity(rt / 100, n3) * 100) / 100;
      var exact = irrOf(C3, Ar, n3);
      // distractors: the rate two points either side, and the yearly cash as a share of the cost (a common slip)
      var opts = [rt, rt - 2, rt + 2, Math.round(100 * Ar / C3)].filter(function (v, i, a) { return v > 0 && a.indexOf(v) === i; });
      while (opts.length < 4) opts.push(opts[opts.length - 1] + 3);
      var order = opts.map(function (v) { return [r(), v]; }).sort(function (a, b) { return a[0] - b[0]; }).map(function (x) { return x[1]; });
      return { kind: kind, q: "A project costs $" + C3 + "M and nets $" + Ar.toFixed(2) + "M a year for " + n3 + " years. Which is its IRR?", choices: order.map(function (v) { return v + "%"; }), answer: order.indexOf(rt),
               why: "In $M, at " + rt + "%: " + Ar.toFixed(2) + " × " + annuity(rt / 100, n3).toFixed(3) + " ≈ " + (Ar * annuity(rt / 100, n3)).toFixed(1) + ", the cost, so the NPV is zero (to two decimals, the IRR is " + exact.toFixed(2) + "%)." };
    }
    if (kind === "wacc") {
      var d = pick([40, 50, 60, 70]), rd = pick([4, 5, 6]), re = pick([9, 10, 12]), inf = pick([2, 2.5, 3]);
      var nom = d / 100 * rd + (1 - d / 100) * re, real = realRate(nom / 100, inf / 100) * 100;
      return { kind: kind, q: "Loans pay " + rd + "% and owners ask " + re + "% (nominal, no taxes); loans are " + d + "% of the money; inflation is " + inf + "%. The real WACC, in % to two decimals?", answer: Math.round(real * 100) / 100, tol: 0.02, unit: "%",
               why: d / 100 + " × " + rd + " + " + (1 - d / 100).toFixed(1) + " × " + re + " = " + nom.toFixed(1) + "% nominal; (1 + " + (nom / 100).toFixed(3) + ") ÷ (1 + " + (inf / 100).toFixed(3) + ") − 1 = " + (real / 100).toFixed(4) + ", or " + real.toFixed(2) + "% real." };
    }
    if (kind === "breakeven") {
      var cap = pick([1200, 1500, 1712, 2000]), fom = pick([20, 30, 34.57]), cfp = pick([25, 30, 33.8, 40]), cr = +crf(pick([4, 5, 6]) / 100, 30).toFixed(4);
      var Ekw = cfp / 100 * 8.76, be = (cr * cap + fom) / Ekw;
      return { kind: kind, q: "Building cost $" + cap.toLocaleString("en-US") + "/kW, upkeep $" + fom + "/kW-yr, capacity factor " + cfp + "%, CRF " + cr.toFixed(4) + ". The break-even price, in $/MWh to the cent?", answer: Math.round(be * 100) / 100, tol: 0.06, unit: "$/MWh",
               why: "(" + cr.toFixed(4) + " × " + cap + " + " + fom + ") ÷ (" + (cfp / 100).toFixed(3) + " × 8.76) = " + be.toFixed(2) + " $/MWh." };
    }
    // pick: two mutually exclusive projects; which adds more value?
    var a = { npv: pick([12, 18, 25, 40]), irr: pick([5, 6, 7]) }, b2 = { npv: a.npv + pick([-8, 6, 10]), irr: a.irr + pick([2, 3]) };
    var bWins = b2.npv > a.npv;
    return { kind: kind, q: "Only one can be built. A: NPV $" + a.npv + "M, IRR " + a.irr + "%. B: NPV $" + b2.npv + "M, IRR " + b2.irr + "%. Which adds more value at the same discount rate?", choices: ["A", "B"], answer: bWins ? 1 : 0,
             why: (bWins ? "B" : "A") + ": its NPV is larger ($" + Math.max(a.npv, b2.npv) + "M against $" + Math.min(a.npv, b2.npv) + "M). The higher IRR does not decide between projects of different size." };
  }
  function drill(seed, n) { return DR.series(drillItem, seed, n); }

  var model = { HOURS: HOURS, crf: crf, annuity: annuity, pv: pv, realRate: realRate, inputs: inputs, energy: energy, outlay: outlay, upkeep: upkeep, sales: sales,
                net: net, npv: npv, flows: flows, irr: irr, irrOf: irrOf, payback: payback, breakEven: breakEven, lcoePerKW: lcoePerKW, perMWYear: perMWYear, wacc: wacc,
                tornado: tornado, milestones: milestones, story: story, texts: texts, staticBlocks: staticBlocks, KINDS: KINDS, drillItem: drillItem, drill: drill,
                close: NA.close, usd: usd, musd: musd, signed: signed, pct: pct, mwh: mwh };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;

  // ================================================================ view
  var LX = window.LX, H = LX.H;
  var COL = { build: "var(--lx-tier-2)", sales: "var(--lx-good)", upkeep: "var(--lx-tier-5)", net: "var(--lx-ink-3)", today: "var(--lx-tier-3)" };

  function readouts(host, labels, cls) {
    var box = H("div", { class: "lx-readouts" + (cls ? " " + cls : ""), "aria-live": "polite" }, host), out = {};
    labels.forEach(function (l) { var d = H("div", { class: "lx-readout" }, box); H("span", { text: l[1] }, d); out[l[0]] = H("b", null, d); });
    return out;
  }
  function yearTicks(n) { return [[0, "0"], [10, "10"], [20, "20"], [n, n + " yr"]]; }
  var mFmt = function (v) { return (v < 0 ? "−$" : "$") + Math.abs(v) + "M"; };
  // a value axis in $M that holds every value (step 50, or 100 when the range is wide)
  function axisM(vals, minStep) {
    var lo = Math.min(0, Math.min.apply(null, vals)), hi = Math.max(0, Math.max.apply(null, vals)), step = minStep || (hi - lo > 400 ? 100 : 50);
    return { min: Math.floor(lo / step) * step, max: Math.ceil(hi / step) * step || step, step: step };
  }

  function view(live, data, root) {
    var D7 = data["07_cost"], DA = data["a01_project_tea"], s = story(D7, DA), T = texts(s), p = s.p, autos = {}, steps = [];
    var R = pct(p.rate, 0), N = p.life;

    // ---- step 1: build the cash flows
    steps.push({
      text: "A " + p.mw + " MW wind farm sells every MWh at " + usd(p.price, 0) + " for " + N + " years. Add its three cash flows, year by year: what it costs to build, what it sells, and its upkeep.",
      build: function (act, api) {
        var on = { build: false, sales: false, upkeep: false };
        var row = H("div", { class: "lx-choices-row", role: "group", "aria-label": "Add a cash flow" }, act), btn = {};
        [["build", "Add the building cost"], ["sales", "Add the sales"], ["upkeep", "Add the upkeep"]].forEach(function (b) {
          btn[b[0]] = H("button", { type: "button", class: "lx-choice", "aria-pressed": "false", text: b[1] }, row);
          btn[b[0]].addEventListener("click", function () { on[b[0]] = !on[b[0]]; draw(); });
        });
        var P = LX.Plot(act, { text: "Text version of the chart", box: true });
        var ro = readouts(act, [["y0", "Year 0"], ["yr", "Each year, 1 to " + N], ["sum", "Years 1 to " + N + " together"]]);
        function draw() {
          var bars = [], c = -outlay(p) / 1e6, sl = sales(p) / 1e6, up = -upkeep(p) / 1e6;
          if (on.build) bars.push({ x0: -0.4, x1: 0.4, y0: c, y1: 0, color: COL.build });
          for (var t = 1; t <= N; t++) {
            if (on.sales) bars.push({ x0: t - 0.4, x1: t + 0.4, y0: 0, y1: sl, color: COL.sales });
            if (on.upkeep) bars.push({ x0: t - 0.4, x1: t + 0.4, y0: up, y1: 0, color: COL.upkeep });
          }
          Object.keys(btn).forEach(function (k) { btn[k].setAttribute("aria-pressed", on[k] ? "true" : "false"); });
          var yr = (on.sales ? sales(p) : 0) - (on.upkeep ? upkeep(p) : 0), y0 = on.build ? -outlay(p) : 0;
          ro.y0.textContent = on.build ? musd(y0) : "—"; ro.yr.textContent = on.sales || on.upkeep ? musd(yr) : "—"; ro.sum.textContent = on.sales || on.upkeep ? musd(N * yr) : "—";
          P.render({ x: { min: -0.7, max: N + 0.7, ticks: yearTicks(N) }, y: { min: -300, max: 50, step: 50, fmt: mFmt, zero: true }, height: 250, heightN: 210, bars: bars,
            legend: [{ label: "Building cost", color: COL.build }, { label: "Sales", color: COL.sales }, { label: "Upkeep", color: COL.upkeep }],
            aria: "Cash flows of the wind farm in millions of 2025 dollars: " + (on.build ? "year 0 " + musd(-outlay(p)) + "; " : "") + (on.sales ? "sales " + musd(sales(p)) + " a year; " : "") + (on.upkeep ? "upkeep " + musd(-upkeep(p)) + " a year." : ""),
            text: { head: ["Cash flow", "When", "$M"], rows: [["Building cost", "year 0", on.build ? musd(-outlay(p)) : "not added"], ["Sales", "years 1 to " + N + ", each", on.sales ? musd(sales(p)) : "not added"], ["Upkeep", "years 1 to " + N + ", each", on.upkeep ? musd(-upkeep(p)) : "not added"]] } });
          if (on.build && on.sales && on.upkeep) { api.done(); api.saw(T.build); LX.emit("layout"); }
        }
        autos[0] = function () { ["build", "sales", "upkeep"].forEach(function (k) { on[k] = true; }); draw(); };
        draw();
      }
    });

    // ---- step 2: discount each year
    steps.push({
      text: "A dollar in year 30 is worth less than a dollar now (toolbox K3). Switch on today's value: each year's net cash, divided by 1.04 once for every year of waiting.",
      build: function (act, api) {
        var tg = LX.Toggle(H("div", { class: "lx-toggles", role: "group", "aria-label": "Discounting" }, act), { label: "Show each year's value today, at " + R, on: false, onChange: draw });
        var P = LX.Plot(act, { text: "Text version of the chart", box: true });
        var ro = readouts(act, [["sum", "Years 1 to " + N + ", today"], ["c", "Year 0, the outlay"], ["npv", "Net present value"]]);
        function draw() {
          var F = flows(p), bars = [], shown = tg.val();
          F.slice(1).forEach(function (y) {
            bars.push({ x0: y.t - 0.42, x1: y.t + 0.42, y0: 0, y1: y.cash / 1e6, color: COL.net, op: shown ? 0.28 : 0.9 });
            if (shown) bars.push({ x0: y.t - 0.42, x1: y.t + 0.42, y0: 0, y1: y.pv / 1e6, color: COL.today });
          });
          ro.sum.textContent = shown ? musd(s.pvNet) : "—"; ro.c.textContent = musd(-s.C); ro.npv.textContent = shown ? signed(s.npv) : "—";
          P.render({ x: { min: 0.3, max: N + 0.7, ticks: [[1, "year 1"], [10, "10"], [20, "20"], [N, String(N)]] }, y: { min: 0, max: 20, step: 5, fmt: mFmt }, height: 220, heightN: 190, bars: bars,
            legend: shown ? [{ label: "Net cash that year (pale)", color: COL.net }, { label: "Worth today, at " + R, color: COL.today }] : [{ label: "Net cash that year", color: COL.net }],
            aria: "Net cash " + musd(s.net) + " each year" + (shown ? "; worth today " + musd(s.pvFirst) + " for year 1 down to " + musd(s.pvLast) + " for year " + N + "." : "."),
            text: { head: ["Year", "Net cash, $M", "Worth today at " + R + ", $M"], rows: F.slice(1).map(function (y) { return [String(y.t), musd(y.cash, 2), musd(y.pv, 2)]; }),
                    note: "Years 1 to " + N + " together, today: " + musd(s.pvNet) + "; minus the " + musd(s.C) + " outlay in year 0, the NPV is " + signed(s.npv) + "." } });
          if (shown) { api.done(); api.saw(T.disc); }
        }
        autos[1] = function () { tg.set(true); draw(); };
        draw();
      }
    });

    // ---- step 3: the discount rate is the cost of the money (WACC)
    var fin = D7.finance;
    steps.push({
      text: "The rate is what the money costs: loans at " + pct(fin.debtRate, 0) + ", owners asking " + pct(fin.equityRate, 0) + " for their riskier share (nominal, illustrative), [[inflation|inflation]] " + pct(fin.inflation, 1) + ". Slide the loan share and watch the [[wacc|WACC]] and the NPV.",
      build: function (act, api) {
        var P = LX.Plot(act, { text: "Text version of the chart", box: true });
        var ro = readouts(act, [["nom", "WACC, nominal"], ["real", "WACC, real (the discount rate)"], ["npv", "NPV at that rate"]]);
        var rg = DA.debtShareRange, moved = false;
        var sl = LX.Slider(act, { label: "Loans, share of the money", color: COL.build, min: rg[0], max: rg[1], step: DA.debtShareStep, value: fin.debtShare, fmt: function (v) { return v + "%"; }, onChange: function () { moved = true; draw(); } });
        H("p", { class: "lx-hint", html: LX.rich("Both rates stay fixed here, a simplification: more loans make the owners' share riskier, so they would ask more (Go deeper).") }, act);
        var xs = []; for (var d = rg[0]; d <= rg[1]; d += DA.debtShareStep) xs.push(d);
        function draw() {
          var d0 = sl.val(), W = wacc(fin, d0), v = npv(p, W.real);
          ro.nom.textContent = pct(W.nominal, 1); ro.real.textContent = pct(W.real, 2); ro.npv.textContent = signed(v);
          var pts = xs.map(function (x) { return [x, npv(p, wacc(fin, x).real) / 1e6]; }), ax = axisM(pts.map(function (q) { return q[1]; }), 25);
          P.render({ x: { min: rg[0], max: rg[1], ticks: [[0, "0%"], [20, "20%"], [40, "40%"], [60, "60%"], [80, "80% loans"]], ticksN: [[0, "0%"], [40, "40%"], [80, "80% loans"]] }, y: { min: ax.min, max: ax.max, step: 25, fmt: mFmt, zero: true }, height: 210, heightN: 190,
            lines: [{ pts: pts, color: COL.build }], marks: [{ x: d0, y: v / 1e6, label: signed(v), kind: "dot", pos: v >= 0 ? "above" : "below" }],
            aria: "NPV of the wind farm against the loan share: " + signed(npv(p, wacc(fin, rg[0]).real)) + " with no loans, " + signed(npv(p, wacc(fin, rg[1]).real)) + " with " + rg[1] + "% loans; now " + signed(v) + " at " + d0 + "%.",
            text: { head: ["Loans", "WACC nominal", "WACC real", "NPV"], rows: xs.filter(function (x) { return x % 20 === 0; }).map(function (x) { var w2 = wacc(fin, x); return [x + "%", pct(w2.nominal, 1), pct(w2.real, 2), signed(npv(p, w2.real))]; }) } });
          if (moved) { api.done(); api.saw(T.wacc(d0) + " " + T.waccSaw); }
        }
        autos[2] = function () { sl.set(40, true); };
        draw();
      }
    });

    // ---- step 4: the internal rate of return
    steps.push({
      text: "Raise the discount rate and the NPV falls. Slide it up from " + R + " until the NPV reaches zero. That rate is the project's own return.",
      build: function (act, api) {
        var P = LX.Plot(act, { text: "Text version of the chart", box: true });
        var ro = readouts(act, [["r", "Discount rate"], ["npv", "NPV"]]);
        var rg = DA.rateRange, xs = [];
        for (var x = rg[0]; x <= rg[1] + 1e-9; x += 0.5) xs.push(Math.round(x * 10) / 10);
        var sl = LX.Slider(act, { label: "Discount rate (real)", color: COL.today, min: rg[0], max: rg[1], step: DA.rateStep, value: p.rate, fmt: function (v) { return v.toFixed(1) + "%"; }, onChange: draw });
        var reached = false;
        function draw() {
          var r = sl.val(), v = npv(p, r), pts = xs.map(function (q) { return [q, npv(p, q) / 1e6]; }), ax = axisM(pts.map(function (q) { return q[1]; }));
          ro.r.textContent = pct(r, 1); ro.npv.textContent = signed(v);
          var marks = [{ x: r, y: v / 1e6, label: signed(v), kind: "dot", pos: v >= 0 ? "above" : "below" }];
          if (reached) { marks[0].pos = "below"; marks.push({ x: s.irr, y: 0, label: "IRR " + pct(s.irr, 2), kind: "ring", above: true }); }
          P.render({ x: { min: rg[0], max: rg[1], ticks: [[0, "0%"], [2, "2%"], [4, "4%"], [6, "6%"], [8, "8%"], [10, "10%"]] }, y: { min: ax.min, max: ax.max, step: ax.step, fmt: mFmt, zero: true }, height: 220, heightN: 190,
            lines: [{ pts: pts, color: COL.today }], marks: marks,
            aria: "NPV of the wind farm against the discount rate: " + signed(npv(p, rg[0])) + " at 0%, zero at " + pct(s.irr, 2) + ", " + signed(npv(p, rg[1])) + " at " + rg[1] + "%; now " + signed(v) + " at " + pct(r, 1) + ".",
            text: { head: ["Discount rate", "NPV"], rows: xs.filter(function (q) { return q % 1 === 0; }).map(function (q) { return [pct(q, 0), signed(npv(p, q))]; }) } });
          if (!reached && r >= s.irr) { reached = true; api.done(); api.saw(T.irr); draw(); }
        }
        autos[3] = function () { sl.set(Math.ceil(s.irr * 10) / 10, true); };
        draw();
      }
    });

    // ---- step 5: payback, and what it misses
    steps.push({
      text: "[[payback-period|Payback]] counts the years until the cash put in comes back. Read it where each running sum crosses zero, then shorten the farm's life to " + D7.finance.lifeRange[0] + " years.",
      build: function (act, api) {
        var tg = LX.Toggle(H("div", { class: "lx-toggles", role: "group", "aria-label": "Life of the farm" }, act), { label: "A " + D7.finance.lifeRange[0] + "-year life instead of " + N, on: false, onChange: draw });
        var P = LX.Plot(act, { text: "Text version of the chart", box: true });
        var ro = readouts(act, [["s", "1 · Simple payback"], ["d", "2 · Discounted payback, " + R], ["npv", "NPV at " + R]]);
        function yearsText(t) { return t == null ? "never" : "year " + t; }
        function draw() {
          var q = tg.val() ? s.life20 : p, F = flows(q), pb = payback(q), v = npv(q);
          ro.s.textContent = yearsText(pb.simple); ro.d.textContent = yearsText(pb.discounted); ro.npv.textContent = signed(v);
          var all = flows(p), ax = axisM(all.map(function (y) { return y.cum / 1e6; }).concat([-outlay(p) / 1e6]));
          var marks = [];
          // numbered discs, named in the readouts (1 simple, 2 discounted), so no two labels meet at any width
          if (pb.simple != null) marks.push({ x: pb.simple, y: 0, n: "1", label: "" });
          if (pb.discounted != null) marks.push({ x: pb.discounted, y: 0, n: "2", label: "", color: COL.today });
          P.render({ x: { min: 0, max: N, ticks: yearTicks(N) }, y: { min: ax.min, max: ax.max, step: 100, fmt: mFmt, zero: true }, height: 240, heightN: 200,
            lines: [{ pts: F.map(function (y) { return [y.t, y.cum / 1e6]; }), color: COL.net }, { pts: F.map(function (y) { return [y.t, y.cumPV / 1e6]; }), color: COL.today, dash: "6 4" }],
            spans: tg.val() ? [{ x0: q.life, x1: N, color: "var(--lx-ink-3)", op: 0.08, label: "no farm" }] : [],
            marks: marks, legend: [{ label: "Running sum of cash", color: COL.net }, { label: "Running sum, discounted at " + R, color: COL.today, dash: "6 4" }],
            aria: "Running sums of the wind farm's cash over a " + q.life + "-year life: simple payback " + yearsText(pb.simple) + ", discounted payback " + yearsText(pb.discounted) + ", NPV " + signed(v) + ".",
            text: { head: ["Year", "Running sum, $M", "Discounted, $M"], rows: F.filter(function (y) { return y.t % 4 === 0 || y.t === pb.simple || y.t === pb.discounted || y.t === q.life; }).map(function (y) { return [String(y.t), musd(y.cum), musd(y.cumPV)]; }) } });
          if (tg.val()) { api.done(); api.saw(T.pay); }
        }
        autos[4] = function () { tg.set(true); draw(); };
        draw();
      }
    });

    // ---- step 6: the break-even price is lesson 7's LCOE
    steps.push({
      text: "Lower the sale price from " + usd(p.price, 0) + " until the NPV turns negative. Where it crosses zero is the [[break-even-price|break-even price]].",
      build: function (act, api) {
        var P = LX.Plot(act, { text: "Text version of the chart", box: true });
        var ro = readouts(act, [["p", "Sale price"], ["npv", "NPV at " + R], ["irr", "IRR"]]);
        var rg = DA.priceRange, xs = []; for (var x = rg[0]; x <= rg[1]; x += 5) xs.push(x);
        var sl = LX.Slider(act, { label: "Sale price", color: COL.sales, min: rg[0], max: rg[1], step: DA.priceStep, value: p.price, fmt: function (v) { return "$" + v + "/MWh"; }, onChange: draw });
        var crossed = false;
        function draw() {
          var q = inputs(D7, DA, { price: sl.val() }), v = npv(q), ir = irr(q), pts = xs.map(function (z) { return [z, npv(inputs(D7, DA, { price: z })) / 1e6]; }), ax = axisM(pts.map(function (z) { return z[1]; }));
          ro.p.textContent = usd(q.price, 0) + "/MWh"; ro.npv.textContent = signed(v); ro.irr.textContent = ir == null ? "none" : pct(ir, 2);
          var marks = [{ x: q.price, y: v / 1e6, label: signed(v), kind: "dot", pos: v >= 0 ? "above" : "below" }];
          if (crossed) { marks[0].label = null; marks.push({ x: s.be, y: 0, label: "Break-even " + usd(s.be), kind: "ring", above: true }); }   // the NPV is in the readout
          P.render({ x: { min: rg[0], max: rg[1], ticks: [[30, "$30"], [40, "$40"], [50, "$50"], [60, "$60"], [70, "$70/MWh"]] }, y: { min: ax.min, max: ax.max, step: ax.step, fmt: mFmt, zero: true }, height: 220, heightN: 190,
            lines: [{ pts: pts, color: COL.sales }], marks: marks,
            aria: "NPV against the sale price: zero at " + usd(s.be) + "/MWh; now " + signed(v) + " at " + usd(q.price, 0) + ".",
            text: { head: ["Sale price", "NPV at " + R], rows: xs.map(function (z) { return ["$" + z + "/MWh", signed(npv(inputs(D7, DA, { price: z })))]; }) } });
          LX.store.set("a1-own", { price: q.price });
          if (!crossed && v < 0) { crossed = true; api.done(); api.saw(T.be); draw(); }
          if (refresh) refresh();
        }
        autos[5] = function () { sl.set(Math.floor(s.be), true); };
        draw();
      }
    });

    // ---- step 7: which input matters most? (tornado)
    var TOR = s.tor.rows, OPTS = TOR.slice().sort(function (a, b) { return ["price", "cf", "capex", "rate", "life", "fom"].indexOf(a.key) - ["price", "cf", "capex", "rate", "life", "fom"].indexOf(b.key); });
    steps.push({
      text: "Six inputs could be wrong. Which one, swung across a plausible range with the others held, moves the NPV most? Guess, then see the [[tornado-chart|tornado chart]].",
      build: function (act, api) {
        var box = H("div", null, act), drawn = false;
        var pr = LX.Predict(act, { id: "a1-tornado", q: "Moves the NPV most:", options: OPTS.map(function (r) { return { value: r.key, label: r.label }; }), fresh: true, answer: TOR[0].key,
          onPick: function (g) { if (!drawn) { drawn = true; draw(); } pr.reveal(); api.done(); api.saw(T.tor(g)); } });
        act.appendChild(box);
        function draw() {
          var t = LX.Tornado(box, { fmt: function (v) { return musd(v, 0); }, fmtAlt: function (v) { return musd(v); }, measure: "NPV", below: "var(--lx-bad)", above: "var(--lx-good)" });
          t.draw({ base: s.tor.base, rows: TOR.map(function (r) { return { label: r.label, loText: r.loText, hiText: r.hiText, atLo: r.atLo, atHi: r.atHi }; }),
                   lede: "**" + p.mw + " MW wind farm**: NPV " + signed(s.npv) + " at the defaults (black line).",
                   note: "Ranges: sale price illustrative; the others are lesson 7's. Each bar holds the other five inputs at their defaults." });
        }
        // the shortcut picks the reader's own guess if there is one, else the first option, as a click would
        autos[6] = function () { var b = act.querySelector('.lx-predictbox button[aria-pressed="true"]') || act.querySelector(".lx-predictbox button"); if (b) b.click(); };
      }
    });

    var refresh = null;
    var cards = LX.StepCards(live, { id: "a1-steps", steps: steps, onStep: function () { LX.emit("layout"); } });
    LX.demo(root, function (state) {   // "mid" = step 2 with today's values; "step-N" = card N with its action done; "done" = the last card
      var k = state === "mid" ? 1 : state === "done" ? steps.length - 1 : /^step-(\d+)$/.test(state) ? Math.max(0, Math.min(steps.length - 1, +state.slice(5) - 1)) : -1;
      if (k < 0) return null;
      cards.go(k); if (autos[k]) autos[k]();
      return { view: "step " + (k + 1) };
    }, cards);

    refresh = explain(s, D7, DA);
    drillView();
  }

  // ---------------------------------------------------------------- explain layer
  function explain(s, D7, DA) {
    var x = document.getElementById("a1-explain"); if (!x) return null; x.innerHTML = "";
    var p = s.p, R = pct(p.rate, 0);
    function own() { var o = LX.store.get("a1-own"); return o && typeof o.price === "number" ? inputs(D7, DA, { price: o.price }) : null; }
    function you(kind) {
      return function () {
        var q = own() || p, head = own() ? "Your last price, " + usd(q.price, 0) + "/MWh: " : "The wind farm: ";
        if (kind === "npv") return head + "NPV " + signed(npv(q)) + " at " + R + ".";
        if (kind === "irr") { var i = irr(q); return head + (i == null ? "no IRR in the searched range." : "IRR " + pct(i, 2) + "."); }
        if (kind === "C") return "The wind farm: 1,000 × " + q.mw + " MW × " + usd(q.capex, 0) + " per kW = " + musd(outlay(q)) + ".";
        if (kind === "p") return head + "sales " + musd(sales(q)) + " a year.";
        if (kind === "E") return "The wind farm: " + q.mw + " MW × 8,760 h × " + pct(q.cf, 1) + " = " + mwh(energy(q)) + " MWh a year.";
        if (kind === "F") return "The wind farm: 1,000 × " + q.mw + " MW × " + usd(q.fom) + " per kW = " + musd(upkeep(q)) + " a year.";
        if (kind === "r") return "Lessons 7 and 13, and here: " + R + " a year, real.";
        if (kind === "n") return "The wind farm: " + q.life + " years.";
        return null;
      };
    }
    var card = LX.EquationCard(H("div", { class: "lx-xcard a1-eqcard" }, x), {
      title: "Net present value and the internal rate of return", lede: "Tap a symbol: its meaning, its unit and the wind farm's numbers.",
      rows: [
        { parts: [{ k: "npv" }, "=", "−", { k: "C" }, "+", { html: "Σ<sub>t=1</sub><sup>n</sup>" }, { frac: [["(", { k: "p" }, "×", { k: "E" }, "−", { k: "F" }, ")"], ["(1 + ", { k: "r" }, ")", { html: "<sup>t</sup>" }]] }],
          say: "NPV equals minus the building cost C, plus the sum over years t from 1 to n of p times E minus F, divided by one plus r to the power t.", tag: "NPV" },
        { parts: ["0", "=", "−", { k: "C" }, "+", { html: "Σ<sub>t=1</sub><sup>n</sup>" }, { frac: [["(", { k: "p" }, "×", { k: "E" }, "−", { k: "F" }, ")"], ["(1 + ", { k: "irr" }, ")", { html: "<sup>t</sup>" }]] }],
          say: "The IRR is the rate that makes the same sum equal to zero.", tag: "IRR" }],
      symbols: {
        npv: { sym: "NPV", name: "Net present value", unit: "$", color: "var(--lx-ink)", words: "Every year's cash, discounted to today and added up, the outlay included. Above zero, the project earns more than the rate r.", you: you("npv"), code: "npv = -C + sum((p*E - F) / (1 + r)**t for t in range(1, n + 1))" },
        C: { sym: "C", name: "Building cost", unit: "$, in year 0", color: COL.build, words: "The whole outlay, paid at once in year 0 (no interest during construction here).", you: you("C"), code: "C = 1000 * 150 * 1712" },
        p: { sym: "p", name: "Sale price", unit: "$ per MWh", color: COL.sales, words: "What each MWh sells for; fixed for the whole life in this lesson (illustrative).", you: you("p"), code: "p = 50" },
        E: { sym: "E", name: "Yearly output", unit: "MWh a year", color: "var(--lx-wind)", words: "Size × 8,760 hours × the capacity factor (lesson 5).", you: you("E"), code: "E = 150 * 8760 * 0.338" },
        F: { sym: "F", name: "Fixed upkeep", unit: "$ a year", color: COL.upkeep, words: "[[fixed-om|Fixed operation and maintenance]], paid every year whatever the output.", you: you("F"), code: "F = 1000 * 150 * 34.57" },
        r: { sym: "r", name: "Discount rate", unit: "a fraction per year", color: COL.today, words: "What the money costs, the [[wacc|WACC]]; real, because every dollar here is a 2025 dollar.", you: you("r"), code: "r = 0.04" },
        irr: { sym: "IRR", name: "Internal rate of return", unit: "a fraction per year", color: "var(--lx-tier-4)", words: "The rate at which the NPV is exactly zero: the project's own return.", you: you("irr"), code: "irr = scipy.optimize.brentq(lambda r: npv_at(r), 0, 1)" } },
      fields: [{ key: "you", label: "Your numbers" }, { key: "code", label: "In code", code: true }], sel: "npv",
      hint: "t counts years from the outlay (year 0); n is the life in years."
    });
    var ms = milestones(p, DA), y0 = DA.schedule.buildYear, src = { label: "This lesson's model; illustrative calendar" };
    LX.Timeline(H("div", { class: "lx-xcard" }, x), {
      title: "The wind farm's life, year by year", lede: "An illustrative calendar: built in " + y0 + ", selling from " + (y0 + 1) + ". Every dollar is a 2025 dollar.",
      kinds: { event: "Cash", study: "Yardstick" },
      events: [
        { date: String(ms.build), label: "Year 0: build", kind: "event", key: true, text: "The outlay, " + musd(s.C) + ", all at once.", source: src },
        { date: String(ms.first), label: "Year 1: first sales", kind: "event", text: musd(s.S) + " of sales minus " + musd(s.F) + " of upkeep: " + musd(s.net) + ".", source: src },
        { date: String(ms.simple), label: "Year " + s.pb.simple + ": simple payback", kind: "study", text: "The running sum of cash first reaches zero: " + s.pb.years.toFixed(2) + " years of net cash repay the outlay.", source: src },
        { date: String(ms.discounted), label: "Year " + s.pb.discounted + ": discounted payback", kind: "study", text: "The running sum of discounted cash, at " + R + ", first reaches zero.", source: src },
        { date: String(ms.end), label: "Year " + p.life + ": end of life", kind: "event", key: true, text: "The discounted running sum ends at the NPV, " + signed(s.npv) + ".", source: src }],
      note: "Payback reads the first crossing; the NPV also counts every year after it."
    });
    LX.CompareTable(H("div", { class: "lx-xcard" }, x), {
      title: "Five yardsticks for one farm", text: true,
      columns: [{ key: "name", label: "Yardstick", main: true }, { key: "asks", label: "It answers" }, { key: "misses", label: "It misses" }, { key: "here", label: "This farm" }],
      rows: [
        { key: "npv", color: "var(--lx-ink)", name: "Net present value", asks: "How much value does it add at the cost of money?", misses: "Needs a rate; one number hides the risk.", here: signed(s.npv) + " at " + R },
        { key: "irr", color: "var(--lx-tier-4)", name: "Internal rate of return", asks: "What return does the project itself earn?", misses: "Size: a small project can have a higher IRR.", here: pct(s.irr, 2) },
        { key: "spb", color: COL.net, name: "Simple payback", asks: "When is the cash put in back?", misses: "Discounting and every year after it.", here: "year " + s.pb.simple },
        { key: "dpb", color: COL.today, name: "Discounted payback", asks: "The same, at the cost of money.", misses: "Every year after it.", here: "year " + s.pb.discounted },
        { key: "be", color: COL.sales, name: "Break-even price", asks: "Which price gives an NPV of zero?", misses: "Whether that price can be had.", here: usd(s.be) + "/MWh" }]
    });
    var sec = document.getElementById("explain"), seen = !("IntersectionObserver" in window) || !sec, dirty = false;
    if (!seen) new IntersectionObserver(function (es) { seen = es[0].isIntersecting; if (seen && dirty) { dirty = false; card.select(card.current() || "npv"); } }).observe(sec);
    return function () { if (seen) card.select(card.current() || "npv"); else dirty = true; };
  }

  // ---------------------------------------------------------------- practice drill (LX.Drill; this visit only)
  function drillView() {
    var host = document.getElementById("a1-drill"); if (!host) return; host.innerHTML = "";
    LX.Drill(host, { hint: "Six kinds of item in rotation: NPV, payback, IRR, WACC, break-even price and choosing between projects. A calculator helps; aim for twelve, about 25 minutes.",
                     empty: "Type a number first.", item: drillItem, unit: function (it) { return it.unit || ""; } });
  }

  LX.mount("a01", function (live, data, root) { view(live, data, root); });
}());
