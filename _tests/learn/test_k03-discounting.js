// test_k03-discounting.js — Node tests for toolbox K3 (assets/learn/k03-discounting.js): the formulas agree with lesson 7's
// (assets/learn/07-cost.js: crf, pv, realRate, lcoe) and lesson 13's (assets/learn/13-capstone.js: crf, costs), the inputs
// agree between 07-cost.json and 13-capstone.json, the identities hold (CRF × annuity factor = 1, the two CRF forms, r = 0),
// the drill's answers are right, and every number the page states matches the model (a whitelist scan of the page's
// visible text, plus the statements one by one). The no-JS tables must equal staticBlocks().
// Usage (from the site folder):  node _tests/learn/test_k03-discounting.js [--write]   (--write rewrites the no-JS tables)
"use strict";
const fs = require("fs");
const path = require("path");
const SITE = path.resolve(__dirname, "..", "..");
const K = require(path.join(SITE, "assets/learn/k03-discounting.js"));
const L7 = require(path.join(SITE, "assets/learn/07-cost.js"));
const L13 = require(path.join(SITE, "assets/learn/13-capstone.js"));
const D7 = JSON.parse(fs.readFileSync(path.join(SITE, "assets/learn/data/07-cost.json"), "utf8"));
const D13 = JSON.parse(fs.readFileSync(path.join(SITE, "assets/learn/data/13-capstone.json"), "utf8"));
const QPATH = path.join(SITE, "learn/k03-discounting.qmd");
const s = K.story(D7, D13), B = K.staticBlocks(s);
const BLOCKS = { "k3-money": "money", "k3-crf": "crf" };
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
const JS = fs.readFileSync(path.join(SITE, "assets/learn/k03-discounting.js"), "utf8");

let checks = 0, fails = 0;
function ok(cond, msg) { checks++; if (!cond) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 1e-9 : tol);
const has = (str, msg) => ok(QMD.indexOf(str) >= 0, "page states " + (msg || JSON.stringify(str)) + ": " + JSON.stringify(str));
const usd = K.usd, f4 = K.f4;

// ---------------- inputs: lessons 7 and 13 use the same wind farm, rate and life
{
  const w7 = D7.techs.wind, w13 = D13.techs.wind;
  ok(w7.capex === 1712 && w13.capex === w7.capex && w7.fom === 34.57 && w13.fom === w7.fom, "inputs: wind $1,712/kW and $34.57/kW-yr in both data files");
  ok(D7.finance.wacc === 4 && D13.finance.wacc === 4 && D7.finance.life === 30 && D13.finance.life === 30, "inputs: 4% real and 30 years in both data files");
  ok(D13.techs.battery.life === 15 && s.batteryLife === 15, "inputs: lesson 13's battery is paid off over 15 years");
  const dc = D7.discount;
  ok(dc.amount === 100 && dc.years.join() === "0,10,20,30" && dc.rate === 7 && dc.rateMax === 12, "inputs: lesson 7's discount step: $100, years 0/10/20/30, 7%, slider to 12%");
  ok(/data-src="\.\.\/assets\/learn\/data\/07-cost\.json \.\.\/assets\/learn\/data\/13-capstone\.json"/.test(QMD) && /data\["07_cost"\]/.test(JS) && /data\["13_capstone"\]/.test(JS), "inputs: the page reads both lessons' data files");
}

// ---------------- formulas: the same as lessons 7 and 13
{
  let bad = 0;
  for (let ri = 0; ri <= 24; ri++) for (let n = 1; n <= 40; n++) {
    const r = ri / 200;
    if (!near(K.crf(r, n), L7.crf(r, n), 1e-12)) bad++;
    if (!near(K.crf13(r, n), L13.crf(r, n), 1e-12)) bad++;
    if (!near(K.crf(r, n), K.crf13(r, n), 1e-12)) bad++;
    if (!near(K.crf(r, n) * K.annuity(r, n), 1, 1e-12)) bad++;
    if (!near(K.annuity(r, n), K.annuitySum(r, n), 1e-9)) bad++;
    if (!near(K.pv(100, r, n), L7.pv(100, r, n), 1e-12) || !near(K.fv(K.pv(100, r, n), r, n), 100, 1e-9)) bad++;
  }
  ok(bad === 0, `formulas: crf, pv and the annuity factor agree with lessons 7 and 13 and with each other on 1,000 cases (${bad} bad)`);
  ok(K.crf(0, 30) === 1 / 30 && L7.crf(0, 30) === 1 / 30 && L13.crf(0, 30) === 1 / 30 && K.annuity(0, 30) === 30, "formulas: r = 0 gives 1/n");
  ["wind", "solar", "cc", "pk"].forEach(k => {
    const t = D13.techs[k], y = K.yearly(t.capex, t.fom, D13.finance.wacc / 100, t.life || D13.finance.life);
    ok(near(y.perMW, L13.costs(D13).techs[k].fixed, 1e-6), `formulas: ${k} per MW a year equals lesson 13's costs() (${y.perMW.toFixed(2)})`);
  });
  ok(near(s.wind.total, L7.lcoe(L7.inputs(D7, "wind")).annual, 1e-9), "formulas: the wind farm's yearly cost equals lesson 7's lcoe().annual");
  ok(near(K.realRate(0.07, 0.025), L7.realRate(0.07, 0.025), 1e-15) && near(s.blendReal * 100, L7.blend(D7.finance, D7.finance.debtShare).real, 1e-9), "formulas: real rate as lesson 7's realRate and blend()");
  ok(near(K.doubling(0.07), Math.log(2) / Math.log(1.07)) && K.firstYearAt(100, 0.07, 200) === 11 && K.fv(100, 0.07, 10) < 200, "formulas: $100 at 7% doubles after 10.2 years, so first passes $200 in year 11");
}

// ---------------- the story numbers
{
  ok(usd(s.grow10) === "$196.72" && usd(s.simple10) === "$170.00" && usd(s.atFirstDouble) === "$210.49" && s.firstDouble === 11, "story: growth at 7%");
  ok(s.rule70 === 10 && s.doubling.toFixed(1) === "10.2" && s.simpleDouble === 15, "story: rule of 70 gives 10, exact 10.2, simple interest 15 years");
  ok(s.pv7.map(v => usd(v)).join() === "$100.00,$50.83,$25.84,$13.14", "story: lesson 7's present values at 7%: " + s.pv7.map(v => usd(v)).join());
  ok(s.pv4.map(v => usd(v)).join() === "$100.00,$67.56,$45.64,$30.83", "story: present values at 4%");
  ok(usd(s.af) === "$17.29" && usd(s.lastDollar) === "$0.31" && Math.round(s.af) === 17 && Math.round(s.life * s.lastDollar) === 9, "story: annuity factor 17.29; the last dollar $0.31; the step-4 guesses $30, $17, $9");
  ok(usd(s.payment) === "$99.01" && K.f5(s.crf) === "0.05783" && f4(s.crf) === "0.0578" && usd(s.paidTotal, 0) === "$2,970" && usd(s.returnPaid, 0) === "$1,258", "story: CRF 0.05783, $99.01 a year, $2,970 paid, $1,258 return");
  ok(usd(s.wind.total) === "$133.58" && usd(s.wind.perMW, 0) === "$133,575" && usd(s.wind0.total) === "$91.64" && usd(s.wind0.capital) === "$57.07", "story: yearly costs at 4% and 0%");
  ok(f4(s.wind7.crf) === "0.0806" && usd(s.wind7.total) === "$172.53" && K.pct(s.capShare) === "74%" && f4(s.crfBattery) === "0.0899", "story: 7%, capital share and the battery's factor");
  ok(usd(s.half.pvLo) === "$35.63" && usd(s.half.pvHi) === "$13.14" && K.pct(s.half.cut) === "63%", "story: the myth, 3.5% to 7%");
  ok(usd(s.quiz.pv20) === "$25.84" && usd(s.quiz.simple20) === "$41.67" && usd(s.quiz.grow20) === "$386.97", "story: the quiz's options");
  ok((s.blendReal * 100).toFixed(2) === "4.39" && K.pct(s.blendNominal) === "7%", "story: lesson 7's blend, 7% nominal, 4.39% real");
}

// ---------------- the page: statements one by one
{
  has("$100 at 7% a year, interest left in, is $196.72 after 10 years and first passes $200 in year 11 ($210.49)");
  has("Simple interest gives $170.00 after 10 years");
  has("$100 ÷ 1.07¹⁰ = $50.83 today");
  has("from 7% to 4%, $100 in 30 years rises from $13.14 to $30.83 today");
  has("$1 a year for 30 years at 4% is worth $17.29 today, not $30");
  has("1 ÷ 17.29 = 0.05783: the wind farm's $1,712 per kW becomes $99.01 a year for 30 years");
  has("Add upkeep of $34.57: the yearly cost is $133.58 per kW, or $133,575 per MW. At 0% the factor is 1 ÷ 30 = 0.0333.");
  has("the sum of the discounted dollars, 17.29 at 4% over 30 years");
  has("the share of a building cost repaid each year, 0.0578 at 4% over 30 years");
  has("$133.58 per kW a year for the wind farm");
  has("The fraction is the [annuity factor]{.lx-term term=\"annuity-factor\"}: 17.29 at 4% over 30 years");
  has("7% nominal with 2.5% inflation, is 4.39% real");
  has("one MW of wind adds \\$133,575 a year");
  has("30 years for plants, 15 for lesson 13's battery");
  has("At 4% the yearly share is 0.0578, not 0.0333");
  has("From 3.5% to 7% it falls from $35.63 to $13.14, by 63%");
  has("$25.84: 100 ÷ 1.07²⁰. $41.67 divides by 1 + 20 × 0.07 (simple interest); $386.97 grows the $100 forward instead.");
  has("0.0333 is 1 ÷ 30, the 0% case; 0.0400 pays the return but never the cost; 0.0806 is the factor at 7%.");
  has("10 years at 7%"); has("0.0578 × $1,712 + $34.57");
  // the quiz answers point at the right options
  ok(/data-id="pv20" data-answer="c"[\s\S]{0,200}<li data-value="c">\$25\.84<\/li>/.test(QMD), "quiz: pv20's answer c is $25.84");
  ok(/data-id="crf" data-answer="c"[\s\S]{0,200}<li data-value="c">0\.0578<\/li>/.test(QMD), "quiz: crf's answer c is 0.0578");
  // the no-JS tables are the model's
  Object.keys(BLOCKS).forEach(name => {
    const [ra, end] = blockRe(name), a = QMD.match(ra), b = QMD.indexOf(end);
    ok(a && b > a.index && QMD.slice(a.index + a[0].length, b).trim() === B[BLOCKS[name]].trim(), `page: the ${name} table equals staticBlocks() (run with --write)`);
  });
  // sources and links: the lessons that need this, and dated primary sources
  ["07-cost.html", "12-trade-offs.html", "13-capstone.html"].forEach(h => ok(QMD.indexOf('href="' + h + '"') >= 0 || QMD.indexOf("](" + h + ")") >= 0, "links back to " + h));
  ok(/EMM_Assumptions\.pdf">EIA, AEO2026 assumptions, Table 3<\/a> \(2025 dollars, April 2026\)/.test(QMD) && /financial_cases_&amp;_methods">NLR, 2025 ATB<\/a> · September 2026/.test(QMD), "sources: EIA and NLR with their dates");
  ok(/\$100 and 7% are illustrative/.test(QMD), "the illustrative values are labelled");
  ok(!/href="[^"]*(a01|m11|m13)/i.test(QMD) && /A1 and Modeler lesson M11 \(both upcoming\)/.test(QMD) && /M13, upcoming/.test(QMD), "upcoming lessons are named, not linked");
  ok(!/nuclear|reactor|\bSMR\b|learning|data cent/i.test(QMD.replace(/<!-- learn:meta:start[\s\S]*?learn:meta:end -->/, "")) && !/nuclear|reactor|learning|data cent/i.test(JS.replace(/\/\/.*$/gm, "")), "scope: no nuclear, no learning wording, no data centers");
}

// ---------------- every number in the page's visible text is one the model produces (whitelist scan)
{
  let body = QMD.replace(/^---[\s\S]*?\n---\n/, "").replace(/<!-- learn:(meta|next|footer):start[\s\S]*?learn:\1:end -->/g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/<style>[\s\S]*?<\/style>/g, "")
    .replace(/<script[\s\S]*?<\/script>/g, "").replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<[^>]+>/g, " ").replace(/\]\([^)]*\)/g, "]")
    .replace(/\{[^}]*\}/g, " ").replace(/https?:\/\/\S+/g, " ");
  const allowed = new Set();
  const add = v => allowed.add(String(v));
  const money = v => [usd(v), usd(v, 0)].forEach(t => add(t.replace(/^[−$]+/, "").replace(/^\$/, "")));
  [s.amount, 2 * s.amount, s.grow10, s.simple10, s.atFirstDouble, s.capex, s.fom, s.payment, s.paidTotal, s.returnPaid, s.wind.total, s.wind.perMW,
   s.wind0.total, s.wind0.capital, s.wind7.total, s.wind7.capital, s.half.pvLo, s.half.pvHi, s.quiz.pv20, s.quiz.simple20, s.quiz.grow20, s.af]
    .concat(s.pv7, s.pv4, s.years.map(t => K.fv(s.amount, s.rate, t))).forEach(money);
  [s.crf, s.wind0.crf, s.wind7.crf, s.crfBattery, 0.04].forEach(v => add(f4(v)));
  add(K.f5(s.crf)); add(s.af.toFixed(2)); add((1 + s.rate).toFixed(2)); add(s.rate.toFixed(2));
  add((s.blendReal * 100).toFixed(2)); add(D7.finance.inflation); add((s.half.lo * 100).toFixed(1)); money(s.amount / 2); add(Math.round(s.half.cut * 100));
  // structural numbers: rates and years of the story, lesson numbers, years and dates, step counts, the 1,000 kW per MW
  [0, 1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 15, 17, 20, 30, 70, 2024, 2025, 2026, "1,000", "2.5"].forEach(add);
  const found = (body.match(/\d[\d,]*(?:\.\d+)?/g) || []).map(t => t.replace(/[.,]$/, ""));
  const unknown = [...new Set(found.filter(t => !allowed.has(t)))];
  ok(unknown.length === 0, "every number on the page is from the model or a structural count; unknown: " + unknown.join(" "));
  ok(found.length > 80, `the scan saw the page's numbers (${found.length})`);
}

// ---------------- the interactive: the actions Next waits for, the live regions, the demo hook
{
  ok(/if \(c >= 2 \* s\.amount\)/.test(JS) && /close\(v, \+want\.toFixed\(2\), 0\.015\)/.test(JS) && /Math\.abs\(r - s\.plantRate\) < 1e-9/.test(JS) && /close\(v, s\.payment, 0\.5\)/.test(JS) && /if \(r === 0 && !zero\)/.test(JS), "steps: each card's action is checked before Next opens");
  ok((JS.match(/"aria-live": "polite"/g) || []).length >= 4, "steps: results are announced in live regions");
  ok(/LX\.demo\(root,/.test(JS) && /state === "mid" \? 2/.test(JS) && /state === "done"/.test(JS) && /autos\[5\]/.test(JS), "demo: mid, step-N and done states");
  ok(/LX\.store\.set\("k3-own"/.test(JS) && /LX\.store\.get\("k3-own"\)/.test(JS), "explain: the equation card reads the reader's own numbers");
  ok(/LX\.EquationCard\(/.test(JS) && /LX\.CompareTable\(/.test(JS) && /LX\.CausalChain\(/.test(JS), "explain: equation card, comparison table and causal chain");
  ok(/qp\.focus\(\)/.test(JS), "drill: the next item takes focus");
}

// ---------------- drill items
{
  const items = K.drill(42, 600), counts = {};
  items.forEach((it, i) => {
    counts[it.kind] = (counts[it.kind] || 0) + 1;
    if (it.kind === "grow") { const m = /^\$([\d,]+) grows at (\d+)% a year for (\d+) years/.exec(it.q); ok(m && it.answer === Math.round(+m[1].replace(/,/g, "") * Math.pow(1 + m[2] / 100, +m[3])), `drill ${i}: grow`); }
    if (it.kind === "discount") { const m = /worth \$?/.test(it.q) && /^What is \$([\d,]+) paid in (\d+) years worth today at (\d+)%/.exec(it.q); ok(m && it.answer === Math.round(+m[1].replace(/,/g, "") / Math.pow(1 + m[3] / 100, +m[2])), `drill ${i}: discount`); }
    if (it.kind === "double") { const m = /^At ([\d.]+)% a year/.exec(it.q); ok(m && it.choices[it.answer] === "about " + Math.round(70 / +m[1]) + " years" && new Set(it.choices).size === it.choices.length && it.choices.length >= 3, `drill ${i}: double`); }
    if (it.kind === "crf") { const m = /at (\d+)% over (\d+) years/.exec(it.q), c = L7.crf(+m[1] / 100, +m[2]); ok(near(it.answer, c, 0.00005) && K.close(+c.toFixed(4), it.answer, it.tol), `drill ${i}: crf`); }
    if (it.kind === "yearly") { const m = /costs \$([\d,]+) per kW to build and \$(\d+) per kW a year to keep up\. With CRF = ([\d.]+)/.exec(it.q); ok(m && it.answer === Math.round(+m[3] * +m[1].replace(/,/g, "") + +m[2]), `drill ${i}: yearly`); }
    if (it.kind === "compare") {
      const m = /At (\d+)% a year, which is worth more today: \$(\d+) now, or \$(\d+) in (\d+) years/.exec(it.q), v = +m[3] / Math.pow(1 + m[1] / 100, +m[4]);
      ok(m && (it.answer === 1) === (v > +m[2]) && Math.abs(v - +m[2]) >= 3, `drill ${i}: compare (margin ${Math.abs(v - +m[2]).toFixed(1)})`);
    }
    if (!it.choices) ok(K.close(it.answer, it.answer, it.tol) && !K.close(it.answer + 2.5 * Math.max(it.tol, 0.0002), it.answer, it.tol), `drill ${i}: tolerance`);
  });
  ok(Object.keys(counts).length === 6, "drill: all six kinds appear: " + JSON.stringify(counts));
  const a = K.drill(7, 12).map(x => x.q).join("|"), b = K.drill(7, 12).map(x => x.q).join("|");
  ok(a === b, "drill: a seed replays the same items");
}

console.log(`k03-discounting: ${checks - fails} of ${checks} checks passed`);
process.exit(fails ? 1 : 0);
