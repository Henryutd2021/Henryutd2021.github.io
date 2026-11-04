// sb1-microgrid-workbench.js — SB1, "Microgrid Workbench" (sandbox, wave W3, 2026-11-03), on engine E1
// (assets/learn/components/engine-e1.js, LX.E1, in the bundle; data assets/learn/data/e1-prairie-campus.json).
//
// The page: the brief (static), the bench (E1.Bench: the one-line diagram with each load's priority, the sizes, the
// outages, the feeder's limits, the tariff and the owner; Run the outages, Size it for me; readouts; the plan link), the
// results (E1.Results: the annual cost, each outage's unserved load per priority, one outage hour by hour) and a test of
// the plan on the ten seeded winter outages (a second run box), then how the engine works (LX.Boundary and a two-run
// diagram) and the sources. Every number the page states comes from E1 and is checked by
// _tests/learn/test_sb1-microgrid-workbench.js (with the engine's own test, test_e1-engine.js).
(function () {
  "use strict";
  // ---------------------------------------------------------------- pure words (Node: the test reads them)
  function kwh(v) { return Math.round(v).toLocaleString("en-US") + " kWh"; }
  // what the ten seeded outages say about one plan: never more than the sample supports
  function seededWords(R) {
    var n = R.outages.length, ok = R.outages.filter(function (o) { return o.must < 0.5; }).length;
    var worst = R.outages.reduce(function (w, o) { return !w || o.must > w.must ? o : w; }, null);
    var text = "With this plan the must-stay-on loads were fully served in " + ok + " of these " + n + " drawn outages" +
      (ok < n ? "; the worst, " + worst.short.replace("#", "outage ") + ", left " + kwh(worst.must) + " unserved." : ".");
    return { n: n, ok: ok, worst: worst, text: text, caution: "A sample of " + n + " outages drawn for teaching: it shows how the plan copes with these, not how often it would fail." };
  }
  var page = { seededWords: seededWords };
  if (typeof module !== "undefined" && module.exports) module.exports = page;
  if (typeof window === "undefined" || !window.LX || !window.LX.E1) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H, E1 = LX.E1;
  LX.mount("sb1", function (live, data, root) {
    var P = E1.prepare(data.e1_prairie_campus), PATH = data.path, stub = null;
    var rh = document.getElementById("sb1-results"), fb = rh.querySelector(".lx-fallback");
    if (fb) fb.hidden = true;
    var resBox = H("div", { class: "sb1-res" }, rh);
    // a demo state can stub the next solve: "fail" (the solver errors) or "tl" (a time limit with a plan kept)
    function stubSolver() {
      if (!stub) return null;
      var kind = stub; stub = null;
      return function (m, o) {
        if (kind === "fail") return Promise.resolve({ status: "error", ok: false, message: "solver stopped (demo)" });
        return LX.solver.solve(m, o).then(function (r) { if (r.values && m.variables.some(function (v) { return v.type === "integer"; })) { r.status = "time-limit"; r.ok = false; r.mipGap = 0.0123; } return r; });
      };
    }
    var B = E1.Bench(live, { P: P, slug: "sb1", resultsHost: resBox, solver: stubSolver,
      draw: function (host, R, st, r, sizeNote) { E1.Results(host, R, { P: P, slug: "sb1", sizeNote: sizeNote }); },
      onChange: function (plan) { T.changed(plan); } });

    // ---- the plan on ten seeded winter outages (a second run box, with its own failure states)
    var tc = H("div", { class: "lx-xcard sb1-seeded" }, rh);
    H("h3", { text: "Test the plan on " + P.seeded.length + " drawn winter outages" }, tc);
    H("p", { class: "lx-hint", text: P.cfg.seeded.note }, tc);
    var tRow = H("div", null, tc), tStale = H("p", null, tc), tRes = H("div", { class: "sb1-seeded-res" }, tc), tStop = E1.ui.stopper();
    var T = LX.BenchRun(tRow, { label: "Run the " + P.seeded.length + " outages", state: function () { return B.plan(); }, partial: true, results: [tRes], stale: tStale, busy: tStop.busy,
      solve: function (st, ctx) { return E1.solve(st, P, { task: "run", scenarios: P.seeded, signal: ctx.signal, attempt: ctx.attempt }); },
      render: function (R) { drawSeeded(R); } });
    tStop.attach(T);   // a Stop button while the ten outages run (W3 review SB1 9)
    function drawSeeded(R) {
      tRes.innerHTML = "";
      var w = seededWords(R);
      H("p", { class: "sb1-seeded-sum", html: "<b>" + LX.esc(w.text) + "</b> " + LX.esc(w.caution) }, tRes);
      var sx = H("div", { class: "lx-scroll-x" }, tRes), tb = H("table", { class: "lx-facts" }, sx), hr = H("tr", null, H("thead", null, tb));
      ["Outage", "Starts", "Hours", "Must stay on, unserved", "Keep if possible, unserved", "Diesel burned"].forEach(function (x) { H("th", { scope: "col", text: x }, hr); });
      var bd = H("tbody", null, tb);
      R.outages.forEach(function (o, i) {
        var tr = H("tr", null, bd);
        H("th", { scope: "row", text: "#" + (i + 1) }, tr); H("td", { text: E1.when(o.sc, 0) }, tr); H("td", { class: "n", text: String(o.hours.length) }, tr);
        H("td", { class: "n" + (o.must > 0.5 ? " sb1-bad" : ""), text: kwh(o.must) }, tr); H("td", { class: "n", text: kwh(o.keep) }, tr);
        H("td", { class: "n", text: E1.fmt.gal(o.fuel) }, tr);
      });
      E1.ui.label(tb);
    }

    // ---- how the engine works
    var x = document.getElementById("sb1-explain"); x.innerHTML = "";
    var flow = H("div", { class: "lx-xcard" }, x);
    H("h3", { text: "Two ways to use the engine" }, flow);
    var fl = H("div", { class: "sb1-flow" }, flow);
    [["Run the outages", "Your sizes stay fixed.", ["A normal year on the grid: a [[linear-program|linear program]] on 12 average days, one per month; each day's battery ends where it began.",
      "Each outage as an island: a mixed-integer program with whole generator sets that run at 30% or more.",
      "Out: the annual cost, and each outage's unserved load by priority, diesel and CO₂."]],
     ["Size it for me", "Your other choices stay fixed.", ["One mixed-integer program picks solar, battery and whole sets for the cheapest year that keeps every must-stay-on load on in every chosen outage.",
      "The sizes are rounded up to the bench's steps: a safe plan, not proven the cheapest on the steps.", "Run the outages then checks them, with the sets' 30% minimum the sizing left out."]]].forEach(function (c) {
      var col = H("div", { class: "sb1-fcol" }, fl);
      H("p", { class: "sb1-fh", html: "<b>" + c[0] + "</b> · " + c[1] }, col);
      var ol = H("ol", null, col); c[2].forEach(function (t) { H("li", { html: LX.rich(t) }, ol); });
    });
    H("p", { class: "lx-hint", html: LX.rich("The engine does not calculate marginal electricity prices: a [[mixed-integer-program|mixed-integer program]] gives none. What a resource is worth here is the difference between two solved plans: size with and without it, and subtract.") }, flow);
    LX.Boundary(H("div", { class: "lx-xcard" }, x), { title: "Where the engine's answer holds",
      holds: ["the outages you choose are the ones that matter", "each load is flat and can be partly served", "12 average days stand in for the year (a full year's bill: up to 7% higher for large solar-and-battery plans)", "the coming sun is known (perfect foresight), and the battery and the tank start full"],
      leaves: ["marginal prices of any kind from the model", "the wiring and protection inside the campus", "part-load fuel use, battery wear and fuel deliveries during an outage", "outage diesel in the annual cost (shown per outage)", "outages you do not choose, and how often any outage happens"],
      source: "Prairie Campus is lesson F7's and fictional; costs illustrative, 2025 dollars." });

    // ---- the first run, once the bench is in view (the solver loads then: about 3.5 MB, once)
    var started = false;
    function start() { if (started) return; started = true; B.go(); }
    if (typeof IntersectionObserver !== "undefined") {
      var io = new IntersectionObserver(function (es) { if (es.some(function (e) { return e.isIntersecting; })) { io.disconnect(); start(); } }, { rootMargin: "200px" });
      io.observe(root); io.observe(rh);   // the results too: a reader who follows a step link lands there
    } else start();

    // ---- demo states (screenshots): mid (F7's campus run), size, fail, tl, seeded
    LX.demo(root, function (s) {
      started = true;
      if (s === "mid") { B.set({ pv: 600, bat: 2000, gen: 2, fuel: 675, out: ["jan3", "eve1"] }); B.go(); return { view: "mid" }; }
      if (s === "size" || s === "done") { B.size(); return { view: s }; }
      if (s === "fail") { stub = "fail"; B.go(); return { view: "fail" }; }
      if (s === "tl") { stub = "tl"; B.go(); return { view: "tl" }; }
      if (s === "seeded") { B.go(); T.run(B.plan()); return { view: "seeded" }; }
      return null;
    });
  });
})();
