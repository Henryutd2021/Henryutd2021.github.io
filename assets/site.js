// site.js — site-wide behaviour (2026-10-30, second redesign: calm). Skip link, a thin shadow under the navbar
// once the page scrolls, and a gentle one-time fade-in of content blocks. No continuous animation anywhere.
// Without JS (or under reduced motion) every page is complete and static.
(function () {
  const root = document.documentElement;
  const body = document.body;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // skip link to the page's main landmark
  const main = document.querySelector("main");
  if (main) {
    if (!main.id) main.id = "main-content";
    const skip = document.createElement("a");
    skip.className = "skip-link"; skip.href = "#" + main.id; skip.textContent = "Skip to main content";
    body.insertBefore(skip, body.firstChild);
  }

  // navbar: thin shadow once scrolled
  function onScroll() { body.classList.toggle("scrolled", window.scrollY > 8); }
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  // gentle fade-in, once per block
  const auto = document.querySelectorAll("main .card, main .glow-card, main .pub-item, main .project-card, main .theme-section, main .reveal-auto > *");
  auto.forEach(function (el) { el.classList.add("reveal"); });
  const items = document.querySelectorAll(".reveal");
  if (!reduce && "IntersectionObserver" in window) {
    root.classList.add("js-reveal");
    const io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { rootMargin: "0px 0px -6% 0px", threshold: 0.06 });
    items.forEach(function (el) { io.observe(el); });
  } else {
    items.forEach(function (el) { el.classList.add("in"); });
  }
})();
