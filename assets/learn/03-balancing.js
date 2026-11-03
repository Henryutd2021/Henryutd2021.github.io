// 03-balancing.js — Lesson 3, "How does the grid stay balanced every second?" (step cards, Learn W1, 2026-11-02).
//
// Data: assets/learn/data/03-balancing.json (the Plains Grid model's parameters, illustrative; the NERC control
// continuum; real under-frequency settings and the Winter Storm Uri chronology from the FERC-NERC report, with pages).
//
// Toy model (one aggregate frequency for the whole Plains Grid; no network, no voltage). At t = 0 Prairie Town's
// combined-cycle plant trips while making tripMW. With df = f - 60 Hz, E the stored rotational energy (inertia, GW·s)
// and M = 2E/f0 (MW·s per Hz), the swing equation with load relief is
//     M d(df)/dt = up + b - D*df - tripMW + shed
//   governors   pg' = (-K*df - pg)/Tg, pg <= R        (droop K MW/Hz, lag Tg s; may also turn plants down)
//   AGC         pa' = -beta*df/Tagc                   (integral control; frozen while the reserve is used up)
//   reserve     up  = min(R, pg + pa)                 (upward help never exceeds the reserve R held back)
//   battery     b'  = (clamp(-Kf*df, +-ffrMW) - b)/Tf (fast frequency response, inverter-based, no inertia)
//   UFLS        one block: when f <= 59.3 Hz, relays disconnect uflsPct % of load (shed, MW), once
// Explicit Euler with dt = 10 ms. The first-second fall rate is f0*tripMW/(2E) (Hz/s); with governors only, the
// frequency settles where the governors' and the load's response add up to the lost power: tripMW/(K+D) below 60 Hz
// while K times that gap stays within the reserve. Every number the page states comes from simulate() or the data file
// and is checked in _tests/learn/test_03_balancing.js.
//
// The pure model is exported for Node; the view uses the component library (window.LX; assets/learn/README.md).
// The chart card is the shared LX.PlotCard and its chart LX.Plot (components/plot.js, W1 integration).
(function () {
  "use strict";

  // ---------------------------------------------------------------- pure model
  // o: {inertia (GW·s), reserve (MW), gov, agc, ffr (booleans), tEnd (s), stopAt (Hz: stop when reached; no UFLS)}
  function simulate(G, o) {
    var f0 = G.f0, M = 2 * o.inertia * 1000 / f0, dt = G.dt, n = Math.round(o.tEnd / dt), every = Math.max(1, Math.round((o.sample || 0.1) / dt));
    var df = 0, pg = 0, pa = 0, b = 0, shed = 0, uflsAt = null, stopT = null;
    var nadir = { t: 0, f: f0 }, peak = { t: 0, f: f0 }, pts = [], upMax = 0, upEnd = 0;
    var uflsMW = G.loadMW * G.uflsPct / 100;
    for (var k = 0; k <= n; k++) {
      var t = k * dt, f = f0 + df;
      if (f < nadir.f - 1e-12) nadir = { t: t, f: f };
      if (f > peak.f + 1e-12) peak = { t: t, f: f };
      if (o.stopAt != null && f <= o.stopAt) { stopT = t; pts.push([t, f]); break; }
      if (o.stopAt == null && !shed && f <= G.uflsHz) { shed = uflsMW; uflsAt = t; }
      if (k % every === 0) pts.push([t, f]);
      if (k === n) break;
      if (o.gov) pg = Math.min(o.reserve, pg + (-G.govMWperHz * df - pg) * dt / G.govT);   // a valve at its limit stays there
      var up = Math.min(o.reserve, pg + pa);
      if (o.agc && !(pg + pa >= o.reserve && df < 0)) pa += -G.agcBetaMWperHz * df / G.agcT * dt;
      if (o.ffr) b += (Math.max(-G.ffrMW, Math.min(G.ffrMW, -G.ffrMWperHz * df)) - b) * dt / G.ffrT;
      upMax = Math.max(upMax, up); upEnd = up;
      df += (up + b - G.reliefMWperHz * df - G.tripMW + shed) / M * dt;
    }
    var end = pts[pts.length - 1][1], back = null;
    if (o.agc) {   // first time after which the frequency stays within backBandHz of 60 Hz to the end of the run
      for (var i = pts.length - 1; i >= 0; i--) { if (Math.abs(pts[i][1] - f0) > G.backBandHz) { back = i < pts.length - 1 ? pts[i + 1][0] : null; break; } }
      if (i < 0) back = 0;
    }
    return { pts: pts, nadir: nadir, peak: peak, uflsAt: uflsAt, shedMW: shed, stopT: stopT, end: end, back: back, upMax: upMax, upEnd: upEnd };
  }
  function rocof(G, inertia) { return G.f0 * G.tripMW / (2 * inertia * 1000); }          // Hz per second, at t = 0
  function settleGap(G, reserve) {                                                     // governors only, before UFLS
    var x = G.tripMW / (G.govMWperHz + G.reliefMWperHz);
    if (G.govMWperHz * x > reserve) x = (G.tripMW - reserve) / G.reliefMWperHz;
    return x;   // Hz below 60
  }
  // the reader's case in numbers: every figure the step cards and the explain layer quote. Shedding, the overshoot and
  // the settled frequency come from the governors-only case run to the end of the ten-minute window (full), so a fall
  // that reaches the relays after the 30-second chart still counts (inertia 30 GW·s, reserve 40 MW: 59.3 Hz at 31.9 s).
  // The 30-second run (prim) gives what the chart shows: the lowest point inside it, or that it is still sinking.
  function story(G, inertia, reserve) {
    var only = simulate(G, { inertia: inertia, reserve: 0, tEnd: 60, stopAt: G.uflsHz });
    var prim = simulate(G, { inertia: inertia, reserve: reserve, gov: true, tEnd: G.secondsWindow });
    var full = simulate(G, { inertia: inertia, reserve: reserve, gov: true, tEnd: G.minutesWindow, sample: 1 });
    var sec = simulate(G, { inertia: inertia, reserve: reserve, gov: true, agc: true, tEnd: G.minutesWindow, sample: 1 });
    return { inertia: inertia, reserve: reserve, rocof: rocof(G, inertia), hitT: only.stopT, nadir: prim.nadir, at30: prim.end, settle: full.end,
             ufls: full.uflsAt, late: full.uflsAt != null && prim.uflsAt == null, shedMW: full.shedMW, peak: full.peak,
             sinking: full.uflsAt == null && prim.nadir.t >= G.secondsWindow - 0.05,   // no lowest point inside the chart yet
             back: sec.back, end: sec.end, reserveUsed: Math.max(0, sec.upEnd), gap: settleGap(G, reserve) };
  }
  function clock(s) { var p = s.split(":"); return +p[0] * 60 + +p[1]; }                // "1:54" -> minutes after midnight
  // a Uri event's frequency for display: a reading ("59.304 Hz") or a threshold crossing the report states without a
  // reading ("below 59.4 Hz", "above 60 Hz"; data: cross)
  function hzEvent(e) { return e.cross ? e.cross + " " + e.hz + " Hz" : e.hz.toFixed(3) + " Hz"; }
  var model = { simulate: simulate, rocof: rocof, settleGap: settleGap, story: story, clock: clock, hzEvent: hzEvent };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view helpers
  var LX = window.LX, H = LX.H, LESSON = "03-balancing";
  var hz = function (v) { return v.toFixed(2) + " Hz"; };
  var sec1 = function (v) { return v.toFixed(1) + " s"; }, min1 = function (v) { return (v / 60).toFixed(1) + " min"; };
  var mw = function (v) { return Math.round(v).toLocaleString("en-US") + " MW"; };

  // ---------------------------------------------------------------- the lesson
  var COL = { inertia: "var(--lx-ink-3)", primary: "var(--lx-accent)", secondary: "var(--lx-good)", battery: "var(--lx-tier-3)", ufls: "var(--lx-bad)", uri: "var(--lx-cc)" };
  var PRED = {
    q: "Before you trip it: what slows the fall in frequency first?",
    options: [{ value: "ops", label: "Operators in the control room" }, { value: "spin", label: "Energy stored in spinning machines" },
              { value: "gov", label: "Governors on power plants" }, { value: "ufls", label: "Relays that cut customers" }],
    feedback: { ops: "People take minutes; the first second belongs to physics.", spin: "Every turbine on the grid slows together and gives up stored energy at once.",
                gov: "Governors act within seconds, but they are not first.", ufls: "Relays are the last line of defence, used only if the fall reaches 59.3 Hz." }
  };

  function view(live, data, root) {
    var D = data["03_balancing"], G = D.grid, U = D.uri;
    // stage = the step card on screen: each card shows only the controls it has introduced, so going Back to an early
    // card never leaves a later card's trace on its chart (the reader's switches stay set for when they come forward)
    var S_ = { inertia: G.inertia.start, reserve: G.reserve.start, tripped: false, gov: false, agc: false, ffr: false, view: "seconds", uri: 0, pick: null, anim: false, stage: 0 };
    // the chart card (plot.js): title, value chips, the chart and its text version
    var card = LX.PlotCard(live, { text: "Text version of the chart" }), ttl = card.title, chips = card.chips, P = card.plot, altBody = card.text;

    function chip(label, value, tone) { card.chip(label, value, tone); }
    function ticksHz(lo, hi) { var t = []; for (var v = Math.ceil(lo * 10 - 1e-9) / 10; v <= hi + 1e-9; v = Math.round((v + 0.2) * 10) / 10) t.push([v, v.toFixed(1)]); return t; }
    function yRange(lines) {
      var lo = 59.2, hi = 60.2;
      lines.forEach(function (l) { l.pts.forEach(function (p) { if (p[1] > hi - 0.05) hi = Math.ceil((p[1] + 0.08) * 10) / 10; }); });
      return { min: lo, max: hi };
    }
    function store() {
      var st = story(G, S_.inertia, S_.reserve);
      LX.store.set("l3-case", { inertia: S_.inertia, reserve: S_.reserve }); LX.emit("l3-change", st);
      return st;
    }

    function draw(animate) {
      chips.innerHTML = ""; altBody.innerHTML = "";
      if (S_.view === "uri") return drawUri(animate);
      var st = story(G, S_.inertia, S_.reserve), lines = [], marks = [], legend = [], refs = [], xs, aria, tipFn, list = H("ul", null, altBody);
      var li = function (t) { H("li", { text: t }, list); };
      var tripped = S_.tripped && S_.stage >= 1, gov = S_.gov && S_.stage >= 3, ffr = S_.ffr && S_.stage === 6;
      var minutes = S_.view === "minutes", tEnd = minutes ? G.minutesWindow : G.secondsWindow;
      refs.push({ y: 60, color: "var(--lx-ink-3)", label: "60 Hz", below: true });
      refs.push({ y: G.uflsHz, color: COL.ufls, dash: "5 4", label: "Relays cut customers · " + G.uflsHz + " Hz", labelN: G.uflsHz + " Hz", below: true });
      if (!tripped) {
        lines.push({ pts: [[0, 60], [tEnd, 60]], color: COL.primary });
        ttl.textContent = "Plains Grid frequency · waiting for the trip";
        chip("Frequency", "60.00 Hz"); chip("Prairie Town's combined-cycle", G.tripMW + " MW");
        li("Before the trip the frequency holds at 60.00 Hz.");
      } else if (!minutes) {
        var only = simulate(G, { inertia: S_.inertia, reserve: 0, tEnd: 60, stopAt: G.uflsHz });
        lines.push({ pts: only.pts, color: COL.inertia, dash: gov ? "6 4" : "", width: gov ? 1.8 : 2.6, anim: !gov });
        legend.push({ label: "No controls (inertia and load relief)", color: COL.inertia, dash: gov });
        if (!gov) marks.push({ x: only.stopT, y: G.uflsHz, label: "59.3 Hz after " + sec1(only.stopT), color: COL.ufls, above: true });
        ttl.textContent = "Plains Grid frequency · first " + G.secondsWindow + " seconds after the trip";
        chip("Falls at first", st.rocof.toFixed(2) + " Hz/s");
        chip("No controls: reaches 59.3 Hz", sec1(only.stopT));
        li("Inertia " + S_.inertia + " GW·s: at first the frequency falls " + st.rocof.toFixed(2) + " Hz per second; with no controls acting (only inertia and load relief) it would reach " + G.uflsHz + " Hz after " + sec1(only.stopT) + ".");
        if (gov) {
          var pr = simulate(G, { inertia: S_.inertia, reserve: S_.reserve, gov: true, tEnd: G.secondsWindow });
          lines.push({ pts: pr.pts, color: COL.primary, anim: !ffr });
          legend.push({ label: "With governors (reserve " + S_.reserve + " MW)", color: COL.primary });
          if (pr.uflsAt != null) {
            marks.push({ x: pr.uflsAt, y: G.uflsHz, color: COL.ufls });
            chips.innerHTML = ""; chip("Falls at first", st.rocof.toFixed(2) + " Hz/s"); chip("Relays cut customers", mw(pr.shedMW) + " at " + sec1(pr.uflsAt), "bad"); chip("Then overshoots to", hz(pr.peak.f), "warn");
            li("With governors and " + S_.reserve + " MW of reserve the frequency reaches " + G.uflsHz + " Hz after " + sec1(pr.uflsAt) + "; relays disconnect " + mw(pr.shedMW) + " of customers and the frequency overshoots to " + hz(pr.peak.f) + ".");
          } else if (st.late) {          // the relays act just after the chart's 30 seconds
            marks.push({ x: G.secondsWindow, y: pr.end, label: "Still falling at " + G.secondsWindow + " s", color: COL.primary });
            chips.innerHTML = ""; chip("Falls at first", st.rocof.toFixed(2) + " Hz/s"); chip("At " + G.secondsWindow + " s, still falling", hz(pr.end), "warn"); chip("Relays cut customers", mw(st.shedMW) + " at " + sec1(st.ufls), "bad");
            li("With governors and " + S_.reserve + " MW of reserve the frequency is still falling at " + G.secondsWindow + " s (" + hz(pr.end) + "). It reaches " + G.uflsHz + " Hz after " + sec1(st.ufls) + ", just past this chart, and relays disconnect " + mw(st.shedMW) + " of customers.");
          } else if (st.sinking) {       // the reserve is used up: no lowest point inside the chart
            marks.push({ x: G.secondsWindow, y: pr.end, label: "Still sinking", color: COL.primary });
            chips.innerHTML = ""; chip("Falls at first", st.rocof.toFixed(2) + " Hz/s"); chip("At " + G.secondsWindow + " s", hz(pr.end), "warn"); chip("Levels off near", hz(60 - st.gap));
            li("With governors and " + S_.reserve + " MW of reserve the reserve is used up: the frequency is " + hz(pr.end) + " at " + G.secondsWindow + " s and still sinking toward " + hz(60 - st.gap) + ".");
          } else {
            marks.push({ x: pr.nadir.t, y: pr.nadir.f, label: "Lowest " + hz(pr.nadir.f), color: COL.primary });
            chips.innerHTML = ""; chip("Falls at first", st.rocof.toFixed(2) + " Hz/s"); chip("Lowest point (nadir)", hz(pr.nadir.f) + " at " + sec1(pr.nadir.t)); chip("Levels off near", hz(60 - settleGap(G, S_.reserve)));
            li("With governors and " + S_.reserve + " MW of reserve the fall stops at " + hz(pr.nadir.f) + " after " + sec1(pr.nadir.t) + " and then levels off near " + hz(60 - settleGap(G, S_.reserve)) + ".");
          }
          if (ffr) {
            var bt = simulate(G, { inertia: S_.inertia, reserve: S_.reserve, gov: true, ffr: true, tEnd: G.secondsWindow });
            lines.push({ pts: bt.pts, color: COL.battery, anim: true });
            legend.push({ label: "With governors and a " + G.ffrMW + " MW battery", color: COL.battery });
            marks.push({ x: bt.nadir.t, y: bt.nadir.f, label: "Lowest " + hz(bt.nadir.f), color: COL.battery, above: true });
            chips.innerHTML = ""; chip("Inertia", S_.inertia + " GW·s"); chip("Lowest, no battery", hz(pr.nadir.f)); chip("Lowest, with battery", hz(bt.nadir.f), "good");
            li("With a " + G.ffrMW + " MW battery set for fast frequency response the lowest point is " + hz(bt.nadir.f) + " instead of " + hz(pr.nadir.f) + ".");
          }
        }
      } else {
        var p2 = simulate(G, { inertia: S_.inertia, reserve: S_.reserve, gov: true, tEnd: G.minutesWindow, sample: 1 });
        var s2 = simulate(G, { inertia: S_.inertia, reserve: S_.reserve, gov: true, agc: S_.agc, tEnd: G.minutesWindow, sample: 1 });
        lines.push({ pts: p2.pts, color: COL.primary, dash: S_.agc ? "6 4" : "", width: S_.agc ? 1.8 : 2.4 });
        legend.push({ label: "Governors only", color: COL.primary, dash: S_.agc });
        if (S_.agc) { lines.push({ pts: s2.pts, color: COL.secondary, anim: true }); legend.push({ label: "Governors and AGC", color: COL.secondary }); }
        ttl.textContent = "Plains Grid frequency · first " + G.minutesWindow / 60 + " minutes after the trip";
        chip("Reserve held", S_.reserve + " MW");
        if (S_.agc && s2.back != null) {
          marks.push({ x: s2.back, y: 60 - G.backBandHz, label: "Back to 60 Hz at " + min1(s2.back), color: COL.secondary });
          chip("Back within " + G.backBandHz + " Hz of 60", min1(s2.back), "good"); chip("Reserve in use at 10 min", mw(Math.max(0, s2.upEnd)));
          li("With AGC the frequency is back within " + G.backBandHz + " Hz of 60 Hz after " + min1(s2.back) + "; " + mw(Math.max(0, s2.upEnd)) + " of the " + S_.reserve + " MW reserve is then in use.");
        } else if (S_.agc) {
          chip("After " + G.minutesWindow / 60 + " min", hz(s2.end), "warn"); chip("Reserve in use", mw(Math.max(0, s2.upEnd)) + " (all)");
          li("With AGC but only " + S_.reserve + " MW of reserve, the frequency is still " + hz(s2.end) + " after " + G.minutesWindow / 60 + " minutes: the reserve is used up.");
        } else {
          chip("Governors only, after 10 min", hz(p2.end));
          li("With governors only the frequency stays at " + hz(p2.end) + ".");
        }
        if (s2.uflsAt != null) li("Relays disconnected " + mw(s2.shedMW) + " of customers " + sec1(s2.uflsAt) + " after the trip.");
      }
      xs = minutes ? { min: 0, max: G.minutesWindow, ticks: [[0, "0"], [120, "2 min"], [240, "4 min"], [360, "6 min"], [480, "8 min"], [600, "10 min"]], ticksN: [[0, "0"], [300, "5 min"], [600, "10 min"]] }
                   : { min: 0, max: G.secondsWindow, ticks: [[0, "0 s"], [5, "5"], [10, "10"], [15, "15"], [20, "20"], [25, "25"], [30, "30 s"]], ticksN: [[0, "0 s"], [10, "10"], [20, "20"], [30, "30 s"]] };
      var yr = yRange(lines);
      tipFn = function (x) {
        if (!tripped) return null;
        var h = "<div><b>" + (minutes ? (x / 60).toFixed(1) + " min" : x.toFixed(1) + " s") + "</b></div>";
        lines.forEach(function (l, i) {
          var p = l.pts, k = 0; while (k < p.length - 1 && p[k + 1][0] <= x) k++;
          if (p[p.length - 1][0] < x - 0.05 * (xs.max - xs.min) / 30) return;
          h += "<div><span>" + LX.esc((legend[i] || {}).label || "") + "</span><b>" + p[k][1].toFixed(2) + "</b></div>";
        });
        return h;
      };
      aria = "Line chart of the Plains Grid's frequency in hertz against time. The text version below gives the numbers.";
      P.render({ x: xs, y: { min: yr.min, max: yr.max, ticks: ticksHz(yr.min, yr.max), unit: "Hz" }, lines: lines, marks: marks, refs: refs, legend: legend, tip: tipFn, aria: aria }, animate);
    }

    function drawUri(animate) {
      var x0 = U.points[0][0], lo = 59.2, hi = 60.2, e = U.events[S_.uri];
      var pts = U.points.map(function (p) { return [clock(p[0]), p[1]]; });
      ttl.textContent = "ERCOT (Texas) frequency, 15 February 2021, 1:15–2:30 a.m.";
      chip("Time", e.at + " a.m."); chip("Frequency", hzEvent(e), e.hz < 59.45 ? "bad" : e.hz < 59.9 ? "warn" : ""); chip("Customer demand ordered off", mw(e.shedMW));
      var marks = U.events.slice(0, S_.uri + 1).map(function (ev, i) { return { x: clock(ev.at), y: ev.hz, color: i === S_.uri ? COL.uri : "var(--lx-ink-3)", above: ev.hz > 59.8 }; });
      var cut = clock(e.at), shown = pts.filter(function (p) { return p[0] <= cut; });
      P.render({ x: { min: clock("1:15"), max: clock("2:30"), ticks: [[clock("1:15"), "1:15"], [clock("1:30"), "1:30"], [clock("1:45"), "1:45"], [clock("2:00"), "2:00"], [clock("2:15"), "2:15"], [clock("2:30"), "2:30 a.m."]], ticksN: [[clock("1:15"), "1:15"], [clock("1:45"), "1:45"], [clock("2:15"), "2:15 a.m."]] },
        y: { min: lo, max: hi, ticks: ticksHz(lo, hi), unit: "Hz" },
        lines: [{ pts: shown, color: COL.uri, dots: true, anim: false }],
        refs: [{ y: 60, label: "60 Hz", below: true }, { y: 59.4, color: "var(--lx-warn)", dash: "5 4", label: "Generator timer · 59.4 Hz", labelN: "59.4 Hz", below: false }, { y: 59.3, color: COL.ufls, dash: "5 4", label: "Relays cut customers · 59.3 Hz", labelN: "59.3 Hz", below: true }],
        marks: marks, legend: [{ label: "Frequency readings in the official chronology", color: COL.uri }],
        tip: function (x) { var best = U.points.reduce(function (a, p) { return Math.abs(clock(p[0]) - x) < Math.abs(clock(a[0]) - x) ? p : a; }); return "<div><b>" + best[0] + " a.m.</b><span><b>" + best[1].toFixed(3) + " Hz</b></span></div>"; },
        aria: "Frequency readings on 15 February 2021 in Texas, from the FERC-NERC report's chronology. The text version below lists them." }, animate);
      // the text version: every reading, and the two moments the report gives only as a threshold crossing
      var list = H("ul", null, altBody), rows = U.points.map(function (p) { return [clock(p[0]), p[0] + " a.m.: " + p[1].toFixed(3) + " Hz"]; });
      U.events.forEach(function (ev) { if (ev.cross) rows.push([clock(ev.at) + 0.5, ev.at + " a.m.: " + hzEvent(ev) + " (a threshold crossing; the report gives no reading)"]); });
      rows.sort(function (a, b) { return a[0] - b[0]; }).forEach(function (r) { H("li", { text: r[1] }, list); });
      H("p", { class: "lx-hint", text: U.note }, altBody);
      return x0;
    }

    function setView(v, animate) { S_.view = v; draw(animate); }
    function enter(v, stage) { S_.ffr = false; S_.stage = stage; S_.view = v; draw(false); }

    // ---- the step cards
    var tryLow = false;
    var steps = [
      { text: "Seven in the evening on the Plains Grid, which runs at a [[frequency|frequency]] of 60 Hz: 60 electrical cycles each second. Prairie Town's combined-cycle plant, making " + G.tripMW + " MW, trips off. First, predict.",
        build: function (act, api) {
          enter("seconds", 0);
          LX.Predict(act, { id: "l3-first", q: PRED.q, options: PRED.options, answer: "spin", fresh: true, lockText: "Locked in. Now trip the plant.",
            onPick: function (p) { S_.pick = p; api.done(); } });
        } },
      { text: "Press Trip. The line shows the frequency with no controls acting: spinning machines slow together and hand over stored energy, and motors draw slightly less ([[load-relief|load relief]]).",
        build: function (act, api) {
          enter("seconds", 1);
          var b = H("button", { class: "lx-btn", type: "button", html: LX.icon("bolt") + "Trip the plant" }, act);
          function said() {
            var st = story(G, S_.inertia, S_.reserve), ok = S_.pick === "spin";
            api.saw((S_.pick ? (ok ? "You called it. " : "Not quite: you picked " + PRED.options.filter(function (o) { return o.value === S_.pick; })[0].label.toLowerCase() + ". ") : "") +
              "Frequency falls " + st.rocof.toFixed(2) + " Hz per second at first. This is [[inertia|inertia]] at work: with no controls acting, it would reach 59.3 Hz in " + sec1(st.hitT) + ".");
          }
          b.addEventListener("click", function () { S_.tripped = true; S_.view = "seconds"; draw(true); store(); b.disabled = true; b.textContent = "Tripped"; said(); api.done(); });
          if (S_.tripped) { b.disabled = true; b.textContent = "Tripped"; said(); api.done(); }
        } },
      { text: "Fewer spinning machines store less energy. Grids running mostly on wind and solar, which connect through [[inverter|inverters]], have less [[inertia|inertia]]. Slide it and watch the fall.",
        build: function (act, api) {
          S_.tripped = true; enter("seconds", 2);
          var s = LX.Slider(act, { label: "Inertia (stored spin)", color: COL.inertia, min: G.inertia.min, max: G.inertia.max, step: G.inertia.step, unit: "GW·s",
            hint: function () { return "1 GW·s is a gigawatt for one second: 1,000 MW·s of stored energy. Low: few large machines online. High: many."; },
            onChange: function (v) {
              S_.inertia = v; draw(false); store(); api.done();
              var a = story(G, v, S_.reserve);
              api.saw("At " + v + " GW·s it falls " + a.rocof.toFixed(2) + " Hz/s and would reach 59.3 Hz after " + sec1(a.hitT) + ". Inertia buys time; it does not stop the fall.");
            } });
          s.set(S_.inertia);
        } },
      { text: "Within seconds, while machines are still giving up stored energy, [[governor|governors]] on plants holding spare capacity open their valves. Switch them on and find the lowest point, the [[nadir|nadir]].",
        build: function (act, api) {
          S_.tripped = true; enter("seconds", 3);
          var b = H("button", { class: "lx-btn", type: "button", html: LX.icon("gauge") + "Switch on the governors" }, act);
          function said() {
            var st = story(G, S_.inertia, S_.reserve);
            if (st.ufls != null) api.saw("With only " + S_.reserve + " MW held back, governors could not stop the fall: it reaches 59.3 Hz after " + sec1(st.ufls) + ".", true);
            else if (st.sinking) api.saw("Governors slow the fall, but the " + S_.reserve + " MW reserve runs out: the frequency keeps sinking toward " + hz(60 - st.gap) + ".", true);
            else api.saw("The fall stops at " + hz(st.nadir.f) + " after " + sec1(st.nadir.t) + ", then levels off near " + hz(60 - st.gap) + ". [[primary-response|Primary response]] arrests the fall but does not restore 60 Hz.");
          }
          b.addEventListener("click", function () { S_.gov = true; S_.view = "seconds"; draw(true); store(); b.disabled = true; said(); api.done(); });
          if (S_.gov) { b.disabled = true; said(); api.done(); }
        } },
      { text: "Governors can only add what plants held back: the [[reserves|reserve]]. The plant that tripped was " + G.tripMW + " MW. Slide the reserve below that and see what happens.",
        build: function (act, api) {
          S_.tripped = true; S_.gov = true; enter("seconds", 4);
          function said(v) {
              var a = story(G, S_.inertia, v);
              if (a.ufls != null) api.saw("At " + v + " MW the fall reaches 59.3 Hz after " + sec1(a.ufls) + (a.late ? ", just past the chart" : "") + ". Relays cut " + mw(a.shedMW) + " of customers ([[ufls|under-frequency load shedding]]), the last line of defence, and frequency overshoots to " + hz(a.peak.f) + ".", true);
              else if (v < G.tripMW) api.saw("At " + v + " MW the frequency sinks to about " + hz(60 - a.gap) + ", and the reserve runs out before 60 Hz can return.", true);
              else api.saw("At " + v + " MW the fall stops at " + hz(a.nadir.f) + (tryLow ? ". Enough reserve keeps the relays out of it." : ". Now try less than " + G.tripMW + " MW."));
          }
          var s = LX.Slider(act, { label: "Reserve held back", color: COL.primary, min: G.reserve.min, max: G.reserve.max, step: G.reserve.step, unit: "MW",
            hint: function () { return "The rule of thumb: at least the largest plant that could trip."; },
            onChange: function (v) { S_.reserve = v; draw(false); store(); if (v < G.tripMW) tryLow = true; if (tryLow) api.done(); said(v); } });
          s.set(S_.reserve);
          if (tryLow) { api.done(); said(S_.reserve); }
        } },
      { text: "Governors stop the fall but leave the frequency low. Zoom out to ten minutes and switch on [[agc|automatic generation control (AGC)]], which raises reserve plants until 60 Hz returns.",
        build: function (act, api) {
          S_.tripped = true; S_.gov = true; enter(S_.agc ? "minutes" : "seconds", 5);
          var b = H("button", { class: "lx-btn", type: "button", html: LX.icon("clock") + "Zoom out and switch on AGC" }, act);
          var s = null;
          function said() {
            var a = story(G, S_.inertia, S_.reserve);
            if (a.ufls != null) { api.saw("Back to 60 Hz after " + min1(a.back) + ", but only because relays cut " + mw(a.shedMW) + " of customers; AGC then turned plants down. Try more reserve.", true); return; }
            api.saw(a.back != null ? "Back within " + G.backBandHz + " Hz of 60 after " + min1(a.back) + ", using " + mw(a.reserveUsed) + " of reserve. That reserve stays spent until operators rebuild it." :
              "With " + S_.reserve + " MW held, AGC runs out: still " + hz(a.end) + " after ten minutes. Operators must start more plants, or cut customers by hand.", a.back == null);
          }
          function on() {
            S_.agc = true; setView("minutes", true); b.disabled = true; said(); api.done();
            if (!s) { s = LX.Slider(act, { label: "Reserve held back", color: COL.primary, min: G.reserve.min, max: G.reserve.max, step: G.reserve.step, unit: "MW",
              hint: function () { return "Try it with less than " + G.tripMW + " MW."; }, onChange: function (v) { S_.reserve = v; draw(false); store(); said(); } }); s.set(S_.reserve); }
          }
          b.addEventListener("click", on);
          if (S_.agc) on();
        } },
      { text: "Batteries have no spinning mass, but their inverters can react within a fraction of a second. Inertia is now set low; add a battery set for [[fast-frequency-response|fast frequency response]].",
        build: function (act, api) {
          S_.inertia = G.lowInertia; S_.gov = true; S_.tripped = true; if (S_.reserve < G.tripMW) S_.reserve = G.reserve.start; enter("seconds", 6); store();
          H("p", { class: "lx-hint", text: "This step uses inertia " + G.lowInertia + " GW·s and a reserve of " + S_.reserve + " MW; the diagrams below follow." }, act);
          var seg = H("div", { class: "lx-seg", role: "group", "aria-label": "Battery" }, act);
          var off = H("button", { type: "button", "aria-pressed": S_.ffr ? "false" : "true", text: "No battery" }, seg);
          var on = H("button", { type: "button", "aria-pressed": S_.ffr ? "true" : "false", text: "Add a " + G.ffrMW + " MW battery" }, seg);
          function set(v) {
            S_.ffr = v; off.setAttribute("aria-pressed", v ? "false" : "true"); on.setAttribute("aria-pressed", v ? "true" : "false"); draw(v);
            if (v) {
              var a = simulate(G, { inertia: S_.inertia, reserve: S_.reserve, gov: true, tEnd: G.secondsWindow }), c = simulate(G, { inertia: S_.inertia, reserve: S_.reserve, gov: true, ffr: true, tEnd: G.secondsWindow });
              api.saw("At " + S_.inertia + " GW·s the lowest point rises from " + hz(a.nadir.f) + " to " + hz(c.nadir.f) + ". Fast inverter response can stand in for part of the missing inertia."); api.done();
            }
          }
          off.addEventListener("click", function () { set(false); }); on.addEventListener("click", function () { set(true); });
          if (S_.ffr) set(true);
        } },
      { text: "A real night: Texas, 15 February 2021, during Winter Storm Uri. Plants failed faster than reserves could replace them. Step through the most dangerous hour, from the official report.",
        build: function (act, api) {
          S_.uri = 0; enter("uri", 7);
          var card = H("div", { class: "w1-event", "aria-live": "polite" }, act);
          var row = H("div", { class: "lx-step-foot" }, act);
          var prev = H("button", { class: "lx-btn ghost small", type: "button", html: LX.icon("back") + "Earlier" }, row);
          var pos = H("span", { class: "lx-step-n" }, row);
          var nxt = H("button", { class: "lx-btn small", type: "button", html: "Later" + LX.icon("arrow") }, row);
          function show(i) {
            S_.uri = i; draw(false); var e = U.events[i];
            card.innerHTML = ""; H("p", { class: "w1-event-t", html: "<b>" + e.at + " a.m.</b> " + LX.esc(e.title) }, card); H("p", { text: e.text }, card);
            pos.textContent = (i + 1) + " of " + U.events.length; prev.disabled = i === 0; nxt.disabled = i === U.events.length - 1;
            if (i === U.events.length - 1) { api.done(); LX.progress.done(LESSON); api.saw("Below 59.4 Hz for " + U.below594 + " of the " + U.relayMinutes + " minutes allowed. The same layers you just used, at the scale of a state, with too little reserve."); }
          }
          prev.addEventListener("click", function () { show(Math.max(0, S_.uri - 1)); });
          nxt.addEventListener("click", function () { show(Math.min(U.events.length - 1, S_.uri + 1)); });
          show(0);
        } }
    ];
    var cards = LX.StepCards(live, { id: "l3-steps", steps: steps, onStep: function () { LX.emit("layout"); } });
    draw(false); store();
    // hooks for the screenshot script ("mid": one interaction done) and for curious readers in the console
    LX.demo(root, function (state) {   // standard states (core.js LX.demo) plus agc and uri
      if (state === "mid") { S_.tripped = true; S_.gov = true; S_.reserve = 30; tryLow = true; cards.go(4); }
      else if (state === "agc") { S_.tripped = true; S_.gov = true; S_.agc = true; cards.go(5); }
      else if (state === "uri") { S_.tripped = true; S_.gov = true; cards.go(7); }
      else return null;
      return { view: state };
    }, cards);
    root.lxModel = { model: model, data: D, state: function () { return S_; } };
    buildExplain(D);
  }

  // ---------------------------------------------------------------- the explain layer, with the reader's numbers
  function buildExplain(D) {
    var host = document.getElementById("l3-explain"); if (!host) return;
    host.innerHTML = ""; host.classList.add("is-live");
    var G = D.grid, U = D.uri;
    var chainBox = H("div", { class: "lx-xcard" }, host);
    function chain() {
      var c = LX.store.get("l3-case", null) || { inertia: G.inertia.start, reserve: G.reserve.start };
      var st = story(G, c.inertia, c.reserve);
      chainBox.innerHTML = "";
      LX.CausalChain(chainBox, {
        title: "Cause and effect: one plant trips",
        links: [
          { title: "A plant trips", text: "Supply is short in an instant.", value: "−" + G.tripMW + " MW" },
          { title: "Machines slow together", text: "Stored spin covers the gap for seconds.", value: st.rocof.toFixed(2) + " Hz/s at first" },
          { title: "Governors add power", text: "Plants holding reserve open their valves.", value: st.ufls != null ? "too little reserve" : st.sinking ? "reserve used up" : "lowest " + hz(st.nadir.f) },
          { title: st.ufls != null ? "Relays cut customers" : "Frequency levels off low", text: st.ufls != null ? "Automatic, at 59.3 Hz." : "The fall is stopped, not undone.", value: st.ufls != null ? mw(st.shedMW) : "near " + hz(60 - st.gap) },
          { title: "AGC restores 60 Hz", text: "Reserve plants are raised over minutes.", value: st.back != null ? min1(st.back) : "reserve used up" },
          { title: "Reserve rebuilt", text: "Operators start plants for the next trip.", value: "10 min to hours" }
        ],
        note: "Your settings: inertia " + c.inertia + " GW·s, reserve " + c.reserve + " MW. Change them in the steps above and the numbers here follow."
      });
    }
    chain(); LX.on("l3-change", chain);

    var row = H("div", { class: "lx-row2" }, host), c2 = H("div", { class: "lx-xcard" }, row), c3 = H("div", { class: "lx-xcard" }, row);
    function pathFor(inertia, reserve) {
      var st = story(G, inertia, reserve), p = ["trip", "inertia", "gov", "q1"];
      if (st.ufls != null) p.push("ufls", "agc", "end");
      else if (st.back != null) p.push("q2", "agc", "end");
      else p.push("q2", "ops", "agc", "end");
      return { path: p, st: st };
    }
    // the "Your settings" trace follows the reader's case: rebuilt on every change (l3-change), replayed if it is selected
    var b = pathFor(G.inertia.start, 30), traces = [{ label: "Your settings", path: [], text: "" }];
    function mineTrace() {
      var mine = LX.store.get("l3-case", null) || { inertia: G.inertia.start, reserve: G.reserve.start }, a = pathFor(mine.inertia, mine.reserve);
      traces[0].path = a.path;
      traces[0].text = "**Inertia " + mine.inertia + " GW·s, reserve " + mine.reserve + " MW:** " +
        (a.st.ufls != null ? "relays cut " + mw(a.st.shedMW) + "; " : a.st.sinking ? "levels off near " + hz(60 - a.st.gap) + "; " : "lowest " + hz(a.st.nadir.f) + "; ") +
        (a.st.back != null ? "60 Hz again after " + min1(a.st.back) + "." : "the reserve runs out, so operators must act.");
    }
    mineTrace();
    traces.push({ label: "Reserve 30 MW", path: b.path, text: "**Reserve 30 MW:** the fall reaches 59.3 Hz after " + sec1(b.st.ufls) + "; relays cut " + mw(b.st.shedMW) + " of customers." },
      { label: "Texas, 15 Feb 2021", path: ["trip", "inertia", "gov", "q1", "ufls", "ops", "agc", "end"], text: "**Uri:** lowest " + U.lowestHz + " Hz, yet relays near their 59.3 Hz setting tripped about " + mw(U.uflsTripMW) + " of load. Operators had already cut far more by hand: up to " + mw(U.peakShedMW) + " that day." });
    var fc = LX.Flowchart(c2, {
      title: "The order of response", lede: "The same layers respond after every trip, fastest first; in practice they overlap. Trace a case through them.",
      nodes: {
        trip: { t: "A plant trips", s: "supply falls short", k: "end" },
        inertia: { t: "Inertia slows the fall", tN: ["Inertia slows", "the fall"], s: "0–12 s · stored spin", sN: "0–12 s" },
        gov: { t: "Governors add power", tN: ["Governors", "add power"], s: "seconds · from reserve", sN: "seconds" },
        q1: { t: "Stopped above 59.3 Hz?", tN: ["Held above", "59.3 Hz?"], k: "q" },
        ufls: { t: "Relays cut customers", tN: ["Relays cut", "customers"], s: "automatic · last line", sN: "last line" },
        q2: { t: "Reserve enough for 60 Hz?", tN: ["Reserve", "enough?"], k: "q" },
        agc: { t: "AGC restores 60 Hz", tN: ["AGC restores", "60 Hz"], s: "1–10 min · from reserve", sN: "1–10 min" },
        ops: { t: "Operators act by hand", tN: ["Operators act", "by hand"], s: "start plants or cut customers", sN: "plants or cuts" },
        end: { t: "Rebuild the reserve", tN: ["Rebuild the", "reserve"], s: "10 min to hours", sN: "minutes to hours", k: "end" }
      },
      cols: 3, at: { trip: [1, 0], inertia: [1, 1], gov: [1, 2], q1: [1, 3], ufls: [2, 3], q2: [1, 4], ops: [0, 4], agc: [1, 5], end: [1, 6] },
      colsN: 2, atN: { trip: [0, 0], inertia: [0, 1], gov: [0, 2], q1: [0, 3], ufls: [1, 3], q2: [0, 4], ops: [1, 4], agc: [0, 5], end: [0, 6] },
      edges: [["trip", "inertia"], ["inertia", "gov"], ["gov", "q1"], ["q1", "q2", "yes"], ["q1", "ufls", "no"], ["ufls", "agc", null, { v: true, dN: "M323 310 H352 V494 H151" }],
              ["q2", "agc", "yes"], ["q2", "ops", "no"], ["ops", "agc", null, { v: true }], ["agc", "end"]],
      traces: traces, sel: 0
    });
    LX.on("l3-change", function () {
      mineTrace();
      var first = c2.querySelector(".lx-ftrace button");
      if (first && first.getAttribute("aria-pressed") === "true") fc.run(0, true);
    });
    var L = D.layers;
    LX.CompareTable(c3, {
      title: "Four layers of defence",
      columns: [{ key: "name", label: "Layer", main: true }, { key: "time", label: "Typical time scale" }, { key: "from", label: "Where the power comes from" }],
      rows: L.rows.map(function (r) { return { key: r.key, color: { inertia: "var(--lx-ink-3)", primary: "var(--lx-accent)", secondary: "var(--lx-good)", tertiary: "var(--lx-tier-3)" }[r.key], name: r.name, note: r.who, time: r.time, from: r.from }; }),
      sorts: [{ label: "Fastest first", order: ["inertia", "primary", "secondary", "tertiary"], note: "Typical time scales from NERC's control continuum (" + L.asOf + "). The layers overlap: governors start while machines still give up stored energy." }]
    });
  }

  LX.mount("balancing", function (live, data, root) { view(live, data, root); });
})();
