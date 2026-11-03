// a22-tradeoff-explorer.js — A22, "Cheap, clean, reliable, fair, secure: can you have them all?" (play-first, W2).
//
// Data: assets/learn/data/a22-tradeoff-explorer.json (the five measures with their units, scales and alternative
// definitions; the household groups from EIA RECS 2020; eight hand-made plans with their precomputed full-year results;
// five illustrative priority sets) and lesson 13's planning model: the shared component assets/learn/components/planengine.js
// (LX.townPlan, bundled in learn.js) with data/13-capstone.json (EIA and NREL costs, dated), town_year.json and cf_targets.json.
//
// Every plan is run hour by hour through all 8,760 hours of 2025 (lesson 13's fullYearModel with the plan fixed: a
// linear program that runs the plants and the battery at least cost and leaves demand unserved only when it must). The
// five measures come from that one run:
//   cost      $ a year: annualised capital + fixed O&M + fuel and variable O&M (lesson 13's summarize().cost)
//   co2       t a year: gas burned x its CO2 per MWh (operating emissions only)
//   unserved  MWh a year of demand left unserved (plants never break down in this model)
//   fair      % of home power bills paid by low-income homes (income under $40,000; EIA RECS 2020 shares), under a
//             stated tariff: "fixed" (each home pays an equal share of the fixed costs; running costs per kWh), "graded"
//             (low-income homes pay half the fixed charge of other homes), "flat" (every cost per kWh)
//   gas       % of the electricity used that was made from gas (all gas piped in from outside, none stored)
// Alternatives: rm (reserve margin, % above the year's peak, with stated capacity values) for reliability; largest (the
// largest single source's share of the electricity used, %) for security.
// Dominance, weighted sums and the limits model (the cheapest plan that meets limits on CO2, gas and the low-income
// share: an epsilon-constraint with three limits, on lesson 13's seven representative weeks) are pure functions below.
// Every number the page states is checked by _tests/learn/test_a22-tradeoff-explorer.js.
(function () {
  "use strict";
  var HOURS = 8760;
  // ---------------------------------------------------------------- pure model
  function blank(p) { var o = { wind: 0, solar: 0, cc: 0, pk: 0, nuc: 0, bp: 0, be: 0 }; for (var k in p) o[k] = p[k]; return o; }
  // capacity values for the reserve margin: wind's and solar's average output per MW built in the year's `n` highest-demand hours
  function capValues(Y, n) {
    var idx = Y.demand.map(function (d, i) { return i; }).sort(function (a, b) { return Y.demand[b] - Y.demand[a] || a - b; }).slice(0, n);
    var w = 0, s = 0; idx.forEach(function (i) { w += Y.wind[i]; s += Y.solar[i]; });
    return { wind: w / n, solar: s / n, hours: n };
  }
  // reserve margin (fraction above the peak): gas and nuclear at full size, wind and solar at their capacity values, a
  // battery at its MW, or at MWh / 4 when it holds less than four hours
  function reserveMargin(plan, cv, peak, hoursFull) {
    var hf = hoursFull || 4;
    var acc = plan.cc + plan.pk + plan.nuc + plan.wind * cv.wind + plan.solar * cv.solar + Math.min(plan.bp, plan.be / hf);
    return acc / peak - 1;
  }
  // low-income homes' share of home power bills, for a plan whose fixed costs are the fraction f of its cost.
  // g = {homes: share of homes, use: share of home electricity}; tariff "fixed" | "graded" | "flat"; graded = the low-income
  // fixed charge as a fraction of other homes' (0.5)
  function fairShare(f, g, tariff, graded) {
    var fixedShare = tariff === "flat" ? g.use : tariff === "graded" ? g.homes * graded / (g.homes * graded + 1 - g.homes) : g.homes;
    if (tariff === "flat") return g.use;
    return fixedShare * f + g.use * (1 - f);
  }
  // the five measures (and the alternatives) of a plan run on the full year: res = solver result of fullYearModel(C, Y, {plan})
  function measure(C, Y, res, plan, D) {
    var v = res.values, used = { wind: 0, solar: 0, nuc: 0, gas: 0 }, hrs = 0, nuc = C.nucAvail * plan.nuc;
    var e = { wind: 0, solar: 0, nuc: 0, cc: 0, pk: 0 }, unserved = 0, demand = 0, spilled = 0, avail = 0;
    for (var h = 0; h < Y.demand.length; h++) {
      var id = "0_" + h, g = v["g" + id] || 0, q = v["p" + id] || 0, u = v["u" + id] || 0, dis = v["d" + id] || 0, ch = v["c" + id] || 0;
      var w = Y.wind[h] * plan.wind, s = Y.solar[h] * plan.solar, a = w + s + nuc;
      var x = Math.max(0, a + g + q + dis - ch + u - Y.demand[h]), k = a > 0 ? (a - x) / a : 0;   // spill shared by availability
      used.wind += w * k; used.solar += s * k; used.nuc += nuc * k; used.gas += g + q;
      e.cc += g; e.pk += q; e.wind += w; e.solar += s; e.nuc += nuc;
      unserved += u; demand += Y.demand[h]; spilled += x; avail += a;
      if (u > 0.05) hrs++;
    }
    var T = C.techs, tot = used.wind + used.solar + used.nuc + used.gas;
    var fixed = T.wind.fixed * plan.wind + T.solar.fixed * plan.solar + T.cc.fixed * plan.cc + T.pk.fixed * plan.pk +
                T.nuc.fixed * plan.nuc + T.bp.fixed * plan.bp + T.be.fixed * plan.be;
    var running = e.cc * T.cc.run + e.pk * T.pk.run + e.nuc * T.nuc.run, cost = fixed + running, f = cost > 0 ? fixed / cost : 0;
    var shares = {}; Object.keys(used).forEach(function (k2) { shares[k2] = tot > 0 ? used[k2] / tot : 0; });
    var largest = Math.max(shares.wind, shares.solar, shares.nuc, shares.gas);
    return {
      cost: cost, fixed: fixed, running: running, f: f, co2: e.cc * T.cc.co2 + e.pk * T.pk.co2,
      unserved: unserved, unservedShare: demand > 0 ? unserved / demand : 0, hoursShort: hrs, demand: demand,
      spilledShare: avail > 0 ? spilled / avail : 0, shares: shares, gas: shares.gas, largest: largest,
      rm: reserveMargin(plan, D.cv, D.peak, D.batteryHours),
      fair: { fixed: fairShare(f, D.groups, "fixed", D.graded), graded: fairShare(f, D.groups, "graded", D.graded), flat: fairShare(f, D.groups, "flat", D.graded) }
    };
  }
  // the value on each axis under the chosen definitions; defs = {rel: "unserved" | "rm", fair: "fixed" | "graded" | "flat", sec: "gas" | "largest"}
  var AXES = ["cost", "co2", "rel", "fair", "sec"];
  function axisValue(m, axis, defs) {
    if (axis === "cost") return m.cost;
    if (axis === "co2") return m.co2;
    if (axis === "rel") return defs.rel === "rm" ? m.rm : m.unserved;
    if (axis === "fair") return m.fair[defs.fair];
    return defs.sec === "largest" ? m.largest : m.gas;
  }
  function axisKey(axis, defs) { return axis === "rel" ? defs.rel : axis === "fair" ? "fair" : axis === "sec" ? defs.sec : axis; }
  // rounded as the page shows it: dominance and weighted sums use these values, so a reader can check them by eye
  var PREC = { cost: 1e5, co2: 1e3, unserved: 1, rm: 0.01, fair: 0.001, gas: 0.01, largest: 0.01 };
  function shown(v, key) { var p = PREC[key]; return Math.round(v / p) * p; }
  // higher is better only for the reserve margin
  function better(key) { return key === "rm" ? 1 : -1; }
  function row(m, defs) {
    var o = {}; AXES.forEach(function (a) { var k = axisKey(a, defs); o[a] = { key: k, v: shown(axisValue(m, a, defs), k) }; }); return o;
  }
  // p dominates q: at least as good on every axis and strictly better on one (values as shown)
  function dominates(p, q, defs, axes) {
    var rp = row(p, defs), rq = row(q, defs), strict = false;
    for (var i = 0; i < (axes || AXES).length; i++) {
      var a = (axes || AXES)[i], s = better(rp[a].key), d = s * (rp[a].v - rq[a].v);
      if (d < -1e-9) return false;
      if (d > 1e-9) strict = true;
    }
    return strict;
  }
  // plans = [{id, m}]; returns {id: [ids that dominate it]} for the dominated ones
  function dominated(plans, defs, axes) {
    var out = {};
    plans.forEach(function (q) {
      var by = plans.filter(function (p) { return p !== q && dominates(p.m, q.m, defs, axes); }).map(function (p) { return p.id; });
      if (by.length) out[q.id] = by;
    });
    return out;
  }
  function unbeaten(plans, defs, axes) { var d = dominated(plans, defs, axes); return plans.filter(function (p) { return !d[p.id]; }).map(function (p) { return p.id; }); }
  // a score from 0 (the centre of the radar: the scale's worst end) to 1 (the rim: its best end), on the stated fixed scale
  function score(v, sc) { var t = (sc.worst - v) / (sc.worst - sc.best); return Math.max(0, Math.min(1, t)); }
  function scores(m, defs, scales) { var o = {}; AXES.forEach(function (a) { var k = axisKey(a, defs); o[a] = score(shown(axisValue(m, a, defs), k), scales[k]); }); return o; }
  // weighted sum of the scores (weights in any units; normalised by their total); the highest total wins, ties to the lower cost
  function total(m, w, defs, scales) {
    var s = scores(m, defs, scales), t = 0, W = 0;
    AXES.forEach(function (a) { t += (w[a] || 0) * s[a]; W += (w[a] || 0); });
    return W > 0 ? t / W : 0;
  }
  function pick(plans, w, defs, scales) {
    var best = null;
    plans.forEach(function (p) {
      var t = total(p.m, w, defs, scales);
      if (!best || t > best.t + 1e-9 || (Math.abs(t - best.t) <= 1e-9 && p.m.cost < best.p.m.cost)) best = { p: p, t: t };
    });
    return { id: best.p.id, total: best.t };
  }
  // ---- "can you have them all?": the cheapest plan on lesson 13's seven weeks with limits on CO2 (t), gas (share of the
  // electricity used) and the low-income share of home bills under a tariff; every modelled hour served (lesson 13's optimizer)
  //   gas:  sum w (g + p) <= gasMax x sum w (D - u + c - d)   (the electricity used; u = 0 for the optimizer)
  //   fair: A x F + use x V <= s x (F + V), with A the low-income share of the fixed charge, F the fixed costs and V the
  //         running costs: (A - s) F + (use - s) V <= 0. Nuclear's running cost (fuel and O&M at its constant output) is in V.
  //   on the full year (Y, as lesson 13's fullYearModel) or on the seven weeks (RW, as lesson 13's weekModel)
  function limitModel(TP, C, Y, RW, L, D) {
    var o = L.co2 != null ? { cap: L.co2 } : {}, T = C.techs;
    var per = Y ? [{ demand: Y.demand, wind: Y.wind, solar: Y.solar, weight: 1 }] : TP.periodsOf(RW);
    var m = Y ? TP.fullYearModel(C, Y, o) : TP.weekModel(C, RW, o);
    if (L.gas != null) {
      var gt = {}, rhs = 0;
      per.forEach(function (P, p) {
        for (var h = 0; h < P.demand.length; h++) {
          var id = p + "_" + h; gt["g" + id] = P.weight; gt["p" + id] = P.weight; rhs += P.weight * P.demand[h];
          // the battery's losses count as electricity used: + c - d on the right, moved to the left
          gt["c" + id] = (gt["c" + id] || 0) - L.gas * P.weight; gt["d" + id] = (gt["d" + id] || 0) + L.gas * P.weight;
        }
      });
      m.constraints.push({ name: "gasShare", terms: gt, le: L.gas * rhs });
    }
    if (L.fair != null) {
      var g = D.groups, A = L.tariff === "flat" ? g.use : L.tariff === "graded" ? g.homes * D.graded / (g.homes * D.graded + 1 - g.homes) : g.homes;
      var s = L.fair, ft = {}, kF = A - s, kV = g.use - s;
      ["wind", "solar", "cc", "pk", "bp", "be"].forEach(function (k) { ft["K_" + k] = kF * T[k].fixed; });
      ft.K_nuc = kF * T.nuc.fixed + kV * T.nuc.run * C.nucAvail * HOURS;
      per.forEach(function (P, p) {
        for (var h = 0; h < P.demand.length; h++) { var id = p + "_" + h; ft["g" + id] = kV * P.weight * T.cc.run; ft["p" + id] = kV * P.weight * T.pk.run; }
      });
      m.constraints.push({ name: "fairShare", terms: ft, le: 0 });
    }
    return m;
  }
  // how each measure moved from m0 to m1 (values as shown): +1 better, -1 worse, 0 the same
  function moves(m0, m1, defs) {
    var r0 = row(m0, defs), r1 = row(m1, defs), o = {};
    AXES.forEach(function (a) { var d = better(r0[a].key) * (r1[a].v - r0[a].v); o[a] = d > 1e-9 ? 1 : d < -1e-9 ? -1 : 0; });
    return o;
  }
  // over a list of changes [{from, to}]: how often each pair of measures moved in opposite directions ("cost|co2": n), and
  // how many changes made something better and nothing worse (free gains)
  function conflicts(list, defs) {
    var c = {}, free = 0;
    list.forEach(function (mv) {
      var d = moves(mv.from, mv.to, defs), up = 0, down = 0;
      AXES.forEach(function (a) { if (d[a] > 0) up++; if (d[a] < 0) down++; });
      if (up && !down) free++;
      for (var i = 0; i < AXES.length; i++) for (var j = i + 1; j < AXES.length; j++) {
        if (d[AXES[i]] * d[AXES[j]] < 0) { var k = AXES[i] + "|" + AXES[j]; c[k] = (c[k] || 0) + 1; }
      }
    });
    var top = null; Object.keys(c).forEach(function (k) { if (!top || c[k] > c[top]) top = k; });
    return { pairs: c, top: top, free: free };
  }
  // plans beaten on cost and CO2 alone (lesson 12's view) but unbeaten on all five: for each, the measures on which it beats
  // a plan that beats it on two; and the narrowest escape (the smallest winning margin, as a share of that measure's scale)
  function rescued(plans, defs, scales) {
    var d2 = dominated(plans, defs, ["cost", "co2"]), d5 = dominated(plans, defs), out = [], narrow = null;
    plans.forEach(function (q) {
      if (!d2[q.id] || d5[q.id]) return;
      var rq = row(q.m, defs), axes = {};
      d2[q.id].forEach(function (pid) {
        var p = plans.filter(function (x) { return x.id === pid; })[0], rp = row(p.m, defs), best = null;
        AXES.forEach(function (a) {
          var g = better(rq[a].key) * (rq[a].v - rp[a].v), sc = scales[rq[a].key], rel = g / Math.abs(sc.worst - sc.best);
          if (g > 1e-9) { axes[a] = true; if (!best || rel > best.rel) best = { axis: a, key: rq[a].key, g: g, rel: rel }; }
        });
        if (best && (!narrow || best.rel < narrow.rel)) narrow = { id: q.id, by: pid, axis: best.axis, key: best.key, g: best.g, rel: best.rel, v: rq[best.axis].v, vs: rp[best.axis].v };
      });
      out.push({ id: q.id, by: d2[q.id], axes: AXES.filter(function (a) { return axes[a]; }) });
    });
    return { list: out, narrow: narrow };
  }
  // ---- the re-solve behind the plan sliders: debounced, cancellable, newest result only (pure; the Node test drives it
  // with fake timers). set(x, now) waits `delay` ms (none when now), then runs job(x, signal). A newer set() clears the
  // wait and aborts a job already running through its AbortSignal (LX.solver stops a queued or a running solve; aborted()
  // then lets the page restart the solver while the next wait runs). A result reaches done(result, x) only when it belongs
  // to the newest set(), so a late or stale result never overwrites a newer plan. busy(on) turns on at the first set() and
  // off just before the newest job's done() (or fail()), so Next stays shut while a change is waiting or solving.
  // o = { delay (ms), job(x, signal) -> value or Promise, done(result, x), fail(err, x), busy(on), aborted(),
  //       setTimeout, clearTimeout, AbortController }   (the last three default to the global ones)
  function resolver(o) {
    var st = o.setTimeout || setTimeout, ct = o.clearTimeout || clearTimeout;
    var AC = o.AbortController || (typeof AbortController !== "undefined" ? AbortController : null);
    var timer = null, ctl = null, running = false, seq = 0, busy = false;
    function setBusy(on) { if (on !== busy) { busy = on; if (o.busy) o.busy(on); } }
    function stop() {
      if (timer !== null) { ct(timer); timer = null; }
      if (ctl || running) { var c = ctl, was = running; ctl = null; running = false; if (c) c.abort(); if (was && o.aborted) o.aborted(); }
    }
    function set(x, now) {
      var my = ++seq;
      stop(); setBusy(true);
      timer = st(function () {
        timer = null; running = true;
        var c = AC ? new AC() : null, p; ctl = c;
        try { p = Promise.resolve(o.job(x, c ? c.signal : undefined)); } catch (e) { p = Promise.reject(e); }
        p.then(function (r) { end(r, null); }, function (err) { end(null, err || new Error("re-solve failed")); });
        function end(r, err) {
          if (my !== seq) return;          // a newer change came: this result is stale
          ctl = null; running = false; setBusy(false);
          if (err) { if (o.fail) o.fail(err, x); } else o.done(r, x);
        }
      }, now ? 0 : o.delay);
      return my;
    }
    function cancel() { seq++; stop(); setBusy(false); }
    return { set: set, cancel: cancel, busy: function () { return busy; }, pending: function () { return timer !== null || running; } };
  }
  var model = { AXES: AXES, blank: blank, capValues: capValues, reserveMargin: reserveMargin, fairShare: fairShare, measure: measure,
                axisValue: axisValue, axisKey: axisKey, shown: shown, better: better, row: row, dominates: dominates, dominated: dominated,
                unbeaten: unbeaten, score: score, scores: scores, total: total, pick: pick, limitModel: limitModel,
                moves: moves, conflicts: conflicts, rescued: rescued, resolver: resolver };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX || !window.LX.H) return;

  // ================================================================ the page (component library: window.LX)
  var LX = window.LX, H = LX.H, S = LX.S, M = model, LESSON = "a22-tradeoff-explorer";
  var LAB = { cost: "Cheap", co2: "Clean", rel: "Reliable", fair: "Fair", sec: "Secure" };
  var F = {
    musd: function (v) { return "$" + (v / 1e6).toFixed(1) + "M"; },
    kt: function (v) { return Math.round(v / 1e3).toLocaleString("en-US") + " kt"; },
    mwh: function (v) { return Math.round(v).toLocaleString("en-US") + " MWh"; },
    pct: function (x, d) { return (x * 100).toFixed(d == null ? 0 : d) + "%"; }
  };
  // a measure's value as the page shows it
  function fmtKey(k, v) {
    return k === "cost" ? F.musd(v) : k === "co2" ? F.kt(v) : k === "unserved" ? F.mwh(v) : k === "fair" ? F.pct(v, 1) : F.pct(v);
  }
  function val(m, axis, defs) { var k = M.axisKey(axis, defs); return fmtKey(k, M.shown(M.axisValue(m, axis, defs), k)); }
  // the change between two values, as shown, with its sign
  function delta(m0, m1, axis, defs) {
    var k = M.axisKey(axis, defs), a = M.shown(M.axisValue(m0, axis, defs), k), b = M.shown(M.axisValue(m1, axis, defs), k), d = b - a;
    if (Math.abs(d) < 1e-9) return "";
    var s = d > 0 ? "+" : "−", x = Math.abs(d);
    if (k === "cost") return s + F.musd(x);
    if (k === "co2") return s + F.kt(x);
    if (k === "unserved") return s + F.mwh(x);
    return s + (x * 100).toFixed(k === "fair" ? 1 : 0) + (k === "fair" ? " pt" : " pt");
  }
  var TARIFF = {
    fixed: { label: "Fixed charge per home", art: "a fixed charge per home", short: "Fixed per home", text: "each home pays an equal share of the fixed costs (building and upkeep); running costs are paid per kWh" },
    graded: { label: "Income-graduated fixed charge", art: "an income-graduated fixed charge", short: "Income-graduated", text: "as above, but a low-income home pays half the fixed charge of other homes (illustrative)" },
    flat: { label: "Per kWh only", art: "every cost charged per kWh", short: "Per kWh only", text: "every cost is paid per kWh, so each home pays in proportion to its use" }
  };
  var REL = { unserved: "Unserved energy", rm: "Reserve margin" }, SEC = { gas: "Gas share", largest: "Largest source" };
  var DEFAULTS = { rel: "unserved", fair: "fixed", sec: "gas" };

  function css() {
    if (document.getElementById("a22-css")) return;
    H("style", { id: "a22-css", text: [
      ".a22-play{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(300px,1fr);grid-template-areas:'radar panel' 'lib panel';gap:18px 22px;align-items:start}",
      ".a22-radarcard{grid-area:radar}.a22-libcard{grid-area:lib}.a22-panel{grid-area:panel;display:grid;gap:14px;min-width:0}",
      "@media (max-width:860px){.a22-play{grid-template-columns:minmax(0,1fr);grid-template-areas:'radar' 'panel' 'lib'}}",
      ".a22-card{background:var(--lx-surface);border:1px solid var(--lx-line);border-radius:var(--lx-r-lg);padding:14px 16px;display:grid;gap:10px;min-width:0}",
      ".page-learn .a22-card h3{font-size:17px;margin:0}.a22-card>*,.a22-panel>*{min-width:0;max-width:100%}",
      ".a22-head{display:flex;justify-content:space-between;align-items:center;gap:6px 12px;flex-wrap:wrap}",
      ".a22-sub{font-size:13.5px;color:var(--lx-ink-3);margin:0}",
      ".a22-radar svg{display:block;width:100%;max-width:440px;height:auto;margin:0 auto}",
      ".a22-radar text{font-family:var(--lx-f-display);font-size:14px;font-weight:600;fill:var(--lx-ink)}",
      ".a22-radar text.ring{font-family:var(--lx-f-mono);font-size:10.5px;font-weight:400;fill:var(--lx-ink-3)}",
      ".a22-radar .grid{fill:none;stroke:var(--lx-line-2);stroke-width:1}.a22-radar .grid.half{stroke-dasharray:3 3}",
      ".a22-radar .spoke{stroke:var(--lx-line-2);stroke-width:1}",
      ".a22-leg{display:flex;flex-wrap:wrap;gap:4px 14px;justify-content:center;font-size:13px;color:var(--lx-ink-2)}",
      ".a22-leg span{display:inline-flex;align-items:center;gap:6px}.a22-leg i{display:inline-block;width:18px;height:0;border-top:2.5px solid var(--c)}",
      ".a22-leg i.dash{border-top-style:dashed}.a22-leg i.dot{border-top-style:dotted}",
      ".a22-tiles{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px}",
      "@media (max-width:560px){.a22-tiles{grid-template-columns:repeat(3,minmax(0,1fr))}}",
      ".a22-tile{display:grid;gap:1px;text-align:left;min-width:0;padding:7px 8px;border-radius:10px;border:1px solid var(--lx-line);background:var(--lx-surface-2);color:var(--lx-ink);cursor:pointer;font:inherit}",
      ".a22-tile[aria-pressed=true]{border-color:var(--lx-accent);box-shadow:inset 0 0 0 1px var(--lx-accent)}",
      ".a22-tile .l{font-family:var(--lx-f-display);font-size:12.5px;color:var(--lx-ink-2);display:flex;gap:4px;align-items:center;flex-wrap:wrap}",
      ".a22-tile .l em{font-style:normal;font-size:10.5px;letter-spacing:.04em;text-transform:uppercase;color:var(--lx-warn);border:1px dashed var(--lx-warn);border-radius:6px;padding:0 4px}",
      ".a22-tile b{font-family:var(--lx-f-mono);font-size:15px;font-weight:600;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}",
      ".a22-tile small{font-family:var(--lx-f-mono);font-size:11.5px;min-height:1.2em;color:var(--lx-ink-3)}",
      ".a22-tile small.good{color:var(--lx-good)}.a22-tile small.bad{color:var(--lx-bad)}",
      ".a22-def{border-left:3px solid var(--lx-accent);background:var(--lx-surface-2);border-radius:0 10px 10px 0;padding:9px 12px;display:grid;gap:5px;font-size:14px}",
      ".a22-def[hidden]{display:none}.page-learn .a22-def h4{font-size:14.5px;margin:0}.a22-def p{margin:0}",
      ".a22-def .kind{font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:var(--lx-ink-3)}.a22-def .kind.choice{color:var(--lx-warn)}",
      ".a22-cmp{font-size:13.5px;color:var(--lx-ink-2);margin:0}.a22-cmp b{font-family:var(--lx-f-mono);font-weight:600}",
      ".a22-plans{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}",
      ".a22-plan{position:relative;display:grid;grid-template-columns:auto minmax(0,1fr);grid-template-rows:auto auto;gap:2px 8px;align-items:center;text-align:left;padding:8px;border-radius:12px;border:1px solid var(--lx-line);background:var(--lx-surface);color:var(--lx-ink);cursor:pointer;font:inherit;min-width:0}",
      ".a22-plan:hover{border-color:var(--lx-line-2)}.a22-plan[aria-pressed=true]{border-color:var(--lx-accent);box-shadow:inset 0 0 0 1.5px var(--lx-accent);background:var(--lx-accent-soft)}",
      ".a22-plan .g{grid-row:1/3;width:52px;height:52px}.a22-plan .g svg{width:52px;height:52px;display:block}",
      ".a22-plan .n{font-family:var(--lx-f-display);font-size:13px;line-height:1.25;min-width:0}.a22-plan .n b{font-weight:700;margin-right:4px}",
      ".a22-plan .s{font-size:12px;color:var(--lx-ink-3);line-height:1.25}",
      ".a22-plan.beaten .s{color:var(--lx-bad)}.a22-plan.unbeaten .s{color:var(--lx-good)}.a22-plan.beaten .g{opacity:.55}",
      ".a22-plan .bdg{position:absolute;top:-8px;right:6px;font-size:10.5px;font-family:var(--lx-f-display);background:var(--lx-ink);color:var(--lx-bg);border-radius:8px;padding:1px 6px}",
      "@media (max-width:620px){.a22-plans{grid-template-columns:repeat(2,minmax(0,1fr))}}",
      ".a22-glyph .ring{fill:none;stroke:var(--lx-line-2);stroke-width:1}",
      ".a22-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}",
      ".a22-out{font-size:14.5px;margin:0}.a22-out b{font-family:var(--lx-f-mono);font-weight:600}",
      ".a22-list{margin:0;padding-left:1.1em;font-size:14px;display:grid;gap:3px}",
      ".a22-grid2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px 12px}@media (max-width:520px){.a22-grid2{grid-template-columns:minmax(0,1fr)}}",
      ".a22-grp>p:first-child{font-family:var(--lx-f-display);font-weight:500;font-size:12px;letter-spacing:.07em;text-transform:uppercase;color:var(--lx-ink-3);margin:6px 0 0}",
      ".a22-pri{display:grid;grid-template-columns:repeat(auto-fit,minmax(116px,1fr));gap:6px}",
      ".a22-pri button{min-height:40px;padding:4px 8px;border-radius:10px;border:1px solid var(--lx-line-2);background:var(--lx-surface);color:var(--lx-ink);font-family:var(--lx-f-display);font-size:13.5px;cursor:pointer;text-align:left}",
      ".a22-pri button[aria-pressed=true]{background:var(--lx-ink);color:var(--lx-bg)}.a22-pri button.seen::after{content:' ✓';color:var(--lx-good)}",
      ".a22-pri button[aria-pressed=true].seen::after{color:inherit}",
      ".a22-wbars{display:grid;gap:3px;margin:0;padding:0;list-style:none;font-size:13px}",
      ".a22-wbars li{display:grid;grid-template-columns:5.2em minmax(0,1fr) 2.4em;gap:8px;align-items:center}",
      ".a22-wbars i{display:block;height:9px;border-radius:5px;background:var(--lx-accent)}.a22-wbars span.n{font-family:var(--lx-f-mono);text-align:right}",
      ".a22-defs{display:grid;gap:8px}.a22-defs .lx-seg{display:flex;flex-wrap:wrap}.a22-defs .lx-seg button[aria-pressed=true]{background:var(--lx-ink);color:var(--lx-bg)}",
      ".a22-defs .lab{font-family:var(--lx-f-display);font-size:12.5px;color:var(--lx-ink-3);margin:0}",
      ".a22-tbl{width:100%;border-collapse:collapse;font-size:13.5px}.a22-tbl th,.a22-tbl td{padding:3px 5px;border-bottom:1px solid var(--lx-line);text-align:right;font-weight:400;white-space:nowrap}",
      ".a22-tbl th:first-child,.a22-tbl td:first-child{text-align:left;white-space:normal}.a22-tbl td{font-family:var(--lx-f-mono);font-variant-numeric:tabular-nums}.a22-tbl td:first-child{font-family:var(--lx-f-body)}",
      ".a22-tbl thead th{font-family:var(--lx-f-display);font-size:12px;color:var(--lx-ink-3)}.a22-scroll{overflow-x:auto;max-width:100%}",
      ".a22-tbl td:first-child{min-width:10em}.a22-tbl td small{font-size:12px;color:var(--lx-ink-3)}",
      ".a22-conn{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin:0;padding:0;list-style:none}",
      ".a22-conn li{border:1px solid var(--lx-line);border-radius:10px;padding:8px 10px;font-size:13.5px;display:grid;gap:2px}.a22-conn li b{font-family:var(--lx-f-display)}"
    ].join("") }, document.head);
  }

  // ---------------------------------------------------------------- the radar (i-radar, lesson-local): five scores, one
  // polygon per series, rim = best. series: [{id, label, s: {axis: 0..1}, color, dash, faint, values: {axis: text}}]
  function Radar(host, o) {
    var box = H("div", { class: "a22-radar" }, host), W = 360, Hh = 292, cx = 180, cy = 150, R = 104, axes = o.axes, n = axes.length;
    var svg = S("svg", { viewBox: "0 0 " + W + " " + Hh, role: "img", "aria-label": o.label }, box);
    var leg = H("div", { class: "a22-leg", "aria-hidden": "true" }, box);
    var tv = H("details", { class: "lx-textalt" }, box); H("summary", { text: "Text version of the radar" }, tv);
    var tvBody = H("div", { class: "a22-scroll" }, tv);
    var drawn = {}, raf = null, last = null;
    function P(i, r) { var a = -Math.PI / 2 + i * 2 * Math.PI / n; return [cx + r * R * Math.cos(a), cy + r * R * Math.sin(a)]; }
    function poly(sc) { return axes.map(function (ax, i) { var p = P(i, 0.04 + 0.96 * sc[ax.key]); return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" "); }
    function frame(series, t) {
      svg.innerHTML = "";
      [0.25, 0.5, 0.75, 1].forEach(function (r) {
        S("polygon", { class: "grid" + (r === 0.5 ? " half" : ""), points: axes.map(function (ax, i) { var p = P(i, 0.04 + 0.96 * r); return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" ") }, svg);
      });
      axes.forEach(function (ax, i) {
        var p = P(i, 1), q = P(i, 1.2);
        S("line", { class: "spoke", x1: cx, y1: cy, x2: p[0], y2: p[1] }, svg);
        var anchor = Math.abs(q[0] - cx) < 8 ? "middle" : q[0] > cx ? "start" : "end";
        S("text", { x: q[0].toFixed(1), y: (q[1] + (q[1] < cy - 20 ? -2 : 10)).toFixed(1), "text-anchor": anchor }, svg).textContent = ax.label;
      });
      series.forEach(function (s) {
        var from = drawn[s.id] || s.s, cur = {};
        axes.forEach(function (ax) { cur[ax.key] = from[ax.key] + (s.s[ax.key] - from[ax.key]) * t; });
        S("polygon", { points: poly(cur), fill: s.faint ? "none" : s.color, "fill-opacity": s.faint ? 0 : s.id === "you" ? 0.16 : 0.07,
          stroke: s.color, "stroke-width": s.id === "you" ? 2.4 : 1.8, "stroke-dasharray": s.dash || null, "stroke-linejoin": "round", opacity: s.faint ? 0.7 : 1 }, svg);
        if (!s.faint) axes.forEach(function (ax, i) { var p = P(i, 0.04 + 0.96 * cur[ax.key]); S("circle", { cx: p[0].toFixed(1), cy: p[1].toFixed(1), r: s.id === "you" ? 3.4 : 2.6, fill: s.color }, svg); });
      });
    }
    function draw(series) {
      last = series;
      leg.innerHTML = "";
      series.forEach(function (s) { var x = H("span", null, leg); H("i", { class: s.dash ? (s.faint ? "dot" : "dash") : "", style: "--c:" + s.color }, x); H("span", { text: s.label }, x); });
      // text version: one row per measure, one column per series
      var h = "<table class='a22-tbl'><thead><tr><th scope='col'>Goal (measure)</th>" + series.map(function (s) { return "<th scope='col'>" + LX.esc(s.label) + "</th>"; }).join("") + "</tr></thead><tbody>";
      axes.forEach(function (ax) {
        h += "<tr><th scope='row'>" + LX.esc(ax.label + " (" + ax.name() + ")") + "</th>" + series.map(function (s) { return "<td>" + LX.esc(s.values[ax.key]) + " · score " + s.s[ax.key].toFixed(2) + "</td>"; }).join("") + "</tr>";
      });
      tvBody.innerHTML = h + "</tbody></table><p class='lx-hint'>Score: 0 at the centre (the worst end of the measure's scale), 1 at the rim (the best end).</p>";
      var you = series[0];
      var say = "Radar of five goals. " + series.map(function (s) { return s.label + ": " + axes.map(function (ax) { return ax.label + " " + s.values[ax.key]; }).join(", "); }).join(". ") + ".";
      svg.setAttribute("aria-label", say);
      if (raf) cancelAnimationFrame(raf);
      if (LX.reduced() || !you) { frame(series, 1); done(); return; }
      var t0 = null;
      (function step(ts) {
        if (t0 == null) t0 = ts;
        var t = Math.min(1, (ts - t0) / 380), e = 1 - Math.pow(1 - t, 3);
        frame(series, e);
        if (t < 1) raf = requestAnimationFrame(step); else { raf = null; done(); }
      })(performance.now());
      function done() { series.forEach(function (s) { drawn[s.id] = s.s; }); }
    }
    LX.onTheme(function () { if (last) frame(last, 1); });
    return { el: box, draw: draw };
  }
  Radar.glyph = function (host, sc, axes, color) {
    var w = 52, c = 26, R = 22, n = axes.length;
    function P(i, r) { var a = -Math.PI / 2 + i * 2 * Math.PI / n; return (c + r * R * Math.cos(a)).toFixed(1) + "," + (c + r * R * Math.sin(a)).toFixed(1); }
    host.innerHTML = "";
    var svg = S("svg", { viewBox: "0 0 " + w + " " + w, class: "a22-glyph", "aria-hidden": "true", focusable: "false" }, host);
    S("polygon", { class: "ring", points: axes.map(function (a, i) { return P(i, 1); }).join(" ") }, svg);
    S("polygon", { class: "ring", points: axes.map(function (a, i) { return P(i, 0.52); }).join(" "), "stroke-dasharray": "2 2" }, svg);
    S("polygon", { points: axes.map(function (a, i) { return P(i, 0.04 + 0.96 * sc[a.key]); }).join(" "), fill: color, "fill-opacity": 0.22, stroke: color, "stroke-width": 1.6, "stroke-linejoin": "round" }, svg);
  };

  // who decides, who pays, who benefits: LX.Stakeholders (components/stakeholders.js, e-stakeholders; promoted from this
  // file at the W2 integration)

  // ---------------------------------------------------------------- the play
  LX.mount("tradeoff-explorer", function (live, data, root) {
    var TP = LX.townPlan; if (!TP || !TP.ui) throw new Error("the planning engine (components/planengine.js, LX.townPlan) is missing from learn.js");
    css();
    var cfg = data["13_capstone"], A = data.a22_tradeoff_explorer, lim = cfg.limits, TECH = TP.ui.TECH;
    var Y = TP.prepareYear(data.town_year, data.cf_targets, cfg), C = TP.costs(cfg, {}), RW = TP.selectWeeks(Y, cfg.weeks), per = TP.periodsOf(RW);
    var D = { cv: M.capValues(Y, A.reserve.hours), peak: Y.peak, groups: { homes: A.groups.homesM / A.groups.totalHomesM, use: A.groups.kwhB / A.groups.totalKwhB },
              graded: A.graded, batteryHours: A.reserve.batteryHours };
    var SC = A.scales, LIB = A.plans.map(function (p) { return { id: p.id, label: p.label, short: p.short, note: p.note, plan: M.blank(p.plan), m: p.m }; });
    var BY = {}; LIB.forEach(function (p) { BY[p.id] = p; });
    var PRI = A.priorities;
    var S_ = { plan: M.blank(BY[A.start].plan), m: BY[A.start].m, prev: null, cmp: null, cmpLabel: null, cmpM: null, defs: copy(DEFAULTS),
               moves: [], opened: {}, mode: "compare", marks: {}, checked: false, seenPri: {}, priSel: null,
               myW: { cost: 5, co2: 5, rel: 5, fair: 5, sec: 5 }, tried: {}, steel: {}, lim: { inf: null, ok: null }, step1: false, solver: null };
    function copy(o) { var r = {}; for (var k in o) r[k] = o[k]; return r; }
    function samePlan(a, b) { return TP.KEYS.every(function (k) { return Math.abs((a[k] || 0) - (b[k] || 0)) < 1e-9; }); }
    var AXES_UI = M.AXES.map(function (k) { return { key: k, label: LAB[k], name: function () { return DEFN[M.axisKey(k, S_.defs)].name; } }; });
    var cv = D.cv, T = C.techs;

    // the definitions (units, formula in words, what each leaves out); numbers come from the model and data
    var DEFN = {
      cost: { name: "Cost", unit: "$M a year", kind: "Accounts, with a stated boundary",
        text: "What the town pays each year for its plants: building costs spread over their lives at " + cfg.finance.wacc + "% a year, plus upkeep, fuel and running costs.",
        leaves: "Leaves out grid wires, retail costs and harm from pollution." },
      co2: { name: "CO₂", unit: "kt a year (thousand tonnes)", kind: "Physical, operating emissions only",
        text: "Gas burned in the town's plants, times " + T.cc.co2.toFixed(2) + " t of CO₂ per MWh in the combined-cycle plant and " + T.pk.co2.toFixed(2) + " in the peaker.",
        leaves: "Leaves out emissions from building the plants and from producing and piping the gas." },
      unserved: { name: "Unserved energy", unit: "MWh a year", kind: "Model output on one weather year",
        text: "Demand left unserved when the plan runs through all 8,760 hours of 2025, plants and battery run at least cost.",
        leaves: "Leaves out breakdowns and other weather years: plants never fail here, so this is a floor, not an adequacy test." },
      rm: { name: "Reserve margin", unit: "% above the " + Math.round(D.peak) + " MW peak", kind: "A planning convention: one choice among several", choice: true,
        text: "Capacity counted at the peak, above the year's peak demand. Gas and nuclear count at full size, wind at " + F.pct(cv.wind) + " and solar at " + F.pct(cv.solar) +
          " of size (their average in 2025's " + A.reserve.hours + " highest-demand hours), a battery at its MW if it lasts " + A.reserve.batteryHours + " hours.",
        leaves: "Higher is better. It ignores how often each plant fails; grid operators use more detailed methods (lesson 6)." },
      fair: { name: "Low-income share of home bills", unit: "% of what all homes pay", kind: "A constructed measure: one choice among several", choice: true,
        text: "Homes with income under $40,000 are " + F.pct(D.groups.homes, 1) + " of homes and use " + F.pct(D.groups.use, 1) + " of home electricity (U.S., 2020). The tariff, such as a [[fixed-charge|fixed charge]] per home, sets their share of the bills.",
        leaves: "Lower means less of the bill falls on low-income homes; whether that is fairer is a judgement about values." },
      gas: { name: "Gas share", unit: "% of the electricity used", kind: "A constructed measure: one choice among several", choice: true,
        text: "One view of [[energy-security|energy security]]: the share of the electricity used that was made from gas. All gas is piped in from outside the town and none is stored, so a supply cut or price spike reaches every MWh from gas.",
        leaves: "Leaves out weather risks to every plant: in the February 2021 freeze in Texas and nearby states, freezing caused 44.2% of plant outages and gas supply 27.3%." },
      largest: { name: "Largest source", unit: "% of the electricity used", kind: "A constructed measure: one choice among several", choice: true,
        text: "The share of the electricity used that came from the biggest of four sources: wind, sun, nuclear and gas. Lower means more [[supply-diversity|supply diversity]].",
        leaves: "It counts every source as equally risky, which none is." }
    };

    // ---- layout: the radar card, the step cards, the nine plans
    var lay = H("div", { class: "a22-play" }, live);
    var rc = H("section", { class: "a22-card a22-radarcard", "aria-label": "Your plan on five goals" }, lay);
    var panel = H("div", { class: "a22-panel" }, lay);
    var lc = H("section", { class: "a22-card a22-libcard", "aria-label": "Nine plans for Prairie Town" }, lay);

    var rh = H("div", { class: "a22-head" }, rc); var rTitle = H("h3", { text: "Your plan: five goals at once" }, rh);
    var status = LX.SolverStatus(rh);
    H("p", { class: "a22-sub", text: "Each spoke is one goal, from the worst end of its scale (centre) to the best (rim); the dashed ring is halfway. Every plan runs through all 8,760 hours of 2025." }, rc);
    var radar = Radar(rc, { axes: AXES_UI, label: "Radar of five goals" });
    var cmpLine = H("p", { class: "a22-cmp", "aria-live": "polite" }, rc);
    var tilesBox = H("div", { class: "a22-tiles", role: "group", "aria-label": "The five measures: select one for its definition" }, rc);
    var defBox = H("div", { class: "a22-def", hidden: true, "aria-live": "polite" }, rc);
    var tiles = {};
    M.AXES.forEach(function (a) {
      var b = H("button", { type: "button", class: "a22-tile", "aria-pressed": "false" }, tilesBox);
      var l = H("span", { class: "l" }, b), v = H("b", null, b), d = H("small", null, b);
      b.addEventListener("click", function () { openDef(a); });
      tiles[a] = { b: b, l: l, v: v, d: d };
    });
    var defSel = null;
    function openDef(a) {
      defSel = defSel === a ? null : a;
      M.AXES.forEach(function (k) { tiles[k].b.setAttribute("aria-pressed", k === defSel ? "true" : "false"); });
      if (defSel) S_.opened[a] = true;
      paintDef(); if (S_.onOpen) S_.onOpen(a);
    }
    function paintDef() {
      defBox.hidden = !defSel; defBox.innerHTML = ""; if (!defSel) return;
      var k = M.axisKey(defSel, S_.defs), d = DEFN[k];
      H("p", { class: "kind" + (d.choice ? " choice" : ""), text: LAB[defSel] + " · " + d.kind }, defBox);
      H("h4", { text: d.name + " (" + d.unit + ")" }, defBox);
      H("p", { html: LX.rich(d.text) }, defBox);
      if (k === "fair") H("p", { html: "<b>Tariff now:</b> " + LX.esc(TARIFF[S_.defs.fair].label.toLowerCase()) + ": " + LX.esc(TARIFF[S_.defs.fair].text) + "." }, defBox);
      H("p", { class: "a22-sub", text: d.leaves }, defBox);
    }

    var lh = H("div", { class: "a22-head" }, lc); H("h3", { text: "Nine plans for Prairie Town" }, lh);
    var libSub = H("p", { class: "a22-sub", text: "Hand-made, illustrative plans, each run through 2025. Select a plan to compare it with yours on the radar." }, lc);
    var grid = H("div", { class: "a22-plans" }, lc), cards = {};
    LIB.forEach(function (p) {
      var b = H("button", { type: "button", class: "a22-plan", "aria-pressed": "false" }, grid);
      var g = H("span", { class: "g" }, b), n = H("span", { class: "n" }, b); H("b", { text: p.id }, n); H("span", { text: p.short }, n);
      var s = H("span", { class: "s" }, b), bdg = H("span", { class: "bdg", hidden: true }, b);
      b.addEventListener("click", function () { tapPlan(p.id); });
      cards[p.id] = { b: b, g: g, s: s, bdg: bdg };
    });
    var libTv = H("details", { class: "lx-textalt" }, lc); H("summary", { text: "The nine plans in numbers" }, libTv);
    var libTb = H("div", { class: "a22-scroll" }, libTv);
    H("p", { class: "lx-hint", html: LX.rich("Each plan is fixed and run hour by hour through 2025 by lesson 13's [[linear-program|linear program]]; plants never break down. Plans are illustrative, not recommendations.") }, libTv);

    function tapPlan(id) {
      if (S_.mode === "mark") {
        S_.marks[id] = !S_.marks[id]; paintLib(); if (S_.onMark) S_.onMark(); return;
      }
      if (S_.cmp === id) setCmp(null); else setCmp(id, "Plan " + id, BY[id].m);
    }
    function setCmp(id, label, m) { S_.cmp = id; S_.cmpLabel = label; S_.cmpM = m; paintLib(); draw(); }

    // ---- painting
    function scoresOf(m) { return M.scores(m, S_.defs, SC); }
    function values(m) { var o = {}; M.AXES.forEach(function (a) { o[a] = val(m, a, S_.defs); }); return o; }
    function draw() {
      var ser = [{ id: "you", label: "Your plan", s: scoresOf(S_.m), color: "var(--lx-accent)", values: values(S_.m) }];
      if (S_.cmp && S_.cmpM) ser.push({ id: "cmp", label: S_.cmpLabel, s: scoresOf(S_.cmpM), color: "var(--lx-tier-3)", dash: "6 4", values: values(S_.cmpM) });
      else if (S_.prev) ser.push({ id: "prev", label: "Before your last change", s: scoresOf(S_.prev), color: "var(--lx-ink-3)", dash: "2 3", faint: true, values: values(S_.prev) });
      radar.draw(ser);
      M.AXES.forEach(function (a) {
        var t = tiles[a], k = M.axisKey(a, S_.defs), d = DEFN[k];
        t.l.innerHTML = LX.esc(LAB[a]) + (d.choice ? "<em>a choice</em>" : "");
        t.v.textContent = val(S_.m, a, S_.defs);
        var mv = S_.prev ? M.moves(S_.prev, S_.m, S_.defs)[a] : 0;
        t.d.textContent = S_.prev ? delta(S_.prev, S_.m, a, S_.defs) : ""; t.d.className = mv > 0 ? "good" : mv < 0 ? "bad" : "";
        t.b.setAttribute("aria-label", LAB[a] + ": " + d.name + " " + val(S_.m, a, S_.defs) + (t.d.textContent ? ", " + (mv > 0 ? "better" : "worse") + " by " + t.d.textContent.replace("−", "minus ") : "") + ". Show its definition.");
      });
      cmpLine.innerHTML = S_.cmp && S_.cmpM ? "<b>" + LX.esc(S_.cmpLabel) + "</b> (dashed): " + M.AXES.map(function (a) { return LAB[a] + " " + val(S_.cmpM, a, S_.defs); }).join(" · ") : "";
      paintDef();
    }
    function paintLib() {
      var un = S_.checked ? M.unbeaten(LIB, S_.defs) : null, dom = S_.checked ? M.dominated(LIB, S_.defs) : {};
      var badges = {};
      if (S_.priSel) { var pk = M.pick(LIB, priById(S_.priSel).w, S_.defs, SC).id; badges[pk] = priById(S_.priSel).label; }
      if (S_.myPick) badges[S_.myPick] = (badges[S_.myPick] ? badges[S_.myPick] + " · " : "") + "Your weights";
      LIB.forEach(function (p) {
        var c = cards[p.id];
        Radar.glyph(c.g, scoresOf(p.m), AXES_UI, "var(--lx-tier-5)");
        var pressed = S_.mode === "mark" ? !!S_.marks[p.id] : S_.cmp === p.id;
        c.b.setAttribute("aria-pressed", pressed ? "true" : "false");
        c.b.classList.toggle("beaten", !!(un && dom[p.id])); c.b.classList.toggle("unbeaten", !!(un && !dom[p.id]));
        c.s.textContent = un ? (dom[p.id] ? "beaten by " + dom[p.id].join(", ") : "unbeaten") : S_.mode === "mark" ? (S_.marks[p.id] ? "marked unbeaten" : "tap if unbeaten") : F.musd(p.m.cost) + " · " + F.kt(p.m.co2);
        c.bdg.hidden = !badges[p.id]; c.bdg.textContent = badges[p.id] || "";
        c.b.setAttribute("aria-label", "Plan " + p.id + ", " + p.label + ": " + p.note + ". " + M.AXES.map(function (a) { return LAB[a] + " " + val(p.m, a, S_.defs); }).join(", ") + ". " +
          c.s.textContent + (badges[p.id] ? ". Picked by " + badges[p.id] : "") + (S_.mode === "mark" ? ". Select to mark or unmark as unbeaten." : ". Select to compare."));
      });
      // text version of the nine plans
      var h = "<table class='a22-tbl'><thead><tr><th scope='col'>Plan</th>" + M.AXES.map(function (a) { return "<th scope='col'>" + LAB[a] + "<br>" + LX.esc(DEFN[M.axisKey(a, S_.defs)].name) + "</th>"; }).join("") +
        (un ? "<th scope='col'>Verdict</th>" : "") + "</tr></thead><tbody>";
      LIB.forEach(function (p) {
        h += "<tr><td><b>" + p.id + "</b> " + LX.esc(p.label) + "<br><small>" + LX.esc(p.note) + "</small></td>" + M.AXES.map(function (a) { return "<td>" + val(p.m, a, S_.defs) + "</td>"; }).join("") +
          (un ? "<td>" + (dom[p.id] ? "beaten by " + dom[p.id].join(", ") : "unbeaten") + "</td>" : "") + "</tr>";
      });
      libTb.innerHTML = h + "</tbody></table>";
    }
    function priById(id) { return PRI.filter(function (p) { return p.id === id; })[0]; }

    // ---- running your plan through the year: each slider change re-solves the full year after a 260 ms pause; a newer
    // change cancels the wait or the solve already running, and only the newest plan's result is shown and announced
    var said = H("p", { class: "lx-sr", "aria-live": "polite" }, rc);
    var RS = M.resolver({
      delay: 260,
      busy: function (on) { if (S_.busy) S_.busy(on); },
      aborted: function () { try { LX.solver.preload(); } catch (e) { /* the next solve loads it */ } },   // a stopped solve stops the worker: restart it during the wait
      job: function (plan, signal) {
        var lib = LIB.filter(function (p) { return samePlan(p.plan, plan); })[0];
        if (lib) return { m: lib.m, r: null };
        status.set(LX.solver.mode ? "solving" : "loading");
        return LX.solver.solve(TP.fullYearModel(C, Y, { plan: plan }), { key: "a22-plan", label: "a22-plan", timeLimit: 30, signal: signal }).then(function (r) {
          return { r: r, m: r.ok ? M.measure(C, Y, r, plan, D) : null };
        });
      },
      done: function (x) {
        status.set(x.r || "");
        if (!x.m) return;                       // not solved (time limit, error): the status line says why
        var m = x.m;
        if (S_.m && S_.m !== m) { S_.moves.push({ from: S_.m, to: m }); S_.prev = S_.m; }
        S_.m = m; draw(); LX.store.set("a22-you", { cost: m.cost, co2: m.co2, unserved: m.unserved, fair: m.fair.fixed, gas: m.gas });
        said.textContent = "Your plan, run through 2025: " + M.AXES.map(function (a) { return LAB[a] + " " + val(m, a, S_.defs); }).join(", ") + ".";
        if (S_.onRun) S_.onRun(m);
      },
      fail: function () { status.set({ status: "error" }); }
    });
    function setPlan(p, now) { S_.plan = M.blank(p); RS.set(copy(S_.plan), now); }
    function planSliders(host, keys) {
      var out = {};
      [["Clean power", ["wind", "solar", "nuc"]], ["Gas", ["cc", "pk"]], ["Storage", ["bp", "be"]]].forEach(function (g) {
        var ks = g[1].filter(function (k) { return keys.indexOf(k) >= 0; }); if (!ks.length) return;
        var gw = H("div", { class: "a22-grp" }, host); if (keys.length > 1) H("p", { text: g[0] }, gw);
        ks.forEach(function (k) {
          out[k] = LX.Slider(gw, { label: TECH[k].label, color: TECH[k].color, max: lim[k].max, step: lim[k].step, unit: k === "be" ? "MWh" : "MW",
            onChange: function (v) { var p = copy(S_.plan); p[k] = v; setPlan(p); } });
          out[k].set(S_.plan[k]);
        });
      });
      return out;
    }

    // ---- the steps
    function diffList(m0, m1) {
      var mv = M.moves(m0, m1, S_.defs), g = [], b = [], s = [];
      M.AXES.forEach(function (a) {
        var t = LAB[a] + " " + val(m0, a, S_.defs) + " → " + val(m1, a, S_.defs);
        (mv[a] > 0 ? g : mv[a] < 0 ? b : s).push(mv[a] === 0 ? LAB[a] + " " + val(m1, a, S_.defs) : t);
      });
      return (g.length ? "Better: " + g.join(", ") + ". " : "") + (b.length ? "Worse: " + b.join(", ") + ". " : "") + (s.length ? "Same: " + s.join(", ") + "." : "");
    }
    var steps = [
      { text: "Prairie Town starts from plan A, gas only. Predict what adding a wind farm does to the five goals, then add one.",
        build: function (act, api) {
          S_.mode = "compare"; S_.onOpen = null; S_.onMark = null; paintLib();
          var pr = LX.Predict(act, { id: "a22-wind", q: "Add 300 MW of wind to plan A. What happens to the five goals?", answer: "mixed",
            options: [{ value: "mixed", label: "Clean and Secure improve; Cheap and Fair get worse" }, { value: "all", label: "All five improve" },
                      { value: "clean", label: "Only Clean changes" }, { value: "none", label: "Clean improves; the other four stay the same" }],
            feedback: { mixed: "Wind cuts gas burned, but its building costs are fixed costs.", all: "Wind costs more than the gas it saves, and the tariff spreads that cost.",
                        clean: "Burning less gas also cuts the gas share, and the cost moves too.", none: "Cost, the gas share and the bill split all move." },
            onPick: function () { show(); } });
          var box = H("div", null, act), sl = null;
          function show() {
            if (sl) return;
            sl = planSliders(box, ["wind"]);
            H("p", { class: "lx-hint", text: "Raise the wind farm to 300 MW (or any size you like)." }, box);
          }
          if (pr.picked()) show();
          S_.busy = api.busy; if (RS.busy()) api.busy(true);
          S_.onRun = function (m) {
            if (S_.plan.wind > 0 && pr.picked()) {
              S_.step1 = true; pr.reveal(diffList(BY.A.m, m)); api.done();
            }
          };
          if (S_.step1 && pr.picked() && S_.plan.wind > 0) { pr.reveal(diffList(BY.A.m, S_.m)); api.done(); }
        } },
      { text: "Each goal needs a measure, and someone chose it. Select each of the five tiles under the radar to read its unit, its formula and what it leaves out.",
        build: function (act, api) {
          S_.mode = "compare"; S_.onRun = null; S_.busy = null; paintLib();
          var out = H("p", { class: "a22-out", "aria-live": "polite" }, act);
          function upd() {
            var n = M.AXES.filter(function (a) { return S_.opened[a]; }).length;
            out.textContent = "Definitions read: " + n + " of 5.";
            if (n >= 5) {
              api.saw("Cheap, Clean and Reliable come from the model's accounts and physics, each inside a stated boundary. **Fair** and **Secure** are constructions: change the tariff or the risk you count, and they change (step 6).");
              api.done();
            }
          }
          S_.onOpen = upd; upd();
          H("p", { class: "lx-hint", text: "Tiles marked “a choice” are measures someone built; other definitions are just as defensible." }, act);
        } },
      { text: "Now plan freely: move any slider, and watch which goals pull against each other. Make at least three changes.",
        build: function (act, api) {
          S_.mode = "compare"; S_.onOpen = null; S_.busy = api.busy; if (RS.busy()) api.busy(true); paintLib();
          var sl = planSliders(act, TP.KEYS);
          var row = H("div", { class: "a22-row" }, act);
          H("button", { class: "lx-link", type: "button", text: "Back to plan A", onclick: function () { TP.KEYS.forEach(function (k) { sl[k].set(BY.A.plan[k]); }); setPlan(BY.A.plan, true); } }, row);
          var out = H("p", { class: "a22-out", "aria-live": "polite" }, act);
          function upd() {
            if ((S_.n3 || 0) < 3 && !S_.step3) { out.textContent = "Changes so far: " + (S_.n3 || 0) + " of 3."; return; }
            S_.step3 = true; out.textContent = "";
            var c = M.conflicts(S_.moves, S_.defs), pair = c.top ? c.top.split("|") : null;
            api.saw((pair ? "In your " + S_.moves.length + " changes, **" + LAB[pair[0]] + "** and **" + LAB[pair[1]] + "** pulled against each other most often (" + c.pairs[c.top] + (c.pairs[c.top] === 1 ? " time" : " times") + "). " : "") +
              (c.free ? c.free + (c.free === 1 ? " change" : " changes") + " made something better and nothing worse: a free gain." : "No change made something better without making something else worse."));
            api.done();
          }
          S_.onRun = function () { S_.n3 = (S_.n3 || 0) + 1; upd(); }; upd();
        } },
      { text: "A plan is [[dominated-plan|beaten]] when another plan is at least as good on all five goals and better on one. Select every plan that nothing beats, then check.",
        build: function (act, api) {
          S_.mode = "mark"; S_.onRun = null; S_.busy = null; paintLib(); libTv.open = true;
          var row = H("div", { class: "a22-row" }, act);
          var chk = H("button", { class: "lx-btn small", type: "button", html: "Check my picks" + LX.icon("check") }, row);
          var out = H("div", { "aria-live": "polite" }, act), fr = H("div", null, act);
          H("p", { class: "lx-hint", text: "The table under the nine plans now shows all five numbers. Tip: look for two plans that are equal on several goals." }, act);
          function check() {
            S_.checked = true; paintLib();
            var un = M.unbeaten(LIB, S_.defs), right = 0, wrong = [];
            LIB.forEach(function (p) { var u = un.indexOf(p.id) >= 0; if (!!S_.marks[p.id] === u) right++; else wrong.push(p.id); });
            out.innerHTML = "";
            H("p", { class: "a22-out", html: "You sorted <b>" + right + " of 9</b> plans right." + (wrong.length ? " Look again at " + wrong.join(", ") + "." : "") + " Unbeaten: <b>" + un.join(", ") + "</b> (" + un.length + " of 9)." }, out);
            var d2 = M.dominated(LIB, S_.defs, ["cost", "co2"]), rs = M.rescued(LIB, S_.defs, SC);
            fr.innerHTML = "";
            H("p", { class: "lx-eyebrow", text: "Lesson 12's view: cost and CO₂ only" }, fr);
            var fc = LX.Frontier(fr, { label: "The nine plans, cost against CO₂", xMax: 850, yMin: 90, shadeLabel: "out of reach (approximately)" });
            fc.frontier([], null);
            fc.plans(LIB.map(function (p) { return { id: p.id, label: p.short, co2: p.m.co2, cost: p.m.cost, color: "var(--lx-tier-5)", kind: "plan", mark: d2[p.id] ? "dominated" : null,
              note: d2[p.id] ? "beaten on cost and CO₂ by " + d2[p.id].join(", ") : "unbeaten on cost and CO₂" }; }));
            var n2 = Object.keys(d2).length, nar = rs.narrow;
            api.saw("On cost and CO₂ alone, **" + n2 + " of 9** plans are beaten; on all five goals, **" + (9 - un.length) + "**. More goals rescue plans: " +
              rs.list.map(function (r) { return r.id + " (" + r.axes.map(function (a) { return LAB[a]; }).join(", ") + ")"; }).join(", ") + "." +
              (nar ? " Plan " + nar.id + " escapes plan " + nar.by + " by just " + fmtGap(nar) + ": dominance counts any difference, however small." : ""));
            api.done();
          }
          chk.addEventListener("click", check);
          if (S_.checked) check();
        } },
      { text: "The model stops at the unbeaten plans. Choosing one in a [[multi-objective|multi-objective]] problem means weighing the goals. Select each set of priorities and see which plan it picks.",
        build: function (act, api) {
          S_.mode = "compare"; S_.onMark = null; paintLib();
          var bar = H("div", { class: "a22-pri", role: "group", "aria-label": "Sets of priorities" }, act), btn = {};
          PRI.forEach(function (p) { btn[p.id] = H("button", { type: "button", "aria-pressed": "false", text: p.label, onclick: function () { sel(p.id); } }, bar); });
          var who = H("p", { class: "a22-sub" }, act), wl = H("ul", { class: "a22-wbars" }, act), out = H("p", { class: "a22-out", "aria-live": "polite" }, act);
          H("p", { class: "lx-hint", text: A.prioritiesNote }, act);
          var mine = H("div", { class: "a22-grp", hidden: true }, act);
          function bars(w) {
            wl.innerHTML = ""; var tot = 0; M.AXES.forEach(function (a) { tot += w[a]; });
            M.AXES.forEach(function (a) { var li = H("li", null, wl); H("span", { text: LAB[a] }, li); var tr = H("span", null, li); H("i", { style: "width:" + (w[a] / tot * 100).toFixed(0) + "%" }, tr); H("span", { class: "n", text: Math.round(w[a] / tot * 100) + "%" }, li); });
          }
          function sel(id) {
            var p = priById(id), pk = M.pick(LIB, p.w, S_.defs, SC);
            S_.priSel = id; S_.seenPri[id] = true;
            Object.keys(btn).forEach(function (k) { btn[k].setAttribute("aria-pressed", k === id ? "true" : "false"); btn[k].classList.toggle("seen", !!S_.seenPri[k]); });
            who.textContent = p.label + ": " + p.who + ".";
            bars(p.w);
            out.innerHTML = "Picks plan <b>" + pk.id + "</b>, " + LX.esc(BY[pk.id].label) + " (score " + pk.total.toFixed(2) + " of 1).";
            setCmp(pk.id, "Plan " + pk.id + " (" + p.label + ")", BY[pk.id].m);
            if (PRI.every(function (q) { return S_.seenPri[q.id]; })) finish();
          }
          function finish() {
            var picks = {}; PRI.forEach(function (q) { picks[M.pick(LIB, q.w, S_.defs, SC).id] = true; });
            var ids = Object.keys(picks).sort(), un = M.unbeaten(LIB, S_.defs);
            api.saw("Five sets of priorities picked **" + ids.length + "** different plans: " + ids.join(", ") + "." + (ids.every(function (i) { return un.indexOf(i) >= 0; }) ? " Each is unbeaten;" : "") +
              " the weights chose between them, and weights are values, not physics. Try your own below.");
            api.done(); mine.hidden = false;
          }
          H("p", { text: "Your weights" }, mine);
          var myOut = H("p", { class: "a22-out", "aria-live": "polite" }, mine), g2 = H("div", { class: "a22-grid2" }, mine);
          M.AXES.forEach(function (a) {
            var s = LX.Slider(g2, { label: LAB[a], color: "var(--lx-accent)", min: 0, max: 10, step: 1, fmt: function (v) { return String(v); }, onChange: function (v) { S_.myW[a] = v; myPick(); } });
            s.set(S_.myW[a]);
          });
          function myPick() {
            var any = M.AXES.some(function (a) { return S_.myW[a] > 0; });
            if (!any) { myOut.textContent = "Give at least one goal some weight."; S_.myPick = null; paintLib(); return; }
            var pk = M.pick(LIB, S_.myW, S_.defs, SC); S_.myPick = pk.id;
            myOut.innerHTML = "Your weights pick plan <b>" + pk.id + "</b>, " + LX.esc(BY[pk.id].label) + " (score " + pk.total.toFixed(2) + ").";
            paintLib();
          }
          myPick();
          if (S_.priSel) sel(S_.priSel);
        } },
      { text: "Fair, Secure and a reserve margin are constructions: each is one choice among several. Switch a definition and watch the unbeaten plans and the picks change.",
        build: function (act, api) {
          S_.mode = "compare"; paintLib();
          var box = H("div", { class: "a22-defs" }, act), segs = {};
          function seg(key, label, opts) {
            H("p", { class: "lab", text: label }, box);
            var g = H("div", { class: "lx-seg", role: "group", "aria-label": label }, box), bs = {};
            Object.keys(opts).forEach(function (v) { bs[v] = H("button", { type: "button", "aria-pressed": S_.defs[key] === v ? "true" : "false", text: opts[v], onclick: function () { change(key, v); } }, g); });
            segs[key] = bs;
          }
          seg("rel", "Reliable: measured by", REL);
          seg("fair", "Fair: the tariff", { fixed: TARIFF.fixed.short, graded: TARIFF.graded.short, flat: TARIFF.flat.short });
          seg("sec", "Secure: measured by", SEC);
          var out = H("div", { class: "a22-out", "aria-live": "polite" }, act);
          var sm = H("div", null, act);
          function summary(defs) {
            var un = M.unbeaten(LIB, defs);
            return { un: un, picks: PRI.map(function (p) { return { id: p.id, label: p.label, pick: M.pick(LIB, p.w, defs, SC).id }; }) };
          }
          var base = summary(DEFAULTS);
          function paint() {
            Object.keys(segs).forEach(function (k) { Object.keys(segs[k]).forEach(function (v) { segs[k][v].setAttribute("aria-pressed", S_.defs[k] === v ? "true" : "false"); }); });
            var now = summary(S_.defs);
            out.innerHTML = "<p class='a22-out'>Unbeaten: <b>" + now.un.join(", ") + "</b> (" + now.un.length + " of 9)" + (now.un.join() !== base.un.join() ? "; with the first definitions: " + base.un.join(", ") : "") + ".</p>" +
              "<ul class='a22-list'>" + now.picks.map(function (p, i) { var was = base.picks[i].pick; return "<li>" + LX.esc(p.label) + " picks <b>" + p.pick + "</b>" + (was !== p.pick ? " (was " + was + ")" : "") + "</li>"; }).join("") + "</ul>";
            return now;
          }
          function change(key, v) {
            if (S_.defs[key] === v) return;
            S_.defs[key] = v; S_.tried[key] = true; if (S_.priSel) S_.priSel = null;
            if (S_.cmp && BY[S_.cmp]) S_.cmpM = BY[S_.cmp].m;
            draw(); paintLib(); report(paint());
          }
          function report(now) {
            if (Object.keys(S_.tried).length >= 2) {
              var moved = now.picks.filter(function (p, i) { return p.pick !== base.picks[i].pick; });
              api.saw("Same plans, same model, different definitions: " + now.un.length + " of 9 unbeaten (" + base.un.length + " at first)" +
                (moved.length ? ", and " + moved.map(function (p) { return p.label + " now picks " + p.pick; }).join("; ") : ", and the picks did not move") +
                ". A ranking is only as neutral as its measures.");
              api.done();
            }
          }
          LX.Steelman(sm, { eyebrow: "Steelman: should every home pay an equal share of the fixed costs?", heading: "h4", frame: true, reveal: "details", opened: S_.steel,
            sides: [{ key: "for", title: "For a fixed charge per home", text: ["Building costs do not grow with each kWh used, so charging them per home follows what causes them, and keeps the price of one more kWh near its running cost, which helps heat pumps and electric cars.", "**Strongest objection:** homes that use little, often lower-income ones, pay more per kWh."] },
                    { key: "against", title: "For charging per kWh, or by income", text: ["Spreading fixed costs per kWh charges more to homes that use more, which on average are better off; an income-graduated charge protects ability to pay.", "**Strongest objection:** a high price per kWh discourages switching to electric heat and cars, and income checks add cost and shift bills to other homes."] },
                    { key: "both", title: "What both leave open", wide: true, text: ["Who sets the tariff, and how much weight ability to pay should get. The model shows each tariff's split; regulators and elected officials decide, and answer for it."] }],
            onOpen: function (k) { S_.steel[k] = true; } });
          report(paint());
        } },
      { text: "Can you have them all? Set limits on CO₂, the gas share and the low-income share; the solver looks for the cheapest plan that meets every limit.",
        build: function (act, api) {
          S_.mode = "compare"; S_.busy = null; paintLib();
          var L = A.limits, ls = {};
          ls.co2 = LX.Slider(act, { label: "CO₂ at most", color: "var(--lx-ink-2)", min: L.co2.min, max: L.co2.max, step: L.co2.step, unit: "kt" });
          ls.gas = LX.Slider(act, { label: "Gas share at most", color: "var(--lx-cc)", min: L.gas.min, max: L.gas.max, step: L.gas.step, fmt: function (v) { return v + "%"; } });
          ls.fair = LX.Slider(act, { label: "Low-income share at most", color: "var(--lx-tier-2)", min: L.fair.min, max: L.fair.max, step: L.fair.step, fmt: function (v) { return v.toFixed(1) + "%"; } });
          var lv = S_.limVals || { co2: L.co2.start, gas: L.gas.start, fair: L.fair.start };
          ls.co2.set(lv.co2); ls.gas.set(lv.gas); ls.fair.set(lv.fair);
          H("p", { class: "lab a22-sub", text: "Tariff for the low-income share" }, act);
          var tg = H("div", { class: "lx-seg", role: "group", "aria-label": "Tariff for the low-income share" }, act), tb = {};
          Object.keys(TARIFF).forEach(function (v) { tb[v] = H("button", { type: "button", text: TARIFF[v].short, onclick: function () { S_.defs.fair = v; paintT(); draw(); paintLib(); } }, tg); });
          function paintT() { Object.keys(tb).forEach(function (v) { tb[v].setAttribute("aria-pressed", S_.defs.fair === v ? "true" : "false"); }); }
          paintT();
          var row = H("div", { class: "a22-row" }, act);
          var go = H("button", { class: "lx-btn small", type: "button", html: "Find the cheapest plan" + LX.icon("target") }, row);
          var out = H("div", { "aria-live": "polite" }, act), logBox = H("ul", { class: "a22-list a22-sub", "aria-label": "Your attempts" }, act);
          (S_.limLog || []).forEach(function (t) { H("li", { text: t }, logBox); });
          function logLine(t) { S_.limLog = (S_.limLog || []).concat([t]); H("li", { text: t }, logBox); }
          go.addEventListener("click", solveNow);
          function solveNow() {
            var Lm = { co2: ls.co2.val() * 1e3, gas: ls.gas.val() / 100, fair: ls.fair.val() / 100, tariff: S_.defs.fair };
            var lv2 = { co2: ls.co2.val(), gas: ls.gas.val(), fair: ls.fair.val() }; S_.limVals = lv2;
            go.disabled = true; api.busy(true); out.innerHTML = ""; status.set(LX.solver.mode ? "solving" : "loading");
            function free() { go.disabled = false; api.busy(false); }
            function tag() { return lv2.co2 + " kt · " + lv2.gas + "% gas · " + lv2.fair.toFixed(1) + "% share · " + TARIFF[Lm.tariff].short.toLowerCase(); }
            return LX.solver.solve(M.limitModel(TP, C, null, RW, Lm, D), { key: "a22-lim", label: "a22-lim", timeLimit: 30 }).then(function (r) {
              status.set(r);
              if (r.status === "infeasible") {
                free(); S_.lim.inf = { co2: lv2.co2, gas: lv2.gas, fair: lv2.fair, tariff: Lm.tariff };
                logLine(tag() + ": no plan");
                H("p", { class: "a22-out", html: "<b>No plan meets all three limits</b> and serves every modelled hour. Something has to give: loosen a limit, or change the tariff." }, out);
                fin(); return null;
              }
              if (!r.ok) { free(); H("p", { class: "a22-sub", text: LX.solver.describe(r) }, out); return null; }
              var s = TP.summarize(C, per, r, {}), plan = TP.ceilPlan(s.plan, lim);
              logLine(tag() + ": " + F.musd(s.cost) + " a year");
              H("p", { class: "a22-out", html: "Cheapest plan that meets them: <b>" + F.musd(s.cost) + "</b> a year on the seven weeks. It builds " + builds(s.plan) + "." }, out);
              var chk = H("p", { class: "a22-sub", text: "Checking it on all 8,760 hours…" }, out);
              return LX.solver.solve(TP.fullYearModel(C, Y, { plan: plan }), { key: "a22-limchk", label: "a22-limchk", timeLimit: 30 }).then(function (rf) {
                free(); status.set(rf);
                if (!rf.ok) { chk.textContent = LX.solver.describe(rf); return null; }
                var m = M.measure(C, Y, rf, plan, D), over = [];
                if (m.co2 > Lm.co2 + 500) over.push("CO₂ " + F.kt(m.co2));
                if (m.gas > Lm.gas + 0.005) over.push("gas share " + F.pct(m.gas));
                if (m.fair[Lm.tariff] > Lm.fair + 0.0005) over.push("low-income share " + F.pct(m.fair[Lm.tariff], 1));
                chk.textContent = "On all 8,760 hours (sizes rounded up): " + M.AXES.map(function (a) { return LAB[a] + " " + val(m, a, S_.defs); }).join(" · ") + "." +
                  (over.length ? " Over a limit on the full year: " + over.join(", ") + ": seven weeks miss some hours (lesson 13)." : "");
                S_.lim.ok = { co2: lv2.co2, gas: lv2.gas, fair: lv2.fair, tariff: Lm.tariff }; S_.solver = m;
                setCmp("solver", "Solver's plan", m);
                fin(); return m;
              });
            });
          }
          // demo "done": the starting limits under a fixed charge per home, then the same limits with the income-graduated charge
          if (S_.autoLimits) {
            S_.autoLimits = false; ls.co2.set(L.co2.start); ls.gas.set(L.gas.start); ls.fair.set(L.fair.start); S_.defs.fair = "fixed"; paintT();
            solveNow().then(function () { S_.defs.fair = "graded"; paintT(); draw(); paintLib(); return solveNow(); });
          }
          function fin() {
            if (!S_.lim.inf || !S_.lim.ok) return;
            var i = S_.lim.inf, o = S_.lim.ok, tariffFixed = o.tariff !== i.tariff && o.co2 === i.co2 && o.gas === i.gas && o.fair === i.fair;
            api.saw("Under these limits " + (tariffFixed ? "the conflict came from the tariff: with " + TARIFF[S_.lim.ok.tariff].art + ", the same limits can all be met on the seven weeks. Cost against CO₂ is a trade-off of technology and prices; this one was a rule people chose." :
              "you found where these goals stop fitting together: tighten one, and another has to give. That edge is the trade-off, and choosing a point on it is a judgement about values."));
            api.done(); LX.progress.done(LESSON); LX.emit("a22-done");
          }
          function builds(p) {
            var parts = [["wind", "wind"], ["solar", "solar"], ["nuc", "nuclear"]].filter(function (x) { return p[x[0]] > 0.5; }).map(function (x) { return Math.round(p[x[0]]) + " MW " + x[1]; });
            var gas = Math.round(p.cc + p.pk); if (gas > 0) parts.push(gas + " MW gas");
            if (p.bp > 0.5) parts.push("a " + Math.round(p.bp) + " MW / " + Math.round(p.be) + " MWh battery");
            return parts.join(", ");
          }
        } }
    ];
    function fmtGap(n) { return n.key === "fair" ? (n.g * 100).toFixed(1) + " points of the low-income share (" + F.pct(n.v, 1) + " against " + F.pct(n.vs, 1) + ")" : fmtKey(n.key, n.g) + " of " + DEFN[n.key].name.toLowerCase(); }
    var cardsUI = LX.StepCards(panel, { id: "a22-steps", steps: steps });
    draw(); paintLib();

    // demo states (core.js LX.demo): "mid" = step 1 done (300 MW of wind); "step-N" opens step N with the earlier actions done
    LX.demo(root, function (state) {
      var n = state === "mid" ? 1 : state === "done" ? 7 : +((/^step-(\d+)$/.exec(state) || [])[1] || 0); if (!n) return null;
      if (state === "done") S_.autoLimits = true;
      LX.progress.guess("a22-wind", "mixed");
      if (n >= 1) { S_.plan = M.blank(BY.B.plan); S_.prev = BY.A.m; S_.m = BY.B.m; S_.moves = [{ from: BY.A.m, to: BY.B.m }]; S_.step1 = true; }
      if (n >= 2) M.AXES.forEach(function (a) { S_.opened[a] = true; });
      if (n >= 3) { S_.step3 = true; S_.n3 = 3; S_.moves.push({ from: BY.B.m, to: BY.D.m }, { from: BY.D.m, to: BY.C.m }, { from: BY.C.m, to: BY.D.m }); S_.plan = M.blank(BY.D.plan); S_.prev = BY.C.m; S_.m = BY.D.m; }
      if (n >= 4) { M.unbeaten(LIB, S_.defs).forEach(function (id) { S_.marks[id] = true; }); S_.checked = true; }
      if (n >= 5) { PRI.forEach(function (p) { S_.seenPri[p.id] = true; }); S_.priSel = n === 5 ? "climate" : null; }
      if (n === 6) { S_.tried = { fair: true, sec: true }; S_.defs = { rel: "unserved", fair: "graded", sec: "gas" }; }
      if (n >= 7) { S_.tried = { rel: true, fair: true }; S_.defs = copy(DEFAULTS); }
      draw(); paintLib();
      cardsUI.go(Math.max(0, Math.min(steps.length - 1, (state === "mid" ? 1 : n) - 1)));
      return { view: state };
    }, cardsUI);
    buildExplain();
    buildPractice();

    // ---------------------------------------------------------------- practice (Check section): three faded sets
    function buildPractice() {
      var host = document.getElementById("a22-practice"); if (!host || !LX.Practice) return;
      var DF = DEFAULTS;
      function choices(area, opts, label) {
        var row = H("div", { class: "lx-fp-choices a22-row", role: "group", "aria-label": label }, area), cur = { v: null }, bs = {};
        opts.forEach(function (o) {
          bs[o[0]] = H("button", { type: "button", class: "lx-choice", "aria-pressed": "false", text: o[1], onclick: function () { pickV(o[0]); } }, row);
        });
        function pickV(v) { cur.v = v; Object.keys(bs).forEach(function (k) { bs[k].setAttribute("aria-pressed", k === v ? "true" : "false"); }); }
        cur.pick = pickV; return cur;
      }
      function table(area, ids, defs) {
        var h = "<table class='lx-fp-tab a22-tbl'><thead><tr><th scope='col'>Plan</th>" + M.AXES.map(function (a) { return "<th scope='col'>" + LAB[a] + "</th>"; }).join("") + "</tr></thead><tbody>";
        ids.forEach(function (id) { h += "<tr><td><b>" + id + "</b> " + LX.esc(BY[id].short) + "</td>" + M.AXES.map(function (a) { return "<td>" + val(BY[id].m, a, defs) + "</td>"; }).join("") + "</tr>"; });
        H("div", { class: "a22-scroll", html: h + "</tbody></table>" }, area);
      }
      function num(area, label, unit) {
        var id = LX.uid("a22n"), w = H("p", { class: "lx-fp-ans" }, area);
        H("label", { for: id, text: label + " " }, w); var inp = H("input", { id: id, type: "number", step: "any", inputmode: "decimal", style: "width:7em" }, w);
        if (unit) H("span", { text: " " + unit }, w);
        return inp;
      }
      function nv(inp) { var v = parseFloat(String(inp.value).replace(",", ".")); return isNaN(v) ? null : v; }
      var un = M.unbeaten(LIB, DF), dom = M.dominated(LIB, DF), dRM = M.dominated(LIB, { rel: "rm", fair: "fixed", sec: "gas" });
      var sD = M.scores(BY.D.m, DF, SC), eqD = M.AXES.reduce(function (t, a) { return t + Math.round(sD[a] * 100) / 100; }, 0) / 5;
      var phi = 0.6, gA = D.groups.homes * D.graded / (D.groups.homes * D.graded + 1 - D.groups.homes);
      var fFix = M.fairShare(phi, D.groups, "fixed", D.graded), fGr = M.fairShare(phi, D.groups, "graded", D.graded);
      LX.Practice(host, { id: "a22-practice", title: "Practice", lede: "About 20 minutes on your own. The numbers are the nine plans' (default definitions unless an exercise says otherwise).",
        blank: "Choose or enter an answer first.",
        tracks: [
          { label: "Beaten or not", intro: "A plan is beaten when another is at least as good on all five goals and better on one.", items: [
            { key: "b", kind: "worked", minutes: 3, title: "Is plan B beaten?", build: function (area, api) {
              table(area, ["B", "H"], DF);
              H("div", { class: "lx-fp-worked", html: LX.rich("H costs less and emits less than B, so on cost and CO₂ alone H beats B. But H leaves " + val(BY.H.m, "rel", DF) + " unserved, and B none. No plan matches B on all five: B is unbeaten.") }, area);
              var c = choices(area, [["beaten", "Beaten"], ["unbeaten", "Unbeaten"]], "Is plan B beaten?");
              api.check(function () { return c.v == null ? null : { ok: c.v === "unbeaten", why: c.v === "unbeaten" ? "Right: Reliable rescues B from H." : "H is better on two goals, but worse on Reliable, so it does not beat B." }; });
              api.answer(function () { c.pick("unbeaten"); });
            } },
            { key: "c", kind: "partly", minutes: 2, title: "Which plan beats plan C?", build: function (area, api) {
              table(area, ["C", "D", "G"], DF);
              var c = choices(area, [["D", "D"], ["G", "G"], ["none", "None"]], "Which plan beats C?");
              api.hints(["Find a plan that equals C on several goals.", "D is C without its peakers; compare the costs."]);
              api.check(function () { return c.v == null ? null : { ok: c.v === dom.C[0], why: c.v === dom.C[0] ? "Right: D costs " + delta(BY.D.m, BY.C.m, "cost", DF).replace("+", "") + " less and is the same on the other four." : "Not quite: look for a plan that is never worse than C." }; });
              api.answer(function () { c.pick(dom.C[0]); });
            } },
            { key: "rm", kind: "scratch", minutes: 3, title: "Measure Reliable by the reserve margin: is C still beaten?", build: function (area, api) {
              table(area, ["C", "D"], { rel: "rm", fair: "fixed", sec: "gas" });
              var c = choices(area, [["yes", "Yes, still beaten"], ["no", "No, now unbeaten"]], "Is C still beaten?");
              api.hints(["Compare C's and D's reserve margins."]);
              api.check(function () { return c.v == null ? null : { ok: (c.v === "no") === !dRM.C, why: !dRM.C ? "Right: C's peakers count at the peak (" + val(BY.C.m, "rel", { rel: "rm" }) + " against " + val(BY.D.m, "rel", { rel: "rm" }) + "), so C is better on one goal." : "C stays beaten." }; });
              api.answer(function () { c.pick(dRM.C ? "yes" : "no"); });
            } }] },
          { label: "Weights", intro: "Scores run from 0 at the centre of the radar to 1 at the rim.", items: [
            { key: "eq", kind: "partly", minutes: 3, title: "Plan D's total under equal weights", build: function (area, api) {
              H("p", { html: "Plan D's scores: " + M.AXES.map(function (a) { return LAB[a] + " <b>" + sD[a].toFixed(2) + "</b>"; }).join(", ") + "." }, area);
              var inp = num(area, "Total with equal weights (0 to 1):", "");
              api.hints(["Equal weights: the total is the average of the five scores."]);
              api.check(function () { var v = nv(inp); return v == null ? null : { ok: Math.abs(v - eqD) <= 0.01, why: Math.abs(v - eqD) <= 0.01 ? "Right: " + eqD.toFixed(3) + ". D has the highest total of the nine, so Equal weights picks D." : "Add the five scores and divide by 5." }; });
              api.answer(function () { inp.value = eqD.toFixed(3); });
            } },
            { key: "w", kind: "scratch", minutes: 5, title: "Give weights that make the pick plan D, not plan A", build: function (area, api) {
              var g = H("div", { class: "a22-grid2" }, area), inp = {};
              M.AXES.forEach(function (a) { inp[a] = num(g, LAB[a], ""); inp[a].min = 0; });
              var out = H("p", { class: "a22-sub", "aria-live": "polite" }, area);
              api.hints(["Bills first (cost 40, clean 5, reliable 20, fair 30, secure 5) picks A. Which goals does A score worst on?", "Move weight from Cheap and Fair to Clean and Secure."]);
              api.check(function () {
                var w = {}, any = false; M.AXES.forEach(function (a) { var v = nv(inp[a]); w[a] = v == null || v < 0 ? 0 : v; if (w[a] > 0) any = true; });
                if (!any) return null;
                var pk = M.pick(LIB, w, DF, SC); out.textContent = "Your weights pick plan " + pk.id + " (" + BY[pk.id].label + ").";
                return { ok: pk.id === "D", why: pk.id === "D" ? "Right: with these weights D wins. Someone else's weights could still pick A." : "That picks plan " + pk.id + "; shift more weight." };
              });
              api.answer(function () { var ex = { cost: 30, co2: 30, rel: 20, fair: 10, sec: 10 }; M.AXES.forEach(function (a) { inp[a].value = ex[a]; }); });
            } }] },
          { label: "Definitions", intro: "Low-income homes are " + F.pct(D.groups.homes, 1) + " of homes and use " + F.pct(D.groups.use, 1) + " of home electricity.", items: [
            { key: "f", kind: "scratch", minutes: 4, title: "A plan's fixed costs are 60% of its cost: what share of home bills do low-income homes pay?", build: function (area, api) {
              var a = num(area, "With a fixed charge per home:", "%"), b = num(area, "With an income-graduated charge (" + F.pct(gA, 1) + " of the fixed charges):", "%");
              api.hints(["Fixed costs split by homes, running costs by use.", "Fixed charge per home: " + F.pct(D.groups.homes, 1) + " × 0.6 + " + F.pct(D.groups.use, 1) + " × 0.4."]);
              api.check(function () {
                var x = nv(a), y = nv(b); if (x == null || y == null) return null;
                var ok = Math.abs(x - fFix * 100) <= 0.15 && Math.abs(y - fGr * 100) <= 0.15;
                return { ok: ok, why: ok ? "Right: " + F.pct(fFix, 1) + " and " + F.pct(fGr, 1) + ". Same plan, same costs: the tariff moved the share by " + ((fFix - fGr) * 100).toFixed(1) + " points." : "Weight each group's share by the part of the cost it applies to." };
              });
              api.answer(function () { a.value = (fFix * 100).toFixed(1); b.value = (fGr * 100).toFixed(1); });
            } }] }
        ] });
    }

    // ---------------------------------------------------------------- the explain layer
    function buildExplain() {
      var host = document.getElementById("a22-explain"); if (!host) return;
      host.innerHTML = ""; host.classList.add("is-live");
      var un = M.unbeaten(LIB, DEFAULTS), d2 = M.dominated(LIB, DEFAULTS, ["cost", "co2"]);
      var picks = {}; PRI.forEach(function (p) { picks[p.id] = M.pick(LIB, p.w, DEFAULTS, SC).id; });
      var cm = LX.ConceptMap(H("div", { class: "lx-xcard" }, host), {
        title: "From a plan to a choice", lede: "Tap an idea to see what it means and where it appeared in the lesson.",
        groups: { dec: ["Decisions", "var(--lx-tier-3)"], mod: ["Model", "var(--lx-cc)"], mea: ["Measures", "var(--lx-good)"], val: ["Values", "var(--lx-warn)"] },
        cols: 4, rows: 3, colsN: 2, rowsN: 5, sel: "five",
        nodes: [
          { id: "build", g: "dec", label: "What to build", lines: ["What to", "build"], at: [0, 0], atN: [0, 0], text: "Seven numbers: MW of wind, solar, nuclear, gas and battery, and the battery's MWh.", game: "Your sliders, and the nine plans." },
          { id: "run", g: "mod", label: "The year's run", lines: ["The year's", "run"], at: [1, 0], atN: [1, 0], text: "The plan runs hour by hour through all 8,760 hours of 2025 in a linear program.", game: "The solver status above the radar." },
          { id: "five", g: "mea", label: "Five measures", lines: ["Five", "measures"], at: [2, 0], atN: [0, 1], text: "Cost, CO₂, unserved energy, the low-income share of bills and the gas share: one number per goal.", game: "The five tiles and the radar." },
          { id: "defs", g: "val", label: "Definitions", at: [3, 0], atN: [1, 1], text: "Each measure is a choice of unit, boundary and formula; Fair and Secure most of all.", game: "Step 6: three tariffs, two security measures, two reliability measures." },
          { id: "unbeaten", g: "mod", label: "Unbeaten plans", lines: ["Unbeaten", "plans"], at: [2, 1], atN: [0, 2], text: "Plans no other plan matches or beats on all five and beats on one. The model can find them; it cannot choose among them.", game: un.length + " of 9 unbeaten on five goals; " + (9 - Object.keys(d2).length) + " of 9 on cost and CO₂ alone." },
          { id: "weights", g: "val", label: "Weights", at: [1, 1], atN: [1, 2], text: "How much each goal counts in one score. People set them; the model cannot.", game: "Five sets of priorities picked " + Object.keys(PRI.reduce(function (o, p) { o[picks[p.id]] = 1; return o; }, {})).length + " different plans." },
          { id: "limits", g: "val", label: "Limits", at: [3, 1], atN: [0, 3], text: "Caps on some goals; the solver finds the cheapest plan that meets them, or says none exists.", game: "Step 7: the epsilon-constraint method with three limits." },
          { id: "choice", g: "dec", label: "A choice", lines: ["A", "choice"], at: [1, 2], atN: [1, 3], text: "Someone picks a plan and answers for it: who decides, who pays and who benefits (next card).", game: "" }
        ],
        edges: [["build", "run", "runs in"], ["run", "five", "gives"], ["defs", "five", "shape"], ["five", "unbeaten", "filter"], ["unbeaten", "weights", "still many: need"],
                ["weights", "choice", "pick"], ["limits", "choice", "or cap"]],
        moment: function (id) {
          var y = LX.store.get("a22-you", null);
          if (id === "five" && y) return "Your last plan: " + F.musd(y.cost) + ", " + F.kt(y.co2) + ", " + F.mwh(y.unserved) + " unserved, " + F.pct(y.fair, 1) + " low-income share, " + F.pct(y.gas) + " gas.";
          return null;
        }
      });
      LX.on("a22-done", function () { cm.select && cm.select("choice"); });
      var st = LX.Stakeholders(H("div", { class: "lx-xcard" }, host), {
        title: "Who decides, who pays, who benefits",
        lede: "Prairie Town's roles (illustrative). The priority sets of step 5 speak for some of them.",
        cols: [{ key: "dec", label: "Decides" }, { key: "pay", label: "Pays" }, { key: "ben", label: "Benefits" }, { key: "w", label: "Weighs most" }],
        rows: [
          { key: "homes", name: "Households", note: "including low-income homes", cells: { dec: { v: "part", t: "comment at hearings and vote" }, pay: { v: "yes", t: "through bills, by the tariff" }, ben: { v: "yes", t: "power, cleaner air" }, w: { t: "Cheap, Fair, Reliable; " + "Bills first picks plan " + picks.bills } } },
          { key: "biz", name: "Businesses", cells: { dec: { v: "part", t: "comment at hearings" }, pay: { v: "yes", t: "through bills" }, ben: { v: "yes", t: "power to run" }, w: { t: "Cheap, Reliable" } } },
          { key: "util", name: "The utility", note: "proposes the plan", cells: { dec: { v: "part", t: "proposes plans and tariffs" }, pay: { v: "part", t: "builds first, recovers costs through bills" }, ben: { v: "yes", t: "a return on what it builds, if allowed" }, w: { t: "Cheap, Reliable" } } },
          { key: "reg", name: "Regulator or council", note: "approves plan and tariff", cells: { dec: { v: "yes", t: "approves, rejects or changes them" }, pay: { v: "no" }, ben: { v: "no", t: "answers to the public" }, w: { t: "All five, by law and by politics" } } },
          { key: "grid", name: "Grid operator", cells: { dec: { v: "part", t: "sets reliability rules" }, pay: { v: "no" }, ben: { v: "no", t: "keeps the system balanced" }, w: { t: "Reliable; Lights first picks plan " + picks.lights } } },
          { key: "trade", name: "Fuel suppliers, builders and plant workers", cells: { dec: { v: "no" }, pay: { v: "no" }, ben: { v: "yes", t: "sales and jobs, which differ by plan" }, w: { t: "Jobs and sales: none of the five" } } },
          { key: "future", name: "People downwind and in the future", cells: { dec: { v: "no", t: "no vote in this choice" }, pay: { v: "yes", t: "climate and air harm, outside the cost" }, ben: { v: "part", t: "from lower CO₂" }, w: { t: "Clean; Climate first picks plan " + picks.climate } } }
        ],
        note: "Illustrative roles for a fictional town; who decides differs between places, and some of these groups have no seat at the table."
      });
      var cc = H("div", { class: "lx-xcard" }, host);
      var ch = H("header", { class: "lx-x-head" }, cc); H("h3", { text: "Connections: where each goal is taught" }, ch);
      var ul = H("ul", { class: "a22-conn" }, cc);
      [["Cheap", "Cost a year", "<a href='07-cost.html'>Lesson 7</a> (cost) and <a href='13-capstone.html'>lesson 13</a> (the plan)"],
       ["Clean", "CO₂", "<a href='12-trade-offs.html'>Lesson 12</a> (cost against CO₂); A10, emissions accounting (upcoming)"],
       ["Reliable", "Unserved energy, reserve margin", "<a href='03-balancing.html'>Lesson 3</a> and <a href='06-three-jobs.html'>lesson 6</a>; A5, adequacy (upcoming)"],
       ["Fair", "Who pays", "A4, tariffs, and A13, energy burden (upcoming)"],
       ["Secure", "Fuel and supply risk", "<a href='f02-systems-and-map.html'>F2</a>, the whole-system map, and A21, resilience (upcoming)"]].forEach(function (r) {
        var li = H("li", null, ul); H("b", { text: r[0] }, li); H("span", { class: "a22-sub", text: r[1] }, li); H("span", { html: r[2] }, li);
      });
    }
  });
})();
