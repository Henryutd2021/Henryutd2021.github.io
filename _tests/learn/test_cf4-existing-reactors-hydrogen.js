// test_cf4-existing-reactors-hydrogen.js — Node tests for case file CF4 (assets/learn/cf4-existing-reactors-hydrogen.js, its
// data file and the page, learn/cf4-existing-reactors-hydrogen.qmd):
//   - the toy (the course's own: a generic existing plant, one illustrative day, prices the reader sets and one fixed
//     assumed hydrogen price) recomputed from first principles: in every hour the split between the grid, the
//     electrolyzer and the reserve is the best one among every split on a 50 MW grid (ties sell), for every setting the
//     controls allow; the day's money adds up as displayed (energy + hydrogen + reserves − the
//     electrolyzer's cost = net; net − selling all = the change; gain before cost never below zero); bounds hold
//     (0 <= h <= E, 0 <= r <= h, g >= P − E >= 0); the myths' and the worked answers' numbers; the live stage on a stub
//     document
//   - the four no-JS blocks (timeline, toy, boundary, worked answers) equal what the components write from the data
//     (--write rewrites them)
//   - research wording (the course's sourcing rule), as CF5's test: every sentence about the study on the page, in the
//     data file and in this script is an APPROVED E15 sentence of the excerpt wording, word for word, with the rows of
//     "E15 revisions after review" in place of the sentences they replace; a snapshot of that set in this test must
//     equal the approved wording (without it the page is checked against the snapshot); its status line says approved; a
//     sentence split into list items (an element with data-e15) joins back to its row word for word; each row sits where
//     the approved wording's "Where it would appear" column puts it (--places lists every placement with file:line); the replaced wordings and the
//     alternatives (E15.7n, E15.20a, E15.22d, E15.31) are not used. Live: the excerpt's footer and the boundary card's
//     source line are E15.30 with its visible label "From: " in place of the wording's "Approved excerpt of: " (CF7's and
//     CF5's form), "approved" appears nowhere a reader sees, and no
//     draft wording is left; the page is learn/<id>.qmd and nowhere else; path.yml status active; path.json lists CF4;
//     its glossary terms name CF4 (ancillary-services stays CF5's); the draft-period line ("Source: ...") is gone; A1, M11
//     and A12 name CF4 through LX.lessonRefHTML
//   - scope (the nuclear scope rule; credit exercises without nuclear; the sourcing rule; framing C): no sentence pairs a
//     nuclear term with a risk term of the scope scan's word lists (DENY_NUC, DENY_RISK), nor with a cost word (cost,
//     capital, sunk, upkeep, O&M, levelized: a stricter check); a nuclear term only in the E15 rows that the approved wording
//     writes with one, the title and the earlier-lessons line; no credit name except the 45U credit in the clauses of
//     E15.20, E15.21, E15.24 and E15.25 that state the baseline's conditions, no new-plant case, no "without policy
//     support", none of the abstract's left-out figures, no market-data or PJM wording; the toy has no credit, no
//     hydrogen-price slider, no nuclear term and no break-even, threshold or parity wording; links only to the paper's
//     DOI, the allow-listed repository and learn pages, and A1, M11 and A12 through LX.lessonRef; no numbers to remember
// Usage (from the site folder):  node _tests/learn/test_cf4-existing-reactors-hydrogen.js [--write] [--places]
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ID = "cf4-existing-reactors-hydrogen";
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const M = require(L(ID + ".js"));
const TL = require(L("components/timeline.js"));
const CORE = require(L("components/core.js"));
const X = require("./excerpt_check.js");
const PRIV = require("./private_sources.js");
const D = JSON.parse(fs.readFileSync(L("data/" + ID + ".json"), "utf8"));
const JS = fs.readFileSync(L(ID + ".js"), "utf8");
// every copy of the page under learn/, in any folder: live, the one page is learn/<id>.qmd
const COPIES = (function find(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? find(path.join(dir, e.name)) : e.name === ID + ".qmd" ? [path.join(dir, e.name)] : []); })(path.join(SITE, "learn"));
const QPATH = path.join(SITE, "learn", ID + ".qmd");
const I = D.idea;
const DOI = "https://doi.org/10.1038/s41467-026-73630-y", REPO = "https://github.com/Henryutd2021/nuclear-hydrogen-integration";
const TITLE = "Can existing reactors earn more by making hydrogen and providing grid services?";
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const JSSTR = (JS.replace(/^\s*\/\/.*$/gm, "").match(/"(?:[^"\\\n]|\\.)*"/g) || []).map(s => s.slice(1, -1)).filter(s => !/^[a-z0-9_-]+$/.test(s));   // string literals (not identifiers such as the data key), comments dropped

// ---------------- the no-JS blocks: write (--write) or check
const BLOCKS = {
  "cf4-timeline": () => TL.staticHTML(D.timeline.events),
  "cf4-idea": () => M.staticIdea(I),
  "cf4-bound": () => M.staticBoundary(D.boundary),
  "cf4-worked": () => M.staticWorked(I)
};
function between(q, name) {
  const a = q.match(new RegExp("<!-- " + name + ":start[^>]*-->\\n")), b = q.indexOf("<!-- " + name + ":end -->");
  if (!a || b < a.index) throw new Error(name + " markers missing in " + QPATH);
  return { from: a.index + a[0].length, to: b };
}
if (process.argv.includes("--write")) {
  let q = fs.readFileSync(QPATH, "utf8");
  q = q.replace(/<!-- (cf4-[a-z]+):start -->\n(?=<!-- \1:end -->)/g, "<!-- $1:start (written by the test's --write mode from the data and the model; do not edit) -->\n");
  Object.keys(BLOCKS).forEach(k => { const r = between(q, k); q = q.slice(0, r.from) + BLOCKS[k]() + "\n" + q.slice(r.to); });
  fs.writeFileSync(QPATH, q);
  console.log("no-JS blocks written: " + Object.keys(BLOCKS).join(", "));
}
const PAGE = fs.readFileSync(QPATH, "utf8");
Object.keys(BLOCKS).forEach(k => { const r = between(PAGE, k); ok(PAGE.slice(r.from, r.to) === BLOCKS[k]() + "\n", k + " block is up to date (run with --write)"); });

// ---------------- path.yml, live state, glossary
const PY = fs.readFileSync(path.join(SITE, "learn/path.yml"), "utf8"), row = PY.split(/\n- kind: /).find(e => new RegExp("\\n  id: " + ID + "\\n").test(e)) || "";
ok(row && /\n  status: active\n/.test(row), "path.yml: CF4 is active (live)");
ok(/\n  teaches: \["hydrogen at an existing plant", "reserves from an electrolyzer's headroom", "sunk costs", "price-taking", "reading a published dispatch and cash-flow study"\]\n/.test(row), "path.yml: teaches lists five items, each quoted (an apostrophe in an unquoted item would start a quote in the course build step's reader)");
ok(/\n  form: case/.test(row) && /\n  code: CF4/.test(row) && /\n  minutes: 10/.test(row) && /\n  after: \[7\]/.test(row) && row.includes('title: "' + TITLE + '"'), "path.yml: a case file of 10 minutes, code CF4, after lesson 7, the curriculum's title");
ok(PAGE.includes('title: "' + TITLE + '"'), "the page's title is the curriculum's");
{
  const pub = ["assets/learn/data/path.json", "assets/learn/data/glossary.json", "teaching.qmd"].map(f => fs.readFileSync(path.join(SITE, f), "utf8")).join("\n");
  {
    ok(COPIES.length === 1, "live: the page is learn/" + ID + ".qmd and no other copy of it is left under learn/: " + COPIES.map(p => path.relative(SITE, p)).join(", "));
    const PJ0 = JSON.parse(fs.readFileSync(path.join(SITE, "assets/learn/data/path.json"), "utf8"));
    const me = [].concat(PJ0.starter || [], PJ0.more || [], PJ0.toolbox || []).find(l => l.code === "CF4");
    ok(me && me.ready === true && me.href === ID + ".html" && me.id === ID, "live: path.json lists CF4, linked to " + ID + ".html");
  }
  const G = JSON.parse(fs.readFileSync(path.join(SITE, "assets/learn/data/glossary.json"), "utf8"));
  const side = fs.readFileSync(path.join(SITE, "learn/_w1", ID + ".yml"), "utf8"), ids = [...side.matchAll(/^  - id: ([a-z0-9-]+)$/gm)].map(m => m[1]);
  ok(ids.length === 11 && !ids.includes("ancillary-services"), "the sidecar defines CF4's eleven glossary terms (ancillary-services is CF5's): " + ids.join(", "));
  ids.forEach(g => ok(G[g] && G[g].lesson === "CF4" && G[g].href === ID + ".html", "glossary.json has " + g + ", taught in CF4"));
  ok(G["ancillary-services"] && G["ancillary-services"].lesson === "CF5", "glossary.json has ancillary-services, taught in CF5");
  ids.concat(["ancillary-services"]).forEach(g => ok(PAGE.includes('data-term="' + g + '"') || JSON.stringify(D).includes("[[" + g + "|"), "the page marks " + g));
  // the metrics the review found unexplained are marked at their use
  ["net-present-value", "internal-rate-of-return", "payback-period", "dispatch", "ramp-rate", "flexibility"].forEach(g => ok(PAGE.includes('data-term="' + g + '"') && G[g], "the page marks " + g + ""));
  const marks = [...PAGE.matchAll(/data-term="([a-z0-9-]+)"/g)].map(m => m[1]).concat([...JSON.stringify(D).matchAll(/\[\[([a-z0-9-]+)\|/g)].map(m => m[1]), [...JS.matchAll(/\[\[([a-z0-9-]+)\|/g)].map(m => m[1]));
  ok(marks.every(g => G[g]), "every glossary mark on the page, in the data and in the script is defined: " + marks.filter(g => !G[g]).join(", "));
}

// ---------------- the toy, from first principles
const P = I.plantMW, v = I.kgPerMWh * I.h2Price;
const range = o => { const a = []; for (let x = o.min; x <= o.max + 1e-9; x += o.step) a.push(Math.round(x * 1e6) / 1e6); return a; };
const SL = {}; I.sliders.forEach(o => { SL[o.key] = range(o); });
ok(I.sliders.map(o => o.key).join() === "level,reserve,elz", "three sliders: the price level, the reserve price and the electrolyzer's size; no hydrogen-price and no credit slider");
ok(typeof I.h2Price === "number" && !/h2|hydrogen|credit/i.test(I.sliders.map(o => o.key + " " + o.label).join(" ")), "the hydrogen price is one fixed number in the data");
ok(Math.max(...SL.elz) <= P, "the electrolyzer is never larger than the plant (g >= P − E >= 0)");
let bad = 0, n = 0, signs = new Set(), ties = 0;
[true, false].forEach(res => SL.level.forEach(level => SL.reserve.forEach(reserve => SL.elz.forEach(elz => {
  const s = M.at(I, { level, reserve, elz, reserves: res }), d = M.day(I, s), q = res ? reserve : 0; n++;
  let bau = 0, gross = 0, en = 0, h2 = 0, rv = 0;
  d.hours.forEach((x, t) => {
    const p = Math.round(I.prices[t] * level * 100) / 100;
    if (Math.abs(x.p - p) > 1e-9) bad++;
    // every split on a 50 MW grid: h to the electrolyzer, r of it held as reserve (reserves offered only), the rest sold
    let best = -Infinity;
    for (let h = 0; h <= elz; h += 50) for (let r = 0; r <= (res ? h : 0); r += 50) best = Math.max(best, p * (P - h) + v * h + q * r);
    const mine = p * x.g + v * x.h + q * x.r;
    if (Math.abs(mine - best) > 1e-6) bad++;
    if (Math.abs(v + q - p) < 1e-9 && elz > 0) { ties++; if (x.h !== 0) bad++; }            // a tie sells
    if (!(x.h >= 0 && x.h <= elz && x.r >= 0 && x.r <= x.h && x.g === P - x.h && x.g >= P - elz && (res || x.r === 0))) bad++;
    bau += p * P; gross += elz * Math.max(0, v + q - p) * (Math.abs(v + q - p) < 1e-9 ? 0 : 1); en += p * x.g; h2 += v * x.h; rv += q * x.r;
  });
  if (Math.round(bau) !== d.bau || Math.round(en) !== d.energy || Math.round(h2) !== d.hydrogen || Math.round(rv) !== d.reserve) bad++;
  if (Math.round(gross) !== d.gross || d.gross < 0) bad++;                                  // the closed form, never below zero
  if (d.energy + d.hydrogen + d.reserve - d.cost !== d.net || d.net - d.bau !== d.change || d.gross - d.cost !== d.change || d.cost !== I.elzCostPerMWDay * elz) bad++;
  if ([d.bau, d.energy, d.hydrogen, d.reserve, d.cost, d.net].some(x => !Number.isInteger(x))) bad++;   // whole dollars, exactly
  signs.add(Math.sign(d.change));
}))));
ok(bad === 0, `the hourly split is the best of every split on a 50 MW grid (ties sell), within its bounds, and the day's money adds up, for all ${n} settings the controls allow (${ties} tied hours)`);
ok(ties > 0, "some settings tie, and the tie rule is exercised");
ok(signs.has(1) && signs.has(-1), "within the controls' ranges the day can come out better or worse than selling all the power: the toy fixes no answer");
const D0 = M.day(I, M.at(I));
ok(D0.bau === 893000 && D0.energy === 774400 && D0.hydrogen === 200000 && D0.reserve === 32000 && D0.cost === 80000 && D0.net === 926400 && D0.gross === 113400 && D0.change === 33400 && D0.runHours === 20 && D0.kg === 100000, "defaults: $893,000 selling all; with the electrolyzer $774,400 + $200,000 + $32,000 − $80,000 = $926,400; +$33,400; 20 hours; 100,000 kg");
ok(M.changeLine(D0) === "Against selling all its power, the day comes out $33,400 better: $113,400 gained before the electrolyzer's cost, minus its $80,000." && 113400 - 80000 === 33400, "the change line's arithmetic holds as displayed");
ok(M.gridRange(D0) === "800 to 1,000 MW" && M.pct(D0.reserveShare) === "3.2%" && Math.abs(D0.reserveShare - 32000 / 1006400) < 1e-12, "defaults: output to the grid 800 to 1,000 MW; reserves 3.2% of revenue");
ok(M.money(-8360) === "−$8,360" && M.per(32.5) === "$32.50" && M.per(12) === "$12" && M.usd2(2) === "$2.00", "formats: −$8,360, $32.50 and $12 per MWh, $2.00 per kg");
{ // the hour line is true for every hour at the defaults, with no reserves, and with no electrolyzer
  let hb = 0;
  [M.at(I), M.at(I, { reserves: false }), M.at(I, { elz: 0 }), M.at(I, { reserve: 4 })].forEach(s => { const d = M.day(I, s); d.hours.forEach((x, t) => {
    const l = M.hourLine(I, d, t);
    if (!l.startsWith("At " + M.hh(t) + " the grid pays " + M.per(x.p) + " per MWh")) hb++;
    if (!s.elz) { if (!/with no electrolyzer, all 1,000 MW are sold/.test(l)) hb++; return; }
    if (!l.includes("a MWh earns " + M.per(v + (s.reserves ? s.reserve : 0)) + (s.reserves && s.reserve > 0 ? " as hydrogen and reserve" : " as hydrogen"))) hb++;
    if (x.run !== / go to the electrolyzer and /.test(l)) hb++;
    if (!x.run && !/(less than the grid pays|the same, so the toy sells)/.test(l)) hb++;
  }); });
  ok(hb === 0, "the picked hour's line is true for every hour, with and without reserves or an electrolyzer, ties included");
}
const AS = M.assumptions(I).map(X.norm).join(" ");
ok(AS.includes("the plant makes 1,000 MW of electricity in every hour, in both cases") && AS.includes("its own capital is already spent (a sunk cost)") && AS.includes("25 kg of hydrogen") && AS.includes("(40 kWh per kg)") && 1000 / I.kgPerMWh === 40 && AS.includes("an assumed $2.00 per kg, fixed: $50 per MWh") && AS.includes("$400 per MW of electrolyzer per day, paid whether it runs or not") && /Reserves, simplified: one product, paid per MW held for an hour \(per MW-hour\), never called/.test(AS) && /Left out: the steam a high-temperature electrolyzer also takes; the electrolyzer's minimum load, start-ups, ramp limits and wear; hydrogen storage and a battery/.test(AS),
  "the assumptions are written from the data: the plant's own costs cancel, the hydrogen price is fixed, the electrolyzer's cost is an annual equivalent per day, reserves are simplified, what is left out");
ok(/capital, as an annual equivalent, and its upkeep/i.test(AS), "up front against annual: the electrolyzer's daily cost is its capital as an annual equivalent plus upkeep");
ok(/Electricity only: the electrolyzer makes 25 kg of hydrogen from each MWh of the plant's electricity it takes/.test(AS) && !/steam included/.test(AS + JS), "electricity only: every MW in the toy is electrical, and the steam a high-temperature electrolyzer also takes is left out");
ok(/Two different measures: the range of output to the grid over the day, from its lowest hour to its highest, and the reserve, the MW held for the grid in one hour\./.test(AS) && /chip\("Range of output to the grid"/.test(JS), "the range of output to the grid and the reserve held are named as two different measures");
{ // the picked hour's sums show the hour that turns MW into MWh, and add up as displayed
  let sb = 0;
  [M.at(I), M.at(I, { reserves: false }), M.at(I, { elz: 0 }), M.at(I, { level: 1.4 })].forEach(st => { const d = M.day(I, st); d.hours.forEach((x, t) => {
    const l = M.sceneLines(I, d, t);
    if (l.grid !== M.mw(x.g) + " × 1 h = " + x.g.toLocaleString("en-US") + " MWh; × " + M.per(x.p) + " per MWh = " + M.money(x.g * 1 * x.p)) sb++;
    if (x.h && l.h2 !== M.mw(x.h) + " × 1 h = " + x.h + " MWh → " + (x.h * I.kgPerMWh).toLocaleString("en-US") + " kg × $2.00 per kg = " + M.money(x.h * I.kgPerMWh * I.h2Price)) sb++;
    if (x.r && l.res !== M.mw(x.r) + " × 1 h × " + M.per(d.q) + " per MW-hour = " + M.money(x.r * 1 * d.q)) sb++;
    if (!st.reserves && l.res !== "not offered") sb++;
  }); });
  ok(sb === 0 && /var sl = sceneLines\(I, d, S\.hour\)/.test(JS), "the picked hour's sums: MW × 1 h = MWh, × the price; the reserve as MW × 1 h × $ per MW-hour");
}
ok(M.LEDGER.rows[4] === "Revenue less the electrolyzer's cost" && /The plant's own fuel and upkeep, the same in both columns, are left out, so neither total is the plant's profit\./.test(M.LEDGER_NOTE) && M.LEDGER_CAPTION.split(" ").length <= 20 && PAGE.indexOf('<p class="lx-hint">' + M.LEDGER_NOTE + "</p>") >= 0 && /H\("p", \{ class: "lx-hint", text: LEDGER_NOTE \}, stage\)/.test(JS) && !/Net for the day/.test(JS + PAGE), "the ledger's total is revenue less the electrolyzer's cost, not the plant's profit");
ok(D.scale.mark === "S4" && D.scale.markText === "This case sits here.", "the scale mark is the course's label, with no description of the study");
// the toy's day in dollars: each hourly term is multiplied by the step length Δt = 1 h
ok(/\\sum_t \\left\( p_t\\,g_t \+ v\\,h_t \+ q\\,r_t \\right\) \\Delta t/.test(PAGE) && /\\max\(0,\\; v \+ q - p_t\)\\,\\Delta t - c\\,E/.test(PAGE) && /\$\\Delta t = 1\$ h, the length of each step/.test(PAGE), "the objective and the day's change carry Δt = 1 h, so $/MWh × MW × h is dollars");
// the quiz answers say their numbers are the defaults'; the no-JS reader is told what to compare; the code card's level
ok((PAGE.match(/in the toy at its defaults/g) || []).length === 2 && /class="lx-hint lx-js-hide">Without JavaScript the toy's controls do not run/.test(PAGE) && /Optional Modeler extension, about 30 minutes/.test(PAGE),
  "quiz answers at the defaults; a no-JS instruction; the open-code card says it is a Modeler extension");
// first use: the approved rows' technical terms are glossary terms
ok(["renewable-penetration", "annualized-capital-cost", "capacity-bound", "baseload", "capacity-payment"].every(t => PAGE.indexOf('data-term="' + t + '"') >= 0), "renewable penetration, annualized capital costs, capacity bound, baseload and capacity payments are marked");
// the myths: the toy's defaults
ok(PAGE.includes("and the electrolyzer's own " + M.money(D0.cost) + " a day change."), "myth 1: the electrolyzer's daily cost at the defaults ($80,000)");
ok(PAGE.includes("in the toy at its defaults, " + M.mw(D0.s.elz) + " × " + D0.heldHours + " hours × " + M.per(D0.q) + " per MW-hour = " + M.money(D0.reserve) + ".") && D0.s.elz * D0.heldHours * D0.q === D0.reserve, "myth 2: 200 MW × 20 hours × $8 per MW-hour = $32,000, as displayed");
{ // the worked answers (recomputed here): one row per setting, each from the defaults
  const W = M.worked(I), at = o => M.day(I, M.at(I, o)), Pr = I.practice;
  ok(Pr.levels.every(x => SL.level.some(y => Math.abs(x - y) < 1e-9)) && Pr.elz.every(x => SL.elz.includes(x)) && Pr.hours.every(h => h >= 0 && h < 24), "the practice's settings are on the controls");
  const lo = at({ level: 0.6 }), hi = at({ level: 1.4 }), off = at({ reserves: false }), big = at({ elz: 400 }), z = at({ elz: 0 });
  ok(W.length === 7 && W.every(r => r.length === 3) && M.WORKED_HEAD.join("|") === "Setting, from the defaults|Result, against selling all the power|Why", "worked answers: seven rows of setting, result and why");
  ok(W.every(r => r.join(" ").split(/\s+/).length <= 36), "each worked row is at most about 35 words: " + W.map(r => r.join(" ").split(/\s+/).length).join(", "));
  ok(lo.runHours === 24 && lo.change === 91240 && lo.gross - lo.cost === lo.change && lo.priceMax === 54 && lo.priceMax < lo.value &&
     W[0].join(" | ") === "Price level ×0.6 | runs in all 24 hours; $91,240 better | The dearest hour pays $54 per MWh, less than the $58 a MWh earns as hydrogen and reserve. $171,240 gained before its cost, minus its $80,000.", "practice 1 at 0.6: all 24 hours (the dearest hour $54 < $58); $171,240 − $80,000 = $91,240");
  const dear = hi.hours.filter(x => !x.run);
  ok(hi.runHours === 16 && hi.change === -8360 && hi.gross === 71640 && hi.gross - hi.cost === hi.change && dear.length === 8 && dear.every(x => x.p > x.value) &&
     W[1].join(" | ") === "Price level ×1.4 | runs in 16 of 24 hours; $8,360 worse | In 8 hours the grid pays more than $58 per MWh. $71,640 gained before its cost, minus its $80,000.", "practice 1 at 1.4: 16 hours (8 pay more than $58); $71,640 − $80,000 = −$8,360");
  ok(off.runHours === 19 && off.change === 2200 && D0.change - off.change === 31200 && !off.hours[17].run && D0.hours[17].run && off.hours[17].p === 54 && off.value === 50 &&
     W[2].join(" | ") === "Reserves off | runs in 19 hours, not 20; $2,200 better, not $33,400 | At 17:00 the grid's $54 per MWh beats $50 as hydrogen alone. Reserves were 3.2% of revenue, yet the gain falls by $31,200.", "practice 2: 19 hours (17:00 drops out: $54 > $50); $33,400 − $2,200 = $31,200");
  ok(z.change === 0 && z.gridMin === 1000 && W[3].join(" | ") === "Electrolyzer 0 MW | output to the grid 1,000 MW all day; no different | Nothing goes to hydrogen, and there is no electrolyzer to pay for.", "practice 3 at 0 MW: nothing changes");
  ok(big.gross === 2 * D0.gross && big.cost === 160000 && big.change === 66800 && big.gross - big.cost === big.change && big.runHours === D0.runHours &&
     W[4].join(" | ") === "Electrolyzer 400 MW | output to the grid 600 to 1,000 MW; $66,800 better | It runs in the same 20 hours. $226,800 gained before its cost, minus its $160,000.", "practice 3 at 400 MW: $226,800 − $160,000 = $66,800, 600 to 1,000 MW");
  ok(W[5].join(" | ") === "Pick 13:00 | 200 MW to the electrolyzer, 800 MW to the grid | The grid pays $12 per MWh, less than the $58 a MWh earns as hydrogen and reserve." &&
     W[6].join(" | ") === "Pick 19:00 | all 1,000 MW sold | The grid pays $90 per MWh, more than the $58 a MWh earns as hydrogen and reserve.", "practice 4: 13:00 and 19:00");
  const qs = (PAGE.match(/<div class="lx-card lx-case-try">\n<p class="lx-eyebrow">Try it yourself<\/p>[\s\S]*?<\/ul>/) || [""])[0];
  ok((qs.match(/<li>[^<]*\?<\/li>/g) || []).length === 4 && /Worked answers, each from the toy's defaults/.test(PAGE), "four practice questions, each with its worked rows on the page, with or without JavaScript");
  const st = I.start;
  ok(qs.includes("<p>" + M.startLine(I) + "</p>") && M.startLine(I) === "Start each one from the defaults: press Reset (price level ×1.0, reserve price $8 per MW-hour, electrolyzer 200 MW, reserves offered)." && st.level === 1 && st.reserve === 8 && st.elz === 200 && st.reserves === true,
    "each practice question starts from the defaults, which the Reset button restores; the start line is written from the data");
}
ok(/Illustrative/.test(I.note) && /not the study's inputs or results/.test(I.note) && /^Illustrative:/.test(M.assumptions(I)[0]), "the toy says it is illustrative and not the study's");
{ // the toy has no credit, no nuclear term and no break-even search (credit and nuclear scope)
  const toy = [JSON.stringify(I), BLOCKS["cf4-idea"](), BLOCKS["cf4-worked"](), JSSTR.join(" "),
    (PAGE.match(/<div class="lx-myths"[\s\S]*?<div class="lx-card lx-case-try">\n<p class="lx-eyebrow">With open code/) || [""])[0],
    (PAGE.match(/<summary><span class="k">Go deeper · Modeler<\/span>[\s\S]*?<\/details>/) || [""])[0]].join("\n");
  ok(!/credit|subsid|break[- ]?even|threshold|parity|nuclear|reactor|\bSMR\b|45[UVY]|48E/i.test(toy), "the toy, its answers, the myths, the practice and the Go deeper box name no credit, no nuclear term and no break-even, threshold or parity");
  ok(/The hydrogen price is fixed at one assumed value; every result here depends on it\./.test(JS), "the live toy says that every result depends on the fixed hydrogen price");
}
// the Go deeper box: the algebra shows every variable's bounds
ok(/\$0 \\le h_t \\le E\$/.test(PAGE) && /\$0 \\le r_t \\le h_t\$/.test(PAGE) && /\$g_t \+ h_t = P\$/.test(PAGE) && /\$g_t \\ge P - E \\ge 0\$/.test(PAGE) && /on a tie the toy sells/.test(PAGE), "Go deeper: the bounds of g, h and r, and the tie rule");

// ---------------- the live stage on a stub document
{ const { env, load } = require("./stubdom.js"), E = env(), specs = [];
  E.LX.Plot = () => { const p = { box: null, render(s) { specs.push(s); } }; return p; };
  E.LX.lessonRefHTML = CORE.lessonRefHTML; E.LX.demo = () => {}; E.LX.mount = (slug, f) => { if (slug === "cf4-idea") init = f; };
  let init = null, threw = null;
  ["controls", "ledger"].forEach(c => load(c, E));
  E.document.head = E.LX.H("head");
  vm.runInNewContext(JS, { window: E.window, document: E.document, location: E.location, navigator: {}, console, module: undefined, setTimeout: () => 0, clearTimeout: () => {} });
  const PJ = JSON.parse(fs.readFileSync(L("data/path.json"), "utf8"));
  const root = E.LX.H("div", { class: "lx-interactive", "data-learn": "cf4-idea" }, E.body), live = E.LX.H("div", { class: "lx-live" }, root);
  try { init(live, { cf4_existing_reactors_hydrogen: D, path: PJ }, root); } catch (e) { threw = e.stack || e.message; }
  const T = () => (live.textContent || "").replace(/\s+/g, " ");
  ok(!threw && T().includes(M.changeLine(D0)) && M.assumptions(I).every(t => T().includes(X.norm(t))) && T().includes(M.hourLine(I, D0, I.start.hour)) && T().includes("$926,400") && T().includes("3.2% of revenue"),
    "live: the stage shows the change line, the picked hour, the ledger, the readouts and the assumptions" + (threw ? ": " + threw : ""));
  const last = () => specs.slice(-2);
  if (!threw) {
    const [pp, po] = last();
    ok(pp.lines[0].pts.length === 24 && pp.lines[0].pts.every((x, t) => x[1] === D0.hours[t].p) && pp.refs[0].y === D0.value && pp.legend[1].label === "A MWh as hydrogen and reserve: $58" && pp.legend[1].dash, "live: the price chart draws the day's 24 prices and what a MWh earns as hydrogen and reserve ($58)");
    ok(po.bars.filter(b => b.y0 === 0).every((b, t) => b.y1 === D0.hours[t].g) && po.text.rows.length === 24 && JSON.stringify(po.text.rows) === JSON.stringify(M.hourRows(D0)), "live: the output chart and its text version match the model hour by hour");
    const off = live.querySelectorAll(".lx-seg button")[1]; off.click();
    const d2 = M.day(I, M.at(I, { reserves: false }));
    ok(off.getAttribute("aria-pressed") === "true" && T().includes(M.changeLine(d2)) && T().includes("Reserves off") === false && T().includes("not offered"), "live: 'No reserves' repaints the day ($2,200 better) and the scene says reserves are not offered");
    const rs = [...live.querySelectorAll("button")].find(b => b.textContent === "Reset to the defaults");
    ok(!!rs, "live: a Reset to the defaults button");
    if (rs) { rs.click(); ok(live.querySelectorAll(".lx-seg button")[0].getAttribute("aria-pressed") === "true" && T().includes(M.changeLine(D0)) && T().includes(M.sceneLines(I, D0, I.start.hour).grid), "live: Reset restores the defaults ($33,400 better; 13:00 picked)"); }
  }
  ok(/\[\["A1", [^\]]+\], \["M11", [^\]]+\],\s*\["A12", [^\]]+\]\]\.forEach\(function \(n\) \{ H\("li", \{ html: LX\.lessonRefHTML\(P, n\[0\]\) \+ n\[1\] \}, nx\); \}\)/.test(JS) && /data-learn="cf4-idea" data-src="[^"]*data\/path\.json/.test(PAGE), "A1, M11 and A12 are linked with LX.lessonRef (path.json loaded by the toy)");
  ["A1", "M11", "A12"].forEach(c => ok(CORE.lessonRef(PJ, c).ready, c + " is live, so its link shows"));
  // the other way: A1 (step 1), M11 (step 9) and A12 (the last step) name CF4 through LX.lessonRefHTML, with path.json
  // loaded, in the course's own words (CF4's short name and its outcome; no nuclear term, as their own tests require)
  [["a01-project-tea", "step 1", "Year 0 counts here because the farm is not built yet. Case file \" + LX.lessonRefHTML(PJ, \"CF4\") + \" (hydrogen at existing plants) shows the other case: a plant's own capital, already spent, drops out."],
   ["m11-tea-in-models", "step 9", "Case file \" + LX.lessonRefHTML(PJ, \"CF4\") + \" (hydrogen at existing plants): what an hourly dispatch model and a lifetime cash flow each add, when the plant's own capital is already spent."],
   ["a12-policy-instruments", "the last step", "Case file \" + LX.lessonRefHTML(PJ, \"CF4\") + \" (hydrogen at existing plants) practices reading which assumptions, a policy among them, a published result rests on."]].forEach(([id, where, line]) => {
    const js = fs.readFileSync(L(id + ".js"), "utf8"), qmd = fs.readFileSync(path.join(SITE, "learn", id + ".qmd"), "utf8");
    ok(js.includes(line) && /data-src="[^"]*\.\.\/assets\/learn\/data\/path\.json"/.test((qmd.match(/<div class="lx-interactive[^>]*data-src="[^"]*"/) || [""])[0]) && !/nuclear|reactor/i.test(line), id + " names CF4 through LX.lessonRefHTML in " + where + ", with path.json loaded");
  });
}

// ---------------- research wording against the approved wording (E15)
// The approved set (status line of 2026-11-07): E15.1-E15.30 word for word, with the rows of "E15 revisions after review"
// in place of the sentences they replace (E15.14, E15.16, E15.22, E15.29). As CF5's test: the snapshot below must equal
// the approved wording; without it the page is checked against the snapshot.
const APPROVED_SNAPSHOT = {
  "E15.1": "Nuclear power supplies reliable low-carbon electricity and high-temperature heat, but existing plants face growing pressure to operate more flexibly in markets with rising renewable penetration.",
  "E15.2": "A nuclear plant can do more than sell electricity around the clock. With high-temperature electrolysis, part of its electricity and steam can make hydrogen; with hydrogen storage and a battery, it can shift its output and offer ancillary services to the grid.",
  "E15.3": "Coupling nuclear reactors with hydrogen production through high-temperature electrolysis may improve flexibility and create additional value, yet its economic potential remains uncertain.",
  "E15.4": "Can existing U.S. nuclear power plants improve their economics and operating flexibility by adding high-temperature electrolysis, hydrogen storage and batteries, and by selling energy, hydrogen and ancillary services?",
  "E15.5": "Inside: 42 operating U.S. reactors in seven ISO/RTO markets, each facing its own hourly energy and ancillary-service prices for 2024 (8,760 hours; February 29 is left out); a high-temperature electrolyzer, hydrogen storage and a battery added to each plant; one year of hourly operation turned into a lifetime cash flow.",
  "E15.6": "Assumed throughout: a hydrogen production credit of $3/kg for ten years, counted in hydrogen revenue.",
  "E15.7": "Left out: price feedback from large-scale adoption, because every plant takes 2024 prices as given; re-optimized operation after the hydrogen credit expires, because the dispatch is held fixed.",
  "E15.8": "Decisions: in every hour, how much of the plant's electricity and steam goes to the electrolyzer; when the electrolyzer runs and at what load; what goes into and out of hydrogen storage and the battery; grid sales and purchases; and the bids of the turbine, electrolyzer and battery in the market's ancillary services.",
  "E15.9": "Goal: the largest yearly profit (energy, hydrogen and ancillary-service revenue minus operating and annualized capital costs), with the hydrogen production credit counted in hydrogen revenue.",
  "E15.10": "Rules: turbine and electrolyzer efficiency follow piecewise-linear curves; the electrolyzer keeps minimum up and down times, ramp limits and a minimum stable load, pays a start-up cost and degrades with operation and start-ups; ancillary-service bids must fit within each unit's headroom and ramp limits.",
  "E15.11": "Seven U.S. markets price energy and ancillary services differently, and each of 42 reactors faces its own prices.",
  "E15.12": "The study links an hourly mixed-integer optimization of turbine, electrolyzer and storage dispatch, for 42 reactors in seven U.S. ISO/RTO markets using 2024 prices, to a lifetime cash-flow model.",
  "E15.13": "The hourly dispatch model co-optimizes electricity sales, hydrogen production, storage and ancillary services under each market's products, and is run for every reactor.",
  "E15.14": "Electrolyzers and turbines are not ideal: efficiency varies with load, starts wear equipment, and ramping is limited. The model represents these limits, so flexibility estimates respect them.",
  "E15.15": "Each plant is run two ways: business-as-usual operation without any modification for hydrogen production, and a retrofit with high-temperature electrolysis, hydrogen storage and a battery.",
  "E15.16": "The study treats an existing plant's capital as already spent (a sunk cost); the retrofit's cash flow adds the capital cost of the new hydrogen and battery equipment.",
  "E15.17": "A discounted cash-flow analysis turns the optimized year into net present value, internal rate of return, payback and levelized costs, with component-level capital costs and scheduled replacements.",
  "E15.18": "Electricity and hydrogen prices are taken as given (price-taking): the study evaluates plant operation against observed 2024 prices, and price feedback from wide adoption is stated as a limit and left to future work.",
  "E15.19": "Sensitivity runs on a representative reactor vary the electrolyzer's capacity bound and the level of electricity prices.",
  "E15.20": "Operated as electricity-only baseload plants at 2024 market prices, without capacity payments or the 45U credit, nearly all of the plants studied had negative net present value.",
  "E15.21": "With hydrogen integration and the assumed hydrogen production credit ($3/kg for ten years), a majority of the plants studied reached positive net present value, even without the 45U credit.",
  "E15.22": "With the assumed hydrogen credit, integrated operation added output flexibility: flexible output (the range of a plant's hourly output to the grid) expanded by more than 115 MW for most of the plants studied.",
  "E15.23": "Ancillary-service revenue was a few percent of total revenue, which includes the hydrogen credit.",
  "E15.24": "Holds when: 2024 prices, taken as given; modeled ancillary-service participation parameters; the assumed hydrogen credit ($3/kg for ten years), with the dispatch held fixed after the credit expires; an existing plant's capital treated as already spent; no capacity payments and no 45U credit in the baseload case. Leaves out: capacity-market revenues; price feedback from large-scale adoption.",
  "E15.25": "Where the result holds: 42 existing plants in seven U.S. ISO/RTO markets, each at its own 2024 hourly prices, taken as given; one year of hourly operation (8,760 hours) turned into a lifetime cash flow; the existing plant's capital treated as already spent, so the capital counted is that of the new hydrogen and battery equipment; the assumed hydrogen production credit ($3/kg for ten years) in the retrofit results shown here, with the dispatch held fixed after it expires; no capacity payments and no 45U credit in the baseload case; modeled ancillary-service participation parameters. It leaves out: capacity-market revenues; price feedback from large-scale adoption; re-optimized operation after the credit expires.",
  "E15.26": "Hourly operation of 42 existing reactors with high-temperature electrolysis, hydrogen storage and batteries, in seven U.S. ISO/RTO markets at 2024 prices, is linked to a lifetime cash-flow model; published online on 2 June 2026.",
  "E15.27": "A documented, runnable implementation of the modelling framework, with synthetic examples (version 1.0.0).",
  "E15.28": "Try it yourself: the framework's minimal example compares business as usual with the integrated system over two synthetic weeks, solved with HiGHS. Generate synthetic inputs, then run the hourly operation again with energy prices 15% higher, or with ancillary services in dispatch mode, and compare the revenues and the flexibility. Its numbers say nothing about any real plant, market, policy or year.",
  "E15.29": "Li et al. (2026). Rethinking the economics and flexibility of U.S. nuclear power through hydrogen integration and policy support. Nature Communications 17, 7090. nuclear-hydrogen-integration on GitHub, version 1.1.0 (7 November 2026).",
  "E15.30": "Approved excerpt of: Li et al. (2026), Nature Communications."
};
const REPLACED = {};   // the approved wordings that a revision replaced: never on the page
const RX = /\b(stud(y|y's|ies)|paper|article|Li et al|excerpt|reactors?|nuclear|ISO\/RTO|credits?|framework|Nature Communications|retrofit|baseload|net present value|ancillary)\b/i;
const REG = X.register(["E15"]);
let EFF = APPROVED_SNAPSHOT, WHERE = {}, e15 = "";
if (REG) {
  const md = REG.md, w6 = PRIV.section(md, "### E15.");
  const st = w6.match(/\*\*Status \(2026-11-07\): ([^*]+)\*\*([^\n]*)/) || [];
  ok(st[1] === "approved as recommended" && /Approved: E15\.1–E15\.30 word for word under framing C/.test(st[2] || ""), "the approved wording's status line says E15 is approved (2026-11-07): E15.1-E15.30 word for word under framing C");
  // rows marked "[N]" or "(optional)" are E15 rows too: the shared parser reads only "| E15.n |", so they are read here
  e15 = PRIV.block(w6, "### E15.");
  const reg = {};
  e15.split("\n").forEach(line => { const m = line.match(/^\| (E15\.\d+)(?: \[N\]| \(optional\))? \| (.*?) \| (.*?) \| /); if (m) { reg[m[1]] = m[2].replace(/^(Timeline, [^:]+|Citations|Source): /, ""); WHERE[m[1]] = m[3]; } });
  ok(Object.keys(reg).length === 30 && Array.from({ length: 30 }, (x, i) => "E15." + (i + 1)).every(k => reg[k]), "the approved wording's 30 E15 rows are read (the [N] and optional rows included)");
  // the revisions after review: each "Was" is the approved row, word for word; "Now" takes its place
  const rv = w6.indexOf("### E15 revisions after review (2026-11-07)"), REV = {};
  // accepted by the same person whose approval the section's status line records ("(<name>: ...")
  const approver = ((st[2] || "").match(/^ \(([^:()*]+):/) || [])[1];
  ok(rv > 0 && !!approver && w6.slice(rv).split("\n").some(l => l.startsWith("**Status (2026-11-07): accepted by " + approver + "**")),
    "the approved wording has the E15 revisions after review (2026-11-07), accepted by the approver of the section");
  if (rv > 0) w6.slice(rv).split("\n").forEach(line => { const m = line.match(/^\| (E15\.\d+) \| (.*?) \| (.*?) \| /); if (m) REV[m[1]] = { was: m[2].replace(/^(Timeline, [^:]+|Citations|Source): /, ""), now: m[3].replace(/^(Timeline, [^:]+|Citations|Source): /, "") }; });
  Object.keys(REV).forEach(k => { ok(REV[k].was === reg[k], k + ": the revision's 'Was' is the approved row"); REPLACED[k] = reg[k]; reg[k] = REV[k].now; });
  ok(Object.keys(reg).length === Object.keys(APPROVED_SNAPSHOT).length && Object.keys(reg).every(k => reg[k] === APPROVED_SNAPSHOT[k]),
    "the approved-sentence snapshot in this test equals the approved wording (revisions applied); differs at: " + Object.keys(Object.assign({}, reg, APPROVED_SNAPSHOT)).filter(k => reg[k] !== APPROVED_SNAPSHOT[k]).join(", "));
  EFF = reg;
} else console.log("note: the approved excerpt wording is not available (set LEARN_SOURCES); E15 wording checked against the snapshot in this test");
const RG = { units: Object.values(EFF).map(X.norm), raw: EFF };
{
  const KEYS = Array.from({ length: 30 }, (x, i) => "E15." + (i + 1));
  // E15.30, "Approved excerpt of: ..." in the approved wording; the page shows it with the label "From: " (FOOT); the draft
  // period's "Source: ..." line must be gone
  const F30 = RG.raw["E15.30"], F30draft = F30.replace(/^Approved excerpt of: /, "Source: "), FOOT = F30.replace(/^Approved excerpt of: /, "From: ");
  ok(/^Approved excerpt of: Li et al\. \(2026\), Nature Communications\.$/.test(F30), "E15.30 is the footer form of CF3, CF5 and CF7 (in the approved wording)");
  const VIS0 = X.elements(PAGE.replace(/<!--[\s\S]*?-->/g, "")).map(X.norm).join(" ");
  ok(Object.keys(REPLACED).every(k => X.sentencesOf(REPLACED[k]).filter(x => !X.sentencesOf(RG.raw[k]).includes(x)).every(x => !VIS0.includes(x) && !JSON.stringify(D).includes(x))), "the wordings the revisions replaced are not on the page or in the data: " + Object.keys(REPLACED).join(", "));
  const OWN = PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?learn:\1:end -->/g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/^---[\s\S]*?\n---\n/, "");
  const caseHTML = (OWN.match(/<div class="lx-case">([\s\S]*?)<div class="lx-interactive" data-learn="cf4"/) || [])[1] || "";
  const parts = caseHTML.split(/<div class="lx-case-part[^"]*">/).slice(1);
  ok(parts.length === 6, "the case has six parts");
  // a sentence split into list items: "<dt>Label</dt><dd data-e15="E15.n">pieces</dd>" (or a div without a label) joins back
  const SPLIT = /(?:<dt>([^<]+)<\/dt>)?<(dd|div) data-e15="(E15\.\d+)">([\s\S]*?)<\/\2>/g, joined = {};
  [...caseHTML.matchAll(SPLIT)].forEach(m => { (joined[m[3]] = joined[m[3]] || []).push((m[1] ? m[1] + ": " : "") + X.elements(m[4]).join(" ")); });
  ok(Object.keys(joined).join() === "E15.2,E15.5,E15.6,E15.7,E15.8,E15.9,E15.10,E15.24", "the structured rows: E15.2 in part 1, E15.5–E15.7 in part 3, E15.8–E15.10 in part 4, E15.24 under the excerpt");
  Object.keys(joined).forEach(k => ok(X.norm(joined[k].join(" ")) === X.norm(RG.raw[k]), k + " split into list items keeps every word in order"));
  // every text element of the case is E15 wording or one of these labels
  const LABELS = [/^\d · (The puzzle|The question in one sentence|Scale and boundary|Decisions, goal and rules, in words|Data and method|What came out, and where it holds)$/,
    /^So can an existing plant earn more by making hydrogen as well as power\?$/, /^Question type: prescriptive \(what should be added, and how should it run\?\)\.$/,
    /^Detail(What the equipment can do, and the two cases|From one year to a lifetime|Sensitivity runs)$/, /^(The pressure|The option|The open question)$/];
  const segs = X.elements(caseHTML.replace(SPLIT, "")).map(X.norm).filter(Boolean);
  segs.forEach(sg => ok(LABELS.some(re => re.test(sg)) || X.approved(RG, sg) || sg === X.norm(FOOT), "case text is approved E15 wording, E15.30 as shown, or a label: " + sg.slice(0, 70)));
  // each row where the approved wording puts it
  const inPart = (k, i) => X.norm(parts[i - 1].replace(SPLIT, (m0, dt, tag, key) => key === k ? "<p>" + X.norm(joined[k].join(" ")) + "</p>" : m0)).includes(X.norm(RG.raw[k]))
    || X.elements(parts[i - 1]).map(X.norm).join(" ").includes(X.norm(RG.raw[k]));
  const PART = { 1: ["E15.1", "E15.2", "E15.3"], 2: ["E15.4"], 3: ["E15.5", "E15.6", "E15.7"], 4: ["E15.8", "E15.9", "E15.10"], 5: ["E15.11", "E15.12", "E15.13", "E15.14", "E15.15", "E15.16", "E15.17", "E15.18", "E15.19"], 6: ["E15.20", "E15.21", "E15.22", "E15.23", "E15.24"] };
  Object.keys(PART).forEach(i => PART[i].forEach(k => ok(new RegExp("^part " + i + "\\b").test(WHERE[k]) || (i === "1" && /^CF4 part 1/.test(WHERE[k])), k + ": the approved wording puts it in part " + i + " (" + WHERE[k] + ")")));
  Object.keys(PART).forEach(i => PART[i].filter(k => !joined[k]).forEach(k => ok(inPart(k, +i), k + " is in part " + i)));
  { const p1 = X.elements(parts[0]).map(X.norm), p5 = X.elements(parts[4]).map(X.norm).filter(s => !/^Detail/.test(s) && !/^5 · /.test(s));
    ok(p1.slice(1, 3).join("|") === "The pressure|" + X.norm(RG.raw["E15.1"]) && p1[p1.length - 3] === "The open question" && p1[p1.length - 2] === X.norm(RG.raw["E15.3"]) && X.norm(parts[0]).indexOf("The option") < X.norm(parts[0]).indexOf("A nuclear plant can do more") && X.norm(parts[0]).indexOf("A nuclear plant can do more") < X.norm(parts[0]).indexOf("Coupling nuclear reactors"), "part 1 in three labelled groups: E15.1 first, E15.2 after it, E15.3 last (before the plain question)");
    ok((parts[0].match(/<div class="cf4-g">/g) || []).length === 3 && /<dl class="cf4-dgr"><div><dt>Decisions<\/dt>[\s\S]*<\/dd><\/div><div><dt>Goal<\/dt>[\s\S]*<\/dd><\/div><div><dt>Rules<\/dt>[\s\S]*<\/dd><\/div><\/dl>/.test(parts[3]), "parts 1 and 4: separate visual groups (the puzzle's three; decisions, goal and rules)");
    ok(p5[0] === X.norm(RG.raw["E15.11"]) && p5[p5.length - 1] === X.norm(RG.raw["E15.19"]), "part 5: E15.11 is the first line and E15.19 the last");
    ok(p5.join(" ") === ["E15.11", "E15.12", "E15.13", "E15.14", "E15.15", "E15.16", "E15.17", "E15.18", "E15.19"].map(k => X.norm(RG.raw[k])).join(" "), "part 5: E15.11–E15.19 in the approved wording's order (E15.14 as its two sentences)"); }
  // part 6: E15.20–E15.23 the only excerpt, in order; its footer E15.30
  const q = [...PAGE.matchAll(/<blockquote class="lx-excerpt" data-source="([^"]+)">([\s\S]*?)<footer>([\s\S]*?)<\/footer><\/blockquote>/g)];
  ok(q.length === 1 && q[0][1] === "excerpt:npph2-existing" && X.elements(q[0][2]).map(X.norm).join("|") === ["E15.20", "E15.21", "E15.22", "E15.23"].map(k => X.norm(RG.raw[k])).join("|"), "part 6: E15.20–E15.23 are the only excerpt, one paragraph each, from excerpt:npph2-existing");
  ok(q.length === 1 && X.norm(q[0][3]) === X.norm(FOOT) && q[0][3].includes('<a href="' + DOI + '">'), "part 6: the footer is E15.30, with the DOI");
  ok(/^part 6, the note under the excerpt/.test(WHERE["E15.24"]) && PAGE.indexOf('data-e15="E15.24"') > PAGE.indexOf("</blockquote>"), "part 6: E15.24 is the note under the excerpt");
  // the timeline (E15.26, E15.27) and its dates
  const tlRaw = k => (e15.match(new RegExp("^\\| " + k.replace(".", "\\.") + " \\| Timeline, ([^:]+): ", "m")) || [])[1];
  const E = D.timeline.events, fmtD = d => TL.fmt(TL.parse(d));
  ok(E.length === 2 && X.approved(RG, E[0].text) && X.norm(E[0].text) === X.norm(RG.raw["E15.26"]) && X.norm(E[1].text) === X.norm(RG.raw["E15.27"]), "the timeline's texts are E15.26 and E15.27, word for word");
  ok(fmtD(E[0].date) === tlRaw("E15.26") && fmtD(E[1].date) === tlRaw("E15.27"), "the timeline's dates are the approved wording's: " + fmtD(E[0].date) + ", " + fmtD(E[1].date));
  ok(E[0].source.url === DOI && E[1].source.url === REPO && TL.validate(E).length === 0, "the timeline cites the DOI and the repository");
  ok(/^The study in time$/.test(WHERE["E15.26"]) && /^The study in time$/.test(WHERE["E15.27"]), "the approved wording puts E15.26 and E15.27 in the study in time");
  // the boundary card (E15.25), whole, in order; its source line E15.30's footer form
  [].concat(D.boundary.holds, D.boundary.leaves).forEach(t => ok(X.approved(RG, t), "boundary item is a clause of E15.25: " + t.slice(0, 50)));
  ok(X.norm("Where the result holds: " + D.boundary.holds.join(" ").replace(/\.$/, ".") + " It leaves out: " + D.boundary.leaves.join(" ")) === X.norm(RG.raw["E15.25"]), "the boundary card is E15.25, whole, in order");
  ok(D.boundary.title === "Where the result holds" && X.norm(D.boundary.source) === X.norm(FOOT) && /^Explain, the boundary card$/.test(WHERE["E15.25"]), "the boundary card: its title, and E15.30 as its source line");
  // part 7: E15.28 in the open-code card, sentence by sentence; the repository linked; only the minimal example and run
  const oc = (PAGE.match(/<p class="lx-eyebrow">With open code<\/p>([\s\S]*?)<\/div>/) || [])[1] || "";
  const ocP = X.elements(oc).map(X.norm);
  ok(/^CF4 part 7$/.test(WHERE["E15.28"]) && X.sentencesOf(RG.raw["E15.28"]).every(s => ocP.includes(X.norm(s))) && ocP.indexOf(X.norm(X.sentencesOf(RG.raw["E15.28"])[0])) < ocP.indexOf(X.norm(X.sentencesOf(RG.raw["E15.28"])[2])), "part 7: E15.28, its three sentences in order, in the open-code card");
  const cmds = [...((oc.match(/<ul class="cf4-cmds">[\s\S]*?<\/ul>/) || [""])[0]).matchAll(/<code>([^<]+)<\/code>/g)].map(m => m[1]);
  ok(cmds.length === 5 && cmds[0] === "python examples/minimal.py" && cmds.slice(1).every(c => /^nuclear-h2 (synthetic|run) /.test(c)) && cmds.some(c => /--price-factor 1\.15/.test(c)) && cmds.some(c => /--as-mode dispatch/.test(c)) && cmds.filter(c => /^nuclear-h2 run /.test(c)).every(c => /--out-dir /.test(c)), "part 7: only the minimal example, synthetic inputs and run (energy prices 15% higher, or ancillary services in dispatch mode)");
  ok(!/lifecycle_tea|sensitivity\.py|case_matrix|nuclear-h2 tea|tea_sweep|--reoptimize|--scale-as/.test(PAGE + JS), "part 7: no lifecycle, sensitivity, tea or case-matrix tool, no credit option");
  ok(oc.includes('<a href="' + REPO + '">nuclear-hydrogen-integration</a>: open code · MIT license.'), "part 7: the repository is linked as open code, with its licence, and nothing said about data in it");
  // the open-code card: every line is E15.28, a command, or one of the course's lines about what the open code writes
  { const oc = (PAGE.match(/<p class="lx-eyebrow">With open code<\/p>([\s\S]*?)<\/div>/) || [])[1] || "";
  const OC = [/^Optional Modeler extension, about 30 minutes; needs Python 3\.10 or later on your computer \(lesson B2\)\.$/, /^Set it up first: clone the repository and install it as its README's Quick start says; run the commands in the repository's folder\.$/,
    /^Each run writes revenue_musd_per_yr\.csv and summary\.json into its --out-dir folder\.$/, /^Compare the revenue tables, and grid_output_range_mw under "flexibility" in summary\.json: the range of output to the grid, the toy's measure too\.$/,
    /^(python examples\/minimal\.py|nuclear-h2 (synthetic|run) .*)$/, /^nuclear-hydrogen-integration: open code · MIT license\.$/];
  const E28 = X.sentencesOf(RG.raw["E15.28"]).map(X.norm);
  const lines = X.elements(oc).map(X.norm).flatMap(s => X.sentencesOf(s)).map(X.norm).filter(Boolean);
  ok(lines.length > 6 && lines.every(s => E28.includes(s) || OC.some(re => re.test(s))), "the open-code card: E15.28, the commands, and what the open code writes, nothing else: " + lines.filter(s => !E28.includes(s) && !OC.some(re => re.test(s))).join(" | ")); }
  // the citation (E15.29), split into its two sentences; the title as in the author's publication list
  const src = (OWN.match(/<div class="lx-card lx-sources">([\s\S]*?)<\/div>/) || [])[1] || "", li = X.elements(src).map(X.norm);
  ok(X.norm(li[1] + " " + li[2]) === X.norm(RG.raw["E15.29"]) && src.includes('<a href="' + DOI + '">') && src.includes('<a href="' + REPO + '">'), "sources: E15.29, word for word, with the DOI and the repository linked");
  const bib = PRIV.read("publications");
  if (bib) ok(bib.includes("title   = {Rethinking the economics and flexibility of {U.S.} nuclear power through hydrogen integration and policy support}") && li[1].includes("Rethinking the economics and flexibility of U.S. nuclear power through hydrogen integration and policy support."), "the paper's title as in the publication list");
  else console.log("note: the publication list is not available (set LEARN_SOURCES); the cited title was not compared with it");
  // the description is E15.4
  const desc = (PAGE.match(/^description: "Case file CF4 of Energy Systems, Step by Step\. ([^"]+)"/m) || [])[1] || "";
  ok(desc && X.norm(desc) === X.norm(RG.raw["E15.4"]), "the description's sentence is E15.4");
  // every other element that names the study or its method is E15 wording, or one of the course's own lines
  const OWNLINES = [/^The toy below is the course's own, with illustrative numbers, some of them yours; it holds none of the study's inputs or results\.$/,
    /^Illustrative round numbers, some of them yours: a generic existing plant, not the study's inputs or results\./, /^The study in time$/, /^Two dated steps: the journal article and its open code\.$/,
    /^Earlier lessons: lesson 3 \(reserves\), lesson 7 \(what a cost counts\) and A16 \(hydrogen from electricity\)\. F5 shows how a reactor makes heat and electricity\.$/,
    /^Where this goes next: A1 \(a project's cash flows\), M11 \(techno-economic analysis inside a model\), A12 \(the tools governments use\)\.$/,
    /^nuclear-hydrogen-integration: open code · MIT license\.$/, /^Optional Modeler extension, about 30 minutes; needs Python 3\.10 or later on your computer \(lesson B2\)\.$/,
    /^(python examples\/minimal\.py|nuclear-h2 (synthetic|run) [^ ]+.*)$/, /^Where the result holds$/,
    /^Go deeper · ModelerThe toy's day as a small optimization$/, /^Run a toy plant's day yourself, then where the result holds$/,
    /^turns a year of cash flows into a project's net present value\.$/];
  const rest = PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?learn:\1:end -->/g, "").replace(/<!-- cf4-(timeline|bound):start[\s\S]*?cf4-\1:end -->/g, "")
    .replace(/<!--[\s\S]*?-->/g, "").replace(/^---[\s\S]*?\n---\n/, "").replace(/<div class="lx-case">[\s\S]*?<div class="lx-interactive" data-learn="cf4"[^>]*>/, "")
    .replace(/<blockquote[\s\S]*?<\/blockquote>/g, "").replace(/<div class="lx-card lx-sources">[\s\S]*?<li>Earlier/, "<li>Earlier");
  const restSegs = X.elements(rest).map(X.norm).concat([D.timeline.title, D.timeline.lede, I.title, I.note, D.boundary.title], JSSTR.map(X.norm)).filter(s => RX.test(s));
  restSegs.forEach(sg => ok(X.approved(RG, sg) || OWNLINES.some(re => re.test(sg)) || (/toy|electrolyzer|reserve|plant|hydrogen|grid/i.test(sg) && !/\b(stud(y|ies)|paper|article|Li et al|reactors?|nuclear|ISO\/RTO|credits?|framework|Nature Communications|retrofit|baseload|net present value)\b/i.test(sg)), "outside the case: E15 wording or the course's own: " + sg.slice(0, 80)));
  // "approved" is said nowhere a reader sees; E15.30 in its shown form is the footer, the boundary card's source line and
  // its no-JS text; the draft-period line is gone and no draft wording is left (page, data, script strings)
  const dstr = o => typeof o === "string" ? [o] : o && typeof o === "object" ? Object.values(o).flatMap(dstr) : [];
  const VIS = X.elements(OWN).concat(dstr(Object.assign({}, D, { about: "", built: "" })), JSSTR);
  const said = VIS.filter(s => /approv/i.test(s));
  {
    ok(said.length === 0, "live: 'approved' is not said where a reader sees it (" + said.length + "): " + said.join(" | ").slice(0, 160));
    ok(VIS.filter(s => X.norm(s) === X.norm(FOOT)).length === 3, "live: E15.30 as shown ('From: ...') is the footer, the boundary card's source line and its no-JS text");
    ok(!VIS.some(s => X.norm(s) === X.norm(F30draft)) && !/<footer>Source:/.test(PAGE) && D.boundary.source === FOOT, "live: the draft-period line '" + F30draft + "' is gone (footer, boundary card, no-JS text)");
    ok(!VIS.some(s => /\bdrafts?\b|\bdrafted\b|waiting for Henry|\bon hold\b/i.test(s)) && !/\bdraft|\bhold\b|\bheld\b/i.test(D.about + PAGE.match(/<!-- Case file CF4[\s\S]*?-->/)[0]), "live: no draft or hold wording on the page, in the data, in the script's strings or in the page's header comment");
    const f7 = (fs.readFileSync(path.join(SITE, "learn/cf7-cost-of-waiting.qmd"), "utf8").match(/<footer>(From: [^<]*)<\/footer>/) || [])[1] || "";
    ok(/^From: Li et al\. \(2026\), /.test(f7) && q[0] && /^From: Li et al\. \(2026\), <a href="[^"]+">Nature Communications<\/a>\.$/.test(q[0][3]), "live: the footer has CF7's form, 'From: Li et al. (2026), <venue>.' (CF7: " + f7 + ")");
  }
  // the alternatives and the left-out sentences are not used
  ok(!/nearly all reactors studied|for most reactors\.|new-plant cases|market design, not only the reactor|without policy support|about \$240 million|240 million|1\.06 billion|61\.9|\$510 million|\$12\.3 million/i.test(PAGE + JSON.stringify(D) + JS), "the alternatives (E15.7n, E15.20a, E15.22d, E15.31) and the abstract's left-out figures are not used");
  // the placements (--places prints them with file:line)
  const lines = PAGE.split("\n"), rel = path.relative(SITE, QPATH), where = [];
  // the first line after the generated header that holds the sentence (raw: the exact markup instead of the normalized text)
  const body0 = lines.findIndex(l => /^<!-- learn:meta:end -->/.test(l)) + 1;   // after the front matter and the generated header
  const find = (k, s, raw) => { const t = X.norm(s).slice(0, 50); let i = lines.findIndex((l, j) => j >= body0 && (raw ? l.includes(s) : X.norm(l).includes(t)));
    if (i < 0) i = lines.findIndex(l => l.includes('data-e15="' + k + '"')); return i >= 0 ? rel + ":" + (i + 1) : null; };
  KEYS.forEach(k => {
    let at = find(k, joined[k] ? joined[k][0].replace(/^[^:]+: /, "") : RG.raw[k]);
    if (k === "E15.25") at = "assets/learn/data/" + ID + ".json (boundary) and " + (find(k, D.boundary.holds[0]) || rel) + " (no-JS block)";
    if (k === "E15.26" || k === "E15.27") at = "assets/learn/data/" + ID + ".json (timeline) and " + (find(k, RG.raw[k]) || rel) + " (no-JS block)";
    if (k === "E15.29") at = find(k, "<li>Li et al. (2026). <a", true);
    const pre = "From:";   // E15.30's visible label
    if (k === "E15.30") at = find(k, "<footer>" + pre + " Li et al. (2026)", true) + ", and the boundary card's source line: assets/learn/data/" + ID + ".json and " + (find(k, '</dl><p class="lx-hint">' + pre + ' Li et al. (2026), Nature Communications.', true) || rel) + " (no-JS block)";
    if (k === "E15.4" && at) at += " and the front matter's description (" + rel + ":" + (lines.findIndex(l => /^description:/.test(l)) + 1) + ")";
    if (k === "E15.28") at = X.sentencesOf(RG.raw[k]).map(s => find(k, s)).join(", ");
    where.push([k, at]); ok(at && !/null/.test(at), "placed: " + k);
  });
  if (process.argv.includes("--places")) where.forEach(w => console.log(w[0].padEnd(7), w[1]));
}

// ---------------- scope (framing C)
const RP = PRIV.path("scope_terms");
let NUC = /nuclear|reactor|\bSMR\b|small modular/i, RISK = null, BENIGN = /merit[- ]order|orders? of magnitude|in order to/gi;
if (RP) {
  const py = fs.readFileSync(RP, "utf8");
  NUC = new RegExp(py.match(/DENY_NUC = r"([^"]+)"/)[1], "i");
  RISK = new RegExp((py.match(/DENY_RISK = \(([\s\S]*?)\)\n/)[1].match(/r"([^"]*)"/g) || []).map(s => s.slice(2, -1)).join(""), "i");
}
ok(RISK, "the scope scan's DENY_RISK read from its word lists");
const SIDE = fs.readFileSync(path.join(SITE, "learn/_w1", ID + ".yml"), "utf8");
const strings = o => typeof o === "string" ? [o] : Array.isArray(o) ? o.flatMap(strings) : o && typeof o === "object" ? Object.values(o).flatMap(strings) : [];
const fm = (PAGE.match(/^---\n([\s\S]*?)\n---/) || ["", ""])[1].split("\n").map(l => (l.match(/^(?:title|subtitle|description|pagetitle|description-meta): "(.*)"$/) || [])[1]).filter(Boolean);
const ABBR = /(?:\b(?:U\.S|U\.K|e\.g|i\.e|et al|vs)|\b[A-Z])\.$/;
const split = t => { const out = []; X.norm(t).split(/(?<=[.!?])\s+(?=[A-Z0-9"“(‘'])/).forEach(s => { if (out.length && ABBR.test(out[out.length - 1])) out[out.length - 1] += " " + s; else if (s) out.push(s); }); return out; };
const GEN = [...PAGE.matchAll(/<script type="application\/(?:ld\+)?json"[^>]*>([\s\S]*?)<\/script>/g)].flatMap(m => { try { return strings(JSON.parse(m[1])); } catch (e) { return [m[1]]; } }).filter(s => !/^https?:\/\/\S+$/.test(s)); // entity URLs are checked as links, not research prose
ok(GEN.length > 10 && GEN.includes(TITLE), "the build's JSON-LD and lesson data on the page are read value by value (" + GEN.length + " strings)");
const UNITS = X.elements(PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?learn:\1:end -->/g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/^---[\s\S]*?\n---\n/, "")).concat(GEN, fm, strings(D), JSSTR, [...SIDE.matchAll(/^    (?:term|def): "?(.*?)"?$/gm)].map(m => m[1]), [row]);
const SENT = UNITS.flatMap(split);
const both = SENT.filter(s => NUC.test(s) && RISK && RISK.test(s.replace(BENIGN, " ")));
ok(both.length === 0, "no sentence pairs a nuclear term with a risk term (page, front matter, data, script strings, sidecar): " + both.join(" | ").slice(0, 240));
ok(UNITS.filter(u => NUC.test(u) && RISK && RISK.test(u.replace(BENIGN, " "))).every(u => /<|^Holds when|^Assumed|^Inside|^Left out/.test(u) || split(u).length > 1 || u === row), "no single text element pairs them either (each element that names both is several sentences or a list)");
// the stricter check: no nuclear term and a cost word in one sentence (the scan's cost terms are only cost
// trajectories, so "an existing reactor's capital" next to "capital cost" passed it)
const COST = /\bcosts?\b|capital|\bsunk\b|upkeep|O&M|levelized|LCO[EHS]/i;
const nucCost = UNITS.filter(u => u !== row).flatMap(split).concat([...row.matchAll(/^  [a-z_]+: (.*)$/gm)].map(m => m[1])).filter(s => NUC.test(s) && COST.test(s));   // the path.yml row field by field
ok(nucCost.length === 0, "no sentence pairs a nuclear term with a cost word: " + nucCost.join(" | ").slice(0, 240));
ok(NUC.test("The study treats an existing reactor's capital as already spent (a sunk cost).") && COST.test("The study treats an existing reactor's capital as already spent (a sunk cost)."), "the cost check catches the wording the review found (a planted control)");
if (RG) {
  const NK = ["E15.1", "E15.2", "E15.3", "E15.4", "E15.5", "E15.11", "E15.12", "E15.13", "E15.19", "E15.26", "E15.29"], NROWS = NK.map(k => X.norm(RG.raw[k]));
  ok(Object.keys(RG.raw).filter(k => NUC.test(RG.raw[k])).join() === NK.join(), "the nuclear-term rows of the approved set are E15.1–E15.5, E15.11–E15.13, E15.19, E15.26 and E15.29 (E15.16 as revised names the plant): " + Object.keys(RG.raw).filter(k => NUC.test(RG.raw[k])).join(", "));
  const OTHER = [TITLE, "F5 shows how a reactor makes heat and electricity.",
    "Nuclear Hydrogen and Grid Services · CF4",
    "Explore hydrogen production, dispatch and reserve headroom in an illustrative model of an existing reactor."]; // generic teaching metadata, no paper outcomes
  // names, not prose: the repository, its command and the lesson's own id; the path.yml row is checked field by field below
  const NAMES = /nuclear-hydrogen-integration|nuclear-h2|cf4[-_]existing[-_]reactors[-_]hydrogen(\.html|\.js|\.json)?/g;
  const withN = UNITS.filter(u => u !== row).flatMap(split).map(s => s.replace(NAMES, "")).filter(s => NUC.test(s) && !/^https?:/.test(s));
  const fields = [...row.matchAll(/^  (title|subtitle|short|does|outcome|teaches): (.*)$/gm)];
  ok(fields.length === 6 && fields.every(f => f[1] === "title" ? f[2] === '"' + TITLE + '"' : !NUC.test(f[2])), "path.yml: only the title names reactors; subtitle, short, does, outcome and teaches name no nuclear term");
  ok(withN.every(s => NROWS.some(u => u.includes(s)) || OTHER.some(o => X.norm(o).includes(s))), "a nuclear term only in those rows, the title and the earlier-lessons line: " + withN.filter(s => !NROWS.some(u => u.includes(s)) && !OTHER.some(o => X.norm(o).includes(s))).join(" | ").slice(0, 240));
}
const ALL = (PAGE.replace(/<!--[\s\S]*?-->/g, "") + "\n" + JSON.stringify(D) + "\n" + JSSTR.join("\n") + "\n" + SIDE + "\n" + row);
// the one credit named: the 45U credit, only in the approved clauses that state the baseline's conditions (E15.20,
// E15.21, E15.24, E15.25); every other credit name, and the 45U credit anywhere else, fails the check below
const R45 = { units: ["E15.20", "E15.21", "E15.24", "E15.25"].map(k => X.norm(EFF[k])), raw: EFF };
const with45 = UNITS.filter(u => /\b45U\b/.test(u));
ok(with45.length >= 4 && with45.every(u => X.approved(R45, u)), "the 45U credit is named only in clauses of E15.20, E15.21, E15.24 and E15.25 (" + with45.length + " elements): " + with45.filter(u => !X.approved(R45, u)).join(" | ").slice(0, 240));
const ALL45 = ALL.replace(/<[^>]+>/g, "").replace(/without capacity payments or the 45U credit|even without the 45U credit|no capacity payments and no 45U credit in the baseload case/g, " ");
ok(!/\b45[UVY]\b|\b48E\b|MACRS|greenfield|new[- ]plant|new[- ]build|Cases? [34]\b|subsidy|profitab|without (policy|subsid|credit)|PJM|Data Miner|market data/i.test(ALL45), "no other credit name, no new-plant case, no 'without policy support' or 'profitable', no PJM or market-data wording (credit and nuclear scope)");
ok(!/data[- ]?cent|hyperscale|\bcampus\b|colocat|small modular|\bSMR\b|\bAI\b|artificial intelligence/i.test(ALL), "no data-center or small-modular wording, no AI wording");
const hrefs = [...PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?learn:\1:end -->/g, "").matchAll(/(?:href|src)="([^"]+)"/g)].map(m => m[1]).concat([...PAGE.matchAll(/\]\(([^)]+)\)/g)].map(m => m[1]), strings(D).filter(s => /^https?:/.test(s)));
const HOK = h => h === DOI || h === REPO || h === REPO + "#quick-start" || /^[0-9a-z-]+\.html$/.test(h) || /^\.\.\/assets\/learn\//.test(h);
ok(hrefs.every(HOK), "links: the paper's DOI, the allow-listed repository (and its README's Quick start), learn pages and the lesson's own assets only: " + hrefs.filter(h => !HOK(h)).join(", "));
{ const oc2 = (PAGE.match(/<p class="lx-eyebrow">With open code<\/p>([\s\S]*?)<\/div>/) || [])[1] || "";
  ok(oc2.includes('<a href="' + REPO + '#quick-start">Quick start</a>') && oc2.indexOf("Set it up first") < oc2.indexOf("<code>") && /Each run writes revenue_musd_per_yr\.csv and summary\.json into its --out-dir folder\. Compare the revenue tables, and grid_output_range_mw under "flexibility" in summary\.json/.test(X.norm(oc2)), "part 7: how to set up first (the README's Quick start), and which outputs to compare"); }
ok(!/projects\/|research\.(html|qmd)|npph2|arxiv|explainers\//i.test((PAGE.replace(/<!--[\s\S]*?-->/g, "") + JS + JSON.stringify(D)).replace(/data-source="excerpt:npph2-existing"/, "")), "no project page, no Research page, no explainer, no preprint");
{ const PJ = JSON.parse(fs.readFileSync(L("data/path.json"), "utf8")), live = new Set(), walk = o => { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === "object") { if (o.href && o.ready === true) live.add(o.href); Object.values(o).forEach(walk); } };
  walk(PJ); hrefs.filter(h => /^[0-9a-z-]+\.html$/.test(h) && h !== "index.html").forEach(h => ok(live.has(h), "linked lesson is live: " + h)); }
ok(!/Numbers to remember/.test(PAGE.replace(/<!--[\s\S]*?-->/g, "")), "no numbers to remember");
ok(/<script src="\.\.\/assets\/learn\/learn\.js" defer><\/script>\n<script src="\.\.\/assets\/learn\/cf4-existing-reactors-hydrogen\.js" defer>/.test(PAGE), "the page loads the bundle and its own script only");

console.log(`test_${ID}: ${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
