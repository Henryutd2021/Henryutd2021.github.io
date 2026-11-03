// test_components_shared.js — Node tests for the shared-component fixes collected after the W1 per-lesson reviews
// (2026-11-02; reports/learn/w1_shared_fixes.md), run on a small stub document:
//   - checkpoint.js (LX.Checkpoint): the estimate task's early "Show the worked solution now" opens the page's worked
//     solution as well; "Start again" shuts it again; a range needs a high above its low (pure check and view: one
//     number is not submitted, and says why); solutions, points and choice feedback take [[glossary|marks]]
//   - sheet.js (LX.Sheet): "Fill down" follows the selected cell after Enter and after set(), not only after a move
//   - cards.js (LX.StepCards): api.busy(on) holds Next shut while a solve runs (and marks the card aria-busy); a late call
//     from a card no longer shown changes nothing; M1 step 8 uses it instead of reaching into the card's buttons
//   - frontier.js, plot.css, equation.css: the default shade label, the model-lab stage's single shrinkable column, and a
//     dense row's note on its own line (equation.js's units in the text version are tested in test_components_d.js)
// Usage (from the site folder):  node _tests/learn/test_components_shared.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }

// ---------------------------------------------------------------- a small stub document
// Elements keep attributes, children in order, listeners, and the reflected properties these components use (hidden,
// disabled, open, value, checked). Selectors: tag, #id, .class, [attr], [attr="v"], :not(.class), descendant chains and
// comma lists, matched in document order.
let ACTIVE = null;
class El {
  constructor(tag) {
    this.tagName = tag.toUpperCase(); this.attrs = {}; this.children = []; this.parentNode = null; this._text = ""; this._html = null; this.listeners = {};
    this.offsetTop = 0; this.offsetLeft = 0; this.offsetWidth = 0; this.clientHeight = 0; this.clientWidth = 0; this.scrollTop = 0; this.scrollLeft = 0;
    const self = this;
    this.classList = {
      add: (...c) => { const s = new Set(self.cls()); c.forEach(x => s.add(x)); self.attrs.class = [...s].join(" "); },
      remove: (...c) => { self.attrs.class = self.cls().filter(x => c.indexOf(x) < 0).join(" "); },
      toggle: (c, on) => { const has = self.cls().indexOf(c) >= 0; if (on === undefined) on = !has; if (on) self.classList.add(c); else self.classList.remove(c); return on; },
      contains: c => self.cls().indexOf(c) >= 0 };
    this.style = { setProperty() {} };
  }
  cls() { return (this.attrs.class || "").split(/\s+/).filter(Boolean); }
  set className(v) { this.attrs.class = v; } get className() { return this.attrs.class || ""; }
  set id(v) { this.attrs.id = v; } get id() { return this.attrs.id || ""; }
  setAttribute(k, v) { this.attrs[k] = String(v); } getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  removeAttribute(k) { delete this.attrs[k]; } hasAttribute(k) { return k in this.attrs; }
  flag(k, v) { if (v) this.attrs[k] = ""; else delete this.attrs[k]; }
  get hidden() { return "hidden" in this.attrs; } set hidden(v) { this.flag("hidden", v); }
  get disabled() { return "disabled" in this.attrs; } set disabled(v) { this.flag("disabled", v); }
  get open() { return "open" in this.attrs; } set open(v) { this.flag("open", v); }
  get value() { return this._value !== undefined ? this._value : (this.attrs.value || ""); } set value(v) { this._value = String(v); }
  appendChild(c) { if (c.parentNode) c.parentNode.children = c.parentNode.children.filter(x => x !== c); c.parentNode = this; this.children.push(c); this._html = null; return c; }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(x => x !== this); this.parentNode = null; }
  set textContent(v) { this.children = []; this._text = String(v); this._html = null; }
  get textContent() { return this._html != null ? this._html.replace(/<[^>]+>/g, "") : this._text + this.children.map(c => c.textContent).join(""); }
  set innerHTML(v) { this.children = []; this._text = ""; this._html = v ? String(v) : null; }
  get innerHTML() { return this._html != null ? this._html : this._text + this.children.map(c => "<" + c.tagName.toLowerCase() + ">" + c.innerHTML + "</" + c.tagName.toLowerCase() + ">").join(""); }
  addEventListener(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); }
  fire(ev, extra) { (this.listeners[ev] || []).forEach(f => f(Object.assign({ target: this, preventDefault() {}, stopPropagation() {} }, extra))); }
  click() { if (!this.disabled) this.fire("click"); }
  focus() { ACTIVE = this; } select() {} scrollIntoView() {}
  all() { const out = []; this.children.forEach(c => { out.push(c); out.push(...c.all()); }); return out; }
  matches(simple) {
    const m = /^([a-z0-9]*)(?:#([\w-]+))?((?:\.[\w-]+)*)(?:\[([\w-]+)(?:="([^"]*)")?\])?(?::not\(\.([\w-]+)\))?$/i.exec(simple);
    if (!m) throw new Error("stub selector " + simple);
    if (m[1] && this.tagName !== m[1].toUpperCase()) return false;
    if (m[2] && this.attrs.id !== m[2]) return false;
    if (m[3] && m[3].split(".").filter(Boolean).some(c => this.cls().indexOf(c) < 0)) return false;
    if (m[4] && (!(m[4] in this.attrs) || (m[5] != null && this.attrs[m[4]] !== m[5]))) return false;
    if (m[6] && this.cls().indexOf(m[6]) >= 0) return false;
    return true;
  }
  matchChain(parts) {   // "a b c": this matches c, and an ancestor chain matches b then a
    if (!this.matches(parts[parts.length - 1])) return false;
    let k = parts.length - 2, up = this.parentNode;
    while (k >= 0 && up) { if (up.matches(parts[k])) k--; up = up.parentNode; }
    return k < 0;
  }
  querySelectorAll(sel) {
    const groups = sel.split(",").map(g => g.trim().split(/\s+/));
    return this.all().filter(e => groups.some(g => e.matchChain(g)));
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  closest(sel) { let e = this; while (e) { if (e.matches(sel)) return e; e = e.parentNode; } return null; }
}
function env() {
  const body = new El("body"), store = {};
  const document = { body, visibilityState: "visible", createElement: t => new El(t), createElementNS: (ns, t) => new El(t),
    querySelector: s => body.querySelector(s), querySelectorAll: s => body.querySelectorAll(s), addEventListener() {} };
  const LX = {};
  LX.H = (tag, attrs, parent) => {   // as core.js LX.H
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) { const v = attrs[k]; if (v == null || v === false) continue;
      if (k === "text") e.textContent = v; else if (k === "html") e.innerHTML = v; else if (k === "class") e.className = v;
      else if (k.slice(0, 2) === "on" && typeof v === "function") e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? "" : v); }
    if (parent) parent.appendChild(e);
    return e;
  };
  LX.S = LX.H;
  let uid = 0; LX.uid = p => (p || "lx") + "-" + (++uid);
  LX.esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  LX.rich = t => LX.esc(t).replace(/\[\[([a-z0-9-]+)\|([^\]]+)\]\]/g, (m, id, w) => '<span class="lx-term" data-term="' + id + '">' + w + "</span>");
  LX.icon = () => ""; LX.emit = () => {}; LX.reduced = () => true; LX.visible = () => false; LX.onTheme = () => {};
  LX.clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  LX.store = { get: (k, d) => (k in store ? JSON.parse(store[k]) : d), set: (k, v) => { store[k] = JSON.stringify(v); } };
  LX.progress = { done() {} };
  const window = { LX, addEventListener() {}, confirm: () => true, innerWidth: 390, performance: { now: () => Date.now() } };
  return { LX, document, window, body, store };
}
function load(name, E) {
  const ctx = { window: E.window, document: E.document, location: { hash: "" }, performance: E.window.performance, navigator: {}, setTimeout: () => 0,
    console, module: { exports: {} } };
  vm.runInNewContext(fs.readFileSync(L("components/" + name + ".js"), "utf8"), ctx);
  return ctx.module.exports;
}
const buttons = (root, re) => root.querySelectorAll("button").filter(b => re.test(b.textContent));

// ---------------------------------------------------------------- checkpoint: pure range check
const CP = require(L("components/checkpoint.js"));
const ckf = JSON.parse(fs.readFileSync(L("data/ck-f-estimate.json"), "utf8")), est = CP.task(ckf, "est-buses");
const one = CP.checkEstimate(est, 440, 440, "MWh per year");
ok(!one.ordered && one.overlaps === undefined && /same number/.test(one.rangeMsg) && /high above your low/.test(one.rangeMsg), "checkpoint: low = high is not a range, and the message says so");
const rev = CP.checkEstimate(est, 600, 300, "MWh per year");
ok(!rev.ordered && /high above the low/.test(rev.rangeMsg) && !/same number/.test(rev.rangeMsg), "checkpoint: a reversed range asks for the high above the low");
ok(CP.checkEstimate(est, 439, 440, "MWh per year").ordered && CP.checkEstimate(est, 300, 600, "MWh per year").overlaps, "checkpoint: any high above the low is a range");

// ---------------------------------------------------------------- checkpoint: the view on a stub page
(function () {
  const E = env(); load("checkpoint", E);
  const page = E.body, LX = E.LX, H = LX.H;
  const lock = H("div", { id: "ck-lock", class: "lx-ck-lock" }, page); H("button", { type: "button", text: "Open the worked solution now" }, lock);
  const solBody = H("div", { id: "ck-sol", class: "lx-ck-gated" }, page);
  const rt = H("table", { id: "ck-rubric" }, page), tb = H("tbody", null, rt);
  ["units", "range", "uncertainty", "check"].forEach(c => { const tr = H("tr", { "data-c": c }, tb); H("th", { text: c }, tr); ["n", "d", "p", "s"].forEach(x => H("td", { text: c + " " + x }, tr)); });
  const D = { version: "ck-t v1", rule: ckf.rule, tasks: [
    { id: "q1", kind: "choice", title: "Choose", lesson: "T5", skill: "read", prompt: "Pick one.", options: [["a", "A"], ["b", "B"]], answer: "a",
      why: { a: "Yes: the [[capacity-factor|capacity factor]].", b: "No." }, solution: "The [[capacity-factor|capacity factor]] is energy over the most possible." },
    { id: "o1", kind: "open-short", title: "Explain", lesson: "T0", skill: "explain", prompt: "Why?", solution: "Two points.",
      points: ["A [[frequency|frequency]] point.", "Plain point."] },
    { id: "e1", kind: "estimate", title: "Estimate", lesson: "T1", skill: "estimate", prompt: "How much?", units: est.units, range: est.range, show: est.show }] };
  const host = H("div", null, page);
  const cp = LX.Checkpoint(host, { data: D, key: "ckt", code: "CK-T", rubric: "#ck-rubric", lock: "#ck-lock", solution: "#ck-sol" });
  const shut = () => !lock.hidden && !solBody.classList.contains("is-open"), opened = () => lock.hidden && solBody.classList.contains("is-open");
  ok(shut(), "checkpoint view: the page's worked solution starts shut");
  buttons(host, /^Start the checkpoint/)[0].click();
  ok(cp.state().cur === 0 && !!cp.state().started, "checkpoint view: Start opens task 1");

  // glossary marks in a solution, in choice feedback, and in the points (solution list and self-tick list)
  ok(host.querySelector("details.lx-ck-sol p").innerHTML === 'The <span class="lx-term" data-term="capacity-factor">capacity factor</span> is energy over the most possible.',
     "checkpoint view: a solution renders [[glossary|marks]] (LX.rich)");
  host.querySelectorAll("button.lx-choice")[0].click();
  ok(/<span class="lx-term" data-term="capacity-factor">capacity factor<\/span>/.test(host.querySelector(".lx-saw").innerHTML), "checkpoint view: choice feedback renders glossary marks");
  cp.show(1);
  ok(host.querySelector("ul.lx-ck-solpts li").innerHTML === 'A <span class="lx-term" data-term="frequency">frequency</span> point.', "checkpoint view: solution points render glossary marks");
  ok(host.querySelector("ul.lx-ck-points span").innerHTML === 'A <span class="lx-term" data-term="frequency">frequency</span> point.', "checkpoint view: self-tick points render glossary marks");
  ok(!/\[\[/.test(host.textContent), "checkpoint view: no raw [[...]] marks on screen");

  // the estimate's early button opens the page's worked solution, and records it
  cp.show(2);
  const early = buttons(host, /^Show the worked solution now/)[0];
  ok(early && !early.hidden && shut(), "checkpoint view: the estimate task offers the early button while the solution is shut");
  early.click();
  ok(opened() && cp.state().tasks.e1.solFirst === true && early.hidden, "checkpoint view: the estimate's early button opens the page's worked solution (recorded)");

  // Start again clears the attempt and shuts the worked solution again
  cp.intro();
  buttons(host, /^Start again/)[0].click();
  ok(shut() && !cp.state().started && Object.keys(cp.state().tasks).length === 0, "checkpoint view: Start again re-locks the worked solution and clears the attempt");
  cp.show(2);
  ok(!buttons(host, /^Show the worked solution now/)[0].hidden, "checkpoint view: after Start again the early button is offered again");

  // one number is not a range: not submitted, not recorded, the solution stays shut; a real range goes through
  const ins = host.querySelectorAll(".lx-ck-grid2 input"), sel = host.querySelector(".lx-ck-grid2 select"), submit = buttons(host, /^Submit my estimate/)[0];
  ins[0].value = "440"; ins[1].value = "440"; sel.value = "MWh per year"; submit.click();
  const fb = host.querySelector(".lx-ck-fb"), r0 = cp.state().tasks.e1 || {};
  ok(/same number/.test(fb.textContent) && fb.querySelector(".lx-saw").classList.contains("no"), "checkpoint view: low = high gets the range message");
  ok(!r0.tries && r0.first == null && !r0.answer && shut() && host.querySelectorAll(".lx-ck-rating fieldset").length === 0,
     "checkpoint view: low = high is not recorded, opens no solution and no rating");
  ins[1].value = "600"; submit.click();
  const r1 = cp.state().tasks.e1;
  ok(r1.tries === 1 && r1.first === true && r1.answer.low === 440 && r1.answer.high === 600 && opened() && host.querySelectorAll(".lx-ck-rating fieldset").length === 4,
     "checkpoint view: a range is recorded, opens the worked solution and the four-criterion rating");
})();

// ---------------------------------------------------------------- sheet: the Fill-down button follows the selected cell
(function () {
  const E = env(); load("sheet", E);
  const host = E.LX.H("div", null, E.body);
  const sheet = { cells: { A2: "3", A3: "4", A4: "5", A5: "6" }, rows: 6, cols: 3 };
  const sh = E.LX.Sheet(host, sheet, { start: "B2", fillRows: [2, 5] });
  const fill = buttons(host, /^Fill down to row 5/)[0], fx = host.querySelector("input.lx-sheet-fx"), enter = buttons(host, /^Enter$/)[0];
  ok(fill && fill.disabled, "sheet: Fill down is off on an empty cell");
  fx.value = "=A2*2"; enter.click();
  ok(!fill.disabled && sheet.cells.B2 === "=A2*2", "sheet: typing a formula and pressing the Enter button turns Fill down on");
  fx.value = "7"; fx.fire("keydown", { key: "Enter" });
  ok(fill.disabled, "sheet: replacing it with a number (Enter key) turns Fill down off");
  sh.set("B2", "=A2+1");
  ok(!fill.disabled, "sheet: set() of a formula in the selected cell turns Fill down on");
  sh.set("C3", "1");
  ok(!fill.disabled, "sheet: set() of another cell keeps the selected cell's state");
  fill.click();
  ok(sheet.cells.B5 === "=A5+1" && !fill.disabled, "sheet: fill-down copies the formula and the button stays on");
  sh.select("B5");
  ok(fill.disabled, "sheet: the last fill row offers no fill-down");
})();

// ---------------------------------------------------------------- step cards: api.busy
(function () {
  const E = env(); load("cards", E);
  const host = E.LX.H("div", null, E.body); const api = [];
  const cards = E.LX.StepCards(host, { steps: [{ text: "One.", build: (act, a) => { api[0] = a; } }, { text: "Two.", build: (act, a) => { api[1] = a; } }, { text: "Three." }] });
  const card = cards.el, next = () => card.querySelector(".lx-step-foot").children[1], busyAttr = () => card.getAttribute("aria-busy");
  ok(typeof api[0].busy === "function" && next().disabled && busyAttr() === null, "cards: api.busy exists; Next starts shut; the card is not busy");
  api[0].busy(true);
  ok(next().disabled && busyAttr() === "true", "cards: busy(true) keeps Next shut and marks the card aria-busy");
  api[0].done();
  ok(next().disabled, "cards: done() during a solve does not open Next");
  next().click(); ok(cards.index() === 0, "cards: Next does not advance while busy");
  api[0].busy(false);
  ok(!next().disabled && busyAttr() === null, "cards: busy(false) after done() opens Next and clears aria-busy");
  api[0].busy(true); ok(next().disabled, "cards: a new solve shuts Next again, though the step is done");
  api[0].busy(false); next().click();
  ok(cards.index() === 1 && next().disabled && busyAttr() === null, "cards: Next advances once the solve is over; the new card is not busy");
  // a late solve from step 1 (after the reader moved on) changes nothing on screen
  api[0].busy(true); ok(busyAttr() === null && next().disabled, "cards: a late busy(true) from a card no longer shown leaves the current card alone");
  api[0].done(); ok(next().disabled, "cards: a late done() from step 1 does not unlock step 2");
  api[1].busy(true); api[1].busy(false); ok(next().disabled, "cards: busy(false) on a step not yet done leaves Next shut");
  cards.go(0); ok(!next().disabled && busyAttr() === null, "cards: going back, a done step is open and not busy");
})();

// ---------------------------------------------------------------- M1 step 8, frontier, plot.css, equation.css (source)
const m1 = fs.readFileSync(L("m01-dispatch-to-lmp.js"), "utf8");
const s8 = m1.slice(m1.indexOf("// 8 tighten the line"), m1.indexOf("// 9 explain a bus price"));
ok(/api\.busy\(true\)/.test(s8) && /api\.busy\(false\)/.test(s8) && !/lx-step-foot|nx\.disabled|function busy\(/.test(s8), "M1 step 8: Next waits through api.busy, not through the card's buttons");
ok(!/lx-step-foot \.lx-btn:not\(\.ghost\)"\), unlocked/.test(m1), "M1: no DOM workaround for Next left");
const fr = fs.readFileSync(L("components/frontier.js"), "utf8");
ok(/o\.shadeLabel \|\| "out of reach \(approximately\)"/.test(fr) && !/\|\| "out of reach";/.test(fr), "frontier: the default shade label says approximately");
const css = f => fs.readFileSync(L("components/" + f), "utf8"), bundleCss = fs.readFileSync(L("learn.css"), "utf8");
ok(/\.lx-stage \{ display: grid; grid-template-columns: minmax\(0, 1fr\);/.test(css("plot.css")) && bundleCss.indexOf("grid-template-columns: minmax(0, 1fr); gap: 10px; background: var(--lx-surface)") >= 0,
   "plot.css: the model-lab stage has one shrinkable column (in the bundle too)");
ok(/\.lx-eq\.dense \.lx-eq-row \.note \{ display: block; white-space: normal;/.test(css("equation.css")) && bundleCss.indexOf(".lx-eq.dense .lx-eq-row .note { display: block;") >= 0,
   "equation.css: a dense row's note sits on its own line and wraps (in the bundle too)");

console.log(`components (shared fixes): ${checks - fails} of ${checks} checks passed`);
process.exit(fails ? 1 : 0);
