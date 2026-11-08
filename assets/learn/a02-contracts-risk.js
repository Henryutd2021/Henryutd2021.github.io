// a02-contracts-risk.js — Analyst lesson A2, "Who carries the risk? Power purchase agreements and risk allocation"
// (step cards, simulation mode).
//
// Data (read through data-src):
//   assets/learn/data/07-cost.json            the solar farm's capacity factor (24.0%, EIA, U.S. utility-scale solar PV, 2025), as in
//                                             lesson 7, so the plant's typical output agrees with the course
//   assets/learn/data/a02-contracts-risk.json the plant (100 MW solar, a 50 MW 4-hour battery), the buyer, the seeded
//                                             simulation (200 price years, seed 2025) and its five illustrative drivers,
//                                             and the sources for the contract types
// One price year: every dollar is a real 2025 dollar. A "price year" is one simulated year of market conditions.
// Every contract is settled in cash (a financial PPA): the buyer buys its power at the hub, and the contract pays the
// difference between the contract price (the strike) and a floating price. No hour-by-hour delivery is modelled.
//
// Model (simulation; yearly totals, no solver):
//   each price year draws five independent drivers from the seeded generator (LX.Drill.rng, a linear congruential
//   generator; normal draws by the Box-Muller method, two uniforms each):
//     P  hub price, $/MWh (lognormal)      c  solar capture ratio (normal, cut): the output-weighted hub price over P
//     v  output share (normal, cut)         b  basis, node − hub, output-weighted, $/MWh (normal)
//     s  battery margin, $/MWh discharged, after charging costs and losses (lognormal)
//   typical solar output E0 = MW × 8,760 × CF; this year's E = v × E0; the battery discharges D = MW × hours × cycles
//   the buyer needs L = E0 MWh, flat; without a contract it pays L × P
//   solar contracts (the seller's yearly revenue R, and what the contract adds to the buyer's yearly cost, X):
//     merchant   R = E (cP + b)                          X = 0
//     node       R = E K          (fixed price, as generated, settled at the plant's node)   X = E (K − cP − b)
//     hub        R = E (K + b)    (fixed price, as generated, settled at the hub)            X = E (K − cP)
//     block      R = E (cP + b) + L (K − P)   (fixed price, shaped: a flat block of L MWh, settled at the hub)   X = L (K − P)
//   battery: merchant  R = s D, X = 0;  toll  R = T × kW, X = T × kW − s D  (the buyer runs it and keeps the margin)
//   the fair price of each contract is the price at which the buyer's expected cost equals its cost without a contract,
//   from the drivers' expected values (independent draws, symmetric cuts): K_node = E[c] E[P] + E[b], K_hub = E[c] E[P],
//   K_block = E[P], T = E[s] D ÷ kW. The 200 sampled years average close to these, not exactly (sampling noise).
//   statistics: mean, and percentiles by linear interpolation at rank (n − 1) p ("type 7", as toolbox K5)
//   exposure(): which drivers move each party's result under a contract: each driver nudged in each simulated year, so
//   interactions count (an as-generated contract's settled MWh move the buyer's bill whenever the floating price differs
//   from the strike: output is then both parties' risk)
// Every number the page states is checked against this model by _tests/learn/test_a02-contracts-risk.js.
(function () {
  "use strict";
  var DR = (typeof window !== "undefined" && window.LX && window.LX.Drill) || require("./components/drill.js");

  // ---------------------------------------------------------------- pure model (no DOM; exported for Node)
  var HOURS = 8760, CONTRACTS = ["merchant", "node", "hub", "block"], BATTERY = ["merchant", "toll"], DRIVERS = ["P", "c", "v", "b", "s"];
  function normal(r) { var u = r(), w = r(); if (u < 1e-12) u = 1e-12; return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * w); }
  function clip(x, lo, hi) { return lo == null ? x : Math.max(lo, Math.min(hi, x)); }
  // the plant and buyer from the data files
  function setup(D7, DA) {
    var pl = DA.plant, cf = D7.techs.solar.cf;
    var E0 = pl.solarMW * HOURS * cf / 100, D = pl.batteryMW * pl.batteryHours * pl.cyclesPerYear;
    return { E0: E0, L: E0, D: D, kW: 1000 * pl.batteryMW, cf: cf, solarMW: pl.solarMW, batteryMW: pl.batteryMW, hours: pl.batteryHours, cycles: pl.cyclesPerYear };
  }
  // one price year: the five drivers
  function draw(S, r) {
    var h = S.hub, c = S.capture, v = S.volume, b = S.basis, s = S.spread;
    return { P: h.median * Math.exp(h.sigma * normal(r)), c: clip(c.mean + c.sd * normal(r), c.min, c.max), v: clip(v.mean + v.sd * normal(r), v.min, v.max),
             b: b.mean + b.sd * normal(r), s: s.median * Math.exp(s.sigma * normal(r)) };
  }
  function simulate(DA, seed, n) {
    var S = DA.sim, r = DR.rng(seed == null ? S.seed : seed), out = [];
    for (var k = 0; k < (n || S.years); k++) out.push(draw(S, r));
    return out;
  }
  // the drivers' expected values (lognormal mean = median × e^(σ²/2); the cuts are symmetric, so the normal means stay)
  function expected(DA) {
    var S = DA.sim;
    return { P: S.hub.median * Math.exp(S.hub.sigma * S.hub.sigma / 2), c: S.capture.mean, v: S.volume.mean, b: S.basis.mean, s: S.spread.median * Math.exp(S.spread.sigma * S.spread.sigma / 2) };
  }
  // the fair price of each contract ($/MWh; the toll in $ per kW a year)
  function fair(DA, P0) {
    var e = expected(DA);
    return { merchant: null, node: e.c * e.P + e.b, hub: e.c * e.P, block: e.P, toll: e.s * P0.D / P0.kW };
  }
  // one year's results under a contract: seller revenue R and buyer cost Y (both $), with their parts
  function year(P0, y, contract, battery, K, T) {
    var E = y.v * P0.E0, L = P0.L, solar, x;
    if (contract === "merchant") { solar = E * (y.c * y.P + y.b); x = 0; }
    else if (contract === "node") { solar = E * K; x = E * (K - y.c * y.P - y.b); }
    else if (contract === "hub") { solar = E * (K + y.b); x = E * (K - y.c * y.P); }
    else { solar = E * (y.c * y.P + y.b) + L * (K - y.P); x = L * (K - y.P); }
    // battery "none": the solar farm alone (steps 2 to 5 of the page)
    var bat = battery === "none" ? 0 : battery === "toll" ? T * P0.kW : y.s * P0.D, bx = battery === "toll" ? T * P0.kW - y.s * P0.D : 0;
    return { R: solar + bat, solar: solar, bat: bat, Y: L * y.P + x + bx, settle: x, E: E };
  }
  function quantile(xs, p) {   // xs sorted ascending; linear interpolation at rank (n − 1) p
    var h = (xs.length - 1) * p, lo = Math.floor(h), hi = Math.ceil(h);
    return xs[lo] + (h - lo) * (xs[hi] - xs[lo]);
  }
  function stats(vals) {
    var xs = vals.slice().sort(function (a, b) { return a - b; }), m = 0;
    xs.forEach(function (v) { m += v; }); m /= xs.length;
    return { mean: m, p10: quantile(xs, 0.1), p50: quantile(xs, 0.5), p90: quantile(xs, 0.9), min: xs[0], max: xs[xs.length - 1], width: quantile(xs, 0.9) - quantile(xs, 0.1), n: xs.length };
  }
  // run every year under a contract; K and T default to the fair prices
  function run(P0, years, contract, battery, K, T, F) {
    var R = [], Y = [], X = [];
    years.forEach(function (y) { var o = year(P0, y, contract, battery, K == null ? F[contract] : K, T == null ? F.toll : T); R.push(o.R); Y.push(o.Y); X.push(o.settle); });
    return { R: R, Y: Y, X: X, sR: stats(R), sY: stats(Y) };
  }
  // which drivers move each party's yearly result (seller R, buyer Y) under a contract: in each simulated year (default:
  // the page's 200), one driver is nudged (1%; the basis by $0.50) with the others at that year's values, so interactions
  // count. At the drivers' expected values an as-generated contract's strike equals the floating price, which hides the
  // buyer's output exposure; across real years it shows. A party is exposed when its result moves by more than $1 in any
  // year; dR and dY are the largest moves ($)
  function exposure(P0, DA, contract, battery, years) {
    var F = fair(DA, P0), Ys = years || simulate(DA), out = {};
    DRIVERS.forEach(function (k) {
      var dR = 0, dY = 0;
      Ys.forEach(function (y0) {
        var y = {}; DRIVERS.forEach(function (j) { y[j] = y0[j]; }); y[k] = k === "b" ? y0.b - 0.5 : y0[k] * 1.01;
        var a = year(P0, y0, contract, battery, F[contract], F.toll), o = year(P0, y, contract, battery, F[contract], F.toll);
        dR = Math.max(dR, Math.abs(o.R - a.R)); dY = Math.max(dY, Math.abs(o.Y - a.Y));
      });
      out[k] = { seller: dR > 1, buyer: dY > 1, dR: dR, dY: dY };
    });
    return out;
  }

  // ---------------------------------------------------------------- number formats
  function usd(v, d) { d = d == null ? 2 : d; return (v < 0 ? "−$" : "$") + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }); }
  function musd(v, d) { d = d == null ? 1 : d; var x = +(v / 1e6).toFixed(d); return (x < 0 ? "−$" : "$") + Math.abs(x).toFixed(d) + "M"; }
  function mrange(st) { return musd(st.p10) + " to " + musd(st.p90); }
  function pct(v, d) { return (v * 100).toFixed(d == null ? 0 : d) + "%"; }
  function num(v) { return (v < 0 ? "−" : "") + Math.abs(v).toLocaleString("en-US"); }
  function mwh(v) { return Math.round(v).toLocaleString("en-US"); }

  // ---------------------------------------------------------------- the page's story for one seed
  var NAMES = { merchant: "No contract", node: "Fixed price, settled at the node", hub: "Fixed price, settled at the hub", block: "Fixed price, shaped: a flat block" };
  // the contract's name with its strike at the fair price (the picker's buttons)
  function named(c, F) { return NAMES[c] + (c === "merchant" ? "" : " · " + usd(F[c]) + "/MWh"); }
  var SHORT = { merchant: "no contract", node: "settled at the node", hub: "settled at the hub", block: "a flat block" };
  var DRIVER_NAMES = { P: "Hub price level", c: "Shape (capture ratio)", v: "Output (weather)", b: "Basis (node − hub)", s: "Battery margin" };
  function summary(D7, DA, seed, offset) {
    var P0 = setup(D7, DA), F = fair(DA, P0), Y = simulate(DA, seed), sm = { seed: seed == null ? DA.sim.seed : seed, P0: P0, F: F, exp: expected(DA), years: Y, solar: {}, plant: {} };
    CONTRACTS.forEach(function (c) {
      sm.solar[c] = run(P0, Y, c, "none", null, null, F);
      sm.plant[c] = { merchant: run(P0, Y, c, "merchant", null, null, F), toll: run(P0, Y, c, "toll", null, null, F) };
    });
    // the price step: the fair price plus an offset, for each contract, with the battery as the reader left it
    sm.at = function (c, battery, off) { return run(P0, Y, c, battery, c === "merchant" ? null : F[c] + (off || 0), null, F); };
    // axes in $M, in whole millions, that hold every run of this seed: the solar farm alone (steps 2 to 5 and 7, with the
    // price offsets) and the whole plant (step 6)
    var ax = function (v) { var lo = Math.min.apply(null, v) / 1e6, hi = Math.max.apply(null, v) / 1e6; return { min: Math.floor(lo - 0.25), max: Math.ceil(hi + 0.25) }; };
    var solarRuns = [], plantRuns = [];
    CONTRACTS.forEach(function (c) {
      solarRuns.push(sm.solar[c], sm.at(c, "none", DA.priceOffsets[0]), sm.at(c, "none", DA.priceOffsets[1]));
      plantRuns.push(sm.plant[c].merchant, sm.plant[c].toll);
    });
    var cat = function (runs, key) { return runs.reduce(function (a, r) { return a.concat(r[key]); }, []); };
    sm.ax = { solar: { R: ax(cat(solarRuns, "R")), Y: ax(cat(solarRuns, "Y")) }, plant: { R: ax(cat(plantRuns, "R")), Y: ax(cat(plantRuns, "Y")) } };
    sm.batM = stats(Y.map(function (y) { return y.s * P0.D; }));
    sm.tollY = F.toll * P0.kW;
    return sm;
  }
  // a histogram of yearly values ($) on an axis in $M: bins of `bin` $M
  function bins(vals, ax, bin) {
    var n = Math.round((ax.max - ax.min) / bin), out = [];
    for (var i = 0; i < n; i++) out.push({ x0: ax.min + i * bin, x1: ax.min + (i + 1) * bin, n: 0 });
    vals.forEach(function (v) { var k = Math.min(n - 1, Math.max(0, Math.floor((v / 1e6 - ax.min) / bin + 1e-9))); out[k].n++; });
    return out;
  }
  // the messages the cards print, for one seed (pure, so the test can check them)
  function texts(sm) {
    var S = sm.solar, F = sm.F, m = S.merchant, n = S.node, h = S.hub, b = S.block, P0 = sm.P0;
    var tollPlant = sm.plant.hub.toll, merchPlant = sm.plant.hub.merchant;
    var per1 = P0.E0 * stats(sm.years.map(function (y) { return y.v; })).mean;
    return {
      year: function (y, k) {
        var o = year(P0, y, "merchant", "merchant", null, F.toll);
        return "Price year " + k + ": the hub averaged " + usd(y.P) + "/MWh and output was " + pct(y.v) + " of typical. With no contract the solar farm sold " + musd(o.solar) + ", earning the hub's solar-hours price plus the basis.";
      },
      run: "Over 200 price years, the solar farm's sales ran from " + musd(m.sR.p10) + " ([[percentile|P10]]) to " + musd(m.sR.p90) + " (P90) a year, and the buyer's bill from " + musd(m.sY.p10) + " to " + musd(m.sY.p90) + ". One year in ten fell below each P10.",
      node: "Settled at the node, the seller keeps only output risk: " + mrange(n.sR) + ". The buyer carries price, shape and basis, and shares output risk, as the settled MWh follow output: " + mrange(n.sY) + ".",
      hub: "Settled at the hub, the basis moves back to the seller, whose range widens to " + mrange(h.sR) + ". The buyer's narrows to " + mrange(h.sY) + ".",
      block: "With a flat block, settled in cash, the buyer's bill is fixed at " + musd(b.sY.p50, 2) + ". The seller settles the block's hours its panels miss too, so it carries the shape: " + mrange(b.sR) + ".",
      toll: "Tolled, the battery pays its owner a fixed " + musd(sm.tollY, 2) + " a year. Its margin, " + mrange(sm.batM) + " over these years, now swings the buyer's bill instead.",
      own: "Run by its owner again, the battery's margin, " + mrange(sm.batM) + " over these years, swings the seller's result; the buyer's bill carries only the solar contract.",
      price: function (c, off) {
        var a = sm.at(c, "none", 0), z = sm.at(c, "none", off), d = z.sR.mean - a.sR.mean, e = z.sY.mean - a.sY.mean;
        if (off === 0) return "At the fair price the seller averages " + musd(a.sR.mean, 2) + " a year and the buyer pays " + musd(a.sY.mean, 2) + ".";
        return usd(Math.abs(off)) + " " + (off > 0 ? "above" : "below") + " the fair price: the seller averages " + musd(Math.abs(d), 2) + " a year " + (d > 0 ? "more" : "less") + " and the buyer pays " + musd(Math.abs(e), 2) + " " + (e > 0 ? "more" : "less") + ". The seller's P10 to P90 width: " + musd(a.sR.width, 2) + " → " + musd(z.sR.width, 2) + ".";
      },
      strike: function (c, off) {
        var k = F[c] + off;
        return "Contract price: " + usd(k) + "/MWh" + (off === 0 ? ", the fair price." : " (fair " + usd(F[c]) + " " + (off > 0 ? "+" : "−") + " " + usd(Math.abs(off)) + ").");
      },
      per1: per1
    };
  }
  // the seven cards' prompts (pure, so the test can check each is one or two sentences within the text budget)
  function prompts(P0, DA) {
    return [
      "A " + P0.solarMW + " MW [[photovoltaic|solar]] farm with a " + P0.batteryMW + " MW, " + P0.hours + "-hour battery sells into a market where five things change each year. Draw a price year and see what the solar farm sells with no contract.",
      "One year is one outcome: run all " + DA.sim.years + " price years with no contract, the seller selling at the market and the buyer buying at the hub. Read each range from P10 to P90.",
      "Sign a [[power-purchase-agreement|power purchase agreement]]: a fixed price for every MWh the solar farm makes, settled in cash against its own [[pricing-node|node]] price. Who still carries what?",
      "Now settle it against the [[trading-hub|trading hub]], an average over many nodes, while the seller still sells at its node. Where does the [[basis-risk|basis]] go?",
      "A shaped contract settles a flat block, the same MWh every hour, at a fixed price, whatever the panels make. Pick it: who carries the shape?",
      "Add the battery, whose owner keeps its [[battery-margin|margin]] with no contract. Under a [[tolling-agreement|toll]] the buyer pays a fixed fee per kW, runs it and keeps the margin: switch it on.",
      "Each contract was signed at its fair price, where the buyer expects to pay what it would without one. Move the price away from fair: what changes, and what does not?"];
  }
  // step 1's key: what each driver is, in one line each (glossary marks allowed)
  function key(P0) {
    return [
      "Output: a share of a typical year, " + P0.solarMW + " MW × 8,760 h × " + P0.cf.toFixed(1) + "% = " + mwh(P0.E0) + " MWh.",
      "[[pricing-node|Node]]: the price at the plant's own point on the grid. Hub: a regional reference price. Basis: node minus hub.",
      "Shape: the hub price per MWh of solar output, as a share of the hub's all-hours average (the [[capture-ratio|capture ratio]]).",
      "[[battery-margin|Battery margin]]: what the battery earns per MWh after paying for its charging and losses."];
  }
  // the explain layer's worked examples: one settlement (price year 1 of this seed) and the fair prices, each with the
  // rounded operands it shows (the test recomputes every one)
  function worked(sm) {
    var F = sm.F, P0 = sm.P0, y = sm.years[0], E = Math.round(y.v * P0.E0), w = +(y.c * y.P).toFixed(2), K = +F.hub.toFixed(2);
    var ex = { c: +sm.exp.c.toFixed(2), P: +sm.exp.P.toFixed(2), b: +sm.exp.b.toFixed(2), s: +sm.exp.s.toFixed(2) }, X = E * (K - w);
    return [
      { key: "settle", name: "Settlement, price year 1, at the hub", rule: "Output × (contract price − hub price per solar MWh)",
        calc: num(E) + " MWh × (" + usd(K) + " − " + usd(w) + ") ≈ " + musd(X, 2) + ": " + (X < 0 ? "the seller pays the buyer" : "the buyer pays the seller"), v: X, ops: [E, K, w] },
      { key: "node", name: "Fair price, settled at the node", rule: "Expected capture × expected hub price + expected basis",
        calc: ex.c + " × " + usd(ex.P) + (ex.b < 0 ? " − " : " + ") + usd(Math.abs(ex.b)) + " = " + usd(ex.c * ex.P + ex.b) + "/MWh", v: ex.c * ex.P + ex.b },
      { key: "hub", name: "Fair price, settled at the hub", rule: "Expected capture × expected hub price",
        calc: ex.c + " × " + usd(ex.P) + " = " + usd(ex.c * ex.P) + "/MWh", v: ex.c * ex.P },
      { key: "block", name: "Fair price, a flat block", rule: "The expected hub price", calc: usd(ex.P) + "/MWh", v: ex.P },
      { key: "toll", name: "Fair toll", rule: "Expected margin × MWh discharged ÷ kW ÷ 12 months",
        calc: usd(ex.s) + " × " + num(P0.D) + " ÷ " + num(P0.kW) + " ÷ 12 = " + usd(ex.s * P0.D / P0.kW / 12) + " per kW a month", v: ex.s * P0.D / P0.kW / 12 }];
  }
  // the no-JS table (written into the page by the test): P10 to P90 by contract, the solar farm alone, seed sm.seed
  function staticBlocks(sm) {
    var rows = CONTRACTS.map(function (c) {
      var r = sm.solar[c];
      return "<tr><td>" + NAMES[c] + "</td><td>" + (c === "merchant" ? "–" : usd(sm.F[c]) + "/MWh") + "</td><td>" + mrange(r.sR) + "</td><td>" + (r.sY.width < 5e3 ? musd(r.sY.p50, 2) + ", every year" : mrange(r.sY)) + "</td></tr>";
    }).join("\n");
    return { table: '<table class="a2-static" aria-label="P10 to P90 of 200 simulated price years, seed ' + sm.seed + ', solar farm alone, millions of 2025 dollars a year">\n' +
      '<thead><tr><th scope="col">Contract</th><th scope="col">Fair price</th><th scope="col">Seller\'s sales, P10 to P90</th><th scope="col">Buyer\'s bill, P10 to P90</th></tr></thead>\n<tbody>\n' + rows + "\n</tbody></table>" };
  }

  // ---------------------------------------------------------------- practice drill items (LX.Drill; seeded)
  var KINDS = ["settle", "who", "block", "p10", "fair", "toll"];
  function drillItem(k, r) {
    var kind = KINDS[k % KINDS.length], pick = function (a) { return a[Math.floor(r() * a.length)]; };
    if (kind === "settle") {
      var K = pick([28, 30, 32, 35]), X = pick([22, 26, 34, 38, 45]), Q = pick([150000, 200000, 250000]), v = Q * (K - X) / 1e6;
      return { kind: kind, q: "A hub-settled contract at $" + K + "/MWh. Over the plant's " + Q.toLocaleString("en-US") + " MWh the hub averaged $" + X + "/MWh. What does the buyer pay the seller, in $M (negative if the seller pays)?", answer: Math.round(v * 100) / 100, tol: 0.006, unit: "$M",
               why: Q.toLocaleString("en-US") + " × (" + K + " − " + X + ") = " + num(Q * (K - X)) + " dollars: " + (v >= 0 ? "the buyer pays the seller." : "the seller pays the buyer.") };
    }
    if (kind === "who") {
      var cases = [["node", "basis", 1, "Settled at the node, the buyer is paid the plant's own node price difference, so it carries the basis."],
                   ["hub", "basis", 0, "Settled at the hub, the seller sells at its node but is paid against the hub, so it carries the basis."],
                   ["hub", "price level", 1, "The seller gets the fixed price whatever the hub does; the buyer's bill moves with the hub."],
                   ["node", "output", 2, "As generated, the seller is paid only for what it makes, and the settled MWh follow output: a poor solar year moves the buyer's bill too."],
                   ["block", "shape", 0, "The block settles every hour, whatever the panels make: the seller carries the shape."],
                   ["block", "price level", 0, "The buyer's bill is fixed; when the hub price rises, the seller pays the buyer more on the block."],
                   ["toll", "battery margin", 1, "Under a toll the buyer runs the battery and keeps its margin, for a fixed fee."]];
      var cs = pick(cases), names = { node: "a fixed price settled at the node", hub: "a fixed price settled at the hub", block: "a flat block at a fixed price", toll: "a battery toll" };
      return { kind: kind, q: "Under " + names[cs[0]] + ", who carries the " + cs[1] + " risk?", choices: ["The seller", "The buyer", "Both"], answer: cs[2], why: cs[3], contract: cs[0], risk: cs[1] };
    }
    if (kind === "block") {
      var Q2 = pick([100000, 150000, 200000]), K2 = pick([33, 35, 37]), P2 = pick([25, 30, 45, 50]);
      return { kind: kind, q: "A buyer has a flat block of " + Q2.toLocaleString("en-US") + " MWh at $" + K2 + "/MWh, settled at the hub. The hub averages $" + P2 + "/MWh. What does the buyer pay for the block in all, in $M?", answer: Math.round(Q2 * K2 / 1e4) / 100, tol: 0.006, unit: "$M",
               why: "Market cost plus settlement: " + Q2.toLocaleString("en-US") + " × " + P2 + " + " + Q2.toLocaleString("en-US") + " × (" + K2 + " − " + P2 + ") = " + (Q2 * K2).toLocaleString("en-US") + " dollars, whatever the hub does." };
    }
    if (kind === "p10") {
      var xs = []; for (var i = 0; i < 10; i++) xs.push(pick([3, 4, 5, 6, 7, 8, 9]) + pick([0, 0.2, 0.4, 0.6, 0.8]));
      xs.sort(function (a, b) { return a - b; });
      var q = quantile(xs, 0.1);
      return { kind: kind, q: "Ten simulated years of revenue, sorted ($M): " + xs.map(function (x) { return x.toFixed(1); }).join(", ") + ". What is the P10, by linear interpolation at rank 9 × 0.1 = 0.9?", answer: Math.round(q * 100) / 100, tol: 0.006, unit: "$M",
               why: xs[0].toFixed(1) + " + 0.9 × (" + xs[1].toFixed(1) + " − " + xs[0].toFixed(1) + ") = " + q.toFixed(2) + " ($M)." };
    }
    if (kind === "fair") {
      var Pm = pick([30, 35, 40, 45]), c = pick([0.75, 0.8, 0.85, 0.9]), bm = pick([3, 2, 1]), node = pick([true, false]);
      var ans = c * Pm - (node ? bm : 0);
      return { kind: kind, q: "Hub price expected $" + Pm + "/MWh, solar capture ratio " + c + ", basis −$" + bm + "/MWh (the node below the hub). The fair fixed price for an as-generated contract settled at the " + (node ? "node" : "hub") + ", in $/MWh?", answer: Math.round(ans * 100) / 100, tol: 0.006, unit: "$/MWh",
               why: node ? c + " × " + Pm + " − " + bm + " = " + ans.toFixed(2) + ": at the node the basis is in the price." : c + " × " + Pm + " = " + ans.toFixed(2) + ": at the hub the seller keeps the basis." };
    }
    var Dm = pick([50000, 73000, 100000]), sm2 = pick([25, 35, 45, 55]), T2 = pick([40, 60, 80]), kW = pick([25000, 50000]);
    var g = (sm2 * Dm - T2 * kW) / 1e6;
    return { kind: "toll", q: "A battery toll: the buyer pays $" + T2 + " per kW a year for " + kW.toLocaleString("en-US") + " kW and earns $" + sm2 + " per MWh on " + Dm.toLocaleString("en-US") + " MWh. The buyer's gain, in $M (negative for a loss)?", answer: Math.round(g * 100) / 100, tol: 0.006, unit: "$M",
             why: sm2 + " × " + Dm.toLocaleString("en-US") + " − " + T2 + " × " + kW.toLocaleString("en-US") + " = " + num(sm2 * Dm - T2 * kW) + " dollars." };
  }
  function drill(seed, n) { return DR.series(drillItem, seed, n); }

  // rows of the "who carries which risk" table, from exposure() over the seed's years: the four solar contracts (no
  // battery), then the battery run by its owner and tolled to the buyer (the solar columns empty); a cell is "seller",
  // "buyer", "both" or "none", and cellText() words it, with a reason where both parties carry a driver
  var WHO = { seller: "Seller", buyer: "Buyer", both: "Both", none: "–" };
  var BOTH = { "merchant:P": "Both: seller's sales, buyer's bill", "node:v": "Both: the settled MWh follow output", "hub:v": "Both: the settled MWh follow output" };
  function allocation(P0, DA, years) {
    function cell(e) { return e.seller && e.buyer ? "both" : e.seller ? "seller" : e.buyer ? "buyer" : "none"; }
    var rows = CONTRACTS.map(function (c) { var e = exposure(P0, DA, c, "none", years); return { key: c, P: cell(e.P), c: cell(e.c), v: cell(e.v), b: cell(e.b), s: null }; });
    rows.push({ key: "own", P: null, c: null, v: null, b: null, s: cell(exposure(P0, DA, "merchant", "merchant", years).s) });
    rows.push({ key: "toll", P: null, c: null, v: null, b: null, s: cell(exposure(P0, DA, "merchant", "toll", years).s) });
    return rows;
  }
  function cellText(r, k) { return r[k] == null ? "–" : r[k] === "both" && BOTH[r.key + ":" + k] ? BOTH[r.key + ":" + k] : WHO[r[k]]; }

  var model = { HOURS: HOURS, CONTRACTS: CONTRACTS, BATTERY: BATTERY, DRIVERS: DRIVERS, normal: normal, setup: setup, draw: draw, simulate: simulate,
                expected: expected, fair: fair, year: year, quantile: quantile, stats: stats, run: run, exposure: exposure, allocation: allocation, cellText: cellText,
                usd: usd, musd: musd, mrange: mrange, pct: pct, mwh: mwh, rng: DR.rng,
                NAMES: NAMES, SHORT: SHORT, DRIVER_NAMES: DRIVER_NAMES, named: named, summary: summary, bins: bins, texts: texts, prompts: prompts, key: key, worked: worked, staticBlocks: staticBlocks,
                KINDS: KINDS, drillItem: drillItem, drill: drill };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;

  // ================================================================ view
  var LX = window.LX, H = LX.H;
  var COL = { seller: "var(--lx-solar)", buyer: "var(--lx-tier-2)", band: "var(--lx-ink-3)" };
  var BIN = 0.25;   // $M per histogram bin

  function readouts(host, labels, cls) {
    var box = H("div", { class: "lx-readouts" + (cls ? " " + cls : ""), "aria-live": "polite" }, host), out = {};
    labels.forEach(function (l) { var d = H("div", { class: "lx-readout" }, box); H("span", { text: l[1] }, d); out[l[0]] = H("b", null, d); });
    return out;
  }
  // one party's histogram: 200 price years in $0.25M bins, the P10 to P90 band, the median, and the no-contract band
  function Hist(host, o) {
    var card = H("div", { class: "a2-hist" }, host);
    H("p", { class: "a2-hist-t", text: o.title }, card);
    var ro = readouts(card, [["p10", "P10"], ["p50", "Median"], ["p90", "P90"]], "a2-ro");
    var P = LX.Plot(card, { text: "Text version of the chart", box: true });
    function draw(vals, st, ax, ghost, ghostLabel) {
      var B = bins(vals, ax, BIN), top = Math.max.apply(null, B.map(function (b) { return b.n; }));
      var yMax = top > 100 ? 200 : top > 40 ? 100 : top > 20 ? 40 : 20;
      var bars = B.filter(function (b) { return b.n; }).map(function (b) { return { x0: b.x0 + 0.02, x1: b.x1 - 0.02, y0: 0, y1: b.n, color: o.color }; });
      var spans = [{ x0: st.p10 / 1e6, x1: Math.max(st.p90 / 1e6, st.p10 / 1e6 + 0.04), color: o.color, op: 0.16 }];
      if (ghost) spans.unshift({ x0: ghost.p10 / 1e6, x1: ghost.p90 / 1e6, color: COL.band, op: 0.07 });
      ro.p10.textContent = musd(st.p10); ro.p50.textContent = musd(st.p50); ro.p90.textContent = musd(st.p90);
      var tk = []; for (var v = ax.min; v <= ax.max; v += (ax.max - ax.min > 10 ? 2 : 1)) tk.push([v, "$" + v + "M"]);
      P.render({ x: { min: ax.min, max: ax.max, ticks: tk, ticksN: tk.filter(function (t, i) { return i % 2 === 0; }) }, y: { min: 0, max: yMax, step: yMax / 4, fmt: function (q) { return String(q); } },
        height: 170, heightN: 150, ml: 40, bars: bars, spans: spans,
        marks: [{ x: st.p50 / 1e6, y: yMax, vline: true, label: "" }],
        legend: [{ label: "Price years per $0.25M", color: o.color }, { label: "Shaded: P10 to P90", color: o.color }, { label: "Dashed: median", color: "var(--lx-ink-3)", dash: "3 3" }]
          .concat(ghost ? [{ label: ghostLabel || "Grey: P10 to P90, no contract", color: COL.band }] : []),
        aria: o.title + ": 200 simulated price years, P10 " + musd(st.p10) + ", median " + musd(st.p50) + ", P90 " + musd(st.p90) + ", mean " + musd(st.mean, 2) + ".",
        text: { head: ["$M a year", "Price years"], rows: B.filter(function (b) { return b.n; }).map(function (b) { return [b.x0.toFixed(2) + " to " + b.x1.toFixed(2), String(b.n)]; }),
                note: "P10 " + musd(st.p10) + ", median " + musd(st.p50) + ", P90 " + musd(st.p90) + ", mean " + musd(st.mean, 2) + " (200 price years)." } });
    }
    return { draw: draw, el: card };
  }

  function view(live, data, root) {
    var D7 = data["07_cost"], DA = data["a02_contracts_risk"], ST = { seed: DA.sim.seed, contract: "merchant", battery: "merchant", off: 0 };
    var sm = summary(D7, DA, ST.seed), T = texts(sm), steps = [], autos = {}, redraws = [];
    var P0 = sm.P0, Q = prompts(P0, DA);
    function reseed(seed) {
      ST.seed = seed; sm = summary(D7, DA, seed); T = texts(sm);
      redraws.forEach(function (f) { f(); });
      if (refreshExplain) refreshExplain(sm);
    }
    // the seed row: the seed in words, a new seed, and back to the page's seed
    function seedRow(host) {
      var row = H("div", { class: "a2-seed" }, host), lab = H("span", { class: "a2-seed-l", "aria-live": "polite" }, row);
      var nb = H("button", { type: "button", class: "lx-btn ghost small", text: "Draw another " + DA.sim.years + " years" }, row), back = H("button", { type: "button", class: "lx-btn ghost small", text: "Back to seed " + DA.sim.seed }, row);
      // the seed is the number that fixes the draws: the same seed always gives the same years
      function paint() { lab.textContent = "Seed " + ST.seed + " · " + DA.sim.years + " price years · the same seed always gives the same years"; back.hidden = ST.seed === DA.sim.seed; }
      nb.addEventListener("click", function () { reseed((ST.seed * 7919 + 104729) % 100000 + 1); });
      back.addEventListener("click", function () { reseed(DA.sim.seed); });
      redraws.push(paint); paint();
    }
    // the contract picker
    function picker(host, keys, onPick) {
      var row = H("div", { class: "lx-choices-row a2-pick", role: "group", "aria-label": "Contract for the solar output" }, host), b = {};
      keys.forEach(function (k) {
        b[k] = H("button", { type: "button", class: "lx-choice", "aria-pressed": ST.contract === k ? "true" : "false", text: named(k, sm.F) }, row);
        b[k].addEventListener("click", function () { ST.contract = k; Object.keys(b).forEach(function (j) { b[j].setAttribute("aria-pressed", j === k ? "true" : "false"); }); onPick(k); });
      });
      return b;
    }
    // the two histograms for a contract and battery mode ("none": the solar farm alone)
    function pair(host, battery, offset) {
      var box = H("div", { class: "a2-pair" }, host);
      var hs = Hist(box, { title: battery === "none" ? "Seller: the solar farm's sales, $M a year" : "Seller: solar sales plus battery, $M a year", color: COL.seller });
      var hb = Hist(box, { title: "Buyer: its bill for 210,240 MWh, $M a year", color: COL.buyer });
      function draw() {
        var c = ST.contract, bat = typeof battery === "function" ? battery() : battery, off = offset ? offset() : 0;
        var r = sm.at(c, bat, off), g = bat === "none" ? sm.solar.merchant : sm.plant.merchant[bat === "toll" ? "merchant" : bat], ax = sm.ax[bat === "none" ? "solar" : "plant"];
        var gl = bat === "none" ? null : "Grey: P10 to P90, no contract and the battery run by its owner";
        hs.draw(r.R, r.sR, ax.R, c === "merchant" && bat !== "toll" ? null : g.sR, gl); hb.draw(r.Y, r.sY, ax.Y, c === "merchant" && bat !== "toll" ? null : g.sY, gl);
      }
      redraws.push(draw); draw();
      return { draw: draw };
    }

    // ---- step 1: one price year
    steps.push({
      text: Q[0],
      build: function (act, api) {
        var k = 0, btn = H("button", { type: "button", class: "lx-btn small", text: "Draw a price year" }, act);
        // first the two drivers the sales follow most, output and the hub price; the other three (shape, basis, battery
        // margin) wait in a box that the contract cards need later (each term carries a glossary popup)
        var ro = readouts(act, [["P", "Hub price, yearly average"], ["v", "Output, share of a typical year"], ["R", "Solar sales, no contract"]]), K = key(P0);
        var kl = H("ul", { class: "a2-key", "aria-label": "What output is" }, act);
        H("li", { html: LX.rich(K[0]) }, kl);
        var more = H("details", { class: "lx-textalt a2-more" }, act);
        H("summary", { text: "The other three drivers: shape, basis and battery margin" }, more);
        var ro2 = readouts(more, [["c", "Shape (capture ratio)"], ["b", "Basis, node − hub"], ["s", "Battery margin"]]);
        var kl2 = H("ul", { class: "a2-key", "aria-label": "What the other drivers are" }, more);
        K.slice(1).forEach(function (t) { H("li", { html: LX.rich(t) }, kl2); });
        function show() {
          var y = sm.years[(k - 1) % sm.years.length], o = year(P0, y, "merchant", "merchant", null, sm.F.toll);
          ro.P.textContent = usd(y.P) + "/MWh"; ro2.c.textContent = pct(y.c); ro.v.textContent = pct(y.v); ro2.b.textContent = (y.b < 0 ? "−$" : "+$") + Math.abs(y.b).toFixed(2) + "/MWh"; ro2.s.textContent = usd(y.s) + "/MWh"; ro.R.textContent = musd(o.solar);
          api.done(); api.saw(T.year(y, k));
        }
        btn.addEventListener("click", function () { k++; btn.textContent = "Draw the next price year"; show(); });
        autos[0] = function () { if (!k) btn.click(); };
      }
    });

    // ---- step 2: 200 price years, no contract
    steps.push({
      text: Q[1],
      build: function (act, api) {
        H("p", { class: "lx-hint a2-buyer", text: "The buyer uses " + num(P0.L / HOURS) + " MW in every hour, " + mwh(P0.L) + " MWh a year, the solar farm's typical output, and buys it at the hub." }, act);
        var btn = H("button", { type: "button", class: "lx-btn small", text: "Run " + DA.sim.years + " price years" }, act), host = H("div", null, act), ran = false;
        btn.addEventListener("click", function () {
          if (ran) return; ran = true; btn.hidden = true; ST.contract = "merchant";
          seedRow(host); pair(host, "none"); api.done(); api.saw(T.run);
          redraws.push(function () { if (ran) api.saw(T.run); });
        });
        autos[1] = function () { btn.click(); };
      }
    });

    // ---- steps 3 to 5: sign a contract for the solar output
    function contractStep(target, idx, text) {
      return {
        text: text,
        build: function (act, api) {
          seedRow(act);
          var keys = CONTRACTS.slice(0, CONTRACTS.indexOf(target) + 1);
          // a contract picked on a later card is not offered here: start from no contract, so the picker and charts agree
          if (keys.indexOf(ST.contract) < 0) ST.contract = "merchant";
          var b = picker(act, keys, function (k) { pr.draw(); say(k); });
          var pr = pair(act, "none");
          function say(k) { if (k === target) api.done(); api.saw(k === "merchant" ? T.run : T[k]); }
          redraws.push(function () { if (keys.indexOf(ST.contract) >= 0) say(ST.contract); });
          if (ST.contract !== "merchant" && keys.indexOf(ST.contract) >= 0) say(ST.contract);
          autos[idx] = function () { b[target].click(); };
        }
      };
    }
    steps.push(contractStep("node", 2, Q[2]));
    steps.push(contractStep("hub", 3, Q[3]));
    steps.push(contractStep("block", 4, Q[4]));

    // ---- step 6: who runs the battery?
    steps.push({
      text: Q[5],
      build: function (act, api) {
        seedRow(act);
        var own = ST.contract !== "merchant";
        if (!own) ST.contract = "hub";
        H("p", { class: "lx-hint", text: "Solar contract: " + NAMES[ST.contract].toLowerCase() + (own ? " (your last pick)." : ".") }, act);
        var tg = LX.Toggle(H("div", { class: "lx-toggles", role: "group", "aria-label": "Battery" }, act), { label: "Battery tolled to the buyer at " + usd(sm.F.toll / 12) + " per kW a month", on: ST.battery === "toll", onChange: function (on) { ST.battery = on ? "toll" : "merchant"; switched = true; pr.draw(); if (on) { api.done(); api.saw(T.toll); } else api.saw(T.own); } });
        var pr = pair(act, function () { return ST.battery; }), switched = false;
        redraws.push(function () { if (ST.battery === "toll") api.saw(T.toll); else if (switched) api.saw(T.own); });
        if (ST.battery === "toll") { api.done(); api.saw(T.toll); }
        autos[5] = function () { if (!tg.val()) tg.el.click(); };
      }
    });

    // ---- step 7: a price above or below the fair one
    steps.push({
      text: Q[6],
      build: function (act, api) {
        seedRow(act);
        if (ST.contract === "merchant") ST.contract = "hub";
        picker(act, ["node", "hub", "block"], function () { pr.draw(); say(false); });
        // the slider starts where the reader left it (ST.off), so the control and the charts always agree
        var sl = LX.Slider(act, { label: "Price minus the fair price", color: COL.seller, min: DA.priceOffsets[0], max: DA.priceOffsets[1], step: DA.priceStep, value: ST.off,
          fmt: function (v) { return (v > 0 ? "+" : v < 0 ? "−" : "") + "$" + Math.abs(v).toFixed(2) + "/MWh"; }, onChange: function () { ST.off = sl.val(); pr.draw(); say(true); } });
        var strike = H("p", { class: "lx-hint a2-strike", "aria-live": "polite" }, act);
        var pr = pair(act, "none", function () { return ST.off; });
        function say(user) { strike.textContent = T.strike(ST.contract, ST.off); if (user && ST.off !== 0) api.done(); api.saw(T.price(ST.contract, ST.off)); }
        redraws.push(function () { say(false); });
        say(false);
        autos[6] = function () { sl.set(DA.priceOffsets[1], true); };
      }
    });

    var refreshExplain = null;
    // each card's redraw hooks (seed changes) are dropped when another card is built
    steps.forEach(function (st) { var b0 = st.build; st.build = function (act, api) { redraws.length = 0; return b0(act, api); }; });
    var cards = LX.StepCards(live, { id: "a2-steps", steps: steps, onStep: function () { LX.emit("layout"); } });
    LX.demo(root, function (state) {   // "mid" = step 2 run; "step-N" = card N with its action done; "done" = the last card
      var k = state === "mid" ? 1 : state === "done" ? steps.length - 1 : /^step-(\d+)$/.test(state) ? Math.max(0, Math.min(steps.length - 1, +state.slice(5) - 1)) : -1;
      if (k < 0) return null;
      cards.go(k); if (autos[k]) autos[k]();
      return { view: "step " + (k + 1) };
    }, cards);
    refreshExplain = explain(D7, DA, sm);
    drillView();
  }

  // ---------------------------------------------------------------- explain layer
  function explain(D7, DA, sm0) {
    var x = document.getElementById("a2-explain"); if (!x) return null;
    function build(sm) {
      x.innerHTML = "";
      var P0 = sm.P0, A = allocation(P0, DA, sm.years);
      LX.CompareTable(H("div", { class: "lx-xcard" }, x), {
        title: "Who carries which risk", text: true,
        caption: "Whose yearly result moves when one driver moves, checked in each of the 200 price years: the four solar contracts without the battery, then the battery on its own.",
        columns: [{ key: "name", label: "Contract", main: true }, { key: "P", label: "Price level" }, { key: "c", label: "Shape" }, { key: "v", label: "Output" }, { key: "b", label: "Basis" }, { key: "s", label: "Battery margin" }],
        rows: A.map(function (r) {
          var nm = r.key === "toll" ? "Battery, tolled to the buyer" : r.key === "own" ? "Battery, run by its owner" : NAMES[r.key];
          var w = function (k) { return cellText(r, k); };
          return { key: r.key, color: r.s ? "var(--lx-bat)" : r.key === "merchant" ? "var(--lx-ink-3)" : COL.seller, name: nm, P: w("P"), c: w("c"), v: w("v"), b: w("b"), s: w("s") };
        })
      });
      LX.CompareTable(H("div", { class: "lx-xcard" }, x), {
        title: "The ledger: who gains, who loses, seed " + sm.seed,
        caption: "The solar farm alone, 200 price years, each contract at its fair price; P10 to P90 in $M a year.",
        columns: [{ key: "name", label: "Contract", main: true }, { key: "sr", label: "Seller, P10 to P90" }, { key: "sm", label: "Seller, mean" }, { key: "br", label: "Buyer, P10 to P90" }, { key: "bm", label: "Buyer, mean" }],
        rows: CONTRACTS.map(function (c) {
          var r = sm.solar[c];
          return { key: c, color: c === "merchant" ? "var(--lx-ink-3)" : COL.seller, name: NAMES[c], sr: mrange(r.sR), sm: musd(r.sR.mean, 2), br: r.sY.width < 5e3 ? musd(r.sY.p50, 2) + " every year" : mrange(r.sY), bm: musd(r.sY.mean, 2) };
        }),
        text: true
      });
      LX.CompareTable(H("div", { class: "lx-xcard" }, x), {
        title: "Worked: a settlement and the fair prices", text: true,
        caption: "Price year 1 of seed " + sm.seed + ", and the drivers' expected values; 2025 dollars.",
        columns: [{ key: "name", label: "What", main: true }, { key: "rule", label: "Rule" }, { key: "calc", label: "With this page's numbers" }],
        rows: worked(sm).map(function (r) { return { key: r.key, color: r.key === "toll" ? "var(--lx-bat)" : COL.seller, name: r.name, rule: r.rule, calc: r.calc }; })
      });
      LX.Boundary(H("div", { class: "lx-xcard" }, x), { title: "Where this answer holds",
        lede: "A teaching simulation: illustrative drivers, drawn independently, one number per year; every contract settled in cash.",
        holds: ["Each contract is signed at its fair price, so on average it moves risk without moving money.", "Every party pays what it owes: nobody defaults.", "Yearly averages stand for the hours inside each year."],
        leaves: ["Links between drivers: in real markets a high price year can also be a wide-spread year for the battery.", "Credit, taxes, curtailment, capacity payments and renewable certificates.", "A real contract's price includes what each side pays to shed risk, not just its fair value."],
        source: "Model: this lesson; drivers and sizes illustrative; solar capacity factor 24.0% (EIA, U.S. utility-scale solar PV, 2025)." });
    }
    build(sm0);
    return build;
  }

  // ---------------------------------------------------------------- practice drill (LX.Drill; this visit only)
  function drillView() {
    var host = document.getElementById("a2-drill"); if (!host) return; host.innerHTML = "";
    LX.Drill(host, { hint: "Six kinds of item in rotation: settlements, who carries a risk, flat blocks, reading a P10, fair prices and tolls. Aim for fifteen, about 30 minutes with the questions above.",
                     empty: "Type a number first.", item: drillItem, unit: function (it) { return it.unit || ""; } });
  }

  LX.mount("a02", function (live, data, root) { view(live, data, root); });
}());
