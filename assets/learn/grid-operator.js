// learn/grid-operator.js — Lesson 0, "Be the grid operator for a day" (Learn pilot, 2026-11-02).
//
// Toy model (illustrative; Prairie Town is fictional). One day in 24 hourly steps. Each hour has a demand d (MW) and an
// available output from the wind and solar farms (share of farm size x farm size). The nuclear plant runs flat. The reader
// sets two gas plants: a combined-cycle plant (0-200 MW, may change at most `ramp` MW from one hour to the next) and a
// peaker (0-100 MW, no ramp limit). Settling an hour:
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
// what is still missing (up to its size); any surplus spills wind and solar. Planning the whole day at once (an
// optimization over all 24 hours) can do slightly better by warming up the slow plant before the evening peak; the
// Node test computes that optimum for comparison (_tests/learn/test_grid_operator.js).
//
// The pure model functions are exported for Node; the view needs assets/explainers/common.js (helpers) and
// assets/learn/learn.js (data loading, progress). No autoplay: the reader advances the clock.
(function () {
  "use strict";
  var HOURS = 24;

  // ---------------------------------------------------------------- pure model
  function avail(share, mw) { return Math.round(share * mw * 1000) / 1000; }

  // the fixed facts of hour t: demand and the output nobody controls
  function facts(town, day, t) {
    var f = town.fleet, d = town.days[day];
    return { t: t, demand: d.demand[t], nuclear: f.nuclear.mw, wind: avail(d.wind[t], f.wind.mw), solar: avail(d.solar[t], f.solar.mw) };
  }

  // what the combined-cycle plant can reach this hour, given last hour's output
  function ccRange(town, prev) {
    var cc = town.fleet.cc;
    return { lo: Math.max(0, prev - cc.ramp), hi: Math.min(cc.mw, prev + cc.ramp) };
  }

  // settle one hour for gas set-points cc and pk (MW)
  function settle(town, x, cc, pk) {
    var f = town.fleet, g = town.game;
    var A = x.nuclear + x.wind + x.solar + cc + pk;
    var unserved = 0, curtailed = 0, over = 0;
    if (A < x.demand - 1e-9) unserved = x.demand - A;
    else {
      var surplus = Math.max(0, A - x.demand);
      curtailed = Math.min(surplus, x.wind + x.solar);
      over = surplus - curtailed;
      if (over < 1e-9) over = 0;
    }
    var vr = x.wind + x.solar, cw = vr > 0 ? curtailed * x.wind / vr : 0;
    var imbalance = over - unserved;
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

  var SUM_KEYS = ["demand", "served", "nuclear", "windAvail", "solarAvail", "wind", "solar", "cc", "pk",
                  "unserved", "curtailed", "over", "spilled", "cost", "co2"];
  function totals(hours) {
    var s = { hours: hours.length, hoursOff: 0 };
    SUM_KEYS.forEach(function (k) { s[k] = 0; });
    hours.forEach(function (r) {
      SUM_KEYS.forEach(function (k) { s[k] += r[k]; });
      if (Math.abs(r.imbalance) > 1e-9) s.hoursOff++;
    });
    return s;
  }

  // settle a whole plan [{cc, pk}, ...]; rampOK is false if any hour leaves the combined-cycle plant's reach
  function simulate(town, day, plan) {
    var prev = town.game.startCC, hours = [], rampOK = true;
    for (var t = 0; t < plan.length; t++) {
      var r = ccRange(town, prev), p = plan[t];
      if (p.cc < r.lo - 1e-9 || p.cc > r.hi + 1e-9 || p.pk < -1e-9 || p.pk > town.fleet.peaker.mw + 1e-9) rampOK = false;
      hours.push(settle(town, facts(town, day, t), p.cc, p.pk));
      prev = p.cc;
    }
    return { hours: hours, totals: totals(hours), rampOK: rampOK };
  }

  // the expert's rule: cheapest first, one hour at a time, within ramp and size limits
  function expertPlan(town, day) {
    var prev = town.game.startCC, plan = [];
    for (var t = 0; t < HOURS; t++) {
      var x = facts(town, day, t), need = x.demand - x.nuclear - x.wind - x.solar, r = ccRange(town, prev);
      var cc = Math.min(r.hi, Math.max(r.lo, need));
      var pk = Math.min(town.fleet.peaker.mw, Math.max(0, need - cc));
      plan.push({ cc: cc, pk: pk });
      prev = cc;
    }
    return plan;
  }
  function expert(town, day) { return simulate(town, day, expertPlan(town, day)); }

  // one to three stars on reliability, cost and CO2; cost and CO2 are compared with the expert rule and need the lights on
  function stars(you, ref) {
    var rel = you.hoursOff === 0 ? 3 : you.hoursOff <= 2 ? 2 : 1;
    function vs(a, b) { var x = (a - b) / b; return x <= 0.01 ? 3 : x <= 0.05 ? 2 : 1; }
    var lightsOn = you.unserved < 1e-9;
    return { reliability: rel, cost: lightsOn ? vs(you.cost, ref.cost) : 1, co2: lightsOn ? vs(you.co2, ref.co2) : 1, lightsOn: lightsOn };
  }

  // share links: each hour's two set-points as one number (combined-cycle level x peaker levels + peaker level, in steps
  // of `step` MW), written as two base-36 characters; 24 hours -> 48 characters
  function encodePlan(plan, town) {
    var step = town.game.step, n = Math.round(town.fleet.peaker.mw / step) + 1;
    return plan.map(function (p) {
      var v = Math.round(p.cc / step) * n + Math.round(p.pk / step);
      return (v < 36 ? "0" : "") + v.toString(36);
    }).join("");
  }
  function decodePlan(str, town) {
    var step = town.game.step, n = Math.round(town.fleet.peaker.mw / step) + 1, plan = [];
    if (typeof str !== "string" || !/^[0-9a-z]{48}$/.test(str)) return null;
    for (var t = 0; t < HOURS; t++) {
      var v = parseInt(str.substr(2 * t, 2), 36), cc = Math.floor(v / n) * step, pk = (v % n) * step;
      if (cc > town.fleet.cc.mw || pk > town.fleet.peaker.mw) return null;
      plan.push({ cc: cc, pk: pk });
    }
    return plan;
  }

  var model = { HOURS: HOURS, facts: facts, ccRange: ccRange, settle: settle, totals: totals, simulate: simulate,
                expertPlan: expertPlan, expert: expert, stars: stars, encodePlan: encodePlan, decodePlan: decodePlan };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.Learn) return;

  // ---------------------------------------------------------------- view
  var LESSON = "00-grid-operator", DAY = "spring";
  var TECH = [["nuclear", "Nuclear"], ["wind", "Wind"], ["solar", "Solar"], ["cc", "Gas combined-cycle"], ["pk", "Gas peaker"]];

  function hhmm(t) { return (t < 10 ? "0" : "") + t + ":00"; }
  function money(v) { return "$" + Math.round(v).toLocaleString("en-US"); }
  function tonnes(v) { return v.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " t"; }
  function mwh(v) { return Math.round(v).toLocaleString("en-US") + " MWh"; }
  function mw(v) { return Math.round(v).toLocaleString("en-US") + " MW"; }

  function view(root, h, town) {
    var el = h.el, f = town.fleet, g = town.game, step = g.step;
    var ref = expert(town, DAY);
    var S = { t: 0, prev: g.startCC, cc: g.startCC, pk: g.startPeaker, plan: [], hours: [], done: false, shared: false, show: "you" };

    var game = el("div", { class: "lx-game" }, root);

    // header: clock and progress through the day
    var head = el("div", { class: "lx-g-head" }, game);
    var clock = el("p", { class: "lx-g-clock" }, head);
    var clockTime = el("span", { class: "lx-g-time" }, clock);
    var clockCount = el("span", { class: "lx-g-count" }, clock);
    var bar = el("div", { class: "lx-g-bar", "aria-hidden": "true" }, head);
    var barFill = el("span", {}, bar);
    var announce = el("p", { class: "visually-hidden", "aria-live": "polite" }, head);

    // the play panel: this hour's facts, the two gas controls, the gauge and the clock button
    var side = el("div", { class: "lx-g-side" }, game);
    var now = el("dl", { class: "lx-g-now" }, side);
    var nowCells = {};
    [["demand", "Demand"], ["nuclear", "Nuclear"], ["wind", "Wind"], ["solar", "Solar"]].forEach(function (k) {
      var d = el("div", { class: "lx-g-fact lx-k-" + k[0] }, now);
      el("dt", { text: k[1] }, d);
      nowCells[k[0]] = el("dd", {}, d);
    });

    var ctrls = el("div", { class: "lx-g-ctrls" }, side);
    var ccCtl = gasControl(ctrls, { key: "cc", label: "Gas combined-cycle", max: f.cc.mw, step: step, onChange: function (v) { S.cc = v; refresh(); } });
    var pkCtl = gasControl(ctrls, { key: "pk", label: "Gas peaker", max: f.peaker.mw, step: step, onChange: function (v) { S.pk = v; refresh(); } });

    var gaugeBox = el("div", { class: "lx-g-gauge" }, side);
    var gaugeTop = el("p", { class: "lx-g-hz" }, gaugeBox);
    var hzText = el("span", { class: "lx-g-hzv" }, gaugeTop);
    var hzState = el("span", { class: "lx-g-hzs" }, gaugeTop);
    var gaugeSvgBox = el("div", { class: "lx-g-meter" }, gaugeBox);
    var status = el("p", { class: "lx-g-status", "aria-live": "polite" }, gaugeBox);

    var actions = el("div", { class: "lx-g-actions" }, side);
    var nextBtn = el("button", { type: "button", class: "btn-solid lx-g-next" }, actions);
    var restartBtn = el("button", { type: "button", class: "btn-outline lx-g-restart", text: "Start over" }, actions);

    // the day chart
    var chartWrap = el("div", { class: "lx-g-chart" }, game);
    var chartTitle = el("p", { class: "lx-g-charttitle" }, chartWrap);
    var chartBox = el("div", { class: "lx-g-svg" }, chartWrap);
    var legend = el("ul", { class: "ex-legend lx-legend" }, chartWrap);
    var caption = el("p", { class: "lx-g-caption", text: "Faded bars: what nuclear, wind and solar are expected to give later today. " +
      "The gap up to the demand line is what gas will have to supply." }, chartWrap);

    // running tallies
    var tally = el("dl", { class: "lx-g-tally" }, game);
    var tCells = {};
    [["cost", "Running cost"], ["co2", "CO₂"], ["served", "Energy served"], ["unserved", "Unserved"], ["spilled", "Spilled"]].forEach(function (k) {
      var d = el("div", { class: "lx-g-t lx-t-" + k[0] }, tally);
      el("dt", { text: k[1] }, d);
      tCells[k[0]] = el("dd", {}, d);
    });

    // the debrief (filled at the end of the day)
    var debrief = el("section", { class: "lx-g-debrief", "aria-label": "End of the day" }, game);
    debrief.hidden = true;

    // ---------- controls
    function gasControl(parent, o) {
      var id = "lx-" + o.key + "-" + Math.random().toString(36).slice(2, 7);
      var wrap = el("div", { class: "lx-ctl lx-ctl-" + o.key }, parent);
      var top = el("div", { class: "lx-ctl-top" }, wrap);
      var lab = el("label", { for: id, class: "lx-ctl-label" }, top);
      el("span", { class: "lx-dot lx-bg-" + o.key, "aria-hidden": "true" }, lab);
      lab.appendChild(document.createTextNode(o.label));
      var out = el("output", { for: id, class: "lx-ctl-value" }, top);
      var row = el("div", { class: "lx-ctl-row" }, wrap);
      var minus = el("button", { type: "button", class: "lx-step", "aria-label": "Lower " + o.label + " by " + o.step + " MW", text: "−" }, row);
      var input = el("input", { type: "range", id: id, min: 0, max: o.max, step: o.step, value: 0 }, row);
      var plus = el("button", { type: "button", class: "lx-step", "aria-label": "Raise " + o.label + " by " + o.step + " MW", text: "+" }, row);
      var hint = el("p", { class: "lx-ctl-hint" }, wrap);
      var lo = 0, hi = o.max, value = 0, hintText = "";
      function show(limited) {
        input.value = value;
        out.textContent = mw(value);
        input.setAttribute("aria-valuetext", mw(value));
        input.style.setProperty("--lo", (100 * lo / o.max).toFixed(2) + "%");
        input.style.setProperty("--hi", (100 * hi / o.max).toFixed(2) + "%");
        input.style.setProperty("--fill", (100 * value / o.max).toFixed(2) + "%");
        minus.disabled = value <= lo; plus.disabled = value >= hi;
        wrap.classList.toggle("is-limited", !!limited);
        hint.textContent = limited ? limited : hintText;
      }
      function set(v, fromUser) {
        var want = Math.round(v / o.step) * o.step, clamped = Math.min(hi, Math.max(lo, want));
        value = clamped;
        var msg = fromUser && clamped !== want && o.key === "cc" ?
          "Limit reached: it changes at most " + f.cc.ramp + " MW from one hour to the next." : "";
        show(msg);
        if (fromUser) o.onChange(value);
      }
      input.addEventListener("input", function () { set(+input.value, true); });
      minus.addEventListener("click", function () { set(value - o.step, true); });
      plus.addEventListener("click", function () { set(value + o.step, true); });
      return {
        range: function (a, b, text) { lo = a; hi = b; hintText = text; set(value, false); },
        set: function (v) { set(v, false); },
        get: function () { return value; },
        disable: function (d) { input.disabled = minus.disabled = plus.disabled = d; }
      };
    }

    // ---------- legend (HTML, so it wraps on phones)
    function drawLegend() {
      while (legend.firstChild) legend.removeChild(legend.firstChild);
      TECH.forEach(function (k) {
        var li = el("li", {}, legend);
        el("span", { class: "ex-swatch lx-bg-" + k[0], "aria-hidden": "true" }, li);
        el("span", { text: k[1] }, li);
      });
      var li = el("li", {}, legend);
      el("span", { class: "lx-swatch-line", "aria-hidden": "true" }, li);
      el("span", { text: "Demand" }, li);
      li = el("li", {}, legend);
      el("span", { class: "ex-swatch lx-sw-unserved", "aria-hidden": "true" }, li);
      el("span", { text: "Unserved" }, li);
      li = el("li", {}, legend);
      el("span", { class: "ex-swatch lx-sw-spilled", "aria-hidden": "true" }, li);
      el("span", { text: "Spilled wind or solar" }, li);
    }

    // ---------- what each bar shows
    function rowFor(t) {
      if (S.done) return { mode: "past", r: (S.show === "expert" ? ref.hours : S.hours)[t] };
      if (t < S.t) return { mode: "past", r: S.hours[t] };
      if (t === S.t) return { mode: "now", r: settle(town, facts(town, DAY, t), S.cc, S.pk) };
      var x = facts(town, DAY, t);
      return { mode: "future", r: { demand: x.demand, nuclear: x.nuclear, wind: x.wind, solar: x.solar, cc: 0, pk: 0, unserved: 0, curtailed: 0, over: 0 } };
    }

    function drawChart(w) {
      var narrow = w < 520, H = narrow ? 230 : 280, YMAX = 400;
      var M = { l: narrow ? 34 : 40, r: 6, t: 22, b: 24 };
      var pw = w - M.l - M.r, ph = H - M.t - M.b;
      var x = h.scale(0, HOURS, M.l, M.l + pw), y = h.scale(0, YMAX, M.t + ph, M.t);
      h.clear(chartBox);
      var label = S.done ? (S.show === "expert" ? "The expert rule's day. " : "Your day. ") :
        "Prairie Town's day so far, hour " + (S.t + 1) + " of 24. ";
      var svg = h.svg(chartBox, { width: w, height: H, label: label + "Stacked bars show each hour's supply by plant; " +
        "a line shows demand. Future hours show only nuclear, wind and solar, so the gap up to the demand line is what gas must supply." });
      var grid = el("g", { class: "ex-grid" }, svg), axis = el("g", { class: "ex-axis" }, svg);
      [0, 100, 200, 300, 400].forEach(function (v) {
        el("line", { x1: M.l, x2: M.l + pw, y1: y(v), y2: y(v) }, grid);
        el("text", { x: M.l - 6, y: y(v) + 4, "text-anchor": "end", text: v }, axis);
      });
      el("text", { x: M.l - 6, y: M.t - 12, "text-anchor": "end", class: "lx-unit", text: "MW" }, axis);
      [0, 6, 12, 18, 24].forEach(function (v) {
        el("text", { x: x(v), y: H - 6, "text-anchor": v === 0 ? "start" : v === 24 ? "end" : "middle", text: narrow ? String(v) : hhmm(v) }, axis);
      });
      if (!S.done && S.t < HOURS) {
        el("rect", { class: "lx-nowcol", x: x(S.t), y: M.t, width: x(1) - x(0), height: ph }, svg);
      }
      var cw = x(1) - x(0), bw = Math.max(3, cw * 0.74), off = (cw - bw) / 2;
      var bars = el("g", {}, svg);
      for (var t = 0; t < HOURS; t++) {
        var row = rowFor(t), r = row.r, bx = x(t) + off, base = 0;
        var segs = [["nuclear", r.nuclear], ["wind", r.wind], ["solar", r.solar], ["cc", r.cc], ["pk", r.pk]];
        segs.forEach(function (s) {
          if (s[1] <= 0) return;
          el("rect", { class: "lx-fill-" + s[0] + (row.mode === "future" ? " lx-future" : ""), x: bx, y: y(base + s[1]), width: bw, height: y(base) - y(base + s[1]) }, bars);
          base += s[1];
        });
        if (r.unserved > 0) el("rect", { class: "lx-unserved", x: bx + 0.5, y: y(r.demand), width: bw - 1, height: y(base) - y(r.demand) }, bars);
        if (r.curtailed > 0) el("rect", { class: "lx-spilled", x: bx + 0.5, y: y(base + r.curtailed), width: bw - 1, height: y(base) - y(base + r.curtailed) }, bars);
      }
      // demand as a step line across the day
      var d = "M" + x(0).toFixed(1) + "," + y(town.days[DAY].demand[0]).toFixed(1);
      town.days[DAY].demand.forEach(function (v, t) {
        d += "V" + y(v).toFixed(1) + "H" + x(t + 1).toFixed(1);
      });
      el("path", { class: "lx-demand", d: d }, svg);
    }

    function drawGauge(w) {
      var H = 52, x = h.scale(-g.hzLimit, g.hzLimit, 8, w - 8);
      h.clear(gaugeSvgBox);
      var cur = settle(town, facts(town, DAY, Math.min(S.t, HOURS - 1)), S.cc, S.pk);
      var df = S.done ? 0 : cur.freq - 60;
      var svg = h.svg(gaugeSvgBox, { width: w, height: H, label: "Balance gauge: grid frequency " + (60 + df).toFixed(2) + " hertz." });
      var zones = [[-g.hzLimit, -0.2, "lx-z-bad"], [-0.2, -0.025, "lx-z-warn"], [-0.025, 0.025, "lx-z-ok"], [0.025, 0.2, "lx-z-warn"], [0.2, g.hzLimit, "lx-z-bad"]];
      zones.forEach(function (z) { el("rect", { class: z[2], x: x(z[0]), y: 8, width: x(z[1]) - x(z[0]), height: 9 }, svg); });
      var labels = w < 300 ? [-0.5, 0, 0.5] : [-0.5, -0.25, 0, 0.25, 0.5];
      labels.forEach(function (v) {
        var lab = v === 0 ? "60 Hz" : (60 + v).toFixed(2).replace(/(\.\d)0$/, "$1");
        el("text", { x: x(v), y: 32, "text-anchor": v === -g.hzLimit ? "start" : v === g.hzLimit ? "end" : "middle", text: lab }, svg);
      });
      var nx = x(df);
      var needle = el("g", { class: "lx-needle", transform: "translate(" + nx.toFixed(1) + ",0)" }, svg);
      el("path", { d: "M0,19 L-6,27 L6,27 Z" }, needle);
      el("rect", { x: -1.5, y: 3, width: 3, height: 17, rx: 1 }, needle);
      el("text", { x: 8, y: H - 1, class: "lx-gcap", text: "too little power" }, svg);
      el("text", { x: w - 8, y: H - 1, "text-anchor": "end", class: "lx-gcap", text: "too much power" }, svg);
    }

    // ---------- updates
    function refresh() {
      if (S.done) return;
      var x = facts(town, DAY, S.t), cur = settle(town, x, S.cc, S.pk), r = ccRange(town, S.prev);
      clockTime.textContent = hhmm(S.t) + "–" + hhmm(S.t + 1);
      clockCount.textContent = "Hour " + (S.t + 1) + " of 24";
      barFill.style.width = (100 * S.t / HOURS).toFixed(1) + "%";
      nowCells.demand.textContent = mw(x.demand);
      nowCells.nuclear.textContent = mw(x.nuclear);
      nowCells.wind.textContent = mw(x.wind);
      nowCells.solar.textContent = mw(x.solar);
      var df = cur.freq - 60;
      hzText.textContent = cur.freq.toFixed(2) + " Hz";
      var cls = Math.abs(cur.imbalance) < 1e-9 ? "ok" : Math.abs(df) < 0.2 ? "warn" : "bad";
      gaugeBox.className = "lx-g-gauge is-" + cls;
      var gasMin = cur.cc <= r.lo + 1e-9 && cur.pk <= 1e-9;
      var s;
      if (cur.unserved > 0) { hzState.textContent = "Short by " + mw(cur.unserved); s = "Too little power: the frequency falls. Turn gas up, or " + mwh(cur.unserved) + " of demand goes unserved."; }
      else if (cur.over > 0) { hzState.textContent = mw(cur.over) + " too much"; s = "Too much power, even after spilling all wind and solar: frequency rises. Turn gas down."; }
      else if (cur.curtailed > 0 && !gasMin) { hzState.textContent = "Balanced"; s = "Balanced, but " + mw(cur.curtailed) + " of free wind and solar is spilled while you burn gas. Turn gas down."; }
      else if (cur.curtailed > 0 && cur.cc > 0) { hzState.textContent = "Balanced"; s = "Balanced. The combined-cycle plant cannot slow down faster, so " + mw(cur.curtailed) + " of wind and solar is spilled."; }
      else if (cur.curtailed > 0) { hzState.textContent = "Balanced"; s = "Balanced. There is more wind and sun than the town needs, so " + mw(cur.curtailed) + " is spilled. Nothing to fix."; }
      else { hzState.textContent = "Balanced"; s = "Balanced: supply matches demand. Press Next hour."; }
      status.textContent = s;
      nextBtn.textContent = S.t === HOURS - 1 ? "Finish the day" : "Next hour →";
      redrawGauge(); redrawChart();
      chartTitle.textContent = "Prairie Town today";
    }

    function updateTally(tt) {
      tCells.cost.textContent = money(tt.cost);
      tCells.co2.textContent = tonnes(tt.co2);
      tCells.served.textContent = mwh(tt.served);
      tCells.unserved.textContent = mwh(tt.unserved);
      tCells.spilled.textContent = mwh(tt.spilled);
      tally.classList.toggle("has-unserved", tt.unserved > 0);
    }

    // set the controls' reach for the current hour; values carry over from the last hour unless given
    function startHour(values) {
      var r = ccRange(town, S.prev);
      ccCtl.range(r.lo, r.hi, "This hour: " + r.lo + "–" + mw(r.hi) + " (it changes at most " + f.cc.ramp + " MW an hour).");
      pkCtl.range(0, f.peaker.mw, "Any level from 0 to " + mw(f.peaker.mw) + ", at once.");
      if (values) { ccCtl.set(values.cc); pkCtl.set(values.pk); }
      S.cc = ccCtl.get(); S.pk = pkCtl.get();
      refresh();
    }

    function next() {
      if (S.done) return;
      var cur = settle(town, facts(town, DAY, S.t), S.cc, S.pk);
      S.plan.push({ cc: S.cc, pk: S.pk });
      S.hours.push(cur);
      S.prev = S.cc;
      updateTally(totals(S.hours));
      var msg = hhmm(S.t) + " settled: " + (Math.abs(cur.imbalance) < 1e-9 ? "balanced" : cur.unserved > 0 ? mwh(cur.unserved) + " unserved" : mwh(cur.over) + " too much") + ".";
      S.t++;
      if (S.t >= HOURS) { finish(false); return; }
      startHour();
      announce.textContent = msg + " Now " + hhmm(S.t) + ".";
    }

    function restart() {
      S.t = 0; S.prev = g.startCC; S.plan = []; S.hours = []; S.done = false; S.shared = false; S.show = "you";
      game.classList.remove("is-done");
      caption.hidden = false;
      side.hidden = false; debrief.hidden = true;
      if (location.hash.indexOf("#play=") === 0) history.replaceState(null, "", location.pathname + location.search);
      updateTally(totals([]));
      startHour({ cc: g.startCC, pk: g.startPeaker });
    }

    // ---------- end of the day
    function starRow(parent, label, n, note) {
      var row = el("div", { class: "lx-star-row" }, parent);
      el("dt", { text: label }, row);
      var dd = el("dd", {}, row);
      var st = el("span", { class: "lx-stars", role: "img", "aria-label": n + " of 3 stars" }, dd);
      for (var i = 1; i <= 3; i++) el("span", { class: i <= n ? "on" : "off", "aria-hidden": "true", text: "★" }, st);
      el("span", { class: "lx-star-note", text: note }, dd);
    }

    function verdict(you, st) {
      if (you.hoursOff > 0 && you.unserved > 0)
        return "The lights went out in " + you.hoursOff + (you.hoursOff === 1 ? " hour" : " hours") + "." + (S.shared ? " Can you do better?" : "") +
          " Watch the evening, when the sun sets and demand climbs.";
      if (you.hoursOff > 0) return "No one lost power, but the frequency drifted in " + you.hoursOff + (you.hoursOff === 1 ? " hour" : " hours") + ". Close, but not quite balanced.";
      if (you.cost < ref.totals.cost - 0.5) return "You beat the expert's rule. You planned ahead for the evening, like a real operator.";
      if (st.cost === 3 && st.co2 === 3) return "Lights on all day, at about the expert's cost. Nicely run.";
      if (you.curtailed > ref.totals.curtailed + 1) return "Lights on all day. Next time, spill less free wind and solar while gas is running.";
      return "Lights on all day. Next time, lean less on the peaker: it is the most expensive plant.";
    }

    function compareTable(parent, you, ex) {
      var tbl = el("table", { class: "lx-compare" }, parent);
      el("caption", { text: (S.shared ? "This day" : "Your day") + " and the expert rule's day, side by side" }, tbl);
      var hr = el("tr", {}, el("thead", {}, tbl));
      ["", S.shared ? "Shared day" : "You", "Expert rule"].forEach(function (s) { el("th", { scope: "col", text: s }, hr); });
      var tb = el("tbody", {}, tbl);
      [["Hours out of balance", function (z) { return String(z.hoursOff); }],
       ["Unserved energy", function (z) { return mwh(z.unserved); }],
       ["Spilled energy", function (z) { return mwh(z.spilled); }],
       ["Energy from the peaker", function (z) { return mwh(z.pk); }],
       ["Running cost", function (z) { return money(z.cost); }],
       ["CO₂", function (z) { return tonnes(z.co2); }]].forEach(function (row) {
        var tr = el("tr", {}, tb);
        el("th", { scope: "row", text: row[0] }, tr);
        el("td", { text: row[1](you) }, tr);
        el("td", { text: row[1](ex) }, tr);
      });
    }

    function finish(shared) {
      S.done = true; S.shared = shared; S.show = "you";
      var you = totals(S.hours), ex = ref.totals, st = stars(you, ex);
      game.classList.add("is-done");
      side.hidden = true; debrief.hidden = false;
      barFill.style.width = "100%";
      clockTime.textContent = shared ? "A shared day in Prairie Town" : "Day complete";
      clockCount.textContent = "24 of 24 hours";
      updateTally(you);
      while (debrief.firstChild) debrief.removeChild(debrief.firstChild);

      var h3 = el("h3", { class: "lx-d-title", tabindex: "-1", text: shared ? "Someone shared this day with you" : "How did your day go?" }, debrief);
      var sg = el("dl", { class: "lx-stargrid" }, debrief);
      starRow(sg, "Reliability", st.reliability, you.hoursOff === 0 ? "balanced every hour" : you.hoursOff + " of 24 hours out of balance");
      starRow(sg, "Cost", st.cost, money(you.cost) + " (expert rule: " + money(ex.cost) + ")");
      starRow(sg, "CO₂", st.co2, tonnes(you.co2) + " (expert rule: " + tonnes(ex.co2) + ")");
      el("p", { class: "lx-verdict", text: verdict(you, st) }, debrief);
      if (!st.lightsOn) el("p", { class: "lx-d-small", text: "Cost and CO₂ stars count only when every customer is served." }, debrief);

      var cols = el("div", { class: "lx-d-cols" }, debrief);
      var left = el("div", {}, cols);
      compareTable(left, you, ex);
      el("p", { class: "lx-d-small", html: "<strong>The expert's rule:</strong> each hour, use wind, solar and nuclear first; then the " +
        "combined-cycle plant, as far as it can move this hour; then the peaker for whatever is still missing. It does not plan ahead." }, left);

      var right = el("div", { class: "lx-dgr" }, cols);
      el("p", { class: "lx-dgr-title", text: shared ? "The operator's job has three parts" : "Your job had three parts" }, right);
      var dl = el("dl", {}, right);
      [["Decisions", "what you chose", "how much power each gas plant made, every hour."],
       ["Goal", "what you tried to keep low", "the running cost (and, if you cared, the CO₂)."],
       ["Rules", "what you could not break", "supply equals demand; no plant above its size; the combined-cycle plant moves at most " + f.cc.ramp + " MW an hour."]
      ].forEach(function (p) {
        var d = el("div", { class: "lx-dgr-item" }, dl);
        var dt = el("dt", {}, d);
        el("span", { class: "lx-dgr-k", text: p[0] }, dt);
        el("span", { class: "lx-dgr-sub", text: p[1] }, dt);
        el("dd", { text: p[2] }, d);
      });
      el("p", { class: "lx-d-small", text: "Every optimization model is built from these three parts. Lesson 10 shows how to write them down." }, right);

      var used = el("div", { class: "lx-d-concepts" }, debrief);
      el("p", { class: "lx-dgr-title", text: shared ? "Ideas in this game" : "Ideas you just used" }, used);
      var ul = el("ul", {}, used);
      [["#balancing", "Balancing", "supply has to equal demand in every hour."],
       ["#power-and-energy", "Power and energy", "the sliders set power (MW); the tallies add up energy (MWh)."],
       ["#dispatchable-and-variable", "Dispatchable and variable plants", "the gas plants can be set; wind and sun cannot be ordered up."],
       ["#cheapest-first", "Cheapest first", "free wind and solar, then the cheaper gas plant, the peaker last."]
      ].forEach(function (c) {
        var li = el("li", {}, ul);
        el("a", { href: c[0], text: c[1] }, li);
        li.appendChild(document.createTextNode(": " + c[2]));
      });

      var btns = el("div", { class: "lx-d-actions" }, debrief);
      var showBtn = el("button", { type: "button", class: "btn-outline", "aria-pressed": "false", text: "Show the expert's day on the chart" }, btns);
      showBtn.addEventListener("click", function () {
        S.show = S.show === "you" ? "expert" : "you";
        showBtn.setAttribute("aria-pressed", S.show === "expert" ? "true" : "false");
        showBtn.textContent = S.show === "expert" ? "Show " + (S.shared ? "the shared" : "your") + " day on the chart" : "Show the expert's day on the chart";
        chartTitle.textContent = S.show === "expert" ? "The expert rule's day" : (S.shared ? "The shared day" : "Your day");
        updateTally(S.show === "expert" ? ex : you);
        redrawChart();
      });
      var again = el("button", { type: "button", class: "btn-solid", text: shared ? "Play your own day" : "Play again" }, btns);
      again.addEventListener("click", function () { restart(); nextBtn.focus(); });
      if (!shared) {
        var shareBtn = el("button", { type: "button", class: "btn-outline", text: "Copy a link to this result" }, btns);
        var shareOut = el("p", { class: "lx-d-small lx-share", "aria-live": "polite" }, debrief);
        shareBtn.addEventListener("click", function () {
          var url = location.href.split("#")[0] + "#play=" + encodePlan(S.plan, town);
          var text = "I ran Prairie Town for " + money(you.cost) + " and " + tonnes(you.co2) + " of CO₂ (" +
            (you.unserved > 0 ? mwh(you.unserved) + " unserved" : "lights on all day") + "). ";
          var done = function (ok) {
            shareOut.textContent = ok ? "Link copied. It holds only your 48 gas settings; nothing is sent anywhere." : "Copy this link: ";
            if (!ok) el("input", { type: "text", readonly: "readonly", value: url, class: "lx-share-input", "aria-label": "Link to this result" }, shareOut).select();
          };
          try {
            navigator.clipboard.writeText(text + url).then(function () { done(true); }, function () { done(false); });
          } catch (e) { done(false); }
        });
        window.Learn.progress.done(LESSON);
      }
      chartTitle.textContent = shared ? "The shared day" : "Your day";
      caption.hidden = true;
      redrawChart();
      h3.focus({ preventScroll: true });
      if (!shared) debrief.scrollIntoView({ block: "nearest", behavior: h.reduced ? "auto" : "smooth" });
    }

    nextBtn.addEventListener("click", next);
    restartBtn.addEventListener("click", function () { restart(); nextBtn.focus(); });

    var redrawChart = h.responsive(chartBox, drawChart);
    var redrawGauge = h.responsive(gaugeSvgBox, drawGauge);
    h.onTheme(function () { redrawChart(); redrawGauge(); });
    drawLegend();
    updateTally(totals([]));
    startHour({ cc: g.startCC, pk: g.startPeaker });

    // a shared result in the URL (#play=...): replay it if every hour is within the plants' limits
    var m = /^#play=([0-9a-z]{48})$/.exec(location.hash || "");
    var shared = m && decodePlan(m[1], town);
    if (shared) {
      var sim = simulate(town, DAY, shared);
      if (sim.rampOK) { S.plan = shared; S.hours = sim.hours; S.t = HOURS; finish(true); }
    }
  }

  window.Learn.mount("grid-operator", view);
})();
