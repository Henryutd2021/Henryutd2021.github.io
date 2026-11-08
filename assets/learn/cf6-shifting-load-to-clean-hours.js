// cf6-shifting-load-to-clean-hours.js — Case file CF6, "How much can shifting load to cleaner hours cut emissions, and
// when?" (case form).
//
// Data: assets/learn/data/cf6-shifting-load-to-clean-hours.json (the study's dated steps for LX.Timeline, where its
// result holds for LX.Boundary, the idea's day and preset moves, the numbers to remember), town.json (Prairie Town's
// fleet; illustrative) and town_year.json (every hour of 2025 on the Southwest Power Pool grid, from EIA-930, as shapes).
// The research text in the data file is approved excerpt wording (E6, with its
// revisions); this script adds none of its own.
//
// The idea (Prairie Town; illustrative plants on real 2025 shapes): average against marginal emission factors.
// The day is 9 June 2025, cut and scaled exactly as lesson 9 does (demand = shape x 450 MW, wind = shape x 150 MW,
// sun = shape x 200 MW, each rounded to whole MW; hour t runs from t:00 to t+1:00). Each hour is dispatched cheapest
// first (lesson 9's rule, no ramp limits and no minimum output): the flat 100 MW plant, wind and sun; the gap
// g = demand - 100 - wind - sun; g < 0 is spilled wind and sun; otherwise the combined-cycle plant (up to 150 MW,
// 0.37 t CO2/MWh), then the peaker (up to 100 MW, 0.55 t CO2/MWh).
//   average factor of hour t   a_t = CO2_t / demand_t        (t CO2 per MWh: the hour's emissions shared over its use)
//   marginal factor of hour t  m_t = CO2 rate of the plant that would serve one more MWh, read off the hour's dispatch
//                              (0 while wind or sun is spilled): it holds for the next small change only
// Moving q MWh from hour a to hour b (total use unchanged):
//   average-factor accounting:  q x (a_b - a_a)               (the study's view: each hour keeps its average factor)
//   what the plants emit:       re-dispatch both hours with demand_a - q and demand_b + q and compare the CO2
// The two agree only by chance. A 10 MWh move can cross from one plant to the next (22:00 to 14:00: 4 MWh off the peaker,
// 6 MWh off the combined-cycle plant), so the readout re-dispatches rather than multiplying by m_t. Every number on the page is checked by _tests/learn/test_cf6-shifting-load-to-clean-hours.js.
(function () {
  "use strict";
  var HOURS = 24;

  // ---------------------------------------------------------------- pure model (no DOM; exported for Node)
  function prepare(town, year, day) {
    var f = town.fleet, t0 = Date.parse(year.start_utc + "Z"), d0 = Date.parse(day.date + "T00:00:00Z");
    var i = Math.round((d0 - t0) / 3600000) + 1 - day.utcOffsetHours;
    if (i < 0 || i + HOURS > year.demand.length) throw new Error("date " + day.date + " is outside the year file");
    var W = { fleet: f, date: day.date, dateLabel: day.dateLabel, demand: [], wind: [], solar: [], gap: [], h: [], avg: [], marg: [], margKey: [] };
    for (var t = 0; t < HOURS; t++) {
      var dm = Math.round(year.demand[i + t] / 1000 * day.demandPeakMW), w = Math.round(year.wind[i + t] / 1000 * f.wind.mw), s = Math.round(year.solar[i + t] / 1000 * f.solar.mw);
      var g = dm - f.nuclear.mw - w - s, x = hour(f, g);
      W.demand.push(dm); W.wind.push(w); W.solar.push(s); W.gap.push(g); W.h.push(x);
      W.avg.push(x.co2 / dm);
      var k = x.sp > 0 ? "spill" : x.cc < f.cc.mw ? "cc" : x.pk < f.peaker.mw ? "pk" : "short";
      W.margKey.push(k); W.marg.push(k === "spill" ? 0 : k === "cc" ? f.cc.co2 : f.peaker.co2);
    }
    return W;
  }
  // one hour dispatched cheapest first for a gas need g (MW); negative g is spilled wind and sun
  function hour(f, g) {
    var need = Math.max(0, g), cc = Math.min(f.cc.mw, need), pk = Math.min(f.peaker.mw, need - cc), un = need - cc - pk;
    return { cc: cc, pk: pk, un: un, sp: Math.max(0, -g), co2: f.cc.co2 * cc + f.peaker.co2 * pk };
  }
  // move q MWh of use from hour a to hour b
  function move(W, a, b, q) {
    var f = W.fleet, A0 = W.h[a], B0 = W.h[b];
    var attributed = q * (W.avg[b] - W.avg[a]);
    if (a === b) return { a: a, b: b, q: q, attributed: 0, system: 0, same: true, out: null, into: null };
    var A1 = hour(f, W.gap[a] - q), B1 = hour(f, W.gap[b] + q);
    var system = (A1.co2 - A0.co2) + (B1.co2 - B0.co2);
    return { a: a, b: b, q: q, attributed: attributed, system: system,
             out: { pk: A0.pk - A1.pk, cc: A0.cc - A1.cc, sp: A1.sp - A0.sp },    // what stops in hour a
             into: { sp: B0.sp - B1.sp, cc: B1.cc - B0.cc, pk: B1.pk - B0.pk } }; // what serves the moved use in hour b
  }
  function hm(t) { return (t < 10 ? "0" : "") + t + ":00"; }
  function span(t) { return hm(t) + "–" + hm(t + 1); }
  function f2(v) { return (Math.abs(v) < 0.005 ? 0 : v).toFixed(2); }
  function tco2(v) { var r = Math.round(v * 10) / 10; return (r < 0 ? "−" : r > 0 ? "+" : "") + Math.abs(r).toFixed(1) + " t"; }
  var PLANT = { spill: "spilled wind and sun", cc: "the combined-cycle plant", pk: "the peaker", short: "unserved demand" };
  // the plants that change, in words: "the peaker 10 MWh less" / "10 MWh of spilled sun and wind used"
  function changes(r) {
    var o = [], i = [];
    if (r.out.pk > 1e-9) o.push("the peaker runs " + r.out.pk + " MWh less");
    if (r.out.cc > 1e-9) o.push("the combined-cycle plant runs " + r.out.cc + " MWh less");
    if (r.out.sp > 1e-9) o.push(r.out.sp + " MWh more wind and sun are spilled");
    if (r.into.sp > 1e-9) i.push(r.into.sp + " MWh of otherwise spilled wind and sun");
    if (r.into.cc > 1e-9) i.push(r.into.cc + " MWh more from the combined-cycle plant");
    if (r.into.pk > 1e-9) i.push(r.into.pk + " MWh more from the peaker");
    return { out: o.join(" and "), into: i.join(" and ") };
  }
  // the no-JS version: the preset moves and the day's hours as a table
  function staticIdea(W, I) {
    var li = I.presets.map(function (p) {
      var r = move(W, p.from, p.to, I.q);
      return "<li><b>" + p.label + "</b> (" + span(p.from) + " to " + span(p.to) + "): change in attributed emissions " + tco2(r.attributed) + "; change in what the plants emit " + tco2(r.system) + ".</li>";
    }).join("");
    var rows = W.demand.map(function (d, t) {
      return "<tr><td>" + span(t) + "</td><td class=\"n\">" + d + "</td><td class=\"n\">" + (W.h[t].cc + W.h[t].pk) + "</td><td class=\"n\">" + f2(W.avg[t]) + "</td><td>" + PLANT[W.margKey[t]] + " (" + f2(W.marg[t]) + ")</td></tr>";
    }).join("");
    return "<p class=\"lx-eyebrow\">" + I.title + " (Prairie Town, " + W.dateLabel + ", illustrative)</p>" +
      "<p class=\"lx-hint\">" + I.how[0] + "</p>" + I.terms.map(function (t) { return "<p class=\"lx-hint\">" + rich(t) + "</p>"; }).join("") + "<ul>" + li + "</ul>" +
      "<div class=\"lx-scroll-x\"><table class=\"lx-facts\"><caption class=\"lx-hint\">Each hour: demand (MWh), gas output (MWh), average factor and the plant on the margin with its factor (t CO₂ per MWh).</caption>" +
      "<thead><tr><th scope=\"col\">Hour</th><th scope=\"col\">Demand</th><th scope=\"col\">Gas</th><th scope=\"col\">Average</th><th scope=\"col\">On the margin</th></tr></thead><tbody>" + rows + "</tbody></table></div>";
  }
  // the live status, one idea per line: what changes in the hour left, in the hour joined, then how the two views compare
  function statusLines(r) {
    if (r.same) return ["Pick two different hours."];
    var c = changes(r), sys = Math.round(r.system * 10), att = Math.round(r.attributed * 10);
    var out = "Out of " + span(r.a) + ": " + (c.out || "nothing changes") + ".", into = "Into " + span(r.b) + ": " + c.into + ".";
    // compared unrounded: two changes that round alike are not called equal
    var agree = Math.abs(r.system - r.attributed) < 1e-6;
    var two = agree ? "<b>Here the two views agree.</b>"
      : Math.abs(r.system) < 1e-9 ? "<b>The average books a change the plants never make.</b>"
      : "<b>The plants' change is " + (Math.abs(r.system) > Math.abs(r.attributed) ? "larger" : "smaller") + " than the average says.</b>";
    if (!agree && sys === att) two += " Both round to " + tco2(r.system) + " here.";
    return [out, into, two];
  }
  // the allow-listed explainer's starting state as a table (its stylized day; m = the explainer's model() result)
  function staticExplainer(m, range, swing) {
    var rows = m.load.map(function (d, t) {
      var y = m.adjust[t];
      return "<tr><td>" + span(t) + "</td><td class=\"n\">" + m.intensity[t] + "</td><td class=\"n\">" + d.toFixed(1) + "</td><td class=\"n\">" + m.shifted[t].toFixed(1) +
        "</td><td class=\"n\">" + (y > 0 ? "+" : y < 0 ? "−" : "") + Math.abs(y).toFixed(1) + "</td></tr>";
    }).join("");
    return "<p class=\"lx-hint\">At ±" + Math.round(range * 100) + "% on the " + swing + "-swing day, " + m.moved.toFixed(1) + " MWh of " + Math.round(m.total).toLocaleString("en-US") +
      " MWh moves (" + m.movedPct.toFixed(1) + "%) and attributed emissions fall by " + m.reductionPct.toFixed(2) + "%; the day's total stays " + Math.round(m.newTotal).toLocaleString("en-US") + " MWh.</p>" +
      "<div class=\"lx-scroll-x\"><table class=\"lx-facts\"><caption class=\"lx-hint\">Each hour of the stylized day: average intensity (g CO₂ per kWh), load before and after (MWh) and the change.</caption>" +
      "<thead><tr><th scope=\"col\">Hour</th><th scope=\"col\">Intensity</th><th scope=\"col\">Before</th><th scope=\"col\">After</th><th scope=\"col\">Change</th></tr></thead><tbody>" + rows + "</tbody></table></div>";
  }
  // the explainer's own text version, live: its "explainer-update" event (d = {range, grid, model}) rewrites
  // the table in the page's text version (details.lx-textalt > .cf6-ex-table) and its summary; nothing is announced
  var LIVE_SUMMARY = "Text version: the day hour by hour, at the slider's setting";
  function liveTable(details, d) {
    var box = details && details.querySelector(".cf6-ex-table"), sum = details && details.querySelector("summary");
    if (!box || !d || !d.model) return false;
    box.innerHTML = staticExplainer(d.model, d.range, d.grid);
    if (sum && sum.textContent !== LIVE_SUMMARY) sum.textContent = LIVE_SUMMARY;
    return true;
  }
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
  var model = { HOURS: HOURS, prepare: prepare, hour: hour, move: move, changes: changes, hm: hm, span: span, f2: f2, tco2: tco2, PLANT: PLANT,
                statusLines: statusLines, staticExplainer: staticExplainer, staticIdea: staticIdea, staticBoundary: staticBoundary,
                liveTable: liveTable, LIVE_SUMMARY: LIVE_SUMMARY };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H, KEY = "cf6_shifting_load_to_clean_hours";

  LX.mount("cf6", function (live, data) {
    var D = data[KEY];
    LX.Timeline(H("div", { class: "lx-card" }, live), D.timeline);
    var x = document.getElementById("cf6-explain");
    if (x) { x.innerHTML = ""; x.classList.add("is-live"); LX.Boundary(H("div", { class: "lx-xcard" }, x), D.boundary); }
    // the explainer's text version follows its slider and toggle (the no-JS block shows its starting day)
    var ex = document.querySelector('.explainer[data-explainer="ghg"]'), alt = ex && ex.parentNode.querySelector("details.lx-textalt");
    if (ex && alt) ex.addEventListener("explainer-update", function (e) { liveTable(alt, e.detail); });
  });

  LX.mount("cf6-idea", function (live, data, root) {
    var D = data[KEY], I = D.idea, W = prepare(data.town, data.town_year, I.day), q = I.q;
    var pre = I.presets.filter(function (p) { return p.id === I.start; })[0] || I.presets[0];
    var S = { a: pre.from, b: pre.to, preset: pre.id };
    var saved = LX.store.get("cf6-idea");
    if (saved && saved.a >= 0 && saved.a < HOURS && saved.b >= 0 && saved.b < HOURS) { S.a = saved.a; S.b = saved.b; S.preset = saved.preset || null; }

    var stage = H("div", { class: "lx-stage" }, live);
    H("h3", { text: I.title + " · " + W.dateLabel }, H("div", { class: "lx-stage-head" }, stage));
    H("p", { class: "lx-hint", text: I.note }, stage);
    I.how.slice(1).forEach(function (t) { H("p", { class: "lx-hint", text: t }, stage); });
    I.terms.forEach(function (t) { H("p", { class: "lx-hint", html: LX.rich(t) }, stage); });
    var ctl = H("div", { class: "lx-ctls" }, stage);
    var pc = H("div", { class: "cf-ctl" }, ctl);
    H("p", { class: "cf-ctl-l", id: "cf6-pre-l", text: "Try a move" }, pc);
    var seg = H("div", { class: "lx-seg", role: "group", "aria-labelledby": "cf6-pre-l" }, pc);
    var pbtn = I.presets.map(function (p) {
      var b = H("button", { type: "button", text: p.label }, seg);
      b.addEventListener("click", function () { S.a = p.from; S.b = p.to; S.preset = p.id; paint(true); });
      return b;
    });
    var sc = H("div", { class: "cf-ctl cf-selects" }, ctl);
    function select(id, label, key) {
      var w = H("div", { class: "cf-sel" }, sc);
      H("label", { for: id, class: "cf-ctl-l", text: label }, w);
      var s = H("select", { id: id }, w);
      for (var t = 0; t < HOURS; t++) H("option", { value: String(t), text: span(t) + " · " + (W.margKey[t] === "spill" ? "spare wind and sun" : W.margKey[t] === "cc" ? "combined-cycle on the margin" : "peaker on the margin") }, s);
      s.addEventListener("change", function () { S[key] = +s.value; S.preset = null; paint(true); });
      return s;
    }
    var selA = select("cf6-from", "Move 10 MWh out of", "a"), selB = select("cf6-to", "into", "b");
    var chips = H("div", { class: "lx-readouts" }, stage);
    H("p", { class: "lx-hint", text: I.how[0] }, stage);
    var P = LX.Plot(stage, { text: "Text version of the chart" });
    // one idea per line, read out together when the state changes
    var status = H("div", { class: "lx-stage-status", "aria-live": "polite", style: "display:grid;gap:4px" }, stage);

    function chip(label, value, cls) { var c = H("div", { class: "lx-readout" + (cls ? " " + cls : "") }, chips); H("span", { text: label }, c); H("b", { text: value }, c); }
    function tone(v) { return v < -0.05 ? "good" : v > 0.05 ? "bad" : null; }
    function paint(acted) {
      var r = move(W, S.a, S.b, q);
      pbtn.forEach(function (b, i) { b.setAttribute("aria-pressed", String(I.presets[i].id === S.preset)); });
      if (selA.value !== String(S.a)) selA.value = String(S.a);
      if (selB.value !== String(S.b)) selB.value = String(S.b);
      chips.innerHTML = "";
      chip("Change in attributed emissions (average factor)", tco2(r.attributed), tone(r.attributed));
      chip("Change in what the plants emit", tco2(r.system), tone(r.system));
      var spill = [], t;
      for (t = 0; t < HOURS; t++) if (W.margKey[t] === "spill") spill.push(t);
      P.render({
        x: { min: 0, max: 24, ticks: [[0, "00:00"], [6, "06:00"], [12, "12:00"], [18, "18:00"], [24, "24:00"]], ticksN: [[0, "0"], [6, "6"], [12, "12"], [18, "18"], [24, "24 h"]] },
        y: { min: 0, max: 0.6, step: 0.1, fmt: function (v) { return v.toFixed(1); }, unit: "t CO₂ per MWh" },
        height: 250, heightN: 220,
        spans: spill.length ? [{ x0: spill[0], x1: spill[spill.length - 1] + 1, color: "var(--lx-solar)", op: 0.14, label: "Spare wind and sun" }] : [],
        lines: [{ values: W.marg, step: 1, color: "var(--lx-warn)", width: 2.2, dash: "6 4" }, { values: W.avg, step: 1, color: "var(--lx-accent)", width: 2.6 }],
        marks: [{ x: S.a + 0.5, y: W.marg[S.a], label: "Out", kind: "dot", pos: "above", vline: true }, { x: S.b + 0.5, y: W.marg[S.b], label: "In", kind: "dot", pos: "above", vline: true }],
        legend: [{ label: "Average factor (the hour's CO₂ ÷ its use)", color: "var(--lx-accent)" }, { label: "Marginal factor (the plant serving one more MWh)", color: "var(--lx-warn)", dash: "6 4" }],
        aria: "Prairie Town on " + W.dateLabel + ": the average and the marginal CO₂ factor in each hour. Out: " + span(S.a) + ". In: " + span(S.b) + ".",
        text: { head: ["Hour", "Average, t/MWh", "Marginal, t/MWh", "On the margin"],
                rows: W.avg.map(function (v, t) { return [span(t), f2(v), f2(W.marg[t]), PLANT[W.margKey[t]]]; }) }
      });
      status.innerHTML = statusLines(r).map(function (t) { return "<p>" + t + "</p>"; }).join("");
      if (acted) LX.store.set("cf6-idea", { a: S.a, b: S.b, preset: S.preset });
    }
    paint(false);
    // demo states (core.js LX.demo): "mid" = the second preset (dawn to small hours); "eve-morning" = the third
    LX.demo(root, function (state) {
      var p = state === "mid" ? I.presets[1] : I.presets.filter(function (x) { return x.id === state; })[0];
      if (!p) return null;
      S.a = p.from; S.b = p.to; S.preset = p.id; paint(false);
      return { view: p.label };
    });
  });
})();
