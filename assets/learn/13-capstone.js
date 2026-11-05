// 13-capstone.js — Lesson 13, "What should Prairie Town build? Plan its power system" (play-first capstone, W1).
// Its planning engine (LX.townPlan: the model, the representative weeks, the LP builders and the page kit that lessons
// 12 and 13 share) is the component assets/learn/components/planengine.js, bundled into learn.js; this file is the game.
//
// Data: assets/learn/data/13-capstone.json (technology costs with primary sources and dates, the default scenario, the
// representative-week rule), town_year.json (every hour of 2025 on the Southwest Power Pool grid, EIA-930, as shapes) and
// cf_targets.json (EIA 2025 capacity factors, used by LX.townProfile to size wind and solar output).
//
// The model (in components/planengine.js; a linear program; Prairie Town is fictional, its costs are real and dated):
//   decisions   capacities: wind, solar, gas combined-cycle (cc), gas peaker (pk), nuclear (nuc) in MW; battery power
//               (bp, MW) and energy (be, MWh). Every hour: cc and peaker output, battery charge and discharge, unserved
//               demand (only when the reader's plan is fixed; the optimizer must serve all demand).
//   goal        least annual cost = annualised capital + fixed O&M (per MW or MWh built) + fuel and variable O&M (per MWh)
//               [+ a carbon price x CO2: lesson 12's weighted sum]. Nuclear runs flat, so its fuel is a fixed yearly cost.
//   rules       every hour: wind + solar + nuclear + cc + peaker + discharge - charge + unserved >= demand (what is left
//               over is spilled); wind and solar make capacity x the hour's availability (LX.townProfile, "scale" method,
//               EIA 2025 targets; night-time solar is zero in the data itself); nuclear runs flat at 91.1% (EIA's 2025
//               fleet capacity factor, a yearly average used as every hour's output: a simplification the page states),
//               as in lesson 0; gas output <= its capacity; charge + discharge <= battery MW;
//               battery energy within [0, MWh], 85% round trip (losses on charging); optional: annual CO2 <= cap.
//   time        seven weeks of 2025 (168 chronological hours each): one medoid week per season, scaled so the season's
//               demand, wind and solar energy are kept, plus three weeks kept as they are (the year's peak demand, the
//               highest net load, the least wind). Each stands for its weeks (weights); the year's 52 calendar weeks keep
//               their order, and the battery's state is linked across them (Kotzur et al. 2018: the level at the start of
//               each calendar week plus the representative week's own swing stays within [0, MWh]; the year ends where it
//               starts). The 24 hours of 31 December are covered by scaling the weights to 8,760 h.
//   check       fullYearModel(): the same LP on all 8,760 hours in calendar order (_tests/learn/test_13-capstone.js
//               compares plans, costs, CO2, unserved and spilled energy; the page offers it as "check on all 8,760 hours").
// Every number the page states is checked against this model by the Node test.
(function () {
  "use strict";
  // the planning engine (components/planengine.js, in learn.js): window.LX.townPlan in the browser, require() in Node
  var model = (typeof window !== "undefined" && window.LX && window.LX.townPlan) || require("./components/planengine.js");
  if (typeof module !== "undefined" && module.exports) module.exports = model;   // require("13-capstone.js") still gives the engine
  if (typeof window === "undefined" || !window.LX || !window.LX.H) return;
  var LX = window.LX, KEYS = model.KEYS, U = model.ui;
  // ================================================================ the page (component library: window.LX)
  var H = LX.H, S = LX.S, LESSON = "13-capstone";
  var TECH = U.TECH, fm = U.fm, Num = U.Num, TextTable = U.TextTable, css = U.css;
  function copy(o) { var r = {}; for (var k in o) r[k] = o[k]; return r; }

  // ---------------------------------------------------------------- one modelled week as a stacked chart
  var STACK = [["nuc", "Nuclear", "var(--lx-nuc)"], ["wind", "Wind", "var(--lx-wind)"], ["solar", "Solar", "var(--lx-solar)"],
               ["dis", "Battery out", "var(--lx-tier-2)"], ["cc", "Gas CC", "var(--lx-cc)"], ["pk", "Peaker", "var(--lx-pk)"]];
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  // The stack is what each source could give (wind, sun and nuclear at their hourly availability) plus what gas and the
  // battery did; the hatched band on top is the part nobody could use (spilled), so the solid part is what served demand
  // or charged the battery. Below zero: charging. Text version: every hour of the week in a table (built when opened).
  var HATCH = "repeating-linear-gradient(135deg,var(--lx-ink-3) 0 1.5px,var(--lx-surface) 1.5px 5px)";
  function WeekChart(host) {
    var box = H("div", { class: "lx13-chart" }, host);
    var W = 640, HH = 240, ml = 44, mr = 8, mt = 10, mb = 28, last = null, pid = LX.uid("lx13-spill");
    var svg = S("svg", { viewBox: "0 0 " + W + " " + HH, role: "img" }, box);
    var leg = H("div", { class: "lx-legend", "aria-hidden": "true" }, box);
    STACK.forEach(function (s) { var x = H("span", null, leg); H("i", { style: "--c:" + s[2] }, x); H("span", { text: s[1] }, x); });
    [["Spilled (hatched)", "var(--lx-surface)", HATCH], ["Unserved", "var(--lx-bad)"], ["Charging (below zero)", "color-mix(in srgb, var(--lx-tier-2) 45%, transparent)"]].forEach(function (s) {
      var x = H("span", null, leg); H("i", { style: "--c:" + s[1] + (s[2] ? ";background-image:" + s[2] + ";outline:1px solid var(--lx-line-2)" : "") }, x); H("span", { text: s[0] }, x); });
    var dl = H("span", null, leg); H("i", { class: "line" }, dl); H("span", { text: "Demand" }, dl);
    var alt = H("p", { class: "lx-sr" }, box);
    var tv = H("details", { class: "lx-textalt" }, box); H("summary", { text: "Text version: every hour of this week, in MW" }, tv);
    var tvBody = H("div", { class: "lx13-hours", tabindex: "0", role: "region", "aria-label": "Every hour of this week, in MW" }, tv);
    tv.addEventListener("toggle", function () { if (tv.open && last) table(last[0], last[1]); });
    var COLS = [["demand", "Demand"], ["nuc", "Nuclear"], ["wind", "Wind"], ["solar", "Solar"], ["dis", "Battery out"], ["cc", "Gas CC"], ["pk", "Peaker"], ["ch", "Charging"], ["unserved", "Unserved"], ["spilled", "Spilled"]];
    function table(ws, start) {
      var d0 = new Date(start + "T00:00:00Z"), rows = [];
      for (var h = 0; h < ws.demand.length; h++) {
        var t = new Date(d0.getTime() + h * 36e5);
        rows.push("<tr><th scope='row'>" + t.getUTCDate() + " " + MON[t.getUTCMonth()] + " " + (t.getUTCHours() < 10 ? "0" : "") + t.getUTCHours() + ":00</th>" +
          COLS.map(function (c) { return "<td>" + Math.round(ws[c[0]][h]) + "</td>"; }).join("") + "</tr>");
      }
      tvBody.innerHTML = "<table class='lx13-cmp'><thead><tr><th scope='col'>Hour (standard time)</th>" + COLS.map(function (c) { return "<th scope='col'>" + c[1] + "</th>"; }).join("") + "</tr></thead><tbody>" + rows.join("") + "</tbody></table>";
    }
    function draw(ws, start) {
      last = [ws, start];
      if (tv.open) table(ws, start);
      W = Math.max(300, Math.round(box.clientWidth || 640)); HH = W < 520 ? 210 : 240; ml = W < 520 ? 38 : 44;
      svg.setAttribute("viewBox", "0 0 " + W + " " + HH); svg.innerHTML = "";
      var n = ws.demand.length, top = 0, bot = 0, i;
      var tot = []; for (i = 0; i < n; i++) { var t = 0; STACK.forEach(function (s) { t += ws[s[0]][i]; }); tot.push(t); top = Math.max(top, t + ws.unserved[i], ws.demand[i]); bot = Math.max(bot, ws.ch[i]); }
      var yMax = Math.max(100, Math.ceil(top / 100) * 100), yMin = bot > 1 ? -Math.ceil(bot / 100) * 100 : 0;
      function X(h) { return ml + h / n * (W - ml - mr); }
      function Y(v) { return mt + (yMax - v) / (yMax - yMin) * (HH - mt - mb); }
      for (var v = yMin; v <= yMax; v += 100) {
        S("line", { x1: ml, x2: W - mr, y1: Y(v), y2: Y(v), stroke: v === 0 ? "var(--lx-line-2)" : "var(--lx-line)" }, svg);
        S("text", { x: ml - 6, y: Y(v) + 4, "text-anchor": "end" }, svg).textContent = v;
      }
      var d0 = new Date(start + "T00:00:00Z");
      for (var day = 0; day <= 7; day++) {
        S("line", { x1: X(day * 24), x2: X(day * 24), y1: mt, y2: HH - mb, stroke: "var(--lx-line)", "stroke-dasharray": "2 4" }, svg);
        if (day < 7) { var dd = new Date(d0.getTime() + day * 864e5); S("text", { x: X(day * 24 + 12), y: HH - mb + 17, "text-anchor": "middle" }, svg).textContent = dd.getUTCDate() + (day === 0 ? " " + MON[dd.getUTCMonth()] : ""); }
      }
      var base = new Array(n).fill(0);
      STACK.forEach(function (s) {
        var a = ws[s[0]]; if (!a.some(function (x) { return x > 0.05; })) return;
        var up = "", dn = "";
        for (i = 0; i < n; i++) { up += (i ? "L" : "M") + X(i).toFixed(1) + "," + Y(base[i] + a[i]).toFixed(1) + "L" + X(i + 1).toFixed(1) + "," + Y(base[i] + a[i]).toFixed(1); }
        for (i = n - 1; i >= 0; i--) { dn += "L" + X(i + 1).toFixed(1) + "," + Y(base[i]).toFixed(1) + "L" + X(i).toFixed(1) + "," + Y(base[i]).toFixed(1); }
        S("path", { d: up + dn + "Z", fill: s[2] }, svg);
        for (i = 0; i < n; i++) base[i] += a[i];
      });
      // the spilled part: the top of the stack in each hour where output exceeds what demand and charging take
      if (ws.spilled.some(function (x) { return x > 0.05; })) {
        var pat = S("pattern", { id: pid, patternUnits: "userSpaceOnUse", width: 6, height: 6, patternTransform: "rotate(45)" }, S("defs", null, svg));
        S("rect", { width: 6, height: 6, fill: "var(--lx-surface)", opacity: ".7" }, pat);
        S("line", { x1: 0, y1: 0, x2: 0, y2: 6, stroke: "var(--lx-ink-3)", "stroke-width": 1.4 }, pat);
        var su = "", sd = "";
        for (i = 0; i < n; i++) { var ty = Y(base[i]).toFixed(1); su += (i ? "L" : "M") + X(i).toFixed(1) + "," + ty + "L" + X(i + 1).toFixed(1) + "," + ty; }
        for (i = n - 1; i >= 0; i--) { var lo = Y(base[i] - Math.min(base[i], ws.spilled[i])).toFixed(1); sd += "L" + X(i + 1).toFixed(1) + "," + lo + "L" + X(i).toFixed(1) + "," + lo; }
        S("path", { d: su + sd + "Z", fill: "url(#" + pid + ")" }, svg);
      }
      for (i = 0; i < n; i++) if (ws.unserved[i] > 0.05) S("rect", { x: X(i), y: Y(base[i] + ws.unserved[i]), width: X(1) - X(0) + 0.3, height: Y(base[i]) - Y(base[i] + ws.unserved[i]), fill: "var(--lx-bad)" }, svg);
      if (bot > 1) {
        var p = "M" + X(0) + "," + Y(0);
        for (i = 0; i < n; i++) p += "L" + X(i).toFixed(1) + "," + Y(-ws.ch[i]).toFixed(1) + "L" + X(i + 1).toFixed(1) + "," + Y(-ws.ch[i]).toFixed(1);
        S("path", { d: p + "L" + X(n) + "," + Y(0) + "Z", fill: "var(--lx-tier-2)", opacity: ".45" }, svg);
      }
      var dpath = ""; for (i = 0; i < n; i++) dpath += (i ? "L" : "M") + X(i).toFixed(1) + "," + Y(ws.demand[i]).toFixed(1) + "L" + X(i + 1).toFixed(1) + "," + Y(ws.demand[i]).toFixed(1);
      S("path", { d: dpath, fill: "none", stroke: "var(--lx-ink)", "stroke-width": 1.6, "stroke-dasharray": "5 3" }, svg);
      S("text", { x: ml + 4, y: mt + 12, class: "note" }, svg).textContent = "MW";
      var sum = function (a) { return a.reduce(function (s, x) { return s + x; }, 0); };
      var un = sum(ws.unserved), hrs = ws.unserved.filter(function (x) { return x > 0.05; }).length;
      var txt = "Hourly output for the week starting " + d0.getUTCDate() + " " + MON[d0.getUTCMonth()] + ": peak demand " + Math.round(Math.max.apply(null, ws.demand)) + " MW; gas made " +
        Math.round(sum(ws.cc) + sum(ws.pk)).toLocaleString("en-US") + " MWh, the battery gave back " + Math.round(sum(ws.dis)).toLocaleString("en-US") + " MWh; " +
        (hrs ? hrs + " hours short, " + Math.round(un).toLocaleString("en-US") + " MWh unserved; " : "every hour served; ") + Math.round(sum(ws.spilled)).toLocaleString("en-US") + " MWh spilled (hatched).";
      svg.setAttribute("aria-label", txt); alt.textContent = txt;
    }
    if (window.ResizeObserver) new ResizeObserver(function () { if (last && Math.abs((box.clientWidth || 0) - W) > 8) draw(last[0], last[1]); }).observe(box);
    LX.onTheme(function () { if (last) draw(last[0], last[1]); });
    return { el: box, draw: draw };
  }

  // ---------------------------------------------------------------- the game
  function view(live, data, root) {
    css();
    var cfg = data["13_capstone"], Y = model.prepareYear(data.town_year, data.cf_targets, cfg), RW = model.selectWeeks(Y, cfg.weeks), per = model.periodsOf(RW);
    var G = cfg.game, lim = cfg.limits, target = G.co2Target * 1e3;
    var DEF = { gas: cfg.fuel.gas, nucCapex: cfg.techs.nuc.capex };
    var S_ = { plan: copy(cfg.start.plan), sc: copy(DEF), sum: null, raw: null, seq: 0, frontier: cfg.frontier.points, frontierLive: false,
               short: false, spill: 0, bat: false, asked: null, full: null, done: false, pred: null, week: 4, from: "start" };
    S_.C = model.costs(cfg, S_.sc);
    var shared = model.decodePlan(location.hash, cfg);
    if (shared) {
      S_.plan = shared.plan; S_.from = "link";
      if (shared.scenario.gas != null) S_.sc.gas = shared.scenario.gas;
      if (shared.scenario.nucCapex != null) S_.sc.nucCapex = shared.scenario.nucCapex;
      S_.C = model.costs(cfg, S_.sc);
    }
    function isDefault() { return Math.abs(S_.sc.gas - DEF.gas) < 1e-9 && Math.abs(S_.sc.nucCapex - DEF.nucCapex) < 1e-9; }

    // ---- missions, the stage, the panel
    var ms = LX.Missions(live, [
      { id: "lights", label: "Serve demand in every modelled hour", short: "Lights on", main: true },
      { id: "co2", label: "Emit under " + G.co2Target + " kt (thousand tonnes) of CO₂ a year", short: "Under " + G.co2Target + " kt" },
      { id: "cost", label: "Cost within " + Math.round(G.costSlack * 100) + "% of the frontier", short: "Near the frontier" }
    ]);
    var lay = H("div", { class: "lx-play" }, live);
    var stage = H("div", { class: "lx-play-stage lx13-stage" }, lay);
    var panel = H("div", { class: "lx-play-panel lx-stepcard" }, lay);
    var deb = H("div", { class: "lx-debrief lx-stepcard", hidden: true, tabindex: "-1" }, lay);

    var c1 = H("section", { class: "lx13-card lx13-week", "aria-label": "Your plan's year, run on seven weeks" }, stage);
    var h1 = H("div", { class: "lx13-head" }, c1); H("h3", { text: "Your plan's year, run on seven weeks" }, h1);
    var status = LX.SolverStatus(h1);
    var mix = H("div", { class: "lx13-mix", role: "img" }, c1), mixLeg = H("p", { class: "lx13-sub" }, c1);
    var seg = H("div", { class: "lx-seg", role: "group", "aria-label": "Week to show" }, c1);
    var KIND = { peak: "Peak demand", netpeak: "Peak net load", calm: "Least wind" };
    var tabs = RW.reps.map(function (r, i) {
      var name = r.kind === "season" ? r.season.charAt(0).toUpperCase() + r.season.slice(1) : KIND[r.kind];
      return H("button", { type: "button", "aria-pressed": i === S_.week ? "true" : "false", text: name, onclick: function () { S_.week = i; drawWeek(); } }, seg);
    });
    var wsub = H("p", { class: "lx13-sub" }, c1);
    var wc = WeekChart(c1);

    var c2 = H("section", { class: "lx13-card", "aria-label": "Your plan on the cost and CO₂ frontier" }, stage);
    var h2 = H("div", { class: "lx13-head" }, c2); H("h3", { text: "Your plan on the frontier" }, h2);
    H("p", { class: "lx13-sub", html: LX.rich("The line joins the cheapest plans the solver found at a set of CO₂ caps ([[pareto-frontier|lesson 12]]). Well below it is out of reach; between solved points the true frontier sags slightly below the line.") }, c2);
    var fc = LX.Frontier(c2, { label: "Your plan and the optimizer's plan against the cost and CO₂ frontier", shadeLabel: "out of reach (approximately)",
      frontierLabel: "Frontier: cheapest plans at solved caps, joined by straight lines" });
    var frNote = H("p", { class: "lx13-sub", hidden: true }, c2);
    var frBtn = H("button", { class: "lx-link", type: "button", hidden: true, text: "Solve the frontier again for these costs" }, c2);

    var ph = H("div", { class: "lx13-head" }, panel); H("h3", { text: "What to build" }, ph);
    var resetBtn = H("button", { class: "lx-link", type: "button", text: "Back to lesson 0's plants" }, ph);
    var evBox = H("div", { class: "lx-events", "aria-live": "polite" }, panel);
    var sl = {};
    [["Clean power", ["wind", "solar", "nuc"]], ["Gas", ["cc", "pk"]], ["Storage", ["bp", "be"]]].forEach(function (g) {
      var gw = H("div", { class: "lx13-group" }, panel); H("p", { text: g[0] }, gw);
      g[1].forEach(function (k) {
        sl[k] = LX.Slider(gw, { label: TECH[k].label, color: TECH[k].color, max: lim[k].max, step: lim[k].step, unit: k === "be" ? "MWh" : "MW",
          hint: function () { return hintOf(k); }, onChange: changed });
      });
    });
    function hintOf(k) {
      var T = S_.C.techs, t = cfg.techs;
      if (k === "wind") return fm.k(T.wind.fixed) + " per MW-year; makes " + fm.pct(Y.windCF) + " of its size on average.";
      if (k === "solar") return fm.k(T.solar.fixed) + " per MW-year; makes " + fm.pct(Y.solarCF) + " of its size on average.";
      if (k === "nuc") return fm.k(T.nuc.fixedTotal) + " per MW-year with fuel; modelled as a constant " + fm.pct(t.nuc.avail) + " of its size every hour (a simplification).";
      if (k === "cc") return fm.k(T.cc.fixed) + " per MW-year + $" + T.cc.run.toFixed(0) + "/MWh to run; " + T.cc.co2.toFixed(2) + " t CO₂/MWh.";
      if (k === "pk") return fm.k(T.pk.fixed) + " per MW-year + $" + T.pk.run.toFixed(0) + "/MWh to run; " + T.pk.co2.toFixed(2) + " t CO₂/MWh.";
      if (k === "bp") return fm.k(T.bp.fixed) + " per MW-year: how fast it charges or discharges.";
      return fm.k(T.be.fixed) + " per MWh-year: how much it holds; " + Math.round(cfg.techs.battery.rte * 100) + "% round trip.";
    }
    var tal = H("div", { class: "lx-tallies lx13-tallies" }, panel);
    function tally(label) { var d = H("div", { class: "lx-tally" }, tal); H("span", { text: label }, d); return { box: d, b: H("b", { text: "…" }, d) }; }
    var tCost = tally("Cost a year"), tCo2 = tally("CO₂ a year"), tUns = tally("Unserved energy"), tSpill = tally("Spilled energy");

    var ob = H("div", { class: "lx13-box" }, panel);
    H("p", { class: "lx-eyebrow", text: "Ask the optimizer" }, ob);
    var capSl = LX.Slider(ob, { label: "CO₂ cap", color: "var(--lx-ink-2)", max: G.capMax, step: G.capStep, unit: "kt",
      hint: function () { return "kt = thousand tonnes. The cheapest plan that emits at most this much in a year."; } });
    capSl.set(G.capDefault);
    var askBtn = H("button", { class: "lx-btn small", type: "button", html: "Find the cheapest plan" + LX.icon("target") }, ob);
    var optOut = H("div", { "aria-live": "polite" }, ob);

    var acts = H("div", { class: "lx13-rowb" }, panel);
    var finBtn = H("button", { class: "lx-btn", type: "button", html: "Score my plan" + LX.icon("star") }, acts);
    // sharing (LX.Share): the plan in the address, as #plan-w530-s160-..., plus the scenario when it is not EIA's
    var sharer = LX.Share(panel, { button: acts, buttonText: "Share this plan", id: "t13-link",
      note: "Anyone who opens this link sees your plan and runs its year themselves.",
      hash: function () { return model.encodePlan(S_.plan, isDefault() ? null : S_.sc); } });
    var scen = H("details", { class: "lx13-scen" }, panel);
    H("summary", { text: "Costs in this scenario: gas price, nuclear cost" }, scen);
    var gasN = Num(scen, { label: "Gas price", color: "var(--lx-cc)", min: lim.gas.min, max: lim.gas.max, step: 0.05, value: S_.sc.gas,
      fmt: function (v) { return "$" + v.toFixed(2) + "/MMBtu"; }, hint: "MMBtu: a million Btu of fuel energy. 2025 U.S. average for power plants: $" + DEF.gas.toFixed(2) + " (EIA).", onChange: scenChanged });
    var nucN = Num(scen, { label: "Nuclear capital cost", color: "var(--lx-nuc)", min: lim.nucCapex.min, max: lim.nucCapex.max, step: 5, value: S_.sc.nucCapex,
      fmt: function (v) { return "$" + Math.round(v).toLocaleString("en-US") + "/kW"; }, hint: "EIA's overnight cost for a large light-water plant: $" + DEF.nucCapex.toLocaleString("en-US") + "/kW.", onChange: scenChanged });
    H("button", { class: "lx-link", type: "button", text: "Back to the EIA values", onclick: function () { gasN.set(DEF.gas); nucN.set(DEF.nucCapex); scenChanged(); } }, scen);
    var links = H("p", { class: "lx-play-links" }, live);
    var retour = H("button", { class: "lx-link", type: "button", text: "Show the three tips again" }, links);

    // ---- solving
    function readPlan() { var p = {}; KEYS.forEach(function (k) { p[k] = sl[k].val(); }); return p; }
    function setPlan(p) { KEYS.forEach(function (k) { sl[k].set(p[k]); }); S_.plan = readPlan(); }
    var timer = null;
    function changed() { S_.plan = readPlan(); S_.from = "you"; clearTimeout(timer); timer = setTimeout(run, 120); }
    function run() {
      var plan = copy(S_.plan), C = S_.C, my = ++S_.seq;
      status.set(LX.solver.mode ? "solving" : "loading");
      return LX.solver.solve(model.weekModel(C, RW, { plan: plan }), { key: "t13-plan", label: "t13-plan", timeLimit: 10 }).then(function (r) {
        if (my !== S_.seq) return;
        status.set(r);
        if (!r.ok) return;
        S_.sum = model.summarize(C, per, r, { plan: plan }); S_.raw = r.values; S_.full = null; S_.exactGap = null;
        if (S_.sum.unserved > 0.5) S_.short = true;
        S_.spill = Math.max(S_.spill, S_.sum.spilledShare);
        if (S_.sum.energy.dis > 1) S_.bat = true;
        render();
      });
    }
    function scenChanged() {
      S_.sc = { gas: gasN.val(), nucCapex: nucN.val() }; S_.C = model.costs(cfg, S_.sc);
      KEYS.forEach(function (k) { sl[k].range(0, lim[k].max); });
      if (isDefault()) { S_.frontier = cfg.frontier.points; S_.frontierLive = false; frBtn.hidden = true; frNote.hidden = true; }
      else frontierStale();
      S_.asked = null; optOut.innerHTML = "";
      changed();
    }
    // the stored frontier holds only for EIA's costs: other costs (changed here, or arriving in a shared link) need a new one
    function frontierStale() {
      S_.frontier = []; S_.frontierLive = false; frBtn.hidden = false; frNote.hidden = false;
      frNote.textContent = "The frontier depends on the costs: solve it again for these settings (about " + cfg.frontier.caps.length + " solves).";
    }
    frBtn.addEventListener("click", function () {
      var caps = cfg.frontier.caps, pts = [], i = 0, key = S_.sc.gas + "|" + S_.sc.nucCapex;
      frBtn.hidden = true; frNote.textContent = "Solving…";
      (function next() {
        if (key !== S_.sc.gas + "|" + S_.sc.nucCapex) return;
        if (i >= caps.length) { S_.frontier = pts; S_.frontierLive = true; frNote.textContent = "Frontier solved for gas at $" + S_.sc.gas.toFixed(2) + "/MMBtu and nuclear at $" + Math.round(S_.sc.nucCapex).toLocaleString("en-US") + "/kW."; render(); return; }
        var cap = caps[i++], o = cap == null ? {} : { cap: cap * 1e3 };
        LX.solver.solve(model.weekModel(S_.C, RW, o), { label: "t13-frontier", timeLimit: 10 }).then(function (r) {
          if (r.ok) { var s = model.summarize(S_.C, per, r, o); pts.push({ cap: cap, cost: s.cost, co2: s.co2, dual: s.capDual, plan: s.plan }); S_.frontier = pts.slice(); frNote.textContent = "Solving… " + i + " of " + caps.length; drawFrontier(); }
          next();
        });
      })();
    });
    function ask() {
      var cap = capSl.val() * 1e3, C = S_.C;
      optOut.innerHTML = ""; status.set("solving"); askBtn.disabled = true;
      LX.solver.solve(model.weekModel(C, RW, { cap: cap }), { key: "t13-opt", label: "t13-opt", timeLimit: 15 }).then(function (r) {
        askBtn.disabled = false; status.set(r);
        if (!r.ok) { H("p", { class: "lx13-sub", text: LX.solver.describe(r) }, optOut); return; }
        var s = model.summarize(C, per, r, { cap: cap });
        S_.asked = { cap: cap, sum: s, ms: r.ms.roundTrip };
        LX.store.set("t13-asked", { cap: cap, cost: s.cost, co2: s.co2, dual: s.capDual });
        showOpt(); drawFrontier(); LX.emit("t13-asked");
      });
    }
    askBtn.addEventListener("click", ask);
    function showOpt() {
      var a = S_.asked; optOut.innerHTML = ""; if (!a) return;
      var s = a.sum, t = H("table", { class: "lx13-plan" }, optOut), hr = H("tr", null, H("thead", null, t));
      H("th", { scope: "col", text: "Optimizer, cap " + Math.round(a.cap / 1e3) + " kt" }, hr); H("th", { scope: "col", class: "n", text: "Optimizer" }, hr); H("th", { scope: "col", class: "n", text: "You" }, hr);
      var b = H("tbody", null, t);
      KEYS.forEach(function (k) { var tr = H("tr", null, b); H("td", { text: TECH[k].label }, tr); H("td", { class: "n", text: Math.round(s.plan[k]) + (k === "be" ? " MWh" : " MW") }, tr); H("td", { class: "n", text: S_.plan[k] + (k === "be" ? " MWh" : " MW") }, tr); });
      var rd = model.capReading(a.cap, s);
      var line = "Cost " + fm.musd(s.cost) + " a year for " + fm.kt(s.co2) + " of CO₂." + (rd.kind === "zero" ? " This plan meets a zero operational-CO₂ cap: no gas runs. At that edge the shadow price is no guide to a carbon price."
        : rd.kind === "binds" ? " Cutting one more tonne would cost $" + (rd.dual < 1 ? rd.dual.toFixed(2) : Math.round(rd.dual)) + ": the cap's [[shadow-price|shadow price]]." : " The cap does not bind: the cheapest plan of all already emits less.");
      H("p", { class: "lx13-sub", html: LX.rich(line) }, optOut);
      H("button", { class: "lx-btn ghost small", type: "button", text: "Use this plan", title: "Rounded up to the sliders' steps", onclick: function () { setPlan(model.ceilPlan(s.plan, lim)); S_.from = "optimizer"; run(); } }, optOut);
    }
    resetBtn.addEventListener("click", function () { setPlan(cfg.start.plan); S_.from = "start"; run(); });

    // ---- drawing
    function drawWeek() {
      tabs.forEach(function (b, i) { b.setAttribute("aria-pressed", i === S_.week ? "true" : "false"); });
      var r = RW.reps[S_.week];
      wsub.textContent = (r.kind === "season" ? "A typical " + r.season + " week of 2025, standing for " + r.n + " weeks" :
        r.kind === "peak" ? "The week of 2025's highest demand, kept as it was" : r.kind === "netpeak" ? "The week when demand minus wind and sun peaked, kept as it was" :
        "The week with the least wind of 2025, kept as it was") + ".";
      if (S_.raw) wc.draw(model.weekSeries(S_.C, per[S_.week], S_.raw, S_.week, S_.plan), r.start);
    }
    function drawFrontier() {   // the 0 kt point (about $288M at the default costs) is left off the chart: it would squash the curve
      fc.frontier(S_.frontier.filter(function (p) { return p.cap == null || p.cap >= 25; }), S_.frontierLive ? "Frontier for this scenario" : null);
      var pts = [];
      if (S_.asked) pts.push({ id: "", label: "Optimizer, cap " + Math.round(S_.asked.cap / 1e3) + " kt", co2: S_.asked.sum.co2, cost: S_.asked.sum.cost, color: "var(--lx-ink-2)", kind: "opt", legend: "The optimizer's plan" });
      if (S_.sum) pts.push({ id: "You", label: "Your plan", co2: S_.sum.co2, cost: S_.sum.cost, color: S_.sum.unserved > 0.5 ? "var(--lx-bad)" : "var(--lx-accent)", kind: "you", legend: "Your plan", note: S_.sum.unserved > 0.5 ? "some demand unserved" : "" });
      fc.plans(pts);
    }
    function gapNow() {
      if (!S_.sum || !S_.frontier.length) return null;
      var f = model.frontierAt(S_.frontier, S_.sum.co2); return f ? S_.sum.cost / f - 1 : null;
    }
    function render() {
      var s = S_.sum; if (!s) return;
      tCost.b.textContent = fm.musd(s.cost); tCo2.b.textContent = fm.kt(s.co2);
      tUns.b.textContent = s.unserved < 0.5 ? "0 MWh" : fm.mwh(s.unserved); tUns.box.classList.toggle("bad", s.unserved >= 0.5);
      tSpill.b.textContent = fm.pct(s.spilledShare, 1);
      // energy mix of the year (served energy, spill taken pro rata from wind, sun and nuclear)
      mix.innerHTML = "";
      var keep = s.available > 0 ? 1 - s.spilled / s.available : 1, e = s.energy;
      var parts = [["Nuclear", e.nuc * keep, "var(--lx-nuc)"], ["Wind", e.wind * keep, "var(--lx-wind)"], ["Solar", e.solar * keep, "var(--lx-solar)"], ["Gas CC", e.cc, "var(--lx-cc)"], ["Peaker", e.pk, "var(--lx-pk)"], ["Unserved", s.unserved, "var(--lx-bad)"]];
      var tot = parts.reduce(function (a, p) { return a + p[1]; }, 0);
      var words = parts.filter(function (p) { return p[1] / tot >= 0.005; }).map(function (p) { H("i", { style: "--c:" + p[2] + ";width:" + (p[1] / tot * 100).toFixed(2) + "%" }, mix); return p[0] + " " + Math.round(p[1] / tot * 100) + "%"; });
      mix.setAttribute("aria-label", "The year's energy: " + words.join(", ")); mixLeg.textContent = "The year's energy: " + words.join(" · ") + ". Demand " + (s.demand / 1e6).toFixed(2) + " TWh.";
      drawWeek(); drawFrontier(); missions(); event(); store();
      if (S_.asked) showOpt();
    }
    function missions() {
      var s = S_.sum, g = S_.exactGap != null ? S_.exactGap : gapNow(), lit = s.unserved < 0.5;
      ms.set("lights", { frac: lit ? 1 : Math.max(0.05, 1 - s.unservedShare * 200), text: lit ? "Every modelled hour served" : fm.mwh(s.unserved) + " unserved", fail: !lit, won: lit });
      ms.set("co2", { frac: s.co2 / target, text: fm.kt(s.co2), fail: s.co2 > target + 0.5, won: s.co2 <= target + 0.5 });
      ms.set("cost", { frac: g == null ? 0 : Math.max(0.03, g / G.costSlack), text: g == null ? "frontier not solved" : (S_.exactGap != null ? "+" : "about +") + fm.pct(Math.max(0, g), 1) + " vs frontier", fail: g != null && g > G.costSlack, won: lit && g != null && g <= G.costSlack });
    }
    function event() {
      evBox.querySelectorAll(".lx-event.t13").forEach(function (n) { n.remove(); });
      var s = S_.sum, msg, icon = "check";
      if (S_.from === "link" && !S_.linkSaid) { S_.linkSaid = true; msg = "A plan loaded from a shared link."; icon = "map"; }
      else if (s.unserved >= 0.5) {
        var worst = 0, wk = 0; per.forEach(function (P, p) { var ws = model.weekSeries(S_.C, P, S_.raw, p, S_.plan); ws.unserved.forEach(function (u) { if (u > worst) { worst = u; wk = p; } }); });
        icon = "question"; msg = "Lights out: up to " + Math.round(worst) + " MW short in the " + tabs[wk].textContent.toLowerCase() + " week. Add [[firm-capacity|firm]] plants or storage.";
      } else if (s.spilledShare > 0.1) { icon = "question"; msg = fm.pct(s.spilledShare, 0) + " of what the wind, solar and nuclear plants could make is [[curtailment|spilled]]: more than the town and the battery can use."; }
      else if (s.co2 > target + 0.5) msg = "Every modelled hour served. Cut " + fm.kt(s.co2 - target) + " more CO₂ to reach the target.";
      else { var g = gapNow(); msg = "Every modelled hour served, under the CO₂ target" + (g != null ? ", about " + fm.pct(Math.max(0, g), 1) + " above the frontier." : "."); }
      var e = H("div", { class: "lx-event t13", html: LX.icon(icon) + "<div>" + LX.rich(msg) + "</div>" }, evBox);
      return e;
    }
    function store() {
      var s = S_.sum;
      LX.store.set("t13-log", { cost: s.cost, co2: s.co2, unserved: s.unserved, spilled: s.spilledShare, plan: S_.plan, gap: gapNow(), short: S_.short, bat: S_.bat });
      LX.emit("t13-run");
    }

    // ---- the opening question (first visit, not for a shared link)
    if (!shared) {
      var q = H("div", { class: "lx-ecard" }, evBox);
      H("p", { class: "lx-etime", text: "Before you build · 2025, hour by hour" }, q);
      S_.pred = LX.Predict(q, { id: "t13-start", fresh: true, q: "Lesson 0's five plants must now serve a whole year, with a peak of " + Math.round(Y.peak) + " MW. Will every light stay on?",
        options: [{ value: "yes", label: "Yes, all year" }, { value: "no", label: "No, some hours go dark" }], answer: "no",
        feedback: { yes: "Not quite.", no: "Right." }, lockText: "Locked in.",
        onPick: function () { S_.picked = true; setTimeout(function () { if (!S_.done && S_.tourWait) tour.start(0); }, 900); var go = function () { var s = S_.sum; S_.pred.reveal(s.unserved >= 0.5 ? "Run on the seven weeks, the year leaves " + fm.mwh(s.unserved) + " unserved. Gas and nuclear give at most " + Math.round(S_.plan.cc + S_.plan.pk + S_.plan.nuc * cfg.techs.nuc.avail) + " MW; on some hot, still evenings wind and sun cannot cover the rest." : "Every modelled hour is served."); };
          if (S_.sum) go(); else LX.on("t13-run", function once() { if (S_.pred) { go(); S_.pred = null; } }); } });
    }

    // ---- finishing: stars, notes, the full-year check
    finBtn.addEventListener("click", finish);
    function finish() {
      if (!S_.sum) return Promise.resolve();
      var s = S_.sum, C = S_.C;
      finBtn.disabled = true; status.set("solving");
      return LX.solver.solve(model.weekModel(C, RW, { cap: s.co2 }), { key: "t13-opt", label: "t13-score", timeLimit: 15 }).then(function (r) {
        finBtn.disabled = false; status.set(r);
        var f = r.ok ? model.summarize(C, per, r, { cap: s.co2 }).cost : model.frontierAt(S_.frontier, s.co2);
        debrief(s, f);
      });
    }
    function debrief(s, fCost) {
      var st = model.stars(s, target, fCost);
      S_.exactGap = st.gap; missions();
      S_.done = true; LX.progress.done(LESSON);
      LX.store.set("t13-score", { stars: st, frontier: fCost, cost: s.cost, co2: s.co2, unserved: s.unserved });
      panel.hidden = true; links.hidden = true; deb.hidden = false; deb.innerHTML = "";
      var hd = H("div", { class: "lx-deb-head" }, deb);
      var hTitle = H("h3", { text: s.unserved < 0.5 ? "Your plan serves every modelled hour." : "Your plan leaves " + fm.mwh(s.unserved) + " unserved in the modelled year." }, hd);
      H("a", { class: "lx-btn small", href: "#explain", html: "See it as diagrams" + LX.icon("arrow") }, hd);
      H("p", { class: "lx13-sub", text: "Scored on the seven weeks. The full-year check below can change the verdict." }, deb);
      LX.Stars(deb, [{ label: "Lights on", n: st.lights, value: s.unserved < 0.5 ? "every modelled hour" : fm.mwh(s.unserved) + " short" },
                     { label: "CO₂", n: st.co2, value: fm.kt(s.co2) }, { label: "Cost", n: st.cost, value: st.gap == null ? fm.musd(s.cost) : "+" + fm.pct(Math.max(0, st.gap), 1) }]);
      if (fCost) H("p", { class: "lx-hint", text: "The cheapest plan with your CO₂ (" + fm.kt(s.co2) + ") costs " + fm.musd(fCost) + " a year; yours costs " + fm.musd(s.cost) + "." }, deb);
      // check on all 8,760 hours
      var fb = H("div", { class: "lx13-box" }, deb);
      H("p", { class: "lx-eyebrow", text: "Check it on the full year" }, fb);
      H("p", { class: "lx13-sub", text: "Your plan was run on seven weeks. Real planners re-run a chosen plan hour by hour on the whole year." }, fb);
      var fbtn = H("button", { class: "lx-btn ghost small", type: "button", text: "Run all 8,760 hours (a few seconds)" }, fb), fout = H("div", { "aria-live": "polite" }, fb);
      S_.fullCheck = function () { fbtn.click(); };
      fbtn.addEventListener("click", function () {
        fbtn.disabled = true; fout.textContent = "Solving the full year…";
        var plan = copy(S_.plan), C = S_.C, fy = [{ demand: Y.demand, wind: Y.wind, solar: Y.solar, weight: 1 }];
        LX.solver.solve(model.fullYearModel(C, Y, { plan: plan }), { key: "t13-full", label: "t13-full", timeLimit: 30 }).then(function (r) {
          fbtn.disabled = false; fout.innerHTML = "";
          if (!r.ok) { fout.textContent = LX.solver.describe(r); return; }
          var f = model.summarize(C, fy, r, { plan: plan }), v = model.fullVerdict(s, f, target); S_.full = f;
          var hrsShort = Object.keys(r.values).filter(function (k) { return k.charAt(0) === "u" && r.values[k] > 0.05; }).length;
          LX.store.set("t13-full", { cost: f.cost, co2: f.co2, unserved: f.unserved, spilled: f.spilledShare, wcost: s.cost, wco2: s.co2, wun: s.unserved, held: v.held });
          var t = H("table", { class: "lx13-cmp" }, fout), hr = H("tr", null, H("thead", null, t));
          ["", "Seven weeks", "All 8,760 hours"].forEach(function (x) { H("th", { scope: "col", text: x }, hr); });
          var b = H("tbody", null, t);
          [["Cost a year", fm.musd(s.cost), fm.musd(f.cost)], ["CO₂ a year", fm.kt(s.co2), fm.kt(f.co2)], ["Unserved", fm.mwh(s.unserved), fm.mwh(f.unserved)], ["Spilled", fm.pct(s.spilledShare), fm.pct(f.spilledShare)]]
            .forEach(function (row) { var tr = H("tr", null, b); row.forEach(function (x) { H("td", { text: x }, tr); }); });
          // the verdict, judged again on the full year: demand served, and CO2 against the target
          var ul = H("ul", { class: "lx13-verdict" }, fout);
          var vline = function (good, html) { var li = H("li", null, ul); H("span", { class: good ? "ok" : "no", html: LX.icon(good ? "check" : "question") }, li); H("span", { html: html }, li); };
          vline(v.served, v.served ? "Demand: every one of the 8,760 hours served." : "Demand: <b>" + fm.mwh(f.unserved) + "</b> unserved in " + hrsShort + " hours (" + (f.unservedShare * 100).toFixed(4) + "% of the year's demand).");
          vline(v.co2ok, "CO₂: <b>" + fm.kt(f.co2) + "</b> against the " + G.co2Target + " kt target" + (v.co2ok ? ", under it." : ": " + fm.kt(v.over) + " (" + fm.pct(v.overShare, 1) + ") over."));
          var why = !v.co2ok && !v.served ? "some hours go short and gas runs more than they predicted." : !v.co2ok ? "gas runs more than they predicted." : "some hours go short.";
          H("p", { class: "lx13-sub", text: "Solved in " + Math.max(1, Math.round(r.ms.roundTrip)) + " ms. " + (v.held ? "The seven-week verdict holds for this plan on the full year." :
            !v.changed ? "The full year confirms what the seven weeks showed." : "The full year changes the verdict: seven weeks cannot show every still, hot evening, so " + why) }, fout);
          hTitle.textContent = "On the full year, your plan " + (v.served ? "serves every hour" : "leaves " + fm.mwh(f.unserved) + " unserved") + " and emits " + fm.kt(f.co2) + (v.co2ok ? ", under the target." : ", over the " + G.co2Target + " kt target.");
          ms.set("lights", { frac: v.served ? 1 : Math.max(0.05, 1 - f.unservedShare * 200), text: v.served ? "Full year: every hour served" : "Full year: " + fm.mwh(f.unserved) + " unserved", fail: !v.served, won: v.served });
          ms.set("co2", { frac: f.co2 / target, text: "Full year: " + fm.kt(f.co2), fail: !v.co2ok, won: v.co2ok });
          LX.emit("t13-run");
        });
      });
      var g = st.gap;
      var NOTES = [
        { icon: "scale", title: "Firm capacity", text: "On a still, dark evening only [[firm-capacity|firm]] plants and storage serve the peak.", moment: "", got: S_.short, lock: "See a plan go short once to collect this." },
        { icon: "cloud", title: "Spilled energy", text: "Output beyond what the town and the battery can take is thrown away.", moment: "Your highest spill: " + fm.pct(S_.spill, 0) + ".", got: S_.spill >= 0.05, lock: "Build enough wind or sun to spill 5% to collect this." },
        { icon: "battery", title: "Storage", text: "A battery moves energy to the hours that need it and loses 15% on the way.", moment: "", got: S_.bat, lock: "Run a plan with a battery to collect this." },
        { icon: "target", title: "Shadow price of the cap", text: "What one more tonne of allowed CO₂ would save the cheapest plan.", moment: S_.asked && model.capReading(S_.asked.cap, S_.asked.sum).kind === "binds" ? "$" + Math.round(S_.asked.sum.capDual) + " per tonne at " + Math.round(S_.asked.cap / 1e3) + " kt." : "", got: !!S_.asked, lock: "Ask the optimizer to collect this." },
        { icon: "frontier", title: "The frontier", text: "No plan is both cheaper and cleaner than a plan on the frontier.", moment: g != null ? "Your plan: " + fm.pct(Math.max(0, g), 1) + " above it." : "", got: g != null && g <= G.costSlack && s.unserved < 0.5, lock: "Get within " + Math.round(G.costSlack * 100) + "% of the frontier with every modelled hour served." }
      ];
      H("h4", { class: "lx-deb-notes", text: "Notes collected: " + NOTES.filter(function (n) { return n.got; }).length + " of " + NOTES.length }, deb);
      LX.Notes(deb, NOTES.map(function (n) { n.link = { href: "#explain", text: "On the concept map" }; return n; }));
      var row = H("div", { class: "lx13-rowb" }, deb);
      H("button", { class: "lx-btn ghost small", type: "button", text: "Back to my plan", onclick: function () { deb.hidden = true; panel.hidden = false; links.hidden = false; panel.scrollIntoView({ block: "nearest" }); } }, row);
      H("button", { class: "lx-btn ghost small", type: "button", text: "Share this plan", onclick: function () { deb.hidden = true; panel.hidden = false; links.hidden = false; sharer.share(); } }, row);
      deb.focus({ preventScroll: true }); LX.emit("t13-done"); LX.emit("layout");
    }

    // ---- the coach tour and start
    var tour = LX.Coach(root, [
      { el: sl.wind.el, text: "Choose how much of each plant to build. Every change runs the town's year again." },
      { el: tal, text: "Watch the year's cost and CO₂, and any demand left unserved or energy spilled." },
      { el: askBtn, text: "Stuck? Ask the optimizer for the cheapest plan under a CO₂ cap, then compare it with yours." }
    ], { key: "t13-coach" });
    retour.addEventListener("click", function () { root.scrollIntoView({ block: "start" }); setTimeout(function () { tour.start(0, true); }, 60); });
    setPlan(S_.plan); gasN.set(S_.sc.gas); nucN.set(S_.sc.nucCapex);
    if (!isDefault()) { frontierStale(); scen.open = true; }
    tCost.b.textContent = "…"; drawFrontier(); status.set("loading");
    var first = run();
    if ("IntersectionObserver" in window && !LX.demoState()) {
      var io = new IntersectionObserver(function (es) {
        if (es.some(function (e) { return e.isIntersecting; })) {   // after the opening question, when there is one
          io.disconnect(); if (S_.pred && !S_.picked) { S_.tourWait = true; return; } setTimeout(function () { if (!S_.done) tour.start(0); }, 350); }
      }, { threshold: 0.95 });
      io.observe(sl.wind.el);
    }
    // demo states (core.js LX.demo): "mid" = the optimizer's plan at the target, loaded into the sliders; "done" = then scored;
    // "year" = scored, then checked on all 8,760 hours (the full-year verdict)
    LX.demo(root, function (state) {
      if (state !== "mid" && state !== "done" && state !== "year") return null;
      first.then(function () {
        if (S_.pred) { S_.pred = null; evBox.querySelectorAll(".lx-ecard").forEach(function (n) { n.remove(); }); }
        capSl.set(G.co2Target); ask();
        LX.on("t13-asked", function () { setPlan(model.ceilPlan(S_.asked.sum.plan, lim)); S_.from = "optimizer"; run().then(function () { if (state === "done" || state === "year") finish().then(function () { if (state === "year" && S_.fullCheck) S_.fullCheck(); }); }); });
      });
      return { view: state };
    });
    root.lxGame = { model: model, state: function () { return S_; }, finish: finish, ask: ask, setPlan: function (p) { setPlan(p); return run(); }, tour: tour };
    buildExplain(cfg, Y, RW);
  }

  // ---------------------------------------------------------------- the explain layer (the reader's numbers where they exist)
  function buildExplain(cfg, Y, RW) {
    var host = document.getElementById("t13-explain"); if (!host) return;
    host.innerHTML = ""; host.classList.add("is-live");
    var C = model.costs(cfg, {}), pts = cfg.frontier.points, at200 = pts.filter(function (p) { return p.cap === cfg.game.co2Target; })[0];
    var free = pts.filter(function (p) { return p.cap == null; })[0];
    var log = function () { return LX.store.get("t13-log", null); };
    var later = "Next: M3 (capacity expansion) writes this model in code, on representative weeks checked against the full year.";
    var cm = LX.ConceptMap(H("div", { class: "lx-xcard" }, host), {
      title: "The planning problem, and how its parts connect", lede: "Tap an idea to see what it means and where it appeared in your plan.",
      groups: { dec: ["Decisions", "var(--lx-tier-3)"], ops: ["Operation", "var(--lx-cc)"], time: ["Time", "var(--lx-tier-2)"], out: ["Results", "var(--lx-good)"] },
      cols: 4, rows: 3, colsN: 3, rowsN: 4, sel: "build",
      nodes: [
        { id: "build", g: "dec", label: "What to build", lines: ["What to", "build"], at: [3, 1], atN: [2, 1], text: "Seven numbers: MW of five plants, and the battery's MW and MWh. Each costs money every year, used or not.", game: "Your sliders.", later: later },
        { id: "run", g: "ops", label: "Hourly operation", lines: ["Hourly", "operation"], at: [1, 1], atN: [1, 1], text: "Given what is built, the solver runs the plants and the battery at least cost, every modelled hour.", game: "The week chart." },
        { id: "weeks", g: "time", label: "Seven weeks", lines: ["Seven", "weeks"], at: [0, 0], atN: [0, 0], text: "Four typical weeks (one per season) and three extreme ones stand for the 52 weeks of 2025.", game: "The week tabs." },
        { id: "rules", g: "dec", label: "Rules", at: [2, 0], atN: [0, 1], text: "Supply covers demand each hour; no plant above its size; the battery's charge stays within its MWh.", game: "Unserved energy appears when a rule cannot be met." },
        { id: "store", g: "time", label: "Storage link", lines: ["Storage", "link"], at: [1, 0], atN: [1, 0], text: "The battery's charge carries from each calendar week to the next, so energy can move across weeks.", game: "Charging, below zero on the chart." },
        { id: "cost", g: "out", label: "Cost a year", lines: ["Cost", "a year"], at: [3, 2], atN: [2, 2], text: "Capital and fixed costs of what is built, plus fuel for what runs. The goal the optimizer keeps as low as it can.", game: "The cost tally." },
        { id: "co2", g: "out", label: "CO₂ a year", lines: ["CO₂", "a year"], at: [1, 2], atN: [1, 2], text: "Gas burned, times " + C.techs.cc.co2.toFixed(2) + " t per MWh in the combined-cycle plant and " + C.techs.pk.co2.toFixed(2) + " in the peaker.", game: "The CO₂ tally." },
        { id: "cap", g: "dec", label: "CO₂ cap", lines: ["CO₂", "cap"], at: [3, 0], atN: [2, 0], text: "An extra rule: the year's CO₂ at most the cap. Its shadow price is the cost of the last tonne cut.", game: at200 ? "At " + cfg.game.co2Target + " kt the last tonne cut costs $" + Math.round(at200.dual) + "." : "" },
        { id: "front", g: "out", label: "Frontier", at: [2, 2], atN: [1, 3], text: "The cheapest plan at each CO₂ level. Lesson 12 traced it; your plan sits on it or above it.", game: free ? "From " + fm.musd(free.cost) + " with no cap to " + fm.musd(at200.cost) + " at " + cfg.game.co2Target + " kt." : "" },
        { id: "short", g: "out", label: "Unserved and spilled", lines: ["Unserved,", "spilled"], at: [0, 2], atN: [0, 2], text: "Demand nobody could serve, and output nobody could use: both signs that a plan is out of balance.", game: "The red bars, and the spilled tally." }
      ],
      edges: [["build", "run", "limits"], ["weeks", "run", "set the hours of"], ["store", "run", "links weeks in"], ["rules", "run", "constrain"],
              ["build", "cost", "capital adds to"], ["run", "co2", "gas burns"], ["run", "short", "shows"], ["cap", "build", "pushes"], ["cost", "front", "plots on"], ["co2", "front", "plots on"]],
      moment: function (id) {
        var L = log(); if (!L) return null;
        if (id === "cost") return "Your plan: " + fm.musd(L.cost) + " a year.";
        if (id === "co2") return "Your plan: " + fm.kt(L.co2) + " a year.";
        if (id === "front") return L.gap != null ? "Your plan: " + fm.pct(Math.max(0, L.gap), 1) + " above the frontier." : null;
        if (id === "short") return "Your plan: " + fm.mwh(L.unserved) + " unserved, " + fm.pct(L.spilled) + " spilled.";
        if (id === "weeks") { var F = LX.store.get("t13-full", null); return F ? "Your full-year check: " + fm.musd(F.cost) + " and " + fm.kt(F.co2) + " on all 8,760 hours, against " + fm.musd(F.wcost) + " and " + fm.kt(F.wco2) + " on seven weeks." : null; }
        return null;
      }
    });
    LX.on("t13-done", function () { cm.select("front"); });
    LX.Boundary(H("div", { class: "lx-xcard" }, host), {
      title: "Where this answer holds",
      lede: "A model's plan is only as good as what it includes. This one is built to teach; read its answers with these limits.",
      holds: [
        "the weather of 2025 is a fair guide: one year of real Southwest Power Pool shapes, scaled to the town;",
        "costs stay as entered, all in " + cfg.priceYear + " dollars (the battery's " + cfg.techs.battery.source.dollarYear + " costs converted with BEA's GDP price index), the same in every year;",
        "the town is an island: no imports, no transmission limits inside it;",
        "nuclear output is a constant " + Math.round(cfg.techs.nuc.avail * 1000) / 10 + "% of its size every hour: a fleet's yearly average, which cannot show reliability;",
        "seven weeks stand in for the year (check it on all 8,760 hours in the debrief)." ],
      leaves: [
        "start-up costs, minimum output and ramp limits of gas plants (lesson 0 had a ramp limit);",
        "plant outages and a reserve margin: adequacy needs many weather years (A5, upcoming);",
        "taxes, tax credits and financing beyond a 4% real cost of capital;",
        "who pays, jobs, land and local air quality: costs here are the system's, not any one household's." ],
      source: "Data: EIA-930 hourly data for 2025; costs from EIA's Annual Energy Outlook 2026 and an NREL battery study, listed under Sources."
    });
    var tcard = H("div", { class: "lx-xcard" }, host);
    TextTable(tcard, {
      title: "What real planning models do",
      lede: "All four solve the same kind of problem: least cost, subject to rules, over many hours.",
      columns: [{ key: "name", label: "Model" }, { key: "plans", label: "What it plans" }, { key: "time", label: "How it handles time" }, { key: "open", label: "Code" }],
      rows: [
        { color: "var(--lx-accent)", name: "This lesson", note: "one town, one year", plans: "Seven capacities for one town", time: "Seven weeks, battery linked across the year", open: "Open (this page)" },
        { color: "var(--lx-tier-3)", name: "GenX", note: "Julia and JuMP", plans: "Generation, storage, transmission and demand-side resources", time: "Representative periods with storage linked between them, or the full year", open: "Open source (GPL-2.0)" },
        { color: "var(--lx-tier-4)", name: "ReEDS", note: "NLR (formerly NREL), the contiguous U.S.", plans: "Generation, storage and transmission across 132 regions, to 2050 and beyond", time: "33 representative days by default, plus stress periods for reliability", open: "Open source" },
        { color: "var(--lx-tier-5)", name: "PyPSA", note: "Python", plans: "Investment and operation of power and energy networks", time: "Any set of time steps with weights: full years or reduced ones", open: "Open source (MIT)" }
      ]
    });
    H("p", { class: "lx13-sub", html: 'Official pages: <a href="https://www.nlr.gov/analysis/reeds/">ReEDS (NLR)</a> and its <a href="https://docs.nlr.gov/docs/fy26osti/93617.pdf">2025 documentation</a> (PDF); <a href="https://docs.pypsa.org/">PyPSA documentation</a>; <a href="https://genxproject.github.io/GenX.jl/">GenX documentation</a>.' }, tcard);
  }

  LX.mount("town-plan", function (live, data, root) { view(live, data, root); });
})();
