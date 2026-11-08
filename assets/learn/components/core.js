/* core.js — the LX namespace every Learn component builds on (component library).
   Helpers:  LX.H(tag, attrs, parent)   HTML element; attrs: text, html, class, on<event>, any attribute
             LX.S(tag, attrs, parent)   SVG element
             LX.icon(name, cls)         24-unit stroke pictogram as an SVG string (names in LX.IC)
             LX.rich(text)              text with [[glossary-id|shown words]] marks -> HTML with tap-to-define terms, and
                                        [[lesson:<id>|shown words]] -> a link to learn/<id>.html (text a component
                                        draws can link a live lesson; _tests/learn/test_components_w3_shared.js checks
                                        that every such mark names a live page)
             LX.fmt.money/tonnes/mw/mwh/hh/int, LX.clamp, LX.lerp, LX.reduced() (prefers-reduced-motion)
   State:    LX.progress.done/isDone/guess/answer, LX.store.get/set   (this browser only; try/catch wrapped; kept in memory
                                        for the page, with one notice, when the browser refuses storage)
             LX.store.persistent()  false once storage failed;  LX.store.clearAll()  the course-wide reset ([data-lx-reset])
   Runtime:  LX.mount(slug, init)  load a lesson interactive's data-src JSON files, then init(liveRoot, data)
             LX.demo(root, fn, cards) a lesson's demo states ("mid", "step-N", ...) for screenshots: window.lxDemo, ?demo=
             LX.load(urls)         Promise of {basename: parsed JSON};  LX.base = URL of assets/learn/
             LX.anim({visible, step}) one shared animation loop; LX.onTheme(fn) when Quarto's day/night toggle flips
             LX.tokens(el, names)  read colour tokens (#rrggbb) as [r, g, b]
   Links:    LX.lessonRef(P, code)  a lesson by starter number (3) or code ("R2"), from data/path.json (P, loaded with the
                                   page's data-src): { href, ready, label } ("lesson 3" or "R2"; href null when unknown)
             LX.lessonRefHTML(P, code)  a link when path.json marks the lesson ready, else its label and "(upcoming)", so a
                                   page's links appear by themselves when a lesson goes live
   Random:   LX.mulberry32(seed)    a small seeded generator (mulberry32, 32-bit): a function returning numbers in [0, 1);
                                   the same seed gives the same numbers on every page, in Node and in the notebooks' Python
                                   ports (shared by M7 and engine E1)
   Also: the back-to-top guard (hides the site's button while it would cover lesson controls or any text) and course ticks.
   Node: module.exports = { lessonRef, lessonRefHTML, mulberry32, rich } (pure; the rest needs a browser). */
(function () {
  "use strict";
  // ---------------------------------------------------------------- pure (no DOM; exported for Node)
  function escHTML(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function lessonRef(P, code) {
    var all = [].concat((P && P.starter) || [], (P && P.more) || [], (P && P.toolbox) || []), num = typeof code === "number";
    var hit = all.filter(function (l) { return num ? l.starter === code : l.code === code; })[0];
    var label = num ? "lesson " + code : String(code);
    return hit ? { href: hit.href || null, ready: !!(hit.ready && hit.href), label: label } : { href: null, ready: false, label: label };
  }
  function lessonRefHTML(P, code) {
    var r = lessonRef(P, code);
    return r.ready ? '<a href="' + escHTML(r.href) + '">' + escHTML(r.label) + "</a>" : escHTML(r.label) + " (upcoming)";
  }
  // text with marks -> safe HTML: [[lesson:<id>|words]] a link to the lesson page (relative to learn/, where every Learn
  // page lives), [[<glossary-id>|words]] a term span that glossary.js upgrades into a tap-to-define button
  function rich(text) {
    return escHTML(text)
      .replace(/\[\[lesson:([a-z0-9-]+)\|([^\]]+)\]\]/g, function (m, id, words) { return '<a href="' + id + '.html">' + words + "</a>"; })
      .replace(/\[\[([a-z0-9-]+)\|([^\]]+)\]\]/g, function (m, id, words) { return '<span class="lx-term" data-term="' + id + '">' + words + "</span>"; });
  }
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  if (typeof module !== "undefined" && module.exports) module.exports = { lessonRef: lessonRef, lessonRefHTML: lessonRefHTML, mulberry32: mulberry32, rich: rich };
  if (typeof window === "undefined") return;

  var LX = window.LX = window.LX || {};
  LX.lessonRef = lessonRef;
  LX.lessonRefHTML = lessonRefHTML;
  LX.mulberry32 = mulberry32;
  var NS = "http://www.w3.org/2000/svg";
  var me = document.currentScript && document.currentScript.src;
  LX.base = me ? me.replace(/[^/]*$/, "") : "../assets/learn/";
  document.documentElement.classList.add("lx-js");

  LX.S = function (tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    if (attrs) for (var k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  };
  LX.H = function (tag, attrs, parent) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      var v = attrs[k];
      if (v == null || v === false) continue;
      if (k === "text") e.textContent = v;
      else if (k === "html") e.innerHTML = v;
      else if (k === "class") e.className = v;
      else if (k.slice(0, 2) === "on" && typeof v === "function") e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? "" : v);
    }
    if (parent) parent.appendChild(e);
    return e;
  };
  LX.clamp = function (x, a, b) { return Math.max(a, Math.min(b, x)); };
  LX.lerp = function (a, b, t) { return a + (b - a) * t; };
  var RMQ = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  LX.reduced = function () { return !!(RMQ && RMQ.matches); };
  var uidN = 0;
  LX.uid = function (p) { return (p || "lx") + "-" + (++uidN); };
  LX.esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };

  // ---------------------------------------------------------------- numbers as text
  LX.fmt = {
    int: function (v) { return Math.round(v).toLocaleString("en-US"); },
    money: function (v) { return "$" + Math.round(v).toLocaleString("en-US"); },
    tonnes: function (v) { return (Math.round(v * 10) / 10).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " t"; },
    mw: function (v) { return Math.round(v).toLocaleString("en-US") + " MW"; },
    mwh: function (v) { return Math.round(v).toLocaleString("en-US") + " MWh"; },
    hh: function (t) { t = ((Math.floor(t) % 24) + 24) % 24; return (t < 10 ? "0" : "") + t + ":00"; }
  };

  // ---------------------------------------------------------------- icons (24-unit stroke pictograms)
  LX.IC = {
    gauge: '<path d="M4 17a8 8 0 0 1 16 0"/><path d="M12 17l4.5-5"/><path d="M3 20h18"/>',
    bolt: '<path d="M13 3L5 13.5h6L10 21l8-10.5h-6z"/>',
    curve: '<path d="M3 20h18"/><path d="M3 16c3 0 3.5-7 7-7s3 4 5.5 4S19 5 21 5"/>',
    wave: '<path d="M2 12c2.2-6 4.3-6 6.5 0s4.3 6 6.5 0 4.3-6 6.5 0"/><path d="M2 20h20" opacity=".5"/>',
    cloud: '<path d="M7 18h10a4 4 0 0 0 .4-8A6 6 0 0 0 6 11.2 3.5 3.5 0 0 0 7 18z"/><path d="M9 21h6" stroke-dasharray="2 2"/>',
    turbine: '<path d="M12 10L5 8.6M12 10l4.6-5.6M12 10l2.4 6.8"/><path d="M12 11.5V21M8.5 21h7"/><circle cx="12" cy="10" r="1.3"/>',
    blocks: '<path d="M4 20v-6h4v6z"/><path d="M10 20V10h4v10z"/><path d="M16 20V5h4v15z"/>',
    coin: '<circle cx="12" cy="12" r="8.5"/><path d="M14.6 9.4c-.5-.9-1.5-1.4-2.6-1.4-1.5 0-2.6.8-2.6 2s1 1.7 2.6 2 2.6.9 2.6 2.1-1.1 2-2.6 2c-1.2 0-2.2-.5-2.7-1.5M12 6.5V8M12 16v1.5"/>',
    stairs: '<path d="M3 20h4v-4h4v-4h4V8h4V4"/><path d="M3 20h18"/>',
    battery: '<rect x="3" y="7.5" width="15" height="9" rx="1.5"/><path d="M18 10.5h2.5v3H18"/><path d="M6.5 10.5v3M9.5 10.5v3"/>',
    pencil: '<path d="M5 6h9M5 10.5h9M5 15h5"/><path d="M14 20l1-3.5 5-5 2.5 2.5-5 5z"/>',
    target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/><path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4"/>',
    frontier: '<path d="M4 3v17h17"/><path d="M6.5 5c0 7.5 4.5 12.5 12.5 12.5"/><circle cx="9" cy="11.5" r="1.3"/><circle cx="14.5" cy="15.3" r="1.3"/>',
    blueprint: '<path d="M3 6.5l6-2.5 6 2.5 6-2.5v13.5l-6 2.5-6-2.5-6 2.5z"/><path d="M9 4v13.5M15 6.5V20"/>',
    bulb: '<path d="M9.5 18h5M10.5 21h3"/><path d="M12 3a6 6 0 0 0-4 10.5c.8.8 1.3 1.7 1.4 2.8h5.2c.1-1.1.6-2 1.4-2.8A6 6 0 0 0 12 3z"/>',
    bars: '<path d="M3 20h18"/><path d="M6 20v-7M11 20V8M16 20v-4M20 20V5"/>',
    braces: '<path d="M8.5 4C6.5 4 6 5 6 6.8v2.4C6 10.8 5 12 3.5 12 5 12 6 13.2 6 14.8v2.4C6 19 6.5 20 8.5 20"/><path d="M15.5 4c2 0 2.5 1 2.5 2.8v2.4c0 1.6 1 2.8 2.5 2.8-1.5 0-2.5 1.2-2.5 2.8v2.4c0 1.8-.5 2.8-2.5 2.8"/><path d="M10 12h4"/>',
    flask: '<path d="M9 3h6M10 3v6l-5.5 9.5A1.6 1.6 0 0 0 5.9 21h12.2a1.6 1.6 0 0 0 1.4-2.5L14 9V3"/><path d="M7.5 15h9"/>',
    scale: '<path d="M12 4v15M7 20h10"/><path d="M4 8h16"/><path d="M4 8l-2.5 6h5zM20 8l-2.5 6h5z"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    ramp: '<path d="M3 19h4l8-12h6"/><path d="M15 3v8" stroke-dasharray="2 2"/>',
    lamp: '<path d="M8 3h8l2.5 7h-13z"/><path d="M12 10v8M8 21h8M12 18v3"/>',
    plant: '<path d="M3 21V11l5 3v-3l5 3V5h3v16z"/><path d="M18 21V9h3v12"/>',
    tower: '<path d="M8 21l3-17h2l3 17"/><path d="M6.5 8h11M7.5 13h9"/><path d="M9.5 13l5 8M14.5 13l-5 8"/>',
    sub: '<rect x="4" y="9" width="16" height="11" rx="1"/><path d="M8 9V5M16 9V5M4 14h16"/><path d="M11 15.5l2-2.5v2h2l-2 3v-2h-2z"/>',
    house: '<path d="M3.5 11L12 4l8.5 7"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5h4v5"/>',
    check: '<path d="M4.5 12.5l5 5 10-11"/>',
    cross: '<path d="M6 6l12 12M18 6L6 18"/>',
    star: '<path d="M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1-5.4-3-5.4 3 1.1-6.1-4.5-4.2 6.1-.8z"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
    chart: '<path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.2 5.2L7 7M17 17l1.8 1.8M5.2 18.8L7 17M17 7l1.8-1.8"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    play: '<path d="M7 4.5v15l12-7.5z"/>',
    map: '<path d="M3 6.5l6-2.5 6 2.5 6-2.5v13.5l-6 2.5-6-2.5-6 2.5z"/><circle cx="12" cy="11" r="2.2"/>',
    question: '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.7"/><path d="M12 16.8v.2"/>',
    globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.6 5.4 3.6 8.5s-1.1 5.9-3.6 8.5c-2.5-2.6-3.6-5.4-3.6-8.5s1.1-5.9 3.6-8.5z"/>',
    city: '<path d="M3 21V10l5-3v14M8 21V4h8v17M16 21v-9h5v9M3 21h18"/><path d="M11 8h2M11 12h2M11 16h2"/>',
    // technologies beyond lesson 0's fleet (first drawn in lesson 6): nuclear, gas, hydro, geothermal, demand response
    atom: '<circle cx="12" cy="12" r="1.6"/><ellipse cx="12" cy="12" rx="9" ry="3.6"/><ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(120 12 12)"/>',
    flame: '<path d="M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.4 2.4-5.4 3.6-8.3.6 1.6 1.4 2.6 2.6 3.2C12 6.7 13.6 4.4 15.4 3c-.2 3 1 4.8 2.2 6.6 1 1.4 1.4 2.9 1.4 4.9 0 3.7-2.7 6.5-7 6.5z"/>',
    drop: '<path d="M12 3.5c3 4 6 7.4 6 10.8a6 6 0 0 1-12 0c0-3.4 3-6.8 6-10.8z"/><path d="M9 15a3 3 0 0 0 3 3"/>',
    geo: '<path d="M3 15h18M5.5 19h13"/><path d="M12 15V5M9 8l3-3 3 3"/><path d="M7 12.5c0-1.5 1.5-1.5 1.5-3M17 12.5c0-1.5-1.5-1.5-1.5-3"/>',
    dial: '<path d="M4.5 17a8 8 0 1 1 15 0"/><path d="M12 13l-4-3"/><path d="M3 20h18"/>'
  };
  LX.icon = function (name, cls) {
    return '<svg class="lx-ic ' + (cls || "") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + (LX.IC[name] || "") + "</svg>";
  };
  LX.iconInto = function (g, name, x, y, size) {
    var sv = LX.S("svg", { x: x - size / 2, y: y - size / 2, width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
      "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round", class: "icon", "aria-hidden": "true" }, g);
    sv.innerHTML = LX.IC[name] || "";
    return sv;
  };
  LX.STAR = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="' + "M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1-5.4-3-5.4 3 1.1-6.1-4.5-4.2 6.1-.8z" + '"/></svg>';

  // text with [[id|words]] glossary marks and [[lesson:<id>|words]] lesson links -> safe HTML (rich, above); glossary.js
  // upgrades the term spans into tap-to-define buttons
  LX.rich = rich;

  // ---------------------------------------------------------------- browser storage (never required)
  // Everything the course keeps lives under one localStorage key, "learn.v1". When the browser refuses it (site data
  // blocked, some private windows, a full quota), the state is kept in memory for the rest of this page's life, as JSON
  // text so it behaves like storage, and one short notice says that it will not survive a reload
  // (LX.store.persistent() is then false). LX.store.clearAll() removes the key: the course-wide reset.
  var KEY = "learn.v1", MEM = null, warned = false;
  function read() {
    if (MEM != null) return JSON.parse(MEM);
    var txt;
    try { txt = window.localStorage.getItem(KEY); } catch (e) { MEM = "{}"; notice(); return {}; }
    try { return JSON.parse(txt) || {}; } catch (e) { return {}; }   // unreadable text: start afresh (the next write replaces it)
  }
  function write(s) {
    var txt = JSON.stringify(s);
    if (MEM != null) { MEM = txt; return false; }
    try { window.localStorage.setItem(KEY, txt); return true; } catch (e) { MEM = txt; notice(); return false; }
  }
  // the notice, once per page: under the page title, or at the top of the main column
  function notice() {
    if (warned) return; warned = true;
    function put() {
      var main = document.querySelector("main") || document.body; if (!main) return;
      var p = LX.H("p", { class: "lx-store-note", role: "status", text: "This browser is not keeping site data, so your answers and progress last only until you reload or leave this page." });
      var head = main.querySelector("#title-block-header");
      if (head && head.parentNode === main) main.insertBefore(p, head.nextSibling); else main.insertBefore(p, main.firstChild);
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", put); else put();
  }
  function bucket(s, n) { if (!s[n] || typeof s[n] !== "object") s[n] = {}; return s[n]; }
  function kv(name) {
    return function (id, value) {
      var s = read(), b = bucket(s, name);
      if (value === undefined) return b[id];
      if (value === null) delete b[id]; else b[id] = value;
      write(s);
    };
  }
  LX.store = { get: function (k, d) { var v = kv("kv")(k); return v === undefined ? d : v; }, set: function (k, v) { kv("kv")(k, v); },
    persistent: function () { return MEM == null; },
    clearAll: function () {   // every guess, answer, draft, checkpoint attempt and tick of the course, in this browser
      if (MEM != null) MEM = "{}";
      try { window.localStorage.removeItem(KEY); } catch (e) { MEM = "{}"; }
    } };
  LX.progress = {
    isDone: function (id) { return !!bucket(read(), "done")[id]; },
    done: function (id, on) {
      var s = read(), d = bucket(s, "done");
      if (on === false) delete d[id]; else d[id] = new Date().toISOString().slice(0, 10);
      write(s); paintTicks(); LX.emit("progress");
    },
    all: function () { return bucket(read(), "done"); },
    guess: kv("guess"),
    answer: kv("quiz")
  };

  // ---------------------------------------------------------------- tiny event bus
  var subs = {};
  LX.on = function (ev, fn) { (subs[ev] = subs[ev] || []).push(fn); };
  LX.emit = function (ev, x) { (subs[ev] || []).forEach(function (f) { try { f(x); } catch (e) { console.error(e); } }); };

  // ---------------------------------------------------------------- colour tokens and day/night
  LX.isDark = function () { return document.body.classList.contains("quarto-dark"); };
  LX.onTheme = function (fn) { LX.on("theme", fn); };
  function hex(s) { var m = /^#?([0-9a-f]{6})$/i.exec((s || "").trim()); var n = m ? parseInt(m[1], 16) : 0x888888; return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  LX.tokens = function (el, names) {
    var cs = getComputedStyle(el || document.body), out = {};
    names.forEach(function (k) { out[k] = hex(cs.getPropertyValue("--lx-" + k)); });
    return out;
  };
  LX.mix = function (a, b, t) { return [LX.lerp(a[0], b[0], t), LX.lerp(a[1], b[1], t), LX.lerp(a[2], b[2], t)]; };
  LX.rgb = function (c) { return "rgb(" + c.map(Math.round).join(",") + ")"; };
  function watchTheme() {
    var was = LX.isDark();
    if (window.MutationObserver) new MutationObserver(function () {
      var now = LX.isDark(); if (now !== was) { was = now; requestAnimationFrame(function () { LX.emit("theme", now); }); }
    }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  }

  // ---------------------------------------------------------------- one animation loop for every component
  var ANIM = [], running = false, last = 0;
  LX.visible = function (el) { return !!(el && el.offsetParent !== null); };
  LX.anim = function (a) { ANIM.push(a); if (!running) { running = true; requestAnimationFrame(loop); } };
  function loop(ts) {
    var dt = last ? Math.min(0.1, (ts - last) / 1000) : 0.016; last = ts;
    for (var i = 0; i < ANIM.length; i++) { var a = ANIM[i]; try { if (a.visible()) a.step(dt); } catch (e) { console.error(e); } }
    requestAnimationFrame(loop);
  }

  // ---------------------------------------------------------------- data and interactives
  var cache = {};
  LX.json = function (url) {
    if (!cache[url]) cache[url] = fetch(url).then(function (r) { if (!r.ok) throw new Error(url + ": " + r.status); return r.json(); });
    return cache[url];
  };
  LX.load = function (urls) {
    return Promise.all(urls.map(LX.json)).then(function (list) {
      var data = {};
      urls.forEach(function (u, i) { data[u.split("/").pop().replace(/\.json$/, "").replace(/[^A-Za-z0-9_]/g, "_")] = list[i]; });
      return data;
    });
  };
  // <div class="lx-interactive" data-learn="slug" data-src="a.json b.json"> <div class="lx-fallback">static version</div> </div>
  LX.mount = function (slug, init) {
    LX.ready(function () {
      document.querySelectorAll('.lx-interactive[data-learn="' + slug + '"]').forEach(function (root) {
        if (root.classList.contains("is-live")) return;
        var srcs = (root.getAttribute("data-src") || "").split(/\s+/).filter(Boolean);
        LX.load(srcs).then(function (data) {
          var live = LX.H("div", { class: "lx-live" }, root);
          try { init(live, data, root); root.classList.add("is-live"); LX.emit("mounted", slug); }
          catch (e) { console.error("Learn interactive " + slug + " failed:", e); root.removeChild(live); }
        }, function (e) {
          console.error("Learn data could not be loaded:", e);
          if (location.protocol === "file:") LX.H("p", { class: "lx-offline", text: "The interactive needs a web server (for example quarto preview); opened as a file, the browser blocks its data." }, root);
        });
      });
    });
  };
  LX.lesson = function () {
    var n = document.querySelector(".lx-lesson-data");
    try { return n ? JSON.parse(n.textContent) : null; } catch (e) { return null; }
  };
  // ---------------------------------------------------------------- demo states (screenshots and curious readers)
  // LX.demo(root, fn, cards): register a lesson's demo hook. fn(state) puts the page into a named state and returns
  // something truthy ({view: "..."}) when it handled the state, or null. Every lesson accepts the standard states
  //   "mid"     one interaction done (the lesson picks which)
  //   "step-N"  step card N open (1-based), with that card's action done where the lesson knows how; when fn returns
  //             null for it and `cards` (an LX.StepCards) is given, the card is simply opened
  // and may add its own names ("band", "milp", ...). window.lxDemo(state) and root.lxDemo(state) run it, and so does
  // the address: ?demo=<state>, #lx-demo-<state>, #lx-demo-<N> or #lx-step-<N> (= "step-N"), #lx-demo (= "mid").
  // The screenshot check uses it for any state it does not know. Readers never see it unless they ask for it.
  LX.demoState = function () {
    var q = /[?&]demo=([\w-]+)/.exec(location.search), h = /^#lx-(demo|step)(?:-([\w-]+))?$/.exec(location.hash);
    if (q) return q[1];
    if (!h) return null;
    return h[2] ? (/^\d+$/.test(h[2]) ? "step-" + h[2] : h[2]) : "mid";
  };
  LX.demo = function (root, fn, cards) {
    function run(state) {
      state = String(state == null ? "mid" : state);
      var r = fn(state), m = /^step-(\d+)$/.exec(state);
      if (!r && m && cards) { cards.go(Math.max(0, Math.min((cards.count || Infinity) - 1, +m[1] - 1))); r = { view: state }; }
      LX.emit("layout");
      return r || null;
    }
    if (root) root.lxDemo = run;
    window.lxDemo = run;
    var st = LX.demoState();
    if (st) setTimeout(function () { try { run(st); } catch (e) { console.error(e); } }, 60);
    return run;
  };
  var readyQ = [], isReady = false;
  LX.ready = function (fn) { if (isReady) fn(); else readyQ.push(fn); };

  // ---------------------------------------------------------------- course ticks and "mark complete"
  function paintTicks() {
    document.querySelectorAll("[data-lesson-id]").forEach(function (n) {
      var done = LX.progress.isDone(n.getAttribute("data-lesson-id"));
      n.classList.toggle("is-done", done);
      var tag = n.querySelector(".lx-done-tag") || (n.classList.contains("lx-done-tag") ? n : null);
      if (tag) tag.hidden = !done;
    });
    document.querySelectorAll("button[data-complete]").forEach(function (b) {
      var done = LX.progress.isDone(b.getAttribute("data-complete"));
      b.hidden = false;
      b.setAttribute("aria-pressed", done ? "true" : "false");
      b.innerHTML = done ? LX.icon("check") + "Completed (select to undo)" : "Mark this lesson as complete";
    });
  }
  function setupComplete() {
    document.querySelectorAll("button[data-complete]").forEach(function (b) {
      b.addEventListener("click", function () { var id = b.getAttribute("data-complete"); LX.progress.done(id, !LX.progress.isDone(id)); });
    });
  }
  // the course-wide reset (the Learn index): <div class="lx-reset" data-lx-reset hidden> holding a button and a status
  // line (aria-live); shown only with JavaScript, it asks first, then clears everything kept under learn.v1
  var RESET_ASK = "Clear all course data in this browser? This removes your guesses, answers, drafts, checkpoint attempts and completed-lesson ticks for every lesson (everything kept under learn.v1). It cannot be undone.";
  function setupReset() {
    document.querySelectorAll("[data-lx-reset]").forEach(function (box) {
      var b = box.querySelector("button"), msg = box.querySelector("[aria-live]");
      if (!b) return;
      box.hidden = false;
      b.addEventListener("click", function () {
        if (!window.confirm(RESET_ASK)) return;
        LX.store.clearAll(); paintTicks(); LX.emit("progress");
        if (msg) msg.textContent = "Cleared. This browser now keeps no data from this course.";
      });
    });
  }

  // ---------------------------------------------------------------- keep the site's back-to-top button off lesson controls
  function guardToTop() {
    var pending = false;
    function zones() { return document.querySelectorAll(".lx-interactive, .lx-guard, .lx-cards, .lx-quiz, .lx-myths, .lx-xgrid"); }
    function check() {
      pending = false;
      var btn = document.querySelector(".to-top"); if (!btn) return;
      var s = getComputedStyle(btn), w = btn.offsetWidth || 42, hgt = btn.offsetHeight || 42;
      var right = window.innerWidth - (parseFloat(s.right) || 19), bottom = window.innerHeight - (parseFloat(s.bottom) || 19);
      var b = { left: right - w - 8, right: right + 8, top: bottom - hgt - 8, bottom: bottom + 8 };
      var hit = Array.prototype.some.call(zones(), function (z) {
        var r = z.getBoundingClientRect();
        return r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top;
      });
      // any other text under the button (a landing note, the sources, the footer at the end of the page, where no
      // scrolling can move it out from under the button): elements under nine points of the button, their own lines
      if (!hit && !btn.hidden) {
        var bb = btn.getBoundingClientRect(), box = { left: bb.left - 4, right: bb.right + 4, top: bb.top - 4, bottom: bb.bottom + 4 };
        if (bb.width) hit = textUnder(btn, box);
      }
      document.body.classList.toggle("lx-totop-off", hit);
    }
    function textUnder(btn, box) {
      var seen = [], rg = document.createRange();
      for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) {
        var x = box.left + (box.right - box.left) * (0.15 + 0.35 * i), y = box.top + (box.bottom - box.top) * (0.15 + 0.35 * j);
        var stack = document.elementsFromPoint ? document.elementsFromPoint(x, y) : [];
        for (var k = 0; k < stack.length; k++) {
          var e = stack[k];
          if (e === btn || btn.contains(e) || e === document.body || e === document.documentElement || seen.indexOf(e) >= 0) continue;
          seen.push(e);
          for (var n = e.firstChild; n; n = n.nextSibling) {
            if (n.nodeType !== 3 || !/\S/.test(n.data)) continue;
            rg.selectNodeContents(n);
            var rs = rg.getClientRects();
            for (var q = 0; q < rs.length; q++) {
              var r = rs[q];
              if (r.width && r.left < box.right && r.right > box.left && r.top < box.bottom && r.bottom > box.top) return true;
            }
          }
        }
      }
      return false;
    }
    function request() { if (!pending) { pending = true; requestAnimationFrame(check); } }
    window.addEventListener("scroll", request, { passive: true });
    window.addEventListener("resize", request);
    LX.on("layout", request);
    request();
  }

  function start() {
    read();   // a first read: a browser that refuses storage shows its notice at once, not at the first answer
    watchTheme(); setupComplete(); setupReset(); paintTicks(); guardToTop();
    isReady = true; readyQ.splice(0).forEach(function (f) { try { f(); } catch (e) { console.error(e); } });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else setTimeout(start, 0);
})();
