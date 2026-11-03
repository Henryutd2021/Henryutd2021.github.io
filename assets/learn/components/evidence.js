/* evidence.js — LX.EvidenceLadder: the stages a project or claim climbs (announced ... at design output), drawn as a
   ladder with the highest rung on top, and claims the reader places on it (curriculum v2 §16; promoted from N1, W1
   2026-11-02).
   LX.EvidenceLadder(host, { title: "The evidence ladder", lede: "One or two sentences.",
     rungs: [{ id: "announced", label: "Announced", text: "One line." }, ...],      lowest rung first; numbered 1..n from the bottom
     off: { id: "projection", label: "A projection is not on the ladder" },         optional: a box under the ladder for claims
                                                                                    that sit on no rung (also a choice in each list)
     items: [{ id: "a", text: "A claim from the lesson", answer: ["operating"], note: "One or two sentences." }, ...],
     placeholder: "Where does it sit?", textLabel: "Text version of the ladder", onPlace: function (item, choice, ok) {} });
   Each claim gets a labelled <select>. Choosing a rung highlights it (or the off box) and shows "Right." or "Not quite."
   with the claim's note; any rung in item.answer counts as right.
   Returns { el, place(itemId, rungId) } (place sets a claim's choice as if the reader had chosen it).
   Keyboard: native selects. Text version: details.lx-textalt with every rung (lowest first) and every claim with its note.
   On narrow screens (≤ 760 px) the claims go under the ladder. Pure (Node): LX.EvidenceLadder.check(item, rungId). */
(function () {
  "use strict";
  function check(item, choice) { return (item.answer || []).indexOf(choice) >= 0; }
  if (typeof module !== "undefined" && module.exports) module.exports = { check: check };
  if (typeof window === "undefined" || !window.LX) return;

  var LX = window.LX, H = LX.H;
  LX.EvidenceLadder = function (host, o) {
    if (o.title) { var hd = H("header", { class: "lx-x-head" }, host); H("h3", { text: o.title }, hd); }
    if (o.lede) H("p", { class: "lx-lede", html: LX.rich(o.lede) }, host);
    var lad = H("div", { class: "lx-ladder" }, host), left = H("div", null, lad);
    var rungs = H("ol", { class: "lx-rungs", "aria-label": "Rungs, highest first" }, left), rli = {};
    o.rungs.slice().reverse().forEach(function (r) {
      var i = o.rungs.indexOf(r) + 1, li = H("li", null, rungs);
      H("span", { class: "k", text: i }, li); var d = H("div", null, li); H("b", { text: r.label }, d); H("small", { text: r.text }, d);
      rli[r.id] = li;
    });
    var off = o.off ? H("p", { class: "lx-ladder-off", text: o.off.label }, left) : null;
    var place = H("ul", { class: "lx-ladder-place" }, lad), sels = {};
    function show(s) { Object.keys(rli).forEach(function (k) { rli[k].classList.toggle("hit", k === s); }); if (off) off.classList.toggle("hit", s === o.off.id); }
    o.items.forEach(function (it) {
      var li = H("li", null, place), id = LX.uid("ld");
      H("label", { for: id, text: it.text }, li);
      var s = H("select", { id: id }, li);
      H("option", { value: "", text: o.placeholder || "Where does it sit?" }, s);
      o.rungs.forEach(function (r) { H("option", { value: r.id, text: r.label }, s); });
      if (o.off) H("option", { value: o.off.id, text: o.off.label }, s);
      var fb = H("div", { "aria-live": "polite" }, li);
      s.addEventListener("change", function () {
        show(s.value);
        fb.innerHTML = ""; if (!s.value) return;
        var ok = check(it, s.value);
        H("div", { class: "lx-saw" + (ok ? "" : " no"), html: LX.icon(ok ? "check" : "question") + "<div><b>" + (ok ? "Right." : "Not quite.") + "</b> " + LX.esc(it.note) + "</div>" }, fb);
        if (o.onPlace) o.onPlace(it, s.value, ok);
      });
      sels[it.id] = s;
    });
    var alt = H("details", { class: "lx-textalt" }, host); H("summary", { text: o.textLabel || "Text version of the ladder" }, alt);
    var ol = H("ol", null, alt);
    o.rungs.forEach(function (r) { H("li", { text: r.label + ": " + r.text }, ol); });
    var ul = H("ul", null, alt);
    o.items.forEach(function (it) { H("li", { text: it.text + ": " + it.note }, ul); });
    return {
      el: lad,
      place: function (itemId, rungId) { var s = sels[itemId]; if (!s) return; s.value = rungId || ""; s.dispatchEvent(new Event("change")); }
    };
  };
  LX.EvidenceLadder.check = check;
})();
