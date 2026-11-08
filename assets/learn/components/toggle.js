/* toggle.js — LX.Toggle: an on/off switch button (lesson 10 switches the rules of its linear program on and off with
   it).
   var t = LX.Toggle(host, { label: "CO₂ cap", on: true, onChange: function (on) {} });
     label      the words beside the switch
     on         the starting state (default false)
     onChange   called with the new state after every press
   -> { el (the button), set(on) (no onChange), val() }
   Put several in <div class="lx-toggles" role="group" aria-label="..."> to wrap them in a row.
   Keyboard: a real <button> with aria-pressed (Tab, then Enter or Space); the switch is drawn in CSS and hidden from screen
   readers. No chart, so no text version is needed. */
(function () {
  "use strict";
  var LX = window.LX, H = LX.H;
  LX.Toggle = function (host, o) {
    var on = !!o.on, b = H("button", { type: "button", class: "lx-toggle", "aria-pressed": on ? "true" : "false" }, host);
    H("i", { "aria-hidden": "true" }, b); H("span", { text: o.label }, b);
    function paint() { b.setAttribute("aria-pressed", on ? "true" : "false"); }
    b.addEventListener("click", function () { on = !on; paint(); if (o.onChange) o.onChange(on); });
    return { el: b, set: function (v) { on = !!v; paint(); }, val: function () { return on; } };
  };
})();
