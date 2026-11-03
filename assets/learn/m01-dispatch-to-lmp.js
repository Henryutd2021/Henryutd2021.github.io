// m01-dispatch-to-lmp.js — M1, "From dispatch to locational prices: the linear program behind the market" (model lab,
// the first Modeler lesson; wave W1, 2026-11-02).
//
// Data: assets/learn/data/m01-dispatch-to-lmp.json: lesson 0's real day (3 September 2025, Southwest Power Pool shapes
// from EIA-930, scaled to Prairie Town exactly as grid-operator.js does), Prairie Town's five plants, three buses and
// three lines. Plant sizes, costs, the network and the line limits are illustrative.
//
// The model (a linear program; the page solves it with HiGHS in a Web Worker through LX.solver):
//   decisions   p[g,t] output of plant g in hour t (MW over one hour = MWh); with the network also f[l,t] line flows and
//               th[n,t] voltage angles (the town bus is the angle reference, th = 0)
//   goal        min  sum_t sum_g cost[g] p[g,t]
//   rules       balance       one bus:  sum_g p[g,t] = d[t]                                      dual = hourly price
//                             network:  sum_{g at n} p[g,t] + inflow - outflow = d[n,t]          dual = locational price
//               plant sizes   0 <= p[g,t] <= size[g]; wind and solar <= what the weather gives (the rest is spilled)
//               nuclear flat  p[nuc,t] = 100 (it runs flat, as in lesson 0)
//               ramp          -40 <= p[cc,t] - p[cc,t-1] <= 40, with p[cc,-1] = 115 (lesson 0's start)
//               DC flow       f[l,t] = b[l] (th[from,t] - th[to,t])                              (network only)
//               line limits   -F[l] <= f[l,t] <= F[l]                                          dual -> congestion value mu
// Duals follow LX.solver's convention: d(optimal cost)/d(right-hand side). A balance dual is the cost of one more MWh of
// demand at that bus and hour: a marginal value under stated assumptions (fixed plants, costs as offers, a lossless DC
// network, the modelled day), not a market settlement. recipe() checks a dual by a finite difference (solve again with
// eps more demand) and lists how the cheapest plan would serve the extra MWh, which is how the page explains a price in
// words. ptdf() and decompose() give the textbook split LMP_n = LMP_ref - sum_l PTDF[l][n] mu_l (Go deeper).
//
// Every number the page states is produced by this model and checked by _tests/learn/test_m01-dispatch-to-lmp.js.
// The view uses the component library (assets/learn/learn.js): LX.Formulation for the model in full and LX.Network for the
// three-bus map (components/formulation.js, network.js); the price chart is built here.
(function () {
  "use strict";
  var PLANTS = ["nuclear", "wind", "solar", "cc", "pk"];
  var VAR = { nuclear: "nuc", wind: "wind", solar: "solar", cc: "cc", pk: "pk" };

  // ---------------------------------------------------------------- pure model
  function H(D) { return D.day.demand.length; }
  function busOf(D, id) { for (var i = 0; i < D.buses.length; i++) if (D.buses[i].id === id) return D.buses[i]; return null; }
  function refBus(D) { for (var i = 0; i < D.buses.length; i++) if (D.buses[i].reference) return D.buses[i].id; return D.buses[0].id; }
  function avail(D, g, t) { return g === "wind" ? D.day.wind[t] : g === "solar" ? D.day.solar[t] : D.fleet[g].mw; }
  function limits(D, o) {   // line limits for this run: the data's limits, with o.limit overriding the lesson's line
    var L = {};
    D.lines.forEach(function (l) { L[l.id] = l.limit; });
    if (o && o.limit != null) L[D.lesson.slider.line] = o.limit;
    if (o && o.limits) for (var k in o.limits) L[k] = o.limits[k];
    return L;
  }
  // o: { network: bool, limit: MW for the lesson's line, ramp: bool (default true), add: {bus, hour, mw} }
  function build(D, o) {
    o = o || {};
    var n = H(D), f = D.fleet, vars = [], cons = [], ref = refBus(D), lim = limits(D, o), ramp = o.ramp !== false;
    for (var t = 0; t < n; t++) {
      PLANTS.forEach(function (g) {
        var v = { name: VAR[g] + "_" + t, lb: 0, ub: avail(D, g, t), cost: f[g].cost };
        if (f[g].flat) v.lb = v.ub;
        vars.push(v);
      });
      if (o.network) {
        D.lines.forEach(function (l) { vars.push({ name: "f_" + l.id + "_" + t, lb: -Infinity, ub: Infinity }); });
        D.buses.forEach(function (b) { if (b.id !== ref) vars.push({ name: "th_" + b.id + "_" + t, lb: -Infinity, ub: Infinity }); });
        D.buses.forEach(function (b) {
          var terms = {};
          PLANTS.forEach(function (g) { if (f[g].bus === b.id) terms[VAR[g] + "_" + t] = 1; });
          D.lines.forEach(function (l) {
            if (l.from === b.id) terms["f_" + l.id + "_" + t] = -1;
            if (l.to === b.id) terms["f_" + l.id + "_" + t] = 1;
          });
          var d = b.id === ref ? D.day.demand[t] : 0;
          if (o.add && o.add.hour === t && o.add.bus === b.id) d += o.add.mw;
          cons.push({ name: "bal_" + b.id + "_" + t, terms: terms, eq: d });
        });
        D.lines.forEach(function (l) {
          var terms = {}; terms["f_" + l.id + "_" + t] = 1;
          if (l.from !== ref) terms["th_" + l.from + "_" + t] = -l.b;
          if (l.to !== ref) terms["th_" + l.to + "_" + t] = l.b;
          cons.push({ name: "flow_" + l.id + "_" + t, terms: terms, eq: 0 });
          if (isFinite(lim[l.id])) cons.push({ name: "cap_" + l.id + "_" + t, terms: (function () { var x = {}; x["f_" + l.id + "_" + t] = 1; return x; })(), lb: -lim[l.id], ub: lim[l.id] });
        });
      } else {
        var terms = {};
        PLANTS.forEach(function (g) { terms[VAR[g] + "_" + t] = 1; });
        var d1 = D.day.demand[t] + (o.add && o.add.hour === t ? o.add.mw : 0);
        cons.push({ name: "bal_" + t, terms: terms, eq: d1 });
      }
      if (ramp) {
        var cc = f.cc, rt = {};
        rt["cc_" + t] = 1;
        if (t > 0) { rt["cc_" + (t - 1)] = -1; cons.push({ name: "ramp_" + t, terms: rt, lb: -cc.ramp, ub: cc.ramp }); }
        else cons.push({ name: "ramp_0", terms: rt, lb: cc.start - cc.ramp, ub: cc.start + cc.ramp });
      }
    }
    return { sense: "min", variables: vars, constraints: cons };
  }
  function size(model) { return { vars: model.variables.length, rows: model.constraints.length }; }
  function r6(x) { return Math.round(x * 1e6) / 1e6; }
  // the solver's result -> hour-by-hour numbers the page shows
  function read(D, o, r) {
    o = o || {};
    if (!r || !r.ok) return { ok: false, status: r ? r.status : "none" };
    var n = H(D), lim = limits(D, o), out = [];
    for (var t = 0; t < n; t++) {
      var g = {}, price = {}, flow = {}, mu = {}, full = {};
      PLANTS.forEach(function (k) { g[k] = r.values[VAR[k] + "_" + t]; });
      if (o.network) {
        D.buses.forEach(function (b) { price[b.id] = r6(r.duals["bal_" + b.id + "_" + t]); });
        D.lines.forEach(function (l) {
          var v = r.values["f_" + l.id + "_" + t], c = r.duals["cap_" + l.id + "_" + t];
          flow[l.id] = v;
          mu[l.id] = c == null ? 0 : r6(-c);      // signed: value of 1 MW more limit in the direction from -> to
          full[l.id] = isFinite(lim[l.id]) && Math.abs(v) >= lim[l.id] - 1e-6;
        });
      } else {
        var p = r6(r.duals["bal_" + t]);
        D.buses.forEach(function (b) { price[b.id] = p; });
      }
      var spill = D.day.wind[t] + D.day.solar[t] - g.wind - g.solar;
      out.push({ t: t, gen: g, price: price, flow: flow, mu: mu, full: full, spill: spill < 1e-6 ? 0 : spill,
        ramp: o.ramp === false ? 0 : r6(r.duals["ramp_" + t]) });
    }
    return { ok: true, status: r.status, cost: r.objective, hours: out, network: !!o.network, limit: lim[D.lesson.slider.line] };
  }
  // how the cheapest plan serves eps more MWh at (bus, hour): per-MWh changes by plant and hour, and their cost
  function recipe(D, base, bump, eps) {
    var n = H(D), items = [], total = 0;
    for (var t = 0; t < n; t++) {
      var ren = 0;
      PLANTS.forEach(function (k) {
        var dv = (bump.values[VAR[k] + "_" + t] - base.values[VAR[k] + "_" + t]) / eps;
        if (k === "wind" || k === "solar") { ren += dv; return; }
        if (Math.abs(dv) > 1e-6) { items.push({ plant: k, hour: t, d: r6(dv), cost: D.fleet[k].cost }); total += dv * D.fleet[k].cost; }
      });
      if (Math.abs(ren) > 1e-6) items.push({ plant: "ren", hour: t, d: r6(ren), cost: 0 });
    }
    return { items: items, total: r6(total), fd: r6((bump.objective - base.objective) / eps) };
  }
  // power transfer distribution factors (injection at bus n, withdrawn at the reference bus) for the lesson's network
  function ptdf(D) {
    var ref = refBus(D), ids = D.buses.map(function (b) { return b.id; }).filter(function (x) { return x !== ref; });
    var k = ids.length, B = [], i, j;
    for (i = 0; i < k; i++) { B.push([]); for (j = 0; j < k; j++) B[i].push(0); }
    D.lines.forEach(function (l) {
      var a = ids.indexOf(l.from), c = ids.indexOf(l.to);
      if (a >= 0) B[a][a] += l.b; if (c >= 0) B[c][c] += l.b;
      if (a >= 0 && c >= 0) { B[a][c] -= l.b; B[c][a] -= l.b; }
    });
    var X = inv(B), out = {};
    D.lines.forEach(function (l) {
      out[l.id] = {};
      D.buses.forEach(function (b) {
        var col = ids.indexOf(b.id);
        if (col < 0) { out[l.id][b.id] = 0; return; }
        var a = ids.indexOf(l.from), c = ids.indexOf(l.to);
        out[l.id][b.id] = l.b * ((a >= 0 ? X[a][col] : 0) - (c >= 0 ? X[c][col] : 0));
      });
    });
    return out;
  }
  function inv(A) {   // Gauss-Jordan for a small matrix
    var n = A.length, M = A.map(function (r, i) { return r.concat(A.map(function (x, j) { return i === j ? 1 : 0; })); });
    for (var c = 0; c < n; c++) {
      var p = c; for (var r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      var tmp = M[c]; M[c] = M[p]; M[p] = tmp;
      var piv = M[c][c];
      for (var j = 0; j < 2 * n; j++) M[c][j] /= piv;
      for (r = 0; r < n; r++) if (r !== c) { var fac = M[r][c]; for (j = 0; j < 2 * n; j++) M[r][j] -= fac * M[c][j]; }
    }
    return M.map(function (r) { return r.slice(n); });
  }
  // flows when `mw` is sent from bus a to bus b and nothing else changes (step 6)
  function transfer(D, a, b, mw) {
    var P = ptdf(D), out = {};
    D.lines.forEach(function (l) { out[l.id] = r6(mw * (P[l.id][a] - P[l.id][b])); });
    return out;
  }
  // LMP_n = LMP_ref - sum_l PTDF[l][n] mu_l  (lossless DC model, reference bus = town)
  function decompose(D, h) {
    var P = ptdf(D), ref = refBus(D), out = {};
    D.buses.forEach(function (b) {
      var c = 0; D.lines.forEach(function (l) { c += P[l.id][b.id] * (h.mu[l.id] || 0); });
      out[b.id] = { energy: h.price[ref], congestion: r6(-c), total: r6(h.price[ref] - c) };
    });
    return out;
  }
  // congestion rent in one hour: what loads pay minus what generators are paid = sum_l mu_l x flow_l
  function rent(D, h) {
    var paid = 0, f = D.fleet;
    D.buses.forEach(function (b) {
      var inj = 0; PLANTS.forEach(function (k) { if (f[k].bus === b.id) inj += h.gen[k]; });
      var wd = b.reference ? D.day.demand[h.t] : 0;
      paid += h.price[b.id] * (wd - inj);
    });
    var viaMu = 0; D.lines.forEach(function (l) { viaMu += (h.mu[l.id] || 0) * (h.flow[l.id] || 0); });
    return { rent: r6(paid), viaMu: r6(viaMu) };
  }
  function fullHours(day, line) { var a = []; day.hours.forEach(function (h) { if (h.full[line]) a.push(h.t); }); return a; }

  // ---------------------------------------------------------------- words the page says (pure, so the test can read them)
  function money(v) { var r = Math.round(v); return (r < 0 ? "−$" : "$") + Math.abs(r).toLocaleString("en-US"); }
  function hh(t) { return (t < 10 ? "0" : "") + t + ":00"; }
  function plantWords(D, k) { return k === "ren" ? "Ridge wind and solar" : D.fleet[k].label.replace(/^Gas combined-cycle plant$/, "gas combined-cycle plant").replace(/^Gas peaker$/, "gas peaker").replace(/^Nuclear plant$/, "nuclear plant"); }
  function mwh(x) { var a = Math.abs(x), s = Math.abs(a - Math.round(a)) < 1e-6 ? String(Math.round(a)) : a.toFixed(2).replace(/0+$/, "").replace(/\.$/, ""); return (x < 0 ? "−" : "+") + s + " MWh"; }
  // "+1 MWh from the gas combined-cycle plant at 13:00 ..." for a recipe
  function recipeWords(D, rc) {
    return rc.items.map(function (it) {
      return mwh(it.d) + " " + plantWords(D, it.plant) + " at " + hh(it.hour) + " (" + money(it.cost) + "/MWh)";
    });
  }
  function recipeSum(rc) {
    var parts = rc.items.map(function (it) { var m = Math.abs(it.d), s = Math.abs(m - Math.round(m)) < 1e-6 ? String(Math.round(m)) : m.toFixed(2); return (it.d < 0 ? "− " : "+ ") + s + " × " + money(it.cost); });
    var s = parts.join(" ").replace(/^\+ /, "");
    return s + " = " + money(rc.fd);
  }

  var model = { PLANTS: PLANTS, build: build, size: size, read: read, recipe: recipe, ptdf: ptdf, transfer: transfer, decompose: decompose,
    rent: rent, fullHours: fullHours, limits: limits, refBus: refBus, money: money, hh: hh, recipeWords: recipeWords, recipeSum: recipeSum };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX || !window.LX.H) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, E = LX.H, S = LX.S;
  var KEY = "m1-own";

  function css() {
    if (document.getElementById("m1-css")) return;
    E("style", { id: "m1-css", text: [
      ".lx-interactive.m1-lab{max-width:980px}",
      ".m1-cards{display:grid;gap:14px}",
      ".m1-lab .lx-stepcard{gap:12px}",
      ".m1-lab .lx-step-text{max-width:60ch}",
      ".m1-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}",
      ".m1-kpis{display:flex;flex-wrap:wrap;gap:8px}",
      ".m1-kpi{display:grid;gap:0;padding:8px 12px;border:1px solid var(--lx-line);border-radius:10px;background:var(--lx-surface-2);min-width:120px}",
      ".m1-kpi small{font-size:12px;color:var(--lx-ink-3);font-family:var(--lx-f-display);letter-spacing:.04em;text-transform:uppercase}",
      ".m1-kpi b{font-family:var(--lx-f-mono);font-size:18px;font-weight:600;color:var(--lx-ink)}",
      ".m1-split{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px;align-items:start}",
      "@media (max-width:720px){.m1-split{grid-template-columns:minmax(0,1fr)}}",
      ".m1-chart{position:relative}.m1-chart svg{display:block;width:100%;height:auto}",
      ".m1-chart .col{cursor:pointer}.m1-chart .col:hover rect.hit{fill:var(--lx-surface-3)}",
      ".m1-hours{display:flex;align-items:center;gap:8px;flex-wrap:wrap}",
      ".m1-hours output{font-family:var(--lx-f-mono);font-size:16px;font-weight:600;min-width:58px;text-align:center}",
      ".m1-hours button{min-width:44px}",
      ".m1-recipe{border:1px solid var(--lx-line);border-radius:12px;padding:10px 14px;background:var(--lx-surface-2);display:grid;gap:6px;font-size:15px}",
      ".m1-recipe ul{margin:0;padding-left:1.1rem}.m1-recipe li{margin:2px 0}",
      ".m1-recipe .sum{font-family:var(--lx-f-mono);font-size:14.5px}",
      ".m1-recipe .note{font-size:13.5px;color:var(--lx-ink-3)}",
      ".m1-rules{display:grid;gap:6px}",
      ".m1-rule{display:grid;grid-template-columns:minmax(0,1fr);gap:4px;text-align:left;width:100%;min-height:46px;padding:8px 12px;border-radius:11px;border:1px solid var(--lx-line-2);background:var(--lx-surface);color:var(--lx-ink);cursor:pointer;font:inherit}",
      ".m1-rule:hover{border-color:var(--lx-ink-3)}",
      ".m1-rule[aria-pressed=true]{border-color:var(--lx-ink);box-shadow:inset 0 0 0 1px var(--lx-ink);background:var(--lx-surface-2)}",
      ".m1-rule.right{border-color:var(--lx-good);box-shadow:inset 0 0 0 1px var(--lx-good)}",
      ".m1-rule .nm{font-family:var(--lx-f-display);font-weight:500;font-size:15px}",
      ".m1-rule .det{font-size:14.5px;color:var(--lx-ink-2)}",
      ".m1-sym{font-family:var(--lx-f-mono);font-size:14px;color:var(--lx-ink);overflow-x:auto;white-space:nowrap;padding:2px 0}",
      ".m1-sym i{font-family:var(--lx-f-body);font-style:italic;font-size:15px}",
      ".m1-anno{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:16px;align-items:start}",
      "@media (max-width:760px){.m1-anno{grid-template-columns:minmax(0,1fr)}}",
      ".m1-anno ol{margin:0;padding-left:1.3rem;display:grid;gap:8px;font-size:15px}",
      ".m1-anno ol b{font-family:var(--lx-f-display);font-weight:500}",
      ".m1-tag{font-size:12.5px;color:var(--lx-ink-3)}"
    ].join("\n") }, document.head);
  }

  // ---- the model's rules (the explain layer shows them with LX.Formulation; step 1 lists the one-bus rules)
  var SUB = function (s) { return "<sub>" + s + "</sub>"; };
  var RULES = [
    { id: "obj", name: "Goal", words: "Keep the day's running cost as low as possible.",
      sym: "min&nbsp;&sum;<i>" + SUB("t") + "</i>&thinsp;&sum;" + SUB("<i>g</i>") + "&nbsp;<i>c</i>" + SUB("<i>g</i>") + "&nbsp;<i>p</i>" + SUB("<i>g,t</i>"),
      rows: function (net, n) { return "1 objective"; }, dual: "–" },
    { id: "bal", name: "Balance", words: "Every hour, power made equals power used; on the network this holds at every bus, counting the flows in and out.",
      sym1: "&sum;" + SUB("<i>g</i>") + "&nbsp;<i>p</i>" + SUB("<i>g,t</i>") + "&nbsp;=&nbsp;<i>d</i>" + SUB("<i>t</i>"),
      sym: "&sum;" + SUB("<i>g</i>&isin;<i>n</i>") + "&nbsp;<i>p</i>" + SUB("<i>g,t</i>") + "&nbsp;+&nbsp;inflow" + SUB("<i>n,t</i>") + "&nbsp;&minus;&nbsp;outflow" + SUB("<i>n,t</i>") + "&nbsp;=&nbsp;<i>d</i>" + SUB("<i>n,t</i>"),
      rows: function (net, n) { return net ? "3 buses × " + n + " hours = " + 3 * n : n + " (one per hour)"; },
      dual: "the price: $ per MWh, at that bus and hour" },
    { id: "size", name: "Plant sizes", words: "No plant makes more than its size, or less than zero.",
      sym: "0&nbsp;&le;&nbsp;<i>p</i>" + SUB("<i>g,t</i>") + "&nbsp;&le;&nbsp;<i>P&#772;</i>" + SUB("<i>g</i>"),
      rows: function (net, n) { return "bounds on 5 × " + n + " outputs"; }, dual: "reduced cost of each output" },
    { id: "weather", name: "Wind and solar", words: "Wind and solar can make at most what the weather gives each hour; the rest is spilled.",
      sym: "<i>p</i>" + SUB("<i>g,t</i>") + "&nbsp;&le;&nbsp;<i>A</i>" + SUB("<i>g,t</i>") + "&nbsp;&nbsp;(<i>g</i>&nbsp;=&nbsp;wind,&nbsp;solar)",
      rows: function (net, n) { return "bounds, 2 × " + n; }, dual: "the value of one more MWh of wind or sun" },
    { id: "flat", name: "Nuclear runs flat", words: "The nuclear plant makes 100 MW every hour, as in lesson 0.",
      sym: "<i>p</i>" + SUB("nuc,<i>t</i>") + "&nbsp;=&nbsp;100", rows: function (net, n) { return "bounds, " + n; }, dual: "–" },
    { id: "ramp", name: "Ramp", words: "The gas combined-cycle plant changes its output by at most 40 MW from one hour to the next; it starts the day from 115 MW.",
      sym: "&minus;40&nbsp;&le;&nbsp;<i>p</i>" + SUB("cc,<i>t</i>") + "&nbsp;&minus;&nbsp;<i>p</i>" + SUB("cc,<i>t</i>&minus;1") + "&nbsp;&le;&nbsp;40",
      rows: function (net, n) { return n + " (one per hour)"; }, dual: "the value of 1 MW more ramp" },
    { id: "flow", name: "DC power flow", net: true, words: "Each line's flow is set by the angle difference between its two ends: power splits over every path, by the lines' reactance.",
      sym: "<i>f</i>" + SUB("<i>ℓ,t</i>") + "&nbsp;=&nbsp;<i>b</i>" + SUB("<i>ℓ</i>") + "&thinsp;(<i>θ</i>" + SUB("<i>i,t</i>") + "&nbsp;&minus;&nbsp;<i>θ</i>" + SUB("<i>j,t</i>") + "),&nbsp;&nbsp;<i>θ</i>" + SUB("Town,<i>t</i>") + "&nbsp;=&nbsp;0",
      rows: function (net, n) { return net ? "3 lines × " + n + " = " + 3 * n : "added on the map"; }, dual: "–" },
    { id: "lim", name: "Line limits", net: true, words: "No line carries more than its limit, in either direction.",
      sym: "&minus;<i>F</i>" + SUB("<i>ℓ</i>") + "&nbsp;&le;&nbsp;<i>f</i>" + SUB("<i>ℓ,t</i>") + "&nbsp;&le;&nbsp;<i>F</i>" + SUB("<i>ℓ</i>"),
      rows: function (net, n) { return net ? "3 lines × " + n + " = " + 3 * n : "added on the map"; }, dual: "μ: the value of 1 MW more line limit, $ per MW in that hour" }
  ];
  var LEGEND = [
    ["t", "hour, 0 to 23 (each lasts 1 h, so MW over the hour = MWh)"], ["g", "plant: nuclear, wind, solar, gas combined-cycle (cc), gas peaker"],
    ["n, ℓ", "bus (Town, Ridge, Gas Hub) and line (three of them)"], ["p_g,t", "output of plant g in hour t, MW (decision)"],
    ["f_ℓ,t, θ_n,t", "line flow, MW, and voltage angle, radians (decisions)"], ["c_g", "running cost, $/MWh: 10, 0, 0, 40, 100"],
    ["d_n,t", "demand, MW (all of it in town)"], ["A_g,t", "wind or solar the weather gives, MW"],
    ["b_ℓ", "line susceptance, 1,000 MW per radian, equal on all lines"], ["F_ℓ", "line limit, MW (you set Ridge–Town)"]
  ];

  // ---- 24-hour price chart: one line per bus (they coincide without congestion); tap an hour to select it
  function PriceChart(host, o) {
    var w = E("div", { class: "m1-chart" }, host), legend = E("div", { class: "lx-legend" }, host);
    var alt = E("details", { class: "lx-textalt" }, host); E("summary", { text: "Text version" }, alt);
    var svg = null, state = { day: null, ghost: null, sel: 12 };
    function series() {
      var d = state.day; if (!d) return [];
      if (!d.network) return [{ id: "one", label: "Price, one bus", color: "var(--lx-ink)", v: d.hours.map(function (h) { return h.price.T; }) }];
      return o.D.buses.map(function (b) { return { id: b.id, label: b.name, color: b.color, v: d.hours.map(function (h) { return h.price[b.id]; }) }; });
    }
    function render() {
      var W = Math.max(280, w.clientWidth || 600), Hh = W < 480 ? 200 : 230, ser = series();
      var all = []; ser.forEach(function (s) { all = all.concat(s.v); }); if (state.ghost) all = all.concat(state.ghost);
      var top = Math.max(100, Math.ceil(Math.max.apply(null, all.concat([0])) / 50) * 50);
      var m = { l: 44, r: 10, t: 12, b: 26 }, iw = W - m.l - m.r, ih = Hh - m.t - m.b, n = 24, bw = iw / n;
      var y = function (v) { return m.t + ih - v / top * ih; };
      if (svg) svg.remove();
      svg = S("svg", { viewBox: "0 0 " + W + " " + Hh, width: W, height: Hh, role: "img", "aria-label": o.label || "Price in each hour, dollars per MWh." }, w);
      for (var v = 0; v <= top; v += top / 4) {
        S("path", { d: "M" + m.l + " " + y(v) + " H" + (W - m.r), stroke: "var(--lx-line)", "stroke-width": 1 }, svg);
        S("text", { x: m.l - 6, y: y(v) + 4, "text-anchor": "end", "font-size": 11, "font-family": "var(--lx-f-mono)", fill: "var(--lx-ink-3)" }, svg).textContent = "$" + v;
      }
      [0, 6, 12, 18, 24].forEach(function (h) {
        S("text", { x: m.l + h * bw, y: Hh - 7, "text-anchor": h === 0 ? "start" : h === 24 ? "end" : "middle", "font-size": 11, "font-family": "var(--lx-f-mono)", fill: "var(--lx-ink-3)" }, svg).textContent = hh(h % 24 === 0 && h ? 0 : h).replace(/^00:00$/, h ? "24:00" : "00:00");
      });
      for (var t = 0; t < n; t++) {
        var g = S("g", { class: "col" }, svg);
        S("rect", { class: "hit", x: m.l + t * bw, y: m.t, width: bw, height: ih, fill: t === state.sel ? "var(--lx-accent-soft)" : "transparent" }, g);
        (function (tt) { g.addEventListener("click", function () { if (o.onPick) o.onPick(tt); }); })(t);
      }
      if (state.ghost) {
        var dg = ""; state.ghost.forEach(function (p, t) { dg += (t ? " L" : "M") + (m.l + t * bw) + " " + y(p) + " H" + (m.l + (t + 1) * bw); });
        S("path", { d: dg, fill: "none", stroke: "var(--lx-ink-3)", "stroke-width": 2, "stroke-dasharray": "4 3", opacity: .8 }, svg);
      }
      ser.forEach(function (s, k) {
        var d = "", off = ser.length > 1 ? (k - 1) * 1.6 : 0;
        s.v.forEach(function (p, t) { d += (t ? " L" : "M") + (m.l + t * bw) + " " + (y(p) + off) + " H" + (m.l + (t + 1) * bw); });
        S("path", { d: d, fill: "none", stroke: s.color, "stroke-width": ser.length > 1 ? 2.4 : 2.6, "stroke-linejoin": "round" }, svg);
      });
      legend.innerHTML = "";
      ser.forEach(function (s) { var sp = E("span", null, legend); E("i", { style: "--c:" + s.color }, sp); E("span", { text: s.label }, sp); });
      if (state.ghost) { var gp = E("span", null, legend); E("i", { class: "line" }, gp); E("span", { text: o.ghostLabel || "Before" }, gp); }
      alt.querySelectorAll(".lx-scroll-x").forEach(function (x) { x.remove(); });
      var tb = E("table", { class: "lx-mini-table" }, E("div", { class: "lx-scroll-x" }, alt)), hr = E("tr", null, E("thead", null, tb));
      E("th", { scope: "col", text: "Hour" }, hr); ser.forEach(function (s) { E("th", { scope: "col", text: s.label + " ($/MWh)" }, hr); });
      var body = E("tbody", null, tb);
      for (t = 0; t < n; t++) { var tr = E("tr", null, body); E("td", { text: hh(t) }, tr); ser.forEach(function (s) { E("td", { text: Math.round(s.v[t]) }, tr); }); }
    }
    if (window.ResizeObserver) new ResizeObserver(function () { if (LX.visible(w) && state.day) render(); }).observe(w);
    LX.onTheme(function () { if (LX.visible(w) && state.day) render(); });
    return { set: function (x) { for (var k in x) state[k] = x[k]; if (state.day) render(); }, el: w };
  }

  // ---- hour picker: previous / next buttons and the hour
  function HourPicker(host, o) {
    var w = E("div", { class: "m1-hours", role: "group", "aria-label": "Hour" }, host), t = o.start;
    E("span", { class: "lx-eyebrow", text: "Hour" }, w);
    var prev = E("button", { type: "button", class: "lx-btn ghost small", "aria-label": "Previous hour", html: LX.icon("back") }, w);
    var out = E("output", { "aria-live": "polite" }, w);
    var next = E("button", { type: "button", class: "lx-btn ghost small", "aria-label": "Next hour", html: LX.icon("arrow") }, w);
    (o.jumps || []).forEach(function (j) { E("button", { type: "button", class: "lx-btn ghost small", text: j[1], onclick: function () { set(j[0], true); } }, w); });
    function set(v, user) { t = (v + 24) % 24; out.textContent = hh(t); if (user && o.onChange) o.onChange(t); }
    prev.addEventListener("click", function () { set(t - 1, true); });
    next.addEventListener("click", function () { set(t + 1, true); });
    set(t);
    return { set: function (v) { set(v); }, val: function () { return t; } };
  }

  // ---- the three-bus network: LX.Network (components/network.js) with this lesson's layout; tap a bus to explain its price
  var POS = { R: [78, 62], G: [282, 62], T: [180, 238] };
  function Network(host, o) {
    var D = o.D;
    return LX.Network(host, { label: "Three-bus network: Wind Ridge, Gas Hub and Prairie Town, joined by three lines.", onPick: o.onPick, money: money,
      buses: D.buses.map(function (b) {
        return { id: b.id, name: b.name, short: b.short, color: b.color, reference: b.reference, at: POS[b.id],
                 note: b.reference ? "load + nuclear" : b.id === "R" ? "wind + solar" : "gas plants", desc: b.reference ? "all the demand and the nuclear plant" : null };
      }),
      // labels sit beside their line: above the top line, left of Ridge-Town, right of Gas Hub-Town
      lines: D.lines.map(function (l) {
        var a = POS[l.from], c = POS[l.to], mx = (a[0] + c[0]) / 2, my = (a[1] + c[1]) / 2;
        return { id: l.id, from: l.from, to: l.to, name: l.name, labelAt: l.id === "RT" ? [mx - 14, my - 4, "end"] : l.id === "GT" ? [mx + 14, my - 4, "start"] : [mx, 18, "middle"] };
      }),
      plants: Object.keys(D.fleet).map(function (k) { return { bus: D.fleet[k].bus, color: D.fleet[k].color, label: D.fleet[k].label }; }) });
  }

  // ---- recipe box: the dual, the finite-difference check, and the plan's change in words
  function Recipe(host) {
    var w = E("div", { class: "m1-recipe", "aria-live": "polite", hidden: true }, host);
    return { el: w, show: function (D, title, dual, rc) {
      w.hidden = false; w.innerHTML = "";
      E("p", { html: "<b>" + LX.esc(title) + "</b>: the solver's dual is <b>" + money(dual) + "</b> per MWh." }, w);
      var ul = E("ul", null, w);
      recipeWords(D, rc).forEach(function (s) { E("li", { text: s }, ul); });
      E("p", { class: "sum", text: "Cost of one more MWh: " + recipeSum(rc) }, w);
      if (Math.abs(rc.fd - dual) > 0.01) E("p", { class: "note", text: "Here the dual and a small step differ: this hour sits on a corner of the model, where a price is not unique (Go deeper)." }, w);
    }, hide: function () { w.hidden = true; } };
  }

  LX.mount("m01-dispatch-to-lmp", function (live, data, root) {
    css();
    var D = data.m01_dispatch_to_lmp, L = D.lesson, n = D.day.demand.length;
    root.classList.add("m1-lab");
    var own = LX.store.get(KEY, {}) || {};
    function remember(k, v) { own[k] = v; LX.store.set(KEY, own); }
    // solve helpers
    function solve(o, key) {
      return LX.solver.solve(build(D, o), { timeLimit: 3, key: key, label: "m1" }).then(function (r) { return { r: r, day: read(D, o, r) }; });
    }
    function bumpAt(o, base, bus, hour) {
      var ob = {}; for (var k in o) ob[k] = o[k]; ob.add = { bus: bus, hour: hour, mw: L.eps };
      return LX.solver.solve(build(D, ob), { timeLimit: 3, label: "m1" }).then(function (r2) { return recipe(D, base, r2, L.eps); });
    }
    function status(host) { return LX.SolverStatus(host); }
    function kpi(host, label, value) { var k = E("div", { class: "m1-kpi" }, host); E("small", { text: label }, k); var b = E("b", { text: value }, k); return b; }
    var A = null, Aoff = null, B200 = null, Bcur = null, bLimit = L.slider.start;   // solved days
    var oA = { network: false }, oAoff = { network: false, ramp: false };
    function oB(lim) { return { network: true, limit: lim }; }

    var steps = [
      // 1 the formulation
      { text: "Lesson 0's day becomes a [[linear-program|linear program]]: 24 hours, five plants, one balance rule per hour. Which rule below ties each hour to the next?",
        build: function (act, api) {
          var box = E("div", { class: "m1-rules", role: "group", "aria-label": "The rules of the one-bus model" }, act);
          var picked = null;
          RULES.filter(function (r) { return !r.net && r.id !== "obj"; }).forEach(function (r) {
            var b = E("button", { type: "button", class: "m1-rule", "aria-pressed": "false" }, box);
            E("span", { class: "nm", text: r.name }, b);
            var det = E("span", { class: "det", hidden: true }, b);
            det.innerHTML = LX.esc(r.words) + "<br><span class=\"m1-sym\">" + (r.sym1 || r.sym) + "</span>";
            b.addEventListener("click", function () {
              box.querySelectorAll(".m1-rule").forEach(function (x) { x.setAttribute("aria-pressed", "false"); x.querySelector(".det").hidden = true; });
              b.setAttribute("aria-pressed", "true"); det.hidden = false; picked = r.id;
              if (r.id === "ramp") { b.classList.add("right"); api.done(); api.saw("Right. The ramp rule is the only one that names two hours, t and t − 1, so the gas plant's 13:00 output limits its 14:00 output."); }
              else api.saw("That rule acts on one hour at a time. Look for one that names two hours.", true);
            });
          });
        } },
      // 2 solve
      { text: "Hand the model to [[solver|HiGHS]], an open-source solver running in your browser. It chooses 120 outputs that obey all 48 rules at the lowest running cost.",
        build: function (act, api) {
          var row = E("div", { class: "m1-row" }, act);
          var go = E("button", { type: "button", class: "lx-btn small", html: LX.icon("play") + "Solve the day" }, row);
          var st = status(row), kp = E("div", { class: "m1-kpis" }, act), chHost = E("div", null, act);
          var ch = PriceChart(chHost, { D: D, label: "Price in each hour of the one-bus day, dollars per MWh." });
          function show() { kp.innerHTML = ""; kpi(kp, "Day's cost", money(A.cost)); kpi(kp, "Price at 19:00", money(A.hours[L.t8Hour].price.T) + "/MWh"); ch.set({ day: A, sel: L.t8Hour }); }
          if (A) { show(); api.done(); }
          go.addEventListener("click", function () {
            st.set(LX.solver.mode ? "solving" : "loading");
            solve(oA, "m1-a").then(function (x) {
              st.set(x.r); if (!x.day.ok) return;
              A = x.day; A._r = x.r; show(); api.done();
              api.saw("Optimal: " + money(A.cost) + " for the day, the plan lesson 0's Go deeper found. With the plan come 24 [[shadow-price|duals]], one per balance row: the hourly prices in the chart.");
            });
          });
        } },
      // 3 read one price, check it
      { text: "A balance row's dual is the change in total cost if its demand grows by 1 MWh. At 19:00 the solver reports $40. Check it: add 1 MWh at 19:00 and solve again.",
        build: function (act, api) {
          var row = E("div", { class: "m1-row" }, act);
          var go = E("button", { type: "button", class: "lx-btn small", text: "+1 MWh at 19:00, solve again" }, row), st = status(row), rcp = Recipe(act);
          go.addEventListener("click", function () {
            if (!A) return;
            st.set("solving");
            var ob = { network: false, add: { bus: "T", hour: L.t8Hour, mw: 1 } };
            LX.solver.solve(build(D, ob), { timeLimit: 3, label: "m1" }).then(function (r2) {
              st.set(r2); if (!r2.ok) return;
              var rc = recipe(D, A._r, r2, 1);
              rcp.show(D, "19:00", A.hours[L.t8Hour].price.T, rc); api.done();
              api.saw("Cost " + money(A.cost) + " → " + money(r2.objective) + ": up " + money(r2.objective - A.cost) + ", exactly the dual, and lesson 8's price at 19:00. The gas combined-cycle plant made the extra MWh.");
            });
          });
        } },
      // 4 a price no plant offers
      { text: "Now 14:00. The dual is $80 per MWh, yet no plant offers $80. Predict why.",
        build: function (act, api) {
          var rcp;
          var p = LX.Predict(act, { id: "m1-ramp-price", fresh: true, q: "Why is 14:00 priced at $80?", answer: "ramp",
            options: [{ value: "peaker", label: "The peaker runs at 14:00" }, { value: "ramp", label: "The gas plant must climb an hour early" }, { value: "solver", label: "A rounding error in the solver" }],
            feedback: { peaker: "The peaker makes nothing all day.", ramp: "The ramp rule couples 13:00 and 14:00.", solver: "The solver's answer is exact here; the check below shows it." },
            onPick: function () {
              p.reveal();
              if (!A) return;
              bumpAt(oA, A._r, "T", L.rampHour).then(function (rc) {
                rcp.show(D, "14:00", A.hours[L.rampHour].price.T, rc); api.done();
                api.saw("One more MWh at 14:00 needs the gas plant 1 MWh higher at 14:00 and at 13:00, since it climbs at most 40 MW an hour. At 13:00 that MWh only pushes out free wind and solar, so 13:00 is priced at " + money(A.hours[L.rampHour - 1].price.T) + ".");
              });
            } });
          rcp = Recipe(act);
        } },
      // 5 relax the ramp
      { text: "Switch the ramp rule off and solve again. Compare the day's cost and its prices with the plan you had.",
        build: function (act, api) {
          var row = E("div", { class: "m1-row" }, act);
          var go = E("button", { type: "button", class: "lx-btn small", text: "Solve without the ramp rule" }, row), st = status(row);
          var kp = E("div", { class: "m1-kpis" }, act), ch = PriceChart(E("div", null, act), { D: D, ghostLabel: "With the ramp rule", label: "Prices without the ramp rule, with the earlier prices dashed." });
          go.addEventListener("click", function () {
            if (!A) return;
            st.set("solving");
            solve(oAoff, "m1-aoff").then(function (x) {
              st.set(x.r); if (!x.day.ok) return;
              Aoff = x.day; kp.innerHTML = ""; kpi(kp, "With the ramp rule", money(A.cost)); kpi(kp, "Without it", money(Aoff.cost));
              ch.set({ day: Aoff, ghost: A.hours.map(function (h) { return h.price.T; }), sel: L.rampHour }); api.done();
              var prices = {}; Aoff.hours.forEach(function (h) { prices[money(h.price.T)] = 1; });
              api.saw("Without it: " + money(Aoff.cost) + ", and " + Object.keys(prices).join(", ") + " in every hour. The ramp rule costs " + money(A.cost - Aoff.cost) + " on this day, and it alone makes the $0 and $80 hours.");
            });
          });
        } },
      // 6 the map and DC power flow
      { text: "Now the plants get places: wind and solar on Wind Ridge, both gas plants at the Gas Hub, the nuclear plant in town. Three equal lines join them. Ridge sends 90 MW to town: how much takes the direct line?",
        build: function (act, api) {
          var net = Network(E("div", null, act), { D: D });
          var sp = L.split, tr = transfer(D, sp.from, sp.to, sp.mw), direct = Math.round(Math.abs(tr.RT));
          var pr = LX.Predict(act, { id: "m1-split", fresh: true, title: false, q: "MW on the direct Ridge–Town line", answer: String(direct),
            options: [90, 60, 45, 30].map(function (v) { return { value: String(v), label: v + " MW" }; }),
            feedback: { "90": "Power does not choose the shortest path; it takes every path.", "60": "Two thirds take the direct line.", "45": "The two paths are not equal.", "30": "That is the share of the longer path." },
            onPick: function () {
              pr.reveal();
              net.set({ transfer: tr }); api.done();
              api.saw(direct + " MW: power splits over both paths by their [[reactance|reactance]]. The path through the Gas Hub has two lines, twice the reactance of the direct line, so it carries a third: " + Math.round(Math.abs(tr.RG)) + " MW.");
            } });
        } },
      // 7 solve the network with roomy lines
      { text: "Solve the same day on this network, every line 200 MW. Each bus now has its own balance row, so each has its own dual: a [[locational-marginal-price|locational marginal price]].",
        build: function (act, api) {
          var row = E("div", { class: "m1-row" }, act);
          var go = E("button", { type: "button", class: "lx-btn small", html: LX.icon("play") + "Solve the network day" }, row), st = status(row);
          var sp = E("div", { class: "m1-split" }, act), net = Network(E("div", null, sp), { D: D }), right = E("div", null, sp), hp;
          var ch = PriceChart(right, { D: D, onPick: function (t) { hp.set(t); show(); }, label: "Price at each bus in each hour, dollars per MWh." });
          hp = HourPicker(right, { start: L.noon, onChange: function () { show(); } });
          function show() { if (!B200) return; var t = hp.val(); net.set({ h: B200.hours[t], lim: limits(D, oB(L.slider.start)) }); ch.set({ day: B200, sel: t }); }
          if (B200) { show(); api.done(); }
          go.addEventListener("click", function () {
            st.set(LX.solver.mode ? "solving" : "loading");
            solve(oB(L.slider.start), "m1-b200").then(function (x) {
              st.set(x.r); if (!x.day.ok) return;
              B200 = x.day; B200._r = x.r; show(); api.done();
              var same = B200.hours.every(function (h) { return h.price.T === h.price.R && h.price.T === h.price.G; });
              var maxFlow = 0; B200.hours.forEach(function (h) { D.lines.forEach(function (l) { maxFlow = Math.max(maxFlow, Math.abs(h.flow[l.id])); }); });
              api.saw("Cost " + money(B200.cost) + (same ? ", and the three prices are equal every hour" : "") + ": the busiest line carries at most " + Math.round(maxFlow) + " MW, so no line fills and location does not matter. This is lesson 8's one-price world.");
            });
          });
        } },
      // 8 tighten the line
      { text: "Lower the Ridge–Town line's limit step by step and watch noon. Stop when the line fills.",
        build: function (act, api) {
          var sl = LX.Slider(act, { label: "Ridge–Town limit", color: "var(--lx-bad)", min: L.slider.min, max: L.slider.max, step: L.slider.step,
            hint: function () { return "Each change solves the whole day again (" + build(D, oB(110)).constraints.length + " rules)."; }, onChange: function (v) { run(v); } });
          sl.set(bLimit);
          var st = status(act), sp = E("div", { class: "m1-split" }, act), net = Network(E("div", null, sp), { D: D }), right = E("div", null, sp);
          var hp, ch = PriceChart(right, { D: D, onPick: function (t) { hp.set(t); show(); }, label: "Price at each bus in each hour, dollars per MWh." });
          hp = HourPicker(right, { start: L.noon, onChange: function () { show(); } });
          function show() { if (!Bcur) return; var t = hp.val(); net.set({ h: Bcur.hours[t], lim: limits(D, oB(bLimit)) }); ch.set({ day: Bcur, sel: t }); }
          function run(v) {
            bLimit = v; st.set("solving");
            solve(oB(v), "m1-limit").then(function (x) {
              if (x.r.status === "superseded" || x.r.status === "cancelled") return;
              st.set(x.r); if (!x.day.ok) return;
              Bcur = x.day; Bcur._r = x.r; show();
              var nh = Bcur.hours[L.noon];
              if (nh.full[L.slider.line]) {
                var fh = fullHours(Bcur, L.slider.line);
                remember("limit", v); api.done();
                api.saw("At " + v + " MW the line is full from " + hh(fh[0]) + " to " + hh(fh[fh.length - 1]) + ". At noon: Ridge " + money(nh.price.R) + ", Gas Hub " + money(nh.price.G) + ", Town " + money(nh.price.T) + " per MWh. One price has become three.");
              } else api.saw("At " + v + " MW the line still has room at noon (" + Math.round(nh.flow.RT) + " MW): one price, " + money(nh.price.T) + ". Keep lowering.", true);
            });
          }
          run(bLimit);
        } },
      // 9 explain a bus price in words
      { text: function () { var p = Bcur && Bcur.hours[L.noon].price.T; return "At noon the town pays " + (p != null ? money(p) : "its own price") + " per MWh, yet no plant offers that. Tap Prairie Town to see how the cheapest plan would serve one more MWh there."; },
        build: function (act, api) {
          var sp = E("div", { class: "m1-split" }, act), left = E("div", null, sp), right = E("div", null, sp), rcp = Recipe(right), sel = null;
          var net = Network(left, { D: D, onPick: pick });
          var seg = E("div", { class: "lx-seg", role: "group", "aria-label": "Explain the price at" }, right);
          var bb = D.buses.map(function (b) { return E("button", { type: "button", "aria-pressed": "false", text: b.short, onclick: function () { pick(b.id); } }, seg); });
          right.appendChild(rcp.el);
          if (Bcur) net.set({ h: Bcur.hours[L.noon], lim: limits(D, oB(bLimit)) });
          function pick(id) {
            if (!Bcur) return;
            sel = id; net.set({ sel: id }); bb.forEach(function (b, i) { b.setAttribute("aria-pressed", D.buses[i].id === id ? "true" : "false"); });
            bumpAt(oB(bLimit), Bcur._r, id, L.noon).then(function (rc) {
              var h = Bcur.hours[L.noon];
              rcp.show(D, busOf(D, id).name + " at 12:00", h.price[id], rc);
              if (id === "T") {
                remember("recipeT", rc); api.done();
                api.saw(h.full.RT ? "The two changes push opposite ways on the full line and cancel, so the line's flow stays at its limit. The town's price is a mix of two plants' costs, set by the network's physics." : "The line has room at this limit, so the town's MWh comes from the cheapest plant with spare output.");
              }
            });
          }
        } },
      // 10 compare with lesson 8
      { text: "Lesson 8 found one price for everyone. Go to 19:00, the hour it used. Is the Ridge–Town line full then?",
        build: function (act, api) {
          var sp = E("div", { class: "m1-split" }, act), net = Network(E("div", null, sp), { D: D }), right = E("div", null, sp);
          var hp = HourPicker(right, { start: L.noon, jumps: [[L.t8Hour, "19:00"], [L.noon, "12:00"]], onChange: function (t) { show(t); } });
          var kp = E("div", { class: "m1-kpis" }, right);
          function show(t) {
            if (!Bcur) return;
            var h = Bcur.hours[t], lim = limits(D, oB(bLimit));
            net.set({ h: h, lim: lim });
            kp.innerHTML = ""; var rr = rent(D, h);
            kpi(kp, "Prices", D.buses.map(function (b) { return money(h.price[b.id]); }).join(" · ")); kpi(kp, "Congestion rent", money(rr.rent) + "/h");
            if (t === L.t8Hour) {
              var nh = Bcur.hours[L.noon], rn = rent(D, nh);
              api.done();
              api.saw(h.full.RT ? "At 19:00 the line is full too, at this limit: try a higher limit in step 8 to see lesson 8's single price return." :
                "At 19:00 the line carries " + Math.round(h.flow.RT) + " of its " + lim.RT + " MW: one price, " + money(h.price.T) + ", as in lesson 8. At noon the town pays " + money(nh.price.T) + " while the Ridge is paid " + money(nh.price.R) + "; the gap, the [[congestion-rent|congestion rent]], is " + money(rn.rent) + " that hour.");
            }
          }
          show(L.noon);
        } }
    ];

    var cardsHost = E("div", { class: "m1-cards" }, live);
    var cards = LX.StepCards(cardsHost, { id: "m1-steps", steps: steps, onStep: function (i) {
      if (i === 0) { try { LX.solver.preload(); } catch (e) { /* the first solve loads it */ } }
      if (i === steps.length - 1) remember("reached", true);
    } });
    // demo states (core.js LX.demo): "mid" = step 2 with the day solved; "step-N" opens card N
    LX.demo(root, function (state) {
      if (state !== "mid") return null;
      cards.go(1); var b = cardsHost.querySelector(".lx-step-act .lx-btn"); if (b) b.click();
      return { view: "solved" };
    }, cards);
    explain();
  });

  // ---------------------------------------------------------------- explain layer: the model in full, the annotated network, one price or three
  function explain() {
    var x = document.getElementById("m1-explain");
    if (!x) return;
    LX.json(LX.base + "data/m01-dispatch-to-lmp.json").then(function (D) {
      x.innerHTML = "";
      var own = LX.store.get(KEY, {}) || {}, R = D.reference, ownLimit = own.limit;
      // 1 the model in full
      var c1 = E("div", { class: "lx-xcard" }, x), h1 = E("header", { class: "lx-x-head" }, c1);
      E("h3", { text: "The model in full" }, h1);
      E("p", { class: "lx-lede", text: "The same eight rules three ways. The table says how many rows each rule adds and what its dual means." }, c1);
      LX.Formulation(c1, { view: "table", sel: "bal", full: true, hours: D.day.demand.length, legend: LEGEND, tagWidth: "9.5em", extraNote: "(added when the plants go on the map)",
        rules: RULES.map(function (r) { return { id: r.id, name: r.name, words: r.words, sym: r.sym, symBase: r.sym1, rows: r.rows, dual: r.dual, extra: r.net }; }) });
      // 2 the network at noon, annotated
      var c2 = E("div", { class: "lx-xcard" }, x), h2 = E("header", { class: "lx-x-head" }, c2);
      E("h3", { text: "The network at noon, annotated" }, h2);
      E("p", { class: "m1-tag", text: "Numbers: " + R.label + (ownLimit && ownLimit !== R.limit ? " (you stopped at " + ownLimit + " MW; this card keeps the 110 MW case)" : "") + "." }, c2);
      var an = E("div", { class: "m1-anno" }, c2);
      var net = Network(E("div", null, an), { D: D });
      var h = { t: R.hour, price: R.price, flow: R.flow, full: { RT: true, RG: false, GT: false }, mu: { RT: R.mu, RG: 0, GT: 0 } };
      net.set({ h: h, lim: limits(D, { limit: R.limit }), sel: "T" });
      var ol = E("ol", null, E("div", null, an));
      [["A full line.", "Ridge–Town carries its " + R.limit + " MW limit. Its dual: 1 MW more limit would save " + money(R.mu) + " that hour."],
       ["Ridge: " + money(R.price.R) + ".", "Wind and solar spill " + (R.ridgeAvail - R.ridge) + " MW of " + R.ridgeAvail + " MW; one more MWh there is free."],
       ["Gas Hub: " + money(R.price.G) + ".", "The combined-cycle plant runs at " + R.cc + " MW with room to spare; it serves one more MWh at its own cost."],
       ["Town: " + money(R.price.T) + ".", "2 MWh more gas and 1 MWh less from the Ridge keep the full line's flow fixed: 2 × $40 − 1 × $0."],
       ["Rent.", "Town pays " + money(R.price.T) + ", generators earn less; the difference, " + money(R.rent) + " an hour, equals μ × limit."]].forEach(function (a) {
        var li = E("li", null, ol); E("b", { text: a[0] + " " }, li); li.appendChild(document.createTextNode(a[1]));
      });
      // 3 one price or three
      var c3 = E("div", { class: "lx-xcard" }, x);
      LX.CompareTable(c3, { title: "One price or three",
        columns: [{ key: "name", label: "Model", main: true }, { key: "rows", label: "Balance rows per hour", num: true, phoneHide: true },
          { key: "p19", label: "Price at 19:00", num: true, phone: "19:00" }, { key: "p12", label: "Prices at noon", num: true, phone: "Noon" }],
        rows: [{ key: "t8", color: "var(--lx-ink-3)", name: "Lesson 8: one bus", note: "No lines; the last plant needed sets one price", rows: "1", p19: "$40", p12: "one price" },
          { key: "a", color: "var(--lx-ink)", name: "This lesson, part A", note: "One bus, 24 hours, ramp rule", rows: "1", p19: "$40", p12: "$40" },
          { key: "b", color: "var(--lx-bad)", name: "This lesson, part B", note: "Three buses; Ridge–Town line at " + R.limit + " MW", rows: "3", p19: "$40 at all three", p12: money(R.price.R) + " · " + money(R.price.G) + " · " + money(R.price.T) }],
        sorts: [{ label: "As built", order: ["t8", "a", "b"], note: "Prices split only where the network binds; at 19:00 the line has room and all three models agree." }] });
    });
  }
})();
