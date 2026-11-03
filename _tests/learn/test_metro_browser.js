// test_metro_browser.js — browser test of the course map's cards (metro.js) in headless Chrome (wave W3, 2026-11-03).
//   At desktop, tablet and phone sizes, and in two short windows (a laptop's, a phone held sideways), it opens every tier
//   card from its line's label (by keyboard), presses every door, and opens every station card (with the station in the
//   middle of the window, and the first and last station of each row also at the window's top and bottom edges).
//   Each card must:
//     - be a dialog with a name;
//     - lie inside the map's box and inside the window below the sticky navbar;
//     - open near the line label or station that opened it (the window scrolls by at most the card's height);
//     - have its last item reachable: the footer (and a tier card's last listed lesson) in view, or in view after its
//       body is scrolled to the end, in which case a "More below" cue shows until then;
//     - close on Escape, with focus back on the door, line label or station that opened it.
//   It also checks the layout mode at each width (horizontal from a 720 px wide map box), the vertical map's size cap,
//   the map bar's hint ("Starter path: N lessons, about H hours"), that the map bar and legend fit, and that the page has
//   no sideways scroll. With --site it also opens and closes the "All lessons as a list" box.
// Page: by default a page built here around the worktree's own assets/learn/learn.js, learn.css and data/path.json, in a
//   frame like the site's (a sticky 65 px navbar, a 1120 px content column, 25.5 px gutters), so it needs no render;
//   --site <folder> runs it on a rendered site's learn/index.html instead (e.g. --site _site after quarto render).
// Needs Google Chrome (CHROME=/path/to/chrome overrides the macOS default) and Node 22 or later (WebSocket, fetch).
// Usage (from the site folder):  node _tests/learn/test_metro_browser.js [--site _site] [--sizes 1280x900,375x667]
//        [--motion reduce|no-preference]   (default reduce: cards appear at once; no-preference: the window scrolls smoothly)
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
    let f = path.join(root, p);
    if (!f.startsWith(root)) { res.writeHead(403); res.end(); return; }
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
  const nav = document.getElementById("quarto-header");
  const inset = () => nav && /sticky|fixed/.test(getComputedStyle(nav).position) ? nav.offsetHeight : 0;
  const vw = document.documentElement.clientWidth, vh = window.innerHeight;
  const inside = (a, b) => a.left >= b.left - E && a.top >= b.top - E && a.right <= b.right + E && a.bottom <= b.bottom + E;
  const R = r => "[" + [r.left, r.top, r.right, r.bottom].map(Math.round).join(",") + "]";
  const card = () => wrap.querySelector(".lx-preview");
  const key = (el, k) => (el || document.body).dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
  // put an element where a reader would click it: mid-window, or just inside the window's top or bottom edge
  function bring(el, where) {
    el.scrollIntoView({ block: "center", behavior: "instant" });
    const r = el.getBoundingClientRect();
    if (where === "bottom") window.scrollBy({ top: r.bottom - (vh - 4), behavior: "instant" });
    if (where === "top") window.scrollBy({ top: r.top - (inset() + 4), behavior: "instant" });
  }
  // the window may still be scrolling to the card (smooth unless reduced motion): wait until it stops
  // and, when motion is allowed, until the cue's fade (0.15 s) is over
  async function settle() { await wait(60); for (let k = 0, y = -1; k < 40 && y !== window.scrollY; k++) { y = window.scrollY; await wait(60); } if (P.smooth) await wait(220); }
  // y0: the window's scroll before a line label or station was used (a door may scroll to its card; these may not jump)
  async function checkCard(label, opener, y0) {
    await settle();
    const c = card();
    ok(!!c, `${label}: a card opens`); if (!c) return;
    ok(c.getAttribute("role") === "dialog", `${label}: the card is a dialog`);
    const lb = c.getAttribute("aria-labelledby"), name = (lb && document.getElementById(lb) ? document.getElementById(lb).textContent : c.getAttribute("aria-label") || "").trim();
    ok(name.length > 0 && name !== "Lesson details", `${label}: the dialog is named after its card ("${name}")`);
    const cr = c.getBoundingClientRect(), wr = wrap.getBoundingClientRect(), view = { left: 0, top: inset(), right: vw, bottom: vh };
    ok(inside(cr, wr), `${label}: card ${R(cr)} inside the map box ${R(wr)}`);
    ok(inside(cr, view), `${label}: card ${R(cr)} inside the window below the navbar ${R(view)}`);
    if (y0 != null) ok(Math.abs(window.scrollY - y0) <= cr.height + 16, `${label}: the card opens near what opened it (the window scrolled ${Math.round(window.scrollY - y0)} px for a ${Math.round(cr.height)} px card)`);
    // the body that scrolls when the card is cut to its height (the card itself, or an element inside it)
    const scroller = [c, ...c.querySelectorAll("*")].find(e => /auto|scroll/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 1);
    const cue = c.querySelector(".cue"), shown = e => !!e && +getComputedStyle(e).opacity > 0.5 && getComputedStyle(e).visibility !== "hidden" && e.getBoundingClientRect().height > 0;
    if (scroller) {
      ok(shown(cue), `${label}: a card whose body scrolls shows the "More below" cue`);
      scroller.scrollTop = scroller.scrollHeight; await wait(P.smooth ? 260 : 60);
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
    const want = opener();
    ok(!!want && document.activeElement === want, `${label}: focus returns to the opener (now on ${document.activeElement ? document.activeElement.tagName + "." + (document.activeElement.getAttribute("class") || "") : "nothing"})`);
  }
  await document.fonts.ready;
  for (let k = 0; k < 40 && !(svg() && svg().querySelector(".stn")); k++) await wait(100);
  const vbW = svg().viewBox.baseVal.width, mode = vbW === 1200 ? "h" : "v";
  ok(mode === (wrap.clientWidth >= 720 ? "h" : "v"), `layout ${mode} for a ${wrap.clientWidth} px map box (horizontal from 720 px)`);
  if (mode === "v") ok(svg().getBoundingClientRect().width <= 450.5, `the vertical map is drawn at most 450 px wide (${Math.round(svg().getBoundingClientRect().width)} px)`);
  out.notes.push(`mode ${mode}, map box ${Math.round(wr0().width)} x ${Math.round(wr0().height)} px`);
  function wr0() { return wrap.getBoundingClientRect(); }
  // the map bar says what its numbers measure; it and the legend fit the column; no sideways scroll
  const hint = host.querySelector(".lx-mapbar .lx-hint");
  ok(hint && hint.textContent === P.hint, `map bar hint "${hint && hint.textContent}" is "${P.hint}"`);
  ok(host.querySelector(".lx-progress span").textContent === "0 of " + P.starter + " done", "progress reads 0 of " + P.starter + " done");
  const hr = host.getBoundingClientRect();
  [".lx-mapbar", ".lx-mlegend", ".lx-doors"].forEach(s => { const r = host.querySelector(s).getBoundingClientRect(); ok(r.left >= hr.left - E && r.right <= hr.right + E, `${s} fits the column`); });
  [...host.querySelectorAll(".lx-mlegend > span, .lx-mapbar > *")].forEach(e => { const r = e.getBoundingClientRect(); ok(r.right <= hr.right + E, `"${e.textContent.trim()}" fits the column`); });
  ok(document.documentElement.scrollWidth <= vw, `no sideways scroll (${document.documentElement.scrollWidth - vw} px)`);

  // every tier card, from its line's label, by keyboard (then once more with the label at the window's bottom edge)
  const nT = host.querySelectorAll(".lx-door").length;
  for (let k = 0; k < nT; k++) for (const where of ["center", "bottom"]) {
    const g = () => svg().querySelectorAll(".mext")[k];
    bring(g().querySelector("text"), where); g().focus({ preventScroll: true }); const y0 = window.scrollY; key(g(), "Enter");   // the label a reader aims at, not the whole line
    await checkCard(`tier ${k + 1} label (${where})`, g, y0);
  }
  // every door (a door opens its tier's first station card, or the tier card when the tier has no stations)
  for (let k = 0; k < nT; k++) {
    const d = () => host.querySelectorAll(".lx-door")[k];
    window.scrollTo({ top: 0, behavior: "instant" }); d().focus(); d().click();
    await checkCard(`door ${k + 1}`, d);
    if (d().getAttribute("aria-pressed") === "true") d().click();   // un-press it, so the next check sees the whole map
    if (card()) key(document.activeElement, "Escape");
  }
  // every station mid-window, by keyboard; the first and last station of each row also at the top and bottom edges
  const stn = i => svg().querySelectorAll(".stn")[i], nS = svg().querySelectorAll(".stn").length;
  const rows = {};
  for (let i = 0; i < nS; i++) { const y = stn(i).querySelector(".face").getAttribute(mode === "h" ? "cy" : "cx"); (rows[y] = rows[y] || []).push(i); }
  const edge = new Set(); Object.values(rows).forEach(r => { edge.add(r[0]); edge.add(r[r.length - 1]); });
  for (let i = 0; i < nS; i++) for (const where of edge.has(i) ? ["center", "top", "bottom"] : ["center"]) {
    bring(stn(i), where); stn(i).focus({ preventScroll: true }); const y0 = window.scrollY; key(stn(i), "Enter");
    await checkCard(`station ${i} (${where})`, () => stn(i), y0);
  }
  // the "All lessons as a list" box (rendered site only): opens, fits, closes
  const list = document.querySelector("details.lx-listview");
  if (P.site && list) {
    ok(list.open === false, "the list box starts closed once the map is live");
    list.open = true; await wait(60);
    const lr = list.getBoundingClientRect();
    ok(lr.height > 200 && lr.left >= -E && lr.right <= vw + E && document.documentElement.scrollWidth <= vw, `the list box opens and fits (${Math.round(lr.width)} x ${Math.round(lr.height)} px)`);
    list.open = false;
  }
  return out;
}

(async () => {
  if (!fs.existsSync(CHROME)) { console.log(`FAIL: no Chrome at ${CHROME} (set CHROME=/path/to/chrome)`); process.exit(1); }
  if (opt.site && !fs.existsSync(path.join(SITE, opt.site, "learn/index.html"))) { console.log(`FAIL: no ${opt.site}/learn/index.html (render first)`); process.exit(1); }
  const P = JSON.parse(fs.readFileSync(path.join(opt.site ? path.join(SITE, opt.site) : SITE, "assets/learn/data/path.json"), "utf8"));
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
    const res = await send("Runtime.evaluate", { expression: `(${pageChecks.toString()})(${JSON.stringify({ hint, starter: P.starter.length, site: !!opt.site, smooth: opt.motion === "no-preference" })})`, awaitPromise: true, returnByValue: true }, s);
    const v = res.result && res.result.result && res.result.result.value;
    if (!v) { checks++; fails++; console.log(`FAIL: ${w}x${h}: the checks threw: ${JSON.stringify(res.result && (res.result.exceptionDetails || res.result)).slice(0, 400)}`); }
    else {
      checks += v.n; fails += v.fails.length;
      v.fails.forEach(f => console.log(`FAIL: ${w}x${h}: ${f}`));
      console.log(`${w}x${h}: ${v.n} checks, ${v.fails.length} failed; ${v.notes[0]}; ${v.notes.length - 1} cards scroll`);
    }
    const errs = events.filter(e => e.sessionId === s && (e.method === "Runtime.exceptionThrown" || (e.method === "Runtime.consoleAPICalled" && e.params.type === "error")));
    checks++; if (errs.length) { fails++; console.log(`FAIL: ${w}x${h}: console errors: ${errs.map(e => JSON.stringify(e.params.exceptionDetails || e.params.args).slice(0, 200)).join(" | ")}`); }
    await send("Target.closeTarget", { targetId });
  }
  sock.close(); chrome.kill(); server.close();
  console.log(`${checks} checks, ${fails} failed (${opt.site ? "rendered site " + opt.site : "test page from the worktree's assets"})`);
  process.exit(fails ? 1 : 0);
})();
