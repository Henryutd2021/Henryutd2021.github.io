// test_x05-project-finance.js — Node tests for side topic X5 (assets/learn/x05-project-finance.js, its data file and the
// page learn/x05-project-finance.qmd):
//   - the project is read from the other lessons' data (07-cost, 13-capstone, a02-contracts-risk, a01-project-tea,
//     town), never retyped: the lesson's data file and script hold none of those numbers; the page loads them through
//     x05-inputs.json, the finance-only projection this test writes (--write) and checks against those files
//   - cost, revenue, operating costs, cash available for debt service, the loan payment and the lender's loan
//     recomputed here from first principles; the largest whole-$M loan proved (at or above the coverage, the next one
//     below); the bad year recomputed; every verdict true over the whole slider range
//   - bounds: the sponsor's share stays above zero for every setting of the four sliders; nothing negative that cannot be
//   - the Go deeper arithmetic as displayed: each shown number follows from the shown numbers before it
//   - the no-JS block, ideas, stop box, Go deeper, check, facts and sources equal what the model writes (--write)
//   - scope (contract examples use wind, solar, storage and gas only): contracts and offtake are wind and storage only;
//     no nuclear, coal or hydrogen term; no "AI"; links on the allow-list; the 2023-dollar market values converted with the stated deflator
//   - text budget of the step cards, reveals and the page's prose
// Usage (from the site folder):  node _tests/learn/test_x05-project-finance.js [--write]
"use strict";
const fs = require("fs");
const path = require("path");
const ID = "x05-project-finance";
const SITE = path.resolve(__dirname, "..", "..");
const L_ = p => path.join(SITE, "assets/learn", p);
const M = require(L_(ID + ".js"));
const S = require("./shelf_stop.js");
const RAW = fs.readFileSync(L_("data/" + ID + ".json"), "utf8");
const X = JSON.parse(RAW);
const d = f => JSON.parse(fs.readFileSync(L_("data/" + f + ".json"), "utf8"));
const I = { X: X, C7: d("07-cost"), C13: d("13-capstone"), A2: d("a02-contracts-risk"), A1: d("a01-project-tea"), T: d("town") };
const JS = fs.readFileSync(L_(ID + ".js"), "utf8");
const CODE = JS.replace(/\/\/[^\n]*/g, "");
const SIDE = fs.readFileSync(path.join(SITE, "learn/_w1/" + ID + ".yml"), "utf8");
const QPATH = path.join(SITE, "learn", ID + ".qmd");
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const plain = S.plain, nWords = S.nWords, nSent = S.nSent;
// the finance-only projection the page loads (the page does not load lesson 13's whole file)
const PJ_PATH = L_("data/x05-inputs.json");
const PJ = Object.assign({ about: "The inputs side topic X5 reads, taken from 07-cost.json, 13-capstone.json, a02-contracts-risk.json, a01-project-tea.json and town.json (only the fields and sources it uses). Those files hold the sources and dates." }, M.projectInputs(I));
const PJ_TEXT = JSON.stringify(PJ, null, 1) + "\n";
if (process.argv.includes("--write")) { fs.writeFileSync(PJ_PATH, PJ_TEXT); console.log("written: assets/learn/data/x05-inputs.json"); }
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-6 : t);
const P = M.project(I), L = X.lender;

// ---------------- the generated blocks
const BLOCKS = { "x05-fallback": () => M.staticFallback(P, L, X), "x05-ideas": () => M.ideasHTML(P, L, X), "x05-stop": () => S.stopHTML(X.stop, "x05"),
  "x05-deeper": () => M.deeperHTML(P, L), "x05-check": () => M.checkHTML(P, L), "x05-facts": () => M.factsHTML(X), "x05-sources": () => M.sourcesHTML(I) };
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
ok(fs.existsSync(PJ_PATH) && fs.readFileSync(PJ_PATH, "utf8") === PJ_TEXT, "x05-inputs.json equals the projection of the five lessons' files (run with --write)");
{ const Pp = M.project(M.inputs({ x05_project_finance: X, x05_inputs: JSON.parse(fs.readFileSync(PJ_PATH, "utf8")) })), Pf = M.project(I);
  ok(Object.keys(Pf).every(k => Pp[k] === Pf[k]), "the project from the projection equals the project from the full files"); }
{ const src = (PAGE.match(/data-learn="x05" data-src="([^"]+)"/) || [])[1] || "";
  ok(src === "../assets/learn/data/x05-project-finance.json ../assets/learn/data/x05-inputs.json ../assets/learn/data/path.json", "the page loads only its own data, the projection and the course map (" + src + ")"); }
Object.keys(BLOCKS).forEach(k => { const r = between(PAGE, k); ok(PAGE.slice(r.from, r.to) === BLOCKS[k]() + "\n", k + " block is up to date (run with --write)"); });
const OWN = PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?<!-- learn:\1:end -->/g, "");

// ---------------- read, never retyped
ok(!/capex|fom|"cf"|powerCapex|energyCapex|"price"\s*:/.test(RAW), "the lesson's data file holds no cost, upkeep, capacity factor or price of its own");
["1712", "1,712", "34.57", "33.8", "381.79", "247.34", "0.04", "42.5", "\\b150\\b", "\\b365\\b"].forEach(n => ok(!new RegExp(n).test(CODE), "the script does not retype " + n));
ok(/I\.T\.fleet\.wind\.mw/.test(CODE) && /I\.C7\.techs\.wind/.test(CODE) && /I\.C13\.techs\.battery/.test(CODE) && /I\.A2\.plant/.test(CODE) && /I\.A1\.price/.test(CODE), "every project number is read from its lesson's data file");
ok(I.C13.techs.battery.source && I.C13.techs.battery.source.dollarYear === 2024 && /2025 dollars/.test(I.C13.techs.battery.note), "the battery's cost is lesson 13's, already converted to 2025 dollars");

// ---------------- first principles
const w = I.C7.techs.wind, b = I.C13.techs.battery, pl = I.A2.plant, sp = I.A2.sim.spread;
const capex = 150 * 1000 * w.capex + 50 * 1000 * b.powerCapex + 200 * 1000 * b.energyCapex;
ok(I.T.fleet.wind.mw === 150 && pl.batteryMW === 50 && pl.batteryHours === 4 && near(P.capex, capex) && near(P.capex, 325357500, 1), "cost: 150 MW of wind and a 50 MW, 200 MWh battery = $325,357,500");
const windMWh = 150 * 8760 * w.cf / 100, margin = sp.median * Math.exp(sp.sigma ** 2 / 2), batRev = 200 * pl.cyclesPerYear * margin;
ok(near(P.windRev, windMWh * I.A1.price) && near(P.batRev, batRev) && near(P.rev, windMWh * I.A1.price + batRev), "revenue: wind MWh × price + battery MWh discharged × expected margin");
ok(near(P.toll * 50000, batRev) && near(P.toll, 62.09, 0.01), "the battery's toll is A2's fair toll, $62.09 per kW-year");
const opex = 150000 * w.fom + b.fomShare * (50000 * b.powerCapex + 200000 * b.energyCapex);
ok(near(P.opex, opex) && near(P.cf, P.rev - opex), "operating costs and the cash available for debt service");
const r = L.rate / 100, A = (1 - Math.pow(1 + r, -L.term)) / r;
ok(near(1 / M.payRate(L), A, 1e-9), "the payment per dollar of loan is the level-payment factor");
// a level payment repays the loan: simulate the balance year by year
{ let bal = 1e8; const pay = M.payment(L, 1e8); for (let y = 0; y < L.term; y++) bal = bal * (1 + r) - pay; ok(Math.abs(bal) < 1, "a level payment for " + L.term + " years at " + L.rate + "% repays the loan exactly"); }
const D1 = M.debtMax(P, L, 1), D0 = M.debtMax(P, L, 0);
ok(near(D1, P.cf * A / L.dscrContract, 1e-3) && near(D0, P.cf * A / L.dscrMerchant, 1e-3), "fully contracted and fully merchant loans recomputed");
ok(near(M.dscr(P.cf, D1, L), L.dscrContract, 1e-9) && near(M.dscr(P.cf, D0, L), L.dscrMerchant, 1e-9), "each sized loan sits exactly at its coverage");
const T_ = M.largestLoanM(P, L);
ok(M.dscr(P.cf, T_ * 1e6, L) >= L.dscrContract && M.dscr(P.cf, (T_ + 1) * 1e6, L) < L.dscrContract && T_ === 125, "the largest whole-$M loan is $125M: at or above 1.30, and $126M below");
for (let v = X.loan.range[0]; v <= X.loan.range[1]; v += X.loan.step) {
  const t = M.loanVerdict(P, L, v), dd = M.dscr(P.cf, v * 1e6, L);
  if (v === 0) ok(/No loan yet/.test(t), "loan 0: no loan");
  else ok(dd >= L.dscrContract ? /would lend/.test(t) : /would not lend/.test(t), "loan $" + v + "M: the verdict matches its coverage " + dd.toFixed(3));
}
ok(/= \*\*1\.308\*\*/.test(M.cashLine(P, L, 125)) && /= \*\*1\.297\*\*/.test(M.cashLine(P, L, 126)), "step 3 shows coverage to three decimals, so 1.297 never reads as 1.30");
// the bad year, recomputed
const B = X.bad;
for (let s = 0; s <= 1.0001; s += 0.1) {
  const sc = Math.round(s * 10) / 10, cfBad = sc * (P.windRev * B.outputFactor + P.batRev) + (1 - sc) * (P.windRev * B.outputFactor * B.priceFactor + P.batRev * B.priceFactor) - P.opex;
  ok(near(M.yearCF(P, sc, B), cfBad, 1e-3), "bad-year cash at " + sc * 100 + "% contracted");
  const D = M.debtMax(P, L, sc), line = M.badLine(P, L, sc, X), pay = M.payment(L, D);
  ok(cfBad >= pay ? /the loan is paid/.test(line) : /the loan is short by/.test(line), "the bad-year verdict is true at " + sc * 100 + "% contracted");
  ok(M.contractLine(P, L, sc, X).indexOf(M.M(D)) >= 0, "the contract line shows the loan at " + sc * 100 + "%");
}
ok(near(M.dscr(M.yearCF(P, 1, B), D1, L), 1.134, 0.001) && near(M.dscr(M.yearCF(P, 0, B), D0, L), 0.682, 0.001), "bad-year coverage: 1.13 fully contracted, 0.68 fully merchant");
ok(/1\.13 times/.test(M.contractSaw(P, L, X)) && /0\.68 times/.test(M.contractSaw(P, L, X)), "step 4's reveal states both bad-year coverages");
// bounds: the sponsor's share for every slider setting
let minSp = 1;
for (let s = 0; s <= 100; s += X.contract.step) for (let te = 0; te <= X.taxEquity.range[1]; te += X.taxEquity.step) for (let g = 0; g <= X.grant.range[1]; g += X.grant.step) {
  const St = M.stack(P, L, s / 100, te / 100, g / 100);
  minSp = Math.min(minSp, St.share.sponsor);
  if (!near(St.debt + St.te + St.grant + St.sponsor, P.capex, 1e-3)) ok(false, "the stack adds up at " + [s, te, g].join("/"));
}
ok(minSp > 0.01, "the sponsor's share stays above zero for every setting (lowest " + (100 * minSp).toFixed(1) + "%)");
ok(X.contract.range[0] >= 0 && X.contract.range[1] <= 100 && X.taxEquity.range[0] >= 0 && X.grant.range[0] >= 0 && X.loan.range[0] >= 0, "every slider is bounded at zero or above");
ok(X.taxEquity.range[1] === 50, "tax equity up to 50%: NREL (2017) reports 30%-50% where credits applied");
// Go deeper arithmetic as displayed
{ const z = M.sizing(P, L); ok(near(Math.round(z.cfM / L.dscrContract * 1000) / 1000, z.payC, 1e-9) && near(Math.round(z.cfM / L.dscrMerchant * 1000) / 1000, z.payM, 1e-9) && near(Math.round(z.payC * A * 100) / 100, z.c, 1e-9) && near(Math.round(z.payM * A * 100) / 100, z.m, 1e-9), "the Go deeper chain follows from its own displayed numbers");
  ok(near(z.c, D1 / 1e6, 0.006) && near(z.m, D0 / 1e6, 0.006), "the Go deeper results agree with the model ($" + z.c + "M, $" + z.m + "M)"); }
// the quiz's numbers
{ const pay = M.payment(L, D1), html = M.checkHTML(P, L); ok(html.indexOf("About " + M.x2(P.cf / pay)) > 0 && html.indexOf("About " + M.x2(pay / P.cf)) > 0 && near(P.cf / pay, 1.3, 1e-9), "the quick question's answer is the ratio, 1.30, and its trap is the inverse"); }
// facts: the deflated market values
{ const f = X.facts.filter(x => x.dollars)[0], k = X.deflator.index["2025"] / X.deflator.index["2023"];
  ok(near(k, 128.893 / 122.451) && M.factsHTML(X).indexOf("About $" + Math.round(13 * k) + " to $" + Math.round(60 * k) + "/MWh in 2025 dollars") > 0 && f.dollars.year === 2023, "LBNL's 2023-dollar values converted with BEA's deflator ($14 and $63)"); }
const TXT = k => X.sources[k].cite + ": " + X.sources[k].used.join(" ");
ok(/1\.375/.test(TXT("atb2025-fin")) && /1\.275/.test(TXT("atb2025-fin")) && /2\.0 batteries/.test(TXT("atb2025-fin")) && L.dscrContract >= 1.275 && L.dscrMerchant <= 2.0, "the lender's coverages sit inside the ATB's 1.275-2.0 range");
ok(/term-debt interest rate of 6\.5%/.test(TXT("atb2025-fin")) && L.rate === 6.5, "the loan rate is the ATB's term-debt rate");

// ---------------- the details, one by one
// one payment structure, stated and followed everywhere: project-level debt before both equity investors
ok(/project-level debt, paid before either equity investor/.test(X.structure) && /Other deal structures/.test(X.structure), "the structure is stated: project-level debt, paid before either equity investor");
ok((JS.match(/text: X\.structure/g) || []).length === 2 && M.staticFallback(P, L, X).indexOf(X.structure) > 0, "the structure is shown at the layers, at the tax-equity step and without JavaScript");
ok(!/tax equity takes a share of the cash first|loan would be smaller|tax equity was paid ahead/i.test(JS + PAGE + RAW), "no note that pays tax equity before the loan");
ok(/^After the loan and ahead of the sponsor/.test(X.layers.filter(l => l.key === "te")[0].paid) && /^First, right after operating costs/.test(X.layers.filter(l => l.key === "debt")[0].paid), "the layer cards follow the structure");
{ const deep = PAGE.slice(PAGE.indexOf('<div class="lx-deepers">'), PAGE.indexOf("::: {#check")); ok(!/partnership flip|back-leverage|refinanc|P50|P99/i.test(deep), "the Go deeper boxes teach no deal structuring (D1): limitations and reading only");
  ok(!/\(1 \+ r\)|A = /.test(deep) && (deep.match(/class="x5-eq"/g) || []).length === 1 && /a01-project-tea\.html/.test(deep), "the sizing box: words, one symbolic line, a link to A1 for the annuity"); }
ok(/nominal/.test(L.rateNote) && /no inflation/.test(L.rateNote) && /nominal rate is used as it is/.test(JS) && /no inflation/.test(M.staticFallback(P, L, X)), "the 6.5% is the ATB's nominal rate, used as the toy's chosen rate with no inflation, said on the page");
// the explain layer follows the reader's settings
ok((JS.match(/refreshExplain\(\);\n\s*\}/g) || []).length === 2 && /function refreshExplain\(\)/.test(JS) && /text: explainLede\(st\)/.test(JS), "steps 4 and 5 refresh the explain layer on every change, read from the reader's state");
ok(M.explainLede({ s: 0, te: 0.3, g: 0.02 }) === "0% sold under contract, 30% tax equity, a 2% grant; 2025 dollars, illustrative.", "the explain line names the reader's own settings");
// the cash ledger: battery earnings already net of charging
{ const R = M.ledgerRows(P); ok(near(R[0][2] + R[1][2] + R[2][2], R[3][2]) && near(R[3][2], P.cf) && R[1][0] === "Battery earnings after charging" && R[2][0] === "Remaining operating costs", "the ledger: wind sales + battery earnings after charging − remaining operating costs = cash for debt service");
  ok(/after paying for its charging and losses/.test(I.A2.sim.spread.note) && /"Wind sales \+ battery earnings after charging"/.test(JS) && !/"Revenue, typical year"/.test(JS), "the readout says the battery's earnings are after charging (A2's margin)");
  ok(M.staticFallback(P, L, X).indexOf(M.ledgerHTML(P)) > 0, "the ledger is in the no-JS block too"); }
ok(/^Estimated regional wholesale market value/.test(X.facts.filter(f => f.dollars)[0].what) && !/what merchant wind earned/.test(RAW), "LBNL's figures are estimated market values, not a project's receipts");
X.layers.forEach(l => ok(!/\b(collateral|covenants|principal|depreciation)\b/.test(l.who + l.gets + l.paid) || /\((the principal|collateral|covenants|depreciation)\)/.test(l.gets + l.paid), l.key + ": finance words explained where they appear"));
ok(/\(the principal\)/.test(RAW) && /\(collateral\)/.test(RAW) && /\(covenants\)/.test(RAW) && /\(depreciation\)/.test(RAW), "principal, collateral, covenants and depreciation each explained in plain words");
{ const fb = M.staticFallback(P, L, X); X.layers.forEach(l => ok([l.label, l.who, l.gets, l.paid].every(t => fb.indexOf(t.replace(/&/g, "&amp;")) >= 0), l.key + ": the no-JS block has the layer's who, gets and paid")); }
ok(/Heights approximate/.test(M.SCALED_CAP) && !/caption: "The capital stack, to scale"|caption: "To scale/.test(JS), "a scaled stack says its heights are approximate (minimum heights), not 'to scale'");
Object.keys(X.sources).forEach(k => { const s = X.sources[k]; ok(s.cite && Array.isArray(s.used) && s.used.length >= 1 && nWords(s.cite) <= 30, k + ": a citation of " + nWords(s.cite) + " words and the claims it supports");
  s.used.forEach(u => ok(nWords(u) <= 30, k + ": a 'supports' line of " + nWords(u) + " words")); });
// every file the page loads: no nuclear term in X5's own data or the projection; in the course map, no sentence that
// joins a nuclear term to one of the scope scan's risk terms (every asset X5 loads is scanned)
{ const NUC = /nuclear|reactor|\bSMR\b|small modular/i, RISK = /cost|learning|commerciali|subsid|credit|threshold|break[- ]even|parity|siting|site selection|suitab|screen|deliver|timing|order|anchor|buyer|data[- ]cent/i;
  ok(!NUC.test(RAW + PJ_TEXT), "no nuclear term in X5's data or its projection");
  const strings = []; (function walk(o) { if (typeof o === "string") strings.push(o); else if (o && typeof o === "object") Object.values(o).forEach(walk); })(d("path"));
  let bad = 0; strings.forEach(t => plain(t).split(/(?<=[.?!;:])\s+/).forEach(x => { if (NUC.test(x) && RISK.test(x)) { bad++; console.log("  path.json: " + x.slice(0, 100)); } }));
  ok(bad === 0, "the course map X5 loads joins no nuclear term to a cost or risk term in any sentence"); }

// ---------------- the stop box, scope and links
ok(S.problems(X.stop).length === 0, "the stop box has its parts: " + S.problems(X.stop).join("; "));
const ALL = PAGE + "\n" + RAW + "\n" + JS + "\n" + SIDE;
ok(!/nuclear|reactor|\bSMR\b|small modular|\bcoal\b|hydrogen|data[- ]cent/i.test(ALL), "scope: contracts and offtake are wind and storage; no nuclear, coal, hydrogen or data-center term");
ok(!/\bAI\b|artificial intelligence/.test(ALL), "no 'AI'");
ok(!/projects\/|research\.html|smr-dc/.test(ALL), "no project page and no Research page");
ok(!/\b(should|must) (invest|buy)|recommend(ed)? (this|the) (project|investment)/i.test(ALL), "no investment advice");
const hrefs = [...OWN.matchAll(/href="([^"]+)"/g)].map(m => m[1].replace(/&amp;/g, "&")).concat(Object.values(X.sources).map(s => s.url));
ok(hrefs.every(h => S.linkOK(h) || /^[0-9a-z-]+\.html(#[a-z-]+)?$/.test(h) || /^#/.test(h)), "links on the allow-list (" + hrefs.filter(h => !(S.linkOK(h) || /^[0-9a-z-]+\.html/.test(h) || /^#/.test(h))).join(", ") + ")");
ok(/2025 dollars/.test(M.steps(P, L)[0]) && /2025 dollars/.test(PAGE) && /Illustrative/.test(PAGE), "the price year and 'illustrative' are stated on the page");
["A1", "A2", "A12", "M11"].forEach(c => ok(new RegExp('\\["' + c + '",').test(JS), c + " is named through LX.lessonRefHTML"));

// ---------------- text budget
const ST = M.steps(P, L);
ok(ST.length === 6, "six step cards");
ST.forEach((t, i) => { const n = nWords(t); ok(n >= 14 && n <= 40, "step " + (i + 1) + ": " + n + " words"); ok(nSent(t) <= 2, "step " + (i + 1) + ": " + nSent(t) + " sentences"); });
const lines = [M.costSaw(P), M.LAYER_SAW, M.loanSaw(P, L), M.contractSaw(P, L, X), M.stackSaw(P, L, 0.5, 0.3, 0.02), M.badLine(P, L, 1, X), M.badLine(P, L, 0, X), M.loanVerdict(P, L, 126), M.contractLine(P, L, 0.5, X)]
  .concat([X.contract.note, X.bad.note, X.taxEquity.note, X.grant.note, L.dscrNote, L.rateNote, L.termNote], Object.values(M.Q1.feedback), Object.values(X.risks.feedback), [].concat.apply([], X.layers.map(l => [l.who, l.gets, l.paid])));
lines.forEach(t => { ok(nWords(t) <= 40, "a reveal of " + nWords(t) + " words: " + plain(t).slice(0, 60)); ok(nSent(t) <= 3, "a reveal of " + nSent(t) + " sentences: " + plain(t).slice(0, 60)); });
const PROSE = OWN.replace(/^---[\s\S]*?\n---\n/, " ").replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<!--[\s\S]*?-->/g, " ");
PROSE.split(/<\/?(?:p|li|dd|dt|td|th|summary|br|caption|h3|h4)\b[^>]*>/).map(plain).filter(x => /[A-Za-z]/.test(x) && !/^[:{]/.test(x)).forEach(x => {
  const n = nWords(x); ok(n <= 42, "text element of " + n + " words: " + x.slice(0, 70)); ok(nSent(x) <= 3, "text element of " + nSent(x) + " sentences: " + x.slice(0, 70)); });

// ---------------- controls
ok(/aria-live/.test(JS) && (JS.match(/LX\.demo\(/g) || []).length === 1 && (JS.match(/demo\[\d\] = function/g) || []).length === 6, "live regions; a demo hook with an action for each of the six steps");
X.layers.forEach(l => ok(M.layerHTML(X, l.key).indexOf("<dt>Paid</dt>") > 0, l.key + ": the layer card has who, gets and paid"));
ok(/type: "button", class: "x5-layer"/.test(JS) && /aria-pressed/.test(JS), "the stack's layers are buttons with a pressed state");
ok(/Show me the largest loan/.test(JS) && /sl\.set\(target, true\)/.test(JS), "step 3's shortcut sets the reader's own slider");
["capital-stack", "cash-flow-available-for-debt-service", "debt-service-coverage-ratio", "tax-equity", "sponsor-equity"].forEach(t => ok(new RegExp("id: " + t + "\\b").test(SIDE), "the sidecar defines " + t));

console.log((fails ? "FAILED " + fails + " of " : "ok: ") + checks + " checks (" + ID + ")");
process.exit(fails ? 1 : 0);
