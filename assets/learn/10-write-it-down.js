// 10-write-it-down.js — Lesson 10, "Write it down: what are the decisions, the goal and the rules?" (step cards,
// Analyst tier; W1, 2026-11-02).
//
// Data: assets/learn/data/10-write-it-down.json (the hour, the CO2 cap, slider ranges, the ten formulation cards),
// assets/learn/data/town.json (Prairie Town's fleet; illustrative) and town_year.json (real 2025 SPP shapes).
//
// The day is lesson 0's (3 September 2025), cut and rounded exactly as grid-operator.js prepare() does. The lesson's
// two-variable linear program is one hour of it, 19:00, when gas must supply the gap left by nuclear, wind and sun:
//   decisions  x = combined-cycle output (MW), y = peaker output (MW), for one hour
//   goal       minimise cx*x + cy*y  (gas running cost in $, one hour: MW x 1 h x $/MWh; the fixed-output plant's
//              100 MW x $10/MWh = $1,000 is a constant that never moves the best plan, so the chart leaves it out)
//   rules      demand   x + y >= D        (gas covers the gap; any extra would be spilled)
//              cc size  x <= 150,  peaker size  y <= 100
//              CO2 cap  0.37 x + 0.55 y <= cap   (t of CO2 in the hour)
//              x, y >= 0 (always)
// solve2() (LX.lp2.solve, components/lpplane.js) is exact for two variables: it lists the corners (intersections of rule lines that meet every rule), tests
// the region's directions of recession for an unbounded goal, and reports one of four outcomes: optimal (one best
// corner), tied (a whole edge or ray is best), infeasible (no corner: no plan meets every rule) or unbounded (the goal
// improves without limit along a feasible direction). _tests/learn/test_10-write-it-down.js checks it against HiGHS on
// random cases, and every number the page states against this model.
//
// Shared components: LX.LPPlane and LX.lp2 (the plane and its rule algebra), LX.CardSort, LX.LinkedViews, LX.Toggle,
// LX.Slider, and in the explain layer LX.FormulateBox and LX.EquationCard (components/formulate.js, equation.js).
// The stage uses the shared model-lab classes (.lx-stage, .lx-readouts, .lx-ctls, .lx-goals in plot.css).
(function () {
  "use strict";
  var HOURS = 24;
  // the two-variable LP algebra (components/lpplane.js): window.LX.lp2 in the browser, require() in Node
  var LP = (typeof window !== "undefined" && window.LX && window.LX.lp2) || require("./components/lpplane.js");

  // ---------------------------------------------------------------- pure model (no DOM; exported for Node)
  // lesson 0's day: the same slicing and rounding as grid-operator.js prepare()
  function dayOf(town, year, key) {
    var sc = town.scenarios[key || "lesson0"], f = town.fleet, step = sc.step;
    var t0 = Date.parse(year.start_utc + "Z"), d0 = Date.parse(sc.date + "T00:00:00Z");
    var i = Math.round((d0 - t0) / 3600000) + 1 - (sc.utcOffsetHours || 0);
    var out = { date: sc.date, dateLabel: sc.dateLabel, fleet: f, startCC: sc.startCC, demand: [], wind: [], solar: [], need: [] };
    for (var t = 0; t < HOURS; t++) {
      var w = Math.round(year.wind[i + t] / 1000 * f.wind.mw), s = Math.round(year.solar[i + t] / 1000 * f.solar.mw);
      var n = Math.round((year.demand[i + t] / 1000 * sc.demandPeakMW - f.nuclear.mw - w - s) / step) * step;
      out.wind.push(w); out.solar.push(s); out.need.push(n); out.demand.push(n + f.nuclear.mw + w + s);
    }
    return out;
  }
  // the lesson's default parameters for hour h of the day
  function params(town, day, D, over) {
    var f = town.fleet, h = D.hour, p = {
      hour: h, D: day.need[h], cap: D.cap, cx: f.cc.cost, cy: f.peaker.cost, ex: f.cc.co2, ey: f.peaker.co2, X: f.cc.mw, Y: f.peaker.mw,
      on: { demand: true, cc: true, pk: true, co2: true }
    };
    if (over) for (var k in over) { if (k === "on") { for (var r in over.on) p.on[r] = over.on[r]; } else p[k] = over[k]; }
    return p;
  }
  var RULES = ["demand", "cc", "pk", "co2"];
  // the rules that are switched on, each as a.v (op) b
  function rulesOf(p) {
    var all = {
      demand: { id: "demand", a: [1, 1], op: ">=", b: p.D },
      cc: { id: "cc", a: [1, 0], op: "<=", b: p.X },
      pk: { id: "pk", a: [0, 1], op: "<=", b: p.Y },
      co2: { id: "co2", a: [p.ex, p.ey], op: "<=", b: p.cap }
    };
    return RULES.filter(function (k) { return p.on[k] !== false; }).map(function (k) { return all[k]; });
  }
  // the hour as a linear program for LX.lp2: the rules that are on, then x >= 0 and y >= 0
  function problem(p) {
    return { sense: "min", c: [p.cx, p.cy], rows: rulesOf(p).concat([{ id: "x0", a: [1, 0], op: ">=", b: 0 }, { id: "y0", a: [0, 1], op: ">=", b: 0 }]) };
  }
  function costOf(p, v) { return p.cx * v.x + p.cy * v.y; }
  function co2Of(p, v) { return p.ex * v.x + p.ey * v.y; }
  // the four outcomes of a linear program, for two variables (LX.lp2.solve), in the lesson's terms: cost, CO2 and the
  // binding rules at the best plan
  function solve2(p) {
    var s = LP.solve(problem(p)), res = { status: s.status, corners: s.corners, best: s.best, x: s.x, y: s.y, cost: s.value, co2: null, binding: {}, ray: s.ray };
    if (s.best.length) { res.co2 = co2Of(p, s.best[0]); RULES.forEach(function (k) { res.binding[k] = s.binding[k] === true; }); }
    return res;
  }
  // does a plan meet every rule? (for the draggable plan dot)
  function check(p, v) {
    var broken = rulesOf(p).filter(function (r) { return !LP.holds(r, [v.x, v.y], 1e-9); }).map(function (r) { return r.id; });
    if (v.x < -1e-9 || v.y < -1e-9) broken.push("sign");
    return { ok: !broken.length, broken: broken, cost: costOf(p, v), co2: co2Of(p, v) };
  }

  // the cap at which the CO2 rule just touches the best plan: that plan's CO2 with the cap switched off (step 5's
  // "binding" button; the cap slider's 0.05 t step reaches it too)
  function bindingCap(p) {
    var q = {}, k; for (k in p) q[k] = p[k]; q.on = {}; for (k in p.on) q.on[k] = p.on[k]; q.on.co2 = false;
    var s = solve2(q); return s.best.length ? Math.round(co2Of(p, s.best[0]) * 1e6) / 1e6 : null;
  }
  // the fixed-output plant's constant running cost for n hours: in the goal it is a constant, so it never moves the
  // best plan, and the one-hour chart leaves it out (the chart's costs are gas costs)
  function fixedCost(town, n) { var g = town.fleet.nuclear; return g.mw * g.cost * (n || 1); }

  var model = { HOURS: HOURS, dayOf: dayOf, params: params, RULES: RULES, rulesOf: rulesOf, problem: problem, solve2: solve2, check: check,
    costOf: costOf, co2Of: co2Of, bindingCap: bindingCap, fixedCost: fixedCost };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX || !window.LX.H) return;

  var LX = window.LX, H = LX.H, S = LX.S;
  // ================================================================ the lesson
  var fmt1 = function (v) { return (Math.round(v * 10) / 10 + 0).toLocaleString("en-US", { maximumFractionDigits: 1 }); };   // + 0 turns -0 into 0
  var MW = function (v) { return fmt1(v) + " MW"; };
  var usd = function (v) { return (v < 0 ? "−$" : "$") + Math.round(Math.abs(v)).toLocaleString("en-US"); };
  var saw = function (api, t, bad) { api.saw(t, bad); };   // step cards turn **bold** marks into <b> (cards.js)
  // how the plane draws each rule (LX.LPPlane styles); x >= 0 and y >= 0 are the axes
  var RULE_STYLE = {
    demand: { color: "var(--lx-ink)", label: "Demand", place: "foot", drag: true },            // just above the x-axis, left of the line's foot
    cc: { color: "var(--lx-cc)", dash: "6 4", label: "Combined-cycle size", short: "CC size", place: "top" },
    pk: { color: "var(--lx-pk)", dash: "6 4", label: "Peaker size", place: "end" },
    co2: { color: "var(--lx-warn)", label: "CO₂ cap", place: "start", drag: true }            // under its left end
  };

  function view(live, data, root) {
    var town = data.town, D = data["10_write_it_down"], day = dayOf(town, data.town_year), h = D.hour;
    var base = params(town, day, D), p = params(town, day, D), level = null, dot = null, hi = null, hook = null, onDotMove = null, ctl = {}, follow = false;
    var hh = LX.fmt.hh(h), sol = solve2(p);
    var NAME = { demand: "demand rule", cc: "combined-cycle size", pk: "peaker size", co2: "CO₂ cap", x0: "x = 0", y0: "y = 0" };

    // ---------- the stage: chips, plot, status
    var stage = H("div", { class: "lx-stage" }, live);
    H("h3", { text: hh + " on " + day.dateLabel + ": two gas plants, one hour" }, H("div", { class: "lx-stage-head" }, stage));
    var chips = H("div", { class: "lx-readouts", "aria-live": "polite" }, stage);
    var plot = LX.LPPlane(stage, {
      fluid: true, view: D.view, xLabel: "Combined-cycle x (MW)", yLabel: "Peaker y (MW)", styles: RULE_STYLE,
      onDrag: function (id, v) {
        if (id === "demand" && ctl.D) { ctl.D.set(v); upd({ D: ctl.D.val() }); }
        else if (id === "co2" && ctl.cap) { ctl.cap.set(v); upd({ cap: ctl.cap.val() }); }
        else if (id === "cost" && ctl.level) { ctl.level.set(v); setLevel(ctl.level.val()); }
      },
      onDot: function (x, y) { dot = { x: Math.round(x / 5) * 5, y: Math.round(y / 5) * 5 }; paint(); if (onDotMove) onDotMove(); },
      dotLabel: function (d) { return "Your plan: combined-cycle " + Math.round(d.x) + " MW, peaker " + Math.round(d.y) + " MW. Arrow keys move it."; },
      dotValue: function (d) { return Math.round(d.x) + " and " + Math.round(d.y) + " MW"; },
      describe: describe
    });
    var status = H("p", { class: "lx-stage-status", "aria-live": "polite" }, stage);

    function describe() {
      var s = sol, t = "Plans as points: combined-cycle output x across, peaker output y up. The region of plans that meet every rule " +
        (s.status === "infeasible" ? "is empty. " : "has corners at " + s.corners.map(function (v) { return "(" + fmt1(v.x) + ", " + fmt1(v.y) + ")"; }).join(", ") + ". ");
      if (s.status === "optimal") t += "The best plan is the corner x = " + fmt1(s.x) + " MW, y = " + fmt1(s.y) + " MW, with a gas cost of " + usd(s.cost) + ".";
      if (s.status === "tied") t += "Every plan on the edge from (" + fmt1(s.best[0].x) + ", " + fmt1(s.best[0].y) + ") to (" + fmt1(s.best[s.best.length - 1].x) + ", " + fmt1(s.best[s.best.length - 1].y) + ") ties for best at " + usd(s.cost) + ".";
      if (level != null && (s.status === "optimal" || s.status === "tied")) t += " The dashed cost line marks plans costing " + usd(level) + ".";
      if (s.status === "unbounded") t += "The cost falls without limit.";
      if (dot) t += " Your plan: x = " + dot.x + ", y = " + dot.y + ".";
      return t;
    }
    function chip(label, value, cls) { var c = H("div", { class: "lx-readout" + (cls ? " " + cls : "") }, chips); H("span", { text: label }, c); H("b", { text: value }, c); }
    function paint() {
      sol = solve2(p);
      if (follow) level = sol.status === "optimal" || sol.status === "tied" ? sol.cost : null;   // the tie step: the cost line through the best plan
      plot.render({ rows: problem(p).rows, c: [p.cx, p.cy], sol: sol, level: level, dot: dot, hi: hi, showBest: level == null || level <= sol.cost + 1 });
      chips.innerHTML = "";
      if (dot) {
        var c = check(p, dot);
        chip("Your plan", "x " + dot.x + ", y " + dot.y);
        chip("Its cost", usd(c.cost));
        chip("Rules", c.ok ? "all met" : "one broken", c.ok ? "good" : "bad");
      } else {
        chip("Gas needed", p.D + " MW");
        if (sol.status === "optimal" || sol.status === "tied") {
          if (level == null || level <= sol.cost + 1) { chip("Best gas cost", usd(sol.cost), "good"); chip("Best plan", "x " + fmt1(sol.x) + ", y " + fmt1(sol.y)); }
          if (level == null || level <= sol.cost + 1) chip("CO₂ at best", (Math.round(sol.co2 * 100) / 100 + 0).toLocaleString("en-US", { maximumFractionDigits: 2 }) + " t");
        } else chip("Outcome", sol.status, "bad");
      }
      status.innerHTML = statusText();
    }
    function statusText() {
      var s = sol;
      if (s.status === "infeasible") return "<b>Infeasible.</b> No plan meets every rule: the shaded region is gone.";
      if (s.status === "unbounded") return "<b>Unbounded.</b> The cost falls without limit along the red arrow: a rule is missing.";
      if (s.status === "tied") return "<b>Tied.</b> Every plan on the green " + (s.best.length > 1 ? "edge" : "line") + " costs " + usd(s.cost) + ".";
      if (level != null && level > s.cost + 1) return "Every plan on the dashed line costs " + usd(level) + ".";
      var on = s.best[0].on.map(function (k) { return NAME[k]; });
      return "<b>One best corner,</b> where " + on.join(" and ") + " meet." + (p.on.co2 ? " CO₂ cap: " + (s.binding.co2 ? "binding." : "slack, " + fmt1(p.cap - s.co2) + " t to spare.") : "");
    }
    function upd(o) { for (var k in o) p[k] = o[k]; paint(); if (hook) hook(); }
    function setLevel(v) { level = v; paint(); if (hook) hook(); }
    function reset(o) { p = params(town, day, D, o); level = null; dot = null; hi = null; onDotMove = null; hook = null; ctl = {}; follow = false; stage.hidden = false; }
    function costCtl(host, key, label, color, range) {
      range = range || D.ranges.cost;
      return LX.Slider(host, { label: label, color: color, min: range[0], max: range[1], step: 5, value: p[key], fmt: function (v) { return usd(v) + "/MWh"; },
        onChange: function (v) { var o = {}; o[key] = v; upd(o); } });
    }

    // ---------- step cards
    var steps = [
      { text: "Lesson 0's day was an optimization problem. Each has [[decision-variable|decisions]] (what you choose), a [[objective|goal]] (what you make smallest), [[constraint|rules]] (what must hold) and givens (data). Sort the ten cards.",
        build: function (act, api) {
          stage.hidden = true; hook = null;
          LX.CardSort(act, { bins: D.bins, cards: D.cards, onCheck: function (g) {
            if (g.right === g.total) { api.done(); saw(api, "All ten right. Demand, weather and costs are **given**; the model chooses only the gas outputs, the spill and any unserved demand."); }
            else saw(api, g.right + " of " + g.total + " right. A decision is something the operator can change; a given is something the model must take as it is.", true);
          } });
        } },
      { text: "Now one hour: " + hh + " on " + day.dateLabel + ". Gas must supply " + base.D + " MW. Each point is a plan: x MW from the combined-cycle, y MW from the peaker. Drag the dot.",
        build: function (act, api) {
          reset(); dot = { x: D.dot[0], y: D.dot[1] }; var moves = 0;
          H("p", { class: "lx-hint", text: "The shaded area holds every plan that meets all the rules. On a keyboard, focus the dot and use the arrow keys (5 MW a step)." }, act);
          var b = H("button", { type: "button", class: "lx-btn ghost small", text: "Focus the dot" }, act);
          b.addEventListener("click", function () { plot.focusDot(); paint(); });
          onDotMove = function () {
            moves++; var c = check(p, dot);
            if (moves >= 2) api.done();
            if (c.ok) saw(api, "This plan meets every rule and costs **" + usd(c.cost) + "** for the hour. Can you find a cheaper one inside the shaded area?");
            else saw(api, "Outside the shaded area: it breaks the " + c.broken.map(function (k) { return k === "sign" ? "rule x, y ≥ 0" : NAME[k]; }).join(" and ") + ".", true);
          };
          paint();
        } },
      { text: "Every plan on the dashed line costs the same. Slide the line down to lower the cost. Where does it last touch the shaded area?",
        build: function (act, api) {
          reset(); level = D.level0;
          ctl.level = LX.Slider(act, { label: "Cost of the plans on the line", color: "var(--lx-accent)", min: 0, max: D.ranges.level[1], step: 100, value: level, fmt: usd,
            onChange: function (v) { setLevel(v); } });
          H("p", { class: "lx-hint", text: "You can also drag the dashed line itself." }, act);
          hook = function () {
            if (level != null && level <= sol.cost + 50) {
              if (level !== sol.cost) { level = sol.cost; ctl.level.set(sol.cost); paint(); }
              api.done(); saw(api, "It last touches a **corner**: " + fmt1(sol.x) + " MW from the combined-cycle, " + fmt1(sol.y) + " from the peaker, " + usd(sol.cost) + " of gas. Any lower, and no plan on the line meets every rule.");
            }
          };
          paint();
        } },
      { text: "A hotter evening needs more gas. Drag the demand line past " + base.X + " MW, or use the slider, and watch the best corner jump.",
        build: function (act, api) {
          reset();
          ctl.D = LX.Slider(act, { label: "Gas needed this hour", color: "var(--lx-ink)", min: D.ranges.D[0], max: D.ranges.D[1], step: 5, value: p.D, fmt: function (v) { return v + " MW"; },
            onChange: function (v) { upd({ D: v }); } });
          hook = function () {
            if (sol.status === "infeasible") { saw(api, "**Infeasible** at " + p.D + " MW: even the cleanest plan would break the CO₂ cap. Step back a little.", true); return; }
            if (sol.status !== "optimal") return;
            if (p.D > p.X) { api.done(); saw(api, "The best corner jumped: the combined-cycle runs at its size, x = " + fmt1(sol.x) + " MW, and the dearer peaker makes the rest, y = " + fmt1(sol.y) + " MW, for " + usd(sol.cost) + "."); }
            else saw(api, "Still the corner on the x-axis: the combined-cycle alone, x = " + fmt1(sol.x) + " MW.");
          };
          paint();
        } },
      { text: "Now tighten the CO₂ cap. First it changes nothing (slack), then it touches the best plan ([[binding-constraint|binding]]), then no plan is left ([[infeasible|infeasible]]).",
        build: function (act, api) {
          reset();
          var bc = bindingCap(p), t2 = function (v) { return (Math.round(v * 100) / 100).toLocaleString("en-US") + " t"; };
          ctl.cap = LX.Slider(act, { label: "CO₂ cap this hour", color: "var(--lx-warn)", min: D.ranges.cap[0], max: D.ranges.cap[1], step: D.ranges.capStep, value: p.cap, fmt: t2,
            onChange: function (v) { upd({ cap: v }); } });
          var bb = H("button", { type: "button", class: "lx-btn ghost small", text: "Set the cap to the best plan's CO₂, " + t2(bc) }, act);
          bb.addEventListener("click", function () { ctl.cap.set(bc, true); });
          H("p", { class: "lx-hint", text: "The − and + buttons and the arrow keys move the cap 0.05 t at a time." }, act);
          hook = function () {
            if (sol.status === "infeasible") { api.done(); saw(api, "**Infeasible.** Even the cleanest plan emits " + t2(bc) + ", so a lower cap leaves no plan. A solver reports this; it cannot repair the rules."); }
            else if (sol.binding.co2) saw(api, "**Binding:** the cap passes through the best plan, with no room to spare. Loosening it changes nothing here; any tighter and the region vanishes.");
            else saw(api, "**Slack:** the best plan emits " + t2(sol.co2) + ", under the " + t2(p.cap) + " cap, so the cap changes nothing yet.");
          };
          paint(); hook();
        } },
      { text: "Make it tied: give both plants the same positive running cost. Watch the dashed cost line through the best plan turn parallel to the demand line.",
        build: function (act, api) {
          reset(); follow = true;
          var c = H("div", { class: "lx-ctls" }, act);
          ctl.cy = costCtl(c, "cy", "Peaker running cost", "var(--lx-pk)", D.ranges.costTie);
          ctl.cx = costCtl(c, "cx", "Combined-cycle running cost", "var(--lx-cc)", D.ranges.costTie);
          hook = function () {
            if (sol.status === "tied") { api.done(); saw(api, "**Tied.** Any split along the green edge costs " + usd(sol.cost) + ": not two best plans but infinitely many. A solver returns one of them."); }
            else if (sol.status === "optimal") saw(api, "Still one best corner, at x = " + fmt1(sol.x) + ", y = " + fmt1(sol.y) + ".");
          };
          paint();
        } },
      { text: "Make it [[unbounded|unbounded]]: pay the combined-cycle to run (a cost below $0), then switch off its size rule and the CO₂ cap. Watch the cost.",
        build: function (act, api) {
          reset();
          ctl.cx = costCtl(act, "cx", "Combined-cycle running cost", "var(--lx-cc)");
          var tg = H("div", { class: "lx-toggles", role: "group", "aria-label": "Rules on or off" }, act);
          [["cc", "Combined-cycle size"], ["co2", "CO₂ cap"], ["pk", "Peaker size"], ["demand", "Demand rule"]].forEach(function (r) {
            LX.Toggle(tg, { label: r[1], on: true, onChange: function (on) { p.on[r[0]] = on; paint(); hook(); } });
          });
          hook = function () {
            if (sol.status === "unbounded") { api.done(); saw(api, "**Unbounded.** Every extra MWh lowers the cost and no rule stops it. Real plants have sizes: an unbounded answer means a rule is missing."); }
            else if (!p.on.demand && sol.status === "optimal" && sol.x === 0 && sol.y === 0) saw(api, "Without the demand rule, the cheapest plan makes nothing: the lights go out at no cost. Another rule a model must not lose.", true);
            else if (p.cx < 0) saw(api, "Each MWh from the combined-cycle now earns money. Which rules still stop it from running more?");
            else saw(api, "First make the combined-cycle's cost negative.", true);
          };
          paint();
        } },
      { text: "The same problem in words, in symbols and as a table. Tap any line: the same rule lights up in all three and on the chart.",
        build: function (act, api) {
          reset(); paint();
          var vc = viewsOf(p, sol);
          vc.onPick = function (k) {
            hi = k === "goal" ? null : k; level = k === "goal" ? sol.cost : null; paint(); api.done();
            saw(api, k === "goal" ? "The goal is the cost line; here it passes through the best corner at " + usd(sol.cost) + " of gas." : "The " + NAME[k] + ": " + (sol.binding[k] ? "**binding** at the best plan (the corner sits on its line)." : "**slack** at the best plan (room to spare)."));
          };
          LX.LinkedViews(act, vc);
        } }
    ];
    var cards = LX.StepCards(live, { steps: steps });
    // hooks for the screenshot script (lxDemo) and for curious readers in the console
    LX.demo(root, function (state) {   // standard states (core.js LX.demo) plus corner, jump, binding, tied, views and sort
      if (state === "mid") { cards.go(2); ctl.level.set(sol.cost + 2400); setLevel(sol.cost + 2400); return { view: "cost line" }; }
      if (state === "corner") { cards.go(2); ctl.level.set(0); setLevel(0); return { view: "best corner" }; }
      if (state === "jump") { cards.go(3); ctl.D.set(200); upd({ D: 200 }); return { view: "corner jumps" }; }
      if (state === "binding") { cards.go(4); var bb = live.querySelector(".lx-step-act .lx-btn"); if (bb) bb.click(); return { view: "binding cap" }; }
      if (state === "tied") { cards.go(5); ctl.cy.set(p.cx); upd({ cy: p.cx }); return { view: "tied" }; }
      if (state === "views") { cards.go(7); var b = live.querySelector(".lx-lv-row[data-k=co2]"); if (b) b.click(); return { view: "linked views" }; }
      if (state === "sort") { cards.go(0); return { view: "card sort" }; }
      return null;
    }, cards);
    root.lxLesson = { model: model, params: function () { return p; }, sol: function () { return sol; }, cards: cards };
    buildExplain(town, day, D);
  }

  // words, symbols and a table of the hour's model, for LX.LinkedViews (step 8)
  function viewsOf(p, sol) {
    var at = function (a) { return fmt1(a[0] * sol.x + a[1] * sol.y); }, sym = function (h) { return '<span class="lx-lv-sym">' + h + "</span>"; };
    var bind = function (k) { return sol.binding[k] ? ", binding" : ", slack"; };
    return {
      panels: [
        { title: "In words", items: [
          { key: "goal", html: "<b>Goal:</b> make the hour's gas running cost as small as possible: " + usd(p.cx) + " per MWh from the combined-cycle, " + usd(p.cy) + " from the peaker." },
          { key: "demand", html: "<b>Demand:</b> together they supply at least " + p.D + " MW." },
          { key: "cc", html: "<b>Combined-cycle size:</b> at most " + p.X + " MW." },
          { key: "pk", html: "<b>Peaker size:</b> at most " + p.Y + " MW." },
          { key: "co2", html: "<b>CO₂ cap:</b> at most " + p.cap + " t this hour, at " + p.ex + " and " + p.ey + " t per MWh." },
          { html: "Neither plant runs below zero." }] },
        { title: "In symbols", items: [
          { key: "goal", html: sym("min " + p.cx + "<var>x</var> + " + p.cy + "<var>y</var>") },
          { key: "demand", html: sym("<var>x</var> + <var>y</var> ≥ " + p.D) },
          { key: "cc", html: sym("<var>x</var> ≤ " + p.X) },
          { key: "pk", html: sym("<var>y</var> ≤ " + p.Y) },
          { key: "co2", html: sym(p.ex + "<var>x</var> + " + p.ey + "<var>y</var> ≤ " + p.cap) },
          { html: sym("<var>x</var>, <var>y</var> ≥ 0") }] }],
      table: { title: "As a table", head: ["Rule", "x", "y", "Limit", "At the best plan"], rows: [
        { key: "goal", cells: ["Gas cost", p.cx, p.cy, "min", usd(sol.cost)] },
        { key: "demand", cells: ["Demand", 1, 1, "≥ " + p.D, at([1, 1]) + bind("demand")] },
        { key: "cc", cells: ["Combined-cycle size", 1, 0, "≤ " + p.X, at([1, 0]) + bind("cc")] },
        { key: "pk", cells: ["Peaker size", 0, 1, "≤ " + p.Y, at([0, 1]) + bind("pk")] },
        { key: "co2", cells: ["CO₂ cap", p.ex, p.ey, "≤ " + p.cap, at([p.ex, p.ey]) + bind("co2")] }] },
      hint: "Binding: the rule holds with no room to spare at the best plan. Slack: it has room to spare."
    };
  }

  // ---------------------------------------------------------------- the explain layer
  function buildExplain(town, day, D) {
    var host = document.getElementById("w10-explain"); if (!host) return;
    host.innerHTML = ""; host.classList.add("is-live");
    var f = town.fleet, nPk = f.peaker.mw, fixDay = fixedCost(town, HOURS), c0 = day.startCC;
    if (!document.getElementById("w10-css")) H("style", { id: "w10-css", text: ".w10-rules{margin:0;padding-left:1.1em;font-size:14.5px;color:var(--lx-ink-2);display:grid;gap:3px}" }, document.head);
    // 1 formulate it
    var fb = LX.FormulateBox(H("div", { class: "lx-xcard" }, host), {
      title: "Formulate it: lesson 0's day in words",
      lede: "The ten cards, put together. This is the whole model a solver needs; lesson 11 hands it to one.",
      parts: [
        { k: "Decisions", color: "var(--lx-tier-2)", text: "For each of the 24 hours: the combined-cycle's and the peaker's output, spilled wind and sun, and any unserved demand. 96 numbers." },
        { k: "Goal", color: "var(--lx-good)", text: "Make the day's gas cost as small as possible ($" + f.cc.cost + " and $" + f.peaker.cost + " per MWh), with a large penalty per MWh unserved. The fixed-output plant adds a constant " + usd(fixDay) + ", which cannot change the plan." },
        { k: "Rules", color: "var(--lx-warn)", text: "Every hour:" },
        { k: "Given", color: "var(--lx-ink-3)", text: "Demand, wind and sun for each hour of " + day.dateLabel + "; plant sizes, running costs and the ramp limit. The model takes these as they are ([[parameter|parameters]])." }
      ]
    });
    // the rules as one short row each
    var ul = H("ul", { class: "w10-rules" }, fb.parts[2]);
    ["Supply equals demand.", "Each plant between 0 and its size.", "The combined-cycle changes at most " + f.cc.ramp + " MW from the hour before (" + c0 + " MW before midnight).",
     "Spill no more than the wind and sun there is."].forEach(function (t) { H("li", { text: t }, ul); });
    // 2 equation card
    var sym = LX.EquationCard.sym, pcc = "<var>p</var><sub>cc</sub>(<var>t</var>)", ppk = "<var>p</var><sub>pk</sub>(<var>t</var>)";
    LX.EquationCard(H("div", { class: "lx-xcard" }, host), {
      title: "The same model in symbols",
      lede: "Tap a symbol to see what it means and how it looks in code (the model format this site's solver reads).",
      dense: true, label: "The model; each symbol is a button", textLabel: "Text version: every row and symbol", fields: [{ key: "code", label: "In code", code: true }],
      rows: [
        { html: "min&nbsp; " + sym("sum", "Σ<sub><var>t</var></sub>") + " ( " + sym("c", String(f.cc.cost)) + " " + sym("pcc", pcc) + " + " + sym("cpk", f.peaker.cost) + " " + sym("ppk", ppk) + " + " + sym("V", "<var>V</var>") + " " + sym("u", "<var>u</var>(<var>t</var>)") + " )", tag: "goal",
          say: "Goal: make as small as possible the sum over the 24 hours of " + f.cc.cost + " dollars per MWh times the combined-cycle's output, plus " + f.peaker.cost + " dollars per MWh times the peaker's output, plus the penalty V times unserved demand." },
        { html: sym("n", String(f.nuclear.mw)) + " + " + sym("wv", "<var>w</var>(<var>t</var>) + <var>v</var>(<var>t</var>)") + " + " + pcc + " + " + ppk + " + <var>u</var>(<var>t</var>) − " + sym("s", "<var>s</var>(<var>t</var>)") + " = " + sym("d", "<var>d</var>(<var>t</var>)"), tag: "balance, every hour",
          say: "Balance, every hour: " + f.nuclear.mw + " MW from the fixed-output plant, plus the wind and sun available, plus both gas outputs, plus unserved demand, minus the wind and sun spilled, equals demand." },
        { html: "0 ≤ " + pcc + " ≤ " + f.cc.mw + ", &nbsp;0 ≤ " + ppk + " ≤ " + nPk, tag: "sizes",
          say: "Sizes, every hour: the combined-cycle between 0 and " + f.cc.mw + " MW, the peaker between 0 and " + nPk + " MW." },
        { html: "−" + sym("R", String(f.cc.ramp)) + " ≤ " + pcc + " − <var>p</var><sub>cc</sub>(<var>t</var>−1) ≤ " + f.cc.ramp + ", &nbsp;" + sym("p0", "<var>p</var><sub>cc</sub>(−1) = " + c0), tag: "ramp limit",
          say: "Ramp limit, every hour: the combined-cycle's output differs from the hour before by at most " + f.cc.ramp + " MW, up or down. In the hour before midnight it ran at " + c0 + " MW." },
        { html: "0 ≤ <var>s</var>(<var>t</var>) ≤ <var>w</var>(<var>t</var>) + <var>v</var>(<var>t</var>), &nbsp;<var>u</var>(<var>t</var>) ≥ 0", tag: "spill and unserved",
          say: "Spill and unserved, every hour: the wind and sun spilled is between zero and what is available; unserved demand is zero or more." }
      ],
      symbols: {
        sum: { name: "Σ_t", label: "sum over t", words: "Add across all 24 hours. t names an hour: t = 0 is midnight to 01:00, t = 23 is 23:00 to midnight.", code: "for (let t = 0; t < 24; t++) { … }   // one copy of each row per hour" },
        pcc: { name: "p_cc(t)", label: "p cc of t", words: "The combined-cycle's output in hour t, in MW: a [[decision-variable|decision]], one for each of the 24 hours.", code: '{ name: "cc_19", lb: 0, ub: ' + f.cc.mw + ", cost: " + f.cc.cost + " }" },
        ppk: { name: "p_pk(t)", label: "p pk of t", words: "The peaker's output in hour t, in MW: a decision.", code: '{ name: "pk_19", lb: 0, ub: ' + nPk + ", cost: " + f.peaker.cost + " }" },
        c: { name: String(f.cc.cost), label: f.cc.cost + " dollars per MWh", words: "The combined-cycle's running cost in $/MWh: given. Times MW for one hour, it gives dollars.", code: "cost: " + f.cc.cost + "   // in the variable's entry" },
        cpk: { name: String(f.peaker.cost), label: f.peaker.cost + " dollars per MWh", words: "The peaker's running cost in $/MWh: given.", code: "cost: " + f.peaker.cost },
        V: { name: "V", label: "V, the unserved penalty", words: "A large penalty per MWh of unserved demand, so the solver keeps the lights on whenever it can. Illustrative.", code: '{ name: "un_19", lb: 0, cost: 3000 }' },
        u: { name: "u(t)", label: "u of t", words: "Unserved demand in hour t, in MW: a decision the solver avoids because of its penalty.", code: '"un_19"' },
        n: { name: String(f.nuclear.mw), label: f.nuclear.mw + " megawatts of fixed output", words: "The fixed-output plant runs flat at " + f.nuclear.mw + " MW: given, so it moves to the right-hand side.", code: "eq: d - " + f.nuclear.mw + " - w - v   // the balance row's right-hand side" },
        wv: { name: "w(t) + v(t)", label: "w of t plus v of t", words: "The wind and sun available in hour t, from the real shapes of " + day.dateLabel + ": given.", code: "ub: w + v   // the spill variable's upper bound" },
        s: { name: "s(t)", label: "s of t", words: "Spilled wind and sun in hour t: a decision. It enters the balance with a minus sign.", code: '{ name: "sp_19", lb: 0, ub: ' + (day.wind[D.hour] + day.solar[D.hour]) + " }" },
        d: { name: "d(t)", label: "d of t", words: "Demand in hour t, in MW: given. At " + LX.fmt.hh(D.hour) + " it is " + day.demand[D.hour] + " MW.", code: '{ name: "balance_19", terms: { cc_19: 1, pk_19: 1, sp_19: -1, un_19: 1 }, eq: ' + day.need[D.hour] + " }" },
        R: { name: f.cc.ramp + " (ramp)", label: f.cc.ramp + " megawatts per hour ramp limit", words: "The combined-cycle's ramp limit, MW per hour: given. Two rules per hour, one up and one down.", code: '{ name: "ramp_up_19", terms: { cc_19: 1, cc_18: -1 }, le: ' + f.cc.ramp + " }" },
        p0: { name: "p_cc(−1) = " + c0, label: "p cc of minus 1 equals " + c0, words: "The combined-cycle's output in the hour before midnight, " + c0 + " MW: given (lesson 0's start). It gives the first hour, t = 0, an hour before it.", code: '{ name: "ramp_up_0", terms: { cc_0: 1 }, le: ' + f.cc.ramp + " + " + c0 + " }" }
      },
      // the goal's units and its left-out constant, under the panel (a dense row keeps its note on the formula's line)
      hint: "The goal is in dollars for the day: each hour's MW × 1 h gives MWh. The fixed-output plant's constant " + usd(fixDay) + " is left out; it cannot change the plan.",
      sel: "pcc"
    });
    // 3 flowchart: the four outcomes
    var p0 = params(town, day, D), s0 = solve2(p0), pInf = params(town, day, D, { cap: Math.floor(p0.ex * p0.D) - 4 }), pTie = params(town, day, D, { cy: p0.cx }),
        pUnb = params(town, day, D, { cx: -10, on: { cc: false, co2: false } });
    LX.Flowchart(H("div", { class: "lx-xcard" }, host), {
      title: "Four ways a linear program can end",
      lede: "Every solver run ends in one of these. Trace the cases you made on the chart.",
      nodes: {
        start: { t: "Solve", s: "rules and goal written down", sN: "rules and goal", k: "end" },
        q1: { t: "Any plan meets every rule?", tN: ["Any plan meets", "every rule?"], k: "q" },
        inf: { t: "Infeasible", s: "fix a rule or the data", sN: "fix a rule", k: "end" },
        q2: { t: "Goal improves for ever?", tN: ["Goal improves", "for ever?"], k: "q" },
        unb: { t: "Unbounded", s: "a rule is missing", k: "end" },
        q3: { t: "Lowest cost line lies along an edge?", tN: ["Lowest cost line", "along an edge?"], k: "q" },
        tie: { t: "Tied", s: "a whole edge is best", k: "end" },
        one: { t: "One best corner", s: "the usual answer", k: "end" }
      },
      cols: 3, at: { start: [1, 0], q1: [1, 1], inf: [2, 1.9], q2: [1, 2.4], unb: [2, 3.3], q3: [1, 3.8], tie: [2, 4.7], one: [0.2, 4.7] },
      colsN: 2, atN: { start: [0, 0], q1: [0, 1], inf: [1, 1.9], q2: [0, 2.4], unb: [1, 3.3], q3: [0, 3.8], tie: [1, 4.7], one: [0, 5.2] },
      edges: [["start", "q1"], ["q1", "inf", "no"], ["q1", "q2", "yes"], ["q2", "unb", "yes"], ["q2", "q3", "no"], ["q3", "tie", "yes"], ["q3", "one", "no"]],
      traces: [
        { label: LX.fmt.hh(D.hour) + " as given", path: ["start", "q1", "q2", "q3", "one"], text: "One best corner: x = " + fmt1(s0.x) + ", y = " + fmt1(s0.y) + ", " + usd(s0.cost) + " of gas." },
        { label: "CO₂ cap " + pInf.cap + " t", path: ["start", "q1", "inf"], text: "Even the cleanest plan emits " + fmt1(p0.ex * p0.D) + " t: " + solve2(pInf).status + "." },
        { label: "Equal costs", path: ["start", "q1", "q2", "q3", "tie"], text: "Both at $" + p0.cx + "/MWh: every split of " + p0.D + " MW costs " + usd(solve2(pTie).cost) + " (" + solve2(pTie).status + ")." },
        { label: "Paid to run, no size", path: ["start", "q1", "q2", "unb"], text: "At −$10/MWh with no size rule and no CO₂ cap: " + solve2(pUnb).status + "." }
      ],
      sel: 0
    });
  }

  LX.mount("write-it-down", function (live, data, root) { view(live, data, root); });
})();
