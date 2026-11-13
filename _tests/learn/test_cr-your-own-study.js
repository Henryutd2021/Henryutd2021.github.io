// test_cr-your-own-study.js — Node tests for CR, the research capstone (assets/learn/cr-your-own-study.js, its data file and
// the page learn/cr-your-own-study.qmd):
//   - the hours: every track's stages sum to the curriculum's 20 to 40 hours (typical 30, path.yml's practice_minutes);
//     the mock-review stage equals CK-R's minutes; the weeks at every pace are contiguous and end on the stated total
//   - the stages cover the brief's eight (question, literature, method, data, build and validate, uncertainty, communicate,
//     integrity) plus CK-R, each with live studios; the routes are the course plan's; the prerequisites path.yml's
//   - method neutrality: R3's nine families (ids and labels read from R3's data file), three tracks with the same rubric,
//     exemplar studies across the tracks; the plan's checks (alternatives from another family, a family that fits the
//     track, an uncertainty treatment at Proficient, the card's scale) on every input that changes them
//   - the plan link: a valid LX.ShareState schema, round trips, no free text; the proposal (LX.ReportNote): its table from
//     the card and the plan, its checks, one page
//   - the self-check: one well-formed pair of fragments per rubric competence; the whole rubric in the curriculum's words;
//     the two statuses as the course plan states them; the fragments' arithmetic
//   - the page on a stub document: the plan, the link, the stage ticks, the card from R10, the proposal, the switcher
//   - wording and checks: the cost and CO₂ fragment's arithmetic; the scale pending until the card has
//     one, and checked in the proposal; a treatment that fits the family; a same-family alternative named as such;
//     reproduction against replication; glossary marks; one short action per stage, its checks folded
//   - scope: no nuclear term, no data-center term, no "AI", no deny-listed term; links to learn pages and doi.org only
// Usage (from the site folder):  node _tests/learn/test_cr-your-own-study.js [--write]
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const PRIV = require("./private_sources.js");
const ID = "cr-your-own-study";
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const M = require(L(ID + ".js"));
const RB = require(L("components/rubric.js"));
const EXS = require(L("components/exemplars.js"));
const SS = require(L("components/sharestate.js"));
const RN = require(L("components/reportnote.js"));
const QC = require(L("components/questioncard.js"));
const DPATH = L("data/" + ID + ".json"), QPATH = path.join(SITE, "learn", ID + ".qmd"), SIDE = path.join(SITE, "learn/_w1", ID + ".yml");
const D = JSON.parse(fs.readFileSync(DPATH, "utf8")), R3 = JSON.parse(fs.readFileSync(L("data/r03-system-and-method.json"), "utf8")), P = JSON.parse(fs.readFileSync(L("data/path.json"), "utf8"));
const F = M.famNames(D, R3);
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const text = s => s.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, " ").trim();
function between(q, name) {
  const a = q.match(new RegExp("<!-- " + name + ":start[^>]*-->\\n")), b = q.indexOf("<!-- " + name + ":end -->");
  if (!a || b < a.index) throw new Error(name + " markers missing in " + QPATH);
  return { from: a.index + a[0].length, to: b };
}
const BLOCKS = { "cr-tracks": () => M.staticTracks(D, P), "cr-routes": () => M.staticRoutes(D), "cr-strip": () => M.staticStrip(D), "cr-plan": () => M.staticPlan(D, F),
  "cr-stages": () => M.staticStages(D, P), "cr-note": () => M.staticOutline(D), "cr-exemplars": () => M.staticExemplars(D), "cr-rubric": () => M.staticRubric(D), "cr-statuses": () => M.staticStatuses(D) };
if (process.argv.includes("--write")) {
  let q = fs.readFileSync(QPATH, "utf8");
  Object.keys(BLOCKS).forEach(k => { const r = between(q, k); q = q.slice(0, r.from) + BLOCKS[k]() + "\n" + q.slice(r.to); });
  fs.writeFileSync(QPATH, q);
  console.log("wrote the page's static blocks");
}
const PAGE = fs.readFileSync(QPATH, "utf8"), JS = fs.readFileSync(L(ID + ".js"), "utf8"), RAW = fs.readFileSync(DPATH, "utf8");
Object.keys(BLOCKS).forEach(k => { const r = between(PAGE, k); ok(PAGE.slice(r.from, r.to) === BLOCKS[k]() + "\n", "block " + k + " is up to date (run with --write)"); });
const OWN = PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?<!-- learn:\1:end -->/g, ""), TX = text(OWN);
const has = (s, what) => ok(TX.includes(s), "page: " + what + ": '" + s + "'");
const PY = fs.readFileSync(path.join(SITE, "learn/path.yml"), "utf8");
const rowOf = id => PY.split(/\n- kind: /).find(x => new RegExp("\\n  id: " + id + "\\n").test(x)) || "";
const entry = rowOf(ID), ckr = rowOf("ck-r-defend-revise");
const all = [].concat(P.starter, P.more, P.toolbox), byCode = c => all.find(l => l.code === c);

// ---------------- the hours and the weeks
D.tracks.forEach(t => {
  const T = M.totals(D, t.id);
  ok(T.lo === 20 && T.hi === 40 && T.typ === 30, t.id + ": the stages sum to 20 to 40 hours, typical 30 (" + T.lo + ", " + T.hi + ", " + T.typ + ")");
  ok(D.stages.every(s => t.hours[s.id] && t.hours[s.id][0] >= 1 && t.hours[s.id][0] <= t.hours[s.id][1]), t.id + ": every stage has hours, low at most high, at least an hour");
  ok(t.fits.indexOf(t.family) >= 0 && t.fits.every(f => D.families.includes(f)), t.id + ": its usual family fits it, and its families are R3's");
});
ok(/\n  practice_minutes: 1800\b/.test(entry) && /\n  minutes: 60\n/.test(entry), "path.yml: 60 minutes on the page, 1,800 (30 hours, the typical total) of study");
{ const ckrMin = +(/\n  minutes: (\d+)\n/.exec(ckr) || [])[1]; ok(D.tracks.every(t => t.hours.review[0] * 60 === ckrMin && t.hours.review[1] * 60 === ckrMin), "the mock-review stage is CK-R's " + ckrMin + " minutes on every track"); }
for (const t of D.tracks) for (let h = 2; h <= 20; h++) {
  const tl = M.timeline(D, t.id, h), R = tl.rows;
  const contiguous = R.every((r, i) => r.from <= r.to && (i === 0 ? r.from === 1 : r.from === R[i - 1].to || r.from === R[i - 1].to + 1));
  if (!contiguous || R[R.length - 1].to !== tl.weeks.typ || !(tl.weeks.lo <= tl.weeks.typ && tl.weeks.typ <= tl.weeks.hi) || tl.weeks.typ !== Math.ceil(30 / h) || tl.weeks.lo !== Math.ceil(20 / h) || tl.weeks.hi !== Math.ceil(40 / h)) {
    ok(false, "timeline " + t.id + " at " + h + " h a week: " + JSON.stringify(tl.weeks) + " " + R.map(r => r.from + "-" + r.to).join(" ")); }
}
ok(true, "every track's weeks, 2 to 20 hours a week: contiguous, ending on the stated total (ceil of 30, 20 and 40 hours over the pace)");
{ const tl = M.timeline(D, "model", 6); ok(tl.weeks.typ === 5 && tl.weeks.lo === 4 && tl.weeks.hi === 7 && M.milestones(D, tl).map(m => m.week).join() === "2,4,5,5", "the model track at 6 h a week: 5 weeks (4 to 7); milestones by weeks 2, 4, 5 and 5"); }
has("The model-based track: about 30 hours (20 to 40). At 6 hours a week, about 5 weeks (4 to 7).", "the static strip states the default plan's weeks");
has("About 20 to 40 hours of your own work, CK-R's four among them", "the brief's hours");

// ---------------- the stages, the routes, the prerequisites
{
  const words = D.stages.map(s => s.label.toLowerCase()).join(" | ");
  ["question", "literature", "method", "data", "build and validate", "uncertainty", "paper and poster", "integrity"].forEach(w => ok(words.includes(w), "a stage for '" + w + "'"));
  ok(D.stages.length === 9 && D.stages.find(s => s.id === "review").lessons.join() === "CK-R", "nine stages: the eight of the brief, and CK-R before the paper");
  ok(D.stages.findIndex(s => s.id === "review") > D.stages.findIndex(s => s.id === "build") && D.stages.findIndex(s => s.id === "review") < D.stages.findIndex(s => s.id === "communicate"), "CK-R comes once there is a main result, before the paper");
  const codes = [...new Set(D.stages.flatMap(s => s.lessons).concat(D.tracks.flatMap(t => t.lessons), D.prereqs))];
  ok(codes.every(c => byCode(c) && byCode(c).ready), "every studio and lesson the stages, tracks and prerequisites name is live: " + codes.filter(c => !(byCode(c) && byCode(c).ready)).join(", "));
  ok(D.stages.every(s => s.comps.every(c => RB.COMPETENCES.some(x => x.id === c))), "every stage names rubric competences");
  ok(RB.COMPETENCES.every(c => D.stages.some(s => s.comps.includes(c.id))), "every rubric competence is built in some stage");
  ok(D.stages.filter(s => s.milestone).map(s => s.id).join() === "method,review,communicate,integrity", "milestones: the proposal (after the method), CK-R, the paper and poster, the rubric sheet");
}
{
  const want = { S0: ["M4", "C0"], S1: ["M5", "C1"], S2: ["M2", "C2"], S3: ["M12", "C3"], S4: ["M13", "C4"] };
  ok(Object.keys(want).every(s => D.routes[s].lab === want[s][0] && D.routes[s].cap === want[s][1]), "the five routes are the course plan's");
  ok(Object.values(D.routes).every(r => byCode(r.lab) && byCode(r.cap)), "each route's lessons exist in path.yml");
  ok(!/href="[^"]*"/.test(M.staticRoutes(D)), "the static route table links nothing (its lessons go live at different times; the plan links them live)");
}
ok(/\n  after: \[R10, R2, R5, R6, R7, R8, R9, CK-M\]\n/.test(entry) && D.prereqs.join() === "R10,R2,R5,R6,R7,R8,R9,CK-M", "prerequisites: the course plan's, in path.yml and in the plan");
ok(/\n  next: CK-R\n/.test(entry) && /\n  form: capstone\n/.test(entry) && !/\n  sandbox:/.test(entry) && /\n  status: active\n/.test(entry) && /\n  tier: researcher\n/.test(entry), "path.yml: an active Researcher capstone without a sandbox, followed by CK-R");
{ const cur = PRIV.path("curriculum");
  if (cur) { const c = fs.readFileSync(cur, "utf8");
    ok(c.includes("| CR | Your own study: from a question to a report | ALL | Researcher | R10, R2, R5, R6, R7, R8, R9, CK-M; plus one route of track:S0, track:S1, track:S2, track:S3, track:S4 | 20–40 h |"), "the curriculum's CR row is the one built here");
    ok(["| S0 Device and plant | M4; C0 |", "| S1 Microgrid and community | M5; C1 |", "| S2 Regional bulk grid | M2; C2 |", "| S3 City and region | M12; C3 |", "| S4 Nation | M13; C4 |"].every(r => c.includes(r)), "the routes' table in the course plan"); } }

// ---------------- method neutrality
ok(D.families.length === 9 && D.families.slice().sort().join() === R3.families.map(f => f.id).sort().join() && D.families.every(id => F[id] === R3.families.find(f => f.id === id).label), "R3's nine families, ids and labels read from R3's data file");
ok(D.tracks.map(t => t.id).join() === "model,empirical,mixed", "three tracks: model-based, empirical, mixed (method-neutral)");
ok(new Set(D.tracks.flatMap(t => t.fits)).size >= 8, "the tracks' families together cover at least eight of the nine");
{ const st = Object.values(D.studies).join(" "); ok(/model-based/.test(st) && /empirical/.test(st) && /mixed/.test(st), "the exemplar studies span the three tracks");
  const opt = D.exemplars.filter(e => /linear program|optimization/i.test(EXS.plain(e.answers[1]))).length; ok(opt <= 2, "optimization is one family among several in the fragments (" + opt + " of 9 strong fragments name it)"); }
has("Every track is judged on the same nine competences.", "the same rubric for every track");
// reproduction against replication (National Academies 2019)
{ const e = M.track(D, "empirical");
  ok(/a reproduction or replication of a published result/.test(e.short) && /rerun with its own data and code \(a computational reproduction\), or tested on new data \(a replication\)/.test(e.builds) && !/data analysis, or replication of a published result"/.test(RAW), "the empirical track tells reproduction (same data and code) from replication (new data)");
  ok(/<b>Reproducibility:<\/b>/.test(PAGE) && /<b>Replicability:<\/b>/.test(PAGE), "the sources give both definitions"); }
// glossary marks at first use, rendered
{ const st = M.staticStages(D, P) + M.staticTracks(D, P) + M.staticExemplars(D);
  ["snowballing", "concept-matrix", "clean-clone", "feeder", "weatherization", "linear-program"].forEach(k => ok(st.includes('data-term="' + k + '"'), "a glossary mark for " + k + " in the page's static text"));
  ok(!/\[\[/.test(st), "no raw glossary mark in the static blocks"); }
// one short action per stage; its evidence as a checklist of short items
{ const nw = t => t.replace(/\[\[[a-z0-9-]+\|([^\]]+)\]\]/g, "$1").split(/\s+/).filter(Boolean).length;
  ok(D.stages.every(s => nw(s.does) <= 20 && Array.isArray(s.done) && s.done.length >= 2 && s.done.every(x => nw(x) <= 14)), "every stage: an action of at most 20 words, two or more checks of at most 14: " + D.stages.filter(s => nw(s.does) > 20 || !s.done.every(x => nw(x) <= 14)).map(s => s.id).join(", "));
  ok(M.doneList(D.stages[0]) === '<ul class="cr-done-l"><li>Your card passes its eight checks.</li><li>You can say what answer would change your audience\'s decision.</li></ul>', "the checklist's markup");
  has("Without it, plan with the table below.", "the fallback's hint, split"); }

// ---------------- the plan link and the plan's checks
{
  const S = M.schema(D, F);
  let bad = null; try { SS.checkSchema(S); } catch (e) { bad = e.message; }
  ok(!bad, "the plan's schema is valid: " + bad);
  const d = SS.defaults(S), h = SS.encode(S, d);
  ok(h === "cr-v1-t0-s1-f0-a34-u0-h6-r1-d0" && SS.decode(S, "#" + h).status === "ok" && SS.same(S, SS.decode(S, "#" + h).state, d), "the default plan's link round-trips: #" + h);
  const x = { track: "mixed", scale: "S4", family: "qual", alts: ["stat", "abm", "mixed"], unc: "tri", hours: 13, review: "mentor", done: ["question", "literature", "method", "data", "build", "uncertainty", "review", "communicate", "integrity"] };
  const hx = SS.encode(S, x), dx = SS.decode(S, "#" + hx);
  ok(dx.status === "ok" && SS.same(S, dx.state, x) && hx.length < 80, "a full plan's link round-trips and stays short: #" + hx);
  ok(S.fields.every(f => SS.TYPES.includes(f.type) && f.type !== "text"), "the link holds choices only: no free-text field");
  ok(SS.decode(S, "#cr-v1-t9-s1-f0-a34-u0-h6-r1-d0").status === "bad" && SS.decode(S, "#cr-v2-t0").status === "newer", "a damaged or newer link is refused");
  const C = (s, card) => M.planChecks(D, Object.assign({}, d, s), F, card || null);
  ok(C({}, "S1").every(c => c.ok), "the default plan, with a card at S1, passes its four checks");
  ok(!C({})[3].ok && /has no scale yet: set it in the card below/.test(C({})[3].why), "a card without a scale: the scale check is to do, not in place");
  ok(!C({ alts: ["opt"] })[0].ok && /you have 1/.test(C({ alts: ["opt"] })[0].why), "one alternative: to do");
  ok(!C({ family: "sim", alts: ["sim"] })[0].ok && !C({ family: "sim", alts: ["sim", "opt"] }).some(c => c.id === "alts" && !c.ok), "one alternative is too few; two with one from another family are enough");
  ok(C({ family: "opt", alts: ["opt", "sim"] })[0].ok && !C({ family: "opt", alts: [] })[0].ok, "two alternatives, one from the same family and one from another: in place");
  ok(M.altName(F, { family: "opt" }, "opt") === "Optimization (another method of the same family, named in the proposal)" && M.altName(F, { family: "opt" }, "sim") === "Simulation", "a same-family alternative is another method of that family, named in the proposal");
  ok(M.noteOf(D, Object.assign({}, d, { alts: ["opt", "sim"] }), {}, F, "").plan.find(r => r.label === "Method").value === "Optimization; alternatives: Optimization (another method of the same family, named in the proposal), Simulation", "the proposal says so too");
  ok(/if one is from your method's family, name that method exactly/.test(D.fields.find(f => f.key === "method").hint) && !/name a same-family one exactly/.test(JSON.stringify(D)), "the proposal's method field asks for a same-family alternative by name only when there is one");
  ok(!C({ track: "empirical", family: "opt" })[1].ok && /unusual for an empirical study/.test(C({ track: "empirical", family: "opt" })[1].why), "optimization on the empirical track: to do, said why");
  ok(C({ track: "mixed", family: "qual", alts: ["stat", "abm"] })[1].ok, "qualitative methods fit the mixed track");
  ok(!C({ unc: "oat" })[2].ok && /Proficient level asks for scenarios or a global sensitivity analysis/.test(C({ unc: "oat" })[2].why), "one input at a time is below Proficient");
  // a treatment counts only where it fits the method family: every treatment against every family
  { const bad = []; D.uncertainty.filter(u => u.id !== "oat").forEach(u => D.families.forEach(f => { if (C({ unc: u.id, family: f })[2].ok !== u.fits.includes(f)) bad.push(u.id + "/" + f); }));
    ok(!bad.length && D.uncertainty.filter(u => u.ok).every(u => u.fits.length && u.fits.every(f => D.families.includes(f))), "each treatment fits its listed families and no others: " + bad.join(", ")); }
  ok(!C({ unc: "tri", family: "opt" })[2].ok && /Triangulation is usually paired with Qualitative methods and Mixed methods\. It can still suit Optimization: in the proposal, say which uncertain inputs you will vary and how you will analyze their effect/.test(C({ unc: "tri", family: "opt" })[2].why), "triangulation on an optimization study: a suggestion, with what to explain, not a ban");
  ok(D.uncertainty.every(u => !/, not /.test(C({ unc: u.id, family: "stat" })[2].why)) && /can still suit Statistics and econometrics/.test(C({ unc: "gsa", family: "stat" })[2].why), "a usual pairing is a suggestion: a global sensitivity analysis with statistics is not ruled out");
  ok(D.uncertainty.every(u => u.def && u.def.split(/\s+/).length <= 25) && /\[\[triangulation\|/.test(D.uncertainty.find(u => u.id === "tri").def) && /fDef\.innerHTML/.test(JS) && /uDef\.innerHTML = U && U\.def \? LX\.rich\(U\.def\)/.test(JS), "each uncertainty treatment and the chosen family are explained under their controls, with glossary marks");
  // ethics before collection: the data stage settles the ethics review before anyone is contacted
  { const ds = D.stages.find(x => x.id === "data"), is = D.stages.find(x => x.id === "integrity");
    ok(/settle the ethics review with a mentor before contacting anyone/.test(ds.does) && ds.done.some(d => /ethics approval or exemption before recruiting/.test(d)) && !/plan and hold your interviews/.test(JSON.stringify(D)), "interviews: the ethics determination comes before recruiting, in the data stage");
    ok(/report and release keep your promises/.test(is.does) && /approved the interview protocol before recruitment began/.test(EXS.plain(D.exemplars.find(e => e.comp === "integrity").answers[1])), "the integrity stage checks reporting and release; its exemplar's approval came before recruitment"); }
  // the weatherization exemplar: a candidate comparison group, change against change; ranges identified
  { const fr = EXS.plain(D.exemplars.find(e => e.comp === "framing").answers[1]), frN = EXS.marks(D.exemplars.find(e => e.comp === "framing").answers[1]).map(m => m.note).join(" ");
    ok(/A candidate comparison group/.test(frN) && /cut their gas use/.test(fr) && /the change in winter gas use per home, two winters before against two after/.test(fr) && /Selection: homes that waited may differ/.test(fr), "framing exemplar: the waiting list is a candidate comparison group; the question, metric and falsification compare changes; selection is named");
    const un = EXS.plain(D.exemplars.find(e => e.comp === "uncertainty").answers[1]), co = EXS.plain(D.exemplars.find(e => e.comp === "communication").answers[1]);
    ok(/the middle 90% of 1,000 Monte Carlo runs/.test(un) && /\(the same 90%\)/.test(un) && /a 95% confidence interval/.test(co), "the exemplars' ranges say what they are (coverage and construction)"); }
  ok(C({ unc: "tri", family: "qual" })[2].ok && C({ unc: "ci", family: "stat" })[2].ok && C({ unc: "scen", family: "opt" })[2].ok && !C({ unc: "ci", family: "opt" })[2].ok, "triangulation fits qualitative work, intervals statistics, scenarios optimization");
  { const mx = M.noteOf(D, Object.assign({}, d, { track: "mixed", family: "mixed", unc: "tri" }), {}, F, "").sensitivity, mq = M.noteOf(D, Object.assign({}, d, { track: "mixed", family: "mixed", unc: "mc" }), {}, F, "").sensitivity;
    ok(/the numbers need a range too/.test(mx) && /qualitative findings need triangulation too/.test(mq) && !/Mixed study/.test(M.noteOf(D, d, {}, F, "").sensitivity), "a mixed study's proposal names the treatment of its other part"); }
  ok(!C({}, "S3")[3].ok && C({}, "S1")[3].ok, "the card's scale against the plan's");
  // the proposal
  const card = { question: "Did homes weatherized in 2023 use less gas in the next two winters than similar homes still on the waiting list?", type: "evaluative", audience: "the city's housing office", metric: "winter gas use per home, adjusted for the weather", units: "kWh", counterfactual: "similar homes on the waiting list", scale: "S3", boundary: "homes' gas, not electricity", wrong: "the waiting-list homes' use fell as much", uncertainty: "whether the waiting-list homes are similar" };
  ok(QC.check(card).all, "a full card passes the card's eight checks");
  const link = "https://henryutd2021.github.io/learn/cr-your-own-study.html#" + h;
  const d3 = Object.assign({}, d, { scale: "S3" });   // the plan at the card's scale
  const n = M.noteOf(D, d3, card, F, link), n0 = M.noteOf(D, d, {}, F, link);
  const words = {}; D.fields.forEach(f => { words[f.key] = Array(f.min + 4).fill("word").join(" ") + "."; });
  const c1 = RN.checks(n, words, D.fields, M.proposalChecks()), c0 = RN.checks(n0, {}, D.fields, M.proposalChecks());
  ok(c1.all && c1.total === 12, "a full proposal passes all twelve checks (" + c1.pass + " of " + c1.total + ")");
  ok(c0.pass === 3 && c0.items.filter(i => !i.ok).map(i => i.id).join() === "field-why,field-known,field-method,field-data,field-check,field-leaves,field-integrity,card,scale", "an empty proposal: the link, the alternatives and one page in place; the seven fields, the card and its scale to do");
  { const cm = RN.checks(M.noteOf(D, d, card, F, link), words, D.fields, M.proposalChecks());
    ok(cm.pass === 11 && cm.items.filter(i => !i.ok).map(i => i.id).join() === "scale", "a full card at S3 in a plan at S1: the proposal's scale check fails, alone"); }
  const t1 = RN.compose(n, words, D.fields, { format: "text", code: "CR", date: "2026-11-07" });
  ok(RN.countWords(t1) <= RN.PAGE_WORDS, "a proposal with every part written at its minimum fits one page (" + RN.countWords(t1) + " words)");
  ok(t1.includes("Question: " + card.question) && t1.includes("Scale route: S3 city and region: model lab M12, capstone C3") && t1.includes("Milestones: the one-page proposal by week 2; CK-R by week 4; the paper and the poster by week 5; the rubric sheet by week 5"), "the proposal's table: the card, the route and the milestones from the timeline");
  ok(t1.includes("Plan link: " + link) && !/word word/.test(link) && !t1.includes("Warning"), "the link carries the choices; no warning line on a proposal");
  ok(t1.includes("Planned: scenarios for the uncertainties classified as scenario or deep") && t1.includes("Method: Optimization; alternatives: Simulation, Agent-based modeling"), "the planned treatment and the method with its alternatives");
  ok(!RN.CLAIMS.test(t1.replace(/stored/g, "")) , "the proposal claims nothing is saved or sent");
  const nq = M.noteOf(D, Object.assign({}, d3, { alts: ["opt"] }), card, F, link); ok(!RN.checks(nq, words, D.fields, M.proposalChecks()).all, "too few alternatives fail the proposal's check too");
}
has("Your plan stays in this browser and in its link.", "the data note on where the plan stays");
ok(/note: "The link holds your choices only, not your words\."/.test(JS), "the plan link's note says it holds choices only");

// ---------------- the self-check
{
  ok(D.exemplars.length === 9 && D.exemplars.map(e => e.comp).join() === RB.COMPETENCES.map(c => c.id).join(), "one pair of fragments per rubric competence, in the rubric's order");
  D.exemplars.forEach((e, k) => {
    const o = M.exOpts(D, k);
    ok(EXS.validate(o).length === 0, "fragments " + e.comp + ": " + EXS.validate(o).join("; "));
    ok(D.stages.some(s => s.id === e.stage) && D.studies[e.study] && e.answers[0].key === "weak" && e.answers[1].key === "good", "fragments " + e.comp + ": a stage, a fictional study, weak first");
    ok(e.answers[0].level === "Developing" && ["Proficient", "Strong"].includes(e.answers[1].level), "fragments " + e.comp + ": Developing against Proficient or Strong");
  });
  ok(/Both fragments are illustrative; the study is fictional/.test(M.exOpts(D, 0).note) && M.exWhere(D, 0) === "Stage 1, question · " + D.studies.weather, "each pair says it is illustrative and fictional, and names its stage and study once");
ok(M.msKey(D) === "Underlined: a stage that ends on a milestone (3, the one-page proposal; 7, CK-R; 8, the paper and the poster; 9, the rubric sheet).", "the strip's key names the milestones");
  const trust = EXS.plain(D.exemplars.find(e => e.comp === "trust").answers[1]);
  ok(trust.includes("2.81 MW, against the model's 2.76 MW: 1.8% low") && ((2.81 - 2.76) / 2.81 * 100).toFixed(1) === "1.8" && (2.81 - 2.76) / 2.81 < 0.05, "the log's validation: (2.81 − 2.76) ÷ 2.81 = 1.8%, inside 5%");
  // the cost and CO₂ fragment: the saving is the bill's fall less the battery's annualized cost; the
  // CO₂ from the energy bought and its hourly factors, the battery's losses included
  { const acc = EXS.plain(D.exemplars.find(e => e.comp === "accounting").answers[1]), accN = EXS.marks(D.exemplars.find(e => e.comp === "accounting").answers[1]).map(m => m.note).join(" ");
    const bill = 250000, ann = 160000, out = 1800, inn = 2000, fe = 0.50, fn = 0.39;
    ok(acc.includes("the co-op's power bill falls $250,000 a year; less the battery's annualized cost, $160,000, its yearly cost falls $90,000") && bill - ann === 90000 && !/power bill less the battery/.test(acc), "cost: $250,000 − $160,000 = $90,000, the bill's fall less the battery's yearly cost");
    ok(acc.includes("1,800 × 0.50 − 2,000 × 0.39 = 900 − 780 = 120 t") && Math.round(out * fe) === 900 && Math.round(inn * fn) === 780 && Math.round(out * fe - inn * fn) === 120 && out / inn === 0.9 && /10% losses/.test(accN) && /200 MWh lost would add CO₂ instead/.test(accN) && inn - out === 200, "CO₂: 1,800 × 0.50 − 2,000 × 0.39 = 120 t, with 10% (200 MWh) lost");
    ok(/120 t a year less, location-based with the grid's hourly average factors/.test(acc), "the CO₂ says which factors make it a saving"); }
  // the other numbers are assumed for the example, and said so
  ok(/its numbers are assumed, not computed/.test(M.exOpts(D, 4).note) && TX.includes("Every number in the weak and strong fragments: assumed for the example, not computed."), "the fragments' numbers are labelled assumed, not computed");
  ok(/we treat a heat wave hotter than any on record as a stress scenario, because we cannot defend a probability for it/.test(EXS.plain(D.exemplars.find(e => e.comp === "uncertainty").answers[1])), "deep uncertainty from the evidence, not the record alone");
  // the text budget reaches the fragments and their introductions: every line of every fragment, and each element of a
  // pair's static introduction, at most 35 words
  { const wc = t => String(t).replace(/<[^>]+>/g, " ").trim().split(/\s+/).filter(Boolean).length, over = [];
    D.exemplars.forEach(e => e.answers.forEach(a => EXS.plain(a).split("\n").forEach(l => { if (wc(l) > 35) over.push(e.comp + ": " + l.slice(0, 40)); })));
    const SX = M.staticExemplars(D);
    (SX.match(/<p class="lx-hint">[\s\S]*?<\/p>/g) || []).forEach(p => { if (wc(p) > 35) over.push("intro: " + p.replace(/<[^>]+>/g, "").slice(0, 40)); });
    ok(!over.length, "every fragment line and every introduction element within 35 words: " + over.join(" | ")); }
  const pos = EXS.plain(D.exemplars.find(e => e.comp === "positioning").answers[1]);
  ok(/14 studies/.test(pos) && 14 >= 12 && /9 use billing data and 3 compare/.test(pos), "the gap's matrix holds 14 sources, more than the 12 Proficient asks for");
  const weakPos = EXS.marks(D.exemplars.find(e => e.comp === "positioning").answers[0])[0].note;
  ok(/not evidence of a gap, or of novelty/.test(weakPos), "the weak gap's note: scarcity is not novelty");
  ok(D.rubric.map(r => r.id).join() === RB.COMPETENCES.map(c => c.id).join() && D.rubric.every(r => r.look && !r.levels), "the rubric: all nine competences, look lines, no reworded levels");
  const cur = PRIV.path("curriculum");
  if (cur) {
    const c = fs.readFileSync(cur, "utf8");
    ok(RB.COMPETENCES.every(x => ["developing", "proficient", "strong"].every(l => c.includes(x[l]))), "rubric words are the course rubric's, word for word");
    ok(c.includes("| Completed Research Studio | the core path, the checkpoints CK-F, CK-A and CK-M, and a submitted CR with a self-assessment | the CR repository and report, the rubric sheet |"), "the course plan's first status");
  }
  ok(D.statuses[0].requires === "The core path, the checkpoints CK-F, CK-A and CK-M, and a submitted CR with a self-assessment." && D.statuses[0].evidence === "The CR repository and report, the rubric sheet." && /Proficient or better on all nine rubric competences/.test(D.statuses[1].requires), "the statuses as the course plan states them");
  has("The course issues no certificate or badge.", "no certificate");
}

// ---------------- the page on a stub document
(async () => {
  const { env, load, El } = require("./stubdom.js");
  if (!El.prototype.getBoundingClientRect) El.prototype.getBoundingClientRect = () => ({ top: 0, left: 0, width: 0, height: 0, bottom: 0, right: 0 });
  const r10 = { question: "How much irrigation pumping on a Plains farm could move to windy night hours?", type: "prescriptive", scale: "S0" };
  const E = env({ store: { "r10-card": JSON.stringify(r10) } });
  E.LX.ready = () => {}; E.LX.reduced = () => true; E.window.innerWidth = 1280;
  E.LX.lessonRefHTML = require(L("components/core.js")).lessonRefHTML; E.LX.lessonRef = require(L("components/core.js")).lessonRef;
  E.LX.Share = function (host, o) { const b = E.LX.H("button", { type: "button", text: o.buttonText || "Copy" }, o.button || host); return { el: b, copy: () => Promise.resolve(false), set() {}, url: () => "" }; };
  E.window.history = { replaceState() {} };
  ["sharestate", "reportnote", "questioncard", "exemplars", "rubric"].forEach(n => load(n, E));
  let init = null, demo = null;
  E.LX.mount = (slug, f) => { if (slug === ID) init = f; };
  E.LX.demo = (root, fn) => { demo = fn; return () => null; };
  ["cr-scene", "cr-results", "cr-note", "exemplars", "cr-rubric"].forEach(id => E.LX.H("div", { id }, E.body));
  vm.runInNewContext(JS, { window: E.window, document: E.document, location: E.location, history: E.window.history, navigator: {}, console, module: { exports: {} }, setTimeout: f => { f(); return 0; }, clearTimeout: () => {}, require });
  const root = E.LX.H("div", { class: "lx-interactive", "data-learn": ID }, E.body), live = E.LX.H("div", { class: "lx-live" }, root);
  let threw = null;
  try { init(live, { cr_your_own_study: D, r03_system_and_method: R3, path: P }, root); } catch (err) { threw = err.stack; }
  ok(!threw, "the page mounts on the stub document" + (threw ? ": " + threw : ""));
  if (threw) return finish();
  const $ = s => E.body.querySelector(s), $$ = s => E.body.querySelectorAll(s);
  const T = () => text($("#cr-scene").textContent);
  ok(T().includes("Model-based track: about 30 hours (20 to 40). At 6 hours a week, about 5 weeks (4 to 7)."), "the scene states the default plan");
  ok($$(".cr-seg").length === 9 && $$(".cr-stage").length === 9, "nine segments and nine stage cards");
  ok(/The nine stages in order, sized by their typical hours: 1 Question, 1.5 h; 2 Literature, 5 h/.test($(".cr-strip").getAttribute("aria-label")), "the strip's text alternative names each stage and its hours");
  ok(/3 of 4 in place/.test(text(live.textContent)) && /Your question card has no scale yet/.test(text(live.textContent)), "the default plan's checks with an empty card: 3 of 4, the scale pending");
  ok($$(".cr-stage details.cr-done-when").length === 9 && /Done when: 2 checks/.test($$(".cr-stage")[0].textContent) && ($$(".cr-stage")[0].querySelector("details.cr-done-when div").innerHTML.match(/<li>/g) || []).length === 2, "each stage card: one action, its checks folded in a checklist");
  ok(/Another Optimization method \(name it in the proposal\)/.test(text(live.textContent)), "the chosen family, as an alternative, is another method of it");
  // a track change moves the family to the track's usual one, and the plan's link follows
  live.querySelectorAll(".lx-choice").filter(b => /Empirical/.test(b.textContent))[0].click();
  ok(T().includes("Empirical track"), "the empirical track is drawn");
  ok(/Statistics and econometrics, the track's usual one/.test(text(live.textContent)), "the family follows the track, and the page says so");
  ok(/Another Statistics and econometrics method/.test(text(live.textContent)) && !/Another Optimization method/.test(text(live.textContent)), "the same-family alternative's label follows the family");
  ok($$(".cr-stage")[2].textContent.includes("M14"), "the empirical track's method stage names M14");
  // a stage ticked done is kept in the plan, and drawn
  $$(".cr-tick input")[0].checked = true; $$(".cr-tick input")[0].fire("change");
  ok($$(".cr-seg")[0].textContent === "1✓" && $$(".cr-stage")[0].classList.contains("done"), "a ticked stage is drawn done");
  // the card from the question studio
  const imp = $$("button").filter(b => /Use my card from the question studio/.test(b.textContent))[0];
  ok(imp && !imp.disabled, "the R10 card in this browser can be brought in");
  imp.click();
  ok(E.LX.store.get("cr-card", {}).question === r10.question, "the R10 card is now the capstone's card (stored as cr-card; R10's own is untouched)");
  ok(JSON.parse(E.store["r10-card"]).question === r10.question, "R10's stored card is unchanged");
  ok(/Your question card at the plan's scale/.test(text(live.textContent)) && /Your card says S0; the plan says S1/.test(text(live.textContent)), "the card's scale (S0) against the plan's (S1): said");
  const note = text($("#cr-note").textContent);
  ok(note.includes("Research proposal: an empirical study at S1") && note.includes(r10.question), "the proposal's preview: the heading and the card's question");
  ok(/of 12 parts in place/.test(note), "the proposal's twelve checks are listed");
  live.querySelectorAll(".lx-choice").filter(b => /Mixed/.test(b.textContent))[0].click();
  ok(/Mixed study: the qualitative findings need triangulation too/.test(text(live.textContent)), "a mixed plan says how its other part is treated");
  // the exemplars: nine buttons, one pair at a time
  const exb = $("#exemplars").querySelectorAll(".cr-ex-pick button");
  ok(exb.length === 9 && exb.map(b => b.textContent).join() === RB.COMPETENCES.map(c => c.label).join(), "the switcher: one button per competence, in the rubric's words");
  exb[2].click();
  ok(exb[2].getAttribute("aria-pressed") === "true" && /Method fit: the choice/.test($("#exemplars").textContent) && $$("#exemplars .lx-ex-ans").length === 2, "switching shows the method-fit pair only");
  ok($("#cr-rubric").querySelectorAll("fieldset").length === 9 || /Integrity/.test($("#cr-rubric").textContent), "the rubric draws all nine competences");
  ["mid", "note", "exemplars"].forEach(s => { let q = null; try { q = demo(s); } catch (err) { q = err.message; } ok(q && q.view, "demo state " + s + " runs: " + JSON.stringify(q)); });
  finish();
})().catch(err => { ok(false, "the stub page test threw: " + (err && err.stack || err)); finish(); });

function finish() {
  const ALL = [PAGE, RAW, JS, fs.existsSync(SIDE) ? fs.readFileSync(SIDE, "utf8") : ""].join("\n");
  ok(!/nuclear|reactor|\bSMR\b|small modular|fission|uranium/i.test(ALL), "no nuclear term (page, data, script)");
  ok(!/data[- ]?cent/i.test(ALL), "no data-center term: the capstone's examples steer nowhere near the excluded topics");
  ok(!/\bAI\b|artificial intelligence/.test(ALL), "no 'AI' anywhere");
  ok(!/\bFOAK\b|\bNOAK\b|first[- ]of[- ]a[- ]kind|nth[- ]of[- ]a[- ]kind|learning[- ](curve|rate)|order[- ]book|anchor[- ](customer|buyer)|subsidy[- ]free|break[- ]even|parity capital|smr-dc|projects\/|research\.(html|qmd)/i.test(ALL), "no deny-listed term");
  const OKH = h => /^https:\/\/doi\.org\/10\.[0-9]+\/[^\s"<>]+$/.test(h) || /^[0-9a-z-]+\.html(#[a-z0-9-]+)?$/.test(h);
  const hrefs = [...OWN.matchAll(/href="([^"]+)"/g)].map(m => m[1]).concat([...(RAW + JS).matchAll(/https?:\/\/[^\s"'<>)\]]+/g)].map(m => m[0]));
  ok(hrefs.length > 5 && hrefs.every(OKH), "links: learn pages and doi.org only: " + [...new Set(hrefs.filter(h => !OKH(h)))].join(" "));
  ok([...OWN.matchAll(/href="([0-9a-z-]+)\.html"/g)].every(m => all.some(l => l.id === m[1] && l.ready)), "every learn link in the page reaches a live page");
  ok(!/data-source="excerpt:/.test(PAGE), "no excerpt of the course author's research");
  const fm = k => ((PAGE.match(new RegExp("^" + k + ': "(.*)"$', "m")) || [])[1]), py = k => ((entry.match(new RegExp("\\n  " + k + ': "(.*)"')) || [])[1]);
  ok(fm("title") === py("title") && fm("subtitle") === py("subtitle"), "the page's title and subtitle equal path.yml's");
  ["#brief", "#plan", "#note", "#selfcheck", "#sources"].forEach(s => ok(new RegExp("::: \\{" + s + " \\.lx-sec\\}").test(PAGE), "the capstone form's section " + s));
  const GJ = JSON.parse(fs.readFileSync(L("data/glossary.json"), "utf8")), marks = [...(JS + RAW).matchAll(/\[\[([a-z0-9-]+)\|/g)].map(m => m[1]).concat([...PAGE.matchAll(/data-term="([a-z0-9-]+)"/g)].map(m => m[1]));
  ok(marks.length >= 5 && marks.every(m => GJ[m]), "every glossary mark has a definition: " + marks.filter(m => !GJ[m]).join(", "));
  console.log((fails ? "FAILED " + fails + " of " : "ok: ") + checks + " checks (" + ID + ")");
  process.exit(fails ? 1 : 0);
}
