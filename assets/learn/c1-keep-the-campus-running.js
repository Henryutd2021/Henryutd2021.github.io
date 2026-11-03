// c1-keep-the-campus-running.js — C1, "Keep the campus running: a microgrid for a three-day winter outage" (capstone,
// wave W3, 2026-11-03), built on the Microgrid Workbench's engine E1 (assets/learn/components/engine-e1.js, LX.E1).
//
// The capstone narrows the bench: the outage is the three-day winter storm (72 hours from 00:00 on 20 January 2025),
// the dorms start as must stay on (the brief: the hospital and the dorms heated), and every run also checks the same plan,
// held fixed, on the storm cut to one or two days or stretched to four (the sensitivity). A second run box sizes the
// cheapest plan for each of the three owners. The note is LX.ReportNote; the self-check LX.Exemplars and LX.Rubric.
// The exemplars quote the engine's numbers for the plan that "Size it for me" gives from the defaults, checked by
// _tests/learn/test_c1-keep-the-campus-running.js. Nothing is saved or sent: the reader copies the note and the link.
(function () {
  "use strict";
  var DAYS = [1, 2, 4];
  // ---------------------------------------------------------------- pure (Node: the test reads these)
  function money(v) { var r = Math.round(v); return (r < 0 ? "−$" : "$") + Math.abs(r).toLocaleString("en-US"); }
  function kilo(v) { return Math.round(v).toLocaleString("en-US"); }
  // the storm plus its length variants, for the run (the sizing uses the storm only)
  function scenarios(E1, P, task) { return task === "size" ? [P.scen.jan3] : [P.scen.jan3].concat(E1.lengths(P, "jan3", DAYS)); }
  // the sensitivity, from a run's outages: [{ days, must }] in order of length
  function lengthsOf(R) {
    var main = R.outages[0], rest = R.outages.slice(1), all = [{ days: 3, must: main.must, fuel: main.fuel }].concat(rest.map(function (o) { return { days: o.sc.days, must: o.must, fuel: o.fuel }; }));
    return all.sort(function (a, b) { return a.days - b.days; });
  }
  function sensitivity(R) {
    var L = lengthsOf(R), base = L.filter(function (x) { return x.days === 3; })[0];
    return { metric: "Unserved must-stay-on load", input: "the storm's length", held: "the plan held fixed",
      base: { at: "3 days", value: kilo(base.must) + " kWh" }, cases: L.filter(function (x) { return x.days !== 3; }).map(function (x) { return { at: x.days === 1 ? "1 day" : x.days + " days", value: kilo(x.must) + " kWh" }; }) };
  }
  // what the owner comparison says, from its numbers (never more than they show)
  function ownersWords(rows) {
    var same = rows.every(function (r) { return r.sized.rounded.pv === rows[0].sized.rounded.pv && r.sized.rounded.bat === rows[0].sized.rounded.bat && r.sized.rounded.gen === rows[0].sized.rounded.gen; });
    var lo = rows.reduce(function (a, b) { return a.sized.total <= b.sized.total ? a : b; }), hi = rows.reduce(function (a, b) { return a.sized.total >= b.sized.total ? a : b; });
    return (same ? "Each owner's cheapest plan has the same sizes here: between 4% and 6%, the cost of capital moves the cost, not the plan. " : "The cheapest plan differs by owner: cheaper capital buys more equipment that saves on the bill. ") +
      lo.owner.label + " costs least, " + money(lo.sized.total) + " a year; " + hi.owner.label.toLowerCase() + " most, " + money(hi.sized.total) + ".";
  }
  // the two exemplar notes (illustrative); the strong one quotes the run of the plan "Size it for me" gives from the
  // defaults (R) and that plan's cost for the other owners; the test checks every number against the engine
  // paidBy(key): the annual cost of this same plan (R.plan, R's bill) with owner key's cost of capital
  function exemplars(R, paidBy) {
    var L = lengthsOf(R), d4 = L.filter(function (x) { return x.days === 4; })[0], st = R.outages[0], p = R.plan;
    return { title: "Two notes on the same brief", task: "Recommend a microgrid that keeps the hospital and the dorms heated through the three-day winter storm.", id: "c1-ex",
      answers: [
        { key: "weak", label: "Weak note", level: "Developing", parts: ["Build ", { text: "a big battery and lots of solar", note: "No sizes and no units: the board cannot price or check it." }, " so the hospital stays on. ",
          { text: "It will pay for itself", note: "No number, no boundary, no dollar year: pays against what, over what time?" }, ", and ", { text: "the campus will be resilient", note: "Resilient against which outage? Say the scenario and what the plan cannot survive." }, "."] },
        { key: "good", label: "Strong note", level: "Proficient", parts: ["Build ", { text: kilo(p.pv) + " kW of solar, a " + kilo(p.bat) + " kWh battery and " + p.gen + " generator sets with " + kilo(p.fuel) + " gallons of diesel", note: "Sizes with units, and the fuel that limits the sets." },
          ": community-owned, " + money(R.total) + " a year in 2025 dollars, ", { text: money(R.saving) + " below the grid-only bill", note: "A comparison of two stated cases, on one cost boundary (illustrative costs)." },
          ". The hospital, water plant and dorms lose " + kilo(st.must) + " kWh in the 72-hour storm, ", { text: "but " + kilo(d4.must) + " kWh if it lasts a fourth day", note: "The sensitivity, with the plan held fixed: the plan's limit, said plainly." },
          ". The storm burns " + kilo(st.fuel) + " gallons (" + (st.co2 / 1000).toFixed(1) + " t of CO₂); ", { text: "a normal year's grid electricity emits " + kilo(R.year.co2) + " t (average factor)", note: "Emissions with their boundary: operating CO₂, average factor." },
          ". ", { text: "A co-op would pay " + money(paidBy("coop")) + " a year for the same plan, a utility " + money(paidBy("utility")), note: "The owners compared on one plan, with who pays in the table." }, "."] }],
      note: "Both notes are illustrative; the strong one quotes this page's own numbers for the plan Size it for me gives from the defaults." };
  }
  // the annual cost of plan R.plan paid by owner key: its equipment at that owner's rate plus the same bill
  function paidBy(E1, P, R) { return function (key) { return E1.costs({ own: key, fuel: R.plan.fuel }, P, R.plan).annual.equipment + R.year.bill; }; }
  var page = { DAYS: DAYS, paidBy: paidBy, scenarios: scenarios, lengthsOf: lengthsOf, sensitivity: sensitivity, ownersWords: ownersWords, exemplars: exemplars, money: money, kilo: kilo,
    RUBRIC: [{ id: "accounting", look: "The annual cost and the storm's unserved load and diesel CO₂, each with its boundary; who pays named." },
      { id: "uncertainty", look: "The sensitivity line: what a shorter or longer storm does to the plan held fixed." },
      { id: "realism", look: "What the plan leaves out: fuel deliveries, a set that fails to start, part-load fuel use." },
      { id: "communication", look: "A recommendation the board could act on, with its limits, on one page." }],
    FIELDS: [{ key: "recommend", label: "Recommendation", hint: "Two or three sentences: what to build, what stays on, and why.", rows: 3, need: true, at: "top", min: 12 },
      { key: "owner", label: "Owner, and who pays", hint: "One or two sentences: which owner, who pays, who decides.", rows: 2, need: true, min: 8 },
      { key: "cannot", label: "What the plan cannot do", hint: "One or two sentences: what could still leave the hospital short.", rows: 2, need: true, min: 8 }] };
  if (typeof module !== "undefined" && module.exports) module.exports = page;
  if (typeof window === "undefined" || !window.LX || !window.LX.E1) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H, E1 = LX.E1;
  var S = E1.makeSchema({ key: "c1", title: "C1 plan", defaults: { pd: "must", out: ["jan3"] } });
  LX.mount("c1", function (live, data, root) {
    var P = E1.prepare(data.e1_prairie_campus), stub = null, owners = null, lastR = null;
    var rh = document.getElementById("c1-results"), fb = rh.querySelector(".lx-fallback"); if (fb) fb.hidden = true;
    var resBox = H("div", { class: "c1-res" }, rh);
    function stubSolver() { if (!stub) return null; stub = null; return function () { return Promise.resolve({ status: "error", ok: false, message: "solver stopped (demo)" }); }; }
    var B = E1.Bench(live, { P: P, schema: S, slug: "c1", resultsHost: resBox, hide: { out: true }, solver: stubSolver, runLabel: "Run the storm", main: 1,
      scenarios: function (st, task) { return scenarios(E1, P, task); },
      draw: function (host, R, st, r, sizeNote) {
        lastR = R;
        var main = {}; for (var k in R) main[k] = R[k];
        main.outages = [R.outages[0]];
        E1.Results(host, main, { P: P, slug: "c1", sizeNote: sizeNote });
        drawSens(H("div", { class: "lx-xcard lx-sb-chart c1-sens" }, host), R);
        rn.refresh();
      },
      onChange: function (plan) { OW.changed(plan); rn.refresh(); } });

    // ---- the sensitivity: the plan held fixed, the storm one to four days long
    function drawSens(host, R) {
      H("h3", { text: "If the storm is shorter or longer (the plan held fixed)" }, host);
      // a round axis with room above the tallest bar's label: a step of 1, 2 or 5 times a power of ten, four or five steps
      var L = lengthsOf(R), mx = Math.max(1000, 1.15 * Math.max.apply(null, L.map(function (x) { return x.must; }))), p10 = Math.pow(10, Math.floor(Math.log(mx / 4) / Math.LN10));
      var step = [1, 2, 5, 10].map(function (k) { return k * p10; }).filter(function (v) { return mx / v <= 5; })[0], top = Math.ceil(mx / step) * step;
      var pl = LX.Plot(host, { caption: true, text: "Text version of the chart", box: true });
      pl.render({ x: { min: 0.5, max: 4.5, ticks: L.map(function (x) { return [x.days, x.days === 1 ? "1 day" : x.days + " days"]; }) }, y: { min: 0, max: top, step: step, fmt: kilo, unit: "kWh" }, height: 200, heightN: 180,
        caption: "Unserved must-stay-on load, kWh, from 00:00 on 20 January 2025",
        bars: L.map(function (x) { return { x0: x.days - 0.3, x1: x.days + 0.3, y0: 0, y1: Math.max(x.must, top * 0.004), color: x.must > 0.5 ? "var(--lx-bad)" : "var(--lx-good)" }; }),
        marks: L.map(function (x) { return { x: x.days, y: x.must, label: kilo(x.must), kind: "dot", pos: "above" }; }),
        aria: "Unserved must-stay-on load for storms of 1 to 4 days with the plan fixed: " + L.map(function (x) { return x.days + " days " + kilo(x.must) + " kWh"; }).join(", ") + ".",
        text: { head: ["Storm length", "Unserved must-stay-on load", "Diesel burned"], rows: L.map(function (x) { return [x.days === 1 ? "1 day" : x.days + " days", kilo(x.must) + " kWh", kilo(x.fuel) + " gal"]; }) } });
      H("p", { class: "lx-hint", text: "One storm, four lengths: a test of this plan's margin, not a forecast of how long storms last." }, host);
    }

    // ---- the three owners: the cheapest plan for each (a run box of its own) and this plan as each would pay for it
    var oc = H("div", { class: "lx-xcard c1-owners" }, rh);
    H("h3", { text: "Compare the three owners" }, oc);
    H("p", { class: "lx-hint", text: "Each owner pays for the equipment at its own illustrative real cost of capital: utility 6%, co-op 4%, community 5%. The bill and the storm are the same." }, oc);
    var oRow = H("div", null, oc), oStale = H("p", null, oc), oRes = H("div", null, oc);
    var OW = LX.BenchRun(oRow, { label: "Size it for each owner", state: function () { return B.plan(); }, results: [oRes], stale: oStale,
      solve: function (st, ctx) {
        var out = [], k = 0;
        function next() {
          if (k >= P.cfg.owners.length) return Promise.resolve(out);
          var ow = P.cfg.owners[k++], s2 = E1.ui.copy(st); s2.own = ow.key;
          return E1.solve(s2, P, { task: "size", check: false, scenarios: [P.scen.jan3], signal: ctx.signal, attempt: ctx.attempt }).then(function (r) { out.push({ owner: ow, r: r }); return r.ok ? next() : out; });
        }
        return next().then(function (list) {
          var bad = list.filter(function (x) { return !x.r.ok; })[0];
          if (bad) return { status: bad.r.status, ok: false, message: bad.r.message, hint: bad.r.hint };
          return { status: "optimal", ok: true, kind: "milp", results: list.map(function (x) { return { owner: x.owner, sized: x.r.results.sized }; }), message: "Done: the three sizings report optimal." };
        });
      },
      render: function (rows, st) { owners = { rows: rows, plan: st }; drawOwners(rows, st); rn.refresh(); } });
    function drawOwners(rows, st) {
      oRes.innerHTML = "";
      H("p", { class: "c1-ow-sum", html: "<b>" + LX.esc(ownersWords(rows)) + "</b>" }, oRes);
      var sx = H("div", { class: "lx-scroll-x" }, oRes), tb = H("table", { class: "lx-facts" }, sx), hr = H("tr", null, H("thead", null, tb));
      ["Owner", "Cost of capital", "Cheapest plan for the storm", "Its annual cost", "Your plan, paid by this owner", "Who pays", "Who decides"].forEach(function (x) { H("th", { scope: "col", text: x }, hr); });
      var bd = H("tbody", null, tb), base = lastR && E1.ui.copy(lastR.plan);
      rows.forEach(function (x) {
        var tr = H("tr", null, bd), z = x.sized.rounded;
        H("th", { scope: "row", text: x.owner.label }, tr); H("td", { class: "n", text: Math.round(x.owner.rate * 100) + "%" }, tr);
        H("td", { text: kilo(z.pv) + " kW · " + kilo(z.bat) + " kWh · " + z.gen + " sets" }, tr); H("td", { class: "n", text: money(x.sized.total) }, tr);
        var mine = "–";
        if (lastR) { var s2 = E1.ui.copy(st); s2.own = x.owner.key; mine = money(E1.costs(s2, P, lastR.plan).annual.equipment + lastR.year.bill); }
        H("td", { class: "n", text: mine }, tr); H("td", { text: x.owner.pays }, tr); H("td", { text: x.owner.decides }, tr);
      });
      E1.ui.label(tb);
      H("p", { class: "lx-hint", text: "The cheapest plans are sized for the storm (rounded up to the bench's steps); “your plan” is the last one you ran, with its bill. Illustrative costs, 2025 dollars." }, oRes);
    }

    // ---- the note
    var nh = document.getElementById("c1-note"); nh.innerHTML = "";
    var rn = LX.ReportNote(H("div", { class: "lx-xcard" }, nh), { id: "c1-note", code: "C1", title: "Your one-page note", lede: "Write three parts in your own words; the plan, its numbers, the assumptions and the sensitivity come from your last run.",
      fields: page.FIELDS,
      checks: ["link", "run", "fields", "assumptions", "sensitivity", "page", { id: "owners", label: "The three owners compared (Compare the three owners, on this plan)", test: function () { return !!owners && LX.ShareState.same(S, owners.plan, B.plan()); } }],
      get: function () {
        var last = B.last(); if (!last) return null;
        var R = last.R, st = last.plan, main = R.outages[0];
        var n = E1.note(st, R, P);
        n.made = "the Microgrid Workbench's engine E1 (a small mixed-integer program), on capstone C1";
        n.link = B.ss.url();
        n.run = { ok: !!last.r.ok, stale: !LX.ShareState.same(S, st, B.plan()), text: "a normal year (12 average days) and the three-day winter storm, hour by hour" };
        n.results = [{ label: "Annual cost", value: money(R.total), note: "2025 dollars, illustrative; equipment paid over its life plus the grid bill" },
          { label: "Against the grid-only bill", value: money(R.saving) + " a year less", note: "the bill with nothing built: " + money(R.base) },
          { label: "Unserved must-stay-on load in the storm", value: kilo(main.must) + " kWh", note: "hospital " + kilo(main.perLoad[0]) + ", water and heat " + kilo(main.perLoad[1]) + ", dorms " + kilo(main.perLoad[2]) + " kWh" },
          { label: "Diesel in the storm", value: kilo(main.fuel) + " gallons", note: (main.co2 / 1000).toFixed(1) + " t of CO₂" },
          { label: "CO₂ from grid electricity in a normal year", value: kilo(R.year.co2) + " t", note: "average factor, operating only" }];
        if (owners && LX.ShareState.same(S, owners.plan, st)) n.results.push({ label: "Annual cost of each owner's cheapest plan", value: owners.rows.map(function (x) { return x.owner.label.replace("-owned", "") + " " + money(x.sized.total); }).join(" · ") });
        n.sensitivity = sensitivity(R);
        return n;
      } });
    rn.refresh();

    // ---- the self-check: two notes and the rubric (the exemplars need the sized plan's numbers: computed on the page)
    var ex = document.getElementById("exemplars"), exFb = ex.querySelector(".lx-fallback");
    var exHost = H("div", { class: "lx-xcard c1-exhost" }, ex);
    var rbh = document.getElementById("c1-rubric"); rbh.innerHTML = "";
    LX.Rubric(H("div", { class: "lx-xcard" }, rbh), { id: "c1-rubric", code: "C1", title: "Rate your note against the rubric", competences: page.RUBRIC });
    function exemplarsLive(R) { if (exFb) exFb.hidden = true; exHost.innerHTML = ""; LX.Exemplars(exHost, exemplars(R, paidBy(E1, P, R))); }
    // the strong exemplar's numbers: the defaults sized and run once, quietly, when the self-check comes into view
    var exDone = false;
    function exRun() {
      if (exDone) return; exDone = true;
      var d = LX.ShareState.defaults(S);
      E1.solve(d, P, { task: "size", check: false, scenarios: [P.scen.jan3] }).then(function (s) {
        if (!s.ok) throw new Error(s.status);
        return E1.solve(s.results.plan, P, { scenarios: scenarios(E1, P, "run") }).then(function (r) {
          if (!r.ok) throw new Error(r.status);
          exemplarsLive(r.results);
        });
      }).then(null, function () { exDone = false; });   // the no-JS version stays; a later visit retries
    }
    if (typeof IntersectionObserver !== "undefined") {
      var io2 = new IntersectionObserver(function (es) { if (es.some(function (e) { return e.isIntersecting; })) { io2.disconnect(); exRun(); } }, { rootMargin: "300px" });
      io2.observe(ex);
    } else exRun();

    // ---- the first run when the plan is in view
    var started = false;
    function start() { if (started) return; started = true; B.go(); }
    if (typeof IntersectionObserver !== "undefined") {
      var io = new IntersectionObserver(function (es) { if (es.some(function (e) { return e.isIntersecting; })) { io.disconnect(); start(); } }, { rootMargin: "200px" });
      io.observe(root); io.observe(rh);   // the results too: a reader who follows a step link lands there
    } else start();

    LX.demo(root, function (s) {
      started = true;
      if (s === "mid") { B.go(); return { view: "mid" }; }
      if (s === "done" || s === "size") {
        B.size(); setTimeout(function waitRun() { if (B.run.running()) { setTimeout(waitRun, 200); return; } OW.run(B.plan()); }, 400);
        rn.set({ recommend: "Build the plan that Size it for me found for the storm: it keeps the hospital, the water plant and the dorms on for all 72 hours and costs less a year than buying everything from the grid.",
          owner: "A co-op should own it: its members pay through their bills, and its cheaper capital gives the lowest annual cost.",
          cannot: "It has no margin for a fourth day of storm, a set that fails to start, or fuel that runs low faster than planned." });
        exRun();
        return { view: s };
      }
      if (s === "fail") { stub = "fail"; B.go(); return { view: "fail" }; }
      return null;
    });
  });
})();
