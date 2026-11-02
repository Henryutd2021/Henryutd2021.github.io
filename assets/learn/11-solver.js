// 11-solver.js — Lesson 11, "Ask the solver, then check its answer" (model lab, Modeler tier; W1, 2026-11-02).
//
// Data: assets/learn/data/11-solver.json (slider ranges, the unserved penalty, lesson 0's cheapest-first totals and a
// precomputed answer used only if the solver cannot load), town.json (Prairie Town's fleet; illustrative), town_year.json
// (real 2025 SPP shapes) and 10-write-it-down.json (the hour of lesson 10, for the "peek inside the solver" box). The
// page also loads assets/learn/10-write-it-down.js for its lesson-local components (plot, simplex walk, equation card).
//
// Model: lesson 0's day (3 September 2025, cut and rounded as grid-operator.js prepare() does) as one linear program,
// solved in the browser by HiGHS (LX.solver):
//   decisions  for each hour t: cc_t (combined-cycle, 0..150 MW), pk_t (peaker, 0..100), sp_t (spilled wind and sun,
//              0..w_t + v_t), un_t (unserved demand, >= 0)
//   goal       min sum_t (40 cc_t + 100 pk_t + V un_t) + 24 x 100 x $10 (the nuclear plant's flat running cost)
//   rules      balance_t:  cc_t + pk_t - sp_t + un_t = need_t  (need = demand - nuclear - wind - sun; MW for one hour)
//              ramp_up_t / ramp_down_t:  -R <= cc_t - cc_{t-1} <= R, with cc_{-1} = 115 MW (lesson 0's start)
// The dual of balance_t is the shadow price of the demand rule: d(best cost)/d(demand at t), in $/MWh (LX.solver's
// convention). Sliders change R, the peaker's cost, demand (all hours, in %) and the wind farm's size (wind = shape x
// size, rounded). Two variants: a planted sign error (sp_t enters the balance with + instead of -) and an on-or-off
// peaker (binary on_t; pk_t between pkMin x on_t and 100 x on_t), a mixed-integer program that has no duals.
// The checks always use the true physics: nuclear + wind + sun + cc + pk + un - sp = demand, the sizes and the ramps.
// Every number on the page is checked against this model with the vendored HiGHS by _tests/learn/test_11-solver.js.
(function () {
  "use strict";
  var HOURS = 24;

  // ---------------------------------------------------------------- pure model (no DOM; exported for Node)
  function dayOf(town, year, key) {
    var sc = town.scenarios[key || "lesson0"], f = town.fleet, step = sc.step;
    var t0 = Date.parse(year.start_utc + "Z"), d0 = Date.parse(sc.date + "T00:00:00Z");
    var i = Math.round((d0 - t0) / 3600000) + 1 - (sc.utcOffsetHours || 0);
    var out = { date: sc.date, dateLabel: sc.dateLabel, fleet: f, startCC: sc.startCC, demand: [], wind: [], solar: [], need: [], windShape: [] };
    for (var t = 0; t < HOURS; t++) {
      var w = Math.round(year.wind[i + t] / 1000 * f.wind.mw), s = Math.round(year.solar[i + t] / 1000 * f.solar.mw);
      var n = Math.round((year.demand[i + t] / 1000 * sc.demandPeakMW - f.nuclear.mw - w - s) / step) * step;
      out.windShape.push(year.wind[i + t] / 1000); out.wind.push(w); out.solar.push(s); out.need.push(n); out.demand.push(n + f.nuclear.mw + w + s);
    }
    return out;
  }
  var DEFAULTS = { ramp: 40, pkCost: 100, demandPct: 0, windMW: 150, signError: false, onoff: false, pkMin: 30, add: null };
  function settings(o) { var s = {}, k; for (k in DEFAULTS) s[k] = DEFAULTS[k]; if (o) for (k in o) s[k] = o[k]; return s; }
  // the hours as the model sees them under settings s
  function hours(W, s) {
    var f = W.fleet, out = [];
    for (var t = 0; t < HOURS; t++) {
      var w = s.windMW === f.wind.mw ? W.wind[t] : Math.round(W.windShape[t] * s.windMW);
      var d = W.demand[t] * (1 + s.demandPct / 100) + (s.add && s.add[t] || 0);
      out.push({ t: t, demand: d, nuclear: f.nuclear.mw, wind: w, solar: W.solar[t], need: d - f.nuclear.mw - w - W.solar[t] });
    }
    return out;
  }
  function buildLP(W, s, V) {
    var f = W.fleet, hs = hours(W, s), vars = [], cons = [];
    hs.forEach(function (x, t) {
      vars.push({ name: "cc_" + t, ub: f.cc.mw, cost: f.cc.cost }, { name: "pk_" + t, ub: f.peaker.mw, cost: s.pkCost },
        { name: "sp_" + t, ub: x.wind + x.solar }, { name: "un_" + t, cost: V });
      var bal = {}; bal["cc_" + t] = 1; bal["pk_" + t] = 1; bal["sp_" + t] = s.signError ? 1 : -1; bal["un_" + t] = 1;
      cons.push({ name: "balance_" + t, terms: bal, eq: x.need });
      var up = {}; up["cc_" + t] = 1; if (t) up["cc_" + (t - 1)] = -1;
      cons.push({ name: "ramp_up_" + t, terms: up, le: s.ramp + (t ? 0 : W.startCC) });
      cons.push({ name: "ramp_down_" + t, terms: up, ge: -s.ramp + (t ? 0 : W.startCC) });
      if (s.onoff) {
        vars.push({ name: "on_" + t, type: "binary" });
        var lo = {}, hi = {}; lo["pk_" + t] = 1; lo["on_" + t] = -s.pkMin; hi["pk_" + t] = 1; hi["on_" + t] = -f.peaker.mw;
        cons.push({ name: "pk_min_" + t, terms: lo, ge: 0 }, { name: "pk_max_" + t, terms: hi, le: 0 });
      }
    });
    return { sense: "min", variables: vars, constraints: cons, objective: { terms: {}, constant: HOURS * f.nuclear.mw * f.nuclear.cost } };
  }
  // a solver result as hourly arrays, with totals
  function parse(W, s, r, V) {
    if (!r || !r.values) return null;
    var f = W.fleet, hs = hours(W, s), o = { status: r.status, kind: r.kind, objective: r.objective, mipGap: r.mipGap, cc: [], pk: [], sp: [], un: [], duals: r.duals ? [] : null, ms: r.ms };
    for (var t = 0; t < HOURS; t++) {
      ["cc", "pk", "sp", "un"].forEach(function (k) { var v = r.values[k + "_" + t]; o[k].push(Math.abs(v) < 1e-7 ? 0 : v); });
      if (r.duals) o.duals.push(r.duals["balance_" + t] + 0);
    }
    var sum = function (a) { return a.reduce(function (x, y) { return x + y; }, 0); };
    o.totals = { cc: sum(o.cc), pk: sum(o.pk), sp: sum(o.sp), un: sum(o.un), demand: sum(hs.map(function (x) { return x.demand; })) };
    o.totals.co2 = f.cc.co2 * o.totals.cc + f.peaker.co2 * o.totals.pk;
    o.totals.cost = HOURS * f.nuclear.mw * f.nuclear.cost + f.cc.cost * o.totals.cc + s.pkCost * o.totals.pk;   // running cost (no penalty)
    o.hours = hs;
    return o;
  }
  // the reader's edit of a plan: set cc at any hours; the peaker fills what is missing, then sun and wind are spilled
  function evalPlan(W, s, cc) {
    var f = W.fleet, hs = hours(W, s), res = { cc: [], pk: [], sp: [], over: [], un: [], rampBreaks: [], cost: HOURS * f.nuclear.mw * f.nuclear.cost };
    hs.forEach(function (x, t) {
      var c = cc[t], pk = Math.min(f.peaker.mw, Math.max(0, x.need - c)), sur = c + pk - x.need, sp = Math.max(0, Math.min(sur, x.wind + x.solar));
      var over = Math.max(0, sur - sp), un = Math.max(0, x.need - c - pk);
      res.cc.push(c); res.pk.push(pk); res.sp.push(sp); res.over.push(over); res.un.push(un);
      res.cost += f.cc.cost * c + s.pkCost * pk;
      var prev = t ? cc[t - 1] : W.startCC;
      if (Math.abs(c - prev) > s.ramp + 1e-9) res.rampBreaks.push(t);
    });
    res.ok = !res.rampBreaks.length && res.un.every(function (u) { return u < 1e-9; });
    return res;
  }
  // the four checks, with the true physics (never the model's own balance row)
  function checks(W, s, sol) {
    var f = W.fleet, hs = hours(W, s), maxBal = 0, lim = 0, maxRamp = 0, supply = 0, spill = 0, demand = 0, cost = HOURS * f.nuclear.mw * f.nuclear.cost;
    hs.forEach(function (x, t) {
      var cc = sol.cc[t], pk = sol.pk[t], sp = sol.sp[t], un = sol.un[t];
      maxBal = Math.max(maxBal, Math.abs(x.nuclear + x.wind + x.solar + cc + pk + un - sp - x.demand));
      [[cc, 0, f.cc.mw], [pk, 0, f.peaker.mw], [sp, 0, x.wind + x.solar], [un, 0, Infinity]].forEach(function (b) { if (b[0] < b[1] - 1e-6 || b[0] > b[2] + 1e-6) lim++; });
      maxRamp = Math.max(maxRamp, Math.abs(cc - (t ? sol.cc[t - 1] : W.startCC)));
      supply += x.nuclear + x.wind + x.solar + cc + pk + un; spill += sp; demand += x.demand;
      cost += f.cc.cost * cc + s.pkCost * pk;
    });
    var obj = sol.objective - (sol.penalty || 0);
    return [
      { id: "balance", ok: maxBal < 1e-6, value: maxBal, title: "Balance every hour", text: "largest gap between supply and demand: " + maxBal.toFixed(3) + " MW" },
      { id: "limits", ok: lim === 0, value: lim, title: "Plants within their limits", text: lim + " of " + (HOURS * 4) + " decisions outside their limits" },
      { id: "ramps", ok: maxRamp <= s.ramp + 1e-6, value: maxRamp, title: "Ramps within " + s.ramp + " MW an hour", text: "largest hour-to-hour change: " + (Math.round(maxRamp * 10) / 10) + " MW" },
      { id: "totals", ok: Math.abs(supply - spill - demand) < 1e-4 && Math.abs(cost - obj) < 1e-3, value: supply - spill - demand, cost: cost,
        title: "Energy and money add up", text: "supply minus spill " + Math.round(supply - spill).toLocaleString("en-US") + " MWh against demand " + Math.round(demand).toLocaleString("en-US") +
          " MWh; cost from MWh × $/MWh " + "$" + Math.round(cost).toLocaleString("en-US") + " against the solver's " + "$" + Math.round(obj).toLocaleString("en-US") }
    ];
  }
  // why the demand rule's shadow price at hour t is what it is (LP results only). fd (optional): {up, down}, the cost
  // of one more MWh and the saving from one less, from two re-solves; when they differ the shadow price is not unique
  // (a degenerate optimum) and the solver reports one value between them.
  function why(W, s, sol, t, fd) {
    var w = why0(W, s, sol, t), y = sol.duals[t];
    if (fd && (Math.abs(fd.up - y) > 0.01 || Math.abs(fd.down - y) > 0.01)) {
      w.degenerate = true;
      w.text += " Up and down differ here: one more MWh costs $" + Math.round(fd.up) + ", one less saves $" + Math.round(fd.down) + "; the solver reports one value in between.";
    }
    return w;
  }
  function why0(W, s, sol, t) {
    var f = W.fleet, y = sol.duals[t], hh = (t < 10 ? "0" : "") + t + ":00", nb = function (k) { return (k < 10 ? "0" : "") + k + ":00"; };
    var near = function (a, b) { return Math.abs(a - b) < 0.01; };
    var money = function (v) { return "$" + (Math.round(v * 100) / 100).toLocaleString("en-US"); };
    if (sol.un[t] > 1e-6) return { kind: "short", text: hh + ": " + money(y) + ". Demand is not fully met, so one more MWh costs the unserved penalty." };
    if (near(y, f.cc.cost) && sol.cc[t] > 1e-6 && sol.cc[t] < f.cc.mw - 1e-6) return { kind: "marginal", text: hh + ": " + money(y) + ". The combined-cycle is the marginal plant: one more MWh comes from it at $" + f.cc.cost + "." };
    if (near(y, s.pkCost) && sol.pk[t] > 1e-6) return { kind: "marginal", text: hh + ": " + money(y) + ". The peaker is the marginal plant: one more MWh comes from it at $" + s.pkCost + "." };
    if (near(y, 0) && sol.sp[t] > 1e-6) return { kind: "ramp", text: hh + ": $0. The solver spills " + Math.round(sol.sp[t]) + " MW of sun here because a ramp rule holds the combined-cycle above this hour's need. One more MWh is served by spilling less: free." };
    // a ramp rule links t to a neighbour: which one, and is the extra spilled there?
    var link = null;
    if (t > 0 && near(sol.cc[t] - sol.cc[t - 1], s.ramp)) link = t - 1;
    else if (t < HOURS - 1 && near(sol.cc[t] - sol.cc[t + 1], s.ramp)) link = t + 1;
    if (link !== null && y > f.cc.cost && near(y, 2 * f.cc.cost) && sol.sp[link] > 1e-6)
      return { kind: "ramp", link: link, text: hh + ": " + money(y) + ". A ramp rule ties " + hh + " to " + nb(link) + ", where the difference is spilled: $" + f.cc.cost + " + $" + f.cc.cost + "." };
    if (link !== null) return { kind: "ramp", link: link, text: hh + ": " + money(y) + ". A ramp rule ties " + hh + " to " + nb(link) + ", so one more MWh here changes the plan in both hours: " + money(y) + " in all." };
    return { kind: "other", text: hh + ": " + money(y) + ". The rules that bind around " + hh + " together set the cost of one more MWh." };
  }
  var model = { HOURS: HOURS, dayOf: dayOf, DEFAULTS: DEFAULTS, settings: settings, hours: hours, buildLP: buildLP, parse: parse, evalPlan: evalPlan, checks: checks, why: why };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX || !window.LX.H) return;

  // ================================================================ the page
  var LX = window.LX, H = LX.H, S = LX.S;
  var CSS = [
    ".w11-prices{display:grid;grid-template-columns:repeat(24,minmax(0,1fr));gap:3px}",
    "@media(max-width:700px){.w11-prices{grid-template-columns:repeat(12,minmax(0,1fr))}}",
    ".w11-p{display:grid;gap:1px;justify-items:center;padding:4px 0;border-radius:8px;border:1px solid var(--lx-line);background:var(--lx-surface);color:var(--lx-ink);cursor:pointer;min-width:0;font:inherit}",
    ".w11-p small{font-family:var(--lx-f-mono);font-size:10.5px;color:var(--lx-ink-3)}",
    ".w11-p b{font-family:var(--lx-f-mono);font-size:12px;font-weight:600;font-variant-numeric:tabular-nums}",
    ".w11-p.odd{border-color:var(--lx-warn);background:var(--lx-warn-soft)}.w11-p.pk b{color:var(--lx-pk)}",
    ".w11-p[aria-pressed=true]{box-shadow:inset 0 0 0 2px var(--lx-accent)}",
    ".w11-p.na{cursor:default;opacity:.5}",
    ".w11-checks{display:grid;gap:6px;margin:0;padding:0;list-style:none}",
    ".w11-checks li{display:grid;grid-template-columns:22px minmax(0,1fr);gap:8px;align-items:start;padding:8px 10px;border-radius:10px;background:var(--lx-surface-2);font-size:14.5px}",
    ".w11-checks li .lx-ic{width:20px;height:20px;color:var(--lx-ink-3)}.w11-checks li.ok .lx-ic{color:var(--lx-good)}.w11-checks li.no{background:var(--lx-bad-soft)}.w11-checks li.no .lx-ic{color:var(--lx-bad)}",
    ".w11-checks b{font-family:var(--lx-f-display);font-weight:500}.w11-checks span{display:block;font-size:13.5px;color:var(--lx-ink-2);font-family:var(--lx-f-mono)}",
    ".w11-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}",
    ".w11-pricehead{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:baseline}",
    ".w11-pricehead p{font-size:13.5px;color:var(--lx-ink-3);margin:0}"
  ].join("\n");

  function view(live, data, root) {
    var W1F = window.W1F; W1F.css();
    if (!document.getElementById("w11-css")) H("style", { id: "w11-css", text: CSS }, document.head);
    var town = data.town, D = data["11_solver"], W = dayOf(town, data.town_year), f = town.fleet, V = D.penalty;
    var usd = W1F.usd, fmt1 = W1F.fmt1, hh = LX.fmt.hh, saw = W1F.saw;
    var set = settings(), cur = null, base = null, shown = null, editPlan = null, hook = null, pricePick = null, solving = 0;

    // ---------- stage
    var stage = H("div", { class: "w1f-stage" }, live);
    var head = H("div", { class: "w1f-head" }, stage);
    H("h3", { text: W.dateLabel + ": lesson 0's day as one linear program" }, head);
    var st = LX.SolverStatus(head);
    var chips = H("div", { class: "w1f-chips", "aria-live": "polite" }, stage);
    var chartHost = H("div", null, stage);
    var SER = [{ key: "nuclear", label: "Nuclear", color: "var(--lx-nuc)" }, { key: "wind", label: "Wind", color: "var(--lx-wind)" }, { key: "solar", label: "Solar", color: "var(--lx-solar)" },
      { key: "cc", label: "Gas combined-cycle", color: "var(--lx-cc)" }, { key: "pk", label: "Gas peaker", color: "var(--lx-pk)" }];
    var chartRows = [], chartDemand = W.demand.slice();
    var chart = LX.DayChart(chartHost, { series: SER, demand: chartDemand, rows: function () { return chartRows; }, yMax: 400, label: "Hourly output by plant for lesson 0's day, with demand as a dashed line." });
    var priceBox = H("div", { hidden: true, style: "display:grid;gap:6px" }, stage);
    var ph = H("div", { class: "w11-pricehead" }, priceBox);
    H("h3", { text: "Shadow price of the demand rule, $/MWh", style: "font-size:15px;margin:0" }, ph);
    var pnote = H("p", { text: "Tap an hour." }, ph);
    var prices = H("div", { class: "w11-prices", role: "group", "aria-label": "Shadow price of the demand rule for each hour" }, priceBox);
    var pout = H("p", { class: "w1f-status", "aria-live": "polite" }, priceBox);

    function chip(label, value, cls) { var c = H("div", { class: "w1f-chip" + (cls ? " " + cls : "") }, chips); H("span", { text: label }, c); H("b", { text: value }, c); }
    function rowsOf(sol, s) {
      var hs = hours(W, s);
      return hs.map(function (x, t) {
        var sp = sol ? sol.sp[t] : 0, vr = x.wind + x.solar, cut = s.signError ? 0 : sp, ws = vr > 0 ? cut * x.wind / vr : 0;
        return sol ? { nuclear: x.nuclear, wind: x.wind - ws, solar: x.solar - (cut - ws), cc: sol.cc[t], pk: sol.pk[t], unserved: sol.un[t] }
                   : { nuclear: x.nuclear, wind: x.wind, solar: x.solar, cc: 0, pk: 0, unserved: Math.max(0, x.need) };
      });
    }
    function show(sol, s, label) {
      shown = sol; chartRows = rowsOf(sol, s);
      var hs = hours(W, s); hs.forEach(function (x, t) { chartDemand[t] = x.demand; });
      if (LX.visible(chartHost)) chart.render();
      chips.innerHTML = "";
      if (!sol) { chip("Gas to schedule", Math.round(hs.reduce(function (a, x) { return a + Math.max(0, x.need); }, 0)).toLocaleString("en-US") + " MWh"); chip("Decisions", "96"); chip("Rules", "72 + limits"); return; }
      chip(label || "Running cost", usd(sol.totals.cost), "good");
      chip("Peaker", fmt1(sol.totals.pk) + " MWh");
      chip("Spilled sun", fmt1(sol.totals.sp) + " MWh");
      if (sol.totals.un > 1e-6) chip("Unserved", fmt1(sol.totals.un) + " MWh", "bad");
      if (sol.kind === "edit") st.el.textContent = "Your edit: evaluated by hand, not solved.";
      else if (sol.status && !sol.precomputed) st.set({ status: sol.status, ms: sol.ms });
      paintPrices();
    }
    function paintPrices() {
      prices.innerHTML = "";
      var sol = shown;
      if (!sol || !sol.duals) { pnote.textContent = sol && sol.kind === "milp" ? "None: a mixed-integer program has no shadow prices." : ""; }
      else pnote.textContent = "Tap an hour.";
      for (var t = 0; t < HOURS; t++) (function (t) {
        var y = sol && sol.duals ? sol.duals[t] : null, odd = y != null && Math.abs(y - f.cc.cost) > 0.01;
        var b = H("button", { type: "button", class: "w11-p" + (y == null ? " na" : odd ? " odd" : "") + (y != null && sol.pk[t] > 1e-6 ? " pk" : ""), "aria-pressed": pricePick === t ? "true" : "false" }, prices);
        H("small", { text: (t < 10 ? "0" : "") + t }, b); H("b", { text: y == null ? "–" : String(Math.round(y)) }, b);
        b.setAttribute("aria-label", hh(t) + ": " + (y == null ? "no shadow price" : "$" + Math.round(y) + " per MWh"));
        if (y == null) b.disabled = true;
        b.addEventListener("click", function () {
          pricePick = t; paintPrices(); var w = why(W, set, sol, t); pout.textContent = w.text;
          fdAt(t, sol).then(function (fd) { if (pricePick !== t) return; if (fd) { w = why(W, set, sol, t, fd); pout.textContent = w.text; } if (hook) hook({ price: t, why: w }); });
        });
      })(t);
    }
    // one MWh more and one MWh less at hour t, re-solved: the two one-sided prices (cached per settings)
    var fdCache = {};
    function fdAt(t, sol) {
      if (!sol || !sol.duals || sol.precomputed) return Promise.resolve(null);
      var key = JSON.stringify(set) + "|" + t; if (fdCache[key]) return Promise.resolve(fdCache[key]);
      var s0 = set, mk = function (v) { var a = {}; a[t] = v; var x = settings(s0); x.add = a; return x; }, c0 = sol.totals.cost + (sol.penalty || 0);
      return Promise.all([solve(mk(1), { key: "fd-up", quiet: true }), solve(mk(-1), { key: "fd-down", quiet: true })]).then(function (rs) {
        if (!rs[0] || !rs[1]) return null;
        var o = { up: rs[0].totals.cost + rs[0].penalty - c0, down: c0 - (rs[1].totals.cost + rs[1].penalty) }; fdCache[key] = o; return o;
      });
    }
    // solve with HiGHS; falls back to the precomputed answer for the day as given
    function solve(s, opts) {
      opts = opts || {}; solving++; if (!opts.quiet) st.set(LX.solver.mode ? "solving" : "loading");
      return LX.solver.solve(buildLP(W, s, V), { timeLimit: 5, key: opts.key || "w11", label: "w11" }).then(function (r) {
        solving--;
        if (r.status === "superseded" || r.status === "cancelled") return null;
        if (!opts.quiet) st.set(r);
        var sol = parse(W, s, r, V);
        if (sol) sol.penalty = V * sol.totals.un;
        if (!sol && r.status === "error" && isBase(s)) { sol = pre(); st.el.textContent = "The solver could not load here; showing a precomputed answer for the day as given."; }
        return sol;
      });
    }
    function isBase(s) { var b = settings(); return Object.keys(b).every(function (k) { return JSON.stringify(b[k]) === JSON.stringify(s[k]); }); }
    function pre() {
      var P = D.precomputed, o = { status: "optimal", kind: "lp", objective: P.cost, cc: P.cc, pk: P.pk, sp: P.sp, un: P.cc.map(function () { return 0; }), duals: P.duals, precomputed: true, penalty: 0 };
      var sum = function (a) { return a.reduce(function (x, y) { return x + y; }, 0); };
      o.totals = { cc: sum(o.cc), pk: sum(o.pk), sp: sum(o.sp), un: 0, cost: P.cost, co2: f.cc.co2 * sum(o.cc) + f.peaker.co2 * sum(o.pk) };
      return o;
    }
    function solveBase() { return base ? Promise.resolve(base) : solve(settings()).then(function (s) { base = s; return s; }); }
    function checksUI(host) {
      var ul = H("ul", { class: "w11-checks" }, host);
      return function (sol, s) {
        ul.innerHTML = "";
        var cs = checks(W, s, sol);
        cs.forEach(function (c) { var li = H("li", { class: c.ok ? "ok" : "no" }, ul); li.innerHTML = LX.icon(c.ok ? "check" : "cross"); var d = H("div", null, li); H("b", { text: c.title + (c.ok ? ": passed" : ": FAILED") }, d); H("span", { text: c.text }, d); });
        return cs;
      };
    }
    // a W1F slider wrapper
    function ctl(host, o) { return W1F.Ctl(host, o); }

    // ---------- step cards
    var steps = [
      { text: "Lesson 0's day as a [[linear-program|linear program]]: for each hour, two gas outputs, spilled sun and unserved demand. That is 96 decisions and 72 rules. Press Solve to hand it to HiGHS, a [[solver|solver]] running in your browser.",
        build: function (act, api) {
          hook = null; pricePick = null;
          set = settings(); priceBox.hidden = true; show(base, set);
          if (!base) show(null, set);
          var b = H("button", { type: "button", class: "lx-btn small", html: LX.icon("play") + "Solve" }, act);
          b.addEventListener("click", function () {
            b.disabled = true;
            solveBase().then(function (sol) {
              b.disabled = false; if (!sol) return;
              show(sol, set); api.done();
              saw(api, "**Optimal**: " + usd(sol.totals.cost) + " for the day, " + usd(D.rule.cost - sol.totals.cost) + " below lesson 0's cheapest-first rule. The solver warms the combined-cycle early, spilling " + fmt1(sol.totals.sp) + " MWh of sun, and never needs the peaker.");
            });
          });
          if (base) { api.done(); }
        } },
      { text: "Try to beat it. Pick an hour and move the combined-cycle up or down; the peaker and spilled sun follow, so every hour still balances. Can you find a cheaper day?",
        build: function (act, api) {
          hook = null; pricePick = null;
          set = settings(); priceBox.hidden = true;
          solveBase().then(function (sol) {
            if (!sol) return;
            editPlan = sol.cc.map(function (v) { return Math.round(v); });
            var moves = 0, hour = D.editHour;
            var hc = ctl(act, { label: "Hour", color: "var(--lx-ink-3)", min: 0, max: 23, step: 1, value: hour, fmt: hh, onChange: function (v) { hour = v; cc.set(editPlan[hour]); } });
            var cc = ctl(act, { label: "Combined-cycle at this hour", color: "var(--lx-cc)", min: 0, max: f.cc.mw, step: 5, value: editPlan[hour], fmt: function (v) { return v + " MW"; },
              onChange: function (v) { editPlan[hour] = v; moves++; paintEdit(); } });
            var rs = H("button", { type: "button", class: "lx-btn ghost small", text: "Back to the solver's plan" }, act);
            rs.addEventListener("click", function () { editPlan = sol.cc.map(function (v) { return Math.round(v); }); cc.set(editPlan[hour]); paintEdit(); });
            function paintEdit() {
              var e = evalPlan(W, set, editPlan), d = e.cost - sol.totals.cost;
              var fake = { cc: e.cc, pk: e.pk, sp: e.sp, un: e.un, totals: { cost: e.cost, pk: e.pk.reduce(function (a, b) { return a + b; }, 0), sp: e.sp.reduce(function (a, b) { return a + b; }, 0), un: 0 }, duals: null, kind: "edit" };
              show(fake, set, "Your day");
              chip("Against the solver", (d >= 0 ? "+" : "−") + usd(Math.abs(d)).replace("−", ""), d < -1e-6 && e.ok ? "good" : d > 1e-6 ? "warn" : "");
              chip("Ramp rule", e.rampBreaks.length ? "broken at " + e.rampBreaks.map(hh).join(", ") : "kept", e.rampBreaks.length ? "bad" : "good");
              if (moves >= 3) api.done();
              if (!moves) return;
              var b0 = e.rampBreaks[0];
              if (e.rampBreaks.length) saw(api, (d < 0 ? "Cheaper by " + usd(-d) + ", but " : "") + "the ramp rule breaks: the combined-cycle would change by more than " + set.ramp + " MW between " + (b0 ? hh(b0 - 1) : "the start") + " and " + hh(b0) + ".", true);
              else if (d > 1e-6) saw(api, "Every rule holds, but the day costs " + usd(d) + " more. " + (moves >= 3 ? "In a linear program a plan that no small change can improve is the best plan overall." : "Try another hour."));
              else saw(api, "Same cost as the solver: a tie, not a win.");
            }
            paintEdit();
          });
        } },
      { text: "A solver answers the model you wrote, not the world. Check its answer as a modeler would: are the rules met, and do the energy and the money add up?",
        build: function (act, api) {
          hook = null; pricePick = null;
          set = settings(); priceBox.hidden = true;
          var b = H("button", { type: "button", class: "lx-btn small", html: LX.icon("check") + "Run the four checks" }, act);
          var run = checksUI(act);
          solveBase().then(function (sol) { if (sol) show(sol, set); });
          b.addEventListener("click", function () {
            solveBase().then(function (sol) {
              if (!sol) return;
              var cs = run(sol, set); api.done();
              saw(api, cs.every(function (c) { return c.ok; }) ? "All four pass: the balance holds to the last MW, ramps peak at exactly " + set.ramp + " MW, and " + usd(cs[3].cost) + " recomputed by hand matches the solver." : "A check failed.", !cs.every(function (c) { return c.ok; }));
            });
          });
        } },
      { text: "Why check at all? Plant a sign error: spilled sun now adds to supply instead of taking away. Re-solve, then run the checks again.",
        build: function (act, api) {
          hook = null; pricePick = null;
          set = settings({ signError: false }); priceBox.hidden = true;
          var row = H("div", { class: "w11-row" }, act);
          var bErr = H("button", { type: "button", class: "lx-btn small", text: "Plant the error and re-solve" }, row);
          var bRun = H("button", { type: "button", class: "lx-btn ghost small", html: LX.icon("check") + "Run the checks" }, row);
          var run = checksUI(act), bad = null;
          solveBase().then(function (sol) { if (sol) show(sol, set); });
          bErr.addEventListener("click", function () {
            set = settings({ signError: true }); bErr.disabled = true;
            solve(set).then(function (sol) {
              if (!sol) return; bad = sol; show(sol, set, "Running cost reported");
              saw(api, "The solver says **optimal** at " + usd(sol.objective) + ", about half of " + usd(base.totals.cost) + ". A better plan, or a broken model? Run the checks.");
            });
          });
          bRun.addEventListener("click", function () {
            var sol = bad || base; if (!sol) return;
            var cs = run(sol, set);
            if (bad) { api.done(); saw(api, "Caught. The balance check fails by up to " + fmt1(cs[0].value) + " MW in an hour, and the model conjures " + Math.round(-cs[3].value).toLocaleString("en-US") + " MWh that no plant made. The solver was right about the wrong model.", true); }
            else saw(api, "These are the checks on the correct model: all pass. Now plant the error.");
          });
        } },
      { text: "Predict, then test: add 1 MWh of demand at 03:00. By how much does the best cost rise?",
        build: function (act, api) {
          hook = null; pricePick = null;
          set = settings(); priceBox.hidden = true;
          solveBase().then(function (sol) { if (sol) show(sol, set); });
          var pr = LX.Predict(act, { id: "w11-dual", q: "", title: false, options: [{ value: "0", label: "$0" }, { value: "10", label: "$10" }, { value: "40", label: "$40" }, { value: "100", label: "$100" }],
            answer: String(D.probe.answer), feedback: { "40": "One more MWh at 03:00 comes from the combined-cycle, the [[marginal-cost|marginal]] plant, at $40.", "0": "Nothing is spare at 03:00: the gas plant must make it.", "10": "The nuclear plant already runs flat; it cannot make more.", "100": "The peaker is off and not needed: the cheaper combined-cycle has room." },
            fresh: true, onPick: function () { go.disabled = false; } });
          var go = H("button", { type: "button", class: "lx-btn small", text: "Re-solve with one more MWh at 03:00" }, act); go.disabled = true;
          go.addEventListener("click", function () {
            go.disabled = true; var add = {}; add[D.probe.hour] = 1;
            Promise.all([solveBase(), solve(settings({ add: add }), { key: "probe" })]).then(function (rs) {
              var a = rs[0], b = rs[1]; if (!a || !b) return;
              var dlt = b.totals.cost + b.penalty - (a.totals.cost + a.penalty), y = a.duals ? a.duals[D.probe.hour] : null;
              pr.reveal("The cost rose by **" + usd(dlt) + "**. The solver had already reported this number: the [[shadow-price|shadow price]] of the demand rule at 03:00 is " + usd(y) + "/MWh.");
              var r = act.querySelector(".lx-predict-out .lx-saw div"); if (r) r.innerHTML = r.innerHTML.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
              priceBox.hidden = false; show(a, set); api.done();
            });
          });
        } },
      { text: "Every hour has a shadow price. Most are $40, the combined-cycle's cost. Some are not. Tap a highlighted hour to see which rule bends its price.",
        build: function (act, api) {
          hook = null; pricePick = null;
          set = settings(); priceBox.hidden = false; pricePick = null; pout.textContent = "";
          solveBase().then(function (sol) { if (sol) show(sol, set); });
          hook = function (e) {
            if (e.why.kind === "ramp") { api.done(); saw(api, "A ramp rule bends this price. A shadow price is the cost of one more MWh, wherever in the plan it has to come from."); }
            else saw(api, "That hour's price is set by one plant. Now tap a highlighted hour.");
          };
          H("p", { class: "lx-hint", text: "The prices are under the chart." }, act);
        } },
      { text: "Now play ([[sensitivity-analysis|sensitivity analysis]]): each slider re-solves at once. Lower the peaker's cost until the solver starts to use it. At what cost, and why that number?",
        build: function (act, api) {
          hook = null; pricePick = null;
          set = settings(); priceBox.hidden = false; hook = null;
          var g = H("div", { class: "w1f-ctls" }, act), R = D.ranges;
          var go = function () { solve(set, { key: "sens" }).then(function (sol) { if (!sol) return; show(sol, set); say(sol); }); };
          ctl(g, { label: "Peaker running cost", color: "var(--lx-pk)", min: R.pkCost[0], max: R.pkCost[1], step: 5, value: set.pkCost, fmt: function (v) { return "$" + v + "/MWh"; }, onChange: function (v) { set.pkCost = v; go(); } });
          ctl(g, { label: "Combined-cycle ramp limit", color: "var(--lx-cc)", min: R.ramp[0], max: R.ramp[1], step: 5, value: set.ramp, fmt: function (v) { return v + " MW/h"; }, onChange: function (v) { set.ramp = v; go(); } });
          ctl(g, { label: "Demand, every hour", color: "var(--lx-ink)", min: R.demandPct[0], max: R.demandPct[1], step: 5, value: set.demandPct, fmt: function (v) { return (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v) + "%"; }, onChange: function (v) { set.demandPct = v; go(); } });
          ctl(g, { label: "Wind farm size", color: "var(--lx-wind)", min: R.windMW[0], max: R.windMW[1], step: 25, value: set.windMW, fmt: function (v) { return v + " MW"; }, onChange: function (v) { set.windMW = v; go(); } });
          function say(sol) {
            if (sol.totals.pk > 1e-6) {
              api.done();
              var only = set.ramp === DEFAULTS.ramp && set.demandPct === 0 && set.windMW === DEFAULTS.windMW;
              saw(api, "The peaker runs " + fmt1(sol.totals.pk) + " MWh." + (only ? " It starts below **$" + D.threshold + "/MWh**, the shadow price of the ramp hours: until then, spilling sun to keep the combined-cycle warm costs less." : " Other rules changed too; try the peaker's cost alone, with the rest as given."));
            } else saw(api, "Still no peaker: " + usd(sol.totals.cost) + " for the day.");
          }
          solveBase().then(function (sol) { if (sol) show(sol, set); });
        } },
      { text: "Real peakers have a minimum output: off, or on at " + DEFAULTS.pkMin + " MW or more. That on-or-off choice makes a [[mixed-integer-program|mixed-integer program]]. Compare it with the linear program at a " + D.milpRamp + " MW/h ramp.",
        build: function (act, api) {
          hook = null; pricePick = null;
          set = settings({ ramp: D.milpRamp }); priceBox.hidden = false; hook = null;
          var row = H("div", { class: "w11-row" }, act), lpSol = null;
          var bLP = H("button", { type: "button", class: "lx-btn ghost small", text: "Linear program" }, row);
          var bMI = H("button", { type: "button", class: "lx-btn small", text: "On-or-off peaker" }, row);
          function run(on) {
            set = settings({ ramp: D.milpRamp, onoff: on }); bLP.setAttribute("aria-pressed", on ? "false" : "true"); bMI.setAttribute("aria-pressed", on ? "true" : "false");
            solve(set, { key: "milp" }).then(function (sol) {
              if (!sol) return; show(sol, set);
              if (!on) { lpSol = sol; saw(api, "As a linear program: " + usd(sol.totals.cost) + ", the peaker runs " + fmt1(sol.totals.pk) + " MWh, and every hour has a price. Now make the peaker on-or-off."); return; }
              api.done();
              chip("Optimality gap", ((sol.mipGap || 0) * 100).toFixed(2) + "%");
              saw(api, "Optimal at " + usd(sol.totals.cost) + (lpSol ? " (" + usd(sol.totals.cost - lpSol.totals.cost) + " more than the linear program)" : "") + ": the peaker " + (sol.totals.pk > 1e-6 ? "runs " + fmt1(sol.totals.pk) + " MWh" : "stays off and more sun is spilled") + ". **No shadow prices**: with an on-or-off choice the cost no longer changes smoothly with demand (Go deeper, below).");
            });
          }
          bLP.addEventListener("click", function () { run(false); });
          bMI.addEventListener("click", function () { run(true); });
          run(false);
        } }
    ];
    var cards = LX.StepCards(live, { steps: steps });
    root.lxDemo = function (state) {
      if (state === "mid") { cards.go(0); var b = live.querySelector(".lx-step-act .lx-btn"); if (b) b.click(); return { view: "solved" }; }
      if (state === "prices") { cards.go(5); setTimeout(function () { var o = live.querySelector(".w11-p.odd"); if (o) o.click(); }, 400); return { view: "prices" }; }
      if (state === "error") { cards.go(3); var e = live.querySelectorAll(".lx-step-act .lx-btn"); if (e[0]) e[0].click(); setTimeout(function () { if (e[1]) e[1].click(); }, 600); return { view: "sign error" }; }
      if (state === "milp") { cards.go(7); setTimeout(function () { var m = live.querySelectorAll(".lx-step-act .lx-btn"); if (m[1]) m[1].click(); }, 500); return { view: "milp" }; }
      return null;
    };
    root.lxLesson = { model: model, W: W, solve: solve, settings: function () { return set; }, cards: cards };
    LX.solver.preload();
    buildExplain(town, W, D, data["10_write_it_down"], data.town_year);
  }

  // ---------------------------------------------------------------- the explain layer
  function buildExplain(town, W, D, D10, year) {
    var W1F = window.W1F, usd = W1F.usd, fmt1 = W1F.fmt1, f = town.fleet;
    var host = document.getElementById("w11-explain");
    if (host) {
      host.innerHTML = ""; host.classList.add("is-live");
      var P = D.precomputed, sym = function (id, html) { return '<button class="s" data-s="' + id + '">' + html + "</button>"; };
      W1F.EquationCard(H("div", { class: "lx-xcard" }, host), {
        title: "The price, as an equation",
        lede: "Tap a symbol. Each one links what the solver returns to what it means.",
        lines: [
          sym("lam", "λ(<var>t</var>)") + " = " + sym("dC", "Δ<var>C</var>*") + " / " + sym("dd", "Δ<var>d</var>(<var>t</var>)") + '<span class="tag">shadow price of the demand rule</span>',
          sym("C", "<var>C</var>*") + " = min Σ<sub><var>t</var></sub> ( 40 <var>p</var><sub>cc</sub>(<var>t</var>) + " + f.peaker.cost + " <var>p</var><sub>pk</sub>(<var>t</var>) + <var>V</var> <var>u</var>(<var>t</var>) ) + 24,000" + '<span class="tag">best running cost</span>',
          "λ(19) = " + sym("c", "$" + f.cc.cost + "/MWh") + " = " + sym("cc", "<var>c</var><sub>cc</sub>") + '<span class="tag">no ramp rule binds at 19:00</span>'
        ],
        symbols: {
          lam: { name: "λ(t)", label: "lambda of t", words: "The [[shadow-price|shadow price]] of hour t's demand rule: how much the best cost rises per extra MWh of demand in that hour, in $/MWh. HiGHS returns it with the answer, for every rule.", code: 'r.duals["balance_19"]   // ' + P.duals[19] },
          dC: { name: "ΔC*", label: "change in best cost", words: "The change in the best total cost when demand changes, with every decision free to adjust.", code: "probe.objective - r.objective   // re-solve with d(t) + 1" },
          dd: { name: "Δd(t)", label: "change in demand at t", words: "One more MWh of demand in hour t, nothing else changed.", code: "eq: need[t] + 1   // the balance row's right-hand side" },
          C: { name: "C*", label: "C star, the best cost", words: "The lowest running cost that meets every rule: " + usd(P.cost) + " for lesson 0's day. The 24,000 is the nuclear plant's flat 100 MW at $10/MWh.", code: "r.objective   // " + P.cost },
          c: { name: "$" + f.cc.cost + "/MWh", label: f.cc.cost + " dollars per MWh", words: "The answer the solver gives at 19:00.", code: "r.duals[\"balance_19\"] === 40" },
          cc: { name: "c_cc", label: "c cc, the combined-cycle cost", words: "The combined-cycle's running cost. Where no ramp rule binds it is the marginal plant, so the price equals its cost: the merit-order price of lesson 8, now read from a solver.", code: '{ name: "cc_19", ub: 150, cost: 40 }' }
        },
        sel: "lam"
      });
      LX.Flowchart(H("div", { class: "lx-xcard" }, host), {
        title: "From a solver's answer to an answer you can trust",
        lede: "The same few questions after every run.",
        nodes: {
          start: { t: "Solve", k: "end" },
          q1: { t: "Status optimal?", tN: ["Status", "optimal?"], k: "q" },
          st: { t: "Read the status", s: "a rule clashes or is missing", sN: "fix the rules", k: "end" },
          q2: { t: "Rules met in the world?", tN: ["Rules met", "in the world?"], k: "q" },
          bug: { t: "Find the bug", s: "in the model or the data", sN: "model or data", k: "end" },
          q3: { t: "Linear program?", tN: ["Linear", "program?"], k: "q" },
          lp: { t: "Read shadow prices", s: "marginal values, as modelled", sN: "as modelled", k: "end" },
          mi: { t: "No shadow prices", s: "fix on/off, re-price (M2)", sN: "see lesson M2", k: "end" }
        },
        cols: 3, at: { start: [1, 0], q1: [1, 1], st: [2, 1.9], q2: [1, 2.4], bug: [2, 3.3], q3: [1, 3.8], lp: [0.15, 4.8], mi: [1.85, 4.8] },
        colsN: 2, atN: { start: [0, 0], q1: [0, 1], st: [1, 1.9], q2: [0, 2.4], bug: [1, 3.3], q3: [0, 3.8], lp: [0, 5.1], mi: [1, 5.1] },
        edges: [["start", "q1"], ["q1", "st", "no"], ["q1", "q2", "yes"], ["q2", "bug", "no"], ["q2", "q3", "yes"], ["q3", "lp", "yes"], ["q3", "mi", "no"]],
        traces: [
          { label: "The day as given", path: ["start", "q1", "q2", "q3", "lp"], text: "Optimal, every check passes, and the price at 19:00 is $40/MWh." },
          { label: "The sign error", path: ["start", "q1", "q2", "bug"], text: "Optimal at " + usd(D.signError.cost) + ", yet the balance check fails: the model, not the plan, is wrong." },
          { label: "On-or-off peaker", path: ["start", "q1", "q2", "q3", "mi"], text: "Optimal, checks pass, but a mixed-integer program reports no shadow prices." }
        ],
        sel: 0
      });
      var R = D.rule;
      var rows = [
        { key: "rule", color: "var(--lx-ink-3)", name: "Cheapest-first rule", note: "lesson 0, hour by hour", cost: { text: usd(R.cost), value: R.cost }, pk: R.pk + " MWh", sp: fmt1(R.sp) + " MWh", co2: fmt1(R.co2) + " t" },
        { key: "lp", color: "var(--lx-good)", name: "The solver", note: "all 24 hours at once", cost: { text: usd(P.cost), value: P.cost }, pk: fmt1(P.pk.reduce(function (a, b) { return a + b; }, 0)) + " MWh", sp: fmt1(P.sp.reduce(function (a, b) { return a + b; }, 0)) + " MWh", co2: fmt1(f.cc.co2 * P.cc.reduce(function (a, b) { return a + b; }, 0)) + " t" },
        { key: "bad", color: "var(--lx-bad)", name: "The sign-error model", note: "optimal, but fails the checks", cost: { text: usd(D.signError.cost), value: D.signError.cost }, pk: "–", sp: "–", co2: "–" }
      ];
      LX.CompareTable(H("div", { class: "lx-xcard" }, host), {
        title: "Lesson 0's rule against the solver",
        columns: [{ key: "name", label: "Plan", main: true }, { key: "cost", label: "Running cost", num: true, bar: { max: 110000 } }, { key: "pk", label: "Peaker", num: true },
          { key: "sp", label: "Spilled sun", num: true, phoneHide: true }, { key: "co2", label: "CO₂", num: true }],
        rows: rows,
        sorts: [{ label: "As listed", order: ["rule", "lp", "bad"], note: "The solver saves " + usd(R.cost - P.cost) + " but emits " + fmt1(f.cc.co2 * P.cc.reduce(function (a, b) { return a + b; }, 0) - R.co2) + " t more CO₂: it burns gas early and spills sun to dodge the peaker. Cheaper is not cleaner (lesson 12)." },
                { label: "By cost", order: ["bad", "lp", "rule"], ranked: true, note: "The cheapest answer is the wrong one: always run the checks." }]
      });
    }
    // peek inside the solver: simplex on lesson 10's polygon
    var pk = document.getElementById("w11-peek");
    if (pk && D10) {
      pk.innerHTML = "";
      var lp2 = W1F.lp2, day = lp2.dayOf(town, year), p = lp2.params(town, day, D10), sol = lp2.solve2(p), walk = lp2.simplexWalk(p), at = 0, timer = null;
      var plot = W1F.LPPlot(pk, { view: D10.view, xLabel: "Combined-cycle x (MW)", yLabel: "Peaker y (MW)", describe: function () {
        return "Lesson 10's hour: the simplex method visits " + walk.length + " corners: " + walk.map(function (v) { return "(" + fmt1(v.x) + ", " + fmt1(v.y) + ") at " + usd(v.cost); }).join(", then ") + ". The last is the best plan."; } });
      var row = H("div", { class: "w1f-walk" }, pk);
      var bS = H("button", { type: "button", class: "lx-btn small", text: "Next corner" }, row);
      var bP = H("button", { type: "button", class: "lx-btn ghost small", html: LX.icon("play") + "Play" }, row);
      var bR = H("button", { type: "button", class: "lx-btn ghost small", text: "Start again" }, row);
      var out = H("p", { class: "w1f-walk-out", "aria-live": "polite" }, pk);
      var NAME = { demand: "the demand line", cc: "the combined-cycle size line", pk: "the peaker size line", co2: "the CO₂ cap line", x0: "the y-axis", y0: "the x-axis" };
      function paint() {
        plot.render({ p: p, sol: sol, walk: walk, walkAt: at, showBest: at === walk.length - 1 });
        var v = walk[at];
        out.textContent = "Corner " + (at + 1) + " of " + walk.length + ": x = " + fmt1(v.x) + ", y = " + fmt1(v.y) + ", " + usd(v.cost) + ". " +
          (at === 0 ? "Start at a corner (here the most expensive)." : "Moved along " + NAME[v.along] + " to a cheaper neighbour. ") +
          (at === walk.length - 1 ? "No neighbouring corner is cheaper, so this is the best plan: the solver stops." : at ? "" : "");
        bS.disabled = at >= walk.length - 1;
      }
      bS.addEventListener("click", function () { if (at < walk.length - 1) { at++; paint(); } });
      bR.addEventListener("click", function () { clearInterval(timer); at = 0; paint(); });
      bP.addEventListener("click", function () {
        clearInterval(timer); at = 0; paint();
        if (LX.reduced()) { at = walk.length - 1; paint(); return; }
        timer = setInterval(function () { if (at >= walk.length - 1) { clearInterval(timer); return; } at++; paint(); }, 1100);
      });
      var det = pk.closest("details");
      if (det) det.addEventListener("toggle", function () { if (det.open) paint(); });
      paint();
    }
  }

  LX.mount("solver", function (live, data, root) { view(live, data, root); });
})();
