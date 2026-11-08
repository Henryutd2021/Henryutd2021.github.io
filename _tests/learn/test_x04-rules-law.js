// test_x04-rules-law.js — Node tests for side topic X4 (assets/learn/x04-rules-law.js, its data file and the page
// learn/x04-rules-law.qmd):
//   - every date difference recomputed here with the calendar (the hook's span, the proposal-to-rule span, the 240-day
//     quiz), so each answer and reveal is true for the data as stored
//   - the ordering task: the shuffled list is a real shuffle of the six stages, the stages are in date order, and the
//     score counts places right for every order a reader can tap (all 720 of them)
//   - every sorted decision, rate-case stage and fact names a source in the data file, each with a date; the facts'
//     numbers equal the data they summarise
//   - the no-JS block, ideas, stop box, Go deeper, check, facts and sources equal what the model writes (--write)
//   - scope: neutral wording (no verdict on any rule), no live proceeding (every dated stage ends by 2020), no nuclear
//     term, no "AI", links on the allow-list (the Kansas statutes cited by name only)
//   - text budget of the step cards, reveals and the page's prose
// Usage (from the site folder):  node _tests/learn/test_x04-rules-law.js [--write]
"use strict";
const fs = require("fs");
const path = require("path");
const ID = "x04-rules-law";
const SITE = path.resolve(__dirname, "..", "..");
const L_ = p => path.join(SITE, "assets/learn", p);
const M = require(L_(ID + ".js"));
const S = require("./shelf_stop.js");
const TL = require(L_("components/timeline.js"));
const RAW = fs.readFileSync(L_("data/" + ID + ".json"), "utf8");
const D = JSON.parse(RAW);
const JS = fs.readFileSync(L_(ID + ".js"), "utf8");
const SIDE = fs.readFileSync(path.join(SITE, "learn/_w1/" + ID + ".yml"), "utf8");
const QPATH = path.join(SITE, "learn", ID + ".qmd");
let checks = 0, fails = 0;
const plain = S.plain, nWords = S.nWords, nSent = S.nSent, LX_esc = S.esc;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }

// ---------------- the generated blocks
const BLOCKS = { "x04-fallback": () => M.staticFallback(D), "x04-ideas": () => M.ideasHTML(D), "x04-stop": () => S.stopHTML(D.stop, "x04"), "x04-deeper": () => M.deeperHTML(),
  "x04-check": () => M.checkHTML(D), "x04-facts": () => M.factsHTML(D), "x04-sources": () => M.sourcesHTML(D) };
function between(q, name) {
  const a = q.match(new RegExp("<!-- " + name + ":start[^>]*-->\\n")), b = q.indexOf("<!-- " + name + ":end -->");
  if (!a || b < a.index) throw new Error(name + " markers missing in " + QPATH);
  return { from: a.index + a[0].length, to: b };
}
if (process.argv.includes("--write")) {
  let q = fs.readFileSync(QPATH, "utf8");
  Object.keys(BLOCKS).forEach(k => { const r = between(q, k); q = q.slice(0, r.from) + BLOCKS[k]() + "\n" + q.slice(r.to); });
  fs.writeFileSync(QPATH, q);
  console.log("blocks written: " + Object.keys(BLOCKS).join(", "));
}
const PAGE = fs.readFileSync(QPATH, "utf8");
Object.keys(BLOCKS).forEach(k => { const r = between(PAGE, k); ok(PAGE.slice(r.from, r.to) === BLOCKS[k]() + "\n", k + " block is up to date (run with --write)"); });
const OWN = PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?<!-- learn:\1:end -->/g, "");

// ---------------- dates, recomputed with the calendar
const utc = s => { const p = s.split("-").map(Number); return Date.UTC(p[0], p[1] - 1, p[2]); };
function spanRef(a, b) {   // brute force: add whole months to a while it stays at or before b, then count days
  const A = a.split("-").map(Number); let m = 0;
  while (Date.UTC(A[0], A[1] - 1 + m + 1, A[2]) <= utc(b)) m++;
  return { years: Math.floor(m / 12), months: m % 12, days: Math.round((utc(b) - Date.UTC(A[0], A[1] - 1 + m, A[2])) / 864e5) };
}
{ const s = M.span(D.hook.start, D.hook.end), r = spanRef(D.hook.start, D.hook.end);
  ok(s.years === r.years && s.months === r.months && s.days === r.days && s.years === 4 && s.months === 9 && s.days === 29, "hook: 19 Nov 2015 to 17 Sep 2020 is 4 years, 9 months and 29 days");
  ok(D.hook.answer === "c" && /Almost five years/.test(D.hook.options[2].label) && s.years * 12 + s.months >= 54, "the hook's answer, almost five years, is true");
  const fb = M.hookFeedback(D); ok(/^Yes: 4 years, 9 months and 29 days/.test(fb.c) && /^Longer/.test(fb.a) && /^Longer/.test(fb.b), "hook feedback true for every option"); }
const step = id => D.steps.filter(s => s.id === id)[0];
{ const s = M.span(step("nopr").date, step("final").date), r = spanRef(step("nopr").date, step("final").date);
  ok(s.years === r.years && s.months === r.months && s.days === r.days && s.years === 3 && s.months === 10 && s.days === 0 && /3 years and 10 months\./.test(M.orderSaw(D)), "proposal to final rule: 3 years and 10 months exactly"); }
// the quiz: 240 days after the filing date, and the two wrong options
{ const due = new Date(utc(D.quiz.filed) + D.quiz.days * 864e5).toISOString().slice(0, 10), html = M.checkHTML(D);
  ok(due === "2026-10-27" && M.addDays(D.quiz.filed, D.quiz.days) === due && html.indexOf(M.longDate(due)) > 0, "the clock question: 1 March 2026 + 240 days = 27 October 2026");
  ok(html.indexOf(M.longDate(M.addDays(D.quiz.filed, 60))) > 0 && html.indexOf(M.longDate(M.addDays(D.quiz.filed, 365))) > 0 && /data-answer="b"/.test(html), "the wrong options are 60 days and a year; the answer is the second"); }
ok(M.longDate("2020-09-17") === "17 September 2020", "dates are written day month year");

// ---------------- the ordering task
const truth = D.steps.map(s => s.id);
ok(D.shuffle.length === truth.length && D.shuffle.slice().sort().join() === truth.slice().sort().join() && D.shuffle.join() !== truth.join(), "the shuffle is a real permutation of the six stages");
ok(D.steps.filter(s => s.date).every((s, i, a) => i === 0 || s.date > a[i - 1].date) && D.steps[D.steps.length - 1].date === null, "the stages are in date order; the tariff filings come last, dated by the rule's clock");
{ let all = 0; const perm = (arr, pre) => { if (!arr.length) { const g = M.orderScore(D, pre), want = pre.filter((id, i) => truth[i] === id).length; if (g.right !== want) ok(false, "score of " + pre.join(",")); all++; return; }
    arr.forEach((x, i) => perm(arr.slice(0, i).concat(arr.slice(i + 1)), pre.concat([x]))); };
  perm(truth, []); ok(all === 720, "the score is right for all 720 orders"); }
ok(M.orderScore(D, truth).right === 6 && !/true order is shown/.test(M.orderLine(D, truth)) && /true order is shown/.test(M.orderLine(D, D.shuffle)), "the line after checking is true for a right and a wrong order");
ok(step("rfc").comments === 44 && step("nopr").comments === 109 && step("conf").comments === 52, "comment counts as in the order's procedural history (44, 109, 52)");
{ const ev = M.timelineEvents(D), probs = TL.validate(ev); ok(Array.isArray(probs) && probs.length === 0 && ev.length === 5, "the explain layer's timeline events are valid for LX.Timeline (" + probs.join("; ") + ")");
  const bad = TL.validate([{ date: "2020-09-17", label: "x", source: { label: "y", as_of: "issued 17 September 2020" } }]); ok(bad.length === 1, "the validator refuses a source date in words (the bug the screenshots caught)"); }
ok(D.steps.every(s => !s.date || s.date <= "2020-12-31"), "no live proceeding: every dated stage of the rulemaking ends by 2020");

// ---------------- sources behind every claim
const SRC = D.sources, TXT = k => SRC[k].cite + ": " + SRC[k].used.join(" ");
D.cards.forEach(c => ok(D.bins.some(b => b.id === c.bin) && SRC[c.src] && c.why.toLowerCase().indexOf(c.bin) === 0, c.id + ": a bin, a source and a reason that names its level"));
D.rateCase.forEach(c => ok(SRC[c.src], c.id + ": a source"));
ok(D.rateCase.length === 6 && /240 days/.test(D.rateCase[5].text) && /waived/.test(D.rateCase[5].text) && /240 days from the filing date/.test(TXT("kcc-rates")), "the rate case's order stage states the 240-day rule and its waiver, as the KCC does");
ok(/not required by law/i.test(D.rateCase[3].text) && /generally held in significant cases/.test(TXT("kcc-rates")), "the public hearing is described as the KCC does");
ok(D.settlement.answer === "no" && /accept, reject or modify a settlement/.test(TXT("kcc-rates")), "the settlement answer matches the KCC");
D.facts.forEach(f => ok(SRC[f.src] && SRC[f.src].asOf, f.n + ": a dated source"));
{ const f = D.facts.filter(x => /years/.test(x.n))[0], s = M.span(D.hook.start, D.hook.end); ok(f.n === s.years + " years " + s.months + " months" && f.what.indexOf(s.years + " years, " + s.months + " months and " + s.days + " days") > 0, "the span fact equals the computed span"); }
ok(D.facts.some(f => f.n === String(step("nopr").comments)) && D.facts.some(f => f.n === D.quiz.days + " days"), "the 109 and 240-day facts equal the data");
ok(/230 kV/.test(TXT("ks-siting")) && /5 miles/.test(TXT("ks-siting")) && /hearing within 90 days of the filing/.test(TXT("ks-siting")) && /180 days of the filing/.test(TXT("ks-siting")) && SRC["ks-siting"].url === null, "the Kansas siting law: 230 kV, 5 miles, a hearing within 90 days, a final order within 180, cited by name without a link");
{ const f = D.facts.filter(x => x.src === "ks-siting")[0], html = M.factsHTML(D);
  ok(/hearing within 90 days of the filing and a final order within 180 days/.test(f.what) && html.indexOf("K.S.A. 66-1,177 and K.S.A. 66-1,178") > 0, "the siting fact: two deadlines, both statutory sections shown");
  ok(html.indexOf("Undated, read 7 November 2026") > 0 && !/ · undated</.test(html), "the facts table keeps each source's access date"); }
Object.keys(SRC).forEach(k => { ok(SRC[k].cite && Array.isArray(SRC[k].used) && SRC[k].used.length >= 1, k + ": a citation and the short claims it supports");
  SRC[k].used.forEach(u => ok(nWords(u) <= 30, k + ": a 'supports' line of " + nWords(u) + " words")); ok(nWords(SRC[k].cite) <= 30, k + ": a citation of " + nWords(SRC[k].cite) + " words"); });
Object.keys(SRC).forEach(k => ok(/\d{4}/.test(SRC[k].asOf) && S.linkOK(SRC[k].url), k + ": dated, link on the allow-list or none"));

// ---------------- the chain of authority (a law, then three tracks) and the selected milestones
ok(D.chain.root && D.chain.tracks.length === 3 && /separate tracks and can overlap/.test(D.chain.note) && /authority/.test(D.chain.root.text), "a law, then three separate tracks that can overlap, not one sequence");
D.chain.root.src.concat(...D.chain.tracks.map(t => t.src)).forEach(k => ok(SRC[k], "the tracks cite " + k));
{ const h = M.chainHTML(D); ok(D.chain.tracks.every(t => h.indexOf(t.title) > 0) && h.indexOf(D.chain.note) > 0 && M.staticFallback(D).indexOf(h) >= 0, "the tracks figure, also in the no-JS block"); }
ok(/six selected milestones/.test(M.orderSaw(D)) && /gathered information repeatedly/.test(M.orderSaw(D)) && !/four times/.test(JS + RAW), "the milestones are a selection; no count of rounds claimed");
ok(/selected milestones/.test(M.STEPS[1]) && M.STEPS.every(t => !/^Energy rules come in layers/.test(t)) && nSent(M.STEPS[0]) === 1, "step 1 is the date question alone; the tracks come with its reveal");
ok(/Kansas/.test(M.STEPS[4]) && /\[\[voltage\|kV\]\]/.test(M.STEPS[4]) && ["345", "40 miles"].every(n => M.STEPS[4].indexOf(n) >= 0 && D.project.indexOf(n) >= 0) && /kilovolts/.test(D.project), "the project is introduced before the sort, in Kansas, with kV explained; its numbers equal the data's");
ok(/KCC issues its decision/.test(JS) && /usually within 240 days of filing/.test(JS) && !/Retail rates change/.test(JS) && /may approve, change or reject it/.test(JS), "the flowchart: a decision deadline, not a rate change");
{ const dp = M.deeperHTML(); ok(/depreciation/.test(dp) && /income taxes/.test(dp) && /data-term="rate-base"/.test(dp) && /data-term="customer-class"/.test(dp) && /debt and its shareholders/.test(dp), "the revenue requirement: approved expenses incl. depreciation and taxes, a financing return; terms marked"); }
ok(/depreciation and taxes/.test(SIDE) && ["rate-base", "intervenor", "evidentiary-hearing"].every(t => new RegExp("id: " + t + "\\b").test(SIDE)), "the sidecar defines the revenue requirement fully, and the rate base, an intervenor and an evidentiary hearing");
ok(/Citizens Utility Ratepayer Board \(CURB\)/.test(D.rateCase.filter(c => c.id === "testimony")[0].text) && /\[\[intervenor\|/.test(RAW) && /\[\[evidentiary-hearing\|/.test(RAW), "CURB expanded and the legal terms marked at first use");
{ const fb = M.staticFallback(D), vq = M.voiceQ(D.voice);
  ok(/may accept, reject or modify a settlement/.test(fb) && fb.indexOf(LX_esc(vq) + "?") > 0 && fb.indexOf(LX_esc(D.voice.static)) > 0 && !/\[\[/.test(fb), "the no-JS block has the settlement answer and the public-voice question with its choices and a self-contained answer, with no raw marks");
  ok(/comment on a KCC rate case, comment on a FERC proposed rule, or vote on the commission's final order$/.test(vq) && /KCC rate case/.test(D.voice.static) && /FERC proposed rule/.test(D.voice.static) && /only commissioners vote/.test(D.voice.static), "the no-JS question names its three choices; the answer names both kinds of comment and who votes"); }
// jurisdiction, first-use terms and the permit track (the sweep review's points)
{ const retail = D.chain.tracks[1].text, fed = D.chain.tracks[0].text;
  ok(/investor-owned utilities but not most electric cooperatives or city-run utilities/.test(retail) && D.chain.tracks[1].src.indexOf("kcc-role") >= 0 && /does not regulate most electric cooperatives or municipalities/.test(TXT("kcc-role")), "the retail track states the KCC's jurisdiction as the KCC does (not every Kansas utility)");
  ok(/\[\[ferc\|FERC\]\]/.test(fed) && /\[\[rto\|RTO\]\]/.test(fed) && /its tariff, its service rules and prices/.test(fed) && /data-term="ferc"/.test(M.chainHTML(D)), "FERC, RTO and the filed tariff explained at first use, in the reveal and the no-JS block");
  ok(/investor-owned/.test(D.project) && /\[\[investor-owned-utility\|/.test(M.STEPS[2]) && /investor-owned utility \(fictional\)/.test(M.STEPS[4]), "Prairie Town's utility is investor-owned from the outset");
  ok(/\[\[settlement\|settlement\]\], a joint proposal/.test(M.STEPS[3]) && /id: settlement\b/.test(SIDE), "a settlement is explained where it first appears, and defined in the sidecar");
  ok(/Southwest Power Pool \(SPP\)/.test(D.cards[0].text) && /North American Electric Reliability Corporation \(NERC\)/.test(D.cards.filter(c => c.id === "nerc")[0].why), "SPP and NERC are spelled out");
  ok(/Guess the order/.test(M.STEPS[1]) && /dates come with the answer/.test(M.STEPS[1]) && /Tap the one you think came first/.test(JS) && !/Tap the milestone that came first/.test(JS), "the ordering task is framed as a guess, answered with the dates");
  ok(/kcc: \{[^}]*s: "rate cases", sN: "rate cases"/.test(JS) && !/line permits/.test(JS) && /loc: \{ t: "Project permits"[^}]*KCC for big lines/.test(JS) && /label: "The 345 kV line", path: \["loc", "out"\][^}]*230 kV[^}]*5 miles[^}]*180 days of filing/.test(JS), "the flowchart's KCC box is rate cases only; line permits have their own trace with the 180-day order");
  ok(/opportunity, not a guarantee/.test(M.deeperHTML()) && /approves as serving customers/.test(M.deeperHTML()) && /approves as serving customers[^"]*opportunity, not a guarantee/.test(SIDE) && /opportunity, not a guarantee/.test(TXT("kcc-rates")), "the rate base: approved plant after depreciation, and an opportunity to earn the return, as the KCC says"); }
ok(/if \(g\.placed < g\.total\) \{ api\.saw\(sortLine\(g\), true\); return; \}/.test(JS) && /^Place every card first/.test(M.sortLine({ right: 0, placed: 0, total: 7 })), "the sort counts only with every card placed");

// ---------------- the stop box, scope and links
ok(S.problems(D.stop).length === 0, "the stop box has its parts: " + S.problems(D.stop).join("; "));
const ALL = PAGE + "\n" + RAW + "\n" + JS + "\n" + SIDE;
ok(!/nuclear|reactor|\bSMR\b|small modular|data[- ]cent/i.test(ALL), "no nuclear or data-center term");
ok(!/\bAI\b|artificial intelligence/.test(ALL), "no 'AI'");
ok(!/projects\/|research\.html|smr-dc|field-notes/.test(ALL), "no project page, Research page or Field Notes link");
ok(!/\b(too slow|unfair|bad rule|good rule|should be (changed|repealed|faster)|burdensome|red tape)\b/i.test(ALL), "neutral: no verdict on any rule or process");
ok(!/\bRM(19|2[0-9])-|\bER2[3-9]-|\bEL2[3-9]-/.test(ALL), "no docket number later than the finished rulemaking's");
const hrefs = [...OWN.matchAll(/href="([^"]+)"/g)].map(m => m[1].replace(/&amp;/g, "&")).concat(Object.values(SRC).map(s => s.url).filter(Boolean));
ok(hrefs.every(h => S.linkOK(h) || /^[0-9a-z-]+\.html(#[a-z-]+)?$/.test(h) || /^#/.test(h)), "links on the allow-list (" + hrefs.filter(h => !(S.linkOK(h) || /^[0-9a-z-]+\.html/.test(h) || /^#/.test(h))).join(", ") + ")");
["A3", "A4", "A12", "F9", "A6"].forEach(c => ok(new RegExp('\\["' + c + '",').test(JS), c + " is named through LX.lessonRefHTML"));
ok(/fictional/.test(D.project) && /fictional/.test(PAGE), "Prairie Town's utility is labelled fictional");

// ---------------- text budget
ok(M.STEPS.length === 6, "six step cards");
M.STEPS.forEach((t, i) => { const n = nWords(t); ok(n >= 14 && n <= 36, "step " + (i + 1) + ": " + n + " words"); ok(nSent(t) <= 2, "step " + (i + 1) + ": " + nSent(t) + " sentences"); });
const lines = [M.CHAIN_SAW, M.orderSaw(D), M.CASE_SAW, M.SORT_SAW, M.orderLine(D, D.shuffle)].concat(Object.values(M.hookFeedback(D)), Object.values(D.settlement.feedback), Object.values(D.voice.feedback), D.cards.map(c => c.why), D.rateCase.map(c => c.text), D.steps.map(s => s.text), D.chain.tracks.map(t => t.text), [D.chain.note, D.voice.static]);
lines.forEach(t => { ok(nWords(t) <= 36, "a reveal of " + nWords(t) + " words: " + plain(t).slice(0, 60)); ok(nSent(t) <= 2, "a reveal of " + nSent(t) + " sentences: " + plain(t).slice(0, 60)); });
const PROSE = OWN.replace(/^---[\s\S]*?\n---\n/, " ").replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<!--[\s\S]*?-->/g, " ");
PROSE.split(/<\/?(?:p|li|dd|dt|td|th|summary|br|caption|h3|h4)\b[^>]*>/).map(plain).filter(x => /[A-Za-z]/.test(x) && !/^[:{]/.test(x)).forEach(x => {
  const n = nWords(x); ok(n <= 42, "text element of " + n + " words: " + x.slice(0, 70)); ok(nSent(x) <= 3, "text element of " + nSent(x) + " sentences: " + x.slice(0, 70)); });

// ---------------- controls
ok(/aria-live/.test(JS) && (JS.match(/LX\.demo\(/g) || []).length === 1 && (JS.match(/demo\[\d\] = function/g) || []).length === 6, "live regions; a demo hook with an action for each of the six steps");
ok(/class: "x4-stage", "aria-pressed"/.test(JS) && /aria-label", byId\(D\.steps, id\)\.label/.test(JS) && /Undo/.test(JS), "the ordering task: buttons with a pressed state and a spoken place, and an undo");
["rate-case", "revenue-requirement"].forEach(t => ok(new RegExp("id: " + t + "\\b").test(SIDE), "the sidecar defines " + t));

console.log((fails ? "FAILED " + fails + " of " : "ok: ") + checks + " checks (" + ID + ")");
process.exit(fails ? 1 : 0);
