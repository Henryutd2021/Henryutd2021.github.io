// test_components_w3.js — Node tests for the pieces of the sandbox and capstone forms:
//   sharestate.js (LX.ShareState, i-share), benchrun.js (LX.BenchRun), reportnote.js (LX.ReportNote), the form pieces in
//   forms.css and the templates learn/_template-sandbox.qmd and learn/_template-capstone.qmd.
//   - each file names itself and its component, uses --lx-* tokens only, exports its pure part and is in the bundle
//   - the templates: header, the three marker pairs, a section for each step link of the form (against STEPS in the
//     course build step when it is available through private_sources.js), the body class, the fallbacks' marker blocks
//   - the plan link: encode and decode round trip (fixed cases and 400 seeded random plans), only name-safe characters,
//     every way a hash is refused (damaged, out of range, off the step, a part missing, unknown or twice, a bad choice,
//     too long, the schema's own rule), newer and older versions, migration through two older versions, the messages,
//     the bad schemas that throw, the no-JS table; the view on a stub document: a link applied and announced, a refused
//     link taken out of the address, the address kept up to date, a link opened later, the copy button
//   - the run: every status classified (no "optimal" or "best" for a run that did not prove it), a stubbed solve that
//     succeeds, is infeasible, rejects, times out, throws in render, is retried (attempt 2) and is superseded; busy
//     state held and released; results kept and marked stale
//   - the report: the note as text and Markdown (assumptions, the sensitivity line and table, limits, the reader's
//     words, the warning when the results are not from a finished run of the plan), the checks, the one-page limit,
//     the outline for no-JS readers, no claim of saving or sending anywhere in the three components; the view: stored
//     words, live preview and checks, the select-and-copy box
// Usage (from the site folder):  node _tests/learn/test_components_w3.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { env, buttons } = require("./stubdom.js");
const PRIV = require("./private_sources.js");
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const tick = () => new Promise(r => setImmediate(r));

// a stub page with timers that run at once, an address that records history.replaceState, and window listeners
function page(opt) {
  opt = opt || {};
  const E = env({ hash: opt.hash || "", store: opt.store });
  const calls = [], listeners = {};
  const history = { state: null, replaceState(s, t, url) {   // as a browser: a relative "#hash" resolves against the page
    url = String(url); if (url.charAt(0) === "#") url = E.location.href.split("#")[0] + url;
    calls.push(url); const i = url.indexOf("#"); E.location.hash = i < 0 ? "" : url.slice(i); E.location.href = url; } };
  E.window.history = history;
  E.window.addEventListener = (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); };
  E.LX.copyText = () => Promise.resolve(!!opt.clipboard);
  E.LX.uid = (n => p => (p || "lx") + "-" + (++n))(0);
  const load = name => {
    const ctx = { window: E.window, document: E.document, location: E.location, history, performance: { now: () => Date.now() }, navigator: {},
      setTimeout: f => { f(); return 1; }, clearTimeout() {}, console: { log: console.log, error() {} }, module: { exports: {} }, encodeURIComponent, decodeURIComponent, JSON, Math, Promise, Object, Array, String, Number };
    vm.runInNewContext(fs.readFileSync(L("components/" + name + ".js"), "utf8"), ctx);
    return ctx.module.exports;
  };
  const go = h => { E.location.hash = h; (listeners.hashchange || []).forEach(f => f({})); };
  return { E, calls, load, go, listeners };
}

// ---------------------------------------------------------------- files, tokens, bundle, templates
const NAMES = { sharestate: "ShareState", benchrun: "BenchRun", reportnote: "ReportNote" };
const bundleJS = fs.readFileSync(L("learn.js"), "utf8"), bundleCSS = fs.readFileSync(L("learn.css"), "utf8");
Object.keys(NAMES).forEach(f => {
  const src = fs.readFileSync(L("components/" + f + ".js"), "utf8"), css = fs.readFileSync(L("components/" + f + ".css"), "utf8");
  ok(src.split("\n")[0].indexOf("/* " + f + ".js — LX." + NAMES[f]) === 0, `${f}.js: header comment names the file and the component`);
  ok(css.split("\n")[0].indexOf("/* " + f + ".css — ") === 0, `${f}.css: header comment names the file`);
  ok(!/#[0-9a-fA-F]{3,6}\b|rgba?\(/.test(css.replace(/\/\*[\s\S]*?\*\//g, "")) && !/#[0-9a-fA-F]{6}\b|rgba?\(/.test(src.replace(/\/\*[\s\S]*?\*\//g, "")), `${f}: colours from --lx-* tokens only`);
  const ctx = { window: { LX: {} }, module: { exports: {} }, document: {} };
  try { vm.runInNewContext(src, ctx); } catch (e) { ok(false, `${f}.js runs with a stub window.LX: ${e.message}`); return; }
  ok(typeof ctx.window.LX[NAMES[f]] === "function" && new RegExp("LX\\." + NAMES[f] + " = ").test(src), `${f}.js defines LX.${NAMES[f]}`);
  ok(Object.keys(ctx.module.exports).length > 0, `${f}.js exports its pure part to Node`);
  ok(bundleJS.indexOf(src.trim().split("\n")[0]) >= 0 && bundleCSS.indexOf(css.trim().split("\n")[0]) >= 0, `${f}: in the generated bundle (run the course build step)`);
});
ok(bundleJS.indexOf("/* share.js") < bundleJS.indexOf("/* sharestate.js"), "bundle: share.js (the copy) loads before sharestate.js");
const forms = fs.readFileSync(L("components/forms.css"), "utf8");
["lx-sb-brief", "lx-cap-brief", "lx-sb-facts", "lx-sb", "lx-sb-controls", "lx-sb-group", "lx-sb-side", "lx-sb-presets", "lx-sb-results", "lx-sb-charts", "lx-sb-chart", "lx-sb-static"].forEach(c =>
  ok(new RegExp("\\." + c + "\\b").test(forms) && bundleCSS.indexOf("." + c) >= 0, `forms.css styles .${c} (used by the templates) and is bundled`));
ok(!/overflow(-x|-y)?:\s*(hidden|auto|scroll)/.test(forms.slice(forms.indexOf("---------- sandbox and capstone pages"))), "forms.css (the sandbox and capstone part): no overflow clipping (popovers and chart tips stay visible)");
let STEPS = { sandbox: ["brief", "bench", "results", "explain", "sources"], capstone: ["brief", "plan", "note", "selfcheck", "sources"] };
const BUILD = PRIV.path("build");
if (BUILD) {
  const b = fs.readFileSync(BUILD, "utf8");
  ["sandbox", "capstone"].forEach(form => {
    const m = new RegExp('"' + form + '": \\[([^\\]]+)\\]').exec(b);
    const ids = m ? [...m[1].matchAll(/\("([\w-]+)", "[^"]+"\)/g)].map(x => x[1]) : null;
    ok(ids && eq(ids, STEPS[form]), `the build step's STEPS.${form} = ${STEPS[form].join(", ")}`);
  });
  ok(/"sandbox": "Sandbox"/.test(b) && /"capstone": "Capstone"/.test(b) && /"sandbox": "Simulation"/.test(b) && /"capstone": "Capstone project"/.test(b), "the build step: header badges and schema.org types for both forms");
} else console.log("note: the course build step is not available (set LEARN_SOURCES); the step ids are checked against this test's copy only");
[["_template-sandbox.qmd", "sandbox"], ["_template-capstone.qmd", "capstone"]].forEach(([t, form]) => {
  const s = fs.readFileSync(path.join(SITE, "learn", t), "utf8");
  ok(/^# TEMPLATE/m.test(s) && /<!-- learn:meta:start -->/.test(s) && /<!-- learn:next:start -->/.test(s) && /<!-- learn:footer:start -->/.test(s), `${t}: template header and the three marker pairs`);
  STEPS[form].forEach(id => ok(s.indexOf("::: {#" + id + " .lx-sec}") >= 0, `${t}: section #${id} (a step link of the form)`));
  ok(s.indexOf('body-classes: "page-learn page-lesson lx-form-' + form + '"') >= 0, `${t}: body class names the form`);
  ok(/class="lx-fallback/.test(s) && (s.match(/<!-- <slug>-[\w]+:start/g) || []).length >= 2, `${t}: no-JS fallbacks with marker blocks written by the test`);
  ok(/LX\.ShareState/.test(s) && /LX\.BenchRun/.test(s) && /engine\.solve/.test(s), `${t}: names the plan link, the run and the engine's solve`);
});
const tc = fs.readFileSync(path.join(SITE, "learn/_template-capstone.qmd"), "utf8");
ok(/id="exemplars"/.test(tc) && /LX\.ReportNote/.test(tc) && /LX\.Rubric/.test(tc) && /LX\.Exemplars/.test(tc), "capstone template: #exemplars (the screenshot tool's explain state), the note, the rubric and the exemplars");

// ---------------------------------------------------------------- the plan link: pure
const SS = require(L("components/sharestate.js"));
const SCH = { key: "sb0", version: 3, title: "Site Bench plan",
  fields: [
    { id: "site", short: "s", type: "enum", values: ["home", "farm"], names: { home: "Prairie Town home", farm: "Ridge wind farm" }, def: "home", label: "Site" },
    { id: "pv", short: "pv", type: "num", min: 0, max: 20, step: 0.5, def: 6, label: "Solar PV", unit: "kW" },
    { id: "bat", short: "b", type: "int", min: 0, max: 40, def: 10, label: "Battery", unit: "kWh" },
    { id: "t", short: "t", type: "num", min: -10, max: 10, step: 0.25, def: -2.5, label: "Shift", unit: "h" },
    { id: "hp", short: "h", type: "bool", def: false, label: "Heat pump" },
    { id: "out", short: "o", type: "set", values: ["storm", "ice", "heat"], def: ["storm"], label: "Outages" },
    { id: "prio", short: "r", type: "order", values: ["hospital", "dorms", "labs", "offices"], def: ["hospital", "dorms", "labs", "offices"], label: "Load order" }],
  check: s => (s.bat > 0 && s.pv === 0 && s.site === "farm" ? "a farm battery needs some solar" : null),
  old: [
    { version: 1, note: "Heat pumps are new.", fields: [{ id: "pv", short: "pv", type: "num", min: 0, max: 10, step: 1, def: 4, label: "Solar PV", unit: "kW" },
      { id: "bh", short: "bh", type: "int", min: 0, max: 10, def: 2, label: "Battery hours" }],
      up: s => ({ pv: s.pv, bat: s.bh * 2, site: "home" }) },
    { version: 2, note: "The battery is now sized in kWh.", fields: [{ id: "site", short: "s", type: "enum", values: ["home", "farm"], def: "home" },
      { id: "pv", short: "pv", type: "num", min: 0, max: 20, step: 0.5, def: 6 }, { id: "bat", short: "b", type: "int", min: 0, max: 40, def: 10 }],
      up: s => ({ site: s.site, pv: s.pv, bat: s.bat, t: -2.5, hp: false, out: ["storm"], prio: ["hospital", "dorms", "labs", "offices"] }) }] };
const D = SS.defaults(SCH);
ok(eq(D, { site: "home", pv: 6, bat: 10, t: -2.5, hp: false, out: ["storm"], prio: ["hospital", "dorms", "labs", "offices"] }), "defaults from the schema");
const st1 = { site: "farm", pv: 6.5, bat: 12, t: -0.75, hp: true, out: ["storm", "heat"], prio: ["labs", "hospital", "offices", "dorms"] };
const h1 = SS.encode(SCH, st1);
ok(h1 === "sb0-v3-s1-pv6d5-b12-t_0d75-h1-o5-r2031", "encode: the documented compact form (" + h1 + ")");
ok(/^[A-Za-z0-9_-]+$/.test(h1) && h1.length < 60, "encode: name-safe characters only, compact");
const r1 = SS.decode(SCH, "#" + h1);
ok(r1.status === "ok" && eq(r1.state, st1) && r1.from === 3, "decode: round trip of a plan (with the leading #)");
ok(SS.encode(SCH, D) === "sb0-v3-s0-pv6-b10-t_2d5-h0-o1-r0123" && eq(SS.decode(SCH, SS.encode(SCH, D)).state, D), "round trip of the defaults");
// 400 seeded random plans
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
let rtOK = true;
for (let i = 0; i < 400; i++) {
  const s = {};
  SCH.fields.forEach(f => {
    if (f.type === "num" || f.type === "int") { const st = f.step || 1, n = Math.round((f.max - f.min) / st); s[f.id] = +(f.min + Math.floor(rnd() * (n + 1)) * st).toFixed(6); }
    else if (f.type === "bool") s[f.id] = rnd() < 0.5;
    else if (f.type === "enum") s[f.id] = f.values[Math.floor(rnd() * f.values.length)];
    else if (f.type === "set") s[f.id] = f.values.filter(() => rnd() < 0.5);
    else { const v = f.values.slice(); for (let k = v.length - 1; k > 0; k--) { const j = Math.floor(rnd() * (k + 1)); [v[k], v[j]] = [v[j], v[k]]; } s[f.id] = v; }
  });
  if (SCH.check(s)) continue;
  const h = SS.encode(SCH, s), r = SS.decode(SCH, h);
  if (r.status !== "ok" || !eq(r.state, s) || SS.encode(SCH, r.state) !== h || !/^[A-Za-z0-9_-]+$/.test(h)) { rtOK = false; console.log("  round trip failed:", JSON.stringify(s), h); break; }
}
ok(rtOK, "encode/decode: 400 seeded random plans round trip exactly, name-safe");
ok(SS.same(SCH, st1, JSON.parse(JSON.stringify(st1))) && !SS.same(SCH, st1, D), "same(): by encoding");
// not this schema's hash: left alone
["", "#", "#explain", "#lx-demo-mid", "#q-eyJxIjoiYSJ9", "#sb0x-v1-pv1", "#sb", "sb0"].forEach(h => {
  const r = SS.decode(SCH, h);
  ok(r.status === "none" && eq(r.state, D) && SS.message(SCH, r) === "", `decode ${JSON.stringify(h)}: not this schema's hash, the defaults, nothing to say`);
});
// every refusal falls back to the defaults with a reason
const BAD = [
  ["sb0-vx-s0", "the link is damaged"], ["sb0-v3-s0-pv6-b10-t_2d5-h0-o1", "a part is missing: Load order"],
  ["sb0-v3-s0-pv6-b10-t_2d5-h0-o1-r0123-zz1", "it has a part this page does not know (zz)"], ["sb0-v3-s0-pv6-pv6-b10-t_2d5-h0-o1-r0123", "a part appears twice: Solar PV"],
  ["sb0-v3-s0-pv25-b10-t_2d5-h0-o1-r0123", "Solar PV is 25 kW, outside 0 to 20 kW"], ["sb0-v3-s0-pv6d3-b10-t_2d5-h0-o1-r0123", "Solar PV must be in steps of 0.5 kW"],
  ["sb0-v3-s2-pv6-b10-t_2d5-h0-o1-r0123", "the link is damaged at Site"], ["sb0-v3-s0-pv6-b10-t_2d5-h2-o1-r0123", "the link is damaged at Heat pump"],
  ["sb0-v3-s0-pv6-b10-t_2d5-h0-o8-r0123", "the link is damaged at Outages"], ["sb0-v3-s0-pv6-b10-t_2d5-h0-o1-r0113", "the link is damaged at Load order"],
  ["sb0-v3-s0-pv6-b10-t_2d5-h0-o1-r012", "the link is damaged at Load order"], ["sb0-v3-s0-pvx-b10", "the link is damaged"],
  ["sb0-v3-s1-pv0-b10-t_2d5-h0-o1-r0123", "a farm battery needs some solar"], ["sb0-v3-" + "s0-".repeat(600), "the link is too long"],
  ["sb0-v3-s0-pv6-b10d5-t_2d5-h0-o1-r0123", "Battery must be in steps of 1 kWh"], ["sb0-v3-s0-pv6-b10-t_12-h0-o1-r0123", "Shift is -12 h, outside -10 to 10 h"]];
BAD.forEach(([h, why]) => {
  const r = SS.decode(SCH, h);
  ok(r.status === "bad" && eq(r.state, D) && r.reason === why, `refused ${h.slice(0, 50)}: ${why} (got ${r.status}: ${r.reason})`);
  ok(SS.message(SCH, r) === "This link could not be read (" + why + "), so the page starts from its default plan.", "refusal message for " + h.slice(0, 30));
});
const rn = SS.decode(SCH, "sb0-v4-s0");
ok(rn.status === "newer" && rn.from === 4 && eq(rn.state, D) && /newer version of this page \(v4; this page is v3\), so the page starts from its default plan\./.test(SS.message(SCH, rn)), "a newer version's link: the defaults, said so");
const ro = SS.decode(SCH, "sb0-v0-pv1");
ok(ro.status === "old" && ro.from === 0 && eq(ro.state, D) && /old version of this page \(v0\) that it can no longer read/.test(SS.message(SCH, ro)), "an old version without an entry: the defaults, said so");
// migration through two older versions
const m1 = SS.decode(SCH, "#sb0-v1-pv4-bh3");
ok(m1.status === "migrated" && m1.from === 1 && m1.version === 3 && eq(m1.state, { site: "home", pv: 4, bat: 6, t: -2.5, hp: false, out: ["storm"], prio: ["hospital", "dorms", "labs", "offices"] }),
  "migrate v1 -> v2 -> v3: battery hours become kWh, new parts take their defaults");
ok(eq(m1.notes, ["Heat pumps are new.", "The battery is now sized in kWh."]) && SS.message(SCH, m1) ===
  "Opened the Site Bench plan from a link made with an earlier version of this page (v1), updated to v3. Heat pumps are new. The battery is now sized in kWh. Check it before you run it.", "migration message names the versions and each step's note");
const m2 = SS.decode(SCH, "sb0-v2-s1-pv0-b8");
ok(m2.status === "bad" && /^after updating it, a farm battery needs some solar$/.test(m2.reason), "a migrated plan that breaks the current rule is refused, with the reason");
ok(SS.decode(SCH, "sb0-v1-pv11-bh1").reason === "Solar PV is 11 kW, outside 0 to 10 kW", "an old link is checked against its own version's ranges");
ok(SS.message(SCH, r1) === "Opened the Site Bench plan from your link.", "ok message");
ok(SS.message(SCH, SS.decode(SCH, "sb0-vx"), { keep: true }) === "This link could not be read (the link is damaged), so the page keeps the plan you had.", "a link opened later that cannot be read keeps the plan");
// validate and bad schemas
ok(eq(SS.validate(SCH, st1), []) && eq(SS.validate(SCH, Object.assign({}, st1, { pv: 21, zz: 1 })), ["Solar PV is 21 kW, outside 0 to 20 kW", "an unknown part: zz"]), "validate: problems as short phrases");
let threw = false; try { SS.encode(SCH, Object.assign({}, st1, { bat: 1.5 })); } catch (e) { threw = /cannot encode an invalid plan/.test(e.message); }
ok(threw, "encode throws on an invalid plan (a page bug)");
const badSchemas = [
  [{ key: "Sb0", version: 1, fields: [{ id: "a", short: "a", type: "bool", def: false }] }, /key/],
  [{ key: "sb0", version: 0, fields: [{ id: "a", short: "a", type: "bool", def: false }] }, /version/],
  [{ key: "sb0", version: 1, fields: [{ id: "a", short: "a", type: "bool", def: false }, { id: "b", short: "a", type: "bool", def: false }] }, /short name a repeats/],
  [{ key: "sb0", version: 1, fields: [{ id: "a", short: "a1", type: "bool", def: false }] }, /lower-case letters/],
  [{ key: "sb0", version: 1, fields: [{ id: "a", short: "a", type: "num", min: 0, max: 5, step: 1, def: 9 }] }, /default is invalid/],
  [{ key: "sb0", version: 1, fields: [{ id: "a", short: "a", type: "text", def: "x" }] }, /type must be one of/],
  [{ key: "sb0", version: 1, fields: [{ id: "a", short: "a", type: "order", values: "abcdefghijk".split(""), def: "abcdefghijk".split("") }] }, /at most 10/],
  [{ key: "sb0", version: 2, fields: [{ id: "a", short: "a", type: "bool", def: false }], old: [{ version: 2, fields: [{ id: "a", short: "a", type: "bool", def: false }], up: x => x }] }, /whole version below 2/],
  [{ key: "sb0", version: 1, fields: [{ id: "a", short: "a", type: "bool", def: false }], check: () => "never" }, /defaults break/]];
badSchemas.forEach(([s, rx], i) => { let m = ""; try { SS.checkSchema(s); } catch (e) { m = e.message; } ok(rx.test(m), `bad schema ${i + 1} throws (${m || "no throw"})`); });
ok(SS.TYPES.indexOf("text") < 0, "no free-text type: a link never carries what a reader typed");
const sh = SS.staticHTML(SCH);
ok(/<td>Site<\/td><td class="n">Prairie Town home<\/td><td>one of: Prairie Town home, Ridge wind farm<\/td>/.test(sh) && /<td>Solar PV<\/td><td class="n">6 kW<\/td><td>0 to 20 kW, in steps of 0.5 kW<\/td>/.test(sh)
  && /<td>Heat pump<\/td><td class="n">off<\/td><td>on or off<\/td>/.test(sh) && /an order of: hospital, dorms, labs, offices/.test(sh), "staticHTML: the bench's no-JS table, from the schema");

// ---------------------------------------------------------------- the plan link: view
(async () => {
  {
    const P = page({ hash: "#sb0-v1-pv4-bh3" }); P.load("share"); P.load("sharestate");
    const host = P.E.LX.H("div", null, P.E.body), loads = [];
    const ss = P.E.LX.ShareState(host, { schema: SCH, onLoad: (s, r) => loads.push([s, r.status]) });
    ok(eq(ss.state, m1.state) && ss.result.status === "migrated", "view: an older link's plan, migrated, is the starting plan");
    ok(/updated to v3/.test(ss.status.textContent) && /note/.test(ss.status.className) && ss.status.getAttribute("role") === "status", "view: the migration is announced in the status line (role=status)");
    ok(P.calls[0] === "https://example.org/learn/x.html#" + SS.encode(SCH, m1.state), "view: the address is rewritten in the current version's form");
    const btn = buttons(host, /^Copy plan link$/)[0];
    ok(!!btn, "view: a Copy plan link button");
    btn.click(); await tick();
    ok(/Select the link and copy it\./.test(host.textContent) && host.querySelector("input").value === "https://example.org/learn/x.html#" + SS.encode(SCH, m1.state), "view: without a clipboard the link shows in a field to select (LX.Share)");
    const n0 = P.calls.length;
    ok(eq(ss.set(Object.assign({}, m1.state, { pv: 99 })), ["Solar PV is 99 kW, outside 0 to 20 kW"]) && eq(ss.get(), m1.state) && P.calls.length === n0, "view: set() of an invalid plan returns the problem and keeps the plan");
    ok(eq(ss.set(st1), []) && eq(ss.get(), st1) && P.calls[P.calls.length - 1].endsWith("#" + h1) && ss.status.textContent === "", "view: set() keeps the plan, writes the address and clears the link notice");
    ok(ss.url() === "https://example.org/learn/x.html#" + h1 && ss.hash() === h1, "view: url() and hash()");
    P.go("#" + h1); ok(loads.length === 0, "view: the page's own hash is not applied again");
    P.go("#explain"); ok(loads.length === 0 && eq(ss.get(), st1), "view: a section anchor is left alone");
    P.go("#" + SS.encode(SCH, D)); ok(loads.length === 1 && eq(loads[0][0], D) && loads[0][1] === "ok" && eq(ss.get(), D) && /Opened the Site Bench plan/.test(ss.status.textContent), "view: a plan link opened later is applied, announced and passed to onLoad");
    ss.set(st1); P.go("#sb0-v3-s9"); ok(loads.length === 1 && eq(ss.get(), st1) && /keeps the plan you had/.test(ss.status.textContent) && /warn/.test(ss.status.className), "view: a damaged link opened later keeps the reader's plan, said so");
    ok(eq(ss.reset(), D) && eq(ss.get(), D), "view: reset() gives the defaults");
  }
  {
    const P = page({ hash: "#sb0-v3-s0-pv99-b10-t_2d5-h0-o1-r0123" }); P.load("share"); P.load("sharestate");
    const ss = P.E.LX.ShareState(P.E.LX.H("div", null, P.E.body), { schema: SCH });
    ok(eq(ss.state, D) && ss.result.status === "bad" && /could not be read \(Solar PV is 99 kW, outside 0 to 20 kW\), so the page starts from its default plan\./.test(ss.status.textContent) && /warn/.test(ss.status.className),
      "view: a bad link: the defaults and an announcement");
    ok(P.calls[0] === "https://example.org/learn/x.html", "view: a refused link is taken out of the address");
  }
  {
    const P = page({ hash: "#explain" }); P.load("share"); P.load("sharestate");
    const ss = P.E.LX.ShareState(P.E.LX.H("div", null, P.E.body), { schema: SCH, sync: false });
    ok(eq(ss.state, D) && ss.status.textContent === "" && P.calls.length === 0, "view: no link: the defaults, silence, the address untouched");
    ss.set(st1); ok(P.calls.length === 0, "view: sync false: set() leaves the address alone");
    P.go("#sb0-v3-s9"); ok(P.calls[P.calls.length - 1] === "https://example.org/learn/x.html" && eq(ss.get(), st1) && /keeps the plan you had/.test(ss.status.textContent), "view: a damaged link opened later leaves the address, the plan stays");
    ss.set(D); ok(ss.status.textContent === "", "view: changing the plan clears the notice");
  }

  // ---------------------------------------------------------------- the run: pure
  const BR = require(L("components/benchrun.js"));
  const K = r => BR.classify(r);
  ok(K({ status: "optimal", ok: true }).kind === "ok" && K({ status: "optimal", ok: true }).draw && !K({ status: "optimal", ok: true }).retry, "classify: optimal draws, no retry");
  ok(K({ status: "optimal", ok: false }).kind === "error", "classify: 'optimal' without ok is not trusted");
  ["time-limit", "iteration-limit", "objective-bound", "objective-target", "interrupted"].forEach(s => {
    const c = BR.classify({ status: s, ok: false, results: { x: 1 } });
    ok(c.kind === "early" && !c.draw && c.retry && !/optimal|\bbest\b/.test(c.text), `classify ${s}: an early stop, nothing drawn, Try again, never "optimal" or "best"`);
    const p = BR.classify({ status: s, ok: false, results: { x: 1 } }, null, true);
    ok(p.draw && /not proven best/.test(p.text), `classify ${s} with partial: drawn, "not proven best"`);
  });
  ok(BR.classify({ status: "objective-bound", ok: false }).text.indexOf("early (objective-bound)") >= 0, "classify: an early stop other than the time limit names itself");
  const inf = BR.classify({ status: "infeasible", ok: false, hint: "Raise the battery." });
  ok(inf.kind === "infeasible" && inf.retry && !inf.draw && /meets every rule/.test(inf.text) && /Raise the battery\.$/.test(inf.text), "classify: infeasible with the engine's hint and Try again");
  ok(BR.classify({ status: "infeasible-or-unbounded" }).kind === "infeasible" && BR.classify({ status: "unbounded" }).kind === "unbounded", "classify: infeasible-or-unbounded, unbounded");
  ok(BR.classify(null).kind === "error" && BR.classify({ status: "error", error: "boom" }).text.indexOf("(boom)") > 0 && BR.classify({ status: "weird" }).kind === "error", "classify: no result, an error, an unknown status");
  ok(BR.classify({ status: "superseded" }).kind === "superseded" && BR.classify({ status: "superseded" }).text === "", "classify: superseded is silent");
  ok(/within 0\.50% of the best bound/.test(BR.classify({ status: "optimal", ok: true, kind: "milp", mipGap: 0.005 }).text), "classify: a MILP's gap is stated");
  ok(BR.classify({ status: "optimal", ok: true, message: "Engine words." }).text === "Engine words." && BR.classify({ status: "infeasible" }, { infeasible: "Page words." }).text === "Page words.", "classify: page and engine words win");

  // ---------------------------------------------------------------- the run: view with stubbed solves
  {
    const P = page(); P.load("benchrun");
    const H = P.E.LX.H, host = H("div", null, P.E.body), res = H("div", null, P.E.body), ro = H("div", null, P.E.body), stale = H("p", null, P.E.body);
    let plan = { pv: 6 }, next = null, busy = [], drawn = [], tries = [];
    const run = P.E.LX.BenchRun(host, { label: "Run the year", state: () => plan, results: [res, ro], stale, busy: on => busy.push(on),
      solve: (s, ctx) => { tries.push([s.pv, ctx.attempt]); return next(s, ctx); }, render: (R, s) => { if (R && R.boom) throw new Error("draw failed"); drawn.push([R, s]); } });
    const btn = buttons(host, /^Run the year$/)[0], again = buttons(host, /^Try again$/)[0];
    ok(btn && again && again.hidden && stale.hidden, "run view: Run and a hidden Try again; the stale line hidden");
    let release; next = () => new Promise(r => { release = r; });
    btn.click();
    ok(btn.getAttribute("aria-disabled") === "true" && !btn.disabled && btn.textContent === "Running…" && res.getAttribute("aria-busy") === "true" && eq(busy, [true]) && run.running() && run.status.textContent === "Running…", "run view: busy while the run is on (button, aria-busy, busy(true), status)");
    const nBusy = tries.length; btn.click(); ok(tries.length === nBusy, "run view: a press on a busy Run is ignored (it keeps its focus: aria-disabled, not disabled)");
    release({ status: "optimal", ok: true, results: { cost: 1 }, ms: { roundTrip: 12.3 } }); await tick(); await tick();
    ok(!btn.hasAttribute("aria-disabled") && btn.textContent === "Run the year" && !res.hasAttribute("aria-busy") && eq(busy, [true, false]) && !run.running(), "run view: busy released after the run");
    ok(drawn.length === 1 && eq(drawn[0], [{ cost: 1 }, { pv: 6 }]) && /optimal for the bench's model\. · 12 ms$/.test(run.status.textContent) && again.hidden && run.status.getAttribute("data-kind") === "ok", "run view: a solved run is drawn and announced");
    plan = { pv: 8 }; run.changed(plan);
    ok(!stale.hidden && /earlier plan/.test(stale.textContent) && res.getAttribute("data-stale") === "true" && ro.getAttribute("data-stale") === "true", "run view: changing the plan marks the drawn results stale (every results area)");
    next = () => Promise.resolve({ status: "infeasible", ok: false, hint: "Raise the battery." });
    btn.click(); await tick(); await tick();
    ok(drawn.length === 1 && eq(run.last().state, { pv: 6 }) && /Raise the battery\.$/.test(run.status.textContent) && !again.hidden && !stale.hidden && /earlier plan/.test(stale.textContent)
      && run.status.getAttribute("data-kind") === "infeasible" && !btn.hasAttribute("aria-disabled") && busy[busy.length - 1] === false, "run view: an infeasible plan: message with the hint, Try again, busy released, the last results kept and marked");
    next = () => Promise.resolve({ status: "time-limit", ok: false });
    again.click(); await tick(); await tick();
    ok(eq(tries[tries.length - 1], [8, 2]) && /time limit/.test(run.status.textContent) && !again.hidden, "run view: Try again re-runs the same plan with attempt 2; a time limit offers it again");
    again.click(); await tick(); await tick();
    ok(eq(tries[tries.length - 1], [8, 3]), "run view: a second Try again is attempt 3");
    next = () => Promise.reject(new Error("worker died"));
    btn.click(); await tick(); await tick();
    ok(eq(tries[tries.length - 1], [8, 1]) && /failed/.test(run.status.textContent) && /worker died/.test(run.status.textContent) && !again.hidden && !btn.hasAttribute("aria-disabled"), "run view: a rejected solve is a failed run, with Try again (attempt back to 1 from Run)");
    next = () => { throw new Error("sync throw"); };
    btn.click(); await tick(); await tick();
    ok(/sync throw/.test(run.status.textContent) && !btn.hasAttribute("aria-disabled"), "run view: a solve that throws is a failed run");
    next = () => Promise.resolve({ status: "optimal", ok: true, results: { boom: true } });
    btn.click(); await tick(); await tick();
    ok(run.status.getAttribute("data-kind") === "error" && /draw failed/.test(run.status.textContent) && eq(run.last().state, { pv: 6 }), "run view: a render that throws is reported, the last results stay");
    // superseded: the first run resolves after the second
    let r1, r2; next = s => new Promise(r => { if (s.pv === 8) r1 = r; else r2 = r; });
    run.run({ pv: 8 }); const p2 = run.run({ pv: 9 });
    r2({ status: "optimal", ok: true, results: { cost: 9 } }); await p2;
    r1({ status: "optimal", ok: true, results: { cost: 8 } }); await tick(); await tick();
    ok(drawn.length === 2 && eq(drawn[1][1], { pv: 9 }) && eq(run.last().state, { pv: 9 }), "run view: a run replaced by a newer one is ignored");
    plan = { pv: 9 }; run.changed(plan); ok(stale.hidden && !res.hasAttribute("data-stale"), "run view: results for the plan on the controls are fresh");
    next = () => new Promise(() => {}); run.run({ pv: 10 }); run.cancel();
    ok(!btn.hasAttribute("aria-disabled") && /stopped/.test(run.status.textContent) && !again.hidden && busy[busy.length - 1] === false, "run view: cancel() releases the busy state and offers Try again");
  }

  // ---------------------------------------------------------------- the report: pure
  const RN = require(L("components/reportnote.js"));
  const FIELDS = [{ key: "recommend", label: "Recommendation", rows: 3, need: true, at: "top", min: 8 }, { key: "alone", label: "What the site cannot do alone", need: true }];
  const NOTE = { heading: "The Prairie Town home: solar and a battery", link: "https://example.org/learn/c0.html#sb0-v3-s0-pv6",
    made: "the Site Bench (engine E0, a linear program)", run: { ok: true, stale: false, text: "one year, hour by hour" },
    plan: [{ label: "Solar PV", value: "6 kW" }, { label: "Battery", value: "10 kWh" }],
    results: [{ label: "Net present value, 20 years", value: "$4,210", note: "2025 dollars" }, { label: "Grid | export", value: "1,200 kWh" }],
    assumptions: ["All money in 2025 dollars", "Prices are illustrative."],
    sensitivity: { metric: "Net present value", input: "the battery price", inputLabel: "Battery price", held: "the plan held fixed",
      base: { at: "$400/kWh", value: "$4,210" }, cases: [{ at: "$300/kWh", value: "$5,000" }, { at: "$500/kWh", value: "$3,100" }] },
    limits: ["It leaves out battery wear"] };
  const WORDS = { recommend: "Install six kilowatts of solar and a ten kilowatt-hour battery for the home.", alone: "It cannot ride through a long winter outage alone." };
  const SL = "Net present value is $4,210 with the battery price at $400/kWh (this plan), $5,000 at $300/kWh and $3,100 at $500/kWh, with the plan held fixed.";
  ok(RN.sensitivityLine(NOTE.sensitivity) === SL, "sensitivity line from its parts");
  ok(RN.sensitivityLine("NPV moves by $900 per $100/kWh") === "NPV moves by $900 per $100/kWh." && RN.sensitivityLine(null) === "" && RN.sensitivityLine({ metric: "x", base: { at: 1, value: 2 }, cases: [] }) === "", "sensitivity line: a sentence, nothing, an incomplete one");
  const T = RN.compose(NOTE, WORDS, FIELDS, { format: "text", date: "2026-11-03", code: "C0" });
  const TX = ["C0 · The Prairie Town home: solar and a battery", "", "Plan link: https://example.org/learn/c0.html#sb0-v3-s0-pv6",
    "Made with the Site Bench (engine E0, a linear program) on 2026-11-03. Results: one year, hour by hour.", "", "RECOMMENDATION", WORDS.recommend, "",
    "THE PLAN", "- Solar PV: 6 kW", "- Battery: 10 kWh", "", "RESULTS", "- Net present value, 20 years: $4,210 (2025 dollars)", "- Grid | export: 1,200 kWh", "",
    "ASSUMPTIONS", "- All money in 2025 dollars.", "- Prices are illustrative.", "", "SENSITIVITY", SL, "", "WHAT THE SITE CANNOT DO ALONE", WORDS.alone, "",
    "LIMITS OF THIS ANALYSIS", "- It leaves out battery wear.", "", RN.FOOTER].join("\n") + "\n";
  ok(T === TX, "the note as plain text, part by part" + (T === TX ? "" : "\n---got---\n" + T));
  const M = RN.compose(NOTE, WORDS, FIELDS, { format: "md", date: "2026-11-03", code: "C0" });
  ok(M.indexOf("## C0 · The Prairie Town home: solar and a battery\n") === 0 && M.indexOf("**Plan link:** https://example.org/learn/c0.html#sb0-v3-s0-pv6  \n") > 0, "Markdown: title and plan link");
  ok(M.indexOf("| Choice | Value |\n|---|---|\n| Solar PV | 6 kW |\n| Battery | 10 kWh |") > 0 && M.indexOf("| Grid \\| export | 1,200 kWh |") > 0, "Markdown: plan and results tables, pipes escaped");
  ok(M.indexOf("### Sensitivity\n| Battery price | Net present value |\n|---|---|\n| $400/kWh (this plan) | $4,210 |\n| $300/kWh | $5,000 |\n| $500/kWh | $3,100 |\n\n" + SL) > 0, "Markdown: the sensitivity table and line");
  ok(M.indexOf("### Assumptions\n- All money in 2025 dollars.\n- Prices are illustrative.") > 0 && M.trim().endsWith("*" + RN.FOOTER + "*"), "Markdown: assumptions as sentences, the footer");
  const W1 = RN.compose(Object.assign({}, NOTE, { run: { ok: true, stale: true } }), WORDS, FIELDS, { date: "x" }), W2 = RN.compose(Object.assign({}, NOTE, { run: { ok: false } }), WORDS, FIELDS, { date: "x" });
  ok(/Warning: these results are for an earlier plan/.test(W1) && /Warning: these results are not from a finished run/.test(W2) && !/Warning/.test(T), "the note warns when its results are stale or unfinished, and only then");
  ok(/\(not written yet\)/.test(RN.compose(NOTE, {}, FIELDS, { date: "x" })) && /\(none stated\)/.test(RN.compose(Object.assign({}, NOTE, { assumptions: [] }), WORDS, FIELDS, { date: "x" })), "empty parts say so");
  const C = RN.checks(NOTE, WORDS, FIELDS);
  ok(C.all && C.total === 7 && eq(C.items.map(x => x.id), ["link", "run", "field-recommend", "field-alone", "assumptions", "sensitivity", "page"]) && RN.headText(C) === "7 of 7 parts in place: the note is ready to copy.", "checks: a complete note passes all seven");
  const fails1 = [[Object.assign({}, NOTE, { link: "" }), WORDS, "link"], [Object.assign({}, NOTE, { run: { ok: true, stale: true } }), WORDS, "run"], [Object.assign({}, NOTE, { run: { ok: false } }), WORDS, "run"],
    [Object.assign({}, NOTE, { results: [] }), WORDS, "run"], [NOTE, { recommend: "Buy solar.", alone: WORDS.alone }, "field-recommend"],
    [NOTE, { recommend: WORDS.recommend + " [...]", alone: WORDS.alone }, "field-recommend"], [NOTE, { recommend: WORDS.recommend, alone: "" }, "field-alone"],
    [Object.assign({}, NOTE, { assumptions: [] }), WORDS, "assumptions"], [Object.assign({}, NOTE, { sensitivity: null }), WORDS, "sensitivity"],
    [NOTE, { recommend: WORDS.recommend + " word".repeat(560), alone: WORDS.alone }, "page"]];
  fails1.forEach(([n, w, id]) => { const c = RN.checks(n, w, FIELDS); ok(!c.all && c.items.filter(x => !x.ok).map(x => x.id).indexOf(id) >= 0, "checks: " + id + " fails when it is missing"); });
  ok(RN.headText(RN.checks(Object.assign({}, NOTE, { link: "" }), WORDS, FIELDS)) === "6 of 7 parts in place. You can copy the note at any time.", "checks: the head line never blocks copying");
  const cu = RN.checks(NOTE, WORDS, FIELDS, ["link", { id: "own", label: "Names the hospital", test: (n, w) => /hospital/.test(w.alone || "") }]);
  ok(cu.total === 2 && cu.items[1].id === "own" && !cu.items[1].ok, "checks: a page's own check");
  ok(RN.countWords(T) < RN.PAGE_WORDS && RN.countWords("a b | c --- d") === 4, "one page: the sample note fits; Markdown marks are not words");
  const HT = RN.html(NOTE, WORDS, FIELDS, { date: "2026-11-03", code: "C0" });
  ok(/<h4 class="lx-rn-title">C0 · The Prairie Town home/.test(HT) && /<code>https:\/\/example\.org\/learn\/c0\.html#sb0-v3-s0-pv6<\/code>/.test(HT) && HT.indexOf(RN.sensitivityLine(NOTE.sensitivity).replace(/\$/g, "$")) > 0
    && !/<a /.test(HT) && /<th scope="row">Grid \| export<\/th>/.test(HT), "preview HTML: title, the link as text (not a link), the sensitivity line, tables");
  const XS = RN.html(Object.assign({}, NOTE, { heading: "<script>x</script>" }), { recommend: '<img onerror="x">' }, FIELDS, {});
  ok(!/<script|<img/.test(XS) && XS.indexOf("&lt;img onerror=&quot;x&quot;&gt;") > 0, "preview HTML escapes the reader's words and the page's text");
  const OL = RN.outlineHTML(FIELDS);
  ok(/^<ol class="lx-rn-outline"><li><b>Title and plan link:<\/b>/.test(OL) && OL.indexOf("<b>Recommendation:</b>") < OL.indexOf("<b>The plan:</b>") && OL.indexOf("<b>What the site cannot do alone:</b>") > OL.indexOf("<b>Sensitivity:</b>"), "outline for no-JS readers, in the note's order");
  // the appendix option: the reader's writing first, the run's evidence after it under its own heading
  { const AX = "Appendix: evidence from the run", o = { date: "x", code: "C4", appendix: AX };
    const AT = RN.compose(NOTE, WORDS, FIELDS, o), AM = RN.compose(NOTE, WORDS, FIELDS, Object.assign({ format: "md" }, o)), AH = RN.html(NOTE, WORDS, FIELDS, o), AO = RN.outlineHTML(FIELDS, { appendix: AX });
    const at = k => AT.indexOf(k);
    ok(at("WHAT THE SITE CANNOT DO ALONE") > 0 && at("WHAT THE SITE CANNOT DO ALONE") < at("----\nAPPENDIX: EVIDENCE FROM THE RUN") && at("APPENDIX: EVIDENCE FROM THE RUN") < at("THE PLAN") && at("THE PLAN") < at("ASSUMPTIONS") && at("SENSITIVITY") < at("LIMITS OF THIS ANALYSIS"),
       "appendix (text): every field of the reader's first, then a ruled heading, then the plan, results, assumptions, sensitivity and limits");
    ok(/\n## Appendix: evidence from the run\n/.test(AM) && AM.indexOf("### What the site cannot do alone") < AM.indexOf("## Appendix") && AM.indexOf("## Appendix") < AM.indexOf("### The plan"), "appendix (Markdown): a level-2 heading between the writing and the evidence");
    ok(/<h4 class="lx-rn-appx">Appendix: evidence from the run<\/h4>/.test(AH) && AH.indexOf("lx-rn-appx") < AH.indexOf("<h5>The plan</h5>"), "appendix (preview): its own heading before the evidence");
    ok((AO.match(/<ol class="lx-rn-outline">/g) || []).length === 2 && AO.indexOf("<b>What the site cannot do alone:</b>") < AO.indexOf("Appendix: evidence from the run") && AO.indexOf("Appendix") < AO.indexOf("<b>The plan:</b>"), "appendix (outline): two lists, the writing's then the evidence's");
    ok(RN.compose(NOTE, WORDS, FIELDS, { date: "x" }) === T.replace(/2026-11-03/g, "x").replace(/^C0 · /, "") || !/APPENDIX/.test(RN.compose(NOTE, WORDS, FIELDS, { date: "x" })), "no appendix option: the note as before"); }
  // no claim of saving or sending: in the note, the messages and every string literal of the three components
  [T, M, W1, W2].forEach((t, i) => ok(!RN.CLAIMS.test(t), "the note claims no saving or sending (" + i + ")"));
  ["sharestate", "benchrun", "reportnote"].forEach(f => {
    const src = fs.readFileSync(L("components/" + f + ".js"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    const strs = (src.match(/"(?:[^"\\\n]|\\.)*"/g) || []).filter(s => !/^"\\b\(|CLAIMS/.test(s));
    const bad = strs.filter(s => RN.CLAIMS.test(s));
    ok(bad.length === 0, `${f}.js: no string claims anything was saved, sent or submitted (${bad.join(" ")})`);
  });

  // ---------------------------------------------------------------- the report: view
  {
    const P = page({ store: { kv: "{}" } }); P.load("reportnote");
    P.E.LX.store.set("t-note", { recommend: "Stored words from before, eight words or more here.", bogus: 1 });
    let note = null, changes = [];
    const host = P.E.LX.H("div", null, P.E.body);
    const v = P.E.LX.ReportNote(host, { id: "t-note", code: "C0", title: "Your one-page note", fields: FIELDS, get: () => note, onChange: c => changes.push(c.pass) });
    const tas = host.querySelectorAll(".lx-rn-field textarea");
    ok(tas.length === 2 && tas[0].value === "Stored words from before, eight words or more here." && tas[1].value === "", "report view: fields, with the stored words");
    ok(/Run your plan first/.test(host.querySelector(".lx-rn-page").innerHTML), "report view: before a run, the preview asks for one");
    note = NOTE; v.refresh();
    ok(/Net present value, 20 years/.test(host.querySelector(".lx-rn-page").innerHTML) && /6 of 7 parts in place/.test(host.querySelector(".lx-rn-checks-h").textContent), "report view: refresh() fills the preview and the checks");
    tas[1].value = WORDS.alone; tas[1].fire("input");
    ok(/7 of 7 parts in place/.test(host.querySelector(".lx-rn-checks-h").textContent) && eq(P.E.LX.store.get("t-note").alone, WORDS.alone) && changes[changes.length - 1] === 7, "report view: typing updates the checks and keeps the words in this browser");
    ok(host.querySelectorAll(".lx-rn-list li.ok").length === 7 && /In place: /.test(host.querySelector(".lx-rn-list li").innerHTML), "report view: each check says its state in words too");
    buttons(host, /^Copy as Markdown$/)[0].click(); await tick();
    const area = host.querySelector(".lx-rn-copy textarea");
    ok(!host.querySelector(".lx-rn-copy").hidden && area.value.indexOf("## C0 · The Prairie Town home") === 0 && /did not allow copying: select the text below and copy it \(Markdown\)/.test(host.querySelector(".lx-rn-msg").textContent),
      "report view: without a clipboard the Markdown shows to select, and the line says so");
    ok(!RN.CLAIMS.test(host.textContent), "report view: no claim of saving or sending on the page");
    ok(v.text("text").indexOf("C0 · The Prairie Town home") === 0 && v.checks().all, "report view: text() and checks()");
    v.set({ recommend: "Short." }); ok(tas[0].value === "Short." && !v.checks().all, "report view: set() fills the fields and re-checks");
  }

  console.log(`${checks} checks, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("FAIL: test crashed:", e && e.stack); process.exit(1); });
