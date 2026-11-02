/* missions.js — game feedback: mission bars, one-to-three stars, and collectible concept notes.
   const m = LX.Missions(host, [{id: "lights", label: "Keep every light on until midnight", short: "Lights on", main: true}, ...]);
   m.set("lights", {frac: 0.5, text: "12/24 h lit", fail: false})          (short labels replace long ones on phones)
   LX.Stars(host, [{label: "Cost", n: 3, value: "$104,400"}, ...])         stars pop in; each box has a spoken "n of 3 stars"
   LX.Notes(host, [{icon: "scale", title: "Balance", text: "One sentence.", moment: "Your shift: ...",
                    got: true, lock: "How to collect it.", link: {href: "#explain", text: "On the concept map", onClick: fn}}])
   Collected notes flip face up (no flip under reduced motion); locked ones say how to collect them. */
(function () {
  "use strict";
  var LX = window.LX, H = LX.H;
  LX.Missions = function (host, defs) {
    var row = H("div", { class: "lx-missions", role: "list", "aria-label": "Missions" }, host), by = {};
    defs.forEach(function (d) {
      var m = H("div", { class: "lx-mission" + (d.main ? " main" : ""), role: "listitem" }, row);
      var b = H("b", null, m); H("span", { class: "l", text: d.label }, b); H("span", { class: "s", text: d.short || d.label }, b);
      var sm = H("small", null, m), bar = H("div", { class: "bar", "aria-hidden": "true" }, m), fill = H("i", null, bar);
      by[d.id] = { m: m, sm: sm, fill: fill };
    });
    return {
      el: row,
      set: function (id, s) {
        var x = by[id]; if (!x) return;
        x.fill.style.width = (LX.clamp(s.frac || 0, 0, 1) * 100) + "%";
        x.m.classList.toggle("fail", !!s.fail); x.m.classList.toggle("won", !!s.won);
        x.sm.textContent = s.text || "";
      }
    };
  };
  LX.Stars = function (host, items) {
    var row = H("div", { class: "lx-starrow" }, host);
    items.forEach(function (c, ci) {
      var b = H("div", { class: "lx-starbox" }, row); H("span", { text: c.label }, b);
      var ss = H("div", { class: "lx-stars", role: "img", "aria-label": c.label + ": " + c.n + " of 3 stars" }, b);
      for (var k = 0; k < 3; k++) H("span", { class: k < c.n ? "on" : "off", style: "--d:" + (ci * 0.25 + k * 0.12) + "s", html: LX.STAR }, ss);
      H("b", { text: c.value }, b);
    });
    return row;
  };
  LX.Notes = function (host, notes) {
    var grid = H("div", { class: "lx-notes" }, host), order = 0;
    notes.forEach(function (x) {
      var c = H("div", { class: "lx-note" + (x.got ? " got" : "") }, grid);
      var inn = H("div", { class: "lx-note-in", style: "--d:" + (x.got ? (order++ * 0.18) : 0) + "s" }, c);
      var f = H("div", { class: "lx-note-f", "aria-hidden": x.got ? "true" : null }, inn);
      f.innerHTML = LX.icon(x.got ? "star" : "lock") + "<span>" + LX.esc(x.got ? "Collected" : x.lock || "Not collected yet") + "</span>";
      if (!x.got) return;
      var b = H("div", { class: "lx-note-b" }, inn);
      H("div", { class: "ic", html: LX.icon(x.icon || "star") }, b);
      H("h4", { text: x.title }, b); H("p", { html: LX.rich(x.text) }, b);
      if (x.moment) H("p", { class: "moment", text: x.moment }, b);
      if (x.link) { var a = H("a", { href: x.link.href, text: x.link.text }, b); if (x.link.onClick) a.addEventListener("click", x.link.onClick); }
      if (LX.reduced()) c.classList.add("flip"); else setTimeout(function () { c.classList.add("flip"); }, 250);
    });
    return grid;
  };
})();
