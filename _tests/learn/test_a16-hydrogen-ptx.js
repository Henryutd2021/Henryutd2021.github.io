// test_a16-hydrogen-ptx.js — Node tests for A16 (assets/learn/a16-hydrogen-ptx.js, its data file and the page).
//   - the farm: 8,760 hours at EIA's 33.8%, the best hour at full size (method "power")
//   - the chain: 1 MWh -> 17.5 kg -> 0.58 MWh held -> 0.35 MWh back
//   - the hourly rules: energy balances (electrolyzer use = spare used + wind diverted + grid), part-load (never below the
//     minimum load), curtailment never rises, the annual rule's matching holds at the page's 30 MW
//   - claims: on spare wind utilization falls and the cost per kg rises with every size step (the myth);
//     average utilization is energy / (size x 8,760), and the hours running and at full size are counted apart;
//     the owner may build none: at low prices every size loses money and none is chosen, otherwise the owner's best size
//     is at least the cheapest-kg size; ties go to the smaller size (stated in the model), none on the slider
//   - the tank: the least working storage for 2025, with its start fill shown
//   - the decision flowchart agrees with the use sorter: every bin has an end box
//   - every number on the page (fallback, explain, myths, quiz, numbers to remember) against the model and the data
//   - research wording (the course's sourcing rule; CF2's pattern): every excerpt sentence and every sentence about the
//     course author's studies is an approved sentence of the excerpt wording (E3, E4, E10, with the revisions after
//     review), word for word; titles of cited papers as in the author's publication list
//   - scope: no nuclear term, no data centers, links only to allowed domains
// Usage (from the site folder):  node _tests/learn/test_a16-hydrogen-ptx.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const PRIV = require("./private_sources.js");
const ID = "a16-hydrogen-ptx";
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const pctx = { window: { LX: {} }, module: { exports: {} } };
vm.runInNewContext(fs.readFileSync(L("components/profiles.js"), "utf8"), pctx);
const PR = pctx.module.exports;
const M = require(L(ID + ".js"));
const J = p => JSON.parse(fs.readFileSync(L("data/" + p), "utf8"));
const D = J(ID + ".json"), JS = fs.readFileSync(L(ID + ".js"), "utf8");
const PAGE = fs.readFileSync(path.join(SITE, "learn", ID + ".qmd"), "utf8"), SIDE = fs.readFileSync(path.join(SITE, "learn/_w1", ID + ".yml"), "utf8");
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-6 : t);
const PAGE0 = PAGE.replace(/ data-label="[^"]*"/g, "");
const onPage = (s, what) => ok(PAGE0.includes(s), `page states ${what}: "${s}"`);
const fm = M.fm;

const Y = M.prepare(D, J("town_year.json"), J("cf_targets.json"), PR.townProfile);
// ---------------- the farm and the chain
ok(Y.wind.length === 8760 && near(M.sum(Y.wind) / 8760 / D.farm.windMW, 0.338, 1e-6) && near(Math.max(...Y.wind), D.farm.windMW, 1e-9), "farm: 8,760 hours, 33.8% capacity factor, best hour at 100 MW");
const c = M.chain(D);
ok(c.kg.toFixed(1) === "17.5" && c.lhv.toFixed(2) === "0.58" && c.back.toFixed(2) === "0.35", "chain: 17.5 kg, 0.58 MWh held, 0.35 MWh back");
onPage("1 MWh of power makes 17.5 kg of hydrogen, which holds 0.58 MWh; a fuel cell turns that back into 0.35 MWh.", "the chain (fallback)");
onPage("1 MWh makes 17.5 kg; it holds 0.58 MWh and gives back 0.35 MWh through a fuel cell.", "the chain (explain)");
ok(near(10000 / D.electrolyzer.kWhPerKg, 175.4, 0.05), "quiz: 10 MWh makes 175.4 kg"); onPage("10,000 kWh ÷ 57 kWh per kg = 175.4", "the quiz");

// ---------------- the hourly rules
const rules = ["spare", "hourly", "annual"];
[5, 20, 30, 60].forEach(X => ["pem", "alk"].forEach(t => rules.forEach(r => {
  const o = M.run(Y, X, r, t), m = D.electrolyzer.minLoad[t];
  ok(near(o.mwh, o.spareUsed + o.diverted + o.grid, 1e-6) && near(o.kg, o.mwh * 1000 / 57, 1e-6) && o.curtailed <= o.curtailed0 + 1e-9, `${r} ${t} ${X} MW: balance, yield and curtailment`);
  const below = o.kgByHour.some(k => k > 0 && k * 57 / 1000 < m * X - 1e-9);
  ok(!below, `${r} ${t} ${X} MW: never runs below its ${Math.round(m * 100)}% minimum load`);
})));
const R30 = rules.map(r => M.run(Y, 30, r, "pem"));
ok(R30[2].matched && R30[2].mwh <= R30[2].windMWh, `annual rule at 30 MW: the year's use (${fm.gwh(R30[2].mwh)}) is matched by the farm's wind (${fm.gwh(R30[2].windMWh)})`);
const rowTxt = ["Spare wind only", "Wind matched hour by hour", "Grid power matched over the year"];
R30.forEach((o, i) => onPage(`<tr><td>${rowTxt[i]}</td><td>${fm.pct(o.util)}</td><td>${o.hoursOn.toLocaleString("en-US")}</td><td>${fm.kg2(o.lcoh)}</td><td>${fm.co2(o.gridCO2)}</td></tr>`, "the fallback row " + rowTxt[i]));
// average utilization is not time at full output
R30.forEach(o => ok(near(o.util, o.mwh / (30 * 8760)) && near(o.eflh, o.mwh / 30) && o.hoursFull <= o.hoursOn, `${o.rule} at 30 MW: average utilization = MWh / (30 MW x 8,760 h); full-load hours ${Math.round(o.eflh)}; full-size hours ${o.hoursFull} <= hours running ${o.hoursOn}`));
ok(R30[0].hoursFull / 8760 < R30[0].util / 4 && R30[0].hoursOn / 8760 > R30[0].util, "spare wind at 30 MW: full-size hours are far below the average utilization, hours running far above it");
onPage(`On spare wind the unit runs in ${R30[0].hoursOn.toLocaleString("en-US")} hours but at full size in only ${R30[0].hoursFull}.`, "the fallback's utilization hint");
ok(!/[Rr]uns at full size/.test(PAGE + JS), "no 'runs at full size' label for average utilization");
ok(R30[2].lcoh < R30[1].lcoh && R30[1].lcoh < R30[0].lcoh && R30[2].gridCO2 > D.chps, "step 6: annual matching gives the cheapest kg, yet its grid hours carry more CO2 per kg than DOE's 4.0 target");
onPage(`it carries about ${fm.co2(R30[2].gridCO2)} of CO₂ per kg, above DOE's 4.0 target`, "myth 2");

// ---------------- claims about spare wind
let prev = null, mono = true;
for (let X = D.sizes.min; X <= D.sizes.max; X += D.sizes.step) { const o = M.run(Y, X, "spare", "pem"); if (prev && !(o.util < prev.util && o.lcoh > prev.lcoh)) mono = false; prev = o; }
ok(mono, "on spare wind every size step lowers utilization and raises the cost per kg (myth 1, step 2)");
const o10 = M.run(Y, 10, "spare", "pem"), o20 = M.run(Y, 20, "spare", "pem"), o30 = R30[0], a20 = M.run(Y, 20, "spare", "alk");
onPage(`From 10 to 30 MW its average utilization falls from ${fm.pct(o10.util)} to ${fm.pct(o30.util)}, and the cost per kg rises from ${fm.kg2(o10.lcoh)} to ${fm.kg2(o30.lcoh)}.`, "myth 1");
onPage(`a 20 MW electrolyzer's average utilization is ${fm.pct(o20.util)}: it runs in ${o20.hoursOn.toLocaleString("en-US")} hours, at full size in ${o20.hoursFull}. Each kg carries much capital: ${fm.kg2(o20.lcoh)} per kg.`, "explain: utilization");
onPage(`At 20 MW an alkaline unit (15% minimum) loses ${Math.round(a20.lostMin)} MWh of spare wind a year below its minimum; a PEM unit (5%) loses ${Math.round(o20.lostMin)} MWh.`, "explain: part-load");
ok(a20.hoursOn < o20.hoursOn && a20.lcoh > o20.lcoh, "the alkaline unit runs fewer hours and costs more per kg");
let nNone = 0;
["pem", "alk"].forEach(tech => { for (let p = D.prices.min; p <= D.prices.max + 1e-9; p += D.prices.step) {
  const b = M.best(Y, "spare", tech, p), s = b.sweep, all = [{ X: 0, net: 0 }].concat(s), top = all.filter(r => Math.abs(r.net - b.net.net) < 1);
  const losing = s.every(r => r.net < 0);
  ok(b.none === losing && (b.none ? b.net.X === 0 && b.net.net === 0 : b.net.X >= b.lcoh.X && b.net.net > 0) && b.lcoh.X === D.sizes.min && top.length === 1,
     `${tech} at $${p.toFixed(2)}/kg: best for the owner ${b.none ? "none (every size loses money)" : b.net.X + " MW"}, cheapest kg ${b.lcoh.X} MW; the choice is unique (no tie within $1)`);
  if (b.none && tech === "pem") nNone++;
} });
ok(nNone >= 1 && M.best(Y, "spare", "pem", D.prices.min).none && near(M.net(M.run(Y, 5, "spare", "pem"), 2), -180970, 1), "at the lowest price on the slider every size loses money (5 MW: about -$181,000 a year) and the owner builds none");
ok(M.lossPrice(Y, "pem", D) === 2.5 && !M.best(Y, "spare", "pem", 3).none, "PEM: at $2.50 or less every size loses money; at $3.00 the 5 MW unit earns (step 4's sentence)");
ok(/at \$" \+ LOSS\.toFixed\(2\) \+ " or less every size loses money, so none is built/.test(JS) && /"0 \(none\)"/.test(JS), "step 4: the sentence reads the loss price from the model; the chart's text version lists 'none'");
const b4 = M.best(Y, "spare", "pem", 4);
onPage(`At $4 per kg the cheapest kg comes at ${b4.lcoh.X} MW, the owner's best size at ${b4.net.X} MW.`, "explain: cost per kg and the system");
const tk = M.tank(o20);
ok(near(M.sum(o20.kgByHour) - tk.q * 8760, 0, 1e-3) && Math.min(...tk.daily) >= -1e-6, "tank: delivery equals the year's output; the level never goes below zero");
{ let lv = tk.start, lo = Infinity, hi = -Infinity; o20.kgByHour.forEach(k => { lv += k - tk.q; lo = Math.min(lo, lv); hi = Math.max(hi, lv); });
  ok(near(lo, 0, 1e-6) && near(Math.max(hi, tk.start), tk.size, 1e-6) && near(lv, tk.start, 1e-3) && tk.start > 0, `tank: starting at ${fm.t(tk.start)} it never runs dry, never exceeds ${fm.t(tk.size)} and ends the year where it started`); }
onPage(`needs at least ${fm.t(tk.size)} of working storage, ${Math.round(tk.days)} days of delivery, with ${fm.t(tk.start)} in the tank on 1 January and no losses.`, "explain: storage");
onPage(`needs at least ${fm.t(tk.size)} of working storage, ${Math.round(tk.days)} days of its output`, "myth 3"); onPage(`That is with ${fm.t(tk.start)} in the tank on 1 January and no losses`, "myth 3: the start fill");
ok(/"In the tank on 1 January", fm\.t\(tk\.start\)/.test(JS) && /Another weather year needs its own check/.test(JS), "step 5 shows the start fill and says the result holds for 2025's known hours");
ok(tk.size < D.cavernTonnes * 1000, "the tank is far smaller than one salt cavern (step 5)");

// ---------------- data: sources, one price year
const E = D.electrolyzer;
ok(E.kWhPerKg === 57 && E.capexPerKW === 2000 && E.life === 30 && D.elecPrice === 30 && /2022 dollars/.test(E.source.label), "costs from DOE Record 24005 (2022 dollars): 57 kWh/kg, $2,000/kW, 30 years, $30/MWh");
ok(!/20(19|20|21|23|24|25) dollars/.test(JSON.stringify(D) + PAGE), "one price year: no other dollar year on the page or in the data");
ok(E.minLoad.pem === 0.05 && E.minLoad.alk === 0.15 && /5%–120%/.test(E.loadSource.label) && /15%–100%/.test(E.loadSource.label), "part-load ranges from IRENA (2020), Table 6");
D.facts.forEach(f => { const row = PAGE.indexOf('<td class="n">' + f.n + "</td><td>" + f.what + "</td>"); ok(row >= 0 && PAGE.slice(row, row + 700).includes(f.url) && PAGE.slice(row, row + 700).includes(f.asof), "numbers to remember: '" + f.n + "' with source and date"); });
ok(D.uses.cards.length === 8 && D.uses.cards.every(u => D.uses.bins.some(b => b.id === u.bin) && u.why.split(" ").length <= 25), "use sorter: eight cards, each in a bin with a short reason");
ok(D.uses.cards.find(u => u.id === "cars").why.includes("about 60 miles per kg, made with 57 kWh: about 1 mile per kWh") && near(60 / 57, 1.05, 0.01), "cars: about 60 miles per kg at 57 kWh/kg is about 1 mile per kWh, input shown");
ok(D.uses.sources.some(x => x.url === "https://afdc.energy.gov/files/u/publication/hydrogen_fuel_cell_electric_vehicles.pdf" && /60 miles/.test(x.label)) && PAGE.includes("https://afdc.energy.gov/files/u/publication/hydrogen_fuel_cell_electric_vehicles.pdf"), "the 60 miles per kg has its own source, the AFDC fuel cell vehicle fact sheet (January 2025)");
ok(D.uses.sources.every(x => /^https:\/\//.test(x.url) && x.date) && /<a href=\\"" \+ LX\.esc\(s\.url\)/.test(JS) && /LX\.esc\(s\.date\)/.test(JS), "the sorter's sources render with links and dates");
// the no-JavaScript sorter table: every card, its bin and its reason
{ const bin = id => D.uses.bins.find(b => b.id === id).label;
  D.uses.cards.forEach(u => onPage(`<tr><td>${u.text}</td><td>${bin(u.bin)}</td><td>${u.why}</td></tr>`, "the no-JS sorter row " + u.id)); }
// the metadata counts the cards
{ const PY = fs.readFileSync(path.join(SITE, "learn/path.yml"), "utf8"), row = PY.slice(PY.indexOf("id: a16-hydrogen-ptx"), PY.indexOf("id: a16-hydrogen-ptx") + 2000), W = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
  ok(row.includes(`sort ${W[D.uses.cards.length]} uses`) && PAGE.includes(`sort ${W[D.uses.cards.length]} uses`) && JS.includes(`Sort ${W[D.uses.cards.length]} uses`), `path.yml, the page's metadata and step 7 say ${W[D.uses.cards.length]} uses, as many as the sorter's cards`); }
// the flowchart agrees with the sorter: feedstock -> hydrogen, else electricity only if it does the job, else compare
ok(/\["use", "direct", "no"\], \["direct", "elec", "yes"\], \["direct", "both", "not yet"\]/.test(JS) && /label: "Ocean shipping", path: \["wind", "ez", "store", "use", "direct", "both"\]/.test(JS) && D.uses.bins.map(b => b.id).join() === "feed,both,elec",
   "flowchart: a non-feedstock use goes to electricity only when electricity can do the job, else to a comparison, as the sorter's three bins");
// the DOE comparison's boundary and the controlled technology comparison
ok(!/full estimate|full analysis counts/.test(PAGE + JS) && PAGE.includes("Compression, storage and delivery are outside both.") && /compression, storage and delivery out/.test(PAGE) && /leaves out compression, storage, distribution and dispensing/.test(D.electrolyzer.doeBoundary),
   "DOE's $5-7/kg is named a production cost with upkeep and stack replacement, without compression, storage or delivery");
ok(JS.includes("Only the minimum load changes here; capital cost and electricity use are held equal.") && E.minLoad.pem !== E.minLoad.alk, "step 3 says only the minimum load differs between PEM and alkaline");
// matching and accounting kept apart; the capture example keeps its conditions
ok(PAGE.includes("Matching sets which power may count. Separately, from 2030 DOE's 45VH2-GREET manual (December 2025) lets a producer opt to count its electricity's emissions hour by hour") && !/in place of annual accounting/.test(PAGE), "Go deeper: hourly emissions accounting from 2030 is an option, separate from matching");
ok(PAGE.includes("could reach about 4.0, if it uses the average U.S. grid mix and upstream methane leaks stay at or below 1%"), "Go deeper: the 95% capture example keeps DOE's conditions");
ok(/12 September 2025/.test(PAGE) && D.facts[0].asof.startsWith("published 12 September 2025"), "IEA: the publication date, 12 September 2025 (revised October 2025)");

// the farm's construction disclosed; round trips labelled; matching's timeline; the LP's limit; worked costs
ok(/raised to a power so the peak reaches 100 MW/.test(PAGE) && /depend on that construction/.test(D.farm.note) && /depends on that construction/.test(JS) && /spare wind and the tank depend on that construction/.test(JS), "the farm's hours are a construction from regional data, said on the page, in step 2 and in the boundary");
{ const c = M.chain(D), st = D.uses.cards.find(u => u.id === "storage").why; ok(Math.round(c.back * 100) === 35 && /about 35% here \(step 1\), 31% in DOE's 2022 storage assessment \(A8\)/.test(st), "two round trips, each labelled: this lesson's 35% and A8's DOE 31%"); }
ok(/Annual matching is allowed before 2030; hourly matching applies from 2030 \(U\.S\. Treasury, 3 January 2025\)/.test(PAGE) && !/the same year or the same hour/.test(PAGE), "matching's timeline: annual before 2030, hourly from 2030");
ok(/with the on\/off schedule fixed beforehand, dispatch can stay linear/.test(PAGE) && !/can only force the unit on/.test(PAGE), "the minimum-load limit: mixed-integer in general, linear with a fixed schedule");
{ const o = M.run(Y, 20, "spare", "pem"), w = M.costWorked(o, E), f = M.crf(0.04, 30);
  ok(w.includes("20 MW = 20,000 kW; × $2,000 per kW = $40.0M; × " + f.toFixed(4)) && w.includes("≈ " + fm.kg2(o.lcoh) + " per kg") && near(o.capital / o.kg, o.lcoh, 1e-9) && Math.abs(40e6 * +f.toFixed(4) - o.capital) < 0.001 * o.capital && Math.round(o.capital / 1e3) === Math.round(40e6 * f / 1e3), "step 2: the cost per kg worked with its units (MW to kW, $M), capital a year ÷ kg; the rounded CRF marked ≈"); }
ok(D.uses.cards.every(u => (u.text + " " + u.why).split(" ").length <= 40), "the sorter's feedback (a card's name and its reason together) stays within 40 words");
ok(/running total's highest point minus its lowest/.test(JS) && /Working storage needed \(usable capacity\)/.test(JS), "step 5: how the tank's size is found, and what working storage means");
ok(/hint: "Decide in order: is hydrogen a chemical input/.test(JS) && D.uses.bins[0].label === "Hydrogen is a chemical input" && /Electricity-only routes are still in development/.test(D.uses.cards.find(u => u.id === "steel").why), "the sorter states its order of questions; steel's electric routes acknowledged");
ok(/D\.uses\.sources\.forEach\(function \(s\) \{ H\("li"/.test(JS), "step 7's sources as list items");
ok(/Reference comparison: PEM/.test(JS), "the explain table says it is a PEM reference");
// ---------------- research wording (the sourcing rule): approved sentences only
const SNAP = {
  "E3.14": "A higher hydrogen price makes each kilogram worth more, so the optimizer builds a larger electrolyzer to capture more surplus wind. The extra capacity runs fewer full-load hours, so the cost per kilogram, the levelized cost of hydrogen, goes up. Yet the added hydrogen revenue lowers the net cost of the whole system. The cost per kilogram and the system's cost move in opposite directions.",
  "E4.1": "Among the cases studied, concentrated solar power with thermal storage running a high-temperature electrolyzer at variable power gave the lowest levelized cost of hydrogen; constant-power operation was the most expensive.",
  "E4.2": "Yardstick here: the cost per kilogram across designs. Holds for: one West Texas site, cost projections from NREL's Annual Technology Baseline, a conference-length study.",
  "E10.2": "When gas-fired backup power became much more expensive, the model built fuel cells and turned stored green hydrogen back into electricity.",
  "E10.3": "Industry then drew more hydrogen from gas reformers, and the round trip from power to hydrogen and back lost energy, so total emissions rose although gas-plant emissions fell.",
  "E10.4": "Inputs reflect 2022–2023 conditions; post-2023 federal hydrogen credit rules are not modeled."
};
const RP = PRIV.all("excerpts", "publications");   // the wording checks also read the publication list
const norm = s => String(s).replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
let APPROVED = SNAP;
if (RP) {
  const md = fs.readFileSync(RP, "utf8"), reg = {}; let sec = null;
  md.split("\n").forEach(line => {
    if (/^## /.test(line)) { const h = line.match(/^## (E\d+)\.|^## (Revisions after review)/); sec = h ? (h[1] || "REV") : null; return; }
    const m = line.match(/^\| (E(\d+)\.\d+) \| (.*) \|\s*$/); if (!m || !sec || ["E3", "E4", "E10"].indexOf("E" + m[2]) < 0) return;
    const cells = m[3].split(" | "); if (sec === "REV") reg[m[1]] = norm(cells[1].replace(/^Timeline, [^:]+: /, "")); else if (sec === "E" + m[2]) reg[m[1]] = norm(cells[0].replace(/^Timeline, [^:]+: /, ""));
  });
  Object.keys(SNAP).forEach(k => ok(reg[k] === SNAP[k], `approved ${k} equals the snapshot`));
  ok(/E10\.1–E10\.4/.test(md.split("## E8.")[0]), "the approved wording records E10.1–E10.4 as approved");
  APPROVED = reg;
  const bib = fs.readFileSync(PRIV.path("publications"), "utf8").toLowerCase();
  [...PAGE.matchAll(/<li>Li et al\. \(\d{4}\)\. <a href="(https:\/\/doi\.org\/[^"]+)">([^<]+)<\/a>/g)].forEach(m => {
    const entry = bib.split("\n@").find(e => e.includes("title={" + m[2].toLowerCase() + "}")) || "", doi = (entry.match(/doi\s*=\s*\{([^}]+)\}/) || [])[1];
    ok(entry && (!doi || doi === m[1].replace("https://doi.org/", "").toLowerCase()), "citation title (and DOI where the list has one) as in the publication list: " + m[2].slice(0, 50));
  });
} else console.log("note: the approved excerpt wording and the publication list are not both available (set LEARN_SOURCES); checked against the snapshot");
const UNITS = Object.values(APPROVED).map(norm);
const approved = s => { s = norm(s); return s.length > 0 && UNITS.some(u => u === s || u.split(/(?<=[.?!])\s+/).indexOf(s) >= 0); };
const quotes = [...PAGE.matchAll(/<blockquote class="lx-excerpt" data-source="([^"]+)">([\s\S]*?)<footer>/g)];
ok(quotes.length === 2 && quotes.map(q => q[1]).join(",") === "excerpt:txh2,excerpt:solar-hydrogen", "two excerpts: txh2 and solar-hydrogen");
quotes.forEach(q => [...q[2].matchAll(/<p>([\s\S]*?)<\/p>/g)].forEach(p => ok(approved(p[1]), `${q[1]}: approved sentence: ${norm(p[1]).slice(0, 60)}`)));
ok(norm(quotes[0][2]).startsWith(SNAP["E10.2"]) && norm(quotes[0][2]).endsWith(SNAP["E10.3"]), "txh2: E10.2 then E10.3, word for word");
onPage(`<p class="lx-hint">${SNAP["E10.4"]}</p>`, "E10.4 under the txh2 excerpt"); onPage(`<p class="lx-hint">${SNAP["E4.2"]}</p>`, "E4.2 under the solar excerpt");
ok(/From: Li et al\. \(2025\), <a href="https:\/\/doi\.org\/10\.1016\/j\.ijhydene\.2025\.02\.303">International Journal of Hydrogen Energy<\/a>\./.test(PAGE), "txh2 footer and DOI as approved");
const exSteps = [...PAGE.matchAll(/<ol class="ex-fallback[^"]*">([\s\S]*?)<\/ol>/g)].flatMap(m => [...m[1].matchAll(/<li>([\s\S]*?)<\/li>/g)].map(x => x[1]));
ok(exSteps.length === 4 && exSteps.every(approved), "the explainer's no-JS steps are E3.14, sentence by sentence");
// any element that names a study, a paper, its author or method must be approved, or one of these labels
const RX = /\b(stud(y|ies)|paper|Li et al|course author|excerpt|ERCOT|West Texas|optimizer|stochastic|weather zones?)\b/i;
const LABELS = [/^From: Li et al\. \(20\d\d\), (International Journal of Hydrogen Energy|EEM 2023)\.$/, /^A separate example with stylized numbers, from the course author's open explainer: not the study's data or results\.$/,
  /^Li et al\. \(20\d\d\)\. .+\.$/, /^Case file CF2: when the cost per kilogram and the cost of the system disagree\.$/, /^Case file CF2 tells a published study's version\.$/];
const OWN = PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?learn:\1:end -->/g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/^---[\s\S]*?\n---\n/, "");
const elems = OWN.replace(/^- (.*)$/gm, "<li>$1</li>").split(/<\/?(?:p|li|ul|ol|dl|dt|dd|div|blockquote|footer|table|thead|tbody|tr|td|th|summary|details|h[1-6]|header|script)\b[^>]*>/i).map(norm).filter(s => /[A-Za-z]/.test(s));
const strs = (JS.replace(/\/\/[^\n]*/g, " ").match(/"(?:[^"\\\n]|\\.)*"/g) || []).map(s => s.slice(1, -1));
const fine = x => approved(x) || !RX.test(x) || LABELS.some(r => r.test(norm(x)));
const bad = elems.concat(strs, JSON.stringify(D).match(/"[^"]{12,}"/g).map(s => s.slice(1, -1))).filter(s => RX.test(s) && !fine(s) && !norm(s).split(/(?<=[.?!])\s+/).every(fine));
ok(bad.length === 0, "research wording: every sentence about the studies is approved:\n  " + bad.slice(0, 6).join("\n  "));
ok(!/E10\.1|two-stage|nine scenarios/.test(PAGE), "E10.1 (the method sentence) is left out: the box has no room");
ok(!/92\.[49]|(?<![\d.])3\.8%|131 t|1,300 t/.test(PAGE + JS), "no number from the txh2 paper");

// ---------------- scope, links, text, sidecar
const NUC = /nuclear|reactor|\bSMR\b|small modular|pink/i;
ok(!NUC.test(OWN + JS + JSON.stringify(D)), "no nuclear term and no nuclear-to-hydrogen path anywhere (outside the generated header)");
ok(!/\bAI\b|data cent/i.test(PAGE + JS), "no AI wording, no data centers");
const hrefs = [...OWN.matchAll(/href="([^"]+)"/g)].map(m => m[1]);
const ALLOW = /^(https:\/\/(doi\.org|www\.eia\.gov|www\.energy\.gov|www\.hydrogen\.energy\.gov|afdc\.energy\.gov|www\.iea\.org|www\.irena\.org|ergo-code\.github\.io)\/|[0-9a-z-]+\.html|\.\.\/assets\/|#)/;
ok(hrefs.every(h => ALLOW.test(h)), "links only to allowed domains and learn pages: " + hrefs.filter(h => !ALLOW.test(h)).join(", "));
const stepTexts = (JS.match(/\{ text: "([^"]+)"/g) || []).map(s => s.slice(9, -1));
ok(stepTexts.length === 7 && stepTexts.every(t => t.split(/\s+/).length <= 40), "seven step texts of 40 words at most");
// review 11: every element of the page's own text stays within budget; the data note is three entries (farm, costs, boundary)
{ const O2 = OWN.replace(/<div class="lx-card lx-sources">[\s\S]*?<\/div>/, "").replace(/<style>[\s\S]*?<\/style>/g, "").replace(/\$\$[\s\S]*?\$\$/g, "").replace(/<blockquote[\s\S]*?<\/blockquote>/g, "");
  const els = O2.replace(/^- (.*)$/gm, "<li>$1</li>").split(/<\/?(?:p|li|dd|dt|td|th|summary|footer)\b[^>]*>/i).map(x => x.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()).filter(x => /[A-Za-z]/.test(x));
  const long = els.filter(x => x.split(" ").length > 40);
  ok(long.length === 0, "every page element is 40 words or fewer: " + long.map(x => x.slice(0, 60) + " (" + x.split(" ").length + ")").join(" | "));
  ok((PAGE.match(/<p class="lx-datanote">/g) || []).length === 3 && /<b>Illustrative farm\.<\/b>/.test(PAGE) && /<b>Costs, one price year\.<\/b>/.test(PAGE) && /<b>Partial cost\.<\/b>/.test(PAGE), "the data note is three labelled entries"); }
ok(!/\b(always|never)\b/i.test(strs.join(" ")), "no 'always' or 'never' in the page's strings");
ok(!/txh2/.test(SIDE.split("requests:")[1] || "") || !/pending/i.test(SIDE), "sidecar: no pending-excerpt note (E10 approved)");
["procurement-rule", "hourly-matching", "minimum-load", "full-load-hours", "pem-electrolyzer", "alkaline-electrolyzer", "lower-heating-value", "feedstock", "co2e", "well-to-gate", "additionality", "deliverability"].forEach(id => ok(new RegExp("id: " + id + "\\b").test(SIDE), "sidecar defines " + id));
["pem-electrolyzer", "alkaline-electrolyzer", "lower-heating-value", "feedstock", "co2e", "well-to-gate", "additionality", "deliverability", "full-load-hours"].forEach(id => ok(new RegExp("\\[\\[" + id + "\\||term=\"" + id + "\"|data-term=\"" + id + "\"").test(JS + PAGE), "the page marks " + id + " for the glossary"));

// ---------------- the page on a stub document: no silent switch of type; the owner may build none
{
  const { env, load } = require("./stubdom.js");
  const E = env();
  E.LX.ready = () => {}; E.LX.progress.guess = () => null; E.LX.visible = E.LX.visible || (() => false); E.LX.onTheme = E.LX.onTheme || (() => {}); E.LX.reduced = E.LX.reduced || (() => true);
  ["cards", "predict", "cardsort", "controls", "plot", "profiles", "energychain"].forEach(n => load(n, E));
  let init = null, demo = null;
  E.LX.mount = (slug, f) => { if (slug === ID) init = f; };
  E.LX.demo = (root, fn, cards) => { demo = { fn, cards }; return () => null; };
  vm.runInNewContext(JS, { window: E.window, document: E.document, location: E.location, navigator: {}, console, module: { exports: {} }, performance: E.window.performance, setTimeout: () => 0, clearTimeout: () => {} });
  const root = E.LX.H("div", { class: "lx-interactive", "data-learn": ID }, E.body), live = E.LX.H("div", { class: "lx-live" }, root);
  let threw = null;
  try { init(live, { a16_hydrogen_ptx: D, town_year: J("town_year.json"), cf_targets: J("cf_targets.json") }, root); } catch (e) { threw = e.message; }
  ok(!threw && demo && demo.cards, "the page mounts on the stub document" + (threw ? ": " + threw : ""));
  try {
    const card = () => demo.cards.el, btns = re => card().querySelectorAll("button").filter(b => re.test(b.textContent) || re.test(b.getAttribute("aria-label") || ""));
    const pressed = () => card().querySelectorAll(".lx-seg button").filter(b => b.getAttribute("aria-pressed") === "true").map(b => b.textContent).join();
    const pem20 = M.run(Y, 20, "spare", "pem"), alk20 = M.run(Y, 20, "spare", "alk");
    demo.cards.go(2);
    ok(/^PEM/.test(pressed()), "step 3 opens on the type in use (PEM), not on alkaline: " + pressed());
    btns(/^Alkaline/)[0].click();
    ok(/^Alkaline/.test(pressed()) && card().textContent.includes(alk20.hoursOn.toLocaleString("en-US")), "step 3: the reader's pick shows alkaline's hours");
    demo.cards.go(1);
    ok(card().textContent.includes(fm.h(pem20.hoursOn)) && !card().textContent.includes(fm.h(alk20.hoursOn)), "step 2 stays PEM, as its text says, after alkaline was picked in step 3");
    demo.cards.go(4);
    ok(/20 MW alkaline electrolyzer/.test(card().textContent), "step 5 names the type and size it uses (alkaline, chosen in step 3)");
    demo.cards.go(2); btns(/^PEM/)[0].click(); demo.cards.go(3);
    ok(/PEM electrolyzer/.test(card().textContent) && /best for the owner at/.test(card().textContent), "step 4 names the type; at $4.00 the owner builds");
    for (let i = 0; i < 4; i++) btns(/^Lower Hydrogen price/)[0].click();
    ok(/\$2\.00\/kg/.test(card().textContent) && /the owner's best choice is to build none/.test(card().textContent), "step 4 at $2.00: every size loses money and the owner builds none");
    // every note and line the cards assemble at run time stays within the text budget (40 words)
    const runtime = [];
    for (let k = 0; k < 7; k++) { demo.cards.go(k); card().querySelectorAll(".a16-note, .a16-ctx, .lx-saw, .lx-hint, li").forEach(e => runtime.push(e.textContent.replace(/\s+/g, " ").trim())); }
    const longRT = runtime.filter(t => /[A-Za-z]/.test(t) && t.split(" ").length > 40);
    ok(runtime.length > 15 && longRT.length === 0, "every runtime note and line is 40 words at most: " + longRT.map(t => t.slice(0, 50) + " (" + t.split(" ").length + ")").join(" | "));
  } catch (e) { ok(false, "the stub page test threw: " + (e && e.stack || e)); }
}

console.log(`test_a16-hydrogen-ptx: ${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
