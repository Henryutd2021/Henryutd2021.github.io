/* causal.js — LX.CausalChain: cause and effect as linked steps, each with a title, one sentence and a number.
   LX.CausalChain(host, { title: "Cause and effect: a cloud at 14:00",
     links: [{title: "Clouds cover the panels", text: "One sentence.", value: "149 → 112 MW"}, ...],   (3 to 6 links)
     note: "One or two sentences after the chain." });
   "Play the chain" lights the steps in turn (all at once under reduced motion). The chain is an ordered list, so it reads
   in order without the arrows; on phones it runs top to bottom. */
(function () {
  "use strict";
  var LX = window.LX, H = LX.H;
  LX.CausalChain = function (host, o) {
    var hd = H("header", { class: "lx-x-head" }, host);
    H("h3", { text: o.title }, hd);
    var play = H("button", { class: "lx-btn ghost small", type: "button", html: LX.icon("play") + "Play the chain" }, hd);
    if (o.lede) H("p", { class: "lx-lede", html: LX.rich(o.lede) }, host);
    var ch = H("ol", { class: "lx-chain", style: "--n:" + o.links.length }, host);
    var els = o.links.map(function (l, i) {
      var d = H("li", { class: "lx-clink" }, ch);
      H("span", { class: "n", text: "Step " + (i + 1) }, d); H("b", { html: LX.rich(l.title) }, d);
      if (l.text) H("span", { html: LX.rich(l.text) }, d);
      if (l.value) H("em", { text: l.value }, d);
      return d;
    });
    if (o.note) H("p", { class: "lx-hint", html: LX.rich(o.note) }, host);
    var tm = null;
    play.addEventListener("click", function () {
      clearInterval(tm); els.forEach(function (e) { e.classList.remove("on"); });
      var k = 0; if (LX.reduced()) { els.forEach(function (e) { e.classList.add("on"); }); return; }
      tm = setInterval(function () {
        if (k > 0) els[k - 1].classList.remove("on");
        if (k < els.length) els[k].classList.add("on"); else { clearInterval(tm); els.forEach(function (e) { e.classList.add("on"); }); }
        k++;
      }, 700);
    });
    return { el: ch };
  };
})();
