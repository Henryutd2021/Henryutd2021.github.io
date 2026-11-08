// test_components_d.js — Node tests for the shared components LX.EquationCard (equation.js),
// LX.FormulateBox (formulate.js), LX.Formulation (formulation.js) and LX.Network (network.js).
//   - each file defines its LX.<Name> = when run with a stub window.LX, and sits in the bundle;
//   - the pure parts: Formulation's rule filter and symbol choice, Network's line width, label placement, price format and
//     text version (with M1's three-bus layout and the precomputed 110 MW noon case);
//   - the DOM behaviour on a small stub document: symbol buttons and their pressed state, the panel's fields, the text
//     version, fractions; the formulate box's parts and symbols box; the formulation's views, picks and marks; the
//     network's buses, aria labels and text version.
// Usage (from the site folder):  node _tests/learn/test_components_d.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const FILES = { equation: "EquationCard", formulate: "FormulateBox", formulation: "Formulation", network: "Network" };

// ---------------------------------------------------------------- a small stub document (what LX.H and LX.S need)
class El {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.attrs = {}; this.children = []; this.parentNode = null; this._text = ""; this._html = null; this.listeners = {};
    const self = this;
    this.classList = {
      add: (...c) => { const s = new Set(self.cls()); c.forEach(x => s.add(x)); self.attrs.class = [...s].join(" "); },
      remove: (...c) => { self.attrs.class = self.cls().filter(x => c.indexOf(x) < 0).join(" "); },
      toggle: (c, on) => { const has = self.cls().indexOf(c) >= 0; if (on === undefined) on = !has; if (on) self.classList.add(c); else self.classList.remove(c); return on; },
      contains: c => self.cls().indexOf(c) >= 0 };
    this.style = { setProperty: (k, v) => { this.styleProps = Object.assign(this.styleProps || {}, { [k]: v }); } };
  }
  cls() { return (this.attrs.class || "").split(/\s+/).filter(Boolean); }
  set className(v) { this.attrs.class = v; } get className() { return this.attrs.class || ""; }
  setAttribute(k, v) { this.attrs[k] = String(v); } getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  appendChild(c) { if (c.parentNode) c.parentNode.children = c.parentNode.children.filter(x => x !== c); c.parentNode = this; this.children.push(c); this._html = null; return c; }
  set textContent(v) { this.children = []; this._text = String(v); this._html = null; }
  get textContent() { return this._html != null ? this._html.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ") : this._text + this.children.map(c => c.textContent).join(""); }
  set innerHTML(v) { this.children = []; this._text = ""; this._html = String(v);
    // symbol buttons written as markup become elements, so html rows can be wired
    const re = /<button[^>]*data-s="([^"]+)"[^>]*>([\s\S]*?)<\/button>/g; let m;
    if (v) { this._raw = []; while ((m = re.exec(v))) { const b = new El("button"); b.attrs["data-s"] = m[1]; b._html = m[2]; b.parentNode = this; this._raw.push(b); } }
  }
  get innerHTML() { return this._html != null ? this._html : this._text.replace(/&/g, "&amp;").replace(/</g, "&lt;") + this.children.map(c => c.outer()).join(""); }
  outer() { return "<" + this.tagName.toLowerCase() + ">" + this.innerHTML + "</" + this.tagName.toLowerCase() + ">"; }
  addEventListener(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); }
  click() { (this.listeners.click || []).forEach(f => f({ preventDefault() {} })); }
  key(k) { (this.listeners.keydown || []).forEach(f => f({ key: k, preventDefault() {} })); }
  all() { const out = []; (this._raw || []).concat(this.children).forEach(c => { out.push(c); out.push(...c.all()); }); return out; }
  matches(sel) {
    const m = /^([a-z0-9]*)((?:\.[\w-]+)*)(?:\[([\w-]+)\])?$/i.exec(sel); if (!m) throw new Error("selector " + sel);
    if (m[1] && this.tagName !== m[1].toUpperCase()) return false;
    if (m[2] && m[2].split(".").filter(Boolean).some(c => this.cls().indexOf(c) < 0)) return false;
    if (m[3] && !(m[3] in this.attrs)) return false;
    return true;
  }
  querySelectorAll(sel) {   // simple selectors, and descendant combinations of them ("a .b")
    let set = [this];
    sel.trim().split(/\s+/).forEach(p => { const next = []; set.forEach(e => e.all().forEach(x => { if (x.matches(p) && next.indexOf(x) < 0) next.push(x); })); set = next; });
    return set;
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
}
function makeLX() {
  const LX = {};
  LX.H = (tag, attrs, parent) => {
    const e = new El(tag);
    if (attrs) for (const k in attrs) { const v = attrs[k]; if (v == null || v === false) continue;
      if (k === "text") e.textContent = v; else if (k === "html") e.innerHTML = v; else if (k === "class") e.className = v;
      else if (k.slice(0, 2) === "on" && typeof v === "function") e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? "" : v); }
    if (parent) parent.appendChild(e);
    return e;
  };
  LX.S = LX.H;
  LX.esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  LX.rich = t => LX.esc(t).replace(/\[\[([a-z0-9-]+)\|([^\]]+)\]\]/g, (m, id, w) => '<span class="lx-term" data-term="' + id + '">' + w + "</span>");
  LX.emitted = 0; LX.emit = () => { LX.emitted++; };
  return LX;
}
function load(name, LX) {
  const ctx = { window: { LX: LX }, module: { exports: {} } };
  vm.runInNewContext(fs.readFileSync(L("components/" + name + ".js"), "utf8"), ctx);
  return ctx.module.exports;
}

// ---------------------------------------------------------------- files, header comments, bundle
const bundle = fs.readFileSync(L("learn.js"), "utf8"), bcss = fs.readFileSync(L("learn.css"), "utf8");
Object.keys(FILES).forEach(f => {
  const js = fs.readFileSync(L("components/" + f + ".js"), "utf8"), css = fs.readFileSync(L("components/" + f + ".css"), "utf8");
  ok(js.split("\n")[0].indexOf("/* " + f + ".js — LX." + FILES[f] + ":") === 0, `${f}.js: header names the file and LX.${FILES[f]}`);
  ok(css.split("\n")[0].indexOf("/* " + f + ".css — LX." + FILES[f]) === 0, `${f}.css: header names the file and the component`);
  ok(js.indexOf("LX." + FILES[f] + " = ") >= 0 && bundle.indexOf("LX." + FILES[f] + " = ") >= 0, `bundle defines LX.${FILES[f]}`);
  ok(bcss.indexOf(css.trim().slice(0, 120)) >= 0, `${f}.css is in learn.css`);
  ok(!/#[0-9a-f]{3,6}\b|rgba?\(/i.test(css.replace(/\/\*[\s\S]*?\*\//g, "")), `${f}.css: colours from tokens only`);
  const LX = makeLX(); load(f, LX);
  ok(typeof LX[FILES[f]] === "function", `${f}.js defines LX.${FILES[f]} with a stub window.LX`);
});

// ---------------------------------------------------------------- Formulation: pure parts
const FP = load("formulation", makeLX());
const R = [{ id: "a", name: "A", sym: "x", rows: "1" }, { id: "b", name: "B", sym: "y", symBase: "y0", rows: (full, n) => (full ? 3 * n : n) + " rows" },
           { id: "c", name: "C", sym: "z", extra: true }];
ok(FP.visible(R, true, false).length === 3 && FP.visible(R, false, false).map(r => r.id).join() === "a,b" && FP.visible(R, false, true).length === 3,
   "formulation: extra rules are left out of the base model unless showLater");
ok(FP.symOf(R[1], false) === "y0" && FP.symOf(R[1], true) === "y" && FP.symOf(R[0], false) === "x", "formulation: symBase in the base model, sym in the full one");
ok(FP.rowsOf(R[1], true, 24) === "72 rows" && FP.rowsOf(R[1], false, 24) === "24 rows" && FP.rowsOf(R[0], true, 24) === "1" && FP.rowsOf(R[2], true, 24) === "",
   "formulation: rows as text or as a function of (full, hours)");

// ---------------------------------------------------------------- Network: pure parts, with M1's layout and data
const NP = load("network", makeLX());
ok(NP.money(80) === "$80" && NP.money(-3.4) === "−$3" && NP.money(13200) === "$13,200" && NP.money(0.4) === "$0", "network: default price format");
ok(NP.flowWidth(null) === 3 && NP.flowWidth(0) === 2.5 && NP.flowWidth(110) === 7.5 && NP.flowWidth(-110) === 7.5 && NP.flowWidth(1000) === 11.5 && NP.flowWidth(44, 11) === 6.5,
   "network: line width 2.5 + MW/22, at most 9 more; 3 when no flow is shown");
const M1 = JSON.parse(fs.readFileSync(L("data/m01-dispatch-to-lmp.json"), "utf8"));
const POS = { R: [78, 62], G: [282, 62], T: [180, 238] };
const netO = {
  buses: M1.buses.map(b => ({ id: b.id, name: b.name, short: b.short, at: POS[b.id], desc: b.reference ? "all the demand and the nuclear plant" : null })),
  lines: M1.lines.map(l => ({ id: l.id, from: l.from, to: l.to, name: l.name })),
  plants: Object.keys(M1.fleet).map(k => ({ bus: M1.fleet[k].bus, color: M1.fleet[k].color, label: M1.fleet[k].label }))
};
const lab = id => NP.autoLabel(netO, netO.lines.find(l => l.id === id));
ok(lab("RG")[2] === "middle" && lab("RG")[1] < 62 && lab("RT")[2] === "end" && lab("RT")[0] < 129 && lab("GT")[2] === "start" && lab("GT")[0] > 231,
   "network: automatic labels sit outside the triangle (above the top line, left of the left line, right of the right line)");
ok(NP.autoLabel(netO, { id: "x", from: "R", to: "T", labelAt: [1, 2, "end"] }).join() === "1,2,end", "network: labelAt overrides the automatic place");
const ref = M1.reference;
const st = { h: { price: ref.price, flow: ref.flow, full: { RT: true, RG: false, GT: false } }, lim: { RT: ref.limit, RG: 200, GT: 200 } };
const d = NP.describe(netO, st);
ok(d.buses[0] === "Prairie Town: $80 per MWh (all the demand and the nuclear plant)" && d.buses[1] === "Wind Ridge: $0 per MWh (wind farm and solar farm)" &&
   d.buses[2] === "Gas Hub: $40 per MWh (gas combined-cycle plant and gas peaker)", "network: text version of the buses (M1's 110 MW noon case)");
ok(d.lines[0] === "Ridge–Town: 110 MW from Ridge to Town, limit 110 MW (full)" && d.lines[1] === "Ridge–Gas Hub: 9 MW from Ridge to Gas Hub, limit 200 MW" &&
   d.lines[2] === "Gas Hub–Town: 101 MW from Gas Hub to Town, limit 200 MW", "network: text version of the lines, with limits and the full line");
const dT = NP.describe(netO, { transfer: { RT: 60, RG: 30, GT: -30 }, lim: { RT: 200 } });
ok(dT.lines[0] === "Ridge–Town: 60 MW from Ridge to Town" && dT.lines[2] === "Gas Hub–Town: 30 MW from Town to Gas Hub" && dT.buses[0] === "Prairie Town (all the demand and the nuclear plant)",
   "network: a transfer shows flows without limits, negative flows the other way, no prices");
ok(NP.describe(netO, {}).lines.every(s => /no flow shown$/.test(s)), "network: no hour, no flows");

// ---------------------------------------------------------------- EquationCard on the stub document
(function () {
  const LX = makeLX(); load("equation", LX);
  const host = new El("div"); let you = 0;
  const card = LX.EquationCard(host, {
    title: "The LCOE equation", lede: "Tap a [[capacity|symbol]].", label: "LCOE equation",
    rows: [{ parts: [{ k: "lcoe" }, "=", { frac: [[{ k: "crf" }, "×", { k: "capex" }], [{ k: "cf" }]] }, "+", { k: "vom" }], say: "LCOE equals ..." },
           { parts: [{ html: "min " }, { k: "capex", html: "<i>C</i>" }], tag: "goal", note: "a note" }],
    symbols: { lcoe: { sym: "LCOE", name: "LCOE", unit: "$/MWh", color: "var(--lx-tier-1)", words: "Levelized [[lcoe|cost]].", you: () => "call " + (++you) },
               crf: { sym: "CRF", name: "CRF", words: "Capital recovery.", here: "0.0806", code: "crf = r / (1 - (1 + r) ** -n)" },
               capex: { sym: "C", name: "C", label: "building cost", words: "Building cost." }, cf: { sym: "CF", name: "CF", text: "Alias words." },
               vom: { sym: "VOM", name: "VOM", words: "Upkeep.", story: "" } },
    fields: [{ key: "you", label: "In this lesson" }, { key: "here", label: null, alt: "Here" }, { key: "code", label: "In code", code: true }],
    sel: "crf", hint: "A hint.", code: "lcoe = ...", codeLabel: "In Python", aside: true, eyebrow: "Symbol" });
  const btn = host.querySelectorAll("button.lx-eq-sym");
  ok(btn.length === 6 && btn.filter(b => b.getAttribute("data-s") === "capex").length === 2, "equation: one button per symbol use (a symbol used twice has two)");
  ok(host.querySelector(".frac") && host.querySelector(".num").querySelectorAll("button").length === 2 && host.querySelector(".den").querySelectorAll("button").length === 1, "equation: a fraction holds its numerator and denominator symbols");
  ok(btn.every(b => b.getAttribute("type") === "button" && b.getAttribute("aria-label")), "equation: symbols are real buttons with spoken names");
  ok(btn.find(b => b.getAttribute("data-s") === "capex").getAttribute("aria-label") === "building cost", "equation: label overrides the spoken name");
  ok(btn[0].classList.contains("c") && btn[0].styleProps["--c"] === "var(--lx-tier-1)" && !btn[1].classList.contains("c"), "equation: a colour bar only for symbols with a colour");
  const pressed = () => btn.filter(b => b.getAttribute("aria-pressed") === "true").map(b => b.getAttribute("data-s"));
  ok(pressed().join() === "crf" && card.current() === "crf", "equation: sel opens first");
  const det = host.querySelector(".lx-eq-det");
  ok(det.textContent.indexOf("Symbol") === 0 && det.querySelector("h4").textContent === "CRF" && det.querySelector("p.you").textContent === "0.0806" &&
     det.querySelector("code").textContent === "crf = r / (1 - (1 + r) ** -n)", "equation: the panel shows eyebrow, name, value without a label, and code");
  btn.filter(b => b.getAttribute("data-s") === "capex")[1].click();
  ok(pressed().join() === "capex,capex", "equation: tapping a symbol presses every button of that symbol, and only those");
  card.select("lcoe");
  ok(det.querySelector("h4").textContent === "LCOE ($/MWh)" && det.querySelector(".ingame").textContent === "In this lessoncall 1", "equation: unit after the name; a field function is called on opening");
  card.select("lcoe");
  ok(det.querySelector(".ingame").textContent === "In this lessoncall 2", "equation: the function runs again (the reader's latest numbers)");
  card.select("cf"); ok(det.querySelectorAll("p")[1].textContent === "Alias words.", "equation: text is an alias of words");
  card.select("vom"); ok(det.querySelectorAll(".ingame").length === 0, "equation: empty fields are left out");
  card.select("nope"); ok(card.current() === "vom", "equation: an unknown id changes nothing");
  const items = host.querySelectorAll("li").map(li => li.innerHTML);
  ok(items[0] === "LCOE equals ..." && items[1] === "<b>LCOE ($/MWh)</b>: Levelized <span class=\"lx-term\" data-term=\"lcoe\">cost</span>." && items[2] === "<b>CRF</b>: Capital recovery. Here: 0.0806." && items.length === 6,
     "equation: text version = rows read aloud, then each symbol (with its unit, when it has one) with its words and the alt fields");
  ok(items.slice(1).every(li => /^<b>[^<]+<\/b>: /.test(li)) && items.filter(li => /\(\$\/MWh\)/.test(li)).length === 1, "equation: only symbols with a unit show one in the text version");
  (function () {
    const h3 = new El("div");
    LX.EquationCard(h3, { title: "Units", rows: [{ parts: [{ k: "p" }] }], symbols: { p: { sym: "p", name: "Output", unit: "MW <per> h", words: "Power." } } });
    ok(h3.querySelectorAll("li")[0].innerHTML === "<b>Output (MW &lt;per&gt; h)</b>: Power." && h3.querySelector("h4").textContent === "Output (MW <per> h)",
       "equation: the unit after the name in the text version (escaped) and in the panel");
  })();
  const ops = host.querySelectorAll(".lx-eq-row")[0].querySelectorAll("span.op");
  ok(ops.length >= 3 && ops.every(o => o.getAttribute("aria-hidden") === "true"), "equation: a row with `say` hides its operators from screen readers");
  ok(host.querySelectorAll(".lx-eq-row")[1].querySelector("span.op").getAttribute("aria-hidden") === null, "equation: rows without `say` keep their words readable");
  ok(host.querySelector(".lx-eq-row .tag").textContent === "goal" && host.querySelector(".lx-eq-row .note").textContent === "a note", "equation: tag and note");
  ok(host.querySelector(".lx-eqc").classList.contains("lx-eqc-side") && host.querySelector(".lx-eqc").children[1] === det, "equation: aside puts the panel beside the equation");
  ok(host.querySelector(".lx-eq").getAttribute("aria-label") === "LCOE equation" && host.querySelector(".lx-eq-code pre").textContent === "lcoe = ..." && host.querySelector("p.lx-hint").textContent === "A hint.",
     "equation: spoken name, code box and hint");
  // html rows (dense) and the default fields
  const h2 = new El("div"), sym = LX.EquationCard.sym;
  ok(sym("a", "<var>x</var>") === '<button type="button" data-s="a"><var>x</var></button>', "equation: sym() writes a symbol button");
  const c2 = LX.EquationCard(h2, { title: "Model", dense: true, rows: [{ html: "min " + sym("a", "x") + " + " + sym("b", "y"), tag: "goal" }],
    symbols: { a: { name: "x", words: "A decision.", code: "{ name: \"x\" }" }, b: { name: "y", words: "Another.", story: "In the story." } } });
  const b2 = h2.querySelectorAll("button");
  ok(h2.querySelector(".lx-eq").classList.contains("dense") && b2.length === 2 && b2.every(b => b.classList.contains("lx-eq-sym")), "equation: html rows wire their symbol buttons");
  ok(b2[0].getAttribute("aria-pressed") === "true" && c2.current() === "a", "equation: the first symbol opens when sel is not given");
  b2[1].click();
  ok(c2.current() === "b" && h2.querySelector(".ingame").textContent === "In the storyIn the story.", "equation: default fields (you, story, code)");
  ok(h2.querySelector("summary").textContent === "Text version" && h2.querySelector(".lx-eq").getAttribute("aria-label") === "Symbols of the equation; select one", "equation: default labels");
})();

// ---------------------------------------------------------------- FormulateBox on the stub document
(function () {
  const LX = makeLX(); load("formulate", LX);
  const host = new El("div");
  const fb = LX.FormulateBox(host, { title: "Formulate it", lede: "One [[objective|goal]].",
    parts: [{ k: "Decisions", color: "var(--lx-tier-2)", text: "x and y." }, { k: "Goal", color: "var(--lx-good)", text: "min." }, { k: "Rules", text: "x + y ≥ 3." }, { k: "Given", color: "var(--lx-ink-3)", text: "3." }],
    symbols: "min x + y <span class=\"tag\">goal</span>" });
  ok(fb.parts.length === 4 && fb.parts.map(p => p.querySelector("h4").textContent).join() === "Decisions,Goal,Rules,Given", "formulate: one box per part, in order");
  ok(fb.parts[0].getAttribute("style") === "--c:var(--lx-tier-2)" && fb.parts[2].getAttribute("style") === "--c:var(--lx-line-2)", "formulate: colour bars, neutral without a colour");
  ok(host.querySelector("p.lx-lede").innerHTML.indexOf('data-term="objective"') > 0 && fb.parts[0].querySelector("p").innerHTML === "x and y.", "formulate: glossary marks in lede and text");
  ok(host.querySelector("details summary").textContent === "Show it in symbols" && fb.symbols.innerHTML.indexOf("goal") > 0, "formulate: symbols in a collapsed box");
  const h2 = new El("div"), f2 = LX.FormulateBox(h2, { title: "T", parts: [{ k: "A", text: "a" }, { k: "B", text: "b" }, { k: "C", text: "c" }] });
  ok(f2.symbols === null && !h2.querySelector("details") && f2.el.classList.contains("three"), "formulate: no symbols box when none given; three parts get three columns");
})();

// ---------------------------------------------------------------- Formulation on the stub document
(function () {
  const LX = makeLX(); load("formulation", LX);
  const rules = [{ id: "obj", name: "Goal", words: "Keep cost low.", sym: "min <i>c</i> <i>p</i>", rows: "1 objective", dual: "–" },
                 { id: "bal", name: "Balance", words: "Made equals used.", sym: "net", symBase: "one bus", rows: (full, n) => full ? "3 × " + n : String(n), dual: "the price" },
                 { id: "lim", name: "Line limits", words: "Within limits.", sym: "|f| ≤ F", rows: "3 × 24", dual: "μ", extra: true }];
  const host = new El("div");
  const F = LX.Formulation(host, { rules, legend: [["t", "hour"]], view: "table", sel: "bal", full: true, hours: 24, tagWidth: "9.5em" });
  const seg = host.querySelectorAll(".lx-seg button");
  ok(seg.length === 3 && seg.map(b => b.textContent).join() === "In words,In symbols,As a table" && seg[2].getAttribute("aria-pressed") === "true", "formulation: a three-way switch, the table first");
  const trs = host.querySelectorAll("tbody tr");
  ok(trs.length === 3 && trs[1].classList.contains("on") && trs[1].children[3].textContent === "3 × 24" && trs[1].children[4].getAttribute("data-l") === "Its dual",
     "formulation: table rows, the selected rule highlighted, rows(full, hours), short phone label for the dual column");
  seg[0].click();
  const lis = host.querySelectorAll("ol.lx-fwords li");
  ok(lis.length === 3 && lis[1].classList.contains("on") && lis[0].innerHTML === "<b>Goal.</b> Keep cost low.", "formulation: words view, linked by the selected rule");
  F.set({ view: "symbols", full: false });
  const ln = host.querySelectorAll(".lx-fline");
  ok(ln.length === 2 && ln[1].querySelector(".lx").innerHTML === "one bus" && ln[0].querySelector(".ln").textContent === "Goal" && ln[1].classList.contains("on"),
     "formulation: symbols view of the base model (extra rules out, symBase), labels = names");
  ok(host.querySelector(".lx-flines").getAttribute("style") === "--lx-tagw:9.5em" && host.querySelector("dl.lx-flegend dt").textContent === "t", "formulation: label width and legend");
  ok(host.querySelectorAll("button.lx-fline").length === 0, "formulation: lines are not buttons without onPick");
  F.set({ view: "words", full: false });
  ok(host.querySelectorAll("ol.lx-fwords li").length === 2, "formulation: base model without showLater hides extra rules");
  const h3 = new El("div");
  LX.Formulation(h3, { rules, full: false, showLater: true, extraNote: "(later)", views: ["words", "table"] });
  const l3 = h3.querySelectorAll("li");
  ok(l3.length === 3 && /\(later\)/.test(l3[2].innerHTML) && h3.querySelectorAll(".lx-seg button").length === 2, "formulation: showLater lists extra rules with the note; views chooses the switch");
  // one view with picks: B3's line-by-line reading and bug hunt
  const h4 = new El("div"), picked = [];
  const P = LX.Formulation(h4, { views: ["symbols"], aria: "Suspect 1: select the wrong line", onPick: (id, el) => picked.push(id + ":" + el.getAttribute("aria-pressed")),
    rules: [{ id: "par", name: "costs", tag: "data", sym: "<i>c</i> = (10, 0)" }, { id: "bal", name: "balance", tag: "(1)", sym: "Σ <i>p</i> = <i>d</i>" }] });
  const b4 = h4.querySelectorAll("button.lx-fline");
  ok(!h4.querySelector(".lx-seg") && b4.length === 2 && h4.querySelector(".lx-flines").getAttribute("role") === "group" && h4.querySelector(".lx-flines").getAttribute("aria-label") === "Suspect 1: select the wrong line",
     "formulation: one view, no switch; pickable lines in a named group");
  ok(b4[0].getAttribute("aria-label") === "costs: datac = (10, 0)" && b4[0].getAttribute("aria-pressed") === "false", "formulation: a line's spoken name starts with its rule name");
  b4[1].click();
  ok(picked.join() === "bal:true" && b4[0].getAttribute("aria-pressed") === "false", "formulation: a pick presses one line and reports it");
  P.mark(); P.mark("bal", "wrong");
  ok(b4[1].classList.contains("wrong") && !b4[1].classList.contains("right"), "formulation: mark a line wrong");
  P.mark(); P.mark("par", "right");
  ok(b4[0].classList.contains("right") && !b4[1].classList.contains("wrong") && P.lines.par === b4[0], "formulation: mark() with no id clears every mark");
})();

// ---------------------------------------------------------------- Network on the stub document
(function () {
  const LX = makeLX(); load("network", LX);
  const host = new El("div"), picks = [];
  const o = Object.assign({}, netO, { label: "Three-bus network", onPick: id => picks.push(id) });
  o.buses = netO.buses.map(b => Object.assign({ color: "var(--lx-ink)", note: b.id === "R" ? "wind + solar" : null }, b));
  const net = LX.Network(host, o);
  const buses = host.querySelectorAll("g.bus");
  ok(buses.length === 3 && buses.every(g => g.getAttribute("role") === "button" && g.getAttribute("tabindex") === "0" && g.getAttribute("aria-pressed") === "false"), "network: buses are keyboard buttons when onPick is given");
  ok(host.querySelectorAll("line").length === 3 && host.querySelectorAll("path").length === 0, "network: three lines, no arrows before a flow");
  net.set({ h: st.h, lim: st.lim, sel: "T" });
  const b2 = host.querySelectorAll("g.bus");
  ok(b2[0].getAttribute("aria-label") === "Prairie Town, price $80 per MWh" && b2[0].getAttribute("aria-pressed") === "true" && b2[0].classList.contains("sel"), "network: price in the spoken name; the selected bus is pressed");
  ok(host.querySelectorAll("path").length === 3 && host.querySelectorAll("text").filter(t => t.textContent === "full").length === 1 &&
     host.querySelectorAll("text").some(t => t.textContent === "110 / 110 MW"), "network: arrows for flows, the full line marked, flow / limit labels");
  ok(host.querySelectorAll("li").map(li => li.textContent).join("|") === d.buses.concat(d.lines).join("|"), "network: the text version is describe()'s sentences");
  b2[1].click(); b2[2].key("Enter"); b2[2].key("a");
  ok(picks.join() === "R,G", "network: click and Enter pick a bus");
  ok(host.querySelectorAll("text").some(t => t.textContent === "wind + solar"), "network: a bus note is drawn");
  const h2 = new El("div"), n2 = LX.Network(h2, netO);
  ok(h2.querySelectorAll("g.bus").every(g => g.getAttribute("role") === null && g.getAttribute("tabindex") === null), "network: without onPick the buses are not buttons");
  n2.set({ transfer: { RT: 60, RG: 30, GT: -30 } });
  ok(h2.querySelectorAll("text").some(t => t.textContent === "60 MW") && !h2.querySelectorAll("text").some(t => / \/ /.test(t.textContent)), "network: a transfer shows MW without limits");
})();

console.log(`components_d: ${checks - fails} of ${checks} checks passed`);
process.exit(fails ? 1 : 0);
