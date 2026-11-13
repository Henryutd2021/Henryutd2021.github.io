/* ledger.js — LX.Ledger: a "who pays, who earns" table (A4's tariff ledger, A7's earnings and trade ledgers and A14's
   microgrid ledger). One row per customer, party, device or line, a
   column per amount; the row header can carry a small second line (what the row stands for); numbers in tabular
   figures; an optional total row. It is the course's two-sided table (table.cf-two, forms.css), so on a phone each row
   becomes a card whose cells are labelled by their column (data-l).
   var tb = LX.Ledger(host, {
     caption: "Bill minus the cost of serving each customer, a month.",   optional (a hint-styled caption)
     columns: ["Customer", "Flat", "Time-of-use"],   the row-header column first, then one label per cell (also each cell's
                                                     data-l, its label on a phone)
     rows: [{ head: "Renter", sub: "cost $61.20", cells: ["+$4.10 above", { text: "−$2.00 below", cls: "down" }] },
            { head: "= Net", cells: ["", "+$2.10"], total: true }],   a cell is text or { text, cls, l } (l: its own phone label)
     cls: "a4-led" });                               extra classes on the table
   Returns the table; it sits in a div.lx-scroll-x appended to host. Every text is escaped (never HTML) and may carry
   glossary marks ([[id|words]], LX.rich); a cell's phone label (data-l) shows a mark's words plain. */
(function () {
  "use strict";
  if (typeof window === "undefined" || !window.LX) return;
  var LX = window.LX, H = LX.H;
  var MARK = /\[\[(?:lesson:)?[a-z0-9-]+\|[^\]]+\]\]/;
  function plain(t) { return String(t).replace(/\[\[(?:lesson:)?[a-z0-9-]+\|([^\]]+)\]\]/g, "$1"); }
  // a text as the element's content: plain text, or through LX.rich when it carries a glossary mark
  function put(a, t) { t = t == null ? "" : String(t); if (MARK.test(t)) a.html = LX.rich(t); else a.text = t; return a; }
  LX.Ledger = function (host, o) {
    o = o || {};
    var cols = o.columns || [];
    var tb = H("table", { class: "cf-two lx-ledger" + (o.cls ? " " + o.cls : "") }, H("div", { class: "lx-scroll-x" }, host));
    if (o.caption) H("caption", put({ class: "lx-hint" }, o.caption), tb);
    if (cols.length) { var hr = H("tr", null, H("thead", null, tb)); cols.forEach(function (c) { H("th", put({ scope: "col" }, c), hr); }); }
    var bd = H("tbody", null, tb);
    (o.rows || []).forEach(function (r) {
      var tr = H("tr", r.total ? { class: "tot" } : null, bd), th = H("th", put({ scope: "row" }, r.head), tr);
      if (r.sub) H("small", put({}, r.sub), th);
      (r.cells || []).forEach(function (c, i) {
        var x = c !== null && typeof c === "object" ? c : { text: c }, a = put({}, x.text);
        var l = x.l != null ? x.l : cols[i + 1];
        if (l) a["data-l"] = plain(l);
        if (x.cls != null) a["class"] = x.cls;
        H("td", a, tr);
      });
    });
    return tb;
  };
})();
