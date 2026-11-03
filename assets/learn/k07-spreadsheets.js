// k07-spreadsheets.js — Toolbox K7, "Spreadsheets in practice" (step cards, Learn W1, 2026-11-02).
//
// Just-in-time skills for B2 (Python and data) and the Analyst tier. One interactive: a small working spreadsheet of
// Prairie Town's real day (3 September 2025, the same hours as lesson 0) with a formula bar, cell addresses, fill-down,
// relative and absolute references, SUM, AVERAGE, MIN, MAX, ROUND, ABS and COUNT. Seven step cards walk from addresses to
// a what-if; a practice sheet in the Check section has five tasks checked automatically.
//
// Pure model (exported for Node, no DOM): townDay (lesson 0's cut and scaling, checked against grid-operator.js by the
// test), the sheet layout (layout()), and the practice tasks with their expected answers. The spreadsheet itself (the
// formula engine, the formula bar and grid, fill-down) is the shared LX.Sheet (components/sheet.js); value, shift, refsIn
// and the rest are re-exported here so the lesson's test reads as before. The "sheet you can trust" list is LX.Checklist.
(function () {
  "use strict";

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

  // ---------------------------------------------------------------- formula engine: the shared LX.Sheet (components/sheet.js)
  // window.LX.Sheet.engine in the page (learn.js loads first), the component file in Node
  function engine() {
    if (typeof window !== "undefined" && window.LX && window.LX.Sheet) return window.LX.Sheet.engine;
    return require("./components/sheet.js");
  }
  function value(sheet, name) { return engine().value(sheet, name); }
  function changed(sheet) { engine().changed(sheet); }
  function shift(raw, dr, dc) { return engine().shift(raw, dr, dc); }
  function refsIn(raw) { return engine().refsIn(raw); }
  function isErr(v) { return engine().isErr(v); }

  // ---------------------------------------------------------------- the sheet of Prairie Town's day
  var R0 = 5;   // first hour row
  function layout(D) {
    var cells = { A1: "Nuclear output, MW", E1: String(D.fleet.nuclear.mw), A2: "Gas price, $/MWh", E2: "40",
                  A4: "Hour", B4: "Demand, MW", C4: "Wind, MW", D4: "Solar, MW", E4: "Gas needed, MW", F4: "Gas cost, $",
                  A30: "Day total", E30: "=SUM(E5:E28)", A31: "Peak hour", E31: "=MAX(E5:E28)" };
    for (var t = 0; t < 24; t++) { var r = R0 + t; cells["A" + r] = (t < 10 ? "0" : "") + t + ":00"; cells["B" + r] = String(D.demand[t]); cells["C" + r] = String(D.wind[t]); cells["D" + r] = String(D.solar[t]); }
    return { cells: cells, rows: 31, cols: 6, labels: { 1: 1, 2: 1, 30: 1, 31: 1, 33: 1, 34: 1, 35: 1, 36: 1, 37: 1 } };
  }
  function filled(D) {   // the sheet as the steps leave it
    var s = layout(D);
    for (var r = R0; r < R0 + 24; r++) { s.cells["E" + r] = "=B" + r + "-C" + r + "-D" + r + "-$E$1"; s.cells["F" + r] = "=E" + r + "*$E$2"; }
    s.cells.F30 = "=SUM(F5:F28)";
    return s;
  }
  function tasks(D) {
    var sum = function (a) { return a.reduce(function (x, y) { return x + y; }, 0); }, ev = D.need.slice(17, 22);
    return [
      { cell: "E33", label: "Demand over the day, MWh", ask: "Total demand energy over the day, in MWh (each row is one hour).", answer: sum(D.demand), hint: "=SUM(B5:B28)" },
      { cell: "E34", label: "Wind and solar share, %", ask: "Share of the day's demand met by wind and solar, in %.", answer: 100 * sum(D.wind.concat(D.solar)) / sum(D.demand), hint: "=SUM(C5:D28)/SUM(B5:B28)*100" },
      { cell: "E35", label: "Gas, 17:00–21:00, avg MW", ask: "Average gas need from 17:00 to 21:00, in MW.", answer: sum(ev) / ev.length, hint: "=AVERAGE(E22:E26)" },
      { cell: "E36", label: "Highest solar, MW", ask: "The day's highest solar output, in MW.", answer: Math.max.apply(null, D.solar), hint: "=MAX(D5:D28)" },
      { cell: "E37", label: "Gas cost at $55/MWh", ask: "The day's gas cost if gas cost $55 per MWh, without changing E2.", answer: 55 * sum(D.need), hint: "=E30*55" }];
  }

  var model = { townDay: townDay, value: value, changed: changed, shift: shift, refsIn: refsIn, isErr: isErr,
                tokenize: function (src) { return engine().tokenize(src); }, parse: function (src) { return engine().parse(src); },
                colName: function (n) { return engine().colName(n); }, colNum: function (s) { return engine().colNum(s); },
                layout: layout, filled: filled, tasks: tasks, R0: R0 };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;

  // ================================================================ view
  var LX = window.LX, H = LX.H;
  function show(v, col) { return engine().show(v, col === "F" ? "$" : ""); }
  // the working sheet (LX.Sheet): formula bar, grid (roving focus, arrow keys), fill-down over the 24 hour rows of E and F
  function SheetView(host, sheet, o) {
    return LX.Sheet(host, sheet, { start: o.start || "B5", fillRows: [R0, R0 + 23], fillCols: "EF", prefix: { F: "$" }, wide: "F", headRow: 4, todo: o.todo,
      label: "Spreadsheet of Prairie Town's day; use the arrow keys to move, Enter to edit", onSelect: o.onSelect, onChange: o.onChange });
  }

  function view(live, data, root) {
    var D = townDay(data.town, data.town_year), S = layout(D), need = D.need, steps = [], stepIdx = 0, checks = [];
    var sum = function (a) { return a.reduce(function (x, y) { return x + y; }, 0); };
    S.lock = function (n) { var c = n.replace(/\d+/, ""), r = +n.replace(/[A-Z]+/, ""); return (r >= R0 && r < R0 + 24 && "ABCD".indexOf(c) >= 0) || r === 4 || (c === "A"); };
    var host = H("div", { class: "k7-host" }, null), sv = null;
    function colOK(col, f) { for (var t = 0; t < 24; t++) { var v = value(S, col + (R0 + t)); if (typeof v !== "number" || Math.abs(v - f(t)) > 1e-9) return false; } return true; }
    function isFormula(n) { return /^=/.test(S.cells[n] || ""); }

    steps.push({ text: "Every cell has an address: a column letter and a row number. Click the cell that holds Prairie Town's demand at 19:00.",
      build: function (act, api) { mountSheet(act); checks[0] = function (sel) { if (sel === "B24") { api.done(); api.saw("B24: column B is demand, row 24 is 19:00, " + D.demand[19] + " MW. Formulas point at addresses like this, not at the numbers."); } }; } });
    steps.push({ text: "A formula starts with =. In E5, type =B5-C5-D5-E1 and press Enter: demand minus wind, solar and nuclear is what gas must cover at midnight.",
      build: function (act, api) { mountSheet(act, "E5"); checks[1] = function () {
        var v = value(S, "E5");
        if (!S.cells.E5) return;
        if (!isFormula("E5")) { api.saw("That is a typed number, not a formula: change the demand and it will not follow. Start with =.", true); return; }
        var refs = refsIn(S.cells.E5).map(function (x) { return x.replace(/\$/g, ""); });
        if (v === need[0] && ["B5", "C5", "D5"].every(function (x) { return refs.indexOf(x) >= 0; })) { api.done(); api.saw("E5 = " + D.demand[0] + " − " + D.wind[0] + " − " + D.solar[0] + " − " + D.fleet.nuclear.mw + " = " + need[0] + " MW, the gas need at 00:00 in lesson 0."); }
        else api.saw("E5 shows " + show(v) + ". Use the four cells: =B5-C5-D5-E1.", true);
      }; } });
    steps.push({ text: "Select E5 and press Fill down to copy it to every hour. Then select E6 and read its formula: what happened to E1?",
      build: function (act, api) { mountSheet(act, "E5");
        var q = H("div", { class: "k7-q", hidden: true }, act), opts = ["E1 slid to E2, E3 and so on", "B5 stayed B5 in every row", "Nothing changed"];
        H("p", { class: "lx-qtext", text: "E6 shows " + "?" + " MW instead of " + need[1] + ". Why?" }, q);
        var row = H("div", { class: "lx-qbtns" }, q);
        opts.forEach(function (t, i) { var b = H("button", { type: "button", class: "lx-choice", text: t }, row); b.addEventListener("click", function () {
          b.classList.add(i === 0 ? "right" : "wrong");
          if (i === 0) { api.done(); api.saw("Fill down moves every relative address one row per row. That is right for B5, C5 and D5, and wrong for E1, the one nuclear input."); } else api.saw("Read E6's formula in the bar: compare its last address with E5's.", true);
        }); });
        checks[2] = function (sel, how) {
          if (how !== "fill") return;
          if (refsIn(S.cells.E5).indexOf("E1") >= 0) { q.hidden = false; q.querySelector(".lx-qtext").textContent = "E6 now shows " + show(value(S, "E6")) + " MW, not " + need[1] + ". Why?"; }
          else if (value(S, "E6") === need[1]) { api.done(); api.saw("You pinned E1 already. Fill down moves every relative address one row per row; $ stops it."); }
        };
      } });
    steps.push({ text: "Pin the input with an [[absolute-reference|absolute address]]. Edit E5 to =B5-C5-D5-$E$1, then fill down again. Every hour should now match lesson 0: " + need[19] + " MW at 19:00.",
      build: function (act, api) { mountSheet(act, "E5"); checks[3] = function () {
        if (colOK("E", function (t) { return need[t]; })) { api.done(); api.saw("$E$1 never moves, so every row subtracts the same nuclear input. Peak gas need: " + Math.max.apply(null, need) + " MW at 19:00, as in lesson 0."); }
      }; } });
    steps.push({ text: "Now the cost. In F5, type =E5*$E$2 and fill down: MW for one hour is MWh, and MWh times $/MWh is dollars.",
      build: function (act, api) { mountSheet(act, "F5"); checks[4] = function () {
        if (colOK("F", function (t) { return need[t] * 40; })) { api.done(); api.saw("Each row: MW × 1 h × $/MWh = $. At midnight " + need[0] + " MW costs " + show(need[0] * 40, "F") + "; at 19:00, " + show(need[19] * 40, "F") + ". The column assumes the combined-cycle plant covers it all at $40."); }
      }; } });
    steps.push({ text: "Functions add up whole ranges. E30 and E31 already hold =SUM(E5:E28) and =MAX(E5:E28). In F30, add up the day's gas cost.",
      build: function (act, api) { mountSheet(act, "F30"); checks[5] = function () {
        var v = value(S, "F30");
        if (isFormula("F30") && v === sum(need) * 40) { api.done(); api.saw("SUM(F5:F28) = " + show(v, "F") + " for " + sum(need).toLocaleString("en-US") + " MWh of gas. A range like F5:F28 means every cell from F5 down to F28."); }
        else if (S.cells.F30) api.saw("F30 shows " + show(v) + ". Try =SUM(F5:F28).", true);
      }; } });
    steps.push({ text: "Change one input, and every result follows. Set the gas price in E2 to 60, then check that the total F30 equals the energy E30 times the price E2.",
      build: function (act, api) { mountSheet(act, "E2"); var chk = H("p", { class: "k7-check", "aria-live": "polite" }, act); checks[6] = function () {
        var p = value(S, "E2"), e = value(S, "E30"), f = value(S, "F30");
        chk.innerHTML = "Check: E30 × E2 = " + show(e) + " × " + show(p) + " = <b>" + show(e * p, "F") + "</b>; F30 = <b>" + show(f, "F") + "</b> " + (Math.abs(e * p - f) < 1e-6 ? "✓" : "✗");
        if (typeof p === "number" && p !== 40 && Math.abs(e * p - f) < 1e-6) { api.done(); api.saw("At $" + p + "/MWh the day costs " + show(f, "F") + ". Inputs in their own cells, formulas that point at them, and a check cell: that is a sheet you can trust."); }
      }; checks[6](); } });

    function mountSheet(act, start) { act.appendChild(host); if (sv) { sv.select(start || "B5"); } }
    sv = SheetView(host, S, { start: "B5",
      onSelect: function (n) { if (stepIdx === 0 && checks[0]) checks[0](n); },
      onChange: function (sheet, n, how) { if (checks[stepIdx]) checks[stepIdx](n, how); } });
    var cards = LX.StepCards(live, { id: "k7-steps", steps: steps, onStep: function (i) { stepIdx = i; LX.emit("layout"); } });
    LX.demo(root, function (state) {   // core.js LX.demo: mid = step 3 after a fill-down with E1; fixed = step 5 with E fixed and F filled
      if (state === "mid") { cards.go(2); sv.set("E5", "=B5-C5-D5-E1"); sv.select("E5"); sv.fill(); sv.select("E6"); return { view: "step 3" }; }
      if (state !== "fixed") return null;
      cards.go(4); sv.set("E5", "=B5-C5-D5-$E$1"); sv.select("E5"); sv.fill(); sv.set("F5", "=E5*$E$2"); sv.select("F5"); sv.fill(); sv.select("F24");
      return { view: "step 5" };
    }, cards);
    explain();
    practice(D);
  }

  function explain() {
    var x = document.getElementById("k7-explain"); if (!x) return; x.innerHTML = "";
    LX.CompareTable(H("div", { class: "lx-xcard w1h-stack" }, x), {
      title: "Four ways to write one address",
      columns: [{ key: "name", label: "Address", main: true }, { key: "down", label: "Filled down one row" }, { key: "right", label: "Filled right one column", phoneHide: true }, { key: "use", label: "Use it for" }],
      rows: [
        { key: "rel", color: "var(--lx-accent)", name: "B5", note: "relative", down: "B6", right: "C5", use: "data that changes row by row" },
        { key: "abs", color: "var(--lx-cc)", name: "$E$1", note: "absolute", down: "$E$1", right: "$E$1", use: "one input, such as a price" },
        { key: "row", color: "var(--lx-wind)", name: "E$1", note: "row fixed", down: "E$1", right: "F$1", use: "a row of inputs, one per column" },
        { key: "col", color: "var(--lx-solar)", name: "$E1", note: "column fixed", down: "$E2", right: "$E1", use: "a column of inputs, one per row" }]
    });
    var items = [["Inputs apart", "Every input in its own labelled cell, with its unit."], ["No numbers inside formulas", "Formulas point at input cells, so one change updates everything."],
                 ["$ for inputs", "Absolute addresses for inputs, relative ones for data."], ["One formula per column", "Write it once, fill it down, spot-check one row by hand."],
                 ["A check cell", "Compute a total two ways and compare, as F30 against E30 × E2."], ["Source and date", "Name where the data came from and when, beside the data."]];
    LX.Checklist(H("div", { class: "lx-xcard" }, x), { id: "k7-check", title: "A sheet you can trust", count: "head", soft: true, inline: true, sep: ". ", ordered: true,
      lede: "Six habits; tick the ones your own sheets already have (stored in this browser only).",
      items: items.map(function (it) { return { label: it[0], text: it[1] }; }) });
  }

  // ---- practice: the finished sheet and five tasks, each checked when its cell holds a formula with the right value
  function practice(D) {
    var host = document.getElementById("k7-practice"); if (!host) return; host.innerHTML = "";
    var S = filled(D), T = tasks(D); S.rows = 37; var card = H("div", { class: "lx-card k7-practice" }, host);
    var hd = H("div", { class: "lx-x-head" }, card); H("h3", { text: "Practice sheet" }, hd);
    var score = H("span", { class: "lx-step-n", "aria-live": "polite" }, hd);
    H("p", { class: "lx-hint", text: "The finished sheet from the steps. Type each answer as a formula in its yellow cell (E33 to E37); a typed number does not count." }, card);
    T.forEach(function (t) { S.cells["A" + t.cell.slice(1)] = t.label; });
    S.lock = function (n) { return T.every(function (t) { return t.cell !== n; }) && n !== "E2"; };
    var ul = H("ol", { class: "k7-tasks" }, card), lis = {};
    T.forEach(function (t) { var li = H("li", null, ul); H("span", { text: t.ask + " " }, li); H("b", { text: "→ " + t.cell }, li); var h = H("details", { class: "k7-hint" }, li); H("summary", { text: "Hint" }, h); H("code", { text: t.hint }, h); lis[t.cell] = li; });
    SheetView(card, S, { start: "E33", onChange: grade, todo: T.map(function (t) { return t.cell; }) });
    function grade() {
      var n = 0;
      T.forEach(function (t) { var v = value(S, t.cell), good = /^=/.test(S.cells[t.cell] || "") && typeof v === "number" && Math.abs(v - t.answer) <= 1e-6 * Math.max(1, Math.abs(t.answer)) + 0.005; lis[t.cell].classList.toggle("done", good); if (good) n++; });
      score.textContent = n + " of " + T.length + " done";
    }
    grade();
  }

  LX.mount("k07", function (live, data, root) { view(live, data, root); });
})();
