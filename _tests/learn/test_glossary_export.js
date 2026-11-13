// A glossary download is a reference vocabulary, not a lesson dataset.
"use strict";
const fs = require("fs"), path = require("path"), assert = require("assert");
const ROOT = path.resolve(__dirname, "../.."), BASE = "https://henryutd2021.github.io/learn/";
const read = p => fs.readFileSync(path.join(ROOT, p), "utf8");
assert(fs.existsSync(path.join(ROOT, "assets/learn/data/glossary-export.json")), "a separate glossary export exists");
const E = JSON.parse(read("assets/learn/data/glossary-export.json")), G = JSON.parse(read("assets/learn/data/glossary.json"));
assert.equal(E.format, "learn-glossary"); assert.equal(E.version, 1);
assert.equal(E.language, "en"); assert.equal(E.creator, "Honglin Li");
assert.equal(E.url, BASE + "glossary.html"); assert.equal(E.license, "https://creativecommons.org/licenses/by/4.0/");
assert.equal(E.terms.length, 679); assert.equal(new Set(E.terms.map(t => t.id)).size, 679);
assert(!E.dataset && !G.dataset, "neither glossary has a fake lesson dataset envelope");
const ids = [];
for (const t of E.terms) {
  assert(G[t.id] && !G[t.id].alias);
  assert.equal(t.term, G[t.id].term); assert.equal(t.definition, G[t.id].short);
  assert.equal(t.url, E.url + "#" + t.id);
  assert.equal(t.lesson.url, BASE + G[t.id].href);
  assert.equal(String(t.lesson.code), String(G[t.id].lesson));
  assert(fs.existsSync(path.join(ROOT, "learn", G[t.id].href.replace(/html$/, "qmd"))), t.id + ": teaching destination exists");
  assert(Array.isArray(t.sources), t.id + ": explicit sources array (empty when the lesson supplies context)");
  ids.push(t.id, ...t.aliases);
  for (const a of t.aliases) assert.equal(G[a].alias, t.id);
  for (const s of t.sources) { assert(s.title && /^https:\/\//.test(s.url)); }
}
assert.deepEqual(ids.sort(), Object.keys(G).sort()); assert.equal(ids.length, 681);
assert(E.terms.find(t => t.id === "long-duration-storage").sources.length > 0, "storage convention has its direct source");
console.log("glossary export: 679 canonical terms, 681 IDs, lesson URLs, aliases and sources; all checks passed");
