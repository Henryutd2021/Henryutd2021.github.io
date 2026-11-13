/* rubric.js — LX.Rubric: a self-check against the course rubric. Four levels (Not yet,
   Developing, Proficient, Strong) and nine competences, method-neutral; Proficient on every competence is the bar for
   the readiness claim. The reader picks a level for each competence a studio builds, sees its anchored description,
   and copies a plain-text summary.
   var rb = LX.Rubric(host, {
     id: "r1-rubric",            the picks stay in this browser under this key
     code: "R1",                 the studio's code, in the summary's first line
     title: "Rate your question card against the rubric",   lede: "One sentence.",
     competences: ["framing", { id: "method", look: "One line: what to look for in this task." }],
                                 ids of LX.Rubric.COMPETENCES: framing, positioning, method, trust, uncertainty,
                                 accounting, realism, communication, integrity; `look` adds the studio's own line
     onChange: function (picks) {},    picks = { framing: "proficient", method: null }
     note: "One sentence.",
     bar: "the bar for this note" });   optional (capstones): the bar's label, under Proficient, in the static table's
                                 header ("Proficient (the bar for this note)") and in the result line; default "the bar"
   A capstone may also give a competence its own level words, for a deliverable the course's words do not describe (C0
   and C1: a one-page note, not the final project's six-page paper):
     { id: "communication", look: "...", levels: { proficient: "one-page note with ..." } }   developing, proficient
                                 and/or strong; the others stay the course's. The copied summary's first line names the
                                 competences in the capstone's own words. The research studios use neither option.
   Returns { el, picks(), set(id, level), clear(), summary() }.
   The words of the levels are the course rubric's own and are not reworded per studio (a capstone may override one
   competence's, above). A competence may carry `reads`, one line on how its words read for a kind of work they do not
   name (Framing's: a descriptive question), under its name live and under the table in the static version. "Not yet"
   has no anchored
   description there, so it reads "Developing is not reached yet". Each competence is a fieldset of native radio buttons
   (Tab to the group, arrow keys move, Space picks); each radio's label carries its level and the anchored description,
   so the ladder is the control. The result line (aria-live) counts competences at Proficient or above. "Copy my
   self-check" copies the summary (LX.copyText: the clipboard, else select-and-copy from the visible box below it).
   VERSION names the rubric in the summary's first line.
   Node: module.exports = { VERSION, LEVELS, COMPETENCES, competence, count, summary, staticHTML, resultText } (pure). */
(function () {
  "use strict";
  // ---------------------------------------------------------------- the rubric (the course rubric, word for word)
  var VERSION = "the course rubric";
  var LEVELS = [
    { id: "not-yet", label: "Not yet" },
    { id: "developing", label: "Developing" },
    { id: "proficient", label: "Proficient", bar: true },
    { id: "strong", label: "Strong" }
  ];
  var COMPETENCES = [
    { id: "framing", label: "Framing", builtIn: "R1, R3, R10",
      developing: "question vague or untyped; no audience or counterfactual",
      proficient: "typed question with audience or decision-maker, metric with units, counterfactual, scale and boundary; one falsification statement",
      strong: "also explains why the question matters to its audience and what answer would change a decision",
      reads: "for a descriptive question, the counterfactual is the reference its count is compared with; the falsification statement, an expectation stated before counting or a check on the count" },
    { id: "positioning", label: "Positioning", builtIn: "R2",
      developing: "a few sources, no map",
      proficient: "concept matrix of at least 12 sources; a stated gap with evidence",
      strong: "the gap survives a search by a reviewer; closest prior work engaged directly" },
    { id: "method", label: "Method fit", builtIn: "R3, Modeler tier",
      developing: "method chosen by habit",
      proficient: "method defended against two alternatives, one of them a different family",
      strong: "limits of the chosen method stated and partly mitigated" },
    { id: "trust", label: "Trustworthy analysis", builtIn: "R4, R5, CK-M",
      developing: "results cannot be rerun",
      proficient: "reruns from a clean clone (or a complete audit trail); verification log; one validation against real data or an independent reference",
      strong: "independent reproduction by someone else; validation on data not used to build the analysis" },
    { id: "uncertainty", label: "Uncertainty", builtIn: "M7, M8, R6",
      developing: "single numbers",
      proficient: "uncertainties classified; scenario or global sensitivity analysis; results as ranges",
      strong: "decision-relevant uncertainty identified and its value discussed" },
    { id: "accounting", label: "Consistent accounting", builtIn: "A1, A10, A13, R7",
      developing: "costs and emissions on different boundaries",
      proficient: "cost and emissions on one boundary; emissions question named; who pays and who benefits named",
      strong: "distributional and environmental side effects estimated with stated assumptions" },
    { id: "realism", label: "Realism", builtIn: "N1, R7, A6",
      developing: "assumes announced projects exist",
      proficient: "evidence status of key inputs; a 'what the analysis leaves out' list",
      strong: "realism checked with a practitioner or primary documents" },
    { id: "communication", label: "Communication", builtIn: "R8",
      developing: "results without limits",
      proficient: "six-page paper; one key figure; a limits paragraph; a 150-word public summary",
      strong: "a briefing a decision-maker could act on without misreading" },
    { id: "integrity", label: "Integrity", builtIn: "R9",
      developing: "licenses or credit unchecked",
      proficient: "licenses checked, credit and conflicts stated, stakeholders treated fairly",
      strong: "data and code released with documentation where allowed" }
  ];
  var NOT_YET = "Developing is not reached yet.";

  // ---------------------------------------------------------------- pure (no DOM; exported for Node)
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function sentence(t) { t = String(t); return t.charAt(0).toUpperCase() + t.slice(1) + (/[.!?]$/.test(t) ? "" : "."); }
  // a competence by id (or {id, look, levels}), with its level descriptions as sentences; `levels` (a capstone's own
  // words for developing, proficient or strong) replace the course's for those levels, listed in `own`; throws on an
  // unknown id or level
  function competence(c) {
    var id = typeof c === "string" ? c : c && c.id, base = COMPETENCES.filter(function (x) { return x.id === id; })[0];
    if (!base) throw new Error("LX.Rubric: unknown competence " + JSON.stringify(id) + " (one of " + COMPETENCES.map(function (x) { return x.id; }).join(", ") + ")");
    var lv = (c && c.levels) || {}, own = Object.keys(lv);
    own.forEach(function (k) { if (["developing", "proficient", "strong"].indexOf(k) < 0) throw new Error("LX.Rubric: no level " + JSON.stringify(k) + " to reword (developing, proficient, strong)"); });
    function w(k) { return sentence(lv[k] || base[k]); }
    var C = { id: base.id, label: base.label, builtIn: base.builtIn, look: (c && c.look) || null, reads: base.reads || null,
      text: { "not-yet": NOT_YET, developing: w("developing"), proficient: w("proficient"), strong: w("strong") } };
    if (own.length) C.own = ["developing", "proficient", "strong"].filter(function (k) { return lv[k]; });
    return C;
  }
  function rank(level) { for (var i = 0; i < LEVELS.length; i++) if (LEVELS[i].id === level) return i; return -1; }
  function levelLabel(level) { var i = rank(level); return i < 0 ? null : LEVELS[i].label; }
  // { rated, atBar, total, all } for the competences listed
  function count(list, picks) {
    var ids = list.map(function (c) { return competence(c).id; }), rated = 0, atBar = 0;
    ids.forEach(function (id) { var r = rank(picks && picks[id]); if (r >= 0) rated++; if (r >= 2) atBar++; });
    return { rated: rated, atBar: atBar, total: ids.length, all: atBar === ids.length };
  }
  // the result line; `bar` (a capstone's label, e.g. "the bar for this note") replaces the course's readiness bar
  function resultText(n, bar) {
    if (!n.rated) return "Pick a level for each competence.";
    return n.atBar + " of " + n.total + " at Proficient or above" + (n.all ? ": " + (bar || "the bar for the readiness claim") + ", on these competences."
      : "; Proficient on every competence is " + (bar || "the bar") + ".");
  }
  // the plain-text summary a reader copies
  function summary(list, picks, opt) {
    opt = opt || {};
    var own = list.map(competence).filter(function (C) { return C.own; }).map(function (C) { return C.label; });
    var lines = ["Learn · " + (opt.code ? opt.code + " " : "") + "self-check (" + VERSION +
      (own.length ? "; " + own.join(", ") + " in " + (opt.code ? opt.code + "'s" : "this capstone's") + " own words" : "") + ")"];
    list.forEach(function (c) {
      var C = competence(c), p = picks && picks[C.id];
      lines.push(C.label + ": " + (rank(p) < 0 ? "not rated" : levelLabel(p) + " — " + C.text[p]));
    });
    lines.push(resultText(count(list, picks), opt.bar));
    if (opt.date) lines.push("Rated on " + opt.date);
    return lines.join("\n");
  }
  // the no-JS version for the page's fallback: a table of the anchored descriptions; opt.bar labels the bar's column
  function staticHTML(list, opt) {
    var bar = (opt && opt.bar) || "the bar";
    return '<div class="lx-scroll-x"><table class="lx-facts lx-rb-static"><thead><tr><th scope="col">Competence</th>'
      + LEVELS.slice(1).map(function (L) { return '<th scope="col">' + esc(L.label) + (L.bar ? " (" + esc(bar) + ")" : "") + "</th>"; }).join("")
      + "</tr></thead><tbody>" + list.map(function (c) {
        var C = competence(c);
        return '<tr><th scope="row">' + esc(C.label) + (C.look ? '<br><span class="lx-hint">Look for: ' + esc(C.look) + "</span>" : "") + "</th>"
          + LEVELS.slice(1).map(function (L) { return '<td data-l="' + esc(L.label) + '">' + esc(C.text[L.id]) + "</td>"; }).join("") + "</tr>";
      }).join("") + "</tbody></table></div>" + list.map(competence).filter(function (C) { return C.reads; }).map(function (C) {
        return '<p class="lx-hint lx-rb-reads"><b>' + esc(C.label) + ",</b> " + esc(C.reads) + ".</p>";
      }).join("");
  }
  var api = { VERSION: VERSION, LEVELS: LEVELS, COMPETENCES: COMPETENCES, competence: competence, count: count, summary: summary,
              staticHTML: staticHTML, resultText: resultText };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H;
  LX.Rubric = function (host, o) {
    var list = o.competences.map(competence), picks = {};
    var saved = (o.id && LX.store.get(o.id)) || {};
    var box = H("div", { class: "lx-rb" }, host);
    if (o.title) { var hd = H("header", { class: "lx-x-head" }, box); H("h3", { text: o.title }, hd); }
    if (o.lede) H("p", { class: "lx-rb-lede", html: LX.rich(o.lede) }, box);
    var radios = {};
    list.forEach(function (C) {
      picks[C.id] = rank(saved[C.id]) >= 0 ? saved[C.id] : null;
      var fs = H("fieldset", { class: "lx-rb-comp" }, box), name = LX.uid("rb");
      var lg = H("legend", null, fs); H("b", { text: C.label }, lg);
      if (C.look) H("p", { class: "lx-rb-look", html: "<b>Look for:</b> " + LX.rich(C.look) }, fs);
      if (C.reads) H("p", { class: "lx-rb-look lx-rb-reads", html: "<b>" + LX.esc(C.label) + ",</b> " + LX.esc(C.reads) + "." }, fs);
      var row = H("div", { class: "lx-rb-levels" }, fs);
      radios[C.id] = LEVELS.map(function (L) {
        var lab = H("label", { class: "lx-rb-level " + L.id + (L.bar ? " bar" : "") }, row);
        var inp = H("input", { type: "radio", name: name, value: L.id }, lab);
        var t = H("span", { class: "lx-rb-name" }, lab); t.appendChild(document.createTextNode(L.label));
        if (L.bar) H("small", { text: o.bar || "the bar" }, t);
        H("span", { class: "lx-rb-desc", text: C.text[L.id] }, lab);
        inp.addEventListener("change", function () { if (inp.checked) pick(C.id, L.id, true); });
        return { level: L.id, input: inp, label: lab };
      });
    });
    var res = H("p", { class: "lx-rb-result", "aria-live": "polite" }, box);
    var bar = H("div", { class: "lx-rb-foot" }, box);
    var copyBtn = H("button", { class: "lx-btn ghost small", type: "button", text: "Copy my self-check" }, bar);
    var clearBtn = H("button", { class: "lx-link", type: "button", text: "Clear my ratings" }, bar);
    var copyBox = H("div", { class: "lx-rb-copy", hidden: true }, box);
    var area = H("textarea", { readonly: true, rows: String(list.length + 3), "aria-label": "Your self-check as text" }, copyBox);
    var msg = H("p", { class: "lx-hint", "aria-live": "polite" }, copyBox);
    if (o.note) H("p", { class: "lx-hint", html: LX.rich(o.note) }, box);

    function paint() {
      list.forEach(function (C) {
        radios[C.id].forEach(function (r) {
          var on = picks[C.id] === r.level;
          r.input.checked = on;
          r.label.classList.toggle("on", on);
        });
      });
      res.textContent = resultText(count(list, picks), o.bar);
    }
    function pick(id, level, byReader) {
      picks[id] = rank(level) >= 0 ? level : null;
      if (o.id) LX.store.set(o.id, picks);
      paint();
      if (!copyBox.hidden) area.value = text();
      if (byReader && o.onChange) o.onChange(copy());
    }
    function copy() { var c = {}; list.forEach(function (C) { c[C.id] = picks[C.id]; }); return c; }
    function text() { return summary(o.competences, picks, { code: o.code, bar: o.bar, date: new Date().toISOString().slice(0, 10) }); }   // as given: own words kept
    copyBtn.addEventListener("click", function () {
      copyBox.hidden = false; area.value = text();
      (LX.copyText ? LX.copyText(area.value, { select: area }) : Promise.resolve(false)).then(function (ok) {
        msg.textContent = ok ? "Copied to the clipboard." : "Select the text and copy it.";
      });
      if (LX.emit) LX.emit("layout");
    });
    clearBtn.addEventListener("click", function () {
      list.forEach(function (C) { picks[C.id] = null; });
      if (o.id) LX.store.set(o.id, picks);
      copyBox.hidden = true; paint();
      if (o.onChange) o.onChange(copy());
    });
    paint();
    return { el: box, picks: copy, set: function (id, level) { pick(id, level, false); }, clear: function () { clearBtn.click(); }, summary: text };
  };
  Object.keys(api).forEach(function (k) { LX.Rubric[k] = api[k]; });
})();
