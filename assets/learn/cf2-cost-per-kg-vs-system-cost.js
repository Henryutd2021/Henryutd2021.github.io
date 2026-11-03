// cf2-cost-per-kg-vs-system-cost.js — Case file CF2, "When the cost per kilogram and the cost of the system disagree"
// (case form, wave W2, 2026-11-03).
//
// Data: assets/learn/data/cf2-cost-per-kg-vs-system-cost.json: the studies' dated steps (LX.Timeline), where the
// journal result holds (LX.Boundary), the illustrative toy ("idea") and the numbers to remember. The research text in
// the data file is approved excerpt wording (reports/learn/excerpts_for_approval.md, E3-E5 and its revisions); this
// script adds none of its own.
//
// The idea (illustrative; invented round numbers, not the studies' inputs or results): an electrolyzer next to a wind
// farm is built in equal blocks (10 MW each). Block k runs at full power for hours[k] hours a year, fewer for each
// added block, because it only runs when the wind the grid cannot take exceeds the blocks below it. That surplus wind
// is free in the toy (it would be curtailed). For a size of n blocks:
//   kg_k      = blockMW x hours[k] x kgPerMWh                        hydrogen from block k, kg a year
//   cost_k    = annualCostPerMW x blockMW + variableCostPerKg x kg_k  $ a year (building cost, annualized, plus upkeep)
//   LCOH(n)   = sum of cost_k / sum of kg_k over the n blocks           $/kg: the cost per kilogram, averaged
//   net(n)    = sum of (cost_k - price x kg_k)                        $ a year: change in the system's net cost
//                                                                     compared with no electrolyzer (below 0 = cheaper)
// LCOH is lowest with one block (it runs most); net(n) is lowest at the largest n whose last block's own cost per kg,
// cost_n / kg_n, is below the price (the next block's is above it). Raising the price adds blocks, so LCOH rises while
// net(n) falls: the two measures answer different questions. The chart's x axis is the size in blocks: block k's bar
// spans [k-1, k] and the average for n blocks sits at x = n, the size it belongs to (chart(), tested in Node).
// Every number on the page is checked by _tests/learn/test_cf2-cost-per-kg-vs-system-cost.js.
(function () {
  "use strict";

  // ---------------------------------------------------------------- pure model (no DOM; exported for Node)
  function blocks(I) {
    return I.hours.map(function (h, k) {
      var kg = I.blockMW * h * I.kgPerMWh, cost = I.annualCostPerMW * I.blockMW + I.variableCostPerKg * kg;
      return { k: k + 1, from: k * I.blockMW, to: (k + 1) * I.blockMW, hours: h, kg: kg, cost: cost, perKg: cost / kg };
    });
  }
  // a design of n blocks (0 <= n <= hours.length) at a hydrogen price ($/kg)
  function design(I, price, n) {
    var B = blocks(I).slice(0, n), kg = 0, cost = 0;
    B.forEach(function (b) { kg += b.kg; cost += b.cost; });
    return { n: n, mw: n * I.blockMW, kg: kg, cost: cost, lcoh: n ? cost / kg : null, revenue: price * kg, net: cost - price * kg,
             last: n ? B[n - 1] : null };
  }
  // the size with the lowest cost per kg (n >= 1) and the size with the lowest net cost (n >= 0; ties: the smaller)
  function best(I, price) {
    var N = I.hours.length, lc = null, nt = null;
    for (var n = 0; n <= N; n++) {
      var d = design(I, price, n);
      if (n && (!lc || d.lcoh < lc.lcoh - 1e-12)) lc = d;
      if (!nt || d.net < nt.net - 1e-9) nt = d;
    }
    return { lcoh: lc, net: nt };
  }
  function usd2(v) { return "$" + v.toFixed(2); }
  function musd(v) { var s = (Math.abs(v) / 1e6).toFixed(2); return (v < -5e3 ? "−$" : "$") + s + "M"; }
  function int(v) { return Math.round(v).toLocaleString("en-US"); }
  // the no-JS version of the idea: the blocks as a table, and the best sizes at each price
  function staticIdea(I) {
    var B = blocks(I), rows = B.map(function (b) {
      return "<tr><td>" + b.from + "–" + b.to + " MW</td><td class=\"n\">" + int(b.hours) + "</td><td class=\"n\">" + int(b.kg) + "</td><td class=\"n\">" + usd2(b.perKg) + "</td></tr>";
    }).join("");
    var lines = I.prices.map(function (p) {
      var x = best(I, p);
      return "<li>At " + usd2(p) + "/kg the system's net cost is lowest at <b>" + x.net.mw + " MW</b> (" + musd(x.net.net) + " a year against no electrolyzer), where the hydrogen costs " + usd2(x.net.lcoh) + "/kg on average.</li>";
    }).join("");
    var lc = best(I, I.prices[0]).lcoh;
    return "<p class=\"lx-eyebrow\">" + I.title + " (illustrative)</p>" + staticAssume(I) +
      "<table class=\"lx-facts\"><caption class=\"lx-hint\">Each 10 MW block of the electrolyzer: the hours it runs at full power and its own cost per kilogram.</caption>" +
      "<thead><tr><th scope=\"col\">Block</th><th scope=\"col\">Full-power hours a year</th><th scope=\"col\">Hydrogen, kg a year</th><th scope=\"col\">Its cost per kg</th></tr></thead><tbody>" + rows + "</tbody></table>" +
      "<ul>" + lines + "<li>The lowest cost per kilogram is always the smallest size, " + lc.mw + " MW (" + usd2(lc.lcoh) + "/kg), whatever the price.</li></ul>";
  }
  // the toy's assumptions, one worked block and the sign of the net cost (shown live and in the no-JS version)
  function staticAssume(I) {
    var b = blocks(I)[0];
    var rows = I.assumptions.map(function (a) { return "<tr><th scope=\"row\">" + a[0] + "</th><td>" + a[1] + "</td></tr>"; }).join("");
    return "<table class=\"lx-facts cf2-assume\"><caption class=\"lx-hint\">The toy's assumptions (illustrative)</caption><tbody>" + rows + "</tbody></table>" +
      "<p class=\"lx-hint\">Worked block: " + I.blockMW + " MW × " + int(b.hours) + " h × " + I.kgPerMWh + " kg/MWh = " + int(b.kg) + " kg a year. It costs $" + int(I.annualCostPerMW) +
      " × " + I.blockMW + " + " + usd2(I.variableCostPerKg) + " × " + int(b.kg) + " = $" + int(b.cost) + " a year, so " + usd2(b.perKg) + " per kg.</p>" +
      "<p class=\"lx-hint\">Net cost change below zero: the system saves money compared with no electrolyzer.</p>";
  }
  // the chart's spec for a price and a size (pure, so the test can check where each mark sits): x is the size in blocks
  function chart(I, price, n) {
    var B = blocks(I), N = B.length, d = design(I, price, n), avg = [];
    for (var k = 1; k <= N; k++) avg.push([k, design(I, price, k).lcoh]);
    return {
      bars: B.map(function (b, k) {
        return { x0: k + 0.12, x1: k + 0.88, y0: 0, y1: b.perKg, color: b.perKg < price ? "var(--lx-good)" : "var(--lx-bad)", op: k < n ? 0.85 : 0.18, rx: 3 };
      }),
      avg: avg,
      marks: n ? [{ x: n, y: d.lcoh, label: "You: " + usd2(d.lcoh) + "/kg", kind: "dot", pos: "below" }] : [],
      ticks: [[0, "0"], [2, "20"], [4, "40"], [6, "60"], [8, "80 MW"]]
    };
  }
  // the live status, one idea per line: the last block against the price, then the size against the best ones
  function statusLines(I, price, n) {
    var d = design(I, price, n), bt = best(I, price);
    if (!n) return ["No electrolyzer: the surplus wind is curtailed. <b>Add a block.</b>"];
    var under = d.last.perKg < price;
    var one = "The last block makes hydrogen at <b>" + usd2(d.last.perKg) + "/kg</b>, " + (under ? "below" : "above") + " the " + usd2(price) + " price: it " +
      (under ? "lowers" : "raises") + " the system's net cost.";
    var two = n === bt.net.n ? "<b>This size gives the lowest net cost.</b> Its average cost per kg, " + usd2(d.lcoh) + ", is above the smallest size's " + usd2(bt.lcoh.lcoh) + "."
      : n === bt.lcoh.n ? "This size has the lowest cost per kg, but not the lowest net cost."
      : under ? "Try adding another." : "Try removing it.";
    return [one, two];
  }
  // the explain layer's "where it holds" fallback, from the same data as LX.Boundary
  function rich(t) {
    // glossary marks to spans (the attribute is built in pieces so the build's term scanner does not read "$1" as an id)
    return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\[\[([a-z0-9-]+)\|([^\]]+)\]\]/g, function (m, id, w) {
      return '<span class="lx-term" data-term=' + '"' + id + '">' + w + "</span>";
    });
  }
  function staticBoundary(b) {
    var ul = function (a) { return "<ul>" + a.map(function (t) { return "<li>" + rich(t) + "</li>"; }).join("") + "</ul>"; };
    return "<p class=\"lx-eyebrow\">" + rich(b.title) + "</p><dl class=\"lx-ideas\"><dt>It holds when</dt><dd>" + ul(b.holds) + "</dd><dt>It leaves out</dt><dd>" + ul(b.leaves) + "</dd></dl>" +
      "<p class=\"lx-hint\">" + rich(b.source) + "</p>";
  }
  var model = { blocks: blocks, design: design, best: best, usd2: usd2, musd: musd, chart: chart, status: statusLines, staticAssume: staticAssume,
                staticIdea: staticIdea, staticBoundary: staticBoundary };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H, KEY = "cf2-cost-per-kg-vs-system-cost";

  // the case: the studies in time, and the explain layer's boundary
  LX.mount("cf2", function (live, data) {
    var D = data[KEY.replace(/-/g, "_")];
    LX.Timeline(H("div", { class: "lx-card" }, live), D.timeline);
    var x = document.getElementById("cf2-explain");
    if (x) { x.innerHTML = ""; x.classList.add("is-live"); LX.Boundary(H("div", { class: "lx-xcard" }, x), D.boundary); }
  });

  // the idea: build the electrolyzer block by block at a chosen hydrogen price
  LX.mount("cf2-idea", function (live, data, root) {
    var D = data[KEY.replace(/-/g, "_")], I = D.idea, B = blocks(I), N = B.length;
    var S = { price: I.startPrice, n: I.startBlocks };
    var stage = H("div", { class: "lx-stage" }, live);
    var head = H("div", { class: "lx-stage-head" }, stage);
    H("h3", { text: I.title }, head);
    H("p", { class: "lx-hint", text: I.note }, stage);
    var ctl = H("div", { class: "lx-ctls" }, stage);
    var pr = H("div", { class: "cf-ctl" }, ctl);
    H("p", { class: "cf-ctl-l", id: "cf2-price-l", text: "Hydrogen selling price" }, pr);
    var seg = H("div", { class: "lx-seg", role: "group", "aria-labelledby": "cf2-price-l" }, pr);
    var pbtn = I.prices.map(function (p) {
      var b = H("button", { type: "button", text: usd2(p) + "/kg", "aria-pressed": String(p === S.price) }, seg);
      b.addEventListener("click", function () { S.price = p; paint(true); });
      return b;
    });
    var sz = H("div", { class: "cf-ctl" }, ctl);
    H("p", { class: "cf-ctl-l", id: "cf2-size-l", text: "Electrolyzer size" }, sz);
    var row = H("div", { class: "cf-row", role: "group", "aria-labelledby": "cf2-size-l" }, sz);
    var minus = H("button", { type: "button", class: "lx-btn ghost small", text: "− Remove a block" }, row);
    var plus = H("button", { type: "button", class: "lx-btn small", text: "+ Add a 10 MW block" }, row);
    // aria-disabled, not disabled: a focused button keeps keyboard focus at either end of the range
    minus.addEventListener("click", function () { if (S.n > 0) { S.n--; paint(true); } });
    plus.addEventListener("click", function () { if (S.n < N) { S.n++; paint(true); } });
    var chips = H("div", { class: "lx-readouts" }, stage);
    var P = LX.Plot(stage, { text: "Text version of the chart" });
    // one idea per line, read out together when the state changes
    var status = H("div", { class: "lx-stage-status", "aria-live": "polite", style: "display:grid;gap:4px" }, stage);
    // the numbers behind the blocks, after the interaction (the no-JS version shows them in full)
    var why = H("details", { class: "lx-textalt" }, stage); H("summary", { text: "The toy's assumptions and one worked block" }, why);
    H("div", { html: staticAssume(I) }, why);

    function chip(label, value, cls) { var c = H("div", { class: "lx-readout" + (cls ? " " + cls : "") }, chips); H("span", { text: label }, c); H("b", { text: value }, c); }
    function paint(acted) {
      var d = design(I, S.price, S.n), bt = best(I, S.price), C = chart(I, S.price, S.n);
      pbtn.forEach(function (b, i) { b.setAttribute("aria-pressed", String(I.prices[i] === S.price)); });
      minus.setAttribute("aria-disabled", String(S.n === 0)); plus.setAttribute("aria-disabled", String(S.n === N));
      chips.innerHTML = "";
      chip("Size", d.mw + " MW");
      chip("Cost per kg (LCOH)", d.n ? usd2(d.lcoh) : "none made");
      chip("Net cost change vs no electrolyzer", d.n ? musd(d.net) + " a year" : "$0.00M", d.n === bt.net.n ? "good" : null);
      P.render({
        x: { min: 0, max: N, ticks: C.ticks },
        y: { min: 0, max: 7, step: 1, fmt: function (v) { return "$" + v; }, unit: "$ per kg" },
        height: 250, heightN: 230,
        bars: C.bars,
        refs: [{ y: S.price, label: "Price " + usd2(S.price) + "/kg", labelN: usd2(S.price), color: "var(--lx-ink)", dash: "5 4" }],
        lines: [{ pts: C.avg, color: "var(--lx-accent)", width: 2.2, dots: true }],
        marks: C.marks,
        legend: [{ label: "Each block's own cost per kg (solid: built)", color: "var(--lx-good)" }, { label: "Average cost per kg (LCOH) at that size", color: "var(--lx-accent)" },
                 { label: "Hydrogen price", color: "var(--lx-ink)", dash: "5 4" }],
        aria: "Bars: the cost per kilogram of each 10 megawatt block, rising from " + usd2(B[0].perKg) + " to " + usd2(B[N - 1].perKg) + ". Line: the average cost per kilogram at each size. Dashed line: the price, " + usd2(S.price) + " per kilogram.",
        text: { head: ["Block", "Its cost per kg", "Average if built up to here", "Built?"],
                rows: B.map(function (b, k) { return [b.from + "–" + b.to + " MW", usd2(b.perKg), usd2(design(I, S.price, k + 1).lcoh), k < S.n ? "yes" : "no"]; }),
                note: "Net cost of the system at " + usd2(S.price) + "/kg: lowest at " + bt.net.mw + " MW (" + musd(bt.net.net) + " a year)." }
      });
      status.innerHTML = statusLines(I, S.price, S.n).map(function (t) { return "<p>" + t + "</p>"; }).join("");
      if (acted) LX.store.set("cf2-idea", { price: S.price, n: S.n });
    }
    var saved = LX.store.get("cf2-idea");
    if (saved && I.prices.indexOf(saved.price) >= 0 && saved.n >= 0 && saved.n <= N) { S.price = saved.price; S.n = saved.n; }
    paint(false);
    // demo states (core.js LX.demo): "mid" = the lowest net cost at the start price; "best-5" = the lowest net cost at $5
    LX.demo(root, function (state) {
      if (state === "mid") { S.price = I.startPrice; S.n = best(I, S.price).net.n; paint(false); return { view: "lowest net cost at " + usd2(S.price) }; }
      if (state === "best-5") { S.price = 5; S.n = best(I, 5).net.n; paint(false); return { view: "lowest net cost at $5.00" }; }
      return null;
    });
  });
})();
