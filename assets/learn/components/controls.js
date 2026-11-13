/* controls.js — LX.Slider: a big, keyboard-friendly slider with − / + buttons and a shaded "reachable now" band.
   const s = LX.Slider(host, { label: "Gas combined-cycle", color: "var(--lx-cc)", max: 150, step: 5, unit: "MW",
                               hint: function (lo, hi, max, val) { return "..."; }, onChange: function (v) {} });
   Options:  min (default 0), max, step (default 1), value (start; default min), unit ("MW"; used when there is no fmt),
             fmt: function (v) -> text   formats the output, the spoken value and the hint's numbers ("$1,230/kW", "7.5%")
             downLabel / upLabel          spoken names of the − / + buttons (default "Turn down <label> by <step>")
             id, cls (extra class on the control)
   Decimal-safe: values snap to min + k × step and are rounded to the step's decimals, so a 0.1 or 0.05 step never shows
   floating-point noise (0.30000000000000004).
   A start value or set() value off the grid (or outside min..max) still snaps to the nearest step, and is reported:
   a console warning naming the slider, and o.onSnap(asked, shown) when given; the reader's own moves always land on it.
   s.set(v[, fire]) (fire: also call onChange) | s.range(lo, hi)  (values outside are clamped, and the hint nudges) |
   s.val() | s.hint(text) (fixed hint; s.hint() repaints from o.hint) | s.disable(true) | s.input | s.el
   Arrow keys move one step (native range input); the − / + buttons have spoken labels. */
(function () {
  "use strict";
  var LX = window.LX, H = LX.H, clamp = LX.clamp;
  LX.Slider = function (host, o) {
    var id = o.id || LX.uid("sl"), unit = o.unit || "MW", step = o.step || 1, max = o.max, min = o.min || 0;
    var dec = Math.min(10, (String(step).split(".")[1] || "").length + (String(min).split(".")[1] || "").length);
    var fmt = o.fmt || function (v) { return v + " " + unit; };
    var w = H("div", { class: "lx-ctl " + (o.cls || ""), style: "--c:" + (o.color || "var(--lx-ink)") }, host);
    var top = H("div", { class: "lx-ctl-top" }, w);
    var lab = H("label", { for: id }, top); H("i", null, lab); H("span", { text: o.label }, lab);
    var out = H("output", { for: id }, top);
    var row = H("div", { class: "lx-ctl-row" }, w);
    var downL = o.downLabel ? o.downLabel + " " + o.label : (o.fmt ? "Lower " + o.label : "Turn down " + o.label + " by " + step + " " + unit);
    var upL = o.upLabel ? o.upLabel + " " + o.label : (o.fmt ? "Raise " + o.label : "Turn up " + o.label + " by " + step + " " + unit);
    var minus = H("button", { type: "button", "aria-label": downL, text: "−" }, row);
    var tr = H("div", { class: "lx-ctl-track" }, row);
    H("div", { class: "lx-ctl-rail" }, tr);
    var band = H("div", { class: "lx-ctl-band" }, tr), fill = H("div", { class: "lx-ctl-fill" }, tr);
    var inp = H("input", { type: "range", id: id, min: min, max: max, step: step, value: min }, tr);
    var plus = H("button", { type: "button", "aria-label": upL, text: "+" }, row);
    var hint = H("p", { class: "lx-ctl-hint" }, w);
    function snap(v) { return +((Math.round((v - min) / step) * step + min).toFixed(dec)); }
    // a value given by the page (the start value, or set()) that is not on the grid min + k × step, or outside min..max,
    // is shown as the nearest step: say so (console warning and o.onSnap), so a page never shows one number and uses another
    // (a value on the grid that set() clamps into the reachable band, range(), is not reported: that is the band's job);
    // `shown` is the value the slider then holds
    function offGrid(v, shown, why) {
      if (typeof v !== "number" || !isFinite(v) || Math.abs(v - clamp(snap(v), min, max)) <= 1e-9 * (1 + Math.abs(v))) return;
      if (window.console && console.warn) console.warn("LX.Slider \"" + o.label + "\": " + why + " " + v + " is " + (v < min || v > max ? "outside " + min + " to " + max : "off its steps of " + step + " from " + min) + "; it shows " + shown + ".");
      if (o.onSnap) o.onSnap(v, shown);
    }
    var lo = min, hi = max, val = o.value == null ? min : clamp(snap(o.value), min, max), fixedHint = null;
    if (o.value != null) offGrid(o.value, val, "start value");
    function pos(v) { return (13 + ((v - min) / (max - min)) * (tr.clientWidth - 26)) / Math.max(1, tr.clientWidth) * 100; }
    function paint() {
      inp.value = val; out.textContent = fmt(val);
      inp.setAttribute("aria-valuetext", fmt(val) + (lo > min || hi < max ? ", reachable now " + fmt(lo) + " to " + fmt(hi) : ""));
      band.style.left = "calc(" + pos(lo) + "% - 4px)"; band.style.width = "calc(" + (pos(hi) - pos(lo)) + "% + 8px)";
      fill.style.width = pos(val) + "%";
      hint.innerHTML = fixedHint != null ? fixedHint : (o.hint ? LX.rich(o.hint(lo, hi, max, val)) : "");
    }
    function setV(v, user) {
      var want = snap(v), c = clamp(want, lo, hi);
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
      set: function (v, fire) { setV(v, !!fire); offGrid(+v, val, "value"); },
      range: function (a, b) { lo = a; hi = b; setV(val, false); },
      val: function () { return val; },
      hint: function (t) { fixedHint = t; paint(); },   // hint() with no text: back to the o.hint function
      disable: function (d) { inp.disabled = d; minus.disabled = d; plus.disabled = d; }
    };
  };
})();
