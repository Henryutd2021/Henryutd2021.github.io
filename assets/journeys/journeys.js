// journeys.js — the Journeys page (journeys.qmd, 2026-11-05). Loaded only by that page.
// The markup, the chapter list and the data (<script id="jr-data">) come from scripts/build_journeys.py (_journeys.qmd);
// styles in assets/journeys/journeys.css. Without JS the map box stays hidden and the chapter list is the content.
//   1. "Firsts only": one toggle (in the map's toolbar and above the chapters) shows only the firsts and the milestones.
//   2. Tile grids: the year of the first visit on hover, focus or tap; one Tab stop per grid, arrow keys move.
//   3. Map: land only (Natural Earth 1:110m, public domain, world-atlas@2.0.2) drawn as SVG with d3-geo and topojson-client,
//      pinned and loaded from jsDelivr (with SRI) when the section nears the viewport. Three views (World, China, United
//      States); places are dots (rings for places lived), journeys are lines (smooth curves through waypoints; flights and
//      trips whose way of travel is not recorded as gentle arcs). A year slider with Play adds the footprints year by year.
//      Clicking a dot or a line opens a small card. Keyboard: one Tab stop; the arrow keys move through the footprints in
//      time order, Enter opens the card, Escape closes it. If the libraries cannot load, the map box is hidden again.
(function () {
  "use strict";
  const root = document.getElementById("journeys");
  const dataEl = document.getElementById("jr-data");
  if (!root || !dataEl) return;
  let D;
  try { D = JSON.parse(dataEl.textContent); } catch (e) { return; }
  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  const chapterOf = {};
  D.chapters.forEach(function (c, i) { c.i = i; chapterOf[c.id] = c; });
  D.entries.forEach(function (e, i) { e.i = i; });
  const state = { firsts: false, year: D.now, view: "world" };
  let redraw = null;   // set once the map exists

  // ---------- 1. firsts filter ----------
  const firstBtns = root.querySelectorAll(".jr-firsts-btn");
  const firstNote = root.querySelector(".jr-firsts-note");
  function setFirsts(on) {
    state.firsts = on;
    root.classList.toggle("jr-firsts", on);
    firstBtns.forEach(function (b) { b.setAttribute("aria-pressed", on ? "true" : "false"); });
    if (firstNote) firstNote.hidden = !on;
    if (redraw) redraw();
  }
  firstBtns.forEach(function (b) {
    b.hidden = false;
    b.addEventListener("click", function () { setFirsts(b.getAttribute("aria-pressed") !== "true"); });
  });

  // ---------- 2. tile grids ----------
  root.querySelectorAll(".jr-tiles").forEach(function (fig) {
    const grid = fig.querySelector(".jr-tilegrid");
    const tiles = Array.prototype.slice.call(grid.querySelectorAll(".jr-tile"));
    if (!tiles.length) return;
    const tip = document.createElement("div");
    tip.className = "jr-tip"; tip.setAttribute("aria-hidden", "true"); tip.hidden = true;
    fig.appendChild(tip);
    const pos = function (t) { return { c: +t.style.getPropertyValue("--c"), r: +t.style.getPropertyValue("--r") }; };
    let current = tiles[0];
    tiles.forEach(function (t) { t.tabIndex = -1; });
    current.tabIndex = 0;
    function show(t) {
      const y = t.getAttribute("data-year");
      tip.innerHTML = "<strong>" + esc(t.getAttribute("data-name")) + "</strong>" +
        (t.classList.contains("is-homeland") ? "Home province" :
         y ? "First visit " + esc(y) + (t.classList.contains("is-draft") ? " (passed through)" : "") : "Not yet");
      tip.hidden = false;
      const fr = fig.getBoundingClientRect(), tr = t.getBoundingClientRect();
      const tw = tip.offsetWidth, th = tip.offsetHeight;
      let left = tr.left - fr.left + tr.width / 2 - tw / 2;
      left = Math.max(0, Math.min(fig.clientWidth - tw, left));
      let top = tr.top - fr.top - th - 6;
      if (top < 0) top = tr.bottom - fr.top + 6;
      tip.style.left = left + "px"; tip.style.top = top + "px";
      tiles.forEach(function (x) { x.classList.toggle("is-on", x === t); });
    }
    function hide() { tip.hidden = true; tiles.forEach(function (x) { x.classList.remove("is-on"); }); }
    function move(t) { current.tabIndex = -1; current = t; t.tabIndex = 0; t.focus(); }
    tiles.forEach(function (t) {
      t.addEventListener("mouseenter", function () { show(t); });
      t.addEventListener("mouseleave", hide);
      t.addEventListener("focus", function () { show(t); });
      t.addEventListener("blur", hide);
      t.addEventListener("click", function () { if (current !== t) move(t); else show(t); });
    });
    grid.addEventListener("keydown", function (ev) {
      const p = pos(current);
      let next = null;
      if (ev.key === "ArrowRight" || ev.key === "ArrowLeft") {
        const i = tiles.indexOf(current) + (ev.key === "ArrowRight" ? 1 : -1);
        next = tiles[Math.max(0, Math.min(tiles.length - 1, i))];
      } else if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
        const dir = ev.key === "ArrowDown" ? 1 : -1;
        for (let r = p.r + dir; r > 0 && r < 20 && !next; r += dir) {
          const row = tiles.filter(function (t) { return pos(t).r === r; });
          if (row.length) next = row.reduce(function (a, b) { return Math.abs(pos(b).c - p.c) < Math.abs(pos(a).c - p.c) ? b : a; });
        }
      } else if (ev.key === "Home") next = tiles[0];
      else if (ev.key === "End") next = tiles[tiles.length - 1];
      else if (ev.key === "Escape") { hide(); return; }
      else return;
      ev.preventDefault();
      if (next) move(next);
    });
  });

  // ---------- 3. the map ----------
  const box = root.querySelector(".jr-mapbox");
  const mapEl = document.getElementById("jr-map");
  if (!box || !mapEl) return;
  const CDN = "https://cdn.jsdelivr.net/npm/";
  const LIBS = [   // exact versions, with Subresource Integrity (hashes from jsDelivr's package listing)
    { src: CDN + "d3-array@3.2.4/dist/d3-array.min.js", sri: "sha256-gKpw0M0X2r3fbQVklOoXkmpFpp2ot4UCIKrOMxutZx0=" },
    { src: CDN + "d3-geo@3.1.1/dist/d3-geo.min.js", sri: "sha256-I+V08ejUcW1iK85FNWo3m2aidxYrFF9fFH5Mja77c9I=" },
    { src: CDN + "topojson-client@3.1.0/dist/topojson-client.min.js", sri: "sha256-Jc0CrkhsxQY+AhWk5M+xXeg3AMh6xIusTVfcaq8+u4k=" },
  ];
  const LAND = { url: CDN + "world-atlas@2.0.2/land-110m.json", sri: "sha256-6tX2gRnEmpJQkC59owO8sgk0G7uP7+c2mkObSLcEZYo=" };
  box.hidden = false;

  function loadScript(lib) {
    return new Promise(function (resolve, reject) {
      const s = document.createElement("script");
      s.src = lib.src; s.integrity = lib.sri; s.crossOrigin = "anonymous"; s.referrerPolicy = "no-referrer";
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  function timeout(ms) { return new Promise(function (_, reject) { window.setTimeout(function () { reject(new Error("timeout")); }, ms); }); }
  function start() {
    const libs = LIBS.reduce(function (p, lib) { return p.then(function () { return loadScript(lib); }); }, Promise.resolve());
    Promise.race([libs, timeout(20000)]).then(function () {
      if (!(window.d3 && window.d3.geoPath && window.topojson)) throw new Error("libraries missing");
      return Promise.race([
        fetch(LAND.url, { integrity: LAND.sri, mode: "cors", credentials: "omit" }).then(function (r) { if (!r.ok) throw new Error("land"); return r.json(); }),
        timeout(20000)]).catch(function () { return null; });   // without land, the dots and lines still draw
    }).then(function (topo) {
      init(topo ? window.topojson.feature(topo, topo.objects.land) : null);
    }).catch(function () { box.hidden = true; });
  }
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(function (es) {
      if (es.some(function (e) { return e.isIntersecting; })) { io.disconnect(); start(); }
    }, { rootMargin: "300px 0px" });
    io.observe(box);
  } else start();

  function init(land) {
    const d3 = window.d3;
    const NS = "http://www.w3.org/2000/svg";
    const el = function (tag, attrs, parent) {
      const n = document.createElementNS(NS, tag);
      Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
      if (parent) parent.appendChild(n);
      return n;
    };
    mapEl.classList.remove("is-loading");
    const svg = el("svg", { class: "jr-svg", role: "group", "aria-label": "Map of my journeys: places are dots and journeys are lines. The chapters below give the same places as text." }, mapEl);
    const gLand = el("path", { class: "jr-land", "aria-hidden": "true" }, svg);
    const gRoutes = el("g", { class: "jr-routes" }, svg);
    const gDots = el("g", { class: "jr-dots" }, svg);
    const card = document.createElement("div");
    card.className = "jr-card"; card.hidden = true; card.setAttribute("role", "dialog"); card.setAttribute("aria-modal", "false");
    mapEl.appendChild(card);
    const empty = document.createElement("p");
    empty.className = "jr-empty"; empty.hidden = true;
    mapEl.appendChild(empty);

    const slider = root.querySelector("#jr-year");
    const out = root.querySelector(".jr-year-out");
    const play = root.querySelector(".jr-play");
    const viewBtns = root.querySelectorAll(".jr-views button");
    let marks = [], focusIdx = 0, shown = new Set(), proj = null, openKey = null, lastW = 0;

    function viewBox(view) {   // the region each view frames (MultiPoints, fitted into the map box)
      if (view === "china") return { type: "MultiPoint", coordinates: [[73.5, 40], [80, 30], [97, 28], [109.5, 18.2], [123, 25], [135, 48], [121, 53.5], [87, 49]] };
      if (view === "us") return { type: "MultiPoint", coordinates: [[-124.7, 48.4], [-124.4, 40], [-117, 32.5], [-97.5, 25.8], [-80.2, 25], [-67, 44.8], [-69, 47.4], [-95, 49]] };
      return { type: "MultiPoint", coordinates: [[-128, 56], [132, 56], [-128, -12], [132, -12], [2, 62]] };
    }
    function projection(view, W, H) {
      const pad = Math.max(10, Math.round(W * 0.02));
      const p = view === "china" ? d3.geoConicEqualArea().parallels([25, 47]).rotate([-105, 0])
        : view === "us" ? d3.geoAlbers()
        : d3.geoNaturalEarth1();
      return p.fitExtent([[pad, pad], [W - pad, H - pad]], viewBox(view));
    }
    function heightFor(W) {
      const vh = window.innerHeight || 800;
      const phone = W < 576;
      const ratio = state.view === "world" ? (phone ? 0.74 : 0.45) : state.view === "china" ? (phone ? 0.92 : 0.64) : (phone ? 0.8 : 0.6);
      return Math.round(Math.max(240, Math.min(W * ratio, 640, vh * 0.72)));
    }

    // ---------- what is shown ----------
    function visible(e) { return e.y <= state.year && (!state.firsts || (e.f && e.f.length) || e.ms); }
    function collect() {
      const ents = D.entries.filter(visible);
      const placeVisits = {};
      ents.forEach(function (e) {
        e.pl.forEach(function (pid) { (placeVisits[pid] = placeVisits[pid] || []).push(e); });
      });
      return { ents: ents, placeVisits: placeVisits };
    }

    // ---------- geometry ----------
    function smooth(pts) {   // Catmull-Rom spline through the points, as cubic Beziers
      if (pts.length < 2) return "";
      let d = "M" + pts[0][0].toFixed(1) + "," + pts[0][1].toFixed(1);
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
        const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
        const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
        d += "C" + c1[0].toFixed(1) + "," + c1[1].toFixed(1) + " " + c2[0].toFixed(1) + "," + c2[1].toFixed(1) + " " + p2[0].toFixed(1) + "," + p2[1].toFixed(1);
      }
      return d;
    }
    function arcs(r, path) {   // flights (and unknown ways of travel): one gentle arc per leg, bowed to the north
      let d = "";
      for (let i = 0; i < r.p.length - 1; i++) {
        const a = r.p[i], b = r.p[i + 1];
        if (Math.abs(a[0] - b[0]) > 180) { d += path({ type: "LineString", coordinates: [a, b] }) || ""; continue; }   // across the date line: the great circle, cut at the map's edge
        const A = proj(a), B = proj(b);
        if (!A || !B) continue;
        const dx = B[0] - A[0], dy = B[1] - A[1], len = Math.hypot(dx, dy);
        if (len < 0.5) continue;
        let nx = -dy / len, ny = dx / len;
        if (ny > 0) { nx = -nx; ny = -ny; }
        const k = Math.min(0.2 * len, 90);
        const C = [(A[0] + B[0]) / 2 + nx * k, (A[1] + B[1]) / 2 + ny * k];
        d += "M" + A[0].toFixed(1) + "," + A[1].toFixed(1) + "Q" + C[0].toFixed(1) + "," + C[1].toFixed(1) + " " + B[0].toFixed(1) + "," + B[1].toFixed(1);
      }
      return d;
    }
    function routeD(r, path) {
      if (r.m === "ground") return smooth(r.p.map(function (p) { return proj(p); }).filter(Boolean));
      return arcs(r, path);
    }

    // ---------- cards ----------
    function badges(e) {
      let h = "";
      (e.f || []).forEach(function (f) { h += '<span class="jr-badge jr-badge-first">' + esc(f) + "</span>"; });
      if (e.ms) h += '<span class="jr-badge jr-badge-ms">' + esc(e.ms) + "</span>";
      return h;
    }
    function transitTag(e, pid) {
      if (!(e.tr || []).includes(pid)) return "";
      return '<span class="jr-tag">' + ((e.ne || []).includes(pid) ? "transit, no entry" : "transit") + "</span>";
    }
    function placeCard(pid, visits) {
      const p = D.places[pid];
      const items = visits.map(function (e) {
        const parent = e.pa ? D.entries.find(function (x) { return x.id === e.pa; }) : null;
        return '<li style="--ch: var(--ch-' + e.ch + ')"><span class="jr-c-when">' + esc(parent ? parent.w : e.w) + "</span>" +
          esc(e.t) + transitTag(e, pid) + (badges(e) ? " " + badges(e) : "") + "</li>";
      }).join("");
      return '<p class="jr-c-kind">' + (p.h ? "A place I lived" : "Place") + "</p>" +
        '<h3 id="jr-card-h">' + esc(p.n) + "</h3>" + (p.w ? '<p class="jr-c-where">' + esc(p.w) + "</p>" : "") +
        '<ul class="jr-c-visits">' + items + "</ul>";
    }
    function routeCard(e) {
      const parts = (e.r || []).map(function (r) { return r.m === "flight" ? "flight" : r.m === "ground" ? "by road or rail" : "way of travel not recorded"; });
      const kinds = parts.filter(function (x, i) { return parts.indexOf(x) === i; }).join(" and ");
      const km = (e.r || []).reduce(function (s, r) { return s + (r.km || 0); }, 0);
      return '<p class="jr-c-kind">Journey · ' + esc(kinds) + "</p>" +
        '<h3 id="jr-card-h" class="jr-c-date">' + esc(e.w) + "</h3>" +
        '<p class="jr-c-text">' + esc(e.t) + "</p>" + (badges(e) ? '<p class="jr-c-badges">' + badges(e) + "</p>" : "") +
        '<p class="jr-c-note">' + esc(chapterOf[e.ch].n) + " years · approximate route, about " + Math.round(km / 10) * 10 + " km</p>";
    }
    function openCard(m, viaKeyboard) {
      openKey = m.key;
      const data = collect();
      card.innerHTML = '<button type="button" class="jr-c-close" aria-label="Close"><i class="bi bi-x-lg" aria-hidden="true"></i></button>' +
        (m.kind === "place" ? placeCard(m.pid, data.placeVisits[m.pid] || []) : routeCard(m.e));
      card.setAttribute("aria-labelledby", "jr-card-h");
      card.style.setProperty("--ch", "var(--ch-" + m.ch + ")");
      card.hidden = false;
      card.querySelector(".jr-c-close").addEventListener("click", function () { closeCard(true); });
      placeCardBox(m.at);
      marks.forEach(function (x) { x.g.classList.toggle("is-open", x === m); });
      if (viaKeyboard) card.querySelector(".jr-c-close").focus({ preventScroll: true });
    }
    function placeCardBox(at) {
      const W = mapEl.clientWidth, H = mapEl.clientHeight;
      card.classList.toggle("is-docked", W < 576);
      if (W < 576) { card.style.left = ""; card.style.top = ""; return; }
      const cw = card.offsetWidth, chh = card.offsetHeight;
      let left = at[0] + 16, top = at[1] - chh / 2;
      if (left + cw > W - 8) left = at[0] - 16 - cw;
      left = Math.max(8, Math.min(W - cw - 8, left));
      top = Math.max(8, Math.min(H - chh - 8, top));
      card.style.left = left + "px"; card.style.top = top + "px";
    }
    function closeCard(returnFocus) {
      if (card.hidden) return;
      card.hidden = true; openKey = null;
      marks.forEach(function (x) { x.g.classList.remove("is-open"); });
      if (returnFocus && marks[focusIdx]) marks[focusIdx].g.focus({ preventScroll: true });
    }

    // ---------- draw ----------
    function draw(animate) {
      const W = mapEl.clientWidth;
      if (!W) return;
      const H = heightFor(W);
      mapEl.style.height = H + "px";
      lastW = W;
      proj = projection(state.view, W, H);
      const path = d3.geoPath(proj);
      svg.setAttribute("viewBox", "0 0 " + W + " " + H);
      svg.setAttribute("width", W); svg.setAttribute("height", H);
      gLand.setAttribute("d", land ? path(land) || "" : "");
      while (gRoutes.firstChild) gRoutes.removeChild(gRoutes.firstChild);
      while (gDots.firstChild) gDots.removeChild(gDots.firstChild);
      const data = collect();
      const next = new Set();
      marks = [];
      const inView = function (pt) { return pt && pt[0] >= -2 && pt[0] <= W + 2 && pt[1] >= -2 && pt[1] <= H + 2; };

      data.ents.forEach(function (e) {
        if (!e.r) return;
        const ds = e.r.map(function (r) { return { r: r, d: routeD(r, path) }; }).filter(function (x) { return x.d; });
        if (!ds.length) return;
        // only routes with some part in view; the card anchors at the route's first point in view
        const pts = [];
        e.r.forEach(function (r) { r.p.forEach(function (p) { const q = proj(p); if (inView(q)) pts.push(q); }); });
        if (!pts.length) return;
        const key = "r:" + e.id;
        // a route drawn smaller than a fingertip on a phone stays as a picture only (its places and the list carry it)
        const tiny = W < 576 && (function () { const xs = pts.map(function (q) { return q[0]; }), ys = pts.map(function (q) { return q[1]; });
          return Math.max.apply(null, xs) - Math.min.apply(null, xs) < 24 && Math.max.apply(null, ys) - Math.min.apply(null, ys) < 24; })();
        if (tiny) {
          const deco = el("g", { class: "jr-route is-deco", "aria-hidden": "true", style: "--ch: var(--ch-" + e.ch + ")" }, gRoutes);
          ds.forEach(function (x) { el("path", { class: "jr-vis jr-m-" + x.r.m, d: x.d }, deco); });
          return;
        }
        const g = el("g", { class: "jr-mark jr-route", tabindex: "-1", role: "button", style: "--ch: var(--ch-" + e.ch + ")",
          "aria-label": e.w + ": " + e.t + " (journey)" }, gRoutes);
        if (W < 576) {   // on phones every route also gets a 24 px touch target at its middle
          const probe = el("path", { d: ds[0].d }, g);
          const L0 = probe.getTotalLength ? probe.getTotalLength() : 0;
          const mid = L0 ? probe.getPointAtLength(L0 / 2) : { x: pts[0][0], y: pts[0][1] };
          g.removeChild(probe);
          el("rect", { class: "jr-hit jr-hit-box", x: (mid.x - 12).toFixed(1), y: (mid.y - 12).toFixed(1), width: 24, height: 24 }, g);
        }
        ds.forEach(function (x) {
          el("path", { class: "jr-hit", d: x.d }, g);
          const v = el("path", { class: "jr-vis jr-m-" + x.r.m, d: x.d }, g);
          if (animate && !shown.has(key) && !reduceMotion && x.r.m === "ground") {
            const L = v.getTotalLength ? v.getTotalLength() : 0;
            if (L) { v.style.strokeDasharray = L + " " + L; v.style.strokeDashoffset = L; v.getBoundingClientRect();
              v.style.transition = "stroke-dashoffset 1s ease-out"; v.style.strokeDashoffset = "0";
              window.setTimeout(function () { v.style.strokeDasharray = ""; v.style.strokeDashoffset = ""; v.style.transition = ""; }, 1100); }
          }
        });
        if (animate && !shown.has(key) && !reduceMotion) g.classList.add("is-new");
        next.add(key);
        marks.push({ kind: "route", key: key, e: e, ch: e.ch, g: g, at: pts[0], order: e.i, sub: 0 });
      });

      Object.keys(data.placeVisits).forEach(function (pid) {
        const p = D.places[pid], q = proj(p.ll);
        if (!inView(q)) return;
        const visits = data.placeVisits[pid];
        const first = visits[0];
        const key = "p:" + pid;
        const label = p.n + (p.w ? ", " + p.w : "") + " — " + visits.map(function (e) { return e.w; }).filter(function (w, i, a) { return a.indexOf(w) === i; }).join("; ");
        const g = el("g", { class: "jr-mark jr-dot" + (p.h ? " is-home" : ""), tabindex: "-1", role: "button",
          style: "--ch: var(--ch-" + first.ch + ")", "aria-label": label, transform: "translate(" + q[0].toFixed(1) + "," + q[1].toFixed(1) + ")" }, gDots);
        el("circle", { class: "jr-hit", r: 12 }, g);
        el("circle", { class: "jr-vis", r: p.h ? 5.5 : (W < 576 ? 3.6 : 4.2) }, g);
        if (animate && !shown.has(key) && !reduceMotion) g.classList.add("is-new");
        next.add(key);
        marks.push({ kind: "place", key: key, pid: pid, ch: first.ch, g: g, at: q, order: first.i, sub: 1 });
      });
      // homes on top of other dots
      Array.prototype.slice.call(gDots.querySelectorAll(".is-home")).forEach(function (n) { gDots.appendChild(n); });
      shown = next;

      marks.sort(function (a, b) { return a.order - b.order || a.sub - b.sub || (a.at[0] - b.at[0]); });
      marks.forEach(function (m, i) {
        m.g.addEventListener("click", function (ev) { ev.stopPropagation(); setFocus(i, false); openCard(m, false); });
        m.g.addEventListener("keydown", onKey);
        m.g.addEventListener("focus", function () { focusIdx = i; m.g.classList.add("is-focus"); });
        m.g.addEventListener("blur", function () { m.g.classList.remove("is-focus"); });
      });
      if (focusIdx >= marks.length) focusIdx = Math.max(0, marks.length - 1);
      marks.forEach(function (m, i) { m.g.setAttribute("tabindex", i === focusIdx ? "0" : "-1"); });
      empty.hidden = marks.length > 0;
      empty.textContent = state.firsts ? "No firsts in this view up to " + state.year + "." : "Nothing in this view up to " + state.year + " yet.";
      // keep an open card if its mark is still there, else close it
      const still = openKey && marks.find(function (m) { return m.key === openKey; });
      if (still) openCard(still, false); else closeCard(false);
    }
    function setFocus(i, move) {
      if (!marks.length) return;
      focusIdx = Math.max(0, Math.min(marks.length - 1, i));
      marks.forEach(function (m, k) { m.g.setAttribute("tabindex", k === focusIdx ? "0" : "-1"); });
      if (move) marks[focusIdx].g.focus();
    }
    function onKey(ev) {
      const k = ev.key;
      if (k === "ArrowRight" || k === "ArrowDown") { ev.preventDefault(); setFocus(focusIdx + 1, true); if (!card.hidden) openCard(marks[focusIdx], false); }
      else if (k === "ArrowLeft" || k === "ArrowUp") { ev.preventDefault(); setFocus(focusIdx - 1, true); if (!card.hidden) openCard(marks[focusIdx], false); }
      else if (k === "Home") { ev.preventDefault(); setFocus(0, true); }
      else if (k === "End") { ev.preventDefault(); setFocus(marks.length - 1, true); }
      else if (k === "Enter" || k === " ") { ev.preventDefault(); openCard(marks[focusIdx], true); }
      else if (k === "Escape") { closeCard(true); }
    }
    card.addEventListener("keydown", function (ev) { if (ev.key === "Escape") { ev.preventDefault(); closeCard(true); } });
    svg.addEventListener("click", function () { closeCard(false); });

    // ---------- controls ----------
    function readout() {
      const y = state.year;
      const chs = D.chapters.filter(function (c) { return c.y0 <= y && y <= c.y1; }).map(function (c) { return c.n; });
      out.textContent = D.since + "–" + y + (chs.length ? " · " + chs.join(", ") : "");
    }
    slider.addEventListener("input", function () { stop(); state.year = +slider.value; readout(); draw(false); });
    viewBtns.forEach(function (b) {
      b.addEventListener("click", function () {
        state.view = b.getAttribute("data-view");
        viewBtns.forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
        focusIdx = 0; closeCard(false); draw(false);
      });
    });
    let timer = null;
    function stop() {
      if (!timer) return;
      window.clearInterval(timer); timer = null;
      play.innerHTML = '<i class="bi bi-play-fill" aria-hidden="true"></i>';
      play.setAttribute("aria-label", "Play the years from " + D.since);
    }
    play.addEventListener("click", function () {
      if (timer) { stop(); return; }
      if (state.year >= D.now) state.year = D.since; else state.year += 1;
      slider.value = state.year; readout(); closeCard(false); draw(true);
      play.innerHTML = '<i class="bi bi-pause-fill" aria-hidden="true"></i>';
      play.setAttribute("aria-label", "Pause");
      timer = window.setInterval(function () {
        if (state.year >= D.now) { stop(); return; }
        state.year += 1; slider.value = state.year; readout(); draw(true);
      }, reduceMotion ? 1400 : 1100);
    });
    redraw = function () { draw(false); };
    readout();
    draw(false);
    let rt = null;
    window.addEventListener("resize", function () {
      window.clearTimeout(rt);
      rt = window.setTimeout(function () { if (mapEl.clientWidth !== lastW) draw(false); else if (!card.hidden) { const m = marks.find(function (x) { return x.key === openKey; }); if (m) placeCardBox(m.at); } }, 150);
    });
  }
})();
