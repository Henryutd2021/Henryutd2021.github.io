// 12-trade-offs.js — Lesson 12, "Cheap or clean? How do you weigh cost against emissions?" (step cards, W1).
//
// Data: assets/learn/data/12-trade-offs.json (six hand-made plans for Prairie Town, each with its precomputed year) and
// the shared planning engine of lessons 12 and 13: assets/learn/components/planengine.js (LX.townPlan, in learn.js) with
// data/13-capstone.json (EIA and NREL costs, dated), town_year.json and cf_targets.json.
//
// Model (pure, exported for Node):
//   dominated(plans)        ids of plans beaten on both counts: another plan costs no more and emits no more, and is
//                           strictly better on at least one
//   winner(plans, price)    the weighted sum: the plan with the lowest cost + price x CO2 ($ + $/t x t); ties go to the
//                           lower CO2
//   winners(plans, max)     the price intervals at which each plan wins (0..max $/t), and the plans that never win
//   supported(plans)        non-dominated plans on the lower convex hull of (CO2, cost): only these can win a weighted sum
// The solver runs lesson 13's LP in the browser: capped (epsilon-constraint: least cost with CO2 <= cap) and priced
// (weighted sum: least cost + price x CO2, no cap). For an LP the cap's best plan is also one of the cheapest plans at the
// cap's shadow price; the solver may return another plan that ties, so the price lands near the cap's point or, where the
// frontier is (nearly) straight, further along that piece. Every plan's year is estimated from seven representative weeks.
// Every number the page states is checked by _tests/learn/test_12-trade-offs.js.
(function () {
  "use strict";
  // ---------------------------------------------------------------- pure model
  function better(a, b) { return a.cost <= b.cost + 1e-6 && a.co2 <= b.co2 + 1e-6 && (a.cost < b.cost - 1e-6 || a.co2 < b.co2 - 1e-6); }
  function dominated(plans) {
    return plans.filter(function (p) { return plans.some(function (q) { return q !== p && better(q.result || q, p.result || p); }); }).map(function (p) { return p.id; });
  }
  function R(p) { return p.result || p; }
  function winner(plans, price) {
    var best = null;
    plans.forEach(function (p) {
      var s = R(p).cost + price * R(p).co2;
      if (!best || s < best.score - 1e-6 || (Math.abs(s - best.score) <= 1e-6 && R(p).co2 < R(best.p).co2)) best = { p: p, score: s };
    });
    return { id: best.p.id, score: best.score };
  }
  // breakpoints between winners: walk the lower convex hull from the cheapest plan towards the cleanest
  function winners(plans, max) {
    var out = [], price = 0, cur = winner(plans, 0).id;
    while (true) {
      var c = plans.filter(function (p) { return p.id === cur; })[0], next = null, at = Infinity;
      plans.forEach(function (p) {
        if (R(p).co2 >= R(c).co2 - 1e-6) return;
        var t = (R(p).cost - R(c).cost) / (R(c).co2 - R(p).co2);
        if (t < at - 1e-9 || (Math.abs(t - at) <= 1e-9 && next && R(p).co2 < R(next).co2)) { at = t; next = p; }
      });
      out.push({ id: cur, from: price, to: next ? Math.min(at, max) : max });
      if (!next || at >= max) break;
      price = at; cur = next.id;
    }
    var won = {}; out.forEach(function (w) { won[w.id] = true; });
    return { intervals: out, never: plans.filter(function (p) { return !won[p.id]; }).map(function (p) { return p.id; }) };
  }
  function supported(plans) {
    var w = winners(plans, 1e9), dom = dominated(plans);
    return plans.filter(function (p) { return w.never.indexOf(p.id) < 0 && dom.indexOf(p.id) < 0; }).map(function (p) { return p.id; });
  }
  // the frontier's slope between two plans, in $ per tonne
  function slope(a, b) { return (R(b).cost - R(a).cost) / (R(a).co2 - R(b).co2); }
  // the winners a reader should see on the price slider: every plan that wins some price from 0 to max, in order
  function WINNERS_TO_SEE(plans, max) { return winners(plans, max).intervals.map(function (w) { return w.id; }); }
  var model = { dominated: dominated, winner: winner, winners: winners, supported: supported, slope: slope, toSee: WINNERS_TO_SEE };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H, LESSON = "12-trade-offs";
  function css() {
    if (document.getElementById("lx12-css")) return;
    H("style", { id: "lx12-css", text: [
      ".lx12-plans{display:flex;flex-wrap:wrap;gap:6px}",
      ".lx12-plans button{min-height:40px;padding:0 12px;border-radius:10px;border:1px solid var(--lx-line-2);background:var(--lx-surface);color:var(--lx-ink);font-family:var(--lx-f-display);font-size:14px;cursor:pointer}",
      ".lx12-plans button[aria-pressed=true]{background:var(--lx-ink);color:var(--lx-bg)}",
      ".lx12-plans button.dom{text-decoration:line-through;color:var(--lx-ink-3)}",
      ".lx12-out{font-size:15px;color:var(--lx-ink)}.lx12-out b{font-family:var(--lx-f-mono);font-weight:600}",
      ".lx12-tbl{width:100%;border-collapse:collapse;font-size:14px}.lx12-tbl td,.lx12-tbl th{padding:3px 4px;border-bottom:1px solid var(--lx-line);text-align:left;font-weight:400}",
      ".lx12-tbl .n{text-align:right;font-family:var(--lx-f-mono);font-variant-numeric:tabular-nums;white-space:nowrap}.lx12-tbl th{font-family:var(--lx-f-display);font-size:12.5px;color:var(--lx-ink-3)}",
      ".lx12-tbl td.w{font-size:13px;color:var(--lx-ink-2);min-width:12em}.lx12-scroll{overflow-x:auto;max-width:100%}"
    ].join("") }, document.head);
  }
  var COLORS = { A: "var(--lx-cc)", B: "var(--lx-wind)", C: "var(--lx-solar)", D: "var(--lx-tier-5)", E: "var(--lx-warn)", F: "var(--lx-tier-2)" };

  LX.mount("trade-offs", function (live, data, root) {
    var TP = LX.townPlan; if (!TP || !TP.ui) throw new Error("the planning engine (components/planengine.js) is missing from learn.js");
    var U = TP.ui, fm = U.fm; U.css(); css();
    var cfg = data["13_capstone"], t = data["12_trade_offs"];
    var Y = TP.prepareYear(data.town_year, data.cf_targets, cfg), RW = TP.selectWeeks(Y, cfg.weeks), per = TP.periodsOf(RW), C = TP.costs(cfg, {});
    var plans = t.plans.map(function (p) { return { id: p.id, label: p.label, note: p.note, plan: p.plan, cost: p.result.cost, co2: p.result.co2, spilled: p.result.spilled }; });
    var target = WINNERS_TO_SEE(plans, t.priceMax);
    var byId = {}; plans.forEach(function (p) { byId[p.id] = p; });
    var DOM = dominated(plans), WIN = winners(plans, t.priceMax);
    var S_ = { picked: null, foundDom: false, price: 0, seen: {}, solved: [], priced: null, steel: {}, step: 0 };

    var lay = H("div", { class: "lx-play" }, live);
    var stage = H("div", { class: "lx-play-stage lx13-stage" }, lay), side = H("div", null, lay);
    var card = H("section", { class: "lx13-card", "aria-label": "Plans for Prairie Town, cost against CO₂" }, stage);
    var hd = H("div", { class: "lx13-head" }, card); H("h3", { text: "Prairie Town's plans: cost against CO₂" }, hd);
    var status = LX.SolverStatus(hd);
    H("p", { class: "lx13-sub", text: "Each dot is one plan's year, estimated from seven representative weeks: cost up the side, CO₂ along the bottom. Down and left is better on both." }, card);
    var fc = LX.Frontier(card, { label: "Six plans for Prairie Town and the frontier you trace, cost against CO₂", shadeLabel: "out of reach (approximately)" });
    var tdet = H("details", { class: "lx-textalt" }, card); H("summary", { text: "The six plans in numbers" }, tdet);
    var tsc = H("div", { class: "lx12-scroll" }, tdet), tbl = H("table", { class: "lx12-tbl" }, tsc), hr = H("tr", null, H("thead", null, tbl));
    [["Plan", ""], ["What it builds", ""], ["Cost a year", "n"], ["CO₂ a year", "n"], ["Spilled", "n"]].forEach(function (c) { H("th", { scope: "col", class: c[1], text: c[0] }, hr); });
    var tb = H("tbody", null, tbl);
    plans.forEach(function (p) {
      var tr = H("tr", null, tb); H("td", { html: "<b>" + p.id + "</b> " + LX.esc(p.label) }, tr); H("td", { class: "w", text: p.note }, tr);
      H("td", { class: "n", text: fm.musd(p.cost) }, tr); H("td", { class: "n", text: fm.kt(p.co2) }, tr); H("td", { class: "n", text: fm.pct(p.spilled, 0) }, tr);
    });
    H("p", { class: "lx-hint", text: "Spilled: the share of what the wind and solar farms could make that nobody used. Yearly figures are estimates from seven representative weeks of 2025; lesson 13 checks plans on all 8,760 hours." }, tdet);

    function draw() {
      var pts = plans.map(function (p) {
        var mark = S_.foundDom && DOM.indexOf(p.id) >= 0 ? "dominated" : null;
        if (S_.step === 1 && S_.seenAll && WIN.never.indexOf(p.id) >= 0 && DOM.indexOf(p.id) < 0) mark = "never";
        return { id: p.id, label: p.label, co2: p.co2, cost: p.cost, color: COLORS[p.id], kind: "plan", mark: mark,
                 ring: (S_.step === 0 && S_.picked === p.id) || (S_.step === 1 && winner(plans, S_.price).id === p.id), note: mark === "dominated" ? "dominated" : mark === "never" ? "never wins a weighted sum" : "" };
      });
      if (S_.priced) pts.push({ id: "", label: "Priced at $" + S_.priced.price.toFixed(1) + "/t, no cap", co2: S_.priced.co2, cost: S_.priced.cost, color: "var(--lx-accent)", kind: "price", legend: "Solved with a carbon price" });
      fc.frontier(S_.solved.map(function (s) { return { cap: s.cap, co2: s.co2, cost: s.cost, solved: true }; }), S_.solved.length ? "Frontier you traced: solved caps joined by straight lines" : null);
      fc.plans(pts);
      if (S_.step === 1) { var w = winner(plans, S_.price); fc.price(S_.price, byId[w.id]); } else fc.price(null);
    }
    fc.pick(function (id) { if (S_.step === 0 && S_.onPick) S_.onPick(id); });

    function solveCap(cap) {
      status.set(LX.solver.mode ? "solving" : "loading");
      var o = { cap: cap * 1e3 };
      return LX.solver.solve(TP.weekModel(C, RW, o), { label: "t12-cap", timeLimit: 15 }).then(function (r) {
        status.set(r); if (!r.ok) return null;
        var s = TP.summarize(C, per, r, o), rec = { cap: cap, cost: s.cost, co2: s.co2, dual: s.capDual, plan: s.plan, ms: r.ms.roundTrip };
        S_.solved = S_.solved.filter(function (x) { return x.cap !== cap; }).concat([rec]).sort(function (a, b) { return a.cap - b.cap; });
        LX.store.set("t12-solved", S_.solved.map(function (x) { return { cap: x.cap, cost: x.cost, co2: x.co2, dual: x.dual }; }));
        draw(); return rec;
      });
    }
    function solvePrice(price) {
      status.set("solving");
      return LX.solver.solve(TP.weekModel(C, RW, { price: price }), { label: "t12-price", timeLimit: 15 }).then(function (r) {
        status.set(r); if (!r.ok) return null;
        var s = TP.summarize(C, per, r, {});
        S_.priced = { price: price, cost: s.cost, co2: s.co2 }; draw(); return S_.priced;
      });
    }
    var planNote = function (rec) {   // the cost in one sentence, what the plan builds in the next
      var p = rec.plan, gas = Math.round(p.cc + p.pk);
      return "Cap " + rec.cap + " kt: " + fm.musd(rec.cost) + " a year. It builds wind " + Math.round(p.wind) + " MW, solar " + Math.round(p.solar) + " MW, gas " + gas + " MW" +
        (p.nuc > 0.5 ? ", nuclear " + Math.round(p.nuc) + " MW" : "") + (p.bp > 0.5 ? " and a " + Math.round(p.bp) + " MW / " + Math.round(p.be) + " MWh battery" : "") + ".";
    };

    var steps = [
      { text: "Six hand-made plans for Prairie Town, with yearly cost and CO₂ estimated from seven weeks of 2025 by lesson 13's model. Tap the plan that another beats on both counts.",
        build: function (act, api) {
          S_.step = 0; draw();
          var row = H("div", { class: "lx12-plans", role: "group", "aria-label": "Pick the plan that is beaten on both counts" }, act), btn = {};
          plans.forEach(function (p) { btn[p.id] = H("button", { type: "button", "aria-pressed": "false", text: p.id + " · " + p.label, onclick: function () { S_.onPick(p.id); } }, row); });
          S_.onPick = function (id) {
            S_.picked = id; Object.keys(btn).forEach(function (k) { btn[k].setAttribute("aria-pressed", k === id ? "true" : "false"); });
            if (DOM.indexOf(id) >= 0) {
              S_.foundDom = true; btn[id].classList.add("dom");
              var d = byId.D, e = byId[id], farms = [e.plan.wind ? "wind" : "", e.plan.solar ? "solar" : ""].filter(Boolean);
              api.saw("Right: plan D costs " + fm.musd(e.cost - d.cost) + " less a year and emits " + fm.kt(e.co2 - d.co2) + " less, so " + id + " is [[dominated-plan|dominated]]. " +
                id + "'s " + farms.join(" and ") + (farms.length > 1 ? " farms spill " : " farm spills ") + fm.pct(e.spilled, 0) + " of what " + (farms.length > 1 ? "they" : "it") + " could make.");
              api.done();
            } else api.saw("Not this one: no plan both costs less and emits less than " + id + " (" + byId[id].label + ").", true);
            draw();
          };
          if (S_.foundDom) S_.onPick(DOM[0]);
        } },
      { text: "Put a [[carbon-price|price on carbon]]: each plan scores its cost plus the price times its CO₂, and the lowest score wins. Slide the price until you have seen " + target.length + " different winners.",
        build: function (act, api) {
          S_.step = 1;
          var out = H("p", { class: "lx12-out", "aria-live": "polite" }, act), prog = H("p", { class: "lx13-sub" }, act);
          var n = U.Num(act, { label: "Carbon price", color: "var(--lx-accent)", min: 0, max: t.priceMax, step: t.priceStep, value: S_.price,
            fmt: function (v) { return "$" + v + " per tonne"; }, hint: "Score = cost + price × CO₂. The dashed line joins equal scores.", onChange: upd });
          function upd(v) {
            S_.price = v; var w = winner(plans, v); S_.seen[w.id] = true;
            out.innerHTML = "At <b>$" + v + "</b> a tonne, plan <b>" + w.id + "</b> wins (" + LX.esc(byId[w.id].label) + "), score " + fm.musd(w.score) + ".";
            var got = target.filter(function (id) { return S_.seen[id]; });
            prog.textContent = "Winners seen: " + got.join(", ") + " (" + got.length + " of " + target.length + ")" + (got.length < target.length ? ". Move the price in small steps." : ".");
            if (got.length >= target.length && !S_.seenAll) {
              S_.seenAll = true; sawWinners(); api.done();
            }
            draw();
          }
          upd(S_.price);
          function sawWinners() {
            api.saw("The winner moves " + WIN.intervals.map(function (x) { return x.id; }).join(" → ") + " as the price rises. Plan " + WIN.never.filter(function (id) { return DOM.indexOf(id) < 0; }).join(", ") +
              " never wins at any price, though no plan beats it on both counts: it sits in a dent between B and D.");
          }
          if (S_.seenAll) { sawWinners(); api.done(); }
        } },
      { text: "Now the solver designs the plan: set a [[emissions-cap|CO₂ cap]] and solve for the cheapest plan under it. Solve four caps to trace the [[pareto-frontier|frontier]].",
        build: function (act, api) {
          S_.step = 2; S_.priced = null; draw();
          var cap = LX.Slider(act, { label: "CO₂ cap", color: "var(--lx-ink-2)", max: t.caps.max, step: t.caps.step, unit: "kt", hint: function () { return "The year's CO₂ may not exceed this."; } });
          cap.set(S_.lastCap != null ? S_.lastCap : t.caps.start);
          var row = H("div", { class: "lx13-rowb" }, act);
          var go = H("button", { class: "lx-btn small", type: "button", html: "Solve" + LX.icon("target") }, row);
          var fill = H("button", { class: "lx-link", type: "button", text: "Fill in the rest of the frontier" }, row);
          var out = H("p", { class: "lx12-out", "aria-live": "polite" }, act);
          function check() {
            if (S_.solved.length < 4) return;
            var lo = S_.solved.filter(function (x) { return x.dual > 0.5 && x.cap > 0; }), a = lo[lo.length - 1], b = lo[0];
            api.saw("At the CO₂ of each hand-made plan, the solver's cheapest plan costs less. The curve steepens" + (a && b && a !== b ? ": the last tonne costs $" + Math.round(a.dual) + " at " + a.cap + " kt and $" + Math.round(b.dual) + " at " + b.cap + " kt." : "."));
            api.done();
          }
          go.addEventListener("click", function () {
            go.disabled = true; S_.lastCap = cap.val();
            solveCap(cap.val()).then(function (rec) { go.disabled = false; if (rec) out.textContent = planNote(rec) + " Solved in " + Math.max(1, Math.round(rec.ms)) + " ms."; check(); });
          });
          fill.addEventListener("click", function () {
            fill.disabled = true; var list = t.caps.sweep.filter(function (c) { return !S_.solved.some(function (x) { return x.cap === c; }); }), i = 0;
            (function next() { if (i >= list.length) { fill.disabled = false; check(); return; } out.textContent = "Solving cap " + list[i] + " kt…"; solveCap(list[i++]).then(next); })();
          });
          if (S_.solved.length) out.textContent = planNote(S_.solved[S_.solved.length - 1]);
          check();
        } },
      { text: "Each capped solve also returns the cap's [[shadow-price|shadow price]]: what one more tonne allowed would save. Use it as a carbon price, with no cap, and see where the solver lands.",
        build: function (act, api) {
          S_.step = 3; draw();
          var usable = S_.solved.filter(function (x) { return x.dual > 0.5 && x.cap >= 25; });
          if (!usable.length) { H("p", { class: "lx13-sub", text: "Go back one step and solve a cap below 790 kt first." }, act); return; }
          var pick = S_.useCap != null ? usable.filter(function (x) { return x.cap === S_.useCap; })[0] : null;
          pick = pick || usable.filter(function (x) { return x.cap === 200; })[0] || usable[Math.floor(usable.length / 2)];
          var seg = H("div", { class: "lx-seg", role: "group", "aria-label": "Cap to read" }, act);
          var out = H("p", { class: "lx12-out", "aria-live": "polite" }, act);
          var go = H("button", { class: "lx-btn small", type: "button" }, act);
          var res = H("p", { class: "lx12-out", "aria-live": "polite" }, act);
          function sel(x) {
            pick = x; S_.useCap = x.cap;
            [].forEach.call(seg.children, function (b) { b.setAttribute("aria-pressed", b.textContent === x.cap + " kt" ? "true" : "false"); });
            out.innerHTML = "At a cap of <b>" + x.cap + " kt</b> the last tonne cut costs <b>$" + x.dual.toFixed(1) + "</b>.";
            go.innerHTML = "Solve with a $" + x.dual.toFixed(1) + "/t price and no cap" + LX.icon("target");
          }
          usable.forEach(function (x) { H("button", { type: "button", text: x.cap + " kt", onclick: function () { sel(x); } }, seg); });
          sel(pick);
          go.addEventListener("click", function () {
            go.disabled = true; var x = pick;
            solvePrice(x.dual).then(function (p) {
              go.disabled = false; if (!p) return;
              res.innerHTML = "The price lands at <b>" + fm.kt(p.co2) + "</b> and <b>" + fm.musd(p.cost) + "</b> a year; the cap's plan: " + fm.kt(x.co2) + ", " + fm.musd(x.cost) + ".";
              var near = Math.abs(p.co2 - x.co2) <= Math.max(5e3, 0.03 * x.co2);
              api.saw(near ? "Two routes, nearly the same point: the cap's plan is also one of the cheapest at that price. A cap fixes the tonnes; a price fixes the cost of each tonne."
                : "Near " + x.cap + " kt the frontier is nearly straight, with a slope close to $" + x.dual.toFixed(1) + "/t: a tiny change in price moves the plan far along it. That is a limit of [[weighted-sum|weighted sums]].");
              api.done();
            });
          });
          if (S_.priced) api.done();
        } },
      { text: "The model maps the trade-off but cannot say which point to pick: that weighs today's bills against climate harm, and who pays. Open the strongest case for each route.",
        build: function (act, api) {
          S_.step = 4; draw();
          LX.Steelman(act, {
            eyebrow: "Steelman: the strongest case for each route", reveal: "details", opened: S_.steel,
            sides: [{ key: "price", title: "The case for a carbon price", text: ["A price charges every tonne the same, so the cheapest cuts happen first, wherever they are. Set to an estimate of the harm a tonne does, it puts climate damage into the bill.", "**Strongest objection:** the harm per tonne is uncertain, so the tonnes cut are uncertain too."] },
                    { key: "cap", title: "The case for a CO₂ cap", text: ["A cap fixes the tonnes, which is what the climate responds to, and can follow a budget set by law or by a climate target.", "**Strongest objection:** the cost of meeting a cap is unknown in advance and can jump, as the frontier's steep end shows."] },
                    { key: "both", title: "What both leave open", wide: true, text: ["Who pays: households, firms or taxpayers, and how costs or revenues are shared. Regulators and elected officials answer for that choice; the model shows each option's cost and CO₂."] }],
            onOpen: function (k) { if (k === "both") return; S_.steel[k] = true; if (S_.steel.price && S_.steel.cap) finish(); }
          });
          function finish() { api.saw("Neither route is settled by the model. It shows what each point costs; people with the authority to choose, and answer for it, decide which point is right."); api.done(); LX.progress.done(LESSON); LX.emit("t12-done"); }
          if (S_.steel.price && S_.steel.cap) finish();
        } }
    ];
    var cards = LX.StepCards(side, { id: "t12-steps", steps: steps });
    draw();
    // demo states (core.js LX.demo): "step-N" opens step N (1-5) with the earlier actions done; "mid" = step 2
    LX.demo(root, function (state) {
      var n = state === "mid" ? 2 : +((/^step-(\d+)$/.exec(state) || [])[1] || 0); if (!n) return null;
      S_.foundDom = true; S_.picked = DOM[0];
      if (n >= 2) { S_.price = 70; WIN.intervals.forEach(function (w) { S_.seen[w.id] = true; }); S_.seenAll = true; }
      var go = function () { cards.go(Math.max(0, Math.min(steps.length - 1, n - 1))); };
      if (n >= 3) {
        var caps = n === 3 ? [400] : [700, 500, 400, 300, 200, 100];
        caps.reduce(function (p, c) { return p.then(function () { return solveCap(c); }); }, Promise.resolve()).then(function () { if (n >= 5) S_.steel = { price: true, cap: true }; go(); });
      } else go();
      return { view: "step " + n };
    }, cards);
    buildExplain(plans, DOM, WIN, cfg, fm);
  });

  // ---------------------------------------------------------------- the explain layer
  function buildExplain(plans, DOM, WIN, cfg, fm) {
    var host = document.getElementById("t12-explain"); if (!host) return;
    host.innerHTML = ""; host.classList.add("is-live");
    var at = function (cap) { return cfg.frontier.points.filter(function (p) { return p.cap === cap; })[0]; };
    var p200 = at(200);
    var c1 = H("div", { class: "lx-xcard" }, host);
    var TT = LX.townPlan.ui.TextTable, never = WIN.never.filter(function (id) { return DOM.indexOf(id) < 0; }).join(", ");
    TT(c1, {
      title: "Three ways to weigh cost against CO₂",
      lede: "A carbon tax works like the [[weighted-sum|weighted sum]]; an emissions cap works like the [[epsilon-constraint|epsilon-constraint]] method.",
      columns: [{ key: "name", label: "Method" }, { key: "set", label: "You set" }, { key: "get", label: "You get" }, { key: "all", label: "Finds every frontier plan?" }],
      rows: [
        { color: "var(--lx-warn)", name: "Rule out dominated plans", note: "step 1", set: "Nothing", get: "The plans nobody should pick (here: plan " + DOM.join(", ") + ")", all: "No: it only removes plans" },
        { color: "var(--lx-accent)", name: "Weighted sum", note: "a carbon price, step 2", set: "A price per tonne of CO₂", get: "The plan with the lowest cost + price × CO₂", all: "No: it misses plans in dents (plan " + never + ") and ties on straight pieces" },
        { color: "var(--lx-ink)", name: "Epsilon-constraint", note: "a CO₂ cap, steps 3 and 4", set: "A cap on CO₂", get: "The cheapest plan under the cap, and its [[shadow-price|shadow price]]" + (p200 ? " ($" + p200.dual.toFixed(1) + "/t at 200 kt)" : ""), all: "Yes, one cap at a time" }
      ]
    });
  }
})();
