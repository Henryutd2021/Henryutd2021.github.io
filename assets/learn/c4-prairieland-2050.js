// c4-prairieland-2050.js — C4, "Prairieland 2050: design and defend a nation's pathway" (capstone, Modeler–Researcher), on
// the Pathway Explorer's engine E4 (assets/learn/components/engine-e4.js, LX.E4, in the bundle). Data:
// prairieland.json, e4-pathways.json, the precomputed library e4-library.json, a13-fairness-jobs.json (A13's coefficients
// and Ridge County) and prairie-city.json (its five household groups, a stand-in for Prairieland's households).
//
// The page: the brief; the plan (the engine's levers and C4's screening inputs; one run solves the pathway, re-plans it
// after each of C4's four shocks and solves the "policies as in 2025" reference with the same costs); the results (what
// the run says, the shock table, security, screening affordability and Ridge County's jobs from LX.A13, the map, the mix,
// CO2 and imports, the full-year check from the library when the plan is a preset); the two-page policy brief
// (LX.ReportNote); the self-check (exemplars, rubric); the sources. The first view (the plan on load, when it is in the
// library) is drawn from the library, labelled with its date; every run the reader starts (Run, a preset) solves in the
// browser. The full-year checks stay precomputed and follow the plan's key. Every number comes from E4, the library or
// LX.A13; _tests/learn/test_c4-prairieland-2050.js
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
  // the budget's flag and words, as the engine gives them (a run 0.4 Mt over is over): as E4.missB, cumText, overText
  function missB(V) { return V.missBudget != null ? V.missBudget : V.over > 0.5; }
  function cumOf(V) { return missB(V) && V.over1 != null && V.over1 < 10 ? fix(V.cum1, 1) : kilo(V.cum); }
  function overOf(V) { var o = V.over1 != null ? V.over1 : V.over; return o >= 0.05 ? (o < 10 ? fix(o, 1) : kilo(V.over)) + " Mt" : "under 0.1 Mt"; }
  // the four shocks as rows, and the brief's sensitivity line
  // the four shocks as rows; a plan without the peak-hour rule has its stress hours "not tested", never "met"
  function shockRows(V, X) {
    return Object.keys(X).map(function (k) { var x = X[k], y = V.Y.indexOf(x.year);
      return [x.label + " (" + x.year + ")", sbn(x.dPV), cumOf(x) + " Mt" + (missB(x) ? " (" + overOf(x) + " over)" : ""), pct(x.imp[y]) + ((x.missCap ? x.missCap[y] : x.capOver[y] > 0.5) ? " (above the cap)" : ""),
        x.rule === null ? "not tested (rule off)" : x.reserveShort[y] > 0.5 ? kilo(x.reserveShort[y]) + " MW short" : "met", x.unserved[y] > 0.005 ? fix(x.unserved[y], 2) + " TWh" : "none"]; });
  }
  // the brief's sensitivity, one result a sentence (cost, carbon, imports and the peak hours apart)
  function sensLines(V, X) {
    var ks = Object.keys(X), d = ks.map(function (k) { return X[k].dPV; }), worst = ks[d.indexOf(Math.max.apply(null, d))], lab = function (k) { return X[k].label.toLowerCase(); };
    var over = ks.filter(function (k) { return missB(X[k]); }), short = ks.filter(function (k) { return max(X[k].reserveShort) > 0.5; }), cap = ks.filter(function (k) { return X[k].missCap ? X[k].missCap.some(Boolean) : sum(X[k].capOver) > 0.5; }), off = ks.some(function (k) { return X[k].rule === null; });
    return ["Cost: against the four shocks, each re-planned from its year, the cost to 2050 moves by " + sbn(Math.min.apply(null, d)) + " to " + sbn(Math.max.apply(null, d)) + ", most for the " + lab(worst) + ".",
      "Carbon: the budget is " + (over.length ? "missed under the " + over.map(lab).join(" and the ") : "met under all four") + ".",
      "Imports: " + (cap.length ? "above the cap under the " + cap.map(lab).join(" and the ") : "within the cap under all four") + ".",
      "Peak hours: " + (off ? "not tested, the peak-hour rule is off." : short.length ? "short of the rule in the shock's year under the " + short.map(lab).join(" and the ") + "." : "the rule is met under all four.")];
  }
  function sensLine(V, X) { return sensLines(V, X).join(" "); }
  function max(a) { var m = 0; for (var i = 0; i < a.length; i++) m = Math.max(m, a[i] || 0); return m; }
  function says(V, X, af, jb) {
    var out = [], L = V.Y.length - 1;
    out.push({ kind: missB(V) ? "bad" : "good", text: "**Cost and carbon:** " + bn(V.pv.total) + " to 2050 (present value); CO₂ 2026–2050 " + cumOf(V) + " Mt against " + kilo(V.budget) + " Mt" + (missB(V) ? ", " + overOf(V) + " over: out of reach with these levers, and this is the closest pathway." : ".") });
    out.push({ kind: "", text: "**Security:** imports at most " + pct(Math.max.apply(null, V.imp)) + " of primary energy (cap " + pct(V.cap) + "); crude and LNG through the strait " + kilo(V.sec[L].strait) + " PJ in 2050; " + (V.sec[L].stockDays == null ? "no crude imported in 2050." : "oil stocks cover " + kilo(V.sec[L].stockDays) + " days of 2050's crude imports.") });
    sensLines(V, X).forEach(function (t, i) { out.push({ kind: "warn", text: (i ? "" : "**Shocks.** ") + t }); });
    out.push({ kind: "", text: "**Affordability (screening):** " + af.year + "'s yearly energy cost is " + sbn(af.dM) + " against the 2025-policies pathway's; at " + pct(af.share) + " paid by households, about $" + kilo(af.perHH) + " a household a year (" + (af.perHH >= 0 ? "a cost" : "a saving") + "), laid on 2025's households. Heat pumps and cars bought are not in it." });
    out.push({ kind: "", text: "**Ridge County (screening):** " + kilo(jb.j.lostTotal) + " jobs lost (Ridge Station and the mines, with the multiplier) against " + kilo(jb.j.newPermGross) + " new ongoing jobs (" + kilo(jb.j.newPermNet) + " net of displacement), if all the Ridge region's new wind and solar is in the county." });
    out.push({ kind: "", text: "**Construction:** " + kilo(jb.j.buildJobYears) + " job-years (" + kilo(jb.j.buildJobYearsNet) + " net), under the same assumption: an upper bound for the county." });
    return out;
  }
  // the brief's assumptions, one sentence each, generated from the plan as run (the accounting, the peak-hour
  // rule, the household share, the county's jobs and the full-year status follow the plan, never a fixed sentence).
  // V: the plan's view; full: the library's full-year checks or null
  var ACC = { linear: "the budget counts 2025 twice and the model years with straight lines between (weights 2, 5, 5, 5, 5, 3)", step: "the budget counts each model year for the five years ending in it (weights 0, 5, 5, 5, 5, 5): 2025 not at all" };
  function fullStatus(full, E4) {
    if (!full) return "Full-year check: not known for this plan (it is precomputed for the presets only).";
    // the two kinds of check counted apart: both tests where the slice run had marginal values; demand served only where
    // its window missed a limit (CO2 not compared)
    var cmp = full.filter(function (c) { return c.fuelAt !== "price"; }), pr = full.filter(function (c) { return c.fuelAt === "price"; }), okN = function (a) { return a.filter(function (c) { return E4.fullVerdict(c).ok; }).length; };
    var parts = [];
    if (cmp.length) parts.push(okN(cmp) + " of " + cmp.length + " pass, all demand served and CO₂ within 10% of the slices (a teaching tolerance)");
    if (pr.length) parts.push(okN(pr) + " of " + pr.length + " serve all demand, CO₂ not compared (the run missed a limit)");
    return "Full-year check (2030 and 2050, two weathers): " + parts.join("; ") + "; it does not test the budget.";
  }
  function assumptions(st, af, jb, V, full, E4) {
    var hh = A13split(af);
    return ["Prairieland and Ridge County are fictional; their numbers are illustrative.", "2025 dollars; costs are fixed ranges the plan sets, the same in every period, whatever is built.",
      "The cost counts the existing wind, solar and batteries' fixed O&M while they are open.", "The data give no fixed O&M for existing hydro and the steady plants, so their upkeep is left out (the same in every pathway).",
      "An existing plant leaves the plan in the five-year period that contains its retirement year: a conservative simplification.",
      "Twelve time slices of 2025's weather stand for each model year; the peak net-load day and the scarce-wind week get their own average day and night, not their hourly sequence.",
      st.rm === "off" ? "No peak-hour rule: the stress hours were not tested." : "A peak-hour rule at two stress hours of 2025, each region's load plus " + { r0: "0%", r10: "10%", r20: "20%" }[st.rm] + ".",
      "CO₂: fuels burned inside Prairieland at the IPCC's factors; " + ACC[st.acc] + ".",
      "Electrification follows the plan; end-use equipment (heat pumps, cars, boilers) is left out of every cost.",
      "Operating shocks (the gas-price spike, the drought, the demand surprise) keep the plan's builds through their year, which runs what was built; later years re-plan.", "The mineral restriction raises a purchase price: decisions through the year before it are kept, and its year's batteries are bought again at its price.",
      "Affordability: households pay " + pct(af.share) + " of the change in 2050's yearly cost against the 2025-policies pathway, " + { kwh: "per kWh", fixed: "as a fixed charge", income: "in proportion to income" }[af.design] + "; Prairie City's five groups stand in for Prairieland's households.",
      "That 2050 difference is laid on 2025's households: their income, spending and electricity use stay at 2025's, so the burden is a screening comparison, not a forecast for 2050."]
      .concat(hh).concat(["Ridge County: mine jobs scale with coal mined at A13's ratio (" + fix(jb.perPJ, 2) + " jobs per PJ).",
        "New jobs come from all the wind and solar built in the Ridge region, assumed to be in Ridge County: an upper bound for the county.", "Jobs use A13's coefficients, a multiplier of " + fix(st.jm, 1) + " and " + st.jd + "% displacement."]).concat(jb.assume)
      .concat([fullStatus(full, E4)]);
  }
  // A13's household assumptions, with its first ("the plan's yearly cost is recovered in full from households") replaced
  // by the share C4 sets: C4 allocates only the households' share
  function A13split(af) {
    return ["The households' share (" + pct(af.share) + ") is spread in full over the household groups; the rest of the change is outside this screening."].concat(af.assume.filter(function (x) { return !/recovered in full from households/.test(x); }));
  }
  var LIMITS = ["A teaching model: no power flow, outages or reserves within the hour; adequacy is not judged from slices (A5).", "No clean fuels for the oil and gas that stay: deep budgets are out of its reach.",
    "Perfect foresight is a benchmark; real decisions are made decade by decade by many actors.", "Affordability and jobs are screening estimates from an accounting layer, not outputs of the LP."];
  var FIELDS = [{ key: "recommend", label: "Recommendation", hint: "Three or four sentences: the pathway Prairieland should take to 2050, and why.", rows: 4, need: true, at: "top", min: 15 },
    { key: "evidence", label: "Cost, carbon and security", hint: "Two or three sentences: the cost, CO₂ against the budget, imports against the cap.", rows: 3, need: true, min: 12 },
    { key: "uncertainty", label: "Shocks and what would change the recommendation", hint: "Two or three sentences: what the four shocks did, and which result would make you choose differently.", rows: 3, need: true, min: 12 },
    { key: "fairness", label: "Who pays, and Ridge County", hint: "Two or three sentences: households (a screening estimate, with your share and design) and Ridge County's jobs, gross and net.", rows: 3, need: true, min: 12 },
    { key: "notebook", label: "M13's notebook on your pathway", hint: "Paste the lines its section 8 printed for your plan (cost, CO₂, imports, what it builds) and say whether they match the page.", rows: 3, need: true, min: 8 },
    { key: "sources", label: "Sources and credit", hint: "One or two sentences: the data behind your numbers (EIA, IPCC, SPP through EIA-930; the course's teaching settings) and any conflict of interest.", rows: 2, need: true, min: 8 }];
  var TWO_PAGES = 1100;
  var APPENDIX = "Appendix: evidence from the run";   // the run's evidence comes after the learner's two pages, under this heading
  var LINK_BASE = "c4-prairieland-2050.html#";   // this page, for the exemplar's plan link (relative, as the course's links are)
  // the two-page check counts the learner's own writing (the brief's fields); the plan, results, assumptions and limits
  // the page adds are not counted (about 1,000 words on their own)
  function ownWords(words, countWords) { var t = 0; FIELDS.forEach(function (f) { t += countWords((words || {})[f.key] || ""); }); return t; }
  var RUBRIC = [{ id: "accounting", look: "Cost and CO₂ on one boundary (the nation, 2026–2050, 2025 dollars, fuels burned inside Prairieland); imports against the cap; affordability and jobs as screening estimates, gross and net kept apart." },
    { id: "uncertainty", look: "All four shocks reported as ranges, with the rule for what was kept; the result that would change the recommendation named.",
      levels: { proficient: "the four shocks re-planned on this plan and reported (cost, budget, imports, the peak-hour rule), the range stated, and the shock or assumption that would flip the recommendation named" } },
    { id: "realism", look: "What the model leaves out: equipment costs, clean fuels, foresight, outages; whether the full-year check is known for this plan." },
    { id: "communication", look: "Two pages a minister can act on: the recommendation first, then the evidence, the shocks, who pays, Ridge County and the limits; the notebook's run of the same pathway.",
      levels: { proficient: "a two-page policy brief with the pathway link and the notebook's run of the same plan: the recommendation first, then cost, carbon and security, the shocks with their range, who pays and Ridge County (gross and net), and the limits" } }];
  // a weak and a strong brief for the same plan (numbers from that plan's run; Vs: the security-first preset's run, for
  // the trade-off). The strong one meets its own rubric: every lever with its size, the reason against
  // another pathway, the result that would change it, the screening assumptions and the limits
  // the line M13's notebook prints for a plan (its show()), from the plan's view: the hand-in's evidence
  function nbLine(V) { return "cost to 2050 $" + fix(V.pv.total / 1000, 1) + " billion (present value); CO2 2026-2050 " + kilo(V.cum) + " Mt"; }
  function exemplars(V, X, af, jb, Vs, st, full, E4, link) {
    var sMiss = Vs.capOver.map(function (x, p) { return x > 0.5 ? V.Y[p] : null; }).filter(Boolean);
    var b = function (t) { return fix(sum(V.built[t]), 1); }, X2 = X[Object.keys(X).reduce(function (a, k) { return X[k].dPV > X[a].dPV ? k : a; })];
    var ok = full ? full.filter(function (c) { return E4.fullVerdict(c).ok; }).length : null, gap = full ? Math.max.apply(null, full.map(function (c) { return c.gap; })) : null;
    return { title: "Two briefs on the same pathway", task: "Recommend Prairieland's pathway to 2050 and defend it against shocks, for a minister.", id: "c4-ex", lines: true,
      answers: [{ key: "weak", label: "Weak brief", level: "Developing", parts: ["Prairieland ", { text: "should go renewable", note: "No sizes or years: what is built, where, and when?" }, ". ", { text: "It meets the climate goal", note: "Which budget, on what boundary, by how much?" }, " and ",
          { text: "is secure", note: "Against what? Imports, the strait, the peak hours: name the measure and the shocks." }, ". ", { text: "Ridge County will be fine", note: "Jobs lost and gained, gross and net, with the coefficients stated." }, "."] },
        { key: "good", label: "Strong brief", level: "Proficient", parts: ["Recommendation: ", { text: "follow the central pathway: by 2050 build " + b("wind") + " GW of wind, " + b("solar") + " GW of solar, " + fix(sum(V.built.gasCC) + sum(V.built.gasCT), 1) + " GW of gas, " + b("battery") + " GW of batteries and " + b("firm") + " GW of the generic firm option, and widen links by " + fix(sum(V.txAdd), 1) + " GW", note: "Every lever with its size." }, ".\n",
          "Why this one: ", { text: "a security-first plan (imports at most " + pct(Vs.cap) + ") costs " + bn(Vs.pv.total - V.pv.total) + " more" + (sMiss.length ? " and still cannot meet its cap in " + sMiss.join(" and ") : ""), note: "A reason against another pathway, from a second run." }, ".\n",
          "Cost and carbon: ", { text: bn(V.pv.total) + " to 2050 (present value, 2025 dollars, supply side and every fuel); CO₂ " + kilo(V.cum) + " of " + kilo(V.budget) + " Mt", note: "One boundary, the budget's arithmetic stated." }, ".\n",
          "Security: ", { text: "imports at most " + pct(Math.max.apply(null, V.imp)) + " of primary energy against a " + pct(V.cap) + " cap", note: "A measure and its limit." }, ".\n",
          "Shocks: ", { text: sensLines(V, X)[0].replace(/\.$/, ""), note: "All four, re-planned from their years, as a range." }, ".\n",
          "Under the shocks: ", { text: sensLines(V, X).slice(1).join(" ").replace(/\.$/, ""), note: "The budget, the cap and the peak-hour rule under the same four." }, ".\n",
          "What would change it: ", { text: "the " + X2.label.toLowerCase() + " costs most (" + sbn(X2.dPV) + ")" + (X2.rule !== null && X2.reserveShort[V.Y.indexOf(X2.year)] > 0.5 ? " and leaves the stress hours " + kilo(X2.reserveShort[V.Y.indexOf(X2.year)]) + " MW short in " + X2.year : "") + "; if it looked likely, I would build more firm capacity before " + X2.year, note: "The result that would change the recommendation, named." }, ".\n",
          "Who pays (screening): ", { text: "about $" + kilo(af.perHH) + " a household a year in " + af.year + " if households pay " + pct(af.share) + "; equipment not counted", note: "A screening estimate with its share and what it leaves out." }, ".\n",
          "Ridge County (screening): ", { text: kilo(jb.j.lostTotal) + " jobs lost against " + kilo(jb.j.newPermGross) + " new ongoing jobs (" + kilo(jb.j.newPermNet) + " net), with a multiplier of " + fix(st.jm, 1) + ", " + st.jd + "% displacement and all the Ridge region's new wind and solar in the county", note: "Gross and net kept apart; the multiplier, displacement and the county assumption stated." }, ".\n",
          "Evidence: ", { text: "the plan link, " + link + "; M13's notebook on the same plan prints \u201c" + nbLine(V) + "\u201d, the page's numbers", note: "The link and the notebook's run, as the hand-in asks." }, ".\n",
          "Limits: ", { text: "twelve slices, no clean fuels for the oil and gas that stay, perfect foresight" + (full ? "; the full-year check passes " + ok + " of " + full.length + ", with CO₂ up to " + pct(gap, 0) + " above the slices, and does not test the budget" : "; the full-year check is not known for this plan"), note: "What the model leaves out, and what the checks do and do not show." }, "."] }],
      diff: [{ label: "Sizes", weak: "none", good: "every lever" }, { label: "Boundary", weak: "none", good: "stated" }, { label: "Shocks", weak: "none", good: "all four, a range" }, { label: "Reversal", weak: "none", good: "named" }, { label: "Jobs", weak: "none", good: "gross and net" }],
      note: "Both briefs are illustrative; the strong one quotes the default plan's run. Other recommendations reach Proficient with equally sound reasoning." };
  }
  var page = { c4Schema: c4Schema, toE4: toE4, libEntry: libEntry, refState: refState, afford: afford, ridgeJobs: ridgeJobs, shockRows: shockRows, sensLine: sensLine, sensLines: sensLines, says: says, assumptions: assumptions, fullStatus: fullStatus, ACC: ACC, LIMITS: LIMITS,
    FIELDS: FIELDS, TWO_PAGES: TWO_PAGES, APPENDIX: APPENDIX, ownWords: ownWords, RUBRIC: RUBRIC, RUBRIC_BAR: "the bar for this policy brief", exemplars: exemplars, nbLine: nbLine, LINK_BASE: LINK_BASE, missB: missB, cumOf: cumOf, overOf: overOf, kilo: kilo, fix: fix, pct: pct, bn: bn, sbn: sbn };
  if (typeof module !== "undefined" && module.exports) module.exports = page;
  if (typeof window === "undefined" || !window.LX || !window.LX.E4) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H, E4 = LX.E4, U = E4.ui, A13 = LX.A13;
  LX.mount("c4", function (live, data, root) {
    var P = E4.prepare(data.prairieland, data.e4_pathways), A = data.a13_fairness_jobs, PC = data.prairie_city, LIB = data.e4_library, PL = data.prairieland;
    var S = c4Schema(E4, P, A), stub = null, first = false;
    var rh = document.getElementById("c4-results"), fb = rh.querySelector(".lx-fallback"); if (fb) fb.hidden = true;
    H("p", { class: "lx-hint e4-line", text: P.line }, live);
    var wrap = H("div", { class: "lx-sb e4-sb" }, live), ctr = H("div", { class: "lx-sb-controls" }, wrap), side = H("div", { class: "lx-sb-side" }, wrap);
    var plan, last = null;
    var ss = LX.ShareState(side, { schema: S, id: "c4-link", onLoad: function (s) { plan = s; C.set(plan); run.changed(plan); rn.refresh(); } });
    plan = ss.state;
    var groups = [{ title: "Demand and electrification", fields: ["dem", "eb", "et", "ei"], color: "var(--lx-demand)", hint: "Electricity's share of each sector's [[useful-energy|useful energy]] in 2050; end-use equipment costs are left out." },
      { title: "The limits you set", fields: ["bud", "acc", "cap", "rm"], color: "var(--lx-bad)", hint: "A [[carbon-budget|cumulative carbon budget]], an import cap in every model year, and a peak-hour rule: at two hard hours of 2025's weather, available capacity must cover each region's load plus the margin you pick.",
        extra: function (fs) { E4.GAP.slice(0, 2).forEach(function (t) { H("p", { class: "lx-hint e4-ghint", html: LX.rich(t) }, fs); }); } },
      { title: "What the model may do", fields: ["fs", "fm", "tx", "rt"], color: "var(--lx-accent)", hint: "[[perfect-foresight|Perfect foresight]] or decade by decade; the generic firm clean option; new links; early retirement." },
      { title: "Who pays and Ridge County (screening)", fields: ["hs", "rc", "jm", "jd"], color: "var(--lx-tier-4)", hint: "Inputs to the accounting layer ([[lesson:a13-fairness-jobs|A13]]): they move the screening tables, never the pathway." },
      { title: "Costs you set (2025 dollars)", fold: "Costs and fuel prices you set (open to change them)", fields: ["cw", "cs", "cb", "cc", "ct", "cf", "cx"], color: "var(--lx-ink-2)", hint: "Fixed ranges from prairieland.json, the same in every period." },
      { title: "Fuels and money", fold: "Fuel prices and the discount rate (open to change them)", fields: ["pg", "pl", "pc", "po", "dr"], color: "var(--lx-ink-2)", hint: "Per GJ on net calorific values; the [[discount-rate|discount rate]] is real." }];
    var C = U.controls(ctr, S, plan, groups, change);
    var pre = H("div", { class: "lx-sb-presets", role: "group", "aria-label": "Start from a preset (only the choices it names change)" }, side);
    E4.presetsOf(P).forEach(function (pr) { H("button", { class: "lx-btn ghost small", type: "button", text: pr.label, onclick: function () { change(E4.withPreset(plan, pr)); run.run(plan); } }, pre); });
    H("p", { class: "lx-hint e4-prehint", text: "A preset changes only the choices it names; your other settings stay." }, side);
    var stale = H("p", null, rh), src = H("p", { class: "e4-src", "aria-live": "polite" }), res = H("div", { class: "lx-sb-results c4-res" }, rh), ro = H("div", { class: "lx-readouts e4-ro" }), stopB = U.stopper();
    function solver() { if (!stub) return null; var k = stub; stub = null; return function () { return Promise.resolve({ status: k === "tl" ? "time-limit" : "error", ok: false, message: "solver stopped (demo)" }); }; }
    var run = LX.BenchRun(side, { label: "Run and test against four shocks", state: function () { return plan; }, results: [res, ro], stale: stale, busy: function (on) { stopB.busy(on); },
      solve: function (st, ctx) {
        // only the first view comes from the library; every run the reader starts solves live (the plan, four re-plans
        // and the reference)
        var e4 = toE4(E4, P, st), rs = refState(E4, P, st), lib1 = first && !stub; first = false;
        var e = lib1 ? libEntry(LIB, LX.ShareState, E4, P, st) : null, er = e ? libEntry(LIB, LX.ShareState, E4, P, rs) : null;
        var sol = solver(), refP = er ? Promise.resolve({ ok: true, V: er.view }) : E4.solve(rs, P, { signal: ctx.signal, attempt: ctx.attempt, solver: sol }).then(function (r) { return r.ok ? { ok: true, V: E4.view(r.results.plan, P) } : r; });
        // the full-year checks (precomputed) follow the plan's key whether the run is from the library or live (the same plan)
        var full = (e || libEntry(LIB, LX.ShareState, E4, P, st) || {}).full || null;
        if (e) return refP.then(function (rf) { return rf.ok ? { status: "optimal", ok: true, kind: "lp", message: E4.doneWords(e4, e.view, { four: true }) + " From the library.", results: { V: e.view, X: e.shocks, Vref: rf.V, full: full, lib: true } } : rf; });
        return E4.shockTest(e4, P, { signal: ctx.signal, attempt: ctx.attempt, solver: sol }).then(function (r) {
          if (!r.ok) return r;
          var V = E4.view(r.results.plan, P), X = {}; Object.keys(r.results.shocks).forEach(function (k) { X[k] = E4.shockView(r.results.shocks[k], V, P); });
          return refP.then(function (rf) { return rf.ok ? { status: "optimal", ok: true, kind: "lp", message: E4.doneWords(e4, V, { four: true }), results: { V: V, X: X, Vref: rf.V, full: full, lib: false } } : rf; });
        });
      },
      render: function (R, st) { last = { R: R, state: st }; draw(R, st); rn.refresh(); } });
    stopB.attach(run);
    side.appendChild(ro); side.insertBefore(ss.status, pre);
    side.appendChild(src); side.appendChild(ss.el);
    function change(p) { plan = p; C.set(plan); ss.set(plan); run.changed(plan); rn.refresh(); }

    function draw(R, st) {
      var V = R.V, X = R.X, af = afford(V, R.Vref, st, PL, PC, A13), jb = ridgeJobs(V, st, PL, A, A13), L = V.Y.length - 1;
      R.af = af; R.jb = jb;
      src.textContent = R.lib ? "The first view, precomputed with this engine on " + LIB.date + " (the same LPs). Run it, or pick a preset, to solve in your browser." : "Solved in your browser just now (HiGHS: the pathway, four re-plans and the reference).";
      src.className = "e4-src" + (R.lib ? " lib" : "");
      ro.innerHTML = "";
      U.readouts(V).forEach(function (x) { var d = H("div", { class: "lx-readout " + x[2] }, ro); H("span", { text: x[0] }, d); H("b", { text: x[1] }, d); });
      res.innerHTML = "";
      H("p", { class: "lx-hint e4-line", text: P.line }, res);
      var sb = H("div", { class: "e4-says" }, res);
      says(V, X, af, jb).forEach(function (s) { H("p", { class: "e4-say " + s.kind, html: LX.rich(s.text).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>") }, sb); });
      var c1 = H("div", { class: "lx-xcard lx-sb-chart" }, res); H("h3", { text: "The four shocks: your sensitivity table" }, c1);
      U.table(c1, ["Shock (model year)", "Cost to 2050, against the plan", "CO₂ 2026–2050", "Imports that year", "Peak-hour rule that year", "Not served that year"], shockRows(V, X), "c4-shocks");
      H("h4", { text: "What each shock changes, in the model" }, c1);
      U.table(c1, ["Shock", "When, in the model", "What changes", "What the re-plan keeps"], E4.shockTable(P), "c4-shockwhat e4-wrap");
      U.keys(c1, [["Five years", "a model year stands for five years: the gas-price spike, the drought and the mineral restriction each last one period, longer than their stories; the demand surprise lasts from 2031 to 2050."]]);
      var c2 = H("div", { class: "lx-xcard lx-sb-chart" }, res); H("h3", { text: "Security, model year by model year" }, c2);
      U.table(c2, ["Model year", "Imports, share of primary energy", "Through the strait, PJ", "LNG, share of gas", "Oil stocks, days of crude imports", "Batteries, GWh"], V.Y.map(function (y, p) {
        var s = V.sec[p]; return [String(y), pct(V.imp[p]), kilo(s.strait), pct(s.lngShare), s.stockDays == null ? "no imports" : kilo(s.stockDays), fix(s.batteryGWh, 1)]; }), "c4-sec");
      U.keys(c2, [["Stocks", P.imports.oil.stocksDays + " days of 2025's net crude imports, held fixed (" + kilo(P.imports.oil.stocksPJ) + " PJ); the IEA's benchmark for its members is " + P.imports.oil.benchmarkDays + " days."], ["Minerals", "new batteries need refined minerals mostly from one country (lesson A21's concentration index); this plan builds " + fix(sum(V.built.battery), 1) + " GW of them."]]);
      var c3 = H("div", { class: "lx-sb-charts two" }, res);
      var c3a = H("div", { class: "lx-xcard lx-sb-chart" }, c3); H("h3", { text: "Who pays: a screening estimate" }, c3a);
      U.table(c3a, ["Household group (Prairie City's, as a stand-in)", "Change, $ a household a year", "Energy burden in 2025 → with 2050's change on 2025's household"], af.rows.map(function (r) { return [r.label, (r.charge >= 0 ? "+$" : "−$") + kilo(Math.abs(r.charge)), pct(r.burden, 1) + " → " + pct(r.burdenAfter, 1)]; }), "c4-aff");
      U.keys(c3a, [["The cost", "2050's yearly energy-system cost against the 2025-policies pathway in 2050: " + sbn(af.dM) + "; households pay " + pct(af.share) + "."], ["Held at 2025", "each group's income, spending and electricity use: the 2050 difference is laid on today's households, a screening comparison, not a 2050 forecast."], ["Left out", "heat pumps, cars and boilers the households buy."], ["Screening", af.screening]]);
      var c3b = H("div", { class: "lx-xcard lx-sb-chart" }, c3); H("h3", { text: "Ridge County's jobs: a screening estimate" }, c3b);
      var j = jb.j;
      U.table(c3b, ["", "Gross", "Net of displacement"], [["Jobs lost (Ridge Station and the mines, × multiplier)", kilo(j.lostTotal), kilo(j.lostTotal)], ["New ongoing jobs (Ridge region wind and solar)", kilo(j.newPermGross), kilo(j.newPermNet)],
        ["Ongoing jobs, new less lost", kilo(j.newPermGross - j.lostTotal), kilo(j.netPerm)], ["Construction job-years", kilo(j.buildJobYears), kilo(j.buildJobYearsNet)]], "c4-jobs");
      U.keys(c3b, [["Lost", kilo(jb.staff) + " staff at Ridge Station and " + kilo(jb.mineLost) + " mine jobs (" + kilo(jb.coalLost) + " PJ less coal in 2050), × the multiplier " + fix(st.jm, 1) + "."],
        ["New", fix(jb.newMW / 1000, 1) + " GW of wind and solar built in the Ridge region, all assumed to be in Ridge County: an upper bound for the county; " + st.jd + "% displacement off the net counts."], ["Job-years", "construction counts [[job-year|job-years]]; ongoing jobs are jobs held each year."]]);
      var c4 = H("div", { class: "lx-xcard lx-sb-chart" }, res); H("h3", { text: "The nation, model year by model year" }, c4); U.Map(c4, P).set(V);
      var c5 = H("div", { class: "lx-xcard lx-sb-chart" }, res); H("h3", { text: "What is open and what runs" }, c5); U.MixChart(c5, P).set(V);
      var c6 = H("div", { class: "lx-sb-charts two" }, res);
      var c6a = H("div", { class: "lx-xcard lx-sb-chart" }, c6); H("h3", { text: "CO₂ a year" }, c6a); U.Co2Chart(c6a, P).set(V);
      var c6b = H("div", { class: "lx-xcard lx-sb-chart" }, c6); H("h3", { text: "Imports against the cap" }, c6b); U.ImportChart(c6b, P).set(V);
      var c7 = H("div", { class: "lx-xcard lx-sb-chart" }, res); H("h3", { text: "Slices against full years of hours" }, c7);
      if (R.full) {
        U.table(c7, ["Check", "Hours not served", "CO₂ against the slices", "Verdict"], R.full.map(function (c) { return [c.year + ", " + c.weather + " weather", kilo(c.unservedHours), fix(c.co2, 1) + " Mt (" + (c.gap >= 0 ? "+" : "") + pct(c.gap, 1) + ")", E4.fullVerdict(c).text]; }), "c4-full e4-wrap");
        U.keys(c7, [["Survives", "all demand served and the year's CO₂ within 10% of the slices' estimate, a tolerance set for teaching."], ["Not tested", "the cumulative budget and adequacy: the check re-runs two years' dispatch only. Your brief carries this line."]]
          .concat(R.full.some(function (c) { return c.fuelAt === "price"; }) ? [["A missed limit", "that year's run has no marginal values, so its check buys fuels at their prices and tests demand served only."]] : []));
      } else H("p", { class: "lx-hint", text: "Full-year validation unavailable for this plan: it is precomputed for the presets only (about a minute of solving). Your brief says so." }, c7);
    }

    // ---- the brief
    var nh = document.getElementById("c4-note"); nh.innerHTML = "";
    var rn = LX.ReportNote(H("div", { class: "lx-xcard" }, nh), { id: "c4-note", code: "C4", title: "Your policy brief: two pages of your writing, with its evidence", lede: "Your words fill about two pages. The plan, its numbers, the shock table, the assumptions and the limits come from your run as the brief's evidence, beyond those two pages.",
      fields: FIELDS, appendix: APPENDIX,
      checks: ["link", "run", "fields", "assumptions", "sensitivity", { id: "pages", label: "Your own writing fits on two pages (about " + kilo(TWO_PAGES) + " words); the evidence the page adds, about 1,000 words of tables and assumptions, comes on top", test: function (note, words) { return ownWords(words, LX.ReportNote.countWords) <= TWO_PAGES; } }],
      get: function () {
        if (!last) return null;
        var R = last.R, V = R.V, st = last.state, L = V.Y.length - 1;
        var rows = [{ label: "Cost to 2050", value: bn(V.pv.total), note: "present value in 2025; supply side and every fuel bought, with the existing wind, solar and batteries' upkeep; 2025 dollars" },
          { label: "CO₂ 2026–2050", value: cumOf(V) + " of " + kilo(V.budget) + " Mt" + (missB(V) ? " (" + overOf(V) + " over)" : ""), note: "fuels burned inside Prairieland" },
          { label: "Imports, highest model year", value: pct(Math.max.apply(null, V.imp)) + " (cap " + pct(V.cap) + ")", note: "crude and LNG, share of primary energy" },
          { label: "Built 2026–2050", value: ["wind", "solar", "battery", "gasCC", "gasCT", "firm"].map(function (t) { return U.NAME[t].toLowerCase() + " " + fix(sum(V.built[t]), 1) + " GW"; }).join(", ") }]
          .concat(shockRows(V, R.X).map(function (r) { return { label: "Shock: " + r[0], value: r[1] + " cost; CO₂ " + r[2] + "; imports " + r[3] + "; peak hours " + r[4] }; }))
          .concat([{ label: "Who pays (screening)", value: "about $" + kilo(R.af.perHH) + " a household a year in " + R.af.year, note: "households pay " + pct(R.af.share) + " of the change against the 2025-policies pathway" },
            { label: "Ridge County jobs (screening)", value: kilo(R.jb.j.lostTotal) + " lost; " + kilo(R.jb.j.newPermGross) + " new ongoing gross, " + kilo(R.jb.j.newPermNet) + " net; " + kilo(R.jb.j.buildJobYears) + " construction job-years gross, " + kilo(R.jb.j.buildJobYearsNet) + " net", note: "new jobs: all the Ridge region's new wind and solar assumed in the county" },
            { label: "Full-year check", value: R.full ? R.full.filter(function (c) { return E4.fullVerdict(c).ok; }).length + " of " + R.full.length + " pass" : "not known for this plan", note: "demand served and CO₂ within 10% of the slices; not a test of the budget" }]);
        return { heading: "Prairieland 2050: a pathway and its defence", made: "the Pathway Explorer's engine E4 (a linear program), on capstone C4", link: ss.url(),
          run: { ok: true, stale: !LX.ShareState.same(S, last.state, plan), text: "2030–2050, twelve slices a year, four shocks re-planned" + (R.lib ? " (from the library, " + LIB.date + ")" : "") },
          plan: E4.planRows(toE4(E4, P, st), P).filter(function (r) { return r[0] !== "Shock"; }).map(function (r) { return { label: r[0], value: r[1] }; }).concat([{ label: "Households pay", value: st.hs + "%" }, { label: "Jobs multiplier, displacement", value: fix(st.jm, 1) + ", " + st.jd + "%" }]),
          results: rows, assumptions: assumptions(st, R.af, R.jb, V, R.full, E4), sensitivity: sensLine(V, R.X), limits: LIMITS };
      } });
    var mv = document.getElementById("c4-nb"); if (mv) mv.hidden = false;

    // ---- the self-check: exemplars from the default plan's library entry, and the rubric
    var ex = document.getElementById("exemplars"), exFb = ex.querySelector(".lx-fallback"); if (exFb) exFb.hidden = true;
    var d0 = LX.ShareState.defaults(S), e0 = libEntry(LIB, LX.ShareState, E4, P, d0), r0 = libEntry(LIB, LX.ShareState, E4, P, refState(E4, P, d0)), s0 = libEntry(LIB, LX.ShareState, E4, P, E4.withPreset(d0, E4.presetsOf(P).filter(function (p) { return p.id === "secure"; })[0]));
    if (e0 && r0 && s0) LX.Exemplars(H("div", { class: "lx-xcard" }, ex), exemplars(e0.view, e0.shocks, afford(e0.view, r0.view, d0, PL, PC, A13), ridgeJobs(e0.view, d0, PL, A, A13), s0.view, d0, e0.full, E4, LINK_BASE + LX.ShareState.encode(S, d0)));
    var rbh = document.getElementById("c4-rubric"); rbh.innerHTML = "";
    LX.Rubric(H("div", { class: "lx-xcard" }, rbh), { id: "c4-rubric", code: "C4", title: "Rate your brief against the rubric", competences: RUBRIC, bar: page.RUBRIC_BAR });

    // ---- the first run, once in view
    var started = false;
    function start() { if (started) return; started = true; first = true; run.run(plan); }
    if (typeof IntersectionObserver !== "undefined") {
      var io = new IntersectionObserver(function (es) { if (es.some(function (e) { return e.isIntersecting; })) { io.disconnect(); start(); } }, { rootMargin: "200px" });
      io.observe(root); io.observe(rh);
    } else start();
    rn.refresh();
    LX.demo(root, function (s) {
      started = true;
      if (s === "mid" || s === "done") { change(E4.withPreset(plan, E4.presetsOf(P)[2])); run.run(plan); return { view: "mid" }; }
      if (s === "live") { run.run(plan); return { view: "mid" }; }
      if (s === "fail") { stub = "fail"; run.run(plan); return { view: "fail" }; }
      return null;
    });
  });
})();
