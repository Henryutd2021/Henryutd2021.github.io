// sb4-pathway-explorer.js — SB4, "Pathway Explorer" (sandbox), on engine E4 (assets/learn/components/
// engine-e4.js, LX.E4, in the bundle; data assets/learn/data/prairieland.json, e4-pathways.json and the precomputed library
// e4-library.json).
//
// The page: the brief (static), the bench (demand and electrification, the limits you set, what the model may do, a shock,
// costs and fuels; Run the pathway; readouts; the plan link), the results (what the run says, the map of the five regions,
// the mix by model year, CO2 and imports, the LP's marginal values, Ridge County, the shock against the plan, the
// full-year check from the library), then how the engine works (LX.Boundary) and the sources. The first view (the plan
// on load, when it is in the library) is drawn from the library, labelled "precomputed with this engine on <date>"; every
// run the reader starts (Run, a preset) solves in the browser. The full-year checks stay precomputed: they follow the
// plan's key, live or not (about a minute of solving each). Every number the page states comes from E4 or the library and
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
  // what a run says, one idea a line (V: E4.view; X: the shock's view or null); never more than the run shows. "Out of
  // reach" is proven by the engine (limits first: a second LP finds the least overshoot) and read from its flags
  // (V.missBudget, V.missCap), never off a penalty or a rounded number: 0.4 Mt over a budget is over
  var WN = ["2030–2035", "2040–2045", "2050"];
  function says(V, X, P, E4) {
    var out = [], Y = V.Y, last = Y.length - 1, miss = (V.windowReach || []).map(function (ok, i) { return ok ? -1 : i; }).filter(function (i) { return i >= 0; });
    // what the limits-first runs prove: with only the budget missed, no plan within the cap emits less; with only the cap
    // missed, no plan within the budget has a smaller excess over the cap (summed over the model years), which is not the
    // least imports; with both missed, the run weighs the two overshoots as their penalties do (a tonne against GJ)
    var mb = E4.missB(V), mc = E4.missCapAny(V), both = mb && mc, tGJ = P.cfg.penalties.budgetPerT / P.cfg.penalties.importPerGJ, given = V.carbonValue.length > 1 ? ", given each window's earlier decisions" : "";
    if (mb) out.push({ kind: "bad", text: "**The budget is out of reach: the closest pathway emits " + E4.cumText(V) + " Mt against " + kilo(V.budget) + " Mt (" + E4.overText(V) + " over).** " + (both
      ? "The cap is missed too: the run weighs a tonne over the budget as " + kilo(tGJ) + " GJ over the cap, finds the least of the two, then the cheapest such plan" + given + "."
      : "No plan within these levers and the cap emits less" + given + "; this is the cheapest of the closest.") });
    else if (V.carbonValue.length > 1) {   // decade by decade: each window had its share of the budget left
      var wb = V.carbonValue.map(function (x, i) { return x != null && x > 0.05 ? i : -1; }).filter(function (i) { return i >= 0; });
      out.push({ kind: miss.length ? "warn" : "good", text: "**CO₂ 2026–2050: " + kilo(V.cum) + " Mt" + (V.cum < V.budget - 0.5 ? ", " + kilo(V.budget - V.cum) + " Mt below the budget." : ", at the budget.") + "** Decade by decade, each window had its share of what was left; " +
        (miss.length ? "the window " + miss.map(function (i) { return WN[i]; }).join(" and ") + " cannot meet its share, so it runs the closest plan" : wb.length ? "the " + WN[wb[0]] + " window's share binds ($" + fix(V.carbonValue[wb[0]], 0) + " a tonne, present value)" : "no window's share binds") + "." });
    }
    else if (V.carbonValue[0] == null) out.push({ kind: "warn", text: "**CO₂ 2026–2050: " + kilo(V.cum) + " Mt, within the " + kilo(V.budget) + " Mt budget.** The import cap is out of reach, so the budget's dual is not a marginal value here." });
    else out.push({ kind: "good", text: "**CO₂ 2026–2050: " + kilo(V.cum) + " Mt, within the " + kilo(V.budget) + " Mt budget.** " + (V.carbonValue[0] > 0.05 ? "The budget binds: one more tonne allowed would save about $" + fix(V.carbonValue[0], 0) + " (present value in 2025; the LP's dual)." : "The budget does not bind: the cheapest pathway stays below it anyway.") });
    var mi = Math.max.apply(null, V.imp), yi = Y[V.imp.indexOf(mi)], xs0 = sum(V.capOver), ic = V.impCap || V.imp, mci = Math.max.apply(null, ic), yci = Y[ic.indexOf(mci)];
    // a missed cap in the cap's own measure (imports over primary energy less battery and link losses), to 0.1 point
    if (mc) out.push({ kind: "bad", text: "**Imports above the cap:** " + pct(mci, 1) + " of the cap's base in " + yci + " against " + pct(V.cap) + ", " + fix(xs0, 1) + " PJ over in all. " + (both ? "The run weighs both overshoots (above)." : "No plan within these levers and the budget has a smaller excess" + given + "; this is the cheapest at that excess, not the least imports.") });
    else out.push({ kind: "", text: "**Imports at most " + pct(mi) + " of primary energy (" + yi + "),** within the " + pct(V.cap) + " cap; 2025: " + pct(P.imports.dependence.share) + "." });
    var g = V.built, gw = function (t) { return sum(g[t]); };
    out.push({ kind: "", text: "**Built 2026–2050:** wind " + fix(gw("wind"), 1) + " GW, solar " + fix(gw("solar"), 1) + " GW, gas " + fix(gw("gasCC") + gw("gasCT"), 1) + " GW, batteries " + fix(gw("battery"), 1) + " GW, the generic firm clean option " + fix(gw("firm"), 1) + " GW; new links " + fix(sum(V.txAdd), 1) + " GW." });
    out.push({ kind: "", text: "**Electricity in 2050: " + pct(V.clean[last]) + " from sources with no CO₂ in operation,** from " + fix(V.elTWh[0], 0) + " TWh used in 2030 to " + fix(V.elTWh[last], 0) + " TWh in 2050." });
    var rs = V.ridge.closeP;
    out.push({ kind: rs === null ? "" : "warn", text: rs === null ? "**Ridge Station stays open to 2050.**" : rs === 2 && V.ridge.station[1] > 0 ? "**Ridge Station closes on its schedule** (end of 2037): coal mined falls from 700 PJ in 2025 to " + kilo(V.ridge.coal[last]) + " PJ in 2050." : "**Ridge Station closes early,** in the model year " + Y[rs] + ": coal mined falls from 700 PJ in 2025 to " + kilo(V.ridge.coal[last]) + " PJ in 2050." });
    var un = sum(V.unserved), sh = max(V.reserve.map(function (x) { return x.shortMW; }));
    if (un > 0.005) out.push({ kind: "bad", text: "**Electricity not served in the slices: " + fix(un, 2) + " TWh** over the model years." });
    if (V.rule === null) out.push({ kind: "warn", text: "**Peak-hour rule off: the stress hours are not tested.** At the tighter stress hour of 2050 this plan's capacity would be " + pct(Math.abs(V.reserve[last].margin), 1) + (V.reserve[last].margin < 0 ? " short of" : " above") + " the load." });
    else if (sh > 0.5) out.push({ kind: "warn", text: "**Short of the peak-hour rule by " + kilo(sh) + " MW** in the worst model year: the rule asks for load plus its margin, so this does not by itself mean demand goes unserved." });
    if (X) {
      var xs = max(X.reserveShort);
      out.push({ kind: E4.missB(X) || sum(X.unserved) > 0.005 ? "bad" : "warn", text: "**" + X.label + " in " + X.year + ":** the pathway re-planned after it costs " + (X.dPV >= 0 ? "$" + fix(X.dPV / 1000, 1) + " billion more" : "$" + fix(-X.dPV / 1000, 1) + " billion less") +
        " (present value); CO₂ 2026–2050 " + E4.cumText(X) + " Mt" + (E4.missB(X) ? ", " + E4.overText(X) + " over the budget" : "") + "; imports in " + X.year + " " + pct(X.imp[Y.indexOf(X.year)]) + (X.rule === null ? "; stress hours not tested" : xs > 0.5 ? "; short of the peak-hour rule by " + kilo(xs) + " MW" : "") + "." });
    }
    return out;
  }
  function sum(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i] || 0; return s; }
  function max(a) { var m = 0; for (var i = 0; i < a.length; i++) m = Math.max(m, a[i] || 0); return m; }
  // the full-year check's table rows (library), with the rule for "survives" (E4.fullVerdict: a teaching tolerance)
  function fullRows(F, E4) {
    return F.map(function (c) {
      var v = E4.fullVerdict(c);
      return [c.year + ", " + c.weather + " weather", kilo(c.unservedHours) + " h, " + fix(c.unservedMWh / 1e6, 2) + " TWh", fix(c.co2, 1) + " Mt (slices " + fix(c.co2Slices, 1) + "; " + (c.gap >= 0 ? "+" : "") + pct(c.gap, 1) + ")",
        fix(c.curtailTWh, 1) + " TWh (slices " + fix(c.curtailSlices, 1) + ")", v.text];
    });
  }
  var page = { libKey: libKey, libEntry: libEntry, says: says, fullRows: fullRows, kilo: kilo, fix: fix, pct: pct, bn: bn, max: max,
    GROUPS: [{ title: "Demand and electrification", fields: ["dem", "eb", "et", "ei"], color: "var(--lx-demand)", hint: "Electricity's share of each sector's [[useful-energy|useful energy]] in 2050; it rises in a straight line from 2025's. The engine does not choose it: end-use equipment costs are left out." },
      { title: "The limits you set", fields: ["bud", "acc", "cap", "rm"], color: "var(--lx-bad)", hint: "A [[carbon-budget|cumulative carbon budget]] for 2026–2050, an import cap in every model year, and a peak-hour rule: at two hard hours of 2025's weather, available capacity must cover each region's load plus the margin you pick.", gap: true },
      { title: "What the model may do", fields: ["fs", "fm", "tx", "rt"], color: "var(--lx-accent)", hint: "[[perfect-foresight|Perfect foresight]] plans 2030–2050 at once; decade by decade sees only two model years at a time." },
      { title: "A shock", fields: ["sh"], color: "var(--lx-warn)", hint: "An operating shock meets the plants already built; the mineral restriction meets the batteries not yet bought. Open the table for each shock's numbers.", shocks: true },
      { title: "Costs you set (2025 dollars)", fold: "Costs and fuel prices you set (open to change them)", fields: ["cw", "cs", "cb", "cc", "ct", "cf", "cx"], color: "var(--lx-ink-2)", hint: "Each a fixed range from prairieland.json, the same in every period: no cost changes with how much is built." },
      { title: "Fuels and money", fold: "Fuel prices and the discount rate (open to change them)", fields: ["pg", "pl", "pc", "po", "dr"], color: "var(--lx-ink-2)", hint: "Fuel prices per GJ on net calorific values, constant over the periods unless a shock changes them; the [[discount-rate|discount rate]] is real." }] };
  if (typeof module !== "undefined" && module.exports) module.exports = page;
  if (typeof window === "undefined" || !window.LX || !window.LX.E4) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H, E4 = LX.E4, U = E4.ui;
  LX.mount("sb4", function (live, data, root) {
    var P = E4.prepare(data.prairieland, data.e4_pathways), S = E4.schema(P), LIB = data.e4_library || null, stub = null, first = false;
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
    // the limits group carries the budget gap with A20; the shock group its table of numbers
    var groups = page.GROUPS.map(function (g) {
      var o = {}; for (var k in g) o[k] = g[k];
      if (g.gap) o.extra = function (fs) { E4.GAP.slice(0, 2).forEach(function (t) { H("p", { class: "lx-hint e4-ghint", html: LX.rich(t) }, fs); }); };
      if (g.shocks) o.extra = function (fs) { var d = H("details", { class: "e4-fold" }, fs); H("summary", { text: "What each shock changes, in numbers" }, d);
        U.table(d, ["Shock", "When, in the model", "What changes", "What the re-plan keeps"], E4.shockTable(P), "sb4-shocks e4-wrap");
        H("p", { class: "lx-hint", text: "A model year stands for five years: the gas-price spike, the drought and the mineral restriction each last one period here, longer than their stories (the restriction's two years); the demand surprise lasts from 2031 to 2050." }, d);
        H("p", { class: "lx-hint", text: "The story's other effects (the factory's stocks and recycling) are lesson A21's, not modelled here." }, d); };
      return o;
    });
    var C = U.controls(ctr, S, plan, groups, change, hints);
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
      // only the first view comes from the library; every run the reader starts solves live. A plan in the library keeps
      // its full-year checks either way (the same plan, shock set aside: the checks are of the unshocked pathway). The
      // status line is the engine's, by foresight
      solve: function (st, ctx) {
        var e = page.libEntry(LIB, LX.ShareState, S, st), useLib = e && first && !stub; first = false;
        if (useLib) return Promise.resolve({ status: "optimal", ok: true, kind: "lp", message: E4.doneWords(st, e.view) + " From the library.", results: { V: e.view, X: st.sh !== "none" ? e.shocks[st.sh] : null, full: e.full, lib: true } });
        return E4.solve(st, P, { signal: ctx.signal, attempt: ctx.attempt, solver: solver() }).then(function (r) {
          if (r.ok) { var V = E4.view(r.results.plan, P); r.results = { V: V, X: r.results.shock ? E4.shockView(r.results.shock, V, P) : null, full: e ? e.full : null, lib: false, ms: r.ms }; }
          return r;
        });
      },
      render: function (R) { draw(R); } });
    stopB.attach(run);
    side.appendChild(ro);
    side.insertBefore(ss.status, pre);
    side.appendChild(src);
    side.insertBefore(H("p", { class: "lx-hint e4-prehint", text: "A preset changes only the choices it names; your other settings stay." }), pre.nextSibling);
    side.appendChild(ss.el);
    function change(p) { plan = p; C.set(plan); ss.set(plan); run.changed(plan); }

    // ---- the results
    var map = null;
    function draw(R) {
      var V = R.V, X = R.X;
      src.textContent = R.lib ? "The first view, precomputed with this engine on " + LIB.date + " (the same LP). Run the pathway, or pick a preset, to solve in your browser." : "Solved in your browser just now (HiGHS, a linear program).";
      src.className = "e4-src" + (R.lib ? " lib" : "");
      ro.innerHTML = "";
      U.readouts(V).forEach(function (x) { var d = H("div", { class: "lx-readout " + x[2] }, ro); H("span", { text: x[0] }, d); H("b", { text: x[1] }, d); });
      res.innerHTML = "";
      H("p", { class: "lx-hint e4-line", text: P.line }, res);
      var sayBox = H("div", { class: "e4-says" }, res);
      page.says(V, X, P, E4).forEach(function (s) { H("p", { class: "e4-say " + s.kind, html: LX.rich(s.text).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>") }, sayBox); });
      var c1 = H("div", { class: "lx-xcard lx-sb-chart" }, res); H("h3", { text: "The nation, model year by model year" }, c1);
      map = U.Map(c1, P); map.set(V);
      U.keys(c1, [["Each disc", "the region's electricity in that year by source (batteries store, so they are not a source); below it, the LP's [[marginal-cost|marginal cost]] of one more MWh there, averaged over the slices by load."],
        ["Each link", "its transfer limit, existing plus what the plan adds; amber when it is full for more than 2,000 hours of the slices."],
        ["Ties", "where two regions or routes cost the same or almost, the map shows the one the [[tie-rule|tie rule]] picks; its small costs can move national totals slightly, so read near-equal plans as one family."]]);
      var c2 = H("div", { class: "lx-xcard lx-sb-chart" }, res); H("h3", { text: "What is open and what runs" }, c2);
      U.MixChart(c2, P).set(V);
      U.keys(c2, [["Batteries", "storage, not a source: the electricity view leaves them out, and its text version lists what they take in and give back."], ["Vintages", "each plant's [[vintage|vintage]] counts in a model year only while its life covers it."],
        ["Retirements", "an existing plant leaves in the five-year period that contains its retirement year, a conservative simplification (Plains Station, open to the end of 2030, is out of 2026–2030); the plan may retire coal, gas or oil earlier."],
        ["Residual value", "a plant built late pays only for the years it runs up to 2050; the rest of its life is its [[residual-value|residual value]], not charged."]]);
      var c3 = H("div", { class: "lx-sb-charts two" }, res);
      var c3a = H("div", { class: "lx-xcard lx-sb-chart" }, c3); H("h3", { text: "CO₂ a year" }, c3a);
      U.Co2Chart(c3a, P).set(V, X, X ? "After the shock" : null);
      U.keys(c3a, [["The budget", "counts " + (V.w0 ? "2025 twice and each model year for the years around it (straight lines between)" : "each model year for the five years ending in it") + ": weights " + V.w0 + ", " + V.w.join(", ") + "."]]);
      var c3b = H("div", { class: "lx-xcard lx-sb-chart" }, c3); H("h3", { text: "Imports against the cap" }, c3b);
      U.ImportChart(c3b, P).set(V, X, X ? "After the shock" : null);
      U.keys(c3b, [["Imports", "crude oil and LNG, as a share of [[primary-energy|primary energy]] (physical energy content); " + E4.straitText(P) + "."], ["The cap's base", "primary energy less what batteries and links lose: electricity lost there does not count toward the cap."]]);
      var c4 = H("div", { class: "lx-xcard lx-sb-chart" }, res); H("h3", { text: "Marginal values from the LP" }, c4);
      U.table(c4, ["Model year", "Marginal cost of electricity, $/MWh: " + P.R.map(function (r) { return r.short; }).join(" · "), "The budget, $ a tonne that year", "Import cap, $ per GJ", "Spare at the tighter stress hour" + (V.rule === null ? " (rule off: not enforced)" : "")], V.Y.map(function (y, p) {
        return [String(y), V.price[p].every(function (x) { return x == null; }) ? "none (a limit out of reach)" : V.price[p].map(function (x) { return x == null ? "–" : Math.round(x); }).join(" · "), V.carbonPrice[p] == null ? "none (a limit out of reach)" : "$" + fix(V.carbonPrice[p], 0), V.importValue[p] == null ? "none (a limit out of reach)" : V.importValue[p] > 0.005 ? "$" + fix(V.importValue[p], 2) : "not binding",
          V.reserve[p].margin == null ? "–" : pct(V.reserve[p].margin, 1) + " (" + (V.reserve[p].key === "peak" ? "summer peak" : "winter week") + ")"];
      }), "sb4-val");
      U.keys(c4, [["Their assumptions", "this plan's capacities, prices and the twelve slices: marginal values, not market prices."],
        ["The budget's value", (V.carbonValue.length > 1 ? "decade by decade, each window has its own dual: " + V.carbonValue.map(E4.cvText).join(", ") : "the dual, " + E4.cvText(V.carbonValue[0])) + " a tonne in 2025's present value."],
        ["That year's price", "the dual × w ÷ D: w is the years of CO₂ the budget counts for that model year (" + V.w.join(", ") + "), D its five years' [[discount-rate|discount factors]] added up (" + V.D.map(function (d) { return fix(d, 2); }).join(", ") + ")."]]);
      var c5 = H("div", { class: "lx-xcard lx-sb-chart" }, res); H("h3", { text: "Cost, by part (present value in 2025)" }, c5);
      var pv = V.pv;
      U.table(c5, ["Part", "Present value", "In 2050, a year"], [["New plants: yearly payments and fixed O&M", bn(pv.capital), bn(V.yearly[4].capital)], ["New links", bn(pv.transmission), bn(V.yearly[4].transmission)],
        ["Fixed O&M of fossil plants kept open", bn(pv.fom), bn(V.yearly[4].fom)], ["Fixed O&M of the existing wind, solar and batteries", bn(pv.upkeep), bn(V.yearly[4].upkeep)], ["Variable O&M", bn(pv.vom), bn(V.yearly[4].vom)], ["Fuels bought by the whole nation", bn(pv.fuel), bn(V.yearly[4].fuel)],
        { cls: "e4-tot", cells: ["Total", bn(pv.total), bn(V.yearly[4].total)] }], "sb4-cost");
      U.keys(c5, [["The boundary", "the energy system's supply side and every fuel bought, 2026–2050 in 2025 dollars; existing plants' capital is sunk; end-use equipment (heat pumps, cars) is left out."],
        ["Existing fleet", "wind, solar and batteries at the new plants' fixed O&M while open: the same in every pathway. The data give none for existing hydro and the steady plants, so their upkeep is left out."]]);
      if (X) {
        var c6 = H("div", { class: "lx-xcard lx-sb-chart" }, res); H("h3", { text: X.label + " in " + X.year + ": the plan against the re-plan" }, c6);
        var yi = V.Y.indexOf(X.year);
        U.table(c6, ["", "The plan", "After the shock"], [["Cost to 2050 (present value)", bn(V.pv.total), bn(X.pv)], ["CO₂ 2026–2050", E4.cumText(V) + " Mt", E4.cumText(X) + " Mt"],
          ["CO₂ in " + X.year, fix(V.co2[yi], 1) + " Mt", fix(X.co2[yi], 1) + " Mt"], ["Imports in " + X.year, pct(V.imp[yi], 1), pct(X.imp[yi], 1)],
          ["Short of the peak-hour rule in " + X.year, V.rule === null ? "not tested" : kilo(V.reserve[yi].shortMW) + " MW", X.rule === null ? "not tested" : kilo(X.reserveShort[yi]) + " MW"], ["Electricity not served in " + X.year, fix(V.unserved[yi], 2) + " TWh", fix(X.unserved[yi], 2) + " TWh"]], "sb4-shock");
        var row = E4.shockTable(P, [X.key])[0];
        U.keys(c6, [["The shock", row[2]], ["The rule", row[3]]]);
      }
      var c7 = H("div", { class: "lx-xcard lx-sb-chart" }, res); H("h3", { text: "Slices against full years of hours" + (X ? " (the plan without the shock)" : "") }, c7);
      if (R.full) {
        U.table(c7, ["Check", "Not served", "CO₂ of the year", "Wind and solar spilled", "Verdict"], page.fullRows(R.full, E4), "sb4-full e4-wrap");
        if (R.full.some(function (c) { return c.fuelAt === "price"; })) U.keys(c7, [["Fuel prices", "a year whose run missed a limit has no marginal values, so its check buys fuels at their prices, with no value on carbon."]]);
        U.keys(c7, [["The check", "this plan's capacities in 2030 and 2050, run hour by hour over 2025's weather and over 2024's (an independent year), week by week; each week's batteries end as they start."],
          ["Survives", "all demand served and the year's CO₂ within 10% of the slices' estimate, a tolerance set for teaching" + (R.full.some(function (c) { return c.fuelAt === "price"; }) ? "; demand served only where the run missed a limit" : "") + ". It tests two years' dispatch, not the cumulative budget or adequacy."], ["From the library", "precomputed with this engine on " + LIB.date + ": about a minute of solving, too slow to run on a click."]]);
      } else {
        H("p", { class: "lx-hint", html: LX.rich("**Full-year validation unavailable for this plan.** It is precomputed only for the presets with every other setting at its default (about a minute of solving each). [[lesson:m13-national-pathway|M13]] explains the check.").replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>") }, c7);
        H("button", { class: "lx-btn ghost small", type: "button", text: "Load the default plan (validated)", onclick: function () { change(LX.ShareState.defaults(S)); run.run(plan); } }, c7);
      }
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
      holds: ["twelve time slices of 2025's weather stand for each model year: the peak net-load day and the scarce-wind week get their own average day and night, not their hourly sequence (the full-year check runs every hour)", "flows between regions obey their transfer limits only (a transport model)",
        "costs are fixed ranges you set, the same in every period, whatever is built", "electrification and demand follow the plan, not the model", "the peak-hour rule stands in for adequacy, which is never judged from slices (A5)"],
      leaves: ["power-flow physics, outages and reserves within the hour", "end-use equipment costs, so the model never chooses electrification", "how fast industries, factories and workers can change", "fuels other than electricity for the oil that remains (aviation, shipping, farms)", "who decides, and prices in markets: marginal values are not market prices"],
      source: "Prairieland is fictional; its numbers are illustrative. Costs: EIA AEO2026 assumptions (2025 dollars); hourly shapes: SPP 2025 and 2024." });

    // ---- the first view: the plan on load from the library (no solver download), else a live run once in view
    var started = false;
    function start() { if (started) return; started = true; first = true; run.run(plan); }
    if (typeof IntersectionObserver !== "undefined") {
      var io = new IntersectionObserver(function (es) { if (es.some(function (e) { return e.isIntersecting; })) { io.disconnect(); start(); } }, { rootMargin: "200px" });
      io.observe(root); io.observe(rh);
    } else start();

    // ---- demo states (screenshots): mid (security first), live (the default solved live), shock, fail, tl
    LX.demo(root, function (s) {
      started = true;
      if (s === "mid" || s === "done") { change(E4.withPreset(plan, E4.presetsOf(P)[2])); run.run(plan); return { view: "mid" }; }
      if (s === "live") { run.run(plan); return { view: "mid" }; }
      if (s === "shock") { change(Object.assign({}, plan, { sh: "demandSurprise" })); run.run(plan); return { view: "mid" }; }
      if (s === "norule") { change(Object.assign({}, plan, { rm: "off" })); run.run(plan); return { view: "mid" }; }
      if (s === "fail") { stub = "fail"; run.run(plan); return { view: "fail" }; }
      if (s === "tl") { stub = "tl"; run.run(plan); return { view: "tl" }; }
      return null;
    });
  });
})();
