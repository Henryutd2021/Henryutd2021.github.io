// site.js — site-wide behaviour (third redesign, 2026-10-30): skip link, navbar shadow once scrolled,
// back-to-top button, and a gentle one-time fade-in of content blocks. Without JS every page is complete.
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

  // back-to-top button
  const top = document.createElement("button");
  top.type = "button"; top.className = "to-top"; top.setAttribute("aria-label", "Back to top");
  top.innerHTML = '<i class="bi bi-arrow-up" aria-hidden="true"></i>';
  top.addEventListener("click", function () { window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" }); });
  body.appendChild(top);

  function onScroll() {
    const y = window.scrollY;
    body.classList.toggle("scrolled", y > 8);
    top.classList.toggle("show", y > window.innerHeight * 0.8);
  }
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  // gentle fade-in, once per block
  const auto = document.querySelectorAll("main .card, main .glow-card, main .reveal-auto > *");
  auto.forEach(function (el) { el.classList.add("reveal"); });
  const items = document.querySelectorAll(".reveal");
  if (!reduce && "IntersectionObserver" in window) {
    root.classList.add("js-reveal");
    const io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { rootMargin: "0px 0px -5% 0px", threshold: 0.05 });
    items.forEach(function (el) { io.observe(el); });
  } else {
    items.forEach(function (el) { el.classList.add("in"); });
  }
})();
