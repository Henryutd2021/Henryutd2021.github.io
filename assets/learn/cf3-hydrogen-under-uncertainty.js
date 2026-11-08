// cf3-hydrogen-under-uncertainty.js — Case file CF3, "Where should hydrogen go when nobody knows how much wind will be
// built?" (case form).
//
// Data: assets/learn/data/cf3-hydrogen-under-uncertainty.json (the study's dated steps for LX.Timeline, where the result
// holds for LX.Boundary, the scale mark, the toy's labels), assets/learn/data/m08-stochastic-robust.json (the toy itself:
// lesson M8's windy zone and its reference plans), data/f01-five-scales.json (the five scales, for LX.ScaleStrip) and
// data/path.json. The research text in the data file and on the page is approved excerpt wording
// (E10 and E11); this script adds none of its own.
//
// The idea (illustrative, M8's toy; not the study's inputs or results): one electrolyzer in a windy zone is sized before
// anyone knows whether none, half or all of the planned wind gets built (chances 25%, 50%, 25%). The reader picks a size;
// the page prices it in each build-out with M8's closed form (LX.m08: components/scenario.js in the learn.js bundle,
// shared with M8) and compares it with the three plans M8 solves: the plan for the average
// build-out, the hedged plan (the two-stage stochastic program) and the worst-case plan, each defined in one line. One
// worked line shows how the hedged plan's expected cost is made from its three branch costs (fixed to that plan: its
// rounded terms add up to its rounded total, which is not so at every size), and the toy's assumptions and wind blocks
// are listed with and without JavaScript. Every number is checked by
// _tests/learn/test_cf3-hydrogen-under-uncertainty.js, for every size the slider allows.
(function () {
  "use strict";

  // ---------------------------------------------------------------- pure model (no DOM; exported for Node)
  // M: M8's model (require("components/scenario.js") in Node, LX.m08 in a page); D8: M8's data with its reference
  function price(M, D8, x) {
    var S = M.scen(D8), per = S.map(function (s) { return M.cost(D8, s.W, x); });
    return { x: x, per: per, exp: M.expected(D8, S, x), worst: Math.max.apply(null, per), over: M.expected(D8, S, x) - D8.reference.sp.exp };
  }
  function plans(I, D8) { return I.plans.map(function (p) { return { key: p.key, label: p.label, x: D8.reference[p.key].x }; }); }
  // the live status, one idea per line, true for every size (tested on every step of the slider)
  function status(M, D8, x) {
    var fm = M.fm, S = M.scen(D8), r = price(M, D8, x), base = M.base(D8), R = D8.reference, out = [];
    if (x === 0) return ["With no electrolyzer, every build-out costs the same: " + fm.m(base) + " a year, all hydrogen from gas reformers.",
      "The hedged plan, " + fm.mw(R.sp.x) + ", is expected to cost " + fm.m(R.sp.exp) + "."];
    out.push(Math.abs(x - R.sp.x) < 1e-9 ? "<b>" + fm.mw(x) + " is the hedged plan</b>: the lowest expected cost, " + fm.m(r.exp) + " a year."
      : "<b>" + fm.mw(x) + "</b> is expected to cost " + fm.m(r.exp) + " a year, " + fm.m(r.over) + " more than the hedged plan's " + fm.mw(R.sp.x) + ".");
    out.push("If none of the planned wind is built, it costs " + fm.m(r.per[0]) + (r.per[0] > base ? ", more than gas reformers alone (" + fm.m(base) + ")" : ", no more than gas reformers alone (" + fm.m(base) + ")") +
      "; if all of it is built, " + fm.m(r.per[2]) + ".");
    return out;
  }
  // the plans in one line each (data: idea.plans[].def)
  function defsHTML(I) {
    return "<ul class=\"lx-hint cf3-defs\">" + I.plans.map(function (p) { return "<li><b>" + p.label + ":</b> " + rich(p.def) + "</li>"; }).join("") + "</ul>";
  }
  // how an expected cost is made, on the hedged plan: each branch's cost times its chance, added up
  function worked(M, D8) {
    var fm = M.fm, S = M.scen(D8), R = D8.reference, x = R.sp.x, per = S.map(function (s) { return M.cost(D8, s.W, x); });
    return { x: x, per: per, exp: M.expected(D8, S, x),
      text: "Expected cost of the hedged plan: " + S.map(function (s, i) { return fm.pct(s.p) + " × " + fm.m(per[i]); }).join(" + ") + " = " + fm.m(M.expected(D8, S, x)) + " a year." };
  }
  function workedHTML(M, D8, I) { return "<p class=\"cf3-worked\">" + worked(M, D8).text + "</p><p class=\"lx-hint\">" + rich(I.workedNote) + "</p>"; }
  // how one branch cost is made, from the toy's own inputs: reformers alone, then the hedged plan with none of the planned wind
  function chain(M, D8) {
    var fm = M.fm, H2 = D8.hydrogen, E = D8.electrolyzer, x = D8.reference.sp.x, W = M.scen(D8)[0].W;
    var kg = E.kgPerMWh * M.used(D8, W, x), plant = E.costPerMWYear * x, buy = H2.reformerPerKg * (H2.demandKgPerHour * M.HOURS - kg);
    return { plant: plant, kg: kg, buy: buy, total: plant + buy, base: M.base(D8),
      lines: ["Gas reformers alone: " + fm.int(H2.demandKgPerHour) + " kg an hour × " + fm.int(M.HOURS) + " hours × $" + H2.reformerPerKg.toFixed(2) + "/kg = " + fm.m(M.base(D8)) + " a year, in every build-out.",
        "Hedged plan, none built: " + fm.int(x) + " MW × $" + fm.int(E.costPerMWYear) + " = " + fm.m(plant) + " for the electrolyzer; it makes " + (kg / 1e6).toFixed(1) + " million kg, so reformers supply the rest for " + fm.m(buy) + ". Total " + fm.m(plant + buy) + "."] };
  }
  function chainHTML(M, D8) { return chain(M, D8).lines.map(function (t) { return "<p class=\"lx-hint\">" + t + "</p>"; }).join(""); }
  // the toy's assumptions (M8's notes, then the boundary that sets its sizes) and its five wind blocks
  function assumptionsHTML(M, D8, I) {
    var fm = M.fm, notes = [D8.zone.note, D8.wind.note, D8.electrolyzer.note, D8.hydrogen.note].map(function (t) { return "<li>" + rich(t) + "</li>"; }).join("");
    return "<ul>" + notes + I.assumptions.map(function (t) { return "<li>" + rich(t) + "</li>"; }).join("") + "</ul>" +
      "<div class=\"lx-scroll-x\"><table class=\"lx-mini-table\"><caption class=\"lx-hint\">" + rich(I.blocksCaption) + "</caption><thead><tr><th scope=\"col\">Wind block</th><th scope=\"col\">Hours a year</th><th scope=\"col\">Capacity factor</th></tr></thead><tbody>" +
      D8.blocks.labels.map(function (l, b) { return "<tr><th scope=\"row\">" + l + "</th><td class=\"n\">" + fm.int(D8.blocks.hours[b]) + "</td><td class=\"n\">" + Math.round(D8.blocks.cf[b] * 1000) / 10 + "%</td></tr>"; }).join("") +
      "</tbody></table></div>" + sourceHTML(D8, I);
  }
  // the wind blocks' primary sources and the date they were read (M8's data), one line under the table
  function sourceHTML(D8, I) {
    var s = D8.blocks.source, d = new Date(s.as_of + "T00:00:00Z");
    var day = d.getUTCDate() + " " + ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][d.getUTCMonth()] + " " + d.getUTCFullYear();
    return "<p class=\"lx-hint\">Sources: <a href=\"" + s.url + "\">EIA-930</a>, SPP's hourly wind in 2025; <a href=\"" + I.cfSource.url + "\">" + I.cfSource.label + "</a>, the 2025 U.S. wind capacity factor. Read on " + day + ".</p>";
  }
  function rich(t) {
    return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\[\[([a-z0-9-]+)\|([^\]]+)\]\]/g, function (m, id, w) {
      return '<span class="lx-term" data-term=' + '"' + id + '">' + w + "</span>";
    });
  }
  // the toy's no-JS version (written into the page by the test's --write mode)
  function staticIdea(M, D8, I) {
    var fm = M.fm, S = M.scen(D8);
    var rows = plans(I, D8).map(function (p) { var r = price(M, D8, p.x); return "<tr><th scope=\"row\">" + p.label + "</th><td class=\"n\">" + fm.mw(p.x) + "</td>" + r.per.map(function (v) { return "<td class=\"n\">" + fm.m(v) + "</td>"; }).join("") + "<td class=\"n\">" + fm.m(r.exp) + "</td></tr>"; }).join("");
    return "<p class=\"lx-eyebrow\">" + I.title + " (illustrative)</p><p class=\"lx-hint\">" + I.note + "</p>" + defsHTML(I) +
      "<div class=\"lx-scroll-x\"><table class=\"lx-mini-table cf3-res\"><caption class=\"lx-hint\">Annual cost of the hydrogen supply for three sizes, in each build-out and in expectation (2025 dollars; M = million)</caption><thead><tr><th scope=\"col\">Plan</th><th scope=\"col\">Size</th>" +
      S.map(function (s) { return "<th scope=\"col\">" + s.short + " (" + fm.pct(s.p) + ")</th>"; }).join("") + "<th scope=\"col\">Expected</th></tr></thead><tbody>" + rows + "</tbody></table></div>" +
      workedHTML(M, D8, I) + chainHTML(M, D8) +
      "<details class=\"lx-textalt\"><summary>" + I.assumptionsTitle + "</summary>" + assumptionsHTML(M, D8, I) + "</details>";
  }
  function staticBoundary(b) {
    var ul = function (a) { return "<ul>" + a.map(function (t) { return "<li>" + rich(t) + "</li>"; }).join("") + "</ul>"; };
    return "<p class=\"lx-eyebrow\">" + rich(b.title) + "</p><dl class=\"lx-ideas\"><dt>It holds when</dt><dd>" + ul(b.holds) + "</dd><dt>It leaves out</dt><dd>" + ul(b.leaves) + "</dd></dl>" +
      "<p class=\"lx-hint\">" + rich(b.source) + "</p>";
  }
  var model = { price: price, plans: plans, status: status, worked: worked, chain: chain, staticIdea: staticIdea, staticBoundary: staticBoundary };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX || !window.LX.H) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H, KEY = "cf3_hydrogen_under_uncertainty";

  // the case: the study in time, then the explain layer's boundary and scale
  LX.mount("cf3", function (live, data) {
    var D = data[KEY];
    LX.Timeline(H("div", { class: "lx-card" }, live), D.timeline);
    var x = document.getElementById("cf3-explain");
    if (x) {
      x.innerHTML = ""; x.classList.add("is-live");
      LX.Boundary(H("div", { class: "lx-xcard" }, x), D.boundary);
      if (data.f01_five_scales) LX.ScaleStrip(H("div", { class: "lx-xcard" }, x), { title: "The scale of this case", scales: data.f01_five_scales.scales, mark: D.scale.mark, markText: D.scale.markText });
    }
  });

  // the idea: size one electrolyzer before the build-out is known (M8's toy)
  LX.mount("cf3-idea", function (live, data, root) {
    var M = LX.m08, D8 = data.m08_stochastic_robust, I = data[KEY].idea, fm = M.fm, S = M.scen(D8), P = plans(I, D8);
    var saved = LX.store.get("cf3-idea"), x0 = saved && typeof saved.x === "number" && saved.x >= 0 && saved.x <= D8.chart.xMax ? saved.x : I.start;
    var stage = H("div", { class: "lx-stage" }, live);
    H("h3", { text: I.title }, H("div", { class: "lx-stage-head" }, stage));
    H("p", { class: "lx-hint", text: I.note }, stage);
    var ctl = H("div", { class: "lx-ctls" }, stage);
    var sl = LX.Slider(ctl, { label: "Electrolyzer size, chosen before the build-out is known", min: 0, max: D8.chart.xMax, step: D8.chart.step, value: x0, color: "var(--lx-good)",
      fmt: function (v) { return fm.int(v) + " MW"; }, onChange: function (v) { paint(v, true); } });
    var sc = H("div", { class: "cf-ctl" }, stage);
    H("p", { class: "cf-ctl-l", id: "cf3-plan-l", text: "Or try a plan from lesson M8" }, sc);
    var seg = H("div", { class: "lx-seg", role: "group", "aria-labelledby": "cf3-plan-l" }, sc);
    var bs = P.map(function (p) {
      var b = H("button", { type: "button", text: p.label + " · " + fm.mw(p.x), "aria-pressed": "false" }, seg);
      b.addEventListener("click", function () { sl.set(p.x, true); });
      return b;
    });
    H("div", { html: defsHTML(I) }, sc);
    var tbl = H("div", { class: "cf3-led" }, stage);
    var st = H("div", { class: "lx-stage-status", "aria-live": "polite", style: "display:grid;gap:4px" }, stage);
    H("div", { class: "cf3-work", html: workedHTML(M, D8, I) + chainHTML(M, D8) }, stage);
    var why = H("details", { class: "lx-textalt" }, stage); H("summary", { text: I.assumptionsTitle }, why);
    H("div", { html: assumptionsHTML(M, D8, I) }, why);
    function paint(v, save) {
      var r = price(M, D8, v);
      bs.forEach(function (b, i) { b.setAttribute("aria-pressed", String(Math.abs(P[i].x - v) < 1e-9)); });
      tbl.innerHTML = "";
      LX.Ledger(tbl, { caption: "What " + fm.mw(v) + " costs a year in each build-out (2025 dollars; M = million)", columns: ["Build-out", "Chance", "Wind built", "Cost a year"],
        rows: S.map(function (s, i) { return { head: s.short, cells: [fm.pct(s.p), fm.int(s.W) + " MW", fm.m(r.per[i])] }; })
          .concat([{ head: "Expected", cells: ["", "", fm.m(r.exp)], total: true }]), cls: "cf3-tab" });
      st.innerHTML = status(M, D8, v).map(function (t) { return "<p>" + t + "</p>"; }).join("");
      if (save) LX.store.set("cf3-idea", { x: v });
    }
    paint(x0, false);
    // demo states (core.js LX.demo): "mid" = the plan for the average; "hedge" = the hedged plan
    LX.demo(root, function (state) {
      if (state === "mid") { sl.set(P[0].x, true); return { view: "the plan for the average" }; }
      if (state === "hedge") { sl.set(P[1].x, true); return { view: "the hedged plan" }; }
      return null;
    });
    root.lxLesson = { model: model, paint: paint };
  });
})();
