// e1_harness.js — shared setup for the tests of engine E1 and its pages (SB1, C1, M5), wave W3, 2026-11-03. Not a test
// itself (learn_qa.sh runs test_*.js only).
//   load()        the engine, its prepared data, the solver core with the vendored HiGHS, LX.ShareState's pure part
//   blocks(page, names)   the text between <!-- name:start --> and <!-- name:end --> markers
//   excerpts(page)        the approved-excerpt blockquotes: [{ source, sentences: [...], html }]
//   register(md, secs)    { "E8.2": sentence, ... } for the register's sections (excerpts_for_approval.md), revisions applied
//   portfolio(site)       the ResearchPortfolio folder (LEARN_PORTFOLIO, or the site's parent, or git's common dir)
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const cp = require("child_process");
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
async function load() {
  const ctx = { window: { LX: {} }, module: { exports: {} }, performance };
  vm.runInNewContext(fs.readFileSync(L("components/solver.js"), "utf8"), ctx);
  const { core, VERSION } = ctx.module.exports;
  const highs = await require(L(`vendor/highs-${VERSION}/highs.js`))();
  const E1 = require(L("components/engine-e1.js"));
  const cfg = JSON.parse(fs.readFileSync(L("data/e1-prairie-campus.json"), "utf8"));
  const P = E1.prepare(cfg);
  const SS = require(L("components/sharestate.js"));
  const solveSync = (m, o) => core.solveWith(highs, m, { timeLimit: (o && o.timeLimit) || 30, gap: o && o.gap });
  const solver = (m, o) => Promise.resolve(solveSync(m, o));
  return { SITE, L, E1, cfg, P, SS, core, highs, solveSync, solver };
}
function between(page, name) {
  const a = page.indexOf("<!-- " + name + ":start"), b = page.indexOf("<!-- " + name + ":end");
  if (a < 0 || b < 0) return null;
  const s = page.indexOf("-->", a) + 3;
  return { from: s + 1, to: b, text: page.slice(s + 1, b) };
}
function writeBlocks(file, blocks) {
  let q = fs.readFileSync(file, "utf8");
  Object.keys(blocks).forEach(k => { const r = between(q, k); if (!r) throw new Error("no " + k + " markers in " + file); q = q.slice(0, r.from) + blocks[k] + "\n" + q.slice(r.to); });
  fs.writeFileSync(file, q);
}
const norm = s => String(s).replace(/\[\[[a-z0-9-]+\|([^\]]+)\]\]/g, "$1").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'")
  .replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
function excerpts(page) {
  return [...page.matchAll(/<blockquote class="lx-excerpt" data-source="([^"]+)">([\s\S]*?)<\/blockquote>/g)].map(m => ({
    source: m[1], html: m[2], sentences: [...m[2].replace(/<footer>[\s\S]*?<\/footer>/, "").matchAll(/<p>([\s\S]*?)<\/p>/g)].map(x => norm(x[1])),
    footer: (m[2].match(/<footer>([\s\S]*?)<\/footer>/) || [])[1] || null }));
}
function portfolio() {
  const c = [process.env.LEARN_PORTFOLIO, path.join(SITE, "..")];
  try { c.push(path.resolve(SITE, cp.execSync("git rev-parse --git-common-dir", { cwd: SITE, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(), "..", "..")); } catch (e) { /* not a git checkout */ }
  return c.filter(Boolean).find(p => fs.existsSync(path.join(p, "reports/learn/excerpts_for_approval.md")));
}
function register(md, secs) {
  const out = {}; let sec = null;
  md.split("\n").forEach(line => {
    if (/^## /.test(line)) { const h = line.match(/^## (E\d+)\.|^## (Revisions after review)/); sec = h ? (h[1] || "REV") : null; return; }
    const m = line.match(/^\| (E(\d+)\.\d+) \| (.*) \|\s*$/);
    if (!m || !sec || secs.indexOf("E" + m[2]) < 0) return;
    const cells = m[3].split(" | ");
    if (sec === "REV") out[m[1]] = norm(cells[1]); else if (sec === "E" + m[2]) out[m[1]] = norm(cells[0]);
  });
  return out;
}
module.exports = { SITE, L, load, between, writeBlocks, norm, excerpts, portfolio, register };
