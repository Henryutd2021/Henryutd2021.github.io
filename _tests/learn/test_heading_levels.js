// test_heading_levels.js — Node tests of LX.hTag (assets/learn/components/core.js), the level of a heading a script draws:
//   - right under the page title (a scene before the first section) an h3 becomes an h2, so the outline skips no level
//   - after a section's h2 it stays an h3; it is never made deeper than asked; an h4 after an h3 stays an h4
//   - headings inside the component's own box do not count, so sibling headings of one component share a level
//   - a box not on the page, or a page with no heading before the box, keeps the level asked for; template content is
//     not part of the outline
//   - the components and lesson scripts that draw a heading right under the page title take its level from LX.hTag
// The outline of the rendered pages, after their scripts have run, is checked in a browser.
// Usage (from the site folder):  node _tests/learn/test_heading_levels.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const SITE = path.resolve(__dirname, "..", "..");
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }

// a small tree with document order, enough for LX.hTag: contains, compareDocumentPosition, closest, querySelectorAll
class N {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.parentNode = null; }
  add(tag) { const c = new N(tag); c.parentNode = this; this.children.push(c); return c; }
  contains(o) { for (let e = o; e; e = e.parentNode) if (e === this) return true; return false; }
  order() { const out = []; (function walk(e) { out.push(e); e.children.forEach(walk); })(this.root()); return out; }
  root() { let e = this; while (e.parentNode) e = e.parentNode; return e; }
  compareDocumentPosition(o) { const all = this.order(); return all.indexOf(o) > all.indexOf(this) ? 4 : 2; }
  closest(sel) { for (let e = this; e; e = e.parentNode) if (e.tagName === sel.toUpperCase()) return e; return null; }
}
const CORE = fs.readFileSync(path.join(SITE, "assets/learn/components/core.js"), "utf8");
const src = (CORE.match(/LX\.hTag = function \(level, box\) \{[\s\S]*?\n  \};/) || [""])[0];
ok(src.length > 0, "core.js defines LX.hTag");
function page() {
  const html = new N("html"), body = html.add("body"), main = body.add("main");
  const document = { body, querySelectorAll: () => body.order().filter(e => /^H[1-6]$/.test(e.tagName)) };
  const LX = {}; vm.runInNewContext(src, { LX, document });
  return { LX, body, main };
}
{
  const P = page(); P.main.add("h1");
  const stage = P.main.add("div"), head = stage.add("div");
  ok(P.LX.hTag(3, head) === "h2", "right under the page title: an h3 becomes an h2");
  ok(P.LX.hTag(4, head) === "h2", "right under the page title: an h4 becomes an h2");
  ok(P.LX.hTag(2, head) === "h2", "an h2 asked for stays an h2");
  P.main.add("h2"); const later = P.main.add("div");
  ok(P.LX.hTag(3, later) === "h3", "after a section's h2: an h3 stays an h3");
  P.main.add("h3"); const deeper = P.main.add("div");
  ok(P.LX.hTag(3, deeper) === "h3" && P.LX.hTag(4, deeper) === "h4" && P.LX.hTag(5, deeper) === "h4", "after an h3: never deeper than asked, at most one below");
}
{
  const P = page(); P.main.add("h1");
  const zones = P.main.add("div"), z1 = zones.add("section"), z2 = zones.add("section");
  const t = P.LX.hTag(4, zones); z1.add(t); z2.add(t);
  ok(t === "h2" && P.LX.hTag(4, zones) === "h2", "headings inside the box do not count: sibling zones share a level");
}
{
  const P = page(); const loose = new N("div");
  ok(P.LX.hTag(3, loose) === "h3", "a box not on the page keeps the level asked for");
  const box = P.main.add("div");
  ok(P.LX.hTag(3, box) === "h3", "no heading before the box: the level asked for");
  const P2 = page(); P2.main.add("h1"); const tpl = P2.main.add("template"); tpl.add("h2"); const b2 = P2.main.add("div");
  ok(P2.LX.hTag(3, b2) === "h2", "a heading inside a template is not part of the outline");
}
// the scripts that draw a heading right under the page title take its level from LX.hTag
{
  const read = f => fs.readFileSync(path.join(SITE, "assets/learn", f), "utf8");
  [["components/timeline.js", /H\(LX\.hTag\(3, hd\), \{ text: o\.title \}, hd\)/], ["components/energychain.js", /H\(LX\.hTag\(3, hd\), \{ text: o\.title \}, hd\)/],
   ["components/flowchart.js", /H\(LX\.hTag\(3, hd\), \{ text: o\.title \}, hd\)/], ["components/conceptmap.js", /var tag = LX\.hTag\(3, hd\), sub = "h" \+ \(\+tag\.charAt\(1\) \+ 1\)/],
   ["10-write-it-down.js", /H\(LX\.hTag\(3, sh\)/], ["12-trade-offs.js", /H\(LX\.hTag\(3, hd\)/], ["a04-retail-tariffs.js", /title = H\(LX\.hTag\(3, sh\), null, sh\)/],
   ["a07-flexible-demand.js", /title = H\(LX\.hTag\(3, sh\), null, sh\)/], ["a10-emissions-questions.js", /title = H\(LX\.hTag\(3, head\), null, head\)/],
   ["a12-policy-instruments.js", /title = H\(LX\.hTag\(3, sh\), null, sh\)/], ["a18-city-plan.js", /title = H\(LX\.hTag\(3, head\), null, head\)/],
   ["k08-git-notebooks.js", /var zt = LX\.hTag\(4, zones\)/], ["r07-cost-carbon-properly.js", /H\(LX\.hTag\(3, paper\), \{ text: D\.study\.title \}, paper\)/]
  ].forEach(([f, rx]) => ok(rx.test(read(f)), f + ": the heading's level comes from LX.hTag"));
  ok(/H\(sub, \{ text: n\.label \}, det\)/.test(read("components/conceptmap.js")), "conceptmap.js: the panel's heading is one level below the map's title");
}
console.log((fails ? "FAILED " + fails + " of " : "ok: ") + checks + " checks (heading levels)");
process.exit(fails ? 1 : 0);
