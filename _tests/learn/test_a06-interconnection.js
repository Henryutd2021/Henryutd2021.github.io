// test_a06-interconnection.js — Node tests for lesson A6 (assets/learn/a06-interconnection.js, its data file and the page,
// learn/a06-interconnection.qmd):
//   - the cluster study: proportional-impact shares add up to the upgrade; withdrawals by the stated rule, restudies and
//     days; the readiness rule; every case the page offers (no withdrawal or one forced, readiness on or off) is clear of
//     ties (no share per kW equal to a limit, no flow equal to the headroom)
//   - N−1 at the east substation from first principles; the largest new load before an upgrade
//   - the money: CF7's toy, unchanged (the formulas equal cf7-cost-of-waiting.js for every wait, tariff share and bridge
//     power; the inputs are CF7's data file itself); staged service is linear (a share g of the load with g of the capital
//     and upgrades, checked by scaling the inputs); the tariff moves cost without changing the total; bridge power and
//     staged service lower the developer's cost; the avoided cost
//   - every number on the page (explain layer, Go deeper boxes, myths, quiz) and in the step cards' strings matches the
//     model or the data file; the live lines are true and short for every input the controls allow
//   - the four no-JS blocks equal what the model writes from the data (--write rewrites them)
//   - scope (guards G-DC, G-SRC): data centers only as loads; no nuclear technology on the page, in the data or the script;
//     no "AI"; links to learn pages, allowed domains and the allow-listed repository only; no project or Research page
//   - research wording (curriculum §13): every sentence about the course author's study is an approved sentence of
//     reports/learn/excerpts_for_approval.md (E7 with its revisions), word for word; the excerpt is E7.2, E7.3, E7.7, with
//     E7.8 under it and the citation E7.14 (no title, DOI pending)
//   - text budget, sources with dates, the ladder's answers, path.yml
// Usage (from the site folder):  node _tests/learn/test_a06-interconnection.js [--write]
"use strict";
const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const ID = "a06-interconnection";
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const M = require(L(ID + ".js"));
const CF7 = require(L("cf7-cost-of-waiting.js"));
const RAW = fs.readFileSync(L("data/" + ID + ".json"), "utf8");
const JS = fs.readFileSync(L(ID + ".js"), "utf8");
const D = JSON.parse(RAW);
const D7 = JSON.parse(fs.readFileSync(L("data/cf7-cost-of-waiting.json"), "utf8"));
const I7 = D7.idea;
const QPATH = path.join(SITE, "learn", ID + ".qmd");
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-9 : t);

// ---------------- the no-JS blocks: write (--write) or check
const BLOCKS = {
  "a06-fallback": () => M.staticSteps(D, I7),
  "a06-practice": () => M.staticPractice(D, I7),
  "a06-facts": () => M.staticFacts(D),
  "a06-sources": () => M.staticSources(D)
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
const text = s => s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
const T = text(PAGE);
// the string literals of the script (what the page shows; comments are not shown)
const literals = (JS.replace(/\/\/[^\n]*/g, " ").match(/"(?:[^"\\\n]|\\.)*"/g) || []).map(l => l.slice(1, -1).replace(/\\"/g, '"'));
const LIT = literals.join(" ");

// ---------------- the cluster study
const C = D.cluster, P = M.byId(C.projects);
const base = M.cluster(C);
const r1 = base.rounds[0], r2 = base.rounds[1];
ok(base.rounds.length === 2 && base.studies === 2 && base.days === 300, "default: two studies, 300 days");
ok(near(r1.flow, 200 * 0.6 + 150 * 0.4 + 100 * 0.3 + 250 * 0.5) && r1.flow === 335 && r2.flow === 210, "added flow = sum of MW × distribution factor: 335 MW, then 210 MW");
base.rounds.forEach(r => {
  if (r.upgrade) ok(near(r.rows.reduce((t, x) => t + x.share, 0), C.upgradeUSD, 1e-3), "study " + r.n + ": the shares add up to the $120M upgrade");
  r.rows.forEach(x => ok(near(x.share, r.upgrade ? C.upgradeUSD * x.impact / r.flow : 0, 1e-6) && near(x.perKW, x.share / (P[x.id].mw * 1000), 1e-9), "study " + r.n + ", " + x.id + ": share by proportional impact"));
});
ok(r1.leave.join() === "X" && r2.leave.length === 0 && base.connected.join() === "W,S,B" && base.connectedMW === 450 && base.upgrade, "the placeholder leaves; wind, solar and battery connect, 450 MW, with the upgrade");
const sh = (r, id) => r.rows.filter(x => x.id === id)[0];
ok(M.perkw(sh(r1, "W").perKW) === "$215/kW" && M.perkw(sh(r2, "W").perKW) === "$343/kW", "the wind farm's share: $215/kW, then $343/kW");
ok(["$43.0M", "$21.5M", "$10.7M", "$44.8M"].join() === ["W", "S", "B", "X"].map(id => M.musd(sh(r1, id).share)).join(), "study 1 shares $43.0M, $21.5M, $10.7M, $44.8M");
ok(["$68.6M", "$34.3M", "$17.1M"].join() === ["W", "S", "B"].map(id => M.musd(sh(r2, id).share)).join(), "study 2 shares $68.6M, $34.3M, $17.1M");
ok(Math.round(r1.perMW) === 358209 && Math.round(r2.perMW) === 571429, "per MW of flow: $358,209 and $571,429");
ok(M.perkw(sh(r1, "S").perKW) === "$143/kW" && M.perkw(sh(r1, "B").perKW) === "$107/kW" && M.perkw(sh(r1, "X").perKW) === "$179/kW", "study 1 per kW: $143, $107, $179");
const ready = M.cluster(C, { readiness: true });
ok(ready.barred.join() === "X" && ready.studies === 1 && ready.days === 150 && ready.connected.join() === base.connected.join() &&
   ready.connected.every(id => near(ready.final[id].share, base.final[id].share)), "readiness rule: the placeholder is barred; one study, 150 days, the same projects and shares");
// every case the page offers, with no ties
const cases = [];
[null].concat(C.forceable).forEach(f => [false, true].forEach(r => cases.push({ forced: f, readiness: r })));
cases.forEach(o => {
  const run = M.cluster(C, o), m = M.margins(C, run);
  ok(m.kw >= 10 && m.flow >= 10, "no tie in " + JSON.stringify(o) + " (closest share to a limit $" + m.kw.toFixed(1) + "/kW, flow to the headroom " + m.flow + " MW)");
  ok(run.rounds.length >= 1 && run.days === run.studies * C.studyDays && run.connected.length > 0, "a run ends with someone connected: " + JSON.stringify(o));
  run.rounds.forEach((r, k) => r.rows.forEach(x => ok(x.leaves === (x.perKW > x.limit || (k === 0 && o.forced === x.id)), "withdrawal rule in " + JSON.stringify(o))));
  if (o.forced) ok(run.rounds[0].leave.indexOf(o.forced) >= 0 && run.connected.indexOf(o.forced) < 0, "a forced project withdraws after the first study");
  const words = M.runWords(C, run);
  ok(new RegExp("^" + run.studies + " stud(y|ies), " + M.fmtN(run.days) + " days; ").test(words) && (run.upgrade ? /with the \$120\.0M upgrade\.$/ : /with no upgrade\.$/).test(words), "the run's words follow the run: " + words);
  ok(words.split(" ").length <= 25 && run.rounds.every(r => M.roundWords(C, r).split(" ").length <= 25), "the cluster's words stay short");
});
C.forceable.forEach(f => {
  const run = M.cluster(C, { forced: f }), w = M.forcedWords(C, run, f), last = run.rounds[run.rounds.length - 1];
  const followed = run.rounds.slice(1).reduce((a, r) => a.concat(r.rows.filter(x => x.over).map(x => x.id)), []);
  ok((followed.length > 0) === /^Then the /.test(w) && followed.every(id => w.indexOf(P[id].called) >= 0) && (last.upgrade ? /share the upgrade\.$/.test(w) : new RegExp("With " + last.flow + " MW of added flow, under the 160 MW headroom, the line has room: no upgrade\\.$").test(w)) && w.split(" ").length <= 35,
    "the words after withdrawing " + f + " are true: " + w);
});
const fB = M.cluster(C, { forced: "B" });
ok(fB.studies === 3 && fB.connected.join() === "W" && !fB.upgrade && M.perkw(sh(fB.rounds[1], "W").perKW) === "$400/kW", "the battery withdraws: the solar farm follows, the wind farm connects alone with no upgrade");
ok(!M.cluster(C, { forced: "S" }).upgrade && !M.cluster(C, { forced: "W" }).upgrade, "the solar farm or the wind farm withdraws: the line has room, no upgrade");

// ---------------- N−1 at the east substation
const N = D.n1;
const n0 = M.n1(N, N.campusMW, false), n3 = M.n1(N, N.campusMW, true);
ok(n0.load === 450 && n0.normal === 225 && n0.cont === 450 && !n0.fits && n0.over === 100 && n0.maxNew === 200, "two lines: 450 MW at the substation; one out, 450 MW on the other, 100 MW over; 200 MW fits");
ok(n3.normal === 150 && n3.cont === 225 && n3.fits && n3.maxNew === 550, "three lines: 225 MW each with one out; 550 MW fits");
for (let c = N.slider.min; c <= N.slider.max; c += N.slider.step) [false, true].forEach(t => {
  const r = M.n1(N, c, t), w = M.n1Words(N, c, t);
  ok(r.fits === (c <= r.maxNew) && near(r.cont * (r.lines - 1), N.eastMW + c) && (r.fits ? /^Fits/.test(w) : /^Does not fit/.test(w)) && w.split(" ").length <= 30, "N−1 verdict true at " + c + " MW, third line " + t);
});
ok(N.lineMW * N.lines - N.eastMW === 550, "the predict's wrong answer: 2 × 350 − 150 = 550 MW");

// ---------------- the money: CF7's toy, unchanged, plus staged service
ok(/data-src="[^"]*cf7-cost-of-waiting\.json/.test(PAGE) && /data\.cf7_cost_of_waiting\.idea/.test(JS), "the page reads CF7's toy from CF7's own data file");
ok(I7.loadMW === 100, "the money is at 100 MW (CF7's toy), not a 300 MW scale-up");
for (let t = 0; t <= I7.delays.max; t += I7.delays.step) I7.tariffShares.forEach(s => [false, true].forEach(b => {
  const a = M.ledgers(I7, t, s, b), c = CF7.ledgers(I7, t, s, b);
  ok(near(a.developer, c.developer, 1e-6) && near(a.ratepayers, c.ratepayers, 1e-6) && near(a.society, c.society, 1e-6), "the ledger equals CF7's at " + t + " months, share " + s + ", bridge " + b);
}));
const TOY = D.toy, st = TOY.staged;
const scale = (I, g) => Object.assign({}, I, { loadMW: I.loadMW * g, capitalCommitted: I.capitalCommitted * g, upgradeCost: I.upgradeCost * g });
for (let t = st.at; t <= I7.delays.max; t += I7.delays.step) I7.tariffShares.forEach(s => [false, true].forEach(b => {
  const x = M.staged(I7, t, s, b, st), A = M.ledgers(scale(I7, st.share), st.at, s, b), B = M.ledgers(scale(I7, 1 - st.share), t, s, b);
  ok(near(x.developer, A.developer + B.developer, 1e-3) && near(x.ratepayers, A.ratepayers + B.ratepayers, 1e-3) && near(x.society, A.society + B.society, 1e-3),
    "staged service = half the load (with half the capital and upgrades) at month " + st.at + " plus half at " + t + " (share " + s + ", bridge " + b + ")");
  if (t > st.at) ok(x.developer < M.ledgers(I7, t, s, b).developer, "staged service lowers the developer's cost at " + t + " months");
}));
const L36 = M.ledgers(I7, 36, 0, false), L12 = M.ledgers(I7, 12, 0, false), S36 = M.staged(I7, 36, 0, false, st), av = M.avoided(I7, 36, 12, 0, false, null);
ok(TOY.startWait === 36 && TOY.shorter === 12, "the toy starts at 36 months; a connection 12 months sooner");
ok(M.musd(L36.developer) === "$247.3M" && M.musd(L36.ratepayers) === "$20.9M" && M.musd(L36.society) === "$0.0M", "36 months: $247.3M, $20.9M, $0.0M");
ok(M.musd(L36.dev.margin) === "$144.2M" && M.musd(L36.dev.capital) === "$103.1M" && M.musd(L36.rate.carry) === "$12.4M" && M.musd(L36.rate.strand) === "$8.6M", "36 months, parts: $144.2M, $103.1M, $12.4M, $8.6M");
ok(M.annuity(I7, 36).toFixed(2) === "32.04", "A(36) = 32.04");
ok(M.musd(L12.developer) === "$88.8M" && M.musd(S36.developer) === "$168.1M" && M.musd(S36.ratepayers) === "$14.4M", "staged: $88.8M and $247.3M give $168.1M");
ok(M.musd(av.saves) === "$76.2M" && M.musd(av.to) === "$171.1M", "a connection 12 months sooner avoids $76.2M ($247.3M − $171.1M)");
ok(M.musd(L36.developer / 2) === "$123.6M", "the quiz's wrong answer: half the developer's cost, $123.6M");
for (let t = 0; t <= I7.delays.max; t += I7.delays.step) I7.tariffShares.forEach(s => [false, true].forEach(b => [false, true].forEach(sg => [false, true].forEach(ws => {
  const S = { tau: t, s: s, bridge: b, stagedOn: sg }, lines = M.moneyLines(I7, TOY, S, ws), x = M.staged(I7, t, s, b, ws && sg ? st : null), x0 = M.staged(I7, t, 0, b, ws && sg ? st : null);
  ok(lines.length <= (ws ? 4 : 3) && lines.every(l => l.split(" ").length <= 25), "money lines short at " + JSON.stringify(S) + " " + ws);
  if (t && s) ok(near(x.total, x0.total, 1e-6), "the tariff does not change the total at " + JSON.stringify(S));
  if (t && b) ok(x.developer < M.staged(I7, t, s, false, ws && sg ? st : null).developer && x.society > 0, "bridge power lowers the developer's cost and adds a social cost at " + JSON.stringify(S));
  if (ws && t >= TOY.shorter) ok(M.avoided(I7, t, TOY.shorter, s, b, sg ? st : null).saves > 0, "a sooner connection saves the developer something at " + JSON.stringify(S));
}))));
ok(M.ledgerRows(L36).map(r => r.head).join() === "Developer,Other customers,Society" && /^lost margin \$144\.2M, carrying cost of idle capital \$103\.1M$/.test(M.ledgerRows(L36)[0].what), "the ledger names every account and its parts");

// ---------------- numbers on the page and in the step cards
const E = D.ercot;
ok(near(M.security(N.campusMW, E.securityPerMW), 15e6) && near(M.security(120, E.securityPerMW), 6e6), "security: 300 MW × $50,000 = $15M; 120 MW = $6M");
ok(near(E.requestsGW, 474.7) && near(E.noStudyGW + E.energizedGW, 290.2) && (E.requestsGW / (E.peakMW / 1000)).toFixed(1) === "5.2", "ERCOT: 474.7 GW, about 5.2 times its 91.1 GW record");
ok(/the placeholder's withdrawal raised the wind farm's share from \$215 to \$343 per kW and added a 150-day restudy/.test(T) && /150 more days and the wind farm's share from \$215 to \$343 per kW/.test(T), "myth and explain: $215 → $343 per kW, 150 days");
ok(/the other must carry everything: 350 MW\. With the east side's own 150 MW, only 200 MW of new load fits/.test(T) && /two 350 MW lines serve 350 MW, not 700 MW/.test(T), "N−1 on the page = the model");
ok(/Of ERCOT's 474\.7 GW of large-load requests, 284\.3 GW had no studies submitted and 5\.9 GW were energized \(June 2026\)/.test(T), "myth 4 = the data");
ok(/\$120M ÷ 335 MW = \$358,209 in study 1; ÷ 210 MW = \$571,429 in study 2/.test(T), "Go deeper: per MW of flow");
ok(/\| Ridge wind farm \| 200 \| 120 MW \| \$43\.0M \| \$68\.6M \|/.test(PAGE) && /\| Mill Road solar farm \| 150 \| 60 MW \| \$21\.5M \| \$34\.3M \|/.test(PAGE) && /\| Depot battery \| 100 \| 30 MW \| \$10\.7M \| \$17\.1M \|/.test(PAGE) && /\| Placeholder request \| 250 \| 125 MW \| \$44\.8M \| withdrew \|/.test(PAGE), "Go deeper table = the model");
ok(/\$A\(36\) = 32\.04\$/.test(PAGE) && /lost margin \$144\.2M plus the carrying cost of idle capital \$103\.1M: \$247\.3M/.test(T) && /\$12\.4M plus expected stranded upgrades \$8\.6M: \$20\.9M/.test(T), "Go deeper Modeler: the parts at 36 months");
ok(/0\.5 × \$88\.8M \+ 0\.5 × \$247\.3M = \$168\.1M/.test(T) && /\$247\.3M − \$171\.1M = \$76\.2M/.test(T), "Go deeper Modeler: staged and avoided cost");
ok(/a 36-month wait costs the developer \$247\.3M\. Half the load is served at month 12 instead/.test(T) && /half the load waits 12 months \(\$88\.8M for the whole load\) and half waits 36 \(\$247\.3M\)/.test(T), "quiz = the model");
ok(/\$247\.3M<\/li><li data-value="b">\$168\.1M<\/li><li data-value="c">\$123\.6M/.test(PAGE), "quiz choices = the model");
ok(/13% was operating by the end of 2025/.test(T) && D.facts[1].what.indexOf("13%") < 0 && D.facts[1].n === "13%", "13%: page and data agree");
ok(/Now the campus\. Two 350 MW lines feed the east substation, whose own peak is 150 MW\. How much of the 300 MW fits before new wires\?/.test(LIT) && N.lineMW === 350 && N.eastMW === 150 && N.campusMW === 300, "step 7's text = the data");
ok(/a 200 MW wind farm wants to send power in, and a 300 MW data center campus/.test(LIT) && P.W.mw === 200, "step 1's text = the data");
ok(/asks each large load for \$50,000 of security per MW\. What would the 300 MW campus post\?/.test(LIT) && E.securityPerMW === 50000, "step 8's text = the data");
ok(/price a 36-month wait/.test(LIT) && /Order 2023 \(July 2023\)/.test(LIT), "step 9 and 5 texts = the data");
ok(/"\$1,000 a business day for a cluster study, paid to the delayed cluster\."/.test(JS) && /\$1,000 a business day for a cluster study, \$2,000 for a restudy, \$2,500 for a facilities study/.test(T), "late-study penalties as MISO slide 8 gives them");
ok(/Each restudy takes 150 days here, as long as a cluster study/.test(T) && C.studyDays === 150, "the datanote says the toy's restudy length");
// the step cards' text budget
const stepTexts = [...JS.matchAll(/\n      \{ text: "((?:[^"\\]|\\.)*)",\n        build/g)].map(m => m[1].replace(/\[\[[a-z0-9-]+\|([^\]]+)\]\]/g, "$1"));
ok(stepTexts.length === 10, "ten step cards (" + stepTexts.length + ")");
stepTexts.forEach(t => ok(t.split(" ").length <= 40, "step text of " + t.split(" ").length + " words: " + t.slice(0, 60)));

// ---------------- sources and the ladder
D.facts.forEach(f => {
  ok(f.n && f.what && f.source && f.asof && (!f.url || /^https:\/\//.test(f.url)), "fact '" + f.n + "' has a source and a date");
  ok(PAGE.indexOf(f.what.replace(/&/g, "&amp;")) >= 0 || PAGE.indexOf(f.what) >= 0, "fact '" + f.n + "' is on the page");
});
const rung = D.ladder.rungs.map(r => r.id).concat([D.ladder.off.id]);
D.ladder.items.forEach(it => ok(it.answer.length && it.answer.every(a => rung.indexOf(a) >= 0) && it.note.split(" ").length <= 35, "ladder item '" + it.id + "': answers are rungs, note short"));
ok(D.ladder.items.filter(it => it.id === "ercot")[0].note.indexOf("284.3 GW") >= 0 && D.ladder.items.filter(it => it.id === "ia")[0].text.indexOf("549 GW") >= 0, "ladder notes = the facts");

// ---------------- scope: guards G-DC and G-SRC, no nuclear technology, no AI
const ALL = PAGE + "\n" + RAW + "\n" + JS;
ok(!/nuclear|reactor|\bSMR\b|small modular|fission|uranium/i.test(ALL), "no nuclear technology on the page, in the data or in the script");
ok(!/\bAI\b|artificial intelligence/.test(ALL), "no 'AI' anywhere");
ok(!/data[- ]cent\w*[^.]{0,80}\b(supply|supplies|supplied|power plant|build|generat|buyer|order)/i.test(T + " " + LIT), "data centers appear as loads, never as builders or buyers of supply");
ok(!/projects\/|research\.html/.test(PAGE + RAW + JS), "no project page and no Research page");
const OWN = PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?<!-- learn:\1:end -->/g, "");
const ALLOWED = /^https:\/\/(github\.com\/Henryutd2021\/code-delayed-energization|eta-publications\.lbl\.gov\/|cdn\.misoenergy\.org\/|www\.ercot\.com\/|www\.energy\.gov\/)/;
const hrefs = [...OWN.matchAll(/href="([^"]+)"/g)].map(m => m[1]);
ok(hrefs.length > 5 && hrefs.every(h => ALLOWED.test(h) || /^[0-9a-z-]+\.html$/.test(h) || /^#/.test(h)), "links: allowed domains, the repository and learn pages only: " + hrefs.filter(h => !(ALLOWED.test(h) || /^[0-9a-z-]+\.html$/.test(h) || /^#/.test(h))).join(", "));
ok(D.sources.concat(D.facts).every(x => !x.url || ALLOWED.test(x.url)), "data-file links: allowed domains only");
ok(!/escholarship|aepohio|capitol\.texas/.test(ALL), "no links outside the allow-list");

// ---------------- research wording (curriculum §13, guard G-SRC), as in CF7's and A4's tests
const APPROVED_SNAPSHOT = {   // excerpts_for_approval.md, E7 with the revisions after review (2026-11-03)
  "E7.1": "What does it cost when a large data center must wait for grid energization, and how does the delay affect the developer, electricity ratepayers and society?",
  "E7.2": "A late grid connection costs the developer lost margin and carrying costs; ratepayers face utility carrying and stranding costs; society bears external costs.",
  "E7.3": "The study keeps these present-value accounts separate.",
  "E7.4": "For a 300 MW-IT facility, a 36-month delay costs the developer on the order of $0.7 billion in present value.",
  "E7.5": "Staged energization can recover a large share of that cost.",
  "E7.6": "Ratepayer exposure depends strongly on large-load tariff design.",
  "E7.7": "The delay is treated as exogenous and parameters are illustrative; network feasibility is not modeled, and the social perspective is illustrated with a single bridge-power example.",
  "E7.8": "Holds when: the delay is given and the inputs are illustrative. Leaves out: why service is late.",
  "E7.9": "Inside: one large load waiting for its first grid service (the study's case: a 300 MW-IT data center), priced for three parties in present value. Left out: why the connection is late, whether the network can carry the load, and real project data: the parameters are illustrative.",
  "E7.10": "Decisions: whether to pay for a mitigation option (staged service or bridge power), and who funds it. Goal: price the wait for each party, so an option can be judged against what it saves each one. Rules: the three accounts stay separate; a net-benefit test says when they may be combined.",
  "E7.11": "A present-value framework turns the delayed computing capacity into the grid MW it needs and prices the delay in three ledgers. Two measures compare cases: a delay cost per MW-month, and the largest payment worth making to shorten the wait. Inputs are screened with Latin hypercube sampling.",
  "E7.12": "The delay is priced in three separate accounts: the developer, electricity ratepayers and society.",
  "E7.13": "Where the result holds: the delay is taken as given, not explained; the parameters are illustrative, so the study reports which inputs move the result, not a forecast; the three accounts stay separate, and a net-benefit test says when they may be added. It leaves out: why service is late: the interconnection process itself; whether the network can carry the load (network feasibility); social costs beyond a single bridge-power example.",
  "E7.14": "Li et al. (2026). Accepted paper on the cost of delayed grid energization for large loads, 2026 North American Power Symposium (NAPS), presented October 2026; DOI pending."
};
// names the study, its author, its case or its method: such an element is research text unless approved or listed below
const RX = /\b(the study (keeps|reports)|the study's|paper|article|NAPS|Li et al|course author|excerpt|research|published|accepted|300 MW-IT|36-month delay|0\.7 billion|exogenous|net-benefit test|framework|present-value accounts)\b/i;   // "study" alone is this lesson's subject (an interconnection study), so it does not signal the author's study
const NOT_RESEARCH = [
  [/^Approved excerpt of: Li et al\. \(2026\), accepted paper, 2026 North American Power Symposium \(NAPS\); DOI pending\.$/, "provenance label (E7.14's citation, short, as CF7)"],
  [/^Invented round numbers, not the study's inputs, equations or results\.$/, "provenance label of CF7's toy (CF7's data file, 'note')"],
  [/^Illustrative round numbers, not the study's inputs, equations or results\.$/, "CF7's toy note (read from CF7's data file)"],
  [/^Case file CF7's toy, unchanged: a " \+ I7\.loadMW \+ " MW load\. $/, "provenance label (the toy)"],
  [/^This lesson is about that last part\. The full case: case file CF7; open code with illustrative inputs: code-delayed-energization\.$/, "navigation: the case file and the repository"],
  [/^code-delayed-energization on GitHub, version 1\.0\.0 \(30 October 2026\): open code with illustrative inputs\.$/, "citation of the repository"],
  [/^A late connection has a price, and someone pays it\.$/, "lead-in of the real-world box: a general idea"],
];
const norm = s => String(s).replace(/\[\[[a-z0-9-]+\|([^\]]+)\]\]/g, "$1").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'")
  .replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").replace(/ ([.,;:?!)])/g, "$1").replace(/\( /g, "(").trim();
function portfolio() {
  const c = [process.env.LEARN_PORTFOLIO, path.join(SITE, "..")];
  try { c.push(path.resolve(SITE, cp.execSync("git rev-parse --git-common-dir", { cwd: SITE, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(), "..", "..")); } catch (e) { /* not a git checkout */ }
  return c.filter(Boolean).find(p => fs.existsSync(path.join(p, "reports/learn/excerpts_for_approval.md")));
}
function register(md) {
  const out = {}; let sec = null;
  const strip = t => norm(t.replace(/^(Timeline, [^:]+|Myth answer|Citation): /, ""));
  md.split("\n").forEach(line => {
    if (/^## /.test(line)) { const h = line.match(/^## (E\d+)\.|^## (Revisions after review)/); sec = h ? (h[1] || "REV") : null; return; }
    const m = line.match(/^\| (E(\d+)\.\d+) \| (.*) \|\s*$/);
    if (!m || !sec || m[2] !== "7") return;
    const cells = m[3].split(" | ");
    if (sec === "REV") out[m[1]] = strip(cells[1]); else if (sec === "E" + m[2]) out[m[1]] = strip(cells[0]);
  });
  return out;
}
const RP = portfolio();
let APPROVED = APPROVED_SNAPSHOT;
if (RP) {
  const reg = register(fs.readFileSync(path.join(RP, "reports/learn/excerpts_for_approval.md"), "utf8"));
  const same = (x, y) => Object.keys(x).length === Object.keys(y).length && Object.keys(x).every(k => x[k] === y[k]);
  ok(same(reg, APPROVED_SNAPSHOT), "the approved-sentence snapshot equals the register (E7, revisions applied); differs at: " + Object.keys(Object.assign({}, reg, APPROVED_SNAPSHOT)).filter(k => reg[k] !== APPROVED_SNAPSHOT[k]).join(", "));
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
  return sentencesOf(seg).find(x => RX.test(x) && !approved(x) && !listed(x)) || null;
}
function elements(html) {
  return html.replace(/<!--[\s\S]*?-->/g, " ").replace(/^- (.*)$/gm, "<li>$1</li>").replace(/\[([^\]]+)\]\{[^}]*\}/g, "$1").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .split(/<\/?(?:p|li|ul|ol|dl|dt|dd|div|blockquote|footer|table|thead|tbody|tr|td|th|caption|details|summary|header|h[1-6]|section|nav|script|style)\b[^>]*>|```[^\n]*\n?/i)
    .map(norm).filter(s => s && !/^(:::|\{=html\})/.test(s) && /[A-Za-z]/.test(s));
}
const bad = [];
const signalled = (where, list) => list.forEach(s => { if (RX.test(s)) { const o = offending(s); if (o) bad.push(where + ": " + o); } });
signalled("page", elements(OWN.replace(/<style>[\s\S]*?<\/style>/g, " ").replace(/^---[\s\S]*?\n---\n/, " ")));
const FM = (PAGE.match(/^---\n([\s\S]*?)\n---/) || [])[1] || "";
signalled("front matter", [...FM.matchAll(/^(title|subtitle|description): "(.*)"$/gm)].map(m => m[2]));
const PATHYML = fs.readFileSync(path.join(SITE, "learn/path.yml"), "utf8"), entry = (PATHYML.split(/\n- kind: /).find(e => new RegExp("\\n  id: " + ID + "\\n").test(e)) || "");
ok(entry.length > 0 && /\n  status: active\n/.test(entry) && /\n  after: \[F8, 8\]\n/.test(entry) && /\n  minutes: 25\n/.test(entry) && /\n  practice_minutes: 30/.test(entry), "path.yml: the full entry, active, after F8 and lesson 8, 25 + 30 minutes");
signalled("path.yml", [...entry.matchAll(/^  (title|subtitle|short|does|outcome): "(.*)"$/gm)].map(m => m[2]));
const strings = (o, k) => typeof o === "string" ? [[k, o]] : o && typeof o === "object" ? Object.keys(o).flatMap(j => strings(o[j], j)) : [];
signalled("data", strings(D).filter(x => ["about", "url", "built"].indexOf(x[0]) < 0).map(x => x[1]));
signalled("script", literals);
ok(bad.length === 0, "research wording: every sentence about the study is approved:\n  " + bad.join("\n  "));
// the excerpt: E7.2, E7.3, E7.7, word for word, with CF7's footer; E7.8 under it; E7.14 in the sources
const bq = [...OWN.matchAll(/<blockquote class="lx-excerpt" data-source="([^"]+)">([\s\S]*?)<footer>([\s\S]*?)<\/footer><\/blockquote>/g)];
const sent = bq.length ? [...bq[0][2].matchAll(/<p>([\s\S]*?)<\/p>/g)].map(x => norm(x[1])) : [];
ok(bq.length === 1 && bq[0][1] === "excerpt:code" && sent.join("|") === [APPROVED["E7.2"], APPROVED["E7.3"], APPROVED["E7.7"]].map(norm).join("|"), "one excerpt (excerpt:code): E7.2, E7.3 and E7.7, word for word");
ok(bq.length === 1 && bq[0][3] === "Approved excerpt of: Li et al. (2026), accepted paper, 2026 North American Power Symposium (NAPS); DOI pending.", "the excerpt's footer is CF7's citation");
ok(PAGE.indexOf("<p class=\"lx-hint\">" + APPROVED["E7.8"] + "</p>") > 0, "E7.8 under the excerpt, word for word");
ok(D.sources.some(x => x.text === APPROVED["E7.14"] && !x.url), "the sources cite E7.14 (no title, no link)");
ok(!/\b(published)\b[^.]{0,60}(NAPS|Li et al)/i.test(T + RAW), "the paper is accepted, never called published");
ok(T.indexOf("0.7 billion") < 0 && T.indexOf("300 MW-IT") < 0, "the page does not show E7.4 next to its toy (the money stays at 100 MW)");

// ---------------- text budget of the page's own prose (one idea, about 35 words)
const GENERATED = /<!-- (a06-[a-z]+):start[\s\S]*?<!-- \1:end -->/g;
const prose = elements(OWN.replace(GENERATED, " ").replace(/<style>[\s\S]*?<\/style>/g, " ").replace(/<script[\s\S]*?<\/script>/g, " ").replace(/^---[\s\S]*?\n---\n/, " ").replace(/^\|.*\|$/gm, " ").replace(/\$\$[\s\S]*?\$\$/g, " "));
prose.forEach(s => { const w = s.split(" ").length; ok(w <= 45 || approved(s), "text element of " + w + " words: " + s.slice(0, 70)); });

console.log((fails ? "FAILED " + fails + " of " : "ok: ") + checks + " checks (" + ID + ")");
process.exit(fails ? 1 : 0);
