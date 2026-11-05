// c2-plains-grid-hard-year.js — C2, "The Plains Grid in a hard year" (capstone, wave W4, 2026-11-05), built on the Grid
// Room's engine E2 (assets/learn/components/engine-e2.js, LX.E2; data assets/learn/data/e2-plains-grid.json).
//
// The capstone: a 300 MW data center (a load) asks to connect at Prairie Town. The reader chooses how much connects this
// year, its flexibility, what to build (peakers, a battery, wind, solar), a Town–Metro uprate, the reserve and the share
// of new costs the large load pays, within cost ranges the reader sets (guard G-COST). Three run boxes: the year (12
// representative days plus the two hard weeks, each day committed by the MILP and priced by the dispatch LP with the
// commitment fixed), the adequacy check (a seeded Monte Carlo over 2025 and 2024 weather and plant outages, with the
// sensitivity: the plan's builds held fixed as the connected load grows), and who pays (a ledger from the year's
// conditional prices and the stated allocation rules, against today's grid, precomputed with the same engine). The note is
// LX.ReportNote (two pages); the self-check LX.Exemplars and LX.Rubric. Every number is checked by
// _tests/learn/test_c2-plains-grid-hard-year.js. Nothing is saved or sent: the reader copies the note and the link.
(function () {
  "use strict";
  // ---------------------------------------------------------------- pure (Node: the test reads these)
  function kilo(v) { var r = Math.round(v); return (r < 0 ? "−" : "") + Math.abs(r).toLocaleString("en-US"); }
  function mil(v) { var r = Math.round(v / 1e5) / 10; if (r === 0) r = 0; return (r < 0 ? "−$" : "$") + Math.abs(r).toFixed(1) + "M"; }
  function price(v) { var r = Math.round(v); return (r < 0 ? "−$" : "$") + Math.abs(r).toLocaleString("en-US"); }
  var SWEEP = [0, 100, 200, 300];
  // the new capacity's and the uprate's yearly cost, in $: MW x $/kW-year x 1,000
  function newCost(st, cfg) {
    var pkMW = st.pk * cfg.c2.peaker.pmax;
    return 1000 * (pkMW * st.cpk + st.bat * st.cbat + st.wind * st.cwind + st.solar * st.csolar + st.up * st.cup);
  }
  // who pays, a year (2025 dollars), from the year's run R and today's grid B (precomputed: the same engine, no large load,
  // nothing built, the same reserve). Rules (stated on the page): each MWh served pays its zone's price; the congestion
  // rent goes back to all customers by energy; uplift is charged by energy; the large load pays its share of the new
  // costs directly and the rest is spread by energy over every customer, the large load included.
  function ledger(st, R, B, cfg) {
    var Eall = R.served.reduce(function (a, b) { return a + b; }, 0), Ell = R.tot.llMWh, Eoth = Eall - Ell;
    var pay = R.tot.pay.reduce(function (a, b) { return a + b; }, 0), N = newCost(st, cfg), sh = st.share / 100, f = Eall > 0 ? Ell / Eall : 0;
    var ll = { energy: R.tot.llPay, rent: -R.tot.rent * f, uplift: R.tot.upliftAll * f, fixed: N * sh + N * (1 - sh) * f };
    var oth = { energy: pay - R.tot.llPay, rent: -R.tot.rent * (1 - f), uplift: R.tot.upliftAll * (1 - f), fixed: N * (1 - sh) * (1 - f) };
    [ll, oth].forEach(function (x) { x.total = x.energy + x.rent + x.uplift + x.fixed; });
    var b = { energy: B.pay, rent: -B.rent, uplift: B.uplift, fixed: 0 }; b.total = b.energy + b.rent + b.uplift;
    // the change for other customers, part by part (the parts add up to the change)
    var parts = { energy: oth.energy - b.energy, rent: oth.rent - b.rent, uplift: oth.uplift - b.uplift, fixed: oth.fixed };
    return { ll: ll, oth: oth, b: b, parts: parts, N: N, Ell: Ell, Eoth: Eoth, base: b.total, baseE: B.served, delta: oth.total - b.total, perMWh: Eoth > 0 ? (oth.total - b.total) / Eoth : 0, llPerMWh: Ell > 0 ? ll.total / Ell : null };
  }
  // true when two plans differ only in the costs or the large load's share (fields that move only the ledger)
  var MONEY = ["share", "cpk", "cbat", "cwind", "csolar", "cup"];
  function moneyOnly(S, a, b) { return S.fields.every(function (f) { return MONEY.indexOf(f.id) >= 0 || a[f.id] === b[f.id]; }); }
  // the largest error of Town's average price in the representative-day check (four plans, 2025 and 2024), in %
  function priceErr(cfg) {
    var e = 0; (cfg.precomputed.c2check || []).forEach(function (r) { [r.f25, r.f24].forEach(function (f) { e = Math.max(e, Math.abs((r.est.priceT - f.priceT) / f.priceT * 100)); }); });
    return Math.ceil(e);
  }
  // the change for other customers, part by part, in words (the parts add up to the change)
  function partsWords(L) {
    var sg = function (v) { return (v >= 0 ? "+" : "") + mil(v); };
    return "energy at zone prices " + sg(L.parts.energy) + ", congestion rent back " + sg(L.parts.rent) + (L.parts.rent > 0 ? " (less credit than today)" : "") + ", uplift " + sg(L.parts.uplift) + ", new capacity and uprate " + sg(L.parts.fixed);
  }
  // the range of other customers' change across the cost ranges the reader sets (every new cost at its low end, then at
  // its high end); nothing else moves, since what is built does not change with its cost
  function costRange(st, R, B, cfg) {
    var lo = {}, hi = {}, k;
    for (k in st) { lo[k] = st[k]; hi[k] = st[k]; }
    ["pk", "bat", "wind", "solar", "up"].forEach(function (x) { var r = cfg.c2.costs[x]; lo["c" + x] = r.lo; hi["c" + x] = r.hi; });
    return { lo: ledger(lo, R, B, cfg).delta, hi: ledger(hi, R, B, cfg).delta };
  }
  // what the adequacy check says, from its numbers (never more than they show)
  function adequacyWords(A, crit) {
    var p = A.plan, t = A.today, okP = p.lole <= crit;
    return (okP ? "Within" : "Above") + " the 0.1 criterion: " + p.lole.toFixed(2) + " days a year with this plan (90% interval " + p.ci[0].toFixed(2) + " to " + p.ci[1].toFixed(2) + "), against " + t.lole.toFixed(2) + " for today's grid." +
      (okP && p.ci[1] > crit ? " The interval reaches past 0.1: more draw years would tell." : "");
  }
  function sensitivity(A, st) {
    var rows = A.sweep.slice().sort(function (a, b) { return a.mw - b.mw; }), base = rows.filter(function (x) { return x.mw === st.conn; })[0];
    return { metric: "Loss-of-load expectation (days a year)", input: "the large load connected", held: "the plan's builds and link held fixed",
      base: { at: kilo(st.conn) + " MW", value: base.lole.toFixed(2) }, cases: rows.filter(function (x) { return x.mw !== st.conn; }).map(function (x) { return { at: kilo(x.mw) + " MW", value: x.lole.toFixed(2) }; }) };
  }
  // the two exemplar notes (illustrative): the strong one quotes this engine's numbers for a reference plan (ref: the year
  // R, the hard weeks W, the ledger L with its cost range CR, the adequacy A of the plan, today's grid and the load with
  // nothing built, and the sweep), precomputed by the test (data file, precomputed.c2ex) and checked against a fresh run
  function exemplars(ref) {
    var st = ref.plan, A = ref.A, L = ref.L, W = ref.W, sw = A.sweep.slice().sort(function (a, b) { return a.mw - b.mw; });
    return { title: "Two notes on the same brief", task: "Recommend how much of the 300 MW connects this year, what to build so the grid stays adequate, and who pays.", id: "c2-ex", lines: true,
      answers: [
        { key: "weak", label: "Weak note", level: "Developing", parts: ["Connect the data center and ", { text: "build some peakers", note: "No sizes, no place, no units: the planners cannot check it." }, ". ",
          { text: "The grid will be reliable", note: "Reliable by what measure, against what criterion, with what uncertainty?" }, " and ", { text: "prices will stay low", note: "Which prices, where, in which hours? Prices here are conditional on the commitment." }, ", so ",
          { text: "nobody is hurt", note: "Who pays for the new plants and the link is the brief's question: name the parties and the amounts." }, "."] },
        { key: "good", label: "Strong note", level: "Proficient", parts: [
          "Recommendation: connect ", { text: "the full " + kilo(st.conn) + " MW this year with " + st.pk + " new 50 MW peakers at Prairie Town and " + kilo(st.up) + " MW more on Town–Metro", note: "Sizes with units and places: a plan the planners can check and cost." }, ".\n",
          "Adequacy: ", { text: A.plan.lole.toFixed(2) + " loss-of-load days a year (90% interval " + A.plan.ci[0].toFixed(2) + " to " + A.plan.ci[1].toFixed(2) + "), against " + A.today.lole.toFixed(2) + " for today's grid and " + A.bare.lole.toFixed(1) + " if the load connects with nothing built", note: "The criterion's measure, its Monte Carlo interval and two baselines." }, ".\n",
          "Sensitivity: ", { text: "with these builds held fixed, " + sw.map(function (x) { return x.lole.toFixed(2) + " days at " + kilo(x.mw) + " MW"; }).join(", ") + " connected", note: "One input moved, the plan held fixed: where the margin runs out." }, ".\n",
          "Hard weeks: ", { text: kilo(W.shed) + " MWh unserved in the 14 days; Town's price peaks at " + price(W.maxT) + "/MWh, conditional on the commitment", note: "The extreme periods kept, and the prices labelled for what they are." }, ".\n",
          "Who pays: ", { text: "the large load " + mil(L.ll.total) + " a year, half the new costs directly; other customers " + mil(L.delta) + " a year more than today, from " + mil(L.lo) + " to " + mil(L.hi) + " across the cost ranges", note: "Both parties on one boundary, a year, 2025 dollars, with the range the costs allow." }, ".\n",
          "Emissions: ", { text: kilo(ref.co2 / 1000) + " kt of CO₂ a year from the fuel burned", note: "Operating CO₂ on its own line, not mixed into the money." }, ".\n",
          "Limits: ", { text: "two weather years, a transport model without power-flow physics, illustrative plants and costs; one study year, so it does not test a load that arrives late or never", note: "What the study leaves out, so the planners do not over-read it." }, "."] }],
      note: "Both notes are illustrative. The strong one quotes this engine's numbers for one reference plan (" + st.pk + " peakers, a " + kilo(st.up) + " MW uprate, the large load paying " + st.share + "% of new costs), precomputed; another plan is just as strong when its evidence supports it." };
  }
  // the costs the reader sets: default, fixed range and basis (the sources card)
  function costsHTML(cfg) {
    var S = cfg.sources, e = function (x) { return String(x).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
    var names = { pk: "New peaker", bat: "Battery (4 hours)", wind: "Wind", solar: "Solar", up: "Town–Metro uprate" };
    return "<div class=\"lx-scroll-x\"><table class=\"lx-facts c2-costs\"><thead><tr><th scope=\"col\">Build</th><th scope=\"col\">Default</th><th scope=\"col\">Range you can set</th><th scope=\"col\">Basis</th></tr></thead><tbody>" +
      ["pk", "bat", "wind", "solar", "up"].map(function (k) {
        var c = cfg.c2.costs[k], src = (c.src || []).map(function (id) { return "<a href=\"" + e(S[id].url) + "\">" + e(S[id].text.split(":")[0].split(",").slice(0, 2).join(",")) + "</a>"; }).join("; ");
        return "<tr><td>" + names[k] + "</td><td class=\"n\">$" + c.def + "/kW-yr</td><td class=\"n\">$" + c.lo + " to $" + c.hi + "</td><td class=\"s\">" + e(c.basis) + (src ? ". " + src : "") + "</td></tr>";
      }).join("") + "</tbody></table></div>";
  }
  var page = { SWEEP: SWEEP, MONEY: MONEY, moneyOnly: moneyOnly, priceErr: priceErr, partsWords: partsWords, exemplars: exemplars, costsHTML: costsHTML, newCost: newCost, ledger: ledger, costRange: costRange, adequacyWords: adequacyWords, sensitivity: sensitivity, kilo: kilo, mil: mil, price: price,
    GROUPS: [{ title: "The large load (a data center at Prairie Town)", fields: ["conn", "flex", "bid"], color: "var(--lx-demand)", hint: "It asks for 300 MW, flat, every hour; connect part of it this year, and let a share of it stop when the price is high." },
      { title: "What to build", fields: ["pk", "bat", "wind", "solar", "up"], color: "var(--lx-cc)", hint: "New peakers, a 4-hour battery and solar at Prairie Town, wind at Wind Ridge, and more room on Town–Metro." },
      { title: "Operations and who pays", fields: ["res", "share"], color: "var(--lx-tier-4)", hint: "The reserve held every hour, and the share of the new costs the large load pays itself." },
      { title: "Costs you set (fixed ranges, a year per kW)", fields: ["cpk", "cbat", "cwind", "csolar", "cup"], color: "var(--lx-ink-2)", hint: "Each cost stays the same however much is built. Defaults: EIA's and NREL's values, as yearly payments (sources below)." }],
    RUBRIC: [{ id: "accounting", look: "Who pays and who benefits: the large load and other customers on one boundary, a year, 2025 dollars; CO₂ on its own line." },
      { id: "uncertainty", look: "The sensitivity line: adequacy as the connected load grows, the plan held fixed; the Monte Carlo interval stated." },
      { id: "realism", look: "What the study leaves out: power-flow physics, forecast errors, one weather year in two, illustrative plants and costs." },
      { id: "communication", look: "Two pages the planners can act on: the recommendation first, then the evidence and its limits.",
        levels: { proficient: "a two-page note with the plan link: the recommendation first, then the evidence (adequacy against 0.1 days a year, the hard weeks, who pays), the sensitivity and the limits" } }],
    RUBRIC_BAR: "the bar for this note",
    FIELDS: [{ key: "recommend", label: "Recommendation", hint: "Three or four sentences: how much connects, what to build, and why.", rows: 4, need: true, at: "top", min: 15 },
      { key: "whopays", label: "Who pays, and is it fair?", hint: "Two or three sentences: the large load, other customers, and the rule you chose.", rows: 3, need: true, min: 12 },
      { key: "risks", label: "What could still go wrong", hint: "Two or three sentences: what the model leaves out that could change your answer.", rows: 3, need: true, min: 12 }],
    TWO_PAGES: 1100 };
  if (typeof module !== "undefined" && module.exports) module.exports = page;
  if (typeof window === "undefined" || !window.LX || !window.LX.E2) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H, E2 = LX.E2, U = E2.ui;
  LX.mount("c2", function (live, data, root) {
    var cfg = data.e2_plains_grid, P = E2.prepare(cfg, { y2025: data.town_year, y2024: data.m03_capacity_expansion_2024, targets: data.cf_targets }, LX.townProfile);
    var S = E2.c2Schema(cfg), stub = null, last = null, adeq = null;
    var rh = document.getElementById("c2-results"), fb = rh.querySelector(".lx-fallback"); if (fb) fb.hidden = true;
    var wrap = H("div", { class: "lx-sb e2-sb" }, live);
    var ctr = H("div", { class: "lx-sb-controls" }, wrap), side = H("div", { class: "lx-sb-side" }, wrap);
    var plan;
    var ss = LX.ShareState(side, { schema: S, id: "c2-link", onLoad: function (s) { plan = s; C.set(plan); run.changed(plan); AD.changed(plan); rn.refresh(); } });
    plan = ss.state;
    var C = U.controls(ctr, S, plan, page.GROUPS, change);
    var pre = H("div", { class: "lx-sb-presets", role: "group", "aria-label": "Start from a preset (only the choices it names change)" }, side);
    E2.c2presets.forEach(function (pr) { H("button", { class: "lx-btn ghost small", type: "button", text: pr.label, title: pr.note, onclick: function () { var p = U.copy(plan); for (var k in pr.state) p[k] = pr.state[k]; change(p); } }, pre); });
    function solver() { if (!stub) return null; stub = null; return function () { return Promise.resolve({ status: "error", ok: false, message: "solver stopped (demo)" }); }; }
    var stale = H("p", null, rh), res = H("div", { class: "lx-sb-results c2-res" }, rh), ro = H("div", { class: "lx-readouts e2-ro" }), stopB = U.stopper();
    var prog = H("p", { class: "lx-hint c2-prog", "aria-live": "polite" });
    var run = LX.BenchRun(side, { label: "Run the year", state: function () { return plan; }, partial: true, results: [res, ro], stale: stale,
      busy: function (on) { stopB.busy(on); if (!on) prog.textContent = ""; },
      solve: function (st, ctx) { return E2.solve(st, P, { task: "year", signal: ctx.signal, attempt: ctx.attempt, solver: solver(), onDay: function (k, n) { prog.textContent = "Day " + k + " of " + n + "…"; } }); },
      render: function (R, st, r) { last = { plan: U.copy(st), R: R, r: r }; draw(R, st); rn.refresh(); } });
    stopB.attach(run); run.button.parentNode.appendChild(prog);
    side.appendChild(ro); side.insertBefore(ss.status, pre); side.appendChild(ss.el);
    // the costs and the share move only the ledger (what is built does not change with its cost): such a change redraws
    // the results of the last run on the spot, and the runs stay current
    function change(p) {
      var moneyOnly = !!last && page.moneyOnly(S, last.plan, p);
      plan = p; C.set(plan); ss.set(plan);
      if (moneyOnly) {
        last.plan = U.copy(p); draw(last.R, last.plan);
        if (adeq && page.moneyOnly(S, adeq.plan, p)) adeq.plan = U.copy(p); else AD.changed(plan);
      } else { run.changed(plan); AD.changed(plan); }
      rn.refresh();
    }
    function base(st) { return cfg.precomputed.c2base[String(st.res)]; }

    // ---- the year's results: what it says, who pays, the hard weeks
    function draw(R, st) {
      ro.innerHTML = "";
      var L = page.ledger(st, R, base(st), cfg), wk = weeksOf(R, st);
      [["Production cost, a year", page.mil(R.tot.prod), ""], ["Other customers vs today", (L.delta >= 0 ? "+" : "") + page.mil(L.delta).replace("$", "$"), L.delta > 0 ? "bad" : "good"],
        ["Unserved, hard weeks", kilo(wk.tot.shed) + " MWh", wk.tot.shed > 0.5 ? "bad" : "good"], ["Town–Metro at its limit", kilo(R.tot.cong.TM) + " h a year", ""]]
        .forEach(function (x) { var d = H("div", { class: "lx-readout " + x[2] }, ro); H("span", { text: x[0] }, d); H("b", { text: x[1] }, d); });
      res.innerHTML = "";
      // who pays
      var c1 = H("div", { class: "lx-xcard c2-ledger" }, res); H("h3", { text: "Who pays, a year (2025 dollars)" }, c1);
      var row = function (x) { return [page.mil(x.energy), page.mil(x.rent), page.mil(x.uplift), page.mil(x.fixed), { text: page.mil(x.total), cls: "tot" }]; };
      LX.Ledger(c1, { caption: "Each column a year, from the year's prices (conditional on the commitment) and the rules below.", columns: ["Who", "Energy at zone prices", "Congestion rent back", "Uplift", "New capacity and uprate", "Total"],
        rows: [{ head: "The large load", sub: kilo(L.Ell / 1000) + " GWh served", cells: row(L.ll) }, { head: "Other customers", sub: kilo(L.Eoth / 1000) + " GWh served", cells: row(L.oth) },
          { head: "Other customers, today's grid", sub: "no large load, nothing built", cells: row(L.b), total: true }], cls: "c2-led" });
      var cr = page.costRange(st, R, base(st), cfg);
      var notes = ["**Other customers pay " + page.mil(Math.abs(L.delta)) + " a year " + (L.delta >= 0 ? "more" : "less") + " than today** (" + (L.perMWh >= 0 ? "+" : "−") + "$" + Math.abs(L.perMWh).toFixed(2) + " per MWh)" + (Math.abs(cr.hi - cr.lo) >= 5e4 ? "; across the cost ranges you can set, from " + page.mil(cr.lo) + " to " + page.mil(cr.hi) : "; nothing is built, so the cost ranges do not move it") + ".",
        "**Where the change comes from:** " + page.partsWords(L) + ".",
        "**The large load pays " + page.mil(L.ll.total) + "** for " + kilo(L.Ell / 1000) + " GWh" + (L.llPerMWh != null ? " ($" + L.llPerMWh.toFixed(2) + " per MWh)" : "") + "; new capacity and the uprate cost " + page.mil(L.N) + " a year, " + st.share + "% of it paid by the large load directly.",
        "**Rules:** each MWh served pays its zone's price; congestion rent and uplift are shared by energy; unserved energy is not priced here (see adequacy). The prices come from the year's estimate on 26 days: for the four plans checked against every day, Town's average price came within " + page.priceErr(cfg) + "% (the check is below)."];
      var ul = H("ul", { class: "e2-notes" }, c1); notes.forEach(function (t) { H("li", { html: LX.rich(t).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>") }, ul); });
      // the hard weeks
      var c2 = H("div", { class: "lx-xcard lx-sb-chart" }, res); H("h3", { text: "The two hard weeks, day by day" }, c2);
      var ws = [(wk.tot.shed > 0.5 ? "**" + kilo(wk.tot.shed) + " MWh unserved**" : "**No load unserved**") + " in the 14 days" + (wk.tot.rshort > 0.5 ? "; reserve short by " + kilo(wk.tot.rshort) + " MWh" : "") + "; highest price " + price(Math.max.apply(null, wk.maxPrice)) + "/MWh (conditional on the commitment).",
        "Town–Metro at its limit for " + kilo(wk.tot.cong.TM) + " of " + wk.hours + " hours; the large load's average price " + (wk.llAvg != null ? price(wk.llAvg) + "/MWh" : "–") + (wk.tot.curtail > 0.5 ? "; it curtailed " + kilo(wk.tot.curtail) + " MWh" : "") + "."];
      ws.forEach(function (t) { H("p", { class: "e2-say" + (wk.tot.shed > 0.5 ? " bad" : ""), html: LX.rich(t).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>") }, c2); });
      U.priceChart(c2, P, wk);
      var mc = H("div", { class: "lx-xcard c2-mapcard" }, res); var map = U.ZoneMap(mc, P);
      var best = 0, bp = -Infinity, k = 0; wk.days.forEach(function (d) { d.hours.forEach(function (h) { if (h.z[P.zix.T].price > bp + 1e-9) { bp = h.z[P.zix.T].price; best = k; } k++; }); });
      map.set(wk, best);
      // the year
      var c3 = H("div", { class: "lx-xcard" }, res); H("h3", { text: "The year, estimated on 26 days" }, c3);
      var Y = ["Production cost " + page.mil(R.tot.prod) + " (running, no-load, start-up; 2025 dollars); uplift " + page.mil(R.tot.upliftAll) + ".",
        "Average price (conditional on the commitment): " + P.zones.map(function (z, i) { return z.name + " " + price(R.avgPrice[i]); }).join(", ") + " per MWh.",
        "CO₂ " + kilo(R.tot.co2 / 1000) + " kt (operating, from the fuel burned); wind and sun spilled " + kilo(R.tot.spill / 1000) + " GWh.",
        "12 representative days, each weighted by its month's days, plus the two hard weeks day by day: 365 days in all. For the four plans checked against every day, production cost and CO₂ come close, but uplift and the hours at Town–Metro's limit do not: see the check below."];
      var ul3 = H("ul", { class: "e2-notes" }, c3); Y.forEach(function (t) { H("li", { text: t }, ul3); });
    }
    function weeksOf(R, st) { return E2.summarize(st, P, { task: "weeks", sys: R.sys, days: R.days.filter(function (d) { return d.spec.period; }) }); }

    // ---- adequacy, with the sensitivity: the plan held fixed as the connected load grows
    var ac = H("div", { class: "lx-xcard c2-adeq" }, rh);
    H("h3", { text: "Check adequacy: enough supply in nearly every hour?" }, ac);
    H("p", { class: "lx-hint", html: LX.rich("A seeded [[monte-carlo|Monte Carlo]]: " + cfg.c2.adequacy.years + " draw years of 2025's and 2024's weather, each plant up or out for a whole day at its [[forced-outage-rate|forced outage rate]]. Counts [[lole|loss-of-load]] days, [[lolh|hours]] and [[expected-unserved-energy|energy]]; the common criterion is 0.1 days a year.") }, ac);
    var aRow = H("div", null, ac), aStale = H("p", null, ac), aRes = H("div", { class: "c2-adeq-res" }, ac), aStop = U.stopper(), aProg = H("p", { class: "lx-hint c2-prog", "aria-live": "polite" });
    var AD = LX.BenchRun(aRow, { label: "Check adequacy", state: function () { return plan; }, results: [aRes], stale: aStale, busy: function (on) { aStop.busy(on); if (!on) aProg.textContent = ""; },
      words: { ok: "Done: every draw year simulated (a Monte Carlo estimate, with its 90% interval)." },
      solve: function (st, ctx) {
        var jobs = [["plan", st], ["today", Object.assign(U.copy(st), { conn: 0, flex: 0, pk: 0, bat: 0, wind: 0, solar: 0, up: 0 })]];
        SWEEP.forEach(function (mw) { if (mw !== st.conn) jobs.push(["sweep", Object.assign(U.copy(st), { conn: mw })]); });
        var out = { plan: null, today: null, sweep: [] }, i = 0;
        function next() {
          if (i >= jobs.length) { if (SWEEP.indexOf(st.conn) >= 0) out.sweep.push(Object.assign({ mw: st.conn }, out.plan)); return Promise.resolve({ status: "optimal", ok: true, kind: "simulation", results: out }); }
          var j = jobs[i++];
          aProg.textContent = "Run " + i + " of " + jobs.length + "…";
          return E2.adequacy(P, E2.sysOf(j[1], P), { signal: ctx.signal }).then(function (r) {
            if (!r.ok) return r;
            if (j[0] === "sweep") { r.results.mw = j[1].conn; out.sweep.push(r.results); } else out[j[0]] = r.results;
            return next();
          });
        }
        return next();
      },
      render: function (A, st) { adeq = { plan: U.copy(st), A: A }; drawAdeq(A, st); rn.refresh(); } });
    aStop.attach(AD); AD.button.parentNode.appendChild(aProg);
    function drawAdeq(A, st) {
      aRes.innerHTML = "";
      var okP = A.plan.lole <= cfg.c2.adequacy.criterion;
      H("p", { class: "e2-say " + (okP ? "good" : "bad"), html: "<b>" + LX.esc(page.adequacyWords(A, cfg.c2.adequacy.criterion)) + "</b>" }, aRes);
      U.table(aRes, ["", "Loss-of-load days a year", "Hours a year", "Unserved MWh a year", "Flexible share curtailed"],
        [["This plan", A.plan.lole.toFixed(2), A.plan.lolh.toFixed(1), kilo(A.plan.eue), A.plan.curtailHours.toFixed(1) + " h"], ["Today's grid", A.today.lole.toFixed(2), A.today.lolh.toFixed(1), kilo(A.today.eue), "–"]], "c2-adeq-t");
      var rows = A.sweep.slice().sort(function (a, b) { return a.mw - b.mw; }), top = Math.max(0.2, Math.max.apply(null, rows.map(function (x) { return x.lole; })) * 1.2);
      var step = top <= 0.5 ? 0.1 : top <= 2 ? 0.5 : top <= 5 ? 1 : top <= 20 ? 5 : 10; top = Math.ceil(top / step) * step;
      var host = H("div", { class: "lx-sb-chart c2-sens" }, aRes); H("h4", { text: "Sensitivity: the connected load, with this plan's builds held fixed" }, host);
      var pl = LX.Plot(host, { caption: true, text: "Text version of the chart", box: true });
      pl.render({ x: { min: -50, max: 350, ticks: rows.map(function (x) { return [x.mw, kilo(x.mw) + " MW"]; }) }, y: { min: 0, max: top, step: step, fmt: function (v) { return v.toFixed(step < 1 ? 1 : 0); }, unit: "days/yr" }, height: 210, heightN: 190,
        caption: "Loss-of-load expectation, days a year, as more of the 300 MW connects",
        bars: rows.map(function (x) { return { x0: x.mw - 30, x1: x.mw + 30, y0: 0, y1: Math.max(x.lole, top * 0.004), color: x.lole > cfg.c2.adequacy.criterion ? "var(--lx-bad)" : "var(--lx-good)" }; }),
        refs: [{ y: cfg.c2.adequacy.criterion, label: "0.1 criterion", dash: "4 3" }],
        marks: rows.map(function (x) { return { x: x.mw, y: x.lole, label: x.lole.toFixed(2), kind: "dot", pos: "above" }; }),
        aria: "Loss-of-load expectation with the plan's builds fixed: " + rows.map(function (x) { return x.mw + " MW " + x.lole.toFixed(2); }).join(", ") + " days a year.",
        text: { head: ["Large load connected", "LOLE, days a year", "90% interval"], rows: rows.map(function (x) { return [kilo(x.mw) + " MW", x.lole.toFixed(2), x.ci[0].toFixed(2) + " to " + x.ci[1].toFixed(2)]; }) } });
      H("p", { class: "lx-hint", text: "A Monte Carlo estimate from " + A.plan.years + " draw years (seed " + A.plan.seed + "): two weather years only, plant outages drawn day by day, plant data illustrative. A check of this plan, not a reliability forecast." }, host);
    }

    // ---- the note
    var nh = document.getElementById("c2-note"); nh.innerHTML = "";
    var rn = LX.ReportNote(H("div", { class: "lx-xcard" }, nh), { id: "c2-note", code: "C2", title: "Your two-page study note", lede: "Write three parts in your own words; the plan, its numbers, the assumptions and the sensitivity come from your last runs.",
      fields: page.FIELDS,
      checks: ["link", "run", "fields", "assumptions", "sensitivity",
        { id: "pages", label: "Fits on two pages (about " + kilo(page.TWO_PAGES) + " words)", test: function (note, words) { return LX.ReportNote.countWords(LX.ReportNote.compose(note, words, page.FIELDS, { format: "text" })) <= page.TWO_PAGES; } },
        { id: "adequacy", label: "Adequacy checked on this plan (Check adequacy)", test: function () { return !!adeq && LX.ShareState.same(S, adeq.plan, plan); } },
        { id: "brief", label: "The brief met: within 0.1 loss-of-load days a year with the load as connected", test: function () { return !!adeq && LX.ShareState.same(S, adeq.plan, plan) && adeq.A.plan.lole <= cfg.c2.adequacy.criterion; } }],
      get: function () {
        if (!last) return null;
        var R = last.R, st = last.plan, L = page.ledger(st, R, base(st), cfg), wk = weeksOf(R, st), fresh = LX.ShareState.same(S, st, plan);
        var n = { heading: "The Plains Grid: " + kilo(st.conn) + " MW of the large load connected" + (st.pk ? ", " + st.pk * 50 + " MW of new peakers" : "") + (st.bat ? ", a " + kilo(st.bat) + " MW battery" : "") + (st.up ? ", " + kilo(st.up) + " MW more on Town–Metro" : ""),
          made: "the Grid Room's engine E2 (unit commitment as a mixed-integer program, prices from the dispatch linear program), on capstone C2",
          link: ss.url(), run: { ok: !!last.r.ok, stale: !fresh, text: "12 representative days and the two hard weeks (365 days of weight), day by day" },
          plan: S.fields.map(function (f) { return { label: f.label, value: U.fmtOf(f)(st[f.id]) }; }),
          results: [{ label: "Production cost", value: page.mil(R.tot.prod) + " a year", note: "running, no-load and start-up; 2025 dollars; illustrative plants" },
            { label: "Other customers against today's grid", value: (L.delta >= 0 ? "+" : "") + page.mil(L.delta) + " a year", note: "energy at conditional prices, congestion rent and uplift shared by energy, " + (100 - st.share) + "% of new costs spread by energy" },
            { label: "The large load pays", value: page.mil(L.ll.total) + " a year", note: kilo(L.Ell / 1000) + " GWh served" },
            { label: "Hard weeks: unserved load", value: kilo(wk.tot.shed) + " MWh", note: "peak-demand week and low-wind winter week; highest price " + price(Math.max.apply(null, wk.maxPrice)) + "/MWh, conditional on the commitment" },
            { label: "Town–Metro at its limit", value: kilo(R.tot.cong.TM) + " hours a year" },
            { label: "CO₂", value: kilo(R.tot.co2 / 1000) + " kt a year", note: "operating, from the fuel burned (EIA coefficients)" }],
          assumptions: ["The Plains Grid, its plants, links and costs are fictional and illustrative; 2025 dollars", "Demand, wind and sun follow the Southwest Power Pool's 2025 shapes; the three zones share that weather",
            "The year is 12 representative days and two hard weeks; each day is committed alone, knowing its load, wind and sun exactly",
            "Prices are conditional on the commitment; uplift and congestion rent are shared by energy", "Costs stay the same however much is built (the ranges are the reader's)"],
          sensitivity: adeq && LX.ShareState.same(S, adeq.plan, st) ? page.sensitivity(adeq.A, st) : "Run Check adequacy on this plan for the sensitivity line.",
          limits: ["A transport model: no power-flow physics, losses or voltage", "No forecast errors or ramp limits in the commitment; outages only in the adequacy check",
            "Two weather years and illustrative outage rates: the adequacy check is a teaching estimate", "One study year: it does not test a load that arrives late, smaller or never"] };
        if (adeq && LX.ShareState.same(S, adeq.plan, st)) n.results.push({ label: "Loss-of-load expectation", value: adeq.A.plan.lole.toFixed(2) + " days a year", note: "90% interval " + adeq.A.plan.ci[0].toFixed(2) + " to " + adeq.A.plan.ci[1].toFixed(2) + "; today's grid " + adeq.A.today.lole.toFixed(2) + "; criterion 0.1" });
        return n;
      } });
    rn.refresh();

    // ---- the self-check: two notes (precomputed numbers of a reference plan) and the rubric
    var ex = document.getElementById("exemplars"), exFb = ex.querySelector(".lx-fallback");
    if (exFb) exFb.hidden = true;
    LX.Exemplars(H("div", { class: "lx-xcard" }, ex), cfg.precomputed.c2ex.exemplars);
    var rbh = document.getElementById("c2-rubric"); rbh.innerHTML = "";
    LX.Rubric(H("div", { class: "lx-xcard" }, rbh), { id: "c2-rubric", code: "C2", title: "Rate your note against the rubric", competences: page.RUBRIC, bar: page.RUBRIC_BAR });

    // ---- the first run when the plan is in view
    var started = false;
    function start() { if (started) return; started = true; run.run(plan); }
    if (typeof IntersectionObserver !== "undefined") {
      var io = new IntersectionObserver(function (es) { if (es.some(function (e) { return e.isIntersecting; })) { io.disconnect(); start(); } }, { rootMargin: "200px" });
      io.observe(root); io.observe(rh);
    } else start();

    LX.demo(root, function (s) {
      started = true;
      if (s === "mid") { run.run(plan); return { view: "mid" }; }
      if (s === "done") {
        change(Object.assign(U.copy(plan), E2.c2presets[1].state, { share: 50 }));
        run.run(plan).then(function () { AD.run(plan); });
        rn.set({ recommend: "Connect the full 300 MW this year with six 50 MW peakers at Prairie Town and 300 MW more on Town–Metro. Without them the load cannot be carried through the hard weeks, and the grid falls far short of 0.1 loss-of-load days a year.",
          whopays: "The large load pays half of the new costs directly; the rest is spread by energy. Other customers still see a change, which the ledger shows against today's grid.",
          risks: "The study has two weather years, no power-flow physics and illustrative plants; a colder winter or a late peaker could change the answer." });
        return { view: "done" };
      }
      if (s === "fail") { stub = "fail"; run.run(plan); return { view: "fail" }; }
      return null;
    });
  });
})();
