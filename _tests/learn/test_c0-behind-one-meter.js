// test_c0-behind-one-meter.js — Node tests for capstone C0 (learn/c0-behind-one-meter.qmd, assets/learn/c0-behind-one-
// meter.js, data/c0-behind-one-meter.json), built on engine E0 (assets/learn/components/engine-e0.js):
//   - the seven generated blocks (the plan's controls, the default plan's link and sensitivity for the no-JS route, its
//     results, the note's outline, the exemplars, the rubric, the inputs) equal the components' own output (write them
//     with --write, which also writes the data file's reference: the default plan's sensitivity)
//   - every number in the exemplars is the engine's for the default plan: its NPV, saving, cost, CO₂ (bought power and
//     gas, and the net of power sent back), grid hours and two sensitivity cases (re-solved here with HiGHS)
//   - the sensitivity the note carries (every bar of the chart in numbers), and the note's checks: a full note passes
//     every one and fits on a page; an empty one fails the reader's fields; a stale run is flagged; a farm's note keeps
//     each result's boundary (CO₂, the wind-only comparison, what the cost per kg leaves out)
//   - the brief and the bar: the farm's equipment-cost case at 125% equals a fresh solve; the brief, the
//     rubric's note and the exemplars agree on the bar (the "Look for" lines); the owner's goal is stated; the Modeler
//     task asks only for what the M4 notebook computes
//   - the course author's research (the course's sourcing rule): every excerpt sentence is an approved sentence of the
//     excerpt wording (E3, E4, with the revisions after review), word for word, with an allowed data-source key; every
//     other sentence that names a study, author or site is approved or listed below; the cited titles are those of the
//     author's publication list
//   - links (learn pages, doi.org), no project page, no Research page, no nuclear terms, data centers nowhere, the text budget
// Usage (from the site folder):  node _tests/learn/test_c0-behind-one-meter.js [--write]
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const PRIV = require("./private_sources.js");
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

  // ---------------- the default plan's sensitivity (the no-JS route's table; written into the data file by --write)
  const r = await E0.solve(D0, P, { solver });
  ok(r.ok, "the default plan runs");
  const sens = await E0.sensitivity(D0, P, r, { solver });
  if (WRITE) {
    C.reference = { about: "The default plan's sensitivity, shown when JavaScript is off, solved with engine E0 and HiGHS.", date: new Date().toLocaleDateString("en-CA"), sens: sens };
    let txt = fs.readFileSync(L("data/c0-behind-one-meter.json"), "utf8"), at = txt.lastIndexOf(',\n "reference"');
    if (at < 0) at = txt.lastIndexOf("\n}");
    fs.writeFileSync(L("data/c0-behind-one-meter.json"), txt.slice(0, at) + ',\n "reference": ' + JSON.stringify(C.reference) + "\n}\n");
  }
  const CR = J("c0-behind-one-meter.json");
  ok(CR.reference && JSON.stringify(CR.reference.sens.rows.map(x => [x.key, Math.round(x.atLo), Math.round(x.atHi)])) === JSON.stringify(sens.rows.map(x => [x.key, Math.round(x.atLo), Math.round(x.atHi)])) && Math.round(CR.reference.sens.base) === Math.round(sens.base),
    "the stored no-JS sensitivity equals a fresh one (run --write)");

  // ---------------- blocks
  const BLOCKS = C0.staticBlocks(D, CR, P, E0, SS, RN, EX, RB);
  BLOCKS.whole = C0.wholeHTML(CR, E0, SS, RN, r.results, CR.reference.sens, CR.reference.date, "https://henryutd2021.github.io/learn/c0-behind-one-meter.html");
  const MARK = { plan: "c0-plan", nojs: "c0-nojs", results: "c0-results", note: "c0-note", exemplars: "c0-exemplars", rubric: "c0-rubric", inputs: "c0-inputs", whole: "c0-whole" };
  function between(q, name) { const a = q.indexOf("<!-- " + name + ":start"), b = q.indexOf("<!-- " + name + ":end -->"); if (a < 0 || b < 0) return null; return { a: q.indexOf("\n", a) + 1, b: b }; }
  let Q = fs.readFileSync(QPATH, "utf8");
  if (WRITE) { Object.keys(MARK).forEach(k => { const r = between(Q, MARK[k]); if (!r) throw new Error(MARK[k] + " markers missing"); Q = Q.slice(0, r.a) + BLOCKS[k] + "\n" + Q.slice(r.b); }); fs.writeFileSync(QPATH, Q); }
  Object.keys(MARK).forEach(k => { const r = between(Q, MARK[k]); ok(r && Q.slice(r.a, r.b) === BLOCKS[k] + "\n", `page block ${MARK[k]} equals the components' output (run --write)`); });
  ok(EX.validate(C.exemplars).length === 0, "exemplars: valid (" + EX.validate(C.exemplars).join("; ") + ")");
  ok(C.rubric.competences.map(c => c.id).join() === "accounting,uncertainty,realism,communication" && C.rubric.competences.every(c => RB.COMPETENCES.some(x => x.id === c.id) && c.look), "rubric: C0's four competences (the capstone template), each with a look-for line");

  // ---------------- the exemplars' numbers are the engine's for the default plan
  const m = E0.fmt.money, R = r.results, M = R.money, row = k => sens.rows.find(x => x.key === k);
  const NUMS = { "$800": m(M.saving), "$28,430": m(M.capex), "−$17,813": m(M.npv), "5.9 t": E0.fmt.num(R.co2.base, 1) + " t", "4.6 t": E0.fmt.num(R.co2.plan, 1) + " t", "3.1 t": E0.fmt.num(R.co2.net, 1) + " t",
    "5,240 hours": E0.fmt.num(R.tot.gridHours) + " hours", "−$10,237": m(row("cost").atLo), "−$14,717": m(row("xc").atHi), "25 years": M.horizon + " years", "4% real": D0.rate + "% real", "75%": row("cost").loText.replace(" of sourced", ""), "8¢": "8¢" };
  ok(row("xc").hiText === "8.0¢/kWh" && row("cost").loText === "75% of sourced", "sensitivity cases: equipment cost 75% and an 8¢ export credit");
  const EXT = JSON.stringify(C.exemplars);
  Object.keys(NUMS).forEach(k => ok(NUMS[k] === k && EXT.indexOf(k) >= 0, `exemplar number ${k} = the engine's ${NUMS[k]}`));
  // and no other numbers: every figure in the exemplars' text is one of the above (or the plan's 6 kW)
  const figs = (EXT.match(/−?\$\d[\d,.]*\d|\d[\d,.]* ?(t|hours|years|% real|%|¢|kW)\b/g) || []).map(x => x.trim());
  ok(figs.every(x => x === "6 kW" || Object.keys(NUMS).some(k => k.indexOf(x) >= 0)), "the exemplars hold no other figures: " + figs.filter(x => x !== "6 kW" && !Object.keys(NUMS).some(k => k.indexOf(x) >= 0)).join(", "));
  ok(E0.heading(D0) === "The Prairie Town home: 6 kW of rooftop solar" && /6 kW of rooftop solar/.test(C.exemplars.lede), "the exemplars are about the default plan");

  // ---------------- the sensitivity the note carries and the note's checks
  const sl = C0.sensLine(D0, sens, E0);
  const widest = sens.rows.slice().sort((a, b) => Math.abs(b.atHi - b.atLo) - Math.abs(a.atHi - a.atLo))[0];
  ok(sl && sl.metric === "NPV" && sl.base.value === m(sens.base) && sl.rows[0].label === widest.label && sl.rows.length === sens.rows.length &&
    sens.rows.every(x => sl.rows.some(y => y.label === x.label && y.lo.value === m(x.atLo) && y.hi.value === m(x.atHi))) && /held fixed/.test(sl.held), "the note's sensitivity is every bar of the chart, widest first, as rows");
  { const txt = RN.compose(Object.assign(E0.note(D0, R), { sensitivity: sl }), {}, C.note.fields, { format: "text" }), md = RN.compose(Object.assign(E0.note(D0, R), { sensitivity: sl }), {}, C.note.fields, { format: "md" });
    const sec = txt.slice(txt.indexOf("SENSITIVITY"), txt.indexOf("RECOMMENDATION") > txt.indexOf("SENSITIVITY") ? txt.indexOf("RECOMMENDATION") : txt.indexOf("WHAT THE SITE"));
    ok(sens.rows.every(x => sec.indexOf("- " + x.label + ": " + m(x.atLo) + " at " + x.loText + "; " + m(x.atHi) + " at " + x.hiText) >= 0) && /\| Input \| NPV, low case; high case \|/.test(md),
      "the copied note (text and Markdown) carries one row per bar, its two cases in it: the chart's numbers, in every format");
    ok(RN.sensitivityLine(sl).split(/\s+/).length <= 35 && sec.split("\n").every(l => l.split(/\s+/).length <= 35), "the note's sensitivity: a short line and one row per case, each within 35 words (it was one paragraph of about 70)"); }
  ok(widest.key === "cost", "for the default plan, the equipment cost moves the NPV most");
  const note = E0.note(D0, R); note.link = "https://henryutd2021.github.io/learn/c0-behind-one-meter.html" + C0.hashOf(SS, E0, D0); note.sensitivity = sl;
  const words = C0.exemplarWords(C);
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
  const FS = Object.assign({}, D0, { site: "farm", el: 50 }), farm = await E0.solve(FS, P, { solver }), fn = E0.note(FS, farm.results);
  ok(fn.heading === "The ridge wind farm: 150 MW of wind and a 50 MW electrolyzer", "the note names the wind farm's plan");
  const fres = k => fn.results.find(x => x.label === farm.results.readouts.find(y => y.key === k).label);
  ok(fres("co2") && /^\d/.test(fres("co2").value) && /replaces hydrogen made from gas/.test(fres("co2").note) && /alone/.test(fres("added").note) && /counted as free/.test(fres("lcoh").note),
    "a farm's note keeps the CO₂ row and each result's boundary: " + RN.compose(fn, {}, C.note.fields, { format: "text" }).split("\n").filter(l => /CO₂|alone|free/.test(l)).join(" | "));
  ok(fn.results.every(x => x.note) && /potential saving/.test(fn.assumptions.join(" ")), "every result in the note carries its note; the CO₂ assumption says potential");
  ok(/grid line not costed/.test(farm.results.readouts.find(x => x.key === "npv").note) && fn.assumptions.some(a => /The grid line is an assumed limit; building or upgrading it is not costed/.test(a)) && !E0.note(D0, R).assumptions.some(a => /connection limit/.test(a)) &&
    E0.inputRows(D, P).some(x => x[0] === "Farm: line to the grid" && /not costed/.test(x[1])), "the farm's NPV, its note's assumptions and the inputs say the line to the grid is an assumed limit, its cost not counted");
  // the longest notes: farm plans with every piece of equipment, their sensitivity and the shortest fields the checks
  // allow, still fit on one page (the reader cannot shorten the bench's parts)
  { const short = { recommend: "w ".repeat(12).trim(), alone: "w ".repeat(8).trim(), change: "w ".repeat(8).trim() };
    for (const extra of [{ el: 50, fb: 200, tank: 20 }, { el: 100, fb: 300, tank: 20, sale: "tou" }]) {
      const s4 = Object.assign({}, D0, { site: "farm" }, extra), b4 = await E0.solve(s4, P, { solver }), n4 = E0.note(s4, b4.results), sn4 = await E0.sensitivity(s4, P, b4, { solver });
      n4.link = "https://henryutd2021.github.io/learn/c0-behind-one-meter.html" + C0.hashOf(SS, E0, s4); n4.sensitivity = C0.sensLine(s4, sn4, E0);
      const wc4 = Math.max(RN.countWords(RN.compose(n4, short, C.note.fields, { format: "md" })), RN.countWords(RN.compose(n4, short, C.note.fields, { format: "text" })));
      ok(b4.ok && wc4 <= RN.PAGE_WORDS && RN.checks(n4, short, C.note.fields).items.find(i => i.id === "page").ok && RN.sensitivityLine(n4.sensitivity).split(/\s+/).length <= 35, "a farm note with " + JSON.stringify(extra) + " and the shortest fields fits on one page (" + wc4 + " words of " + RN.PAGE_WORDS + ")");
    } }
  // the farm's equipment-cost case (the review's: 50 MW at $3.25/kg, 125%) equals a fresh solve
  {
    const s3 = Object.assign({}, D0, { site: "farm", el: 50, h2: 3.25 }), b3 = await E0.solve(s3, P, { solver }), sn3 = await E0.sensitivity(s3, P, b3, { solver });
    const hi = await E0.solve(Object.assign({}, s3, { cost: 125 }), P, { solver }), cr = sn3.rows.find(x => x.key === "cost");
    ok(Math.abs(cr.atHi - hi.results.money.npv) < 1 && cr.rerun && Math.round(cr.atHi / 1e4) === Math.round(-303.98e6 / 1e4), "farm at $3.25/kg, equipment cost 125%: " + m(cr.atHi) + " = a fresh solve (it read −$301.07M before the review)");
  }
  // the no-JS route: the default plan's link opens the default plan; the table is the fresh sensitivity
  {
    const lk = C0.hashOf(SS, E0, D0), d = SS.decode(E0.schemaFor("c0"), lk);
    ok(d.status === "ok" && SS.same(E0.schemaFor("c0"), d.state, D0) && BLOCKS.nojs.indexOf("<code>" + lk + "</code>") > 0, "no-JS: the default plan's link (this page's address and its hash) is on the page and opens the default plan");
    ok(sens.rows.every(x => BLOCKS.nojs.indexOf(m(x.atLo)) > 0 && BLOCKS.nojs.indexOf(m(x.atHi)) > 0), "no-JS: the sensitivity table carries every bar");
  }
  // the bar is the same everywhere: the brief's "done when", the rubric's lede and note, the exemplars' levels
  {
    const brief = (Q.match(/<li><b>Done when:<\/b>([^<]*)<\/li>/) || [])[1] || "";
    const comm = C.rubric.competences.find(c => c.id === "communication");
    ok(/"Look for" line/.test(brief) && !/Proficient/.test(brief) && /Look for/.test(C.rubric.note) && !/six pages/.test(C.rubric.note) && /Look for/.test(C.rubric.lede) && C.exemplars.answers.every(a => /Look for/.test(a.level)) &&
       C.rubric.bar === "the bar for this note" && /^a one-page note with the plan link/.test(comm.levels.proficient),
      "the bar is the 'Look for' lines in the brief, the rubric's lede and note and the exemplars; Communication's Proficient is C0's one-page note, in its own words");
    ok(/owner's goal/.test(Q) && /owner wants/.test(C.exemplars.task) && /owner wants/.test(words.recommend) && /owner's goal/.test(C.note.fields[0].hint), "the owner's goal: in the brief, the task, the strong note and the field's hint");
    ok(/does any tested input change the recommendation/.test(C.note.fields.find(f => f.key === "change").hint) && !/how far/.test(JSON.stringify(C.note)), "the last field asks whether the tested ranges change the answer, not for an unbracketed threshold");
    const mod = (Q.match(/Go deeper · Modeler<\/span>[\s\S]*?<\/details>/) || [""])[0];
    ok(/weekly saving from adding the electrolyzer and tank/.test(mod) && /has no NPV/.test(mod) && !/notebook's NPV/.test(mod), "the Modeler task asks for what the M4 notebook computes (its weekly savings), not an NPV it has not");
  }

  // ---------------- the course author's research: approved sentences only (the sourcing rule)
  const SECTIONS = ["E3", "E4"];
  const norm = s => String(s).replace(/\[\[[a-z0-9-]+\|([^\]]+)\]\]/g, "$1").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, " ").replace(/ ([.,;:?!)])/g, "$1").trim();
  const SNAPSHOT = {   // the approved wording, the rows C0 uses
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
  const RP = PRIV.all("excerpts", "publications");   // the wording checks also read the publication list
  let APPROVED = SNAPSHOT;
  if (RP) {
    const reg = register(fs.readFileSync(RP, "utf8"));
    Object.keys(SNAPSHOT).forEach(k => ok(reg[k] === SNAPSHOT[k], `the approved wording's ${k} equals this test's snapshot`));
    APPROVED = reg;
  } else console.log("note: the approved excerpt wording and the publication list are not both available (set LEARN_SOURCES); checked against the snapshot");
  const UNITS = Object.values(APPROVED).map(norm);
  const approved = s => { s = norm(s); return s.length > 0 && UNITS.some(u => u === s || u.indexOf(s) === 0 && /^[.;:]? ?/.test(u.slice(s.length)) && /[.;:]$/.test(s) || u.indexOf(" " + s) > 0 && /[.;:] $/.test(u.slice(0, u.indexOf(" " + s) + 1)) && (u.endsWith(s) || /[.;:]$/.test(s))); };
  const OWN = Q.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?<!-- learn:\1:end -->/g, "").replace(/<!-- (?!c0-)[\s\S]*?-->/g, " ");
  const quotes = [...OWN.matchAll(/<blockquote class="lx-excerpt" data-source="([^"]+)">([\s\S]*?)<footer>([\s\S]*?)<\/footer><\/blockquote>/g)];
  ok(quotes.length === 2 && quotes.map(q => q[1]).join() === "excerpt:wind-hydrogen,excerpt:solar-hydrogen", "two excerpts, from C0's sources (excerpt:wind-hydrogen, excerpt:solar-hydrogen)");
  const qs = quotes.flatMap(q => [...q[2].matchAll(/<p>([\s\S]*?)<\/p>/g)].map(x => norm(x[1])));
  ok(qs.length === 3 && qs.every(s => UNITS.indexOf(s) >= 0), "every excerpt sentence is approved, word for word: " + qs.filter(s => UNITS.indexOf(s) < 0).join(" | "));
  quotes.forEach(q => ok(/^From: Li et al\. \(\d{4}\), <a href="https:\/\/doi\.org\/[^"]+">(Journal of Mechanical Design|EEM 2023)<\/a>\.$/.test(q[3]), "excerpt footer: a provenance label with the DOI"));
  // every other text element that names a study, an author, a site or a method is approved or listed
  const RX = /\b(stud(y|y's|ies|ies')|paper|article|journal|Li et al|course author|excerpt|research|published|REopt|ERCOT|West Texas|253 MW|optimizer|configurations?|utilization|conference)\b/i;
  // LISTED: what may name a study (or use a study word) without describing the course author's work, each with its reason
  const LISTED = [/^From: Li et al\. \(\d{4}\), (Journal of Mechanical Design|EEM 2023)\.$/,   // provenance label
    /^Li et al\. \(20\d\d\)\. .+\.$/,                                                                // citation (title checked below)
    /^Say which yardstick your note uses\. Case file CF2 takes the first case apart\.$/,                 // pointer to CF2
    /^Go deeper · ResearcherFrom this capstone to your own study$/,                                       // course label
    /^The same plan, note and self-check grow into the research project \(CR(?:, upcoming)?\): .+\.$/];        // the course's CR, not a study
  const GEN = /<!-- (c0-[a-z]+):start[\s\S]*?<!-- \1:end -->/g;   // generated blocks: component and engine text, checked above
  const rest = OWN.replace(/<blockquote class="lx-excerpt"[\s\S]*?<\/blockquote>/g, " ").replace(/^---[\s\S]*?\n---\n/, " ").replace(GEN, " ");
  const elems = rest.split(/<\/?(?:p|li|ul|ol|dt|dd|div|summary|h[1-6]|footer|table|tr|td|th)\b[^>]*>|\n- |```[^\n]*\n?/).map(t => norm(t.replace(/\[([^\]]+)\]\{[^}]*\}/g, "$1").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1"))).filter(t => t && /[A-Za-z]/.test(t) && !/^(:::|\{=html\})/.test(t));
  const bad = elems.filter(t => RX.test(t) && !approved(t) && !LISTED.some(x => x.test(t)) && !t.split(/(?<=[.?!])\s+/).every(x => approved(x) || LISTED.some(y => y.test(x))));
  ok(bad.length === 0, "research wording: approved or listed:\n  " + bad.join("\n  "));
  const FM = (Q.match(/^---\n([\s\S]*?)\n---/) || [])[1] || "";
  ok(![...FM.matchAll(/^(title|subtitle|description): "(.*)"$/gm)].some(x => RX.test(x[2])), "front matter: names no study");
  ok(!RX.test(JSON.stringify(C).replace(/"about": "[^"]*"/, "")) , "the data file names no study");
  if (RP) {
    const bib = fs.readFileSync(PRIV.path("publications"), "utf8"), titles = [...bib.matchAll(/^\s*title\s*=\s*\{(.*)\},?\s*$/gm)].map(x => x[1].replace(/[{}]/g, "").toLowerCase());
    const cites = [...OWN.matchAll(/<li>Li et al\. \((\d{4})\)\. <a href="(https:\/\/doi\.org\/[^"]+)">([^<]+)<\/a>\./g)];
    ok(cites.length === 2, "two cited papers");
    cites.forEach(c => ok(titles.indexOf(c[3].toLowerCase()) >= 0, "cited title as in the publication list: " + c[3].slice(0, 50)));
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
  prose.forEach(t => ok(t.split(" ").length <= 35, "text element within 35 words: " + t.slice(0, 70)));
  // the generated text a reader sees: each exemplar line and note, the rubric's lede and note, the chart's note
  const wc = t => String(t).replace(/\[\[[a-z0-9-]+\|([^\]]+)\]\]/g, "$1").split(/\s+/).filter(Boolean).length;
  C.exemplars.answers.forEach(a => { a.parts.map(q => typeof q === "string" ? q : q.text).join("").split("\n").forEach(l => ok(wc(l) <= 35, "exemplar line within 35 words (" + wc(l) + "): " + l.slice(0, 50))); EX.marks(a).forEach(x => ok(wc(x.note) <= 35, "exemplar note within 35 words: " + x.note.slice(0, 50))); });
  [C.exemplars.lede, C.exemplars.task, C.exemplars.note, C.rubric.lede, C.rubric.note, C.note.lede, C.sensitivity.lede, E0.sensWords(D0, sens).note].forEach(t => ok(wc(t) <= 35, "generated text within 35 words (" + wc(t) + "): " + t.slice(0, 50)));
  C.note.fields.forEach(f => ok(f.hint.split(" ").length <= 25, "note field hint within 25 words: " + f.label));
  // the generated tables: every cell of the inputs table within 35 words (one idea a row)
  E0.inputRows(D, P).forEach(x => ok(wc(x[1]) <= 35, "inputs cell within 35 words (" + wc(x[1]) + "): " + x[0]));
  // the rubric: C0's own level words for all four competences, Proficient each "Look for" line (the bar)
  C.rubric.competences.forEach(c => { const k = RB.competence(c); ok(c.levels && ["developing", "proficient", "strong"].every(l => c.levels[l] && wc(c.levels[l]) <= 35) && wc(c.look) <= 35, "rubric " + c.id + ": its own developing, proficient and strong words for this note, each within 35 words"); });
  ok(/the farm whole and against its wind alone/.test(C.rubric.competences[0].look) && /potential saving/.test(C.rubric.competences[0].look) && !/against the same site with nothing new/.test(JSON.stringify(C.rubric)), "accounting: the home and the farm each have their boundary (the farm's NPV is the whole plant's, its CO₂ a potential saving)");
  ok(/the three parts you write; with the bench's parts/.test(C.exemplars.answers.find(a => a.key === "good").level) && /the chart stays on the page the link opens/.test(Q), "the strong note is labelled as the parts the reader writes; the brief says where the chart stays");
  { const W = BLOCKS.whole; ok(sens.rows.every(x => W.indexOf(m(x.atLo)) > 0 && W.indexOf(m(x.atHi)) > 0) && /LIMITS OF THIS ANALYSIS/.test(W) && /ASSUMPTIONS/.test(W) && W.indexOf(words.recommend.slice(0, 40)) > 0, "the assembled strong note shows every sensitivity case, the assumptions and the limits with the reader's three parts"); }
  ok(/Text version: this week, hour by hour/.test(fs.readFileSync(L("components/engine-e0.js"), "utf8")) && /"Needs the grid"/.test(fs.readFileSync(L("components/engine-e0.js"), "utf8")) && /"At a limit"/.test(fs.readFileSync(L("components/engine-e0.js"), "utf8")), "the week chart's text versions: day by day, and hour by hour with when the site needs the grid or meets a limit");

  console.log(`${checks - fails}/${checks} checks passed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
