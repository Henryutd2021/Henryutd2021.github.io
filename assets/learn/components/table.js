/* table.js — LX.CompareTable: a comparison table whose rows can be re-sorted to reveal an order (rows slide to place).
   LX.CompareTable(host, { title: "The five plants", lede: "One sentence.",
     columns: [{key: "name", label: "Plant and who decides", main: true},          main: the name column (color dot + small note)
               {key: "size", label: "Size", num: true, phoneHide: true},
               {key: "cost", label: "Running cost", num: true, bar: {max: 100}, phone: "$/MWh"}], bar: a small bar; phone: short label on phones
     rows: [{key: "nuclear", color: "var(--lx-nuc)", name: "Nuclear plant", note: "Runs flat", size: "100 MW",
             cost: {text: "$10", unit: "/MWh", value: 10}}],
     sorts: [{label: "As built", order: ["nuclear", ...], note: "One sentence."},
             {label: "By running cost", order: [...], ranked: true, note: "<b>This order is the merit order.</b> ..."}],
     caption: "One sentence." });   the line under the title when no sort is given (rows in the given order), or when the
                                    shown sort has no note
   On phones the rows become small cards. The table is a real <table>, so it reads well without the diagram.
   text: true   for rows of words rather than numbers: on phones each row becomes a card of left-aligned lines, each with
                its column label on the left, and no rank column (long text in the number layout would overlap);
                phoneHide columns stay hidden. */
(function () {
  "use strict";
  var LX = window.LX, H = LX.H;
  LX.CompareTable = function (host, o) {
    var hd = H("header", { class: "lx-x-head" }, host);
    H("h3", { text: o.title }, hd);
    var seg = o.sorts && o.sorts.length > 1 ? H("div", { class: "lx-seg", role: "group", "aria-label": "Order of the rows" }, hd) : null;
    var cap = H("p", { class: "lx-lede", "aria-live": "polite" }, host);
    var sc = H("div", { class: "lx-tbl-scroll" }, host), tb = H("table", { class: "lx-ctable" + (o.text ? " lx-ctable-text" : "") }, sc);
    var hr = H("tr", null, H("thead", null, tb));
    H("th", { class: "rank", "aria-label": "Rank" }, hr);
    o.columns.forEach(function (c) { H("th", { scope: "col", class: (c.num ? "n " : "") + (c.phoneHide ? "ph " : ""), text: c.label }, hr); });
    var body = H("tbody", null, tb), rows = {};
    o.rows.forEach(function (r) {
      var tr = H("tr", { style: "--c:" + (r.color || "var(--lx-ink-3)") }, body);
      rows[r.key] = { tr: tr, rank: H("td", { class: "rank" }, tr) };
      o.columns.forEach(function (c) {
        var v = r[c.key];
        if (c.main) {
          var td = H("th", { scope: "row" }, tr), pn = H("div", { class: "pn" }, td); H("i", null, pn);
          var nm = H("div", null, pn); H("span", { html: LX.rich(r.name || v || "") }, nm); if (r.note) H("small", { html: LX.rich(r.note) }, nm);
          return;
        }
        var cell = H("td", { class: (c.num ? "n " : "") + (c.phoneHide ? "ph " : "") + (c.key), "data-label": c.phone || c.label }, tr);
        if (v && typeof v === "object") {
          cell.innerHTML = LX.esc(v.text) + (v.unit ? "<small>" + LX.esc(v.unit) + "</small>" : "");
          if (c.bar && v.value) H("span", { class: "mini", style: "width:" + Math.max(3, 30 * v.value / c.bar.max) + "px" + (c.bar.color ? ";--c:" + c.bar.color : "") }, cell);
        } else cell.innerHTML = LX.rich(v == null ? "" : String(v));
      });
    });
    function capHTML(t) { return LX.rich(t).replace(/&lt;b&gt;(.+?)&lt;\/b&gt;/g, "<b>$1</b>"); }
    function order(s, i) {
      var first = {}; Object.keys(rows).forEach(function (k) { first[k] = rows[k].tr.getBoundingClientRect().top; });
      s.order.forEach(function (k, j) { body.appendChild(rows[k].tr); rows[k].rank.textContent = s.ranked ? j + 1 : ""; });
      cap.innerHTML = s.note ? capHTML(s.note) : o.caption ? capHTML(o.caption) : "";
      if (seg) [].forEach.call(seg.children, function (b, j) { b.setAttribute("aria-pressed", j === i ? "true" : "false"); });
      if (!LX.reduced()) s.order.forEach(function (k) {
        var tr = rows[k].tr, d = first[k] - tr.getBoundingClientRect().top; if (!d) return;
        tr.style.transition = "none"; tr.style.transform = "translateY(" + d + "px)";
        requestAnimationFrame(function () { requestAnimationFrame(function () { tr.style.transition = ""; tr.style.transform = ""; }); });
      });
    }
    (o.sorts || []).forEach(function (s, i) {
      if (seg) H("button", { type: "button", "aria-pressed": i === 0 ? "true" : "false", text: s.label, onclick: function () { order(s, i); } }, seg);
    });
    if (o.sorts && o.sorts.length) order(o.sorts[0], 0);
    else if (o.caption) cap.innerHTML = capHTML(o.caption);
    return { el: tb, order: function (i) { order(o.sorts[i], i); } };
  };
})();
