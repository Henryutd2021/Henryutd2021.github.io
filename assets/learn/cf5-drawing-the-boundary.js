// cf5-drawing-the-boundary.js — Case file CF5, "Where should a cogeneration study's boundary be drawn?" (case form;
// its research wording is the approved excerpt E14).
// Method only, within the course's scope rules for nuclear plants and data centers; the research wording matches the
// approved excerpts. Depth D2 (working knowledge), closed-form toy; the Go deeper box gives its arithmetic, nothing more.
//
// Data: assets/learn/data/cf5-drawing-the-boundary.json: the study in time (LX.Timeline: one entry), where the study's
// result holds (LX.Boundary: E14.21 split at its clauses, word for word, with E14.24 as its source line), and the toy
// ("idea"). The research text in the data file is the approved excerpt wording, word for word; this script adds none
// of its own.
//
// The idea (illustrative; a generic steam plant and one generic load with round numbers the reader sets; not the study's
// inputs, equations or results; average power over one hour, no money, no auxiliary electricity): the plant's turbine
// makes P MW of electricity from all its steam. A load needs L MW of power and C MW of cooling. Cooling comes either from
// an electric chiller (C / COPe MW of electricity) or from an absorption chiller driven by steam taken from the turbine
// (C / COPa MW of steam heat), which lowers the turbine's output by w MW of electricity for each MW of steam heat taken.
// The reference is the same plant and load, using electric cooling; the grid takes what the site does not use or
// supplies what it lacks. Two choices, kept apart:
//   where the boundary is   "plant only": the measure is the electricity the turbine makes
//                           "plant and load": the measure is the site's net exchange with the grid (out minus in)
//   how steam is counted    "priced": the physical flows, so the turbine work the steam gives up is counted
//                           "free": the turbine loss ignored, an accounting mistake shown on purpose (labelled
//                           "deliberately incomplete"): the same flow difference with the loss added back
//   change from switching to steam cooling (MW, + = less electricity used or more sent out), from the flows:
//                           plant only, priced     turbine(steam) - turbine(electric)   = - w C / COPa
//                           plant and load, priced siteNet(steam) - siteNet(electric)   = C / COPe - w C / COPa
//                           plant only, free       the plant-only change + w C / COPa   = 0
//                           plant and load, free   the plant-and-load change + w C / COPa = + C / COPe
// Hour types: an ordinary hour; a hot, humid hour (the absorption chiller's cooling per MW of steam times a derating
// factor; efficiency only, no capacity limit); a planned outage (no steam: the turbine makes nothing and the absorption
// chiller cannot run, so there is no switch to make).
// Every number on the page is checked by _tests/learn/test_cf5-drawing-the-boundary.js.
(function () {
  "use strict";

  // ---------------------------------------------------------------- pure model (no DOM; exported for Node)
  var VIEWS = [
    { id: "plant-priced", where: "plant", steam: "priced" },
    { id: "site-priced", where: "site", steam: "priced" },
    { id: "plant-free", where: "plant", steam: "free" },
    { id: "site-free", where: "site", steam: "free" }
  ];
  function hourOf(I, id) { return I.hours.filter(function (h) { return h.id === id; })[0] || I.hours[0]; }
  // the hour's flows for a cooling choice ("electric" or "steam"); s: the reader's settings
  function hour(I, s, cooling) {
    var hr = hourOf(I, s.hour);
    var copA = s.copA * (hr.derate == null ? 1 : hr.derate), steamOn = !hr.outage;
    var useSteam = cooling === "steam" && steamOn && copA > 0;
    var steam = useSteam ? s.cool / copA : 0;                       // MW of steam heat taken at the crossover
    var turbine = steamOn ? I.plantMW - s.w * steam : 0;             // MW of electricity the turbine makes
    var chiller = useSteam ? 0 : s.cool / s.copE;                    // MW of electricity the electric chiller uses
    return { hour: hr, copA: copA, steamOn: steamOn, steam: steam, turbine: turbine, chiller: chiller,
             lost: s.w * steam, siteNet: turbine - s.load - chiller };   // + sent to the grid, - bought from it
  }
  // what the switch from the electric chiller to steam cooling changes, as each view counts it (MW, average over the hour)
  function views(I, s) {
    var e = hour(I, s, "electric"), a = hour(I, s, "steam");
    if (!a.steam) return { e: e, a: a, possible: false, v: { "plant-priced": 0, "site-priced": 0, "plant-free": 0, "site-free": 0 } };
    var dPlant = a.turbine - e.turbine, dSite = a.siteNet - e.siteNet;
    return { e: e, a: a, possible: true, avoided: e.chiller, lost: a.lost,
             v: { "plant-priced": dPlant, "site-priced": dSite, "plant-free": dPlant + a.lost, "site-free": dSite + a.lost } };
  }
  function r1(v) { return Math.round(Math.round(v * 1e6) / 1e6 * 10) / 10; }   // to 0.1 MW, after snapping float noise at 1e-6
  function mw(v) { var r = r1(v); return (r < 0 ? "−" : r > 0 ? "+" : "") + Math.abs(r).toFixed(1) + " MW"; }
  function mw0(v) { return r1(v).toFixed(1) + " MW"; }
  function verdict(v) { var r = r1(v); return r > 0 ? "steam cooling looks better" : r < 0 ? "steam cooling looks worse" : "no difference shows"; }
  function grid(n) { return r1(n) >= 0 ? "the site sends " + mw0(n) + " to the grid" : "the grid supplies " + mw0(-n) + " to the site"; }
  function pct(f) { return Math.round((1 - f) * 100) + "%"; }
  // the toy's assumptions, written from the data (no number retyped)
  function assumptions(I) {
    var hot = I.hours.filter(function (h) { return h.derate != null; })[0];
    return [
      "Illustrative: the turbine makes " + I.plantMW + " MW of electricity from all its steam; the load needs " + I.start.load + " MW of power.",
      "The reference is the same plant and load, using electric cooling; the grid takes what the site does not use, or supplies what it lacks.",
      hot ? "A hot, humid hour: the absorption chiller makes " + pct(hot.derate) + " less cooling per MW of steam. The toy changes its efficiency only; it has no capacity limit." : null,
      "A planned outage: no steam, so the turbine makes nothing and the absorption chiller cannot run."
    ].filter(Boolean);
  }
  var CAPTION = "Switching the cooling from the electric chiller to steam: the change in average power during the hour, as each view counts it. + means less electricity used or more sent to the grid; − means the opposite.";
  // the toy's table in the no-JS version (the reader's defaults, ordinary hour)
  function staticIdea(I) {
    var s = I.start, V = views(I, s);
    var rows = VIEWS.map(function (x) {
      return "<tr><th scope=\"row\">" + I.labels[x.id] + "</th><td class=\"n\">" + mw(V.v[x.id]) + "</td><td>" + verdict(V.v[x.id]) + "</td></tr>";
    }).join("");
    return "<p class=\"lx-eyebrow\">" + I.title + " (illustrative)</p>" +
      "<p class=\"lx-hint\">" + I.note + "</p>" +
      "<ul><li>Electric chiller: " + mw0(V.avoided) + " of electricity for " + s.cool + " MW of cooling.</li><li>Steam cooling: " + mw0(V.a.steam) + " of steam heat, which costs the turbine " + mw0(V.lost) + " of electricity.</li>" +
      "<li>The grid: in the reference " + grid(V.e.siteNet) + "; with steam cooling " + grid(V.a.siteNet) + ".</li></ul>" +
      "<table class=\"lx-facts\"><caption class=\"lx-hint\">" + CAPTION + " An ordinary hour, at the defaults.</caption>" +
      "<thead><tr><th scope=\"col\">View</th><th scope=\"col\">Change</th><th scope=\"col\">What it says</th></tr></thead><tbody>" + rows + "</tbody></table>" +
      "<details class=\"lx-textalt\"><summary>The toy's assumptions</summary><ul>" + assumptions(I).map(function (t) { return "<li>" + t + "</li>"; }).join("") + "</ul></details>";
  }
  // worked answers to "Try it yourself", from the model (shown with and without JavaScript)
  function worked(I) {
    var s = I.start, at = function (o) { var t = {}, k; for (k in s) t[k] = s[k]; for (k in o) t[k] = o[k]; return views(I, t); };
    var w1 = I.practice.w[0], w2 = I.practice.w[1], A = at({ w: w1 }), B = at({ w: w2 }), D = at({}), hot = at({ hour: "hot" }), out = at({ hour: "out" });
    var vv = function (V, id) { return mw(V.v[id]); };
    return [
      "At " + w1.toFixed(2) + " MW of turbine work per MW of steam heat: plant and load, steam priced, " + vv(A, "site-priced") + " (" + verdict(A.v["site-priced"]) + "); plant only, steam priced, " + vv(A, "plant-priced") + " (" + verdict(A.v["plant-priced"]) + ").",
      "At " + w2.toFixed(2) + " MW: plant and load, steam priced, " + vv(B, "site-priced") + "; plant only, " + vv(B, "plant-priced") + "; both worse. The two views that ignore the turbine loss stay at " + vv(B, "plant-free") + " and " + vv(B, "site-free") + " at any setting of the turbine work: they never change.",
      "A hot, humid hour: " + hot.a.copA.toFixed(2) + " MW of cooling per MW of steam, so " + s.cool + " MW of cooling takes " + mw0(hot.a.steam) + " of steam heat and " + mw0(hot.lost) + " of turbine work; plant and load, steam priced, " + vv(hot, "site-priced") + ".",
      "A planned outage: no steam, so the electric chiller carries all " + s.cool + " MW of cooling with " + mw0(out.e.chiller) + " of electricity; there is no switch to make.",
      "Plant only: the " + mw0(D.lost) + " of turbine work is inside the line and the electric chiller's " + mw0(D.avoided) + " saving is outside, so " + vv(D, "plant-priced") + ". Plant and load: both are inside, so " + vv(D, "site-priced") + ".",
      "Turbine loss ignored: plant and load goes from " + vv(D, "site-priced") + " to " + vv(D, "site-free") + ", so the sign flips, because the " + mw0(D.lost) + " of turbine work is no longer counted; plant only goes from " + vv(D, "plant-priced") + " to " + vv(D, "plant-free") + "."
    ];
  }
  function staticWorked(I) {
    return "<details class=\"lx-answer\"><summary>Worked answers, at the toy's defaults</summary><ul>" + worked(I).map(function (t) { return "<li>" + t + "</li>"; }).join("") + "</ul></details>";
  }
  function rich(t) {
    return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\[\[([a-z0-9-]+)\|([^\]]+)\]\]/g, function (m, id, w) {
      return '<span class="lx-term" data-term=' + '"' + id + '">' + w + "</span>";
    });
  }
  function staticBoundary(b) {
    var ul = function (a) { return "<ul>" + a.map(function (t) { return "<li>" + rich(t) + "</li>"; }).join("") + "</ul>"; };
    return "<p class=\"lx-eyebrow\">" + rich(b.title) + "</p><dl class=\"lx-ideas\"><dt>It holds when</dt><dd>" + ul(b.holds) + "</dd><dt>It leaves out</dt><dd>" + ul(b.leaves) + "</dd></dl>" +
      "<p class=\"lx-hint\">" + rich(b.source) + "</p>";
  }
  var model = { VIEWS: VIEWS, hour: hour, views: views, mw: mw, mw0: mw0, verdict: verdict, grid: grid, assumptions: assumptions, CAPTION: CAPTION,
                worked: worked, staticIdea: staticIdea, staticWorked: staticWorked, staticBoundary: staticBoundary };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H, KEY = "cf5_drawing_the_boundary";
  function css() {
    if (document.getElementById("cf5-css")) return;
    H("style", { id: "cf5-css", text: [
      ".cf5-scene{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-start;margin:.4rem 0;min-width:0;overflow-wrap:anywhere}",
      ".cf5-box{flex:1 1 260px;display:flex;flex-wrap:wrap;gap:8px;padding:10px;border:2px dashed var(--lx-accent);border-radius:14px;align-content:flex-start;min-width:0}",
      ".cf5-box>p,.cf5-out>p{flex-basis:100%;margin:0;font-size:12px;font-family:var(--lx-f-display);color:color-mix(in srgb,var(--lx-accent) 70%,var(--lx-ink))}",
      ".cf5-out>p{color:var(--lx-ink-3)}",
      ".cf5-out{flex:0 1 200px;display:flex;flex-direction:column;gap:8px;min-width:0}",
      ".cf5-part{flex:1 1 120px;min-width:0;border:1px solid var(--lx-line);border-radius:10px;padding:7px 9px;background:var(--lx-surface-2)}",
      ".cf5-part b{display:block;font-family:var(--lx-f-display);font-size:13.5px}.cf5-part .v{font-size:12.5px;color:var(--lx-ink-2);font-family:var(--lx-f-mono);margin-top:2px}",
      ".cf5-part.p-plant{border-left:4px solid var(--lx-cc)}.cf5-part.p-load{border-left:4px solid var(--lx-tier-4)}.cf5-part.p-grid{border-left:4px solid var(--lx-ink-3)}.cf5-part.p-cool{border-left:4px solid var(--lx-hyd)}",
      ".cf5-tbl{overflow-x:auto}.cf5-tbl table{width:100%;border-collapse:collapse;font-size:14px}.cf5-tbl th,.cf5-tbl td{padding:5px 6px;border-bottom:1px solid var(--lx-line);text-align:left;font-weight:400}",
      ".cf5-tbl caption{caption-side:top;text-align:left;padding:0 0 6px}",
      ".cf5-tbl td.n{text-align:right;font-family:var(--lx-f-mono);font-variant-numeric:tabular-nums}.cf5-tbl tr.sel th,.cf5-tbl tr.sel td{background:var(--lx-good-soft);font-weight:600}",
      ".cf5-tbl thead th{font-family:var(--lx-f-display);font-size:12px;color:var(--lx-ink-3)}",
      ".cf5-bnd dd[data-e14=\"E14.4\"]{border:2px dashed var(--lx-accent);border-radius:10px;padding:6px 10px}",
      ".cf5-bnd dd[data-e14=\"E14.6\"]{border:1px solid var(--lx-line-2);border-radius:10px;padding:6px 10px}",
      "@media (max-width:560px){.cf5-box{flex-basis:100%}.cf5-out{flex-basis:100%;flex-direction:row;flex-wrap:wrap}.cf5-tbl table{font-size:12.5px}}"
    ].join("\n") }, document.head);
  }

  LX.mount("cf5", function (live, data) {
    css();
    var D = data[KEY];
    LX.Timeline(H("div", { class: "lx-card" }, live), D.timeline);
    var x = document.getElementById("cf5-explain");
    if (x) { x.innerHTML = ""; x.classList.add("is-live"); LX.Boundary(H("div", { class: "lx-xcard" }, x), D.boundary); }
  });

  LX.mount("cf5-idea", function (live, data, root) {
    css();
    var D = data[KEY], I = D.idea, P = data.path || null, S = {}, k;
    for (k in I.start) S[k] = I.start[k];
    S.where = "site"; S.steam = "priced";
    var stage = H("div", { class: "lx-stage" }, live);
    H("h3", { text: I.title }, H("div", { class: "lx-stage-head" }, stage));
    H("p", { class: "lx-hint", text: I.note }, stage);
    var scene = H("div", { class: "cf5-scene", role: "group", "aria-label": "The site and the boundary you drew" }, stage);
    function seg(host, id, label, items, key) {
      var c = H("div", { class: "cf-ctl" }, host); H("p", { class: "cf-ctl-l", id: id, text: label }, c);
      var g = H("div", { class: "lx-seg", role: "group", "aria-labelledby": id }, c), bs = [];
      items.forEach(function (it) { bs.push(H("button", { type: "button", text: it.label, onclick: function () { S[key] = it.id; paint(true); } }, g)); });
      return function () { bs.forEach(function (b, i) { b.setAttribute("aria-pressed", String(items[i].id === S[key])); }); };
    }
    var ctl = H("div", { class: "lx-ctls" }, stage), marks = [];
    marks.push(seg(ctl, "cf5-where", "Where the boundary is", [{ id: "plant", label: "Plant only" }, { id: "site", label: "Plant and load" }], "where"));
    marks.push(seg(ctl, "cf5-steam", "How the steam is counted", I.steamModes, "steam"));
    marks.push(seg(ctl, "cf5-hour", "The hour", I.hours.map(function (h) { return { id: h.id, label: h.label }; }), "hour"));
    var sl = H("div", { class: "lx-ctls" }, stage), sliders = {};
    I.sliders.forEach(function (o) {
      sliders[o.key] = LX.Slider(sl, { label: o.label, min: o.min, max: o.max, step: o.step, value: S[o.key], color: o.color, fmt: function (v) { return v.toFixed(o.dec) + (o.unit ? " " + o.unit : ""); }, onChange: function (v) { S[o.key] = v; paint(true); } });
    });
    var chips = H("div", { class: "lx-readouts" }, stage), tbl = H("div", { class: "cf5-tbl" }, stage);
    var status = H("div", { class: "lx-stage-status", "aria-live": "polite", style: "display:grid;gap:4px" }, stage);
    var as = H("details", { class: "lx-textalt" }, stage); H("summary", { text: "The toy's assumptions" }, as);
    var aul = H("ul", null, as); assumptions(I).forEach(function (t) { H("li", { text: t }, aul); });
    if (P) H("p", { class: "lx-hint", html: "Where this goes next: " + LX.lessonRefHTML(P, "R7") + " audits a study's boundary, baseline and counterfactual; " + LX.lessonRefHTML(P, "M11") + " puts a plant's boundary inside an optimization model." }, stage);
    function chip(label, value) { var c = H("div", { class: "lx-readout" }, chips); H("span", { text: label }, c); H("b", { text: value }, c); }
    function part(host, cls, name, val) { var d = H("div", { class: "cf5-part p-" + cls }, host); H("b", { text: name }, d); if (val) H("div", { class: "v", text: val }, d); }
    function paint(acted) {
      marks.forEach(function (f) { f(); });
      var V = views(I, S), id = S.where + "-" + S.steam, val = V.v[id], hr = V.a.hour;
      // the absorption chiller's cooling per MW of steam this hour, beside its slider
      sliders.copA.hint(hr.derate != null ? "This hour: " + V.a.copA.toFixed(2) + ", " + pct(hr.derate) + " less in a hot, humid hour (illustrative; efficiency only, no capacity limit)." : hr.outage ? "This hour: no steam." : "");
      scene.innerHTML = "";
      var box = H("div", { class: "cf5-box" }, scene); H("p", { text: "Inside the boundary · measured: " + (S.where === "plant" ? "the electricity the turbine makes" : "the site's net exchange with the grid") }, box);
      var out = H("div", { class: "cf5-out" }, scene); H("p", { text: "Outside" }, out);
      part(box, "plant", "Steam plant", V.a.steamOn ? "turbine " + mw0(V.e.turbine) + " with the electric chiller" + (V.possible ? ", " + mw0(V.a.turbine) + " with steam cooling" : "") : "planned outage: no steam");
      part(box, "cool", "Absorption chiller", V.possible ? mw0(V.a.steam) + " of steam heat at " + V.a.copA.toFixed(2) + " MW of cooling per MW" : "no steam this hour");
      part(S.where === "site" ? box : out, "load", "The load", S.load + " MW of power, " + S.cool + " MW of cooling");
      part(S.where === "site" ? box : out, "cool", "Electric chiller (the reference)", mw0(V.e.chiller) + " of electricity");
      part(out, "grid", "The grid", "Reference: " + grid(V.e.siteNet) + (V.possible ? ". With steam cooling: " + grid(V.a.siteNet) : ""));
      chips.innerHTML = "";
      chip("Electric chiller uses", mw0(V.e.chiller));
      chip("Absorption chiller this hour", V.possible ? V.a.copA.toFixed(2) + " MW of cooling per MW of steam" : "no steam");
      chip("Steam cooling costs the turbine", V.possible ? mw0(V.lost) : "–");
      chip("Change, as this view counts it", V.possible ? mw(val) : "none");
      tbl.innerHTML = "";
      var t = H("table", null, tbl); H("caption", { class: "lx-hint", text: CAPTION }, t);
      var hrow = H("tr", null, H("thead", null, t));
      ["View", "Change", "What it says"].forEach(function (h) { H("th", { scope: "col", text: h }, hrow); });
      var tb = H("tbody", null, t);
      VIEWS.forEach(function (x) { var r = H("tr", { class: x.id === id ? "sel" : "" }, tb); H("th", { scope: "row", text: I.labels[x.id] }, r); H("td", { class: "n", text: mw(V.v[x.id]) }, r); H("td", { text: V.possible ? verdict(V.v[x.id]) : "no switch to make" }, r); });
      var lines = [];
      if (!V.possible) lines.push("<b>A planned outage:</b> no steam, so the absorption chiller cannot run and the electric chiller carries the cooling.");
      else {
        lines.push("As you drew it, switching to steam cooling changes the electricity by <b>" + mw(val) + "</b>: " + verdict(val) + ".");
        lines.push(id === "site-priced" ? "Both sides of the switch are inside: the electric chiller's " + mw0(V.avoided) + " saved, and the " + mw0(V.lost) + " of turbine work given up." :
          id === "plant-priced" ? "The plant sees only the turbine work it gives up; the chiller's saving sits with the load, outside the line." :
          id === "site-free" ? "Deliberately incomplete: the turbine loss is ignored, so only the saving shows. Count the loss and the answer becomes " + mw(V.v["site-priced"]) + "." :
          "Deliberately incomplete: the turbine loss is ignored and the saving sits outside the line, so the switch shows nothing at all. Count the loss and the answer becomes " + mw(V.v["plant-priced"]) + ".");
      }
      status.innerHTML = lines.map(function (l) { return "<p>" + l + "</p>"; }).join("");
      if (acted) LX.store.set("cf5-idea", { where: S.where, steam: S.steam });
    }
    paint(false);
    LX.demo(root, function (state) {
      if (state !== "mid" && state !== "free") return null;
      S.where = "site"; S.steam = state === "free" ? "free" : "priced"; S.hour = "hot"; paint(false);
      return { view: state };
    });
  });
})();
