// test_f06-grid-and-outages.js — Node tests for F6 (assets/learn/f06-grid-and-outages.js), its data
// (assets/learn/data/f06-grid-and-outages.json with 03-balancing.json) and every number the page states.
// Usage (from the site folder):  node _tests/learn/test_f06-grid-and-outages.js
"use strict";
const fs = require("fs");
const path = require("path");
const SITE = path.resolve(__dirname, "..", "..");
const rd = p => fs.readFileSync(path.join(SITE, p), "utf8");
const M = require(path.join(SITE, "assets/learn/f06-grid-and-outages.js"));
const D = JSON.parse(rd("assets/learn/data/f06-grid-and-outages.json"));
const B3 = JSON.parse(rd("assets/learn/data/03-balancing.json"));
const QMD = rd("learn/f06-grid-and-outages.qmd");
const JS = rd("assets/learn/f06-grid-and-outages.js");
const PATH = rd("learn/path.yml");
const SIDE = rd("learn/_w1/f06-grid-and-outages.yml");
const GLOSS = rd("learn/glossary.yml") + fs.readdirSync(path.join(SITE, "learn/_w1")).filter(f => /\.yml$/.test(f)).map(f => rd("learn/_w1/" + f)).join("\n");

let checks = 0, fails = 0;
function ok(cond, msg) { checks++; if (!cond) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-9 : t);
const sentences = s => s.replace(/\b(U\.S|e\.g|i\.e|p|pp)\./g, "$1").split(/(?<=[.!?])\s+/).filter(Boolean).length;
const words = s => s.replace(/\[\[[^|\]]+\|([^\]]+)\]\]/g, "$1").replace(/\*\*/g, "").split(/\s+/).filter(Boolean).length;
const set = ids => { const o = {}; ids.forEach(i => { o[i] = true; }); return o; };
const fmt = (v, d) => M.fmtN(v, d);
D.practice = +((rd("learn/path.yml").split("id: f06-grid-and-outages")[1] || "").match(/practice_minutes: (\d+)/) || [])[1];
const net = D.net, faults = D.storm.faults, rows = D.reliability.rows, last = rows[rows.length - 1];
const R = Object.fromEntries(rows.map(r => [r.year, r]));

// Two kinds of check. Source consistency: the page, the script and the data say the same thing, and each real number
// carries its source. Model validation: the losses, the protection logic, the repair orders and the reliability measures
// are recomputed from their inputs, and every claim the page makes about them ("none", "only when", "best", "more than
// half") is proved on the model as built.

// ---------------- sources: every real number has a primary source with a URL and a date, on the allow-list
{
  const ALLOW = /^https:\/\/(www\.)?(eia\.gov|energy\.gov)\//;
  Object.entries(D.sources).forEach(([k, s]) => { ok(ALLOW.test(s.url) && s.as_of && s.where && s.label, `source ${k}: label, URL on the allow-list, as-of date and place`); });
  ["generator", "transmission", "subtransmission", "distribution", "service"].forEach(k => ok(D.sources[D.voltages[k].src] && D.voltages[k].quote.length > 20, `voltage class ${k}: sourced, with the quoted sentence`));
  ok(D.voltages.generator.lo === 5 && D.voltages.generator.hi === 34.5, "generators: 5–34.5 kV (DOE CESER p. 2)");
  ok(D.voltages.transmission.list.join() === "115,138,230,345,500,765", "transmission: 115 ... 765 kV (DOE CESER p. 2)");
  ok(D.voltages.distribution.list.join() === "4.8,12.47,22.9,34.5" && D.voltages.distribution.page === 27, "distribution circuits: 4.8, 12.47, 22.9, 34.5 kV (PNNL p. 27)");
  ok(D.voltages.service.text === "240/120 V" && D.voltages.service.page === 38, "residential service: 240/120 V (PNNL p. 38)");
  ok(D.losses.real_pct === 5 && D.losses.real_years === "2018 through 2022" && /about 5%/.test(D.losses.real_quote), "losses: about 5%, 2018 through 2022 (EIA FAQ)");
  ok(D.distribution_share.pct === 90 && /over 90 percent of electric power\s+interruptions/.test(D.distribution_share.quote.replace(/\n/g, " ")) && /largely due to weather-related events/.test(D.distribution_share.quote), "DOE QER p. 4-2: over 90 percent, largely weather");
  ok(/released 21 October 2026/.test(D.sources.epa.as_of), "EIA Table 11.1: the Electric Power Annual 2025 release date");
  // every real number on the page names its source nearby (facts table: one source link per row)
  const facts = (QMD.match(/<table class="lx-facts">[\s\S]*?<\/table>/) || [""])[0];
  const fr = facts.split("<tr>").slice(2);
  ok(fr.length === 7, `facts table: ${fr.length} rows`);
  fr.forEach(r => ok(/<td class="s"><a href="https:\/\/www\.(eia|energy)\.gov\/[^"]+">[^<]+<\/a>[^<]*· [^<]*\d{4}<\/td>/.test(r), `facts row has a primary source and a date: ${r.slice(0, 60)}`));
}

// ---------------- Prairie Town's voltages sit inside the sourced U.S. ranges; the eight stops say the same everywhere
{
  const T = D.town, V = D.voltages;
  ok(T.genKV >= V.generator.lo && T.genKV <= V.generator.hi, `the plant's ${T.genKV} kV lies in 5–34.5 kV`);
  ok(V.transmission.list.indexOf(T.txKV) >= 0, `the ${T.txKV} kV line is a sourced transmission class`);
  ok(V.distribution.list.indexOf(T.distKV) >= 0, `the ${T.distKV} kV feeder is a sourced distribution voltage`);
  ok(T.serviceV === 240 && T.socketV === 120, "home: 240/120 V service, 120 V socket");
  ok(D.stops.length === 8 && D.stops.map(s => s.n).join() === "1,2,3,4,5,6,7,8", "eight stops, numbered in order");
  const fb = (QMD.match(/<div class="lx-fallback">[\s\S]*?<\/table>/) || [""])[0];
  D.stops.forEach(s => {
    ok(fb.indexOf("<td>" + s.n + " " + s.name + "</td><td>" + s.kv + "</td><td>" + s.range + "</td>") >= 0, `fallback row for stop ${s.n} ${s.name} matches the data (${s.kv}; ${s.range})`);
    ok(D.sources[s.src], `stop ${s.n}: source ${s.src}`);
    ok(words(s.what) <= 30 && sentences(s.what) <= 2, `stop ${s.n}: one short sentence`);
  });
  const kvs = D.stops.map(s => s.kv).join(" | ");
  ok(kvs === T.genKV + " kV | " + T.genKV + " → " + T.txKV + " kV | " + T.txKV + " kV | " + T.txKV + " → " + T.distKV + " kV | " + T.distKV + " kV | " + T.distKV + " kV → 240/120 V | 240/120 V | " + T.socketV + " V", "the stops' voltages follow the town's values");
}

// ---------------- model validation: the loss formula and the claims made about it
{
  const L = D.losses, P = L.P_MW, Rw = L.R_ohm;
  const at = kv => M.loss(P, kv, Rw);
  // a balanced three-phase line: current in each wire I = P / (√3 V) with V between two wires; loss in the three wires 3 I² R,
  // which equals the one-wire P² R / V², so the shares lost do not depend on the phase count (review F6 #4)
  L.classes_kV.forEach(kv => { const x = at(kv); ok(near(x.I, P * 1e6 / (Math.sqrt(3) * kv * 1e3)) && near(x.lossMW, 3 * x.I * x.I * Rw / 1e6) && near(x.lossMW, Math.pow(P * 1e6 / (kv * 1e3), 2) * Rw / 1e6, 1e-9) && near(x.pct, 100 * x.lossMW / P), `${kv} kV: I = P/(√3 V) per wire, loss = 3 I²R = P²R/V²`); });
  ok(fmt(at(345).I) === "167" && fmt(at(69).I) === "837", `current in each wire: ${fmt(at(345).I)} A at 345 kV, ${fmt(at(69).I)} A at 69 kV (a one-wire I = P/V would give 290 A and 1,449 A)`);
  ok(/"Current in each wire"/.test(JS) && /a line of three wires \(three phases, as real lines have\)/.test(JS) && /I = P \/ \(√3 × V\)/.test(D.losses.about), "the readout says the current is per wire; the data note gives the three-phase formula");
  ok(L.classes_kV.every((kv, i) => i === 0 || at(kv).lossMW < at(L.classes_kV[i - 1]).lossMW), "loss falls at every higher voltage class");
  [69, 115, 230, 345].forEach(kv => ok(near(at(2 * kv).lossMW, at(kv).lossMW / 4, 1e-12), `doubling ${kv} kV quarters the loss (quiz)`));
  ok(L.classes_kV[4] === 5 * L.classes_kV[0] && near(at(L.classes_kV[4]).lossMW * 25, at(L.classes_kV[0]).lossMW, 1e-9), "345 kV is five times 69 kV, with one twenty-fifth of the loss");
  ok(fmt(at(69).pct, 1) === "10.5" && fmt(at(345).pct, 2) === "0.42", `69 kV: ${fmt(at(69).pct, 1)}%; 345 kV: ${fmt(at(345).pct, 2)}%`);
  ok(L.classes_kV.slice(1).every(kv => D.voltages.transmission.list.indexOf(kv) >= 0) && D.voltages.subtransmission.list.indexOf(L.classes_kV[0]) >= 0, "the slider's voltages are sourced classes (69 kV sub-transmission, the rest transmission)");
  ok(at(69).pct > L.real_pct && at(345).pct < L.real_pct, "the toy brackets EIA's 5% (its lines are illustrative, not the U.S. grid)");
}

// ---------------- model validation: protection on the radial feeders and the meshed loop
{
  const S = Object.fromEntries(net.sections.map(s => [s.id, s]));
  ok(M.homesTotal(net) === 30, "30 homes on the east side");
  ok(net.sections.every(s => net.devices[s.dev]) && new Set(net.sections.map(s => s.dev)).size === net.sections.length, "every section has its own protective device at its head");
  ok(net.sections.filter(s => s.kind === "lateral").every(s => net.devices[s.dev].kind === "fuse" && s.homes > 0), "each lateral has a fuse and homes");
  // a single fault on any section opens that section's own device (the closest one upstream) and darkens exactly the
  // sections below it: "protection isolates the smallest section it can"
  net.sections.forEach(s => {
    const o = M.outage(net, set([s.id])), below = M.below(net, s.id);
    const darkIds = Object.keys(o.dark).filter(k => o.dark[k]).sort().join();
    ok(Object.keys(o.opened).join() === s.dev && darkIds === below.slice().sort().join(), `fault on ${s.id}: ${s.dev} opens, ${below.join(",")} dark`);
    ok(o.homesDark === below.reduce((a, x) => a + S[x].homes, 0), `fault on ${s.id}: ${o.homesDark} homes dark`);
  });
  // two faults on one path: the device nearer the substation is the cause of every section below it
  const two = M.outage(net, set(["F1A", "L2"]));
  ok(two.cause.L2 === "B1" && two.cause.L3 === "B1" && two.homesDark === 20, "faults on F1A and L2: B1 is the cause, 20 homes dark");
  // the loop: N−1 holds, and all 30 go dark only when both lines into the substation fall
  const lines = net.lines.map(l => l.id);
  for (let m = 0; m < 8; m++) {
    const f = lines.filter((x, i) => m & (1 << i)), o = M.outage(net, set(f)), both = f.indexOf("GS") >= 0 && f.indexOf("NS") >= 0;
    ok((o.homesDark === 30) === both && (o.homesDark === 0) === !both, `lines down [${f.join(",") || "none"}]: ${o.homesDark} homes dark`);
    if (f.length === 1) ok(o.homesDark === 0, `N−1: ${f[0]} alone darkens no home`);
  }
  ok(M.outage(net, set(["XF"])).homesDark === 30 && M.outage(net, set(["XF"])).upstream === "XF", "substation transformer fault: all 30 homes");
  // the fallback's fourth row ("None: power goes round the loop") and the quiz's "only when both lines into the substation fall"
  ok(/One loop line down: power goes round the other way/.test(JS) && /Only when both lines into the substation fall do all 30 homes go dark/.test(QMD), "page wording of the loop matches the model");
  ok(net.lines.filter(l => l.to === "S" || l.from === "S").map(l => l.id).sort().join() === "GS,NS", "two lines enter the substation");
}

// ---------------- model validation: the storm, the repair orders (tie rule: none needed, the best order is unique) and the measures
{
  const so = M.outage(net, set(faults.map(f => f.id))), g = M.groups(net, so);
  ok(so.homesDark === 26 && g.length === 3, `storm: ${so.homesDark} of 30 homes dark, for ${g.length} local reasons`);
  ok(g.map(x => x.cause + ":" + x.homes).join() === "FU2:6,R1:10,B2:10", "storm: the fuse on L2 (6), recloser R1 (10), the south breaker (10)");
  const fbStorm = (QMD.match(/Then a storm[\s\S]*?<\/table>/) || [""])[0];
  faults.forEach(f => ok(fbStorm.indexOf("<td>" + f.repair_h + " h") >= 0, `fallback lists the ${f.id} repair time (${f.repair_h} h)`));
  ok(/<td>Its fuse<\/td><td>6<\/td>/.test(fbStorm) && /<td>Recloser R1<\/td><td>10<\/td>/.test(fbStorm) && /breaker<\/td><td>10<\/td>/.test(fbStorm) && /loop<\/td><td>0<\/td>/.test(fbStorm), "fallback storm table matches the model");
  const bo = M.bestOrders(net, faults);
  ok(bo.all.length === 6 && M.crewFaults(faults).join() === "L2,F1B,F2A", "six orders of the three local faults; the loop line has its own crew");
  ok(bo.best.length === 1 && bo.best[0].order.join() === "F1B,L2,F2A" && bo.min === 10200, `the best order is unique: ${bo.best.map(r => r.order.join(">")).join(" | ")}, ${bo.min} customer-minutes`);
  bo.all.forEach(r => {
    // customer-minutes recomputed by hand: each home waits until every fault above it is repaired
    const done = r.done; let cm = 0;
    net.sections.forEach(s => { if (!s.homes) return; const ups = M.chainUp(net, s.id).filter(a => done[a] != null); if (ups.length) cm += s.homes * 60 * Math.max.apply(null, ups.map(a => done[a])); });
    ok(cm === r.customerMinutes && r.interrupted === 26, `order ${r.order.join(">")}: ${r.customerMinutes} customer-minutes, 26 interrupted`);
  });
  // "fix the most homes per hour of work first": the best order sorts the faults by homes ÷ repair hours
  const rate = id => M.below(net, id).reduce((a, x) => a + net.sections.find(s => s.id === x).homes, 0) / faults.find(f => f.id === id).repair_h;
  ok(bo.best[0].order.every((id, i, a) => i === 0 || rate(a[i - 1]) >= rate(id)), "the best order is the most-homes-per-hour order");
  const m = M.reliability(bo.min, 26, 30);
  ok(m.saidi === 340 && fmt(m.saifi, 2) === "0.87" && near(m.caidi, 340 / (26 / 30)), `storm SAIDI 340 min, SAIFI ${fmt(m.saifi, 2)}`);
  ok(QMD.indexOf("10,200 ÷ 30 = 340 minutes") >= 0 && QMD.indexOf("26 ÷ 30 = 0.87") >= 0 && QMD.indexOf("for 10,200 customer-minutes") >= 0, "fallback states the storm's numbers as the model computes them");
  ok(/north feeder's far half, then Oak Street, then the south feeder/.test(QMD), "fallback names the best order");
  ok(/every hour a home waits adds 60 \[\[customer-minutes/.test(JS), "an hour of one home is 60 customer-minutes");
}

// ---------------- model validation: SAIFI counts customer interruptions; a faster crew changes SAIDI, not SAIFI (step 7)
{
  const bo = M.bestOrders(net, faults);
  // SAIFI's numerator is customer interruptions (a home dark twice counts twice). In this storm every fault strikes at hour 0
  // and repairs only restore, so no home goes dark twice: the interruptions equal the 26 distinct homes, in every order.
  bo.all.forEach(r => ok(r.interruptions === 26 && r.interrupted === 26, `order ${r.order.join(">")}: 26 customer interruptions = 26 homes interrupted`));
  bo.all.forEach(r => ok(r.steps.every((st, i) => i === 0 || st.homes <= r.steps[i - 1].homes), `order ${r.order.join(">")}: homes dark never rise after the storm (so none is interrupted twice)`));
  ok(/if \(!prev\[s\.id\]\) interruptions \+= s\.homes/.test(JS), "restore() counts a home each time it goes from lit to dark, not once per storm");
  // step 7's claim, proved for every order: halving every repair time halves SAIDI and leaves SAIFI as it was
  bo.all.forEach(r => {
    const f = M.restore(net, M.faster(faults, 2), r.order), a = M.reliability(r.customerMinutes, r.interruptions, 30), b = M.reliability(f.customerMinutes, f.interruptions, 30);
    ok(near(b.saidi, a.saidi / 2) && b.saifi === a.saifi, `order ${r.order.join(">")}: a crew twice as fast gives SAIDI ${a.saidi} -> ${b.saidi} min, SAIFI ${fmt(a.saifi, 2)} unchanged`);
  });
  ok(faults.every((f, i) => M.faster(faults, 2)[i].repair_h === f.repair_h / 2) && faults[0].repair_h === 2, "faster() halves copies and leaves the storm data alone");
  ok(/SAIFI stays " \+ fmtN\(mf\.saifi, 2\)/.test(JS) && /answer: "saidi"/.test(JS) && /A crew twice as fast halves SAIDI; SAIFI stays the same\./.test(QMD), "step 7 and the fallback say what the model shows");
  ok(/customer interruptions ÷ customers served, and a customer interrupted twice counts twice/.test(QMD) && /total customer interruptions divided by customers served, so a customer interrupted twice counts twice/.test(SIDE), "SAIFI's definition counts repeat interruptions (explain layer and glossary)");
}

// ---------------- model validation: the network's text version and its words (review F6 #5, #6, #9)
{
  const S = Object.fromEntries(net.sections.map(s => [s.id, s]));
  const cases = [[], faults.map(f => f.id), ["XF"], ["GS", "NS"], ["GN"]].concat(net.sections.map(s => [s.id]));
  cases.forEach(c => {
    const f = set(c), o = M.outage(net, f), rows = M.netRows(net, f);
    ok(rows.length === net.lines.length + 1 + net.sections.length, `text version [${c.join(",") || "none"}]: one row per part`);
    rows.forEach(r => {
      const served = S[r.id] ? M.below(net, r.id).map(x => S[x]) : net.sections;
      const want = served.filter(x => o.dark[x.id]).reduce((a, x) => a + x.homes, 0);
      ok(r.dark === want && r.serves === served.reduce((a, x) => a + x.homes, 0) && r.dark <= r.serves, `text version [${c.join(",") || "none"}] ${r.id}: ${r.dark} of ${r.serves} dark, counted downstream like every other row`);
    });
    const gs = M.groups(net, o);
    ok(gs.reduce((a, g) => a + g.homes, 0) === o.homesDark, `text version [${c.join(",") || "none"}]: the causes add up to ${o.homesDark} dark homes`);
    gs.forEach(g => { const t = M.causeText(net, g); ok(words(t) <= 12 && sentences(t) === 1, `cause line: ${t}`); });
    c.forEach(id => { const t = M.why(net, f, id); ok(words(t) <= 40 && sentences(t) <= 2, `reason for ${id} within budget (${words(t)} words): ${t.slice(0, 60)}`); });
  });
  const storm = M.netRows(net, set(faults.map(f => f.id))), xf = storm.find(r => r.id === "XF");
  ok(xf.dark === 26 && xf.serves === 30 && storm.filter(r => r.all).every(r => r.dark === 26), "storm: the transformer and loop rows read 26 of 30 dark, matching the 26 dark homes");
  ok(M.groups(net, M.outage(net, set(faults.map(f => f.id)))).map(g => M.causeText(net, g)).join(" | ") === "Fuse on L2 opened: 6 homes dark. | Recloser R1 opened: 10 homes dark. | South feeder's breaker opened: 10 homes dark.", "storm: the text version lists the three causes");
  ok(/which we assume can carry it/.test(M.why(net, set(["GN"]), "GN")) && /Protection here is set so the closest device upstream opens first/.test(M.why(net, set(["L2"]), "L2")), "the reasons state the loop and protection assumptions");
}

// ---------------- the real U.S. reliability numbers (EIA Table 11.1) and the claims about them
{
  ok(rows.length === 11 && rows[0].year === 2015 && last.year === 2025, "EIA rows 2015 to 2025");
  rows.forEach(r => ok(r.saidi > r.saidi_nomed && r.saifi > r.saifi_nomed, `${r.year}: all events above without MED`));
  ok(rows.every(r => r.saidi_nomed >= 110 && r.saidi_nomed <= 135), "without major event days: 116 to 131.6 minutes every year, 'near two hours'");
  const run = M.medRun(rows);
  ok(run.from === 2016 && run.to === 2025 && run.before.year === 2015 && rows.filter(r => r.year >= 2016).every(r => M.medShare(r) > 0.5) && M.medShare(R[2015]) < 0.5, "major event days: over half of SAIDI in every year 2016-2025, not in 2015");
  ok(M.medRunText(rows) === "Major event days, mostly storms, gave more than half of each year's minutes from 2016 to 2025 (2015: 44%). Elsewhere, and in other years, the ranking of causes can differ.", "the run sentence");
  ok(fmt(100 * M.medShare(R[2025])) === "53" && fmt(100 * M.medShare(R[2024])) === "80" && D.year2024.med_share_pct === 80, "2025: 53% from major event days; 2024: 80%, as EIA's Today in Energy says");
  ok(near(R[2024].saidi / 60, D.year2024.hours, 0.05), `2024: ${R[2024].saidi} min = ${(R[2024].saidi / 60).toFixed(2)} h, EIA's '11 hours'`);
  ok(fmt(R[2025].saidi / R[2025].saifi) === "201", "CAIDI 2025: 269.2 ÷ 1.34 = 201 minutes (EIA's table: 201)");
  // the Analyst box's table states the data's values
  [["SAIDI, all events", "saidi", " min"], ["SAIDI without major event days", "saidi_nomed", " min"], ["SAIDI, loss of supply removed", "saidi_nolos", " min"], ["SAIFI, all events", "saifi", ""], ["SAIFI without major event days", "saifi_nomed", ""]].forEach(([lab, k, u]) => {
    const want = "| " + lab + " | " + R[2024][k] + u + " | " + R[2025][k] + u + " |";
    ok(QMD.indexOf(want) >= 0, `Analyst table row: ${want}`);
  });
  ok(/" columns: " \+ fmtN\(last\.saidi, 1\) \+ " minutes for all events, " \+ fmtN\(last\.saidi_nolos, 1\) \+ " with outages from lost high-voltage supply removed\. The two columns can cover different utilities, so the gap does not measure upstream failures\."/.test(JS), "step 8 reads the loss-of-supply numbers from the data and says the gap is not the upstream share (review F6 #3)");
  ok(R[2020].saidi_nolos > R[2020].saidi, "2020: the loss-of-supply-removed column exceeds all events, so the two columns cover different groups (the Analyst box says so)");
  ok(/\*\*Loss of supply\.\*\* That column can cover a different group of utilities \(its 2020 value is above all events\)/.test(QMD), "the Analyst box warns about the loss-of-supply column");
  ok(!/\b8%|8 ?percent/.test(JS + QMD.replace(/<!--[\s\S]*?-->/g, "")), "no loss-of-supply share stated (the column's 2020 value exceeds all events: populations differ)");
  ok(B3.uri.peakShedMW === 20000 && B3.uri.customersMillion === 4.5 && /U\.peakShedMW/.test(JS), "Texas 2021: 20,000 MW ordered off, from lesson 3's data (FERC-NERC)");
  ok(/ferc\.gov[^"]*Cold%20Weather[^"]*">The February 2021 Cold Weather Outages[^<]*<\/a> \(PDF\)\. 20,000 MW of customer demand ordered off, p\. 9/.test(QMD) && /p\. 9 \(20,000 MW\)/.test(B3.uri.source), "the 20,000 MW cites the FERC-NERC report, p. 9, as lesson 3's data does");
}

// ---------------- every number with a unit on the page comes from the model or the data
{
  const strip = s => s.replace(/^---[\s\S]*?\n---/, "").replace(/<!-- learn:(meta|next|footer):start[\s\S]*?learn:\1:end -->/g, "").replace(/<style>[\s\S]*?<\/style>/, "")
    .replace(/<!--[\s\S]*?-->/g, "").replace(/https?:\/\/[^\s"')]+/g, " ").replace(/\$\$[\s\S]*?\$\$/g, " ");
  const prose = strip(QMD).replace(/&amp;/g, "&");
  const V = D.voltages, T = D.town, L = D.losses, bo = M.bestOrders(net, faults), st = M.reliability(bo.min, 26, 30);
  const kv = [].concat([V.generator.lo, V.generator.hi], V.transmission.list, V.subtransmission.list, V.distribution.list, [T.genKV, T.txKV, T.distKV]).map(v => fmt(v, v % 1 ? (String(v).split(".")[1].length) : 0) + " kV");
  const allowed = new Set(kv.concat([
    "240/120 V", "120 V", "240 V", "34 kV",
    L.P_MW + " MW", fmt(M.loss(L.P_MW, 69, L.R_ohm).pct, 1) + "%", fmt(M.loss(L.P_MW, 345, L.R_ohm).pct, 2) + "%", L.real_pct + "%", D.distribution_share.pct + "%",
    "10,200 customer-minutes", "36,000 customer-minutes", Math.round(B3.uri.peakShedMW).toLocaleString("en-US") + " MW", st.saidi + " minutes", "3.6 minutes", "36 minutes", "90 minutes", "0.04 minutes", "201 minutes",
    "269.2 minutes", "125.3 minutes", fmt(R[2025].saidi, 1) + " min", fmt(R[2025].saidi_nomed, 1) + " min", fmt(R[2024].saidi, 1) + " min", fmt(R[2024].saidi_nomed, 1) + " min",
    fmt(R[2024].saidi_nolos, 1) + " min", fmt(R[2025].saidi_nolos, 1) + " min", "11 hours", "80%", "53%", "47%", "215%", "27%", "5 V", D.practice + " minutes",
    "2 h", "3 h", "6 h", "12 h"
  ]));
  const rx = /(\d[\d,]*(?:\.\d+)?)\s*(kV|V|MW|%|customer-minutes|minutes|min|hours|h)(?![\w-])/g;
  let m, n = 0;
  while ((m = rx.exec(prose))) {
    const t = m[1] + (/^(%)$/.test(m[2]) ? "" : " ") + m[2]; n++;
    ok(allowed.has(t), `page states "${t}": from the model or the data`);
  }
  ok(n >= 45, `${n} numbers with units on the page checked`);
  // the quiz's wrong options (47%, 27%, 215%, 5 V, 36 and 90 minutes) are distractors; their right answers are recomputed here
  ok(near(400 * 90 / 10000, 3.6) && near(400 / 10000, 0.04), "quiz: 400 × 90 ÷ 10,000 = 3.6 minutes; SAIFI share 0.04");
  ok(fmt(100 * (R[2025].saidi - R[2025].saidi_nomed) / R[2025].saidi) === "53", "quiz: (269.2 − 125.3) ÷ 269.2 = 53%");
  // the script never hard-codes a data number in its text; it reads them from the data
  const lits = [...JS.matchAll(/"((?:[^"\\\n]|\\.)*)"/g)].map(x => x[1]).join("\n");
  ok(!/\b(269\.2|125\.3|662\.6|10,200|20,000|345 kV|18 kV|12\.47|240\/120|90%|5%)/.test(lits), "the script's text never hard-codes a sourced or modelled number");
}

// ---------------- page structure, path.yml, glossary and the text budget
{
  const fm = QMD.match(/^---\n([\s\S]*?)\n---/)[1];
  const blk = PATH.slice(PATH.indexOf("id: f06-grid-and-outages"), PATH.indexOf("# ---------- wave W2 modules"));
  const sub = (blk.match(/subtitle: "([^"]+)"/) || [])[1];
  ok(sub && fm.indexOf('subtitle: "' + sub + '"') >= 0, "front-matter subtitle = path.yml subtitle");
  ok(/code: F6/.test(blk) && /minutes: 20/.test(blk) && /practice_minutes: 10/.test(blk) && /status: active/.test(blk) && /after: \[3\]/.test(blk) && /next: F7/.test(blk), "path.yml: F6, 20 + 10 min, active, after lesson 3, next F7 (set at the W3 integration, as the sidecar asked)");
  ok(!/add `next: F7`/.test(SIDE), "sidecar: its request for next: F7 is done (the line above) and gone from the build output (W5)");
  ok(/data-learn="grid-outages"/.test(QMD) && /id="f6-explain"/.test(QMD) && /LX\.mount\("grid-outages"/.test(JS) && /getElementById\("f6-explain"\)/.test(JS), "mount points match");
  ok((QMD.match(/class="lx-qq"/g) || []).length === 9, "practice: three myths and six questions");
  // glossary marks: every id used is defined in glossary.yml or this sidecar
  const ids = new Set([...GLOSS.matchAll(/^\s*-?\s*id: ([a-z0-9-]+)/gm)].map(x => x[1]).concat([...SIDE.matchAll(/- id: ([a-z0-9-]+)/g)].map(x => x[1])));
  const used = new Set([...(JS + JSON.stringify(D)).matchAll(/\[\[([a-z0-9-]+)\|/g)].map(x => x[1]).concat([...QMD.matchAll(/(?:data-term|term)="([a-z0-9-]+)"/g)].map(x => x[1])));
  used.forEach(u => ok(ids.has(u), `glossary id ${u} is defined`));
  ["generator", "turbine", "waste-heat", "fission"].forEach(t => ok(!/^\s*- id: /.test(SIDE) || SIDE.indexOf("- id: " + t + "\n") < 0, `F6 does not define ${t}`));
  [...SIDE.matchAll(/def: "([^"]+)"/g)].forEach(x => ok(sentences(x[1]) === 1, `glossary definition is one sentence: ${x[1].slice(0, 50)}`));
  // step texts: about 35 words, at most two sentences, no Markdown bold
  const steps = [...JS.matchAll(/^ {6}\{ text: "((?:[^"\\]|\\.)*)"/gm)].map(x => x[1]);
  ok(steps.length === 8, `${steps.length} step texts`);
  steps.forEach(t => { ok(words(t) <= 40 && sentences(t) <= 2, `step text within budget (${words(t)} words): "${t.slice(0, 50)}…"`); ok(t.indexOf("**") < 0, "no ** in step text"); });
  ok(words(M.medRunText(rows)) <= 40 && sentences(M.medRunText(rows)) <= 2, "the run sentence is within budget");
  // the "what you saw" lines, assembled as the reader sees them
  const L = D.losses, lo = M.loss(L.P_MW, L.classes_kV[0], L.R_ohm), hi = M.loss(L.P_MW, L.classes_kV[4], L.R_ohm);
  const saw2 = "At " + L.classes_kV[0] + " kV the line loses **" + fmt(lo.pct, 1) + "%**; at " + L.classes_kV[4] + " kV, five times higher, only **" + fmt(hi.pct, 2) + "%**, one twenty-fifth. All U.S. lines and wires together lose about " + L.real_pct + "% (EIA, " + L.real_years + ").";
  ok(words(saw2) <= 45 && sentences(saw2) <= 2, `loss feedback within budget (${words(saw2)} words)`);
  ok(JS.indexOf('kV, five times higher, only **"') > 0, "loss feedback is assembled as tested");
  // the no-JS fallback carries the key numbers and tables
  const fb = QMD.match(/<div class="lx-fallback">[\s\S]*?lx-hint/)[0];
  ["5–34.5 kV", "115–765 kV", "240/120 V", "10.5%", "0.42%", "about 5%", "10,200", "340 minutes", "0.87", "269.2 minutes", "1.34", "125.3 minutes", "Over 90%"].forEach(s => ok(fb.indexOf(s) >= 0, `fallback states "${s}"`));
  ok((fb.match(/<table/g) || []).length === 2, "fallback: two tables (the path, the storm)");
}

// ---------------- the page on a stub document: the storm's text version, step 7's question and every supporting element's
// text budget, as the reader sees them (review F6 #6 and #8)
{
  const vm = require("vm");
  const { env, load } = require("./stubdom.js");
  const E = env();
  E.LX.fmt = { int: v => Math.round(v).toLocaleString("en-US") };
  E.LX.visible = () => false; E.LX.ready = () => {}; E.LX.progress.guess = () => null;
  E.LX.lessonRefHTML = require(path.join(SITE, "assets/learn/components/core.js")).lessonRefHTML;
  ["cards", "predict", "controls", "plot"].forEach(n => load(n, E));
  let init = null, cards = null;
  E.LX.mount = (slug, f) => { if (slug === "grid-outages") init = f; };
  E.LX.demo = (root, fn, c) => { cards = c; };
  vm.runInNewContext(JS, { window: E.window, document: E.document, location: E.location, navigator: {}, console, module: { exports: {} }, setTimeout: () => 0, clearTimeout: () => {} });
  const root = E.LX.H("div", { class: "lx-interactive", "data-learn": "grid-outages" }, E.body), live = E.LX.H("div", { class: "lx-live" }, root);
  let threw = null;
  try { init(live, { f06_grid_and_outages: D, "03_balancing": B3, path: JSON.parse(rd("assets/learn/data/path.json")) }, root); } catch (e) { threw = e.stack; }
  ok(!threw && cards && cards.count === 8, "the lesson mounts on the stub document" + (threw ? ": " + threw : ""));
  if (!threw && cards) {
    const card = () => cards.el, txt = e => e.textContent.replace(/\s+/g, " ").trim();
    const budget = (where, t, w) => ok(words(t) <= (w || 40) && sentences(t) <= 2, `${where}: within budget (${words(t)} words, ${sentences(t)} sentences): "${t.slice(0, 70)}…"`);
    const supporting = where => card().querySelectorAll(".lx-step-text, .lx-hint, .f6y-p, .f6n-why, .f6p-what, .lx-saw, .lx-predict-out p").forEach(e => { const t = txt(e); if (t) budget(where, t); });
    // step 5, the storm: the text table counts the dark homes the same way on every row, and names the causes
    cards.go(4);
    const rows = card().querySelectorAll(".f6n-alt tbody tr").map(r => r.querySelectorAll("td").map(txt));
    const row = name => rows.find(r => r[0] === name) || [];
    ok(rows.length === 13, `storm text table: ${rows.length} rows`);
    ok(row("The substation transformer").join(" | ") === "The substation transformer | working | all 30 | 26", "storm text table: the transformer serves all 30 and 26 of them are dark: " + row("The substation transformer").join(" | "));
    ok(row("The plant–grid line").join(" | ") === "The plant–grid line | failed | all 30 | 26" && row("Lateral L2 (Oak Street)").join(" | ") === "Lateral L2 (Oak Street) | failed | 6 | 6" && row("Lateral L1 (Elm Street)")[3] === "0", "storm text table: the loop line, Oak Street and Elm Street rows");
    ok(card().querySelectorAll(".f6n-why-list li").map(txt).join(" | ") === "Fuse on L2 opened: 6 homes dark. | Recloser R1 opened: 10 homes dark. | South feeder's breaker opened: 10 homes dark.", "storm text version: why homes are dark");
    supporting("step 5");
    // step 4: the loop assumption sits beside the network
    cards.go(3);
    ok(card().querySelectorAll(".lx-hint").some(e => /assumed able to carry the load\. Real grids also check each line's loading and operating limits\./.test(txt(e))), "step 4: the loop's assumption is stated beside the interaction");
    supporting("step 4");
    // step 2: the readout's current is per wire, three-phase
    cards.go(1);
    ok(card().querySelectorAll(".lx-readout").some(e => /Current in each wire\s*167 A/.test(txt(e))), "step 2: 345 kV shows 167 A in each wire");
    supporting("step 2");
    // step 6: an order is chosen; its feedback stays within budget
    cards.go(5);
    ["North feeder's far half", "Oak Street (L2)", "South feeder"].forEach(n => { const b = card().querySelectorAll("button.f6r-b").find(x => txt(x).indexOf(n) === 0); if (b) b.click(); });
    ok(/That is the best order: 10,200 customer-minutes/.test(txt(card())), "step 6: the best order is recognised");
    supporting("step 6");
    // step 7: the worked SAIDI and SAIFI, then the question; the answer reveals the model's numbers
    cards.go(6);
    const eqs = card().querySelectorAll(".f6m-eq p").map(txt);
    ok(eqs[0] === "10,200 customer-minutes ÷ 30 customers = 340 minutes" && eqs[1] === "26 interruptions ÷ 30 customers = 0.87", "step 7: the worked SAIDI and SAIFI: " + eqs.join(" | "));
    const next = () => card().querySelectorAll(".lx-step-foot button")[1];
    ok(next().disabled, "step 7: Next waits for an answer");
    card().querySelectorAll(".lx-choice").find(b => /SAIFI only/.test(txt(b))).click();
    ok(/Not quite\..*SAIDI falls from 340 to 170 minutes, SAIFI stays 0\.87\./.test(txt(card().querySelector(".lx-predict-out"))) && !next().disabled, "step 7: a wrong pick gets the model's numbers, and Next opens");
    supporting("step 7");
    // step 8: one takeaway, the source and three short paragraphs, each its own element
    cards.go(7);
    const ps = card().querySelectorAll(".f6y-p").map(txt);
    ok(ps.length === 3 && /^EIA's 2025 columns: 269\.2 minutes for all events, 246\.8 with/.test(ps[1]) && /lesson 3/.test(ps[2]) && /20,000 MW/.test(ps[2]), "step 8: the prediction, the EIA columns and the Texas link are separate paragraphs");
    supporting("step 8");
    cards.go(0); supporting("step 1");
    cards.go(2); supporting("step 3");
  }
  // the data note's rows and the no-JS summary's items, each one idea
  const note = (QMD.match(/<div class="lx-datanote f6-note">[\s\S]*?<\/ul><\/div>/) || [""])[0];
  const li = h => [...h.matchAll(/<li>([\s\S]*?)<\/li>/g)].map(x => x[1].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").trim());
  ok(li(note).length === 4, `data note: ${li(note).length} labelled rows`);
  li(note).forEach(t => ok(words(t) <= 35 && sentences(t) <= 2, `data note row within budget (${words(t)} words): ${t.slice(0, 50)}`));
  const fbl = (QMD.match(/<\/table><\/div>\s*<ul>[\s\S]*?<\/ul>/) || [""])[0];
  ok(li(fbl).length === 4, "no-JS summary: four items");
  li(fbl).forEach(t => ok(words(t) <= 46 && sentences(t) <= 3, `no-JS summary item within budget (${words(t)} words): ${t.slice(0, 50)}`));
  const dd = [...QMD.matchAll(/<dd>([\s\S]*?)<\/dd>/g)].map(x => x[1].replace(/<[^>]+>/g, ""));
  ok(dd.length === 6, "explain fallback: six ideas");
  dd.forEach(t => ok(words(t) <= 35 && sentences(t) <= 2, `explain idea within budget (${words(t)} words): ${t.slice(0, 50)}`));
}

// ---------------- scope: deny-list, no nuclear technology, no data centers, links on the allow-list
{
  const deny = [/\bFOAK\b/i, /\bNOAK\b/i, /first[- ]of[- ]a[- ]kind/i, /nth[- ]of[- ]a[- ]kind/i, /learning[- ](curve|rate)/i, /order[- ]book/i, /anchor[- ](customer|buyer)/i,
    /subsidy[- ]free/i, /parity capital/i, /break[- ]even capital/i, /smr-dc/i, /smr-datacenter/i, /projects\//i, /research\.(html|qmd)/i, /\bAI\b/, /artificial intelligence/i, /ChatGPT|Claude/, /generated by/i];
  const page = QMD.replace(/<!-- learn:meta:start[\s\S]*?learn:meta:end -->/, "").replace(/<style>[\s\S]*?<\/style>/, "").replace(/<!--[\s\S]*?-->/g, "");
  const lits = [...JS.matchAll(/"((?:[^"\\\n]|\\.)*)"/g)].map(x => x[1]);
  const vals = []; (function walk(o) { if (typeof o === "string") vals.push(o); else if (o && typeof o === "object") Object.values(o).forEach(walk); })(D);
  const visible = [page.replace(/<[^>]+>/g, " ")].concat(lits, vals, [SIDE]).join("\n");
  deny.forEach(r => ok(!r.test(visible), `scope: no ${r}`));
  ok(!/nuclear|reactor|\bSMR\b|small modular/i.test(visible), "F6 names no nuclear technology at all (so the nuclear-plus-risk rule cannot be met)");
  ok(!/data[- ]cent/i.test(visible), "F6 names no data center");
  const own = QMD.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?learn:\1:end -->/g, "");
  const ALLOW = /^(https:\/\/(www\.)?(eia\.gov|energy\.gov|ferc\.gov)\/|#|\.\.\/assets\/|[0-9a-z-]+\.(qmd|html)(#[a-z0-9-]*)?$)/;
  let nl = 0;
  for (const h of own.matchAll(/href="([^"]+)"|\]\(([^)]+)\)|src="([^"]+)"/g)) { const u = (h[1] || h[2] || h[3]).replace(/&amp;/g, "&"); nl++; ok(ALLOW.test(u), `link on the allow-list: ${u}`); }
  ok(nl >= 25, `${nl} links checked`);
  ["03-balancing.html", "f01-five-scales.html", "m01-dispatch-to-lmp.html"].forEach(p => ok((own.indexOf('href="' + p + '"') >= 0 || own.indexOf("](" + p + ")") >= 0) && fs.existsSync(path.join(SITE, "learn", p.replace(/\.html$/, ".qmd"))), `links back to the live ${p}`));
  ok(/\[A17\]\(a17-physical-feasibility\.qmd\)/.test(QMD) && /\[A9\]\(a09-hazards\.qmd\)/.test(QMD) && /href="a17-physical-feasibility\.html"/.test(QMD) && !/A(9|17),? \(?upcoming/.test(QMD), "A9 and A17 linked, now that they are live (W4 integration)");
  ok(/LX\.lessonRefHTML\(P, 3\)/.test(JS) && /data\/path\.json/.test((QMD.match(/data-learn="grid-outages"[^>]*/) || [""])[0]), "the script links lesson 3 through path.json");
  ok(!/collaborat|Lambda|Henryutd2021/.test(visible), "no collaborator, workstation or repository names");
}

// ---------------- the rendered page (only when _site holds a render newer than the source; run after quarto render)
{
  const html = path.join(SITE, "_site/learn/f06-grid-and-outages.html");
  if (fs.existsSync(html) && fs.statSync(html).mtimeMs >= fs.statSync(path.join(SITE, "learn/f06-grid-and-outages.qmd")).mtimeMs) {
    const H = fs.readFileSync(html, "utf8");
    ["115–765 kV", "4.8–34.5 kV", "240/120 V", "269.2 min", "125.3 min", "over 90%", "10,200 customer-minutes", "26 ÷ 30 = 0.87"].forEach(s => ok(H.indexOf(s) >= 0, `rendered page states "${s}"`));
    ok(/data-learn="grid-outages"/.test(H) && /id="f6-explain"/.test(H) && (H.match(/class="lx-qq"/g) || []).length === 9, "rendered page: mount points and the nine practice items");
    ok(!/\[\[[a-z0-9-]+\|/.test(H.replace(/<script[\s\S]*?<\/script>/g, "")), "rendered page: no raw glossary marks outside scripts");
  } else console.log("note: rendered page not checked (no _site render newer than the source)");
}

console.log(`${checks} checks, ${fails} failed`);
process.exit(fails ? 1 : 0);
