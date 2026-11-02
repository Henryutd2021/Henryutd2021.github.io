/* energychain.js — LX.EnergyChain: where the energy goes, stop by stop, with an icon and one number per stop.
   LX.EnergyChain(host, { title: "From plant to lamp", aside: "Typical U.S. values", lede: "One or two sentences.",
     stops: [{icon: "plant", title: "Power plant", text: "makes it", value: "about 20 kV"}, ...] });   (3 to 5 stops)
   Icons are names in LX.IC. A dashed "current" runs between the stops (still under reduced motion). An ordered list,
   so it reads in order without the picture. */
(function () {
  "use strict";
  var LX = window.LX, H = LX.H;
  LX.EnergyChain = function (host, o) {
    var hd = H("header", { class: "lx-x-head" }, host);
    H("h3", { text: o.title }, hd);
    if (o.aside) H("span", { class: "lx-hint", text: o.aside }, hd);
    if (o.lede) H("p", { class: "lx-lede", html: LX.rich(o.lede) }, host);
    var ch = H("ol", { class: "lx-echain", style: "--n:" + o.stops.length }, host);
    o.stops.forEach(function (s) {
      var d = H("li", { class: "lx-estop" }, ch);
      H("span", { class: "ic", html: LX.icon(s.icon) }, d);
      H("b", { html: LX.rich(s.title) }, d); if (s.text) H("span", { html: LX.rich(s.text) }, d); if (s.value) H("em", { text: s.value }, d);
    });
    return { el: ch };
  };
})();
