// a12-policy-instruments.js — Analyst lesson A12, "How do governments steer energy? Taxes, credits, standards and carbon
// prices" (step cards with a linear program).
//
// The model is the Plains Grid's planning LP in assets/learn/components/plainsplan.js (window.LX.plainsPlan, in the
// learn.js bundle; Node: require). Data: a10-emissions-questions.json (the existing fleet),
// m06-carbon-in-models.json (what may be built, its costs in 2025 dollars, the representative days, the tie rule),
// a12-policy-instruments.json (the four instruments, a real rule of each kind, the reference block), town_year.json,
// cf_targets.json and path.json (the last step names case file CF4 through LX.lessonRefHTML).
// One instrument at a time, each against the plan with no policy:
//   carbon price  tau $ per t on every tonne of gas CO2          emitters pay tau x CO2 to the government
//   production    ptc $ per MWh of new wind and solar used         the government pays ptc x those MWh
//   investment    itc share of the capital of new wind, solar and batteries: paid up front at the build (itcUpfront);
//                 the ledger's yearly figure is its annual equivalent (the share of the annual capital recovery at 4%)
//   standard      wind and sun used >= ces x the year's demand     illustrative: certificates assumed to trade at the
//                                                                   row's dual (the marginal compliance cost) and customers
//                                                                   assumed to fund them, x the clean MWh required
// Cost per tonne avoided = change in resource cost / CO2 avoided, both against no policy, from unrounded values.
// A solve that ends after the reader has left its step paints nothing (stepGen), so a late answer never lands on
// another step's stage.
// Reported for each run (all from read(): the tie rule's hair costs and the transfers left out of the resource cost):
// CO2 and its cut against no policy, the resource cost and its change, cost per tonne avoided (change in resource cost ÷
// tonnes avoided), what is built, wind and sun used and curtailed, the money that changes hands. The test proves that each
// is the same for every best plan of the LP at every slider setting (minimum and maximum over the optimal face), and that
// the certificate price is unique (both one-sided changes of the cost agree).
// Scope rule: instruments act on wind, solar, storage and gas only; the page never searches for a
// level of any instrument; the reader sets each level on a fixed slider.
(function () {
  "use strict";
  // ---------------------------------------------------------------- pure helpers (no DOM; exported for Node)
  function opts(id, v) { var o = {}; o[id] = id === "itc" || id === "ces" ? v / 100 : v; return o; }
  function compare(base, R) {
    var cut = base.co2 - R.co2, dRes = R.resource - base.resource;
    return { cut: cut, cutPct: cut / base.co2, dRes: dRes, perT: cut > 1 ? dRes / cut : null,
      moved: { tau: R.carbonPay, ptc: R.ptcPay, itc: R.itcPay, ces: R.certPay } };
  }
  function moneyOf(id, R) { return id === "tau" ? R.carbonPay : id === "ptc" ? R.ptcPay : id === "itc" ? R.itcPay : R.certPay; }
  // the money, in words: a year, with the investment credit's cash up front and the certificates labelled illustrative
  function moneyLine(id, R) {
    var m = fmt.m(moneyOf(id, R));
    return id === "tau" ? "Gas plants pay " + m + " a year in carbon payments." : id === "ptc" ? "Taxpayers pay " + m + " a year in credits."
      : id === "itc" ? "Taxpayers pay " + fmt.m(R.itcUpfront) + " up front: " + m + " a year as an annual equivalent."
      : "At a certificate price of $" + R.cesPrice.toFixed(2) + " per MWh, customers would spend " + m + " a year (illustrative).";
  }
  function moneyCell(id, R) { return fmt.m(moneyOf(id, R)) + (id === "itc" ? " (annual equivalent of " + fmt.m(R.itcUpfront) + " up front)" : id === "ces" ? " (illustrative)" : ""); }
  var fmt = {
    mt: function (t) { return (t / 1e6).toFixed(2) + " Mt"; },
    m: function (v) { return (v < 0 ? "−$" : "$") + (Math.abs(v) / 1e6).toFixed(1) + "M"; },
    dm: function (v) { var r = Math.round(v / 1e5) / 10; return (r < 0 ? "−$" : r > 0 ? "+$" : "$") + Math.abs(r).toFixed(1) + "M"; },
    pct: function (x) { return Math.round(x * 100) + "%"; },
    mw: function (v) { return Math.round(v).toLocaleString("en-US") + " MW"; },
    twh: function (v) { return (v / 1e6).toFixed(1) + " TWh"; },
    pt: function (v) { return v == null ? "–" : "$" + Math.round(v) + " per t"; },
    val: function (I, v) { return I.id === "tau" ? "$" + v + " per t" : I.id === "ptc" ? "$" + v + " per MWh" : v + "%"; }
  };
  var model = { opts: opts, compare: compare, moneyOf: moneyOf, moneyLine: moneyLine, moneyCell: moneyCell, fmt: fmt };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX || !window.LX.H) return;

  // ================================================================ the page
  var LX = window.LX, H = LX.H, SLUG = "a12-policy-instruments";
  LX.mount(SLUG, function (live, data, root) {
    var PP = LX.plainsPlan, D = data.a12_policy_instruments, I = {}, saved = LX.store.get("a12", {}) || {}, PJ = data.path || null;   // PJ: path.json, for LX.lessonRefHTML
    D.instruments.forEach(function (x) { I[x.id] = x; });
    var Y = PP.prepare(data.a10_emissions_questions.plains, data.m06_carbon_in_models, data.town_year, data.cf_targets, LX.townProfile);
    var S = {}; D.instruments.forEach(function (x) { var v = saved[x.id]; S[x.id] = typeof v === "number" && v >= x.min && v <= x.max && (v - x.min) % x.step === 0 ? v : x.def; });
    function keep() { LX.store.set("a12", S); }
    var cache = {}, seq = 0, shown = null, base = null, stepGen = 0;   // stepGen: bumped on every step entry
    // one solve, never rejects: the read result, or { ok: false, r }
    function solve(o, key) {
      var k = JSON.stringify(o); if (cache[k]) return Promise.resolve(cache[k]);
      return LX.solver.solve(PP.build(Y, o), { timeLimit: 10, key: key || "a12" }).then(function (r) {
        if (!r.ok) return { ok: false, r: r }; var R = PP.read(Y, o, r); cache[k] = R; return R;
      }, function (e) { return { ok: false, r: { status: "error", ok: false, message: String((e && e.message) || e) } }; });
    }

    // ---------- the stage: readouts and the year's energy mix against no policy
    var stage = H("div", { class: "lx-stage" }, live), title = H("h3", null, H("div", { class: "lx-stage-head" }, stage));
    var chips = H("div", { class: "lx-readouts", "aria-live": "polite" }, stage), mixHost = H("div", null, stage);
    var mixText = H("p", { class: "lx-hint" }, stage), status = H("p", { class: "lx-stage-status", "aria-live": "polite" }, stage);
    H("p", { class: "lx-hint", text: "Units: Mt = million tonnes of CO₂; TWh = million MWh; money a year, in 2025 dollars." }, stage);
    var PARTS = [{ key: "clean", label: "Wind and sun used", color: "var(--lx-wind)" }, { key: "cc", label: "Gas combined cycle", color: "var(--lx-cc)" }, { key: "ct", label: "Gas peakers", color: "var(--lx-pk)" }];
    var mix = LX.CostSplit(mixHost, { parts: PARTS, rows: [], fmt: function (v) { return (v / 1e6).toFixed(1) + " TWh"; }, scale: Y.demandMWh * 1.02 });
    function chip(label, value, tone) { var c = H("div", { class: "lx-readout" + (tone ? " " + tone : "") }, chips); H("span", { text: label }, c); H("b", { text: value }, c); }
    function rowOf(key, label, R) { return { key: key, label: label, values: { clean: R.clean, cc: R.ccMWh, ct: R.ctMWh }, total: R.clean + R.ccMWh + R.ctMWh,
      aria: label + ": " + LX.CostSplit.text(PARTS, { clean: R.clean, cc: R.ccMWh, ct: R.ctMWh }, function (v) { return (v / 1e6).toFixed(1) + " TWh"; }) + "; CO₂ " + fmt.mt(R.co2) + "." }; }
    function paint() {
      chips.innerHTML = "";
      if (!base) { title.textContent = "The Plains Grid's plan: not solved yet"; mix.set([]); mixText.textContent = ""; status.textContent = "Solve the plan to start; the solver loads on the first solve (about 3.5 MB, once)."; return; }
      var R = shown ? shown.R : base, c = compare(base, R), id = shown ? shown.id : null;
      title.textContent = "The Plains Grid's plan for a year" + (id ? " · " + I[id].short + " " + fmt.val(I[id], shown.v) : " · no policy");
      chip("CO₂", fmt.mt(R.co2)); if (id) chip("Cut against no policy", fmt.pct(c.cutPct), c.cut > 1 ? "good" : null);
      chip("Resource cost", fmt.m(R.resource)); if (id) chip("Change in resource cost", fmt.dm(c.dRes), c.dRes > 5e4 ? "bad" : null);
      chip("New wind · solar · battery", fmt.mw(R.Wn) + " · " + fmt.mw(R.Sn) + " · " + fmt.mw(R.Bn));
      if (id) chip(id === "tau" ? "Carbon payments a year" : id === "ces" ? "Certificate spending, illustrative" : id === "itc" ? "Credit, annual equivalent" : "Credits paid a year", fmt.m(moneyOf(id, R)));
      if (id === "itc") chip("Credit up front", fmt.m(R.itcUpfront));
      mix.set([rowOf("base", "No policy", base)].concat(id ? [rowOf("with", "With the " + I[id].short, R)] : []));
      mixText.innerHTML = LX.rich("The year's electricity by source; demand is " + fmt.twh(Y.demandMWh) + ". Wind and sun [[curtailment|curtailed]]: " + fmt.twh(R.curtailed) + ".");
      status.textContent = "Resource cost: new plants' capital and upkeep plus the gas burned, a year in 2025 dollars; payments between groups are left out.";
      buildExplain();
    }

    // ---------- step cards
    function solveLine(id) {
      if (!base || !shown || shown.id !== id) return "";
      var R = shown.R, c = compare(base, R);
      return "**At " + fmt.val(I[id], shown.v) + ":** CO₂ " + fmt.mt(R.co2) + ", a " + fmt.pct(c.cutPct) + " cut; resource cost " + fmt.dm(c.dRes) +
        (c.perT != null ? "; per tonne avoided, " + fmt.dm(c.dRes).replace("+", "") + " ÷ " + fmt.mt(c.cut) + " = " + fmt.pt(c.perT) : "") + ". " + moneyLine(id, R);
    }
    function instrumentStep(id, text) {
      var x = I[id];
      return { text: text, build: function (act, api) {
        var row = H("div", { class: "a12-row" }, act), st = LX.SolverStatus(row), note = null, g = ++stepGen;
        function go() {
          if (note) { note.remove(); note = null; }
          var v = S[id], n = ++seq; st.set(LX.solver && LX.solver.mode ? "solving" : "loading"); api.busy(true);
          return (base ? Promise.resolve(base) : solve({}, "a12-base")).then(function (b) {
            if (!b.ok) return b; base = b; return solve(opts(id, v), "a12-" + id);
          }).then(function (R) {
            if (n !== seq || g !== stepGen) { api.busy(false); return; }   // a newer setting, or another step, replaced this one
            api.busy(false); st.set("");
            if (!R.ok) { if (R.r && R.r.status === "superseded") return; note = LX.SolveStep.failNote(act, R.r, go, { cls: "a12-fail" }); return; }
            shown = { id: id, v: v, R: R }; paint(); api.saw(solveLine(id)); api.done();
          });
        }
        LX.Slider(H("div", null, act), { label: x.label + " (" + x.unit + ")", color: x.color, min: x.min, max: x.max, step: x.step, value: S[id],
          fmt: function (v) { return fmt.val(x, v); }, onChange: function (v) { S[id] = v; keep(); go(); } });
        H("p", { class: "lx-hint", text: x.side }, act);
        go();
      } };
    }
    var steps = [
      { text: "The Plains Grid may build new wind, solar and 4-hour batteries; its gas plants already exist. Solve the least-cost plan for a year with no policy, on six real days of 2025.",
        build: function (act, api) {
          var g = ++stepGen; shown = null; paint();
          var row = H("div", { class: "a12-row" }, act), b = H("button", { type: "button", class: "lx-btn small", html: LX.icon("play") + "Solve the plan" }, row), st = LX.SolverStatus(row);
          var go = LX.SolveStep.action({ api: api, st: st, host: act, go: b, cls: "a12-fail",
            job: function () { return solve({}, "a12-base").then(function (R) { if (!R.ok) return R.r; base = R; return null; }); },
            show: function () { st.set(""); if (g !== stepGen) return; paint(); api.saw("**No policy:** nothing new is built; new wind costs more than the gas it would save. CO₂ " + fmt.mt(base.co2) + "; wind and sun meet " + fmt.pct(base.shareClean) + " of demand."); api.done(); } });
          b.addEventListener("click", go);
          if (base) { paint(); api.done(); }
        } },
      instrumentStep("tau", "A [[carbon-price|carbon price]] charges gas plants for each tonne of CO₂ they emit. Set it and see what the planner builds."),
      instrumentStep("ptc", "A [[production-credit|production credit]] pays new wind and solar for each MWh they deliver. Set it and compare: what does the plan build, and what does the credit cost taxpayers?"),
      instrumentStep("itc", "An [[investment-credit|investment credit]] pays a share of what new wind, solar and batteries cost to build. It is spread here over each plant's life at 4% a year."),
      instrumentStep("ces", "A [[clean-energy-standard|clean-energy standard]] requires a share of the year's demand from wind and sun. Assume certificates trade at its [[shadow-price|shadow price]], the marginal cost of complying, and customers fund them."),
      { text: "Compare the four at your settings. The [[resource-cost|resource cost]] is what the plan uses up; a carbon payment, a credit or a certificate is a [[transfer-payment|transfer]] between groups, not a cost to society.",
        build: function (act, api) {
          var host = H("div", null, act), row = H("div", { class: "a12-row" }, act), st = LX.SolverStatus(row), g = ++stepGen;
          var b = H("button", { type: "button", class: "lx-btn small", html: LX.icon("play") + "Solve all four" }, row);
          var go = LX.SolveStep.action({ api: api, st: st, host: act, go: b, cls: "a12-fail",
            job: function () {
              var first = base ? Promise.resolve(null) : solve({}, "a12-base").then(function (R) { if (!R.ok) return R.r; base = R; return null; });
              return D.instruments.reduce(function (p, x) { return p.then(function (bad) { return bad || solve(opts(x.id, S[x.id]), "a12-all-" + x.id).then(function (R) { return R.ok ? null : R.r; }); }); }, first);
            },
            show: function () { st.set(""); if (g !== stepGen) return; paint(); host.innerHTML = ""; ledger(host); rules(host); api.saw("**Same grid, four instruments:** compare each cut with its change in resource cost, and see who pays. A real rule of each kind follows."); api.done(); } });
          b.addEventListener("click", go); go();
          if (PJ && LX.lessonRefHTML) H("p", { class: "lx-hint", html: "Case file " + LX.lessonRefHTML(PJ, "CF4") + " (hydrogen at existing plants) practises reading which assumptions, a policy among them, a published result rests on." }, act);
        } }
    ];
    var cards = LX.StepCards(live, { steps: steps });

    function results() { return D.instruments.map(function (x) { return { x: x, R: cache[JSON.stringify(opts(x.id, S[x.id]))] }; }); }
    function ledger(host) {
      LX.Ledger(host, { cls: "a12-led", caption: "One instrument at a time, each against no policy (CO₂ " + fmt.mt(base.co2) + ", resource cost " + fmt.m(base.resource) + " a year).",
        columns: ["Instrument", "CO₂ cut", "Resource cost", "Per tonne avoided", "Money that changes hands, a year", "Paid by"],
        rows: results().filter(function (z) { return z.R; }).map(function (z) {
          var c = compare(base, z.R);
          return { head: z.x.label + ", " + fmt.val(z.x, S[z.x.id]), sub: z.x.side, cells: [fmt.pct(c.cutPct), fmt.dm(c.dRes), fmt.pt(c.perT), moneyCell(z.x.id, z.R), z.x.payer] };
        }) });
      H("p", { class: "lx-hint", text: "Per tonne avoided = the change in resource cost ÷ the CO₂ avoided, both against no policy; transfers are left out." }, host);
    }
    // one rule of each kind, as the page's static block: name, what it does, its source, each its own element
    function srcHTML(x) { return "Source: " + (x.url ? '<a href="' + LX.esc(x.url) + '">' + LX.esc(x.label) + "</a>" : LX.esc(x.label)) + ", " + LX.esc(x.asOf) + "."; }
    function rules(host) {
      var ul = H("ul", { class: "a12-rules" }, host);
      D.rules.forEach(function (r) {
        var li = H("li", null, ul);
        H("p", { html: "<b>" + LX.esc(r.kind) + " · " + LX.esc(r.where) + ".</b> " + LX.esc(r.name) + "." }, li);
        H("p", { text: r.text }, li); H("p", { class: "lx-hint", html: srcHTML(r.source) }, li);
        if (r.context) { H("p", { text: r.context.text }, li); H("p", { class: "lx-hint", html: srcHTML(r.context.source) }, li); }
      });
    }

    // ---------- the explain layer, with the reader's numbers when solved, else the reference block
    var xhost = document.getElementById("a12-explain");
    function buildExplain() {
      if (!xhost) return;
      xhost.innerHTML = ""; xhost.classList.add("is-live");
      var rows = D.instruments.map(function (x) {
        var R = base && cache[JSON.stringify(opts(x.id, S[x.id]))], ref = D.reference.defaults[x.id], c = R ? compare(base, R) : null;
        return { key: x.id, color: x.color, name: x.label, note: fmt.val(x, R ? S[x.id] : x.def) + (R ? "" : " (default)"),
          cut: c ? fmt.pct(c.cutPct) : ref.cut, per: c ? fmt.pt(c.perT) : ref.per, pays: x.pays, side: x.side };
      });
      LX.CompareTable(H("div", { class: "lx-xcard" }, xhost), { title: "Four instruments, one plan", text: true,
        caption: "Each alone, against no policy. Your settings once solved; until then the defaults.",
        columns: [{ key: "name", label: "Instrument", main: true }, { key: "cut", label: "CO₂ cut" }, { key: "per", label: "Per tonne avoided" }, { key: "pays", label: "Who pays" }, { key: "side", label: "Side effect" }],
        rows: rows });
      LX.CausalChain(H("div", { class: "lx-xcard" }, xhost), { title: "How a carbon price works through the plan",
        links: [{ title: "A price per tonne", text: "Each gas MWh costs more: 0.40 t at the combined-cycle plants, 0.58 t at the peakers." },
                { title: "Wind is worth more", text: "Each MWh of new wind now saves gas fuel and the carbon payment." },
                { title: "The plan changes", text: "The planner builds wind until one more MW saves less than it costs." },
                { title: "CO₂ falls", text: "Less gas burns; the plants still pay the price on what they emit." }],
        note: "A credit pushes on the same lever from the other side: it lowers wind's cost, and taxpayers pay." });
      LX.Boundary(H("div", { class: "lx-xcard" }, xhost), { title: "Where these answers hold",
        holds: ["one year estimated from six real days of 2025, two of them extreme;", "the planner minimizes cost with perfect foresight; existing gas plants stay;", "costs from EIA and NREL in 2025 dollars, at 4% real."],
        leaves: ["demand that answers to prices: demand is fixed here;", "how the money is raised or spent, and who bears it in the end;", "lines inside the grid, imports, and the build-out's timing."],
        source: "The Plains Grid is fictional; the real rules named in step 6 differ in detail from these model instruments." });
    }

    paint();
    LX.demo(root, function (state) {
      if (state === "mid") { cards.go(1); return { view: "carbon price" }; }
      if (state === "compare") { cards.go(5); return { view: "the four compared" }; }
      return null;
    }, cards);
    root.lxLesson = { model: model, Y: Y, S: S, cards: cards, cache: cache };
  });
})();
