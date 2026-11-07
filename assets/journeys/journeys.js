// journeys.js — the Journeys page (journeys.qmd; v2, 2026-11-05). Loaded only by that page.
// The markup, the chapter list and the data (<script id="jr-data">) come from scripts/build_journeys.py (_journeys.qmd);
// styles in assets/journeys/journeys.css. Without JS the map box stays hidden and the chapter list is the content.
//   1. "Firsts only": one toggle (in the map's toolbar and above the chapters) shows only the firsts and the milestones.
//   2. Tile grids: the year of the first visit on hover, focus or tap; one Tab stop per grid, arrow keys move.
//   3. Map: an atlas drawn as SVG with d3-geo and topojson-client. Map data, pinned and loaded from jsDelivr with SRI when the
//      section (or the chapter pages) nears the viewport: China (its 34 provincial-level divisions and the South China Sea
//      inset) from the China standard map in Apache ECharts 4.9.0 (map/json/china.json and the inset in
//      lib/coord/geo/fix/nanhai.js, Apache-2.0); other countries from Natural Earth via world-atlas 2.0.2 (1:110m, and
//      1:50m once a map is zoomed in), China and Taiwan left out underneath so China's outline is the standard one in every
//      view; U.S. states from us-atlas 3.0.1 (loaded when the U.S. view opens or a map is zoomed into the United States).
//      The world view uses the Patterson cylindrical projection (d3-geo-projection 4.0.0), central meridian 10°E, 55°S to
//      78°N. Places visited are filled in the colour of the chapter of the first visit. Places are dots (rings for places
//      lived), journeys are lines (smooth curves through waypoints; flights and trips whose way of travel is not recorded
//      as gentle arcs). A year slider with Play adds the footprints year by year, drawing each new route stroke by stroke.
//      Clicking a dot or a line opens a small card. Every map zooms and pans (d3-zoom 3): see "zoom and pan" below.
//      Keyboard: one Tab stop on the footprints; the arrow keys move through them in time order, Enter opens the card,
//      + and − zoom, Escape closes it. If the libraries cannot load, the map box is hidden again.
//   4. Chapter pages: one zoomable world map per chapter, framed on the chapter's main cluster, with chips that zoom to
//      its regions or the whole chapter.
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
         y ? "First visit " + esc(y) : "Not yet");
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
    // finer land (Natural Earth 1:50m), drawn once a map is zoomed in past about 4 times the world view (the chapter
    // maps open there); fetched once, the first time it is needed
    world50: { url: CDN + "world-atlas@2.0.2/countries-50m.json", sri: "sha256-BDQs3B4wFrzX2xYw3pVoTWe3n+PIxGAyHoeu9GlQI5Q=" },
  };
  // zoom and pan for every map: d3-zoom 3 and the modules it needs, executed in this order (optional: without them the
  // maps stay still)
  const ZOOM_LIBS = [
    { src: CDN + "d3-dispatch@3.0.1/dist/d3-dispatch.min.js", sri: "sha256-lLO722uY3BMloVdisFEBPoJTmZsOBDayfR2he5UroK8=" },
    { src: CDN + "d3-selection@3.0.0/dist/d3-selection.min.js", sri: "sha256-RdqrnPZ3kBvK4QLz8jyikw2zwPuP+ePb7Qh9nE3pIco=" },
    { src: CDN + "d3-color@3.1.0/dist/d3-color.min.js", sri: "sha256-oSY5AQFjIwuMEw++uSo6SbtfaYmlZtNmTXWVIttFhIk=" },
    { src: CDN + "d3-interpolate@3.0.1/dist/d3-interpolate.min.js", sri: "sha256-v8Mh5MPzs6rciM/hXMteRDq/6t74t1xltBwzpNeKmK4=" },
    { src: CDN + "d3-ease@3.0.1/dist/d3-ease.min.js", sri: "sha256-5goe11ChrRON0Y6NP0YyOBE8+/fYloWhPRm9TgSNw84=" },
    { src: CDN + "d3-timer@3.0.1/dist/d3-timer.min.js", sri: "sha256-kRztowXwFLa1PKaNXIlqmjh9oSDP1WpCGixgzKL8mzY=" },
    { src: CDN + "d3-transition@3.0.1/dist/d3-transition.min.js", sri: "sha256-wkjZf2wTGvf0oSo/8fLtg/HMbA4X/HZKGYtu5FLmYhs=" },
    { src: CDN + "d3-drag@3.0.0/dist/d3-drag.min.js", sri: "sha256-FYSZ+oze70WeKrnQGvIrq9ADxCOiEvskCIwPg4hkASs=" },
    { src: CDN + "d3-zoom@3.0.0/dist/d3-zoom.min.js", sri: "sha256-T9zpuDC3giXFjiclgpYIQlPEGl6vjK2b2cz+MCXa8c8=" },
  ];
  box.hidden = false;

  function loadScript(lib, inOrder) {   // inOrder: downloaded in parallel, executed in the order added
    return new Promise(function (resolve, reject) {
      const s = document.createElement("script");
      s.src = lib.src; s.integrity = lib.sri; s.crossOrigin = "anonymous"; s.referrerPolicy = "no-referrer";
      if (inOrder) s.async = false;
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

  // world-atlas countries, minus the parts the China standard map draws itself (China, Taiwan, and at 1:50m Hong Kong
  // and Macao); France's overseas parts are drawn but not coloured (only Paris was visited), so they become a feature
  // of their own without a code
  function countriesOf(topo) {
    const d3 = window.d3;
    return window.topojson.feature(topo, topo.objects.countries).features
      .filter(function (f) { return ["156", "158", "344", "446"].indexOf(f.id) < 0; })
      .reduce(function (acc, f) {
        if (f.id !== "250" || f.geometry.type !== "MultiPolygon") { acc.push(f); return acc; }
        const home = [], away = [];
        f.geometry.coordinates.forEach(function (poly) {
          const c = d3.geoCentroid({ type: "Polygon", coordinates: poly });
          (c[0] > -10 && c[0] < 20 && c[1] > 35 ? home : away).push(poly);   // metropolitan France and Corsica
        });
        acc.push({ type: "Feature", id: "250", properties: f.properties, geometry: { type: "MultiPolygon", coordinates: home } });
        if (away.length) acc.push({ type: "Feature", id: "", properties: {}, geometry: { type: "MultiPolygon", coordinates: away } });
        return acc;
      }, []);
  }

  function start() {
    const libs = LIBS.reduce(function (p, lib) { return p.then(function () { return loadScript(lib); }); }, Promise.resolve());
    Promise.race([libs, timeout(20000)]).then(function () {
      if (!(window.d3 && window.d3.geoPath && window.topojson)) throw new Error("libraries missing");
      const extra = [loadScript(PROJ_LIB)].concat(ZOOM_LIBS.map(function (lib) { return loadScript(lib, true); }))
        .map(function (p) { return p.catch(function () { return null; }); });
      return Promise.race([Promise.all(extra), timeout(15000)]).catch(function () { return null; });
    }).then(function () {
      return Promise.all([fetchData(DATA.world).catch(function () { return null; }), fetchData(DATA.china).catch(function () { return null; }),
                          fetchData(DATA.nanhai).catch(function () { return null; })]);
    }).then(function (res) {
      const d3 = window.d3;
      const geo = { countries: [], china: [], nanhai: null, states: null };
      if (res[0]) geo.countries = countriesOf(res[0]);
      if (res[1]) geo.china = decodeChina(d3, res[1]);
      if (res[2]) geo.nanhai = nanhaiFeature(d3, res[2]);
      init(geo);
    }).catch(function () { box.hidden = true; root.querySelectorAll(".jr-pg-map").forEach(function (h) { h.hidden = true; }); });
  }
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(function (es) {
      if (es.some(function (e) { return e.isIntersecting; })) { io.disconnect(); start(); }
    }, { rootMargin: "300px 0px" });
    io.observe(box);
    const pagesEl = root.querySelector("#jr-pages");   // the chapter maps need the same data: a visit straight to them starts it too
    if (pagesEl) io.observe(pagesEl);
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
    const n3 = function (v) { return v.toFixed(3); };   // map coordinates keep 3 decimals: they are drawn up to some 500 times larger

    // ---------- zoom transforms: d3-zoom's, or plain objects when it did not load (the maps then stay still) ----------
    const ZOOM = typeof d3.zoom === "function" && typeof d3.select === "function" && !!(d3.selection && d3.selection.prototype.transition);
    const ID = ZOOM ? d3.zoomIdentity : { k: 1, x: 0, y: 0 };
    const tOf = function (k, x, y) { return ZOOM ? d3.zoomIdentity.translate(x, y).scale(k) : { k: k, x: x, y: y }; };
    const tApply = function (t, p) { return [t.x + t.k * p[0], t.y + t.k * p[1]]; };
    const tInvert = function (t, p) { return [(p[0] - t.x) / t.k, (p[1] - t.y) / t.k]; };
    const tSame = function (a, b) { return Math.abs(a.k - b.k) < 1e-6 && Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01; };
    const tStr = function (t) { return "translate(" + n3(t.x) + "," + n3(t.y) + ") scale(" + t.k.toFixed(6) + ")"; };
    const coarse = !!(window.matchMedia && window.matchMedia("(hover: none) and (pointer: coarse)").matches);

    mapEl.classList.remove("is-loading");
    const svg = el("svg", { class: "jr-svg", role: "group", "aria-label": "Map of my journeys: places visited are coloured, places are dots and journeys are lines. The chapters below give the same places as text." }, mapEl);
    const defs = el("defs", {}, svg);
    const gZoom = el("g", {}, svg);   // the land, in the coordinates of the whole view, zoomed as one group
    const gBase = el("g", { class: "jr-base", "aria-hidden": "true" }, gZoom);
    const gDetail = el("g", { class: "jr-base", "aria-hidden": "true" }, gZoom);
    // routes and dots are drawn in screen pixels for the zoom of the moment (curves stay smooth at any zoom); during a
    // gesture they follow the land, and they are drawn again when it ends
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
    let marks = [], focusIdx = 0, shown = new Set(), shownRegions = new Set(), proj = null, openKey = null, lastW = 0, lastH = 0, maskSeq = 0, animEnd = 0;
    // zt: the zoom now; tR: the zoom the dots were last placed for; frameKey: the view and size the zoom belongs to
    let zt = ID, tR = ID, frameKey = "", bcMain = new Map(), Z = null, routeEls = [];

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
    function kindOf(view) { return view === "us" ? "us" : view === "china" ? "china" : "world"; }
    function zoomed(p, t) {   // a projection with a zoom applied: its output in screen pixels
      const tr = p.translate();
      return p.scale(p.scale() * t.k).translate([t.x + t.k * tr[0], t.y + t.k * tr[1]]);
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

    // ---------- geometry (pj: the projection of the map drawn) ----------
    function smooth(pts, from, to) {   // Catmull-Rom spline through the points, as cubic Beziers (optionally segments from..to only)
      if (pts.length < 2) return "";
      from = from || 0; to = to == null ? pts.length - 1 : to;
      let d = "M" + n3(pts[from][0]) + "," + n3(pts[from][1]);
      for (let i = from; i < to; i++) {
        const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
        const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
        const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
        d += "C" + n3(c1[0]) + "," + n3(c1[1]) + " " + n3(c2[0]) + "," + n3(c2[1]) + " " + n3(p2[0]) + "," + n3(p2[1]);
      }
      return d;
    }
    // flights (and unknown ways of travel): one gentle arc per leg, bowed to the north; across the date line the great
    // circle, cut at the map's edge (gc false, as in the U.S. view, whose insets would catch it: left out)
    function arcs(r, pj, path, gc) {
      let d = "";
      for (let i = 0; i < r.p.length - 1; i++) {
        const a = r.p[i], b = r.p[i + 1];
        if (Math.abs(a[0] - b[0]) > 180) {
          if (gc) d += path({ type: "LineString", coordinates: [a, b] }) || "";
          continue;
        }
        const A = pj(a), B = pj(b);
        if (!A || !B) continue;
        const dx = B[0] - A[0], dy = B[1] - A[1], len = Math.hypot(dx, dy);
        if (len < 0.02) continue;
        let nx = -dy / len, ny = dx / len;
        if (ny > 0) { nx = -nx; ny = -ny; }
        const k = Math.min(0.2 * len, 90);
        const C = [(A[0] + B[0]) / 2 + nx * k, (A[1] + B[1]) / 2 + ny * k];
        d += "M" + n3(A[0]) + "," + n3(A[1]) + "Q" + n3(C[0]) + "," + n3(C[1]) + " " + n3(B[0]) + "," + n3(B[1]);
      }
      return d;
    }
    function routeD(r, pj, path, gc) {
      if (r.m === "ground") return smooth(r.p.map(function (p) { return pj(p); }).filter(Boolean));
      return arcs(r, pj, path, gc);
    }
    // a route drawn leg by leg in its own colours (the 2013 loop, as Henry's route image shows it): [{d, color}]
    function legsD(r, pj) {
      const pts = r.p.map(function (p) { return pj(p); });
      if (pts.some(function (q) { return !q; })) return null;
      let from = 0;
      return r.lg.map(function (leg) { const d = smooth(pts, from, leg[0]); from = leg[0]; return { d: d, color: leg[1] }; });
    }

    // ---------- the land: a background for the whole view, and detail around the screen once zoomed in ----------
    // The background is the view at its own scale (the world: 1:110m land, China as one country, the United States as one
    // country; the China view: provinces and the South China Sea inset; the U.S. view: the states). Zoomed in past these
    // factors (1 = the whole view), a detail layer is drawn over it for the screen and half a screen around it: a
    // sea-coloured frame first (so the coarser background never shows through), then the provinces of the China standard
    // map and the U.S. states (from 2.5), and the 1:50m land (from 4; around the China view from 2). Only the parts of
    // each country, province or state that meet the frame are drawn, so the zoom stays light.
    const LOD = { reg: 2.5, fine: 4, chinaFine: 2 };
    let w50Loading = null, usLoading = null;
    function loadWorld50() {   // the finer land, loaded once; if it cannot be loaded, the maps keep the 1:110m land
      if (geo.countries50 !== undefined) return Promise.resolve();
      if (!w50Loading) {
        w50Loading = fetchData(DATA.world50).then(function (topo) { geo.countries50 = countriesOf(topo); })
          .catch(function () { geo.countries50 = null; });
      }
      return w50Loading;
    }
    function loadUS(busy) {   // busy: the U.S. view waits for it ("Loading map" over the map)
      if (geo.states) return Promise.resolve();
      if (busy) mapEl.classList.add("is-loading");
      if (!usLoading) {
        usLoading = fetchData(DATA.us).then(function (topo) {
          geo.states = window.topojson.feature(topo, topo.objects.states).features;
        }).catch(function () { geo.states = []; }).then(function () { mapEl.classList.remove("is-loading"); draw(false); });
      }
      return usLoading;
    }
    function regionNode(f, code, path, parent, cls, ctx) {   // ctx: {fill(code) -> region or null, animate, seen, next, titles}
      const d = path(f);
      if (!d) return;
      const r = code ? ctx.fill(code) : null;
      const n = el("path", { d: d, class: "jr-reg" + (cls ? " " + cls : "") + (r ? " is-visited" + (r[2] ? " is-inferred" : "") : "") }, parent);
      if (r) {
        n.style.setProperty("--ch", "var(--ch-" + r[1] + ")");
        if (ctx.animate && ctx.seen && !ctx.seen.has(code) && !reduceMotion) n.classList.add("is-new");
        if (ctx.next) ctx.next.add(code);
      }
      if (ctx.titles) {
        const name = code && D.names[code];
        if (name) el("title", {}, n).textContent = name + (r ? (code === D.home ? ", home" : ", first visit " + r[0] + (r[2] ? " (passed through)" : "")) : "");
      }
    }
    function stateCode(f) { return usNames[f.properties.name] || ""; }
    function drawBg(g, path, kind, ctx) {
      while (g.firstChild) g.removeChild(g.firstChild);
      if (kind === "us") {
        (geo.states || []).forEach(function (f) { regionNode(f, stateCode(f), path, g, "", ctx); });
        return;
      }
      // other countries (Natural Earth), China and Taiwan left out
      geo.countries.forEach(function (f) { regionNode(f, f.id || "", path, g, "", ctx); });
      if (kind === "world") {
        // China from the standard map as one country: a border pass, then the fills on top (no inner borders)
        const gc = el("g", { class: "jr-china-world" }, g);
        geo.china.forEach(function (f) { const d = path(f); if (d) el("path", { d: d, class: "jr-reg jr-cn-edge" }, gc); });
        geo.china.forEach(function (f) { regionNode(f, "156", path, gc, "jr-cn-fill", ctx); });
      } else {
        geo.china.forEach(function (f) { regionNode(f, f.properties.code, path, g, "jr-prov", ctx); });
        if (geo.nanhai) { const d = path(geo.nanhai); if (d) el("path", { d: d, class: "jr-nanhai" }, g); }
      }
    }
    // bc: per map, the bounds of every polygon of every feature in that map's projection (made once per projection)
    function drawDetail(g, path, kind, t, W, H, ctx, bc, again) {
      while (g.firstChild) g.removeChild(g.firstChild);
      if (kind === "us" || t.k < (kind === "china" ? LOD.chinaFine : LOD.reg)) return;
      const a = tInvert(t, [-W * 0.5, -H * 0.5]), b = tInvert(t, [W * 1.5, H * 1.5]);
      const clip = function (f) {   // the feature with only its polygons that meet the frame (null if none)
        let parts = bc.get(f);
        if (!parts) {
          const gm = f.geometry;
          const polys = !gm ? [] : gm.type === "Polygon" ? [gm.coordinates] : gm.type === "MultiPolygon" ? gm.coordinates : [];
          parts = polys.map(function (rings) { return { c: rings, bb: path.bounds({ type: "Polygon", coordinates: rings }) }; });
          bc.set(f, parts);
        }
        const near = parts.filter(function (p) { return !(p.bb[1][0] < a[0] || p.bb[0][0] > b[0] || p.bb[1][1] < a[1] || p.bb[0][1] > b[1]); });
        if (!near.length) return null;
        return near.length === parts.length ? f : { type: "Feature", id: f.id, properties: f.properties,
          geometry: { type: "MultiPolygon", coordinates: near.map(function (p) { return p.c; }) } };
      };
      el("rect", { x: n3(a[0]), y: n3(a[1]), width: n3(b[0] - a[0]), height: n3(b[1] - a[1]), class: "jr-zsea" }, g);
      const fine = t.k >= (kind === "china" ? LOD.chinaFine : LOD.fine);
      if (fine && geo.countries50 === undefined) loadWorld50().then(again);
      const land = (fine && geo.countries50) || geo.countries;
      const states = kind === "world" && geo.states && geo.states.length ? geo.states : null;
      let usHere = false;
      land.forEach(function (f) {
        const c = clip(f);
        if (!c) return;
        if (f.id === "840" && kind === "world") { usHere = true; if (states) return; }   // the states draw the United States here
        regionNode(c, f.id || "", path, g, "", ctx);
      });
      geo.china.forEach(function (f) { const c = clip(f); if (c) regionNode(c, f.properties.code, path, g, "jr-prov", ctx); });
      if (kind === "china" && geo.nanhai && clip(geo.nanhai)) { const d = path(geo.nanhai); if (d) el("path", { d: d, class: "jr-nanhai" }, g); }
      if (states) states.forEach(function (f) { const c = clip(f); if (c) regionNode(c, stateCode(f), path, g, "jr-state", ctx); });
      else if (usHere && !geo.states) loadUS(false).then(again);
    }

    // ---------- zoom and pan (d3-zoom) ----------
    // The land and the routes are one group, transformed during a gesture; dots and labels move with it and are placed
    // again, with the detail layer, when the gesture ends. + / − / reset sit in a corner. A plain mouse wheel scrolls the
    // page until the map is clicked (pinching on a trackpad zooms at once); on touch screens two fingers zoom, and one
    // finger pans only after a tap on the map ("Tap to explore"), so the page always scrolls. Escape leaves the map.
    const zmaps = [];
    document.addEventListener("pointerdown", function (ev) { zmaps.forEach(function (z) { if (!z.host.contains(ev.target)) z.calm(); }); }, true);
    const zSeen = "IntersectionObserver" in window ? new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (!e.isIntersecting) zmaps.forEach(function (z) { if (z.host === e.target) z.calm(); }); });
    }) : null;
    function zoomer(o) {   // o: {host, svg, g, keys (the host takes + − 0 and the arrows), homeLabel, home(), onMove(t, byUser), onEnd(t)}
      if (!ZOOM) return null;
      const host = o.host, sel = d3.select(o.svg);
      let t = ID, W = 1, H = 1, active = false, exploring = false, quiet = 0, toastTimer = null, tp = null;
      host.classList.add("jr-zoomable");
      const ctl = document.createElement("div");
      ctl.className = "jr-zctl";
      ctl.innerHTML = '<button type="button" class="jr-zbtn" data-z="in" aria-label="Zoom in"><i class="bi bi-plus-lg" aria-hidden="true"></i></button>' +
        '<button type="button" class="jr-zbtn" data-z="out" aria-label="Zoom out"><i class="bi bi-dash-lg" aria-hidden="true"></i></button>' +
        '<button type="button" class="jr-zbtn" data-z="home" aria-label="' + esc(o.homeLabel) + '"><i class="bi bi-arrow-counterclockwise" aria-hidden="true"></i></button>';
      host.appendChild(ctl);
      const pill = document.createElement("button");   // shown on touch screens only (CSS)
      pill.type = "button"; pill.className = "jr-zpill";
      host.appendChild(pill);
      const toast = document.createElement("div");
      toast.className = "jr-ztoast"; toast.setAttribute("aria-hidden", "true");
      host.appendChild(toast);
      const zoom = d3.zoom()
        .filter(function (ev) {
          if (ev.type === "wheel") return ev.ctrlKey || active;
          if (ev.type === "touchstart") return exploring || ev.touches.length > 1;
          if (ev.type === "dblclick") return !(ev.target.closest && ev.target.closest(".jr-mark"));
          return !ev.ctrlKey && !ev.button;
        })
        .on("zoom", function (ev) { t = ev.transform; o.g.setAttribute("transform", tStr(t)); o.onMove(t, !!ev.sourceEvent); })
        .on("end", function () { if (!quiet) o.onEnd(t); });
      sel.call(zoom);
      const constrain = function (T) { return zoom.constrain()(T, [[0, 0], [W, H]], [[0, 0], [W, H]]); };
      const api = {
        host: host,
        bounds: function (w, h, kMax) { W = w; H = h; zoom.extent([[0, 0], [w, h]]).translateExtent([[0, 0], [w, h]]).scaleExtent([1, kMax]); },
        set: function (T) { quiet++; sel.interrupt(); sel.call(zoom.transform, constrain(T)); quiet--; },   // at once, no "end" (the caller lays out)
        go: function (T, ms) {
          T = constrain(T);
          if (ms && !reduceMotion) sel.transition().duration(ms).call(zoom.transform, T); else sel.call(zoom.transform, T);
        },
        by: function (f, p) {
          p = p || [W / 2, H / 2];
          if (!reduceMotion) sel.transition().duration(250).call(zoom.scaleBy, f, p); else sel.call(zoom.scaleBy, f, p);
        },
        pan: function (dx, dy, ms) {
          ms = ms == null ? 250 : ms;
          if (ms && !reduceMotion) sel.transition().duration(ms).call(zoom.translateBy, dx / t.k, dy / t.k);
          else sel.call(zoom.translateBy, dx / t.k, dy / t.k);
        },
        center: function (p) { api.pan(W / 2 - p[0], H / 2 - p[1], 350); },
        calm: function () { setActive(false); if (exploring) setExplore(false); },
      };
      ctl.addEventListener("click", function (ev) {
        const b = ev.target.closest && ev.target.closest(".jr-zbtn");
        if (!b) return;
        const z = b.getAttribute("data-z");
        if (z === "in") api.by(1.6); else if (z === "out") api.by(1 / 1.6); else api.go(o.home(), 500);
      });
      function setActive(on) { active = on; host.classList.toggle("is-active", on); }
      function setExplore(on) {
        exploring = on;
        host.classList.toggle("is-exploring", on);
        pill.setAttribute("aria-pressed", on ? "true" : "false");
        pill.innerHTML = on ? '<i class="bi bi-check-lg" aria-hidden="true"></i>Done' : '<i class="bi bi-hand-index" aria-hidden="true"></i>Tap to explore';
      }
      setExplore(false);
      pill.addEventListener("click", function () { setExplore(!exploring); });
      host.addEventListener("pointerdown", function (ev) { if (ev.pointerType === "touch") tp = [ev.clientX, ev.clientY, Date.now()]; else setActive(true); });
      host.addEventListener("pointercancel", function () { tp = null; });   // the browser took the touch (the page scrolls)
      host.addEventListener("pointerup", function (ev) {
        if (ev.pointerType !== "touch" || !tp) return;
        const still = Math.hypot(ev.clientX - tp[0], ev.clientY - tp[1]) < 10 && Date.now() - tp[2] < 600;
        tp = null;
        if (still && !exploring && !(ev.target.closest && ev.target.closest(".jr-mark, .jr-zctl, .jr-zpill, .jr-card"))) setExplore(true);
      });
      host.addEventListener("focusin", function () { setActive(true); });
      host.addEventListener("focusout", function (ev) { if (!host.contains(ev.relatedTarget)) setActive(false); });
      host.addEventListener("wheel", function (ev) {
        if (active || ev.ctrlKey || coarse) return;
        toast.textContent = "Click the map to zoom with the scroll wheel";
        toast.classList.add("is-on");
        window.clearTimeout(toastTimer);
        toastTimer = window.setTimeout(function () { toast.classList.remove("is-on"); }, 1500);
      }, { passive: true });
      host.addEventListener("keydown", function (ev) {
        if (ev.altKey || ev.metaKey || ev.ctrlKey) return;
        const k = ev.key;
        if (k === "Escape") {   // leave the map
          api.calm();
          const a = document.activeElement;
          if (a && host.contains(a) && a.blur) a.blur();
          return;
        }
        if (!o.keys || ev.target !== host) return;
        const step = ev.shiftKey ? 0.45 : 0.2;
        if (k === "+" || k === "=") api.by(1.6);
        else if (k === "-" || k === "_") api.by(1 / 1.6);
        else if (k === "0") api.go(o.home(), 400);
        else if (k === "ArrowLeft") api.pan(W * step, 0);
        else if (k === "ArrowRight") api.pan(-W * step, 0);
        else if (k === "ArrowUp") api.pan(0, H * step);
        else if (k === "ArrowDown") api.pan(0, -H * step);
        else return;
        ev.preventDefault(); ev.stopPropagation();
      });
      zmaps.push(api);
      if (zSeen) zSeen.observe(host);
      return api;
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
      return '<span class="jr-tag">transit</span>';
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
        '<p class="jr-c-note">' + esc(chapterOf[e.ch].n) + " years · about " + (Math.round(km / 10) * 10).toLocaleString("en-US") + " km</p>";
    }
    function openCard(m, viaKeyboard) {
      openKey = m.key;
      const data = collect();
      card.innerHTML = '<button type="button" class="jr-c-close" aria-label="Close"><i class="bi bi-x-lg" aria-hidden="true"></i></button>' +
        (m.kind === "place" ? placeCard(m.pid, data.placeVisits[m.pid] || []) : routeCard(m.e));
      card.setAttribute("aria-labelledby", "jr-card-h");
      card.style.setProperty("--ch", "var(--ch-" + m.ch + ")");
      card.hidden = false;
      card.classList.remove("is-moving");
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
      card.classList.remove("is-moving");
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
    function sizeHit(m) {   // a phone's 24 px touch target at the middle of a route
      if (!m.hit || !m.first) return;
      const L = m.first.getTotalLength ? m.first.getTotalLength() : 0;
      const pm = L ? m.first.getPointAtLength(L / 2) : { x: m.at[0], y: m.at[1] };
      m.hit.setAttribute("x", (pm.x - 12).toFixed(1)); m.hit.setAttribute("y", (pm.y - 12).toFixed(1));
    }
    // the dots on the screen for the zoom now; dots that would sit on top of each other (Abu Dhabi and Dubai at world
    // scale) are nudged apart a little, so every place keeps a dot of its own that can be seen and clicked
    function placeMarks() {
      const W = lastW;
      const ps = marks.filter(function (m) { return m.kind === "place"; });
      ps.forEach(function (m) { m.s = tApply(zt, m.b); });
      const gapPx = W < 576 ? 6 : 8;
      for (let round = 0; round < 8; round++) {
        let moved = false;
        for (let a = 0; a < ps.length; a++) {
          for (let b = a + 1; b < ps.length; b++) {
            const A = ps[a].s, B = ps[b].s;
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
      ps.forEach(function (m) { m.at = m.s; m.g.setAttribute("transform", "translate(" + m.s[0].toFixed(1) + "," + m.s[1].toFixed(1) + ")"); });
      marks.forEach(function (m) { if (m.kind === "route") { m.s = tApply(zt, m.b); m.at = m.s; sizeHit(m); } });
      tR = zt;
    }
    function draw(animate) {
      const W = mapEl.clientWidth;
      animEnd = 0;
      if (!W) return 0;
      if (state.view === "us" && !geo.states) loadUS(true);
      const H = heightFor(W);
      mapEl.style.height = H + "px";
      lastW = W; lastH = H;
      const key = state.view + ":" + W + "x" + H;
      if (key !== frameKey) {   // a new view or size: the zoom starts again from the whole view
        frameKey = key; bcMain = new Map(); zt = ID; tR = ID;
        if (Z) { Z.bounds(W, H, state.view === "world" ? 80 : 16); Z.set(ID); } else gZoom.removeAttribute("transform");
      }
      proj = projection(state.view, W, H);
      const path = d3.geoPath(proj);
      svg.setAttribute("viewBox", "0 0 " + W + " " + H);
      svg.setAttribute("width", W); svg.setAttribute("height", H);
      while (defs.firstChild) defs.removeChild(defs.firstChild);
      const ctx = { fill: region, animate: animate, seen: shownRegions, next: new Set(), titles: true };
      drawBg(gBase, path, kindOf(state.view), ctx);
      drawDetail(gDetail, path, kindOf(state.view), zt, W, H, ctx, bcMain, relayout);
      shownRegions = ctx.next;
      while (gRoutes.firstChild) gRoutes.removeChild(gRoutes.firstChild);
      while (gDots.firstChild) gDots.removeChild(gDots.firstChild);
      const data = collect();
      const next = new Set();
      marks = [];
      const inView = function (pt) { return pt && pt[0] >= -2 && pt[0] <= W + 2 && pt[1] >= -2 && pt[1] <= H + 2; };   // in the whole view
      const gc = state.view !== "us";
      const pz = zoomed(projection(state.view, W, H), zt), pathZ = d3.geoPath(pz);
      gRoutes.removeAttribute("transform");
      routeEls = [];
      let stagger = 0;

      data.ents.forEach(function (e) {
        if (!e.r) return;
        const ds = e.r.map(function (r) { return { r: r, d: routeD(r, pz, pathZ, gc) }; }).filter(function (x) { return x.d; });
        if (!ds.length) return;
        const pts = [];
        e.r.forEach(function (r) { r.p.forEach(function (p) { const q = proj(p); if (inView(q)) pts.push(q); }); });
        if (!pts.length) return;
        const key = "r:" + e.id;
        const fresh = animate && !shown.has(key) && !reduceMotion;
        // a route drawn smaller than a fingertip on a phone stays as a picture only (its places and the list carry it)
        const tiny = W < 576 && (function () { const xs = pts.map(function (q) { return q[0] * zt.k; }), ys = pts.map(function (q) { return q[1] * zt.k; });
          return Math.max.apply(null, xs) - Math.min.apply(null, xs) < 24 && Math.max.apply(null, ys) - Math.min.apply(null, ys) < 24; })();
        if (tiny) {
          const deco = el("g", { class: "jr-route is-deco", "aria-hidden": "true", style: "--ch: var(--ch-" + e.ch + ")" }, gRoutes);
          ds.forEach(function (x) { routeEls.push({ el: el("path", { class: "jr-vis jr-m-" + x.r.m, d: x.d }, deco), r: x.r, leg: -1 }); });
          next.add(key);
          return;
        }
        const g = el("g", { class: "jr-mark jr-route", tabindex: "-1", role: "button", style: "--ch: var(--ch-" + e.ch + ")",
          "aria-label": e.w + ": " + e.t + " (journey)" }, gRoutes);
        // on phones every route also gets a 24 px touch target at its middle
        const hit = W < 576 ? el("rect", { class: "jr-hit jr-hit-box", width: 24, height: 24 }, g) : null;
        let first = null;
        ds.forEach(function (x) {
          const h = el("path", { class: "jr-hit", d: x.d }, g);
          routeEls.push({ el: h, r: x.r, leg: -1 });
          if (!first) first = h;
          const legs = x.r.lg && legsD(x.r, pz);
          if (legs) {   // leg by leg, each in its colour; during Play they draw one after another, as one stroke in 1.7 s
            const vs = legs.map(function (leg, k) {
              const v = el("path", { class: "jr-vis jr-m-" + x.r.m + " jr-leg", d: leg.d, style: "stroke: " + leg.color }, g);
              routeEls.push({ el: v, r: x.r, leg: k });
              return v;
            });
            if (fresh) {
              const lens = vs.map(function (v) { return v.getTotalLength ? v.getTotalLength() : 1; });
              const total = lens.reduce(function (a, b) { return a + b; }, 0) || 1;
              let t = stagger * 320;
              vs.forEach(function (v, k) { const ms = Math.max(60, 3400 * lens[k] / total); drawIn(v, legs[k].d, t, W, H, ms, "linear"); t += ms; });
            }
            return;
          }
          const v = el("path", { class: "jr-vis jr-m-" + x.r.m, d: x.d }, g);
          routeEls.push({ el: v, r: x.r, leg: -1 });
          if (fresh) drawIn(v, x.d, stagger * 320, W, H);
        });
        if (fresh) stagger++;
        next.add(key);
        marks.push({ kind: "route", key: key, e: e, ch: e.ch, g: g, b: pts[0], at: tApply(zt, pts[0]), order: e.i, sub: 0, hit: hit, first: first });
      });

      Object.keys(data.placeVisits).forEach(function (pid) {
        const p = D.places[pid], q = proj(p.ll);
        if (!inView(q)) return;
        const visits = data.placeVisits[pid];
        const first = visits[0];
        const key = "p:" + pid;
        const label = p.n + (p.w ? ", " + p.w : "") + " — " + visits.map(function (e) { return e.w; }).filter(function (w, i, a) { return a.indexOf(w) === i; }).join("; ");
        const g = el("g", { class: "jr-mark jr-dot" + (p.h ? " is-home" : "") + (p.s ? " is-peak" : ""), tabindex: "-1", role: "button",
          style: "--ch: var(--ch-" + (p.lc || first.ch) + ")", "aria-label": label }, gDots);
        el("circle", { class: "jr-hit", r: 12 }, g);
        if (p.s) el("path", { class: "jr-vis", d: "M0,-6.2 L5.6,3.9 L-5.6,3.9 Z" }, g);   // a summit: a small triangle
        else el("circle", { class: "jr-vis", r: p.h ? 5.5 : (W < 576 ? 3.6 : 4.2) }, g);
        if (animate && !shown.has(key) && !reduceMotion) { g.classList.add("is-new"); g.style.setProperty("--delay", Math.min(stagger, 6) * 320 + "ms"); }
        next.add(key);
        marks.push({ kind: "place", key: key, pid: pid, ch: first.ch, g: g, b: q, at: null, order: first.i, sub: 1 });
      });
      placeMarks();
      Array.prototype.slice.call(gDots.querySelectorAll(".is-home")).forEach(function (n) { gDots.appendChild(n); });
      shown = next;

      marks.sort(function (a, b) { return a.order - b.order || a.sub - b.sub || (a.b[0] - b.b[0]); });
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
    // after a zoom: the detail layer for the new frame, the dots placed again, the card beside its footprint
    function relayout() {
      if (!proj) return;
      drawDetail(gDetail, d3.geoPath(proj), kindOf(state.view), zt, lastW, lastH, { fill: region, titles: true }, bcMain, relayout);
      const pz = zoomed(projection(state.view, lastW, lastH), zt), pathZ = d3.geoPath(pz), gc = state.view !== "us";
      routeEls.forEach(function (x) {
        const d = x.leg >= 0 ? ((legsD(x.r, pz) || [])[x.leg] || {}).d : routeD(x.r, pz, pathZ, gc);
        if (d) x.el.setAttribute("d", d);
      });
      gRoutes.removeAttribute("transform");
      placeMarks();
      card.classList.remove("is-moving");
      if (!card.hidden) { const m = marks.find(function (x) { return x.key === openKey; }); if (m) placeCardBox(m.at); }
    }
    function moveMain(t) {   // during a gesture: routes and dots follow the zoomed land (from where they were last drawn)
      zt = t;
      const dk = t.k / tR.k, dx = t.x - dk * tR.x, dy = t.y - dk * tR.y;
      gRoutes.setAttribute("transform", "translate(" + dx.toFixed(2) + "," + dy.toFixed(2) + ") scale(" + dk.toFixed(6) + ")");
      marks.forEach(function (m) {
        if (m.kind === "place" && m.s) m.g.setAttribute("transform", "translate(" + (dk * m.s[0] + dx).toFixed(1) + "," + (dk * m.s[1] + dy).toFixed(1) + ")");
      });
      if (!card.hidden) card.classList.add("is-moving");
    }
    Z = zoomer({ host: mapEl, svg: svg, g: gZoom, keys: false, homeLabel: "Show the whole view", home: function () { return ID; },
      onMove: moveMain, onEnd: function (t) { zt = t; if (!tSame(t, tR)) relayout(); else card.classList.remove("is-moving"); } });
    function setFocus(i, move) {
      if (!marks.length) return;
      focusIdx = Math.max(0, Math.min(marks.length - 1, i));
      marks.forEach(function (m, k) { m.g.setAttribute("tabindex", k === focusIdx ? "0" : "-1"); });
      if (move) marks[focusIdx].g.focus({ preventScroll: true });
    }
    function follow() {   // a footprint reached with the keyboard that is off the screen: the map pans to it
      const m = marks[focusIdx];
      if (!Z || !m || !m.at) return;
      if (m.at[0] < 12 || m.at[0] > lastW - 12 || m.at[1] < 12 || m.at[1] > lastH - 12) Z.center(m.at);
    }
    // keyboard on the footprints: the arrows move through them in time order (the map follows), Enter opens the card,
    // + and − zoom around the footprint, 0 shows the whole view, Escape closes the card (a second Escape leaves the map)
    function onKey(ev) {
      const k = ev.key;
      if (ev.altKey || ev.metaKey || ev.ctrlKey) return;
      if (k === "ArrowRight" || k === "ArrowDown") { ev.preventDefault(); setFocus(focusIdx + 1, true); follow(); if (!card.hidden) openCard(marks[focusIdx], false); }
      else if (k === "ArrowLeft" || k === "ArrowUp") { ev.preventDefault(); setFocus(focusIdx - 1, true); follow(); if (!card.hidden) openCard(marks[focusIdx], false); }
      else if (k === "Home") { ev.preventDefault(); setFocus(0, true); follow(); }
      else if (k === "End") { ev.preventDefault(); setFocus(marks.length - 1, true); follow(); }
      else if (k === "Enter" || k === " ") { ev.preventDefault(); openCard(marks[focusIdx], true); }
      else if ((k === "+" || k === "=") && Z) { ev.preventDefault(); Z.by(1.6, marks[focusIdx] && marks[focusIdx].at); }
      else if ((k === "-" || k === "_") && Z) { ev.preventDefault(); Z.by(1 / 1.6, marks[focusIdx] && marks[focusIdx].at); }
      else if (k === "0" && Z) { ev.preventDefault(); Z.go(ID, 400); }
      else if (k === "Escape" && !card.hidden) { ev.stopPropagation(); closeCard(true); }
    }
    card.addEventListener("keydown", function (ev) { if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); closeCard(true); } });
    svg.addEventListener("click", function () { closeCard(false); });

    // ---------- controls: a timeline that steps through the entries ----------
    // Choosing a view resets its timeline and plays it from the start (the first footprint in that view; the home province
    // or country is lit from the start). Each step shows one more entry; a step waits for its routes to finish drawing,
    // and the chapter changes get a pause. With reduced motion nothing plays by itself: the map shows the final state.
    const STEP = 1300, CHAPTER_PAUSE = 1700;
    const last = D.entries.length - 1;
    let timer = null, seq = [], pos = -1;
    function inViewNow(e) {   // does this entry put a footprint in the current view (the whole view, unzoomed)?
      const W = lastW, H = lastH;
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
        stop(); state.upto = last; draw(false);   // lay out the view (and its projection) first; the zoom starts from the whole view
        if (reduceMotion) { showFinal(); return; }
        if (state.view === "us" && !geo.states) { loadUS(true).then(function () { playFrom(true); }); return; }
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

    // ---------- the chapter pages: one zoomable world map per chapter ----------
    // The chapter's footprints (its places and the waypoints of its road routes) are grouped into clusters (single
    // linkage, 400 km). Each chapter page has one map in the world view's projection, with every route of the chapter (the
    // long flights too) and its places, opened framed on the largest cluster. The chips above it (the chapter's own
    // captions, plus "Whole chapter") zoom to a cluster or to all of the chapter's footprints. Places first visited in
    // the chapter are coloured; labels keep their size and are placed again after each zoom, more of them as the map
    // zooms in. Each map is drawn when its page first comes near the screen.
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
        const home = g.some(function (p) { return p.pid && D.places[p.pid].h; }) ? 1 : 0;
        return { pts: g, places: g.filter(function (p) { return p.pid; }).length, n: g.length, home: home };
      }).sort(function (a, b) { return b.places - a.places || b.home - a.home || b.n - a.n; });
      // the second chip: the cluster around the place its caption names (chapter data), else the next with enough footprints
      const at = (chapterOf[id].at || [])[1];
      const named = at && clusters.slice(1).find(function (c) { return c.pts.some(function (p) { return p.pid === at; }); });
      return { ents: ents, all: pts, main: clusters[0] || null,
               second: named || clusters.slice(1).find(function (c) { return c.n >= 3 && c.places >= 1; }) || null };
    }
    function boxOf(cl) {
      const lons = cl.pts.map(function (p) { return p.ll[0]; }), lats = cl.pts.map(function (p) { return p.ll[1]; });
      let x0 = Math.min.apply(null, lons), x1 = Math.max.apply(null, lons), y0 = Math.min.apply(null, lats), y1 = Math.max.apply(null, lats);
      // about 30% padding around the footprints, at least about 2.5 by 1.6 degrees (some 250 km); a frame on a single
      // point keeps a wider view (about 8 by 5 degrees), so its region stays recognisable
      const single = x1 - x0 < 0.05 && y1 - y0 < 0.05;
      x0 -= (x1 - x0) * 0.3; x1 += (x1 - x0) * 0.3 / 1.3; y0 -= (y1 - y0) * 0.3; y1 += (y1 - y0) * 0.3 / 1.3;
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      const hw = Math.max((x1 - x0) / 2, single ? 4 : 1.25), hh = Math.max((y1 - y0) / 2, single ? 2.6 : 0.8);
      return [cx - hw, cy - hh, cx + hw, cy + hh];
    }
    function shortName(pid) {
      const p = D.places[pid];
      if (p.lb) return p.lb;
      return p.n.split(", ")[0].replace(/ \(home\)$/, "").replace(/ (National|State) Park$/, "");
    }
    function chFill(id) { return function (code) { const r = D.regions[code]; return r && r[1] === id ? r : null; }; }
    function fitT(M, cl, kMax) {   // the zoom that frames a cluster (its box) in the map
      const b = boxOf(cl);
      // kept inside the world view's frame (170°W to 190°E, 55°S to 78°N), so a wide box does not wrap round the world
      b[0] = Math.max(b[0], -169.9); b[2] = Math.min(b[2], 189.9); b[1] = Math.max(b[1], -55); b[3] = Math.min(b[3], 78);
      const cx = (b[0] + b[2]) / 2;
      const pts = [[b[0], b[1]], [b[2], b[1]], [b[0], b[3]], [b[2], b[3]], [cx, b[1]], [cx, b[3]]].map(function (p) { return M.proj(p); }).filter(Boolean);
      const xs = pts.map(function (p) { return p[0]; }), ys = pts.map(function (p) { return p[1]; });
      const x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
      const k = Math.max(1, Math.min(kMax || Infinity, M.W / Math.max(1e-6, x1 - x0), M.H / Math.max(1e-6, y1 - y0)));
      return tOf(k, M.W / 2 - k * (x0 + x1) / 2, M.H / 2 - k * (y0 + y1) / 2);
    }
    function press(M, key) {
      M.chips.forEach(function (b) { b.setAttribute("aria-pressed", key != null && b.getAttribute("data-zoom") === key ? "true" : "false"); });
      if (key != null) M.active = key;
    }
    function cmBuild(M) {   // the land at world scale, the routes and the dots, for the map's size
      const W = M.host.clientWidth, H = M.host.clientHeight;
      if (!W || !H) return false;
      M.W = W; M.H = H;
      M.proj = projection("world", W, H); M.path = d3.geoPath(M.proj); M.bc = new Map();
      M.svg.setAttribute("viewBox", "0 0 " + W + " " + H);
      drawBg(M.gBg, M.path, "world", { fill: chFill(M.id) });
      while (M.gRt.firstChild) M.gRt.removeChild(M.gRt.firstChild);
      M.routes = [];   // the lines are drawn (in screen pixels) at each layout
      M.A.ents.forEach(function (e) {
        (e.r || []).forEach(function (r) {
          if (r.m === "ground" && r.lg) {   // the 2013 loop: leg by leg in its colours
            r.lg.forEach(function (leg, k) { M.routes.push({ el: el("path", { class: "jr-zr jr-m-ground", style: "stroke: " + leg[1] }, M.gRt), r: r, leg: k }); });
            return;
          }
          M.routes.push({ el: el("path", { class: "jr-zr jr-m-" + r.m, style: "stroke: var(--ch-" + M.id + ")" }, M.gRt), r: r, leg: -1 });
        });
      });
      while (M.gOv.firstChild) M.gOv.removeChild(M.gOv.firstChild);
      M.items = [];
      const seen = {};
      M.A.ents.forEach(function (e) {
        e.pl.forEach(function (pid) {
          if (seen[pid]) return;
          seen[pid] = 1;
          const p = D.places[pid], q = M.proj(p.ll);
          if (!q) return;
          const g = el("g", { class: "jr-zp" }, M.gOv);
          const r = p.h ? 4.6 : 3.4;
          el("circle", { r: r, class: "jr-mini-dot" + (p.h ? " is-home" : ""), style: "--ch: var(--ch-" + (p.lc || M.id) + ")" }, g);
          // label priority: places lived, then places on the chapter's stamps, then the rest (in time order)
          const stamped = M.A.ents.some(function (x) { return x.pl.indexOf(pid) >= 0 && x.ls; });
          M.items.push({ pid: pid, b: q, s: q, g: g, r: r, rank: p.h ? 0 : stamped ? 1 : 2, order: e.i, tx: null, w: 0 });
        });
      });
      M.items.forEach(function (it) { if (it.rank === 0) M.gOv.appendChild(it.g); });   // places lived on top
      // the zoom range: from the whole world to a little closer than the closest chip's frame
      const ks = Object.keys(M.targets).filter(function (k) { return M.targets[k]; }).map(function (k) { return fitT(M, M.targets[k]).k; });
      M.kMax = Math.min(800, Math.max(24, 2.5 * Math.max.apply(null, ks)));
      if (M.Z) M.Z.bounds(W, H, M.kMax);
      return true;
    }
    function cmLabels(M) {   // labels in screen pixels, without collisions, around the controls; more fit as the map zooms in
      const W = M.W, H = M.H, fs = 11.5, pad = 3;
      const taken = [];
      const hb = M.host.getBoundingClientRect();
      M.host.querySelectorAll(".jr-zctl, .jr-zpill").forEach(function (n) {
        const r = n.getBoundingClientRect();
        if (r.width) taken.push({ l: r.left - hb.left - 4, t: r.top - hb.top - 4, r: r.right - hb.left + 4, b: r.bottom - hb.top + 4 });
      });
      const vis = M.items.filter(function (it) { return it.s[0] >= 0 && it.s[0] <= W && it.s[1] >= 0 && it.s[1] <= H; });
      const dots = vis.map(function (it) { return { l: it.s[0] - it.r - 1, t: it.s[1] - it.r - 1, r: it.s[0] + it.r + 1, b: it.s[1] + it.r + 1 }; });
      const over = function (b, o) { return !(b.r <= o.l || b.l >= o.r || b.b <= o.t || b.t >= o.b); };
      const hit = function (b, own) {   // a place lived only avoids labels, controls and its own dot (other dots may sit under it)
        if (b.l < 2 || b.t < 2 || b.r > W - 2 || b.b > H - 2) return true;
        return taken.some(function (o) { return over(b, o); }) || dots.some(function (o) { return (own === null || o === own) && over(b, o); });
      };
      M.items.forEach(function (it) { if (it.tx) it.tx.setAttribute("visibility", "hidden"); });
      let placed = 0;
      vis.slice().sort(function (a, b) { return a.rank - b.rank || a.order - b.order; }).forEach(function (it) {
        if (placed >= 16) return;
        if (!it.tx) {   // the label's real width, measured once in the page (the font's own metrics)
          it.tx = el("text", { class: "jr-mini-label", "font-size": fs, "stroke-width": 3 }, it.g);
          it.tx.textContent = shortName(it.pid);
          it.w = (it.tx.getComputedTextLength ? it.tx.getComputedTextLength() : it.tx.textContent.length * 0.62 * fs) + 2;
          it.tx.setAttribute("visibility", "hidden");
        }
        const off = it.r + pad, th = fs;
        const tries = [[off, th * 0.35, "start"], [-off, th * 0.35, "end"], [0, -off, "middle"], [0, off + th * 0.8, "middle"]];
        const own = it.rank === 0 ? dots[vis.indexOf(it)] : null;
        for (const tr of tries) {
          const x = it.s[0] + tr[0], y = it.s[1] + tr[1];
          const l = tr[2] === "start" ? x : tr[2] === "end" ? x - it.w : x - it.w / 2;
          const b = { l: l - pad / 2, t: y - th * 0.85, r: l + it.w + pad / 2, b: y + th * 0.25 };
          if (hit(b, own)) continue;
          it.tx.setAttribute("x", tr[0].toFixed(1)); it.tx.setAttribute("y", tr[1].toFixed(1)); it.tx.setAttribute("text-anchor", tr[2]);
          it.tx.removeAttribute("visibility");
          taken.push(b); placed++;
          return;
        }
      });
    }
    function cmLayout(M) {   // after a zoom: the detail layer, the dots and the labels for the new frame
      drawDetail(M.gDet, M.path, "world", M.t, M.W, M.H, { fill: chFill(M.id) }, M.bc, function () { cmLayout(M); });
      const pz = zoomed(projection("world", M.W, M.H), M.t), pathZ = d3.geoPath(pz);
      M.routes.forEach(function (x) {
        const d = x.leg >= 0 ? ((legsD(x.r, pz) || [])[x.leg] || {}).d : routeD(x.r, pz, pathZ, true);
        x.el.setAttribute("d", d || "");
      });
      M.gRt.removeAttribute("transform");
      M.items.forEach(function (it) { it.s = tApply(M.t, it.b); it.g.setAttribute("transform", "translate(" + it.s[0].toFixed(1) + "," + it.s[1].toFixed(1) + ")"); });
      cmLabels(M);
      M.tR = M.t;
    }
    function cmMove(M, t, byUser) {   // during a gesture: the dots and their labels follow the zoomed group
      M.t = t;
      const dk = t.k / M.tR.k, dx = t.x - dk * M.tR.x, dy = t.y - dk * M.tR.y;
      M.gRt.setAttribute("transform", "translate(" + dx.toFixed(2) + "," + dy.toFixed(2) + ") scale(" + dk.toFixed(6) + ")");
      M.items.forEach(function (it) { it.g.setAttribute("transform", "translate(" + (dk * it.s[0] + dx).toFixed(1) + "," + (dk * it.s[1] + dy).toFixed(1) + ")"); });
      if (byUser) press(M, null);
    }
    function cmFrame(M, key) {   // frame a chip's cluster at once (first drawing, a new size)
      const T = fitT(M, M.targets[key] || M.targets["0"], M.kMax);
      if (M.Z) M.Z.set(T); else M.gZ.setAttribute("transform", tStr(T));
      M.t = T;
      cmLayout(M);
    }
    const cmaps = [];
    function chapterMap(h) {
      const id = h.getAttribute("data-ch");
      const host = h.querySelector(".jr-zm");
      const A = chapterAtlas(id);
      if (!host || !A.main) { h.hidden = true; return; }
      const svgEl = el("svg", { class: "jr-zsvg", "aria-hidden": "true", focusable: "false" }, host);
      const gZ = el("g", {}, svgEl);
      const M = { id: id, A: A, h: h, host: host, svg: svgEl, gZ: gZ, gBg: el("g", {}, gZ), gDet: el("g", {}, gZ), gRt: el("g", {}, svgEl),
                  gOv: el("g", { class: "jr-zover" }, svgEl), items: [], routes: [], t: ID, tR: ID, W: 0, H: 0, active: "0",
                  targets: { "0": A.main, "1": A.second, all: { pts: A.all } },
                  chips: Array.prototype.slice.call(h.querySelectorAll(".jr-zchip")) };
      M.Z = zoomer({ host: host, svg: svgEl, g: gZ, keys: true, homeLabel: "Back to the first view",
        home: function () { press(M, "0"); return fitT(M, M.targets["0"], M.kMax); },
        onMove: function (t, byUser) { cmMove(M, t, byUser); },
        onEnd: function (t) { M.t = t; if (!tSame(t, M.tR)) cmLayout(M); } });
      M.chips.forEach(function (b) {
        const key = b.getAttribute("data-zoom");
        if (!M.targets[key]) { b.hidden = true; return; }
        b.addEventListener("click", function () {
          press(M, key);
          const T = fitT(M, M.targets[key], M.kMax);
          if (M.Z) M.Z.go(T, 750); else { M.t = T; gZ.setAttribute("transform", tStr(T)); cmLayout(M); }
        });
      });
      if (!cmBuild(M)) return;
      cmFrame(M, "0");
      cmaps.push(M);
    }
    (function () {
      const holders = Array.prototype.slice.call(root.querySelectorAll(".jr-pg-map[data-ch]"));
      if (!holders.length) return;
      if (!("IntersectionObserver" in window)) { holders.forEach(chapterMap); return; }
      const io = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting) { io.unobserve(e.target); chapterMap(e.target); } });
      }, { rootMargin: "300px 0px" });
      holders.forEach(function (h) { io.observe(h); });
    })();

    let rt = null;
    window.addEventListener("resize", function () {
      window.clearTimeout(rt);
      rt = window.setTimeout(function () {
        if (mapEl.clientWidth !== lastW) draw(false);
        else if (!card.hidden) { const m = marks.find(function (x) { return x.key === openKey; }); if (m) placeCardBox(m.at); }
        cmaps.forEach(function (M) {   // a new size: drawn again, framed on the chip chosen last
          if (M.host.clientWidth !== M.W || M.host.clientHeight !== M.H) { if (cmBuild(M)) cmFrame(M, M.active); }
        });
      }, 150);
    });
  }
})();
