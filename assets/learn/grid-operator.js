// grid-operator.js — Lesson 0, "Be the grid operator for a day" (play-first form).
//
// Data: assets/learn/data/town.json (Prairie Town's fleet and the lesson's scenario; illustrative) and
// assets/learn/data/town_year.json (every hour of 2025 on the Southwest Power Pool grid, from EIA-930, as shapes).
// prepare() cuts the scenario's local day out of the year (index i = the hour ending at start_utc + i; local time =
// UTC + utcOffsetHours) and scales it to the town: demand = shape x demandPeakMW, wind and solar = shape x farm size,
// rounded to whole MW; demand is then rounded (by at most step/2) so the gas needed each hour is a multiple of the
// controls' step, so a careful player can balance exactly. Hours where solar dips well below both neighbours (a real
// passing cloud) get a cloud shade for the scene.
//
// Toy model (Prairie Town is fictional). One day in 24 hourly steps. The nuclear plant runs flat. The reader sets two
// gas plants: a combined-cycle plant (may change at most `ramp` MW from one hour to the next) and a peaker (no ramp
// limit). Settling an hour:
//   available A = nuclear + wind + solar + cc + peaker
//   A < d  -> unserved u = d - A                       (customers disconnected; frequency below 60 Hz)
//   A >= d -> surplus = A - d; wind and solar are spilled first: curtailed c = min(surplus, wind + solar);
//             any rest is over-supply o = surplus - c   (frequency above 60 Hz; the extra gas is counted as burned)
//   balance (every hour): nuclear + wind + solar + cc + peaker + u - c - o = d
//   imbalance = o - u (MW); toy frequency = 60 Hz + hzPerMW x imbalance, shown within +/- hzLimit
//   running cost = sum of cost x output (one hour, so MW x 1 h = MWh); CO2 = sum of co2 x output
// Curtailment is split between wind and solar in proportion to what each could produce.
//
// "Expert" rule (greedy, cheapest first, one hour at a time, no look-ahead): wind, solar and nuclear first; the
// combined-cycle plant takes the remaining need, clamped to what its ramp and size allow this hour; the peaker takes
// what is still missing (up to its size); any surplus spills wind and solar. greedyStep() is one hour of it from any
// combined-cycle level, so "let the rule finish the day" continues from the reader's own last hour (finishPlan()).
// CO2 is operating CO2 only (fuel burned at the plant), with illustrative rates; construction, fuel supply and
// upstream methane are outside the boundary (town.json, units.co2). Planning the whole day at once can do a
// little better by warming up the slow plant before the solar dip and the sunset; the Node test computes that optimum
// (_tests/learn/test_grid_operator.js), and every number the page states is checked against this model.
//
// The pure model is exported for Node. The view (play-first game, debrief, explain layer) uses the component library
// in assets/learn/learn.js (window.LX); see assets/learn/README.md.
(function () {
  "use strict";
  var HOURS = 24;

  // ---------------------------------------------------------------- pure model
  function daySlice(src, sc) {
    if (src && src.start_utc) {   // town_year.json: index i = the hour ending at start_utc + i (UTC)
      var t0 = Date.parse(src.start_utc + "Z"), d0 = Date.parse(sc.date + "T00:00:00Z");
      var i = Math.round((d0 - t0) / 3600000) + 1 - (sc.utcOffsetHours || 0);
      if (i < 0 || i + HOURS > src.demand.length) throw new Error("date " + sc.date + " is outside the year file");
      return { date: sc.date, demand: src.demand.slice(i, i + HOURS), wind: src.wind.slice(i, i + HOURS), solar: src.solar.slice(i, i + HOURS) };
    }
    return src.days[sc.day];       // town_days.json
  }
  function prepare(town, src, key) {
    var sc = town.scenarios[key || "lesson0"], d = daySlice(src, sc), f = town.fleet, step = sc.step;
    var wind = d.wind.map(function (v) { return Math.round(v / 1000 * f.wind.mw); });
    var solar = d.solar.map(function (v) { return Math.round(v / 1000 * f.solar.mw); });
    var raw = d.demand.map(function (v) { return v / 1000 * sc.demandPeakMW; });
    var need = raw.map(function (v, t) { return Math.round((v - f.nuclear.mw - wind[t] - solar[t]) / step) * step; });
    var demand = need.map(function (n, t) { return n + f.nuclear.mw + wind[t] + solar[t]; });
    var cloud = solar.map(function (s, t) {
      if (t < 8 || t > 17) return 0;
      var nb = (solar[t - 1] + solar[t + 1]) / 2;
      if (!(s < solar[t - 1] && s < solar[t + 1]) || nb <= 0) return 0;
      var dip = 1 - s / nb;
      return dip > (sc.cloudDip || 0.12) ? Math.min(1, dip / 0.3) : 0;
    });
    return { fleet: f, game: sc, demand: demand, wind: wind, solar: solar, need: need, rawDemand: raw, cloud: cloud,
             date: d.date || sc.date, dateLabel: sc.dateLabel || sc.date, source: (src.meta || {}).source || "" };
  }
  function facts(W, t) { return { t: t, demand: W.demand[t], nuclear: W.fleet.nuclear.mw, wind: W.wind[t], solar: W.solar[t] }; }
  function ccRange(W, prev) { var cc = W.fleet.cc; return { lo: Math.max(0, prev - cc.ramp), hi: Math.min(cc.mw, prev + cc.ramp) }; }
  function settle(W, x, cc, pk) {
    var f = W.fleet, g = W.game;
    var A = x.nuclear + x.wind + x.solar + cc + pk, unserved = 0, curtailed = 0, over = 0;
    if (A < x.demand - 1e-9) unserved = x.demand - A;
    else { var surplus = Math.max(0, A - x.demand); curtailed = Math.min(surplus, x.wind + x.solar); over = surplus - curtailed; if (over < 1e-9) over = 0; }
    var vr = x.wind + x.solar, cw = vr > 0 ? curtailed * x.wind / vr : 0, imbalance = over - unserved;
    var df = Math.max(-g.hzLimit, Math.min(g.hzLimit, imbalance * g.hzPerMW));
    return {
      t: x.t, demand: x.demand, nuclear: x.nuclear, windAvail: x.wind, solarAvail: x.solar,
      wind: x.wind - cw, solar: x.solar - (curtailed - cw), cc: cc, pk: pk,
      unserved: unserved, curtailed: curtailed, over: over, spilled: curtailed + over,
      served: x.demand - unserved, imbalance: imbalance, freq: 60 + df,
      cost: f.nuclear.cost * x.nuclear + f.wind.cost * x.wind + f.solar.cost * x.solar + f.cc.cost * cc + f.peaker.cost * pk,
      co2: f.nuclear.co2 * x.nuclear + f.wind.co2 * x.wind + f.solar.co2 * x.solar + f.cc.co2 * cc + f.peaker.co2 * pk
    };
  }
  var SUM_KEYS = ["demand", "served", "nuclear", "windAvail", "solarAvail", "wind", "solar", "cc", "pk", "unserved", "curtailed", "over", "spilled", "cost", "co2"];
  function totals(hours) {
    var s = { hours: hours.length, hoursOff: 0, hoursShort: 0 };
    SUM_KEYS.forEach(function (k) { s[k] = 0; });
    hours.forEach(function (r) { SUM_KEYS.forEach(function (k) { s[k] += r[k]; }); if (Math.abs(r.imbalance) > 1e-9) s.hoursOff++; if (r.unserved > 1e-9) s.hoursShort++; });
    return s;
  }
  function simulate(W, plan) {
    var prev = W.game.startCC, hours = [], rampOK = true;
    for (var t = 0; t < plan.length; t++) {
      var r = ccRange(W, prev), p = plan[t];
      if (p.cc < r.lo - 1e-9 || p.cc > r.hi + 1e-9 || p.pk < -1e-9 || p.pk > W.fleet.peaker.mw + 1e-9) rampOK = false;
      hours.push(settle(W, facts(W, t), p.cc, p.pk)); prev = p.cc;
    }
    return { hours: hours, totals: totals(hours), rampOK: rampOK };
  }
  // one hour of the cheapest-first rule, starting from the combined-cycle level `prev` of the hour before
  function greedyStep(W, prev, t) {
    var r = ccRange(W, prev), need = W.need[t];
    var cc = Math.min(r.hi, Math.max(r.lo, need));
    return { cc: cc, pk: Math.min(W.fleet.peaker.mw, Math.max(0, need - cc)) };
  }
  // the reader's hours so far, then the rule for the rest of the day, continuing from the reader's last set-point
  function finishPlan(W, played) {
    var plan = (played || []).slice(0, HOURS), prev = plan.length ? plan[plan.length - 1].cc : W.game.startCC;
    for (var t = plan.length; t < HOURS; t++) { var p = greedyStep(W, prev, t); plan.push(p); prev = p.cc; }
    return plan;
  }
  function expertPlan(W) { return finishPlan(W, []); }
  function expert(W) { return simulate(W, expertPlan(W)); }
  // the expert's hour t as a path through the operator's flowchart, with the numbers that drive it
  function trace(W, t) {
    var plan = expertPlan(W), p = plan[t], before = t ? plan[t - 1].cc + plan[t - 1].pk : W.game.startCC + W.game.startPeaker;
    var prevCC = t ? plan[t - 1].cc : W.game.startCC, gap = W.need[t] - before, r = settle(W, facts(W, t), p.cc, p.pk);
    var path = ["start", "q1"], o = { t: t, gap: gap, ccStep: p.cc - prevCC, pk: p.pk, pkStep: p.pk - (t ? plan[t - 1].pk : 0), spill: r.curtailed };
    if (gap > 0) { path.push("a1", "q2"); if (p.pk > 0) path.push("a2"); }
    else if (gap < 0) path.push("q3", "a3");
    else path.push("q3");
    path.push("end"); o.path = path;
    return o;
  }
  // one to three stars on lights, cost and CO2; cost and CO2 are compared with the expert rule and need every light on
  function stars(you, ref) {
    function vs(a, b) { var x = (a - b) / b; return x <= 0.01 ? 3 : x <= 0.05 ? 2 : 1; }
    var lightsOn = you.unserved < 1e-9;
    return { reliability: you.hoursShort === 0 ? 3 : you.hoursShort <= 2 ? 2 : 1, cost: lightsOn ? vs(you.cost, ref.cost) : 1,
             co2: lightsOn ? vs(you.co2, ref.co2) : 1, lightsOn: lightsOn };
  }
  // mission targets: 5% above the expert rule, rounded to $500 and 5 t
  function targets(W) { var ex = expert(W).totals; return { budget: Math.round(ex.cost * 1.05 / 500) * 500, cap: Math.round(ex.co2 * 1.05 / 5) * 5 }; }
  // share links: each hour's two set-points as two base-36 characters; 24 hours -> 48 characters
  function encodePlan(plan, W) {
    var step = W.game.step, n = Math.round(W.fleet.peaker.mw / step) + 1;
    return plan.map(function (p) { var v = Math.round(p.cc / step) * n + Math.round(p.pk / step); return (v < 36 ? "0" : "") + v.toString(36); }).join("");
  }
  function decodePlan(str, W) {
    var step = W.game.step, n = Math.round(W.fleet.peaker.mw / step) + 1, plan = [];
    if (typeof str !== "string" || !/^[0-9a-z]{48}$/.test(str)) return null;
    for (var t = 0; t < HOURS; t++) {
      var v = parseInt(str.substr(2 * t, 2), 36), cc = Math.floor(v / n) * step, pk = (v % n) * step;
      if (cc > W.fleet.cc.mw || pk > W.fleet.peaker.mw) return null;
      plan.push({ cc: cc, pk: pk });
    }
    return plan;
  }
  var model = { HOURS: HOURS, prepare: prepare, facts: facts, ccRange: ccRange, settle: settle, totals: totals, simulate: simulate,
                greedyStep: greedyStep, finishPlan: finishPlan, expertPlan: expertPlan, expert: expert, trace: trace, stars: stars, targets: targets, encodePlan: encodePlan, decodePlan: decodePlan };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H, F = LX.fmt, LESSON = "00-grid-operator";
  // 06:00: demand climbs (237 -> 253 MW, from the day's data; the test checks it). Where must the extra power come from?
  var MORNING = {
    options: [{ value: "saved", label: "Power saved overnight" }, { value: "wires", label: "Power held in the wires" }, { value: "plants", label: "Plants, this same hour" }],
    feedback: { saved: "Prairie Town has no [[energy-storage|storage]], so nothing was saved. Real grids store some, in batteries for example (lesson 9).",
                wires: "Wires carry power but hold almost none of it.",
                plants: "With no storage, plants must make the extra power in the same hour it is used." }
  };
  var PRED = {
    q: "The sun is going down, but the town is still busy. Who fills the gap?",
    options: [{ value: "nuclear", label: "Nuclear", color: "var(--lx-nuc)" }, { value: "wind", label: "Wind", color: "var(--lx-wind)" },
              { value: "solar", label: "Solar", color: "var(--lx-solar)" }, { value: "gas", label: "Gas", color: "var(--lx-cc)" }],
    feedback: { nuclear: "Nuclear already runs flat out all day; it has nothing extra to give.",
                wind: "The wind picks up a little tonight, but nobody can order it to blow.",
                solar: "The sun is down, so solar is close to zero.",
                gas: "Gas is the only plant you can turn up when you need it." }
  };

  function view(live, data, root) {
    var W = prepare(data.town, data.town_year, "lesson0"), f = W.fleet, g = W.game;
    var EX = expert(W), EXP = expertPlan(W), TG = targets(W);
    var maxDemand = Math.max.apply(null, W.demand);
    var dips = W.cloud.map(function (c, t) { return c > 0 ? t : -1; }).filter(function (t) { return t >= 0; });
    var cloudH = dips.length ? dips[0] : -1;
    var EVE = 17, HOOK = 6, GAS_AT = 19;

    // ---- missions, then the stage (scene + meters) beside the control panel
    var ms = LX.Missions(live, [
      { id: "lights", label: "Keep every light on until midnight", short: "Lights on", main: true },
      { id: "cost", label: "Spend under " + F.money(TG.budget), short: "Under " + F.money(TG.budget) },
      { id: "co2", label: "Emit under " + F.int(TG.cap) + " t CO₂", short: "Under " + F.int(TG.cap) + " t" }
    ]);
    H("p", { class: "lx-hint lx-unitkey", html: LX.rich("Units: [[megawatt|MW]] is power now · [[megawatt-hour|MWh]] is energy, MW × hours · " +
      "[[frequency|Hz]] is cycles per second · t is metric tonnes (1,000 kg).") }, live);
    var lay = H("div", { class: "lx-play" }, live);
    var left = H("div", { class: "lx-play-stage" }, lay), panel = H("div", { class: "lx-play-panel lx-stepcard" }, lay);
    var deb = H("div", { class: "lx-debrief lx-stepcard", hidden: true, tabindex: "-1" }, lay);
    var scene = LX.Scene(left, { max: { wind: f.wind.mw, solar: f.solar.mw, cc: f.cc.mw, pk: f.peaker.mw, demand: maxDemand } });
    var meters = LX.Meters(left, { maxMW: maxDemand });
    H("div", { class: "lx-bal-note", text: "Illustrative indicator of imbalance" }, meters.dial);
    // the scene's numbers are pictures (aria-hidden): the same hour as a table for screen readers
    var nowTab = H("table", { class: "lx-sr" }, left), nowCap = H("caption", null, nowTab), nowBody = H("tbody", null, nowTab);
    function nowTable(x) {
      nowCap.textContent = "This hour, " + F.hh(x.t) + ", in MW (megawatts)";
      nowBody.innerHTML = "";
      [["Demand", x.demand], ["Nuclear", x.nuclear], ["Wind available", x.windAvail], ["Solar available", x.solarAvail], ["Gas combined-cycle", x.cc],
       ["Gas peaker", x.pk], ["Short (unserved demand)", x.unserved], ["Spilled", x.spilled]].forEach(function (r) {
        var tr = H("tr", null, nowBody); H("th", { scope: "row", text: r[0] }, tr); H("td", { text: Math.round(r[1]) + " MW" }, tr);
      });
    }
    var links = H("p", { class: "lx-play-links" }, live);
    var retour = H("button", { class: "lx-link", type: "button", text: "Show the three tips again" }, links);
    links.appendChild(document.createTextNode(" · "));
    var finishBtn = H("button", { class: "lx-link", type: "button", text: "Short on time? Let the cheapest-first rule finish the day" }, links);

    // ---- the control panel
    var head = H("div", { class: "lx-ghead" }, panel);
    var clock = H("div", { class: "lx-gclock", "aria-live": "polite", "aria-atomic": "true" }, head);
    var livePill = H("div", { "aria-hidden": "true" }, head);
    var stripBox = H("div", { "aria-hidden": "true" }, panel), strip = H("div", { class: "lx-hstrip" }, stripBox), cells = [];
    for (var i = 0; i < 24; i++) cells.push(H("span", null, strip));
    var sl = H("div", { class: "lx-hstrip-l" }, stripBox); ["00:00", "06:00", "12:00", "18:00", "24:00"].forEach(function (t) { H("span", { text: t }, sl); });
    var evBox = H("div", { class: "lx-events", "aria-live": "polite" }, panel);
    var ctl = H("div", { class: "lx-gctl" }, panel);
    var cc = LX.Slider(ctl, { label: "Gas combined-cycle", cls: "lx-ctl-cc", color: "var(--lx-cc)", max: f.cc.mw, step: g.step, onChange: refresh,
      hint: function (lo, hi, max) { return "$" + f.cc.cost + "/MWh, the cheaper gas plant. " + (lo === 0 && hi === max ? "It changes by at most " + f.cc.ramp + " MW per hour." : "This hour it can reach " + lo + " to " + hi + " MW ([[ramp-rate|ramp limit]]: " + f.cc.ramp + " MW per hour)."); } });
    var pk = LX.Slider(ctl, { label: "Gas peaker", cls: "lx-ctl-pk", color: "var(--lx-pk)", max: f.peaker.mw, step: g.step, onChange: refresh,
      hint: function () { return "$" + f.peaker.cost + "/MWh, the costly gas plant. It can jump to any level at once."; } });
    var next = H("button", { class: "lx-btn lx-gnext", type: "button" }, panel);
    var tal = H("div", { class: "lx-tallies" }, panel);
    function tally(label) { var d = H("div", { class: "lx-tally" }, tal); H("span", { text: label }, d); return H("b", null, d); }
    var tCost = tally("Running cost"), tCo2 = tally("CO₂"), tLit = tally("Lights on");
    var ops = H("details", { class: "lx-ops" }, panel);
    H("summary", { html: LX.icon("chart") + "Operator's view: the day as a chart" }, ops);
    var SERIES = [["nuclear", "Nuclear", "var(--lx-nuc)"], ["solar", "Solar", "var(--lx-solar)"], ["wind", "Wind", "var(--lx-wind)"], ["cc", "Gas CC", "var(--lx-cc)"], ["pk", "Peaker", "var(--lx-pk)"]]
      .map(function (s) { return { key: s[0], label: s[1], color: s[2] }; });
    var chart = LX.DayChart(ops, { series: SERIES, demand: W.demand, rows: function () { return S_.rows; }, yMax: 400, label: "Hourly output by plant for the hours played, with demand for the whole day." });
    ops.addEventListener("toggle", function () { if (ops.open) chart.render(); });

    var S_ = null;
    function reset() {
      S_ = { t: 0, prev: g.startCC, rows: [], plan: [], done: false, cost: 0, co2: 0, short: 0, pause: false, rampHit: [], pkHours: 0, minF: 60, maxF: 60,
             gasAt: null, hookDone: false, hookSkipped: false, predPick: null, predDone: false };
      cc.range(0, f.cc.mw); cc.set(g.startCC); pk.set(g.startPeaker);
      deb.hidden = true; panel.hidden = false; links.hidden = false; evBox.innerHTML = ""; cells.forEach(function (c) { c.className = ""; });
      scene.event(""); setRange(); refresh(); fireEvents();
    }
    function setRange() { var r = ccRange(W, S_.prev); cc.range(r.lo, r.hi); }
    function preview() { return settle(W, facts(W, S_.t), cc.val(), pk.val()); }
    function sceneState(x, t) { return { h: t + 0.5, demand: x.demand, wind: x.wind, solar: x.solar, nuclear: x.nuclear, cc: x.cc, pk: x.pk, unserved: x.unserved, cloud: W.cloud[t] }; }
    function refresh() {
      if (!S_ || S_.done) return;
      var x = preview();
      scene.set(sceneState(x, S_.t)); meters.set(x); nowTable(x);
      clock.innerHTML = F.hh(S_.t) + "<small>Hour " + (S_.t + 1) + " of 24</small>";
      var im = x.imbalance;
      livePill.innerHTML = Math.abs(im) < 0.5 ? '<span class="lx-pill good">' + LX.icon("check") + "60.00 Hz</span>" : im < 0 ? '<span class="lx-pill bad">Short ' + Math.round(-im) + " MW</span>" : '<span class="lx-pill warn">Over ' + Math.round(im) + " MW</span>";
      cells.forEach(function (c, k) { c.classList.toggle("now", k === S_.t); });
      next.innerHTML = (S_.t === 23 ? "Finish the day" : "Next hour") + LX.icon("arrow");
      next.disabled = !!S_.pause;
      tCost.textContent = F.money(S_.cost); tCo2.textContent = F.tonnes(S_.co2); tLit.textContent = (S_.t - S_.short) + "/" + S_.t + " h";
      missions();
    }
    function missions() {
      var lit = S_.t - S_.short, end = S_.t >= 24;
      ms.set("lights", { frac: lit / 24, text: S_.short ? S_.short + " h dark" : lit + "/24 h lit", fail: S_.short > 0, won: end && !S_.short });
      ms.set("cost", { frac: S_.cost / TG.budget, text: F.money(S_.cost), fail: S_.cost > TG.budget, won: end && S_.cost <= TG.budget });
      ms.set("co2", { frac: S_.co2 / TG.cap, text: F.tonnes(S_.co2), fail: S_.co2 > TG.cap, won: end && S_.co2 <= TG.cap });
    }
    next.addEventListener("click", advance);
    function advance() {
      if (S_.done || S_.pause) return;
      var r = ccRange(W, S_.prev), x = preview(), need = W.need[S_.t];
      if ((cc.val() === r.lo && r.lo > 0 && need < r.lo) || (cc.val() === r.hi && r.hi < f.cc.mw && need > r.hi)) S_.rampHit.push(S_.t);
      S_.rows.push(x); S_.plan.push({ cc: cc.val(), pk: pk.val() });
      S_.cost += x.cost; S_.co2 += x.co2; if (x.unserved > 0) S_.short++; if (x.pk > 0) S_.pkHours++;
      S_.minF = Math.min(S_.minF, x.freq); S_.maxF = Math.max(S_.maxF, x.freq);
      if (S_.t === GAS_AT) S_.gasAt = x.cc + x.pk;
      cells[S_.t].className = x.unserved > 0 ? "short" : x.over > 0 || x.curtailed > 0 ? "over" : "ok";
      S_.prev = cc.val(); S_.t++;
      if (ops.open) chart.render();
      if (S_.t >= 24) return finish();
      setRange(); refresh(); fireEvents();
    }
    function pause(on) { S_.pause = on; refresh(); }
    function fireEvents() {
      evBox.innerHTML = ""; scene.event("");
      var t = S_.t;
      if (t === cloudH) {
        var e = H("div", { class: "lx-event" }, evBox);
        e.innerHTML = LX.icon("cloud") + "<div><b>" + F.hh(t) + "</b> Solar output dips from " + W.solar[t - 1] + " to <b>" + W.solar[t] + " MW</b>, as in the real day's data. The picture shows one possible cause: passing clouds.</div>";
        scene.event("Solar dips: " + W.solar[t - 1] + " → " + W.solar[t] + " MW");
      }
      if (t === HOOK && !S_.hookDone) {
        pause(true);
        var c = H("div", { class: "lx-ecard" }, evBox);
        H("p", { class: "lx-etime", text: F.hh(t) + " · Morning" }, c);
        var pr = LX.Predict(c, { id: "g0-morning", q: "Demand climbs from " + W.demand[t - 1] + " to " + W.demand[t] + " MW this hour. Where must the extra power come from?",
          options: MORNING.options, answer: "plants", feedback: MORNING.feedback, fresh: true,
          onPick: function () {
            pr.reveal("Now raise your gas to match."); S_.hookDone = true; skip.hidden = true;
            var go = H("button", { class: "lx-btn small", type: "button", html: "Back to my shift" + LX.icon("arrow") }, c);
            go.addEventListener("click", function () { evBox.innerHTML = ""; pause(false); next.focus(); });
            pause(true);
          } });
        var skip = H("button", { class: "lx-link", type: "button", text: "Skip this question", onclick: function () { S_.hookSkipped = S_.hookDone = true; evBox.innerHTML = ""; pause(false); } }, c);
      }
      if (t === EVE && !S_.predDone) {
        pause(true);
        var c2 = H("div", { class: "lx-ecard" }, evBox);
        H("p", { class: "lx-etime", text: F.hh(t) + " · Sunset is coming" }, c2);
        LX.Predict(c2, { id: "g0-evening", q: PRED.q, options: PRED.options, answer: "gas", feedback: PRED.feedback, fresh: true,
          lockText: "Locked in. Watch the next hours.", onPick: function (p) { S_.predPick = p; S_.predDone = true; pause(false); } });
      }
      if (t === GAS_AT + 1 && S_.predPick) {
        var c3 = H("div", { class: "lx-event" }, evBox), ok = S_.predPick === "gas";
        c3.innerHTML = LX.icon(ok ? "check" : "question") + "<div><b>Your prediction: " + (ok ? "gas. Right." : S_.predPick + ". Not quite.") + "</b> " +
          LX.rich(PRED.feedback[S_.predPick]) + " At " + F.hh(GAS_AT) + " your gas plants made <b>" + Math.round(S_.gasAt || 0) + " MW</b>.</div>";
      }
      LX.emit("layout");
    }
    function finish() {
      S_.done = true; missions(); links.hidden = true;
      var you = totals(S_.rows), st = stars(you, EX.totals), lightsOn = S_.short === 0;
      var log = { short: S_.short, minF: S_.minF, maxF: S_.maxF, rampHit: S_.rampHit, pkHours: S_.pkHours, cost: S_.cost, co2: S_.co2, spilled: you.spilled };
      LX.store.set("g0-log", log); LX.progress.done(LESSON); LX.emit("g0-done", log);
      panel.hidden = true; deb.hidden = false; deb.innerHTML = "";
      var h = H("div", { class: "lx-deb-head" }, deb);
      H("h3", { text: lightsOn ? "Shift complete. Every light stayed on." : "Shift complete. " + S_.short + (S_.short === 1 ? " hour" : " hours") + " had blackouts." }, h);
      H("a", { class: "lx-btn small", href: "#explain", html: "See what you did, as diagrams" + LX.icon("arrow") }, h);
      LX.Stars(deb, [{ label: "Lights on", n: st.reliability, value: (24 - S_.short) + "/24 h" },
                     { label: "Cost", n: st.cost, value: F.money(S_.cost) }, { label: "CO₂", n: st.co2, value: F.tonnes(S_.co2) }]);
      H("p", { class: "lx-hint", text: "The cheapest-first rule: " + F.money(EX.totals.cost) + " and " + F.tonnes(EX.totals.co2) + ", every light on. Planning ahead can beat it: warm the combined-cycle plant up before the solar dip and the sunset." }, deb);
      var NOTES = [
        { icon: "scale", title: "Balance", text: "Supply must equal demand at every moment.", moment: "You kept the beam level for " + (24 - you.hoursOff) + " of 24 hours.", got: true },
        { icon: "lamp", title: "Made as it is used", text: "With no storage, plants must make each extra MW in the hour it is needed.", moment: "06:00: demand went from " + W.demand[HOOK - 1] + " to " + W.demand[HOOK] + " MW.", got: S_.hookDone && !S_.hookSkipped, lock: "Answer the 06:00 question to collect this." },
        { icon: "wave", title: "Frequency", text: "60 Hz is the grid's pulse; short of power, it falls.", moment: "Your lowest reading: " + S_.minF.toFixed(2) + " Hz.", got: S_.minF < 59.995 || S_.maxF > 60.005, lock: "Let supply fall short once to collect this." },
        { icon: "cloud", title: "Variable vs dispatchable", text: "Wind and sun follow the weather; gas follows your orders.", moment: cloudH >= 0 ? "The " + F.hh(cloudH) + " solar dip: " + W.solar[cloudH - 1] + " → " + W.solar[cloudH] + " MW." : "", got: true },
        { icon: "ramp", title: "Ramp limit", text: "The combined-cycle plant changes by " + f.cc.ramp + " MW per hour at most.", moment: S_.rampHit.length ? "You hit it at " + F.hh(S_.rampHit[0]) + "." : "", got: S_.rampHit.length > 0, lock: "Push the combined-cycle plant to its limit to collect this." },
        { icon: "stairs", title: "Merit order", text: "[[merit-order|Cheapest first]]: $" + f.cc.cost + "/MWh gas before the $" + f.peaker.cost + "/MWh peaker.", moment: "You ran the peaker for " + S_.pkHours + (S_.pkHours === 1 ? " hour." : " hours."), got: true }
      ];
      var got = NOTES.filter(function (x) { return x.got; }).length;
      H("h4", { class: "lx-deb-notes", text: "Notes collected: " + got + " of " + NOTES.length }, deb);
      LX.Notes(deb, NOTES.map(function (x) { x.link = { href: "#explain", text: "On the concept map" }; return x; }));
      var ops2 = H("details", { class: "lx-ops" }, deb);
      H("summary", { html: LX.icon("chart") + "Operator's view: your day as a chart" }, ops2);
      var ch2 = LX.DayChart(ops2, { series: SERIES, demand: W.demand, rows: function () { return S_.rows; }, yMax: 400, label: "Your hourly output by plant, with demand." });
      ops2.addEventListener("toggle", function () { if (ops2.open) ch2.render(); });
      H("button", { class: "lx-btn ghost small", type: "button", text: "Play the day again", onclick: function () { reset(); panel.scrollIntoView({ block: "nearest" }); } }, deb);
      var last = S_.rows[23]; scene.set(sceneState(last, 23)); meters.set(last);
      deb.focus({ preventScroll: true });
      LX.emit("layout");
    }
    function autoplay(upto, answer) {
      var guard = 0;
      while (!S_.done && S_.t < upto && guard++ < 60) {
        if (S_.t === HOOK && !S_.hookDone) { S_.hookDone = true; S_.hookSkipped = !answer; }
        if (S_.t === EVE && !S_.predDone) { S_.predDone = true; S_.predPick = answer ? "gas" : null; }
        var p = greedyStep(W, S_.prev, S_.t);   // the rule from the reader's own last hour, not a precomputed day
        S_.pause = false; setRange(); cc.set(p.cc); pk.set(p.pk); advance();
      }
    }
    finishBtn.addEventListener("click", function () { tour.end(true); autoplay(24, false); deb.scrollIntoView({ block: "start", behavior: LX.reduced() ? "auto" : "smooth" }); });
    var tour = LX.Coach(root, [
      { el: cc.el, text: "This is your gas plant. Slide it to make more or less power." },
      { el: meters.beam, text: "Keep this beam level. Level means supply equals demand, and every home has power." },
      { el: next, text: "Happy with this hour? Move the clock on. 24 hours to go." }
    ], { key: "g0-coach" });
    retour.addEventListener("click", function () { root.scrollIntoView({ block: "start" }); setTimeout(function () { tour.start(0, true); }, 60); });
    reset();
    // the tour starts once the first control is fully in view (at once on wide screens; after a scroll on phones)
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (es) {
        if (es.some(function (e) { return e.isIntersecting; })) { io.disconnect(); setTimeout(function () { if (!S_.done && S_.t === 0) tour.start(0); }, 350); }
      }, { threshold: 0.95 });
      io.observe(cc.el);
    }
    // hooks for the screenshot script and for curious readers in the console
    root.lxGame = { autoplay: autoplay, set: function (a, b) { cc.set(a); pk.set(b); refresh(); }, state: function () { return S_; }, tour: tour, model: model, world: W };
    // demo states (README, LX.demo): "morning" stops at the 06:00 question; "finish" plays 75/45 MW at 00:00 and 35/80 MW at
    // 01:00 by hand, then lets the rule finish the day from there (it must keep every light on)
    LX.demo(root, function (state) {
      if (state === "morning") { tour.end(true); reset(); autoplay(HOOK, false); return { view: "the 06:00 question" }; }
      if (state === "finish") {
        tour.end(true); reset();
        [[75, 45], [35, 80]].forEach(function (p) { cc.set(p[0]); pk.set(p[1]); refresh(); advance(); });
        finishBtn.click(); return { view: "auto-finish from the reader's 01:00" };
      }
      return null;
    });
    buildExplain(W, EX, EXP);
  }

  // ---------------------------------------------------------------- the explain layer: diagrams, using the player's numbers
  function buildExplain(W, EX, EXP) {
    var host = document.getElementById("g0-explain"); if (!host) return;
    host.innerHTML = ""; host.classList.add("is-live");
    var f = W.fleet, F2 = F, cloudH = W.cloud.findIndex(function (c) { return c > 0; });
    var log = function () { return LX.store.get("g0-log", null); };
    var maxD = Math.max.apply(null, W.demand), peakH = W.demand.indexOf(maxD);
    var GROUPS = { units: ["Units", "var(--lx-tier-2)"], bal: ["Balance", "var(--lx-good)"], plants: ["Plants", "var(--lx-cc)"], choice: ["The operator's problem", "var(--lx-tier-3)"] };
    var later = "Later: lesson 10 writes decisions, goal and rules down as a small optimization model.";
    var c1 = H("div", { class: "lx-xcard" }, host);
    var cmap = LX.ConceptMap(c1, {
      title: "The ideas, and how they connect", lede: "Tap an idea to see what it means and where it appeared in your shift.", groups: GROUPS,
      cols: 4, rows: 4, colsN: 3, rowsN: 5, sel: "balance",
      nodes: [
        { id: "power", g: "units", label: "Power (MW)", lines: ["Power", "(MW)"], at: [0, 0], atN: [0, 0], text: "How fast electricity is made or used, right now. On this day Prairie Town peaks at " + maxD + " MW, at " + F2.hh(peakH) + ".", game: "Every MW label in the scene." },
        { id: "frequency", g: "bal", label: "Frequency (Hz)", lines: ["Frequency", "(Hz)"], at: [1.6, 0], atN: [1, 0], text: "The alternating voltage completes 60 cycles each second, and generators turn in step with it. Too little power slows them; too much speeds them up.", game: "The dial next to the beam, an illustrative indicator." },
        { id: "rules", g: "choice", label: "Rules", at: [2.95, 0], atN: [2, 0], text: "What can't be broken: supply equals demand, plant sizes, ramp limits.", game: "Blackouts, the ends of each slider, the shaded band.", later: later },
        { id: "energy", g: "units", label: "Energy (MWh)", lines: ["Energy", "(MWh)"], at: [0, 1], atN: [0, 1], text: "Power kept up over time: " + f.nuclear.mw + " MW for one hour is " + f.nuclear.mw + " MWh.", game: "Your cost tally adds up MWh × $/MWh, hour by hour." },
        { id: "balance", g: "bal", label: "Balance", at: [1.6, 1], atN: [1, 1], text: "Supply must equal demand at every moment. Prairie Town has no storage; real grids also use some, such as batteries (lesson 9).", game: "The level beam, and the 06:00 question." },
        { id: "demand", g: "bal", label: "Demand", at: [2.95, 1], atN: [2, 1], text: "The power everyone in town uses this hour. On a hot day it peaks in the late afternoon.", game: "The lit windows, and the dark bar on the right of the beam." },
        { id: "goal", g: "choice", label: "Goal", at: [0, 2], atN: [0, 2], text: "What the operator keeps as low as possible: running cost, and here also CO₂.", game: "The cost and CO₂ stars.", later: later },
        { id: "decisions", g: "choice", label: "Decisions", at: [0.78, 2], atN: [1, 4], text: "What the operator chooses: each gas plant's output, every hour.", game: "48 numbers: two sliders times 24 hours.", later: later },
        { id: "supply", g: "bal", label: "Supply", at: [1.6, 2], atN: [1, 2], text: "The power all plants make this hour.", game: "The coloured stack on the left of the beam." },
        { id: "variable", g: "plants", label: "Variable plants", lines: ["Variable", "plants"], at: [2.95, 2], atN: [2, 2], text: "Wind and solar make what the weather allows; nobody can order more.", game: cloudH >= 0 ? "At " + F2.hh(cloudH) + " recorded solar output dipped from " + W.solar[cloudH - 1] + " to " + W.solar[cloudH] + " MW." : "The wind and the sun." },
        { id: "merit", g: "choice", label: "Merit order", lines: ["Merit", "order"], at: [0.4, 3], atN: [0, 3], text: "Run the cheapest plant first and the most expensive last.", game: "Combined-cycle at $" + f.cc.cost + "/MWh before the peaker at $" + f.peaker.cost + "/MWh." },
        { id: "dispatch", g: "plants", label: "Dispatchable plants", lines: ["Dispatchable", "plants"], at: [1.6, 3], atN: [1, 3], text: "Plants that change output on command, like the two gas plants.", game: "Your two sliders." },
        { id: "ramp", g: "plants", label: "Ramp limit", lines: ["Ramp", "limit"], at: [2.95, 3], atN: [2, 3], text: "How fast a plant can change. The combined-cycle plant moves at most " + f.cc.ramp + " MW per hour.", game: "The shaded band on the combined-cycle slider." }
      ],
      edges: [["power", "energy", "× hours ="], ["energy", "goal", "cost = MWh × $/MWh"], ["goal", "merit", "leads to"], ["merit", "dispatch", "sets order of"],
              ["decisions", "dispatch", "set"], ["dispatch", "supply", "you set"], ["variable", "supply", "weather sets"], ["supply", "balance", "must equal"],
              ["demand", "balance", "must equal"], ["balance", "frequency", "drift shows in"], ["rules", "balance", "include"], ["ramp", "dispatch", "limits"]],
      moment: function (id) {
        var L = log(); if (!L) return null;
        if (id === "frequency") return "Your shift: lowest " + L.minF.toFixed(2) + " Hz, highest " + L.maxF.toFixed(2) + " Hz.";
        if (id === "balance") return "Your shift: " + (24 - L.short) + " of 24 hours with every light on.";
        if (id === "ramp") return L.rampHit.length ? "Your shift: you hit it at " + F2.hh(L.rampHit[0]) + "." : "Your shift: you never hit it.";
        if (id === "merit") return "Your shift: the peaker ran for " + L.pkHours + (L.pkHours === 1 ? " hour." : " hours.");
        if (id === "goal") return "Your shift: " + F2.money(L.cost) + " and " + F2.tonnes(L.co2) + ".";
        return null;
      }
    });
    LX.on("g0-done", function () { cmap.select("balance"); });
    // flowchart, traced with three real hours of the cheapest-first rule
    var row = H("div", { class: "lx-row2" }, host), c2 = H("div", { class: "lx-xcard" }, row), c3 = H("div", { class: "lx-xcard" }, row);
    function traceText(t, why) {
      var o = trace(W, t), s = "**" + F2.hh(t) + "** · " + why + ": ";
      if (o.gap > 0) s += "short by " + o.gap + " MW → combined-cycle +" + o.ccStep + " MW" + (o.pk > 0 ? " (its ramp limit) → peaker +" + o.pkStep + " MW" : "");
      else if (o.gap < 0) s += "too much by " + (-o.gap) + " MW → combined-cycle " + o.ccStep + " MW" + (o.spill > 0 ? " (its ramp limit) → " + o.spill + " MW of wind and solar spilled" : "");
      else s += "already balanced";
      return { path: o.path, text: s + " → balanced." };
    }
    var morning = 8, eveningH = EXP.map(function (p, t) { return t >= 17 && p.pk > 0 ? t : -1; }).filter(function (t) { return t >= 0; })[0] || 18;
    var traces = [[morning, "sun rising", "the sun comes up"], [cloudH, "solar dip", "solar output dips"], [eveningH, "evening gap", "the sun goes down"]].filter(function (x) { return x[0] >= 0; })
      .map(function (x) { var tt = traceText(x[0], x[2]); return { label: F2.hh(x[0]) + " · " + x[1], path: tt.path, text: tt.text }; });
    LX.Flowchart(c2, {
      title: "The operator's hourly decision", lede: "The same questions, every hour. Trace a real hour of the cheapest-first rule through them.",
      nodes: {
        start: { t: "New hour", s: "read demand, wind and sun", k: "end" },
        q1: { t: "Short of power?", k: "q" },
        a1: { t: "Turn up the combined-cycle", tN: ["Turn up the", "combined-cycle"], s: "$" + f.cc.cost + "/MWh, the cheapest you control", sN: "$" + f.cc.cost + "/MWh" },
        q2: { t: "Ramp limit or full?", tN: ["Ramp limit", "or full?"], k: "q" },
        a2: { t: "Add the peaker", s: "$" + f.peaker.cost + "/MWh, any change at once", sN: "$" + f.peaker.cost + "/MWh" },
        q3: { t: "Too much power?", tN: ["Too much", "power?"], k: "q" },
        a3: { t: "Turn gas down", s: "peaker first; spill wind and sun last", sN: "spill sun last" },
        end: { t: "Balanced: next hour", k: "end" }
      },
      cols: 3, at: { start: [1, 0], q1: [1, 1], a1: [0, 2], q2: [0, 3], a2: [0, 4], q3: [2, 2], a3: [2, 3], end: [1, 4] },
      colsN: 2, atN: { start: [0, 0], q1: [0, 1], a1: [0, 2], q2: [0, 3], a2: [0, 4], q3: [1, 2], a3: [1, 3], end: [0.6, 5] },
      edges: [["start", "q1"], ["q1", "a1", "yes"], ["q1", "q3", "no"], ["a1", "q2"], ["q2", "a2", "yes"], ["q2", "end", "no", { dN: "M154 310 H172 V477", lN: [163, 302] }],
              ["a2", "end", null, { v: true }], ["q3", "a3", "yes"], ["q3", "end", "no", { dN: "M330 218 H348 V494 H282", lN: [338, 210] }], ["a3", "end", null, { v: true }]],
      traces: traces, sel: 1
    });
    LX.CompareTable(c3, {
      title: "The five plants", columns: [{ key: "name", label: "Plant and who decides", main: true }, { key: "size", label: "Size", num: true, phoneHide: true },
        { key: "cost", label: "Running cost, $/MWh", phone: "$/MWh", num: true, bar: { max: 100 } }, { key: "co2", label: "Operating CO₂, t/MWh", phone: "t CO₂/MWh", num: true, bar: { max: 0.6, color: "var(--lx-ink-3)" } }],
      rows: [["nuclear", "Runs flat at " + f.nuclear.mw + " MW"], ["wind", "The wind decides"], ["solar", "The sun decides"], ["cc", "You, up to " + f.cc.ramp + " MW per hour"], ["pk", "You, any change at once"]]
        .map(function (r) {
          var k = r[0], p = f[k === "pk" ? "peaker" : k];
          return { key: k, color: "var(--lx-" + (k === "nuclear" ? "nuc" : k) + ")", name: p.label.replace(" plant", k === "nuclear" ? " plant" : ""), note: r[1], size: p.mw + " MW",
                   cost: { text: "$" + p.cost, value: p.cost }, co2: p.co2 ? { text: p.co2.toFixed(2), value: p.co2 } : { text: "0" } };
        }),
      sorts: [{ label: "As built", order: ["nuclear", "wind", "solar", "cc", "pk"], note: "Sort by running cost to see the order a careful operator uses them." },
              { label: "By running cost", order: ["wind", "solar", "nuclear", "cc", "pk"], ranked: true, note: "<b>This order is the [[merit-order|merit order]].</b> Free wind and sun first, the $" + f.peaker.cost + "/MWh peaker last." }]
    });
    H("p", { class: "lx-hint", html: LX.rich("CO₂ here is [[operating-emissions|operating CO₂]] at illustrative rates: fuel burned at the plant. Building plants and supplying fuel, including methane leaks, are left out.") }, c3);
    // cause and effect at the cloud hour, with the rule's own numbers
    if (cloudH > 0) {
      var t = cloudH, o = trace(W, t), x = facts(W, t), before = EXP[t - 1].cc + EXP[t - 1].pk;
      var drop = settle(W, x, EXP[t - 1].cc, EXP[t - 1].pk);
      LX.CausalChain(H("div", { class: "lx-xcard" }, host), {
        title: "Cause and effect: the solar dip at " + F2.hh(t),
        links: [{ title: "Solar output dips", text: "Recorded on the real day; passing clouds are one possible cause.", value: W.solar[t - 1] + " → " + W.solar[t] + " MW" },
                { title: "Demand keeps rising", text: "The recorded afternoon climb goes on.", value: W.demand[t - 1] + " → " + W.demand[t] + " MW" },
                { title: "Supply falls short", text: "If gas stays at " + before + " MW.", value: "short by " + o.gap + " MW" },
                { title: "Frequency falls", text: "A shortage first pulls frequency down (the game's illustrative dial).", value: "60.00 → " + drop.freq.toFixed(2) + " Hz" },
                { title: "Gas steps in", text: "The combined-cycle to its ramp limit, the peaker for the rest.", value: "+" + o.ccStep + " MW, +" + o.pkStep + " MW" },
                { title: "Balance restored", text: "Back to 60 Hz; the lights stay on.", value: "60.00 Hz" }],
        note: "If nothing responds, protection systems switch off blocks of homes to stop the fall: the dark houses in your town. Lesson 3 goes second by second."
      });
    }
    LX.EnergyChain(H("div", { class: "lx-xcard" }, host), {
      title: "From plant to lamp", aside: "Typical U.S. values: DOE, July 2015, p. 12; homes: DOE, January 2017, p. A-6",
      lede: "Voltage goes up to travel far with small losses, then down to be safe at home. The trip takes a fraction of a second.",
      stops: [{ icon: "plant", title: "Power plant", text: "makes it", value: "5–34.5 kV" }, { icon: "tower", title: "Transmission", text: "carries it far", value: "69–765 kV" },
              { icon: "sub", title: "Substation", text: "steps it down for local lines", value: "15–34.5 kV" }, { icon: "house", title: "Home", text: "uses it", value: "120/240 V" }]
    });
  }

  LX.mount("grid-operator", function (live, data, root) { view(live, data, root); });
})();
