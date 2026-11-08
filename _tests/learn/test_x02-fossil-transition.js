// test_x02-fossil-transition.js — Node tests for lesson X2 (assets/learn/x02-fossil-transition.js, its data file,
// a13-fairness-jobs.json and the page, learn/x02-fossil-transition.qmd):
//   - every number the page prints is computed from the data (vals): gas and coal shares of EIA's 2025 generation, the
//     2025 retirement plan in parts (planned = retired + delayed + cancelled), CO2 per kWh, capture capacity against
//     energy CO2; every {token} resolves and the templates type no number of their own; each number agrees with the
//     "where" line of its source
//   - the two teaching toys: the gas network's cost per remaining customer never below today's, rising with the share
//     who leave, lower when pipes are retired; the book value's unrecovered share; their worked answers recomputed
//   - IPCC's removal table as transcribed (Table 12.6; Cross-Chapter Box 8, Figure 1), the three sorts and their tie rule,
//     and the claim that no method leads every list, proved on the table
//   - Ridge County read from A13's file, labelled fictional
//   - the no-JS block, ideas, stop box, check, facts and sources equal what the model writes (--write rewrites them)
//   - neutrality and scope (the depth budget and the course's scope rules): no forecast, no verdict, no advocacy; no nuclear term, no data
//     centers, no "AI"; links on the allow-list; no project or Research page
//   - text budget of the step cards, reveals, data strings and the page's prose
// Usage (from the site folder):  node _tests/learn/test_x02-fossil-transition.js [--write]
"use strict";
const fs = require("fs");
const path = require("path");
const ID = "x02-fossil-transition";
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const M = require(L(ID + ".js"));
const S = require("./shelf_stop.js");
const RAW = fs.readFileSync(L("data/" + ID + ".json"), "utf8");
const D = JSON.parse(RAW);
const A = require(L("data/a13-fairness-jobs.json"));
const JS = fs.readFileSync(L(ID + ".js"), "utf8");
const SIDE = fs.readFileSync(path.join(SITE, "learn/_w1/" + ID + ".yml"), "utf8");
const PATHY = fs.readFileSync(path.join(SITE, "learn/path.yml"), "utf8");
const QPATH = path.join(SITE, "learn", ID + ".qmd");
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-9 : t);

// ---------------- the generated blocks
const BLOCKS = { "x02-fallback": () => M.staticFallback(D), "x02-ideas": () => M.ideasHTML(D), "x02-stop": () => S.stopHTML(D.stop, "x02"), "x02-check": () => M.checkHTML(D),
  "x02-facts": () => M.factsHTML(D), "x02-sources": () => M.sourcesHTML(D) };
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

// ---------------- every printed number from the data, and from its source line
const V = M.vals(D), src = k => D.sources[k].where;
ok(V.gasShare === "41%" && V.coalShare === "17%" && near(D.gen2025.gas / D.gen2025.total, 1811004 / 4425029) && /coal 734,928, natural gas 1,811,004 and total at utility-scale facilities 4,425,029/.test(src("eia-epa31a")), "gas 41% and coal 17% of 2025 utility-scale generation, recomputed from EIA's table");
ok(D.primary2025.petroleum === 38 && /petroleum was about 38%/.test(src("eia-facts")) && V.oilPrimary === "38%", "oil about 38% of 2025 primary energy (EIA)");
ok(near(D.oilUse.transport / 100, 2 / 3, 0.01) && V.oilTransport === "two-thirds" && /66\.6%/.test(src("eia-oiluse")), "two-thirds of 2022 petroleum to transport (66.6%)");
ok(D.gasUse.power === 40 && D.gasUse.industrial === 32 && D.gasUse.homes === 60 && /electric power 40%, industrial 32%/.test(src("eia-gasuse")) && /about 60% of U\.S\. homes/.test(src("eia-gasuse")), "gas use by sector, 2023, and homes (EIA)");
ok(V.lngBcfd === "15.1" && V.lngShare === "26%" && /15\.1 Bcf\/d in 2025, 26% of the global total/.test(src("eia-67864")) && /−260 °F/.test(src("eia-lng")) && /600 times smaller/.test(src("eia-lng")), "LNG: 15.1 Bcf/d, 26%; −260 °F and 600 times smaller (EIA)");
const R = M.retireParts(D);
ok(near(R.sum, R.planned, 1e-9) && R.planned === 8.5 && R.retired === 2.6 && R.delayed === 4.8 && R.cancelled === 1.1 && /2\.6 GW retired at four plants in 2025, the least since 2010, against 8\.5 GW planned; about 4\.8 GW delayed/.test(src("eia-67427")) && /1\.1 GW cancelled/.test(src("eia-67427")), "2025: retired + delayed + cancelled = planned (2.6 + 4.8 + 1.1 = 8.5 GW), as EIA reports");
ok(R.share < 1 / 3 && M.pct(R.share) === "31%", "under a third of the plan retired (31%)");
ok(D.retire.planned2026 === 6.4 && /6\.4 GW of coal scheduled to retire in 2026/.test(src("eia-67206")) && /may change more than usual/.test(M.retireSaw(D)) && /more subject to change than usual/.test(src("eia-67206")), "2026: 6.4 GW listed; EIA's caveat kept");
ok(V.mmst === "512.5" && V.employees === "44,060" && /512\.5 million short tons/.test(src("eia-acr")) && /44,060/.test(src("eia-acr")), "coal mines 2024: 512.5 MMst, 44,060 employees (EIA)");
ok(V.co2coal === "2.31" && V.co2gas === "0.96" && /coal 2\.31, natural gas 0\.96/.test(src("eia-co2kwh")) && V.gasVsCoal === "42%", "CO₂ per kWh 2023: coal 2.31, gas 0.96 lb; gas about 42% of coal's");
ok(V.ccsMt === "about 50 million tonnes" && V.co2Gt === "about 38 billion tonnes" && V.co2MtAll === "38,000" && V.ccsShare === "about 0.13%" && near(50 / 38000, 0.0013158, 1e-6) && /around 50 Mt CO₂ a year, two-thirds of it at natural gas processing/.test(src("iea-coal2025")) && /about 38 Gt/.test(src("iea-ger2026")), "capture capacity about 50 Mt against about 38 Gt: about 0.13% (IEA)");
ok(V.methane === "2.3%" && /2\.3% of gross U\.S\. gas production/.test(src("alvarez2018")), "methane 2.3% (Alvarez et al. 2018, abstract)");
// templates: every token resolves; no number typed outside tokens except the allowed literals
const templates = [].concat(D.map.nodes.map(n => n.text), D.map.nodes.map(n => n.open), D.systems.map(s => s.today), D.systems.map(s => s.number), D.systems.map(s => s.open),
  ...D.steelman.sides.map(s => s.points), D.facts.map(f => f.n), D.facts.map(f => f.what));
templates.forEach(t => { let e = null; try { M.fill(D, t); } catch (x) { e = x; } ok(!e, "tokens resolve: " + t.slice(0, 60)); });
const ALLOWED = /−260 °F|600 times|10,000\+?|\b(19[5-6]0s|2015|2018|2022|2023|2024|2025|2026)\b|\bCO₂\b|\[\[[^\]]*\]\]/g;
templates.forEach(t => ok(!/\d/.test(t.replace(/\{[a-zA-Z0-9]+\}/g, "").replace(ALLOWED, "")), "no typed number in: " + t.slice(0, 70)));
ok(!/\{[a-zA-Z0-9]+\}/.test(M.staticFallback(D) + M.ideasHTML(D) + M.factsHTML(D) + M.checkHTML(D)), "no token left unfilled on the page");

// ---------------- the teaching toys
{
  const G = D.gasNet, F = G.perCustomer;
  for (let s = G.min; s <= G.max + 1e-9; s += G.step) {
    const a = M.netCost(D, s, 0), b = M.netCost(D, s, 0.5);
    ok(a >= F - 1e-9 && b >= F - 1e-9 && b <= a + 1e-9 && near(a, F / (1 - s)) && near(b, F * (1 - 0.5 * s) / (1 - s)), "gas network at s = " + s.toFixed(2) + ": never below $" + F + ", lower with pipes retired");
  }
  let thrown = false; try { M.netCost(D, 0.7, 0); } catch (e) { thrown = true; } ok(thrown, "the share is bounded (s ≤ 0.6)");
  ok(M.money(M.netCost(D, 0.3, 0)) === "$714" && M.money(M.netCost(D, 0.3, 0.5)) === "$607", "30% gone: $714 with no pipe retired, $607 with half the leavers' share avoided");
  ok(M.netLine(D, 0.3, 0) === "With 30% of customers gone, each remaining customer pays **$714 a year** for the network, against $500 today (illustrative).", "step 3 line");
  ok(G.assume.map(a => a.avoid).join() === "0,0.5" && G.need === G.step && G.need > G.min && /teaching/.test(G.set) && /customers who stay/.test(G.set), "two assumptions, labelled as teaching values; each counts once some customers have left under it (one slider step)");
  ok(/Customers who leave the gas network entirely/.test(JS) && !/switch to electric heat/.test(JS) && /leave the network entirely/.test(M.STEPS[2]), "the slider counts customers who leave the network entirely, not those who switch heating (they may keep gas for cooking or water)");
  ok(M.netCount(1, 2) === "Assumptions tried with customers gone: 1 of 2." && /cnt\.textContent = netCount\(/.test(JS), "the step shows what opens Next: each assumption tried with customers gone");
  ok(/fixed costs of direct gas use are spread over fewer therms, potentially raising gas rates/.test(src("lbnl-2018")) && /p\. 40/.test(src("lbnl-2018")) && /spread over less gas sold, potentially raising gas rates/.test(M.netSaw(D)) && !/therm/.test(M.netSaw(D)), "the LBNL finding matches its source line (p. 40), in plain words (less gas sold, not therms)");
  const ck = M.checkHTML(D);
  ok(ck.indexOf("$500 ÷ (1 − 0.25) = $500 ÷ 0.75 = $667") > 0 && near(500 / 0.75, 666.67, 0.01), "the network question's worked answer shows its arithmetic");
  ok(ck.indexOf("0.96 ÷ 2.31 = 0.416, or 42%") > 0 && near(0.96 / 2.31, 0.4156, 1e-4), "the CO₂ question's worked answer shows its arithmetic");
  const B = D.book;
  for (let r = B.min; r <= B.max; r += B.step) ok(near(M.unrecovered(D, r), (B.life - r) / B.life) && M.unrecovered(D, r) >= 0, "book value: year " + r + " leaves " + M.pctx(M.unrecovered(D, r)));
  ok(M.bookLine(D, 25) === "Closing 25 years after opening leaves **37.5%** of the building cost [[stranded-cost|unrecovered]]: 15 of its 40 years of even recovery still to come (illustrative).", "step 4 line, exact (no rounding), with its arithmetic: 15 of 40 years left");
  for (let r = B.min; r <= B.max; r += B.step) { const m = M.bookLine(D, r).match(/: (\d+) of its (\d+) years/); ok(m && near(+m[1] / +m[2], M.unrecovered(D, r)), "the years left over the book life equal the unrecovered share at " + r + " years"); }
  ok(/teaching/.test(B.set) && /evenly/.test(B.set), "the book life is labelled as a teaching value, recovered evenly");
  ok(M.STEPS[3].indexOf("recovered evenly over " + B.life + " years") > 0, "step 4 states the even recovery over the data's book life");
  ok(/label: "Years since " \+ A\.ridgeCounty\.plant\.name \+ " opened"/.test(JS), "the slider reads years since opening");
}

// ---------------- Ridge County, from A13's file
{
  const RC = A.ridgeCounty;
  ok(M.ridgeLine(A) === "Ridge Station (2,400 MW) employs 450 people and its mines 700; coal pays 40% of the county's tax revenue." && RC.plant.mw === 2400 && RC.coalTaxShare === 0.4, "the explain layer's Ridge County line read from a13-fairness-jobs.json");
  ok((JS.match(/A\.ridgeCounty\.fiction/g) || []).length === 2 && /fictional/.test(RC.fiction), "the fiction line under the Ridge County step and its explain card, read from A13's file");
  const step4 = JS.split("{ text: STEPS[3]")[1].split("{ text: STEPS[4]")[0];
  ok(!/ridgeLine|BOOK_WHO|lessonRefHTML/.test(step4) && /H\("li", \{ text: ridgeLine\(A\) \}/.test(JS) && /H\("li", \{ html: LX\.rich\(BOOK_WHO\) \}/.test(JS), "step 4 keeps to repayment; jobs, taxes and who pays are in the explain layer");
  ok(!/2,?400|450 people|\b700\b/.test(RAW), "Ridge County's numbers are not retyped in X2's data");
  ok(/\["A13", /.test(JS) && /LX\.lessonRefHTML\(P, "A13"\)/.test(JS), "A13 is linked for Ridge County");
}

// ---------------- the removal table (IPCC AR6 WGIII Table 12.6; Cross-Chapter Box 8, Figure 1)
{
  const T = { daccs: [[6, 6], [100, 300], "5 to 40", 2], beccs: [[5, 6], [15, 400], "0.5 to 11", 2], ew: [[3, 4], [50, 200], "2 to 4", 2], biochar: [[6, 7], [10, 345], "0.3 to 6.6", 1], ar: [[8, 9], [0, 240], "0.5 to 10", 1], scs: [[8, 9], [-45, 100], "0.6 to 9.3", 1] };
  D.cdr.rows.forEach(r => { const t = T[r.key]; ok(t && r.trl.join() === t[0].join() && r.cost.join() === t[1].join() && r.potential === t[2] && r.storeRank === t[3], r.key + ": readiness, cost range, potential and storage as IPCC's table gives them"); });
  ok(D.cdr.rows.every(r => (r.storeRank === 2) === /10,000 years or longer/.test(r.store) && (r.storeRank === 1) === /decades to centuries/.test(r.store)), "storage time words match the rank (Figure 1's timescales)");
  ok(M.sortOrder(D, "store").join() === "daccs,beccs,ew,biochar,ar,scs" && M.sortOrder(D, "trl").join() === "ar,scs,biochar,daccs,beccs,ew" && M.sortOrder(D, "cost").join() === "scs,ar,biochar,beccs,ew,daccs", "the three orders, ties kept in the table's order");
  const long = D.cdr.rows.filter(r => r.storeRank === 2), ready = D.cdr.rows.filter(r => r.trl[0] >= 8);
  ok(long.every(r => r.trl[1] <= 6) && ready.length && ready.every(r => r.storeRank === 1) && /readiness of 6 or below/.test(M.cdrSaw(D)) && /\(8 to 9\) store carbon for decades to centuries/.test(M.cdrSaw(D)), "'no method leads every list' holds on the table");
  ok(M.cdrRows(D).filter(r => r.key === "scs")[0].cost === "$−45 to $100" && M.cdrRows(D).filter(r => r.key === "daccs")[0].trl === "6", "a negative low end and a single readiness print plainly");
  ok(/different dollar years, not adjusted to one year/.test(D.cdr.note) && /below zero is an estimated net saving/.test(D.cdr.note) && /not today's scale/.test(D.cdr.note2), "cost ranges (a negative low end a net saving) and potentials labelled for what they are");
  ok(/1 = basic principles described, 9 = proven in operation/.test(D.cdr.trlScale) && /net removal/.test(D.cdr.beccsWhy) && /take CO₂ from the air as they grow/.test(D.cdr.beccsWhy) && /land-carbon losses/.test(D.cdr.beccsWhy), "the readiness scale's ends, and why BECCS can count as removal, said beside the table");
  const fb = M.staticFallback(D);
  ok(M.cdrNotes(D).every(t => fb.indexOf(t) > 0) && D.cdr.rows.every(r => fb.indexOf(r.measure) > 0) && /<th scope="col">Measuring it<\/th>/.test(fb), "the no-JS table has the measuring column, the readiness scale and every note the live table has");
  ok(/billion tonnes/.test(M.POT_LABEL) && !/\bGt\b|\bMt\b/.test(JS.replace(/\/\/[^\n]*/g, "") + RAW.replace(/"(where|title|short)": "[^"]*"/g, "")), "million and billion tonnes spelled out (Mt and Gt only in source lines)");
  ok(/Table 12\.6/.test(src("ipcc-ch12")) && /Cross-Chapter Box 8/.test(src("ipcc-ch12")) && /capture applied to fossil fuel use is not removal/.test(src("ipcc-ch12")), "IPCC source line names the table and the box");
  ok(/hard to monitor/.test(D.cdr.rows.filter(r => r.key === "scs")[0].measure) && /poorly quantified/.test(D.cdr.rows.filter(r => r.key === "ew")[0].measure) && /reverse/.test(D.cdr.rows.filter(r => r.key === "ar")[0].measure), "measurement words follow IPCC's");
}

// ---------------- predictions, feedback and the Steelman card
{
  const Q = D.predictRetire, fb = M.retireFeedback(D);
  ok(Q.answer === "third" && Q.options.every(o => fb[o.value] && fb[o.value].indexOf("2.6 GW retired, 31% of the plan") > 0) && /^Yes/.test(fb.third) && /^No/.test(fb.all) && /^No/.test(fb.two), "step 2: answer and feedback true for every choice");
  const C = D.predictCcs;
  ok(C.answer === "no" && C.options.every(o => C.feedback[o.value]) && /^Yes/.test(C.feedback.no) && /^No/.test(C.feedback.yes) && /^No/.test(C.feedback.ten), "step 5: answer and feedback for every choice");
  ok(M.ccsLine(D) === "Capture capacity worldwide: about 50 million tonnes of CO₂ a year (IEA, December 2025). Compared with 2025's energy CO₂, about 38 billion tonnes, that capacity is about 0.13%, even running full all year.", "step 5 line: capacity compared with a year's emissions, labelled as capacity");
  ok(/used instead may be released again/.test(M.CCS_SAW) && /used instead may be released again/.test(M.ideasHTML(D)) && D.systems.filter(x => x.key === "ccs")[0].today.indexOf("used instead may be released again") > 0 && !/store it underground or use it/.test(RAW), "capture with durable storage told apart from use, which may release the CO₂ again");
  ok(/capacity is not emissions avoided/.test(D.facts.filter(f => f.src === "iea-coal2025")[0].what), "capacity is not emissions avoided");
  const SM = M.steelmanSpec(D);
  ok(SM.sides.length === 3 && SM.sides[0].points[0].indexOf("0.96 pounds") > 0 && SM.sides[0].points[1].indexOf("41%") >= 0 && SM.sides[1].points[1].indexOf("2.3%") > 0 && /abstract/.test(SM.sides[1].points[1]) && /takes no side/.test(SM.note), "the Steelman card: both cases with dated numbers, no side taken");
  ok(/1950s and 1960s/.test(SM.sides[1].points[0]) && /1950s and 1960s/.test(src("eia-pipelines")) && /EIA reported in March 2024/.test(SM.sides[1].points[0]) && /19 March 2024/.test(D.sources["eia-pipelines"].date) && !/today's mainline/.test(RAW), "the pipelines' age matches its source line, dated at the point of use");
  ok(!/per kWh burned/.test(RAW + JS) && /per kWh of electricity generated/.test(SM.sides[0].points[0]) && /per kWh of electricity generated/.test(M.checkHTML(D)), "CO₂ per kWh of electricity generated, not per kWh burned");
}

// ---------------- the map
{
  const Mp = M.mapSpec(D), ids = Mp.nodes.map(n => n.id);
  ok(Mp.nodes.length === 9 && Mp.edges.every(e => ids.includes(e[0]) && ids.includes(e[1]) && e[2]), "nine parts; every link names two of them");
  ok(new Set(Mp.nodes.map(n => n.at.join())).size === 9 && new Set(Mp.nodes.map(n => n.atN.join())).size === 9, "no two parts share a place, wide or narrow");
  ok(Mp.nodes.every(n => n.game && n.text) && Mp.gameLabel === "Open question" && D.map.need === 4 && M.mapCount(4, 4) === "Parts opened: 4 of 9." && M.mapCount(1, 4) === "Parts opened: 1 of at least 4.", "each part has its role and its open question; the count opens Next at four");
  ["lng", "gasnet", "gaspower", "coal", "mines", "oil", "ccs", "cdr"].forEach(k => ok(ids.includes(k), "the row's parts: " + k));
}

// ---------------- sources, stop box
ok(Object.values(D.sources).every(s => s.url && s.date && s.where && s.short && s.publisher && s.title && /\b20\d\d\b/.test(s.date)), "every source complete and dated");
const used = new Set([].concat(D.facts.map(f => f.src), [D.gen2025.src, D.primary2025.src, D.gasUse.src, D.oilUse.src, D.lng.src, D.retire.src, D.retire.src2026, D.mines.src, D.co2kwh.src, D.ccs.src, D.energyCo2.src, D.methane.src, D.gasNet.src, D.cdr.src, D.gen2025.srcScale, D.units.srcMW, D.units.srcTon, "eia-lng", "eia-pipelines"]));
ok(Object.keys(D.sources).every(k => used.has(k)), "every source is used: " + Object.keys(D.sources).filter(k => !used.has(k)).join(", "));
ok(S.problems(D.stop).length === 0, "the stop box has its parts: " + S.problems(D.stop).join("; "));
ok(/no forecasts/.test(D.stop.lede) && D.stop.leaves.some(t => /Forecasts/.test(t)) && D.stop.leaves.some(t => /Engineering design/.test(t)) && D.stop.leaves.some(t => /Advocacy/.test(t)), "the stop box states the curriculum's boundary (forecasts, engineering design, advocacy excluded)");
ok(/ipcc\.ch\/report\/ar6\/wg3\/chapter\/chapter-12/.test(RAW) && /Global Energy Monitor/.test(RAW) && /eia\.gov\/energyexplained\/natural-gas/.test(RAW), "the reading ladder is the curriculum's (IPCC chapters 6 and 12, EIA gas data, Global Energy Monitor)");

// ---------------- neutrality and scope
// the page's own words: the generated learn:* blocks repeat other lessons' descriptions (a prerequisite's "does" line,
// e.g. F10's, which names nuclear among its accounting conventions), so the scope checks read the page without them
const OWNPAGE = PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?<!-- learn:\1:end -->/g, "");
const ALL = OWNPAGE + "\n" + RAW + "\n" + JS + "\n" + SIDE;
const PROSEALL = ALL.replace(/\/\/[^\n]*/g, "");
ok(!/nuclear|reactor|\bSMR\b|small modular|fission|uranium/i.test(ALL), "no nuclear term");
ok(!/data[- ]?cent/i.test(ALL), "no data centers on this page");
ok(!/\bAI\b|artificial intelligence/.test(ALL), "no 'AI'");
ok(!/projects\/|research\.html|smr-dc/.test(ALL), "no project page and no Research page");
ok(!/learning[- ](curve|rate)|order[- ]book/i.test(ALL), "deny-listed terms absent");
ok(!/\b(will|would) (reach|close|retire|grow|fall|rise|decline|double|disappear|end)\b|by 20[3-9]\d|in 20[3-9]\d/i.test(PROSEALL), "no forecast: no future year, no 'will close'");
ok(!/\bshould\b|\bbest (method|fuel|option)\b|\bwe recommend\b|\bmust (phase|ban|keep)\b/i.test(PROSEALL), "no verdict or advocacy words");
const hrefs = [...OWN.matchAll(/href="([^"]+)"/g)].map(m => m[1].replace(/&amp;/g, "&")).concat(Object.values(D.sources).map(s => s.url));
ok(hrefs.every(h => S.linkOK(h) || /^[0-9a-z-]+\.html(#[a-z-]+)?$/.test(h) || /^#/.test(h)), "links on the allow-list (" + hrefs.filter(h => !(S.linkOK(h) || /^[0-9a-z-]+\.html(#[a-z-]+)?$/.test(h) || /^#/.test(h))).join(", ") + ")");
["A13", "F11", "A21", "A20", "X3"].forEach(c => ok(new RegExp('\\["' + c + '",').test(JS), c + " is named through LX.lessonRefHTML"));
const ROW = PATHY.split("id: x02-fossil-transition")[1].split("\n- ")[0];
ok(/code: X2/.test(ROW) && /\n  minutes: 15\n/.test(ROW) && /\n  practice_minutes: 10/.test(ROW) && /status: active/.test(ROW) && /after: \[F10, F11\]/.test(ROW), "path.yml: X2 is 15 + 10 minutes, after F10 and F11");

// ---------------- text budget
const nWords = S.nWords, nSent = S.nSent;
ok(M.STEPS.length === 7, "seven step cards");
M.STEPS.forEach((t, i) => { const n = nWords(t); ok(n >= 18 && n <= 36, "step " + (i + 1) + ": " + n + " words"); ok(nSent(t) <= 2, "step " + (i + 1) + ": " + nSent(t) + " sentences"); });
ok(/planned to retire 8\.5 GW/.test(M.STEPS[1]) && D.retire.planned2025 === 8.5, "step 2's 8.5 GW is the data's");
const lines = [M.retireSaw(D), M.MAP_SAW, M.netLine(D, 0.6, 0), M.netSaw(D), M.bookLine(D, 10), M.BOOK_WHO, M.BOOK_SAW, M.ridgeLine(A), M.ccsLine(D), M.CCS_SAW, M.cdrSaw(D), D.cdr.note]
  .concat(Object.values(M.retireFeedback(D)), Object.values(D.predictCcs.feedback), D.gasNet.assume.map(a => a.line), D.cdr.rows.map(r => r.measure), D.cdr.sorts.map(s => s.note), templates.map(t => M.fill(D, t)), D.stop.includes, D.stop.leaves, D.stop.ladder.map(r => r.text), [D.steelman.note], M.cdrNotes(D), [M.netCount(1, 2)]);
lines.forEach(t => { ok(nWords(t) <= 36, "a text of " + nWords(t) + " words: " + S.plain(t).slice(0, 60)); ok(nSent(t) <= 2, "a text of " + nSent(t) + " sentences: " + S.plain(t).slice(0, 60)); });
const PROSE = OWN.replace(/^---[\s\S]*?\n---\n/, " ").replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<!-- x02-(sources|facts|stop):start[\s\S]*?:end -->/g, " ")
  .replace(/<!--[\s\S]*?-->/g, " ").replace(/^- (.*)$/gm, "<li>$1</li>");
PROSE.split(/<\/?(?:p|li|dd|dt|td|th|summary|br|caption|h3|h4)\b[^>]*>/).map(S.plain).filter(x => /[A-Za-z]/.test(x) && !/^[:{]/.test(x)).forEach(x => {
  const n = nWords(x); ok(n <= 40, "text element of " + n + " words: " + x.slice(0, 70)); ok(nSent(x) <= 2, "text element of " + nSent(x) + " sentences: " + x.slice(0, 70)); });

// ---------------- first-use words, denominators, and the no-JS block's coverage
{
  const mp = M.mapSpec(D), node = id => mp.nodes.filter(n => n.id === id)[0].text, sys = k => M.systemRows(D).filter(r => r.key === k)[0];
  ok(D.units.utilityMinMW === 1 && /at least one megawatt/.test(src("eia-faq427")) && node("gaspower").indexOf("utility-scale plants (1 MW or larger)") > 0 && sys("gaspower").today.indexOf("utility-scale plants (1 MW or larger)") > 0, "utility-scale is explained where it first appears (1 MW or larger, EIA)");
  ok(D.units.shortTonLb === 2000 && /2,000 pounds/.test(src("eia-glossary")) && node("mines").indexOf("short tons (U.S. tons of 2,000 pounds)") > 0 && sys("coal").today.indexOf("short tons (2,000 pounds each)") > 0, "short tons are told apart from tonnes (2,000 pounds, EIA)");
  ok(!/\d lb\b|\blb of\b/.test(RAW + JS + M.checkHTML(D) + M.staticFallback(D)), "pounds spelled out, not lb");
  ok(node("gasnet") === "Share of U.S. gas use in 2023: power plants 40%, industry 32%. Share of U.S. homes that use gas: about 60%.", "the gas-network node keeps its two denominators apart, each labelled");
  ok(/^Bioenergy \(energy from plant matter\)/.test(D.cdr.rows.filter(r => r.key === "beccs")[0].name) && /^New and restored forests \(afforestation and reforestation\)$/.test(D.cdr.rows.filter(r => r.key === "ar")[0].name), "bioenergy and afforestation are said in plain words");
  ok(/bicarbonate dissolved in water or as carbonate minerals/.test(D.cdr.rows.filter(r => r.key === "ew")[0].measure) && /reacts with CO₂, which ends up as bicarbonate in water or in carbonate minerals/.test(M.checkHTML(D)) && !/stores carbon in minerals/.test(RAW + JS + PAGE), "enhanced weathering: the carbon ends up dissolved or in minerals");
  const ccsF = D.facts.filter(f => f.src === "iea-coal2025")[0], co2F = D.facts.filter(f => f.src === "iea-ger2026")[0];
  ok(ccsF && co2F && !/co2Gt/.test(ccsF.what + ccsF.n) && co2F.n === "{co2Gt}" && /2025/.test(co2F.what), "capture capacity and energy CO₂ are two fact rows, each with its own source");
  const fb = M.staticFallback(D);
  ok(fb.indexOf(M.netLine(D, 0.3, 0).replace(/\*\*/g, "")) > 0 && fb.indexOf(M.netLine(D, 0.3, 0.5).replace(/\*\*/g, "")) > 0 && fb.indexOf(M.bookLine(D, 25).replace(/\*\*/g, "").replace(/\[\[[^|\]]+\|([^\]]+)\]\]/g, "$1")) > 0, "the no-JS block works both gas-network assumptions and the early closure");
  ok(D.gasNet.assume.every(a => fb.indexOf(a.line) > 0), "the no-JS block states each assumption before its worked number");
  ok(M.steelmanSpec(D).sides.every(sd => sd.points.every(t => fb.indexOf(t.replace(/\[\[[^|\]]+\|([^\]]+)\]\]/g, "$1")) > 0)), "the no-JS block carries both gas cases and what would tell them apart");
  fb.replace(/<table[\s\S]*?<\/table>/g, " ").split(/<\/?(?:li|p)\b[^>]*>/).map(S.plain).filter(x => /[A-Za-z]/.test(x)).forEach(x => ok(nWords(x) <= 38 && nSent(x) <= 2, "no-JS element of " + nWords(x) + " words, " + nSent(x) + " sentences: " + x.slice(0, 60)));
  // the sources: citation, then a short evidence note on its own line, each note within the text budget
  ok((M.sourcesHTML(D).match(/<br><span class="x2-where">/g) || []).length === Object.keys(D.sources).length, "each source's evidence note is on its own line");
  Object.keys(D.sources).forEach(k => { const w = D.sources[k].where; ok(nWords(w) <= 36 && nSent(w) <= 2, "source note " + k + ": " + nWords(w) + " words, " + nSent(w) + " sentences"); });
}

// ---------------- controls and glossary
ok(/aria-live/.test(JS) && (JS.match(/LX\.demo\(/g) || []).length === 1 && (JS.match(/demo\[\d\] = function/g) || []).length === 7, "live regions; a demo hook with an action for each of the seven steps");
["lng", "bcf", "carbon-capture", "carbon-removal", "technology-readiness"].forEach(t => ok(new RegExp("id: " + t + "\\b").test(SIDE) && new RegExp("\\[\\[" + t + "\\|").test(JS + RAW), "the sidecar defines " + t + " and the page marks it"));
ok(/\[\[lock-in\|lock-in\]\]/.test(M.STEPS[6]) && /id: lock-in\b/.test(SIDE), "step 7 says what a bridge and a lock-in are, and marks lock-in");
ok((RAW.match(/\[\[primary-energy\|primary energy\]\]/g) || []).length === 2 && /data-term=\\"primary-energy\\"/.test(JS), "primary energy carries its glossary mark (F3's term)");
ok(/role: "group", "aria-label": "Assumption about the pipes"/.test(JS), "the assumption buttons are a labelled group");

console.log((fails ? "FAILED " + fails + " of " : "ok: ") + checks + " checks (" + ID + ")");
process.exit(fails ? 1 : 0);
