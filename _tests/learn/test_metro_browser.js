// test_metro_browser.js — browser test of the course map (metro.js) in headless Chrome (wave W3, 2026-11-03; map v2:
// every lesson a station). At desktop, tablet and phone sizes, and in two short windows (a laptop's, a phone held
// sideways):
//   Stations
//     - every path.json lesson has exactly one station (starter path and tier lines) or toolbox chip, named after it,
//       whose card shows its title and, when it is live, a Start link to its page (else "Coming soon");
//     - live and upcoming states match path.json (open or up; nothing is done in a fresh browser);
//     - keyboard order: the doors, the starter path 0-13, then each tier line (its label, then its stations in
//       curriculum order), then the toolbox; an arrow key steps along a line.
//   Labels
//     - no two labels overlap, and no label covers another station or the route (bounding boxes in the window);
//     - every label is drawn at 11 px or more; when a door dims the other tiers, no text is faded.
//   Cards (every tier label, door, station and tool; the first and last station of each row also at the window's top
//   and bottom edges). Each card must:
//     - be a dialog with a name, take focus when opened from the keyboard;
//     - lie inside the map's box and inside the window below the sticky navbar;
//     - open near what opened it (the window scrolls by at most the card's height);
//     - have its last item reachable: the footer (and a tier card's last listed lesson) in view, or in view after its
//       body is scrolled to the end, in which case a "More below" cue shows until then;
//     - close on Escape, with focus back on the door, line label, station or tool that opened it.
//   Also: the layout mode (wide from a 720 px drawing when the starter names fit: at 1280 and 1024 px windows; narrow
//   below, drawn at most 560 px wide), the map bar's hint, that the map bar and legend fit, and no sideways scroll.
//   With --site it also opens and closes the "All lessons as a list" box.
// Page: by default a page built here around the worktree's own assets/learn/learn.js, learn.css and data/path.json, in a
//   frame like the site's (a sticky 65 px navbar, a 1120 px content column, 25.5 px gutters), so it needs no render;
//   --site <folder> runs it on a rendered site's learn/index.html instead (e.g. --site _site after quarto render);
//   --path <file> serves another path.json instead (e.g. a scratch copy at a later wave's density).
// Needs Google Chrome (CHROME=/path/to/chrome overrides the macOS default) and Node 22 or later (WebSocket, fetch).
// Usage (from the site folder):  node _tests/learn/test_metro_browser.js [--site _site] [--path file.json]
//        [--sizes 1280x900,375x667] [--motion reduce|no-preference]   (default reduce: cards appear at once)
"use strict";
const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const SITE = path.resolve(__dirname, "..", "..");
const argv = process.argv.slice(2), opt = {};
for (let i = 0; i < argv.length; i += 2) opt[argv[i].replace(/^--/, "")] = argv[i + 1];
const SIZES = (opt.sizes || "1280x900,1024x768,768x1024,720x900,719x900,414x896,375x667,1280x460,740x360").split(",").map(s => s.split("x").map(Number));
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sleep = ms => new Promise(r => setTimeout(r, ms));

// the test page: the course map in a frame like the site's (Bootstrap's border-box sizing, a sticky navbar, the content column)
const FIXTURE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Course map test page</title>
<style>*, ::before, ::after { box-sizing: border-box; } body { margin: 0; font-size: 16px; line-height: 1.5; }
#quarto-header { position: sticky; top: 0; z-index: 1030; height: 65px; background: #fff; border-bottom: 1px solid #ccd; }
.frame { padding: 24px 25.5px 0; } main.content { display: block; margin: 0 auto; } .lx-intro { min-height: 90px; }</style>
<link rel="stylesheet" href="../assets/learn/learn.css"></head>
<body class="page-learn page-learn-home"><header id="quarto-header"></header><div class="frame"><main class="content">
<div class="lx-intro">One small fictional town and a power grid you run yourself.</div>
<div class="lx-metro" data-lx-metro data-list="#lx-list"></div>
<details class="lx-listview" id="lx-list" open><summary>All lessons as a list</summary><p>The course as plain lists.</p></details>
<div style="height: 500px"></div></main></div>
<script src="../assets/learn/learn.js" defer></script></body></html>`;

const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".woff": "font/woff", ".woff2": "font/woff2" };
function serve() {
  const root = opt.site ? path.resolve(SITE, opt.site) : SITE;
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (!opt.site && p === "/learn/index.html") { res.writeHead(200, { "Content-Type": TYPES[".html"] }); res.end(FIXTURE); return; }
    let f = opt.path && p === "/assets/learn/data/path.json" ? path.resolve(opt.path) : path.join(root, p);
    if (!opt.path && !f.startsWith(root)) { res.writeHead(403); res.end(); return; }
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, "index.html");
    fs.readFile(f, (err, buf) => {
      if (err) { res.writeHead(404); res.end("not found"); return; }
      res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream", "Cache-Control": "no-store" }); res.end(buf);
    });
  });
  return new Promise(r => server.listen(0, "127.0.0.1", () => r(server)));
}

// ---------------- the checks, run inside the page (one call per window size); returns {n, fails, notes}
async function pageChecks(P) {
  const out = { n: 0, fails: [], notes: [] }, ok = (c, m) => { out.n++; if (!c) out.fails.push(m); };
  const wait = ms => new Promise(r => setTimeout(r, ms)), E = 0.5;
  const host = document.querySelector("[data-lx-metro]"), wrap = host.querySelector(".lx-mapwrap"), svg = () => wrap.querySelector("svg");
  const nav = document.getElementById("quarto-header"), D = P.data;
  const inset = () => nav && /sticky|fixed/.test(getComputedStyle(nav).position) ? nav.offsetHeight : 0;
  const vw = document.documentElement.clientWidth, vh = window.innerHeight;
  const inside = (a, b) => a.left >= b.left - E && a.top >= b.top - E && a.right <= b.right + E && a.bottom <= b.bottom + E;
  const meet = (a, b, m) => a.left < b.right - m && b.left < a.right - m && a.top < b.bottom - m && b.top < a.bottom - m;
  const R = r => "[" + [r.left, r.top, r.right, r.bottom].map(Math.round).join(",") + "]";
  const card = () => wrap.querySelector(".lx-preview");
  const key = (el, k) => (el || document.body).dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
  const byKey = k => host.querySelectorAll(`[data-key="${k}"]`);
  // put an element where a reader would click it: mid-window, or just inside the window's top or bottom edge
  function bring(el, where) {
    el.scrollIntoView({ block: "center", behavior: "instant" });
    const r = el.getBoundingClientRect();
    if (where === "bottom") window.scrollBy({ top: r.bottom - (vh - 4), behavior: "instant" });
    if (where === "top") window.scrollBy({ top: r.top - (inset() + 4), behavior: "instant" });
  }
  // the window may still be scrolling to the card (smooth unless reduced motion): wait until it stops
  // and, when motion is allowed, until the cue's fade (0.15 s) is over
  async function settle() {
    const step = P.smooth ? 60 : 16;
    await wait(step); for (let k = 0, y = -1; k < 40 && y !== window.scrollY; k++) { y = window.scrollY; await wait(step); }
    if (P.smooth) await wait(220);
  }
  // y0: the window's scroll before a line label or station was used (a door may scroll to its card; these may not jump)
  // want: what the card must say ({title, href, live}) for a lesson's card
  async function checkCard(label, opener, y0, want, byKeyboard) {
    await settle();
    const c = card();
    ok(!!c, `${label}: a card opens`); if (!c) return;
    ok(c.getAttribute("role") === "dialog", `${label}: the card is a dialog`);
    const lb = c.getAttribute("aria-labelledby"), name = (lb && document.getElementById(lb) ? document.getElementById(lb).textContent : c.getAttribute("aria-label") || "").trim();
    ok(name.length > 0 && name !== "Lesson details", `${label}: the dialog is named after its card ("${name}")`);
    if (byKeyboard) ok(c.contains(document.activeElement), `${label}: focus moves into the card`);
    if (want) {
      ok(name === want.title, `${label}: the card shows the lesson's title ("${name}" for "${want.title}")`);
      const start = [...c.querySelectorAll(".pf a")].find(a => /Start/.test(a.textContent));
      if (want.live) ok(start && start.getAttribute("href") === want.href, `${label}: Start links to ${want.href} (${start ? start.getAttribute("href") : "no Start"})`);
      else ok(!start && /Coming soon/.test(c.querySelector(".pf").textContent), `${label}: an upcoming lesson's card says Coming soon and has no Start`);
      if (want.minutes) ok(c.querySelector(".k").textContent.indexOf(want.minutes + " min") >= 0, `${label}: the card gives its minutes`);
    }
    const cr = c.getBoundingClientRect(), wr = wrap.getBoundingClientRect(), view = { left: 0, top: inset(), right: vw, bottom: vh };
    ok(inside(cr, wr), `${label}: card ${R(cr)} inside the map box ${R(wr)}`);
    ok(inside(cr, view), `${label}: card ${R(cr)} inside the window below the navbar ${R(view)}`);
    if (y0 != null) ok(Math.abs(window.scrollY - y0) <= cr.height + 16, `${label}: the card opens near what opened it (the window scrolled ${Math.round(window.scrollY - y0)} px for a ${Math.round(cr.height)} px card)`);
    // the body that scrolls when the card is cut to its height (the card itself, or an element inside it)
    const scroller = [c, ...c.querySelectorAll("*")].find(e => /auto|scroll/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 1);
    const cue = c.querySelector(".cue"), shown = e => !!e && +getComputedStyle(e).opacity > 0.5 && getComputedStyle(e).visibility !== "hidden" && e.getBoundingClientRect().height > 0;
    if (scroller) {
      ok(shown(cue), `${label}: a card whose body scrolls shows the "More below" cue`);
      scroller.scrollTop = scroller.scrollHeight; await wait(P.smooth ? 260 : 40);
      ok(!shown(cue), `${label}: the cue hides once the body is scrolled to the end (scroll ${Math.round(scroller.scrollTop)} + ${scroller.clientHeight} of ${scroller.scrollHeight}; card "${c.className}")`);
      out.notes.push(label + " scrolls");
    } else ok(!shown(cue), `${label}: no cue on a card that does not scroll`);
    const last = [...c.querySelectorAll(":scope .pf, .lx-preview-list > li:last-child")];
    ok(last.length > 0, `${label}: the card has a footer`);
    const box = scroller ? scroller.getBoundingClientRect() : cr;
    last.forEach(it => { const ir = it.getBoundingClientRect();
      ok(ir.height > 0 && inside(ir, box) && inside(ir, cr) && inside(ir, wr) && inside(ir, view),
        `${label}: last item "${it.textContent.trim().slice(0, 28)}" ${R(ir)} reachable (card ${R(cr)}, box ${R(wr)})`); });
    // Escape closes it from wherever focus is, and focus goes back to the element that opened the card
    key(document.activeElement, "Escape"); await settle();
    ok(!card(), `${label}: Escape closes the card`);
    const want2 = opener();
    ok(!!want2 && document.activeElement === want2, `${label}: focus returns to the opener (now on ${document.activeElement ? document.activeElement.tagName + "." + (document.activeElement.getAttribute("class") || "") : "nothing"})`);
  }
  await document.fonts.ready;
  for (let k = 0; k < 40 && !(svg() && svg().querySelector(".stn")); k++) await wait(100);
  await wait(150);   // a redraw once the fonts are in
  const Lo = host.lxMetro.layout(), mode = Lo.mode, vbW = svg().viewBox.baseVal.width, sr = svg().getBoundingClientRect(), scale = sr.width / vbW;
  const cs = getComputedStyle(wrap), avail = wrap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  ok(mode === "v" || avail >= 720, `wide layout only from a 720 px drawing (${Math.round(avail)} px)`);
  if (P.wide != null) ok(mode === (P.wide ? "h" : "v"), `layout ${mode} at this window (${P.wide ? "wide" : "narrow"} expected; drawing ${Math.round(avail)} px)`);
  if (mode === "v") ok(sr.width <= 560.5, `the narrow map is drawn at most 560 px wide (${Math.round(sr.width)} px)`);
  ok(Math.abs(scale - 1) < 0.02, `the map is drawn 1:1 (scale ${scale.toFixed(3)})`);
  out.notes.push(`mode ${mode}, map box ${Math.round(wrap.getBoundingClientRect().width)} x ${Math.round(wrap.getBoundingClientRect().height)} px`);
  // the map bar says what its numbers measure; it and the legend fit the column; no sideways scroll
  const hint = host.querySelector(".lx-mapbar .lx-hint");
  ok(hint && hint.textContent === P.hint, `map bar hint "${hint && hint.textContent}" is "${P.hint}"`);
  ok(host.querySelector(".lx-progress span").textContent === "0 of " + D.starter.length + " done", "progress reads 0 of " + D.starter.length + " done");
  const hr = host.getBoundingClientRect();
  [".lx-mapbar", ".lx-mlegend", ".lx-mlegend.kinds", ".lx-doors", ".lx-toolshelf"].forEach(s => { const r = host.querySelector(s).getBoundingClientRect(); ok(r.left >= hr.left - E && r.right <= hr.right + E, `${s} fits the column`); });
  [...host.querySelectorAll(".lx-mlegend > span, .lx-mapbar > *, .lx-tool")].forEach(e => { const r = e.getBoundingClientRect(); ok(r.right <= hr.right + E && r.left >= hr.left - E, `"${e.textContent.trim()}" fits the column`); });
  ok(document.documentElement.scrollWidth <= vw, `no sideways scroll (${document.documentElement.scrollWidth - vw} px)`);

  // ---- every lesson: exactly one station or chip, named after it, in the state path.json gives
  const rank = m => { const c = m.code || ""; if (!c) return [1, 0]; if (/^CK-/.test(c)) return [7, 0]; if (c === "CR") return [8, 99];
    const g = /^([A-Z]+)(\d+)$/.exec(c); if (!g) return [4.5, 0]; const f = { F: 0, A: 0, M: 0, R: 0, B: 2, N: 3, X: 4, CF: 5, SB: 6, C: 8 }[g[1]]; return [f == null ? 4.5 : f, +g[2]]; };
  const lessons = [];
  D.starter.forEach((l, i) => lessons.push({ key: "s" + i, l, name: l.short, sel: ".stn" }));
  D.more.forEach((m, j) => lessons.push({ key: "m" + j, l: m, name: m.title, sel: ".stn.own" }));
  (D.toolbox || []).forEach((t, j) => lessons.push({ key: "k" + j, l: t, name: t.title, sel: ".lx-tool" }));
  lessons.forEach(x => {
    const els = byKey(x.key), el = els[0], s = x.l.ready ? "open" : "up", lab = el ? el.getAttribute("aria-label") || "" : "";
    ok(els.length === 1 && el.matches(x.sel), `${x.l.code || x.key} "${x.name.slice(0, 40)}": exactly one ${x.sel} (${els.length})`);
    if (!el) return;
    ok(el.classList.contains(s) && !["open", "up", "done"].some(c => c !== s && el.classList.contains(c)), `${x.l.code || x.key}: state ${s}, as in path.json (class "${el.getAttribute("class")}")`);
    ok(lab.indexOf(x.name) >= 0 && (!x.l.code || lab.indexOf(x.l.code) === 0) && (el.tagName === "BUTTON" || el.getAttribute("role") === "button"), `${x.l.code || x.key}: a button named after it ("${lab.slice(0, 60)}")`);
  });
  ok(host.querySelectorAll(".stn").length === D.starter.length + D.more.length && host.querySelectorAll(".lx-tool").length === (D.toolbox || []).length,
    `no other stations or chips (${host.querySelectorAll(".stn").length} stations, ${host.querySelectorAll(".lx-tool").length} chips)`);
  // ---- keyboard order: doors, the starter path, each tier line (label, stations in curriculum order), the toolbox
  const want = [...host.querySelectorAll(".lx-door")].map((d, k) => "door" + k).concat(D.starter.map((l, i) => "s" + i));
  D.tiers.forEach((t, k) => {
    want.push("tier" + k);
    D.more.map((m, j) => ({ m, j })).filter(x => x.m.tier === t.id).sort((a, b) => rank(a.m)[0] - rank(b.m)[0] || rank(a.m)[1] - rank(b.m)[1] || a.j - b.j).forEach(x => want.push("m" + x.j));
  });
  (D.toolbox || []).forEach((t, j) => want.push("k" + j));
  const doorsL = [...host.querySelectorAll(".lx-door")];
  const got = [...host.querySelectorAll("button, a[href], [tabindex]")].filter(e => e.tabIndex >= 0 && !e.closest(".lx-preview"))
    .map(e => e.classList.contains("lx-door") ? "door" + doorsL.indexOf(e) : e.classList.contains("mext") ? "tier" + e.getAttribute("data-k") : e.getAttribute("data-key"));
  const firstBad = got.findIndex((g, i) => g !== want[i]);
  ok(got.length === want.length && firstBad < 0, `keyboard order: doors, starter path, each line, toolbox (${got.length} of ${want.length}; first difference at ${firstBad}: ${got[firstBad]} for ${want[firstBad]})`);
  const lineOf = D.tiers[0].id, onLine = [...host.querySelectorAll(`[data-line="${lineOf}"]`)];
  if (onLine.length > 2) { onLine[1].focus(); key(onLine[1], mode === "h" ? "ArrowRight" : "ArrowDown"); ok(document.activeElement === onLine[2], "an arrow key steps to the next station on the line"); }

  // ---- labels: none overlap another, cover another station or the route; all at 11 px or more
  const texts = [...svg().querySelectorAll("text")].filter(t => t.textContent.trim() && t.getBoundingClientRect().width > 0);
  // a label's box: its width as drawn, its height the band its glyphs use (ascenders 0.76 em above the baseline,
  // descenders 0.24 em below), not the font's whole line box, which stacked lines of one name share by design
  const CTM = svg().getScreenCTM();
  const glyphs = t => { const r = t.getBoundingClientRect(), fs = parseFloat(getComputedStyle(t).fontSize) * scale, y = CTM.d * t.y.baseVal[0].value + CTM.f;
    return { left: r.left, right: r.right, top: y - 0.76 * fs, bottom: y + 0.24 * fs, width: r.width, height: fs }; };
  const tr = texts.map(t => ({ t, r: glyphs(t), what: t.textContent.trim() }));
  const clash = [];
  tr.forEach((a, i) => tr.forEach((b, j) => { if (i < j && meet(a.r, b.r, 0.5)) clash.push(`"${a.what}" / "${b.what}"`); }));
  ok(!clash.length, `no two labels overlap (${texts.length} labels${clash.length ? "; " + clash.slice(0, 5).join(", ") : ""})`);
  const chips = [...host.querySelectorAll(".lx-tool")].map(c => c.getBoundingClientRect()), cc = [];
  chips.forEach((a, i) => chips.forEach((b, j) => { if (i < j && meet(a, b, 0.5)) cc.push(i + "/" + j); }));
  ok(!cc.length, `no two toolbox chips overlap${cc.length ? " (" + cc.join(", ") + ")" : ""}`);
  const faces = [...svg().querySelectorAll(".stn .face")].map(f => ({ r: f.getBoundingClientRect(), key: f.closest(".stn").getAttribute("data-key") }));
  const cover = [];
  tr.forEach(a => faces.forEach(f => { if (meet(a.r, f.r, 1)) cover.push(`"${a.what}" on ${f.key}`); }));
  ok(!cover.length, `no label covers a station${cover.length ? " (" + cover.slice(0, 5).join(", ") + ")" : ""}`);
  const M = svg().getScreenCTM(), onRoute = [];
  svg().querySelectorAll(".mroute").forEach(p => {
    const len = p.getTotalLength();
    for (let d = 0; d <= len; d += 3) {
      const q = p.getPointAtLength(d), x = M.a * q.x + M.c * q.y + M.e, y = M.b * q.x + M.d * q.y + M.f;
      tr.forEach(a => { if (x > a.r.left + 1 && x < a.r.right - 1 && y > a.r.top + 1 && y < a.r.bottom - 1 && onRoute.indexOf(a.what) < 0) onRoute.push(a.what); });
    }
  });
  ok(!onRoute.length, `the route crosses no label${onRoute.length ? " (" + onRoute.slice(0, 5).join(", ") + ")" : ""}`);
  const small = texts.filter(t => parseFloat(getComputedStyle(t).fontSize) * scale < 10.95).map(t => t.textContent.trim() + " " + getComputedStyle(t).fontSize);
  ok(!small.length, `every label is 11 px or more${small.length ? " (" + small.slice(0, 4).join(", ") + ")" : ""}`);
  // a pressed door fades the other tiers' lines and shapes, not their text
  window.scrollTo({ top: 0, behavior: "instant" });
  const door0 = host.querySelectorAll(".lx-door")[D.tiers.length - 1]; door0.click(); await settle();
  if (card()) key(document.activeElement, "Escape");
  const faded = [...svg().querySelectorAll("text")].filter(t => { let o = 1; for (let e = t; e && e !== svg(); e = e.parentElement) o *= +getComputedStyle(e).opacity; return o < 0.99; });
  ok(svg().querySelector(".seg-dim") && !faded.length, `with a door pressed the other tiers fade, their text does not (${faded.length} faded labels)`);
  door0.click(); await settle(); if (card()) key(document.activeElement, "Escape"); await settle();

  // ---- cards: every tier label (also at the window's bottom edge), door, station and tool
  const nT = host.querySelectorAll(".lx-door").length, wantOf = l => ({ title: l.title, href: l.href, live: !!l.ready, minutes: l.minutes });
  for (let k = 0; k < nT; k++) for (const where of ["center", "bottom"]) {
    const g = () => svg().querySelectorAll(".mext")[k];
    bring(g().querySelector("text"), where); g().focus({ preventScroll: true }); const y0 = window.scrollY; key(g(), "Enter");
    await checkCard(`tier ${k + 1} label (${where})`, g, y0, null, true);
  }
  for (let k = 0; k < nT; k++) {
    const d = () => host.querySelectorAll(".lx-door")[k];
    window.scrollTo({ top: 0, behavior: "instant" }); d().focus(); d().click();
    await checkCard(`door ${k + 1}`, d);
    if (d().getAttribute("aria-pressed") === "true") d().click();   // un-press it, so the next check sees the whole map
    if (card()) key(document.activeElement, "Escape");
  }
  // the first and last station of each row (by its y) also at the window's top and bottom edges
  const all = [...svg().querySelectorAll(".stn")], rows = {};
  all.forEach((e, i) => { const y = Math.round(e.getBoundingClientRect().top + window.scrollY); (rows[y] = rows[y] || []).push(i); });
  const edge = new Set(); Object.values(rows).forEach(r => { edge.add(r[0]); edge.add(r[r.length - 1]); });
  for (let i = 0; i < all.length; i++) for (const where of edge.has(i) ? ["center", "top", "bottom"] : ["center"]) {
    const k = all[i].getAttribute("data-key"), el = () => host.querySelector(`.stn[data-key="${k}"]`);
    const l = k[0] === "s" ? D.starter[+k.slice(1)] : D.more[+k.slice(1)];
    bring(el(), where); el().focus({ preventScroll: true }); const y0 = window.scrollY; key(el(), "Enter");
    await checkCard(`station ${l.code || k} (${where})`, el, y0, wantOf(l), true);
  }
  for (let j = 0; j < (D.toolbox || []).length; j++) {
    const el = () => host.querySelector(`.lx-tool[data-key="k${j}"]`);
    bring(el(), "center"); el().focus({ preventScroll: true }); const y0 = window.scrollY; el().click();
    await checkCard(`tool ${D.toolbox[j].code}`, el, y0, wantOf(D.toolbox[j]));
  }
  // the "All lessons as a list" box (rendered site only): opens, fits, closes
  const list = document.querySelector("details.lx-listview");
  if (P.site && list) {
    ok(list.open === false, "the list box starts closed once the map is live");
    list.open = true; await wait(60);
    const lr = list.getBoundingClientRect();
    ok(lr.height > 200 && lr.left >= -E && lr.right <= vw + E && document.documentElement.scrollWidth <= vw, `the list box opens and fits (${Math.round(lr.width)} x ${Math.round(lr.height)} px)`);
    const items = list.querySelectorAll(".lx-list-tiers section[id] li").length;
    ok(items >= D.starter.length + D.more.length + (D.toolbox || []).length, `the list names every lesson (${items} items)`);
    list.open = false;
  }
  return out;
}

(async () => {
  if (!fs.existsSync(CHROME)) { console.log(`FAIL: no Chrome at ${CHROME} (set CHROME=/path/to/chrome)`); process.exit(1); }
  if (opt.site && !fs.existsSync(path.join(SITE, opt.site, "learn/index.html"))) { console.log(`FAIL: no ${opt.site}/learn/index.html (render first)`); process.exit(1); }
  const P = JSON.parse(fs.readFileSync(opt.path ? path.resolve(opt.path) : path.join(opt.site ? path.join(SITE, opt.site) : SITE, "assets/learn/data/path.json"), "utf8"));
  const hint = "Starter path: " + P.starter.length + " lessons, about " + Math.round(P.minutes / 30) / 2 + " hours";
  const server = await serve(), base = `http://127.0.0.1:${server.address().port}/`;
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), "lx-metro-test-"));
  const port = 9300 + Math.floor(Math.random() * 600);
  const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, "about:blank"], { stdio: "ignore" });
  let ws = null;
  for (let i = 0; i < 75 && !ws; i++) { try { const r = await fetch(`http://127.0.0.1:${port}/json/version`); if (r.ok) ws = (await r.json()).webSocketDebuggerUrl; } catch (e) { await sleep(200); } }
  if (!ws) { console.log("FAIL: Chrome did not start"); chrome.kill(); server.close(); process.exit(1); }
  const sock = new WebSocket(ws); await new Promise(r => sock.addEventListener("open", r));
  let seq = 0; const pending = new Map(), events = [];
  sock.addEventListener("message", e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } else events.push(m); });
  const send = (method, params = {}, sessionId) => new Promise(r => { const i = ++seq; pending.set(i, r); sock.send(JSON.stringify({ id: i, method, params, sessionId })); });
  let checks = 0, fails = 0;
  for (const [w, h] of SIZES) {
    const phone = w < 600;
    const { result: { targetId } } = await send("Target.createTarget", { url: "about:blank" });
    const { result: { sessionId: s } } = await send("Target.attachToTarget", { targetId, flatten: true });
    await send("Runtime.enable", {}, s);
    await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: phone }, s);
    await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: opt.motion || "reduce" }] }, s);
    await send("Page.navigate", { url: base + "learn/index.html" }, s);
    let r = null;
    for (let k = 0; k < 60; k++) {
      await sleep(250);
      const q = await send("Runtime.evaluate", { expression: "!!document.querySelector('[data-lx-metro].is-live .stn')", returnByValue: true }, s);
      if (q.result && q.result.result && q.result.result.value) { r = true; break; }
    }
    if (!r) { checks++; fails++; console.log(`FAIL: ${w}x${h}: the map did not draw`); await send("Target.closeTarget", { targetId }); continue; }
    // the wide layout is expected at 1280 and 1024 px windows, the narrow one at 768 px and below
    const wide = w >= 1024 ? true : w <= 768 ? false : null;
    const res = await send("Runtime.evaluate", { expression: `(${pageChecks.toString()})(${JSON.stringify({ hint, data: P, wide, site: !!opt.site, smooth: opt.motion === "no-preference" })})`, awaitPromise: true, returnByValue: true }, s);
    const v = res.result && res.result.result && res.result.result.value;
    if (!v) { checks++; fails++; console.log(`FAIL: ${w}x${h}: the checks threw: ${JSON.stringify(res.result && (res.result.exceptionDetails || res.result)).slice(0, 400)}`); }
    else {
      checks += v.n; fails += v.fails.length;
      v.fails.slice(0, 40).forEach(f => console.log(`FAIL: ${w}x${h}: ${f}`));
      if (v.fails.length > 40) console.log(`FAIL: ${w}x${h}: ... and ${v.fails.length - 40} more`);
      console.log(`${w}x${h}: ${v.n} checks, ${v.fails.length} failed; ${v.notes[0]}; ${v.notes.length - 1} cards scroll`);
    }
    const errs = events.filter(e => e.sessionId === s && (e.method === "Runtime.exceptionThrown" || (e.method === "Runtime.consoleAPICalled" && e.params.type === "error")));
    checks++; if (errs.length) { fails++; console.log(`FAIL: ${w}x${h}: console errors: ${errs.map(e => JSON.stringify(e.params.exceptionDetails || e.params.args).slice(0, 200)).join(" | ")}`); }
    await send("Target.closeTarget", { targetId });
  }
  sock.close(); chrome.kill(); server.close();
  console.log(`${checks} checks, ${fails} failed (${opt.site ? "rendered site " + opt.site : "test page from the worktree's assets"}${opt.path ? ", path.json from " + opt.path : ""})`);
  process.exit(fails ? 1 : 0);
})();
