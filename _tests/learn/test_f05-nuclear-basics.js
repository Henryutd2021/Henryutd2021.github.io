// test_f05-nuclear-basics.js — Node tests for F5 (assets/learn/f05-nuclear-basics.js), its data
// (assets/learn/data/f05-nuclear-basics.json with town.json and cf_targets.json) and every number the page states.
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
  ok(T.kMin === 0.5 && T.kMax === 1.25 && T.rodAbsorb === 0.5 && T.n0 === 100 && T.generations === 12 && T.steadyBand === 0.005, "toy parameters as documented in the Modeler box");
  ok(near(M.kOf(T, 0, 100), T.kMax) && near(M.kOf(T, 0, 0), T.kMin), "rods out: k runs from kMin (no moderator) to kMax (all of it)");
  ok(near(M.kOf(T, 100, 100), T.kMax * (1 - T.rodAbsorb)) && near(M.kOf(T, 100, 0), T.kMin * (1 - T.rodAbsorb)), "rods fully in absorb rodAbsorb of the neutrons");
  const R = M.grid(T.rods), Mo = M.grid(T.moderator);
  ok(R.length === 11 && Mo.length === 11 && R[0] === 0 && R[10] === 100, "slider grids: 0 to 100% in steps of 10");
  let mono = true, maxK = -1, minK = 9;
  R.forEach(r => Mo.forEach(m => { const k = M.kOf(T, r, m); maxK = Math.max(maxK, k); minK = Math.min(minK, k);
    if (r > 0 && !(M.kOf(T, r - 10, m) > k)) mono = false; if (m > 0 && !(M.kOf(T, r, m - 10) < k)) mono = false; }));
  ok(mono, "k falls as rods go in and rises with the moderator, at every grid point");
  ok(near(maxK, 1.25) && near(minK, 0.25), `slider extremes: k from ${minK} to ${maxK}`);
  const kRow = (QMD.match(/\| \$k\$ \| multiplication factor[^|]*\| ([\d.]+) to ([\d.]+) \|/) || []);
  ok(+kRow[1] === minK && +kRow[2] === maxK, `the Modeler table's k range (${kRow[1]} to ${kRow[2]}) is the sliders' range`);
  ok(/\| \$k_\\text\{min\}\$, \$k_\\text\{max\}\$ \|[^|]*\| 0\.5 and 1\.25 \|/.test(QMD) && /\| \$a\$ \|[^|]*\| 0\.5 \|/.test(QMD) && /at \$m = 1\$, \$r = 0\.4\$/.test(QMD), "the Modeler table's parameters are the data's (kMin, kMax, rodAbsorb) and the steady point is rods 40%, moderator 100%");
  ok(M.stateOf(0.99, T.steadyBand) === "dying" && M.stateOf(1, T.steadyBand) === "steady" && M.stateOf(1.01, T.steadyBand) === "growing" &&
     M.stateOf(0.995, T.steadyBand) === "steady" && M.stateOf(1.005, T.steadyBand) === "steady", "k < 1 dies, k = 1 (within 0.5%) is steady, k > 1 grows");
  const st = M.series(1, 100, 12); ok(st.length === 13 && st.every(v => v === 100), "k = 1: every generation equals the first");
  const gr = M.series(1.25, 100, 12), dy = M.series(M.kOf(T, 40, 40), 100, 12);
  ok(gr.every((v, i) => i === 0 || v > gr[i - 1]) && dy.every((v, i) => i === 0 || v < dy[i - 1]), "k > 1 grows every generation, k < 1 shrinks every generation");
  ok(Math.round(gr[12]) === 1455 && dy[12] < 1 && M.count(dy[12]) === "under one", `fallback table: 1.25 gives 1,455 and 0.64 gives under one neutron (${dy[12].toFixed(2)})`);
  ok(near(M.kOf(T, 40, 100), 1) && M.fmtK(M.kOf(T, 40, 40)) === "0.64" && M.fmtK(M.kOf(T, 40, 0)) === "0.40", "k = 1.00 at rods 40%, moderator 100%; 0.64 at 40% moderator; 0.40 drained");
  const SG = M.steadyGrid(T);
  ok(SG.length === 2 && SG.some(x => x.rods === 40 && x.mod === 100 && x.k === 1) && SG.some(x => x.rods === 30 && x.mod === 90), `steady settings: ${SG.map(x => x.rods + "/" + x.mod).join(", ")} (both show k = 1.00)`);
  ok(SG.every(x => M.fmtK(x.k) === "1.00"), "every setting the toy calls steady displays k = 1.00");
  ok(M.stateOf(M.kOf(T, 40, 90), T.steadyBand) === "dying", "step 4: from the steady setting, one notch of draining kills the chain (the step can be finished)");
  // the sentences shown after a slider move, for every setting: one sentence, within budget
  R.forEach(r => Mo.forEach(m => { const t = M.toyText(T, r, m); ok(words(t) <= 25 && sentences(t) === 1 && t.indexOf("k = " + M.fmtK(M.kOf(T, r, m))) === 0, `toy line at ${r}/${m}: one sentence, ${words(t)} words`); }));
  Object.keys(M.SAW).forEach(k => ok(words(M.SAW[k]) <= 35 && sentences(M.SAW[k]) <= 2, `step feedback ${k}: within budget`));
  ok(/kOf\(T, 0, 100\)/.test(JS) && !/leads to 1\.25/.test(JS), "step 3's 1.25 is computed from the toy, not typed");
}

// ---------------- model validation: the plant, pressures and the designs' reach
{
  const W = M.plant(F, TOWN.fleet.nuclear.mw);
  ok(TOWN.fleet.nuclear.mw === 100 && D.plant.townMW === 100, "Prairie Town's plant: 100 MW (town.json, illustrative)");
  ok(F.heat_rate_btu_kwh.value === 10443 && F.heat_rate_btu_kwh.year === 2025 && F.btu_per_kwh.value === 3412, "EIA: 10,443 Btu/kWh (2025) and 3,412 Btu per kWh");
  ok(near(W.eff, 3412 / 10443) && M.pct1(W.eff) === "32.7%", `efficiency 3,412 ÷ 10,443 = ${M.pct1(W.eff)}`);
  ok(Math.round(W.heat) === 306 && Math.round(W.waste) === 206 && near(W.heat - W.waste, 100), `heat ${W.heat.toFixed(2)} MW, low-temperature heat ${W.waste.toFixed(2)} MW`);
  const q = 600 * W.eff; ok(Math.round(q) === 196 && Math.round(600 - q) === 404, `quiz: 600 MW of heat gives ${q.toFixed(1)} MW; 404 MW leaves`);
  ok(M.atm(F.pwr_mpa.value, F) === 150 && M.atm(F.bwr_mpa.value, F) === 70, "15 MPa is about 150 and 7 MPa about 70 times sea-level air pressure (101.325 kPa)");
  ok(F.pwr_mpa.value === 15 && F.pwr_c.value === 326 && F.bwr_mpa.value === 7 && F.bwr_c.value === 288, "QTR 2015 Figure 4.M.4: PWR ~15 MPa, ~326 °C; BWR ~7 MPa, ~288 °C");
  ok(F.htr_lo_c.value === 700 && F.htr_hi_c.value === 950 && F.proc_lo_c.value === 650 && F.proc_hi_c.value === 950 && F.htr_eff_850.value === 47, "QTR 4.J: 700 to 950 °C outlets; 650 to 950 °C process heat; 47% at 850 °C");
  ok(F.sfr_lo_c.value === 500 && F.sfr_hi_c.value === 550 && F.soec_lo_c.value === 650 && F.soec_hi_c.value === 850, "QTR 4.H: 500 to 550 °C; DOE HFTO: solid oxide 650 to 850 °C");
  const reach = k => M.reached(D, k).map(u => u.key).join();
  ok(reach("large") === "power,district" && reach("small") === "power,district" && reach("sfr") === "power,district", "water-cooled and sodium-cooled designs reach electricity and district heat, not the 650 °C bands");
  ok(reach("htgr") === "power,district,soec,industry" && reach("msr") === "power,district,soec,industry", "the 700 to 950 °C designs reach every band");
  ok(reach("micro") === "power", "a microreactor (outlet depends on its coolant) is shown reaching electricity only");
  const byKey = {}; D.designs.forEach(d => { byKey[d.key] = d; });
  ok(byKey.large.hi === F.pwr_c.value && byKey.large.lo === F.bwr_c.value && byKey.htgr.lo === F.htr_lo_c.value && byKey.htgr.hi === F.htr_hi_c.value && byKey.sfr.lo === F.sfr_lo_c.value && byKey.sfr.hi === F.sfr_hi_c.value, "design bars use the sourced temperatures");
  ok(byKey.large.size === F.large_mwe.text && byKey.small.size === F.small_mwe.text && byKey.micro.size === F.micro_mwt_lo.value + " to " + F.micro_mwt_hi.value + " MWt" && byKey.htgr.size === "up to " + F.htr_mwt_max.value + " MWt each", "design sizes from the facts");
  ok(D.uses.find(u => u.key === "soec").lo === F.soec_lo_c.value && D.uses.find(u => u.key === "industry").hi === F.proc_hi_c.value, "use bands from the facts");
  ok(CF.reference.nuclear.cf === 0.911 && CF.reference.nuclear.year === 2025, "the Modeler box's 91.1% is EIA's 2025 nuclear capacity factor (cf_targets.json)");
}

// ---------------- every number with a unit on the page comes from the data or the model
{
  const W = M.plant(F, 100);
  const strip = s => s.replace(/^---[\s\S]*?\n---/, "").replace(/<!-- learn:(meta|next|footer):start[\s\S]*?learn:\1:end -->/g, "").replace(/<style>[\s\S]*?<\/style>/, "")
    .replace(/<!--[\s\S]*?-->/g, "").replace(/https?:\/\/[^\s"')]+/g, " ").replace(/\$\$[\s\S]*?\$\$/g, " ").replace(/<ul class="lx-choices">[\s\S]*?<\/ul>/g, " ");
  const prose = strip(QMD);
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
  ok(fb.indexOf("about 306 MW of heat") > 0 && fb.indexOf("about 206 MW leaves") > 0 && fb.indexOf("32.7%") > 0, "fallback: the plant's numbers");
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
  ok(/data-src="\.\.\/assets\/learn\/data\/f05-nuclear-basics\.json \.\.\/assets\/learn\/data\/town\.json"/.test(QMD), "the page loads its data and town.json");
  ok((QMD.match(/class="lx-qq"/g) || []).length === 7 && /about 5 minutes: five myths, then two questions/.test(QMD), "practice: five myths and two questions, about 5 minutes");
  const stepsSrc = JS.slice(JS.indexOf("var steps = ["), JS.indexOf("function energyBars"));
  const steps = [...stepsSrc.matchAll(/\{ text: "((?:[^"\\]|\\.)*)"/g)].map(x => x[1]);
  ok(steps.length === 9, `${steps.length} step texts`);
  steps.forEach(t => { ok(words(t) <= 40 && sentences(t) <= 2, `step text within budget: "${t.slice(0, 50)}…"`); ok(t.indexOf("**") < 0, "no ** in step text"); });
  const s3 = "With the rods out, each split here leads to " + M.fmtK(M.kOf(T, 0, 100)) + " more. Push the control rods in until the bars stay level: steady, or critical.";
  ok(words(s3) <= 40 && sentences(s3) === 2, "step 3 as shown: within budget");
  // glossary sidecar: one sentence each, ids used on the page
  const ids = [...SIDE.matchAll(/- id: ([a-z0-9-]+)/g)].map(x => x[1]);
  ok(ids.length === 16 && ids.indexOf("fission") >= 0 && ids.indexOf("decay-heat") >= 0, `${ids.length} new glossary terms`);
  ["turbine", "generator", "waste-heat", "heat-engine", "transformer", "substation", "voltage"].forEach(t => ok(ids.indexOf(t) < 0, `sidecar leaves ${t} to F4 or F6`));
  const used = new Set([...(JS + QMD).matchAll(/\[\[([a-z0-9-]+)\||data-term="([a-z0-9-]+)"|term="([a-z0-9-]+)"/g)].map(x => x[1] || x[2] || x[3]));
  ["neutron", "fission", "chain-reaction", "control-rod", "criticality", "moderator", "coolant", "outlet-temperature", "decay-heat", "steam-generator", "mwt-mwe", "passive-safety"].forEach(i => ok(used.has(i), `glossary term ${i} is marked on the page`));
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
  ok(!/excerpt:|lx-excerpt|Henryutd2021|Li et al/.test(QMD + JS + JSON.stringify(D)), "no excerpt, repository or citation of Henry's research (G-SRC)");
  const own = QMD.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?learn:\1:end -->/g, "").replace(/<!--[\s\S]*?-->/g, "");
  const ALLOW = /^(https:\/\/www\.(eia\.gov|energy\.gov)\/|#|\.\.\/assets\/|[0-9a-z-]+\.(qmd|html)(#[a-z0-9-]*)?$)/;
  let nl = 0;
  for (const h of own.matchAll(/href="([^"]+)"|\]\(([^)]+)\)|src="([^"]+)"/g)) { const u = (h[1] || h[2] || h[3]).replace(/&amp;/g, "&"); nl++; ok(ALLOW.test(u), `link on the allow-list: ${u}`);
    const pg = /^([0-9a-z-]+)\.(qmd|html)$/.exec(u); if (pg) ok(fs.existsSync(path.join(SITE, "learn", pg[1] + ".qmd")), `linked lesson ${u} exists`); }
  ok(nl >= 20, `${nl} links checked`);
  ok(/X1, upcoming/.test(QMD) && !/href="x01/.test(QMD), "X1 is named as upcoming, not linked");
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
