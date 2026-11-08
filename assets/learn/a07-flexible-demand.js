// a07-flexible-demand.js — Lesson A7, "Can demand and small resources act like a power plant? Demand response, EV
// charging, virtual power plants and local trading" (step cards, Analyst tier).
//
// Data: assets/learn/data/a07-flexible-demand.json (the shift, the devices, Feeder 7, the trade, the numbers to remember),
// a04-retail-tariffs.json (A4's customers and tariff rules, for the neighbours' trade), town.json (Prairie Town's fleet;
// illustrative) and town_year.json (every hour of 2025 on the Southwest Power Pool grid, from EIA-930, as shapes).
//
// The day (real shapes, illustrative town): 9 June 2025, cut and scaled exactly as lesson 9, CF6 and A4 do (demand =
// shape x 450 MW, wind = shape x 150 MW, sun = shape x 200 MW, whole MW; hour t runs from t:00 to t+1:00). Each hour is
// dispatched cheapest first, with no ramp limits: the always-on 100 MW plant, wind and sun (a negative gap is spilled),
// then the combined-cycle plant (150 MW, $40/MWh, 0.37 t CO2/MWh), then the peaker (100 MW, $100/MWh, 0.55 t CO2/MWh).
// CO2 is counted at the plant only. The day repeats: use that returns after midnight lands in the same day's small hours.
//   average factor a_t = CO2_t / demand_t, fixed at the day as dispatched (the view of attributed emissions)
//
// 1 The shift. Each hour's use may move up or down by at most s x demand_t (s = the flexible share); the day's total is
//   kept, plus 10% extra energy when it is on (moving q MWh out of an hour needs (1 + l) q at its new hour, l = 10%: about
//   9.1% of what arrives is lost; the page says "10% extra energy", not "10% losses").
//   Rule ("the shift rule"): repeatedly move use from the hour where one more MWh out saves most to the hour where it
//   costs least, along the merit order's straight pieces, while the saving is positive:
//     cheapest goal:   saving per MWh moved = mc_down(a) - (1 + l) mc_up(b) - u   (u = users' cost per MWh moved)
//     attributed goal: saving per MWh moved = a_a - (1 + l) a_b                   (the study's average-factor view)
//   Ties: from the hour with the most gas running, to the hour with the least; then the earlier hour. For the cheapest
//   goal the rule reaches the least-cost shift (the test checks it against a linear program with HiGHS, and that the
//   plants' CO2 is the same in every least-cost shift); the hours it uses are one choice among equally cheap ones.
//   Reported: MWh moved out, MWh added in, energy saved (= moved out - added in, negative with losses), the town's
//   running cost and the plants' CO2 (both re-dispatched), attributed CO2 (sum of use x a_t) and the users' cost (u x moved).
// 2 The virtual power plant. Each enrolled kind cuts count x kW x availability during 20:00-23:00 (the peaker's hours);
//   a share ret of the skipped energy comes back after the event: all at once over the kind's own hours from 23:00
//   (thermostats 1 h, chargers and pumps 3 h), or staggered evenly over 6 hours from 23:00. Batteries discharge and are
//   refilled from the next day's spare sun ($0, no CO2). The town is re-dispatched with the cut and the return.
//   Value to the aggregator (illustrative): $50 per kW a year of average cut (being ready), plus 30 event days a year of
//   the running cost the cut saves; each hour's saving (or extra cost of the return) is shared among the kinds in
//   proportion to their MWh in that hour. Each owner gets (1 - 20%) x value - the coordination cost per device or farm.
//   Earnings follow the reader's restart setting (all at once, or staggered), as the explain layer does.
// 3 Feeder 7: 1,000 homes, rated 3.0 MW, its load = the town's shape scaled to a 3.0 MW peak; its 300 thermostats and
//   120 chargers follow the same event and return rule. The limit binds when everything comes back at once.
// 4 The neighbours' trade: A4's solar and EV home (net billing: a kWh sent back earns the hour's running cost, $0 at
//   midday) sells to the renter next door on A4's real-time tariff (the hour's price + A4's plant-and-wire charge per
//   kWh, w). The
//   traded kWh are the hours' min(export, the renter's use). The kWh flow the same way with or without the trade, so the
//   plants and their CO2 do not change: the trade only moves money. Seller gains p_l per kWh; the buyer saves
//   (price + w) - (p_l + w on); the utility's other customers make up w per kWh unless the trade pays it.
// Every number on the page is checked against this model by _tests/learn/test_a07-flexible-demand.js.
(function () {
  "use strict";
  var HOURS = 24, EPS = 1e-9;

  // ---------------------------------------------------------------- pure model (no DOM; exported for Node)
  function prepare(town, year, D) {
    var f = town.fleet, d = D.day, t0 = Date.parse(year.start_utc + "Z"), d0 = Date.parse(d.date + "T00:00:00Z");
    var i = Math.round((d0 - t0) / 3600000) + 1 - d.utcOffsetHours;
    if (i < 0 || i + HOURS > year.demand.length) throw new Error("date " + d.date + " is outside the year file");
    var flat = Object.keys(f).filter(function (k) { return f[k].behaviour === "runs flat"; })[0];
    var P = { cc: { mw: f.cc.mw, cost: f.cc.cost, co2: f.cc.co2 }, pk: { mw: f.peaker.mw, cost: f.peaker.cost, co2: f.peaker.co2 } };
    var W = { date: d.date, dateLabel: d.dateLabel, plants: P, demand: [], gap: [], key: [], price: [], avg: [], solarShape: [], ren: [], h: [] };
    for (var t = 0; t < HOURS; t++) {
      var dm = Math.round(year.demand[i + t] / 1000 * d.demandPeakMW), w = Math.round(year.wind[i + t] / 1000 * f.wind.mw), s = Math.round(year.solar[i + t] / 1000 * f.solar.mw);
      var g = dm - f[flat].mw - w - s, x = hour(P, g);
      W.demand.push(dm); W.gap.push(g); W.h.push(x); W.avg.push(x.co2 / dm);
      var k = g <= 0 ? "spill" : g <= P.cc.mw ? "cc" : "pk";
      W.key.push(k); W.price.push(k === "spill" ? 0 : P[k].cost);
      W.solarShape.push(year.solar[i + t] / 1000); W.ren.push(w + s);
    }
    W.cost = sumOf(W.h, "cost"); W.co2 = sumOf(W.h, "co2");
    return W;
  }
  // one hour dispatched cheapest first for a gas need g (MW); negative g is spilled wind and sun
  function hour(P, g) {
    var need = Math.max(0, g), cc = Math.min(P.cc.mw, need), pk = Math.min(P.pk.mw, need - cc), un = need - cc - pk;
    if (un > 1e-9) throw new Error("demand not met: " + g);
    return { cc: cc, pk: pk, sp: Math.max(0, -g), cost: P.cc.cost * cc + P.pk.cost * pk, co2: P.cc.co2 * cc + P.pk.co2 * pk };
  }
  function sumOf(a, k) { return a.reduce(function (s, x) { return s + x[k]; }, 0); }
  function sum(a) { return a.reduce(function (s, x) { return s + x; }, 0); }
  // the merit order's pieces: [from, to) in MW of gas need, with the price of that piece
  function pieces(P) { return [[-Infinity, 0, 0], [0, P.cc.mw, P.cc.cost], [P.cc.mw, P.cc.mw + P.pk.mw, P.pk.cost]]; }
  function pieceAt(P, g, dir) {   // the piece just below g (dir -1: the last MW) or just above it (dir +1: the next MW)
    var L = pieces(P);
    for (var k = 0; k < L.length; k++) if (dir < 0 ? (g > L[k][0] + EPS && g <= L[k][1] + EPS) : (g >= L[k][0] - EPS && g < L[k][1] - EPS)) return L[k];
    return L[L.length - 1];
  }
  // 1 the shift, o = { share (0-1), goal: "cost" | "attr", loss: bool, user: $ per MWh moved }
  function shift(W, D, o) {
    var P = W.plants, l = o.loss ? D.shift.loss : 0, u = o.goal === "cost" ? (o.user || 0) : 0;
    var g = W.gap.slice(), dn = W.demand.map(function () { return 0; }), up = dn.slice(), cap = W.demand.map(function (d) { return o.share * d; });
    for (var it = 0; it < 2000; it++) {
      var best = null;
      for (var a = 0; a < HOURS; a++) {
        if (up[a] > EPS || cap[a] - dn[a] < EPS) continue;
        for (var b = 0; b < HOURS; b++) {
          if (b === a || dn[b] > EPS || cap[b] - up[b] < EPS) continue;
          var sv, pa = null, pb = null;
          if (o.goal === "cost") { pa = pieceAt(P, g[a], -1); pb = pieceAt(P, g[b], +1); sv = pa[2] - (1 + l) * pb[2] - u; }
          else sv = W.avg[a] - (1 + l) * W.avg[b];
          if (sv <= EPS) continue;
          var c = { a: a, b: b, sv: sv, pa: pa, pb: pb };
          if (!best || sv > best.sv + EPS || (Math.abs(sv - best.sv) <= EPS && (g[a] > g[best.a] + EPS || (Math.abs(g[a] - g[best.a]) <= EPS &&
              (g[b] < g[best.b] - EPS || (Math.abs(g[b] - g[best.b]) <= EPS && (a < best.a || (a === best.a && b < best.b)))))))) best = c;
        }
      }
      if (!best) break;
      var A = best.a, B = best.b, q = Math.min(cap[A] - dn[A], (cap[B] - up[B]) / (1 + l));
      if (o.goal === "cost") { q = Math.min(q, g[A] - best.pa[0], (best.pb[1] - g[B]) / (1 + l)); }
      if (!(q > EPS)) break;
      dn[A] += q; up[B] += (1 + l) * q; g[A] -= q; g[B] += (1 + l) * q;
    }
    var hs = g.map(function (x) { return hour(P, x); }), use = W.demand.map(function (d, t) { return d - dn[t] + up[t]; });
    var attr0 = sum(W.demand.map(function (d, t) { return d * W.avg[t]; })), attr1 = sum(use.map(function (d, t) { return d * W.avg[t]; }));
    var moved = sum(dn), added = sum(up);
    return { dn: dn, up: up, use: use, gap: g, h: hs, moved: moved, added: added, saved: moved - added,
             cost: sumOf(hs, "cost") - W.cost, co2: sumOf(hs, "co2") - W.co2, attr: attr1 - attr0, user: (o.user || 0) * moved,
             peakerMWh: sumOf(hs, "pk") - sumOf(W.h, "pk") };
  }
  // the hook: q MWh moved from one hour to another, re-dispatched
  function move(W, from, to, q) {
    var P = W.plants, A = hour(P, W.gap[from] - q), B = hour(P, W.gap[to] + q);
    return { cost: A.cost + B.cost - W.h[from].cost - W.h[to].cost, co2: A.co2 + B.co2 - W.h[from].co2 - W.h[to].co2, saved: 0 };
  }
  // 2 the virtual power plant: per kind, the MW cut in each event hour and the MW that come back in each later hour
  function profiles(D, kinds, stagger, counts) {
    var V = D.vpp, ev = V.event, n = ev[1] - ev[0], out = {};
    V.devices.forEach(function (d) {
      var c = counts ? (counts[d.key] || 0) : (kinds[d.key] ? d.count : 0), mw = c * d.kw * d.avail / 1000, cut = [], back = [];
      for (var t = 0; t < HOURS; t++) { cut.push(t >= ev[0] && t < ev[1] ? mw : 0); back.push(0); }
      var E = mw * n * d.ret, hrs = stagger ? V.staggerHours : d.back;
      if (E > 0 && hrs > 0) for (var k = 0; k < hrs; k++) back[(ev[1] + k) % HOURS] += E / hrs;
      out[d.key] = { mw: mw, cut: cut, back: back, count: c };
    });
    return out;
  }
  function vpp(W, D, kinds, stagger) {
    var P = W.plants, pr = profiles(D, kinds, stagger), V = D.vpp, keys = Object.keys(pr);
    var cut = [], back = [], t;
    for (t = 0; t < HOURS; t++) { cut.push(sum(keys.map(function (k) { return pr[k].cut[t]; }))); back.push(sum(keys.map(function (k) { return pr[k].back[t]; }))); }
    var hs = W.gap.map(function (g, t) { return hour(P, g - cut[t] + back[t]); });
    // per hour: the change from the cut alone and from the return alone (cut and return never share an hour here)
    var per = {};
    keys.forEach(function (k) { per[k] = { mwh: 0, day: 0 }; });
    for (t = 0; t < HOURS; t++) {
      var d = hs[t].cost - W.h[t].cost;   // < 0 in event hours (saving), > 0 where use comes back
      if (cut[t] > EPS && back[t] > EPS) throw new Error("cut and return share hour " + t);
      keys.forEach(function (k) {
        if (cut[t] > EPS) { per[k].mwh += pr[k].cut[t]; per[k].day += -d * pr[k].cut[t] / cut[t]; }
        if (back[t] > EPS) per[k].day -= d * pr[k].back[t] / back[t];
      });
    }
    var dev = {};
    V.devices.forEach(function (x) {
      var p = per[x.key], kwEach = x.kw * x.avail, c = pr[x.key].count;
      var valueEach = c ? (kwEach * V.capacityValue + V.days * p.day / c) : kwEach * V.capacityValue;
      dev[x.key] = { mw: pr[x.key].mw, mwh: p.mwh, day: p.day, kwEach: kwEach, valueEach: valueEach, count: c };
    });
    // energy: what kinds refilled from spare sun move to the next day's midday, and what is not used at all (saved)
    var sunMWh = 0, savedMWh = 0;
    V.devices.forEach(function (x) { var e = sum(pr[x.key].cut); if (x.refill === "sun") sunMWh += e; else savedMWh += (1 - x.ret) * e; });
    return { cut: cut, back: back, h: hs, mw: Math.max.apply(null, cut), cutMWh: sum(cut), backMWh: sum(back), sunMWh: sunMWh, savedMWh: savedMWh,
             cost: sumOf(hs, "cost") - W.cost, co2: sumOf(hs, "co2") - W.co2, peakerMWh: sumOf(hs, "pk") - sumOf(W.h, "pk"),
             ccMWh: sumOf(hs, "cc") - sumOf(W.h, "cc"), dev: dev };
  }
  // what an owner of one device (or farm) earns a year: value x (1 - aggregator share) - coordination cost
  // (a kind's value per device depends only on its own share of each hour's saving, so it is computed with every kind in)
  function earnings(W, D, coord, kinds, stagger) {
    var r = vpp(W, D, kinds || allKinds(D), !!stagger), out = {};
    D.vpp.devices.forEach(function (x) {
      var v = r.dev[x.key].valueEach, keep = (1 - D.vpp.aggregatorShare) * v;
      out[x.key] = { value: v, aggregator: D.vpp.aggregatorShare * v, coordination: coord, owner: keep - coord };
    });
    return out;
  }
  function allKinds(D) { var o = {}; D.vpp.devices.forEach(function (x) { o[x.key] = true; }); return o; }
  // 3 Feeder 7: its load in each hour (MW), with its enrolled devices' event and return
  function feeder(W, D, stagger) {
    var F = D.feeder, pk = Math.max.apply(null, W.demand), pr = profiles(D, null, stagger, F.enrolled), base = W.demand.map(function (d) { return d / pk * F.peakMW; });
    var load = base.map(function (b, t) { return b - sum(Object.keys(pr).map(function (k) { return pr[k].cut[t]; })) + sum(Object.keys(pr).map(function (k) { return pr[k].back[t]; })); });
    var after = D.vpp.event[1], m = 0, at = after;
    for (var k = 0; k < 8; k++) { var t = (after + k) % HOURS; if (load[t] > m) { m = load[t]; at = t; } }
    return { base: base, load: load, peakAfter: m, at: at, over: m - F.limitMW, limit: F.limitMW };
  }
  // 4 the neighbours' trade, from A4's data: kWh a month, and each party's gain ($ a month) at local price pl ($/kWh)
  function tradeKWh(A4, W) {
    var home = A4.customers.filter(function (c) { return c.key === "solarev"; })[0], renter = A4.customers.filter(function (c) { return c.key === "renter"; })[0], k = 0;
    for (var t = 0; t < HOURS; t++) { var ex = home.solarKW * W.solarShape[t] - home.kw[t]; if (ex > 0) k += Math.min(ex, renter.kw[t]); }
    return k * A4.days;
  }
  function trade(A4, W, wires, pl, payWires) {
    var k = tradeKWh(A4, W), w = payWires ? wires : 0;
    // the hours traded are spare-sun hours, priced $0: the seller's credit and the buyer's energy price are both $0
    return { kwh: k, seller: pl * k, buyer: (wires - pl - w) * k, others: -(wires - w) * k, plants: 0 };
  }
  // formats
  function usd(v) { var r = Math.round(v); return (r < 0 ? "−$" : "$") + Math.abs(r).toLocaleString("en-US"); }
  function dusd(v) { var r = Math.round(v); return (r > 0 ? "+$" : r < 0 ? "−$" : "$") + Math.abs(r).toLocaleString("en-US"); }
  function mwh(v) { var r = Math.round(v); return (r === 0 ? "0" : r.toLocaleString("en-US")) + " MWh"; }
  function dmwh(v) { var r = Math.round(v); return (r > 0 ? "+" : r < 0 ? "−" : "") + Math.abs(r).toLocaleString("en-US") + " MWh"; }
  function dt(v) { var r = Math.round(v * 10) / 10; return (r > 0 ? "+" : r < 0 ? "−" : "") + Math.abs(r).toFixed(1) + " t"; }
  function mw(v) { return (Math.round(v * 10) / 10).toFixed(1) + " MW"; }
  function mw2(v) { return (Math.round(v * 100) / 100).toFixed(2) + " MW"; }
  function cents(p) { return (Math.round(p * 1000) / 10).toFixed(1) + "¢"; }
  function hm(t) { return (t < 10 ? "0" : "") + t + ":00"; }
  function span(t) { return hm(t) + "–" + hm((t + 1) % 24 === 0 ? 24 : t + 1); }

  function pct(s) { return Math.round(s * 100) + "%"; }
  function tAbs(v) { return (Math.round(Math.abs(v) * 10) / 10).toFixed(1) + " t"; }
  function falls(v, f) { var r = Math.round(v * 10) / 10; return r < 0 ? "falls " + f(-v) : r > 0 ? "rises " + f(v) : "stays the same"; }
  // glossary marks (double brackets: glossary id, a bar, the words) -> a term span (static HTML) or the words alone (text)
  function rich(t) { return String(t).replace(/\[\[([a-z0-9-]+)\|([^\]]+)\]\]/g, function (m, id, w) { return '<span class="lx-term" data-term=' + '"' + id + '">' + w + "</span>"; }); }
  function bare(t) { return String(t).replace(/\[\[[a-z0-9-]+\|([^\]]+)\]\]/g, "$1"); }
  function list(a) { return a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1]; }

  // ---------------------------------------------------------------- the page's sentences (pure: the test reads them)
  // step 1: the hook, and the town's use with the hook's move in it (drawn once the answer is revealed)
  function hookReveal(W, D) {
    var H0 = D.hook, r = move(W, H0.from, H0.to, H0.q);
    return "None: the town still uses the same " + H0.q + " MWh, at " + hm(H0.to) + " instead of " + hm(H0.from) + ". Spare sun replaces the peaker, so the running cost falls " +
      usd(-r.cost) + " and the plants' CO₂ " + tAbs(r.co2) + " (metric tonnes).";
  }
  function hookUse(W, D) { var H0 = D.hook; return W.demand.map(function (d, t) { return d + (t === H0.to ? H0.q : 0) - (t === H0.from ? H0.q : 0); }); }
  // where the moved use lands, from the dispatch: MWh taken up by spare sun, and MWh that land where gas still runs; and
  // MWh moved out of hours where gas runs
  function landing(W, r) {
    var sun = 0, gas = 0, fromGas = 0;
    r.up.forEach(function (y, t) { if (y < EPS) return; var s = Math.min(y, Math.max(0, -W.gap[t])); sun += s; gas += y - s; });
    r.dn.forEach(function (x, t) { if (x > EPS && W.gap[t] > 0) fromGas += x; });
    return { sun: sun, gas: gas, fromGas: fromGas };
  }
  function shiftLine(W, D, o) {
    var r = shift(W, D, o), ld = landing(W, r);
    if (r.moved < EPS) return o.share > 0 && o.goal === "cost" && o.user > 0 ? "At $" + o.user + " a MWh for users, no move saves the town more than it costs them." : "With no flexible use, nothing moves.";
    var where = ld.gas < 0.5 ? " move from gas hours into spare-sun hours: the" : (o.goal === "attr" ? " move to hours with a lower average factor; " : " move to cheaper hours; ") + mwh(ld.gas) + " of what arrives still needs gas. The";
    return "At " + pct(o.share) + ", " + mwh(r.moved) + where + " running cost " + falls(r.cost, usd) + " and the plants' CO₂ " + falls(r.co2, tAbs) + ". Energy saved: " + dmwh(r.saved) + ".";
  }
  // step 3: both goals with the reader's settings (share, extra energy, users' cost); the users' cost applies to the
  // cheapest goal only (the attributed goal counts CO₂, not money)
  function goalLine(W, D, o) {
    if (typeof o === "number") o = { share: o };
    if (!(o.share > 0)) return "Raise the flexible share first: with none, neither goal moves anything.";
    var c = shift(W, D, { share: o.share, goal: "cost", loss: o.loss, user: o.user }), a = shift(W, D, { share: o.share, goal: "attr", loss: o.loss });
    var dm = Math.round(a.moved) - Math.round(c.moved), more = dm === 0 ? "as much as the cheapest goal" : mwh(Math.abs(dm)) + (dm > 0 ? " more" : " less");   // from the shown numbers
    var same = Math.round(a.co2 * 10) === Math.round(c.co2 * 10);
    return "The attributed goal moves " + mwh(a.moved) + ", " + more + ", and books " + tAbs(a.attr) + " less attributed CO₂, against " + tAbs(c.attr) + ". " +
      (same ? "The plants emit the same " + tAbs(c.co2) + " less: the extra moves swap hours with the same plant [[marginal-plant|on the margin]]."
        : "The plants' CO₂ falls " + tAbs(a.co2) + " under it, against " + tAbs(c.co2) + " under the cheapest goal.");
  }
  // the settings kept from step 4, shown where steps 2 and 3 use them ("" when there are none)
  function settingsNote(o) {
    var a = [];
    if (o.loss) a.push("10% extra energy for each MWh moved");
    if (o.user) a.push("users' cost $" + o.user + " a MWh (only the cheapest goal weighs it)");
    return a.length ? "Kept from step 4: " + a.join("; ") + "." : "";
  }
  function costsLine(W, D, o) {
    var r = shift(W, D, o), net = -r.cost - r.user;
    if (r.moved < EPS) return o.goal === "cost" && o.user > 0 ? "At $" + o.user + " a MWh for users, no move saves the town more than it costs them." : "With no flexible use, nothing moves.";
    return (o.loss ? "With 10% extra energy, " + mwh(r.moved) + " move and the town uses " + mwh(-r.saved) + " more: energy saved " + dmwh(r.saved) + ". " : mwh(r.moved) + " move; energy saved " + dmwh(r.saved) + ". ") +
      "Users' cost is " + usd(r.user) + " ($" + (o.user || 0) + " a MWh); the town's saving net of it is " + usd(net) + ".";
  }
  function vppLine(W, D, kinds, stagger) {
    var r = vpp(W, D, kinds, stagger), n = D.vpp.devices.filter(function (x) { return kinds[x.key]; }).length;
    if (!n) return "Enrol at least two kinds of device.";
    return mw(r.mw) + " for three hours: the peaker runs " + mwh(-r.peakerMWh) + " less, but " + mwh(r.backMWh) + " of use comes back after 23:00. The town saves " + usd(-r.cost) + " that day.";
  }
  // what an owner earns (or loses) a year, in words
  function ownerWords(v) { var r = Math.round(v); return r > 0 ? "earns " + usd(r) : r < 0 ? "loses " + usd(-r) : "earns nothing"; }
  function shareOf(coord, keep) { var r = Math.round(100 * coord / keep); return r > 100 ? "more than all" : r + "%"; }
  function earnLine(D, E, coord) {
    var t = E.thermostat, b = E.battery, k = 1 - D.vpp.aggregatorShare;
    if (!coord) return "With no coordination cost, a thermostat's owner " + ownerWords(t.owner) + " a year and a battery's " + ownerWords(b.owner) + ": what is left after the aggregator's share.";
    return "At $" + coord + " a device, a thermostat's owner " + ownerWords(t.owner) + " a year and a battery's " + ownerWords(b.owner) + ": the same fixed cost takes " +
      shareOf(coord, k * t.value) + " of a thermostat's share and " + shareOf(coord, k * b.value) + " of a battery's.";
  }
  // the explain layer's causal chain, from the dispatch of the reader's pool and restart setting
  function chainLinks(W, D, kinds, stagger) {
    var v = vpp(W, D, kinds, stagger), backPk = 0, names = { thermostat: "thermostats", ev: "chargers", dairy: "pumps" };
    v.back.forEach(function (b, t) { if (b > EPS) backPk += v.h[t].pk - W.h[t].pk; });
    var pause = D.vpp.devices.filter(function (x) { return kinds[x.key] && x.key !== "battery"; }).map(function (x) { return names[x.key]; }), does = [];
    if (kinds.battery) does.push("batteries discharge");
    if (pause.length) does.push(list(pause) + " pause");
    var answer = does.join("; ");
    return { v: v, backPk: backPk, links: [
      { title: "Devices answer", text: answer.charAt(0).toUpperCase() + answer.slice(1) + ".", value: mw(v.mw) + " for 3 h" },
      { title: "The peaker runs less", text: "The dearest plant is the first to go.", value: dmwh(v.peakerMWh) },
      { title: "Use comes back", text: v.backMWh < EPS ? "Nothing comes back after 23:00." : backPk > EPS ? "After 23:00 it needs more gas; all at once, it brings the peaker back." :
          "After 23:00 the combined-cycle plant makes it; the peaker stays off.", value: mwh(v.backMWh) },
      { title: v.savedMWh > 0.5 ? "Little is saved" : "Nothing is saved", text: (kinds.thermostat ? "Warmer homes skip a little" : "Nothing is skipped") + (kinds.battery ? "; batteries refill from the next day's spare sun." : "."),
        value: mwh(v.savedMWh) + " saved" + (kinds.battery ? ", " + mwh(v.sunMWh) + " moved to the sun" : "") },
      { title: "Cost and CO₂ fall", text: "Because the plants that run are cheaper and cleaner.", value: dusd(v.cost) + ", " + dt(v.co2) }] };
  }
  function feederLine(W, D, stagger) {
    var f = feeder(W, D, stagger), v0 = vpp(W, D, allKinds(D), false), v1 = vpp(W, D, allKinds(D), true), F = D.feeder;
    if (!stagger) return "All at once: " + F.name + " carries " + mw2(f.peakAfter) + " at " + hm(f.at) + ", over its " + mw(F.limitMW) + " rating by " + mw2(f.over) + ".";
    return "Staggered: " + F.name + " peaks at " + mw2(f.peakAfter) + " after the event, under its " + mw(F.limitMW) + ". The town saves more too, " + usd(-v1.cost) + " instead of " +
      usd(-v0.cost) + ", as the peaker stays off at 23:00.";
  }
  function tradeLine(A4, W, wires, pl, pay) {
    var r = trade(A4, W, wires, pl, pay);
    if (pay) return "With the plant-and-wire charge paid, the renter would pay " + cents(pl + wires) + " for a kWh it gets for " + cents(wires) + ": no local price helps both, because the energy itself is worth $0 at midday.";
    return "At " + cents(pl) + ", the seller gains " + usd(r.seller) + " a month and the buyer " + usd(r.buyer) + ", while other customers pay " + usd(-r.others) + " more for plants and wires. The plants run exactly as before.";
  }
  // the practice set (always shown): six exercises on the page's own numbers, each with its answer
  function staticPractice(W, D, A4, wires) {
    var H0 = D.hook, s5 = shift(W, D, { share: 0.05, goal: "cost" }), s5l = shift(W, D, { share: 0.05, goal: "cost", loss: true });
    var E = earnings(W, D, D.vpp.coordinationStart), th = D.vpp.devices.filter(function (x) { return x.key === "thermostat"; })[0];
    var f0 = feeder(W, D, false), tr = trade(A4, W, wires, 0.05, false), r20 = move(W, 20, 3, 10);
    var items = [
      ["Shifted or saved?", "A program moves " + H0.q + " MWh from " + hm(20) + " to " + hm(3) + ", when the combined-cycle plant is on the margin. What does the town save in energy, money and CO₂?",
       "Energy: none. Money: " + usd(-r20.cost) + " (the peaker's $100 for the combined-cycle plant's $40, per MWh). CO₂: " + tAbs(r20.co2) + " (0.55 − 0.37 t per MWh)."],
      ["Extra energy.", "With 10% extra energy needed, the 5% cheapest shift moves " + mwh(s5l.moved) + ". How much more energy does the town use, and why does it still save money?",
       mwh(-s5l.saved) + " more (" + mwh(s5l.added) + " in for " + mwh(s5l.moved) + " out). Each MWh leaves a $40 or $100 hour and arrives in a $0 one, so the running cost still falls " + usd(-s5l.cost) + "."],
      ["The thermostat's year.", "One thermostat cuts " + th.kw + " kW and " + pct(th.avail) + " of homes take part. At $" + D.vpp.capacityValue + " per kW a year for being ready, what is that part of its value?",
       th.kw + " × " + th.avail + " = " + (th.kw * th.avail).toFixed(2) + " kW × $" + D.vpp.capacityValue + " = $" + (th.kw * th.avail * D.vpp.capacityValue).toFixed(0) + ". With the energy it saves, " + usd(E.thermostat.value) + " a year."],
      ["Where coordination bites.", "At what coordination cost per device does a thermostat's owner earn nothing?",
       "At " + usd(E.thermostat.value * (1 - D.vpp.aggregatorShare)) + " a year: 80% of its " + usd(E.thermostat.value) + " value. A dairy earns " + usd(E.dairy.owner) + " at $" + D.vpp.coordinationStart + "."],
      ["The feeder.", D.feeder.name + " is rated " + mw(D.feeder.limitMW) + "; released at once, its load reaches " + mw2(f0.peakAfter) + " at " + hm(f0.at) + ". Name two fixes.",
       "Stagger the restart over several hours, or enrol fewer chargers on this feeder; a feeder-aware aggregator plans with the limit."],
      ["The neighbours' trade.", "At 5¢ a kWh, " + Math.round(tr.kwh) + " kWh a month change hands. Who gains and who pays?",
       "The seller " + usd(tr.seller) + ", the buyer " + usd(tr.buyer) + "; other customers pay the " + usd(-tr.others) + " of plant-and-wire charge the trade skips. The kWh and the plants do not change."]
    ];
    return "<p class=\"lx-eyebrow\">Practice · about 30 minutes on your own</p><ol class=\"lx-fb-practice\">" + items.map(function (it) {
      return "<li><p><b>" + it[0] + "</b> " + it[1] + "</p><details class=\"lx-answer\"><summary>Answer</summary><p>" + it[2] + "</p></details></li>";
    }).join("") + "</ol>";
  }
  // the no-JS version: the four parts at their starting settings
  function staticFallback(W, D, A4, wires) {
    var all = allKinds(D), E = earnings(W, D, D.vpp.coordinationStart), tr = D.vpp.devices.map(function (x) {
      return "<tr><td>" + x.name + "</td><td data-l=\"In the pool\">" + mw(vpp(W, D, (function () { var o = {}; o[x.key] = true; return o; })(), false).mw) + "</td><td data-l=\"Owner earns a year\">" + usd(E[x.key].owner) + " per " + x.one + "</td></tr>";
    }).join("");
    return "<p class=\"lx-eyebrow\">Prairie Town's flexible demand on " + W.dateLabel + " (illustrative)</p><ul>" +
      "<li>" + rich(hookReveal(W, D)) + "</li><li>" + rich(shiftLine(W, D, { share: D.shift.try / 100, goal: "cost" })) + "</li><li>" + rich(goalLine(W, D, { share: D.shift.try / 100 })) + "</li>" +
      "<li>" + rich(vppLine(W, D, all, false)) + "</li><li>" + rich(feederLine(W, D, false)) + "</li><li>" + rich(feederLine(W, D, true)) + "</li><li>" + rich(tradeLine(A4, W, wires, 0.05, false)) + "</li></ul>" +
      "<div class=\"lx-scroll-x\"><table class=\"lx-facts a7-fb\"><caption class=\"lx-hint\">The virtual power plant from 20:00 to 23:00, with everyone back at once at 23:00 and a coordination cost of $" + D.vpp.coordinationStart + " per device or farm.</caption>" +
      "<thead><tr><th scope=\"col\">Device</th><th scope=\"col\">In the pool</th><th scope=\"col\">Owner earns a year</th></tr></thead><tbody>" + tr + "</tbody></table></div>";
  }

  var model = { HOURS: HOURS, prepare: prepare, hour: hour, pieces: pieces, shift: shift, move: move, profiles: profiles, vpp: vpp, earnings: earnings,
                allKinds: allKinds, feeder: feeder, tradeKWh: tradeKWh, trade: trade, sum: sum,
                usd: usd, dusd: dusd, mwh: mwh, dmwh: dmwh, dt: dt, mw: mw, mw2: mw2, cents: cents, hm: hm, span: span, pct: pct,
                hookReveal: hookReveal, hookUse: hookUse, landing: landing, shiftLine: shiftLine, goalLine: goalLine, settingsNote: settingsNote, costsLine: costsLine, vppLine: vppLine, earnLine: earnLine,
                ownerWords: ownerWords, chainLinks: chainLinks, tAbs: tAbs, rich: rich, bare: bare,
                feederLine: feederLine, tradeLine: tradeLine, staticPractice: staticPractice, staticFallback: staticFallback };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX || !window.LX.H) return;

  // ================================================================ the page
  var LX = window.LX, H = LX.H, KEY = "a07_flexible_demand";
  var CSS = [
    ".a7-ctlrow{display:flex;flex-wrap:wrap;gap:10px 18px;align-items:end}",
    ".a7-inout{margin:0;padding-left:1.1em;font-size:14.5px;color:var(--lx-ink-2)}.a7-inout li{margin:.15rem 0}"
  ].join("\n");

  LX.mount("flex", function (live, data, root) {
    if (!document.getElementById("a7-css")) H("style", { id: "a7-css", text: CSS }, document.head);
    var D = data[KEY], A4 = data.a04_retail_tariffs, W = prepare(data.town, data.town_year, D);
    var wires = D.trade.wires;   // A4's real-time wires charge for homes (the test checks it against A4's model)
    var S = { share: D.shift.start / 100, goal: "cost", loss: false, user: D.shift.userStart, kinds: {}, coord: D.vpp.coordinationStart, stagger: false, pl: D.trade.start / 100, pay: false };
    var saved = LX.store.get("a07");
    if (saved) {
      if (saved.share >= 0 && saved.share <= 0.1) S.share = saved.share;
      if (saved.goal === "attr" || saved.goal === "cost") S.goal = saved.goal;
      S.loss = !!saved.loss; S.stagger = !!saved.stagger; S.pay = !!saved.pay;
      if (saved.user >= 0 && saved.user <= D.shift.userCost[1] && saved.user % D.shift.userCost[2] === 0) S.user = saved.user;
      if (saved.coord >= 0 && saved.coord <= 60) S.coord = saved.coord;
      if (saved.pl >= 0 && saved.pl <= 0.14) S.pl = saved.pl;
      if (saved.kinds) D.vpp.devices.forEach(function (x) { S.kinds[x.key] = !!saved.kinds[x.key]; });
    }
    function keep() { LX.store.set("a07", S); }
    var part = "shift", hookShown = false;   // hookShown: step 1's answer is revealed, so the chart draws its move

    // ---------- the stage: one chart and its readouts, for the part the step is on
    var stage = H("div", { class: "lx-stage" }, live);
    var title = H("h3", null, H("div", { class: "lx-stage-head" }, stage));
    var chips = H("div", { class: "lx-readouts" }, stage);
    var P = LX.Plot(stage, { text: "Text version of the chart" });
    var status = H("p", { class: "lx-stage-status", "aria-live": "polite" }, stage);
    function chip(label, value) { var c = H("div", { class: "lx-readout" }, chips); H("span", { text: label }, c); H("b", { text: value }, c); }
    var X = { min: 0, max: 24, ticks: [[0, "00:00"], [6, "06:00"], [12, "12:00"], [18, "18:00"], [24, "24:00"]], ticksN: [[0, "0"], [6, "6"], [12, "12"], [18, "18"], [24, "24 h"]] };
    function spans() {
      var sp = [], pk = [];
      W.key.forEach(function (k, t) { if (k === "spill") sp.push(t); if (k === "pk") pk.push(t); });
      return [{ x0: sp[0], x1: sp[sp.length - 1] + 1, color: "var(--lx-solar)", op: 0.13, label: "Spare sun" }, { x0: pk[0], x1: pk[pk.length - 1] + 1, color: "var(--lx-pk)", op: 0.13, label: "Peaker" }];
    }
    function paint() {
      chips.innerHTML = "";
      if (part === "hook") {
        // step 1: the day's use; once the answer is revealed, the hook's 10 MWh move and what it changes
        var H0 = D.hook, hk = move(W, H0.from, H0.to, H0.q), use = hookShown ? hookUse(W, D) : W.demand;
        title.textContent = "Prairie Town, " + W.dateLabel + (hookShown ? " · " + H0.q + " MWh moved from " + hm(H0.from) + " to " + hm(H0.to) : "");
        if (hookShown) { chip("Moved", mwh(H0.q)); chip("Energy saved", dmwh(hk.saved)); chip("Running cost", dusd(hk.cost)); chip("Plants' CO₂", dt(hk.co2)); }
        P.render({ x: X, y: { min: 180, max: 360, step: 30, fmt: function (v) { return String(v); }, unit: "MW" }, height: 240, heightN: 210, spans: spans(),
          lines: [{ values: W.demand, step: 1, color: "var(--lx-ink-3)", width: 2, dash: "5 4" }].concat(hookShown ? [{ values: use, step: 1, color: "var(--lx-dr)", width: 2.6 }] : []),
          legend: [{ label: "Use as it was", color: "var(--lx-ink-3)", dash: "5 4" }].concat(hookShown ? [{ label: "Use with " + H0.q + " MWh moved", color: "var(--lx-dr)" }] : []),
          aria: "Prairie Town's use on " + W.dateLabel + (hookShown ? ", before and after moving " + H0.q + " MWh from " + hm(H0.from) + " to " + hm(H0.to) + "." : ", hour by hour."),
          text: { head: ["Hour", "Use before, MW", "Use after, MW", "On the margin"], rows: W.demand.map(function (d, t) { return [span(t), String(d), String(use[t]), W.key[t] === "spill" ? "spare sun" : W.key[t] === "cc" ? "combined-cycle" : "peaker"]; }) } });
        status.textContent = hookShown ? hookReveal(W, D) : "Prairie Town's use on " + W.dateLabel + ", hour by hour.";
      } else if (part === "shift") {
        var r = shift(W, D, S);
        title.textContent = "Prairie Town, " + W.dateLabel + " · " + (S.share ? pct(S.share) + " of each hour's use may move" : "no flexible use yet");
        chip("Moved", mwh(r.moved)); chip("Energy saved", dmwh(r.saved));
        chip("Running cost", dusd(r.cost)); chip("Plants' CO₂", dt(r.co2));
        if (S.goal === "attr" || part === "shift") chip("Attributed CO₂", dt(r.attr));
        if (S.user) chip("Users' cost", usd(r.user));
        P.render({ x: X, y: { min: 180, max: 360, step: 30, fmt: function (v) { return String(v); }, unit: "MW" }, height: 240, heightN: 210, spans: spans(),
          lines: [{ values: W.demand, step: 1, color: "var(--lx-ink-3)", width: 2, dash: "5 4" }, { values: r.use, step: 1, color: "var(--lx-dr)", width: 2.6 }],
          legend: [{ label: "Use as it was", color: "var(--lx-ink-3)", dash: "5 4" }, { label: "Use after the shift", color: "var(--lx-dr)" }],
          aria: "Prairie Town's use on " + W.dateLabel + ", before and after the shift: " + mwh(r.moved) + " moved.",
          text: { head: ["Hour", "Use before, MW", "Use after, MW", "On the margin"], rows: W.demand.map(function (d, t) { return [span(t), String(d), (Math.round(r.use[t] * 10) / 10).toFixed(1), W.key[t] === "spill" ? "spare sun" : W.key[t] === "cc" ? "combined-cycle" : "peaker"]; }) } });
        status.textContent = bare(shiftLine(W, D, S));
      } else if (part === "vpp") {
        var v = vpp(W, D, S.kinds, S.stagger);
        title.textContent = "Prairie Town's gas plants, " + W.dateLabel + " · a pool of " + mw(v.mw);
        chip("Pool", mw(v.mw)); chip("Peaker", dmwh(v.peakerMWh)); chip("Use that comes back", mwh(v.backMWh)); chip("Running cost that day", dusd(v.cost)); chip("Plants' CO₂", dt(v.co2));
        var g0 = W.h.map(function (x) { return x.cc + x.pk; }), g1 = v.h.map(function (x) { return x.cc + x.pk; });
        P.render({ x: X, y: { min: 0, max: 200, step: 50, fmt: function (v) { return String(v); }, unit: "MW" }, height: 240, heightN: 210, spans: spans(),
          refs: [{ y: W.plants.cc.mw, label: "Combined-cycle full", labelN: "150 MW", dash: "4 3", labelColor: "var(--lx-ink-2)" }],   // ink-2: the label sits on the shaded area
          lines: [{ values: g0, step: 1, color: "var(--lx-ink-3)", width: 2, dash: "5 4" }, { values: g1, step: 1, color: "var(--lx-pk)", width: 2.6, area: 0.12 }],
          legend: [{ label: "Gas output without the pool", color: "var(--lx-ink-3)", dash: "5 4" }, { label: "With the pool", color: "var(--lx-pk)" }],
          aria: "Gas output on " + W.dateLabel + " with and without the pool; above 150 MW the peaker runs.",
          text: { head: ["Hour", "Gas without, MW", "Gas with, MW", "Pool cut, MW", "Use coming back, MW"], rows: g0.map(function (x, t) { return [span(t), String(x), (Math.round(g1[t] * 10) / 10).toFixed(1), v.cut[t].toFixed(2), v.back[t].toFixed(2)]; }) } });
        status.textContent = vppLine(W, D, S.kinds, S.stagger);
      } else if (part === "feeder") {
        var f = feeder(W, D, S.stagger), F = D.feeder;
        title.textContent = F.name + " · " + F.homes.toLocaleString("en-US") + " homes · " + (S.stagger ? "staggered restart" : "everyone back at once");
        chip("Highest after the event", mw2(f.peakAfter) + " at " + hm(f.at)); chip("Rating", mw(F.limitMW)); chip(f.over > 0 ? "Over by" : "Room left", mw2(Math.abs(f.over)));
        P.render({ x: X, y: { min: 0, max: 4, step: 1, fmt: function (v) { return v.toFixed(1); }, unit: "MW" }, height: 230, heightN: 200,
          refs: [{ y: F.limitMW, label: "Rating " + mw(F.limitMW), labelN: mw(F.limitMW), dash: "4 3", color: "var(--lx-bad)" }],
          lines: [{ values: f.base, step: 1, color: "var(--lx-ink-3)", width: 2, dash: "5 4" }, { values: f.load, step: 1, color: "var(--lx-accent)", width: 2.6, area: 0.12 }],
          legend: [{ label: "Feeder load without the pool", color: "var(--lx-ink-3)", dash: "5 4" }, { label: "With the event and the return", color: "var(--lx-accent)" }],
          aria: F.name + ": load by hour against its " + mw(F.limitMW) + " rating; highest after the event " + mw2(f.peakAfter) + ".",
          text: { head: ["Hour", "Without, MW", "With, MW"], rows: f.base.map(function (b, t) { return [span(t), b.toFixed(2), f.load[t].toFixed(2)]; }) } });
        status.textContent = feederLine(W, D, S.stagger);
      }
      buildExplain();
    }
    function showStage(on) { stage.hidden = !on; }

    // ---------- step cards
    function seg(act, id, label, opts, cur, onPick) {
      var w = H("div", { class: "cf-ctl" }, act);
      H("p", { class: "cf-ctl-l", id: id, text: label }, w);
      var s = H("div", { class: "lx-seg", role: "group", "aria-labelledby": id }, w), bs = opts.map(function (o) {
        var b = H("button", { type: "button", text: o[1] }, s);
        b.addEventListener("click", function () { bs.forEach(function (x, i) { x.setAttribute("aria-pressed", String(opts[i][0] === o[0])); }); onPick(o[0]); });
        b.setAttribute("aria-pressed", String(o[0] === cur));
        return b;
      });
      return bs;
    }
    var steps = [
      { text: "Demand can act like a power plant by using less, or by using later or earlier. If Prairie Town moves " + D.hook.q + " MWh of use from " + hm(D.hook.from) + " to " + hm(D.hook.to) + ", how much energy does it save?",
        build: function (act, api) {
          part = "hook"; hookShown = false; showStage(true); paint();
          var pr = LX.Predict(act, { id: "a7-hook", q: "", title: false, fresh: true, answer: "none",
            options: [{ value: "ten", label: D.hook.q + " MWh" }, { value: "none", label: "None" }, { value: "some", label: "Some: the peaker's losses" }],
            feedback: { none: "Moved, not saved.", ten: "Not saved: moved.", some: "No: the same MWh are still used." },
            onPick: function () { hookShown = true; paint(); pr.reveal(hookReveal(W, D)); api.done(); } });
        } },
      { text: "Now let part of every hour's use move within the day, up to a [[flexibility|flexible]] share of that hour's demand. The town moves use from its dearest hours to its cheapest. Raise the share.",
        build: function (act, api) {
          part = "shift"; S.goal = "cost"; showStage(true); paint();
          var sl = LX.Slider(H("div", null, act), { label: "Flexible share of each hour's use", color: "var(--lx-dr)", min: 0, max: 10, step: 1, value: Math.round(S.share * 100),
            fmt: function (v) { return v + "%"; }, onChange: function (v) { S.share = v / 100; keep(); paint(); api.saw(shiftLine(W, D, S)); if (v > 0) api.done(); } });
          if (S.share > 0) { api.done(); api.saw(shiftLine(W, D, S)); }
          if (settingsNote(S)) H("p", { class: "lx-hint", text: settingsNote(S) }, act);
          void sl;
        } },
      { text: "Switch the goal to the lowest [[attributed-emissions|attributed emissions]]: each MWh counted at its hour's [[average-emission-factor|average factor]]. Compare what the plants emit under each goal.",
        build: function (act, api) {
          part = "shift"; showStage(true); if (!S.share) { S.share = D.shift.try / 100; keep(); } paint();
          seg(act, "a7-goal-l", "Goal of the shift", [["cost", "Cheapest"], ["attr", "Lowest attributed CO₂"]], S.goal, function (k) {
            S.goal = k; keep(); paint(); api.saw(goalLine(W, D, S)); if (k === "attr") api.done(); });
          if (S.goal === "attr") { api.done(); api.saw(goalLine(W, D, S)); }
          if (settingsNote(S)) H("p", { class: "lx-hint", text: settingsNote(S) }, act);
          H("p", { class: "lx-hint", text: "Ties: use leaves the hour with the most gas running and goes to the hour with the least." }, act);
        } },
      { text: "Shifting is not free. Pre-cooling a home takes extra energy, and people want paying for the bother. Turn on the extra energy and set a cost to users per MWh moved: what still pays?",
        build: function (act, api) {
          part = "shift"; S.goal = "cost"; showStage(true); if (!S.share) S.share = D.shift.try / 100; keep(); paint();
          var tg = LX.Toggle(H("div", { class: "cf-ctl" }, act), { label: "10% extra energy: each MWh moved needs 1.1 MWh at its new hour", on: S.loss, onChange: function (on) { S.loss = on; keep(); paint(); api.saw(costsLine(W, D, S)); api.done(); } });
          var sl = LX.Slider(H("div", null, act), { label: "Users' cost per MWh moved", color: "var(--lx-warn)", min: D.shift.userCost[0], max: D.shift.userCost[1], step: D.shift.userCost[2], value: S.user,
            fmt: function (v) { return "$" + v; }, onChange: function (v) { S.user = v; keep(); paint(); api.saw(costsLine(W, D, S)); api.done(); } });
          if (S.loss || S.user) { api.done(); api.saw(costsLine(W, D, S)); }
          void tg; void sl;
        } },
      { text: "Now pool small devices into a [[virtual-power-plant|virtual power plant]]: an [[aggregator|aggregator]] enrols them and cuts their use from 20:00 to 23:00, the peaker's hours. Enrol each kind and watch the gas plants.",
        build: function (act, api) {
          part = "vpp"; showStage(true); paint();
          var box = H("div", { class: "lx-toggles", role: "group", "aria-label": "Devices in the pool" }, act);
          D.vpp.devices.forEach(function (x) {
            LX.Toggle(box, { label: x.name + " (" + x.count.toLocaleString("en-US") + ")", on: !!S.kinds[x.key], onChange: function (on) {
              S.kinds[x.key] = on; keep(); paint(); api.saw(vppLine(W, D, S.kinds, S.stagger));
              if (D.vpp.devices.filter(function (d) { return S.kinds[d.key]; }).length >= 2) api.done(); } });
          });
          var det = H("details", { class: "lx-textalt" }, act); H("summary", { text: "What each kind can do" }, det);
          var ul = H("ul", null, det); D.vpp.devices.forEach(function (x) { H("li", { html: "<b>" + x.name + ":</b> " + LX.esc(x.note) }, ul); });
          if (D.vpp.devices.filter(function (d) { return S.kinds[d.key]; }).length >= 2) { api.done(); api.saw(vppLine(W, D, S.kinds, S.stagger)); }
        } },
      { text: "The pool earns money for being ready and for what it saves the town. Some goes out again, to the aggregator and as a [[coordination-cost|coordination cost]] per device. What does each owner earn?",
        build: function (act, api) {
          part = "vpp"; showStage(true);
          if (D.vpp.devices.filter(function (d) { return S.kinds[d.key]; }).length < 2) { D.vpp.devices.forEach(function (d) { S.kinds[d.key] = true; }); keep(); }
          paint();
          var io = H("ul", { class: "a7-inout" }, act);
          H("li", { html: "<b>In:</b> $" + D.vpp.capacityValue + " per kW a year for being ready, plus the running cost saved on " + D.vpp.days + " event days a year." }, io);
          H("li", { html: "<b>Out:</b> the aggregator's " + pct(D.vpp.aggregatorShare) + ", then the coordination cost per device or farm." }, io);
          var host = H("div", null, act);
          var sl = LX.Slider(H("div", null, act), { label: "Coordination cost per device or farm, a year", color: "var(--lx-warn)", min: D.vpp.coordination[0], max: D.vpp.coordination[1], step: D.vpp.coordination[2], value: S.coord,
            fmt: function (v) { return "$" + v; }, onChange: function (v) { S.coord = v; keep(); draw(); api.saw(earnLine(D, earnings(W, D, S.coord, null, S.stagger), S.coord)); api.done(); } });
          function draw() { host.innerHTML = ""; earnTable(host); }
          draw(); act.appendChild(host);
          void sl;
        } },
      { text: "[[feeder|" + D.feeder.name + "]], a local distribution line, serves " + D.feeder.homes.toLocaleString("en-US") + " homes, with " + D.feeder.enrolled.thermostat + " enrolled thermostats and " + D.feeder.enrolled.ev + " EV chargers. At " + hm(D.vpp.event[1]) + " the skipped use comes back. Release everyone at once, or stagger the restart?",
        build: function (act, api) {
          part = "feeder"; showStage(true); paint();
          seg(act, "a7-st-l", "After the event", [["once", "All at once"], ["stagger", "Staggered over six hours"]], S.stagger ? "stagger" : "once", function (k) {
            S.stagger = k === "stagger"; keep(); paint(); api.saw(feederLine(W, D, S.stagger)); if (S.stagger) api.done(); });
          if (S.stagger) { api.done(); api.saw(feederLine(W, D, true)); }
        } },
      { text: "Neighbours can trade too. Under [[net-billing|net billing]] the solar home's midday kWh earn $0 today, the hour's running cost; the renter next door pays " + cents(wires) + " a kWh for plants and wires. Set a local price.",
        build: function (act, api) {
          part = "trade"; showStage(false);
          var host = H("div", null, act);
          var sl = LX.Slider(H("div", null, act), { label: "Local price per kWh", color: "var(--lx-solar)", min: 0, max: Math.round(wires * 1000) / 10, step: D.trade.price[2], value: Math.min(S.pl * 100, Math.round(wires * 1000) / 10),
            fmt: function (v) { return v.toFixed(1) + "¢"; }, onChange: function (v) { S.pl = v / 100; keep(); draw(); api.saw(tradeLine(A4, W, wires, S.pl, S.pay)); api.done(); } });
          var tg = LX.Toggle(H("div", { class: "cf-ctl" }, act), { label: "The trade pays the plant-and-wire charge", on: S.pay, onChange: function (on) { S.pay = on; keep(); draw(); api.saw(tradeLine(A4, W, wires, S.pl, S.pay)); api.done(); } });
          function draw() { host.innerHTML = ""; tradeTable(host); }
          draw(); act.appendChild(host);
          void sl; void tg;
        } },
      { text: "In words: flexible demand mostly moves energy in time; it saves little. It acts like a power plant when enough devices answer, their coordination is paid for, and the wires can carry their return.",
        free: true,
        build: function (act) {
          part = "vpp"; showStage(false);
          H("a", { class: "lx-btn small", style: "justify-self:start", href: "#explain", html: "Flexible demand, as diagrams" + LX.icon("arrow") }, act);
        } }
    ];
    var cards = LX.StepCards(live, { steps: steps });
    live.insertBefore(stage, cards.el);

    // ---------- the ledgers (LX.Ledger, components/ledger.js)
    function earnTable(host) {
      var E = earnings(W, D, S.coord, null, S.stagger);
      LX.Ledger(host, { cls: "a7-led", caption: "A year, per device or farm, with all four kinds in the pool, " + (S.stagger ? "a staggered restart" : "everyone back at once at 23:00") + " and a coordination cost of $" + S.coord + ".",
        columns: ["Device", "Value", "Aggregator, 20%", "Coordination", "Owner earns"],
        rows: D.vpp.devices.map(function (x) {
          var e = E[x.key];
          return { head: x.name, sub: "per " + x.one + ", " + (Math.round(x.kw * x.avail * 100) / 100) + " kW on average",
                   cells: [usd(e.value), "−" + usd(e.aggregator), "−" + usd(e.coordination), usd(e.owner)] };
        }) });
    }
    function tradeTable(host) {
      var r = trade(A4, W, wires, S.pl, S.pay);
      LX.Ledger(host, { cls: "a7-led", caption: Math.round(r.kwh) + " kWh a month traded at " + cents(S.pl) + (S.pay ? ", plant-and-wire charge paid" : ", plant-and-wire charge skipped") + "; change against no trade.",
        columns: ["Party", "A month"],
        rows: [["The solar home (seller)", r.seller], ["The renter (buyer)", r.buyer], ["Other customers (plants and wires)", r.others], ["The plants: energy and CO₂", r.plants, true]].map(function (x) {
          return { head: x[0], cells: [x[2] ? "no change" : dusd(x[1])] };   // x[2]: the plants' row, which never changes
        }) });
    }

    // ---------- the explain layer, with the reader's numbers
    var xhost = document.getElementById("a07-explain");
    function buildExplain() {
      if (!xhost) return;
      xhost.innerHTML = ""; xhost.classList.add("is-live");
      var kinds = D.vpp.devices.filter(function (x) { return S.kinds[x.key]; }).length >= 1 ? S.kinds : allKinds(D), ch = chainLinks(W, D, kinds, S.stagger);
      LX.CausalChain(H("div", { class: "lx-xcard" }, xhost), {
        title: "Cause and effect: one evening event",
        links: ch.links,
        note: "Your pool and restart setting; without any device enrolled, all four kinds are shown. CO₂ in metric tonnes (t)." });
      var lc = H("div", { class: "lx-xcard" }, xhost);
      H("h3", { text: "Ledger: who earns, who pays" }, H("header", { class: "lx-x-head" }, lc));
      earnTable(lc); tradeTable(lc);
      LX.Flowchart(H("div", { class: "lx-xcard" }, xhost), {
        title: "One event, from enrolment to payment",
        lede: "An aggregator turns many small answers into one resource the grid operator can count on.",
        nodes: { enrol: { t: "Enrol devices", s: "owners sign up", k: "end" }, fc: { t: "Forecast the kW", tN: ["Forecast", "the kW"], s: "who is home, who is plugged in" },
                 bid: { t: "Offer as one resource", tN: ["Offer as one", "resource"], s: "above the market's minimum size" }, call: { t: "Called?", k: "q" },
                 act: { t: "Devices answer", tN: ["Devices", "answer"], s: "some owners opt out" }, wait: { t: "Stand by", s: "no payment for energy" },
                 meas: { t: "Measure against a baseline", tN: ["Measure against", "a baseline"], s: "what they would have used" }, pay: { t: "Pay the owners", s: "minus coordination", k: "end" } },
        at: { enrol: [0, 0], fc: [1, 0], bid: [2, 0], call: [2, 1], wait: [1, 1], act: [2, 2], meas: [1, 2], pay: [0, 2] },
        atN: { enrol: [0, 0], fc: [1, 0], bid: [1, 1], call: [1, 2], wait: [0, 2], act: [1, 3], meas: [0, 3], pay: [0, 4] },
        cols: 3, colsN: 2,
        edges: [["enrol", "fc"], ["fc", "bid"], ["bid", "call"], ["call", "wait", "no"], ["call", "act", "yes"], ["act", "meas"], ["meas", "pay"]],
        traces: [{ label: "A battery", path: ["enrol", "fc", "bid", "call", "act", "meas", "pay"], text: "It discharges 3.6 kW for three hours, and the meter shows it against the home's usual evening." },
                 { label: "A quiet evening", path: ["enrol", "fc", "bid", "call", "wait"], text: "The grid has enough: the pool is paid for being ready, not for energy." }] });
      LX.Boundary(H("div", { class: "lx-xcard" }, xhost), { title: "Where this toy holds",
        holds: ["one real-shaped day, repeated: the small hours stand for the next night;", "the plants run cheapest first, with no ramp limits;", "every device answers as forecast, and the counts and values are illustrative."],
        leaves: ["forecast errors and owners who opt out at the last minute;", "how a baseline is estimated, and its errors;", "the other feeders, and the wires' own losses."],
        source: "Prairie Town is fictional; its day follows real Southwest Power Pool hourly patterns (EIA-930)." });
    }

    paint();
    LX.demo(root, function (state) {
      if (state === "mid") { cards.go(1); S.share = D.shift.try / 100; paint(); return { view: "5% shift" }; }
      if (state === "pool") { D.vpp.devices.forEach(function (x) { S.kinds[x.key] = true; }); cards.go(4); paint(); return { view: "all four kinds" }; }
      if (state === "feeder") { cards.go(6); return { view: "feeder" }; }
      if (state === "hook") { cards.go(0); var c = live.querySelectorAll(".lx-step-act .lx-choice")[1]; if (c) c.click(); return { view: "step 1 answered: the hook's move drawn" }; }
      if (state === "kept") { S.share = D.shift.try / 100; S.loss = true; S.user = 12; S.goal = "attr"; cards.go(2); return { view: "step 3 with the settings kept from step 4" }; }
      if (state === "trade") { cards.go(7); return { view: "trade" }; }
      if (state === "pop") { cards.go(4); setTimeout(function () { var t = live.querySelector('.lx-step-text .lx-term[data-term="aggregator"]'); if (!t) return;
        t.scrollIntoView({ block: "center" }); setTimeout(function () { t.click(); }, 300); }, 600); return { view: "a glossary popover" }; }
      return null;
    }, cards);
    root.lxLesson = { model: model, W: W, S: S, cards: cards };
  });
})();
