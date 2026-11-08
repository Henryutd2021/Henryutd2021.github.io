// test_f05-nuclear-basics.js — Node tests for F5 (assets/learn/f05-nuclear-basics.js), its data
// (assets/learn/data/f05-nuclear-basics.json, the only file the page loads; town.json and cf_targets.json are read here to
// check it) and every number the page states.
// Usage (from the site folder):  node _tests/learn/test_f05-nuclear-basics.js
"use strict";
const fs = require("fs");
const path = require("path");
const SITE = path.resolve(__dirname, "..", "..");
const rd = p => fs.readFileSync(path.join(SITE, p), "utf8");
const M = require(path.join(SITE, "assets/learn/f05-nuclear-basics.js"));
const D = JSON.parse(rd("assets/learn/data/f05-nuclear-basics.json"));
const TOWN = JSON.parse(rd("assets/learn/data/town.json"));
const CF = JSON.parse(rd("assets/learn/data/cf_targets.json"));
const QMD = rd("learn/f05-nuclear-basics.qmd");
const JS = rd("assets/learn/f05-nuclear-basics.js");
const PATH = rd("learn/path.yml");
const SIDE = rd("learn/_w1/f05-nuclear-basics.yml");
const F = D.facts, T = D.toy;

let checks = 0, fails = 0;
function ok(cond, msg) { checks++; if (!cond) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, e) => Math.abs(a - b) <= (e == null ? 1e-9 : e);
const sentences = s => s.split(/(?<=[.!?])\s+(?=[A-Z*“"(])/).filter(Boolean).length;
const plainT = s => s.replace(/\[\[[^|\]]+\|([^\]]+)\]\]/g, "$1");
const words = s => s.replace(/\[\[[^|\]]+\|([^\]]+)\]\]/g, "$1").replace(/\*\*/g, "").split(/\s+/).filter(Boolean).length;
const fmt = v => v.toLocaleString("en-US");

// Two kinds of check below. Source consistency: the page, the script and the data say the same thing, and every real
// number carries a source with a date. Model validation: the toy's identities and edge cases, and every stated
// quantity (efficiency, heat, pressures as multiples of air pressure, the designs' reach) recomputed from its inputs.

// ---------------- sources: every fact and design names a source with a URL on the allow-list (or none) and a date
{
  const S = D.sources;
  Object.keys(S).forEach(k => {
    const s = S[k];
    ok(s.publisher && s.title && s.where && s.as_of && s.read === "2026-11-03", `source ${k}: publisher, title, place, as-of and read date`);
    ok(s.url === null || /^https:\/\/www\.(energy\.gov|eia\.gov)\//.test(s.url), `source ${k}: URL on energy.gov or eia.gov (${s.url})`);
  });
  ok(S.doe_handbook.url === null, "the DOE handbook (osti.gov, not allow-listed) is cited in plain text, without a URL");
  ok(!/nrc\.gov|iaea\.org|world-nuclear|osti\.gov/.test(JSON.stringify(D) + JS + QMD.replace(/<!--[\s\S]*?-->/g, "")), "no link to a host off the allow-list (nrc.gov, iaea.org, world-nuclear.org, osti.gov)");
  Object.keys(F).forEach(k => { if (F[k].src) ok(S[F[k].src], `fact ${k}: its source ${F[k].src} exists`); });
  D.designs.forEach(d => d.srcs.forEach(s => ok(S[s], `design ${d.key}: source ${s} exists`)));
  D.uses.forEach(u => u.srcs.forEach(s => ok(S[s], `use ${u.key}: source ${s} exists`)));
  ok(!("adv3" in S) && !/Watch by 2030/.test(QMD + JSON.stringify(D)), "no source whose title names a year for reactor systems (reads as timing)");
}

// ---------------- model validation: the chain-reaction toy (illustrative)
{
  ok(T.kMin === 0.5 && T.kMax === 1.25 && T.rodAbsorb === 0.5 && T.n0 === 100 && T.generations === 12 && T.steadyBand === 1e-9, "toy parameters as documented in the Modeler box (steady means k = 1; the band is a floating-point tolerance)");
  ok(near(M.kOf(T, 0, 100), T.kMax) && near(M.kOf(T, 0, 0), T.kMin), "rods out: k runs from kMin (no moderator) to kMax (all of it)");
  ok(near(M.kOf(T, 100, 100), T.kMax * (1 - T.rodAbsorb)) && near(M.kOf(T, 100, 0), T.kMin * (1 - T.rodAbsorb)), "rods fully in absorb rodAbsorb of the neutrons");
  const R = M.grid(T.rods), Mo = M.grid(T.moderator);
  ok(R.length === 11 && Mo.length === 11 && R[0] === 0 && R[10] === 100, "slider grids: 0 to 100% in steps of 10");
  let mono = true, maxK = -1, minK = 9;
  R.forEach(r => Mo.forEach(m => { const k = M.kOf(T, r, m); maxK = Math.max(maxK, k); minK = Math.min(minK, k);
    if (r > 0 && !(M.kOf(T, r - 10, m) > k)) mono = false; if (m > 0 && !(M.kOf(T, r, m - 10) < k)) mono = false; }));
  ok(mono, "k falls as rods go in and rises with the moderator, at every grid point");
  ok(near(maxK, 1.25) && near(minK, 0.25), `slider extremes: k from ${minK} to ${maxK}`);
  // the Modeler box keeps the toy qualitative (a Foundations lesson at awareness level): no equation, no parameter table;
  // its formula is documented in the data file's toy.about
  const modeler = (QMD.match(/<summary><span class="k">Go deeper · Modeler<\/span>[\s\S]*?<\/details>/) || [""])[0];
  ok(modeler && !/\$\$|\| Symbol|k_\\text|rodAbsorb/.test(modeler) && /Each generation holds \$k\$ times the neutrons of the one before\. Pushing the rods in lowers \$k\$, and so does draining the moderator/.test(modeler), "the Modeler box describes the toy in words, without its equation or parameters");
  ok(/Steady means exactly \$k = 1\$: here only with the moderator full and the rods 40% in/.test(modeler) && /k = kFull\(moderator\) x \(1 - rodAbsorb x rods\)/.test(T.about), "the steady point (rods 40%, moderator full) matches the toy; its formula stays in the data file");
  ok(M.stateOf(0.99, T.steadyBand) === "dying" && M.stateOf(1, T.steadyBand) === "steady" && M.stateOf(1.01, T.steadyBand) === "growing" &&
     M.stateOf(0.999, T.steadyBand) === "dying" && M.stateOf(1.001, T.steadyBand) === "growing" && M.stateOf(1 + 1e-12, T.steadyBand) === "steady", "k < 1 dies, only k = 1 is steady (critical), k > 1 grows");
  const st = M.series(1, 100, 12); ok(st.length === 13 && st.every(v => v === 100), "k = 1: every generation equals the first");
  const gr = M.series(1.25, 100, 12), dy = M.series(M.kOf(T, 40, 40), 100, 12);
  ok(gr.every((v, i) => i === 0 || v > gr[i - 1]) && dy.every((v, i) => i === 0 || v < dy[i - 1]), "k > 1 grows every generation, k < 1 shrinks every generation");
  ok(Math.round(gr[12]) === 1455 && dy[12] < 1 && M.count(dy[12]) === "under one", `fallback table: 1.25 gives 1,455 and 0.64 gives under one neutron (${dy[12].toFixed(2)})`);
  ok(near(M.kOf(T, 40, 100), 1) && M.fmtK(M.kOf(T, 40, 40)) === "0.64" && M.fmtK(M.kOf(T, 40, 0)) === "0.40", "k = 1.00 at rods 40%, moderator 100%; 0.64 at 40% moderator; 0.40 drained");
  const SG = M.steadyGrid(T);
  ok(SG.length === 1 && SG[0].rods === 40 && SG[0].mod === 100 && SG[0].k === 1, `steady settings: ${SG.map(x => x.rods + "/" + x.mod).join(", ")} (k = 1 exactly)`);
  ok(SG.every(x => M.fmtK(x.k) === "1.00"), "every setting the toy calls steady displays k = 1.00");
  // rods 30%, moderator 90% gives k = 0.99875, a slow decline; the page must not call it steady or show 1.00
  const k3090 = M.kOf(T, 30, 90), t3090 = M.toyText(T, 30, 90);
  ok(near(k3090, 0.99875) && M.stateOf(k3090, T.steadyBand) === "dying" && M.fmtK(k3090) === "0.999", `30/90: k = ${k3090}, shown ${M.fmtK(k3090)}, dying`);
  ok(/^k = 0\.999 .*\*\*dying out\*\*, from 100 neutrons to 99 in 12 generations\.$/.test(plainT(t3090)) && /^\[\[multiplication-factor\|k\]\] = /.test(t3090), `30/90 line, k marked as the multiplication factor: "${t3090}"`);
  let shown100 = 0; R.forEach(r => Mo.forEach(m => { const k = M.kOf(T, r, m); if (M.fmtK(k) === "1.00" && M.stateOf(k, T.steadyBand) !== "steady") shown100++; }));
  ok(shown100 === 0, "no setting shows k = 1.00 unless it is steady");
  // step 3 always starts with the moderator full, whatever step 4 left; its rods-out promise and its goal hold
  const back = M.step3Start(T, { rods: 40, mod: 40 });
  ok(back.mod === T.moderator.max && back.rods === 40 && back.refilled === true && near(M.kOf(T, 0, back.mod), T.kMax) && M.stateOf(M.kOf(T, 40, back.mod), T.steadyBand) === "steady",
     "step 3 → step 4 (drained to 40%) → back: moderator refilled, rods kept, rods-out k = 1.25, and rods 40% is steady again");
  ok(M.step3Start(T, { rods: 0, mod: 100 }).refilled === false, "step 3 on first visit: nothing to refill");
  ok(M.stateOf(M.kOf(T, 40, 90), T.steadyBand) === "dying", "step 4: from the steady setting, one notch of draining kills the chain (the step can be finished)");
  // the sentences shown after a slider move, for every setting: one sentence, within budget
  R.forEach(r => Mo.forEach(m => { const t = M.toyText(T, r, m); ok(words(t) <= 25 && sentences(t) === 1 && plainT(t).indexOf("k = " + M.fmtK(M.kOf(T, r, m))) === 0, `toy line at ${r}/${m}: one sentence, ${words(t)} words`); }));
  Object.keys(M.SAW).forEach(k => ok(words(M.SAW[k]) <= 35 && sentences(M.SAW[k]) <= 2, `step feedback ${k}: within budget`));
  ok(/kOf\(T, 0, T\.moderator\.max\)/.test(JS) && !/leads to 1\.25/.test(JS), "step 3's 1.25 is computed from the toy, not typed");
}

// ---------------- model validation: the plant, pressures and the designs' reach
{
  const W = M.plant(F, D.plant.townMW);
  ok(TOWN.fleet.nuclear.mw === 100 && D.plant.townMW === TOWN.fleet.nuclear.mw, "Prairie Town's plant: 100 MW, the same as town.json (illustrative)");
  ok(/plant\(F, D\.plant\.townMW\)/.test(JS) && !/data\.town\b/.test(JS), "the page takes the plant's size from its own data, not from town.json");
  ok(F.heat_rate_btu_kwh.value === 10443 && F.heat_rate_btu_kwh.year === 2025 && F.btu_per_kwh.value === 3412, "EIA: 10,443 Btu/kWh (2025) and 3,412 Btu per kWh");
  ok(near(W.eff, 3412 / 10443) && M.pct1(W.eff) === "32.7%", `efficiency 3,412 ÷ 10,443 = ${M.pct1(W.eff)}`);
  ok(Math.round(W.heat) === 306 && Math.round(W.waste) === 206 && near(W.heat - W.waste, 100), `heat ${W.heat.toFixed(2)} MW, low-temperature heat ${W.waste.toFixed(2)} MW`);
  const q = 600 * W.eff; ok(Math.round(q) === 196 && Math.round(600 - q) === 404, `quiz: 600 MW of heat gives ${q.toFixed(1)} MW; 404 MW leaves`);
  ok(M.atm(F.pwr_mpa.value, F) === 150 && M.atm(F.bwr_mpa.value, F) === 70, "15 MPa is about 150 and 7 MPa about 70 times sea-level air pressure (101.325 kPa)");
  ok(F.pwr_mpa.value === 15 && F.pwr_c.value === 326 && F.bwr_mpa.value === 7 && F.bwr_c.value === 288, "QTR 2015 Figure 4.M.4: PWR ~15 MPa, ~326 °C; BWR ~7 MPa, ~288 °C");
  ok(F.htr_lo_c.value === 700 && F.htr_hi_c.value === 950 && F.proc_lo_c.value === 650 && F.proc_hi_c.value === 950 && F.htr_eff_850.value === 47, "QTR 4.J: 700 to 950 °C outlets; 650 to 950 °C process heat; 47% at 850 °C");
  ok(F.sfr_lo_c.value === 500 && F.sfr_hi_c.value === 550 && F.soec_lo_c.value === 650 && F.soec_hi_c.value === 850, "QTR 4.H: 500 to 550 °C; DOE HFTO: solid oxide 650 to 850 °C");
  // temperatures only; overlap is not capability, and no use gets an invented minimum
  const reach = k => M.reached(D, k).map(u => u.key).join();
  const ov = (k, u) => M.overlap(D.designs.find(d => d.key === k), D.uses.find(x => x.key === u));
  ok(reach("large") === "power" && reach("small") === "power" && reach("sfr") === "power" && reach("micro") === "power", "water-cooled, sodium-cooled and micro designs overlap no drawn band; every design makes electricity");
  ok(reach("htgr") === "power,soec,industry" && reach("msr") === "power,soec,industry", "the 700 to 950 °C designs overlap both drawn bands");
  ok(ov("htgr", "soec") === "whole" && ov("htgr", "industry") === "part" && ov("msr", "industry") === "part", "partial against whole: 950 °C tops 850 °C (the electrolysis band) but not 950 °C (the industrial band)");
  ok(ov("sfr", "soec") === "below" && ov("large", "industry") === "below" && ov("micro", "soec") === "na", "below the band, or unknown (microreactor)");
  ok(D.designs.every(d => ov(d.key, "district") === "qual") && !("lo" in D.uses.find(u => u.key === "district")) && !("lo" in D.uses.find(u => u.key === "power")), "district heat and desalination: no temperature minimum, no band drawn (no reactor temperature reused as a process requirement)");
  ok(M.overlap({ hi: 650 }, { lo: 650, hi: 850 }) === "below" && M.overlap({ hi: 651 }, { lo: 650, hi: 850 }) === "part", "equal temperatures are no overlap: heat needs a hotter source");
  Object.keys(M.OVER).forEach(k => ok(words(M.OVER[k]) <= 12, `ladder verdict "${k}": short`));
  const msr = D.designs.find(d => d.key === "msr");
  ok(/concept/.test(msr.name) && /fluoride/.test(msr.coolant) && !/chloride/.test(msr.coolant) && msr.moderator === "graphite" && /FHR/.test(msr.note), "the salt-cooled row is DOE's fluoride salt-cooled high-temperature concept, not every molten-salt reactor");
  const byKey = {}; D.designs.forEach(d => { byKey[d.key] = d; });
  ok(byKey.large.hi === F.pwr_c.value && byKey.large.lo === F.bwr_c.value && byKey.htgr.lo === F.htr_lo_c.value && byKey.htgr.hi === F.htr_hi_c.value && byKey.sfr.lo === F.sfr_lo_c.value && byKey.sfr.hi === F.sfr_hi_c.value, "design bars use the sourced temperatures");
  ok(byKey.large.size === F.large_mwe.text && byKey.small.size === F.small_mwe.text && byKey.micro.size === F.micro_mwt_lo.value + " to " + F.micro_mwt_hi.value + " MWt" && byKey.htgr.size === "up to " + F.htr_mwt_max.value + " MWt per module, for passive cooling", "design sizes from the facts");
  ok(/so that decay heat can be removed passively/.test(F.htr_mwt_max.note) && /limited to 600 MWt each or less/.test(D.sources.qtr_htr.where) && /10 to 842 MWt/.test(D.sources.qtr_htr.where), "the 600 MWt ceiling is DOE's for passively cooled modules, not every gas-cooled reactor");
  ok(byKey.micro.coolant === "gas, liquid metal, molten salt, or a fluid inside heat pipes", "a heat pipe is a device holding a fluid, not a coolant");
  ok(!("rods_per_assembly" in F) && !("assemblies_per_core" in F), "no rod or assembly count that would fit one design only");
  ok(D.uses.find(u => u.key === "soec").lo === F.soec_lo_c.value && D.uses.find(u => u.key === "industry").hi === F.proc_hi_c.value, "use bands from the facts");
  ok(CF.reference.nuclear.cf === 0.911 && CF.reference.nuclear.year === 2025, "the Modeler box's 91.1% is EIA's 2025 nuclear capacity factor (cf_targets.json)");
}

// ---------------- every number with a unit on the page comes from the data or the model
{
  const W = M.plant(F, 100);
  const strip = s => s.replace(/^---[\s\S]*?\n---/, "").replace(/<!-- learn:(meta|next|footer):start[\s\S]*?learn:\1:end -->/g, "").replace(/<style>[\s\S]*?<\/style>/, "")
    .replace(/<!--[\s\S]*?-->/g, "").replace(/https?:\/\/[^\s"')]+/g, " ").replace(/\$\$[\s\S]*?\$\$/g, " ").replace(/<ul class="lx-choices">[\s\S]*?<\/ul>/g, " ");
  const prose = strip(QMD).replace(/<[^>]+>/g, "");   // tags out, so a glossary mark inside a number's unit still counts
  const A = new Set();
  const add = (v, u) => A.add(v + " " + u);
  // percent
  [F.u235_natural_pct.value, F.enrich_lo_pct.value, F.enrich_hi_pct.value, F.haleu_lo_pct.value, F.haleu_hi_pct.value, F.pwr_share_pct.value, F.spent_energy_left_pct.value,
   F.us_share_pct.value, F.htr_eff_850.value].forEach(v => add(v, "%"));
  add(M.pct1(W.eff).replace("%", ""), "%"); add((CF.reference.nuclear.cf * 100).toFixed(1), "%");
  M.grid(T.rods).forEach(v => add(v, "%"));
  // temperatures and pressures
  [F.pwr_c, F.bwr_c, F.lwr_outlet_c, F.htr_lo_c, F.htr_hi_c, F.proc_lo_c, F.sfr_lo_c, F.sfr_hi_c, F.soec_lo_c, F.soec_hi_c].forEach(f => add(f.value, "°C"));
  [F.pwr_mpa, F.bwr_mpa].forEach(f => add(f.value, "MPa"));
  // power and energy
  [100, Math.round(W.heat), Math.round(W.waste), 600, Math.round(600 * W.eff), Math.round(600 - 600 * W.eff)].forEach(v => add(fmt(v), "MW"));
  add(fmt(F.large_mwe.value), "MWe"); add(F.small_mwe.value, "MWe"); add(F.micro_mwt_hi.value, "MWt"); add(F.htr_mwt_max.value, "MWt");
  add(fmt(F.btu_per_kwh.value), "Btu"); add(fmt(F.heat_rate_btu_kwh.value), "Btu");
  add(fmt(F.spent_t.value), "t"); add(fmt(F.spent_t.value), "metric tons"); add(F.spent_yards.value, "yards"); add(F.rod_diameter_cm.value, "cm");
  add(T.generations, "generations");
  add(1, "MW");   // lesson 5's title in the refresher line: "why 1 MW is not always 1 MW"
  const rx = /(\d[\d,]*(?:\.\d+)?)\s*(%|°C|MPa|MWe|MWt|MW|Btu|metric tons|t\b|yards|cm\b|generations)/g;
  let m, n = 0;
  while ((m = rx.exec(prose))) { n++; ok(A.has(m[1] + " " + m[2]), `page states "${m[0]}": from the data or the model`); }
  ok(n >= 45, `${n} numbers with units on the page checked`);
  // the quiz answers are the model's
  ok(/data-answer="a">[\s\S]*?<li data-value="a">196 MW<\/li>/.test(QMD) && /196 MW: 600 × 0\.327\. The other 404 MW/.test(QMD), "quiz 1: the right choice is the model's 196 MW");
  ok(/data-id="soec" data-answer="c"[\s\S]*?<li data-value="c">High-temperature gas-cooled, 700 to 950 °C<\/li>/.test(QMD), "quiz 2: the right choice is the design that reaches 650 °C");
  // the fallback tables carry the toy's and the plant's numbers
  const fb = QMD.slice(QMD.indexOf('<div class="lx-fallback">'), QMD.indexOf('<p class="lx-hint">With JavaScript on'));
  ok(fb.indexOf("<td>1.25 more splits: growing</td><td>1,455</td>") > 0 && fb.indexOf("<td>1.00: steady (critical)</td><td>100</td>") > 0 && fb.indexOf("<td>0.64: dying out</td><td>under one</td>") > 0, "fallback: the toy's three rows");
  ok(fb.indexOf("about 306 MW of heat") > 0 && fb.indexOf("About 206 MW is rejected heat and other losses, mostly through the condenser") > 0 && fb.indexOf("32.7% efficiency implied by EIA's 2025 tested heat rate") > 0, "fallback: the plant's numbers, the tested heat rate and the losses");
  ok(!/fleet turned|fleet's 2025 efficiency|leaves through the condenser/.test(QMD + JS), "no claim of a measured annual conversion, and no exact condenser duty");
  ok(/weighted average tested heat rate/.test(D.sources.eia_heatrate.where), "the data names EIA's tested heat rate");
  D.designs.forEach(d => ok(fb.indexOf("<td>" + d.name + "</td><td>" + d.size + "</td><td>" + d.coolant + "</td><td>" + d.outlet + "</td><td>" + d.uses.replace("; passive safety features in modern designs", "") + "</td>") > 0, `fallback lists the design ${d.key} as the data does`));
  // the facts table: six rows, each with its source on the allow-list
  const facts = (QMD.match(/<table class="lx-facts">[\s\S]*?<\/table>/) || [""])[0];
  ok((facts.match(/<tr>/g) || []).length - 1 === 6 && (facts.match(/href="https:\/\/www\.(energy|eia)\.gov\//g) || []).length === 6, "facts table: six rows, each with a DOE or EIA source");
  // values agree across the page, the data note, the explain fallback and the script's text
  ["32.7%", "10,443 Btu", "3,412 Btu", "306 MW", "206 MW", "15 MPa", "7 MPa", "326 °C", "288 °C"].forEach(v => ok(prose.split(v).length - 1 >= 2, `"${v}" stated in more than one place on the page`));
  const lits = [...JS.matchAll(/"((?:[^"\\\n]|\\.)*)"/g)].map(x => x[1]).join("\n");
  ok(!/\b(326|288|306|206|10,443|3,412|32\.7|91\.1|700|950|650|850|550)\s*(°C|MPa|MW|Btu|%)/.test(lits), "the script never types a sourced or computed number; it reads them from the data");
}

// ---------------- page structure, path.yml, the sidecar and the text budget
{
  const fm = QMD.match(/^---\n([\s\S]*?)\n---/)[1];
  const blk = PATH.slice(PATH.indexOf("id: f05-nuclear-basics"), PATH.indexOf("id: f06-grid-and-outages"));
  const sub = (blk.match(/subtitle: "([^"]+)"/) || [])[1];
  ok(sub && fm.indexOf('subtitle: "' + sub + '"') >= 0, "front-matter subtitle = path.yml subtitle");
  ok(/code: F5/.test(blk) && /minutes: 15/.test(blk) && /practice_minutes: 5/.test(blk) && /status: active/.test(blk) && /after: \[F4\]/.test(blk) && /next: F6/.test(blk), "path.yml: F5, 15 + 5 min, active, after F4, next F6");
  ok(/id="f5-explain"/.test(QMD) && /data-learn="nuclear-basics"/.test(QMD) && /LX\.mount\("nuclear-basics"/.test(JS) && /getElementById\("f5-explain"\)/.test(JS), "mount points match");
  ok(/data-src="\.\.\/assets\/learn\/data\/f05-nuclear-basics\.json"/.test(QMD), "the page loads its own data only (no town.json, whose records carry running costs)");
  ok((QMD.match(/class="lx-qq"/g) || []).length === 7 && /about 5 minutes: five myths, then two questions/.test(QMD), "practice: five myths and two questions, about 5 minutes");
  const stepsSrc = JS.slice(JS.indexOf("var steps = ["), JS.indexOf("function energyBars"));
  const steps = [...stepsSrc.matchAll(/\{ text: "((?:[^"\\]|\\.)*)"/g)].map(x => x[1]);
  ok(steps.length === 9, `${steps.length} step texts`);
  steps.forEach(t => { ok(words(t) <= 40 && sentences(t) <= 2, `step text within budget: "${t.slice(0, 50)}…"`); ok(t.indexOf("**") < 0, "no ** in step text"); });
  const s3 = "With the rods out, each split here leads to " + M.fmtK(M.kOf(T, 0, 100)) + " more. Push the control rods in until the bars stay level: steady, or critical.";
  ok(words(s3) <= 40 && sentences(s3) === 2, "step 3 as shown: within budget");
  // every other text element is held to the budget too: feedback, reveals, myth and quiz answers, notes
  const budget = (where, t, w, n) => ok(words(t) <= (w || 35) && sentences(t) <= (n || 2), `${where}: within budget (${words(t)} words, ${sentences(t)} sentences): "${t.slice(0, 60)}…"`);
  Object.keys(M.SAW).forEach(k => budget("feedback " + k, M.SAW[k]));
  budget("step 9 reveal, as shown (feedback + reveal)", M.DECAY.no + " " + M.DECAY.reveal, 35, 3);
  budget("step 9 reveal, wrong pick", M.DECAY.yes + " " + M.DECAY.reveal, 35, 3);
  ok(!/pool|passive/i.test(M.DECAY.no + M.DECAY.reveal.replace("passive cooling", "")), "step 9 keeps to one idea: the chain stops, decay heat goes on");
  [...QMD.matchAll(/<details class="lx-answer"><summary>Answer<\/summary><p>([\s\S]*?)<\/p><\/details>/g)].map(x => x[1].replace(/<[^>]+>/g, "")).forEach((t, i) => budget("practice answer " + (i + 1), t, 35, 3));
  [...QMD.matchAll(/<p class="lx-qtext">([\s\S]*?)<\/p>/g)].map(x => x[1].replace(/<[^>]+>/g, "")).forEach((t, i) => budget("practice question " + (i + 1), t, 35, 2));
  [...QMD.matchAll(/<dd>([\s\S]*?)<\/dd>/g)].map(x => x[1]).forEach((t, i) => budget("explain idea " + (i + 1), t, 40, 2));
  [...stepsSrc.matchAll(/why: "((?:[^"\\]|\\.)*)"/g)].forEach(x => budget("sort card", x[1], 20, 1));
  // the answers keep the facts as stated
  ok(/DOE estimated in October 2022 that all 90,000 metric tons/.test(QMD) && /the fuel alone, without a storage site's spacing and buildings/.test(QMD) && /October 2022 estimate/.test(QMD), "spent fuel: dated estimate, compact volume only");
  ok(/More than 90% of its potential energy is still there \(DOE, 2022\)\. Recycling can turn part of the used fuel into new fuel; as of 2022, France recycles and the United States does not\./.test(QMD) && !/It can be recycled into new fuel/.test(QMD), "spent fuel: recycling recovers part of the used fuel, dated, not nearly all its energy");
  ok(/uranium pellets sealed in metal rods about 1 cm wide, grouped into \[\[fuel-assembly\|fuel assemblies\]\]; how many depends on the design and its power/.test(JS) && /how many rods and assemblies a core holds depends on its design and power/.test(QMD) && !/more than 200 rods|couple hundred/.test(QMD + JS), "fuel: no rod or assembly count applied to every design");
  ok(/at the nucleus, the central core, of a \[\[uranium-235\|uranium-235\]\] atom/.test(JS), "step 1 says what a nucleus is and marks uranium-235");
  { const fbx = QMD.slice(QMD.indexOf('<div class="lx-fallback">'), QMD.indexOf('<p class="lx-hint">With JavaScript on'));
    ok(/<b>After shutdown:<\/b> the control rods stop the chain reaction, but the fission products keep giving off decay heat, so cooling must go on\./.test(fbx) && /<dt>After shutdown<\/dt><dd>Stopping the chain reaction does not stop decay heat/.test(QMD), "the no-JS blocks keep the shutdown lesson: decay heat, so cooling goes on"); }
  // every data note: one or two sentences, about 35 words (its bold label is a label, not a sentence)
  { const notes = [...QMD.matchAll(/<p class="lx-datanote">([\s\S]*?)<\/p>/g)].map(m => m[1].replace(/<svg[\s\S]*?<\/svg>/, "").replace(/<b>[^<]*<\/b>/, "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim());
    ok(notes.length === 3, `${notes.length} data notes (illustrative, designs, efficiency)`);
    notes.forEach(n => budget("data note", n, 35, 2)); }
  ok(/Most microreactor designs need fuel with more uranium-235/.test(QMD) && !/Microreactors will need/.test(QMD), "microreactor fuel: most designs, not all");
  ok(/two separate water loops in a pressurized-water plant, one in a boiling-water plant\. Both also have a separate condenser-cooling loop/.test(JS), "the loop count names its boundary");
  ok(/MPa \(\[\[megapascal\|megapascals\]\]\)/.test(JS) && /data-term="megapascal">MPa<\/span>, megapascals/.test(QMD) && /data-term="btu">Btu<\/span> \(British thermal units/.test(QMD), "MPa and Btu expanded at first use");
  ok(/With the rods out and the \[\[moderator\|moderator\]\] \(water\) full/.test(JS), "step 3 names the moderator before its slider is used");
  ok(/if \(focusReset\) \{ focusReset = false; again\.focus/.test(JS) && !/go\(\); again\.focus/.test(JS), "Fire moves focus to Reset only once Reset is shown");
  // glossary sidecar: one sentence each, ids used on the page
  const ids = [...SIDE.matchAll(/- id: ([a-z0-9-]+)/g)].map(x => x[1]);
  ok(ids.length === 22 && ids.indexOf("fission") >= 0 && ids.indexOf("uranium-235") >= 0 && ids.indexOf("decay-heat") >= 0, `${ids.length} new glossary terms`);
  ["turbine", "generator", "waste-heat", "heat-engine", "transformer", "substation", "voltage"].forEach(t => ok(ids.indexOf(t) < 0, `sidecar leaves ${t} to F4 or F6`));
  const used = new Set([...(JS + QMD + JSON.stringify(D)).matchAll(/\[\[([a-z0-9-]+)\||data-term="([a-z0-9-]+)"|term="([a-z0-9-]+)"/g)].map(x => x[1] || x[2] || x[3]));
  ["uranium-235", "multiplication-factor", "neutron", "fission", "chain-reaction", "control-rod", "criticality", "moderator", "coolant", "outlet-temperature", "decay-heat", "steam-generator", "mwt-mwe", "passive-safety", "megapascal", "btu", "heat-exchanger", "district-heating", "desalination", "high-temperature-electrolyzer"].forEach(i => ok(used.has(i), `glossary term ${i} is marked on the page`));
}

// ---------------- scope: deny-list, nuclear-plus-risk combination, no data centers, links on the allow-list
{
  const deny = [/\bFOAK\b/i, /\bNOAK\b/i, /first[- ]of[- ]a[- ]kind/i, /nth[- ]of[- ]a[- ]kind/i, /learning[- ](curve|rate)/i, /order[- ]book/i, /anchor[- ](customer|buyer)/i,
    /subsidy[- ]free/i, /parity capital/i, /break[- ]even capital/i, /smr-dc/i, /smr-datacenter/i, /projects\//i, /research\.(html|qmd)/i, /\bAI\b/, /artificial intelligence/i, /ChatGPT|Claude/, /generated by/i];
  const page = QMD.replace(/<!-- learn:meta:start[\s\S]*?learn:meta:end -->/, "").replace(/<style>[\s\S]*?<\/style>/, "").replace(/<!--[\s\S]*?-->/g, "");
  const lits = [...JS.matchAll(/"((?:[^"\\\n]|\\.)*)"/g)].map(x => x[1]).concat([...JS.matchAll(/'((?:[^'\\\n]|\\.)*)'/g)].map(x => x[1].replace(/<[^>]+>/g, " ")));
  const vals = []; (function walk(o) { if (typeof o === "string") vals.push(o); else if (o && typeof o === "object") Object.values(o).forEach(walk); })(D);
  const defs = [...SIDE.matchAll(/def: "([^"]+)"/g)].map(x => x[1]);
  const fmTxt = (QMD.match(/^---\n([\s\S]*?)\n---/) || ["", ""])[1];
  const blk = PATH.slice(PATH.indexOf("id: f05-nuclear-basics"), PATH.indexOf("id: f06-grid-and-outages"));
  const visible = [page.replace(/<[^>]+>/g, " "), fmTxt, blk].concat(lits, vals, defs).join("\n");
  deny.forEach(r => ok(!r.test(visible), `scope: no ${r}`));
  const NUC = /nuclear|reactor|\bSMR\b|small modular/i;
  const RISK = /cost (trajector|decline|reduction|fall)|learning|commerciali|subsid|credit|threshold|break[- ]even|parity|siting|site selection|suitab|screen|deliver|timing|order|anchor|buyer|data[- ]cent/i;
  const BENIGN = /merit[- ]order|orders? of magnitude|in order to/gi;
  let nSent = 0;
  visible.split(/(?<=[.!?])\s+|\n+/).forEach(s => { nSent++; const t = s.replace(BENIGN, " "); ok(!(NUC.test(t) && RISK.test(t)), `scope: nuclear term with a risk term in "${s.slice(0, 90)}"`); });
  ok(nSent > 300, `${nSent} sentences scanned for the nuclear-plus-risk rule`);
  ok(!/data[- ]?cent/i.test(visible), "F5 mentions no data centers at all");
  ok(!/\bcosts?\b|\$\d|price|subsid|deploy|vendor|order|siting|buyer|timing/i.test(visible.replace(BENIGN, " ").replace(/<b>\$1<\/b>/g, " ")), "physics and technology only: no cost, price, deployment, vendor, order, siting, buyer or timing word anywhere");
  ok(!/excerpt:|lx-excerpt|Henryutd2021|Li et al/.test(QMD + JS + JSON.stringify(D)), "no excerpt, repository or citation of the course author's research");
  const own = QMD.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?learn:\1:end -->/g, "").replace(/<!--[\s\S]*?-->/g, "");
  const ALLOW = /^(https:\/\/www\.(eia\.gov|energy\.gov)\/|#|\.\.\/assets\/|[0-9a-z-]+\.(qmd|html)(#[a-z0-9-]*)?$)/;
  let nl = 0;
  for (const h of own.matchAll(/href="([^"]+)"|\]\(([^)]+)\)|src="([^"]+)"/g)) { const u = (h[1] || h[2] || h[3]).replace(/&amp;/g, "&"); nl++; ok(ALLOW.test(u), `link on the allow-list: ${u}`);
    const pg = /^([0-9a-z-]+)\.(qmd|html)$/.exec(u); if (pg) ok(fs.existsSync(path.join(SITE, "learn", pg[1] + ".qmd")), `linked lesson ${u} exists`); }
  ok(nl >= 20, `${nl} links checked`);
  ok(!/X1, upcoming/.test(QMD) && /\(side topic \[X1\]\(x01-under-the-hood\.html\)\)/.test(QMD) && /\(side topic <a href="x01-under-the-hood\.html">X1<\/a>\)/.test(QMD), "X1 is linked: it is live");
}

// ---------------- the page on a stub document: step 3 → step 4 → Back, step 3's state at 30/90,
// the heat ladder's verdicts and every supporting element's text budget, as the reader sees them
{
  const vm = require("vm");
  const { El, env, load } = require("./stubdom.js");
  // PlantDiagram writes its drawing as an SVG string; the stub keeps such HTML as text, so give it an empty first child
  if (!Object.getOwnPropertyDescriptor(El.prototype, "firstChild")) Object.defineProperty(El.prototype, "firstChild", { get() { return this.children[0] || (this._html != null ? new El("svg") : null); } });
  const E = env();
  E.LX.visible = () => false; E.LX.ready = () => {}; E.LX.progress.guess = () => null; E.LX.lerp = (a, b, t) => a + (b - a) * t;
  ["cards", "predict", "controls", "cardsort", "table", "energychain", "causal"].forEach(n => load(n, E));
  let init = null, cards = null;
  E.LX.mount = (slug, f) => { if (slug === "nuclear-basics") init = f; };
  E.LX.demo = (root, fn, c) => { cards = c; };
  vm.runInNewContext(JS, { window: E.window, document: E.document, location: E.location, navigator: {}, console, module: { exports: {} }, setTimeout: () => 0, clearTimeout: () => {} });
  const root = E.LX.H("div", { class: "lx-interactive", "data-learn": "nuclear-basics" }, E.body), live = E.LX.H("div", { class: "lx-live" }, root);
  let threw = null;
  try { init(live, { f05_nuclear_basics: D }, root); } catch (e) { threw = e.stack; }
  ok(!threw && cards && cards.count === 9, "the lesson mounts on the stub document" + (threw ? ": " + threw : ""));
  if (!threw && cards) {
    const card = () => cards.el, txt = e => e.textContent.replace(/\s+/g, " ").trim();
    const reading = () => txt(card().querySelector(".f5-read"));
    const slider = j => card().querySelectorAll(".f5-toy .lx-ctl")[j].querySelectorAll("button");   // [minus, plus]
    const budget = (where, t, w, n) => ok(words(t) <= (w || 35) && sentences(t) <= (n || 2), `${where}: within budget (${words(t)} words, ${sentences(t)} sentences): "${t.slice(0, 70)}…"`);
    const supporting = where => card().querySelectorAll(".lx-step-text, .lx-hint, .lx-saw, .f5-note, .f5-read, .f5-lad-out p").forEach(e => { const t = txt(e); if (t) budget(where, t, 35, 3); });
    // step 3: steady the chain at rods 40%
    cards.go(2);
    ok(/^Dying out|^Growing/.test(reading()) && /k = 1\.25/.test(reading()), "step 3 starts rods out, moderator full: k = 1.25");
    for (let r = 0; r < 4; r++) slider(0)[1].click();
    ok(/^Steady: critical/.test(reading()) && /k = 1\.00 \(rods 40% in, moderator 100%\)/.test(reading()), "step 3: rods 40% in holds the chain steady: " + reading());
    supporting("step 3");
    // step 4: drain the moderator to 40%
    cards.go(3);
    for (let q = 0; q < 6; q++) slider(1)[0].click();
    ok(/moderator 40%\): \*?\*?dying out|moderator 40%\): dying out/.test(reading()), "step 4: drained to 40%, the chain dies out: " + reading());
    supporting("step 4");
    // Back to step 3: the moderator is refilled, the step says so, and rods alone can steady the chain again
    cards.go(2);
    ok(/k = 1\.00 \(rods 40% in, moderator 100%\)/.test(reading()) && /^Steady: critical/.test(reading()), "step 3 after step 4: moderator back at 100%, the chain steady again: " + reading());
    ok(card().querySelectorAll(".lx-hint").some(e => txt(e) === "The moderator is back at 100% for this step."), "step 3 after step 4: the refill is announced");
    slider(0)[0].click(); slider(1)[0].click();   // rods 30%, moderator 90%: k = 0.99875
    ok(/^Dying out/.test(reading()) && /k = 0\.999 \(rods 30% in, moderator 90%\): dying out, from 100 neutrons to 99 in 12 generations\./.test(reading()), "step 3 at 30/90: shown as a slow decline, not steady: " + reading());
    // step 8: the heat ladder says overlap, never reach; a salt-cooled pick
    cards.go(7);
    const rowBtn = name => card().querySelectorAll("button.f5-lad-row").find(b => txt(b).indexOf(name) === 0);
    rowBtn("High-temperature gas-cooled").click();
    const lis = () => card().querySelectorAll(".f5-lad-uses li").map(txt);
    ok(lis().join(" | ") === "Electricity from steam: every design here. | District heat and desalination: no band drawn; water-cooled plants supply it in some places. | Solid-oxide electrolysis (hydrogen) (650 to 850 °C): the hottest designs run above all of this band. | High-temperature industrial heat (650 to 950 °C): outlet overlaps part of this band.",
       "step 8, high-temperature gas-cooled: " + lis().join(" | "));
    rowBtn("Sodium-cooled fast").click();
    ok(lis()[2] === "Solid-oxide electrolysis (hydrogen) (650 to 850 °C): outlet below this band." && !/within reach|out of reach/.test(txt(card())), "step 8, sodium-cooled: below the band; no 'within reach' wording");
    ok(/Overlap is a start; the design and its heat exchangers decide\./.test(txt(card().querySelector(".lx-saw"))), "step 8's feedback says overlap is not capability");
    ok(card().querySelectorAll(".lx-hint").some(e => /^Overlap is not capability: heat flows only from hotter to cooler/.test(txt(e))), "step 8: the caveat sits beside the ladder");
    supporting("step 8");
    // every other step's supporting text
    [0, 1, 4, 5, 6, 8].forEach(i => { cards.go(i); supporting("step " + (i + 1)); });
    cards.go(8); card().querySelectorAll(".lx-choice").find(b => /No, it keeps/.test(txt(b))).click();
    const rv = txt(card().querySelector(".lx-predict-out") || card());
    ok(/decay heat, so cooling must go on\. Fission stops but decay does not; the myth cards below/.test(rv), "step 9's reveal: the chain stops, decay heat goes on");
    supporting("step 9 answered");
  }
}

// ---------------- the rendered page (only when _site holds a render newer than the source; run after quarto render)
{
  const html = path.join(SITE, "_site/learn/f05-nuclear-basics.html");
  if (fs.existsSync(html) && fs.statSync(html).mtimeMs >= fs.statSync(path.join(SITE, "learn/f05-nuclear-basics.qmd")).mtimeMs) {
    const H = fs.readFileSync(html, "utf8");
    ["32.7%", "306 MW", "206 MW", "15 MPa", "326 °C", "288 °C", "90,000 metric tons", "700 to 950 °C", "under one"].forEach(s => ok(H.indexOf(s) >= 0, `rendered page states "${s}"`));
    ok(/data-learn="nuclear-basics"/.test(H) && /id="f5-explain"/.test(H) && (H.match(/class="lx-qq"/g) || []).length === 7, "rendered page: mount points and the seven practice items");
    const main = H.slice(H.indexOf('id="steps"'), H.indexOf('class="lx-foot"'));
    ok(main.length > 1000 && !/data[- ]?cent/i.test(main.replace(/<script[\s\S]*?<\/script>/g, "")), "rendered lesson body: no data-center mention");
  } else console.log("note: rendered page not checked (no _site render newer than the source)");
}

console.log(`${checks} checks, ${fails} failed`);
process.exit(fails ? 1 : 0);
