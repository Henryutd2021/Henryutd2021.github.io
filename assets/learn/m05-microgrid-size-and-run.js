// m05-microgrid-size-and-run.js — M5, "Size and run a microgrid that survives an outage" (model lab), on
// engine E1 (assets/learn/components/engine-e1.js, LX.E1; data assets/learn/data/e1-prairie-campus.json).
//
// Steps: (1) the campus islanded for the storm; (2) the model written down and counted; (3) the sizing MILP solved
// (status, gap, no duals); (4) branch and bound on the whole generator sets (E1.bb; M2's rules; a node whose LP fails
// stays unresolved and the tree is then not proven); (5) the feeder's export limit, the time-of-use tariff and the plan
// without the storm, each sized again (what carrying the hospital costs = the difference of two solved plans); (6) the
// plan checked hour by hour with whole sets and their 30% minimum, then on the ten seeded winter outages; (7) the storm
// run with a rolling horizon on four forecasts (what forecast error costs). Every solving step runs through LX.BenchRun
// (a message and "Try again" after a failure or a time limit; Next held while it runs).
// Lab: learn/notebooks/m05-microgrid-size-and-run.ipynb (written by its notebook build step). Every number the page
// states is the engine's, checked by _tests/learn/test_m05-microgrid-size-and-run.js.
// Lesson-local component (used by this page only): TreeView, a small branch-and-bound tree drawn from E1.bb's nodes.
(function () {
  "use strict";
  // ---------------------------------------------------------------- pure (Node: the test reads these)
  var BASE = { pv: 600, bat: 2000, gen: 2, fuel: 675, ph: "must", pw: "must", pd: "keep", pl: "shed", out: ["jan3"], exp: 2000, imp: 2000, tar: "flat", own: "community", allow: ["pv", "bat", "gen"] };
  function money(v) { var r = Math.round(v); return (r < 0 ? "−$" : "$") + Math.abs(r).toLocaleString("en-US"); }
  function kilo(v) { return Math.round(v).toLocaleString("en-US"); }
  function caseKey(c) { return (c.exp >= 2000 ? "open" : "x" + c.exp) + "-" + c.tar + "-" + (c.storm ? "storm" : "none"); }
  function caseLabel(c) { return (c.exp >= 2000 ? "no export limit" : "exports up to " + kilo(c.exp) + " kW") + " · " + (c.tar === "tou" ? "time-of-use" : "flat tariff") + " · " + (c.storm ? "the storm" : "no outage"); }
  function planOf(c) { var p = JSON.parse(JSON.stringify(BASE)); p.exp = c.exp; p.tar = c.tar; p.out = c.storm ? ["jan3"] : []; return p; }
  // what step 5 says after a new case, against the cases solved before it (all: {key: {c, sized}}): the comparisons it
  // supports, one short sentence each, shown as separate results; an empty list when none applies
  function caseWords(c, sz, all) {
    var z = sz.exact, out = [];
    var prev = function (k) { return all[k] ? all[k].sized : null; };
    if (c.exp < 2000) { var o = prev(caseKey({ exp: 2000, tar: c.tar, storm: c.storm })); if (o) out.push("Exports capped at " + kilo(c.exp) + " kW: solar goes from " + kilo(o.exact.pv) + " to " + kilo(z.pv) + " kW, since midday sun the campus cannot use is wasted."); }
    if (c.tar === "tou") { var f = prev(caseKey({ exp: c.exp, tar: "flat", storm: c.storm })); if (f) out.push("Time-of-use: the battery goes from " + kilo(f.exact.bat) + " to " + kilo(z.bat) + " kWh, to move energy into 16:00 to 21:00, when a kWh costs three times as much."); }
    var twin = prev(caseKey({ exp: c.exp, tar: c.tar, storm: !c.storm }));
    if (twin) { var w = c.storm ? sz : twin, n = c.storm ? twin : sz; out.push("Carrying the hospital and its water plant through the storm adds " + money(w.total - n.total) + " a year of equipment and grid cost (storm diesel not included): two solved plans, not a price."); }
    return out;
  }
  function sizedWords(sz) { var z = sz.exact; return "Sized: " + kilo(z.pv) + " kW of solar, " + kilo(z.bat) + " kWh of battery, " + z.gen + " set" + (z.gen === 1 ? "" : "s") + ", " + money(sz.total) + " a year (2025 dollars, illustrative)."; }
  // the plan a check or a forecast run belongs to (results of different plans are never compared)
  function planKey(p) { return [p.pv, p.bat, p.gen, p.fuel, p.exp, p.imp, p.tar, p.own, p.ph, p.pw, p.pd, p.pl, (p.out || []).join("+")].join("|"); }
  // step 7: the forecasts compared (rows: [{key, label, totals}])
  function rollWords(rows) {
    var p = rows.filter(function (r) { return r.key === "perfect"; })[0], others = rows.filter(function (r) { return r.key !== "perfect"; });
    if (!p) return "Run the perfect forecast too, to see what the errors cost.";
    if (p.totals.must > 0.5) return "Even with a perfect forecast this plan leaves " + kilo(p.totals.must) + " kWh of must-stay-on load unserved: it was not sized for the storm. Size it in step 5 first.";
    if (!others.length) return "With a perfect forecast the plan carries the must-stay-on loads for the whole storm. Now try a real forecast.";
    var worst = others.reduce(function (a, b) { return a.totals.must >= b.totals.must ? a : b; });
    return worst.totals.must > p.totals.must + 0.5
      ? "With this controller, forecast error costs this plan " + kilo(worst.totals.must - p.totals.must) + " kWh of must-stay-on load with “" + worst.label.toLowerCase() + "”: its sizing did not require protection against these forecast errors."
      : "With this controller, these forecasts leave the must-stay-on loads as well served as the perfect one; the cost shows in the other loads.";
  }
  // the controller's rule for each real hour (engine E1's realTime), as the page states it: a teaching controller
  var CONTROLLER = ["Between re-plans, the sets follow the plan's on/off schedule: only a running set's output can change.",
    "All the sun goes in first, then the planned sets' output.",
    "Short: the battery, then the sets up to full, then loads are shed: shed-first loads first, must-stay-on loads last.",
    "Spare: shed must-stay-on loads come back first, then the sets go down to their minimum, the battery charges, the other loads come back, and only then is solar curtailed."];
  // step 6 is complete when both its runs (the storm check, the drawn outages) solved the plan now shown: did holds the
  // plan key each run solved, now the current plan's key
  function sixDone(did, now) { return !!did.check && did.check === did.drawn && did.check === now; }
  var page = { sixDone: sixDone, BASE: BASE, caseKey: caseKey, caseLabel: caseLabel, planOf: planOf, caseWords: caseWords, sizedWords: sizedWords, planKey: planKey, rollWords: rollWords, CONTROLLER: CONTROLLER, money: money, kilo: kilo };
  if (typeof module !== "undefined" && module.exports) module.exports = page;
  if (typeof window === "undefined" || !window.LX || !window.LX.E1) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H, E1 = LX.E1;
  function kpi(host, label, value, tone) { var k = H("div", { class: "lx-readout " + (tone || "") }, host); H("span", { text: label }, k); H("b", { text: value }, k); return k; }

  // ---- a small branch-and-bound tree (lesson-local): nodes by depth, the "down" child left, "up" right
  function TreeView(host, o) {
    var w = H("div", { class: "m5-tree" }, host), svgBox = H("div", { class: "m5-tsvg" }, w), panel = H("div", { class: "m5-tread", "aria-live": "polite" }, w), T = null, sel = 0;
    var alt = H("details", { class: "lx-textalt" }, host); H("summary", { text: "Text version: the tree" }, alt); var altL = H("ul", null, alt);
    function label(n) { return n.parent == null ? "Relaxation" : (n.up ? "Sets ≥ " : "Sets ≤ ") + n.at; }
    function status(n) { return { open: "open", branched: "branched", pruned: "pruned", integer: "whole sets", best: "best plan", infeasible: "infeasible", pending: "solving", error: "not solved" }[n.status] || n.status; }
    function words(n) {
      var s = "<b>" + LX.esc(label(n)) + "</b> · " + status(n) + "<br>";
      if (n.status === "error") return s + "Its LP stopped (" + LX.esc(n.why) + "): it keeps its parent's bound, " + (n.bound != null ? money(n.bound) : "none") + ", until Retry solves it.";
      if (n.status === "pending") return s + "Waiting for its LP.";
      if (n.status === "infeasible") return s + "No plan below this node meets every rule.";
      return s + "Cost bound " + money(n.bound) + " a year; sets " + (Math.round(n.x.N * 1000) / 1000) + (n.values ? ", solar " + kilo(n.values.S) + " kW, battery " + kilo(n.values.B) + " kWh" : "") + "." + (n.status === "pruned" ? " Pruned: it cannot beat the best plan." : "");
    }
    function draw(t) {
      T = t; svgBox.innerHTML = ""; altL.innerHTML = "";
      var depth = {}, pos = {}, maxD = 0;
      T.nodes.forEach(function (n) { depth[n.id] = n.depth; maxD = Math.max(maxD, n.depth); });
      // x: the root in the middle; each down child to the left of its parent, each up child to the right
      T.nodes.forEach(function (n) { pos[n.id] = n.parent == null ? 0 : pos[n.parent] + (n.up ? 1 : -1) / Math.pow(2, n.depth - 1); });
      var Wd = 360, Hd = 70 + maxD * 78, S = LX.S, svg = S("svg", { viewBox: "0 0 " + Wd + " " + Hd, role: "group", "aria-label": o.label }, svgBox);
      var X = function (id) { return Wd / 2 + pos[id] * 110; }, Y = function (id) { return 32 + depth[id] * 78; };
      T.nodes.forEach(function (n) { if (n.parent != null) S("path", { d: "M" + X(n.parent) + " " + (Y(n.parent) + 20) + " L" + X(n.id) + " " + (Y(n.id) - 20), class: "m5-edge" }, svg); });
      T.nodes.forEach(function (n) {
        var g = S("g", { class: "nd " + n.status + (n.id === sel ? " sel" : ""), tabindex: "0", role: "button", "data-id": String(n.id), "aria-pressed": n.id === sel ? "true" : "false", "aria-label": label(n) + ", " + status(n) + (n.bound != null ? ", bound " + money(n.bound) : "") }, svg);
        S("rect", { x: X(n.id) - 62, y: Y(n.id) - 20, width: 124, height: 40, rx: 8 }, g);
        var t1 = S("text", { x: X(n.id), y: Y(n.id) - 4, "text-anchor": "middle" }, g); t1.textContent = label(n);
        var t2 = S("text", { x: X(n.id), y: Y(n.id) + 12, "text-anchor": "middle", class: "b" }, g); t2.textContent = n.bound != null ? money(n.bound) : status(n);
        g.addEventListener("click", function () { pick(n.id); });
        g.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(n.id); } });
        H("li", { html: words(n) }, altL);
      });
      pick(sel, true);
    }
    // a pick redraws the tree (the selection ring); the reader's focus goes back to the node they picked
    function pick(id, quiet) {
      sel = id; if (!T || !T.nodes[id]) return; panel.innerHTML = "<p>" + words(T.nodes[id]) + "</p>";
      if (quiet) return;
      var had = svgBox.contains(document.activeElement);
      draw(T);
      if (had) { var g = svgBox.querySelector('g[data-id="' + id + '"]'); if (g) g.focus(); }
    }
    return { draw: draw, select: function (id) { sel = id; if (T) draw(T); } };
  }

  LX.mount("m5", function (live, data, root) {
    var P = E1.prepare(data.e1_prairie_campus), PATH = data.path;
    var S0 = { sized: {}, last: null, T: null, check: null, roll: {}, failAt: 0, nodeSolves: 0 };
    var stubNext = null;   // demo states: the next solve of a run box fails ("fail") or stops at its time limit ("tl")
    function solver() {
      if (!stubNext) return null;
      var k = stubNext; stubNext = null;
      return function (m, o) {
        if (k === "fail") return Promise.resolve({ status: "error", ok: false, message: "solver stopped (demo)" });
        return LX.solver.solve(m, o).then(function (r) { if (r.values) { r.status = "time-limit"; r.ok = false; r.mipGap = 0.0123; } return r; });
      };
    }
    // the plan steps 6 and 7 run when the reader has not sized one in step 5: step 5's last case (time-of-use, exports
    // capped at 0 kW, the storm), sized by the engine and stored in the data file (reference.m5.plan, checked by the test)
    function withStorm(p) { p.out = ["jan3"]; return p; }
    function storedPlan() {
      var c = S0.sized["x0-tou-storm"], p = planOf({ exp: 0, tar: "tou", storm: true }), ref = P.cfg.reference && P.cfg.reference.m5 && P.cfg.reference.m5.plan;
      var z = c ? c.sized.rounded : ref; if (z) { p.pv = z.pv; p.bat = z.bat; p.gen = z.gen; }
      return p;
    }
    // the plan steps 6 and 7 run: the last plan sized for the storm in step 5 (rounded up), else the stored one
    function currentPlan() { var p = S0.lastPlan && S0.last5 && S0.last5.storm ? JSON.parse(JSON.stringify(S0.lastPlan)) : null; return p ? withStorm(p) : storedPlan(); }
    // that plan's exact sizes, before rounding
    function exactOf() {
      if (S0.lastPlan && S0.last5 && S0.last5.storm && S0.lastSized) return S0.lastSized.exact;
      var c = S0.sized["x0-tou-storm"]; if (c) return c.sized.exact;
      var r = (P.cfg.reference.m5.cases || []).filter(function (x) { return x.key === "x0-tou-storm"; })[0];
      return r ? { pv: r.pv, bat: r.bat, gen: r.gen } : currentPlan();
    }
    var cards;
    var steps = [
      // 1 the campus and the storm
      { text: "Prairie Campus from F7: 1,200 kW of loads, a hospital first. A winter storm takes the grid down for 72 hours from 00:00 on 20 January 2025. Open the switch: the campus is an [[islanding|island]].",
        build: function (act, api) {
          var plan = JSON.parse(JSON.stringify(BASE)), line = E1.Line(act, { P: P, plan: plan, editable: false });
          var b = H("button", { type: "button", class: "lx-btn small", text: "Open the switch" }, act);
          b.addEventListener("click", function () {
            var on = !line.el.classList.contains("island"); line.set(plan, on); b.textContent = on ? "Close the switch" : "Open the switch";
            if (on) { api.done(); api.saw("Islanded: only the campus's own sources serve it. The hospital (300 kW) and its water and heating plant (100 kW) **must stay on**; the dorms keep if possible; the labs shed first."); }
          });
        } },
      // 2 the model, written down and counted
      { text: "Write the sizing down: what it decides, what it minimises, and the rules every hour of the year and of the storm must meet.",
        build: function (act, api) {
          var m = H("div", { class: "m5-model" }, act);
          m.innerHTML = '<div><p class="lx-eyebrow">Decisions</p><p><var>S</var> kW of solar, <var>B</var> kWh of battery (4 hours: <var>B</var>/4 kW), <var>N</var> generator sets of 200 kW, a <b>whole number</b>; every hour: import, export, charge, discharge, generator output.</p></div>' +
            '<div><p class="lx-eyebrow">Goal</p><p>Least annual cost: equipment paid over its life at the owner\'s <span class="lx-term" data-term="cost-of-capital">cost of capital</span>, plus upkeep (yearly maintenance) and the year\'s grid bill (12 average days, each weighted by its month\'s days).</p></div>' +
            '<div><p class="lx-eyebrow">Rules</p><ul><li>Every hour: supply = loads, solar ≤ <var>S</var> × sun, battery stored ≤ <var>B</var>, imports and exports within the host <span class="lx-term" data-term="feeder">feeder</span>\'s limits.</li><li>In each storm hour, no grid: solar + battery + generator ≥ the must-stay-on loads; generator ≤ 200 <var>N</var> kW.</li><li>Diesel: 0.07 gallons per kWh, at most the 675 gallons on site.</li></ul></div>';
          var b = H("button", { type: "button", class: "lx-btn small ghost", text: "Count the model" }, act), kp = H("div", { class: "lx-readouts" }, act);
          b.addEventListener("click", function () {
            var md = E1.sizeModel(BASE, P, [P.scen.jan3]), ints = md.variables.filter(function (v) { return v.type === "integer"; }).length;
            kp.innerHTML = ""; kpi(kp, "Decisions", kilo(md.variables.length)); kpi(kp, "Rules", kilo(md.constraints.length)); kpi(kp, "Whole numbers", String(ints));
            api.done(); api.saw("A [[mixed-integer-program|mixed-integer program]]: " + kilo(md.variables.length) + " decisions, " + kilo(md.constraints.length) + " rules, and " + ints + " of them a whole number, the generator sets. The 30% minimum of a running set is left out here; step 6 puts it back.");
          });
        } },
      // 3 solve it
      { text: "Size it for the storm, on a flat tariff with no export limit. HiGHS solves the mixed-integer program in your browser.",
        build: function (act, api) {
          var kp = H("div", { class: "lx-readouts" }), res = H("div", null);
          var run = LX.BenchRun(act, { label: "Size it", busy: api.busy, results: [res, kp], partial: true, state: function () { return planOf({ exp: 2000, tar: "flat", storm: true }); },
            solve: function (st, ctx) { return E1.solve(st, P, { task: "size", check: false, scenarios: [P.scen.jan3], signal: ctx.signal, attempt: ctx.attempt, solver: solver() }); },
            render: function (R, st, r) {
              var z = R.sized.exact; S0.sized[caseKey({ exp: 2000, tar: "flat", storm: true })] = { c: { exp: 2000, tar: "flat", storm: true }, sized: R.sized };
              kp.innerHTML = ""; kpi(kp, "Solar", kilo(z.pv) + " kW"); kpi(kp, "Battery", kilo(z.bat) + " kWh"); kpi(kp, "Generator sets", String(z.gen)); kpi(kp, "Annual cost", money(R.sized.total));
              kpi(kp, "Optimality gap", ((r.mipGap || 0) * 100).toFixed(2) + "%", r.ok ? "" : "bad"); kpi(kp, "Duals returned", "none", "warn");
              if (!r.ok) { api.saw("Not proven: the run stopped at its time limit with the plan above, the best found so far. Its [[optimality-gap|gap]], " + ((r.mipGap || 0) * 100).toFixed(2) + "%, is how far it could still be from the cheapest plan. Try again gives HiGHS more time.", true); return; }
              api.done(); api.saw("Optimal: " + kilo(z.pv) + " kW of solar, " + kilo(z.bat) + " kWh of battery and " + z.gen + " sets, " + money(R.sized.total) + " a year (2025 dollars, illustrative). The [[optimality-gap|gap]], how far the plan found could still be from the cheapest, is closed. HiGHS returns no duals for a mixed-integer program, so there are no [[shadow-price|prices]] to read.");
            } });
          act.appendChild(kp); act.appendChild(res);
          if (S0.sized[caseKey({ exp: 2000, tar: "flat", storm: true })]) api.done();
        } },
      // 4 branch and bound on the whole sets
      { text: "Why whole sets? The [[lp-relaxation|relaxation]] may buy part of a set. [[branch-and-bound|Branch and bound]] splits it into fewer and more, and proves the best whole number.",
        build: function (act, api) {
          var how = H("ol", { class: "m5-brules" }, act);
          ["Each node's cost is a [[lower-bound|lower bound]] for every plan below it.", "A node no cheaper than the best plan is pruned.", "The open node with the lowest bound is split next, on the sets."].forEach(function (s) { H("li", { html: LX.rich(s) }, how); });
          var row = H("div", { class: "m5-row" }, act);
          var go = H("button", { type: "button", class: "lx-btn small", html: LX.icon("play") + "Branch" }, row);
          var re = H("button", { type: "button", class: "lx-btn small ghost", text: "Retry the unsolved node", hidden: true }, row);
          var st = LX.SolverStatus(row), kp = H("div", { class: "lx-readouts", "aria-live": "polite" }, act);
          var view = TreeView(act, { label: "Branch-and-bound tree on the generator sets" });
          var T = S0.T || E1.bb.tree(E1.sizeModel(planOf({ exp: 2000, tar: "flat", storm: true }), P, [P.scen.jan3]), ["N"]), busy = false;
          S0.T = T;
          function kpis() { kp.innerHTML = ""; var lb = E1.bb.bound(T), g = E1.bb.gap(T); kpi(kp, "Best bound", lb == null ? "–" : money(lb)); kpi(kp, "Best plan", T.inc ? money(T.inc.bound) : "none yet", T.inc ? "good" : ""); kpi(kp, "Gap", g == null ? "–" : (g * 100).toFixed(2) + "%", E1.bb.failed(T).length ? "bad" : ""); kpi(kp, "LPs solved", String(T.solved)); }
          function controls() { var open = T.nodes.some(function (n) { return n.status === "open"; }); go.disabled = busy || !open; re.hidden = !E1.bb.failed(T).length; re.disabled = busy; }
          function solveNode(m) {
            S0.nodeSolves++;
            if (S0.failAt && S0.failAt === S0.nodeSolves) return Promise.resolve({ status: "time-limit", ok: false, objective: null, values: null });
            return LX.solver.solve(m.model, { timeLimit: 5, label: "m5" });
          }
          function settle() {
            var pend = E1.bb.pending(T); if (!pend.length) return Promise.resolve();
            st.set(LX.solver.mode ? "solving" : "loading");
            return Promise.all(pend.map(solveNode)).then(function (rs) { rs.forEach(function (r, k) { E1.bb.accept(T, pend[k].id, r); }); st.set(rs.filter(function (r) { return !r.ok && r.status !== "infeasible"; })[0] || rs[rs.length - 1]); });
          }
          function after(br) {
            view.draw(T); kpis(); controls();
            var v = E1.bb.verdict(T), r0 = T.nodes[0];
            if (v && v.proven) { api.done(); api.saw(v.text + " " + T.inc.x.N.toFixed(0) + " sets, as HiGHS found in step 3."); }
            else if (v) api.saw(v.text, true);
            else if (!br && r0.x) api.saw("The relaxation: " + (Math.round(r0.x.N * 1000) / 1000) + " sets, " + money(r0.bound) + " a year. No plan with whole sets can cost less. Press Branch.", true);
            else if (br) api.saw("Split on the sets at " + (Math.round(br.on.x * 1000) / 1000) + ": at most " + br.kids[0].at + ", or at least " + br.kids[1].at + ".");
          }
          function wrap(p) { busy = true; api.busy(true); controls(); return p.then(function (x) { busy = false; api.busy(false); return x; }, function () { busy = false; api.busy(false); }); }
          go.addEventListener("click", function () { if (busy) return; var br = E1.bb.branch(T); view.draw(T); wrap(settle()).then(function () { after(br); }); });
          re.addEventListener("click", function () { if (busy || !E1.bb.retry(T)) return; wrap(settle()).then(function () { after(null); }); });
          if (T.nodes[0].status === "pending") wrap(settle()).then(function () { after(null); view.select(0); });
          else { view.draw(T); kpis(); controls(); var v0 = E1.bb.verdict(T); if (v0 && v0.proven) api.done(); }
        } },
      // 5 the feeder's limit, the tariff and no storm
      { text: "Now add the host feeder's export limit and a [[time-of-use-tariff|time-of-use tariff]] (illustrative), one at a time, and size again. Then size without the storm to see what carrying the hospital costs.",
        build: function (act, api) {
          var c = S0.last5 || { exp: 2000, tar: "flat", storm: true };
          var tg = H("div", { class: "lx-toggles", role: "group", "aria-label": "The case to size" }, act);
          var t1 = LX.Toggle(tg, { label: "Exports capped at 0 kW", on: c.exp < 2000, onChange: function (on) { c.exp = on ? 0 : 2000; run.changed(planOf(c)); } });
          var t2 = LX.Toggle(tg, { label: "Time-of-use tariff", on: c.tar === "tou", onChange: function (on) { c.tar = on ? "tou" : "flat"; run.changed(planOf(c)); } });
          var t3 = LX.Toggle(tg, { label: "Plan for the storm", on: c.storm, onChange: function (on) { c.storm = on; run.changed(planOf(c)); } });
          var tb = H("div", { class: "lx-scroll-x" }), stale = H("p", null), found = H("ul", { class: "m5-found", "aria-live": "polite" });
          var run = LX.BenchRun(act, { label: "Size this case", busy: api.busy, results: [tb, found], stale: stale, state: function () { return planOf(c); },
            solve: function (st, ctx) { return E1.solve(st, P, { task: "size", check: false, scenarios: st.out.length ? [P.scen.jan3] : [], signal: ctx.signal, attempt: ctx.attempt, solver: solver() }); },
            render: function (R, st) {
              var cc = { exp: st.exp, tar: st.tar, storm: st.out.length > 0 };
              var words = caseWords(cc, R.sized, S0.sized);
              S0.sized[caseKey(cc)] = { c: cc, sized: R.sized }; S0.last5 = JSON.parse(JSON.stringify(cc)); S0.lastPlan = R.plan; S0.lastSized = R.sized;
              table(); found.innerHTML = ""; words.forEach(function (w) { H("li", { text: w }, found); });   // one comparison a line
              api.saw(sizedWords(R.sized));
              var k = Object.keys(S0.sized);
              if (k.indexOf("x0-flat-storm") >= 0 && k.indexOf("x0-tou-storm") >= 0 && k.indexOf("x0-tou-none") >= 0) api.done();
            } });
          act.appendChild(stale); act.appendChild(tb); act.appendChild(found);
          function table() {
            tb.innerHTML = "";
            var t = H("table", { class: "lx-facts m5-cases" }, tb), hr = H("tr", null, H("thead", null, t));
            ["Case", "Solar", "Battery", "Sets", "Annual cost"].forEach(function (x) { H("th", { scope: "col", text: x }, hr); });
            var bd = H("tbody", null, t);
            Object.keys(S0.sized).forEach(function (k) { var x = S0.sized[k], z = x.sized.exact, r = H("tr", null, bd);
              H("th", { scope: "row", text: caseLabel(x.c) }, r); H("td", { class: "n", text: kilo(z.pv) + " kW" }, r); H("td", { class: "n", text: kilo(z.bat) + " kWh" }, r); H("td", { class: "n", text: String(z.gen) }, r); H("td", { class: "n", text: money(x.sized.total) }, r); });
            E1.ui.label(t);
          }
          table();
          var k0 = Object.keys(S0.sized); if (k0.indexOf("x0-flat-storm") >= 0 && k0.indexOf("x0-tou-storm") >= 0 && k0.indexOf("x0-tou-none") >= 0) api.done();
          H("p", { class: "lx-hint", text: "Do at least: the cap, then time-of-use, then time-of-use without the storm." }, act);
        } },
      // 6 the check, hour by hour, then ten drawn outages
      { text: "The sizing left out the sets' 30% minimum. Check your storm plan hour by hour with whole sets that run at 30% or more, then test it on ten drawn outages.",
        build: function (act, api) {
          var plan = currentPlan, ex = exactOf(), did = {};
          // both runs, each on the plan it solved (never a later one), complete the step for the plan shown
          function both(k, st) { did[k] = planKey(st); if (sixDone(did, planKey(plan()))) api.done(); }
          // the rounding, said before the check: the exact sizes, and the plan the check runs
          H("p", { class: "m5-sub", text: "The check runs " + kilo(plan().pv) + " kW · " + kilo(plan().bat) + " kWh · " + plan().gen + " set" + (plan().gen === 1 ? "" : "s") + ", rounded up to the bench's steps (25 kW, 50 kWh) from the sizing's " + kilo(ex.pv) + " kW · " + kilo(ex.bat) + " kWh: more equipment, so a slightly higher annual cost." }, act);
          var res = H("div", null), kp = H("div", { class: "lx-readouts" });
          var run = LX.BenchRun(act, { label: "Run the storm hour by hour", busy: api.busy, results: [res, kp], partial: true, state: plan,
            solve: function (st, ctx) { return E1.solve(st, P, { task: "run", scenarios: [P.scen.jan3], signal: ctx.signal, attempt: ctx.attempt, solver: solver() }); },
            render: function (R, st) {
              S0.check = { R: R, plan: st, key: planKey(st) }; var o = R.outages[0];
              kp.innerHTML = ""; kpi(kp, "Rounded plan", kilo(st.pv) + " kW · " + kilo(st.bat) + " kWh · " + st.gen + " set" + (st.gen === 1 ? "" : "s")); kpi(kp, "Its annual cost", money(R.total)); kpi(kp, "Must-stay-on unserved", kilo(o.must) + " kWh", o.must > 0.5 ? "bad" : "good"); kpi(kp, "Diesel", kilo(o.fuel) + " gal");
              res.innerHTML = ""; E1.HourChart(H("div", { class: "lx-xcard" }, res), P, R, o, {});
              both("check", st); api.saw(o.must > 0.5 ? "With whole sets and their minimum, the rounded plan leaves " + kilo(o.must) + " kWh of must-stay-on load unserved: the sizing's shortcut mattered." : "With whole sets and their 30% minimum the rounded plan still carries the must-stay-on loads for all 72 hours (" + kilo(o.fuel) + " gallons burned): the shortcut did not matter here.");
            } });
          act.appendChild(kp); act.appendChild(res);
          var r2 = H("div", null), sum = H("p", { class: "m5-sum", "aria-live": "polite" });
          H("p", { class: "m5-sub", text: "Then the same plan on ten drawn winter outages (seed 7): a test, not a reliability figure." }, act);
          LX.BenchRun(act, { label: "Run the 10 drawn outages", busy: api.busy, results: [r2], partial: true, state: plan,
            solve: function (st, ctx) { return E1.solve(st, P, { task: "run", scenarios: P.seeded, signal: ctx.signal, attempt: ctx.attempt }); },
            render: function (R, st) {
              var ok = R.outages.filter(function (o) { return o.must < 0.5; }).length; r2.innerHTML = "";
              sum.textContent = "Must-stay-on loads fully served in " + ok + " of these " + R.outages.length + " drawn outages.";
              both("drawn", st);
              var t = H("table", { class: "lx-facts" }, H("div", { class: "lx-scroll-x" }, r2)), hr = H("tr", null, H("thead", null, t));
              ["Outage", "Starts", "Hours", "Must stay on, unserved"].forEach(function (x) { H("th", { scope: "col", text: x }, hr); });
              var bd = H("tbody", null, t);
              R.outages.forEach(function (o, i) { var r = H("tr", null, bd); H("th", { scope: "row", text: "#" + (i + 1) }, r); H("td", { text: E1.when(o.sc, 0) }, r); H("td", { class: "n", text: String(o.hours.length) }, r); H("td", { class: "n", text: kilo(o.must) + " kWh" }, r); });
              E1.ui.label(t);
            } });
          act.appendChild(sum); act.appendChild(r2);
        } },
      // 7 rolling horizon on forecasts
      { text: "Real controllers do not know the coming sun. On a [[rolling-horizon|rolling horizon]] they re-plan the rest of the storm every 6 hours on a forecast, then run 6 real hours. What does forecast error cost?",
        build: function (act, api) {
          var key = "perfect", F = P.cfg.forecasts;
          var sg = E1.ui.seg(act, "Forecast", F.map(function (f) { return f.key; }), F.reduce(function (o, f) { o[f.key] = f.label; return o; }, {}), key, function (v) { key = v; note.textContent = F.filter(function (f) { return f.key === v; })[0].note; });
          var note = H("p", { class: "lx-hint", text: F[0].note }, act);
          H("p", { class: "m5-sub", html: "<b>The controller, each real hour</b> (a teaching rule; the forecast losses below hold for it):" }, act);
          var ctl = H("ol", { class: "m5-ctl" }, act); CONTROLLER.forEach(function (t) { H("li", { text: t }, ctl); });
          var tb = H("div", { class: "lx-scroll-x" }), prog = H("p", { class: "m5-prog", "aria-live": "polite" });
          // the plan steps 6 and 7 share: the last one sized for the storm (rounded), or the stored one; results of an
          // earlier plan are dropped, never compared with this one's
          var plan = function () { var c = currentPlan(); c.fc = key; return c; };
          LX.BenchRun(act, { label: "Run the storm on this forecast", busy: api.busy, results: [tb], state: plan,
            solve: function (st, ctx) {
              var stats = [];
              return E1.roll(st, P, P.scen.jan3, st.fc, function (m, t0) { return LX.solver.solve(m, { timeLimit: ctx.attempt > 1 ? 30 : 10, gap: 1e-6, signal: ctx.signal, label: "m5-roll" }).then(function (r) { stats.push(r.status); return r; }); },
                { onStep: function (t0, Hh) { prog.textContent = "Re-planning at " + E1.when(P.scen.jan3, t0) + " (" + (t0 / 6 + 1) + " of " + Hh / 6 + ")…"; } })
                .then(function (out) {
                  prog.textContent = "";
                  var st2 = E1.worst(stats);
                  return { status: st2, ok: st2 === "optimal", kind: "milp", results: out, message: st2 === "optimal" ? "Done: all " + stats.length + " re-plans report optimal." : "One or more of the " + stats.length + " re-plans stopped early (" + st2 + "): the run shown is not from proven plans." };
                }, function (r) { prog.textContent = ""; return { status: r && r.status || "error", ok: false }; });
            },
            partial: true,
            // a run whose re-plans did not all prove optimal is kept as a provisional row: it never completes the step
            render: function (out, st, r) {
              var lab = F.filter(function (f) { return f.key === st.fc; })[0].label, pk = planKey(st);
              Object.keys(S0.roll).forEach(function (k) { if (S0.roll[k].plan !== pk) delete S0.roll[k]; });
              S0.roll[st.fc] = { key: st.fc, label: lab, totals: out.totals, plan: pk, proven: !!(r && r.ok) };
              var rows = drawRolls(pk);
              api.saw(rollWords(rows), rows.length < 2);
              if (rollDone(rows)) api.done();
            } });
          function rollDone(rows) { var pr = rows.filter(function (x) { return x.proven !== false; }); return !!S0.roll.perfect && S0.roll.perfect.proven !== false && pr.length >= 2; }
          act.appendChild(prog); act.appendChild(tb);
          // the rows already run for this plan (a revisit), none for another plan
          function drawRolls(pk) {
            tb.innerHTML = "";
            var rows = F.map(function (f) { return S0.roll[f.key]; }).filter(function (x) { return x && x.plan === pk; });
            if (!rows.length) return rows;
            H("p", { class: "m5-sub", text: "Plan: " + kilo(currentPlan().pv) + " kW · " + kilo(currentPlan().bat) + " kWh · " + currentPlan().gen + " set" + (currentPlan().gen === 1 ? "" : "s") + ", the one step 6 checks." }, tb);
            var t = H("table", { class: "lx-facts" }, tb), hr = H("tr", null, H("thead", null, t));
            ["Forecast", "Must stay on, unserved", "Keep if possible, unserved", "Shed first, unserved", "Diesel", "First short hour"].forEach(function (x) { H("th", { scope: "col", text: x }, hr); });
            var bd = H("tbody", null, t);
            rows.forEach(function (x) { var r = H("tr", null, bd); H("th", { scope: "row", text: x.label + (x.proven === false ? " (provisional: a re-plan stopped early)" : "") }, r); H("td", { class: "n" + (x.totals.must > 0.5 ? " m5-bad" : ""), text: kilo(x.totals.must) + " kWh" }, r); H("td", { class: "n", text: kilo(x.totals.keep) + " kWh" }, r); H("td", { class: "n", text: kilo(x.totals.shed) + " kWh" }, r); H("td", { class: "n", text: kilo(x.totals.fuel) + " gal" }, r); H("td", { text: x.totals.firstShort == null ? "none" : E1.when(P.scen.jan3, x.totals.firstShort) }, r); });
            E1.ui.label(t);
            return rows;
          }
          var pk0 = planKey(currentPlan()), had = drawRolls(pk0);
          if (had.length) { api.saw(rollWords(had), had.length < 2); if (S0.roll.perfect && S0.roll.perfect.plan === pk0 && rollDone(had)) api.done(); }
        } }
    ];
    cards = LX.StepCards(live, { id: "m5-steps", steps: steps });

    // ---- explain layer
    var x = document.getElementById("m5-explain"); x.innerHTML = "";
    var fl = H("div", { class: "lx-xcard" }, x); H("h3", { text: "From a sizing to a controller, as a flowchart" }, fl);
    var ol = H("ol", { class: "m5-flow" }, fl);
    [["Size", "One MILP: solar, battery, whole sets; a normal year plus the storm; the cheapest plan that keeps the must-stay-on loads on."],
     ["Prove", "Branch and bound on the sets: the relaxation's bound, two children, the gap closed to 0%."],
     ["Check", "Whole sets that run at 30% or more, hour by hour: the rule the sizing left out."],
     ["Test", "Ten drawn winter outages the plan was not sized for."],
     ["Operate", "Re-plan every 6 hours on a forecast, then run 6 real hours with a stated controller: perfect foresight is gone, and the sizing planned for none of its errors."]].forEach(function (s) { var li = H("li", null, ol); H("b", { text: s[0] }, li); H("span", { text: s[1] }, li); });
    LX.EquationCard(H("div", { class: "lx-xcard" }, x), { title: "The storm hour, as an equation", lede: "Tap a symbol: every storm hour of the sizing must meet this balance, with no grid.", label: "Storm-hour balance",
      rows: [{ parts: [{ k: "s" }, "+", { k: "d" }, "+", { k: "g" }, "=", { k: "c" }, "+", { k: "o" }, "+", { k: "L" }], say: "Solar used plus battery discharge plus the sets' output equals battery charge plus optional loads served plus the must-stay-on load.", tag: "every storm hour" },
        { parts: [{ k: "g" }, "≤", "200", { k: "N" }], say: "The sets' output is at most 200 kilowatts times the number of sets.", note: "N is a whole number: the one integer of the sizing" },
        { parts: [{ html: "Σ " }, "0.07", { k: "g" }, "≤", { k: "F" }], say: "Over the storm, 0.07 gallons per kilowatt-hour of the sets' output is at most the diesel on site.", tag: "the whole storm" }],
      symbols: {
        s: { sym: "s", name: "Solar used", unit: "kW", color: "var(--lx-solar)", words: "At most the panels' size times that hour's sun per kW (a teaching profile from SPP's 2025 hourly solar)." },
        d: { sym: "d", name: "Battery discharge", unit: "kW", color: "var(--lx-bat)", words: "At most a quarter of the battery's kWh (a 4-hour battery), and only what is stored." },
        g: { sym: "g", name: "Generator sets' output", unit: "kW", color: "var(--lx-pk)", words: "Diesel sets of 200 kW each; the check adds that a set that is on runs at 60 kW or more." },
        c: { sym: "c", name: "Battery charge", unit: "kW", color: "var(--lx-bat)", words: "90% of what goes in comes back out." },
        o: { sym: "o", name: "Other loads served", unit: "kW", words: "Dorms and labs when there is energy to spare; the sizing does not require them." },
        L: { sym: "L", name: "Must-stay-on load", unit: "kW", color: "var(--lx-bad)", words: "The hospital and its water and heating plant: 400 kW in every hour of the storm." },
        N: { sym: "N", name: "Generator sets", unit: "sets", words: "0 to 4 whole sets: branch and bound proves which number is cheapest." },
        F: { sym: "F", name: "Diesel on site", unit: "gallons", words: "675 gallons, about 24 hours of two sets at full output: a fixed input here, not sized; nothing arrives during the storm." } } });
    LX.CompareTable(H("div", { class: "lx-xcard" }, x), { title: "Three models of the same campus", text: true,
      columns: [{ key: "m", label: "Model", main: true }, { key: "knows", label: "What it knows" }, { key: "gives", label: "What it gives" }, { key: "not", label: "What it cannot give" }],
      rows: [{ key: "size", m: "Sizing MILP", knows: "the year's 12 average days and the chosen storms, exactly", gives: "sizes, status, gap, annual cost", not: "marginal prices (no duals), the 30% minimum" },
        { key: "check", m: "Operation MILP", knows: "one outage, the sizes fixed", gives: "unserved kWh per load, diesel, CO₂", not: "how often outages happen" },
        { key: "roll", m: "Rolling horizon", knows: "only a forecast of the sun", gives: "what this controller does, and what errors cost it", not: "a guarantee: a better forecast, a margin or another controller is a design choice" }] });
    LX.Boundary(H("div", { class: "lx-xcard" }, x), { title: "Where this model holds",
      holds: ["flat loads and a known year of average days", "the storms you size for and test on", "a 4-hour battery that starts full, and diesel that does not arrive during the storm"],
      leaves: ["marginal prices: a MILP gives none, and a resource's value here is a difference of two solved plans", "storm diesel and refilling the tank, in the annual cost", "part-load fuel use, battery wear, the campus's wiring", "how often outages happen, and outages longer than those tested"],
      source: "Prairie Campus is fictional (F7's); costs illustrative, 2025 dollars; sun SPP 2025 (EIA-930)." });

    // ---- demo states: mid (step 3 solved), step-N, tree, tree-fail, fail (a failing size), tl (a time-limited size), roll
    function clickRun(label) { var b = [].slice.call(root.querySelectorAll(".lx-br button")).filter(function (x) { return x.textContent === label; })[0]; if (b) b.click(); }
    LX.demo(root, function (s) {
      if (s === "mid") { cards.go(2); clickRun("Size it"); return { view: "mid" }; }
      if (s === "fail") { cards.go(2); stubNext = "fail"; clickRun("Size it"); return { view: "fail" }; }
      if (s === "tl") { cards.go(2); stubNext = "tl"; clickRun("Size it"); return { view: "tl" }; }
      if (s === "tree") { cards.go(3); setTimeout(function () { var b = root.querySelector(".m5-row .lx-btn"); if (b && !b.disabled) b.click(); }, 1500); return { view: "tree" }; }
      if (s === "tree-fail") { S0.T = null; S0.failAt = 2; S0.nodeSolves = 0; cards.go(3); setTimeout(function () { var b = root.querySelector(".m5-row .lx-btn"); if (b && !b.disabled) b.click(); }, 1500); return { view: "tree-fail" }; }
      if (s === "check") { cards.go(5); clickRun("Run the storm hour by hour"); return { view: "check" }; }
      if (s === "roll") { cards.go(6); clickRun("Run the storm on this forecast"); return { view: "roll" }; }
      return null;
    }, cards);
  });
})();
