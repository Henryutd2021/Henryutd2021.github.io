// k07-spreadsheets.js — Toolbox K7, "Spreadsheets in practice" (step cards).
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
// Grading: a formula counts when it gives the right number AND still gives the right number after the inputs change
// (follows(): the day's demand, wind and solar and the gas cost are nudged in a copy of the sheet), so a typed constant
// such as =6957 does not pass. The nuclear input is checked the same way (followsE1(): E1 changed in a copy), so a typed
// 100 in place of E1 does not pass steps 2 to 4; F30 must add the hourly costs (sumsHours(): one hourly cost changed in
// a copy moves F30), so step 7's check against E30 × E2 is a real second route. No-JS version: staticSheet() (the whole
// day, the totals, the four ways to write an address, and the five practice tasks with their answers), written into the
// page by `node _tests/learn/test_k07-spreadsheets.js --write`.
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
    var cells = { A1: "Nuclear output, MW", E1: String(D.fleet.nuclear.mw), A2: "Gas cost, $/MWh", E2: "40",
                  A4: "Hour", B4: "Demand, MW", C4: "Wind, MW", D4: "Solar, MW", E4: "Gas needed, MW", F4: "Gas cost, $",
                  A30: "Day total: gas energy, MWh (E); cost, $ (F)", E30: "=SUM(E5:E28)", A31: "Peak hour: gas output, MW", E31: "=MAX(E5:E28)" };
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
      { cell: "E35", label: "Gas, rows 17:00–21:00, avg MW", ask: "Average gas need over the five hourly rows labeled 17:00 to 21:00, in MW.", answer: sum(ev) / ev.length, hint: "=AVERAGE(E22:E26)" },
      { cell: "E36", label: "Highest solar, MW", ask: "The day's highest solar output, in MW.", answer: Math.max.apply(null, D.solar), hint: "=MAX(D5:D28)" },
      { cell: "E37", label: "Gas cost at the E32 cost", ask: "The day's gas cost at the alternative gas cost in E32, $55 per MWh, without changing E2.", answer: (D.alt || ALT) * sum(D.need), hint: "=E30*E32" }];
  }
  // the practice sheet: the finished sheet, the alternative gas cost as a labelled input (E32), the five task rows
  var ALT = 55;
  function practiceSheet(D) {
    var S = filled(D), T = tasks(D); S.rows = 37;
    S.cells.A32 = "Alternative gas cost, $/MWh"; S.cells.E32 = String(ALT); S.labels[32] = 1;
    T.forEach(function (t) { S.cells["A" + t.cell.slice(1)] = t.label; });
    return S;
  }

  // the inputs nudged: demand, wind and solar rows, the gas cost and the practice's alternative cost (E32) change;
  // nuclear (E1) stays, so gas need follows
  function nudge(D) {
    var nuc = D.fleet.nuclear.mw;
    var demand = D.demand.map(function (v, t) { return v + 7 + (t % 3); }), wind = D.wind.map(function (v) { return v + 2; }), solar = D.solar.map(function (v) { return v + 3; });
    return { fleet: D.fleet, demand: demand, wind: wind, solar: solar, need: demand.map(function (v, t) { return v - nuc - wind[t] - solar[t]; }), price: 41, alt: ALT + 3 };
  }
  function close(v, want) { return typeof v === "number" && Math.abs(v - want) <= 1e-6 * Math.max(1, Math.abs(want)) + 0.005; }
  // does the sheet's cell still give `want(N)` once the inputs are nudged? (a copy; the reader's sheet is untouched)
  function follows(sheet, cell, want, D) {
    var N = nudge(D), c = {};
    Object.keys(sheet.cells).forEach(function (k) { c[k] = sheet.cells[k]; });
    for (var t = 0; t < 24; t++) { c["B" + (R0 + t)] = String(N.demand[t]); c["C" + (R0 + t)] = String(N.wind[t]); c["D" + (R0 + t)] = String(N.solar[t]); }
    c.E2 = String(N.price); if (c.E32 != null) c.E32 = String(N.alt);
    return close(value({ cells: c, rows: sheet.rows, cols: sheet.cols }, cell), want(N));
  }
  // does the gas need in `cells` (E5 or the whole column) follow a change of the nuclear input E1? (a copy)
  function followsE1(sheet, D, rows) {
    var c = {}, nuc = D.fleet.nuclear.mw + 10;
    Object.keys(sheet.cells).forEach(function (k) { c[k] = sheet.cells[k]; });
    c.E1 = String(nuc);
    var cp = { cells: c, rows: sheet.rows, cols: sheet.cols };
    return (rows || [0]).every(function (t) { return close(value(cp, "E" + (R0 + t)), D.demand[t] - D.wind[t] - D.solar[t] - nuc); });
  }
  // does F30 add the hourly costs? One hourly cost changed in a copy must move F30 by the same amount
  function sumsHours(sheet) {
    var c = {}, f0 = value(sheet, "F30");
    Object.keys(sheet.cells).forEach(function (k) { c[k] = sheet.cells[k]; });
    var v = value(sheet, "F15"); if (typeof v !== "number" || typeof f0 !== "number") return false;
    c.F15 = String(v + 1);
    return close(value({ cells: c, rows: sheet.rows, cols: sheet.cols }, "F30"), f0 + 1);
  }
  // a practice task is done when its cell holds a formula with the right value that also follows the inputs
  function graded(sheet, D) {
    var T = tasks(D);
    return T.map(function (t, i) {
      return /^=/.test(sheet.cells[t.cell] || "") && close(value(sheet, t.cell), t.answer) && follows(sheet, t.cell, function (N) { return tasks(N)[i].answer; }, D);
    });
  }
  // the four ways to write an address (the explain layer's table and the no-JS version)
  var ADDR = [
    { key: "rel", name: "B5", note: "relative", down: "B6", right: "C5", use: "data that changes row by row" },
    { key: "abs", name: "$E$1", note: "absolute", down: "$E$1", right: "$E$1", use: "one input, such as a price" },
    { key: "row", name: "E$1", note: "row fixed", down: "E$1", right: "F$1", use: "a row of inputs, one per column" },
    { key: "col", name: "$E1", note: "column fixed", down: "$E2", right: "$E1", use: "a column of inputs, one per row" }];
  // the no-JS version: the whole day with its totals, and the five practice tasks with closed answers
  function staticSheet(D) {
    var f = function (v) { return Math.round(v).toLocaleString("en-US"); }, sum = function (a) { return a.reduce(function (x, y) { return x + y; }, 0); };
    var rows = ['<table class="k7-static" aria-label="Prairie Town\'s day, 3 September 2025, one row per hour">',
      '<thead><tr><th scope="col">Row</th><th scope="col">Hour</th><th scope="col">Demand, MW</th><th scope="col">Wind, MW</th><th scope="col">Solar, MW</th><th scope="col">Gas needed, MW</th><th scope="col">Gas cost, $</th></tr></thead>', "<tbody>"];
    for (var t = 0; t < 24; t++) {
      var g = t === 0 ? " <small>=B5-C5-D5-$E$1</small>" : "", c = t === 0 ? " <small>=E5*$E$2</small>" : "";
      rows.push("<tr><td>" + (R0 + t) + "</td><td>" + (t < 10 ? "0" : "") + t + ":00</td><td>" + D.demand[t] + "</td><td>" + D.wind[t] + "</td><td>" + D.solar[t] + "</td><td>" + D.need[t] + g + "</td><td>" + f(D.need[t] * 40) + c + "</td></tr>");
    }
    rows.push('<tr><td>30</td><th scope="row" colspan="4">Day total: gas energy (MWh) and cost ($)</th><td>' + f(sum(D.need)) + " MWh <small>=SUM(E5:E28)</small></td><td>$" + f(sum(D.need) * 40) + " <small>=SUM(F5:F28)</small></td></tr>");
    rows.push('<tr><td>31</td><th scope="row" colspan="4">Peak hour: gas output (MW)</th><td>' + Math.max.apply(null, D.need) + " MW <small>=MAX(E5:E28)</small></td><td></td></tr>");
    rows.push("</tbody></table>");
    var T = tasks(D), unit = ["MWh", "%", "MW", "MW", "$"], pr = [];
    pr.push('<div class="lx-card k7-practice"><div class="lx-x-head"><h3>Practice sheet</h3></div>');
    pr.push('<p class="lx-hint">Use the table of the day above, about 30 minutes. With JavaScript on, you type each answer as a formula in a working sheet.</p><ol class="k7-tasks">');
    T.forEach(function (x, i) {
      var a = i === 1 ? (Math.round(x.answer * 10) / 10).toFixed(1) + "%" : i === 4 ? "$" + f(x.answer) : f(x.answer) + " " + unit[i];
      pr.push("<li>" + x.ask + ' <details class="k7-hint"><summary>Answer</summary><code>' + x.hint + "</code> = " + a + "</details></li>");
    });
    pr.push("</ol></div>");
    var ad = ['<table class="k7-static" aria-label="Four ways to write one address, and what fill-down and fill-right do to each">',
      '<thead><tr><th scope="col">Address</th><th scope="col">Kind</th><th scope="col">Filled down one row</th><th scope="col">Filled right one column</th><th scope="col">Use it for</th></tr></thead>', "<tbody>"];
    ADDR.forEach(function (a) { ad.push("<tr><td>" + a.name + "</td><td>" + a.note + "</td><td>" + a.down + "</td><td>" + a.right + "</td><td>" + a.use + "</td></tr>"); });
    ad.push("</tbody></table>");
    return { table: rows.join("\n"), practice: pr.join("\n"), addr: ad.join("\n") };
  }

  var model = { townDay: townDay, value: value, changed: changed, shift: shift, refsIn: refsIn, isErr: isErr,
                nudge: nudge, follows: follows, followsE1: followsE1, sumsHours: sumsHours, graded: graded, staticSheet: staticSheet, practiceSheet: practiceSheet, ADDR: ADDR, ALT: ALT,
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
      label: "Spreadsheet of Prairie Town's day; use the arrow keys to move, Enter to edit", onSelect: o.onSelect, onChange: o.onChange,
      lockMsg: function (n) { return n === "E1" ? "E1 stays at lesson 0's 100 MW here; for a what-if, change the gas cost in E2." : n + " holds data; edit the yellow cells."; } });
  }

  function view(live, data, root) {
    var D = townDay(data.town, data.town_year), S = layout(D), need = D.need, steps = [], stepIdx = 0, checks = [];
    var HOURS24 = []; for (var h = 0; h < 24; h++) HOURS24.push(h);
    var sum = function (a) { return a.reduce(function (x, y) { return x + y; }, 0); };
    // locked: the day's data, the headers, the labels and the nuclear input E1 (so gas need never goes below zero)
    S.lock = function (n) { var c = n.replace(/\d+/, ""), r = +n.replace(/[A-Z]+/, ""); return (r >= R0 && r < R0 + 24 && "ABCD".indexOf(c) >= 0) || r === 4 || (c === "A") || n === "E1"; };
    var host = H("div", { class: "k7-host" }, null), sv = null;
    function colOK(col, f) { for (var t = 0; t < 24; t++) { var v = value(S, col + (R0 + t)); if (typeof v !== "number" || Math.abs(v - f(t)) > 1e-9) return false; } return true; }
    function isFormula(n) { return /^=/.test(S.cells[n] || ""); }

    steps.push({ text: "Every cell has an address: a column letter and a row number. Click the cell that holds Prairie Town's [[demand|demand]] at 19:00.",
      build: function (act, api) { mountSheet(act); checks[0] = function (sel) { if (sel === "B24") { api.done(); api.saw("B24: column B is demand, row 24 is 19:00, " + D.demand[19] + " MW. Formulas point at addresses like this, not at the numbers."); } }; } });
    steps.push({ text: "A formula starts with =. In E5, type =B5-C5-D5-E1 and press Enter: demand minus wind, solar and nuclear is what gas must cover at midnight.",
      build: function (act, api) { mountSheet(act, "E5"); checks[1] = function () {
        var v = value(S, "E5");
        if (!S.cells.E5) return;
        if (!isFormula("E5")) { api.saw("That is a typed number, not a formula: change the demand and it will not follow. Start with =.", true); return; }
        var refs = refsIn(S.cells.E5).map(function (x) { return x.replace(/\$/g, ""); });
        if (v === need[0] && ["B5", "C5", "D5"].every(function (x) { return refs.indexOf(x) >= 0; }) && !followsE1(S, D)) { api.saw("Right number, but the nuclear output is typed in: change E1 and E5 will not follow. Point at it: =B5-C5-D5-E1.", true); return; }
        if (v === need[0] && ["B5", "C5", "D5", "E1"].every(function (x) { return refs.indexOf(x) >= 0; })) { api.done(); api.saw("E5 = " + D.demand[0] + " − " + D.wind[0] + " − " + D.solar[0] + " − " + D.fleet.nuclear.mw + " = " + need[0] + " MW, the gas need at 00:00 in lesson 0."); }
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
          else if (value(S, "E6") === need[1] && followsE1(S, D, [0, 1, 19])) { api.done(); api.saw("You pinned E1 already. Fill down moves every relative address one row per row; $ stops it."); }
          else if (value(S, "E6") === need[1]) api.saw("The rows match, but the nuclear output is typed in, not taken from E1: edit E5 to =B5-C5-D5-E1 and fill down again.", true);
        };
      } });
    steps.push({ text: "Pin the input with an [[absolute-reference|absolute address]]. Edit E5 to =B5-C5-D5-$E$1, then fill down again. Every hour should now match lesson 0: " + need[19] + " MW at 19:00.",
      build: function (act, api) { mountSheet(act, "E5"); checks[3] = function () {
        if (colOK("E", function (t) { return need[t]; }) && !followsE1(S, D, HOURS24)) { api.saw("Every hour matches, but the nuclear output is typed in: point every row at $E$1, as =B5-C5-D5-$E$1.", true); return; }
        if (colOK("E", function (t) { return need[t]; })) { api.done(); api.saw("$E$1 never moves, so every row subtracts the same nuclear input. Peak gas need: " + Math.max.apply(null, need) + " MW at 19:00, as in lesson 0."); }
      }; } });
    steps.push({ text: "Now the cost. In F5, type =E5*$E$2 and fill down. A row's [[megawatt|MW]], held for one hour, is [[megawatt-hour|MWh]]; MWh times $/MWh is dollars.",
      build: function (act, api) { mountSheet(act, "F5"); checks[4] = function () {
        if (colOK("F", function (t) { return need[t] * 40; })) { api.done(); api.saw("Each row: MW × 1 h × $/MWh = $. At midnight, " + need[0] + " MW × 1 h × $40/MWh = " + show(need[0] * 40, "F") + "."); }
      }; } });
    steps.push({ text: "Functions work on whole ranges of cells, such as E5:E28. In F30, use one to add up the day's hourly gas costs.",
      build: function (act, api) {
        H("p", { class: "lx-hint", html: "<b>SUM</b>(E5:E28) adds the cells from E5 to E28; <b>MAX</b>(E5:E28) finds the largest. E30 and E31 already use them." }, act);
        mountSheet(act, "F30"); checks[5] = function () {
        var v = value(S, "F30");
        if (isFormula("F30") && v === sum(need) * 40 && !sumsHours(S)) { api.saw("Right number, but F30 does not add the hourly costs, so step 7's check would compare it with itself. Use =SUM(F5:F28).", true); return; }
        var ok = isFormula("F30") && v === sum(need) * 40 && follows(S, "F30", function (N) { return sum(N.need) * N.price; }, D);
        if (ok) { api.done(); api.saw("F30 = " + show(v, "F") + ". E30 is energy: each hour's MW × 1 h, added up, " + sum(need).toLocaleString("en-US") + " MWh. F5:F28 means every cell from F5 to F28."); }
        else if (S.cells.F30 && v === sum(need) * 40) api.saw("Right number, but it would not follow a change in the inputs. Point at the cells: =SUM(F5:F28).", true);
        else if (S.cells.F30) api.saw("F30 shows " + show(v) + ". Try =SUM(F5:F28).", true);
      }; } });
    steps.push({ text: "Change one input, and every result follows. Set the gas cost in E2 to 60, then check that the total F30 equals the energy E30 times the cost E2.",
      build: function (act, api) { mountSheet(act, "E2"); var chk = H("p", { class: "k7-check", "aria-live": "polite" }, act); checks[6] = function () {
        var p = value(S, "E2"), e = value(S, "E30"), f = value(S, "F30");
        chk.innerHTML = "Check: E30 × E2 = " + show(e) + " × " + show(p) + " = <b>" + show(e * p, "F") + "</b>; F30 = <b>" + show(f, "F") + "</b> " + (Math.abs(e * p - f) < 1e-6 ? "✓" : "✗");
        if (typeof p === "number" && p < 0) { api.saw("A cost below zero has no meaning here. Try 60.", true); return; }
        if (typeof p === "number" && p !== 40 && Math.abs(e * p - f) < 1e-6) { api.done(); api.saw("At $" + p + "/MWh the day costs " + show(f, "F") + ". The two totals agree, so the sheet is consistent; to trust it, also check the hourly balance and one row by hand."); }
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
      rows: ADDR.map(function (a, i) { return Object.assign({ color: ["var(--lx-accent)", "var(--lx-cc)", "var(--lx-wind)", "var(--lx-solar)"][i] }, a); })
    });
    var items = [["Inputs apart", "Every input in its own labeled cell, with its unit."], ["Assumptions in input cells", "Formulas point at input cells, not at typed numbers, so one change updates everything."],
                 ["$ for inputs", "Absolute addresses for inputs, relative ones for data."], ["One formula per column", "Write it once, fill it down, spot-check one row by hand."],
                 ["A check cell", "Compute a total two ways and compare, as F30 against E30 × E2. Agreement shows consistency, not correctness."], ["Source and date", "Name where the data came from and when, beside the data."]];
    LX.Checklist(H("div", { class: "lx-xcard" }, x), { id: "k7-check", title: "A sheet you can trust", count: "head", soft: true, inline: true, sep: ". ", ordered: true,
      lede: "Six habits; tick the ones your own sheets already have (stored in this browser only).",
      items: items.map(function (it) { return { label: it[0], text: it[1] }; }) });
  }

  // ---- practice: the finished sheet and five tasks, each checked when its cell holds a formula with the right value
  function practice(D) {
    var host = document.getElementById("k7-practice"); if (!host) return; host.innerHTML = "";
    var S = practiceSheet(D), T = tasks(D), card = H("div", { class: "lx-card k7-practice" }, host);
    var hd = H("div", { class: "lx-x-head" }, card); H("h3", { text: "Practice sheet · about 30 minutes" }, hd);
    var score = H("span", { class: "lx-step-n", "aria-live": "polite" }, hd);
    H("p", { class: "lx-hint", text: "Type each answer in its yellow cell (E33 to E37) as a formula that points at the cells; a typed number, even after =, does not count." }, card);
    S.lock = function (n) { return T.every(function (t) { return t.cell !== n; }) && n !== "E2"; };
    var ul = H("ol", { class: "k7-tasks" }, card), lis = {};
    T.forEach(function (t) { var li = H("li", null, ul); H("span", { text: t.ask + " " }, li); H("b", { text: "→ " + t.cell }, li); var h = H("details", { class: "k7-hint" }, li); H("summary", { text: "Hint" }, h); H("code", { text: t.hint }, h); lis[t.cell] = li; });
    SheetView(card, S, { start: "E33", onChange: grade, todo: T.map(function (t) { return t.cell; }) });
    function grade() {
      var g = graded(S, D), n = 0;
      T.forEach(function (t, i) { lis[t.cell].classList.toggle("done", g[i]); if (g[i]) n++; });
      score.textContent = n + " of " + T.length + " done";
    }
    grade();
  }

  LX.mount("k07", function (live, data, root) { view(live, data, root); });
})();
