/* metro.js — LX.Metro: the course map as a transit map, drawn from assets/learn/data/path.json (built from learn/path.yml).
   LX.Metro(host, path)            entry doors (one per tier), a progress bar, the map, a legend and a preview card per stop
   LX.metroLayout(path, "h"|"v")   pure layout (also used by the Node tests): one line per tier, any number of tiers;
                                   the starter path runs across the lines; a lesson with tier2 bridges two lines.
   Tier fields used: id, title, slot (colour --lx-tier-<slot>), icon, door, goal, status ("upcoming": a dashed door and line,
   "coming later"). Lesson fields: starter, short, title, tier, tier2, minutes, href, ready, icon, does. "more" adds
   "+N more" to each line (a line without starter stops says how many of its lessons are open: "7 Researcher lessons
   open, 3 in preparation"); that label opens the tier's card, which links the open lessons off the starter path (code,
   title, href, ready). Progress ticks come from this browser only.
   Wide (≥ 720 px): lines run left to right, first tier at the bottom. Phones: lines run top to bottom, names on the right. */
(function () {
  "use strict";
  var LX = window.LX;
  function slot(t, i) { return "var(--lx-tier-" + (t.slot || i + 1) + ")"; }
  function wrapWords(t, max) { var w = String(t).split(" "), lines = [], cur = ""; w.forEach(function (x) { if ((cur + " " + x).trim().length > max && cur) { lines.push(cur); cur = x; } else cur = (cur + " " + x).trim(); }); if (cur) lines.push(cur); return lines; }

  LX.metroLayout = function (path, mode) {
    var tiers = path.tiers, nT = tiers.length, st = path.starter, n = st.length, ti = {}, more = {};
    var live = {};
    tiers.forEach(function (t, k) { ti[t.id] = k; more[t.id] = 0; live[t.id] = 0; });
    (path.more || []).forEach(function (m) { if (more[m.tier] != null) { more[m.tier]++; if (m.ready) live[m.tier]++; } });
    var L = { mode: mode, tiers: [], stations: [], segs: [], ext: [], caps: [] };
    // the line each stop sits on: a bridge lesson stays on the previous stop's line when that is one of its two tiers
    var row = [];
    st.forEach(function (l, i) {
      var r = ti[l.tier];
      if (l.tier2 != null && ti[l.tier2] != null && i > 0 && row[i - 1] === ti[l.tier2]) r = ti[l.tier2];
      row.push(r);
    });
    if (mode === "h") {
      var gap = 100, top = 78, dx = n > 1 ? Math.min(72, 900 / (n - 1)) : 72, x0 = 70;
      L.W = 1200; L.H = top + (nT - 1) * gap + 100;
      var ty = function (k) { return top + (nT - 1 - k) * gap; };
      tiers.forEach(function (t, k) { L.tiers.push({ id: t.id, title: t.title, color: slot(t, k), y: ty(k), labelX: 14, labelY: ty(k) - 24 }); });
      st.forEach(function (l, i) {
        var y = ty(row[i]), topRow = row[i] === nT - 1;
        L.stations.push({ i: i, lesson: l, x: x0 + i * dx, y: y, row: row[i], color: slot(tiers[ti[l.tier]], ti[l.tier]), labelAbove: topRow, lines: wrapWords(l.short, 10) });
      });
      tiers.forEach(function (t, k) {
        var mine = L.stations.filter(function (s) { return s.row === k; }), last = mine.length ? mine[mine.length - 1].x + 24 : x0 - 20;
        var later = t.status === "upcoming" ? ", coming later" : "";
        L.ext.push({ tier: t.id, k: k, color: slot(t, k), x0: last, y0: ty(k), x1: L.W - 20, y1: ty(k), more: more[t.id], none: !mine.length, upcoming: !!later,
          label: mine.length ? "+" + more[t.id] + " more " + t.title + " lessons"
            : live[t.id] ? live[t.id] + " " + t.title + " lessons open" + (more[t.id] > live[t.id] ? ", " + (more[t.id] - live[t.id]) + " in preparation" : "")
            : (more[t.id] ? more[t.id] + " " + t.title + " lessons" + (later || " in preparation") : t.title + ": in preparation"),
          lx: L.W - 20, ly: ty(k) + 22, anchor: "end" });
      });
    } else {
      var cw = nT > 3 ? 36 : 44, x00 = nT > 3 ? 28 : 34, rowH = 66, top2 = 50;
      L.W = 360; L.H = top2 + n * rowH + 60;
      var tx = function (k) { return x00 + k * cw; };
      tiers.forEach(function (t, k) { L.tiers.push({ id: t.id, title: t.title, color: slot(t, k), x: tx(k), labelX: tx(k), labelY: 22, short: t.title.charAt(0) }); });
      var textX = x00 + nT * cw + 2;
      st.forEach(function (l, i) {
        L.stations.push({ i: i, lesson: l, x: tx(row[i]), y: top2 + 14 + i * rowH, row: row[i], color: slot(tiers[ti[l.tier]], ti[l.tier]), textX: textX });
      });
      tiers.forEach(function (t, k) {
        var mine = L.stations.filter(function (s) { return s.row === k; }), last = mine.length ? mine[mine.length - 1].y + 26 : top2;
        L.ext.push({ tier: t.id, k: k, color: slot(t, k), x0: tx(k), y0: last, x1: tx(k), y1: L.H - 30, more: more[t.id], none: !mine.length,
          upcoming: t.status === "upcoming", label: "+" + more[t.id], lx: tx(k), ly: L.H - 10, anchor: "middle" });
      });
    }
    // route segments between consecutive stops, coloured by the stop they lead to
    for (var i = 0; i + 1 < L.stations.length; i++) {
      var a = L.stations[i], b = L.stations[i + 1];
      L.segs.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, color: b.color, tier: b.lesson.tier });
    }
    // bridge capsules: a stop whose tier2 line is not the one it sits on
    L.stations.forEach(function (s) {
      var l = s.lesson; if (l.tier2 == null || ti[l.tier2] == null) return;
      var other = s.row === ti[l.tier] ? ti[l.tier2] : ti[l.tier];
      var t = tiers[other];
      if (mode === "h") { var y2 = L.tiers[other].y; L.caps.push({ i: s.i, x: s.x - 21, y: Math.min(s.y, y2) - 21, w: 42, h: Math.abs(s.y - y2) + 42, tx: s.x, ty: y2 + 4, text: "to " + t.title.charAt(0), dashed: other > s.row ? false : true }); }
      else { var x2 = L.tiers[other].x; L.caps.push({ i: s.i, x: Math.min(s.x, x2) - 19, y: s.y - 19, w: Math.abs(s.x - x2) + 38, h: 38, tx: x2, ty: s.y + 4, text: t.title.charAt(0), dashed: other < s.row }); }
    });
    return L;
  };
  if (typeof module !== "undefined" && module.exports) module.exports = { metroLayout: LX.metroLayout };
  if (typeof document === "undefined") return;

  var H = LX.H, S = LX.S, clamp = LX.clamp;
  LX.Metro = function (host, path) {
    var tiers = path.tiers, st = path.starter, M = { tier: null, sel: null };
    var tIdx = {}; tiers.forEach(function (t, k) { tIdx[t.id] = k; });
    var doors = H("div", { class: "lx-doors", role: "group", "aria-label": "Where do you start?", style: "--n:" + tiers.length }, host);
    var bar = H("div", { class: "lx-mapbar" }, host);
    var prog = H("div", { class: "lx-progress" }, bar), pt = H("span", null, prog), pf = H("i", null, H("span", { class: "pbar", "aria-hidden": "true" }, prog));
    H("span", { class: "lx-hint", text: (path.minutes ? "About " + Math.round(path.minutes / 30) / 2 + " hours in all" : "") }, bar);
    var wrap = H("div", { class: "lx-mapwrap" }, host), svgHost = H("div", null, wrap);
    var lg = H("div", { class: "lx-mlegend" }, host);
    tiers.forEach(function (t, k) { var s = H("span", null, lg); H("i", { style: "--c:" + slot(t, k) }, s); H("span", { text: t.title }, s); });
    [["o fill", "Open now"], ["o done", "Done"], ["o dash", "Coming soon"]].forEach(function (x) { var s = H("span", null, lg); H("i", { class: x[0] }, s); H("span", { text: x[1] }, s); });
    tiers.forEach(function (t, k) {
      var soon = t.status === "upcoming";
      var d = H("button", { class: "lx-door" + (soon ? " soon" : ""), type: "button", "aria-pressed": "false", style: "--c:" + slot(t, k) }, doors);
      H("span", { class: "ic", html: LX.icon(t.icon || "bulb") }, d);
      H("b", { text: t.door || t.title }, d); H("small", { text: t.title + (soon ? " · later" : "") }, d); H("span", { class: "knob", "aria-hidden": "true" }, d);
      d.addEventListener("click", function () {
        var on = M.tier !== t.id; M.tier = on ? t.id : null;
        [].forEach.call(doors.children, function (c) { c.setAttribute("aria-pressed", c === d && on ? "true" : "false"); });
        close(); render();
        if (on) { var first = st.filter(function (l) { return l.tier === t.id; })[0]; if (first) open(first.starter, true); else openTier(k); }
      });
    });
    function state(l) { return LX.progress.isDone(l.id) ? "done" : l.ready ? "open" : "up"; }
    var card = null, lastFocus = null, svg = null, Lc = null;
    function close(refocus) { if (card) card.remove(); card = null; M.sel = null; if (svg) svg.querySelectorAll(".stn.sel").forEach(function (s) { s.classList.remove("sel"); }); if (refocus && lastFocus) lastFocus.focus({ preventScroll: true }); }
    function place(px, side) {
      var W = wrap.clientWidth, Hh = wrap.clientHeight, cw = card.offsetWidth, chh = card.offsetHeight;
      var left = clamp(px[0] - cw / 2, 8, W - cw - 8), top = px[1] + 30;
      if (side) { left = clamp(px[0] + 26, 8, W - cw - 8); top = clamp(px[1] - 30, 8, Hh - chh - 8); }
      else if (top + chh > Hh - 8) top = Math.max(8, px[1] - chh - 30);
      card.style.left = left + "px"; card.style.top = top + "px";
    }
    function vb(x, y) { var v = svg.viewBox.baseVal, r = svg.getBoundingClientRect(), wr = wrap.getBoundingClientRect(); return [r.left - wr.left + x / v.width * r.width, r.top - wr.top + y / v.height * r.height]; }
    function frame(tierIdx) {
      if (card) card.remove();
      card = H("div", { class: "lx-preview", role: "dialog", "aria-label": "Lesson details", style: "--c:" + slot(tiers[tierIdx], tierIdx) }, wrap);
      H("button", { class: "x", type: "button", "aria-label": "Close", text: "×", onclick: function () { close(true); } }, card);
      card.addEventListener("keydown", function (e) { if (e.key === "Escape") close(true); });
      return card;
    }
    function open(n, fromDoor) {
      var l = st[n], k = tIdx[l.tier], s = state(l), T = tiers[k];
      if (!fromDoor) lastFocus = document.activeElement;
      M.sel = n; render();
      var c = frame(k), ph = H("div", { class: "ph" }, c);
      H("div", { class: "ic", html: LX.icon(l.icon || "map") }, ph);
      var tt = H("div", null, ph);
      H("div", { class: "k", text: "Lesson " + n + " · " + T.title + (l.tier2 && tIdx[l.tier2] != null ? " to " + tiers[tIdx[l.tier2]].title : "") + " · " + l.minutes + " min" }, tt);
      H("h3", { text: l.title }, tt);
      if (l.does) H("p", { text: l.does }, c);
      var pf2 = H("div", { class: "pf" }, c);
      if (s === "open") { H("a", { class: "lx-btn small", href: l.href, html: "Start" + LX.icon("arrow") }, pf2); H("span", { class: "lx-hint", text: l.after && l.after.length ? "Builds on lesson " + l.after.map(function (a) { return a.starter; }).join(" and ") : "No prerequisites" }, pf2); }
      else if (s === "done") { H("span", { class: "lx-pill good", html: LX.icon("check") + "Done" }, pf2); H("a", { href: l.href, text: "Play again" }, pf2); }
      else { H("span", { class: "lx-pill neutral", html: LX.icon("lock") + "Coming soon" }, pf2); }
      var p = Lc.stations[n]; place(vb(p.x, p.y), Lc.mode === "v");
      var f = c.querySelector("a, button.x"); if (f && !fromDoor) f.focus({ preventScroll: true });
    }
    function openTier(k, fromKey) {
      if (fromKey) lastFocus = document.activeElement;
      var T = tiers[k], c = frame(k), ph = H("div", { class: "ph" }, c);
      H("div", { class: "ic", html: LX.icon(T.icon || "map") }, ph);
      var tt = H("div", null, ph); H("div", { class: "k", text: T.title + (T.level ? " · " + T.level : "") + (T.status === "upcoming" ? " · coming later" : "") }, tt); H("h3", { text: T.door || T.title }, tt);
      if (T.goal) H("p", { text: T.goal }, c);
      var mine = (path.more || []).filter(function (m) { return m.tier === T.id; });
      var openL = mine.filter(function (m) { return m.ready; }), cnt = mine.length - openL.length;
      if (openL.length) {
        var ul = H("ul", { class: "lx-preview-list" }, c);
        openL.forEach(function (m) { var li = H("li", null, ul); if (m.code) H("span", { class: "lx-code", text: m.code }, li); H("a", { href: m.href, text: m.title }, li); });
      }
      H("div", { class: "pf", html: '<span class="lx-pill neutral">' + LX.icon("lock") + (cnt ? cnt + (openL.length ? " more" : "") + " lessons in preparation" : (openL.length ? "More lessons in preparation" : "In preparation")) + "</span>" }, c);
      var e = Lc.ext[k]; place(vb(Lc.mode === "h" ? (e.x0 + e.x1) / 2 : e.x0, Lc.mode === "h" ? e.y0 : Math.min((e.y0 + e.y1) / 2, e.y0 + 40)), Lc.mode === "v");
      if (c.scrollIntoView) c.scrollIntoView({ block: "nearest", behavior: LX.reduced() ? "auto" : "smooth" });
      if (fromKey) { var f = c.querySelector("a, button.x"); if (f) f.focus({ preventScroll: true }); }
    }
    function render() {
      var mode = wrap.clientWidth >= 720 ? "h" : "v", L = Lc = LX.metroLayout(path, mode);
      var done = st.filter(function (l) { return state(l) === "done"; }).length;
      pt.textContent = done + " of " + st.length + " done"; pf.style.width = (done / Math.max(1, st.length) * 100) + "%";
      svgHost.innerHTML = "";
      svg = S("svg", { viewBox: "0 0 " + L.W + " " + L.H, role: "group", "aria-label": "Course map: the " + st.length + "-lesson starter path across " + tiers.length + " tier lines" }, svgHost);
      var dim = function (tid) { return M.tier && tid !== M.tier; };
      L.tiers.forEach(function (t) { S("text", { x: t.labelX, y: t.labelY, class: "mtier", fill: t.color, "text-anchor": mode === "v" ? "middle" : "start" }, svg).textContent = mode === "v" ? t.short : t.title; });
      L.ext.forEach(function (e) {
        var g = S("g", { class: "mext" + (dim(e.tier) ? " seg-dim" : ""), tabindex: 0, role: "button",
          "aria-label": tiers[e.k].title + " tier: " + (mode === "v" ? e.more + " more lessons" : e.label) + ". Open the tier card" }, svg);
        S("path", { d: "M" + e.x0 + " " + e.y0 + " L" + e.x1 + " " + e.y1, stroke: "transparent", "stroke-width": 26, "stroke-linecap": "round" }, g);
        S("path", { d: "M" + e.x0 + " " + e.y0 + " L" + e.x1 + " " + e.y1, stroke: e.color, "stroke-width": 6, "stroke-linecap": "round", opacity: .28, "stroke-dasharray": e.upcoming ? "1 16" : "1 10" }, g);
        S("text", { x: e.lx, y: e.ly, "text-anchor": e.anchor, class: mode === "v" ? "mlabel sub" : "mtext" }, g).textContent = e.label;
        g.addEventListener("click", function () { openTier(e.k, true); });
        g.addEventListener("keydown", function (ev) { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); openTier(e.k, true); } });
      });
      if (mode === "v") S("text", { x: L.stations.length ? L.stations[0].textX : 180, y: L.H - 10, class: "mtext" }, svg).textContent = "more lessons on each line";
      var rg = S("g", { fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round" }, svg);
      L.segs.forEach(function (s) {
        var d = "M" + s.x1 + " " + s.y1 + " L" + s.x2 + " " + s.y2;
        S("path", { d: d, stroke: "var(--lx-surface)", "stroke-width": 12 }, rg);
        S("path", { d: d, stroke: s.color, "stroke-width": 7, opacity: dim(s.tier) ? .25 : 1 }, rg);
      });
      if (L.stations.length) { var f = L.stations[0]; S("path", { d: mode === "h" ? "M" + (f.x - 40) + " " + f.y + " L" + f.x + " " + f.y : "M" + f.x + " " + (f.y - 24) + " L" + f.x + " " + f.y, stroke: f.color, "stroke-width": 7, "stroke-linecap": "round", opacity: .5 }, rg); }
      L.caps.forEach(function (c) {
        S("rect", { x: c.x, y: c.y, width: c.w, height: c.h, rx: Math.min(c.w, c.h) / 2, fill: "var(--lx-surface)", stroke: "var(--lx-line-2)", "stroke-width": 2, "stroke-dasharray": c.dashed ? "3 4" : null }, svg);
        S("text", { x: c.tx, y: c.ty, "text-anchor": "middle", class: "mlabel sub" }, svg).textContent = c.text;
      });
      L.stations.forEach(function (p) {
        var l = p.lesson, s = state(l), g = S("g", { class: dim(l.tier) && l.tier2 !== M.tier ? "seg-dim" : "" }, svg);
        var stn = S("g", { class: "stn " + s + (M.sel === p.i ? " sel" : ""), tabindex: 0, role: "button", style: "--c:" + p.color,
          "aria-label": "Lesson " + p.i + ": " + l.short + (s === "up" ? ", coming soon" : s === "done" ? ", done" : ", open now") }, g);
        if (s === "open") S("circle", { cx: p.x, cy: p.y, r: 17, class: "pulse" }, stn);
        S("circle", { cx: p.x, cy: p.y, r: 21, class: "ring" }, stn);
        S("circle", { cx: p.x, cy: p.y, r: 17, class: "face" }, stn);
        LX.iconInto(stn, l.icon || "map", p.x, p.y, 18);
        if (s === "done") {
          S("circle", { cx: p.x + 13, cy: p.y - 13, r: 8, fill: "var(--lx-good)", stroke: "var(--lx-surface)", "stroke-width": 2 }, stn);
          S("path", { d: "M" + (p.x + 9.5) + " " + (p.y - 13) + " l2.5 2.5 l4.5 -5", fill: "none", stroke: "var(--lx-surface)", "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round" }, stn);
        }
        stn.addEventListener("click", function () { open(p.i); });
        stn.addEventListener("keydown", function (ev) { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); open(p.i); } });
        if (mode === "h") {
          var y0 = p.labelAbove ? p.y - 30 - (p.lines.length - 1) * 14 : p.y + 36;
          S("text", { x: p.x, y: p.labelAbove ? y0 - 16 : y0, "text-anchor": "middle", class: "mlabel sub", "aria-hidden": "true" }, g).textContent = p.i;
          p.lines.forEach(function (ln, j) { S("text", { x: p.x, y: (p.labelAbove ? y0 : y0 + 15) + j * 14, "text-anchor": "middle", class: "mlabel" + (s === "up" ? " up" : ""), "aria-hidden": "true" }, g).textContent = ln; });
        } else {
          S("text", { x: p.textX, y: p.y - 2, class: "mlabel" + (s === "up" ? " up" : ""), "aria-hidden": "true" }, g).textContent = p.i + "  " + l.short;
          S("text", { x: p.textX, y: p.y + 15, class: "mlabel sub", "aria-hidden": "true" }, g).textContent = l.minutes + " min · " + (s === "open" ? "open now" : s === "done" ? "done" : "coming soon");
          var hit = S("rect", { x: p.textX - 6, y: p.y - 22, width: L.W - p.textX, height: 44, fill: "transparent", "aria-hidden": "true" }, g);
          hit.style.cursor = "pointer"; hit.addEventListener("click", function () { open(p.i); });
        }
      });
    }
    var lastW = 0;
    if (window.ResizeObserver) new ResizeObserver(function () { var w = wrap.clientWidth; if (LX.visible(wrap) && Math.abs(w - lastW) > 4) { lastW = w; close(); render(); } }).observe(wrap);
    LX.on("progress", render);
    render();
    return { render: render, open: open, close: close };
  };
  LX.ready(function () {
    document.querySelectorAll("[data-lx-metro]").forEach(function (host) {
      LX.json(host.getAttribute("data-src") || LX.base + "data/path.json").then(function (p) {
        LX.Metro(host, p); host.classList.add("is-live");
        var list = document.querySelector(host.getAttribute("data-list") || ".lx-listview"); if (list) list.open = false;
      }, function (e) { console.error("Learn course map: path.json could not be loaded", e); });
    });
  });
})();
