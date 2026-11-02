/* controls.js — LX.Slider: a big, keyboard-friendly slider with − / + buttons and a shaded "reachable now" band.
   const s = LX.Slider(host, { label: "Gas combined-cycle", color: "var(--lx-cc)", max: 150, step: 5, unit: "MW",
                               hint: function (lo, hi, max) { return "..."; }, onChange: function (v) {} });
   s.set(v) | s.range(lo, hi)  (values outside are clamped, and the hint nudges) | s.val() | s.disable(true) | s.input | s.el
   Arrow keys move one step (native range input); the − / + buttons have spoken labels. */
(function () {
  "use strict";
  var LX = window.LX, H = LX.H, clamp = LX.clamp;
  LX.Slider = function (host, o) {
    var id = o.id || LX.uid("sl"), unit = o.unit || "MW", step = o.step || 1, max = o.max, min = o.min || 0;
    var w = H("div", { class: "lx-ctl " + (o.cls || ""), style: "--c:" + (o.color || "var(--lx-ink)") }, host);
    var top = H("div", { class: "lx-ctl-top" }, w);
    var lab = H("label", { for: id }, top); H("i", null, lab); H("span", { text: o.label }, lab);
    var out = H("output", { for: id }, top);
    var row = H("div", { class: "lx-ctl-row" }, w);
    var minus = H("button", { type: "button", "aria-label": "Turn down " + o.label + " by " + step + " " + unit, text: "−" }, row);
    var tr = H("div", { class: "lx-ctl-track" }, row);
    H("div", { class: "lx-ctl-rail" }, tr);
    var band = H("div", { class: "lx-ctl-band" }, tr), fill = H("div", { class: "lx-ctl-fill" }, tr);
    var inp = H("input", { type: "range", id: id, min: min, max: max, step: step, value: min }, tr);
    var plus = H("button", { type: "button", "aria-label": "Turn up " + o.label + " by " + step + " " + unit, text: "+" }, row);
    var hint = H("p", { class: "lx-ctl-hint" }, w);
    var lo = min, hi = max, val = min, fixedHint = null;
    function pos(v) { return (13 + ((v - min) / (max - min)) * (tr.clientWidth - 26)) / Math.max(1, tr.clientWidth) * 100; }
    function paint() {
      inp.value = val; out.textContent = val + " " + unit;
      inp.setAttribute("aria-valuetext", val + " " + unit + (lo > min || hi < max ? ", reachable now " + lo + " to " + hi : ""));
      band.style.left = "calc(" + pos(lo) + "% - 4px)"; band.style.width = "calc(" + (pos(hi) - pos(lo)) + "% + 8px)";
      fill.style.width = pos(val) + "%";
      hint.innerHTML = fixedHint != null ? fixedHint : (o.hint ? LX.rich(o.hint(lo, hi, max)) : "");
    }
    function setV(v, user) {
      var want = Math.round(v / step) * step, c = clamp(want, lo, hi);
      if (user && c !== want) { hint.classList.remove("bump"); void hint.offsetWidth; hint.classList.add("bump"); }
      var changed = c !== val; val = c; paint();
      if (user && changed && o.onChange) o.onChange(val);
    }
    inp.addEventListener("input", function () { setV(+inp.value, true); });
    minus.addEventListener("click", function () { setV(val - step, true); });
    plus.addEventListener("click", function () { setV(val + step, true); });
    if (window.ResizeObserver) new ResizeObserver(paint).observe(tr);
    paint();
    return {
      el: w, input: inp,
      set: function (v) { setV(v, false); },
      range: function (a, b) { lo = a; hi = b; setV(val, false); },
      val: function () { return val; },
      hint: function (t) { fixedHint = t; paint(); },
      disable: function (d) { inp.disabled = d; minus.disabled = d; plus.disabled = d; }
    };
  };
})();
