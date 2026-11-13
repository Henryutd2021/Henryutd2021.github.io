// Exercise the real filter against a small DOM; browser layout is checked separately.
"use strict";
const fs = require("fs"), path = require("path"), assert = require("assert");
const {env, load, active} = require("./stubdom.js");
assert(fs.existsSync(path.resolve(__dirname, "../../assets/learn/components/glossary-page.js")), "glossary filter component exists");
const E = env(), H = E.LX.H, listeners = {};
E.LX.ready = f => f(); E.window.addEventListener = (ev, f) => { listeners[ev] = f; };
const root = H("div", {"data-lx-glossary-page": ""}, E.body);
const input = H("input", {id: "glossary-filter", disabled: true}, root), reset = H("button", {id: "glossary-reset", disabled: true}, root);
const count = H("p", {id: "glossary-count"}, root), empty = H("p", {id: "glossary-empty", hidden: true}, root);
const rows = [
  ["power", "Power", "The rate of energy transfer.", [], "p"],
  ["time-of-use-tariff", "Time-of-use tariff", "Prices that vary by period.", ["time-of-use"], "t"],
  ["gitignore", ".gitignore", "A file that lists untracked files Git should ignore.", [], "symbols"]
];
const entries = rows.map(([id, name, definition, aliases, group]) => {
  const section = H("section", {class: "lx-glossary-group", id: "glossary-" + group}, root);
  const entry = H("article", {class: "lx-glossary-entry", id}, section);
  H("h3", {text: name}, entry); H("p", {class: "lx-glossary-definition", text: definition}, entry);
  aliases.forEach(a => H("span", {class: "lx-glossary-alias", id: a}, entry));
  return entry;
});
load("glossary-page", E);
const query = text => { input.value = text; input.fire("input"); };
assert(!input.disabled && !reset.disabled); assert.equal(count.textContent, "3 terms");
query(" ENERGY "); assert.deepEqual(entries.map(e => e.hidden), [false, true, true]); assert.equal(count.textContent, "1 of 3 terms");
query("time-of-use"); assert.deepEqual(entries.map(e => e.hidden), [true, false, true]);
query("gitignore"); assert.deepEqual(entries.map(e => e.hidden), [true, true, false]);
query("nothing matches"); assert(entries.every(e => e.hidden)); assert(!empty.hidden); assert.equal(count.textContent, "0 of 3 terms");
E.location.hash = "#time-of-use"; listeners.hashchange();
assert(!entries[1].hidden && !entries[1].parentNode.hidden, "a hash reveals an entry hidden by the filter");
assert.equal(active(), entries[1], "alias navigation focuses the canonical entry"); assert.equal(input.value, "");
query("power");
const same = H("a", {href: "#time-of-use"}, root); root.fire("click", {target: same});
assert(!entries[1].hidden, "clicking the current hash also reveals a filtered entry");
query("power"); input.fire("keydown", {key: "Escape"});
assert(entries.every(e => !e.hidden)); assert(empty.hidden); assert.equal(active(), input);
query("none"); reset.click(); assert.equal(count.textContent, "3 terms"); assert.equal(active(), input);
E.location.hash = "#%broken"; assert.doesNotThrow(() => listeners.hashchange(), "a malformed fragment is ignored");
query("power"); E.location.hash = "#glossary-t"; listeners.hashchange();
assert(entries.every(e => !e.hidden), "alphabet navigation restores a filtered group");
console.log("glossary filter: names, definitions, symbols, aliases, reset, Escape and filtered hash navigation passed");
