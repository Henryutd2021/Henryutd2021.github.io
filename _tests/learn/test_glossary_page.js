// The glossary's complete reference content must be in the HTML, before any browser script runs.
"use strict";
const fs = require("fs"), path = require("path"), assert = require("assert");
const ROOT = path.resolve(__dirname, "../.."), BASE = "https://henryutd2021.github.io/learn/glossary.html";
const read = p => fs.readFileSync(path.join(ROOT, p), "utf8");
assert(fs.existsSync(path.join(ROOT, "learn/glossary.qmd")), "a generated glossary reference page exists");
const SOURCE_ONLY = process.argv.includes("--source-only");
const G = JSON.parse(read("assets/learn/data/glossary.json")), q = read("learn/glossary.qmd"), h = SOURCE_ONLY ? q : read("_site/learn/glossary.html");
const decode = s => s.replace(/<[^>]+>/g, "").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&");
const E = [...h.matchAll(/<article class="lx-glossary-entry" id="([^"]+)"[^>]*>([\s\S]*?)<\/article>/g)];
assert.equal(E.length, 679, "all canonical entries readable without JavaScript");
const ids = [...h.matchAll(/(?<![\w-])id="([^"]+)"/g)].map(m => m[1]).filter(id => !["quarto-text-highlighting-styles", "quarto-bootstrap"].includes(id));   // Quarto repeats its theme stylesheet ids on every page
assert.equal(ids.length, new Set(ids).size, "all document anchors are unique");
const sets = [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1])).filter(d => d["@type"] === "DefinedTermSet");
assert.equal(sets.length, 1); const D = sets[0];
assert.equal(D["@id"], BASE + "#definedtermset"); assert.equal(D.hasDefinedTerm.length, 679);
for (const [, id, body] of E) {
  assert(G[id] && !G[id].alias); assert(!/<[^>]*\shidden(?:[\s=>])|style="[^"]*display:\s*none/.test(body), id + ": no hidden definition");
  const term = decode(body.match(/<h3[^>]*>([\s\S]*?)<\/h3>/)[1]);
  const definition = decode(body.match(/<p class="lx-glossary-definition">([\s\S]*?)<\/p>/)[1]);
  assert.equal(term, G[id].term); assert.equal(definition, G[id].short);
  assert(body.includes('href="' + G[id].href + '"'), id + ": ordinary teaching link");
  assert(/Learn in /.test(body));
  const d = D.hasDefinedTerm.find(t => t["@id"] === BASE + "#" + id);
  assert(d, id + ": canonical DefinedTerm"); assert.equal(d["@type"], "DefinedTerm");
  assert.equal(d.name, term); assert.equal(d.description, definition); assert.equal(d.url, BASE + "#" + id);
  assert.deepEqual(d.inDefinedTermSet, {"@id": D["@id"]});
}
for (const [id, g] of Object.entries(G)) {
  assert(ids.includes(id), id + ": resolvable term or alias anchor");
  if (g.alias) assert(E.find(e => e[1] === g.alias)[2].includes('id="' + id + '"'), id + ": alias sits inside canonical entry");
}
assert(/<label for="glossary-filter">Filter terms<\/label>/.test(h));
assert(/id="glossary-count"[^>]*role="status"/.test(h));
for (const letter of ["symbols", ..."abcdefghijklmnopqrstuvwxyz"]) assert(ids.includes("glossary-" + letter));
assert(/href="\.\.\/assets\/learn\/data\/glossary-export.json"/.test(q));
assert.equal((read("learn/index.qmd").match(/\]\(glossary.html\)/g) || []).length, 1, "one tidy index reference link");
console.log("glossary page: static definitions, 681 term anchors, A–Z, source/schema parity and teaching links; " + (SOURCE_ONLY ? "source checks passed (rendered HTML not checked)" : "all checks passed"));
