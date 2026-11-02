// test_learn_components.js — Node tests for the Learn component library and course data (no browser needed).
//   the bundle (assets/learn/learn.js) parses and holds every component; the CSS braces balance; every component file
//   starts with a header comment; the metro layout works for the real path.json and for a synthetic 4-tier course;
//   path.json matches the lesson pages; every glossary id marked in a lesson exists.
// Usage (from the site folder):  node _tests/learn/test_learn_components.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
let checks = 0, fails = 0;
function ok(cond, msg) { checks++; if (!cond) { fails++; console.log("FAIL:", msg); } }

// ---------------- the bundle and the component files
const comp = fs.readdirSync(L("components"));
const js = fs.readFileSync(L("learn.js"), "utf8"), css = fs.readFileSync(L("learn.css"), "utf8");
try { new vm.Script(js); ok(true, "learn.js parses"); } catch (e) { ok(false, "learn.js parses: " + e.message); }
comp.forEach(f => {
  const src = fs.readFileSync(L("components/" + f), "utf8");
  ok(/^\/[*/]/.test(src) && src.split("\n")[0].indexOf(f.replace(/\.(js|css)$/, "")) >= 0, `${f}: starts with a header comment naming the component`);
  ok((f.endsWith(".js") ? js : css).indexOf(src.trim().slice(0, 200)) >= 0, `${f}: included in the bundle`);
});
const depth = css.replace(/\/\*[\s\S]*?\*\//g, "").split("").reduce((d, ch) => d < 0 ? d : d + (ch === "{") - (ch === "}"), 0);
ok(depth === 0, "learn.css: braces balance");
["Scene", "Meters", "Slider", "DayChart", "Missions", "Stars", "Notes", "Coach", "StepCards", "Predict", "Guess", "ConceptMap", "Flowchart",
 "CompareTable", "CausalChain", "EnergyChain", "Metro", "metroLayout", "rich", "mount"].forEach(n => ok(js.indexOf("LX." + n + " = ") >= 0, `bundle defines LX.${n}`));

// ---------------- metro layout: real course, then a synthetic course with a fourth tier
const ctx = { window: { LX: {} }, module: { exports: {} } };
vm.runInNewContext(fs.readFileSync(L("components/metro.js"), "utf8"), ctx);
const layout = ctx.module.exports.metroLayout;
const pathJson = JSON.parse(fs.readFileSync(L("data/path.json"), "utf8"));
function checkLayout(P, label) {
  ["h", "v"].forEach(mode => {
    const Lo = layout(P, mode), st = Lo.stations;
    ok(st.length === P.starter.length && Lo.tiers.length === P.tiers.length && Lo.ext.length === P.tiers.length, `${label} ${mode}: one stop per starter lesson, one line per tier`);
    ok(st.every(s => s.x > 0 && s.x < Lo.W && s.y > 0 && s.y < Lo.H), `${label} ${mode}: every stop inside the map`);
    let minD = Infinity;
    st.forEach((a, i) => st.forEach((b, j) => { if (i < j) minD = Math.min(minD, Math.hypot(a.x - b.x, a.y - b.y)); }));
    ok(minD >= 40, `${label} ${mode}: stops at least 40 units apart (${minD.toFixed(0)})`);
    ok(Lo.segs.length === st.length - 1, `${label} ${mode}: the route joins consecutive stops`);
    const bridges = P.starter.filter(l => l.tier2).length;
    ok(Lo.caps.length === bridges, `${label} ${mode}: one capsule per bridge lesson (${bridges})`);
    st.forEach(s => { const t = Lo.tiers[s.row]; ok(mode === "h" ? s.y === t.y : s.x === t.x, `${label} ${mode}: stop ${s.i} sits on a tier line`); });
  });
}
checkLayout(pathJson, "course");
const four = JSON.parse(JSON.stringify(pathJson));
four.tiers.push({ id: "researcher", title: "Researcher", level: "L4", slot: 4, icon: "flask", door: "Ready for research" });
four.more.push({ tier: "researcher", title: "From a question to a paper" }, { tier: "researcher", title: "Peer review" });
checkLayout(four, "four tiers");
ok(layout(four, "h").H > layout(pathJson, "h").H, "four tiers: the map grows a line");
ok(layout(four, "h").ext[3].none && /2 Researcher lessons/.test(layout(four, "h").ext[3].label), "four tiers: an empty line says what is coming");

// ---------------- path.json and the pages
pathJson.starter.forEach(l => {
  if (l.ready) ok(fs.existsSync(path.join(SITE, "learn", l.href.replace(/\.html$/, ".qmd"))), `path.json: lesson ${l.starter} page exists`);
  ok(["play", "cards"].indexOf(l.form) >= 0 && typeof l.icon === "string", `path.json: lesson ${l.starter} has a form and an icon`);
});
ok(pathJson.tiers.every((t, i) => t.slot >= 1 && t.slot <= 5 && t.door && t.icon), "path.json: every tier has a colour slot, a door and an icon");

// ---------------- glossary marks
const gloss = JSON.parse(fs.readFileSync(L("data/glossary.json"), "utf8"));
const marks = [];
fs.readdirSync(path.join(SITE, "learn")).filter(f => f.endsWith(".qmd")).forEach(f => {
  const t = fs.readFileSync(path.join(SITE, "learn", f), "utf8");
  for (const m of t.matchAll(/(?:data-term|\bterm)="([^"]+)"/g)) marks.push([f, m[1]]);
});
fs.readdirSync(L(".")).filter(f => f.endsWith(".js") && f !== "learn.js").forEach(f => {
  for (const m of fs.readFileSync(L(f), "utf8").matchAll(/\[\[([a-z0-9-]+)\|/g)) marks.push([f, m[1]]);
});
ok(marks.length >= 5, `glossary: ${marks.length} marked terms found`);
marks.forEach(([f, id]) => ok(!!gloss[id], `glossary: ${f} marks '${id}', which exists`));

console.log(`${checks} checks, ${fails} failed`);
process.exit(fails ? 1 : 0);
