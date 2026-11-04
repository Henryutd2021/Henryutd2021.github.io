// e1_harness.js — shared setup for the tests of engine E1 and its pages (SB1, C1, M5), wave W3, 2026-11-03. Not a test
// itself (learn_qa.sh runs test_*.js only).
//   load()        the engine, its prepared data, the solver core with the vendored HiGHS, LX.ShareState's pure part
//   blocks(page, names)   the text between <!-- name:start --> and <!-- name:end --> markers
//   excerpts(page)        the approved-excerpt blockquotes: [{ source, sentences: [...], html }]
//   register(md, secs)    { "E8.2": sentence, ... } for the register's sections (excerpts_for_approval.md), revisions applied
//   portfolio(site)       the ResearchPortfolio folder (LEARN_PORTFOLIO, or the site's parent, or git's common dir)
//   fullYear(E1, P, plan, solveSync)   the plan's grid-connected year as one LP over all 8,760 hours of 2025 (W3 review
//                         SB1 5: the check of the 12 average days): { bill, status, unserved }
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
// the year on the grid hour by hour: the same rules as E1.yearModel (solar <= pv x sun, the 4-hour battery with 90% of a
// charge back, the feeder's limits, s + d + i = 1,200 + c + e), but over the 8,760 hours of 2025 in order, the battery's
// charge carried from hour to hour (and from 31 December back to 1 January); the sun per kW is LX.townProfile's, F7's
// method, rounded to 3 decimals as in the data file; unserved kWh cost $10, as in E1
let SUN_YEAR = null;
function fullYear(E1, P, st, solveSync) {
  if (!SUN_YEAR) {
    const PR = require(L("components/profiles.js"));
    const year = JSON.parse(fs.readFileSync(L("data/town_year.json"), "utf8")), targets = JSON.parse(fs.readFileSync(L("data/cf_targets.json"), "utf8"));
    SUN_YEAR = PR.townProfile("solar", 1, { year, targets, monthlyCF: true }).mw.map(x => +x.toFixed(3));
  }
  const V = [], C = [], eta = P.T.bat.eff, credit = P.cfg.grid.exportCredit / 100, N = SUN_YEAR.length;
  for (let t = 0; t < N; t++) {
    const h = t % 24, p = "h" + t;
    V.push({ name: p + "i", ub: st.imp, cost: E1.rate(P, st, h) / 100 }, { name: p + "e", ub: st.exp, cost: -credit }, { name: p + "s", ub: st.pv * SUN_YEAR[t] },
      { name: p + "c", ub: st.bat / 4, cost: E1.TIE.yearBattery }, { name: p + "d", ub: st.bat / 4, cost: E1.TIE.yearBattery }, { name: p + "q", ub: st.bat }, { name: p + "x", cost: 10 });
    C.push({ name: p + "bal", terms: [[p + "s", 1], [p + "d", 1], [p + "i", 1], [p + "x", 1], [p + "c", -1], [p + "e", -1]], eq: P.total });
    C.push({ name: p + "soc", terms: [[p + "q", 1], ["h" + ((t + N - 1) % N) + "q", -1], [p + "c", -eta], [p + "d", 1]], eq: 0 });
  }
  const r = solveSync({ sense: "min", variables: V, constraints: C }, { timeLimit: 120 });
  let bill = 0, unserved = 0;
  for (let t = 0; t < N; t++) { bill += E1.rate(P, st, t % 24) / 100 * r.values["h" + t + "i"] - credit * r.values["h" + t + "e"]; unserved += r.values["h" + t + "x"]; }
  return { status: r.status, bill, unserved, hours: N };
}
module.exports = { SITE, L, load, between, writeBlocks, norm, excerpts, portfolio, register, fullYear };
