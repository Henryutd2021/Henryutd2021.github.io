// test_cf3-hydrogen-under-uncertainty.js — Node tests for case file CF3 (assets/learn/cf3-hydrogen-under-uncertainty.js,
// its data file and the page, learn/cf3-hydrogen-under-uncertainty.qmd, or the draft in learn/_drafts/):
//   - the toy is M8's (assets/learn/m08-stochastic-robust.js and its data): the three plans are M8's reference plans;
//     prices equal M8's closed form, recomputed here from first principles; the hedged plan is the cheapest size in
//     expectation on every step of the slider; the live status is true for every size the slider allows (W3 brief §2.5)
//   - the allow-listed explainer (assets/explainers/txh2.js) shows the mechanism of the excerpt E10.2–E10.3 (stylized)
//   - every number on the page (the myths) matches the toy; no Numbers to remember (coordinator, 2026-11-05)
//   - the three no-JS blocks (timeline, toy, boundary) equal what the components write from the data (--write rewrites them)
//   - research wording (curriculum §13, guard G-SRC): every sentence on the page, in the data file and in this lesson's
//     script that describes the course author's study is an approved sentence of reports/learn/excerpts_for_approval.md
//     (E10 and E11), word for word; the excerpts are the approved ones, in the approved places; E11.10 is marked optional
//   - citations: the paper's title is the one in inputs/publications.bib; links: doi.org, the allow-listed repository and
//     learn pages only; text budget of every text element
// Usage (from the site folder):  node _tests/learn/test_cf3-hydrogen-under-uncertainty.js [--write]
"use strict";
const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const ID = "cf3-hydrogen-under-uncertainty";
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const M = require(L(ID + ".js"));
const M8 = require(L("components/scenario.js"));
const TL = require(L("components/timeline.js"));
const EX = require(path.join(SITE, "assets/explainers/txh2.js"));
const D = JSON.parse(fs.readFileSync(L("data/" + ID + ".json"), "utf8"));
const D8 = JSON.parse(fs.readFileSync(L("data/m08-stochastic-robust.json"), "utf8"));
const JS = fs.readFileSync(L(ID + ".js"), "utf8");
const QPATH = [path.join(SITE, "learn", ID + ".qmd"), path.join(SITE, "learn/_drafts", ID + ".qmd")].find(p => fs.existsSync(p));
const I = D.idea, R8 = D8.reference, fm = M8.fm;
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-9 : t);

// ---------------- the no-JS blocks: write (--write) or check
const BLOCKS = {
  "cf3-timeline": () => TL.staticHTML(D.timeline.events),
  "cf3-idea": () => M.staticIdea(M8, D8, I),
  "cf3-bound": () => M.staticBoundary(D.boundary)
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
ok(/learn\/_drafts\//.test(QPATH) ? /status: upcoming/.test((fs.readFileSync(path.join(SITE, "learn/path.yml"), "utf8").split(/\n- kind: /).find(e => /\n  id: cf3-hydrogen-under-uncertainty\n/.test(e)) || "")) : true, "a draft keeps status: upcoming in path.yml");

// ---------------- the toy: M8's, priced from first principles
const S = M8.scen(D8), base = 1.5 * 54000 * 8760;
const cost0 = (W, x) => 80000 * x + 1.5 * (54000 * 8760 - 18 * D8.blocks.hours.reduce((a, h, b) => a + h * Math.min(x, Math.max(0, W * D8.blocks.cf[b] - 1000)), 0));
ok(D8.electrolyzer.costPerMWYear === 80000 && D8.hydrogen.reformerPerKg === 1.5 && D8.electrolyzer.kgPerMWh === 18 && D8.hydrogen.demandKgPerHour === 54000 && D8.zone.lineMW === 1000, "the toy's inputs are M8's data");
const P = M.plans(I, D8);
ok(P.map(p => p.key).join() === "ev,sp,rob" && P.every(p => p.x === R8[p.key].x) && P.map(p => p.x).join() === "1300,845,380", "three plans, M8's reference: the plan for the average 1,300 MW, the hedged plan 845 MW, the worst-case plan 380 MW");
let allOK = true, minOK = true, statusOK = true;
for (let x = 0; x <= D8.chart.xMax; x += D8.chart.step) {
  const r = M.price(M8, D8, x);
  if (!r.per.every((v, i) => near(v, cost0(S[i].W, x), 1e-3)) || !near(r.exp, S.reduce((a, s, i) => a + s.p * r.per[i], 0), 1e-3)) allOK = false;
  if (x !== R8.sp.x && !(r.exp > R8.sp.exp + 1000)) minOK = false;
  // the status: true for this size
  const lines = M.status(M8, D8, x).map(text);
  if (x === 0) { if (!(lines[0] === "With no electrolyzer, every build-out costs the same: " + fm.m(base) + " a year, all hydrogen from gas reformers." && r.per.every(v => near(v, base, 1e-6)))) statusOK = false; }
  else {
    const first = x === R8.sp.x ? fm.mw(x) + " is the hedged plan: the lowest expected cost, " + fm.m(r.exp) + " a year." : fm.mw(x) + " is expected to cost " + fm.m(r.exp) + " a year, " + fm.m(r.exp - R8.sp.exp) + " more than the hedged plan's " + fm.mw(R8.sp.x) + ".";
    const second = "If none of the planned wind is built, it costs " + fm.m(r.per[0]) + (r.per[0] > base ? ", more than" : ", no more than") + " gas reformers alone (" + fm.m(base) + "); if all of it is built, " + fm.m(r.per[2]) + ".";
    if (lines[0] !== first || lines[1] !== second || lines.length !== 2 || fm.m(r.exp - R8.sp.exp) === "$0.00M" && x !== R8.sp.x) statusOK = false;
    if (lines.some(t => t.split(" ").length > 30)) statusOK = false;
  }
}
ok(allOK, "the toy's prices equal the closed form recomputed here, for every size on the slider (0 to 2,500 MW in 5 MW steps)");
ok(minOK, "the hedged plan is the cheapest in expectation by more than $1,000 against every other size on the slider (unique)");
ok(statusOK, "the live status is true and short for every size on the slider; it says 'more than gas reformers alone' only when that branch costs more");
ok(M.price(M8, D8, R8.sp.x).per[0] > base && M.price(M8, D8, R8.rob.x).per[0] < base, "with none built, the hedged plan costs more than reformers alone; the worst-case plan does not (the myth's numbers)");

// ---------------- the explainer: the excerpt's mechanism, stylized
const lo = EX.model({ price: EX.C.pMin }), hi = EX.model({ price: EX.C.pMax });
ok(lo.share === 0 && hi.share > 0 && hi.extraReformer > 0 && hi.dGas < 0 && hi.dNet > 0, "explainer: at a high gas-power price, green hydrogen goes to fuel cells, reformers make more, gas-plant CO₂ falls and total CO₂ rises (E10.2–E10.3's mechanism, stylized)");

// ---------------- numbers on the page
const T = text(PAGE);
ok(T.includes(`the plan for the middle build-out (${fm.int(R8.ev.x)} MW) is expected to cost ${fm.m(R8.vss)} a year more than the hedged plan (${fm.int(R8.sp.x)} MW)`) && R8.ev.x === R8.ws.mid.x, "myth 1: the average's plan is the middle branch's, and costs VSS more");
ok(T.includes(`if none of the planned wind is built, the hedged plan costs ${fm.m(R8.sp.per.low)} a year against ${fm.m(base)} with gas reformers alone`) && near(R8.sp.per.low, cost0(3000, 845), 1), "myth 2: the hedged plan in the none-built branch against reformers alone");
ok(!/Numbers to remember/.test(PAGE.replace(/<!--[\s\S]*?-->/g, "")), "no Numbers to remember (coordinator, 2026-11-05)");

// ---------------- excerpts, links, sources
const keys = [...PAGE.matchAll(/data-source="([^"]+)"/g)].map(m => m[1]);
ok(keys.length === 1 && keys[0] === "excerpt:txh2", "one excerpt, from excerpt:txh2");
const OWN = PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?<!-- learn:\1:end -->/g, "");
const hrefs = [...OWN.matchAll(/href="([^"]+)"/g)].map(m => m[1]);
ok(hrefs.every(h => /^https:\/\/doi\.org\/10\./.test(h) || h === "https://github.com/Henryutd2021/txh2-ercot-hydrogen" || /^[0-9a-z-]+\.html$/.test(h) || /^\.\.\/assets\//.test(h) || /^#/.test(h)), "links: doi.org, the allow-listed repository and learn pages only");
ok(!/projects\/|research\.html/.test(PAGE + JS) && /assets\/explainers\/txh2\.js/.test(PAGE) && !/explainers\/(?!common|txh2)/.test(PAGE), "no project page and no Research page; only the allow-listed txh2 explainer");
ok(TL.validate(D.timeline.events).length === 0 && D.timeline.events.every(e => e.source && e.source.label), "every timeline event has a valid date and a source");
ok(!/\bSMR\b|nuclear|reactor|small modular|131 tons|1,300 tons|92\.4%|310 kilotons|Zhang/i.test(PAGE + JS + JSON.stringify(D)), "no reformer abbreviation, no nuclear term, none of the abstract's withdrawn numbers, no co-author");
const PATHJ = JSON.parse(fs.readFileSync(L("data/path.json"), "utf8")), live = new Set(), walk = o => { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === "object") { if (o.href && o.ready === true) live.add(o.href); Object.values(o).forEach(walk); } };
walk(PATHJ);
hrefs.filter(h => /^[0-9a-z-]+\.html$/.test(h) && h !== "index.html").forEach(h => ok(live.has(h), "linked lesson is live: " + h));
ok(/<script src="\.\.\/assets\/learn\/learn\.js" defer><\/script>\n<script src="\.\.\/assets\/learn\/cf3-hydrogen-under-uncertainty\.js" defer>/.test(PAGE) && !/<script src="[^"]*m08-stochastic-robust\.js"/.test(PAGE) && /LX\.m08/.test(JS), "LX.m08 comes with the bundle (components/scenario.js, W4 integration); CF3 reads it and loads no other lesson's script");

// ---------------- research wording (curriculum §13, guard G-SRC)
// As CF2's test: every sentence that describes the study is (a) an approved sentence of the register (sections E10, E11)
// or (b) a recorded revision; a page sentence may be a clause of an approved row where the row itself breaks (": ", "; ",
// ". "). Strict zones: the case parts and excerpts with their notes, the case's data note, the explainer's no-JS steps
// and note, the try-it paragraph, the sources list; the data file's timeline texts and boundary. Signalled: everything else.
const CF = { prefix: "cf3", sections: ["E10", "E11"], excerpts: 5, question: "E11.2", papers: 1 };
const APPROVED_SNAPSHOT = {   // excerpts_for_approval.md, E10 (approved 2026-11-03) and E11 (approved 2026-11-05)
  "E10.1": "A two-stage stochastic linear program sized electrolyzers, hydrogen tanks and fuel cells once in each of ERCOT's eight weather zones, with hydrogen pipelines between neighbouring zones, then scheduled the system hour by hour over a full year in nine scenarios: three completion rates of planned renewable capacity by three electricity-demand levels.",
  "E10.2": "When gas-fired backup power became much more expensive, the model built fuel cells and turned stored green hydrogen back into electricity.",
  "E10.3": "Industry then drew more hydrogen from gas reformers, and the round trip from power to hydrogen and back lost energy, so total emissions rose although gas-plant emissions fell.",
  "E10.4": "Inputs reflect 2022–2023 conditions; post-2023 federal hydrogen credit rules are not modeled.",
  "E11.1": "In ERCOT, wind and solar output is concentrated far from electricity demand in the north and southeast, and from hydrogen demand on the Gulf Coast. How much planned renewable capacity is built by 2030, and how fast demand grows, are both uncertain.",
  "E11.2": "Where should electrolyzers, hydrogen storage and fuel cells be built in ERCOT, and how should hydrogen move between zones, to absorb surplus renewable generation and supply industrial hydrogen demand under uncertain 2030 renewable build-out?",
  "E11.3": "Inside: ERCOT's eight weather zones, every hour of a year (8,760 hours), nine scenarios of renewable build-out and electricity demand, and industrial hydrogen demand in each zone. Left out: uncertainty in hydrogen demand, which is held fixed; truck and rail transport; post-2023 federal hydrogen credit rules.",
  "E11.4": "Decisions: the sizes of electrolyzers, hydrogen tanks and fuel cells in each zone, chosen once; then, in each scenario, how batteries, electrolysis, fuel cells, gas-fired backup, reformer hydrogen and pipeline flows run every hour. Goal: the lowest expected cost over all nine scenarios, net of hydrogen and oxygen sales, with the CO₂ from gas plants and reformers captured and stored at a cost. Rules: electricity demand is met in every zone and hour; industrial hydrogen demand is met by green or reformer hydrogen; hydrogen moves only by pipeline between neighbouring zones; no unit runs above its size.",
  "E11.5": "Inputs are built from ERCOT's 60-day market disclosures, the LBNL interconnection queue and EIA data. The same hourly capacity factors of each zone scale existing and planned wind and solar, so both share one hourly basis.",
  "E11.6": "Hydrogen equipment is sized once, then operated hour by hour in nine scenarios; the sizes minimize expected cost over all nine scenarios instead of fitting a single forecast.",
  "E11.7": "The completion rate of planned renewable capacity was 0% (probability 0.1), 30% (0.7) or 80% (0.2); electricity demand was ERCOT's 2030 projection (0.5), 2% lower (0.2) or 2% higher (0.3).",
  "E11.8": "Electrolyzers and hydrogen tanks, combined with hydrogen transport between zones, could meet most of the hydrogen demand in certain zones.",
  "E11.9": "Across ERCOT, renewable (green) hydrogen covered only a few percent of industrial hydrogen demand; reformer hydrogen remained the main supply.",
  "E11.10": "Modest load flexibility (±5%) reduced CO₂ emissions from combined-cycle gas generation.",
  "E11.11": "Holds when: ERCOT's eight weather zones, inputs from 2022–2023, and hydrogen demand held fixed; the emissions result comes from runs in which power from gas-fired plants became more expensive. Leaves out: post-2023 federal hydrogen credit rules; truck and rail transport.",
  "E11.12": "Where the result holds: ERCOT's eight weather zones, every hour of one year, in nine scenarios of renewable build-out and electricity demand; inputs reflect 2022–2023 conditions; hydrogen demand is held fixed across scenarios; the CO₂ from gas plants and reformers is captured and stored at a cost; the emissions result comes from sensitivity runs in which power from gas-fired plants became more expensive. It leaves out: post-2023 federal hydrogen credit rules; uncertainty in hydrogen demand; truck and rail transport of hydrogen.",
  "E11.13": "When gas-fired backup power becomes more expensive, the model starts to use stored green hydrogen in fuel cells to make electricity in hours of low wind and sun. That hydrogen no longer supplies industry, so gas reformers fill the gap with fossil hydrogen. Converting electricity to hydrogen and back loses energy, so in the paper's high-price cases total emissions rose even though emissions from gas plants fell.",
  "E11.14": "Illustrative model with stylized numbers: it shows the mechanism described in the paper, not the study's data or results.",
  "E11.15": "Electrolyzers, hydrogen tanks and fuel cells are sized for ERCOT's eight weather zones under uncertain renewable build-out and electricity demand, with hydrogen pipelines between neighbouring zones; published online on 2 March 2025, in the March 2025 issue.",
  "E11.16": "A documented, runnable implementation of the planning framework, with synthetic examples (version 1.0.2).",
  "E11.17": "Try it yourself: the framework solves a small invented region (four zones, three days) in a few seconds. Halve the capital cost of the hydrogen equipment, or allow ±5% load flexibility, and compare the sizes and the emissions. Its numbers say nothing about ERCOT or Texas.",
  "E11.18": "Li et al. (2025). Hydrogen’s role in expanding renewable energy and reducing carbon emissions in Texas. International Journal of Hydrogen Energy 113, 77–89. txh2-ercot-hydrogen on GitHub, version 1.0.2 (30 October 2026)."
};
// names a study, its author, its region or its method: such an element is research text unless approved or listed below
const RX = /\b(stud(y|y's|ies)|paper|article|journal|Li et al|course author|excerpt|research|published|ERCOT|Texas|Gulf Coast|weather zones?|nine scenarios|completion rates?|scenarios|framework)\b/i;
const NOT_RESEARCH = [
  [/^\d · [A-Z][a-z ,]+$/, "part label"],
  [/^Question type: prescriptive \(what should be built, where, and how should it run\?\)\.$/, "course label (§11.2 question type)"],
  [/^Approved excerpt of: Li et al\. \(2025\), International Journal of Hydrogen Energy\.$/, "provenance label"],
  [/^From the approved excerpt of Li et al\. \(2025\), International Journal of Hydrogen Energy\.$/, "provenance label"],
  [/^Every result about the study is quoted from approved excerpts of the published paper named in the sources\.$/, "provenance label"],
  [/^The toy below uses illustrative round numbers\.$/, "provenance label (the toy)"],
  [/^Li et al\. \(2025\), International Journal of Hydrogen Energy 113, 77–89$/, "citation label (timeline, data file)"],
  [/^txh2-ercot-hydrogen on GitHub$/, "citation label (repository)"],
  [/^(The study in time|Where the result holds|The scale of this case|This case sits here\.)$/, "heading or course label"],
  [/^(Journal article \(this case\)|Code released)$/, "timeline step label: the kind of output"],
  [/^txh2-ercot-hydrogen: public example repository · MIT licence · synthetic data\.$/, "repository label"],
  [/^Birge, J\. R\., and Louveaux, F\. \(2011\)\. Introduction to Stochastic Programming, 2nd ed\. Springer\. The toy's idea: chapter 4, The Value of Information and the Stochastic Solution\.$/, "citation (textbook), not the study"],
  [/^M8's toy: one windy zone, three build-outs with chances 25%, 50% and 25%, illustrative round numbers in 2025 dollars\.$/, "provenance label (the toy)"],
  [/^Data of case file CF3 /, "the data file's about line"],
  [/^(Sizes chosen before the uncertainty resolves are here-and-now decisions; how the equipment runs in each scenario is recourse\.|One linear program holds both: one size, one copy of the operation for each scenario, each copy's cost weighted by its chance\.|M8 builds a small one in the browser, prices the plan for the average future against it, and compares robust plans that use no chances\.)$/, "general idea (Go deeper), no study claim"]
];
const norm = s => String(s).replace(/\[\[[a-z0-9-]+\|([^\]]+)\]\]/g, "$1").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'")
  .replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").replace(/ ([.,;:?!)])/g, "$1").replace(/\( /g, "(").trim();
function portfolio() {
  const c = [process.env.LEARN_PORTFOLIO, path.join(SITE, "..")];
  try { c.push(path.resolve(SITE, cp.execSync("git rev-parse --git-common-dir", { cwd: SITE, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(), "..", "..")); } catch (e) { /* not a git checkout */ }
  return c.filter(Boolean).find(p => fs.existsSync(path.join(p, "reports/learn/excerpts_for_approval.md")));
}
// {id: sentence} of the register's rows in SECTIONS, each revision applied (a revised row replaces the approved one)
function register(md) {
  const out = {}; let sec = null;
  const strip = t => norm(t.replace(/^(Timeline, [^:]+|Myth answer|Citations?): /, ""));
  md.split("\n").forEach(line => {
    const h = /^#{2,3} /.test(line) ? line.match(/^#{2,3} (E\d+)\.|^## (Revisions after review)/) : null;
    if (/^#{2,3} /.test(line)) { if (h) sec = h[1] || "REV"; else if (/^## /.test(line)) sec = null; return; }
    const m = line.match(/^\| (E(\d+)\.\d+)(?: \[N\])? \| (.*) \|\s*$/);
    if (!m || !sec || CF.sections.indexOf("E" + m[2]) < 0) return;
    const cells = m[3].split(" | ");
    if (sec === "REV") out[m[1]] = strip(cells[1]); else if (sec === "E" + m[2]) out[m[1]] = strip(cells[0]);
  });
  return out;
}
const RP = portfolio();
let APPROVED = APPROVED_SNAPSHOT;
if (RP) {
  const md = fs.readFileSync(path.join(RP, "reports/learn/excerpts_for_approval.md"), "utf8"), reg = register(md);
  const same = (x, y) => Object.keys(x).length === Object.keys(y).length && Object.keys(x).every(k => x[k] === y[k]);
  ok(same(reg, APPROVED_SNAPSHOT), "the approved-sentence snapshot in this test equals the register (" + CF.sections.join(", ") + ", revisions applied); differs at: " +
    Object.keys(Object.assign({}, reg, APPROVED_SNAPSHOT)).filter(k => reg[k] !== APPROVED_SNAPSHOT[k]).join(", "));
  const w4 = md.slice(md.indexOf("## W4 sources"), md.indexOf("### E11"));
  ok(/approved/i.test(w4) && !/waiting for Henry/i.test((w4.match(/\*\*Status[^\n]*/) || [""])[0]), "the register's W4 status line says approved");
  APPROVED = reg;
} else console.log("note: reports/learn/excerpts_for_approval.md not found (set LEARN_PORTFOLIO); research wording checked against the snapshot in this test");
const UNITS = Object.values(APPROVED).map(norm);
function approved(seg) {
  const s = norm(seg);
  return s.length > 0 && UNITS.some(u => {
    for (let i = u.indexOf(s); i >= 0; i = u.indexOf(s, i + 1)) {
      const pre = u.slice(0, i), post = u.slice(i + s.length);
      if ((i === 0 || /[:;.?!] $/.test(pre)) && (post === "" || /^[:;.]/.test(post) || (/^ /.test(post) && /[.;:?!]$/.test(s)))) return true;
    }
    return false;
  });
}
const listed = s => NOT_RESEARCH.some(r => r[0].test(norm(s)));
const sentencesOf = s => norm(s).split(/(?<=[.?!])\s+(?=[A-Z“"])/);
function offending(seg) {
  if (approved(seg) || listed(seg)) return null;
  return sentencesOf(seg).find(x => !approved(x) && !listed(x)) || null;
}
function elements(html) {
  return html.replace(/<!--[\s\S]*?-->/g, " ").replace(/^- (.*)$/gm, "<li>$1</li>").replace(/\[([^\]]+)\]\{[^}]*\}/g, "$1").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .split(/<\/?(?:p|li|ul|ol|dl|dt|dd|div|blockquote|footer|table|thead|tbody|tr|td|th|caption|details|summary|header|h[1-6]|section|nav|script)\b[^>]*>|```[^\n]*\n?/i)
    .map(norm).filter(s => s && !/^(:::|\{=html\})/.test(s) && /[A-Za-z]/.test(s));
}
const bad = [];
const strict = (where, list) => list.forEach(s => { const o = offending(s); if (o) bad.push(where + ": " + o); });
const signalled = (where, list) => list.forEach(s => { if (RX.test(s)) { const o = offending(s); if (o) bad.push(where + ": " + o); } });
const GENERATED = new RegExp("<!-- (" + CF.prefix + "-[a-z]+):start[\\s\\S]*?<!-- \\1:end -->", "g");
let REST = OWN.replace(GENERATED, " ");
const cut = (re, optional) => { const m = REST.match(re); ok(!!m || optional, "page zone found: " + re); if (m) REST = REST.replace(m[0], " "); return m ? m[0] : ""; };
strict("page, the case", elements(cut(/<div class="lx-case">[\s\S]*?\n<\/div>\n(?=<div class="lx-interactive")/)));
strict("page, the case's data note", elements(cut(/<p class="lx-datanote"><span>Every result[\s\S]*?<\/p>/)));
strict("page, explainer no-JS steps", elements(cut(/<ol class="ex-fallback[\s\S]*?<\/ol>/)));
strict("page, explainer note", elements(cut(/<p class="lx-hint">Illustrative model with stylized numbers[\s\S]*?<\/p>/)));
strict("page, try it yourself", elements(cut(/<p>Try it yourself:[\s\S]*?<\/p>/)));
const SRC = cut(/<div class="lx-card lx-sources">[\s\S]*?<\/div>/);
const TITLED = /^<li>Li et al\. \((\d{4})\)\. <a href="(https:\/\/doi\.org\/[^"]+)">([^<]+)<\/a>\./;
const SRC_LI = [...SRC.matchAll(/<li>[\s\S]*?<\/li>/g)].map(m => m[0]);
strict("page, sources", SRC_LI.map(norm));
signalled("page", elements(REST.replace(/^---[\s\S]*?\n---\n/, " ")));
const FM = (PAGE.match(/^---\n([\s\S]*?)\n---/) || [])[1] || "";
signalled("front matter", [...FM.matchAll(/^(title|subtitle|description): "(.*)"$/gm)].map(m => m[2]));
const PATHYML = fs.readFileSync(path.join(SITE, "learn/path.yml"), "utf8"), entry = (PATHYML.split(/\n- kind: /).find(e => new RegExp("\\n  id: " + ID + "\\n").test(e)) || "");
ok(entry.length > 0, "path.yml has the entry");
signalled("path.yml", [...entry.matchAll(/^  (title|subtitle|short|does|outcome): "(.*)"$/gm)].map(m => m[2]));
D.timeline.events.forEach(e => { if (e.text) strict("data, timeline " + e.date, [e.text]); ok(listed(e.label), "data, timeline " + e.date + ": the step's label names its kind only (" + e.label + ")"); });
strict("data, boundary", D.boundary.holds.concat(D.boundary.leaves, [D.boundary.title, D.boundary.source]));
const strings = (o, k) => typeof o === "string" ? [[k, o]] : o && typeof o === "object" ? Object.keys(o).flatMap(j => strings(o[j], j)) : [];
signalled("data", strings(D).filter(x => ["url", "date", "as_of", "built", "kind", "key", "mark"].indexOf(x[0]) < 0).map(x => x[1]));
const literals = JS.replace(/\/\/[^\n]*/g, " ").match(/"(?:[^"\\\n]|\\.)*"/g) || [];
signalled("script", literals.map(l => l.slice(1, -1).replace(/\\"/g, '"')));
ok(bad.length === 0, "research wording: every sentence about the study is approved or a recorded revision:\n  " + bad.join("\n  "));
// the excerpts themselves: E10.2, E10.3, E11.8, E11.9, E11.10, in that order; the question; the notes under them
const sentences = [...PAGE.matchAll(/<blockquote class="lx-excerpt"[^>]*>([\s\S]*?)<footer>/g)].flatMap(m => [...m[1].matchAll(/<p>([\s\S]*?)<\/p>/g)].map(x => norm(x[1])));
ok(sentences.length === CF.excerpts && sentences.join("|") === ["E10.2", "E10.3", "E11.8", "E11.9", "E11.10"].map(k => APPROVED[k]).join("|"), CF.excerpts + " excerpt sentences: E10.2, E10.3, E11.8, E11.9 and E11.10, word for word");
ok(/<!-- E11\.10 \(approved as optional\): drop this paragraph to remove it --><p>Modest load flexibility/.test(PAGE), "E11.10 is marked optional, easy to drop");
ok(norm((PAGE.match(/<p class="lx-case-q">([\s\S]*?)<\/p>/) || [])[1] || "") === APPROVED[CF.question], "the question is " + CF.question + ", word for word");
ok(PAGE.includes('</blockquote>\n<p class="lx-hint">' + APPROVED["E10.4"] + '</p>\n<p class="lx-hint">' + norm(APPROVED["E11.11"]) + "</p>"), "the notes under the excerpt: E10.4, then E11.11");
ok(["E11.1", "E11.3", "E11.4", "E11.5", "E10.1", "E11.6"].every(k => norm(text(PAGE)).includes(APPROVED[k].split(/(?<=[.?!])\s/)[0].replace(/^(Inside|Decisions): /, ""))), "parts 1, 3, 4 and 5 carry E11.1, E11.3, E11.4, E11.5, E10.1 and E11.6");
ok(norm(D.timeline.events[0].text) === APPROVED["E11.15"] && norm(D.timeline.events[1].text) === APPROVED["E11.16"], "the timeline is E11.15 and E11.16, word for word");
if (RP) {
  const bib = fs.readFileSync(path.join(RP, "inputs/publications.bib"), "utf8");
  const titles = [...bib.matchAll(/^\s*title\s*=\s*\{(.*)\},?\s*$/gm)].map(m => m[1].replace(/[{}]/g, "").replace(/\\textbf/g, "").toLowerCase().replace(/[’']/g, "'"));
  const cites = SRC_LI.map(li => li.match(TITLED)).filter(Boolean);
  ok(cites.length === CF.papers, CF.papers + " Li et al. paper with a title in the sources list (" + cites.length + ")");
  cites.forEach(c => ok(titles.indexOf(c[3].toLowerCase().replace(/[’']/g, "'")) >= 0 && /^https:\/\/doi\.org\//.test(c[2]), "sources: '" + c[3].slice(0, 50) + "' is the title in publications.bib, with its DOI"));
}

// ---------------- text budget: every text element of the page's own prose stays short (one idea, about 35 words)
const prose = elements(OWN.replace(GENERATED, " ").replace(/<script[\s\S]*?<\/script>/g, " ").replace(/^---[\s\S]*?\n---\n/, " "));
prose.forEach(s => { const w = s.split(" ").length; ok(w <= 40 || approved(s), "text element of " + w + " words (40 at most unless one approved sentence): " + s.slice(0, 70)); });

console.log((fails ? "FAILED " + fails + " of " : "ok: ") + checks + " checks (" + ID + ")");
process.exit(fails ? 1 : 0);
