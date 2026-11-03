// test_c0-behind-one-meter.js — Node tests for capstone C0 (learn/c0-behind-one-meter.qmd, assets/learn/c0-behind-one-
// meter.js, data/c0-behind-one-meter.json), built on engine E0 (assets/learn/components/engine-e0.js):
//   - the six generated blocks (the plan's controls, the default plan's results, the note's outline, the exemplars, the
//     rubric, the inputs) equal the components' own output (write them with --write)
//   - every number in the exemplars is the engine's for the default plan: its NPV, saving, cost, CO₂, grid hours and two
//     sensitivity cases (re-solved here with HiGHS)
//   - the sensitivity line the note carries (the widest swing), and the note's checks: a full note passes every one and
//     fits on a page; an empty one fails the reader's fields; a stale run is flagged
//   - Henry's research (curriculum §13): every excerpt sentence is an approved sentence of
//     reports/learn/excerpts_for_approval.md (E3, E4, with the revisions after review), word for word, with an allowed
//     data-source key; every other sentence that names a study, author or site is approved or listed below; the cited
//     titles are those of inputs/publications.bib
//   - links (learn pages, doi.org), no project page, no Research page, no nuclear terms, data centers nowhere, the text budget
// Usage (from the site folder):  node _tests/learn/test_c0-behind-one-meter.js [--write]
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const cp = require("child_process");
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const J = p => JSON.parse(fs.readFileSync(L("data/" + p), "utf8"));
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const WRITE = process.argv.includes("--write");
const sctx = { window: { LX: {} }, module: { exports: {} }, performance };
vm.runInNewContext(fs.readFileSync(L("components/solver.js"), "utf8"), sctx);
const { core, VERSION } = sctx.module.exports;
const E0 = require(L("components/engine-e0.js")), prof = require(L("components/profiles.js")), SS = require(L("components/sharestate.js"));
const RN = require(L("components/reportnote.js")), EX = require(L("components/exemplars.js")), RB = require(L("components/rubric.js"));
const C0 = require(L("c0-behind-one-meter.js"));
const D = J("e0.json"), C = J("c0-behind-one-meter.json"), year = J("town_year.json"), T = J("cf_targets.json");
const QPATH = path.join(SITE, "learn/c0-behind-one-meter.qmd");

(async () => {
  const highs = await require(L(`vendor/highs-${VERSION}/highs.js`))();
  const solver = m => core.solveWith(highs, m, { timeLimit: 60 });
  const P = E0.prepare(D, year, T, prof.townProfile), D0 = E0.defaults();

  // ---------------- blocks
  const BLOCKS = C0.staticBlocks(D, C, P, E0, SS, RN, EX, RB);
  const MARK = { plan: "c0-plan", results: "c0-results", note: "c0-note", exemplars: "c0-exemplars", rubric: "c0-rubric", inputs: "c0-inputs" };
  function between(q, name) { const a = q.indexOf("<!-- " + name + ":start"), b = q.indexOf("<!-- " + name + ":end -->"); if (a < 0 || b < 0) return null; return { a: q.indexOf("\n", a) + 1, b: b }; }
  let Q = fs.readFileSync(QPATH, "utf8");
  if (WRITE) { Object.keys(MARK).forEach(k => { const r = between(Q, MARK[k]); if (!r) throw new Error(MARK[k] + " markers missing"); Q = Q.slice(0, r.a) + BLOCKS[k] + "\n" + Q.slice(r.b); }); fs.writeFileSync(QPATH, Q); }
  Object.keys(MARK).forEach(k => { const r = between(Q, MARK[k]); ok(r && Q.slice(r.a, r.b) === BLOCKS[k] + "\n", `page block ${MARK[k]} equals the components' output (run --write)`); });
  ok(EX.validate(C.exemplars).length === 0, "exemplars: valid (" + EX.validate(C.exemplars).join("; ") + ")");
  ok(C.rubric.competences.map(c => c.id).join() === "accounting,uncertainty,realism,communication" && C.rubric.competences.every(c => RB.COMPETENCES.some(x => x.id === c.id) && c.look), "rubric: C0's four competences (§7.9 template), each with a look-for line");

  // ---------------- the exemplars' numbers are the engine's for the default plan
  const r = await E0.solve(D0, P, { solver });
  ok(r.ok, "the default plan runs");
  const sens = await E0.sensitivity(D0, P, r, { solver });
  const m = E0.fmt.money, R = r.results, M = R.money, row = k => sens.rows.find(x => x.key === k);
  const NUMS = { "$800": m(M.saving), "$28,430": m(M.capex), "−$17,813": m(M.npv), "5.9 t": E0.fmt.num(R.co2.base, 1) + " t", "3.1 t": E0.fmt.num(R.co2.plan, 1) + " t",
    "5,240 hours": E0.fmt.num(R.tot.gridHours) + " hours", "−$10,237": m(row("cost").atLo), "−$14,717": m(row("xc").atHi), "25 years": M.horizon + " years", "4% real": D0.rate + "% real", "75%": row("cost").loText.replace(" of sourced", ""), "8¢": "8¢" };
  ok(row("xc").hiText === "8.0¢/kWh" && row("cost").loText === "75% of sourced", "sensitivity cases: equipment cost 75% and an 8¢ export credit");
  const EXT = JSON.stringify(C.exemplars);
  Object.keys(NUMS).forEach(k => ok(NUMS[k] === k && EXT.indexOf(k) >= 0, `exemplar number ${k} = the engine's ${NUMS[k]}`));
  // and no other numbers: every figure in the exemplars' text is one of the above (or the plan's 6 kW)
  const figs = (EXT.match(/−?\$\d[\d,.]*\d|\d[\d,.]* ?(t|hours|years|% real|%|¢|kW)\b/g) || []).map(x => x.trim());
  ok(figs.every(x => x === "6 kW" || Object.keys(NUMS).some(k => k.indexOf(x) >= 0)), "the exemplars hold no other figures: " + figs.filter(x => x !== "6 kW" && !Object.keys(NUMS).some(k => k.indexOf(x) >= 0)).join(", "));
  ok(E0.heading(D0) === "The Prairie Town home: 6 kW of rooftop solar" && /6 kW of rooftop solar/.test(C.exemplars.lede), "the exemplars are about the default plan");

  // ---------------- the sensitivity line and the note's checks
  const sl = C0.sensLine(D0, sens, E0);
  const widest = sens.rows.slice().sort((a, b) => Math.abs(b.atHi - b.atLo) - Math.abs(a.atHi - a.atLo))[0];
  ok(sl && sl.inputLabel === widest.label && sl.cases.length === 2 && sl.base.value === m(sens.base), "the note's sensitivity line is the widest swing: " + RN.sensitivityLine(sl));
  ok(widest.key === "cost", "for the default plan, the equipment cost moves the NPV most");
  const note = E0.note(D0, R); note.link = "https://henryutd2021.github.io/learn/c0-behind-one-meter.html#" + SS.encode(E0.schemaFor("c0"), D0); note.sensitivity = sl;
  const good = C.exemplars.answers.find(a => a.key === "good"), text = good.parts.map(p => typeof p === "string" ? p : p.text).join(""), sent = text.split(/(?<=\.)\s+/);
  const words = { recommend: sent[0] + " " + sent[1], alone: sent[2], change: sent[3] };
  const all = RN.checks(note, words, C.note.fields);
  ok(all.all, "a note in the strong exemplar's words passes every check (" + all.items.filter(i => !i.ok).map(i => i.label).join(", ") + ")");
  ok(RN.countWords(RN.compose(note, words, C.note.fields, { format: "md" })) <= RN.PAGE_WORDS, "the note fits on one page (" + RN.countWords(RN.compose(note, words, C.note.fields, { format: "text" })) + " words)");
  const empty = RN.checks(note, {}, C.note.fields);
  ok(!empty.all && empty.items.filter(i => /^field-/.test(i.id)).every(i => !i.ok), "an empty note fails the three fields");
  const stale = Object.assign({}, note, { run: { ok: true, stale: true } });
  ok(!RN.checks(stale, words, C.note.fields).items.find(i => i.id === "run").ok && /earlier plan/.test(RN.compose(stale, words, C.note.fields, { format: "text" })), "a stale run is flagged in the note");
  const nos = Object.assign({}, note, { sensitivity: null });
  ok(!RN.checks(nos, words, C.note.fields).items.find(i => i.id === "sensitivity").ok, "no sensitivity run: the check says so");
  ok(!RN.CLAIMS.test(JSON.stringify(C)) && !RN.CLAIMS.test(fs.readFileSync(L("c0-behind-one-meter.js"), "utf8").replace(/\/\/[^\n]*/g, "")), "no claim of saving or sending the note");
  const farm = await E0.solve(Object.assign({}, D0, { site: "farm", el: 50 }), P, { solver });
  ok(E0.note(Object.assign({}, D0, { site: "farm", el: 50 }), farm.results).heading === "The ridge wind farm: 150 MW of wind and a 50 MW electrolyzer", "the note names the wind farm's plan");

  // ---------------- Henry's research: approved sentences only (curriculum §13)
  const SECTIONS = ["E3", "E4"];
  const norm = s => String(s).replace(/\[\[[a-z0-9-]+\|([^\]]+)\]\]/g, "$1").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, " ").replace(/ ([.,;:?!)])/g, "$1").trim();
  function portfolio() {
    const c = [process.env.LEARN_PORTFOLIO, path.join(SITE, "..")];
    try { c.push(path.resolve(SITE, cp.execSync("git rev-parse --git-common-dir", { cwd: SITE, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(), "..", "..")); } catch (e) { /* not git */ }
    return c.filter(Boolean).find(p => fs.existsSync(path.join(p, "reports/learn/excerpts_for_approval.md")));
  }
  const SNAPSHOT = {   // excerpts_for_approval.md, the rows C0 uses, 2026-11-03
    "E3.2": "As the hydrogen price rose, the optimizer built a larger electrolyzer to use more surplus wind.",
    "E3.3": "The larger unit ran at lower utilization, so each kilogram carried more capital and the levelized cost of hydrogen rose, while hydrogen revenue lowered total system cost.",
    "E4.1": "Among the cases studied, concentrated solar power with thermal storage running a high-temperature electrolyzer at variable power gave the lowest levelized cost of hydrogen; constant-power operation was the most expensive.",
    "E4.2": "Yardstick here: the cost per kilogram across designs. Holds for: one West Texas site, cost projections from NREL's Annual Technology Baseline, a conference-length study." };
  function register(md) {
    const out = {}; let sec = null;
    md.split("\n").forEach(line => {
      if (/^## /.test(line)) { const h = line.match(/^## (E\d+)\.|^## (Revisions after review)/); sec = h ? (h[1] || "REV") : null; return; }
      const mm = line.match(/^\| (E(\d+)\.\d+) \| (.*) \|\s*$/);
      if (!mm || !sec || SECTIONS.indexOf("E" + mm[2]) < 0) return;
      const cells = mm[3].split(" | ");
      if (sec === "REV") out[mm[1]] = norm(cells[1]); else if (sec === "E" + mm[2]) out[mm[1]] = norm(cells[0].replace(/^(Timeline, [^:]+|Myth answer|Citation): /, ""));
    });
    return out;
  }
  const RP = portfolio();
  let APPROVED = SNAPSHOT;
  if (RP) {
    const reg = register(fs.readFileSync(path.join(RP, "reports/learn/excerpts_for_approval.md"), "utf8"));
    Object.keys(SNAPSHOT).forEach(k => ok(reg[k] === SNAPSHOT[k], `the register's ${k} equals this test's snapshot`));
    APPROVED = reg;
  } else console.log("note: excerpts_for_approval.md not found (set LEARN_PORTFOLIO); checked against the snapshot");
  const UNITS = Object.values(APPROVED).map(norm);
  const approved = s => { s = norm(s); return s.length > 0 && UNITS.some(u => u === s || u.indexOf(s) === 0 && /^[.;:]? ?/.test(u.slice(s.length)) && /[.;:]$/.test(s) || u.indexOf(" " + s) > 0 && /[.;:] $/.test(u.slice(0, u.indexOf(" " + s) + 1)) && (u.endsWith(s) || /[.;:]$/.test(s))); };
  const OWN = Q.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?<!-- learn:\1:end -->/g, "").replace(/<!-- (?!c0-)[\s\S]*?-->/g, " ");
  const quotes = [...OWN.matchAll(/<blockquote class="lx-excerpt" data-source="([^"]+)">([\s\S]*?)<footer>([\s\S]*?)<\/footer><\/blockquote>/g)];
  ok(quotes.length === 2 && quotes.map(q => q[1]).join() === "excerpt:wind-hydrogen,excerpt:solar-hydrogen", "two excerpts, from C0's sources (excerpt:wind-hydrogen, excerpt:solar-hydrogen)");
  const qs = quotes.flatMap(q => [...q[2].matchAll(/<p>([\s\S]*?)<\/p>/g)].map(x => norm(x[1])));
  ok(qs.length === 3 && qs.every(s => UNITS.indexOf(s) >= 0), "every excerpt sentence is approved, word for word: " + qs.filter(s => UNITS.indexOf(s) < 0).join(" | "));
  quotes.forEach(q => ok(/^Approved excerpt of: Li et al\. \(\d{4}\), <a href="https:\/\/doi\.org\/[^"]+">(Journal of Mechanical Design|EEM 2023)<\/a>\.$/.test(q[3]), "excerpt footer: a provenance label with the DOI"));
  // every other text element that names a study, an author, a site or a method is approved or listed
  const RX = /\b(stud(y|y's|ies|ies')|paper|article|journal|Li et al|course author|excerpt|research|published|REopt|ERCOT|West Texas|253 MW|optimizer|configurations?|utilization|conference)\b/i;
  // LISTED: what may name a study (or use a study word) without describing Henry's work, each with its reason
  const LISTED = [/^Approved excerpt of: Li et al\. \(\d{4}\), (Journal of Mechanical Design|EEM 2023)\.$/,   // provenance label
    /^Li et al\. \(20\d\d\)\. .+\.$/,                                                                // citation (title checked below)
    /^Say which yardstick your note uses\. Case file CF2 takes the first case apart\.$/,                 // pointer to CF2
    /^Go deeper · ResearcherFrom this capstone to your own study$/,                                       // course label
    /^The same plan, note and self-check grow into the research project \(CR, upcoming\): .+\.$/];        // the course's CR, not a study
  const GEN = /<!-- (c0-[a-z]+):start[\s\S]*?<!-- \1:end -->/g;   // generated blocks: component and engine text, checked above
  const rest = OWN.replace(/<blockquote class="lx-excerpt"[\s\S]*?<\/blockquote>/g, " ").replace(/^---[\s\S]*?\n---\n/, " ").replace(GEN, " ");
  const elems = rest.split(/<\/?(?:p|li|ul|ol|dt|dd|div|summary|h[1-6]|footer|table|tr|td|th)\b[^>]*>|\n- |```[^\n]*\n?/).map(t => norm(t.replace(/\[([^\]]+)\]\{[^}]*\}/g, "$1").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1"))).filter(t => t && /[A-Za-z]/.test(t) && !/^(:::|\{=html\})/.test(t));
  const bad = elems.filter(t => RX.test(t) && !approved(t) && !LISTED.some(x => x.test(t)) && !t.split(/(?<=[.?!])\s+/).every(x => approved(x) || LISTED.some(y => y.test(x))));
  ok(bad.length === 0, "research wording: approved or listed:\n  " + bad.join("\n  "));
  const FM = (Q.match(/^---\n([\s\S]*?)\n---/) || [])[1] || "";
  ok(![...FM.matchAll(/^(title|subtitle|description): "(.*)"$/gm)].some(x => RX.test(x[2])), "front matter: names no study");
  ok(!RX.test(JSON.stringify(C).replace(/"about": "[^"]*"/, "")) , "the data file names no study");
  if (RP) {
    const bib = fs.readFileSync(path.join(RP, "inputs/publications.bib"), "utf8"), titles = [...bib.matchAll(/^\s*title\s*=\s*\{(.*)\},?\s*$/gm)].map(x => x[1].replace(/[{}]/g, "").toLowerCase());
    const cites = [...OWN.matchAll(/<li>Li et al\. \((\d{4})\)\. <a href="(https:\/\/doi\.org\/[^"]+)">([^<]+)<\/a>\./g)];
    ok(cites.length === 2, "two cited papers");
    cites.forEach(c => ok(titles.indexOf(c[3].toLowerCase()) >= 0, "cited title as in publications.bib: " + c[3].slice(0, 50)));
  }

  // ---------------- links, scope, text
  const hrefs = [...OWN.matchAll(/href="([^"]+)"/g)].map(x => x[1]);
  const OKLINK = h => /^https:\/\/doi\.org\/10\./.test(h) || /^[0-9a-z-]+\.html(#[a-z-]+)?$/.test(h) || /^\.\.\/assets\//.test(h) || /^https:\/\/([a-z.]+\.)?(eia\.gov|nlr\.gov|energy\.gov)\//.test(h);
  ok(hrefs.every(OKLINK), "links: learn pages, doi.org and the engine's agency sources only (" + hrefs.filter(h => !OKLINK(h)).join(", ") + ")");
  ok(!/projects\/|research\.html/.test(Q), "no project page and no Research page");
  const ALL = Q + fs.readFileSync(L("c0-behind-one-meter.js"), "utf8") + JSON.stringify(C);
  ok(!/nuclear|reactor|\bSMR\b|small modular/i.test(ALL) && !/data[- ]cent/i.test(ALL) && !/\bAI\b|artificial intelligence|ChatGPT|Claude/.test(ALL), "no nuclear terms, no data centers, no AI wording");
  const prose = OWN.replace(GEN, " ").replace(/<table[\s\S]*?<\/table>/g, " ").replace(/<blockquote[\s\S]*?<\/blockquote>/g, " ").replace(/^---[\s\S]*?\n---\n/, " ")
    .split(/<\/?(?:p|li|dt|dd|div|summary|h[1-6])\b[^>]*>|\n- /).map(t => norm(t.replace(/\[([^\]]+)\]\{[^}]*\}/g, "$1").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1"))).filter(t => t && /[A-Za-z]/.test(t) && !/^(:::|```)/.test(t));
  prose.forEach(t => ok(t.split(" ").length <= 45, "text element within 45 words: " + t.slice(0, 70)));
  C.note.fields.forEach(f => ok(f.hint.split(" ").length <= 25, "note field hint within 25 words: " + f.label));

  console.log(`${checks - fails}/${checks} checks passed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
