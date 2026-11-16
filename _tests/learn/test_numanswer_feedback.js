// Numeric answer feedback follows the current draft; historical completion and first-attempt drill scores survive.
// Run from the site folder: node _tests/learn/test_numanswer_feedback.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { env, load, buttons } = require("./stubdom.js");
const L = p => path.resolve(__dirname, "../../assets/learn", p);
const J = p => JSON.parse(fs.readFileSync(L("data/" + p + ".json"), "utf8"));
const NA = require(L("components/numanswer.js"));
let checks = 0, fails = 0;
function test(name, f) { checks++; try { f(); } catch (e) { fails++; console.log("FAIL:", name, "—", e.stack || e.message); } }

test("signed monetary answers keep the sign on either side of the dollar symbol", () => {
  for (const s of ["-$120", "−$120", "$-120"]) assert.strictEqual(NA.parse(s, "dollars"), -120, s);
  assert.strictEqual(NA.parse("-$120 per kW", "$ per kW"), -120);
  assert.strictEqual(NA.parse("-$120", "kW"), null);
});

test("a step can clear old feedback without leaving a success icon", () => {
  const E = env(); load("cards", E);
  let api;
  const c = E.LX.StepCards(E.body, { steps: [{ text: "Answer", build: (act, a) => { api = a; } }, { text: "Next" }] });
  api.saw("Previously correct"); api.done();
  assert.ok(c.el.querySelector(".lx-saw"));
  api.clearSaw(); api.undone();
  assert.strictEqual(c.el.querySelector(".lx-saw"), null);
  assert.strictEqual(buttons(c.el, /^Next/)[0].disabled, true);
});

test("K1 requires both current answers, including after an answer is edited or rejected", () => {
  const E = env(); ["numanswer", "drill", "cards"].forEach(n => load(n, E));
  let init, cards;
  E.LX.mount = (id, f) => { init = f; };
  E.LX.demo = (root, fn, c) => { cards = c; };
  vm.runInNewContext(fs.readFileSync(L("k01-units.js"), "utf8"), { window: E.window, document: E.document, console, module: { exports: {} } });
  const root = E.LX.H("div", null, E.body);
  init(E.LX.H("div", null, root), { town: J("town"), town_year: J("town_year"), town_days: J("town_days"), "01_power_energy": J("01-power-energy") }, root);
  const inp = cards.el.querySelectorAll(".lx-na input"), check = buttons(cards.el, /^Check$/), next = buttons(cards.el, /^Next/)[0];
  inp[0].value = "450000"; check[0].click();
  inp[0].value = "450000%"; inp[0].fire("input");
  assert.strictEqual(cards.el.querySelector(".k1-test").textContent, "");
  inp[1].value = "0.45"; check[1].click();
  assert.strictEqual(next.disabled, true);
  check[0].click(); assert.strictEqual(next.disabled, true);
  inp[0].value = "450000 kW"; check[0].click();
  assert.strictEqual(next.disabled, false);
  assert.ok(cards.el.querySelector(".lx-saw"));
  inp[1].value = ""; inp[1].fire("input");
  assert.strictEqual(next.disabled, true);
  assert.strictEqual(cards.el.querySelector(".lx-saw"), null);
  inp[1].value = "0.45"; check[1].click(); assert.strictEqual(next.disabled, false);
});

test("drill editing clears pre-answer prompts, then a graded numeric answer stays locked until Next item", () => {
  const E = env(); ["numanswer", "drill"].forEach(n => load(n, E));
  const d = E.LX.Drill(E.body, { item: () => ({ q: "One megawatt", unit: "MW", answer: 1, why: "One." }), empty: "Type a number first." });
  const inp = E.body.querySelector("input"), check = buttons(E.body, /^Check$/)[0];
  check.click(); assert.ok(E.body.textContent.includes("Type a number first."));
  inp.value = "1"; inp.fire("input");
  assert.ok(!E.body.textContent.includes("Type a number first."));
  check.click(); assert.deepStrictEqual(JSON.parse(JSON.stringify(d.score())), { right: 1, done: 1 });
  assert.strictEqual(inp.disabled, true); assert.strictEqual(check.disabled, true);
  assert.strictEqual(inp.value, "1");
  buttons(E.body, /^Next item/)[0].click();
  const nextInput = E.body.querySelector("input"), nextCheck = buttons(E.body, /^Check$/)[0];
  assert.ok(!nextInput.disabled && !nextCheck.disabled);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(d.score())), { right: 1, done: 1 });
  nextInput.value = "2"; nextCheck.click();
  assert.strictEqual(nextInput.disabled, true); assert.strictEqual(nextCheck.disabled, true);
  assert.ok(E.body.textContent.includes("Not quite."));
  assert.deepStrictEqual(JSON.parse(JSON.stringify(d.score())), { right: 1, done: 2 });
});

test("drill choice controls also lock the scored answer while Next item remains available", () => {
  const E = env(); ["numanswer", "drill"].forEach(n => load(n, E));
  E.LX.Drill(E.body, { item: () => ({ q: "One?", choices: ["Yes", "No"], answer: 0, why: "One." }) });
  buttons(E.body, /^Yes$/)[0].click();
  assert.ok(E.body.querySelectorAll(".lx-choice").every(b => b.disabled));
  const next = buttons(E.body, /^Next item/)[0]; assert.ok(!next.disabled); next.click();
  assert.ok(E.body.querySelectorAll(".lx-choice").every(b => !b.disabled));
});

console.log(`${checks} numeric feedback regression checks, ${fails} failed`);
process.exitCode = fails ? 1 : 0;
