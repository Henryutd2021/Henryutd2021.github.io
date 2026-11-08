/* weekstrip.js — LX.WeekStrip: a year's 52 calendar weeks in four rows of 13, each coloured by the representative week
   that stands for it, with a red dot on each week that has unserved demand in a full-year check, a key and a text
   version (a table). First used by lesson M3; M13 and C2 can reuse it. It reads the
   planning engine's objects (LX.townPlan, components/planengine.js, bundled before it):

     var ws = LX.WeekStrip(host, Y);        // Y: LX.townPlan.prepareYear(...); opts (optional): { year: 2025 }
     ws.draw(RW, null);                     // RW: LX.townPlan.selectWeeks(...): which representative week stands for each
     ws.draw(RW, check.byWeek);             //   calendar week; byWeek: MWh unserved in each calendar week, as
                                            //   LX.townPlan.readCheck() returns it (a week is marked above 0.05 MWh)
     // -> { el, draw }

   - Colours. A typical week takes its season's colour (winter, spring, summer, fall); a season's second and third
     typical weeks are mixed toward the ink colour. Extreme weeks (peak demand, peak net load, least wind, winter
     net-load peak) have their own colours and an outline. All colours are --lx-* tokens, so day and night both work.
   - Letters. W, Sp, Su, F (numbered when a season has several typical weeks), P, N, C, X: the colour is never the only cue.
   - Text. The grid is role="img" with a sentence that lists every representative week and how many weeks it stands for
     (and how many weeks are short); the key repeats the letters; "Text version" holds a table of all 52 weeks (the week's
     start date, the week standing in for it and, after a check, its unserved MWh).
   - Dates. The first hour of each calendar week, local standard time (LX.townPlan.weekStart); the rows start in
     January, April, July and October.
   Pure (Node: require("assets/learn/components/weekstrip.js"); also on LX.WeekStrip): NAMES, weekName(r), color(RW, k), letter(RW, k), number(RW, k),
   dateOf(Y, i), yearOf(Y), label(RW, byWeek), rows(Y, RW, byWeek) (the text version's rows), SHORT (0.05 MWh).
   Styles: weekstrip.css (lx-wks-*). Tests: _tests/learn/test_components_w2_plan.js. */
(function () {
  "use strict";
  var TP = typeof module !== "undefined" && module.exports && typeof require === "function" ? require("./planengine.js")
    : (typeof window !== "undefined" && window.LX && window.LX.townPlan);
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var SEASON = { winter: "var(--lx-hyd)", spring: "var(--lx-good)", summer: "var(--lx-warn)", fall: "var(--lx-pk)" };   // summer: amber, not solar yellow (a letter on yellow reads at 2:1)
  var XCOL = { peak: "var(--lx-bad)", netpeak: "var(--lx-tier-4)", calm: "var(--lx-ink-3)", winter: "var(--lx-tier-2)" };
  var XLET = { peak: "P", netpeak: "N", calm: "C", winter: "X" };
  var SLET = { winter: "W", spring: "Sp", summer: "Su", fall: "F" };
  var NAMES = { season: "Typical", peak: "Peak demand", netpeak: "Peak net load", calm: "Least wind", winter: "Winter net-load peak" };
  var SHORT = 0.05;   // MWh: a calendar week counts as short above this

  // ---------------------------------------------------------------- pure helpers
  function name(r) { return r.kind === "season" ? "Typical " + r.season : NAMES[r.kind]; }
  function sameSeason(RW, r) { return RW.reps.filter(function (q) { return q.kind === "season" && q.season === r.season; }); }
  function color(RW, k) {
    var r = RW.reps[k];
    if (r.kind !== "season") return XCOL[r.kind] || "var(--lx-ink-2)";
    var same = sameSeason(RW, r), j = same.indexOf(r);
    return j === 0 ? SEASON[r.season] : "color-mix(in srgb, " + SEASON[r.season] + " " + (100 - 28 * j) + "%, var(--lx-ink))";
  }
  function letter(RW, k) {
    var r = RW.reps[k];
    if (r.kind !== "season") return XLET[r.kind];
    var same = sameSeason(RW, r);
    return SLET[r.season] + (same.length > 1 ? same.indexOf(r) + 1 : "");
  }
  // the number after a typical week's name when its season has several ("Typical winter 2"), else ""
  function number(RW, k) {
    var r = RW.reps[k];
    return r.kind === "season" && sameSeason(RW, r).length > 1 ? " " + letter(RW, k).replace(/^\D+/, "") : "";
  }
  function dateOf(Y, i) { var d = TP.weekStart(Y, i); return d.getUTCDate() + " " + MON[d.getUTCMonth()]; }
  function yearOf(Y) { return new Date(TP.weekStart(Y, 26).getTime()).getUTCFullYear(); }   // the year of mid-year
  function isShort(byWeek, i) { return !!(byWeek && byWeek[i] > SHORT); }
  function mwh(v) { return Math.round(v).toLocaleString("en-US") + " MWh"; }
  function label(RW, byWeek, year) {
    var nShort = byWeek ? byWeek.filter(function (x) { return x > SHORT; }).length : 0;
    return "The 52 weeks of " + year + " in four rows of 13, each coloured by the representative week that stands for it: " +
      RW.reps.map(function (r) { return name(r) + " for " + r.n + (r.n === 1 ? " week" : " weeks"); }).join(", ") + "." +
      (byWeek ? " " + (nShort ? nShort + " weeks have unserved demand in the full-year check." : "No week has unserved demand in the full-year check.") : "");
  }
  // the text version: [{date, standsIn, unserved (text, or null without a check)}] for the 52 weeks
  function rows(Y, RW, byWeek) {
    var out = [];
    for (var i = 0; i < TP.WEEKS; i++) {
      var k = RW.chrono[i];
      out.push({ i: i, k: k, date: dateOf(Y, i), standsIn: name(RW.reps[k]) + number(RW, k), unserved: byWeek ? (isShort(byWeek, i) ? mwh(byWeek[i]) : "0") : null });
    }
    return out;
  }
  var api = { NAMES: NAMES, SHORT: SHORT, weekName: name, color: color, letter: letter, number: number, dateOf: dateOf, yearOf: yearOf, label: label, rows: rows };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window === "undefined" || !window.LX || !window.LX.H) return;

  // ---------------------------------------------------------------- the view
  var LX = window.LX, H = LX.H;
  function WeekStrip(host, Y, opts) {
    if (!TP) TP = LX.townPlan;
    if (!TP) throw new Error("WeekStrip: the planning engine (LX.townPlan, components/planengine.js) must load first");
    opts = opts || {};
    var year = opts.year || yearOf(Y);
    var box = H("div", { class: "lx-wks" }, host);
    var grid = H("div", { class: "lx-wks-grid", role: "img" }, box), keys = H("ul", { class: "lx-wks-keys", "aria-hidden": "true" }, box);
    var tv = H("details", { class: "lx-textalt" }, box); H("summary", { text: "Text version: the 52 weeks of " + year }, tv);
    var tvb = H("div", { class: "lx-wks-tbl" }, tv);
    function draw(RW, byWeek) {
      grid.innerHTML = ""; keys.innerHTML = "";
      for (var q = 0; q < 4; q++) {
        H("span", { class: "rl", text: dateOf(Y, q * 13) }, grid);
        for (var j = 0; j < 13; j++) {
          var i = q * 13 + j, k = RW.chrono[i], r = RW.reps[k];
          H("span", { class: "lx-wks-cell" + (r.kind !== "season" ? " x" : "") + (isShort(byWeek, i) ? " short" : ""), style: "--c:" + color(RW, k), text: letter(RW, k) }, grid);
        }
      }
      RW.reps.forEach(function (r, k) {
        var li = H("li", null, keys); H("i", { style: "--c:" + color(RW, k) }, li);
        H("span", { text: letter(RW, k) + " " + name(r).replace("Typical ", "") + " ×" + r.n }, li);
      });
      if (byWeek) { var li = H("li", null, keys); H("i", { class: "dot" }, li); H("span", { text: "demand unserved that week" }, li); }
      grid.setAttribute("aria-label", label(RW, byWeek, year));
      tvb.innerHTML = "<table><thead><tr><th scope='col'>Week starting</th><th scope='col'>Stands in</th>" + (byWeek ? "<th scope='col'>Unserved, full year</th>" : "") + "</tr></thead><tbody>" +
        rows(Y, RW, byWeek).map(function (x) { return "<tr><td>" + x.date + "</td><td>" + LX.esc(x.standsIn) + "</td>" + (byWeek ? "<td>" + x.unserved + "</td>" : "") + "</tr>"; }).join("") + "</tbody></table>";
    }
    return { el: box, draw: draw };
  }
  for (var k in api) WeekStrip[k] = api[k];   // (no key may be a function's own read-only property, such as name)
  LX.WeekStrip = WeekStrip;
})();
