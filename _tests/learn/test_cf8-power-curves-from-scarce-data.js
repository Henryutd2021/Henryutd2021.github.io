// test_cf8-power-curves-from-scarce-data.js — Node tests for case file CF8 (assets/learn/cf8-power-curves-from-scarce-data.js,
// its data file and the page: the draft in learn/_drafts/, or learn/cf8-power-curves-from-scarce-data.qmd once live):
//   - the toy from first principles: the Weibull weights against the distribution's own CDF; the capacity factor of a
//     curve against a direct integral; the band's variance equals w^T Sigma w with Sigma from lesson M9's GP (whose
//     diagonal is M9's band); the field curve's capacity factor lies inside every band the page shows; the maker's curve
//     overstates it; two sources narrow the band most with the fewest records
//   - the no-JS blocks (timeline, toy, boundary, myths, numbers) equal what the components write (--write rewrites them)
//   - research wording (curriculum §13, guard G-SRC): every sentence on the page, in the data file and in this script
//     that describes the course author's studies is an approved sentence of reports/learn/excerpts_for_approval.md (E12,
//     E13), word for word; every E13 placement carries the acknowledgement; the parts of the case in order
//   - citations: the paper's title and volume as in the register (E12.16); links: doi.org, the two repositories, learn pages
//   - scope: no nuclear term, no "AI", no deny-listed term, no co-author or data-provider-person name
// Usage (from the site folder):  node _tests/learn/test_cf8-power-curves-from-scarce-data.js [--write]
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ID = "cf8-power-curves-from-scarce-data";
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const M = require(L(ID + ".js"));
const M9 = require(L("components/gp.js"));
const TL = require(L("components/timeline.js"));
const X = require("./excerpt_check.js");
const RAW = fs.readFileSync(L("data/" + ID + ".json"), "utf8"), JS = fs.readFileSync(L(ID + ".js"), "utf8");
const D = JSON.parse(RAW), I = D.idea, M9D = JSON.parse(fs.readFileSync(L("data/m09-surrogates-uq.json"), "utf8"));
const QPATH = [path.join(SITE, "learn", ID + ".qmd"), path.join(SITE, "learn/_drafts", ID + ".qmd")].find(p => fs.existsSync(p));
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-9 : t);
const A = M.all(I, M9D), pts = M.pts;
function staticMyths() {
  const f = A.fits, n0 = I.sweep[0], nL = I.sweep[I.sweep.length - 1];
  const qq = (id, q, a) => '<div class="lx-qq" data-id="' + id + '" data-answer="myth">\n<p class="lx-qtext">Myth or fact? “' + q + '”</p>\n<ul class="lx-choices"><li data-value="myth">Myth</li><li data-value="fact">Fact</li></ul>\n<details class="lx-answer"><summary>Answer</summary><p>' + a + "</p></details>\n</div>";
  return [qq("exact", "A power curve fitted to measurements gives the turbine's capacity factor exactly.", "Myth. In the toy, " + n0 + " records give " + pts(f[n0][0].cf) + "% ± " + pts(f[n0][0].hi - f[n0][0].cf) + " points (90% band); even " + nL + " records leave ± " + pts(f[nL][0].hi - f[nL][0].cf) + "."),
          qq("maker", "The maker's power curve gives a turbine's real capacity factor.", "Myth. In the toy the maker's curve gives " + pts(A.maker) + "% and the field curve " + pts(A.field) + "%: gusts and losses take " + pts(A.maker - A.field) + " points.")].join("\n");
}
function staticNumbers() {
  const n0 = I.sweep[0], f = A.fits[n0];
  return '<tr><td class="n">± ' + pts(f[0].hi - f[0].cf) + ' → ± ' + pts(f[1].hi - f[1].cf) + ' points</td><td>The toy\'s capacity-factor band from ' + n0 + ' records, one source against two sources.</td><td class="s">This case file\'s toy (illustrative)</td></tr>';
}
const BLOCKS = { "cf8-timeline": () => TL.staticHTML(D.timeline.events), "cf8-idea": () => M.staticIdea(I, M9D), "cf8-bound": () => M.staticBoundary(D.boundary), "cf8-myth": staticMyths, "cf8-numbers": staticNumbers };
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
Object.keys(BLOCKS).forEach(k => { const r = between(PAGE, k); ok(PAGE.slice(r.from, r.to) === BLOCKS[k]() + "\n", "the " + k + " block is up to date (run with --write)"); });

// ---------------- the toy from first principles
{
  const W = I.weibull, F = v => 1 - Math.exp(-Math.pow(v / W.c, W.k)), w = M.weights(I), xs = M.grid(I);
  ok(xs.length === 171 && xs[0] === 3 && xs[170] === 20, "the grid: 3 to 20 m/s in 0.1 m/s steps");
  ok(near(w.reduce((a, b) => a + b, 0), F(20) - F(3), 2e-4), "the trapezoid weights add up to the Weibull share of hours between 3 and 20 m/s (" + (F(20) - F(3)).toFixed(4) + ")");
  ok(near(A.massAbove, 1 - F(20), 1e-12) && A.massAbove < 0.003, "hours above 20 m/s: " + (100 * A.massAbove).toFixed(2) + "% of the year (counted as no output)");
  // the capacity factor of the field curve against a fine direct integral (Simpson, 0.001 m/s)
  let s = 0; const h = 0.001, g = v => M9.field(M9D.turbine, v) * M.weibullPdf(W, v);
  for (let k = 0; k <= 17000; k++) { const v = 3 + k * h, c = k === 0 || k === 17000 ? 1 : k % 2 ? 4 : 2; s += c * g(v); }
  ok(near(A.field, s * h / 3 / 2000, 5e-4), "the field curve's capacity factor equals a fine integral (" + (100 * A.field).toFixed(2) + "%)");
  // the band: w^T Sigma w, and Sigma's diagonal is M9's latent band
  const Fq = M9.fitStored(M9D, 16, true), Sg = M9.covariance(Fq, [6, 12, 16]);
  ok([6, 12, 16].every((v, j) => near(Sg[j][j], M9.predict(Fq, v).lat, 1e-6)) && near(Sg[0][1], Sg[1][0], 1e-9), "the covariance: symmetric, and its diagonal is M9's band of the curve");
  const f0 = A.fits[16][1]; ok(near(f0.hi - f0.cf, M9.ZL[90] * f0.sd, 1e-12) && f0.sd > 0, "the 90% band is ± 1.645 standard deviations");
}
ok(I.sweep.every(n => A.fits[n].every(f => f.lo <= A.field && A.field <= f.hi)), "the field curve's capacity factor lies inside every band the page shows ('lies inside both')");
ok(A.maker > A.field && pts(A.maker) === "32.4" && pts(A.field) === "31.3", "the maker's curve overstates the capacity factor: 32.4% against 31.3%");
{
  const r = n => 1 - (A.fits[n][1].hi - A.fits[n][1].lo) / (A.fits[n][0].hi - A.fits[n][0].lo);
  ok(I.sweep.every(n => r(n) >= -0.05) && r(16) === Math.max(...I.sweep.map(r)) && r(16) > 0.4, "two sources narrow the band most with 16 records (" + Math.round(100 * r(16)) + "%), and never widen it by more than 5%");
  ok(I.sweep.every((n, j) => j === 0 || A.fits[n][0].sd < A.fits[I.sweep[j - 1]][0].sd + 1e-12), "the one-source band shrinks with every added batch of records");
}

// ---------------- the case's parts, in order, word for word
const R = X.register(["E12", "E13"]);
const OWN = PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?<!-- learn:\1:end -->/g, "");
if (R) {
  const parts = [...PAGE.matchAll(/<div class="lx-case-part[^"]*"><p class="lx-eyebrow">([^<]*)<\/p>([\s\S]*?)<\/div>(?=\n<div class="lx-case-part|\n<\/div>)/g)];
  ok(parts.length === 7, "seven case parts (six, and the related project)");
  const txt = i => X.norm(parts[i] ? parts[i][2].replace(/<p class="lx-hint">[\s\S]*?<\/p>/g, " ").replace(/<footer>[\s\S]*?<\/footer>/g, " ").replace(/<\/(p|li)>/g, " ") : "");
  ok(txt(0) === X.norm(R.raw["E12.1"]), "part 1, the puzzle: E12.1");
  ok(txt(1) === X.norm(R.raw["E12.2"]), "part 2, the question: E12.2");
  ok(txt(2) === X.norm(R.raw["E12.3"]), "part 3, scale and boundary: E12.3");
  ok(txt(3) === X.norm(R.raw["E12.4"]), "part 4, decisions, goal and rules: E12.4");
  ok(txt(4) === X.norm(R.raw["E12.5"] + " " + R.raw["E12.6"]), "part 5, data and method: E12.5 and E12.6");
  ok(txt(5) === X.norm(R.raw["E12.7"] + " " + R.raw["E12.8"]) && X.norm((parts[5][2].match(/<p class="lx-hint">([\s\S]*?)<\/p>/) || [])[1] || "") === X.norm(R.raw["E12.9"]), "part 6: E12.7 with E12.8 in the excerpt, then E12.9 (decision 6: E12.8 always with E12.9)");
  ok(txt(6) === X.norm(["E13.1", "E13.2", "E13.3", "E13.4", "E13.5", "E13.6", "E13.8"].map(k => R.raw[k]).join(" ")), "the related project: E13.1-E13.6 and E13.8");
  const blocks = [...PAGE.matchAll(/<blockquote class="lx-excerpt" data-source="([^"]+)">([\s\S]*?)<\/blockquote>/g)];
  ok(blocks.length === 2 && blocks[0][1] === "excerpt:uq-mfgpr" && blocks[1][1] === "excerpt:wind-uq", "two excerpt blocks: uq-mfgpr, then wind-uq (no E1: its approved places are lessons 4, M9 and M10)");
  ok(X.norm((blocks[1][2].match(/<footer>([\s\S]*?)<\/footer>/) || [])[1] || "") === X.ACK && R.ack, "the E13 block ends with the acknowledgement, word for word (in the register)");
  const tri = (PAGE.match(/<div class="lx-card lx-case-try">[\s\S]*?\n<\/div>/) || [""])[0];
  ok(X.norm(tri).includes(X.norm("Try it yourself: " + R.raw["E12.15"].replace(/^Try it yourself: /, ""))) && X.norm(tri).includes(X.norm(R.raw["E13.9"])) && X.norm(tri).includes(X.norm(R.raw["E13.7"])) && X.norm(tri).includes(X.ACK), "try it yourself: E12.15, E13.9 and E13.7, with the acknowledgement");
  const ev = D.timeline.events;
  ok(ev.length === 4 && ev[1].text === R.raw["E12.13"] && ev[2].text === R.raw["E12.14"] && ev[0].text === R.raw["E13.10"] && ev[3].text === R.raw["E13.11"], "the timeline's texts: E13.10, E12.13, E12.14, E13.11 (prefixes are the register's labels)");
  ok(ev.filter(e => /wind-uq/.test(e.source.url)).every(e => e.deeper === X.ACK), "the timeline's E13 events carry the acknowledgement");
  ok(D.boundary.holds.concat(D.boundary.leaves).every(s => X.approved(R, s)) && D.boundary.holds.length === 5, "the boundary card's lines: clauses of E12.12");
  ok(X.norm((PAGE.match(/<ol class="ex-fallback lx-ex-static">([\s\S]*?)<\/ol>/) || [])[1].replace(/<\/li>/g, " ")) === X.norm(R.raw["E12.11"]), "the explainer's no-JS text: E12.11");
  // every other sentence that could be about the studies
  const RX = /\b(the study|study's|paper|article|IDETC|Li et al|course author|excerpt|research project|SDWPF|SCADA|kernel density|nine|plants? (with|without) (power )?measurements|held-out plants|multi-fidelity|surrogate)\b/i;
  const NOT = [[/^Approved excerpt of: Li et al\., ASME IDETC 2023\.$/, "provenance"], [/^A separate example with synthetic numbers, from the course author's open explainer: not the study's data or results\.$/, "explainer label, as CF2's"],
    [/^Every result about the studies is quoted from approved excerpts of the published paper and the public framework named in the sources\.$/, "data note"], [/^The toy below uses lesson M9's illustrative turbine\.$/, "data note"],
    [/^Related project · uncertainty at plants without measurements$/, "heading"], [/^Question and method only: no results\.$/, "label"], [/^(mfgpr-wind-power-curve|wind-uq-surrogate): public example repository · MIT licence · synthetic data\.$/, "repository label"],
    [/^Question type: predictive \(what power, with what uncertainty\?\), with an evaluative part \(better than records alone\?\)\.$/, "the course's question type"],
    [/^(M9|M10) /, "navigation to lessons (Go deeper)"], [/^nine turbines$/, "numbers-table key"], [/^Lesson M9's toy turbine and records: invented round numbers, not the study's data\.$/, "the toy's provenance"],
    [/^Run python examples\//, "commands"], [/^Li et al\. \(2023\), ASME IDETC 2023 · presented August 2023$/, "numbers-table source"],
    [/^From the approved excerpt of Li et al\. \(2023\), ASME IDETC 2023\.$/, "boundary card's source line"]];
  const bad = [];
  let REST = OWN.replace(/<!-- cf8-[a-z]+:start[\s\S]*?<!-- cf8-[a-z]+:end -->/g, " ").replace(/<!--[\s\S]*?-->/g, " ");
  X.elements(REST).forEach(sg => { const o = X.offending(R, NOT, sg); if (o && RX.test(o)) bad.push("page: " + o); });
  const strings = (o, k) => typeof o === "string" ? [[k, o]] : o && typeof o === "object" ? Object.keys(o).flatMap(j => strings(o[j], j)) : [];
  strings(D).filter(x => !["about", "built", "label", "title", "note", "url", "as_of", "date", "kind"].includes(x[0])).forEach(x => { const o = X.offending(R, NOT, x[1]); if (o && RX.test(o)) bad.push("data: " + o); });
  (JS.replace(/\/\/[^\n]*/g, " ").match(/"(?:[^"\\\n]|\\.)*"/g) || []).forEach(l => { const s = l.slice(1, -1); if (RX.test(s)) { const o = X.offending(R, NOT, s); if (o) bad.push("script: " + o); } });
  ok(bad.length === 0, "research wording: every sentence about the studies is approved:\n  " + bad.join("\n  "));
  const cit = (PAGE.match(/<li>Li et al\. \(2023\)\. <a[^>]*>([^<]*)<\/a>\. ([^<]*)<\/li>/) || []);
  ok(cit.length && X.norm("Li et al. (2023). " + cit[1] + ". " + cit[2]) === X.norm(R.raw["E12.16"].split(" mfgpr-wind-power-curve")[0]), "the citation equals E12.16 (title and volume as published)");
} else console.log("note: register not found; research wording not checked");

// ---------------- scope and links
const ALL = [OWN, RAW, JS].join("\n");   // the generated header block quotes other lessons' summaries
ok(!/nuclear|reactor|\bSMR\b|small modular|fission|uranium/i.test(ALL), "no nuclear term");
ok(!/\bAI\b|artificial intelligence/.test(ALL), "no 'AI'");
ok(!/Feng|Zhang|Sun, M|Chartan|Hodge|NREL\b/.test(ALL), "no co-author name and no lab acronym (the acknowledgement names the laboratory in full, as approved)");
ok(!/\bFOAK\b|\bNOAK\b|learning[- ](curve|rate)|projects\/|research\.(html|qmd)/i.test(ALL), "no deny-listed term, no project or Research page");
const hrefs = [...OWN.matchAll(/\s(?:href|src)="([^"]+)"/g)].map(m => m[1]).concat(D.timeline.events.map(e => e.source.url));
const OKH = h => /^https:\/\/doi\.org\/10\./.test(h) || /^https:\/\/github\.com\/Henryutd2021\/(mfgpr-wind-power-curve|wind-uq-surrogate)$/.test(h) || /^(\.\.\/assets\/(learn|explainers)\/[a-z0-9/-]+\.(js|json)|[0-9a-z-]+\.html)$/.test(h);
ok(hrefs.every(OKH), "links: doi.org, the two repositories, learn pages and the page's scripts only: " + hrefs.filter(h => !OKH(h)).join(" "));
ok(/<script src="\.\.\/assets\/learn\/learn\.js" defer><\/script>\n<script src="\.\.\/assets\/learn\/cf8-power-curves-from-scarce-data\.js" defer><\/script>/.test(PAGE) && !/<script src="[^"]*m09-surrogates-uq\.js"/.test(PAGE), "LX.M9 comes with the bundle (components/gp.js, W4 integration); the page loads no other lesson's script");
const PY = fs.readFileSync(path.join(SITE, "learn/path.yml"), "utf8"), entry = PY.split(/\n- kind: /).find(x => new RegExp("\\n  id: " + ID + "\\n").test(x)) || "";
ok(/\n  form: case\n/.test(entry) && /\n  tier: analyst\n/.test(entry) && /\n  minutes: 10\n/.test(entry) && /after: \[5\]/.test(entry) && /\n  status: upcoming\n/.test(entry) === /_drafts/.test(QPATH), "path.yml: a case, Analyst tier (coordinator), 10 minutes, after lesson 5; upcoming while a draft");
const fm = k => ((PAGE.match(new RegExp("^" + k + ': "(.*)"$', "m")) || [])[1]), py = k => ((entry.match(new RegExp("\\n  " + k + ': "(.*)"')) || [])[1]);
ok(fm("title") === py("title") && fm("subtitle") === py("subtitle"), "the page's title and subtitle equal path.yml's");

// ---------------- the page on a stub document
(async () => {
  const { env, load, El } = require("./stubdom.js");
  if (!El.prototype.getBoundingClientRect) El.prototype.getBoundingClientRect = () => ({ top: 0, left: 0, width: 0, height: 0, bottom: 0, right: 0 });
  const E = env(); E.LX.isDark = () => false;
  ["timeline", "boundary", "toggle"].forEach(n => load(n, E));
  const specs = [], sliders = [], mounts = {};
  E.LX.Plot = (host, o) => { const box = E.LX.H("div", null, host); return { box, render: s => specs.push(s), text: null }; };
  E.LX.Slider = (host, o) => { let v = o.value; const sl = { val: () => v, set: (x, fire) => { v = x; if (fire && o.onChange) o.onChange(v); }, _set(x) { v = x; o.onChange(v); } }; sliders.push(sl); return sl; };
  E.LX.mount = (slug, f) => { mounts[slug] = f; }; E.LX.demo = () => null;
  const ctx = { window: E.window, document: E.document, console, module: { exports: {} }, require: p => require(path.join(L(""), p)) };
  E.window.LX.M9 = M9;
  vm.runInNewContext(JS, ctx);
  const xp = E.LX.H("div", { id: "cf8-explain" }, E.body), live = E.LX.H("div", null, E.body), live2 = E.LX.H("div", null, E.body);
  let threw = null;
  try { mounts.cf8(live, { cf8_power_curves_from_scarce_data: D }); mounts["cf8-idea"](live2, { cf8_power_curves_from_scarce_data: D, m09_surrogates_uq: M9D }, live2); } catch (err) { threw = err.stack; }
  ok(!threw, "both parts mount on the stub document" + (threw ? ": " + threw : ""));
  if (!threw) {
    const t = s => s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    ok(/One source, 16 records: 31\.3% ± 2\.8 points\./.test(t(live2.innerHTML)) && /A band on the curve is a band on the year's energy\./.test(t(live2.innerHTML)), "the toy starts at 16 records, one source: 31.3% ± 2.8 points");
    live2.querySelector(".lx-toggle").click();
    ok(/Two sources, 16 records: 31\.0% ± 1\.5 points\./.test(t(live2.innerHTML)) && /The maker's curve narrows the band by 47% here; the field curve's 31\.3% lies inside both\./.test(t(live2.innerHTML)), "two sources: 31.0% ± 1.5, narrower by 47%");
    sliders[0]._set(4);
    ok(/One source, 64 records: 31\.0% ± 0\.8 points\./.test(t(live2.innerHTML)), "64 records: ± 0.8 points");
    ok(live2.querySelectorAll("[aria-live]").length >= 1 && specs[specs.length - 1].text.rows.length === 4, "the status is announced; the chart has a text version");
    ok(/Where the result holds/.test(t(xp.innerHTML)), "the boundary card is drawn");
  }
  console.log((fails ? "FAILED " + fails + " of " : "ok: ") + checks + " checks (" + ID + ")");
  process.exit(fails ? 1 : 0);
})();
