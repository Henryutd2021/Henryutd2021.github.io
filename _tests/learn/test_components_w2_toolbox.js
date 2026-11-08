// test_components_w2_toolbox.js — Node tests for the toolbox's two shared pieces:
//   numanswer.js (LX.NumAnswer: a number box with its unit and Check button; parse() and close()) and drill.js (LX.Drill:
//   the seeded practice drill; rng() and series()), with their .css files. They replace the copies K1, K2, K3, K4, K5 and
//   K8 each carried before (numInput, rng, drill, drillView).
//   - each file defines its LX.<Name> with a stub window.LX, exports its pure part to Node, uses --lx-* tokens only, and is
//     in the generated bundle (learn.js, learn.css)
//   - the pure parts: the parser on the inputs the pages accepted before (commas, $, %, minus signs, e-notation, × 10^n),
//     the tolerance check, the generator (the same numbers as the pages' old copy), series()
//   - per-seed item sequences: every K page's drill(…, seed, n) equals the old loop (the old generator, the page's own
//     drillItem) on several seeds, and K5's samples are drawn as before
//   - the views on a stub document (_tests/learn/stubdom.js): label and box, Check and Enter, widths; the drill's card,
//     score, feedback, choice and number items, the three empty-box rules, the three focus rules, unit and check options
//   - no copy left: no K page defines numInput, rng or its own drill view; each uses LX.Drill with its own settings; the
//     page CSS no longer styles the old answer-row and drill classes
// Usage (from the site folder):  node _tests/learn/test_components_w2_toolbox.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { env, load, buttons, active } = require("./stubdom.js");
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const J = f => JSON.parse(fs.readFileSync(L("data/" + f), "utf8"));
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }

// ---------------------------------------------------------------- files, tokens, bundle
const NAMES = { numanswer: "NumAnswer", drill: "Drill" };
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
ok(bundleJS.indexOf("/* numanswer.js") < bundleJS.indexOf("/* drill.js"), "bundle: numanswer.js loads before drill.js (the drill's number items use it)");

// ---------------------------------------------------------------- NumAnswer: pure
const NA = require(L("components/numanswer.js"));
const P = NA.parse, near = (a, b, t) => a != null && Math.abs(a - b) <= (t === undefined ? 1e-9 : t);
ok(P("450,000") === 450000 && P("0.45") === 0.45 && P(".5") === 0.5 && P("5.") === 5 && P("6.96e9") === 6.96e9 && P("1e3") === 1000, "parse: commas, decimals, e-notation");
ok(near(P("6.96 × 10^9"), 6.96e9, 1) && near(P("6.96x10^9"), 6.96e9, 1) && near(P("6.96*10^9"), 6.96e9, 1) && near(P("2 × 10^-3"), 0.002, 1e-15), "parse: a × 10^n written three ways, negative exponents");
ok(P("−3") === -3 && P("–2.5") === -2.5 && P("-0.25") === -0.25, "parse: minus, en dash and hyphen");
ok(P("$78,600") === 78600 && P("$3.85") === 3.85 && P("33.8%") === 33.8 && P(" 145 ") === 145 && P("1 230") === 1230, "parse: dollars, percent and spaces dropped");
// superscript exponents, no left-over text, and only the box's own unit after the number
ok(near(P("6.96 × 10⁹"), 6.96e9, 1) && near(P("6.96×10⁹"), 6.96e9, 1) && near(P("2 × 10⁻³"), 0.002, 1e-15) && P("10⁹") === 1e9 && P("10^9") === 1e9 && near(P("1.9 × 10¹"), 19, 1e-12) && near(P("4.2 × 10¹⁵"), 4.2e15, 1),
  "parse: superscript exponents as the page prints them (6.96 × 10⁹ is 6.96e9, not 6.96), and a bare power of ten");
ok(P("145 MW") === null && P("12.5kg") === null && P("3 apples") === null && P("1.2.3") === null && P("6.96 × 10") === null && P("abc") === null, "parse: left-over text is refused (null), not cut off as parseFloat would");
ok(P("450,000 MW", "kW") === null && P("450,000 kW", "kW") === 450000 && P("450,000 kw", "kW") === 450000 && P("450,000", "kW") === 450000, "parse: in a kW box, 450,000 MW is refused; 450,000 kW and 450,000 are read");
ok(P("145 MW", ["MW", "megawatts"]) === 145 && P("145 megawatts", ["MW", "megawatts"]) === 145 && P("$120 per kW", "$ per kW") === 120 && P("120 $/kW", "$ per kW") === 120 && P("85%", "% (back ÷ in)") === 85,
  "parse: the unit may be a list; case, spaces and $ and % are ignored, and / reads as per");
ok(P("") === null && P("$") === null && P(null) === null && P(undefined) === null && P("-") === null && P("1e400") === null, "parse: no number gives null");
ok(NA.read("").why === "empty" && NA.read(" $ ").why === "empty" && NA.read("450,000 MW", "kW").why === "text" && NA.read("abc").why === "text" && NA.read("6.96 × 10⁹").why === null && NA.read("6.96 × 10⁹").value === 6.96e9,
  "read: why a text gives no number (empty, or text that is not just a number)");
ok(NA.close(145, 145) && !NA.close(145.0001, 145) && !NA.close(null, 0) && !NA.close(NaN, NaN), "close: exact without a tolerance; null and NaN never");
ok(NA.close(6.963, 6.957, 0.006) && !NA.close(6.95, 6.957, 0.006) && NA.close(1.5, 1, 0.5) && !NA.close(1.6, 1, 0.5), "close: within the tolerance (ends included)");

// ---------------------------------------------------------------- Drill: pure
const DR = require(L("components/drill.js"));
// the generator every K page carried before the shared drill (k01..k05, k08), kept here as the reference
function oldRng(seed) { var x = seed >>> 0 || 1; return function () { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; }
[0, 1, 7, 42, 99999, 100000, 4294967295].forEach(seed => {
  const a = DR.rng(seed), b = oldRng(seed); let same = true;
  for (let i = 0; i < 500; i++) { const x = a(), y = b(); if (x !== y || !(x >= 0 && x < 1)) same = false; }
  ok(same, `rng(${seed}): the same 500 numbers in [0, 1) as the pages' old generator`);
});
ok(DR.rng(0)() === DR.rng(1)(), "rng: seed 0 is read as 1");
const mk = (k, r) => ({ k: k, v: Math.floor(r() * 1000) });
ok(JSON.stringify(DR.series(mk, 42, 25)) === JSON.stringify(DR.series(mk, 42, 25)) && JSON.stringify(DR.series(mk, 42, 25)) !== JSON.stringify(DR.series(mk, 43, 25)), "series: a seed replays the same items; another seed differs");
ok(DR.series(mk, 5, 4).map(i => i.k).join() === "0,1,2,3", "series: items are numbered from 0");
const s0 = DR.newSeed(); ok(Number.isInteger(s0) && s0 >= 1 && s0 <= 100000, "newSeed: a seed from 1 to 100,000, as the pages drew it");

// ---------------------------------------------------------------- per-seed sequences of every K page: as before the shared drill
{
  const K = id => require(L(id + ".js"));
  const town = J("town.json"), year = J("town_year.json"), days = J("town_days.json"), D1 = J("01-power-energy.json"), fc = J("04-forecasts.json");
  const K1 = K("k01-units"), K2 = K("k02-rates-efficiencies"), K3 = K("k03-discounting"), K4 = K("k04-linear-equations"), K5 = K("k05-probability-statistics"), K8 = K("k08-git-notebooks");
  const D1d = K1.story(town, year, days, D1).D, D4 = K4.townDay(town, year), S8 = K8.story(K8.townDay(town, year));
  const old = (item, seed, n) => { const r = oldRng(seed), out = []; for (let k = 0; k < n; k++) out.push(item(k, r)); return out; };
  const pages = {
    K1: [(s, n) => K1.drill(D1d, s, n), (k, r) => K1.drillItem(D1d, k, r)],
    K2: [(s, n) => K2.drill(s, n), (k, r) => K2.drillItem(k, r)],
    K3: [(s, n) => K3.drill(s, n), (k, r) => K3.drillItem(k, r)],
    K4: [(s, n) => K4.drill(D4, s, n), (k, r) => K4.drillItem(D4, k, r)],
    K5: [(s, n) => K5.drill(fc, s, n), (k, r) => K5.drillItem(fc, k, r)],
    K8: [(s, n) => K8.drill(S8, s, n), (k, r) => K8.drillItem(S8, k, r)] };
  Object.keys(pages).forEach(id => {
    [1, 7, 42, 31337, 99999].forEach(seed => ok(JSON.stringify(pages[id][0](seed, 60)) === JSON.stringify(old(pages[id][1], seed, 60)), `${id}: drill seed ${seed} gives the same 60 items as before`));
  });
  [K1, K2, K3, K4, K5, K8].forEach((M, i) => ok(M.rng === DR.rng, `${Object.keys(pages)[i]}: exports the shared rng`));
  const x = K5.errors(fc);
  ok(JSON.stringify(K5.sampleShares(x, 10, 5, K5.rng(3), 5)) === JSON.stringify(K5.sampleShares(x, 10, 5, oldRng(3), 5)) && JSON.stringify(K5.draw(x, 50, K5.rng(9))) === JSON.stringify(K5.draw(x, 50, oldRng(9))), "K5: the samples are drawn as before");
  ok(K1.parseNum === NA.parse && K2.close === NA.close && K3.close === NA.close, "K1's parser and K2's and K3's tolerance check are NumAnswer's");
  ok(K1.close(0.45, 0.45) && K1.close(6.96, 6.957, 0.006) && !K1.close(null, 1), "K1 keeps its own relative check for drill answers without a tolerance");
}

// ---------------------------------------------------------------- NumAnswer: view
{
  const E = env(); load("numanswer", E);
  const host = E.LX.H("div", null, E.body), got = [];
  const a = E.LX.NumAnswer(host, { label: "g =", unit: "MW", onCheck: (v, inp) => got.push([v, inp]) });
  const lab = host.querySelector("label"), inp = host.querySelector("input"), unit = host.querySelector(".lx-na-unit"), btn = host.querySelector("button");
  ok(a.row.classList.contains("lx-na") && a.input === inp && a.button === btn && typeof a.go === "function", "NumAnswer view: returns row, input, button, go");
  ok(lab.getAttribute("for") === inp.id && inp.id && lab.textContent === "g =", "NumAnswer view: the label names the box (for/id)");
  ok(inp.getAttribute("type") === "text" && inp.getAttribute("inputmode") === "decimal" && inp.getAttribute("autocomplete") === "off" && inp.classList.contains("lx-na-num"), "NumAnswer view: a text box with a number pad on phones");
  ok(unit.textContent === "MW" && btn.textContent === "Check" && btn.getAttribute("type") === "button" && btn.classList.contains("lx-btn"), "NumAnswer view: unit and Check button");
  ok(unit.id && inp.getAttribute("aria-describedby") === unit.id, "NumAnswer view: the unit describes the box (aria-describedby)");
  ok(!a.row.getAttribute("style"), "NumAnswer view: no width set by default (7.5em from the CSS)");
  inp.value = "1,230"; btn.click();
  ok(got.length === 1 && got[0][0] === 1230 && got[0][1] === inp, "NumAnswer view: Check passes the parsed number and the box");
  inp.value = "−3"; const e = inp.fire("keydown", { key: "Enter" });
  ok(got.length === 2 && got[1][0] === -3 && e.defaultPrevented, "NumAnswer view: Enter checks too");
  inp.fire("keydown", { key: "a" }); ok(got.length === 2, "NumAnswer view: other keys do nothing");
  inp.value = ""; a.go(); ok(got.length === 3 && got[2][0] === null, "NumAnswer view: an empty box gives null");
  // a refused entry (another unit, or words): the box's own note says so, the check is not run (never graded)
  const msg = host.querySelector(".lx-na-msg");
  ok(msg && msg.hidden && msg.getAttribute("aria-live") === "polite", "NumAnswer view: a live note, hidden until needed");
  inp.value = "145 kW"; a.go();
  ok(got.length === 3 && !msg.hidden && msg.textContent === "Type just the number: the box is in MW." && inp.getAttribute("aria-invalid") === "true" && inp.getAttribute("aria-describedby") === unit.id + " " + msg.id,
    "NumAnswer view: 145 kW in an MW box is refused, not graded; the note says why and describes the box");
  inp.value = "145 MW"; a.go();
  ok(got.length === 4 && got[3][0] === 145 && msg.hidden && !inp.getAttribute("aria-invalid") && inp.getAttribute("aria-describedby") === unit.id, "NumAnswer view: 145 MW in an MW box is checked as 145; the note clears");
  inp.value = "6.96 × 10⁹"; a.go(); ok(got.length === 5 && got[4][0] === 6.96e9, "NumAnswer view: 6.96 × 10⁹ is checked as 6.96e9");
  const k = E.LX.NumAnswer(host, { label: "In kW", unit: "kW", onCheck: v => got.push([v]) });
  k.input.value = "450,000 MW"; k.go(); ok(got.length === 5 && k.msg.textContent === "Type just the number: the box is in kW.", "NumAnswer view: 450,000 MW in a kW box is refused");
  const n = E.LX.NumAnswer(host, { label: "n =", onCheck: v => got.push([v]) });
  n.input.value = "9 places"; n.go(); ok(got.length === 5 && n.msg.textContent === "Type just the number." && !n.input.getAttribute("aria-describedby") === false, "NumAnswer view: without a unit, any words are refused");
  n.input.value = "9"; n.go(); ok(got.length === 6 && got[5][0] === 9 && !n.input.getAttribute("aria-describedby"), "NumAnswer view: without a unit, the box has no description until a note shows");
  const b = E.LX.NumAnswer(host, { label: "Answer", button: "Try", width: "8.5em", widthPhone: "6.5em", onCheck: () => {} });
  ok(b.row.getAttribute("style") === "--lx-na-w:8.5em;--lx-na-wp:6.5em" && b.button.textContent === "Try" && !b.row.querySelector(".lx-na-unit"), "NumAnswer view: widths as custom properties, button text, no unit");
  ok(E.LX.NumAnswer.parse === NA.parse || E.LX.NumAnswer.parse("6.96e9") === 6.96e9, "NumAnswer view: LX.NumAnswer.parse for pages");
  const css = fs.readFileSync(L("components/numanswer.css"), "utf8");
  ok(/\.lx-na-num \{ width: var\(--lx-na-w, 7\.5em\)/.test(css) && /max-width: 560px\) \{ \.lx-na-num \{ width: var\(--lx-na-wp, var\(--lx-na-w, 7\.5em\)\)/.test(css) && /\.lx-na-num\.right/.test(css) && /\.lx-na-num\.wrong/.test(css) && /min-height: 44px/.test(css),
    "numanswer.css: widths from the options, marks for a checked answer, a 44 px target");
}

// ---------------------------------------------------------------- Drill: view
const ITEMS = (k, r) => {   // a choice item, then a number item with a tolerance, then an exact number item
  const v = Math.floor(r() * 90) + 10, kind = k % 3;
  if (kind === 0) return { q: "Pick " + v, choices: ["a", "b", String(v)], answer: 2, why: "It is " + v + "." };
  if (kind === 1) return { q: "Half of " + v + "?", answer: v / 2, tol: 0.5, unit: "MW", why: v + " ÷ 2 = " + v / 2 + "." };
  return { q: "Twice " + v + "?", answer: 2 * v, unit: "$", why: v + " × 2 = " + 2 * v + "." };
};
function drillEnv(opts) {
  const E = env(); load("numanswer", E); load("drill", E);
  const host = E.LX.H("div", null, E.body);
  const d = E.LX.Drill(host, Object.assign({ item: ITEMS, seed: 42, hint: "Three kinds of item." }, opts || {}));
  return { E, host, d, q: () => host.querySelector(".lx-qtext"), score: () => host.querySelector(".lx-step-n").textContent,
           saw: () => host.querySelector(".lx-drill-q .lx-saw"), next: () => buttons(host, /Next item/)[0] };
}
{
  const t = drillEnv({ cls: "k9-drill", choicesClass: "k9-choices" }), host = t.host, ref = DR.series(ITEMS, 42, 6);
  const card = host.querySelector(".lx-card");
  ok(card && card.classList.contains("lx-drill") && card.classList.contains("k9-drill") && host.querySelector("h3").textContent === "Practice drill", "Drill view: a card with the page's class and its title");
  ok(host.querySelector(".lx-hint").textContent === "Three kinds of item." && t.score() === "0 done" && host.querySelector(".lx-step-n").getAttribute("aria-live") === "polite", "Drill view: hint, and a score announced in a live region");
  ok(t.d.seed === 42 && t.q().textContent === ref[0].q && t.d.current().q === ref[0].q, "Drill view: the first item is series(item, seed)[0]");
  ok(t.q().getAttribute("tabindex") === "-1", "Drill view: the question can take focus (default)");
  const row = host.querySelector(".lx-qbtns"), ch = row.querySelectorAll("button.lx-choice");
  ok(row.classList.contains("k9-choices") && ch.length === 3 && ch.map(b => b.textContent).join() === ref[0].choices.join(), "Drill view: a choice item draws its buttons (with choicesClass)");
  const kids = host.querySelector(".lx-drill-q").children;
  ok(kids.length === 3 && kids[0] === t.q() && kids[1] === row && kids[2].getAttribute("aria-live") === "polite", "Drill view: question, answer, then the item's feedback in a live region");
  ch[0].click();
  ok(ch[0].classList.contains("wrong") && t.score() === "0 of 1 right" && t.saw().classList.contains("no") && /Not quite\./.test(t.saw().textContent) && t.saw().textContent.indexOf(ref[0].why) > 0, "Drill view: a wrong choice is marked, scored and explained");
  ch[2].click();
  ok(!ch[2].classList.contains("right") && t.score() === "0 of 1 right", "Drill view: an answered item takes no second answer");
  t.next().click();
  ok(t.q().textContent === ref[1].q && active() === t.q(), "Drill view: Next shows item 2 and moves focus to its question");
  const box = host.querySelector(".lx-drill-q input"), unit = host.querySelector(".lx-drill-q .lx-na-unit"), chk = buttons(host.querySelector(".lx-drill-q"), /^Check$/)[0];
  ok(box && unit.textContent === "MW" && host.querySelector(".lx-drill-q label").textContent === "Answer", "Drill view: a number item has an Answer box with its unit");
  box.value = ""; chk.click();
  ok(t.score() === "0 of 1 right" && !t.saw(), "Drill view: an empty box does nothing by default");
  box.value = String(ref[1].answer + 0.4); box.fire("keydown", { key: "Enter" });
  ok(t.score() === "1 of 2 right" && !t.saw().classList.contains("no") && /Right\./.test(t.saw().textContent), "Drill view: a number within the tolerance is right (Enter)");
  t.next().click(); const b3 = host.querySelector(".lx-drill-q input");
  b3.value = String(ref[2].answer + 1); buttons(host.querySelector(".lx-drill-q"), /^Check$/)[0].click();
  ok(t.score() === "1 of 3 right" && t.saw().classList.contains("no"), "Drill view: without a tolerance only the exact number is right");
  ok(host.querySelector(".lx-drill-q .lx-na-unit").textContent === "$", "Drill view: the item's own unit by default");
  const sc = t.d.score(); ok(sc.right === 1 && sc.done === 3, "Drill view: score()");
  t.next().click(); ok(t.q().textContent === ref[3].q, "Drill view: the items follow series(item, seed)");
}
{
  const t = drillEnv({ empty: "Type a number first.", unit: it => it.unit === "$" ? "dollars" : "checks", width: "8em" });
  t.next().click(); t.next().click();
  const box = t.host.querySelector(".lx-drill-q input"), fb = t.host.querySelector(".lx-drill-q").children[2];
  ok(t.host.querySelector(".lx-drill-q .lx-na-unit").textContent === "dollars" && t.host.querySelector(".lx-drill-q .lx-na").getAttribute("style") === "--lx-na-w:8em", "Drill view: unit() and width options");
  box.value = "x"; box.fire("keydown", { key: "Enter" });
  ok(fb.textContent === "" && t.host.querySelector(".lx-drill-q .lx-na-msg").textContent === "Type just the number: the box is in dollars." && t.score() === "0 done", "Drill view: words are refused by the number box (its own note), not graded");
  box.value = ""; box.fire("keydown", { key: "Enter" });
  ok(fb.textContent === "Type a number first." && t.score() === "0 done", "Drill view: empty: a message, and the item stays open");
  box.value = String(DR.series(ITEMS, 42, 3)[2].answer); box.fire("keydown", { key: "Enter" });
  ok(t.score() === "1 of 1 right", "Drill view: then a typed answer is checked");
}
{
  const t = drillEnv({ empty: false, focus: false, check: (v, it) => v === it.answer || v === 999 });
  const before = active();
  t.next().click();
  ok(!t.q().hasAttribute("tabindex") && active() === before, "Drill view: focus: false keeps focus on Next (no tabindex on the question)");
  const box = t.host.querySelector(".lx-drill-q input"); box.value = ""; box.fire("keydown", { key: "Enter" });
  ok(t.score() === "0 of 1 right" && t.saw().classList.contains("no"), "Drill view: empty: false grades an empty box as wrong");
  t.next().click(); const b3 = t.host.querySelector(".lx-drill-q input"); b3.value = "999"; b3.fire("keydown", { key: "Enter" });
  ok(t.score() === "1 of 2 right", "Drill view: a page's own check()");
}
{
  const t = drillEnv({ focus: "answer" });
  t.next().click();
  ok(active() === t.host.querySelector(".lx-drill-q input") && !t.q().hasAttribute("tabindex"), "Drill view: focus \"answer\" moves focus to the new item's box");
  t.next().click(); t.next().click();
  ok(active() === t.host.querySelector(".lx-drill-q .lx-choice"), "Drill view: … or to its first choice");
  const t2 = drillEnv({ seed: undefined }); ok(t2.d.seed >= 1 && t2.d.seed <= 100000, "Drill view: a new seed per visit by default");
  const t3 = drillEnv({ hint: null, title: "Warm-up" }); ok(!t3.host.querySelector(".lx-hint") && t3.host.querySelector("h3").textContent === "Warm-up", "Drill view: title and no hint");
}
{
  const css = fs.readFileSync(L("components/drill.css"), "utf8");
  ok(/\.lx-drill \{ display: grid; gap: 10px; \}/.test(css) && /\.lx-drill \.lx-btn \{ justify-self: start; \}/.test(css) && /\.lx-drill-q \{ display: grid; gap: 10px; \}/.test(css) && /\.lx-drill-q \.lx-qtext:focus \{ outline: none; \}/.test(css),
    "drill.css: the card, its Next button and the item as the pages styled them");
}

// ---------------------------------------------------------------- no copy left in the K pages; each uses the components
{
  const PAGES = { "k01-units": "k1", "k02-rates-efficiencies": "k2", "k03-discounting": "k3", "k04-linear-equations": "k4", "k05-probability-statistics": "k5", "k08-git-notebooks": "k8" };
  Object.keys(PAGES).forEach(id => {
    const js = fs.readFileSync(L(id + ".js"), "utf8"), qmd = fs.readFileSync(path.join(SITE, "learn", id + ".qmd"), "utf8"), p = PAGES[id];
    const css = (qmd.match(/<style>[\s\S]*?<\/style>/) || [""])[0];
    ok(!/function numInput\(|function rng\(|1664525|inputmode|class: "lx-hint", text: "(Six|Seven|Five) kinds/.test(js), `${id}: no copy of the number box, the generator or the drill view`);
    ok(/LX\.Drill\(host, \{/.test(js) && /require\("\.\/components\/drill\.js"\)/.test(js), `${id}: the drill is LX.Drill (Node: components/drill.js)`);
    ok(/LX\.NumAnswer\(/.test(js) || id === "k08-git-notebooks", `${id}: number boxes are LX.NumAnswer`);
    ok(!new RegExp("\\.(" + p + "|w1h)-(ans|num|unit)\\b|\\." + p + "-drill(-q)?\\b").test(css), `${id}: the page CSS no longer styles the old answer row or drill`);
    ok(qmd.indexOf('<div id="' + p + '-drill"') >= 0, `${id}: the drill's host is still #${p}-drill`);
  });
  const src = id => fs.readFileSync(L(id + ".js"), "utf8");
  ok(/empty: "Type a number first\."/.test(src("k01-units")) && /check: function \(v, it\) \{ return close\(v, it\.answer, it\.tol\); \}/.test(src("k01-units")) && /width: "8\.5em", widthPhone: "6\.5em"/.test(src("k01-units")), "K1: empty message, its own check, wide boxes (6.5em on phones)");
  ["k02-rates-efficiencies", "k03-discounting"].forEach(id => ok(/empty: "Type a number first\."/.test(src(id)) && /it\.unit === "\$" \? "dollars"/.test(src(id)), `${id}: empty message and "dollars"`));
  ok(/focus: false, empty: "Type a number first\."/.test(src("k04-linear-equations")), "K4: focus stays on Next, as before; an empty box asks for a number, as in K1 to K3");
  ok(/width: "7em"/.test(src("k05-probability-statistics")) && !/empty:/.test(src("k05-probability-statistics").slice(src("k05-probability-statistics").indexOf("function drillView"))), "K5: 7em boxes; an empty box does nothing, as before");
  ok(/focus: "answer", width: "8em", choicesClass: "k8-choices"/.test(src("k08-git-notebooks")) && /"dollars" : "checks"/.test(src("k08-git-notebooks")), "K8: focus on the new item's first control, 8em box, wrapping choices, units");
  ok(fs.readFileSync(path.join(SITE, "learn/k08-git-notebooks.qmd"), "utf8").indexOf('<div class="lx-card lx-drill"><div class="lx-x-head"><h3>Practice drill</h3></div>') >= 0, "K8: the no-JS drill card uses the shared class");
}

console.log(`components (toolbox): ${checks - fails} of ${checks} checks passed`);
process.exit(fails ? 1 : 0);
