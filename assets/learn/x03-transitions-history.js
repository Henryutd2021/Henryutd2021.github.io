// x03-transitions-history.js — Lesson X3, "How fast have energy transitions happened before?" (side-topic shelf, step
// cards, Foundations, D1, no model; wave W6, builder learn-w6-x, 2026-11-07).
//
// Data: data/x03-transitions-history.json (U.S. adoption curves as shares over time, each point transcribed from a dated
// primary source: the Census Bureau's Historical Statistics and housing tables, EIA's Electric Power Annual; the
// timeline, the sort, the debate, the stop box, facts and sources) and data/path.json (lesson links that appear once a
// lesson is live).
//
// No model beyond reading the points:
//   solar        share = estimated total solar ÷ (utility-scale total + small-scale PV), EIA Table 3.1.A (our arithmetic)
//   bracket      the first published point at or above a level, and the point before it: "between 1945 and 1950";
//                the page never interpolates a year between two published points
//   passes       the first published year in which one curve is at or above another, and the year before it
//   mostCommon   the main heating fuel with the largest share in a census year, gas and coal from the curves, the
//                other fuels from the same national rows (heatOthers)
// Diffusion only (curriculum §4.4): no cost curve of any technology, no forecast of future speed.
// Every number on the page comes from the data file; _tests/learn/test_x03-transitions-history.js checks them.
//
// Shared components: LX.StepCards, LX.Guess, LX.Plot, LX.Toggle, LX.CardSort, LX.Timeline, LX.Steelman,
// LX.lessonRefHTML, LX.demo. Lesson-local: the curve viewer (toggles and a zoom over LX.Plot). The "where we stop" box is
// static HTML written by the test (the shelf's shared e-stop box: xs- markup, styles in components/explain.css).
(function () {
  "use strict";
  var KEY = "x03_transitions_history";

  // ---------------------------------------------------------------- pure (no DOM; exported for Node)
  function fmtN(v, d) { return Number(v).toLocaleString("en-US", { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
  function pct(v, d) { return fmtN(v, d == null ? 1 : d) + "%"; }
  function byKey(D, k) { return D.series.filter(function (s) { return s.key === k; })[0]; }
  function solarPts(D) {   // [[year, share in %]] from EIA's table
    return D.solarRaw.rows.map(function (r) { return [r[0], 100 * r[3] / (r[1] + r[2])]; });
  }
  function pts(D, k) { return k === "solar" ? solarPts(D) : byKey(D, k).pts; }
  function at(D, k, year) { var p = pts(D, k).filter(function (q) { return q[0] === year; })[0]; return p ? p[1] : null; }
  function first(D, k) { return pts(D, k)[0]; }
  function last(D, k) { var p = pts(D, k); return p[p.length - 1]; }
  // the first published point at or above `level`, and the one before it (null when the curve starts above it)
  function bracket(D, k, level) {
    var p = pts(D, k);
    for (var i = 0; i < p.length; i++) if (p[i][1] >= level) return i === 0 ? null : { before: p[i - 1], after: p[i] };
    return null;
  }
  // the first published year in which curve a is at or above curve b, and the shared year before it
  function passes(D, a, b) {
    var pa = pts(D, a), yrs = pa.map(function (q) { return q[0]; }).filter(function (y) { return at(D, b, y) != null; });
    for (var i = 1; i < yrs.length; i++) if (at(D, a, yrs[i]) >= at(D, b, yrs[i]) && at(D, a, yrs[i - 1]) < at(D, b, yrs[i - 1])) return { before: yrs[i - 1], after: yrs[i] };
    return null;
  }
  // step 1: years from 1907 to the 90% bracket; the answer is the tick nearest its middle
  function nineTenths(D) {
    var b = bracket(D, "elec", 90), y0 = first(D, "elec")[0];
    return { b: b, lo: b.before[0] - y0, hi: b.after[0] - y0, mid: (b.before[0] + b.after[0]) / 2 - y0 };
  }
  function guessAnswer(D) {
    var m = nineTenths(D).mid, k = 0;
    D.guess.years.forEach(function (y, i) { if (Math.abs(y - m) < Math.abs(D.guess.years[k] - m)) k = i; });
    return k;
  }
  function halfGap(D) {   // town homes and farms: their 50% brackets
    var t = bracket(D, "nonfarm", 50), f = bracket(D, "farm", 50);
    return { town: t, farm: f, gap: f.before[0] - t.before[0] };
  }
  function mostCommon(D, year) {   // the largest main heating fuel in a census year
    var o = D.heatOthers.rows[String(year)], all = { gas: at(D, "gas", year), coal: at(D, "coal", year) };
    Object.keys(o).forEach(function (k) { if (k !== "none") all[k] = o[k]; });
    return Object.keys(all).sort(function (a, b) { return all[b] - all[a]; })[0];
  }
  // "What is counted" under the chart, for the curves shown (also a column of the text version)
  function counted(D, keys) { return D.series.filter(function (s) { return keys.indexOf(s.key) >= 0; }).map(function (s) { return { key: s.key, short: s.short, measure: s.measure }; }); }

  // ---------------------------------------------------------------- the words the page shows (pure, tested)
  var STEPS = [
    "In 1907, 8% of U.S. homes had electric service. Guess how many years it took until 90% of homes had it, then see its [[diffusion-curve|diffusion curve]].",
    "Homes in towns and homes on farms did not move together. Switch on both curves: when did each pass half of its homes?",
    "Now heating. Switch on the homes heated mainly with coal and those heated mainly with piped gas: when did gas overtake coal?",
    "The household series on car ownership starts only in 1948. Switch its curve on, then compare it with the cars registered decades earlier.",
    "Solar's share of U.S. electricity, 2015 to 2025. Switch it on, then zoom in to 0 to 10% to read it.",
    "What sped a curve up, and what held one back? Sort each reason from this lesson into its box, then check."
  ];
  function guessLine(D, g) {
    var N = nineTenths(D), b = N.b, ok = g === guessAnswer(D);
    return (ok ? "Yes: " : "Not quite: ") + "**about " + fmtN(D.guess.years[guessAnswer(D)]) + " years**. Homes with electric service passed 90% between " +
      b.before[0] + " (" + pct(b.before[1]) + ") and " + b.after[0] + " (" + pct(b.after[1]) + ").";
  }
  var GUESS_SAW = "From 8% of homes in 1907, electric service took roughly four more decades to pass 90%.";
  function farmLine(D) {
    var H = halfGap(D);
    return "Town and other non-farm homes passed half between " + H.town.before[0] + " and " + H.town.after[0] + "; farm homes between " +
      H.farm.before[0] + " and " + H.farm.after[0] + ", about " + fmtN(H.gap) + " years later.";
  }
  var FARM_SAW = "EIA's timeline credits rural electrification, the aim of a 1936 Act: almost half of farms had power by 1942, against 11% in 1932.";
  function heatLine(D) {
    var p = passes(D, "gas", "coal");
    return "Coal heated " + pct(at(D, "coal", 1940)) + " of homes in 1940 and " + pct(at(D, "coal", 1970)) + " in 1970; gas rose from " + pct(at(D, "gas", 1940)) + " (with bottled gas) to " + pct(at(D, "gas", 1970)) +
      ". Gas overtook coal as the most common main heating fuel between the " + p.before + " and " + p.after + " censuses.";
  }
  var HEAT_NOTE = "Other fuels, such as heating oil, changed too; these census snapshots do not track homes switching from one fuel to another.";
  var HEAT_SAW = "EIA reported in March 2024 that about half of the long-distance gas pipeline network was built in the 1950s and 1960s.";
  function carLine(D) {
    var R = D.registrations, a = first(D, "cars"), z = last(D, "cars");
    return "Families owning a car: " + pct(a[1], 0) + " in " + a[0] + ", " + pct(z[1], 0) + " in " + z[0] + ". Registered cars rose from " + fmtN(R.y1910 / 1000, 2) + " million in 1910 to " + fmtN(R.y1930 / 1000, 1) + " million in 1930.";
  }
  var CAR_SAW = "Most of the car's early spread came before the survey began, so this curve has no start: a gap in the data, not in history.";
  function solarLine(D) {
    var a = first(D, "solar"), z = last(D, "solar");
    return "Solar made " + pct(a[1]) + " of U.S. electricity in " + a[0] + " and " + pct(z[1]) + " in " + z[0] + ", counting rooftop panels (our arithmetic on EIA's table).";
  }
  var SOLAR_SAW = "The chart stops at 2025: these curves show how fast past changes moved, not how fast the next one will.";
  var SORT_NOTE = "Each reason comes from this lesson's sources; open the reasons after you check.";
  var EXPLAIN_LEDE = "Each is a [[diffusion-curve|diffusion curve]]: a share of its own whole (homes, families or electricity) over time. Switch them on and off.";

  // ---------------------------------------------------------------- the chart spec (pure)
  var X = { min: 1900, max: 2025, ticks: [[1900, "1900", "start"], [1925, "1925"], [1950, "1950"], [1975, "1975"], [2000, "2000"], [2025, "2025", "end"]], ticksN: [[1900, "1900", "start"], [1950, "1950"], [2025, "2025", "end"]] };
  var XZ = { min: 2014, max: 2025, ticks: [[2015, "2015"], [2020, "2020"], [2025, "2025", "end"]], ticksN: [[2015, "2015"], [2020, "2020"], [2025, "2025", "end"]] };   // the zoom: 2014 to 2025
  function spec(D, keys, zoom, aria) {
    var Y = zoom ? { min: 0, max: 10, step: 2, fmt: function (v) { return v + "%"; }, unit: "% share" } : { min: 0, max: 100, step: 25, fmt: function (v) { return v + "%"; }, unit: "% share" };
    var on = D.series.filter(function (s) { return keys.indexOf(s.key) >= 0; });
    return {
      x: zoom ? XZ : X, y: Y, height: 270, heightN: 230,
      lines: on.map(function (s) { return { pts: pts(D, s.key), color: s.color, dash: s.dash || null, dots: true, width: 2.4 }; }),
      legend: on.map(function (s) { return { label: s.short, color: s.color, dash: s.dash || null }; }),
      aria: aria || "Shares over time: " + on.map(function (s) { return s.short; }).join(", "),
      text: { head: ["Curve", "Points (year: share)", "What is counted", "Source"], rows: on.map(function (s) { return [s.label, pts(D, s.key).map(function (q) { return q[0] + ": " + pct(q[1]); }).join("; "), s.measure, D.sources[s.src].short + ", " + s.where]; }) }
    };
  }

  // ---------------------------------------------------------------- the no-JS block, ideas, check, facts, sources
  function esc(t) { return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function staticFallback(D) {
    return "<p class=\"lx-eyebrow\">U.S. adoption curves, as shares over time (each from a dated source)</p>" +
      "<div class=\"lx-scroll-x\"><table class=\"lx-mini-table x3-fbt\"><thead><tr><th scope=\"col\">Curve</th><th scope=\"col\">First point</th><th scope=\"col\">Last point</th><th scope=\"col\">Source</th></tr></thead><tbody>" +
      D.series.map(function (s) { var a = first(D, s.key), z = last(D, s.key); return "<tr><td>" + esc(s.label) + "</td><td>" + pct(a[1]) + " in " + a[0] + "</td><td>" + pct(z[1]) + " in " + z[0] + "</td><td>" + esc(D.sources[s.src].short) + "</td></tr>"; }).join("") +
      "</tbody></table></div>" + pointsHTML(D) + "<ul>" + [farmLine(D), heatLine(D), HEAT_NOTE, carLine(D), solarLine(D)].map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>" +
      "<p class=\"lx-hint\">With JavaScript on, you guess, switch the curves on one by one, zoom into solar's share and sort what sped each change up.</p>";
  }
  // every plotted point, with what each curve counts (the chart's text version, open on request; no-JS block)
  function pointsHTML(D) {
    var sp = spec(D, D.series.map(function (s) { return s.key; }), false);
    return "<details class=\"lx-textalt\"><summary>Every plotted point, with what each curve counts</summary><div class=\"lx-scroll-x\"><table class=\"lx-mini-table x3-fbt x3-fbt-all\"><thead><tr>" +
      sp.text.head.map(function (h) { return "<th scope=\"col\">" + esc(h) + "</th>"; }).join("") + "</tr></thead><tbody>" +
      sp.text.rows.map(function (r) { return "<tr>" + r.map(function (c) { return "<td>" + esc(c) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div></details>";
  }
  function ideasHTML(D) {
    var N = nineTenths(D), H = halfGap(D);
    return "<dl class=\"lx-ideas\">" +
      "<dt>Decades, not years</dt><dd>On its <span class=\"lx-term\" data-term=\"diffusion-curve\">diffusion curve</span>, electric service went from " + pct(first(D, "elec")[1], 0) + " of U.S. homes in " + first(D, "elec")[0] + " to over 90% between " + N.b.before[0] + " and " + N.b.after[0] + ".</dd>" +
      "<dt>Not everywhere at once</dt><dd>Farms passed half about " + fmtN(H.gap) + " years after town homes; wires had to reach them first.</dd>" +
      "<dt>Gas overtook coal</dt><dd>Piped gas overtook coal as the most common main heating fuel between the 1950 and 1960 censuses. Other fuels changed too; the snapshots do not track homes switching.</dd>" +
      "<dt>What sped it</dt><dd>Networks built, public programmes and a cheaper or better service sped curves up; refining a new source until it could compete took decades.</dd>" +
      "<dt>Say what you measure</dt><dd>A device in homes, a fuel's share of a nation and a share of electricity move at different speeds.</dd></dl>";
  }
  function checkHTML(D) {
    var H = halfGap(D);
    var q = function (id, ans, text, a) { return "<div class=\"lx-qq\" data-id=\"" + id + "\" data-answer=\"" + ans + "\"><p class=\"lx-qtext\">Myth or fact? “" + text + "”</p><ul class=\"lx-choices\"><li data-value=\"myth\">Myth</li><li data-value=\"fact\">Fact</li></ul><details class=\"lx-answer\"><summary>Answer</summary><p>" + a + "</p></details></div>"; };
    return "<div class=\"lx-myths\" data-quiz=\"x03-myth\">" +
      q("together", "myth", "Farm homes and town homes passed half with electric service at about the same time.", "Myth. Town and other non-farm homes passed half between " + H.town.before[0] + " and " + H.town.after[0] + "; farm homes only between " + H.farm.before[0] + " and " + H.farm.after[0] + ", about " + fmtN(H.gap) + " years later (Census Bureau).") +
      q("oil1950", "fact", "Petroleum has been the largest source of U.S. energy since 1950.", "Fact. Petroleum passed coal in 1950; coal had passed wood around 1885 (EIA, 2026).") +
      "</div>";
  }
  function factsHTML(D) {
    return "<table class=\"lx-facts\"><thead><tr><th scope=\"col\">Number</th><th scope=\"col\">What it means</th><th scope=\"col\">Source</th></tr></thead><tbody>" +
      D.facts.map(function (f) { var s = D.sources[f.src]; return "<tr><td class=\"n\">" + esc(f.n) + "</td><td>" + esc(f.what) + "</td><td class=\"s\"><a href=\"" + esc(s.url) + "\">" + esc(s.short) + "</a> · " + esc(s.date.split(";")[0]) + "</td></tr>"; }).join("") + "</tbody></table>";
  }
  function sourcesHTML(D) {
    var cap = function (x) { return x.charAt(0).toUpperCase() + x.slice(1); };
    return "<ul>" + Object.keys(D.sources).map(function (k) { var s = D.sources[k];
      return "<li>" + esc(s.publisher) + ". <a href=\"" + esc(s.url) + "\">" + esc(s.title) + "</a>. " + esc(cap(s.date)) + ". " + esc(cap(s.where)) + ".</li>"; }).join("") + "</ul>";
  }
  function timelineEvents(D) {
    return D.timeline.map(function (e) { var s = D.sources[e.src];
      var ev = { date: e.date, label: e.label, kind: e.kind, text: e.text, source: { label: s.short, url: s.url } };
      if (e.key) ev.key = true; return ev; });
  }

  var model = { solarPts: solarPts, pts: pts, at: at, first: first, last: last, bracket: bracket, passes: passes, nineTenths: nineTenths, guessAnswer: guessAnswer, halfGap: halfGap,
    mostCommon: mostCommon, counted: counted, EXPLAIN_LEDE: EXPLAIN_LEDE,
    STEPS: STEPS, guessLine: guessLine, GUESS_SAW: GUESS_SAW, farmLine: farmLine, FARM_SAW: FARM_SAW, heatLine: heatLine, HEAT_NOTE: HEAT_NOTE, HEAT_SAW: HEAT_SAW, carLine: carLine, CAR_SAW: CAR_SAW,
    solarLine: solarLine, SOLAR_SAW: SOLAR_SAW, SORT_NOTE: SORT_NOTE, spec: spec, X: X, XZ: XZ,
    staticFallback: staticFallback, pointsHTML: pointsHTML, ideasHTML: ideasHTML, checkHTML: checkHTML, factsHTML: factsHTML, sourcesHTML: sourcesHTML, timelineEvents: timelineEvents, fmtN: fmtN, pct: pct };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H;
  function bold(t) { return LX.rich(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>"); }

  // the curve viewer: a toggle per curve, an optional zoom, one LX.Plot; onChange(state) after every press
  function Viewer(host, D, o) {
    var on = (o.on || []).slice(), zoom = false, tg = {};
    var row = H("div", { class: "lx-toggles x3-toggles", role: "group", "aria-label": "Curves to show" }, host);
    (o.keys || []).forEach(function (k) {
      var s = byKey(D, k);
      tg[k] = LX.Toggle(row, { label: s.short, on: on.indexOf(k) >= 0, onChange: function (v) { if (v && on.indexOf(k) < 0) on.push(k); if (!v) on = on.filter(function (x) { return x !== k; }); draw(); } });
    });
    var zseg = null;
    if (o.zoom) {
      zseg = H("div", { class: "lx-seg x3-zoom", role: "group", "aria-label": "Scale of the chart" }, host);
      [["Full scale", false], ["Zoom: 0 to 10%, 2014 on", true]].forEach(function (z) {
        var b = H("button", { type: "button", "aria-pressed": String(z[1] === zoom), text: z[0] }, zseg);
        b.addEventListener("click", function () { zoom = z[1]; [].forEach.call(zseg.children, function (c) { c.setAttribute("aria-pressed", String(c === b)); }); draw(); });
      });
    }
    var P = LX.Plot(H("div", { class: "x3-chart" }, host), { text: "Text version of the chart", box: true });
    var cnt = H("div", { class: "x3-counted" }, host);
    H("p", { class: "lx-eyebrow", text: "What is counted" }, cnt);
    var cl = H("ul", null, cnt);
    function draw() {
      var keys = (o.always || []).concat(on);
      P.render(spec(D, keys, zoom, o.aria), true);
      cl.innerHTML = ""; cnt.hidden = !keys.length;
      counted(D, keys).forEach(function (c) { H("li", { html: "<b>" + LX.esc(c.short) + ":</b> " + LX.esc(c.measure) + "." }, cl); });
      if (o.onChange) o.onChange({ on: on.slice(), zoom: zoom });
    }
    draw();
    return { set: function (k, v) { tg[k].set(v); if (v && on.indexOf(k) < 0) on.push(k); if (!v) on = on.filter(function (x) { return x !== k; }); draw(); },
      zoom: function (z) { zoom = !!z; if (zseg) [].forEach.call(zseg.children, function (c, i) { c.setAttribute("aria-pressed", String((i === 1) === zoom)); }); draw(); }, state: function () { return { on: on.slice(), zoom: zoom }; } };
  }

  LX.mount("x03", function (live, data, root) {
    var D = data[KEY], P = data.path, demo = [];
    function line(host) { return H("p", { class: "lx-step-line", "aria-live": "polite" }, host); }
    var steps = [
      { text: STEPS[0], build: function (act, api) {
          var res = H("div", { class: "x3-res" }), ans = guessAnswer(D);
          function result(g, out) {
            (out || res).innerHTML = "";
            H("p", { class: "lx-step-line", html: bold(guessLine(D, g)) }, out || res);
            Viewer(res, D, { always: ["elec"], aria: "Share of U.S. homes with electric service, " + first(D, "elec")[0] + " to " + last(D, "elec")[0] });
            api.done(); api.saw(GUESS_SAW);
          }
          var g0 = LX.progress.guess("x3-ninety");
          if (g0 != null && D.guess.ticks[g0]) { H("p", { class: "lx-hint", text: "Your guess: " + D.guess.ticks[g0] + "." }, act); act.appendChild(res); result(+g0); }
          else { LX.Guess(act, { id: "x3-ninety", q: "Years from 8% to 90% of homes", ticks: D.guess.ticks, answer: ans, start: D.guess.start, onLock: function (g, out) { result(g, out); } }); act.appendChild(res); }
          demo[0] = function () { var b = act.querySelector(".lx-guess .lx-btn"); if (b) b.click(); };
        } },
      { text: STEPS[1], build: function (act, api) {
          var ln = line(act), v = Viewer(act, D, { always: ["elec"], keys: ["nonfarm", "farm"], aria: "Share of U.S. homes with electric service: all homes, town homes and farms",
            onChange: function (st) { if (st.on.indexOf("farm") >= 0 && st.on.indexOf("nonfarm") >= 0) { ln.innerHTML = bold(farmLine(D)); api.done(); api.saw(FARM_SAW); } else ln.textContent = "Switch on both the town and the farm curves."; } });
          act.appendChild(ln);
          demo[1] = function () { v.set("nonfarm", true); v.set("farm", true); };
        } },
      { text: STEPS[2], build: function (act, api) {
          var ln = line(act), v = Viewer(act, D, { keys: ["coal", "gas"], aria: "Share of U.S. homes by main heating fuel, coal and piped gas, " + first(D, "gas")[0] + " to " + last(D, "gas")[0],
            onChange: function (st) { if (st.on.length === 2) { ln.innerHTML = bold(heatLine(D)); api.done(); api.saw(HEAT_SAW); } else ln.textContent = "Switch on both heating curves."; } });
          act.appendChild(ln);
          H("p", { class: "lx-hint", text: HEAT_NOTE }, act);
          demo[2] = function () { v.set("coal", true); v.set("gas", true); };
        } },
      { text: STEPS[3], build: function (act, api) {
          var ln = line(act), v = Viewer(act, D, { always: ["elec"], keys: ["cars"], aria: "Share of U.S. families owning a car, " + first(D, "cars")[0] + " to " + last(D, "cars")[0] + ", beside homes with electric service",
            onChange: function (st) { if (st.on.length) { ln.innerHTML = bold(carLine(D)); api.done(); api.saw(CAR_SAW); } else ln.textContent = "Switch the car curve on."; } });
          act.appendChild(ln);
          demo[3] = function () { v.set("cars", true); };
        } },
      { text: STEPS[4], build: function (act, api) {
          var ln = line(act), v = Viewer(act, D, { keys: ["solar"], zoom: true, aria: "Solar's share of U.S. electricity, " + first(D, "solar")[0] + " to " + last(D, "solar")[0],
            onChange: function (st) {
              if (st.on.length && st.zoom) { ln.innerHTML = bold(solarLine(D)); api.done(); api.saw(SOLAR_SAW); }
              else ln.textContent = st.on.length ? "Now zoom in to 0 to 10%." : "Switch the solar curve on.";
            } });
          act.appendChild(ln);
          demo[4] = function () { v.set("solar", true); v.zoom(true); };
        } },
      { text: STEPS[5], build: function (act, api) {
          var note = line(act), why = H("details", { class: "lx-textalt x3-why" }), wl;
          H("summary", { text: "Every reason, with its source" }, why); wl = H("ul", null, why);
          D.sort.cards.forEach(function (c) { H("li", { html: "<b>" + LX.esc(c.text) + ".</b> " + LX.esc(c.why) }, wl); });
          var cs = LX.CardSort(act, { bins: D.sort.bins, cards: D.sort.cards.map(function (c) { return { id: c.id, text: c.text, bin: c.bin, why: c.why }; }), maxWhy: 5,
            onCheck: function (g) { note.textContent = g.right + " of " + g.total + " match the sources."; act.appendChild(why); api.done(); } });
          act.appendChild(note);
          H("p", { class: "lx-hint", text: SORT_NOTE }, act);
          H("a", { class: "lx-btn small", style: "justify-self:start;margin-top:10px", href: "#explain", html: "The curves together, and a timeline" + LX.icon("arrow") }, act);
          demo[5] = function () { var m = {}; D.sort.cards.forEach(function (c) { m[c.id] = c.bin; }); cs.place(m); cs.check(); };
        } }
    ];
    var cards = LX.StepCards(live, { id: "x3-steps", steps: steps });

    // ---------------------------------------------------------------- the explain layer
    var xhost = document.getElementById("x03-explain");
    if (xhost) {
      xhost.innerHTML = ""; xhost.classList.add("is-live");
      var c1 = H("div", { class: "lx-xcard x3-wide" }, xhost);
      H("h3", { text: "The curves together" }, c1);
      H("p", { class: "lx-lede", html: LX.rich(EXPLAIN_LEDE) }, c1);
      Viewer(c1, D, { on: ["elec", "farm", "gas", "coal", "cars", "solar"], keys: ["elec", "nonfarm", "farm", "gas", "coal", "cars", "solar"], aria: "U.S. adoption curves as shares over time" });
      LX.Timeline(H("div", { class: "lx-xcard" }, xhost), { title: "U.S. energy transitions, dated", lede: "Each event from a dated source; the gaps show the time between them.", events: timelineEvents(D) });
      var c3 = H("div", { class: "lx-xcard" }, xhost);
      LX.Steelman(c3, { title: D.debate.title, sides: D.debate.sides.map(function (s) { return { key: s.key, title: s.title, points: s.points }; }), note: D.debate.note });
      var nx = H("div", { class: "lx-xcard" }, xhost);
      H("h3", { text: "Where this goes next" }, nx);
      var ul = H("ul", { class: "x3-next" }, nx);
      [["F10", "why every country's energy system looks different today"], ["X2", "what happens to gas, coal and oil systems in a transition"], ["A20", "why national scenarios of the future disagree"]]
        .forEach(function (x) { H("li", { html: LX.lessonRefHTML(P, x[0]) + ": " + LX.esc(x[1]) + "." }, ul); });
    }

    LX.demo(root, function (state) {
      var n = state === "mid" ? 3 : +((/^step-(\d+)$/.exec(state) || [])[1] || 0); if (!n) return null;
      var k = Math.max(0, Math.min(steps.length - 1, n - 1));
      cards.go(k); if (demo[k]) demo[k]();
      return { view: "step " + (k + 1) };
    }, cards);
    root.lxLesson = { model: model, D: D, cards: cards };
  });
})();
