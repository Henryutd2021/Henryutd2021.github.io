// test_r07-cost-carbon-properly.js — Node tests for research studio R7 (assets/learn/r07-cost-carbon-properly.js, its
// data file and page).
//   - every number from first principles: the capital recovery factor at 3% over 12 years; each fleet's yearly cost line
//     by line; gallons and CO2 (EIA's 10.19 kg per gallon); the grid's 2023 factor (1.53 billion t / 4.18 trillion kWh);
//     the depot connection's annual equivalent; demand charges; the credit's second count ($6 million / 12)
//   - all 16 combinations of the four fixes: each fix's effect does not depend on the others (cost changes add up; the
//     boundary moves CO2 only; the baseline moves diesel only); the waterfall ends at the audited conclusion
//   - the conclusion changes sign: the study saves, the audit costs more; cost per tonne for the agency and for the agency
//     and the state together (the credit nets out as a transfer); the grid factor's three choices
//   - the no-JS blocks equal the model's (--write rewrites them); every number written on the page against the model
//   - research wording: the Real-world box quotes E6.4 and E6.6 (excerpt:ghg) word for word from the register; no other
//     sentence describes the course author's study; the fictional study is labelled fictional everywhere it appears
//   - scope: no nuclear term and no data center in the lesson's own files (G-SRC: not the author's studies); links on
//     allowed hosts; text budget (steps and every assembled line, for every input); glossary marks; path.yml
//   - the page on a stub document: every step's action, feedback for every option, the writing checks
// Usage (from the site folder):  node _tests/learn/test_r07-cost-carbon-properly.js [--write]
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ID = "r07-cost-carbon-properly";
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const M = require(L(ID + ".js"));
const EX = require(L("components/exemplars.js"));
const RB = require(L("components/rubric.js"));
const X = require("./excerpt_check.js");
const J = p => JSON.parse(fs.readFileSync(L("data/" + p), "utf8"));
const D = J(ID + ".json"), PATHJ = J("path.json");
const JS = fs.readFileSync(L(ID + ".js"), "utf8");
const QPATH = path.join(SITE, "learn", ID + ".qmd"), SIDEP = path.join(SITE, "learn/_w1", ID + ".yml");
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-6 : t);
const plain = t => String(t).replace(/\*\*/g, "").replace(/\[\[[^|]+\|([^\]]+)\]\]/g, "$1");
const sentences = t => plain(t).split(/(?<=[.?!])\s+(?=[A-Z0-9“"])/).filter(x => /[A-Za-z]/.test(x)).length;
const words = t => plain(t).trim().split(/\s+/).length;

// ---------------- the no-JS blocks
const BLOCKS = {
  "r07-task": () => M.staticTask(D),
  "r07-exemplars": () => EX.staticHTML(M.exemplarsSpec(D)) + "\n" + M.whoHTML(D) + "\n" + M.boundaryHTML(D) + "\n" + M.ladderHTML(D) + "\n" + M.ledgerHTML(D),
  "r07-rubric": () => RB.staticHTML(D.rubric.competences) + '\n<p class="lx-eyebrow">Cost and carbon, before you trust a result</p>\n<ul>'
    + D.checklist.map(c => "<li><b>" + M.rich(c.label) + ":</b> " + M.rich(c.text) + "</li>").join("") + "</ul>"
};
function between(text, key) {
  const a = text.match(new RegExp("<!-- " + key + ":start[^>]*-->\\n")), b = text.indexOf("<!-- " + key + ":end -->");
  return a && b > a.index ? { from: a.index + a[0].length, to: b } : null;
}
if (process.argv.includes("--write")) {
  let q = fs.readFileSync(QPATH, "utf8");
  Object.keys(BLOCKS).forEach(k => { const r = between(q, k); if (!r) throw new Error(k + " markers missing"); q = q.slice(0, r.from) + BLOCKS[k]() + "\n" + q.slice(r.to); });
  fs.writeFileSync(QPATH, q); console.log("wrote the no-JS blocks into " + QPATH);
}
const PAGE = fs.readFileSync(QPATH, "utf8"), SIDE = fs.existsSync(SIDEP) ? fs.readFileSync(SIDEP, "utf8") : "";
const onPage = (s, what) => ok(PAGE.includes(s), `page states ${what}: "${s}"`);
Object.keys(BLOCKS).forEach(k => { const r = between(PAGE, k); ok(r && PAGE.slice(r.from, r.to) === BLOCKS[k]() + "\n", k + ": the page's no-JS block equals the model's (run with --write after a data edit)"); });
ok(EX.validate(Object.assign({ lines: true }, M.exemplarsSpec(D))).length === 0, "the exemplars are well formed");

// ---------------- first principles
const I = D.inputs, N = I.buses, miles = N * I.milesPerBus, k = 0.03 / (1 - Math.pow(1.03, -12));
ok(near(M.crf(0.03, 12), k, 1e-15) && k.toFixed(4) === "0.1005" && M.crf(0, 12) === 1 / 12, "capital recovery factor: 3% over 12 years = 0.1005; at 0%, 1/12");
const grid = 1.53e9 / 4.18e12 * 1000;
ok(near(M.gridUS(D), grid, 1e-12) && grid.toFixed(3) === "0.366" && near(grid * 2204.62 / 1000, 0.81, 0.005), "EIA 2023: 1.53 billion t / 4.18 trillion kWh = 0.366 t per MWh (about 0.81 lb per kWh)");
const S0 = M.run(D, M.all(false)), A = M.run(D, M.all(true));
ok(near(S0.e.capital, (N * (1000000 + 60000) - N * 150000) * k) && near(S0.e.energy, miles * 2.2 * 0.09) && near(S0.e.maint, miles * 0.6) && near(S0.e.creditTwice, N * 150000 / 12) && S0.e.demand === 0 && S0.e.depot === 0,
  "the study's electric lines: buses and chargers net of the credit x CRF, 2.2 kWh per mile at $0.09, $0.60 per mile, the credit again as $500,000 a year");
ok(near(S0.d.capital, N * 560000 * k) && near(S0.d.gallons, miles / 3.5) && near(S0.d.fuel, miles / 3.5 * 3.6) && near(S0.d.maint, miles * 1.2), "the study's diesel lines: new buses' price, the 2009 buses' 3.5 mpg and $1.20 per mile");
ok(near(A.d.gallons, miles / 4.5) && near(A.d.maint, miles * 0.85) && near(A.e.demand, 1600 * 15 * 12) && near(A.e.depot, 1800000 * k) && A.e.creditTwice === 0, "audited lines: new diesel 4.5 mpg and $0.85 per mile; demand charges 1,600 kW x $15 x 12; depot $1.8 million x CRF; the credit once");
ok(near(S0.co2.d, miles / 3.5 * 10.19 / 1000) && S0.co2.e === 0 && near(A.co2.e, miles * 2.2 / 1000 * grid) && near(A.co2.d, miles / 4.5 * 10.19 / 1000), "CO₂: gallons x 10.19 kg; charging MWh x 0.366 t");
// the headline numbers
const F = M.facts(D);
ok(F.saving === "$1.15 million" && F.cutPct === "100%" && F.extra === "$0.65 million" && F.cut === "2,101 t" && F.cutPctA === "64%" && F.perTonne === "$309" && F.societyPerTonne === "$595" && F.society === "$1.25 million" && F.eCO2 === "1,160 t",
  "headline facts: the study saves $1.15 million and cuts 100%; audited, electric costs $0.65 million more, cuts 2,101 t (64%), about $309 per tonne ($595 for agency and state together)");
ok(S0.saving > 0 && A.saving < 0 && near(A.perTonne, -A.saving / A.co2.cut) && near(A.society, A.extra + N * 150000 * k), "the conclusion changes sign; society's extra cost adds back the state's credit (a transfer)");
// all 16 combinations: independence
const combos = [];
for (let i = 0; i < 16; i++) { const f = {}; M.FIX.forEach((key, j) => { f[key] = !!(i >> j & 1); }); combos.push(f); }
const base = M.run(D, M.all(false)), dSave = {}, dCO2 = {};
M.FIX.forEach(key => { const f = M.all(false); f[key] = true; const r = M.run(D, f); dSave[key] = r.saving - base.saving; dCO2[key] = r.co2.cut - base.co2.cut; });
ok(combos.every(f => { const r = M.run(D, f); return near(r.saving, base.saving + M.FIX.reduce((s, key) => s + (f[key] ? dSave[key] : 0), 0), 1e-6) && near(r.co2.e, f.boundary ? A.co2.e : 0) && near(r.co2.d, f.baseline ? A.co2.d : S0.co2.d); }),
  "all 16 combinations: cost changes add up whatever the order; the boundary moves electric CO₂ only, the baseline diesel only");
ok(dSave.boundary === 0 && dSave.baseline < 0 && dSave.grid < 0 && dSave.credit < 0 && dCO2.boundary < 0 && dCO2.grid === 0 && dCO2.credit === 0, "each fix moves what it should: the boundary CO₂ only; baseline, grid and credit the cost");
const W = M.waterfall(D);
ok(W.length === 5 && near(W[0].saving, S0.saving) && near(W[4].saving, A.saving) && near(W[3].saving, A.saving) && W.every((w, i) => i === 0 || w.saving <= W[i - 1].saving + 1e-9), "the waterfall: study, baseline, grid, credit, audited; every fix lowers the saving");
ok(W.map(w => (w.saving / 1e6).toFixed(2)).join(",") === "1.15,0.32,-0.15,-0.65,-0.65" && W[1].saving > 0 && W[2].saving < 0, "after the baseline fix electric still saves $0.32 million; the grid costs turn it negative");
// grid factor choices
const gUS = M.run(D, M.all(true), "us"), gC = M.run(D, M.all(true), "clean"), gD = M.run(D, M.all(true), "dirty");
ok(gC.co2.factor === 0.1 && gD.co2.factor === 0.7 && Math.round(gC.perTonne) === 220 && Math.round(gD.perTonne) === 622 && Math.round(gUS.perTonne) === 309 && gC.saving === gD.saving, "grid factor: 0.10 gives $220 per tonne, 0.70 gives $622; the cost does not move");
// the lines
ok(M.lineBoundary(D) === "**One boundary:** charging 3,168 MWh a year at 0.366 t per MWh emits 1,160 t. The CO₂ cut falls from 100% to 72%.", "the boundary line");
ok(M.lineBaseline(D).includes("320,000 gallons a year, not 411,429") && M.lineBaseline(D).includes("$0.83 million"), "the baseline line");
ok(M.lineGrid(D).includes("$288,000 a year in demand charges") && M.lineGrid(D).includes("$1.80 million up front") && M.lineGrid(D).includes("$180,832 a year as an annual equivalent"), "the grid line: up front and annual apart");
ok(M.lineCredit(D).includes("$6.00 million") && M.lineCredit(D).includes("$500,000 a year"), "the credit line");
// options: exactly one right answer each, with feedback
[D.boundaryItems, D.counterfactuals, D.creditLines].forEach((list, i) => ok(list.filter(x => x.right).length === 1 && list.every(x => { const t = (x.right ? "Right: " : "Not quite: ") + M.fillT(x.fb, F); return words(t) <= 40 && sentences(t) <= 2 && !/\{/.test(t); }), "options " + (i + 1) + ": one right answer, every option's feedback 40 words and two sentences at most, placeholders filled"));
ok(D.boundaryItems.filter(x => x.cost && !x.co2).length === 3 && D.boundaryItems.find(x => x.right).id === "elec", "the boundary item: electricity, the one fleet's energy outside the CO₂ count");
// the writing checks
const strong = M.exemplarsSpec(D).answers.find(a => a.key === "good").parts.map(p => typeof p === "string" ? p : p.text).join("");
const weak = M.exemplarsSpec(D).answers.find(a => a.key === "weak").parts.map(p => typeof p === "string" ? p : p.text).join("");
ok(M.checksOf(D, strong).every(c => c.ok), "the strong note passes every writing check");
ok(M.checksOf(D, weak).filter(c => c.ok).length <= 2, "the weak note fails most writing checks: " + M.checksOf(D, weak).filter(c => c.ok).map(c => c.id).join(","));
ok(M.checksOf(D, "").every(c => !c.ok), "an empty note passes no check");
ok(strong.includes("$0.65 million") && strong.includes("2,101 t") && strong.includes("64%") && strong.includes("$309") && strong.includes("1,160 t") && strong.includes("$1.80 million") && strong.includes("$288,000"), "the strong note's numbers are the model's");

// ---------------- numbers on the page
onPage("about 1,160 t a year", "myth: charging's CO₂");
onPage("cost the agency $0.65 million a year more, and the two together $1.25 million", "myth: the credit");
onPage("0.366 t per MWh", "the grid factor");
onPage("10.19 kg CO₂ per gallon", "diesel's CO₂");
onPage("at 3% over 12 years, 0.1005", "the capital recovery factor");
onPage("40 electric buses", "the task's fleet");

// ---------------- research wording (curriculum §13, G-SRC)
const OWN = PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?<!-- learn:\1:end -->/g, "");
{ const R = X.register(["E6"]);
  if (!R) ok(false, "the excerpt register was not found");
  else {
    const qs = [...OWN.matchAll(/<blockquote class="lx-excerpt" data-source="([^"]+)">([\s\S]*?)<\/blockquote>/g)];
    ok(qs.length === 1 && qs[0][1] === "excerpt:ghg", "one excerpt, from excerpt:ghg");
    const paras = qs.length ? [...qs[0][2].matchAll(/<p>([\s\S]*?)<\/p>/g)].map(m => m[1]) : [];
    ok(paras.length === 2 && paras.every(p => X.approved(R, p)) && X.norm(paras[0]) === X.norm(R.raw["E6.4"]) && X.norm(paras[1]) === X.norm(R.raw["E6.6"]), "the excerpt is E6.4 and E6.6, word for word from the register");
  } }
ok(!/Li et al\./.test(OWN.replace(/<blockquote[\s\S]*?<\/blockquote>/g, "").replace(/<div class="lx-card lx-sources">[\s\S]*?<\/div>/, "")), "no other sentence on the page names the course author's study");
ok(/fictional/i.test(D.study.authors) && /fictional/.test(PAGE.match(/<b>Fictional study\.<\/b>[^<]*/)[0] + "fictional") && JS.includes("The study, as published · fictional"), "the study is labelled fictional in its byline, the data note and the scene");

// ---------------- scope, links and text budget
const NUC = /nuclear|reactor|\bSMR\b|small modular|data cent|hydrogen|electrolyz/i;
ok(!NUC.test(OWN.replace(/<blockquote[\s\S]*?<\/blockquote>/g, "").replace(/<li>Li et al\.[\s\S]*?<\/li>/, "") + JS + JSON.stringify(D) + SIDE), "no nuclear technology, no data center and no hydrogen in the lesson's own files (G-SRC: nothing like the author's studies)");
ok(!/\bAI\b|artificial intelligence/.test(OWN + JS + JSON.stringify(D)), "no AI wording");
const HOSTS = /^https:\/\/(www\.eia\.gov|doi\.org)\//;
const hrefs = [...OWN.matchAll(/href="([^"]+)"/g)].map(m => m[1]);
ok(hrefs.every(h => HOSTS.test(h) || /^[0-9a-z-]+\.html$/.test(h)), "links only to allowed hosts and learn pages: " + hrefs.filter(h => !(HOSTS.test(h) || /^[0-9a-z-]+\.html$/.test(h))).join(", "));
ok(hrefs.filter(h => /\.html$/.test(h)).every(h => h === ID + ".html" || PATHJ.starter.concat(PATHJ.more).some(x => x.href === h && x.ready)), "every lesson link is a live lesson");
Object.keys(D.sources).forEach(key => ok(HOSTS.test(D.sources[key].url) && /\d{4}/.test(D.sources[key].asOf), "source " + key + ": EIA, with a date"));
const stepTexts = [...JS.matchAll(/\{ text: "([^\n]+)",\n\s+build:/g)].map(m => m[1].replace(/" \+ money\([^)]*\)\) \+ "/g, "$6.00 million"));
ok(stepTexts.length === 7 && stepTexts.every(t => words(t) <= 40 && sentences(t) <= 2), "seven step texts of 40 words and two sentences at most: " + stepTexts.map(t => words(t) + "/" + sentences(t)).join(","));
{ const O2 = OWN.replace(/^---[\s\S]*?\n---\n/, "").replace(/<p class="lx-ex-lines">[\s\S]*?<\/p>/g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/<div class="lx-card lx-sources">[\s\S]*?<\/div>/, "").replace(/<style>[\s\S]*?<\/style>/g, "").replace(/<blockquote[\s\S]*?<\/blockquote>/g, "");
  const els = O2.split(/<\/?(?:p|li|dd|dt|td|th|summary)\b[^>]*>/i).map(x => x.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()).filter(x => /[A-Za-z]/.test(x));
  const long = els.filter(x => x.split(" ").length > 40 && !/^(Electric|Fix|Line)/.test(x));
  ok(long.length === 0, "every page element is 40 words or fewer: " + long.map(x => x.slice(0, 60) + " (" + x.split(" ").length + ")").join(" | ")); }
["baseline", "counterfactual", "demand-charge", "transfer-payment", "capital-recovery-factor"].forEach(id => ok(JS.includes("[[" + id + "|") || PAGE.includes('data-term="' + id + '"'), "the page marks the course glossary's " + id));
{ const PY = fs.readFileSync(path.join(SITE, "learn/path.yml"), "utf8"), i = PY.indexOf("id: " + ID), r = PY.slice(i, i + 2000).split("\n- ")[0];
  ok(i > 0 && /status: active/.test(r) && /form: studio/.test(r) && /minutes: 35/.test(r) && /practice_minutes: 90/.test(r) && /after: \[A1, A11\]/.test(r) && PAGE.includes('subtitle: "' + (r.match(/subtitle: "([^"]+)"/) || [])[1] + '"'), "path.yml: active studio row, 35 + 90 minutes, after A1 and A11, subtitle equal to the page's"); }
ok(D.rubric.competences.map(c => c.id).join() === "accounting,realism" && D.checklist.length === 8, "rubric: Consistent accounting and Realism; an eight-item checklist");

// ---------------- the page on a stub document
{
  const { env, load } = require("./stubdom.js");
  const E = env();
  E.LX.ready = () => {}; E.LX.progress.guess = () => null; E.LX.visible = E.LX.visible || (() => false);
  E.LX.lessonRefHTML = require(L("components/core.js")).lessonRefHTML;
  ["cards", "predict", "toggle", "ledger", "boundary", "plot", "exemplars", "evidence", "rubric", "checklist"].forEach(n => load(n, E));
  let init = null, demo = null;
  E.LX.mount = (slug, f) => { if (slug === ID) init = f; };
  E.LX.demo = (root, fn, cards) => { demo = { fn, cards }; return () => null; };
  const xp = E.LX.H("div", { id: "r07-exemplars" }, E.body), rb = E.LX.H("div", { id: "r07-rubric" }, E.body);
  vm.runInNewContext(JS, { window: E.window, document: E.document, location: E.location, navigator: {}, console, module: { exports: {} }, performance: E.window.performance, setTimeout: () => 0, clearTimeout: () => {}, requestAnimationFrame: () => 0 });
  const root = E.LX.H("div", { class: "lx-interactive", "data-learn": ID }, E.body), live = E.LX.H("div", { class: "lx-live" }, root);
  let threw = null;
  try { init(live, { r07_cost_carbon_properly: D, path: PATHJ }, root); } catch (e) { threw = e.stack; }
  ok(!threw && demo && demo.cards, "the page mounts on the stub document" + (threw ? ": " + threw : ""));
  try {
    const S = root.lxLesson.S, card = () => demo.cards.el, said = [];
    const grab = () => card().querySelectorAll(".lx-saw, .lx-hint, li").forEach(e => said.push(e.textContent.replace(/\s+/g, " ").trim()));
    const btn = (re) => card().querySelectorAll("button").filter(b => re.test(b.textContent))[0];
    ok(live.textContent.includes("Electric saves $1.15 million a year and cuts CO₂ by 4,192 t (100%)."), "the scene opens on the study's own conclusion");
    demo.cards.go(0); btn(/^cost more/).click(); grab();
    demo.cards.go(1); for (const it of D.boundaryItems) { btn(new RegExp("^" + it.label)).click(); grab(); }
    ok(S.fx.boundary && live.textContent.includes("3,033 t (72%)"), "step 2: the right item fixes the boundary; the scene shows 3,033 t (72%)");
    demo.cards.go(2); for (const it of D.counterfactuals) { btn(new RegExp("^" + it.label.slice(0, 20))).click(); grab(); }
    ok(S.fx.baseline, "step 3: the counterfactual fixes the baseline");
    demo.cards.go(3); const tg = card().querySelectorAll(".lx-toggle"); tg[0].click(); ok(!S.fx.grid, "step 4: one grid cost alone is not the fix"); tg[1].click(); grab();
    ok(S.fx.grid, "step 4: both grid costs fix it");
    demo.cards.go(4);
    ok(card().textContent.includes("−500") && card().textContent.includes(M.thou(S0.e.capital)), "step 5: the ledger shows the credit in the capital line and again as income (−500 thousand a year)");
    for (const it of D.creditLines) { btn(new RegExp("^" + it.label.slice(0, 20))).click(); grab(); }
    ok(S.fx.credit && live.textContent.includes("Electric costs $0.65 million a year more and cuts 2,101 t of CO₂ (64%): about $309 per tonne."), "step 5: all four fixed; the scene's conclusion is the audit's");
    demo.cards.go(5); grab();
    for (const g of D.co2.gridChoices) { btn(new RegExp(g.v != null ? "^" + g.v.toFixed(2) : "^0\\.366")).click(); grab(); }
    ok(live.textContent.includes("$622"), "step 6: the grid factor moves the cost per tonne");
    const tgs = card().querySelectorAll(".lx-toggle"); tgs.forEach(b => { b.click(); grab(); b.click(); grab(); });
    ok(card().textContent.includes("You predicted it") && card().innerHTML.includes("M11 (upcoming)") || card().innerHTML.includes("m11"), "step 6: the prediction is named; M11 is linked or marked upcoming");
    demo.cards.go(6); const ta = card().querySelector("textarea"); ta.value = strong; ta.fire("input"); grab();
    ok(card().textContent.includes("All 7 parts are there"), "step 7: the strong note passes every check");
    ok(xp.textContent.includes("Two audit notes on the same study") && xp.textContent.includes("Agency and state together") && xp.textContent.includes("How far up the ladder"), "exemplars: notes, who pays, the ladder");
    ok(rb.textContent.includes("Consistent accounting") && rb.textContent.includes("Cost and carbon, before you trust a result"), "self-check: rubric and checklist");
    const over = said.filter(t => /[A-Za-z]/.test(t) && (words(t) > 40 || sentences(t) > 2));
    ok(said.length > 20 && over.length === 0, "every assembled line (" + said.length + ") is 40 words and two sentences at most: " + over.slice(0, 3).join(" | "));
    const lines = combos.map(f => M.lineVerdict(D, f, "us")).concat([M.lineBoundary(D, "clean"), M.lineBoundary(D, "dirty"), M.lineBaseline(D), M.lineGrid(D), M.lineCredit(D)]);
    ok(lines.every(t => words(t) <= 40 && sentences(t) <= 2), "every line function, every input: 40 words and two sentences at most");
  } catch (e) { ok(false, "the stub page test threw: " + (e && e.stack || e)); }
}

console.log(`test_${ID}: ${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
