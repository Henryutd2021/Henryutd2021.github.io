// sb2-grid-room.js — SB2, "Grid Room" (sandbox, wave W4, 2026-11-05), on engine E2 (assets/learn/components/engine-e2.js,
// LX.E2, in the bundle; data assets/learn/data/e2-plains-grid.json with SPP's 2025 shapes from town_year.json).
//
// The page: the brief (static), the bench (the period, a large load, the two links' limits, the reserve and the gas price;
// Run the period; readouts; the plan link), the results (what the run says, the zone map hour by hour, prices conditional
// on the commitment, flows, the commitment of each day, the money), then how the engine works (commit, fix, price;
// LX.Boundary) and the sources. Every number the page states comes from E2 and is checked by
// _tests/learn/test_sb2-grid-room.js (with the engine's own test, test_e2-engine.js).
(function () {
  "use strict";
  // ---------------------------------------------------------------- pure words (Node: the test reads them)
  function kilo(v) { var r = Math.round(v); return (r < 0 ? "−" : "") + Math.abs(r).toLocaleString("en-US"); }
  function price(v) { var r = Math.round(v); return (r < 0 ? "−$" : "$") + Math.abs(r).toLocaleString("en-US"); }
  function moneyK(v) { var r = Math.round(v / 1000) * 1000; return (r < 0 ? "−$" : "$") + Math.abs(r).toLocaleString("en-US"); }
  // the largest gap between the three zones' prices in any hour of the run, $/MWh
  function spread(R) {
    var m = 0;
    R.days.forEach(function (d) { d.hours.forEach(function (h) { var p = h.z.map(function (x) { return x.price; }); m = Math.max(m, Math.max.apply(null, p) - Math.min.apply(null, p)); }); });
    return m;
  }
  // what a run says, one idea a line; R: E2.summarize's results, P: the prepared data. Never more than the run shows.
  // A link set to 0 MW is open: nothing flows, so it never "reaches its limit", and the zones on its two sides are priced
  // on their own (SB2 review finding 1); the equal-price line is said only when the prices are within a cent every hour.
  function says(R, P) {
    var T = R.tot, out = [], zn = function (i) { return P.zones[i].name; };
    var shortZ = T.shedZ.map(function (v, i) { return { i: i, v: v }; }).filter(function (x) { return x.v > 0.5; });
    if (shortZ.length) out.push({ kind: "bad", text: "**" + kilo(T.shed) + " MWh unserved** in " + shortZ.map(function (x) { return zn(x.i) + " (" + kilo(x.v) + " MWh)"; }).join(" and ") + ": in those hours the zone's price is the $" + kilo(P.cfg.voll) + "/MWh penalty for unserved load." });
    else out.push({ kind: "good", text: "**Every MWh served** in all " + R.hours + " hours." });
    if (T.rshort > 0.5) out.push({ kind: "bad", text: "**Reserve short by " + kilo(T.rshort) + " MWh** over " + kilo(R.rshortHours) + " hours: each MWh short costs the model $" + kilo(P.cfg.reserveShort) + ", and the reserve price shows it." });
    var open = 0;
    P.links.forEach(function (l) {
      var n = T.cong[l.id], a = P.zix[l.from], b = P.zix[l.to], cap = R.sys.caps[l.id], split = 0;
      R.days.forEach(function (d) { d.hours.forEach(function (h) { if ((cap === 0 || Math.abs(h.f[l.id]) >= cap - 1e-6) && Math.abs(h.z[a].price - h.z[b].price) >= 0.5) split++; }); });
      if (cap === 0) { open++; out.push({ kind: "", text: "**" + l.name + " is open (set to 0 MW):** nothing flows on it, so " + zn(a) + " and " + zn(b) + " are each priced on their own; their prices differ by $1/MWh or more in " + kilo(split) + " of " + R.hours + " hours." }); }
      else if (n > 0) out.push({ kind: "", text: "**" + l.name + " at its limit for " + kilo(n) + " of " + R.hours + " hours;** in " + (split === n ? (n === 1 ? "that hour" : "all of them") : kilo(split) + " of them") + " the prices on its two sides differ by $1/MWh or more ([[congestion|congestion]])." });
    });
    if (!open && P.links.every(function (l) { return T.cong[l.id] === 0; })) {
      var sp = spread(R);
      out.push({ kind: "", text: sp < 0.01 ? "**No link reaches its limit,** so the three zones' prices stay within a cent of each other every hour." : "**No link reaches its limit,** yet the zones' prices differ by up to " + price(sp) + "/MWh in some hour." });
    }
    out.push({ kind: "", text: "**" + moneyK(T.upliftAll) + " of [[uplift|uplift]]:** what committed units' running, [[no-load-cost|no-load]] and start-up costs exceed their revenue at these prices, paid on top (make-whole)." });
    return out;
  }
  // the money card's notes, one idea a line (the large load's line follows the shortfall rule: a zone's unserved load is
  // shared in proportion to each customer's load that hour, the large load's after its own curtailment)
  function notes(R, P) {
    var T = R.tot, out = ["Production cost " + moneyK(T.prod) + ": running " + moneyK(T.running) + ", no-load " + moneyK(T.noload) + ", start-up " + moneyK(T.startup) + " (2025 dollars; penalties not included).",
      "CO₂ " + kilo(T.co2) + " t, from the fuel burned (EIA's coefficients; operating only). Wind and sun spilled: " + kilo(T.spill) + " MWh.",
      "Congestion rent " + moneyK(T.rent) + ": what loads pay minus what plants earn when a link is at its limit."];
    if (R.sys.ll > 0) out.push("The large load: " + kilo(T.llMWh) + " MWh served at " + price(R.llAvg) + "/MWh on average (" + moneyK(T.llPay) + ")" +
      (T.curtail > 0.5 ? "; it curtailed " + kilo(T.curtail) + " MWh at its $" + kilo(R.sys.bid) + "/MWh bid" : "") +
      (T.llShed > 0.5 ? "; " + kilo(T.llShed) + " MWh of it unserved, its share of " + P.zones[P.zix[R.sys.llz]].name + "'s shortfall in proportion to load" : "") + ".");
    return out;
  }
  // the readouts beside the controls: [label, value, tone]
  function readouts(R, P) {
    var T = R.tot, ti = P.zix.T;
    return [["Production cost", moneyK(T.prod), ""], ["Average price, Prairie Town", price(R.avgPrice[ti]) + "/MWh", ""],
      ["Unserved", kilo(T.shed) + " MWh", T.shed > 0.5 ? "bad" : "good"], ["Town–Metro at its limit", R.sys.caps.TM === 0 ? "open (0 MW)" : kilo(T.cong.TM) + " h", ""]];
  }
  var page = { says: says, notes: notes, spread: spread, readouts: readouts, kilo: kilo, price: price, moneyK: moneyK,
    TABLE_HINT: "**Table coverage:** only units with an on/off decision. [[peaker|Peakers]] start within minutes and have no minimum output, so the model gives them none.",
    START_HINT: "**Starting conditions:** the first day assumes any units on at 00:00 were already running, so their earlier start-up costs are left out. Later days carry the state of 23:00 forward.",
    GROUPS: [{ title: "The period", fields: ["per"], hint: "Real 2025 days of the Southwest Power Pool grid, scaled to the three zones." },
      { title: "A large load (a data center)", fields: ["ll", "llz", "flex", "bid"], color: "var(--lx-demand)", hint: "A load only, flat every hour. Its flexible share can [[demand-response|curtail]] (cut its own use) when serving it would cost more than its bid; a partial cut can set the price equal to the bid." },
      { title: "The links", fields: ["wt", "tm"], color: "var(--lx-tier-4)", hint: "Each link carries at most its limit, either way." },
      { title: "Reserves and fuel", fields: ["res", "gas"], color: "var(--lx-cc)", hint: "[[reserves|Operating reserve]]: spare capacity held every hour. Gas is priced per [[mmbtu|MMBtu]] (a million British thermal units of heat) and sets most plants' running costs." }] };
  if (typeof module !== "undefined" && module.exports) module.exports = page;
  if (typeof window === "undefined" || !window.LX || !window.LX.E2) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H, E2 = LX.E2, U = E2.ui;
  LX.mount("sb2", function (live, data, root) {
    var P = E2.prepare(data.e2_plains_grid, { y2025: data.town_year, targets: data.cf_targets }, LX.townProfile), S = E2.schema, stub = null;
    var rh = document.getElementById("sb2-results"), fb = rh.querySelector(".lx-fallback"); if (fb) fb.hidden = true;
    var wrap = H("div", { class: "lx-sb e2-sb" }, live);
    var ctr = H("div", { class: "lx-sb-controls" }, wrap), side = H("div", { class: "lx-sb-side" }, wrap);
    var plan;
    var ss = LX.ShareState(side, { schema: S, id: "sb2-link", onLoad: function (s) { plan = s; C.set(plan); run.changed(plan); } });
    plan = ss.state;
    var C = U.controls(ctr, S, plan, page.GROUPS, change);
    var pre = H("div", { class: "lx-sb-presets", role: "group", "aria-label": "Start from a preset (only the choices it names change)" }, side);
    E2.presets.forEach(function (pr) {
      H("button", { class: "lx-btn ghost small", type: "button", text: pr.label, title: pr.note, onclick: function () { var p = U.copy(plan); for (var k in pr.state) p[k] = pr.state[k]; change(p); } }, pre);
    });
    var stale = H("p", null, rh), res = H("div", { class: "lx-sb-results sb2-res" }, rh), ro = H("div", { class: "lx-readouts e2-ro" }), stopB = U.stopper();
    // a demo state can stub the next solve: "fail" (the solver errors) or "tl" (each MILP stopped at its time limit with a plan)
    function solver() {
      if (!stub) return null;
      var kind = stub; stub = null;
      return function (m, o) {
        if (kind === "fail") return Promise.resolve({ status: "error", ok: false, message: "solver stopped (demo)" });
        return LX.solver.solve(m, o).then(function (r) { if (r.values && m.variables.some(function (v) { return v.type === "integer"; })) { r.status = "time-limit"; r.ok = false; r.mipGap = 0.0123; } return r; });
      };
    }
    var prog = H("p", { class: "lx-hint sb2-prog", "aria-live": "polite" });
    var run = LX.BenchRun(side, { label: "Run the period", state: function () { return plan; }, partial: true, results: [res, ro], stale: stale,
      busy: function (on) { stopB.busy(on); if (!on) prog.textContent = ""; },
      solve: function (st, ctx) { return E2.solve(st, P, { signal: ctx.signal, attempt: ctx.attempt, solver: solver(), onDay: function (k, n) { if (n > 1) prog.textContent = "Day " + k + " of " + n + "…"; } }); },
      render: function (R) { draw(R); } });
    stopB.attach(run);
    run.button.parentNode.appendChild(prog);
    side.appendChild(ro);
    side.insertBefore(ss.status, pre);
    side.appendChild(ss.el);
    function change(p) { plan = p; C.set(plan); ss.set(plan); run.changed(plan); }

    // ---- the results
    var map = null;
    function draw(R) {
      ro.innerHTML = "";
      page.readouts(R, P).forEach(function (x) { var d = H("div", { class: "lx-readout " + x[2] }, ro); H("span", { text: x[0] }, d); H("b", { text: x[1] }, d); });
      res.innerHTML = "";
      var sayBox = H("div", { class: "sb2-says" }, res);
      page.says(R, P).forEach(function (s) { H("p", { class: "e2-say " + s.kind, html: LX.rich(s.text).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>") }, sayBox); });
      var mc = H("div", { class: "lx-xcard sb2-mapcard" }, res);
      map = U.ZoneMap(mc, P);
      // start on the hour with Town's highest price (the first such hour), so the map opens where something happens
      var best = 0, bp = -Infinity, k = 0;
      R.days.forEach(function (d) { d.hours.forEach(function (h) { if (h.z[P.zix.T].price > bp + 1e-9) { bp = h.z[P.zix.T].price; best = k; } k++; }); });
      map.set(R, best);
      var g = H("div", { class: "lx-sb-charts two" }, res);
      var c1 = H("div", { class: "lx-xcard lx-sb-chart" }, g); H("h3", { text: "Prices, conditional on the commitment" }, c1);
      U.priceChart(c1, P, R);
      H("p", { class: "lx-hint", html: LX.rich("Each price is the [[shadow-price|shadow price]] of a zone's balance in the dispatch linear program, with every unit's on/off decision fixed at the mixed-integer program's choice. Another commitment would give other prices.") }, c1);
      var c2 = H("div", { class: "lx-xcard lx-sb-chart" }, g); H("h3", { text: "Flows on the two links" }, c2);
      U.flowChart(c2, P, R);
      var c3 = H("div", { class: "lx-xcard lx-sb-chart" }, res); H("h3", { text: "The commitment: units on, hour by hour" }, c3);
      var dayHost = H("div", null, c3), tHost = H("div", null, c3);
      function showDay(i) { tHost.innerHTML = ""; U.commitTable(tHost, P, R, i); }
      if (R.days.length > 1) {
        var names = {}, vals = R.days.map(function (d, i) { names[i] = E2.dayLabel(d.day); return i; });
        var row = H("div", { class: "e2-segrow" }, dayHost); H("span", { class: "e2-segl", text: "Day" }, row);
        U.seg(row, "Day shown", vals, names, 0, showDay);
      }
      showDay(0);
      [page.TABLE_HINT, page.START_HINT].forEach(function (t) { H("p", { class: "lx-hint", html: LX.rich(t).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>") }, c3); });
      var c4 = H("div", { class: "lx-xcard lx-sb-chart" }, res); H("h3", { text: "Energy, starts and uplift" }, c4);
      U.moneyTable(c4, P, R);
      var ul = H("ul", { class: "e2-notes" }, c4); page.notes(R, P).forEach(function (t) { H("li", { text: t }, ul); });
    }

    // ---- how the engine works
    var x = document.getElementById("sb2-explain"); x.innerHTML = "";
    var flow = H("div", { class: "lx-xcard" }, x);
    H("h3", { text: "Two models a day, in this order" }, flow);
    var fl = H("ol", { class: "sb2-flow" }, flow);
    [["Commit", "A [[mixed-integer-program|mixed-integer program]] chooses how many units of each group are on in each hour: whole numbers, with minimum outputs, start-up costs and minimum run times. It shows no prices."],
      ["Fix", "Every on/off decision is fixed at that choice; the units off are left out."],
      ["Price", "The dispatch [[linear-program|linear program]] runs the same day again. Each zone's balance has a [[shadow-price|shadow price]]: the zone's price, conditional on the commitment."],
      ["Settle", "A unit whose day's revenue at those prices misses its running, no-load and start-up costs is paid the difference: [[uplift|uplift]]."]]
      .forEach(function (s, i) { var li = H("li", null, fl); li.innerHTML = "<b>" + (i + 1) + ". " + s[0] + "</b> " + LX.rich(s[1]); });
    LX.Boundary(H("div", { class: "lx-xcard" }, x), { title: "Where the engine's answer holds",
      holds: ["the three zones share 2025's weather and the loads follow SPP's 2025 shapes, scaled", "each link carries any flow up to its limit (a [[transport-model|transport model]])", "each day is committed alone, knowing its own load, wind and sun exactly", "the first day starts with any units already on, their earlier start-ups not counted", "units never fail and fuel is always there"],
      leaves: ["power-flow physics, losses and voltage (M1 and A17)", "ramp limits, and the next day when a day is committed", "forecast errors and outages: adequacy needs another tool (A5; C2's check)", "whether the reserve could reach a zone after a failure: it is one region-wide total", "prices from the mixed-integer program itself"],
      source: "The Plains Grid is fictional; plant data illustrative; fuel prices EIA 2025; 2025 dollars." });

    // ---- the first run, once the bench is in view (the solver loads then: about 3.5 MB, once)
    var started = false;
    function start() { if (started) return; started = true; run.run(plan); }
    if (typeof IntersectionObserver !== "undefined") {
      var io = new IntersectionObserver(function (es) { if (es.some(function (e) { return e.isIntersecting; })) { io.disconnect(); start(); } }, { rootMargin: "200px" });
      io.observe(root); io.observe(rh);
    } else start();

    // ---- demo states (screenshots): mid (the 300 MW load on the peak-demand week), fail, tl
    LX.demo(root, function (s) {
      started = true;
      if (s === "mid" || s === "done") { change(Object.assign(U.copy(plan), { per: "hot", ll: 300, llz: "T" })); run.run(plan); return { view: "mid" }; }
      if (s === "fail") { stub = "fail"; run.run(plan); return { view: "fail" }; }
      if (s === "tl") { stub = "tl"; run.run(plan); return { view: "tl" }; }
      return null;
    });
  });
})();
