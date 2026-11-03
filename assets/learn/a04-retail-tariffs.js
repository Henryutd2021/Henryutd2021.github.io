// a04-retail-tariffs.js — Lesson A4, "How should an electricity bill be designed? Retail, dynamic and large-load
// tariffs" (step cards, Analyst tier; wave W3, 2026-11-03).
//
// Data: assets/learn/data/a04-retail-tariffs.json (the customers, the utility's unit costs, the four tariffs, the large
// load, the numbers to remember with their sources), town.json (Prairie Town's fleet; illustrative) and town_year.json
// (every hour of 2025 on the Southwest Power Pool grid, from EIA-930, as shapes).
//
// The day (real shapes, illustrative town): 9 June 2025, cut and scaled exactly as lesson 9 and CF6 do (demand = shape x
// 450 MW, wind = shape x 150 MW, sun = shape x 200 MW, whole MW; hour t runs from t:00 to t+1:00). Each hour is
// dispatched cheapest first: the always-on 100 MW plant, wind and sun, then the combined-cycle plant, then the peaker.
// The town's price in hour t = the running cost of one more MWh: $0 while sun is spilled, $40 on the combined-cycle,
// $100 on the peaker (lesson 8's marginal cost). The town's tightest hour = the hour of the largest gas need (20:00).
// A month = 30 days like this one (a simplification: real months mix weekdays, weekends and weather).
//
// Customers (illustrative hourly kW): a renter; a home with a 4 kW rooftop array on the same real solar shape and a 7 kW
// EV charger (2 hours, from 19:00 or from 01:00); a factory with two shifts and a 200 kW batch (2 hours, at 13:00 or at
// midnight). net_t = use_t + EV_t - solar_t (negative = sent back to the grid).
//
// What serving a customer costs the utility each month (its cost of service; illustrative unit costs):
//   energy    30 x sum_t net_t x price_t               (a kWh sent back is worth the hour's running cost)
//   capacity  $15 x max(0, net in the tightest hour)    (plants and lines are sized for hours like it)
//   wires     $6 x max_t net_t                          (the local transformer and service line: the customer's own peak)
//   meter     $10 a home, $200 a business
// Tariffs (illustrative), each with the class's meter cost as its fixed charge F, and set so that each class pays its
// total cost of service at the default behaviour (EV at 19:00, batch at 13:00): revenue-neutral for the class, whose
// mix is nine renters for each solar and EV home (homes) and the factory alone (businesses). In all four, a kWh sent
// back earns what a kWh bought costs in that hour (net metering).
//   flat      F + p x net kWh;                   p = (class cost - F x N) / class net kWh
//   tou       F + sum_t net_t x (o or 3o)        peak 16:00-21:00 at 3 x the off-peak price o; o solved for neutrality
//   demand    F + d x max_t net_t + e x net kWh  d = class (capacity + wires) / class sum of own peaks; e = class energy / kWh
//   rtp       F + sum_t net_t x (price_t + a)    a = class (capacity + wires) / class net kWh
// Bill minus cost = what a customer pays above (+) or below (-) the cost of serving it; at the defaults these sum to zero
// over each class (weighted by the mix). Moving the EV or the batch changes bills and costs differently under each
// tariff: that difference is what each tariff rewards. Prices are not re-set after a move (that waits for a rate case).
// Scarcity (illustrative): on 5 of the 30 days, 20:00-23:00 costs $2,000/MWh. Under real-time pricing the bill follows
// at once; under the other tariffs the prices were set in advance, so the utility pays it now and everyone later.
// The large load (illustrative): a 100 MW contract; upgrades built for it cost $15M a year, recovered by a demand charge
// k = $15M / (12 x 100,000 kW) per kW-month on its billing demand max(use, minimum share) x 100 MW; the rest falls on
// the utility's other customers.
// Every number on the page is checked against this model by _tests/learn/test_a04-retail-tariffs.js.
(function () {
  "use strict";
  var HOURS = 24;

  // ---------------------------------------------------------------- pure model (no DOM; exported for Node)
  function prepare(town, year, D) {
    var f = town.fleet, d = D.day, t0 = Date.parse(year.start_utc + "Z"), d0 = Date.parse(d.date + "T00:00:00Z");
    var i = Math.round((d0 - t0) / 3600000) + 1 - d.utcOffsetHours;
    if (i < 0 || i + HOURS > year.demand.length) throw new Error("date " + d.date + " is outside the year file");
    var flat = Object.keys(f).filter(function (k) { return f[k].behaviour === "runs flat"; })[0];
    var W = { date: d.date, dateLabel: d.dateLabel, demand: [], gap: [], key: [], price: [], solarShape: [], tight: 0 };
    for (var t = 0; t < HOURS; t++) {
      var dm = Math.round(year.demand[i + t] / 1000 * d.demandPeakMW), w = Math.round(year.wind[i + t] / 1000 * f.wind.mw), s = Math.round(year.solar[i + t] / 1000 * f.solar.mw);
      var g = dm - f[flat].mw - w - s, k = g < 0 ? "spill" : g <= f.cc.mw ? "cc" : g <= f.cc.mw + f.peaker.mw ? "pk" : "short";
      W.demand.push(dm); W.gap.push(g); W.key.push(k);
      W.price.push(k === "spill" ? 0 : k === "cc" ? f.cc.cost / 1000 : f.peaker.cost / 1000);   // $ per kWh
      W.solarShape.push(year.solar[i + t] / 1000);
      if (g > W.gap[W.tight]) W.tight = t;
    }
    return W;
  }
  function cust(D, key) { return D.customers.filter(function (c) { return c.key === key; })[0]; }
  // a customer's net kW in each hour; o = { ev: "evening" | "night", batch: "day" | "night" }
  function profile(D, W, key, o) {
    var c = cust(D, key), out = [], t;
    o = o || {};
    for (t = 0; t < HOURS; t++) {
      var v;
      if (c.kw) v = c.kw[t];
      else v = t >= c.base.from && t < c.base.to ? c.base.shift : c.base.night;
      if (c.ev) { var s = c.ev.start[o.ev || "evening"]; if (t >= s && t < s + c.ev.hours) v += c.ev.kw; }
      if (c.batch) { var b = c.batch.start[o.batch || "day"]; if (t >= b && t < b + c.batch.hours) v += c.batch.kw; }
      if (c.solarKW) v -= c.solarKW * W.solarShape[t];
      out.push(Math.round(v * 1000) / 1000);
    }
    return out;
  }
  function sum(a) { return a.reduce(function (x, y) { return x + y; }, 0); }
  function maxOf(a) { return Math.max.apply(null, a); }
  // hourly prices with the scarcity week mixed in: the month's average price of each hour ($/kWh)
  function prices(D, W, scarce) {
    if (!scarce) return W.price.slice();
    var S = D.scarcity, n = D.days;
    return W.price.map(function (p, t) { return S.hours.indexOf(t) >= 0 ? (p * (n - S.days) + S.price / 1000 * S.days) / n : p; });
  }
  // the month's cost of serving a net profile, by part ($)
  function cost(D, W, net, cls, scarce) {
    var P = prices(D, W, scarce), C = D.costs, e = 0;
    for (var t = 0; t < HOURS; t++) e += net[t] * P[t];
    var r = { energy: e * D.days, capacity: Math.max(0, net[W.tight]) * C.capacityPerKW, wires: Math.max(0, maxOf(net)) * C.wiresPerKW, meter: D.classes[cls].meter };
    r.total = r.energy + r.capacity + r.wires + r.meter;
    return r;
  }
  var DEFAULT = { ev: "evening", batch: "day" };
  // the four tariffs of each class, set at the default behaviour so that the class pays its cost (revenue-neutral)
  function calibrate(D, W) {
    var T = {}, tou = D.tariffs.filter(function (x) { return x.key === "tou"; })[0];
    Object.keys(D.classes).forEach(function (k) {
      var C = D.classes[k], mix = C.mix, F = C.meter, N = 0, cost0 = 0, kwh = 0, net0 = 0, en0 = 0, peaks = 0, touW = 0;
      Object.keys(mix).forEach(function (ck) {
        var n = mix[ck], p = profile(D, W, ck, DEFAULT), c = cost(D, W, p, k, false);
        N += n; cost0 += n * c.total; kwh += n * sum(p) * D.days; net0 += n * (c.capacity + c.wires); en0 += n * c.energy; peaks += n * Math.max(0, maxOf(p));
        p.forEach(function (v, t) { touW += n * D.days * v * (onPeak(tou, t) ? tou.ratio : 1); });
      });
      var o = (cost0 - F * N) / touW;
      var n = D.days;
      T[k] = { flat: { F: F, n: n, p: (cost0 - F * N) / kwh }, tou: { F: F, n: n, off: o, peak: o * tou.ratio, ratio: tou.ratio, from: tou.peak[0], to: tou.peak[1] },
               demand: { F: F, n: n, d: net0 / peaks, e: en0 / kwh }, rtp: { F: F, n: n, a: net0 / kwh }, cost: cost0, N: N, kwh: kwh };
    });
    return T;
  }
  function onPeak(tou, t) { return t >= tou.peak[0] && t < tou.peak[1]; }
  // a month's bill under one tariff, by part ($): fixed, energy (kWh charges, net of kWh sent back) and demand
  function bill(T, key, W, net, P) {
    var n = T.n, b = { fixed: T.F, energy: 0, demand: 0 }, kwh = sum(net) * n;
    if (key === "flat") b.energy = T.p * kwh;
    else if (key === "tou") net.forEach(function (v, t) { b.energy += n * v * (t >= T.from && t < T.to ? T.peak : T.off); });
    else if (key === "demand") { b.energy = T.e * kwh; b.demand = T.d * Math.max(0, maxOf(net)); }
    else if (key === "rtp") net.forEach(function (v, t) { b.energy += n * v * (P[t] + T.a); });
    b.total = b.fixed + b.energy + b.demand;
    return b;
  }
  // everything the page reads for one state s = { ev, batch, scarce }: per customer its net profile, its cost of
  // service, its bill under each tariff and the gap (bill - cost)
  function evaluate(D, W, T, s) {
    s = s || {};
    var P = prices(D, W, !!s.scarce), out = {};
    D.customers.forEach(function (c) {
      var net = profile(D, W, c.key, s), co = cost(D, W, net, c.cls, !!s.scarce), b = {}, gap = {};
      D.tariffs.forEach(function (x) { b[x.key] = bill(T[c.cls][x.key], x.key, W, net, P); gap[x.key] = b[x.key].total - co.total; });
      out[c.key] = { net: net, kwh: sum(net) * D.days, peak: maxOf(net), atTight: net[W.tight], exportKWh: -sum(net.filter(function (v) { return v < 0; })) * D.days,
                     cost: co, bill: b, gap: gap };
    });
    return out;
  }
  // the change a move makes: bill change under each tariff and cost change, for one customer
  function change(D, W, T, key, from, to) {
    var a = evaluate(D, W, T, from)[key], b = evaluate(D, W, T, to)[key], d = { cost: b.cost.total - a.cost.total, bill: {} };
    D.tariffs.forEach(function (x) { d.bill[x.key] = b.bill[x.key].total - a.bill[x.key].total; });
    return d;
  }
  // net billing (for Go deeper): kWh sent back earn the hour's running cost; the flat price is re-set so that homes
  // still pay their cost
  function netBilling(D, W) {
    var C = D.classes.home, F = C.meter, cost0 = 0, imp = 0, credit = 0, N = 0;
    Object.keys(C.mix).forEach(function (ck) {
      var n = C.mix[ck], p = profile(D, W, ck, DEFAULT), c = cost(D, W, p, "home", false);
      N += n; cost0 += n * c.total;
      p.forEach(function (v, t) { if (v > 0) imp += n * D.days * v; else credit += n * D.days * -v * W.price[t]; });
    });
    var price = (cost0 - F * N + credit) / imp, out = { p: price };
    Object.keys(C.mix).forEach(function (ck) {
      var p = profile(D, W, ck, DEFAULT), b = F;
      p.forEach(function (v, t) { b += D.days * v * (v > 0 ? price : W.price[t]); });
      out[ck] = b;
    });
    return out;
  }
  // the large load: who pays the upgrades' $X a year, for a use share u and a minimum billing share m (both 0-100)
  function large(L, u, m) {
    var k = L.upgradeCostPerYear / (12 * L.contractMW * 1000), billed = Math.max(u, m) / 100 * L.contractMW * 1000;
    var load = Math.min(L.upgradeCostPerYear, k * billed * 12);
    return { k: k, billedMW: billed / 1000, load: load, others: L.upgradeCostPerYear - load, unused: Math.max(0, m - u) / 100 * L.contractMW };
  }
  // formats
  function usd(v) { var r = Math.round(v); return (r < 0 ? "−$" : "$") + Math.abs(r).toLocaleString("en-US"); }
  function dusd(v) { var r = Math.round(v); return (r > 0 ? "+$" : r < 0 ? "−$" : "$") + Math.abs(r).toLocaleString("en-US"); }
  function cents(p) { return (Math.round(p * 1000) / 10).toFixed(1) + "¢"; }
  function musd(v) { return "$" + (Math.round(v / 1e5) / 10).toFixed(1) + "M"; }
  function kw(v) { return (Math.round(v * 100) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 }) + " kW"; }
  function kwh(v) { return Math.round(v).toLocaleString("en-US") + " kWh"; }
  function hm(t) { return (t < 10 ? "0" : "") + t + ":00"; }
  function span(t) { return hm(t) + "–" + hm(t + 1); }
  // the gap in words: "pays $22 more than its cost" / "pays $196 less than its cost" / "pays its cost"
  function gapWords(g) { var r = Math.round(g); return r > 0 ? "$" + r.toLocaleString("en-US") + " above its cost" : r < 0 ? "$" + (-r).toLocaleString("en-US") + " below its cost" : "its cost"; }
  // the rates of one class's tariffs, in words, for the tariff cards and the text version
  function rateLines(T, tk) {
    var x = T[tk];
    if (tk === "flat") return "$" + x.F + " a month + " + cents(x.p) + " per kWh";
    if (tk === "tou") return "$" + x.F + " a month + " + cents(x.off) + " per kWh, " + cents(x.peak) + " from " + hm(x.from) + " to " + hm(x.to);
    if (tk === "demand") return "$" + x.F + " a month + " + cents(x.e) + " per kWh + $" + (Math.round(x.d * 100) / 100).toFixed(2) + " per kW of the busiest hour";
    return "$" + x.F + " a month + the town's price each hour + " + cents(x.a) + " per kWh for the wires";
  }
  // the first hour of a customer's busiest hour
  function busiest(net) { var m = maxOf(net); return net.indexOf(m); }
  function tariffOf(D, k) { return D.tariffs.filter(function (x) { return x.key === k; })[0]; }

  // ---------------------------------------------------------------- the page's sentences (pure: the test reads them)
  // step 2: what one customer's day looks like
  function summary(D, W, E, key) {
    var c = cust(D, key), e = E[key], b = busiest(e.net);
    return "**" + c.short + ":** " + kwh(e.kwh) + (e.exportKWh > 0.5 ? " net this month, after sending " + kwh(e.exportKWh) + " back at midday" : " this month") +
      "; busiest hour " + kw(e.peak) + " at " + hm(b) + (b === W.tight ? ", the town's tightest hour." : "; " + kw(e.atTight) + " at " + hm(W.tight) + ".");
  }
  // step 3: what serving the solar and EV home costs most
  function costReveal(D, W, E) {
    var e = E.solarev;
    return "Plants: " + usd(e.cost.capacity) + " a month, for its " + kw(e.atTight) + " at " + hm(W.tight) + " while the car charges. Its energy costs " + usd(e.cost.energy) +
      "; the kWh it sends back at midday are worth $0, because the town is already spilling sun.";
  }
  // step 4: the flat price with net metering
  function flatReveal(D, T, E) {
    var r = E.renter, s = E.solarev, mix = D.classes.home.mix;
    return "At " + cents(T.home.flat.p) + " per kWh the renter pays " + usd(r.bill.flat.total) + " for a cost of " + usd(r.cost.total) + "; the solar and EV home pays " +
      usd(s.bill.flat.total) + " for a cost of " + usd(s.cost.total) + ". " + (mix.renter === 9 ? "Nine" : String(mix.renter)) + " renters' " + usd(r.gap.flat) + " each cover that home's " + usd(-s.gap.flat) + ".";
  }
  // step 5: the EV's charging moved under time-of-use (ev = the reader's choice now)
  function touReveal(D, W, T, ev) {
    var ch = change(D, W, T, "solarev", { ev: "evening" }, { ev: "night" }), x = T.home.tou;
    if (ev !== "night") return "At 19:00 the car charges in the peak window, at " + cents(x.peak) + " per kWh; at 01:00 it would pay " + cents(x.off) + ".";
    return "Charging at 01:00 cuts the time-of-use bill by " + usd(-ch.bill.tou) + " a month, while serving the home costs " + usd(-ch.cost) + " less. Under the flat price the bill would not move at all.";
  }
  // step 6: the factory's batch moved under the demand charge
  function demandReveal(D, W, T, batch) {
    var ch = change(D, W, T, "factory", { batch: "day" }, { batch: "night" });
    if (batch !== "night") return "At 13:00 the batch sets the factory's busiest hour: " + kw(maxOf(profile(D, W, "factory", { batch: "day" }))) + ", at $" + T.business.demand.d + " per kW a month.";
    return "At midnight the demand-charge bill falls " + usd(-ch.bill.demand) + " a month, but serving the factory costs only " + usd(-ch.cost) + " less: the batch's energy now costs " +
      usd(ch.bill.rtp) + " more. Under real-time pricing the bill rises " + usd(ch.bill.rtp) + ".";
  }
  // step 7: a scarcity week, for the renter
  function scarcityReveal(D, W, T, scarce) {
    var a = evaluate(D, W, T, {}).renter, b = evaluate(D, W, T, { scarce: true }).renter;
    if (!scarce) return "Without scarcity, the renter's real-time bill is " + usd(a.bill.rtp.total) + " and its flat bill " + usd(a.bill.flat.total) + ".";
    return "Real-time: the renter's bill jumps from " + usd(a.bill.rtp.total) + " to " + usd(b.bill.rtp.total) + " this month. Flat: it stays " + usd(b.bill.flat.total) +
      " while serving the renter costs " + usd(b.cost.total) + ", so the utility pays now and recovers it from everyone later.";
  }
  // step 8: one sentence per tariff, for the homes (numbers at the defaults and after the EV move)
  function pickLine(D, W, T, tk) {
    var E0 = evaluate(D, W, T, {}), E1 = evaluate(D, W, T, { ev: "night" }), Es = evaluate(D, W, T, { scarce: true });
    var ch = change(D, W, T, "solarev", { ev: "evening" }, { ev: "night" });
    if (tk === "flat") return "**Flat:** easy to read, but the renter pays " + usd(E0.renter.gap.flat) + " above its cost and the solar and EV home " + usd(-E0.solarev.gap.flat) + " below, and moving the car saves its owner nothing.";
    if (tk === "tou") return "**Time-of-use:** moving the car to 01:00 saves its owner " + usd(-ch.bill.tou) + ", about half the " + usd(-ch.cost) + " it saves the utility; the renter still pays " + usd(E0.renter.gap.tou) + " above its cost.";
    if (tk === "demand") return "**Demand charge:** nearest to cost while the car charges at 19:00 (renter " + usd(E0.renter.gap.demand) + " above, home " + usd(-E0.solarev.gap.demand) +
      " below). After the move the home's busiest hour is 01:00, so it pays " + usd(E1.solarev.gap.demand) + " above its cost.";
    return "**Real-time:** it passes on each hour's price, scarcity included (" + usd(Es.renter.bill.rtp.total - E0.renter.bill.rtp.total) + " more for the renter that month), but it prices no kW, so moving the car saves only " + usd(-ch.bill.rtp) + ".";
  }
  // step 9: the large load
  function largeLine(L, u, m) {
    var r = large(L, u, m), s = "The data center pays " + musd(r.load) + " of the " + musd(L.upgradeCostPerYear) + " a year; other customers pay " + musd(r.others) + ".";
    if (r.unused > 0) s += " It is billed for " + Math.round(r.unused) + " MW it does not use.";
    else if (m === 0 && u < 100) s += " With no minimum, the capacity it leaves unused falls on everyone else.";
    return s;
  }
  // glossary marks and **bold** to HTML, for the static blocks (the attribute is built in pieces so the build's term
  // scanner does not read "$1" as an id)
  function rich(t) {
    return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\[\[([a-z0-9-]+)\|([^\]]+)\]\]/g, function (m, id, w) {
      return '<span class="lx-term" data-term=' + '"' + id + '">' + w + "</span>";
    });
  }
  // the no-JS version: the three customers' bills and costs, the moves and the large load
  function staticFallback(D, W, T) {
    var E = evaluate(D, W, T, {}), head = "<thead><tr><th scope=\"col\">Customer</th><th scope=\"col\">Cost to serve</th>" +
      D.tariffs.map(function (x) { return "<th scope=\"col\">" + x.name + "</th>"; }).join("") + "</tr></thead>";
    var rows = D.customers.map(function (c) {
      var e = E[c.key];
      return "<tr><td>" + c.short + "</td><td data-l=\"Cost to serve\">" + usd(e.cost.total) + "</td>" + D.tariffs.map(function (x) {
        return "<td data-l=\"" + x.name + "\">" + usd(e.bill[x.key].total) + " (" + dusd(e.gap[x.key]) + ")</td>";
      }).join("") + "</tr>";
    }).join("");
    var L = D.large;
    return "<p class=\"lx-eyebrow\">Three Prairie Town customers, a month of days like " + W.dateLabel + " (illustrative)</p>" +
      "<div class=\"lx-scroll-x\"><table class=\"lx-facts a4-fb\"><caption class=\"lx-hint\">Each month's bill under four tariffs; in brackets, the bill minus the cost of serving the customer.</caption>" +
      head + "<tbody>" + rows + "</tbody></table></div><ul>" +
      "<li>" + rich(flatReveal(D, T, E)) + "</li><li>" + rich(touReveal(D, W, T, "night")) + "</li><li>" + rich(demandReveal(D, W, T, "night")) + "</li><li>" +
      rich(scarcityReveal(D, W, T, true)) + "</li><li>" + rich(largeLine(L, L.useStart, 0)) + " At a minimum of " + L.lbnlMedian + "%: " + rich(largeLine(L, L.useStart, L.lbnlMedian)).replace(/^The /, "the ") + "</li></ul>" +
      "<p class=\"lx-hint\">Homes' tariffs: " + D.tariffs.map(function (x) { return x.name.toLowerCase() + ", " + rateLines(T.home, x.key); }).join("; ") + ".</p>";
  }
  // the practice set (always shown): six exercises on the page's own numbers, each with its answer
  function staticPractice(D, W, T) {
    var E = evaluate(D, W, T, {}), r = E.renter, x = T.home.tou, L = D.large;
    var pk = 0; r.net.forEach(function (v, t) { if (onPeak(tariffOf(D, "tou"), t)) pk += v * D.days; });
    var off = r.kwh - pk, hand = x.F + Math.round(x.off * 1000) / 1000 * off + Math.round(x.peak * 1000) / 1000 * pk;
    var mix = D.classes.home.mix, ch = change(D, W, T, "factory", { batch: "day" }, { batch: "night" }), lg = large(L, 60, 80);
    var f0 = cost(D, W, profile(D, W, "factory", { batch: "day" }), "business"), f1 = cost(D, W, profile(D, W, "factory", { batch: "night" }), "business");
    var items = [
      ["Bill the renter under time-of-use by hand.", "It uses " + kwh(r.kwh) + " a month, " + kwh(pk) + " of them from 16:00 to 21:00; prices are " + cents(x.off) + " and " + cents(x.peak) + " per kWh, plus $" + x.F + " a month.",
       "$" + x.F + " + " + kwh(off) + " × " + cents(x.off) + " + " + kwh(pk) + " × " + cents(x.peak) + " ≈ " + usd(hand) + " (the page's " + usd(r.bill.tou.total) + " uses unrounded prices)."],
      ["Who pays for the solar and EV home under the flat price?", "Its bill is " + usd(E.solarev.bill.flat.total) + " and serving it costs " + usd(E.solarev.cost.total) + ".",
       "The other homes: " + mix.renter + " renters × " + usd(r.gap.flat) + " = " + usd(mix.renter * r.gap.flat) + ", the home's " + usd(-E.solarev.gap.flat) + " gap. Prices were set so the class pays its cost."],
      ["A lower busiest hour for the factory.", "Its demand charge is $" + T.business.demand.d + " per kW. Moving the batch cuts its busiest hour by 200 kW. What does its bill save, and what does the utility save?",
       usd(-ch.bill.demand) + " on the bill (200 kW × $" + T.business.demand.d + "), but only " + usd(-ch.cost) + " in cost: the wires save " + usd(f0.wires - f1.wires) + " and the batch's energy costs " + usd(f1.energy - f0.energy) + " more."],
      ["A large load at 60% of its contract.", "Contract 100 MW, minimum billing demand 80%, upgrades $15M a year. Who pays what?",
       "It is billed for " + lg.billedMW + " MW at $" + lg.k.toFixed(2) + " per kW a month: " + musd(lg.load) + " a year; other customers pay " + musd(lg.others) + "."],
      ["Move the time-of-use window.", "The town's dearest hours on " + W.dateLabel + " are " + hm(20) + " to " + hm(23) + ", when the peaker runs. Is 16:00 to 21:00 a good window?",
       "Only partly: at 16:00 sun is still spare (the town's price is $0), and 21:00 to 23:00 is left out. A window set months ahead cannot follow every day."],
      ["Read a claim critically.", "A story says: “Real-time pricing cut one customer's bill by 40%.” Name three things you would ask.",
       "Against which tariff? Did the customer change when it used power, or was it a month without scarcity? And who paid for the risk in other months?"]
    ];
    return "<p class=\"lx-eyebrow\">Practice · about 30 minutes on your own</p><ol class=\"lx-fb-practice\">" + items.map(function (it) {
      return "<li><p><b>" + it[0] + "</b> " + it[1] + "</p><details class=\"lx-answer\"><summary>Answer</summary><p>" + it[2] + "</p></details></li>";
    }).join("") + "</ol>";
  }

  var model = { HOURS: HOURS, DEFAULT: DEFAULT, prepare: prepare, profile: profile, prices: prices, cost: cost, calibrate: calibrate, bill: bill,
                evaluate: evaluate, change: change, netBilling: netBilling, large: large, onPeak: onPeak, sum: sum, maxOf: maxOf, busiest: busiest,
                usd: usd, dusd: dusd, cents: cents, musd: musd, kw: kw, kwh: kwh, hm: hm, span: span, gapWords: gapWords, rateLines: rateLines,
                summary: summary, costReveal: costReveal, flatReveal: flatReveal, touReveal: touReveal, demandReveal: demandReveal,
                scarcityReveal: scarcityReveal, pickLine: pickLine, largeLine: largeLine, rich: rich, staticFallback: staticFallback, staticPractice: staticPractice };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX || !window.LX.H) return;

  // ================================================================ the page
  var LX = window.LX, H = LX.H, KEY = "a04_retail_tariffs";
  var CSS = [
    ".a4-ctlrow{display:flex;flex-wrap:wrap;gap:10px 18px;align-items:end}",
    ".a4-rates{margin:0;padding-left:1.1em;font-size:14px;color:var(--lx-ink-2)}"
  ].join("\n");
  function sawB(api, t, bad) { api.saw(t, bad); }

  LX.mount("tariffs", function (live, data, root) {
    if (!document.getElementById("a4-css")) H("style", { id: "a4-css", text: CSS }, document.head);
    var D = data[KEY], W = prepare(data.town, data.town_year, D), T = calibrate(D, W), L = D.large;
    var S = { cust: "renter", tariff: "flat", ev: "evening", batch: "day", scarce: false, u: L.useStart, m: L.minStart };
    var saved = LX.store.get("a04");
    if (saved) {
      if (saved.ev === "night" || saved.ev === "evening") S.ev = saved.ev;
      if (saved.batch === "night" || saved.batch === "day") S.batch = saved.batch;
      S.scarce = !!saved.scarce;
      if (saved.u >= L.useSteps[0] && saved.u <= L.useSteps[1]) S.u = saved.u;
      if (saved.m >= L.minSteps[0] && saved.m <= L.minSteps[1]) S.m = saved.m;
    }
    function keep() { LX.store.set("a04", { ev: S.ev, batch: S.batch, scarce: S.scarce, u: S.u, m: S.m }); }
    var mode = "look", hook = null;

    // ---------- the stage: one customer's day, its cost and its bill
    var stage = H("div", { class: "lx-stage" }, live);
    var title = H("h3", null, H("div", { class: "lx-stage-head" }, stage));
    var ctl = H("div", { class: "a4-ctlrow" }, stage);
    var cc = H("div", { class: "cf-ctl" }, ctl);
    H("p", { class: "cf-ctl-l", id: "a4-cust-l", text: "Customer" }, cc);
    var cseg = H("div", { class: "lx-seg", role: "group", "aria-labelledby": "a4-cust-l" }, cc);
    var cbtn = D.customers.map(function (c) {
      var b = H("button", { type: "button", text: c.short }, cseg);
      b.addEventListener("click", function () { S.cust = c.key; paint(); if (hook) hook({ cust: c.key }); });
      return b;
    });
    var tc = H("div", { class: "cf-ctl" }, ctl);
    H("p", { class: "cf-ctl-l", id: "a4-tar-l", text: "Tariff" }, tc);
    var tseg = H("div", { class: "lx-seg", role: "group", "aria-labelledby": "a4-tar-l" }, tc);
    var tbtn = D.tariffs.map(function (x) {
      var b = H("button", { type: "button", text: x.name }, tseg);
      b.addEventListener("click", function () { S.tariff = x.key; paint(); if (hook) hook({ tariff: x.key }); });
      return b;
    });
    var chips = H("div", { class: "lx-readouts" }, stage);
    var rate = H("p", { class: "lx-hint" }, stage);
    var P = LX.Plot(stage, { text: "Text version of the chart" });
    var status = H("p", { class: "lx-stage-status", "aria-live": "polite" }, stage);

    function chip(label, value, cls) { var c = H("div", { class: "lx-readout" + (cls ? " " + cls : "") }, chips); H("span", { text: label }, c); H("b", { text: value }, c); }
    function yAxis(key) {
      if (key === "factory") return { min: 0, max: 600, step: 100, fmt: function (v) { return String(v); }, unit: "kW", zero: true };
      if (key === "solarev") return { min: -3, max: 10, step: 1, fmt: function (v) { return v % 2 ? "" : String(v); }, unit: "kW", zero: true };
      return { min: 0, max: 2, step: 0.5, fmt: function (v) { return v.toFixed(1); }, unit: "kW", zero: true };
    }
    function paint() {
      var E = evaluate(D, W, T, S), c = cust(D, S.cust), e = E[S.cust], tk = S.tariff, tar = tariffOf(D, tk);
      cbtn.forEach(function (b, i) { b.setAttribute("aria-pressed", String(D.customers[i].key === S.cust)); });
      tbtn.forEach(function (b, i) { b.setAttribute("aria-pressed", String(D.tariffs[i].key === tk)); });
      tc.hidden = mode === "look";
      title.textContent = W.dateLabel + " in Prairie Town · " + c.name;
      chips.innerHTML = "";
      chip(e.exportKWh > 0.5 ? "Net use this month" : "Use this month", kwh(e.kwh));
      chip("Busiest hour", kw(e.peak) + " at " + hm(busiest(e.net)));
      if (mode === "look") chip("At " + hm(W.tight) + " (tightest hour)", kw(e.atTight));
      chip("Cost to serve, a month", usd(e.cost.total));
      if (mode !== "look") {
        chip(tar.name + " bill", usd(e.bill[tk].total));
        chip("Bill minus cost", dusd(e.gap[tk]));
        rate.textContent = (c.cls === "home" ? "Homes' " : "Businesses' ") + tar.long.toLowerCase() + " tariff: " + rateLines(T[c.cls], tk) + "." + (S.scarce ? " Scarcity week on." : "");
      } else rate.textContent = c.note;
      var spill = [], pkh = [];
      W.key.forEach(function (k, t) { if (k === "spill") spill.push(t); if (k === "pk") pkh.push(t); });
      var y = yAxis(S.cust), spans = [{ x0: spill[0], x1: spill[spill.length - 1] + 1, color: "var(--lx-solar)", op: 0.13, label: "$0" },
                                       { x0: pkh[0], x1: pkh[pkh.length - 1] + 1, color: "var(--lx-pk)", op: 0.13, label: "$100" }];
      var bars = [];
      if (mode !== "look" && tk === "tou") bars.push({ x0: T.home.tou.from, x1: T.home.tou.to, y0: y.min, y1: y.min + (y.max - y.min) * 0.06, color: "var(--lx-accent)", op: 0.8, rx: 3 });
      P.render({
        x: { min: 0, max: 24, ticks: [[0, "00:00"], [6, "06:00"], [12, "12:00"], [18, "18:00"], [24, "24:00"]], ticksN: [[0, "0"], [6, "6"], [12, "12"], [18, "18"], [24, "24 h"]] },
        y: y, height: 240, heightN: 210, spans: spans, bars: bars,
        lines: [{ values: e.net, step: 1, color: c.color, width: 2.6, area: 0.14 }],
        marks: [{ x: W.tight + 0.5, y: Math.max(0, e.atTight), label: "", kind: "dot", vline: true }],
        legend: [{ label: c.short + ": kW drawn from the grid (below zero: sent back)", color: c.color },
                 { label: "Shading: the town's price, $0 (spare sun) or $100 (peaker); $40 elsewhere", color: "var(--lx-solar)" },
                 { label: "Dashed: the town's tightest hour, " + span(W.tight), color: "var(--lx-ink-3)", dash: "4 3" }].concat(bars.length ? [{ label: "Time-of-use peak price, 16:00–21:00", color: "var(--lx-accent)" }] : []),
        aria: c.name + " on " + W.dateLabel + ": kW drawn in each hour; busiest hour " + kw(e.peak) + "; " + kw(e.atTight) + " at the town's tightest hour, " + span(W.tight) + ".",
        text: { head: ["Hour", "kW", "Town's price, $/MWh"].concat(mode !== "look" && tk === "tou" ? ["Time-of-use period"] : []),
                rows: e.net.map(function (v, t) { return [span(t), String(Math.round(v * 100) / 100), String(Math.round(W.price[t] * 1000))].concat(mode !== "look" && tk === "tou" ? [onPeak(tar, t) ? "peak" : "off-peak"] : []); }),
                note: "Prices are Prairie Town's running cost of one more MWh in each hour, from its dispatch on " + W.dateLabel + "." }
      });
      status.textContent = mode === "look" ? c.name + ": cost to serve " + usd(e.cost.total) + " a month." :
        c.short + " under " + tar.long.toLowerCase() + ": bill " + usd(e.bill[tk].total) + ", " + gapWords(e.gap[tk]) + ".";
      buildExplain();
    }

    // ---------- step cards
    var steps = [
      { text: "A bill can have three parts: a [[fixed-charge|fixed charge]] each month, a price per [[kilowatt-hour|kWh]], and a [[demand-charge|demand charge]] per kW of the month's busiest hour. Which part pays for which cost?",
        build: function (act, api) {
          mode = "look"; hook = null; stage.hidden = true;
          LX.CardSort(act, {
            bins: [{ id: "fixed", label: "Fixed charge", sub: "$ a month" }, { id: "energy", label: "Energy charge", sub: "$ per kWh" }, { id: "demand", label: "Demand charge", sub: "$ per kW of the busiest hour" }],
            cards: [{ id: "meter", text: "Reading the meter and sending the bill", bin: "fixed", why: "It costs the same each month, however much is used." },
                    { id: "fuel", text: "Fuel burned to make each hour's kWh", bin: "energy", why: "It grows with every kWh." },
                    { id: "wires", text: "A transformer sized for the customer's busiest hour", bin: "demand", why: "It grows with the highest kW, not with the kWh." }],
            onCheck: function (g) {
              api.done();
              sawB(api, g.right === g.total ? "**All three match.** Real tariffs often blur them: many home tariffs recover wires costs per kWh, not per kW." : "**" + g.right + " of " + g.total + " match.** Move the others, or read the reasons and go on.", g.right < g.total);
            } });
        } },
      { text: "Meet three Prairie Town customers on " + W.dateLabel + ", a sunny day on real Southwest Power Pool shapes. Tap each: what it uses, its busiest hour, and what it draws at " + hm(W.tight) + ", the town's tightest hour.",
        build: function (act, api) {
          mode = "look"; stage.hidden = false; var seen = {};
          hook = function (e) { if (!e.cust) return; seen[e.cust] = true; sawB(api, summary(D, W, evaluate(D, W, T, S), e.cust)); if (Object.keys(seen).length >= D.customers.length) api.done(); };
          paint(); seen[S.cust] = true;
          H("p", { class: "lx-hint", text: "Tap all three customers above the chart." }, act);
        } },
      { text: "Serving a customer costs four things: energy each hour, plants for the town's tightest hour, local wires for its own busiest hour, and a meter. Which costs most for the solar and EV home?",
        build: function (act, api) {
          mode = "look"; hook = null; stage.hidden = false; S.cust = "solarev"; paint();
          var box = H("div", null, act);
          var pr = LX.Predict(act, { id: "a4-cost", q: "", title: false, fresh: true, answer: "capacity",
            options: D.parts.map(function (p) { return { value: p.key, label: p.short, color: p.color }; }),
            feedback: { capacity: "Plants for the tightest hour.", energy: "Not energy: its evening kWh are few, and its midday kWh are worth $0.", wires: "Local wires are second.", meter: "The meter is the smallest part." },
            onPick: function () {
              pr.reveal(costReveal(D, W, evaluate(D, W, T, S)));
              var E = evaluate(D, W, T, S), rows = ["renter", "solarev"].map(function (k) {
                var c = cust(D, k), v = {}; D.parts.forEach(function (p) { v[p.key] = E[k].cost[p.key]; });
                return { key: k, label: c.short, color: c.color, values: v, total: E[k].cost.total, aria: c.short + ": " + usd(E[k].cost.total) + " a month; " + LX.CostSplit.text(D.parts, v, usd) };
              });
              box.innerHTML = "";
              LX.CostSplit(box, { parts: D.parts, rows: rows, fmt: usd, key: true });
              H("p", { class: "lx-hint", text: "The factory costs " + usd(E.factory.cost.total) + " a month to serve: " + LX.CostSplit.text(D.parts, E.factory.cost, usd) + "." }, box);
              act.appendChild(box); api.done();
            } });
        } },
      { text: "Prices are set so each class of customer pays its total cost. With one flat price per kWh and [[net-metering|net metering]], who pays more than the cost of serving it?",
        build: function (act, api) {
          mode = "bill"; hook = null; stage.hidden = false; S.tariff = "flat"; S.cust = "renter"; paint();
          var pr = LX.Predict(act, { id: "a4-flat", q: "", title: false, fresh: true, answer: "renter",
            options: [{ value: "renter", label: "The renter" }, { value: "solarev", label: "The solar and EV home" }, { value: "none", label: "Neither: both pay their cost" }],
            feedback: { renter: "The renter.", solarev: "The other way round.", none: "Not with one price for every kWh." },
            onPick: function () { pr.reveal(flatReveal(D, T, evaluate(D, W, T, {}))); H("p", { class: "lx-hint", text: D.classes.home.mixNote }, act); api.done(); } });
        } },
      { text: "[[time-of-use-tariff|Time-of-use]]: each kWh costs three times as much from 16:00 to 21:00. Move the car's charging to 01:00, and compare what the bill saves with what serving the home saves.",
        build: function (act, api) {
          mode = "bill"; hook = null; stage.hidden = false; S.tariff = "tou"; S.cust = "solarev"; paint();
          var c = cust(D, "solarev"), w = H("div", { class: "cf-ctl" }, act);
          H("p", { class: "cf-ctl-l", id: "a4-ev-l", text: "The car charges" }, w);
          var seg = H("div", { class: "lx-seg", role: "group", "aria-labelledby": "a4-ev-l" }, w);
          var bs = ["evening", "night"].map(function (k) {
            var b = H("button", { type: "button", text: c.ev.label[k] }, seg);
            b.addEventListener("click", function () { S.ev = k; keep(); mark(); paint(); sawB(api, touReveal(D, W, T, k)); if (k === "night") api.done(); });
            return b;
          });
          function mark() { bs.forEach(function (b, i) { b.setAttribute("aria-pressed", String(["evening", "night"][i] === S.ev)); }); }
          mark(); if (S.ev === "night") { api.done(); sawB(api, touReveal(D, W, T, "night")); }
        } },
      { text: "[[demand-charge|Demand charge]]: the factory pays per kW of its busiest hour. Move its 200 kW batch from 13:00 to midnight. What does its bill save, and what does serving it really save?",
        build: function (act, api) {
          mode = "bill"; hook = null; stage.hidden = false; S.tariff = "demand"; S.cust = "factory"; paint();
          var c = cust(D, "factory"), w = H("div", { class: "cf-ctl" }, act);
          H("p", { class: "cf-ctl-l", id: "a4-batch-l", text: "The batch runs at" }, w);
          var seg = H("div", { class: "lx-seg", role: "group", "aria-labelledby": "a4-batch-l" }, w);
          var bs = ["day", "night"].map(function (k) {
            var b = H("button", { type: "button", text: c.batch.label[k] }, seg);
            b.addEventListener("click", function () { S.batch = k; keep(); mark(); paint(); sawB(api, demandReveal(D, W, T, k)); if (k === "night") api.done(); });
            return b;
          });
          function mark() { bs.forEach(function (b, i) { b.setAttribute("aria-pressed", String(["day", "night"][i] === S.batch)); }); }
          mark(); if (S.batch === "night") { api.done(); sawB(api, demandReveal(D, W, T, "night")); }
        } },
      { text: "[[real-time-pricing|Real-time pricing]]: each kWh costs the town's price that hour, plus a wires charge. Add a scarcity week: " + D.scarcity.label + ". Whose bill carries the risk, and when?",
        build: function (act, api) {
          mode = "bill"; hook = null; stage.hidden = false; S.tariff = "rtp"; S.cust = "renter"; paint();
          var tg = LX.Toggle(H("div", { class: "cf-ctl" }, act), { label: "Scarcity week", on: S.scarce, onChange: function (on) {
            S.scarce = on; keep(); paint(); sawB(api, scarcityReveal(D, W, T, on)); if (on) api.done(); } });
          if (S.scarce) { api.done(); sawB(api, scarcityReveal(D, W, T, true)); }
          H("p", { class: "lx-hint", text: "Prices are illustrative: a short spell of very high prices when supply is tight." }, act);
          void tg;
        } },
      { text: "Compare the four tariffs for every customer: who pays above or below its cost, with your choices so far. Which would you choose for Prairie Town's homes?",
        build: function (act, api) {
          mode = "bill"; hook = null; stage.hidden = false; paint();
          ledger(act);
          var w = H("div", { class: "cf-ctl" }, act);
          H("p", { class: "cf-ctl-l", id: "a4-pick-l", text: "My choice for homes" }, w);
          var seg = H("div", { class: "lx-seg", role: "group", "aria-labelledby": "a4-pick-l" }, w);
          var bs = D.tariffs.map(function (x) {
            var b = H("button", { type: "button", text: x.name, "aria-pressed": "false" }, seg);
            b.addEventListener("click", function () {
              bs.forEach(function (o) { o.setAttribute("aria-pressed", String(o === b)); });
              sawB(api, pickLine(D, W, T, x.key) + " No tariff is nearest to cost for every customer and every habit."); api.done();
            });
            return b;
          });
        } },
      { text: "A " + D.large.contractMW + " MW data center takes a [[large-load-tariff|large-load tariff]]; upgrades built for it cost $" + D.large.upgradeCostPerYear / 1e6 + "M a year. If it uses only part of its contract, who pays? Set a [[minimum-billing-demand|minimum billing demand]].",
        build: function (act, api) {
          mode = "bill"; hook = null; stage.hidden = true;
          var sU = LX.Slider(H("div", null, act), { label: "Its use, share of the " + L.contractMW + " MW contract", color: "var(--lx-tier-2)", min: L.useSteps[0], max: L.useSteps[1], step: L.useSteps[2], value: S.u,
            fmt: function (v) { return v + "%"; }, onChange: function (v) { S.u = v; keep(); draw(true); } });
          var sM = LX.Slider(H("div", null, act), { label: "Minimum billing demand, share of the contract", color: "var(--lx-accent)", min: L.minSteps[0], max: L.minSteps[1], step: L.minSteps[2], value: S.m,
            fmt: function (v) { return v + "%"; }, hint: function () { return "Median of 55 real large-load tariffs: " + L.lbnlMedian + "% (Berkeley Lab, 2026)."; },
            onChange: function (v) { S.m = v; keep(); draw(true); if (S.m > 0) api.done(); } });
          var ch = H("div", { class: "lx-readouts", "aria-hidden": "true" }, act), bar = H("div", null, act);
          var cs = LX.CostSplit(bar, { parts: [{ key: "load", label: "Paid by the data center", color: "var(--lx-tier-2)" }, { key: "others", label: "Paid by other customers", color: "var(--lx-warn)" }], rows: [], fmt: musd, key: true });
          function draw(acted) {
            var r = large(L, S.u, S.m);
            ch.innerHTML = "";
            [["Billing demand", Math.round(r.billedMW) + " MW"], ["Paid by the data center", musd(r.load)], ["Paid by other customers", musd(r.others)]].forEach(function (x) {
              var c = H("div", { class: "lx-readout" }, ch); H("span", { text: x[0] }, c); H("b", { text: x[1] }, c); });
            cs.set([{ key: "up", label: "Upgrades, " + musd(L.upgradeCostPerYear) + " a year", color: "var(--lx-ink-3)", values: { load: r.load, others: r.others }, total: L.upgradeCostPerYear,
                      aria: "Upgrades, " + musd(L.upgradeCostPerYear) + " a year: the data center pays " + musd(r.load) + ", other customers " + musd(r.others) + "." }], L.upgradeCostPerYear * 1.04);
            if (acted) sawB(api, largeLine(L, S.u, S.m));
          }
          draw(false); if (S.m > 0) { api.done(); sawB(api, largeLine(L, S.u, S.m)); }
          void sU; void sM;
        } },
      { text: "In words: a tariff turns the utility's costs into prices, and prices into incentives. Each design charges for something different, so each rewards something different and moves cost between customers.",
        free: true,
        build: function (act) {
          mode = "bill"; hook = null; stage.hidden = true;
          H("a", { class: "lx-btn small", style: "justify-self:start", href: "#explain", html: "The four tariffs, as diagrams" + LX.icon("arrow") }, act);
        } }
    ];
    var cards = LX.StepCards(live, { steps: steps });
    live.insertBefore(stage, cards.el);

    // ---------- the ledger: bill minus cost for every customer under every tariff, in the reader's state
    function ledger(host) {   // LX.Ledger (components/ledger.js)
      var E = evaluate(D, W, T, S);
      return LX.Ledger(host, { cls: "a4-led",
        caption: "Bill minus the cost of serving each customer, a month" + (S.ev === "night" ? "; the car charges at 01:00" : "") + (S.batch === "night" ? "; the batch runs at midnight" : "") + (S.scarce ? "; scarcity week on" : "") + ". Above zero: pays more than its cost.",
        columns: ["Customer"].concat(D.tariffs.map(function (x) { return x.name; })),
        rows: D.customers.map(function (c) {
          return { head: c.short, sub: "cost " + usd(E[c.key].cost.total),
                   cells: D.tariffs.map(function (x) { var g = Math.round(E[c.key].gap[x.key]); return { cls: g > 0 ? "up" : g < 0 ? "down" : "", text: dusd(g) + (g > 0 ? " above" : g < 0 ? " below" : "") }; }) };
        }) });
    }

    // ---------- the explain layer, with the reader's numbers
    var xhost = document.getElementById("a04-explain");
    function buildExplain() {
      if (!xhost) return;
      xhost.innerHTML = ""; xhost.classList.add("is-live");
      var E = evaluate(D, W, T, S), E0 = evaluate(D, W, T, {});
      // 1 comparison table
      LX.CompareTable(H("div", { class: "lx-xcard" }, xhost), {
        title: "Four tariffs side by side", text: true,
        columns: [{ key: "name", label: "Tariff", main: true }, { key: "pays", label: "You pay for" }, { key: "rewards", label: "It rewards" },
                  { key: "renter", label: "Renter's bill" }, { key: "solarev", label: "Solar + EV home's bill" }, { key: "risk", label: "Price spikes" }],
        rows: D.tariffs.map(function (x) {
          return { key: x.key, color: x.key === "rtp" ? "var(--lx-warn)" : "var(--lx-accent)", name: x.long, pays: x.pays, rewards: x.rewards,
                   renter: usd(E.renter.bill[x.key].total) + " (" + dusd(E.renter.gap[x.key]) + ")", solarev: usd(E.solarev.bill[x.key].total) + " (" + dusd(E.solarev.gap[x.key]) + ")",
                   risk: x.key === "rtp" ? "the customer pays at once" : "the utility pays, then everyone" };
        }),
        caption: "Bills with your choices so far; in brackets, bill minus cost. Every tariff is illustrative and set so each class pays its cost." });
      // 2 the ledger
      var lc = H("div", { class: "lx-xcard" }, xhost);
      H("h3", { text: "Ledger: who pays above or below its cost" }, H("header", { class: "lx-x-head" }, lc));
      ledger(lc);
      H("p", { class: "lx-hint", text: "Within each class the gaps add to zero at the start (" + D.classes.home.mix.renter + " renters to 1 solar and EV home). After a move, bills and costs part until the next rate case re-sets the prices." }, lc);
      // 3 causal chain with the reader's numbers (net metering under the flat price, at the defaults)
      var nb = netBilling(D, W);
      LX.CausalChain(H("div", { class: "lx-xcard" }, xhost), {
        title: "Cause and effect: one price for every kWh",
        links: [{ title: "Sun at midday", text: "The home sends kWh back; each earns the full price.", value: kwh(E0.solarev.exportKWh) + " sent back" },
                { title: "Car at 19:00", text: "Its kWh cost the town most, in its tightest hour.", value: kw(E0.solarev.atTight) + " at " + hm(W.tight) },
                { title: "A small bill", text: "Net kWh are few, so the bill is low.", value: usd(E0.solarev.bill.flat.total) + " for " + usd(E0.solarev.cost.total) },
                { title: "Prices set higher", text: "The class must still pay its total cost.", value: cents(T.home.flat.p) + " per kWh" },
                { title: "Others pay more", text: "Each renter pays above its own cost.", value: dusd(E0.renter.gap.flat) + " a month" }],
        note: "Under [[net-billing|net billing]], kWh sent back earn the hour's running cost instead: the flat price falls to " + cents(nb.p) + ", the renter pays " + usd(nb.renter) + " and the home " + usd(nb.solarev) + "." });
      // 4 the contested point
      LX.Steelman(H("div", { class: "lx-xcard" }, xhost), {
        title: "Is net metering fair to homes without solar? The strongest case on each side",
        sides: [{ key: "for", title: "For: keep it", points: ["One meter and one price: simple to understand and to bill.", "kWh sent back can save costs this toy leaves out, such as line losses and future upgrades.", "Owners invested under its rules, and changing them strands those decisions."] },
                { key: "against", title: "Against: change it", points: ["A full-price credit pays for plants and wires the home still uses in the evening.", "Homes without solar, often renters, make up the difference.", "Crediting the hour's value, or charging per kW, follows cost more closely."] }],
        note: "Both sides are argued in real rate cases; this toy measures only the costs it models." });
    }

    paint();
    LX.demo(root, function (state) {   // standard states (core.js LX.demo) plus scarce and large
      if (state === "mid") { cards.go(4); var b = live.querySelectorAll(".lx-step-act .lx-seg button")[1]; if (b) b.click(); return { view: "EV at 01:00 under time-of-use" }; }
      if (state === "scarce") { cards.go(6); var t = live.querySelector(".lx-step-act .lx-toggle"); if (t && t.getAttribute("aria-pressed") !== "true") t.click(); return { view: "scarcity week" }; }
      if (state === "large") { cards.go(8); return { view: "large load" }; }
      if (state === "pop") { cards.go(8); setTimeout(function () { var t = live.querySelector('.lx-step-text .lx-term[data-term="minimum-billing-demand"]'); if (!t) return;
        t.scrollIntoView({ block: "center" }); setTimeout(function () { t.click(); }, 300); }, 600); return { view: "a glossary popover" }; }
      return null;
    }, cards);
    root.lxLesson = { model: model, W: W, T: T, S: S, cards: cards };
  });
})();
