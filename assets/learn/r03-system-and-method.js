/* r03-system-and-method.js — research studio R3, "Which system, which boundary, which method?" (curriculum v2 §11; W2,
   2026-11-03). Data: assets/learn/data/r03-system-and-method.json (three illustrative briefs at three scales and of three
   question types, nine method families, the five scales, the exemplars) and data/path.json (lesson links).
   Page: learn/r03-system-and-method.qmd (studio form: Task, Exemplars, Self-check, Sources).
   Task (step cards): choose a brief; place it on the scale ladder; draw its boundary (LX.CardSort into inside, given and
   left out, then LX.Boundary of the reader's own sort: i-boundary); pick a time step and a horizon; choose one of nine
   method families (§11.2: optimization is one family among several, and several can fit one question); defend it against
   two alternatives, one from another family; then a design card to copy.
   Exemplars: a weak and a strong method defence (LX.Exemplars), the steps as a flowchart (LX.Flowchart, e-flowchart) and
   the nine families compared (LX.CompareTable, e-table). Self-check: the five scales with typical time steps and horizons
   (a lesson-local scale strip, e-scale-strip) and the course rubric's Framing and Method fit (LX.Rubric).
   Node: module.exports = the pure model (checks, fit lookups, the defence checks, the design card as text, the no-JS
   version of the task); the test is _tests/learn/test_r03-system-and-method.js (it writes the no-JS blocks with --write). */
(function () {
  "use strict";
  // ---------------------------------------------------------------- pure model (no DOM; exported for Node)
  var SCALE_IDS = ["S0", "S1", "S2", "S3", "S4"];
  var FIT_IDS = ["good", "part", "poor"];
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function plainMarks(t) { return String(t).replace(/\[\[[a-z0-9-]+\|([^\]]+)\]\]/g, "$1"); }
  function words(s) { return String(s || "").trim().split(/\s+/).filter(Boolean).length; }
  function brief(D, id) { return D.briefs.filter(function (b) { return b.id === id; })[0] || null; }
  function family(D, id) { return D.families.filter(function (f) { return f.id === id; })[0] || null; }
  function option(list, id) { return (list || []).filter(function (o) { return o.id === id; })[0] || null; }
  function fit(B, famId) { var f = B.fits[famId]; return f ? { fit: f[0], why: f[1] } : null; }
  // data checks: every brief has a right scale, eight boundary cards in the three bins, one "good" time step and
  // horizon, a fit for every family with at least two that fit well or help, and a defence against another family
  function check(D) {
    var out = [], fams = D.families.map(function (f) { return f.id; });
    D.briefs.forEach(function (B) {
      var n = B.id + ": ";
      if (SCALE_IDS.indexOf(B.scale) < 0) out.push(n + "unknown scale");
      if (B.boundary.length !== 8) out.push(n + "needs eight boundary cards");
      D.bins.forEach(function (bin) { if (!B.boundary.some(function (c) { return c.bin === bin.id; })) out.push(n + "no card in " + bin.id); });
      ["steps", "horizons"].forEach(function (k) {
        if (B[k].filter(function (o) { return o.fit === "good"; }).length !== 1) out.push(n + "needs exactly one good " + k);
        B[k].forEach(function (o) { if (FIT_IDS.indexOf(o.fit) < 0) out.push(n + k + " " + o.id + ": unknown fit"); });
      });
      fams.forEach(function (f) { if (!B.fits[f] || FIT_IDS.indexOf(B.fits[f][0]) < 0) out.push(n + "no fit for " + f); });
      if (fams.filter(function (f) { return B.fits[f] && B.fits[f][0] !== "poor"; }).length < 2) out.push(n + "fewer than two families fit");
      var d = B.defence;
      if (!d || fams.indexOf(d.method) < 0 || fams.indexOf(d.other) < 0 || d.other === d.method) out.push(n + "the defence needs a method and another family");
      if (d && B.fits[d.method][0] !== "good") out.push(n + "the example defends a family that does not fit well");
    });
    return out;
  }
  // the defence's structure (never its quality): another version named, another family chosen, enough words, a limit
  function defenceChecks(v, method) {
    return [
      { id: "same", label: "An alternative in the same family, or a simpler version", ok: !!String(v.same || "").trim() },
      { id: "other", label: "An alternative from another family", ok: !!v.other && v.other !== method },
      // a reason or a limit counts only when words follow it (the template's "because … ." does not)
      { id: "why", label: "A reason for each choice, tied to the question", ok: (String(v.text || "").match(/\bbecause\s+[^….;]{4,}/gi) || []).length >= 2 },
      { id: "limit", label: "The method's main limit (a way to reduce it moves you towards Strong)",
        ok: /\b(limit|weakness)\w*\s+(is|are)\s+[^….;]{4,}|\bassum\w*\s+[^….;]{4,}/i.test(String(v.text || "")) }
    ];
  }
  // the reader's design as plain text (the card they copy)
  function designText(D, st) {
    var B = brief(D, st.brief); if (!B) return "";
    var v = (st.per && st.per[B.id]) || {}, dash = "(not yet)";
    var placed = v.placed || {}, groups = {};
    D.bins.forEach(function (b) { groups[b.id] = B.boundary.filter(function (c) { return placed[c.id] === b.id; }).map(function (c) { return c.text; }); });
    var S = D.scales.filter(function (s) { return s.id === v.scale; })[0], m = family(D, v.method), o = family(D, v.other);
    return ["Learn · R3 design card",
      "Question: " + B.question,
      "Type: " + B.type,
      "Scale: " + (S ? S.id + " " + S.name.toLowerCase() : dash),
      "Boundary, inside: " + (groups.inside.join("; ") || dash),
      "Boundary, given: " + (groups.given.join("; ") || dash),
      "Boundary, left out: " + (groups.out.join("; ") || dash),
      "Time step: " + ((option(B.steps, v.step) || {}).label || dash),
      "Horizon: " + ((option(B.horizons, v.horizon) || {}).label || dash),
      "Method family: " + (m ? m.label : dash),
      "Alternatives: " + (String(v.same || "").trim() || dash) + "; " + (o ? o.label : dash),
      "Defence: " + (String(v.text || "").trim() || dash)].join("\n");
  }
  // the no-JS version of the task: each brief with a researcher's answers
  function staticTask(D) {
    var L = D.fitLabels, h = [];
    D.briefs.forEach(function (B) {
      var d = B.defence, m = family(D, d.method);
      h.push('<details class="lx-textalt"><summary>' + esc(B.short) + " (" + esc(B.type) + ", " + esc(B.scale) + ")</summary>");
      h.push("<p><strong>" + esc(B.question) + "</strong></p><ul>");
      h.push("<li><strong>Scale:</strong> " + esc(B.scaleWhy) + "</li>");
      D.bins.forEach(function (bin) {
        h.push("<li><strong>" + esc(bin.label) + ":</strong> " + B.boundary.filter(function (c) { return c.bin === bin.id; }).map(function (c) { return esc(c.text) + " (" + esc(c.why.replace(/\.$/, "")) + ")"; }).join("; ") + ".</li>");
      });
      var s = B.steps.filter(function (o) { return o.fit === "good"; })[0], hz = B.horizons.filter(function (o) { return o.fit === "good"; })[0];
      h.push("<li><strong>Time step and horizon:</strong> " + esc(s.label) + ", " + esc(s.why.replace(/\.$/, "").toLowerCase().charAt(0) + s.why.replace(/\.$/, "").slice(1)) + "; " + esc(hz.label.toLowerCase()) + ".</li>");
      h.push("<li><strong>Method families:</strong> " + D.families.map(function (f) { return esc(f.label) + ": " + esc(L[B.fits[f.id][0]].toLowerCase()); }).join("; ") + ".</li>");
      h.push("<li><strong>A researcher's defence (" + esc(m.label) + "):</strong> " + esc(d.text) + "</li></ul></details>");
    });
    return h.join("\n");
  }
  // the page's three no-JS blocks (the test writes and checks them): C = { exemplars, rubric } (the components' staticHTML)
  function staticBlocks(D, C) {
    var fam = '<p class="lx-eyebrow">Nine method families, side by side</p>\n<div class="lx-scroll-x"><table class="lx-facts"><thead><tr><th scope="col">Family</th><th scope="col">Answers</th><th scope="col">Needs</th><th scope="col">Main limit</th></tr></thead><tbody>'
      + D.families.map(function (f) { return "<tr><td>" + esc(f.label) + "</td><td>" + esc(f.answers) + "</td><td>" + esc(f.needs) + "</td><td>" + esc(f.limit) + "</td></tr>"; }).join("") + "</tbody></table></div>";
    var sc = '\n<p class="lx-eyebrow">Five scales: who decides, and typical steps and horizons</p>\n<ul>'
      + D.scales.map(function (s) { return "<li><b>" + esc(s.id + " " + s.name) + ":</b> decides " + esc(s.decides) + "; " + esc(s.who) + ". Time step: " + esc(s.step) + "; horizon: " + esc(s.horizon) + ".</li>"; }).join("") + "</ul>";
    return { task: staticTask(D), exemplars: C.exemplars(D.exemplars) + "\n" + fam, rubric: C.rubric(D.rubric.competences) + sc };
  }
  function ref(P, code) {
    var all = [].concat((P && P.starter) || [], (P && P.more) || [], (P && P.toolbox) || []), num = typeof code === "number";
    var hit = all.filter(function (l) { return num ? l.starter === code : l.code === code; })[0];
    return hit ? { href: hit.href, ready: !!hit.ready, label: num ? "lesson " + code : code } : { href: null, ready: false, label: num ? "lesson " + code : String(code) };
  }
  var model = { SCALE_IDS: SCALE_IDS, brief: brief, family: family, option: option, fit: fit, check: check, defenceChecks: defenceChecks,
                designText: designText, staticTask: staticTask, staticBlocks: staticBlocks, ref: ref, words: words, plainMarks: plainMarks };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H;
  function injectCSS() {
    if (document.getElementById("r3-css")) return;
    H("style", { id: "r3-css", text: [
      ".r3-briefs{display:grid;gap:10px}",
      ".r3-pick{display:grid;gap:4px;text-align:left;padding:12px 14px;border-radius:12px;border:1px solid var(--lx-line-2);background:var(--lx-surface);color:var(--lx-ink);font:inherit;cursor:pointer}",
      ".r3-pick b{font-family:var(--lx-f-display);font-weight:500;font-size:16px}",
      ".r3-pick small{font-size:13px;color:var(--lx-ink-3)}",
      ".r3-pick span{font-size:14.5px;color:var(--lx-ink-2);line-height:1.4}",
      ".r3-pick[aria-pressed=true]{border-color:var(--lx-accent);box-shadow:inset 0 0 0 2px var(--lx-accent)}",
      ".r3-q{margin:0;padding:10px 12px;border-left:4px solid var(--lx-tier-4);background:var(--lx-surface-2);border-radius:0 10px 10px 0;font-size:15px;color:var(--lx-ink)}",
      ".r3-ladder{display:grid;gap:6px;margin:0;padding:0;list-style:none}",
      ".r3-ladder button{width:100%;display:grid;grid-template-columns:44px minmax(0,1fr);gap:2px 10px;align-items:baseline;text-align:left;padding:8px 12px;border-radius:10px;border:1px solid var(--lx-line-2);background:var(--lx-surface);color:var(--lx-ink);font:inherit;cursor:pointer}",
      ".r3-ladder b{font-family:var(--lx-f-mono);font-weight:600}.r3-ladder span{font-family:var(--lx-f-display);font-weight:500}",
      ".r3-ladder small{grid-column:2;font-size:13px;color:var(--lx-ink-3)}",
      ".r3-ladder button[aria-pressed=true]{border-color:var(--lx-accent);box-shadow:inset 0 0 0 2px var(--lx-accent)}",
      ".r3-ladder button.right{border-color:var(--lx-good)}",
      ".r3-row{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center}",
      ".r3-two{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}",
      ".r3-two fieldset{margin:0;padding:10px 12px;border:1px solid var(--lx-line);border-radius:12px;display:grid;gap:6px;min-width:0}",
      ".r3-two legend{font-family:var(--lx-f-display);font-weight:500;font-size:15px;padding:0 4px}",
      ".r3-two label{display:flex;gap:8px;align-items:center;font-size:14.5px}",
      ".r3-fit{margin:0;font-size:14px;color:var(--lx-ink-2)}.r3-fit b{color:var(--lx-ink)}",
      ".r3-fams{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}",
      ".r3-fams button{min-height:44px;padding:6px 10px;border-radius:10px;border:1px solid var(--lx-line-2);background:var(--lx-surface);color:var(--lx-ink);font:inherit;font-size:14.5px;cursor:pointer;text-align:left}",
      ".r3-fams button[aria-pressed=true]{border-color:var(--lx-accent);box-shadow:inset 0 0 0 2px var(--lx-accent)}",
      ".r3-card{display:grid;gap:4px;margin:0;padding:10px 12px;border-radius:10px;background:var(--lx-surface-2);font-size:14.5px}",
      ".r3-card dt{font-family:var(--lx-f-display);font-weight:500;color:var(--lx-ink-3);font-size:13px}.r3-card dd{margin:0 0 4px;color:var(--lx-ink)}",
      ".r3-form{display:grid;gap:10px}",
      ".r3-form label{display:grid;gap:4px;font-family:var(--lx-f-display);font-weight:500;font-size:14px;color:var(--lx-ink)}",
      ".r3-form input,.r3-form select,.r3-form textarea{font:inherit;font-size:15px;padding:7px 10px;border-radius:10px;border:1px solid var(--lx-line-2);background:var(--lx-surface);color:var(--lx-ink);width:100%;box-sizing:border-box}",
      ".r3-form textarea{min-height:120px;resize:vertical}",
      ".r3-cks{margin:0;padding:0;list-style:none;display:grid;gap:4px;font-size:14px}",
      ".r3-cks li{display:flex;gap:6px;align-items:flex-start}.r3-cks li.ok .lx-ic{color:var(--lx-good)}.r3-cks li.warn .lx-ic{color:var(--lx-warn)}",
      ".r3-cks .lx-ic{width:16px;height:16px;flex:none;margin-top:2px}",
      ".r3-strip{margin:0;padding:0;list-style:none;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}",
      ".r3-strip li{display:grid;gap:4px;align-content:start;padding:10px;border-radius:12px;border:1px solid var(--lx-line);border-top:4px solid var(--lx-tier-4);background:var(--lx-surface);font-size:13.5px;color:var(--lx-ink-2);min-width:0}",
      ".r3-strip li b{font-family:var(--lx-f-display);font-weight:500;font-size:15px;color:var(--lx-ink)}",
      ".r3-strip li .code{font-family:var(--lx-f-mono);font-size:12.5px;color:var(--lx-ink-3)}",
      ".r3-strip li.mine{background:var(--lx-accent-soft);border-color:var(--lx-accent)}",
      ".r3-strip li .tag{font-size:12px;font-weight:600;color:var(--lx-ink)}",
      "@media (max-width:860px){.r3-strip{grid-template-columns:minmax(0,1fr)}.r3-fams{grid-template-columns:repeat(2,minmax(0,1fr))}}",
      "@media (max-width:560px){.r3-two{grid-template-columns:minmax(0,1fr)}}"
    ].join("\n") }, document.head);
  }

  LX.mount("r03-system-and-method", function (live, data, root) {
    injectCSS();
    var D = data.r03_system_and_method, P = data.path;
    var st = LX.store.get("r3-state", null) || { brief: null, per: {} };
    if (!st.per) st.per = {};
    function save() { LX.store.set("r3-state", st); paintStrip(); }
    function B() { return brief(D, st.brief); }
    function V() { var b = B(); if (!b) return {}; st.per[b.id] = st.per[b.id] || {}; return st.per[b.id]; }
    function fitLine(o) { return "<b>" + LX.esc(D.fitLabels[o.fit]) + ".</b> " + LX.rich(o.why); }
    function needBrief(act, api) { if (B()) return false; H("p", { class: "lx-hint", text: "Choose a brief in step 1 first." }, act); return true; }
    function showQ(act) { H("p", { class: "r3-q", text: B().question }, act); }

    var steps = [
      { text: "Choose one brief. Each sits at a different scale and asks a different type of question, so each needs different choices.",
        build: function (act, api) {
          var wrap = H("div", { class: "r3-briefs", role: "group", "aria-label": "Three briefs" }, act), btns = [];
          D.briefs.forEach(function (b) {
            var bt = H("button", { class: "r3-pick", type: "button", "aria-pressed": st.brief === b.id ? "true" : "false" }, wrap);
            H("b", { text: b.short }, bt); H("small", { text: b.type.charAt(0).toUpperCase() + b.type.slice(1) + " question" }, bt); H("span", { text: b.question }, bt);
            bt.addEventListener("click", function () {
              st.brief = b.id; save();
              btns.forEach(function (x) { x.setAttribute("aria-pressed", x === bt ? "true" : "false"); });
              api.done(); api.saw("Brief chosen: " + b.short.toLowerCase() + ", a " + b.type + " question. Next, place it on the scale ladder.");
            });
            btns.push(bt);
          });
          if (st.brief) api.done();
        } },
      { text: "Place the brief on the scale ladder. A scale is set by who decides and what physics a model needs, not by geography alone.",
        build: function (act, api) {
          if (needBrief(act, api)) return;
          showQ(act);
          var ol = H("ol", { class: "r3-ladder", "aria-label": "The scale ladder, nation at the top" }, act), btns = {};
          D.scales.slice().reverse().forEach(function (s) {
            var li = H("li", null, ol), bt = H("button", { type: "button", "aria-pressed": "false" }, li);
            H("b", { text: s.id }, bt); H("span", { text: s.name }, bt); H("small", { text: "Decides " + s.decides + "." }, bt);
            bt.addEventListener("click", function () { pick(s.id, true); });
            btns[s.id] = bt;
          });
          function pick(id, byReader) {
            var v = V(); v.scale = id; if (byReader) save();
            Object.keys(btns).forEach(function (k) { btns[k].setAttribute("aria-pressed", k === id ? "true" : "false"); btns[k].classList.toggle("right", k === B().scale); });
            api.done();
            api.saw(id === B().scale ? "Right. " + B().scaleWhy : "A researcher would place it at " + B().scale + ". " + B().scaleWhy, id !== B().scale);
          }
          if (V().scale) pick(V().scale, false);
        } },
      { text: "Draw the [[system-boundary|boundary]]. Sort each item: inside (the study decides or computes it), given (a fixed input), or left out and stated as a limit.",
        build: function (act, api) {
          if (needBrief(act, api)) return;
          var b = B(), v = V(), list = b.boundary.map(function (c) { return { id: c.id, text: c.text, bin: c.bin, why: c.why }; });
          v.placed = v.placed || {};
          var cs = LX.CardSort(act, { bins: D.bins, cards: list, maxWhy: 8, checkLabel: "Check my boundary", onCheck: report });
          cs.place(v.placed); v.placed = cs.placed();
          act.addEventListener("click", function () { V().placed = cs.placed(); save(); });
          var foot = cs.el.querySelector(".lx-step-foot");
          var rest = H("button", { class: "lx-btn ghost small", type: "button", text: "Place the rest for me" }, null);
          foot.insertBefore(rest, foot.children[1] || null);
          var out = H("div", { class: "lx-xcard", hidden: true }, act);
          rest.addEventListener("click", function () {
            var m = cs.placed(), n = {}; Object.keys(m).forEach(function (k) { n[k] = m[k]; });
            list.forEach(function (c) { if (!n[c.id]) n[c.id] = c.bin; });
            cs.place(n); V().placed = cs.placed(); save(); cs.check();
          });
          function report(g) {
            if (g.placed < g.total) { api.saw("Place every item first: " + (g.total - g.placed) + " still in the pool.", true); return; }
            var m = cs.placed();
            out.innerHTML = ""; out.hidden = false;
            LX.Boundary(out, { title: "Your boundary", lede: "As you sorted it. A study states all three lists, so a reader knows what the answer covers.",
              cols: D.bins.map(function (bin) { return { title: bin.label + ": " + bin.sub, items: list.filter(function (c) { return m[c.id] === bin.id; }).map(function (c) { return c.text; }) }; }) });
            api.done();
            api.saw("You sorted " + g.right + " of " + g.total + " as a researcher would. The “left out” list is not a weakness: stating it is what makes the answer usable.");
            LX.emit("layout");
          }
          if (Object.keys(v.placed).length === list.length) cs.check();
        } },
      { text: "Pick a [[time-step|time step]] and a [[horizon|horizon]]. The step must show what the metric needs; the horizon must cover the decision.",
        build: function (act, api) {
          if (needBrief(act, api)) return;
          showQ(act);
          var b = B(), two = H("div", { class: "r3-two" }, act), lines = {};
          [["step", "Time step", b.steps], ["horizon", "Horizon", b.horizons]].forEach(function (g) {
            var fs = H("fieldset", null, two), name = LX.uid("r3" + g[0]); H("legend", { text: g[1] }, fs);
            g[2].forEach(function (o) {
              var lab = H("label", null, fs), inp = H("input", { type: "radio", name: name, value: o.id }, lab);
              lab.appendChild(document.createTextNode(o.label));
              inp.checked = V()[g[0]] === o.id;
              inp.addEventListener("change", function () { if (inp.checked) { V()[g[0]] = o.id; save(); paint(); } });
            });
            lines[g[0]] = H("p", { class: "r3-fit", "aria-live": "polite" }, fs);
          });
          function paint() {
            var v = V(), s = option(b.steps, v.step), h = option(b.horizons, v.horizon);
            lines.step.innerHTML = s ? fitLine(s) : "";
            lines.horizon.innerHTML = h ? fitLine(h) : "";
            if (s && h) {
              api.done();
              api.saw(s.fit === "good" && h.fit === "good" ? "Both fit this brief. Different questions at the same scale can still need different steps." :
                "Read the notes: a choice marked “helps with a part” can work as a check, but not as the main design.", !(s.fit === "good" && h.fit === "good"));
            }
          }
          paint();
        } },
      { text: "Choose a [[method-family|method family]]. Tap several to compare: more than one can fit, and the notes say how well each fits this brief.",
        build: function (act, api) {
          if (needBrief(act, api)) return;
          showQ(act);
          var b = B(), grid = H("div", { class: "r3-fams", role: "group", "aria-label": "Nine method families" }, act), btns = {};
          var info = H("div", { class: "r3-card", "aria-live": "polite", hidden: true }, act);
          D.families.forEach(function (f) {
            var bt = H("button", { type: "button", "aria-pressed": "false", text: f.label }, grid);
            bt.addEventListener("click", function () { pick(f.id, true); });
            btns[f.id] = bt;
          });
          function pick(id, byReader) {
            var f = family(D, id), ft = fit(b, id), v = V();
            if (v.method !== id && byReader) { v.other = v.other === id ? null : v.other; }
            v.method = id; if (byReader) save();
            Object.keys(btns).forEach(function (k) { btns[k].setAttribute("aria-pressed", k === id ? "true" : "false"); });
            info.hidden = false;
            info.innerHTML = "<dt>" + LX.esc(f.label) + " for this brief</dt><dd>" + fitLine(ft) + "</dd><dt>It answers</dt><dd>" + LX.esc(f.answers)
              + "</dd><dt>Its main limit</dt><dd>" + LX.esc(f.limit) + "</dd>";
            var n = D.families.filter(function (x) { return b.fits[x.id][0] === "good"; }).map(function (x) { return x.label.toLowerCase(); });
            api.done();
            api.saw(ft.fit === "poor" ? "A poor fit for this question; try another family, or change the question." :
              "Your choice: " + f.label.toLowerCase() + ". For this brief, " + n.join(" and ") + " fit well; next, defend yours against two alternatives.", ft.fit === "poor");
            LX.emit("layout");
          }
          if (V().method) pick(V().method, false);
        } },
      { text: "Defend your choice against two alternatives: a simpler version in the same family, and one from another family. End with the method's main limit.",
        build: function (act, api) {
          if (needBrief(act, api)) return;
          var b = B(), v = V(), m = family(D, v.method);
          if (!m) { H("p", { class: "lx-hint", text: "Choose a method family in step 5 first." }, act); return; }
          H("p", { class: "r3-q", text: "Your family: " + m.label + ". " + D.fitLabels[b.fits[m.id][0]] + " for this brief." }, act);
          var form = H("div", { class: "r3-form" }, act);
          var l1 = H("label", null, form); l1.appendChild(document.createTextNode("Alternative 1: a simpler or different version in the same family"));
          var same = H("input", { type: "text", maxlength: "200", placeholder: "for example, a single run instead of many" }, l1); same.value = v.same || "";
          var l2 = H("label", null, form); l2.appendChild(document.createTextNode("Alternative 2: a family you did not choose"));
          var sel = H("select", null, l2); H("option", { value: "", text: "Pick a family" }, sel);
          D.families.forEach(function (f) { if (f.id !== m.id) H("option", { value: f.id, text: f.label }, sel); });
          sel.value = v.other && v.other !== m.id ? v.other : "";
          var l3 = H("label", null, form); l3.appendChild(document.createTextNode("Your defence, in three or four sentences"));
          var ta = H("textarea", { maxlength: "1500" }, l3); ta.value = v.text || "";
          var row = H("div", { class: "r3-row" }, act);
          var tpl = H("button", { class: "lx-btn ghost small", type: "button", text: "Start from a template" }, row);
          var cmp = H("button", { class: "lx-btn small", type: "button", text: "Compare with an example defence" }, row);
          var tmsg = H("span", { class: "lx-hint", "aria-live": "polite" }, row);
          var cks = H("ul", { class: "r3-cks", "aria-live": "polite" }, act);
          H("p", { class: "lx-hint", text: "These checks look for the parts of a defence, not for its quality." }, act);
          var ex = H("dl", { class: "r3-card", hidden: true }, act);
          function paint() {
            cks.innerHTML = "";
            defenceChecks(V(), m.id).forEach(function (c) {
              H("li", { class: c.ok ? "ok" : "warn", html: LX.icon(c.ok ? "check" : "question") + "<span><span class=\"lx-sr\">" + (c.ok ? "Done: " : "To do: ") + "</span>" + LX.esc(c.label) + "</span>" }, cks);
            });
          }
          function keep() { var x = V(); x.same = same.value; x.other = sel.value || null; x.text = ta.value; save(); paint(); }
          same.addEventListener("input", keep); sel.addEventListener("change", keep); ta.addEventListener("input", keep);
          tpl.addEventListener("click", function () {
            if (String(ta.value).trim()) { tmsg.textContent = "The template fills an empty box only: clear yours first, or keep writing."; return; }
            var o = family(D, sel.value);
            ta.value = "I chose " + m.label.toLowerCase() + " over " + (same.value.trim() || "[a simpler version]") + ", because … . I chose it over "
              + (o ? o.label.toLowerCase() : "[another family]") + ", because … . Its main limit is …; I reduce it by … .";
            keep(); ta.focus();
          });
          cmp.addEventListener("click", function () {
            var d = b.defence, dm = family(D, d.method), dother = family(D, d.other);
            ex.hidden = false; ex.innerHTML = "";
            [["A researcher's family", dm.label], ["Alternatives", d.same + "; " + dother.label.toLowerCase()], ["Defence", d.text]].forEach(function (p) { H("dt", { text: p[0] }, ex); H("dd", { text: p[1] }, ex); });
            api.done();
            api.saw(d.method === m.id ? "Same family as yours: compare the reasons, not the words." :
              "A different family from yours. Both can be defended; " + dm.label.toLowerCase() + " fits this brief well, and the reasons are what a reviewer reads.");
            LX.emit("layout");
          });
          paint();
        } },
      { text: "Your design card: the brief with every choice you made. Copy it into your notes, then do the same for your own question.",
        free: true,
        build: function (act, api) {
          if (needBrief(act, api)) return;
          var txt = designText(D, st), dl = H("dl", { class: "r3-card" }, act);
          txt.split("\n").slice(1).forEach(function (line) { var i = line.indexOf(": "); H("dt", { text: line.slice(0, i) }, dl); H("dd", { text: line.slice(i + 2) }, dl); });
          var row = H("div", { class: "r3-row" }, act);
          var cp = H("button", { class: "lx-btn ghost small", type: "button", text: "Copy as text" }, row);
          var msg = H("span", { class: "lx-hint", "aria-live": "polite" }, row);
          var box = H("textarea", { readonly: true, rows: "8", hidden: true, "aria-label": "Your design card as text", class: "r3-copy" }, act);
          box.style.width = "100%";
          cp.addEventListener("click", function () {
            box.hidden = false; box.value = txt;
            LX.copyText(txt, { select: box }).then(function (ok) { msg.textContent = ok ? "Copied to the clipboard." : "Select the text and copy it."; });
          });
        } }
    ];
    var cardsUI = LX.StepCards(live, { id: "r3-steps", steps: steps });

    // ---- exemplars, flowchart, comparison table
    var ex = document.getElementById("r03-exemplars");
    if (ex) {
      ex.innerHTML = "";
      LX.Exemplars(H("div", { class: "lx-xcard" }, ex), D.exemplars);
      var A = brief(D, "hospital"), Bv = brief(D, "rebate");
      LX.Flowchart(H("div", { class: "lx-xcard" }, ex), {
        title: "From a typed question to a defended method",
        lede: "The studio's steps as a flowchart. Trace a brief, or the habit of reaching for a familiar method.",
        nodes: {
          start: { t: "A typed question", k: "end" },
          sc: { t: "Place it on the scale ladder", tN: ["Place it on", "the scale ladder"], s: "who decides, what physics", sN: "who decides" },
          bd: { t: "Draw the boundary", s: "inside, given, left out", sN: "inside, given, out" },
          rh: { t: "Time step and horizon", tN: ["Time step", "and horizon"] },
          mf: { t: "Choose a method family", tN: ["Choose a", "method family"] },
          q1: { t: "Answers this type?", tN: ["Answers", "this type?"], k: "q" },
          alt: { t: "Try another family", s: "or change the question", sN: "or the question", k: "end" },
          q2: { t: "Beats two alternatives?", tN: ["Beats two", "alternatives?"], k: "q" },
          done: { t: "Write the defence", s: "and the method's limit", sN: "and its limit", k: "end" }
        },
        cols: 3, at: { start: [0, 0], sc: [1, 0], bd: [2, 0], rh: [2, 1], mf: [1, 1], q1: [1, 2.1], q2: [1, 3.3], alt: [2, 3.3], done: [1, 4.5] },
        colsN: 2, atN: { start: [0, 0], sc: [0, 1], bd: [0, 2], rh: [0, 3], mf: [0, 4], q1: [0, 5], q2: [0, 6.2], alt: [1, 6.2], done: [0, 7.4] },
        edges: [["start", "sc"], ["sc", "bd"], ["bd", "rh"], ["rh", "mf"], ["mf", "q1"], ["q1", "alt", "no"], ["q1", "q2", "yes"], ["q2", "alt", "no"], ["q2", "done", "yes"]],
        traces: [
          { label: A.short, path: ["start", "sc", "bd", "rh", "mf", "q1", "q2", "done"], text: "S1, hourly steps over a typical year plus the outage; a sizing model, defended against a continuous version and a simulation." },
          { label: Bv.short, path: ["start", "sc", "bd", "rh", "mf", "q1", "q2", "done"], text: "S3, monthly counts from 2019 to 2025; a difference-in-differences comparison, defended against a before-and-after count and an agent-based model." },
          { label: "Habit: optimization for the rebate", path: ["start", "sc", "bd", "rh", "mf", "q1", "alt"], text: plainMarks(Bv.fits.opt[1]) + " An evaluative question needs a comparison of what happened." }
        ],
        sel: 0
      });
      var tiers = ["var(--lx-tier-1)", "var(--lx-tier-2)", "var(--lx-tier-3)", "var(--lx-tier-4)", "var(--lx-tier-5)"];
      LX.CompareTable(H("div", { class: "lx-xcard" }, ex), {
        title: "Nine method families, side by side", text: true,
        columns: [{ key: "name", label: "Family", main: true }, { key: "answers", label: "Answers" }, { key: "needs", label: "Needs" }, { key: "limit", label: "Main limit" }],
        rows: D.families.map(function (f, i) {
          return { key: f.id, color: tiers[i % 5], name: f.label, note: "Typical types: " + f.types.join(", "), answers: f.answers, needs: f.needs, limit: f.limit };
        }),
        sorts: [{ label: "All nine", order: D.families.map(function (f) { return f.id; }), note: "No family is the default: the question type, the data and the decision set the choice." }]
      });
    }

    // ---- self-check: the scale strip (with the reader's brief) and the rubric
    var sc = document.getElementById("r03-rubric"), strip = null;
    if (sc) {
      sc.innerHTML = "";
      var c1 = H("div", { class: "lx-xcard" }, sc), hd = H("header", { class: "lx-x-head" }, c1); H("h3", { text: "Five scales: who decides, and typical steps and horizons" }, hd);
      H("p", { class: "lx-lede", text: "Typical choices, not rules: check yours against them, and say why if you differ." }, c1);
      strip = H("ol", { class: "r3-strip" }, c1);
      LX.Rubric(H("div", { class: "lx-xcard" }, sc), D.rubric);
    }
    function paintStrip() {
      if (!strip) return;
      strip.innerHTML = "";
      var b = brief(D, st.brief), mine = b && st.per[b.id] && st.per[b.id].scale;
      D.scales.forEach(function (s) {
        var li = H("li", { class: b && s.id === b.scale ? "mine" : "" }, strip);
        H("span", { class: "code", text: s.id }, li); H("b", { text: s.name }, li);
        H("span", { text: "Decides " + s.decides + "; " + s.who + "." }, li);
        H("span", { text: "Time step: " + s.step + "." }, li); H("span", { text: "Horizon: " + s.horizon + "." }, li);
        if (b && s.id === b.scale) H("span", { class: "tag", text: "Your brief sits here" + (mine && mine !== s.id ? " (you placed it at " + mine + ")" : "") + "." }, li);
      });
    }
    paintStrip();
    root.lxLesson = { data: D, model: model };
    // demo states: "mid" = the hospital brief chosen and placed on the ladder (step 2 shown); "step-N" = the hospital brief
    // with a researcher's choices made up to step N (step 3: one item left out where it is given; step 6: compared)
    LX.demo(root, function (state) {
      var m = /^step-(\d)$/.exec(state), n = state === "mid" ? 2 : m ? +m[1] : 0;
      if (!n || n > 7) return null;
      var b = brief(D, "hospital"), v = {}; st.brief = b.id; st.per.hospital = v;
      if (n >= 2) v.scale = "S1";
      if (n >= 3) { v.placed = {}; b.boundary.forEach(function (c) { v.placed[c.id] = c.bin; }); v.placed.a5 = "out"; }
      if (n >= 4) { v.step = "1h"; v.horizon = "yr"; }
      if (n >= 5) v.method = "opt";
      if (n >= 6) { v.same = b.defence.same; v.other = b.defence.other; v.text = "I chose a sizing MILP over an LP with continuous sizes, because the generator comes in whole units. I chose it over a simulation, because the question asks for the cheapest mix. Its main limit is perfect foresight."; }
      save(); cardsUI.go(n - 1);
      if (n === 6) setTimeout(function () { [].forEach.call(live.querySelectorAll("button"), function (x) { if (/^Compare with an example defence$/.test(x.textContent)) x.click(); }); }, 60);
      return { view: "hospital brief, step " + n };
    }, cardsUI);
  });
})();
