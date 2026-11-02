/* glossary.js — tap-to-define terms from learn/glossary.yml (built into assets/learn/data/glossary.json by build_learn.py).
   Markdown:  [frequency]{.lx-term term="frequency"}            (Pandoc writes data-term="frequency")
   HTML:      <span class="lx-term" data-term="frequency">frequency</span>
   JS text:   LX.rich("Keep the [[frequency|frequency]] at 60 Hz")   (any component that takes text accepts these marks)
   A marked term becomes a dotted-underlined button; tap, click, Enter or Space shows its one-sentence definition and the
   lesson that teaches it; Escape or a tap elsewhere closes it. Terms added later by JS are picked up automatically.
   Unknown ids stay plain text and log a warning, so a typo never breaks a page. */
(function () {
  "use strict";
  var LX = window.LX, H = LX.H;
  var G = null, pop = null, openBtn = null, pending = false;
  function close(refocus) {
    if (!pop) return;
    pop.hidden = true;
    if (openBtn) { openBtn.setAttribute("aria-expanded", "false"); openBtn.removeAttribute("aria-describedby"); if (refocus) openBtn.focus(); }
    openBtn = null;
  }
  function open(btn) {
    if (openBtn === btn) return close(false);
    close(false);
    var g = G && G[btn.getAttribute("data-term")]; if (!g) return;
    if (!pop) {
      pop = H("div", { class: "lx-pop", id: "lx-pop", role: "tooltip", hidden: true }, document.body);
      document.addEventListener("click", function (e) { if (openBtn && !pop.contains(e.target) && e.target !== openBtn) close(false); });
      document.addEventListener("keydown", function (e) { if (e.key === "Escape" && openBtn) close(true); });
      window.addEventListener("resize", function () { close(false); });
    }
    pop.innerHTML = "";
    H("b", { text: g.term }, pop); H("p", { text: g.short }, pop);
    var here = LX.lesson();
    if (g.lesson != null && !(here && here.starter === g.lesson)) H("a", { href: LX.base + "../../learn/index.html#lesson-" + g.lesson, text: "Taught in lesson " + g.lesson }, pop);
    pop.hidden = false; openBtn = btn;
    btn.setAttribute("aria-expanded", "true"); btn.setAttribute("aria-describedby", "lx-pop");
    var r = btn.getBoundingClientRect(), pw = Math.min(300, window.innerWidth - 24);
    pop.style.width = pw + "px";
    var left = Math.max(12, Math.min(window.innerWidth - pw - 12, r.left + r.width / 2 - pw / 2));
    var top = r.bottom + 8, ph = pop.offsetHeight;
    if (top + ph > window.innerHeight - 8 && r.top - ph - 8 > 0) top = r.top - ph - 8;
    pop.style.left = (left + window.scrollX) + "px"; pop.style.top = (top + window.scrollY) + "px";
  }
  function upgrade(root) {
    if (!G) return;
    (root || document).querySelectorAll(".lx-term[data-term]:not(.on)").forEach(function (t) {
      var id = t.getAttribute("data-term");
      if (!G[id]) { console.warn("Learn glossary: unknown term id '" + id + "'"); t.classList.add("on", "plain"); return; }
      t.classList.add("on"); t.setAttribute("role", "button"); t.setAttribute("tabindex", "0"); t.setAttribute("aria-expanded", "false");
      t.setAttribute("title", "Tap for the definition of " + G[id].term);
      t.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); open(t); });
      t.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(t); } });
    });
  }
  LX.glossary = { upgrade: upgrade, get: function (id) { return G && G[id]; } };
  LX.ready(function () {
    if (!document.querySelector(".lx-term") && !document.querySelector(".lx-interactive, [data-lx-glossary]")) return;
    LX.json(LX.base + "data/glossary.json").then(function (g) {
      G = g; upgrade(document);
      if (window.MutationObserver) new MutationObserver(function () {
        if (pending) return; pending = true;
        requestAnimationFrame(function () { pending = false; upgrade(document); });
      }).observe(document.querySelector("main") || document.body, { childList: true, subtree: true });
    }, function (e) { console.warn("Learn glossary could not be loaded:", e); });
  });
})();
