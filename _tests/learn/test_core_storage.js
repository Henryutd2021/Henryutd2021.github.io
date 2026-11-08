// test_core_storage.js — Node tests of the course's browser storage (assets/learn/components/core.js) and the
// course-wide reset on the Learn index:
//   - working storage: everything under the one key "learn.v1"; LX.store.persistent() is true; no notice
//   - storage refused on read (site data blocked): progress, answers and drafts are kept in memory for the page, and one
//     short notice (p.lx-store-note, role status) says they last only until a reload; LX.store.persistent() is false
//   - storage refused on write (a full quota): what was stored stays readable, new values are kept in memory, one notice
//   - LX.store.clearAll() leaves no reader data (only the time of the reset), in storage or in memory; a page opened
//     before the reset (another tab) cannot write its old state back: its writes are dropped and it says so once
//   - the reset control ([data-lx-reset]): shown only with JavaScript, asks first, then clears; a "no" changes nothing
//   - the Learn index: the promise is qualified ("as long as it keeps site data") and the control says what it removes
// Usage (from the site folder):  node _tests/learn/test_core_storage.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const SITE = path.resolve(__dirname, "..", "..");
const { El } = require("./stubdom.js");
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const CORE = fs.readFileSync(path.join(SITE, "assets/learn/components/core.js"), "utf8");

// a page: core.js run against a stub document whose localStorage behaves as `mode` says
//   "ok": a working store; "read": every access throws (blocked); "write": reads work, writes throw (quota)
function page(mode, initial, confirmAnswer, shared) {   // shared: another page's storage (two tabs of one browser)
  const data = shared || Object.assign({}, initial || {}), body = new El("body"), main = new El("main"), html = new El("html");
  body.appendChild(main);
  const head = new El("header"); head.setAttribute("id", "title-block-header"); main.appendChild(head);
  main.appendChild(new El("p"));
  El.prototype.insertBefore = El.prototype.insertBefore || function (c, ref) {
    if (c.parentNode) c.parentNode.children = c.parentNode.children.filter(x => x !== c);
    const i = ref ? this.children.indexOf(ref) : -1; c.parentNode = this;
    if (i < 0) this.children.push(c); else this.children.splice(i, 0, c); return c;
  };
  Object.defineProperty(El.prototype, "nextSibling", { configurable: true, get() { const p = this.parentNode; if (!p) return null; const i = p.children.indexOf(this); return p.children[i + 1] || null; } });
  Object.defineProperty(El.prototype, "firstChild", { configurable: true, get() { return this.children[0] || null; } });
  const ls = {
    getItem(k) { if (mode === "read") throw new Error("SecurityError"); return k in data ? data[k] : null; },
    setItem(k, v) { if (mode !== "ok") throw new Error(mode === "read" ? "SecurityError" : "QuotaExceededError"); data[k] = String(v); },
    removeItem(k) { if (mode === "read") throw new Error("SecurityError"); delete data[k]; }
  };
  const document = { body, documentElement: html, readyState: "complete", currentScript: null,
    createElement: t => new El(t), createElementNS: (ns, t) => new El(t), addEventListener() {},
    querySelector: s => body.querySelector(s), querySelectorAll: s => body.querySelectorAll(s), elementsFromPoint: () => [] };
  const asked = [];
  const window = { document, addEventListener() {}, innerWidth: 1280, innerHeight: 800, matchMedia: () => ({ matches: true }),
    confirm: q => { asked.push(q); return confirmAnswer !== false; } };
  Object.defineProperty(window, "localStorage", { get() { if (mode === "read") throw new Error("SecurityError"); return ls; } });
  const later = [];
  const ctx = { window, document, location: { search: "", hash: "", protocol: "https:" }, console, setTimeout: f => { later.push(f); return 0; },
    requestAnimationFrame: () => 0, getComputedStyle: () => ({ getPropertyValue: () => "" }), fetch: () => Promise.reject(new Error("no fetch")) };
  window.window = window;
  vm.runInNewContext(CORE, ctx);
  return { LX: window.LX, body, main, data, asked, run: () => later.splice(0).forEach(f => f()) };
}
const notes = P => P.main.querySelectorAll(".lx-store-note");

// working storage
{
  const P = page("ok"); P.run();
  P.LX.progress.done("01-power-energy");
  ok(P.LX.progress.isDone("01-power-energy") && JSON.parse(P.data["learn.v1"]).done["01-power-energy"], "working storage: a tick is kept under learn.v1");
  P.LX.store.set("ckf-v1", { tasks: { a: 1 } });
  ok(P.LX.store.get("ckf-v1", null).tasks.a === 1 && P.LX.store.persistent() === true && notes(P).length === 0, "working storage: values round-trip, persistent, no notice");
  P.LX.store.clearAll();
  ok(Object.keys(JSON.parse(P.data["learn.v1"])).join() === "reset" && !P.LX.progress.isDone("01-power-energy") && P.LX.store.get("ckf-v1", "none") === "none",
    "clearAll leaves no reader data (only the reset's time): no tick, no value");
  P.LX.progress.done("02-demand");
  ok(P.LX.progress.isDone("02-demand") && notes(P).length === 0, "after its own reset, the page saves again, with no notice");
}
// a reset in another tab: the old tab cannot write its state back
{
  const shared = {};
  const A = page("ok", null, true, shared); A.run();
  A.LX.store.set("ckr-v1", { version: "v", tasks: { review: { answer: "My review" } } }); A.LX.progress.done("r01-framing");
  const B = page("ok", null, true, shared); B.run();
  ok(B.LX.store.get("ckr-v1", null).tasks.review.answer === "My review", "two tabs: the second sees the first's answers");
  B.LX.store.clearAll();
  A.LX.store.set("ckr-v1", { version: "v", tasks: { review: { answer: "My review" } } });   // tab A saves its cached attempt (Next, pagehide)
  A.LX.progress.done("r02-literature");
  const after = JSON.parse(shared["learn.v1"]);
  ok(Object.keys(after).join() === "reset" && !B.LX.progress.isDone("r01-framing"), "two tabs: after a reset in B, A's later saves do not bring the old answers back");
  ok(A.main.querySelectorAll('.lx-store-note[data-kind="stale"]').length === 1 && /cleared in this browser, from another tab/.test(A.main.querySelector('.lx-store-note[data-kind="stale"]').textContent),
    "two tabs: A says once that the data was cleared elsewhere and nothing there is saved");
  A.LX.progress.done("r03-system-and-method"); ok(A.main.querySelectorAll(".lx-store-note").length === 1, "two tabs: still one notice in A");
  const C = page("ok", null, true, shared); C.run();
  C.LX.progress.done("00-grid-operator");
  ok(C.LX.progress.isDone("00-grid-operator") && JSON.parse(shared["learn.v1"]).reset === after.reset && notes(C).length === 0, "two tabs: a page opened after the reset saves normally");
}
// storage refused on read (blocked site data)
{
  const P = page("read"); P.run();
  ok(P.LX.store.persistent() === false, "blocked: persistent() is false once the page has read its ticks");
  P.LX.progress.done("02-demand");
  ok(P.LX.progress.isDone("02-demand"), "blocked: a lesson marked complete stays complete for the page (in memory)");
  P.LX.store.set("ckr-v1-drafts", { version: "v", tasks: { review: { text: "half" } } });
  ok(P.LX.store.get("ckr-v1-drafts", null).tasks.review.text === "half", "blocked: a saved draft reads back for the page");
  P.LX.progress.guess("t0", 42);
  ok(P.LX.progress.guess("t0") === 42 && P.LX.progress.isDone("02-demand"), "blocked: guesses too, and earlier values stay");
  const n = notes(P);
  ok(n.length === 1 && n[0].getAttribute("role") === "status" && /not keeping site data/.test(n[0].textContent) && /until you reload/.test(n[0].textContent),
    "blocked: one notice that progress lasts only until a reload: " + (n[0] && n[0].textContent));
  ok(P.main.children[1] === n[0], "blocked: the notice sits under the page title");
  ok(n[0].textContent.split(/\s+/).length <= 30, "blocked: the notice is short");
  P.LX.store.clearAll();
  ok(!P.LX.progress.isDone("02-demand") && P.LX.store.get("ckr-v1-drafts", "none") === "none", "blocked: clearAll empties the memory");
  P.LX.progress.done("03-balancing"); ok(P.LX.progress.isDone("03-balancing") && notes(P).length === 1, "blocked: after clearAll the page keeps working in memory, one notice");
}
// storage refused on write (a full quota): what was stored stays readable
{
  const before = JSON.stringify({ done: { "00-grid-operator": "2026-11-01" }, kv: { "ckf-v1": { version: "x" } } });
  const P = page("write", { "learn.v1": before }); P.run();
  ok(P.LX.progress.isDone("00-grid-operator") && P.LX.store.persistent() === true && notes(P).length === 0, "full quota: stored values read as before; no notice until a write fails");
  P.LX.progress.done("03-balancing");
  ok(P.LX.progress.isDone("03-balancing") && P.LX.progress.isDone("00-grid-operator") && P.LX.store.persistent() === false && notes(P).length === 1,
    "full quota: a new tick is kept in memory with the stored ones, and one notice appears");
  P.LX.store.set("a", 1); P.LX.store.set("b", 2);
  ok(P.LX.store.get("a") === 1 && P.LX.store.get("b") === 2 && notes(P).length === 1, "full quota: later writes work for the page, still one notice");
  ok(P.data["learn.v1"] === before, "full quota: the stored text is left as it was");
}
// the reset control on the Learn index
{
  const mk = (answer) => {
    const P = page("ok", { "learn.v1": JSON.stringify({ done: { "01-power-energy": "2026-11-01" }, kv: { "ckr-v1": { version: "v" }, "ckr-v1-drafts": { tasks: {} } } }) }, answer);
    const box = P.LX.H("div", { class: "lx-reset", "data-lx-reset": "", hidden: "" }, P.main);
    P.LX.H("button", { type: "button", text: "Clear all course data in this browser" }, box);
    P.LX.H("span", { class: "lx-hint", "aria-live": "polite" }, box);
    const tick = P.LX.H("li", { "data-lesson-id": "01-power-energy" }, P.main);
    P.run();
    return { P, box, tick };
  };
  const A = mk(true);
  ok(!A.box.hidden && A.tick.classList.contains("is-done"), "reset: shown with JavaScript; the tick is painted");
  A.box.querySelector("button").click();
  ok(A.P.asked.length === 1 && /Clear all course data in this browser\?/.test(A.P.asked[0]) && /guesses, answers, drafts, checkpoint attempts and completed-lesson ticks/.test(A.P.asked[0]) && /learn\.v1/.test(A.P.asked[0]),
    "reset: asks first, saying what it removes");
  ok(Object.keys(JSON.parse(A.P.data["learn.v1"])).join() === "reset" && !A.tick.classList.contains("is-done") && /^Cleared\./.test(A.box.querySelector("[aria-live]").textContent), "reset: yes clears everything, unpaints the tick and says so");
  const B = mk(false);
  B.box.querySelector("button").click();
  ok("learn.v1" in B.P.data && B.tick.classList.contains("is-done") && B.box.querySelector("[aria-live]").textContent === "", "reset: no changes nothing");
}
// the Learn index's words
{
  const IDX = fs.readFileSync(path.join(SITE, "learn/index.qmd"), "utf8");
  ok(/Your guesses and progress stay in this browser, as long as it keeps site data/.test(IDX), "index: the promise is qualified");
  ok(/<div class="lx-reset" data-lx-reset hidden>/.test(IDX) && /Clear all course data in this browser<\/button>/.test(IDX) && /every guess, answer, draft, checkpoint attempt and completed-lesson tick[^<]*<code>learn\.v1<\/code>/.test(IDX),
    "index: the reset control, hidden without JavaScript, with a plain statement of what it removes");
}
console.log((fails ? "FAILED " + fails + " of " : "ok: ") + checks + " checks (course storage and reset)");
process.exit(fails ? 1 : 0);
