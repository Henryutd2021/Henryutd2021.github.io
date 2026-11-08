// test_path_scales.js — Node tests of the course's scale metadata (learn/path.yml `kind: scale` and each lesson's
// `scales`, as built into assets/learn/data/path.json and every lesson page's data block):
//   - five scales, S0 to S4 in order, with the names, short names and icons lesson F1 teaches; every icon exists
//   - every lesson names at least one scale that exists, each once; a tier's checkpoint names none; the toolbox has none
//   - each live lesson page's data block carries the same scales as path.json (the build is up to date; the build itself
//     compares every lesson's scales with its curriculum row)
//   - the course map draws the same layout with or without the scales (it has no scale view)
// Usage (from the site folder):  node _tests/learn/test_path_scales.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const SITE = path.resolve(__dirname, "..", "..");
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const P = JSON.parse(fs.readFileSync(path.join(SITE, "assets/learn/data/path.json"), "utf8"));
const F1 = JSON.parse(fs.readFileSync(path.join(SITE, "assets/learn/data/f01-five-scales.json"), "utf8"));
// the icon names LX.icon draws: the keys of core.js's LX.IC block
const IC = (() => { const src = fs.readFileSync(path.join(SITE, "assets/learn/components/core.js"), "utf8"), i = src.indexOf("LX.IC = {"), j = src.indexOf("\n  };", i);
  return new Set([...src.slice(i, j).matchAll(/\n\s+([a-z][a-z0-9]*):\s*'/g)].map(m => m[1])); })();

// ---------------- the five scales
const ids = P.scales.map(s => s.id);
ok(ids.join() === "S0,S1,S2,S3,S4", "five scales, S0 to S4 in order: " + ids.join());
ok(P.scales.every((s, i) => F1.scales[i] && s.id === F1.scales[i].id && s.title === F1.scales[i].name && s.short === F1.scales[i].short && s.icon === F1.scales[i].icon),
  "each scale has F1's name, short name and icon: " + P.scales.map(s => s.id + " " + s.title + " / " + s.short + " / " + s.icon).join("; "));
ok(IC.size > 20 && IC.has("gauge") && P.scales.every(s => IC.has(s.icon)), "every scale icon is drawn by LX.icon (" + IC.size + " icons): " + P.scales.filter(s => !IC.has(s.icon)).map(s => s.icon).join(", "));

// ---------------- every lesson's scales
const lessons = [].concat(P.starter, P.more);
const bad = lessons.filter(l => !Array.isArray(l.scales) || l.scales.some(x => ids.indexOf(x) < 0) || new Set(l.scales).size !== l.scales.length);
ok(bad.length === 0, "every lesson's scales exist, each once: " + bad.map(l => l.code || l.id).join(", "));
const cks = lessons.filter(l => l.form === "checkpoint" || /^CK-/.test(l.code || ""));
ok(cks.length === 4 && cks.every(l => l.scales.length === 0), "the four checkpoints name no scale (their curriculum rows name none)");
const none = lessons.filter(l => !(l.form === "checkpoint" || /^CK-/.test(l.code || "")) && l.scales.length === 0);
ok(none.length === 0, "every other lesson names at least one scale: " + none.map(l => l.code || l.id).join(", "));
ok(P.toolbox.every(t => t.scales === undefined), "the toolbox carries no scales");
// a few rows read from the curriculum: the primary scale first
const by = c => lessons.find(l => l.code === c) || P.starter.find(l => "T" + l.starter === c);
ok(by("F1").scales.join() === "S0,S1,S2,S3,S4" && by("SB4").scales.join() === "S4" && by("C4").scales.join() === "S4" && by("CR").scales.join() === "S0,S1,S2,S3,S4" &&
  by("A12").scales.join() === "S4,S2" && by("T2").scales.join() === "S2,S0" && by("M12").scales.join() === "S3" && by("CF4").scales.join() === "S4",
  "rows as the curriculum gives them (F1 all five, SB4 and C4 the nation, A12 S4 then S2, lesson 2 S2 then S0)");
// each scale has its sandbox and capstone
["S0", "S1", "S2", "S3", "S4"].forEach((s, i) => ok(by("SB" + i).scales.join() === s && by("C" + i).scales.join() === s, s + ": sandbox SB" + i + " and capstone C" + i));

// ---------------- the lesson pages carry the same scales
{
  let n = 0; const wrong = [], missing = [];
  lessons.filter(l => l.ready && l.id).forEach(l => {
    const f = path.join(SITE, "learn", l.href.replace(/\.html$/, ".qmd"));
    const m = fs.existsSync(f) && /<script type="application\/json" class="lx-lesson-data">([\s\S]*?)<\/script>/.exec(fs.readFileSync(f, "utf8"));
    if (!m) { missing.push(l.code || l.id); return; }
    n++;
    const rec = JSON.parse(m[1].replace(/<\\\//g, "</"));
    if (JSON.stringify(rec.scales) !== JSON.stringify(l.scales)) wrong.push(l.code || l.id);
  });
  ok(missing.length === 0, "every live lesson has a page with a data block: " + missing.join(", "));
  ok(n > 90 && wrong.length === 0, "each of " + n + " lesson pages carries path.json's scales: " + wrong.join(", "));
}

// ---------------- the course map ignores them
{
  const ctx = { window: { LX: {} }, module: { exports: {} } };
  vm.runInNewContext(fs.readFileSync(path.join(SITE, "assets/learn/components/metro.js"), "utf8"), ctx);
  const layout = ctx.module.exports.metroLayout, strip = x => { const c = JSON.parse(JSON.stringify(x)); c.scales = []; [].concat(c.starter, c.more).forEach(l => { l.scales = []; }); return c; };
  [["h", 1100], ["h", 760], ["v", 375]].forEach(([mode, W]) => {
    // the layout keeps each lesson's record; leave its scales out and compare everything else (positions, labels, rows)
    const drop = (k, v) => (k === "scales" ? undefined : v), a = JSON.stringify(layout(P, mode, { W }), drop), b = JSON.stringify(layout(strip(P), mode, { W }), drop);
    ok(a === b, "the course map's " + (mode === "h" ? "wide" : "narrow") + " layout at " + W + " px is the same with or without the scales");
  });
}
console.log((fails ? "FAILED " + fails + " of " : "ok: ") + checks + " checks (path scales)");
process.exit(fails ? 1 : 0);
