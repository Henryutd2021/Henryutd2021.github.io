// c3-prairie-city-2040.js — C3, "Prairie City 2040: write the city's energy plan" (capstone), on
// the City Planner's engine E3 (assets/learn/components/engine-e3.js, LX.E3; data prairie-city.json and e3-city-hub.json).
//
// The page: the brief (static), the plan (E3's C3 schema: buildings, district heat, cars, the industrial park, local
// supply, the grid, assumptions; the solar farm's site; Run the 2040 plan; the plan link), the results (against the
// $1,500M budget, cost and CO2 against 2025 for the whole city, the substations, the full-year check (precomputed for
// the presets and the reference plan: data/e3-full-year.json; never solved on the page), the screening household table, jobs,
// the stakeholder panel, the sensitivity chart and table: one input at a time, then all together), the answer boxes (one
// per stakeholder) and the two-page plan summary (LX.ReportNote), the self-check (LX.Exemplars,
// LX.Rubric) and the sources. Every number comes from E3 and is checked by _tests/learn/test_c3-prairie-city-2040.js.
//
// Two pieces come from parallel lessons; each sits behind a clearly marked hook (search "HOOK"):
//   HOOK(A19)  wired: the siting step runs A19's map model (assets/learn/components/siting.js,
//              LX.A19 and LX.SiteMap, in the bundle; data a19-gis-siting.json, read through A19.withCity with prairie-city.json): the five best
//              solar blocks by A19's default weights, each with a least-cost line to a transmission substation (S1 to S4,
//              not the districts' substations), its access road, its land and its capacity factor, in 2025 dollars. The
//              chosen site enters the plan as state.siteInfo = { connectUSD, cfK } (siteInfo below); a farm is at most
//              A19's 150 MW block. Siting scope: the only siting here is a solar farm.
//   HOOK(A13)  wired: the household table's money and burden come from lesson A13's
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
    { key: "climate", name: "Climate group", note: "wants deep cuts", rule: "Yes for a 35% cut in the city's location-based CO₂ or more; partly from 15%; no below. The city's wind and solar output does not count in it." },
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
  // HOOK(A13), wired: jobs by lesson A13's model (LX.A13.jobs) with A13's coefficients
  // (data/a13-fairness-jobs.json, `jobs`: the reader can change them on A13's page; here at their defaults). Building:
  // gross job-years from all the plan's up-front spending, the share spent locally times A13's job-years per $M, times
  // the multiplier, over the 15 years 2026 to 2040; net: less A13's displacement share (building work that would have
  // happened anyway), passed as buildDisplacement as A13 does (A13's option buildJobYearsNet).
  // Ongoing: the wind and solar farms' upkeep jobs per 100 MW, direct; gross supported (times the multiplier: supplier
  // and spending jobs, not all at the farms); and net of the same displacement. Other equipment's upkeep jobs are not
  // counted. Nothing retires in this plan (no jobs lost).
  function jobs(R, A13, Jd) {
    if (!A13 || !Jd || !R) return null;
    var c = { staff: 0, mineJobs: 0, multiplier: Jd.multiplier.start, localShare: Jd.localShare, jobYearsPerM: Jd.jobYearsPerM.start,
      displacement: Jd.displacement.start / 100, buildDisplacement: Jd.displacement.start / 100, horizonYears: Jd.horizonYears, buildYears: 15 };
    var b = A13.jobs(Object.assign({}, c, { newMW: R.acc.upfrontTotal / 1e6, capexPerKW: 1000, omPer100MW: 0 }));   // capexM = up front, $M
    var mw = (R.sys.wind || 0) + (R.sys.farm || 0), o = A13.jobs(Object.assign({}, c, { newMW: mw, capexPerKW: 0, omPer100MW: Jd.omPer100MW.start }));
    return { jobYears: b.buildJobYears, jobYearsNet: b.buildJobYearsNet, perYear: b.buildJobsAvg, permDirect: o.newPermDirect, permGross: o.newPermGross, permNet: o.newPermNet, mw: mw, c: c, omPer100MW: Jd.omPer100MW.start,
      note: "Construction: " + Math.round(c.localShare * 100) + "% of the up-front spending spent locally, at " + c.jobYearsPerM + " job-years per $M, times " + c.multiplier + " (gross); less " + Math.round(c.buildDisplacement * 100) + "% displacement (net). " +
        "Ongoing: " + Jd.omPer100MW.start + " direct jobs per 100 MW of wind and solar; times " + c.multiplier + " for supplier and spending jobs (gross supported); less " + Math.round(c.displacement * 100) + "% displacement (net). Other equipment's upkeep not counted; nothing retires.",
      assumeLine: "Jobs: A13's defaults; gross adds supplier and spending jobs; net takes off displacement, work that would happen anyway.",
      lines: [["Construction", "job-years: one job for one year. Gross: the multiplier adds supplier and spending jobs; net: less displacement, building work that would have happened anyway."],
        ["Ongoing", "jobs for as long as the farms run: direct at the farms, then gross supported (with supplier and spending jobs, not all at the farms), then net of displacement."],
        ["Not counted", "other equipment's upkeep jobs; nothing retires in this plan."]],
      screening: A13.SCREENING, assume: A13.ASSUME.jobs };
  }
  // the sensitivity, one rule for every input: the plan's building and equipment choices held fixed, the input moved to
  // each end of its range and the plan re-solved (dispatch and substation upgrades re-optimized), then every input at the
  // end that lowers this plan's cost and at the end that raises it, together (a joint test). Each input is classed: set
  // for teaching, or from public data. The park's gas price is no plan field: its runs use a copy of P with that price
  // (gasP), whose own 2025 run is solved too, so the change against 2025 stays like for like. Which end raises the cost is
  // read from the one-at-a-time runs (a plan that burns less gas than 2025 gains from a dearer gas price). Every case is
  // a live solve: 14 small LPs, plus a 2025 run at each gas price tried, about 2 s at a 6x CPU slowdown.
  var SENS = [{ key: "upc", label: "Upgrade cost", unit: "$/kW", kind: "set for teaching" },
    { key: "av", label: "Value of a wind or solar MWh", unit: "$/MWh", kind: "set for teaching" },
    { key: "rc", label: "Retrofit cost", unit: "$/home", kind: "set for teaching" },
    { key: "dhc", label: "Network cost", unit: "$/home", kind: "set for teaching" },
    { key: "save", label: "Heat a retrofit saves", unit: "%", kind: "set for teaching" },
    { key: "gasInd", label: "The park's gas price", unit: "$/Mcf", price: true, kind: "set for teaching from EIA prices" }];
  function sensRange(x, S, P) {
    if (x.price) { var g = P.cfg.c3.gasInd; return { lo: g.lo, hi: g.hi, fmt: function (v) { return "$" + v.toFixed(2) + "/Mcf"; } }; }
    var f = S.fields.filter(function (q) { return q.id === x.key; })[0];
    return { lo: f.min, hi: f.max, fmt: fmtOf(f) };
  }
  function fmtOf(f) { var u = f.unit; return u === "%" ? function (v) { return v + "%"; } : u === "$/MWh" ? function (v) { return "$" + kilo(v) + "/MWh"; } : function (v) { return "$" + kilo(v) + (u === "$/kW" ? "/kW" : " a home"); }; }
  // a copy of P with the park's gas price at v ($ per thousand cubic feet); its own 2025 run (no cached baseline)
  function gasP(P, v) {
    var k = P.price.gasInd / P.city.prices.gasPerMcf.industrial;
    return Object.assign({}, P, { price: Object.assign({}, P.price, { gasInd: v * k }), _base: null, _baseKey: null });
  }
  // a run's substation upgrades: MW bought and their up-front cost
  function upOf(R) { return { mw: upTotal(R), usd: R.acc.upfront.up }; }
  function upText(a, b) { var f = function (u) { return kilo(u.mw) + " MW, " + mil(u.usd); }; return Math.abs(a.mw - b.mw) < 0.05 && Math.abs(a.usd - b.usd) < 500 ? f(a) + " at both ends" : f(a) + " to " + f(b); }
  // run the test: R (the run), s0 (its plan, with siteInfo), S (the schema), P, E3, solve(state, P) -> Promise of
  // E3.solve's result. -> Promise of { base, up, rows: [{ key, label, loText, hiText, atLo, atHi, upLo, upHi, kind }],
  // joint: { cheap, dear, cheapUp, dearUp, ... }, state } or null when a run fails
  function runSens(R, s0, S, P, E3, solve) {
    var jobs = [];
    SENS.forEach(function (x) {
      var rg = sensRange(x, S, P);
      [rg.lo, rg.hi].forEach(function (v, j) {
        var s = Object.assign({}, s0); if (!x.price) s[x.key] = v;
        jobs.push(solve(s, x.price ? gasP(P, v) : P).then(function (r) { return { x: x, j: j, v: v, R: r && r.ok ? r.results : null, fmt: rg.fmt }; }));
      });
    });
    return Promise.all(jobs).then(function (out) {
      if (out.some(function (o) { return !o.R; })) return null;
      var cheap = Object.assign({}, s0), dear = Object.assign({}, s0), gc = null, gd = null;
      var rows = SENS.map(function (x) {
        var lo = out.filter(function (o) { return o.x === x && o.j === 0; })[0], hi = out.filter(function (o) { return o.x === x && o.j === 1; })[0];
        var up = hi.R.delta.cityCost >= lo.R.delta.cityCost, c = up ? lo.v : hi.v, d = up ? hi.v : lo.v;
        if (x.price) { gc = c; gd = d; } else { cheap[x.key] = c; dear[x.key] = d; }
        return { key: x.key, label: x.label, loText: lo.fmt(lo.v), hiText: hi.fmt(hi.v), atLo: lo.R.delta.cityCost, atHi: hi.R.delta.cityCost, upLo: upOf(lo.R), upHi: upOf(hi.R), kind: x.kind };
      });
      return Promise.all([solve(cheap, gasP(P, gc)), solve(dear, gasP(P, gd))]).then(function (jj) {
        if (!jj[0].ok || !jj[1].ok) return null;
        return { base: R.delta.cityCost, up: upOf(R), rows: rows, joint: { cheap: jj[0].results.delta.cityCost, dear: jj[1].results.delta.cityCost, cheapUp: upOf(jj[0].results), dearUp: upOf(jj[1].results),
          cheapState: cheap, dearState: dear, gas: [gc, gd] }, state: s0 };
      });
    });
  }
  // the upgrades over every case of the test: the least and most MW, and their up-front cost
  function upRange(sens) {
    var all = [sens.up, sens.joint.cheapUp, sens.joint.dearUp]; sens.rows.forEach(function (r) { all.push(r.upLo, r.upHi); });
    var mw = all.map(function (u) { return u.mw; }), usd = all.map(function (u) { return u.usd; });
    return { mwLo: Math.min.apply(null, mw), mwHi: Math.max.apply(null, mw), usdLo: Math.min.apply(null, usd), usdHi: Math.max.apply(null, usd) };
  }
  var SENS_HOW = "building and equipment choices fixed; dispatch and substation upgrades re-optimized";
  function biggest(rows) { return rows.slice().sort(function (a, b) { return Math.abs(b.atHi - b.atLo) - Math.abs(a.atHi - a.atLo); })[0]; }
  function lc1(t) { return t.charAt(0).toLowerCase() + t.slice(1); }
  function sensWords(base, rows, joint, ur) {
    var t = biggest(rows);
    return mil(base) + " a year against 2025" + (joint ? "; " + mil(joint.cheap) + " to " + mil(joint.dear) + " with every input at its cheaper or dearer end" : "") + "; " + lc1(t.label) + " moves it most. " +
      "Equipment fixed; dispatch and upgrades re-optimized" + (ur ? " (" + kilo(ur.mwLo) + " to " + kilo(ur.mwHi) + " MW, " + mil(ur.usdLo) + " to " + mil(ur.usdHi) + " up front)" : "") + ". All inputs set for teaching.";
  }
  // the test as rows of the note's results table: one per input, its range, what it does to the cost, and its class
  function sensRows(sens) {
    return sens.rows.map(function (r) { return { label: "Sensitivity: " + lc1(r.label) + ", " + r.loText + " to " + r.hiText, value: mil(r.atLo) + " to " + mil(r.atHi) }; })
      .concat([{ label: "Sensitivity: every input at its cheaper, then dearer end", value: mil(sens.joint.cheap) + " to " + mil(sens.joint.dear) }]);
  }
  // the reference plan of the exemplars (within the budget) and the two notes on it, written from a precomputed run.
  // Site A: the screen's best block and the cheapest of the five to connect
  var REF_PLAN = { hp: 70, ret: 10, dh: 0, dhp: 0, sto: 0, ev: 40, evm: "managed", pv: 0, bat: 30, ihp: 100, ely: 0, wind: 200, farm: 100, site: "A" };
  // one answer per stakeholder who objects, from the run's own numbers (x: below); true of the run by construction
  var ANSWER = {
    council: function (x) { return "the city council (over budget): I would drop the solar farm or some retrofits first; the plan is " + mil(x.upfront - x.budget) + " over"; },
    utility: function (x) { return "the electric utility (" + kilo(x.up) + " MW of upgrades): I keep them, since with the plan's levers fixed they are the cheapest way to meet the " + x.worst + (/s$/.test(x.worst) ? "'" : "'s") + " busiest hour (its dual equals the upgrade's yearly cost)"; },
    advocates: function (x) { return "the low-income advocates (burden " + pct1(x.burden0) + " → " + pct1(x.burden) + "): recovering the shared costs by income instead gives " + pct1(x.altBurden) + " (screening)"; },
    climate: function (x) { return "the climate group (" + pct0(x.cut) + " cut): the city's wind and solar do not lower the location-based CO₂ (at the grid's average rate their MWh are about " + kilo(x.contractT) + " t, illustrative only); deeper cuts need more heat pumps and retrofits, with " + mil(x.budget - x.upfront) + " of the budget left"; },
    park: function (x) { return "the industrial park (" + smil(x.dPark) + " a year, " + pct0(x.dParkShare) + "): I keep the food plants' heat pumps for the gas they save, and show the park's gas price in the sensitivity table"; },
    rural: function (x) { return "farmers and rural residents (site " + x.site.id + "): it is the screen's best block and the cheapest of the five to connect, " + mil(x.site.connectUSD) + " for its line, road and land, " + x.site.km.toFixed(1) + " km to " + x.site.sub + ", on about " + kilo(x.site.acres) + " acres"; } };
  // the note on each stakeholder's answer in the strong summary: what makes it an answer
  var ANSWER_NOTE = { council: "A change that meets the budget, with its size.", utility: "A reason to keep the upgrades, from the LP's dual.",
    advocates: "An alternative tested, with its result.", climate: "The boundary held, and what would cut deeper, with the budget left.",
    park: "A reason, and where the risk is shown.", rural: "The site's evidence from the map." };
  function exemplars(x) {
    // x: { upfront, budget, dCost, co2, cut, up, worst, burden0, burden, altBurden, objectors: [keys], contractT, dPark,
    //      dParkShare, site: { id, connectUSD, km, sub, acres, cf }, jobs: { jobYears, jobYearsNet, permDirect, permGross, permNet, mw },
    //      sens: { cheap, dear, top: { label, loText, hiText } }, full: { extra, days } } from a run of REF_PLAN (full: its
    //      full-year check, data/e3-full-year.json: the MW of upgrade the year needs beyond the eight days', on which days)
    var obj = x.objectors.map(function (k) { return ANSWER[k](x); });
    return { title: "Two summaries of the same brief", task: "Recommend Prairie City's 2040 energy plan within the budget, and say who gains and who pays.", id: "c3-ex", lines: true,
      answers: [
        { key: "weak", label: "Weak summary", level: "Developing", parts: ["Prairie City should ", { text: "go green with heat pumps and wind", note: "No sizes, no shares, no budget: the council cannot check or cost it." }, ". ",
          { text: "Emissions will fall a lot", note: "By how much, on what boundary, against which year?" }, " and ", { text: "everyone will save money", note: "Who? The household table is a screening estimate with an adoption rule; name the groups and the numbers." }, ". ",
          { text: "Some people objected but the plan is the best", note: "Each objection needs an answer: what you would change, or why you would not." }, "."] },
        { key: "good", label: "Strong summary", level: "Proficient", parts: [
          "Recommendation: ", { text: "electrify heat and cars, add substation batteries, move the food plants' low-temperature heat to heat pumps, and build city-owned wind and solar", note: "The plan in one sentence, before the evidence." }, ".\n",
          "Sizes: ", { text: "heat pumps " + REF_PLAN.hp + "% · retrofits " + REF_PLAN.ret + "% · electric cars " + REF_PLAN.ev + "%, " + (REF_PLAN.evm === "managed" ? "managed" : "unmanaged") + " · batteries " + REF_PLAN.bat + " MW · food plants' low-temperature heat " + REF_PLAN.ihp + "% · wind " + REF_PLAN.wind + " MW · solar " + REF_PLAN.farm + " MW, site " + x.site.id, note: "Every lever with its size: a plan the council can cost and check." }, ".\n",
          "Budget and cost: ", { text: mil(x.upfront) + " up front against " + mil(x.budget) + "; the city's yearly cost " + smil(x.dCost) + " against 2025 (energy bills plus equipment as yearly payments, 2025 dollars)", note: "Up front and yearly kept apart, on one boundary." }, ".\n",
          "CO₂ and the grid: ", { text: "the city's location-based CO₂ " + kilo(x.co2) + " t a year, " + pct0(x.cut) + " below 2025 (operating only; the city's wind and solar output not deducted); " + kilo(x.up) + " MW of substation upgrades, the " + x.worst + " the tightest", note: "The cut with its boundary, and where the plan needs grid room." }, ".\n",
          "Who pays (screening): ", { text: "energy burden of homes below 80% of area median income " + pct1(x.burden0) + " → " + pct1(x.burden) + ", every group adopting alike; the cars' fuel and charging count as transport, outside the burden", note: "The rule stated, and the estimate labelled as a screening estimate." }, ".\n",
          "Jobs (screening): ", { text: "about " + kilo(x.jobs.jobYears) + " construction job-years to 2040 (gross), " + kilo(x.jobs.jobYearsNet) + " net of displacement; at the farms " + kilo(x.jobs.permDirect) + " direct ongoing jobs, " + kilo(x.jobs.permGross) + " gross supported, " + kilo(x.jobs.permNet) + " net of displacement", note: "Job-years kept apart from ongoing jobs, gross apart from net." }, ".\n",
          "Site: ", { text: "site " + x.site.id + ", the best of A19's five blocks and the cheapest to connect (" + mil(x.site.connectUSD) + "), at a " + (x.site.cf * 100).toFixed(1) + "% capacity factor", note: "The site's choice with its evidence from the map." }, ".\n",
          "Sensitivity: ", { text: "the yearly cost runs from " + mil(x.sens.cheap) + " to " + mil(x.sens.dear) + " with every input at its lower- or higher-cost end (equipment fixed, upgrades re-optimized); " + lc1(x.sens.top.label) + " moves it most, " + x.sens.top.loText + " to " + x.sens.top.hiText + "; every tested input is set for teaching", note: "A range, what was held fixed, the input that matters most, and what kind of number each input is." }, ".\n",
        ].concat(obj.length ? [].concat.apply([], x.objectors.map(function (k, i) { return ["Panel: ", { text: "to " + obj[i], note: ANSWER_NOTE[k] }, ".\n"]; }))
          : ["Panel: ", { text: "no stakeholder objects", note: "Each objection would need an answer: a reason or a change." }, ".\n"]).concat([
          "Limits: ", { text: "2025's people and prices held to 2040, one substation per district, eight representative days of synthetic weather" + (x.full ? " (on all 8,760 hours the upgrades fall " + x.full.extra.toFixed(1) + " MW short, on " + x.full.days + ")" : "") + ", the household rule an assumption, the map's layers simulated", note: "What the plan leaves out, and what the full-year check found, so the council does not over-read it." }, "."]) }],
      note: "Both summaries are illustrative. The strong one quotes this engine's numbers for one reference plan within the budget, precomputed; another plan is just as strong when its evidence supports it." };
  }
  // the summary's sentence for a plan with a full-year check: the eight days, then what the year found (as short as the
  // general sentence it replaces)
  function fullAssume(e) {
    var extra = e.year.dist.reduce(function (t, d, i) { return t + d.upg - e.days.dist[i].upg; }, 0);
    return "Eight days stand for the year; on all 8,760 hours its upgrades " + (e.year.unserved >= 0.5 ? "fall " + extra.toFixed(1) + " MW short." : "hold.");
  }
  var page = { REF_PLAN: REF_PLAN, ANSWER: ANSWER, exemplars: exemplars, fullAssume: fullAssume, siteModel: siteModel, siteInfo: siteInfo, kilo: kilo, mil: mil, smil: smil, pct1: pct1, pct0: pct0, upTotal: upTotal, budget: budget, co2Cut: co2Cut, PANEL: PANEL, panel: panel, parkCost: parkCost,
    SENS: SENS, SENS_HOW: SENS_HOW, lc1: lc1, sensRange: sensRange, gasP: gasP, runSens: runSens, sensWords: sensWords, sensRows: sensRows, biggest: biggest, upOf: upOf, upText: upText, upRange: upRange,
    GROUPS: [{ title: "Buildings", fields: ["hp", "ret"], color: "var(--lx-cc)", hint: "Heat pumps' [[coefficient-of-performance|COP]] falls on cold nights; retrofits cut the heat buildings need." },
      { title: "District heat (dense core)", fields: ["dh", "dhp", "sto"], color: "var(--lx-tier-4)", hint: "A hot-water network: a large heat pump, a heat store, and a gas boiler for the rest, assumed to exist already (its fuel counts, not its construction)." },
      { title: "Cars", fields: ["ev", "evm"], color: "var(--lx-demand)", hint: "[[managed-charging|Managed charging]] moves each day's charge within the day; it assumes cars are plugged in at home or work when needed." },
      { title: "The industrial park", fields: ["ihp", "ely"], color: "var(--lx-hyd)", hint: "Flat new loads at the park's own substation; the gas they replace is saved." },
      { title: "Local supply and storage", fields: ["pv", "bat", "wind", "farm"], color: "var(--lx-solar)", hint: "City-owned wind and a solar farm: the city pays to build them, and their output counts against what it buys, hour by hour; output it cannot use earns nothing. They do not lower the [[location-based|location-based]] CO₂." },
      { title: "The grid", fields: ["up", "upc"], color: "var(--lx-bad)", hint: "Each district's [[substation|substation]] carries at most its limit each hour, unless the plan buys an upgrade." },
      { title: "Assumptions you can change", fields: ["av", "save", "rc", "dhc", "rule", "rec"], color: "var(--lx-ink-2)", hint: "Set for teaching. \"Who adopts first\" and how shared costs are recovered move only the household table ([[lesson:a13-fairness-jobs|A13]])." }],
    // C3's own words for the levels the page's workflow supports: the test gives one-at-a-time and
    // joint cases with each input classed; the summary has a sources field and one answer per stakeholder
    RUBRIC: [{ id: "accounting", look: "Cost and CO₂ on one boundary (the whole city, a year, 2025 dollars, location-based); who pays named by household group, as a screening estimate; jobs as construction job-years and ongoing jobs, gross and net." },
      { id: "uncertainty", look: "The sensitivity table: each input one at a time and all together at their cheaper and dearer ends, each input classed as public data or set for teaching.",
        levels: { proficient: "each tested input classed as public data or set for teaching; the one-at-a-time and the joint cheaper and dearer cases reported, the result as a range, and the inputs that could flip the recommendation named" } },
      { id: "realism", look: "What the plan leaves out: power flow inside districts, 2025's people and prices held to 2040, the household rule an assumption; the site's evidence from A19's simulated layers." },
      { id: "integrity", look: "The sources field filled; every stakeholder who objects answered fairly, with what you would change or why you would not.",
        levels: { proficient: "the data's sources and licences named (public data from EIA, NOAA, EPA and DOE; A19's simulated map layers), the numbers called illustrative, any conflict of interest stated, and every stakeholder who objects answered fairly" } },
      { id: "communication", look: "Two pages the council can act on: the recommendation first, then the evidence, the panel and the limits.",
        levels: { proficient: "a two-page plan summary with the plan link, the sensitivity table (and the chart as an image, where you can attach one) and an answer to each stakeholder who objects: the recommendation first, then the evidence (budget, cost, CO₂, the substations, who pays, jobs, the site), the panel's objections answered, the sensitivity and the limits" } }],
    RUBRIC_BAR: "the bar for this plan summary",
    FIELDS: [{ key: "recommend", label: "Recommendation", hint: "Three or four sentences: what Prairie City should do by 2040, and why.", rows: 4, need: true, at: "top", min: 15 },
      { key: "evidence", label: "Cost, CO₂ and the grid", hint: "Two or three sentences: what the plan costs against the budget, what it cuts, and where the substations need room.", rows: 3, need: true, min: 12 },
      { key: "fairness", label: "Who pays and who gains", hint: "Two or three sentences on the household groups, with the adoption rule you assumed.", rows: 3, need: true, min: 12 },
      { key: "siting", label: "The solar farm's site", hint: "One or two sentences: which site and why, or why no farm.", rows: 2, need: true, min: 8 },
      { key: "sources", label: "Sources and credit", hint: "One or two sentences: the data behind your numbers and their licences (EIA, NOAA, EPA and DOE public data; A19's simulated layers), and any conflict of interest.", rows: 2, need: true, min: 8 }],
    TWO_PAGES: 1100,
    // the panel's answers (one box per stakeholder, beside the summary; kept in this browser like the summary's words, never
    // in the plan link): four words or more from each stakeholder whose reaction is not yes
    ANS_HINT: { council: "If they object: what you would cut to meet the budget, or why not.", utility: "If they object: how you would cut the upgrades, or why they are worth it.",
      advocates: "If they object: how you would protect low-income homes, or why not.", climate: "If they object: what would cut CO₂ further, at what cost, or why not.",
      park: "If they object: what you would change for the park, or why not.", rural: "If they object: why this site, or what you would change." },
    answered: function (pn, ans) { return pn.every(function (x) { var w = String((ans || {})[x.key] || "").trim(); return x.cell.v === "yes" || w.split(/\s+/).filter(Boolean).length >= 4; }); },
    // the panel's rows in the note's results: the stakeholder-objection-answer table
    panelRows: function (pn, ans, WORD) { return pn.map(function (x) { var a = String((ans || {})[x.key] || "").trim();
      return { label: "Panel: " + x.name, value: WORD[x.cell.v], note: x.cell.t + (x.cell.v !== "yes" ? " My answer: " + (a || "(not written yet)") : "") }; }); },
    OUTLINE: { results: "Results: each result, with its unit and boundary; the panel's reactions, with your answer to each stakeholder who objects; the sensitivity table" },
    jobs: jobs };
  if (typeof module !== "undefined" && module.exports) module.exports = page;
  if (typeof window === "undefined" || !window.LX || !window.LX.E3) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H, E3 = LX.E3, U = E3.ui;
  LX.mount("c3", function (live, data, root) {
    var P = E3.prepare(data.prairie_city, data.e3_city_hub), cfg = P.cfg, S = E3.c3Schema(cfg), stub = null, last = null, sens = null, FY = data.e3_full_year || null, FYc = data.prairie_city.fullYear;
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
      H("p", { class: "lx-hint e3-ghint", html: LX.rich(SM ? "A19's screen for a " + SM.mw + " MW block: protected land, flood zones, steep slopes and [[setback|setbacks]] (least distances from homes and roads) left out, the rest scored ([[lesson:a19-gis-siting|A19]]). Pick one of its five best blocks; its line, road and land go into your plan." : "The siting map could not load: the sites differ only by name and change no number.") }, fs);
      var mapBox = H("div", { class: "c3-mapbox" }, fs), map = SM ? LX.SiteMap(mapBox, { R: SM.R, D: SM.D, label: "Map of the region around Prairie City with the five best solar blocks" }) : null;
      var sg = U.seg(H("div", { class: "e3-segrow" }, fs), f.label, f.values, f.names, plan.site, function (v) { var p = U.copy(plan); p.site = v; change(p); });
      var tb = H("div", { class: "c3-sites" }, fs);
      function paint(p) {
        if (!SM) return;
        var k = SM.top.map(function (t) { return t.id; }).indexOf(p.site), co = SM.costs[k];
        map.draw({ layer: "suit", suit: SM.suit, X: SM.X, sites: SM.top, sel: p.site, path: co && co.route ? co.route.cells : null, sitesKey: "Five best solar blocks, A best" });
        tb.innerHTML = "";
        U.table(tb, ["Site", "Where", "Line to", "Up front: line, road, land", "Capacity factor (a full year)"], SM.top.map(function (t) {
          var x = page.siteInfo(SM, t.id, Math.max(p.farm, 10));
          return [t.id + (t.id === p.site ? " (yours)" : ""), x.where + " of the centre", x.sub + ", " + x.km.toFixed(1) + " km", mil(x.connectUSD), (x.cf * 100).toFixed(1) + "%"];
        }), "c3-sitetbl");
        U.keys(tb, [["Up front", "for a " + kilo(Math.max(p.farm, 10)) + " MW farm, 2025 dollars: the land in proportion to the MW, the line and road as A19 costs them for its block. The panels are in the solar-farm cost."],
          ["Capacity factor", "the site's yearly output over what it would make at full power all year ([[capacity-factor|capacity factor]]). The eight representative days carry more sun than the year: see the full-year check."]]);
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
      render: function (R, st) { last = { R: R, state: st }; sens = null; draw(R); tagAnswers(R); rn.refresh(); },
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
      H("p", { class: "lx-hint e3-line", text: P.line + " The plan is for 2040 with 2025's people, homes and prices and the course's synthetic weather: only the plan changes." }, res);
      var c1 = H("div", { class: "lx-xcard" }, res); H("h3", { text: "Cost and CO₂ against 2025, the whole city" }, c1);
      U.costTable(c1, R);
      var A = R.acc, A0 = R.base.acc;
      U.table(c1, ["CO₂, t a year (location-based)", "2025", "2040 plan"], [["The three districts' buildings and cars", kilo(A0.co2Hub), kilo(A.co2Hub)], ["Industrial park, data-center campus, buses, trucks and farms", kilo(A0.outside.co2), kilo(A.outside.co2)],
        { cls: "e3-tot", cells: ["The city", kilo(A0.city.co2), kilo(A.city.co2) + " (" + (co2Cut(R) >= 0 ? "−" : "+") + pct0(Math.abs(co2Cut(R))) + ")"] }], "c3-co2");
      U.keys(c1, [["Up front, 2026 to 2040", mil(b.upfront) + " (" + (b.within ? mil(b.left) + " left" : mil(-b.left) + " over") + ")."],
        ["CO₂", "[[location-based|location-based]]: every MWh used at the grid's average rate, which the city's own farms do not change."],
        ["Wind and solar, apart", A.contract.mwh > 0 ? "the city used " + kilo(A.contract.mwh / 1000) + " GWh a year of its farms' " + kilo(A.contract.gen / 1000) + " GWh; not deducted above."  : "no wind or solar farm in this plan."]].concat(A.contract.mwh > 0 ? [
        ["Grid-average comparison", "those MWh × the grid's average rate ≈ " + kilo(A.contract.t) + " t. Illustrative only: not a [[market-based|market-based]] inventory result (that needs qualifying certificates and a residual mix), and not a physical cut."]] : []));
      var c2 = H("div", { class: "lx-xcard lx-sb-chart" }, res); H("h3", { text: "The substations in their busiest hours" }, c2);
      var dv = U.DayView(c2, P), best = 0; R.dist.forEach(function (d, i) { if (d.peak / d.limit > R.dist[best].peak / R.dist[best].limit) best = i; });
      dv.set(R, { d: best, k: R.dist[best].at.k });
      U.table(c2, ["District", "Busiest hour", "Limit", "Upgrade", "1 MW more room saves a year (LP dual)"], R.dist.map(function (d) { return [d.label, kilo(d.peak) + " MW", kilo(d.limit) + " MW", kilo(d.upg) + " MW", d.value == null ? "–" : "$" + kilo(d.value)]; }), "c3-sub");
      U.keys(c2, [["LP dual", "the substation row's [[shadow-price|dual]], summed over the year: what one more MW of room would save, under this plan's assumptions."]]);
      // the full-year check of the plan that ran (precomputed for the presets and the reference plan; none for others)
      U.fullCard(res, E3.fullFind(FY, "c3", S, R.state, LX.ShareState), FYc, P, { date: FY ? FY.date : "",
        none: "It is precomputed for the presets and the exemplars' reference plan, with every other setting at its default: a year of hours is too large to solve on a click.",
        load: { label: "Load the reference plan (checked)", go: function () { change(Object.assign(LX.ShareState.defaults(S), page.REF_PLAN)); run.run(plan); } } });
      var c3 = H("div", { class: "lx-xcard" }, res); H("h3", { text: "Who pays: a screening estimate by household group" }, c3);
      // HOOK(A13), wired: the table is E3.households, whose money and burden are LX.A13.allocate
      U.hhTable(c3, R);
      var jb = page.jobs(R, window.LX.A13, data.a13_fairness_jobs && data.a13_fairness_jobs.jobs);
      if (jb) {
        U.table(c3, ["Jobs (screening, lesson A13's model)", "Estimate"], [["Construction, 2026 to 2040 (gross) and net", kilo(jb.jobYears) + " job-years gross (about " + kilo(jb.perYear) + " a year) · " + kilo(jb.jobYearsNet) + " net"],
          ["Ongoing, supported by the wind and solar farms (" + kilo(jb.mw) + " MW)", kilo(jb.permDirect) + " direct · " + kilo(jb.permGross) + " gross supported · " + kilo(jb.permNet) + " net"]], "c3-jobs");
        U.keys(c3, jb.lines.concat([["Coefficients", jb.note]]));
        H("p", { class: "lx-hint", text: jb.screening }, c3);
      } else H("p", { class: "lx-hint", text: "Jobs: lesson A13's model did not load." }, c3);
      var c4 = H("div", { class: "lx-xcard" }, res);
      LX.Stakeholders(c4, { title: "The stakeholder panel reacts", lede: "Each reacts to your run by a stated rule (set for teaching). Answer every objection under \"Answer the panel\", beside your summary.",
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
      if (!sens) { H("p", { class: "lx-hint", text: "Press Test the plan: each input moves to the low and the high end of its range, then all of them together. Each case is solved again: " + SENS_HOW + "." }, sensHost); return; }
      var t = LX.Tornado(sensHost, { fmt: mil, measure: "yearly cost against 2025", below: "var(--lx-good)", above: "var(--lx-bad)" });
      t.draw({ base: sens.base, rows: sens.rows.concat([{ label: "All together", loText: "every cheaper end", hiText: "every dearer end", atLo: sens.joint.cheap, atHi: sens.joint.dear }]),
        lede: "**Yearly cost against 2025:** " + mil(sens.base) + " for this plan (black line).", note: "Equipment fixed, upgrades re-optimized; 2025 dollars." });
      U.table(sensHost, ["Input", "Range tested", "Yearly cost against 2025", "Substation upgrades: MW, up front", "What kind of number"], sens.rows.map(function (r) { return [r.label, r.loText + " to " + r.hiText, mil(r.atLo) + " to " + mil(r.atHi), upText(r.upLo, r.upHi), r.kind]; })
        .concat([{ cls: "e3-tot", cells: ["All together", "every cheaper end, then every dearer end", mil(sens.joint.cheap) + " to " + mil(sens.joint.dear), upText(sens.joint.cheapUp, sens.joint.dearUp), "a joint test"] }]), "c3-sens");
      U.keys(sensHost, [["How", "each case solved again: " + SENS_HOW + ". This plan buys " + kilo(sens.up.mw) + " MW (" + mil(sens.up.usd) + " up front)."]]);
    }
    function testIt(btn, st) {
      if (!last) return;
      btn.disabled = true; st.textContent = "Testing…";
      var s0 = last.state;
      page.runSens(last.R, withSite(s0), S, P, E3, function (s, PP) { return E3.solve(s, PP, {}); }).then(function (out) {
        if (!out) { st.textContent = "A test run failed; Try again."; btn.disabled = false; return; }
        sens = out; sens.state = s0;
        drawSens(); st.textContent = "Tested: " + out.rows.length + " inputs one at a time, then all together, each case solved again."; btn.disabled = false; rn.refresh();
      }, function () { st.textContent = "A test run failed; Try again."; btn.disabled = false; });
    }

    // ---- the note (the two-page plan summary), with the stakeholder response table: one answer box per stakeholder (kept
    // in this browser, never in the plan link), shown with the run's reaction; the note's results carry each reaction,
    // objection and answer
    var nh = document.getElementById("c3-note"); nh.innerHTML = "";
    var answers = (LX.store.get("c3-answers") || {}), ansTag = {};
    (function () {
      var card = H("div", { class: "lx-xcard c3-ans" }, nh); H("h3", { text: "Answer the panel" }, card);
      H("p", { class: "lx-hint", text: "One answer to each stakeholder who objects to your run: what you would change, or why you would not. They go into the summary's results, beside each reaction." }, card);
      PANEL.forEach(function (q) {
        var w = H("div", { class: "lx-rn-field c3-ans-f" }, card), id = LX.uid("c3a"), lab = H("label", { for: id }, w);
        H("span", { text: q.name }, lab); ansTag[q.key] = H("span", { class: "c3-ans-tag", text: "" }, lab);
        var ta = H("textarea", { id: id, rows: "2", maxlength: "400", "aria-describedby": id + "-h" }, w); ta.value = typeof answers[q.key] === "string" ? answers[q.key] : "";
        H("p", { id: id + "-h", class: "lx-hint", text: page.ANS_HINT[q.key] }, w);
        ta.addEventListener("input", function () { answers[q.key] = String(ta.value).slice(0, 400); LX.store.set("c3-answers", answers); rn.refresh(); });
      });
    })();
    function tagAnswers(R) { panel(R, P).forEach(function (x) { ansTag[x.key].textContent = " · " + LX.Stakeholders.WORD[x.cell.v] + (x.cell.v !== "yes" ? ": answer needed" : ""); ansTag[x.key].className = "c3-ans-tag " + x.cell.v; }); }
    var rn = LX.ReportNote(H("div", { class: "lx-xcard" }, nh), { id: "c3-note", code: "C3", title: "Your two-page plan summary", lede: "Your words: the recommendation, the evidence, who pays, the site, an answer to each stakeholder who objects, and your sources. The plan, its numbers, the panel's reactions, the assumptions and the sensitivity table come from your run.",
      fields: page.FIELDS,
      checks: ["link", "run", "fields", "assumptions", "sensitivity",
        { id: "pages", label: "Fits on two pages (about " + kilo(page.TWO_PAGES) + " words)", test: function (note, words) { return LX.ReportNote.countWords(LX.ReportNote.compose(note, words, page.FIELDS, { format: "text" })) <= page.TWO_PAGES; } },
        { id: "budget", label: "Within the $" + kilo(cfg.c3.budget.def) + "M budget, up front", test: function () { return !!last && LX.ShareState.same(S, last.state, plan) && budget(last.R, P).within; } },
        { id: "tested", label: "Sensitivity tested on this plan", test: function () { return !!sens && LX.ShareState.same(S, sens.state, plan); } },
        { id: "answered", label: "An answer to each stakeholder who objects", test: function () { return !!last && page.answered(panel(last.R, P), answers); } }],
      get: function () {
        if (!last) return null;
        var R = last.R, n = E3.note(last.state, R, P);
        n.link = ss.url(); n.run = { ok: true, stale: !LX.ShareState.same(S, last.state, plan), text: "the 2040 plan over eight representative days" };
        n.made = "the City Planner's engine E3 (a linear program), on capstone C3";
        // the stakeholder table: each one's reaction, objection and the reader's answer (from the answer boxes above the
        // summary) in the results
        n.results = n.results.concat(page.panelRows(panel(R, P), answers, LX.Stakeholders.WORD));
        // a plan with a full-year check says what it found, in place of the general sentence on the eight days (the two
        // pages have no room for more)
        var fe = E3.fullFind(FY, "c3", S, last.state, LX.ShareState);
        if (fe) n.assumptions = n.assumptions.map(function (t) { return /^Eight representative days/.test(t) ? page.fullAssume(fe) : t; });
        var jb = page.jobs(R, window.LX.A13, data.a13_fairness_jobs && data.a13_fairness_jobs.jobs);
        if (jb) { n.results.push({ label: "Jobs (screening)", value: kilo(jb.jobYears) + " construction job-years gross, " + kilo(jb.jobYearsNet) + " net; ongoing " + kilo(jb.permDirect) + " direct, " + kilo(jb.permGross) + " gross supported, " + kilo(jb.permNet) + " net", note: "lesson A13's coefficients" });
          n.assumptions.push(jb.assumeLine); }
        var fresh = sens && LX.ShareState.same(S, sens.state, plan);
        if (fresh) n.results = n.results.concat(page.sensRows(sens));
        n.sensitivity = fresh ? sensWords(sens.base, sens.rows, sens.joint, upRange(sens)) : null;   // the check waits for Test the plan
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
