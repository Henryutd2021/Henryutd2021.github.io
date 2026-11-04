// test_a01-project-tea.js — Node tests for Analyst lesson A1 (assets/learn/a01-project-tea.js): the inputs agree with
// lesson 7, lesson 13, toolbox K3 and Prairie Town; the formulas agree with lesson 7's (crf, pv, realRate, blend, lcoe, npv)
// and K3's; the identities hold (NPV at the break-even price is zero, the break-even price is lesson 7's LCOE, 1 MW is
// $133,575 a year, NPV falls as the rate rises so the IRR is unique); the drill's answers are right; and every number the
// page states matches the model (statements one by one, a whitelist scan of the visible text, and every printed calculation
// recomputed from its shown operands). The whitelist scan is supplementary: it shows that every number on the page is one
// the model makes, not that each statement is right; the statements are checked one by one. The no-JS tables must equal
// staticBlocks(). A stub-document run checks step 4's IRR bracket (Codex review, 2026-11-03).
// Usage (from the site folder):  node _tests/learn/test_a01-project-tea.js [--write]   (--write rewrites the no-JS tables)
"use strict";
const fs = require("fs");
const path = require("path");
const SITE = path.resolve(__dirname, "..", "..");
const A = require(path.join(SITE, "assets/learn/a01-project-tea.js"));
const L7 = require(path.join(SITE, "assets/learn/07-cost.js"));
const K3 = require(path.join(SITE, "assets/learn/k03-discounting.js"));
const TP = require(path.join(SITE, "assets/learn/components/planengine.js"));
const read = f => JSON.parse(fs.readFileSync(path.join(SITE, f), "utf8"));
const D7 = read("assets/learn/data/07-cost.json"), DA = read("assets/learn/data/a01-project-tea.json");
const D13 = read("assets/learn/data/13-capstone.json"), TOWN = read("assets/learn/data/town.json");
const QPATH = path.join(SITE, "learn/a01-project-tea.qmd");
const s = A.story(D7, DA), B = A.staticBlocks(s), T = A.texts(s), p = s.p;
const BLOCKS = { "a1-cash": "cash", "a1-yard": "yard" };
function blockRe(name) { return [new RegExp("<!-- " + name + ":start[^>]*-->\\n"), "<!-- " + name + ":end -->"]; }
if (process.argv.includes("--write")) {
  let q = fs.readFileSync(QPATH, "utf8");
  Object.keys(BLOCKS).forEach(name => {
    const [ra, end] = blockRe(name), a = q.match(ra), b = q.indexOf(end);
    if (!a || b < a.index) throw new Error(name + " markers missing");
    q = q.slice(0, a.index + a[0].length) + B[BLOCKS[name]] + "\n" + q.slice(b);
  });
  fs.writeFileSync(QPATH, q); console.log("no-JS tables written");
}
const QMD = fs.readFileSync(QPATH, "utf8");
const JS = fs.readFileSync(path.join(SITE, "assets/learn/a01-project-tea.js"), "utf8");
const SIDE = fs.readFileSync(path.join(SITE, "learn/_w1/a01-project-tea.yml"), "utf8");
const PATHY = fs.readFileSync(path.join(SITE, "learn/path.yml"), "utf8");

let checks = 0, fails = 0;
function ok(cond, msg) { checks++; if (!cond) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 1e-9 : tol);
const has = (str, msg) => ok(QMD.indexOf(str) >= 0, "page states " + (msg || JSON.stringify(str)));
const { usd, musd, signed, pct } = A;

// ---------------- inputs: the same wind farm, rate and life as lessons 7 and 13 and K3; the farm is Prairie Town's
{
  const w = D7.techs.wind;
  ok(p.capex === 1712 && p.fom === 34.57 && p.cf === 33.8 && p.rate === 4 && p.life === 30, "inputs: $1,712/kW, $34.57/kW-yr, 33.8%, 4% real, 30 years from 07-cost.json");
  ok(D13.techs.wind.capex === w.capex && D13.techs.wind.fom === w.fom && D13.finance.wacc === D7.finance.wacc && D13.finance.life === D7.finance.life, "inputs: lesson 13 uses the same wind farm and finance");
  ok(DA.farm.mw === TOWN.fleet.wind.mw && p.mw === 150, "inputs: 150 MW, Prairie Town's wind farm (town.json)");
  ok(D7.finance.debtRate === 5 && D7.finance.equityRate === 10 && D7.finance.debtShare === 60 && D7.finance.inflation === 2.5, "inputs: lesson 7's illustrative blend: 5% loans, 10% owners, 60% loans, 2.5% inflation");
  ok(DA.priceYear === 2025 && /real 2025 dollars/.test(DA.about) && /one price year/i.test(DA.about), "price year: one, 2025, stated in the data file");
  ok(/data-src="\.\.\/assets\/learn\/data\/07-cost\.json \.\.\/assets\/learn\/data\/a01-project-tea\.json"/.test(QMD) && /data\["07_cost"\]/.test(JS) && /data\["a01_project_tea"\]/.test(JS), "inputs: the page reads lesson 7's data file and its own");
}

// ---------------- formulas: as lesson 7 and K3
{
  let bad = 0;
  for (let ri = 0; ri <= 20; ri++) for (let n = 5; n <= 40; n += 5) {
    const r = ri / 200;
    if (!near(A.crf(r, n), L7.crf(r, n), 1e-12) || !near(A.crf(r, n), K3.crf(r, n), 1e-12)) bad++;
    if (!near(A.annuity(r, n), K3.annuity(r, n), 1e-12) || !near(A.pv(100, r, n), L7.pv(100, r, n), 1e-12)) bad++;
  }
  ok(bad === 0, "formulas: crf, the annuity factor and pv agree with lesson 7 and K3 (" + bad + " bad)");
  const L = L7.lcoe(L7.inputs(D7, "wind"));
  ok(near(s.lcoe, L.total, 1e-9) && near(s.be, L.total, 1e-9) && usd(s.be) === "$45.11", "break-even: the break-even price is lesson 7's LCOE, $45.11/MWh");
  ok(near(A.npv(A.inputs(D7, DA, { price: s.be })), 0, 1e-3), "break-even: NPV at the break-even price is zero");
  ok(near(s.perMW, 1000 * L.annual, 1e-6) && usd(s.perMW, 0) === "$133,575" && near(s.perMW, K3.story(D7, D13).wind.perMW, 1e-6), "convention: 1 MW of wind costs $133,575 a year, as lesson 7 and K3");
  ok(near(s.perMW, TP.costs(D13).techs.wind.fixed, 1e-6), "convention: and as lesson 13's planning engine (costs().techs.wind.fixed)");
  ok(near(s.perMW / (p.cf / 100 * 8760), s.be, 1e-9) && (p.cf / 100 * 8760).toFixed(2) === "2960.88", "convention: $133,575 ÷ 2,960.88 MWh per MW = the break-even price");
  ok(near(A.realRate(0.07, 0.025), L7.realRate(0.07, 0.025), 1e-15) && near(A.wacc(D7.finance, 60).real, L7.blend(D7.finance, 60).real, 1e-12) && near(A.wacc(D7.finance, 60).nominal, L7.blend(D7.finance, 60).nominal, 1e-12), "WACC: as lesson 7's blend()");
  // per kW and per farm: A1's NPV is lesson 7's npv() per kW (at the same price) times the farm's kW
  [30, 45, 50, 60].forEach(pr => ok(near(A.npv(A.inputs(D7, DA, { price: pr })), 1000 * p.mw * L7.npv(L7.inputs(D7, "wind"), pr).npv, 1e-3), "NPV: A1's farm = 150,000 kW × lesson 7's npv per kW at $" + pr));
  // flows: year 0 and the running sums
  const F = A.flows(p);
  ok(F.length === 31 && F[0].cash === -s.C && near(F[30].cumPV, s.npv, 1e-3) && near(F[30].cum, s.sum - s.C, 1e-3), "flows: 31 years, the discounted running sum ends at the NPV");
}

// ---------------- identities: the IRR is unique; NPV falls as the rate rises; payback definitions
{
  let bad = 0, prev = Infinity;
  for (let r = -20; r <= 60; r += 0.25) { const v = A.npv(p, r); if (!(v < prev)) bad++; prev = v; }
  ok(bad === 0, "IRR: NPV falls strictly as the rate rises from −20% to 60%, so it crosses zero once");
  const F = A.flows(p), signs = F.map(y => Math.sign(y.cash)).filter((v, i, a) => i === 0 || v !== a[i - 1]);
  ok(signs.join() === "-1,1", "IRR: the cash changes sign once (one outlay, then positive years)");
  ok(near(A.npv(p, s.irr), 0, 1e-3) && pct(s.irr, 2) === "5.17%", "IRR: 5.17%, and NPV there is zero");
  ok(s.pb.simple === 16 && F[15].cum < 0 && F[16].cum >= 0 && s.pb.years.toFixed(2) === "15.09", "payback: running sum first ≥ 0 in year 16 (15.09 years)");
  ok(s.pb.discounted === 24 && F[23].cumPV < 0 && F[24].cumPV >= 0, "payback: discounted at 4%, year 24");
  ok(s.pb20.simple === 16 && s.pb20.discounted === null && musd(s.npv20) === "−$25.5M", "payback: a 20-year life keeps payback in year 16, never pays back discounted, NPV −$25.5M");
  // step 4: the IRR is not on the slider's 0.1-point grid, so the card asks for the two settings around it
  const B = s.irrB, grid = [], st = DA.rateStep;
  for (let r = DA.rateRange[0]; r <= DA.rateRange[1] + 1e-9; r += st) grid.push(+r.toFixed(1));
  ok(B.lo === 5.1 && B.hi === 5.2 && grid.indexOf(B.lo) >= 0 && grid.indexOf(B.hi) >= 0 && B.npvLo > 0 && B.npvHi < 0 && signed(B.npvLo) === "+$1.9M" && signed(B.npvHi) === "−$1.0M", "IRR bracket: 5.1% (+$1.9M) and 5.2% (−$1.0M), neighbours on the slider");
  ok(grid.every(r => Math.abs(A.npv(p, r)) > 0.5e6) && B.lo < s.irr && s.irr < B.hi, "IRR bracket: no slider setting gives an NPV of zero; the IRR lies inside the bracket");
  ok(grid.filter(r => A.npv(p, r) > 0).pop() === B.lo && grid.filter(r => A.npv(p, r) < 0)[0] === B.hi, "IRR bracket: the last positive and the first negative settings");
  // the explain layer's code searches −50% to 100%, as irr() does: it brackets every IRR the sliders can reach
  let badB = 0;
  for (let pr = DA.priceRange[0]; pr <= DA.priceRange[1]; pr += DA.priceStep) [D7.finance.lifeRange[0], 30, D7.finance.lifeRange[1]].forEach(life => {
    const q = A.inputs(D7, DA, { price: pr, life: life }); if (!(A.npv(q, -50) > 0 && A.npv(q, 100) < 0 && A.irr(q) !== null)) badB++; });
  ok(badB === 0 && /brentq\(npv_at, -0\.5, 1\.0\)  # needs npv_at\(-0\.5\) > 0 > npv_at\(1\.0\)/.test(JS) && !/brentq\([^)]*, 0, 1\)/.test(JS), "IRR code: the search range −50% to 100% brackets the IRR at every price and life on the sliders (" + badB + " bad)");
  ok(pct(A.irr(A.inputs(D7, DA, { price: 30 })), 3) === "−0.323%", "IRR code: at $30/MWh the IRR is negative (−0.323%), inside the range");
}

// ---------------- the story numbers
{
  ok(A.mwh(s.E) === "444,132" && musd(s.C) === "$256.8M" && musd(s.S) === "$22.2M" && musd(s.F) === "$5.2M" && musd(s.net) === "$17.0M" && musd(s.sum) === "$510.6M", "story: cash flows");
  ok(musd(s.pvNet) === "$294.3M" && signed(s.npv) === "+$37.5M", "story: $294.3M today, NPV +$37.5M");
  ok(pct(s.w60.nominal, 1) === "7.0%" && pct(s.w60.real, 2) === "4.39%" && signed(s.npv60) === "+$24.1M" && signed(s.npv40) === "−$5.7M" && pct(s.w40.real, 2) === "5.37%", "story: WACC 60% and 40% loans");
  ok(signed(s.npv7) === "−$45.6M" && signed(s.npvAt45) === "−$0.9M", "story: NPV at 7% and at $45/MWh");
  ok(pct(s.irrSmall, 2) === "8.12%" && musd(s.npvSmall) === "$18.9M" && s.irrSmall > s.irr && s.npvSmall < s.npv, "story: the 20 MW farm at 43%: higher IRR, lower NPV");
  const r = s.tor.rows;
  ok(r.map(x => x.key).join() === "cf,rate,price,capex,life,fom", "tornado: order capacity factor, rate, price, building cost, life, upkeep: " + r.map(x => x.key).join());
  ok(musd(r[0].swing) === "$204.5M" && musd(r[1].swing) === "$170.0M" && musd(r[2].swing) === "$153.6M", "tornado: swings $204.5M, $170.0M, $153.6M");
  ok(r.every((x, i) => i === 0 || x.swing <= r[i - 1].swing) && near(s.tor.base, s.npv, 1e-6), "tornado: sorted by swing, base = the NPV");
  ok(s.ms.build === 2026 && s.ms.simple === 2042 && s.ms.discounted === 2050 && s.ms.end === 2056, "timeline: 2026, 2042, 2050, 2056");
}

// ---------------- the page: statements one by one
{
  has("Year 0 spends $256.8M on building the farm. Years 1 to 30 each sell $22.2M of power at $50/MWh and spend $5.2M on upkeep: $17.0M net.");
  has("Discounted at 4% a year, the 30 net years are worth $294.3M today, so the net present value (NPV) is +$37.5M.");
  has("60% loans give 4.39% real and an NPV of +$24.1M; 40% loans give −$5.7M.");
  has("The NPV reaches zero at 5.17%, the internal rate of return (IRR).");
  has("The cash put in is back in year 16 (year 24 discounted). With a 20-year life, payback is still year 16, but the NPV is −$25.5M.");
  has("The NPV crosses zero at a price of $45.11/MWh, lesson 7's levelized cost of the same farm.");
  has("the capacity factor moves the NPV most ($204.5M), then the discount rate ($170.0M) and the price ($153.6M)");
  has("+$37.5M for the farm at 4%"); has("5.17% for the farm"); has("year 16, or year 24 discounted"); has("$45.11/MWh, the farm's LCOE");
  has("A 20 MW farm at a 43% capacity factor returns 8.12% but adds $18.9M; the 150 MW farm returns 5.17% and adds $37.5M.");
  has("With a 20-year life the farm still pays back in year 16, yet its NPV is −$25.5M");
  has("Year 0 is −$256.8M. The NPV is one sum of all years at today's value, +$37.5M at 4%.");
  has("<li data-value=\"b\">No: its NPV is −$45.6M</li>"); has("at 7% the NPV is −$45.6M, because 7% is above the farm's 5.17% IRR");
  has("15.09 years: 256.8 ÷ 17.02 = 15.09, so the running sum first reaches zero in year 16.");
  has("1 MW of wind costs \\$133,575 a year, and $133{,}575 \\div (0.338 \\times 8{,}760) = 45.11$", "the $133,575 convention in Go deeper");
  has("$133,575 a year per MW ÷ 2,960.88 MWh per MW");
  has("<code>=NPV(4%, B3:B32) + B2</code> gives 37.53"); has("<code>=IRR(B2:B32)</code> gives 5.17%");
  ok(near(s.S / 1e6, 22.2066, 1e-9) && near(s.F / 1e6, 5.1855, 1e-9) && (s.npv / 1e6).toFixed(2) === "37.53", "spreadsheet task: 22.2066, 5.1855 and 37.53 are the model's");
  ok((A.sales(A.inputs(D7, DA, { price: 45.11 })) / 1e6).toFixed(4) === "20.0348" && Math.abs(A.npv(A.inputs(D7, DA, { price: 45.11 }))) < 0.05e6, "spreadsheet task: at $45.11, sales 20.0348 and NPV about zero (" + A.npv(A.inputs(D7, DA, { price: 45.11 })).toFixed(0) + ")");
  has("Change the price to $45.11 (sales 20.0348)");
  has("Row 1 holds the headers: <code>Year</code> in A1 and <code>Cash ($M)</code> in B1. Years 0 to 30 go in A2 to A32.");
  has("Cash: −256.8 in B2 (year 0), then 22.2066 − 5.1855 in B3 to B32 (years 1 to 30).");
  ok((256.8 * 1).toFixed(1) === musd(s.C).replace(/[$M]/g, "") && 32 - 2 === p.life, "spreadsheet task: rows 2 to 32 hold years 0 to 30");
  has("+$37.5M is the NPV at 4%; simple payback does not depend on the rate.");
  ok(/data-id="seven" data-answer="b"/.test(QMD) && /data-id="spb" data-answer="c"[\s\S]{0,300}<li data-value="c">15\.09 years<\/li>/.test(QMD), "quiz: answers point at the right options");
  ok(/data-id="above" data-answer="fact"/.test(QMD) && /data-id="irr" data-answer="myth"/.test(QMD) && /data-id="payback" data-answer="myth"/.test(QMD) && /data-id="yearly" data-answer="myth"/.test(QMD), "myths: three myths and one fact");
  Object.keys(BLOCKS).forEach(name => {
    const [ra, end] = blockRe(name), a = QMD.match(ra), b = QMD.indexOf(end);
    ok(a && b > a.index && QMD.slice(a.index + a[0].length, b).trim() === B[BLOCKS[name]].trim(), `page: the ${name} table equals staticBlocks() (run with --write)`);
  });
  ["07-cost.html", "k03-discounting.html", "k07-spreadsheets.html", "a02-contracts-risk.html"].forEach(h => ok(QMD.indexOf('href="' + h + '"') >= 0, "links " + h));
  ok(!/href="[^"]*(m11|x05|projects\/|research\.)/i.test(QMD) && /M11 and side shelf X5 \(both upcoming\)/.test(QMD) && /side shelf X5, upcoming/.test(QMD), "upcoming lessons are named, not linked; no project or Research links");
  ok(/EMM_Assumptions\.pdf">EIA, AEO2026 assumptions, Table 3<\/a> \(2025 dollars, April 2026\)/.test(QMD) && /financial_cases_&amp;_methods">2025 ATB<\/a> \(NLR, September 2026\)/.test(QMD) && /5173\.pdf/.test(QMD) && /p\. 39[\s\S]*p\. 52[\s\S]*p\. 56[\s\S]*p\. 57/.test(QMD), "sources: EIA, NLR and the NREL manual with dates and pages");
  ok(/One price year: every dollar is a real 2025 dollar/.test(QMD) && /Illustrative: the loan and owner rates \(5%, 10%\), the 150 MW size and the \$50\/MWh price, fixed in 2025 dollars as a contract indexed to inflation would be/.test(QMD) && /Left out: taxes, tax credits, depreciation/.test(QMD), "data note: price year, illustrative inputs and the boundary are stated");
  ok(/fixed in real terms \(2025 dollars\)/.test(DA.priceNote) && /flat nominal price would lose purchasing power/.test(DA.priceNote) && /A price flat in nominal dollars buys less each year, so its real revenue falls/.test(QMD) && /as a contract indexed to inflation would be/.test(JS), "price: fixed in real terms, as an indexed contract; a flat nominal price falls in real terms (data, Go deeper, equation card)");
  ok(/the real WACC may fall less than the slider shows, or not at all\./.test(QMD) && !/The WACC falls less than the slider shows/.test(QMD), "financing: Go deeper does not claim the WACC falls");
  // every element of the no-JS fallback, the data note and Go deeper holds one idea within the budget (about 35 words)
  const elems = [].concat((QMD.match(/<li>[\s\S]*?<\/li>/g) || []).filter(t => !/data-value=/.test(t) && !/<li>[A-Z][a-z]+, [A-Z]\./.test(t) && !/Short, W\./.test(t) && !/EIA \(2026\)\.|EIA\. <a|NLR \(2026\)\./.test(t)), QMD.match(/^- \*\*[\s\S]*?$/gm) || []);
  const words = t => t.replace(/<[^>]+>/g, " ").replace(/\$[^$]*\\[a-z][^$]*\$/g, " x ").replace(/\*\*/g, "").split(/\s+/).filter(Boolean).length;
  const long = elems.filter(t => words(t) > 36).map(t => words(t) + ": " + t.replace(/<[^>]+>/g, "").slice(0, 50));
  ok(elems.length >= 20 && long.length === 0, "budget: " + elems.length + " fallback, data-note and Go deeper elements are 36 words or fewer: " + JSON.stringify(long));
  const body = QMD.replace(/<!-- learn:meta:start[\s\S]*?learn:meta:end -->/, "");
  ok(!/nuclear|reactor|\bSMR\b|data cent|learning/i.test(body) && !/nuclear|reactor|data cent|learning/i.test(JS.replace(/\/\/.*$/gm, "")), "scope: no nuclear, no data centers, no learning wording");
}

// ---------------- every number in the page's visible text is one the model produces (whitelist scan)
{
  let body = QMD.replace(/\{,\}/g, ",").replace(/^---[\s\S]*?\n---\n/, "").replace(/<!-- learn:(meta|next|footer):start[\s\S]*?learn:\1:end -->/g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/<style>[\s\S]*?<\/style>/g, "")
    .replace(/<script[\s\S]*?<\/script>/g, "").replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<[^>]+>/g, " ").replace(/\]\([^)]*\)/g, "]")
    .replace(/\{[^}]*\}/g, " ").replace(/https?:\/\/\S+/g, " ").replace(/\\\$/g, "$");
  const allowed = new Set(), add = v => allowed.add(String(v));
  const m = v => { const t = musd(v).replace(/^[−$]+/, "").replace(/^\$/, "").replace(/M$/, ""); add(t); };
  [s.C, s.S, s.F, s.net, s.sum, s.pvNet, s.npv, s.npv60, s.npv40, s.npv20, s.npv7, s.npvSmall].forEach(m);
  s.tor.rows.forEach(r => m(r.swing));
  B.cash.match(/\d[\d,]*\.\d/g).forEach(add);
  [s.irr, s.irrSmall, s.w60.real].forEach(v => add(v.toFixed(2))); add(s.be.toFixed(2)); add(s.pb.years.toFixed(2)); add(s.w60.nominal.toFixed(1));
  ["133,575", "2,960.88", "8,760", "0.338", "1,712", "34.57", "33.8", "22.2066", "5.1855", "20.0348", "37.53", "45.11", "17.02", "256.8", "12.00", "8.56", "30.00", "4.08", "40", "32"].forEach(add);
  [0, 1, 2, 3, 4, 5, 7, 10, 11, 12, 13, 16, 20, 24, 25, 30, 31, 39, 43, 45, 50, 52, 56, 57, 60, 70, 80, 150, 462, 1995, 2025, 2026, 5173, "2.5", "1.0", "6.0"].forEach(add);
  const found = (body.match(/\d[\d,]*(?:\.\d+)?/g) || []).map(t => t.replace(/[.,]$/, ""));
  const unknown = [...new Set(found.filter(t => !allowed.has(t)))];
  ok(unknown.length === 0, "every number on the page is from the model or a structural count; unknown: " + unknown.join(" "));
  ok(found.length > 120, `the scan saw the page's numbers (${found.length})`);
  // the quiz's distractors are honest numbers: 8.56 = 256.8 ÷ 30 (the life, a slip), 12.00 = 256.8 ÷ 21.4 (rounded, a slip)
  ok((256.8 / 30).toFixed(2) === "8.56", "quiz: 8.56 years is the outlay ÷ the life, a named slip");
}

// ---------------- every printed calculation reproduces from its shown operands (as K3's test)
const SUPS = "⁰¹²³⁴⁵⁶⁷⁸⁹";
function normCalc(str) {
  let t = String(str).replace(/\[\[[^|\]]+\|([^\]]+)\]\]/g, "$1").replace(/<sup>([^<]*)<\/sup>/g, "^$1").replace(/&nbsp;/g, " ").replace(/<[^>]+>/g, " ")
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+/g, mm => "^" + mm.split("").map(c => c === "⁻" ? "-" : SUPS.indexOf(c)).join("")).replace(/[−–]/g, "-").replace(/\$/g, "");
  while (/(\d),(\d{3})/.test(t)) t = t.replace(/(\d),(\d{3})/g, "$1$2");
  return t;
}
const decimals = v => (String(v).split(".")[1] || "").length;
function evalSide(side) {
  const e = side.replace(/×/g, "*").replace(/÷/g, "/").replace(/\^/g, "**");
  if (!/^[\d.\s()+\-*/]+$/.test(e)) return null;
  try { const v = Function('"use strict"; return (' + e + ");")(); return typeof v === "number" && isFinite(v) ? v : null; } catch (err) { return null; }
}
function calcCheck(label, str, skips) {
  let n = 0;
  const runs = normCalc(str).match(/[\d.()+\-×÷^=≈ ]*[=≈][\d.()+\-×÷^=≈ ]*/g) || [];
  runs.forEach(run => {
    const parts = run.split(/([=≈])/);
    for (let i = 1; i < parts.length - 1; i += 2) {
      let L = parts[i - 1].trim(), R = parts[i + 1].trim();
      const bal = x => { x = x.replace(/\.$/, "").trim(); while (x.startsWith("(") && (x.match(/\(/g) || []).length > (x.match(/\)/g) || []).length) x = x.slice(1).trim(); while (x.endsWith(")") && (x.match(/\)/g) || []).length > (x.match(/\(/g) || []).length) x = x.slice(0, -1).trim(); return x; };
      L = bal(L); R = bal(R);
      if (!L) continue;
      if (!/^[\d(\-]/.test(L) || !/[\d)]$/.test(L)) { skips.push(label + ": " + run.trim()); continue; }
      const lv = evalSide(L);
      if (lv === null) { skips.push(label + ": " + run.trim()); continue; }
      if (!/^-?\d[\d.]*$/.test(R)) { const rx = evalSide(R); if (rx === null) { skips.push(label + ": " + run.trim()); continue; } n++; ok(Math.abs(lv - rx) <= 1e-9 * Math.max(1, Math.abs(rx)), `calc (${label}): ${L} = ${R}`); continue; }
      const rv = +R; n++;
      if (parts[i] === "=") ok(lv.toFixed(decimals(R)) === R || (decimals(R) === 0 && Math.round(lv) === rv), `calc (${label}): ${L} = ${R} reproduces from its shown operands (gives ${lv})`);
      else ok(Math.abs(lv - rv) <= Math.max(0.005 * Math.abs(rv), 0.5 * Math.pow(10, -decimals(R))), `calc (${label}): ${L} ≈ ${R} is within rounding (gives ${lv})`);
    }
  });
  return n;
}
{
  const skips = [];
  const vis = QMD.replace(/^---[\s\S]*?\n---\n/, "").replace(/<!-- learn:(meta|next|footer):start[\s\S]*?learn:\1:end -->/g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/<style>[\s\S]*?<\/style>/g, "");
  const htmlParts = vis.match(/```\{=html\}[\s\S]*?```/g) || [], mdParts = vis.split(/```\{=html\}[\s\S]*?```/);
  let n = 0;
  htmlParts.forEach((h, i) => { n += calcCheck("page html " + i, h.replace(/<code>[^<]*<\/code>/g, " "), skips); });
  mdParts.forEach((md, i) => { n += calcCheck("page md " + i, md.replace(/\\\$/g, "\u0000").replace(/\$\$[\s\S]*?\$\$/g, " ").replace(/(^|[^\d])\$[^$\n]*?[a-z\\{}][^$\n]*?\$/gi, "$1 ").replace(/\u0000/g, "$"), skips); });
  ok(n >= 1, `calc: the page's printed calculations were found and checked (${n})`);
  // the Go deeper TeX calculation, read as numbers
  ok((133575 / (0.338 * 8760)).toFixed(2) === "45.11", "calc: 133,575 ÷ (0.338 × 8,760) = 45.11");
  let d = 0; A.drill(42, 600).forEach((it, i) => { d += calcCheck("drill " + i, it.why, skips); });
  ok(d >= 300, `calc: the drill's worked answers were checked (${d})`);
  const bad = skips.filter(x => !/^page/.test(x) || !/NPV\(|IRR\(/.test(x));
  ok(bad.length === 0, "calc: nothing unexpected was skipped: " + JSON.stringify([...new Set(bad)].slice(0, 6)));
}

// ---------------- the step texts and messages: budget, terms, honesty
{
  const msgs = { build: T.build, disc: T.disc, waccSaw: T.waccSaw, irr: T.irr, irrDown: T.irrDown, irrUp: T.irrUp, restart: T.restart, pay: T.pay, be: T.be, tor: T.tor("cf"), wacc: T.wacc(60) + " " + T.waccSaw };
  Object.keys(msgs).forEach(k => { const w = msgs[k].replace(/\[\[[^|\]]+\|([^\]]+)\]\]/g, "$1").split(/\s+/).filter(Boolean).length; ok(w <= 36, `budget: message ${k} is ${w} words (≤ 36)`); });
  const Q = A.prompts(s, D7), plain = t => t.replace(/\[\[[^|\]]+\|([^\]]+)\]\]/g, "$1");
  const sentences = t => (plain(t).match(/[.!?](?=\s+[A-Z(]|$)/g) || []).length;
  ok(Q.length === 7 && [0, 1, 2, 3, 4, 5, 6].every(i => JS.indexOf("text: Q[" + i + "]") >= 0), "steps: seven cards, each prompt from prompts()");
  Q.forEach((q, i) => { const w = plain(q).split(/\s+/).length; ok(sentences(q) <= 2 && w <= 35, `prompt ${i + 1}: ${sentences(q)} sentences, ${w} words (≤ 2, ≤ 35)`); });
  ok(T.irr === "Between 5.1% (NPV +$1.9M) and 5.2% (−$1.0M) the NPV changes sign. The [[internal-rate-of-return|internal rate of return]] lies between: 5.17%. It is above 4%, so the NPV at 4% is positive.", "messages: the IRR bracket message");
  ok(/Find the two neighbouring settings where it changes sign/.test(Q[3]), "step 4: asks for the two settings around the IRR, not for zero itself");
  ok(T.waccSaw === "Rates held fixed, more loans lower the WACC and raise the NPV. Real financing shifts risk and required returns, so this slider cannot pick the best loan share." && !/decide the answer/.test(JS), "messages: the loan-share message says what the slider cannot show");
  ok(T.restart === "Starting again from the default farm: $50/MWh, 4% real, 30 years." && (JS.match(/^        restart\(act\);$/gm) || []).length === 4, "steps 4 to 7 each say they start again from the default farm");
  ok(/lede: "Tap a symbol: its meaning, unit and value\. NPV, IRR and p follow your last price in step 6; the rest are the default farm's\."/.test(JS) && /title: "The default farm's life, year by year"/.test(JS) && /title: "Five yardsticks for the default farm"/.test(JS), "explain: the reader's price and the default farm are told apart");
  ok(T.wacc(60) === "60% loans: 7.0% nominal, 4.39% real; NPV +$24.1M." && T.wacc(40) === "40% loans: 8.0% nominal, 5.37% real; NPV −$5.7M.", "messages: the WACC line at 60% and 40%");
  ok(/Right\. Capacity factor moves the NPV most \(\$204\.5M across its range\), then discount rate \(\$170\.0M\)/.test(T.tor("cf")) && !/^Right/.test(T.tor("price")), "messages: the tornado names the top two and says Right only for the right guess");
  ok(/would not earn its 4%/.test(T.be) && /lesson 7's LCOE/.test(T.be), "messages: the break-even message ties to lesson 7 and says what negative means");
  ok(/Both rates stay fixed here, a simplification/.test(JS) && /owners ask more/.test(QMD), "honesty: the fixed-rate simplification of step 3 is stated (step and Go deeper)");
  ok(/Other ranges could change the order/.test(T.tor("cf")) && /Ranges: sale price illustrative; the others are lesson 7's/.test(JS), "honesty: the tornado's ranking depends on the chosen ranges");
  const desc = (QMD.match(/^description: "([^"]+)"/m) || [])[1] || "";
  ok(desc.split(/\s+/).length <= 35, `budget: the description is ${desc.split(/\s+/).length} words (≤ 35)`);
  ["internal-rate-of-return", "payback-period", "break-even-price", "inflation"].forEach(id => ok(new RegExp("id: " + id + "\\n").test(SIDE) && JS.indexOf("[[" + id + "|") >= 0, "glossary: " + id + " defined in the sidecar and marked"));
  [["nominal-rate", "k03-discounting"], ["capital-recovery-factor", "07-cost"]].forEach(([id, l]) => ok(new RegExp("id: " + id + "\\n").test(fs.readFileSync(path.join(SITE, "learn/_w1/" + l + ".yml"), "utf8")) && JS.indexOf("[[" + id + "|") >= 0, "glossary: " + id + " (defined in " + l + ") marked at its first use"));
  ok(/\[\[nominal-rate\|nominal\]\]/.test(Q[2]) && /\[\[capital-recovery-factor\|capital recovery factor\]\] \(CRF\) " \+ cr\.toFixed\(4\)/.test(JS), "terms: 'nominal' marked in step 3; the drill spells out CRF and marks it (LX.Drill writes marks since the W3 shared fix)");
  ok(/when electricity is its only revenue, with the same costs, output and discounting, it equals the plant's levelized cost\./.test(SIDE) && !/for one plant it equals/.test(SIDE), "glossary: break-even price equals the levelized cost only under stated conditions");
}

// ---------------- the interactive: the actions Next waits for, live regions, the demo hook, path.yml
{
  ok(/if \(on\.build && on\.sales && on\.upkeep\) \{ api\.done\(\)/.test(JS) && /if \(shown\) \{ api\.done\(\)/.test(JS) && /if \(moved\) \{ api\.done\(\)/.test(JS) && /if \(!reached && seen\.lo && seen\.hi\) \{ reached = true; api\.done\(\)/.test(JS) && /if \(tg\.val\(\)\) \{ api\.done\(\)/.test(JS) && /if \(!crossed && v < 0\)/.test(JS) && /onPick: function \(g\) \{ if \(!drawn\) \{ drawn = true; draw\(\); \} pr\.reveal\(\); api\.done\(\)/.test(JS), "steps: each card's action is checked before Next opens");
  ok((JS.match(/"aria-live": "polite"/g) || []).length >= 1 && /function readouts\(host, labels, cls\) \{\s*var box = H\("div", \{ class: "lx-readouts" \+ \(cls \? " " \+ cls : ""\), "aria-live": "polite" \}/.test(JS), "steps: readouts are a live region");
  ok(/LX\.demo\(root,/.test(JS) && /state === "mid" \? 1/.test(JS) && /autos\[6\]/.test(JS), "demo: mid, step-N and done states");
  ok(/LX\.EquationCard\(/.test(JS) && /LX\.Timeline\(/.test(JS) && /LX\.CompareTable\(/.test(JS) && /LX\.Tornado\(/.test(JS) && /LX\.Drill\(host, \{/.test(JS), "components: equation card, timeline, comparison table, tornado and drill");
  ok(/id: a01-project-tea\n  code: A1\n  tier: analyst\n  form: cards\n  icon: coin\n  status: active/.test(PATHY) && /after: \[7, K3\]\n  next: A2/.test(PATHY) && /practice_minutes: 45/.test(PATHY), "path.yml: A1 is active, after lesson 7 and K3, next A2, 30 + 45 minutes");
  const sub = (QMD.match(/^subtitle: "([^"]+)"/m) || [])[1];
  ok(PATHY.indexOf('subtitle: "' + sub + '"') >= 0, "path.yml: subtitle equals the page's");
}

// ---------------- drill items
{
  const items = A.drill(42, 600), counts = {};
  items.forEach((it, i) => {
    counts[it.kind] = (counts[it.kind] || 0) + 1;
    if (it.kind === "npv") { const mm = /costs \$(\d+)M now and nets \$(\d+)M at the end of each year for (\d+) years\. Its NPV at (\d+)%/.exec(it.q); ok(mm && near(it.answer, Math.round((-mm[1] + mm[2] * A.annuity(mm[4] / 100, +mm[3])) * 10) / 10), `drill ${i}: npv`); }
    if (it.kind === "payback") { const mm = /costs \$(\d+)M and nets \$(\d+)M a year/.exec(it.q); let c = -mm[1], t = 0; while (c < -1e-9) { c += +mm[2]; t++; } ok(it.answer === t, `drill ${i}: payback year ${t}`); }
    if (it.kind === "irr") { const mm = /nets \$([\d.]+)M a year for (\d+) years/.exec(it.q), ex = A.irrOf(100, +mm[1], +mm[2]); ok(+it.choices[it.answer].replace("%", "") === Math.round(ex) && Math.abs(ex - Math.round(ex)) < 0.02 && new Set(it.choices).size === 4, `drill ${i}: irr (${ex.toFixed(3)})`); }
    if (it.kind === "wacc") { const mm = /Loans pay (\d+)% and owners ask (\d+)%.*loans are (\d+)% of the money; inflation is ([\d.]+)%/.exec(it.q); const nom = mm[3] / 100 * mm[1] + (1 - mm[3] / 100) * mm[2]; ok(near(it.answer, Math.round(((1 + nom / 100) / (1 + mm[4] / 100) - 1) * 1e4) / 100), `drill ${i}: wacc`); }
    if (it.kind === "breakeven") { const mm = /Building cost \$([\d,]+)\/kW, upkeep \$([\d.]+)\/kW-yr, capacity factor ([\d.]+)%, \[\[capital-recovery-factor\|capital recovery factor\]\] \(CRF\) ([\d.]*\d)/.exec(it.q); ok(near(it.answer, Math.round((+mm[4] * +mm[1].replace(/,/g, "") + +mm[2]) / (mm[3] / 100 * 8.76) * 100) / 100), `drill ${i}: breakeven`); }
    if (it.kind === "pick") { const mm = /A: NPV \$(\d+)M, IRR (\d+)%\. B: NPV \$(-?\d+)M, IRR (\d+)%/.exec(it.q); ok(mm && (it.answer === 1) === (+mm[3] > +mm[1]) && +mm[4] > +mm[2], `drill ${i}: pick by NPV, not IRR`); }
    if (!it.choices) ok(A.close(it.answer, it.answer, it.tol), `drill ${i}: its own answer passes`);
  });
  ok(Object.keys(counts).length === 6, "drill: all six kinds appear: " + JSON.stringify(counts));
  ok(A.drill(7, 12).map(x => x.q).join("|") === A.drill(7, 12).map(x => x.q).join("|"), "drill: a seed replays the same items");
  ok(items.filter(it => it.kind === "pick").some(it => it.answer === 0) && items.filter(it => it.kind === "pick").some(it => it.answer === 1), "drill: the pick items go both ways");
}

// ---------------- the page on a stub document: step 4 opens Next only on the IRR bracket; steps 4 to 7 say they restart
{
  const vm = require("vm");
  const { env, load } = require("./stubdom.js");
  const E = env();
  E.LX.ready = () => {}; E.LX.visible = () => false; E.LX.progress.guess = () => null;
  ["numanswer", "drill", "cards", "controls", "toggle", "plot", "predict"].forEach(n => load(n, E));
  let init = null, demo = null;
  E.LX.mount = (slug, f) => { if (slug === "a01") init = f; };
  E.LX.demo = (root, fn, cards) => { demo = { fn, cards }; return () => null; };
  E.LX.Tornado = () => ({ draw() {} });
  const mctx = { window: E.window, document: E.document, location: E.location, navigator: {}, console, module: { exports: {} }, performance: E.window.performance, setTimeout: () => 0, clearTimeout: () => {} };
  let threw = null;
  try {
    vm.runInNewContext(JS, mctx);
    const root = E.LX.H("div", { class: "lx-interactive", "data-learn": "a01" }, E.body), live = E.LX.H("div", null, root);
    init(live, { "07_cost": D7, a01_project_tea: DA }, root);
  } catch (e) { threw = e.message; }
  ok(!threw && demo && demo.cards, "stub: the page mounts" + (threw ? ": " + threw : ""));
  if (!threw && demo) try {
    const card = () => demo.cards.el, btn = re => card().querySelectorAll("button").filter(b => re.test(b.getAttribute("aria-label") || b.textContent))[0];
    const next = () => btn(/^Next/), saw = () => (card().querySelector(".lx-saw") || { textContent: "" }).textContent;
    const input = () => card().querySelector("input");
    demo.cards.go(3);
    ok(/Starting again from the default farm/.test(card().textContent), "stub: step 4 says it starts again from the default farm");
    input().value = "6"; input().fire("input");
    ok(next().disabled && /Past zero/.test(saw()), "stub: 6.0%, past the IRR, does not open Next; the card says to step back");
    const down = btn(/^Lower Discount rate/), up = btn(/^Raise Discount rate/);
    for (let i = 0; i < 8; i++) down.click();     // 6.0 → 5.2
    ok(next().disabled && /Past zero/.test(saw()), "stub: 5.2% alone does not open Next");
    down.click();                                  // 5.1
    ok(!next().disabled && /Between 5\.1% \(NPV \+\$1\.9M\) and 5\.2% \(−\$1\.0M\)/.test(saw()), "stub: standing on 5.2% and 5.1% opens Next and names the bracket: " + saw());
    [4, 5, 6].forEach(k => { demo.cards.go(k); ok(/Starting again from the default farm/.test(card().textContent), "stub: step " + (k + 1) + " says it starts again from the default farm"); });
  } catch (e) { ok(false, "stub: the page test threw: " + (e && e.stack || e)); }
}

console.log(`a01-project-tea: ${checks - fails} of ${checks} checks passed`);
process.exit(fails ? 1 : 0);
