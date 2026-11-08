// test_f08-large-loads.js — Node tests for lesson F8 (assets/learn/f08-large-loads.js, its data file and the page,
// learn/f08-large-loads.qmd):
//   - the days: 29 July and 17 April 2025 cut from town_days.json and scaled to 450 MW as lessons 0 and 2 do, checked
//     against town_year.json; the busiest and quietest hours are unique (no ties in the unrounded shapes)
//   - the model from first principles: the campus adds 240 MW to every hour; the day's share, the year's sorted hours,
//     the load factor with and without a flat load, hours above the record, homes as an annual-energy equivalent, the
//     ERCOT ratio, idle months, job-years and tax
//   - every reveal is true over its whole input range (the homes slider, the grid month, the jobs and tax sliders, every
//     prediction and guess); every number stated on the page (myths, questions, Go deeper, ideas, numbers to remember)
//     matches the model or the data file
//   - the no-JS block equals what the model writes (--write rewrites it)
//   - research wording (the sourcing rule): the real-world box quotes E7.4 and E7.5 of the approved excerpt wording,
//     word for word, with CF7's footer; no other sentence describes the study
//   - scope: data centers only as loads; no nuclear term anywhere in the page, the data, the script or
//     the sidecar; no "AI"; links on the allow-list; no project page, no Research page
//   - text budget of the step cards, the reveals and the page's own prose
// Usage (from the site folder):  node _tests/learn/test_f08-large-loads.js [--write]
"use strict";
const fs = require("fs");
const path = require("path");
const PRIV = require("./private_sources.js");
const ID = "f08-large-loads";
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const M = require(L(ID + ".js"));
const RAW = fs.readFileSync(L("data/" + ID + ".json"), "utf8");
const D = JSON.parse(RAW);
const JS = fs.readFileSync(L(ID + ".js"), "utf8");
const SIDE = fs.readFileSync(path.join(SITE, "learn/_w1/" + ID + ".yml"), "utf8");
const days = require(L("data/town_days.json")), year = require(L("data/town_year.json"));
const QPATH = path.join(SITE, "learn", ID + ".qmd");
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-9 : t);

// ---------------- the no-JS block: write (--write) or check
const BLOCKS = { "f08-fallback": () => M.staticFallback(D, days, year) };
function between(q, name) {
  const a = q.match(new RegExp("<!-- " + name + ":start[^>]*-->\\n")), b = q.indexOf("<!-- " + name + ":end -->");
  if (!a || b < a.index) throw new Error(name + " markers missing in " + QPATH);
  return { from: a.index + a[0].length, to: b };
}
if (process.argv.includes("--write")) {
  let q = fs.readFileSync(QPATH, "utf8");
  Object.keys(BLOCKS).forEach(k => { const r = between(q, k); q = q.slice(0, r.from) + BLOCKS[k]() + "\n" + q.slice(r.to); });
  fs.writeFileSync(QPATH, q);
  console.log("no-JS block written: " + Object.keys(BLOCKS).join(", "));
}
const PAGE = fs.readFileSync(QPATH, "utf8");
Object.keys(BLOCKS).forEach(k => { const r = between(PAGE, k); ok(PAGE.slice(r.from, r.to) === BLOCKS[k]() + "\n", k + " block is up to date (run with --write)"); });
const OWN = PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?<!-- learn:\1:end -->/g, "");
const text = s => s.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const T_PAGE = text(OWN);
const has = (s, msg) => ok(T_PAGE.indexOf(s) >= 0, msg + ": '" + s + "'");

// ---------------- the days, from first principles
const P = D.town.peakMW, draw = D.campus.drawMW, contract = D.campus.contractMW;
ok(P === 450 && draw === 240 && contract === 300 && near(draw / contract, 0.8), "the campus: 300 MW contract, steady 240 MW (80%); the town's record 450 MW");
// the named days equal the same local days of the year file (hour h = h:00 to h+1:00, Central daylight time, UTC-5)
function yearDay(date) {
  const t0 = Date.parse(year.start_utc + "Z"), d0 = Date.parse(date + "T00:00:00Z"), i = Math.round((d0 - t0) / 3600000) + 1 + 5;
  return year.demand.slice(i, i + 24);
}
ok(JSON.stringify(yearDay("2025-07-29")) === JSON.stringify(days.days.summer_peak.demand), "29 July 2025 in town_days equals the year file's day");
ok(JSON.stringify(yearDay("2025-04-17")) === JSON.stringify(days.days.windy_spring.demand), "17 April 2025 in town_days equals the year file's day");
ok(days.days.summer_peak.date === "2025-07-29" && days.days.windy_spring.date === "2025-04-17", "the day keys are the dates the page names");
const A = M.day(D, days, "summer"), B = M.day(D, days, "spring");
[A, B].forEach(s => {
  const sh = days.days[D.days[s.which].key].demand, mx = Math.max(...sh), mn = Math.min(...sh);
  ok(sh.filter(v => v === mx).length === 1 && sh.filter(v => v === mn).length === 1, s.label + ": the busiest and quietest hours are unique in the shape (no tie)");
  ok(s.mw.every((v, t) => v === Math.round(sh[t] / 1000 * P)) && s.tot.every((v, t) => v === s.mw[t] + draw), s.label + ": town in whole MW, the campus added to every hour");
  ok(s.newPeak === Math.max(...s.tot) && s.newMin === Math.min(...s.tot), s.label + ": a flat load moves the busiest and quietest hours by exactly its MW");
  ok(near(s.share, draw * 24 / (s.mw.reduce((a, b) => a + b, 0) + draw * 24)), s.label + ": share of the day = 240 x 24 / (town MWh + 240 x 24)");
});
ok(A.peak === 450 && A.peakHour === 16 && A.newPeak === 690 && A.atContract === 750 && A.min === 298 && A.newMin === 538, "29 July: 450 MW at 16:00, 690 with the campus, 750 at contract; quietest 298 -> 538 MW");
ok(B.peak === 300 && B.min === 216 && B.minHour === 3 && B.newMin === 456 && B.newPeak === 540, "17 April: 216 MW at 03:00 -> 456 MW; busiest 300 -> 540 MW");
ok(M.pct(A.share) === "39%" && M.pct(B.share) === "48%" && B.share > A.share, "the campus's share of the day: 39% on 29 July, 48% on 17 April");
ok(A.above === 24 && B.above === 24, "with the campus every hour of both days is above the 450 MW record");

// ---------------- the year
const Y = M.yearStats(D, year);
ok(Y.n === 8760 && near(Math.max(...Y.town), 450) && Y.sorted.every((v, i) => i === 0 || v <= Y.sorted[i - 1]), "8,760 hours, the busiest at 450 MW, sorted from highest to lowest");
ok(near(Y.lf, Y.avg / Y.peak) && near(Y.withLf, (Y.avg + draw) / (Y.peak + draw)) && Y.withLf > Y.lf, "load factor = average / peak; a flat load raises it");
ok(M.pct(Y.lf) === "63%" && M.pct(Y.withLf) === "76%" && Y.withLf.toFixed(3) === "0.756" && Y.avg.toFixed(1) === "281.9", "load factor 63% -> 76% (0.756 = (281.9 + 240) / (450 + 240))");
ok(Y.aboveTown === 0 && Y.above === 8690 && Y.above === Y.town.filter(v => v > P - draw).length, "hours above the record: 0 for the town, 8,690 of 8,760 with the campus");
ok(M.fmtN(Y.min) === "196" && M.fmtN(Y.withMin) === "436", "the year's quietest hour: 196 -> 436 MW");
ok(Y.campusMWh === 2102400 && M.pct(Y.share) === "85%", "the campus: 2,102,400 MWh a year, 85% of the town's own use");

// ---------------- homes: an annual-energy equivalent
const H240 = M.homes(240, 8760, D.home_year.value);
ok(near(H240, 240 * 8760 * 1000 / 10791) && M.roundK(H240) === 195000, "240 MW all year = 2,102,400 MWh / 10.791 MWh = 194,829 -> about 195,000 homes");
ok(M.nearestTick(D.homes.ticks, H240) === 2 && D.homes.ticks[2] === 200000, "the guess's right mark is 200,000 (nearest on the tenfold scale)");
for (let v = D.homes.drawMW.min; v <= D.homes.drawMW.max; v += D.homes.drawMW.step) {
  const line = M.homesLine(D, Y, v), h = M.homes(v, 8760, 10791);
  ok(line.indexOf("about **" + M.fmtN(M.roundK(h)) + "**") >= 0 && line.indexOf(M.pct(v * 8760 / Y.energy) + " of what Prairie Town uses") >= 0, "homes line true at " + v + " MW");
  const ch = M.homesChain(D, Y, v);
  ok(ch[2].v === M.fmtN(v * 8760) + " MWh" && ch[4].v === "about " + M.fmtN(M.roundK(h)), "homes chain true at " + v + " MW");
}
ok(/not the power in any one hour/.test(M.HOMES_NOTE), "the homes figure is labelled an annual-energy equivalent, not a peak one");

// ---------------- requests, the wait, jobs, tax
ok(M.ratio(D).toFixed(1) === "5.2" && D.ercot.peakMW === 91134 && D.ercot.requestsGW === 474 && D.ercot.dcShare === 0.9, "ERCOT: 474 GW / 91.134 GW = 5.2; about 90% data centers");
ok(M.ERCOT_TICKS[3] === "5 times" && /= \*\*5\.2 times\*\*/.test(M.ercotLine(D)) && /Requests are proposals, not committed demand: projects may change or be cancelled\./.test(M.ercotLine(D)), "the ERCOT reveal: 5.2 times; requests are proposals, not committed demand");
ok(!/duplicates|never be built/.test(PAGE + JS), "no claim that requests are duplicates or will never be built (the ERCOT slide does not show it)");
for (let g = D.wait.grid.min; g <= D.wait.grid.max; g += D.wait.grid.step) {
  const i = M.idle(D, g), line = M.waitLine(D, g);
  ok(i === Math.max(0, g - 24), "idle months at " + g + ": " + i);
  ok(i > 0 ? line.indexOf("waits " + i + " more") >= 0 : g < 24 ? line.indexOf((24 - g) + " months before") >= 0 : /no idle months/.test(line), "wait line true at " + g + " months");
}
ok(M.idle(D, 36) === 12, "the default: built in 24 months, connected after 36: 12 idle months");
for (let c = D.jobs.crew.min; c <= D.jobs.crew.max; c += D.jobs.crew.step) for (let s = D.jobs.staff.min; s <= D.jobs.staff.max; s += D.jobs.staff.step) {
  const line = M.jobsLine(D, c, s);
  if (!(line.indexOf("**" + M.fmtN(c * 2) + " [[job-year|job-years]]**") >= 0 && line.indexOf(M.fmtN(s) + " permanent jobs") >= 0)) ok(false, "jobs line at " + c + " workers, " + s + " staff");
}
ok(M.jobYears(D, 1000) === 2000, "1,000 workers for 24 months = 2,000 job-years");
for (let v = D.tax.value.min; v <= D.tax.value.max; v += D.tax.value.step) for (let r = 5; r <= 25; r++) {
  const rate = r / 10, t = M.taxM(v, rate);
  if (!(near(t, Math.round(v * rate) / 100) && near(t, v * rate / 100, 0.006) && M.taxLine(D, v, rate).indexOf("$" + M.fmtN(t, 1) + "M a year") >= 0)) ok(false, "tax at $" + v + "M and " + rate + "%");
}
ok(M.taxM(1000, 1.0) === 10 && M.taxM(800, 1.5) === 12, "tax: $1,000M at 1% = $10M; $800M at 1.5% = $12M");
ok(/transfer/.test(M.taxLine(D, 1000, 1)) && /not new wealth/.test(M.taxLine(D, 1000, 1)), "tax is called a transfer");
// every prediction gets a true answer
ok(M.WHEN.options.every(o => M.WHEN.feedback[o.value]) && M.WHEN.answer === "flat", "step 1: feedback for every choice; the campus is flat by assumption");
ok(Object.values(M.WHEN.feedback).every(t => !/\b(so it adds as much|it adds about the same)\b/.test(t)) && M.whenAssume(D) === "Assumed in this lesson: a steady 240 MW in every hour. Real campuses vary with their computing work and with cooling.",
  "step 1: running around the clock is not made to imply a constant draw; the steady 240 MW is stated as an assumption, with real variation");
ok(/pr\.reveal\(\); as\.textContent = whenAssume\(D\)/.test(JS) && /\["At its full " \+ D\.campus\.contractMW \+ " MW contract", s\.atContract \+ " MW", "warn"\]/.test(JS), "step 1: normal and maximum power in labelled readouts; the assumption in its own line");
ok(M.PAY.options.every(o => M.PAY.feedback[o.value]) && M.PAY.answer === "others" && /can land on/.test(M.PAY.feedback.others), "step 8: feedback for every choice; 'can land on', under the stated assumption");
ok(/Assume regulators let the utility recover such costs from customers/.test(JS), "step 8 states the recovery assumption");
ok(A.newPeak === 690 && A.atContract === 750, "step 1 readouts: 690 MW with the campus, 750 MW at the full contract");
ok(M.dayLine(D, B) === "17 April 2025: the campus is **48%** of the day's electricity. The quietest hour goes from 216 to 456 MW, above the town's 2025 record of 450 MW.", "step 2 line, 17 April");
ok(M.dayLine(D, A).indexOf("from 298 to 538 MW, above") >= 0, "step 2 line, 29 July");
ok(M.yearSaw(D, Y) === "With the campus, demand is above the town's old record in **8,690 of 8,760** hours. The quietest hour rises from 196 to 436 MW, and the [[load-factor|load factor]] from 63% to 76%.", "step 4 line = the model");

// ---------------- numbers on the page
has("adds 240 MW in every hour, so the town's busiest hour on 29 July 2025 rises from 450 to 690 MW", "myth 1");
has("about 474 GW in June 2026, 5.2 times its record peak", "myth 2");
has("That is 2,000 job-years", "myth 3");
has("120 MW × 8,760 h = 1,051,200 MWh, ÷ 10.791 MWh a home = 97,415", "question 1"); ok(Math.round(M.homes(120, 8760, 10791)) === 97415 && 120 * 8760 === 1051200, "question 1 arithmetic");
has("216 + 240 = 456 MW", "question 2"); has("At 03:00 on 17 April 2025, Prairie Town draws 216 MW", "question 2: the hour");
has("474,000 ÷ 91,134 = 5.2", "question 3");
has("$12M: 800 × 1.5% = 12", "question 4");
has("here, a steady 240 MW against Prairie Town's busiest hour of 450 MW", "ideas: sizes");
has("240 MW all year is as much electricity as about 195,000 average U.S. homes buy in a year", "ideas: homes");
has("ERCOT's requests to connect were 5.2 times its record peak in 2026", "ideas: requests");
has("200 MW of computers at a PUE of 1.2 need 200 × 1.2 = 240 MW from the grid", "Go deeper: PUE example");
has("ERCOT's 474 GW of requests is 5.2 times its record peak of 91,134 MW", "Go deeper: requests");
has("325 to 580 TWh in 2028, 6.7% to 12% of U.S. electricity", "Go deeper: Berkeley Lab range");
ok(/\\frac\{281\.9 \+ 240\}\{450 \+ 240\} = 0\.756/.test(PAGE), "Go deeper: load factor formula with the model's numbers");
ok(D.doe.twh2023 === 176 && D.doe.share2023 === 4.4 && D.doe.twh2028.join() === "325,580" && D.doe.share2028.join() === "6.7,12", "DOE numbers in the data file");
D.facts.forEach(fc => {
  const row = PAGE.indexOf('<td class="n">' + fc.n + "</td><td>" + fc.what + "</td>");
  ok(row >= 0, "numbers to remember: '" + fc.n + "' row matches the data file");
  const cell = row >= 0 ? PAGE.slice(row, row + 900) : "";
  ok(cell.indexOf(fc.url.replace(/&/g, "&amp;")) >= 0 && cell.indexOf(fc.asof) >= 0 && cell.indexOf(fc.source) >= 0, "numbers to remember: '" + fc.n + "' carries its source and date");
});
ok(D.facts[4].n === M.fmtN(D.home_year.value) + " kWh", "the homes fact = the benchmark the model uses");
ok(D.home_year.value === 10791 && /2022/.test(D.home_year.as_of), "EIA's 2022 average home (10,791 kWh), as lesson 1 uses");
{ const L1 = require(L("data/01-power-energy.json")); const hy = JSON.stringify(L1).match(/"home_year":\{"value":(\d+)/); ok(hy && +hy[1] === D.home_year.value, "the same benchmark as lesson 1"); }

// ---------------- wording details
ok(D.cooling.map(c => c.name).join() === "Evaporative heat rejection,Dry, air-cooled heat rejection" && /little operational water on site/.test(M.coolLine(D.cooling[1])) && /depending on the weather and the design/.test(M.coolLine(D.cooling[1])) && !/closed-loop cooling/i.test(PAGE + RAW + JS),
  "cooling compares evaporative with dry heat rejection; a closed loop is not called low-water");
ok(/closed water loop inside the building can still send its heat out through an evaporative cooling tower/.test(M.WATER_HINTS[1]) && D.coolingSource.url === "https://www.energy.gov/cmei/femp/cooling-water-efficiency-opportunities-federal-data-centers" && OWN.indexOf(D.coolingSource.url) >= 0, "cooling: the DOE source is in the data file and the sources list");
ok(/\{ key: "local", name: "Local government", cells: \{ dec: \{ v: "yes"[^}]*\}, pay: \{ v: "part", t: "possibly: roads, water and services the campus needs" \}, ben: \{ v: "part", t: "tax receipts; the net gain depends on local costs" \}/.test(JS), "stakeholders: local government may pay for services; the net gain depends on local costs");
ok(/title: "Check supply and wires", text: "Planners check whether existing supply and wires can serve the added load; upgrades may be needed\."/.test(JS) && !/More plants and wires/.test(JS), "the causal chain checks supply and wires rather than asserting new plants");
ok(/label: "What-if: the campus's average draw"/.test(JS) && M.HOMES_WHATIF === "A what-if for this step only: the next steps keep the campus at its steady 240 MW.", "the homes slider is labelled a what-if, and the later steps' 240 MW is said");
ok(!/homes' yearly use|homes use as much|homes' yearly electricity|yearly electricity use/.test(PAGE + JS) && /homes' yearly purchases/.test(JS) && /homes buy as much electricity in a year/.test(JS) && /each buying 10,791 kWh a year\) buy as much electricity in a year/.test(PAGE), "homes: always electricity bought (EIA counts purchases)");
ok(!/screening/i.test(PAGE + RAW + JS.replace(/\/\/[^\n]*/g, "")) && /\$M means millions of dollars/.test(M.TAX_NOTE), "rough estimates, not 'screening'; $M explained");
ok(/cost the developer on the order of \$0\.7 billion in <span class="lx-term" data-term="present-value">present value<\/span>\./.test(PAGE), "present value is a glossary term inside the excerpt (wording unchanged)");
ok(!/Go deeper · Modeler/.test(PAGE) && (PAGE.match(/Go deeper · Analyst/g) || []).length === 3, "a Foundations lesson's deeper boxes are Analyst tier (one tier up, a preview only)");

// ---------------- research wording: E7.4 and E7.5, word for word (the sourcing rule)
const E74 = "In the study's illustrative base case, a 36-month delay for a 300 MW-IT facility cost the developer on the order of $0.7 billion in present value.";
const E75 = "Staged energization can recover a large share of that cost.";
const CF7_FOOT = "From: Li et al. (2026), accepted paper, 2026 North American Power Symposium (NAPS); DOI pending.";
const CITE = "<li>Li et al. (2026). Accepted paper on the cost of delayed energization for large loads, 2026 North American Power Symposium (NAPS), presented October 2026; DOI pending.</li>";
const RP = PRIV.path("excerpts");
if (RP) {
  const reg = fs.readFileSync(RP, "utf8"), rev = reg.slice(reg.indexOf("## Revisions after review"));
  [["E7.4", E74], ["E7.5", E75]].forEach(([id, s]) => {
    const row = reg.split("\n").find(l => l.indexOf("| " + id + " |") === 0);
    ok(row && row.split(" | ")[1] === s, id + " in the approved wording is the sentence this test checks");
    ok(rev.indexOf("| " + id + " |") < 0, id + " has no revision after review");
  });
  const r14 = reg.split("\n").find(l => l.indexOf("| E7.14 |") === 0);
  ok(r14 && "<li>" + r14.split(" | ")[1].replace(/^Citation: /, "") + "</li>" === CITE, "the citation is E7.14, word for word");
} else console.log("note: the approved excerpt wording is not available (set LEARN_SOURCES); E7.4 and E7.5 checked against this test's copy");
{
  const real = (OWN.match(/<div class="lx-card lx-real">([\s\S]*?)<\/div>/) || ["", ""])[1];
  const bq = [...OWN.matchAll(/<blockquote class="lx-excerpt" data-source="([^"]+)">([\s\S]*?)<footer>([\s\S]*?)<\/footer><\/blockquote>/g)];
  ok(bq.length === 1 && bq[0][1] === "excerpt:code" && real.indexOf(bq[0][0]) >= 0, "one excerpt, excerpt:code, in the real-world box");
  const sents = bq.length ? [...bq[0][2].matchAll(/<p>([\s\S]*?)<\/p>/g)].map(m => m[1].replace(/<[^>]+>/g, "").trim()) : [];
  ok(sents.length === 2 && sents[0] === E74 && sents[1] === E75, "the excerpt is E7.4 then E7.5, word for word");
  ok(bq.length === 1 && bq[0][3] === CF7_FOOT, "the excerpt's footer is CF7's citation");
  ok(/<a href="cf7-cost-of-waiting\.html">CF7<\/a>/.test(real), "the real-world box links case file CF7");
  const rest = OWN.replace(/<blockquote[\s\S]*?<\/blockquote>/g, " ").replace(CITE, " ");
  ok(!/\bNAPS\b|Li et al|course author|my (study|research)|\bour (study|research)|\bthe study\b|\bthe paper\b/i.test(text(rest) + " " + RAW + " " + JS + " " + SIDE.replace(/^#.*$/gm, "")), "no wording about the study outside the excerpt and its citation");
  ok(OWN.indexOf(CITE) >= 0, "the sources list cites E7.14");
}

// ---------------- scope: data centers as loads only; approved research wording only
const ALL = PAGE + "\n" + RAW + "\n" + JS + "\n" + SIDE;
ok(!/nuclear|reactor|\bSMR\b|small modular|fission|uranium/i.test(ALL), "no nuclear term on the page, in the data, the script or the sidecar");
ok(!/\bAI\b|artificial intelligence/.test(ALL), "no 'AI'");
const PROSE_ALL = T_PAGE + " " + RAW + " " + JS.replace(/\/\/[^\n]*/g, "") + " " + SIDE;
ok(!/data[- ]cent\w*[^.]{0,80}\b(supply|supplies|supplied|power plant|builds? (a|its own) (plant|generat)|generat\w*|buyer|order)/i.test(PROSE_ALL), "data centers appear as loads only (never as buyers or builders of supply)");
ok(!/gas[- ]turbine|backlog|co-locat/i.test(PROSE_ALL), "no gas-turbine supply, backlog or co-location talk");
const hrefs = [...OWN.matchAll(/href="([^"]+)"/g)].map(m => m[1].replace(/&amp;/g, "&"));
const okHref = h => /^https:\/\/(www\.eia\.gov|www\.energy\.gov|www\.ercot\.com|insidelines\.pjm\.com)\//.test(h) || /^[0-9a-z-]+\.html(#[a-z-]+)?$/.test(h) || /^#/.test(h);
ok(hrefs.every(okHref), "links: EIA, DOE, ERCOT, PJM and learn pages only (" + hrefs.filter(h => !okHref(h)).join(", ") + ")");
ok(!/projects\/|research\.html/.test(PAGE + JS), "no project page and no Research page");
ok(/LX\.lessonRefHTML\(P, "A6"\)/.test(JS) && !/\[\[lesson:a06|\[\[lesson:a17/.test(JS), "A6 is named through lessonRefHTML (it may still be upcoming)");
ok(/\[\[lesson:a04-retail-tariffs\|A4\]\]/.test(JS), "the live A4 is linked with a lesson mark");
{ const dl = OWN.match(/<div class="lx-datanote[\s\S]*?<\/div>/); ok(dl && /Illustrative\./.test(dl[0]) && /EIA-930/.test(dl[0]), "the data note says what is illustrative and what is real"); }

// ---------------- text budget
const plain = t => String(t).replace(/<[^>]+>/g, " ").replace(/\$\$[\s\S]*?\$\$/g, " ").replace(/\$[^$\n]+\$/g, "x").replace(/\[\[[^|\]]+\|([^\]]+)\]\]/g, "$1").replace(/\*\*/g, "").replace(/&amp;/g, "&").trim();
const nWords = t => plain(t).split(/\s+/).filter(w => /[A-Za-z0-9$]/.test(w)).length;
const nSent = t => plain(t).replace(/U\.S\./g, "US").split(/(?<=[.?!])\s+(?=[A-Z“$0-9])/).filter(x => /[A-Za-z]/.test(x)).length;
const stepTexts = [...JS.matchAll(/\{ text: "((?:[^"\\]|\\.)*)",\n\s*build/g)].map(m => m[1].replace(/\\"/g, '"'));
ok(stepTexts.length === 8, "eight step cards (" + stepTexts.length + ")");
stepTexts.forEach((t, i) => { const n = nWords(t); ok(n >= 18 && n <= 36, "step " + (i + 1) + ": " + n + " words (about 35)"); ok(nSent(t) <= 3, "step " + (i + 1) + ": " + nSent(t) + " sentences"); });
// every reveal, hint and feedback the page shows, as the reader sees it: one or two sentences, about 35 words
const lines = [M.whenAssume(D), M.dayLine(D, A), M.dayLine(D, B), M.daysSaw(D, A, B), M.yearSaw(D, Y), M.ercotLine(D), M.HOMES_NOTE + " Homes figure: EIA's average U.S. home buys 10,791 kWh a year (2022).", M.HOMES_WHATIF, M.TAX_NOTE, M.PAY.extra, M.SAW7]
  .concat(M.WATER_HINTS, D.cooling.map(M.coolLine))
  .concat([12, 18, 24, 30, 36, 42, 48, 60].map(g => M.waitLine(D, g)), [60, 90, 120, 150, 180, 210, 240, 270, 300].map(v => M.homesLine(D, Y, v)), [M.jobsLine(D, 2000, 200), M.jobsLine(D, 200, 20), M.taxLine(D, 2000, 2.5), M.taxLine(D, 200, 0.5)]);
lines.forEach(t => { ok(nWords(t) <= 36, "a reveal of " + nWords(t) + " words: " + plain(t).slice(0, 60)); ok(nSent(t) <= 2, "a reveal of " + nSent(t) + " sentences: " + plain(t).slice(0, 60)); });
// LX.Predict composes its verdict ("You called it." or "Not quite.") with the feedback: the whole element is checked
[[M.WHEN, "WHEN"], [M.PAY, "PAY"]].forEach(([P, k]) => P.options.forEach(o => {
  const t = (o.value === P.answer ? "You called it. " : "Not quite. ") + P.feedback[o.value];
  ok(nWords(t) <= 35 && nSent(t) <= 2, k + " feedback as shown for '" + o.value + "': " + nWords(t) + " words, " + nSent(t) + " sentences");
}));
ok(/pr\.reveal\(\);/.test(JS) && !/pr\.reveal\([^)]/.test(JS), "the predictions' reveals add no extra sentence (the extra lines sit in their own elements)");
const PROSE = OWN.replace(/^---[\s\S]*?\n---\n/, " ").replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ")
  .replace(/<!--[\s\S]*?-->/g, " ").replace(/<blockquote[\s\S]*?<\/blockquote>/g, " ").replace(/^- (.*)$/gm, "<li>$1</li>").replace(/^\|(.*)\|$/gm, "<td>$1</td>");
PROSE.split(/<\/?(?:p|li|dd|dt|td|th|summary|br|caption)\b[^>]*>/).map(plain).filter(x => /[A-Za-z]/.test(x) && !/^[:{]/.test(x)).forEach(x => {
  const n = nWords(x); ok(n <= 40, "text element of " + n + " words: " + x.slice(0, 70)); ok(nSent(x) <= 3, "text element of " + nSent(x) + " sentences: " + x.slice(0, 70)); });

// ---------------- the page's controls
ok(!Object.values(M.WHEN.feedback).concat(Object.values(M.PAY.feedback), [M.PAY.extra, M.whenAssume(D)]).some(t => /\*\*/.test(t)), "Predict reveals and their extra lines carry no **bold** marks");
ok(/aria-live/.test(JS) && /LX\.store\.(get|set)\("f08"/.test(JS), "live regions; the reader's settings persist in this browser");
ok((JS.match(/LX\.demo\(/g) || []).length === 1 && /"mid"/.test(JS) && (JS.match(/demo\[\d\] = function/g) || []).length === 8, "a demo hook: mid and an action for each of the eight steps");
ok(/id: data-center/.test(SIDE) && /id: large-load/.test(SIDE) && /id: job-year/.test(SIDE) && /id: transfer/.test(SIDE) && /id: power-usage-effectiveness/.test(SIDE), "the sidecar defines the lesson's new terms");
ok(!/id: (interconnection-queue|cluster-study|network-upgrade|withdrawal|hosting-capacity|power-factor|apparent-power|thermal-limit)\b/.test(SIDE), "no term owned by A6 or A17");

console.log((fails ? "FAILED " + fails + " of " : "ok: ") + checks + " checks (" + ID + ")");
process.exit(fails ? 1 : 0);
