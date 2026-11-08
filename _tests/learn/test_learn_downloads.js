// test_learn_downloads.js — the lesson data files that Learn pages offer for download (a link to
// ../assets/learn/data/<name>.json in learn/*.qmd) carry a reader-facing `dataset` block and no maintenance wording.
//   dataset: { creator, date (the data's last revision, YYYY-MM-DD), status (Illustrative, Simulated or Real ...),
//              source (how the numbers were produced), license (CC BY 4.0 for the course's own data; third-party values
//              keep their publishers' terms, named in the same line) }, among the file's first three keys
//   no string in the file reads as an instruction to the course's maintainers: no test or script paths, no "--write",
//   no "node <file>.js", no "never this block", no "do not edit by hand", no "written by the test"
// Also: the data files of A3, A5, A8, A9 and A12, read by their pages but not offered, carry no maintenance wording either.
// Not covered here: the shared data of Prairie City and Prairieland and of engines E3 and E4, whose `about` blocks
// are written by their own data builders.
// Run from the site folder: node _tests/learn/test_learn_downloads.js
"use strict";
const fs = require("fs"), path = require("path");
const SITE = path.resolve(__dirname, "..", "..");
const LEARN = path.join(SITE, "learn"), DATA = path.join(SITE, "assets/learn/data");
const NOT_COVERED = /^(e3-|e4-|prairie-city|prairieland)/;
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }

// every offered file, from the live pages' links
const offered = {};
fs.readdirSync(LEARN).filter(f => f.endsWith(".qmd")).forEach(f => {
  const q = fs.readFileSync(path.join(LEARN, f), "utf8");
  for (const m of q.matchAll(/href="\.\.\/assets\/learn\/data\/([a-z0-9_-]+)\.json"/g)) (offered[m[1]] = offered[m[1]] || []).push(f);
});
const names = Object.keys(offered).sort(), covered = names.filter(n => !NOT_COVERED.test(n));
ok(covered.length >= 24, "the offered files are found (" + covered.length + " covered, " + (names.length - covered.length) + " not covered)");

const MAINT = [
  [/_tests\//, "a test path"], [/--write\b/, "a write flag"], [/\bnode\s+\S+\.js\b/, "a node command"],
  [/never this block/i, "an editing rule"], [/do not edit by hand/i, "an editing rule"], [/(^|[\s("'`])scripts\//, "a script path"],
  [/\b(written|checked|re-?solved|recomputed|copied) by (the )?(same |Node )?tests?\b/i, "the test as an author"],
  [/\bthe (Node )?tests? (prove|re-?solves?|recomputes?|checks?|writes?)\b/i, "the test as an author"], [/\bvendored\b/i, "a build term"]
];
function strings(x, at, out) {
  if (typeof x === "string") out.push([at, x]);
  else if (Array.isArray(x)) { if (x.some(v => v && typeof v === "object" || typeof v === "string")) x.forEach((v, i) => strings(v, at + "[" + i + "]", out)); }
  else if (x && typeof x === "object") Object.keys(x).forEach(k => strings(x[k], at ? at + "." + k : k, out));
  return out;
}
const today = new Date().toISOString().slice(0, 10);
covered.forEach(n => {
  const p = path.join(DATA, n + ".json");
  ok(fs.existsSync(p), n + ".json exists (offered by " + offered[n].join(", ") + ")");
  if (!fs.existsSync(p)) return;
  const raw = fs.readFileSync(p, "utf8"), D = JSON.parse(raw), B = D.dataset;
  ok(B && typeof B === "object", n + ": has a dataset block");
  if (!B) return;
  ok(Object.keys(D).indexOf("dataset") <= 2, n + ": the dataset block is among the first three keys");
  ok(Object.keys(B).join() === "creator,date,status,source,license", n + ": dataset keys are creator, date, status, source, license (in order)");
  ok(B.creator === "Honglin Li", n + ": creator");
  ok(/^20\d\d-\d\d-\d\d$/.test(B.date) && B.date <= today, n + ": date is a revision date, not in the future (" + B.date + ")");
  ok(/^(Illustrative|Simulated|Real)\b/.test(B.status) && B.status.length > 20, n + ": status says illustrative, simulated or real");
  ok(typeof B.source === "string" && B.source.length > 20, n + ": source says how the numbers were produced");
  ok(/CC BY 4\.0 \(https:\/\/creativecommons\.org\/licenses\/by\/4\.0\/\), Honglin Li/.test(B.license), n + ": license names CC BY 4.0, its address and the creator");
  // third-party data named in the file are named in the license line, with their terms
  if (/\bEIA\b/.test(raw.replace(JSON.stringify(B), ""))) ok(/\bEIA\b.*public domain/.test(B.license), n + ": the license line gives EIA data's terms");
  if (/\bOpenAlex\b/.test(raw.replace(JSON.stringify(B), ""))) ok(/OpenAlex data are CC0/.test(B.license), n + ": the license line gives OpenAlex data's terms");
  strings(D, "", []).forEach(([at, s]) => MAINT.forEach(([rx, what]) => ok(!rx.test(s), n + ": " + at + " has no maintenance wording (" + what + "): " + s.slice(0, 120))));
});

// data files the pages read but do not offer, whose about lines once held maintenance wording: none of it may come back
const READ_ONLY = ["a03-market-design", "a05-adequacy", "a08-storage-duration", "a09-hazards", "a12-policy-instruments"];
READ_ONLY.forEach(n => {
  const D = JSON.parse(fs.readFileSync(path.join(DATA, n + ".json"), "utf8"));
  strings(D, "", []).forEach(([at, s]) => MAINT.forEach(([rx, what]) => ok(!rx.test(s), n + ": " + at + " has no maintenance wording (" + what + "): " + s.slice(0, 120))));
});

console.log("learn downloads: " + covered.length + " offered data files checked, " + (names.length - covered.length) + " not covered; " + checks + " checks, " + fails + " failed");
process.exit(fails ? 1 : 0);
