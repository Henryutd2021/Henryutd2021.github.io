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
 "CompareTable", "CausalChain", "EnergyChain", "Metro", "metroLayout", "rich", "mount", "solver", "SolverStatus", "townProfile", "cfScale",
 // promoted at the W1 merge (2026-11-02)
 "demo", "demoState", "Plot", "PlotCard", "Scatter", "PriceChart", "HourPicker", "Tornado", "CostSplit", "SupplyStack", "Frontier", "Steelman",
 "Boundary", "Share", "copyText", "LPPlane", "lp2", "CardSort", "LinkedViews", "Toggle", "EquationCard", "FormulateBox", "Formulation",
 "Network", "Checklist", "EvidenceLadder", "PhraseTagger", "UnitChain", "EvidenceClock", "Checkpoint", "Sheet", "Practice",
 // added in wave W2 (2026-11-03)
 "Exemplars", "Rubric", "QuestionCard", "Timeline", "townPlan",
 // promoted at the W2 integration (2026-11-03)
 "lessonRef", "lessonRefHTML", "ScaleStrip", "Stakeholders", "StakeholderMap", "WeekStrip"].forEach(n => ok(js.indexOf("LX." + n + " = ") >= 0, `bundle defines LX.${n}`));

// ---------------- no lesson defines its own copy of a shared component (W1 merge)
const lessonJs = fs.readdirSync(L(".")).filter(f => /^[0-9a-z-]+\.js$/.test(f) && f !== "learn.js");
const copies = /\bfunction (plot|LineChart|Scatter|StackChart|FrontierChart|Steelman|Boundary|JobSorter|Plane|EquationCard|Formulation|Network|PriceChart|HourPicker|Practice|Slider|Stakeholders|StakeholderMap|ScaleStrip|WeekStrip|readCheck|refHTML)\s*\(|W1F\.(LPPlot|Views|CardSort|Ctl|Toggle|EquationCard|FormulateBox)\s*=|LX\.Checklist\s*=/;
lessonJs.forEach(f => {
  const src = fs.readFileSync(L(f), "utf8"), rx = new RegExp(copies.source, "g"), bad = [];
  let m; while ((m = rx.exec(src))) { const name = m[1] || m[2] || "Checklist", body = src.slice(m.index, m.index + 500);
    if (!(m[1] && new RegExp("LX\\." + name + "\\b").test(body))) bad.push(m[0]); }   // a thin adapter that calls LX.<Name> is fine
  ok(!bad.length, `${f}: no lesson-local copy of a shared component${bad.length ? " (" + bad.join(", ") + ")" : ""}`);
});

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
ok(pathJson.tiers.length === 4 && pathJson.tiers.map(t => t.title).join() === "Foundations,Analyst,Modeler,Researcher", "course: four tiers, Researcher last");
const res = pathJson.tiers.find(t => t.id === "researcher"), resK = pathJson.tiers.indexOf(res);
// the Researcher tier went live with the W2 studios (2026-11-03): no starter stops, so its line counts its open lessons
const resMore = pathJson.more.filter(m => m.tier === "researcher"), resLive = resMore.filter(m => m.ready).length;
ok(res && res.status !== "upcoming" && layout(pathJson, "h").ext[resK].none && !layout(pathJson, "h").ext[resK].upcoming && resLive > 0 &&
   layout(pathJson, "h").ext[resK].label === resLive + " Researcher lessons open" + (resMore.length > resLive ? ", " + (resMore.length - resLive) + " in preparation" : ""),
   "course: the Researcher line has no starter stops, is live, and counts its open lessons (" + layout(pathJson, "h").ext[resK].label + ")");
const soonT = JSON.parse(JSON.stringify(pathJson)); soonT.tiers[resK].status = "upcoming"; soonT.more.forEach(m => { if (m.tier === "researcher") m.ready = false; });
ok(/^10 Researcher lessons, coming later$/.test(layout(soonT, "h").ext[resK].label) && layout(soonT, "h").ext[resK].upcoming, "course: an upcoming tier with no open lesson still says it is coming later");
const extra = JSON.parse(JSON.stringify(pathJson));
extra.tiers.push({ id: "extra", title: "Extra", level: "L5", slot: 5, icon: "flask", door: "A fifth line" });
extra.more.push({ tier: "extra", title: "From a question to a paper" }, { tier: "extra", title: "Peer review" });
checkLayout(extra, "five tiers");
ok(layout(extra, "h").H > layout(pathJson, "h").H, "five tiers: the map grows a line");
ok(layout(extra, "h").ext[4].none && /2 Extra lessons in preparation/.test(layout(extra, "h").ext[4].label), "five tiers: an empty line says what is coming");
// off-path lessons: every live one has a page; every W1 module of curriculum v2 is on the map with its code
(pathJson.more || []).filter(m => m.ready).forEach(m => ok(fs.existsSync(path.join(SITE, "learn", m.href.replace(/\.html$/, ".qmd"))), `path.json: ${m.code || m.title} page exists`));
["N1", "CK-F", "B1", "B2", "B3", "M1"].forEach(c => ok(pathJson.more.some(m => m.code === c && m.id), `path.json: W1 module ${c} is listed with an id`));
["K4", "K7"].forEach(c => ok(pathJson.toolbox.some(t => t.code === c && t.id), `path.json: toolbox ${c} is listed with an id`));
const pathYml = fs.readFileSync(path.join(SITE, "learn/path.yml"), "utf8");
ok(/id: 00-grid-operator[\s\S]*?status: active/.test(pathYml), "path.yml: lesson 0 stays active");

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
