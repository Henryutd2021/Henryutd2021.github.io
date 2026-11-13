// test_a11-lca-nexus.js — Node tests for A11 (assets/learn/a11-lca-nexus.js, its data file and page).
//   - first principles: litres to gallons (3.785411784), acres to square metres (4,046.8564224), ha per TWh a year to m²
//     per MWh a year, LBNL's direct water per kWh (66 billion litres / 176 TWh), its indirect 4.52 litres per kWh against
//     "nearly 800 billion litres" over 176 TWh, the solar density 1 acre / 394 MWh, the gas footprint 410 and spacing 1,900
//     ha per TWh a year, the gas stack from A10's EIA heat rate (7.535 x 52.91), F8's campus (240 MW x 8,760 h)
//   - NREL's phases: solar's add to its total median (43); gas's add to 460.82 against a 486 median (said on the page);
//     the brochure's 9 times and the fair 11 times; the consequential changes against not building the farm (−417, +43,
//     +43: an existing wind farm's upkeep goes on), with their arithmetic shown
//   - the boundary: every contiguous boundary of every object, footprint, cooling and land rule: the total inside is the
//     sum of its counted stages; stages not counted are listed and never added; gas land inside both stages is the
//     whole total, one stage alone is a bound (over / under)
//   - every number on the page (fallbacks, myths, quiz, Go deeper, numbers to remember, sources) against the model; the
//     no-JS blocks equal the model's (--write rewrites them)
//   - scope: no nuclear term in the lesson's own files; data centers only as a load; links on allowed hosts; text budget
//     (steps, page elements and every line the page assembles, for every input: 35 words and two sentences at most);
//     glossary marks; the wording (units per kWh or MWh made or used, withdrawal, the drought, the illustrative
//     land scaling, the stack check's date and load, the water boundary)
//   - the page on a stub document: every step's action, the boundary's handles (keyboard) and tiles (tap)
// Usage (from the site folder):  node _tests/learn/test_a11-lca-nexus.js [--write]
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ID = "a11-lca-nexus";
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const M = require(L(ID + ".js"));
const J = p => JSON.parse(fs.readFileSync(L("data/" + p), "utf8"));
const D = J(ID + ".json"), A10 = J("a10-emissions-questions.json"), F8 = J("f08-large-loads.json"), PATHJ = J("path.json");
const JS = fs.readFileSync(L(ID + ".js"), "utf8");
const QPATH = path.join(SITE, "learn", ID + ".qmd"), SIDEP = path.join(SITE, "learn/_w1", ID + ".yml");
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-9 : t);

// ---------------- the no-JS blocks
const BLOCKS = { "a11-fallback": () => M.fallbackHTML(D), "a11-ideas": () => M.explainHTML(D) };
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
const PAGE0 = PAGE.replace(/ data-label="[^"]*"/g, "");
const onPage = (s, what) => ok(PAGE0.includes(s), `page states ${what}: "${s}"`);
Object.keys(BLOCKS).forEach(k => { const r = between(PAGE, k); ok(r && PAGE.slice(r.from, r.to) === BLOCKS[k]() + "\n", k + ": the page's no-JS block equals the model's (run with --write after a data edit)"); });

// ---------------- sources: every one on an allowed host, with a date
const HOSTS = /^https:\/\/((docs\.)?nlr\.gov|doi\.org|emp\.lbl\.gov|www\.usgs\.gov|www\.eia\.gov)\//;
Object.keys(D.sources).forEach(k => { const s = D.sources[k]; ok(HOSTS.test(s.url) && /\d{4}/.test(s.asOf) && s.label.length > 10, "source " + k + ": allowed host, label and date"); });
const used = new Set();
["solar", "gas", "dc"].forEach(o => ["carbon", "water", "land"].forEach(m => M.STAGES.forEach(s => { const e = D.objects[o][m][s]; if (e.src) used.add(e.src); })));
ok([...used].every(k => D.sources[k]), "every stage's source key is in the sources list: " + [...used].join(", "));

// ---------------- first principles
const LPG = 3.785411784, ACRE = 4046.8564224;
ok(D.litresPerGallon === LPG && D.land.acreM2 === ACRE, "conversions: 1 US gallon = 3.785411784 litres; 1 acre = 4,046.8564224 m² (exact)");
const V = M.dcVals(D);
ok(near(V.directL, 66 / 176) && near(V.direct, 66 / 176 * 1000 / LPG) && Math.round(V.direct) === 99, "data center on site: 66 billion litres / 176 TWh = 0.375 litres per kWh = 99 gallons per MWh");
ok(near(V.indirect, 4.52 * 1000 / LPG) && Math.round(V.indirect) === 1194, "data center indirect: 4.52 litres per kWh = 1,194 gallons per MWh");
ok(Math.abs(D.dcData.indirectL2023 / D.dcData.twh2023 - D.dcData.indirectLperKWh) / D.dcData.indirectLperKWh < 0.01, "LBNL's 'nearly 800 billion litres' over 176 TWh agrees with its 4.52 litres per kWh (within 1%)");
ok(V.ghg === 340 && Math.round(V.indirect / V.direct) === 12, "data center: 0.34 kg = 340 g CO₂e per kWh; indirect water about 12 times direct");
ok(near(M.landPv(D, false), ACRE / 394) && M.num("land", M.landPv(D, false)) === "10.3", "solar land: 1 acre / 394 MWh a year = 10.3 m² per MWh a year (tracking, 2019 median)");
ok(near(M.landPv(D, true), ACRE / 394 * 1375 / 945) && M.num("land", M.landPv(D, true)) === "14.9", "solar with the land between: x 1,375 / 945 acres = 14.9");
ok(near(M.landPvFixed(D), ACRE / 447) && M.num("land", M.landGas(D, false)) === "4.1" && M.num("land", M.landGas(D, true)) === "19.0", "fixed tilt 9.1; gas footprint 410 ha per TWh a year = 4.1 m² per MWh a year, spacing 1,900 = 19.0");
ok(M.landGas(D, true) > M.landPv(D, true) && M.landGas(D, false) < M.landPv(D, false), "the order of solar and gas land reverses when the land between counts (as the page says)");
ok(near(M.stack(A10), 7.535 * 52.91) && M.grp(M.stack(A10)) === "399", "A10's stack check: 7.535 MMBtu per MWh x 52.91 kg per MMBtu = 399 g per kWh");
const C = M.campus(D, F8);
ok(F8.campus.drawMW === 240 && C.mwh === 240 * 8760 && near(C.co2, 240 * 8760 * 0.34, 1e-6), "F8's campus: 240 MW x 8,760 h = 2,102,400 MWh a year; CO₂e at 0.34 t per MWh");
ok(M.billions(C.direct + C.indirect) === "2.7 billion" && near(C.direct + C.indirect, 2102400 * (66 / 176 + 4.52) * 1000 / LPG, 1e-3), "the campus's water at the U.S. averages: 2.7 billion gallons a year");
// NREL's phases
const sc = D.objects.solar.carbon, gc = D.objects.gas.carbon;
ok(sc.build.v + sc.supply.v + sc.run.v + sc.end.v === D.nrelTotals.solar && D.nrelTotals.solar === 43, "solar's NREL phases add to its total median, 43");
ok(near(gc.build.v + gc.supply.v + gc.run.v + gc.end.v, 460.82, 1e-9) && D.nrelTotals.gas === 486, "gas's NREL phases add to 460.82; the total median is 486 (medians need not add)");
ok(M.grp(M.full(D, "gas", "carbon").v) === "461" && M.wholeNote(D, "gas", "carbon", 0, 3) === "stages added; whole-life median 486", "the page says 461 with the whole-life median beside it");
ok(Math.round(M.brochureRatio(D)) === 9 && Math.round(M.fairRatio(D)) === 11, "the brochure's 389 / 43 = 9 times; on one boundary 486 / 43 = 11 times");
ok(M.consequential(D, "gas") === 43 - 71 - 389 && M.signed(M.consequential(D, "gas")) === "−417" && M.consequential(D, "spill") === 43 && M.consequential(D, "wind") === 43 && M.avoided(D, "wind") === 0,
  "consequential changes: 43 − (71 + 389) = −417; spilled +43; existing wind's upkeep goes on, so +43");
ok(M.consArith(D, "gas") === "43 − (71 + 389) = −417" && M.consArith(D, "wind") === "43 − 0 = +43" && M.consArith(D, "spill") === "43 − 0 = +43", "the consequential arithmetic is shown: 43 − (71 + 389) = −417; 43 − 0 = +43");
ok(M.lineCons(D, "gas").includes("against not building the farm") && M.lineCons(D, "gas").includes("417 g avoided, not removed"), "the consequential line names its baseline and says avoided, not removed");
// water
const cool = id => M.coolingOf(D, id);
ok(cool("tower").use === 205 && cool("tower").wd === 255 && cool("once").use === 100 && cool("once").wd === 11380 && cool("dry").use === 2 && cool("pond").wd === 5950, "Macknick et al. medians: tower 255 / 205, once-through 11,380 / 100, pond 5,950 / 240, dry 2 / 2");
ok(D.cooling.every(c => c.useLo <= c.use && c.use <= c.useHi && c.wdLo <= c.wd && c.wd <= c.wdHi && c.use <= c.wd), "every cooling median sits in its range, and consumption is at most withdrawal");
ok(M.full(D, "solar", "water").v === 81 + 1 && M.full(D, "gas", "water", { cooling: "tower" }).v === 1 + 16 + 205, "water cradle to grave: solar 81 + 1 = 82; gas 1 + 16 + 205 = 222 with a tower");
const U = D.usgs;
ok((U.freshWithdrawal / 1000).toFixed(1) === "59.9" && (U.consumptive / 1000).toFixed(1) === "2.4" && Math.round(U.consumptive / U.freshWithdrawal * 100) === 4, "USGS 2020: 59.9 billion gallons a day withdrawn, 2.4 consumed, about 4%");
// drought
const dr = D.drought.summer;
ok(100 - dr.median.hydro - dr.median.gas === 40 && 100 - dr.drought.hydro - dr.drought.gas === 42, "drought: other in-state sources 40% and 42%");
// units and wording
ok(M.unitLine("solar", "carbon") === "carbon in g CO₂e per kWh made (= kg per MWh)" && M.unitLine("dc", "water") === "water in gallons consumed per MWh used" && M.unitLine("gas", "land") === "land in m² held per MWh made in a year",
  "the header names each footprint's own denominator, made or used (no 'per MWh' over a g-per-kWh number)");
ok(["solar", "gas", "dc"].every(k => !/per MWh/.test(D.objects[k].per)), "the objects' 'per' says per unit of electricity, not per MWh");
ok(!/more cooling water\./.test(M.lineDrought(D, true)) && /this page does not total it/.test(M.lineDrought(D, true)) && !/more cooling water consumed/.test(JS), "the drought line does not claim a water result the page does not compute");
ok(/illustrative/.test(M.lineLand(D, true)) && /In this example/.test(M.lineLand(D, true)) && /illustrative/.test(M.stage(D, "solar", "land", "run", { wide: true }).note), "solar's land between is labelled an illustrative scaling");
ok(/2025/.test(M.stackHint(A10)) && /full load/.test(M.stackHint(A10)) && /\[\[heat-rate\|/.test(M.stackHint(A10)) && /2025/.test(A10.plains.sources.heat.asOf) && /full load/.test(A10.plains.sources.heat.label), "the stack check names EIA's 2025 tested full-load heat rate (as A10's source says)");
ok(!/returns most/.test(SIDE) && !/returns most of it/.test(JS), "withdrawal is not said to return most of the water (a cooling tower consumes about 80%)");
ok(!/land and water of mines/.test(JS) && !/factories' land and water/.test(PAGE), "the stated exclusions match the water data (Build water includes making and building)");

// ---------------- the boundary: every contiguous boundary, object, footprint, cooling and land rule
let nb = 0, bad = [];
["solar", "gas", "dc"].forEach(o => ["carbon", "water", "land"].forEach(m => D.cooling.forEach(c => [false, true].forEach(w => {
  for (let l = 0; l < 4; l++) for (let r = l; r < 4; r++) {
    nb++; const opt = { cooling: c.id, wide: w }, res = M.inside(D, o, m, l, r, opt), st = [];
    for (let i = l; i <= r; i++) st.push(M.stage(D, o, m, M.STAGES[i], opt));
    // a stage published inside another ("with": water's End of life inside Build) counts only when its partner is inside too;
    // alone it has no separate number ("sep", never 0), and a partner inside without it says it includes it ("incl")
    const E = D.objects[o][m], pin = sid => { const j = M.STAGES.indexOf(E[sid].with); return j >= l && j <= r; };
    const counted = st.filter(s => s.kind === "num" || s.kind === "none" || (s.kind === "with" && pin(s.sid))), bnd = st.filter(s => s.kind === "bound"), nc = st.filter(s => s.kind === "nc");
    const sep = st.filter(s => s.kind === "with" && !pin(s.sid)), incl = M.STAGES.filter((sid, j) => (j < l || j > r) && E[sid].with && pin(sid));
    let want = counted.reduce((a, s) => a + s.v, 0);
    if (bnd.length === 2) want += bnd[0].joint; else if (bnd.length === 1) want += bnd[0].v;
    const good = near(res.v, want, 1e-9) && res.nc.length === nc.length && res.sep.length === sep.length && res.incl.length === incl.length &&
      (bnd.length === 1 ? res.kind === "bound" : res.kind === (counted.length + bnd.length ? "num" : sep.length ? "sep" : "nc"));
    if (!good) bad.push([o, m, c.id, w, l, r].join("/"));
  }
}))));
ok(nb === 3 * 3 * 4 * 2 * 10 && bad.length === 0, "every boundary (" + nb + "): the total is the sum of its counted stages, uncounted stages listed, gas land a bound unless both stages are in: " + bad.slice(0, 4).join(" "));
ok(M.totalText("water", M.inside(D, "solar", "water", 3, 3)) === "not separate (in Build)" && M.totalText("water", M.inside(D, "gas", "water", 3, 3, { cooling: "tower" })) === "not separate (in Build)", "water, End of life alone: not separate (it is published inside Build), never a false 0");
ok(["solar", "gas"].every(o => { const r = M.inside(D, o, "water", 2, 3, { cooling: "tower" }); return r.kind === "num" && r.sep.length === 1 && /End of life not separate: it is in Build, outside/.test(M.totalText("water", r)); }) && /r\.sep\.length\) H\("small", \{ text: "End of life missing/.test(JS), "water, On site to End of life: the total says End of life's water is missing (it is in Build), in the text and the readout");
for (let l = 0; l < 4; l++) for (let r = l; r < 4; r++) ["solar", "gas"].forEach(o => { const x = M.inside(D, o, "water", l, r, { cooling: "tower" }); if (x.sep.length && x.kind === "num" && !/not separate/.test(M.totalText("water", x))) ok(false, "a water total that leaves out End of life says so: " + o + " " + l + "-" + r); });
ok(/Build includes End of life/.test(M.totalText("water", M.inside(D, "solar", "water", 0, 0))) && /Build includes End of life/.test(M.totalText("water", M.inside(D, "gas", "water", 0, 2, { cooling: "tower" }))) && !/includes/.test(M.totalText("water", M.full(D, "gas", "water", { cooling: "tower" }))), "water, Build without End of life: the total says Build includes End of life");
ok(M.val("land", M.stage(D, "gas", "land", "supply")) === "over 3.69" && M.val("land", M.stage(D, "gas", "land", "run")) === "under 0.41" && M.totalText("land", M.inside(D, "gas", "land", 2, 2)).startsWith("under 0.41 ") && M.val("land", M.stage(D, "gas", "land", "run", { wide: true })) === "under 1.9", "gas land bounds keep two decimals: over 3.69, under 0.41 (rounding never tightens a bound)");
ok(M.inside(D, "gas", "land", 1, 1).dir === "over" && M.inside(D, "gas", "land", 2, 2).dir === "under" && near(M.inside(D, "gas", "land", 1, 2).v, 4.1, 1e-12), "gas land: Supply alone is 'over' 90%, the site alone 'under' 10%, both together the whole 4.1");
ok(M.val("water", M.stage(D, "solar", "water", "end")) === "in Build" && M.val("carbon", M.stage(D, "dc", "carbon", "build")) === "not counted" && M.val("carbon", M.stage(D, "solar", "carbon", "build")) === "about 28", "stage labels: 'in Build', 'not counted', NREL's approximate values 'about'");

{ const g = D.consequential.find(c => c.id === "gas").note; ok(/per MWh|a MWh/.test(g) && g.includes(D.objects.gas.carbon.run.v + " kg CO₂e") && g.includes(D.objects.gas.carbon.supply.v + " kg") && !/\d g\b/.test(g), "the consequential note counts one MWh in kg (389 g per kWh = 389 kg per MWh)"); }
// ---------------- numbers on the page against the model
onPage("about 43 g CO₂e per kWh (NREL's median)", "myth 1");
onPage("withdraws " + M.grp(cool("once").wd) + " gallons per MWh and consumes " + cool("once").use + "; a cooling tower withdraws " + cool("tower").wd + " and consumes " + cool("tower").use, "myth 2");
onPage(Math.round(V.direct) + " gallons per MWh on site against " + M.grp(V.indirect), "myth 3");
onPage((cool("tower").use * 1000).toLocaleString("en-US") + " gallons: " + cool("tower").use + " gallons per MWh × 1,000 MWh", "the quiz's answer");
onPage((cool("tower").wd * 1000).toLocaleString("en-US") + " gallons", "the quiz's withdrawal option"); onPage((cool("once").wd * 1000).toLocaleString("en-US") + " gallons", "the quiz's once-through option");
onPage("Gas's phases add to " + M.grp(M.full(D, "gas", "carbon").v) + " g per kWh, its total median is " + D.nrelTotals.gas + " g", "Go deeper: medians need not add");
onPage(D.harmonized.solar.median + " g per kWh ([middle half]{.lx-term term=\"interquartile-range\"} " + D.harmonized.solar.lo + " to " + D.harmonized.solar.hi + ")", "Go deeper: harmonized solar");
onPage(D.harmonized.gas.median + " g (" + D.harmonized.gas.lo + " to " + D.harmonized.gas.hi + ")", "Go deeper: harmonized gas");
onPage(D.nrelTotals.solar + " and " + D.nrelTotals.gas + " g per kWh", "numbers to remember: NREL");
onPage(cool("tower").wd + " and " + cool("tower").use + " gal per MWh", "numbers to remember: tower");
onPage(D.dcData.indirectLperKWh + " liters per kWh", "numbers to remember: LBNL");
onPage(M.grp(D.eiaWater.ngccWithdrawal2021) + " gallons per MWh on average in 2021", "sources: EIA's fleet withdrawal");
onPage(D.land.pvTracking + " MWh a year per acre for tracking plants, " + D.land.pvFixed + " for fixed tilt", "sources: LBNL densities");
onPage("draws " + F8.campus.drawMW + " MW in every hour", "the data note: F8's campus");
onPage("About 25 guided minutes in eight steps", "the time line");

// ---------------- scope, links and text budget
const OWN = PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?<!-- learn:\1:end -->/g, "");
const NUC = /nuclear|reactor|\bSMR\b|small modular/i;
ok(!NUC.test(OWN + JS + JSON.stringify(D) + SIDE), "no nuclear term in the lesson's own files");
ok(!/\bAI\b|artificial intelligence/.test(OWN + JS + JSON.stringify(D)), "no AI wording");
{ // data centers appear as loads only: a data center is a load or a facility; no sentence ties it to the timing, buyers or
  // commercialization of anything
  const dc = (OWN + JS + JSON.stringify(D)).replace(/U\.S\./g, "US").match(/[^.;!?]*data cent[^.;!?]*/gi) || [];
  const RISK = /timing|buyer|commerciali|deliver|order book|anchor|pipeline of|siting|site selection|screen/i;
  ok(dc.length > 0 && dc.every(s => !RISK.test(s)) && dc.some(s => /is a load/.test(s)), "data centers appear only as a load: " + dc.filter(s => RISK.test(s)).join(" | ")); }
const hrefs = [...OWN.matchAll(/href="([^"]+)"/g)].map(m => m[1]).concat([...OWN.matchAll(/\]\(([^)]+)\)/g)].map(m => m[1]));
ok(hrefs.every(h => HOSTS.test(h) || /^[0-9a-z-]+\.html$/.test(h)), "links only to allowed hosts and learn pages: " + hrefs.filter(h => !(HOSTS.test(h) || /^[0-9a-z-]+\.html$/.test(h))).join(", "));
ok(hrefs.filter(h => /\.html$/.test(h)).every(h => PATHJ.starter.concat(PATHJ.more).some(x => x.href === h && x.ready)), "every lesson link is a live lesson");
const plain = t => t.replace(/\*\*/g, "").replace(/\[\[[^|]+\|([^\]]+)\]\]/g, "$1");
const sentences = t => plain(t).split(/(?<=[.?!])\s+(?=[A-Z0-9“"])/).filter(x => /[A-Za-z]/.test(x)).length;
const words = t => plain(t).trim().split(/\s+/).length;
const stepTexts = [...JS.matchAll(/\{ text: "([^\n]+)",\n\s+build:/g)].map(m => m[1].replace(/" \+ D\.objects\.gas\.carbon\.run\.v \+ "/g, "389").replace(/" \+ D\.nrelTotals\.solar \+ "/g, "43").replace(/" \+ Math\.round\(brochureRatio\(D\)\) \+ "/g, "9"));
ok(stepTexts.length === 8 && stepTexts.every(t => words(t) <= 35 && sentences(t) <= 2), "eight step texts of 35 words and two sentences at most: " + stepTexts.map(t => words(t) + "/" + sentences(t)).join(","));
{ const O2 = OWN.replace(/^---[\s\S]*?\n---\n/, "").replace(/<!--[\s\S]*?-->/g, "").replace(/<div class="lx-card lx-sources">[\s\S]*?<\/div>/, "").replace(/<style>[\s\S]*?<\/style>/g, "");
  const els = O2.replace(/^- (.*)$/gm, "<li>$1</li>").split(/<\/?(?:p|li|dd|dt|td|th|summary)\b[^>]*>/i).map(x => x.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()).filter(x => /[A-Za-z]/.test(x));
  const long = els.filter(x => x.split(" ").length > 35);
  ok(long.length === 0, "every page element is 35 words or fewer: " + long.map(x => x.slice(0, 60) + " (" + x.split(" ").length + ")").join(" | ")); }
const NEW = ["functional-unit", "water-withdrawal", "water-consumption", "land-use-intensity", "attributional-analysis", "interquartile-range"];
NEW.forEach(id => ok(new RegExp("id: " + id + "\\b").test(SIDE) && (JS.includes("[[" + id + "|") || PAGE.includes('term="' + id + '"')), "sidecar defines and the page marks " + id));
["system-boundary", "life-cycle-assessment", "consequential-analysis", "median", "heat-rate"].forEach(id => ok(JS.includes("[[" + id + "|") || PAGE.includes('data-term="' + id + '"'), "the page marks the course glossary's " + id));
{ const PY = fs.readFileSync(path.join(SITE, "learn/path.yml"), "utf8"), i = PY.indexOf("id: " + ID), r = PY.slice(i, i + 2000).split("\n- ")[0];
  ok(i > 0 && /status: active/.test(r) && /form: cards/.test(r) && /minutes: 25/.test(r) && /practice_minutes: 30/.test(r) && /after: \[F11\]/.test(r) && PAGE.includes('subtitle: "' + (r.match(/subtitle: "([^"]+)"/) || [])[1] + '"'), "path.yml: active cards row, 25 + 30 minutes, after F11 (the curriculum's prerequisite), subtitle equal to the page's"); }

// ---------------- the page on a stub document
{
  const { env, load } = require("./stubdom.js");
  const E = env();
  E.LX.ready = () => {}; E.LX.progress.guess = () => null; E.LX.visible = E.LX.visible || (() => false);
  const core = require(L("components/core.js")); E.LX.lessonRefHTML = core.lessonRefHTML;
  ["cards", "predict", "toggle", "ledger", "table", "boundary", "costsplit", "lifebox"].forEach(n => load(n, E));
  try { load("conceptmap", E); } catch (e) { E.LX.ConceptMap = () => ({}); }
  let init = null, demo = null;
  E.LX.mount = (slug, f) => { if (slug === ID) init = f; };
  E.LX.demo = (root, fn, cards) => { demo = { fn, cards }; return () => null; };
  const xp = E.LX.H("div", { id: "a11-explain" }, E.body);
  vm.runInNewContext(JS, { window: E.window, document: E.document, location: E.location, navigator: {}, console, module: { exports: {} }, performance: E.window.performance, setTimeout: () => 0, clearTimeout: () => {}, requestAnimationFrame: () => 0 });
  const root = E.LX.H("div", { class: "lx-interactive", "data-learn": ID }, E.body), live = E.LX.H("div", { class: "lx-live" }, root);
  let threw = null;
  try { init(live, { a11_lca_nexus: D, a10_emissions_questions: A10, f08_large_loads: F8, path: PATHJ }, root); } catch (e) { threw = e.stack; }
  ok(!threw && demo && demo.cards, "the page mounts on the stub document" + (threw ? ": " + threw : ""));
  try {
    const S = root.lxLesson.S, box = root.lxLesson.box, card = () => demo.cards.el;
    const said = [], grab = () => card().querySelectorAll(".lx-saw, .lx-hint, li").forEach(e => said.push(e.textContent.replace(/\s+/g, " ").trim()));
    const btn = (host, re) => host.querySelectorAll("button").filter(b => re.test(b.textContent))[0];
    const key = (el, k) => el.fire("keydown", { key: k });
    // step 1: the right handle and the left handle by keyboard, to cradle to grave
    demo.cards.go(0);
    ok(S.obj === "solar" && S.L === 2 && S.R === 2 && live.textContent.includes("0 g CO₂e per kWh"), "step 1: the solar farm, on site only, 0 g");
    key(box.handles[0], "ArrowLeft"); key(box.handles[0], "ArrowLeft"); key(box.handles[1], "End");
    ok(S.L === 0 && S.R === 3 && card().textContent.includes(M.lineSolar(D).replace(/\*\*/g, "")), "step 1: the handles move by keyboard; cradle to grave gives 43 g and its line"); grab();
    ok(box.handles[0].getAttribute("aria-valuetext") === "starts at Build, stage 1 of 4" && box.tiles[0].getAttribute("aria-pressed") === "true", "the handles and tiles announce the boundary");
    // step 2: tap the Supply tile
    demo.cards.go(1); ok(S.obj === "gas" && S.L === 2, "step 2: the gas plant on site"); box.tiles[1].click();
    ok(S.L === 1 && card().textContent.includes("389 + 71 = 460"), "step 2: tapping Supply brings it inside; 389 + 71 = 460"); grab();
    box.tiles[1].click(); ok(S.L === 2, "tapping an end stage inside moves it out"); box.tiles[0].click(); ok(S.L === 0 && S.R === 2, "tapping a stage outside brings it and everything between inside");
    // step 3
    demo.cards.go(2); btn(card(), /^Two boundaries/).click();
    ok(card().textContent.includes("about 11 times") && card().textContent.includes("You called it."), "step 3: the fair comparison, 11 times"); grab();
    ok(!/Harmonized/.test(card().textContent) && card().textContent.includes("natural gas generation as a whole") && card().textContent.includes("thin-film and crystalline panels"), "step 3: one idea, the boundary; NREL's populations named, harmonized medians left to Go deeper");
    // step 4
    demo.cards.go(3); for (const c of D.cooling) { btn(card(), new RegExp("^" + c.label.replace(/[()]/g, "\\$&") + "$")).click(); grab(); }
    ok(S.cooling === "dry" && card().textContent.includes("withdraws 2 gal per MWh and consumes 2"), "step 4: every cooling, each with its line");
    ok(live.textContent.includes("Water consumed inside") && live.textContent.includes("19 gal per MWh"), "step 4: the box's water total with dry cooling (1 + 16 + 2 = 19)");
    // step 5
    demo.cards.go(4); const tg = card().querySelector(".lx-toggle"); tg.click(); grab();
    ok(S.wide && card().textContent.includes("the order reverses") && card().textContent.includes("illustrative"), "step 5: the land between, labelled illustrative"); tg.click(); grab(); tg.click();
    // step 6
    demo.cards.go(5); ok(S.obj === "dc" && S.L === 2, "step 6: the data center at its fence"); key(box.handles[0], "ArrowLeft");
    ok(card().textContent.includes("99 + 1,194 = 1,293") && card().textContent.includes("2.7 billion gallons a year"), "step 6: with its power: water and the campus's year"); grab();
    // step 7
    demo.cards.go(6); for (const c of D.consequential) { btn(card(), new RegExp("^" + c.label.replace(/[:]/g, "\\$&"))).click(); grab(); }
    ok(card().textContent.includes("43 − 0 = +43 g per kWh") && card().textContent.includes("about 43 g per kWh") && said.some(t => t.includes("43 − (71 + 389) = −417")), "step 7: consequential (with its arithmetic) and attributional readouts");
    // step 8
    demo.cards.go(7); const dt = card().querySelector(".lx-toggle"); dt.click(); grab(); dt.click(); grab();
    ok(card().textContent.includes("Hydropower") && said.some(t => t.includes("falls to 8%")), "step 8: the drought case");
    dt.click(); ok([...card().querySelectorAll("table")].some(tb => /Drought case/.test(tb.textContent) && /8%/.test(tb.textContent) && /15%/.test(tb.textContent) && /45%/.test(tb.textContent) && /42%/.test(tb.textContent)), "step 8: a visible table lists both cases' shares"); dt.click();
    ok(xp.textContent.includes("Three footprints, cradle to grave") && xp.textContent.includes("stages added; whole-life median 486"), "explain: the comparison table with the whole-life note");
    // every assembled line, for every input
    const over = said.filter(t => /[A-Za-z]/.test(t) && (words(t) > 35 || sentences(t) > 2));
    ok(said.length > 25 && over.length === 0, "every assembled line (" + said.length + ") is 35 words and two sentences at most: " + over.slice(0, 3).join(" | "));
    // every line function for every input, too
    const lines = [M.lineSolar(D), M.lineGas(D), M.stackHint(A10), M.lineCompare(D), M.lineLand(D, false), M.lineLand(D, true), M.lineDC(D, F8), M.lineDrought(D, false), M.lineDrought(D, true)]
      .concat(D.cooling.map(c => M.lineWater(D, c.id)), D.consequential.map(c => M.lineCons(D, c.id)));
    ok(lines.every(t => words(t) <= 35 && sentences(t) <= 2), "every line function, every input: 35 words and two sentences at most: " + lines.filter(t => words(t) > 35 || sentences(t) > 2).join(" | "));
  } catch (e) { ok(false, "the stub page test threw: " + (e && e.stack || e)); }
}

console.log(`test_${ID}: ${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
