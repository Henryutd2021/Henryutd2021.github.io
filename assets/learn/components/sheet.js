/* sheet.js — LX.Sheet: a small working spreadsheet: a formula engine and a view with a formula bar, a grid that moves with
   the arrow keys, and fill-down (promoted from toolbox K7, W1 2026-11-02; for any lesson that wants an in-page sheet).
   var sh = LX.Sheet(host, sheet, { start: "B5", fillRows: [5, 28], fillCols: "EF", prefix: { F: "$" }, wide: "F",
     headRow: 4, label: "Spreadsheet of ...; use the arrow keys to move, Enter to edit", todo: ["E33"],
     onSelect: function (name) {}, onChange: function (sheet, name, how) {} });      how: "fill" after a fill-down
   sheet: { cells: { A1: "Nuclear output, MW", E1: "100", E5: "=B5-C5-D5-$E$1", ... },   raw text; a formula starts with =
            rows: 31, cols: 6,
            labels: { 1: 1, 30: 1 },        rows whose A cell is a label spanning labelSpan columns (default cols − 2)
            lock: function (name) -> true for cells the reader may not edit (data, headers) }
   Options:
     start      the cell selected first (default A1)
     fillRows   [first, last]: "Fill down to row <last>" copies the selected formula down to that row, shifting relative
                addresses (no fill button without it);  fillCols  the columns where fill-down is offered (default all)
     prefix     { column: text } shown before numbers ("$" for money)
     wide       columns that get a wider cell (6 em; 5 em on phones);  headRow  a header row (smaller, wrapping labels)
     labelSpan  columns a label row's A cell spans (default cols − 2)
     label      the grid's accessible name;  lockMsg  function (name) -> the message when a locked cell is edited
     todo       cells to mark as the reader's to fill (highlighted)
   Returns { select(name[, focusBar]), paint(), set(name, raw), fill(), el, sheet }.
   Keyboard: one cell button is in the tab order (roving focus); arrow keys move; Enter or F2 edits in the formula bar;
   typing starts a new entry; Enter in the bar commits, Escape cancels. The grid is a real <table> with row and column
   headers, so it reads as its own text version.
   Engine (Node: module.exports; in the page LX.Sheet.engine): tokenize, parse, value(sheet, name), changed(sheet) (after
   any edit: clears the cache), shift(raw, rows, cols) (fill-down and fill-right), refsIn(raw), colName, colNum, isErr,
   show(value, prefix). Functions: SUM, AVERAGE, MIN, MAX, COUNT, ABS, ROUND. Errors: #DIV/0!, #VALUE!, #NAME?, #REF!,
   #CYCLE! (a formula that depends on itself). As in Excel, −2^2 = 4 and 2^3^2 = 64; blanks count as 0. */
(function () {
  "use strict";
  // ---------------------------------------------------------------- formula engine (pure)
  var COLS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  function colNum(s) { var n = 0; for (var i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64); return n; }
  function colName(n) { var s = ""; while (n > 0) { var m = (n - 1) % 26; s = COLS[m] + s; n = Math.floor((n - 1) / 26); } return s; }
  var REF = /(\$?)([A-Z]{1,2})(\$?)(\d+)/;
  function E(code) { return { err: code }; }
  function isErr(v) { return v && typeof v === "object" && v.err; }
  function tokenize(src) {
    var out = [], re = /\s*(\$?[A-Za-z]{1,2}\$?\d+(?::\$?[A-Za-z]{1,2}\$?\d+)?|\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+|[A-Za-z]+(?=\s*\()|[-+*\/^(),])/y, m, pos = 0;
    src = src.replace(/[−–]/g, "-");
    while (pos < src.length) {
      if (/^\s*$/.test(src.slice(pos))) break;
      re.lastIndex = pos; m = re.exec(src);
      if (!m) return null;
      out.push(m[1]); pos = re.lastIndex;
    }
    return out;
  }
  var FUN = {
    SUM: function (a) { return a.reduce(function (s, v) { return s + v; }, 0); },
    AVERAGE: function (a) { return a.length ? a.reduce(function (s, v) { return s + v; }, 0) / a.length : E("#DIV/0!"); },
    MIN: function (a) { return a.length ? Math.min.apply(null, a) : 0; },
    MAX: function (a) { return a.length ? Math.max.apply(null, a) : 0; },
    COUNT: function (a) { return a.length; },
    ABS: function (a) { return a.length === 1 ? Math.abs(a[0]) : E("#VALUE!"); },
    ROUND: function (a) { if (a.length < 1 || a.length > 2) return E("#VALUE!"); var k = Math.pow(10, a[1] || 0); return Math.round(a[0] * k) / k; }
  };
  // parse to a small tree: {n: number} | {r: "A1"} | {rg: ["A1", "B2"]} | {f: name, a: [...]} | {op, x, y} | {neg: x}
  function parse(src) {
    var t = tokenize(src); if (!t) return null;
    var i = 0;
    function peek() { return t[i]; }
    function eat(x) { if (t[i] === x) { i++; return true; } return false; }
    function expr() { var x = term(); while (peek() === "+" || peek() === "-") { var op = t[i++]; x = { op: op, x: x, y: term() }; } return x; }
    function term() { var x = power(); while (peek() === "*" || peek() === "/") { var op = t[i++]; x = { op: op, x: x, y: power() }; } return x; }
    function power() { var x = unary(); while (eat("^")) x = { op: "^", x: x, y: unary() }; return x; }   // as Excel: -2^2 = 4, 2^3^2 = 64
    function unary() { if (eat("-")) return { neg: unary() }; if (eat("+")) return unary(); return primary(); }
    function primary() {
      var tk = t[i++]; if (tk === undefined) throw new Error("end");
      if (tk === "(") { var x = expr(); if (!eat(")")) throw new Error(")"); return x; }
      if (/^[\d.]/.test(tk)) return { n: parseFloat(tk) };
      if (/^\$?[A-Za-z]{1,2}\$?\d+:/.test(tk)) { var p = tk.toUpperCase().split(":"); return { rg: p }; }
      if (/^\$?[A-Za-z]{1,2}\$?\d+$/.test(tk)) return { r: tk.toUpperCase() };
      if (/^[A-Za-z]+$/.test(tk)) {
        var name = tk.toUpperCase(); if (!eat("(")) throw new Error("(");
        var args = []; if (!eat(")")) { do { args.push(expr()); } while (eat(",")); if (!eat(")")) throw new Error(")"); }
        return { f: name, a: args };
      }
      throw new Error("token " + tk);
    }
    try { var tree = expr(); return i === t.length ? tree : null; } catch (e) { return null; }
  }
  function plain(ref) { var m = REF.exec(ref); return m ? m[2] + m[4] : null; }
  function rangeCells(a, b) {
    var p = REF.exec(a), q = REF.exec(b); if (!p || !q) return null;
    var c0 = colNum(p[2]), c1 = colNum(q[2]), r0 = +p[4], r1 = +q[4], out = [];
    for (var r = Math.min(r0, r1); r <= Math.max(r0, r1); r++) for (var c = Math.min(c0, c1); c <= Math.max(c0, c1); c++) out.push(colName(c) + r);
    return out;
  }
  // a sheet: {cells: {A1: raw text}, rows, cols}; value(sheet, "E5") evaluates with memo and a cycle guard
  function value(sheet, name, memo, stack) {
    memo = memo || sheet._memo || (sheet._memo = {}); stack = stack || {};
    if (name in memo) return memo[name];
    var m = /^([A-Z]{1,2})(\d+)$/.exec(name);
    if (!m || colNum(m[1]) > sheet.cols || +m[2] > sheet.rows || +m[2] < 1) return E("#REF!");
    var raw = sheet.cells[name];
    if (raw == null || raw === "") return (memo[name] = "");
    raw = String(raw);
    if (raw.charAt(0) !== "=") { var num = Number(raw.replace(/,/g, "")); return (memo[name] = raw.trim() !== "" && isFinite(num) ? num : raw); }
    if (stack[name]) return E("#CYCLE!");
    stack[name] = true;
    var tree = parse(raw.slice(1)), v = tree ? ev(tree) : E("#NAME?");
    delete stack[name];
    return (memo[name] = v);
    function cell(ref) { var p = plain(ref); return p ? value(sheet, p, memo, stack) : E("#REF!"); }
    function numOf(v) { if (isErr(v)) return v; if (v === "") return 0; if (typeof v === "number") return v; return E("#VALUE!"); }
    function ev(n) {
      if ("n" in n) return n.n;
      if (n.r) return numOf(cell(n.r));
      if (n.rg) return E("#VALUE!");
      if (n.neg) { var a = ev(n.neg); return isErr(a) ? a : -a; }
      if (n.f) {
        if (!FUN[n.f]) return E("#NAME?");
        var vals = [];
        for (var k = 0; k < n.a.length; k++) {
          var arg = n.a[k];
          if (arg.rg) {
            var cs = rangeCells(arg.rg[0], arg.rg[1]); if (!cs) return E("#REF!");
            for (var j = 0; j < cs.length; j++) { var cv = value(sheet, cs[j], memo, stack); if (isErr(cv)) return cv; if (typeof cv === "number") vals.push(cv); }
          } else { var av = ev(arg); if (isErr(av)) return av; vals.push(av); }
        }
        return FUN[n.f](vals);
      }
      var x = ev(n.x); if (isErr(x)) return x; var y = ev(n.y); if (isErr(y)) return y;
      if (n.op === "+") return x + y; if (n.op === "-") return x - y; if (n.op === "*") return x * y;
      if (n.op === "/") return y === 0 ? E("#DIV/0!") : x / y;
      if (n.op === "^") return Math.pow(x, y);
      return E("#VALUE!");
    }
  }
  function changed(sheet) { sheet._memo = {}; }
  // fill-down (and fill-right): shift every reference without a $ on that axis
  function shift(raw, dr, dc) {
    if (!raw || String(raw).charAt(0) !== "=") return raw;
    return String(raw).replace(/(\$?)([A-Za-z]{1,2})(\$?)(\d+)(?![A-Za-z(])/g, function (all, c$, c, r$, r, off, s) {
      var before = s.charAt(off - 1); if (/[A-Za-z]/.test(before)) return all;   // part of a function name
      var col = c$ ? c.toUpperCase() : colName(colNum(c.toUpperCase()) + (dc || 0)), row = r$ ? +r : +r + dr;
      return row < 1 || colNum(col) < 1 ? "#REF!" : c$ + col + r$ + row;
    });
  }
  function refsIn(raw) { var t = tokenize(String(raw || "").replace(/^=/, "")) || []; var out = []; t.forEach(function (x) { if (/^\$?[A-Za-z]{1,2}\$?\d+/.test(x)) x.split(":").forEach(function (y) { out.push(y.toUpperCase()); }); }); return out; }
  // a value as the grid shows it: errors by code, whole numbers without decimals, others to two decimals
  function show(v, prefix) {
    if (isErr(v)) return v.err;
    if (v === "" || typeof v === "string") return v;
    var r = Math.abs(v - Math.round(v)) < 1e-9 ? Math.round(v) : Math.round(v * 100) / 100;
    return (prefix || "") + r.toLocaleString("en-US");
  }
  var engine = { tokenize: tokenize, parse: parse, value: value, changed: changed, shift: shift, refsIn: refsIn, colName: colName, colNum: colNum, isErr: isErr, show: show };
  if (typeof module !== "undefined" && module.exports) module.exports = engine;
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H;
  LX.Sheet = function (host, sheet, o) {
    o = o || {};
    var pre = o.prefix || {}, wide = o.wide || "", span = o.labelSpan || Math.max(1, sheet.cols - 2), fr = o.fillRows, todo = {};
    (o.todo || []).forEach(function (n) { todo[n] = true; });
    var wrap = H("div", { class: "lx-sheet" }, host);
    var bar = H("div", { class: "lx-sheet-bar" }, wrap);
    var nameBox = H("span", { class: "lx-sheet-name", "aria-live": "polite" }, bar);
    var fid = LX.uid("fx"); H("label", { for: fid, class: "lx-sr", text: "Formula or value of the selected cell" }, bar);
    var fx = H("input", { id: fid, type: "text", class: "lx-sheet-fx", autocomplete: "off", spellcheck: "false", autocapitalize: "off" }, bar);
    var enter = H("button", { type: "button", class: "lx-btn small", text: "Enter" }, bar);
    var tools = H("div", { class: "lx-sheet-tools" }, wrap);
    var fill = fr ? H("button", { type: "button", class: "lx-btn ghost small", text: "Fill down to row " + fr[1] }, tools) : null;
    var msg = H("span", { class: "lx-sheet-msg", "aria-live": "polite" }, tools);
    var scroll = H("div", { class: "lx-sheet-scroll", tabindex: "-1" }, wrap);
    var tb = H("table", { class: "lx-sheet-grid", "aria-label": o.label || "Spreadsheet; use the arrow keys to move, Enter to edit" }, scroll);
    var hr = H("tr", null, H("thead", null, tb)); H("th", { class: "lx-sheet-corner" }, hr);
    for (var c = 1; c <= sheet.cols; c++) H("th", { scope: "col", text: colName(c) }, hr);
    var body = H("tbody", null, tb), btn = {}, sel = o.start || "A1", labels = sheet.labels || {};
    for (var r = 1; r <= sheet.rows; r++) {
      var tr = H("tr", null, body); H("th", { scope: "row", text: String(r) }, tr);
      for (var cc = 1; cc <= sheet.cols; cc++) {
        var nm = colName(cc) + r, cn = colName(cc), isLab = labels[r] && cc === 1;
        if (labels[r] && cc > 1 && cc <= span) continue;
        var td = H("td", { colspan: isLab && span > 1 ? span : null, class: "c" + cn + (cc === 1 ? " first" : "") + (wide.indexOf(cn) >= 0 ? " w" : "") + (isLab ? " lab" : "") + (r === o.headRow ? " head" : "") }, tr);
        var b = H("button", { type: "button", tabindex: "-1", "data-cell": nm }, td);
        b.addEventListener("click", (function (n) { return function () { select(n, true); }; })(nm));
        btn[nm] = b;
      }
    }
    function col(n) { return n.replace(/\d+/, ""); }
    function paint() {
      Object.keys(btn).forEach(function (n) {
        var v = value(sheet, n), raw = sheet.cells[n], b = btn[n], txt = show(v, pre[col(n)]), isF = !!raw && String(raw).charAt(0) === "=";
        b.textContent = txt; b.classList.toggle("f", isF);
        b.classList.toggle("err", !!isErr(v)); b.classList.toggle("sel", n === sel); b.classList.toggle("todo", !!todo[n]);
        b.setAttribute("aria-label", n + ": " + (txt || "empty") + (isF ? ", formula " + raw : ""));
      });
      // a typed formula (Enter, or set()) can make the selected cell fillable: refresh the button with the grid
      if (fill) fill.disabled = !canFill(sel);
    }
    function canFill(n) {
      if (!fr) return false;
      var row = +n.replace(/[A-Z]+/, ""), cl = col(n);
      return row >= fr[0] && row < fr[1] && (!o.fillCols || o.fillCols.indexOf(cl) >= 0) && !!sheet.cells[n] && String(sheet.cells[n]).charAt(0) === "=";
    }
    function select(n, focusBar) {
      if (!btn[n]) return; sel = n; nameBox.textContent = n; fx.value = sheet.cells[n] || "";
      Object.keys(btn).forEach(function (k) { btn[k].tabIndex = k === n ? 0 : -1; btn[k].classList.toggle("sel", k === n); });
      if (fill) fill.disabled = !canFill(n);
      var b = btn[n], top = b.closest("tr").offsetTop, h = scroll.clientHeight;
      if (top < scroll.scrollTop + 30 || top > scroll.scrollTop + h - 40) scroll.scrollTop = Math.max(0, top - h / 2);
      var td = b.parentNode, left = td.offsetLeft, w = scroll.clientWidth;
      if (left < scroll.scrollLeft + 40 || left + td.offsetWidth > scroll.scrollLeft + w) scroll.scrollLeft = Math.max(0, left + td.offsetWidth - w + 8);
      if (focusBar) fx.focus();
      if (o.onSelect) o.onSelect(n);
    }
    function commit() {
      var n = sel, v = fx.value.trim();
      if (sheet.lock && sheet.lock(n)) { msg.textContent = o.lockMsg ? o.lockMsg(n) : n + " holds data; edit the yellow cells."; return; }
      sheet.cells[n] = v; changed(sheet); paint(); msg.textContent = isErr(value(sheet, n)) ? value(sheet, n).err + ": check the formula's spelling and addresses." : "";
      if (o.onChange) o.onChange(sheet, n);
    }
    enter.addEventListener("click", commit);
    fx.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); commit(); btn[sel].focus(); } if (e.key === "Escape") { fx.value = sheet.cells[sel] || ""; btn[sel].focus(); } });
    function fillDown() {
      if (!canFill(sel)) return;
      var cl = col(sel), r0 = +sel.replace(/[A-Z]+/, ""), src = sheet.cells[sel];
      for (var r = r0 + 1; r <= fr[1]; r++) sheet.cells[cl + r] = shift(src, r - r0, 0);
      changed(sheet); paint(); msg.textContent = "Copied " + sel + " to " + cl + (r0 + 1) + ":" + cl + fr[1] + ".";
      if (o.onChange) o.onChange(sheet, sel, "fill");
    }
    if (fill) fill.addEventListener("click", fillDown);
    tb.addEventListener("keydown", function (e) {
      var m = /^([A-Z]+)(\d+)$/.exec(sel), c = colNum(m[1]), r = +m[2], k = e.key;
      var mv = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[k];
      if (mv) { e.preventDefault(); var nr = LX.clamp(r + mv[1], 1, sheet.rows), nc = LX.clamp(c + mv[0], 1, sheet.cols), n = colName(nc) + nr;
        while (!btn[n] && nc > 1) { nc--; n = colName(nc) + nr; } select(n); btn[n].focus(); return; }
      if (k === "Enter" || k === "F2") { e.preventDefault(); fx.focus(); fx.select(); return; }
      if (k.length === 1 && !e.ctrlKey && !e.metaKey) { fx.value = ""; fx.focus(); }
    });
    paint(); select(sel);
    return { select: select, paint: paint, el: wrap, sheet: sheet, fill: fillDown,
      set: function (n, v) { sheet.cells[n] = v; changed(sheet); paint(); if (o.onChange) o.onChange(sheet, n); } };
  };
  LX.Sheet.engine = engine;
})();
