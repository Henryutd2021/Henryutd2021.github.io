/* lifebox.js — LX.LifeBox: a chain of stages with a boundary the reader drags (the curriculum's i-boundary), promoted at
   the W5 integration (2026-11-06) from Analyst lesson A11's life-cycle box (assets/learn/a11-lca-nexus.js, builder
   learn-w5-c), whose interaction it is, unchanged. A dashed boundary lies over a row of stage tiles (a column on phones,
   560 px and narrower); its two edges are sliders (arrow keys, Home and End, or drag); a tap on a stage outside brings it
   in, with every stage between, and a tap on an end stage inside moves it out; optional preset buttons sit under the
   chain. The page fills each tile and reads the boundary, which lives in the page's own state object (S.L and S.R: the
   first and last stage inside, counted from 0; the box changes them in place).

     var box = LX.LifeBox(host, {
       stages: [{ label: "Build" }, ...],          two or more, in order along the chain (labels name the handles' places)
       state: S,                                   the page's object: S.L, S.R
       tile: function (el, i, inside) {},          fills stage i's tile (a button) on every paint; the box has set its "out"
                                                   class and aria-pressed; the page sets its content and its aria-label
       color: function (i) { return "var(--lx-accent)"; },   optional: tile i's coloured rule (the CSS variable --c)
       presets: [["site", "On site only", 2, 2], ...],       optional: [key, label, L, R] buttons under the chain
       presetsLabel: "Boundary presets",           the presets' group name (default)
       handleLabels: ["Left edge of the boundary", "Right edge of the boundary"],   (default)
       cls: "a11",                                 optional: the page's own classes too (a11-chain, a11-bnd, a11-tile, a11-h,
                                                   a11-h-l, a11-h-r, a11-pre), so its styles, tests and the layout audit
                                                   find what it drew before
       onChange: function (S) {} })                after every move by the reader (the box has painted itself first)
     -> { el (the chain), paint(), tiles, handles: [left, right], presets: { key: button } }

   Styles: lifebox.css (lx-life-*). The tiles' content is the page's (A11: a11-st, a11-sn, a11-v in its style block).
   Pure rules (Node: require("assets/learn/components/lifebox.js"); page: LX.LifeBox.tap, .key, .drag), each changing S in
   place and returning true when the boundary moved:
     tap(S, i)               the tap rule above
     key(S, side, k, n)      side "l" or "r"; k a key name (ArrowLeft/Down one stage back, ArrowRight/Up one on, Home and
                             End to the ends the other edge allows); n the number of stages
     drag(S, side, idx)      an edge dragged over stage idx (the other edge stops it)
   Tests: _tests/learn/test_a11-lca-nexus.js (the page on a stub document) and _tests/learn/test_components_w5_int.js. */
(function () {
  "use strict";

  // ---------------------------------------------------------------- pure rules (no DOM; exported for Node)
  function tap(S, i) {
    if (i < S.L) S.L = i; else if (i > S.R) S.R = i;
    else if (S.L === S.R) return false;
    else if (i === S.L) S.L++; else if (i === S.R) S.R--; else return false;
    return true;
  }
  function key(S, side, k, n) {
    var L0 = S.L, R0 = S.R, d = k === "ArrowLeft" || k === "ArrowDown" ? -1 : k === "ArrowRight" || k === "ArrowUp" ? 1 : 0;
    if (k === "Home" || k === "End") { if (side === "l") S.L = k === "Home" ? 0 : S.R; else S.R = k === "End" ? n - 1 : S.L; }
    else if (d) { if (side === "l") S.L = Math.max(0, Math.min(S.R, S.L + d)); else S.R = Math.max(S.L, Math.min(n - 1, S.R + d)); }
    else return null;   // not a key the handles use
    return S.L !== L0 || S.R !== R0;
  }
  function drag(S, side, idx) {
    var nL = side === "l" ? Math.min(idx, S.R) : S.L, nR = side === "r" ? Math.max(idx, S.L) : S.R;
    if (nL === S.L && nR === S.R) return false;
    S.L = nL; S.R = nR; return true;
  }
  var pure = { tap: tap, key: key, drag: drag };
  if (typeof module !== "undefined" && module.exports) module.exports = pure;
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- the box
  var LX = window.LX, H = LX.H;
  function LifeBox(host, o) {
    var S = o.state, n = o.stages.length, own = o.cls || null;
    function c(part) { return "lx-life-" + part + (own ? " " + own + "-" + part : ""); }
    var chain = H("div", { class: c("chain"), style: "--n:" + n }, host);
    var bnd = H("div", { class: c("bnd") }, chain);   // drawn above the tiles, clicks pass through it; its two handles are sliders
    var tiles = o.stages.map(function (st, i) {
      var b = H("button", { type: "button", class: c("tile"), style: "--c:" + (o.color ? o.color(i) : "var(--lx-accent)") + ";--i:" + (i + 1) }, chain);
      b.addEventListener("click", function () { if (tap(S, i)) change(b); });
      return b;
    });
    var names = o.handleLabels || ["Left edge of the boundary", "Right edge of the boundary"];
    function handle(side) {
      var h = H("span", { class: c("h") + " " + c("h-" + side), role: "slider", tabindex: "0", "aria-valuemin": "1", "aria-valuemax": String(n), "aria-label": names[side === "l" ? 0 : 1] }, bnd);
      h.addEventListener("keydown", function (e) {
        var moved = key(S, side, e.key, n);
        if (moved === null) return;
        e.preventDefault(); change(h);
      });
      h.addEventListener("pointerdown", function (e) {
        e.preventDefault(); if (h.setPointerCapture) h.setPointerCapture(e.pointerId); h.focus();
        function mv(ev) {   // the chain runs across from 561 px, down on phones (lifebox.css)
          var r = chain.getBoundingClientRect(), down = window.matchMedia && window.matchMedia("(max-width: 560px)").matches;
          var idx = Math.max(0, Math.min(n - 1, Math.floor(down ? (ev.clientY - r.top) / (r.height / n) : (ev.clientX - r.left) / (r.width / n))));
          if (drag(S, side, idx)) change(h);
        }
        function up() { h.removeEventListener("pointermove", mv); h.removeEventListener("pointerup", up); h.removeEventListener("pointercancel", up); }
        h.addEventListener("pointermove", mv); h.addEventListener("pointerup", up); h.addEventListener("pointercancel", up);
      });
      return h;
    }
    var hl = handle("l"), hr = handle("r");
    var preB = {};
    if (o.presets && o.presets.length) {
      var pre = H("div", { class: "lx-seg " + c("pre"), role: "group", "aria-label": o.presetsLabel || "Boundary presets" }, host);
      o.presets.forEach(function (p) {
        var b = H("button", { type: "button", text: p[1] }, pre); preB[p[0]] = [b, p[2], p[3]];
        b.addEventListener("click", function () { S.L = p[2]; S.R = p[3]; change(b); });
      });
    }
    function change(focusEl) { paint(); if (o.onChange) o.onChange(S); if (focusEl && focusEl.focus) focusEl.focus(); }
    function paint() {
      chain.style.setProperty("--span", (S.L + 1) + " / " + (S.R + 2));
      tiles.forEach(function (t, i) {
        var inB = i >= S.L && i <= S.R;
        t.classList.toggle("out", !inB); t.setAttribute("aria-pressed", String(inB));
        if (o.tile) o.tile(t, i, inB);
      });
      [hl, hr].forEach(function (h, j) {
        var at = j === 0 ? S.L : S.R; h.setAttribute("aria-valuenow", String(at + 1));
        h.setAttribute("aria-valuetext", (j === 0 ? "starts at " : "ends at ") + o.stages[at].label + ", stage " + (at + 1) + " of " + n);
      });
      Object.keys(preB).forEach(function (k) { preB[k][0].setAttribute("aria-pressed", String(S.L === preB[k][1] && S.R === preB[k][2])); });
    }
    paint();
    return { el: chain, paint: paint, tiles: tiles, handles: [hl, hr], presets: preB };
  }
  LifeBox.tap = tap; LifeBox.key = key; LifeBox.drag = drag;
  LX.LifeBox = LifeBox;
})();
