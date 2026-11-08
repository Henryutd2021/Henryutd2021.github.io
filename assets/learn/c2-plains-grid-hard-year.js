// c2-plains-grid-hard-year.js — C2, "The Plains Grid in a hard year" (capstone), built on the Grid
// Room's engine E2 (assets/learn/components/engine-e2.js, LX.E2; data assets/learn/data/e2-plains-grid.json).
//
// The capstone: a 300 MW data center (a load) asks to connect at Prairie Town. The reader chooses how much connects this
// year, its flexibility, what to build (peakers, a battery, wind, solar), a Town–Metro uprate, the reserve and the share
// of new costs the large load pays, within cost ranges the reader sets (no cost changes with how much is built). Three run boxes: the year (12
// representative days plus the two hard weeks, each day committed by the MILP and priced by the dispatch LP with the
// commitment fixed), the adequacy check (a seeded Monte Carlo over 2025 and 2024 weather and plant outages, with the
// sensitivity: the plan's builds held fixed as the connected load grows), and who pays (a ledger from the year's
// conditional prices and the stated allocation rules, against today's grid, precomputed with the same engine; the
// 26-day estimate's error is carried from the full-year check of four plans). The note is
// LX.ReportNote (two pages, with the sensitivity chart the reader downloads and a paragraph from M2's notebook); the
// self-check LX.Exemplars and LX.Rubric. Every number is checked by _tests/learn/test_c2-plains-grid-hard-year.js.
// Nothing is saved or sent: the reader copies the note and the link, and downloads the chart to their own device.
(function () {
  "use strict";
  // ---------------------------------------------------------------- pure (Node: the test reads these)
  function kilo(v) { var r = Math.round(v); return (r < 0 ? "−" : "") + Math.abs(r).toLocaleString("en-US"); }
  function mil(v) { var r = Math.round(v / 1e5) / 10; if (r === 0) r = 0; return (r < 0 ? "−$" : "$") + Math.abs(r).toFixed(1) + "M"; }
  function price(v) { var r = Math.round(v); return (r < 0 ? "−$" : "$") + Math.abs(r).toLocaleString("en-US"); }
  var SWEEP = [0, 100, 200, 300];
  var LIB_LIMIT = 120;   // s per solve when the library is built (the page's live solves: 3 s, then 10 s)
  function r0(v) { return Math.round(v); }
  function r1(v) { return Math.round(v * 10) / 10; }
  function r2(v) { return Math.round(v * 100) / 100; }
  function sum(a) { return a.reduce(function (x, y) { return x + y; }, 0); }
  // one plan's entry in the precomputed library, from E2.solve(plan, P, { task: "year" }): each day's MILP status and
  // gap, production cost, unserved MWh and Town's highest price; the year's sums (for the ledger); the hard weeks'
  // summary with Town's price in each of their 336 hours (whole dollars)
  function libEntry(E2, P, st, r) {
    var R = r.results, ti = P.zix.T;
    var W = E2.summarize(st, P, { task: "weeks", sys: R.sys, days: R.days.filter(function (d) { return d.spec.period; }) });
    return { k: E2.c2Key(st), status: r.status,
      days: R.days.map(function (d) { return [d.milp.status, d.milp.gap == null ? null : Math.round(d.milp.gap * 1e6) / 1e6, r0(d.tot.prod), r1(d.tot.shed), r2(Math.max.apply(null, d.hours.map(function (h) { return h.z[ti].price; })))]; }),
      year: { prod: r0(R.tot.prod), co2: r0(R.tot.co2), pay: r0(sum(R.tot.pay)), rent: r0(R.tot.rent), uplift: r0(R.tot.upliftAll), served: r1(sum(R.served)), ll: r1(R.tot.llMWh), llPay: r0(R.tot.llPay),
        avg: R.avgPrice.map(r2), cong: r1(R.tot.cong.TM), spill: r0(R.tot.spill), curtail: r1(R.tot.curtail) },
      weeks: { shed: r1(W.tot.shed), rshort: r1(W.tot.rshort), max: W.maxPrice.map(r2), cong: W.tot.cong.TM, hours: W.hours, llAvg: W.llAvg == null ? null : r2(W.llAvg), curtail: r1(W.tot.curtail),
        town: [].concat.apply([], W.days.map(function (d) { return d.hours.map(function (h) { return Math.round(h.z[ti].price); }); })) } };
  }
  // what the library says about one plan's run, in a line: every day optimal, or how many stopped early and the gap
  function libStatus(e) {
    var early = e.days.filter(function (d) { return d[0] !== "optimal"; });
    if (!early.length) return { ok: true, text: "all " + e.days.length + " days reported optimal" };
    var g = Math.max.apply(null, early.map(function (d) { return d[1] || 0; }));
    return { ok: false, text: early.length + " of " + e.days.length + " days stopped at the time limit: not proven optimal (largest gap " + (g * 100).toFixed(2) + "%)" };
  }
  // the new capacity's and the uprate's yearly cost, in $: MW x $/kW-year x 1,000
  function newCost(st, cfg) {
    var pkMW = st.pk * cfg.c2.peaker.pmax;
    return 1000 * (pkMW * st.cpk + st.bat * st.cbat + st.up * st.cup);
  }
  // who pays, a year (2025 dollars), from the year's run R and today's grid B (precomputed: the same engine, no large load,
  // nothing built, the same reserve). Rules (stated on the page): each MWh served pays its zone's price; a zone's unserved
  // load is shared by its customers in proportion to their load (engine E2's readDay; the large load's after its own
  // curtailment); the congestion rent goes back to all customers by energy; uplift is charged by energy; the large load
  // pays its share of the new costs directly and the rest is spread by energy over every customer, the large load included.
  // Y: a library entry's year (served MWh, the large load's MWh and payment, all payments, rent, uplift)
  function ledger(st, Y, B, cfg) {
    var Eall = Y.served, Ell = Y.ll, Eoth = Eall - Ell;
    var pay = Y.pay, N = newCost(st, cfg), sh = st.share / 100, f = Eall > 0 ? Ell / Eall : 0;
    var ll = { energy: Y.llPay, rent: -Y.rent * f, uplift: Y.uplift * f, fixed: N * sh + N * (1 - sh) * f };
    var oth = { energy: pay - Y.llPay, rent: -Y.rent * (1 - f), uplift: Y.uplift * (1 - f), fixed: N * (1 - sh) * (1 - f) };
    [ll, oth].forEach(function (x) { x.total = x.energy + x.rent + x.uplift + x.fixed; });
    var b = { energy: B.pay, rent: -B.rent, uplift: B.uplift, fixed: 0 }; b.total = b.energy + b.rent + b.uplift;
    // the change for other customers, part by part (the parts add up to the change)
    var parts = { energy: oth.energy - b.energy, rent: oth.rent - b.rent, uplift: oth.uplift - b.uplift, fixed: oth.fixed };
    return { ll: ll, oth: oth, b: b, parts: parts, N: N, Ell: Ell, Eoth: Eoth, base: b.total, baseE: B.served, delta: oth.total - b.total, perMWh: Eoth > 0 ? (oth.total - b.total) / Eoth : 0, llPerMWh: Ell > 0 ? ll.total / Ell : null };
  }
  // true when two plans differ only in the costs or the large load's share (fields that move only the ledger)
  var MONEY = ["share", "cpk", "cbat", "cup"];
  function moneyOnly(S, a, b) { return S.fields.every(function (f) { return MONEY.indexOf(f.id) >= 0 || a[f.id] === b[f.id]; }); }
  // the largest error of Town's average price in the representative-day check (four plans, 2025 and 2024), in %
  function priceErr(cfg) {
    var e = 0; (cfg.precomputed.c2check || []).forEach(function (r) { [r.f25, r.f24].forEach(function (f) { e = Math.max(e, Math.abs((r.est.priceT - f.priceT) / f.priceT * 100)); }); });
    return Math.ceil(e);
  }
  // a loss-of-load figure, with enough decimals to stay on the right side of the criterion (0.1002768 is "0.1003", not
  // "0.10")
  function loleTxt(v, crit) {
    for (var k = 2; k < 6; k++) { var t = v.toFixed(k); if ((+t > crit) === (v > crit) && (+t < crit) === (v < crit)) return t; }
    return v.toFixed(6);
  }
  // the full-year check of the ledger: for each of the four checked plans, other customers' change
  // against today on the 26-day estimate, over every day of 2025 and over every day of 2024 (today's grid run the same
  // way); err25 and err24: the smallest and largest (full year − estimate), in $ a year
  function ledgerCheck(cfg) {
    var pc = cfg.precomputed, rows = (pc.c2check || []).map(function (r) {
      var B = pc.c2base[String(r.plan.res)];
      return { label: r.label, plan: r.plan, est: ledger(r.plan, r.est, B, cfg).delta, f25: ledger(r.plan, r.f25, pc.c2checkBase.f25, cfg).delta, f24: ledger(r.plan, r.f24, pc.c2checkBase.f24, cfg).delta };
    });
    var span = function (k) { var d = rows.map(function (x) { return x[k] - x.est; }); return { lo: Math.min.apply(null, d), hi: Math.max.apply(null, d) }; };
    return { rows: rows, err25: span("f25"), err24: span("f24") };
  }
  function sgn(v) { return (v >= 0 ? "+" : "") + mil(v); }
  // the who-pays card's notes, one idea a line (L: the ledger; cr: its cost range; K: ledgerCheck)
  function ledgerNotes(st, L, cr, K, cfg) {
    var e = K.err25;
    return ["**Other customers pay " + mil(Math.abs(L.delta)) + " a year " + (L.delta >= 0 ? "more" : "less") + " than today** on the 26-day estimate (" + (L.perMWh >= 0 ? "+" : "−") + "$" + Math.abs(L.perMWh).toFixed(2) + " per MWh)" + (Math.abs(cr.hi - cr.lo) >= 5e4 ? "; across the cost ranges you can set, from " + mil(cr.lo) + " to " + mil(cr.hi) : "; nothing is built, so the cost ranges do not move it") + ".",
      "**The estimate's error:** for the four plans checked, every day of 2025 put other customers' change " + sgn(e.lo) + " to " + sgn(e.hi) + " from the 26-day estimate. For this plan, read it as " + sgn(L.delta + e.lo) + " to " + sgn(L.delta + e.hi) + ".",
      "**Where the change comes from:** " + partsWords(L) + ".",
      "**The large load pays " + mil(L.ll.total) + "** for " + kilo(L.Ell / 1000) + " GWh" + (L.llPerMWh != null ? " ($" + L.llPerMWh.toFixed(2) + " per MWh)" : "") + "; new capacity and the uprate cost " + mil(L.N) + " a year, " + st.share + "% of it paid by the large load directly.",
      "**Billing rule:** each MWh served pays its zone's price ([[conditional-price|conditional on the commitment]]); [[congestion-rent|congestion rent]] goes back to customers by energy; [[uplift|uplift]], the make-whole payment to committed plants, is charged by energy.",
      "**Shortfall rule:** a zone's unserved load is shared by its customers in proportion to their load, the large load's after its own curtailment. Unserved energy is not billed; adequacy is checked below."];
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
    ["pk", "bat", "up"].forEach(function (x) { var r = cfg.c2.costs[x]; lo["c" + x] = r.lo; hi["c" + x] = r.hi; });
    return { lo: ledger(lo, R, B, cfg).delta, hi: ledger(hi, R, B, cfg).delta };
  }
  // what the adequacy check says, from its numbers (never more than they show)
  function adequacyWords(A, crit) {
    var p = A.plan, t = A.today, okP = p.lole <= crit, f = function (v) { return loleTxt(v, crit); };
    return (okP ? "Within" : "Above") + " the 0.1 criterion: " + f(p.lole) + " days a year with this plan (90% interval " + f(p.ci[0]) + " to " + f(p.ci[1]) + "), against " + f(t.lole) + " for today's grid." +
      (okP && p.ci[1] > crit ? " The point estimate meets the criterion; the interval crosses it, so more draw years would tell." : "");
  }
  function sensitivity(A, st) {
    var rows = A.sweep.slice().sort(function (a, b) { return a.mw - b.mw; }), base = rows.filter(function (x) { return x.mw === st.conn; })[0];
    return { metric: "Loss-of-load expectation (days a year)", input: "the large load connected", held: "the plan's builds and link held fixed",
      base: { at: kilo(st.conn) + " MW", value: loleTxt(base.lole, 0.1) }, cases: rows.filter(function (x) { return x.mw !== st.conn; }).map(function (x) { return { at: kilo(x.mw) + " MW", value: loleTxt(x.lole, 0.1) }; }) };
  }
  // the two exemplar notes (illustrative): the strong one quotes this engine's numbers for a reference plan (ref: the year
  // R, the hard weeks W, the ledger L with its cost range CR, the adequacy A of the plan, today's grid and the load with
  // nothing built, and the sweep), precomputed by the test (data file, precomputed.c2ex) and checked against a fresh run
  function exemplars(ref) {
    var st = ref.plan, A = ref.A, L = ref.L, W = ref.W, sw = A.sweep.slice().sort(function (a, b) { return a.mw - b.mw; }), lt = function (v) { return loleTxt(v, 0.1); };
    return { title: "Two notes on the same brief", task: "Recommend how much of the 300 MW connects this year, what to build so the grid stays adequate, and who pays.", id: "c2-ex", lines: true,
      answers: [
        { key: "weak", label: "Weak note", level: "Developing", parts: ["Connect the data center and ", { text: "build some peakers", note: "No sizes, no place, no units: the planners cannot check it." }, ". ",
          { text: "The grid will be reliable", note: "Reliable by what measure, against what criterion, with what uncertainty?" }, " and ", { text: "prices will stay low", note: "Which prices, where, in which hours? Prices here are conditional on the commitment." }, ", so ",
          { text: "nobody is hurt", note: "Who pays for the new plants and the link is the brief's question: name the parties and the amounts." }, "."] },
        { key: "good", label: "Strong note", level: "Proficient", parts: [
          "Recommendation: connect ", { text: "the full " + kilo(st.conn) + " MW this year with " + st.pk + " new 50 MW peakers at Prairie Town and " + kilo(st.up) + " MW more on Town–Metro", note: "Sizes with units and places: a plan the planners can check and cost." }, ".\n",
          "Adequacy: ", { text: lt(A.plan.lole) + " loss-of-load days a year (90% interval " + lt(A.plan.ci[0]) + " to " + lt(A.plan.ci[1]) + (A.plan.lole <= 0.1 && A.plan.ci[1] > 0.1 ? ": the point estimate meets the 0.1 criterion, the interval crosses it" : "") + "), against " + lt(A.today.lole) + " for today's grid and " + A.bare.lole.toFixed(1) + " if the load connects with nothing built", note: "The criterion's measure, its Monte Carlo interval with the warning it carries, and two baselines." }, ".\n",
          "Sensitivity (chart attached): ", { text: "with these builds held fixed, " + sw.map(function (x) { return lt(x.lole) + " days at " + kilo(x.mw) + " MW"; }).join(", ") + " connected", note: "One input moved, the plan held fixed: where the margin runs out." }, ".\n",
          "Hard weeks: ", { text: kilo(W.shed) + " MWh unserved in the 14 days; Town's price peaks at " + price(W.maxT) + "/MWh, conditional on the commitment", note: "The extreme periods kept, and the prices labelled for what they are." }, ".\n",
          "Who pays: ", { text: "on the 26-day estimate, the large load " + mil(L.ll.total) + " a year, half the new costs directly, and other customers " + mil(L.delta) + " a year more than today (" + mil(L.lo) + " to " + mil(L.hi) + " across the cost ranges); every day of 2025 gives " + mil(ref.full.ll) + " and " + mil(ref.full.delta), note: "Both parties on one boundary, a year, 2025 dollars, with the range the costs allow and the estimate checked against a full year." }, ".\n",
          "Emissions: ", { text: kilo(ref.co2 / 1000) + " kt of CO₂ a year from the fuel burned", note: "Operating CO₂ on its own line, not mixed into the money." }, ".\n",
          "Limits: ", { text: "two weather years, a transport model without power-flow physics, illustrative plants and costs; one study year, so it does not test a load that arrives late or never", note: "What the study leaves out, so the planners do not over-read it." }, "."] }],
      note: "Both notes are illustrative. The strong one quotes this engine's numbers for one reference plan (" + st.pk + " peakers, a " + kilo(st.up) + " MW uprate, the large load paying " + st.share + "% of new costs), precomputed; another plan is just as strong when its evidence supports it." };
  }
  // the costs the reader sets: default, fixed range and basis (the sources card)
  function costsHTML(cfg) {
    var S = cfg.sources, e = function (x) { return String(x).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
    var names = { pk: "New peaker", bat: "Battery (4 hours)", up: "Town–Metro uprate" };
    return "<div class=\"lx-scroll-x\"><table class=\"lx-facts c2-costs\"><thead><tr><th scope=\"col\">Build</th><th scope=\"col\">Default</th><th scope=\"col\">Range you can set</th><th scope=\"col\">Basis</th></tr></thead><tbody>" +
      ["pk", "bat", "up"].map(function (k) {
        var c = cfg.c2.costs[k], src = (c.src || []).map(function (id) { return "<a href=\"" + e(S[id].url) + "\">" + e(S[id].text.split(":")[0].split(",").slice(0, 2).join(",")) + "</a>"; }).join("; ");
        return "<tr><td>" + names[k] + "</td><td class=\"n\">$" + c.def + "/kW-yr</td><td class=\"n\">$" + c.lo + " to $" + c.hi + "</td><td class=\"s\">" + e(c.basis) + (src ? ". " + src : "") + "</td></tr>";
      }).join("") + "</tbody></table></div>";
  }
  var page = { SWEEP: SWEEP, LIB_LIMIT: LIB_LIMIT, libEntry: libEntry, libStatus: libStatus, MONEY: MONEY, moneyOnly: moneyOnly, priceErr: priceErr, partsWords: partsWords, exemplars: exemplars, costsHTML: costsHTML, newCost: newCost, ledger: ledger, costRange: costRange, adequacyWords: adequacyWords, sensitivity: sensitivity, kilo: kilo, mil: mil, price: price,
    loleTxt: loleTxt, ledgerCheck: ledgerCheck, ledgerNotes: ledgerNotes, sgn: sgn, CHART_NAME: "c2-sensitivity",
    GROUPS: [{ title: "The large load (a data center at Prairie Town)", fields: ["conn", "flex"], color: "var(--lx-demand)", hint: "It asks for 300 MW, flat, every hour: connect half or all of it this year, and let a fifth of it [[demand-response|curtail]] (cut its own use) when serving it would cost more than its bid." },
      { title: "What to build", fields: ["pk", "bat", "up"], color: "var(--lx-cc)", hint: "New [[peaker|peakers]] (gas plants that start within minutes) and a 4-hour battery at Prairie Town, and an [[uprate|uprate]] of Town–Metro: a higher transfer limit." },
      { title: "Operations and who pays", fields: ["res", "share"], color: "var(--lx-tier-4)", hint: "The [[reserves|operating reserve]] held every hour, and the share of the new costs the large load pays itself." },
      { title: "Costs you set (fixed ranges, a year per kW)", fields: ["cpk", "cbat", "cup"], color: "var(--lx-ink-2)", hint: "Each cost stays the same however much is built. Defaults: EIA's and NREL's values, as yearly payments (sources below)." }],
    RUBRIC: [{ id: "accounting", look: "Who pays and who benefits: the large load and other customers on one boundary, a year, 2025 dollars; CO₂ on its own line." },
      { id: "uncertainty", look: "The sensitivity chart attached: adequacy as the connected load grows, the plan held fixed; the Monte Carlo interval and the ledger's estimate error stated." },
      { id: "realism", look: "What the study leaves out: power-flow physics, forecast errors, one weather year in two, illustrative plants and costs; the notebook paragraph on three zones against one bus." },
      { id: "communication", look: "Two pages the planners can act on: the recommendation first, then the evidence and its limits.",
        levels: { proficient: "a two-page note with the plan link and the sensitivity chart: the recommendation first, then the evidence (adequacy against 0.1 days a year, the hard weeks, who pays), the sensitivity, the notebook paragraph and the limits" } }],
    RUBRIC_BAR: "the bar for this note",
    FIELDS: [{ key: "recommend", label: "Recommendation", hint: "Three or four sentences: how much connects, what to build, and why.", rows: 4, need: true, at: "top", min: 15 },
      { key: "whopays", label: "Who pays, and is it fair?", hint: "Two or three sentences: the large load, other customers, and the rule you chose.", rows: 3, need: true, min: 12 },
      { key: "risks", label: "What could still go wrong", hint: "Two or three sentences: what the model leaves out that could change your answer.", rows: 3, need: true, min: 12 },
      { key: "zones", label: "Three zones against one bus (M2's notebook)", hint: "One paragraph, after running M2's notebook: what three zones and two links change against its one bus (prices that part, uplift, who is short).", rows: 3, need: true, min: 12 }],
    TWO_PAGES: 1100 };
  if (typeof module !== "undefined" && module.exports) module.exports = page;
  if (typeof window === "undefined" || !window.LX || !window.LX.E2) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H, E2 = LX.E2, U = E2.ui;
  LX.mount("c2", function (live, data, root) {
    var cfg = data.e2_plains_grid, LIB = data.e2_c2_library, P = E2.prepare(cfg, { y2025: data.town_year, y2024: data.m03_capacity_expansion_2024, targets: data.cf_targets }, LX.townProfile);
    var S = E2.c2Schema(cfg), stub = null, adeq = null, chartFor = null, byKey = {}, K = page.ledgerCheck(cfg), lt = function (v) { return page.loleTxt(v, cfg.c2.adequacy.criterion); };
    LIB.plans.forEach(function (e) { byKey[e.k] = e; });
    var dayList = E2.daysOf(LX.ShareState.defaults(S), P, "year");   // the library's 26 days, in its order
    var rh = document.getElementById("c2-results"), fb = rh.querySelector(".lx-fallback"); if (fb) fb.hidden = true;
    var wrap = H("div", { class: "lx-sb e2-sb" }, live);
    var ctr = H("div", { class: "lx-sb-controls" }, wrap), side = H("div", { class: "lx-sb-side" }, wrap);
    var plan;
    var ss = LX.ShareState(side, { schema: S, id: "c2-link", onLoad: function (s) { plan = s; C.set(plan); show(); AD.changed(plan); DY.changed(plan); rn.refresh(); } });
    plan = ss.state;
    var C = U.controls(ctr, S, plan, page.GROUPS, change);
    var pre = H("div", { class: "lx-sb-presets", role: "group", "aria-label": "Start from a preset (only the choices it names change)" }, side);
    E2.c2presets.forEach(function (pr) { H("button", { class: "lx-btn ghost small", type: "button", text: pr.label, title: pr.note, onclick: function () { var p = U.copy(plan); for (var k in pr.state) p[k] = pr.state[k]; change(p); } }, pre); });
    var status = H("p", { class: "lx-hint c2-libst", role: "status", "aria-live": "polite" }, side), ro = H("div", { class: "lx-readouts e2-ro" }, side);
    H("p", { class: "lx-hint c2-grid", text: "The choices step across a precomputed grid of " + LIB.plans.length + " plans; each plan's year was solved with this engine on " + LIB.date + ", so its results show at once." }, side);
    side.insertBefore(ss.status, pre); side.appendChild(ss.el);
    var res = H("div", { class: "lx-sb-results c2-res" }, rh);
    function entry(st) { return byKey[E2.c2Key(st)]; }
    function base(st) { return cfg.precomputed.c2base[String(st.res)]; }
    function change(p) {
      plan = p; C.set(plan); ss.set(plan);
      var moneyOnly = !!adeq && page.moneyOnly(S, adeq.plan, p);
      if (moneyOnly) adeq.plan = U.copy(p); else AD.changed(plan);
      DY.changed(plan); show(); rn.refresh();
    }

    // ---- the year, from the library: what it says, who pays, the hard weeks
    function show() {
      var st = plan, e = entry(st);
      ro.innerHTML = ""; res.innerHTML = "";
      if (!e) { status.textContent = "This plan is not in the precomputed grid."; return; }
      var ls = page.libStatus(e);
      status.innerHTML = "<b>Precomputed with this engine on " + LX.esc(LIB.date) + "</b>: 12 representative days and the two hard weeks, " + LX.esc(ls.text) + ".";
      var L = page.ledger(st, e.year, base(st), cfg), W = e.weeks;
      [["Production cost, a year", page.mil(e.year.prod), ""], ["Other customers vs today", (L.delta >= 0 ? "+" : "") + page.mil(L.delta), L.delta > 0 ? "bad" : "good"],
        ["Unserved, hard weeks", kilo(W.shed) + " MWh", W.shed > 0.5 ? "bad" : "good"], ["Town–Metro at its limit", kilo(e.year.cong) + " h a year", ""]]
        .forEach(function (x) { var d = H("div", { class: "lx-readout " + x[2] }, ro); H("span", { text: x[0] }, d); H("b", { text: x[1] }, d); });
      // who pays
      var c1 = H("div", { class: "lx-xcard c2-ledger" }, res); H("h3", { text: "Who pays, a year (2025 dollars)" }, c1);
      var row = function (x) { return [page.mil(x.energy), page.mil(x.rent), page.mil(x.uplift), page.mil(x.fixed), { text: page.mil(x.total), cls: "tot" }]; };
      LX.Ledger(c1, { caption: "Each column a year, from the year's prices (conditional on the commitment) and the rules below.", columns: ["Who", "Energy at zone prices", "Congestion rent back", "Uplift", "New capacity and uprate", "Total"],
        rows: [{ head: "The large load", sub: kilo(L.Ell / 1000) + " GWh served", cells: row(L.ll) }, { head: "Other customers", sub: kilo(L.Eoth / 1000) + " GWh served", cells: row(L.oth) },
          { head: "Other customers, today's grid", sub: "no large load, nothing built", cells: row(L.b), total: true }], cls: "c2-led" });
      var cr = page.costRange(st, e.year, base(st), cfg);
      var ul = H("ul", { class: "e2-notes" }, c1); page.ledgerNotes(st, L, cr, K, cfg).forEach(function (t) { H("li", { html: LX.rich(t).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>") }, ul); });
      // the hard weeks
      var c2 = H("div", { class: "lx-xcard lx-sb-chart" }, res); H("h3", { text: "The two hard weeks, day by day" }, c2);
      [(W.shed > 0.5 ? "**" + kilo(W.shed) + " MWh unserved**" : "**No load unserved**") + " in the 14 days" + (W.rshort > 0.5 ? "; reserve short by " + kilo(W.rshort) + " MWh" : "") + "; highest price " + price(Math.max.apply(null, W.max)) + "/MWh (conditional on the commitment).",
        "Town–Metro at its limit for " + kilo(W.cong) + " of " + W.hours + " hours; the large load's average price " + (W.llAvg != null ? price(W.llAvg) + "/MWh" : "–") + (W.curtail > 0.5 ? "; it curtailed " + kilo(W.curtail) + " MWh" : "") + "."]
        .forEach(function (t) { H("p", { class: "e2-say" + (W.shed > 0.5 ? " bad" : ""), html: LX.rich(t).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>") }, c2); });
      townChart(c2, W);
      // the year
      var c3 = H("div", { class: "lx-xcard" }, res); H("h3", { text: "The year, estimated on 26 days" }, c3);
      var Y = ["Production cost " + page.mil(e.year.prod) + " (running, no-load, start-up; 2025 dollars); uplift " + page.mil(e.year.uplift) + ".",
        "Average price (conditional on the commitment): " + P.zones.map(function (z, i) { return z.name + " " + price(e.year.avg[i]); }).join(", ") + " per MWh.",
        "CO₂ " + kilo(e.year.co2 / 1000) + " kt (operating, from the fuel burned); wind and sun spilled " + kilo(e.year.spill / 1000) + " GWh.",
        "12 representative days, each weighted by its month's days, plus the two hard weeks day by day: 365 days in all.",
        "For the four plans checked against every day, production cost and CO₂ come close; Town's average price within " + page.priceErr(cfg) + "%; other customers' change, uplift and the hours at Town–Metro's limit less so (the check below)."];
      var ul3 = H("ul", { class: "e2-notes" }, c3); Y.forEach(function (t) { H("li", { text: t }, ul3); });
    }
    // Town's price in each hour of the two hard weeks (whole dollars, from the library)
    function townChart(host, W) {
      var v = W.town, n = v.length, cap = Math.max.apply(null, v), top = Math.max(60, Math.min(300, Math.ceil(cap * 1.15 / 20) * 20)), step = top <= 100 ? 20 : top <= 200 ? 40 : 60, ticks = [];
      for (var k = 0; k <= n; k += 48) ticks.push([k, k === n ? "" : E2.dayLabel(dayList[12 + k / 24].day), k === 0 ? "start" : null]);
      var marks = [];
      v.forEach(function (x, i) { if (x > top && (i === 0 || v[i - 1] <= top)) marks.push({ x: i + 0.5, y: top, label: price(x), kind: "dot", pos: "below", color: "var(--lx-bad)" }); });
      var pl = LX.Plot(host, { caption: true, text: "Text version: Town's price in every hour", box: true });
      pl.render({ x: { min: 0, max: n, ticks: ticks, ticksN: ticks.filter(function (t, i) { return i % 2 === 0; }) }, y: { min: 0, max: top, step: step, fmt: function (x) { return "$" + x; }, unit: "$/MWh" },
        caption: "Prairie Town's price, $/MWh, conditional on the commitment" + (cap > top ? " (the axis stops at $" + top + "; higher hours are marked)" : ""),
        lines: [{ values: v.map(function (x) { return Math.min(top, x); }), x0: 0, step: 1, color: "var(--lx-demand)", width: 2.2 }], marks: marks, legend: false,
        aria: "Prairie Town's hourly price over the two hard weeks; highest " + price(cap) + "/MWh.",
        text: { head: ["Hour", "Prairie Town, $/MWh"], rows: v.map(function (x, i) { return [E2.dayLabel(dayList[12 + Math.floor(i / 24)].day) + " " + E2.hh(i % 24), price(x)]; }) } });
    }

    // ---- one day, solved live (within the phone budget; a day that stops early can show its precomputed result)
    var dc = H("div", { class: "lx-xcard c2-day" }, rh);
    H("h3", { text: "Solve one day live" }, dc);
    H("p", { class: "lx-hint", html: LX.rich("Your browser commits the plants for one day with the [[mixed-integer-program|mixed-integer program]], then prices it with the dispatch [[linear-program|linear program]]: the same model the library used. A day of a hard week starts as the week's first day does.") }, dc);
    var opts = [];
    dayList.forEach(function (d, i) { if (d.rep || !d.carry) opts.push({ i: i, label: (d.rep ? "" : (d.period === "hot" ? "Peak-demand week starts, " : "Low-wind week starts, ")) + E2.dayLong(d.day) }); });
    var pick = H("label", { class: "c2-pick" }, dc); H("span", { text: "Day " }, pick);
    var sel = H("select", { class: "c2-sel" }, pick);
    opts.forEach(function (o) { H("option", { value: String(o.i), text: o.label }, sel); });
    sel.value = String(opts.filter(function (o) { return dayList[o.i].period === "hot"; })[0].i);
    var dRow = H("div", null, dc), dStale = H("p", null, dc), dRes = H("div", { class: "c2-dayres" }, dc), dStop = U.stopper(), fbBox = H("div", { class: "c2-dayfb" }, dc);
    function dayIdx() { return +sel.value; }
    var DY = LX.BenchRun(dRow, { label: "Solve this day live", state: function () { return plan; }, partial: true, results: [dRes], stale: dStale, busy: dStop.busy,
      solve: function (st, ctx) { var d = dayList[dayIdx()]; return E2.solve(st, P, { task: "day", only: { y: d.y, day: d.day }, signal: ctx.signal, attempt: ctx.attempt, solver: stubSolver() }); },
      render: function (R, st, r) { drawDay(R, r); },
      onDone: function (r) { offer(r); } });
    dStop.attach(DY);
    sel.addEventListener("change", function () { DY.changed(plan); fbBox.innerHTML = ""; });
    function stubSolver() { if (!stub) return null; var k = stub; stub = null; return function (m, o) {
      if (k === "fail") return Promise.resolve({ status: "error", ok: false, message: "solver stopped (demo)" });
      return LX.solver.solve(m, o).then(function (r) { if (r.values && m.variables.some(function (v) { return v.type === "integer"; })) { r.status = "time-limit"; r.ok = false; r.mipGap = 0.0123; } return r; }); }; }
    function libDay() { var e = entry(plan); return e ? e.days[dayIdx()] : null; }
    function drawDay(R, r) {
      dRes.innerHTML = ""; fbBox.innerHTML = "";
      var T = R.tot, ld = libDay(), same = ld && r.ok && Math.abs(ld[2] - Math.round(T.prod)) <= 1;
      H("p", { class: "e2-say", html: "<b>" + LX.esc(E2.dayLong(R.days[0].day)) + ":</b> production cost " + LX.esc(U.moneyK(T.prod)) + ", " + kilo(T.shed) + " MWh unserved, Town's highest price " + price(R.maxPrice[P.zix.T]) + "/MWh." +
        (ld ? " " + LX.esc(same ? "The same as the library's run of this day." : "The library's run of this day: " + U.moneyK(ld[2]) + ", " + kilo(ld[3]) + " MWh unserved (" + (ld[0] === "optimal" ? "optimal" : "not proven optimal") + ").") : "") }, dRes);
      var mc = H("div", { class: "c2-mapcard" }, dRes), map = U.ZoneMap(mc, P), best = 0, bp = -Infinity;
      R.days[0].hours.forEach(function (h, k) { if (h.z[P.zix.T].price > bp + 1e-9) { bp = h.z[P.zix.T].price; best = k; } });
      map.set(R, best);
      U.priceChart(H("div", { class: "lx-sb-chart" }, dRes), P, R);
      U.commitTable(H("div", null, dRes), P, R, 0);
    }
    // a live day that stopped early or failed: offer the library's result for that day
    function offer(r) {
      fbBox.innerHTML = "";
      if (!r || r.ok || r.status === "superseded" || r.status === "cancelled") return;
      var ld = libDay(); if (!ld) return;
      var b = H("button", { class: "lx-btn ghost small", type: "button", text: "Show the precomputed result for this day" }, fbBox);
      b.addEventListener("click", function () {
        fbBox.innerHTML = "";
        H("p", { class: "e2-say", html: "<b>Precomputed with this engine on " + LX.esc(LIB.date) + " (at most " + LIB.timeLimit + " s a solve):</b> " + LX.esc(E2.dayLong(dayList[dayIdx()].day) + ": production cost " + U.moneyK(ld[2]) + ", " + kilo(ld[3]) + " MWh unserved, Town's highest price " + price(ld[4]) + "/MWh; " +
          (ld[0] === "optimal" ? "reported optimal." : "not proven optimal (gap " + ((ld[1] || 0) * 100).toFixed(2) + "%).")) }, fbBox);
      });
    }

    // ---- adequacy, with the sensitivity: the plan held fixed as the connected load grows (today's grid precomputed)
    var ac = H("div", { class: "lx-xcard c2-adeq" }, rh);
    H("h3", { text: "Check adequacy: enough supply in nearly every hour?" }, ac);
    H("p", { class: "lx-hint", html: LX.rich("A seeded [[monte-carlo|Monte Carlo]]: " + cfg.c2.adequacy.years + " draw years of 2025's and 2024's weather, each plant up or out for a whole day at its [[forced-outage-rate|forced outage rate]]. Counts [[lole|loss-of-load]] days, [[lolh|hours]] and [[expected-unserved-energy|energy]]. The brief's criterion, 0.1 days a year, is PJM's one day in ten years (sources below). It runs live, at any connected size.") }, ac);
    var aRow = H("div", null, ac), aStale = H("p", null, ac), aRes = H("div", { class: "c2-adeq-res" }, ac), aStop = U.stopper(), aProg = H("p", { class: "lx-hint c2-prog", "aria-live": "polite" });
    var AD = LX.BenchRun(aRow, { label: "Check adequacy", state: function () { return plan; }, results: [aRes], stale: aStale, busy: function (on) { aStop.busy(on); if (!on) aProg.textContent = ""; },
      words: { ok: "Done: every draw year simulated (a Monte Carlo estimate, with its 90% interval)." },
      solve: function (st, ctx) {
        var jobs = [["plan", st]];
        SWEEP.forEach(function (mw) { if (mw !== st.conn) jobs.push(["sweep", Object.assign(U.copy(st), { conn: mw })]); });
        var out = { plan: null, today: cfg.precomputed.c2today, sweep: [] }, i = 0;
        function next() {
          if (i >= jobs.length) { out.sweep.push(Object.assign({ mw: st.conn }, out.plan)); return Promise.resolve({ status: "optimal", ok: true, kind: "simulation", results: out }); }
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
        [["This plan", lt(A.plan.lole), A.plan.lolh.toFixed(1), kilo(A.plan.eue), A.plan.curtailHours.toFixed(1) + " h"], ["Today's grid (precomputed)", lt(A.today.lole), A.today.lolh.toFixed(1), kilo(A.today.eue), "–"]], "c2-adeq-t");
      var rows = A.sweep.slice().sort(function (a, b) { return a.mw - b.mw; }), top = Math.max(0.2, Math.max.apply(null, rows.map(function (x) { return x.lole; })) * 1.2);
      var step = top <= 0.5 ? 0.1 : top <= 2 ? 0.5 : top <= 5 ? 1 : top <= 20 ? 5 : 10; top = Math.ceil(top / step) * step;
      var host = H("div", { class: "lx-sb-chart c2-sens" }, aRes); H("h4", { text: "Sensitivity: the connected load, with this plan's builds held fixed" }, host);
      var pl = LX.Plot(host, { caption: true, text: "Text version of the chart", box: true });
      pl.render({ x: { min: -50, max: 350, ticks: rows.map(function (x) { return [x.mw, kilo(x.mw) + " MW"]; }) }, y: { min: 0, max: top, step: step, fmt: function (v) { return v.toFixed(step < 1 ? 1 : 0); }, unit: "days/yr" }, height: 210, heightN: 190,
        caption: "Loss-of-load expectation, days a year, as more of the 300 MW connects",
        bars: rows.map(function (x) { return { x0: x.mw - 30, x1: x.mw + 30, y0: 0, y1: Math.max(x.lole, top * 0.004), color: x.lole > cfg.c2.adequacy.criterion ? "var(--lx-bad)" : "var(--lx-good)" }; }),
        refs: [{ y: cfg.c2.adequacy.criterion, label: "0.1 criterion", dash: "4 3" }],
        marks: rows.map(function (x) { return { x: x.mw, y: x.lole, label: lt(x.lole), kind: "dot", pos: "above" }; }),
        aria: "Loss-of-load expectation with the plan's builds fixed: " + rows.map(function (x) { return x.mw + " MW " + lt(x.lole); }).join(", ") + " days a year.",
        text: { head: ["Large load connected", "LOLE, days a year", "90% interval"], rows: rows.map(function (x) { return [kilo(x.mw) + " MW", lt(x.lole), lt(x.ci[0]) + " to " + lt(x.ci[1])]; }) } });
      H("p", { class: "lx-hint", text: "A Monte Carlo estimate from " + A.plan.years + " draw years (seed " + A.plan.seed + "): two weather years only, plant outages drawn day by day, plant data illustrative. A check of this plan, not a reliability forecast." }, host);
      // the note's chart: the reader downloads it (an SVG file, to their own device) and attaches it to the note
      var dl = H("p", { class: "c2-dl" }, host), stAt = U.copy(st);
      H("button", { class: "lx-btn small ghost", type: "button", text: "Download the chart (SVG) for your note", onclick: function () {
        var url = chartSVG(host, "Loss-of-load expectation, days a year, as more of the 300 MW connects; this plan's builds held fixed (C2, " + E2.c2Key(stAt) + ")");
        if (!url) return;
        var a = H("a", { href: url, download: page.CHART_NAME + "-" + E2.c2Key(stAt) + ".svg", hidden: true }, dl); a.click(); a.remove();
        chartFor = stAt; rn.refresh();
      } }, dl);
    }
    // the sensitivity chart as a standalone SVG: the page's colours and fonts written onto each element, a background and
    // a title line; returns an object URL (or a data URL)
    function chartSVG(host, title) {
      var svg = host.querySelector("svg[role=img]"); if (!svg) return null;
      var ns = "http://www.w3.org/2000/svg", c = svg.cloneNode(true), src = svg.querySelectorAll("*"), dst = c.querySelectorAll("*");
      var props = ["fill", "fill-opacity", "stroke", "stroke-width", "stroke-dasharray", "stroke-opacity", "opacity", "font-family", "font-size", "font-weight", "text-anchor", "visibility"];
      for (var i = 0; i < src.length; i++) { var cs = getComputedStyle(src[i]); props.forEach(function (q) { var v = cs.getPropertyValue(q); if (v) dst[i].setAttribute(q, v); }); dst[i].removeAttribute("class"); }
      var vb = (svg.getAttribute("viewBox") || "0 0 640 210").split(/\s+/).map(Number), W = vb[2], Hh = vb[3], top = 30;
      var out = document.createElementNS(ns, "svg"), bs = getComputedStyle(document.body), g = document.createElementNS(ns, "g");
      out.setAttribute("xmlns", ns); out.setAttribute("viewBox", "0 0 " + W + " " + (Hh + top)); out.setAttribute("width", W); out.setAttribute("height", Hh + top);
      var bg = document.createElementNS(ns, "rect"); bg.setAttribute("width", W); bg.setAttribute("height", Hh + top); bg.setAttribute("fill", bs.backgroundColor || "#ffffff"); out.appendChild(bg);
      var t = document.createElementNS(ns, "text"); t.setAttribute("x", 8); t.setAttribute("y", 19); t.setAttribute("font-size", "12"); t.setAttribute("font-family", bs.fontFamily); t.setAttribute("fill", bs.color); t.textContent = title; out.appendChild(t);
      g.setAttribute("transform", "translate(0," + top + ")"); while (c.firstChild) g.appendChild(c.firstChild); out.appendChild(g);
      var txt = new XMLSerializer().serializeToString(out), W0 = window;
      return W0.Blob && W0.URL && W0.URL.createObjectURL ? W0.URL.createObjectURL(new W0.Blob([txt], { type: "image/svg+xml" })) : "data:image/svg+xml;charset=utf-8," + encodeURIComponent(txt);
    }

    // ---- the note
    var nh = document.getElementById("c2-note"); nh.innerHTML = "";
    var rn = LX.ReportNote(H("div", { class: "lx-xcard" }, nh), { id: "c2-note", code: "C2", title: "Your two-page study note", lede: "Write three parts in your own words; the plan, its numbers, the assumptions and the sensitivity come from the precomputed year and your adequacy check.",
      fields: page.FIELDS,
      checks: ["link", "run", "fields", "assumptions", "sensitivity",
        { id: "pages", label: "Fits on two pages (about " + kilo(page.TWO_PAGES) + " words)", test: function (note, words) { return LX.ReportNote.countWords(LX.ReportNote.compose(note, words, page.FIELDS, { format: "text" })) <= page.TWO_PAGES; } },
        { id: "adequacy", label: "Adequacy checked on this plan (Check adequacy)", test: function () { return !!adeq && LX.ShareState.same(S, adeq.plan, plan); } },
        { id: "chart", label: "Sensitivity chart downloaded for this plan, to attach to the note", test: function () { return !!chartFor && page.moneyOnly(S, chartFor, plan); } },   // the chart does not depend on the costs or the share
        { id: "brief", label: "The brief met: within 0.1 loss-of-load days a year with the load as connected", test: function () { return !!adeq && LX.ShareState.same(S, adeq.plan, plan) && adeq.A.plan.lole <= cfg.c2.adequacy.criterion; } }],
      get: function () {
        var st = plan, e = entry(st); if (!e) return null;
        var L = page.ledger(st, e.year, base(st), cfg), W = e.weeks, ls = page.libStatus(e);
        var n = { heading: "The Plains Grid: " + kilo(st.conn) + " MW of the large load connected" + (st.pk ? ", " + st.pk * 50 + " MW of new peakers" : "") + (st.bat ? ", a " + kilo(st.bat) + " MW battery" : "") + (st.up ? ", " + kilo(st.up) + " MW more on Town–Metro" : ""),
          made: "the Grid Room's engine E2 (unit commitment as a mixed-integer program, prices from the dispatch linear program), on capstone C2",
          link: ss.url(), run: { ok: ls.ok, stale: false, text: "precomputed with this engine on " + LIB.date + ": 12 representative days and the two hard weeks (365 days of weight), " + ls.text },
          plan: S.fields.map(function (f) { return { label: f.label, value: U.fmtOf(f)(st[f.id]) }; }),
          results: [{ label: "Production cost", value: page.mil(e.year.prod) + " a year", note: "running, no-load and start-up; 2025 dollars; illustrative plants" },
            { label: "Other customers against today's grid", value: (L.delta >= 0 ? "+" : "") + page.mil(L.delta) + " a year", note: "26-day estimate; with the full-year check's error, " + page.sgn(L.delta + K.err25.lo) + " to " + page.sgn(L.delta + K.err25.hi) + "; " + page.partsWords(L) },
            { label: "The large load pays", value: page.mil(L.ll.total) + " a year", note: kilo(L.Ell / 1000) + " GWh served; " + st.share + "% of new costs paid directly" },
            { label: "Hard weeks: unserved load", value: kilo(W.shed) + " MWh", note: "peak-demand week and low-wind winter week; highest price " + price(Math.max.apply(null, W.max)) + "/MWh, conditional on the commitment" },
            { label: "Town–Metro at its limit", value: kilo(e.year.cong) + " hours a year", note: "the 26-day estimate finds only part of these hours (see its check)" },
            { label: "CO₂", value: kilo(e.year.co2 / 1000) + " kt a year", note: "operating, from the fuel burned (EIA coefficients)" }],
          assumptions: ["The Plains Grid, its plants, links and costs are fictional and illustrative; 2025 dollars", "Demand, wind and sun follow the Southwest Power Pool's 2025 shapes; the three zones share that weather",
            "The year is 12 representative days and two hard weeks; each day is committed alone, knowing its load, wind and sun exactly",
            "Prices are conditional on the commitment; uplift and congestion rent are shared by energy", "A zone's unserved load is shared by its customers in proportion to their load",
            "Costs stay the same however much is built (the ranges are the reader's)"],
          sensitivity: adeq && LX.ShareState.same(S, adeq.plan, st) ? page.sensitivity(adeq.A, st) : "Run Check adequacy on this plan for the sensitivity line.",
          limits: ["A transport model: no power-flow physics, losses or voltage", "No forecast errors or ramp limits in the commitment; outages only in the adequacy check",
            "Reserves are pooled across the region: the model does not check whether they can reach a zone after a disturbance",
            "Two weather years and illustrative outage rates: the adequacy check is a teaching estimate", "One study year: it does not test a load that arrives late, smaller or never"] };
        if (adeq && LX.ShareState.same(S, adeq.plan, st)) n.results.push({ label: "Loss-of-load expectation", value: lt(adeq.A.plan.lole) + " days a year", note: "90% interval " + lt(adeq.A.plan.ci[0]) + " to " + lt(adeq.A.plan.ci[1]) + "; today's grid " + lt(adeq.A.today.lole) + "; criterion 0.1" + (adeq.A.plan.lole <= 0.1 && adeq.A.plan.ci[1] > 0.1 ? " (the interval crosses it)" : "") });
        return n;
      } });

    // ---- the self-check: two notes (precomputed numbers of a reference plan) and the rubric
    var ex = document.getElementById("exemplars"), exFb = ex.querySelector(".lx-fallback");
    if (exFb) exFb.hidden = true;
    LX.Exemplars(H("div", { class: "lx-xcard" }, ex), cfg.precomputed.c2ex.exemplars);
    var rbh = document.getElementById("c2-rubric"); rbh.innerHTML = "";
    LX.Rubric(H("div", { class: "lx-xcard" }, rbh), { id: "c2-rubric", code: "C2", title: "Rate your note against the rubric", competences: page.RUBRIC, bar: page.RUBRIC_BAR });

    show(); rn.refresh();
    LX.demo(root, function (s) {
      if (s === "mid") { DY.run(plan); return { view: "mid" }; }
      if (s === "done") {
        change(Object.assign(U.copy(plan), E2.c2presets[1].state, { share: 50 }));
        AD.run(plan);
        rn.set({ recommend: "Connect the full 300 MW this year with six 50 MW peakers at Prairie Town and 300 MW more on Town–Metro. Without them the load cannot be carried through the hard weeks, and the grid falls far short of 0.1 loss-of-load days a year.",
          whopays: "The large load pays half of the new costs directly; the rest is spread by energy. Other customers still see a change, which the ledger shows against today's grid.",
          risks: "The study has two weather years, no power-flow physics and illustrative plants; a colder winter or a late peaker could change the answer." });
        return { view: "done" };
      }
      if (s === "fail") { stub = "fail"; DY.run(plan); return { view: "fail" }; }
      if (s === "tl") { stub = "tl"; DY.run(plan); return { view: "tl" }; }
      return null;
    });
  });
})();
