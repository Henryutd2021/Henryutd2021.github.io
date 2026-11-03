// b03-read-check-formulation.js — Bridge B3, "How do you read a formulation, and check that a model is right?" (step
// cards, Learn W1, 2026-11-02).
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

  // bug: null | "unit" | "sign" | "index" | "double" | "lunch"
  function buildModel(inst, bug) {
    var vars = [], cons = [], T = inst.T, c = {};
    G.forEach(function (g) { c[g] = inst.c[g]; });
    if (bug === "unit") c.pk = inst.c.pk / 1000;                       // $/kWh read as $/MWh
    T.forEach(function (t) {
      G.forEach(function (g) { vars.push({ name: "p_" + g + "_" + t, ub: inst.cap[g], cost: c[g] * inst.dt + (bug === "double" && g === "cc" ? inst.c.cc * inst.dt : 0) }); });
      vars.push({ name: "u_" + t, cost: inst.V * inst.dt });
    });
    T.forEach(function (t, k) {
      if (bug !== "index" || k === 0) {
        var terms = {}; G.forEach(function (g) { terms["p_" + g + "_" + t] = 1; }); terms["u_" + t] = 1;
        var row = { name: "bal_" + t, terms: terms }; row[bug === "sign" ? "le" : "eq"] = inst.d[t]; cons.push(row);
      }
      ["wind", "solar"].forEach(function (g) { if (!(bug === "lunch" && g === "wind")) { var w = { name: "wx_" + g + "_" + t, terms: {}, le: inst.a[g][t] }; w.terms["p_" + g + "_" + t] = 1; cons.push(w); } });
      var rt = {}; rt["p_cc_" + t] = 1;
      if (k > 0) { rt["p_cc_" + T[k - 1]] = -1; cons.push({ name: "ramp_" + t, terms: rt, lb: -inst.ramp, ub: inst.ramp }); }
      else cons.push({ name: "ramp_" + t, terms: rt, lb: inst.start - inst.ramp, ub: inst.start + inst.ramp });
      var mr = { name: "must_" + t, terms: {} }; mr.terms["p_nuc_" + t] = 1; mr.eq = inst.cap.nuc; cons.push(mr);
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
    if (bug === "unit") return "Optimal. The peaker, the dearest plant, runs every hour (" + range(s.rows.map(function (x) { return x.pk; })) + " MW). The model reports " + money(s.objective) + "; at real prices the plan costs " + money(s.trueCost) + ".";
    if (bug === "sign") return "Optimal at " + money(s.objective) + ". Only nuclear and the combined-cycle plant's ramp minimum run; supply falls short of demand by " + range(short) + " MW every hour.";
    if (bug === "index") return "Optimal at " + money(s.objective) + ". " + hrs[0] + ":00 balances; from " + hrs[1] + ":00 to " + hrs[hrs.length - 1] + ":00 supply falls short by up to " + Math.round(Math.max.apply(null, short)) + " MW, and no unserved demand is counted.";
    if (bug === "double") return "Optimal. The model reports " + money(s.objective) + ", but the plan's true cost is " + money(s.trueCost) + ", and it now runs the peaker: " + money(s.trueCost - ref.trueCost) + " dearer than the right plan's " + money(ref.trueCost) + ".";
    if (bug === "lunch") return "Optimal at " + money(s.objective) + ". The wind farm makes " + range(s.rows.map(function (x) { return x.wind; })) + " MW while the wind allowed " + range(hrs.map(function (t) { return inst.a.wind[t]; })) + " MW.";
    return "";
  }

  var model = { townDay: townDay, instance: instance, buildModel: buildModel, summarize: summarize, counts: counts, symptom: symptom, money: money, G: G, GNAME: GNAME };
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

  // a formulation shown line by line; lines are buttons when o.onPick is given
  function Formulation(host, J, o) {
    var box = H("div", { class: "b3-form", role: o.onPick ? "group" : null, "aria-label": o.aria || null }, host), btns = {};
    ["par", "obj", "bal", "size", "wx", "ramp", "must"].forEach(function (k, i) {
      var html = (o.lines && o.lines[k]) || J.lines[k];
      var el = o.onPick ? H("button", { type: "button", class: "b3-line", "aria-pressed": "false" }, box) : H("div", { class: "b3-line" }, box);
      H("span", { class: "b3-ln", text: k === "par" ? "data" : k === "obj" ? "goal" : "(" + (i - 1) + ")" }, el);
      H("span", { class: "b3-lx", html: html }, el);
      if (o.onPick) { el.setAttribute("aria-label", J.lineNames[k] + ": " + el.textContent.replace(/\s+/g, " ")); el.addEventListener("click", function () { o.onPick(k, el); }); }
      btns[k] = el;
    });
    return { btns: btns, el: box };
  }

  function view(live, data, root) {
    var J = data.b03_read_check_formulation, inst = instance(data.town, data.town_year), ref = J.ref, N = counts(inst);
    var T = inst.T, steps = [], solved = {}, refSum = null;
    function solve(bug) {
      var key = bug || "ok";
      if (solved[key]) return Promise.resolve(solved[key]);
      if (!LX.solver) return Promise.resolve({ ok: false, status: "unavailable" });
      return LX.solver.solve(buildModel(inst, bug), { timeLimit: 3, key: "b3-" + key }).then(function (r) { var sm = summarize(inst, r); sm.ms = r.ms; solved[key] = sm; return sm; });
    }
    var col19 = T.indexOf(19), sumCol = G.reduce(function (a, g) { return a + ref.p[g][col19]; }, 0), sumRow = ref.p.cc.reduce(function (a, v) { return a + v; }, 0);

    // 1 reading order
    steps.push({
      text: "A published model reads in a fixed sequence: sets, [[parameter|parameters]], variables, objective, constraints. Open each block to see it in plain words.",
      build: function (act, api) {
        var seen = {}, box = H("div", { class: "b3-blocks" }, act);
        J.blocks.forEach(function (b, i) {
          var d = H("details", { class: "b3-block" }, box), s = H("summary", null, d);
          H("span", { class: "b3-bn", text: String(i + 1) }, s); H("b", { text: b.head }, s); H("span", { class: "b3-bh", html: b.html }, s);
          H("p", { text: b.words }, d);
          d.addEventListener("toggle", function () { if (d.open) seen[b.key] = 1; if (Object.keys(seen).length === J.blocks.length) { api.done(); api.saw("Sets say what to count over, parameters are given, variables are chosen, the objective scores a plan, the constraints rule plans out. Read every model in this sequence."); } });
        });
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
      text: "Σ over g adds down a column: every plant, one hour. Σ over t adds along a row: one plant, every hour. Tap the column for Σg p(g,19), then the row for Σt p(cc,t).",
      build: function (act, api) {
        var got = {}, out = H("div", { "aria-live": "polite" }, act), out2 = H("div", { "aria-live": "polite" }, act);
        var gr = Grid(act, inst, ref, {
          onCol: function (t, k) {
            gr.head(null, t); gr.mark(function (g, tt) { return tt === t; });
            var parts = G.map(function (g) { return ref.p[g][k]; }), sum = parts.reduce(function (a, v) { return a + v; }, 0);
            saw(out, t === 19, "Σ<sub>g</sub> <i>p</i><sub>g," + t + "</sub> = " + parts.join(" + ") + " = <b>" + sum + " MW</b>" + (t === 19 ? ", the demand at 19:00: this sum is the balance rule." : ". That is hour " + t + ":00; tap 19:00."));
            if (t === 19) got.col = 1; done();
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
        Formulation(act, J, {});
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
        var ref0 = H("details", { class: "lx-textalt" }, act); H("summary", { text: "Compare with the correct model" }, ref0); Formulation(ref0, J, {});
        function show() {
          var b = J.bugs[cur], lines = {}; lines[b.line] = b.html; area.innerHTML = "";
          var fb = null, runOut = null;
          var F = Formulation(area, J, { lines: lines, aria: "Suspect " + (cur + 1) + ": select the wrong line", onPick: function (k, el) {
            Object.keys(F.btns).forEach(function (x) { F.btns[x].setAttribute("aria-pressed", x === k ? "true" : "false"); F.btns[x].classList.remove("right", "wrong"); });
            if (k === b.line) { el.classList.add("right"); found[b.key] = 1; mark(); reveal(); }
            else { el.classList.add("wrong"); saw(fb, false, "This line is the same as in the correct model. Read the others again, units and signs included."); }
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
          if (found[b.key]) { F.btns[b.line].classList.add("right"); reveal(); }
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
        var tbl = H("div", { class: "b3-check" }, act), pred = H("div", { class: "b3-pred" }, act), out = H("div", { "aria-live": "polite" }, act);
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
            var b = H("button", { type: "button", class: "b3-cr", "aria-label": "Check the balance at " + t + ":00" }, tbl);
            H("span", { text: t + ":00" }, b); H("span", { class: "pl", text: P.map(Math.round).join(" + ") }, b); H("span", { text: String(Math.round(u)) }, b);
            var sumEl = H("span", { class: "sum", text: "?" }, b); H("span", { text: String(inst.d[t]) }, b);
            b.addEventListener("click", function () {
              var sum = P.reduce(function (a, v) { return a + v; }, 0) + u; sumEl.textContent = Math.round(sum) + (Math.abs(sum - inst.d[t]) < 1e-6 ? " ✓" : " ✗");
              b.classList.add(Math.abs(sum - inst.d[t]) < 1e-6 ? "ok" : "bad"); checked[t] = 1; fin();
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
          saw(out, right, (right ? "Right. " : "Not here. ") + "Balance duals: " + T.map(function (t, k) { return t + ":00 $" + Math.round(d[k]); }).join(", ") + " per MWh, all ≥ 0: more demand can never make the cheapest plan cheaper while spilling is free. The weather and ramp limits have duals ≤ 0, as limits should.");
          fin();
        }
        function fin() {
          if (Object.keys(checked).length === T.length && predicted) { api.done(); api.saw("Balanced in all four hours, duals with the right signs: two checks passed. Why $0 at 17:00 and $80 at 18:00? Go deeper below."); }
        }
      }
    });

    // 8 verification or validation
    steps.push({
      text: "[[verification|Verification]] asks whether the model does what its equations say. [[validation|Validation]] asks whether it is right enough for the question. Sort six checks.",
      build: function (act, api) {
        var right = {}, list = H("div", { class: "b3-vv" }, act);
        J.vv.forEach(function (v, i) {
          var row = H("div", { class: "b3-vvrow" }, list); H("p", { text: v.text }, row);
          var mark = H("span", { class: "k4-mark", "aria-live": "polite" }, row);
          seg(row, ["Verification", "Validation"], -1, function (k) {
            right[i] = k === v.answer; mark.textContent = right[i] ? "Right" : "Not quite"; mark.className = "k4-mark " + (right[i] ? "good" : "bad");
            if (J.vv.every(function (x, j) { return right[j]; })) { api.done(); api.saw("Three checks look inside the model: verification. Three compare it with the world or with experts: validation. A model needs both, and only the first can be fully automated."); }
          }, "Verification or validation: " + v.text);
        });
      }
    });

    var cards = LX.StepCards(live, { id: "b3-steps", steps: steps, onStep: function () { LX.emit("layout"); } });
    LX.demo(root, function (state) {   // core.js LX.demo: mid = step 3 with both sums; bugs = step 6, first suspect found; check = step 7 solved
      var k = { mid: 2, bugs: 5, check: 6, units: 3 }[state]; if (k == null) return null; cards.go(k);
      if (state === "mid") { var ch = live.querySelectorAll(".b3-ch")[2], rh = live.querySelectorAll(".b3-rh")[3]; if (ch) ch.click(); if (rh) rh.click(); }
      if (state === "bugs") { var l = live.querySelector(".b3-line[aria-label^='costs']"); if (l) l.click(); var r = [].filter.call(live.querySelectorAll(".b3-suspect .lx-btn"), function (b) { return /Run/.test(b.textContent); })[0]; if (r) r.click(); }
      if (state === "check") { var g = live.querySelector(".b3-check") && [].filter.call(live.querySelectorAll(".lx-btn"), function (b) { return /Solve the correct/.test(b.textContent); })[0]; if (g) g.click(); setTimeout(function () { live.querySelectorAll(".b3-cr:not(.head)").forEach(function (b) { b.click(); }); var p = live.querySelector(".b3-predseg button"); if (p) p.click(); }, 600); }
      return { view: "step " + (k + 1) };
    }, cards);
    explain(J, inst, ref, N);
  }

  function explain(J, inst, ref, N) {
    var x = document.getElementById("b3-explain"); if (!x) return; x.innerHTML = "";
    var c1 = H("div", { class: "lx-xcard" }, x), hd = H("header", { class: "lx-x-head" }, c1); H("h3", { text: "The balance, symbol by symbol" }, hd);
    H("p", { class: "lx-lede", text: "Tap a symbol: what it means, its units, and how a modelling language writes it." }, c1);
    var D = {
      sum: { name: "Σ over g ∈ G", words: "Add the next term once for every plant in the set G: five terms.", unit: "keeps the unit of the term", code: "sum(m.p[g, t] for g in m.G)" },
      p: { name: "p(g,t): output", words: "A decision variable with two indices: the output of plant g in hour t.", unit: "MW", code: "m.p = Var(m.G, m.T, within=NonNegativeReals)" },
      u: { name: "u(t): unserved demand", words: "Demand left unmet in hour t; it carries the penalty V in the objective so the solver uses it only as a last resort.", unit: "MW", code: "m.u = Var(m.T, within=NonNegativeReals)" },
      d: { name: "d(t): demand", words: "A parameter: given, not chosen. Here it comes from the real shape of 3 September 2025.", unit: "MW", code: "m.d = Param(m.T, initialize=demand)" },
      all: { name: "∀ t ∈ T: for all hours", words: "Write this row once for every hour: " + N.balance + " rows from one line. Forget it and the rule holds for one hour only.", unit: "", code: "Constraint(m.T, rule=balance)" }
    };
    var eq = H("p", { class: "b3-eqline", role: "group", "aria-label": "Symbols of the balance rule; select one" }, c1), det = H("div", { class: "lx-cdetail", "aria-live": "polite" }, c1), bt = {};
    [["sum", "Σ<sub>g∈G</sub>"], ["p", "<i>p<sub>g,t</sub></i>"], [null, " + "], ["u", "<i>u<sub>t</sub></i>"], [null, " = "], ["d", "<i>d<sub>t</sub></i>"], [null, "  "], ["all", "∀ <i>t</i> ∈ <i>T</i>"]].forEach(function (tk) {
      if (!tk[0]) { H("span", { class: "b1-eqtxt", html: tk[1] }, eq); return; }
      var b = H("button", { type: "button", class: "b1-eqtok", "aria-pressed": "false", html: tk[1] }, eq); bt[tk[0]] = b;
      b.addEventListener("click", function () { pick(tk[0]); });
    });
    function pick(k) {
      Object.keys(bt).forEach(function (q) { bt[q].setAttribute("aria-pressed", q === k ? "true" : "false"); });
      var d = D[k]; det.innerHTML = ""; H("h4", { text: d.name }, det); H("p", { text: d.words }, det);
      if (d.unit) { var u = H("div", { class: "ingame" }, det); H("b", { text: "Units" }, u); H("span", { text: d.unit }, u); }
      var c = H("div", { class: "ingame" }, det); H("b", { text: "In Pyomo" }, c); H("code", { text: d.code }, c);
    }
    pick("sum");
    var alt = H("details", { class: "lx-textalt" }, c1); H("summary", { text: "Text version of the equation" }, alt);
    var ul = H("ul", null, alt); Object.keys(D).forEach(function (k) { H("li", { text: D[k].name + ": " + D[k].words + (D[k].unit ? " Units: " + D[k].unit + "." : "") }, ul); });

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

  LX.mount("b03", function (live, data, root) { view(live, data, root); });
})();
