// m06-carbon-in-models.js — Modeler lesson M6, "Putting carbon in the model: caps, prices, frontiers and procurement rules"
// (model lab: step cards with solver runs).
//
// The model is the Plains Grid's planning LP, LX.plainsPlan (assets/learn/components/plainsplan.js, in the learn.js bundle),
// which A12 ("How do governments steer energy?") uses too;
// its data, decisions, rules, options and tie rule are described there. This file is M6's page; in Node it exports the
// model, as before. Every number the page states is checked by _tests/learn/test_m06-carbon-in-models.js.
// The stage has two views: "carbon" (steps 1-4: the frontier, the reader's cap and price) and "buy" (steps 5-7: the
// year with the 300 MW data center, each purchase as a point of cost against CO2, the grid without it as the
// reference). A solve that ends after the reader has left its step paints nothing (stepGen).
(function () {
  "use strict";
  var model = (typeof window !== "undefined" && window.LX && window.LX.plainsPlan) || require("./components/plainsplan.js");
  var build = model.build, faceModel = model.faceModel, fm = model.fm, gas = model.gas, prepare = model.prepare, read = model.read, sum = model.sum;
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX || !window.LX.H) return;

  // ================================================================ M6's page
  var LX = window.LX, H = LX.H, SLUG = "m06-carbon-in-models";
  LX.mount(SLUG, function (live, data, root) {
    var M = data.m06_carbon_in_models, P = data.a10_emissions_questions.plains, REF = M.reference;
    var Y = prepare(P, M, data.town_year, data.cf_targets, LX.townProfile), saved = LX.store.get("m6", {}) || {};
    var CAPS = M.caps, S = { cap: CAPS.indexOf(saved.cap) >= 0 ? saved.cap : CAPS[2], tau: typeof saved.tau === "number" && saved.tau % 10 === 0 && saved.tau >= 0 && saved.tau <= 140 ? saved.tau : 30, buy: saved.buy === "hourly" ? "hourly" : "annual", tauFrom: null };
    function keep() { LX.store.set("m6", { cap: S.cap, tau: S.tau, buy: S.buy }); }
    var cache = {}, E0 = null, base = null, seq = 0, stepGen = 0;
    function solve(o, key) {
      var k = JSON.stringify(o); if (cache[k]) return Promise.resolve(cache[k]);
      return LX.solver.solve(build(Y, o), { timeLimit: 10, key: key || "m6" }).then(function (r) {
        if (!r.ok) return { ok: false, r: r }; var R = read(Y, o, r); R.obj = r.objective; cache[k] = R; return R;
      }, function (e) { return { ok: false, r: { status: "error", ok: false, message: String((e && e.message) || e) } }; });
    }
    function solveBase() { return base ? Promise.resolve(base) : solve({}, "m6-base").then(function (R) { if (R.ok) { base = R; E0 = R.co2; } return R; }); }
    function capOpt(share) { return { cap: share / 100 * E0 }; }
    // a price's plan and the range of CO2 among all its best plans (two more solves on the optimal face)
    function priceRun(tau) {
      var o = { tau: tau }, k = "range" + tau;
      if (cache[k]) return Promise.resolve(cache[k]);
      return solve(o, "m6-tau").then(function (R) {
        if (!R.ok) return R;
        return LX.solver.solve(faceModel(Y, o, R.obj, 1), { timeLimit: 10, key: "m6-lo" }).then(function (lo) {
          if (!lo.ok) return { ok: false, r: lo };
          return LX.solver.solve(faceModel(Y, o, R.obj, -1), { timeLimit: 10, key: "m6-hi" }).then(function (hi) {
            if (!hi.ok) return { ok: false, r: hi };
            var out = { ok: true, R: R, lo: lo.objective, hi: -hi.objective, tau: tau }; cache[k] = out; return out;
          });
        });
      });
    }
    var f2 = function (v) { return "$" + v.toFixed(2); }, mt = fm.mt, musd = fm.musd, mw = fm.gw;
    function dm(v) { var r = Math.round(v / 1e5) / 10; return (r < 0 ? "−$" : r > 0 ? "+$" : "$") + Math.abs(r).toFixed(1) + "M"; }
    function dmt(v) { var r = Math.round(v / 1e4) / 100; return (r < 0 ? "−" : r > 0 ? "+" : "") + Math.abs(r).toFixed(2) + " Mt"; }

    // ---------- the stage: the frontier chart and readouts
    var stage = H("div", { class: "lx-stage" }, live), sh = H("div", { class: "lx-stage-head" }, stage), title = H(LX.hTag(3, sh), null, sh);   // an h2 when the stage sits right under the page title
    var chips = H("div", { class: "lx-readouts", "aria-live": "polite" }, stage), fhost = H("div", null, stage);
    var status = H("p", { class: "lx-stage-status", "aria-live": "polite" }, stage);
    // the frontier as an XY chart (LX.Plot): x CO2 in Mt, y cost in $M; the price's equal-score line clipped to the box
    var XR = [1, 5], YR = [380, 560], plot = LX.Plot(fhost, { text: "Text version of the chart" });
    function chip(label, value, tone) { var c = H("div", { class: "lx-readout" + (tone ? " " + tone : "") }, chips); H("span", { text: label }, c); H("b", { text: value }, c); }
    function clipLine(tau, x0, y0) {   // y = y0 + tau (x0 - x), in Mt and $M; the part inside XR x YR
      var f = function (x) { return y0 + tau * (x0 - x); }, a = XR[0], b = XR[1];
      if (tau > 0) { a = Math.max(a, x0 + (y0 - YR[1]) / tau); b = Math.min(b, x0 + (y0 - YR[0]) / tau); }
      return a < b ? [[a, f(a)], [b, f(b)]] : null;
    }
    var view = { mode: "carbon", cap: null, price: null };
    var BX = [2, 7], BY = [380, 640];   // the "buy" view's axes, Mt and $M
    function paint() {
      chips.innerHTML = "";
      var carbon = view.mode !== "buy", XA = carbon ? XR : BX, YA = carbon ? YR : BY;
      var pts = [], spec = { x: { min: XA[0], max: XA[1], ticks: [] }, y: { min: YA[0], max: YA[1], step: 40, fmt: function (v) { return "$" + v + "M"; }, unit: "Cost a year" },
        height: 280, heightN: 240, lines: [], marks: [], spans: [], legend: [] };
      for (var xt = XA[0]; xt <= XA[1]; xt++) spec.x.ticks.push([xt, xt === XA[1] ? xt + " Mt" : String(xt)]);
      if (!base) {
        title.textContent = "The Plains Grid's planning LP: not solved yet"; status.textContent = "Solve the plan to start; the solver loads on the first solve (about 3.5 MB, once).";
        spec.aria = "An empty chart of cost against CO₂: nothing solved yet."; spec.text = { head: ["Plan", "CO₂", "Cost"], rows: [] }; plot.render(spec); buildExplain(); return;
      }
      if (!carbon) { paintBuy(spec); buildExplain(); return; }
      pts.push({ label: "No carbon rule", co2: base.co2, cost: base.resource });
      CAPS.forEach(function (c) { var R = cache[JSON.stringify(capOpt(c))]; if (R && R.ok) pts.push({ label: "Cap at " + c + "%", co2: R.co2, cost: R.resource, dual: R.capPrice }); });
      var fr = pts.slice().sort(function (a, b) { return a.co2 - b.co2; });
      spec.lines.push({ pts: fr.map(function (p) { return [p.co2 / 1e6, p.cost / 1e6]; }), color: "var(--lx-ink)", width: 2.2, dots: true });
      spec.legend.push({ label: fr.length > 2 ? "Frontier you traced: solved caps joined by straight lines" : "Solved plans", color: "var(--lx-ink)" });
      spec.marks.push({ x: base.co2 / 1e6, y: base.resource / 1e6, label: "No rule", kind: "ring" });
      var Rc = view.cap != null && cache[JSON.stringify(capOpt(view.cap))];
      if (Rc && Rc.ok) spec.marks.push({ x: Rc.co2 / 1e6, y: Rc.resource / 1e6, label: "Cap " + view.cap + "%", kind: "dot", pos: "below" });
      var pr = view.price != null && cache["range" + view.price];
      if (pr && pr.ok) {
        var seg = clipLine(pr.tau, pr.R.co2 / 1e6, pr.R.resource / 1e6);
        if (seg) { spec.lines.push({ pts: seg, color: "var(--lx-accent)", width: 2, dash: "6 4" }); spec.legend.push({ label: "Equal score at " + f2(pr.tau) + " per t" + (pr.tau % 1 ? " (rounded)" : ""), color: "var(--lx-accent)", dash: "6 4" }); }
        if (pr.hi - pr.lo >= 5000) spec.spans.push({ x0: pr.lo / 1e6, x1: pr.hi / 1e6, color: "var(--lx-accent)", op: 0.14, label: "Tied" });
        else spec.marks.push({ x: pr.R.co2 / 1e6, y: pr.R.resource / 1e6, label: "Price " + f2(pr.tau), kind: "dot", pos: "above", color: "var(--lx-accent)" });
      }
      spec.aria = "Cost a year against CO₂ a year for the solved plans" + (pr && pr.ok ? ", with the equal-score line of a " + f2(pr.tau) + " price" : "") + ".";
      spec.text = { head: ["Plan", "CO₂", "Cost", "Dual, $ per t"], rows: fr.map(function (p) { return [p.label, mt(p.co2), musd(p.cost), p.dual != null ? f2(p.dual) : "–"]; }),
        note: pr && pr.ok ? "At " + f2(pr.tau) + " per t the best plans emit " + tieText(pr) + "." : "" };
      plot.render(spec);
      title.textContent = "The Plains Grid's year" + (Rc && Rc.ok ? " · cap at " + view.cap + "% of " + mt(E0) : "") + (pr && pr.ok ? " · price " + f2(pr.tau) + " per t" : "");
      chip("No carbon rule", mt(base.co2) + " · " + musd(base.resource));
      if (Rc && Rc.ok) { chip("Your cap", mt(Rc.co2) + " · " + musd(Rc.resource)); chip("The cap's dual, rounded", f2(Rc.capPrice) + " per t"); }
      if (pr && pr.ok) chip("At " + f2(pr.tau) + " per t", tieText(pr));
      status.textContent = "Cost: new plants' capital and upkeep plus gas, a year, 2025 dollars; carbon payments are transfers and left out. Mt = million tonnes.";
      buildExplain();
    }
    // the "buy" view: the year with the data center; each solved purchase a point, the grid without it the reference
    function paintBuy(spec) {
      var none = cache[JSON.stringify(caseOf("none"))], rows = [["Without the data center", base]];
      if (none && none.ok) rows.push(["No rule, or certificates from existing wind", none]);
      ["annual", "hourly"].forEach(function (k) { var R = cache[JSON.stringify(caseOf(k))]; if (R && R.ok) rows.push([BUY[k], R, k]); });
      spec.marks.push({ x: base.co2 / 1e6, y: base.resource / 1e6, label: "Without the data center", kind: "ring" });
      rows.slice(1).forEach(function (r) { spec.marks.push({ x: r[1].co2 / 1e6, y: r[1].resource / 1e6, label: r[2] === "annual" ? "Annual" : r[2] === "hourly" ? "Hourly" : "No rule", kind: "dot", pos: r[2] === "hourly" ? "above" : "below", color: r[2] === view.buy ? "var(--lx-accent)" : null }); });
      spec.aria = "Cost a year against CO₂ a year: the grid without the data center and, with it, each solved purchase.";
      spec.text = { head: ["Case", "CO₂", "Cost", "Built for it"], rows: rows.map(function (r) { var R = r[1]; return [r[0], mt(R.co2), musd(R.resource), r[2] ? builtText(R) : "nothing"]; }) };
      plot.render(spec);
      title.textContent = "The Plains Grid's year with the 300 MW data center" + (view.buy ? " · " + BUY[view.buy].toLowerCase() : "");
      chip("Without the data center", mt(base.co2) + " · " + musd(base.resource));
      if (none && none.ok) chip("With it, no rule", mt(none.co2) + " · " + musd(none.resource));
      var Rb = view.buy && cache[JSON.stringify(caseOf(view.buy))];
      if (Rb && Rb.ok) { chip(view.buy === "annual" ? "Matched over the year" : "Matched hour by hour", mt(Rb.co2) + " · " + musd(Rb.resource)); chip("Built for it", builtText(Rb)); }
      status.textContent = "Each point is a year's plan with the data center, except the ring: the grid without it. Cost in 2025 dollars; Mt = million tonnes.";
    }
    function builtText(R) { return [["Wb", " wind"], ["Sb", " solar"], ["Bb", " battery"]].filter(function (x) { return Math.round(R[x[0]]) > 0; }).map(function (x) { return mw(R[x[0]]) + x[1]; }).join(", ") || "nothing"; }
    function tieText(pr) { return Math.abs(pr.hi - pr.lo) < 5000 ? mt(pr.R.co2) : "any of " + mt(pr.lo) + " to " + mt(pr.hi); }

    // ---------- step cards
    function enter(mode) { view.mode = mode; return ++stepGen; }   // every step entry: its view, and a new generation
    function solveAct(act, api, label, job, show) {
      var row = H("div", { class: "m6-row" }, act), b = label ? H("button", { type: "button", class: "lx-btn small", html: LX.icon("play") + label }, row) : null, st = LX.SolverStatus(row), g = stepGen;
      var go = LX.SolveStep.action({ api: api, st: st, host: act, go: b, cls: "m6-fail", job: function () { return job().then(function (R) { return R && R.ok === false ? (R.r || R) : null; }); },
        show: function () { st.set(""); if (g !== stepGen) return; paint(); show(); } });   // clear the loading line; redraw the stage with what is solved, if the reader is still here
      if (b) b.addEventListener("click", go);
      return go;
    }
    // a step whose controls re-solve on every change: the latest change wins; an older run's answer is dropped
    function liveRun(act, api, job, show) {
      var row = H("div", { class: "m6-row" }, act), st = LX.SolverStatus(row), note = null, n = 0, g = stepGen;
      function fail(my, r) { if (my !== n) return; api.busy(false); st.set(""); if (r.status === "superseded" || g !== stepGen) return; note = LX.SolveStep.failNote(act, r, go, { cls: "m6-fail" }); }
      function go() {
        if (note) { note.remove(); note = null; }
        var my = ++n; st.set(LX.solver && LX.solver.mode ? "solving" : "loading"); api.busy(true);
        return Promise.resolve().then(job).then(function (bad) { if (bad) return fail(my, bad.r || bad); if (my !== n) return; api.busy(false); st.set(""); if (g !== stepGen) return; show(); },
          function (e) { fail(my, { status: "error", ok: false, message: String((e && e.message) || e) }); });
      }
      return go;
    }
    function seg(act, id, label, opts, cur, onPick) {
      var w = H("div", { class: "cf-ctl" }, act); H("p", { class: "cf-ctl-l", id: id, text: label }, w);
      var s = H("div", { class: "lx-seg", role: "group", "aria-labelledby": id }, w), bs = opts.map(function (o) {
        var b = H("button", { type: "button", text: o[1] }, s); b.setAttribute("aria-pressed", String(o[0] === cur));
        b.addEventListener("click", function () { bs.forEach(function (x, i) { x.setAttribute("aria-pressed", String(opts[i][0] === o[0])); }); onPick(o[0]); });
        return b;
      });
    }
    function capLine(c, R) { return "**Cap at " + c + "%:** CO₂ " + mt(R.co2) + ", cost " + musd(R.resource) + " (" + dm(R.resource - base.resource) + "); new wind " + mw(R.Wn) + ", solar " + mw(R.Sn) + ". The cap's dual: one more tonne allowed would save " + f2(R.capPrice) + "."; }
    function priceLine(pr) {
      var tie = Math.abs(pr.hi - pr.lo) >= 5000;
      return (pr.tau % 1 ? "**A price at the cap's exact dual** (" + f2(pr.tau) + " per t, rounded): " : "**A price of " + f2(pr.tau) + " per t:** ") + (tie ? "every plan from " + mt(pr.lo) + " to " + mt(pr.hi) + " scores the same. The solver returns one, so the price picks no single plan."
        : "one CO₂ outcome at this precision, " + mt(pr.R.co2) + " at " + musd(pr.R.resource) + "; schedules may still differ.");
    }
    var BUY = { none: "No rule on what it buys", old: "Certificates from existing wind", annual: "New wind and sun, matched over the year", hourly: "New wind, sun and batteries, matched hour by hour" };
    function caseOf(k) { return k === "none" || k === "old" ? { load: M.load.mw } : { load: M.load.mw, buy: k }; }
    function buyLine(k, R) {
      var noRule = cache[JSON.stringify(caseOf("none"))];
      return "**" + BUY[k] + ":** may claim 0 t; cost " + dm(R.resource - noRule.resource) + " against no rule; the plants emit " + dmt(R.co2 - base.co2) + " against the grid without the data center.";
    }
    var steps = [
      { text: "One linear program plans the Plains Grid's year at least cost: what to build and how to run it, on six real days of 2025 that stand for the year. Solve it with no carbon rule.",
        build: function (act, api) {
          enter("carbon"); view.cap = null; view.price = null; paint();
          LX.FormulateBox(H("div", { class: "m6-form" }, act), { title: "The planning LP in words",
            parts: [{ k: "Decisions", color: "var(--lx-tier-2)", text: "New wind, solar and 4-hour batteries (MW); every hour's output of each plant and the battery's charge." },
                    { k: "Goal", color: "var(--lx-good)", text: "The least yearly cost: new plants' capital and upkeep, plus gas burned." },
                    { k: "Rules", color: "var(--lx-warn)", text: "Supply meets demand every hour; no plant above its size; the battery's energy balances." },
                    { k: "Given", color: "var(--lx-ink-3)", text: "A10's fleet, six weighted days of 2025 (EIA-930 shapes), EIA and NREL costs." }] });
          solveAct(act, api, "Solve: no carbon rule", function () { return solveBase().then(function (R) { return R.ok ? null : R; }); }, function () { paint(); api.saw("**No carbon rule:** nothing new is built; CO₂ " + mt(base.co2) + ", cost " + musd(base.resource) + " a year. The LP has " + REF.size.cols.toLocaleString("en-US") + " columns ([[decision-variable|decision variables]]) and " + REF.size.rows.toLocaleString("en-US") + " rows ([[constraint|constraints]])."); api.done(); });
          if (base) api.done();
        } },
      { text: "Cap the year's CO₂ at a share of the no-rule plan's: the [[epsilon-constraint|epsilon-constraint]] method. The cap's [[shadow-price|dual]] is the cost saved by allowing one more tonne, a carbon price the cap implies.",
        build: function (act, api) {
          enter("carbon");
          var go = liveRun(act, api, function () { var c = S.cap; return solveBase().then(function (b) { return b.ok ? solve(capOpt(c), "m6-cap") : b; }).then(function (R) { return R.ok ? null : R; }); },
            function () { view.cap = S.cap; paint(); api.saw(capLine(S.cap, cache[JSON.stringify(capOpt(S.cap))])); api.done(); });
          LX.Slider(H("div", null, act), { label: "Cap, share of the no-rule plan's CO₂", color: "var(--lx-warn)", min: CAPS[CAPS.length - 1], max: CAPS[0], step: 10, value: S.cap,
            fmt: function (v) { return v + "%"; }, onChange: function (v) { S.cap = v; keep(); go(); } });
          go();
        } },
      { text: "Trace the [[pareto-frontier|frontier]]: solve every cap from 90% down to 30%, each point the cheapest plan at its CO₂. Watch the dual climb as the cap tightens.",
        build: function (act, api) {
          enter("carbon"); var tbl = H("div", null, act);
          solveAct(act, api, "Trace seven caps", function () {
            return CAPS.reduce(function (p, c) { return p.then(function (bad) { return bad || solve(capOpt(c), "m6-trace").then(function (R) { return R.ok ? null : R; }); }); }, solveBase().then(function (b) { return b.ok ? null : b; }));
          }, function () {
            paint(); tbl.innerHTML = "";
            LX.Ledger(tbl, { cls: "m6-led", caption: "Each cap solved alone; cost a year in 2025 dollars.", columns: ["Cap", "CO₂", "Cost", "Dual, $ per t"],
              rows: CAPS.map(function (c) { var R = cache[JSON.stringify(capOpt(c))]; return { head: c + "%", cells: [mt(R.co2), musd(R.resource), f2(R.capPrice)] }; }) });
            var lo = cache[JSON.stringify(capOpt(CAPS[0]))].capPrice, hi = cache[JSON.stringify(capOpt(CAPS[CAPS.length - 1]))].capPrice;
            api.saw("**The frontier bends:** the dual rises from " + f2(lo) + " at 90% to " + f2(hi) + " at 30%. From 90% to 70% it barely moves: a nearly straight stretch."); api.done();
          });
        } },
      { text: "Now price CO₂ instead: cost plus price times CO₂, the [[weighted-sum|weighted sum]], where most prices pick one CO₂ outcome. Set the price to your cap's dual and see what happens on that straight stretch.",
        build: function (act, api) {
          enter("carbon"); var tau = null;
          var run = liveRun(act, api, function () {
            tau = S.tauFrom != null ? S.tauFrom : S.tau; var t = tau;
            return solveBase().then(function (b) { return b.ok ? priceRun(t) : b; }).then(function (pr) { return pr.ok ? null : pr; });
          }, function () { view.price = tau; paint(); api.saw(priceLine(cache["range" + tau])); api.done(); });
          LX.Slider(H("div", null, act), { label: "Carbon price, $ per t", color: "var(--lx-warn)", min: 0, max: 140, step: 10, value: S.tau,
            fmt: function (v) { return "$" + v; }, onChange: function (v) { S.tau = v; S.tauFrom = null; keep(); run(); } });
          var b = H("button", { type: "button", class: "lx-btn small ghost", text: "Use the dual of a cap at " + S.cap + "%" }, H("div", { class: "m6-row" }, act));
          H("p", { class: "lx-hint", text: "The button uses the dual at full precision; the page prints it rounded to the cent, and a tie needs the exact value." }, act);
          b.addEventListener("click", function () {
            var g = stepGen;
            solveBase().then(function (bb) { return bb.ok ? solve(capOpt(S.cap), "m6-cap") : bb; }).then(function (R) { if (!R.ok || g !== stepGen) return; S.tauFrom = R.capPrice; view.cap = S.cap; run(); });
          });
          run();
        } },
      { text: "Add A10's 300 MW data center, a flat load, with no rule on what it buys. The LP may build for it: this is A10's long-run question, answered by a planning model.",
        build: function (act, api) {
          enter("buy"); view.buy = null; paint();
          solveAct(act, api, "Solve with the data center", function () { return solveBase().then(function (b) { return b.ok ? solve(caseOf("none"), "m6-load") : b; }); }, function () {
            var R = cache[JSON.stringify(caseOf("none"))];
            api.saw("**With the data center, no rule:** CO₂ " + dmt(R.co2 - base.co2) + " (" + (Math.round((R.co2 - base.co2) / (M.load.mw * 8760) * 100) / 100).toFixed(2) + " t per MWh), cost " + dm(R.resource - base.resource) + "; new wind " + mw(R.Wn) + ". Gas serves it.");
            api.done();
          });
        } },
      { text: "Now the buyer must cover its use with new wind, sun and batteries of its own, over the year or hour by hour ([[hourly-matching|hourly matching]]), and may then claim zero. Compare what each rule costs.",
        build: function (act, api) {
          enter("buy"); view.buy = S.buy; paint();
          var go = liveRun(act, api, function () {
            var k = S.buy;
            return solveBase().then(function (b) { return b.ok ? solve(caseOf("none"), "m6-load") : b; }).then(function (r) { return r.ok ? solve(caseOf(k), "m6-buy") : r; }).then(function (R) { return R.ok ? null : R; });
          }, function () { view.buy = S.buy; paint(); api.saw(buyLine(S.buy, cache[JSON.stringify(caseOf(S.buy))])); api.done(); });
          seg(act, "m6-buy-l", "Matching rule", [["annual", "Over the year"], ["hourly", "Hour by hour"]], S.buy, function (k) { S.buy = k; keep(); go(); });
          go();
        } },
      { text: "Meeting a rule is not causing a cut: certificates from existing wind meet an annual rule too. Compare what each purchase changes at the plants, against the grid without the data center.",
        build: function (act, api) {
          enter("buy"); view.buy = null; paint(); var host = H("div", null, act);
          solveAct(act, api, "Compare the four purchases", function () {
            return ["none", "annual", "hourly"].reduce(function (p, k) { return p.then(function (bad) { return bad || solve(caseOf(k), "m6-cmp").then(function (R) { return R.ok ? null : R; }); }); }, solveBase().then(function (b) { return b.ok ? null : b; }));
          }, function () {
            host.innerHTML = ""; ledger(host);
            var none = cache[JSON.stringify(caseOf("none"))];
            api.saw("**Same claim, different consequences:** three purchases may claim 0 t, yet against no data center the plants emit from " + dmt(cache[JSON.stringify(caseOf("hourly"))].co2 - base.co2) + " to " + dmt(none.co2 - base.co2) + "."); api.done();
          });
        } }
    ];
    var cards = LX.StepCards(live, { steps: steps });
    function ledger(host) {
      var none = cache[JSON.stringify(caseOf("none"))];
      LX.Ledger(host, { cls: "m6-led", caption: "A year with the 300 MW data center; the plants' change is against the grid without it, the cost against no rule.",
        columns: ["Purchase", "May claim", "The plants emit", "Cost", "Built for it"],
        rows: ["none", "old", "annual", "hourly"].map(function (k) {
          var R = cache[JSON.stringify(caseOf(k))];
          return { head: BUY[k], sub: k === "old" ? "not additional: nothing new is built" : k === "none" ? "the location-based count applies" : "additional and on this grid",
            cells: [k === "none" ? "its share at average factors" : "0 t", dmt(R.co2 - base.co2), dm(R.resource - none.resource), k === "annual" || k === "hourly" ? builtText(R) : "nothing"] };
        }) });
    }

    // ---------- the explain layer (precomputed reference until the reader solves)
    var xhost = document.getElementById("m06-explain");
    // the cap card of the explain layer: the reader's solved cap, else the 70% reference example, labelled as such
    function capWords() {
      var R = view.cap != null && cache[JSON.stringify(capOpt(view.cap))];
      return "A rule: the year's CO₂ at most the cap. Its dual is a price per tonne: " + (R && R.ok ? f2(R.capPrice) + " at your cap of " + view.cap + "%." : f2(REF.caps[2].dual) + " at 70%, the reference example.");
    }
    function buildExplain() {
      if (!xhost) return;
      xhost.innerHTML = ""; xhost.classList.add("is-live");
      LX.FormulateBox(H("div", { class: "lx-xcard" }, xhost), { title: "Three ways to put carbon in the LP",
        parts: [{ k: "A cap", color: "var(--lx-warn)", text: capWords() },
                { k: "A price", color: "var(--lx-good)", text: "A cost: each tonne adds the price to the goal. At the cap's dual, a whole stretch of plans ties." },
                { k: "A procurement rule", color: "var(--lx-tier-2)", text: "A rule on one buyer's purchases. It sets a claim; what the plants emit is a separate result." }] });
      LX.Boundary(H("div", { class: "lx-xcard" }, xhost), { title: "Where these answers hold",
        holds: ["six real days of 2025 stand for the year, two of them extreme;", "perfect foresight, one year, fixed demand, no lines inside the grid;", "costs in 2025 dollars at 4% real; existing gas plants stay."],
        leaves: ["the full year: the Go deeper box checks two plans on every hour;", "other years' weather, and plants retiring;", "CO₂ beyond the stack, and the cost of the existing fleet."],
        source: "The Plains Grid is fictional; demand, wind and sun follow the Southwest Power Pool's 2025 hours (EIA-930)." });
    }
    paint();
    LX.demo(root, function (state) {
      if (state === "mid") { cards.go(1); return { view: "a cap" }; }
      if (state === "frontier" || state === "buy") {   // open the step and press its solve button, as a reader would
        cards.go(state === "frontier" ? 2 : 6);
        var b = cards.el.querySelectorAll(".m6-row .lx-btn")[0]; if (b) b.click();
        return { view: state === "frontier" ? "the frontier traced" : "the four purchases compared" };
      }
      return null;
    }, cards);
    root.lxLesson = { Y: Y, S: S, cards: cards, cache: cache };
  });
})();
