// a10-emissions-questions.js — Analyst lesson A10, "Which emissions question are you asking? Inventories, consequences
// and procurement claims" (step cards, closed form).
//
// Data: assets/learn/data/a10-emissions-questions.json (the Plains Grid's fleet, also read by A12 and M6; the day, the two
// loads, the long-run and procurement options, the card sort, numbers to remember), town_year.json (SPP 2025 hourly
// shapes, EIA-930) and cf_targets.json (EIA's 2025 capacity factors, annual and monthly).
//
// The Plains Grid (fictional; sizes illustrative): demand = SPP's 2025 demand shape x 4,000 MW; wind and solar =
// LX.townProfile for 3,000 MW and 600 MW (method "scale", EIA's monthly capacity factors, then the 2025 annual ones), each
// rounded to whole MW; 2,000 MW of gas combined-cycle plants and 2,300 MW of gas peakers. A gas plant's CO2 per MWh =
// its heat rate (EIA, Electric Power Annual Table 8.2, 2025: 7.535 and 10.975 MMBtu per MWh) x 52.91 kg CO2 per MMBtu
// (EIA): 0.399 and 0.581 t per MWh. Running cost = heat rate x $3.85 per MMBtu (EIA Table 7.4, 2025) + variable O&M.
// CO2 is counted at the stack only (operating emissions).
//
// The day is 7 November 2025 (Central standard time), read from town_year.json as lesson 9 reads its day. Each hour is
// dispatched cheapest first, with no ramp limits: wind and sun, then (a new 300 MW combined-cycle plant, in one long-run
// option), the combined-cycle plants, then the peakers; wind and sun above demand are spilled. Model option "must run":
// the combined-cycle plants keep at least 800 MW running every hour (a minimum-output rule; illustrative), so on a windy
// night wind is spilled instead.
//   average factor of hour t   a_t = CO2_t / use_t          (the hour's CO2 shared over all its use)
//   marginal factor of hour t  the CO2 rate of the plant that would serve one more MWh (0 while wind or sun is spilled)
// The loads: a 300 MW data center, flat; a 300 MW electrolyzer that runs in the 12 hours with the lowest average factor
// of the grid without it (tie rule: the earlier hour).
// The four questions, for the load L_t:
//   1 inventory   sum of L_t x a_t, with a_t from the grid as run with the load; the shares of all users add to the total
//   2 short run   CO2(the day with the load) - CO2(without it), both dispatched by the same model
//   3 long run    the same difference after a stated build response: none; a new 300 MW combined-cycle plant (EIA's new
//                 design, 6.226 MMBtu per MWh); new wind sized to make the load's yearly energy at 33.8% (the day's output
//                 from the same hourly shape)
//   4 claim       what the buyer may report under illustrative rules after the GHG Protocol's Scope 2 Guidance (2015),
//                 market-based method (data block claimRules: certificates assumed exclusively owned, retired for the
//                 buyer and from the same market): location-based (= 1); zero with certificates matched over the year; with
//                 hourly matching, each hour's shortfall of the new wind farm's output against the load at that hour's
//                 grid-average factor (a teaching proxy; a residual mix is left out). The plants' change for a purchase is
//                 2 when it is assumed to add nothing to this grid, 3 (new wind) when it is assumed additional and
//                 deliverable (the purchase gets the farm built; no line limits).
// A 300 MW step can overflow the combined-cycle plants' spare room: in such an hour part of it runs on the peakers, so
// the next-MWh marginal factor times the load is not the change. The page draws the load's own extra CO2 per MWh, (CO2
// with - CO2 without) / load, and lists each hour's change; hourDelta() and overflow() below.
// Every number on the page is checked by _tests/learn/test_a10-emissions-questions.js.
(function () {
  "use strict";
  var HOURS = 24;

  // ---------------------------------------------------------------- pure model (no DOM; exported for Node)
  function sum(a) { return a.reduce(function (s, v) { return s + v; }, 0); }
  function gasPlant(P, p) { return { mw: p.mw, rate: p.heatRate * P.gas.co2PerMMBtu / 1000, cost: p.heatRate * P.gas.price + p.vom }; }
  function fleet(P, A) { return { cc: gasPlant(P, P.plants.cc), ct: gasPlant(P, P.plants.ct), ccn: gasPlant(P, A.newCC) }; }
  function startIndex(year, day) { return Math.round((Date.parse(day.date + "T00:00:00Z") - Date.parse(year.start_utc + "Z")) / 3600000) + 1 - day.utcOffsetHours; }
  function prepare(P, A, year, targets, profile) {
    var i0 = startIndex(year, A.day), po = { year: year, targets: targets, method: P.profile.method, monthlyCF: P.profile.monthlyCF };
    if (i0 < 0 || i0 + HOURS > year.demand.length) throw new Error("a10: the day is outside the year file");
    var pw = profile("wind", P.windMW, po), ps = profile("solar", P.solarMW, po);
    var W = { i0: i0, date: A.day.date, dateLabel: A.day.dateLabel, demand: [], wind: [], solar: [], windShape: [], F: fleet(P, A), P: P, A: A };
    for (var t = 0; t < HOURS; t++) {
      W.demand.push(Math.round(year.demand[i0 + t] / 1000 * P.demandPeakMW));
      W.wind.push(Math.round(pw.mw[i0 + t])); W.solar.push(Math.round(ps.mw[i0 + t]));
      W.windShape.push(pw.mw[i0 + t] / P.windMW);   // MW per MW of wind this hour: the same hourly shape for new wind
    }
    return W;
  }
  // one hour, cheapest first; o.mustRun keeps the combined-cycle plants at or above mustRun MW; o.newCC adds the new plant
  function hour(F, use, vre, o) {
    o = o || {}; var g = use - vre, mr = o.mustRun || 0, n = o.newCC ? F.ccn.mw : 0, ccn = 0, cc, ct, sp = 0, un = 0;
    if (g < mr) { cc = mr; ct = 0; sp = mr - g; }
    else { var r = g - mr; ccn = Math.min(n, r); r -= ccn; var c2 = Math.min(F.cc.mw - mr, r); cc = mr + c2; r -= c2; ct = Math.min(F.ct.mw, r); un = r - ct; }
    return { ccn: ccn, cc: cc, ct: ct, sp: sp, un: un, co2: ccn * F.ccn.rate + cc * F.cc.rate + ct * F.ct.rate };
  }
  function margKey(F, x, o) { if (x.sp > 1e-9) return "spill"; if (o && o.newCC && x.ccn < F.ccn.mw - 1e-9) return "ccn"; if (x.cc < F.cc.mw - 1e-9) return "cc"; if (x.ct < F.ct.mw - 1e-9) return "ct"; return "short"; }
  // the day dispatched; o: { load: [24], extraWind: [24], mustRun (MW), newCC (true) }
  function day(W, o) {
    o = o || {}; var F = W.F, D = { h: [], co2: 0, use: 0, avg: [], marg: [], key: [], un: 0 };
    for (var t = 0; t < HOURS; t++) {
      var use = W.demand[t] + (o.load ? o.load[t] : 0), x = hour(F, use, W.wind[t] + W.solar[t] + (o.extraWind ? o.extraWind[t] : 0), o), k = margKey(F, x, o);
      D.h.push(x); D.co2 += x.co2; D.use += use; D.un += x.un; D.avg.push(x.co2 / use); D.key.push(k);
      D.marg.push(k === "spill" ? 0 : k === "ccn" ? F.ccn.rate : k === "cc" ? F.cc.rate : F.ct.rate);
    }
    return D;
  }
  // the load's hours: flat, or the electrolyzer's 12 hours with the lowest average factor of the grid without it
  function loadShape(W, key) {
    var L = W.A.loads[key], out = [], t;
    if (L.rule === "flat") { for (t = 0; t < HOURS; t++) out.push(L.mw); return out; }
    var base = day(W), idx = []; for (t = 0; t < HOURS; t++) idx.push(t);
    idx.sort(function (a, b) { return base.avg[a] - base.avg[b] || a - b; });
    var on = idx.slice(0, L.hours); for (t = 0; t < HOURS; t++) out.push(on.indexOf(t) >= 0 ? L.mw : 0);
    return out;
  }
  // the load's inventory share: each MWh at its hour's average factor, with the grid run with the load
  function inventory(W, load, o) { var g = day(W, { load: load, mustRun: o && o.mustRun }), s = 0; for (var t = 0; t < HOURS; t++) s += load[t] * g.avg[t]; return { share: s, total: g.co2, others: g.co2 - s, dayAvg: g.co2 / g.use * sum(load), g: g }; }
  // what changes in each plant's output when the load is added (MWh over the day)
  function changes(a, b) {
    var o = { ccn: 0, cc: 0, ct: 0, spill: 0 };
    for (var t = 0; t < HOURS; t++) { o.ccn += b.h[t].ccn - a.h[t].ccn; o.cc += b.h[t].cc - a.h[t].cc; o.ct += b.h[t].ct - a.h[t].ct; o.spill += a.h[t].sp - b.h[t].sp; }
    return o;
  }
  function newWindMW(W, load) { return sum(load) / HOURS * 8760 / (W.A.windCF * 8760); }   // MW that make the load's yearly MWh at 33.8%
  // all four questions for load key; mr: true for the must-run model (question 2)
  function questions(W, key, mr) {
    var A = W.A, load = loadShape(W, key), mwh = sum(load), m = mr ? A.mustRunMW : 0;
    var inv = inventory(W, load), invMR = inventory(W, load, { mustRun: A.mustRunMW });
    var b0 = day(W, { mustRun: m }), b1 = day(W, { load: load, mustRun: m });
    var base = day(W), nwMW = newWindMW(W, load), nw = W.windShape.map(function (s) { return s * nwMW; });
    var gCC = day(W, { load: load, newCC: true }), gW = day(W, { load: load, extraWind: nw });
    var long = { none: day(W, { load: load }).co2 - base.co2, cc: gCC.co2 - base.co2, wind: gW.co2 - base.co2 };
    var shortDefault = day(W, { load: load }).co2 - base.co2, hourly = 0, short = 0;
    for (var t = 0; t < HOURS; t++) { hourly += Math.max(0, load[t] - nw[t]) * gW.avg[t]; short += Math.max(0, load[t] - nw[t]); }
    var claims = {}, plants = {};
    A.procure.forEach(function (p) {
      claims[p.id] = p.claim === "location" ? inv.share : p.claim === "zero" ? 0 : hourly;
      plants[p.id] = p.supply === "wind" ? long.wind : shortDefault;
    });
    return { key: key, load: load, mwh: mwh, inv: inv, invMR: invMR, short: b1.co2 - b0.co2, shortDefault: shortDefault, ch: changes(b0, b1),
      chDefault: changes(base, day(W, { load: load })), base: b0, withLoad: b1, long: long, newWindMW: nwMW, newWindMWh: sum(nw), newWind: nw,
      hourlyClaim: hourly, hourlyShort: short, claims: claims, plants: plants, day0: base, gCC: gCC, gW: gW };
  }
  // hour by hour, what adding the load (and any build) changes: CO2 (t) and each plant's MWh; a against b, same hours
  function hourDelta(a, b) {
    var o = []; for (var t = 0; t < HOURS; t++) o.push({ co2: b.h[t].co2 - a.h[t].co2, ccn: b.h[t].ccn - a.h[t].ccn, cc: b.h[t].cc - a.h[t].cc, ct: b.h[t].ct - a.h[t].ct, spill: a.h[t].sp - b.h[t].sp });
    return o;
  }
  // hours where the load's step runs on two plants (combined cycle and peakers both rise): there the next-MWh marginal
  // factor times the load differs from the change
  function overflow(a, b, load) { return hourDelta(a, b).filter(function (d, t) { return load[t] > 0 && d.cc > 1e-9 && d.ct > 1e-9; }).length; }
  function hm(t) { return (t < 10 ? "0" : "") + t + ":00"; }
  function span(t) { return hm(t) + "–" + hm(t + 1); }
  // runs of hours where the load is on: [[from, to)] for the chart's shading and the text
  function runs(load) { var o = [], s = -1; for (var t = 0; t <= HOURS; t++) { var on = t < HOURS && load[t] > 0; if (on && s < 0) s = t; if (!on && s >= 0) { o.push([s, t]); s = -1; } } return o; }
  var fm = {
    t: function (v) { var r = Math.round(v); return (r < 0 ? "−" : "") + Math.abs(r).toLocaleString("en-US") + " t"; },
    dt: function (v) { var r = Math.round(v); return (r < 0 ? "−" : r > 0 ? "+" : "") + Math.abs(r).toLocaleString("en-US") + " t"; },
    f2: function (v) { return (Math.abs(v) < 0.005 ? 0 : v).toFixed(2); },
    mwh: function (v) { return Math.round(v).toLocaleString("en-US") + " MWh"; },
    mw: function (v) { return Math.round(v).toLocaleString("en-US") + " MW"; },
    per: function (t, mwh) { return (t / mwh).toFixed(2) + " t per MWh"; }
  };
  var PLANT = { spill: "spilled wind and sun", ccn: "the new combined-cycle plant", cc: "the combined-cycle plants", ct: "the peakers", short: "unserved demand" };
  var model = { HOURS: HOURS, sum: sum, fleet: fleet, prepare: prepare, hour: hour, day: day, loadShape: loadShape, inventory: inventory, changes: changes,
    newWindMW: newWindMW, questions: questions, hourDelta: hourDelta, overflow: overflow, hm: hm, span: span, runs: runs, fm: fm, PLANT: PLANT };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX || !window.LX.H) return;

  // ================================================================ the page
  var LX = window.LX, H = LX.H, SLUG = "a10-emissions-questions";
  LX.mount(SLUG, function (live, data, root) {
    var A = data.a10_emissions_questions, P = A.plains, W = prepare(P, A, data.town_year, data.cf_targets, LX.townProfile);
    var saved = LX.store.get("a10", {}) || {};
    var S = { load: saved.load === "ez" ? "ez" : saved.load === "dc" ? "dc" : null, mr: !!saved.mr, build: saved.build || "none", buy: saved.buy || "location", part: "day" };
    function keep() { LX.store.set("a10", { load: S.load, mr: S.mr, build: S.build, buy: S.buy }); }
    function Q() { return questions(W, S.load || "dc", S.mr); }
    function name(k) { return k === "ez" ? "electrolyzer" : "data center"; }
    var BUILD = [["none", "Nothing new"], ["cc", "A new 300 MW gas plant"], ["wind", "New wind"]];

    // ---------- the stage: readouts, the day's factors, status
    var stage = H("div", { class: "lx-stage" }, live), head = H("div", { class: "lx-stage-head" }, stage), title = H("h3", null, head);
    var chips = H("div", { class: "lx-readouts", "aria-live": "polite" }, stage);
    var plot = LX.Plot(stage, { text: "Text version of the chart" });
    var status = H("p", { class: "lx-stage-status", "aria-live": "polite" }, stage);
    function chip(label, value, tone) { var c = H("div", { class: "lx-readout" + (tone ? " " + tone : "") }, chips); H("span", { text: label }, c); H("b", { text: value }, c); }
    // what the chart draws for the current step: the grid as run (g) against the same model's day without the load (b),
    // with the build response (step 5) or the purchase's new wind (step 6) when they add plants
    function scene(q) {
      if (!S.load) return { g: day(W), b: null, label: "" };
      var mrNow = S.mr && S.part === "model", none = q.inv.g;
      if (S.part === "short" || S.part === "model") return { g: mrNow ? q.withLoad : none, b: mrNow ? q.base : q.day0, label: mrNow ? " · must-run rule on" : "", inc: true };
      if (S.part === "long" && S.build === "cc") return { g: q.gCC, b: q.day0, label: " · a new 300 MW gas plant", build: true };
      if ((S.part === "long" && S.build === "wind") || (S.part === "claim" && supplyOf(S.buy) === "wind")) return { g: q.gW, b: q.day0, label: " · " + fm.mw(q.newWindMW) + " of new wind", build: true };
      return { g: none, b: q.day0, label: "" };
    }
    function supplyOf(id) { return A.procure.filter(function (x) { return x.id === id; })[0].supply; }
    function paint() {
      var q = Q(), sc = scene(q), g = sc.g, dl = sc.b ? hourDelta(sc.b, g) : null;
      title.textContent = P.name + ", " + W.dateLabel + (S.load ? " · with the " + name(S.load) : "") + sc.label;
      chips.innerHTML = "";
      if (!S.load) chip("Demand that day", fm.mwh(sum(W.demand)));
      else {
        chip("The " + name(S.load) + " uses", fm.mwh(q.mwh));
        if (S.part !== "day") chip("1 · Inventory share", fm.t(q.inv.share));
        if (["short", "model", "long", "claim", "sort"].indexOf(S.part) >= 0) chip("2 · Short-run change", fm.dt(q.short), q.short > 0 ? "bad" : null);
        if (["long", "claim", "sort"].indexOf(S.part) >= 0) chip("3 · Long run, " + BUILD.filter(function (b) { return b[0] === S.build; })[0][1].toLowerCase(), fm.dt(q.long[S.build]), q.long[S.build] > 0 ? "bad" : "good");
        if (["claim", "sort"].indexOf(S.part) >= 0) { chip("4 · Claim, illustrative rule", fm.t(q.claims[S.buy])); chip("The plants, with this purchase", fm.dt(q.plants[S.buy]), q.plants[S.buy] > 0 ? "bad" : "good"); }
      }
      var spans = S.load ? runs(q.load).map(function (r, i) { return { x0: r[0], x1: r[1], color: "var(--lx-dr)", op: 0.12, label: i === 0 ? "The " + name(S.load) + " runs" : "" }; }) : [];
      var lines = [{ values: g.marg, step: 1, color: "var(--lx-warn)", width: 2.2, dash: "6 4" }, { values: g.avg, step: 1, color: "var(--lx-accent)", width: 2.6 }];
      var legend = [{ label: "Average factor (the hour's CO₂ ÷ its use)", color: "var(--lx-accent)" }, { label: "Marginal factor (the plant serving one more MWh)", color: "var(--lx-warn)", dash: "6 4" }];
      if (sc.inc) {   // the load's own extra CO2 per MWh: it differs from the marginal factor where 300 MW runs on two plants
        lines.push({ values: q.load.map(function (l, t) { return l > 0 ? dl[t].co2 / l : null; }), step: 1, color: "var(--lx-dr)", width: 2.4 });
        legend.push({ label: "Your load's own extra CO₂ per MWh: (with − without) ÷ its MWh", color: "var(--lx-dr)" });
      }
      var head = ["Hour", "Use, MW", "Average, t/MWh", "Marginal, t/MWh", "On the margin"].concat(S.load ? ["Load, MW", "CO₂ change against no load, t"] : []);
      plot.render({
        x: { min: 0, max: 24, ticks: [[0, "00:00"], [6, "06:00"], [12, "12:00"], [18, "18:00"], [24, "24:00"]], ticksN: [[0, "0"], [6, "6"], [12, "12"], [18, "18"], [24, "24 h"]] },
        y: { min: 0, max: 0.7, step: 0.1, fmt: function (v) { return v.toFixed(1); }, unit: "t CO₂ per MWh" }, height: 250, heightN: 220, spans: spans, lines: lines, legend: legend,
        aria: P.name + " on " + W.dateLabel + ": average and marginal CO₂ factors in each hour" + (S.load ? ", with the " + name(S.load) + sc.label.replace(" · ", ", ") + (sc.inc ? ", and the load's own extra CO₂ per MWh." : ".") : "."),
        text: { head: head,
                rows: g.avg.map(function (a, t) { return [span(t), String(W.demand[t] + (S.load ? q.load[t] : 0)), fm.f2(a), fm.f2(g.marg[t]), PLANT[g.key[t]]].concat(S.load ? [String(q.load[t]), fm.dt(dl[t].co2)] : []); }) }
      });
      status.textContent = S.load ? "The " + name(S.load) + " " + A.loads[S.load].how + "." + (sc.build ? " The chart includes" + sc.label.replace(" · ", " ") + "." : "") : "Wind is high at night and falls in the afternoon; gas fills the rest.";
      buildExplain();
    }

    // ---------- step cards
    function seg(act, id, label, opts, cur, onPick) {
      var w = H("div", { class: "cf-ctl" }, act);
      H("p", { class: "cf-ctl-l", id: id, text: label }, w);
      var s = H("div", { class: "lx-seg", role: "group", "aria-labelledby": id }, w), bs = opts.map(function (o) {
        var b = H("button", { type: "button", text: o[1] }, s);
        b.setAttribute("aria-pressed", String(o[0] === cur));
        b.addEventListener("click", function () { bs.forEach(function (x, i) { x.setAttribute("aria-pressed", String(opts[i][0] === o[0])); }); onPick(o[0]); });
        return b;
      });
      return bs;
    }
    function ensureLoad() { if (!S.load) { S.load = "dc"; keep(); } }
    // the load's energy, worked: MW x hours = MWh
    function lineLoad(k) { var q = questions(W, k, false), h = q.load.filter(function (v) { return v > 0; }).length; return "The " + name(k) + " " + A.loads[k].how + ": " + A.loads[k].mw + " MW × " + h + " h = " + fm.mwh(q.mwh) + " that day."; }
    function lineInv(q) { return "**Inventory:** the " + name(q.key) + "'s share is " + fm.t(q.inv.share) + " (" + fm.per(q.inv.share, q.mwh) + "); everyone else's " + fm.t(q.inv.others) + "; together the grid's " + fm.t(q.inv.total) + ". One daily average would say " + fm.t(q.inv.dayAvg) + "."; }
    function lineShort(q) {
      var c = S.mr ? q.ch : q.chDefault, F = W.F, parts = [];
      if (c.cc > 0.5) parts.push("combined-cycle +" + fm.mwh(c.cc) + " (" + fm.dt(c.cc * F.cc.rate) + ")"); if (c.ct > 0.5) parts.push("peakers +" + fm.mwh(c.ct) + " (" + fm.dt(c.ct * F.ct.rate) + ")");
      if (c.spill > 0.5) parts.push(fm.mwh(c.spill) + " of spilled wind used");
      return "**Short run:** the plants emit " + fm.dt(q.short) + " (" + fm.per(q.short, q.mwh) + "): " + parts.join(", ") + ". The inventory said " + fm.t(q.inv.share) + ".";
    }
    // the hint under step 3: where the 300 MW step runs on two plants, the next-MWh marginal factor misleads
    function overflowHint(q) {
      var n = overflow(q.day0, q.inv.g, q.load);
      return n > 0 ? "In " + n + " hours the 300 MW overflows the combined-cycle plants' spare room onto the peakers. There the marginal factor (the next MWh) is not the load's own extra CO₂ per MWh, the third line."
        : "Every extra MWh fits in the combined-cycle plants' spare room, so the marginal factor times the load gives the change exactly.";
    }
    function lineModel(q) {
      var other = questions(W, q.key, !S.mr);
      var on = S.mr ? q : other, off = S.mr ? other : q;
      return "**Same grid, two models:** short-run change " + fm.dt(off.short) + " without the must-run rule, " + fm.dt(on.short) + " with it. " + (Math.abs(q.inv.share - q.invMR.share) < 0.5 ? "The inventory share stays at " + fm.t(q.inv.share) + "." : "The inventory share moves only from " + fm.t(q.inv.share) + " to " + fm.t(q.invMR.share) + ".");
    }
    function lineLong(q) {
      var b = S.build;
      if (b === "none") return "**Long run, nothing new built:** the same as the short run, " + fm.dt(q.long.none) + ".";
      if (b === "cc") return "**Long run, a new gas plant:** " + fm.dt(q.long.cc) + ". It runs before the older combined-cycle plants and burns less gas per MWh.";
      return "**Long run, " + fm.mw(q.newWindMW) + " of new wind:** " + fm.dt(q.long.wind) + ". It makes " + fm.mwh(q.newWindMWh) + " this day against the load's " + fm.mwh(q.mwh) + "; a calm day would differ.";
    }
    function lineClaim(q) {
      var p = A.procure.filter(function (x) { return x.id === S.buy; })[0];
      return "**" + p.label + ":** the buyer may claim " + fm.t(q.claims[p.id]) + "; the plants emit " + fm.dt(q.plants[p.id]) + " against the day without the load.";
    }
    var steps = [
      { text: "A 300 MW load joins the Plains Grid on " + W.dateLabel + ". Pick it: a data center running every hour, or an [[electrolyzer|electrolyzer]] that runs in the 12 hours with the lowest [[average-emission-factor|average CO₂ factor]].",
        build: function (act, api) {
          S.part = "day"; paint();
          seg(act, "a10-load-l", "The new load", [["dc", "Data center, flat"], ["ez", "Electrolyzer, 12 cleanest hours"]], S.load, function (k) {
            S.load = k; keep(); paint(); api.saw(lineLoad(k)); api.done(); });
          if (S.load) { api.done(); api.saw(lineLoad(S.load)); }
          H("p", { class: "lx-hint", text: "Four questions follow. Each has its own method, and each gives a different number for the same load." }, act);
        } },
      { text: "Question 1, the [[emissions-inventory|inventory]]: what share of the grid's CO₂ belongs to this load? Count each MWh at its hour's average factor; every user's shares add up to the grid's total.",
        build: function (act, api) {
          ensureLoad(); S.part = "inv"; paint();
          var b = H("button", { type: "button", class: "lx-btn small", text: "Count its share" }, act);
          b.addEventListener("click", function () { paint(); api.saw(lineInv(Q())); api.done(); });
        } },
      { text: "Question 2, the short run: what changes at the plants if the load switches on tomorrow? Dispatch the day with and without it; the difference is read through [[marginal-emission-factor|marginal factors]].",
        build: function (act, api) {
          ensureLoad(); S.part = "short"; if (S.mr) { S.mr = false; keep(); } paint();
          var b = H("button", { type: "button", class: "lx-btn small", text: "Dispatch with and without" }, act);
          var note = H("p", { class: "lx-hint", hidden: true }, act);
          b.addEventListener("click", function () { paint(); var q = Q(); api.saw(lineShort(q)); note.textContent = overflowHint(q); note.hidden = false; api.done(); });
        } },
      { text: "A marginal factor comes from a model, and its rules matter. Turn on a [[must-run|must-run]] rule (the combined-cycle plants keep 800 MW running all day) and compare both short-run answers.",
        build: function (act, api) {
          ensureLoad(); S.part = "model"; paint();
          LX.Toggle(H("div", { class: "lx-toggles", role: "group", "aria-label": "Rule in the dispatch model" }, act), { label: "Must-run: 800 MW of combined-cycle plants stay on", on: S.mr,
            onChange: function (on) { S.mr = on; keep(); paint(); api.saw(lineModel(Q())); api.done(); } });
          if (S.mr) { api.done(); api.saw(lineModel(Q())); }
        } },
      { text: "Question 3, the [[consequential-analysis|long run]]: a load that stays for years changes what gets built. Pick a build response; each is an assumption about investment, not a property of the grid.",
        build: function (act, api) {
          ensureLoad(); S.part = "long"; S.mr = false; keep(); paint();
          seg(act, "a10-build-l", "Built in response", BUILD, S.build, function (k) { S.build = k; keep(); paint(); api.saw(lineLong(Q())); if (k !== "none") api.done(); });
          if (S.build !== "none") { api.done(); api.saw(lineLong(Q())); }
          H("p", { class: "lx-hint", text: "New wind is sized to make the load's yearly energy at 33.8%, the U.S. fleet's 2025 capacity factor." }, act);
        } },
      { text: "Question 4, the claim: what may the buyer report under an illustrative [[procurement-rule|procurement rule]]? Here the plants change only when we assume the purchase is [[additionality|additional]] and [[deliverability|deliverable]] to this grid.",
        build: function (act, api) {
          ensureLoad(); S.part = "claim"; S.mr = false; keep(); paint();
          var sel = H("div", { class: "cf-ctl" }, act); H("label", { for: "a10-buy", class: "cf-ctl-l", text: "The purchase" }, sel);
          var s = H("select", { id: "a10-buy" }, sel);
          A.procure.forEach(function (p) { H("option", { value: p.id, text: p.label }, s); });
          s.value = S.buy;
          var R = A.claimRules, rl = H("ul", { class: "a10-rules" }, act);
          [R.label + ".", R.assume, R.proxy].forEach(function (t) { H("li", { class: "lx-hint", text: t }, rl); });
          var host = H("div", null, act);
          function draw() { host.innerHTML = ""; claimTable(host); }
          s.addEventListener("change", function () { S.buy = s.value; keep(); paint(); draw(); api.saw(lineClaim(Q())); if (S.buy !== "location") api.done(); });
          draw(); if (S.buy !== "location") { api.done(); api.saw(lineClaim(Q())); }
        } },
      { text: "Which question does each statement answer? Sort the eight cards; the reasons appear when you check.",
        build: function (act, api) {
          ensureLoad(); S.part = "sort"; paint();
          LX.CardSort(act, { bins: A.sort.bins.map(function (b, i) { return { id: b.id, label: b.label, sub: b.sub, color: ["var(--lx-accent)", "var(--lx-warn)", "var(--lx-tier-3)", "var(--lx-dr)"][i] }; }),
            cards: A.sort.cards, onCheck: function (g) { api.saw("You placed " + g.right + " of " + g.total + " where the course puts them."); if (g.placed === g.total) api.done(); } });
        } }
    ];
    var cards = LX.StepCards(live, { steps: steps });

    function claimTable(host) {
      var q = Q();
      LX.Ledger(host, { cls: "a10-led", caption: "The " + name(q.key) + " on " + W.dateLabel + "; claims under the illustrative rules; the plants' change is against the day without the load.",
        columns: ["Purchase", "May claim (illustrative)", "The plants emit"],
        rows: A.procure.map(function (p) { return { head: p.label, sub: p.note, cells: [fm.t(q.claims[p.id]), fm.dt(q.plants[p.id])] }; }) });
    }

    // ---------- the explain layer, with the reader's numbers
    var xhost = document.getElementById("a10-explain");
    function buildExplain() {
      if (!xhost) return;
      var q = Q(), k = S.load || "dc";
      xhost.innerHTML = ""; xhost.classList.add("is-live");
      LX.CompareTable(H("div", { class: "lx-xcard" }, xhost), {
        title: "Four questions, four methods", text: true,
        caption: "Your load: the " + name(k) + ", " + fm.mwh(q.mwh) + " on " + W.dateLabel + ".",
        columns: [{ key: "name", label: "Question", main: true }, { key: "how", label: "Method" }, { key: "you", label: "Your load" }, { key: "miss", label: "Typical misuse" }],
        rows: [
          { key: "inv", color: "var(--lx-accent)", name: "1 · Whose share?", how: "Average factors, hour by hour", you: fm.t(q.inv.share), miss: "Read as the CO₂ the load causes" },
          { key: "short", color: "var(--lx-warn)", name: "2 · What changes tomorrow?", how: "Marginal factors from a stated model", you: fm.dt(q.short) + (S.mr ? " (must-run)" : ""), miss: "Treated as a fixed property of the grid" },
          { key: "long", color: "var(--lx-tier-3)", name: "3 · What changes over years?", how: "What gets built in response", you: fm.dt(q.long[S.build]) + " (" + BUILD.filter(function (b) { return b[0] === S.build; })[0][1].toLowerCase() + ")", miss: "Skipped" },
          { key: "claim", color: "var(--lx-dr)", name: "4 · What may be claimed?", how: "A reporting rule; additionality and deliverability assumed or not", you: fm.t(q.claims[S.buy]), miss: "Read as the emissions caused" }
        ] });
      LX.Boundary(H("div", { class: "lx-xcard" }, xhost), { title: "Where these answers hold",
        holds: ["one illustrative day on a fictional grid, on real 2025 hourly shapes;", "plants run cheapest first, with no ramp limits or start-ups;", "CO₂ at the stack, from EIA's full-load heat rates (held at every output) and coefficient for gas;", "claims under illustrative rules, not a ruling on any real report."],
        leaves: ["a year: one windy November day stands for nothing else;", "imports, exports and lines inside the grid;", "life-cycle emissions: building plants, and gas leaks upstream."],
        source: "The Plains Grid is fictional; its sizes are illustrative. Demand, wind and sun follow the Southwest Power Pool's 2025 hours (EIA-930)." });
    }

    paint();
    LX.demo(root, function (state) {
      if (state === "mid") { S.load = "ez"; keep(); cards.go(2); paint(); return { view: "electrolyzer, short run" }; }
      if (state === "model") { S.load = "ez"; S.mr = true; keep(); cards.go(3); paint(); return { view: "must-run rule on" }; }
      if (state === "claim") { S.load = "dc"; S.buy = "hourly"; keep(); cards.go(5); paint(); return { view: "hourly matching" }; }
      return null;
    }, cards);
    root.lxLesson = { model: model, W: W, S: S, cards: cards };
  });
})();
