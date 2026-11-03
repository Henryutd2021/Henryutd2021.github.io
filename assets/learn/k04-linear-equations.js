// k04-linear-equations.js — Toolbox K4, "Linear equations and inequalities" (step cards, Learn W1, 2026-11-02).
//
// Just-in-time math for B1 (From algebra to a linear program). One interactive, the rule plane: a two-variable plane
// where each rule a1·x + a2·y (≤ | = | ≥) b is a line plus a side, the plans that pass every rule are shaded, and a
// test plan (two sliders, or a tap on the plane) is checked against each rule. Six step cards, then a practice drill.
//
// Data: assets/learn/data/town.json and town_year.json (Prairie Town, as in lesson 0). townDay() cuts and scales the day
// exactly as lesson 0's prepare() does (grid-operator.js; the Node test checks they agree), so 19:00 on 3 September 2025
// reads demand 331 MW, wind 72 MW, solar 14 MW and a gas need of 145 MW. Plant limits in the rules are Prairie Town's
// (combined-cycle 150 MW, ramp 40 MW/h; peaker 100 MW); the 90 MW the combined-cycle made at 18:00 is a stated
// assumption of the story (illustrative), so this hour it can reach at most 130 MW. The ramp limits only the climb (the
// drop is left out, and the page says so); gas above the 145 MW need is matched by spilling wind or sun, and the test
// checks that the 86 MW of wind and sun at 19:00 cover the most surplus any plan in the region makes (85 MW).
//
// Pure model (exported for Node): townDay, story(), drill items, and the rule algebra (le, holds, clip, region,
// verticesOf) re-exported from the shared LX.lp2; the plane is LX.LPPlane (both in components/lpplane.js). The number box
// is LX.NumAnswer and the practice drill LX.Drill (components/numanswer.js, drill.js; rng and the seeded series from there).
(function () {
  "use strict";

  // ---------------------------------------------------------------- the real day, scaled as in lesson 0
  function townDay(town, year, key) {
    var sc = town.scenarios[key || "lesson0"], f = town.fleet;
    var t0 = Date.parse(year.start_utc + "Z"), d0 = Date.parse(sc.date + "T00:00:00Z");
    var i = Math.round((d0 - t0) / 3600000) + 1 - (sc.utcOffsetHours || 0);
    var cut = function (a) { return a.slice(i, i + 24); };
    var wind = cut(year.wind).map(function (v) { return Math.round(v / 1000 * f.wind.mw); });
    var solar = cut(year.solar).map(function (v) { return Math.round(v / 1000 * f.solar.mw); });
    var raw = cut(year.demand).map(function (v) { return v / 1000 * sc.demandPeakMW; });
    var need = raw.map(function (v, t) { return Math.round((v - f.nuclear.mw - wind[t] - solar[t]) / sc.step) * sc.step; });
    var demand = need.map(function (n, t) { return n + f.nuclear.mw + wind[t] + solar[t]; });
    return { date: sc.date, dateLabel: sc.dateLabel, fleet: f, demand: demand, wind: wind, solar: solar, need: need };
  }

  // ---------------------------------------------------------------- two-variable linear rules: LX.lp2 (components/lpplane.js)
  // a rule: {a: [a1, a2], op: "<=" | ">=" | "=", b}
  var LP = (typeof window !== "undefined" && window.LX && window.LX.lp2) || require("./components/lpplane.js");
  var holds = LP.holds, region = LP.region, verticesOf = LP.verticesOf;
  var DR = (typeof window !== "undefined" && window.LX && window.LX.Drill) || require("./components/drill.js");

  // ---------------------------------------------------------------- the story numbers (19:00, 3 September 2025)
  var HOUR = 19, PREV_CC = 90;
  function story(town, year) {
    var D = townDay(town, year), f = D.fleet, t = HOUR;
    var s = { D: D, t: t, demand: D.demand[t], nuclear: f.nuclear.mw, wind: D.wind[t], solar: D.solar[t], need: D.need[t],
              ccMax: f.cc.mw, ramp: f.cc.ramp, prevCC: PREV_CC, pkMax: f.peaker.mw };
    s.reach = Math.min(f.cc.mw, PREV_CC + f.cc.ramp);
    s.spillable = s.wind + s.solar; s.maxSurplus = s.reach + s.pkMax - s.need;
    s.cover = { a: [1, 1], op: ">=", b: s.need, key: "cover" };
    s.limits = [
      { a: [1, 0], op: "<=", b: s.reach, key: "ramp", words: "x ≤ " + s.reach },
      { a: [0, 1], op: "<=", b: s.pkMax, key: "pk", words: "y ≤ " + s.pkMax },
      { a: [1, 0], op: ">=", b: 0, key: "x0", words: "x ≥ 0" },
      { a: [0, 1], op: ">=", b: 0, key: "y0", words: "y ≥ 0" }];
    s.view = [0, 160, 0, 160];
    s.triangle = verticesOf(region([s.cover].concat(s.limits), s.view));
    return s;
  }

  // ---------------------------------------------------------------- practice drill items (seeded by LX.Drill, so tests can replay them)
  var KINDS = ["gap", "solve", "flip", "test", "words"];
  var WORDS = [["at most", "≤"], ["no more than", "≤"], ["at least", "≥"], ["no less than", "≥"], ["exactly", "="], ["must not fall below", "≥"], ["must not exceed", "≤"]];
  function drillItem(D, k, r) {
    var kind = KINDS[k % KINDS.length], pick = function (n) { return Math.floor(r() * n); };
    if (kind === "gap") {
      var t = pick(24), f = D.fleet;
      return { kind: kind, q: (t < 10 ? "0" : "") + t + ":00 on " + D.dateLabel + ": demand " + D.demand[t] + " MW, nuclear " + f.nuclear.mw + ", wind " + D.wind[t] + ", solar " + D.solar[t] + ". Gas g = ? MW",
               answer: D.need[t], unit: "MW", why: "g = " + D.demand[t] + " − " + f.nuclear.mw + " − " + D.wind[t] + " − " + D.solar[t] + " = " + D.need[t] + " MW." };
    }
    if (kind === "solve") {
      var a = 2 + pick(8), x = 5 * (1 + pick(30)), m = 10 * pick(10), n = a * x + m;
      return { kind: kind, q: "Solve " + a + "x + " + m + " = " + n + ". x = ?", answer: x, why: "Subtract " + m + ", then divide by " + a + ": x = (" + n + " − " + m + ") / " + a + " = " + x + "." };
    }
    if (kind === "flip") {
      var a2 = 2 + pick(5), b2 = a2 * (1 + pick(20));
      return { kind: kind, q: "−" + a2 + "x ≤ " + b2 + " is the same as …", choices: ["x ≥ −" + (b2 / a2), "x ≤ −" + (b2 / a2), "x ≥ " + (b2 / a2), "x ≤ " + (b2 / a2)], answer: 0,
               why: "Divide both sides by −" + a2 + " and flip the sign: x ≥ −" + (b2 / a2) + "." };
    }
    if (kind === "test") {
      var px = 10 * (2 + pick(14)), py = 10 * pick(10), c = 10 * (8 + pick(12)), op = r() < 0.5 ? "≤" : "≥";
      var v = px + py, pass = op === "≤" ? v <= c : v >= c;
      return { kind: kind, q: "Does the plan x = " + px + ", y = " + py + " pass x + y " + op + " " + c + "?", choices: ["Yes", "No"], answer: pass ? 0 : 1,
               why: px + " + " + py + " = " + v + (pass ? " passes " : " fails ") + op + " " + c + "." };
    }
    var w = WORDS[pick(WORDS.length)], amt = 10 * (1 + pick(20));
    return { kind: kind, q: "“The line can carry " + w[0] + " " + amt + " MW.” Which sign?", choices: ["≤", "≥", "="], answer: ["≤", "≥", "="].indexOf(w[1]),
             why: "“" + w[0] + "” means " + w[1] + ": flow " + w[1] + " " + amt + " MW." };
  }
  function drill(D, seed, n) { return DR.series(function (k, r) { return drillItem(D, k, r); }, seed, n); }

  // ---------------------------------------------------------------- the explain layer's two worked inequalities
  // a·x + m <= n with a != 0: x <= (n − m)/a for a > 0; divide by a negative a and the sign flips. spot: a value to
  // spot-check (one value only checks the arithmetic, not the whole solution set)
  var EXAMPLES = [{ a: 2, m: 10, n: 50, spot: 10 }, { a: -2, m: 0, n: 6, spot: 0 }];
  function sgn(v) { return (v < 0 ? "−" : "") + Math.abs(v); }
  function solveLe(e) { return { op: e.a < 0 ? ">=" : "<=", bound: (e.n - e.m) / e.a }; }
  function traces() {
    return EXAMPLES.map(function (e) {
      var s = solveLe(e), sym = s.op === "<=" ? "≤" : "≥", ax = (e.a < 0 ? "−" : "") + Math.abs(e.a) + "x", lhs = e.a * e.spot + e.m;
      var label = ax + (e.m ? " + " + e.m : "") + " ≤ " + e.n;
      var first = e.m ? ax + " ≤ " + (e.n - e.m) + ", so x " + sym + " " + sgn(s.bound) + "." : "Divide by " + sgn(e.a) + " and flip: x " + sym + " " + sgn(s.bound) + ".";
      var spot = "Spot-check x = " + e.spot + ": " + sgn(e.a) + " × " + e.spot + (e.m ? " + " + e.m : "") + " = " + sgn(lhs) + " ≤ " + e.n + ".";
      return { e: e, op: s.op, bound: s.bound, spotValue: lhs, label: label, path: ["start", "move", "q", e.a < 0 ? "flip" : "keep", "end"], text: "**" + first + "** " + spot };
    });
  }

  var model = { townDay: townDay, le: LP.le, lhs: LP.lhs, holds: holds, clip: LP.clip, region: region, verticesOf: verticesOf, story: story,
                drill: drill, drillItem: drillItem, rng: DR.rng, traces: traces, solveLe: solveLe, EXAMPLES: EXAMPLES, HOUR: HOUR, PREV_CC: PREV_CC };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;

  // ================================================================ view
  var LX = window.LX, H = LX.H, S = LX.S;
  var OPS = { "<=": "≤", ">=": "≥", "=": "=" };
  function fmtRule(r, xs, ys) {
    var t = [], nm = [xs || "x", ys || "y"];
    [0, 1].forEach(function (j) {
      var c = r.a[j]; if (!c) return;
      var sgn = c < 0 ? "−" : "+", mag = Math.abs(c) === 1 ? "" : String(Math.abs(c));
      t.push((t.length ? " " + sgn + " " : (c < 0 ? "−" : "")) + mag + nm[j]);
    });
    return (t.join("") || "0") + " " + OPS[r.op] + " " + (r.b < 0 ? "−" + Math.abs(r.b) : r.b);
  }

  function seg(host, labels, sel, onPick, aria) {
    var g = H("div", { class: "lx-seg", role: "group", "aria-label": aria || "Choose" }, host), bs = [];
    labels.forEach(function (l, i) {
      var b = H("button", { type: "button", "aria-pressed": i === sel ? "true" : "false", text: l }, g);
      b.addEventListener("click", function () { bs.forEach(function (x, j) { x.setAttribute("aria-pressed", j === i ? "true" : "false"); }); onPick(i); });
      bs.push(b);
    });
    return { el: g, set: function (i) { bs.forEach(function (x, j) { x.setAttribute("aria-pressed", j === i ? "true" : "false"); }); } };
  }
  function textAlt(host, title, items) {
    var d = H("details", { class: "lx-textalt" }, host); H("summary", { text: title }, d);
    var ul = H("ul", null, d); items.forEach(function (t) { H("li", { html: LX.rich(t) }, ul); });
    return d;
  }

  function view(live, data, root) {
    var s = story(data.town, data.town_year), D = s.D;
    var cover = s.cover, lim = s.limits;
    var steps = [];
    var hh = (s.t < 10 ? "0" : "") + s.t + ":00";
    var done = {};
    LX.store.set("k4-story", { need: s.need, reach: s.reach });

    // ---- step 1: an equation is a balance
    steps.push({
      text: "Prairie Town at " + hh + " on " + D.dateLabel + ": demand " + s.demand + " [[megawatt|MW]]. Nuclear makes " + s.nuclear + " MW, wind " + s.wind + " and solar " + s.solar + ". Gas covers the rest. Solve for g.",
      build: function (act, api) {
        H("p", { class: "k4-eq", html: s.nuclear + " + " + s.wind + " + " + s.solar + " + <i>g</i> = " + s.demand }, act);
        var tries = 0;
        LX.NumAnswer(act, { label: "g =", unit: "MW", onCheck: function (v) {
          tries++;
          if (v === s.need) { api.done(); api.saw("g = " + s.demand + " − " + s.nuclear + " − " + s.wind + " − " + s.solar + " = " + s.need + " MW. Do the same to both sides and the balance holds."); }
          else api.saw(tries < 2 ? "Not yet. Take the known parts away from both sides." : "Subtract each known part from " + s.demand + ": " + s.demand + " − " + s.nuclear + " − " + s.wind + " − " + s.solar + ".", true);
        } });
      }
    });

    // ---- step 2: two unknowns, a line of answers
    steps.push({
      text: "Gas comes from two plants: x MW from the [[combined-cycle|combined-cycle plant]] and y MW from the [[peaker|peaker]], with x + y = " + s.need + ". Slide x to four positions and watch y follow.",
      build: function (act, api) {
        var pl = LX.LPPlane(act, { view: s.view, ticks: [0, 40, 80, 120, 160], xLabel: "x: combined-cycle plant, MW", yLabel: "y: peaker, MW",
                              aria: "Plans x and y with x + y = " + s.need + ": every answer lies on one straight line." });
        var seen = {}, sl = LX.Slider(act, { label: "x, combined-cycle", color: "var(--lx-cc)", max: s.need, step: 5, onChange: draw });
        var now = H("p", { class: "k4-test", "aria-live": "polite" }, act), prog = H("p", { class: "k4-prog" }, act);
        sl.set(60);
        function draw(x) {
          x = x == null ? sl.val() : x; var y = s.need - x; seen[x] = 1;
          var n = Object.keys(seen).length;
          now.innerHTML = "x = <b>" + x + " MW</b>, so y = " + s.need + " − " + x + " = <b>" + y + " MW</b>.";
          prog.textContent = n >= 4 ? "Four positions tried: Next is open." : "Positions tried: " + n + " of 4.";
          pl.clear(); pl.rule({ a: [1, 1], op: "=", b: s.need }, { label: "x + y = " + s.need, cls: "on" });
          Object.keys(seen).forEach(function (k) { pl.point([+k, s.need - k], { r: 4, cls: "trail" }); });
          pl.point([x, y], { label: "x = " + x + ", y = " + y });
          if (Object.keys(seen).length >= 4) { api.done(); api.saw("One equation with two unknowns has a whole line of answers, from (0, " + s.need + ") to (" + s.need + ", 0). More rules, or a goal, must pick one."); }
        }
        draw(60);
        textAlt(act, "Text version", ["The line x + y = " + s.need + " runs from x = 0, y = " + s.need + " to x = " + s.need + ", y = 0.", "Each slider position is one answer; every answer lies on the line."]);
      }
    });

    // ---- step 3: words to signs
    var PHRASES = [
      ["The combined-cycle plant makes at most " + s.ccMax + " MW.", 0],
      ["Gas must cover at least " + s.need + " MW.", 1],
      ["It can rise no more than " + s.ramp + " MW in one hour.", 0],
      ["Nuclear runs at exactly " + s.nuclear + " MW all day.", 2],
      ["A plant's output must not fall below 0 MW.", 1]];
    steps.push({
      text: "Rules arrive as words. Pick the sign each sentence means: ≤ (at most), ≥ (at least) or = (exactly).",
      build: function (act, api) {
        var right = {}, list = H("div", { class: "k4-words" }, act);
        PHRASES.forEach(function (p, i) {
          var row = H("div", { class: "k4-word" }, list); H("p", { text: p[0] }, row);
          var mark = H("span", { class: "k4-mark", "aria-live": "polite" }, row);
          seg(row, ["≤", "≥", "="], -1, function (k) {
            right[i] = k === p[1]; mark.textContent = right[i] ? "Right" : "Not quite"; mark.className = "k4-mark " + (right[i] ? "good" : "bad");
            if (PHRASES.every(function (q, j) { return right[j]; })) { api.done(); api.saw("At most is ≤, at least is ≥, exactly is =. “Must not fall below 0” is ≥ too: a floor rather than a ceiling."); }
          }, "Sign for: " + p[0]);
        });
      }
    });

    // ---- step 4: an inequality is a half-plane
    steps.push({
      text: "An [[inequality|inequality]] keeps a whole side of its line. Switch the " + s.need + " MW rule from ≥ to ≤, then move the test plan across the line.",
      build: function (act, api) {
        var op = ">=", tried = { ">=": 1 }, moved = 0;
        var top = H("div", { class: "k4-ctl" }, act);
        H("span", { class: "k4-lab", text: "x + y" }, top);
        seg(top, ["≤", "=", "≥"], 2, function (i) { op = ["<=", "=", ">="][i]; tried[op] = 1; draw(); }, "Sign of the rule");
        H("span", { class: "k4-lab", text: String(s.need) }, top);
        var pl = LX.LPPlane(act, { view: s.view, ticks: [0, 40, 80, 120, 160], xLabel: "x: combined-cycle plant, MW", yLabel: "y: peaker, MW", aria: "The rule x + y and a test plan." });
        var out = H("p", { class: "k4-test", "aria-live": "polite" }, act), prog = H("p", { class: "k4-prog" }, act);
        var p = [40, 40];
        var sx = LX.Slider(act, { label: "Test plan x", color: "var(--lx-cc)", max: 160, step: 5, onChange: function (v) { p[0] = v; moved++; draw(); } });
        var sy = LX.Slider(act, { label: "Test plan y", color: "var(--lx-pk)", max: 160, step: 5, onChange: function (v) { p[1] = v; moved++; draw(); } });
        sx.set(p[0]); sy.set(p[1]);
        pl.onPick(function (q) { p = q; sx.set(q[0]); sy.set(q[1]); moved++; draw(); });
        function draw() {
          var r = { a: [1, 1], op: op, b: s.need }, ok = holds(r, p);
          pl.clear(); pl.region([r, { a: [1, 0], op: ">=", b: 0 }, { a: [0, 1], op: ">=", b: 0 }]); pl.rule(r, { label: fmtRule(r), cls: "on" });
          pl.point(p, { cls: ok ? "good" : "bad", label: ok ? "passes" : "fails" });
          out.innerHTML = "Test plan: x + y = " + p[0] + " + " + p[1] + " = <b>" + (p[0] + p[1]) + "</b>. Is that " + OPS[op] + " " + s.need + "? <b>" + (ok ? "Yes: it passes." : "No: it fails.") + "</b>";
          var left = [tried["<="] ? null : "switch the sign to ≤", moved >= 1 ? null : "move the test plan"].filter(Boolean);
          prog.textContent = left.length ? "Still to do: " + left.join("; ") + "." : "Both done: Next is open.";
          if (!left.length) { api.done(); api.saw("With ≥ the plans on the far side of the line pass; with ≤ the near side; with = only the line itself. The line always belongs to ≤ and ≥."); }
        }
        draw();
        textAlt(act, "Text version", ["The line x + y = " + s.need + " splits the plane in two.", "x + y ≥ " + s.need + " keeps the side away from the origin, the point (0, 0); x + y ≤ " + s.need + " keeps the side with the origin, and = keeps only the line."]);
      }
    });

    // ---- step 5: multiply by a negative and flip
    var FORMS = [
      { r: { a: [-1, -1], op: "<=", b: -s.need }, ok: true, why: "Multiplying by −1 flips ≥ into ≤: the same plans pass." },
      { r: { a: [-1, -1], op: ">=", b: -s.need }, ok: false, why: "The sign did not flip, so this keeps the other side." },
      { r: { a: [1, 1], op: "<=", b: s.need }, ok: false, why: "Only the sign changed: this is the opposite rule." },
      { r: { a: [-1, -1], op: "<=", b: s.need }, ok: false, why: "The right-hand side must be multiplied by −1 too." }];
    steps.push({
      text: "One common solver form writes every inequality one way round, as ≤ (B1 uses it). Multiplying both sides by a negative number flips the sign. Which line is the same rule as x + y ≥ " + s.need + "?",
      build: function (act, api) {
        var pl = null, row = H("div", { class: "lx-choices-row k4-forms", role: "group", "aria-label": "Candidate forms" }, act), btns = [];
        FORMS.forEach(function (F, i) {
          var b = H("button", { type: "button", class: "lx-choice", "aria-pressed": "false", text: fmtRule(F.r) }, row);
          b.addEventListener("click", function () {
            btns.forEach(function (x, j) { x.setAttribute("aria-pressed", j === i ? "true" : "false"); x.classList.toggle("right", j === i && F.ok); x.classList.toggle("wrong", j === i && !F.ok); });
            draw(F.r); said.textContent = fmtRule(F.r) + " keeps the side " + (holds(F.r, [0, 0]) ? "with" : "away from") + " the origin: " + (F.ok ? "the same plans as x + y ≥ " + s.need + "." : "not the plans x + y ≥ " + s.need + " keeps.");
            if (F.ok) { api.done(); api.saw("−x − y ≤ −" + s.need + " keeps exactly the same side. Multiply by −1 again and you are back at x + y ≥ " + s.need + "."); }
            else api.saw(F.why, true);
          });
          btns.push(b);
        });
        pl = LX.LPPlane(act, { view: s.view, ticks: [0, 40, 80, 120, 160], xLabel: "x: combined-cycle plant, MW", yLabel: "y: peaker, MW", aria: "The original rule and the chosen form, shaded." });
        var said = H("p", { class: "k4-test", "aria-live": "polite", text: "Light shading: x + y ≥ " + s.need + " keeps the side away from the origin. Pick a line to shade its side." }, act);
        function draw(r) {
          pl.clear();
          var nn = [{ a: [1, 0], op: ">=", b: 0 }, { a: [0, 1], op: ">=", b: 0 }];
          pl.region([cover].concat(nn), "ghost"); pl.rule(cover, { label: "x + y ≥ " + s.need });
          if (r) { pl.region([r].concat(nn), "pick"); }
        }
        draw(null);
      }
    });

    // ---- step 6: several rules at once
    steps.push({
      text: "A model's rules all hold at once. Switch on the peaker's size and the [[ramp-rate|ramp]] limit; x ≥ 0 and y ≥ 0 are always on. The plans that pass every rule form the [[feasible-region|feasible region]].",
      build: function (act, api) {
        var on = { cover: true, x0: true, y0: true };
        var chips = H("div", { class: "k4-chips", role: "group", "aria-label": "Rules" }, act);
        var LIM = [[lim[0], "x ≤ " + s.reach + " (ramp limit)"], [lim[1], "y ≤ " + s.pkMax + " (peaker size)"]];
        LIM.forEach(function (L) {
          var b = H("button", { type: "button", class: "lx-chip", "aria-pressed": "false" }, chips); H("i", { style: "--c:var(--lx-accent)" }, b); H("span", { text: L[1] }, b);
          b.addEventListener("click", function () { on[L[0].key] = !on[L[0].key]; b.setAttribute("aria-pressed", on[L[0].key] ? "true" : "false"); draw(); });
        });
        H("span", { class: "k4-fixed", text: "Always on: x ≥ 0, y ≥ 0 (the plane starts at 0)" }, chips);
        H("p", { class: "k4-prog", text: "Ramp: " + s.prevCC + " MW + " + s.ramp + " MW/h × 1 h = " + s.reach + " MW, the most x can reach this hour." }, act);
        var pl = LX.LPPlane(act, { view: s.view, ticks: [0, 40, 80, 120, 160], xLabel: "x: combined-cycle plant, MW", yLabel: "y: peaker, MW", aria: "Rules switched on and the region that passes them all." });
        var out = H("p", { class: "k4-test", "aria-live": "polite" }, act);
        function draw() {
          var rules = [cover].concat(lim.filter(function (r) { return on[r.key]; }));
          pl.clear(); var P = pl.region(rules);
          rules.forEach(function (r) { pl.rule(r, { label: r.b === 0 ? null : fmtRule(r), cls: "on" }); });
          var all = lim.every(function (r) { return on[r.key]; });
          out.textContent = all ? "Every rule is on: the feasible region is a triangle." : (rules.length - 3) + " of " + LIM.length + " plant limits on.";
          if (all) {
            s.triangle.forEach(function (v) { pl.point(v, { r: 5, label: "(" + v[0] + ", " + v[1] + ")" }); });
            api.done(); api.saw("The plans that pass every rule form a triangle with corners " + s.triangle.map(function (v) { return "(" + v[0] + ", " + v[1] + ")"; }).join(", ") + ". Above the line, gas makes more than " + s.need + " MW; the extra is matched by spilling wind or sun.");
          }
          return P;
        }
        draw();
        textAlt(act, "Text version", ["Rules: x + y ≥ " + s.need + ", x ≤ " + s.reach + ", y ≤ " + s.pkMax + ", x ≥ 0, y ≥ 0.", "With all of them on, the plans that pass form a triangle with corners " + s.triangle.map(function (v) { return "(" + v[0] + ", " + v[1] + ")"; }).join(", ") + ".",
          "The ramp rule limits only the climb from " + s.prevCC + " MW; how fast the plant can drop is left out here.",
          "Wind (" + s.wind + " MW) and sun (" + s.solar + " MW) are what the weather allows. A plan above the line makes up to " + s.maxSurplus + " MW more gas than needed, matched by spilling some of them."]);
      }
    });

    var cards = LX.StepCards(live, { id: "k4-steps", steps: steps, onStep: function () { LX.emit("layout"); } });
    LX.demo(root, function (state) {   // core.js LX.demo: "mid" = step 4 with a test plan, "region" = step 6
      if (state !== "mid" && state !== "region") return null;
      var k = state === "region" ? 5 : 3; cards.go(k);
      if (state === "region") live.querySelectorAll(".k4-chips .lx-chip").forEach(function (b) { b.click(); });
      return { view: "step " + (k + 1) };
    }, cards);

    explain(s);
    drillView(D);
  }

  function explain(s) {
    var x = document.getElementById("k4-explain"); if (!x) return; x.innerHTML = "";
    LX.CompareTable(H("div", { class: "lx-xcard w1h-stack" }, x), {
      title: "Equation or inequality?",
      columns: [{ key: "name", label: "Sign", main: true }, { key: "words", label: "In words" }, { key: "pic", label: "On the plane", phoneHide: true }, { key: "model", label: "In a model" }],
      rows: [
        { key: "eq", color: "var(--lx-ink)", name: "=", note: "equation", words: "exactly", pic: "the line only", model: "balance: supply equals demand" },
        { key: "le", color: "var(--lx-accent)", name: "≤ or ≥", note: "inequality", words: "at most, at least", pic: "the line and one side", model: "limits: plant size, ramp, budgets" },
        { key: "lt", color: "var(--lx-ink-3)", name: "< or >", note: "strict", words: "less than, more than", pic: "one side, without the line", model: "avoided: a best plan may not exist" }]
    });
    LX.Flowchart(H("div", { class: "lx-xcard" }, x), {
      title: "Solve a linear inequality", lede: "a, m and n stand for known numbers, and a is not 0. The same moves as an equation, with one extra question. Trace two examples.",
      nodes: {
        start: { t: "a·x + m ≤ n", s: "a ≠ 0", k: "end" },
        move: { t: "Move m across", s: "a·x ≤ n − m" },
        q: { t: "Is a negative?", tN: ["Is a", "negative?"], k: "q" },
        flip: { t: "Divide by a, flip", s: "x ≥ (n − m) / a", sN: "x ≥ (n − m)/a" },
        keep: { t: "Divide by a", s: "x ≤ (n − m) / a", sN: "x ≤ (n − m)/a" },
        end: { t: "Spot-check one value", tN: ["Spot-check", "one value"], k: "end" }
      },
      cols: 3, at: { start: [1, 0], move: [1, 1], q: [1, 2], flip: [0, 3], keep: [2, 3], end: [1, 4] },
      colsN: 2, atN: { start: [0.5, 0], move: [0.5, 1], q: [0.5, 2], flip: [0, 3], keep: [1, 3], end: [0.5, 4] },
      edges: [["start", "move"], ["move", "q"], ["q", "flip", "yes"], ["q", "keep", "no"], ["flip", "end", null, { v: true }], ["keep", "end", null, { v: true }]],
      traces: traces().map(function (t) { return { label: t.label, path: t.path, text: t.text }; }),
      sel: 1
    });
  }

  // ---- practice drill: a seeded stream of short items with instant feedback (LX.Drill; this visit only). As before the
  // promotion, focus stays on "Next item"; since the W2 integration an empty box asks for a number (as in K1 to K3)
  // instead of counting as a wrong answer.
  function drillView(D) {
    var host = document.getElementById("k4-drill"); if (!host) return; host.innerHTML = "";
    LX.Drill(host, { hint: "Five kinds of item in rotation, new numbers each time. Aim for ten in a row.", focus: false, empty: "Type a number first.",
                     item: function (k, r) { return drillItem(D, k, r); } });
  }

  LX.mount("k04", function (live, data, root) { view(live, data, root); });
})();
