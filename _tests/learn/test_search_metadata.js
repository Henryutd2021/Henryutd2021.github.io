// Search metadata is a separate surface: it must never replace the visible lesson heading or approved description.
"use strict";
const fs = require("fs"), path = require("path"), assert = require("assert");
const SITE = path.resolve(__dirname, "../.."), BASE = "https://henryutd2021.github.io";
const SOURCE_ONLY = process.argv.includes("--source-only");
const read = p => fs.readFileSync(path.join(SITE, p), "utf8");
const registryPath = path.join(SITE, "learn/search-metadata.json");
assert(fs.existsSync(registryPath), "the generator-owned search metadata registry exists");
const R = JSON.parse(read("learn/search-metadata.json"));
const G = JSON.parse(read("assets/learn/data/glossary.json"));
const front = s => Object.fromEntries([...s.split("\n---")[0].matchAll(/^([\w-]+): (".*")$/gm)].map(m => [m[1], JSON.parse(m[2])]));
const ld = s => [...s.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]));
const decode = s => s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([a-f\d]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const norm = s => decode(s.replace(/<[^>]*>/g, "")).replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();
const sq = x => String(x || "").replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"');   // Quarto renders straight quotes as typographic ones
const meta = (s, key) => { const m = s.match(new RegExp('<meta (?:name|property)="' + key + '" content="([^"]*)"')); return m && decode(m[1]); };
assert.equal(R.version, 1);
const names = Object.keys(R.pages);
assert.equal(names.filter(n => n !== "glossary.qmd").length, 114, "all existing Learn pages have search metadata");
assert.equal(new Set(names.map(n => R.pages[n].pagetitle)).size, names.length, "search titles are unique");
let resources = [];
for (const name of names) {
  const entry = R.pages[name], q = read("learn/" + name), fm = front(q), h = SOURCE_ONLY ? q : read("_site/learn/" + name.replace(/qmd$/, "html"));
  for (const key of ["pagetitle", "description-meta"]) assert.equal(fm[key], entry[key], name + ": generated " + key);
  for (const social of ["open-graph", "twitter-card"]) assert.equal(JSON.parse(q.match(new RegExp('^' + social + ': (.*)$', 'm'))[1]).description, entry["description-meta"], name + ": generated social description");
  if (!SOURCE_ONLY) {
  assert.equal(norm(h.match(/<title>([\s\S]*?)<\/title>/)[1]), norm(entry.pagetitle + " – Honglin Li"), name + ": search title");
  assert.equal(norm(h.match(/<h1[^>]*class="title"[^>]*>([\s\S]*?)<\/h1>/)[1]), norm(fm.title), name + ": visible H1 stays original");
  if (fm.subtitle) assert.equal(norm(h.match(/<p class="subtitle[^\"]*">([\s\S]*?)<\/p>/)[1]), norm(fm.subtitle), name + ": subtitle stays original");
    assert.equal(sq(meta(h, "description")), sq(entry["description-meta"]), name + ": meta description");
  assert.equal(sq(meta(h, "og:description")), sq(entry["description-meta"]), name + ": social description");
  if (meta(h, "twitter:description")) assert.equal(sq(meta(h, "twitter:description")), sq(entry["description-meta"]), name + ": twitter description");
  assert(!/<meta name="keywords"/.test(h), "no meta keyword lists");
  }
  assert(entry.concepts.length >= 3 && entry.concepts.length <= 6, name + ": curated concept count");
  assert.equal(new Set(entry.concepts).size, entry.concepts.length, name + ": no duplicate concepts");
  for (const id of entry.concepts) assert(G[id] && !G[id].alias, name + ": canonical glossary concept " + id);
  const lr = ld(h).filter(x => x["@type"] === "LearningResource");
  if (["index.qmd", "regions.qmd", "glossary.qmd"].includes(name)) { assert.equal(lr.length, 0); continue; }
  assert.equal(lr.length, 1, name + ": one LearningResource");
  const l = lr[0], url = BASE + "/learn/" + name.replace(/qmd$/, "html");
  resources.push(l);
  assert.equal(l["@id"], url + "#learningresource");
  assert.equal(l.url, url);
  assert.deepEqual(l.isPartOf, {"@id": BASE + "/learn/#course"});
  assert.deepEqual(l.about, entry.concepts.map(id => ({"@type": "DefinedTerm", "@id": BASE + "/learn/glossary.html#" + id})));
  assert.deepEqual(l.keywords, entry.concepts.map(id => G[id].term));
  assert(l.teaches.length > 0 && l.teaches.every(s => typeof s === "string" && s.trim()), name + ": nonempty outcomes");
  assert.equal(l.description, fm.description, name + ": approved full description retained in JSON-LD");
  assert.equal(l.isAccessibleForFree, true); assert.equal(l.inLanguage, "en");
}
assert.equal(resources.length, 112);
const courses = names.flatMap(n => ld(read(SOURCE_ONLY ? "learn/" + n : "_site/learn/" + n.replace(/qmd$/, "html")))).filter(x => x["@type"] === "Course");
assert.equal(courses.length, 1, "the Course is defined once, on the index");
const course = courses[0];
assert.equal(course["@id"], BASE + "/learn/#course"); assert.equal(course.url, BASE + "/learn/");
assert.equal(course.name, "Energy Systems, Step by Step"); assert(course.description.length > 20);
for (const key of ["author", "provider"]) {
  assert.equal(course[key]["@id"], BASE + "/#person");
  assert.equal(course[key].name, "Honglin Li");
  assert.equal(course[key].url, BASE + "/");
}
assert.equal(course.inLanguage, "en"); assert.equal(course.isAccessibleForFree, true);
assert.equal(course.license, "https://creativecommons.org/licenses/by/4.0/");
assert.deepEqual(course.hasPart.map(x => x["@id"]).sort(), resources.map(x => x["@id"]).sort());
console.log("search metadata: 114 existing pages + glossary; 112 connected LearningResources; one Course; " + (SOURCE_ONLY ? "source checks passed (rendered HTML not checked)" : "all checks passed"));
