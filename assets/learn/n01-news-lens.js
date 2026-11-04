// n01-news-lens.js — Lesson N1, "How do you read an energy headline like a researcher?" (lens type, step cards; 2026-11-02).
//
// Data: assets/learn/data/n01-news-lens.json — the seven lens questions, three worked stories (paraphrased headlines,
// tagged phrases, a researcher's annotation, a back-of-envelope check, a model take, primary sources with dates), the
// units-or-scale spotter and the evidence ladder. Every real number on the page lives in that file with its source.
//
// What the reader does (step cards): open the seven questions; for each story tag its highlighted phrases with the
// question they raise (the "dissector"), name the question the story leaves unanswered, and compare with a researcher's
// notes; run one check with units per story (the "envelope": energy to power, power to energy, the evidence clock);
// judge six sentences for units or scale errors; write a three-sentence take. The explain layer is a reusable checklist
// and the evidence ladder (announced ... at design output), with the stories' claims placed on it.
//
// Shared components (promoted from this lesson in W1): LX.PhraseTagger (components/tagger.js, the dissector),
// LX.UnitChain and LX.EvidenceClock (unitchain.js, the envelope checks), LX.Checklist (checklist.js) and
// LX.EvidenceLadder (evidence.js). The lesson-local CSS left (the lens cards, the spotter, the take) is injected once by
// injectCSS() below, using only the --lx-* tokens, so day and night both work.
//
// The pure model is exported for Node (_tests/learn/test_n01-news-lens.js checks every number the page states); its
// phrase scoring and ladder check are the shared components' own (window.LX in the page, the component files in Node).
// No-JS fallback: the stories and notes are written into the page by scripts/learn_n01_fallback.js; the worked checks,
// the spotter's answers and the ladder placements by staticChecks() below, through
// `node _tests/learn/test_n01-news-lens.js --write` (the test checks that the page and this function agree).
(function () {
  "use strict";

  // ---------------------------------------------------------------- pure model
  var HOURS_PER_YEAR = 8760;
  // the shared components' pure parts: window.LX in the page (learn.js loads first), the component files in Node
  function shared(name, file) {
    if (typeof window !== "undefined" && window.LX && window.LX[name]) return window.LX[name];
    return require("./components/" + file);
  }
  function phrases(story) { return shared("PhraseTagger", "tagger.js").phrases(story); }
  // a reader's tag for one phrase against the researcher's: "same" (the main tag), "fair" (also valid), "other" or "none"
  function judge(ph, tag) { return shared("PhraseTagger", "tagger.js").judge(ph, tag); }
  function score(story, picks) { return shared("PhraseTagger", "tagger.js").score(story, picks); }
  // energy over a year (TWh) -> average power (GW); a connection need at an assumed average use (%)
  function averageGW(twh, hours) { return twh * 1000 / (hours || HOURS_PER_YEAR); }
  function connectionGW(twh, utilPct, hours) { return averageGW(twh, hours) / (utilPct / 100); }
  // power (GW) x duration (h) -> energy (GWh); minutes of average national use that energy would cover
  function storedGWh(gw, h) { return gw * h; }
  function minutesOfUse(gwh, nationalTWh, hours) { return gwh / averageGW(nationalTWh, hours) * 60; }
  function days(a, b) { return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000); }
  function ladderOK(item, choice) { return shared("EvidenceLadder", "evidence.js").check(item, choice); }
  // a three-sentence take as its three labelled parts (claim; what would change my mind; confidence). Sentences end at
  // ". " before a capital letter, so "U.S. data" is not a break.
  function takeParts(take) {
    var s = take.split(/(?<=[.!?])\s+(?=[A-Z])/);
    return [{ k: "Claim", v: s[0] }, { k: "What would change my mind", v: s[1] || "" }, { k: "Confidence", v: (s[2] || "").replace(/^Confidence:\s*(\w)/, function (m, c) { return c.toUpperCase(); }) }];
  }
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var f0 = function (v) { return Math.round(v).toLocaleString("en-US"); };
  var f1 = function (v) { return (Math.round(v * 10) / 10).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }); };
  // the no-JS version of the three checks, the spotter and the ladder, as HTML (written into the page by the test's --write)
  function staticChecks(D) {
    var A = D.stories[0].envelope, B = D.stories[1].envelope, C = D.stories[2].envelope, h = [];
    var gwh = storedGWh(B.gw, B.duration), us = averageGW(B.us_twh, B.hours);
    h.push('<details class="lx-textalt"><summary>The three checks with units, worked</summary><ul>');
    h.push("<li><strong>Story 1</strong>: " + f0(A.twh) + " TWh × 1,000 = " + f0(A.twh * 1000) + " GWh a year; ÷ " + f0(A.hours) + " h ≈ " + f1(averageGW(A.twh, A.hours)) +
      " GW of average power. At " + A.util + "% average use of the connections (the report's assumption), that needs about " + f0(connectionGW(A.twh, A.util, A.hours)) + " GW of connections.</li>");
    h.push("<li><strong>Story 2</strong>: " + B.gw + " GW × " + B.duration + " h (an illustrative duration) = " + f0(gwh) + " GWh. That energy equals about " + f1(minutesOfUse(gwh, B.us_twh, B.hours)) +
      " minutes of U.S. use at the 2025 average of about " + f0(Math.round(us / 10) * 10) + " GW, but " + B.gw + " GW is only about " + Math.round(B.gw / us * 100) + "% of that average power. Actual additions were about " +
      Math.round(B.gw / B.planned_gw * 100) + "% of the " + B.planned_gw + " GW first planned.</li>");
    h.push("<li><strong>Story 3</strong>: the expert panel's factual report came " + days(C.event, C.factual) + " days after the blackout, and its final report " + days(C.event, C.final) +
      " days after: about " + C.ticks[C.answer] + ".</li></ul></details>");
    h.push('<details class="lx-textalt"><summary>Units or scale? Six sentences, with answers</summary><ul>');
    D.spotter.forEach(function (s) {
      h.push("<li>“" + esc(s.text) + "” <strong>" + (s.answer === "error" ? "A " + esc(s.kind) + " error." : "Reads right.") + "</strong> " + esc(s.fix) + "</li>");
    });
    h.push("</ul></details>");
    h.push('<details class="lx-textalt"><summary>The evidence ladder, with the stories\' claims placed</summary><ol>');
    D.ladder.rungs.forEach(function (r) { h.push("<li><strong>" + esc(r.label) + "</strong>: " + esc(r.text) + "</li>"); });
    h.push("</ol><ul>");
    // each claim's note states where it sits on the ladder
    D.ladder.items.forEach(function (it) { h.push("<li><strong>“" + esc(it.text) + "”</strong>: " + esc(it.note) + "</li>"); });
    h.push("</ul></details>");
    return h.join("\n");
  }
  // which phrases each lens question caught across the stories (for the explain checklist)
  function caught(data) {
    var by = {};
    data.lens.forEach(function (l) { by[l.id] = []; });
    data.stories.forEach(function (s) { phrases(s).forEach(function (ph) { by[ph.tag].push(ph.text); }); by[s.missing.answer].push("left unanswered in story " + (data.stories.indexOf(s) + 1)); });
    return by;
  }
  var model = { HOURS_PER_YEAR: HOURS_PER_YEAR, phrases: phrases, judge: judge, score: score, averageGW: averageGW, connectionGW: connectionGW,
                storedGWh: storedGWh, minutesOfUse: minutesOfUse, days: days, ladderOK: ladderOK, caught: caught, takeParts: takeParts,
                staticChecks: staticChecks };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H, fmt1 = f1, fmt0 = f0;

  function injectCSS() {
    if (document.getElementById("n1-css")) return;
    var css = [
      // the seven lens cards; tag colours come from the lens data (--c), and the number badge (LX.PhraseTagger.badge)
      // repeats the question, so colour is never the only cue
      ".n1-lens{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px}",
      ".n1-q{display:grid;gap:4px;align-content:start;text-align:left;min-height:84px;padding:10px 12px;border-radius:12px;border:1px solid var(--lx-line-2);border-top:4px solid var(--c);background:var(--lx-surface);color:var(--lx-ink);cursor:pointer;font:inherit}",
      ".n1-q b{font-family:var(--lx-f-display);font-weight:500;font-size:15px;display:flex;gap:6px;align-items:baseline;hyphens:auto}",
      ".n1-q small{font-size:12.5px;color:var(--lx-ink-3)}",
      ".n1-q .t{font-size:13.5px;color:var(--lx-ink-2);line-height:1.35}",
      ".n1-q[aria-expanded=true]{background:var(--lx-surface-2)}",
      ".n1-pq{font-family:var(--lx-f-display);font-weight:500;font-size:15.5px}",
      ".n1-row{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center}",
      ".n1-count{font-size:13.5px;color:var(--lx-ink-3)}",
      ".n1-spot{display:grid;gap:8px;margin:0;padding:0;list-style:none}",
      ".n1-spot li{display:grid;gap:8px;padding:10px 12px;border:1px solid var(--lx-line);border-radius:12px;background:var(--lx-surface)}",
      ".n1-spot .s{font-family:var(--lx-f-display);font-weight:500;font-size:15.5px}",
      ".n1-spot .lx-qbtns{grid-template-columns:repeat(2,minmax(0,1fr))}",
      ".n1-take{display:grid;gap:10px}",
      ".n1-take label{display:grid;gap:4px;font-family:var(--lx-f-display);font-weight:500;font-size:14.5px;color:var(--lx-ink)}",
      ".n1-take textarea{font:inherit;font-size:15px;min-height:52px;padding:8px 10px;border-radius:10px;border:1px solid var(--lx-line-2);background:var(--lx-surface);color:var(--lx-ink);resize:vertical;width:100%}",
      ".n1-model{display:grid;gap:4px;margin:0;padding:10px 12px;border-radius:10px;background:var(--lx-surface-2);font-size:15px;color:var(--lx-ink)}",
      ".n1-model dt{font-family:var(--lx-f-display);font-weight:500;font-size:13px;color:var(--lx-ink-3)}.n1-model dd{margin:0 0 4px}",
      // the stories carry one sentence per line ("\n" in the data), so each reads as a short line
      "[data-learn=news-lens] .lx-tagger-body{white-space:pre-line}",
      "@media (max-width:560px){.n1-lens{grid-template-columns:repeat(2,minmax(0,1fr))}.n1-q{min-height:0}}"
    ].join("\n");
    H("style", { id: "n1-css", text: css }, document.head);
  }

  function lensById(D) { var m = {}; D.lens.forEach(function (l) { m[l.id] = l; }); return m; }
  // ---- step 0: the seven questions
  function lensStep(D) {
    return function (act, api) {
      var grid = H("div", { class: "n1-lens" }, act), opened = {}, prog = H("p", { class: "n1-count", "aria-live": "polite", text: "0 of " + D.lens.length + " opened." }, act);
      D.lens.forEach(function (l) {
        var b = H("button", { class: "n1-q", type: "button", "aria-expanded": "false", style: "--c:" + l.color }, grid);
        // a soft hyphen where the card is narrow (phones): "Counter-factual" breaks inside the card instead of running out of it
        H("b", { html: LX.PhraseTagger.badge(Object.assign({}, l, { label: l.label.replace(/^Counterfactual$/, "Counter\u00ADfactual") }), true) }, b);
        H("span", { class: "t", text: l.ask }, b);
        var trap = H("small", { text: "Trap: " + l.trap, hidden: true }, b);
        if (l.sub) H("small", { text: "Covers " + l.sub }, b);
        b.addEventListener("click", function () {
          var open = b.getAttribute("aria-expanded") !== "true";
          b.setAttribute("aria-expanded", open ? "true" : "false"); trap.hidden = !open;
          opened[l.id] = true;
          var n = Object.keys(opened).length;
          prog.textContent = n + " of " + D.lens.length + " opened.";
          if (n === D.lens.length) { api.done(); api.saw("Seven questions, one trap each. Time covers the horizon and power or energy; Physics covers units and limits. Next, use them on a real story."); }
        });
      });
    };
  }

  // ---- the phrase tagger (dissector) for one story: LX.PhraseTagger
  function tagStep(D, story, idx) {
    return function (act, api) {
      var compared = false;
      LX.PhraseTagger(act, { key: "n1-tags-" + story.id, tags: D.lens, kicker: "Story " + (idx + 1) + " of 3 · " + story.kicker,
        title: story.headline, framing: story.framing, parts: story.parts, sources: story.sources, missing: story.missing, missingQ: story.missing.q,
        onCompare: function (sc) {
          if (!compared) { compared = true; api.done(); }
          api.saw("You matched the researcher on " + sc.same + " of " + sc.total + " phrases" + (sc.fair ? ", and " + sc.fair + " more are fair alternatives" : "") +
            ". Most phrases raise more than one question; the habit that matters is asking all seven.", sc.same + sc.fair < sc.total / 2);
        } });
    };
  }

  // ---- envelope checks
  function envelopeA(story) {
    var e = story.envelope;
    return function (act, api) {
      var avg = averageGW(e.twh, e.hours), chain, note, sl;
      var pr = LX.Predict(act, { id: "n1-env-a", q: e.q, fresh: true, options: e.options.map(function (o, i) { return { value: String(i), label: o }; }), answer: String(e.answer),
        feedback: e.options.reduce(function (m, o, i) { m[String(i)] = e.feedback[i]; return m; }, {}),
        onPick: function () {
          pr.reveal(); chain.hidden = false; note.hidden = false;
          if (!sl) {
            sl = LX.Slider(slBox, { label: "Average use of the connections (illustrative)", color: "var(--lx-tier-2)", min: 30, max: 100, step: 5, unit: "%",
              hint: function () { return "The report assumes 50%. Lower use needs more connection capacity for the same energy."; }, onChange: draw });
            sl.set(e.util);
          }
          draw(e.util); api.done();
        } });
      chain = H("div", { hidden: true }, act);
      var uc = LX.UnitChain(chain, { label: "Unit chain" });
      var slBox = H("div", null, act);
      note = H("p", { class: "lx-hint", hidden: true }, act);
      function draw(u) {
        var con = connectionGW(e.twh, u, e.hours);
        uc.set([{ v: fmt0(e.twh) + " TWh", u: "a year (energy)" }, { op: "× 1,000 =" }, { v: fmt0(e.twh * 1000) + " GWh", u: "a year" },
          { op: "÷ " + fmt0(e.hours) + " h =" }, { v: fmt1(avg) + " GW", u: "average power" }, { op: "÷ " + u + "% =" }, { v: fmt0(con) + " GW", u: "of connections", out: true }]);
        var at = Math.round(con) === e.report_gw;
        note.innerHTML = LX.rich(at ? "At " + u + "% you reproduce the report's " + e.report_gw + " GW. The headline's GW depends on an assumption it never shows." :
          "At " + u + "%: " + fmt0(con) + " GW, against the report's " + e.report_gw + " GW at 50%. Same energy, a different [[capacity|capacity]] need.");
      }
    };
  }
  function envelopeB(story) {
    var e = story.envelope;
    return function (act, api) {
      var box = H("div", { hidden: true, class: "lx-stack" }, act);
      var pr = LX.Predict(act, { id: "n1-env-b", q: e.q, fresh: true, options: e.options.map(function (o, i) { return { value: String(i), label: o }; }), answer: String(e.answer),
        feedback: e.options.reduce(function (m, o, i) { m[String(i)] = e.feedback[i]; return m; }, {}),
        onPick: function () { pr.reveal(); box.hidden = false; api.done(); } });
      act.appendChild(box);
      H("p", { class: "n1-pq", text: "Pick an average duration (illustrative):" }, box);
      var seg = H("div", { class: "lx-seg", role: "group", "aria-label": "Battery duration in hours" }, box);
      var uc = LX.UnitChain(H("div", null, box), { label: "Unit chain" }), out = H("p", { class: "lx-hint" }, box);
      var plan = H("p", { class: "lx-hint" }, box);
      plan.innerHTML = LX.rich("Planned against built: " + e.gw + " ÷ " + e.planned_gw + " = **" + Math.round(e.gw / e.planned_gw * 100) + "%**. Actual additions were about that share of the amount first planned.").replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
      var bs = e.durations.map(function (h) {
        var b = H("button", { type: "button", "aria-pressed": "false", text: h + " h" }, seg);
        b.addEventListener("click", function () { draw(h); });
        return { b: b, h: h };
      });
      function draw(h) {
        bs.forEach(function (x) { x.b.setAttribute("aria-pressed", x.h === h ? "true" : "false"); });
        var gwh = storedGWh(e.gw, h), min = minutesOfUse(gwh, e.us_twh, e.hours);
        uc.set([{ v: e.gw + " GW", u: "power" }, { op: "× " + h + " h =" }, { v: fmt0(gwh) + " GWh", u: "energy stored", out: true }]);
        var us = averageGW(e.us_twh, e.hours);
        out.innerHTML = LX.rich("Its energy equals about **" + fmt1(min) + " minutes** of U.S. use at the 2025 average of about " + fmt0(Math.round(us / 10) * 10) + " GW, but its [[power|power]] is only about **" + Math.round(e.gw / us * 100) + "%** of that average. These example durations cover hours, not seasons.").replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
      }
      draw(e.duration);
    };
  }
  function clockStep(story) {
    var e = story.envelope, dF = days(e.event, e.factual), dX = days(e.event, e.final);
    return function (act, api) {
      LX.Guess(act, { id: "n1-clock", q: e.q, ticks: e.ticks, answer: e.answer, start: 0, srLabel: e.q,
        onLock: function (g, out) {
          var ok = g === e.answer;
          LX.EvidenceClock(out, { label: "Timeline: the blackout on 28 April 2025; the factual report after " + dF + " days; the final report after " + dX + " days.",
            marks: [{ d: 0, label: "Blackout", value: "28 Apr 2025" }, { d: dF, label: "Factual report", value: dF + " days" }, { d: dX, label: "Final report", value: dX + " days" }] });
          H("div", { class: "lx-saw" + (ok ? "" : " no"), html: LX.icon(ok ? "check" : "question") + "<div><b>" + (ok ? "You called it." : "Not quite.") + "</b> " +
            "The factual report came " + dF + " days after the blackout and the final report " + dX + " days after: about 11 months. The early single-cause claims came long before either.</div>" }, out);
          api.done();
        } });
    };
  }

  // ---- units or scale error spotter
  function spotStep(D) {
    return function (act, api) {
      var ul = H("ul", { class: "n1-spot" }, act), answered = {}, right = 0;
      var tally = H("p", { class: "n1-count", "aria-live": "polite" }, act);
      D.spotter.forEach(function (s) {
        var li = H("li", null, ul), sid = LX.uid("sp");
        H("p", { class: "s", id: sid, text: "“" + s.text + "”" }, li);
        var g = H("div", { class: "lx-qbtns", role: "group", "aria-labelledby": sid }, li), fb = H("div", { "aria-live": "polite" }, li);
        [["ok", "Reads right"], ["error", "Unit or scale error"]].forEach(function (o) {
          var b = H("button", { class: "lx-choice", type: "button", "aria-pressed": "false", text: o[1] }, g);
          b.addEventListener("click", function () {
            [].forEach.call(g.children, function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); x.classList.remove("right", "wrong"); });
            var ok = o[0] === s.answer; b.classList.add(ok ? "right" : "wrong");
            if (!(s.id in answered)) { answered[s.id] = ok; if (ok) right++; }
            fb.innerHTML = "";
            H("div", { class: "lx-saw" + (ok ? "" : " no"), html: LX.icon(ok ? "check" : "question") + "<div><b>" + (ok ? "Right." : "Not quite.") + "</b> " +
              (s.answer === "error" ? "A " + s.kind + " error. " : "") + LX.rich(s.fix) + "</div>" }, fb);
            var n = Object.keys(answered).length;
            tally.textContent = n + " of " + D.spotter.length + " judged; " + right + " right on the first try.";
            if (n === D.spotter.length) { api.done(); api.saw("Most errors are a rate written as an amount (MW for MWh) or a number with no sense of scale. Divide by 8,760 hours, or compare with a known total, before you believe it."); }
          });
        });
      });
    };
  }

  // ---- three-sentence take
  function takeStep(D) {
    return function (act, api) {
      var cur = LX.store.get("n1-take-story", "b"), seg = H("div", { class: "lx-seg", role: "group", "aria-label": "Story" }, act), segBtns = {};
      D.stories.forEach(function (s, i) {
        var b = H("button", { type: "button", "aria-pressed": "false", text: "Story " + (i + 1) }, seg);
        b.addEventListener("click", function () { cur = s.id; LX.store.set("n1-take-story", cur); load(); });
        segBtns[s.id] = b;
      });
      var head = H("p", { class: "n1-pq" }, act), form = H("div", { class: "n1-take" }, act), fields = {};
      [["claim", "The claim I accept or reject"], ["mind", "What would change my mind"], ["conf", "My confidence (low, medium or high) and why"]].forEach(function (f) {
        var lab = H("label", null, form); H("span", { text: f[1] }, lab);
        var ta = H("textarea", { rows: 2 }, lab);
        ta.addEventListener("input", function () { var t = LX.store.get("n1-take-" + cur, {}) || {}; t[f[0]] = ta.value; LX.store.set("n1-take-" + cur, t); });
        fields[f[0]] = ta;
      });
      var row = H("div", { class: "n1-row" }, act);
      var show = H("button", { class: "lx-btn small ghost", type: "button", text: "Show a researcher's take" }, row);
      H("span", { class: "n1-count", text: "Your words stay in this browser." }, row);
      var model = H("dl", { class: "n1-model", hidden: true }, act);
      show.addEventListener("click", function () { model.hidden = false; api.done(); api.saw("Compare the three parts, not the wording. A good take names what would change the author's mind; that line is what turns an opinion into a claim someone can check."); });
      function load() {
        var s = D.stories.filter(function (x) { return x.id === cur; })[0] || D.stories[1];
        Object.keys(segBtns).forEach(function (k) { segBtns[k].setAttribute("aria-pressed", k === s.id ? "true" : "false"); });
        head.textContent = "“" + s.headline + "”";
        var t = LX.store.get("n1-take-" + s.id, {}) || {};
        Object.keys(fields).forEach(function (k) { fields[k].value = t[k] || ""; });
        model.innerHTML = "";
        takeParts(s.take).forEach(function (x) { H("dt", { text: x.k }, model); H("dd", { text: x.v }, model); });
      }
      load();
    };
  }

  // ---- explain layer: the checklist (LX.Checklist) and the evidence ladder (LX.EvidenceLadder)
  function explain(D) {
    var host = document.getElementById("n1-explain"); if (!host) return;
    host.innerHTML = "";
    var by = caught(D), L = lensById(D);
    var c1 = H("div", { class: "lx-xcard" }, host), c2 = H("div", { class: "lx-xcard" }, host);
    LX.Checklist(c1, { id: "n1-checklist", title: "The lens as a checklist", columns: 2,
      lede: "Use it on your next headline: tick each question as you ask it. Under each, the phrases it caught in today's three stories.",
      doneText: "Now write your three-sentence take.",
      items: D.lens.map(function (l) {
        return { id: l.id, label: l.n + ". " + l.label + ": " + l.ask, text: "Trap: " + l.trap, note: "Caught today: " + by[l.id].join(" · ") };
      }) });
    LX.EvidenceLadder(c2, { title: "The evidence ladder", rungs: D.ladder.rungs, items: D.ladder.items,
      lede: "A project climbs these rungs. Headlines often report a low rung as if it were the top one. Place each claim from today's stories.",
      off: { id: "projection", label: D.ladder.projection_label } });
    return L;
  }

  LX.mount("news-lens", function (live, data, root) {
    injectCSS();
    var D = data["n01-news-lens"] || data.n01_news_lens;
    var A = D.stories[0], B = D.stories[1], C = D.stories[2];
    var steps = [
      { text: "A researcher reads an energy headline with seven questions, always in the same order, so none gets skipped. Open each one to see the trap it catches.", build: lensStep(D) },
      { text: "Tap each highlighted phrase and tag it with the question it raises. Then choose the question the story leaves unanswered, and compare with a researcher's notes.", build: tagStep(D, A, 0) },
      { text: "Now one check with units. The report gives [[energy|energy]] per year; grids are sized in [[power|power]]. Turn 649 TWh a year into average GW.", build: envelopeA(A) },
      { text: "Tag the second story. Watch for power against energy, and for plans against results. Then compare with a researcher's notes.", build: tagStep(D, B, 1) },
      { text: "The story gives power, not energy. Choose a [[battery-duration|duration]] and see how much energy 15 GW could hold, and how it compares with the whole country's use.", build: envelopeB(B) },
      { text: "Story 3 claims a cause for a blackout. Two terms first: [[voltage|voltage]] is the electrical push on the lines, held up locally by [[reactive-power|reactive power]]. Tag the phrases, then pick the question that would test the claim.", build: tagStep(D, C, 2) },
      { text: "Evidence takes time. Guess how long the formal investigation took before its final report, then lock in your guess.", build: clockStep(C) },
      { text: "Spot the units or scale error. Four of these six sentences break a unit or a sense of scale; two read right. Judge each one.", build: spotStep(D) },
      { text: "Write your take in three sentences: the claim you accept or reject, what would change your mind, and your confidence. Then compare with a researcher's take.", build: takeStep(D) }
    ];
    var cards = LX.StepCards(live, { id: "n1-steps", steps: steps });
    explain(D);
    root.lxLesson = { data: D, model: model };
    // demo states (core.js LX.demo): "mid" opens story 1 with every phrase tagged and the comparison shown; "envelope"
    // is step 5 answered (the battery check, 4 h); "take" is step 9 with the researcher's take shown
    LX.demo(root, function (state) {
      if (state === "envelope" || state === "take") {
        cards.go(state === "envelope" ? 4 : 8);
        var want = state === "envelope" ? "It depends" : "Show a researcher";
        setTimeout(function () { [].forEach.call(live.querySelectorAll("button"), function (b) { if (b.offsetParent && b.textContent.indexOf(want) === 0) b.click(); }); }, 50);
        return { view: state === "envelope" ? "step 5" : "step 9" };
      }
      if (state !== "mid") return null;
      var pk = {}; model.phrases(A).forEach(function (ph, i) { pk[ph.p] = i % 3 === 2 ? "scale" : ph.tag; }); pk._missing = "pays";
      LX.store.set("n1-tags-a", pk);
      var card = live.querySelector(".lx-stepcard");
      var go = function () { var b = card.querySelectorAll(".n1-q"); [].forEach.call(b, function (x) { x.click(); }); card.querySelector(".lx-step-foot .lx-btn:not(.ghost)").click();
        var c = card.querySelector(".lx-tagger-row .lx-btn"); if (c) c.click(); };
      setTimeout(go, 50);
      return { view: "story 1 tagged" };
    }, cards);
  });
})();
