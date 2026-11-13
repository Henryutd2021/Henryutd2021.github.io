"use strict";
const assert = require("assert"), {env, load} = require("./stubdom.js");
(async () => {
  const E = env(), H = E.LX.H;
  E.LX.ready = f => f(); E.LX.base = "../assets/learn/"; E.LX.lesson = () => ({code: "K1"});
  E.LX.json = () => Promise.resolve({transfer: {term: "Transfer payment", short: "Money changing hands.", lesson: "A12", href: "a12-policy-instruments.html", alias: "transfer-payment"}, held: {term: "Held concept", short: "A concept from a held draft.", lesson: null}});
  const term = H("span", {class: "lx-term", "data-term": "transfer", text: "transfer"}, E.body);
  const held = H("span", {class: "lx-term", "data-term": "held", text: "held concept"}, E.body);
  term.getBoundingClientRect = () => ({left: 20, width: 60, top: 60, bottom: 80});
  held.getBoundingClientRect = term.getBoundingClientRect;
  load("glossary", E); await new Promise(r => setImmediate(r));
  term.fire("keydown", {key: "Enter"});
  const links = E.body.querySelectorAll("a");
  assert(links.some(a => a.textContent === "Taught in A12" && a.getAttribute("href").endsWith("learn/a12-policy-instruments.html")), "existing lesson route retained");
  assert(links.some(a => a.textContent === "More about this term" && a.getAttribute("href").endsWith("learn/glossary.html#transfer-payment")), "popover routes aliases to the canonical glossary entry");
  held.fire("keydown", {key: "Enter"});
  assert(!E.body.querySelectorAll("a").some(a => /More about|Taught in/.test(a.textContent)), "a held term exposes no lesson or nonexistent reference link");
  console.log("glossary popover: keyboard opening keeps lesson link and adds canonical reference link; held terms expose no destinations");
})().catch(e => { console.error(e); process.exitCode = 1; });
