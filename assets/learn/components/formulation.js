/* formulation.js — LX.Formulation: the rules of a model in words, in symbols and as a table, linked by the selected rule
   (the curriculum's i-formulation viewer). With one view and onPick it is also a line-by-line reading of a published-style
   formulation, whose lines can be picked and marked (a bug hunt).
   LX.Formulation(host, {
     rules: [{ id: "bal", name: "Balance",                      the rule's name (table and words view; the symbols line's label)
               words: "Every hour, power made equals power used.", one or two sentences (plain text)
               sym: "&sum;<sub><i>g</i></sub> <i>p</i><sub><i>g,t</i></sub> = <i>d</i><sub><i>t</i></sub>",   symbols, as html
               symBase: "...",                                   symbols in the base model (used when full is false)
               rows: "24 (one per hour)" | function (full, hours) { return "..."; },   how many rows it stands for (table)
               dual: "the price: $ per MWh",                     what its dual means (table)
               extra: true,                                      part of the full model only (see full, showLater)
               tag: "(1)" }],                                    the symbols line's label instead of the name ("data", "goal", "(1)")
     legend: [["t", "hour, 0 to 23"], ...],      the symbols view's key: each symbol and what it stands for
     views: ["words", "symbols", "table"],       the views offered, in order; with one view there is no switch
     view: "table",                              the view shown first (default: the first)
     sel: "bal",                                 the rule highlighted in every view (null: none)
     full: true,                                 false: rules marked extra are left out, or shown grayed with extraNote when
     showLater: false, extraNote: "(added later)",   showLater is true; base rules then show symBase
     hours: 24,                                  passed to rows(full, hours)
     columns: ["Rule", "In words", "In symbols", "How many", ["Its dual means", "Its dual"]],   table headings; [heading, phone label]
                                                 gives a shorter label for the phone cards
     tagWidth: "9.5em",                          width of the symbols lines' label column (default 3em); under 560 px a
                                                 label wider than 3em goes above its line
     onPick: function (id, el) {},               symbols lines become buttons (aria-pressed); called after the press
     aria: "Suspect 1: select the wrong line" }) the spoken name of the group of lines
   Returns { set({ sel, view, full }), mark(id, "right" | "wrong" | null) (no id: clear every mark), lines: { id: element }
   (the symbols view's lines), el }. The view switch and the lines are buttons; the table becomes labeled cards on phones;
   long symbols wrap inside their line. LX.Formulation.visible(rules, full, showLater) is the pure filter (Node tests). */
(function () {
  "use strict";
  function visible(rules, full, showLater) { return rules.filter(function (r) { return full || !r.extra || showLater; }); }
  function symOf(r, full) { return !full && r.symBase ? r.symBase : r.sym; }
  function rowsOf(r, full, hours) { return typeof r.rows === "function" ? r.rows(full, hours) : r.rows == null ? "" : String(r.rows); }
  var pure = { visible: visible, symOf: symOf, rowsOf: rowsOf };
  if (typeof module !== "undefined" && module.exports) module.exports = pure;
  if (typeof window === "undefined" || !window.LX) return;
  var LX = window.LX, H = LX.H;
  var NAMES = { words: "In words", symbols: "In symbols", table: "As a table" };

  LX.Formulation = function (host, o) {
    var views = o.views || ["words", "symbols", "table"], view = o.view || views[0], sel = o.sel || null;
    var full = o.full !== false, hours = o.hours || 24, cols = o.columns || ["Rule", "In words", "In symbols", "How many", ["Its dual means", "Its dual"]];
    var head = cols.map(function (c) { return [].concat(c)[0]; }), lab = cols.map(function (c) { return [].concat(c)[1] || [].concat(c)[0]; });
    var w = H("div", { class: "lx-fviews" }, host), lines = {}, marks = {};
    var seg = views.length > 1 ? H("div", { class: "lx-seg", role: "group", "aria-label": "Show the model as" }, w) : null;
    var body = H("div", null, w);
    var btns = seg ? views.map(function (v) {
      return H("button", { type: "button", "aria-pressed": v === view ? "true" : "false", text: NAMES[v], onclick: function () { view = v; paint(); } }, seg);
    }) : [];
    function later(r) { return r.extra && !full; }
    function press(id) {
      Object.keys(lines).forEach(function (k) {
        lines[k].classList.toggle("on", k === id);
        if (o.onPick) lines[k].setAttribute("aria-pressed", k === id ? "true" : "false");
      });
    }
    function paint() {
      btns.forEach(function (b, i) { b.setAttribute("aria-pressed", views[i] === view ? "true" : "false"); });
      body.innerHTML = ""; lines = {};
      var rs = visible(o.rules, full, o.showLater);
      if (view === "words") {
        var ol = H("ol", { class: "lx-fwords" }, body);
        rs.forEach(function (r) {
          H("li", { class: r.id === sel ? "on" : null, html: "<b>" + LX.esc(r.name) + ".</b> " + LX.rich(r.words) +
            (later(r) ? ' <span class="lx-ftag">' + LX.esc(o.extraNote || "(added later)") + "</span>" : "") }, ol);
        });
      } else if (view === "symbols") {
        var box = H("div", { class: "lx-flines" + (o.tagWidth ? " wide" : ""), role: o.onPick ? "group" : null, "aria-label": o.aria || null,
          style: o.tagWidth ? "--lx-tagw:" + o.tagWidth : null }, body);
        rs.forEach(function (r) {
          var el = H(o.onPick ? "button" : "div", { class: "lx-fline" + (r.id === sel ? " on" : "") + (later(r) ? " later" : "") + (marks[r.id] ? " " + marks[r.id] : ""),
            type: o.onPick ? "button" : null, "aria-pressed": o.onPick ? (r.id === sel ? "true" : "false") : null }, box);
          H("span", { class: "ln", text: r.tag || r.name }, el);
          H("span", { class: "lx", html: symOf(r, full) }, el);
          if (o.onPick) {
            el.setAttribute("aria-label", r.name + ": " + el.textContent.replace(/\s+/g, " "));
            el.addEventListener("click", function () { sel = r.id; press(r.id); o.onPick(r.id, el); });
          }
          lines[r.id] = el;
        });
        if (o.legend) {
          var dl = H("dl", { class: "lx-flegend" }, body);
          o.legend.forEach(function (x) { H("dt", { text: x[0] }, dl); H("dd", { text: x[1] }, dl); });
        }
      } else {
        var sc = H("div", { class: "lx-scroll-x" }, body), tb = H("table", { class: "lx-ftab" }, sc);
        var hr = H("tr", null, H("thead", null, tb));
        head.forEach(function (h) { H("th", { scope: "col", text: h }, hr); });
        var tbody = H("tbody", null, tb);
        rs.forEach(function (r) {
          var tr = H("tr", { class: (r.id === sel ? "on " : "") + (later(r) ? "later" : "") }, tbody);
          H("td", { "data-l": lab[0], html: "<b>" + LX.esc(r.name) + "</b>" }, tr);
          H("td", { "data-l": lab[1], html: LX.rich(r.words) }, tr);
          H("td", { class: "sym", "data-l": lab[2], html: symOf(r, full) }, tr);
          H("td", { "data-l": lab[3], text: rowsOf(r, full, hours) }, tr);
          H("td", { "data-l": lab[4], text: r.dual || "" }, tr);
        });
      }
      LX.emit("layout");
    }
    paint();
    return {
      set: function (x) { if (x.sel !== undefined) sel = x.sel; if (x.view) view = x.view; if (x.full !== undefined) full = !!x.full; paint(); },
      mark: function (id, state) {
        if (id == null) { marks = {}; Object.keys(lines).forEach(function (k) { lines[k].classList.remove("right", "wrong"); }); return; }
        if (state) marks[id] = state; else delete marks[id];
        if (lines[id]) { lines[id].classList.remove("right", "wrong"); if (state) lines[id].classList.add(state); }
      },
      get lines() { return lines; },
      el: w
    };
  };
  LX.Formulation.visible = visible;
})();
