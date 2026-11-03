// test_metro_layout.js — Node tests of the course map's layout (metro.js LX.metroLayout; no browser needed; map v2,
// 2026-11-03). For the real path.json and for synthetic courses (the W3 density: about 20 more entries; the whole
// curriculum: about 120 stations; a fifth tier; a tier still to come), in the wide layout at three drawing widths and
// in the narrow one at three:
//   - every starter lesson is one route stop, every other lesson one station on its tier's line, the toolbox listed;
//   - each tier line carries its stations in curriculum order (modules by number, then unnumbered, bridges, news lens,
//     side topics, case files, sandboxes, checkpoint, capstones), following the line row by row;
//   - stations are inside the drawing and apart; route stops sit on their tier's route row (or column);
//   - no two labels overlap (names, numbers, codes, line labels, capsule text; widths estimated as in metro.js);
//   - a line's label counts what is drawn on it; kinds come from the form, else from the code.
// The browser test (test_metro_browser.js) repeats the overlap check with the real fonts.
// Usage (from the site folder):  node _tests/learn/test_metro_layout.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const SITE = path.resolve(__dirname, "..", "..");
let checks = 0, fails = 0;
function ok(cond, msg) { checks++; if (!cond) { fails++; console.log("FAIL:", msg); } }

const ctx = { window: { LX: {} }, module: { exports: {} } };
vm.runInNewContext(fs.readFileSync(path.join(SITE, "assets/learn/components/metro.js"), "utf8"), ctx);
const { metroLayout: layout, kindOf, summary } = ctx.module.exports;
const real = JSON.parse(fs.readFileSync(path.join(SITE, "assets/learn/data/path.json"), "utf8"));
const clone = x => JSON.parse(JSON.stringify(x));
// the same estimate metro.js uses without a browser (font: [size, width per character in em])
const EM = { label: [12.5, 0.57], code: [12, 0.6], tier: [12, 0.76], text: [12, 0.53], sub: [11.5, 0.6] };
const est = (t, f) => String(t).length * EM[f][0] * EM[f][1];

// ---------------- synthetic courses
function w3(P0) {   // wave W3's entries (F3-F7, A1, A2, A4, A7, A8, A14, A16, M4, M5, M7 live, SB0, SB1, C0, C1, CF1, K6)
  const P = clone(P0), live = (tier, code, title, form, tier2) => Object.assign({ tier, code, title, ready: true, href: code.toLowerCase() + ".html", scales: [], id: code.toLowerCase(), minutes: 25, form: form || "cards" }, tier2 ? { tier2 } : {});
  P.more = P.more.filter(m => !/^(Money over time|Techno-economic analysis of a project)/.test(m.title));
  [["foundations", "F3"], ["foundations", "F4"], ["foundations", "F5"], ["foundations", "F6"], ["foundations", "F7"],
   ["analyst", "A1"], ["analyst", "A2"], ["analyst", "A4"], ["analyst", "A7"], ["analyst", "A8"], ["analyst", "A14"], ["analyst", "A16"]]
    .forEach(([t, c]) => P.more.push(live(t, c, "Module " + c + ": a question title as long as the real ones are")));
  P.more.push(live("analyst", "CF1", "Where should a factory go when sun and wind are part of the decision?", "case"),
    live("analyst", "SB0", "Site Bench", "sandbox", "modeler"), live("analyst", "SB1", "Microgrid Workbench", "sandbox", "modeler"),
    live("analyst", "C0", "Behind one meter: what should one home or one plant install?", "capstone", "modeler"),
    live("analyst", "C1", "Keep the campus running: a microgrid for a three-day winter outage", "capstone", "modeler"));
  P.more.forEach(m => { if (["M4", "M5", "M7"].includes(m.code)) Object.assign(m, { ready: true, id: m.code.toLowerCase(), href: m.code.toLowerCase() + ".html", minutes: 40, form: "cards" }); });
  P.toolbox.forEach(t => { if (t.code === "K6") Object.assign(t, { ready: true, id: "k06", href: "k06.html" }); });
  return P;
}
function full(P0) {   // every module, checkpoint, capstone, case file and sandbox code of curriculum v2
  const P = w3(P0), have = new Set(P.more.map(m => m.code));
  P.more = P.more.filter(m => m.code);
  const up = (tier, code) => { if (!have.has(code)) P.more.push({ tier, code, title: "Item " + code + ": a long question title that runs to two lines on a phone", ready: false, href: "index.html#" + tier, scales: [] }); };
  [["foundations", "F", 11], ["analyst", "A", 22], ["modeler", "M", 14], ["researcher", "R", 10]].forEach(([t, l, n]) => { for (let i = 1; i <= n; i++) up(t, l + i); });
  [["foundations", ["X1", "X3"]], ["analyst", ["X2", "X4", "X5", "CK-A", "C3", "CF3", "CF4", "CF5", "CF8", "SB2", "SB3"]], ["modeler", ["C2", "C4", "SB4"]], ["researcher", ["X6", "CK-R", "CR"]]]
    .forEach(([t, cs]) => cs.forEach(c => up(t, c)));
  return P;
}
const five = clone(real);
five.tiers.push({ id: "extra", title: "Extra", level: "L5", slot: 5, icon: "flask", door: "A fifth line" });
five.more.push({ tier: "extra", title: "From a question to a paper", ready: false, href: "#", scales: [] }, { tier: "extra", code: "E1", title: "Peer review", ready: false, href: "#", scales: [] });
const soon = clone(real), resK = soon.tiers.findIndex(t => t.id === "researcher");
soon.tiers[resK].status = "upcoming"; soon.more.forEach(m => { if (m.tier === "researcher") m.ready = false; });
const empty = clone(real); empty.tiers.push({ id: "later", title: "Later", slot: 5, icon: "flask", status: "upcoming" });

// ---------------- the curriculum order the map must follow (written out again here, independently of metro.js)
function rank(m) {
  const c = m.code || "";
  if (!c) return [1, 0];
  if (/^CK-/.test(c)) return [7, 0];
  if (c === "CR") return [8, 99];
  const g = /^([A-Z]+)(\d+)$/.exec(c); if (!g) return [4.5, 0];
  const fam = { F: 0, A: 0, M: 0, R: 0, B: 2, N: 3, X: 4, CF: 5, SB: 6, C: 8 }[g[1]];
  return [fam == null ? 4.5 : fam, +g[2]];
}
const expected = (P, tid) => P.more.map((m, j) => ({ m, j })).filter(x => x.m.tier === tid)
  .sort((a, b) => rank(a.m)[0] - rank(b.m)[0] || rank(a.m)[1] - rank(b.m)[1] || a.j - b.j).map(x => x.j);

// ---------------- label boxes, as drawn by metro.js
function boxes(Lo) {
  const out = [], add = (x, y, w, h, what, anchor) => out.push({ x0: anchor === "middle" ? x - w / 2 : x, x1: anchor === "middle" ? x + w / 2 : x + w, y0: y - h, y1: y + 3, what });
  if (Lo.mode === "h") {
    Lo.stops.forEach(s => {
      add(s.x, s.y + s.lab0, est(String(s.i), "sub"), 9, "stop " + s.i + " number", "middle");
      s.lines.forEach((l, j) => add(s.x, s.y + s.lab0 + 15 + 14 * j, est(l, "label"), 10, "stop " + s.i + " name", "middle"));
    });
    Lo.own.forEach(o => { if (o.code) add(o.x, o.ly, est(o.code, "code"), 9, "code " + o.code, "middle"); });
    Lo.tiers.forEach(t => add(t.hx, t.hy, t.tw + 10 + t.sw, 10, t.title + " label"));
  } else {
    Lo.stops.forEach(s => { s.lines.forEach((l, j) => add(s.textX, s.ty + 15 * j, est(l, "label"), 10, "stop " + s.i)); add(s.textX, s.subY, est(s.lesson.minutes + " min · " + (s.lesson.ready ? "open now" : "coming soon"), "sub"), 9, "stop " + s.i + " minutes"); });
    Lo.own.forEach(o => {
      if (o.code) add(o.textX, o.ty, est(o.code, "code"), 10, "station " + o.code + " code");
      o.lines.forEach((l, j) => add(o.textX + (j ? 0 : o.cwd), o.ty + 15 * j, est(l, "label"), 10, "station " + (o.code || o.j)));
    });
    Lo.tiers.forEach(t => { add(t.hx, t.hy, est(t.head, "tier"), 10, t.title + " label"); t.sum.forEach((l, j) => add(t.hx, t.hy + 16 + 14 * j, est(l, "text"), 9, t.title + " count")); });
  }
  Lo.caps.forEach(c => add(c.tx, c.ty, est(c.text, "sub"), 9, "capsule " + c.i, "middle"));
  return out;
}
const hit = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

function check(P, label, mode, W) {
  const Lo = layout(P, mode, { W }), tag = `${label} ${mode} ${W}px`;
  if (mode === "h" && !Lo.fits) { ok(W < 1000, `${tag}: the wide layout fits (${Lo.why.join("; ")})`); return null; }
  ok(Lo.stops.length === P.starter.length && Lo.stops.every((s, i) => s.i === i && s.lesson === P.starter[i]), `${tag}: one route stop per starter lesson, in order`);
  const js = Lo.own.map(o => o.j).sort((a, b) => a - b);
  ok(js.length === P.more.length && js.every((j, i) => j === i), `${tag}: every other lesson is one station (${js.length} of ${P.more.length})`);
  ok(Lo.tools.length === (P.toolbox || []).length, `${tag}: the toolbox is listed`);
  ok(Lo.tiers.length === P.tiers.length, `${tag}: one line per tier`);
  ok(Lo.stations.every(s => s.x > 0 && s.x < Lo.W && s.y > 0 && s.y < Lo.H), `${tag}: every station inside the ${Lo.W} x ${Lo.H} drawing`);
  let minD = Infinity, pair = "";
  Lo.stations.forEach((a, i) => Lo.stations.forEach((b, j) => { if (i < j) { const d = Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r; if (d < minD) { minD = d; pair = (a.code || a.key) + "/" + (b.code || b.key); } } }));
  ok(minD >= 4, `${tag}: stations at least 4 px apart (${minD.toFixed(1)}, ${pair})`);
  ok(Lo.segs.length === P.starter.length - 1, `${tag}: the route joins consecutive stops`);
  ok(Lo.caps.length === P.starter.filter(l => l.tier2).length, `${tag}: one capsule per bridge lesson`);
  // route stops of one tier share a row (wide) or a column (narrow)
  P.tiers.forEach((t, k) => { const mine = Lo.stops.filter(s => s.row === k); ok(mine.every(s => (mode === "h" ? s.y === mine[0].y : s.x === mine[0].x)), `${tag}: ${t.title}'s route stops sit on one row`); });
  // each line in curriculum order, following the line row by row (rows alternate direction in the wide layout)
  P.tiers.forEach((t, k) => {
    const mine = Lo.own.filter(o => o.tier === k);
    const along = mode === "h" ? mine.slice().sort((a, b) => a.row - b.row || (a.row % 2 ? b.x - a.x : a.x - b.x)) : mine.slice().sort((a, b) => a.y - b.y);
    ok(JSON.stringify(along.map(o => o.j)) === JSON.stringify(expected(P, t.id)), `${tag}: the ${t.title} line follows curriculum order (${along.map(o => o.code || "·").join(" ")})`);
    if (mode === "v") ok(mine.every(o => o.x === Lo.tiers[k].x), `${tag}: ${t.title} stations sit on its column`);
    const T = Lo.tiers[k], live = mine.filter(o => o.m.ready).length;
    ok(T.summary === summary(t, mine.map(o => ({ m: o.m }))) && (mine.length === 0 || T.summary.indexOf(live ? live + " open" : (mine.length - live) + " coming soon") === 0),
      `${tag}: the ${t.title} label counts what is drawn ("${T.summary}"; ${live} of ${mine.length} open)`);
  });
  const bx = boxes(Lo);
  let clash = [];
  bx.forEach((a, i) => bx.forEach((b, j) => { if (i < j && hit(a, b)) clash.push(a.what + " / " + b.what); }));
  ok(!clash.length, `${tag}: no two labels overlap${clash.length ? " (" + clash.slice(0, 4).join("; ") + ")" : ""}`);
  ok(bx.every(b => b.x0 >= 0 && b.x1 <= Lo.W + 0.5), `${tag}: every label inside the drawing's width`);
  // codes and names keep clear of stations other than their own
  const shapes = Lo.stations.map(s => ({ x0: s.x - s.r - 2, x1: s.x + s.r + 2, y0: s.y - s.r - 2, y1: s.y + s.r + 2, what: s.code || s.key }));
  clash = [];
  bx.forEach(b => shapes.forEach(s => { if (hit(b, s) && b.what.indexOf(s.what) < 0) clash.push(b.what + " on " + s.what); }));
  ok(!clash.length, `${tag}: labels clear of other stations${clash.length ? " (" + clash.slice(0, 4).join("; ") + ")" : ""}`);
  return Lo;
}
const courses = [["course", real], ["W3 density", w3(real)], ["whole curriculum", full(real)], ["five tiers", five], ["researcher later", soon], ["empty tier", empty]];
courses.forEach(([label, P]) => {
  [1098, 951, 900].forEach(W => check(P, label, "h", W));
  [310, 450, 560].forEach(W => check(P, label, "v", W));
});
ok(layout(real, "h", { W: 1098 }).fits && layout(w3(real), "h", { W: 1098 }).fits && layout(full(real), "h", { W: 1098 }).fits, "the wide layout fits the course, W3 and the whole curriculum at 1098 px (a 1280 px window)");
// facts of the real course the map relies on
ok(real.tiers.length === 4 && real.tiers.map(t => t.title).join() === "Foundations,Analyst,Modeler,Researcher", "course: four tiers, Researcher last");
const R = layout(real, "h", { W: 1098 }).tiers[3], rmore = real.more.filter(m => m.tier === "researcher"), rlive = rmore.filter(m => m.ready).length;
ok(R.side === "none" && R.n === rmore.length && R.summary === rlive + " open" + (rmore.length > rlive ? " · " + (rmore.length - rlive) + " coming soon" : ""), `course: the Researcher line has no starter stops and carries its ${rmore.length} lessons ("${R.summary}")`);
ok(layout(soon, "h", { W: 1098 }).tiers[resK].summary === rmore.length + " coming soon", "a tier still to come: its line says how many are coming");
ok(layout(empty, "h", { W: 1098 }).tiers[4].summary === "coming later" && layout(empty, "h", { W: 1098 }).tiers[4].empty, "a tier with no lessons yet: an empty line that says it is coming later");
ok(layout(five, "h", { W: 1098 }).H > layout(real, "h", { W: 1098 }).H, "five tiers: the map grows a line");
// kinds: from the form; for an upcoming row without one, from its code
[[{ form: "studio" }, "studio"], [{ form: "case" }, "case"], [{ form: "checkpoint" }, "checkpoint"], [{ form: "sandbox" }, "sandbox"], [{ form: "capstone" }, "capstone"],
 [{ form: "play" }, "lesson"], [{ code: "R6" }, "studio"], [{ code: "CK-A" }, "checkpoint"], [{ code: "CF4" }, "case"], [{ code: "SB2" }, "sandbox"], [{ code: "C3" }, "capstone"],
 [{ code: "CR" }, "capstone"], [{ code: "M6" }, "lesson"], [{}, "lesson"]].forEach(([m, k]) => ok(kindOf(m) === k, `kind of ${JSON.stringify(m)} is ${k}`));
// the narrow layout's rows: names of starter stops and lessons wrap to two lines at most, upcoming ones to one
const V = layout(w3(real), "v", { W: 310 });
ok(V.stops.every(s => s.lines.length <= 2) && V.own.every(o => o.lines.length <= (o.m.ready ? 2 : 1)), "narrow: names wrap to two lines (upcoming: one), shortened with an ellipsis");
ok(V.own.filter(o => o.code).every(o => o.cwd > est(o.code, "code")) && V.own.filter(o => !o.code).every(o => !o.cwd), "narrow: a coded station's title starts after its code");

console.log(`${checks} checks, ${fails} failed`);
process.exit(fails ? 1 : 0);
