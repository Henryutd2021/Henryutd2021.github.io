// cf4-existing-reactors-hydrogen.js — Case file CF4 (case form, wave W6, 2026-11-07; live since Henry approved E15 on
// 2026-11-07, reports/learn/excerpts_for_approval.md, "W6 sources"). Existing plants only. Depth D2 (working knowledge),
// closed-form toy; the Go deeper box gives its arithmetic, nothing more.
//
// Data: assets/learn/data/cf4-existing-reactors-hydrogen.json: the study in time (LX.Timeline: E15.26 and E15.27), where
// the study's result holds (LX.Boundary: E15.25 split at its clauses, word for word, with E15.30 as its source line), the
// scale mark (LX.ScaleStrip, with data/f01-five-scales.json) and the toy ("idea"). The research text in the data file is
// approved E15 wording, word for word; this script adds none of its own.
//
// The idea (illustrative; a generic existing plant with round numbers, some of them the reader's; not the study's inputs,
// equations or results; one day of 24 hours, power as an average over each hour, money in dollars for the day): the
// plant makes P MW in every hour and runs at full power either way, so its fuel, upkeep and its own (sunk) capital are
// the same in both cases and left out. In each hour t it splits its output:
//   g_t  MW sold to the grid at the hour's price p_t (the reader's price level times the day's shape), dollars per MWh
//   h_t  MW of electricity sent to an electrolyzer of size E, which makes k kg of hydrogen per MWh, sold at one fixed
//        assumed price pi_H per kg, so a MWh as hydrogen earns v = k pi_H (electricity only: the steam a
//        high-temperature electrolyzer also takes is left out, so every MW in the toy is electrical; review #2)
//   r_t  MW held as up-reserve, paid q per MW-hour (simplified: one product, never called); turning the
//        electrolyzer down sends its power to the grid, so r_t <= h_t; a plant at full power has no other headroom
//   bounds: g_t + h_t = P, 0 <= h_t <= E, 0 <= r_t <= h_t (so g_t >= P - E >= 0; E is at most P)
//   the electrolyzer's capital (as an annual equivalent) and upkeep: c per MW per day, paid whether it runs or not
//   goal: the largest day's net, sum_t (p_t g_t + v h_t + q r_t) - c E
//   answer, hour by hour (no storage, start-ups or ramps link the hours): h_t = E when v + q > p_t, else 0 (a tie
//   sells); r_t = h_t when reserves are offered (q = 0 and r_t = 0 when not)
//   against selling all the power ("business as usual": P p_t every hour), the gain before the electrolyzer's cost is
//   E sum_t max(0, v + q - p_t), never below zero; the change after its cost is that minus c E
// No hydrogen-price slider and no credit anywhere in the toy: the hydrogen price is one fixed assumption. Every number on
// the page is checked by _tests/learn/test_cf4-existing-reactors-hydrogen.js.
(function () {
  "use strict";

  // ---------------------------------------------------------------- pure model (no DOM; exported for Node)
  function hh(t) { return (t < 10 ? "0" : "") + t + ":00"; }
  function span(t) { return hh(t) + "–" + (t + 1 === 24 ? "24:00" : hh(t + 1)); }
  function snap(v) { return Math.round(v * 100) / 100; }                       // to the cent, after float noise
  function int(n) { return String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
  function money(v) { var r = Math.round(v); return (r < 0 ? "−$" : "$") + int(r); }
  function per(v) { var c = Math.round(v * 100); return "$" + (c % 100 === 0 ? int(c / 100) : (Math.abs(c) / 100).toFixed(2)); }   // $12 or $32.50
  function usd2(v) { return "$" + (Math.round(v * 100) / 100).toFixed(2); }                // $2.00 (a price per kg)
  function mw(v) { return int(v) + " MW"; }
  function pct(f) { return (Math.round(f * 1000) / 10).toFixed(1) + "%"; }
  // the hour's grid price at the reader's price level, dollars per MWh
  function priceAt(I, s, t) { return snap(I.prices[t] * s.level); }
  // the toy's day: the plant's split in every hour, the money and the readouts
  function day(I, s) {
    var P = I.plantMW, E = s.elz, v = I.kgPerMWh * I.h2Price, q = s.reserves ? s.reserve : 0;
    var hours = [], energy = 0, hydrogen = 0, reserve = 0, kg = 0, bau = 0, run = 0, held = 0;
    for (var t = 0; t < I.prices.length; t++) {
      var p = priceAt(I, s, t), on = E > 0 && v + q > p, h = on ? E : 0, g = P - h, r = s.reserves ? h : 0;
      var x = { t: t, p: p, g: g, h: h, r: r, run: on, energy: snap(p * g), hydrogen: v * h, reserve: q * r, kg: I.kgPerMWh * h, value: v + q };
      hours.push(x);
      energy += x.energy; hydrogen += x.hydrogen; reserve += x.reserve; kg += x.kg; bau += snap(p * P); run += on ? 1 : 0; held += r > 0 ? 1 : 0;
    }
    energy = Math.round(energy); hydrogen = Math.round(hydrogen); reserve = Math.round(reserve); bau = Math.round(bau);
    var cost = Math.round(I.elzCostPerMWDay * E), revenue = energy + hydrogen + reserve, net = revenue - cost;
    var gs = hours.map(function (x) { return x.g; });
    return { s: s, v: v, q: q, value: v + q, hours: hours, energy: energy, hydrogen: hydrogen, reserve: reserve, kg: kg, bau: bau,
             cost: cost, revenue: revenue, net: net, gross: revenue - bau, change: net - bau, runHours: run, heldHours: held,
             gridMin: Math.min.apply(null, gs), gridMax: Math.max.apply(null, gs), reserveShare: revenue > 0 ? reserve / revenue : 0,
             priceMin: Math.min.apply(null, hours.map(function (x) { return x.p; })), priceMax: Math.max.apply(null, hours.map(function (x) { return x.p; })) };
  }
  function at(I, o) { var s = {}, k; for (k in I.start) s[k] = I.start[k]; for (k in o || {}) s[k] = o[k]; return s; }
  // "$33,400 better" / "$8,360 worse" / "no different"
  function better(c) { var r = Math.round(c); return r > 0 ? money(r) + " better" : r < 0 ? money(-r) + " worse" : "no different"; }
  function changeLine(d) {
    if (!d.s.elz) return "With no electrolyzer the plant sells all its power, so nothing changes.";
    return "Against selling all its power, the day comes out " + better(d.change) + ": " + money(d.gross) + " gained before the electrolyzer's cost, minus its " + money(d.cost) + ".";
  }
  function gridRange(d) { return d.gridMin === d.gridMax ? mw(d.gridMin) + " all day" : int(d.gridMin) + " to " + mw(d.gridMax); }
  function valueWords(d) { return d.q > 0 ? "as hydrogen and reserve" : "as hydrogen"; }
  // where the picked hour's power goes, and why
  function hourLine(I, d, t) {
    var x = d.hours[t];
    if (!d.s.elz) return "At " + hh(t) + " the grid pays " + per(x.p) + " per MWh; with no electrolyzer, all " + mw(I.plantMW) + " are sold.";
    var head = "At " + hh(t) + " the grid pays " + per(x.p) + " per MWh and a MWh earns " + per(x.value) + " " + valueWords(d);
    if (x.run) return head + ", so " + mw(x.h) + " go to the electrolyzer and " + mw(x.g) + " to the grid.";
    if (Math.round(x.p * 100) === Math.round(x.value * 100)) return head + ": the same, so the toy sells all " + mw(I.plantMW) + ".";
    return head + ", less than the grid pays, so all " + mw(I.plantMW) + " are sold.";
  }
  // the picked hour's three sums, with the hour that turns MW into MWh (review #6)
  function sceneLines(I, d, t) {
    var x = d.hours[t];
    return {
      grid: mw(x.g) + " × 1 h = " + int(x.g) + " MWh; × " + per(x.p) + " per MWh = " + money(x.energy),
      h2: !d.s.elz ? "none built" : x.h ? mw(x.h) + " × 1 h = " + int(x.h) + " MWh → " + int(x.kg) + " kg × " + usd2(I.h2Price) + " per kg = " + money(x.hydrogen) : "off this hour",
      res: !d.s.reserves ? "not offered" : x.r ? mw(x.r) + " × 1 h × " + per(d.q) + " per MW-hour = " + money(x.reserve) : "none: the electrolyzer is off"
    };
  }
  // where to start every practice question (review #5): the defaults, as the Reset button restores them
  function startLine(I) {
    var s = I.start;
    return "Start each one from the defaults: press Reset (price level ×" + s.level.toFixed(1) + ", reserve price " + per(s.reserve) + " per MW-hour, electrolyzer " + mw(s.elz) + ", reserves " + (s.reserves ? "offered" : "off") + ").";
  }
  // the toy's assumptions, written from the data (no number retyped)
  function assumptions(I) {
    var v = I.kgPerMWh * I.h2Price;
    return [
      "Illustrative: the plant makes " + mw(I.plantMW) + " of electricity in every hour, in both cases.",
      "Its fuel and upkeep are the same either way, and its own capital is already spent (a [[sunk-cost|sunk cost]]), so none of them changes the comparison.",
      "Electricity only: the electrolyzer makes " + I.kgPerMWh + " kg of hydrogen from each MWh of the plant's electricity it takes (" + Math.round(1000 / I.kgPerMWh) + " kWh per kg), sold at an assumed " + usd2(I.h2Price) + " per kg, fixed: " + per(v) + " per MWh.",
      "The electrolyzer's capital, as an annual equivalent, and its upkeep: " + per(I.elzCostPerMWDay) + " per MW of electrolyzer per day, paid whether it runs or not.",
      "Reserves, simplified: one product, paid per MW held for an hour (per MW-hour), never called; turning the electrolyzer down sends its electricity to the grid, so its load is the reserve.",
      "Two different measures: the range of output to the grid over the day, from its lowest hour to its highest, and the reserve, the MW held for the grid in one hour.",
      "Left out: the steam a high-temperature electrolyzer also takes; the electrolyzer's minimum load, start-ups, ramp limits and wear; hydrogen storage and a battery; prices that move when the plant changes what it sells.",
      "With no storage and no start-ups, each hour is decided on its own: one hour's choice does not change the next."
    ];
  }
  var LEDGER = { cols: ["", "Sell all its power", "With hydrogen and reserves"],
                 rows: ["Energy sold to the grid", "Hydrogen", "Reserves", "Electrolyzer's daily cost", "Revenue less the electrolyzer's cost"] };
  function ledgerRows(d) {
    var cost = d.cost ? "−" + money(d.cost) : money(0);
    return [[LEDGER.rows[0], money(d.bau), money(d.energy)], [LEDGER.rows[1], money(0), money(d.hydrogen)],
            [LEDGER.rows[2], money(0), d.s.reserves ? money(d.reserve) : "off"], [LEDGER.rows[3], money(0), cost],
            [LEDGER.rows[4], money(d.bau), money(d.net)]];
  }
  var LEDGER_CAPTION = "One illustrative day, in dollars: selling all the power against adding the electrolyzer and reserves. The plant's own fuel and upkeep, the same in both columns, are left out, so neither total is the plant's profit.";
  var HOURS_HEAD = ["Hour", "Grid price ($ per MWh)", "To the grid (MW)", "To the electrolyzer (MW)", "Reserve held (MW)"];
  function hourRows(d) { return d.hours.map(function (x) { return [span(x.t), per(x.p), int(x.g), int(x.h), int(x.r)]; }); }
  function facts(I, d) {
    return [
      "The day's grid prices run from " + per(d.priceMin) + " to " + per(d.priceMax) + " per MWh; a MWh made into hydrogen earns " + per(d.v) + " (" + I.kgPerMWh + " kg at " + usd2(I.h2Price) + " per kg)" + (d.q > 0 ? ", and holding it as a reserve adds " + per(d.q) + " per MW-hour." : "."),
      d.s.elz ? "The " + mw(d.s.elz) + " electrolyzer runs in " + d.runHours + " of 24 hours; output to the grid: " + gridRange(d) + "." : "With no electrolyzer, output to the grid is " + mw(I.plantMW) + " all day."
    ];
  }
  function table(head, rows, caption, cls) {
    return "<table class=\"" + (cls || "lx-mini-table") + "\">" + (caption ? "<caption class=\"lx-hint\">" + caption + "</caption>" : "") +
      "<thead><tr>" + head.map(function (h) { return "<th scope=\"col\">" + h + "</th>"; }).join("") + "</tr></thead><tbody>" +
      rows.map(function (r, i) { return "<tr" + (cls === "cf-two lx-ledger" && i === rows.length - 1 ? " class=\"tot\"" : "") + "><th scope=\"row\">" + r[0] + "</th>" + r.slice(1).map(function (c) { return "<td class=\"n\">" + c + "</td>"; }).join("") + "</tr>"; }).join("") +
      "</tbody></table>";
  }
  function rich(t) {
    return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\[\[([a-z0-9-]+)\|([^\]]+)\]\]/g, function (m, id, w) {
      return '<span class="lx-term" data-term=' + '"' + id + '">' + w + "</span>";
    });
  }
  // the toy in the no-JS version (the reader's defaults)
  function staticIdea(I) {
    var d = day(I, at(I));
    return "<p class=\"lx-eyebrow\">" + I.title + " (illustrative)</p>" +
      "<p class=\"lx-hint\">" + I.note + "</p>" +
      "<ul>" + facts(I, d).map(function (t) { return "<li>" + t + "</li>"; }).join("") + "</ul>" +
      "<div class=\"lx-scroll-x\">" + table(LEDGER.cols.slice(), ledgerRows(d), LEDGER_CAPTION + " At the defaults.", "cf-two lx-ledger") + "</div>" +
      "<p>" + changeLine(d) + "</p>" +
      "<details class=\"lx-textalt\"><summary>The day hour by hour</summary><div class=\"lx-scroll-x\">" + table(HOURS_HEAD, hourRows(d)) + "</div></details>" +
      "<details class=\"lx-textalt\"><summary>The toy's assumptions</summary><ul>" + assumptions(I).map(function (t) { return "<li>" + rich(t) + "</li>"; }).join("") + "</ul></details>";
  }
  // worked answers to "Try it yourself", from the model (shown with and without JavaScript): one row per setting, each
  // from the defaults (review #5), as setting / result / why (review #4); the arithmetic as displayed
  function runs(d) { return d.s.elz ? "runs in " + (d.runHours === 24 ? "all 24 hours" : d.runHours + " of 24 hours") : "none built"; }
  function hourRow(I, d, t) {
    var x = d.hours[t], earn = "the " + per(x.value) + " a MWh earns " + valueWords(d);
    return ["Pick " + hh(t), x.run ? mw(x.h) + " to the electrolyzer, " + mw(x.g) + " to the grid" : "all " + mw(I.plantMW) + " sold",
            "The grid pays " + per(x.p) + " per MWh, " + (x.run ? "less than " : Math.round(x.p * 100) === Math.round(x.value * 100) ? "the same as " : "more than ") + earn + "."];
  }
  function worked(I) {
    var P = I.practice, D0 = day(I, at(I)), lo = day(I, at(I, { level: P.levels[0] })), hi = day(I, at(I, { level: P.levels[1] }));
    var off = day(I, at(I, { reserves: false })), z = day(I, at(I, { elz: P.elz[0] })), big = day(I, at(I, { elz: P.elz[1] }));
    var lost = D0.hours.filter(function (x, t) { return x.run && !off.hours[t].run; });
    var dear = hi.hours.filter(function (x) { return !x.run; }), tie = dear.some(function (x) { return Math.round(x.p * 100) === Math.round(x.value * 100); });
    var gain = function (d) { return money(d.gross) + " gained before its cost, minus its " + money(d.cost) + "."; };
    return [
      ["Price level ×" + P.levels[0].toFixed(1), runs(lo) + "; " + better(lo.change),
       (lo.runHours === 24 ? "The dearest hour pays " + per(lo.priceMax) + " per MWh, less than the " + per(lo.value) + " a MWh earns " + valueWords(lo) + ". " : "") + gain(lo)],
      ["Price level ×" + P.levels[1].toFixed(1), runs(hi) + "; " + better(hi.change),
       "In " + dear.length + " hours the grid pays " + (tie ? "as much as or more than " : "more than ") + per(hi.value) + " per MWh. " + gain(hi)],
      ["Reserves off", (off.runHours === 24 ? "runs in all 24 hours" : "runs in " + off.runHours + " hours") + ", not " + D0.runHours + "; " + better(off.change) + ", not " + money(D0.change),
       (lost.length ? "At " + lost.map(function (x) { return hh(x.t) + " the grid's " + per(x.p) + " per MWh"; }).join(" and ") + " beats " + per(off.value) + " as hydrogen alone. " : "") +
       "Reserves were " + pct(D0.reserveShare) + " of revenue, yet the gain falls by " + money(D0.change - off.change) + "."],
      ["Electrolyzer " + mw(P.elz[0]), "output to the grid " + gridRange(z) + "; " + better(z.change), "Nothing goes to hydrogen, and there is no electrolyzer to pay for."],
      ["Electrolyzer " + mw(P.elz[1]), "output to the grid " + gridRange(big) + "; " + better(big.change),
       (big.runHours === D0.runHours ? "It runs in the same " + big.runHours + " hours. " : "") + gain(big)],
      hourRow(I, D0, P.hours[0]),
      hourRow(I, D0, P.hours[1])
    ];
  }
  var WORKED_HEAD = ["Setting, from the defaults", "Result, against selling all the power", "Why"];
  function staticWorked(I) {
    return "<details class=\"lx-answer\"><summary>Worked answers, each from the toy's defaults</summary><div class=\"lx-scroll-x\">" +
      table(WORKED_HEAD, worked(I), "") + "</div><p>The plant's own costs are the same in every case, so they never enter.</p></details>";
  }
  function staticBoundary(b) {
    var ul = function (a) { return "<ul>" + a.map(function (t) { return "<li>" + rich(t) + "</li>"; }).join("") + "</ul>"; };
    return "<p class=\"lx-eyebrow\">" + rich(b.title) + "</p><dl class=\"lx-ideas\"><dt>It holds when</dt><dd>" + ul(b.holds) + "</dd><dt>It leaves out</dt><dd>" + ul(b.leaves) + "</dd></dl>" +
      "<p class=\"lx-hint\">" + rich(b.source) + "</p>";
  }
  var model = { hh: hh, span: span, money: money, per: per, usd2: usd2, mw: mw, pct: pct, priceAt: priceAt, day: day, at: at, better: better,
                changeLine: changeLine, gridRange: gridRange, hourLine: hourLine, sceneLines: sceneLines, startLine: startLine,
                assumptions: assumptions, ledgerRows: ledgerRows, LEDGER: LEDGER, LEDGER_CAPTION: LEDGER_CAPTION, HOURS_HEAD: HOURS_HEAD,
                hourRows: hourRows, facts: facts, staticIdea: staticIdea, worked: worked, WORKED_HEAD: WORKED_HEAD, hourRow: hourRow,
                staticWorked: staticWorked, staticBoundary: staticBoundary };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H, KEY = "cf4_existing_reactors_hydrogen";
  function css() {
    if (document.getElementById("cf4-css")) return;
    H("style", { id: "cf4-css", text: [
      ".cf4-scene{display:flex;flex-wrap:wrap;gap:8px;align-items:stretch;margin:.4rem 0;min-width:0;overflow-wrap:anywhere}",
      ".cf4-scene>p{flex-basis:100%;margin:0;font-size:12.5px;font-family:var(--lx-f-display);color:var(--lx-ink-2)}",
      ".cf4-part{flex:1 1 150px;min-width:0;border:1px solid var(--lx-line);border-radius:10px;padding:7px 9px;background:var(--lx-surface-2)}",
      ".cf4-part b{display:block;font-family:var(--lx-f-display);font-size:13.5px}.cf4-part .v{font-size:12.5px;color:var(--lx-ink-2);font-family:var(--lx-f-mono);margin-top:2px}",
      ".cf4-part.p-grid{border-left:4px solid var(--lx-accent)}.cf4-part.p-h2{border-left:4px solid var(--lx-tier-5)}.cf4-part.p-res{border-left:4px solid var(--lx-good)}",
      ".cf4-part.is-off{border-style:dashed;background:transparent}",
      ".cf4-charts{display:grid;gap:4px;min-width:0}",
      ".cf4-bnd dd[data-e15=\"E15.5\"]{border:2px dashed var(--lx-accent);border-radius:10px;padding:6px 10px}",
      ".cf4-bnd dd[data-e15=\"E15.7\"]{border:1px solid var(--lx-line-2);border-radius:10px;padding:6px 10px}",
      ".cf4-g{border:1px solid var(--lx-line);border-radius:10px;padding:7px 10px;background:var(--lx-surface-2);display:grid;gap:4px;min-width:0}",
      ".lx-case-part .cf4-g>p.cf4-gl{margin:0;font-family:var(--lx-f-display);font-size:13px;color:var(--lx-ink)}",
      "dl.cf4-dgr{display:grid;grid-template-columns:minmax(0,1fr);gap:8px;margin:0;font-size:15px}",
      ".cf4-dgr>div{border:1px solid var(--lx-line);border-radius:10px;padding:7px 10px;background:var(--lx-surface-2);min-width:0}",
      ".cf4-dgr dt{font-family:var(--lx-f-display);font-weight:500;color:var(--lx-ink);margin-bottom:2px}",
      ".cf4-dgr dd{margin:0;color:var(--lx-ink-2)}",
      ".cf4-reset{align-self:end}",
      "@media (max-width:560px){.cf4-part{flex-basis:100%}}"
    ].join("\n") }, document.head);
  }

  // the case: the study in time, then the explain layer's boundary and scale
  LX.mount("cf4", function (live, data) {
    css();
    var D = data[KEY];
    LX.Timeline(H("div", { class: "lx-card" }, live), D.timeline);
    var x = document.getElementById("cf4-explain");
    if (x) {
      x.innerHTML = ""; x.classList.add("is-live");
      LX.Boundary(H("div", { class: "lx-xcard" }, x), D.boundary);
      if (data.f01_five_scales) LX.ScaleStrip(H("div", { class: "lx-xcard" }, x), { title: "The scale of this case", scales: data.f01_five_scales.scales, mark: D.scale.mark, markText: D.scale.markText });
    }
  });

  // the idea: one day at a generic existing plant that can sell power, make hydrogen or hold reserves
  LX.mount("cf4-idea", function (live, data, root) {
    css();
    var D = data[KEY], I = D.idea, P = data.path || null, S = at(I);
    var stage = H("div", { class: "lx-stage" }, live);
    H("h3", { text: I.title }, H("div", { class: "lx-stage-head" }, stage));
    H("p", { class: "lx-hint", text: I.note }, stage);
    var ctl = H("div", { class: "lx-ctls" }, stage);
    var c0 = H("div", { class: "cf-ctl" }, ctl); H("p", { class: "cf-ctl-l", id: "cf4-res-l", text: "Reserves" }, c0);
    var g0 = H("div", { class: "lx-seg", role: "group", "aria-labelledby": "cf4-res-l" }, c0), segs = [];
    I.reserveModes.forEach(function (m) { segs.push(H("button", { type: "button", text: m.label, onclick: function () { S.reserves = m.id === "on"; paint(true); } }, g0)); });
    var sliders = {};
    function reset() {
      var s0 = at(I);
      Object.keys(s0).forEach(function (k) { S[k] = s0[k]; });
      I.sliders.forEach(function (o) { sliders[o.key].set(S[o.key]); });
      paint(true);
    }
    I.sliders.forEach(function (o) {
      sliders[o.key] = LX.Slider(ctl, { label: o.label, min: o.min, max: o.max, step: o.step, value: S[o.key], color: o.color,
        fmt: function (v) { return (o.pre || "") + v.toFixed(o.dec) + (o.unit ? " " + o.unit : ""); }, onChange: function (v) { S[o.key] = v; paint(true); } });
    });
    H("button", { type: "button", class: "lx-btn ghost small cf4-reset", text: "Reset to the defaults", onclick: reset }, ctl);
    var scene = H("div", { class: "cf4-scene", role: "group", "aria-label": "The picked hour: where the plant's power goes" }, stage);
    var why = H("p", { class: "lx-hint", "aria-live": "polite" }, stage);
    var charts = H("div", { class: "cf4-charts" }, stage);
    var PP = LX.Plot(H("div", null, charts), { box: true }), PO = LX.Plot(H("div", null, charts), { box: true, text: "Text version: the day hour by hour" });
    H("p", { class: "lx-hint", text: "Tap or use the arrow keys on a chart to pick an hour." }, stage);
    var chips = H("div", { class: "lx-readouts", "aria-live": "polite" }, stage), led = H("div", null, stage);
    var status = H("div", { class: "lx-stage-status", "aria-live": "polite", style: "display:grid;gap:4px" }, stage);
    var as = H("details", { class: "lx-textalt" }, stage); H("summary", { text: "The toy's assumptions" }, as);
    var aul = H("ul", null, as); assumptions(I).forEach(function (t) { H("li", { html: LX.rich(t) }, aul); });
    if (P) H("p", { class: "lx-hint", html: "Where this goes next: " + LX.lessonRefHTML(P, "A1") + " turns a year of cash flows into a project's net present value; " + LX.lessonRefHTML(P, "M11") + " puts a wind-hydrogen plant's capital and lifetime cash flows inside an optimization model; " + LX.lessonRefHTML(P, "A12") + " compares the tools governments use to steer energy." }, stage);
    function chip(label, value) { var c = H("div", { class: "lx-readout" }, chips); H("span", { text: label }, c); H("b", { text: value }, c); }
    function part(cls, name, val, off) { var d = H("div", { class: "cf4-part p-" + cls + (off ? " is-off" : "") }, scene); H("b", { text: name }, d); H("div", { class: "v", text: val }, d); }
    function ticks() { return [0, 6, 12, 18, 24].map(function (h) { return [h, h === 24 ? "24:00" : hh(h)]; }); }
    function ticksN() { return [0, 12, 24].map(function (h) { return [h, h === 24 ? "24:00" : hh(h)]; }); }
    function pick(k) { S.hour = k; paint(true); }
    function paint(acted) {
      segs.forEach(function (b, i) { b.setAttribute("aria-pressed", String((I.reserveModes[i].id === "on") === S.reserves)); });
      sliders.reserve.disable(!S.reserves);
      var d = day(I, S), x = d.hours[S.hour];
      scene.innerHTML = "";
      H("p", { text: span(S.hour) + " · the plant makes " + mw(I.plantMW) }, scene);
      var sl = sceneLines(I, d, S.hour);
      part("grid", "To the grid", sl.grid);
      part("h2", "To the electrolyzer", sl.h2, !x.h);
      part("res", "Held as reserve", sl.res, !x.r);
      why.textContent = hourLine(I, d, S.hour);
      var top = Math.max(100, Math.ceil(d.priceMax / 25) * 25);
      PP.render({
        x: { min: 0, max: 24, ticks: ticks(), ticksN: ticksN() },
        y: { min: 0, max: top, step: top / 4, fmt: function (v) { return "$" + v; } },
        height: 150, heightN: 140, margin: { l: 44, r: 12, t: 18, b: 26 }, title: "Grid price, $ per MWh",
        lines: [{ pts: d.hours.map(function (h) { return [h.t, h.p]; }), step: 1, color: "var(--lx-ink)", width: 2.4, cap: "butt" }],
        refs: d.s.elz ? [{ y: d.value, color: "var(--lx-good)", dash: "5 4", width: 1.6 }] : [],
        legend: [{ label: "Grid price", color: "var(--lx-ink)" }].concat(d.s.elz ? [{ label: "A MWh " + valueWords(d) + ": " + per(d.value), color: "var(--lx-good)", dash: true }] : []),
        pick: { n: 24, sel: S.hour, onPick: pick },
        tip: function (xx) { var t = Math.min(23, Math.max(0, Math.floor(xx))); return "<div><b>" + span(t) + "</b></div><div><span>Grid price</span><b>" + per(d.hours[t].p) + " per MWh</b></div>"; },
        aria: "The grid price in each hour of the illustrative day, dollars per MWh" + (d.s.elz ? ", with what a MWh earns " + valueWords(d) + " as a dashed line" : "") + "."
      });
      var bars = [];
      d.hours.forEach(function (h) {
        var op = h.t === S.hour ? 1 : 0.78;
        bars.push({ x0: h.t + 0.1, x1: h.t + 0.9, y0: 0, y1: h.g, color: "var(--lx-accent)", op: op, rx: 1 });
        if (h.h) bars.push({ x0: h.t + 0.1, x1: h.t + 0.9, y0: h.g, y1: I.plantMW, color: "var(--lx-tier-5)", op: op, rx: 1 });
      });
      PO.render({
        x: { min: 0, max: 24, ticks: ticks(), ticksN: ticksN() },
        y: { min: 0, max: I.plantMW, step: I.plantMW / 4, fmt: function (v) { return int(v); } },
        height: 170, heightN: 150, margin: { l: 44, r: 12, t: 18, b: 26 }, title: "Where the plant's power goes, MW",
        bars: bars,
        legend: [{ label: "To the grid", color: "var(--lx-accent)" }, { label: "To the electrolyzer" + (S.reserves ? " (its load is the reserve held)" : ""), color: "var(--lx-tier-5)" }],
        pick: { n: 24, sel: S.hour, onPick: pick },
        tip: function (xx) { var t = Math.min(23, Math.max(0, Math.floor(xx))), h = d.hours[t]; return "<div><b>" + span(t) + "</b></div><div><span>To the grid</span><b>" + mw(h.g) + "</b></div><div><span>To the electrolyzer</span><b>" + mw(h.h) + "</b></div>"; },
        aria: "Where the plant's " + mw(I.plantMW) + " go in each hour: to the grid, and to the electrolyzer.",
        text: { head: HOURS_HEAD, rows: hourRows(d) }
      });
      chips.innerHTML = "";
      chip("Electrolyzer runs", d.s.elz ? d.runHours + " of 24 hours" : "none built");
      chip("Hydrogen made", int(d.kg) + " kg");
      chip("Range of output to the grid", gridRange(d));
      chip("Reserves", S.reserves ? pct(d.reserveShare) + " of revenue" : "off");
      led.innerHTML = "";
      LX.Ledger(led, { caption: LEDGER_CAPTION, columns: LEDGER.cols.slice(), rows: ledgerRows(d).map(function (r, i) { return { head: r[0], cells: r.slice(1), total: i === 4 }; }) });
      status.innerHTML = "";
      H("p", { html: changeLine(d).replace(/(\$[\d,]+ (better|worse)|no different)/, "<b>$1</b>") }, status);
      H("p", { class: "lx-hint", text: "The hydrogen price is fixed at one assumed value; every result here depends on it." }, status);
      if (acted) LX.store.set("cf4-idea", { level: S.level, reserve: S.reserve, elz: S.elz, reserves: S.reserves });
    }
    paint(false);
    LX.demo(root, function (state) {
      if (state === "mid") { S.level = 1.4; S.hour = 19; }
      else if (state === "off") { S.reserves = false; S.hour = 17; }
      else return null;
      sliders.level.set(S.level); paint(false);
      return { view: state };
    });
  });
})();
