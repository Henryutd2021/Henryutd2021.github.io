/* boundary.js — LX.Boundary: where a model's answer holds, as two lists ("It holds when" / "It leaves out") under a title,
   with a source line (the curriculum's e-boundary; lesson 13).
   LX.Boundary(host, {                  host: usually an explain card, H("div", { class: "lx-xcard" }, x)
     title: "Where this answer holds",
     lede: "One or two sentences.",      optional
     holds: ["the weather of 2025 is a fair guide: ...;", ...],   the first list
     leaves: ["start-up costs ...;", ...],                        the second list
     holdsTitle: "It holds when", leavesTitle: "It leaves out",   (defaults)
     cols: [{ title, items: [...] }],    instead of holds and leaves: any columns (two read best)
     source: "Data: EIA-930 hourly data for 2025; ..." });        the source line under the lists (optional)
   Text may carry [[glossary|marks]]. Returns { el } (the column grid).
   Plain text in a real header and lists, so it needs no text version and no keyboard handling; one column on phones
   (≤ 560 px). */
(function () {
  "use strict";
  var LX = window.LX, H = LX.H;
  LX.Boundary = function (host, o) {
    var hd = H("header", { class: "lx-x-head" }, host); H("h3", { text: o.title }, hd);
    if (o.lede) H("p", { class: "lx-lede", html: LX.rich(o.lede) }, host);
    var cols = o.cols || [{ title: o.holdsTitle || "It holds when", items: o.holds || [] }, { title: o.leavesTitle || "It leaves out", items: o.leaves || [] }];
    var g = H("div", { class: "lx-bound" }, host);
    cols.forEach(function (c) {
      var d = H("div", null, g); H("h4", { text: c.title }, d);
      var ul = H("ul", null, d); c.items.forEach(function (t) { H("li", { html: LX.rich(t) }, ul); });
    });
    if (o.source) H("p", { class: "lx-bound-src", html: LX.rich(o.source) }, host);
    return { el: g };
  };
})();
