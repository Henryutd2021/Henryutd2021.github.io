/* frontier.js — LX.Frontier: cost against emissions. The frontier (the cheapest plan at each CO₂ level) as a line with the
   region below it shaded "out of reach (approximately)", labeled plan dots that can be picked by mouse or keyboard, and an equal-score
   line for a weighted sum (cost + price × CO₂); lessons 12 and 13.
   var fc = LX.Frontier(host, {
     label: "Cost per year against CO₂ per year",   the chart's spoken name
     xMax: 850,  yMin: 90,  yMax: 200,              CO₂ axis end (kt); cost axis start and its lowest top ($M; the top
                                                    grows to fit the points)
     xLabel: "CO₂ per year, kt (thousand tonnes)", yLabel: "Cost per year", shadeLabel: "out of reach (approximately)",
     frontierLabel: "Frontier: the cheapest plan at each CO₂",     the legend's default name of the line
     priceLabel: function (p) { return "Equal score at $" + Math.round(p) + "/t"; },
     fmtX: function (t) { return "530 kt"; }, fmtY: function (usd) { return "$131.4M"; },   text version and spoken labels
     altTitle: "Text version of the chart",
     xStep: 200, yStep: 25 });                      tick steps: CO₂ gridlines every xStep kt (default 200); cost
                                                    gridlines every yStep $M (default 20, 25 or 50 by the axis span)
   Points carry co2 in tonnes and cost in dollars a year (the axes show kt and $M).
   fc.frontier([{ co2, cost, cap (kt, or null for no cap), solved }], label)   the line; solved points get a dot
   fc.plans([{ id: "A", label: "Gas-heavy", co2, cost, color, kind: "plan" | "you" | <other>, mark: "dominated" | "never",
               ring: true, legend: "Your plan", note: "text-version note" }])
                    kind "plan": a lettered dot (pickable once pick() is set); "you": a larger dot with a hole; other kinds
                    are smaller dots, each kind listed once in the legend with its `legend` text. mark: an open dot
                    (dominated: dashed). ring: an accent ring (the current pick or winner).
   fc.price(p $/t, through {co2, cost} | null)   the equal-score line through a point, slope −p; null removes it
   fc.pick(fn(id))   plan dots become buttons (Tab, Enter, Space, click), each with a spoken label | fc.focusDot(id) | fc.el
   It redraws at its own width (text stays 12 px), on resize and on the day/night switch.
   Text version (details.lx-textalt): a table of every point and every frontier point (CO₂, cost, note).
   Node: module.exports = { yTop, scoreLine, sortFrontier, stepOf } (pure). */
(function () {
  "use strict";
  // ---------------------------------------------------------------- pure (no DOM; exported for Node)
  // the top of the cost axis ($M): at least yMax, and the highest cost rounded up to 40 plus 10
  function yTop(points, yMax) {
    var mx = 0; points.forEach(function (p) { if (p.cost > mx) mx = p.cost; });
    return Math.max(yMax || 200, Math.ceil(mx / 1e6 / 40) * 40 + 10);
  }
  // the equal-score line through a point: cost($) = c0 + p × (co2_0 − co2), from 0 t to xMaxT t
  function scoreLine(price, through, xMaxT) {
    return { x0: 0, y0: through.cost + price * through.co2, x1: xMaxT, y1: through.cost + price * (through.co2 - xMaxT) };
  }
  function sortFrontier(points) { return points.slice().sort(function (a, b) { return a.co2 - b.co2; }); }
  // the gridline steps: the cost axis ($M) by its span unless yStep is given, the CO₂ axis (kt) every xStep or 200
  function stepOf(yMin, yMax, o) {
    o = o || {}; var span = yMax - yMin;
    return { x: o.xStep > 0 ? o.xStep : 200, y: o.yStep > 0 ? o.yStep : span > 250 ? 50 : span > 120 ? 25 : 20 };
  }
  if (typeof module !== "undefined" && module.exports) module.exports = { yTop: yTop, scoreLine: scoreLine, sortFrontier: sortFrontier, stepOf: stepOf };
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H, S = LX.S;
  LX.Frontier = function (host, o) {
    o = o || {};
    var fmtY = o.fmtY || function (v) { return "$" + (v / 1e6).toFixed(1) + "M"; };
    var fmtX = o.fmtX || function (v) { return Math.round(v / 1e3).toLocaleString("en-US") + " kt"; };
    var box = H("div", { class: "lx-frontier" }, host);
    var W = 640, HH = 310, ml = 64, mr = 14, mt = 26, mb = 44, lastW = 0;   // drawn at the box's own width: text stays 12 px
    var svg = S("svg", { viewBox: "0 0 " + W + " " + HH, role: "group", "aria-label": o.label || "Cost per year against CO₂ per year" }, box);
    var gA = S("g", null, svg), gF = S("g", null, svg), gL = S("g", null, svg), gP = S("g", null, svg);
    var leg = H("div", { class: "lx-legend", "aria-hidden": "true" }, box);
    var alt = H("details", { class: "lx-textalt lx-frontier-alt" }, box); H("summary", { text: o.altTitle || "Text version of the chart" }, alt);
    var altB = H("div", null, alt);
    var st = { fr: [], frLabel: "", plans: [], price: null, onPick: null, xMax: o.xMax || 850, yMin: o.yMin || 90, yMax: 280 };
    function X(t) { return ml + Math.min(st.xMax, t / 1e3) / st.xMax * (W - ml - mr); }
    function Y(c) { return mt + (1 - (Math.min(st.yMax, c / 1e6) - st.yMin) / (st.yMax - st.yMin)) * (HH - mt - mb); }
    function axes() {
      gA.innerHTML = "";
      var steps = stepOf(st.yMin, st.yMax, o), stp = steps.y;
      for (var y = Math.ceil(st.yMin / stp) * stp; y <= st.yMax + 1e-9; y = Math.round((y + stp) * 1e6) / 1e6) {
        S("line", { x1: ml, x2: W - mr, y1: Y(y * 1e6), y2: Y(y * 1e6), stroke: "var(--lx-line)" }, gA);
        S("text", { x: ml - 6, y: Y(y * 1e6) + 4, "text-anchor": "end" }, gA).textContent = "$" + y + "M";
      }
      for (var x = 0; x <= st.xMax + 1e-9; x = Math.round((x + steps.x) * 1e6) / 1e6) {
        S("line", { x1: X(x * 1e3), x2: X(x * 1e3), y1: mt, y2: HH - mb, stroke: "var(--lx-line)", "stroke-dasharray": "2 4" }, gA);
        S("text", { x: X(x * 1e3), y: HH - mb + 17, "text-anchor": "middle" }, gA).textContent = x;
      }
      S("text", { x: (ml + W - mr) / 2, y: HH - 6, "text-anchor": "middle", class: "note" }, gA).textContent = o.xLabel || "CO₂ per year, kt (thousand tonnes)";
      S("text", { x: 4, y: 12, class: "note" }, gA).textContent = o.yLabel || "Cost per year";
    }
    function size() { W = Math.max(300, Math.round(box.clientWidth || 640)); HH = W < 520 ? 270 : 310; ml = W < 520 ? 52 : 64; svg.setAttribute("viewBox", "0 0 " + W + " " + HH); lastW = W; }
    function draw() {
      size(); st.yMax = yTop(st.fr.concat(st.plans), o.yMax); axes(); gF.innerHTML = ""; gL.innerHTML = ""; gP.innerHTML = ""; leg.innerHTML = "";
      var fr = sortFrontier(st.fr);
      if (fr.length > 1) {
        var d = fr.map(function (p, i) { return (i ? "L" : "M") + X(p.co2).toFixed(1) + "," + Y(p.cost).toFixed(1); }).join("");
        S("path", { d: d + "L" + X(fr[fr.length - 1].co2).toFixed(1) + "," + (HH - mb) + "L" + X(fr[0].co2).toFixed(1) + "," + (HH - mb) + "Z", fill: "var(--lx-surface-3)", opacity: ".55" }, gF);
        S("path", { d: d, fill: "none", stroke: "var(--lx-ink)", "stroke-width": 2.2 }, gF);
        var mid = fr[Math.floor(fr.length * 0.55)];
        var sh = S("text", { x: X(mid.co2), y: HH - mb - 8, "text-anchor": "middle", class: "note" }, gF);
        sh.textContent = o.shadeLabel || "out of reach (approximately)";   // straight lines join solved points: the true edge may sag below
        var shw = (sh.getComputedTextLength && sh.getComputedTextLength()) || sh.textContent.length * 6.6;   // kept inside the plot on phones
        sh.setAttribute("x", Math.max(ml + shw / 2 + 2, Math.min(W - mr - shw / 2 - 2, X(mid.co2))).toFixed(1));
        fr.forEach(function (p) { if (p.solved) S("circle", { cx: X(p.co2), cy: Y(p.cost), r: 3.5, fill: "var(--lx-ink)" }, gF); });
        var s1 = H("span", null, leg); H("i", { style: "--c:var(--lx-ink);height:3px" }, s1); H("span", { text: st.frLabel || o.frontierLabel || "Frontier: the cheapest plan at each CO₂" }, s1);
      }
      if (st.price && st.price.through) {
        var sl = scoreLine(st.price.p, st.price.through, st.xMax * 1e3);
        S("line", { x1: X(sl.x0), y1: Y(sl.y0), x2: X(sl.x1), y2: Y(sl.y1), stroke: "var(--lx-accent)", "stroke-width": 2, "stroke-dasharray": "6 4" }, gL);
        var s2 = H("span", null, leg); H("i", { class: "line", style: "border-top-color:var(--lx-accent)" }, s2);
        H("span", { text: o.priceLabel ? o.priceLabel(st.price.p) : "Equal score at $" + Math.round(st.price.p) + "/t" }, s2);
      }
      var labs = [];   // plan letters, placed after all dots (see below)
      st.plans.forEach(function (p) {
        var g = S("g", { class: "dot" + (st.onPick && p.kind === "plan" ? " pick" : ""), transform: "translate(" + X(p.co2).toFixed(1) + "," + Y(p.cost).toFixed(1) + ")" }, gP);
        var r = p.kind === "you" ? 9 : p.kind === "plan" ? 8 : 6.5;
        if (p.ring) S("circle", { r: r + 5, fill: "none", stroke: "var(--lx-accent)", "stroke-width": 2.5 }, g);
        S("circle", { class: "c", r: r, fill: p.mark === "dominated" || p.mark === "never" ? "var(--lx-surface)" : p.color || "var(--lx-ink)",
                      stroke: p.color || "var(--lx-ink)", "stroke-width": 2.5, "stroke-dasharray": p.mark === "dominated" ? "3 2" : null }, g);
        if (p.kind === "you") S("circle", { r: 3, fill: "var(--lx-surface)" }, g);
        if (p.id) { var lb = S("text", { x: r + 4, y: -r + 2, class: "lab" }, g); lb.textContent = p.id; labs.push({ el: lb, r: r, x: X(p.co2), y: Y(p.cost) }); }
        if (st.onPick && p.kind === "plan") {
          g.setAttribute("tabindex", "0"); g.setAttribute("role", "button");
          g.setAttribute("aria-label", "Plan " + p.id + ", " + p.label + ": " + fmtY(p.cost) + " and " + fmtX(p.co2) + " of CO₂ a year");
          var go = function () { st.onPick(p.id); };
          g.addEventListener("click", go);
          g.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
        }
      });
      // a plan's letter goes up and right of its dot; when it would touch another letter or dot (two plans close
      // together), it takes the first free corner of up-left, down-right and down-left
      var taken = [], hit = function (a, b) { return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h; };
      labs.forEach(function (L) {
        var tries = [[L.r + 4, -L.r + 2, "start"], [-L.r - 4, -L.r + 2, "end"], [L.r + 4, L.r + 12, "start"], [-L.r - 4, L.r + 12, "end"]], pick = null;
        for (var k = 0; k < tries.length && !pick; k++) {
          L.el.setAttribute("x", tries[k][0]); L.el.setAttribute("y", tries[k][1]); L.el.setAttribute("text-anchor", tries[k][2]);
          var b = L.el.getBBox && L.el.getBBox(); if (!b || !b.width) { pick = tries[k]; break; }
          var bx = { x: L.x + b.x, y: L.y + b.y, w: b.width, h: b.height };
          var clash = bx.x < ml || bx.x + bx.w > W - mr || taken.some(function (t) { return hit(bx, t); }) ||
            labs.some(function (M) { return M !== L && hit(bx, { x: M.x - M.r - 2, y: M.y - M.r - 2, w: 2 * M.r + 4, h: 2 * M.r + 4 }); });
          if (!clash) { pick = tries[k]; taken.push(bx); }
        }
        if (!pick) { L.el.setAttribute("x", tries[0][0]); L.el.setAttribute("y", tries[0][1]); L.el.setAttribute("text-anchor", "start"); }
      });
      var kinds = {};
      st.plans.forEach(function (p) { if (p.kind !== "plan" && !kinds[p.kind] && p.legend) { kinds[p.kind] = 1; var s = H("span", null, leg); H("i", { style: "--c:" + p.color + ";border-radius:50%" }, s); H("span", { text: p.legend }, s); } });
      // text version
      altB.innerHTML = "";
      var tb = H("table", null, altB), hr = H("tr", null, H("thead", null, tb));
      ["Point", "CO₂ a year", "Cost a year", "Note"].forEach(function (t) { H("th", { scope: "col", text: t }, hr); });
      var bd = H("tbody", null, tb);
      st.plans.concat(fr.map(function (p) { return { id: "Frontier", label: p.cap == null ? "no cap" : "cap " + p.cap + " kt", co2: p.co2, cost: p.cost }; })).forEach(function (p) {
        var tr = H("tr", null, bd);
        [(p.id ? p.id + ": " : "") + (p.label || ""), fmtX(p.co2), fmtY(p.cost), p.note || (p.mark === "dominated" ? "dominated" : "")].forEach(function (t) { H("td", { text: t }, tr); });
      });
    }
    LX.onTheme(draw);
    if (window.ResizeObserver) new ResizeObserver(function () { if (Math.abs((box.clientWidth || 0) - lastW) > 8) draw(); }).observe(box);
    draw();
    return {
      el: box,
      frontier: function (pts, label) { st.fr = pts || []; st.frLabel = label || ""; draw(); },
      plans: function (pl) { st.plans = pl || []; draw(); },
      price: function (p, through) { st.price = p == null ? null : { p: p, through: through }; draw(); },
      pick: function (fn) { st.onPick = fn; draw(); },
      focusDot: function (id) { var n = [].filter.call(gP.querySelectorAll(".dot"), function (g) { return g.textContent === id; })[0]; if (n) n.focus(); }
    };
  };
  LX.Frontier.yTop = yTop;
  LX.Frontier.scoreLine = scoreLine;
})();
