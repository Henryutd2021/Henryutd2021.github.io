/* coach.js — LX.Coach: a short coach tour (three steps or fewer) that rings one control at a time with a one-sentence tip.
   const tour = LX.Coach(root, [{el: slider.el, text: "One sentence."}, ...], {key: "g0-coach"});
   tour.start()       first visit only (remembered in this browser under `key`); tour.start(0, true) shows it again
   tour.end()         also on Escape or "Skip tour"
   root must be position: relative; the tip sits above or below the ringed element and keeps focus on its own buttons. */
(function () {
  "use strict";
  var LX = window.LX, H = LX.H, clamp = LX.clamp;
  LX.Coach = function (root, steps, opts) {
    opts = opts || {};
    var ring = null, tip = null, cur = 0, rt = null, back = null;
    function end(quiet) {
      if (ring) ring.remove(); if (tip) tip.remove(); ring = tip = null;
      if (opts.key) LX.store.set(opts.key, 1);
      document.removeEventListener("keydown", onKey);
      if (!quiet && back && document.contains(back)) back.focus({ preventScroll: true });
      if (opts.onEnd) opts.onEnd();
    }
    function onKey(e) { if (e.key === "Escape") end(); }
    function show(k) {
      if (ring) ring.remove(); if (tip) tip.remove(); ring = tip = null; cur = k;
      if (k >= steps.length || !LX.visible(root)) return end(true);
      var s = steps[k], tgt = typeof s.el === "function" ? s.el() : s.el;
      if (!tgt) return show(k + 1);
      var tr = tgt.getBoundingClientRect();
      if (tr.top < 70 || tr.bottom > window.innerHeight - 20) tgt.scrollIntoView({ block: "center", behavior: "auto" });
      var rr = root.getBoundingClientRect(), r = tgt.getBoundingClientRect();
      ring = H("div", { class: "lx-coach-ring", "aria-hidden": "true" }, root);
      ring.style.left = (r.left - rr.left - 6) + "px"; ring.style.top = (r.top - rr.top - 6) + "px";
      ring.style.width = (r.width + 12) + "px"; ring.style.height = (r.height + 12) + "px";
      tip = H("div", { class: "lx-coach", role: "dialog", "aria-label": "Tip " + (k + 1) + " of " + steps.length }, root);
      H("span", { class: "cn", text: (k + 1) + " of " + steps.length }, tip);
      H("p", { html: LX.rich(s.text) }, tip);
      var row = H("div", { class: "row" }, tip);
      H("button", { class: "skip", type: "button", text: "Skip tour", onclick: function () { end(); } }, row);
      var nx = H("button", { type: "button", text: k === steps.length - 1 ? "Got it" : "Next tip", onclick: function () { if (k === steps.length - 1) end(); else show(k + 1); } }, row);
      var tw = Math.min(290, rr.width - 16), left = clamp(r.left - rr.left + r.width / 2 - tw / 2, 8, rr.width - tw - 8);
      tip.style.width = tw + "px"; tip.style.left = left + "px";
      tip.style.setProperty("--ax", clamp(r.left - rr.left + r.width / 2 - left - 6, 14, tw - 26) + "px");
      var th = tip.offsetHeight, above = r.top - rr.top - th - 16 > 0 && (s.above || r.bottom + th + 24 > window.innerHeight);
      if (above) { tip.style.top = (r.top - rr.top - th - 14) + "px"; tip.classList.add("above"); }
      else { tip.style.top = (r.bottom - rr.top + 14) + "px"; tip.classList.add("below"); }
      nx.focus({ preventScroll: true });
    }
    window.addEventListener("resize", function () { if (!ring) return; clearTimeout(rt); rt = setTimeout(function () { show(cur); }, 150); });
    return {
      start: function (k, force) {
        if (!force && opts.key && LX.store.get(opts.key, 0)) return false;
        back = document.activeElement;
        document.addEventListener("keydown", onKey);
        show(k || 0); return true;
      },
      end: end,
      active: function () { return !!ring; }
    };
  };
})();
