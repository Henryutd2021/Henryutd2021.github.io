// b03-read-check-formulation.js — Bridge B3, "How do you read a formulation, and check that a model is right?" (step
// cards).
//
// Eight cards: the reading order of a published-style formulation; two indices as a table; sums as columns and rows of
// that table; the units of the objective; how many rows one "for all" line stands for; a bug hunt (five suspect models,
// each with one planted error: unit, sign, missing index, double counting, a free lunch), each run with a real solver to
// see its symptom; checking a solved model (the energy balance hour by hour, the signs of the duals); and verification
// against validation. The explain layer adds the formulation as linked symbols and an eight-point checklist.
//
// The model: Prairie Town's dispatch for 17:00-20:00 on 3 September 2025 (four hours of lesson 0's day, cut and scaled the
// same way; town.json, town_year.json). Nuclear runs flat; wind and solar are capped by the weather; the combined-cycle
// plant starts from the 45 MW that lesson 0's cheapest-first rule gives it at 16:00 and ramps at most 40 MW an hour; the
// peaker is fast and dear; unserved energy is priced at V = $10,000/MWh (illustrative). buildModel(inst, bug) writes the
// LX.solver model (HiGHS, assets/learn/components/solver.js) for the correct formulation or one bug; the page solves
// them in the browser, and the Node test solves the same models with the vendored HiGHS and checks every number the page
// states. Text, lines and bugs: assets/learn/data/b03-read-check-formulation.json.
//
// The Check section ends with the practice set (practice(), the Practice runner, as in B1): Read a line (the ramp line
// worked, a storage line partly worked, a reserve line from scratch), Hunt the bug (three more planted bugs: V typed in
// $/kWh, nuclear's = written <=, wind counted twice) and Check a solution (17:00-20:00 worked, the evening 18:00-21:00
// partly worked, the solar dip 14:00-17:00 from scratch). practiceSpec() gives each exercise's numbers, hints and check from
// the model; the page solves with HiGHS and falls back to the precomputed practice.ref, which the Node test re-solves.
(function () {
  "use strict";

  function townDay(town, year, key) {
    var sc = town.scenarios[key || "lesson0"], f = town.fleet;
    var t0 = Date.parse(year.start_utc + "Z"), d0 = Date.parse(sc.date + "T00:00:00Z");
    var i = Math.round((d0 - t0) / 3600000) + 1 - (sc.utcOffsetHours || 0);
    var cut = function (a) { return a.slice(i, i + 24); };
    var wind = cut(year.wind).map(function (v) { return Math.round(v / 1000 * f.wind.mw); });
    var solar = cut(year.solar).map(function (v) { return Math.round(v / 1000 * f.solar.mw); });
    var raw = cut(year.demand).map(function (v) { return v / 1000 * sc.demandPeakMW; });
    var need = raw.map(function (v, t) { return Math.round((v - f.nuclear.mw - wind[t] - solar[t]) / sc.step) * sc.step; });
    var demand = need.map(function (n, t) { return n + f.nuclear.mw + wind[t] + solar[t]; });
    return { date: sc.date, dateLabel: sc.dateLabel, fleet: f, demand: demand, wind: wind, solar: solar, need: need };
  }

  var G = ["nuc", "wind", "solar", "cc", "pk"], GNAME = { nuc: "nuclear", wind: "wind", solar: "solar", cc: "combined-cycle", pk: "peaker" };
  var FKEY = { nuc: "nuclear", wind: "wind", solar: "solar", cc: "cc", pk: "peaker" };
  function instance(town, year, o) {
    o = o || {};
    var D = townDay(town, year), f = D.fleet, T = o.hours || [17, 18, 19, 20];
    var inst = { D: D, T: T, G: G.slice(), dateLabel: D.dateLabel, V: o.V || 10000, start: o.start != null ? o.start : 45, dt: 1,
      c: {}, cap: {}, ramp: f.cc.ramp, d: {}, a: { wind: {}, solar: {} } };
    G.forEach(function (g) { inst.c[g] = f[FKEY[g]].cost; inst.cap[g] = f[FKEY[g]].mw; });
    T.forEach(function (t) { inst.d[t] = D.demand[t]; inst.a.wind[t] = D.wind[t]; inst.a.solar[t] = D.solar[t]; });
    return inst;
  }

  // bug: null | "unit" | "sign" | "index" | "double" | "lunch" (the step-6 suspects) | "vkwh" | "flat" | "twice" (the practice
  // set: V typed in $/kWh, so 10 stands for 10,000 $/MWh; nuclear's "=" written "<="; wind added to the balance a second time)
  function buildModel(inst, bug) {
    var vars = [], cons = [], T = inst.T, c = {}, V = bug === "vkwh" ? inst.V / 1000 : inst.V;
    G.forEach(function (g) { c[g] = inst.c[g]; });
    if (bug === "unit") c.pk = inst.c.pk / 1000;                       // $/kWh read as $/MWh
    T.forEach(function (t) {
      G.forEach(function (g) { vars.push({ name: "p_" + g + "_" + t, ub: inst.cap[g], cost: c[g] * inst.dt + (bug === "double" && g === "cc" ? inst.c.cc * inst.dt : 0) }); });
      vars.push({ name: "u_" + t, cost: V * inst.dt });
    });
    T.forEach(function (t, k) {
      if (bug !== "index" || k === 0) {
        var terms = {}; G.forEach(function (g) { terms["p_" + g + "_" + t] = 1; }); terms["u_" + t] = 1;
        if (bug === "twice") terms["p_wind_" + t] = 2;
        var row = { name: "bal_" + t, terms: terms }; row[bug === "sign" ? "le" : "eq"] = inst.d[t]; cons.push(row);
      }
      ["wind", "solar"].forEach(function (g) { if (!(bug === "lunch" && g === "wind")) { var w = { name: "wx_" + g + "_" + t, terms: {}, le: inst.a[g][t] }; w.terms["p_" + g + "_" + t] = 1; cons.push(w); } });
      var rt = {}; rt["p_cc_" + t] = 1;
      if (k > 0) { rt["p_cc_" + T[k - 1]] = -1; cons.push({ name: "ramp_" + t, terms: rt, lb: -inst.ramp, ub: inst.ramp }); }
      else cons.push({ name: "ramp_" + t, terms: rt, lb: inst.start - inst.ramp, ub: inst.start + inst.ramp });
      var mr = { name: "must_" + t, terms: {} }; mr.terms["p_nuc_" + t] = 1; mr[bug === "flat" ? "le" : "eq"] = inst.cap.nuc; cons.push(mr);
    });
    return { sense: "min", variables: vars, constraints: cons };
  }

  // a solved model as a table, with the checks the page asks for (true costs, not the model's own objective)
  function summarize(inst, r) {
    if (!r || !r.ok) return { ok: false, status: r ? r.status : "none" };
    var rows = inst.T.map(function (t) {
      var x = { t: t, d: inst.d[t], u: r.values["u_" + t] || 0 };
      G.forEach(function (g) { x[g] = r.values["p_" + g + "_" + t] || 0; });
      x.supply = G.reduce(function (s, g) { return s + x[g]; }, 0) + x.u;
      x.balanced = Math.abs(x.supply - x.d) < 1e-6;
      x.curtailed = (inst.a.wind[t] - x.wind) + (inst.a.solar[t] - x.solar);
      x.overWeather = x.wind > inst.a.wind[t] + 1e-6 || x.solar > inst.a.solar[t] + 1e-6;
      x.dual = r.duals && r.duals["bal_" + t] != null ? r.duals["bal_" + t] : null;
      return x;
    });
    var trueCost = rows.reduce(function (s, x) { return s + G.reduce(function (a, g) { return a + inst.c[g] * x[g] * inst.dt; }, 0) + inst.V * x.u * inst.dt; }, 0);
    return { ok: true, rows: rows, objective: r.objective, trueCost: trueCost, balanced: rows.every(function (x) { return x.balanced; }),
             overWeather: rows.some(function (x) { return x.overWeather; }), duals: r.duals, reducedCosts: r.reducedCosts };
  }
  function counts(inst) {
    var nT = inst.T.length, nG = G.length;
    return { balance: nT, size: nG * nT, weather: 2 * nT, ramp: 2 * nT, must: nT, variables: nG * nT + nT, rows: nT + nG * nT + 2 * nT + 2 * nT + nT };
  }

  // the symptom of a buggy model, in one or two sentences, from its solved summary and the correct one
  function money(v) { return "$" + Math.round(v).toLocaleString("en-US"); }
  function range(a) { var lo = Math.min.apply(null, a), hi = Math.max.apply(null, a); return lo === hi ? String(Math.round(lo)) : Math.round(lo) + "–" + Math.round(hi); }
  function symptom(bug, s, ref, inst) {
    if (!s.ok) return "The solver reports: " + s.status + ".";
    var short = s.rows.map(function (x) { return x.d - x.supply; }), hrs = inst.T;
    if (bug === "unit") return "Optimal. The peaker, the dearest plant, runs every hour (" + range(s.rows.map(function (x) { return x.pk; })) + " MW). The model reports " + money(s.objective) + "; at the intended (illustrative) costs the plan costs " + money(s.trueCost) + ".";
    if (bug === "sign") return "Optimal at " + money(s.objective) + ". Only nuclear and the combined-cycle plant's ramp minimum run; supply falls short of demand by " + range(short) + " MW every hour.";
    if (bug === "index") return "Optimal at " + money(s.objective) + ". " + hrs[0] + ":00 balances; from " + hrs[1] + ":00 to " + hrs[hrs.length - 1] + ":00 supply falls short by up to " + Math.round(Math.max.apply(null, short)) + " MW, and no unserved demand is counted.";
    if (bug === "double") return "Optimal. The model reports " + money(s.objective) + ", but the plan's true cost is " + money(s.trueCost) + ", and it now runs the peaker: " + money(s.trueCost - ref.trueCost) + " dearer than the right plan's " + money(ref.trueCost) + ".";
    if (bug === "lunch") return "Optimal at " + money(s.objective) + ". The wind farm makes " + range(s.rows.map(function (x) { return x.wind; })) + " MW while the wind allowed " + range(hrs.map(function (t) { return inst.a.wind[t]; })) + " MW.";
    return "";
  }

  // ---------------------------------------------------------------- the practice set (Check section), pure parts
  // a precomputed solution {objective, p: {g: [MW per hour]}, u, balanceDuals} (the data file's ref and practice.ref), read
  // as summarize() reads a solver result: the page's answer when the solver cannot load, re-checked by the Node test
  function fromRef(inst, R) {
    var r = { ok: true, status: "optimal", objective: R.objective, values: {}, duals: {} };
    inst.T.forEach(function (t, k) { G.forEach(function (g) { r.values["p_" + g + "_" + t] = R.p[g][k]; }); r.values["u_" + t] = R.u[k]; r.duals["bal_" + t] = R.balanceDuals[k]; });
    return summarize(inst, r);
  }
  // a summary as the data file stores it (the inverse of fromRef; rounded to 1e-6)
  function toRef(S) {
    var q = function (v) { return Math.round(v * 1e6) / 1e6 + 0; }, p = {};
    G.forEach(function (g) { p[g] = S.rows.map(function (x) { return q(x[g]); }); });
    return { objective: q(S.objective), p: p, u: S.rows.map(function (x) { return q(x.u); }), balanceDuals: S.rows.map(function (x) { return q(x.dual); }) };
  }
  // which model each solved practice exercise runs: its bug (or none) and its four hours (default 17:00-20:00)
  var PRACTICE_RUN = { ok: { bug: null }, vkwh: { bug: "vkwh" }, flat: { bug: "flat" }, twice: { bug: "twice" }, eve: { bug: null, win: "eve" }, dip: { bug: null, win: "dip" } };
  function practiceInst(town, year, J, key) {
    var w = PRACTICE_RUN[key].win ? J.practice.windows[PRACTICE_RUN[key].win] : null;
    return w ? instance(town, year, { hours: w.hours, start: w.start }) : instance(town, year);
  }
  function fill(t, v) { return String(t).replace(/\{(\w+)\}/g, function (m, k) { return v[k] == null ? m : String(v[k]); }); }
  function list(a) { return a.reduce(function (s, t, k) { return s + (k ? (k === a.length - 1 ? " and " : ", ") : "") + t; }, ""); }
  function near(a, b, tol) { return a != null && isFinite(a) && Math.abs(a - b) <= (tol == null ? 1e-6 : tol); }
  function round(v) { return Math.round(v * 1e6) / 1e6; }
  // energy (MWh) and cost ($) of plant g over a solved summary's hours
  function energy(S, g, inst) { return round(S.rows.reduce(function (a, x) { return a + x[g]; }, 0) * inst.dt); }
  function supplyAt(S, k) { return round(G.reduce(function (a, g) { return a + S.rows[k][g]; }, 0)); }

  // Each practice exercise from the model: practiceSpec(key, J, town, year, sol) -> {vars, texts, hints, check(answer) ->
  // {ok, why} | null while a part is unanswered}. sol = {ok, vkwh, flat, twice, eve, dip}: solved summaries (the page's
  // HiGHS run or fromRef; the test's own HiGHS run); an exercise reads only the runs it needs.
  function practiceSpec(key, J, town, year, sol) {
    var it = J.practice.items[key], f = function (v) { return function (t) { return fill(t, v); }; };
    var inst = instance(town, year), N = counts(inst), day = [], v, out;
    for (var h = 0; h < 24; h++) day.push(h);
    var N24 = counts(instance(town, year, { hours: day })), fl = inst.D.fleet;
    var cst = { cNuc: fl.nuclear.cost, cCC: fl.cc.cost, cPK: fl.peaker.cost };
    if (key === "r1") {
      v = { ramp: inst.ramp, nT: inst.T.length, rows: N.ramp, t0: inst.T[0], tPrev: inst.T[0] - 1, start: inst.start, day: day.length, rows24: N24.ramp };
      out = { worked: it.worked.map(function (w) { return [w[0], fill(w[1], v)]; }), q: fill(it.q, v),
        check: function (a) { if (!isFinite(a)) return null; return { ok: a === v.rows24, why: fill(a === v.rows24 ? it.right : a === day.length ? it.oneSided : it.wrong, v) }; } };
    } else if (key === "r2") {
      v = { nT: inst.T.length };
      out = { rowsQ: fill(it.rowsQ, v),
        check: function (a) {
          if (it.ask.some(function (q) { return !a[q[0]]; }) || !isFinite(a.rows)) return null;
          var bad = it.ask.filter(function (q) { return a[q[0]] !== q[2]; })[0];
          if (bad) return { ok: false, why: fill(it.bad[bad[0]], v) };
          if (a.rows !== v.nT) return { ok: false, why: fill(it.bad.rows, v) };
          return { ok: true, why: fill(it.right, v) };
        } };
    } else if (key === "r3") {
      v = { day: day.length, rows4: N.rows, rowsDay: N24.rows, res: day.length, total: N24.rows + day.length, nG: G.length };
      out = { unitQ: fill(it.unitQ, v), rowsQ: fill(it.rowsQ, v), totalQ: fill(it.totalQ, v),
        check: function (a) {
          if (a.choice == null || !a.unit || !isFinite(a.rows) || !isFinite(a.total)) return null;
          if (a.choice !== it.answer) return { ok: false, why: it.bad.choice[a.choice] };
          if (a.unit !== "MW") return { ok: false, why: it.bad.unit };
          if (a.rows !== v.res) return { ok: false, why: it.bad.rows };
          if (a.total !== v.total) return { ok: false, why: fill(it.bad.total, v) };
          return { ok: true, why: fill(it.right, v) };
        } };
    } else if (key === "g1") {
      var S = sol.vkwh, uu = S.rows.map(function (x) { return x.u; }), last = S.rows.length - 1;
      v = { obj: money(S.objective), uRange: range(uu), ccMax: round(Math.max.apply(null, S.rows.map(function (x) { return x.cc; }))), VmwhMoney: money(inst.V),
            dual: round(S.rows[0].dual), cCC: cst.cCC, nuc: S.rows[0].nuc, windN: round(S.rows[last].wind), tN: inst.T[last] };
      out = { worked: it.worked.map(function (w) { return [w[0], fill(w[1], v)]; }), choices: it.choices.map(f(v)),
        check: function (i) { if (i == null) return null; return { ok: i === it.answer, why: fill(it.reasons[i], v) }; } };
    } else if (key === "g2") {
      var S2 = sol.flat, S0 = sol.ok;
      v = { obj: money(S2.objective), diff: money(S0.objective - S2.objective), ref: money(S0.objective), nuc0: round(S2.rows[0].nuc), nuc1: round(S2.rows[0].nuc) + 1, t0: inst.T[0],
            cap: inst.cap.nuc, cNuc: cst.cNuc, d0: round(S0.rows[0].dual), d1: round(S2.rows[0].dual) };
      var line = J.practice.bugs.flat.line;
      out = { symptom: fill(it.symptom, v), line: line,
        check: function (a) {
          if (!a.line) return { ok: false, why: it.noLine };
          if (a.line !== line) return { ok: false, why: fill(it.lineWrong, v) };
          if (a.choice == null) return null;
          if (a.choice !== it.answer) return { ok: false, why: it.bad[a.choice] };
          return { ok: true, why: fill(it.right, v) };
        } };
    } else if (key === "g3") {
      var S3 = sol.twice, k3 = inst.T.indexOf(it.hour), x3 = S3.rows[k3];
      v = { th: it.hour, d: x3.d, supply: supplyAt(S3, k3), short: round(x3.d - supplyAt(S3, k3) - x3.u), u: round(x3.u), wind: round(x3.wind) };
      var line3 = J.practice.bugs.twice.line;
      out = { ask: fill(it.ask, v), supplyQ: fill(it.supplyQ, v), shortQ: fill(it.shortQ, v), line: line3,
        check: function (a) {
          if (!a.ran) return { ok: false, why: it.run };
          if (!isFinite(a.supply) || !isFinite(a.short)) return null;
          if (!near(a.supply, v.supply, 0.5)) return { ok: false, why: fill(it.badSupply, v) };
          if (!near(a.short, v.short, 0.5)) return { ok: false, why: fill(it.badShort, v) };
          if (!a.line) return { ok: false, why: it.noLine };
          if (a.line !== line3) return { ok: false, why: it.lineWrong };
          return { ok: true, why: fill(it.right, v) };
        } };
    } else if (key === "k1") {
      var Sk = sol.ok, kk = inst.T.indexOf(it.hour), xk = Sk.rows[kk];
      v = Object.assign({ th: it.hour, sumParts: G.map(function (g) { return round(xk[g]); }).join(" + ") + (xk.u ? " + " + round(xk.u) : ""), sum: supplyAt(Sk, kk) + round(xk.u),
            nucE: energy(Sk, "nuc", inst), nucCost: money(energy(Sk, "nuc", inst) * cst.cNuc), ccE: energy(Sk, "cc", inst), ccCost: money(energy(Sk, "cc", inst) * cst.cCC),
            total: money(Sk.trueCost), duals: list(Sk.rows.map(function (x) { return "$" + round(x.dual); })), shift: it.shift,
            extra: money(it.shift * (cst.cPK - cst.cCC)), save: money(it.shift * cst.cCC), diff: cst.cPK - cst.cCC }, cst);
      out = { worked: it.worked.map(function (w) { return [fill(w[0], v), fill(w[1], v)]; }), q: fill(it.q, v),
        check: function (a) {
          if (!isFinite(a)) return null;
          var ok = near(a, it.shift * (cst.cPK - cst.cCC), 0.5);
          return { ok: ok, why: fill(ok ? it.right : near(a, it.shift * cst.cPK, 0.5) ? it.whole : it.wrong, v) };
        } };
    } else if (key === "k2" || key === "k3") {
      var w = J.practice.windows[it.win], Sw = sol[it.win], iw = instance(town, year, { hours: w.hours, start: w.start }), x0 = Sw.rows[0];
      v = Object.assign({ t0: w.hours[0], tN: w.hours[w.hours.length - 1], tPrev: w.hours[0] - 1, start: w.start, ramp: iw.ramp,
            sumParts: G.map(function (g) { return round(x0[g]); }).join(" + "), sum: supplyAt(Sw, 0), supply: supplyAt(Sw, 0),
            nucE: energy(Sw, "nuc", iw), nucCost: money(energy(Sw, "nuc", iw) * cst.cNuc), ccE: energy(Sw, "cc", iw), ccCost: money(energy(Sw, "cc", iw) * cst.cCC),
            pkE: energy(Sw, "pk", iw), pkCost: money(energy(Sw, "pk", iw) * cst.cPK), total: money(Sw.trueCost), cc0: round(x0.cc), dual: round(x0.dual),
            duals: list(Sw.rows.map(function (x, k) { return w.hours[k] + ":00 $" + round(x.dual); })) }, cst);
      var pk = energy(Sw, "pk", iw) * cst.cPK;
      out = { title: fill(it.title, v), note: fill(it.note, v), inst: iw, sol: Sw };
      if (key === "k2") {
        out.worked = it.worked.map(function (x) { return [fill(x[0], v), fill(x[1], v)]; });
        out.check = function (a) {
          if (!isFinite(a.pk) || !isFinite(a.total)) return null;
          if (!near(a.pk, pk, 0.5)) return { ok: false, why: fill(it.badPk, v) };
          if (!near(a.total, Sw.trueCost, 0.5)) return { ok: false, why: it.badTotal };
          return { ok: true, why: fill(it.right, v) };
        };
      } else {
        out.supplyQ = fill(it.supplyQ, v); out.totalQ = fill(it.totalQ, v); out.dualQ = fill(it.dualQ, v); out.duals = fill(it.duals, v);
        out.check = function (a) {
          if (!a.ran) return { ok: false, why: it.run };
          if (!isFinite(a.supply) || !isFinite(a.total) || !isFinite(a.dual)) return null;
          if (!near(a.supply, v.supply, 0.5)) return { ok: false, why: fill(it.badSupply, v) };
          if (!near(a.total, Sw.trueCost, 0.5)) return { ok: false, why: it.badTotal };
          if (!near(a.dual, x0.dual, 0.5)) return { ok: false, why: fill(near(a.dual, cst.cCC, 0.5) ? it.badDualCC : it.badDual, v) };
          return { ok: true, why: fill(it.right, v) };
        };
      }
    }
    out.key = key; out.vars = v; out.hints = (it.hints || []).map(f(v)); out.title = out.title || it.title;
    return out;
  }

  // the formulation's symbols with their meaning, unit and value, including the start p(cc, first hour − 1), a given number
  function inputs(inst) {
    var hrs = function (o) { return inst.T.map(function (t) { return t + ":00 " + o[t]; }).join(", "); };
    var per = function (o) { return G.map(function (g) { return g + " " + o[g].toLocaleString("en-US"); }).join(", "); };
    return [
      { sym: "nuc, wind, solar, cc, pk", name: "the plants in G: nuclear, wind farm, solar farm, combined-cycle gas plant, peaker", unit: "", value: "" },
      { sym: "<i>g</i> ∈ <i>G</i>, <i>t</i> ∈ <i>T</i>", name: "read aloud: plant g belongs to the set of plants G; hour t belongs to the set of hours T", unit: "", value: "" },
      { sym: "<i>p<sub>g,t</sub></i>", name: "output of plant g in hour t, at least 0: a variable, chosen by the solver", unit: "MW", value: "chosen" },
      { sym: "<i>u<sub>t</sub></i>", name: "demand left unserved in hour t, at least 0: a variable, charged V a MWh", unit: "MW", value: "chosen" },
      { sym: "<i>d<sub>t</sub></i>", name: "demand in hour t", unit: "MW", value: hrs(inst.d) },
      { sym: "<i>a</i><sub>wind,<i>t</i></sub>", name: "wind the weather allows", unit: "MW", value: hrs(inst.a.wind) },
      { sym: "<i>a</i><sub>solar,<i>t</i></sub>", name: "sun the weather allows", unit: "MW", value: hrs(inst.a.solar) },
      { sym: "<i>c<sub>g</sub></i>", name: "running cost of plant g", unit: "$/MWh", value: per(inst.c) },
      { sym: "<i>P̄<sub>g</sub></i>", name: "size of plant g", unit: "MW", value: per(inst.cap) },
      { sym: "<i>R</i>", name: "how far the cc plant can move in an hour", unit: "MW per hour", value: String(inst.ramp) },
      { sym: "<i>p</i><sub>cc," + (inst.T[0] - 1) + "</sub>", name: "cc output at " + (inst.T[0] - 1) + ":00, the start: given, not chosen", unit: "MW", value: String(inst.start) },
      { sym: "<i>V</i>", name: "charge for each MWh of unserved demand", unit: "$/MWh", value: inst.V.toLocaleString("en-US") },
      { sym: "Δ<i>t</i>", name: "length of one step", unit: "h", value: String(inst.dt) }];
  }

  var model = { townDay: townDay, instance: instance, buildModel: buildModel, summarize: summarize, counts: counts, symptom: symptom, money: money, G: G, GNAME: GNAME, inputs: inputs,
                fromRef: fromRef, toRef: toRef, PRACTICE_RUN: PRACTICE_RUN, practiceInst: practiceInst, practiceSpec: practiceSpec, fill: fill };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;
  // ================================================================ view
  var LX = window.LX, H = LX.H;
  function seg(host, labels, sel, onPick, aria) {
    var g = H("div", { class: "lx-seg", role: "group", "aria-label": aria || "Choose" }, host), bs = [];
    labels.forEach(function (l, i) {
      var b = H("button", { type: "button", "aria-pressed": i === sel ? "true" : "false", text: l }, g);
      b.addEventListener("click", function () { bs.forEach(function (x, j) { x.setAttribute("aria-pressed", j === i ? "true" : "false"); }); onPick(i); });
      bs.push(b);
    });
    return { el: g, buttons: bs, set: function (i) { bs.forEach(function (x, j) { x.setAttribute("aria-pressed", j === i ? "true" : "false"); }); } };
  }
  function numInput(host, o) {
    var id = LX.uid("in"), row = H("div", { class: "w1h-ans" }, host);
    H("label", { for: id, text: o.label }, row);
    var inp = H("input", { id: id, type: "text", inputmode: "numeric", autocomplete: "off", class: "w1h-num" }, row);
    if (o.unit) H("span", { class: "w1h-unit", text: o.unit }, row);
    var btn = H("button", { type: "button", class: "lx-btn small", text: o.button || "Check" }, row);
    function go() { var v = parseFloat(String(inp.value).replace(/[−–]/g, "-").replace(/,/g, "")); o.onCheck(isNaN(v) ? null : v, inp); }
    btn.addEventListener("click", go);
    inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); go(); } });
    return { input: inp, button: btn };
  }
  function inputKey(host, inst) {
    var d = H("details", { class: "lx-textalt b3-key" }, host); H("summary", { text: "Symbol key and input values" }, d);
    var t = H("table", { class: "lx-fp-tab b3-keytab" }, H("div", { class: "lx-fp-tabw" }, d));
    var hr = H("tr", null, H("thead", null, t)); ["Symbol", "Meaning", "Unit", "Value"].forEach(function (x) { H("th", { scope: "col", text: x }, hr); });
    var tb = H("tbody", null, t);
    inputs(inst).forEach(function (r) { var tr = H("tr", null, tb); H("th", { scope: "row", html: r.sym }, tr); H("td", { text: r.name }, tr); H("td", { text: r.unit }, tr); H("td", { text: r.value }, tr); });
    return d;
  }
  function saw(host, ok, html) { host.innerHTML = ""; H("div", { class: "lx-saw" + (ok ? "" : " no"), html: LX.icon(ok ? "check" : "question") + "<div>" + html + "</div>" }, host); }
  var HTMLSYM = { nuc: "nuc", wind: "wind", solar: "solar", cc: "cc", pk: "pk" };
  function pg(g, t) { return "<i>p</i><sub>" + HTMLSYM[g] + "," + t + "</sub>"; }

  // the 5 x 4 table of p_{g,t}: plants down, hours across; cells, row heads and column heads are buttons
  function Grid(host, inst, ref, o) {
    var tb = H("div", { class: "b3-grid", role: "grid", "aria-label": "Outputs p of each plant g (rows) in each hour t (columns), MW" }, host), cells = {}, rowsH = {}, colsH = {};
    var hd = H("div", { class: "b3-gr head", role: "row" }, tb); H("span", { class: "b3-corner", text: "g \\ t" }, hd);
    inst.T.forEach(function (t, k) { var b = H("button", { type: "button", class: "b3-ch", role: "columnheader", text: t + ":00" }, hd); b.addEventListener("click", function () { o.onCol && o.onCol(t, k); }); colsH[t] = b; });
    G.forEach(function (g) {
      var r = H("div", { class: "b3-gr", role: "row" }, tb), rh = H("button", { type: "button", class: "b3-rh", role: "rowheader", text: GNAME[g] }, r);
      rh.addEventListener("click", function () { o.onRow && o.onRow(g); }); rowsH[g] = rh;
      inst.T.forEach(function (t, k) {
        var c = H("button", { type: "button", class: "b3-cell", role: "gridcell", "aria-label": "p of " + GNAME[g] + " at " + t + ":00: " + ref.p[g][k] + " MW", text: String(ref.p[g][k]) }, r);
        c.addEventListener("click", function () { o.onCell && o.onCell(g, t, k); }); cells[g + t] = c;
      });
    });
    return {
      mark: function (fn) { G.forEach(function (g) { inst.T.forEach(function (t) { cells[g + t].classList.toggle("on", !!fn(g, t)); }); }); },
      head: function (g, t) { Object.keys(rowsH).forEach(function (k) { rowsH[k].classList.toggle("on", k === g); }); Object.keys(colsH).forEach(function (k) { colsH[k].classList.toggle("on", +k === t); }); }
    };
  }

  // the published-style formulation, line by line: LX.Formulation (components/formulation.js), its symbols with the
  // notation key, and the same lines in words; in a bug hunt (o.onPick: the lines are buttons, o.lines replaces some lines,
  // a suspect model) the symbols only. Tags: data, goal, (1) to (5), the same as the page without JavaScript
  var LINES = ["par", "obj", "bal", "size", "wx", "ramp", "must"];
  function readLines(host, J, o) {
    return LX.Formulation(host, { views: o.onPick ? ["symbols"] : ["symbols", "words"], legend: o.onPick ? null : J.legend, aria: o.aria, onPick: o.onPick, rules: LINES.map(function (k) {
      return { id: k, name: J.lineNames[k], tag: J.lineTags[k], sym: (o.lines && o.lines[k]) || J.lines[k], words: J.lineWords[k] };
    }) });
  }

  function view(live, data, root) {
    var J = data.b03_read_check_formulation, inst = instance(data.town, data.town_year), ref = J.ref, N = counts(inst);
    var T = inst.T, steps = [], solved = {}, refSum = null;
    function solve(bug) {
      var key = bug || "ok";
      if (solved[key]) return Promise.resolve(solved[key]);
      if (!LX.solver) return Promise.resolve({ ok: false, status: "unavailable" });
      return LX.solver.solve(buildModel(inst, bug), { timeLimit: 10, key: "b3-" + key }).then(function (r) { var sm = summarize(inst, r); sm.ms = r.ms; solved[key] = sm; return sm; });
    }
    var col19 = T.indexOf(19), sumCol = G.reduce(function (a, g) { return a + ref.p[g][col19]; }, 0), sumRow = ref.p.cc.reduce(function (a, v) { return a + v; }, 0);

    // 1 reading order
    steps.push({
      text: "This is Prairie Town's [[dispatch|dispatch]] for four hours, as a paper would write it. Read it in a fixed sequence: sets, [[parameter|parameters]], variables, objective, constraints. Open each block.",
      build: function (act, api) {
        var seen = {}, box = H("div", { class: "b3-blocks" }, act);
        J.blocks.forEach(function (b, i) {
          var d = H("details", { class: "b3-block" }, box), s = H("summary", null, d);
          H("span", { class: "b3-bn", text: String(i + 1) }, s); H("b", { text: b.head }, s); H("span", { class: "b3-bh", html: b.html }, s);
          H("p", { html: LX.rich(b.words) }, d);
          d.addEventListener("toggle", function () { if (d.open) seen[b.key] = 1; if (Object.keys(seen).length === J.blocks.length) { api.done(); api.saw("Sets say what to count over, parameters are given, variables are chosen, the objective scores a plan, the constraints rule plans out. Read every model in this sequence."); } });
        });
        inputKey(act, inst);
      }
    });

    // 2 two indices make a table
    steps.push({
      text: "p with two indices, g and t, is a whole table: one number per plant and hour. Tap the cell for the combined-cycle plant at 19:00.",
      build: function (act, api) {
        H("p", { class: "b3-note", html: "Values: the solved plan, in MW (you solve it yourself in step 7)." }, act);
        var out = H("div", { "aria-live": "polite" }, act);
        var gr = Grid(act, inst, ref, { onCell: function (g, t, k) {
          gr.mark(function (gg, tt) { return gg === g && tt === t; });
          if (g === "cc" && t === 19) { saw(out, true, pg("cc", 19) + " = <b>" + ref.p.cc[k] + " MW</b>: row g = cc, column t = 19."); api.done(); api.saw("Five plants times four hours: " + N.size + " numbers under one symbol. A third index, such as a region, would make it a cube."); }
          else saw(out, false, "That is " + pg(g, t) + ": row " + GNAME[g] + ", column " + t + ":00. Find the row cc and the column 19:00.");
        } });
      }
    });

    // 3 sums are columns and rows
    steps.push({
      text: "Σ over g adds down a column: every plant, one hour. Tap the column for Σg p(g,19).",
      build: function (act, api) {
        var got = {}, out = H("div", { "aria-live": "polite" }, act), next = H("p", { class: "lx-qtext", "aria-live": "polite" }, act), out2 = H("div", { "aria-live": "polite" }, act);
        var gr = Grid(act, inst, ref, {
          onCol: function (t, k) {
            gr.head(null, t); gr.mark(function (g, tt) { return tt === t; });
            var parts = G.map(function (g) { return ref.p[g][k]; }), sum = parts.reduce(function (a, v) { return a + v; }, 0);
            saw(out, t === 19, "Σ<sub>g</sub> <i>p</i><sub>g," + t + "</sub> = " + parts.join(" + ") + " = <b>" + sum + " MW</b>" + (t === 19 ? ", the demand at 19:00: this sum is the balance rule." : ". That is hour " + t + ":00; tap 19:00."));
            if (t === 19) { got.col = 1; if (!got.row) next.textContent = "Next, Σ over t adds along a row: one plant, every hour. Tap the row for Σt p(cc,t)."; }
            done();
          },
          onRow: function (g) {
            gr.head(g, null); gr.mark(function (gg) { return gg === g; });
            var parts = ref.p[g], sum = parts.reduce(function (a, v) { return a + v; }, 0);
            saw(out2, g === "cc", "Σ<sub>t</sub> " + pg(g, "t") + " Δt = (" + parts.join(" + ") + ") MW × 1 h = <b>" + sum + " MWh</b>" + (g === "cc" ? ": the combined-cycle plant's energy over four hours." : ". That is the " + GNAME[g] + " row; tap cc."));
            if (g === "cc") got.row = 1; done();
          }
        });
        function done() { if (got.col && got.row) { api.done(); api.saw("Σ over g at 19:00 gives " + sumCol + " MW, the demand; Σ over t for cc gives " + sumRow + " MWh once times Δt = 1 h. The objective nests both: Σt Σg, every cell."); } }
      }
    });

    // 4 units of the objective
    steps.push({
      text: "Every term of an objective must come out in the same unit. Pick the unit of each factor in c(g) · p(g,t) · Δt, and see what the product is.",
      build: function (act, api) {
        var U = J.units, pick = {}, row = H("div", { class: "b3-units" }, act), out = H("div", { "aria-live": "polite" }, act);
        U.factors.forEach(function (f, i) {
          var cell = H("div", { class: "b3-unit" }, row);
          H("span", { class: "b3-usym", html: "<i>" + f.sym + "</i>" }, cell);
          var id = LX.uid("u"), lab = H("label", { for: id, class: "lx-sr", text: "Unit of factor " + (i + 1) }, cell);
          var sel = H("select", { id: id, class: "b3-sel" }, cell); H("option", { value: "", text: "unit?" }, sel);
          U.options.forEach(function (u) { H("option", { value: u, text: u }, sel); });
          sel.addEventListener("change", function () { pick[i] = sel.value; check(); });
          if (i < U.factors.length - 1) H("span", { class: "b3-times", text: "×" }, row);
        });
        H("span", { class: "b3-times", text: "=" }, row); var res = H("span", { class: "b3-res", text: "?" }, row);
        function check() {
          var all = U.factors.every(function (f, i) { return pick[i]; }), ok = U.factors.every(function (f, i) { return pick[i] === f.answer; });
          if (!all) return;
          if (ok) { res.textContent = U.result; saw(out, true, "$/MWh × MW × h: the MW and h make MWh, which cancels the per-MWh. Result: <b>$</b>, for every term."); api.done(); api.saw("Every term in dollars, so the sum makes sense. Drop Δt and the cost is right only when each step is exactly one hour: at 15-minute steps it would be four times too large."); }
          else { res.textContent = "?"; saw(out, false, "Not yet: a running cost is dollars per MWh, an output is MW, a step is hours."); }
        }
      }
    });

    // 5 one line, many rows
    steps.push({
      text: "“∀ t ∈ T” means one row for each hour. With four hours and five plants, how many rows does the balance stand for, and how many the size rule?",
      build: function (act, api) {
        readLines(act, J, {}); inputKey(act, inst);
        var got = {}, out = H("div", { "aria-live": "polite" }, act);
        numInput(act, { label: "Balance (1):", unit: "rows", onCheck: function (v) { if (v === N.balance) { got.b = 1; fin(); } else saw(out, false, "∀ t ∈ T: one balance row per hour. How many hours are in T?"); } });
        numInput(act, { label: "Sizes (2):", unit: "rows", onCheck: function (v) { if (v === N.size) { got.s = 1; fin(); } else saw(out, false, "∀ g ∈ G, t ∈ T: one row per plant and hour."); } });
        function fin() {
          saw(out, true, (got.b ? "Balance: " + N.balance + " rows. " : "") + (got.s ? "Sizes: " + N.size + " rows." : ""));
          if (got.b && got.s) { api.done(); api.saw("The seven lines stand for " + N.rows + " rows and " + N.variables + " variables. A full year of hours would make the same lines stand for many thousands: the indices do the copying."); }
        }
      }
    });

    // 6 bug hunt
    steps.push({
      text: "Five colleagues each sent this model with one line changed. Pick a suspect, tap the line that is wrong, then run it to see what the error does.",
      build: function (act, api) {
        var found = {}, cur = 0, tabs = H("div", { class: "b3-tabs" }, act);
        var sg = seg(tabs, J.bugs.map(function (b, i) { return "Suspect " + (i + 1); }), 0, function (i) { cur = i; show(); }, "Choose a suspect model");
        var area = H("div", { class: "b3-suspect" }, act);
        var ref0 = H("details", { class: "lx-textalt" }, act); H("summary", { text: "Compare with the correct model" }, ref0); readLines(ref0, J, {});
        function show() {
          var b = J.bugs[cur], lines = {}; lines[b.line] = b.html; area.innerHTML = "";
          var fb = null, runOut = null;
          var F = readLines(area, J, { lines: lines, aria: "Suspect " + (cur + 1) + ": select the wrong line", onPick: function (k) {
            F.mark();
            if (k === b.line) { F.mark(k, "right"); found[b.key] = 1; mark(); reveal(); }
            else { F.mark(k, "wrong"); saw(fb, false, "This line is the same as in the correct model. Read the others again, units and signs included."); }
          } });
          fb = H("div", { "aria-live": "polite" }, area);
          function reveal() {
            fb.innerHTML = "";
            var d = H("div", { class: "lx-saw", html: LX.icon("check") + "<div><b>" + LX.esc(b.name) + ".</b> " + LX.esc(b.fix) + " <span class='b3-caught'>Caught by " + LX.esc(b.caught) + ".</span></div>" }, fb);
            var run = H("button", { type: "button", class: "lx-btn ghost small", html: LX.icon("play") + "Run this model" }, fb);
            runOut = H("p", { class: "b3-sym", "aria-live": "polite" }, fb);
            run.addEventListener("click", function () {
              runOut.textContent = "Solving…";
              Promise.all([solve(b.key), solve(null)]).then(function (rs) { runOut.textContent = rs[0].ok || rs[0].status !== "unavailable" ? symptom(b.key, rs[0], rs[1], inst) : "The solver could not load here."; });
            });
            if (Object.keys(found).length === J.bugs.length) { api.done(); api.saw("All five found. Each model still solves to “optimal”: the solver checks the mathematics, not whether the mathematics says what you meant."); }
          }
          if (found[b.key]) { F.mark(b.line, "right"); reveal(); }
        }
        function mark() { sg.buttons.forEach(function (bt, i) { bt.textContent = (found[J.bugs[i].key] ? "✓ " : "") + "Suspect " + (i + 1); }); }
        show();
        if (LX.solver && LX.solver.preload) LX.solver.preload();
      }
    });

    // 7 check a solved model
    steps.push({
      text: "Now solve the correct model and check it. Tap each hour to test its energy balance, then predict the sign of the balance [[shadow-price|duals]] before you see them.",
      build: function (act, api) {
        var go = H("button", { type: "button", class: "lx-btn small", html: LX.icon("play") + "Solve the correct model" }, act);
        var stHost = H("div", null, act), status = LX.SolverStatus ? LX.SolverStatus(stHost) : null;
        var tbl = H("div", { class: "b3-check" }, act), said = H("p", { class: "b3-note", "aria-live": "polite" }, act), pred = H("div", { class: "b3-pred" }, act), out = H("div", { "aria-live": "polite" }, act);
        var checked = {}, predicted = false;
        go.addEventListener("click", function () {
          if (status) status.set("solving");
          solve(null).then(function (s) {
            if (status && s.ms) status.set({ status: s.ok ? "optimal" : s.status, ok: s.ok, kind: "lp", objective: s.objective, ms: s.ms });
            if (!s.ok) { saw(out, false, "The solver could not run here. The precomputed answer: " + money(ref.objective) + "."); s = null; }
            refSum = s; draw(s);
          });
        });
        function draw(s) {
          tbl.innerHTML = "";
          var hd = H("div", { class: "b3-cr head" }, tbl); ["Hour", "Plants", "Unmet", "Sum", "Demand"].forEach(function (t) { H("span", { text: t }, hd); });
          T.forEach(function (t, k) {
            var x = s ? s.rows[k] : null, P = G.map(function (g) { return x ? x[g] : ref.p[g][k]; }), u = x ? x.u : ref.u[k];
            var b = H("button", { type: "button", class: "b3-cr", "aria-label": "Check the balance at " + t + ":00: plants " + P.map(Math.round).join(" + ") + " MW, unmet " + Math.round(u) + " MW, demand " + inst.d[t] + " MW" }, tbl);
            H("span", { text: t + ":00" }, b); H("span", { class: "pl", text: P.map(Math.round).join(" + ") }, b); H("span", { text: String(Math.round(u)) }, b);
            var sumEl = H("span", { class: "sum", text: "?" }, b); H("span", { text: String(inst.d[t]) }, b);
            b.addEventListener("click", function () {
              var sum = P.reduce(function (a, v) { return a + v; }, 0) + u; sumEl.textContent = Math.round(sum) + (Math.abs(sum - inst.d[t]) < 1e-6 ? " ✓" : " ✗");
              b.classList.add(Math.abs(sum - inst.d[t]) < 1e-6 ? "ok" : "bad"); checked[t] = 1;
              said.textContent = t + ":00: the plants and unmet demand add up to " + Math.round(sum) + " MW against " + inst.d[t] + " MW of demand: " + (Math.abs(sum - inst.d[t]) < 1e-6 ? "balanced." : "not balanced."); fin();
            });
          });
          H("p", { class: "b3-note", text: "Plants, left to right: nuclear + wind + solar + combined-cycle + peaker, in MW. Wind and sun not used are spilled for free." }, tbl);
          pred.innerHTML = "";
          H("p", { class: "lx-qtext", text: "A balance dual is the change in total cost if one hour's demand rose by 1 MWh. Its sign here?" }, pred);
          var sg2 = seg(pred, ["Positive or zero", "Negative"], -1, function (i) { predicted = true; reveal(i === 0); }, "Predict the sign of the balance duals");
          sg2.el.classList.add("b3-predseg");
        }
        function reveal(right) {
          var d = (refSum && refSum.rows.map(function (x) { return x.dual; })) || ref.balanceDuals;
          saw(out, right, (right ? "Right. " : "Not here. ") + "Balance duals: " + T.map(function (t, k) { return t + ":00 $" + Math.round(d[k]); }).join(", ") + " per MWh, all ≥ 0 for these inputs.");
          var why = H("ul", { class: "b3-why" }, out);
          H("li", { text: "Why ≥ 0 here: no hour sits at the least output that nuclear and the ramp allow, so extra demand adds cost, or none where spilled wind and sun cover it." }, why);
          H("li", { text: "Extra demand can lower the cost across linked hours: cut 17:00 demand to 105 MW, the least nuclear and the ramp allow, and one more MWh lets the combined-cycle plant run higher later, in place of the peaker: a dual of −$140." }, why);
          H("li", { text: "Upper limits, such as the weather limits and the ramp's climb, have duals ≤ 0: loosening a cap never raises the cheapest cost." }, why);
          fin();
        }
        function fin() {
          if (Object.keys(checked).length === T.length && predicted) { api.done(); api.saw("Balanced in all four hours, duals with the signs these inputs imply: two checks passed. Why $0 at 17:00 and $80 at 18:00? Go deeper below."); }
        }
      }
    });

    // 8 verification or validation
    steps.push({
      text: "[[verification|Verification]] asks whether the equations and code implement the intended model correctly. [[validation|Validation]] asks whether that model is right enough for the question. Sort six checks.",
      build: function (act, api) {
        var right = {}, list = H("div", { class: "b3-vv" }, act);
        J.vv.forEach(function (v, i) {
          var row = H("div", { class: "b3-vvrow" }, list); H("p", { text: v.text }, row);
          var mark = H("span", { class: "k4-mark", "aria-live": "polite" }, row);
          seg(row, ["Verification", "Validation"], -1, function (k) {
            right[i] = k === v.answer; mark.textContent = right[i] ? "Right" : "Not quite"; mark.className = "k4-mark " + (right[i] ? "good" : "bad");
            if (J.vv.every(function (x, j) { return right[j]; })) { api.done(); api.saw("Three checks look inside the model: verification. Three compare it with the world or with experts: validation, which needs the same fleet, demand, dates and boundary. Prairie Town is fictional: experts can judge only its plausibility."); }
          }, "Verification or validation: " + v.text);
        });
      }
    });

    var cards = LX.StepCards(live, { id: "b3-steps", steps: steps, onStep: function () { LX.emit("layout"); } }), PR = null;
    LX.demo(root, function (state) {   // core.js LX.demo: mid = step 3 with both sums; bugs = step 6, first suspect found; check = step 7 solved
      // pr-<exercise key>: that practice exercise open, its hints shown and its answer checked; pr-<key>-open: just opened
      var m = /^pr-(\w+?)(-open)?$/.exec(state);
      if (m && PR) {
        var at = PR.find(m[1]); if (!at) return null;
        PR.go(at[0], at[1], false);
        if (!m[2]) { var c = PR.cur(); for (var h = 0; h < 3; h++) c.hint(); setTimeout(function () { c.show(); }, 400); }
        return { view: "practice " + m[1] };
      }
      if (state === "key") { cards.go(0); var kd = live.querySelector(".b3-key"); if (kd) kd.open = true; return { view: "step 1, the symbol key open" }; }
      var k = { mid: 2, bugs: 5, check: 6, units: 3 }[state]; if (k == null) return null; cards.go(k);
      if (state === "mid") { var ch = live.querySelectorAll(".b3-ch")[2], rh = live.querySelectorAll(".b3-rh")[3]; if (ch) ch.click(); if (rh) rh.click(); }
      if (state === "bugs") { var l = live.querySelector(".lx-fline[aria-label^='costs']"); if (l) l.click(); var r = [].filter.call(live.querySelectorAll(".b3-suspect .lx-btn"), function (b) { return /Run/.test(b.textContent); })[0]; if (r) r.click(); }
      if (state === "check") { var g = live.querySelector(".b3-check") && [].filter.call(live.querySelectorAll(".lx-btn"), function (b) { return /Solve the correct/.test(b.textContent); })[0]; if (g) g.click(); setTimeout(function () { live.querySelectorAll(".b3-cr:not(.head)").forEach(function (b) { b.click(); }); var p = live.querySelector(".b3-predseg button"); if (p) p.click(); }, 600); }
      return { view: "step " + (k + 1) };
    }, cards);
    explain(J, inst, ref, N);
    PR = practice(J, data);
  }

  function explain(J, inst, ref, N) {
    var x = document.getElementById("b3-explain"); if (!x) return; x.innerHTML = "";
    // the balance, symbol by symbol (LX.EquationCard, components/equation.js)
    LX.EquationCard(H("div", { class: "lx-xcard" }, x), {
      title: "The balance, symbol by symbol",
      lede: "Tap a symbol: what it means, its units, and how a modeling language writes it.",
      label: "Symbols of the balance rule; select one",
      rows: [{ parts: [{ k: "sum", html: "Σ<sub>g∈G</sub>" }, { k: "p", html: "<i>p<sub>g,t</sub></i>" }, "+", { k: "u", html: "<i>u<sub>t</sub></i>" }, "=", { k: "d", html: "<i>d<sub>t</sub></i>" },
                       { k: "all", html: "∀ <i>t</i> ∈ <i>T</i>" }] }],
      symbols: {
        sum: { name: "Σ over g ∈ G", words: "Add the next term once for every plant in the set G: five terms.", units: "keeps the unit of the term", code: "sum(m.p[g, t] for g in m.G)" },
        p: { name: "p(g,t): output", words: "A decision variable with two indices: the output of plant g in hour t.", units: "MW", code: "m.p = Var(m.G, m.T, within=NonNegativeReals)" },
        u: { name: "u(t): unserved demand", words: "Demand left unmet in hour t; it carries the penalty V in the objective so the solver uses it only as a last resort.", units: "MW", code: "m.u = Var(m.T, within=NonNegativeReals)" },
        d: { name: "d(t): demand", words: "A parameter: given, not chosen. Here it comes from the real shape of 3 September 2025.", units: "MW", code: "m.d = Param(m.T, initialize=demand)" },
        all: { name: "∀ t ∈ T: for all hours", words: "Write this row once for every hour: " + N.balance + " rows from one line. Forget it and the rule holds for one hour only.", units: "", code: "Constraint(m.T, rule=balance)" }
      },
      fields: [{ key: "units", label: "Units", alt: true }, { key: "code", label: "In Pyomo", code: true }],
      sel: "sum", textLabel: "Text version of the equation"
    });

    // checklist (LX.Checklist; ticks stored by position under "b3-check", as before)
    LX.Checklist(H("div", { class: "lx-xcard" }, x), { id: "b3-check", title: "Check a model in eight moves", count: "head", soft: true, inline: true, ordered: true,
      lede: "Use it on every model you build or read; ticks stay in this browser.",
      items: [
        { label: "Units", text: "Every term of the objective and of each rule in one unit, Δt included." },
        { label: "Signs", text: "Each ≤, = and ≥ says what the sentence says." },
        { label: "Indices", text: "Every rule carries its ∀ and the indices it needs." },
        { label: "Sums", text: "Each Σ runs over the right set, and nothing is counted twice." },
        { label: "No free lunch", text: "Every variable has a cost, a limit, or a reason to be free." },
        { label: "Balance", text: "In the solution, supply meets demand in every period." },
        { label: "Duals", text: "Prices and limits have the signs the model implies." },
        { label: "Hand check", text: "A toy small enough to solve by hand gives the code's answer." }] });
  }


  // ================================================================ practice (Check section)
  // the faded-practice runner is LX.Practice (components/practice.js)
  var Practice = LX.Practice;

  // ---- exercise pieces
  function valOf(i) { var t = String(i.value).trim().replace(/[−–]/g, "-").replace(/,/g, "").replace(/^\$/, ""); return t === "" ? NaN : +t; }
  function setVal(i, v) { i.value = String(v); }
  function field(host, label, unit, pre) {   // a labeled number box (no button: the runner's Check reads it)
    var id = LX.uid("pf"), row = H("div", { class: "w1h-ans lx-fp-field" }, host);
    H("label", { for: id, text: label }, row);
    if (pre) H("span", { class: "w1h-unit", text: pre }, row);
    var inp = H("input", { id: id, type: "text", inputmode: "decimal", autocomplete: "off", class: "w1h-num" }, row);
    if (unit) H("span", { class: "w1h-unit", text: unit }, row);
    return inp;
  }
  function unitSel(host, labelHtml, units) {
    var id = LX.uid("pu"), row = H("div", { class: "w1h-ans lx-fp-field" }, host);
    H("label", { for: id, html: labelHtml }, row);
    var sel = H("select", { id: id, class: "b3-sel" }, row); H("option", { value: "", text: "unit?" }, sel);
    units.forEach(function (u) { H("option", { value: u, text: u }, sel); });
    return sel;
  }
  function choices(host, labels, q, onPick) {   // a question answered by tapping one of its choices
    var qid = LX.uid("fq"); H("p", { class: "lx-qtext", id: qid, text: q }, host);
    var row = H("div", { class: "lx-qbtns lx-fp-choices", role: "group", "aria-labelledby": qid }, host), bs = [], sel = null;
    labels.forEach(function (l, i) {
      var b = H("button", { type: "button", class: "lx-choice", "aria-pressed": "false", text: l }, row); bs.push(b);
      b.addEventListener("click", function () { sel = i; bs.forEach(function (x, j) { x.setAttribute("aria-pressed", j === i ? "true" : "false"); x.classList.remove("right", "wrong"); }); if (onPick) onPick(i); });
    });
    return { val: function () { return sel; }, pick: function (i) { bs[i].click(); }, mark: function (ok) { if (sel != null) bs[sel].classList.add(ok ? "right" : "wrong"); } };
  }
  function oneLine(host, id, name, tag, html) { return LX.Formulation(host, { views: ["symbols"], rules: [{ id: id, name: name, tag: tag, sym: html }] }); }
  function workedLines(host, pairs) {
    var box = H("div", { class: "lx-fp-wl", role: "list" }, host);
    pairs.forEach(function (p) { var r = H("div", { class: "lx-fp-wrow", role: "listitem" }, box); H("span", { class: "lx-fp-wk", text: p[0] }, r); H("span", { class: "lx-fp-wv", text: p[1] }, r); });
    return box;
  }
  // a solved plan as a table: plants down, hours across (MW); o.hi(g, k) marks cells, o.sum adds the supply row
  function solTable(host, inst, S, o) {
    o = o || {}; host.innerHTML = "";
    var t = H("table", { class: "lx-fp-tab b3-ptab" }, H("div", { class: "lx-fp-tabw" }, host));
    H("caption", { class: "lx-sr", text: "The solved plan, MW, by plant and hour" }, t);
    var hr = H("tr", null, H("thead", null, t)); H("th", { scope: "col", text: "MW" }, hr);
    inst.T.forEach(function (x) { H("th", { scope: "col", text: x + ":00" }, hr); });
    var tb = H("tbody", null, t), r6 = function (v) { return String(Math.round(v * 1e6) / 1e6); };
    var rows = G.map(function (g) { return [GNAME[g], g]; }).concat([["unserved", "u"], ["demand", "d"]]);
    if (o.sum) rows.splice(G.length + 1, 0, ["supply", "sum"]);   // all plants plus unserved
    rows.forEach(function (rw) {
      var tr = H("tr", { class: rw[1] === "d" ? "dem" : rw[1] === "sum" ? "sum" : null }, tb); H("th", { scope: "row", text: rw[0] }, tr);
      S.rows.forEach(function (x, k) {
        var v = rw[1] === "sum" ? G.reduce(function (a, g) { return a + x[g]; }, 0) + x.u : x[rw[1]];
        H("td", { class: "n" + (o.hi && o.hi(rw[1], k) ? " hi" : ""), text: r6(v) }, tr);
      });
    });
    return t;
  }

  function practice(J, data) {
    var host = document.getElementById("b3-practice"); if (!host) return null; host.innerHTML = "";
    var PJ = J.practice, town = data.town, year = data.town_year, inst0 = instance(town, year);
    // specs come first from the precomputed answers (equal to HiGHS's, checked by the Node test), then from the live solves
    var sol = {}, live = {};
    Object.keys(PRACTICE_RUN).forEach(function (k) { sol[k] = fromRef(practiceInst(town, year, J, k), k === "ok" ? J.ref : PJ.ref[k]); });
    function spec(key) { return practiceSpec(key, J, town, year, Object.assign({}, sol, live)); }
    // solve a practice model in the browser (HiGHS), or show the precomputed answer when the solver cannot run
    function runP(key, stHost) {
      var i = practiceInst(town, year, J, key), status = LX.SolverStatus ? LX.SolverStatus(stHost) : null, note = H("p", { class: "b3-note" }, stHost);
      if (!LX.solver) { note.textContent = "The solver could not load here; this is the precomputed answer."; return Promise.resolve(sol[key]); }
      if (status) status.set("solving");
      return LX.solver.solve(buildModel(i, PRACTICE_RUN[key].bug), { timeLimit: 10, key: "b3p-" + key }).then(function (r) {
        if (status) status.set(r);
        if (!r || !r.ok) { note.textContent = "The solver did not finish here; this is the precomputed answer."; return sol[key]; }
        var S = summarize(i, r); live[key] = S; return S;
      });
    }
    function lines(area, bug, o) {   // the whole formulation, with the bug's line changed
      var L = {}; L[PJ.bugs[bug].line] = PJ.bugs[bug].html;
      return readLines(area, J, { lines: L, aria: o && o.aria, onPick: o && o.onPick });
    }
    var B = {
      r1: function (area, api) {
        var s = spec("r1"); oneLine(area, "ramp", J.lineNames.ramp, "(4)", J.lines.ramp); workedLines(area, s.worked);
        H("p", { class: "lx-qtext", text: s.q }, area); var inp = field(area, "Rows", "rows");
        api.hints(s.hints); api.check(function () { return s.check(valOf(inp)); }); api.answer(function () { setVal(inp, s.vars.rows24); });
      },
      r2: function (area, api) {
        var it = PJ.items.r2, s = spec("r2"), sel = {};
        oneLine(area, "store", "storage", "new", PJ.lines.store);
        H("p", { class: "lx-fp-ask", text: it.words }, area);
        var g = H("ul", { class: "lx-fp-given" }, area);
        it.given.forEach(function (x) { H("li", { html: x[0] + ": <b>" + LX.esc(x[1]) + "</b> (given)" }, g); });
        it.ask.forEach(function (x) { sel[x[0]] = unitSel(area, x[1], PJ.units); });
        var rows = field(area, s.rowsQ, "rows");
        api.hints(s.hints);
        api.check(function () { var a = { rows: valOf(rows) }; it.ask.forEach(function (x) { a[x[0]] = sel[x[0]].value; }); return s.check(a); });
        api.answer(function () { it.ask.forEach(function (x) { sel[x[0]].value = x[2]; }); setVal(rows, s.vars.nT); });
      },
      r3: function (area, api) {
        var it = PJ.items.r3, s = spec("r3");
        oneLine(area, "reserve", "reserve", "new", PJ.lines.reserve);
        var ch = choices(area, it.choices, it.q, null);
        var u = unitSel(area, LX.esc(s.unitQ), PJ.units), rows = field(area, s.rowsQ, "rows"), tot = field(area, s.totalQ, "rows");
        api.hints(s.hints);
        api.check(function () { return s.check({ choice: ch.val(), unit: u.value, rows: valOf(rows), total: valOf(tot) }); });
        api.answer(function () { ch.pick(it.answer); u.value = "MW"; setVal(rows, s.vars.res); setVal(tot, s.vars.total); });
      },
      g1: function (area, api) {
        var it = PJ.items.g1, s = spec("g1"), F = lines(area, "vkwh", {}), st = H("div", null, area), tb = H("div", null, area);
        F.set({ sel: PJ.bugs.vkwh.line });
        runP("vkwh", st).then(function (S) { solTable(tb, practiceInst(town, year, J, "vkwh"), S, { hi: function (r) { return r === "u"; } }); });
        workedLines(area, s.worked);
        var ch = choices(area, s.choices, it.q, function () { api.run(); });
        api.hints(s.hints); api.check(function () { var r = spec("g1").check(ch.val()); if (r) ch.mark(r.ok); return r; }, { button: false });
        api.answer(function () { ch.pick(it.answer); });
      },
      g2: function (area, api) {
        var it = PJ.items.g2, s = spec("g2"), picked = null;
        H("p", { class: "lx-fp-ask", text: s.symptom }, area);
        var st = H("div", null, area), tb = H("div", null, area);
        runP("flat", st).then(function (S) { solTable(tb, practiceInst(town, year, J, "flat"), S, { hi: function (r, k) { return r === "nuc" && k === 0; } }); });
        H("p", { class: "lx-fp-ask", text: it.ask }, area);
        var F = lines(area, "flat", { aria: "Select the changed line", onPick: function (k) { picked = k; F.mark(); } });
        var ch = choices(area, it.checks, "Which check catches it?", null);
        api.hints(s.hints);
        api.check(function () { var r = spec("g2").check({ line: picked, choice: ch.val() }); if (r && picked) F.mark(picked, picked === s.line ? "right" : "wrong"); if (r && ch.val() != null && picked === s.line) ch.mark(r.ok); return r; });
        api.answer(function () { F.lines[s.line].click(); ch.pick(it.answer); });
      },
      g3: function (area, api) {
        var s = spec("g3"), picked = null, ran = false;
        H("p", { class: "lx-fp-ask", text: s.ask }, area);
        var F = lines(area, "twice", { aria: "Select the line that causes the shortfall", onPick: function (k) { picked = k; F.mark(); } });
        var go = H("button", { type: "button", class: "lx-btn small", html: LX.icon("play") + "Run the model" }, area);
        var st = H("div", null, area), tb = H("div", null, area);
        go.addEventListener("click", function () { st.innerHTML = ""; runP("twice", st).then(function (S) { ran = true; solTable(tb, practiceInst(town, year, J, "twice"), S, {}); }); });
        var sup = field(area, s.supplyQ, "MW"), sh = field(area, s.shortQ, "MW");
        api.hints(s.hints);
        api.check(function () { var r = spec("g3").check({ ran: ran, supply: valOf(sup), short: valOf(sh), line: picked }); if (r && picked && ran) F.mark(picked, picked === s.line ? "right" : "wrong"); return r; });
        api.answer(function () { if (!ran) go.click(); ran = true; setVal(sup, s.vars.supply); setVal(sh, s.vars.short); F.lines[s.line].click(); });
      },
      k1: function (area, api) {
        var s = spec("k1"), st = H("div", null, area), tb = H("div", null, area), k = inst0.T.indexOf(PJ.items.k1.hour);
        runP("ok", st).then(function (S) { solTable(tb, inst0, S, { sum: true, hi: function (r, j) { return j === k && (r === "sum" || r === "d"); } }); });
        workedLines(area, s.worked);
        H("p", { class: "lx-qtext", text: s.q }, area); var inp = field(area, "Extra cost", null, "$");
        api.hints(s.hints); api.check(function () { return s.check(valOf(inp)); }); api.answer(function () { setVal(inp, s.vars.shift * (s.vars.cPK - s.vars.cCC)); });
      },
      k2: function (area, api) {
        var it = PJ.items.k2, s = spec("k2"), st, tb;
        H("p", { class: "b3-note", text: s.note }, area); st = H("div", null, area); tb = H("div", null, area);
        runP("eve", st).then(function (S) { solTable(tb, s.inst, S, { hi: function (r) { return r === "pk"; } }); });
        workedLines(area, s.worked);
        var pk = field(area, it.pkQ, null, "$"), tot = field(area, it.totalQ, null, "$");
        api.hints(s.hints);
        api.check(function () { return spec("k2").check({ pk: valOf(pk), total: valOf(tot) }); });
        api.answer(function () { setVal(pk, Math.round(s.sol.rows.reduce(function (a, x) { return a + x.pk; }, 0) * s.vars.cPK)); setVal(tot, Math.round(s.sol.trueCost)); });
      },
      k3: function (area, api) {
        var it = PJ.items.k3, s = spec("k3"), ran = false;
        H("p", { class: "b3-note", text: s.note }, area); H("p", { class: "lx-fp-ask", text: it.ask }, area);
        var go = H("button", { type: "button", class: "lx-btn small", html: LX.icon("play") + "Run the model" }, area);
        var st = H("div", null, area), tb = H("div", null, area);
        go.addEventListener("click", function () { st.innerHTML = ""; runP("dip", st).then(function (S) { ran = true; solTable(tb, s.inst, S, {}); }); });
        var sup = field(area, s.supplyQ, "MW"), tot = field(area, s.totalQ, null, "$"), du = field(area, s.dualQ, "$/MWh");
        api.hints(s.hints);
        api.check(function () { var p = spec("k3"), r = p.check({ ran: ran, supply: valOf(sup), total: valOf(tot), dual: valOf(du) }); return r && r.ok ? { ok: true, why: r.why + " " + p.duals } : r; });
        api.answer(function () { if (!ran) go.click(); ran = true; setVal(sup, s.vars.supply); setVal(tot, Math.round(s.sol.trueCost)); setVal(du, s.vars.dual); });
      }
    };
    var tracks = PJ.tracks.map(function (t) {
      return { label: t.label, intro: t.intro, items: t.items.map(function (k) {
        var it = PJ.items[k];
        return { key: k, kind: it.kind, minutes: it.minutes, title: k === "k2" || k === "k3" ? spec(k).title : it.title, build: function (area, api) { B[k](area, api); } };
      }) };
    });
    return Practice(host, { id: "b3-practice", title: PJ.title, lede: PJ.lede, foot: PJ.foot, blank: PJ.blank, tracks: tracks });
  }

  LX.mount("b03", function (live, data, root) { view(live, data, root); });
})();
