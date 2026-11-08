// 08-merit-order.js — Lesson 8, "Who runs, and what sets the price?" (step cards, Analyst tier).
//
// Data: assets/learn/data/08-merit-order.json (the hour, gas-price settings, heat rates, the illustrative credit and
// inflexible offer, sources), assets/learn/data/town.json (Prairie Town's fleet) and town_year.json (real 2025 SPP shapes).
//
// Model (closed form; one hour of lesson 0's day, cut and rounded exactly as lesson 0 does):
//   offers ($/MWh)   wind 0 (or -credit), solar 0, nuclear 10 (or the inflexible offer), combined-cycle and peaker =
//                    heat rate x gas price + other running costs (at the reference gas price: lesson 0's $40 and $100)
//   available MW     wind = round(shape x wind farm size), solar = round(shape x 200), nuclear 100, cc 150, peaker 100
//   the stack        offers sorted cheapest first (ties keep the order wind, solar, nuclear, cc, peaker)
//   clearing         fill demand from the bottom of the stack; the block that serves the last MW is the marginal plant
//                    and its offer is the clearing price, paid to every running plant (uniform price). At an exact block
//                    edge the lower block is marginal. Unused wind and solar are curtailed (spilled).
//   cost             total running cost = sum of offer x MW; within a block, cost(D + 1) - cost(D) = the price
//                    (the clearing price is the shadow price of "supply = demand" in the dispatch linear program)
//   teaser           a line of limited size between the wind farm and town: the wind that reaches town is capped
// Offers start equal to running costs; the step-6 switches change offers only (a credit, a stop-and-restart offer), not
// the plants' physics. _tests/learn/test_08-merit-order.js checks the model's identities, the numbers written on the page
// and in the explain layer, the gas presets against the slider's step, and a HiGHS solve of the same LP.
(function () {
  "use strict";

  // ---------------------------------------------------------------- pure model (no DOM; exported for Node)
  var ORDER = ["wind", "solar", "nuclear", "cc", "peaker"];
  // the hour of lesson 0's day (same slicing and rounding as grid-operator.js prepare())
  function hourOf(town, year, D) {
    var sc = town.scenarios.lesson0, f = town.fleet, t = D.hour;
    var t0 = Date.parse(year.start_utc + "Z"), d0 = Date.parse(sc.date + "T00:00:00Z");
    var i = Math.round((d0 - t0) / 3600000) + 1 - (sc.utcOffsetHours || 0) + t;
    var ws = year.wind[i] / 1000, ss = year.solar[i] / 1000;
    var wind = Math.round(ws * f.wind.mw), solar = Math.round(ss * f.solar.mw);
    var raw = year.demand[i] / 1000 * sc.demandPeakMW;
    var need = Math.round((raw - f.nuclear.mw - wind - solar) / sc.step) * sc.step;
    return { t: t, date: sc.date, dateLabel: sc.dateLabel, windShape: ws, solarShape: ss, wind: wind, solar: solar, demand: need + f.nuclear.mw + wind + solar };
  }
  function gasOffer(D, key, gas) { var p = D.plants[key]; return p.heatRate * gas + p.other; }
  // st: {gas, windMW, credit, inflexible}
  function stack(town, D, h, st) {
    var f = town.fleet, s = st || {}, gas = s.gas == null ? D.gas.ref : s.gas, wMW = s.windMW == null ? f.wind.mw : s.windMW;
    var blocks = [
      { key: "wind", mw: Math.round(h.windShape * wMW), offer: s.credit ? -D.credit.value : f.wind.cost },
      { key: "solar", mw: h.solar, offer: f.solar.cost },
      { key: "nuclear", mw: f.nuclear.mw, offer: s.inflexible ? D.inflexible.offer : f.nuclear.cost },
      { key: "cc", mw: f.cc.mw, offer: gasOffer(D, "cc", gas) },
      { key: "peaker", mw: f.peaker.mw, offer: gasOffer(D, "peaker", gas) }
    ];
    return blocks.sort(function (a, b) { return a.offer - b.offer || ORDER.indexOf(a.key) - ORDER.indexOf(b.key); });
  }
  function clear(blocks, demand) {
    var left = demand, cum = 0, cost = 0, out = {}, marginal = null, total = 0;
    blocks.forEach(function (b) {
      var use = Math.max(0, Math.min(b.mw, left));
      out[b.key] = { key: b.key, mw: b.mw, offer: b.offer, run: use, start: cum };
      if (use > 0 && left - use <= 1e-9 && !marginal) marginal = b.key;
      left -= use; cum += b.mw; cost += use * b.offer; total += b.mw;
    });
    if (!marginal && demand <= 1e-9) marginal = blocks[0].key;
    var price = marginal ? out[marginal].offer : NaN, spilled = 0;
    ["wind", "solar"].forEach(function (k) { if (out[k]) spilled += out[k].mw - out[k].run; });
    return { price: price, marginal: marginal, cost: cost, plants: out, short: Math.max(0, left), spilled: spilled, total: total };
  }
  function run(town, D, h, st, demand) { return clear(stack(town, D, h, st), demand == null ? h.demand : demand); }
  // the teaser: wind reaches town only up to the line's size; the rest stays at the wind farm
  function lineCase(town, D, h, st, lineMW) {
    var b = stack(town, D, h, st).map(function (x) { return Object.assign({}, x, x.key === "wind" ? { mw: Math.min(x.mw, lineMW) } : {}); });
    var windAll = Math.round(h.windShape * (st.windMW || town.fleet.wind.mw));
    return { town: clear(b, h.demand), windAvail: windAll, windToTown: Math.min(windAll, lineMW), stranded: Math.max(0, windAll - lineMW) };
  }
  // the same hour as a linear program for the solver: one variable per plant (0 to its MW, cost = its offer), one balance row
  function lp(blocks, demand) {
    var terms = {}; blocks.forEach(function (b) { terms[b.key] = 1; });
    return { sense: "min", variables: blocks.map(function (b) { return { name: b.key, lb: 0, ub: b.mw, cost: b.offer }; }),
             constraints: [{ name: "demand", terms: terms, eq: demand }] };
  }
  var model = { ORDER: ORDER, hourOf: hourOf, gasOffer: gasOffer, stack: stack, clear: clear, run: run, lineCase: lineCase, lp: lp };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H, S = LX.S, LESSON = "08-merit-order";
  var COL = { wind: "var(--lx-wind)", solar: "var(--lx-solar)", nuclear: "var(--lx-nuc)", cc: "var(--lx-cc)", peaker: "var(--lx-pk)" };
  var NAME = { wind: "Wind farm", solar: "Solar farm", nuclear: "Nuclear plant", cc: "Gas combined-cycle", peaker: "Gas peaker" };
  var SHORT = { wind: "Wind", solar: "Solar", nuclear: "Nuclear", cc: "Gas CC", peaker: "Peaker" };
  function usd(v, d) { d = d == null ? 2 : d; return (v < -1e-9 ? "−\u2060$" : "$") + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }); }

  function css() {
    if (document.getElementById("lx8-css")) return;
    H("style", { id: "lx8-css", text: [
      ".lx8-set{margin:0}",
      ".lx8-plants{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px}",
      ".lx8-plants .lx-choice{display:grid;grid-template-columns:auto 1fr;gap:2px 10px;align-items:center}",
      ".lx8-plants .lx-choice small{grid-column:2;font-family:var(--lx-f-mono);font-size:12.5px;font-weight:400;color:var(--lx-ink-3)}",
      ".lx8-plants .lx-choice[disabled]{opacity:.45;cursor:default}",
      ".lx8-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px}",
      ".lx8-tile{border:1px solid var(--lx-line);border-radius:10px;padding:8px 12px;background:var(--lx-surface-2);display:grid;gap:2px}",
      ".lx8-tile span{font-size:12.5px;color:var(--lx-ink-3)}",
      ".lx8-tile b{font-family:var(--lx-f-mono);font-size:18px;font-weight:600;color:var(--lx-ink)}",
      ".lx8-tile small{font-size:12.5px;color:var(--lx-ink-2)}",
      ".lx8-sw{display:flex;flex-wrap:wrap;gap:8px}",
      ".lx8-sw .lx-choice{flex:1 1 220px}",
      ".lx8-sw .lx-choice .st{margin-left:auto;font-family:var(--lx-f-mono);font-size:12px;color:var(--lx-ink-3)}",
      ".lx8-sw .lx-choice[aria-pressed=true] .st{color:var(--lx-ink)}",
      ".lx8-marks{display:flex;flex-wrap:wrap;gap:6px}",
      ".lx8-tz{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.3fr) minmax(0,1fr);align-items:center;gap:0;margin:6px 0}",
      ".lx8-node{border:2px solid var(--c);border-radius:12px;padding:10px 12px;display:grid;gap:2px;text-align:center;background:var(--lx-surface-2)}",
      ".lx8-node.w{--c:var(--lx-wind)}.lx8-node.t{--c:var(--lx-ink-3)}",
      ".lx8-node b{font-family:var(--lx-f-display);font-weight:500;font-size:15px;color:var(--lx-ink)}",
      ".lx8-node span,.lx8-wire span{font-family:var(--lx-f-mono);font-size:12.5px;color:var(--lx-ink-2)}",
      ".lx8-wire{display:grid;gap:4px;text-align:center;padding:0 4px}",
      ".lx8-wire b{font-family:var(--lx-f-display);font-weight:500;font-size:13.5px;color:var(--lx-ink)}",
      ".lx8-wire i{display:block;height:4px;border-radius:2px;background:var(--lx-ink)}",
      "@media (max-width:560px){.lx8-tz{grid-template-columns:minmax(0,1fr)}.lx8-wire{padding:8px 0}.lx8-wire i{width:4px;height:28px;justify-self:center}}"
    ].join("\n") }, document.head);
  }

  // the settings a step starts from, named at its top, so a reset between steps is never silent
  function setting(host, text) { return H("p", { class: "lx-hint lx8-set", html: LX.rich("<b>Setting:</b> " + text) }, host); }
  function tiles(host, labels) {
    var g = H("div", { class: "lx8-grid" }, host), out = {};
    labels.forEach(function (l) { var t = H("div", { class: "lx8-tile", "aria-live": "polite" }, g); H("span", { text: l[1] }, t); out[l[0]] = { b: H("b", null, t), s: H("small", null, t) }; });
    return out;
  }

  // the supply stack (LX.SupplyStack): blocks as wide as MW and as high as offers, cleared by this lesson's model
  var SERIES = {}; ORDER.forEach(function (k) { SERIES[k] = { name: NAME[k], short: SHORT[k], color: COL[k] }; });
  function stackChart(host, o) { return LX.SupplyStack(host, { series: SERIES, clear: clear, noLegend: !!(o && o.noLegend) }); }

  function view(live, data, root) {
    css();
    var D = data["08_merit_order"], town = data.town, h = hourOf(town, data.town_year, D), f = town.fleet;
    var base = { gas: D.gas.ref, windMW: f.wind.mw, credit: false, inflexible: false };
    var S_ = { st: Object.assign({}, base), demand: h.demand };
    var at = D.hourLabel + " on " + h.dateLabel;

    var steps = [
      // 1 build the stack
      { text: "Each plant offers its power at a price per MWh, here its running cost, and the operator lines the offers up cheapest first: the [[supply-stack|supply stack]]. Build it, cheapest to dearest.",
        build: function (act, api) {
          var box = H("div", { class: "lx8-plants" }, act), chart = stackChart(act, { noLegend: true }), blocks = stack(town, D, h, base), built = [];
          var shuffled = ["peaker", "wind", "cc", "nuclear", "solar"], btn = {};
          function drawBuilt() { chart.draw(built.length ? built : [{ key: "wind", mw: 0, offer: 0 }], 0, { hideDemand: true }); }
          shuffled.forEach(function (k) {
            var b = blocks.filter(function (x) { return x.key === k; })[0];
            var bt = H("button", { type: "button", class: "lx-choice", "aria-pressed": "false" }, box);
            H("span", { class: "sw", style: "--c:" + COL[k] }, bt); H("span", { text: NAME[k] }, bt); H("small", { text: b.mw + " MW at " + usd(b.offer, 0) + "/MWh" }, bt);
            btn[k] = bt;
            bt.addEventListener("click", function () {
              if (bt.disabled) return;
              var cheapest = blocks.filter(function (x) { return built.indexOf(x) < 0; })[0];
              if (b.offer > cheapest.offer) { api.saw("Not yet: the " + NAME[k].toLowerCase() + " offers " + usd(b.offer, 0) + "/MWh, and a cheaper plant is still waiting.", true); return; }
              built.push(b); bt.disabled = true; bt.setAttribute("aria-pressed", "true"); drawBuilt();
              if (built.length === blocks.length) { api.done(); api.saw("That is the [[merit-order|merit order]] from lesson 0, drawn as a staircase: each step is a plant, as wide as its MW and as high as its offer."); }
              else api.saw(NAME[k] + " placed. Next cheapest?");
            });
          });
          drawBuilt();
        } },
      // 2 move the demand line
      { text: "Demand is a vertical line: this hour the town needs that many MW, whatever the price. Slide it: the last plant needed is the [[marginal-plant|marginal plant]], and its offer sets the [[clearing-price|clearing price]].",
        build: function (act, api) {
          var chart = stackChart(act, {}), tl = tiles(act, [["p", "Clearing price"], ["m", "Set by"], ["c", "Running cost this hour"]]), seen = {};
          var res0 = run(town, D, h, base);
          var sl = LX.Slider(act, { label: "Demand", color: "var(--lx-ink)", min: 20, max: res0.total, step: 1, value: S_.demand, fmt: function (v) { return v + " MW"; },
            hint: function (lo, hi, max, v) { return v === h.demand ? "The real demand shape at " + at + ", scaled as in lesson 0." : ""; }, onChange: function (v) { S_.demand = v; draw(true); } });
          function draw(user) {
            var r = chart.draw(stack(town, D, h, base), sl.val());
            tl.p.b.textContent = usd(r.price) + "/MWh"; tl.m.b.textContent = SHORT[r.marginal]; tl.m.s.textContent = "the marginal plant";
            tl.c.b.textContent = usd(r.cost, 0); tl.c.s.textContent = "offer × MW × 1 hour, added up";
            seen[r.price] = 1;
            if (user && Object.keys(seen).length >= 2) { api.done(); api.saw("The price jumps in steps: it changes only when the demand line crosses into the next plant. At " + sl.val() + " MW the " + NAME[r.marginal].toLowerCase() + " is marginal: " + usd(r.price) + "/MWh."); }
          }
          draw(false);
        } },
      // 3 who is paid what
      { text: "In this uniform-price market, every plant that runs is paid the same clearing price, not its own offer. Tap a plant to see what it keeps per MWh toward its building cost from lesson 7.",
        build: function (act, api) {
          S_.demand = h.demand;
          var chart = stackChart(act, {}), r = chart.draw(stack(town, D, h, base), h.demand), box = H("div", { class: "lx8-plants" }, act), out = H("p", { class: "lx-lede", "aria-live": "polite" }, act);
          ORDER.forEach(function (k) {
            var p = r.plants[k], bt = H("button", { type: "button", class: "lx-choice", "aria-pressed": "false" }, box);
            H("span", { class: "sw", style: "--c:" + COL[k] }, bt); H("span", { text: NAME[k] }, bt); H("small", { text: p.run > 0 ? "runs " + Math.round(p.run) + " MW" : "not needed" }, bt);
            bt.addEventListener("click", function () {
              box.querySelectorAll(".lx-choice").forEach(function (b) { b.setAttribute("aria-pressed", b === bt ? "true" : "false"); });
              out.textContent = p.run > 0
                ? NAME[k] + ": offers " + usd(p.offer) + ", is paid " + usd(r.price) + ", keeps " + usd(r.price - p.offer) + " per MWh" + (r.price - p.offer > 0 ? " to repay its building and upkeep." : ": the marginal plant only covers its running cost.")
                : NAME[k] + ": offers " + usd(p.offer) + ", above the price of " + usd(r.price) + ", so it stays off this hour.";
              api.done();
              api.saw("Cheap plants earn the gap between the price and their offer. That gap, hour after hour, is how a wind farm with a $0 offer repays the building cost you met in lesson 7.");
            });
          });
        } },
      // 4 gas price
      { text: "Gas plants' running cost is mostly fuel, bought by the [[mmbtu|MMBtu]] (million British thermal units). Slide the gas price: when a gas plant is marginal, its fuel cost passes straight into every MWh's price this hour.",
        build: function (act, api) {
          var chart = stackChart(act, {}), tl = tiles(act, [["cc", "Gas CC offers"], ["pk", "Peaker offers"], ["p", "Clearing price"]]);
          var sl = LX.Slider(act, { label: "Gas price", color: "var(--lx-cc)", min: D.gas.min, max: D.gas.max, step: D.gas.step, value: S_.st.gas, fmt: function (v) { return "$" + v.toFixed(2) + "/MMBtu"; },
            hint: function (lo, hi, max, v) { return v === D.gas.ref ? "Prairie Town's reference, behind lesson 0's $40 and $100 (illustrative)." : "Combined-cycle: " + D.plants.cc.heatRate + " MMBtu per MWh × gas + $" + D.plants.cc.other + "."; },
            onChange: function (v) { S_.st.gas = v; draw(true); } });
          var marks = H("div", { class: "lx8-marks" }, act);
          D.gas.marks.forEach(function (mk) { H("button", { type: "button", class: "lx-btn ghost small", text: "$" + mk.value.toFixed(2) + ": " + mk.label, onclick: function () { sl.set(mk.value, true); } }, marks); });
          function draw(user) {
            var st = Object.assign({}, base, { gas: sl.val() }), r = chart.draw(stack(town, D, h, st), h.demand);
            tl.cc.b.textContent = usd(gasOffer(D, "cc", sl.val())); tl.pk.b.textContent = usd(gasOffer(D, "peaker", sl.val()));
            tl.p.b.textContent = usd(r.price); tl.p.s.textContent = "set by the " + SHORT[r.marginal];
            if (user) { api.done(); api.saw("At $" + sl.val().toFixed(2) + "/MMBtu the price is " + usd(r.price) + "/MWh. Each $1 on gas adds $" + D.plants.cc.heatRate.toFixed(2) + " to every MWh, because the marginal combined-cycle plant's [[heat-rate|heat rate]] is " + D.plants.cc.heatRate + " MMBtu per MWh."); }
          }
          draw(false);
        } },
      // 5 add wind
      { text: "Wind's running cost is about zero, so new wind joins the bottom of the stack and pushes everything else to the right. Make the wind farm bigger and watch the clearing price.",
        build: function (act, api) {
          setting(act, "gas back at the " + usd(D.gas.ref) + "/MMBtu reference; only the wind farm's size changes.");
          var chart = stackChart(act, {}), tl = tiles(act, [["p", "Clearing price"], ["m", "Set by"], ["s", "Wind and sun spilled"]]);
          var sl = LX.Slider(act, { label: "Wind farm size", color: "var(--lx-wind)", min: D.wind.min, max: D.wind.max, step: D.wind.step, value: S_.st.windMW, fmt: function (v) { return v + " MW"; },
            hint: function (lo, hi, max, v) { return "At " + D.hourLabel + " it makes " + Math.round(h.windShape * v) + " MW (the real wind of that hour). Wind or sun that is available but not needed is [[curtailment|spilled]]."; }, onChange: function (v) { S_.st.windMW = v; draw(true); } });
          function draw(user) {
            var st = Object.assign({}, base, { windMW: sl.val() }), r = chart.draw(stack(town, D, h, st), h.demand, { xMax: 750 });
            tl.p.b.textContent = usd(r.price); tl.m.b.textContent = SHORT[r.marginal]; tl.s.b.textContent = Math.round(r.spilled) + " MW";
            if (user && r.price <= f.nuclear.cost) {
              api.done();
              api.saw(r.price > 0 ? "The combined-cycle plant is no longer needed: the price falls from $40.00 to " + usd(r.price) + "/MWh for every MWh this hour. Keep going." :
                "Wind and sun now cover demand, so a $0 offer is the last one needed: the price is " + usd(r.price) + "/MWh and " + Math.round(r.spilled) + " MW of wind and sun are spilled. Look who else stopped.");
            }
          }
          draw(false);
        } },
      // 6 below zero
      { text: "Can the price fall below zero? Only if the last plant needed offers below $0, paying to keep running: flip each switch, alone and together, and watch who sets the price.",
        build: function (act, api) {
          S_.st.windMW = Math.max(S_.st.windMW, D.wind.big);
          setting(act, "a " + S_.st.windMW + " MW wind farm and gas at the " + usd(D.gas.ref) + "/MMBtu reference: at " + D.hourLabel + ", wind alone could cover demand.");
          var chart = stackChart(act, {}), tl = tiles(act, [["p", "Clearing price"], ["m", "Set by"], ["s", "Spilled"], ["n", "Nuclear runs"]]);
          var sw = H("div", { class: "lx8-sw" }, act), st = Object.assign({}, base, { windMW: S_.st.windMW });
          var a = toggle("Wind farm earns a production credit", "$" + D.credit.value + "/MWh", "credit"), b = toggle("Nuclear plant: slow to stop and restart", "offers " + usd(D.inflexible.offer, 0), "inflexible");
          var note = H("p", { class: "lx-hint" }, act);
          function toggle(label, sub, k) {
            var bt = H("button", { type: "button", class: "lx-choice", "aria-pressed": "false" }, sw); H("span", { text: label }, bt); H("span", { class: "st", text: sub }, bt);
            bt.addEventListener("click", function () { st[k] = !st[k]; bt.setAttribute("aria-pressed", st[k] ? "true" : "false"); draw(true, k); });
            return bt;
          }
          function draw(user, k) {
            var r = chart.draw(stack(town, D, h, st), h.demand, { xMax: 750 });
            tl.p.b.textContent = usd(r.price); tl.m.b.textContent = SHORT[r.marginal]; tl.s.b.textContent = Math.round(r.spilled) + " MW"; tl.n.b.textContent = Math.round(r.plants.nuclear.run) + " MW";
            note.textContent = k === "credit" ? D.credit.note : k === "inflexible" ? D.inflexible.note : "";
            if (!user) return;
            if (k === "credit") api.saw(st.credit ? "With a [[production-credit|production credit]], the wind farm offers down to " + usd(-D.credit.value, 0) + ". It is the last plant needed, so the price is " + usd(r.price) + "/MWh." : "Credit off: the wind farm offers $0 again.", !st.credit);
            if (k === "inflexible") api.saw(st.inflexible ? "The nuclear plant now offers " + usd(D.inflexible.offer, 0) + " rather than stop, so it runs first at " + Math.round(r.plants.nuclear.run) + " MW. The last plant needed is the " + NAME[r.marginal].toLowerCase() + ", so the price is " + usd(r.price) + "/MWh." : "Switch off: the nuclear plant offers its running cost, " + usd(f.nuclear.cost) + "/MWh, again.", !st.inflexible);
            if (r.price < 0) api.done();
          }
          draw(false);
        } },
      // 7 it is an optimization (the extra-demand arithmetic; the solver check is in the Modeler box of the explain section)
      { text: "The stack is the cheapest way to meet demand: the answer to a small dispatch [[optimization|optimization]]. Check it: add 1 MW of demand and compare the extra running cost with the clearing price.",
        build: function (act, api) {
          var st = Object.assign({}, base, { gas: S_.st.gas }), d = h.demand, blocks = stack(town, D, h, st);
          setting(act, "the town's " + f.wind.mw + " MW wind farm again, with " + (S_.st.gas === D.gas.ref ? "gas at the " + usd(D.gas.ref) + "/MMBtu reference." : "your gas price from step 4, " + usd(S_.st.gas) + "/MMBtu."));
          var chart = stackChart(act, {});
          var tl = tiles(act, [["c0", "Running cost at " + d + " MW"], ["c1", "Running cost at " + (d + 1) + " MW"], ["dc", "Extra cost"], ["p", "Clearing price"]]);
          var r0 = chart.draw(blocks, d), r1 = run(town, D, h, st, d + 1);
          tl.c0.b.textContent = usd(r0.cost); tl.p.b.textContent = usd(r0.price);
          tl.c1.b.textContent = "?"; tl.dc.b.textContent = "?";
          var row = H("div", { class: "lx8-sw" }, act);
          H("button", { type: "button", class: "lx-btn small", text: "Add 1 MW of demand", onclick: function () {
            chart.draw(blocks, d + 1);
            tl.c1.b.textContent = usd(r1.cost); tl.dc.b.textContent = usd(r1.cost - r0.cost);
            api.done();
            api.saw("The cost rose by " + usd(r1.cost - r0.cost) + ", the clearing price: while the marginal plant has room, one more MWh costs its offer. That is the [[shadow-price|shadow price]] of \u201csupply equals demand\u201d.");
          } }, row);
        } },
      // 8 teaser: a full line
      { text: "One question is left: what if the wind farm sits far away and the line into town is full? Then one price splits into two; compare the price at the farm with the price in town.",
        free: true,
        build: function (act) { teaser(act); } }
    ];

    function teaser(act) {
      var st = Object.assign({}, base, { windMW: D.wind.big }), L = lineCase(town, D, h, st, D.teaser.lineMW);
      var tz = H("div", { class: "lx8-tz", role: "img", "aria-label": "A " + D.wind.big + " MW wind farm makes " + L.windAvail + " MW, but the line to town carries at most " + D.teaser.lineMW +
        " MW. In town the price is " + usd(L.town.price) + " per MWh; at the wind farm it is $0." }, act);
      function node(cls, t, a, b) { var n = H("div", { class: "lx8-node " + cls, "aria-hidden": "true" }, tz); H("b", { text: t }, n); H("span", { text: a }, n); H("span", { text: b }, n); }
      node("w", "Wind farm", L.windAvail + " MW available", "price $0");
      var ln = H("div", { class: "lx8-wire", "aria-hidden": "true" }, tz); H("b", { text: "line full: " + L.windToTown + " MW" }, ln); H("i", null, ln); H("span", { text: L.stranded + " MW stuck at the farm" }, ln);
      node("t", "Prairie Town", "needs " + h.demand + " MW", "price " + usd(L.town.price));
      H("p", { class: "lx-lede", text: "The line is full, so the town's own plants fill the rest at " + usd(L.town.price) + "/MWh, while the extra wind at the farm is worth $0." }, act);
      H("p", { class: "lx-hint", html: "<a href=\"m01-dispatch-to-lmp.html\">M1</a> (Modeler tier) adds the network and finds a price for each place." }, act);
      H("a", { class: "lx-btn small", style: "justify-self:start", href: "#explain", html: "Formulate it, as diagrams" + LX.icon("arrow") }, act);
    }

    var cards = LX.StepCards(live, { steps: steps, onStep: function (i) { if (i === steps.length - 1) LX.progress.done(LESSON); } });
    // demo states (core.js LX.demo): "step-N" (or the address #lx-step-N) opens step N with its action done; "mid" = step 2
    LX.demo(root, function (state) {
      var n = state === "mid" ? 2 : +((/^step-(\d+)$/.exec(state) || [])[1] || 0); if (!n) return null;
      demo(Math.min(steps.length, n) - 1); return { view: "step " + n };
    }, cards);
    function demo(i) {   // screenshots: open step i with its action done
      cards.go(i);
      var c = cards.el, q = function (s) { return c.querySelectorAll(s); };
      if (i === 0) ["wind", "solar", "nuclear", "cc"].forEach(function (k) { q(".lx8-plants .lx-choice").forEach(function (b) { if (b.textContent.indexOf(NAME[k]) === 0) b.click(); }); });
      if (i === 1) { var pl = q(".lx-ctl-row button")[1]; for (var k = 0; k < 10; k++) pl.click(); }
      if (i === 2) q(".lx8-plants .lx-choice")[2].click();
      if (i === 3) q(".lx8-marks .lx-btn")[0].click();
      if (i === 4) { var p2 = q(".lx-ctl-row button")[1]; for (var j = 0; j < 20; j++) p2.click(); }
      if (i === 5) q(".lx8-sw .lx-choice")[0].click();
      if (i === 6) q(".lx8-sw .lx-btn").forEach(function (b) { b.click(); });
    }
    root.lxLesson = { model: model, data: D, hour: h, demo: demo, cards: cards };
    buildExplain(D, town, h);
    solverCheck(D, town, h);
  }

  // ---------------------------------------------------------------- the optional solver check (Go deeper · Modeler)
  // A next-tier preview (optional, not a required step): the same hour handed to HiGHS; the core path stays closed form.
  function solverCheck(D, town, h) {
    var host = document.getElementById("merit-solver"); if (!host) return;
    host.innerHTML = "";
    var blocks = stack(town, D, h, { gas: D.gas.ref }), r = clear(blocks, h.demand);
    var sb = H("button", { type: "button", class: "lx-btn ghost small", text: "Solve this hour with HiGHS" }, host), out = H("div", { "aria-live": "polite" }, host);
    sb.addEventListener("click", function () {
      if (!LX.solver) { out.textContent = "The solver is not available in this browser."; return; }
      out.innerHTML = ""; var stat = LX.SolverStatus(out); stat.set("loading"); sb.disabled = true;
      LX.solver.solve(lp(blocks, h.demand), { timeLimit: 5, key: "m8" }).then(function (x) {
        stat.set(x); sb.disabled = false;
        if (!x.ok) return;
        var ul = H("ul", { class: "lx-hint", style: "margin:4px 0 0;padding-left:1.1rem" }, out);
        H("li", { text: "Outputs: " + ORDER.map(function (k) { return SHORT[k] + " " + Math.round(x.values[k]) + " MW"; }).join(", ") + ", the same as the stack." }, ul);
        H("li", { text: "Running cost " + usd(x.objective) + " at " + h.demand + " MW; the stack gives " + usd(r.cost) + "." }, ul);
        H("li", { html: LX.rich("The [[shadow-price|shadow price]] of the demand rule, which solvers call its dual: " + usd(x.duals.demand) + "/MWh, the clearing price.") }, ul);
      });
    });
    H("p", { class: "lx-hint", html: "<a href=\"11-solver.html\">Lesson 11</a> hands a linear program to a solver step by step." }, host);
  }

  // ---------------------------------------------------------------- the explain layer
  function buildExplain(D, town, h) {
    var host = document.getElementById("merit-explain"); if (!host) return;
    host.innerHTML = ""; host.classList.add("is-live");
    var f = town.fleet, base = { gas: D.gas.ref }, r = run(town, D, h, base);
    // 1 Formulate it (LX.FormulateBox, components/formulate.js)
    LX.FormulateBox(H("div", { class: "lx-xcard" }, host), {
      title: "Formulate it: the operator's problem in words",
      lede: "The same three parts as lesson 0's day, for one hour: " + D.hourLabel + " on " + h.dateLabel + ".",
      parts: [
        { k: "Decisions", color: "var(--lx-tier-2)", text: "How much each of the five plants makes this hour: five numbers, in MW ([[decision-variable|decision variables]])." },
        { k: "Goal", color: "var(--lx-good)", text: "Make the hour's total running cost as small as possible: each offer times its MW, added up (the [[objective|objective]])." },
        { k: "Rules", color: "var(--lx-warn)", text: "Supply equals demand: the five outputs add up to " + h.demand + " MW. Each plant runs between 0 and what it can make now: wind " + h.wind + " MW and solar " + h.solar + " MW (the weather's limit), the others their size ([[constraint|constraints]])." },
        { k: "What comes back", color: "var(--lx-accent)", text: "Who runs (the stack) and the price: how much the best cost rises for one more MWh of demand, " + usd(r.price) + " here." }
      ],
      symbols: "minimize &nbsp;Σ<sub>g</sub> c<sub>g</sub> p<sub>g</sub><br>subject to &nbsp;Σ<sub>g</sub> p<sub>g</sub> = D &nbsp;&nbsp;(its shadow price λ is the clearing price)<br>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;0 ≤ p<sub>g</sub> ≤ P<sub>g</sub> &nbsp;for each plant g<br><br>" +
        "<span class=\"tag\">p<sub>g</sub>: output of plant g this hour, MW (1 MW for one hour = 1 MWh)</span><br>" +
        "<span class=\"tag\">c<sub>g</sub>: its offer, $/MWh</span><br>" +
        "<span class=\"tag\">P<sub>g</sub>: what it can make this hour, MW</span><br>" +
        "<span class=\"tag\">D: demand this hour, MW</span><br>" +
        "<span class=\"tag\">λ: the shadow price of supply = demand, $/MWh</span>"
    });
    // 2 who runs and who is paid what
    var c2 = H("div", { class: "lx-xcard" }, host), c3 = H("div", { class: "lx-xcard" }, host);
    var order = stack(town, D, h, base).map(function (b) { return b.key; });
    LX.CompareTable(c2, {
      title: "Who runs at " + D.hourLabel + ", and who keeps what",
      columns: [{ key: "name", label: "Plant", main: true }, { key: "offer", label: "Offer, $/MWh", phone: "Offer", num: true }, { key: "runs", label: "Runs", num: true, phoneHide: true },
                { key: "keeps", label: "Keeps per MWh", phone: "Keeps", num: true, bar: { max: 45 } }],
      rows: ORDER.map(function (k) {
        var p = r.plants[k];
        return { key: k, color: COL[k], name: NAME[k], note: p.run > 0 ? (k === r.marginal ? "the marginal plant" : "paid the clearing price") : "stays off", offer: { text: usd(p.offer) },
                 runs: Math.round(p.run) + " MW", keeps: p.run > 0 ? { text: usd(r.price - p.offer), value: r.price - p.offer } : { text: "–" } };
      }),
      sorts: [{ label: "As in lesson 0", order: ORDER, note: "Every running plant is paid the clearing price, " + usd(r.price) + "/MWh this hour." },
              { label: "As stacked", order: order, ranked: true, note: "<b>Cheapest offer first: the supply stack.</b> The plant that serves the last MW sets the price." }]
    });
    // 3 cause and effect: from more wind to a price below zero (no plant named twice)
    var big = Object.assign({}, base, { windMW: D.wind.big }), r1 = run(town, D, h, big), r2 = run(town, D, h, Object.assign({}, big, { credit: true }));
    LX.CausalChain(c3, {
      title: "From more wind to a price below zero",
      links: [{ title: "More wind is built", text: "Its offer is about $0.", value: f.wind.mw + " → " + D.wind.big + " MW" },
              { title: "The stack shifts right", text: "Wind fills the bottom.", value: Math.round(h.windShape * f.wind.mw) + " → " + Math.round(h.windShape * D.wind.big) + " MW of wind" },
              { title: "Wind becomes the last plant needed", text: "Its offer sets the price.", value: usd(r.price) + " → " + usd(r1.price) },
              { title: "A credit per MWh produced", text: "Wind would still earn below $0.", value: "offer " + usd(-D.credit.value, 0) },
              { title: "The price turns negative", text: "Extra wind is spilled.", value: usd(r2.price) + "; " + Math.round(r2.spilled) + " MW spilled" }],
      note: "Demand is still met exactly: the last plant needed would rather pay than stop, often when more wind or sun is available than can be used there. Storage, flexible demand or a bigger line can help."
    });
    // 4 steelman
    LX.Steelman(H("div", { class: "lx-xcard" }, host), {
      title: "Negative prices: a problem or a signal? The strongest case on each side",
      sides: [{ key: "for", title: "A useful signal", points: ["They tell batteries and flexible users exactly when power is plentiful.", "They reward plants that can turn down quickly.", "They show where wires are missing: in Texas, negative prices fell after a major grid expansion (EIA, 2014)."] },
              { key: "against", title: "A sign of a problem", points: ["Payments per MWh produced can keep plants running when the grid has no use for the power.", "Low and negative hours cut the income of every plant, including those needed in calm, dark hours.", "Spilled wind and sun are investment that produces nothing useful in those hours."] }],
      note: "The evidence on how much each effect matters depends on the market, the year and the policy; lesson [[lesson:a03-market-design|A3]] compares market designs."
    });
  }

  LX.mount("merit-order", function (live, data, root) { view(live, data, root); });
})();
