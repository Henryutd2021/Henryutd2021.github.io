// 06-three-jobs.js — Lesson 6, "Cheap energy, firm capacity, flexibility: which plant does which job?" (step cards, W1,
// 2026-11-02).
//
// Data: assets/learn/data/06-three-jobs.json (nine technologies with sourced key numbers and the reference sort) and
// assets/learn/data/town_year.json (SPP's 2025 wind shape, for the longest calm spell in the Steelman card).
//
// No optimization model (model mode "none"). The pure functions below:
//   score(marks, tech)   compares the reader's sort with the reference: a 'yes' or 'no' cell agrees or differs; a 'partly'
//                        cell accepts either answer (it depends on the plant, the place or the rules); the scoring is
//                        LX.CardSort.score (components/cardsort.js), the job sorter's own
//   lull(shape, thr)     the longest run of hours with the wind shape below thr (thousandths of its 2025 best hour)
//   rank(tech, key)      table order by a key, missing values last
// Two numbers per technology: the 2025 U.S. capacity factor (EIA, Electric Power Monthly, Tables 6.07.A/B) and the
// firm share, PJM's ELCC class rating for its 2028/2029 auction (one market, one auction; pjm.com is cited as text until
// the domain is approved for links). Neutral by design: the reference sort gives the evidence for every cell, and the
// contested pairing (wind plus storage as firm capacity) gets both strongest cases.
//
// Shared components: the dot chart is LX.Scatter (components/scatter.js), the job sorter LX.CardSort in "toggles"
// mode (cardsort.js) and the Steelman card LX.Steelman (steelman.js).
(function () {
  "use strict";

  // ---------------------------------------------------------------- pure model
  var JOBS = ["energy", "firm", "flex"];
  // the job sorter's scoring (components/cardsort.js): window.LX.CardSort in the browser, require() in Node
  var CS = (typeof window !== "undefined" && window.LX && window.LX.CardSort) || require("./components/cardsort.js");
  // the technologies as sorter items: one row each, the reference sort in `ref`
  function sortItems(tech) { return tech.map(function (t) { return { key: t.key, label: t.label, color: t.color, ref: t.jobs, why: t.why }; }); }
  function score(marks, tech) { return CS.score(marks, sortItems(tech), JOBS); }
  function referenceMarks(tech) { return CS.reference(sortItems(tech), JOBS); }
  function lull(shape, thr) {
    var best = 0, cur = 0, end = -1;
    for (var i = 0; i < shape.length; i++) { cur = shape[i] < thr ? cur + 1 : 0; if (cur > best) { best = cur; end = i; } }
    return { hours: best, start: end - best + 1, end: end };
  }
  // local date of hour index i (index 0 = 00:00 Central standard time, 1 January 2025; see 05-capacity-factor.json)
  function localDate(i) { var d = new Date(Date.UTC(2025, 0, 1) + i * 3600000); return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), h: d.getUTCHours() }; }
  function rank(tech, key) {
    return tech.slice().sort(function (a, b) {
      var x = a[key], y = b[key];
      if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1;
      return y - x;
    }).map(function (t) { return t.key; });
  }
  var model = { JOBS: JOBS, score: score, referenceMarks: referenceMarks, lull: lull, localDate: localDate, rank: rank };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H, S = LX.S, LESSON = "06-three-jobs";
  // the pictograms atom, flame, drop, geo and dial are in the shared LX.IC (core.js) since the W1 merge
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  function pct(x, d) { return (x * 100).toFixed(d === undefined ? 1 : d) + "%"; }
  function firmText(t) { return t.firm == null ? t.firmLabel : t.firmLabel + (t.firmNote ? " (" + t.firmNote + ")" : ""); }
  // the first key number: capacity factor, or what replaces it for technologies that make no energy of their own
  function first(t) {
    if (t.cf != null) return ["Capacity factor, U.S. 2025", pct(t.cf)];
    if (t.rte) return ["Round-trip efficiency, U.S. fleet (2019 data)", pct(t.rte, 0)];
    if (t.drMW) return ["Enrolled in U.S. wholesale markets, 2024", LX.fmt.int(t.drMW) + " MW, " + pct(t.drShare) + " of peak"];
    return ["Capacity factor", "–"];
  }

  function view(live, data, root) {
    var D = data["06_three_jobs"], year = data.town_year, TECH = D.tech, byKey = {};
    TECH.forEach(function (t) { byKey[t.key] = t; });
    var jobBy = {}; D.jobs.forEach(function (j) { jobBy[j.key] = j; });
    var L = lull(year.wind, D.steelman.lullThreshold), ls = localDate(L.start), le = localDate(L.end);
    var lullText = L.hours + " hours in a row, from " + ls.d + " " + MONTHS[ls.m] + " to " + le.d + " " + MONTHS[le.m];
    var log = LX.store.get("t6-log", {}) || {};
    function keep(k, v) { log[k] = v; LX.store.set("t6-log", log); }
    var openedJobs = {}, openedTech = {}, marks = log.marks || {}, checked = false, sides = {}, pred = null;

    var steps = [
      { text: "A power system needs three jobs done. Cheap energy fills the year with MWh; [[firm-capacity|firm capacity]] is there in the riskiest hours; [[flexibility|flexibility]] follows the changes in between. Open each job.",
        build: function (act, api) {
          var row = H("div", { class: "lx6-jobs" }, act);
          D.jobs.forEach(function (j) {
            var b = H("button", { class: "lx6-job", type: "button", "aria-expanded": openedJobs[j.key] ? "true" : "false" }, row);
            b.innerHTML = LX.icon(j.icon) + "<b>" + LX.esc(j.label) + "</b><span class='q'>" + LX.esc(j.question) + "</span><span class='m'>Measured by: " + LX.esc(j.measure) + "</span>";
            b.addEventListener("click", function () {
              openedJobs[j.key] = true; b.setAttribute("aria-expanded", "true");
              if (D.jobs.every(function (x) { return openedJobs[x.key]; })) { api.done(); api.saw("Three jobs, three different measures. A plant can be good at one and poor at another."); }
            });
          });
          if (D.jobs.every(function (x) { return openedJobs[x.key]; })) api.done();
        } },
      { text: "Before the cards, a prediction. The riskiest hours are the few each year when demand is high and supply is tight. Pick the plant you think a grid trusts most then.",
        build: function (act, api) {
          LX.Predict(act, { id: "t6-firm", q: D.predict.q, answer: D.predict.answer, fresh: true, lockText: "Locked in. Step 4 shows the numbers.",
            options: D.predict.options.map(function (k) { return { value: k, label: byKey[k].label + (k === "battery" ? " (4-hour)" : ""), color: byKey[k].color }; }),
            onPick: function (p) { pred = p; keep("pred", p); api.done(); } });
          if (pred) api.done();
        } },
      { text: "Meet nine technologies. Each card gives two key numbers: its capacity factor (lesson 5) and its [[firm-share|firm share]], the part of its MW that one large U.S. grid counts at the peak. Open every card.",
        build: function (act, api) {
          var chips = H("div", { class: "lx6-chips", role: "group", "aria-label": "Technologies" }, act), card = H("div", { class: "lx6-card", "aria-live": "polite" }, act);
          var count = H("p", { class: "lx-hint" }, act), btns = {};
          TECH.forEach(function (t) {
            var b = H("button", { class: "lx-chip", type: "button", "aria-pressed": "false", style: "--c:" + t.color }, chips);
            H("i", null, b); H("span", { text: t.label }, b);
            b.addEventListener("click", function () { show(t.key); });
            btns[t.key] = b;
          });
          function show(k) {
            var t = byKey[k]; openedTech[k] = true;
            Object.keys(btns).forEach(function (x) { btns[x].setAttribute("aria-pressed", x === k ? "true" : "false"); btns[x].classList.toggle("seen", !!openedTech[x]); });
            card.innerHTML = ""; card.style.setProperty("--c", t.color);
            var hd = H("div", { class: "lx6-card-h" }, card); hd.innerHTML = LX.icon(t.icon); H("h4", { text: t.label }, hd);
            H("p", { class: "lx6-how", text: t.how }, card);
            var nums = H("div", { class: "lx6-nums" }, card);
            var f1 = first(t), n1 = H("div", null, nums); H("span", { text: f1[0] }, n1); H("b", { text: f1[1] }, n1);
            var n2 = H("div", null, nums); H("span", { text: "Firm share, PJM 2028/29" }, n2); H("b", { text: firmText(t) }, n2);
            var jb = H("ul", { class: "lx6-why" }, card);
            JOBS.forEach(function (j) { var li = H("li", { class: "j-" + t.jobs[j] }, jb); H("b", { text: jobBy[j].label + ": " + t.jobs[j] }, li); H("span", { text: " " + t.why[j] }, li); });
            var n = Object.keys(openedTech).length;
            count.textContent = n < TECH.length ? "Cards opened: " + n + " of " + TECH.length + "." : "All " + TECH.length + " cards opened.";
            if (n === TECH.length) { api.done(); api.saw("No card says yes to every job. The next step puts the two numbers side by side."); }
          }
          show(TECH.filter(function (t) { return !openedTech[t.key]; }).concat(TECH)[0].key);
        } },
      { text: "Each dot is a plant: capacity factor across, firm share up. Tap the plant that runs the least of the year but counts the most at the peak.",
        build: function (act, api) {
          var pts = TECH.filter(function (t) { return t.cf != null && t.firm != null && t.key !== "hydro"; });
          var sc = LX.Scatter(act, { points: pts.map(function (t) {
              return { key: t.key, label: t.label, x: t.cf, y: t.firm, color: t.color,
                       aria: t.label + ": capacity factor " + pct(t.cf) + ", firm share " + t.firmLabel, text: t.label + ": capacity factor " + pct(t.cf) + "; firm share " + t.firmLabel + "." }; }),
            x: { ticks: [0, 0.25, 0.5, 0.75, 1], fmt: function (v) { return v * 100 + "%"; }, title: "Capacity factor, U.S. 2025 (how much of the year it runs)", titleN: "Capacity factor, U.S. 2025" },
            y: { ticks: [0, 0.25, 0.5, 0.75, 1], fmt: function (v) { return v * 100 + "%"; }, title: "Firm share, PJM 2028/29" },
            diagonal: { label: "firm share = capacity factor", labelN: "firm share = CF", at: [0.7, 0.58], atN: [0.55, 0.19] },
            aria: "Capacity factor (across) against firm share (up) for five technologies", onPick: function (k) {
            var t = byKey[k], ok = k === "pk";
            keep("scatter", k);
            var pr = !pred ? "" : pred === D.predict.answer ? " Your prediction was right too." : " Your prediction, " + byKey[pred].label.toLowerCase() + ", counts " + byKey[pred].firmLabel + ".";
            if (ok) { api.done(); api.saw("Right: the gas peaker ran only " + pct(t.cf) + " of 2025, yet PJM counts " + t.firmLabel + " of its MW. Solar is the opposite: " + pct(byKey.solar.cf) + " against " + byKey.solar.firmLabel + ". Capacity factor and firm share measure different jobs." + pr); }
            else api.saw(t.label + ": capacity factor " + pct(t.cf) + ", firm share " + t.firmLabel + ". Look further left, near the top.", true);
          } });
          void sc;
        } },
      { text: "Now sort. Mark the jobs each technology does well; some do more than one. Then check your sort against the evidence.",
        build: function (act, api) {
          LX.CardSort(act, { mode: "toggles", cls: "lx6-sorter", items: sortItems(TECH), bins: D.jobs, marks: marks, checked: checked, checkLabel: "Check my sort",
            onChange: function (m) { marks = m; keep("marks", m); },
            onCheck: function (res) {
              checked = true; keep("score", { agree: res.agree, clear: res.clear, partly: res.partly });
              api.done();
              api.saw("You agree with the evidence on " + res.agree + " of " + res.clear + " clear cells. The other " + res.partly + " are “partly”: the answer depends on the plant, the place or the market's rules, so either is fair. Open “Why” on any row.", res.differ > 4);
            } });
          if (checked) api.done();
        } },
      { text: "Some pairings are contested, and the evidence points both ways. Open the strongest case on each side before you make up your mind.",
        build: function (act, api) {
          var sr = D.steelman.storageRatings;
          LX.Steelman(act, {
            title: D.steelman.title, heading: "h4", eyebrow: "Steelman card", frame: true, reveal: "button",
            sides: [{ key: "for", title: "The strongest case for",
                      points: ["Longer storage counts for more: PJM counts " + pct(sr["4"], 0) + " of a 4-hour battery's MW, " + pct(sr["8"], 0) + " for 8 hours and " + pct(sr["10"], 0) + " for 10 hours.",
                               "Steadier wind counts for more: PJM counts " + pct(D.steelman.offshoreWind, 0) + " for offshore wind, against " + byKey.wind.firmLabel + " onshore."] },
                    { key: "against", title: "The strongest case against",
                      points: ["Calm spells outlast batteries: the Southwest Power Pool's whole wind fleet stayed below a quarter of its best 2025 hour for " + lullText + ".",
                               "A battery must be recharged before the next calm spell, often by the same wind."] }],
            onOpen: function (side) {
              sides[side] = true;
              if (sides["for"] && sides.against) { api.done(); keep("steelman", true); api.saw("Both cases rest on real numbers. Settling it for one grid takes many weather years of hourly data and a reliability test: Analyst lesson A5 (upcoming)."); }
            }, opened: sides
          });
          if (sides["for"] && sides.against) api.done();
        } },
      { text: D.apply.q,
        build: function (act, api) {
          var why = { energy: "Cheap energy fills the year, but this need lasts a few hours. The job is firm capacity.",
                      firm: "Right: a few hours a year at the peak is a firm-capacity job. Peakers, batteries, demand response and reservoir hydro could all compete for it, each with its limits.",
                      flex: "Flexibility helps follow the evening ramp, but the need here is to be there at all: firm capacity." };
          var row = H("div", { class: "lx-choices-row", role: "group", "aria-label": "Job" }, act), bs = {};
          D.jobs.forEach(function (j) {
            var b = H("button", { class: "lx-choice", type: "button", "aria-pressed": "false" }, row); b.innerHTML = LX.icon(j.icon) + "<span>" + LX.esc(j.label) + "</span>";
            b.addEventListener("click", function () {
              Object.keys(bs).forEach(function (x) { bs[x].setAttribute("aria-pressed", x === j.key ? "true" : "false"); });
              keep("apply", j.key); api.saw(why[j.key], j.key !== D.apply.answer);
              if (j.key === D.apply.answer) { api.done(); LX.progress.done(LESSON); }
            });
            bs[j.key] = b;
          });
        } }
    ];
    var cards = LX.StepCards(live, { id: "t6-steps", steps: steps });
    // demo states (core.js LX.demo): "step-N" opens step N (1-7) with its action done; "mid" = the sorter, partly filled
    // and checked (step 5)
    LX.demo(root, function (state) {
      var n = state === "mid" ? 5 : +((/^step-(\d+)$/.exec(state) || [])[1] || 0); if (!n) return null;
      var i = Math.max(0, Math.min(steps.length - 1, n - 1));
      var click = function (sel, k) { var b = cards.el.querySelectorAll(sel)[k || 0]; if (b) b.click(); };
      pred = "battery"; TECH.forEach(function (t) { openedTech[t.key] = true; });
      if (i === 4) { marks = referenceMarks(TECH); marks.wind.flex = true; marks.battery.energy = true; checked = true; }
      cards.go(i);
      if (i === 0) { click(".lx6-job", 0); click(".lx6-job", 1); click(".lx6-job", 2); }
      if (i === 1) click(".lx-choice", 2);
      if (i === 2) click(".lx6-chips .lx-chip", 2);
      if (i === 3) { var d = cards.el.querySelectorAll(".lx-scatter-dot"); if (d[2]) d[2].dispatchEvent(new MouseEvent("click", { bubbles: true })); }
      if (i === 4) click(".lx6-sorter .lx-btn");
      if (i === 5) { click(".lx-steel-side .lx-btn", 0); click(".lx-steel-side .lx-btn", 1); }
      if (i === 6) click(".lx-choice", 1);
      return { view: "step " + (i + 1) };
    }, cards);
    buildExplain(D, byKey, jobBy);
  }

  // ---------------------------------------------------------------- the explain layer
  function buildExplain(D, byKey, jobBy) {
    var host = document.getElementById("t6-explain"); if (!host) return;
    host.innerHTML = ""; host.classList.add("is-live");
    var TECH = D.tech, GROUP = { energy: "var(--lx-tier-1)", firm: "var(--lx-tier-2)", flex: "var(--lx-tier-4)" };
    var c1 = H("div", { class: "lx-xcard" }, host);
    function jobsNote(t) { return JOBS.filter(function (j) { return t.jobs[j] === "yes"; }).map(function (j) { return jobBy[j].label; }).join(" · ") +
      (JOBS.some(function (j) { return t.jobs[j] === "partly"; }) ? "; partly: " + JOBS.filter(function (j) { return t.jobs[j] === "partly"; }).map(function (j) { return jobBy[j].label.toLowerCase(); }).join(", ") : ""); }
    LX.CompareTable(c1, {
      title: "Nine technologies, two numbers, three jobs",
      columns: [{ key: "name", label: "Technology and the jobs it does well", main: true }, { key: "cf", label: "Capacity factor, U.S. 2025", phone: "CF", num: true, bar: { max: 1 } },
                { key: "firm", label: "Firm share, PJM 2028/29", phone: "Firm", num: true, bar: { max: 1, color: "var(--lx-tier-2)" } }],
      rows: TECH.map(function (t) {
        return { key: t.key, color: t.color, name: t.label, note: jobsNote(t), cf: t.cf != null ? { text: pct(t.cf), value: t.cf } : { text: "–" },
                 firm: t.firm != null ? { text: t.firmLabel, unit: t.firmUnit ? " " + t.firmUnit : "", value: t.firm } : { text: "–" } };
      }),
      sorts: [{ label: "As listed", order: TECH.map(function (t) { return t.key; }), note: "Two numbers per technology; “–” means the number does not apply or is not rated." },
              { label: "By capacity factor", order: rank(TECH, "cf"), ranked: true, note: "<b>Capacity factor ranks the energy job.</b> Batteries and demand response make no energy of their own." },
              { label: "By firm share", order: rank(TECH, "firm"), ranked: true, note: "<b>Firm share ranks the peak job.</b> The order changes: the peaker climbs, solar falls." }]
    });
    var c2 = H("div", { class: "lx-xcard" }, host);
    var G = { tech: ["Technologies", "var(--lx-ink-3)"], job: ["Jobs", "var(--lx-tier-1)"], measure: ["Measures", "var(--lx-tier-2)"] };
    LX.ConceptMap(c2, {
      title: "The three jobs, and who does them", lede: "Tap a node to see what it means and how it links to the others.", groups: G,
      cols: 4, rows: 3, colsN: 3, rowsN: 4, sel: "firm",
      nodes: [
        { id: "vre", g: "tech", label: "Wind and solar", lines: ["Wind and", "solar"], at: [0, 0], atN: [0, 0], text: "No fuel, but the weather sets their output. Capacity factor " + pct(byKey.wind.cf) + " and " + pct(byKey.solar.cf) + "; firm share " + byKey.wind.firmLabel + " and " + byKey.solar.firmLabel + "." },
        { id: "steady", g: "tech", label: "Nuclear, geothermal", lines: ["Nuclear,", "geothermal"], at: [0.95, 0], atN: [2, 0], text: "Steady plants that run most of the year: capacity factor " + pct(byKey.nuclear.cf) + " and " + pct(byKey.geo.cf) + " in 2025." },
        { id: "gas", g: "tech", label: "Gas and hydro", lines: ["Gas and", "hydro"], at: [1.9, 0], atN: [0, 1], text: "Fuel or water on hand, so they can follow orders within limits. Firm share " + byKey.cc.firmLabel + " (combined-cycle) and " + byKey.pk.firmLabel + " (peaker)." },
        { id: "shift", g: "tech", label: "Batteries, demand response", lines: ["Batteries,", "demand", "response"], at: [2.85, 0], atN: [2, 1], text: "They make no energy; they move or trim demand in time. Firm share " + byKey.battery.firmLabel + " (4-hour battery) and " + byKey.dr.firmLabel + " (demand response)." },
        { id: "energy", g: "job", label: "Cheap energy", at: [0.45, 1], atN: [0, 2], text: jobBy.energy.question },
        { id: "firm", g: "job", label: "Firm capacity", at: [1.4, 1], atN: [1, 2], text: jobBy.firm.question },
        { id: "flex", g: "job", label: "Flexibility", at: [2.35, 1], atN: [2, 2], text: jobBy.flex.question },
        { id: "cf", g: "measure", label: "Capacity factor", lines: ["Capacity", "factor"], at: [0.45, 2], atN: [0, 3], text: "Energy made ÷ (size × hours): lesson 5." },
        { id: "fs", g: "measure", label: "Firm share", lines: ["Firm", "share"], at: [1.4, 2], atN: [1, 3], text: "The part of a plant's MW a grid counts in its riskiest hours; PJM calls it an ELCC class rating.", later: "Later: Analyst lesson A5 (upcoming) estimates it with many weather years." },
        { id: "ramp", g: "measure", label: "Ramp and start", lines: ["Ramp and", "start"], at: [2.35, 2], atN: [2, 3], text: "How fast a plant changes output, and how quickly it starts: the [[ramp-rate|ramp limit]] of lesson 0." }
      ],
      edges: [["vre", "energy", "mainly"], ["steady", "energy", "mainly"], ["steady", "firm", "also"], ["gas", "firm", "mainly"], ["gas", "flex", "also"],
              ["shift", "flex", "mainly"], ["shift", "firm", "within limits"], ["energy", "cf", "measured by"], ["firm", "fs", "measured by"], ["flex", "ramp", "measured by"]]
    });
    void GROUP;
  }

  LX.mount("three-jobs", function (live, data, root) { view(live, data, root); });
})();
