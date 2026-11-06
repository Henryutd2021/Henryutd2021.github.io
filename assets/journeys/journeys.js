// journeys.js — the Journeys page (journeys.qmd; v2, 2026-11-05). Loaded only by that page.
// The markup, the chapter list and the data (<script id="jr-data">) come from scripts/build_journeys.py (_journeys.qmd);
// styles in assets/journeys/journeys.css. Without JS the map box stays hidden and the chapter list is the content.
//   1. "Firsts only": one toggle (in the map's toolbar and above the chapters) shows only the firsts and the milestones.
//   2. Tile grids: the year of the first visit on hover, focus or tap; one Tab stop per grid, arrow keys move.
//   3. Map: an atlas drawn as SVG with d3-geo and topojson-client. Map data, pinned and loaded from jsDelivr with SRI when the
//      section nears the viewport: China (its 34 provincial-level divisions and the South China Sea inset) from the China
//      standard map in Apache ECharts 4.9.0 (map/json/china.json and the inset in lib/coord/geo/fix/nanhai.js, Apache-2.0);
//      other countries from Natural Earth via world-atlas 2.0.2, China and Taiwan left out underneath so China's outline is
//      the standard one in every view; U.S. states from us-atlas 3.0.1 (loaded when that view is first opened). The world
//      view uses the Patterson cylindrical projection (d3-geo-projection 4.0.0), central meridian 10°E, 55°S to 78°N. Places
//      visited are filled in the colour of the chapter of the first visit. Places are dots (rings for places lived), journeys
//      are lines (smooth curves through waypoints; flights and trips whose way of travel is not recorded as gentle arcs).
//      A year slider with Play adds the footprints year by year, drawing each new route stroke by stroke. Clicking a dot or a
//      line opens a small card. Keyboard: one Tab stop; the arrow keys move through the footprints in time order, Enter
//      opens the card, Escape closes it. If the libraries cannot load, the map box is hidden again.
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
  // the map's timeline steps through the entries in time order: state.upto is the last entry shown (-1: only home)
  const state = { firsts: false, upto: D.entries.length - 1, view: "world" };
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

  // ---------- 2b. chapter pages: previous / next on wide screens (the pages scroll sideways there; stacked on phones) ----------
  (function () {
    const list = root.querySelector("#jr-pages");
    const nav = root.querySelector(".jr-pages-nav");
    if (!list || !nav) return;
    const prev = nav.querySelector(".jr-pg-prev"), next = nav.querySelector(".jr-pg-next");
    function update() {
      const scrolls = list.scrollWidth > list.clientWidth + 4;
      nav.hidden = !scrolls;
      prev.disabled = list.scrollLeft <= 4;
      next.disabled = list.scrollLeft + list.clientWidth >= list.scrollWidth - 4;
    }
    function by(dir) { list.scrollBy({ left: dir * list.clientWidth, behavior: reduceMotion ? "auto" : "smooth" }); }
    prev.addEventListener("click", function () { by(-1); });
    next.addEventListener("click", function () { by(1); });
    list.addEventListener("scroll", function () { window.requestAnimationFrame(update); }, { passive: true });
    window.addEventListener("resize", update);
    update();
  })();

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
  // the world view's projection (Patterson cylindrical, Henry 2026-11-06); optional: without it the world view falls back
  const PROJ_LIB = { src: CDN + "d3-geo-projection@4.0.0/dist/d3-geo-projection.min.js", sri: "sha256-gxNpQbz283+4qeQzGGAd+s8CkB3GBN7BO4FaLNicgTs=" };
  const DATA = {
    world: { url: CDN + "world-atlas@2.0.2/countries-110m.json", sri: "sha256-JRbJFYZ8e68Y3exyeuxGwxVUGgfPs9eaZVmwXV6U7ug=" },
    china: { url: CDN + "echarts@4.9.0/map/json/china.json", sri: "sha256-05L2UaSOYhPJv8g/QGcRBp3ilsF/Qmz/wK0RSAeO4iY=" },
    nanhai: { url: CDN + "echarts@4.9.0/lib/coord/geo/fix/nanhai.js", sri: "sha256-dvBK/3U91HPpFH2iTTVCxGBAnOtmAq1oZoDgs7qShzQ=", text: true },
    us: { url: CDN + "us-atlas@3.0.1/states-10m.json", sri: "sha256-12s5HM+ov/YB1R4+PaXUOon6Rs1crKcs5zGzg75VltA=" },
  };
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
  function fetchData(f) {
    return Promise.race([fetch(f.url, { integrity: f.sri, mode: "cors", credentials: "omit" })
      .then(function (r) { if (!r.ok) throw new Error(f.url); return f.text ? r.text() : r.json(); }), timeout(20000)]);
  }

  // ECharts map data (v4) stores coordinates compressed: zigzag-encoded deltas in strings (UTF8Encoding). This is the
  // decoder ECharts itself uses (Apache-2.0); then rings are put in d3's winding order, so no polygon fills the globe.
  function decodeRing(str, offsets, scale) {
    const out = [];
    let px = offsets[0], py = offsets[1];
    for (let i = 0; i < str.length; i += 2) {
      let x = str.charCodeAt(i) - 64, y = str.charCodeAt(i + 1) - 64;
      x = (x >> 1) ^ (-(x & 1)); y = (y >> 1) ^ (-(y & 1));
      x += px; y += py; px = x; py = y;
      out.push([x / scale, y / scale]);
    }
    return out;
  }
  function d3Winding(d3, polys) {   // polys: array of polygons (arrays of rings)
    return polys.map(function (rings) {
      return d3.geoArea({ type: "Polygon", coordinates: rings }) > 2 * Math.PI ? rings.map(function (r) { return r.slice().reverse(); }) : rings;
    });
  }
  function decodeChina(d3, json) {
    const scale = json.UTF8Scale || 1024;
    return json.features.map(function (f) {
      const g = f.geometry;
      let polys;
      if (!json.UTF8Encoding) polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
      else if (g.type === "Polygon") polys = [g.coordinates.map(function (ring, i) { return decodeRing(ring, g.encodeOffsets[i], scale); })];
      else polys = g.coordinates.map(function (poly, i) { return poly.map(function (ring, k) { return decodeRing(ring, g.encodeOffsets[i][k], scale); }); });
      const code = "CN-" + (D.cnGB[String(f.properties.id || f.id || "").slice(0, 2)] || "");
      return { type: "Feature", properties: { code: code }, geometry: { type: "MultiPolygon", coordinates: d3Winding(d3, polys) } };
    });
  }
  // the South China Sea inset of the China standard map, as ECharts draws it (lib/coord/geo/fix/nanhai.js): its polygons
  // in a local frame, placed at 126°E 25°N with ECharts' own scaling
  function nanhaiFeature(d3, text) {
    const m = /var\s+points\s*=\s*(\[[\s\S]*?\]);/.exec(text || "");
    if (!m) return null;
    let pts;
    try { pts = JSON.parse(m[1]); } catch (e) { return null; }
    const g = /var\s+geoCoord\s*=\s*\[\s*([\d.]+)\s*,\s*([\d.]+)\s*\]/.exec(text) || [0, 126, 25];
    const gx = +g[1], gy = +g[2];
    const rings = pts.map(function (ring) { return ring.map(function (p) { return [p[0] / 10.5 + gx, p[1] / (-10.5 / 0.75) + gy]; }); });
    return { type: "Feature", properties: { code: "nanhai" }, geometry: { type: "MultiPolygon", coordinates: d3Winding(d3, rings.map(function (r) { return [r]; })) } };
  }

  function start() {
    const libs = LIBS.reduce(function (p, lib) { return p.then(function () { return loadScript(lib); }); }, Promise.resolve());
    Promise.race([libs, timeout(20000)]).then(function () {
      if (!(window.d3 && window.d3.geoPath && window.topojson)) throw new Error("libraries missing");
      return Promise.race([loadScript(PROJ_LIB), timeout(15000)]).catch(function () { return null; });
    }).then(function () {
      return Promise.all([fetchData(DATA.world).catch(function () { return null; }), fetchData(DATA.china).catch(function () { return null; }),
                          fetchData(DATA.nanhai).catch(function () { return null; })]);
    }).then(function (res) {
      const d3 = window.d3;
      const geo = { countries: [], china: [], nanhai: null, states: null };
      if (res[0]) geo.countries = window.topojson.feature(res[0], res[0].objects.countries).features
        .filter(function (f) { return f.id !== "156" && f.id !== "158"; })   // China and Taiwan come from the China standard map
        .reduce(function (acc, f) {   // France's overseas parts (French Guiana) are drawn but not coloured: only Paris was visited
          if (f.id !== "250" || f.geometry.type !== "MultiPolygon") { acc.push(f); return acc; }
          const home = [], away = [];
          f.geometry.coordinates.forEach(function (poly) { (window.d3.geoCentroid({ type: "Polygon", coordinates: poly })[0] > -30 ? home : away).push(poly); });
          acc.push({ type: "Feature", id: "250", properties: f.properties, geometry: { type: "MultiPolygon", coordinates: home } });
          if (away.length) acc.push({ type: "Feature", id: "", properties: {}, geometry: { type: "MultiPolygon", coordinates: away } });
          return acc;
        }, []);
      if (res[1]) geo.china = decodeChina(d3, res[1]);
      if (res[2]) geo.nanhai = nanhaiFeature(d3, res[2]);
      init(geo);
    }).catch(function () { box.hidden = true; });
  }
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(function (es) {
      if (es.some(function (e) { return e.isIntersecting; })) { io.disconnect(); start(); }
    }, { rootMargin: "300px 0px" });
    io.observe(box);
  } else start();

  const BY = { plane: ["airplane", "by plane"], train: ["train-front", "by train"], bus: ["bus-front", "by bus"], car: ["car-front", "by car"],
               bike: ["bicycle", "by bicycle"], foot: ["person-walking", "on foot"] };
  const TILT = [-4, 2.5, -1.5, 3.5, -2.5, 1.5];

  function init(geo) {
    const d3 = window.d3;
    const NS = "http://www.w3.org/2000/svg";
    const el = function (tag, attrs, parent) {
      const n = document.createElementNS(NS, tag);
      Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
      if (parent) parent.appendChild(n);
      return n;
    };
    mapEl.classList.remove("is-loading");
    const svg = el("svg", { class: "jr-svg", role: "group", "aria-label": "Map of my journeys: places visited are coloured, places are dots and journeys are lines. The chapters below give the same places as text." }, mapEl);
    const defs = el("defs", {}, svg);
    const gBase = el("g", { class: "jr-base", "aria-hidden": "true" }, svg);
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
    const usNames = {};
    Object.keys(D.names).forEach(function (k) { if (k.indexOf("US-") === 0) usNames[D.names[k]] = k; });
    let marks = [], focusIdx = 0, shown = new Set(), shownRegions = new Set(), proj = null, openKey = null, lastW = 0, maskSeq = 0, animEnd = 0;
    let usLoading = null;

    function viewBox(view) {   // the region each view frames (MultiPoints, fitted into the map box)
      if (view === "china") return { type: "MultiPoint", coordinates: [[73.5, 40], [80, 30], [97, 28], [109.5, 18.2], [124, 18.5], [133, 25], [135, 48], [121, 53.5], [87, 49]] };
      if (view === "us") return { type: "MultiPoint", coordinates: [[-124.7, 48.4], [-124.4, 40], [-117, 32.5], [-97.5, 25.8], [-80.2, 25], [-67, 44.8], [-69, 47.4], [-95, 49], [-160, 19], [-155, 19], [-150, 61], [-170, 60]] };
      return { type: "MultiPoint", coordinates: [[-128, 56], [132, 56], [-128, -12], [132, -12], [2, 62]] };
    }
    // the world: Patterson cylindrical (geoMiller, then Natural Earth, if the projection library did not load), central
    // meridian 10°E, the whole width of the world, cropped to 55°S to 78°N
    const worldMaker = d3.geoPatterson || d3.geoMiller || d3.geoNaturalEarth1;
    function worldFrame(W) {
      const p = worldMaker().rotate([-10, 0]).scale(1).translate([0, 0]);
      const xL = p([-169.999, 0])[0], xR = p([189.999, 0])[0], yT = p([10, 78])[1], yB = p([10, -55])[1];
      const k = W / (xR - xL);
      return { k: k, xL: xL, yT: yT, h: (yB - yT) * k };
    }
    function projection(view, W, H) {
      if (view === "world") {
        const f = worldFrame(W);
        return worldMaker().rotate([-10, 0]).scale(f.k).translate([-f.xL * f.k, -f.yT * f.k + (H - f.h) / 2]);
      }
      const pad = Math.max(10, Math.round(W * 0.02));
      const p = view === "china" ? d3.geoConicEqualArea().parallels([25, 47]).rotate([-105, 0])
        : view === "us" ? d3.geoAlbersUsa()
        : d3.geoNaturalEarth1();
      return p.fitExtent([[pad, pad], [W - pad, H - pad]], viewBox(view));
    }
    function heightFor(W) {
      const vh = window.innerHeight || 800;
      const phone = W < 576;
      if (state.view === "world") return Math.round(Math.max(phone ? 170 : 240, worldFrame(W).h));
      const ratio = state.view === "china" ? (phone ? 0.86 : 0.66) : (phone ? 0.72 : 0.58);
      return Math.round(Math.max(240, Math.min(W * ratio, 640, vh * 0.74)));
    }

    // ---------- what is shown ----------
    function visible(e) { return e.i <= state.upto && (!state.firsts || (e.f && e.f.length) || e.ms); }
    function collect() {
      const ents = D.entries.filter(visible);
      const placeVisits = {};
      ents.forEach(function (e) { e.pl.forEach(function (pid) { (placeVisits[pid] = placeVisits[pid] || []).push(e); }); });
      return { ents: ents, placeVisits: placeVisits };
    }
    function region(code) {   // [year, chapter, inferred, first entry] if visited by the timeline's position (home: from the start)
      const r = D.regions[code];
      return r && r[3] <= state.upto ? r : null;
    }

    // ---------- geometry ----------
    function smooth(pts, from, to) {   // Catmull-Rom spline through the points, as cubic Beziers (optionally segments from..to only)
      if (pts.length < 2) return "";
      from = from || 0; to = to == null ? pts.length - 1 : to;
      let d = "M" + pts[from][0].toFixed(1) + "," + pts[from][1].toFixed(1);
      for (let i = from; i < to; i++) {
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
        if (Math.abs(a[0] - b[0]) > 180) {   // across the date line: the great circle, cut at the map's edge (not in the U.S. view, whose insets would catch it)
          if (state.view !== "us") d += path({ type: "LineString", coordinates: [a, b] }) || "";
          continue;
        }
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
    // a route drawn leg by leg in its own colours (the 2013 loop, as Henry's route image shows it): [{d, color}]
    function legsD(r) {
      const pts = r.p.map(function (p) { return proj(p); });
      if (pts.some(function (q) { return !q; })) return null;
      let from = 0;
      return r.lg.map(function (leg) { const d = smooth(pts, from, leg[0]); from = leg[0]; return { d: d, color: leg[1] }; });
    }

    // ---------- the base map: borders and the colours of the places visited ----------
    function regionPath(f, code, path, parent, cls, animate) {
      const d = path(f);
      if (!d) return;
      const r = code ? region(code) : null;
      const n = el("path", { d: d, class: "jr-reg" + (cls ? " " + cls : "") + (r ? " is-visited" + (r[2] ? " is-inferred" : "") : "") }, parent);
      if (r) {
        n.style.setProperty("--ch", "var(--ch-" + r[1] + ")");
        if (animate && !shownRegions.has(code) && !reduceMotion) n.classList.add("is-new");
        nextRegions.add(code);
      }
      const name = code && D.names[code];
      if (name) el("title", {}, n).textContent = name + (r ? (code === D.home ? ", home" : ", first visit " + r[0] + (r[2] ? " (passed through)" : "")) : "");
    }
    let nextRegions = new Set();
    function drawBase(path, animate) {
      while (gBase.firstChild) gBase.removeChild(gBase.firstChild);
      nextRegions = new Set();
      if (state.view === "us") {
        if (!geo.states) return;
        geo.states.forEach(function (f) { regionPath(f, usNames[f.properties.name] || "", path, gBase, "", animate); });
        return;
      }
      // other countries (Natural Earth), China and Taiwan left out
      geo.countries.forEach(function (f) { regionPath(f, f.id && D.regions[f.id] ? f.id : "", path, gBase, "", animate); });
      if (state.view === "world") {
        // China from the standard map as one country: a border pass, then the fills on top (no inner borders)
        const g = el("g", { class: "jr-china-world" }, gBase);
        geo.china.forEach(function (f) { const d = path(f); if (d) el("path", { d: d, class: "jr-reg jr-cn-edge" }, g); });
        geo.china.forEach(function (f) { regionPath(f, "156", path, g, "jr-cn-fill", animate); });
      } else {
        geo.china.forEach(function (f) { regionPath(f, f.properties.code, path, gBase, "jr-prov", animate); });
        if (geo.nanhai) { const d = path(geo.nanhai); if (d) el("path", { d: d, class: "jr-nanhai" }, gBase); }
      }
    }
    function loadUS() {
      if (geo.states) return Promise.resolve();
      if (usLoading) return usLoading;
      mapEl.classList.add("is-loading");
      usLoading = fetchData(DATA.us).then(function (topo) {
        geo.states = window.topojson.feature(topo, topo.objects.states).features;
      }).catch(function () { geo.states = []; }).then(function () { mapEl.classList.remove("is-loading"); usLoading = null; draw(false); });
      return usLoading;
    }

    // ---------- cards ----------
    function stamps(e) {
      let h = "";
      (e.f || []).forEach(function (f, i) {
        h += '<span class="jr-stamp' + (f.length <= 24 ? " is-round" : "") + '" style="--ch: var(--ch-' + e.ch + "); --rot: " + TILT[(e.i + i) % TILT.length] + 'deg">' + esc(f) + "</span>";
      });
      if (e.ms) h += '<span class="jr-badge jr-badge-ms">' + esc(e.ms) + "</span>";
      return h;
    }
    function icons(modes) {
      if (!modes.length) return "";
      const words = modes.map(function (m) { return BY[m][1]; }).join(" and ");
      return '<span class="jr-by" role="img" aria-label="' + esc(words.charAt(0).toUpperCase() + words.slice(1)) + '">' +
        modes.map(function (m) { return '<i class="bi bi-' + BY[m][0] + '" aria-hidden="true"></i>'; }).join("") + "</span>";
    }
    function modesOf(e) {
      const ms = [];
      (e.r || []).forEach(function (r) { if (r.b && ms.indexOf(r.b) < 0) ms.push(r.b); });
      (e.by || []).forEach(function (b) { if (ms.indexOf(b) < 0) ms.push(b); });
      return ms;
    }
    function transitTag(e, pid) {
      if (!(e.tr || []).includes(pid)) return "";
      return '<span class="jr-tag">' + ((e.ne || []).includes(pid) ? "transit, no entry" : "transit") + "</span>";
    }
    function placeCard(pid, visits) {
      const p = D.places[pid];
      const items = visits.map(function (e) {
        const parent = e.pa ? D.entries.find(function (x) { return x.id === e.pa; }) : null;
        const st = stamps(e);
        const hk = e.hk && e.hk[0] === pid ? '<span class="jr-peakchip jr-hikechip"><i class="bi bi-person-walking" aria-hidden="true"></i>Hike, ' + esc(e.hk[1]) + "</span>" : "";
        return '<li style="--ch: var(--ch-' + e.ch + ')"><span class="jr-c-when">' + esc(parent ? parent.w : e.w) + "</span>" +
          icons(modesOf(e)) + esc(e.t) + transitTag(e, pid) + (st || hk ? '<span class="jr-c-stamps">' + st + hk + "</span>" : "") + "</li>";
      }).join("");
      return '<p class="jr-c-kind">' + (p.h ? "A place I lived" : "Place") + "</p>" +
        '<h3 id="jr-card-h">' + esc(p.n) + "</h3>" + (p.w ? '<p class="jr-c-where">' + esc(p.w) + "</p>" : "") +
        (p.s ? '<p class="jr-c-peak"><i class="bi bi-triangle-fill" aria-hidden="true"></i>' + esc(p.s[1]) + (p.s[0] ? " · " + esc(p.s[0]) : "") + " · on foot</p>" : "") +
        '<ul class="jr-c-visits">' + items + "</ul>";
    }
    function routeCard(e) {
      const parts = (e.r || []).map(function (r) { return r.bw ? r.bw : r.b ? BY[r.b][1] : r.m === "flight" ? "by plane" : r.m === "ground" ? "by road or rail" : "way of travel not recorded"; });
      const kinds = parts.filter(function (x, i) { return parts.indexOf(x) === i; }).join(", then ");
      const km = (e.r || []).reduce(function (s, r) { return s + (r.km || 0); }, 0);
      const st = stamps(e);
      return '<p class="jr-c-kind">Journey · ' + esc(kinds) + "</p>" +
        '<h3 id="jr-card-h" class="jr-c-date">' + icons(modesOf(e)) + esc(e.w) + "</h3>" +
        '<p class="jr-c-text">' + esc(e.t) + "</p>" + (st ? '<p class="jr-c-badges">' + st + "</p>" : "") +
        '<p class="jr-c-note">' + esc(chapterOf[e.ch].n) + " years · approximate route, about " + (Math.round(km / 10) * 10).toLocaleString("en-US") + " km</p>";
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

    // a new route draws itself: a mask stroke runs along the line (works for dashed and dotted lines too)
    function drawIn(v, d, delay, W, H, fixedMs, ease) {
      const id = "jr-mask-" + (++maskSeq);
      const mask = el("mask", { id: id, maskUnits: "userSpaceOnUse", x: -50, y: -50, width: W + 100, height: H + 100 }, defs);
      const mp = el("path", { d: d, fill: "none", stroke: "#fff", "stroke-width": 9, "stroke-linecap": "round", "stroke-linejoin": "round" }, mask);
      const L = mp.getTotalLength ? mp.getTotalLength() : 0;
      if (!L) { defs.removeChild(mask); return; }
      mp.style.strokeDasharray = L + " " + L; mp.style.strokeDashoffset = L;
      v.setAttribute("mask", "url(#" + id + ")");
      const ms = fixedMs || Math.min(2200, 800 + L * 1.6);
      animEnd = Math.max(animEnd, delay + ms);
      window.setTimeout(function () { mp.style.transition = "stroke-dashoffset " + ms + "ms " + (ease || "ease-in-out"); mp.style.strokeDashoffset = "0"; }, delay + 30);
      window.setTimeout(function () { v.removeAttribute("mask"); if (mask.parentNode) mask.parentNode.removeChild(mask); }, delay + ms + 120);
    }

    // ---------- draw ----------
    function draw(animate) {
      const W = mapEl.clientWidth;
      animEnd = 0;
      if (!W) return 0;
      if (state.view === "us" && !geo.states) loadUS();
      const H = heightFor(W);
      mapEl.style.height = H + "px";
      lastW = W;
      proj = projection(state.view, W, H);
      const path = d3.geoPath(proj);
      svg.setAttribute("viewBox", "0 0 " + W + " " + H);
      svg.setAttribute("width", W); svg.setAttribute("height", H);
      while (defs.firstChild) defs.removeChild(defs.firstChild);
      drawBase(path, animate);
      shownRegions = nextRegions;
      while (gRoutes.firstChild) gRoutes.removeChild(gRoutes.firstChild);
      while (gDots.firstChild) gDots.removeChild(gDots.firstChild);
      const data = collect();
      const next = new Set();
      marks = [];
      const inView = function (pt) { return pt && pt[0] >= -2 && pt[0] <= W + 2 && pt[1] >= -2 && pt[1] <= H + 2; };
      let stagger = 0;

      data.ents.forEach(function (e) {
        if (!e.r) return;
        const ds = e.r.map(function (r) { return { r: r, d: routeD(r, path) }; }).filter(function (x) { return x.d; });
        if (!ds.length) return;
        const pts = [];
        e.r.forEach(function (r) { r.p.forEach(function (p) { const q = proj(p); if (inView(q)) pts.push(q); }); });
        if (!pts.length) return;
        const key = "r:" + e.id;
        const fresh = animate && !shown.has(key) && !reduceMotion;
        // a route drawn smaller than a fingertip on a phone stays as a picture only (its places and the list carry it)
        const tiny = W < 576 && (function () { const xs = pts.map(function (q) { return q[0]; }), ys = pts.map(function (q) { return q[1]; });
          return Math.max.apply(null, xs) - Math.min.apply(null, xs) < 24 && Math.max.apply(null, ys) - Math.min.apply(null, ys) < 24; })();
        if (tiny) {
          const deco = el("g", { class: "jr-route is-deco", "aria-hidden": "true", style: "--ch: var(--ch-" + e.ch + ")" }, gRoutes);
          ds.forEach(function (x) { el("path", { class: "jr-vis jr-m-" + x.r.m, d: x.d }, deco); });
          next.add(key);
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
          const legs = x.r.lg && legsD(x.r);
          if (legs) {   // leg by leg, each in its colour; during Play they draw one after another, as one stroke in 1.7 s
            const vs = legs.map(function (leg) { return el("path", { class: "jr-vis jr-m-" + x.r.m + " jr-leg", d: leg.d, style: "stroke: " + leg.color }, g); });
            if (fresh) {
              const lens = vs.map(function (v) { return v.getTotalLength ? v.getTotalLength() : 1; });
              const total = lens.reduce(function (a, b) { return a + b; }, 0) || 1;
              let t = stagger * 320;
              vs.forEach(function (v, k) { const ms = Math.max(60, 3400 * lens[k] / total); drawIn(v, legs[k].d, t, W, H, ms, "linear"); t += ms; });
            }
            return;
          }
          const v = el("path", { class: "jr-vis jr-m-" + x.r.m, d: x.d }, g);
          if (fresh) drawIn(v, x.d, stagger * 320, W, H);
        });
        if (fresh) stagger++;
        next.add(key);
        marks.push({ kind: "route", key: key, e: e, ch: e.ch, g: g, at: pts[0], order: e.i, sub: 0 });
      });

      // dots that would sit on top of each other (Abu Dhabi and Dubai at world scale) are nudged apart a little, so every
      // place keeps a dot of its own that can be seen and clicked
      const pos = {};
      const ids = Object.keys(data.placeVisits).filter(function (pid) { const q = proj(D.places[pid].ll); if (inView(q)) { pos[pid] = q.slice(); return true; } return false; });
      const gapPx = W < 576 ? 6 : 8;
      for (let round = 0; round < 8; round++) {
        let moved = false;
        for (let a = 0; a < ids.length; a++) {
          for (let b = a + 1; b < ids.length; b++) {
            const A = pos[ids[a]], B = pos[ids[b]];
            let dx = B[0] - A[0], dy = B[1] - A[1], dist = Math.hypot(dx, dy);
            if (dist >= gapPx) continue;
            if (dist < 0.01) { dx = 1; dy = 0; dist = 1; }
            const push = (gapPx - dist) / 2;
            A[0] -= dx / dist * push; A[1] -= dy / dist * push; B[0] += dx / dist * push; B[1] += dy / dist * push;
            moved = true;
          }
        }
        if (!moved) break;
      }
      ids.forEach(function (pid) {
        const p = D.places[pid], q = pos[pid];
        const visits = data.placeVisits[pid];
        const first = visits[0];
        const key = "p:" + pid;
        const label = p.n + (p.w ? ", " + p.w : "") + " — " + visits.map(function (e) { return e.w; }).filter(function (w, i, a) { return a.indexOf(w) === i; }).join("; ");
        const g = el("g", { class: "jr-mark jr-dot" + (p.h ? " is-home" : "") + (p.s ? " is-peak" : ""), tabindex: "-1", role: "button",
          style: "--ch: var(--ch-" + (p.lc || first.ch) + ")", "aria-label": label, transform: "translate(" + q[0].toFixed(1) + "," + q[1].toFixed(1) + ")" }, gDots);
        el("circle", { class: "jr-hit", r: 12 }, g);
        if (p.s) el("path", { class: "jr-vis", d: "M0,-6.2 L5.6,3.9 L-5.6,3.9 Z" }, g);   // a summit: a small triangle
        else el("circle", { class: "jr-vis", r: p.h ? 5.5 : (W < 576 ? 3.6 : 4.2) }, g);
        if (animate && !shown.has(key) && !reduceMotion) { g.classList.add("is-new"); g.style.setProperty("--delay", Math.min(stagger, 6) * 320 + "ms"); }
        next.add(key);
        marks.push({ kind: "place", key: key, pid: pid, ch: first.ch, g: g, at: q, order: first.i, sub: 1 });
      });
      Array.prototype.slice.call(gDots.querySelectorAll(".is-home")).forEach(function (n) { gDots.appendChild(n); });
      shown = next;

      marks.sort(function (a, b) { return a.order - b.order || a.sub - b.sub || (a.at[0] - b.at[0]); });
      marks.forEach(function (m, i) {
        m.g.addEventListener("click", function (ev) { ev.stopPropagation(); setFocus(i, false); openCard(m, false); });
        m.g.addEventListener("keydown", onKey);
        m.g.addEventListener("focus", function () { focusIdx = i; });
      });
      if (focusIdx >= marks.length) focusIdx = Math.max(0, marks.length - 1);
      marks.forEach(function (m, i) { m.g.setAttribute("tabindex", i === focusIdx ? "0" : "-1"); });
      empty.hidden = marks.length > 0 || (state.view === "us" && !geo.states);
      empty.textContent = state.firsts ? "No firsts in this view yet." : "Nothing in this view yet.";
      const still = openKey && marks.find(function (m) { return m.key === openKey; });
      if (still) openCard(still, false); else closeCard(false);
      return animEnd;
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

    // ---------- controls: a timeline that steps through the entries ----------
    // Choosing a view resets its timeline and plays it from the start (the first footprint in that view; the home province
    // or country is lit from the start). Each step shows one more entry; a step waits for its routes to finish drawing,
    // and the chapter changes get a pause. With reduced motion nothing plays by itself: the map shows the final state.
    const STEP = 1300, CHAPTER_PAUSE = 1700;
    const last = D.entries.length - 1;
    let timer = null, seq = [], pos = -1;
    function inViewNow(e) {   // does this entry put a footprint in the current view?
      const W = mapEl.clientWidth, H = mapEl.clientHeight;
      const ok = function (ll) { const q = proj && proj(ll); return q && q[0] >= 0 && q[0] <= W && q[1] >= 0 && q[1] <= H; };
      return e.pl.some(function (pid) { return ok(D.places[pid].ll); }) || (e.r || []).some(function (r) { return r.p.some(ok); });
    }
    function sequence() { return D.entries.filter(inViewNow).map(function (e) { return e.i; }); }
    function readout() {
      const e = state.upto >= 0 ? D.entries[state.upto] : null;
      const y = e ? e.y : D.since;
      out.textContent = y + (e ? " · " + chapterOf[e.ch].n : " · home");
      slider.value = y;
    }
    slider.addEventListener("input", function () {
      stop();
      const y = +slider.value;
      let k = -1;
      D.entries.forEach(function (e) { if (e.y <= y) k = e.i; });
      state.upto = k; readout(); draw(false);
    });
    function setPlaying(on) {
      play.innerHTML = '<i class="bi bi-' + (on ? "pause" : "play") + '-fill" aria-hidden="true"></i>';
      play.setAttribute("aria-label", on ? "Pause" : "Play the journeys from the start");
      root.classList.toggle("is-playing", on);
    }
    function stop() {
      if (timer) { window.clearTimeout(timer); timer = null; }
      setPlaying(false);
    }
    function tick() {
      pos += 1;
      if (pos >= seq.length) { timer = null; setPlaying(false); return; }
      const prev = state.upto >= 0 ? D.entries[state.upto].ch : null;
      state.upto = seq[pos];
      const cur = D.entries[state.upto].ch;
      readout();
      const drawing = draw(!reduceMotion);
      const wait = Math.max(STEP, drawing + 250) + (prev && prev !== cur ? CHAPTER_PAUSE : 0);
      timer = window.setTimeout(tick, wait);
    }
    function playFrom(start) {
      stop(); closeCard(false);
      seq = sequence();
      if (start || state.upto >= seq[seq.length - 1]) {
        state.upto = -1; pos = -1; readout(); draw(false);
        setPlaying(true);
        timer = window.setTimeout(tick, reduceMotion ? 300 : 900);
        return;
      }
      pos = -1;
      while (pos + 1 < seq.length && seq[pos + 1] <= state.upto) pos += 1;
      setPlaying(true);
      tick();
    }
    function showFinal() { stop(); state.upto = last; readout(); draw(false); }
    play.addEventListener("click", function () { if (timer) stop(); else playFrom(false); });
    viewBtns.forEach(function (b) {
      b.addEventListener("click", function () {
        state.view = b.getAttribute("data-view");
        viewBtns.forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
        focusIdx = 0; closeCard(false);
        stop(); state.upto = last; draw(false);   // lay out the view (and its projection) first
        if (reduceMotion) { showFinal(); return; }
        if (state.view === "us" && !geo.states) { loadUS().then(function () { playFrom(true); }); return; }
        playFrom(true);
      });
    });
    redraw = function () { draw(false); };
    readout();
    draw(false);
    // the world view plays once by itself when the map first comes into view
    if (!reduceMotion && "IntersectionObserver" in window) {
      const seen = new IntersectionObserver(function (es) {
        if (es.some(function (e) { return e.isIntersecting; })) { seen.disconnect(); playFrom(true); }
      }, { threshold: 0.5 });
      seen.observe(mapEl);
    }
    drawPages();
    // ---------- the chapter pages: an atlas pair for each chapter, computed from the data ----------
    // The chapter's footprints (its places and the waypoints of its road routes) are grouped into clusters (single
    // linkage, 400 km). The main map frames the largest cluster in a conic equal-area projection fitted to it, with the
    // road routes and dots in full detail; a second cluster with at least 3 footprints gets a panel of its own beside it;
    // a world locator in the corner shows all of the chapter's routes (the long flights too) and the frames of the panels.
    // Clicking a map (or Enter) opens the same maps larger in a dialog.
    const RAD = Math.PI / 180;
    function km(a, b) {
      const p1 = a[1] * RAD, p2 = b[1] * RAD, dp = p2 - p1, dl = (b[0] - a[0]) * RAD;
      const h = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
      return 2 * 6371 * Math.asin(Math.sqrt(h));
    }
    function chapterAtlas(id) {
      const ents = D.entries.filter(function (e) { return e.ch === id; });
      const pts = [], seenPl = {};
      ents.forEach(function (e) {
        e.pl.forEach(function (pid) { if (!seenPl[pid]) { seenPl[pid] = 1; pts.push({ ll: D.places[pid].ll, pid: pid }); } });
        (e.r || []).forEach(function (r) { if (r.m === "ground") r.p.forEach(function (ll) { pts.push({ ll: ll }); }); });
      });
      const parent = pts.map(function (_, i) { return i; });
      const find = function (i) { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
      for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) if (km(pts[i].ll, pts[j].ll) < 400) parent[find(i)] = find(j);
      const groups = {};
      pts.forEach(function (p, i) { (groups[find(i)] = groups[find(i)] || []).push(p); });
      const clusters = Object.keys(groups).map(function (k) {
        const g = groups[k];
        return { pts: g, places: g.filter(function (p) { return p.pid; }).length, n: g.length };
      }).sort(function (a, b) { return b.places - a.places || b.n - a.n; });
      return { ents: ents, all: pts, main: clusters[0] || null, second: clusters.slice(1).find(function (c) { return c.n >= 3; }) || null };
    }
    function boxOf(cl) {
      const lons = cl.pts.map(function (p) { return p.ll[0]; }), lats = cl.pts.map(function (p) { return p.ll[1]; });
      let x0 = Math.min.apply(null, lons), x1 = Math.max.apply(null, lons), y0 = Math.min.apply(null, lats), y1 = Math.max.apply(null, lats);
      const padX = Math.max(1.2, (x1 - x0) * 0.12), padY = Math.max(0.9, (y1 - y0) * 0.12);
      x0 -= padX; x1 += padX; y0 -= padY; y1 += padY;
      return [x0, y0, x1, y1];
    }
    function localProjection(box, W, H) {
      const cx = (box[0] + box[2]) / 2, y0 = box[1], y1 = box[3];
      const p0 = y0 + (y1 - y0) / 6, p1 = y1 - (y1 - y0) / 6;
      return d3.geoConicEqualArea().parallels(Math.abs(p1 - p0) < 1 ? [((y0 + y1) / 2) - 1, ((y0 + y1) / 2) + 1] : [p0, p1]).rotate([-cx, 0])
        .fitExtent([[6, 6], [W - 6, H - 6]], { type: "MultiPoint", coordinates: [[box[0], y0], [box[2], y0], [box[0], y1], [box[2], y1], [cx, y0], [cx, y1]] });
    }
    function inBox(ll, box) { return ll[0] >= box[0] - 0.01 && ll[0] <= box[2] + 0.01 && ll[1] >= box[1] - 0.01 && ll[1] <= box[3] + 0.01; }
    function drawBaseInto(g, path, id) {
      const reg = function (f, code, cls) {
        const dd = path(f); if (!dd) return;
        const r = code && D.regions[code];
        const mine = r && r[1] === id;
        const n = el("path", { d: dd, class: "jr-reg" + (cls ? " " + cls : "") + (mine ? " is-visited" + (r[2] ? " is-inferred" : "") : "") }, g);
        if (mine) n.style.setProperty("--ch", "var(--ch-" + id + ")");
      };
      geo.countries.forEach(function (f) { reg(f, f.id, ""); });
      geo.china.forEach(function (f) { reg(f, f.properties.code, "jr-prov"); });
      (geo.states || []).forEach(function (f) { reg(f, usNames[f.properties.name] || "", "jr-state"); });
    }
    // one local panel (main or secondary): base, road routes in detail, short flights inside the frame, dots
    function localPanel(id, A, cl, W, H, big) {
      const box = boxOf(cl);
      const pj = localProjection(box, W, H);
      const path = d3.geoPath(pj);
      const svgEl = el("svg", { viewBox: "0 0 " + W + " " + H, class: "jr-mini", focusable: "false", "aria-hidden": "true" });
      el("rect", { x: 0, y: 0, width: W, height: H, class: "jr-mini-sea" }, svgEl);
      drawBaseInto(el("g", {}, svgEl), path, id);
      const gr = el("g", {}, svgEl);
      A.ents.forEach(function (e) {
        (e.r || []).forEach(function (r) {
          if (r.m === "ground") {
            const q = r.p.map(function (ll) { return pj(ll); });
            if (q.some(function (x) { return !x; }) || !r.p.some(function (ll) { return inBox(ll, box); })) return;
            if (r.lg) {   // the 2013 loop: leg by leg in its colours
              let from = 0;
              r.lg.forEach(function (leg) { el("path", { d: smooth(q, from, leg[0]), class: "jr-mini-route jr-m-ground", style: "stroke: " + leg[1] }, gr); from = leg[0]; });
            } else {
              el("path", { d: smooth(q), class: "jr-mini-route jr-m-ground", style: "stroke: var(--ch-" + id + ")" }, gr);
            }
          } else {
            for (let i = 0; i < r.p.length - 1; i++) {   // flights only when both ends are inside the frame (the long ones are in the locator)
              const a = r.p[i], b = r.p[i + 1];
              if (!inBox(a, box) || !inBox(b, box)) continue;
              const P = pj(a), Q = pj(b); if (!P || !Q) continue;
              const dx = Q[0] - P[0], dy = Q[1] - P[1], len = Math.hypot(dx, dy) || 1;
              let nx = -dy / len, ny = dx / len; if (ny > 0) { nx = -nx; ny = -ny; }
              const k = Math.min(0.2 * len, 60), C = [(P[0] + Q[0]) / 2 + nx * k, (P[1] + Q[1]) / 2 + ny * k];
              el("path", { d: "M" + P[0].toFixed(1) + "," + P[1].toFixed(1) + "Q" + C[0].toFixed(1) + "," + C[1].toFixed(1) + " " + Q[0].toFixed(1) + "," + Q[1].toFixed(1),
                class: "jr-mini-route jr-m-" + r.m, style: "stroke: var(--ch-" + id + ")" }, gr);
            }
          }
        });
      });
      const seen = {};
      A.ents.forEach(function (e) {
        e.pl.forEach(function (pid) {
          if (seen[pid]) return; seen[pid] = 1;
          const ll = D.places[pid].ll; if (!inBox(ll, box)) return;
          const q = pj(ll); if (!q) return;
          el("circle", { cx: q[0].toFixed(1), cy: q[1].toFixed(1), r: (D.places[pid].h ? 4.4 : 3.2) * (big ? 1.4 : 1), class: "jr-mini-dot" + (D.places[pid].h ? " is-home" : ""),
            style: "--ch: var(--ch-" + (D.places[pid].lc || id) + ")" }, gr);
        });
      });
      return { svg: svgEl, box: box };
    }
    // the world locator: every route of the chapter, and the frames of the panels
    function locator(id, A, boxes, W, H) {
      const lons = A.all.map(function (p) { return p.ll[0]; });
      A.ents.forEach(function (e) { (e.r || []).forEach(function (r) { r.p.forEach(function (ll) { lons.push(ll[0]); }); }); });
      const cx = (Math.min.apply(null, lons) + Math.max.apply(null, lons)) / 2;
      const pj = worldMaker().rotate([-(Math.abs(cx) > 120 ? 10 : cx), 0]).fitExtent([[2, 2], [W - 2, H - 2]], { type: "Sphere" });
      const path = d3.geoPath(pj);
      const svgEl = el("svg", { viewBox: "0 0 " + W + " " + H, class: "jr-loc", focusable: "false", "aria-hidden": "true" });
      el("rect", { x: 0, y: 0, width: W, height: H, class: "jr-mini-sea" }, svgEl);
      const g = el("g", {}, svgEl);
      geo.countries.forEach(function (f) { const dd = path(f); if (dd) el("path", { d: dd, class: "jr-loc-land" }, g); });
      geo.china.forEach(function (f) { const dd = path(f); if (dd) el("path", { d: dd, class: "jr-loc-land" }, g); });
      A.ents.forEach(function (e) {
        (e.r || []).forEach(function (r) {
          const dd = path({ type: "LineString", coordinates: r.p });
          if (dd) el("path", { d: dd, class: "jr-loc-route", style: "stroke: var(--ch-" + id + ")" }, g);
        });
      });
      boxes.forEach(function (b) {
        const ring = [];
        for (let t = 0; t <= 8; t++) ring.push([b[0] + (b[2] - b[0]) * t / 8, b[1]]);
        for (let t = 0; t <= 8; t++) ring.push([b[2], b[1] + (b[3] - b[1]) * t / 8]);
        for (let t = 0; t <= 8; t++) ring.push([b[2] - (b[2] - b[0]) * t / 8, b[3]]);
        for (let t = 0; t <= 8; t++) ring.push([b[0], b[3] - (b[3] - b[1]) * t / 8]);
        const dd = path({ type: "LineString", coordinates: ring });
        if (dd) el("path", { d: dd, class: "jr-loc-frame" }, g);
      });
      return svgEl;
    }
    function atlasInto(host, id, big) {
      const A = chapterAtlas(id);
      if (!A.main) return false;
      host.classList.toggle("has-second", !!A.second);
      const W = big ? 900 : 480, H = big ? 600 : 340;
      const mainWrap = document.createElement("div");
      mainWrap.className = "jr-atlas-main";
      const m = localPanel(id, A, A.main, W, H, big);
      mainWrap.appendChild(m.svg);
      const boxes = [m.box];
      let secWrap = null;
      if (A.second) {
        const sP = localPanel(id, A, A.second, big ? 520 : 300, H, big);
        secWrap = document.createElement("div");
        secWrap.className = "jr-atlas-second";
        secWrap.appendChild(sP.svg);
        boxes.push(sP.box);
      }
      const loc = document.createElement("div");
      loc.className = "jr-atlas-loc";
      loc.appendChild(locator(id, A, boxes, big ? 300 : 200, big ? 150 : 100));
      mainWrap.appendChild(loc);
      host.appendChild(mainWrap);
      if (secWrap) host.appendChild(secWrap);
      return true;
    }
    // the dialog that shows a chapter's maps larger (native modal dialog: focus stays inside, Escape closes it)
    let dlg = null, dlgFrom = null;
    function openAtlas(id, from) {
      if (!dlg) {
        dlg = document.createElement("dialog");
        dlg.className = "jr-dlg";
        dlg.setAttribute("aria-labelledby", "jr-dlg-h");
        dlg.innerHTML = '<div class="jr-dlg-head"><h2 id="jr-dlg-h"></h2><button type="button" class="jr-dlg-close" aria-label="Close">' +
          '<i class="bi bi-x-lg" aria-hidden="true"></i></button></div><div class="jr-dlg-body jr-atlas"></div>' +
          '<p class="jr-dlg-note">Main map: where most of the chapter happened. Corner: the whole world, with every route of the chapter and the frames of the maps. Routes are approximate.</p>';
        root.appendChild(dlg);   // inside the page root, so the chapter colours and map tokens apply
        dlg.querySelector(".jr-dlg-close").addEventListener("click", function () { dlg.close(); });
        dlg.addEventListener("close", function () { if (dlgFrom) dlgFrom.focus({ preventScroll: true }); });
        dlg.addEventListener("click", function (ev) { if (ev.target === dlg) dlg.close(); });   // a click on the backdrop
        dlg.addEventListener("keydown", function (ev) { if (ev.key === "Escape" && dlg.open) { ev.preventDefault(); dlg.close(); } });
      }
      const c = chapterOf[id];
      dlg.querySelector("#jr-dlg-h").textContent = c.n + " · " + c.w;
      const body = dlg.querySelector(".jr-dlg-body");
      while (body.firstChild) body.removeChild(body.firstChild);
      dlg.style.setProperty("--ch", "var(--ch-" + id + ")");
      atlasInto(body, id, true);
      dlgFrom = from;
      if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
      dlg.querySelector(".jr-dlg-close").focus({ preventScroll: true });
    }
    function drawPages() {
      const holders = root.querySelectorAll(".jr-pg-map[data-ch]");
      if (!holders.length) return;
      const go = function () {
        holders.forEach(function (h) {
          const id = h.getAttribute("data-ch");
          const btn = document.createElement("button");
          btn.type = "button"; btn.className = "jr-atlas jr-atlas-btn";
          btn.setAttribute("aria-haspopup", "dialog");
          btn.setAttribute("aria-label", "Open a larger map of the chapter " + chapterOf[id].n);
          if (!atlasInto(btn, id, false)) return;
          btn.addEventListener("click", function () { openAtlas(id, btn); });
          h.appendChild(btn);
          h.removeAttribute("aria-hidden");
          h.classList.add("is-drawn");
        });
      };
      loadUS().then(go, go);
    }

    let rt = null;
    window.addEventListener("resize", function () {
      window.clearTimeout(rt);
      rt = window.setTimeout(function () { if (mapEl.clientWidth !== lastW) draw(false); else if (!card.hidden) { const m = marks.find(function (x) { return x.key === openKey; }); if (m) placeCardBox(m.at); } }, 150);
    });
  }
})();
