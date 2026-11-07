// c3-prairie-city-2040.js — C3, "Prairie City 2040: write the city's energy plan" (capstone, wave W5, 2026-11-06), on
// the City Planner's engine E3 (assets/learn/components/engine-e3.js, LX.E3; data prairie-city.json and e3-city-hub.json).
//
// The page: the brief (static), the plan (E3's C3 schema: buildings, district heat, cars, the industrial park, local
// supply, the grid, assumptions; the solar farm's site; Run the 2040 plan; the plan link), the results (against the
// $1,500M budget, cost and CO2 against 2025 for the whole city, the substations, the screening household table, jobs,
// the stakeholder panel, the sensitivity chart), the two-page plan summary (LX.ReportNote), the self-check (LX.Exemplars,
// LX.Rubric) and the sources. Every number comes from E3 and is checked by _tests/learn/test_c3-prairie-city-2040.js.
//
// Two pieces come from parallel lessons; each sits behind a clearly marked hook (search "HOOK"):
//   HOOK(A19)  wired (learn-w5-e merged, 2026-11-06): the siting step runs A19's map model (assets/learn/a19.js, LX.A19,
//              lesson-local; data a19-gis-siting.json, read through A19.withCity with prairie-city.json): the five best
//              solar blocks by A19's default weights, each with a least-cost line to a transmission substation (S1 to S4,
//              not the districts' substations), its access road, its land and its capacity factor, in 2025 dollars. The
//              chosen site enters the plan as state.siteInfo = { connectUSD, cfK } (siteInfo below); a farm is at most
//              A19's 150 MW block. G-GIS: the only siting here is a solar farm.
//   HOOK(A13)  wired (learn-w5-b merged, 2026-11-06): the household table's money and burden come from lesson A13's
//              accounting layer (LX.A13.allocate, through E3.households) and the jobs from LX.A13.jobs with A13's
//              coefficients (data/a13-fairness-jobs.json); both are screening estimates and say so.
// Prairie City is fictional; its numbers are illustrative.
(function () {
  "use strict";
  // ---------------------------------------------------------------- pure (Node: the test reads it)
  function kilo(v) { var r = Math.round(v); return (r < 0 ? "−" : "") + Math.abs(r).toLocaleString("en-US"); }
  function mil(v) { var x = Math.round(v / 1e5) / 10; return (x < 0 ? "−$" : "$") + Math.abs(x).toFixed(1).replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "M"; }
  function smil(v) { return (v > 0 ? "+" : "") + mil(v); }
  function pct1(v) { return (v * 100).toFixed(1) + "%"; }
  function pct0(v) { return Math.round(v * 100) + "%"; }
  function upTotal(R) { return R.dist.reduce(function (s, d) { return s + d.upg; }, 0); }
  function budget(R, P) { var b = P.cfg.c3.budget.def * 1e6, u = R.acc.upfrontTotal; return { budget: b, upfront: u, within: u <= b + 0.5, left: b - u }; }
  function co2Cut(R) { var A0 = R.base.acc; return (A0.city.co2 - R.acc.city.co2) / A0.city.co2; }
  // the stakeholder panel: each reacts to the run by a stated rule (thresholds set for teaching); v: yes, part or no
  var PANEL = [
    { key: "council", name: "City council", note: "holds the budget", rule: "Yes within the budget; no above it." },
    { key: "utility", name: "The electric utility", note: "builds the substations", rule: "Yes up to 20 MW of upgrades; partly up to 60 MW; no above." },
    { key: "advocates", name: "Low-income advocates", note: "speak for homes below 80% of area median income", rule: "Yes if their burden falls; partly if it rises by under 0.3 points; no above." },
    { key: "climate", name: "Climate group", note: "wants deep cuts", rule: "Yes for a 35% cut in the city's CO₂ or more; partly from 15%; no below." },
    { key: "park", name: "Industrial park", note: "food plants and the fertilizer plant", rule: "Yes if its yearly energy and equipment cost does not rise; partly up to 10% more; no above." },
    { key: "rural", name: "Farmers and rural residents", note: "live near a solar farm's site", rule: "Yes with no farm; partly once a site is chosen on the map; the map's layers decide." }];
  function panel(R, P) {
    var b = budget(R, P), up = upTotal(R), dB = R.hh.low.burden - R.hh.low.burden0, cut = co2Cut(R), S = R.sys;
    var park = parkCost(R, P), park0 = parkCost(R.base, P), dPark = (park - park0) / park0;
    var out = {};
    out.council = b.within ? { v: "yes", t: "Within budget: " + mil(b.upfront) + " of " + mil(b.budget) + " up front." } : { v: "no", t: "Over budget: " + mil(b.upfront) + " against " + mil(b.budget) + "." };
    out.utility = up <= 20 ? { v: "yes", t: kilo(up) + " MW of substation upgrades." } : up <= 60 ? { v: "part", t: kilo(up) + " MW of upgrades: work, but doable." } : { v: "no", t: kilo(up) + " MW of upgrades by 2040 is a lot of new substation work." };
    out.advocates = dB <= 0 ? { v: "yes", t: "Burden " + pct1(R.hh.low.burden0) + " → " + pct1(R.hh.low.burden) + " (screening)." } : dB < 0.003 ? { v: "part", t: "Burden up slightly, " + pct1(R.hh.low.burden0) + " → " + pct1(R.hh.low.burden) + " (screening)." } : { v: "no", t: "Burden up, " + pct1(R.hh.low.burden0) + " → " + pct1(R.hh.low.burden) + " (screening)." };
    out.climate = cut >= 0.35 ? { v: "yes", t: "The city's CO₂ down " + pct0(cut) + "." } : cut >= 0.15 ? { v: "part", t: "Down " + pct0(cut) + ": not deep enough." } : { v: "no", t: "Down only " + pct0(Math.max(0, cut)) + "." };
    out.park = dPark <= 0 ? { v: "yes", t: "Its yearly cost " + smil(park - park0) + "." } : dPark <= 0.1 ? { v: "part", t: "Its yearly cost " + smil(park - park0) + " (" + pct0(dPark) + ")." } : { v: "no", t: "Its yearly cost " + smil(park - park0) + " (" + pct0(dPark) + ")." };
    var si = S.siteAdj;
    out.rural = S.farm > 0 ? { v: "part", t: kilo(S.farm) + " MW at site " + S.site + (si && si.acres ? ", " + si.where + " of the centre, on about " + kilo(si.acres) + " acres of farmland." : ".") } : { v: "yes", t: "No solar farm, no land used." };
    return PANEL.map(function (p) { return { key: p.key, name: p.name, note: p.note, cell: out[p.key] }; });
  }
  // the park's yearly energy and equipment cost (2025 dollars): electricity at the industrial price, gas, its new equipment
  function parkCost(R, P) {
    var S = R.sys || R, el = P.out.foodEl + P.out.fertEl + (S.c3 ? (S.ihpElMW + S.elyMW) * 8760 : 0);
    var gas = P.out.foodGas + P.out.fertGas - (S.c3 ? S.ihp * P.out.lowHeat / P.out.burner + S.ely * P.out.fertGas : 0);
    var eq = R.acc ? (R.acc.money.ihp || 0) + (R.acc.money.ely || 0) : 0;
    return el * P.price.ind + gas * P.price.gasInd + eq;
  }
  // HOOK(A19): the solar farm's candidate sites from A19's map model, and what a chosen site adds to the plan
  function siteModel(A19, D, cft) {
    var R = A19.build(D, {}), c = A19.cfg(D, "solar"), X = A19.exclude(R, D, "solar", c), CR = A19.criteria(R, D, "solar", c);
    var BL = A19.blocks(R, D, "solar", c, X, CR), top = A19.sites(R, D, "solar", c, 5, X, CR, BL);
    var Pp = A19.paths(R, D, A19.surface(R, D, { protected: "forbid" }), A19.needMW(D, "solar", c));
    var costs = top.map(function (st) { return A19.cost(R, D, "solar", st, c, Pp, cft); });
    return { A19: A19, R: R, D: D, c: c, X: X, suit: A19.suitability(R, D, "solar", c), top: top, costs: costs, mw: D.types.solar.mw, cft: cft };
  }
  // a site for a farm of farmMW: the line to the substation and the access road as A19 costs them for its block (the
  // same at any size up to the block's), the land in proportion to the farm's MW; cfK = the site's capacity factor over
  // EIA's 2025 average (E3 scales the farm's hourly output by it)
  function siteInfo(M, id, farmMW) {
    if (!M) return null;
    var k = M.top.map(function (t) { return t.id; }).indexOf(id); if (k < 0) return null;
    var co = M.costs[k], t = M.top[k], f = farmMW / M.mw;
    return { id: id, connectUSD: co.connect + co.road + co.land * f, cfK: co.cf / M.cft.solar, cf: co.cf, line: co.connect, road: co.road, land: co.land * f,
      acres: co.acres * f, km: co.route ? co.route.km : null, sub: co.sub, where: M.A19.place(M.R, t.i, t.j, t.k), score: t.score };
  }
  // HOOK(A13), wired (learn-w5-b merged, 2026-11-06): jobs by lesson A13's model (LX.A13.jobs) with A13's coefficients
  // (data/a13-fairness-jobs.json, `jobs`: the reader can change them on A13's page; here at their defaults). Building:
  // job-years from all the plan's up-front spending, the share spent locally times A13's job-years per $M, times the
  // multiplier, over the 15 years 2026 to 2040. Permanent: the wind and solar farms' upkeep jobs per 100 MW (gross), and
  // net of displacement. Other equipment's upkeep jobs are not counted. Nothing retires in this plan (no jobs lost).
  function jobs(R, A13, Jd) {
    if (!A13 || !Jd || !R) return null;
    var c = { staff: 0, mineJobs: 0, multiplier: Jd.multiplier.start, localShare: Jd.localShare, jobYearsPerM: Jd.jobYearsPerM.start,
      displacement: Jd.displacement.start / 100, horizonYears: Jd.horizonYears, buildYears: 15 };
    var b = A13.jobs(Object.assign({}, c, { newMW: R.acc.upfrontTotal / 1e6, capexPerKW: 1000, omPer100MW: 0 }));   // capexM = up front, $M
    var mw = (R.sys.wind || 0) + (R.sys.farm || 0), o = A13.jobs(Object.assign({}, c, { newMW: mw, capexPerKW: 0, omPer100MW: Jd.omPer100MW.start }));
    return { jobYears: b.buildJobYears, perYear: b.buildJobsAvg, permGross: o.newPermGross, permNet: o.newPermNet, mw: mw, c: c, omPer100MW: Jd.omPer100MW.start,
      note: "Building " + Math.round(c.localShare * 100) + "% of the up-front spending locally at " + c.jobYearsPerM + " job-years per $M, times " + c.multiplier +
        "; permanent: " + Jd.omPer100MW.start + " jobs per 100 MW of wind and solar, times " + c.multiplier + ", less " + Math.round(c.displacement * 100) + "% displacement. Other equipment's upkeep not counted; nothing retires.",
      screening: A13.SCREENING, assume: A13.ASSUME.jobs };
  }
  // the sensitivity: the plan held fixed, one input at a time (re-solved where the LP depends on it)
  var SENS = [{ key: "upc", label: "Upgrade cost", unit: "$/kW", solve: true }, { key: "av", label: "Value of a contract MWh", unit: "$/MWh" },
    { key: "rc", label: "Retrofit cost", unit: "$/home" }, { key: "dhc", label: "Network cost", unit: "$/home" }, { key: "save", label: "Heat a retrofit saves", unit: "%", solve: true }];
  function sensWords(base, rows) {
    return "Yearly cost against 2025 is " + mil(base) + " for this plan; " + rows.map(function (r) { return r.label.toLowerCase() + " " + r.loText + " to " + r.hiText + ": " + mil(r.atLo) + " to " + mil(r.atHi); }).join("; ") + " (the plan held fixed).";
  }
  // the reference plan of the exemplars (within the budget) and the two notes on it, written from a precomputed run
  var REF_PLAN = { hp: 70, ret: 10, dh: 0, dhp: 0, sto: 0, ev: 40, evm: "managed", pv: 0, bat: 30, ihp: 100, ely: 0, wind: 200, farm: 100, site: "B" };
  function exemplars(x) {
    // x: { upfront, budget, dCost, co2, cut, up, worst, burden0, burden, objectors: [names] } from a run of REF_PLAN
    return { title: "Two summaries of the same brief", task: "Recommend Prairie City's 2040 energy plan within the budget, and say who gains and who pays.", id: "c3-ex", lines: true,
      answers: [
        { key: "weak", label: "Weak summary", level: "Developing", parts: ["Prairie City should ", { text: "go green with heat pumps and wind", note: "No sizes, no shares, no budget: the council cannot check or cost it." }, ". ",
          { text: "Emissions will fall a lot", note: "By how much, on what boundary, against which year?" }, " and ", { text: "everyone will save money", note: "Who? The household table is a screening estimate with an adoption rule; name the groups and the numbers." }, ". ",
          { text: "Some people objected but the plan is the best", note: "Each objection needs an answer: what you would change, or why you would not." }, "."] },
        { key: "good", label: "Strong summary", level: "Proficient", parts: [
          "Recommendation: ", { text: "switch 70% of furnaces and resistance heat to heat pumps, retrofit 10% of buildings, make 40% of cars electric with managed charging, add 30 MW of substation batteries, move the food plants' low-temperature heat to heat pumps, and contract 200 MW of wind and a 100 MW solar farm at site B", note: "Every lever with its size: a plan the council can cost and check." }, ".\n",
          "Budget and cost: ", { text: mil(x.upfront) + " up front against " + mil(x.budget) + "; the city's yearly cost " + smil(x.dCost) + " against 2025 (energy bills plus equipment as yearly payments, 2025 dollars)", note: "Up front and yearly kept apart, on one boundary." }, ".\n",
          "CO₂ and the grid: ", { text: "the city's CO₂ " + kilo(x.co2) + " t a year, " + pct0(x.cut) + " below 2025 (location-based, operating); " + kilo(x.up) + " MW of substation upgrades, the " + x.worst + " the tightest", note: "The cut with its boundary, and where the plan needs grid room." }, ".\n",
          "Who pays (screening): ", { text: "energy burden of homes below 80% of area median income " + pct1(x.burden0) + " → " + pct1(x.burden) + ", every group adopting alike; heat pumps raise winter electricity bills while cars' fuel savings sit outside the burden", note: "The rule stated, and the estimate labelled as a screening estimate." }, ".\n",
          "Panel: ", { text: x.objectors.length ? "to " + x.objectors.join(", ") + ": a line each on what I would change and why" : "no stakeholder objects", note: "Every objection answered." }, ".\n",
          "Limits: ", { text: "2025's people and prices held to 2040, one substation per district, eight representative days, the household rule an assumption, jobs not yet estimated", note: "What the plan leaves out, so the council does not over-read it." }, "."] }],
      note: "Both summaries are illustrative. The strong one quotes this engine's numbers for one reference plan within the budget, precomputed; another plan is just as strong when its evidence supports it." };
  }
  var page = { REF_PLAN: REF_PLAN, exemplars: exemplars, siteModel: siteModel, siteInfo: siteInfo, kilo: kilo, mil: mil, smil: smil, pct1: pct1, pct0: pct0, upTotal: upTotal, budget: budget, co2Cut: co2Cut, PANEL: PANEL, panel: panel, parkCost: parkCost, SENS: SENS, sensWords: sensWords,
    GROUPS: [{ title: "Buildings", fields: ["hp", "ret"], color: "var(--lx-cc)", hint: "Heat pumps' [[coefficient-of-performance|COP]] falls on cold nights; retrofits cut the heat buildings need." },
      { title: "District heat (dense core)", fields: ["dh", "dhp", "sto"], color: "var(--lx-tier-4)", hint: "A hot-water network: a large heat pump, a gas boiler for the rest, and a heat store." },
      { title: "Cars", fields: ["ev", "evm"], color: "var(--lx-demand)", hint: "[[managed-charging|Managed charging]] moves each day's charge within the day." },
      { title: "The industrial park", fields: ["ihp", "ely"], color: "var(--lx-hyd)", hint: "Flat new loads at the park's own substation; the gas they replace is saved." },
      { title: "Local supply and storage", fields: ["pv", "bat", "wind", "farm"], color: "var(--lx-solar)", hint: "A wind contract and a solar farm count against what the city buys, hour by hour; output the city cannot use earns nothing." },
      { title: "The grid", fields: ["up", "upc"], color: "var(--lx-bad)", hint: "Each district's [[substation|substation]] carries at most its limit each hour, unless the plan buys an upgrade." },
      { title: "Assumptions you can change", fields: ["av", "save", "rc", "dhc", "rule", "rec"], color: "var(--lx-ink-2)", hint: "Set for teaching. \"Who adopts first\" and how shared costs are recovered move only the household table ([[lesson:a13-fairness-jobs|A13]])." }],
    RUBRIC: [{ id: "accounting", look: "Cost and CO₂ on one boundary (the whole city, a year, 2025 dollars); who pays and who gains named by household group, as a screening estimate." },
      { id: "uncertainty", look: "The sensitivity chart attached; the inputs that could flip the recommendation named." },
      { id: "realism", look: "What the plan leaves out: power flow inside districts, 2025's people and prices held to 2040, the household rule an assumption, the map's site data." },
      { id: "integrity", look: "Every stakeholder who objects is answered fairly, with what you would change or why you would not." },
      { id: "communication", look: "Two pages the council can act on: the recommendation first, then the evidence, the panel and the limits.",
        levels: { proficient: "a two-page plan summary with the plan link, the sensitivity chart and the stakeholder response table: the recommendation first, then the evidence (budget, cost, CO₂, the substations, who pays), the panel's objections answered, the sensitivity and the limits" } }],
    RUBRIC_BAR: "the bar for this plan summary",
    FIELDS: [{ key: "recommend", label: "Recommendation", hint: "Three or four sentences: what Prairie City should do by 2040, and why.", rows: 4, need: true, at: "top", min: 15 },
      { key: "evidence", label: "Cost, CO₂ and the grid", hint: "Two or three sentences: what the plan costs against the budget, what it cuts, and where the substations need room.", rows: 3, need: true, min: 12 },
      { key: "fairness", label: "Who pays and who gains", hint: "Two or three sentences on the household groups, with the adoption rule you assumed.", rows: 3, need: true, min: 12 },
      { key: "siting", label: "The solar farm's site", hint: "One or two sentences: which site and why, or why no farm.", rows: 2, need: true, min: 8 },
      { key: "panel", label: "Your answers to the stakeholder panel", hint: "One line for each stakeholder who objects: what you would change, or why you would not.", rows: 5, need: true, min: 15 }],
    TWO_PAGES: 1100,
    jobs: jobs };
  if (typeof module !== "undefined" && module.exports) module.exports = page;
  if (typeof window === "undefined" || !window.LX || !window.LX.E3) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H, E3 = LX.E3, U = E3.ui;
  LX.mount("c3", function (live, data, root) {
    var P = E3.prepare(data.prairie_city, data.e3_city_hub), cfg = P.cfg, S = E3.c3Schema(cfg), stub = null, last = null, sens = null;
    var rh = document.getElementById("c3-results"), fb = rh.querySelector(".lx-fallback"); if (fb) fb.hidden = true;
    H("p", { class: "lx-hint e3-line", text: P.line }, live);
    var wrap = H("div", { class: "lx-sb e3-sb" }, live);
    var ctr = H("div", { class: "lx-sb-controls" }, wrap), side = H("div", { class: "lx-sb-side" }, wrap);
    var plan;
    var ss = LX.ShareState(side, { schema: S, id: "c3-link", onLoad: function (s) { plan = s; C.set(plan); site.set(plan); run.changed(plan); rn.refresh(); } });
    plan = ss.state;
    var C = U.controls(ctr, S, plan, page.GROUPS, change);
    // ---- HOOK(A19): the siting step on A19's map (LX.A19, LX.SiteMap): the five best solar blocks, the chosen one's
    // least-cost line, and what each adds to the plan
    var SM = window.LX.A19 && data.a19_gis_siting && data.cf_targets ? page.siteModel(window.LX.A19, window.LX.A19.withCity(data.a19_gis_siting, data.prairie_city),
      { solar: data.cf_targets.targets.solar.cf, wind: data.cf_targets.targets.wind.cf }) : null;
    var site = (function () {
      var fs = H("fieldset", { class: "lx-sb-group c3-site" }, ctr); H("legend", { text: "Site the solar farm" }, fs);
      var gs = ctr.querySelectorAll("fieldset.lx-sb-group");
      if (gs.length > 6) ctr.insertBefore(fs, gs[5]);   // after "Local supply and storage", before "The grid"
      var f = S.fields.filter(function (x) { return x.id === "site"; })[0];
      H("p", { class: "lx-hint e3-ghint", html: LX.rich(SM ? "A19's screen for a " + SM.mw + " MW block: protected land, flood zones, steep slopes and setbacks left out, the rest scored ([[lesson:a19-gis-siting|A19]]). Pick one of its five best blocks; its line, road and land go into your plan." : "The siting map could not load: the sites differ only by name and change no number.") }, fs);
      var mapBox = H("div", { class: "c3-mapbox" }, fs), map = SM ? LX.SiteMap(mapBox, { R: SM.R, D: SM.D, label: "Map of the region around Prairie City with the five best solar blocks" }) : null;
      var sg = U.seg(H("div", { class: "e3-segrow" }, fs), f.label, f.values, f.names, plan.site, function (v) { var p = U.copy(plan); p.site = v; change(p); });
      var tb = H("div", { class: "c3-sites" }, fs);
      function paint(p) {
        if (!SM) return;
        var k = SM.top.map(function (t) { return t.id; }).indexOf(p.site), co = SM.costs[k];
        map.draw({ layer: "suit", suit: SM.suit, X: SM.X, sites: SM.top, sel: p.site, path: co && co.route ? co.route.cells : null, sitesKey: "Five best solar blocks, A best" });
        tb.innerHTML = "";
        U.table(tb, ["Site", "Where", "Line to", "Up front: line, road, land", "Capacity factor"], SM.top.map(function (t) {
          var x = page.siteInfo(SM, t.id, Math.max(p.farm, 10));
          return [t.id + (t.id === p.site ? " (yours)" : ""), x.where + " of the centre", x.sub + ", " + x.km.toFixed(1) + " km", mil(x.connectUSD), (x.cf * 100).toFixed(1) + "%"];
        }), "c3-sitetbl");
        H("p", { class: "lx-hint", text: "Up front for a " + kilo(Math.max(p.farm, 10)) + " MW farm (2025 dollars; the land in proportion to the MW, the line and road as A19 costs them for its block). The panels themselves are in the plan's solar-farm cost." }, tb);
      }
      paint(plan);
      return { set: function (p) { sg.set(p.site); paint(p); }, info: function (id, mw) { return page.siteInfo(SM, id, mw); } };
    })();
    var pre = H("div", { class: "lx-sb-presets", role: "group", "aria-label": "Start from a preset (only the choices it names change)" }, side);
    E3.c3presets.forEach(function (pr) { H("button", { class: "lx-btn ghost small", type: "button", text: pr.label, onclick: function () { change(E3.withPreset(plan, pr)); } }, pre); });
    var stale = H("p", null, rh), res = H("div", { class: "lx-sb-results c3-res" }, rh), ro = H("div", { class: "lx-readouts e3-ro" }), stopB = U.stopper();
    function solver() { if (!stub) return null; stub = null; return function () { return Promise.resolve({ status: "error", ok: false, message: "solver stopped (demo)" }); }; }
    function withSite(st) { var s = U.copy(st), inf = st.farm > 0 ? site.info(s.site, st.farm) : null; if (inf) s.siteInfo = inf; return s; }
    var run = LX.BenchRun(side, { label: "Run the 2040 plan", state: function () { return plan; }, results: [res, ro], stale: stale,
      busy: function (on) { stopB.busy(on); },
      solve: function (st, ctx) { return E3.solve(withSite(st), P, { signal: ctx.signal, attempt: ctx.attempt, solver: solver() }); },
      render: function (R, st) { last = { R: R, state: st }; sens = null; draw(R); rn.refresh(); },
      words: { ok: "Done: the cheapest way to run this 2040 plan over the eight representative days (the solver reports optimal)." } });
    stopB.attach(run);
    side.appendChild(ro);
    side.insertBefore(ss.status, pre);
    side.appendChild(ss.el);
    function change(p) { plan = p; C.set(plan); site.set(plan); ss.set(plan); run.changed(plan); rn.refresh(); }

    // ---- the results
    var sensHost = null;
    function draw(R) {
      ro.innerHTML = "";
      U.readouts(R).forEach(function (x) { var d = H("div", { class: "lx-readout " + x[2] }, ro); H("span", { text: x[0] }, d); H("b", { text: x[1] }, d); });
      var b = budget(R, P), bd = H("div", { class: "lx-readout " + (b.within ? "good" : "bad") }, ro); H("span", { text: "Up front against the budget" }, bd); H("b", { text: mil(b.upfront) + " of " + mil(b.budget) }, bd);
      res.innerHTML = "";
      H("p", { class: "lx-hint e3-line", text: P.line + " The plan is for 2040 with 2025's people, homes, weather and prices: only the plan changes." }, res);
      var c1 = H("div", { class: "lx-xcard" }, res); H("h3", { text: "Cost and CO₂ against 2025, the whole city" }, c1);
      U.costTable(c1, R);
      var A = R.acc, A0 = R.base.acc;
      U.table(c1, ["CO₂, t a year", "2025", "2040 plan"], [["The three districts' buildings and cars", kilo(A0.co2Hub), kilo(A.co2Hub)], ["Industrial park, data-center campus, buses, trucks and farms (less contract MWh)", kilo(A0.outside.co2), kilo(A.outside.co2)],
        { cls: "e3-tot", cells: ["The city", kilo(A0.city.co2), kilo(A.city.co2) + " (" + (co2Cut(R) >= 0 ? "−" : "+") + pct0(Math.abs(co2Cut(R))) + ")"] }], "c3-co2");
      H("p", { class: "lx-hint", text: "Up front 2026 to 2040: " + mil(b.upfront) + " (" + (b.within ? mil(b.left) + " left" : mil(-b.left) + " over") + "). Wind and solar farm output used by the city: " + kilo(A.outside.farmUse / 1000) + " GWh a year, of " + kilo(A.outside.farmGen / 1000) + " GWh made; the rest earns nothing and no CO₂ credit." }, c1);
      var c2 = H("div", { class: "lx-xcard lx-sb-chart" }, res); H("h3", { text: "The substations in their busiest hours" }, c2);
      var dv = U.DayView(c2, P), best = 0; R.dist.forEach(function (d, i) { if (d.peak / d.limit > R.dist[best].peak / R.dist[best].limit) best = i; });
      dv.set(R, { d: best, k: R.dist[best].at.k });
      U.table(c2, ["District", "Busiest hour", "Limit", "Upgrade", "1 MW more room saves a year (LP dual)"], R.dist.map(function (d) { return [d.label, kilo(d.peak) + " MW", kilo(d.limit) + " MW", kilo(d.upg) + " MW", d.value == null ? "–" : "$" + kilo(d.value)]; }), "c3-sub");
      var c3 = H("div", { class: "lx-xcard" }, res); H("h3", { text: "Who pays: a screening estimate by household group" }, c3);
      // HOOK(A13), wired: the table is E3.households, whose money and burden are LX.A13.allocate
      U.hhTable(c3, R);
      var jb = page.jobs(R, window.LX.A13, data.a13_fairness_jobs && data.a13_fairness_jobs.jobs);
      if (jb) U.table(c3, ["Jobs (screening, lesson A13's model)", "Estimate"], [["Building, 2026 to 2040", kilo(jb.jobYears) + " job-years (about " + kilo(jb.perYear) + " a year)"],
        ["Permanent, at the wind and solar farms (" + kilo(jb.mw) + " MW)", kilo(jb.permGross) + " gross, " + kilo(jb.permNet) + " net"]], "c3-jobs");
      H("p", { class: "lx-hint", text: jb ? jb.screening + " " + jb.note + " Job-years are one job for one year; permanent jobs last the farms' life." : "Jobs: lesson A13's model did not load." }, c3);
      H("p", { class: "lx-hint", text: "Not from the LP: lesson A13's accounting layer after it, with the adoption rule and the recovery design you set. Burden = home energy bills ÷ income (DOE LEAD); motor fuel apart." }, c3);
      var c4 = H("div", { class: "lx-xcard" }, res);
      LX.Stakeholders(c4, { title: "The stakeholder panel reacts", lede: "Each reacts to your run by a stated rule (set for teaching). Answer every objection in your summary.",
        cols: [{ key: "r", label: "Reaction" }, { key: "why", label: "Their rule" }],
        rows: panel(R, P).map(function (x, i) { return { key: x.key, name: x.name, note: x.note, cells: { r: x.cell, why: { t: PANEL[i].rule } } }; }) });
      var c5 = H("div", { class: "lx-xcard lx-sb-chart" }, res); H("h3", { text: "What could change the cost: one input at a time" }, c5);
      sensHost = H("div", null, c5);
      var sb = H("button", { type: "button", class: "lx-btn small", text: "Test the plan" }, c5);
      var sst = H("p", { class: "lx-hint", "aria-live": "polite" }, c5);
      sb.addEventListener("click", function () { testIt(sb, sst); });
      drawSens();
    }
    function drawSens() {
      if (!sensHost) return;
      sensHost.innerHTML = "";
      if (!sens) { H("p", { class: "lx-hint", text: "Press Test the plan: each input moves to the low and the high end of its range, the plan held fixed (the upgrade cost is re-run through the LP)." }, sensHost); return; }
      var t = LX.Tornado(sensHost, { fmt: mil, measure: "yearly cost against 2025", below: "var(--lx-good)", above: "var(--lx-bad)" });
      t.draw({ base: sens.base, rows: sens.rows, lede: "**Yearly cost against 2025:** " + mil(sens.base) + " for this plan (black line).", note: "The plan held fixed; 2025 dollars." });
    }
    function testIt(btn, st) {
      if (!last) return;
      btn.disabled = true; st.textContent = "Testing…";
      var base = last.R, s0 = last.state, rows = [], jobs = [];
      page.SENS.forEach(function (x) {
        var f = S.fields.filter(function (q) { return q.id === x.key; })[0];
        [f.min, f.max].forEach(function (v, j) {
          var s = Object.assign(U.copy(s0), {}); s[x.key] = v;
          jobs.push((x.solve ? E3.solve(withSite(s), P, {}).then(function (r) { return r.ok ? r.results : null; }) : Promise.resolve(E3.summarize(withSite(s), P, base.raw, base.base))).then(function (R2) { return { x: x, j: j, v: v, R: R2, f: f }; }));
        });
      });
      Promise.all(jobs).then(function (out) {
        if (out.some(function (o) { return !o.R; })) { st.textContent = "A test run failed; Try again."; btn.disabled = false; return; }
        page.SENS.forEach(function (x) {
          var lo = out.filter(function (o) { return o.x === x && o.j === 0; })[0], hi = out.filter(function (o) { return o.x === x && o.j === 1; })[0], fm = U.fmtOf(lo.f);
          rows.push({ label: x.label, loText: fm(lo.v), hiText: fm(hi.v), atLo: lo.R.delta.cityCost, atHi: hi.R.delta.cityCost });
        });
        sens = { base: base.delta.cityCost, rows: rows, state: s0 };
        drawSens(); st.textContent = "Tested: " + rows.length + " inputs, the plan held fixed."; btn.disabled = false; rn.refresh();
      });
    }

    // ---- the note (the two-page plan summary), with the stakeholder response table
    var nh = document.getElementById("c3-note"); nh.innerHTML = "";
    var rn = LX.ReportNote(H("div", { class: "lx-xcard" }, nh), { id: "c3-note", code: "C3", title: "Your two-page plan summary", lede: "Five parts in your own words; the plan, its numbers, the panel, the assumptions and the sensitivity come from your run.",
      fields: page.FIELDS,
      checks: ["link", "run", "fields", "assumptions", "sensitivity",
        { id: "pages", label: "Fits on two pages (about " + kilo(page.TWO_PAGES) + " words)", test: function (note, words) { return LX.ReportNote.countWords(LX.ReportNote.compose(note, words, page.FIELDS, { format: "text" })) <= page.TWO_PAGES; } },
        { id: "budget", label: "Within the $" + kilo(cfg.c3.budget.def) + "M budget, up front", test: function () { return !!last && LX.ShareState.same(S, last.state, plan) && budget(last.R, P).within; } },
        { id: "tested", label: "Sensitivity tested on this plan", test: function () { return !!sens && LX.ShareState.same(S, sens.state, plan); } },
        { id: "answered", label: "One line in your answers for each stakeholder who objects", test: function (note, words) {
          if (!last) return false; var no = panel(last.R, P).filter(function (x) { return x.cell.v !== "yes"; }).length;
          return String(words.panel || "").split(/\n+/).filter(function (l) { return l.trim().split(/\s+/).length >= 4; }).length >= no; } }],
      get: function () {
        if (!last) return null;
        var R = last.R, n = E3.note(last.state, R, P);
        n.link = ss.url(); n.run = { ok: true, stale: !LX.ShareState.same(S, last.state, plan), text: "the 2040 plan over eight representative days" };
        n.made = "the City Planner's engine E3 (a linear program), on capstone C3";
        panel(R, P).forEach(function (x) { n.results.push({ label: "Panel: " + x.name, value: LX.Stakeholders.WORD[x.cell.v], note: x.cell.t }); });
        var jb = page.jobs(R, window.LX.A13, data.a13_fairness_jobs && data.a13_fairness_jobs.jobs);
        if (jb) { n.results.push({ label: "Jobs (screening)", value: kilo(jb.jobYears) + " job-years building; " + kilo(jb.permGross) + " permanent (gross), " + kilo(jb.permNet) + " net", note: jb.note });
          n.assumptions = n.assumptions.concat(jb.assume); }
        n.sensitivity = sens && LX.ShareState.same(S, sens.state, plan) ? sensWords(sens.base, sens.rows) : null;   // the check waits for Test the plan
        return n;
      } });

    // ---- the self-check
    var ex = document.getElementById("exemplars"), exFb = ex.querySelector(".lx-fallback"); if (exFb) exFb.hidden = true;
    if (cfg.precomputed && cfg.precomputed.c3ex) LX.Exemplars(H("div", { class: "lx-xcard" }, ex), cfg.precomputed.c3ex);
    var rbh = document.getElementById("c3-rubric"); rbh.innerHTML = "";
    LX.Rubric(H("div", { class: "lx-xcard" }, rbh), { id: "c3-rubric", code: "C3", title: "Rate your summary against the rubric", competences: page.RUBRIC, bar: page.RUBRIC_BAR });

    // ---- the first run, once the plan is in view
    var started = false;
    function start() { if (started) return; started = true; run.run(plan); }
    if (typeof IntersectionObserver !== "undefined") {
      var io = new IntersectionObserver(function (es) { if (es.some(function (e) { return e.isIntersecting; })) { io.disconnect(); start(); } }, { rootMargin: "200px" });
      io.observe(root); io.observe(rh);
    } else start();
    rn.refresh();
    LX.demo(root, function (s) {
      started = true;
      if (s === "mid" || s === "done") { change(E3.withPreset(plan, E3.c3presets[1])); run.run(plan); return { view: "mid" }; }
      if (s === "fail") { stub = "fail"; run.run(plan); return { view: "fail" }; }
      return null;
    });
  });
})();
