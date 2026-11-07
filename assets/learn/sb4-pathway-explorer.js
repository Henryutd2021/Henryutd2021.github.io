// sb4-pathway-explorer.js — SB4, "Pathway Explorer" (sandbox, wave W6, 2026-11-07), on engine E4 (assets/learn/components/
// engine-e4.js, LX.E4, in the bundle; data assets/learn/data/prairieland.json, e4-pathways.json and the precomputed library
// e4-library.json).
//
// The page: the brief (static), the bench (demand and electrification, the limits you set, what the model may do, a shock,
// costs and fuels; Run the pathway; readouts; the plan link), the results (what the run says, the map of the five regions,
// the mix by model year, CO2 and imports, the LP's marginal values, Ridge County, the shock against the plan, the
// full-year check from the library), then how the engine works (LX.Boundary) and the sources. A plan that is in the
// library (the presets, perfect foresight or decade by decade) is drawn from it at once, labelled "precomputed with this
// engine on <date>"; "Solve it live" runs it in the browser. Every number the page states comes from E4 or the library and
// is checked by _tests/learn/test_sb4-pathway-explorer.js (with the engine's test_e4-engine.js).
// Prairieland is fictional; its numbers are illustrative.
(function () {
  "use strict";
  // ---------------------------------------------------------------- pure words (Node: the test reads them)
  function kilo(v) { var r = Math.round(v); return (r < 0 ? "−" : "") + Math.abs(r).toLocaleString("en-US"); }
  function fix(v, d) { var s = Math.abs(v).toFixed(d == null ? 1 : d); return (v < 0 && +s !== 0 ? "−" : "") + s.replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
  function pct(v, d) { return fix(v * 100, d == null ? 0 : d) + "%"; }
  function bn(v) { return (v < 0 ? "−$" : "$") + fix(Math.abs(v) / 1000, 1) + " billion"; }
  // the library entry of a plan (the engine's fields, the shock set to none), or null
  function libKey(SS, S, st) { var s = JSON.parse(JSON.stringify(st)); s.sh = "none"; return SS.encode(S, s); }
  function libEntry(LIB, SS, S, st) {
    if (!LIB) return null;
    var k = libKey(SS, S, st);
    for (var i = 0; i < LIB.plans.length; i++) if (LIB.plans[i].key === k) return LIB.plans[i];
    return null;
  }
  // what a run says, one idea a line (V: E4.view; X: the shock's view or null); never more than the run shows
  function says(V, X, P) {
    var out = [], Y = V.Y, last = Y.length - 1;
    if (V.over > 0.5) out.push({ kind: "bad", text: "**The budget is out of reach: " + kilo(V.cum) + " Mt against " + kilo(V.budget) + " Mt.** No pathway within these levers meets it; this one comes closest (CO₂ above the budget costs $1,000 a tonne in the model, more than any cut it can make)." });
    else if (V.carbonValue.length > 1) {   // decade by decade: each window had its share of the budget left
      var wb = V.carbonValue.map(function (x, i) { return x > 0.05 ? i : -1; }).filter(function (i) { return i >= 0; }), WN = ["first", "second", "third"];
      out.push({ kind: "good", text: "**CO₂ 2026–2050: " + kilo(V.cum) + " Mt" + (V.cum < V.budget - 0.5 ? ", " + kilo(V.budget - V.cum) + " Mt below the budget." : ", at the budget.") + "** Decade by decade, each window had its share of what was left; " +
        (wb.length ? (wb.indexOf(0) >= 0 ? "the first window's share binds" : "the " + WN[wb[0]] + " window's share binds") + " ($" + fix(V.carbonValue[wb[0]], 0) + " a tonne, present value)" : "no window's share binds") + "." });
    }
    else out.push({ kind: "good", text: "**CO₂ 2026–2050: " + kilo(V.cum) + " Mt, within the " + kilo(V.budget) + " Mt budget.** " + (V.carbonValue[0] > 0.05 ? "The budget binds: one more tonne allowed would save about $" + fix(V.carbonValue[0], 0) + " (present value in 2025; the LP's dual)." : "The budget does not bind: the cheapest pathway stays below it anyway.") });
    var mi = Math.max.apply(null, V.imp), yi = Y[V.imp.indexOf(mi)];
    if (sum(V.capOver) > 0.5) out.push({ kind: "bad", text: "**Imports above the cap:** " + pct(mi) + " of primary energy in " + yi + " against " + pct(V.cap) + ". Oil for vehicles and farms is fixed by your electrification, and the model cannot cut it further." });
    else out.push({ kind: "", text: "**Imports at most " + pct(mi) + " of primary energy (" + yi + "),** within the " + pct(V.cap) + " cap; 2025: " + pct(P.imports.dependence.share) + "." });
    var g = V.built, gw = function (t) { return sum(g[t]); };
    out.push({ kind: "", text: "**Built 2026–2050:** wind " + fix(gw("wind"), 1) + " GW, solar " + fix(gw("solar"), 1) + " GW, gas " + fix(gw("gasCC") + gw("gasCT"), 1) + " GW, batteries " + fix(gw("battery"), 1) + " GW, the generic firm clean option " + fix(gw("firm"), 1) + " GW; new links " + fix(sum(V.txAdd), 1) + " GW." });
    out.push({ kind: "", text: "**Electricity in 2050: " + pct(V.clean[last]) + " from sources with no CO₂ in operation,** from " + fix(V.elTWh[0], 0) + " TWh used in 2030 to " + fix(V.elTWh[last], 0) + " TWh in 2050." });
    var rs = V.ridge.closeP;
    out.push({ kind: rs === null ? "" : "warn", text: rs === null ? "**Ridge Station stays open to 2050.**" : rs === 2 && V.ridge.station[1] > 0 ? "**Ridge Station closes on its schedule** (end of 2037): coal mined falls from 700 PJ in 2025 to " + kilo(V.ridge.coal[last]) + " PJ in 2050." : "**Ridge Station closes early,** in the model year " + Y[rs] + ": coal mined falls from 700 PJ in 2025 to " + kilo(V.ridge.coal[last]) + " PJ in 2050." });
    var un = sum(V.unserved), sh = sum(V.reserve.map(function (x) { return x.shortMW; }));
    if (un > 0.005) out.push({ kind: "bad", text: "**Electricity not served in the slices: " + fix(un, 2) + " TWh** over the model years." });
    if (sh > 0.5) out.push({ kind: "warn", text: "**Short at a stress hour by " + kilo(sh) + " MW** in total: the plan cannot meet the peak-hour rule." });
    if (X) {
      out.push({ kind: X.over > 0.5 || sum(X.unserved) > 0.005 ? "bad" : "warn", text: "**" + X.label + " in " + X.year + ":** the pathway re-planned after it costs " + (X.dPV >= 0 ? "$" + fix(X.dPV / 1000, 1) + " billion more" : "$" + fix(-X.dPV / 1000, 1) + " billion less") +
        " (present value); CO₂ 2026–2050 " + kilo(X.cum) + " Mt" + (X.over > 0.5 ? ", " + kilo(X.over) + " Mt over the budget" : "") + "; imports in " + X.year + " " + pct(X.imp[Y.indexOf(X.year)]) + (sum(X.reserveShort) > 0.5 ? "; short at a stress hour by " + kilo(sum(X.reserveShort)) + " MW" : "") + "." });
    }
    return out;
  }
  function sum(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i] || 0; return s; }
  // the full-year check's table rows (library), with the rule for "survives"
  function fullRows(F) {
    return F.map(function (c) {
      var ok = c.unservedMWh < 0.5 && Math.abs(c.gap) <= 0.1;
      return [c.year + ", " + c.weather + " weather", kilo(c.unservedHours) + " h, " + fix(c.unservedMWh / 1e6, 2) + " TWh", fix(c.co2, 1) + " Mt (slices " + fix(c.co2Slices, 1) + "; " + (c.gap >= 0 ? "+" : "") + pct(c.gap, 1) + ")",
        fix(c.curtailTWh, 1) + " TWh (slices " + fix(c.curtailSlices, 1) + ")", ok ? "survives" : "does not survive"];
    });
  }
  var page = { libKey: libKey, libEntry: libEntry, says: says, fullRows: fullRows, kilo: kilo, fix: fix, pct: pct, bn: bn,
    GROUPS: [{ title: "Demand and electrification", fields: ["dem", "eb", "et", "ei"], color: "var(--lx-demand)", hint: "Electricity's share of each sector's [[useful-energy|useful energy]] in 2050; it rises in a straight line from 2025's. The engine does not choose it: end-use equipment costs are left out." },
      { title: "The limits you set", fields: ["bud", "acc", "cap", "rm"], color: "var(--lx-bad)", hint: "A [[carbon-budget|cumulative carbon budget]] for 2026–2050, an import cap in every model year, and a rule for the peak hours." },
      { title: "What the model may do", fields: ["fs", "fm", "tx", "rt"], color: "var(--lx-accent)", hint: "[[perfect-foresight|Perfect foresight]] plans 2030–2050 at once; decade by decade sees only two model years at a time." },
      { title: "A shock", fields: ["sh"], color: "var(--lx-warn)", hint: "The plan's builds up to the shock's model year stay; that year runs what was built; later years re-plan." },
      { title: "Costs you set (2025 dollars)", fold: "Costs and fuel prices you set (open to change them)", fields: ["cw", "cs", "cb", "cc", "ct", "cf", "cx"], color: "var(--lx-ink-2)", hint: "Each a fixed range from prairieland.json, the same in every period: no cost changes with how much is built." },
      { title: "Fuels and money", fold: "Fuel prices and the discount rate (open to change them)", fields: ["pg", "pl", "pc", "po", "dr"], color: "var(--lx-ink-2)", hint: "Fuel prices per GJ on net calorific values, constant over the periods unless a shock changes them; the [[discount-rate|discount rate]] is real." }] };
  if (typeof module !== "undefined" && module.exports) module.exports = page;
  if (typeof window === "undefined" || !window.LX || !window.LX.E4) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H, E4 = LX.E4, U = E4.ui;
  LX.mount("sb4", function (live, data, root) {
    var P = E4.prepare(data.prairieland, data.e4_pathways), S = E4.schema(P), LIB = data.e4_library || null, stub = null, forceLive = false;
    var rh = document.getElementById("sb4-results"), fb = rh.querySelector(".lx-fallback"); if (fb) fb.hidden = true;
    H("p", { class: "lx-hint e4-line", text: P.line }, live);
    var wrap = H("div", { class: "lx-sb e4-sb" }, live);
    var ctr = H("div", { class: "lx-sb-controls" }, wrap), side = H("div", { class: "lx-sb-side" }, wrap);
    var plan;
    var ss = LX.ShareState(side, { schema: S, id: "sb4-link", onLoad: function (s) { plan = s; C.set(plan); run.changed(plan); } });
    plan = ss.state;
    var sig = P.sigma0, B = P.PL.carbon.budget;
    var hints = {
      eb: function () { return "2025: " + pct(sig.buildings) + "; at most " + P.elRange.buildings.hi + "% by 2050."; },
      et: function () { return "2025: " + pct(sig.transport) + "; at most " + P.elRange.transport.hi + "% by 2050."; },
      ei: function () { return "2025: " + pct(sig.industry) + "; at most " + P.elRange.industry.hi + "% by 2050."; },
      bud: function () { return B.presets.map(function (x) { return x.label + ": " + kilo(x.mt) + " Mt"; }).join(" · ") + " (arithmetic on 2025, not a fair share)."; },
      cap: function () { return "2025: " + pct(P.imports.dependence.share) + " of primary energy was imported."; }
    };
    var C = U.controls(ctr, S, plan, page.GROUPS, change, hints);
    var pre = H("div", { class: "lx-sb-presets", role: "group", "aria-label": "Start from a preset (only the choices it names change)" }, side);
    E4.presetsOf(P).forEach(function (pr) {
      H("button", { class: "lx-btn ghost small", type: "button", text: pr.label, onclick: function () { change(E4.withPreset(plan, pr)); run.run(plan); } }, pre);
    });
    var stale = H("p", null, rh), src = H("p", { class: "e4-src", "aria-live": "polite" }), res = H("div", { class: "lx-sb-results sb4-res" }, rh), ro = H("div", { class: "lx-readouts e4-ro" }), stopB = U.stopper();
    function solver() {
      if (!stub) return null;
      var kind = stub; stub = null;
      return function () { return Promise.resolve({ status: kind === "tl" ? "time-limit" : "error", ok: false, message: "solver stopped (demo)" }); };
    }
    var run = LX.BenchRun(side, { label: "Run the pathway", state: function () { return plan; }, results: [res, ro], stale: stale,
      busy: function (on) { stopB.busy(on); },
      solve: function (st, ctx) {
        var e = !forceLive && !stub ? page.libEntry(LIB, LX.ShareState, S, st) : null; forceLive = false;
        if (e) return Promise.resolve({ status: "optimal", ok: true, kind: "lp", results: { V: e.view, X: st.sh !== "none" ? e.shocks[st.sh] : null, full: e.full, lib: true } });
        return E4.solve(st, P, { signal: ctx.signal, attempt: ctx.attempt, solver: solver() }).then(function (r) {
          if (r.ok) { var V = E4.view(r.results.plan, P); r.results = { V: V, X: r.results.shock ? E4.shockView(r.results.shock, V, P) : null, lib: false, ms: r.ms }; }
          return r;
        });
      },
      render: function (R) { draw(R); },
      words: { ok: "Done: the cheapest pathway for this plan over 2030–2050 (the solver reports optimal)." } });
    stopB.attach(run);
    side.appendChild(ro);
    side.insertBefore(ss.status, pre);
    var liveB = H("button", { class: "lx-btn ghost small", type: "button", text: "Solve it live", hidden: true, onclick: function () { forceLive = true; run.run(plan); } });
    side.appendChild(src); side.appendChild(liveB);
    side.appendChild(ss.el);
    function change(p) { plan = p; C.set(plan); ss.set(plan); run.changed(plan); }

    // ---- the results
    var map = null;
    function draw(R) {
      var V = R.V, X = R.X;
      src.textContent = R.lib ? "From the library: precomputed with this engine on " + LIB.date + " (the same LP; " + LIB.timeLimit + " s a solve)." : "Solved in your browser just now (HiGHS, a linear program).";
      src.className = "e4-src" + (R.lib ? " lib" : ""); liveB.hidden = !R.lib;
      ro.innerHTML = "";
      U.readouts(V).forEach(function (x) { var d = H("div", { class: "lx-readout " + x[2] }, ro); H("span", { text: x[0] }, d); H("b", { text: x[1] }, d); });
      res.innerHTML = "";
      H("p", { class: "lx-hint e4-line", text: P.line }, res);
      var sayBox = H("div", { class: "e4-says" }, res);
      page.says(V, X, P).forEach(function (s) { H("p", { class: "e4-say " + s.kind, html: LX.rich(s.text).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>") }, sayBox); });
      var c1 = H("div", { class: "lx-xcard lx-sb-chart" }, res); H("h3", { text: "The nation, model year by model year" }, c1);
      map = U.Map(c1, P); map.set(V);
      U.keys(c1, [["Each disc", "the region's electricity in that year by source; below it, the LP's [[marginal-cost|marginal cost]] of one more MWh there, averaged over the slices by load."],
        ["Each link", "its transfer limit, existing plus what the plan adds; amber when it is full for more than 2,000 hours of the slices."],
        ["Ties", "where two regions or routes cost the same, the map shows the one the [[tie-rule|tie rule]] picks; national totals do not depend on it."]]);
      var c2 = H("div", { class: "lx-xcard lx-sb-chart" }, res); H("h3", { text: "What is open and what runs" }, c2);
      U.MixChart(c2, P).set(V);
      U.keys(c2, [["Vintages", "a plant counts in a model year only while its life covers it; existing plants leave on their retirement years unless the plan retires coal, gas or oil early."],
        ["Residual value", "a plant built late pays only for the years it runs up to 2050; the rest of its life is not charged."]]);
      var c3 = H("div", { class: "lx-sb-charts two" }, res);
      var c3a = H("div", { class: "lx-xcard lx-sb-chart" }, c3); H("h3", { text: "CO₂ a year" }, c3a);
      U.Co2Chart(c3a, P).set(V, X, X ? "After the shock" : null);
      U.keys(c3a, [["The budget", "counts " + (V.w0 ? "2025 twice and each model year for the years around it (straight lines between)" : "each model year for the five years ending in it") + ": weights " + V.w0 + ", " + V.w.join(", ") + "."]]);
      var c3b = H("div", { class: "lx-xcard lx-sb-chart" }, c3); H("h3", { text: "Imports against the cap" }, c3b);
      U.ImportChart(c3b, P).set(V, X, X ? "After the shock" : null);
      U.keys(c3b, [["Imports", "crude oil (all through the strait) and LNG, as a share of [[primary-energy|primary energy]] (physical energy content)."]]);
      var c4 = H("div", { class: "lx-xcard lx-sb-chart" }, res); H("h3", { text: "Marginal values from the LP" }, c4);
      U.table(c4, ["Model year", "Marginal cost of electricity, $/MWh: " + P.R.map(function (r) { return r.short; }).join(" · "), "Import cap, $ per GJ", "Stress hour spare"], V.Y.map(function (y, p) {
        return [String(y), V.price[p].map(function (x) { return x == null ? "–" : Math.round(x); }).join(" · "), V.importValue[p] > 0.005 ? "$" + fix(V.importValue[p], 2) : "not binding", V.reserve[p].margin == null ? "–" : pct(V.reserve[p].margin, 1) + " (" + (V.reserve[p].key === "peak" ? "summer peak" : "winter week") + ")"];
      }), "sb4-val");
      U.keys(c4, [["Their assumptions", "this plan's capacities, prices and the twelve slices: marginal values, not market prices."],
        ["The budget's value", V.carbonValue.length > 1 ? "decade by decade, each window has its own: $" + V.carbonValue.map(function (x) { return fix(x, 0); }).join(", $") + " a tonne (present value in 2025)." : "$" + fix(V.carbonValue[0], 0) + " a tonne in 2025's present value; as a carbon price in year t it is that × (1 + rate)^(t − 2025), rising at the [[discount-rate|discount rate]]."]]);
      var c5 = H("div", { class: "lx-xcard lx-sb-chart" }, res); H("h3", { text: "Cost, by part (present value in 2025)" }, c5);
      var pv = V.pv;
      U.table(c5, ["Part", "Present value", "In 2050, a year"], [["New plants: yearly payments and fixed O&M", bn(pv.capital), bn(V.yearly[4].capital)], ["New links", bn(pv.transmission), bn(V.yearly[4].transmission)],
        ["Fixed O&M of fossil plants kept open", bn(pv.fom), bn(V.yearly[4].fom)], ["Variable O&M", bn(pv.vom), bn(V.yearly[4].vom)], ["Fuels bought by the whole nation", bn(pv.fuel), bn(V.yearly[4].fuel)],
        { cls: "e4-tot", cells: ["Total", bn(pv.total), bn(V.yearly[4].total)] }], "sb4-cost");
      U.keys(c5, [["The boundary", "the energy system's supply side and every fuel bought, 2026–2050 in 2025 dollars; existing plants' capital is sunk; end-use equipment (heat pumps, cars) is left out."]]);
      if (X) {
        var c6 = H("div", { class: "lx-xcard lx-sb-chart" }, res); H("h3", { text: X.label + " in " + X.year + ": the plan against the re-plan" }, c6);
        var yi = V.Y.indexOf(X.year);
        U.table(c6, ["", "The plan", "After the shock"], [["Cost to 2050 (present value)", bn(V.pv.total), bn(X.pv)], ["CO₂ 2026–2050", kilo(V.cum) + " Mt", kilo(X.cum) + " Mt"],
          ["CO₂ in " + X.year, fix(V.co2[yi], 1) + " Mt", fix(X.co2[yi], 1) + " Mt"], ["Imports in " + X.year, pct(V.imp[yi], 1), pct(X.imp[yi], 1)],
          ["Short at a stress hour in " + X.year, kilo(V.reserve[yi].shortMW) + " MW", kilo(X.reserveShort[yi]) + " MW"], ["Electricity not served in " + X.year, fix(V.unserved[yi], 2) + " TWh", fix(X.unserved[yi], 2) + " TWh"]], "sb4-shock");
        U.keys(c6, [["The rule", "builds and retirements up to " + X.year + " stay as planned (they were decided before); " + X.year + " runs what was built; later years re-plan knowing the shock."]]);
      }
      var c7 = H("div", { class: "lx-xcard lx-sb-chart" }, res); H("h3", { text: "Slices against full years of hours" }, c7);
      if (R.full) {
        U.table(c7, ["Check", "Not served", "CO₂ of the year", "Wind and solar spilled", "Verdict"], page.fullRows(R.full), "sb4-full");
        U.keys(c7, [["The check", "this plan's capacities in 2030 and 2050, run hour by hour over 2025's weather and over 2024's (an independent year), week by week."],
          ["Survives", "all demand served and CO₂ within 10% of the slice estimate (prairieland.json's rule)."], ["From the library", "precomputed with this engine on " + LIB.date + ": about a minute of solving, too slow to run on a click."]]);
      } else H("p", { class: "lx-hint", html: LX.rich("The full-year check (8,760 hours, two weather years) takes about a minute, so it is precomputed for the presets only; pick one to see it. [[lesson:m13-national-pathway|M13]] explains it.") }, c7);
    }

    // ---- how the engine works
    var x = document.getElementById("sb4-explain"); x.innerHTML = "";
    LX.FormulateBox(H("div", { class: "lx-xcard" }, x), { title: "The engine in four parts", parts: [
      { k: "Decisions", color: "var(--lx-tier-2)", text: "What to build in each region and model year, what to retire early, which links to widen, how every plant runs in every slice, which fuels to buy." },
      { k: "Goal", color: "var(--lx-good)", text: "The least present value of cost 2026–2050; a plant pays only for the years it runs up to 2050." },
      { k: "Rules", color: "var(--lx-warn)", text: "Each region-slice balances; plants, links and stores within their limits; CO₂ summed with its weights within the budget; imports within the cap; the stress hours met." },
      { k: "Given", color: "var(--lx-ink-3)", text: "Your electrification, demand, costs and fuel prices; 2025's fleet with its retirement years; twelve slices of 2025's weather." }] });
    LX.Flowchart(H("div", { class: "lx-xcard" }, x), { title: "One click, step by step", lede: "What a run does, in order.",
      nodes: { plan: { t: "Your plan", s: "levers and costs" }, lp: { t: "The pathway LP", s: "2030–2050, 12 slices" }, fs: { t: "Foresight?", k: "q" },
        one: { t: "One LP", s: "all five model years" }, win: { t: "Three LPs", s: "2030–35, 2040–45, 2050" }, sh: { t: "A shock?", k: "q" },
        re: { t: "Re-plan", s: "from the shock's year" }, out: { t: "Results", s: "cost, CO₂, imports", k: "end" } },
      at: { plan: [1, 0], lp: [1, 1], fs: [1, 2], one: [0, 3], win: [2, 3], sh: [1, 4], re: [2, 5], out: [1, 6] }, cols: 3, colsN: 3,
      edges: [["plan", "lp"], ["lp", "fs"], ["fs", "one", "perfect"], ["fs", "win", "decade by decade"], ["one", "sh"], ["win", "sh"], ["sh", "re", "yes"], ["sh", "out", "no"], ["re", "out"]],
      traces: [{ label: "Perfect foresight, no shock", path: ["plan", "lp", "fs", "one", "sh", "out"], text: "One LP sees 2030–2050 at once and returns the cheapest pathway within your budget and cap." },
        { label: "Decade by decade, a shock", path: ["plan", "lp", "fs", "win", "sh", "re", "out"], text: "Three LPs in turn, each seeing two model years and its share of the budget left; then the shock's year runs what was built and later years re-plan." }] });
    LX.Boundary(H("div", { class: "lx-xcard" }, x), { title: "Where the engine's answer holds",
      holds: ["twelve time slices of 2025's weather stand for each model year, with the peak net-load day and the scarce-wind week kept whole", "flows between regions obey their transfer limits only (a transport model)",
        "costs are fixed ranges you set, the same in every period, whatever is built", "electrification and demand follow the plan, not the model", "the peak-hour rule stands in for adequacy, which is never judged from slices (A5)"],
      leaves: ["power-flow physics, outages and reserves within the hour", "end-use equipment costs, so the model never chooses electrification", "how fast industries, factories and workers can change", "fuels other than electricity for the oil that remains (aviation, shipping, farms)", "who decides, and prices in markets: marginal values are not market prices"],
      source: "Prairieland is fictional; its numbers are illustrative. Costs: EIA AEO2026 assumptions (2025 dollars); hourly shapes: SPP 2025 and 2024." });

    // ---- the first view: the default plan from the library (no solver download), else a live run once in view
    var started = false;
    function start() { if (started) return; started = true; run.run(plan); }
    if (typeof IntersectionObserver !== "undefined") {
      var io = new IntersectionObserver(function (es) { if (es.some(function (e) { return e.isIntersecting; })) { io.disconnect(); start(); } }, { rootMargin: "200px" });
      io.observe(root); io.observe(rh);
    } else start();

    // ---- demo states (screenshots): mid (security first), live (the default solved live), shock, fail, tl
    LX.demo(root, function (s) {
      started = true;
      if (s === "mid" || s === "done") { change(E4.withPreset(plan, E4.presetsOf(P)[2])); run.run(plan); return { view: "mid" }; }
      if (s === "live") { forceLive = true; run.run(plan); return { view: "mid" }; }
      if (s === "shock") { change(Object.assign({}, plan, { sh: "demandSurprise" })); run.run(plan); return { view: "mid" }; }
      if (s === "fail") { stub = "fail"; run.run(plan); return { view: "fail" }; }
      if (s === "tl") { stub = "tl"; run.run(plan); return { view: "tl" }; }
      return null;
    });
  });
})();
