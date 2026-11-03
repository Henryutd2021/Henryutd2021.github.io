// test_cf2-cost-per-kg-vs-system-cost.js — Node tests for case file CF2 (assets/learn/cf2-cost-per-kg-vs-system-cost.js,
// its data file and the page, a draft in learn/_drafts/ until Henry approves the excerpts):
//   - the toy (illustrative): block hours fall, each block's own cost per kg rises, the average cost per kg (LCOH) rises
//     with size, the lowest net cost sits where the last block's cost per kg is below the price and the next one's above,
//     and a higher price gives a bigger electrolyzer with a higher LCOH and a lower net cost
//   - the allow-listed explainer (assets/explainers/wind-hydrogen.js) moves the same way, as the page says
//   - every number on the page (comparison table, myth answers, numbers to remember) matches the model or the data file
//   - the three no-JS blocks (timeline, toy, boundary) equal what the components write from the data (--write rewrites them)
//   - excerpts: only this case file's approved source keys; with LEARN_EXCERPTS=<path to excerpts_for_approval.md> (or
//     ../reports/learn/excerpts_for_approval.md from the site folder), every excerpt sentence on the page is listed there
//   - text budget of the case parts, links (doi.org, the allow-listed repository, learn pages only)
// Usage (from the site folder):  node _tests/learn/test_cf2-cost-per-kg-vs-system-cost.js [--write]
"use strict";
const fs = require("fs");
const path = require("path");
const ID = "cf2-cost-per-kg-vs-system-cost";
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const M = require(L(ID + ".js"));
const TL = require(L("components/timeline.js"));
const EX = require(path.join(SITE, "assets/explainers/wind-hydrogen.js"));
const D = JSON.parse(fs.readFileSync(L("data/" + ID + ".json"), "utf8"));
const QPATH = [path.join(SITE, "learn", ID + ".qmd"), path.join(SITE, "learn/_drafts", ID + ".qmd")].find(p => fs.existsSync(p));
const I = D.idea;
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-9 : t);

// ---------------- the no-JS blocks: write (--write) or check
const BLOCKS = {
  "cf2-timeline": () => TL.staticHTML(D.timeline.events),
  "cf2-idea": () => M.staticIdea(I),
  "cf2-bound": () => M.staticBoundary(D.boundary)
};
function between(q, name) {
  const a = q.match(new RegExp("<!-- " + name + ":start[^>]*-->\\n")), b = q.indexOf("<!-- " + name + ":end -->");
  if (!a || b < a.index) throw new Error(name + " markers missing in " + QPATH);
  return { from: a.index + a[0].length, to: b };
}
if (process.argv.includes("--write")) {
  let q = fs.readFileSync(QPATH, "utf8");
  Object.keys(BLOCKS).forEach(k => { const r = between(q, k); q = q.slice(0, r.from) + BLOCKS[k]() + "\n" + q.slice(r.to); });
  fs.writeFileSync(QPATH, q);
  console.log("no-JS blocks written: " + Object.keys(BLOCKS).join(", "));
}
const PAGE = fs.readFileSync(QPATH, "utf8");
Object.keys(BLOCKS).forEach(k => { const r = between(PAGE, k); ok(PAGE.slice(r.from, r.to) === BLOCKS[k]() + "\n", k + " block is up to date (run with --write)"); });
const text = s => s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

// ---------------- the toy model
const B = M.blocks(I), N = B.length;
ok(N === 8 && B.every((b, k) => k === 0 || b.hours < B[k - 1].hours), "eight blocks, each running fewer full-power hours than the one below");
ok(B.every((b, k) => k === 0 || b.perKg > B[k - 1].perKg), "each added block's own cost per kg is higher");
ok(near(B[0].kg, 900000) && near(B[0].perKg, 1400000 / 900000 + 0.2), "block 1: 10 MW x 5,000 h x 18 kg/MWh = 900,000 kg at $1.76/kg");
for (let n = 2; n <= N; n++) ok(M.design(I, 4, n).lcoh > M.design(I, 4, n - 1).lcoh, "LCOH rises from " + (n - 1) + " to " + n + " blocks");
const want = { 3: 40, 4: 50, 5: 60 }, lcohAt = { 3: 2.19, 4: 2.36, 5: 2.53 }, netAt = { 3: "−$2.26M", 4: "−$5.31M", 5: "−$8.88M" };
I.prices.forEach(p => {
  const b = M.best(I, p), n = b.net.n;
  ok(b.net.mw === want[p], "at $" + p + "/kg the lowest net cost is at " + want[p] + " MW (got " + b.net.mw + ")");
  ok(B[n - 1].perKg < p && (n === N || B[n].perKg > p), "at $" + p + "/kg: the last block built is below the price, the next above");
  ok(b.lcoh.n === 1 && near(b.lcoh.lcoh, B[0].perKg), "at $" + p + "/kg the lowest cost per kg is the smallest size, 10 MW");
  ok(M.usd2(b.net.lcoh) === "$" + lcohAt[p].toFixed(2), "at $" + p + "/kg the best size's LCOH is $" + lcohAt[p].toFixed(2) + " (got " + M.usd2(b.net.lcoh) + ")");
  ok(M.musd(b.net.net) === netAt[p], "at $" + p + "/kg the best net cost change is " + netAt[p] + " (got " + M.musd(b.net.net) + ")");
  for (let k = 0; k <= N; k++) ok(M.design(I, p, k).net >= b.net.net - 1e-6, "at $" + p + "/kg no size beats the best net cost (" + k + " blocks)");
});
ok(M.best(I, 3).net.lcoh < M.best(I, 4).net.lcoh && M.best(I, 4).net.lcoh < M.best(I, 5).net.lcoh && M.best(I, 3).net.net > M.best(I, 4).net.net && M.best(I, 4).net.net > M.best(I, 5).net.net,
  "a higher price: bigger electrolyzer, higher LCOH, lower net cost (the case's pattern, in the toy)");
ok(M.design(I, 4, 0).net === 0 && M.design(I, 4, 0).lcoh === null, "no electrolyzer: no change, no LCOH");
ok(I.prices.indexOf(I.startPrice) >= 0 && I.startBlocks >= 0 && I.startBlocks <= N, "start state inside the controls");
ok(near(M.design(I, 4, 6).net - M.design(I, 4, 5).net, 1400000 - 3.8 * 360000, 1e-6) && M.design(I, 4, 6).net > M.design(I, 4, 5).net,
  "at $4/kg the sixth block ($4.09/kg) raises the net cost slightly");

// ---------------- the allow-listed explainer shows the same mechanism (stylized)
const lo = EX.model({ price: EX.C.pMin }), hi = EX.model({ price: EX.C.pMax });
ok(hi.size > lo.size && hi.lcoh > lo.lcoh && hi.netCost < lo.netCost, "explainer: a higher price gives a bigger electrolyzer, higher LCOH and lower net system cost");
ok(EX.C.ce === I.annualCostPerMW && EX.C.eta === I.kgPerMWh && EX.C.v === I.variableCostPerKg, "toy and explainer share the stylized cost, yield and variable cost");

// ---------------- numbers on the page
const T = text(PAGE);
ok(/10 MW makes the cheapest kilogram \(\$1\.76\), but 50 MW gives the lowest net cost/.test(T) && M.usd2(B[0].perKg) === "$1.76" && M.best(I, 4).net.mw === 50, "myth 1 numbers = the toy at $4.00/kg");
ok(/Best size at \$4\.00\/kg">10 MW</.test(PAGE) && /Best size at \$4\.00\/kg">50 MW</.test(PAGE) && I.startPrice === 4, "comparison table: 10 MW and 50 MW at $4.00/kg");
D.facts.forEach(f => {
  const row = PAGE.indexOf('<td class="n">' + f.n + "</td><td>" + f.what + "</td>");
  ok(row >= 0, "numbers to remember: '" + f.n + "' row matches the data file");
  ok(row >= 0 && PAGE.slice(row, row + 600).indexOf(f.url) >= 0 && PAGE.slice(row, row + 600).indexOf(f.asof) >= 0, "numbers to remember: '" + f.n + "' carries its source and date");
});
ok(/reduced total system cost by about 7%/.test(T) && /reduced it by about 26%/.test(T) && /fell by about 2%/.test(T) && /about 10%/.test(T), "facts agree with the excerpts");
ok(/about 10% lower turbine upkeep cut the cost per kilogram of hydrogen by about 2%/.test(T), "myth 2 uses the excerpt's numbers");

// ---------------- excerpts and sources
const allowed = ["excerpt:wind-hydrogen", "excerpt:solar-hydrogen", "excerpt:offshore-om"];
const keys = [...PAGE.matchAll(/data-source="([^"]+)"/g)].map(m => m[1]);
ok(keys.length === 3 && keys.every(k => allowed.indexOf(k) >= 0), "excerpts use only CF2's approved source keys (" + keys.join(", ") + ")");
const sentences = [...PAGE.matchAll(/<blockquote class="lx-excerpt"[^>]*>([\s\S]*?)<footer>/g)].flatMap(m => [...m[1].matchAll(/<p>([\s\S]*?)<\/p>/g)].map(x => text(x[1])));
ok(sentences.length === 6, "six excerpt sentences on the page (got " + sentences.length + ")");
const EXF = process.env.LEARN_EXCERPTS || path.join(SITE, "..", "reports/learn/excerpts_for_approval.md");
if (fs.existsSync(EXF)) {
  const ap = fs.readFileSync(EXF, "utf8").replace(/\s+/g, " ");
  sentences.forEach(s => ok(ap.indexOf(s) >= 0, "excerpt sentence listed for approval: " + s.slice(0, 60)));
} else console.log("note: excerpts_for_approval.md not found (set LEARN_EXCERPTS); excerpt sentences not cross-checked");
// the page's own links (the generated header, next box and footer are build_learn.py's and checked by the scope scan)
const OWN = PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?<!-- learn:\1:end -->/g, "");
const hrefs = [...OWN.matchAll(/href="([^"]+)"/g)].map(m => m[1]);
ok(hrefs.every(h => /^https:\/\/doi\.org\/10\./.test(h) || h === "https://github.com/Henryutd2021/reopt-hydrogen-framework" || /^[0-9a-z-]+\.html$/.test(h) || /^\.\.\/assets\//.test(h) || /^#/.test(h)),
  "links: doi.org, the allow-listed repository and learn pages only");
ok(!/projects\/|research\.html/.test(PAGE), "no project page and no Research page");
ok(TL.validate(D.timeline.events).length === 0 && D.timeline.events.every(e => e.source && e.source.label), "every timeline event has a valid date and a source");
ok(D.timeline.events.filter(e => /doi\.org/.test((e.source || {}).url || "")).every(e => hrefs.indexOf(e.source.url) >= 0), "every study in the timeline is in the sources list");

// ---------------- text budget: each case part (without its excerpt) stays short
[...PAGE.matchAll(/<div class="lx-case-part[^"]*">([\s\S]*?)<\/div>\n/g)].forEach((m, i) => {
  const words = text(m[1].replace(/<blockquote[\s\S]*?<\/blockquote>/g, "")).split(" ").length;
  ok(words <= 60, "case part " + (i + 1) + " has " + words + " words (60 at most, excerpts excluded)");
});

console.log((fails ? "FAILED " + fails + " of " : "ok: ") + checks + " checks (" + ID + ")");
process.exit(fails ? 1 : 0);
