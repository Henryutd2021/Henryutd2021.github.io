// home.js — full-screen home page behaviour (2026-10-30 redesign). Runs only when .hero-full exists.
// 1) the hero's living energy network (canvas), 2) rotating focus line, 3) timeline fill on scroll,
// 4) small touches: pub cards get the cursor glow, portrait parallax. No libraries.
(function () {
  const hero = document.querySelector(".hero-full");
  if (!hero) return;
  document.body.classList.add("home-page");
  // motion is off under the system reduced-motion setting or the "Pause motion" switch (site.js); it can change live
  const off = function () { return window.siteMotionOff ? window.siteMotionOff() : window.matchMedia("(prefers-reduced-motion: reduce)").matches; };

  /* ---------- 1. energy network ---------- */
  const canvas = hero.querySelector(".hero-canvas");
  const ctx = canvas && canvas.getContext("2d");
  // theme colors: hydrogen teal, data-center violet, carbon green, microgrid amber, wind blue, flow cyan
  const COLORS = [[45, 212, 191], [167, 139, 250], [74, 222, 128], [251, 191, 36], [96, 165, 250], [56, 189, 248]];
  const WEIGHTS = [0.24, 0.16, 0.12, 0.12, 0.14, 0.22];
  let W = 0, H = 0, dpr = 1, nodes = [], edges = [], particles = [], pulses = [], running = false, visible = true, raf = 0;
  const mouse = { x: -9999, y: -9999, on: false };

  function pickColor() {
    let r = Math.random(), i = 0;
    for (; i < WEIGHTS.length - 1; i++) { r -= WEIGHTS[i]; if (r <= 0) break; }
    return COLORS[i];
  }

  function build() {
    const rect = hero.getBoundingClientRect();
    W = rect.width; H = rect.height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const small = W < 700;
    const n = Math.max(22, Math.min(small ? 38 : 96, Math.round((W * H) / (small ? 14000 : 17000))));
    nodes = [];
    // jittered grid placement keeps the network evenly spread; denser on the right where there is no text
    const cols = Math.ceil(Math.sqrt(n * W / H)), rows = Math.ceil(n / cols);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (nodes.length >= n) break;
        const x = (c + 0.15 + Math.random() * 0.7) / cols * W, y = (r + 0.15 + Math.random() * 0.7) / rows * H;
        if (!small && x < W * 0.42 && Math.random() < 0.45) continue; // thinner behind the copy
        const hub = Math.random() < 0.12;
        nodes.push({ ax: x, ay: y, x: x, y: y, ph: Math.random() * Math.PI * 2, sp: 0.15 + Math.random() * 0.25,
          amp: 10 + Math.random() * 22, r: hub ? 3.2 + Math.random() * 1.6 : 1.4 + Math.random() * 1.4,
          hub: hub, c: hub ? COLORS[Math.floor(Math.random() * 5)] : pickColor(), glow: 0 });
      }
    }
    // edges: each node to its 2-3 nearest neighbours (undirected, no duplicates)
    edges = [];
    const seen = new Set(), maxD = Math.max(W, H) * 0.22;
    nodes.forEach(function (a, i) {
      const near = nodes.map(function (b, j) { return [j, (a.ax - b.ax) ** 2 + (a.ay - b.ay) ** 2]; })
        .filter(function (p) { return p[0] !== i; }).sort(function (p, q) { return p[1] - q[1]; })
        .slice(0, a.hub ? 4 : 2 + (Math.random() < 0.4 ? 1 : 0));
      near.forEach(function (p) {
        if (Math.sqrt(p[1]) > maxD) return;
        const key = Math.min(i, p[0]) + "-" + Math.max(i, p[0]);
        if (!seen.has(key)) { seen.add(key); edges.push([i, p[0]]); }
      });
    });
    // energy packets travelling along edges
    particles = [];
    const np = Math.round(edges.length * (small ? 0.35 : 0.55));
    for (let k = 0; k < np; k++) particles.push(newParticle());
    pulses = [];
  }

  function newParticle() {
    const e = edges[Math.floor(Math.random() * edges.length)] || [0, 0];
    const fwd = Math.random() < 0.5;
    return { e: e, a: fwd ? e[0] : e[1], b: fwd ? e[1] : e[0], t: Math.random(), v: 0.0025 + Math.random() * 0.0055 };
  }

  function rgba(c, a) { return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")"; }

  let last = 0, nextPulse = 0;
  function frame(now) {
    const t = now / 1000, dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
    last = now;
    ctx.clearRect(0, 0, W, H);

    // drift and cursor influence
    nodes.forEach(function (p) {
      p.x = p.ax + Math.cos(t * p.sp + p.ph) * p.amp;
      p.y = p.ay + Math.sin(t * p.sp * 0.8 + p.ph) * p.amp * 0.7;
      const d = mouse.on ? Math.hypot(p.x - mouse.x, p.y - mouse.y) : 1e9;
      const target = d < 170 ? 1 - d / 170 : 0;
      p.glow += (target - p.glow) * 0.08;
    });

    // edges
    ctx.lineWidth = 1;
    edges.forEach(function (e) {
      const a = nodes[e[0]], b = nodes[e[1]];
      const g = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
      const boost = Math.max(a.glow, b.glow);
      g.addColorStop(0, rgba(a.c, 0.10 + boost * 0.45));
      g.addColorStop(1, rgba(b.c, 0.10 + boost * 0.45));
      ctx.strokeStyle = g;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    });

    // cursor links
    if (mouse.on) {
      nodes.forEach(function (p) {
        if (p.glow > 0.25) {
          ctx.strokeStyle = rgba(p.c, p.glow * 0.5);
          ctx.beginPath(); ctx.moveTo(mouse.x, mouse.y); ctx.lineTo(p.x, p.y); ctx.stroke();
        }
      });
    }

    // packets
    ctx.globalCompositeOperation = "lighter";
    particles.forEach(function (q, k) {
      q.t += q.v * (dt * 60);
      if (q.t >= 1) {
        // continue onto a neighbouring edge, like flow through the network
        const nextEdges = edges.filter(function (e) { return (e[0] === q.b || e[1] === q.b) && !(e[0] === q.a || e[1] === q.a); });
        if (nextEdges.length && Math.random() < 0.85) {
          const e = nextEdges[Math.floor(Math.random() * nextEdges.length)];
          q.a = q.b; q.b = e[0] === q.b ? e[1] : e[0]; q.e = e; q.t = 0;
        } else { particles[k] = newParticle(); particles[k].t = 0; return; }
      }
      const a = nodes[q.a], b = nodes[q.b];
      const x = a.x + (b.x - a.x) * q.t, y = a.y + (b.y - a.y) * q.t;
      const tx = a.x + (b.x - a.x) * Math.max(0, q.t - 0.09), ty = a.y + (b.y - a.y) * Math.max(0, q.t - 0.09);
      const c = q.t < 0.5 ? a.c : b.c;
      ctx.strokeStyle = rgba(c, 0.55); ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(x, y); ctx.stroke();
      ctx.fillStyle = rgba(c, 0.95);
      ctx.beginPath(); ctx.arc(x, y, 1.6, 0, Math.PI * 2); ctx.fill();
    });

    // occasional pulse rings from hubs
    if (now > nextPulse) {
      const hubs = nodes.filter(function (p) { return p.hub; });
      if (hubs.length) { const h = hubs[Math.floor(Math.random() * hubs.length)]; pulses.push({ n: h, r: 0, a: 0.5 }); }
      nextPulse = now + 1600 + Math.random() * 2400;
    }
    pulses = pulses.filter(function (p) { return p.a > 0.01; });
    pulses.forEach(function (p) {
      p.r += 0.9 * (dt * 60); p.a *= 0.975;
      ctx.strokeStyle = rgba(p.n.c, p.a); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(p.n.x, p.n.y, p.r, 0, Math.PI * 2); ctx.stroke();
    });

    // nodes
    nodes.forEach(function (p) {
      const pulse = 0.5 + 0.5 * Math.sin(t * 2 + p.ph);
      const r = p.r * (1 + p.glow * 0.8) + (p.hub ? pulse * 0.8 : 0);
      const halo = r * (p.hub ? 6 : 4) * (1 + p.glow);
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, halo);
      g.addColorStop(0, rgba(p.c, (p.hub ? 0.35 : 0.22) + p.glow * 0.35));
      g.addColorStop(1, rgba(p.c, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.x, p.y, halo, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = rgba(p.c, 0.85 + p.glow * 0.15);
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
      if (p.hub) { ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.38, 0, Math.PI * 2); ctx.fill(); }
    });
    ctx.globalCompositeOperation = "source-over";

    if (running) raf = requestAnimationFrame(frame);
  }

  function start() { if (!running && visible && !document.hidden && !off()) { running = true; last = 0; raf = requestAnimationFrame(frame); } }
  function stop() { running = false; cancelAnimationFrame(raf); }

  if (ctx) {
    build();
    if (off()) { frame(performance.now()); } else { start(); }
    let resizeT = 0;
    window.addEventListener("resize", function () {
      clearTimeout(resizeT);
      resizeT = setTimeout(function () { build(); if (off() || !running) frame(performance.now()); }, 150);
    });
    document.addEventListener("visibilitychange", function () { document.hidden ? stop() : start(); });
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (en) { visible = en[0].isIntersecting; visible ? start() : stop(); }, { threshold: 0.02 }).observe(hero);
    }
    hero.addEventListener("pointermove", function (ev) {
      const r = hero.getBoundingClientRect();
      mouse.x = ev.clientX - r.left; mouse.y = ev.clientY - r.top; mouse.on = true;
    }, { passive: true });
    hero.addEventListener("pointerleave", function () { mouse.on = false; });
    document.addEventListener("motionchange", function (e) { if (e.detail.off) { stop(); frame(performance.now()); } else { start(); } });
  }

  /* ---------- 2. rotating focus line ---------- */
  const wrap = hero.querySelector(".rot-wrap");
  const words = Array.prototype.slice.call(hero.querySelectorAll(".rot-word"));
  if (wrap && words.length > 1) {
    let i = 0;
    const size = function () { wrap.style.width = words[i].offsetWidth + "px"; };
    wrap.classList.add("js"); size();
    window.addEventListener("resize", size);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(size);
    setInterval(function () {
      if (document.hidden || off() || !visible) return;  // paused, or the hero is off-screen
      const cur = words[i]; i = (i + 1) % words.length; const nxt = words[i];
      cur.classList.remove("is-on"); cur.classList.add("is-out");
      nxt.classList.remove("is-out"); nxt.classList.add("is-on"); size();
      setTimeout(function () { cur.classList.remove("is-out"); }, 600);
    }, 2800);
  }

  /* ---------- 3. timeline fill ---------- */
  const tl = document.querySelector(".home .timeline");
  if (tl) {
    const fill = function () {
      const r = tl.getBoundingClientRect(), vh = window.innerHeight;
      const k = off() ? 1 : Math.max(0, Math.min(1, (vh * 0.62 - r.top) / r.height));
      tl.style.setProperty("--fill", k.toFixed(3));
    };
    fill();
    window.addEventListener("scroll", fill, { passive: true });
    window.addEventListener("resize", fill);
  }

  /* ---------- 4. small touches ---------- */
  // publication cards (generated markdown): cursor glow and their own reveal, since site.js only scans <main>
  const pubs = document.querySelectorAll(".home-pubs .pub-item");
  pubs.forEach(function (el) { el.classList.add("glow-card"); });
  if (!off() && "IntersectionObserver" in window) {
    const io = new IntersectionObserver(function (en) {
      let n = 0;
      en.forEach(function (e) { if (e.isIntersecting) { e.target.style.setProperty("--i", n++); e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    pubs.forEach(function (el) { el.classList.add("reveal"); io.observe(el); });
  }
  document.querySelectorAll(".home-pubs .pub-link, .home .repo, .home .tile").forEach(function (a) {
    if (/^https?:/.test(a.getAttribute("href") || "") && a.host !== location.host) { a.target = "_blank"; a.rel = "noopener"; }
  });
  const portrait = hero.querySelector(".portrait");
  if (portrait && window.matchMedia("(pointer: fine)").matches) {
    hero.addEventListener("pointermove", function (ev) {
      if (off()) { portrait.style.transform = ""; return; }
      const r = hero.getBoundingClientRect();
      const dx = (ev.clientX - r.left) / r.width - 0.5, dy = (ev.clientY - r.top) / r.height - 0.5;
      portrait.style.transform = "translate3d(" + (dx * -14).toFixed(1) + "px," + (dy * -14).toFixed(1) + "px,0)";
    }, { passive: true });
    portrait.style.transition = "transform .6s cubic-bezier(.2,.8,.2,1)";
  }
})();
