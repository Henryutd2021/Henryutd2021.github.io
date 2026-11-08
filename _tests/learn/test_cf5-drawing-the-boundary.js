// test_cf5-drawing-the-boundary.js — Node tests for case file CF5 (assets/learn/cf5-drawing-the-boundary.js, its data
// file and the page, learn/cf5-drawing-the-boundary.qmd):
//   - the toy (the course's own: a generic steam plant and one load, average power over one hour) recomputed from first
//     principles: the electric chiller's use, the steam the absorption chiller takes and the turbine work it costs; the
//     two consistent views equal the flow differences (turbine output, the site's net exchange with the grid), and the
//     two "turbine loss ignored" views equal them with the loss added back; their verdicts, for every setting
//     the sliders allow (feedback true for every input); the hot hour (its derating shown), the planned
//     outage, the grid's import or export from the site's net; the myths' and worked answers' numbers
//   - the four no-JS blocks (timeline, toy, boundary, worked answers) equal what the components write from the data
//     (--write rewrites them)
//   - live: the page is learn/<id>.qmd and no draft is left in learn/_drafts/; path.yml status: active; path.json lists
//     CF5 as live; its sidecar's glossary terms name CF5 in glossary.json
//   - research wording (the course's sourcing rule), as CF2's, CF3's and CF8's tests: every sentence about the study on
//     the page, in the data file and in this script's strings is an APPROVED E14 sentence of the excerpt wording, word
//     for word, or a clause of one where a layout-only split breaks it (a dd with data-e14 joins back to its row; E14.13,
//     E14.14 and E14.20 at their own breaks); the approved set is E14.1-E14.15, E14.16b (in place of E14.16),
//     E14.17-E14.23 and E14.24 in its original wording; a snapshot of it in this test must equal the approved wording; its
//     status line says approved; E14.16 (capital costs) is not used; the excerpt's footer and the boundary
//     card's source line are E14.24 with its visible label "From: " in place of the wording's "Approved excerpt of: " (CF7's
//     footer form) and the draft-period "Source: ..." line is gone; "approved" appears nowhere a reader sees; each placement
//     is where the approved wording says (--places lists them)
//   - scope (the nuclear scope rule, data centers as loads only, the sourcing rule; framing C): no sentence pairs a
//     nuclear term with a risk term of the scope scan's word lists (DENY_NUC, DENY_RISK); "reactor" only in E14.1, E14.7, E14.11 and E14.23 (and
//     "refueling" only in E14.9); no data-center wording of any kind, no design name, no "small modular"; no link to a
//     project page, a repository or the preprint; the paper's title nowhere; no numbers to remember
// Usage (from the site folder):  node _tests/learn/test_cf5-drawing-the-boundary.js [--write] [--places]
"use strict";
const fs = require("fs");
const path = require("path");
const ID = "cf5-drawing-the-boundary";
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const M = require(L(ID + ".js"));
const TL = require(L("components/timeline.js"));
const X = require("./excerpt_check.js");
const PRIV = require("./private_sources.js");
const D = JSON.parse(fs.readFileSync(L("data/" + ID + ".json"), "utf8"));
const JS = fs.readFileSync(L(ID + ".js"), "utf8");
const QPATH = path.join(SITE, "learn", ID + ".qmd"), DRAFT = path.join(SITE, "learn/_drafts", ID + ".qmd");
const I = D.idea;
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-9 : t);

// ---------------- the no-JS blocks: write (--write) or check
const BLOCKS = {
  "cf5-timeline": () => TL.staticHTML(D.timeline.events),
  "cf5-idea": () => M.staticIdea(I),
  "cf5-bound": () => M.staticBoundary(D.boundary),
  "cf5-worked": () => M.staticWorked(I)
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
const PY = fs.readFileSync(path.join(SITE, "learn/path.yml"), "utf8"), row = PY.split(/\n- kind: /).find(e => new RegExp("\\n  id: " + ID + "\\n").test(e)) || "";
ok(fs.existsSync(QPATH) && !fs.existsSync(DRAFT), "live: the page is learn/" + ID + ".qmd, and no draft of it is left in learn/_drafts/");
ok(row && /\n  status: active\n/.test(row), "path.yml: CF5 is active (live)");
{ // live: the course lists CF5, and its glossary terms name it as where they are taught
  const PJ = JSON.parse(fs.readFileSync(path.join(SITE, "assets/learn/data/path.json"), "utf8"));
  const me = [].concat(PJ.starter || [], PJ.more || [], PJ.toolbox || []).find(l => l.code === "CF5");
  ok(me && me.ready === true && me.href === ID + ".html" && me.id === ID, "path.json lists CF5 as live, linked to " + ID + ".html");
  const G = JSON.parse(fs.readFileSync(path.join(SITE, "assets/learn/data/glossary.json"), "utf8"));
  const side = fs.readFileSync(path.join(SITE, "learn/_w1", ID + ".yml"), "utf8"), ids = [...side.matchAll(/^  - id: ([a-z0-9-]+)$/gm)].map(m => m[1]);
  ok(ids.length === 9 && !/^requests:/m.test(side), "the sidecar defines CF5's nine glossary terms and has no open request: " + ids.join(", "));
  ids.forEach(g => ok(G[g] && G[g].lesson === "CF5", "glossary.json has " + g + ", taught in CF5"));
  ids.forEach(g => ok(PAGE.includes('data-term="' + g + '"'), "the page marks " + g + " at its first use"));
  const marks = [...PAGE.matchAll(/data-term="([a-z0-9-]+)"/g)].map(m => m[1]).concat([...JSON.stringify(D).matchAll(/\[\[([a-z0-9-]+)\|/g)].map(m => m[1]));
  ok(marks.every(g => G[g]), "every glossary mark on the page and in the data is defined: " + marks.filter(g => !G[g]).join(", "));
}
ok(/\n  form: case/.test(row) && /\n  code: CF5/.test(row) && /\n  minutes: 10/.test(row), "path.yml: a case file of 10 minutes, code CF5");

// ---------------- the toy, from first principles
const views = s => {
  const hr = I.hours.find(h => h.id === s.hour), copA = s.copA * (hr.derate == null ? 1 : hr.derate);
  if (hr.outage) return null;
  const avoided = s.cool / s.copE, steam = s.cool / copA, lost = s.w * steam;
  return { avoided, steam, lost, copA, v: { "plant-priced": -lost, "site-priced": avoided - lost, "plant-free": 0, "site-free": avoided } };
};
const S0 = I.start, V0 = M.views(I, S0), F0 = views(S0), r1 = v => Math.round(Math.round(v * 1e6) / 1e6 * 10) / 10;
ok(near(V0.avoided, 4) && near(V0.a.steam, 25) && near(V0.lost, 5) && near(F0.v["site-priced"], -1) && near(F0.v["plant-priced"], -5), "defaults: 4.0 MW for the electric chiller, 25.0 MW of steam heat, 5.0 MW of turbine work; −5.0 MW (plant only) and −1.0 MW (plant and load) with the steam priced");
ok(M.VIEWS.map(x => x.id).join() === "plant-priced,site-priced,plant-free,site-free" && M.VIEWS.every(x => I.labels[x.id]), "four views, the two consistent ones first, each labelled");
ok(/incomplete/.test(I.labels["plant-free"]) && /incomplete/.test(I.labels["site-free"]) && /deliberately incomplete/.test(I.steamModes.find(m => m.id === "free").label), "ignoring the turbine loss is labelled as deliberately incomplete, not as a boundary");
let bad = 0, n = 0, signs = new Set();
const range = o => { const a = []; for (let v = o.min; v <= o.max + 1e-9; v += o.step) a.push(Math.round(v * 1e6) / 1e6); return a; };
const SL = {}; I.sliders.forEach(o => { SL[o.key] = range(o); });
I.hours.forEach(h => SL.cool.forEach(cool => SL.copA.forEach(copA => SL.w.forEach(w => SL.copE.forEach(copE => {
  const s = { hour: h.id, load: S0.load, cool, copA, w, copE }, V = M.views(I, s), F = views(s); n++;
  if (!F) { if (V.possible || Object.values(V.v).some(x => x !== 0)) bad++; return; }
  Object.keys(F.v).forEach(k => { if (!near(V.v[k], F.v[k], 1e-9)) bad++; const vd = M.verdict(V.v[k]), r = r1(F.v[k]); if (vd !== (r > 0 ? "steam cooling looks better" : r < 0 ? "steam cooling looks worse" : "no difference shows")) bad++; });
  // the consistent views are the flow differences; the incomplete ones add the turbine loss back
  if (!near(V.v["plant-priced"], V.a.turbine - V.e.turbine) || !near(V.v["site-priced"], V.a.siteNet - V.e.siteNet)) bad++;
  if (!near(V.v["plant-free"], V.v["plant-priced"] + F.lost) || !near(V.v["site-free"], V.v["site-priced"] + F.lost)) bad++;
  if (!near(V.a.turbine, I.plantMW - F.lost) || !near(V.e.chiller, F.avoided) || !near(V.e.siteNet, I.plantMW - S0.load - F.avoided) || !near(V.a.siteNet, I.plantMW - F.lost - S0.load)) bad++;
  signs.add(Math.sign(r1(F.v["site-priced"])));
})))));
ok(bad === 0, `the four views, their verdicts and the flows are right for all ${n} settings the controls allow`);
ok(signs.has(1) && signs.has(-1), "within the sliders' ranges the plant-and-load view can come out either way (the boundary, not the toy, fixes the sign elsewhere)");
const OUT = M.views(I, Object.assign({}, S0, { hour: "out" })), HOT = M.views(I, Object.assign({}, S0, { hour: "hot" }));
ok(OUT.possible === false && near(OUT.e.siteNet, -(S0.load + S0.cool / S0.copE)), "a planned outage: no steam, no switch; the grid supplies the load and the electric chiller");
ok(near(HOT.a.copA, 0.6) && near(views(Object.assign({}, S0, { hour: "hot" })).v["site-priced"], HOT.v["site-priced"]), "a hot, humid hour derates the absorption chiller to 0.6");
ok(M.grid(V0.e.siteNet) === "the site sends 56.0 MW to the grid" && M.grid(OUT.e.siteNet) === "the grid supplies 44.0 MW to the site", "the grid's export or import is read from the site's net exchange");
const AS = M.assumptions(I).join(" ");
ok(AS.includes("the turbine makes " + I.plantMW + " MW") && AS.includes("the load needs " + S0.load + " MW") && AS.includes("the same plant and load, using electric cooling") && AS.includes("25% less cooling per MW of steam") && /efficiency only; it has no capacity limit/.test(AS), "the assumptions are written from the data and name the reference, the derating and its limit");
ok(/This hour: " \+ V\.a\.copA\.toFixed\(2\)/.test(JS) && /pct\(hr\.derate\) \+ " less in a hot, humid hour/.test(JS), "the live toy shows the hour's cooling per MW of steam beside its slider");
ok(/H\("caption", \{ class: "lx-hint", text: CAPTION \}/.test(JS) && /\+ means less electricity used or more sent to the grid; − means the opposite/.test(M.CAPTION), "the live table keeps its sign caption");
ok(/Average power during one hour, in MW; auxiliary electricity for pumps and fans is left out/.test(I.note) && !/Energy only/.test(PAGE + JSON.stringify(D)), "units: average power during one hour, auxiliaries left out");
ok(PAGE.includes("20 MW of cooling takes 25.0 MW of steam heat, which costs the turbine 5.0 MW of electricity: more than the electric chiller's 4.0 MW") && PAGE.includes("(−5.0 MW in the toy) but not the electric chiller's 4.0 MW saved"), "the myths' numbers are the toy's defaults");
{ // the worked answers: recomputed from first principles
  const at = o => views(Object.assign({}, S0, o)), f = v => M.mw(v), A = at({ w: I.practice.w[0] }), B = at({ w: I.practice.w[1] }), Ht = at({ hour: "hot" });
  ok(I.practice.w.every(w => SL.w.some(x => near(x, w))), "the practice's two settings are on the slider");
  ok(f(A.v["site-priced"]) === "+0.5 MW" && f(B.v["site-priced"]) === "−3.5 MW" && f(Ht.v["site-priced"]) === "−2.7 MW" && f(A.v["plant-priced"]) === "−3.5 MW" && f(B.v["plant-priced"]) === "−7.5 MW", "practice: +0.5 MW at 0.14, −3.5 MW at 0.30, −2.7 MW in the hot hour (plant and load, steam priced)");
  const W = M.worked(I).join(" ");
  ok(["+0.5 MW", "−3.5 MW", "−7.5 MW", "−2.7 MW", "33.3 MW of steam heat", "6.7 MW of turbine work", "no switch to make", "from −1.0 MW to +4.0 MW", "from −5.0 MW to 0.0 MW"].every(x => W.includes(x)), "the worked answers carry those numbers");
  ok((PAGE.match(/<li>[^<]*\?<\/li>/g) || []).length >= 4 && /Worked answers, at the toy's defaults/.test(PAGE), "every practice question has a worked answer on the page, with or without JavaScript");
}
ok(/Illustrative/.test(I.note) && /Illustrative/.test(AS) && /not the study's inputs or results/.test(I.note), "the toy says it is illustrative and not the study's");
ok(!/\$|cost of|\bprices?\b|capital|credit/i.test(JSON.stringify(I).replace(/"labels"[\s\S]*$/, "")), "the toy has no money: average power only");

// ---------------- research wording against the approved wording (E14)
// The approved set (status line of 2026-11-07): E14.1-E14.15; E14.16b in place of the drafted E14.16 (capital costs);
// E14.17-E14.23; E14.24 in its original wording (the draft-period revision of E14.24, "Source: ...", is not used). As
// CF3's test: the snapshot below must equal the approved wording; without it the page is checked against the snapshot.
const APPROVED_SNAPSHOT = {
  "E14.1": "Reactor steam can either drive the turbine or feed an absorption chiller that makes chilled water.",
  "E14.2": "Steam sent to the absorption chiller is steam the low-pressure turbine does not convert.",
  "E14.3": "Where should an hourly cogeneration study draw its boundary: which plant streams, which loads and which alternatives must it include to price the steam sent to cooling?",
  "E14.4": "Inside: one plant with high- and low-pressure turbines, one large load that needs power and cooling, an absorption chiller and an electric chiller, and power bought from and sold to the grid, every hour of a year (8,760 hours).",
  "E14.5": "The plant produces much more power than the load uses, so it is partly a merchant generator that sells power to the grid.",
  "E14.6": "Left out: demand charges and ancillary-service revenues; reliability compared on a common basis across options; marginal emission factors, because emissions are counted at hourly averages; other load profiles and sites; the choice of plant size, because the plant is one fixed unit.",
  "E14.7": "Decisions: in every hour, the reactor's output, the steam extracted at the turbine crossover, how the absorption and electric chillers share the cooling, and the power bought from or sold to the grid.",
  "E14.8": "Goal: the lowest annualized cost of meeting the load's power and cooling, counting what the power sold to the grid earns.",
  "E14.9": "Rules: the load's power and cooling are met in every hour; every unit of steam sent to the chiller lowers turbine output; the absorption chiller has no steam during refueling.",
  "E14.10": "The value of steam cooling depends on hourly physics: wet-bulb derating, crystallization risk, part-load chiller efficiency and the turbine work lost to extraction.",
  "E14.11": "A mixed-integer linear program co-optimizes, for every hour of a year, reactor output, steam extraction at the turbine crossover, absorption and electric cooling, and grid exchange.",
  "E14.12": "The plant, with and without steam cooling, is compared with grid supply and an on-site gas combined cycle, all evaluated on the same hourly basis.",
  "E14.13": "Absorption performance follows hourly wet-bulb temperature with a crystallization cutoff; the electric chiller's part-load curve uses SOS2 constraints; extraction carries a Willans-line penalty from a steam-table heat balance.",
  "E14.14": "Steam is extracted at the high- to low-pressure turbine crossover rather than from a parallel tap on main steam: crossover steam has already expanded through the high-pressure turbine, so it costs about half as much turbine work, and a sweep of the penalty tests this assumption.",
  "E14.15": "A full-size electric chiller stays beside the absorption chiller, and the optimizer chooses between the chillers hour by hour.",
  "E14.16b": "Scenario runs vary the market year (2022 to 2024), the carbon price, the cost of capital, cooling efficiency, battery storage and the size of the load.",
  "E14.17": "The load's size is swept with the plant fixed, and the grid connection is enlarged only for loads above the baseline size.",
  "E14.18": "Margins measured against grid cost are distorted across market years, because the grid cost itself falls in low-price years, so cross-year results are also reported in absolute annualized cost.",
  "E14.19": "Pricing diverted steam matters: treating it as a free by-product can by itself decide the sign of a cogeneration result.",
  "E14.20": "Holds when: steam sent to cooling would otherwise turn the low-pressure turbine; the study used one load profile, ERCOT's hourly prices for 2022 to 2024, and one fixed plant. Leaves out: demand charges, ancillary-service revenues, and reliability on a common basis across options.",
  "E14.21": "Where the result holds: steam sent to cooling is steam the low-pressure turbine does not convert, so it costs the turbine work it gives up; one load profile; ERCOT's hourly prices for the market years 2022 to 2024; hourly average, not marginal, emission factors; the plant is one fixed unit; steam is taken at the turbine crossover, and a sweep of the penalty tests that choice. It leaves out: demand charges and ancillary-service revenues; reliability on a common basis across options; other load profiles and sites.",
  "E14.22": "Paper accepted. An hourly model prices the steam sent to cooling by the turbine work it gives up, and compares the plant, with and without steam cooling, with grid supply and an on-site gas combined cycle.",
  "E14.23": "Li et al. (2026). Accepted paper on a techno-economic analysis of reactor cogeneration for power and cooling loads. Energy Conversion and Management (2026), accepted; DOI pending.",
  "E14.24": "Approved excerpt of: Li et al. (2026), accepted paper, Energy Conversion and Management; DOI pending."
};
const RX = /\b(stud(y|ies)|paper|Li et al|excerpt|ERCOT|optimizer|reactor|refueling|crossover|absorption|Willans|SOS2|scenario runs|wet-bulb|merchant)\b/i;
const REG = X.register(["E14"]);   // the shared reader; its own parser reads only plain "| E14.n |" rows, so they are read here
let APPROVED = APPROVED_SNAPSHOT, DRAFT_SOURCE = "Source: Li et al. (2026), accepted paper, Energy Conversion and Management; DOI pending.";
if (REG) {
  const md = REG.md, w5 = PRIV.section(md, "### E14.");
  const st = w5.match(/\*\*Status \(2026-11-07\): ([^*]+)\*\*([^\n]*)/) || [];
  ok(st[1] === "approved as recommended" && /Approved: framing C; E14\.1–E14\.15, E14\.16b \(.*\), E14\.17–E14\.23, and E14\.24 in its original wording/.test(st[2] || ""),
    "the approved wording's status line says E14 is approved (2026-11-07): framing C; E14.1-E14.15, E14.16b, E14.17-E14.23, E14.24 in its original wording");
  const reg = {}, e14 = PRIV.block(w5, "### E14.");
  e14.split("\n").forEach(line => { const m = line.match(/^\| (E14\.\d+)(?: \[N\]| \(optional\))? \| (.*?) \| /); if (m) reg[m[1]] = m[2].replace(/^(Timeline, [^:]+|Citations|Source): /, ""); });
  ok(Object.keys(reg).length === 24, "the approved wording has the 24 E14 rows, the [N] and optional ones included");
  const b16 = (w5.match(/Recommended wording \(E14\.16b\): "([^"]+)"/) || [])[1];
  ok(!!b16, "E14.16b's recommended wording is in the approved wording");
  delete reg["E14.16"]; reg["E14.16b"] = b16;
  ok(Object.keys(reg).length === Object.keys(APPROVED_SNAPSHOT).length && Object.keys(reg).every(k => reg[k] === APPROVED_SNAPSHOT[k]),
    "the approved-sentence snapshot in this test equals the approved wording; differs at: " + Object.keys(Object.assign({}, reg, APPROVED_SNAPSHOT)).filter(k => reg[k] !== APPROVED_SNAPSHOT[k]).join(", "));
  // the draft revision table: its E14.24 row replaced the drafted (now approved) wording with "Source: ..." for the draft
  const rv = w5.indexOf("### E14 draft revisions after review (2026-11-06)"), REV = {};
  if (rv > 0) w5.slice(rv).split("\n").forEach(line => { const m = line.match(/^\| (E14\.\d+) \| (.*?) \| (.*?) \| /); if (m) REV[m[1]] = { was: m[2], now: m[3] }; });
  ok(REV["E14.24"] && REV["E14.24"].was === reg["E14.24"] && /^Source: /.test(REV["E14.24"].now), "E14.24's draft revision ('Source: ...') replaced the drafted wording, which is the approved one");
  if (REV["E14.24"]) DRAFT_SOURCE = REV["E14.24"].now;
  APPROVED = reg;
} else console.log("note: the approved excerpt wording is not available (set LEARN_SOURCES); E14 wording checked against the snapshot in this test");
const RG = { units: Object.values(APPROVED).map(X.norm), raw: APPROVED };
ok(!X.norm(PAGE).includes("capital cost of the plant") && !RG.raw["E14.16"], "E14.16's capital-cost wording is not approved and not on the page (E14.16b instead)");
// every text element of the case, the data file's research text and the citation
const OWN = PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?learn:\1:end -->/g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/^---[\s\S]*?\n---\n/, "");
const SHOWN24 = RG.raw["E14.24"].replace(/^Approved excerpt of: /, "From: ");   // E14.24 with its visible label
const caseHTML = (OWN.match(/<div class="lx-case">([\s\S]*?)<div class="lx-interactive" data-learn="cf5"/) || [])[1] || "";
const LABELS = [/^\d · (The puzzle|The question in one sentence|Scale and boundary|Decisions, goal and rules, in words|Data and method|What came out, and where it holds)$/, /^So is the cooling free\?$/, /^The case's method question\.$/,
  /^Detail(How the hourly physics is modeled|Two design choices|Scenario runs and how results are reported)$/];
// a sentence split into list items (layout only): "<dt>Label</dt><dd data-e14="E14.n">pieces</dd>" joins back
const split = [...caseHTML.matchAll(/<dt>([^<]+)<\/dt><dd data-e14="(E14\.\d+)">([\s\S]*?)<\/dd>/g)];
ok(split.map(m => m[2]).join() === "E14.4,E14.6,E14.7,E14.8,E14.9", "parts 3 and 4 are structured lists of E14.4, E14.6, E14.7, E14.8 and E14.9");
split.forEach(m => ok(X.norm(m[1] + ": " + X.elements(m[3]).join(" ")) === X.norm(RG.raw[m[2]]), m[2] + " split into list items keeps every word in order"));
const segs = X.elements(caseHTML.replace(/<dt>[^<]+<\/dt><dd data-e14="E14\.\d+">[\s\S]*?<\/dd>/g, "")).map(X.norm).filter(Boolean);
segs.forEach(sg => ok(LABELS.some(re => re.test(sg)) || X.approved(RG, sg) || sg === X.norm(SHOWN24), "case text is approved E14 wording, E14.24 as shown, or a label: " + sg.slice(0, 70)));
{ // the review's other layout-only splits, at the sentences' own breaks: E14.13 at its semicolons, E14.14 at its colon,
  // E14.20 one line per sentence; joined back, each reads word for word
  const T = X.norm(X.elements(caseHTML).join(" "));
  ["E14.10", "E14.11", "E14.12", "E14.13", "E14.14", "E14.15", "E14.16b", "E14.17", "E14.18", "E14.1", "E14.2", "E14.5", "E14.19"].forEach(k => ok(T.includes(X.norm(RG.raw[k])), k + " reads word for word on the page"));
  ok(X.sentencesOf(RG.raw["E14.20"]).every(x => T.includes(x)), "E14.20 reads word for word, one line per sentence");
}
const tl = D.timeline.events[0];
ok(D.timeline.events.length === 1 && tl.date === "2026" && X.approved(RG, tl.label + ". " + tl.text) && X.approved(RG, tl.source.label), "the timeline is E14.22 (date 2026), its source a clause of E14.24");
[].concat(D.boundary.holds, D.boundary.leaves).forEach(t => ok(X.approved(RG, t), "boundary item is a clause of E14.21: " + t.slice(0, 50)));
ok(X.approved(RG, "Where the result holds: " + D.boundary.holds.join(" ").replace(/;$/, "") + " It leaves out: " + D.boundary.leaves.join(" ")), "the boundary card is E14.21, whole, in order");
ok(/^Approved excerpt of: /.test(RG.raw["E14.24"]) && D.boundary.source === SHOWN24, "the boundary card's source line is E14.24, as approved, with the label 'From: ': " + D.boundary.source);
const cite = (OWN.match(/<li>(Li et al\. \(2026\)\.[\s\S]*?)<\/li>/) || [])[1] || "";
ok(X.approved(RG, cite) && X.norm(cite) === X.norm(RG.raw["E14.23"]), "the citation is E14.23, word for word");
const desc = (PAGE.match(/^description: "Case file CF5 of Energy Systems, Step by Step\. ([^"]+)"/m) || [])[1] || "";
ok(desc && X.norm(desc) === X.norm(RG.raw["E14.3"]), "the description's sentence is E14.3");
// every other element that names the study or its method is approved, or one of these labels (the course's own words)
const OTHER = [/^The toy below is the course's own, with illustrative numbers you set; it holds none of the study's inputs or results\.$/,
  /^Illustrative round numbers you set: a generic steam plant and one load that needs power and cooling, not the study's inputs or results\. Average power during one hour, in MW; auxiliary electricity for pumps and fans is left out\.$/,
  /^Earlier lessons: /, /^A model that runs every hour/, /^One dated step: the accepted paper\.$/, /^(The study in time|Absorption chiller: MW of cooling per MW of steam heat)$/,
  /^ audits a study's boundary, baseline and counterfactual; $/];
const own = sg => X.norm(sg) === X.norm(SHOWN24) || OTHER.some(re => re.test(sg)) || /toy|steam plant|Myth|Fact|absorption chiller|turbine/i.test(sg) && !/\b(study|paper|Li et al|ERCOT|reactor|refueling|Willans|SOS2|scenario runs)\b/i.test(sg);
const rest = OWN.replace(caseHTML, "").replace(/<blockquote[\s\S]*?<\/blockquote>/g, "");
X.elements(rest).map(X.norm).map(s => s.replace(/^2026 · /, "").replace(/ Source: Li et al\. \(2026\), accepted paper, Energy Conversion and Management; DOI pending$/, "")).filter(s => RX.test(s))
  .forEach(sg => ok(X.approved(RG, sg) || /^Li et al\. \(2026\)\./.test(sg) && X.approved(RG, sg) || own(sg), "outside the case: approved wording or the course's own: " + sg.slice(0, 70)));
const strings = (o, k) => typeof o === "string" ? [[k, o]] : o && typeof o === "object" ? Object.keys(o).flatMap(j => strings(o[j], j)) : [];
const DATA = strings(D).filter(x => !["about", "built", "date", "id", "kind", "hour", "key", "color", "unit"].includes(x[0])).map(x => x[1]);
const LIT = (JS.replace(/\/\/[^\n]*/g, " ").match(/"(?:[^"\\\n]|\\.)*"/g) || []).map(l => l.slice(1, -1));
DATA.filter(s => RX.test(s)).forEach(s => ok(X.approved(RG, s) || own(X.norm(s)), "data: approved wording or the course's own: " + s.slice(0, 70)));
LIT.filter(s => RX.test(s)).forEach(s => ok(X.approved(RG, s) || own(s), "script: the course's own words, never the study's: " + s.slice(0, 70)));
// part 6: E14.19 the only excerpt, E14.20 its note, E14.24 its footer (CF7's form)
const q = [...PAGE.matchAll(/<blockquote class="lx-excerpt" data-source="([^"]+)"><p>([\s\S]*?)<\/p><footer>([\s\S]*?)<\/footer><\/blockquote>/g)];
ok(q.length === 1 && q[0][1] === "excerpt:cogen-boundary-methods" && X.norm(q[0][2]) === X.norm(RG.raw["E14.19"]), "part 6: E14.19 is the only excerpt");
ok(q.length === 1 && q[0][3] === SHOWN24, "part 6: the excerpt's footer is E14.24, as approved, with the label 'From: ': " + (q[0] ? q[0][3] : "none"));
{ const f7 = (fs.readFileSync(path.join(SITE, "learn/cf7-cost-of-waiting.qmd"), "utf8").match(/<footer>(From: [^<]*)<\/footer>/) || [])[1] || "", form = /^From: Li et al\. \(2026\), accepted paper, [^;]+; DOI pending\.$/;
  ok(form.test(f7) && q[0] && form.test(q[0][3]), "the footer has CF7's form, 'From: Li et al. (2026), accepted paper, <venue>; DOI pending.' (CF7: " + f7 + ")"); }
ok(PAGE.includes('<p class="lx-hint">' + X.sentencesOf(RG.raw["E14.20"]).join('</p><p class="lx-hint">') + "</p>"), "part 6: E14.20 is the note under the excerpt, one line per sentence");
// the draft period is over: its source line is gone, "approved" is said nowhere a reader sees, no draft or pending wording is left
const VIS = X.elements(OWN).concat(DATA, LIT);
ok(!VIS.some(s => X.norm(s) === X.norm(DRAFT_SOURCE)) && !/<footer>Source:/.test(PAGE) && D.boundary.source !== DRAFT_SOURCE, "the draft-period line '" + DRAFT_SOURCE + "' is gone (footer, boundary card, no-JS text)");
const said = VIS.filter(s => /approv/i.test(s));
ok(said.length === 0, "'approved' is not said where a reader sees it (" + said.length + "): " + said.join(" | ").slice(0, 160));
ok(VIS.filter(s => X.norm(s) === X.norm(SHOWN24)).length === 3, "E14.24 as shown ('From: ...') is the footer, the boundary card's source line and its no-JS text");
ok(!VIS.some(s => /\bdrafts?\b|\bdrafted\b/i.test(s)), "no draft wording on the page, in the data or in the script's strings");
ok(VIS.filter(s => /pending/i.test(s)).every(s => !/pending/i.test(X.norm(s).replace(/DOI pending/g, ""))), "'pending' only in 'DOI pending' (E14.23, E14.24 and the timeline's source)");
ok(!/quoted from the excerpts/.test(PAGE), "no blanket claim that every sentence is quoted");
// the placements, in the approved wording's order (--places prints them with file:line)
{ const lines = PAGE.split("\n"), rel = path.relative(SITE, QPATH), where = [];
  const find = (k, s) => { const t = X.norm(s).slice(0, 60); let i = lines.findIndex(l => X.norm(l).includes(t)); if (i < 0) i = lines.findIndex(l => l.includes('data-e14="' + k + '"')); return i >= 0 ? rel + ":" + (i + 1) : null; };
  Object.keys(RG.raw).forEach(k => {
    let at = find(k, k === "E14.24" ? SHOWN24 : RG.raw[k]);   // E14.24 is shown with its visible label
    if (k === "E14.21") at = "assets/learn/data/" + ID + ".json (boundary) and " + rel + " (no-JS block)";
    if (k === "E14.22") at = "assets/learn/data/" + ID + ".json (timeline) and " + rel + " (no-JS block)";
    if (k === "E14.24" && at) at += " (the excerpt's footer) and assets/learn/data/" + ID + ".json (the boundary card's source line)";
    if (k === "E14.3" && at) at += " and the front matter's description";
    where.push([k, at]); ok(at, "placed: " + k);
  });
  if (process.argv.includes("--places")) where.forEach(w => console.log(w[0].padEnd(8), w[1])); }

// ---------------- scope (framing C)
const RP = PRIV.path("scope_terms");
let NUC = /nuclear|reactor|\bSMR\b|small modular/i, RISK = null;
if (RP) {
  const py = fs.readFileSync(RP, "utf8");
  NUC = new RegExp(py.match(/DENY_NUC = r"([^"]+)"/)[1], "i");
  RISK = new RegExp((py.match(/DENY_RISK = \(([\s\S]*?)\)\n/)[1].match(/r"([^"]*)"/g) || []).map(s => s.slice(2, -1)).join(""), "i");
}
ok(RISK, "the scope scan's DENY_RISK read from its word lists");
const ALLTXT = PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?learn:\1:end -->/g, "") + "\n" + JSON.stringify(D) + "\n" + (JS.match(/"[^"\n]*"/g) || []).join("\n");
const sentences = X.elements(PAGE.replace(/<!--[\s\S]*?-->/g, "")).concat(Object.values(D.idea.labels), D.timeline.events.map(e => e.label + ". " + e.text), D.boundary.holds, D.boundary.leaves, (JS.match(/"[^"\n]*"/g) || []))
  .map(X.norm).flatMap(s => s.split(/(?<=[.?!])\s+(?=[A-Z])/));
const both = sentences.filter(s => NUC.test(s) && RISK && RISK.test(s));
ok(both.length === 0, "no sentence pairs a nuclear term with a risk term: " + both.join(" | ").slice(0, 200));
if (RG) {
  const allowedR = ["E14.1", "E14.7", "E14.11", "E14.23"].map(k => X.norm(RG.raw[k]));
  const withR = sentences.filter(s => /reactor/i.test(s) && !/^Li et al\. \(2026\)\. Accepted paper/.test(s));
  ok(withR.every(s => allowedR.some(u => u.includes(s) || s.includes(u.slice(0, 40)))), "'reactor' only in E14.1, E14.7, E14.11 and E14.23: " + withR.filter(s => !allowedR.some(u => u.includes(s))).join(" | ").slice(0, 200));
  ok(sentences.filter(s => /refuel/i.test(s)).every(s => X.norm(RG.raw["E14.9"]).includes(s.replace(/^Rules: /, "Rules: "))), "'refueling' only in E14.9");
}
ok(!/data[- ]?cent|hyperscale|campus|colocat|small modular|\bSMR\b|BWRX|Hitachi|Houston|200 MWe|nuclear/i.test(ALLTXT.replace(/<!--[\s\S]*?-->/g, "")) && !/\bIT\b|\bGE\b/.test(ALLTXT.replace(/<!--[\s\S]*?-->/g, "")), "no data-center wording, design name, size, city or 'nuclear' anywhere in CF5 (page, data, script strings)");
ok(!/projects\/|research\.html|github\.com|arxiv|2608\.10999|Boundary Analysis of Small Modular/i.test(PAGE.replace(/<!--[\s\S]*?-->/g, "") + JS + JSON.stringify(D)), "no link to a project page, a repository or the preprint; the paper's title is not shown");
ok(!/Numbers to remember/.test(PAGE), "no numbers to remember");
ok(!/break[- ]even|threshold|parity|competitiv|\bcredit\b/i.test(ALLTXT.replace(/<!--[\s\S]*?-->/g, "") + JSON.stringify(D) + (JS.match(/"[^"\n]*"/g) || []).join(" ")), "no break-even, threshold, parity, competitiveness or credit wording (nuclear and credit scope)");
ok(/LX\.lessonRefHTML\(P, "R7"\)/.test(JS) && /LX\.lessonRefHTML\(P, "M11"\)/.test(JS) && /path\.json/.test(PAGE), "R7 and M11 are linked with LX.lessonRef (path.json loaded)");
{ // back links: the lessons CF5 serves (R7, M11) name it through LX.lessonRefHTML, live with path.json
  const core = require(L("components/core.js")), PJ = JSON.parse(fs.readFileSync(L("data/path.json"), "utf8"));
  ok(core.lessonRefHTML(PJ, "CF5") === '<a href="' + ID + '.html">CF5</a>', "with path.json, LX.lessonRefHTML links CF5 to its page");
  const r7 = fs.readFileSync(L("r07-cost-carbon-properly.js"), "utf8"), m11 = fs.readFileSync(L("m11-tea-in-models.js"), "utf8"), m11q = fs.readFileSync(path.join(SITE, "learn/m11-tea-in-models.qmd"), "utf8");
  ok(/"Case file " \+ ref\("CF5"\)/.test(r7) && /function ref\(code\) \{ return LX\.lessonRefHTML \? LX\.lessonRefHTML\(P, code\)/.test(r7), "R7's boundary step names CF5 through LX.lessonRefHTML");
  ok(/"Case file " \+ LX\.lessonRefHTML\(PJ, "CF5"\)/.test(m11) && /PJ = data\.path \|\| null/.test(m11) && /data-learn="m11-tea-in-models" data-src="[^"]*\.\.\/assets\/learn\/data\/path\.json"/.test(m11q), "M11's boundary step names CF5 through LX.lessonRefHTML; its page loads path.json");
}
ok(!/\bAI\b|artificial intelligence/.test(PAGE + JS), "no AI wording");

console.log(`test_${ID}: ${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
