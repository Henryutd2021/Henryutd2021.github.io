// stubdom.js — a small stub document for Node tests of Learn components. Not a test itself (the test runner runs
// test_*.js only). It grew out of the stub in test_components_shared.js, with text nodes, checkboxes and radios.
//   const { env, load, buttons } = require("./stubdom.js");
//   const E = env();                         // { LX, document, window, body, store, location }
//   load("exemplars", E);                    // runs assets/learn/components/exemplars.js against the stub; returns its exports
//   const ex = E.LX.Exemplars(E.LX.H("div", null, E.body), {...});
//   el.click(); el.fire("keydown", { key: "Enter" }); el.querySelectorAll(".lx-ex-mark")
// Elements keep attributes, children in order, listeners, and the reflected properties components use (hidden, disabled,
// open, value, checked). Selectors: tag, #id, .class, [attr], [attr="v"], :not(.class), descendant chains and comma
// lists, matched in document order. LX holds the core helpers as core.js defines them (H, S, uid, esc, rich, store, ...;
// rich and mulberry32 are core.js's own exports);
// LX.copyText resolves false (no clipboard), so components show their select-and-copy box.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const SITE = path.resolve(__dirname, "..", "..");
let ACTIVE = null;
class Text {
  constructor(t) { this._t = String(t); this.parentNode = null; this.children = []; this.nodeType = 3; }
  get textContent() { return this._t; } set textContent(v) { this._t = String(v); }
  all() { return []; } matches() { return false; } matchChain() { return false; }
}
const escH = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
class El {
  constructor(tag) {
    this.tagName = tag.toUpperCase(); this.attrs = {}; this.children = []; this.parentNode = null; this._text = ""; this._html = null; this.listeners = {};
    this.nodeType = 1; this.style = { setProperty() {} };
    const self = this;
    this.classList = {
      add: (...c) => { const s = new Set(self.cls()); c.forEach(x => s.add(x)); self.attrs.class = [...s].join(" "); },
      remove: (...c) => { self.attrs.class = self.cls().filter(x => c.indexOf(x) < 0).join(" "); },
      toggle: (c, on) => { const has = self.cls().indexOf(c) >= 0; if (on === undefined) on = !has; if (on) self.classList.add(c); else self.classList.remove(c); return on; },
      contains: c => self.cls().indexOf(c) >= 0 };
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
  get checked() { return this._checked !== undefined ? this._checked : "checked" in this.attrs; } set checked(v) { this._checked = !!v; }
  get value() { return this._value !== undefined ? this._value : (this.attrs.value || ""); } set value(v) { this._value = String(v); }
  appendChild(c) { if (c.parentNode) c.parentNode.children = c.parentNode.children.filter(x => x !== c); c.parentNode = this; this.children.push(c); this._html = null; return c; }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(x => x !== this); this.parentNode = null; }
  set textContent(v) { this.children = []; this._text = String(v); this._html = null; }
  get textContent() { return this._html != null ? this._html.replace(/<[^>]+>/g, "") : this._text + this.children.map(c => c.textContent).join(""); }
  set innerHTML(v) { this.children = []; this._text = ""; this._html = v ? String(v) : null; }
  get innerHTML() {
    if (this._html != null) return this._html;
    return escH(this._text) + this.children.map(c => c instanceof Text ? escH(c.textContent) : "<" + c.tagName.toLowerCase() + ">" + c.innerHTML + "</" + c.tagName.toLowerCase() + ">").join("");
  }
  addEventListener(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); }
  fire(ev, extra) { const e = Object.assign({ target: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {} }, extra); (this.listeners[ev] || []).forEach(f => f(e)); return e; }
  click() { if (!this.disabled) this.fire("click"); }
  focus() { ACTIVE = this; } select() {} scrollIntoView() {}
  all() { const out = []; this.children.forEach(c => { if (c instanceof El) { out.push(c); out.push(...c.all()); } }); return out; }
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
  matchChain(parts) {
    if (!this.matches(parts[parts.length - 1])) return false;
    let k = parts.length - 2, up = this.parentNode;
    while (k >= 0 && up) { if (up.matches(parts[k])) k--; up = up.parentNode; }
    return k < 0;
  }
  querySelectorAll(sel) { const groups = sel.split(",").map(g => g.trim().split(/\s+/)); return this.all().filter(e => groups.some(g => e.matchChain(g))); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  closest(sel) { let e = this; while (e) { if (e.matches && e.matches(sel)) return e; e = e.parentNode; } return null; }
}
function env(opt) {
  opt = opt || {};
  const body = new El("body"), store = Object.assign({}, opt.store || {});
  const document = { body, visibilityState: "visible", createElement: t => new El(t), createElementNS: (ns, t) => new El(t), createTextNode: t => new Text(t),
    querySelector: s => body.querySelector(s), querySelectorAll: s => body.querySelectorAll(s), addEventListener() {}, getElementById: id => body.querySelector("#" + id) };
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
  LX.hTag = level => "h" + level;   // as core.js's for a box it cannot place on a page (the stub has no document order);
                                    // the outline of the rendered pages is checked in a browser
  let uid = 0; LX.uid = p => (p || "lx") + "-" + (++uid);
  LX.esc = escH;
  LX.rich = require(path.join(SITE, "assets/learn/components/core.js")).rich;   // core.js's own (lesson links too)
  LX.icon = name => "<svg data-icon=\"" + name + "\"></svg>"; LX.emit = () => {}; LX.on = () => {}; LX.reduced = () => true; LX.onTheme = () => {};
  LX.clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  LX.mulberry32 = require(path.join(SITE, "assets/learn/components/core.js")).mulberry32;   // as core.js (M7, engine E1)
  LX.store = { get: (k, d) => (k in store ? JSON.parse(store[k]) : d), set: (k, v) => { store[k] = JSON.stringify(v); } };
  LX.progress = { done() {} };
  LX.copyText = () => Promise.resolve(false);
  const location = { hash: opt.hash || "", href: "https://example.org/learn/x.html" + (opt.hash || "") };
  const window = { LX, addEventListener() {}, confirm: () => true, innerWidth: 390, performance: { now: () => Date.now() } };
  return { LX, document, window, body, store, location };
}
function load(name, E) {
  const ctx = { window: E.window, document: E.document, location: E.location, history: { replaceState() {} }, performance: E.window.performance,
    navigator: {}, setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {}, console, module: { exports: {} },
    encodeURIComponent, decodeURIComponent };
  vm.runInNewContext(fs.readFileSync(path.join(SITE, "assets/learn/components", name + ".js"), "utf8"), ctx);
  return ctx.module.exports;
}
const buttons = (root, re) => root.querySelectorAll("button").filter(b => re.test(b.textContent));
const active = () => ACTIVE;
module.exports = { El, Text, env, load, buttons, active };
