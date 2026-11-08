/* scalestrip.js — LX.ScaleStrip: the course's five scales (S0 device and plant ... S4 nation) side by side
   (e-scale-strip; used by F1's explain layer and R3's self-check). One card per scale, its top edge in the
   scale's colour (--lx-scale-0 ... 4, day and night, in scalestrip.css), with the parts a lesson asks for.
   var ss = LX.ScaleStrip(host, {
     title: "Five scales at a glance", lede: "One sentence.",   an h3 in .lx-x-head and a lede (both optional)
     scales: [{ id: "S0", name: "Device and plant", power: "W to MW", who: "the owner ...", decides: "what to install ...",
                step: "minutes to an hour", horizon: "a day to the equipment's life" }, ...],   in order, S0 first
     power: true,          each scale's power range at its top right (s.power)
     decides: true,        "Decides <decides>; <who>." instead of <who> alone
     steps: true,          its typical time step and horizon (s.step, s.horizon)
     flow: true,           above the strip, what passes between scales: prices, tariffs, limits and targets down; load
                           profiles, flexibility, forecasts and needs up ({ down: "...", up: "..." } changes the words)
     ticks: { S0: { who: true, what: false, physics: null } },   the reader's sorts on each scale (true right, false placed
                           elsewhere, null not sorted yet), in words and with an icon; tickKeys: [["who", "Who"], ...]
                           names them (default who, what, physics); a sentence for screen readers sums them up
     lessons: { S0: [{ code: 1 }, { code: "F3", note: "energy services" }, { href: "x.html", label: "X" }] },   "Go
                           further:" per scale; with `path` (data/path.json) a lesson is linked when it is live and named
                           "upcoming" (with its note) otherwise (LX.lessonRef); an {href, label} item is always linked
     path: P,
     mark: "S1", markText: "Your brief sits here.",   one scale marked (an outlined card and a line of text)
     color: "var(--lx-tier-4)",   one colour for every card's top edge (default: each scale's own colour)
     label: "Five scales" });     the list's accessible name
   Returns { el, update(patch) }: update() redraws the cards with some options changed (mark, markText, ticks, lessons).
   Layout: five columns from 861 px, one card per row below. The list is its own text version.
   Node: module.exports = { scaleIndex, colorOf, lessonParts, tickSummary, TICKS } (pure). */
(function () {
  "use strict";
  // ---------------------------------------------------------------- pure (no DOM; exported for Node)
  var TICKS = [["who", "Who"], ["what", "What"], ["physics", "Physics"]];
  var FLOW = { down: "Passed down: prices, tariffs, limits, targets", up: "Passed up: load profiles, flexibility, forecasts, siting needs" };
  // "S3" -> 3 (the scale's place on the ladder and its colour token)
  function scaleIndex(id) { var m = /^S([0-4])$/.exec(String(id)); return m ? +m[1] : -1; }
  function colorOf(s, one) { var i = scaleIndex(s.id); return one || (i >= 0 ? "var(--lx-scale-" + i + ")" : "var(--lx-ink-3)"); }
  // a scale's "Go further" list split into live links and upcoming names; ref = LX.lessonRef (core.js)
  function lessonParts(items, P, ref) {
    var live = [], soon = [];
    (items || []).forEach(function (x) {
      if (x.href) { live.push({ href: x.href, label: x.label || x.href }); return; }
      var r = ref ? ref(P, x.code) : { ready: false, label: typeof x.code === "number" ? "lesson " + x.code : String(x.code) };
      if (r.ready) live.push({ href: r.href, label: r.label });
      else soon.push(r.label + (x.note ? " (" + x.note + ")" : ""));
    });
    return { live: live, upcoming: soon };
  }
  // one sentence for screen readers: the reader's sorts, scale by scale
  function tickSummary(scales, ticks, keys) {
    keys = keys || TICKS;
    return "Your sorts, scale by scale: " + scales.map(function (s) {
      var r = (ticks && ticks[s.id]) || {};
      return s.id + " " + keys.map(function (k) { var v = r[k[0]]; return k[0] + " " + (v == null ? "not sorted" : v ? "right" : "elsewhere"); }).join(", ");
    }).join("; ") + ".";
  }
  var api = { scaleIndex: scaleIndex, colorOf: colorOf, lessonParts: lessonParts, tickSummary: tickSummary, TICKS: TICKS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H;
  LX.ScaleStrip = function (host, o) {
    o = Object.assign({}, o);
    var box = H("div", { class: "lx-ss" }, host);
    if (o.title) { var hd = H("header", { class: "lx-x-head" }, box); H("h3", { text: o.title }, hd); }
    if (o.lede) H("p", { class: "lx-lede", html: LX.rich(o.lede) }, box);
    if (o.flow) {
      var fw = o.flow === true ? FLOW : { down: o.flow.down || FLOW.down, up: o.flow.up || FLOW.up };
      var flow = H("div", { class: "lx-ss-flow", "aria-hidden": "true" }, box);
      H("span", { class: "down", html: LX.icon("back") + LX.esc(fw.down) }, flow);
      H("span", { class: "up", html: LX.esc(fw.up) + LX.icon("arrow") }, flow);
    }
    var ol = H("ol", { class: "lx-ss-strip", "aria-label": o.label || "Five scales" }, box);
    var sr = H("p", { class: "lx-sr" }, box);
    function draw() {
      ol.innerHTML = "";
      o.scales.forEach(function (s) {
        var marked = o.mark && s.id === o.mark;
        var li = H("li", { class: marked ? "is-marked" : null, style: "--c:" + colorOf(s, o.color) }, ol);
        var top = H("div", { class: "lx-ss-top" }, li);
        H("span", { class: "lx-ss-code", text: s.id }, top);
        if (o.power && s.power) H("span", { class: "lx-ss-pw", text: s.power }, top);
        H("b", { class: "lx-ss-name", text: s.name }, li);
        if (o.decides && s.decides) H("span", { class: "lx-ss-who", text: "Decides " + s.decides + (s.who ? "; " + s.who : "") + "." }, li);
        else if (s.who) H("span", { class: "lx-ss-who", text: s.who }, li);
        if (o.steps) {
          if (s.step) H("span", { class: "lx-ss-line", text: "Time step: " + s.step + "." }, li);
          if (s.horizon) H("span", { class: "lx-ss-line", text: "Horizon: " + s.horizon + "." }, li);
        }
        if (o.ticks) {
          var r = o.ticks[s.id] || {}, row = H("div", { class: "lx-ss-res", "aria-label": "Your sorts for " + s.name }, li);
          (o.tickKeys || TICKS).forEach(function (k) {
            var v = r[k[0]], cls = v == null ? "na" : v ? "ok" : "no";
            H("span", { class: "lx-ss-tick " + cls, html: (v == null ? "" : LX.icon(v ? "check" : "cross")) + LX.esc(k[1]),
              title: k[1] + ": " + (v == null ? "not sorted yet" : v ? "placed right" : "placed elsewhere") }, row);
          });
        }
        if (o.lessons) {
          var L = lessonParts(o.lessons[s.id], o.path, LX.lessonRef);
          if (L.live.length || L.upcoming.length) {
            var les = H("p", { class: "lx-ss-les" }, li);
            H("span", { text: "Go further: " }, les);
            L.live.forEach(function (x, k) { if (k) les.appendChild(document.createTextNode(", ")); H("a", { href: x.href, text: x.label }, les); });
            if (L.upcoming.length) les.appendChild(document.createTextNode((L.live.length ? "; upcoming: " : "upcoming: ") + L.upcoming.join(", ")));
          }
        }
        if (marked && o.markText) H("span", { class: "lx-ss-tag", text: o.markText }, li);
      });
      sr.textContent = o.ticks ? tickSummary(o.scales, o.ticks, o.tickKeys) : "";
      sr.hidden = !o.ticks;
      if (LX.emit) LX.emit("layout");
    }
    draw();
    return { el: box, update: function (patch) { Object.keys(patch || {}).forEach(function (k) { o[k] = patch[k]; }); draw(); } };
  };
  Object.keys(api).forEach(function (k) { LX.ScaleStrip[k] = api[k]; });
})();
