// k03-discounting.js — Toolbox K3, "Exponentials and discounting" (step cards, Learn W2, 2026-11-03).
//
// Just-in-time math for lesson 7 (discounting, the capital recovery factor, LCOE) and for the yearly ("annualised") plant
// costs of lessons 12 and 13. Six step cards, an explain layer and a practice drill.
//
// Data (read through data-src, so the numbers stay in step with the lessons that use them):
//   assets/learn/data/07-cost.json      `discount` (lesson 7's step 3: $100, years 0/10/20/30, 7% a year, slider to 12%),
//                                       `techs.wind` (building cost $1,712/kW and fixed upkeep $34.57/kW-yr, EIA AEO2026
//                                       assumptions, Table 3, 2025 dollars) and `finance` (4% real, 30 years: 2025 ATB),
//                                       plus the illustrative WACC blend (5% loans, 10% owners, 60% loans, 2.5% inflation)
//   assets/learn/data/13-capstone.json  the same wind farm inputs and finance as lessons 12 and 13 (checked equal by the
//                                       test), and the battery's 15-year life
// Everything is in real 2025 dollars, so the rate is a real (after-inflation) rate, as in lessons 7 and 13.
//
// Model (closed form):
//   future value     FV = x (1 + r)^t;  simple growth (interest on the first amount only) = x (1 + r t)
//   present value    PV = x / (1 + r)^t                                   (lesson 7's pv)
//   annuity factor   AF(r, n) = sum over t = 1..n of 1 / (1 + r)^t = (1 − (1 + r)^−n) / r;  n when r = 0
//   capital recovery CRF(r, n) = r / (1 − (1 + r)^−n)                     (lesson 7's form)
//                              = r (1 + r)^n / ((1 + r)^n − 1)            (lesson 13's form); 1 / n when r = 0;  CRF = 1 / AF
//   yearly cost      $/kW-yr = CRF × building cost ($/kW) + fixed upkeep ($/kW-yr);  × 1,000 for $ per MW a year
//                    (lesson 13's costs(): 1000 × (capex × crf(wacc, life) + fom))
//   doubling time    ln 2 / ln(1 + r); the rule of 70: about 70 / (rate in %)
//   real rate        (1 + nominal) / (1 + inflation) − 1                  (lesson 7's realRate)
// Every number the page states comes from this model or the data files; _tests/learn/test_k03-discounting.js checks
// them against lessons 7 and 13 and against the page (it also writes the no-JS blocks: --write).
(function () {
  "use strict";

  // ---------------------------------------------------------------- pure model (no DOM; exported for Node)
  function fv(x, r, t) { return x * Math.pow(1 + r, t); }
  function simple(x, r, t) { return x * (1 + r * t); }
  function pv(x, r, t) { return x / Math.pow(1 + r, t); }
  function annuity(r, n) { return r === 0 ? n : (1 - Math.pow(1 + r, -n)) / r; }
  function annuitySum(r, n) { var s = 0; for (var t = 1; t <= n; t++) s += pv(1, r, t); return s; }
  function crf(r, n) { return r === 0 ? 1 / n : r / (1 - Math.pow(1 + r, -n)); }
  function crf13(r, n) { return r === 0 ? 1 / n : r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1); }
  function yearly(capex, fom, r, n) { var f = crf(r, n); return { crf: f, capital: f * capex, fom: fom, total: f * capex + fom, perMW: 1000 * (f * capex + fom) }; }
  function doubling(r) { return Math.log(2) / Math.log(1 + r); }
  function firstYearAt(x, r, target) { var t = 0; while (fv(x, r, t) < target - 1e-9 && t < 1000) t++; return t; }
  function realRate(nominal, inflation) { return (1 + nominal) / (1 + inflation) - 1; }

  // number formats shared by the page and the test (the test checks the page's text with these)
  function usd(v, d) { d = d == null ? 2 : d; return (v < 0 ? "−$" : "$") + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }); }
  function f4(v) { return v.toFixed(4); }
  function f5(v) { return v.toFixed(5); }
  function pct(v, d) { return (v * 100).toFixed(d == null ? 0 : d).replace(/\.0+$/, "") + "%"; }

  // the page's story numbers, from lesson 7's and lesson 13's data files
  function story(D7, D13) {
    var dc = D7.discount, w = D7.techs.wind, fin = D7.finance, s = {};
    s.amount = dc.amount; s.years = dc.years.slice(); s.rate = dc.rate / 100; s.rateMax = dc.rateMax;
    s.plantRate = fin.wacc / 100; s.life = fin.life; s.capex = w.capex; s.fom = w.fom;
    s.batteryLife = D13 ? D13.techs.battery.life : 15;
    s.grow10 = fv(s.amount, s.rate, 10); s.simple10 = simple(s.amount, s.rate, 10);
    s.grow30 = fv(s.amount, s.rate, 30);
    s.firstDouble = firstYearAt(s.amount, s.rate, 2 * s.amount); s.atFirstDouble = fv(s.amount, s.rate, s.firstDouble);
    s.simpleDouble = Math.ceil(1 / s.rate - 1e-9);      // simple growth adds r x each year: doubled after 1 / r = 14.3 years, so in year 15
    s.ratePct = dc.rate; s.doubling = doubling(s.rate); s.rule70 = Math.round(70 / dc.rate * 10) / 10;   // 70 / 7 = 10
    s.pvAt = function (r) { return s.years.map(function (t) { return pv(s.amount, r, t); }); };
    s.pv7 = s.pvAt(s.rate); s.pv4 = s.pvAt(s.plantRate);
    s.af = annuity(s.plantRate, s.life); s.lastDollar = pv(1, s.plantRate, s.life);
    s.payment = s.capex / s.af; s.crf = crf(s.plantRate, s.life);
    s.paidTotal = s.life * s.payment; s.returnPaid = s.paidTotal - s.capex;
    s.wind = yearly(s.capex, s.fom, s.plantRate, s.life);
    s.wind0 = yearly(s.capex, s.fom, 0, s.life);
    s.wind7 = yearly(s.capex, s.fom, s.rate, s.life);
    s.capShare = s.wind.capital / s.wind.total;
    s.crfBattery = crf(s.plantRate, s.batteryLife);
    // lesson 7's illustrative WACC blend, for the real-against-nominal box
    s.blendNominal = (fin.debtShare / 100 * fin.debtRate + (1 - fin.debtShare / 100) * fin.equityRate) / 100;
    s.inflation = fin.inflation / 100; s.blendReal = realRate(s.blendNominal, s.inflation);
    // the myth: doubling the rate from 3.5% to 7%
    s.half = { lo: s.rate / 2, pvLo: pv(s.amount, s.rate / 2, 30), pvHi: pv(s.amount, s.rate, 30) };
    s.half.cut = 1 - s.half.pvHi / s.half.pvLo;
    // the quiz: $100 in 20 years at 7%
    s.quiz = { pv20: pv(s.amount, s.rate, 20), simple20: s.amount / (1 + s.rate * 20), grow20: fv(s.amount, s.rate, 20) };
    return s;
  }

  // ---------------------------------------------------------------- the no-JS blocks (written into the page by the test)
  function staticBlocks(s) {
    var rows = s.years.map(function (t, i) {
      return "<tr><td>" + (t === 0 ? "Today" : "In " + t + " years") + "</td><td>" + usd(fv(s.amount, s.rate, t)) + "</td><td>" + usd(s.pv7[i]) + "</td><td>" + usd(s.pv4[i]) + "</td></tr>";
    }).join("\n");
    var money = '<table class="lx-facts k3-static" aria-label="$100 grown and discounted at 7% and 4% a year">\n' +
      '<thead><tr><th scope="col">When</th><th scope="col">$100 today grows at 7% to</th><th scope="col">$100 paid then is worth today, at 7%</th><th scope="col">… at 4%</th></tr></thead>\n<tbody>\n' + rows + "\n</tbody></table>";
    var rates = [0, s.plantRate, s.rate].map(function (r) {
      var y = yearly(s.capex, s.fom, r, s.life);
      return "<tr><td>" + pct(r) + "</td><td>" + f4(y.crf) + "</td><td>" + usd(y.capital) + "</td><td>" + usd(y.total) + "</td></tr>";
    }).join("\n");
    var crfT = '<table class="lx-facts k3-static" aria-label="The wind farm\'s yearly cost at three rates over ' + s.life + ' years">\n' +
      '<thead><tr><th scope="col">Rate (real)</th><th scope="col">CRF over ' + s.life + ' years</th><th scope="col">Repayment, $ per kW a year</th><th scope="col">Plus upkeep: yearly cost, $ per kW</th></tr></thead>\n<tbody>\n' + rates + "\n</tbody></table>";
    return { money: money, crf: crfT };
  }

  // ---------------------------------------------------------------- practice drill (seeded, so tests can replay it)
  function rng(seed) { var x = seed >>> 0 || 1; return function () { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; }
  var KINDS = ["grow", "discount", "double", "crf", "yearly", "compare"];
  var DOUBLE_RATES = [2, 3.5, 5, 7, 10, 14];
  function drillItem(k, r) {
    var kind = KINDS[k % KINDS.length], pick = function (a) { return a[Math.floor(r() * a.length)]; };
    if (kind === "grow" || kind === "discount") {
      var x = pick([100, 200, 500, 1000]), rate = pick([2, 3, 4, 5, 6, 7, 8, 10]), t = pick([5, 10, 15, 20, 25, 30]);
      var ans = kind === "grow" ? fv(x, rate / 100, t) : pv(x, rate / 100, t);
      return kind === "grow"
        ? { kind: kind, q: "$" + x + " grows at " + rate + "% a year for " + t + " years, interest left in. What is it then, to the nearest dollar?", answer: Math.round(ans), tol: 1, unit: "$",
            why: x + " × " + (1 + rate / 100).toFixed(2) + "^" + t + " = " + usd(ans) + "." }
        : { kind: kind, q: "What is $" + x + " paid in " + t + " years worth today at " + rate + "% a year, to the nearest dollar?", answer: Math.round(ans), tol: 1, unit: "$",
            why: x + " ÷ " + (1 + rate / 100).toFixed(2) + "^" + t + " = " + usd(ans) + "." };
    }
    if (kind === "double") {
      var dr = pick(DOUBLE_RATES), right = Math.round(70 / dr), wrong = [Math.round(100 / dr), Math.round(140 / dr), Math.round(35 / dr)];
      var opts = [right].concat(wrong.filter(function (v, i, a) { return v !== right && a.indexOf(v) === i; })).slice(0, 4);
      var order = opts.map(function (v) { return [r(), v]; }).sort(function (a, b) { return a[0] - b[0]; }).map(function (p) { return p[1]; });
      return { kind: kind, q: "At " + dr + "% a year, about how many years does an amount take to double?", choices: order.map(function (v) { return "about " + v + " years"; }), answer: order.indexOf(right),
               why: "The rule of 70: 70 ÷ " + dr + " ≈ " + right + " years (exactly " + doubling(dr / 100).toFixed(1) + ")." };
    }
    if (kind === "crf") {
      var cr = pick([0, 3, 4, 5, 6, 7, 8]), n = pick([10, 15, 20, 25, 30]), c = crf(cr / 100, n);
      return { kind: kind, q: "The capital recovery factor at " + cr + "% over " + n + " years, to four decimal places?", answer: +f4(c), tol: 0.0002,
               why: cr === 0 ? "At 0% it is 1 ÷ " + n + " = " + f4(c) + "." : cr / 100 + " ÷ (1 − " + (1 + cr / 100).toFixed(2) + "^−" + n + ") = " + f4(c) + "." };
    }
    if (kind === "yearly") {
      var cap = pick([1000, 1200, 1500, 1712, 2000, 2500]), fom = pick([10, 20, 30, 40]), yr = pick([4, 5, 6, 7]), yn = pick([20, 25, 30]);
      var cf = +f4(crf(yr / 100, yn)), tot = cf * cap + fom;
      return { kind: kind, q: "A plant costs $" + cap.toLocaleString("en-US") + " per kW to build and $" + fom + " per kW a year to keep up. With CRF = " + f4(cf) + " (" + yr + "%, " + yn + " years), its yearly cost per kW, to the nearest dollar?",
               answer: Math.round(tot), tol: 1, unit: "$", why: f4(cf) + " × " + cap.toLocaleString("en-US") + " + " + fom + " = " + usd(tot) + " per kW a year." };
    }
    // compare: which is worth more today?
    var now = pick([60, 70, 80]), later = 100, ct = pick([5, 10, 15, 20]), crate = pick([2, 4, 6, 8]);
    var v = pv(later, crate / 100, ct);
    if (Math.abs(v - now) < 3) { now = v > now ? now - 10 : now + 10; }
    var laterWins = v > now;
    return { kind: kind, q: "At " + crate + "% a year, which is worth more today: $" + now + " now, or $" + later + " in " + ct + " years?", choices: ["$" + now + " now", "$" + later + " in " + ct + " years"], answer: laterWins ? 1 : 0,
             why: "$" + later + " in " + ct + " years is worth " + usd(v) + " today, " + (laterWins ? "more" : "less") + " than $" + now + "." };
  }
  function drill(seed, n) { var r = rng(seed), out = []; for (var k = 0; k < n; k++) out.push(drillItem(k, r)); return out; }
  function close(v, ans, tol) { return v != null && Math.abs(v - ans) <= tol + 1e-9; }

  var model = { fv: fv, simple: simple, pv: pv, annuity: annuity, annuitySum: annuitySum, crf: crf, crf13: crf13, yearly: yearly,
                doubling: doubling, firstYearAt: firstYearAt, realRate: realRate, story: story, staticBlocks: staticBlocks,
                drill: drill, drillItem: drillItem, rng: rng, close: close, KINDS: KINDS, usd: usd, f4: f4, f5: f5, pct: pct };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;

  // ================================================================ view
  var LX = window.LX, H = LX.H;

  function numInput(host, o) {
    var id = LX.uid("in"), row = H("div", { class: "k3-ans" }, host);
    H("label", { for: id, text: o.label }, row);
    var inp = H("input", { id: id, type: "text", inputmode: "decimal", autocomplete: "off", class: "k3-num" }, row);
    if (o.unit) H("span", { class: "k3-unit", text: o.unit }, row);
    var btn = H("button", { type: "button", class: "lx-btn small", text: o.button || "Check" }, row);
    function go() { var v = parseFloat(String(inp.value).replace(/[−–]/g, "-").replace(/[$,\s]/g, "")); o.onCheck(isNaN(v) ? null : v, inp); }
    btn.addEventListener("click", go);
    inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); go(); } });
    return { input: inp, button: btn, go: go };
  }
  function textAlt(host, title, items) {
    var d = H("details", { class: "lx-textalt" }, host); H("summary", { text: title || "Text version" }, d);
    var ul = H("ul", null, d); (items || []).forEach(function (t) { H("li", { html: LX.rich(t) }, ul); });
    return { el: d, ul: ul, set: function (list) { ul.innerHTML = ""; list.forEach(function (t) { H("li", { html: LX.rich(t) }, ul); }); } };
  }
  function readouts(host, labels) {
    var box = H("div", { class: "lx-readouts", "aria-live": "polite" }, host), out = {};
    labels.forEach(function (l) { var d = H("div", { class: "lx-readout" }, box); H("span", { text: l[1] }, d); out[l[0]] = H("b", null, d); });
    return out;
  }
  var rateFmt = function (v) { return v.toFixed(1).replace(/\.0$/, "") + "% a year"; };

  function view(live, data, root) {
    var D7 = data["07_cost"], D13 = data["13_capstone"], s = story(D7, D13), steps = [], autos = {};
    var A = usd(s.amount, 0), R = pct(s.rate), R4 = pct(s.plantRate);

    // ---- step 1: growth compounds
    steps.push({
      text: "Put " + A + " in an account that pays " + R + " a year and leave the interest in. Each year adds " + R + " of what is there now. Slide the years: when does it first pass " + usd(2 * s.amount, 0) + "?",
      build: function (act, api) {
        var P = LX.Plot(act, { text: "Text version of the chart", box: true });
        var ro = readouts(act, [["c", "Compound: interest left in"], ["s", "Simple: " + R + " of the first " + A + " only"]]);
        var sl = LX.Slider(act, { label: "Years", color: "var(--lx-tier-2)", min: 0, max: 30, step: 1, value: 0, fmt: function (v) { return v + (v === 1 ? " year" : " years"); }, onChange: draw });
        var yrs = []; for (var t = 0; t <= 30; t++) yrs.push(t);
        function draw() {
          var y = sl.val(), c = fv(s.amount, s.rate, y), sm = simple(s.amount, s.rate, y);
          ro.c.textContent = usd(c); ro.s.textContent = usd(sm);
          P.render({ x: { min: 0, max: 30, ticks: [[0, "0"], [10, "10"], [20, "20"], [30, "30 years"]] },
            y: { min: 0, max: 800, step: 200, fmt: function (v) { return "$" + v; } }, height: 230, heightN: 200,
            lines: [{ values: yrs.map(function (t) { return fv(s.amount, s.rate, t); }), color: "var(--lx-tier-2)", area: 0.08 },
                    { values: yrs.map(function (t) { return simple(s.amount, s.rate, t); }), color: "var(--lx-ink-3)", dash: "5 4", width: 2 }],
            refs: [{ y: 2 * s.amount, label: "Doubled: " + usd(2 * s.amount, 0), dash: "3 4" }],
            marks: [{ x: y, y: c, label: usd(c, 0), kind: "dot", pos: "above" }],
            legend: [{ label: "Compound", color: "var(--lx-tier-2)" }, { label: "Simple", color: "var(--lx-ink-3)", dash: "5 4" }],
            aria: A + " at " + R + " a year: after " + y + " years, " + usd(c) + " with interest left in, " + usd(sm) + " with simple interest.",
            text: { head: ["Year", "Compound", "Simple"], rows: [0, 5, 10, 15, 20, 25, 30].map(function (t) { return [String(t), usd(fv(s.amount, s.rate, t)), usd(simple(s.amount, s.rate, t))]; }) } });
          if (c >= 2 * s.amount) {
            api.done();
            api.saw("It first passes " + usd(2 * s.amount, 0) + " in year " + s.firstDouble + " (" + usd(s.atFirstDouble) + "). The rule of 70: doubling takes about 70 ÷ " + s.ratePct + " = " + s.rule70 + " years (exactly " + s.doubling.toFixed(1) + "). Simple interest needs " + s.simpleDouble + ".");
          }
        }
        autos[0] = function () { sl.set(s.firstDouble, true); };
        draw();
      }
    });

    // ---- step 2: discounting is growth backwards
    steps.push({
      text: "Run it backwards. " + A + " that arrives in 10 years is worth the amount that would grow to " + A + " by then: " + A + " ÷ " + (1 + s.rate).toFixed(2) + "¹⁰. Type it to the cent.",
      build: function (act, api) {
        H("p", { class: "k3-eq", html: "today × " + (1 + s.rate).toFixed(2) + "<sup>10</sup> = " + A + "&nbsp;&nbsp;so&nbsp;&nbsp;today = " + A + " ÷ " + (1 + s.rate).toFixed(2) + "<sup>10</sup>" }, act);
        var tries = 0, want = s.pv7[1];
        var n = numInput(act, { label: "Worth today:", unit: "$", onCheck: function (v) {
          tries++;
          if (close(v, +want.toFixed(2), 0.015)) { api.done(); api.saw(usd(want) + " is the [[present-value|present value]] of " + A + " in 10 years: put " + usd(want) + " in today at " + R + " and it grows to " + A + "."); }
          else api.saw(tries < 2 ? "Not yet. Divide " + A + " by " + (1 + s.rate).toFixed(2) + " ten times (or by " + (1 + s.rate).toFixed(2) + "^10 = " + Math.pow(1 + s.rate, 10).toFixed(4) + ")." : A + " ÷ " + Math.pow(1 + s.rate, 10).toFixed(4) + " = " + usd(want) + ".", true);
        } });
        autos[1] = function () { n.input.value = want.toFixed(2); n.go(); };
      }
    });

    // ---- step 3: the rate matters most far ahead (lesson 7's step 3)
    steps.push({
      text: "Lessons 7 and 13 discount a plant's money at " + R4 + " after inflation. Slide the [[discount-rate|discount rate]] from " + R + " down to " + R4 + " and watch which bar grows most.",
      build: function (act, api) {
        var rows = H("div", { class: "k3-pv" }, act), bars = [];
        s.years.forEach(function (t) {
          var rw = H("div", { class: "k3-pvrow" }, rows);
          H("span", { text: t === 0 ? "Today" : "In " + t + " years" }, rw);
          var tr = H("span", { class: "k3-bar", "aria-hidden": "true" }, rw), fill = H("i", null, tr);
          bars.push({ fill: fill, b: H("b", null, rw), t: t });
        });
        var sl = LX.Slider(act, { label: "Discount rate", color: "var(--lx-tier-2)", min: 0, max: s.rateMax, step: 0.5, value: s.rate * 100, fmt: rateFmt, onChange: function () { draw(true); } });
        var alt = textAlt(act, "Text version");
        function draw(user) {
          var r = sl.val() / 100, list = [];
          bars.forEach(function (x) { var v = pv(s.amount, r, x.t); x.fill.style.width = v + "%"; x.b.textContent = usd(v); list.push(A + " " + (x.t === 0 ? "today" : "in " + x.t + " years") + " is worth " + usd(v) + " today at " + rateFmt(sl.val()) + "."); });
          alt.set(list);
          if (user && Math.abs(r - s.plantRate) < 1e-9) {
            api.done();
            api.saw("From " + R + " to " + R4 + ", " + A + " in 10 years rises from " + usd(s.pv7[1]) + " to " + usd(s.pv4[1]) + " (×" + (s.pv4[1] / s.pv7[1]).toFixed(2) + "); " + A + " in 30 years from " + usd(s.pv7[3]) + " to " + usd(s.pv4[3]) + " (×" + (s.pv4[3] / s.pv7[3]).toFixed(2) + "). Far-off money feels the rate most.");
          }
        }
        autos[2] = function () { sl.set(s.plantRate * 100, true); };
        draw(false);
      }
    });

    // ---- step 4: a stream of equal payments
    var GUESS = [{ v: s.life, label: "About " + usd(s.life, 0) }, { v: Math.round(s.af), label: "About " + usd(Math.round(s.af), 0) }, { v: Math.round(s.life * s.lastDollar), label: "About " + usd(Math.round(s.life * s.lastDollar), 0) }];
    steps.push({
      text: "A plant is paid off in equal yearly payments. What is $1 a year for " + s.life + " years worth today at " + R4 + "? Guess, then see each dollar discounted.",
      build: function (act, api) {
        var row = H("div", { class: "lx-choices-row", role: "group", "aria-label": "Your guess" }, act), btns = [];
        var box = H("div", { class: "k3-stream" }, act);
        GUESS.forEach(function (g, i) {
          var b = H("button", { type: "button", class: "lx-choice", "aria-pressed": "false", text: g.label }, row);
          b.addEventListener("click", function () {
            btns.forEach(function (x, j) { x.setAttribute("aria-pressed", j === i ? "true" : "false"); x.classList.toggle("right", j === i && g.v === Math.round(s.af)); x.classList.toggle("wrong", j === i && g.v !== Math.round(s.af)); });
            reveal(); api.done();
            api.saw((g.v === Math.round(s.af) ? "Right. " : "") + "The " + s.life + " discounted dollars add up to " + usd(s.af) + ", not " + usd(s.life, 0) + ": year " + s.life + "'s dollar is worth only " + usd(s.lastDollar) + " today. This sum is the [[annuity-factor|annuity factor]].");
          });
          btns.push(b);
        });
        var shown = false;
        function reveal() {
          if (shown) return; shown = true;
          var P = LX.Plot(box, { text: "Text version of the chart", box: true }), bars = [], tl = [];
          for (var t = 1; t <= s.life; t++) { var v = pv(1, s.plantRate, t); bars.push({ x0: t - 0.38, x1: t + 0.38, y0: 0, y1: v, color: "var(--lx-tier-2)" }); }
          for (t = 0; t <= s.life; t += 5) if (t) tl.push([String(t), usd(pv(1, s.plantRate, t))]);
          P.render({ x: { min: 0.4, max: s.life + 0.6, ticks: [[1, "year 1"], [10, "10"], [20, "20"], [s.life, String(s.life)]] }, y: { min: 0, max: 1, step: 0.25, fmt: function (v) { return "$" + v.toFixed(2); } },
            height: 200, heightN: 180, bars: bars, refs: [{ y: 1, label: "$1 paid", dash: "3 4" }], legend: false,
            aria: "Each $1 of " + s.life + " yearly payments, discounted at " + R4 + ": from " + usd(pv(1, s.plantRate, 1)) + " for year 1 to " + usd(s.lastDollar) + " for year " + s.life + "; together " + usd(s.af) + ".",
            text: { head: ["Year", "Worth today"], rows: tl, note: "All " + s.life + " together: " + usd(s.af) + "." } });
          H("p", { class: "k3-sum", html: "Sum of the " + s.life + " bars: <b>" + usd(s.af) + "</b>" }, box);
        }
        autos[3] = function () { btns[1].click(); };
      }
    });

    // ---- step 5: the capital recovery factor
    steps.push({
      text: "A wind farm costs " + usd(s.capex, 0) + " per kW to build. Which equal yearly payment for " + s.life + " years at " + R4 + " is worth " + usd(s.capex, 0) + " today? Divide by the annuity factor.",
      build: function (act, api) {
        H("p", { class: "k3-eq", html: usd(s.capex, 0) + " ÷ " + s.af.toFixed(2) + " = ? per kW a year" }, act);
        var tries = 0;
        var n = numInput(act, { label: "Yearly payment:", unit: "$ per kW", onCheck: function (v) {
          tries++;
          if (close(v, s.payment, 0.5)) {
            LX.store.set("k3-own", { rate: s.plantRate * 100, life: s.life });
            api.done(); api.saw(usd(s.payment) + " a year. 1 ÷ " + s.af.toFixed(2) + " = " + f5(s.crf) + " is the [[capital-recovery-factor|capital recovery factor]]: the share of the building cost repaid each year. The " + s.life + " payments total " + usd(s.paidTotal, 0) + ": " + usd(s.returnPaid, 0) + " pays lenders and owners for the wait.");
          } else api.saw(tries < 2 ? "Not yet. Divide the building cost by " + s.af.toFixed(2) + "." : usd(s.capex, 0) + " ÷ " + s.af.toFixed(2) + " = " + usd(s.payment) + ".", true);
        } });
        autos[4] = function () { n.input.value = s.payment.toFixed(2); n.go(); };
      }
    });

    // ---- step 6: add upkeep, and check r = 0
    steps.push({
      text: "Add the fixed upkeep, " + usd(s.fom) + " per kW a year: that is the yearly cost lessons 12 and 13 put in their planning model. Then check the factor: set the rate to 0%.",
      build: function (act, api) {
        var ro = readouts(act, [["crf", "Capital recovery factor"], ["cap", "Repayment, $ per kW a year"], ["tot", "Plus upkeep: yearly cost, $ per kW"], ["mw", "Per MW a year"]]);
        var slR = LX.Slider(act, { label: "Rate (real)", color: "var(--lx-tier-2)", min: 0, max: 10, step: 0.5, value: s.plantRate * 100, fmt: rateFmt, onChange: draw });
        var slN = LX.Slider(act, { label: "Years to pay it off", color: "var(--lx-tier-5)", min: 10, max: 40, step: 1, value: s.life, fmt: function (v) { return v + " years"; }, onChange: draw });
        var bat = H("button", { type: "button", class: "lx-btn ghost small", text: "Try " + s.batteryLife + " years, lesson 13's battery life" }, act);
        bat.addEventListener("click", function () { slN.set(s.batteryLife, true); });
        var note = H("p", { class: "k3-note", "aria-live": "polite" }, act), zero = false;
        function draw() {
          var r = slR.val() / 100, n = slN.val(), y = yearly(s.capex, s.fom, r, n);
          ro.crf.textContent = f4(y.crf); ro.cap.textContent = usd(y.capital); ro.tot.textContent = usd(y.total); ro.mw.textContent = usd(y.perMW, 0);
          note.textContent = f4(y.crf) + " × " + usd(s.capex, 0) + " + " + usd(s.fom) + " = " + usd(y.total) + " per kW a year, at " + rateFmt(slR.val()) + " over " + n + " years.";
          LX.store.set("k3-own", { rate: slR.val(), life: n });
          if (r === 0 && !zero) {
            zero = true; api.done();
            api.saw("At 0%, CRF = 1 ÷ " + n + " = " + f4(1 / n) + ": the cost is simply split evenly. At " + R4 + " over " + s.life + " years it is " + f4(s.crf) + ", or " + usd(s.wind.perMW, 0) + " per MW a year with upkeep, the number lessons 12 and 13 use.");
          }
        }
        autos[5] = function () { slN.set(s.life); slR.set(0, true); };
        draw();
      }
    });

    var cards = LX.StepCards(live, { id: "k3-steps", steps: steps, onStep: function () { LX.emit("layout"); } });
    LX.demo(root, function (state) {   // "mid" = step 3 at 4%; "step-N" = card N with its action done; "done" = the last card done
      var k = state === "mid" ? 2 : state === "done" ? steps.length - 1 : /^step-(\d+)$/.test(state) ? Math.max(0, Math.min(steps.length - 1, +state.slice(5) - 1)) : -1;
      if (k < 0) return null;
      cards.go(k); if (autos[k]) autos[k]();
      return { view: "step " + (k + 1) };
    }, cards);

    explain(s);
    drillView();
  }

  // ---------------------------------------------------------------- explain layer
  function explain(s) {
    var x = document.getElementById("k3-explain"); if (!x) return; x.innerHTML = "";
    function own() { var o = LX.store.get("k3-own"); return o && o.rate != null && o.life ? o : null; }
    function you(kind) {
      return function () {
        var o = own(), r = o ? o.rate / 100 : s.plantRate, n = o ? o.life : s.life, y = yearly(s.capex, s.fom, r, n);
        var head = o ? "Your last setting: " : "The wind farm: ";
        if (kind === "crf") return head + "CRF(" + pct(r, 1) + ", " + n + ") = " + f4(y.crf) + ".";
        if (kind === "r") return head + pct(r, 1) + " a year (real).";
        if (kind === "n") return head + n + " years.";
        if (kind === "A") return head + f4(y.crf) + " × " + usd(s.capex, 0) + " + " + usd(s.fom) + " = " + usd(y.total) + " per kW a year.";
        return null;
      };
    }
    LX.EquationCard(H("div", { class: "lx-xcard" }, x), {
      title: "The capital recovery factor", lede: "Tap a symbol: its meaning, its unit and your own numbers from step 6.",
      rows: [
        { parts: [{ k: "crf" }, "=", { frac: [[{ k: "r" }], ["1 − (1 + ", { k: "r" }, ")", { html: "<sup>−</sup>" }, { k: "n" }]] }],
          say: "CRF equals r divided by one minus one plus r to the power minus n.", note: "the same as r(1 + r)ⁿ ÷ ((1 + r)ⁿ − 1); 1 ÷ n when r = 0" },
        { parts: [{ k: "A" }, "=", { k: "crf" }, "×", { k: "C" }, "+", { k: "fom" }], say: "Yearly cost equals CRF times the building cost, plus fixed upkeep.", tag: "yearly cost" }],
      symbols: {
        crf: { sym: "CRF", name: "Capital recovery factor", unit: "per year", color: "var(--lx-tier-2)", words: "The share of the building cost repaid each year so it is paid off, with the return, over n years.", you: you("crf"), code: "r / (1 - (1 + r) ** -n)" },
        r: { sym: "r", name: "Discount rate (real)", unit: "a fraction per year", color: "var(--lx-tier-5)", words: "The yearly return the money could earn elsewhere; 4% is written 0.04.", you: you("r"), code: "r = 0.04" },
        n: { sym: "n", name: "Years to pay off", unit: "years", color: "var(--lx-tier-3)", words: "The cost recovery period: " + s.life + " years for plants in lessons 7, 12 and 13, " + s.batteryLife + " for lesson 13's battery.", you: you("n"), code: "n = 30" },
        A: { sym: "A", name: "Yearly cost", unit: "$ per kW a year", color: "var(--lx-ink)", words: "What one kW of the plant costs each year before any fuel: repayment plus upkeep.", you: you("A"), code: "A = crf * C + fom" },
        C: { sym: "C", name: "Building cost", unit: "$ per kW", color: "var(--lx-tier-4)", words: "The [[overnight-cost|overnight]] building cost: " + usd(s.capex, 0) + " per kW for the wind farm (EIA, 2025 dollars).", code: "C = 1712" },
        fom: { sym: "FOM", name: "Fixed upkeep", unit: "$ per kW a year", color: "var(--lx-tier-1)", words: "[[fixed-om|Fixed operation and maintenance]]: paid every year whether the plant runs or not; " + usd(s.fom) + " for the wind farm.", code: "fom = 34.57" } },
      fields: [{ key: "you", label: "Your numbers" }, { key: "code", label: "In code", code: true }],
      sel: "crf", hint: "Lesson 7's LCOE divides A by the MWh each kW makes in a year."
    });
    LX.CompareTable(H("div", { class: "lx-xcard k3-stack" }, x), {
      title: "Four moves with money over time", text: true,
      columns: [{ key: "name", label: "Move", main: true }, { key: "rule", label: "Rule" }, { key: "ex", label: "On this page" }, { key: "used", label: "Used in", phoneHide: true }],
      rows: [
        { key: "grow", color: "var(--lx-tier-2)", name: "Grow", note: "now → later", rule: "× (1 + r)<sup>t</sup>", ex: usd(s.amount, 0) + " at " + pct(s.rate) + ": " + usd(s.grow10) + " in 10 years", used: "returns, loans" },
        { key: "disc", color: "var(--lx-tier-5)", name: "Discount", note: "later → now", rule: "÷ (1 + r)<sup>t</sup>", ex: usd(s.amount, 0) + " in 10 years: " + usd(s.pv7[1]) + " today", used: "lesson 7, step 3" },
        { key: "stream", color: "var(--lx-tier-3)", name: "Add a stream", note: "yearly → now", rule: "× annuity factor", ex: "$1 a year for " + s.life + " years at " + pct(s.plantRate) + ": " + usd(s.af), used: "lesson 7, step 5" },
        { key: "spread", color: "var(--lx-tier-4)", name: "Spread", note: "now → yearly", rule: "× CRF", ex: usd(s.capex, 0) + " per kW: " + usd(s.payment) + " a year", used: "lessons 7, 12 and 13" }]
    });
    LX.CausalChain(H("div", { class: "lx-xcard" }, x), {
      title: "Raise the rate from " + pct(s.plantRate) + " to " + pct(s.rate)
      , links: [
        { title: "Far-off money shrinks", text: "Each later dollar is divided by a bigger (1 + r)^t.", value: usd(s.amount, 0) + " in 30 years: " + usd(s.pv4[3]) + " → " + usd(s.pv7[3]) },
        { title: "Repayments must grow", text: "The same building cost needs a larger yearly share.", value: "CRF " + f4(s.crf) + " → " + f4(s.wind7.crf) },
        { title: "The yearly cost rises", text: "Upkeep stays; the repayment part grows.", value: usd(s.wind.total) + " → " + usd(s.wind7.total) + " per kW" },
        { title: "Building-heavy plants feel it most", text: "Wind's yearly cost is mostly repayment, so its LCOE moves more than a gas plant's (lesson 7, step 4).", value: pct(s.capShare) + " of it is repayment at " + pct(s.plantRate) }],
      note: "All in real 2025 dollars; the wind farm's inputs are EIA's, the rates as in lessons 7 and 13."
    });
  }

  // ---------------------------------------------------------------- practice drill (this browser only)
  function drillView() {
    var host = document.getElementById("k3-drill"); if (!host) return; host.innerHTML = "";
    var seed = (Date.now() % 100000) + 1, r = rng(seed), k = 0, right = 0, done = 0;
    var card = H("div", { class: "lx-card k3-drill" }, host);
    var top = H("div", { class: "lx-x-head" }, card); H("h3", { text: "Practice drill" }, top);
    var score = H("span", { class: "lx-step-n", "aria-live": "polite", text: "0 done" }, top);
    H("p", { class: "lx-hint", text: "Six kinds of item in rotation, new numbers each time; a calculator helps. Aim for twelve, about 15 minutes." }, card);
    var box = H("div", { class: "k3-drill-q" }, card);
    var next = H("button", { type: "button", class: "lx-btn ghost small", html: "Next item" + LX.icon("arrow") }, card);
    function show(focus) {
      var it = drillItem(k, r); k++; box.innerHTML = "";
      var qp = H("p", { class: "lx-qtext", tabindex: "-1", text: it.q }, box);
      var fb = H("div", { "aria-live": "polite" }, box), answered = false;
      function mark(ok) {
        if (answered) return; answered = true; done++; if (ok) right++;
        score.textContent = right + " of " + done + " right";
        fb.innerHTML = ""; H("div", { class: "lx-saw" + (ok ? "" : " no"), html: LX.icon(ok ? "check" : "question") + "<div><b>" + (ok ? "Right." : "Not quite.") + "</b> " + LX.esc(it.why) + "</div>" }, fb);
      }
      if (it.choices) {
        var row = H("div", { class: "lx-qbtns" }, box);
        it.choices.forEach(function (c, i) { var b = H("button", { type: "button", class: "lx-choice", text: c }, row); b.addEventListener("click", function () { if (!answered) { b.classList.add(i === it.answer ? "right" : "wrong"); mark(i === it.answer); } }); });
        box.insertBefore(row, fb);
      } else {
        var n = numInput(box, { label: "Answer", unit: it.unit === "$" ? "$" : "", onCheck: function (v) { if (v == null) { fb.textContent = "Type a number first."; return; } mark(close(v, it.answer, it.tol)); } });
        box.insertBefore(n.input.parentNode, fb);
      }
      if (focus) qp.focus();
    }
    next.addEventListener("click", function () { show(true); });
    show(false);
  }

  LX.mount("k03", function (live, data, root) { view(live, data, root); });
})();
