// c1-keep-the-campus-running.js — C1, "Keep the campus running: a microgrid for a three-day winter outage" (capstone,
// wave W3, 2026-11-03), built on the Microgrid Workbench's engine E1 (assets/learn/components/engine-e1.js, LX.E1).
//
// The capstone narrows the bench: the outage is the three-day winter storm (72 hours from 00:00 on 20 January 2025),
// the dorms start as must stay on (the brief: power to the hospital, its water and heating plant and the dorms), and
// every run also checks the same plan, held fixed, on the storm cut to one or two days or stretched to four (the
// sensitivity). Whatever priorities the reader sets, the page reports the brief's three critical loads (W3 review C1 2).
// A second run box sizes the cheapest plan for each of the three owners and runs each rounded plan, so the sizes and
// the cost shown belong together (C1 4). The note is LX.ReportNote; the self-check LX.Exemplars and LX.Rubric. The
// exemplars quote the engine's numbers for the plan that "Size it for me" gives from the defaults, checked by
// _tests/learn/test_c1-keep-the-campus-running.js. Nothing is saved or sent: the reader copies the note and the link.
(function () {
  "use strict";
  var DAYS = [1, 2, 4];
  // ---------------------------------------------------------------- pure (Node: the test reads these)
  function money(v) { var r = Math.round(v); return (r < 0 ? "−$" : "$") + Math.abs(r).toLocaleString("en-US"); }
  function kilo(v) { return Math.round(v).toLocaleString("en-US"); }
  // the brief's critical loads, fixed whatever priorities the reader sets (W3 review C1 2): the hospital, the water and
  // heating plant and the dorms, the first three of the engine's loads (the test checks the order)
  var CRIT = "the hospital, the water and heating plant and the dorms";
  function crit(o) { return o.perLoad[0] + o.perLoad[1] + o.perLoad[2]; }
  // the storm plus its length variants, for the run (the sizing uses the storm only)
  function scenarios(E1, P, task) { return task === "size" ? [P.scen.jan3] : [P.scen.jan3].concat(E1.lengths(P, "jan3", DAYS)); }
  // the sensitivity, from a run's outages: [{ days, crit, fuel }] in order of length
  function lengthsOf(R) {
    var main = R.outages[0], rest = R.outages.slice(1), all = [{ days: 3, crit: crit(main), fuel: main.fuel }].concat(rest.map(function (o) { return { days: o.sc.days, crit: crit(o), fuel: o.fuel }; }));
    return all.sort(function (a, b) { return a.days - b.days; });
  }
  function sensitivity(R) {
    var L = lengthsOf(R), base = L.filter(function (x) { return x.days === 3; })[0];
    return { metric: "Unserved critical load (hospital, water and heat, dorms)", input: "the storm's length", held: "the plan held fixed",
      base: { at: "3 days", value: kilo(base.crit) + " kWh" }, cases: L.filter(function (x) { return x.days !== 3; }).map(function (x) { return { at: x.days === 1 ? "1 day" : x.days + " days", value: kilo(x.crit) + " kWh" }; }) };
  }
  // what the owner comparison says, from its numbers (never more than they show); rows: [{ owner, plan (each owner's
  // sizing rounded up to the bench's steps), total (that rounded plan's annual cost, from its own run), crit }]
  function ownersWords(rows) {
    var same = rows.every(function (r) { return r.plan.pv === rows[0].plan.pv && r.plan.bat === rows[0].plan.bat && r.plan.gen === rows[0].plan.gen; });
    var lo = rows.reduce(function (a, b) { return a.total <= b.total ? a : b; }), hi = rows.reduce(function (a, b) { return a.total >= b.total ? a : b; });
    return (same ? "Each owner's cheapest plan has the same sizes here: between 4% and 6%, the cost of capital moves the cost, not the plan. " : "The cheapest plan differs by owner: cheaper capital buys more equipment that saves on the bill. ") +
      lo.owner.label + " costs least, " + money(lo.total) + " a year; " + hi.owner.label.toLowerCase() + " most, " + money(hi.total) + ".";
  }
  // the two exemplar notes (illustrative); the strong one is a complete short note, one field a line (W3 review C1 7, 9),
  // quoting the run of the plan "Size it for me" gives from the defaults (R) and that plan's cost for the other owners.
  // paidBy(key): the annual cost of this same plan (R.plan, R's bill) with owner key's cost of capital. The test checks
  // every number against the engine.
  function exemplars(R, paidBy, fuelPrice) {
    var L = lengthsOf(R), d4 = L.filter(function (x) { return x.days === 4; })[0], st = R.outages[0], p = R.plan, co = paidBy("coop"), ut = paidBy("utility");
    var upTo = L.filter(function (x) { return x.days <= 3; }), worst3 = Math.max.apply(null, upTo.map(function (x) { return x.crit; }));
    return { title: "Two notes on the same brief", task: "Recommend a microgrid that keeps power to the hospital, its water and heating plant and the dorms through the three-day winter storm.", id: "c1-ex", lines: true,
      answers: [
        { key: "weak", label: "Weak note", level: "Developing", parts: ["Build ", { text: "a big battery and lots of solar", note: "No sizes and no units: the board cannot price or check it." }, " so the hospital stays on. ",
          { text: "It will pay for itself", note: "No number, no boundary, no dollar year: pays against what, over what time?" }, ", and ", { text: "the campus will be resilient", note: "Resilient against which outage? Say the scenario and what the plan cannot survive." }, "."] },
        { key: "good", label: "Strong note", level: "Proficient", parts: [
          "Recommendation: build ", { text: kilo(p.pv) + " kW of solar, a " + kilo(p.bat) + " kWh battery and " + p.gen + " generator sets with " + kilo(p.fuel) + " gallons of diesel", note: "Sizes with units, and the fuel that limits the sets." },
          ". It keeps " + CRIT + " powered for all 72 hours of the storm (" + kilo(crit(st)) + " kWh short).\n",
          "Cost: ", { text: money(R.total) + " a year, community-owned, 2025 dollars: equipment, upkeep and the normal-year grid bill", note: "The cost with its boundary and dollar year (illustrative costs)." },
          ", " + money(R.saving) + " below the grid-only bill. ", { text: "The storm's " + kilo(st.fuel) + " gallons of diesel (" + money(Math.round(st.fuel * fuelPrice / 10) * 10) + ") are extra", note: "Storm fuel stated on its own: adding it to an annual cost would need an outage frequency." }, ".\n",
          "Sensitivity: ", { text: (worst3 < 0.5 ? "0 kWh short for a storm of 1 to 3 days, " : kilo(worst3) + " kWh short at most for 1 to 3 days, ") + "but " + kilo(d4.crit) + " kWh on a fourth day, the plan held fixed", note: "The sensitivity, with the plan held fixed: the plan's limit, said plainly." }, ".\n",
          "Emissions: ", { text: (st.co2 / 1000).toFixed(1) + " t of CO₂ from the storm's diesel; " + kilo(R.year.co2) + " t from a normal year's grid electricity (U.S. average, operating only)", note: "Emissions with their boundary: operating CO₂, average factor." }, ".\n",
          "Assumptions: ", { text: "a full battery and tank when the storm starts, the coming sun known, flat loads", note: "The assumptions that flatter the plan, named." }, ".\n",
          "Owner: community. ", { text: "A co-op would pay " + money(co) + " a year for the same plan, a utility " + money(ut) + "; community owners decide by their own rules and share the cost, worth " + money(R.total - co) + " a year more than a co-op here", note: "Who pays and who decides, and why this owner over a cheaper one: a reasoned choice, not the cheapest by default." }, ".\n",
          "Limits: ", { text: "one storm tested; a set that fails to start, part-load fuel use and fuel deliveries are left out", note: "What the analysis leaves out, so the board does not over-read it." }, "."] }],
      note: "Both notes are illustrative. The strong one quotes this page's numbers for the plan Size it for me gives from the defaults; another plan or owner is just as strong when its evidence and trade-offs support it." };
  }
  // the annual cost of plan R.plan paid by owner key: its equipment at that owner's rate plus the same bill
  function paidBy(E1, P, R) { return function (key) { return E1.costs({ own: key, fuel: R.plan.fuel }, P, R.plan).annual.equipment + R.year.bill; }; }
  var page = { DAYS: DAYS, CRIT: CRIT, crit: crit, paidBy: paidBy, scenarios: scenarios, lengthsOf: lengthsOf, sensitivity: sensitivity, ownersWords: ownersWords, exemplars: exemplars, money: money, kilo: kilo,
    RUBRIC: [{ id: "accounting", look: "The annual cost and the storm's unserved load and diesel CO₂, each with its boundary; who pays named." },
      { id: "uncertainty", look: "The sensitivity line: what a shorter or longer storm does to the plan held fixed." },
      { id: "realism", look: "What the plan leaves out: fuel deliveries, a set that fails to start, part-load fuel use." },
      { id: "communication", look: "In C1 the bar is the one-page note: plan link, evidence, sensitivity and limits. The course's Proficient words below describe a full paper, which C1 does not ask for." }],
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
        // the brief's three loads, whatever priorities the plan gives them (W3 review C1 2), above the engine's results
        // (E1.Results empties its own host, so it draws into a box of its own)
        host.innerHTML = "";
        var c0 = crit(R.outages[0]), lab = H("p", { class: "c1-crit " + (c0 > 0.5 ? "bad" : "good"), role: "note" }, host);
        lab.innerHTML = "<b>The brief's critical loads (" + LX.esc(CRIT) + "): " + kilo(c0) + " kWh unserved in the storm.</b> " +
          LX.esc(c0 > 0.5 ? "This plan does not meet the brief" + (st.ph !== "must" || st.pw !== "must" || st.pd !== "must" ? ", whatever priorities it sets." : ".") : "It meets the brief for this storm.");
        E1.Results(H("div", { class: "lx-sb-results c1-engine" }, host), main, { P: P, slug: "c1", sizeNote: sizeNote });
        drawSens(H("div", { class: "lx-xcard lx-sb-chart c1-sens" }, host), R);
        rn.refresh();
      },
      onChange: function (plan) { OW.changed(plan); rn.refresh(); } });

    // ---- the sensitivity: the plan held fixed, the storm one to four days long
    function drawSens(host, R) {
      H("h3", { text: "If the storm is shorter or longer (the plan held fixed)" }, host);
      // a round axis with room above the tallest bar's label: a step of 1, 2 or 5 times a power of ten, four or five steps
      var L = lengthsOf(R), mx = Math.max(1000, 1.15 * Math.max.apply(null, L.map(function (x) { return x.crit; }))), p10 = Math.pow(10, Math.floor(Math.log(mx / 4) / Math.LN10));
      var step = [1, 2, 5, 10].map(function (k) { return k * p10; }).filter(function (v) { return mx / v <= 5; })[0], top = Math.ceil(mx / step) * step;
      var pl = LX.Plot(host, { caption: true, text: "Text version of the chart", box: true });
      pl.render({ x: { min: 0.5, max: 4.5, ticks: L.map(function (x) { return [x.days, x.days === 1 ? "1 day" : x.days + " days"]; }) }, y: { min: 0, max: top, step: step, fmt: kilo, unit: "kWh" }, height: 200, heightN: 180,
        caption: "Unserved critical load (hospital, water and heat, dorms), kWh, from 00:00 on 20 January 2025",
        bars: L.map(function (x) { return { x0: x.days - 0.3, x1: x.days + 0.3, y0: 0, y1: Math.max(x.crit, top * 0.004), color: x.crit > 0.5 ? "var(--lx-bad)" : "var(--lx-good)" }; }),
        marks: L.map(function (x) { return { x: x.days, y: x.crit, label: kilo(x.crit), kind: "dot", pos: "above" }; }),
        aria: "Unserved critical load for storms of 1 to 4 days with the plan fixed: " + L.map(function (x) { return x.days + " days " + kilo(x.crit) + " kWh"; }).join(", ") + ".",
        text: { head: ["Storm length", "Unserved critical load", "Diesel burned"], rows: L.map(function (x) { return [x.days === 1 ? "1 day" : x.days + " days", kilo(x.crit) + " kWh", kilo(x.fuel) + " gal"]; }) } });
      H("p", { class: "lx-hint", text: "One storm, four lengths: a test of this plan's margin, not a forecast of how long storms last." }, host);
    }

    // ---- the three owners: the cheapest plan for each (a run box of its own) and this plan as each would pay for it
    var oc = H("div", { class: "lx-xcard c1-owners" }, rh);
    H("h3", { text: "Compare the three owners" }, oc);
    H("p", { class: "lx-hint", html: LX.rich("Each owner pays for the equipment at its own illustrative real [[cost-of-capital|cost of capital]]: utility 6%, co-op 4%, community 5%. The bill and the storm are the same.") }, oc);
    var oRow = H("div", null, oc), oStale = H("p", null, oc), oRes = H("div", null, oc), oStop = E1.ui.stopper();
    // each owner: size for the storm, then run that plan rounded up to the bench's steps (whole sets, their 30% minimum),
    // so the sizes and the annual cost in a row belong to the same plan (W3 review C1 4)
    var OW = LX.BenchRun(oRow, { label: "Size it for each owner", state: function () { return B.plan(); }, results: [oRes], stale: oStale, busy: oStop.busy,
      solve: function (st, ctx) {
        var out = [], k = 0;
        function next() {
          if (k >= P.cfg.owners.length) return Promise.resolve(out);
          var ow = P.cfg.owners[k++], s2 = E1.ui.copy(st); s2.own = ow.key;
          return E1.solve(s2, P, { task: "size", check: false, scenarios: [P.scen.jan3], signal: ctx.signal, attempt: ctx.attempt }).then(function (r) {
            if (!r.ok) { out.push({ owner: ow, r: r }); return out; }
            return E1.solve(r.results.plan, P, { task: "run", scenarios: [P.scen.jan3], signal: ctx.signal, attempt: ctx.attempt }).then(function (c) { out.push({ owner: ow, r: c.ok ? r : c, run: c }); return c.ok ? next() : out; });
          });
        }
        return next().then(function (list) {
          var bad = list.filter(function (x) { return !x.r.ok; })[0];
          if (bad) return { status: bad.r.status, ok: false, message: bad.r.message, hint: bad.r.hint };
          return { status: "optimal", ok: true, kind: "milp", results: list.map(function (x) { return { owner: x.owner, sized: x.r.results.sized, plan: x.run.results.plan, total: x.run.results.total, crit: crit(x.run.results.outages[0]) }; }),
            message: "Done: the three sizings and the runs of their rounded plans report optimal." };
        });
      },
      render: function (rows, st) { owners = { rows: rows, plan: st }; drawOwners(rows, st); rn.refresh(); } });
    oStop.attach(OW);
    function drawOwners(rows, st) {
      oRes.innerHTML = "";
      H("p", { class: "c1-ow-sum", html: "<b>" + LX.esc(ownersWords(rows)) + "</b>" }, oRes);
      var sx = H("div", { class: "lx-scroll-x" }, oRes), tb = H("table", { class: "lx-facts" }, sx), hr = H("tr", null, H("thead", null, tb));
      ["Owner", "Cost of capital", "Cheapest plan for the storm, rounded up", "Its annual cost", "Your plan, paid by this owner", "Who pays", "Who decides"].forEach(function (x) { H("th", { scope: "col", text: x }, hr); });
      var bd = H("tbody", null, tb);
      rows.forEach(function (x) {
        var tr = H("tr", null, bd), z = x.plan;
        H("th", { scope: "row", text: x.owner.label }, tr); H("td", { class: "n", text: Math.round(x.owner.rate * 100) + "%" }, tr);
        H("td", { text: kilo(z.pv) + " kW · " + kilo(z.bat) + " kWh · " + z.gen + " set" + (z.gen === 1 ? "" : "s") }, tr); H("td", { class: "n", text: money(x.total) }, tr);
        var mine = "–";
        if (lastR) { var s2 = E1.ui.copy(st); s2.own = x.owner.key; mine = money(E1.costs(s2, P, lastR.plan).annual.equipment + lastR.year.bill); }
        H("td", { class: "n", text: mine }, tr); H("td", { text: x.owner.pays }, tr); H("td", { text: x.owner.decides }, tr);
      });
      E1.ui.label(tb);
      H("p", { class: "lx-hint", text: "Each owner's sizing is rounded up to the bench's steps and run with whole sets; its annual cost is that rounded plan's. “Your plan” is the last one you ran, with its bill. Illustrative costs, 2025 dollars; outage diesel not included." }, oRes);
    }

    // ---- the note
    var nh = document.getElementById("c1-note"); nh.innerHTML = "";
    var rn = LX.ReportNote(H("div", { class: "lx-xcard" }, nh), { id: "c1-note", code: "C1", title: "Your one-page note", lede: "Write three parts in your own words; the plan, its numbers, the assumptions and the sensitivity come from your last run.",
      fields: page.FIELDS,
      checks: ["link", "run", "fields", "assumptions", "sensitivity", "page", { id: "owners", label: "The three owners compared (Compare the three owners, on this plan)", test: function () { return !!owners && LX.ShareState.same(S, owners.plan, B.plan()); } },
        { id: "brief", label: "The brief met: " + CRIT + " served through the storm", test: function () { var l = B.last(); return !!l && LX.ShareState.same(S, l.plan, B.plan()) && crit(l.R.outages[0]) < 0.5; } }],
      get: function () {
        var last = B.last(); if (!last) return null;
        var R = last.R, st = last.plan, main = R.outages[0];
        var n = E1.note(st, R, P);
        n.made = "the Microgrid Workbench's engine E1 (a small mixed-integer program), on capstone C1";
        n.link = B.ss.url();
        n.run = { ok: !!last.r.ok, stale: !LX.ShareState.same(S, st, B.plan()), text: "a normal year (12 average days) and the three-day winter storm, hour by hour" };
        n.results = [{ label: "Annual cost", value: money(R.total), note: E1.costNote }]
          .concat(R.comparable ? [{ label: "Against the grid-only bill", value: money(R.saving) + " a year less", note: "the bill with nothing built: " + money(R.base) }]
            : [{ label: "Unserved in a normal year on the grid", value: kilo(R.year.unserved) + " kWh", note: "the plan cannot carry the whole campus, so its cost is not comparable with the grid-only bill (" + money(R.base) + ")" }])
          .concat([{ label: "Unserved critical load in the storm", value: kilo(crit(main)) + " kWh", note: "hospital " + kilo(main.perLoad[0]) + ", water and heat " + kilo(main.perLoad[1]) + ", dorms " + kilo(main.perLoad[2]) + " kWh, whatever their priorities" },
          { label: "Diesel in the storm", value: kilo(main.fuel) + " gallons", note: E1.fuelMoney(main.fuelCost) + " at $" + R.fuelPrice.toFixed(2) + " a gallon, not in the annual cost; " + (main.co2 / 1000).toFixed(1) + " t of CO₂" },
          { label: "CO₂ from grid electricity in a normal year", value: kilo(R.year.co2) + " t", note: "U.S. average CO₂ per kWh, from operation only" }]);
        if (owners && LX.ShareState.same(S, owners.plan, st)) n.results.push({ label: "Annual cost of each owner's cheapest plan, rounded up", value: owners.rows.map(function (x) { return x.owner.label.replace("-owned", "") + " " + money(x.total); }).join(" · ") });
        n.sensitivity = sensitivity(R);
        return n;
      } });
    rn.refresh();

    // ---- the self-check: two notes and the rubric (the exemplars need the sized plan's numbers: computed on the page)
    var ex = document.getElementById("exemplars"), exFb = ex.querySelector(".lx-fallback");
    var exHost = H("div", { class: "lx-xcard c1-exhost" }, ex);
    var rbh = document.getElementById("c1-rubric"); rbh.innerHTML = "";
    LX.Rubric(H("div", { class: "lx-xcard" }, rbh), { id: "c1-rubric", code: "C1", title: "Rate your note against the rubric", competences: page.RUBRIC });
    function exemplarsLive(R) { if (exFb) exFb.hidden = true; exHost.innerHTML = ""; LX.Exemplars(exHost, exemplars(R, paidBy(E1, P, R), P.cfg.fuel.price)); }
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
        rn.set({ recommend: "Build the plan that Size it for me found for the storm: it keeps power to the hospital, the water plant and the dorms for all 72 hours and costs less a year than buying everything from the grid.",
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
