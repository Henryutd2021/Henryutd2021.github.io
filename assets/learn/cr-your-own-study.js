// cr-your-own-study.js — CR, the research capstone "Your own study: from a question to a report" (curriculum v2 §7.9,
// §11.2, §3.1, §3.4; wave W7, builder learn-w7-b, 2026-11-07).
//
// A capstone without a sandbox: the reader's study runs in their own tools, at the scale of their chosen route. The page
// guides it in stages and gives the deliverable's first milestone:
//   - the plan (#plan): a track (model-based, empirical or mixed), a scale and its route (model lab and capstone), a
//     method family with its alternatives (R3's families, read from R3's data file), an uncertainty treatment, who will
//     review it for CK-R, the hours a week, and the stages done; kept in a plan link (LX.ShareState: choices only, no
//     free text). From these: a strip of the nine stages sized by their hours, each stage's weeks, milestones and studios,
//     and the plan's checks (alternatives from another family, a family that fits the track, an uncertainty treatment at
//     the rubric's Proficient level that fits the method family, the card's scale: pending until the card has one);
//     the chosen family may be one of its own alternatives only as another method of that family, named in the
//     proposal (the rubric's "two alternatives, one of them a different family"; Codex review #4);
//   - the note (#note): the one-page proposal, from the reader's question card (LX.QuestionCard, which can take the card
//     the reader saved in the question studio R10) and their own words (LX.ReportNote), with the proposal's checks (the
//     card's eight parts, its scale the plan's, two alternatives, the seven fields, one page);
//   - the self-check (#selfcheck): weak and strong fragments of practice on four fictional studies, one pair per rubric
//     competence (LX.Exemplars, one pair at a time), and the whole course rubric (LX.Rubric), whose copied summary is the
//     rubric sheet the capstone hands in.
// Method-neutral: optimization is one family among nine. The hours are the curriculum's planning ranges, not
// measurements. A ReportNote is built for a plan with results; a proposal has none, so the note's run is marked finished
// (no warning line) and its results are left out, and the checks are the proposal's own.
//
// Pure part (exported for _tests/learn/test_cr-your-own-study.js): track, stageHours, totals, timeline, schema, famNames,
// planChecks, altName, noteOf, proposalChecks, milestones and the page's static blocks.
(function () {
  "use strict";
  var CODE = "CR", ID = "cr-your-own-study";
  var W = typeof window !== "undefined" && window.LX ? window.LX : null;
  function lib(name, file) { return (W && W[name]) || require("./components/" + file + ".js"); }
  var SS = lib("ShareState", "sharestate"), RN = lib("ReportNote", "reportnote"), QC = lib("QuestionCard", "questioncard");
  var EXS = lib("Exemplars", "exemplars"), RB = lib("Rubric", "rubric");
  var CORE = W ? { rich: W.rich, lessonRefHTML: W.lessonRefHTML, lessonRef: W.lessonRef } : require("./components/core.js");
  var SCALES = [["S0", "device and plant"], ["S1", "microgrid and community"], ["S2", "regional grid"], ["S3", "city and region"], ["S4", "nation"]];

  // ---------------------------------------------------------------- pure part
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function by(list, id) { return list.filter(function (x) { return x.id === id; })[0] || null; }
  function track(D, id) { return by(D.tracks, id); }
  function fmtH(h) { return (Math.round(h * 10) / 10).toLocaleString("en-US"); }
  // each stage's hours for a track: [lo, hi] from the data, and the typical value, their midpoint
  function stageHours(D, trackId) {
    var T = track(D, trackId);
    return D.stages.map(function (s) { var h = T.hours[s.id]; return { id: s.id, label: s.label, lo: h[0], hi: h[1], typ: (h[0] + h[1]) / 2 }; });
  }
  function totals(D, trackId) {
    return stageHours(D, trackId).reduce(function (a, r) { a.lo += r.lo; a.hi += r.hi; a.typ += r.typ; return a; }, { lo: 0, hi: 0, typ: 0 });
  }
  function weeksFor(h, hpw) { return Math.max(1, Math.ceil(h / hpw - 1e-9)); }
  // the stages in order at the typical hours, at hpw hours a week: the week each starts and ends in (week 1 first)
  function timeline(D, trackId, hpw) {
    var rows = stageHours(D, trackId), cum = 0;
    rows.forEach(function (r) { var a = cum; cum += r.typ; r.from = Math.floor(a / hpw + 1e-9) + 1; r.to = Math.max(r.from, weeksFor(cum, hpw)); });
    var T = totals(D, trackId);
    return { rows: rows, total: T, hpw: hpw, weeks: { typ: weeksFor(T.typ, hpw), lo: weeksFor(T.lo, hpw), hi: weeksFor(T.hi, hpw) } };
  }
  function milestones(D, tl) {
    return D.stages.filter(function (s) { return s.milestone; }).map(function (s) { return { label: s.milestone, week: by(tl.rows, s.id).to }; });
  }
  // R3's family labels by id (the cross-page data: r03-system-and-method.json)
  function famNames(D, R3) {
    var out = {}; D.families.forEach(function (id) { var f = by(R3.families, id); out[id] = f ? f.label : id; }); return out;
  }
  function names(list) { var o = {}; list.forEach(function (x) { o[x.id] = x.label; }); return o; }
  // the plan link's schema (LX.ShareState): choices only, no free text. Bump `version` when a field or meaning changes.
  function schema(D, F) {
    var scaleNames = {}; SCALES.forEach(function (s) { scaleNames[s[0]] = s[0] + " " + s[1]; });
    return { key: "cr", version: 1, title: "Research capstone plan", fields: [
      { id: "track", short: "t", type: "enum", values: D.tracks.map(function (t) { return t.id; }), def: "model", label: "Track", names: names(D.tracks) },
      { id: "scale", short: "s", type: "enum", values: SCALES.map(function (s) { return s[0]; }), def: "S1", label: "Scale", names: scaleNames },
      { id: "family", short: "f", type: "enum", values: D.families, def: "opt", label: "Method family", names: F, range: "one of R3's nine method families" },
      { id: "alts", short: "a", type: "set", values: D.families, def: ["sim", "abm"], label: "Alternatives", names: F, range: "any of the nine families" },
      { id: "unc", short: "u", type: "enum", values: D.uncertainty.map(function (u) { return u.id; }), def: "scen", label: "Uncertainty treatment", names: names(D.uncertainty) },
      { id: "hours", short: "h", type: "int", min: 2, max: 20, def: 6, label: "Hours a week", unit: "h" },
      { id: "review", short: "r", type: "enum", values: D.reviews.map(function (r) { return r.id; }), def: "peer", label: "Mock review by", names: names(D.reviews) },
      { id: "done", short: "d", type: "set", values: D.stages.map(function (s) { return s.id; }), def: [], label: "Stages done", names: names(D.stages), range: "any of the nine stages" }
    ] };
  }
  // the plan's checks: { id, label, ok, why } each; warnings, never blocks
  function planChecks(D, s, F, cardScale) {
    var T = track(D, s.track), U = by(D.uncertainty, s.unc), other = s.alts.filter(function (a) { return a !== s.family; });
    var fits = !!U.ok && (U.fits || []).indexOf(s.family) >= 0;
    var suits = (U.fits || []).map(function (f) { return F[f]; });
    return [
      { id: "alts", label: "Two alternative methods (or more), one from another family", ok: s.alts.length >= 2 && other.length >= 1,
        why: s.alts.length < 2 ? "Pick two alternatives to defend your method against (you have " + s.alts.length + ")." : "Your alternatives are both " + F[s.family] + ": pick one from another family." },
      { id: "fit", label: "A method family that fits the track", ok: T.fits.indexOf(s.family) >= 0,
        why: F[s.family] + " is unusual for " + (T.id === "empirical" ? "an " : "a ") + T.label.toLowerCase() + " study: change the track, or say why in the proposal." },
      { id: "unc", label: "An uncertainty treatment that fits your method, at the rubric's Proficient level", ok: fits,
        why: !U.ok ? U.why || "" : U.label + " suits " + (suits.length > 2 ? suits.slice(0, -1).join(", ") + " and " + suits[suits.length - 1] : suits.join(" and ")) +
          ", not " + F[s.family] + ": pick a treatment that fits your method, or say why in the proposal." },
      { id: "scale", label: "Your question card at the plan's scale", ok: !!cardScale && cardScale === s.scale,
        why: cardScale ? "Your card says " + cardScale + "; the plan says " + s.scale + ". Make them the same, or change your route."
          : "Your question card has no scale yet: set it in the card below." }
    ];
  }
  function route(D, scale) { return D.routes[scale]; }
  // an alternative's name in the plan: the chosen family itself means another method of that family (LP against MILP,
  // say), which the proposal names
  function altName(F, s, a) { return a === s.family ? F[a] + " (another method of the same family, named in the proposal)" : F[a]; }
  // the one-page proposal as an LX.ReportNote note: the card's parts and the plan as its table; the plan's time as its
  // assumptions; the planned uncertainty treatment as its sensitivity line. card: the question card's values (cleaned).
  function noteOf(D, s, card, F, link) {
    var tl = timeline(D, s.track, s.hours), T = track(D, s.track), R = route(D, s.scale), U = by(D.uncertainty, s.unc), V = by(D.reviews, s.review);
    var c = QC.clean(card || {}), ty = QC.TYPES.filter(function (t) { return t.id === c.type; })[0], dash = "(not written yet)";
    var scaleWords = function (id) { var x = SCALES.filter(function (y) { return y[0] === id; })[0]; return x ? x[0] + " " + x[1] : dash; };
    var plan = [
      { label: "Question", value: c.question || dash },
      { label: "Type", value: ty ? ty.label : dash },
      { label: "Audience or decision-maker", value: c.audience || dash },
      { label: "Metric", value: (c.metric || dash) + (c.units ? " (" + c.units + ")" : "") },
      { label: "Compared with", value: c.counterfactual || dash },
      { label: "Scale and boundary", value: c.scale || c.boundary ? scaleWords(c.scale) + "; " + (c.boundary || dash) : dash },
      { label: "I would be wrong if", value: c.wrong || dash },
      { label: "Main uncertainty", value: c.uncertainty || dash },
      { label: "Track", value: T.label + ": " + T.short },
      { label: "Scale route", value: scaleWords(s.scale) + ": model lab " + R.lab + ", capstone " + R.cap },
      { label: "Method", value: F[s.family] + "; alternatives: " + (s.alts.length ? s.alts.map(function (a) { return altName(F, s, a); }).join(", ") : "none yet") },
      { label: "Mock review (CK-R)", value: V.label },
      { label: "Time", value: "about " + s.hours + " h a week: about " + tl.weeks.typ + " weeks (" + tl.weeks.lo + " to " + tl.weeks.hi + ")" },
      { label: "Milestones", value: milestones(D, tl).map(function (m) { return m.label + " by week " + m.week; }).join("; ") }
    ];
    return {
      heading: "Research proposal: " + (T.id === "empirical" ? "an " : "a ") + T.label.toLowerCase() + " study at " + s.scale,
      link: link, made: "the research capstone's planner",
      run: { ok: true, stale: false },   // a proposal has no run: no warning line (see the file's header)
      plan: plan,
      assumptions: ["The weeks assume about " + s.hours + " hours a week, and move if that changes",
        "The hours are the course's planning ranges (" + tl.total.lo + " to " + tl.total.hi + " for the study), not a forecast of yours"],
      sensitivity: "Planned: " + U.line.charAt(0).toLowerCase() + U.line.slice(1) + (T.id === "mixed" ? " " + mixedLine(s) : ""),
      footer: "A plan for your own study. The checks see whether each part is there, not how good it is: the rubric does that, and a mentor's review helps most.",
      cardOK: QC.check(c).all,
      scaleOK: !!c.scale && c.scale === s.scale,
      altsOK: planChecks(D, s, F, null)[0].ok
    };
  }
  // a mixed study treats both parts: the numbers get a range, the qualitative findings triangulation (Codex review #6)
  function mixedLine(s) {
    return s.unc === "tri" ? "Mixed study: the numbers need a range too (scenarios, a sensitivity analysis or intervals); say which."
      : "Mixed study: the qualitative findings need triangulation too; say how.";
  }
  // the proposal's checks for LX.ReportNote (the deliverable's first milestone)
  function proposalChecks() {
    return ["link", "fields",
      { id: "card", label: "Your question card: all eight parts filled in", test: function (n) { return !!n.cardOK; } },
      { id: "scale", label: "Your question card's scale is the plan's", test: function (n) { return !!n.scaleOK; } },
      { id: "alts", label: "Two alternative methods, one from another family", test: function (n) { return !!n.altsOK; } },
      "page"];
  }

  // ---- static blocks (written into the page by the test's --write mode, from the same data)
  function lessonLinks(P, codes) { return codes.map(function (c) { return CORE.lessonRefHTML(P, c); }).join(", "); }
  function staticTracks(D, P) {
    return '<div class="cr-tracks">' + D.tracks.map(function (t) {
      return '<div class="cr-track"><p class="lx-eyebrow">' + esc(t.label) + "</p><p><b>" + esc(t.short.charAt(0).toUpperCase() + t.short.slice(1)) + ".</b> " + CORE.rich(t.builds) + "</p>" +
        '<dl class="cr-dl"><div><dt>Questions</dt><dd>' + esc(t.types) + "</dd></div><div><dt>Rerun</dt><dd>" + CORE.rich(t.trust) + "</dd></div>" +
        "<div><dt>Lessons</dt><dd>" + lessonLinks(P, t.lessons) + "</dd></div></dl></div>";
    }).join("") + "</div>";
  }
  function stageLessons(P, s) {
    var x = lessonLinks(P, s.lessons);
    if (s.route === "lab") x += ", your route's model lab";
    if (s.route === "cap") x += ", your route's capstone";
    return x;
  }
  // a stage's "done when" as a short checklist (one check per item)
  function doneList(s) { return '<ul class="cr-done-l">' + s.done.map(function (d) { return "<li>" + CORE.rich(d) + "</li>"; }).join("") + "</ul>"; }
  function staticStages(D, P) {
    var H = D.tracks.map(function (t) { return t.label; });
    return '<div class="lx-scroll-x"><table class="lx-facts cr-stages-t"><thead><tr><th scope="col">Stage</th><th scope="col">Do, then check</th><th scope="col">Studios</th><th scope="col">Hours: ' + esc(H.join(" · ")) + "</th></tr></thead><tbody>" +
      D.stages.map(function (s, i) {
        return '<tr><th scope="row">' + (i + 1) + ". " + esc(s.label) + '</th><td data-l="Do, then check">' + CORE.rich(s.does) + doneList(s) + '</td><td data-l="Studios">' + stageLessons(P, s) + '</td><td data-l="Hours" class="n">' +
          D.tracks.map(function (t) { var h = t.hours[s.id]; return h[0] === h[1] ? String(h[0]) : h[0] + "–" + h[1]; }).join(" · ") + "</td></tr>";
      }).join("") +
      '<tr><th scope="row">All</th><td data-l="Do, then check">The study, from question to report.</td><td data-l="Studios">The studios above</td><td data-l="Hours" class="n">' +
      D.tracks.map(function (t) { var T = totals(D, t.id); return T.lo + "–" + T.hi; }).join(" · ") + "</td></tr></tbody></table></div>";
  }
  function staticRoutes(D) {
    return '<table class="lx-facts cr-routes-t"><thead><tr><th scope="col">Scale</th><th scope="col">Model lab</th><th scope="col">Capstone</th></tr></thead><tbody>' +
      SCALES.map(function (s) { var R = D.routes[s[0]]; return "<tr><td>" + s[0] + " " + esc(s[1]) + "</td><td>" + R.lab + "</td><td>" + R.cap + "</td></tr>"; }).join("") + "</tbody></table>";
  }
  // the scene's no-JS version: the model-based track's strip at 6 hours a week, with its legend as the text version
  function staticStrip(D) {
    var tl = timeline(D, "model", 6);
    return '<p class="cr-strip-lede">The model-based track: about ' + fmtH(tl.total.typ) + " hours (" + tl.total.lo + " to " + tl.total.hi + "). At 6 hours a week, about " + tl.weeks.typ + " weeks (" + tl.weeks.lo + " to " + tl.weeks.hi + ").</p>" +
      '<div class="cr-strip" aria-hidden="true" style="grid-template-columns: ' + tl.rows.map(function (r) { return "minmax(26px, " + r.typ + "fr)"; }).join(" ") + '">' +
      tl.rows.map(function (r, i) { return '<span class="cr-seg' + (D.stages[i].milestone ? " ms" : "") + '">' + (i + 1) + "</span>"; }).join("") + "</div>" +
      '<ol class="cr-legend">' + tl.rows.map(function (r) { return "<li>" + esc(r.label) + " · " + fmtH(r.typ) + " h</li>"; }).join("") + "</ol>" +
      '<p class="lx-hint cr-ms-key">' + esc(msKey(D)) + "</p>";
  }
  // the strip's key: which stages end on a milestone (their segments are underlined)
  function msKey(D) {
    return "Underlined: a stage that ends on a milestone (" + D.stages.map(function (s, i) { return s.milestone ? (i + 1) + ", " + s.milestone : null; }).filter(Boolean).join("; ") + ").";
  }
  function staticPlan(D, F) { var S = schema(D, F); return SS.staticHTML(S, SS.defaults(S), { head: "Your choice", planHead: "Starting plan" }); }
  function staticOutline(D) {
    var top = D.fields.filter(function (f) { return f.at === "top"; }), rest = D.fields.filter(function (f) { return f.at !== "top"; });
    var li = function (k, v) { return "<li><b>" + esc(k) + ":</b> " + esc(v) + "</li>"; };
    return '<ol class="lx-rn-outline">' + li("Title and plan link", "the plan's link from the planner above, and the date") + top.map(function (f) { return li(f.label, f.hint); }).join("") +
      li("The plan", "your question card's eight parts; the track, the scale route, the method and its alternatives, the mock review, the time and the milestones") +
      li("Assumptions", "the hours a week the weeks rest on") + li("Sensitivity", "the uncertainty treatment you plan") +
      rest.map(function (f) { return li(f.label, f.hint); }).join("") + "</ol>";
  }
  function exOpts(D, k) {
    var E = D.exemplars[k];
    return { title: E.title, task: E.task, answers: E.answers, lines: !!E.lines, id: "cr-ex-" + E.comp, note: "Both fragments are illustrative; the study is fictional and its numbers are assumed, not computed." };
  }
  // the line above a pair: its stage and its (fictional) study
  function exWhere(D, k) {
    var E = D.exemplars[k], s = by(D.stages, E.stage);
    return "Stage " + (D.stages.indexOf(s) + 1) + ", " + s.label.toLowerCase() + " · " + D.studies[E.study];
  }
  function staticExemplars(D) {
    return D.exemplars.map(function (E, k) {
      var o = exOpts(D, k);
      return '<div class="cr-ex-static"><p class="lx-eyebrow">' + esc(o.title) + '</p><p class="lx-hint">' + CORE.rich(exWhere(D, k)) + ". " + esc(o.task) + " " + esc(o.note) + "</p>\n" + EXS.staticHTML(o) + "</div>";
    }).join("\n");
  }
  function staticRubric(D) { return RB.staticHTML(D.rubric); }
  function staticStatuses(D) {
    return '<div class="lx-scroll-x"><table class="lx-facts cr-status-t"><thead><tr><th scope="col">Status</th><th scope="col">Requires</th><th scope="col">Evidence you can show</th></tr></thead><tbody>' +
      D.statuses.map(function (x) { return '<tr><th scope="row">' + esc(x.status) + '</th><td data-l="Requires">' + esc(x.requires) + '</td><td data-l="Evidence">' + esc(x.evidence) + "</td></tr>"; }).join("") + "</tbody></table></div>";
  }
  var api = { CODE: CODE, ID: ID, SCALES: SCALES, track: track, stageHours: stageHours, totals: totals, timeline: timeline, milestones: milestones, famNames: famNames,
    schema: schema, planChecks: planChecks, route: route, altName: altName, mixedLine: mixedLine, noteOf: noteOf, proposalChecks: proposalChecks, exOpts: exOpts, exWhere: exWhere, fmtH: fmtH, msKey: msKey, doneList: doneList,
    staticTracks: staticTracks, staticStrip: staticStrip, staticStages: staticStages, staticRoutes: staticRoutes, staticPlan: staticPlan, staticOutline: staticOutline,
    staticExemplars: staticExemplars, staticRubric: staticRubric, staticStatuses: staticStatuses };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (!W || !W.ShareState || !W.ReportNote) return;

  // ---------------------------------------------------------------- view
  var LX = W, H = LX.H;
  function isDone(id) { try { return !!(LX.progress && LX.progress.isDone && LX.progress.isDone(id)); } catch (e) { return false; } }
  function ref(P, code) { return LX.lessonRefHTML(P, code); }
  function choiceRow(host, label, items, cur, onPick) {
    var fs = H("fieldset", { class: "lx-sb-group" }, host);
    H("legend", { text: label }, fs);
    var row = H("div", { class: "cr-pick", role: "group", "aria-label": label }, fs), btns = {};
    items.forEach(function (it) {
      btns[it.id] = H("button", { type: "button", class: "lx-choice", "aria-pressed": it.id === cur ? "true" : "false",
        html: "<span><b>" + LX.esc(it.label) + "</b>" + (it.small ? "<small>" + LX.esc(it.small) + "</small>" : "") + "</span>",
        onclick: function () { onPick(it.id); } }, row);
    });
    return { fs: fs, set: function (v) { Object.keys(btns).forEach(function (k) { btns[k].setAttribute("aria-pressed", k === v ? "true" : "false"); }); } };
  }
  LX.mount(ID, function (live, data, root) {
    var D = data.cr_your_own_study, R3 = data.r03_system_and_method, P = data.path, F = famNames(D, R3), S = schema(D, F);
    var bench = H("div", { class: "lx-sb cr-bench" }, live), ctl = H("div", { class: "lx-sb-controls" }, bench), side = H("div", { class: "lx-sb-side" }, bench);
    var copy = function (x) { return JSON.parse(JSON.stringify(x)); };
    var ss = LX.ShareState(side, { schema: S, id: "cr-link", buttonText: "Copy plan link", note: "The link holds your choices only, not your words.", onLoad: function (plan) { st = copy(plan); paintControls(); paint(); } });
    var st = copy(ss.state);
    // ---- the controls
    var cTrack = choiceRow(ctl, "Track", D.tracks.map(function (t) { return { id: t.id, label: t.label, small: t.short }; }), st.track, function (v) {
      st.track = v; if (track(D, v).fits.indexOf(st.family) < 0) { st.family = track(D, v).family; announce("The method family is now " + F[st.family] + ", the track's usual one."); } paintControls(); changed();
    });
    var cScale = choiceRow(ctl, "Scale", SCALES.map(function (s) { return { id: s[0], label: s[0], small: s[1] }; }), st.scale, function (v) { st.scale = v; changed(); });
    var mfs = H("fieldset", { class: "lx-sb-group" }, ctl);
    H("legend", { text: "Method" }, mfs);
    var fRow = H("div", { class: "cr-field" }, mfs), fId = LX.uid("cr");
    H("label", { for: fId, text: "Method family" }, fRow);
    var fSel = H("select", { id: fId }, fRow);
    D.families.forEach(function (id) { H("option", { value: id, text: F[id] }, fSel); });
    fSel.addEventListener("change", function () { st.family = fSel.value; paintControls(); changed(); });
    var aBox = H("fieldset", { class: "cr-alts" }, mfs);
    H("legend", { text: "Defend it against (two or more)" }, aBox);
    var aIn = {}, aTx = {};
    D.families.forEach(function (id) {
      var lab = H("label", null, aBox); aIn[id] = H("input", { type: "checkbox", value: id }, lab); aTx[id] = H("span", { text: F[id] }, lab);
      aIn[id].addEventListener("change", function () { st.alts = D.families.filter(function (x) { return aIn[x].checked; }); changed(); });
    });
    var uRow = H("div", { class: "cr-field" }, mfs), uId = LX.uid("cr");
    H("label", { for: uId, text: "Uncertainty treatment" }, uRow);
    var uSel = H("select", { id: uId }, uRow);
    D.uncertainty.forEach(function (u) { H("option", { value: u.id, text: u.label }, uSel); });
    uSel.addEventListener("change", function () { st.unc = uSel.value; changed(); });
    var uMix = H("p", { class: "lx-hint cr-mix", "aria-live": "polite" }, mfs);
    var tfs = H("fieldset", { class: "lx-sb-group" }, ctl);
    H("legend", { text: "Time and review" }, tfs);
    var hRow = H("div", { class: "cr-field" }, tfs), hId = LX.uid("cr");
    H("label", { for: hId, text: "Hours a week" }, hRow);
    var hIn = H("input", { id: hId, type: "number", min: "2", max: "20", step: "1", inputmode: "numeric" }, hRow);
    var hMsg = H("p", { class: "lx-hint", "aria-live": "polite" }, tfs);
    hIn.addEventListener("change", function () {
      var v = Math.round(Number(hIn.value));
      if (!(v >= 2 && v <= 20)) { hMsg.textContent = "Give a whole number of hours from 2 to 20."; hIn.value = st.hours; return; }
      hMsg.textContent = ""; st.hours = v; changed();
    });
    var rvs = H("fieldset", { class: "cr-alts cr-review" }, tfs), rIn = {}, rName = LX.uid("cr-rv");
    H("legend", { text: "Mock review (CK-R) by" }, rvs);
    D.reviews.forEach(function (r) {
      var lab = H("label", null, rvs); rIn[r.id] = H("input", { type: "radio", name: rName, value: r.id }, lab); H("span", { text: r.label }, lab);
      rIn[r.id].addEventListener("change", function () { if (rIn[r.id].checked) { st.review = r.id; changed(); } });
    });
    // ---- the side: the plan's checks, the route and the prerequisites
    var say = H("p", { class: "lx-hint cr-say", "aria-live": "polite" }, side);
    var chkBox = H("div", { class: "cr-checks" }, side);
    var routeBox = H("div", { class: "cr-route" }, side);
    function announce(t) { say.textContent = t; }
    function paintControls() {
      cTrack.set(st.track); cScale.set(st.scale); fSel.value = st.family; uSel.value = st.unc; hIn.value = st.hours;
      D.families.forEach(function (id) { aIn[id].checked = st.alts.indexOf(id) >= 0; aTx[id].textContent = id === st.family ? "Another " + F[id] + " method (name it in the proposal)" : F[id]; });
      D.reviews.forEach(function (r) { rIn[r.id].checked = r.id === st.review; });
    }
    // ---- the scene above the controls (#cr-scene: the nine stages as a strip, sized by their hours) and the stage
    // cards below them (#cr-results)
    var scene = document.getElementById("cr-scene"), res = document.getElementById("cr-results");
    if (scene) scene.innerHTML = "";
    if (res) res.innerHTML = "";
    var stripCard = H("div", { class: "lx-card cr-strip-card" }, scene || live);
    var stripLede = H("p", { class: "cr-strip-lede", "aria-live": "polite" }, stripCard);
    var strip = H("div", { class: "cr-strip", role: "img" }, stripCard);
    var legend = H("ol", { class: "cr-legend", "aria-hidden": "true" }, stripCard);
    H("p", { class: "lx-hint cr-ms-key", text: msKey(D) }, stripCard);
    var cardsBox = H("div", { class: "lx-xcard" }, res || live);
    H("header", { class: "lx-x-head", html: "<h3>Your study, stage by stage</h3>" }, cardsBox);
    var cards = H("ol", { class: "cr-stages" }, cardsBox);
    function changed() { ss.set(st); paint(); }
    function paint() {
      var tl = timeline(D, st.track, st.hours), T = track(D, st.track), card = qc ? qc.get() : {};
      stripLede.innerHTML = "<b>" + LX.esc(T.label) + "</b> track: about " + fmtH(tl.total.typ) + " hours (" + tl.total.lo + " to " + tl.total.hi + "). At " + st.hours +
        " hours a week, about <b>" + tl.weeks.typ + " weeks</b> (" + tl.weeks.lo + " to " + tl.weeks.hi + ").";
      strip.innerHTML = ""; strip.style.gridTemplateColumns = tl.rows.map(function (r) { return "minmax(26px, " + r.typ + "fr)"; }).join(" ");
      strip.setAttribute("aria-label", "The nine stages in order, sized by their typical hours: " + tl.rows.map(function (r, i) {
        return (i + 1) + " " + r.label + ", " + fmtH(r.typ) + " h" + (st.done.indexOf(r.id) >= 0 ? ", done" : ""); }).join("; ") + ".");
      legend.innerHTML = "";
      tl.rows.forEach(function (r, i) {
        var done = st.done.indexOf(r.id) >= 0;
        H("span", { class: "cr-seg" + (done ? " done" : "") + (D.stages[i].milestone ? " ms" : ""), text: (i + 1) + (done ? "✓" : ""), "aria-hidden": "true" }, strip);
        H("li", { text: r.label + " · " + fmtH(r.typ) + " h" }, legend);
      });
      // the checks
      var C = planChecks(D, st, F, card.scale || null), R = route(D, st.scale), V = by(D.reviews, st.review);
      uMix.textContent = st.track === "mixed" ? mixedLine(st) : "";
      chkBox.innerHTML = "";
      H("p", { class: "lx-eyebrow", text: "Plan checks · " + C.filter(function (c) { return c.ok; }).length + " of " + C.length + " in place" }, chkBox);
      var ul = H("ul", { class: "lx-rn-list" }, chkBox);
      C.forEach(function (c) {
        var li = H("li", { class: c.ok ? "ok" : "todo" }, ul);
        li.innerHTML = LX.icon(c.ok ? "check" : "question") + "<span><span class=\"lx-sr\">" + (c.ok ? "In place: " : "To do: ") + "</span>" + LX.esc(c.label) +
          (c.ok ? "" : '<span class="cr-why">' + LX.esc(c.why) + "</span>") + "</span>";
      });
      routeBox.innerHTML = "";
      H("p", { class: "lx-eyebrow", text: "Your route at " + st.scale }, routeBox);
      H("p", { html: "Model lab " + ref(P, R.lab) + (isDone(idOf(R.lab)) ? " (done)" : "") + "; capstone " + ref(P, R.cap) + (isDone(idOf(R.cap)) ? " (done)" : "") + ". Do both before or beside the study." }, routeBox);
      var pre = D.prereqs, nd = pre.filter(function (c) { return isDone(idOf(c)); }).length;
      H("p", { html: "Prerequisites marked complete in this browser: " + nd + " of " + pre.length + " (" + pre.map(function (c) { return ref(P, c) + (isDone(idOf(c)) ? " ✓" : ""); }).join(", ") + ")." }, routeBox);
      H("p", { class: "lx-hint", text: V.line }, routeBox);
      // the stage cards
      cards.innerHTML = "";
      tl.rows.forEach(function (r, i) {
        var s = D.stages[i], done = st.done.indexOf(s.id) >= 0;
        var li = H("li", { class: "cr-stage" + (done ? " done" : "") }, cards);
        var hd = H("div", { class: "cr-stage-h" }, li);
        H("span", { class: "cr-n", text: String(i + 1), "aria-hidden": "true" }, hd);
        H("h4", { text: s.label }, hd);
        H("span", { class: "cr-when", text: "about " + fmtH(r.typ) + " h" + (r.lo === r.hi ? "" : " (" + r.lo + " to " + r.hi + ")") + " · week" + (r.from === r.to ? " " + r.from : "s " + r.from + " to " + r.to) }, hd);
        H("p", { html: LX.rich(s.does) }, li);
        // the evidence a stage needs, as a checklist to open (Codex review #9: one short action visible per stage)
        var dw = H("details", { class: "cr-done-when" }, li);
        H("summary", { text: "Done when: " + s.done.length + " check" + (s.done.length > 1 ? "s" : "") }, dw);
        H("div", { html: doneList(s) }, dw);
        var les = s.lessons.map(function (c) { return ref(P, c); });
        if (s.route === "lab") les.push("model lab " + ref(P, R.lab));
        if (s.route === "cap") les.push("capstone " + ref(P, R.cap));
        if (s.id === "method" && st.track === "empirical") les.push(ref(P, "M14"));
        if (s.id === "data" && st.track === "mixed") les.push(ref(P, "X6"));
        H("p", { class: "cr-studios", html: "<b>Studios:</b> " + les.join(", ") }, li);
        var lab = H("label", { class: "cr-tick" }, li), cb = H("input", { type: "checkbox" }, lab);
        cb.checked = done; H("span", { text: "Done (kept in the plan link)" }, lab);
        cb.addEventListener("change", function () {
          st.done = D.stages.map(function (x) { return x.id; }).filter(function (id) { return id === s.id ? cb.checked : st.done.indexOf(id) >= 0; });
          changed(); var again = cards.querySelectorAll(".cr-tick input")[i]; if (again && again.focus) again.focus();
        });
      });
      if (rn) rn.refresh();
      LX.emit("layout");
    }
    function idOf(code) {
      var all = [].concat(P.starter || [], P.more || [], P.toolbox || []), hit = all.filter(function (l) { return l.code === code; })[0];
      return hit ? hit.id : null;
    }
    // ---- the note: the question card and the proposal (#cr-note)
    var qc = null, rn = null, noteHost = document.getElementById("cr-note");
    if (noteHost) {
      noteHost.innerHTML = "";
      var cardHost = H("div", { class: "lx-xcard cr-card" }, noteHost);
      var imp = H("div", { class: "cr-import" }, cardHost);
      var r10 = LX.store.get("r10-card", null), r10ok = !!(r10 && QC.check(r10).pass > 0);
      var impBtn = H("button", { type: "button", class: "lx-btn ghost small", text: "Use my card from the question studio" }, imp);
      var impMsg = H("span", { class: "lx-hint", "aria-live": "polite" }, imp);
      impBtn.disabled = !r10ok;
      impMsg.innerHTML = r10ok ? "Your " + ref(P, "R10") + " card is saved in this browser." : "No card from " + ref(P, "R10") + " in this browser yet: write yours here, or there.";
      impBtn.addEventListener("click", function () { qc.set(LX.store.get("r10-card", {})); impMsg.textContent = "Your question studio card is in, and you can edit it here."; });
      qc = LX.QuestionCard(cardHost, { id: "cr-card", code: CODE, title: "Your question card", lede: "The question your study answers, in the eight parts the rubric's Framing level asks for.",
        fix: { question: { href: "r01-framing.html", label: "R1" }, counterfactual: { href: "r01-framing.html", label: "R1" }, scale: { href: "r03-system-and-method.html", label: "R3" } },
        onChange: function () { paint(); } });
      rn = LX.ReportNote(H("div", { class: "lx-xcard" }, noteHost), { id: "cr-note", code: CODE, title: "Your one-page proposal",
        lede: "Your card and your plan fill in its table; write the rest in your own words. It is milestone one: a mentor or a peer reads it in CK-R.",
        fields: D.fields, checks: proposalChecks(),
        privacy: "The proposal is built in this page. Nothing leaves the page unless you copy it; your words and your card stay in this browser and are not part of the plan link.",
        get: function () { return noteOf(D, st, qc.get(), F, ss.url()); } });
    }
    // ---- the self-check: one pair of fragments at a time, then the rubric
    var exHost = document.getElementById("exemplars");
    if (exHost) {
      exHost.innerHTML = "";
      var exCard = H("div", { class: "lx-xcard cr-ex" }, exHost);
      H("header", { class: "lx-x-head", html: "<h3>Weak and strong practice, competence by competence</h3>" }, exCard);
      H("p", { class: "lx-hint", text: "Fragments of four fictional studies, one pair for each rubric competence. Pick one; tap a marked phrase to see why it falls short or works." }, exCard);
      var exRow = H("div", { class: "cr-ex-pick", role: "group", "aria-label": "Competence" }, exCard), exBtns = [], exOut = H("div", { class: "cr-ex-out" }, exCard), exAt = -1, ex = null;
      D.exemplars.forEach(function (E, k) {
        exBtns.push(H("button", { type: "button", class: "lx-btn ghost small", "aria-pressed": "false", text: RB.competence(E.comp).label, onclick: function () { showEx(k, true); } }, exRow));
      });
      var showEx = function (k, user) {
        exAt = k; LX.store.set("cr-ex-pick", k);
        exBtns.forEach(function (b, i) { b.setAttribute("aria-pressed", i === k ? "true" : "false"); });
        exOut.innerHTML = "";
        H("p", { class: "cr-ex-stage", html: LX.rich(exWhere(D, k)) }, exOut);
        ex = LX.Exemplars(exOut, exOpts(D, k));
        if (user && exBtns[k].focus) exBtns[k].focus();
        LX.emit("layout");
      };
      var saved = LX.store.get("cr-ex-pick", 0);
      showEx(saved >= 0 && saved < D.exemplars.length ? saved : 0, false);
    }
    var rbHost = document.getElementById("cr-rubric");
    if (rbHost && LX.Rubric) {
      rbHost.innerHTML = "";
      LX.Rubric(H("div", { class: "lx-xcard" }, rbHost), { id: "cr-rubric", code: CODE, title: "Rate your study against the course rubric",
        lede: "All nine competences, in the course's words. “Copy my self-check” gives the rubric sheet you hand in.", competences: D.rubric });
    }
    paintControls(); paint();
    LX.demo(root, function (state) {
      if (state === "mid") { st.track = "empirical"; st.family = "stat"; st.alts = ["ml", "qual"]; st.scale = "S3"; st.hours = 8; st.unc = "ci"; st.done = ["question", "literature"]; paintControls(); changed(); return { view: "an empirical plan at S3" }; }
      if (state === "note") { var n = document.getElementById("note"); if (n) n.scrollIntoView(); return { view: "note" }; }
      if (state === "exemplars" && exHost) { showEx(2, false); if (ex) ex.openAll(); exHost.scrollIntoView(); return { view: "method fit pair, notes open" }; }
      return null;
    });
  });
})();
