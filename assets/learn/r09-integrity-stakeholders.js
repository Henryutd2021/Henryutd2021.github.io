// r09-integrity-stakeholders.js — Research studio R9, "Research integrity, and working with the people your study is
// about" (W2, 2026-11-03).
//
// Data: assets/learn/data/r09-integrity-stakeholders.json — the five norms and ten practices for the sort, six fictional
// dilemmas set around Prairie Town (each with three options, a verdict, the norm and its primary source and section),
// the stakeholder rings, the integrity-statement fields, the exemplars, a Steelman card, the rubric line and the sources.
// No real person or organisation appears; numbers in the cases are illustrative.
//
// What the reader does (step cards): sort ten practices by the norm they serve (LX.CardSort); work through six dilemmas
// (a funder wants a headline, a convenient scenario, a co-author's data, a community meeting, a survey without consent,
// an error found after publication), each time picking an action and reading the norm behind it; write an integrity
// statement for their own study and copy it. The explain layer: the exemplars (LX.Exemplars), a flowchart for any new
// dilemma (LX.Flowchart), the stakeholder map (LX.StakeholderMap, components/stakeholders.js: three rings of people and
// what each is owed) and a Steelman card (LX.Steelman); then the rubric (integrity) and a checklist.
//
// The pure model is exported for Node: _tests/learn/test_r09-integrity-stakeholders.js checks the data, the scoring and the
// fallbacks, and writes the no-JS blocks (task, exemplars, rubric) in its --write mode.
(function () {
  "use strict";
  var NORM_EXTRA = { stakeholders: "Working with stakeholders" };

  // ---------------------------------------------------------------- pure model
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function normLabel(D, id) { var n = D.norms.filter(function (x) { return x.id === id; })[0]; return n ? n.label : NORM_EXTRA[id] || id; }
  function best(d) { return d.options.filter(function (o) { return o.verdict === "good"; })[0]; }
  // the reader's first picks: how many dilemmas got the defensible action first time
  function score(D, picks) {
    var n = 0, done = 0;
    D.dilemmas.forEach(function (d) { var p = picks[d.id]; if (p) { done++; if (p === best(d).id) n++; } });
    return { right: n, done: done, total: D.dilemmas.length };
  }
  // every stakeholder with its ring and the dilemmas that involve it
  function people(D) {
    var out = [];
    D.stakeholders.forEach(function (r) { r.items.forEach(function (s) {
      out.push({ id: s.id, ring: r.ring, label: s.label, owed: s.owed, dilemmas: D.dilemmas.filter(function (d) { return d.who.indexOf(s.id) >= 0; }).map(function (d) { return d.title; }) });
    }); });
    return out;
  }
  // the reader's integrity statement as plain text
  function statement(D, v) {
    v = v || {};
    return ["INTEGRITY STATEMENT"].concat(D.statement.map(function (f) { return f.label + ": " + ((v[f.id] || "").trim() || "(to write)"); })).join("\n");
  }
  function exemplarsSpec(D) {
    var E = D.exemplars;
    return { title: "Two integrity statements for the same study", task: E.task, id: "r9-ex",
      answers: [{ key: "weak", label: "Weak answer", level: "Developing", parts: E.weak }, { key: "good", label: "Strong answer", level: "Proficient", parts: E.good }],
      diff: E.diff, note: E.note };
  }
  // the no-JS version of the task (what to produce is the page's task card, above the interactive): the norms, the six
  // dilemmas with every option and its verdict
  function staticTask(D) {
    var h = [], V = { good: "Defensible", ok: "Partly", bad: "Hard to defend" };
    h.push('<p class="lx-eyebrow">Five norms</p><ul>');
    D.norms.forEach(function (n) {
      h.push("<li><b>" + esc(n.label) + "</b> (" + esc(n.sub) + "): " + D.practices.filter(function (p) { return p.bin === n.id; }).map(function (p) { return esc(p.text); }).join(" ") + "</li>");
    });
    h.push("</ul>");
    D.dilemmas.forEach(function (d, i) {
      h.push('<p class="lx-eyebrow">Dilemma ' + (i + 1) + " · " + esc(d.title) + " · " + esc(normLabel(D, d.norm)) + "</p>");
      h.push("<p>" + esc(d.case).replace(/\[\[([a-z0-9-]+)\|([^\]]+)\]\]/g, function (m, id, w) { return "<span class=\"lx-term\" data-" + "term=\"" + id + "\">" + w + "</span>"; }) + "</p><ul>");
      d.options.forEach(function (o) { h.push("<li>" + esc(o.text) + " <b>" + V[o.verdict] + ".</b> " + esc(o.why) + "</li>"); });
      h.push('</ul><p class="lx-hint">Source: ' + esc(d.source) + ".</p>");
    });
    return h.join("\n");
  }
  var model = { normLabel: normLabel, best: best, score: score, people: people, statement: statement, exemplarsSpec: exemplarsSpec, staticTask: staticTask };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H;
  function injectCSS() {
    if (document.getElementById("r9-css")) return;
    var css = [
      ".r9-case{margin:0;padding:12px 14px;border-radius:12px;border-left:4px solid var(--lx-accent);background:var(--lx-surface-2);font-size:15.5px;color:var(--lx-ink)}",
      ".r9-opts{display:grid;gap:8px}",
      ".r9-opts .lx-choice{text-align:left;justify-content:flex-start;font:inherit;font-size:15px;color:var(--lx-ink);background:var(--lx-surface)}",
      ".r9-norm{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;font-size:13.5px;color:var(--lx-ink-2)}",
      ".r9-pill{display:inline-flex;align-items:center;min-height:26px;padding:2px 10px;border-radius:999px;border:1px solid var(--lx-line-2);font-family:var(--lx-f-display);font-weight:500;font-size:13px;color:var(--lx-ink)}",
      ".r9-form{display:grid;gap:10px}",
      ".r9-form label{display:grid;gap:4px;font-family:var(--lx-f-display);font-weight:500;font-size:14px;color:var(--lx-ink)}",
      ".r9-form .lx-hint{font-family:var(--lx-f-body,inherit);font-weight:400}",
      ".r9-form textarea{font:inherit;font-size:14.5px;min-height:44px;padding:7px 10px;border-radius:10px;border:1px solid var(--lx-line-2);background:var(--lx-surface);color:var(--lx-ink);resize:vertical;width:100%}",
      ".r9-row{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center}",
      ".r9-pre{margin:0;padding:8px 10px;border-radius:10px;background:var(--lx-surface-2);border:1px solid var(--lx-line);font-family:var(--lx-f-mono);font-size:12.5px;line-height:1.5;color:var(--lx-ink);white-space:pre-wrap;word-break:break-word}"
    ].join("\n");
    H("style", { id: "r9-css", text: css }, document.head);
  }
  function saw(host, kind, html) {
    host.innerHTML = "";
    H("div", { class: "lx-saw" + (kind === "good" ? "" : " no"), html: LX.icon(kind === "good" ? "check" : "question") + "<div>" + html + "</div>" }, host);
  }
  // the stakeholder map: three rings, a chip per group; a chip opens what the group is owed and the dilemmas it appears in
  // (LX.StakeholderMap, components/stakeholders.js; promoted from this file at the W2 integration)
  function mapRings(D) {
    var P = people(D);
    return D.stakeholders.map(function (r) { return { ring: r.ring, items: r.items.map(function (s) { var p = P.filter(function (x) { return x.id === s.id; })[0]; return { id: s.id, label: s.label, owed: s.owed, also: p.dilemmas }; }) }; });
  }

  function view(live, data, root) {
    var D = data.r09_integrity_stakeholders, picks = LX.store.get("r9-picks", {}) || {};
    function sortStep(act, api) {
      LX.CardSort(act, { bins: D.norms, cards: D.practices, checkLabel: "Check my sort",
        onCheck: function (g) { api.done(); api.saw("**" + g.right + " of " + g.total + "** placed as the course would. Some practices serve two norms (citing a dataset is credit and a licence term); the reasons say which comes first.", g.right < g.total - 3); } });
    }
    function dilemmaStep(d, i) {
      return function (act, api) {
        H("p", { class: "r9-case", html: LX.rich(d.case) }, act);
        var opts = H("div", { class: "r9-opts", role: "group", "aria-label": "What would you do?" }, act), fb = H("div", { "aria-live": "polite" }, act), norm = H("div", { class: "r9-norm", hidden: true }, act);
        H("span", { class: "r9-pill", text: normLabel(D, d.norm) }, norm); H("span", { text: "Source: " + d.source + "." }, norm);
        var bs = d.options.map(function (o) {
          var b = H("button", { class: "lx-choice", type: "button", "aria-pressed": "false", text: o.text }, opts);
          b.addEventListener("click", function () {
            bs.forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); x.classList.remove("right", "wrong"); });
            if (o.verdict !== "ok") b.classList.add(o.verdict === "good" ? "right" : "wrong");
            if (!picks[d.id]) { picks[d.id] = o.id; LX.store.set("r9-picks", picks); }
            saw(fb, o.verdict, "<b>" + (o.verdict === "good" ? "Defensible." : o.verdict === "ok" ? "Partly." : "Hard to defend.") + "</b> " + LX.rich(o.why));
            norm.hidden = false; api.done();
            if (i === D.dilemmas.length - 1) { var s = score(D, picks); api.saw("First picks: **" + s.right + " of " + s.total + "** defensible. The norms are short; applying them under pressure is the skill. Write yours down before the pressure arrives."); }
          });
          return b;
        });
      };
    }
    function statementStep(act, api) {
      var v = LX.store.get("r9-statement", {}) || {};
      var form = H("div", { class: "r9-form" }, act), pre = H("pre", { class: "r9-pre" }, act);
      D.statement.forEach(function (f) {
        var lab = H("label", null, form); H("span", { text: f.label }, lab); H("span", { class: "lx-hint", text: f.hint }, lab);
        var ta = H("textarea", { rows: 2 }, lab); ta.value = v[f.id] || "";
        ta.addEventListener("input", function () { v[f.id] = ta.value; LX.store.set("r9-statement", v); draw(); });
      });
      var row = H("div", { class: "r9-row" }, act), cp = H("button", { class: "lx-btn small", type: "button", text: "Copy my statement" }, row), st = H("span", { class: "lx-hint", "aria-live": "polite", text: "Your statement stays in this browser." }, row);
      H("a", { class: "lx-btn small ghost", href: "#exemplars", text: "Compare with two answers" }, row);
      cp.addEventListener("click", function () { LX.copyText(pre.textContent).then(function (ok) { st.textContent = ok ? "Copied." : "Select the statement and copy it."; }); api.done(); });
      function draw() { pre.textContent = statement(D, v); if (D.statement.filter(function (f) { return (v[f.id] || "").trim(); }).length >= 3) api.done(); }
      draw();
    }
    var steps = [{ text: "Integrity rests on a few norms, such as [[informed-consent|consent]] and declaring [[conflict-of-interest|conflicts of interest]]. Sort ten everyday practices by the norm each serves: tap a card, then its box.", build: sortStep }];
    D.dilemmas.forEach(function (d, i) {
      steps.push({ text: "Dilemma " + (i + 1) + " of 6 · " + d.title + ". Read the case, choose what you would do, then read the norm behind it.", build: dilemmaStep(d, i) });
    });
    steps.push({ text: "Now your own study. Write one or two lines for each part of an integrity statement; at least three parts to finish here, the rest in practice.", build: statementStep });
    var cards = LX.StepCards(live, { id: "r9-steps", steps: steps });
    return { cards: cards, D: D };
  }
  function explain(D) {
    var x = document.getElementById("r09-exemplars"); if (!x) return;
    x.innerHTML = "";
    LX.Exemplars(H("div", { class: "lx-xcard" }, x), exemplarsSpec(D));
    LX.Flowchart(H("div", { class: "lx-xcard" }, x), {
      title: "When a new dilemma lands", lede: "Three questions, in order. A yes adds a duty; every path ends in your statement.",
      nodes: {
        s: { t: "A dilemma", k: "end" },
        q1: { t: "People's data or participation?", tN: ["People's data or", "participation?"], k: "q" },
        a1: { t: "Review and consent first", tN: ["Review and", "consent first"] },
        q2: { t: "Someone else's work or data?", tN: ["Someone else's", "work or data?"], k: "q" },
        a2: { t: "Check the terms; give credit", tN: ["Check terms;", "give credit"] },
        q3: { t: "Would readers conclude differently?", tN: ["Would readers", "conclude otherwise?"], k: "q" },
        a3: { t: "Disclose it fully", tN: ["Disclose it", "fully"], s: "all runs, funding, corrections", sN: "runs, funding" },
        e: { t: "Write it in your statement", tN: ["Write it in your", "statement"], k: "end" }
      },
      cols: 3, at: { s: [1, 0], q1: [1, 1], a1: [2, 2], q2: [1, 3], a2: [2, 4], q3: [1, 5], a3: [2, 6], e: [1, 7] },
      colsN: 2, atN: { s: [0, 0], q1: [0, 1], a1: [1, 2], q2: [0, 3], a2: [1, 4], q3: [0, 5], a3: [1, 6], e: [0, 7] },
      edges: [["s", "q1"], ["q1", "a1", "yes"], ["q1", "q2", "no"], ["a1", "q2"], ["q2", "a2", "yes"], ["q2", "q3", "no"], ["a2", "q3"], ["q3", "a3", "yes"], ["q3", "e", "no"], ["a3", "e"]],
      traces: [
        { label: "The survey", path: ["s", "q1", "a1", "q2", "q3", "e"], text: "People's answers: ethics review and consent before the first door. Nothing else is triggered." },
        { label: "A co-author's data", path: ["s", "q1", "a1", "q2", "a2", "q3", "e"], text: "Household meter data and someone else's agreement: both duties apply." },
        { label: "The funder's headline", path: ["s", "q1", "q2", "q3", "a3", "e"], text: "Readers would conclude 9% when the range is 2 to 9%: give the range and declare the funding." },
        { label: "The error", path: ["s", "q1", "q2", "q3", "a3", "e"], text: "The main result changes: tell co-authors and the journal, and correct the record." }
      ], sel: 0 });
    var sm = H("div", { class: "lx-xcard" }, x), hd = H("header", { class: "lx-x-head" }, sm);
    H("h3", { text: "Who your study owes what" }, hd);
    H("p", { class: "lx-lede", html: LX.rich("Three rings of [[stakeholder|stakeholders]] around a Prairie Town study. The fairness questions are who pays and who benefits, who decides, and whose concerns are recognised.") }, sm);
    LX.StakeholderMap(sm, { rings: mapRings(D) });
    LX.Steelman(H("div", { class: "lx-xcard" }, x), D.steelman);
  }
  function selfcheck(D) {
    var x = document.getElementById("r09-rubric"); if (!x) return;
    x.innerHTML = "";
    LX.Rubric(H("div", { class: "lx-xcard" }, x), { id: "r9-rubric", code: "R9", title: "Rate your statement against the rubric", lede: "Use the statement you wrote for your own study.", competences: D.rubric });
    LX.Checklist(H("div", { class: "lx-xcard" }, x), { id: "r9-checklist", title: "An integrity check for your own study", columns: 2,
      lede: "Tick each line before you submit anything with your name on it.", doneText: "Put the answers in your integrity statement.",
      items: [
        { id: "licences", label: "Licences", text: "The terms of every data source checked, with the attribution each asks for." },
        { id: "credit", label: "Credit", text: "Authorship agreed early; contributor roles written down." },
        { id: "coi", label: "Funding and ties", text: "Funders and your own ties declared, with what the funder could see or change." },
        { id: "ethics", label: "Ethics review", text: "Any work with people reviewed before it starts; consent recorded." },
        { id: "runs", label: "All the runs", text: "Every scenario reported, with how each was chosen." },
        { id: "people", label: "The people affected", text: "Heard before publication, and told how their views were treated." },
        { id: "fix", label: "Corrections", text: "A way for readers to report errors, and a promise to correct them." }
      ] });
  }

  LX.mount("r09", function (live, data, root) {
    injectCSS();
    var V = view(live, data, root);
    explain(V.D); selfcheck(V.D);
    root.lxLesson = { model: model, view: V };
    // demo states: "mid" = dilemma 1 answered with the defensible option; "step-N" = card N
    LX.demo(root, function (st) {
      if (st !== "mid") return null;
      V.cards.go(1);
      setTimeout(function () { var b = live.querySelectorAll(".r9-opts .lx-choice")[1]; if (b) b.click(); }, 40);
      return { view: "dilemma 1 answered" };
    }, V.cards);
  });
})();
