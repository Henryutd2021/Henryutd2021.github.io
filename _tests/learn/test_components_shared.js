// test_components_shared.js — Node tests for the shared-component fixes collected after the W1 per-lesson reviews
// (2026-11-02; reports/learn/w1_shared_fixes.md), run on a small stub document:
//   - checkpoint.js (LX.Checkpoint): its W2 options (describe, submitTask, onAnswer, numeric check with any unit,
//     destroy) on a CK-M-like checkpoint; the estimate task's early "Show the worked solution now" opens the page's worked
//     solution as well; "Start again" shuts it again; a range needs a high above its low (pure check and view: one
//     number is not submitted, and says why); solutions, points and choice feedback take [[glossary|marks]]
//   - sheet.js (LX.Sheet): "Fill down" follows the selected cell after Enter and after set(), not only after a move
//   - cards.js (LX.StepCards): api.busy(on) holds Next shut while a solve runs (and marks the card aria-busy); a late call
//     from a card no longer shown changes nothing; M1 step 8 uses it instead of reaching into the card's buttons
//   - unitchain.js/.css (LX.UnitChain) is .lx-uchain, so a page with a causal chain (.lx-chain, chains.css) keeps both
//     layouts (the bundle's rules cascaded onto stub elements)
//   - flowchart.js (LX.Flowchart): update(traces) changes the traces without redrawing; lesson 3 uses it
//   - frontier.js, plot.css, equation.css, base.css: the default shade label, the model-lab stage's single shrinkable
//     column, a dense row's note on its own line, and .lx-real ol styled as the sources list (lesson 8 drops its inline
//     style); equation.js's units in the text version are tested in test_components_d.js
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
  removeEventListener(ev, fn) { if (this.listeners[ev]) this.listeners[ev] = this.listeners[ev].filter(f => f !== fn); }
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
    querySelector: s => body.querySelector(s), querySelectorAll: s => body.querySelectorAll(s), listeners: {},
    addEventListener(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); },
    removeEventListener(ev, fn) { if (this.listeners[ev]) this.listeners[ev] = this.listeners[ev].filter(f => f !== fn); } };
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
  const window = { LX, listeners: {}, addEventListener(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); },
    removeEventListener(ev, fn) { if (this.listeners[ev]) this.listeners[ev] = this.listeners[ev].filter(f => f !== fn); },
    confirm: () => true, innerWidth: 390, performance: { now: () => Date.now() } };
  return { LX, document, window, body, store };
}
function load(name, E) {
  const ctx = { window: E.window, document: E.document, location: { hash: "" }, performance: E.window.performance, navigator: {}, setTimeout: () => 0,
    setInterval: () => 0, clearInterval: () => {},
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

// ---------------------------------------------------------------- checkpoint: the runner's options (W2 integration, for CK-M)
// describe (the results sentence), submitTask (the final open-short task opens the page's solution), onAnswer, the numeric
// check with any unit (answer.value), destroy() (clock, listeners and markup gone; the attempt saved)
(function () {
  const E = env(); load("checkpoint", E);
  const page = E.body, LX = E.LX, H = LX.H;
  const lock = H("div", { id: "ck-lock", class: "lx-ck-lock" }, page), lb = H("button", { type: "button", text: "Open the worked solution now" }, lock);
  const solBody = H("div", { id: "ck-sol", class: "lx-ck-gated" }, page);
  const D = { version: "ck-u v1", rule: { autoProficient: 1, autoStrong: 2, autoDeveloping: 1, criteria: [], levels: ["Not yet", "Developing", "Proficient", "Strong"] }, tasks: [
    { id: "n1", kind: "numeric", title: "Peak", lesson: "M1", skill: "solve", prompt: "The peak draw?", solution: "255 kW.",
      units: [["kW", 1], ["MW", 1000], ["kWh", null]], unitNote: { kWh: "kWh measures energy; the peak draw is a rate." }, answer: { value: 255, tol: 0.01, show: "about 255 kW" } },
    { id: "f1", kind: "open-short", title: "Validate", lesson: "R5", skill: "validate", prompt: "Does it hold?", solution: "Two points.", points: ["One.", "Two."] }] };
  const seen = [], host = H("div", null, page), lbBefore = (lb.listeners.click || []).length;
  const cp = LX.Checkpoint(host, { data: D, key: "cku", code: "CK-U", lock: "#ck-lock", solution: "#ck-sol", submitTask: "f1",
    describe: (DD, L) => "Custom sentence: " + L.auto + " of " + L.autoOf + ".", onAnswer: (id, r) => seen.push(id + (r.solFirst ? "*" : "")) });
  const shut = () => !lock.hidden && !solBody.classList.contains("is-open"), opened = () => lock.hidden && solBody.classList.contains("is-open");
  ok(shut() && (E.document.listeners.visibilitychange || []).length === 1 && (E.window.listeners.pagehide || []).length === 1 && lb.listeners.click.length === lbBefore + 1,
     "checkpoint options: shut at start; one visibility, one pagehide and one lock-button listener");
  // numeric with any unit: the shared default check reads answer.value
  ok(CP.checkNumeric(D.tasks[0], 0.255, "MW").right && CP.checkNumeric(D.tasks[0], 255, "kWh").kind && /rate/.test(CP.checkNumeric(D.tasks[0], 255, "kWh").msg) &&
     /Choose a unit/.test(CP.checkNumeric(D.tasks[0], 255, "GW").msg) && CP.checkNumeric(D.tasks[0], 255, "kW").msg === "About 255 kW.", "checkpoint options: numeric check with any unit (factor, wrong kind, unknown unit)");
  ok(CP.checkNumeric(est.units ? { units: [["MWh", 1], ["MW", 0]], answer: { mwh: 1000, tol: 0.1 } } : null, 1000, "MWh").right, "checkpoint options: the MWh form still works (CK-F)");
  cp.show(0);
  const inp = host.querySelector(".lx-ck-grid2 input"), sel = host.querySelector(".lx-ck-grid2 select");
  inp.value = "0.255"; sel.value = "MW"; buttons(host, /^Check$/)[0].click();
  ok(cp.state().tasks.n1.first === true && /About 255 kW/.test(host.textContent) && shut(), "checkpoint options: the view checks a number in another unit; an earlier task opens no solution");
  cp.show(1);
  host.querySelector("textarea").value = "It holds within 2%."; buttons(host, /^Submit my explanation/)[0].click();
  ok(opened() && seen.join() === "n1,f1", "checkpoint options: submitting the submit task opens the page's worked solution; onAnswer sees each answer");
  cp.results();
  ok(host.querySelector(".lx-ck-describe").textContent === "Custom sentence: 1 of 1.", "checkpoint options: describe writes the results sentence");
  ok(CP.describe(ckf, CP.level(ckf, { tasks: {} })).indexOf("Auto-marked tasks right on the first try: 0 of ") === 0, "checkpoint options: the default sentence is CK-F's");
  // Start again re-locks; the lock box's button then records the early opening on the submit task
  buttons(host, /^Start again/)[0].click();
  ok(shut(), "checkpoint options: Start again shuts the worked solution");
  lb.click();
  ok(opened() && cp.state().tasks.f1.solFirst === true && seen[seen.length - 1] === "f1*", "checkpoint options: the lock button opens it early, recorded on the submit task");
  // destroy: listeners and markup gone, the attempt saved; a new runner resumes it
  cp.show(0);
  cp.destroy();
  ok((E.document.listeners.visibilitychange || []).length === 0 && (E.window.listeners.pagehide || []).length === 0 && lb.listeners.click.length === lbBefore && host.children.length === 0,
     "checkpoint options: destroy() removes the listeners and the markup");
  ok(E.LX.store.get("cku", null).tasks.f1.solFirst === true && E.LX.store.get("cku", null).cur === 0, "checkpoint options: destroy() leaves the attempt saved");
  const cp2 = LX.Checkpoint(host, { data: D, key: "cku", code: "CK-U", lock: "#ck-lock", solution: "#ck-sol", submitTask: "f1" });
  ok(opened() && /How this checkpoint works/.test(host.textContent) && cp2.state().tasks.f1.solFirst, "checkpoint options: a new runner reads the saved attempt (solution still open, recorded)");
  cp2.destroy();
})();

// ---------------------------------------------------------------- checkpoint: shared fix 14 (after the CK-M review)
// the tolerance under a number task's field; the openFirst option of the level rule; the worked solution's opening
// recorded per runner (kept across Start again), with the submit task's answer time
(function () {
  const E = env(); load("checkpoint", E);
  const page = E.body, LX = E.LX, H = LX.H;
  const lock = H("div", { id: "ck-lock", class: "lx-ck-lock" }, page), lb = H("button", { type: "button", text: "Open the worked solution now" }, lock);
  H("div", { id: "ck-sol", class: "lx-ck-gated" }, page);
  const rule = { autoProficient: 1, autoStrong: 2, autoDeveloping: 1, criteria: [], levels: ["Not yet", "Developing", "Proficient", "Strong"] };
  const mk = (extra) => ({ version: "ck-v v1", rule: rule, tasks: [
    Object.assign({ id: "n1", kind: "numeric", title: "Peak", lesson: "M1", skill: "solve", prompt: "The peak draw?", solution: "255 kW.",
      units: [["kW", 1], ["MW", 1000]], answer: { value: 255, tol: 0.005, show: "about 255 kW" } }, extra || {}),
    { id: "c1", kind: "choice", title: "Pick", lesson: "M1", skill: "read", prompt: "Which?", options: [["a", "A"], ["b", "B"]], answer: "a", why: {}, solution: "A." },
    { id: "f1", kind: "open-short", title: "Validate", lesson: "R5", skill: "validate", prompt: "Does it hold?", solution: "Two points.", points: ["One.", "Two."] }] });
  // the tolerance, under the field and tied to it
  ok(CP.tolText(mk().tasks[0]) === "Within 0.5% of the right value counts as right." && CP.tolText({ answer: { mwh: 1000, tol: 0.1 } }) === "Within 10% counts as right." &&
     CP.tolText(mk({ tolNote: "Within 0.5% (about 1 kW) counts as right." }).tasks[0]) === "Within 0.5% (about 1 kW) counts as right." && CP.tolText({ kind: "choice" }) === "",
     "checkpoint: tolText from the task's tolNote, else from answer.tol (either answer form)");
  let host = H("div", null, page), cp = LX.Checkpoint(host, { data: mk({ tolNote: "Within 0.5% (about 1 kW) counts as right." }), key: "ckv", code: "CK-V", lock: "#ck-lock", solution: "#ck-sol", submitTask: "f1" });
  cp.show(0);
  const tl = host.querySelector(".lx-ck-tol"), inp = host.querySelector(".lx-ck-grid2 input");
  ok(tl && tl.textContent === "Within 0.5% (about 1 kW) counts as right." && inp.getAttribute("aria-describedby") === tl.id && host.querySelector(".lx-ck-q").textContent === "The peak draw?",
     "checkpoint view: a number task shows its tolerance under the answer field, before any answer, tied to the field");
  cp.destroy();
  host = H("div", null, page); cp = LX.Checkpoint(host, { data: mk(), key: "ckw", code: "CK-W", tolerance: false });
  cp.show(0); ok(!host.querySelector(".lx-ck-tol") && !host.querySelector(".lx-ck-grid2 input").getAttribute("aria-describedby"), "checkpoint view: tolerance: false hides the line");
  cp.destroy();
  // openFirst: a task answered right after its solution was opened
  const D = mk(), at = { tasks: { n1: { first: true, solFirst: true }, c1: { first: true, solFirst: false }, f1: { answer: "x", points: [true, true] } } };
  ok(CP.level(D, at).auto === 2 && CP.level(D, at, { openFirst: "not-right" }).auto === 1 && CP.level(D, at, { openFirst: "not-right" }).early === 1 &&
     CP.level(Object.assign({}, D, { rule: Object.assign({}, rule, { openFirst: "not-right" }) }), at).auto === 1, "checkpoint: openFirst not-right counts a task opened first as not right (option or data.rule); the default keeps CK-F's rule");
  ok(CP.firstRight({ first: true, solFirst: true }) && !CP.firstRight({ first: true, solFirst: true }, "not-right") && CP.firstRight({ first: true }, "not-right") && !CP.firstRight(null), "checkpoint: firstRight");
  ok(/1 with the solution opened first, counted as not right/.test(CP.describe(D, CP.level(D, at, { openFirst: "not-right" }))) && !/opened first/.test(CP.describe(D, CP.level(D, at))), "checkpoint: describe names the tasks opened first under that rule");
  host = H("div", null, page); cp = LX.Checkpoint(host, { data: mk(), key: "ckx", code: "CK-X", openFirst: "not-right" });
  cp.show(0); buttons(host, /^Show the worked solution now/)[0].click();
  const inp2 = host.querySelector(".lx-ck-grid2 input"), sel2 = host.querySelector(".lx-ck-grid2 select"); inp2.value = "255"; sel2.value = "kW"; buttons(host, /^Check$/)[0].click();
  cp.results();
  ok(/Auto-marked tasks right on the first try: 0 of 2 \(1 with the solution opened first, counted as not right\)/.test(host.querySelector(".lx-ck-describe").textContent), "checkpoint view: the runner's openFirst option reaches its level and results sentence");
  cp.destroy();
  // the worked solution's opening, per runner: at the submit task's answer time; kept across Start again; the lock
  // button's early opening is recorded before onAnswer runs
  ok(LX.Checkpoint.solOpened("cky") === null, "checkpoint: no opening recorded yet");
  const seen = [];
  host = H("div", null, page); cp = LX.Checkpoint(host, { data: mk(), key: "cky", code: "CK-Y", lock: "#ck-lock", solution: "#ck-sol", submitTask: "f1",
    onAnswer: (id, r) => seen.push([id, LX.Checkpoint.solOpened("cky"), r.at || null]) });
  cp.show(2); host.querySelector("textarea").value = "It holds."; buttons(host, /^Submit my explanation/)[0].click();
  const fr = cp.state().tasks.f1;
  ok(fr.at && LX.Checkpoint.solOpened("cky") === fr.at && seen[seen.length - 1][1] === fr.at, "checkpoint: submitting the submit task records the opening at its answer time (onAnswer sees it)");
  ok(LX.Checkpoint.solOpened("ckz") === null, "checkpoint: the record is per runner (another key has none)");
  E.window.confirm = () => true;
  cp.results(); buttons(host, /^Start again/)[0].click();
  ok(LX.Checkpoint.solOpened("cky") === fr.at && !cp.state().tasks.f1, "checkpoint: Start again clears the attempt but keeps when the solution first opened");
  cp.destroy();
  host = H("div", null, page); seen.length = 0;
  cp = LX.Checkpoint(host, { data: mk(), key: "ckz", code: "CK-Z", lock: "#ck-lock", solution: "#ck-sol", submitTask: "f1", onAnswer: (id, r) => seen.push([id, LX.Checkpoint.solOpened("ckz"), !!r.solFirst]) });
  lb.click();
  ok(seen.length === 1 && seen[0][0] === "f1" && seen[0][1] && seen[0][2] && cp.state().tasks.f1.solFirst, "checkpoint: the lock button records the early opening for this runner, before onAnswer runs");
  cp.destroy();
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

// ---------------------------------------------------------------- a causal chain and a unit chain on one page
// The bundle's top-level rules (no @media) are cascaded onto the stub elements: highest specificity, then the last rule.
// Selectors the stub cannot match (pseudo-classes, child combinators) count as not matching.
function cssRules(text) {
  const out = []; text = text.replace(/\/\*[\s\S]*?\*\//g, "");
  let i = 0, order = 0;
  while (i < text.length) {
    const open = text.indexOf("{", i); if (open < 0) break;
    const head = text.slice(i, open).trim();
    if (head.charAt(0) === "@") {   // skip the whole at-rule block
      let d = 1, j = open + 1; while (j < text.length && d) { if (text[j] === "{") d++; else if (text[j] === "}") d--; j++; }
      i = j; continue;
    }
    const close = text.indexOf("}", open), decl = {};
    text.slice(open + 1, close).split(";").forEach(x => { const k = x.indexOf(":"); if (k > 0) decl[x.slice(0, k).trim()] = x.slice(k + 1).trim(); });
    head.split(",").forEach(sel => out.push({ sel: sel.trim(), decl, order: order++ }));
    i = close + 1;
  }
  return out;
}
function spec(sel) { const c = (sel.match(/[.#[]/g) || []).length, t = sel.split(/\s+/).filter(p => /^[a-z]/i.test(p)).length; return c * 100 + t; }
function computed(rules, el, prop) {
  let best = null;
  rules.forEach(r => {
    if (!(prop in r.decl)) return;
    let hit = false; try { hit = el.matchChain(r.sel.split(/\s+/)); } catch (e) { hit = false; }
    if (hit && (!best || spec(r.sel) > spec(best.sel) || (spec(r.sel) === spec(best.sel) && r.order > best.order))) best = r;
  });
  return best ? best.decl[prop] : null;
}
function twoChains(cssText) {
  const E = env(); load("causal", E); load("unitchain", E);
  const host = E.LX.H("div", null, E.body);
  E.LX.CausalChain(E.LX.H("div", null, host), { title: "Cause and effect", links: [{ title: "Clouds", text: "Less sun.", value: "149 → 112 MW" }, { title: "Gas", text: "More gas." }, { title: "Price", text: "Up." }] });
  E.LX.UnitChain(E.LX.H("div", null, host), { steps: [{ v: "649 TWh", u: "a year" }, { op: "÷ 8,760 h =" }, { v: "74.1 GW", u: "average power", out: true }] });
  const R = cssRules(cssText), lists = host.querySelectorAll("ol"), cl = lists[0].children[0], ul = lists[1].children[0];
  return { lists, R, causal: { display: computed(R, lists[0], "display"), cols: computed(R, lists[0], "grid-template-columns"), liPad: computed(R, cl, "padding"), liRad: computed(R, cl, "border-radius") },
    unit: { display: computed(R, lists[1], "display"), liPad: computed(R, ul, "padding"), liRad: computed(R, ul, "border-radius") } };
}
(function () {
  const bundleCss = fs.readFileSync(L("learn.css"), "utf8"), two = twoChains(bundleCss);
  ok(two.lists.length === 2 && two.lists[0].className === "lx-chain" && two.lists[1].className === "lx-uchain", "chains: the causal chain is ol.lx-chain, the unit chain ol.lx-uchain");
  ok(two.causal.display === "grid" && /^repeat\(var\(--n/.test(two.causal.cols) && two.causal.liPad === "12px 14px 12px 12px" && two.causal.liRad === "12px",
     "chains: with both on one page, the causal chain keeps its grid and its step boxes (learn.css)");
  ok(two.unit.display === "flex" && two.unit.liPad === "7px 10px" && two.unit.liRad === "10px", "chains: and the unit chain keeps its wrapping row of value boxes");
  // the same harness on the bundle as it was (unit chain on .lx-chain) shows the clash it guards against
  const old = twoChains(bundleCss.replace(/\.lx-uchain/g, ".lx-chain"));
  ok(old.causal.display === "flex" && old.causal.liPad === "7px 10px", "chains: the harness detects the old clash (both on .lx-chain: the causal chain turns into a row)");
  const unitCss = fs.readFileSync(L("components/unitchain.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  ok(!/\.lx-chain\b/.test(unitCss) && !/\.lx-uchain\b/.test(fs.readFileSync(L("components/chains.css"), "utf8")), "chains: unitchain.css and chains.css style separate classes");
})();

// ---------------------------------------------------------------- flowchart: update(traces)
(function () {
  const E = env(); load("flowchart", E);
  const host = E.LX.H("div", null, E.body);
  const o = { title: "Flow", nodes: { a: { t: "Start", k: "end" }, q: { t: "Short?", k: "q" }, b: { t: "Turn up" }, c: { t: "Hold" } },
    at: { a: [1, 0], q: [1, 1], b: [0, 2], c: [2, 2] }, edges: [["a", "q"], ["q", "b", "yes"], ["q", "c", "no"]],
    traces: [{ label: "Yours", path: ["a", "q", "b"], text: "**Yours:** short." }, { label: "Calm", path: ["a", "q", "c"], text: "Calm." }] };
  const fc = E.LX.Flowchart(host, o);
  ok(typeof fc.update === "function", "flowchart: returns update()");
  const btn = () => host.querySelectorAll(".lx-ftrace button"), out = host.querySelector("p.lx-ftrace-out");
  const lit = () => host.querySelectorAll("g.fnode").filter(g => g.classList.contains("on")).map(g => g.textContent).join(",");
  fc.update([{ label: "Yours", path: ["a", "q", "c"], text: "Before drawing." }, o.traces[1]]);   // before the chart is drawn: no error
  ok(btn()[0].getAttribute("aria-pressed") === "true" && out.innerHTML === "", "flowchart: update() before the first draw only marks the selected button");
  fc.build();
  ok(lit() === "Start,Short?,Hold" && out.innerHTML === "Before drawing.", "flowchart: the first draw shows the updated selected trace");
  const first = btn()[0];
  fc.update([{ label: "Your settings", path: ["a", "q", "b"], text: "**Yours:** now short." }, { label: "Calm", path: ["a", "q", "c"], text: "Calm." }]);
  ok(btn()[0] === first && first.textContent === "Your settings" && lit() === "Start,Short?,Turn up" && out.innerHTML === "<b>Yours:</b> now short.",
     "flowchart: update() relabels the buttons in place and shows the selected trace's new path and text at once");
  const svg = host.querySelector(".lx-flow svg");
  fc.run(1, true); o.traces = null;
  fc.update([{ label: "A", path: ["a"], text: "A." }, { label: "B", path: ["a", "q", "b"], text: "B." }, { label: "C", path: ["a", "q", "c"], text: "C." }]);
  ok(btn().length === 3 && btn()[1].getAttribute("aria-pressed") === "true" && lit() === "Start,Short?,Turn up" && out.innerHTML === "B." && host.querySelector(".lx-flow svg") === svg,
     "flowchart: a longer list rebuilds the buttons, keeps the selection, and does not redraw the chart");
  fc.update([{ label: "Only", path: ["a"], text: "Only." }]);
  ok(btn().length === 1 && btn()[0].getAttribute("aria-pressed") === "true" && out.innerHTML === "Only.", "flowchart: a shorter list moves the selection to the last trace");
  btn()[0].click(); ok(out.innerHTML === "Only.", "flowchart: rebuilt buttons still run their trace");
})();

// ---------------------------------------------------------------- M1 step 8, frontier, plot.css, equation.css, base.css (source)
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

const baseCss = css("base.css"), lx8 = fs.readFileSync(path.join(SITE, "learn/08-merit-order.qmd"), "utf8");
ok(/\.lx-sources ul, \.lx-real ol \{ margin: 6px 0 0; padding-left: 1\.1rem;/.test(baseCss) && /\.lx-sources li, \.lx-real ol > li \{ margin: 4px 0; \}/.test(baseCss) &&
   /\.lx-real p:not\(\.lx-eyebrow\), \.lx-sources ul, \.lx-real ol \{ font-size: 14\.5px;/.test(baseCss), "base.css: a list in an In-the-real-world card is styled as the sources list");
ok(!/<ol style=/.test(lx8) && /<div class="lx-card lx-real">[\s\S]*?<ol>/.test(lx8), "lesson 8: its real-world list has no inline style");

console.log(`components (shared fixes): ${checks - fails} of ${checks} checks passed`);
process.exit(fails ? 1 : 0);
