// test_cf7-cost-of-waiting.js — Node tests for case file CF7 (assets/learn/cf7-cost-of-waiting.js, its data file and
// the page, a draft in learn/_drafts/ until Henry approves the excerpt):
//   - the toy (illustrative): present-value identities, accounts that grow with the wait, a tariff that moves cost
//     between accounts without changing the total, bridge power that lowers the developer's cost and adds a social cost
//   - every number on the page (comparison table, myth answers, numbers to remember) matches the model or the data file
//   - the three no-JS blocks (timeline, toy, boundary) equal what the components write from the data (--write rewrites them)
//   - scope (guard G-DC): data centers only as loads; no nuclear technology anywhere on the page, in the data or the script;
//     no "AI"; delay economics only
//   - excerpts: only excerpt:code; with LEARN_EXCERPTS (or ../reports/learn/excerpts_for_approval.md) every excerpt
//     sentence and the question are listed there
// Usage (from the site folder):  node _tests/learn/test_cf7-cost-of-waiting.js [--write]
"use strict";
const fs = require("fs");
const path = require("path");
const ID = "cf7-cost-of-waiting";
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const M = require(L(ID + ".js"));
const TL = require(L("components/timeline.js"));
const RAW = fs.readFileSync(L("data/" + ID + ".json"), "utf8");
const JS = fs.readFileSync(L(ID + ".js"), "utf8");
const D = JSON.parse(RAW);
const QPATH = [path.join(SITE, "learn", ID + ".qmd"), path.join(SITE, "learn/_drafts", ID + ".qmd")].find(p => fs.existsSync(p));
const I = D.idea;
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-9 : t);

// ---------------- the no-JS blocks: write (--write) or check
const BLOCKS = {
  "cf7-timeline": () => TL.staticHTML(D.timeline.events),
  "cf7-idea": () => M.staticIdea(I),
  "cf7-bound": () => M.staticBoundary(D.boundary)
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

// ---------------- present value
const i = M.monthly(I);
ok(near(Math.pow(1 + i, 12), 1 + I.discountPerYear, 1e-12), "monthly rate compounds to the yearly 8%");
let s24 = 0; for (let t = 1; t <= 24; t++) s24 += 1 / Math.pow(1 + i, t);
ok(near(M.annuity(I, 24), s24, 1e-9) && M.annuity(I, 0) === 0, "annuity factor = the sum of discounted months (24 months: " + s24.toFixed(3) + ")");

// ---------------- the accounts
const L0 = M.ledgers(I, 0, 0, false);
ok(L0.developer === 0 && L0.ratepayers === 0 && L0.society === 0 && L0.dci === null, "no wait, no cost");
const base = M.ledgers(I, 24, 0, false), tar = M.ledgers(I, 24, 1, false), half = M.ledgers(I, 24, 0.5, false), br = M.ledgers(I, 24, 0, true);
ok(near(base.dev.margin, 4.5e6 * s24, 1) && near(base.dev.capital, 500e6 * i * s24, 1), "developer: $4.5M margin and the carrying cost of $500M each month, discounted");
ok(near(base.rate.strand, 0.12 * 60e6 / Math.pow(1 + i, 24), 1), "ratepayers: 12% chance after 24 months that the $60M of upgrades are stranded, discounted");
ok(M.musd(base.developer) === "$171.1M" && M.musd(base.ratepayers) === "$14.7M" && M.musd(base.society) === "$0.0M", "24 months, no tariff: $171.1M, $14.7M, $0.0M");
ok(near(tar.total, base.total, 1e-6) && near(half.total, base.total, 1e-6) && tar.ratepayers === 0 && near(tar.developer - base.developer, base.ratepayers, 1e-6), "a tariff moves cost between accounts; the total does not change");
ok(M.musd(tar.total) === "$185.8M" && M.musd(base.ratepayers) === "$14.7M", "the tariff moves $14.7M; the total stays $185.8M");
ok(br.developer < base.developer && br.society > 0 && near(br.ratepayers, base.ratepayers), "bridge power: lower developer cost, a social cost, ratepayers unchanged");
ok(M.musd(base.developer - br.developer) === "$25.6M" && M.musd(br.society) === "$8.1M", "bridge power saves the developer $25.6M and adds $8.1M of CO2 damage");
ok(near(br.co2t, 0.5 * 100 * 730 * 0.1 * 24, 1e-6), "bridge power: 50 MW x 730 h x 0.1 t/MWh x 24 months = " + br.co2t + " t of extra CO2");
for (let t = I.delays.step; t <= I.delays.max; t += I.delays.step) {
  const a = M.ledgers(I, t - I.delays.step, 0, false), b = M.ledgers(I, t, 0, false);
  ok(b.developer > a.developer && b.ratepayers > a.ratepayers, "each account grows with the wait (" + t + " months)");
}
ok(M.kusd(base.dci) === "$71.3k", "developer per MW-month at 24 months: $71.3k (got " + M.kusd(base.dci) + ")");
ok(I.tariffShares.indexOf(I.startShare) >= 0 && I.delays.start % I.delays.step === 0, "start state inside the controls");

// ---------------- numbers on the page
const T = text(PAGE);
ok(/In the toy, 24 months">\$171\.1M</.test(PAGE) && /In the toy, 24 months">\$14\.7M</.test(PAGE) && /In the toy, 24 months">\$0\.0M</.test(PAGE) && I.delays.start === 24, "comparison table = the toy at 24 months");
ok(/moves \$14\.7M from other customers to the developer; the total stays \$185\.8M/.test(T), "myth 1 = the toy");
ok(/saves the developer \$25\.6M and adds \$8\.1M of CO₂ damage/.test(T), "myth 2 = the toy");
D.facts.forEach(fc => {
  const row = PAGE.indexOf('<td class="n">' + fc.n + "</td><td>" + fc.what + "</td>");
  ok(row >= 0, "numbers to remember: '" + fc.n + "' row matches the data file");
  ok(row >= 0 && (!fc.url || PAGE.slice(row, row + 700).indexOf(fc.url) >= 0) && PAGE.slice(row, row + 700).indexOf(fc.asof) >= 0, "numbers to remember: '" + fc.n + "' carries its source and date");
});
ok(/on the order of \$0\.7 billion in present value/.test(T) && /about 176 TWh in 2023, about 4\.4%/.test(T), "facts agree with the excerpt and the timeline");

// ---------------- scope: guard G-DC, no nuclear technology, no AI, approved sources only
const ALL = PAGE + "\n" + RAW + "\n" + JS;
ok(!/nuclear|reactor|\bSMR\b|small modular|fission|uranium/i.test(ALL), "no nuclear technology on the page, in the data or in the script");
ok(!/\bAI\b|artificial intelligence/.test(ALL), "no 'AI' anywhere (the paper's published title is not quoted; see E7)");
ok(!/data[- ]cent\w*[^.]{0,80}\b(supply|supplies|supplied|power plant|build|generat)/i.test(text(PAGE)), "data centers appear as loads, never as builders or buyers of supply");
const keys = [...PAGE.matchAll(/data-source="([^"]+)"/g)].map(m => m[1]);
ok(keys.length === 1 && keys[0] === "excerpt:code", "the only excerpt key is excerpt:code");
const sentences = [...PAGE.matchAll(/<blockquote class="lx-excerpt"[^>]*>([\s\S]*?)<footer>/g)].flatMap(m => [...m[1].matchAll(/<p>([\s\S]*?)<\/p>/g)].map(x => text(x[1])));
const question = text((PAGE.match(/<p class="lx-case-q">([\s\S]*?)<\/p>/) || [])[1] || "");
ok(sentences.length === 6 && question.length > 40, "six excerpt sentences and the question on the page");
const EXF = process.env.LEARN_EXCERPTS || path.join(SITE, "..", "reports/learn/excerpts_for_approval.md");
if (fs.existsSync(EXF)) {
  const ap = fs.readFileSync(EXF, "utf8").replace(/\s+/g, " ");
  sentences.concat([question]).forEach(s => ok(ap.indexOf(s) >= 0, "listed for approval: " + s.slice(0, 60)));
} else console.log("note: excerpts_for_approval.md not found (set LEARN_EXCERPTS); excerpt sentences not cross-checked");
// the page's own links (the generated header, next box and footer are build_learn.py's and checked by the scope scan)
const OWN = PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?<!-- learn:\1:end -->/g, "");
const hrefs = [...OWN.matchAll(/href="([^"]+)"/g)].map(m => m[1]);
ok(hrefs.every(h => h === "https://github.com/Henryutd2021/code-delayed-energization" || /^https:\/\/www\.energy\.gov\//.test(h) || /^[0-9a-z-]+\.html$/.test(h) || /^#/.test(h)),
  "links: energy.gov, the allow-listed repository and learn pages only");
ok(!/projects\/|research\.html/.test(PAGE), "no project page and no Research page");
ok(TL.validate(D.timeline.events).length === 0, "every timeline event has a valid date and a source");

// ---------------- text budget
[...PAGE.matchAll(/<div class="lx-case-part[^"]*">([\s\S]*?)<\/div>\n/g)].forEach((m, k) => {
  const words = text(m[1].replace(/<blockquote[\s\S]*?<\/blockquote>/g, "").replace(/<p class="lx-case-q">[\s\S]*?<\/p>/, "")).split(" ").length;
  ok(words <= 60, "case part " + (k + 1) + " has " + words + " words (60 at most, excerpts excluded)");
});

console.log((fails ? "FAILED " + fails + " of " : "ok: ") + checks + " checks (" + ID + ")");
process.exit(fails ? 1 : 0);
