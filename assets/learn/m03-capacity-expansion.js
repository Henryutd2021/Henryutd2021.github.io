// m03-capacity-expansion.js — Modeler lesson M3, "What should be built? Capacity expansion with representative periods,
// validated" (model-lab: step cards with a solver run).
//
// Engine: lesson 13's planning LP, the shared component LX.townPlan (assets/learn/components/planengine.js, bundled into
// learn.js; in Node it is required). This file extends it through its public API and duplicates none of it:
//   - the same town, costs and year (13-capstone.json, town_year.json, cf_targets.json);
//   - more choices of representative weeks (selectWeeks' perSeason and extremes options): 4, 7, 8, 11 or 15 weeks;
//   - three treatments of the battery's state between weeks (TP.link()): "linked" (the engine's own: a calendar chain of 52
//     start levels, after Kotzur et al. 2018), "cyclic" (each representative week ends where it starts, so no energy
//     moves between weeks) and "free" (no rule between weeks: each week may start at any level, so stored energy can
//     appear from nothing);
//   - validation: the chosen plan re-dispatched hour by hour on all 8,760 hours of 2025 (fullYearModel with the plan
//     fixed) and on a second weather year, 2024 (data/m03-capacity-expansion-2024.json: SPP's 2024 shapes, scaled to the
//     same yearly demand energy and the same wind and solar capacity factors as 2025, so only the hourly pattern differs);
//   - stated error measures (TP.errors(), on TP.readCheck() of the full-year run): the cost estimate against the full-year optimum (precomputed: about a minute in
//     Node), and, for the re-dispatched plan, unserved energy (MWh, hours, largest shortfall) and CO2 against the cap.
// link(), readCheck() and errors() are the planning engine's, as is the 52-week calendar strip (LX.WeekStrip,
// components/weekstrip.js); this file keeps no copy.
// Data: assets/learn/data/m03-capacity-expansion.json (the lesson's choices and its reference results; the Node test
// re-solves every reference number and --write rewrites them). Every number on the page is checked by
// _tests/learn/test_m03-capacity-expansion.js with the vendored HiGHS; the notebook rebuilds the model in SciPy.
(function () {
  "use strict";
  var TP = typeof module !== "undefined" && module.exports && typeof require === "function" ? require("./components/planengine.js")
    : (typeof window !== "undefined" && window.LX && window.LX.townPlan);
  if (!TP) throw new Error("m03: the planning engine (LX.townPlan, components/planengine.js in learn.js) must load first");
  var HPW = TP.HPW, WEEKS = TP.WEEKS;

  // ---------------------------------------------------------------- inputs
  // the second weather year: same yearly demand energy as the 2025 town (demand peak follows the weather), wind and solar
  // at the same capacity-factor targets, by the same method (LX.townProfile "scale")
  function prepareYear2(year2, targets, cfg, profile, Y) {
    var e1 = 0, e2 = 0, i;
    for (i = 0; i < Y.demand.length; i++) e1 += Y.demand[i];
    for (i = 0; i < year2.demand.length; i++) e2 += year2.demand[i] / 1000;
    var c2 = {}; for (var k in cfg) c2[k] = cfg[k];
    c2.town = { demandPeakMW: e1 / e2, profileMethod: cfg.town.profileMethod };
    return TP.prepareYear(year2, targets, c2, profile);
  }
  // the costs, with the what-if energy cost of storage ($ per kWh) when given
  function costsWith(cfg, energyCapex) {
    if (energyCapex == null) return TP.costs(cfg, {});
    var c2 = JSON.parse(JSON.stringify(cfg)); c2.techs.battery.energyCapex = energyCapex;
    return TP.costs(c2, {});
  }
  function weeksOf(Y, cfg, set) {
    return TP.selectWeeks(Y, { perSeason: set.perSeason, extremes: set.extremes, netRef: cfg.weeks.netRef });
  }
  // everything the page and the test need, from the loaded data files
  function prepare(cfg, D, year, targets, year2, profile) {
    var Y = TP.prepareYear(year, targets, cfg, profile), RW = {};
    D.sets.forEach(function (s) { RW[s.id] = null; });
    return {
      cfg: cfg, D: D, Y: Y, Y2: year2 ? prepareYear2(year2, targets, cfg, profile, Y) : null,
      C: TP.costs(cfg, {}), Cw: costsWith(cfg, D.storage.energyCapex),
      weeks: function (id) { if (!RW[id]) RW[id] = weeksOf(Y, cfg, setOf(D, id)); return RW[id]; }
    };
  }
  function setOf(D, id) { return D.sets.filter(function (s) { return s.id === id; })[0]; }

  // ---------------------------------------------------------------- the battery between weeks
  // TP.link(m, RW, mode) (planengine.js): "linked" (the engine's own calendar chain),
  // "cyclic" (each representative week ends where it starts) or "free" (no rule between weeks)
  // the planning LP on representative weeks: o = {cap (t CO2 a year), mode}
  function planModel(C, RW, o) { return TP.link(TP.weekModel(C, RW, { cap: o.cap }), RW, o.mode); }
  // the checks: a fixed plan run hour by hour on a whole year. Unserved demand is allowed at the penalty, which the
  // reported cost (TP.summarize) leaves out, and no CO2 cap is enforced: the check measures the plan's own CO2
  function checkModel(C, Y, plan) { return TP.fullYearModel(C, Y, { plan: plan }); }
  // the reference: the same LP with every one of the 8,760 hours (heavy: precomputed for the page)
  function fullModel(C, Y, cap) { return TP.fullYearModel(C, Y, { cap: cap }); }

  // ---------------------------------------------------------------- reading results
  // sizes rounded to 0.001 MW (MWh), so that the page, the reference block and the notebook check exactly the same plan
  function roundPlan(p) { var o = {}; TP.KEYS.forEach(function (k) { o[k] = Math.round(p[k] * 1000) / 1000; }); return o; }
  // a solved planning LP: plan, cost, CO2 and storage use, as estimated from the weeks
  function readPlan(C, RW, r, o) {
    var s = TP.summarize(C, TP.periodsOf(RW), r, { cap: o.cap });
    return { plan: roundPlan(s.plan), cost: s.cost, co2: s.co2, fixed: s.fixed, fuel: s.fuel, dis: s.energy.dis, capDual: s.capDual,
             spilled: s.spilledShare, hours: RW.reps.length * HPW, weeks: RW.reps.length };
  }
  // a fixed plan's full-year run (TP.readCheck: totals and MWh unserved in each calendar week) and the stated error
  // measures (TP.errors: cost gap, CO2 over the cap, estimate error) are in the planning engine
  // the weeks as the page lists them: kind, season, how many calendar weeks each stands for, its weight and start date
  function weekList(RW) {
    return RW.reps.map(function (r, p) {
      return { p: p, week: r.week, kind: r.kind, season: r.season, n: r.n, weight: r.weight, start: r.start, members: r.members };
    });
  }
  // which representative week stands for each calendar week (the strip)
  function calendar(RW) { return RW.chrono.slice(); }
  // the battery's net change over each representative week (MWh: its level after hour 168, relative to the week's start;
  // the engine's variable s<p>_167). Linked can carry energy from week to week; cyclic forces every one to zero
  function netChanges(r, RW) { return RW.reps.map(function (rep, p) { return (r.values && r.values["s" + p + "_" + (HPW - 1)]) || 0; }); }
  function largest(a) { return a.reduce(function (m, v) { return Math.max(m, Math.abs(v)); }, 0); }
  // two plans rounded by roundPlan() are the same plan (step 8 then shows the stored full-year run of that plan)
  function samePlan(a, b) { return !!a && !!b && TP.KEYS.every(function (k) { return Math.abs(a[k] - b[k]) < 5e-4; }); }
  // the shortage penalty a full-year run leaves out of its reported cost ($ a year): unserved MWh x the penalty per MWh
  function penalty(C, c) { return c.unserved * C.voll; }

  // ---------------------------------------------------------------- words and numbers the page states (pure, for the test)
  var fm = {
    musd: function (v) { return "$" + (v / 1e6).toFixed(1) + "M"; },
    musd2: function (v) { return "$" + (v / 1e6).toFixed(2) + "M"; },
    kt: function (v) { return Math.round(v / 1e3).toLocaleString("en-US") + " kt"; },
    mwh: function (v) { return Math.round(v).toLocaleString("en-US") + " MWh"; },
    mw: function (v) { return Math.round(v).toLocaleString("en-US") + " MW"; },
    pct: function (x, d) { var s = (x * 100).toFixed(d == null ? 1 : d); return (s === "-0.0" || s === "-0" ? s.slice(1) : s) + "%"; },
    spct: function (x, d) { var s = (x * 100).toFixed(d == null ? 1 : d); if (/^-?0(\.0+)?$/.test(s)) return s.replace("-", "") + "%"; return (x > 0 ? "+" : "−") + s.replace("-", "") + "%"; },
    hours: function (n) { return n.toLocaleString("en-US") + (n === 1 ? " hour" : " hours"); }
  };

  // link, yearPeriods, readCheck and errors are the engine's own functions (TP.*), listed here for the lesson's callers
  var model = { HPW: HPW, WEEKS: WEEKS, TP: TP, prepare: prepare, prepareYear2: prepareYear2, costsWith: costsWith, weeksOf: weeksOf, setOf: setOf,
                link: TP.link, roundPlan: roundPlan, planModel: planModel, checkModel: checkModel, fullModel: fullModel, yearPeriods: TP.yearPeriods,
                readPlan: readPlan, readCheck: TP.readCheck, errors: TP.errors, weekList: weekList, calendar: calendar,
                netChanges: netChanges, largest: largest, samePlan: samePlan, penalty: penalty, fm: fm };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX || !window.LX.H) return;

  // ================================================================ the page (component library: window.LX)
  var LX = window.LX, H = LX.H, LESSON = "m03-capacity-expansion", KEY = "m3-own";
  var TECH = [["wind", "Wind", "var(--lx-wind)", "MW"], ["solar", "Solar", "var(--lx-solar)", "MW"], ["cc", "Gas combined-cycle", "var(--lx-cc)", "MW"],
              ["pk", "Gas peaker", "var(--lx-pk)", "MW"], ["nuc", "Nuclear", "var(--lx-nuc)", "MW"], ["bat", "Battery", "var(--lx-bat)", "MW / MWh"]];
  function css() {
    if (document.getElementById("m3-css")) return;
    H("style", { id: "m3-css", text: [
      ".lx-interactive.m3-lab{max-width:980px}",
      ".m3-lab .lx-stepcard{grid-template-columns:minmax(0,1fr)}.m3-lab .lx-step-act{grid-template-columns:minmax(0,1fr)}.m3-lab .lx-stepcard>*,.m3-lab .lx-step-act>*{min-width:0}",
      ".m3-lab .lx-stepcard{gap:12px}.m3-lab .lx-step-text{max-width:62ch}",
      ".m3-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}",
      ".m3-kpis{display:flex;flex-wrap:wrap;gap:8px}",
      ".m3-kpi{display:grid;padding:8px 12px;border:1px solid var(--lx-line);border-radius:10px;background:var(--lx-surface-2);min-width:112px}",
      ".m3-kpi small{font-size:12px;color:var(--lx-ink-3);font-family:var(--lx-f-display);letter-spacing:.04em;text-transform:uppercase}",
      ".m3-kpi b{font-family:var(--lx-f-mono);font-size:17px;font-weight:600;color:var(--lx-ink)}.m3-kpi.bad b{color:var(--lx-bad)}",
      ".m3-tbl{overflow-x:auto;max-width:100%}.m3-tbl table{width:100%;border-collapse:collapse;font-size:14px}",
      ".m3-tbl th,.m3-tbl td{padding:5px 6px;border-bottom:1px solid var(--lx-line);text-align:right;white-space:nowrap;font-weight:400}",
      ".m3-tbl th:first-child,.m3-tbl td:first-child{text-align:left;white-space:normal}",
      ".m3-tbl thead th{font-family:var(--lx-f-display);font-size:12px;letter-spacing:.05em;text-transform:uppercase;color:var(--lx-ink-3);vertical-align:bottom}",
      ".m3-tbl td{font-family:var(--lx-f-mono);font-variant-numeric:tabular-nums}.m3-tbl td:first-child{font-family:var(--lx-f-body)}",
      ".m3-tbl td.bad{color:var(--lx-bad)}.m3-tbl td.ok{color:var(--lx-good)}.m3-tbl tr.pre td:first-child::after{content:' · precomputed';color:var(--lx-ink-3);font-size:12px}",
      ".m3-tbl td i{display:inline-block;width:9px;height:9px;border-radius:3px;background:var(--c);margin-right:6px;vertical-align:baseline}",
      ".m3-verdict{margin:0;padding:0;list-style:none;display:grid;gap:4px;font-size:15px}.m3-verdict li{display:flex;gap:8px;align-items:flex-start}",
      ".m3-verdict .ok{color:var(--lx-good)}.m3-verdict .no{color:var(--lx-bad)}.m3-verdict .lx-ic{flex:none;margin-top:3px}",
      ".m3-formula{font-family:var(--lx-f-mono);font-size:14.5px;padding:10px 12px;border:1px solid var(--lx-line);border-radius:10px;background:var(--lx-surface-2);overflow-x:auto;white-space:nowrap}",
      ".m3-formula var{font-family:var(--lx-f-body);font-style:italic}.m3-formula .w{color:var(--lx-accent);font-weight:700}",
      ".m3-bars{display:grid;gap:6px;margin:0;padding:0;list-style:none}",
      ".m3-bars li{display:grid;grid-template-columns:minmax(7em,9.5em) minmax(0,1fr) 4.2em;gap:8px;align-items:center;font-size:14px}",
      ".m3-bars .bar{height:12px;border-radius:6px;background:var(--lx-surface-3);overflow:hidden}.m3-bars .bar i{display:block;height:100%;background:var(--lx-accent)}",
      ".m3-bars b{font-family:var(--lx-f-mono);font-weight:600;text-align:right}",
      ".m3-note{font-size:13.5px;color:var(--lx-ink-3)}",
      ".m3-key,.m3-info{margin:0;padding:0;list-style:none;display:grid;gap:3px;font-size:14px;color:var(--lx-ink-2)}",
      ".m3-key var{font-family:var(--lx-f-body);font-style:italic}.m3-key b,.m3-info b{color:var(--lx-ink);font-weight:600}",
      ".m3-rules{margin:0;display:grid;grid-template-columns:max-content minmax(0,1fr);gap:4px 12px;font-size:15px}",
      ".m3-rules dt{font-weight:600;color:var(--lx-ink)}.m3-rules dd{margin:0;color:var(--lx-ink-2)}",
      "@media (max-width:560px){.m3-tbl table{font-size:13px}.m3-tbl th,.m3-tbl td{white-space:normal;padding:4px 3px}.m3-tbl .ph{display:none}}"
    ].join("\n") }, document.head);
  }
  function kpi(host, label, value, bad) { var k = H("div", { class: "m3-kpi" + (bad ? " bad" : "") }, host); H("small", { text: label }, k); H("b", { text: value }, k); return k; }
  function capKt(D) { return D.cap; }
  function batText(p) { return Math.round(p.bp) + " / " + Math.round(p.be); }

  // ---------------------------------------------------------------- tables
  // head: column titles; a title "~Name" is hidden on phones (its cells too)
  function table(host, head, rows, label) {
    var w = H("div", { class: "m3-tbl", tabindex: "0", role: "region", "aria-label": label }, host);
    var t = H("table", null, w), hr = H("tr", null, H("thead", null, t)), ph = head.map(function (x) { return x.charAt(0) === "~"; });
    head.forEach(function (x, i) { H("th", { scope: "col", class: ph[i] ? "ph" : "", text: x.replace(/^~/, "") }, hr); });
    var b = H("tbody", null, t);
    rows.forEach(function (r) {
      var tr = H("tr", { class: r.cls || "" }, b);
      r.cells.forEach(function (c, i) { var td = H("td", { class: ((c && c.cls) || "") + (ph[i] ? " ph" : "") }, tr); if (c && c.html != null) td.innerHTML = c.html; else td.textContent = nb(c && c.text != null ? c.text : c, i); });
    });
    return w;
  }
  // keep a number with its unit on one line (table cells may wrap on phones)
  function nb(t, i) { return i ? String(t).replace(/(\d) (kt|MWh|MW|h)\b/g, "$1\u00a0$2") : t; }
  function planTable(host, plan) {
    return table(host, ["Built", "Size"], TECH.map(function (t) {
      return { cells: [{ html: "<i style='--c:" + t[2] + "'></i>" + t[1] }, t[0] === "bat" ? batText(plan) + " " + t[3] : fm.mw(plan[t[0]])] };
    }), "What the plan builds");
  }

  // ---------------------------------------------------------------- the lesson
  LX.mount(LESSON, function (live, data, root) {
    css(); root.classList.add("m3-lab");
    var cfg = data["13_capstone"], D = data.m03_capacity_expansion, R = D.reference;
    var S = prepare(cfg, D, data.town_year, data.cf_targets, data.m03_capacity_expansion_2024, LX.townProfile);
    var cap = capKt(D) * 1e3, own = LX.store.get(KEY, {}) || {};
    function remember(k, v) { own[k] = v; LX.store.set(KEY, own); }
    var res = {};   // live results by set id: {est, y25, y24, size, ms}
    function sizeOf(id) { var m = planModel(S.C, S.weeks(id), { cap: cap }); return { cols: m.variables.length, rows: m.constraints.length }; }
    // the plan for a set: solved here when the set is light enough for a phone, else the reference (precomputed, labelled)
    function plan(id) {
      if (res[id] && res[id].est) return Promise.resolve(res[id]);
      var set = setOf(D, id), RW = S.weeks(id);
      res[id] = res[id] || {};
      if (!set.live) {
        var p = R.sets[id];
        res[id].est = { plan: p.plan, cost: p.cost, co2: p.co2, weeks: p.weeks, hours: p.hours }; res[id].pre = true; res[id].size = { cols: p.cols, rows: p.rows };
        res[id].y25 = p.y2025; res[id].y24 = p.y2024;
        return Promise.resolve(res[id]);
      }
      var m = planModel(S.C, RW, { cap: cap });
      return LX.solver.solve(m, { timeLimit: 20, key: "m3-" + id, label: "m3-plan" }).then(function (r) {
        if (!r.ok) { res[id].fail = r; return res[id]; }
        res[id].r = r; res[id].est = readPlan(S.C, RW, r, { cap: cap }); res[id].size = { cols: m.variables.length, rows: m.constraints.length }; res[id].ms = r.ms.roundTrip;
        return res[id];
      });
    }
    // the plan of a set run on a whole year (2025: S.Y, 2024: S.Y2)
    function check(id, y) {
      var k = y === 2024 ? "y24" : "y25";
      return plan(id).then(function (x) {
        if (x[k] || !x.est) return x;
        var Yx = y === 2024 ? S.Y2 : S.Y;
        return LX.solver.solve(checkModel(S.C, Yx, x.est.plan), { timeLimit: 20, key: "m3-check-" + id + k, label: "m3-check" }).then(function (r) {
          x["r" + k] = r; if (r.ok) x[k] = TP.readCheck(S.C, Yx, r, x.est.plan); else x.fail = r;
          return x;
        });
      });
    }
    // what a full-year run's cost counts: plants and fuel only
    var SPEND = "Spending: building and running the plants. The re-run enforces no CO₂ cap and does not price unserved demand.";
    function verdict(host, x, k, year) {
      var c = x[k], e = TP.errors(x.est, c, cap, null), ul = H("ul", { class: "m3-verdict" }, host);
      function line(good, html) { var li = H("li", null, ul); H("span", { class: good ? "ok" : "no", html: LX.icon(good ? "check" : "question") }, li); H("span", { html: html }, li); }
      line(Math.abs(e.costGap) <= 0.02, "Spending: <b>" + fm.musd(c.cost) + "</b> a year on all of " + year + ", " + fm.spct(e.costGap) + " on the estimate.");
      line(e.co2ok, "CO₂: <b>" + fm.kt(c.co2) + "</b> against the " + D.cap + " kt cap (" + fm.spct(e.co2Over) + ").");
      line(e.served, e.served ? "Demand: every hour served." : "Demand: <b>" + fm.mwh(c.unserved) + "</b> unserved in " + fm.hours(c.hours) + ", up to " + fm.mw(c.maxShort) + " short.");
      H("p", { class: "m3-note", text: SPEND + (e.served ? "" : " At the $" + S.C.voll.toLocaleString("en-US") + " per MWh shortage penalty it would add " + fm.musd(penalty(S.C, c)) + ".") }, host);
      return e;
    }
    var SETROWS = ["typ4", "wk7", "typ8", "wk11", "wk15"];
    function resultsTable(host, ids) {
      host.innerHTML = "";
      var t = table(host, ["Weeks", "~Modelled hours", "~LP columns", "Estimate", "~Full year: spending", "Full year: CO₂", "Full year: unserved"], ids.filter(function (id) { return res[id] && res[id].y25; }).map(function (id) {
        var x = res[id], c = x.y25, set = setOf(D, id);
        return { cls: x.pre ? "pre" : "", cells: [set.label, String(x.est.hours.toLocaleString("en-US")), x.size.cols.toLocaleString("en-US"), fm.musd(x.est.cost), fm.musd(c.cost),
          { text: fm.kt(c.co2), cls: c.co2 > cap + 0.5 ? "bad" : "ok" }, { text: c.unserved < 0.5 ? "0" : fm.mwh(c.unserved) + " · " + c.hours + " h", cls: c.unserved < 0.5 ? "ok" : "bad" }] };
      }), "Each way of choosing the weeks: its estimate and its full-year check");
      H("p", { class: "m3-note", text: SPEND }, host);
      return t;
    }

    // ---------------------------------------------------------------- solves that fail
    // A solve can stop at its time limit on a slow phone, or the solver can fail to load. The step then says so in plain
    // words, clears its busy state (Next and the step's button work again) and offers "Try again"; results already
    // solved are kept, so a retry solves only what is missing.
    // the first failed solve among the results a step needs (need: [[set id, "est" | "y25" | "y24"]]), or null
    function firstFail(need) {
      for (var i = 0; i < need.length; i++) {
        var x = res[need[i][0]];
        if (!x || !x[need[i][1]]) return (x && x.fail) || { status: "error", ok: false, message: "no result" };
      }
      return null;
    }
    // one solver action of a step. o: { api, st (an LX.SolverStatus), host, go (the step's own button, or null), job () ->
    // Promise, failed () -> the first failed solve or null, show () -> the results }. Returns the action, for the step's
    // button or prediction and for "Try again". LX.SolveStep (components/solvestep.js, shared by M3, A8 and
    // M4); the note keeps the class m3-fail and M3's last sentence.
    function action(o) {
      o.cls = "m3-fail"; o.kept = " What you did before is kept; on a slow device, close other tabs first.";
      return LX.SolveStep.action(o);
    }

    var steps = [
      // 1 weights
      { text: "The solver now chooses what to build (seven sizes, paid every year) and how to run it, but it sees only a few weeks. How do a few weeks stand for a year?",
        build: function (act, api) {
          var f, key, pr = LX.Predict(act, { id: "m3-weights", fresh: true, q: "How does the goal turn a few weeks of running costs into a year's?", answer: "weight",
            options: [{ value: "weight", label: "Weight each modelled hour by the hours of the year it stands for" }, { value: "52", label: "Multiply every week's cost by 52" }, { value: "none", label: "Leave it: a few weeks are close enough" }],
            feedback: { weight: "Each modelled hour counts as many hours of the year as it stands for.", "52": "A typical winter week does not stand for all 52 weeks.", none: "A year of building costs against a few weeks of fuel would make plants that are cheap to run look far too good." },
            onPick: function () {
              pr.reveal(); f.hidden = false; key.hidden = false; api.done();
              api.saw("Build costs count once a year. Each modelled hour's running cost counts **w** times: its [[period-weight|weight]], the hours of 2025 it stands for.");
            } });
          f = H("div", { class: "m3-formula", hidden: true, role: "math", "aria-label": "minimise, over the sizes K, the sum of yearly cost f times size K, plus the sum over modelled weeks p of the weight w p times the running cost of every hour of that week" }, act);
          f.innerHTML = "min &nbsp;Σ<sub><var>i</var></sub> <var>f</var><sub><var>i</var></sub> <var>K</var><sub><var>i</var></sub> &nbsp;+&nbsp; Σ<sub><var>p</var></sub> <span class='w'><var>w</var><sub><var>p</var></sub></span> Σ<sub><var>h</var></sub> (running cost in hour <var>h</var> of week <var>p</var>)";
          // the symbol key beside the first formula
          key = H("ul", { class: "m3-key", hidden: true, "aria-label": "The symbols in the formula" }, act);
          [["<var>K</var><sub><var>i</var></sub>", "size built of plant <var>i</var>: MW (battery energy: MWh)"],
           ["<var>f</var><sub><var>i</var></sub>", "its yearly cost: $ per MW-year (battery energy: per MWh-year)"],
           ["<var>p</var>, <var>h</var>", "a representative week, and an hour of it"],
           ["<var>w</var><sub><var>p</var></sub>", "the week's weight: hours of the year per modelled hour"]].forEach(function (s) { H("li", { html: "<b>" + s[0] + "</b> " + s[1] }, key); });
        } },
      // 2 the weeks and their weights
      { text: "Each [[representative-period|representative week]] stands for several calendar weeks; its weight says how many. Pick two of the five ways of choosing them and compare the calendars.",
        build: function (act, api) {
          var seg = H("div", { class: "lx-seg", role: "group", "aria-label": "Ways of choosing the representative weeks" }, act);
          var strip = LX.WeekStrip(act, S.Y), seen = {};
          var bs = D.sets.map(function (s) { return H("button", { type: "button", "aria-pressed": "false", text: s.short, onclick: function () { pick(s.id); } }, seg); });
          function pick(id) {
            var RW = S.weeks(id), set = setOf(D, id);
            bs.forEach(function (b, i) { b.setAttribute("aria-pressed", D.sets[i].id === id ? "true" : "false"); });
            strip.draw(RW, null); seen[id] = 1;
            var wsum = RW.reps.reduce(function (a, r) { return a + r.weight * HPW; }, 0);
            var x = RW.reps.filter(function (r) { return r.kind !== "season"; }).length;
            var line = "**" + set.label + "**: " + RW.reps.length + " weeks, " + (RW.reps.length * HPW).toLocaleString("en-US") + " modelled hours; weights add to " + Math.round(wsum).toLocaleString("en-US") + " h. " +
              (x ? "Each extreme week (outlined) stands only for itself." : "No extreme week: the hardest weeks are averaged into the typical ones.");
            if (Object.keys(seen).length >= 2) { api.done(); api.saw(line + " The 24 hours of 31 December are spread over all the weights (× 8,760 ÷ 8,736)."); }
            else api.saw(line + " Now pick another.");
          }
          pick("typ4");
        } },
      // 3 solve on four typical weeks
      { text: "Solve the expansion LP on the four typical weeks, under lesson 13's cap of " + D.cap + " kt (thousand tonnes) of CO₂ a year.",
        build: function (act, api) {
          var row = H("div", { class: "m3-row" }, act), go = H("button", { type: "button", class: "lx-btn small", html: LX.icon("play") + "Solve on 4 typical weeks" }, row);
          var st = LX.SolverStatus(row), out = H("div", { class: "m3-row", style: "align-items:flex-start" }, act);
          function show(x) {
            out.innerHTML = ""; var k = H("div", { class: "m3-kpis" }, out);
            kpi(k, "Estimated cost", fm.musd(x.est.cost) + " a year"); kpi(k, "CO₂", fm.kt(x.est.co2)); kpi(k, "Modelled hours", x.est.hours.toLocaleString("en-US"));
            planTable(H("div", { style: "flex:1 1 260px;min-width:0" }, out), x.est.plan);
          }
          if (res.typ4 && res.typ4.est) { show(res.typ4); api.done(); }
          go.addEventListener("click", action({ api: api, st: st, host: act, go: go, job: function () { return plan("typ4"); },
            failed: function () { return firstFail([["typ4", "est"]]); },
            show: function () {
              var x = res.typ4; st.set(x.r); show(x); api.done();
              remember("typ4", { cost: x.est.cost });
              api.saw("The four weeks' optimum: " + fm.musd(x.est.cost) + " a year at the cap, with " + fm.mw(x.est.plan.wind) + " of wind. " + x.size.cols.toLocaleString("en-US") + " decisions, " + x.size.rows.toLocaleString("en-US") +
                " rules. It is an **estimate**: the solver saw " + x.est.hours + " of 8,760 hours.");
            } }));
        } },
      // 4 check it on the full year
      { text: "Now the check. Keep the sizes fixed and run the plan hour by hour on all 8,760 hours of 2025. Demand the plants cannot meet counts as [[unserved-energy|unserved]].",
        build: function (act, api) {
          var row = H("div", { class: "m3-row" }, act), go = H("button", { type: "button", class: "lx-btn small", html: LX.icon("play") + "Run all 8,760 hours" }, row);
          var st = LX.SolverStatus(row), out = H("div", { "aria-live": "polite" }, act), strip = LX.WeekStrip(act, S.Y);
          strip.draw(S.weeks("typ4"), null);
          function show(x) { out.innerHTML = ""; verdict(out, x, "y25", 2025); strip.draw(S.weeks("typ4"), x.y25.byWeek); }
          if (res.typ4 && res.typ4.y25) { show(res.typ4); api.done(); }
          go.addEventListener("click", action({ api: api, st: st, host: act, go: go, job: function () { return check("typ4", 2025); },
            failed: function () { return firstFail([["typ4", "y25"]]); },
            show: function () {
              var x = res.typ4; st.set(x.ry25); show(x); api.done();
              var e = TP.errors(x.est, x.y25, cap, null);
              api.saw("Spending holds within " + fm.pct(Math.abs(e.costGap)) + ". But " + fm.mwh(x.y25.unserved) + " go unserved in " + fm.hours(x.y25.hours) + ", spread over " + x.y25.byWeek.filter(function (v) { return v > 0.05; }).length + " weeks (red dots), and CO₂ is " + fm.kt(x.y25.co2) + " against " + D.cap + ".");
            } }));
        } },
      // 5 keep the extremes
      { text: "Keep the extremes: add the weeks of peak demand, of peak [[net-demand|net load]] (demand minus wind and sun) and of least wind, each standing only for itself. Solve and check again.",
        build: function (act, api) {
          var row = H("div", { class: "m3-row" }, act), go = H("button", { type: "button", class: "lx-btn small", html: LX.icon("play") + "Solve and check 4 + 3 extreme weeks" }, row);
          var st = LX.SolverStatus(row), tb = H("div", null, act), strip = LX.WeekStrip(act, S.Y);
          strip.draw(S.weeks("wk7"), null);
          function show() { resultsTable(tb, ["typ4", "wk7"]); strip.draw(S.weeks("wk7"), res.wk7.y25.byWeek); }
          if (res.wk7 && res.wk7.y25 && res.typ4 && res.typ4.y25) { show(); api.done(); }
          go.addEventListener("click", action({ api: api, st: st, host: act, go: go,
            job: function () { return check("typ4", 2025).then(function () { return check("wk7", 2025); }); },
            failed: function () { return firstFail([["typ4", "y25"], ["wk7", "y25"]]); },
            show: function () {
              var x = res.wk7; st.set(x.ry25 || x.r); show(); api.done();
              api.saw("Unserved energy falls from " + fm.mwh(res.typ4.y25.unserved) + " to " + fm.mwh(x.y25.unserved) + " (" + fm.hours(x.y25.hours) + "). CO₂ hardly moves: " + fm.kt(x.y25.co2) + ". Extremes guard the peak hours; they do not fix the CO₂ estimate.");
            } }));
        } },
      // 6 more weeks
      { text: "More weeks make a larger LP. Predict first: on the full year, which leaves less demand unserved?",
        build: function (act, api) {
          var tb, note, st, run;
          var pr = LX.Predict(act, { id: "m3-more", fresh: true, q: "Which leaves less unserved energy on the full year?", answer: "x",
            options: [{ value: "t8", label: "8 typical weeks" }, { value: "x", label: "4 typical + 3 extreme weeks" }, { value: "same", label: "About the same" }],
            feedback: { t8: "More typical weeks still average the hardest weeks away.", x: "On the full year of 2025, keeping three extreme weeks beats doubling the typical ones.", same: "They differ several times over." },
            onPick: function () { run(); } });
          st = LX.SolverStatus(H("div", { class: "m3-row" }, act));
          tb = H("div", null, act); note = H("p", { class: "m3-note", hidden: true, text: "Precomputed rows: their LPs are too large to solve quickly on a phone. The Node test and the notebook solve them again." }, act);
          // every set's plan run on all of 2025; a failed solve leaves a message and "Try again"
          run = action({ api: api, st: st, host: act, go: null,
            job: function () { return Promise.all(SETROWS.map(function (id) { return check(id, 2025); })); },
            failed: function () { return firstFail(SETROWS.map(function (id) { return [id, "y25"]; })); },
            show: function () {
              st.set(res.typ8.ry25 || res.typ8.r); pr.reveal(); resultsTable(tb, SETROWS); note.hidden = false; api.done();
              var a = res.typ8.y25, b = res.wk7.y25, c = res.wk15.y25;
              api.saw("8 typical weeks: " + fm.mwh(a.unserved) + " short; 4 + 3 extreme: " + fm.mwh(b.unserved) + ". With 12 + 3 weeks " + (c.unserved < 0.5 ? "every hour of 2025 is served" : fm.mwh(c.unserved) + " remain") +
                ", yet CO₂ is " + fm.kt(c.co2) + ", and its LP has " + (res.wk15.size.cols / res.typ4.size.cols).toFixed(1) + " times the columns of the four-week one.");
            } });
          if (res.wk15 && res.wk15.y25 && res.typ8 && res.typ8.y25) { resultsTable(tb, SETROWS); note.hidden = false; }
        } },
      // 7 the estimate against the full-year optimum
      { text: function () { return "A second error measure: each estimate against the cheapest " + D.cap + " kt plan solved on all 8,760 hours (precomputed: an LP with " + D.reference.full.cols.toLocaleString("en-US") + " columns, too heavy for a phone). Predict first."; },
        build: function (act, api) {
          var ul, pr = LX.Predict(act, { id: "m3-sign", fresh: true, q: "The seven-week estimate, against the full-year optimum, is…", answer: "below",
            options: [{ value: "above", label: "above it" }, { value: "below", label: "below it" }, { value: "equal", label: "equal to it" }],
            feedback: { above: "Fewer hard hours in the weeks make the plan look cheaper, not dearer.", below: "Fewer hard hours in the weeks make the plan look cheaper.", equal: "Fewer hard hours in the weeks make the plan look cheaper." },
            onPick: function () {
              pr.reveal(); ul.hidden = false; ul.innerHTML = "";
              var errs = SETROWS.map(function (id) { var e = R.sets[id].cost / R.full.cost - 1; return [setOf(D, id).label, e]; }), mx = Math.max.apply(null, errs.map(function (e) { return Math.abs(e[1]); }));
              errs.forEach(function (e) { var li = H("li", null, ul); H("span", { text: e[0] }, li); var b = H("span", { class: "bar" }, li); H("i", { style: "width:" + (Math.abs(e[1]) / mx * 100).toFixed(1) + "%" }, b); H("b", { text: fm.spct(e[1]) }, li); });
              api.done();
              api.saw("All five estimates are below the full-year optimum of " + fm.musd(R.full.cost) + ": from " + fm.spct(errs[0][1]) + " (4 typical weeks) to " + fm.spct(errs[4][1]) + " (12 + 3). Fewer hard hours make a plan look cheaper.");
            } });
          ul = H("ul", { class: "m3-bars", hidden: true, "aria-label": "Estimate error of each way of choosing the weeks" }, act);
          H("p", { class: "m3-note", html: LX.rich("Estimate error = (the weeks' optimal cost) ÷ (the full-year optimal cost) − 1, both at " + D.cap + " kt; reference numbers, the same on every device.") }, act);
        } },
      // 8 storage between weeks
      { text: "A battery needs a rule for its charge from one week to the next. Read the three rules, then predict.",
        build: function (act, api) {
          var rules = H("dl", { class: "m3-rules", "aria-label": "Three rules for the battery between weeks" }, act);
          [["Linked", "one calendar chain of 52 start levels: energy carried into a week was stored before."], ["Cyclic", "each representative week ends where it starts."],
           ["No link", "each week may start at any level."]].forEach(function (r) { H("dt", { text: r[0] }, rules); H("dd", { text: r[1] }, rules); });
          // the what-if, as short labelled lines
          var info = H("ul", { class: "m3-info" }, act);
          [["What-if", "battery energy at $" + D.storage.energyCapex + " per kWh, not the sourced $" + Math.round(cfg.techs.battery.energyCapex) + " in " + cfg.priceYear + " dollars (lesson 13). An illustrative what-if, not a forecast or a sourced cost."],
           ["Why", "so the solver builds a battery large enough for the rules to differ."],
           ["Runs", "three solves, a few seconds on a laptop. Each plan's full-year run was solved in advance; a plan that differs is run here."]]
            .forEach(function (r) { H("li", { html: "<b>" + r[0] + ":</b> " + LX.esc(r[1]) }, info); });
          var tb, st, run, out = {}, fail = null;
          var NAMES = { linked: "Linked", cyclic: "Cyclic", free: "No link" };   // short, so the table fits a phone (the rules list above explains them)
          function show() {
            tb.innerHTML = "";
            table(tb, ["Rule between weeks", "~Battery MW / MWh", "Estimate", "Full year: CO₂", "Full year: unserved"], D.storage.modes.map(function (m) {
              var o = out[m]; return { cells: [NAMES[m], batText(o.est.plan), fm.musd(o.est.cost), { text: fm.kt(o.full.co2), cls: o.full.co2 > cap + 0.5 ? "bad" : "ok" }, { text: o.full.unserved < 0.5 ? "0" : fm.mwh(o.full.unserved), cls: o.full.unserved < 0.5 ? "ok" : "bad" }] };
            }), "Three rules for the battery between weeks, at the illustrative what-if storage cost");
            // the battery column is hidden on phones (the result line names the no-link battery); the mechanism:
            // what each rule lets the battery carry from one week to the next
            H("p", { class: "m3-note", text: "Largest net change of the battery over one representative week: " + D.storage.modes.map(function (m) { return NAMES[m].toLowerCase() + " " + fm.mwh(largest(out[m].net)); }).join(", ") + "." }, tb);
          }
          // the three planning LPs, solved here; each plan's full-year run is the stored one when the plan is the reference
          // plan (it never depends on the reader's input), else solved here. Results already solved are kept for a retry.
          function solveAll() {
            var RW = S.weeks(D.storage.set), scap = D.storage.cap * 1e3; fail = null;
            return D.storage.modes.reduce(function (p, m) {
              return p.then(function () {
                if (fail || out[m]) return;
                st.set("solving");
                return LX.solver.solve(planModel(S.Cw, RW, { cap: scap, mode: m }), { timeLimit: 20, label: "m3-storage" }).then(function (r) {
                  if (!r.ok) { fail = r; return; }
                  var o = { est: readPlan(S.Cw, RW, r, { cap: scap }), net: netChanges(r, RW), r: r }, ref = R.storage[m];
                  if (samePlan(o.est.plan, ref.plan)) { o.full = ref.full; o.stored = true; out[m] = o; return; }
                  return LX.solver.solve(checkModel(S.Cw, S.Y, o.est.plan), { timeLimit: 20, label: "m3-storage-check" }).then(function (rc) {
                    if (!rc.ok) { fail = rc; return; }
                    o.full = TP.readCheck(S.Cw, S.Y, rc, o.est.plan); out[m] = o;
                  });
                });
              });
            }, Promise.resolve());
          }
          var pr = LX.Predict(act, { id: "m3-link", fresh: true, q: "Which rule gives the cheapest-looking plan?", answer: "free",
            options: [{ value: "linked", label: "Linked" }, { value: "cyclic", label: "Cyclic" }, { value: "free", label: "No link" }],
            feedback: { linked: "Linked keeps the books: energy carried into a week must have been stored before.", cyclic: "Cyclic forbids carrying energy between weeks, so it cannot look cheaper than no rule at all.", free: "With no link, each week may start charged, for free." },
            onPick: function () { pr.reveal(); run(); } });
          st = LX.SolverStatus(H("div", { class: "m3-row" }, act)); tb = H("div", null, act);
          H("p", { class: "m3-note", html: LX.rich("At the sourced $" + Math.round(cfg.techs.battery.energyCapex) + "/kWh the three rules' estimates agree within $0.1M: the battery built holds about an hour, so it has little to carry from one week to the next.") }, act);
          run = action({ api: api, st: st, host: act, go: null, job: solveAll,
            failed: function () { return D.storage.modes.every(function (m) { return out[m]; }) ? null : fail || { status: "error", ok: false, message: "no result" }; },
            show: function () {
              st.set(out.free.r); show(); api.done();
              var L = out.linked, F = out.free, Cy = out.cyclic, gap = (Cy.est.cost - L.est.cost) / L.est.cost, moved = largest(L.net);
              api.saw("In this illustrative what-if, no link builds " + fm.mwh(F.est.plan.be) + " of battery and looks " + fm.musd(L.est.cost - F.est.cost) + " cheaper, yet emits " + fm.kt(F.full.co2) + " on the full year: each week could start charged, for free. " +
                "Linked and cyclic estimates differ by " + (gap < 0.001 ? "less than 0.1%" : fm.pct(gap)) + (moved > 0.5 ? ", though the linked battery still moves energy between weeks: up to " + fm.mwh(moved) + " over one representative week." : "; here the linked battery moves almost nothing between weeks."));
            } });
        } },
      // 9 another weather year
      { text: "Weather differs from year to year. Run the 4 + 3 plan on 2024's demand, wind and sun, scaled to the same yearly demand and [[capacity-factor|capacity factors]] as 2025.",
        build: function (act, api) {
          var row = H("div", { class: "m3-row" }, act), go = H("button", { type: "button", class: "lx-btn small", html: LX.icon("play") + "Run on 2024" }, row);
          var st = LX.SolverStatus(row), tb = H("div", null, act);
          function show() {
            var x = res.wk7, F = R.full;
            tb.innerHTML = "";
            // the last row is the plan optimized on all 8,760 hours of 2025, run on 2024: no optimum of 2024 is computed
            table(tb, ["Plan, year run", "~Spending", "CO₂", "Unserved"], [
              { cells: ["4 + 3 plan, 2025", fm.musd(x.y25.cost), { text: fm.kt(x.y25.co2), cls: "bad" }, { text: fm.mwh(x.y25.unserved) + " · " + x.y25.hours + " h", cls: x.y25.unserved < 0.5 ? "ok" : "bad" }] },
              { cells: ["4 + 3 plan, 2024", fm.musd(x.y24.cost), { text: fm.kt(x.y24.co2), cls: x.y24.co2 > cap + 0.5 ? "bad" : "ok" }, { text: fm.mwh(x.y24.unserved) + " · " + x.y24.hours + " h", cls: x.y24.unserved < 0.5 ? "ok" : "bad" }] },
              { cls: "pre", cells: ["2025 full-year-optimal plan, run on 2024", fm.musd(F.y2024.cost), { text: fm.kt(F.y2024.co2), cls: F.y2024.co2 > cap + 0.5 ? "bad" : "ok" }, { text: fm.mwh(F.y2024.unserved) + " · " + F.y2024.hours + " h", cls: F.y2024.unserved < 0.5 ? "ok" : "bad" }] }
            ], "The seven-week plan on 2025 and 2024, and the plan optimal on all of 2025, run on 2024");
            H("p", { class: "m3-note", text: SPEND }, tb);
          }
          if (res.wk7 && res.wk7.y24 && res.wk7.y25) { show(); api.done(); }
          go.addEventListener("click", action({ api: api, st: st, host: act, go: go,
            job: function () { return check("wk7", 2025).then(function () { return check("wk7", 2024); }); },
            failed: function () { return firstFail([["wk7", "y25"], ["wk7", "y24"]]); },
            show: function () {
              var x = res.wk7; st.set(x.ry24); show(); api.done();
              api.saw("On 2024: " + fm.mwh(x.y24.unserved) + " unserved in " + fm.hours(x.y24.hours) + ", " + fm.kt(x.y24.co2) + ". Even the plan optimized on every hour of 2025 is short in " + fm.hours(R.full.y2024.hours) + " of 2024: one weather year cannot show [[resource-adequacy|adequacy]].");
            } }));
        } },
      // 10 which conclusions survive
      { text: "Sort six conclusions drawn from the seven weeks. Which survive the checks you ran?",
        build: function (act, api) {
          var x = R.sets.wk7, F = R.full;
          // the spending cards state their boundary: plants and fuel, no shortage penalty, no cap in the re-runs
          var cards = [
            { id: "cost", text: "The plan's yearly spending on plants and fuel is within 2% of the weeks' estimate.", bin: "holds",
              why: "On 2025 " + fm.spct(x.y2025.cost / x.cost - 1) + ", on 2024 " + fm.spct(x.y2024.cost / x.cost - 1) + ": spending only. The $" + S.C.voll.toLocaleString("en-US") + " per MWh shortage penalty would add " + fm.musd(penalty(S.C, x.y2025)) + " and " + fm.musd(penalty(S.C, x.y2024)) + ", and the re-runs enforce no cap." },
            { id: "years", text: "Its spending on plants and fuel is about the same in 2024 as in 2025 (within 1%).", bin: "holds", why: fm.musd(x.y2025.cost) + " and " + fm.musd(x.y2024.cost) + ", with no shortage penalty." },
            { id: "served", text: "The plan serves every hour.", bin: "fails", why: fm.mwh(x.y2025.unserved) + " unserved in 2025, " + fm.mwh(x.y2024.unserved) + " in 2024." },
            { id: "cap", text: "The plan meets the " + D.cap + " kt cap.", bin: "fails", why: fm.kt(x.y2025.co2) + " in 2025, " + fm.kt(x.y2024.co2) + " in 2024." },
            { id: "price", text: "Meeting " + D.cap + " kt costs about " + fm.musd(x.cost) + " a year.", bin: "fails", why: "The full-year optimum, planned on every hour of 2025, costs " + fm.musd(F.cost) + ", " + fm.pct(F.cost / x.cost - 1) + " more." },
            { id: "lole", text: "With this plan the town meets a loss-of-load expectation of 0.1 days a year (“1 day in 10 years”).", bin: "untested", why: "That is an expected number of shortage days over many weather years with plant outages; no run here includes them." }
          ];
          LX.CardSort(act, { bins: [{ id: "holds", label: "Holds", sub: "on both full years" }, { id: "fails", label: "Fails", sub: "a check you ran" }, { id: "untested", label: "Not tested", sub: "by these runs" }],
            cards: cards, onCheck: function (g) {
              if (g.placed < g.total) return;
              api.done(); LX.progress.done(LESSON); remember("sorted", g.right);
              api.saw(g.right + " of " + g.total + " as the checks say. Adequacy needs many weather years and plant outages: [[lesson:a05-adequacy|A5]] runs that study.");
            } });
        } }
    ];

    var cardsHost = H("div", null, live);
    var cards = LX.StepCards(cardsHost, { id: "m3-steps", steps: steps, onStep: function (i) { if (i === 1) { try { LX.solver.preload(); } catch (e) { /* the first solve loads it */ } } } });
    // demo states (core.js LX.demo): "mid" = step 4 with the four-week plan solved and checked; step-N opens card N with its action done
    function clickIn(sel) { var b = cardsHost.querySelector(sel); if (b) b.click(); }
    LX.demo(root, function (state) {
      var m = /^step-(\d+)$/.exec(state), n = state === "mid" ? 4 : m ? +m[1] : 0;
      if (!n) return null;
      var pre = n >= 4 ? check("typ4", 2025) : n >= 3 ? plan("typ4") : Promise.resolve();
      if (n >= 5) pre = pre.then(function () { return check("wk7", 2025); });
      pre.then(function () {
        cards.go(Math.min(steps.length, n) - 1);
        var act = cardsHost.querySelector(".lx-step-act");
        var pick = { 1: 0, 6: 1, 7: 1, 8: 2 }[n];   // the predictions' right answers
        if (pick != null) { var bs = act ? act.querySelectorAll(".lx-choice") : []; if (bs[pick]) bs[pick].click(); }
        else if (n === 3 || n === 4 || n === 5 || n === 9) clickIn(".lx-step-act .lx-btn");
      });
      return { view: state };
    }, cards);
    explain(S, D, cfg);
  });

  // ---------------------------------------------------------------- explain layer: the model as an equation, the planning
  // loop as a flowchart, the five ways of choosing weeks as a table
  function explain(S, D, cfg) {
    var x = document.getElementById("m3-explain"); if (!x) return;
    x.innerHTML = "";
    var R = D.reference, C = S.C, sym = LX.EquationCard.sym, w7 = R.sets.wk7;
    LX.EquationCard(H("div", { class: "lx-xcard" }, x), {
      title: "The expansion LP, symbol by symbol", lede: "Tap a symbol: what it means, its unit, its value in this lesson and its name in the code.",
      dense: true, label: "The capacity-expansion linear program; each symbol is a button", textLabel: "Text version: the rows read aloud, then every symbol",
      fields: [{ key: "you", label: "In this lesson" }, { key: "code", label: "In code", code: true }],
      rows: [
        { html: "min " + sym("f", "Σ<sub><var>i</var></sub> <var>f</var><sub><var>i</var></sub>") + " " + sym("K", "<var>K</var><sub><var>i</var></sub>") + " + " + sym("w", "Σ<sub><var>p</var></sub> <var>w</var><sub><var>p</var></sub>") + " Σ<sub><var>h</var></sub> ( " + sym("r", "<var>r</var>") + " · " + sym("g", "<var>g</var><sub><var>p,h</var></sub>") + " )", tag: "goal: a year's cost",
          say: "Minimise the yearly cost of what is built, f times K summed over the plants, plus, for every representative week p, its weight w p times the running cost r times the gas output g in each of its hours." },
        { html: sym("a", "<var>a</var><sub><var>p,h</var></sub>") + " " + sym("K", "<var>K</var>") + " + " + sym("g", "<var>g</var><sub><var>p,h</var></sub>") + " + <var>d</var> − <var>c</var> ≥ " + sym("Dm", "<var>D</var><sub><var>p,h</var></sub>"), tag: "every modelled hour",
          say: "In every modelled hour, wind, sun and nuclear output (availability a times size K), plus gas output g, plus battery discharge d minus charge c, covers demand D." },
        { html: sym("g", "<var>g</var><sub><var>p,h</var></sub>") + " ≤ " + sym("K", "<var>K</var>") + ",&nbsp; " + sym("s", "<var>s</var><sub><var>p,h</var></sub>") + " = <var>s</var><sub><var>p,h</var>−1</sub> + 0.85 <var>c</var> − <var>d</var>", tag: "sizes, battery",
          say: "Gas output stays within the size built; the battery's level s rises with 85 percent of the charge and falls with the discharge." },
        { html: sym("S", "<var>S</var><sub><var>i</var>+1</sub>") + " = <var>S</var><sub><var>i</var></sub> + " + sym("dl", "Δ<sub><var>k</var>(<var>i</var>)</sub>") + ",&nbsp; 0 ≤ <var>S</var><sub><var>i</var></sub> + ℓ<sub><var>k</var></sub>,&nbsp; <var>S</var><sub><var>i</var></sub> + <var>u</var><sub><var>k</var></sub> ≤ <var>K</var><sub>be</sub>", tag: "the link between weeks",
          say: "The level at the start of calendar week i plus one equals the level at the start of week i plus the net change of the representative week k that stands for week i; adding that week's lowest and highest swing keeps the level between zero and the battery's energy size." },
        { html: sym("w", "Σ<sub><var>p</var></sub> <var>w</var><sub><var>p</var></sub>") + " Σ<sub><var>h</var></sub> " + sym("e", "<var>e</var>") + " · " + sym("g", "<var>g</var><sub><var>p,h</var></sub>") + " ≤ " + sym("cap", "cap"), tag: "CO₂ a year",
          say: "The weighted sum of CO2, the emission rate e times gas output, stays within the cap." }
      ],
      symbols: {
        f: { name: "f_i", label: "f i, yearly cost of one unit built", unit: "$ per MW-year", words: "[[capital-cost|Capital cost]] spread over the plant's life ([[capital-recovery-factor|capital recovery]] at a 4% real cost of capital), plus [[fixed-om|fixed O&M]]: what one MW costs every year, used or not.", you: "Wind: $" + (C.techs.wind.fixed / 1e3).toFixed(1) + "k per MW-year; gas combined-cycle: $" + (C.techs.cc.fixed / 1e3).toFixed(1) + "k.", code: "C.techs.wind.fixed   // LX.townPlan.costs()" },
        K: { name: "K_i", label: "K i, size built", unit: "MW (battery energy: MWh)", words: "The investment decisions: one number per technology, the same in every hour of the year.", you: "The 4 + 3 plan: " + fm.mw(w7.plan.wind) + " of wind, " + fm.mw(w7.plan.cc) + " of gas combined-cycle.", code: '"K_wind", "K_cc", ... "K_be"' },
        w: { name: "w_p", label: "w p, the weight of representative week p", unit: "h per modelled hour", words: "How many hours of the year each modelled hour stands for: the number of calendar weeks the week represents, times 8,760 ÷ 8,736.", you: "A typical week standing for 13 weeks: " + (13 * 8760 / 8736).toFixed(2) + "; an extreme week: " + (8760 / 8736).toFixed(3) + ".", code: "RW.reps[p].weight" },
        r: { name: "r", label: "r, running cost", unit: "$/MWh", words: "Fuel and variable upkeep per MWh of gas output.", you: "Combined-cycle $" + C.techs.cc.run.toFixed(2) + "/MWh, peaker $" + C.techs.pk.run.toFixed(2) + "/MWh.", code: "C.techs.cc.run" },
        g: { name: "g_p,h", label: "g, gas output in hour h of week p", unit: "MW", words: "An operating decision: one per plant and modelled hour. Each lasts an hour, so MW over the hour is MWh.", you: "4 typical weeks: 672 hours; 4 + 3: 1,176.", code: '"g" + p + "_" + h' },
        a: { name: "a_p,h", label: "a, output per MW built", unit: "MW per MW", words: "What one MW of wind or solar can make in that hour (from real 2025 shapes, scaled to EIA [[capacity-factor|capacity factors]]); nuclear's is a flat 0.911.", you: "Wind averages " + (S.Y.windCF * 100).toFixed(1) + "% over the year, solar " + (S.Y.solarCF * 100).toFixed(1) + "%.", code: "P.wind[h], P.solar[h]" },
        Dm: { name: "D_p,h", label: "D, demand", unit: "MW", words: "Prairie Town's demand in that hour: the real 2025 shape scaled to a 450 MW peak; a typical week is scaled to keep its season's energy.", you: "Peak " + Math.round(S.Y.peak) + " MW.", code: "P.demand[h]" },
        s: { name: "s_p,h", label: "s, battery level within week p", unit: "MWh", words: "The level relative to the week's start; the 85% round trip loses 15% on charging.", you: "4 + 3 plan: " + batText(w7.plan) + " MW / MWh of battery.", code: '"s" + p + "_" + h' },
        S: { name: "S_i", label: "S i, level at the start of calendar week i", unit: "MWh", words: "One per calendar week, 52 in all; the chain runs through the year in calendar order and closes on itself (after Kotzur and co-authors, 2018).", you: "Without it (no link), each week may start full for free.", code: '"W" + i' },
        dl: { name: "Δ_k(i)", label: "delta, net change of the representative week that stands for week i", unit: "MWh", words: "What the battery gained or lost over the representative week k; ℓ and u are its lowest and highest swing within the week.", you: "Cyclic storage forces every Δ to zero.", code: '"s" + k + "_167", "lo" + k, "hi" + k' },
        e: { name: "e", label: "e, CO2 per MWh of gas output", unit: "t/MWh", words: "[[heat-rate|Heat rate]] (gas burned per MWh made, in [[mmbtu|MMBtu]]) times 0.05291 t of CO₂ per MMBtu: operating CO₂ only, not the life cycle.", you: "Combined-cycle " + C.techs.cc.co2.toFixed(3) + ", peaker " + C.techs.pk.co2.toFixed(3) + ".", code: "C.techs.cc.co2" },
        cap: { name: "cap", label: "the CO2 cap", unit: "t a year", words: "The most CO₂ the plan may emit in a year, as estimated from the weeks.", you: D.cap + " kt; on the full year the 4 + 3 plan emits " + fm.kt(w7.y2025.co2) + ".", code: "{ cap: " + D.cap * 1e3 + " }" }
      }
    });
    var F0 = R.full;
    LX.Flowchart(H("div", { class: "lx-xcard" }, x), {
      title: "Plan on weeks, then check on years", lede: "A plan from representative weeks is a hypothesis; the checks decide what you may claim. Trace four plans.",
      nodes: {
        pick: { t: "Choose weeks and weights", tN: ["Choose weeks", "and weights"], k: "end" },
        solve: { t: "Solve the expansion LP", tN: ["Solve the", "expansion LP"], s: "an estimate", sN: "an estimate" },
        full: { t: "Re-run the plan on 8,760 h", tN: ["Re-run on", "8,760 hours"], s: "sizes fixed", sN: "sizes fixed" },
        q1: { t: "Hours short?", tN: ["Hours", "short?"], k: "q" },
        more: { t: "Add extreme weeks", tN: ["Add extreme", "weeks"], s: "start again", sN: "start again", k: "end" },
        q2: { t: "Over the cap?", tN: ["Over the", "cap?"], k: "q" },
        tight: { t: "Tighten the cap", tN: ["Tighten", "the cap"], s: "start again", sN: "start again", k: "end" },
        y2: { t: "Re-run on another year", tN: ["Another", "weather year"], s: "2024", sN: "2024" },
        ad: { t: "Adequacy study (A5)", tN: ["Adequacy", "study (A5)"], s: "many years, outages", sN: "many years" },
        rep: { t: "Report with error measures", tN: ["Report with", "error measures"], k: "end" }
      },
      cols: 3, at: { pick: [1, 0], solve: [1, 1], full: [1, 2], q1: [1, 3], more: [0, 3], q2: [1, 4], tight: [2, 4], y2: [1, 5], ad: [1, 6], rep: [1, 7] },
      colsN: 2, atN: { pick: [0, 0], solve: [0, 1], full: [0, 2], q1: [0, 3], more: [1, 3], q2: [0, 4], tight: [1, 4], y2: [0, 5], ad: [0, 6], rep: [0, 7] },
      edges: [["pick", "solve"], ["solve", "full"], ["full", "q1"], ["q1", "more", "yes"], ["q1", "q2", "no"], ["q2", "tight", "yes"], ["q2", "y2", "no"], ["y2", "ad"], ["ad", "rep"]],
      traces: [
        { label: "4 typical weeks", path: ["pick", "solve", "full", "q1", "more"], text: fm.mwh(R.sets.typ4.y2025.unserved) + " unserved in " + fm.hours(R.sets.typ4.y2025.hours) + " of 2025: keep the extreme weeks." },
        { label: "4 + 3 extreme", path: ["pick", "solve", "full", "q1", "more"], text: "Still " + fm.mwh(w7.y2025.unserved) + " unserved in " + fm.hours(w7.y2025.hours) + ": better, not yet good." },
        { label: "12 + 3 weeks", path: ["pick", "solve", "full", "q1", "q2", "tight"], text: "Every hour of 2025 served, but " + fm.kt(R.sets.wk15.y2025.co2) + " against " + D.cap + " kt: tighten the cap in the planning LP, or report the overshoot." },
        { label: "All 8,760 hours", path: ["pick", "solve", "full", "q1", "q2", "y2", "ad", "rep"], text: "The plan optimal on all of 2025 serves 2025 by construction, yet is short in " + fm.hours(F0.y2024.hours) + " of 2024: only an adequacy study can judge it." }
      ], sel: 1
    });
    var ref = R.full.cost;
    LX.CompareTable(H("div", { class: "lx-xcard" }, x), {
      title: "Five ways to choose the weeks",
      lede: "Each plan solved at " + D.cap + " kt, then re-run on all 8,760 hours of 2025 and of 2024. Error = estimate ÷ full-year optimum (" + fm.musd(ref) + ") − 1.",
      columns: [{ key: "name", label: "Weeks", main: true }, { key: "cols", label: "LP columns", num: true, phoneHide: true }, { key: "err", label: "Estimate error", num: true, phone: "Error" },
                { key: "u25", label: "Unserved, 2025", num: true, phone: "2025" }, { key: "u24", label: "Unserved, 2024", num: true, phone: "2024" }, { key: "co2", label: "CO₂, 2025", num: true, phoneHide: true }],
      rows: ["typ4", "wk7", "typ8", "wk11", "wk15"].map(function (id) {
        var r = R.sets[id], s = setOf(D, id);
        return { key: id, color: s.extremes.length ? "var(--lx-bad)" : "var(--lx-hyd)", name: s.label, note: r.weeks * HPW + " modelled hours",
                 cols: { text: r.cols.toLocaleString("en-US"), value: r.cols }, err: { text: fm.spct(r.cost / ref - 1), value: Math.abs(r.cost / ref - 1) },
                 u25: { text: fm.mwh(r.y2025.unserved), value: r.y2025.unserved }, u24: { text: fm.mwh(r.y2024.unserved), value: r.y2024.unserved }, co2: { text: fm.kt(r.y2025.co2), value: r.y2025.co2 } };
      }),
      sorts: [{ label: "By size", order: ["typ4", "wk7", "typ8", "wk11", "wk15"], note: "These results depend on which weeks are kept; a larger LP alone does not guarantee a better estimate: 8 typical weeks do worse than 4 + 3." },
              { label: "By 2025 shortfall", order: ["wk15", "wk11", "wk7", "typ8", "typ4"], ranked: true, note: "Even the 12 + 3 plan, short in no hour of 2025, is short in " + fm.hours(R.sets.wk15.y2024.hours) + " of 2024." }]
    });
  }
})();
