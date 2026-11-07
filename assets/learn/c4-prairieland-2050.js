// c4-prairieland-2050.js — C4, "Prairieland 2050: design and defend a nation's pathway" (capstone, Modeler–Researcher, wave
// W6, 2026-11-07), on the Pathway Explorer's engine E4 (assets/learn/components/engine-e4.js, LX.E4, in the bundle). Data:
// prairieland.json, e4-pathways.json, the precomputed library e4-library.json, a13-fairness-jobs.json (A13's coefficients
// and Ridge County) and prairie-city.json (its five household groups, a stand-in for Prairieland's households).
//
// The page: the brief; the plan (the engine's levers and C4's screening inputs; one run solves the pathway, re-plans it
// after each of C4's four shocks and solves the "policies as in 2025" reference with the same costs); the results (what
// the run says, the shock table, security, screening affordability and Ridge County's jobs from LX.A13, the map, the mix,
// CO2 and imports, the full-year check from the library when the plan is a preset); the two-page policy brief
// (LX.ReportNote); the self-check (exemplars, rubric); the sources. A plan on the library is drawn from it at once,
// labelled with its date. Every number comes from E4, the library or LX.A13; _tests/learn/test_c4-prairieland-2050.js
// checks them. Prairieland and Ridge County are fictional; their numbers are illustrative.
(function () {
  "use strict";
  // ---------------------------------------------------------------- pure (Node: the test reads it)
  function kilo(v) { var r = Math.round(v); return (r < 0 ? "−" : "") + Math.abs(r).toLocaleString("en-US"); }
  function fix(v, d) { var s = Math.abs(v).toFixed(d == null ? 1 : d); return (v < 0 && +s !== 0 ? "−" : "") + s.replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
  function pct(v, d) { return fix(v * 100, d == null ? 0 : d) + "%"; }
  function bn(v) { return (v < 0 ? "−$" : "$") + fix(Math.abs(v) / 1000, 1) + " billion"; }
  function sbn(v) { return (v > 0 ? "+" : v < 0 ? "−" : "") + "$" + fix(Math.abs(v) / 1000, 1) + " billion"; }
  function sum(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i] || 0; return s; }
  // C4's plan: the engine's fields (the shock left out: C4 tests all four) and its screening inputs
  function c4Schema(E4, P, A) {
    var base = E4.schema(P), J = A.jobs;
    var f = base.fields.filter(function (x) { return x.id !== "sh"; }).concat([
      { id: "hs", short: "hs", type: "num", label: "Households pay this share of the change in yearly cost", unit: "%", min: 0, max: 100, step: 10, def: 50 },
      { id: "rc", short: "rc", type: "enum", values: A.designs.map(function (d) { return d.key; }), names: (function () { var o = {}; A.designs.forEach(function (d) { o[d.key] = d.name; }); return o; })(), def: A.designs[0].key, label: "Households' share recovered" },
      { id: "jm", short: "jm", type: "num", label: "Jobs multiplier (direct to total)", unit: "×", min: J.multiplier.min, max: J.multiplier.max, step: J.multiplier.step, def: J.multiplier.start },
      { id: "jd", short: "jd", type: "num", label: "Displacement: new work that would have happened anyway", unit: "%", min: J.displacement.min, max: J.displacement.max, step: J.displacement.step, def: J.displacement.start }]);
    return { key: "c4", version: 1, title: "Prairieland 2050 plan", fields: f, check: function () { return null; } };
  }
  // the engine's plan (SB4's fields) behind a C4 plan; and the library's key for it
  function toE4(E4, P, st) { var S4 = E4.schema(P), o = {}; S4.fields.forEach(function (f) { o[f.id] = f.id === "sh" ? "none" : st[f.id]; }); return o; }
  function libEntry(LIB, SS, E4, P, st) {
    if (!LIB) return null;
    var k = SS.encode(E4.schema(P), toE4(E4, P, st));
    for (var i = 0; i < LIB.plans.length; i++) if (LIB.plans[i].key === k) return LIB.plans[i];
    return null;
  }
  // the reference: "policies as in 2025" (the first preset's levers) with the plan's own demand, costs and fuels
  function refState(E4, P, st) { var r = E4.withPreset(toE4(E4, P, st), E4.presetsOf(P)[0]); r.fs = "perfect"; return r; }
  // screening affordability (LX.A13.allocate): households pay hs% of the change in the nation's yearly energy-system cost
  // in 2050 against the reference, spread over Prairie City's five household groups (a stand-in for Prairieland's)
  function afford(V, Vref, st, PL, pc, A13) {
    var L = V.Y.length - 1, dM = V.yearly[L].total - Vref.yearly[L].total, hhN = PL.nation.people / pc.city.personsPerHousehold;
    var perHH = dM * 1e6 * st.hs / 100 / hhN, rows = A13.groupsFrom(pc), H = sum(rows.map(function (r) { return r.households; }));
    var a = A13.allocate(rows, perHH * H, st.rc, {});
    return { year: V.Y[L], dM: dM, share: st.hs / 100, households: hhN, perHH: perHH, design: st.rc, rows: a.rows, low: a.rows[0], screening: A13.SCREENING, assume: A13.ASSUME.split };
  }
  // Ridge County's jobs (LX.A13.jobs): Ridge Station's staff and the mine jobs the coal decline removes, against the jobs
  // the wind and solar built in the Ridge region bring; gross and net, with A13's coefficients and C4's multiplier and
  // displacement. Mine jobs scale with coal mined at A13's ratio (its 700 mine jobs dig Ridge Station's coal)
  function ridgeJobs(V, st, PL, A, A13) {
    var rc = PL.ridgeCounty, a = rc.a13, J = A.jobs, L = V.Y.length - 1, perPJ = a.plant.mineJobs / rc.ridgeStationFuel2025PJ;
    var coalLost = Math.max(0, PL.balance.primary.coal - V.ridge.coal[L]), mine = perPJ * coalLost, ri = PL.regions.map(function (r) { return r.key; }).indexOf("ridge");
    var b = V.builtR[ri], mw = (b.wind + b.solar) * 1000, capex = mw > 0 ? (b.wind * st.cw + b.solar * st.cs) * 1000 / mw : st.cw;
    var j = A13.jobs({ staff: V.ridge.closeP === null ? 0 : a.plant.staff, mineJobs: mine, multiplier: st.jm, newMW: mw, capexPerKW: capex, localShare: J.localShare, jobYearsPerM: J.jobYearsPerM.start,
      buildYears: J.buildYears, omPer100MW: J.omPer100MW.start, displacement: st.jd / 100, horizonYears: J.horizonYears });
    return { j: j, mineLost: mine, coalLost: coalLost, perPJ: perPJ, staff: V.ridge.closeP === null ? 0 : a.plant.staff, newMW: mw, capex: capex, assume: A13.ASSUME.jobs, screening: A13.SCREENING };
  }
  // the four shocks as rows, and the brief's sensitivity line
  function shockRows(V, X) {
    return Object.keys(X).map(function (k) { var x = X[k], y = V.Y.indexOf(x.year);
      return [x.label + " (" + x.year + ")", sbn(x.dPV), kilo(x.cum) + " Mt" + (x.over > 0.5 ? " (" + kilo(x.over) + " over)" : ""), pct(x.imp[y]) + (x.capOver[y] > 0.5 ? " (above the cap)" : ""), x.reserveShort[y] > 0.5 ? kilo(x.reserveShort[y]) + " MW short" : "met", x.unserved[y] > 0.005 ? fix(x.unserved[y], 2) + " TWh" : "none"]; });
  }
  function sensLine(V, X) {
    var ks = Object.keys(X), d = ks.map(function (k) { return X[k].dPV; }), worst = ks[d.indexOf(Math.max.apply(null, d))];
    var over = ks.filter(function (k) { return X[k].over > 0.5; }), short = ks.filter(function (k) { return sum(X[k].reserveShort) > 0.5; }), cap = ks.filter(function (k) { return sum(X[k].capOver) > 0.5; });
    return "Against four shocks re-planned from their year (the plan's builds up to it kept), the cost to 2050 moves by " + sbn(Math.min.apply(null, d)) + " to " + sbn(Math.max.apply(null, d)) + ", most for the " + X[worst].label.toLowerCase() +
      "; the budget is " + (over.length ? "missed under " + over.map(function (k) { return X[k].label.toLowerCase(); }).join(" and ") : "met under all four") + "; imports " + (cap.length ? "pass the cap under " + cap.map(function (k) { return X[k].label.toLowerCase(); }).join(" and ") : "stay within the cap") +
      "; the peak-hour rule is " + (short.length ? "short in the shock's year under " + short.map(function (k) { return X[k].label.toLowerCase(); }).join(" and ") : "met throughout") + ".";
  }
  function says(V, X, af, jb) {
    var out = [], L = V.Y.length - 1;
    out.push({ kind: V.over > 0.5 ? "bad" : "good", text: "**Cost and carbon:** " + bn(V.pv.total) + " to 2050 (present value); CO₂ 2026–2050 " + kilo(V.cum) + " Mt against " + kilo(V.budget) + " Mt" + (V.over > 0.5 ? ", " + kilo(V.over) + " Mt over: out of reach with these levers." : ".") });
    out.push({ kind: "", text: "**Security:** imports at most " + pct(Math.max.apply(null, V.imp)) + " of primary energy (cap " + pct(V.cap) + "); oil and LNG through the strait " + kilo(V.sec[L].strait) + " PJ in 2050; " + (V.sec[L].stockDays == null ? "no crude imported in 2050." : "oil stocks cover " + kilo(V.sec[L].stockDays) + " days of 2050's crude imports.") });
    out.push({ kind: "warn", text: "**Shocks:** " + sensLine(V, X) });
    out.push({ kind: "", text: "**Affordability (screening):** in " + af.year + " the nation's yearly energy cost is " + sbn(af.dM) + " against the 2025-policies pathway; at " + pct(af.share) + " paid by households, about $" + kilo(af.perHH) + " a household a year (" + (af.perHH >= 0 ? "a cost" : "a saving") + "). Heat pumps and cars bought are not in it." });
    out.push({ kind: "", text: "**Ridge County (screening):** " + kilo(jb.j.lostTotal) + " jobs lost (Ridge Station and the mines, with the multiplier) against " + kilo(jb.j.newPermGross) + " new ongoing jobs at the Ridge region's wind and solar (" + kilo(jb.j.newPermNet) + " net of displacement), plus " + kilo(jb.j.buildJobYears) + " construction job-years (" + kilo(jb.j.buildJobYearsNet) + " net)." });
    return out;
  }
  // the brief's assumptions and limits, one sentence each
  function assumptions(st, af, jb) {
    return ["Prairieland and Ridge County are fictional; their numbers are illustrative.", "2025 dollars; costs are fixed ranges the plan sets, the same in every period, whatever is built.",
      "Twelve time slices of 2025's weather stand for each model year, with the peak net-load day and the scarce-wind week kept whole; a peak-hour rule at two stress hours.",
      "CO₂: fuels burned inside Prairieland at the IPCC's factors; the budget counts 2025 twice and the model years with straight lines between.",
      "Electrification follows the plan; end-use equipment (heat pumps, cars, boilers) is left out of every cost.",
      "Shocks: the plan's builds up to the shock's year are kept; that year runs what was built; later years re-plan knowing the shock.",
      "Affordability: households pay " + pct(af.share) + " of the change in 2050's yearly cost against the 2025-policies pathway, " + { kwh: "per kWh", fixed: "as a fixed charge", income: "in proportion to income" }[af.design] + "; Prairie City's five groups stand in for Prairieland's households."]
      .concat(af.assume).concat(["Ridge County: mine jobs scale with coal mined at A13's ratio (" + fix(jb.perPJ, 2) + " jobs per PJ); new jobs from the wind and solar built in the Ridge region, with A13's coefficients."]).concat(jb.assume);
  }
  var LIMITS = ["A teaching model: no power flow, outages or reserves within the hour; adequacy is not judged from slices (A5).", "No clean fuels for the oil and gas that stay: deep budgets are out of its reach.",
    "Perfect foresight is a benchmark; real decisions are made decade by decade by many actors.", "Affordability and jobs are screening estimates from an accounting layer, not outputs of the LP."];
  var FIELDS = [{ key: "recommend", label: "Recommendation", hint: "Three or four sentences: the pathway Prairieland should take to 2050, and why.", rows: 4, need: true, at: "top", min: 15 },
    { key: "evidence", label: "Cost, carbon and security", hint: "Two or three sentences: the cost, CO₂ against the budget, imports against the cap.", rows: 3, need: true, min: 12 },
    { key: "uncertainty", label: "Shocks and what would change the recommendation", hint: "Two or three sentences: what the four shocks did, and which result would make you choose differently.", rows: 3, need: true, min: 12 },
    { key: "fairness", label: "Who pays, and Ridge County", hint: "Two or three sentences: households (a screening estimate, with your share and design) and Ridge County's jobs, gross and net.", rows: 3, need: true, min: 12 },
    { key: "sources", label: "Sources and credit", hint: "One or two sentences: the data behind your numbers (EIA, IPCC, SPP through EIA-930; the course's teaching settings) and any conflict of interest.", rows: 2, need: true, min: 8 }];
  var TWO_PAGES = 1100;
  var RUBRIC = [{ id: "accounting", look: "Cost and CO₂ on one boundary (the nation, 2026–2050, 2025 dollars, fuels burned inside Prairieland); imports against the cap; affordability and jobs as screening estimates, gross and net kept apart." },
    { id: "uncertainty", look: "All four shocks reported as ranges, with the rule for what was kept; the result that would change the recommendation named.",
      levels: { proficient: "the four shocks re-planned on this plan and reported (cost, budget, imports, the peak-hour rule), the range stated, and the shock or assumption that would flip the recommendation named" } },
    { id: "realism", look: "What the model leaves out: equipment costs, clean fuels, foresight, outages; whether the full-year check is known for this plan." },
    { id: "communication", look: "Two pages a minister can act on: the recommendation first, then the evidence, the shocks, who pays, Ridge County and the limits.",
      levels: { proficient: "a two-page policy brief with the pathway link: the recommendation first, then cost, carbon and security, the shocks with their range, who pays and Ridge County (gross and net), and the limits" } }];
  // a weak and a strong brief for the same plan (numbers from that plan's run)
  function exemplars(V, X, af, jb) {
    var L = V.Y.length - 1, b = function (t) { return fix(sum(V.built[t]), 1); };
    return { title: "Two briefs on the same pathway", task: "Recommend Prairieland's pathway to 2050 and defend it against shocks, for a minister.", id: "c4-ex", lines: true,
      answers: [{ key: "weak", label: "Weak brief", level: "Developing", parts: ["Prairieland ", { text: "should go renewable", note: "No sizes or years: what is built, where, and when?" }, ". ", { text: "It meets the climate goal", note: "Which budget, on what boundary, by how much?" }, " and ",
          { text: "is secure", note: "Against what? Imports, the strait, the peak hours: name the measure and the shocks." }, ". ", { text: "Ridge County will be fine", note: "Jobs lost and gained, gross and net, with the coefficients stated." }, "."] },
        { key: "good", label: "Strong brief", level: "Proficient", parts: ["Recommendation: ", { text: "follow the central pathway: build " + b("wind") + " GW of wind, " + b("solar") + " GW of solar and " + fix(sum(V.built.gasCC) + sum(V.built.gasCT), 1) + " GW of gas by 2050, and widen links by " + fix(sum(V.txAdd), 1) + " GW", note: "Every lever with its size." }, ".\n",
          "Cost and carbon: ", { text: bn(V.pv.total) + " to 2050 (present value, 2025 dollars, supply side and every fuel); CO₂ " + kilo(V.cum) + " of " + kilo(V.budget) + " Mt", note: "One boundary, the budget's arithmetic stated." }, ".\n",
          "Security: ", { text: "imports at most " + pct(Math.max.apply(null, V.imp)) + " of primary energy against a " + pct(V.cap) + " cap", note: "A measure and its limit." }, ".\n",
          "Shocks: ", { text: sensLine(V, X), note: "All four, with the rule for what was kept, as a range." }, "\n",
          "Who pays (screening): ", { text: "about $" + kilo(af.perHH) + " a household a year in " + af.year + " if households pay " + pct(af.share) + "; equipment not counted", note: "A screening estimate with its share and what it leaves out." }, ".\n",
          "Ridge County (screening): ", { text: kilo(jb.j.lostTotal) + " jobs lost against " + kilo(jb.j.newPermGross) + " new ongoing jobs (" + kilo(jb.j.newPermNet) + " net)", note: "Gross and net kept apart; the multiplier and displacement stated." }, "."] }],
      diff: [{ label: "Sizes", weak: "none", good: "every lever" }, { label: "Boundary", weak: "none", good: "stated" }, { label: "Shocks", weak: "none", good: "all four, a range" }, { label: "Jobs", weak: "none", good: "gross and net" }],
      note: "Both briefs are illustrative; the strong one quotes the default plan's run." };
  }
  // what each shock does in the engine, from prairieland.json's parameters and the engine's shock years
  function shockWhat(P, yr) {
    var q = function (k) { return P.shocks[k].params; };
    return "gas-price spike in " + yr.gasSpike + ": LNG × " + q("gasSpike").lngX + " and domestic gas × " + q("gasSpike").gasX + " for that model year; drought in " + yr.drought + ": hydro × " + q("drought").hydroX + " in every slice, coal, combined-cycle and existing nuclear plants at × " + q("drought").thermalSummerX +
      " of their capacity in the summer slices; the generic firm option too; mineral export restriction in " + yr.mineralBan + ": new batteries cost × " + q("mineralBan").batteryCapexX + " that model year; demand surprise from " + q("demandSurprise").from + ": electricity × " + q("demandSurprise").elX + " in every slice, unknown to the earlier years (prairieland.json's parameters).";
  }
  var page = { shockWhat: shockWhat, c4Schema: c4Schema, toE4: toE4, libEntry: libEntry, refState: refState, afford: afford, ridgeJobs: ridgeJobs, shockRows: shockRows, sensLine: sensLine, says: says, assumptions: assumptions, LIMITS: LIMITS,
    FIELDS: FIELDS, TWO_PAGES: TWO_PAGES, RUBRIC: RUBRIC, RUBRIC_BAR: "the bar for this policy brief", exemplars: exemplars, kilo: kilo, fix: fix, pct: pct, bn: bn, sbn: sbn };
  if (typeof module !== "undefined" && module.exports) module.exports = page;
  if (typeof window === "undefined" || !window.LX || !window.LX.E4) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H, E4 = LX.E4, U = E4.ui, A13 = LX.A13;
  LX.mount("c4", function (live, data, root) {
    var P = E4.prepare(data.prairieland, data.e4_pathways), A = data.a13_fairness_jobs, PC = data.prairie_city, LIB = data.e4_library, PL = data.prairieland;
    var S = c4Schema(E4, P, A), stub = null, forceLive = false;
    var rh = document.getElementById("c4-results"), fb = rh.querySelector(".lx-fallback"); if (fb) fb.hidden = true;
    H("p", { class: "lx-hint e4-line", text: P.line }, live);
    var wrap = H("div", { class: "lx-sb e4-sb" }, live), ctr = H("div", { class: "lx-sb-controls" }, wrap), side = H("div", { class: "lx-sb-side" }, wrap);
    var plan, last = null;
    var ss = LX.ShareState(side, { schema: S, id: "c4-link", onLoad: function (s) { plan = s; C.set(plan); run.changed(plan); rn.refresh(); } });
    plan = ss.state;
    var groups = [{ title: "Demand and electrification", fields: ["dem", "eb", "et", "ei"], color: "var(--lx-demand)", hint: "Electricity's share of each sector's [[useful-energy|useful energy]] in 2050; end-use equipment costs are left out." },
      { title: "The limits you set", fields: ["bud", "acc", "cap", "rm"], color: "var(--lx-bad)", hint: "A [[carbon-budget|cumulative carbon budget]], an import cap in every model year, a rule for the peak hours." },
      { title: "What the model may do", fields: ["fs", "fm", "tx", "rt"], color: "var(--lx-accent)", hint: "[[perfect-foresight|Perfect foresight]] or decade by decade; the generic firm clean option; new links; early retirement." },
      { title: "Who pays and Ridge County (screening)", fields: ["hs", "rc", "jm", "jd"], color: "var(--lx-tier-4)", hint: "Inputs to the accounting layer ([[lesson:a13-fairness-jobs|A13]]): they move the screening tables, never the pathway." },
      { title: "Costs you set (2025 dollars)", fold: "Costs and fuel prices you set (open to change them)", fields: ["cw", "cs", "cb", "cc", "ct", "cf", "cx"], color: "var(--lx-ink-2)", hint: "Fixed ranges from prairieland.json, the same in every period." },
      { title: "Fuels and money", fold: "Fuel prices and the discount rate (open to change them)", fields: ["pg", "pl", "pc", "po", "dr"], color: "var(--lx-ink-2)", hint: "Per GJ on net calorific values; the [[discount-rate|discount rate]] is real." }];
    var C = U.controls(ctr, S, plan, groups, change);
    var pre = H("div", { class: "lx-sb-presets", role: "group", "aria-label": "Start from a preset (only the choices it names change)" }, side);
    E4.presetsOf(P).forEach(function (pr) { H("button", { class: "lx-btn ghost small", type: "button", text: pr.label, onclick: function () { change(E4.withPreset(plan, pr)); run.run(plan); } }, pre); });
    var stale = H("p", null, rh), src = H("p", { class: "e4-src", "aria-live": "polite" }), res = H("div", { class: "lx-sb-results c4-res" }, rh), ro = H("div", { class: "lx-readouts e4-ro" }), stopB = U.stopper();
    function solver() { if (!stub) return null; var k = stub; stub = null; return function () { return Promise.resolve({ status: k === "tl" ? "time-limit" : "error", ok: false, message: "solver stopped (demo)" }); }; }
    var run = LX.BenchRun(side, { label: "Run and test against four shocks", state: function () { return plan; }, results: [res, ro], stale: stale, busy: function (on) { stopB.busy(on); },
      solve: function (st, ctx) {
        var e4 = toE4(E4, P, st), rs = refState(E4, P, st), e = !forceLive && !stub ? libEntry(LIB, LX.ShareState, E4, P, st) : null, er = !forceLive && !stub ? libEntry(LIB, LX.ShareState, E4, P, rs) : null; forceLive = false;
        var sol = solver(), refP = er ? Promise.resolve({ ok: true, V: er.view }) : E4.solve(rs, P, { signal: ctx.signal, attempt: ctx.attempt, solver: sol }).then(function (r) { return r.ok ? { ok: true, V: E4.view(r.results.plan, P) } : r; });
        if (e) return refP.then(function (rf) { return rf.ok ? { status: "optimal", ok: true, kind: "lp", results: { V: e.view, X: e.shocks, Vref: rf.V, full: e.full, lib: true } } : rf; });
        return E4.shockTest(e4, P, { signal: ctx.signal, attempt: ctx.attempt, solver: sol }).then(function (r) {
          if (!r.ok) return r;
          var V = E4.view(r.results.plan, P), X = {}; Object.keys(r.results.shocks).forEach(function (k) { X[k] = E4.shockView(r.results.shocks[k], V, P); });
          return refP.then(function (rf) { return rf.ok ? { status: "optimal", ok: true, kind: "lp", results: { V: V, X: X, Vref: rf.V, lib: false } } : rf; });
        });
      },
      render: function (R, st) { last = { R: R, state: st }; draw(R, st); rn.refresh(); },
      words: { ok: "Done: the cheapest pathway for this plan, re-planned after each of the four shocks (the solver reports optimal)." } });
    stopB.attach(run);
    side.appendChild(ro); side.insertBefore(ss.status, pre);
    var liveB = H("button", { class: "lx-btn ghost small", type: "button", text: "Solve it live", hidden: true, onclick: function () { forceLive = true; run.run(plan); } });
    side.appendChild(src); side.appendChild(liveB); side.appendChild(ss.el);
    function change(p) { plan = p; C.set(plan); ss.set(plan); run.changed(plan); rn.refresh(); }

    function draw(R, st) {
      var V = R.V, X = R.X, af = afford(V, R.Vref, st, PL, PC, A13), jb = ridgeJobs(V, st, PL, A, A13), L = V.Y.length - 1;
      R.af = af; R.jb = jb;
      src.textContent = R.lib ? "From the library: precomputed with this engine on " + LIB.date + " (the same LPs)." : "Solved in your browser just now (HiGHS: the pathway, four re-plans and the reference).";
      src.className = "e4-src" + (R.lib ? " lib" : ""); liveB.hidden = !R.lib;
      ro.innerHTML = "";
      U.readouts(V).forEach(function (x) { var d = H("div", { class: "lx-readout " + x[2] }, ro); H("span", { text: x[0] }, d); H("b", { text: x[1] }, d); });
      res.innerHTML = "";
      H("p", { class: "lx-hint e4-line", text: P.line }, res);
      var sb = H("div", { class: "e4-says" }, res);
      says(V, X, af, jb).forEach(function (s) { H("p", { class: "e4-say " + s.kind, html: LX.rich(s.text).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>") }, sb); });
      var c1 = H("div", { class: "lx-xcard lx-sb-chart" }, res); H("h3", { text: "The four shocks: your sensitivity table" }, c1);
      U.table(c1, ["Shock (model year)", "Cost to 2050, against the plan", "CO₂ 2026–2050", "Imports that year", "Peak-hour rule that year", "Not served that year"], shockRows(V, X), "c4-shocks");
      U.keys(c1, [["The rule", "builds and retirements up to the shock's year stay as planned; that year runs what was built; later years re-plan knowing the shock."], ["The shocks", shockWhat(P, P.cfg.levers.shockYear)]]);
      var c2 = H("div", { class: "lx-xcard lx-sb-chart" }, res); H("h3", { text: "Security, model year by model year" }, c2);
      U.table(c2, ["Model year", "Imports, share of primary energy", "Through the strait, PJ", "LNG, share of gas", "Oil stocks, days of crude imports", "Batteries, GWh"], V.Y.map(function (y, p) {
        var s = V.sec[p]; return [String(y), pct(V.imp[p]), kilo(s.strait), pct(s.lngShare), s.stockDays == null ? "no imports" : kilo(s.stockDays), fix(s.batteryGWh, 1)]; }), "c4-sec");
      U.keys(c2, [["Stocks", P.imports.oil.stocksDays + " days of 2025's net crude imports, held fixed (" + kilo(P.imports.oil.stocksPJ) + " PJ); the IEA's benchmark for its members is " + P.imports.oil.benchmarkDays + " days."], ["Minerals", "new batteries need refined minerals mostly from one country (lesson A21's concentration index); this plan builds " + fix(sum(V.built.battery), 1) + " GW of them."]]);
      var c3 = H("div", { class: "lx-sb-charts two" }, res);
      var c3a = H("div", { class: "lx-xcard lx-sb-chart" }, c3); H("h3", { text: "Who pays: a screening estimate" }, c3a);
      U.table(c3a, ["Household group (Prairie City's, as a stand-in)", "Change, $ a household a year", "Energy burden: 2025 → with the change"], af.rows.map(function (r) { return [r.label, (r.charge >= 0 ? "+$" : "−$") + kilo(Math.abs(r.charge)), pct(r.burden, 1) + " → " + pct(r.burdenAfter, 1)]; }), "c4-aff");
      U.keys(c3a, [["The cost", "2050's yearly energy-system cost against the 2025-policies pathway: " + sbn(af.dM) + "; households pay " + pct(af.share) + "."], ["Left out", "heat pumps, cars and boilers the households buy."], ["Screening", af.screening]]);
      var c3b = H("div", { class: "lx-xcard lx-sb-chart" }, c3); H("h3", { text: "Ridge County's jobs: a screening estimate" }, c3b);
      var j = jb.j;
      U.table(c3b, ["", "Gross", "Net of displacement"], [["Jobs lost (Ridge Station and the mines, × multiplier)", kilo(j.lostTotal), kilo(j.lostTotal)], ["New ongoing jobs (Ridge region wind and solar)", kilo(j.newPermGross), kilo(j.newPermNet)],
        ["Ongoing jobs, new less lost", kilo(j.newPermGross - j.lostTotal), kilo(j.netPerm)], ["Construction job-years", kilo(j.buildJobYears), kilo(j.buildJobYearsNet)]], "c4-jobs");
      U.keys(c3b, [["Inputs", kilo(jb.staff) + " staff at Ridge Station, " + kilo(jb.mineLost) + " mine jobs (" + kilo(jb.coalLost) + " PJ less coal in 2050), " + fix(jb.newMW / 1000, 1) + " GW of wind and solar built in the Ridge region; A13's coefficients, multiplier " + fix(st.jm, 1) + ", displacement " + st.jd + "%."], ["Job-years", "construction counts job-years; ongoing jobs are jobs held each year."]]);
      var c4 = H("div", { class: "lx-xcard lx-sb-chart" }, res); H("h3", { text: "The nation, model year by model year" }, c4); U.Map(c4, P).set(V);
      var c5 = H("div", { class: "lx-xcard lx-sb-chart" }, res); H("h3", { text: "What is open and what runs" }, c5); U.MixChart(c5, P).set(V);
      var c6 = H("div", { class: "lx-sb-charts two" }, res);
      var c6a = H("div", { class: "lx-xcard lx-sb-chart" }, c6); H("h3", { text: "CO₂ a year" }, c6a); U.Co2Chart(c6a, P).set(V);
      var c6b = H("div", { class: "lx-xcard lx-sb-chart" }, c6); H("h3", { text: "Imports against the cap" }, c6b); U.ImportChart(c6b, P).set(V);
      var c7 = H("div", { class: "lx-xcard lx-sb-chart" }, res); H("h3", { text: "Slices against full years of hours" }, c7);
      if (R.full) U.table(c7, ["Check", "Hours not served", "CO₂ against the slices", "Verdict"], R.full.map(function (c) { var ok = c.unservedMWh < 0.5 && Math.abs(c.gap) <= 0.1; return [c.year + ", " + c.weather + " weather", kilo(c.unservedHours), (c.gap >= 0 ? "+" : "") + pct(c.gap, 1), ok ? "survives" : "does not survive"]; }), "c4-full");
      else H("p", { class: "lx-hint", text: "The full-year check is precomputed for the presets only (about a minute of solving): say in your brief that it is not known for this plan." }, c7);
    }

    // ---- the brief
    var nh = document.getElementById("c4-note"); nh.innerHTML = "";
    var rn = LX.ReportNote(H("div", { class: "lx-xcard" }, nh), { id: "c4-note", code: "C4", title: "Your two-page policy brief", lede: "Your words: the recommendation, the evidence, the shocks and what would change your mind, who pays and Ridge County, and your sources. The plan, its numbers, the shock table, the assumptions and the limits come from your run.",
      fields: FIELDS,
      checks: ["link", "run", "fields", "assumptions", "sensitivity", { id: "pages", label: "Fits on two pages (about " + kilo(TWO_PAGES) + " words)", test: function (note, words) { return LX.ReportNote.countWords(LX.ReportNote.compose(note, words, FIELDS, { format: "text" })) <= TWO_PAGES; } }],
      get: function () {
        if (!last) return null;
        var R = last.R, V = R.V, st = last.state, L = V.Y.length - 1;
        var rows = [{ label: "Cost to 2050", value: bn(V.pv.total), note: "present value in 2025; supply side and every fuel bought; 2025 dollars" },
          { label: "CO₂ 2026–2050", value: kilo(V.cum) + " of " + kilo(V.budget) + " Mt" + (V.over > 0.5 ? " (" + kilo(V.over) + " Mt over)" : ""), note: "fuels burned inside Prairieland" },
          { label: "Imports, highest model year", value: pct(Math.max.apply(null, V.imp)) + " (cap " + pct(V.cap) + ")", note: "crude and LNG, share of primary energy" },
          { label: "Built 2026–2050", value: ["wind", "solar", "battery", "gasCC", "gasCT", "firm"].map(function (t) { return U.NAME[t].toLowerCase() + " " + fix(sum(V.built[t]), 1) + " GW"; }).join(", ") }]
          .concat(shockRows(V, R.X).map(function (r) { return { label: "Shock: " + r[0], value: r[1] + " cost; CO₂ " + r[2] + "; imports " + r[3] + "; peak hours " + r[4] }; }))
          .concat([{ label: "Who pays (screening)", value: "about $" + kilo(R.af.perHH) + " a household a year in " + R.af.year, note: "households pay " + pct(R.af.share) + " of the change against the 2025-policies pathway" },
            { label: "Ridge County jobs (screening)", value: kilo(R.jb.j.lostTotal) + " lost; " + kilo(R.jb.j.newPermGross) + " new ongoing gross, " + kilo(R.jb.j.newPermNet) + " net; " + kilo(R.jb.j.buildJobYears) + " construction job-years gross, " + kilo(R.jb.j.buildJobYearsNet) + " net" }]);
        return { heading: "Prairieland 2050: a pathway and its defence", made: "the Pathway Explorer's engine E4 (a linear program), on capstone C4", link: ss.url(),
          run: { ok: true, stale: !LX.ShareState.same(S, last.state, plan), text: "2030–2050, twelve slices a year, four shocks re-planned" + (R.lib ? " (from the library, " + LIB.date + ")" : "") },
          plan: E4.planRows(toE4(E4, P, st), P).filter(function (r) { return r[0] !== "Shock"; }).map(function (r) { return { label: r[0], value: r[1] }; }).concat([{ label: "Households pay", value: st.hs + "%" }, { label: "Jobs multiplier, displacement", value: fix(st.jm, 1) + ", " + st.jd + "%" }]),
          results: rows, assumptions: assumptions(st, R.af, R.jb), sensitivity: sensLine(V, R.X), limits: LIMITS };
      } });
    var mv = document.getElementById("c4-nb"); if (mv) mv.hidden = false;

    // ---- the self-check: exemplars from the default plan's library entry, and the rubric
    var ex = document.getElementById("exemplars"), exFb = ex.querySelector(".lx-fallback"); if (exFb) exFb.hidden = true;
    var d0 = LX.ShareState.defaults(S), e0 = libEntry(LIB, LX.ShareState, E4, P, d0), r0 = libEntry(LIB, LX.ShareState, E4, P, refState(E4, P, d0));
    if (e0 && r0) LX.Exemplars(H("div", { class: "lx-xcard" }, ex), exemplars(e0.view, e0.shocks, afford(e0.view, r0.view, d0, PL, PC, A13), ridgeJobs(e0.view, d0, PL, A, A13)));
    var rbh = document.getElementById("c4-rubric"); rbh.innerHTML = "";
    LX.Rubric(H("div", { class: "lx-xcard" }, rbh), { id: "c4-rubric", code: "C4", title: "Rate your brief against the rubric", competences: RUBRIC, bar: page.RUBRIC_BAR });

    // ---- the first run, once in view
    var started = false;
    function start() { if (started) return; started = true; run.run(plan); }
    if (typeof IntersectionObserver !== "undefined") {
      var io = new IntersectionObserver(function (es) { if (es.some(function (e) { return e.isIntersecting; })) { io.disconnect(); start(); } }, { rootMargin: "200px" });
      io.observe(root); io.observe(rh);
    } else start();
    rn.refresh();
    LX.demo(root, function (s) {
      started = true;
      if (s === "mid" || s === "done") { change(E4.withPreset(plan, E4.presetsOf(P)[2])); run.run(plan); return { view: "mid" }; }
      if (s === "live") { forceLive = true; run.run(plan); return { view: "mid" }; }
      if (s === "fail") { stub = "fail"; run.run(plan); return { view: "fail" }; }
      return null;
    });
  });
})();
