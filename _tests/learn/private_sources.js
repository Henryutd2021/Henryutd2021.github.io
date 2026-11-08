// private_sources.js — where the tests find the source files that are not in this repository. Not a test itself.
// Some tests compare a page with its sources: the approved wording of the research excerpts, the author's publication
// list (BibTeX), the course plan, the scope scan's word lists and the course build step. Those files live outside the
// site repository, so a test asks for them by name here:
//   const PRIV = require("./private_sources.js");
//   PRIV.path("excerpts")  -> the absolute path of that source, or null;   PRIV.read("excerpts") -> its text, or null
// Names: excerpts (the approved excerpt wording), publications (BibTeX of the author's papers), curriculum (the course
// plan), scope_terms (the deny-lists of the course's scope scan), build (the course build step's source).
// LEARN_SOURCES names a JSON file that maps each name to a path (absolute, or relative to the JSON file), for example
//   LEARN_SOURCES=/path/to/sources.json node _tests/learn/test_a07-flexible-demand.js
// Without LEARN_SOURCES, or for a name it does not map, or a path that does not exist, path() and read() give null,
// and each test checks against its own copy of the wording or skips that one check, and says so.
"use strict";
const fs = require("fs");
const path = require("path");
let MAP;
function map() {
  if (MAP !== undefined) return MAP;
  MAP = {};
  const f = process.env.LEARN_SOURCES;
  if (!f) return MAP;
  let m;
  try { m = JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { throw new Error("LEARN_SOURCES: cannot read a JSON map from " + f + " (" + e.message + ")"); }
  const base = path.dirname(path.resolve(f));
  Object.keys(m).forEach(k => { if (typeof m[k] === "string") MAP[k] = path.resolve(base, m[k]); });
  return MAP;
}
function sourcePath(name) {
  const p = map()[name];
  return p && fs.existsSync(p) ? p : null;
}
function read(name) {
  const p = sourcePath(name);
  return p ? fs.readFileSync(p, "utf8") : null;
}
// the "## " section of a Markdown text that holds the first `at`: from that section's heading to the next "## " heading
function section(md, at) {
  const i = md.indexOf(at);
  if (i < 0) return "";
  const a = md.lastIndexOf("\n## ", i) + 1, b = md.indexOf("\n## ", i + 1);
  return md.slice(a, b < 0 ? md.length : b);
}
// from the first `at` in a Markdown text to the next heading of any level (that heading's line excluded)
function block(t, at) {
  const i = t.indexOf(at);
  if (i < 0) return "";
  const j = t.indexOf("\n#", i + 1);
  return t.slice(i, j < 0 ? t.length : j + 1);
}
module.exports = { path: sourcePath, read, section, block };
