// f08-large-loads.js — Lesson F8, "What happens when a data center moves to town?" (step cards, Foundations, D1).
// A data center appears only as a load.
//
// Data: assets/learn/data/f08-large-loads.json (the campus, the sliders' ranges, the sourced real-world numbers, the
// numbers to remember), town_days.json (29 July and 17 April 2025) and town_year.json (every hour of 2025) on the
// Southwest Power Pool grid, from EIA-930, as shapes in thousandths of SPP's 2025 peak hour, and path.json (lesson links
// that appear once a lesson is live).
//
// Model (closed form; no optimization):
//   the town      demand_t = shape_t / 1000 x 450 MW (Prairie Town's highest hour of 2025 is 450 MW, as in lessons 0 and
//                 2); a day's hours in whole MW, the year's 8,760 hours unrounded. Hour h means h:00 to h+1:00.
//   the campus    illustrative: a 300 MW contract (the most it may draw) and a steady 240 MW in every hour of the year
//                 (80% of the contract). Flat by assumption: real campuses vary a little with cooling and workload.
//   a day         with the campus: demand_t + 240; the busiest hour (unrounded shape, unique on both days), the quietest
//                 hour, the campus's share of the day's MWh = 240 x 24 / (sum demand_t + 240 x 24), the hours above the
//                 town's 2025 record (450 MW)
//   the year      the town's 8,760 hours sorted from highest to lowest (its load-duration curve), with and without the
//                 campus; load factor = average / peak; hours above the record; the campus's MWh = 240 x 8,760
//   homes         an annual-energy equivalent: MW x 8,760 h x 1,000 / 10,791 kWh (EIA's average U.S. home, 2022);
//                 shown to the nearest thousand. Not a peak equivalent: homes do not all draw their most at once.
//   requests      ERCOT's large-load requests (about 474 GW, June 2026) / its record peak (91,134 MW, preliminary)
//   the wait      illustrative: the campus takes 24 months to build; idle months = max(0, grid month - 24)
//   jobs and tax  learner-set rough inputs, illustrative: job-years = workers x 24 months / 12 (the build time);
//                 permanent jobs as set; local tax a year = taxable value x rate (a transfer, owner to local budgets)
// Every number on the page comes from this model or from the data file; _tests/learn/test_f08-large-loads.js checks them.
//
// Shared components: LX.StepCards, LX.Plot, LX.Predict, LX.Guess, LX.UnitChain, LX.Slider, LX.Toggle, LX.Stakeholders,
// LX.CausalChain, LX.CompareTable, LX.lessonRefHTML. Lesson-local: the wait bars (f8-wait) and the three tabs of step 7.
(function () {
  "use strict";
  var KEY = "f08_large_loads";

  // ---------------------------------------------------------------- pure model (no DOM; exported for Node)
  function sum(a) { return a.reduce(function (s, v) { return s + v; }, 0); }
  function argmax(a) { var k = 0; a.forEach(function (v, i) { if (v > a[k]) k = i; }); return k; }
  function argmin(a) { var k = 0; a.forEach(function (v, i) { if (v < a[k]) k = i; }); return k; }
  function fmtN(v, d) { return Number(v).toLocaleString("en-US", { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
  function pct(v) { return fmtN(100 * v) + "%"; }
  function hm(h) { return (h < 10 ? "0" : "") + h + ":00"; }
  function span(h) { return hm(h) + "–" + hm(h + 1); }

  // one named day: the town in whole MW, and the campus on top
  function day(D, days, which) {
    var d = D.days[which], shape = days.days[d.key].demand, P = D.town.peakMW, draw = D.campus.drawMW;
    var mw = shape.map(function (s) { return Math.round(s / 1000 * P); });
    var tot = mw.map(function (v) { return v + draw; });
    var e = sum(mw), pk = argmax(shape), lo = argmin(shape);
    return { which: which, label: d.label, short: d.short, mw: mw, tot: tot, peak: mw[pk], peakHour: pk, min: mw[lo], minHour: lo,
             newPeak: mw[pk] + draw, newMin: mw[lo] + draw, atContract: mw[pk] + D.campus.contractMW, energy: e,
             share: draw * 24 / (e + draw * 24), above: tot.filter(function (v) { return v > P; }).length };
  }
  // the year: the town's 8,760 hours, sorted, with and without the campus
  function yearStats(D, year) {
    var P = D.town.peakMW, draw = D.campus.drawMW, town = year.demand.map(function (s) { return s / 1000 * P; }), n = town.length;
    var E = sum(town), peak = Math.max.apply(null, town), min = Math.min.apply(null, town);
    var sorted = town.slice().sort(function (a, b) { return b - a; });
    var above = town.filter(function (v) { return v + draw > P; }).length;
    return { n: n, town: town, sorted: sorted, energy: E, avg: E / n, peak: peak, min: min, lf: E / n / peak,
             withAvg: E / n + draw, withPeak: peak + draw, withMin: min + draw, withLf: (E / n + draw) / (peak + draw),
             above: above, aboveTown: town.filter(function (v) { return v > P; }).length,
             campusMWh: draw * n, share: draw * n / E };
  }
  function homes(drawMW, hours, kwhPerHome) { return drawMW * hours * 1000 / kwhPerHome; }
  function roundK(v) { return Math.round(v / 1000) * 1000; }
  function nearestTick(ticks, v) {   // the tick nearest on a log scale (the guess scale grows tenfold)
    var k = 0; ticks.forEach(function (t, i) { if (Math.abs(Math.log(t / v)) < Math.abs(Math.log(ticks[k] / v))) k = i; }); return k;
  }
  function ratio(D) { return D.ercot.requestsGW * 1000 / D.ercot.peakMW; }
  function idle(D, grid) { return Math.max(0, grid - D.wait.buildMonths); }
  function jobYears(D, crew) { return crew * D.wait.buildMonths / 12; }
  function taxM(value, rate) { return Math.round(value * rate) / 100; }   // $M a year; rate in %, to 0.1

  // ---------------------------------------------------------------- the words the page shows (pure, tested)
  var WHEN = {
    q: "When would the campus add the most to the town's demand?",
    options: [{ value: "night", label: "Mostly at night" }, { value: "flat", label: "In every hour, by a similar amount" }, { value: "peak", label: "Mostly in the busiest hours" }],
    answer: "flat",
    feedback: {
      night: "Data centers run around the clock, so they draw power at the busiest hour as well as at night.",
      flat: "Data centers run around the clock; the grid operator PJM calls such loads 24/7 and hardly moved by the weather.",
      peak: "Data centers hardly follow the weather or the clock, so they draw power in every hour, the busiest included."
    }
  };
  // running around the clock is not the same as a constant draw: the steady 240 MW is this lesson's assumption
  function whenAssume(D) {
    return "Around the clock is not the same as constant: real campuses vary with computing work and cooling. This lesson simplifies to a steady " + D.campus.drawMW + " MW in every hour.";
  }
  function dayLine(D, s) {
    return s.label + ": the campus is **" + pct(s.share) + "** of the day's electricity. The quietest hour goes from " + s.min + " to " + s.newMin + " MW, " +
      (s.newMin > D.town.peakMW ? "above" : "below") + " the town's 2025 record of " + D.town.peakMW + " MW.";
  }
  function daysSaw(D, a, b) {
    return "On the mild day the campus is a bigger share: **" + pct(b.share) + "** against " + pct(a.share) + ". PJM warns that quiet seasons, once used for maintenance, can become times of stress (2026).";
  }
  function homesChain(D, Y, drawMW) {
    var mwh = drawMW * Y.n, h = homes(drawMW, Y.n, D.home_year.value);
    return [{ v: fmtN(drawMW) + " MW", u: "all year" }, { op: "× " + fmtN(Y.n) + " h =" }, { v: fmtN(mwh) + " MWh", u: "a year" },
            { op: "÷ " + fmtN(D.home_year.value / 1000, 3) + " MWh a home =" }, { v: "about " + fmtN(roundK(h)), u: "homes' yearly purchases", out: true }];
  }
  function homesLine(D, Y, drawMW) {
    var h = homes(drawMW, Y.n, D.home_year.value);
    return fmtN(drawMW) + " MW all year is as much electricity as about **" + fmtN(roundK(h)) + "** average U.S. homes buy in a year, and " + pct(drawMW * Y.n / Y.energy) + " of what Prairie Town uses.";
  }
  var HOMES_WHATIF = "A what-if for this step only: the next steps keep the campus at its steady 240 MW.";
  var HOMES_NOTE = "This compares a year's energy, not the power in any one hour.";
  function yearLine(D, Y) {
    return "With the campus, this profile is above the town's old record in **" + fmtN(Y.above) + " of " + fmtN(Y.n) + "** hours. The quietest hour rises from " + fmtN(Y.min) + " to " + fmtN(Y.withMin) + " MW.";
  }
  function yearSaw(D, Y) {
    return "With the campus, this profile is above the town's old record in **" + fmtN(Y.above) + " of " + fmtN(Y.n) + "** hours. The quietest hour rises from " + fmtN(Y.min) + " to " + fmtN(Y.withMin) + " MW, and the [[load-factor|load factor]] from " + pct(Y.lf) + " to " + pct(Y.withLf) + ".";
  }
  var ERCOT_TICKS = ["Half", "Equal", "2 times", "5 times", "10 times"];
  function ercotLine(D) {
    var E = D.ercot;
    return fmtN(E.requestsGW) + " GW ÷ " + fmtN(E.peakMW / 1000, 1) + " GW = **" + fmtN(ratio(D), 1) + " times** the record, and about " + pct(E.dcShare) + " are data centers. Requests are proposals, not committed demand: projects may change or be cancelled.";
  }
  function waitLine(D, grid) {
    var b = D.wait.buildMonths, i = idle(D, grid);
    if (i > 0) return "The campus is built after " + b + " months but waits " + i + " more for grid service. Each idle month it earns nothing, while the money spent on it still costs interest.";
    if (grid < b) return "Grid service would come " + (b - grid) + " months before the campus is finished: no idle months for the building, but the new wires wait for their customer.";
    return "Built and connected at the same time: no idle months.";
  }
  function jobsLine(D, crew, staff) {
    return fmtN(crew) + " workers for " + D.wait.buildMonths + " months make **" + fmtN(jobYears(D, crew)) + " [[job-year|job-years]]**; then " + fmtN(staff) + " permanent jobs. Job-years end when building ends; permanent jobs last as long as the campus runs.";
  }
  function taxLine(D, value, rate) {
    return "$" + fmtN(value) + "M of taxable property at " + fmtN(rate, 1) + "% pays **$" + fmtN(taxM(value, rate), 1) + "M a year** to local budgets: a [[transfer|transfer]] from the owner to schools and services, not new wealth.";
  }
  var TAX_NOTE = "Illustrative: real values, rates and any tax breaks differ by place. $M means millions of dollars.";
  function coolLine(c) { return c.name + ": " + c.water + "; " + c.power + "."; }
  var PAY = {
    options: [{ value: "company", label: "The company that cancelled" }, { value: "others", label: "The utility's other customers" }, { value: "nobody", label: "Nobody" }],
    answer: "others",
    feedback: {
      company: "Only if its contract says so: with no special terms, the cost can land on the utility's other customers.",
      others: "With no special terms, the cost can land on the utility's other customers.",
      nobody: "Wires cost money whether or not anyone uses them: with no special terms, the cost can land on the utility's other customers."
    },
    extra: "A [[large-load-tariff|large-load tariff]] can make the company pay instead, through a minimum bill or an exit fee ([[lesson:a04-retail-tariffs|A4]])."
  };
  var PAY_ASSUME = "regulators let the utility recover such costs from customers, and the contract has no special terms.";
  var SAW7 = "Water, jobs and taxes are local gains and costs that the grid's numbers do not show. Each is a rough estimate: its inputs are yours.";
  var WATER_HINTS = ["Which design a campus uses changes what it asks of the town's water, and of the grid.",
    "A closed water loop inside the building can still send its heat out through an evaporative cooling tower (U.S. Department of Energy)."];

  // the no-JS version (the test writes it into the page between the f08-fallback markers)
  function staticFallback(D, days, year) {
    var a = day(D, days, "summer"), b = day(D, days, "spring"), Y = yearStats(D, year), c = D.campus;
    var row = function (s) { return "<tr><td>" + s.label + "</td><td>" + s.peak + " MW</td><td>" + s.min + " MW</td><td>" + s.newPeak + " MW and " + s.newMin + " MW</td><td>" + pct(s.share) + "</td></tr>"; };
    var h = homes(c.drawMW, Y.n, D.home_year.value);
    return "<p class=\"lx-eyebrow\">The idea in one table: a " + c.contractMW + " MW data center joins Prairie Town (illustrative)</p>" +
      "<p class=\"lx-hint\">The town's demand on two real-shape days, and with the campus's steady " + c.drawMW + " MW (this lesson's assumption) added to every hour.</p>" +
      "<div class=\"lx-scroll-x\"><table class=\"lx-mini-table f8-fbt\">" +
      "<thead><tr><th scope=\"col\">Day</th><th scope=\"col\">Town's busiest hour</th><th scope=\"col\">Town's quietest hour</th><th scope=\"col\">With the campus: busiest and quietest</th><th scope=\"col\">Campus share of the day</th></tr></thead>" +
      "<tbody>" + row(a) + row(b) + "</tbody></table></div>" +
      "<ul>" +
      "<li><b>Its contract.</b> Up to " + c.contractMW + " MW: on " + a.label + " the busiest hour could reach " + a.atContract + " MW.</li>" +
      "<li><b>Homes.</b> " + fmtN(c.drawMW) + " MW all year is " + fmtN(c.drawMW * Y.n) + " MWh: as much as about " + fmtN(roundK(h)) + " average U.S. homes buy in a year (" + fmtN(D.home_year.value) + " kWh each), and " + pct(Y.share) + " of the town's own use.</li>" +
      "<li><b>The year.</b> With the campus, this 2025 profile is above the town's record in " + fmtN(Y.above) + " of " + fmtN(Y.n) + " hours; the load factor rises from " + pct(Y.lf) + " to " + pct(Y.withLf) + ".</li>" +
      "<li><b>Requests.</b> ERCOT counted about " + fmtN(D.ercot.requestsGW) + " GW of large loads asking to connect (" + D.ercot.asOf + "), " + fmtN(ratio(D), 1) + " times its record peak of " + fmtN(D.ercot.peakMW) + " MW: proposals, not committed demand.</li>" +
      "<li><b>The wait.</b> Built in " + D.wait.buildMonths + " months, connected after " + D.wait.grid.start + ": " + idle(D, D.wait.grid.start) + " idle months.</li>" +
      D.cooling.map(function (c) { return "<li><b>" + c.name + ".</b> " + c.water.charAt(0).toUpperCase() + c.water.slice(1) + "; " + c.power + ".</li>"; }).join("") +
      "<li><b>A closed loop.</b> " + WATER_HINTS[1] + "</li>" +
      "<li><b>Jobs and taxes.</b> " + fmtN(D.jobs.crew.start) + " workers for " + D.wait.buildMonths + " months make " + fmtN(jobYears(D, D.jobs.crew.start)) + " job-years, then " + D.jobs.staff.start + " permanent jobs; $" + fmtN(D.tax.value.start) + "M of property at " + fmtN(D.tax.rate.start, 1) + "% pays $" + fmtN(taxM(D.tax.value.start, D.tax.rate.start), 1) + "M a year in local tax (illustrative).</li>" +
      "<li><b>Who pays.</b> If the utility builds wires for the campus and the company cancels, the cost can land on other customers, unless a large-load tariff makes the company pay.</li>" +
      "</ul><p class=\"lx-hint\">With JavaScript on, you work through this step by step: the day, a spring day, the homes, the year, the requests, the wait, water, jobs and taxes, and who pays.</p>";
  }

  var model = { day: day, yearStats: yearStats, homes: homes, roundK: roundK, nearestTick: nearestTick, ratio: ratio, idle: idle, jobYears: jobYears, taxM: taxM,
    WHEN: WHEN, whenAssume: whenAssume, HOMES_WHATIF: HOMES_WHATIF, WATER_HINTS: WATER_HINTS, dayLine: dayLine, daysSaw: daysSaw, homesChain: homesChain, homesLine: homesLine, HOMES_NOTE: HOMES_NOTE, yearLine: yearLine,
    yearSaw: yearSaw, ERCOT_TICKS: ERCOT_TICKS, ercotLine: ercotLine, waitLine: waitLine, jobsLine: jobsLine, taxLine: taxLine, TAX_NOTE: TAX_NOTE, coolLine: coolLine,
    PAY: PAY, PAY_ASSUME: PAY_ASSUME, SAW7: SAW7, staticFallback: staticFallback, fmtN: fmtN, pct: pct, hm: hm, span: span };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H;
  var TOWN = "var(--lx-demand)", CAMPUS = "var(--lx-tier-3)";

  LX.mount("large-loads", function (live, data, root) {
    var D = data[KEY], days = data.town_days, year = data.town_year, P = data.path;
    var DAY = { summer: day(D, days, "summer"), spring: day(D, days, "spring") }, Y = yearStats(D, year);
    var S = { grid: D.wait.grid.start, crew: D.jobs.crew.start, staff: D.jobs.staff.start, value: D.tax.value.start, rate: D.tax.rate.start, draw: D.campus.drawMW };
    var saved = LX.store.get("f08");
    function inRange(v, r) { return typeof v === "number" && v >= r.min - 1e-9 && v <= r.max + 1e-9; }
    if (saved) {
      if (inRange(saved.grid, D.wait.grid)) S.grid = saved.grid;
      if (inRange(saved.crew, D.jobs.crew)) S.crew = saved.crew;
      if (inRange(saved.staff, D.jobs.staff)) S.staff = saved.staff;
      if (inRange(saved.value, D.tax.value)) S.value = saved.value;
      if (inRange(saved.rate, D.tax.rate)) S.rate = saved.rate;
    }
    function keep() { LX.store.set("f08", { grid: S.grid, crew: S.crew, staff: S.staff, value: S.value, rate: S.rate }); }
    var demo = [];   // per step: a function that does the step's action (screenshots and the demo hook)

    function chips(host, list) {
      host.innerHTML = "";
      list.forEach(function (x) { var c = H("div", { class: "lx-readout" + (x[2] ? " " + x[2] : "") }, host); H("span", { text: x[0] }, c); H("b", { text: x[1] }, c); });
    }
    // one day's chart: the town's demand, and the campus as a band on top of it
    function dayChart(Pl, s, on) {
      var bars = on ? s.mw.map(function (v, t) { return { x0: t, x1: t + 1, y0: v, y1: v + D.campus.drawMW, color: CAMPUS, op: 0.42, rx: 0 }; }) : [];
      Pl.render({
        x: { min: 0, max: 24, ticks: [[0, "00:00"], [6, "06:00"], [12, "12:00"], [18, "18:00"], [24, "24:00"]], ticksN: [[0, "0"], [6, "6"], [12, "12"], [18, "18"], [24, "24 h"]] },
        y: { min: 0, max: 800, step: 200, fmt: function (v) { return fmtN(v); }, unit: "MW" }, height: 240, heightN: 210, bars: bars,
        lines: [{ values: s.mw, step: 1, color: TOWN, width: 2.6, area: 0.14 }].concat(on ? [{ values: s.tot, step: 1, color: CAMPUS, width: 2 }] : []),
        // with the campus on, the record line runs through its band: its words move to the legend (the course's contrast rule)
        refs: [on ? { y: D.town.peakMW, dash: "5 4", color: "var(--lx-ink-3)" } : { y: D.town.peakMW, label: "Town's 2025 record, " + D.town.peakMW + " MW", labelN: D.town.peakMW + " MW", dash: "5 4", color: "var(--lx-ink-3)" }],
        legend: [{ label: "Prairie Town's demand on " + s.label + " (real SPP shape, scaled)", color: TOWN }].concat(on ? [{ label: "The campus: " + D.campus.drawMW + " MW in every hour (illustrative)", color: CAMPUS },
                 { label: "The town's 2025 record, " + D.town.peakMW + " MW", color: "var(--lx-ink-3)", dash: "5 4" }] : []),
        aria: "Prairie Town's demand on " + s.label + ", hour by hour: from " + s.min + " to " + s.peak + " MW" + (on ? "; with the campus, from " + s.newMin + " to " + s.newPeak + " MW" : "") + ".",
        text: { head: ["Hour", "Town (MW)"].concat(on ? ["With the campus (MW)"] : []), rows: s.mw.map(function (v, t) { return [span(t), String(v)].concat(on ? [String(s.tot[t])] : []); }) }
      });
    }

    var steps = [
      { text: "A company asks to connect a 300 MW [[data-center|data center]] in Prairie Town; here is the town's busiest day of 2025. When would the campus add the most to the town's demand?",
        build: function (act, api) {
          var s = DAY.summer, Pl = LX.Plot(H("div", null, act), { text: "Text version of the chart", legend: true });
          var ro = H("div", { class: "lx-readouts", "aria-live": "polite" }, act);
          var pr = LX.Predict(act, { id: "f8-when", q: WHEN.q, title: false, answer: WHEN.answer, options: WHEN.options, feedback: WHEN.feedback, onPick: function () { show(true); } });
          var as = H("p", { class: "lx-hint" }, act);
          function show(on) {
            dayChart(Pl, s, on);
            if (!on) { ro.innerHTML = ""; as.textContent = ""; return; }
            chips(ro, [["Town's busiest hour", s.peak + " MW"], ["With the campus's steady " + D.campus.drawMW + " MW", s.newPeak + " MW"], ["At its full " + D.campus.contractMW + " MW contract", s.atContract + " MW", "warn"]]);
            pr.reveal(); as.textContent = whenAssume(D); api.done();
          }
          show(!!pr.picked());
          demo[0] = function () { if (!pr.picked()) { var b = act.querySelectorAll(".lx-choice")[1]; if (b) b.click(); } };
        } },
      { text: "Now a mild spring day, 17 April 2025. Switch between the two days: on which one is the campus a bigger share of the town's electricity?",
        build: function (act, api) {
          var seen = {}, sel = "spring";
          var seg = H("div", { class: "lx-seg", role: "group", "aria-label": "Day" }, act);
          var Pl = LX.Plot(H("div", null, act), { text: "Text version of the chart", legend: true });
          var ro = H("div", { class: "lx-readouts", "aria-live": "polite" }, act);
          var line = H("p", { class: "lx-hint", "aria-live": "polite" }, act);
          var btn = {};
          ["summer", "spring"].forEach(function (k) {
            btn[k] = H("button", { type: "button", text: DAY[k].label }, seg);
            btn[k].addEventListener("click", function () { pick(k); });
          });
          function pick(k) {
            sel = k; seen[k] = true; var s = DAY[k];
            Object.keys(btn).forEach(function (j) { btn[j].setAttribute("aria-pressed", String(j === k)); });
            dayChart(Pl, s, true);
            chips(ro, [["Campus share of the day", pct(s.share)], ["Quietest hour, town", s.min + " MW"], ["With the campus", s.newMin + " MW", s.newMin > D.town.peakMW ? "warn" : ""]]);
            line.innerHTML = LX.rich(dayLine(D, s)).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
            if (seen.summer && seen.spring) { api.done(); api.saw(daysSaw(D, DAY.summer, DAY.spring)); }
          }
          pick(sel);
          demo[1] = function () { pick("summer"); pick("spring"); };
        } },
      { text: "How big is 240 MW, around the clock? Guess how many average U.S. homes buy as much electricity in a year as the campus uses.",
        build: function (act, api) {
          var T = D.homes.ticks, ans = nearestTick(T, homes(D.campus.drawMW, Y.n, D.home_year.value));
          var res = H("div", { class: "f8-res" }, act);
          function result(g) {
            res.innerHTML = "";
            if (g != null) H("p", { class: "lx-hint", text: "Your guess: " + fmtN(T[g]) + " homes. " + (g === ans ? "Right order of size." : "The nearest mark is " + fmtN(T[ans]) + ".") }, res);
            var uc = LX.UnitChain(res, { label: "From the campus's MW to homes", steps: homesChain(D, Y, S.draw) });
            var line = H("p", { class: "lx-step-line", "aria-live": "polite" }, res);
            LX.Slider(res, { label: "What-if: the campus's average draw", color: CAMPUS, min: D.homes.drawMW.min, max: D.homes.drawMW.max, step: D.homes.drawMW.step, value: S.draw,
              fmt: function (v) { return fmtN(v) + " MW"; }, onChange: function (v) { S.draw = v; uc.set(homesChain(D, Y, v)); paint(); } });
            H("p", { class: "lx-hint", text: HOMES_WHATIF }, res);
            H("p", { class: "lx-hint", text: HOMES_NOTE + " Homes figure: EIA's average U.S. home buys " + fmtN(D.home_year.value) + " kWh a year (2022)." }, res);
            function paint() { line.innerHTML = LX.rich(homesLine(D, Y, S.draw)).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>"); }
            paint(); api.done();
          }
          var g0 = LX.progress.guess("f8-homes");
          if (g0 != null && T[g0] != null) { result(+g0); }
          else LX.Guess(act, { id: "f8-homes", q: "Homes buying as much electricity in a year", ticks: T.map(function (t) { return fmtN(t); }), answer: ans, start: 0,
            onLock: function (g) { result(g); } });
          act.appendChild(res);
          demo[2] = function () { var b = act.querySelector(".lx-guess .lx-btn"); if (b) b.click(); };
        } },
      { text: "Now the whole year: Prairie Town's 8,760 hours of 2025, sorted from busiest to quietest, its [[load-duration-curve|load-duration curve]]. Add the campus and watch the quiet hours.",
        build: function (act, api) {
          var on = false, Pl = LX.Plot(H("div", null, act), { text: "Text version of the chart", legend: true });
          var tg = LX.Toggle(H("div", { class: "lx-toggles", role: "group", "aria-label": "Add the campus" }, act), { label: "Add the campus", on: false, onChange: function (v) { on = v; paint(); } });
          var ro = H("div", { class: "lx-readouts", "aria-live": "polite" }, act);
          var step = 73;   // every 73rd sorted hour for the line (121 points; the busiest and quietest hours kept)
          function pts(arr, add) { var p = []; for (var i = 0; i < arr.length; i += step) p.push([i, arr[i] + add]); p.push([arr.length - 1, arr[arr.length - 1] + add]); return p; }
          function paint() {
            Pl.render({
              x: { min: 0, max: Y.n, ticks: [[0, "busiest"], [2190, "2,190"], [4380, "4,380 h"], [6570, "6,570"], [Y.n, "quietest"]], ticksN: [[0, "busiest"], [4380, "4,380 h"], [Y.n, "quietest"]] },
              y: { min: 0, max: 800, step: 200, fmt: function (v) { return fmtN(v); }, unit: "MW" }, height: 230, heightN: 200,
              lines: [{ pts: pts(Y.sorted, 0), color: TOWN, width: 2.6, area: 0.14 }].concat(on ? [{ pts: pts(Y.sorted, D.campus.drawMW), color: CAMPUS, width: 2.6 }] : []),
              refs: [{ y: D.town.peakMW, label: "Old record, " + D.town.peakMW + " MW", labelN: D.town.peakMW + " MW", dash: "5 4", color: "var(--lx-ink-3)" }],
              legend: [{ label: "The town alone", color: TOWN }].concat(on ? [{ label: "With the campus's " + D.campus.drawMW + " MW", color: CAMPUS }] : []),
              aria: "Prairie Town's 8,760 hours of 2025 sorted from busiest to quietest: " + fmtN(Y.peak) + " to " + fmtN(Y.min) + " MW" + (on ? "; with the campus " + fmtN(Y.withPeak) + " to " + fmtN(Y.withMin) + " MW" : "") + ".",
              text: { head: ["Hours at or above", "Town (MW)"].concat(on ? ["With the campus (MW)"] : []), rows: [1, 876, 2190, 4380, 6570, 8760].map(function (k) { return [fmtN(k), fmtN(Y.sorted[k - 1])].concat(on ? [fmtN(Y.sorted[k - 1] + D.campus.drawMW)] : []); }) }
            });
            chips(ro, [["Hours above " + D.town.peakMW + " MW", fmtN(on ? Y.above : Y.aboveTown), on ? "warn" : ""], ["Quietest hour", fmtN(on ? Y.withMin : Y.min) + " MW"], ["Load factor", pct(on ? Y.withLf : Y.lf)]]);
            if (on) { api.done(); api.saw(yearSaw(D, Y)); }
          }
          paint();
          demo[3] = function () { if (!tg.val()) tg.el.click(); };
        } },
      { text: "Real grids get many such requests: in June 2026, Texas's grid operator [[ercot|ERCOT]] counted about 474 GW of large loads asking to connect. How many times its record peak of about 91 GW is that?",
        build: function (act, api) {
          var res = H("div", { class: "f8-res" }, act), ans = ERCOT_TICKS.indexOf("5 times");
          function result() {
            res.innerHTML = "";
            H("p", { class: "lx-step-line", html: LX.rich(ercotLine(D)).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>") }, res);
            H("p", { class: "lx-hint", html: "Why checking each request takes years: " + LX.lessonRefHTML(P, "A6") + "." }, res);
            api.done();
          }
          var g0 = LX.progress.guess("f8-ercot");
          if (g0 != null && ERCOT_TICKS[g0]) { H("p", { class: "lx-hint", text: "Your guess: " + ERCOT_TICKS[g0] + "." }, act); result(); }
          else LX.Guess(act, { id: "f8-ercot", q: "Requests ÷ record peak", ticks: ERCOT_TICKS, answer: ans, start: 1, onLock: function () { result(); } });
          act.appendChild(res);
          demo[4] = function () { var b = act.querySelector(".lx-guess .lx-btn"); if (b) b.click(); };
        } },
      { text: "Suppose the campus takes 24 months to build, but grid service comes after 36 (both illustrative). Slide the date of grid service: how long does the finished building wait?",
        build: function (act, api) {
          var G = D.wait.grid, box = H("div", { class: "f8-wait" }, act);
          var bars = H("div", { class: "f8-wait-bars", role: "img" }, box);
          H("p", { class: "lx-hint", text: "Hatched: months the finished campus waits for grid service." }, box);
          var ro = H("div", { class: "lx-readouts", "aria-live": "polite" }, act);
          var line = H("p", { class: "lx-step-line", "aria-live": "polite" }, act);
          var sl = LX.Slider(act, { label: "Grid service after", color: "var(--lx-accent)", min: G.min, max: G.max, step: G.step, value: S.grid,
            fmt: function (v) { return v + " months"; }, onChange: function (v) { S.grid = v; keep(); paint(); api.done(); buildExplain(); } });
          function row(label, to, from, cls) {
            var r = H("div", { class: "f8-wait-row" }, bars);
            H("span", { class: "f8-wait-l", text: label }, r);
            var tr = H("span", { class: "f8-wait-track" }, r);
            H("i", { class: "f8-bar " + cls, style: "width:" + (100 * to / G.max).toFixed(2) + "%" }, tr);
            if (from != null && from < to) H("i", { class: "f8-bar idle", style: "left:" + (100 * from / G.max).toFixed(2) + "%;width:" + (100 * (to - from) / G.max).toFixed(2) + "%" }, tr);
          }
          function paint() {
            bars.innerHTML = ""; var b = D.wait.buildMonths, i = idle(D, S.grid);
            row("Building", b, null, "build"); row("Grid service", S.grid, b, "grid");
            var ax = H("div", { class: "f8-wait-row f8-wait-ax", "aria-hidden": "true" }, bars); H("span", { class: "f8-wait-l", text: "Months" }, ax);
            var t = H("span", { class: "f8-wait-track ax" }, ax); [0, 12, 24, 36, 48, 60].forEach(function (m) { H("b", { style: "left:" + (100 * m / G.max) + "%", text: String(m) }, t); });
            bars.setAttribute("aria-label", "Building finished after " + b + " months; grid service after " + S.grid + " months; " + i + " idle months.");
            chips(ro, [["Building ready", b + " months"], ["Grid service", S.grid + " months"], ["Idle months", String(i), i > 0 ? "warn" : "good"]]);
            line.textContent = waitLine(D, S.grid);
          }
          paint();
          demo[5] = function () { sl.set(42, true); };
        } },
      { text: "A campus brings more than load. Open each tab: its cooling water, the jobs it creates and the taxes it pays, as rough estimates you set yourself.",
        build: function (act, api) {
          var seen = {}, tabs = [["water", "Cooling water"], ["jobs", "Jobs"], ["tax", "Taxes"]];
          var seg = H("div", { class: "lx-seg f8-tabs", role: "group", "aria-label": "Beyond the wires" }, act);
          var pane = H("div", { class: "f8-pane" }, act), btn = {};
          tabs.forEach(function (t) { btn[t[0]] = H("button", { type: "button", text: t[1] }, seg); btn[t[0]].addEventListener("click", function () { open(t[0]); }); });
          function out(host) { return H("p", { class: "lx-step-line", "aria-live": "polite" }, host); }
          function open(k) {
            seen[k] = true; pane.innerHTML = "";
            Object.keys(btn).forEach(function (j) { btn[j].setAttribute("aria-pressed", String(j === k)); });
            if (k === "water") {
              var cs = H("div", { class: "lx-seg", role: "group", "aria-label": "Cooling design" }, pane), o1 = out(pane), cb = [];
              D.cooling.forEach(function (c, i) { cb[i] = H("button", { type: "button", text: c.name }, cs); cb[i].addEventListener("click", function () { cool(i); }); });
              WATER_HINTS.forEach(function (t) { H("p", { class: "lx-hint", text: t }, pane); });
              var cool = function (i) { cb.forEach(function (b, j) { b.setAttribute("aria-pressed", String(j === i)); }); o1.textContent = coolLine(D.cooling[i]); };
              cool(0);
            } else if (k === "jobs") {
              var o2 = out(pane), J = D.jobs;
              var pj = function () { o2.innerHTML = LX.rich(jobsLine(D, S.crew, S.staff)).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>"); };
              LX.Slider(pane, { label: "Building workers (illustrative)", color: "var(--lx-tier-4)", min: J.crew.min, max: J.crew.max, step: J.crew.step, value: S.crew, fmt: function (v) { return fmtN(v); }, onChange: function (v) { S.crew = v; keep(); pj(); } });
              LX.Slider(pane, { label: "Permanent staff (illustrative)", color: "var(--lx-tier-4)", min: J.staff.min, max: J.staff.max, step: J.staff.step, value: S.staff, fmt: function (v) { return fmtN(v); }, onChange: function (v) { S.staff = v; keep(); pj(); } });
              pane.appendChild(o2); pj();
            } else {
              var o3 = out(pane), X = D.tax;
              var pt = function () { o3.innerHTML = LX.rich(taxLine(D, S.value, S.rate)).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>"); };
              LX.Slider(pane, { label: "Taxable value (illustrative)", color: "var(--lx-tier-5)", min: X.value.min, max: X.value.max, step: X.value.step, value: S.value, fmt: function (v) { return "$" + fmtN(v) + "M"; }, onChange: function (v) { S.value = v; keep(); pt(); } });
              LX.Slider(pane, { label: "Local tax rate (illustrative)", color: "var(--lx-tier-5)", min: X.rate.min, max: X.rate.max, step: X.rate.step, value: S.rate, fmt: function (v) { return fmtN(v, 1) + "%"; }, onChange: function (v) { S.rate = v; keep(); pt(); } });
              pane.appendChild(o3); H("p", { class: "lx-hint", text: TAX_NOTE }, pane); pt();
            }
            if (seen.water && seen.jobs && seen.tax) { api.done(); api.saw(SAW7); }
          }
          open("water");
          demo[6] = function () { open("jobs"); open("tax"); };
        } },
      { text: "The utility builds a new substation for the campus, then the company cancels before it connects. Who pays for the substation?",
        build: function (act, api) {
          H("p", { class: "lx-hint f8-assume", html: "<b>Assume:</b> " + LX.esc(PAY_ASSUME) }, act);
          var pr = LX.Predict(act, { id: "f8-pay", q: "Who pays for the substation?", title: false, answer: PAY.answer, options: PAY.options, feedback: PAY.feedback, onPick: function () { show(); } });
          var ex = H("p", { class: "lx-hint" }, act);
          function show() { pr.reveal(); ex.innerHTML = LX.rich(PAY.extra); api.done(); }
          if (pr.picked()) show();
          H("a", { class: "lx-btn small", style: "justify-self:start;margin-top:10px", href: "#explain", html: "Who decides, pays and benefits, as diagrams" + LX.icon("arrow") }, act);
          demo[7] = function () { if (!pr.picked()) { var b = act.querySelectorAll(".lx-choice")[1]; if (b) b.click(); } };
        } }
    ];
    var cards = LX.StepCards(live, { id: "f8-steps", steps: steps });

    // ---------------------------------------------------------------- the explain layer (the reader's own wait)
    var xhost = document.getElementById("f08-explain");
    function buildExplain() {
      if (!xhost) return;
      xhost.innerHTML = ""; xhost.classList.add("is-live");
      var s = DAY.summer, i = idle(D, S.grid);
      LX.Stakeholders(H("div", { class: "lx-xcard" }, xhost), {
        title: "Who decides, who pays, who benefits",
        lede: "Typical roles when a large load connects; who decides what differs by state.",
        cols: [{ key: "dec", label: "Decides" }, { key: "pay", label: "Pays" }, { key: "ben", label: "Benefits" }],
        rows: [
          { key: "dev", name: "The company", note: "the developer", cells: { dec: { v: "yes", t: "where to build and how big" }, pay: { v: "yes", t: "the campus, its bills, and its idle months" }, ben: { v: "yes", t: "its business" } } },
          { key: "util", name: "The utility", cells: { dec: { v: "part", t: "studies and builds the connection" }, pay: { v: "part", t: "builds first, then recovers the cost through rates" }, ben: { v: "part", t: "sells more electricity" } } },
          { key: "puc", name: "State regulators", cells: { dec: { v: "yes", t: "approve tariffs: who pays for what" }, pay: { v: "no" }, ben: { v: "no" } } },
          { key: "rto", name: "The grid operator", note: "such as SPP or ERCOT", cells: { dec: { v: "part", t: "checks that the grid can carry the load" }, pay: { v: "no" }, ben: { v: "no" } } },
          { key: "homes", name: "Households and businesses", note: "the ratepayers", cells: { dec: { v: "part", t: "comment at hearings" }, pay: { v: "part", t: "whatever the tariff does not charge the campus" }, ben: { v: "part", t: "only if the campus pays more than the costs it causes" } } },
          { key: "local", name: "Local government", cells: { dec: { v: "yes", t: "zoning, permits and any tax deal" }, pay: { v: "part", t: "possibly: roads, water and services the campus needs" }, ben: { v: "part", t: "tax receipts; the net gain depends on local costs" } } },
          { key: "nbr", name: "Neighbors", cells: { dec: { v: "part", t: "comment at hearings" }, pay: { v: "part", t: "noise, land and water" }, ben: { v: "part", t: "jobs and local spending" } } }],
        note: "Illustrative roles for Prairie Town; real arrangements vary by state and utility." });
      LX.CausalChain(H("div", { class: "lx-xcard" }, xhost), {
        title: "Cause and effect: one campus connects",
        links: [{ title: "A company asks", text: "Its contract is the most it may draw.", value: D.campus.contractMW + " MW contract" },
                { title: "Studies and new wires", text: "The grid must be able to carry it; checking and building take time.", value: i + " idle months in your timeline" },
                { title: "It switches on", text: "In this lesson it draws a steady " + D.campus.drawMW + " MW in every hour.", value: "+" + D.campus.drawMW + " MW" },
                { title: "The record moves", text: "Every hour rises by " + D.campus.drawMW + " MW, the quiet night hours included.", value: s.peak + " → " + s.newPeak + " MW" },
                { title: "Check supply and wires", text: "Planners check whether existing supply and wires can serve the added load; upgrades may be needed.", value: fmtN(Y.above) + " h above the old record" },
                { title: "Who pays", text: "The tariff decides how much falls on the campus and how much on others.", value: "set by the tariff (A4)" }],
        note: "Prairie Town's numbers, illustrative. A real grid adds a campus to many other changes at once." });
      LX.CompareTable(H("div", { class: "lx-xcard" }, xhost), {
        title: "The town and the campus, side by side", text: true,
        columns: [{ key: "name", label: "Load", main: true }, { key: "size", label: "Busiest hour" }, { key: "avg", label: "Average" }, { key: "lf", label: "Load factor" }, { key: "shape", label: "Shape" }, { key: "flex", label: "Can it shift?" }],
        rows: [{ key: "town", color: TOWN, name: "Prairie Town (all customers)", size: fmtN(Y.peak) + " MW", avg: fmtN(Y.avg) + " MW", lf: pct(Y.lf), shape: "follows heat, cold and the time of day", flex: "some loads can (A7)" },
               { key: "campus", color: CAMPUS, name: "The campus", size: D.campus.drawMW + " MW (contract " + D.campus.contractMW + " MW)", avg: D.campus.drawMW + " MW", lf: "100% in this lesson (flat)", shape: "steady around the clock", flex: "some computing work can wait; how much depends on the business" }],
        caption: "2025 hours for the town (real shapes, scaled); the campus is illustrative." });
    }
    buildExplain();

    // demo states (core.js LX.demo): "mid" = step 2 with both days seen; "step-N" = step N with its action done
    LX.demo(root, function (state) {
      var n = state === "mid" ? 2 : +((/^step-(\d+)$/.exec(state) || [])[1] || 0); if (!n) return null;
      var k = Math.max(0, Math.min(steps.length - 1, n - 1));
      cards.go(k); if (demo[k]) demo[k]();
      return { view: "step " + (k + 1) };
    }, cards);
    root.lxLesson = { model: model, D: D, DAY: DAY, Y: Y, S: S, cards: cards };
  });
})();
