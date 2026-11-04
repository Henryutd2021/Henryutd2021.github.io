// test_f07-microgrids.js — Node tests for lesson F7 (assets/learn/f07-microgrids.js, its data file and
// learn/f07-microgrids.qmd):
//   - the solar shapes in the data file equal LX.townProfile's output for the named 2025 days (the data note's claim)
//   - the campus island: hourly balance, fuel and battery limits, the stated hours (July, January, a doubled battery), and
//     what the page says follows from them (power limit at night, winter shorter, doubling not doubling)
//   - the village: the settled average day, the smallest designs the page states, the evening mill needing a bigger battery
//   - every number on the page (fallbacks, myths, quiz, parts, facts, data note) matches the model or the data file
//   - the five no-JS blocks equal what the lesson's generators write (--write rewrites them)
//   - research wording (curriculum §13, guard G-SRC): every sentence of the Real-world box, and any element of the page,
//     the data file or the script that names the course author's work, is an approved sentence of
//     reports/learn/excerpts_for_approval.md (E8, E9), word for word
//   - links (allowed domains, learn pages, doi.org), the text budget
// Usage (from the site folder):  node _tests/learn/test_f07-microgrids.js [--write]
"use strict";
const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const ID = "f07-microgrids";
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const M = require(L(ID + ".js"));
const PR = require(L("components/profiles.js"));
const D = JSON.parse(fs.readFileSync(L("data/" + ID + ".json"), "utf8"));
const JS = fs.readFileSync(L(ID + ".js"), "utf8");
const QPATH = path.join(SITE, "learn", ID + ".qmd");
const C = D.campus, V = D.village;
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-9 : t);

// ---------------- the no-JS blocks: write (--write) or check
const BLOCKS = { "f7-steps": () => M.staticSteps(D), "f7-explain": () => M.staticExplain(D), "f7-myth": () => M.staticMyth(D),
                 "f7-sort": () => M.staticSort(D), "f7-facts": () => M.staticFacts(D) };
function between(q, name) {
  const a = q.match(new RegExp("<!-- " + name + ":start[^>]*-->\\n")), b = q.indexOf("<!-- " + name + ":end -->");
  if (!a || b < a.index) throw new Error(name + " markers missing in " + QPATH);
  return { from: a.index + a[0].length, to: b };
}
if (process.argv.includes("--write")) {
  let q = fs.readFileSync(QPATH, "utf8");
  Object.keys(BLOCKS).forEach(k => { const r = between(q, k); q = q.slice(0, r.from) + BLOCKS[k]() + "\n" + q.slice(r.to); });
  fs.writeFileSync(QPATH, q);
  console.log("no-JS blocks written: " + Object.keys(BLOCKS).join(", "));
}
const PAGE = fs.readFileSync(QPATH, "utf8");
Object.keys(BLOCKS).forEach(k => { const r = between(PAGE, k); ok(PAGE.slice(r.from, r.to) === BLOCKS[k]() + "\n", k + " block is up to date (run with --write)"); });
const text = s => s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const T = text(PAGE);

// ---------------- the solar shapes are what the data note says
const YEAR = JSON.parse(fs.readFileSync(L("data/town_year.json"), "utf8")), TG = JSON.parse(fs.readFileSync(L("data/cf_targets.json"), "utf8"));
const pm = PR.townProfile("solar", 1, { year: YEAR, targets: TG, monthlyCF: true }), pa = PR.townProfile("solar", 1, { year: YEAR, targets: TG });
["jul", "jan"].forEach(s => {
  const w = C.windows[s], d0 = w.day0, want = [];
  for (let h = d0 * 24; h < (d0 + 3) * 24; h++) want.push(+pm.mw[h].toFixed(3));
  ok(w.solar.length === 72 && w.solar.every((v, i) => v === want[i]), s + ": the 72-hour solar window equals townProfile (monthlyCF) from day " + d0);
  const first = new Date(Date.UTC(2025, 0, 1 + d0)).toISOString().slice(0, 10), last = new Date(Date.UTC(2025, 0, 3 + d0)).toISOString().slice(0, 10);
  ok(w.dates[0] === first && w.dates[1] === last, s + ": the window's dates match its day index (" + first + " to " + last + ")");
});
const avg = new Array(24).fill(0); for (let d = 0; d < 365; d++) for (let h = 0; h < 24; h++) avg[h] += pa.mw[d * 24 + h] / 365;
ok(V.sun.every((v, h) => v === +avg[h].toFixed(3)), "the village's average day equals the 2025 mean of each hour (annual scaling)");
ok(near(pa.cf, 0.24, 1e-9) && TG.targets.solar.cf === 0.24, "the annual scaling is EIA's 24.0%");
ok(/28–30 July and 20–22 January 2025/.test(T) && C.windows.jul.label === "28–30 July 2025" && C.windows.jan.label === "20–22 January 2025", "the data note names the two windows");

// ---------------- the campus island
const all = {}; C.loads.forEach(l => { all[l.key] = true; });
ok(M.totalKW(C) === 1200 && M.nightKW(C) === 900 && M.fuelKWh(C) === 9600, "campus: 1,200 kW of load, 900 kW at night (battery + generator), 9,600 kWh of fuel");
ok(M.keptKW(C, all) > M.nightKW(C), "keeping every load does not fit at night: loads must be shed (step 4)");
const X = M.cases(C);
ok(X[0].kw === 650 && X[0].kw <= M.nightKW(C) && X[1].kw === 400, "the two stated cases: 650 kW and 400 kW, both within the night's 900 kW");
X.forEach(x => ["jul", "jan"].forEach(s => {
  const r = x[s];
  ok(r.rows.length === 72, s + " " + x.kw + " kW: 72 hours");
  r.rows.forEach(h => {
    const supplied = h.used + h.gen + h.bat + h.short;
    if (!(near(supplied, h.load, 1e-6))) ok(false, s + " " + x.kw + " kW hour " + h.t + ": supply + short = load");
    if (h.gen > C.gen.kw + 1e-9 || h.bat > C.battery.kw + 1e-9 || h.charge > C.battery.kw + 1e-9) ok(false, s + " hour " + h.t + ": power limits");
    if (h.stored < -1e-9 || h.stored > C.battery.kwh + 1e-6 || h.fuel < -1e-9) ok(false, s + " hour " + h.t + ": battery and fuel within their limits");
    if (h.short > 0 && (h.fuel > 1e-6 && h.gen < C.gen.kw - 1e-6)) ok(false, s + " hour " + h.t + ": short only once the generator is at full power or out of fuel");
  });
  const firstShort = r.rows.findIndex(h => h.short > 0);
  ok(r.full ? firstShort < 0 : firstShort === r.lasts, s + " " + x.kw + " kW: 'lasts' is the number of hours before the first short hour");
}));
const H = { jul650: X[0].jul.lasts, jan650: X[0].jan.lasts, jul400: X[1].jul.lasts, jan400: X[1].jan.lasts, double: X[1].jul2.lasts };
ok(H.jul650 === 20 && H.jan650 === 8 && H.jul400 === 51 && H.jan400 === 40 && H.double === 67, "stated hours: 650 kW lasts 20 h (July) and 8 h (January); 400 kW lasts 51 h and 40 h; 400 kW with 4,000 kWh lasts 67 h in July (" + JSON.stringify(H) + ")");
ok(X.every(x => x.jan.lasts < x.jul.lasts), "January is shorter than July for both stated cases (step 6, explain)");
// the seasons idea (explain) and the January step's words follow the runs: no "refill" where no run charges the battery
const charges = r => r.rows.some(h => h.charge > 0.5);
ok(!charges(X[0].jul) && !charges(X[0].jan) && !/refill|recharg/i.test(M.staticExplain(D)) && /weaker sun leaves more of the load to the generator and battery/.test(M.staticExplain(D)),
  "650 kW: spare sun never charges the battery in either season, so the seasons idea names less sun for the load, not refilling (review F7 #3)");
ok(charges(X[1].jul) && !charges(X[1].jan) && /Only July had spare sun to recharge the battery/.test(M.winter(C, X[1].keep).line), "400 kW: July recharges, January does not, and the result line says so");
ok(H.double > H.jul400 && H.double < 2 * H.jul400, "doubling the battery lengthens the island but does not double it (myth 3)");
ok(X[0].jul.lasts < X[1].jul.lasts && X[0].jan.lasts < X[1].jan.lasts, "shedding the dorms lengthens the island");
// every one of the 16 sets of loads: the rule of step 4 (both critical loads on, within the night's power), the January
// step's answer and words (review F7 #1, #4), and more load never lasting longer
const every = [], subsets = [];
for (let m = 0; m < 16; m++) { const k = {}; C.loads.forEach((l, i) => { k[l.key] = !!(m & (1 << i)); }); every.push(k); if (M.keepStatus(C, k) === "ok") subsets.push(k); }
ok(M.criticalKeys(C).join() === "hospital,water", "the critical loads: the hospital and the water plant");
every.forEach(k => {
  const st = M.keepStatus(C, k), name = Object.keys(k).filter(x => k[x]).join("+") || "none";
  ok(st === (!k.hospital || !k.water ? "critical" : M.keptKW(C, k) > M.nightKW(C) ? "over" : "ok"), "keepStatus(" + name + ") = " + st);
  const w = M.winter(C, k), want = w.jan.lasts < w.jul.lasts ? "short" : w.jan.lasts > w.jul.lasts ? "long" : "same";
  ok(w.answer === want, name + ": the January step's answer is the runs' comparison (" + want + ")");
  ok(/^Yes/.test(w.feedback[want]) && Object.keys(w.feedback).filter(o => o !== want).every(o => !/^Yes/.test(w.feedback[o])), name + ": only the right choice's feedback says yes");
  ok((want === "short") === /weaker in winter/.test(w.line) && (want === "same") === /ran out before the sun could make a difference/.test(w.line), name + ": the result line follows the comparison");
  ok(!/recharg|refill/i.test(w.line) || w.charged.jul || w.charged.jan, name + ": the result line names recharging only when a run charges");
  [w.line].concat(Object.values(w.feedback)).forEach(t => ok(text(t).replace(/\*\*/g, "").split(" ").length <= 40, name + ": a January text stays short"));
});
ok(["hospital", "water"].every(c => { const k = Object.assign({}, subsets[0]); k[c] = false; return M.keepStatus(C, k) === "critical"; }), "removing either critical load fails step 4's rule (it cannot be completed)");
subsets.forEach(a => subsets.forEach(b => {
  const sub = C.loads.every(l => !a[l.key] || b[l.key]);
  if (sub) ["jul", "jan"].forEach(s => { if (M.island(C, b, s).lasts > M.island(C, a, s).lasts) ok(false, "a larger set of loads lasted longer (" + s + ")"); });
}));
ok(subsets.length === 2 && subsets.every(k => !k.labs) && subsets.some(k => k.dorms), "two sets pass step 4: the critical loads, with or without the dorms (the labs never fit with both): " + subsets.length);
ok(subsets.every(k => { const w = M.winter(C, k); return w.answer === "short"; }), "every set that passes step 4 lasts less long in January");
// the diagram's words (review F7 #6): connected is not supplied; solar only in sunshine; both sources run in an island
const dstate = (keep, former) => ({ grid: false, sw: "open", former: former || "battery", keep: keep });
const allOn = every[15];
ok(M.partWords(C, dstate(allOn), "hospital") === "connected, but the island cannot carry every connected load" && !M.loadLit(C, dstate(allOn), "hospital"), "1,200 kW connected in an island: no load is drawn as supplied");
ok(M.partWords(C, dstate(subsets[0]), "hospital") === "connected and supplied" && M.loadLit(C, dstate(subsets[0]), "hospital") && M.partWords(C, dstate(subsets[0]), "labs") === "shed", "a set within the night's power: kept loads supplied, the rest shed");
ok(/when the sun shines/.test(M.partWords(C, dstate(subsets[0]), "solar")) && M.partWords(C, dstate(subsets[0]), "gen") === "running" && M.partWords(C, dstate(subsets[0], "gen"), "battery") === "running", "solar makes power only in sunshine; the generator and battery both run in the island");
// the diagram's state rule
ok(M.liveState({ grid: false, sw: "closed" }).live === false && M.liveState({ grid: true, sw: "closed" }).live === true, "grid down with the switch closed: dark; grid up: live");
ok(M.liveState({ grid: false, sw: "open", former: "solar" }).live === false && M.liveState({ grid: false, sw: "open", former: "battery" }).island && M.liveState({ grid: false, sw: "open", former: "gen" }).island,
  "an island forms with the battery or the generator, not with the solar inverters");

// ---------------- the village
const v0 = M.smallest(V, null), vn = M.smallest(V, "noon"), ve = M.smallest(V, "evening");
ok(v0.kw === 15 && v0.kwh === 40 && vn.kw === 20 && vn.kwh === 40 && ve.kw === 20 && ve.kwh === 70, "smallest designs: households 15 kW + 40 kWh; mill at noon 20 + 40; mill in the evening 20 + 70");
M.panelChoices(V).forEach(p => [null, "noon", "evening"].forEach(m => M.batteryChoices(V).forEach(b => {
  const r = M.villageDay(V, p, b, m);
  if (!r.settled) ok(false, "village " + p + " kW, " + b + " kWh, " + m + ": the average day settles");
  if (!near(r.rows.reduce((s, h) => s + h.direct + h.bat + h.short, 0), r.load, 1e-6)) ok(false, "village: supply + short = load");
})));
ok(M.panelChoices(V).every(p => { const a = M.minBattery(V, p, "noon"), b = M.minBattery(V, p, "evening"); return a === null || b === null || b > a; }), "with the same panels, the evening mill always needs a bigger battery");
ok(near(M.villageLoad(V, "noon").reduce((a, b) => a + b, 0), M.villageLoad(V, "evening").reduce((a, b) => a + b, 0), 1e-9), "the mill's day uses the same energy at noon and in the evening (the predict's feedback)");
ok(near(M.villageLoad(V, null).reduce((a, b) => a + b, 0), 58.5, 1e-9) && V.mill.kw * 4 === 30, "village: 58.5 kWh a day for the households, 30 kWh for the mill");
const hh = h => (h < 10 ? "0" : "") + h + ":00", span = a => hh(a[0]) + " to " + hh(a[a.length - 1] + 1);
ok(span(V.mill.noon) === "10:00 to 14:00" && span(V.mill.evening) === "18:00 to 22:00" && JS.indexOf("runs from " + span(V.mill.noon)) >= 0 && JS.indexOf("grind from " + span(V.mill.evening)) >= 0 &&
   JS.indexOf('"10:00–14:00"') >= 0 && JS.indexOf('"18:00–22:00"') >= 0, "the mill's hours in the step texts and labels equal the data (10:00 to 14:00; 18:00 to 22:00)");
ok(V.panels.start === 10 && M.minBattery(V, 10, "noon") === null, "the village starts short (10 kW of panels serves no hour plan): the reader must act");
// step 8 asks about the smallest design (review F7 #5): the answer comes from the model, whatever the reader's sliders show
const mv = M.millMove(V);
ok(mv.answer === "battery" && mv.noon.kw === mv.evening.kw && mv.evening.kwh > mv.noon.kwh, "moving the mill to the evening grows the smallest design's battery only (" + mv.answer + ")");
ok(/^Yes/.test(mv.feedback[mv.answer]) && Object.keys(mv.feedback).every(k => k === mv.answer || !/^Yes/.test(mv.feedback[k])) && Object.values(mv.feedback).every(t => t.split(" ").length <= 40), "step 8's feedback: yes only for the model's answer; each short");
ok(M.panelChoices(V).some(p => M.batteryChoices(V).some(b => M.villageDay(V, p, b, "evening").ok && b > mv.evening.kwh)), "a reader's larger design may already serve the evening: so the question asks about the smallest design");
// the village's flowchart trace follows the design (review F7 #2)
const vt0 = M.villageTrace(V, 10, 20, "noon", true), vt1 = M.villageTrace(V, 20, 40, "noon", true), vt2 = M.villageTrace(V, null, null, null, false);
ok(vt0.path[3] === "lasts" && /short in \d+ hours/.test(vt0.text) && vt1.path[3] === "ok" && /every hour of an average day served/.test(vt1.text) && vt2.path[3] === "ok" && /^The smallest design, 20 kW/.test(vt2.text),
  "the village trace: short designs end at 'lasts', serving ones at 'ok'; before the reader designs, the smallest design stands in");
[vt0, vt1, vt2].forEach(t => ok(t.text.split(" ").length <= 40 && /stored energy only/.test(t.text), "the village trace states the toy's boundary and stays short"));
ok(/only stored energy is tested, not cloudy days/.test(D.texts.villageToy) && JS.indexOf("D.texts.villageToy") >= 0 && /only stored energy is tested, not cloudy days/.test(T), "the village's toy boundary is on the page and in the step (review F7 #7)");
// the explain layer is refreshed from the reader's state (review F7 #2)
ok(/function setKeep[\s\S]*?X\.refresh\(S0\)/.test(JS) && /S0\.vseen = true; if \(X\) X\.refresh\(S0\)/.test(JS) && /fc\.update\(traces\)/.test(JS), "kept loads and village changes refresh the explain layer");

// ---------------- numbers on the page
ok(/5 hours: 2,000 kWh ÷ 400 kW/.test(T) && C.battery.kwh / X[1].kw === 5 && X[1].kw <= C.battery.kw, "quiz 1: 2,000 kWh ÷ 400 kW = 5 hours, within the battery's 500 kW");
const lab = C.loads.find(l => l.key === "labs");
ok(/the labs stay on too: 950 kW/.test(T) && X[1].kw + lab.kw === 950 && 950 > C.battery.kw && /more than the battery's 500 kW/.test(T), "quiz 2: hospital + water + labs = 950 kW, above the battery's 500 kW");
ok(/stops feeding an unintentional island, normally within 2 seconds/.test(T) && D.facts.some(f => f.n === "2 s" && /unintentional island/.test(f.what) && /up to 5 s by agreement/.test(f.what)), "myth 1 and the facts agree: an unintentional island, normally 2 seconds, up to 5 by agreement");
const P = {}; D.parts.forEach(p => { P[p.key] = p; });
ok(P.solar.name === "Solar panels, " + M.kw(C.solarKW) && P.battery.name === "Battery, " + M.kw(C.battery.kw) + " and " + M.kwh(C.battery.kwh) && P.gen.name === "Diesel generator, " + M.kw(C.gen.kw) &&
   /Fuel for 24 hours/.test(P.gen.note) && C.gen.fuelHours === 24, "the parts' sizes equal the data");
C.loads.forEach(l => ok(P[l.key] && P[l.key].name === l.label + ", " + M.kw(l.kw), "part " + l.key + ": its name carries its kW"));
ok(/269\.2 minutes in 2025/.test(D.facts[0].what) && /IEEE method/.test(D.facts[0].what) && D.facts[0].n === "4.5 h · 11.0 h" && near(269.2 / 60, 4.49, 0.01) && near(662.6 / 60, 11.04, 0.01), "fact 1: 269.2 and 662.6 minutes are 4.5 and 11.0 hours");
D.facts.forEach(f => ok(PAGE.indexOf('<td class="n">' + f.n + "</td><td>" + f.what + "</td>") >= 0 && PAGE.indexOf(f.url) >= 0, "numbers to remember: '" + f.n + "' row on the page with its source"));
ok(/the generator runs first, the battery gives the rest, spare sun recharges it/.test(T), "the data note states the island's rule");

// ---------------- links
const OWN = PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?<!-- learn:\1:end -->/g, "");
const hrefs = [...OWN.matchAll(/href="([^"]+)"/g)].map(m => m[1]).concat([...OWN.matchAll(/\]\(([^)]+)\)/g)].map(m => m[1]));
const OKH = /^(https:\/\/doi\.org\/10\.|https:\/\/www\.eia\.gov\/|https:\/\/www\.energy\.gov\/|https:\/\/www\.nerc\.com\/|https:\/\/www\.worldbank\.org\/|https:\/\/connectedcommunities\.lbl\.gov\/|[0-9a-z-]+\.html$|\.\.\/assets\/|#)/;
ok(hrefs.length > 0 && hrefs.every(h => OKH.test(h)), "links: doi.org, EIA, DOE, NERC, the World Bank, Berkeley Lab and learn pages only: " + hrefs.filter(h => !OKH.test(h)).join(", "));
ok(!/projects\/|research\.html/.test(PAGE + JSON.stringify(D)), "no project page and no Research page");
// CF1's link follows its status in path.yml (review F7 #14): linked once live, named only while it is a draft
const PY = fs.readFileSync(path.join(SITE, "learn/path.yml"), "utf8"), cf1 = (PY.split(/\n- kind: /).find(e => /\n  id: cf1-supply-chain-microgrids\n/.test(e)) || "");
const cf1Live = /\n  status: active\n/.test(cf1) && fs.existsSync(path.join(SITE, "learn/cf1-supply-chain-microgrids.qmd"));
ok(cf1Live ? /<a href="cf1-supply-chain-microgrids\.html">case file CF1<\/a>/.test(PAGE) && !/upcoming/.test(T) : /case file CF1 \(upcoming\)/.test(T) && !/cf1-supply-chain-microgrids\.html/.test(PAGE),
  "CF1 is " + (cf1Live ? "live: the Real-world box links it" : "a draft: named, not linked"));

// ---------------- research wording (curriculum §13, guard G-SRC)
// Every sentence about the course author's work is an approved sentence of the register (sections E8 and E9), word for
// word, or a clause of one where the row itself breaks (": ", "; ", ". "). Strict zone: the Real-world box. Signalled
// (an element that names the author's work, by RX): everything else on the page, every string of the data file, every
// string literal of this script. NOT_RESEARCH lists the labels and general sentences that may sit beside the excerpts.
const RG = { sections: ["E8", "E9"], used: ["E8.2", "E8.7", "E9.1", "E9.2", "E9.3"] };
const APPROVED_SNAPSHOT = {   // the register's E8.2, E8.7 and E9.1-E9.3 (approved 2026-11-03)
  "E8.2": "From the course author's research: in the modeled supply chains, each open factory or warehouse could run its own microgrid, with on-site wind, solar and storage, an energy balance every hour, and energy bought from and sold to the grid.",
  "E8.7": "Holds when: stylized networks with synthetic distances and costs, candidate sites in California, Arizona and Nevada, and one year, planned week by week for products and hour by hour for energy. Leaves out: grid outages, which the studies do not model.",
  "E9.1": "In an industry internship, the course author worked on this question: how should solar PV, battery storage and backup generation be sized for an industrial campus to meet demand through grid outages?",
  "E9.2": "The work used a techno-economic optimization model to size a resilient microgrid for the campus.",
  "E9.3": "The company's data, models and results are confidential and are not shown here."
};
const RX = /\b(course author|research|stud(y|ies)|paper|article|Li et al|excerpt|internship|confidential|supply chains?|factor(y|ies)|warehouses?|transactive|Applied Mathematical Modelling|SEGRE|California|Arizona|Nevada|synthetic|techno-economic)\b/i;
const NOT_RESEARCH = [
  [/^Approved excerpt of: Li et al\. \(2023\), Applied Mathematical Modelling\.$/, "provenance label"],
  [/^In the real world$/, "heading"],
  [/^The full case: case file CF1( \(upcoming\))?\.$/, "pointer to the case file"],
  [/^In Puerto Rico, a small microgrid that serves a community organization kept the power on for nine days during Hurricane Fiona, while other parts of the island were dark \(U\.S\. DOE, 8 November 2023\)\.$/, "a public case, sourced, not the course author's work"],
  [/^Li et al\. \(2023\)\. Facility and microgrid location-allocation for integrated supply chain and transactive energy operations\. Applied Mathematical Modelling 119, 119–136\.$/, "citation (checked against publications.bib below)"],
  [/^(The research text \(realWorld\)|Lesson F7 \(f07-microgrids\), 2026-11-03\.)/, "the data file's provenance note"],
  [/^NERC \(2021\)\. White Paper: Grid Forming Controls \(PDF\), pp\. 8 and 11: grid-following and grid-forming inverters\. December 2021\.$/, "citation (NERC)"]
];
const norm = s => String(s).replace(/\[\[[a-z0-9-]+\|([^\]]+)\]\]/g, "$1").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'")
  .replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").replace(/ ([.,;:?!)])/g, "$1").replace(/\( /g, "(").trim();
function portfolio() {
  const c = [process.env.LEARN_PORTFOLIO, path.join(SITE, "..")];
  try { c.push(path.resolve(SITE, cp.execSync("git rev-parse --git-common-dir", { cwd: SITE, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(), "..", "..")); } catch (e) { /* not a git checkout */ }
  return c.filter(Boolean).find(p => fs.existsSync(path.join(p, "reports/learn/excerpts_for_approval.md")));
}
// {id: sentence} of the register's rows in the sections, each revision applied (a revised row replaces the approved one)
function register(md) {
  const out = {}; let sec = null;
  const strip = t => norm(t.replace(/^(Timeline, [^:]+|Myth answer|Citations?): /, ""));
  md.split("\n").forEach(line => {
    if (/^## /.test(line)) { const h = line.match(/^## (E\d+)\.|^## (Revisions after review)/); sec = h ? (h[1] || "REV") : null; return; }
    const m = line.match(/^\| (E(\d+)\.\d+)( \[J\])? \| (.*) \|\s*$/);
    if (!m || !sec || RG.sections.indexOf("E" + m[2]) < 0) return;
    const cells = m[4].split(" | ");
    if (sec === "REV") out[m[1]] = strip(cells[1]); else if (sec === "E" + m[2]) out[m[1]] = strip(cells[0]);
  });
  return out;
}
const RP = portfolio();
let APPROVED = APPROVED_SNAPSHOT;
if (RP) {
  const MD = fs.readFileSync(path.join(RP, "reports/learn/excerpts_for_approval.md"), "utf8");
  const reg = register(MD);
  ok(RG.used.every(k => reg[k] === APPROVED_SNAPSHOT[k]), "the approved-sentence snapshot in this test equals the register; differs at: " + RG.used.filter(k => reg[k] !== APPROVED_SNAPSHOT[k]).join(", "));
  ok(/E8\.1–E8\.10 and E8\.13–E8\.17; E8\.11–E8\.12 dropped/.test(MD) && /E9\.1–E9\.3 as drafted/.test(MD), "the register records E8 (without E8.11-E8.12) and E9 as approved");
  APPROVED = {}; Object.keys(reg).filter(k => k !== "E8.11" && k !== "E8.12").forEach(k => { APPROVED[k] = reg[k]; });
} else console.log("note: reports/learn/excerpts_for_approval.md not found (set LEARN_PORTFOLIO); research wording checked against the snapshot in this test");
const UNITS = Object.values(APPROVED).map(norm);
function approved(seg) {
  const s = norm(seg);
  return s.length > 0 && UNITS.some(u => {
    for (let i = u.indexOf(s); i >= 0; i = u.indexOf(s, i + 1)) {
      const pre = u.slice(0, i), post = u.slice(i + s.length);
      if ((i === 0 || /[:;.?!] $/.test(pre)) && (post === "" || /^[:;.]/.test(post) || (/^ /.test(post) && /[.;:?!]$/.test(s)))) return true;
    }
    return false;
  });
}
const listed = s => NOT_RESEARCH.some(r => r[0].test(norm(s)));
const sentencesOf = s => norm(s).split(/(?<=[.?!])\s+(?=[A-Z“"])/);
function offending(seg) {
  if (approved(seg) || listed(seg)) return null;
  return sentencesOf(seg).find(x => !approved(x) && !listed(x)) || null;
}
function elements(html) {
  return html.replace(/<!--[\s\S]*?-->/g, " ").replace(/^- (.*)$/gm, "<li>$1</li>").replace(/\[([^\]]+)\]\{[^}]*\}/g, "$1").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .split(/<\/?(?:p|li|ul|ol|dl|dt|dd|div|blockquote|footer|table|thead|tbody|tr|td|th|caption|details|summary|header|h[1-6]|section|nav|script|style)\b[^>]*>|```[^\n]*\n?/i)
    .map(norm).filter(s => s && !/^(:::|\{=html\})/.test(s) && /[A-Za-z]/.test(s));
}
const bad = [];
const strict = (where, list) => list.forEach(s => { const o = offending(s); if (o) bad.push(where + ": " + o); });
const signalled = (where, list) => list.forEach(s => { if (RX.test(s)) { const o = offending(s); if (o) bad.push(where + ": " + o); } });
let REST = OWN.replace(/<style>[\s\S]*?<\/style>/g, " ");
const REAL = (REST.match(/<div class="lx-card lx-real">[\s\S]*?\n<\/div>/) || [""])[0];
ok(REAL.length > 0, "page zone found: the Real-world box");
REST = REST.replace(REAL, " ");
strict("page, the Real-world box", elements(REAL));
const SRC = (REST.match(/<div class="lx-card lx-sources">[\s\S]*?<\/div>/) || [""])[0];
const TITLED = /^<li>Li et al\. \((\d{4})\)\. <a href="(https:\/\/doi\.org\/[^"]+)">([^<]+)<\/a>\./;
const SRC_LI = [...SRC.matchAll(/<li>[\s\S]*?<\/li>/g)].map(m => m[0]);
REST = REST.replace(SRC, " ");
signalled("page, sources", SRC_LI.filter(li => !TITLED.test(li)).map(norm));
signalled("page", elements(REST.replace(/^---[\s\S]*?\n---\n/, " ")));
const FM = (PAGE.match(/^---\n([\s\S]*?)\n---/) || [])[1] || "";
signalled("front matter", [...FM.matchAll(/^(title|subtitle|description): "(.*)"$/gm)].map(m => m[2]));
const PATHYML = fs.readFileSync(path.join(SITE, "learn/path.yml"), "utf8"), entry = (PATHYML.split(/\n- kind: /).find(e => new RegExp("\\n  id: " + ID + "\\n").test(e)) || "");
ok(entry.length > 0, "path.yml has the entry");
signalled("path.yml", [...entry.matchAll(/^  (title|subtitle|short|does|outcome): "(.*)"$/gm)].map(m => m[2]));
const strings = (o, k) => typeof o === "string" ? [[k, o]] : o && typeof o === "object" ? Object.keys(o).flatMap(j => strings(o[j], j)) : [];
signalled("data", strings(D).filter(x => ["about", "url", "built"].indexOf(x[0]) < 0).map(x => x[1]));
const literals = JS.replace(/\/\/[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ").match(/"(?:[^"\\\n]|\\.)*"/g) || [];
signalled("script", literals.map(l => l.slice(1, -1).replace(/\\"/g, '"')));
ok(bad.length === 0, "research wording: every sentence about the course author's work is approved:\n  " + bad.join("\n  "));
// the excerpts: each sentence approved; the blocks carry the approved source keys; E9 has no citation and no link
const quotes = [...PAGE.matchAll(/<blockquote class="lx-excerpt" data-source="([^"]+)">([\s\S]*?)<\/blockquote>/g)];
ok(quotes.length === 2 && quotes.map(q => q[1]).sort().join() === "excerpt:campus-resilience-question,excerpt:supply-chain-mg", "two excerpt blocks, keyed excerpt:campus-resilience-question and excerpt:supply-chain-mg");
const sents = quotes.flatMap(q => [...q[2].matchAll(/<p>([\s\S]*?)<\/p>/g)].map(x => norm(x[1])));
ok(sents.length === 4 && sents.every(s => UNITS.indexOf(s) >= 0), "four excerpt sentences, each a whole approved row (E9.1-E9.3, E8.2)");
const e9 = quotes.find(q => q[1] === "excerpt:campus-resilience-question");
ok(e9 && !/<footer|href=/.test(e9[2]), "the E9 excerpt has no citation and no link");
const E87 = APPROVED_SNAPSHOT["E8.7"].split(/(?<=\.) (?=Leaves out:)/);
ok(E87.length === 2 && norm(PAGE).indexOf(norm("<li>" + E87[0] + "</li><li>" + E87[1] + "</li>")) >= 0, "E8.7 sits under E8.2, word for word, as two lines (holds when; leaves out)");
// citations: titles as in inputs/publications.bib
if (RP) {
  const bib = fs.readFileSync(path.join(RP, "inputs/publications.bib"), "utf8");
  const titles = [...bib.matchAll(/^\s*title\s*=\s*\{(.*)\},?\s*$/gm)].map(m => m[1].replace(/[{}]/g, "").replace(/\\textbf/g, "").toLowerCase());
  const cites = SRC_LI.map(li => li.match(TITLED)).filter(Boolean);
  ok(cites.length === 1, "one Li et al. paper in the sources list");
  cites.forEach(c => ok(titles.indexOf(c[3].toLowerCase()) >= 0, "sources: '" + c[3].slice(0, 50) + "' is the title in publications.bib"));
}

// ---------------- text budget: every text element of the page's own prose stays short (one idea, about 35 words),
// the generated no-JS blocks and the facts table included (review F7 #12)
const prose = elements(OWN.replace(/<style>[\s\S]*?<\/style>/g, " ").replace(/<script[\s\S]*?<\/script>/g, " ").replace(/^---[\s\S]*?\n---\n/, " "));
prose.forEach(s => { const w = s.split(" ").length; ok(w <= 40 || approved(s), "text element of " + w + " words (40 at most unless one approved sentence): " + s.slice(0, 70)); });
// the step texts and their seen-lines, as the script writes them: no more than about 45 words each
const stepSrc = [...JS.matchAll(/\n      \{ text: ([\s\S]*?),\n        build:/g)].map(m => m[1]);
ok(stepSrc.length === 8, "eight step cards (" + stepSrc.length + ")");
stepSrc.forEach((src, i) => {
  const t = norm(Function("C", "V", "kw", "kwh", "nightKW", "totalKW", "return " + src)(C, V, M.kw, M.kwh, M.nightKW, M.totalKW));
  ok(t.split(" ").length <= 40, "step " + (i + 1) + " text: " + t.split(" ").length + " words (40 at most): " + t.slice(0, 60));
  ok(!/\d/.test(src.replace(/C\.[\w.]+|V\.[\w.]+|\d{2}:\d{2}/g, "")), "step " + (i + 1) + " text: every number comes from the data (no number typed into the script)");
});
Object.keys(D.texts).forEach(k => ok(norm(D.texts[k]).split(" ").length <= 40, "data text '" + k + "' stays short"));
D.parts.forEach(p => ok((p.name + " " + norm(p.note)).split(" ").length <= 30, "part note stays short: " + p.key));
D.sort.cards.forEach(c => ok(c.why.split(" ").length <= 25 && c.text.split(" ").length <= 25, "sort card stays short: " + c.id));

console.log((fails ? "FAILED " + fails + " of " : "ok: ") + checks + " checks (" + ID + ")");
process.exit(fails ? 1 : 0);
