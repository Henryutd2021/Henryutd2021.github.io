// explainers/common.js — shared helpers for the interactive mechanism explainers on project pages.
// Each explainer file calls Explainer.register(slug, init). On load, every <div class="explainer" data-explainer="slug">
// is handed to init(root, h); the container's static fallback (.ex-fallback) stays visible until init succeeds.
// Rules: illustrative toy models only, controls act on user input (no autoplay),
// colors from the CSS tokens in assets/base.css so both themes work, keyboard-operable labeled controls.
(function () {
  const registry = {};
  const SVGNS = "http://www.w3.org/2000/svg";
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let uid = 0;

  // create an element (in the SVG namespace for <svg> and anything appended to an SVG node), set attributes, append
  function el(tag, attrs, parent) {
    const isSvg = tag === "svg" || (parent && parent.namespaceURI === SVGNS);
    const node = isSvg ? document.createElementNS(SVGNS, tag) : document.createElement(tag);
    for (const k in attrs || {}) {
      if (k === "text") node.textContent = attrs[k];
      else if (k === "html") node.innerHTML = attrs[k];
      else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
    }
    if (parent) parent.appendChild(node);
    return node;
  }

  // CSS token -> color string, e.g. color("accent"), color("t") (the page's theme color), color("muted")
  function color(name) {
    const v = getComputedStyle(document.querySelector(".project-page .proj") || document.body).getPropertyValue("--" + name).trim();
    return v || getComputedStyle(document.body).getPropertyValue("--" + name).trim() || "#888";
  }

  // linear scale: maps [d0,d1] onto [r0,r1]
  function scale(d0, d1, r0, r1) {
    const f = function (v) { return r0 + (v - d0) * (r1 - r0) / ((d1 - d0) || 1); };
    f.domain = [d0, d1]; f.range = [r0, r1];
    return f;
  }

  // "nice" ticks between min and max, about n of them
  function ticks(min, max, n) {
    const span = max - min, step0 = Math.pow(10, Math.floor(Math.log10(span / (n || 5))));
    const err = (n || 5) / span * step0;
    const step = step0 * (err <= 0.15 ? 10 : err <= 0.35 ? 5 : err <= 0.75 ? 2 : 1);
    const out = [];
    for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) out.push(+v.toFixed(10));
    return out;
  }

  // number formatting: fmt(1234.5, 1) -> "1,234.5"
  function fmt(v, digits) {
    return Number(v).toLocaleString("en-US", { minimumFractionDigits: digits || 0, maximumFractionDigits: digits || 0 });
  }

  // labeled range slider; returns {input, set(value)}; onInput(value) fires on every change
  function slider(parent, o) {
    const id = "ex-s-" + (++uid);
    const wrap = el("div", { class: "ex-control" }, parent);
    const lab = el("label", { for: id, class: "ex-label" }, wrap);
    lab.appendChild(document.createTextNode(o.label + " "));
    const out = el("output", { for: id, class: "ex-value" }, lab);
    const input = el("input", { type: "range", id: id, min: o.min, max: o.max, step: o.step || 1, value: o.value }, wrap);
    if (o.hint) el("span", { class: "ex-hint", text: o.hint }, wrap);
    const show = function () {
      const v = +input.value;
      out.textContent = o.format ? o.format(v) : fmt(v);
      input.setAttribute("aria-valuetext", out.textContent);
      input.style.setProperty("--fill", (100 * (v - o.min) / ((o.max - o.min) || 1)).toFixed(1) + "%");  // filled part of the track
      return v;
    };
    input.addEventListener("input", function () { o.onInput && o.onInput(show()); });
    show();
    return { input: input, set: function (v) { input.value = v; o.onInput && o.onInput(show()); } };
  }

  // segmented toggle (radio group); options [{value,label}]; returns {get(), set(value)}
  function toggle(parent, o) {
    const name = "ex-t-" + (++uid);
    const wrap = el("fieldset", { class: "ex-control ex-toggle" }, parent);
    el("legend", { class: "ex-label", text: o.label }, wrap);
    const row = el("div", { class: "ex-seg" }, wrap);
    let current = o.value;
    o.options.forEach(function (opt) {
      const lab = el("label", { class: "ex-seg-opt" }, row);
      const r = el("input", { type: "radio", name: name, value: opt.value }, lab);
      if (String(opt.value) === String(current)) r.checked = true;
      el("span", { text: opt.label }, lab);
      r.addEventListener("change", function () { if (r.checked) { current = opt.value; o.onChange && o.onChange(current); } });
    });
    return { get: function () { return current; },
             set: function (v) { current = v; row.querySelectorAll("input").forEach(function (r) { r.checked = String(r.value) === String(v); }); o.onChange && o.onChange(v); } };
  }

  // checkbox switch; returns {get(), set(bool)}
  function checkbox(parent, o) {
    const wrap = el("label", { class: "ex-control ex-check" }, parent);
    const c = el("input", { type: "checkbox" }, wrap);
    c.checked = !!o.value;
    el("span", { text: o.label }, wrap);
    c.addEventListener("change", function () { o.onChange && o.onChange(c.checked); });
    return { get: function () { return c.checked; }, set: function (v) { c.checked = !!v; o.onChange && o.onChange(c.checked); } };
  }

  // responsive SVG with a fixed viewBox; role=img with a title for screen readers
  function svg(parent, o) {
    const s = el("svg", { viewBox: "0 0 " + o.width + " " + o.height, class: "ex-svg", role: "img", "aria-labelledby": "ex-svg-" + (++uid) }, parent);
    el("title", { id: "ex-svg-" + uid, text: o.label || "Interactive chart" }, s);
    return s;
  }

  // clear an SVG group (keeps the element)
  function clear(g) { while (g.firstChild) g.removeChild(g.firstChild); }

  // readouts: items [{key,label}] -> update({key: "text"})
  function readouts(parent, items) {
    const dl = el("dl", { class: "ex-readouts" }, parent);
    const cells = {};
    items.forEach(function (it) {
      const d = el("div", { class: "ex-readout" }, dl);
      el("dt", { text: it.label }, d);
      cells[it.key] = el("dd", {}, d);
    });
    return function (vals) { for (const k in vals) if (cells[k]) cells[k].textContent = vals[k]; };
  }

  // one sentence that describes the current state; announced politely to screen readers
  function sentence(parent) {
    const p = el("p", { class: "ex-sentence", "aria-live": "polite" }, parent);
    return function (html) { p.innerHTML = html; };
  }

  // call cb whenever day/night mode changes (Quarto swaps body classes)
  function onTheme(cb) {
    new MutationObserver(cb).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  }

  // call draw(width) now and whenever the container's width changes, so charts are drawn at real pixel size
  // (text stays legible on phones instead of shrinking with a fixed viewBox)
  function responsive(container, draw) {
    let last = 0;
    const run = function () { const w = Math.round(container.clientWidth); if (w && w !== last) { last = w; draw(w); } };
    if ("ResizeObserver" in window) new ResizeObserver(run).observe(container);
    else window.addEventListener("resize", run);
    run();
    return function () { last = 0; run(); };  // force a redraw (e.g. after a control changes)
  }

  // standard scaffold inside the container: title, controls, figure, readouts, sentence
  function scaffold(root, o) {
    el("p", { class: "ex-title", text: o.title }, root);
    const controls = el("div", { class: "ex-controls" }, root);
    const figure = el("div", { class: "ex-figure" }, root);
    const side = el("div", { class: "ex-side" }, root);
    return { controls: controls, figure: figure, side: side };
  }

  const h = { el: el, color: color, scale: scale, ticks: ticks, fmt: fmt, slider: slider, toggle: toggle, checkbox: checkbox,
              svg: svg, clear: clear, readouts: readouts, sentence: sentence, onTheme: onTheme, responsive: responsive,
              scaffold: scaffold, reduced: reduced };

  function start(root) {
    const init = registry[root.getAttribute("data-explainer")];
    if (!init || root.classList.contains("is-live")) return;
    try {
      const live = document.createElement("div");
      live.className = "ex-live";
      root.appendChild(live);
      init(live, h);
      root.classList.add("is-live");
    } catch (e) {
      console.error("explainer " + root.getAttribute("data-explainer") + " failed:", e);  // the fallback text stays
    }
  }

  window.Explainer = {
    register: function (slug, init) {
      registry[slug] = init;
      document.querySelectorAll('.explainer[data-explainer="' + slug + '"]').forEach(start);
    },
    helpers: h,
  };
})();
