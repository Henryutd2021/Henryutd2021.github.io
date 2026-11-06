// sb3-city-planner.js — SB3, "City Planner" (sandbox, wave W5, 2026-11-06), on engine E3 (assets/learn/components/
// engine-e3.js, LX.E3, in the bundle; data assets/learn/data/prairie-city.json and e3-city-hub.json).
//
// The page: the brief (static), the bench (buildings, district heat, cars, local supply, the grid, assumptions; Run the
// hub; readouts; the plan link), the results (what the run says, one district's day against its substation limit, what
// 1 MW more room is worth from the LP's duals, the yearly cost, CO2, and the screening household table from the
// accounting layer), then how the engine works (the hub diagram, LX.Boundary) and the sources. Every number the page
// states comes from E3 and is checked by _tests/learn/test_sb3-city-planner.js (with the engine's test_e3-engine.js).
// Prairie City is fictional; its numbers are illustrative.
(function () {
  "use strict";
  // ---------------------------------------------------------------- pure words (Node: the test reads them)
  function kilo(v) { var r = Math.round(v); return (r < 0 ? "−" : "") + Math.abs(r).toLocaleString("en-US"); }
  function mil(v) { var x = Math.round(v / 1e5) / 10; return (x < 0 ? "−$" : "$") + Math.abs(x).toFixed(1) + "M"; }
  function signed(v, f) { return (v > 0 ? "+" : v < 0 ? "−" : "") + f(Math.abs(v)); }
  function pct1(v) { return (v * 100).toFixed(1) + "%"; }
  // what a run says, one idea a line (R: E3.summarize's results); never more than the run shows
  function says(R) {
    var out = [], A = R.acc, A0 = R.base ? R.base.acc : A;
    R.dist.forEach(function (d) {
      if (d.upg > 0.05) out.push({ kind: "bad", text: "**" + d.label + ": " + kilo(d.peak) + " MW in its busiest hour against a " + kilo(d.limit) + " MW limit.** The plan buys " + kilo(d.upg) + " MW of substation upgrade (" + mil(d.upg * R.sys.a.up) + " a year)." });
      else if (d.value != null && d.value > 0.5) out.push({ kind: "", text: "**" + d.label + " reaches its limit:** busiest hour " + kilo(d.peak) + " of " + kilo(d.limit) + " MW; flexible loads keep it there. One more MW of room would save about $" + kilo(d.value) + " a year (the LP's dual)." });
      else out.push({ kind: "good", text: "**" + d.label + " stays within its limit:** busiest hour " + kilo(d.peak) + " of " + kilo(d.limit) + " MW." });
    });
    var dc = R.delta.co2;
    if (Math.abs(dc) < 0.5) out.push({ kind: "", text: "**CO₂ as in 2025:** " + kilo(A.co2Hub) + " t a year from the districts' electricity, gas and propane, and the cars' gasoline." });
    else out.push({ kind: dc < 0 ? "good" : "bad", text: "**CO₂ " + (dc < 0 ? "down " : "up ") + kilo(Math.abs(dc)) + " t a year (" + pct1(Math.abs(dc) / A0.co2Hub) + ")** against 2025: the districts' electricity, gas and propane, and the cars' gasoline." });
    var M = A.money, M0 = A0.money, dCars = M.cars - M0.cars, dRest = R.delta.cost - dCars;
    out.push({ kind: "", text: "**Yearly cost " + signed(R.delta.cost, mil) + " against 2025:** buildings, equipment and the grid " + signed(dRest, mil) + ", cars' fuel and charging " + signed(dCars, mil) + " (the cars' own prices are not counted)." });
    out.push({ kind: "", text: "**Energy burden of homes below 80% of area median income: " + pct1(R.hh.low.burden0) + " → " + pct1(R.hh.low.burden) + "** (a screening estimate from the accounting layer, not from the LP)." });
    return out;
  }
  // the readouts beside the controls: [label, value, tone]
  function readouts(R) { return window.LX.E3.ui.readouts(R); }
  // which district and day the chart opens on: the busiest hour against its limit
  function pick(R) {
    var best = null, br = -1;
    R.dist.forEach(function (d, i) { var r = d.peak / d.limit; if (r > br + 1e-9) { br = r; best = { d: i, k: d.at.k }; } });
    return best;
  }
  var page = { says: says, pick: pick, kilo: kilo, mil: mil, pct1: pct1,
    GROUPS: [{ title: "Buildings", fields: ["hp", "ret"], color: "var(--lx-cc)", hint: "A [[heat-pump|heat pump]]'s [[coefficient-of-performance|COP]] falls on cold nights; a retrofit cuts the heat a building needs." },
      { title: "District heat (dense core)", fields: ["dh", "dhp", "sto"], color: "var(--lx-tier-4)", hint: "A hot-water network for part of the core: its plant's heat pump, a gas boiler for the rest, and a heat store to shift the plant's power." },
      { title: "Cars", fields: ["ev", "evm"], color: "var(--lx-demand)", hint: "Managed charging moves each day's charge to other hours of the same day." },
      { title: "Local supply and storage", fields: ["pv", "bat"], color: "var(--lx-solar)", hint: "Rooftop solar a district cannot use is spilled; batteries sit at the substations." },
      { title: "The grid", fields: ["up", "upc"], color: "var(--lx-bad)", hint: "Each district's [[substation|substation]] carries at most its limit each hour, unless the plan buys an upgrade." },
      { title: "Assumptions you can change", fields: ["save", "rc", "dhc", "rule"], color: "var(--lx-ink-2)", hint: "Set for teaching. \"Who adopts first\" only moves the household table." }] };
  if (typeof module !== "undefined" && module.exports) module.exports = page;
  if (typeof window === "undefined" || !window.LX || !window.LX.E3) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H, E3 = LX.E3, U = E3.ui;
  LX.mount("sb3", function (live, data, root) {
    var P = E3.prepare(data.prairie_city, data.e3_city_hub), S = E3.sb3Schema(P.cfg), stub = null;
    var rh = document.getElementById("sb3-results"), fb = rh.querySelector(".lx-fallback"); if (fb) fb.hidden = true;
    H("p", { class: "lx-hint e3-line", text: P.line }, live);
    var wrap = H("div", { class: "lx-sb e3-sb" }, live);
    var ctr = H("div", { class: "lx-sb-controls" }, wrap), side = H("div", { class: "lx-sb-side" }, wrap);
    var plan;
    var ss = LX.ShareState(side, { schema: S, id: "sb3-link", onLoad: function (s) { plan = s; C.set(plan); run.changed(plan); } });
    plan = ss.state;
    var C = U.controls(ctr, S, plan, page.GROUPS, change);
    var pre = H("div", { class: "lx-sb-presets", role: "group", "aria-label": "Start from a preset (only the choices it names change)" }, side);
    E3.presets.forEach(function (pr) {
      H("button", { class: "lx-btn ghost small", type: "button", text: pr.label, title: pr.note, onclick: function () { change(E3.withPreset(plan, pr)); } }, pre);
    });
    var stale = H("p", null, rh), res = H("div", { class: "lx-sb-results sb3-res" }, rh), ro = H("div", { class: "lx-readouts e3-ro" }), stopB = U.stopper();
    function solver() {
      if (!stub) return null;
      var kind = stub; stub = null;
      return function () { return Promise.resolve({ status: kind === "tl" ? "time-limit" : "error", ok: false, message: "solver stopped (demo)" }); };
    }
    var run = LX.BenchRun(side, { label: "Run the hub", state: function () { return plan; }, results: [res, ro], stale: stale,
      busy: function (on) { stopB.busy(on); },
      solve: function (st, ctx) { return E3.solve(st, P, { signal: ctx.signal, attempt: ctx.attempt, solver: solver() }); },
      render: function (R) { draw(R); },
      words: { ok: "Done: the cheapest way to run this plan over the eight representative days (the solver reports optimal)." } });
    stopB.attach(run);
    side.appendChild(ro);
    side.insertBefore(ss.status, pre);
    side.appendChild(ss.el);
    function change(p) { plan = p; C.set(plan); ss.set(plan); run.changed(plan); }

    // ---- the results
    var day = null;
    function draw(R) {
      ro.innerHTML = "";
      U.readouts(R).forEach(function (x) { var d = H("div", { class: "lx-readout " + x[2] }, ro); H("span", { text: x[0] }, d); H("b", { text: x[1] }, d); });
      res.innerHTML = "";
      H("p", { class: "lx-hint e3-line", text: P.line }, res);
      var sayBox = H("div", { class: "e3-says" }, res);
      page.says(R).forEach(function (s) { H("p", { class: "e3-say " + s.kind, html: LX.rich(s.text).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>") }, sayBox); });
      var c1 = H("div", { class: "lx-xcard lx-sb-chart" }, res); H("h3", { text: "One district's day against its substation" }, c1);
      day = U.DayView(c1, P);
      day.set(R, page.pick(R));
      H("p", { class: "lx-hint", html: LX.rich("Each hour's flow through the substation may not pass its limit (a linearized feeder limit). The dashed line is what the district used; the gap is its rooftop solar and batteries. Hourly schedules can tie: the chart shows the one the [[tie-rule|tie rule]] picks.") }, c1);
      var c2 = H("div", { class: "lx-xcard lx-sb-chart" }, res); H("h3", { text: "What 1 MW more room is worth, from the LP" }, c2);
      U.table(c2, ["District", "Busiest hour", "Limit", "Upgrade bought", "1 MW more room saves a year", "Hours it binds"], R.dist.map(function (d) {
        return [d.label, kilo(d.peak) + " MW", kilo(d.limit) + " MW", kilo(d.upg) + " MW", d.value == null ? "–" : "$" + kilo(d.value), kilo(d.bindHours)];
      }), "sb3-val");
      H("p", { class: "lx-hint", html: LX.rich("The value is the substation row's [[shadow-price|dual]], summed over the hours it binds: a marginal value under stated assumptions (this plan, 2025's prices, the eight days), not a market price. Where the plan buys an upgrade it equals the upgrade's yearly cost per MW.") }, c2);
      var c3 = H("div", { class: "lx-xcard lx-sb-chart" }, res); H("h3", { text: "Yearly cost and CO₂ against 2025" }, c3);
      U.costTable(c3, R);
      var co2 = R.acc.co2, co20 = R.base.acc.co2;
      U.table(c3, ["CO₂, t a year", "2025", "Your plan"], [["Electricity bought (eGRID 2023 SPP North, plus 5% losses)", kilo(co20.elec), kilo(co2.elec)], ["Gas, including the network's boiler", kilo(co20.gas + co20.boiler), kilo(co2.gas + co2.boiler)],
        ["Propane", kilo(co20.propane), kilo(co2.propane)], ["Cars' gasoline", kilo(co20.gasoline), kilo(co2.gasoline)], { cls: "e3-tot", cells: ["Total, the three districts", kilo(R.base.acc.co2Hub), kilo(R.acc.co2Hub)] }], "sb3-co2");
      H("p", { class: "lx-hint", text: "Money in 2025 dollars: energy at Kansas's 2025 prices, equipment and upgrades as yearly payments at 4% real over their lives. CO₂ is location-based and operating only: an annual average grid rate, not the hour's." }, c3);
      var c4 = H("div", { class: "lx-xcard lx-sb-chart" }, res); H("h3", { text: "Who pays: a screening estimate by household group" }, c4);
      U.hhTable(c4, R);
      var ul = H("ul", { class: "e3-notes" }, c4);
      ["Not from the LP: an accounting layer after it. An energy model does not produce these outcomes by itself.",
        "Adopters: " + S.fields.filter(function (f) { return f.id === "rule"; })[0].names[R.sys.rule].toLowerCase() + "; each adopting home changes by its district's average, scaled by its group's use.",
        "Upgrades and batteries add $" + R.hh.adder.toFixed(2) + " per MWh to every kWh in the districts." + (R.hh.dhPrice > 0 ? " District heat is billed at its average cost, $" + kilo(R.hh.dhPrice) + " per MWh of heat." : ""),
        "Burden = home energy bills ÷ income (DOE LEAD's definition): equipment bought by households and car prices are not in it; motor fuel is shown apart."].forEach(function (t) { H("li", { text: t }, ul); });
    }

    // ---- how the engine works
    var x = document.getElementById("sb3-explain"); x.innerHTML = "";
    U.hubDiagram(H("div", { class: "lx-xcard" }, x));
    LX.Boundary(H("div", { class: "lx-xcard" }, x), { title: "Where the engine's answer holds",
      holds: ["eight representative days stand for 2025 (weights add to 365), with a cold design day and the summer peak day kept", "each district's substation is one ceiling on each hour's flow (a linearized feeder limit)",
        "batteries, the heat store and managed charging only shift energy within a day", "2025's prices, people, homes and weather; costs fixed in 2025 dollars, whatever is built"],
      leaves: ["power flow inside a district: voltage and each feeder's own limit (A17)", "outages and cold snaps colder than the design day", "how fast the plan could be built, and who decides it", "how bills are really set: the household table is a screening estimate"],
      source: "Prairie City is fictional; its numbers are illustrative. Prices: EIA, Kansas 2025; 2025 dollars." });

    // ---- the first run, once the bench is in view (the solver loads then: about 3.5 MB, once)
    var started = false;
    function start() { if (started) return; started = true; run.run(plan); }
    if (typeof IntersectionObserver !== "undefined") {
      var io = new IntersectionObserver(function (es) { if (es.some(function (e) { return e.isIntersecting; })) { io.disconnect(); start(); } }, { rootMargin: "200px" });
      io.observe(root); io.observe(rh);
    } else start();

    // ---- demo states (screenshots): mid (electrify heat and cars), noup (the same, upgrades not allowed), fail, tl
    LX.demo(root, function (s) {
      started = true;
      if (s === "mid" || s === "done") { change(E3.withPreset(plan, E3.presets[1])); run.run(plan); return { view: "mid" }; }
      if (s === "noup") { change(Object.assign(E3.withPreset(plan, E3.presets[1]), { up: "no" })); run.run(plan); return { view: "mid" }; }
      if (s === "fail") { stub = "fail"; run.run(plan); return { view: "fail" }; }
      if (s === "tl") { stub = "tl"; run.run(plan); return { view: "tl" }; }
      return null;
    });
  });
})();
