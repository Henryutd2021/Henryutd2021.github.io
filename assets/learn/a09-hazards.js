// a09-hazards.js — Analyst lesson A9, "How do heat waves, droughts, wildfires and cold snaps break energy systems, and how
// do planners prepare?" (step cards, simulation mode, Learn W4, 2026-11-05).
//
// Data (read through data-src): lesson A5's files (town_year.json, m03-capacity-expansion-2024.json, cf_targets.json,
// a05-adequacy.json: the Plains Grid, its units, the 500 resampled years) and assets/learn/data/a09-hazards.json (four
// hazards, three pairs, five defences with illustrative yearly costs, a budget, real events and preparation steps with
// their primary sources, and a reference block written by the test).
// The simulator is lesson A5's (assets/learn/a05-adequacy.js, loaded before this script; LX.A5 on the page, require in
// Node): the same weather years, outages and seed, with the hazards as multipliers over the calendar hours of every
// simulated year (A5's o.mod), so a result reads "in a year when the hazard strikes".
//   mods(H, ids, defs)  multiplier arrays for the hazards ids, eased by the defences defs: in each window of a hazard, every
//       unit type's availability, wind and demand are multiplied as the data say; a defence that eases hazard h keeps a
//       share k of each supply loss (1 - k (1 - m)), and of the share of customers switched off; demand is never eased.
//       Overlapping hazards multiply. tally: the share of demand switched off directly, hour by hour (the shutoffs).
//   run(A5, D5, SRC, H, ids, defs, seed)  the simulated years with the hazards and defences: LOLE, LOLH and EUE (A5's
//       evaluate, with a battery or demand response added when chosen) and the customer energy cut directly by
//       shutoffs (MWh a year), which A5's supply measures do not count.
// Every number the page states comes from these functions; _tests/learn/test_a09-hazards.js checks them.
(function () {
  "use strict";
  var T = 8760, MD = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  var A5 = (typeof window !== "undefined" && window.LX && window.LX.A5) || (typeof require !== "undefined" ? require("./a05-adequacy.js") : null);

  // ---------------------------------------------------------------- pure model
  function dayOf(md) { var m = +md.slice(0, 2), d = +md.slice(3, 5), s = 0; for (var i = 0; i < m - 1; i++) s += MD[i]; return s + d - 1; }
  function ones() { var a = new Float64Array(T); a.fill(1); return a; }
  function hazard(H, id) { return H.hazards.filter(function (h) { return h.id === id; })[0]; }
  function defence(H, id) { return H.defences.filter(function (d) { return d.id === id; })[0]; }
  // the share of each loss that remains for hazard id under the defences defs
  function keep(H, id, defs) { var k = 1; (defs || []).forEach(function (x) { var d = defence(H, x); if (d && d.eases && d.eases[id] != null) k *= d.eases[id]; }); return k; }
  function mods(H, ids, defs) {
    var o = { demand: ones(), wind: ones(), avail: { coal: ones(), cc: ones(), ct: ones() } }, tally = new Float64Array(T), any = false;
    (ids || []).forEach(function (id) {
      var hz = hazard(H, id), k = keep(H, id, defs);
      hz.windows.forEach(function (w) {
        var d0 = dayOf(w.from), d1 = dayOf(w.to), h0 = w.hours ? w.hours[0] : 0, h1 = w.hours ? w.hours[1] : 24;
        for (var d = d0; d <= d1; d++) for (var h = h0; h < h1; h++) {
          var t = d * 24 + h; any = true;
          if (w.demand) o.demand[t] *= w.demand;
          if (w.wind) o.wind[t] *= 1 - k * (1 - w.wind);
          for (var u in (w.avail || {})) o.avail[u][t] *= 1 - k * (1 - w.avail[u]);
          if (w.shutoff) tally[t] = 1 - (1 - tally[t]) * (1 - k * w.shutoff);
        }
      });
    });
    return { mod: any ? o : null, tally: tally };
  }
  function addsOf(D5, H, defs) {
    var add = {};
    (defs || []).forEach(function (x) { var d = defence(H, x); if (d && d.add) add = A5.plus(add, A5.block(D5, d.add)); });
    return add;
  }
  function cost(H, defs) { return (defs || []).reduce(function (s, x) { var d = defence(H, x); return s + (d ? d.cost : 0); }, 0); }
  function run(D5, SRC, H, ids, defs, seed) {
    var m = mods(H, ids, defs), S = A5.simulate(D5, SRC, seed == null ? H.seed : seed, { mod: m.mod, tally: m.tally }), e = A5.evaluate(S, addsOf(D5, H, defs));
    return { ids: (ids || []).slice(), defs: (defs || []).slice(), lole: e.lole, lolh: e.lolh, eue: e.eue, days: e.days, shut: S.tally, cost: cost(H, defs) };
  }
  // all four hazards one by one, and the base, with defences defs
  function sweep(D5, SRC, H, defs, seed) {
    var out = { none: run(D5, SRC, H, [], defs, seed) };
    H.hazards.forEach(function (hz) { out[hz.id] = run(D5, SRC, H, [hz.id], defs, seed); });
    return out;
  }
  // the extra unserved energy of a pair over the sum of each alone (both measured above the no-hazard years)
  // do two hazards share any hour of the year?
  function overlap(H, a, b) { var A = mods(H, [a]).tally, x = mods(H, [a]).mod, y = mods(H, [b]).mod; void A;
    for (var t = 0; t < T; t++) { var ha = x.demand[t] !== 1 || x.wind[t] !== 1 || x.avail.cc[t] !== 1 || x.avail.ct[t] !== 1 || x.avail.coal[t] !== 1, hb = y.demand[t] !== 1 || y.wind[t] !== 1 || y.avail.cc[t] !== 1 || y.avail.ct[t] !== 1 || y.avail.coal[t] !== 1; if (ha && hb) return true; }
    return false; }
  function compound(base, a, b, ab) { var sum = (a.eue - base.eue) + (b.eue - base.eue), both = ab.eue - base.eue; return { sum: sum, both: both, ratio: sum > 0 ? both / sum : null }; }

  // ---------------------------------------------------------------- formats and texts (shared by the page and the test)
  var MINUS = "−";
  function int(v) { return Math.round(v).toLocaleString("en-US"); }
  function d3(v) { return (Math.round(v * 1000) / 1000).toFixed(3); }
  function times(r) { return (Math.round(r * 10) / 10).toFixed(1); }
  function money(v) { return "$" + int(v) + "M"; }
  function pairText(H, a, b, c) {
    var la = hazard(H, a).label, lb = hazard(H, b).label.toLowerCase();
    if (c.ratio == null || c.sum <= 0) return la + " and " + lb + " together: " + int(c.both) + " MWh a year more unserved energy than with neither.";
    if (c.ratio > 1.05) return la + " and " + lb + " together add " + int(c.both) + " MWh a year of unserved energy, " + times(c.ratio) + " times the " + int(c.sum) + " MWh of the two alone. **Together they bite deeper than the sum.**";
    if (c.ratio < 0.95) return la + " and " + lb + " together add " + int(c.both) + " MWh a year, less than the " + int(c.sum) + " MWh of the two alone: they hit different hours or the same scarce ones.";
    return la + " and " + lb + " together add " + int(c.both) + " MWh a year, about the " + int(c.sum) + " MWh of the two alone" + (overlap(H, a, b) ? "." : ": they strike at different times, so their harms simply add.");
  }
  function defenceText(H, before, after, defs) {
    var best = null;
    H.hazards.forEach(function (hz) { var cut = before[hz.id].eue - after[hz.id].eue; if (!best || cut > best.cut) best = { id: hz.id, cut: cut }; });
    var c = cost(H, defs), hz = hazard(H, best.id);
    return "For " + money(c) + " a year: in the " + hz.label.toLowerCase() + " year, unserved energy falls from " + int(before[best.id].eue) + " to " + int(after[best.id].eue) + " MWh, the largest cut. " +
      (after[best.id].eue > 0.5 ? "**Some risk remains: defences narrow it, they do not remove it.**" : "**No shortfall is left in that year, at this price.**");
  }
  // practice drill items (two kinds, seeded; the test recomputes every answer)
  function drillItem(k, r) {
    if (k % 2 === 0) {
      var before = 200 * (5 + Math.floor(r() * 30)), after = Math.round(before * (0.1 + 0.6 * r()) / 10) * 10, c = 5 * (2 + Math.floor(r() * 12));
      var v = Math.round((before - after) / c * 10) / 10;
      return { kind: "perM", q: "A defence costing $" + c + "M a year cuts a hazard year's unserved energy from " + int(before) + " to " + int(after) + " MWh. How many MWh does it avoid per $1M a year?", answer: v, tol: 0.06, unit: "MWh",
               why: "(" + int(before) + " − " + int(after) + ") ÷ " + c + " = " + v.toFixed(1) + " MWh per $1M a year." };
    }
    var base = 50 + 10 * Math.floor(r() * 10), a = base + 50 * (1 + Math.floor(r() * 8)), b = base + 50 * (1 + Math.floor(r() * 8)), ab = a + b - base + 50 * Math.floor(r() * 12);
    var sum = (a - base) + (b - base), ratio = Math.round(((ab - base) / sum) * 10) / 10;
    return { kind: "ratio", q: "Unserved energy: " + base + " MWh with no hazard, " + a + " with hazard A, " + b + " with hazard B, " + int(ab) + " with both. Both together add how many times the sum of each alone?", answer: ratio, tol: 0.06, unit: "times",
             why: "(" + int(ab) + " − " + base + ") ÷ ((" + a + " − " + base + ") + (" + b + " − " + base + ")) = " + ratio.toFixed(1) + "." };
  }
  var model = { T: T, dayOf: dayOf, drillItem: drillItem, hazard: hazard, defence: defence, keep: keep, mods: mods, addsOf: addsOf, cost: cost, run: run, sweep: sweep, compound: compound, overlap: overlap,
                pairText: pairText, defenceText: defenceText, fm: { int: int, d3: d3, times: times, money: money } };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX || !window.LX.H) return;

  // ================================================================ the page
  var LX = window.LX, H_ = LX.H, SLUG = "a09-hazards", KEY = "a9-own";
  function css() {
    if (document.getElementById("a9-css")) return;
    H_("style", { id: "a9-css", text: [
      ".a9-lab .lx-stepcard{grid-template-columns:minmax(0,1fr)}.a9-lab .lx-step-act{grid-template-columns:minmax(0,1fr)}.a9-lab .lx-stepcard>*,.a9-lab .lx-step-act>*{min-width:0}",
      ".a9-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}",
      ".a9-tbl{overflow-x:auto;max-width:100%}.a9-tbl table{width:100%;border-collapse:collapse;font-size:14px}",
      ".a9-tbl th,.a9-tbl td{padding:5px 6px;border-bottom:1px solid var(--lx-line);text-align:right;font-weight:400;vertical-align:top}",
      ".a9-tbl th:first-child,.a9-tbl td:first-child{text-align:left}",
      ".a9-tbl thead th{font-family:var(--lx-f-display);font-size:12px;color:var(--lx-ink-3);vertical-align:bottom}",
      ".a9-tbl td{font-family:var(--lx-f-mono);font-variant-numeric:tabular-nums}.a9-tbl td:first-child{font-family:var(--lx-f-body)}",
      ".a9-tbl td i{display:inline-block;width:9px;height:9px;border-radius:3px;background:var(--c);margin-right:6px}",
      ".a9-facts{margin:0;padding:0;list-style:none;display:grid;gap:6px}.a9-facts li{font-size:14px}.a9-facts b{font-family:var(--lx-f-mono);font-weight:600;margin-right:6px}",
      ".a9-note{font-size:13.5px;color:var(--lx-ink-3);margin:0}.a9-busy{font-size:13.5px;color:var(--lx-ink-2);margin:0;min-height:1.3em}",
      ".a9-budget{font-family:var(--lx-f-mono);font-size:14px;margin:0}.a9-budget.over{color:var(--lx-bad)}",
      "@media (max-width:560px){.a9-tbl table{font-size:12.5px}.a9-tbl th,.a9-tbl td{padding:4px 3px}.a9-tbl .ph{display:none}}"
    ].join("\n") }, document.head);
  }
  function table(host, head, rows, label) {
    var w = H_("div", { class: "a9-tbl", tabindex: "0", role: "region", "aria-label": label }, host), t = H_("table", null, w), hr = H_("tr", null, H_("thead", null, t));
    var ph = head.map(function (x) { return x.charAt(0) === "~"; });
    head.forEach(function (x, i) { H_("th", { scope: "col", class: ph[i] ? "ph" : "", text: x.replace(/^~/, "") }, hr); });
    var b = H_("tbody", null, t);
    rows.forEach(function (r) { var tr = H_("tr", null, b); r.forEach(function (c, i) { var td = H_("td", { class: ph[i] ? "ph" : "" }, tr); if (c && c.html != null) td.innerHTML = c.html; else td.textContent = c; }); });
    return w;
  }
  function facts(host, list, src) {
    var ul = H_("ul", { class: "a9-facts" }, host);
    list.forEach(function (f) { var li = H_("li", null, ul); H_("b", { text: f.n }, li); li.appendChild(document.createTextNode(f.what)); });
    if (src) H_("p", { class: "a9-note", html: "Source: <a href=\"" + LX.esc(src.url) + "\">" + LX.esc(src.label) + "</a>." }, host);
  }
  function chip(hz) { return { html: "<i style='--c:" + hz.color + "'></i>" + LX.esc(hz.label) }; }

  LX.mount(SLUG, function (live, data, root) {
    css(); root.classList.add("a9-lab");
    var D5 = data.a05_adequacy, H = data.a09_hazards, SRC = A5.sources(D5, data.town_year, data.m03_capacity_expansion_2024, data.cf_targets, LX.townProfile);
    var own = LX.store.get(KEY, {}) || {}; function remember(k, v) { own[k] = v; LX.store.set(KEY, own); }
    var cache = {};
    function get(ids, defs) { var k = ids.join("+") + "|" + (defs || []).slice().sort().join("+"); if (!cache[k]) cache[k] = run(D5, SRC, H, ids, defs); return cache[k]; }
    function later(f) { setTimeout(f, 0); }

    var steps = [
      // 1 what each hazard hits
      { text: "Each hazard enters the system its own way. Sort six effects by what they hit: demand, power plants, fuel or wires.",
        build: function (act, api) {
          LX.CardSort(act, { bins: [{ id: "demand", label: "Demand", sub: "more is needed" }, { id: "plants", label: "Plants", sub: "units lose output" }, { id: "fuel", label: "Fuel", sub: "supply to plants" }, { id: "wires", label: "Wires", sub: "lines switched off" }],
            cards: [
              { id: "ac", text: "Air conditioners run harder in a heat wave.", bin: "demand", why: "Heat raises demand, most in the afternoon and evening." },
              { id: "heatpump", text: "Electric heating peaks in a cold snap.", bin: "demand", why: "Cold raises demand where homes heat with electricity." },
              { id: "cooling", text: "Cooling water is too warm or too scarce, so plants cut output.", bin: "plants", why: "Thermal plants need cooling; drought and heat derate them." },
              { id: "freeze", text: "Instruments and pipes freeze at a plant.", bin: "plants", why: "In Uri, freezing caused 44.2% of the unit outages." },
              { id: "gas", text: "Wellheads freeze and gas stops reaching power plants.", bin: "fuel", why: "In Uri, fuel problems caused 31.4% of the unit outages." },
              { id: "psps", text: "A utility switches lines off in dry, gusty weather to avoid starting a fire.", bin: "wires", why: "A [[public-safety-power-shutoff|safety shutoff]]: customers on those lines lose power, whatever the supply." }
            ],
            onCheck: function (g) { if (g.placed < g.total) return; api.done(); remember("sort", g.right); api.saw(g.right + " of " + g.total + " placed as planners would. **A cold snap hits all three of demand, plants and fuel at once.**"); } });
        } },
      // 2 Uri
      { text: "Winter Storm Uri, February 2021. By count of affected generating units, which kind failed most?",
        build: function (act, api) {
          var ev = H.events.filter(function (e) { return e.id === "uri"; })[0], out = H_("div", null, act);
          var pr = LX.Predict(act, { id: "a9-uri", fresh: true, q: "", title: false, answer: "gas",
            options: [{ value: "wind", label: "Wind turbines" }, { value: "gas", label: "Gas units" }, { value: "coal", label: "Coal units" }],
            feedback: { gas: "Yes: 58% of the affected units were gas. Wind was 27% and coal 6%: every kind failed.", wind: "Wind was 27% of the affected units; gas 58%. Every kind failed.", coal: "Coal was 6%; gas 58% and wind 27%. Every kind failed." },
            onPick: function () { out.innerHTML = ""; facts(out, ev.facts.concat(ev.more || []), ev.source); pr.reveal(); api.done(); remember("uri", true); api.saw("Uri was a [[correlated-failure|correlated failure]]: cold raised demand while freezing and fuel problems took units of every kind out together. **Lesson A5 drew outages independently; here they are not.**"); } });
        } },
      // 3 one hazard
      { text: "[[stress-test|Stress-test]] the Plains Grid: one hazard in every one of A5's 500 simulated years. Try at least two hazards.",
        build: function (act, api) {
          var row = H_("div", { class: "a9-row", role: "group", "aria-label": "Hazard" }, act), busy = H_("p", { class: "a9-busy", "aria-live": "polite" }, act), out = H_("div", null, act), tried = {}, last = null;
          function show() {
            out.innerHTML = ""; var b = get([]);
            var rows = [["No hazard", d3(b.lole), int(b.eue), "0"]];
            H.hazards.forEach(function (hz) { if (!tried[hz.id]) return; var r = get([hz.id]); rows.push([chip(hz), d3(r.lole), int(r.eue), int(r.shut)]); });
            table(out, ["Year with", "LOLE (days/yr)", "Unserved energy (MWh/yr)", "Switched off directly (MWh/yr)"], rows, "The Plains Grid with each hazard");
            if (last) { var hz = H.hazards.filter(function (h) { return h.id === last; })[0], ev = H.events.filter(function (e) { return e.hazard === last; })[0];
              H_("p", { class: "a9-note", text: hz.label + ", " + hz.when + ": " + hz.what }, out);
              if (ev) { H_("p", { class: "a9-note", html: "<b>Real case: " + LX.esc(ev.label) + ".</b>" }, out); facts(out, ev.facts.slice(0, 1), ev.source); } }
            if (Object.keys(tried).length >= 2) {
              api.done(); remember("tried", Object.keys(tried));
              var c = get(["cold"]), f = get(["fire"]);
              api.saw("A cold snap year: " + int(c.eue) + " MWh unserved against " + int(b.eue) + " without. Shutoffs add " + int(f.eue - b.eue) + " MWh of shortfall, and switch off " + int(f.shut) + " MWh of customers' power directly.");
            }
          }
          H.hazards.forEach(function (hz) {
            var bt = H_("button", { type: "button", class: "lx-btn ghost small", "aria-pressed": "false", text: hz.label }, row);
            bt.addEventListener("click", function () {
              bt.setAttribute("aria-pressed", "true"); busy.textContent = "Simulating 500 years with the " + hz.label.toLowerCase() + "…"; api.busy(true);
              later(function () { try { get([]); get([hz.id]); tried[hz.id] = true; last = hz.id; busy.textContent = ""; show(); } catch (e) { busy.textContent = "The run stopped. Try again."; } api.busy(false); });
            });
          });
        } },
      // 4 two at once
      { text: "Hazards come together: a drought often comes with heat. Run a [[compound-hazard|pair at once]] and compare it with the two alone.",
        build: function (act, api) {
          var row = H_("div", { class: "a9-row", role: "group", "aria-label": "Pair of hazards" }, act), busy = H_("p", { class: "a9-busy", "aria-live": "polite" }, act), out = H_("div", null, act);
          H.pairs.forEach(function (p) {
            var a = H.hazards.filter(function (h) { return h.id === p[0]; })[0], b = H.hazards.filter(function (h) { return h.id === p[1]; })[0];
            var bt = H_("button", { type: "button", class: "lx-btn ghost small", "aria-pressed": "false", text: a.label + " + " + b.label.toLowerCase() }, row);
            bt.addEventListener("click", function () {
              busy.textContent = "Simulating…"; api.busy(true);
              later(function () {
                try {
                  var n = get([]), ra = get([p[0]]), rb = get([p[1]]), ab = get(p), c = compound(n, ra, rb, ab);
                  busy.textContent = ""; out.innerHTML = "";
                  table(out, ["Year with", "LOLE (days/yr)", "Unserved energy (MWh/yr)"], [["No hazard", d3(n.lole), int(n.eue)], [chip(a), d3(ra.lole), int(ra.eue)], [chip(b), d3(rb.lole), int(rb.eue)], [a.label + " and " + b.label.toLowerCase(), d3(ab.lole), int(ab.eue)]], "A pair of hazards against each alone");
                  bt.setAttribute("aria-pressed", "true"); api.done(); remember("pair", p.join("+")); api.saw(pairText(H, p[0], p[1], c));
                } catch (e) { busy.textContent = "The run stopped. Try again."; }
                api.busy(false);
              });
            });
          });
        } },
      // 5 defences under a budget
      { text: function () { return "Choose defences within " + money(H.budget) + " a year, such as [[winterization|winterizing]] plants, then run the four hazard years again. Costs are illustrative."; },
        build: function (act, api) {
          var chosen = {}, row = H_("div", { class: "a9-row", role: "group", "aria-label": "Defences" }, act), bud = H_("p", { class: "a9-budget", "aria-live": "polite" }, act);
          var list = H_("ul", { class: "a9-facts" }, act);
          H.defences.forEach(function (d) { var li = H_("li", null, list); H_("b", { text: money(d.cost) }, li); li.appendChild(document.createTextNode(d.label + ": " + d.what)); });
          var go = H_("button", { type: "button", class: "lx-btn small", html: LX.icon("play") + "Run the hazard years" }, H_("div", { class: "a9-row" }, act));
          var busy = H_("p", { class: "a9-busy", "aria-live": "polite" }, act), out = H_("div", null, act);
          function defs() { return H.defences.filter(function (d) { return chosen[d.id]; }).map(function (d) { return d.id; }); }
          function paint() { var c = cost(H, defs()); bud.textContent = "Chosen: " + money(c) + " of " + money(H.budget) + " a year" + (c > H.budget ? " (over budget)" : ""); bud.classList.toggle("over", c > H.budget); go.disabled = c > H.budget || !defs().length; }
          H.defences.forEach(function (d) {
            var bt = H_("button", { type: "button", class: "lx-btn ghost small", "aria-pressed": "false", text: d.short + " · " + money(d.cost) }, row);
            bt.addEventListener("click", function () { chosen[d.id] = !chosen[d.id]; bt.setAttribute("aria-pressed", chosen[d.id] ? "true" : "false"); paint(); });
          });
          go.addEventListener("click", function () {
            var ds = defs(); if (!ds.length || cost(H, ds) > H.budget) return;
            go.disabled = true; api.busy(true); busy.textContent = "Simulating the four hazard years…";
            later(function () {
              try {
                var before = {}, after = {};
                H.hazards.forEach(function (hz) { before[hz.id] = get([hz.id]); after[hz.id] = get([hz.id], ds); });
                busy.textContent = ""; out.innerHTML = "";
                table(out, ["Year with", "Unserved before (MWh/yr)", "With your defences", "~Switched off directly"], H.hazards.map(function (hz) { return [chip(hz), int(before[hz.id].eue), int(after[hz.id].eue), int(before[hz.id].shut) + " → " + int(after[hz.id].shut)]; }), "Unserved energy in each hazard year, before and with your defences");
                api.done(); remember("defs", ds); api.saw(defenceText(H, before, after, ds));
              } catch (e) { busy.textContent = "The run stopped. Try again."; }
              api.busy(false); paint();
            });
          });
          H_("p", { class: "a9-note", text: H.costNote }, act);
          paint();
        } },
      // 6 how planners prepare
      { text: "After Uri and Elliott, rules and studies changed. Read the steps, then mark the lesson done.",
        build: function (act, api) {
          LX.Timeline(act, { events: H.prepare, kinds: { study: "Report", policy: "Rule" } });
          var bt = H_("button", { type: "button", class: "lx-btn small", text: "Done reading" }, H_("div", { class: "a9-row" }, act));
          bt.addEventListener("click", function () { api.done(); LX.progress.done(SLUG); api.saw("Planners now test grids against correlated hazards, require cold-weather plans and harden lines. **Each defence answers one hazard; none answers all four.**"); });
        } }
    ];
    var cardsHost = H_("div", null, live);
    var cards = LX.StepCards(cardsHost, { id: "a9-steps", steps: steps });
    LX.demo(root, function (state) {
      var m = /^step-(\d+)$/.exec(state), n = state === "mid" ? 3 : m ? +m[1] : 0;
      if (!n) return null;
      cards.go(Math.min(steps.length, n) - 1);
      var bs = cardsHost.querySelectorAll(".lx-step-act .a9-row .lx-btn");
      if (n === 2) { var c = cardsHost.querySelector(".lx-step-act .lx-choice"); if (c) c.click(); }
      else if (n === 3 && bs.length > 2) { bs[0].click(); bs[2].click(); }
      else if (n === 4 && bs[0]) bs[0].click();
      else if (n === 5 && bs.length > 2) { bs[0].click(); bs[2].click(); var g = cardsHost.querySelectorAll(".lx-step-act .a9-row .lx-btn"); g[g.length - 1].click(); }
      return { view: state };
    }, cards);
    var dh = document.getElementById("a9-drill");
    if (dh && LX.Drill) LX.Drill(dh, { item: drillItem, hint: "MWh avoided per $1M, and how much worse two hazards are together. About 10 minutes for ten items.", empty: "Type a number first." });
    root.lxLesson = { model: model, cache: cache, cards: cards };
    explain(H);
  });

  // ---------------------------------------------------------------- explain layer: comparison table, causal chain, flowchart
  function explain(H) {
    var x = document.getElementById("a9-explain"); if (!x) return;
    x.innerHTML = ""; x.classList.add("is-live");
    var R = H.reference || {}, Y = R.years || {};
    var rows = H.hazards.map(function (hz) {
      var ev = H.events.filter(function (e) { return e.hazard === hz.id; })[0], dfs = H.defences.filter(function (d) { return d.eases && d.eases[hz.id] != null; }).map(function (d) { return d.short.toLowerCase(); });
      return { key: hz.id, color: hz.color, name: hz.label, hits: hz.what, ev: ev ? ev.label + " (" + ev.date.slice(0, 4) + ")" : "–", def: dfs.join(", ") || "–", eue: Y[hz.id] ? { text: int(Y[hz.id].eue), value: Y[hz.id].eue } : { text: "–", value: 0 } };
    });
    LX.CompareTable(H_("div", { class: "lx-xcard" }, x), {
      title: "Four hazards, four ways in", text: true,
      columns: [{ key: "name", label: "Hazard", main: true }, { key: "hits", label: "What it hits here" }, { key: "ev", label: "Real case" }, { key: "def", label: "Defence that eases it" }, { key: "eue", label: "Unserved, MWh/yr", num: true }],
      rows: rows, sorts: [{ label: "As listed", order: rows.map(function (r) { return r.key; }), note: "Unserved energy in a year when the hazard strikes, seed 2025; " + (Y.none ? int(Y.none.eue) : "–") + " MWh a year with none." },
                          { label: "By unserved energy", order: rows.slice().sort(function (a, b) { return b.eue.value - a.eue.value; }).map(function (r) { return r.key; }), ranked: true, note: "The cold snap hits demand, plants and fuel at once." }]
    });
    LX.CausalChain(H_("div", { class: "lx-xcard" }, x), {
      title: "Cause and effect: a cold snap",
      links: [{ title: "Cold raises demand", text: "Electric heating runs hard.", value: "+12% here" },
              { title: "Equipment freezes", text: "Instruments, pipes and turbines stop.", value: "Uri: 44.2% of outages" },
              { title: "Gas stops arriving", text: "Wellheads and pipelines freeze.", value: "Uri: 31.4%" },
              { title: "Reserves run out", text: "Many units fail at once, not one by one.", value: "Uri: 1,045 units" },
              { title: "Operators shed load", text: "Rotating outages keep the grid from collapse.", value: "Uri: 20,000 MW" }],
      note: "Independent outages, as in lesson A5, miss this chain: the failures share one cause."
    });
    LX.Flowchart(H_("div", { class: "lx-xcard" }, x), {
      title: "Planning for hazards, move by move", lede: "Trace how a planner turns a hazard into a defence.",
      nodes: {
        h: { t: "Name the hazard", tN: ["Name the", "hazard"], s: "what it hits", sN: "what it hits" },
        s: { t: "Stress-test the grid", tN: ["Stress-test", "the grid"], s: "correlated outages", sN: "correlated" },
        q: { t: "Risk acceptable?", tN: ["Risk", "acceptable?"], k: "q" },
        d: { t: "Choose defences", tN: ["Choose", "defences"], s: "cost against MWh avoided", sN: "cost vs MWh" },
        r: { t: "Rules, drills, reports", tN: ["Rules, drills,", "reports"], k: "end" }
      },
      cols: 2, at: { h: [0, 0], s: [0, 1], q: [0, 2], d: [1, 2], r: [0, 3] }, colsN: 2, atN: { h: [0, 0], s: [0, 1], q: [0, 2], d: [1, 2], r: [0, 3] },
      edges: [["h", "s"], ["s", "q"], ["q", "d", "no"], ["d", "s", "re-test"], ["q", "r", "yes"]],
      traces: [{ label: "A cold snap", path: ["h", "s", "q", "d", "s", "q", "r"], text: "Winterizing cuts the units' losses; since October 2025 the standard EOP-012-3 requires cold-weather plans for generators." },
               { label: "Wildfire shutoffs", path: ["h", "s", "q", "d"], text: "Customers on switched-off lines lose far more energy than the supply shortfall adds: the defence is on the wires." }], sel: 0
    });
  }
})();
