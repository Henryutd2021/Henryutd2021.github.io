// test_k02-rates-efficiencies.js — Node tests for toolbox K2 (assets/learn/k02-rates-efficiencies.js): the inputs are the
// same numbers the lessons use (01-power-energy.json, 07-cost.json, 13-capstone.json, town.json, cf_targets.json), the
// formulas agree with lessons 1, 5, 7 and 13 (home watts, annualEnergy, lcoe().fuel, costs().co2), the identities hold
// (efficiency and heat rate, forward and backward through a loss, capacity factor and energy), the drill's answers are
// right, and every number the page states matches the model (a whitelist scan of the page's visible text, plus the
// statements one by one). The no-JS table must equal staticBlocks().
// Usage (from the site folder):  node _tests/learn/test_k02-rates-efficiencies.js [--write]   (--write rewrites the no-JS table)
"use strict";
const fs = require("fs");
const path = require("path");
const SITE = path.resolve(__dirname, "..", "..");
const K = require(path.join(SITE, "assets/learn/k02-rates-efficiencies.js"));
const L1 = require(path.join(SITE, "assets/learn/01-power-energy.js"));
const L5 = require(path.join(SITE, "assets/learn/05-capacity-factor.js"));
const L7 = require(path.join(SITE, "assets/learn/07-cost.js"));
const L13 = require(path.join(SITE, "assets/learn/13-capstone.js"));
const J = f => JSON.parse(fs.readFileSync(path.join(SITE, "assets/learn/data", f + ".json"), "utf8"));
const D1 = J("01-power-energy"), D7 = J("07-cost"), D13 = J("13-capstone"), town = J("town"), cft = J("cf_targets"), DK = J("k02-rates-efficiencies");
const QPATH = path.join(SITE, "learn/k02-rates-efficiencies.qmd");
const s = K.story(D1, D7, D13, town, cft, DK), B = K.staticBlocks(s);
const BLOCKS = { "k2-rates": "rates" };
function blockRe(name) { return [new RegExp("<!-- " + name + ":start[^>]*-->\\n"), "<!-- " + name + ":end -->"]; }
if (process.argv.includes("--write")) {
  let q = fs.readFileSync(QPATH, "utf8");
  Object.keys(BLOCKS).forEach(name => {
    const [ra, end] = blockRe(name), a = q.match(ra), b = q.indexOf(end);
    if (!a || b < a.index) throw new Error(name + " markers missing");
    q = q.slice(0, a.index + a[0].length) + B[BLOCKS[name]] + "\n" + q.slice(b);
  });
  fs.writeFileSync(QPATH, q); console.log("no-JS table written");
}
const QMD = fs.readFileSync(QPATH, "utf8");
const JS = fs.readFileSync(path.join(SITE, "assets/learn/k02-rates-efficiencies.js"), "utf8");

let checks = 0, fails = 0;
function ok(cond, msg) { checks++; if (!cond) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 1e-9 : tol);
const has = (str, msg) => ok(QMD.indexOf(str) >= 0, "page states " + (msg || JSON.stringify(str)) + ": " + JSON.stringify(str));
const { num, usd, pct } = K;

// ---------------- inputs: the numbers of the lessons that use them
{
  ok(D1.anchors.home_year.value === 10791 && D1.fermi.hours === 8760, "inputs: lesson 1's home (10,791 kWh a year) and 8,760 h");
  ok(D7.techs.cc.heatRate === 6.226 && D13.techs.cc.heatRate === 6.226 && D7.techs.peaker.heatRate === 9.142 && D13.techs.pk.heatRate === 9.142, "inputs: heat rates 6.226 and 9.142 in lessons 7 and 13");
  ok(D7.fuel.gas === 3.85 && D13.fuel.gas === 3.85, "inputs: gas $3.85 per MMBtu in lessons 7 and 13");
  ok(D13.fuel.co2PerMMBtu === 52.91 && D13.techs.battery.rte === 0.85, "inputs: 52.91 kg CO2 per MMBtu and an 85% round trip (lesson 13)");
  ok(town.fleet.wind.mw === 150 && cft.targets.wind.cf === 0.338 && cft.targets.wind.year === 2025, "inputs: the 150 MW wind farm and U.S. wind 33.8% in 2025");
  ok(DK.btuPerKWh.value === 3412 && /eia\.gov\/tools\/faqs\/faq\.php\?id=107/.test(DK.btuPerKWh.url) && /checked 3 November 2026/.test(DK.btuPerKWh.as_of), "inputs: 3,412 Btu per kWh with its EIA source and date");
  ok(/data-src="\.\.\/assets\/learn\/data\/01-power-energy\.json \.\.\/assets\/learn\/data\/07-cost\.json \.\.\/assets\/learn\/data\/13-capstone\.json \.\.\/assets\/learn\/data\/town\.json \.\.\/assets\/learn\/data\/cf_targets\.json \.\.\/assets\/learn\/data\/k02-rates-efficiencies\.json"/.test(QMD)
     && ["01_power_energy", "07_cost", "13_capstone"].every(k => JS.indexOf('data["' + k + '"]') >= 0) && /data\.town, data\.cf_targets, data\.k02_rates_efficiencies/.test(JS), "inputs: the page reads every data file");
}

// ---------------- formulas: the same as lessons 1, 5, 7 and 13
{
  const year = J("town_year"), days = J("town_days"), W1 = L1.world(D1, town, year, days);
  ok(near(s.homeW, W1.wind.homeW, 1e-9) && W1.wind.refW === 1232, "formulas: the home's average draw equals lesson 1's (1,232 W)");
  ok(near(s.fuelCC, L7.lcoe(L7.inputs(D7, "cc")).fuel, 1e-12) && near(s.fuelPK, L7.lcoe(L7.inputs(D7, "peaker")).fuel, 1e-12), "formulas: fuel cost per MWh equals lesson 7's lcoe().fuel");
  const C13 = L13.costs(D13);
  ok(near(s.co2CC, C13.techs.cc.co2 * 1000, 1e-9) && near(s.co2PK, C13.techs.pk.co2 * 1000, 1e-9), "formulas: CO2 per MWh equals lesson 13's costs().co2");
  ok(near(C13.techs.cc.run - D13.techs.cc.vom, s.fuelCC, 1e-9), "formulas: lesson 13's running cost is this fuel cost plus upkeep per MWh");
  ok(C13.eta === s.rte, "formulas: the round trip is lesson 13's battery");
  ok(near(s.windE, L5.annualEnergy(s.windMW, s.windCF, s.hours), 1e-6), "formulas: a year's wind energy equals lesson 5's annualEnergy");
  let bad = 0;
  for (let h = 5; h <= 12; h += 0.25) { if (!near(K.heatRateFor(K.efficiency(h, 3.412), 3.412), h, 1e-12)) bad++; }
  for (let e = 0.5; e <= 1; e += 0.05) for (let x = 1; x <= 500; x += 37) { if (!near(K.energyIn(K.energyOut(x, e), e), x, 1e-9) || !(K.energyIn(x, e) >= x - 1e-12)) bad++; }
  for (let mw = 10; mw <= 500; mw += 49) for (let cf = 0.05; cf <= 1; cf += 0.05) { if (!near(K.cfOf(K.cfEnergy(mw, cf, 8760), mw, 8760), cf, 1e-12)) bad++; }
  ok(bad === 0, `identities: heat rate and efficiency, forward and backward through a loss, capacity factor and energy (${bad} bad)`);
  ok(K.chain([0.5, 0.9]) === 0.45 && K.chain([]) === 1 && near(K.chain([s.effCC, s.rte]), s.chainEff), "identities: efficiencies in a chain multiply");
  ok(s.k === 3.412 && K.K_MMBTU === s.k && K.CO2_COEF === s.co2Coef && K.HOURS === s.hours, "identities: the drill's constants equal the data files'");
}

// ---------------- the story numbers
{
  ok(num(s.homeW) === "1,232" && num(s.homeKW, 3) === "1.232", "story: 1,232 W = 1.232 kW");
  ok(usd(s.fuelCC) === "$23.97" && usd(s.fuelPK) === "$35.20", "story: fuel $23.97 and $35.20 per MWh");
  ok(num(s.co2CC) === "329" && num(s.co2CC / 1000, 3) === "0.329" && num(s.co2PK) === "484", "story: 329 kg (0.329 t) and 484 kg CO2 per MWh");
  ok(pct(s.effCC) === "54.8%" && pct(s.effPK) === "37.3%" && pct(1 - s.effCC) === "45.2%" && pct(1 - s.effPK) === "62.7%", "story: efficiencies 54.8% and 37.3%");
  ok(num(s.gasRatio, 2) === "1.47" && num(s.points, 1) === "17.5" && Math.round((s.gasRatio - 1) * 100) === 47, "story: 1.47 times the gas, 47% more, 17.5 points");
  ok(s.back === 85 && num(s.need, 1) === "117.6" && num(s.naive) === "115" && num(s.naiveBack, 2) === "97.75", "story: 85 back, 117.6 in, not 115 (97.75 back)");
  ok(pct(s.chainEff) === "46.6%" && num(s.chainMWh, 2) === "16.06" && num(s.chainBack, 2) === "13.65" && near(s.chainBack / s.chainMWh, s.rte), "story: 100 MMBtu -> 16.06 MWh -> 13.65 MWh, 46.6%");
  ok(near(s.chainBack * s.k / s.gasIn, s.chainEff, 1e-12), "story: 13.65 MWh is 46.6% of the 100 MMBtu burned");
  ok(num(s.windMax) === "1,314,000" && num(s.windE) === "444,132" && num(s.windE / 1000) === "444", "story: 1,314,000 MWh possible, 444,132 MWh made");
  ok(near(s.quiz.cf, 0.5) && near(s.quiz.cfMWh / (s.quiz.cfMW * 365), 12), "story: the quiz's 50%, and 1,200% from days instead of hours");
}

// ---------------- the page: statements one by one
{
  has('subtitle: "Chain per-unit numbers, turn a heat rate into an efficiency, and follow the losses"');
  has("10,791 kWh a year ÷ 8,760 h = 1.232 kW, an average draw of 1,232 W");
  has("6.226 MMBtu per MWh × $3.85 per MMBtu = $23.97 per MWh, and × 52.91 kg CO₂ per MMBtu = 329 kg per MWh");
  has("Efficiency = 3.412 MMBtu per MWh ÷ heat rate: 54.8% for the combined-cycle plant, 37.3% for the peaker (heat rate 9.142)");
  has("an 85% battery gives back 85 of 100 MWh; 100 MWh back needs 100 ÷ 0.85 = 117.6 MWh in, not 115");
  has("150 MW × 8,760 h × 33.8% = 444,132 MWh in a year");
  has("Stage efficiencies multiply: 54.8% × 85% = 46.6%");
  has("$\\eta = 3{,}412 \\div 6{,}226 = 54.8\\%$");
  has("From the peaker's 37.3% to the combined-cycle plant's 54.8% is 17.5 percentage points");
  has("the peaker burns $9.142 \\div 6.226 = 1.47$ times the gas: 47% more");
  has("$e_{t+1} = e_t + 0.85\\, \\text{charge}_t - \\text{discharge}_t$");
  has("9.142 gives 37.3%, 6.226 gives 54.8%");
  has("115 × 0.85 = 97.75 MWh. Divide instead: 100 ÷ 0.85 = 117.6 MWh.");
  has("$35.20: 9.142 × 3.85, and MMBtu cancels. $2.37 divides instead; $12.99 adds numbers with different units.");
  has("50%: 438,000 ÷ (100 × 8,760) = 438,000 ÷ 876,000. Dividing by 365 days instead of 8,760 hours gives 1,200%");
  has("lesson 0's town uses a rounded, illustrative 0.37 t (metric tonnes) per MWh instead", "which CO2 rate the page uses, against lesson 0's");
  ok(town.fleet.cc.co2 === 0.37, "lesson 0's illustrative 0.37 t per MWh is what town.json holds");
  ok(near(9.142 / 3.85, 2.3745, 1e-4) && usd(9.142 / 3.85) === "$2.37" && usd(9.142 + 3.85) === "$12.99" && usd(3.85 / 9.142) === "$0.42", "quiz: the distractors are the stated mistakes");
  ok(/data-id="fuel" data-answer="b"[\s\S]{0,300}<li data-value="b">\$35\.20<\/li>/.test(QMD), "quiz: fuel's answer b is $35.20");
  ok(/data-id="cf" data-answer="c"[\s\S]{0,300}<li data-value="c">50%<\/li>/.test(QMD), "quiz: cf's answer c is 50%");
  Object.keys(BLOCKS).forEach(name => {
    const [ra, end] = blockRe(name), a = QMD.match(ra), b = QMD.indexOf(end);
    ok(a && b > a.index && QMD.slice(a.index + a[0].length, b).trim() === B[BLOCKS[name]].trim(), `page: the ${name} table equals staticBlocks() (run with --write)`);
  });
  // links back to the lessons that need this, back to K1 and forward to K3
  ["01-power-energy.html", "05-capacity-factor.html", "07-cost.html", "09-storage.html", "13-capstone.html", "k03-discounting.html"].forEach(h => ok(QMD.indexOf('href="' + h + '"') >= 0 || QMD.indexOf("](" + h + ")") >= 0, "links to " + h));
  ok(/Toolbox <a href="k01-units.html">K1<\/a> covers the units underneath/.test(QMD), "K1 is linked");
  // sources: primary, dated
  ok(/faq\.php\?id=107&amp;t=3">EIA FAQ on plant efficiency<\/a> \(checked 3 November 2026\)/.test(QMD), "source: EIA FAQ, 3,412 Btu per kWh, dated");
  ok(/EMM_Assumptions\.pdf">EIA, AEO2026 assumptions, Table 3<\/a> \(April 2026\)/.test(QMD) && /co2_vol_mass\.php">EIA<\/a> \(checked 2 November 2026\)/.test(QMD) && /93281\.pdf">NREL's 2025 battery cost study<\/a> \(June 2025\)/.test(QMD) && /Table 6\.07\.B<\/a> \(released 23 October 2026\)/.test(QMD), "sources: EIA, NREL with their dates");
  ok(/150 MW wind farm is illustrative/.test(QMD) && /CO₂ is counted at the plant only/.test(QMD), "the illustrative farm and the CO2 boundary are stated");
  const scope = QMD.replace(/<!-- learn:meta:start[\s\S]*?learn:meta:end -->/, "") + JS.replace(/\/\/.*$/gm, "");
  ok(!/nuclear|reactor|\bSMR\b|learning|data cent|\bAI\b/i.test(scope), "scope: no nuclear, no learning wording, no data centers, no AI");
}

// ---------------- every number in the page's visible text is one the model produces (whitelist scan)
{
  let body = QMD.replace(/^---[\s\S]*?\n---\n/, "").replace(/<!-- learn:(meta|next|footer):start[\s\S]*?learn:\1:end -->/g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/\{,\}/g, ",").replace(/<style>[\s\S]*?<\/style>/g, "")
    .replace(/<script[\s\S]*?<\/script>/g, "").replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<[^>]+>/g, " ").replace(/\]\([^)]*\)/g, "]")
    .replace(/\{[^}]*\}/g, " ").replace(/https?:\/\/\S+/g, " ");
  const allowed = new Set(), add = v => allowed.add(String(v));
  [num(s.homeKWh), num(s.hours), num(s.homeKW, 3), num(s.homeW), num(s.hrCC, 3), num(s.hrPK, 3), usd(s.gas).slice(1), usd(s.fuelCC).slice(1), usd(s.fuelPK).slice(1),
   num(s.co2Coef, 2), num(s.co2CC), num(s.co2CC / 1000, 3), num(s.k, 3), num(s.btu), num(s.btu * 1.0 / 1000 * 1000), "6,226", num(s.effCC * 100, 1), num(s.effPK * 100, 1),
   num(s.gasRatio, 2), "47", num(s.points, 1), num(s.rte * 100, 0), num(s.rte, 2), num(s.need, 1), num(s.naive), num(s.naiveBack, 2), num(s.back), num(s.target),
   num(s.chainEff * 100, 1), num(s.windMW), num(s.windCF * 100, 1), num(s.windE), num(s.windMax),
   num(s.quiz.cfMWh), num(s.quiz.cfMW * s.hours), "50", "1,200", "5", "0.5", "2.37", "12.99", "0.42", "365", "0.37", "80"].forEach(add);
  // structural numbers: lesson and toolbox numbers, dates, years, the t + 1 index, 1,000 per kilo, counts
  [0, 1, 2, 3, 4, 5, 7, 9, 12, 13, 23, 24, 2022, 2025, 2026, "1,000", "6.07", "7.4"].forEach(add);   // 6.07, 7.4: EIA table numbers
  const found = (body.match(/\d[\d,]*(?:\.\d+)?/g) || []).map(t => t.replace(/[.,]$/, ""));
  const unknown = [...new Set(found.filter(t => !allowed.has(t)))];
  ok(unknown.length === 0, "every number on the page is from the model, a source or a structural count; unknown: " + unknown.join(" "));
  ok(found.length > 80, `the scan saw the page's numbers (${found.length})`);
}

// ---------------- the interactive: the actions Next waits for, the live regions, the demo hook
{
  ok(/close\(v, s\.homeW, 1\)/.test(JS) && /right\.gas && right\.co2/.test(JS) && /var ok = c\[0\] === "less"/.test(JS) && /close\(v, s\.need, 0\.06\)/.test(JS) && /close\(v, s\.windE, 1000\)/.test(JS), "steps: each card's action is checked before Next opens");
  ok(/close\(v, s\.naive, 0\.5\)/.test(JS) && /close\(v, s\.homeKW, 0\.002\)/.test(JS) && /close\(v, s\.windE \/ 1000, 1\)/.test(JS), "steps: the common slips (115, kW, GWh) get their own hint");
  ok((JS.match(/"aria-live": "polite"/g) || []).length >= 4, "steps: results are announced in live regions");
  ok(/LX\.demo\(root,/.test(JS) && /state === "mid" \? 1/.test(JS) && /state === "done"/.test(JS) && /autos\[4\]/.test(JS), "demo: mid, step-N and done states");
  ok(/LX\.store\.set\("k2-own"/.test(JS) && /LX\.store\.get\("k2-own"\)/.test(JS), "explain: the equation card reads the reader's own plant");
  ok(/LX\.EquationCard\(/.test(JS) && /LX\.CompareTable\(/.test(JS) && /LX\.EnergyChain\(/.test(JS), "explain: equation card, comparison table and energy chain");
  ok(/qp\.focus\(\)/.test(JS) && /textAlt\(/.test(JS), "drill focus and text versions");
}

// ---------------- drill items
{
  const items = K.drill(42, 700), counts = {};
  items.forEach((it, i) => {
    counts[it.kind] = (counts[it.kind] || 0) + 1;
    let m;
    if (it.kind === "avg") { m = /uses ([\d,]+) kWh in a year/.exec(it.q); ok(m && near(it.answer, +m[1].replace(/,/g, "") * 1000 / 8760) && K.close(Math.round(it.answer), it.answer, it.tol), `drill ${i}: avg`); }
    if (it.kind === "fuel") { m = /heat rate is ([\d.]+) MMBtu per MWh and gas costs \$([\d.]+) per MMBtu/.exec(it.q); ok(m && near(it.answer, +m[1] * +m[2]) && K.close(+it.answer.toFixed(2), it.answer, it.tol), `drill ${i}: fuel`); }
    if (it.kind === "eff") { m = /heat rate is ([\d.]+) MMBtu per MWh\. Its efficiency/.exec(it.q); ok(m && near(it.answer, 341.2 / +m[1], 1e-9) && K.close(+it.answer.toFixed(1), it.answer, it.tol), `drill ${i}: eff`); }
    if (it.kind === "co2") { m = /heat rate of ([\d.]+) MMBtu per MWh/.exec(it.q); ok(m && near(it.answer, +m[1] * 52.91) && K.close(Math.round(it.answer), it.answer, it.tol), `drill ${i}: co2`); }
    if (it.kind === "back") {
      m = /round trip is (\d+)%\. Charge (\d+) MWh/.exec(it.q);
      const m2 = /round trip is (\d+)%\. To get (\d+) MWh back/.exec(it.q);
      ok((m && near(it.answer, +m[2] * m[1] / 100)) || (m2 && near(it.answer, +m2[2] / (m2[1] / 100)) && it.answer > +m2[2] * (2 - m2[1] / 100) - 1e-9), `drill ${i}: back`);
      ok(K.close(+it.answer.toFixed(1), it.answer, it.tol), `drill ${i}: back, one decimal is accepted`);
    }
    if (it.kind === "cf") {
      m = /A (\d+) MW plant made ([\d,]+) MWh in a year/.exec(it.q);
      const m2 = /A (\d+) MW plant runs at a (\d+)% capacity factor/.exec(it.q);
      ok((m && near(it.answer, +m[2].replace(/,/g, "") / (+m[1] * 8760) * 100, 1e-9)) || (m2 && near(it.answer, +m2[1] * 8760 * m2[2] / 100, 1e-6)), `drill ${i}: cf`);
    }
    if (it.kind === "chain") {
      m = /first keeps (\d+)% of the energy, the second (\d+)%/.exec(it.q);
      ok(m && it.choices[it.answer] === pct(+m[1] * +m[2] / 10000) && new Set(it.choices).size === 3, `drill ${i}: chain (${it.choices.join(", ")})`);
    }
    if (!it.choices) ok(!K.close(it.answer + 2.5 * it.tol, it.answer, it.tol) && it.tol > 0, `drill ${i}: tolerance`);
  });
  ok(Object.keys(counts).length === 7, "drill: all seven kinds appear: " + JSON.stringify(counts));
  ok(K.drill(7, 12).map(x => x.q).join("|") === K.drill(7, 12).map(x => x.q).join("|"), "drill: a seed replays the same items");
}

console.log(`k02-rates-efficiencies: ${checks - fails} of ${checks} checks passed`);
process.exit(fails ? 1 : 0);
