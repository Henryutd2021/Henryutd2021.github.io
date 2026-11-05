// m08-stochastic-robust.js — Modeler lesson M8, "Deciding before the uncertainty resolves: stochastic and robust
// optimization" (model-lab: step cards with solver runs), wave W4, builder learn-w4-d, 2026-11-05.
//
// Data: assets/learn/data/m08-stochastic-robust.json (the windy zone, the three build-outs, the five wind blocks, the
// electrolyzer and the hydrogen, and a reference block written by the test).
//
// The toy (illustrative round numbers in 2025 dollars, not any study's inputs or results). A windy zone has W MW of wind;
// its lines take at most A = 1,000 MW, so in wind block b (h_b hours a year at capacity factor f_b) the surplus is
//   sigma_{s,b} = max(0, W_s f_b - A)                                       MW, curtailed unless an electrolyzer uses it
// Here and now: the electrolyzer's size x (MW), at c = $80,000 per MW a year. Later, in each build-out s (none, half or
// all of the 4,000 MW of planned wind; chances 25%, 50%, 25%) and each block b: the electrolyzer's power e_{s,b} (MW) and
// the hydrogen bought from gas reformers r_{s,b} (kg an hour) at $1.50 per kg. The extensive form (one linear program):
//   min  c x + sum_s p_s sum_b h_b 1.50 r_{s,b}
//   s.t. 18 e_{s,b} + r_{s,b} = 54,000      ("h2_<s>_<b>": industry's hydrogen every hour; 18 kg per MWh)
//        e_{s,b} - x <= 0                   ("cap_<s>_<b>": no more than the electrolyzer's size)
//        0 <= e_{s,b} <= sigma_{s,b},  r >= 0, x >= 0
// 31 columns and 30 rows. The same builder gives the wait-and-see problems (one build-out, chance 1), the expected-value
// problem (one build-out at the mean wind), a plan priced in every branch (x fixed), the worst-case robust plan
// (min z, z >= each branch's cost) and the least-regret plan (z >= each branch's cost minus its wait-and-see cost).
// Closed form (for the test and the chart): with one size and no storage, the cost of size x in branch s is
//   cost_s(x) = c x + 1.50 (54,000 x 8,760 - 18 sum_b h_b min(x, sigma_{s,b}))
// piecewise linear in x; an extra MW pays while it runs more than c / (1.50 x 18) = 2,963 hours a year (the critical
// hours; on average over the branches for the stochastic plan).
// Ties (W2 review finding 2): every size the page reports is the only best size. Given a size, each branch's operation is
// unique (every MWh of surplus used saves $27), so every cost shown is unique. The robust LPs fix only the size; each
// plan's branch costs come from re-solving with the size fixed. _tests/learn/test_m08-stochastic-robust.js proves each
// size unique (a size 1 MW larger or smaller costs more) and recomputes every number from the closed form.
(function () {
  "use strict";
  var HOURS = 8760;

  // ---------------------------------------------------------------- pure model (no DOM; exported for Node)
  function r6(v) { return Math.round(v * 1e6) / 1e6; }
  // the branches, with their wind; p: optional chances (a preset) in the data's order
  function scen(D, p) {
    return D.scenarios.map(function (s, i) {
      return { id: s.id, label: s.label, short: s.short, completion: s.completion, p: p ? p[i] : s.p, W: D.wind.existingMW + s.completion * D.wind.plannedMW };
    });
  }
  function meanW(S) { return r6(S.reduce(function (a, s) { return a + s.p * s.W; }, 0)); }
  function surplus(D, W, b) { return Math.max(0, r6(W * D.blocks.cf[b] - D.zone.lineMW)); }
  function capMW(D) { return D.hydrogen.demandKgPerHour / D.electrolyzer.kgPerMWh; }
  function value(D) { return D.hydrogen.reformerPerKg * D.electrolyzer.kgPerMWh; }           // $ saved per MWh of surplus used
  function critHours(D) { return D.electrolyzer.costPerMWYear / value(D); }
  function base(D) { return D.hydrogen.reformerPerKg * D.hydrogen.demandKgPerHour * HOURS; }  // reformers only, a year
  function used(D, W, x) { var e = 0; for (var b = 0; b < D.blocks.hours.length; b++) e += D.blocks.hours[b] * Math.min(x, surplus(D, W, b), capMW(D)); return e; }
  function cost(D, W, x) { return D.electrolyzer.costPerMWYear * x + D.hydrogen.reformerPerKg * (D.hydrogen.demandKgPerHour * HOURS - D.electrolyzer.kgPerMWh * used(D, W, x)); }
  function expected(D, S, x) { return S.reduce(function (a, s) { return a + s.p * cost(D, s.W, x); }, 0); }
  function worst(D, S, x) { return Math.max.apply(null, S.map(function (s) { return cost(D, s.W, x); })); }
  function regret(D, S, x, ws) { return Math.max.apply(null, S.map(function (s) { return cost(D, s.W, x) - ws[s.id]; })); }
  function hoursAbove(D, W, x) { var h = 0; for (var b = 0; b < D.blocks.hours.length; b++) if (surplus(D, W, b) > x + 1e-9 && x < capMW(D)) h += D.blocks.hours[b]; return h; }
  function expHoursAbove(D, S, x) { return S.reduce(function (a, s) { return a + s.p * hoursAbove(D, s.W, x); }, 0); }
  // every kink of the branches' cost curves up to xMax, with 0 and xMax
  function kinks(D, S, xMax) {
    var k = [0, xMax];
    S.forEach(function (s) { for (var b = 0; b < D.blocks.cf.length; b++) { var v = surplus(D, s.W, b); if (v > 0 && v < xMax) k.push(v); } });
    return k.sort(function (a, b) { return a - b; }).filter(function (v, i, a) { return i === 0 || v - a[i - 1] > 1e-9; });
  }
  // the closed-form best size of the expected cost (any tree, or one branch with chance 1), with the expected hours an
  // extra MW would run just below and just above it; none of these numbers is shown before the solver gives its own
  function closedBest(D, S) {
    var best = null;
    kinks(D, S, capMW(D)).forEach(function (x) { var f = expected(D, S, x); if (!best || f < best.cost - 1e-6) best = { x: x, cost: f }; });
    best.below = best.x > 0 ? expHoursAbove(D, S, best.x - 1e-6) : null; best.above = expHoursAbove(D, S, best.x + 1e-6);
    return best;
  }
  // the linear program. o.mode: "expected" (default; the stochastic program, or a wait-and-see or expected-value problem
  // when S holds one branch with chance 1), "worst" (min z, z >= every branch's cost) or "regret" (z >= cost - o.ws[id]);
  // o.fix: the size fixed (a plan priced in every branch)
  function build(D, S, o) {
    o = o || {};
    var mode = o.mode || "expected", B = D.blocks.hours.length, k = D.electrolyzer.kgPerMWh, Dh = D.hydrogen.demandKgPerHour, cr = D.hydrogen.reformerPerKg, cx = D.electrolyzer.costPerMWYear;
    var vars = [{ name: "x", lb: o.fix != null ? o.fix : 0, ub: o.fix != null ? o.fix : Infinity, cost: mode === "expected" ? cx : 0 }], cons = [];
    if (mode !== "expected") vars.push({ name: "z", lb: -Infinity, cost: 1 });
    S.forEach(function (s) {
      var row = { x: cx };
      for (var b = 0; b < B; b++) {
        var e = "e_" + s.id + "_" + b, r = "r_" + s.id + "_" + b, c1 = {}, c2 = {};
        vars.push({ name: e, ub: surplus(D, s.W, b) }, { name: r, cost: mode === "expected" ? s.p * D.blocks.hours[b] * cr : 0 });
        c1[e] = 1; c1.x = -1; cons.push({ name: "cap_" + s.id + "_" + b, terms: c1, le: 0 });
        c2[e] = k; c2[r] = 1; cons.push({ name: "h2_" + s.id + "_" + b, terms: c2, eq: Dh });
        row[r] = D.blocks.hours[b] * cr;
      }
      if (mode !== "expected") { row.z = -1; cons.push({ name: "z_" + s.id, terms: row, le: mode === "regret" ? o.ws[s.id] : 0 }); }
    });
    return { sense: "min", variables: vars, constraints: cons };
  }
  // a solved LP: the size and, for each branch, its cost from the solution (meaningful in "expected" mode, where every
  // branch's operation is priced; the robust modes are re-solved with the size fixed)
  function read(D, S, r) {
    if (!r || !r.ok || !r.values) return null;
    var x = r.values.x; x = Math.abs(x) < 1e-7 ? 0 : r6(x);
    var per = {};
    S.forEach(function (s) {
      var c = D.electrolyzer.costPerMWYear * x;
      for (var b = 0; b < D.blocks.hours.length; b++) c += D.blocks.hours[b] * D.hydrogen.reformerPerKg * r.values["r_" + s.id + "_" + b];
      per[s.id] = c;
    });
    return { x: x, obj: r.objective, per: per };
  }
  // step 2's verdict on the reader's size: true for every size (tested on every step of the slider)
  function lockWords(D, S, v) {
    var c = S.map(function (s) { return cost(D, s.W, v); });
    if (v === 0) return "With no electrolyzer, every branch costs " + fm.m(c[0]) + " a year: all the hydrogen comes from gas reformers.";
    return "Your " + fm.mw(v) + ": expected " + fm.m(expected(D, S, v)) + " a year. It costs most, " + fm.m(c[0]) + ", if none of the planned wind is built, and least, " + fm.m(c[2]) + ", if all of it is.";
  }
  function presetS(D, id) { var p = D.presets.filter(function (q) { return q.id === id; })[0]; return scen(D, p ? p.p : null); }
  var fm = {
    m: function (v) { return (v < -5e3 ? "−$" : "$") + (Math.abs(v) / 1e6).toFixed(2) + "M"; },
    mw: function (x) { var r = Math.round(x * 10) / 10; return (Math.abs(r - Math.round(r)) < 1e-9 ? Math.round(r).toLocaleString("en-US") : r.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })) + " MW"; },
    pct: function (p) { return Math.round(p * 100) + "%"; },
    int: function (v) { return Math.round(v).toLocaleString("en-US"); }
  };
  // the steps' no-JS block (written into the page by the test's --write mode)
  function staticHTML(D, R) {
    var S = scen(D), th = S.map(function (s) { return "<th scope=\"col\">" + s.short + "</th>"; }).join("");
    var row = function (name, p) { return "<tr><th scope=\"row\">" + name + "</th><td class=\"n\">" + fm.mw(p.x) + "</td>" + S.map(function (s) { return "<td class=\"n\">" + fm.m(p.per[s.id]) + "</td>"; }).join("") + "<td class=\"n\">" + fm.m(p.exp) + "</td></tr>"; };
    return "<p class=\"lx-eyebrow\">One electrolyzer, sized before the wind is built (illustrative)</p>\n" +
      "<div class=\"lx-scroll-x\"><table class=\"lx-facts m8-fb\"><caption class=\"lx-hint\">Annual cost of the hydrogen supply (electrolyzer plus gas reformers), 2025 dollars</caption>" +
      "<thead><tr><th scope=\"col\">Plan</th><th scope=\"col\">Size</th>" + th + "<th scope=\"col\">Expected</th></tr></thead><tbody>\n" +
      row("Worst case (robust)", R.rob) + "\n" + row("Stochastic program", R.sp) + "\n" + row("Least regret", R.reg) + "\n" + row("Plan for the average", R.ev) + "\n</tbody></table></div>\n" +
      "<ul>\n<li>Wait and see, one plan per branch: " + S.map(function (s) { return fm.mw(R.ws[s.id].x) + " (" + s.short.toLowerCase() + ")"; }).join(", ") + ".</li>\n" +
      "<li>Value of the stochastic solution: " + fm.m(R.ev.exp) + " − " + fm.m(R.sp.exp) + " = " + fm.m(R.vss) + " a year.</li>\n" +
      "<li>Expected value of perfect information: " + fm.m(R.sp.exp) + " − " + fm.m(R.wsExp) + " = " + fm.m(R.evpi) + " a year.</li>\n</ul>";
  }

  var model = { HOURS: HOURS, scen: scen, meanW: meanW, surplus: surplus, capMW: capMW, value: value, critHours: critHours, base: base, used: used, cost: cost,
    expected: expected, worst: worst, regret: regret, hoursAbove: hoursAbove, expHoursAbove: expHoursAbove, kinks: kinks, closedBest: closedBest,
    build: build, read: read, presetS: presetS, lockWords: lockWords, fm: fm, staticHTML: staticHTML };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX || !window.LX.H) return;

  // ================================================================ the page
  var LX = window.LX, H = LX.H, SLUG = "m08-stochastic-robust", KEY = "m8-own";
  LX.m08 = model;   // lesson-local: case file CF3 reuses the closed form (reported for promotion)
  var COL = { low: "var(--lx-warn)", mid: "var(--lx-wind)", high: "var(--lx-tier-2)" }, DASH = { low: "7 4", mid: null, high: "2 4" };

  // ---- i-tree: the decision now, three branches with their chances, the operation later (lesson-local)
  function Tree(host, S, o) {
    var w = H("div", { class: "m8-tree", role: "group", "aria-label": "Scenario tree: one size now, then three build-outs" }, host);
    var root = H("div", { class: "m8-root" }, w);
    H("b", { text: "Now: size the electrolyzer" }, root); H("span", { class: "m8-sub", text: o.rootText || "x MW, one size for every branch" }, root);
    var ol = H("ol", { class: "m8-branches" }, w), btns = [], costs = [];
    S.forEach(function (s, i) {
      var li = H("li", { style: "--c:" + COL[s.id] }, ol);
      var b = H("button", { type: "button", class: "m8-br", "aria-pressed": "false" }, li);
      H("span", { class: "m8-p", text: "chance " + fm.pct(s.p) }, b);
      H("b", { text: s.short }, b);
      H("span", { class: "m8-sub", text: fm.int(s.W) + " MW of wind" }, b);
      costs.push(H("span", { class: "m8-cost" }, b));
      b.addEventListener("click", function () { if (o.onPick) o.onPick(i); });
      btns.push(b);
    });
    H("p", { class: "m8-later", text: "Later, in each branch: run through the year's five wind blocks." }, w);
    return {
      el: w,
      sel: function (i) { btns.forEach(function (b, j) { b.setAttribute("aria-pressed", String(j === i)); }); },
      costs: function (list) { costs.forEach(function (c, i) { c.textContent = list ? list[i] : ""; }); },
      chances: function (S2) { btns.forEach(function (b, i) { b.querySelector(".m8-p").textContent = "chance " + fm.pct(S2[i].p); }); }
    };
  }

  LX.mount("m08", function (live, data, root) {
    var D = data.m08_stochastic_robust, R = D.reference, S = scen(D);
    var own = LX.store.get(KEY, {}) || {};
    var St = { ws: {}, ev: null, sp: null, rob: null, reg: null, pre: {}, guess: typeof own.guess === "number" ? own.guess : null };
    function remember() { LX.store.set(KEY, { guess: St.guess }); }
    function lp(m, key) { return LX.solver.solve(m, { timeLimit: 5, key: "m8-" + key, label: "m8" }); }
    // each job resolves to null (solved) or the failed result; results already solved are kept (W2 finding 1)
    function priced(S2, x) { return lp(build(D, S2, { fix: x }), "fix" + x).then(function (r) { var o = read(D, S2, r); return o ? { r: r, o: o } : { r: r }; }); }
    function jobWS() {
      return S.reduce(function (pr, s) {
        return pr.then(function (bad) {
          if (bad || St.ws[s.id]) return bad;
          var one = [Object.assign({}, s, { p: 1 })];
          return lp(build(D, one), "ws-" + s.id).then(function (r) { var o = read(D, one, r); if (!o) return r; St.ws[s.id] = { x: o.x, cost: r.objective }; return null; });
        });
      }, Promise.resolve(null));
    }
    function wsExp() { return S.reduce(function (a, s) { return a + s.p * St.ws[s.id].cost; }, 0); }
    function jobEV(S2, slot) {
      S2 = S2 || S; slot = slot || "ev";
      var have = slot === "ev" ? St.ev : St.pre[slot] && St.pre[slot].ev;
      if (have) return Promise.resolve(null);
      var one = [{ id: "ev", p: 1, W: meanW(S2) }];
      return lp(build(D, one), "ev-" + slot).then(function (r) {
        var o = read(D, one, r); if (!o) return r;
        return priced(S2, o.x).then(function (q) {
          if (!q.o) return q.r;
          var ev = { W: one[0].W, x: o.x, own: r.objective, per: q.o.per, exp: q.r.objective };
          if (slot === "ev") St.ev = ev; else (St.pre[slot] = St.pre[slot] || {}).ev = ev;
          return null;
        });
      });
    }
    function jobSP(S2, slot) {
      S2 = S2 || S; slot = slot || "sp";
      if (slot === "sp" ? St.sp : St.pre[slot] && St.pre[slot].sp) return Promise.resolve(null);
      return lp(build(D, S2), "sp-" + slot).then(function (r) {
        var o = read(D, S2, r); if (!o) return r;
        var sp = { x: o.x, exp: r.objective, per: o.per };
        if (slot === "sp") St.sp = sp; else (St.pre[slot] = St.pre[slot] || {}).sp = sp;
        return null;
      });
    }
    function jobRobust(mode) {
      if (St[mode === "worst" ? "rob" : "reg"]) return Promise.resolve(null);
      var first = mode === "regret" ? jobWS() : Promise.resolve(null);
      return first.then(function (bad) {
        if (bad) return bad;
        var ws = {}; S.forEach(function (s) { if (St.ws[s.id]) ws[s.id] = St.ws[s.id].cost; });
        return lp(build(D, S, { mode: mode, ws: ws }), mode).then(function (r) {
          var o = read(D, S, r); if (!o) return r;
          return priced(S, o.x).then(function (q) {
            if (!q.o) return q.r;
            var res = { x: o.x, z: r.objective, per: q.o.per, exp: q.r.objective };
            res.worst = Math.max.apply(null, S.map(function (s) { return res.per[s.id]; }));
            if (mode === "worst") St.rob = res; else St.reg = res;
            return null;
          });
        });
      });
    }
    function chain(list) { return list.reduce(function (p, f) { return p.then(function (bad) { return bad || f(); }); }, Promise.resolve(null)); }
    function action(o) { o.cls = "m8-fail"; return LX.SolveStep.action(o); }
    function solveRow(act, api, label, job, show) {
      var row = H("div", { class: "m8-row" }, act), go = H("button", { type: "button", class: "lx-btn small", html: LX.icon("play") + label }, row), st = LX.SolverStatus(row), out = H("div", { "aria-live": "polite" }, act);
      go.addEventListener("click", action({ api: api, st: st, host: act, go: go, job: job, show: function () { st.set(""); show(out); draw(); } }));
      return go;
    }
    function kpi(host, label, v, tone) { var k = H("div", { class: "m8-kpi" + (tone ? " " + tone : "") }, host); H("small", { text: label }, k); H("b", { text: v }, k); return k; }
    function table(host, head, rows, label, cls) {
      var w = H("div", { class: "m8-tbl" + (cls ? " " + cls : ""), tabindex: "0", role: "region", "aria-label": label }, host), t = H("table", null, w), hr = H("tr", null, H("thead", null, t));
      head.forEach(function (x) { H("th", { scope: "col", text: x }, hr); });
      var bd = H("tbody", null, t); rows.forEach(function (r) { var tr = H("tr", null, bd); r.forEach(function (c, i) { H(i ? "td" : "th", i ? { text: c } : { scope: "row", text: c }, tr); }); });
      return w;
    }
    var perRow = function (name, p) { return [name, fm.mw(p.x)].concat(S.map(function (s) { return fm.m(p.per[s.id]); }), [fm.m(p.exp)]); };
    var perHead = ["Plan", "Size"].concat(S.map(function (s) { return s.short; }), ["Expected"]);

    var steps = [
      // 1 the tree
      { text: "The windy zone has 3,000 MW of wind, 4,000 MW more is planned, and its lines carry 1,000 MW. Tap each branch of the [[scenario-tree|scenario tree]]: how much surplus wind does each build-out leave?",
        build: function (act, api) {
          var seen = {}, out = H("div", { "aria-live": "polite" }, act);
          var t = Tree(act, S, { onPick: function (i) {
            var s = S[i]; seen[s.id] = 1; t.sel(i); out.innerHTML = "";
            table(out, ["Wind block", "Hours a year", "Wind output", "Surplus"], D.blocks.hours.map(function (h, b) {
              return [D.blocks.labels[b], fm.int(h), fm.int(s.W * D.blocks.cf[b]) + " MW", fm.int(surplus(D, s.W, b)) + " MW"];
            }), s.short + ": wind and surplus by block", "m8-blk");
            H("p", { class: "m8-note", text: s.label + " (" + fm.int(s.W) + " MW): surplus = output − 1,000 MW, or 0." }, out);
            if (Object.keys(seen).length === S.length) {
              api.done();
              api.saw("The largest surplus is " + fm.int(surplus(D, S[0].W, 0)) + " MW with none of the planned wind built and " + fm.int(surplus(D, S[2].W, 0)) + " MW with all of it. **The electrolyzer must be sized before anyone knows the branch.**");
            }
          } });
        } },
      // 2 the reader's own size, here and now
      { text: "Choose a size now, as the planner must: a [[here-and-now|here-and-now]] decision. The chart below gives its cost a year in each branch, and the expected cost with the branches' chances.",
        build: function (act, api) {
          var k = H("div", { class: "m8-kpis", "aria-live": "polite" }, act), x0 = St.guess != null ? St.guess : 600;
          var sl = LX.Slider(act, { label: "Electrolyzer size", min: 0, max: D.chart.xMax, step: D.chart.step, value: x0, color: "var(--lx-good)",
            fmt: function (v) { return fm.int(v) + " MW"; }, onChange: function (v) { paint(v); } });
          function paint(v) {
            k.innerHTML = ""; S.forEach(function (s) { kpi(k, s.short, fm.m(cost(D, s.W, v))); }); kpi(k, "Expected", fm.m(expected(D, S, v)), "main");
            draw(v);
          }
          var row = H("div", { class: "m8-row" }, act);
          H("button", { type: "button", class: "lx-btn small", text: "Lock in this size", onclick: function () {
            var v = sl.val(); St.guess = v; remember(); draw();
            api.done();
            api.saw(lockWords(D, S, v));
          } }, row);
          paint(x0);
        } },
      // 3 wait and see
      { text: "If you knew the build-out, you could size for it. Solve the three [[wait-and-see|wait-and-see]] problems: one linear program per branch, with that branch's chance set to 1.",
        build: function (act, api) {
          solveRow(act, api, "Solve the three branches", jobWS, function (out) {
            out.innerHTML = "";
            table(out, ["Branch", "Best size", "Its cost a year"], S.map(function (s) { return [s.short, fm.mw(St.ws[s.id].x), fm.m(St.ws[s.id].cost)]; }), "Wait-and-see plans");
            var xs = S.map(function (s) { return fm.mw(St.ws[s.id].x); });
            api.done(); api.saw("Knowing the future, you would build " + xs.slice(0, -1).join(", ") + " or " + xs[xs.length - 1] + ". **No one size is best in every branch.**");
          });
        } },
      // 4 the plan for the average future
      { text: "A common shortcut: plan for the average future, 5,000 MW of wind here. Solve this [[expected-value-problem|expected-value problem]], then price its plan in every branch.",
        build: function (act, api) {
          solveRow(act, api, "Solve, then price the plan", function () { return jobEV(); }, function (out) {
            out.innerHTML = ""; var e = St.ev, k = H("div", { class: "m8-kpis" }, out);
            kpi(k, "Its size", fm.mw(e.x)); kpi(k, "What it expects", fm.m(e.own)); kpi(k, "Expected over the branches", fm.m(e.exp), "bad");
            table(out, perHead, [perRow("Plan for the average", e)], "The plan for the average, priced in every branch");
            api.done(); api.saw("It builds " + fm.mw(e.x) + " and expects " + fm.m(e.own) + " a year. Over the three branches it costs " + fm.m(e.exp) + ": **the cost of the average future is not the expected cost.**");
          });
        } },
      // 5 the stochastic program
      { text: "The [[two-stage-stochastic-program|two-stage stochastic program]] chooses one size and each branch's operation together, weighting each branch's cost by its chance. Solve it.",
        build: function (act, api) {
          solveRow(act, api, "Solve the stochastic program", function () { return jobSP(); }, function (out) {
            out.innerHTML = ""; var p = St.sp, k = H("div", { class: "m8-kpis" }, out), m = build(D, S);
            kpi(k, "Size", fm.mw(p.x), "good"); kpi(k, "Expected cost", fm.m(p.exp)); kpi(k, "LP size", m.variables.length + " columns × " + m.constraints.length + " rows");
            table(out, perHead, [perRow("Stochastic program", p)], "The stochastic plan in every branch");
            api.done(); api.saw("It builds " + fm.mw(p.x) + ". Above that, an extra MW would run too few hours, averaged over the branches, to pay its $80,000 a year.");
          });
        } },
      // 6 the value of the stochastic solution
      { text: "Predict: the [[value-of-stochastic-solution|value of the stochastic solution]] is the average plan's expected cost minus the stochastic plan's. Is it positive, zero or negative?",
        build: function (act, api) {
          var out = H("div", { "aria-live": "polite" }, act), st = LX.SolverStatus(act), pr;
          var go = action({ api: api, st: st, host: act, go: null, job: function () { return chain([function () { return jobEV(); }, function () { return jobSP(); }]); }, show: function () {
            st.set(""); var v = St.ev.exp - St.sp.exp; draw();
            pr.reveal("VSS = " + fm.m(St.ev.exp) + " − " + fm.m(St.sp.exp) + " = " + fm.m(v) + " a year.");
            api.done(); api.saw("It is " + fm.m(v) + " a year. **It cannot be negative**: the stochastic program picks the best single size, and the average's plan is one of the sizes it could pick.");
          } });
          pr = LX.Predict(act, { id: "m8-vss", fresh: true, q: "The value of the stochastic solution here is…", answer: "pos",
            options: [{ value: "pos", label: "positive" }, { value: "zero", label: "zero" }, { value: "neg", label: "negative" }],
            feedback: { pos: "Right: planning with the branches beats planning for their average.", zero: "Zero only if both plans cost the same in expectation; here they differ.", neg: "It cannot be negative: the stochastic plan is the cheapest single size in expectation." },
            onPick: function () { go(); } });
          act.appendChild(out);
        } },
      // 7 the expected value of perfect information
      { text: "A perfect forecast would let you wait and see. Compute the [[evpi|expected value of perfect information]]: the stochastic plan's expected cost minus the chance-weighted wait-and-see costs.",
        build: function (act, api) {
          var st = LX.SolverStatus(act), box = H("div", null, act);
          var go = action({ api: api, st: st, host: act, go: null, job: function () { return chain([jobWS, function () { return jobSP(); }]); }, show: function () {
            st.set(""); box.innerHTML = ""; draw();
            table(box, ["Plan", "Chance", "Annual cost"], [["Stochastic program, expected", "", fm.m(St.sp.exp)]].concat(S.map(function (s) { return ["Wait and see: " + s.short.toLowerCase(), fm.pct(s.p), fm.m(St.ws[s.id].cost)]; })), "Numbers for the expected value of perfect information");
            var ans = Math.round((St.sp.exp - wsExp()) / 1e4) / 100, tries = 0;
            var na = LX.NumAnswer(box, { label: "EVPI, in $M a year", unit: "$M", accept: ["M", "million"], width: "7em", onCheck: function (v) {
              if (v == null) return; tries++;
              var good = LX.NumAnswer.close(v, ans, 0.05);
              na.msg.textContent = good ? "Right." : tries < 2 ? "Not yet: weight each wait-and-see cost by its chance, add them, and subtract from the stochastic plan's cost." : "The answer is below.";
              if (good || tries >= 2) {
                api.done(); api.saw("EVPI = " + fm.m(St.sp.exp) + " − " + fm.m(wsExp()) + " = " + fm.m(St.sp.exp - wsExp()) + " a year: the most a planner who weighs only expected cost should pay for a perfect forecast of the build-out, under these chances.");
              }
            } });
          } });
          go();
        } },
      // 8 robust: the worst case
      { text: "A [[robust-optimization|robust]] plan uses no chances: it picks the size whose worst cost over the set of build-outs is lowest. Solve it.",
        build: function (act, api) {
          solveRow(act, api, "Solve the worst-case plan", function () { return chain([function () { return jobRobust("worst"); }, function () { return jobSP(); }]); }, function (out) {
            out.innerHTML = ""; var p = St.rob, k = H("div", { class: "m8-kpis" }, out);
            kpi(k, "Size", fm.mw(p.x), "good"); kpi(k, "Worst cost", fm.m(p.worst)); kpi(k, "Expected cost", fm.m(p.exp));
            table(out, perHead, [perRow("Worst case (robust)", p)], "The worst-case plan in every branch");
            api.done(); api.saw("It builds " + fm.mw(p.x) + ", the best size if none of the planned wind is built: here a size costs no more when more wind is built, so its worst cost is its cost in that branch. It costs " + fm.m(p.exp - St.sp.exp) + " a year more in expectation than the stochastic plan.");
          });
        } },
      // 9 robust: least regret
      { text: "A second robust rule uses [[regret|regret]]: a size's cost in a branch minus that branch's wait-and-see cost. Solve for the size whose largest regret is smallest.",
        build: function (act, api) {
          solveRow(act, api, "Solve the least-regret plan", function () { return jobRobust("regret"); }, function (out) {
            out.innerHTML = ""; var p = St.reg, k = H("div", { class: "m8-kpis" }, out), rg = S.map(function (s) { return p.per[s.id] - St.ws[s.id].cost; });
            kpi(k, "Size", fm.mw(p.x), "good"); kpi(k, "Largest regret", fm.m(Math.max.apply(null, rg))); kpi(k, "Expected cost", fm.m(p.exp));
            table(out, ["Branch", "Cost", "Wait-and-see cost", "Regret"], S.map(function (s, i) { return [s.short, fm.m(p.per[s.id]), fm.m(St.ws[s.id].cost), fm.m(rg[i])]; }), "Regret of the least-regret plan in each branch");
            api.done(); api.saw("It builds " + fm.mw(p.x) + ": there the regret of too much electrolyzer, if none of the planned wind is built, equals the regret of too little, if all of it is: " + fm.m(rg[0]) + " a year each.");
          });
        } },
      // 10 the chances are a judgement
      { text: "The chances are a judgement. Re-solve with a pessimistic or an optimistic tree: which plans move, and which stay?",
        build: function (act, api) {
          var seg = H("div", { class: "lx-seg", role: "group", "aria-label": "Chances of the three branches" }, act), bs = [], seen = {}, sel = null;
          var st = LX.SolverStatus(act), out = H("div", { "aria-live": "polite" }, act);
          var go = action({ api: api, st: st, host: act, go: null,
            job: function () { var S2 = presetS(D, sel); return chain([function () { return jobSP(S2, sel); }, function () { return jobEV(S2, sel); }, function () { return jobRobust("worst"); }]); },
            show: function () {
              st.set(""); seen[sel] = 1; out.innerHTML = ""; draw();
              bs.forEach(function (b, i) { b.setAttribute("aria-pressed", String(D.presets[i].id === sel)); });
              var rows = D.presets.filter(function (q) { return St.pre[q.id] && St.pre[q.id].sp && St.pre[q.id].ev; }).map(function (q) {
                return [q.label + " (" + q.p.map(fm.pct).join(", ") + ")", fm.mw(St.pre[q.id].sp.x), fm.mw(St.pre[q.id].ev.x), fm.mw(St.rob.x)];
              });
              table(out, ["Chances", "Stochastic", "For the average", "Worst case"], rows, "Plans under three sets of chances");
              if (Object.keys(seen).length >= 2) {
                api.done(); api.saw("The stochastic plan and the plan for the average move with the chances; the worst-case plan stays at " + fm.mw(St.rob.x) + ", because it does not use them. So does the least-regret plan.");
              }
            } });
          D.presets.forEach(function (q) { bs.push(H("button", { type: "button", "aria-pressed": "false", text: q.label + " " + q.p.map(fm.pct).join("/"), onclick: function () { sel = q.id; go(); } }, seg)); });
        } },
      // 11 formulate it
      { text: "You built a two-stage stochastic linear program and three ways to plan with it. The explain layer writes the model out; the notebook rebuilds it in Python.",
        free: true,
        build: function (act) { H("a", { class: "lx-btn small", style: "justify-self:start", href: "#explain", html: "The model, symbol by symbol" + LX.icon("arrow") }, act); LX.progress.done(SLUG); } }
    ];

    var cardsHost = H("div", null, live);
    var cards = LX.StepCards(cardsHost, { id: "m8-steps", steps: steps, onStep: function (i) { if (i === 2) { try { LX.solver.preload(); } catch (e) { /* the first solve loads it */ } } } });

    // ---- the cost curves, under the cards: three branches and the expected cost, with the plans found so far
    var chartHost = H("div", { class: "lx-card m8-chart" }, live);
    H("p", { class: "lx-eyebrow", text: "Annual cost against the electrolyzer's size (illustrative)" }, chartHost);
    var PL = LX.Plot(chartHost, { box: true, text: "Text version of the chart" });
    var keyEl = H("ul", { class: "m8-key", "aria-live": "polite" }, chartHost);
    var cur = null;
    function draw(x) {
      if (x != null) cur = x;
      var xMax = D.chart.xMax, ks = kinks(D, S, xMax), lines = [], marks = [], key = [];
      S.forEach(function (s) { lines.push({ pts: ks.map(function (v) { return [v, cost(D, s.W, v) / 1e6]; }), color: COL[s.id], width: 2, dash: DASH[s.id] }); });
      lines.push({ pts: ks.map(function (v) { return [v, expected(D, S, v) / 1e6]; }), color: "var(--lx-ink)", width: 3.2 });
      function mark(n, label, xx, color) { marks.push({ x: xx, y: expected(D, S, xx) / 1e6, n: n, kind: "dot", color: color || "var(--lx-ink)" }); key.push("<b>" + n + "</b> " + LX.esc(label) + ": " + fm.mw(xx) + ", expected " + fm.m(expected(D, S, xx))); }
      if (cur != null) mark("Y", "your size", cur, "var(--lx-accent)");
      if (St.rob) mark("W", "worst case", St.rob.x);
      if (St.sp) mark("S", "stochastic program", St.sp.x, "var(--lx-good)");
      if (St.reg) mark("R", "least regret", St.reg.x);
      if (St.ev) mark("A", "plan for the average", St.ev.x, "var(--lx-bad)");
      var rows = ks.filter(function (v) { return Math.abs(v - Math.round(v)) < 1e-9; }).map(function (v) { return [fm.mw(v)].concat(S.map(function (s) { return fm.m(cost(D, s.W, v)); }), [fm.m(expected(D, S, v))]); });
      PL.render({
        x: { min: 0, max: xMax, ticks: [[0, "0"], [500, "500"], [1000, "1,000"], [1500, "1,500"], [2000, "2,000"], [2500, "2,500 MW"]], ticksN: [[0, "0"], [1000, "1,000"], [2000, "2,000 MW"]] },
        y: { min: D.chart.yMin, max: D.chart.yMax, step: 80, fmt: function (v) { return "$" + v + "M"; }, unit: "a year" },
        refs: [{ y: base(D) / 1e6, label: "", dash: "3 3", color: "var(--lx-ink-3)" }],
        lines: lines, marks: marks, height: 300, heightN: 260,
        legend: S.map(function (s) { return { label: s.short + " (" + fm.pct(s.p) + ")", color: COL[s.id], dash: DASH[s.id] }; }).concat([{ label: "Expected", color: "var(--lx-ink)" }, { label: "No electrolyzer (" + fm.m(base(D)) + ")", color: "var(--lx-ink-3)", dash: "3 3" }]),
        aria: "Annual cost of the hydrogen supply against the electrolyzer's size, from 0 to 2,500 MW, in each of the three build-outs and in expectation; letters mark the plans found so far.",
        text: { head: ["Size"].concat(S.map(function (s) { return s.short; }), ["Expected"]), rows: rows, note: "Each line is straight between the sizes listed (the kinks of the three branches' costs), so the rows give the whole curve." }
      });
      keyEl.innerHTML = key.map(function (t) { return "<li>" + t + "</li>"; }).join("");
    }
    draw(St.guess != null ? St.guess : null);

    LX.demo(root, function (state) {
      var m = /^step-(\d+)$/.exec(state), n = state === "mid" ? 5 : m ? +m[1] : 0;
      if (!n) return null;
      cards.go(Math.min(steps.length, n) - 1);
      var act = cardsHost.querySelector(".lx-step-act");
      if (n === 1) { var t = act && act.querySelectorAll(".m8-br"); if (t) for (var i = 0; i < t.length; i++) t[i].click(); }
      else if (n === 6) { var c = act && act.querySelectorAll(".lx-choice"); if (c && c[0]) c[0].click(); }
      else if (n === 10) { var b = act && act.querySelectorAll(".lx-seg button"); if (b && b[0]) { b[0].click(); setTimeout(function () { if (b[2]) b[2].click(); }, 600); } }
      else { var g = act && act.querySelector(".m8-row .lx-btn"); if (g) g.click(); }
      return { view: state };
    }, cards);
    root.lxLesson = { model: model, St: St, cards: cards };
    explain(D, R);
  });

  // ---------------------------------------------------------------- explain layer: equation card, comparison table
  function explain(D, R) {
    var x = document.getElementById("m8-explain"); if (!x || !R) return;
    x.innerHTML = ""; x.classList.add("is-live");
    var S = scen(D), sym = LX.EquationCard.sym;
    LX.EquationCard(H("div", { class: "lx-xcard" }, x), {
      title: "The two-stage program, symbol by symbol", lede: "Tap a symbol: what it means, its unit and its value in this lesson.", dense: true, label: "The extensive form of the stochastic program; each symbol is a button",
      fields: [{ key: "you", label: "In this lesson" }, { key: "code", label: "In code", code: true }],
      rows: [
        { html: "min " + sym("c", "<var>c</var>") + " " + sym("x", "<var>x</var>") + " + Σ<sub><var>s</var></sub> " + sym("p", "<var>p</var><sub><var>s</var></sub>") + " Σ<sub><var>b</var></sub> " + sym("h", "<var>h</var><sub><var>b</var></sub>") + " " + sym("cr", "<var>c</var><sub>r</sub>") + " " + sym("r", "<var>r</var><sub><var>s,b</var></sub>"), tag: "goal: expected cost", say: "Minimise the electrolyzer's yearly cost plus the chance-weighted cost of reformer hydrogen in every branch and block." },
        { html: sym("k", "<var>k</var>") + " " + sym("e", "<var>e</var><sub><var>s,b</var></sub>") + " + <var>r</var><sub><var>s,b</var></sub> = " + sym("Dh", "<var>H</var>"), tag: "hydrogen", say: "Hydrogen from the electrolyzer plus hydrogen from reformers meets industry's demand, in every branch and block." },
        { html: "<var>e</var><sub><var>s,b</var></sub> ≤ <var>x</var>, &nbsp; 0 ≤ <var>e</var><sub><var>s,b</var></sub> ≤ " + sym("sig", "<var>σ</var><sub><var>s,b</var></sub>"), tag: "limits", say: "The electrolyzer runs no faster than its size, and only on surplus wind." },
        { html: "<var>σ</var><sub><var>s,b</var></sub> = max(0, " + sym("W", "<var>W</var><sub><var>s</var></sub>") + " " + sym("f", "<var>f</var><sub><var>b</var></sub>") + " − " + sym("A", "<var>A</var>") + ")", tag: "surplus (given)", say: "Surplus wind is the branch's wind output in the block above what the lines take." },
        { html: "VSS = " + sym("eev", "EEV") + " − " + sym("rp", "RP") + ", &nbsp; EVPI = RP − " + sym("ws", "WS"), tag: "two values", say: "The value of the stochastic solution and the expected value of perfect information, both differences of expected costs." }
      ],
      symbols: {
        x: { name: "x", label: "x, the electrolyzer's size", unit: "MW", words: "The here-and-now decision: one size for every branch.", you: "Stochastic program: " + fm.mw(R.sp.x) + ".", code: '"x"' },
        c: { name: "c", label: "c, the size's yearly cost", unit: "$ per MW a year", words: "Annualized capital and fixed upkeep (illustrative).", you: "$" + fm.int(D.electrolyzer.costPerMWYear) + " per MW a year.", code: "D.electrolyzer.costPerMWYear" },
        p: { name: "p_s", label: "p s, the branch's chance", unit: "share", words: "The planner's judgement of how likely each build-out is; the chances add up to 1.", you: S.map(function (s) { return s.short + " " + fm.pct(s.p); }).join(", ") + ".", code: "s.p" },
        h: { name: "h_b", label: "h b, the block's hours", unit: "hours a year", words: "How many hours of the year the wind block stands for (a weight).", you: D.blocks.hours.map(fm.int).join(", ") + ": 8,760 in all.", code: "D.blocks.hours[b]" },
        cr: { name: "c_r", label: "c r, reformer hydrogen's price", unit: "$ per kg", words: "Hydrogen from gas reformers, the fallback supply (illustrative).", you: "$" + D.hydrogen.reformerPerKg.toFixed(2) + " per kg.", code: "D.hydrogen.reformerPerKg" },
        r: { name: "r_s,b", label: "r s b, hydrogen from reformers", unit: "kg an hour", words: "A recourse decision: chosen after the branch is known.", you: "Whatever the electrolyzer does not make.", code: '"r_" + s.id + "_" + b' },
        k: { name: "k", label: "k, hydrogen per MWh", unit: "kg per MWh", words: "What one MWh of power makes in the electrolyzer (illustrative; about 55 kWh per kg).", you: D.electrolyzer.kgPerMWh + " kg per MWh.", code: "D.electrolyzer.kgPerMWh" },
        e: { name: "e_s,b", label: "e s b, the electrolyzer's power", unit: "MW", words: "A recourse decision: how hard the electrolyzer runs in block b of branch s.", you: "At most the size and the surplus.", code: '"e_" + s.id + "_" + b' },
        Dh: { name: "H", label: "H, industry's hydrogen demand", unit: "kg an hour", words: "Steady demand from industry, the same in every branch (illustrative).", you: fm.int(D.hydrogen.demandKgPerHour) + " kg an hour.", code: "D.hydrogen.demandKgPerHour" },
        sig: { name: "σ_s,b", label: "sigma s b, surplus wind", unit: "MW", words: "Wind the lines cannot take: given, not decided.", you: "Largest: " + fm.int(surplus(D, S[0].W, 0)) + " MW (none built) to " + fm.int(surplus(D, S[2].W, 0)) + " MW (all built).", code: "surplus(D, W, b)" },
        W: { name: "W_s", label: "W s, the branch's wind", unit: "MW", words: "Wind built in branch s: 3,000 MW plus none, half or all of the 4,000 MW planned.", you: S.map(function (s) { return fm.int(s.W); }).join(", ") + " MW.", code: "s.W" },
        f: { name: "f_b", label: "f b, the block's capacity factor", unit: "share", words: "The wind fleet's mean output in block b, from SPP's 2025 hours scaled to EIA's 33.8%.", you: D.blocks.cf.join(", ") + ".", code: "D.blocks.cf[b]" },
        A: { name: "A", label: "A, what the lines take", unit: "MW", words: "The most wind the zone's lines and local demand take in any hour (illustrative).", you: fm.int(D.zone.lineMW) + " MW.", code: "D.zone.lineMW" },
        eev: { name: "EEV", label: "E E V, the average plan's expected cost", unit: "$ a year", words: "The plan for the average future, priced in every branch and weighted by the chances.", you: fm.m(R.ev.exp) + ".", code: "St.ev.exp" },
        rp: { name: "RP", label: "R P, the stochastic plan's expected cost", unit: "$ a year", words: "The optimal value of the stochastic program (the recourse problem).", you: fm.m(R.sp.exp) + ".", code: "St.sp.exp" },
        ws: { name: "WS", label: "W S, the wait-and-see cost", unit: "$ a year", words: "Each branch's own best cost, weighted by the chances.", you: fm.m(R.wsExp) + ".", code: "wsExp()" }
      }
    });
    var rows = [["rob", "Worst case (robust)", "var(--lx-ink-3)"], ["sp", "Stochastic program", "var(--lx-good)"], ["reg", "Least regret", "var(--lx-ink-3)"], ["ev", "Plan for the average", "var(--lx-bad)"]].map(function (q) {
      var p = R[q[0]], rg = Math.max.apply(null, S.map(function (s) { return p.per[s.id] - R.ws[s.id].cost; })), wc = Math.max.apply(null, S.map(function (s) { return p.per[s.id]; }));
      return { key: q[0], color: q[2], name: q[1], note: fm.mw(p.x), size: p.x, exp: { text: fm.m(p.exp), value: p.exp }, worst: { text: fm.m(wc), value: wc }, regret: { text: fm.m(rg), value: rg } };
    });
    function order(k) { var v = function (r) { return typeof r[k] === "number" ? r[k] : r[k].value; }; return rows.slice().sort(function (a, b) { return v(a) - v(b); }).map(function (r) { return r.key; }); }
    LX.CompareTable(H("div", { class: "lx-xcard" }, x), {
      title: "Four plans, three yardsticks", lede: "Annual cost of the hydrogen supply, 2025 dollars, chances 25%, 50% and 25%. Each plan is best by its own yardstick.",
      columns: [{ key: "name", label: "Plan and size", main: true }, { key: "exp", label: "Expected cost", phone: "Expected", num: true },
                { key: "worst", label: "Worst cost", phone: "Worst", num: true }, { key: "regret", label: "Largest regret", phone: "Regret", num: true }],
      rows: rows,
      sorts: [{ label: "By size", order: order("size"), note: "From the smallest size to the largest." },
              { label: "By expected cost", order: order("exp"), ranked: true, note: "The stochastic program is best in expectation; the plan for the average is not." },
              { label: "By worst cost", order: order("worst"), ranked: true, note: "The worst-case plan is best when only the worst branch counts." },
              { label: "By largest regret", order: order("regret"), ranked: true, note: "The least-regret plan is best when the largest shortfall against hindsight counts." }]
    });
  }
})();
