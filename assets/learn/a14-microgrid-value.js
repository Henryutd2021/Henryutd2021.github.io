// a14-microgrid-value.js — Lesson A14, "Does a microgrid pay off, and for whom?" (Analyst, step cards).
// Closed form: no solver.
//
// Data: assets/learn/data/a14-microgrid-value.json. One price year, 2025 dollars. Real: a 2025 survey of rural co-op
// members' outage costs (Berkeley Lab and partners), EIA's 2025 retail prices, FERC's 2024 Energy Primer. Illustrative:
// Prairie Campus, its hospital's cost per hour, the outage pattern, every equipment cost, the borrowing rates and the
// village (round numbers, not quotes).
//
// The model, per year:
//   outages        classes k with a length d_k (hours) and a frequency f_k (outages a year)
//   S(h)           = sum of f_k over d_k > h: expected outages a year that are still going after h hours
//   A(H)           = sum of f_k × min(d_k, H): expected outage hours a year that H hours of backup cover
//   expected cost  = c × sum of f_k × d_k, with c the hospital's cost of an hour without power ($ per hour)
//   a design       a battery of B hours (B × 300 kWh) and a generator with a tank for G hours: the battery covers the
//                  first B hours of an outage, the generator the next G
//   capital        controls (switch and controller) + battery inverter and kWh (if B > 0) + generator (if G > 0)
//   annual cost    capital × CRF(r, n) + upkeep share × (controls + battery part) + generator upkeep + tank × G
//                  + fuel per hour × (A(B + G) − A(B))
//   value          c × A(B + G)  (+ everyday savings: the battery trims the campus's monthly peak, if B ≥ minHours)
//                  Boundary: the campus's savings. The everyday saving is a lower bill for the campus (a demand charge);
//                  for the utility it is revenue it no longer collects, a saving for the whole system only if the smaller
//                  peak cuts the utility's own costs (not modeled). Stacking assumes a two-hour monthly peak, time to
//                  recharge before every outage and no extra charging or wear costs, so the battery is full at each outage.
//   net            value − annual cost
//   the next hour  battery: saves c × (A(B + 1) − A(B)) = c × S(B), costs kWh per hour × $/kWh × (CRF + upkeep share)
//                  generator: saves (c − fuel per hour) × S(G), costs the tank's $ per hour a year
// Ties: the best size is the smallest of the sizes with the highest net (none occurs at the page's values; tested).
// The village (step 8): lesson F7's households, mill and average sunny day; the cheapest panels (whole kW) and battery
// (5 kWh steps) that serve every hour of the settled average day; cost per kWh = annual cost ÷ kWh a year. A toy: the
// same average day repeats all year; cloudy spells, seasons and battery power limits are left out (the page says so).
// Every number on the page is checked by _tests/learn/test_a14-microgrid-value.js.
(function () {
  "use strict";

  // ---------------------------------------------------------------- pure model (no DOM; exported for Node)
  function crf(r, n) { return r / (1 - Math.pow(1 + r, -n)); }
  function S(O, h) { return O.hours.reduce(function (s, d, k) { return s + (d > h ? O.perYear[k] : 0); }, 0); }
  function A(O, H) { return O.hours.reduce(function (s, d, k) { return s + O.perYear[k] * Math.min(d, H); }, 0); }
  function totalHours(O) { return A(O, Infinity); }
  function outageCount(O) { return O.perYear.reduce(function (s, f) { return s + f; }, 0); }
  function contributions(O, c) {
    var tot = totalHours(O);
    return O.hours.map(function (d, k) { var h = O.perYear[k] * d; return { hours: d, perYear: O.perYear[k], expHours: h, cost: c * h, share: h / tot }; });
  }
  function everydaySavings(D) { var e = D.costs.everyday; return e.kw * e.perKWMonth * 12; }
  // a design {bat: B, gen: G} at a cost per hour c; opts.everyday counts the battery's everyday savings; opts.rate
  function design(D, d, c, opts) {
    opts = opts || {};
    var K = D.costs, F = D.finance, r = opts.rate == null ? F.rate : opts.rate, B = d.bat || 0, G = d.gen || 0, kw = D.hospital.kw;
    if (!B && !G) return { bat: 0, gen: 0, capital: 0, annual: 0, capitalYear: 0, upkeep: 0, fuel: 0, avoided: 0, everyday: 0, value: 0, net: 0, covered: 0 };
    var batPart = B ? K.inverter + K.batteryPerKWh * kw * B : 0, genPart = G ? K.generator : 0;
    var capital = K.controls + batPart + genPart, covered = A(D.outages, B + G);
    var capitalYear = capital * crf(r, F.years);
    var upkeep = K.batteryOM * (K.controls + batPart) + (G ? K.genUpkeep + K.tankPerHour * G : 0);
    var fuel = G ? K.fuelPerHour * (covered - A(D.outages, B)) : 0;
    var annual = capitalYear + upkeep + fuel, avoided = c * covered;
    var everyday = opts.everyday && B >= K.everyday.minHours ? everydaySavings(D) : 0;
    return { bat: B, gen: G, capital: capital, capitalYear: capitalYear, upkeep: upkeep, fuel: fuel, annual: annual, avoided: avoided, everyday: everyday,
             value: avoided + everyday, net: avoided + everyday - annual, covered: covered };
  }
  function batteryHourCost(D) { var K = D.costs; return K.batteryPerKWh * D.hospital.kw * (crf(D.finance.rate, D.finance.years) + K.batteryOM); }
  // how one more hour of battery comes to its cost a year, and the fixed costs beside it (step 3 and the no-JS version)
  function batteryWorked(D) {
    var K = D.costs, F = D.finance, kw = D.hospital.kw, cells = K.batteryPerKWh * kw, f = crf(F.rate, F.years);
    return { steps: [["Energy for one hour of the hospital", int0(kw) + " kWh"], ["Battery at $" + K.batteryPerKWh + " per kWh", usd(cells)],
                     ["Spread over " + F.years + " years at " + Math.round(F.rate * 100) + "% (× " + f.toFixed(4) + ")", usd(cells * f) + " a year"],
                     ["Upkeep, " + (K.batteryOM * 100).toFixed(1) + "% a year", usd(cells * K.batteryOM) + " a year"], ["One more hour of battery", usd(batteryHourCost(D)) + " a year"]],
             fixed: [["Switch and controls", usd(K.controls)], ["Battery inverter (with any battery)", usd(K.inverter)], ["Generator", usd(K.generator) + ", upkeep " + usd(K.genUpkeep) + " a year"],
                     ["Fuel tank, per hour it holds", usd(K.tankPerHour) + " a year"], ["Fuel, per hour the generator runs", usd(K.fuelPerHour)]] };
  }
  function int0(v) { return Math.round(v).toLocaleString("en-US"); }
  function workedTable(D) {
    var W = batteryWorked(D), row = function (r) { return "<tr><th scope=\"row\">" + r[0] + "</th><td class=\"n\">" + r[1] + "</td></tr>"; };
    return "<table class=\"lx-mini-table a14-tab\"><caption class=\"lx-hint\">One more hour of battery, worked out (illustrative, 2025 dollars)</caption><tbody>" + W.steps.map(row).join("") + "</tbody></table>" +
      "<table class=\"lx-mini-table a14-tab\"><caption class=\"lx-hint\">Fixed costs and the generator (illustrative, 2025 dollars)</caption><tbody>" + W.fixed.map(row).join("") + "</tbody></table>";
  }
  // the next hour of backup: what it saves and what it costs a year
  function nextHour(D, kind, H, c) {
    var s = S(D.outages, H);
    return kind === "battery" ? { saves: c * s, costs: batteryHourCost(D) } : { saves: (c - D.costs.fuelPerHour) * s, costs: D.costs.tankPerHour };
  }
  // the best size of one kind, 0..max hours (ties: the smaller size)
  function best(D, kind, c, max, opts) {
    var b = null;
    for (var H = 0; H <= max; H++) {
      var x = design(D, kind === "battery" ? { bat: H } : { gen: H }, c, opts);
      if (!b || x.net > b.net + 1e-6) b = x;
    }
    return b;
  }
  // the size at which the next hour stops paying (the marginal test; it ignores the fixed costs)
  function marginalSize(D, kind, c, max) {
    var H = 0; while (H < max && nextHour(D, kind, H, c).saves > nextHour(D, kind, H, c).costs) H++;
    return H;
  }

  // the village mini-grid (lesson F7's households, mill and sun; a cold store; the equipment's costs)
  function villageLoad(V, o) {
    var L = V.householdW.map(function (w) { return w * V.households / 1000; });
    if (o.mill) V.mill[o.mill].forEach(function (h) { L[h] += V.mill.kw; });
    if (o.cold) for (var h = 0; h < 24; h++) L[h] += V.cold.kw;
    return L;
  }
  function villageShort(V, L, kw, kwh) {   // kWh short on the settled average day (F7's rule; no battery power limit)
    var stored = kwh / 2, short = 0;
    for (var d = 0; d < 30; d++) {
      short = 0;
      for (var h = 0; h < 24; h++) {
        var need = L[h] - kw * V.sun[h];
        if (need <= 0) { if (kwh > 0) stored += Math.min(-need, (kwh - stored) / V.eff) * V.eff; }
        else { var b = Math.min(need, stored); stored -= b; short += need - b; }
      }
    }
    return short < 1e-6 ? 0 : short;
  }
  function villageCase(V, o) {
    var L = villageLoad(V, o), f = crf(V.rate, V.years) + V.om, kwhYear = 365 * L.reduce(function (s, x) { return s + x; }, 0), cheapest = null;
    for (var kw = 1; kw <= V.panelsMax; kw++) {
      for (var b = 0; b <= V.batteryMax; b += V.batteryStep) {
        if (villageShort(V, L, kw, b) === 0) {
          var eq = (V.solarPerKW * kw + V.batteryPerKWh * b) * f;
          if (!cheapest || eq < cheapest.equipment - 1e-6) cheapest = { kw: kw, kwh: b, equipment: eq };
          break;
        }
      }
    }
    var annual = cheapest.equipment + V.fixed;
    return { kw: cheapest.kw, kwh: cheapest.kwh, kwhYear: kwhYear, annual: annual, perKWh: annual / kwhYear,
             parts: { panels: V.solarPerKW * cheapest.kw * f / kwhYear, battery: V.batteryPerKWh * cheapest.kwh * f / kwhYear, fixed: V.fixed / kwhYear } };
  }
  var CASES = [
    { key: "homes", label: "Households only", o: {} },
    { key: "noon", label: "+ mill at midday", o: { mill: "noon" } },
    { key: "evening", label: "+ mill in the evening", o: { mill: "evening" } },
    { key: "cold", label: "+ mill at midday and a cold store", o: { mill: "noon", cold: true } }
  ];
  // the village's four cases as a table (step 8 and the no-JS version), and step 8's feedback
  function villageTable(D) {
    return "<table class=\"lx-mini-table a14-tab\"><caption class=\"lx-hint\">The village mini-grid's four cases: the cheapest sizes for the repeated average day</caption><thead><tr><th scope=\"col\">Case</th><th scope=\"col\">Panels</th><th scope=\"col\">Battery</th><th scope=\"col\">Per kWh</th></tr></thead><tbody>" +
      CASES.map(function (k) { var x = villageCase(D.village, k.o); return "<tr><th scope=\"row\">" + k.label.replace(/^\+ /, "Households, ") + "</th><td class=\"n\">" + x.kw + " kW</td><td class=\"n\">" + x.kwh + " kWh</td><td class=\"n\">" + usd2(x.perKWh) + "</td></tr>"; }).join("") + "</tbody></table>";
  }
  function villageFeedback(D) {
    var v = CASES.map(function (k) { return villageCase(D.village, k.o); });
    return "Daytime [[productive-use|productive use]] spreads the fixed costs: " + usd2(v[0].perKWh) + " per kWh for the households, " + usd2(v[1].perKWh) + " with the mill at midday, " + usd2(v[3].perKWh) + " with a cold store too. In the evening the mill needs more battery: " + usd2(v[2].perKWh) + ".";
  }
  // step 6's feedback: the best design without and with the bill savings, and the condition the stacking needs
  function stackFeedback(D) {
    var c = D.hospital.perHour, best = function (ev) { return D.designs.reduce(function (a, d) { var x = design(D, d, c, { everyday: ev }); return !a || x.net > a.x.net ? { d: d, x: x } : a; }, null); };
    var w = best(false), y = best(true);
    return "Without the bill savings the " + w.d.label.toLowerCase() + " does best; with them, the " + y.d.label.toLowerCase() + " (" + signed(y.x.net) + " a year), if the battery is full when each outage starts.";
  }
  // step 7's feedback for an owner
  function ownerFeedback(D, o) {
    var x = design(D, D.designs[2], D.hospital.perHour, { everyday: true, rate: o.rate });
    return "With " + o.label.toLowerCase() + " as owner the design costs " + usd(x.annual) + " a year at " + (o.rate * 100).toFixed(0) + "%: a net of " + signed(x.net) + " in the campus's view. Only the borrowing cost moved.";
  }
  // step 6's bill saving, worked: the peak trimmed × the demand charge × 12 months
  function billWorked(D) {
    var e = D.costs.everyday;
    return "The bill saving, worked: the battery trims each monthly peak by " + e.kw + " kW; " + e.kw + " kW × $" + e.perKWMonth + " per kW a month × 12 = " + usd(everydaySavings(D)) + " a year. It needs at least " + e.minHours + " hours of battery.";
  }
  // the year's ledger for one owner: project benefits and costs, then the supplier's lost bill revenue (explain layer and no-JS)
  function ledgerRows(D, o) {
    var d = design(D, D.designs[2], D.hospital.perHour, { everyday: true, rate: o.rate });
    return [{ head: "+ Outage cost avoided", who: "the hospital", v: d.avoided }, { head: "+ Bill savings (peak trimmed)", who: o.everydayTo, v: d.everyday },
            { head: "− Capital, spread over " + D.finance.years + " years", who: "the owner", v: -d.capitalYear }, { head: "− Upkeep, tank and fuel", who: "the owner", v: -(d.upkeep + d.fuel) },
            { head: "= Net, the campus's view", who: "", v: d.net, total: true },
            { head: "− Bill revenue no longer collected", who: "the campus's power supplier", v: -d.everyday },
            { head: "= Net, all parties, if the supplier's own costs do not fall", who: "", v: d.net - d.everyday, total: true }];
  }
  var PROFIT = "The owner's profit is not calculated: it depends on the fee or rates it collects.";

  function usd(v) { return (v < -0.5 ? "−$" : "$") + Math.round(Math.abs(v)).toLocaleString("en-US"); }
  function usd2(v) { return "$" + v.toFixed(2); }
  function signed(v) { return (v > 0.5 ? "+" : "") + usd(v); }
  function times(a, b) { return Math.round(a / b); }

  // ---------------------------------------------------------------- no-JS blocks (the test's --write mode writes them)
  function f2(v) { return (Math.round(v * 100) / 100).toLocaleString("en-US"); }
  function pct0(v) { return Math.round(v * 100) + "%"; }
  function facts(D) {   // the numbers the page states, in one place (the steps, the fallbacks, the myths and the practice set)
    var O = D.outages, c = D.hospital.perHour, I = D.ice, C = contributions(O, c), long = C.filter(function (x) { return x.hours >= 12; });
    var nb = nextHour(D, "battery", 0, c), hi = D.hospital.values[D.hospital.values.length - 1], m = marginalSize(D, "battery", hi, 12), dm = design(D, { bat: m }, hi);
    var g = best(D, "gen", c, 72), dz = D.designs.map(function (d) { return { d: d, no: design(D, d, c), yes: design(D, d, c, { everyday: true }) }; });
    return { c: c, hours: totalHours(O), count: outageCount(O), cost: c * totalHours(O), longShare: long.reduce(function (s, x) { return s + x.perYear; }, 0) / outageCount(O),
             longHours: long.reduce(function (s, x) { return s + x.expHours; }, 0), first: nb, hi: hi, m: m, dm: dm, bestHi: best(D, "battery", hi, 12), g: g, designs: dz,
             s4: S(O, 4), pass: batteryHourCost(D) / outageCount(O), kwh24: I.household.kwh[2], kwh8: [I.household.kwh[1], I.business.kwh[1]],
             owners: D.owners.map(function (o) { return { o: o, x: design(D, D.designs[2], c, { everyday: true, rate: o.rate }) }; }),
             village: CASES.map(function (k) { return { k: k, x: villageCase(D.village, k.o) }; }) };
  }
  function staticSteps(D) {
    var I = D.ice, F = facts(D), O = D.outages;
    var ice = "<div class=\"lx-scroll-x\"><table class=\"lx-mini-table a14-tab\"><caption class=\"lx-hint\">What one outage is worth to rural co-op members, on average: what a household would pay to avoid it, what it costs a business (2025 survey, 2025 dollars)</caption><thead><tr><th scope=\"col\">Length</th><th scope=\"col\">A household would pay to avoid it</th><th scope=\"col\">A business's costs</th><th scope=\"col\">Household, per kWh not delivered</th></tr></thead><tbody>" +
      I.hours.map(function (h, i) { return "<tr><td>" + I.names[i] + "</td><td class=\"n\">" + usd2(I.household.event[i]) + "</td><td class=\"n\">" + usd(I.business.event[i]) + "</td><td class=\"n\">" + usd2(I.household.kwh[i]) + "</td></tr>"; }).join("") + "</tbody></table></div>";
    var out = "<div class=\"lx-scroll-x\"><table class=\"lx-mini-table a14-tab\"><caption class=\"lx-hint\">A year of outages at Prairie Campus (illustrative), at " + usd(F.c) + " an hour for the hospital</caption><thead><tr><th scope=\"col\">Length</th><th scope=\"col\">Outages a year</th><th scope=\"col\">Hours a year</th><th scope=\"col\">Cost a year</th></tr></thead><tbody>" +
      contributions(O, F.c).map(function (x) { return "<tr><td>" + x.hours + " h</td><td class=\"n\">" + x.perYear + "</td><td class=\"n\">" + f2(x.expHours) + "</td><td class=\"n\">" + usd(x.cost) + "</td></tr>"; }).join("") + "</tbody></table></div>";
    var dz = "<div class=\"lx-scroll-x\"><table class=\"lx-mini-table a14-tab\"><caption class=\"lx-hint\">Three designs a year (illustrative), net without and with the campus's bill savings; with them, the battery is assumed full when each outage starts</caption><thead><tr><th scope=\"col\">Design</th><th scope=\"col\">Annual cost</th><th scope=\"col\">Net, outages only</th><th scope=\"col\">Net, with bill savings</th></tr></thead><tbody>" +
      F.designs.map(function (r) { return "<tr><td>" + r.d.label + "</td><td class=\"n\">" + usd(r.no.annual) + "</td><td class=\"n\">" + signed(r.no.net) + "</td><td class=\"n\">" + signed(r.yes.net) + "</td></tr>"; }).join("") + "</tbody></table></div>";
    return "<p class=\"lx-eyebrow\">Price an outage, then size Prairie Campus's microgrid against it (2025 dollars)</p>" + ice + out +
      "<ul><li>The hospital's expected outage cost: " + usd(F.cost) + " a year (illustrative: " + usd(F.c) + " an hour). Outages of 12 hours or more are " + pct0(F.longShare) + " of the outages but " + pct0(F.longHours / F.hours) + " of the hours.</li>" +
      "<li>A battery: its first hour saves " + usd(F.first.saves) + " a year and costs " + usd(F.first.costs) + ", so no battery pays from outages alone.</li>" +
      "<li>At " + usd(F.hi) + " an hour, hours up to " + F.m + " pass, but " + F.m + " hours cost " + usd(F.dm.annual) + " against " + usd(F.dm.avoided) + " avoided.</li>" +
      "<li>A generator: the best tank holds " + F.g.gen + " hours, " + signed(F.g.net) + " a year.</li></ul>" +
      "<div class=\"lx-scroll-x\">" + workedTable(D) + "</div>" + dz + "<p class=\"lx-hint\">" + billWorked(D) + "</p>" +
      "<p class=\"lx-hint\">" + D.texts.billNote + "</p><div class=\"lx-scroll-x\">" + villageTable(D) + "</div><p class=\"lx-hint\">" + D.texts.villageToy + "</p>";
  }
  function staticExplain(D) {
    var F = facts(D);
    return "<dl class=\"lx-ideas\"><dt>Value of lost load</dt><dd>What an hour or a kWh without power costs someone; it differs by customer and by outage length.</dd>" +
      "<dt>Expected outage cost</dt><dd>Outages a year × their length × the cost of an hour, summed over outage lengths: " + usd(F.cost) + " a year for the hospital here.</dd>" +
      "<dt>The next hour</dt><dd>Buy another hour of backup while it saves more a year than it costs; then check that the whole design covers its fixed costs.</dd>" +
      "<dt>Value stacking</dt><dd>Everyday savings can carry a design that outage savings alone cannot, if one battery can do both: here it is assumed full when each outage starts.</dd>" +
      "<dt>Who owns it</dt><dd>At a fixed borrowing rate, changing who pays moves the gains between parties, not the combined total. Here each owner also borrows at its own rate, so the net changes too.</dd></dl>" +
      "<div class=\"lx-scroll-x\"><table class=\"lx-mini-table a14-tab\"><caption class=\"lx-hint\">Four owners of the battery-and-generator design (illustrative deals and rates)</caption><thead><tr><th scope=\"col\">Owner</th><th scope=\"col\">Who pays</th><th scope=\"col\">Who gains</th><th scope=\"col\">Carries the risk</th><th scope=\"col\">Annual cost</th></tr></thead><tbody>" +
      F.owners.map(function (r) { return "<tr><td>" + r.o.label + " (" + (r.o.rate * 100).toFixed(0) + "%)</td><td>" + r.o.pays + "</td><td>" + r.o.gains + "</td><td>" + r.o.risk + "</td><td class=\"n\">" + usd(r.x.annual) + "</td></tr>"; }).join("") + "</tbody></table></div>" +
      "<div class=\"lx-scroll-x\"><table class=\"lx-mini-table a14-tab\"><caption class=\"lx-hint\">The ledger, a year: owned by " + D.owners[0].label.toLowerCase() + " (" + (D.owners[0].rate * 100).toFixed(0) + "%); 2025 dollars, illustrative</caption><thead><tr><th scope=\"col\">A year</th><th scope=\"col\">Who</th><th scope=\"col\">Amount</th></tr></thead><tbody>" +
      ledgerRows(D, D.owners[0]).map(function (r) { return "<tr" + (r.total ? " class=\"tot\"" : "") + "><th scope=\"row\">" + r.head + "</th><td>" + r.who + "</td><td class=\"n\">" + signed(r.v) + "</td></tr>"; }).join("") + "</tbody></table></div>" +
      "<p class=\"lx-hint\">" + PROFIT + "</p>";
  }
  function staticMyth(D) {
    var F = facts(D), b = F.designs[0], I = D.ice;
    function qq(id, q, a) { return "<div class=\"lx-qq\" data-id=\"" + id + "\" data-answer=\"myth\">\n<p class=\"lx-qtext\">Myth or fact? “" + q + "”</p>\n<ul class=\"lx-choices\"><li data-value=\"myth\">Myth</li><li data-value=\"fact\">Fact</li></ul>\n<details class=\"lx-answer\"><summary>Answer</summary><p>" + a + "</p></details>\n</div>"; }
    return [qq("pays", "A microgrid that keeps a hospital open always pays for itself.", "Myth. Here a 2-hour battery comes out at " + signed(b.no.net) + " a year on outages alone, and at " + signed(b.yes.net) + " with the campus's bill savings, if it is full at every outage."),
            qq("voll", "The value of lost load is one number.", "Myth. In the 2025 co-op survey, per kWh not delivered in an 8-hour outage, a household would pay " + usd2(F.kwh8[0]) + " to avoid it and a business lost " + usd(F.kwh8[1]) + "."),
            qq("owner", "If a microgrid saves money overall, its owner comes out ahead.", "Myth. The owner pays the capital and gains only through rates, a fee or the savings it keeps. Its borrowing rate moves the net too: " + signed(F.owners[3].x.net) + " a year at 10%, " + signed(F.owners[2].x.net) + " at 4%.")].join("\n");
  }
  function staticPractice(D) {
    var F = facts(D), O = D.outages, I = D.ice, ow = F.owners, v = F.village;
    var items = [
      ["Expected outage hours.", "Outages of " + O.hours.join(", ").replace(/, (\d+)$/, " and $1") + " hours happen " + O.perYear.join(", ").replace(/, ([\d.]+)$/, " and $1") + " times a year. How many hours without power a year, on average?",
       f2(F.hours) + " hours: " + O.hours.map(function (h, k) { return O.perYear[k] + " × " + h; }).join(" + ") + "."],
      ["The fifth hour of battery.", "At " + usd(F.c) + " an hour, what does a battery's fifth hour save a year? Does it pay at " + usd(F.first.costs) + "?",
       "Outages longer than 4 hours happen " + f2(F.s4) + " times a year, so it saves " + usd(F.c * F.s4) + " a year: far below " + usd(F.first.costs) + "."],
      ["When the first hour passes.", "At what cost of an hour without power would the battery's first hour save as much as it costs?",
       usd(F.first.costs) + " ÷ " + f2(F.count) + " outages a year = " + usd(F.pass) + " an hour. The fixed costs would still need covering."],
      ["Value against price.", "To avoid a 24-hour outage, a household would pay " + usd2(F.kwh24) + " per kWh not delivered. How many times the 2025 U.S. residential average of " + I.retailCents.residential + "¢ per kWh?",
       "About " + times(F.kwh24, I.retailCents.residential / 100) + " times."],
      ["The cost of borrowing.", "The battery-and-generator design costs " + usd(design(D, D.designs[2], F.c).capital) + " to build, spread over " + D.finance.years + " years. Its capital cost a year at 4% and at 10%?",
       usd(ow[2].x.capitalYear) + " and " + usd(ow[3].x.capitalYear) + ": the same equipment, " + usd(ow[3].x.capitalYear - ow[2].x.capitalYear) + " a year apart."],
      ["The mill's hours.", "Why does the mill at midday lower the village's cost per kWh, while the mill in the evening helps less?",
       "At midday the panels run the mill directly: " + usd2(v[0].x.perKWh) + " falls to " + usd2(v[1].x.perKWh) + ". In the evening the battery must grow from " + v[1].x.kwh + " to " + v[2].x.kwh + " kWh: " + usd2(v[2].x.perKWh) + "."]
    ];
    return "<p class=\"lx-eyebrow\">Practice · about 30 minutes on your own</p><p class=\"lx-hint\">Use the numbers in the steps above (2025 dollars; the campus's are illustrative).</p><ol class=\"lx-fb-practice\">" +
      items.map(function (i) { return "<li><p><b>" + i[0] + "</b> " + i[1] + "</p><details class=\"lx-answer\"><summary>Answer</summary><p>" + i[2] + "</p></details></li>"; }).join("") + "</ol>";
  }
  function staticFacts(D) {
    return D.facts.map(function (f) { return "<tr><td class=\"n\">" + f.n + "</td><td>" + f.what + "</td><td class=\"s\"><a href=\"" + f.url + "\">" + f.source + "</a> · " + f.asof + "</td></tr>"; }).join("\n");
  }

  var model = { billWorked: billWorked, ledgerRows: ledgerRows, PROFIT: PROFIT, batteryWorked: batteryWorked, workedTable: workedTable, villageTable: villageTable, villageFeedback: villageFeedback, stackFeedback: stackFeedback, ownerFeedback: ownerFeedback,
                facts: facts, staticSteps: staticSteps, staticExplain: staticExplain, staticMyth: staticMyth, staticPractice: staticPractice, staticFacts: staticFacts, crf: crf, S: S, A: A, totalHours: totalHours, outageCount: outageCount, contributions: contributions, everydaySavings: everydaySavings,
                design: design, batteryHourCost: batteryHourCost, nextHour: nextHour, best: best, marginalSize: marginalSize,
                villageLoad: villageLoad, villageShort: villageShort, villageCase: villageCase, CASES: CASES, usd: usd, usd2: usd2, signed: signed, times: times };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H, KEY = "a14_microgrid_value";
  var CROSS = '<svg class="lx-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M12 6v12M6 12h12"/></svg>';
  var COL = { cost: "var(--lx-bad)", saved: "var(--lx-good)", battery: "var(--lx-bat)", gen: "var(--lx-pk)", ink: "var(--lx-ink)" };
  function chips(host, list) {
    host.innerHTML = "";
    list.forEach(function (c) { var d = H("div", { class: "lx-readout" + (c[2] ? " " + c[2] : "") }, host); H("span", { text: c[0] }, d); H("b", { text: c[1] }, d); });
  }
  function seg(host, label, opts, cur, on) {
    var g = H("div", { class: "lx-seg", role: "group", "aria-label": label }, host);
    var bs = opts.map(function (x) {
      var b = H("button", { type: "button", text: x[1], "aria-pressed": String(x[0] === cur) }, g);
      b.addEventListener("click", function () { bs.forEach(function (y, j) { y.setAttribute("aria-pressed", String(opts[j][0] === x[0])); }); on(x[0]); });
      return b;
    });
    return bs;
  }
  // the sizing chart: annual cost and outage cost avoided at each whole hour of backup
  function sizeSpec(D, kind, c, Hsel, max) {
    var cost = [], saved = [];
    for (var h = 0; h <= max; h++) { var x = design(D, kind === "battery" ? { bat: h } : { gen: h }, c); cost.push([h, x.annual]); saved.push([h, x.avoided]); }
    var ymax = Math.max.apply(null, cost.concat(saved).map(function (p) { return p[1]; })), step = ymax > 150000 ? 50000 : ymax > 60000 ? 20000 : 10000;
    var cur = design(D, kind === "battery" ? { bat: Hsel } : { gen: Hsel }, c);
    var ticks = kind === "battery" ? [[0, "0", "start"], [2, "2"], [4, "4"], [6, "6"], [8, "8"], [10, "10"], [12, "12 h", "end"]] : [[0, "0", "start"], [12, "12"], [24, "24"], [36, "36"], [48, "48"], [60, "60"], [72, "72 h", "end"]];
    return {
      x: { min: 0, max: max, ticks: ticks },
      y: { min: 0, max: Math.ceil(ymax * 1.08 / step) * step, step: step, fmt: function (v) { return v ? "$" + Math.round(v / 1000) + "k" : "$0"; }, unit: "$ a year" },
      height: 230, heightN: 210,
      lines: [{ pts: cost, color: COL.cost, width: 2.2, dots: max <= 12 }, { pts: saved, color: COL.saved, width: 2.2, dots: max <= 12 }],
      marks: [{ x: Hsel, y: cur.annual, kind: "dot", color: COL.cost, label: usd(cur.annual) }, { x: Hsel, y: cur.avoided, kind: "dot", color: COL.saved, label: usd(cur.avoided), pos: "below" }],
      legend: [{ label: "Annual cost of the microgrid", color: COL.cost }, { label: "Hospital's outage cost avoided", color: COL.saved }],
      aria: (kind === "battery" ? "Battery" : "Generator") + " hours against annual cost and outage cost avoided, at " + usd(c) + " an hour; at " + Hsel + " hours: cost " + usd(cur.annual) + ", avoided " + usd(cur.avoided) + ".",
      text: { head: ["Hours of backup", "Annual cost", "Outage cost avoided", "Net"], rows: cost.map(function (p, i) { return [String(p[0]), usd(p[1]), usd(saved[i][1]), usd(saved[i][1] - p[1])]; }),
              note: "At " + usd(c) + " per hour of outage; whole hours only." }
    };
  }

  LX.mount("a14", function (live, data, root) {
    var D = data[KEY], O = D.outages, Ho = D.hospital, I = D.ice, P = data.path;
    var St = { dur: 1, c: Ho.perHour, bat: 2, gen: 24, everyday: true, owner: null, owners: {}, vcase: "homes", vseen: {} };
    var saved = LX.store.get("a14") || {}, onOwner = null;   // onOwner: the explain layer's ledger follows the step's owner
    if (saved.owner && D.owners.some(function (o) { return o.key === saved.owner; })) St.owner = saved.owner;
    function keep() { LX.store.set("a14", { owner: St.owner }); }

    var cards = LX.StepCards(live, { id: "a14-steps", steps: [
      { text: "An outage costs different people different amounts. Pick its length and compare a household and a dairy, members of a rural [[co-op|co-op]], with the county hospital.",
        build: function (act, api) {
          var picks = 0, row = H("div", { class: "cf-ctl" }, act); H("p", { class: "cf-ctl-l", text: "Outage length" }, row);
          var grid = H("div", { class: "a14-who" }, act), note = H("p", { class: "lx-hint", "aria-live": "polite" }, act);
          seg(row, "Outage length", I.names.map(function (n, i) { return [i, n]; }), St.dur, function (i) { St.dur = i; picks++; paint(); });
          function card(icon, name, sub, v) { var c = H("div", { class: "a14-card" }, grid); H("p", { class: "a14-card-h", html: (icon === "cross" ? CROSS : LX.icon(icon)) + name }, c); H("b", { text: v }, c); H("p", { class: "lx-hint", text: sub }, c); }
          function paint() {
            grid.innerHTML = "";
            var i = St.dur, h = I.hours[i];
            card("house", "A household", "survey average: what members would pay to avoid it", usd2(I.household.event[i]));
            card("drop", "A dairy", "the survey's average business member: its direct costs", usd(I.business.event[i]));
            card("cross", "The county hospital", "illustrative: " + usd(Ho.perHour) + " an hour", usd(Ho.perHour * h));
            note.textContent = "Per kWh not delivered, the household would pay " + usd2(I.household.kwh[i]) + " to avoid it: about " + times(I.household.kwh[i], I.retailCents.residential / 100) + " times the 2025 U.S. residential average of " + I.retailCents.residential + "¢ per kWh (2025 dollars).";
            if (picks >= 1) { api.saw("The same " + I.names[i] + ": the household would pay " + usd2(I.household.event[i]) + " to avoid them, the dairy loses " + usd(I.business.event[i]) + " and the hospital " + usd(Ho.perHour * h) + ". The [[value-of-lost-load|value of lost load]] is not one number."); api.done(); }
          }
          paint();
        } },
      { text: "Prairie Campus's [[feeder|feeder]] fails " + fmt1(outageCount(O)) + " times a year on average, from " + O.hours[0] + " to " + O.hours[O.hours.length - 1] + " hours (illustrative). Which outages cost the hospital most over a year?",
        build: function (act, api) {
          var box = H("div", {}, act);
          var pr = LX.Predict(act, { id: "a14-which", q: "", title: false, fresh: true, answer: "long",
            options: [{ value: "short", label: "The many short ones" }, { value: "long", label: "The few long ones" }],
            feedback: { short: "Short ones are frequent, but each covers few hours.", long: "Yes: rare long outages carry most of the hours." },
            onPick: function () { pr.reveal(); act.appendChild(box); table(box); api.done(); } });
          function table(b) {
            var C = contributions(O, Ho.perHour), long = C.filter(function (x) { return x.hours >= 12; });
            var t = H("table", { class: "lx-mini-table a14-tab" }, H("div", { class: "lx-scroll-x" }, b));
            t.innerHTML = "<caption class=\"lx-hint\">A year of outages at the hospital (illustrative), at " + usd(Ho.perHour) + " an hour</caption><thead><tr><th scope=\"col\">Length</th><th scope=\"col\">Outages a year</th><th scope=\"col\">Hours a year</th><th scope=\"col\">Cost a year</th></tr></thead><tbody>" +
              C.map(function (x) { return "<tr><td>" + x.hours + " h</td><td class=\"n\">" + x.perYear + "</td><td class=\"n\">" + fmt2(x.expHours) + "</td><td class=\"n\">" + usd(x.cost) + "</td></tr>"; }).join("") +
              "<tr class=\"tot\"><th scope=\"row\">All</th><td class=\"n\">" + fmt2(outageCount(O)) + "</td><td class=\"n\">" + fmt2(totalHours(O)) + "</td><td class=\"n\">" + usd(Ho.perHour * totalHours(O)) + "</td></tr></tbody>";
            var lh = long.reduce(function (s, x) { return s + x.expHours; }, 0), ln = long.reduce(function (s, x) { return s + x.perYear; }, 0);
            api.saw("Outages of 12 hours or more are " + pct(ln / outageCount(O)) + " of the outages but " + pct(lh / totalHours(O)) + " of the hours: " + usd(Ho.perHour * lh) + " of the hospital's expected " + usd(Ho.perHour * totalHours(O)) + " a year.");
          }
        } },
      { text: "A battery covers the first hours of every outage. Each extra hour costs " + usd(batteryHourCost(D)) + " a year, on top of the switch, the controls and the battery's [[inverter|inverter]]. Slide its size.",
        build: function (act, api) {
          sizeStep(act, api, "battery", false);
          var wk = H("details", { class: "lx-textalt" }, act); H("summary", { text: "How an hour of battery costs " + usd(batteryHourCost(D)) + " a year" }, wk);
          H("div", { class: "lx-scroll-x", html: workedTable(D) }, wk);
        } },
      { text: "Nobody knows exactly what an hour without power costs a hospital. Try a lower and a higher value: does the battery start to pay?",
        build: function (act, api) { sizeStep(act, api, "battery", true); } },
      { text: "A generator makes long backup cheap: each extra hour is fuel in a tank, " + usd(D.costs.tankPerHour) + " a year. Slide the tank's hours.",
        build: function (act, api) { St.c = Ho.perHour; sizeStep(act, api, "gen", false); } },
      { text: "A battery can also earn every day: trimming the campus's monthly peak cuts its [[demand-charge|demand charge]] by " + usd(everydaySavings(D)) + " a year (illustrative). Compare three designs, with and without that saving.",
        build: function (act, api) {
          St.c = Ho.perHour;
          var tg = LX.Toggle(H("div", { class: "lx-toggles" }, act), { label: "Count the campus's bill savings", on: St.everyday, onChange: function (on) { St.everyday = on; flips++; paint(); } });
          var flips = 0, box = H("div", { class: "lx-scroll-x" }, act);
          H("p", { class: "lx-hint", text: billWorked(D) }, act); H("p", { class: "lx-hint", text: D.texts.stackAssume }, act); H("p", { class: "lx-hint", text: D.texts.billNote }, act);
          function paint() {
            var rows = D.designs.map(function (d) { return { d: d, x: design(D, d, Ho.perHour, { everyday: St.everyday }) }; });
            var top = rows.reduce(function (a, b) { return b.x.net > a.x.net ? b : a; });
            box.innerHTML = "<table class=\"lx-mini-table a14-tab\"><caption class=\"lx-hint\">Each design a year, 2025 dollars (illustrative)</caption><thead><tr><th scope=\"col\">Design</th><th scope=\"col\">Annual cost</th><th scope=\"col\">Outage cost avoided</th><th scope=\"col\">Bill savings</th><th scope=\"col\">Net</th></tr></thead><tbody>" +
              rows.map(function (r) { return "<tr" + (r === top ? " class=\"best\"" : "") + "><th scope=\"row\">" + r.d.label + "</th><td class=\"n\">" + usd(r.x.annual) + "</td><td class=\"n\">" + usd(r.x.avoided) + "</td><td class=\"n\">" + usd(r.x.everyday) + "</td><td class=\"n\">" + signed(r.x.net) + "</td></tr>"; }).join("") + "</tbody></table>";
            api.saw(stackFeedback(D));
            if (flips >= 1) api.done();
          }
          paint();
        } },
      { text: "Who owns the microgrid decides who pays, who gains and who carries the risk. Pick owners for the battery-and-generator design and compare.",
        build: function (act, api) {
          var tried = {}, card = H("div", { class: "a14-owner", "aria-live": "polite" }, act), hint = H("p", { class: "lx-hint", text: D.texts.ownersNote }, act);
          seg(H("div", { class: "cf-ctl" }, act), "Owner", D.owners.map(function (o) { return [o.key, o.label]; }), St.owner, function (k) { St.owner = k; tried[k] = true; keep(); paint(); });
          act.insertBefore(act.lastChild, card);
          act.insertBefore(H("p", { class: "lx-hint", text: "Compare two owners or more." }, act), card);
          function paint() {
            card.innerHTML = "";
            if (!St.owner) { H("p", { class: "lx-hint", text: "Pick an owner." }, card); return; }
            var o = D.owners.filter(function (x) { return x.key === St.owner; })[0], x = design(D, D.designs[2], Ho.perHour, { everyday: true, rate: o.rate });
            var ch = H("div", { class: "lx-readouts" }, card);
            chips(ch, [["Borrows at (illustrative)", (o.rate * 100).toFixed(0) + "%"], ["Annual cost", usd(x.annual)], ["Outage cost avoided", usd(x.avoided)], ["Campus bill savings", usd(x.everyday)], ["Net, campus savings counted", signed(x.net), x.net < 0 ? "bad" : null]]);
            [["Pays", o.pays], ["Gains", o.gains], ["Carries the risk", o.risk]].forEach(function (r) { H("p", { html: "<b>" + r[0] + ":</b> " + LX.rich(r[1]) }, card); });
            var n = Object.keys(tried).length;
            if (onOwner) onOwner(St.owner);
            api.saw(ownerFeedback(D, o), n < 2);
            if (n >= 2) api.done();
          }
          paint();
        } },
      { text: "A village [[mini-grid|mini-grid]] with no grid pays for its panels, battery and wires every year. Tap the cases: what does each kWh cost when a mill and a cold store join the homes?",
        build: function (act, api) {
          var V = D.village, rows = CASES.map(function (c) { return { c: c, x: villageCase(V, c.o) }; });
          var scale = Math.max.apply(null, rows.map(function (r) { return r.x.perKWh; })) * 1.05;
          var cs = LX.CostSplit(act, { parts: [{ key: "panels", label: "Panels", color: "var(--lx-solar)" }, { key: "battery", label: "Battery", color: "var(--lx-bat)" }, { key: "fixed", label: "Wires, meters and staff", color: "var(--lx-ink-3)" }],
            rows: rows.map(function (r) { return { key: r.c.key, label: r.c.label, color: "var(--lx-ink-2)", values: r.x.parts, total: r.x.perKWh,
              aria: r.c.label + ": " + usd2(r.x.perKWh) + " per kWh, with " + r.x.kw + " kW of panels and " + r.x.kwh + " kWh of battery" }; }),
            scale: scale, fmt: function (v) { return usd2(v) + "/kWh"; }, onPick: function (k) { St.vcase = k; St.vseen[k] = true; paint(); } });
          H("p", { class: "lx-hint", text: D.texts.villageToy }, act);
          var out = H("div", { class: "lx-readouts", "aria-live": "polite" }, act);
          var tb = H("details", { class: "lx-textalt" }, act); H("summary", { text: "The four cases as a table" }, tb); H("div", { class: "lx-scroll-x", html: villageTable(D) }, tb);
          function paint() {
            var r = rows.filter(function (x) { return x.c.key === St.vcase; })[0];
            chips(out, [["Panels", r.x.kw + " kW"], ["Battery", r.x.kwh + " kWh"], ["Energy a year", Math.round(r.x.kwhYear).toLocaleString("en-US") + " kWh"], ["Cost per kWh", usd2(r.x.perKWh)]]);
            if (Object.keys(St.vseen).length >= 2) { api.saw(villageFeedback(D)); api.done(); }
          }
          paint();
          cs.el.classList.add("a14-split");
        } }
    ] });

    function fmt1(v) { return (Math.round(v * 100) / 100).toString(); }
    function fmt2(v) { return (Math.round(v * 100) / 100).toLocaleString("en-US"); }
    function pct(v) { return Math.round(v * 100) + "%"; }

    // steps 3-5: size a battery (or a generator's tank) against the hospital's cost of an hour without power
    function sizeStep(act, api, kind, values) {
      var max = kind === "battery" ? 12 : 72, Hs = kind === "battery" ? St.bat : St.gen, tried = {};
      if (values) {
        var row = H("div", { class: "cf-ctl" }, act); H("p", { class: "cf-ctl-l", text: "The hospital's cost of an hour without power" }, row);
        seg(row, "Cost of an hour without power", Ho.values.map(function (v) { return [v, usd(v)]; }), St.c, function (v) { St.c = v; tried[v] = true; paint(); });
      } else St.c = Ho.perHour;
      var ctl = H("div", { class: "lx-ctls" }, act);
      var sl = LX.Slider(ctl, { label: kind === "battery" ? "Battery: hours of hospital load" : "Generator: hours of fuel in the tank", color: kind === "battery" ? COL.battery : COL.gen,
        min: 0, max: max, step: 1, value: Hs, fmt: function (v) { return v + " h"; }, onChange: function (v) { if (kind === "battery") St.bat = v; else St.gen = v; moved = true; paint(); } });
      var out = H("div", { class: "lx-readouts", "aria-live": "polite" }, act);
      var P = LX.Plot(act, { text: "Text version of the chart" }), moved = false;
      function paint() {
        var h = kind === "battery" ? St.bat : St.gen, x = design(D, kind === "battery" ? { bat: h } : { gen: h }, St.c), nx = nextHour(D, kind, h, St.c);
        var b = best(D, kind, St.c, max), m = marginalSize(D, kind, St.c, max);
        var cl = [["Annual cost", usd(x.annual)], ["Outage cost avoided", usd(x.avoided)], ["Net", signed(x.net), x.net < 0 ? "bad" : null],
                  [kind === "battery" ? "Next hour saves / costs, fixed equipment apart" : "Next hour saves after fuel / costs", h < max ? usd(nx.saves) + " / " + usd(nx.costs) : "–"]];
        if (h === 0) cl.push(["First hour with its fixed equipment", usd(design(D, kind === "battery" ? { bat: 1 } : { gen: 1 }, St.c).annual) + " a year"]);
        chips(out, cl);
        P.render(sizeSpec(D, kind, St.c, h, max));
        if (kind === "battery" && !values) {
          var n0 = nextHour(D, "battery", 0, St.c);
          api.saw("Even the first hour saves only " + usd(n0.saves) + " a year against its " + usd(n0.costs) + ", before the fixed switch, controls and inverter. At " + usd(St.c) + " an hour, no battery pays from outages alone.");
          if (moved) api.done();
        } else if (kind === "battery") {
          var bm = design(D, { bat: m }, St.c);
          api.saw(m === 0 ? "At " + usd(St.c) + " an hour not even the first hour passes: no battery." :
            "At " + usd(St.c) + " an hour each hour up to " + m + " saves more than it costs, but " + m + " hours cost " + usd(bm.annual) + " a year against " + usd(bm.avoided) + " avoided" +
            (b.bat ? ": the best battery is " + b.bat + " hours, " + signed(b.net) + " a year." : ": the fixed costs still sink it."));
          if (Object.keys(tried).length >= 2) api.done();
        } else {
          api.saw("Each hour up to " + m + " still saves more than its " + usd(D.costs.tankPerHour) + ": the best tank holds " + b.gen + " hours, " + signed(b.net) + " a year. Diesel is cheap backup but burns fuel, and must start when needed.");
          if (moved) api.done();
        }
      }
      paint();
    }

    // demo states (core.js LX.demo): "mid" = step 3 with a 2-hour battery; "value" (step 4 at the highest value),
    // "gen" (step 5 at its best tank), "stack" (step 6), "owners" (step 7, the co-op), "village" (step 8, two cases)
    LX.demo(root, function (state) {
      if (state === "term") { cards.go(0); setTimeout(function () { var tm = live.querySelector(".lx-step-text .lx-term"); if (tm) tm.click(); }, 600); return { view: "a glossary popover open" }; }
      if (state === "mid") { St.bat = 2; cards.go(2); return { view: "battery 2 h" }; }
      if (state === "value") { cards.go(3); var bs = live.querySelectorAll(".lx-step-act .lx-seg button"); if (bs.length) bs[bs.length - 1].click(); return { view: "value $27,000" }; }
      if (state === "gen") { St.gen = 72; cards.go(4); return { view: "generator 72 h" }; }
      if (state === "stack") { cards.go(5); return { view: "three designs" }; }
      if (state === "owners") { St.owner = "coop"; cards.go(6); return { view: "co-op owner" }; }
      if (state === "village") { cards.go(7); var r = live.querySelectorAll(".lx-step-act .lx-cs-row, .lx-step-act button[aria-pressed]"); if (r[1]) r[1].click(); if (r[3]) r[3].click(); return { view: "village" }; }
      return null;
    }, cards);
    root.lxLesson = { model: model, cards: cards, S: St };
    var ledger = buildExplain(D, St);
    onOwner = ledger ? ledger.setOwner : null;
  });

  // ---------------------------------------------------------------- the explain layer
  function buildExplain(D, St) {
    var x = document.getElementById("a14-explain"); if (!x) return;
    x.innerHTML = ""; x.classList.add("is-live");
    var Ho = D.hospital, O = D.outages;
    // 1 the comparison table (e-table): four owners, one design
    var c1 = H("div", { class: "lx-xcard wide" }, x);
    LX.CompareTable(c1, { title: "Four owners, one microgrid", text: true,
      columns: [{ key: "name", label: "Owner", main: true }, { key: "pays", label: "Who pays" }, { key: "gains", label: "Who gains" }, { key: "risk", label: "Who carries the risk" }, { key: "cost", label: "Annual cost" }],
      rows: D.owners.map(function (o) { var d = design(D, D.designs[2], Ho.perHour, { everyday: true, rate: o.rate }); return { key: o.key, color: "var(--lx-tier-2)", name: o.label, note: "borrows at " + (o.rate * 100).toFixed(0) + "% (illustrative)", pays: o.pays, gains: o.gains, risk: o.risk, cost: usd(d.annual) }; }),
      caption: D.texts.tableCaption });
    // 2 the ledger (e-ledger): the battery-and-generator design, with the reader's owner (or the utility); setOwner(key)
    // redraws it when the reader picks another owner in step 7
    var c2 = H("div", { class: "lx-xcard" }, x);
    H("header", { class: "lx-x-head", html: "<h3>The ledger, a year</h3>" }, c2);
    var lhost = H("div", { "aria-live": "polite" }, c2);
    H("p", { class: "lx-hint", text: D.texts.billNote }, c2);
    function setOwner(key) {
      var o = D.owners.filter(function (q) { return q.key === key; })[0] || D.owners[0], d = design(D, D.designs[2], Ho.perHour, { everyday: true, rate: o.rate });
      lhost.innerHTML = "";
      H("p", { class: "lx-hint", text: "Battery 2 hours and generator 72 hours, owned by " + o.label.toLowerCase() + " (" + (o.rate * 100).toFixed(0) + "%); 2025 dollars, illustrative." }, lhost);
      LX.Ledger(lhost, { cls: "a14-ledger", columns: ["A year", "Who", "Amount"],   // LX.Ledger (components/ledger.js)
        rows: ledgerRows(D, o).map(function (r) { return { head: r.head, cells: [{ text: r.who, cls: "who" }, signed(r.v)], total: !!r.total }; }) });
      D.texts.ledgerNotes.concat([PROFIT]).forEach(function (t) { H("p", { class: "lx-hint", text: t }, lhost); });
    }
    setOwner(St.owner);
    // 3 the causal chain (e-chain)
    var c3 = H("div", { class: "lx-xcard" }, x), b9 = best(D, "battery", Ho.perHour, 12), g9 = best(D, "gen", Ho.perHour, 72);
    LX.CausalChain(c3, { title: "From an outage to a decision", links: [
      { title: "Outages happen", text: "Some short, a few long; each class has a length and a frequency.", value: (Math.round(totalHours(O) * 100) / 100) + " h a year" },
      { title: "Each hour costs someone", text: "The value of lost load differs by customer and by length.", value: usd(Ho.perHour) + " an hour" },
      { title: "Backup avoids part of it", text: "The next hour of backup avoids less, because fewer outages last that long.", value: "first hour " + usd(Ho.perHour * M_S(O, 0)) },
      { title: "It costs a fixed sum a year", text: "Capital spread over its life, at the owner's borrowing rate, plus upkeep.", value: usd(batteryHourCost(D)) + " per battery hour" },
      { title: "Buy hours while they pay", text: "Then check the whole design covers its fixed costs too.", value: "battery " + b9.bat + " h · tank " + g9.gen + " h" }
    ], note: "Everyday savings, emissions and who carries the risk sit outside this chain: add them before deciding." });
    return { setOwner: setOwner };
  }
  function M_S(O, h) { return S(O, h); }
})();
