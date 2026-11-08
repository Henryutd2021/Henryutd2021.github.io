// m02-unit-commitment.js — M2, "On or off? Unit commitment as a mixed-integer program" (model lab).
//
// Data: assets/learn/data/m02-unit-commitment.json: 29 July 2025, the 2025 summer day with the highest hourly demand on the
// Southwest Power Pool grid (EIA-930 shapes from town_days.json), scaled to Prairie Town exactly as lesson 0 scales its
// day (grid-operator.js prepare(): wind and solar = shape x farm size, demand = shape x 450 MW rounded so that the need
// left for gas is a multiple of 5 MW). Prairie Town's fleet is lesson 0's; the switching data (minimum outputs, no-load
// and start-up costs, minimum run and down times) and the $3,000/MWh unserved-energy penalty are illustrative.
//
// The model (one bus, 24 hours; the page solves it with HiGHS in a Web Worker through LX.solver):
//   decisions   p[g,t] output of gas plant g (cc, pk) in hour t, MW over one hour = MWh; r[t] wind and solar used;
//               s[t] unserved demand; with switches also u[g,t] on (1) or off (0), v[g,t] start-up, w[g,t] shut-down
//   goal        min sum_t ( 10 x 100 + sum_g (c_g p[g,t] + NL_g u[g,t] + SU_g v[g,t]) + V s[t] )
//   rules       balance      100 + r[t] + sum_g p[g,t] + s[t] = d[t]                 (dual = hourly price, LP only)
//               weather      0 <= r[t] <= wind[t] + solar[t]   (the rest is spilled); the nuclear plant runs flat at 100 MW
//               dispatch LP  0 <= p[g,t] <= Pmax_g                                   (M1's model, no switches)
//               switches     Pmin_g u[g,t] <= p[g,t] <= Pmax_g u[g,t]                (minimum output)
//                            v[g,t] - w[g,t] = u[g,t] - u[g,t-1], u[g,-1] = initial state (cc on, pk off)
//                            sum_{tau = max(0, t-UT_g+1)..t} v[g,tau] <= u[g,t]      (minimum run time)
//                            sum_{tau = max(0, t-DT_g+1)..t} w[g,tau] <= 1 - u[g,t]  (minimum down time)
//                            u[cc,23] = 1 (the combined-cycle plant is on before and after the day)
//                            u binary (the mixed-integer program) or 0 <= u <= 1 (the LP relaxation)
//               Run and down times count within this day only: a start at 23:00 owes no hour after midnight, and the
//               states before the day are assumed to have lasted long enough (no history before hour 0). The page says so.
// A mixed-integer solve returns no duals. Prices come from the LP with every switch fixed at the MILP's value
// (LX.solver.fixAndReprice): they are conditional on that commitment, and settle() shows what they leave unpaid
// (start-up, no-load and minimum-output costs: the uplift, or make-whole payment). The day's best cost as demand is
// added at 23:00 is continuous here (unserved energy is allowed, at the penalty) but not convex: its slope rises from
// $40 to $3,000/MWh and falls back to $40/MWh once the peaker stays on, which no LP's cost curve can do (step 6).
// Branch and bound (Tree*): every node is the LP relaxation with some switches fixed; rules stated on the page: open
// the node with the lowest bound (ties: the older node), branch on the switch closest to half on (ties: the earlier hour,
// then the combined-cycle plant), solve both children ("off" first). A node whose LP fails (time limit, solver error)
// stays unresolved with its parent's bound and can be retried; optimality is claimed only when no node is open,
// pending or unresolved (treeProven). The test ranges every switch over each node's optimal face: the switch values are
// unique, so an exact LP solver makes the same branching choices. That the notebook's SciPy/HiGHS grows the same tree
// is an expectation its assert cells check, not a guarantee across solver versions (tolerances differ).
//
// Every number the page states is produced by this model and checked by _tests/learn/test_m02-unit-commitment.js.
// Lesson-local components (used by this page only): SwitchBoard (on/off switches of several units over 24 hours, with
// fractional switches marked), TreeView (a branch-and-bound tree that grows node by node), and the pure Tree engine.
(function () {
  "use strict";
  var GAS = ["cc", "pk"];
  var ALL = { startup: true, pmin: true, minrun: true };
  var TOL = 1e-6;

  // ---------------------------------------------------------------- pure model
  function H(D) { return D.day.demand.length; }
  function r6(x) { return Math.round(x * 1e6) / 1e6; }
  // the day, scaled to the town as lesson 0's prepare() does (town = town.json, days = town_days.json)
  function dayOf(town, days, key, peak, step) {
    var v = days.days[key], f = town.fleet;
    var wind = v.wind.map(function (x) { return Math.round(x / 1000 * f.wind.mw); });
    var solar = v.solar.map(function (x) { return Math.round(x / 1000 * f.solar.mw); });
    var raw = v.demand.map(function (x) { return x / 1000 * peak; });
    var need = raw.map(function (r, t) { return Math.round((r - f.nuclear.mw - wind[t] - solar[t]) / step) * step; });
    return { date: v.date, demand: need.map(function (n, t) { return n + f.nuclear.mw + wind[t] + solar[t]; }), wind: wind, solar: solar, need: need };
  }
  function need(D) { return D.day.demand.map(function (d, t) { return d - D.fleet.nuclear.mw - D.day.wind[t] - D.day.solar[t]; }); }
  // o: { onoff: false = M1's dispatch LP (no switches); true = unit commitment with o.rules (default ALL),
  //      relax: switches continuous in [0, 1], fix: {u_name: 0 | 1}, add: {hour, mw} extra demand }
  function build(D, o) {
    o = o || {};
    var n = H(D), F = D.fleet, vars = [], cons = [], rules = o.rules || ALL, onoff = !!o.onoff;
    for (var t = 0; t < n; t++) {
      var bal = {};
      vars.push({ name: "nuc_" + t, lb: F.nuclear.mw, ub: F.nuclear.mw, cost: F.nuclear.cost }); bal["nuc_" + t] = 1;
      vars.push({ name: "ren_" + t, lb: 0, ub: D.day.wind[t] + D.day.solar[t], cost: 0 }); bal["ren_" + t] = 1;
      vars.push({ name: "shed_" + t, lb: 0, ub: Infinity, cost: D.penalty }); bal["shed_" + t] = 1;
      GAS.forEach(function (g) {
        var u = F[g], p = "p_" + g + "_" + t;
        vars.push({ name: p, lb: 0, ub: u.mw, cost: u.cost }); bal[p] = 1;
        if (!onoff) return;
        var on = "u_" + g + "_" + t, st = "v_" + g + "_" + t, sd = "w_" + g + "_" + t;
        var uv = { name: on, lb: 0, ub: 1, cost: rules.startup ? u.noload : 0 };
        if (!o.relax) uv.type = "binary";
        if (t === n - 1 && u.end != null) uv.lb = uv.ub = u.end;
        if (o.fix && o.fix[on] != null) uv.lb = uv.ub = o.fix[on];
        vars.push(uv);
        vars.push({ name: st, lb: 0, ub: 1, cost: rules.startup ? u.startup : 0 });
        vars.push({ name: sd, lb: 0, ub: 1, cost: 0 });
        var mx = {}; mx[p] = 1; mx[on] = -u.mw; cons.push({ name: "max_" + g + "_" + t, terms: mx, le: 0 });
        if (rules.pmin) { var mn = {}; mn[p] = 1; mn[on] = -u.min; cons.push({ name: "min_" + g + "_" + t, terms: mn, ge: 0 }); }
        var lg = {}; lg[on] = 1; lg[st] = -1; lg[sd] = 1; if (t > 0) lg["u_" + g + "_" + (t - 1)] = -1;
        cons.push({ name: "logic_" + g + "_" + t, terms: lg, eq: t > 0 ? 0 : u.init });
        var s;
        if (rules.minrun && u.up > 1) {
          var a = {}; a[on] = 1; for (s = Math.max(0, t - u.up + 1); s <= t; s++) a["v_" + g + "_" + s] = (a["v_" + g + "_" + s] || 0) - 1;
          cons.push({ name: "up_" + g + "_" + t, terms: a, ge: 0 });
        }
        if (rules.minrun && u.down > 1) {
          var b = {}; b[on] = 1; for (s = Math.max(0, t - u.down + 1); s <= t; s++) b["w_" + g + "_" + s] = (b["w_" + g + "_" + s] || 0) + 1;
          cons.push({ name: "down_" + g + "_" + t, terms: b, le: 1 });
        }
      });
      var d = D.day.demand[t] + (o.add && o.add.hour === t ? o.add.mw : 0);
      cons.push({ name: "bal_" + t, terms: bal, eq: d });
    }
    return { sense: "min", variables: vars, constraints: cons };
  }
  function size(model) {
    return { vars: model.variables.length, rows: model.constraints.length,
      switches: model.variables.filter(function (v) { return v.type === "binary"; }).length };
  }
  // the solver's result -> the hour-by-hour numbers the page shows (o as for build)
  function read(D, o, r) {
    o = o || {};
    if (!r || !r.values) return { ok: false, status: r ? r.status : "none" };
    var n = H(D), F = D.fleet, rules = o.rules || ALL, hours = [];
    var tot = { running: 0, noload: 0, startup: 0, penalty: 0, shed: 0, spill: 0, starts: { cc: 0, pk: 0 } };
    for (var t = 0; t < n; t++) {
      var h = { t: t, p: {}, u: {}, v: {}, ren: r6(r.values["ren_" + t]), shed: r6(r.values["shed_" + t]) };
      h.spill = r6(D.day.wind[t] + D.day.solar[t] - h.ren);
      tot.running += F.nuclear.cost * F.nuclear.mw;
      GAS.forEach(function (g) {
        h.p[g] = r6(r.values["p_" + g + "_" + t]);
        tot.running += F[g].cost * h.p[g];
        if (o.onoff) {
          h.u[g] = r6(r.values["u_" + g + "_" + t]); h.v[g] = r6(r.values["v_" + g + "_" + t]);
          tot.starts[g] += h.v[g];
          if (rules.startup) { tot.noload += F[g].noload * h.u[g]; tot.startup += F[g].startup * h.v[g]; }
        }
      });
      tot.penalty += D.penalty * h.shed; tot.shed += h.shed; tot.spill += h.spill;
      if (r.duals) h.price = r6(r.duals["bal_" + t] + 0);
      hours.push(h);
    }
    ["running", "noload", "startup", "penalty", "shed", "spill"].forEach(function (k) { tot[k] = r6(tot[k]); });
    GAS.forEach(function (g) { tot.starts[g] = r6(tot.starts[g]); });
    return { ok: !!r.ok, status: r.status, cost: r.objective == null ? null : r6(r.objective), hours: hours, tot: tot, onoff: !!o.onoff };
  }
  // switches that are not whole numbers, in hour order (then cc, pk): [{name, g, t, x}]
  function fractional(D, values) {
    var out = [];
    for (var t = 0; t < H(D); t++) GAS.forEach(function (g) {
      var nm = "u_" + g + "_" + t, x = values[nm];
      if (x != null && Math.abs(x - Math.round(x)) > TOL) out.push({ name: nm, g: g, t: t, x: r6(x) });
    });
    return out;
  }
  // hours in which a plan runs a plant below its minimum output (the dispatch LP has no switches, so it can)
  function belowMin(D, day, g) {
    var a = []; day.hours.forEach(function (h) { if (h.p[g] > TOL && h.p[g] < D.fleet[g].min - TOL) a.push(h.t); }); return a;
  }

  // ---- branch and bound, one branching at a time. The page solves the pending nodes with LX.solver (asynchronously),
  //      the test with core.solveWith; both call treeAccept in node order.
  function tree(D, o) {
    return { D: D, o: o || {}, nodes: [{ id: 0, parent: null, fix: {}, depth: 0, status: "pending" }], inc: null, seq: 0, branchings: 0, solved: 0, log: [] };
  }
  function treePending(T) {
    return T.nodes.filter(function (n) { return n.status === "pending"; }).map(function (n) {
      return { id: n.id, model: build(T.D, { onoff: true, relax: true, rules: T.o.rules, fix: n.fix }) };
    });
  }
  // a node's LP result. Only "optimal" and "infeasible" resolve a node. Any other result (a time limit, an iteration
  // limit, a solver error) leaves it unresolved ("error"): it keeps its parent's bound, which is still a valid lower
  // bound for every plan below it, so the best bound and the gap stay honest until treeRetry and a new solve resolve it.
  function treeAccept(T, id, r) {
    var n = T.nodes[id];
    n.tries = (n.tries || 0) + 1;
    if (!r || !r.ok) {
      n.why = r ? r.status : "none";
      if (r && r.status === "infeasible") { T.solved++; n.status = "infeasible"; n.bound = null; n.inherited = false; return n; }
      n.status = "error"; n.inherited = true; n.bound = n.parent == null ? null : T.nodes[n.parent].bound;
      if (T.inc && n.bound != null && n.bound >= T.inc.bound - TOL) { n.status = "pruned"; n.prunedBy = T.inc.id; }
      return n;
    }
    T.solved++; n.inherited = false; n.why = null;
    n.bound = r6(r.objective); n.frac = fractional(T.D, r.values); n.u = {}; n.p = {}; n.shed = 0;
    for (var t = 0; t < H(T.D); t++) {
      GAS.forEach(function (g) { n.u["u_" + g + "_" + t] = r6(r.values["u_" + g + "_" + t]); n.p["p_" + g + "_" + t] = r6(r.values["p_" + g + "_" + t]); });
      n.shed += r.values["shed_" + t];
    }
    n.shed = r6(n.shed);
    if (T.inc && n.bound >= T.inc.bound - TOL) { n.status = "pruned"; n.prunedBy = T.inc.id; return n; }
    if (!n.frac.length) {
      n.status = "integer";
      if (!T.inc || n.bound < T.inc.bound - TOL) {
        if (T.inc) T.inc.status = "integer";
        T.inc = n; n.status = "best";
        // a new best plan prunes every open or unresolved node whose bound cannot beat it
        T.nodes.forEach(function (m) { if ((m.status === "open" || m.status === "error") && m.id !== n.id && m.bound != null && m.bound >= n.bound - TOL) { m.status = "pruned"; m.prunedBy = n.id; } });
      }
      return n;
    }
    n.status = "open"; return n;
  }
  function treeOpen(T) { return T.nodes.filter(function (n) { return n.status === "open"; }); }
  function treeFailed(T) { return T.nodes.filter(function (n) { return n.status === "error"; }); }
  // done: nothing open, nothing waiting for a solve, nothing unresolved
  function treeDone(T) { return !T.nodes.some(function (n) { return n.status === "open" || n.status === "pending" || n.status === "error"; }); }
  // proven: done, with a best plan, and the best bound equals it (gap 0)
  function treeProven(T) { return treeDone(T) && !!T.inc && treeGap(T) != null && treeGap(T) <= TOL; }
  // put every unresolved node back in the queue; returns how many
  function treeRetry(T) { var k = 0; T.nodes.forEach(function (n) { if (n.status === "error") { n.status = "pending"; k++; } }); return k; }
  function pickNode(T) { var b = null; treeOpen(T).forEach(function (n) { if (!b || n.bound < b.bound - TOL) b = n; }); return b; }
  function pickSwitch(frac) {
    var b = null;
    frac.forEach(function (f) { if (!b || Math.abs(f.x - 0.5) < Math.abs(b.x - 0.5) - TOL) b = f; });
    return b;
  }
  // branch the open node with the lowest bound: two pending children (off, on); returns {node, on, kids} or null
  function treeBranch(T) {
    var n = pickNode(T); if (!n) return null;
    var f = pickSwitch(n.frac);
    n.status = "branched"; n.on = f; T.branchings++;
    var kids = [0, 1].map(function (val) {
      var fix = {}; for (var k in n.fix) fix[k] = n.fix[k]; fix[f.name] = val;
      var c = { id: ++T.seq, parent: n.id, fix: fix, depth: n.depth + 1, status: "pending", by: f, val: val };
      T.nodes.push(c); return c;
    });
    return { node: n, on: f, kids: kids };
  }
  // the best bound still possible: the lowest bound of every node not yet resolved (open, waiting for its solve, or
  // unresolved after a failed solve: those two count with their parent's bound), or the best plan's cost when none is
  // left. null while an unresolved node has no bound at all (the root before its first successful solve).
  function treeBound(T) {
    var b = T.inc ? T.inc.bound : Infinity, none = false;
    T.nodes.forEach(function (n) {
      if (n.status !== "open" && n.status !== "pending" && n.status !== "error") return;
      var nb = n.status === "open" || n.status === "error" ? n.bound : (n.parent == null ? null : T.nodes[n.parent].bound);
      if (nb == null) none = true; else b = Math.min(b, nb);
    });
    return none ? null : b;
  }
  function treeGap(T) { if (!T.inc) return null; var lb = treeBound(T); if (lb == null) return null; return r6((T.inc.bound - lb) / T.inc.bound); }
  // a whole tree with a synchronous solve (Node tests, benchmark); stops when nothing is left to branch
  function treeRun(D, o, solveFn) {
    var T = tree(D, o);
    function settleAll() { treePending(T).forEach(function (m) { treeAccept(T, m.id, solveFn(m.model)); }); }
    settleAll();
    for (var k = 0; k < 200 && !treeDone(T); k++) { if (!treeBranch(T)) break; settleAll(); }
    return T;
  }
  // node layout: the "on" child straight below its parent, the "off" child one column to the left (moved further left
  // only if its own subtree would collide); columns start at 0. Returns {pos: {id: [col, row]}, cols, rows}
  function treeLayout(T) {
    var kids = {}, pos = {}, used = {};
    T.nodes.forEach(function (n) { if (n.parent != null) (kids[n.parent] = kids[n.parent] || []).push(n); });
    function sub(id) { var a = [id]; (kids[id] || []).forEach(function (c) { a = a.concat(sub(c.id)); }); return a; }
    function free(ids, dx) { return ids.every(function (i) { var p = pos[i]; return !used[(p[0] + dx) + "," + p[1]]; }); }
    function place(id, col, row) {
      pos[id] = [col, row];
      var cs = kids[id] || [], on = cs.filter(function (c) { return c.val === 1; })[0], off = cs.filter(function (c) { return c.val === 0; })[0];
      if (on) place(on.id, col, row + 1);
      if (off) {
        var ids = sub(off.id), tmp = {};
        place(off.id, col - 1, row + 1);
        ids.forEach(function (i) { tmp[i] = pos[i]; delete used[pos[i][0] + "," + pos[i][1]]; });
        var dx = 0; while (!free(ids, dx) && dx > -50) dx--;
        ids.forEach(function (i) { pos[i] = [tmp[i][0] + dx, tmp[i][1]]; });
        ids.forEach(function (i) { used[pos[i][0] + "," + pos[i][1]] = 1; });
      }
      used[col + "," + row] = 1;
    }
    place(0, 0, 0);
    var minC = 0, maxC = 0, maxR = 0;
    Object.keys(pos).forEach(function (k) { minC = Math.min(minC, pos[k][0]); maxC = Math.max(maxC, pos[k][0]); maxR = Math.max(maxR, pos[k][1]); });
    Object.keys(pos).forEach(function (k) { pos[k][0] -= minC; });
    return { pos: pos, cols: maxC - minC + 1, rows: maxR + 1 };
  }
  // the learner's plan (step 3): the peaker's 24 switches (0/1), the combined-cycle plant on all day -> fixings
  function planFix(D, sw) {
    var fix = {};
    for (var t = 0; t < H(D); t++) { fix["u_cc_" + t] = 1; fix["u_pk_" + t] = sw[t] ? 1 : 0; }
    return fix;
  }
  // rules a plan breaks: runs shorter than the minimum run time, stops shorter than the minimum down time
  // (the peaker is off before the day starts); returns [{kind: "run"|"down", from, to, hours}]
  function planBreaks(D, sw, g) {
    var u = D.fleet[g || "pk"], out = [], n = sw.length, t = 0;
    while (t < n) {
      var v = sw[t] ? 1 : 0, s = t; while (t < n && (sw[t] ? 1 : 0) === v) t++;
      var len = t - s;
      if (v === 1 && len < u.up && t < n) out.push({ kind: "run", from: s, to: t - 1, hours: len });
      if (v === 0 && s > 0 && t < n && len < u.down) out.push({ kind: "down", from: s, to: t - 1, hours: len });
    }
    return out;
  }
  // the relaxed switches rounded to the nearest whole number (the "just round it" plan)
  function rounded(D, day, g) { return day.hours.map(function (h) { return Math.round(h.u[g || "pk"]) ? 1 : 0; }); }
  // what each gas plant is paid at the given prices, against what it spends: running, no-load and start-up
  function settle(D, day, prices) {
    var F = D.fleet, out = {};
    GAS.forEach(function (g) {
      var s = { revenue: 0, running: 0, mwh: 0, hoursOn: 0, starts: 0, shortHours: [] };
      day.hours.forEach(function (h, t) {
        s.revenue += prices[t] * h.p[g]; s.running += F[g].cost * h.p[g]; s.mwh += h.p[g];
        s.hoursOn += Math.round(h.u[g]); s.starts += Math.round(h.v[g]);
        if (h.p[g] > TOL && prices[t] < F[g].cost - TOL) s.shortHours.push(t);
      });
      s.noload = F[g].noload * s.hoursOn; s.startup = F[g].startup * s.starts;
      s.cost = s.running + s.noload + s.startup;
      ["revenue", "running", "mwh", "cost"].forEach(function (k) { s[k] = r6(s[k]); });
      s.energyShort = r6(Math.max(0, s.running - s.revenue));
      s.profit = r6(s.revenue - s.cost); s.uplift = r6(Math.max(0, -s.profit));
      out[g] = s;
    });
    return out;
  }
  // step 6: the demand added at the stair hour, 0 to lesson.stair.max MWh in steps of lesson.stair.step
  function stairPoints(D) { var s = D.lesson.stair, out = []; for (var k = 0; k * s.step <= s.max + 1e-9; k++) out.push(r6(k * s.step)); return out; }
  // the slope of each step, $ per MWh: pts = [{x, cost}] in order of x
  function stairSlopes(pts) { var out = []; for (var k = 1; k < pts.length; k++) out.push(r6((pts[k].cost - pts[k - 1].cost) / (pts[k].x - pts[k - 1].x))); return out; }
  // what step 6 says about the points solved so far, pts = [{x, cost, shed, pk}] from 0 up: {text, done}
  function stairWords(D, pts) {
    var cc = D.fleet.cc.cost, sl = stairSlopes(pts), k, full = null, shed = null, on = null;
    for (k = 0; k < pts.length; k++) {
      if (pts[k].shed > TOL && shed == null) shed = k;
      if (pts[k].pk && on == null) on = k;
      if (!(pts[k].shed > TOL) && !pts[k].pk) full = k;
    }
    var per = function (v) { return money(v) + "/MWh"; }, mwh = function (x) { return String(x) + " MWh"; };
    if (on != null && on + 1 < pts.length) {
      var hi = Math.max.apply(null, sl), after = sl[on];
      return { done: after < hi - 1, text: "**Up to " + mwh(pts[full].x) + ":** " + per(sl[0]) + ". **Then** " + per(hi) + (shed != null ? ", unserved" : "") + ". **From " + mwh(pts[on].x) +
        ":** the peaker stays on at " + hh(D.lesson.stair.hour) + ", and each MWh costs " + per(after) + " again. The slope fell, which it never does in a linear program." };
    }
    if (on != null) return { done: false, text: "At " + mwh(pts[on].x) + " the peaker stays on at " + hh(D.lesson.stair.hour) + ". Add one more step to see what the next MWh costs." };
    if (shed != null) return { done: false, text: "From " + mwh(pts[full].x) + " the combined-cycle plant is full, so extra demand goes unserved, at " + per(sl[shed - 1]) + ". Keep adding." };
    return { done: false, text: pts.length > 1 ? "So far each MWh costs " + per(cc) + ", the combined-cycle plant's running cost. Keep adding." : "Move the slider to add demand." };
  }

  // ---------------------------------------------------------------- words the page says (pure, so the test can read them)
  function money(v) { var r = Math.round(v); return (r < 0 ? "−$" : "$") + Math.abs(r).toLocaleString("en-US"); }
  function hh(t) { return (t < 10 ? "0" : "") + t + ":00"; }
  function pct(x) { return Math.round(x * 100) + "%"; }
  function sw2(x) { var s = (Math.round(x * 100) / 100).toFixed(2); return s.replace(/0$/, "").replace(/\.$/, ""); }
  function list(a) { return a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1]; }
  function span(a) { if (!a.length) return ""; return a.length === 1 ? hh(a[0]) : hh(a[0]) + "–" + hh(a[a.length - 1]); }
  // "on 17:00–22:00" from 24 switches
  function runs(sw) {
    var out = [], t = 0;
    while (t < sw.length) { if (!sw[t]) { t++; continue; } var s = t; while (t < sw.length && sw[t]) t++; out.push(s === t - 1 ? hh(s) : hh(s) + "–" + hh(t - 1)); }
    return out.length ? out.join(", ") : "off all day";
  }
  // "Peaker on 17:00–22:00" or "Peaker off all day"
  function peakerWords(sw) { var r = runs(sw); return r === "off all day" ? "Peaker off all day" : "Peaker on " + r; }
  function nodeLabel(n) { return n.parent == null ? "Relaxed day" : "Peaker " + (n.val ? "on" : "off") + " at " + hh(n.by.t); }
  function nodeLabelLong(n) {
    if (n.parent == null) return "The relaxed day";
    return (n.by.g === "pk" ? "Peaker " : "Combined-cycle plant ") + (n.val ? "on" : "off") + " at " + hh(n.by.t);
  }
  var STATUS = { open: "open", branched: "branched", pruned: "pruned", integer: "whole numbers", best: "best plan", infeasible: "infeasible", pending: "solving", error: "not solved" };
  // what the page says once the tree has nothing left to branch: "proven optimal" only when treeProven(T); a node whose
  // LP failed keeps the gap open and asks for a retry. Returns {text, proven} or null while the tree can still branch.
  function treeVerdict(D, T) {
    if (treeProven(T)) return { proven: true, text: T.branchings + " branchings, " + T.solved + " LPs. Best plan " + money(T.inc.bound) + ", peaker on " +
      runs(D.day.demand.map(function (_, t) { return T.inc.u["u_pk_" + t] > 0.5 ? 1 : 0; })) + ". No node is left open or unsolved, so the gap is 0%: proven optimal." };
    var bad = treeFailed(T);
    if (!bad.length && (treeOpen(T).length || T.nodes.some(function (n) { return n.status === "pending"; }))) return null;
    if (!bad.length) return { proven: false, text: "No plan meets every rule: every branch is infeasible." };
    var lb = treeBound(T), g = treeGap(T);
    return { proven: false, text: "Not proven: " + (bad.length === 1 ? "one node's LP" : bad.length + " nodes' LPs") + " did not finish (" + bad[0].why + "). Best plan " +
      (T.inc ? money(T.inc.bound) : "none yet") + ", best bound " + (lb == null ? "unknown" : money(lb)) + (g != null ? ", gap " + (g * 100).toFixed(1) + "%" : "") + ". Press Retry." };
  }

  var model = { GAS: GAS, ALL: ALL, dayOf: dayOf, need: need, build: build, size: size, read: read, fractional: fractional, belowMin: belowMin,
    tree: tree, treePending: treePending, treeAccept: treeAccept, treeBranch: treeBranch, treeDone: treeDone, treeProven: treeProven, treeRetry: treeRetry,
    treeFailed: treeFailed, treeBound: treeBound, treeGap: treeGap, treeVerdict: treeVerdict, stairPoints: stairPoints, stairSlopes: stairSlopes, stairWords: stairWords,
    treeRun: treeRun, treeLayout: treeLayout, pickSwitch: pickSwitch, planFix: planFix, planBreaks: planBreaks, rounded: rounded, settle: settle,
    money: money, hh: hh, pct: pct, sw2: sw2, span: span, list: list, runs: runs, peakerWords: peakerWords, nodeLabel: nodeLabel, nodeLabelLong: nodeLabelLong, r6: r6 };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX || !window.LX.H) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, E = LX.H, S = LX.S;
  var KEY = "m2-own";

  function css() {
    if (document.getElementById("m2-css")) return;
    E("style", { id: "m2-css", text: [
      ".lx-interactive.m2-lab{max-width:980px}",
      ".m2-cards{display:grid;gap:14px}",
      ".m2-lab .lx-stepcard{gap:12px}",
      ".m2-lab .lx-step-text{max-width:62ch}",
      ".m2-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}",
      ".m2-kpis{display:flex;flex-wrap:wrap;gap:8px}",
      ".m2-kpi{display:grid;gap:0;padding:8px 12px;border:1px solid var(--lx-line);border-radius:10px;background:var(--lx-surface-2);min-width:110px}",
      ".m2-kpi small{font-size:12px;color:var(--lx-ink-3);font-family:var(--lx-f-display);letter-spacing:.04em;text-transform:uppercase}",
      ".m2-kpi b{font-family:var(--lx-f-mono);font-size:17px;font-weight:600;color:var(--lx-ink)}",
      ".m2-kpi.good b{color:var(--lx-good)}.m2-kpi.bad b{color:var(--lx-bad)}.m2-kpi.warn b{color:var(--lx-warn)}",
      ".m2-tag{font-size:13px;color:var(--lx-ink-3);margin:0}",
      // switch board
      ".m2-board{display:grid;gap:4px;min-width:0}",
      ".m2-brow{display:grid;grid-template-columns:4.6em minmax(0,1fr);gap:6px;align-items:center}",
      ".m2-blab{font-family:var(--lx-f-display);font-size:13px;color:var(--lx-ink-2);display:flex;gap:5px;align-items:center;white-space:nowrap}",
      ".m2-blab i{width:9px;height:9px;border-radius:2px;background:var(--c);display:inline-block}",
      ".m2-cells{display:grid;grid-template-columns:repeat(24,minmax(0,1fr));gap:2px;height:30px}",
      ".m2-cell{position:relative;border:1px solid var(--lx-line-2);border-radius:3px;background:var(--lx-surface);overflow:hidden;cursor:pointer;padding:0;min-width:0}",
      ".m2-cell::after{content:'';position:absolute;left:0;right:0;bottom:0;height:calc(var(--f,0)*100%);background:var(--c)}",
      ".m2-cell.frac{border:1.5px dashed var(--lx-warn)}",
      ".m2-cell.frac::after{background:repeating-linear-gradient(135deg,var(--lx-warn) 0 3px,transparent 3px 6px)}",
      ".m2-cell.low{border:1.5px solid var(--lx-bad)}",
      ".m2-cell.sel{box-shadow:0 0 0 2px var(--lx-ink)}",
      ".m2-axis{display:grid;grid-template-columns:4.6em minmax(0,1fr);gap:6px}",
      ".m2-ticks{position:relative;height:16px;font-size:11.5px;color:var(--lx-ink-3);font-family:var(--lx-f-mono)}",
      ".m2-ticks span{position:absolute;transform:translateX(-50%)}",
      ".m2-legend{display:flex;flex-wrap:wrap;gap:12px;font-size:13px;color:var(--lx-ink-2)}",
      ".m2-legend span{display:inline-flex;gap:5px;align-items:center}",
      ".m2-legend i{width:14px;height:14px;border-radius:3px;border:1px solid var(--lx-line-2);display:inline-block;background:var(--lx-surface)}",
      ".m2-legend i.on{background:var(--lx-ink-3)}.m2-legend i.frac{border:1.5px dashed var(--lx-warn);background:repeating-linear-gradient(135deg,var(--lx-warn) 0 3px,transparent 3px 6px)}.m2-legend i.low{border:1.5px solid var(--lx-bad)}",
      ".m2-read{font-size:14.5px;margin:0;min-height:1.4em}",
      ".m2-read b{font-family:var(--lx-f-mono);font-weight:600}",
      // rules (step 2)
      ".m2-rules{display:grid;gap:6px}",
      ".m2-rule{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 10px;align-items:center;padding:8px 12px;border-radius:11px;border:1px solid var(--lx-line-2);background:var(--lx-surface)}",
      ".m2-rule.added{border-color:var(--lx-good);background:var(--lx-surface-2)}",
      ".m2-rule .nm{font-family:var(--lx-f-display);font-weight:500;font-size:15px}",
      ".m2-rule .det{grid-column:1/-1;font-size:14.5px;color:var(--lx-ink-2)}",
      ".m2-sym{font-family:var(--lx-f-mono);font-size:13.5px;color:var(--lx-ink);overflow-x:auto;white-space:nowrap;display:block;padding:2px 0}",
      ".m2-sym i{font-family:var(--lx-f-body);font-style:italic;font-size:15px}",
      ".m2-more{display:grid;gap:4px;margin-top:4px}",
      ".m2-key{display:flex;flex-wrap:wrap;gap:2px 14px;margin:0;font-size:13.5px;color:var(--lx-ink-2)}",
      ".m2-key>div{display:inline-flex;gap:4px;align-items:baseline;max-width:100%}",
      ".m2-key dt{font-family:var(--lx-f-body);font-style:italic;color:var(--lx-ink);margin:0;white-space:nowrap}",
      ".m2-key dt::after{content:':';font-style:normal}",
      ".m2-key dd{margin:0}",
      ".m2-key .ul{text-decoration:underline}.m2-key .ol{text-decoration:overline}",
      ".m2-bound{margin:0;font-size:13.5px;color:var(--lx-ink-3)}",
      ".m2-brules{margin:0;padding-left:1.2rem;font-size:14.5px;display:grid;gap:2px;max-width:62ch}",
      // plan editor (step 3)
      ".m2-edit{display:grid;grid-template-columns:repeat(9,minmax(0,1fr));gap:4px;max-width:520px}",
      ".m2-tg{min-height:44px;border-radius:9px;border:1px solid var(--lx-line-2);background:var(--lx-surface);color:var(--lx-ink);font:inherit;font-family:var(--lx-f-mono);font-size:13px;cursor:pointer;padding:2px 0;display:grid;place-items:center;line-height:1.1}",
      ".m2-tg small{font-family:var(--lx-f-display);font-size:11px;color:var(--lx-ink-3)}",
      ".m2-tg[aria-pressed=true]{background:var(--lx-pk);color:#fff;border-color:var(--lx-pk)}",
      ".m2-tg[aria-pressed=true] small{color:#fff}",
      ".m2-tg.broke{outline:2px solid var(--lx-bad);outline-offset:1px}",
      ".m2-breaks{margin:0;padding-left:1.1rem;color:var(--lx-bad);font-size:14.5px}",
      // tree
      ".m2-treebox{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px;align-items:start}",
      "@media (max-width:760px){.m2-treebox{grid-template-columns:minmax(0,1fr)}}",
      ".m2-tree svg{width:100%;height:auto;display:block;max-width:420px}",
      ".m2-tree .nd{cursor:pointer}",
      ".m2-tree .nd rect{fill:var(--lx-surface);stroke:var(--lx-line-2);stroke-width:1.5}",
      ".m2-tree .nd text{fill:var(--lx-ink);font-size:12.5px;font-family:var(--lx-f-body)}",
      ".m2-tree .nd text.b{font-family:var(--lx-f-mono);font-size:12.5px}",
      ".m2-tree .nd.open rect{stroke:var(--lx-ink);stroke-dasharray:4 3}",
      ".m2-tree .nd.branched rect{stroke:var(--lx-ink-3)}",
      ".m2-tree .nd.pruned rect{fill:var(--lx-surface-2);stroke:var(--lx-line)}.m2-tree .nd.pruned text{fill:var(--lx-ink-3)}",
      ".m2-tree .nd.integer rect{stroke:var(--lx-warn)}",
      ".m2-tree .nd.best rect{stroke:var(--lx-good);stroke-width:3}",
      ".m2-tree .nd.pending rect{stroke:var(--lx-line);stroke-dasharray:2 3}",
      ".m2-tree .nd.error rect{stroke:var(--lx-bad);stroke-dasharray:4 3;stroke-width:2}",
      ".m2-tree .nd.sel rect{stroke:var(--lx-accent);stroke-width:3}",
      ".m2-tree .nd:focus{outline:none}.m2-tree .nd:focus rect{stroke:var(--lx-accent);stroke-width:3}",
      ".m2-tree path{stroke:var(--lx-line-2);stroke-width:1.5}",
      ".m2-tree .mk{font-size:13px;font-family:var(--lx-f-mono)}",
      ".m2-tread{border:1px solid var(--lx-line);border-radius:12px;padding:10px 14px;background:var(--lx-surface-2);display:grid;gap:6px;font-size:14.5px}",
      ".m2-tread p{margin:0}",
      ".m2-tread ul{margin:0;padding-left:1.1rem}",
      // ledger
      ".m2-split{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px;align-items:start}",
      "@media (max-width:720px){.m2-split{grid-template-columns:minmax(0,1fr)}}",
      ".m2-ul{margin:0;padding-left:1.1rem;font-size:14.5px;display:grid;gap:3px}"
    ].join("\n") }, document.head);
  }

  // ---- the switch board: on/off switches of the two gas plants over 24 hours (a fractional switch is hatched; an output
  //      below the minimum in a model without switches is outlined red). Tap an hour, or use the hour picker.
  function SwitchBoard(host, o) {
    var D = o.D, w = E("div", { class: "m2-board" }, host), rows = {}, sel = o.sel == null ? 17 : o.sel, day = null;
    var grid = E("div", { "aria-hidden": "true", style: "display:grid;gap:4px" }, w);
    GAS.forEach(function (g) {
      var r = E("div", { class: "m2-brow" }, grid);
      var lab = E("span", { class: "m2-blab" }, r); E("i", { style: "--c:" + D.fleet[g].color }, lab); lab.appendChild(document.createTextNode(D.fleet[g].short));
      var cells = E("div", { class: "m2-cells" }, r);
      rows[g] = [];
      for (var t = 0; t < 24; t++) {
        (function (t) {
          var c = E("span", { class: "m2-cell", style: "--c:" + D.fleet[g].color }, cells);
          c.addEventListener("click", function () { pick(t, true); });
          rows[g].push(c);
        })(t);
      }
    });
    var ax = E("div", { class: "m2-axis" }, grid); E("span", null, ax);
    var tk = E("div", { class: "m2-ticks" }, ax);
    [0, 6, 12, 18].forEach(function (t) { E("span", { style: "left:" + ((t + 0.5) / 24 * 100) + "%", text: hh(t) }, tk); });
    var lg = E("div", { class: "m2-legend", "aria-hidden": "true" }, w);
    [["on", "on"], ["frac", "partly on: impossible to operate"], ["", "off"]].concat(o.low ? [["low", "below its minimum output"]] : []).forEach(function (x) {
      var s = E("span", null, lg); E("i", { class: x[0] }, s); s.appendChild(document.createTextNode(x[1]));
    });
    var hp = LX.HourPicker(w, { start: sel, label: "Hour", jumps: o.jumps, onChange: function (t) { pick(t, true); } });
    var out = E("p", { class: "m2-read", "aria-live": "polite" }, w);
    var alt = E("details", { class: "lx-textalt" }, w); E("summary", { text: "Text version: the switches hour by hour" }, alt);
    var altBody = E("div", { style: "overflow-x:auto" }, alt);
    function cellState(h, g) {
      if (!day.onoff) { var p = h.p[g]; return { f: p > TOL ? 1 : 0, frac: false, low: p > TOL && p < D.fleet[g].min - TOL }; }
      var u = h.u[g]; return { f: u, frac: Math.abs(u - Math.round(u)) > TOL, low: false };
    }
    function words(h, g) {
      var F = D.fleet[g], p = Math.round(h.p[g] * 100) / 100;
      if (!day.onoff) return F.short + " " + p + " MW" + (p > TOL && p < F.min - TOL ? " (below its " + F.min + " MW minimum)" : "");
      var u = h.u[g];
      if (Math.abs(u - Math.round(u)) > TOL) return F.short + " switch " + sw2(u) + " (" + pct(u) + " on), " + p + " MW";
      return F.short + " " + (Math.round(u) ? "on, " + p + " MW" : "off");
    }
    function pick(t, user) {
      sel = t; hp.set(t);
      GAS.forEach(function (g) { rows[g].forEach(function (c, k) { c.classList.toggle("sel", k === t); }); });
      if (day) { var h = day.hours[t]; out.innerHTML = "<b>" + hh(t) + "</b> · " + LX.esc(GAS.map(function (g) { return words(h, g); }).join(" · ")) + (h.shed > TOL ? " · " + LX.esc(Math.round(h.shed) + " MWh unserved") : ""); }
      if (user && o.onPick) o.onPick(t);
    }
    function set(d) {
      day = d;
      GAS.forEach(function (g) {
        rows[g].forEach(function (c, t) {
          var s = cellState(d.hours[t], g);
          c.style.setProperty("--f", String(Math.max(0, Math.min(1, s.f))));
          c.classList.toggle("frac", s.frac); c.classList.toggle("low", s.low);
        });
      });
      altBody.innerHTML = "";
      var tb = E("table", { class: "lx-table" }, altBody), tr = E("tr", null, E("thead", null, tb));
      ["Hour"].concat(GAS.map(function (g) { return D.fleet[g].short; })).concat(["Unserved"]).forEach(function (x) { E("th", { scope: "col", text: x }, tr); });
      var tbody = E("tbody", null, tb);
      d.hours.forEach(function (h) {
        var r = E("tr", null, tbody); E("th", { scope: "row", text: hh(h.t) }, r);
        GAS.forEach(function (g) { E("td", { text: words(h, g).replace(D.fleet[g].short + " ", "") }, r); });
        E("td", { text: h.shed > TOL ? Math.round(h.shed) + " MWh" : "–" }, r);
      });
      pick(sel);
    }
    GAS.forEach(function (g) { rows[g].forEach(function (c, k) { c.classList.toggle("sel", k === sel); }); });
    return { el: w, set: set, pick: pick };
  }

  // ---- the gas need chart (step 1): what demand leaves for gas each hour, the combined-cycle plant's size, and who covers it
  function NeedChart(host, D) {
    var P = LX.Plot(host, { caption: true, text: "Text version of the chart", box: true });
    var nd = need(D);
    function render(day) {
      var bars = [];
      if (day) day.hours.forEach(function (h) {
        bars.push({ x0: h.t + 0.08, x1: h.t + 0.92, y0: 0, y1: h.p.cc, color: D.fleet.cc.color, op: 0.55 });
        if (h.p.pk > TOL) bars.push({ x0: h.t + 0.08, x1: h.t + 0.92, y0: h.p.cc, y1: h.p.cc + h.p.pk, color: D.fleet.pk.color, op: 0.95 });
      });
      P.render({
        caption: "What demand leaves for gas, hour by hour, on " + D.day.label + " (MW)",
        x: { min: 0, max: 24, ticks: [[0, "00:00"], [6, "06:00"], [12, "12:00"], [18, "18:00"], [24, "24:00"]], ticksN: [[0, "00:00"], [12, "12:00"], [24, "24:00"]] },
        y: { min: 0, max: 250, step: 50, fmt: LX.fmt.int, unit: "MW" },
        bars: bars,
        lines: [{ values: nd, x0: 0, step: 1, color: "var(--lx-ink)", width: 2 }],
        refs: [{ y: D.fleet.cc.mw, label: "", dash: "5 4" }],
        legend: [{ label: "Need for gas", color: "var(--lx-ink)" }, { label: D.fleet.cc.short, color: D.fleet.cc.color }, { label: D.fleet.pk.short, color: D.fleet.pk.color },
          { label: "Gas CC size, " + D.fleet.cc.mw + " MW", color: "var(--lx-ink-3)", dash: "5 4" }],
        tip: function (x) { var t = Math.floor(x); if (t < 0 || t > 23) return null; var h = day && day.hours[t]; return "<div><b>" + hh(t) + "</b> need " + nd[t] + " MW" + (h ? " · CC " + Math.round(h.p.cc) + " · peaker " + Math.round(h.p.pk) : "") + "</div>"; },
        aria: "Need for gas each hour, against the combined-cycle plant's 150 MW size",
        text: { head: ["Hour", "Need for gas, MW", "Gas CC, MW", "Peaker, MW"], rows: nd.map(function (v, t) { var h = day && day.hours[t]; return [hh(t), v, h ? Math.round(h.p.cc) : "–", h ? Math.round(h.p.pk) : "–"]; }) }
      }, true);
    }
    render(null);
    return { render: render };
  }

  // a node's state in words: "$169,510, branched" or "not solved (time-limit); its parent's bound, $171,415, still counts"
  function nodeState(n) {
    if (n.status === "error") return "not solved (" + n.why + ")" + (n.bound != null ? "; its parent's bound, " + money(n.bound) + ", still counts" : "; no bound yet");
    return (n.bound != null ? (n.inherited ? "at least " : "") + money(n.bound) + ", " : "") + STATUS[n.status] + (n.shed > TOL ? ", " + Math.round(n.shed) + " MWh unserved" : "");
  }
  // ---- the branch-and-bound tree: nodes in a grid ("on" below, "off" to the left), tap or Tab to a node to read it
  function TreeView(host, o) {
    var w = E("div", { class: "m2-tree" }, host), svgHost = E("div", null, w), sel = null, T = null;
    var alt = E("details", { class: "lx-textalt" }, w); E("summary", { text: "Text version of the tree" }, alt);
    var ol = E("ol", null, alt);
    var CW = 168, RW = 150, RH = 64, BH = 46;
    function draw(t) {
      T = t; svgHost.innerHTML = "";
      var L = treeLayout(T), Wd = L.cols * CW + 8, Ht = L.rows * RH + 8;
      var svg = S("svg", { viewBox: "0 0 " + Wd + " " + Ht, role: "group", "aria-label": o.label || "Branch-and-bound tree" }, svgHost);
      svg.style.maxWidth = Math.max(240, Wd) + "px";
      var xy = function (id) { var p = L.pos[id]; return [4 + p[0] * CW + (CW - RW) / 2, 4 + p[1] * RH]; };
      T.nodes.forEach(function (n) {
        if (n.parent == null) return;
        var a = xy(n.parent), b = xy(n.id);
        var mid = a[1] + BH + (RH - BH) / 2;
        S("path", { d: "M" + (a[0] + RW / 2) + " " + (a[1] + BH) + " V" + mid + " H" + (b[0] + RW / 2) + " V" + b[1], fill: "none" }, svg);
      });
      T.nodes.forEach(function (n) {
        var p = xy(n.id), st = n.status;
        var g = S("g", { class: "nd " + st + (sel === n.id ? " sel" : ""), transform: "translate(" + p[0] + "," + p[1] + ")", tabindex: "0", role: "button",
          "aria-label": nodeLabelLong(n) + ": " + nodeState(n) }, svg);
        S("rect", { width: RW, height: BH, rx: 9 }, g);
        var t1 = S("text", { x: 9, y: 18 }, g); t1.textContent = nodeLabel(n);
        var t2 = S("text", { x: 9, y: 36, class: "b" }, g); t2.textContent = n.bound != null ? (n.inherited ? "≥ " : "") + money(n.bound) : st === "pending" ? "solving…" : "–";
        var mk = st === "best" ? "★ best" : st === "pruned" ? "✕ pruned" : st === "integer" ? "✓ whole" : st === "branched" ? "↓" : st === "open" ? "open" : st === "error" ? "! retry" : "";
        var t3 = S("text", { x: RW - 8, y: 36, class: "mk", "text-anchor": "end" }, g); t3.textContent = mk;
        g.addEventListener("click", function () { select(n.id); });
        g.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(n.id); } });
      });
      ol.innerHTML = "";
      T.nodes.forEach(function (n) {
        E("li", { text: nodeLabelLong(n) + (n.parent != null ? " (under node " + (n.parent + 1) + ")" : "") + ": " + nodeState(n) +
          (n.on ? ", branched on the " + (n.on.g === "pk" ? "peaker" : "combined-cycle plant") + " at " + hh(n.on.t) + " (" + sw2(n.on.x) + ")" : "") + "." }, ol);
      });
    }
    function select(id) {
      var had = w.contains(document.activeElement);
      sel = id; if (T) draw(T);
      var f = svgHost.querySelector(".nd.sel"); if (f && had) f.focus();
      if (o.onPick) o.onPick(T.nodes[id]);
    }
    return { el: w, draw: draw, select: select, sel: function () { return sel; } };
  }
  // what a node says in words (the tree's reading panel)
  function nodeWords(D, T, n) {
    var lines = [];
    var head = "<b>" + LX.esc(nodeLabelLong(n)) + "</b>" + (n.bound != null ? ": " + (n.inherited ? "at least " : "") + money(n.bound) : "") + " · " + STATUS[n.status];
    lines.push(head);
    var fx = Object.keys(n.fix).map(function (k) { var m = /^u_(cc|pk)_(\d+)$/.exec(k); return (m[1] === "pk" ? "peaker " : "CC ") + (n.fix[k] ? "on" : "off") + " at " + hh(+m[2]); });
    if (fx.length) lines.push("Fixed: " + LX.esc(fx.join(", ")) + ".");
    if (n.shed > TOL) lines.push(Math.round(n.shed) + " MWh unserved, at " + money(D.penalty) + " per MWh.");
    if (n.frac && n.frac.length) lines.push("Still between 0 and 1: " + LX.esc(n.frac.map(function (f) { return (f.g === "pk" ? "" : "CC ") + hh(f.t) + " " + sw2(f.x); }).join(", ")) + ".");
    if (n.status === "error") lines.push("Its LP did not finish (" + LX.esc(n.why) + "). Until it is solved, its parent's bound, " + (n.bound != null ? money(n.bound) : "none") + ", stays in the best bound: press Retry.");
    if (n.status === "pruned") lines.push((n.inherited ? "Pruned without its LP: its parent's bound" : "Pruned: its bound") + " is no better than the best plan, " + money(T.nodes[n.prunedBy].bound) + ".");
    if (n.status === "best") lines.push("Every switch is 0 or 1: the best plan so far.");
    if (n.status === "integer") lines.push("Every switch is 0 or 1, but a cheaper plan was found.");
    return lines;
  }

  LX.mount("m02-unit-commitment", function (live, data, root) {
    css();
    var D = data.m02_unit_commitment, L = D.lesson, R = D.reference;
    D.day.label = D.day.label || D.day.date;
    root.classList.add("m2-lab");
    var own = LX.store.get(KEY, {}) || {};
    function remember(k, v) { own[k] = v; LX.store.set(KEY, own); }
    function kpi(host, label, value, tone) { var k = E("div", { class: "m2-kpi" + (tone ? " " + tone : "") }, host); E("small", { text: label }, k); E("b", { text: value }, k); return k; }
    function status(host) { return LX.SolverStatus(host); }
    var S0 = { lp: null, relax: {}, plan: null, T: null, milp: null, milpModel: null, stair: {}, fixed: null, fixedModel: null, settle: null };
    function solve(o, key) { return LX.solver.solve(build(D, o), { timeLimit: 5, key: key, label: "m2" }).then(function (r) { return { r: r, day: read(D, o, r) }; }); }
    function needLP() { return S0.lp ? Promise.resolve(S0.lp) : solve({}, "m2-lp").then(function (x) { if (x.day.ok) S0.lp = x.day; return S0.lp; }); }
    function needMILP() {
      if (S0.milp) return Promise.resolve(S0.milp);
      S0.milpModel = build(D, { onoff: true });
      return LX.solver.solve(S0.milpModel, { timeLimit: 10, label: "m2" }).then(function (r) { if (r.ok) { S0.milp = read(D, { onoff: true }, r); S0.milp._r = r; } return S0.milp; });
    }
    // each rule: its name and words (glossary marks), its symbols (shown once added) and a key to every new symbol
    var RULES = [
      { id: "startup", name: "[[start-up-cost|Start-up]] and [[no-load-cost|no-load costs]]", words: "Starting costs $" + D.fleet.pk.startup.toLocaleString("en-US") + " for the peaker, $" + D.fleet.cc.startup.toLocaleString("en-US") + " for the combined-cycle plant; each costs $" + D.fleet.pk.noload + " for every hour it is on.",
        sym: "+&nbsp;<i>NL</i>&thinsp;<i>u</i>" + "<sub><i>g,t</i></sub>&nbsp;+&nbsp;<i>SU</i>&thinsp;<i>v</i><sub><i>g,t</i></sub>&nbsp;&nbsp;with&nbsp;&nbsp;<i>v</i><sub><i>g,t</i></sub>&nbsp;&minus;&nbsp;<i>w</i><sub><i>g,t</i></sub>&nbsp;=&nbsp;<i>u</i><sub><i>g,t</i></sub>&nbsp;&minus;&nbsp;<i>u</i><sub><i>g,t</i>&minus;1</sub>",
        key: [["g, t", "gas plant, hour"], ["u", "the switch, 1 on and 0 off"], ["v, w", "1 in the hour of a start, a stop"], ["NL", "no-load cost, $ per hour on"], ["SU", "start-up cost, $ per start"]] },
      { id: "pmin", name: "[[minimum-stable-output|Minimum output]]", words: "When on, the peaker makes at least " + D.fleet.pk.min + " MW, the combined-cycle plant at least " + D.fleet.cc.min + " MW.",
        sym: "<i>P&#818;</i><sub><i>g</i></sub>&thinsp;<i>u</i><sub><i>g,t</i></sub>&nbsp;&le;&nbsp;<i>p</i><sub><i>g,t</i></sub>&nbsp;&le;&nbsp;<i>P&#772;</i><sub><i>g</i></sub>&thinsp;<i>u</i><sub><i>g,t</i></sub>",
        key: [["p", "output, MW"], ["<span class=\"ul\">P</span>", "minimum output, MW"], ["<span class=\"ol\">P</span>", "size, MW"]] },
      { id: "minrun", name: "[[minimum-run-time|Minimum run]] and [[minimum-down-time|down times]]", words: "Once started, the peaker runs at least " + D.fleet.pk.up + " hours; once stopped, it stays off at least " + D.fleet.pk.down + " hours (the combined-cycle plant: " + D.fleet.cc.up + " and " + D.fleet.cc.down + ").",
        sym: "&sum;<sub>&tau;=max(0,&thinsp;<i>t</i>&minus;<i>UT</i>+1)..<i>t</i></sub>&nbsp;<i>v</i><sub><i>g,&tau;</i></sub>&nbsp;&le;&nbsp;<i>u</i><sub><i>g,t</i></sub>",
        key: [["UT", "minimum run time, hours"], ["τ", "each of the last UT hours up to t, none before the day's first hour"], ["DT", "minimum down time: the same rule for stops w, with 1 − u on the right"]],
        bound: "Counted within this day only: a start at 23:00 owes no hour after midnight, and the states before the day are assumed to have lasted long enough." }
    ];

    var steps = [
      // 1 M1's model on a harder day
      { text: "Prairie Town on " + D.day.label + ", the summer peak: demand reaches " + Math.max.apply(null, D.day.demand) + " MW. Solve M1's [[linear-program|dispatch model]] for the day. Who covers the evening?",
        build: function (act, api) {
          var row = E("div", { class: "m2-row" }, act);
          var go = E("button", { type: "button", class: "lx-btn small", html: LX.icon("play") + "Solve the day" }, row), st = status(row);
          var kp = E("div", { class: "m2-kpis" }, act), ch = NeedChart(E("div", null, act), D);
          function show() {
            kp.innerHTML = ""; kpi(kp, "Day's cost", money(S0.lp.cost));
            var h = S0.lp.hours[L.focus]; kpi(kp, "Peaker at " + hh(L.focus), Math.round(h.p.pk) + " MW", "bad"); ch.render(S0.lp);
          }
          if (S0.lp) { show(); api.done(); }
          go.addEventListener("click", function () {
            st.set(LX.solver.mode ? "solving" : "loading"); api.busy(true);
            solve({}, "m2-lp").then(function (x) {
              st.set(x.r); api.busy(false); if (!x.day.ok) return;
              S0.lp = x.day; show(); api.done();
              var pkHours = S0.lp.hours.filter(function (h) { return h.p.pk > TOL; }).map(function (h) { return h.t; });
              api.saw("Optimal: " + money(S0.lp.cost) + ". Above the combined-cycle plant's " + D.fleet.cc.mw + " MW the [[peaker|peaker]] runs, " + span(pkHours) + ", but only " + Math.round(S0.lp.hours[L.focus].p.pk) + " MW at " + hh(L.focus) + ". A real peaker cannot run steadily below " + D.fleet.pk.min + " MW, its [[minimum-stable-output|minimum output]].");
            });
          });
        } },
      // 2 add the rules; the LP relaxation
      { text: "Real gas plants are on or off. Add the three rules of a [[unit-commitment|unit commitment]], one at a time.",
        build: function (act, api) {
          var list = E("div", { class: "m2-rules", role: "group", "aria-label": "The three rules, added in order" }, act);
          E("p", { class: "m2-tag", html: LX.rich("A linear program can only let each switch slide from 0 to 1: the [[lp-relaxation|relaxation]]. Hatched cells are partly on.") }, act);
          var kp = E("div", { class: "m2-kpis", "aria-live": "polite" }, act), st = status(act);
          var board = SwitchBoard(E("div", null, act), { D: D, sel: L.focus });
          var added = 0, btns = [];
          RULES.forEach(function (r, i) {
            var c = E("div", { class: "m2-rule" }, list);
            E("span", { class: "nm", html: LX.rich(r.name) }, c);
            var plain = r.name.replace(/\[\[[a-z0-9-]+\|([^\]]+)\]\]/g, "$1");
            var b = E("button", { type: "button", class: "lx-btn small ghost", text: "Add", "aria-label": "Add: " + plain }, c);
            var det = E("div", { class: "det" }, c); det.innerHTML = LX.esc(r.words);
            var more = E("div", { class: "m2-more", hidden: true }, det);
            E("span", { class: "m2-sym", html: r.sym }, more);
            var key = E("dl", { class: "m2-key", "aria-label": "Symbols in this rule" }, more);
            r.key.forEach(function (k) { var pr = E("div", null, key); E("dt", { html: k[0] }, pr); E("dd", { text: k[1] }, pr); });
            if (r.bound) E("p", { class: "m2-bound", text: r.bound }, more);
            b.disabled = i > 0;
            btns.push({ b: b, c: c, det: det, more: more, plain: plain });
            b.addEventListener("click", function () { add(i); });
          });
          var SAY = {
            startup: function (d, prev) { return "**Start-up and no-load:** " + money(prev) + " → " + money(d.cost) + ". The relaxation pays " + sw2(d.tot.starts.pk) + " of a peaker start, and keeps the switch at " + sw2(d.hours[L.focus].u.pk) + " at " + hh(L.focus) + "."; },
            pmin: function (d, prev) { return "**Minimum output:** " + (Math.abs(d.cost - prev) < 0.5 ? "no change, " + money(d.cost) : money(prev) + " → " + money(d.cost)) + ". A switch " + pct(d.hours[L.focus].u.pk) + " on needs only " + pct(d.hours[L.focus].u.pk) + " of " + D.fleet.pk.min + " MW, so " + Math.round(d.hours[L.focus].p.pk) + " MW passes."; },
            minrun: function (d, prev) { return "**Minimum run and down times:** " + (Math.abs(d.cost - prev) < 0.5 ? "no change, " + money(d.cost) : money(prev) + " → " + money(d.cost)) + ". Fractions of a start meet them too. The peaker is still " + pct(d.hours[L.focus].u.pk) + " on at " + hh(L.focus) + ": a schedule nobody can operate."; }
          };
          function rulesUpTo(i) { var o = {}; RULES.forEach(function (r, k) { if (k <= i) o[r.id] = true; }); return o; }
          function add(i) {
            if (i !== added) return;
            var rules = rulesUpTo(i);
            st.set(LX.solver.mode ? "solving" : "loading"); api.busy(true); btns[i].b.disabled = true;
            Promise.all([needLP(), solve({ onoff: true, relax: true, rules: rules }, "m2-relax")]).then(function (xs) {
              var x = xs[1]; st.set(x.r); api.busy(false);
              if (!x.day.ok) { btns[i].b.disabled = false; return; }
              var prev = i === 0 ? xs[0].cost : S0.relax[i - 1].cost;
              S0.relax[i] = x.day; added = i + 1;
              btns[i].c.classList.add("added"); btns[i].b.textContent = "Added"; btns[i].b.setAttribute("aria-label", "Added: " + btns[i].plain); btns[i].more.hidden = false;
              if (btns[i + 1]) { btns[i + 1].b.disabled = false; }
              kp.innerHTML = ""; kpi(kp, "Relaxed cost", money(x.day.cost)); kpi(kp, "Peaker switch at " + hh(L.focus), sw2(x.day.hours[L.focus].u.pk), "warn");
              board.set(x.day); board.pick(L.focus);
              var focusBtn = btns[i + 1] ? btns[i + 1].b : null; if (focusBtn) focusBtn.focus();
              api.saw(SAY[RULES[i].id](x.day, prev), i < RULES.length - 1);
              if (added === RULES.length) { S0.relaxAll = x.day; api.done(); }
            });
          }
          if (S0.relaxAll) { for (var k = 0; k < RULES.length; k++) { btns[k].c.classList.add("added"); btns[k].b.textContent = "Added"; btns[k].b.setAttribute("aria-label", "Added: " + btns[k].plain); btns[k].b.disabled = true; btns[k].more.hidden = false; } added = RULES.length; board.set(S0.relaxAll); kpi(kp, "Relaxed cost", money(S0.relaxAll.cost)); api.done(); }
        } },
      // 3 the learner's own commitment
      { text: "Why not round? Set the peaker's switches yourself, or start from the relaxation's, rounded. The combined-cycle plant stays on all day. Find a plan with nothing unserved.",
        build: function (act, api) {
          var sw = (own.plan && own.plan.length === 24) ? own.plan.slice() : D.day.demand.map(function () { return 0; });
          var row = E("div", { class: "m2-row" }, act);
          var rb = E("button", { type: "button", class: "lx-btn small ghost", text: "Round the relaxation's switches" }, row);
          var clr = E("button", { type: "button", class: "lx-btn small ghost", text: "All off" }, row);
          E("p", { class: "m2-tag", text: "Peaker, " + hh(L.edit[0]) + " to " + hh(L.edit[L.edit.length - 1]) + " (off in the other hours); tap an hour to switch it." }, act);
          var ed = E("div", { class: "m2-edit", role: "group", "aria-label": "Peaker on or off, by hour" }, act);
          var tgs = {};
          L.edit.forEach(function (t) {
            var b = E("button", { type: "button", class: "m2-tg", "aria-pressed": sw[t] ? "true" : "false", "aria-label": "Peaker at " + hh(t) }, ed);
            b.innerHTML = String(t) + "<small>" + (sw[t] ? "on" : "off") + "</small>";
            b.addEventListener("click", function () { sw[t] = sw[t] ? 0 : 1; paint(); run(); });
            tgs[t] = b;
          });
          var st = status(act), kp = E("div", { class: "m2-kpis" }, act), brk = E("ul", { class: "m2-breaks", "aria-live": "polite" }, act);
          function paint() {
            var bad = {}; planBreaks(D, sw).forEach(function (x) { for (var t = x.from; t <= x.to; t++) bad[t] = 1; });
            L.edit.forEach(function (t) { var b = tgs[t]; b.setAttribute("aria-pressed", sw[t] ? "true" : "false"); b.querySelector("small").textContent = sw[t] ? "on" : "off"; b.classList.toggle("broke", !!bad[t]); });
          }
          var req = 0;
          function run() {
            var my = ++req, br = planBreaks(D, sw);
            remember("plan", sw.slice());
            brk.innerHTML = "";
            br.forEach(function (x) { E("li", { text: (x.kind === "run" ? "Breaks the " + D.fleet.pk.up + "-hour minimum run: on " : "Breaks the " + D.fleet.pk.down + "-hour minimum down time: off ") + span(x.from === x.to ? [x.from] : [x.from, x.to]) + " only." }, brk); });
            st.set("solving"); api.busy(true);
            var o = { onoff: true, fix: planFix(D, sw) };
            solve(o, "m2-plan").then(function (x) {
              if (my !== req || x.r.status === "superseded" || x.r.status === "cancelled") return;
              st.set(x.r); api.busy(false); kp.innerHTML = "";
              if (!x.day.ok) { kpi(kp, "Plan", "breaks a rule", "bad"); api.saw("No plan meets every rule with these switches: " + (br.length ? "see the rule marked in red." : "the solver reports " + x.r.status + "."), true); return; }
              S0.plan = x.day;
              kpi(kp, "Your plan's cost", money(x.day.cost)); kpi(kp, "Unserved", Math.round(x.day.tot.shed) + " MWh", x.day.tot.shed > TOL ? "bad" : "good");
              var on = sw.map(function (v) { return v ? 1 : 0; });
              if (x.day.tot.shed > TOL) {
                var hrs = runs(x.day.hours.map(function (h) { return h.shed > TOL ? 1 : 0; }));
                api.saw(peakerWords(on) + ": " + Math.round(x.day.tot.shed) + " MWh unserved (" + hrs + "), at " + money(D.penalty) + " per MWh: " + money(x.day.cost) + ".", true);
              } else {
                remember("planCost", x.day.cost); api.done();
                api.saw(peakerWords(on) + ": nothing unserved, " + money(x.day.cost) + ". Is any plan cheaper? The peaker alone has 2²⁴ on/off patterns; the next step proves the answer without trying them all.");
              }
            });
          }
          rb.addEventListener("click", function () {
            var src = S0.relaxAll;
            var p = src ? Promise.resolve(src) : solve({ onoff: true, relax: true }, "m2-relax").then(function (x) { if (x.day.ok) S0.relaxAll = x.day; return S0.relaxAll; });
            p.then(function (d) { if (!d) return; sw = rounded(D, d); paint(); run(); });
          });
          clr.addEventListener("click", function () { sw = sw.map(function () { return 0; }); paint(); run(); });
          paint(); run();
        } },
      // 4 branch and bound
      { text: "[[branch-and-bound|Branch and bound]] proves it. Press Branch: the switch nearest half on is split into off and on, and both are solved.",
        build: function (act, api) {
          var how = E("ol", { class: "m2-brules", "aria-label": "How to read the tree" }, act);
          ["Each node's cost is a [[lower-bound|lower bound]] for every plan below it.", "A node no cheaper than the best plan is pruned.",
            "The open node with the lowest bound is split next."].forEach(function (s) { E("li", { html: LX.rich(s) }, how); });
          var row = E("div", { class: "m2-row" }, act);
          var go = E("button", { type: "button", class: "lx-btn small", html: LX.icon("play") + "Branch" }, row);
          var fin = E("button", { type: "button", class: "lx-btn small ghost", text: "Finish the tree" }, row);
          var re = E("button", { type: "button", class: "lx-btn small ghost", text: "Retry the unsolved node", hidden: true }, row), st = status(row);
          var kp = E("div", { class: "m2-kpis", "aria-live": "polite" }, act);
          var box = E("div", { class: "m2-treebox" }, act), view, panel = E("div", { class: "m2-tread", "aria-live": "polite" }, null);
          view = TreeView(box, { label: "Branch-and-bound tree for the peaker's switches", onPick: function (n) { readNode(n); } });
          box.appendChild(panel);
          var T = S0.T || tree(D, {}), busy = false;
          S0.T = T;
          function readNode(n) { panel.innerHTML = ""; nodeWords(D, T, n).forEach(function (s) { E("p", { html: s }, panel); }); }
          function kpis() {
            kp.innerHTML = "";
            var lb = treeBound(T), g = treeGap(T);
            kpi(kp, "Best bound", lb == null || !isFinite(lb) ? "–" : money(lb));
            kpi(kp, "Best plan", T.inc ? money(T.inc.bound) : "none yet", T.inc ? "good" : null);
            kpi(kp, "Gap", g == null ? "–" : (g * 100).toFixed(1) + "%", treeFailed(T).length ? "bad" : null);
            kpi(kp, "LPs solved", String(T.solved));
          }
          // Branch needs an open node; Finish also waits for a solve under way; Retry shows while a node is unresolved
          function controls() {
            var open = treeOpen(T).length > 0, pend = T.nodes.some(function (n) { return n.status === "pending"; });
            go.disabled = busy || !open; fin.disabled = !open && !pend; re.hidden = !treeFailed(T).length; re.disabled = busy;
          }
          // S0.failAt (demo state "tree-fail" only) turns that node solve into a time limit, to show what the page does then
          function solveNode(m) {
            S0.nodeSolves = (S0.nodeSolves || 0) + 1;
            if (S0.failAt === S0.nodeSolves) return Promise.resolve({ status: "time-limit", ok: false, objective: null, values: null });
            return LX.solver.solve(m.model, { timeLimit: 5, label: "m2" });
          }
          function settleAll() {
            var pend = treePending(T);
            if (!pend.length) return Promise.resolve();
            st.set(LX.solver.mode ? "solving" : "loading");
            return Promise.all(pend.map(solveNode)).then(function (rs) {
              rs.forEach(function (r, k) { treeAccept(T, pend[k].id, r); });
              st.set(rs.filter(function (r) { return !r.ok && r.status !== "infeasible"; })[0] || rs[rs.length - 1]);
            });
          }
          function kidWords(n) {
            if (n.status === "error") return "not solved (" + n.why + ")";
            if (n.status === "infeasible") return "infeasible";
            return money(n.bound) + (n.shed > TOL ? ", " + Math.round(n.shed) + " MWh unserved" : "") + (n.status === "best" ? ": every switch whole, the best plan so far" :
              n.status === "integer" ? ", every switch whole" : n.status === "open" ? ", still fractional" : n.status === "pruned" ? ", pruned" : "");
          }
          // what the tree says now: the last split, then the verdict once nothing is left to branch ("proven" only if treeProven)
          function after(br) {
            view.draw(T); kpis(); controls();
            if (br) {
              view.select(br.kids[1].id);
              api.saw("Split the peaker at " + hh(br.on.t) + " (" + sw2(br.on.x) + "). **Off:** " + kidWords(T.nodes[br.kids[0].id]) + ". **On:** " + kidWords(T.nodes[br.kids[1].id]) + ".");
            }
            var v = treeVerdict(D, T);
            if (v && v.proven) {
              remember("tree", { lps: T.solved, branchings: T.branchings, best: T.inc.bound, root: T.nodes[0].bound });
              api.done(); api.saw(v.text);
            } else if (v) api.saw(v.text, true);
            else if (!br) { var r0 = T.nodes[0]; if (T.nodes.length === 1 && r0.frac) api.saw("The root: " + money(r0.bound) + ", with " + r0.frac.length + " switches between 0 and 1. No plan with whole switches can cost less. Press Branch.", true); }
          }
          function step() {
            if (busy || !treeOpen(T).length) return Promise.resolve(false);
            busy = true; api.busy(true); controls();
            var br = treeBranch(T); view.draw(T);
            return settleAll().then(function () { busy = false; api.busy(false); after(br); return true; });
          }
          go.addEventListener("click", function () { step(); });
          fin.addEventListener("click", function () {
            (function loop() {
              if (busy) { setTimeout(loop, 120); return; }   // a solve is under way (the first one loads the solver): wait for it
              step().then(function (more) { if (more && treeOpen(T).length) setTimeout(loop, LX.reduced() ? 0 : 350); });
            })();
          });
          re.addEventListener("click", function () {
            if (busy || !treeRetry(T)) return;
            busy = true; api.busy(true); controls(); view.draw(T);
            settleAll().then(function () { busy = false; api.busy(false); after(null); var f = T.nodes.filter(function (n) { return n.tries > 1; }).pop(); if (f) view.select(f.id); });
          });
          if (T.nodes[0].status === "pending") {
            busy = true; api.busy(true); controls();
            settleAll().then(function () { busy = false; api.busy(false); after(null); view.select(0); });
          } else { view.draw(T); kpis(); controls(); var v0 = treeVerdict(D, T); if (v0 && v0.proven) api.done(); }
        } },
      // 5 ask HiGHS for the mixed-integer program
      { text: function () { var z = size(build(D, { onoff: true })); return "Now hand the whole problem to HiGHS as a [[mixed-integer-program|mixed-integer program]]: " + z.vars + " decisions and " + z.rows + " rules, " + z.switches + " switches that must be 0 or 1."; },
        build: function (act, api) {
          var row = E("div", { class: "m2-row" }, act);
          var go = E("button", { type: "button", class: "lx-btn small", html: LX.icon("play") + "Solve the mixed-integer program" }, row), st = status(row);
          var kp = E("div", { class: "m2-kpis" }, act), board = SwitchBoard(E("div", null, act), { D: D, sel: L.focus });
          function show(r) {
            kp.innerHTML = ""; kpi(kp, "Cost", money(S0.milp.cost)); kpi(kp, "Optimality gap", r.mipGap != null ? (r.mipGap * 100).toFixed(2) + "%" : "0%");
            kpi(kp, "Duals returned", r.duals ? "yes" : "none", "warn"); board.set(S0.milp);
          }
          if (S0.milp) { show(S0.milp._r); api.done(); }
          go.addEventListener("click", function () {
            st.set(LX.solver.mode ? "solving" : "loading"); api.busy(true);
            S0.milp = null;
            needMILP().then(function (d) {
              api.busy(false); if (!d) { st.set("error"); return; }
              var r = d._r; st.set(r); show(r); api.done();
              var tr = S0.T && treeProven(S0.T) && Math.abs(S0.T.inc.bound - d.cost) < 0.5 ? ", the plan your tree proved" : "";
              api.saw("Optimal: " + money(d.cost) + ", gap " + (r.mipGap != null ? (r.mipGap * 100).toFixed(2) : "0.00") + "%" + tr + ". " + peakerWords(d.hours.map(function (h) { return Math.round(h.u.pk); })) + ". HiGHS returns no duals for a mixed-integer solve, so there are no [[shadow-price|shadow prices]] to read.");
            });
          });
        } },
      // 6 the day's cost as demand is added at 23:00, in half-MWh steps: its slope rises, then falls, as no LP's can
      { text: "Then what does one more MWh cost? Add demand at " + hh(L.stair.hour) + " in half-MWh steps; the mixed-integer program is solved again each time.",
        build: function (act, api) {
          var XS = stairPoints(D), H0 = L.stair.hour, cc = D.fleet.cc.cost;
          var sl = LX.Slider(act, { label: "MWh added at " + hh(H0), color: "var(--lx-demand)", min: 0, max: L.stair.max, step: L.stair.step, fmt: function (v) { return v + " MWh"; }, onChange: function (v) { run(v); } });
          var st = status(act), P = LX.Plot(E("div", null, act), { caption: true, text: "Text version of the chart", box: true }), kp = E("div", { class: "m2-kpis", "aria-live": "polite" }, act);
          var seen = S0.stair;   // index into XS -> {x, cost (extra cost of the day), shed (MWh unserved at 23:00), pk (peaker on at 23:00)}
          if (!seen[0]) seen[0] = { x: 0, cost: 0, shed: 0, pk: false };
          // the points solved so far, from 0 MWh up to v without a gap
          function pts(v) { var out = []; for (var k = 0; k < XS.length && XS[k] <= v + 1e-9 && seen[k]; k++) out.push(seen[k]); return out; }
          function tone(p) { return p.shed > TOL ? "var(--lx-warn)" : p.pk ? D.fleet.pk.color : "var(--lx-ink)"; }
          function draw() {
            var a = pts(L.stair.max);
            var top = Math.max(500, Math.ceil(Math.max.apply(null, a.map(function (p) { return p.cost; })) / 500) * 500);
            P.render({
              caption: "Extra cost of the day as demand is added at " + hh(H0) + " (mixed-integer program solved each time)",
              x: { min: 0, max: L.stair.max, ticks: [0, 2, 4, 6, 8, 10].filter(function (v) { return v <= L.stair.max; }).map(function (v) { return [v, v + " MWh"]; }), ticksN: [[0, "0"], [5, "5 MWh"], [10, "10"]] },
              y: { min: 0, max: top, step: top / 5, fmt: function (v) { return "$" + Math.round(v).toLocaleString("en-US"); } },
              lines: [{ pts: [[0, 0], [L.stair.max, cc * L.stair.max]], color: "var(--lx-ink-3)", dash: "5 4", width: 1.6 }].concat(a.length > 1 ? [{ pts: a.map(function (p) { return [p.x, p.cost]; }), color: "var(--lx-ink-2)", width: 1.6 }] : []),
              marks: a.map(function (p) { return { x: p.x, y: p.cost, kind: "dot", color: tone(p), label: Math.abs(p.x - sl.val()) < 1e-9 ? money(p.cost) : "" }; }),
              legend: [{ label: money(cc) + "/MWh, the combined-cycle plant's running cost", color: "var(--lx-ink-3)", dash: "5 4" }, { label: "Some demand unserved", color: "var(--lx-warn)" },
                { label: "Peaker on at " + hh(H0), color: D.fleet.pk.color }],
              aria: "Extra cost of the day against MWh added at " + hh(H0),
              text: { head: ["MWh added", "Extra cost of the day", "Unserved at " + hh(H0), "Peaker at " + hh(H0)],
                rows: a.map(function (p) { return [p.x + " MWh", money(p.cost), p.shed > TOL ? r6(p.shed) + " MWh" : "–", p.pk ? "on" : "off"]; }) }
            }, false);
          }
          // every step from 0 to v is solved (in order, once each), so the curve has no gaps
          var req = 0;
          function run(v) {
            var my = ++req; st.set("solving"); api.busy(true);
            needMILP().then(function (base) {
              if (!base) { api.busy(false); return; }
              seen[0] = { x: 0, cost: 0, shed: base.hours[H0].shed, pk: Math.round(base.hours[H0].u.pk) === 1 };
              var todo = []; for (var k = 1; k < XS.length && XS[k] <= v + 1e-9; k++) if (!seen[k]) todo.push(k);
              var last = { status: "optimal" };
              (function next() {
                if (my !== req) return;
                if (!todo.length) { st.set(last); api.busy(false); draw(); report(v); return; }
                var k = todo.shift(), o = { onoff: true, add: { hour: H0, mw: XS[k] } };
                LX.solver.solve(build(D, o), { timeLimit: 10, label: "m2" }).then(function (r) {
                  last = r; if (!r.ok) { st.set(r); api.busy(false); draw(); return; }
                  var h = read(D, o, r).hours[H0];
                  seen[k] = { x: XS[k], cost: r6(r.objective - base.cost), shed: h.shed, pk: Math.round(h.u.pk) === 1 };
                  draw(); next();
                });
              })();
            });
          }
          function report(v) {
            kp.innerHTML = "";
            var a = pts(v), p = a[a.length - 1];
            if (!p) return;
            kpi(kp, p.x + " MWh more", "+" + money(p.cost));
            if (a.length > 1) { var s1 = stairSlopes(a.slice(-2))[0]; kpi(kp, "Last step costs", money(s1) + "/MWh", s1 > cc + 1 ? "bad" : null); }
            kpi(kp, "Unserved at " + hh(H0), p.shed > TOL ? r6(p.shed) + " MWh" : "none", p.shed > TOL ? "bad" : null);
            kpi(kp, "Peaker at " + hh(H0), p.pk ? "on" : "off");
            var w = stairWords(D, a);
            if (w.done) { remember("stair", { slopes: stairSlopes(a) }); api.done(); api.saw(w.text); } else api.saw(w.text, true);
          }
          S0.stairUI = { sl: sl, run: run };
          var have = pts(L.stair.max), maxSeen = have[have.length - 1].x;
          sl.set(maxSeen); draw();
          if (maxSeen > 0) report(maxSeen);
        } },
      // 7 fix the switches and re-price
      { text: "Fix every switch as HiGHS set it, and re-solve the dispatch LP. Its duals are prices again: [[conditional-price|conditional on this commitment]].",
        build: function (act, api) {
          var row = E("div", { class: "m2-row" }, act);
          var go = E("button", { type: "button", class: "lx-btn small", html: LX.icon("play") + "Fix the switches and re-price" }, row), st = status(row);
          var ch = LX.PriceChart(E("div", null, act), { label: "Hourly prices conditional on the commitment, dollars per MWh, with the dispatch model's prices dashed.", ghostLabel: "Dispatch model, no switches (step 1)" });
          var kp = E("div", { class: "m2-kpis", "aria-live": "polite" }, act);
          function show() {
            ch.set({ series: [{ id: "c", label: "Conditional on the commitment", color: "var(--lx-ink)", v: S0.fixed.hours.map(function (h) { return h.price; }) }], ghost: S0.lp ? S0.lp.hours.map(function (h) { return h.price; }) : null, sel: L.check[0] });
          }
          if (S0.fixed) { show(); api.done(); }
          go.addEventListener("click", function () {
            st.set(LX.solver.mode ? "solving" : "loading"); api.busy(true);
            Promise.all([needMILP(), needLP()]).then(function () {
              if (!S0.milp) { api.busy(false); return; }
              return LX.solver.fixAndReprice(S0.milpModel, S0.milp._r, { timeLimit: 5, label: "m2" }).then(function (r) {
                st.set(r); if (!r.ok) { api.busy(false); return; }
                S0.fixed = read(D, { onoff: true }, r); S0.fixed._r = r; S0.fixedModel = LX.solver.fixedModel(S0.milpModel, S0.milp._r.values).model;
                show();
                // check two prices by a finite difference, with the switches still fixed
                return Promise.all(L.check.map(function (t) {
                  var m = JSON.parse(JSON.stringify(S0.fixedModel, function (k, v) { return v === Infinity ? "Infinity" : v; }), function (k, v) { return v === "Infinity" ? Infinity : v; });
                  m.constraints.forEach(function (c) { if (c.name === "bal_" + t) { if (c.lb != null) c.lb += 1; if (c.ub != null) c.ub += 1; } });
                  return LX.solver.solve(m, { timeLimit: 5, label: "m2" });
                })).then(function (rs) {
                  api.busy(false); kp.innerHTML = "";
                  var fd = rs.map(function (x) { return x.ok ? r6(x.objective - r.objective) : null; });
                  L.check.forEach(function (t, k) { kpi(kp, "+1 MWh at " + hh(t), fd[k] != null ? "+" + money(fd[k]) : "–"); });
                  remember("prices", S0.fixed.hours.map(function (h) { return h.price; }));
                  api.done();
                  var hi = S0.fixed.hours.filter(function (h) { return h.price > D.fleet.cc.cost + 1; }).map(function (h) { return h.t; });
                  var pkMin = S0.milp.hours.filter(function (h) { return Math.round(h.u.pk) && Math.abs(h.p.pk - D.fleet.pk.min) < TOL; }).map(function (h) { return h.t; });
                  api.saw(money(D.fleet.cc.cost) + "/MWh in most hours, " + money(D.fleet.pk.cost) + "/MWh at " + span(hi) + ", confirmed by +1 MWh at " + L.check.map(hh).join(" and ") + ". At " + list(pkMin.map(hh)) + " the peaker is held at its " + D.fleet.pk.min + " MW minimum: the combined-cycle plant sets the price.");
                });
              });
            });
          });
        } },
      // 8 settle: uplift
      { text: "Settle the day: pay every plant the conditional price for each MWh it made. Predict first: does the peaker cover its costs?",
        build: function (act, api) {
          var area = E("div", null, null);
          var p = LX.Predict(act, { id: "m2-uplift", fresh: true, q: "At these prices the peaker…", answer: "short",
            options: [{ value: "more", label: "earns more than its costs" }, { value: "just", label: "just covers them" }, { value: "short", label: "falls short" }],
            feedback: { more: "It is paid its own cost only in its busiest hours.", just: "Running cost is only part of what it spends.", short: "Prices pay the last MWh, not the start or the hours at its minimum." },
            onPick: function () { p.reveal(); reveal(); } });
          act.appendChild(area);
          var st = status(area);
          function reveal() {
            st.set("solving"); api.busy(true);
            var pr = S0.fixed ? Promise.resolve(S0.fixed) : needMILP().then(function () {
              return LX.solver.fixAndReprice(S0.milpModel, S0.milp._r, { timeLimit: 5, label: "m2" }).then(function (r) { if (r.ok) S0.fixed = read(D, { onoff: true }, r); return S0.fixed; });
            });
            pr.then(function (fx) {
              api.busy(false); if (!fx) { st.set("error"); return; } st.set({ status: "optimal" });
              var prices = fx.hours.map(function (h) { return h.price; }), s = settle(D, S0.milp, prices), k = s.pk, c = s.cc;
              S0.settle = s; remember("settle", { pk: k, cc: c });
              area.innerHTML = "";
              var sp = E("div", { class: "m2-split" }, area), left = E("div", null, sp), right = E("div", null, sp);
              LX.CostSplit(left, {
                parts: [{ key: "running", label: "Running ($" + D.fleet.pk.cost + "/MWh)", color: D.fleet.pk.color, words: "running" }, { key: "noload", label: "No-load", color: "var(--lx-warn)", words: "no-load" },
                  { key: "startup", label: "Start-up", color: "var(--lx-bad)", words: "start-up" }, { key: "paid", label: "Paid at the prices", color: "var(--lx-good)", words: "paid" }],
                rows: [{ key: "cost", label: "Peaker: costs", color: D.fleet.pk.color, values: { running: k.running, noload: k.noload, startup: k.startup }, total: k.cost },
                  { key: "paid", label: "Peaker: paid", color: "var(--lx-good)", values: { paid: k.revenue }, total: k.revenue }],
                fmt: function (v) { return money(v); } });
              var kp = E("div", { class: "m2-kpis" }, right);
              kpi(kp, "Peaker short", money(k.uplift), "bad"); kpi(kp, "Gas CC above its costs", money(c.profit), "good");
              E("p", { class: "m2-tag", style: "margin-top:10px", text: "The " + money(k.uplift) + " short, in three parts:" }, right);
              var ul = E("ul", { class: "m2-ul" }, right);
              var minMWh = k.shortHours.reduce(function (a, t) { return a + S0.milp.hours[t].p.pk; }, 0);
              E("li", { text: "One start: " + money(k.startup) }, ul);
              E("li", { text: "No-load: " + money(k.noload) + " (" + k.hoursOn + " hours × " + money(D.fleet.pk.noload) + ")" }, ul);
              E("li", { text: Math.round(minMWh) + " MWh at its minimum (" + list(k.shortHours.map(hh)) + "), paid " + money(D.fleet.cc.cost) + " against " + money(D.fleet.pk.cost) + " per MWh: " + money(k.energyShort) }, ul);
              api.done();
              api.saw("Paid " + money(k.revenue) + " against " + money(k.cost) + " of costs: short " + money(k.uplift) + ". Markets cover such gaps outside the price, with [[uplift|uplift]] (make-whole) payments under their own rules. The combined-cycle plant ends " + money(c.profit) + " above its costs.");
            });
          }
        } }
    ];

    var cardsHost = E("div", { class: "m2-cards" }, live);
    var cards = LX.StepCards(cardsHost, { id: "m2-steps", steps: steps, onStep: function (i) {
      if (i === 0) { try { LX.solver.preload(); } catch (e) { /* the first solve loads it */ } }
      if (i === steps.length - 1) remember("reached", true);
    } });
    // demo states (core.js LX.demo): "mid" = step 1 with the day solved; "step-2" (or "relax") = the three rules added;
    // "step-3" (or "round") = the rounded plan; "tree" = step 4 with the tree finished ("tree-fail": with the last node's LP
    // turned into a time limit, so the page must not claim optimality); "stair" = step 6 at 7 MWh;
    // "prices" = step 7 re-priced; "uplift" = step 8 revealed; any other "step-N" opens card N
    LX.demo(root, function (state) {
      function click(sel) { var b = cardsHost.querySelector(sel); if (b) b.click(); }
      if (state === "mid") { cards.go(0); click(".lx-step-act .lx-btn"); return { view: "solved" }; }
      if (state === "step-2" || state === "relax") {
        cards.go(1);
        [0, 1, 2].forEach(function (k) { setTimeout(function () { var b = cardsHost.querySelectorAll(".m2-rule .lx-btn")[k]; if (b && !b.disabled) b.click(); }, 300 + 700 * k); });
        return { view: "relax" };
      }
      if (state === "step-3" || state === "round") { cards.go(2); setTimeout(function () { click(".lx-step-act .lx-btn"); }, 300); return { view: "round" }; }
      if (state === "tree" || state === "tree-fail") {
        if (state === "tree-fail") S0.failAt = R.tree.lps;   // the last node's LP comes back as a time limit
        cards.go(3); setTimeout(function () { var b = cardsHost.querySelectorAll(".lx-step-act .lx-btn")[1]; if (b) b.click(); }, 400); return { view: state };
      }
      if (state === "stair") { cards.go(5); setTimeout(function () { if (S0.stairUI) { S0.stairUI.sl.set(7); S0.stairUI.run(7); } }, 300); return { view: "stair" }; }
      if (state === "prices") { cards.go(6); click(".lx-step-act .lx-btn"); return { view: "prices" }; }
      if (state === "uplift") { cards.go(7); var c = cardsHost.querySelectorAll(".lx-choice")[2]; if (c) c.click(); return { view: "uplift" }; }
      return null;
    }, cards);
    explain(D);
  });

  // ---------------------------------------------------------------- explain layer: the search as a flowchart, four models
  // compared, the formulation as an equation card. Numbers from the reference block (precomputed, checked by the test).
  function explain(D) {
    var x = document.getElementById("m2-explain");
    if (!x) return;
    var R = D.reference, F = D.fleet, sym = LX.EquationCard.sym;
    x.innerHTML = "";
    var tr = R.tree, root = tr.nodes[0];
    // 1 the search
    LX.Flowchart(E("div", { class: "lx-xcard" }, x), {
      title: "Branch and bound, node by node",
      lede: "Every node runs the same three questions. Trace four of this lesson's nodes.",
      nodes: {
        s: { t: "Solve a node's LP", s: "switches 0 to 1, some fixed", sN: "some switches fixed", k: "end" },
        q1: { t: "No better than the best plan?", tN: ["No better than", "the best plan?"], k: "q" },
        pr: { t: "Prune it", s: "nothing below can win", sN: "nothing below wins", k: "end" },
        q2: { t: "Every switch 0 or 1?", tN: ["Every switch", "0 or 1?"], k: "q" },
        inc: { t: "New best plan", s: "prune worse open nodes", sN: "prune worse nodes", k: "end" },
        br: { t: "Branch: off and on", s: "switch nearest ½; lowest bound next", sN: "nearest ½ first", k: "end" }
      },
      cols: 3, at: { s: [1, 0], q1: [1, 1], pr: [2.1, 1.9], q2: [1, 2.4], inc: [2.1, 3.3], br: [1, 3.8] },
      colsN: 2, atN: { s: [0, 0], q1: [0, 1], pr: [1, 1.9], q2: [0, 2.4], inc: [1, 3.3], br: [0, 3.9] },
      edges: [["s", "q1"], ["q1", "pr", "yes"], ["q1", "q2", "no"], ["q2", "inc", "yes"], ["q2", "br", "no"]],
      traces: [
        { label: "The relaxed day", path: ["s", "q1", "q2", "br"], text: money(root.bound) + " with " + tr.rootFrac + " switches between 0 and 1: split the peaker at " + hh(tr.first.t) + " (" + sw2(tr.first.x) + ")." },
        { label: "Peaker off at " + hh(tr.first.t), path: ["s", "q1", "pr"], text: money(tr.firstOff.bound) + ", " + tr.firstOff.shed + " MWh unserved. Once a " + money(tr.firstPlan) + " plan exists it is pruned." },
        { label: "Peaker off at " + hh(tr.last.t), path: ["s", "q1", "q2", "inc"], text: money(tr.firstPlan) + ": every switch whole, " + tr.firstPlanShed + " MWh unserved. The first plan: it prunes " + tr.prunedByFirst + " open nodes." },
        { label: "Peaker on at " + hh(tr.last.t), path: ["s", "q1", "q2", "inc"], text: money(R.milp) + ": the new best plan. No open node is left, so it is optimal: " + tr.branchings + " branchings, " + tr.lps + " LPs." }
      ],
      sel: 0
    });
    // 2 four models compared
    LX.CompareTable(E("div", { class: "lx-xcard" }, x), {
      title: "Four models of the same day", text: true,
      columns: [{ key: "name", label: "Model", main: true }, { key: "sw", label: "Switches", phoneHide: true }, { key: "cost", label: "Cost of the day", num: true },
        { key: "run", label: "Can it be run?", phone: "Runs?" }, { key: "pr", label: "Prices" }],
      rows: [
        { key: "lp", color: "var(--lx-ink-3)", name: "Dispatch LP", note: "M1's model, no switches", sw: "none", cost: money(R.lp), run: "No: peaker at " + R.lpFocus + " MW", pr: "24 duals; " + money(F.pk.cost) + "/MWh at " + R.lpHigh },
        { key: "rx", color: "var(--lx-warn)", name: "Relaxed commitment", note: "an LP, switches 0 to 1", sw: "between 0 and 1", cost: money(R.relax), run: "No: peaker " + R.relaxFocus + " on", pr: "duals of plants partly on: not used" },
        { key: "mi", color: "var(--lx-good)", name: "Unit commitment", note: "a mixed-integer program", sw: "0 or 1", cost: money(R.milp), run: "Yes", pr: "none: no duals" },
        { key: "fx", color: "var(--lx-ink)", name: "Switches fixed", note: "the dispatch LP again", sw: "fixed at the MILP's", cost: money(R.milp), run: "Yes", pr: "conditional: " + money(F.cc.cost) + "/MWh; " + money(F.pk.cost) + "/MWh at " + R.condHigh + "; uplift " + money(R.uplift) }
      ],
      sorts: [{ label: "As built", order: ["lp", "rx", "mi", "fx"], note: "Each model adds realism. The relaxation's " + money(R.relax) + " is a lower bound on the commitment's " + money(R.milp) + "; prices come back only when the switches are fixed." }]
    });
    // 3 the formulation
    LX.EquationCard(E("div", { class: "lx-xcard" }, x), {
      title: "The unit commitment, as equations",
      lede: "Tap a symbol: its meaning, its unit, this lesson's number and its code.",
      dense: true, label: "The unit-commitment model; each symbol is a button", textLabel: "Text version: the rows read aloud, then every symbol",
      fields: [{ key: "you", label: "In this lesson" }, { key: "code", label: "In code", code: true }],
      rows: [
        { html: "min " + sym("sum", "Σ<sub><var>t</var>,<var>g</var></sub>") + " ( " + sym("c", "<var>c</var><sub><var>g</var></sub>") + " " + sym("p", "<var>p</var><sub><var>g,t</var></sub>") + " + " + sym("NL", "<var>NL</var><sub><var>g</var></sub>") + " " + sym("u", "<var>u</var><sub><var>g,t</var></sub>") + " + " + sym("SU", "<var>SU</var><sub><var>g</var></sub>") + " " + sym("v", "<var>v</var><sub><var>g,t</var></sub>") + " ) + " + sym("V", "<var>V</var>") + " Σ<sub><var>t</var></sub> " + sym("s", "<var>s</var><sub><var>t</var></sub>"), tag: "goal",
          say: "Minimise, over hours t and gas plants g, running cost c times output p, plus no-load cost NL times the switch u, plus start-up cost SU times the start-up v; plus the penalty V times unserved demand s. The 100 MW that runs flat all day adds the same cost to every plan, so it is left out." },
        { html: "100 + " + sym("r", "<var>r</var><sub><var>t</var></sub>") + " + Σ<sub><var>g</var></sub> " + sym("p", "<var>p</var><sub><var>g,t</var></sub>") + " + " + sym("s", "<var>s</var><sub><var>t</var></sub>") + " = " + sym("d", "<var>d</var><sub><var>t</var></sub>"), tag: "balance",
          say: "Every hour, 100 MW of nuclear plus wind and solar used plus the gas outputs plus unserved demand equals demand." },
        { html: sym("Pmin", "<var>P̲</var><sub><var>g</var></sub>") + " " + sym("u", "<var>u</var><sub><var>g,t</var></sub>") + " ≤ " + sym("p", "<var>p</var><sub><var>g,t</var></sub>") + " ≤ " + sym("Pmax", "<var>P̄</var><sub><var>g</var></sub>") + " " + sym("u", "<var>u</var><sub><var>g,t</var></sub>"), tag: "output",
          say: "Output is between the minimum and the size when the switch is on, and zero when it is off." },
        { html: sym("v", "<var>v</var><sub><var>g,t</var></sub>") + " − " + sym("w", "<var>w</var><sub><var>g,t</var></sub>") + " = " + sym("u", "<var>u</var><sub><var>g,t</var></sub>") + " − " + sym("u", "<var>u</var><sub><var>g,t</var>−1</sub>"), tag: "start and stop",
          say: "A start-up minus a shut-down equals the change of the switch from the hour before." },
        { html: sym("u", "<var>u</var><sub>cc,−1</sub>") + " = " + sym("u", "<var>u</var><sub>cc,23</sub>") + " = 1,  " + sym("u", "<var>u</var><sub>pk,−1</sub>") + " = 0", tag: "the day's ends",
          say: "The end condition: the combined-cycle plant is on before the day and must be on in the last hour, 23:00, so the day ends as it began. The peaker starts the day off and may end it either way." },
        { html: "Σ<sub>" + sym("tau", "τ") + "=max(0, <var>t</var>−" + sym("UT", "<var>UT</var><sub><var>g</var></sub>") + "+1)</sub><sup><var>t</var></sup> " + sym("v", "<var>v</var><sub><var>g</var>,τ</sub>") + " ≤ " + sym("u", "<var>u</var><sub><var>g,t</var></sub>"), tag: "minimum run",
          note: "within this day only",
          say: "A plant started in the last UT hours must still be on; the sum starts at the day's first hour at the earliest. The minimum down time is the same rule for shut-downs: the shut-downs of the last DT hours are at most one minus the switch. Both count within this day only: the hours before the day are assumed to meet them, and a start at 23:00 owes nothing after midnight." },
        { html: sym("u", "<var>u</var><sub><var>g,t</var></sub>") + " ∈ {0, 1}", tag: "the switch", note: "the relaxation: 0 ≤ u ≤ 1",
          say: "Each switch is 0 or 1. The relaxation allows any value from 0 to 1." }
      ],
      symbols: {
        sum: { name: "Σ over t and g", label: "sum over hours and gas plants", words: "Add up over the 24 hours and the two gas plants: g is the combined-cycle plant (cc) or the peaker (pk).", code: "for t in range(24): for g in ('cc', 'pk'): ..." },
        c: { name: "c_g", label: "running cost", unit: "$/MWh", words: "Fuel and other costs that grow with output.", you: "CC " + money(F.cc.cost) + ", peaker " + money(F.pk.cost) + " per MWh (illustrative, lesson 0's fleet)", code: "cost: " + F.pk.cost },
        p: { name: "p_g,t", label: "output", unit: "MW", words: "Output of plant g in hour t, a decision. Over one hour, MW and MWh are the same number.", you: "Peaker at " + hh(R.focus) + ": " + R.lpFocus + " MW in the dispatch LP, " + F.pk.min + " MW with switches", code: '{ name: "p_pk_17", ub: ' + F.pk.mw + " }" },
        NL: { name: "NL_g", label: "no-load cost", unit: "$ per hour on", words: "What a running plant costs per hour before it makes any power.", you: money(F.pk.noload) + " per hour for each gas plant (illustrative)", code: "u: { cost: " + F.pk.noload + " }" },
        u: { name: "u_g,t", label: "the switch", unit: "1 = on, 0 = off", words: "On or off, a decision. In the relaxation it may take any value from 0 to 1, which no plant can do.", you: "Peaker at " + hh(R.focus) + ": " + R.relaxFocusSw + " in the relaxation, 1 in the commitment", code: '{ name: "u_pk_17", type: "binary" }' },
        SU: { name: "SU_g", label: "start-up cost", unit: "$ per start", words: "Fuel and wear spent bringing a plant from off to on.", you: "Peaker " + money(F.pk.startup) + ", CC " + money(F.cc.startup) + " (illustrative)", code: "v: { cost: " + F.pk.startup + " }" },
        v: { name: "v_g,t", label: "start-up", unit: "1 = starts in hour t", words: "1 in the hour a plant starts. With whole switches it comes out 0 or 1 by itself.", you: "The relaxation pays " + R.relaxStarts + " of a peaker start; the commitment one", code: '{ name: "v_pk_17", ub: 1 }' },
        w: { name: "w_g,t", label: "shut-down", unit: "1 = stops in hour t", words: "1 in the hour a plant stops; it feeds the minimum down time.", code: '{ name: "w_pk_23", ub: 1 }' },
        V: { name: "V", label: "unserved-energy penalty", unit: "$/MWh", words: "A large illustrative cost of demand left unserved, so every node of the tree has an answer.", you: money(D.penalty) + " per MWh, as in lesson 11", code: "shed: { cost: " + D.penalty + " }" },
        s: { name: "s_t", label: "unserved demand", unit: "MW", words: "Demand left unserved in hour t.", you: "0 in the best plan; " + R.tree.firstOff.shed + " MWh in the node 'peaker off at " + hh(R.tree.first.t) + "'", code: '{ name: "shed_19" }' },
        r: { name: "r_t", label: "wind and solar used", unit: "MW", words: "Wind and solar used, at most what the weather gives; the rest is spilled.", code: "ub: wind[t] + solar[t]" },
        d: { name: "d_t", label: "demand", unit: "MW", words: "Prairie Town's demand in hour t, from the real shape of " + D.day.label + ".", you: "Peak " + Math.max.apply(null, D.day.demand) + " MW", code: "eq: demand[t]" },
        Pmin: { name: "P̲_g", label: "minimum output", unit: "MW", words: "The lowest steady output when on.", you: "Peaker " + F.pk.min + " MW, CC " + F.cc.min + " MW (illustrative)", code: "min_pk: p - " + F.pk.min + " u >= 0" },
        Pmax: { name: "P̄_g", label: "size", unit: "MW", words: "The most a plant can make.", you: "Peaker " + F.pk.mw + " MW, CC " + F.cc.mw + " MW", code: "max_pk: p - " + F.pk.mw + " u <= 0" },
        tau: { name: "τ", label: "an hour in the sum", unit: "hour", words: "Each hour summed over: the last UT hours up to hour t, but never before the day's first hour (0).", you: "Peaker at " + hh(R.focus) + ": τ = " + (R.focus - F.pk.up + 1) + " to " + R.focus, code: "for s in range(max(0, t - UT + 1), t + 1)" },
        UT: { name: "UT_g", label: "minimum run time", unit: "hours", words: "Hours a plant must stay on once started. The minimum down time DT is the same for staying off.", you: "Peaker " + F.pk.up + " and " + F.pk.down + " hours, CC " + F.cc.up + " and " + F.cc.down + " (illustrative)", code: "up_pk_t: u_t - (v_t-1 + v_t) >= 0" }
      },
      sel: "u",
      hint: "The balance row has a dual only in the LPs: the dispatch model, the relaxation and the model with switches fixed."
    });
  }
})();
