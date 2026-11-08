// test_k01-units.js — Node tests for toolbox K1 (assets/learn/k01-units.js): the day agrees with lesson 0's prepare(), the
// anchors agree with lesson 1's model (assets/learn/01-power-energy.js world()), the prefix and powers-of-ten helpers behave
// on edge cases, the drill's answers are right, and every number the page states matches the model (a whitelist scan of the
// page's visible text, plus the statements one by one). The no-JS table must equal staticTable().
// Usage (from the site folder):  node _tests/learn/test_k01-units.js [--write]   (--write rewrites the no-JS table)
"use strict";
const fs = require("fs");
const path = require("path");
const SITE = path.resolve(__dirname, "..", "..");
const K = require(path.join(SITE, "assets/learn/k01-units.js"));
const G0 = require(path.join(SITE, "assets/learn/grid-operator.js"));
const L1 = require(path.join(SITE, "assets/learn/01-power-energy.js"));
const J = f => JSON.parse(fs.readFileSync(path.join(SITE, "assets/learn/data", f), "utf8"));
const town = J("town.json"), year = J("town_year.json"), days = J("town_days.json"), D1 = J("01-power-energy.json");
const QPATH = path.join(SITE, "learn/k01-units.qmd");
const s = K.story(town, year, days, D1), T = K.staticTable(s);
const START = /<!-- k1-table:start[^>]*-->\n/, END = "<!-- k1-table:end -->";
if (process.argv.includes("--write")) {
  let q = fs.readFileSync(QPATH, "utf8"); const a = q.match(START), b = q.indexOf(END);
  if (!a || b < a.index) throw new Error("k1-table markers missing");
  q = q.slice(0, a.index + a[0].length) + T + "\n" + q.slice(b);
  fs.writeFileSync(QPATH, q); console.log("no-JS table written");
}
const QMD = fs.readFileSync(QPATH, "utf8");
const JS = fs.readFileSync(path.join(SITE, "assets/learn/k01-units.js"), "utf8");

let checks = 0, fails = 0;
function ok(cond, msg) { checks++; if (!cond) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 1e-9 : tol);
const has = (str, msg) => ok(QMD.indexOf(str) >= 0, "page states " + (msg || "") + ": " + JSON.stringify(str));
const num = K.num;

// ---------------- data: lesson 0's day, lesson 1's anchors
{
  const W = G0.prepare(town, year, "lesson0"), D = s.D;
  ["demand", "need"].forEach(k => ok(D[k].join() === W[k].join(), `data: ${k} equals lesson 0's prepare()`));
  ok(D.dateLabel === "3 September 2025" && s.peak === 450 && town.scenarios.lesson0.demandPeakMW === 450, "data: 3 September 2025, the town's demand scaled to 450 MW in its busiest hour of 2025");
  // 450 MW is the scale: the busiest hour of the scaled shape, before lesson 0 rounds a day's hours (by at most step / 2)
  // so that its gas need is a multiple of the step; the page calls it the hour the demand is scaled to, never a rounded day's peak
  ok(Math.max.apply(null, year.demand) / 1000 * s.peak === 450, "data: the scaled 2025 shape peaks at exactly 450 MW");
  { const sc = town.scenarios.lesson0; let worst = 0;
    const t0 = Date.parse(year.start_utc + "Z"), d0 = Date.parse(sc.date + "T00:00:00Z"), i = Math.round((d0 - t0) / 3600000) + 1 - (sc.utcOffsetHours || 0);
    D.demand.forEach((v, t) => { worst = Math.max(worst, Math.abs(v - year.demand[i + t] / 1000 * sc.demandPeakMW)); });
    ok(worst <= sc.step / 2 + 1e-9, `data: the day's rounding moves an hour by at most ${sc.step / 2} MW (${worst.toFixed(2)})`); }
  ok(/Prairie Town's demand is scaled so its busiest hour of 2025 is " \+ s\.peak/.test(JS) && !/Write Prairie Town's busiest hour of 2025/.test(JS), "step 1: 450 MW is named as the scale, not as a rounded hour");
  ok(s.dayMWh === 6957 && s.gasMWh === 1965 && s.gasCost === 40 && s.gasDollars === 78600, "data: the day 6,957 MWh, gas need 1,965 MWh at a flat $40 = $78,600 (as K7)");
  // $78,600 is a flat-price product, not a schedule: lesson 0's cheapest-first day (ramp limits, curtailment, the peaker) differs
  const EX = G0.expert(W).totals, schedGas = EX.cc * town.fleet.cc.cost + EX.pk * town.fleet.peaker.cost;
  ok(EX.cc === 1960 && EX.pk === 20 && s.pkCost === 100 && schedGas === 80400 && schedGas !== s.gasDollars, `data: lesson 0's schedule runs gas CC ${EX.cc} MWh and the peaker ${EX.pk} MWh: $${schedGas}, not the flat $${s.gasDollars}`);
  has("<b>Not a schedule.</b> $78,600 prices all 1,965 MWh of gas at one flat $40/MWh. Lesson 0's schedule, held to ramp limits, runs 1,960 MWh at $40/MWh and 20 MWh on a $100/MWh peak plant: $80,400.", "the flat price is labelled, with lesson 0's schedule and both of its quantities");
  ok(EX.cc * 40 + EX.pk * 100 === 80400, "data note: 1,960 MWh × $40 + 20 MWh × $100 = $80,400");
  ok(/note: "the day's gas need, all at one flat price"/.test(JS) && !/at its running cost/.test(JS), "step 3: the $ row says it is a flat price, not the day's running cost");
  ok(s.hiMW === 353 && s.loMW === 235 && s.hiAt === 16 && s.loAt === 3 && s.need19 === 145 && s.ramp === 40, "data: highest hour 353 MW (16:00), lowest 235 MW (03:00), gas at 19:00 145 MW, ramp 40 MW/h");
  const Wd = L1.world(D1, town, year, days);
  ok(Wd.wh.phone === s.byId.phone.wh && Wd.wh.homeyear === s.byId.home.wh && Wd.wh.spp === s.byId.spp.wh && Wd.wh.us === s.byId.us.wh, "data: the phone, home, SPP and U.S. anchors equal lesson 1's world()");
  ok(Math.abs(Wd.wh.town / 1e6 - s.dayMWh) < 1, `data: lesson 1's unrounded day (${Wd.wh.town / 1e6} MWh) is within 1 MWh of lesson 0's rounded ${s.dayMWh}`);
  ok(D1.anchors.phone_charge.value === 0.019 && D1.anchors.home_year.value === 10791 && D1.anchors.us_year.value === 4.2e12 && days.stats.annual_demand_TWh === 298.6, "data: 0.019 kWh, 10,791 kWh, 4.2 trillion kWh, 298.6 TWh");
  ok(/data-src="\.\.\/assets\/learn\/data\/town\.json \.\.\/assets\/learn\/data\/town_year\.json \.\.\/assets\/learn\/data\/town_days\.json \.\.\/assets\/learn\/data\/01-power-energy\.json"/.test(QMD) && /data\["01_power_energy"\]/.test(JS) && /data\.town_days/.test(JS), "data: the page reads the four data files");
}

// ---------------- helpers: prefixes, scientific notation, ratios, parsing
{
  ok(K.convert(450, 6, 3) === 450000 && K.convert(450, 6, 9) === 0.45 && K.convert(6957, 6, 9) === 6.957 && K.convert(298.6, 12, 9) === 298600 && K.convert(0.8, 9, 3) === 800000, "convert: prefix steps");
  let bad = 0;
  for (let e = -3; e <= 16; e++) for (const m of [1, 1.08, 2.5, 4.2, 6.957, 9.99, 9.999999]) {
    const x = m * Math.pow(10, e), n = K.expOf(x), a = K.mant(x);
    if (n !== e || a < 1 - 1e-9 || a >= 10 || !near(a, m, 1e-9)) bad++;
  }
  ok(bad === 0, `scientific: exponent and leading number right on 140 cases (${bad} bad)`);
  ok(K.expOf(1000) === 3 && K.expOf(19) === 1 && K.expOf(0.019) === -2 && K.expOf(1e15) === 15 && K.expOf(4.2e15) === 15, "scientific: exact powers of ten and the anchors");
  ok(K.sci(19) === "1.9 × 10¹" && K.sci(6957e6) === "6.96 × 10⁹" && K.sci(4.2e15) === "4.2 × 10¹⁵" && K.sci(298.6e12) === "2.99 × 10¹⁴" && K.sup(-12) === "⁻¹²", "scientific: formatting");
  ok(K.powersApart(19, 4.2e15) === 14 && K.powersApart(4.2e15, 19) === 14 && K.powersApart(10791e3, 6957e6) === 3 && K.powersApart(5, 5) === 0, "ratio: powers apart, either order");
  ok(K.parseNum("450,000") === 450000 && K.parseNum("0.45") === 0.45 && K.parseNum("6.96e9") === 6.96e9 && near(K.parseNum("6.96 × 10^9"), 6.96e9, 1) && near(K.parseNum("6.96x10^9"), 6.96e9, 1) && K.parseNum("−3") === -3 && K.parseNum("$78,600") === 78600 && K.parseNum("abc") === null, "parse: commas, decimals, e-notation, × 10^n, minus sign, dollars");
  ok(K.close(0.45, 0.45) && !K.close(0.46, 0.45) && K.close(6.96, 6.957, 0.006) && !K.close(6.95, 6.957, 0.006) && !K.close(7, 6.957, 0.006) && !K.close(null, 1), "close: tolerances of the inputs");
  ok(K.plain(450e6) === "450,000,000" && K.plain(0.00045) === "0.00045" && K.plain(6.957) === "6.957" && K.plain(0.045) === "0.045", "plain: number formats");
}

// ---------------- the story numbers
{
  ok(s.peakKW === 450000 && s.peakGW === 0.45 && s.peakW === 450e6 && s.peakTW === 0.00045, "story: 450 MW = 450,000 kW = 0.45 GW");
  ok(s.dayGWh === 6.957 && K.sig(s.dayGWh, 3) === "6.96" && near(s.avgMW, 289.875) && num(s.avgMW, 1) === "289.9" && Math.round(s.avgMW) === 290, "story: 6.957 GWh; average 289.9 MW");
  ok(s.loBound === 5640 && s.hiBound === 8472 && s.loBound <= s.dayMWh && s.dayMWh <= s.hiBound, "story: bounds 5,640 ≤ 6,957 ≤ 8,472 MWh");
  ok(s.claims.map(c => c.text + ":" + c.ok + ":" + c.off).join("|") === "6,957 GWh:false:3|about 70 MWh:false:-2|about 7 GWh:true:0", "story: the step-5 claims and how far off: " + s.claims.map(c => c.text + ":" + c.ok + ":" + c.off).join("|"));
  ok(s.items.map(i => i.sci).join("|") === "1.9 × 10¹ Wh|1.08 × 10⁷ Wh|6.96 × 10⁹ Wh|2.99 × 10¹⁴ Wh|4.2 × 10¹⁵ Wh", "story: the five amounts in scientific notation");
  ok(s.span === 14 && K.sci(s.spanRatio, 2) === "2.2 × 10¹⁴" && s.byId.us.exp - s.byId.phone.exp === 14, "story: a phone charge to the U.S. year: 14 powers of ten, ratio 2.2 × 10¹⁴ (lesson 1: 220 trillion)");
  ok(s.sppGWh === 298600 && s.homeToSpp === 7 && K.sci(s.homeToSppRatio, 2) === "2.8 × 10⁷" && (s.byId.spp.mant / s.byId.home.mant).toFixed(1) === "2.8", "story: the quiz, 298,600 GWh and 7 powers of ten");
  const P = K.pairText(s, "town", "home");
  ok(P.ratioText === "645" && P.apart === 3 && P.dexp === 2 && P.big.id === "town", "story: the explain layer's default pair: (6.96 ÷ 1.08) × 10² = 645, nearest power 10³");
  ok(K.pairText(s, "us", "us") === null && K.pairText(s, "phone", "us").apart === 14, "story: pairs of one item are refused; order does not matter");
  // every pair: the ratio formula holds
  s.items.forEach(a => s.items.forEach(b => { if (a.id !== b.id) { const p = K.pairText(s, a.id, b.id); ok(near(p.mratio * Math.pow(10, p.dexp), p.ratio, p.ratio * 1e-12) && p.ratio >= 1, `pair ${a.id}/${b.id}: (a1/a2) × 10^(n1−n2) = ratio`); } }));
}

// ---------------- the page: statements one by one
{
  has("Prairie Town's demand is scaled so its busiest hour of 2025 is 450 MW, which is 450,000 kW or 0.45 GW");
  has("on 3 September 2025 the town's 24 hourly values add up to 6,957 MWh, or 6.957 GWh");
  has("at a flat $40/MWh, 1,965 MWh × $40/MWh = $78,600; and 6,957 MWh ÷ 24 h ≈ 289.9 MW, the day's average power");
  has("Scientific notation writes a number as a × 10ⁿ, with a at least 1 and less than 10: 1,000 = 10³, and the day's 6,957,000,000 Wh ≈ 6.96 × 10⁹ Wh");
  has("Units and powers of ten, in six moves");
  has("a phone charge (1.9 × 10¹) and the U.S. year (4.2 × 10¹⁵) are 14 powers of ten apart");
  has("The day lies between 235 MW × 24 h = 5,640 MWh and 353 MW × 24 h = 8,472 MWh, so a report of 6,957 GWh has a slipped prefix");
  has("A number at least 1 and less than 10, times a power of ten: the town's day is about 6.96 × 10⁹ Wh");
  const SIDE = fs.readFileSync(path.join(SITE, "learn/_w1/k01-units.yml"), "utf8");
  ok(/at least 1 and less than 10, times a power of ten/.test(SIDE) && !/from 1 to 10|between 1 and 10/.test(SIDE + QMD + JS), "scientific notation: 1 <= a < 10 in the glossary, the page and the script (never 'from 1 to 10')");
  has("$\\dfrac{4.2 \\times 10^{15}}{1.9 \\times 10^{1}} \\approx 2.2 \\times 10^{14}$");
  has("$\\log_{10}(6.96 \\times 10^9) \\approx 9.84$"); ok(Math.log10(6.957e9).toFixed(2) === "9.84", "deeper: log10 of the day in Wh is 9.84");
  has("1 Wh = 3,600 J and 1 kWh = 3.6 MJ, exactly");
  has("ramp limit</span> of 40 MW per hour"); ok(town.fleet.cc.ramp === 40, "myth: lesson 0's ramp limit is 40 MW/h");
  has("298,600 GWh: a TWh is 1,000 GWh"); has("298,600,000 is the same energy in MWh");
  has("7. Exponents: 14 − 7 = 7. Leading numbers: 2.99 ÷ 1.08 ≈ 2.8. So the ratio is about 2.8 × 10⁷.</p><p>2.8 is below 3.16 (√10, the midpoint of 1 and 10 on a log scale), so the nearest power stays 10⁷");
  ok(near(Math.log10(K.HALF), 0.5), "quiz: √10 is the midpoint of 1 and 10 on a log scale");
  ok(!K.pairText(s, "home", "spp").up && K.pairText(s, "home", "spp").apart === 7 && near(K.HALF, Math.sqrt(10)) && K.HALF.toFixed(2) === "3.16", "quiz: 2.8 < 3.16 = √10, so 10⁷");
  has("Terms added together must share a unit: MW plus MW, never MW plus MWh");
  ok(!/A sum of terms with different names/.test(QMD), "modeler: the naming advice is about units, not names");
  has("coefficients (the fixed numbers in front of each unknown)"); has('Sensible units help a [solver]{.lx-term term="solver"}; they do not guarantee a well-scaled model');
  ok(!/tolerance/.test(QMD), "modeler: no solver-tolerance teaching on a units page (that belongs to B3 and M1)");
  ok(/data-id="spp" data-answer="b"[\s\S]{0,300}<li data-value="b">298,600 GWh<\/li>/.test(QMD), "quiz: spp's answer b is 298,600 GWh");
  ok(/data-id="apart" data-answer="b"[\s\S]{0,300}<li data-value="b">7<\/li>/.test(QMD), "quiz: apart's answer b is 7");
  ok(298.6 * 1000 === 298600 && Math.round(298.6 * 1e6) === 298600000, "quiz: the distractors are the TWh in GWh and MWh");
  // the no-JS table is the model's
  const a = QMD.match(START), b = QMD.indexOf(END);
  ok(a && b > a.index && QMD.slice(a.index + a[0].length, b).trim() === T.trim(), "page: the k1-table equals staticTable() (run with --write)");
  // links back to the lessons that need this, and dated primary sources
  ["01-power-energy.html", "05-capacity-factor.html", "07-cost.html", "00-grid-operator.html"].forEach(h => ok(QMD.indexOf('href="' + h + '"') >= 0, "links to " + h));
  ok(/<b>Source\.<\/b> Prairie Town's day is the real hourly demand shape of 3 September 2025 on the Southwest Power Pool grid \(<a href="https:\/\/www\.eia\.gov\/electricity\/gridmonitor\/">EIA-930<\/a>\)/.test(QMD) && /<b>Illustrative\.<\/b> The shape is scaled as in <a href="00-grid-operator\.html">lesson 0<\/a>/.test(QMD) && /checked 2 November 2026/.test(QMD) && /\(2022 data\)/.test(QMD) && /\(2025 data\)/.test(QMD), "sources: the day, the anchors and their dates, source and assumptions in separate entries");
  ok(/The town, its scale and the flat \$40\/MWh gas running cost are illustrative/.test(QMD), "the illustrative values are labelled");
  // each data-note entry is one labelled idea, within the text budget
  const notes = ((QMD.match(/<div class="lx-datanote">[\s\S]*?<\/ul><\/div>/) || [""])[0].match(/<li>[\s\S]*?<\/li>/g) || []).map(t => t.replace(/<[^>]+>/g, " ").trim().split(/\s+/).length);
  ok(notes.length === 4 && notes.every(n => n <= 36), "data note: four labelled entries of at most 36 words: " + notes.join(", "));
  const hrefs = (QMD.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?learn:\1:end -->/g, "").match(/href="([^"]+)"|\]\(([^)]+)\)/g) || []).map(h => h.replace(/^href="|"$|^\]\(|\)$/g, ""));
  ok(hrefs.every(h => /^(https:\/\/www\.(eia|epa)\.gov\/|[a-z0-9-]+\.html$)/.test(h)), "links: only learn pages, eia.gov and epa.gov: " + hrefs.filter(h => !/^(https:\/\/www\.(eia|epa)\.gov\/|[a-z0-9-]+\.html$)/.test(h)).join(" "));
  const strings = (JS.replace(/^\s*\/\/.*$/gm, "").match(/"(?:[^"\\]|\\.)*"/g) || []).join(" ");
  ok(!/nuclear|reactor|\bSMR\b|data cent|\bAI\b/i.test(QMD.replace(/<!-- learn:meta:start[\s\S]*?learn:meta:end -->/, "")) && !/nuclear|reactor|\bSMR\b|data cent|\bAI\b/i.test(strings), "scope: no nuclear, data-center or AI wording on the page or in the script's strings");
}

// ---------------- every number in the page's visible text is one the model produces (whitelist scan)
{
  let body = QMD.replace(/^---[\s\S]*?\n---\n/, "").replace(/<!-- learn:(meta|next|footer):start[\s\S]*?learn:\1:end -->/g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/<style>[\s\S]*?<\/style>/g, "")
    .replace(/<script[\s\S]*?<\/script>/g, "").replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<[^>]+>/g, " ").replace(/\]\([^)]*\)/g, "]")
    .replace(/\{[^}]*\}/g, " ").replace(/https?:\/\/\S+/g, " ").replace(/\\(dfrac|times|approx|log)/g, " ").replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+/g, m => " " + m.split("").map(c => "⁰¹²³⁴⁵⁶⁷⁸⁹".indexOf(c) >= 0 ? "⁰¹²³⁴⁵⁶⁷⁸⁹".indexOf(c) : "-").join(""));
  const allowed = new Set(), add = v => allowed.add(String(v));
  [s.peak, num(s.peakKW), s.peakGW, s.dayMWh, num(s.dayMWh), s.dayGWh, K.sig(s.dayGWh, 3), num(s.gasMWh), s.gasCost, num(s.gasDollars), num(s.avgMW, 1),
   s.loMW, s.hiMW, num(s.loBound), num(s.hiBound), s.span, s.ramp, num(s.sppGWh), num(s.sppGWh * 1000), s.homeToSpp, num(s.dayMWh * 1000),
   Math.round(s.dayGWh), Math.round(s.dayGWh) * 10, "298.6", "0.2986", "2,986", "10,791", "4,200", "1,000", "0.019",
   num(G0.expert(G0.prepare(town, year, "lesson0")).totals.pk), num(G0.expert(G0.prepare(town, year, "lesson0")).totals.cc), s.pkCost, num(80400), K.HALF.toFixed(2), days.stats.missing_hours_filled.demand].forEach(add);
  s.items.forEach(it => { add(K.sig(it.mant, 3)); add(it.exp); add(K.plain(it.wh)); });
  ["2.2", "2.8", "9.84", "3,600", "3.6", "8,760", "24", "1", "2", "3", "4", "5", "6", "7", "9", "10", "12", "13", "14", "15", "16", "21", "100", "0", "2019", "2022", "2025", "2026", "0.45", "930"].forEach(add);
  const found = (body.match(/\d[\d,]*(?:\.\d+)?/g) || []).map(t => t.replace(/[.,]$/, ""));
  const unknown = [...new Set(found.filter(t => !allowed.has(t)))];
  ok(unknown.length === 0, "every number on the page is from the model, a source or a structural count; unknown: " + unknown.join(" "));
  ok(found.length > 80, `the scan saw the page's numbers (${found.length})`);
}

// ---------------- displayed calculations: "=" only where exact, "≈" across a rounding; the nearest power of ten is explained
{
  ok(K.eqSci(19) === "= 1.9 × 10¹" && K.eqSci(6957e6) === "≈ 6.96 × 10⁹" && K.eqSci(7000e6) === "= 7 × 10⁹" && K.eqSci(6957e9) === "≈ 6.96 × 10¹²", "eqSci: = when exact, ≈ when rounded");
  ok(K.eqNum(289.875, 1) === "≈ 289.9" && K.eqNum(290, 1) === "= 290.0" && K.eqNum(1965 * 40) === "= 78,600", "eqNum: = when exact, ≈ when rounded");
  ok(/\+ " ≈ \(" \+ sig\(p\.big\.mant, 3\)/.test(JS) && /"<\/sup> ≈ <b>" \+ p\.ratioText/.test(JS) && /\{ op: "≈" \},\n\s+\{ v: "\(" \+ sig\(p\.big\.mant/.test(JS), "step 5 and the explain chain use ≈ between rounded leading numbers and the ratio");
  ok(!/\{ op: "=" \}/.test(JS) && /" MWh ÷ 24 h " \+ eqNum\(s\.avgMW, 1\)/.test(JS) && /" h " \+ eqNum\(avg, 1\) \+ " MW/.test(JS), "the average-power lines pick = or ≈ from the numbers");
  // the default pair: 6,957 MWh against 10,791 kWh
  const P = K.pairText(s, "town", "home");
  ok(near(P.ratio, 6957e6 / 10791e3) && K.num(P.ratio) === "645" && !K.isExact(6.96 / 1.08 * 100, P.ratio) && K.num(6.96 / 1.08 * 100) === "644" && P.up && P.rexp === 2 && K.sig(P.rmant, 3) === "6.45", "default pair: the unrounded ratio 644.7 shows as 645; the rounded leading numbers give 644, so the page writes ≈");
  ok(K.nearestWhy(P) === "645 = 6.45 × 10²: 6.45 is above 3.16 (√10, the midpoint of 1 and 10 on a log scale), so the nearest power is 10³.", "default pair: the ratio's exponent (2) and its nearest power (10³) are told apart: " + K.nearestWhy(P));
  ok(K.nearestWhy(K.pairText(s, "phone", "us")) === "2.2 is below 3.16 (√10, the midpoint of 1 and 10 on a log scale), so the nearest power is 10¹⁴." && K.sci(s.spanRatio, 2) === "2.2 × 10¹⁴", "step 5: the phone-to-U.S. reason uses the 2.2 the feedback shows");
  // every pair: the stated reason agrees with the count (above 3.16 rounds up, below stays)
  s.items.forEach(a => s.items.forEach(b => { if (a.id !== b.id) { const p = K.pairText(s, a.id, b.id); ok(p.apart === p.rexp + (p.up ? 1 : 0) && p.apart === Math.round(Math.log10(p.ratio)) && p.rmant >= 1 && p.rmant < 10, `pair ${a.id}/${b.id}: nearest power ${p.apart} = exponent ${p.rexp} + (${K.sig(p.rmant, 3)} ≥ 3.16)`); } }));
  // the flowchart traces: the slipped report is not a round number in Wh, so it takes ≈; the right one is exact
  ok(K.eqSci(s.claims[0].mwh * 1e6) === "≈ 6.96 × 10¹²" && K.eqSci(s.claims[2].mwh * 1e6) === "= 7 × 10⁹", "flowchart: the traces' signs");
  ok(/Scientific notation \(3 figures\)/.test(T), "no-JS table: the scientific-notation column says it is rounded to 3 figures");
}

// ---------------- the interactive: the actions Next waits for, the live regions, the demo hook
{
  ok(/if \(got\[1\] && got\[3\]\)/.test(JS) && /close\(v, s\.dayGWh, 0\.006\)/.test(JS) && /CHAINS\.every/.test(JS) && /v === s\.byId\.town\.exp/.test(JS) && /v === s\.span/.test(JS) && /s\.claims\.every/.test(JS), "steps: each card's action is checked before Next opens");
  ok((JS.match(/steps\.push\(\{/g) || []).length === 6 && s.byId.town.exp === 9, "steps: six cards; step 4 asks for the town's day's exponent, 9");
  // each number box names its unit in its own label (a screen reader reads the label, not the unit after the box)
  ok(/label: s\.peak \+ " MW in kW:"/.test(JS) && /label: s\.peak \+ " MW in GW:"/.test(JS) && /label: "Day's energy in GWh:"/.test(JS) && /label: "Exponent n for the day in Wh:"/.test(JS) && /label: "Powers of ten, phone to U\.S\. year:"/.test(JS) && !/label: "The day:"/.test(JS), "steps: every number box's label carries its unit");
  ok((JS.match(/"aria-live": "polite"/g) || []).length >= 4, "steps: results are announced in live regions (the drill's are LX.Drill's)");
  ok(/LX\.demo\(root,/.test(JS) && /state === "mid" \? 2/.test(JS) && /state === "done"/.test(JS) && /autos\[5\]/.test(JS) && [0, 1, 2, 3, 4, 5].every(k => JS.indexOf("autos[" + k + "] = function") >= 0), "demo: mid, step-N and done states; every card has a finish-for-me");
  ok(/LX\.store\.set\("k1-pair"/.test(JS) && /LX\.store\.get\("k1-pair"\)/.test(JS), "explain: the unit chain reads the reader's own pair from step 4");
  ok(/LX\.CompareTable\(/.test(JS) && /LX\.UnitChain\(/.test(JS) && /LX\.Flowchart\(/.test(JS), "explain: comparison table, unit chain and flowchart");
  ok(/LX\.Drill\(host, \{/.test(JS) && !/focus: false/.test(JS), "drill: LX.Drill, whose next item takes focus");
  ok(/\[\[scientific-notation\|/.test(JS) && /\[\[order-of-magnitude\|/.test(JS), "glossary: the sidecar's terms are marked");
  // the step-5 claims are judged by the bounds, and the flowchart traces use the same claims
  ok(s.claims.filter(c => c.ok).length === 1 && s.claims[0].ok === false && s.claims[2].ok === true, "flowchart: trace 1 is a slip, trace 2 fits");
}

// ---------------- drill items
{
  const D = s.D, items = K.drill(D, 42, 600), counts = {};
  items.forEach((it, i) => {
    counts[it.kind] = (counts[it.kind] || 0) + 1;
    if (it.kind === "prefix") {
      const m = /^([\d,.]+) (k|M|G|T)?(W|Wh) = \? (k|M|G|T)?(W|Wh)$/.exec(it.q), E = { "": 0, k: 3, M: 6, G: 9, T: 12 };
      ok(m && m[3] === m[5] && m[2] !== m[4] && near(it.answer, +m[1].replace(/,/g, "") * Math.pow(10, E[m[2] || ""] - E[m[4] || ""]), Math.abs(it.answer) * 1e-12) && K.close(it.answer, it.answer) && !K.close(it.answer * 1.001, it.answer), `drill ${i}: prefix ${it.q} = ${it.answer}`);
    }
    if (it.kind === "energy") {
      let m = /^At (\d\d):00 on 3 September 2025, Prairie Town drew (\d+) MW/.exec(it.q);
      if (m) ok(+m[2] === D.demand[+m[1]] && it.answer === +m[2] * 1000, `drill ${i}: energy of one hour`);
      else { m = /^A ([\d,]+) W heater runs for (\d+) minutes/.exec(it.q); ok(m && near(it.answer, +m[1].replace(/,/g, "") / 1000 * +m[2] / 60, 1e-12), `drill ${i}: heater kWh`); }
    }
    if (it.kind === "unit") { const u = K.UNITS.find(x => it.q === "What unit is left after " + x[0] + "?"); ok(u && it.choices[it.answer] === u[1] && new Set(it.choices).size === 4, `drill ${i}: unit`); }
    if (it.kind === "sci") { const m = /, ([\d,.]+) Wh has n = \?$/.exec(it.q), x = +m[1].replace(/,/g, ""); ok(K.expOf(x) === it.answer && x / Math.pow(10, it.answer) >= 1 && x / Math.pow(10, it.answer) < 10, `drill ${i}: sci ${m[1]} → ${it.answer}`); }
    if (it.kind === "average") {
      const m = /^From (\d\d):00 to (\d\d):00 on 3 September 2025, Prairie Town used ([\d,]+) MWh\. Its average power over those (\d+) hours/.exec(it.q), a = +m[1], b = +m[2];
      ok(m && b - a === +m[4] && K.sum(D.demand.slice(a, b)) === +m[3].replace(/,/g, "") && it.answer === Math.round(+m[3].replace(/,/g, "") / +m[4]) && b <= 24, `drill ${i}: average`);
    }
    if (it.kind === "apart") {
      const sp = c => +"⁰¹²³⁴⁵⁶⁷⁸⁹".indexOf(c);
      const m = /are ([\d.]+) × 10([⁰¹²³⁴⁵⁶⁷⁸⁹]+) Wh and ([\d.]+) × 10([⁰¹²³⁴⁵⁶⁷⁸⁹]+) Wh/.exec(it.q);
      const e1 = +m[2].split("").map(sp).join(""), e2 = +m[4].split("").map(sp).join(""), x1 = +m[1] * Math.pow(10, e1), x2 = +m[3] * Math.pow(10, e2);
      ok(K.powersApart(x1, x2) === it.answer && e2 - e1 === it.answer && +m[3] < 10 && +m[3] >= 1, `drill ${i}: apart`);
    }
    if (it.kind === "prefix") ok(it.answer >= 1e-4 && it.answer <= 1e8, `drill ${i}: prefix answer in a typeable range (${it.answer})`);
    ok(typeof it.why === "string" && it.why.length > 10 && !/NaN|undefined/.test(it.q + it.why), `drill ${i}: has an explanation`);
  });
  ok(Object.keys(counts).length === 6, "drill: all six kinds appear: " + JSON.stringify(counts));
  ok(K.drill(D, 7, 12).map(x => x.q).join("|") === K.drill(D, 7, 12).map(x => x.q).join("|"), "drill: a seed replays the same items");
}

console.log(`k01-units: ${checks - fails} of ${checks} checks passed`);
process.exit(fails ? 1 : 0);
