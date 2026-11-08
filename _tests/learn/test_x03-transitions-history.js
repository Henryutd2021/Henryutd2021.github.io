// test_x03-transitions-history.js — Node tests for lesson X3 (assets/learn/x03-transitions-history.js, its data file and
// the page, learn/x03-transitions-history.qmd):
//   - every curve's points are shares (0 to 100), in year order, each with a source in the file; solar's share is
//     recomputed here from EIA's table (utility-scale plus small-scale, our arithmetic), and the table's own parts add up
//   - every reveal true against the data: the 90% bracket and the guess's answer, the towns-and-farms gap, gas passing
//     coal between two censuses, the car and solar lines; no year is interpolated between published points
//   - the timeline, the sort and the debate: dated, sourced, read from abstracts where they are papers
//   - the no-JS block, ideas, stop box, check, facts and sources equal what the model writes (--write rewrites them)
//   - scope (the depth budget and the course's scope rules): diffusion only, no cost curve of any technology, no forecast of future speed; no
//     nuclear term, no "AI", links on the allow-list, no project or Research page
//   - text budget of the step cards, reveals and the page's prose
// Usage (from the site folder):  node _tests/learn/test_x03-transitions-history.js [--write]
"use strict";
const fs = require("fs");
const path = require("path");
const ID = "x03-transitions-history";
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const M = require(L(ID + ".js"));
const S = require("./shelf_stop.js");
const TL = require(L("components/timeline.js"));
const RAW = fs.readFileSync(L("data/" + ID + ".json"), "utf8");
const D = JSON.parse(RAW);
const JS = fs.readFileSync(L(ID + ".js"), "utf8");
const SIDE = fs.readFileSync(path.join(SITE, "learn/_w1/" + ID + ".yml"), "utf8");
const PATHY = fs.readFileSync(path.join(SITE, "learn/path.yml"), "utf8");
const QPATH = path.join(SITE, "learn", ID + ".qmd");
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-9 : t);

// ---------------- the generated blocks
const BLOCKS = { "x03-fallback": () => M.staticFallback(D), "x03-ideas": () => M.ideasHTML(D), "x03-timeline": () => TL.staticHTML(M.timelineEvents(D)), "x03-stop": () => S.stopHTML(D.stop, "x03"), "x03-check": () => M.checkHTML(D),
  "x03-facts": () => M.factsHTML(D), "x03-sources": () => M.sourcesHTML(D) };
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

// ---------------- the curves: shares, in order, sourced
D.series.forEach(s => {
  const p = M.pts(D, s.key);
  ok(p.length >= 6 && p.every(q => q[1] >= 0 && q[1] <= 100) && p.every((q, i) => i === 0 || q[0] > p[i - 1][0]), s.key + ": shares in year order (" + p.length + " points)");
  ok(D.sources[s.src] && s.where && s.measure && s.label && s.short && s.color, s.key + ": a source, a place in it, a measure and a label");
  ok(p.every(q => q[0] >= M.X.min && q[0] <= M.X.max), s.key + ": inside the chart's years");
});
ok(D.series.map(s => s.key).join() === "elec,nonfarm,farm,gas,coal,cars,solar", "seven curves: electric service (all, town, farm), gas and coal heating, cars, solar");
// the transcribed points that the page states (Census Bureau, Historical Statistics 1975, p. 827; housing censuses; Q 175)
ok(M.at(D, "elec", 1907) === 8.0 && M.at(D, "elec", 1945) === 85.0 && M.at(D, "elec", 1950) === 94.0, "S 109: 8.0% (1907), 85.0% (1945), 94.0% (1950)");
ok(M.at(D, "nonfarm", 1920) === 47.4 && M.at(D, "nonfarm", 1925) === 69.4 && M.at(D, "farm", 1945) === 48.0 && M.at(D, "farm", 1950) === 77.7, "S 110 and S 111 at the half-way points");
ok(M.at(D, "gas", 1940) === 11.3 && M.at(D, "gas", 1970) === 55.2 && M.at(D, "coal", 1940) === 54.7 && M.at(D, "coal", 1970) === 2.9 && M.at(D, "gas", 1950) === 26.6 && M.at(D, "coal", 1950) === 34.6 && M.at(D, "gas", 1960) === 43.1 && M.at(D, "coal", 1960) === 12.2, "house heating fuel, national rows 1940-1970");
ok(/the 1940 figure also counts bottled gas, so 1940 is not like for like/.test(D.series[3].measure) && /in 1940 utility gas includes bottled gas/.test(D.sources["census-fuels"].where), "the 1940 gas figure's coverage is said");
ok(M.first(D, "cars")[0] === 1948 && M.first(D, "cars")[1] === 54 && M.last(D, "cars")[1] === 82 && /Alaska and Hawaii are left out/.test(D.series[5].measure), "Q 175: 54% (1948) to 82% (1970), Alaska and Hawaii left out");
ok(/coke \(a fuel made by baking coal\)/.test(D.series[4].measure) && /piped gas \(the census's utility gas\)/.test(D.series[3].measure), "coke explained; utility gas called piped gas, with the census's name kept");
// which main heating fuel was most common: gas and coal from the curves, the other fuels from the same national rows
["1950", "1960"].forEach(y => { const o = D.heatOthers.rows[y], tot = M.at(D, "gas", +y) + M.at(D, "coal", +y) + Object.values(o).reduce((a, b) => a + b, 0); ok(Math.abs(tot - 100) <= 0.2, y + ": the national row's fuels add to 100% (" + tot.toFixed(1) + ", rounding)"); });
ok(M.mostCommon(D, 1950) === "coal" && M.mostCommon(D, 1960) === "gas" && D.heatOthers.rows["1950"].oil === 22.6 && D.heatOthers.rows["1960"].oil === 32.4 && /fuel oil and kerosene 22\.6% \(1950\) and 32\.4% \(1960\)/.test(D.sources["census-fuels"].where), "coal was the most common main heating fuel in 1950 and piped gas in 1960 (fuel oil 22.6% and 32.4%)");
// solar from first principles
D.solarRaw.rows.forEach((r, i) => {
  const u = D.solarRaw.utility[i];
  ok(u[0] === r[0] && near(u[1] + r[2], r[3], 1), r[0] + ": utility-scale solar + small-scale PV = EIA's estimated total solar (within 1 thousand MWh)");
  ok(near(M.solarPts(D)[i][1], 100 * r[3] / (r[1] + r[2])), r[0] + ": solar's share recomputed");
});
ok(M.pct(M.first(D, "solar")[1]) === "1.0%" && M.pct(M.last(D, "solar")[1]) === "8.7%", "solar 1.0% (2015) and 8.7% (2025)");
ok(near(M.last(D, "solar")[1], 100 * 393343 / (4425029 + 93041), 1e-9), "2025's share: 393,343 ÷ (4,425,029 + 93,041)");

// ---------------- every reveal true
{
  const N = M.nineTenths(D);
  ok(N.b.before[0] === 1945 && N.b.after[0] === 1950 && N.lo === 38 && N.hi === 43, "90% passed between 1945 and 1950: 38 to 43 years after 1907");
  ok(D.guess.ticks[M.guessAnswer(D)] === "About 40 years" && D.guess.years.every(y => Math.abs(y - N.mid) >= Math.abs(40 - N.mid)), "the guess's answer is the nearest tick: about 40 years");
  D.guess.ticks.forEach((t, g) => { const l = M.guessLine(D, g); ok(l.indexOf(g === M.guessAnswer(D) ? "Yes: " : "Not quite: ") === 0 && l.indexOf("between 1945 (85.0%) and 1950 (94.0%)") > 0, "guess line true for '" + t + "'"); });
  ok(/^In 1907, 8% of U\.S\. homes/.test(M.STEPS[0]) && M.first(D, "elec")[0] === 1907 && M.first(D, "elec")[1] === 8, "step 1's 8% in 1907 is the series' first point");
  const H = M.halfGap(D);
  ok(H.town.before[0] === 1920 && H.town.after[0] === 1925 && H.farm.before[0] === 1945 && H.farm.after[0] === 1950 && H.gap === 25, "town homes passed half 1920-1925, farms 1945-1950: 25 years apart");
  ok(M.farmLine(D) === "Town and other non-farm homes passed half between 1920 and 1925; farm homes between 1945 and 1950, about 25 years later.", "step 2 line");
  const ck = M.checkHTML(D);
  ok(/Farm homes and town homes passed half with electric service at about the same time/.test(ck) && /about 25 years later \(Census Bureau\)/.test(ck) && !/about as fast/.test(ck + RAW + JS), "the myth asks when each passed half (a delay), not how fast each moved");
  ok(M.GUESS_SAW === "From 8% of homes in 1907, electric service took roughly four more decades to pass 90%." && M.first(D, "elec")[0] === 1907 && N.mid > 35 && N.mid < 45, "step 1's takeaway counts from 8% in 1907, not from electricity's start");
  const P = M.passes(D, "gas", "coal");
  ok(P.before === 1950 && P.after === 1960, "gas passed coal between the 1950 and 1960 censuses");
  ok(M.heatLine(D).indexOf("Gas overtook coal as the most common main heating fuel between the 1950 and 1960 censuses.") > 0 && M.heatLine(D).indexOf("54.7%") > 0 && M.heatLine(D).indexOf("55.2%") > 0, "step 3 line");
  ok(/do not track homes switching/.test(M.HEAT_NOTE) && /Other fuels/.test(M.HEAT_NOTE) && /HEAT_NOTE \}, act\)/.test(JS) && /do not track homes switching/.test(M.ideasHTML(D)) && !/rise was another's fall|replaced coal|rise is also a fall/.test(RAW + JS + M.ideasHTML(D)), "gas overtaking coal is not read as homes switching from one to the other");
  ok(M.carLine(D) === "Families owning a car: 54% in 1948, 82% in 1970. Registered cars rose from 0.46 million in 1910 to 23.0 million in 1930.", "step 4 line (Q 175 and Q 153)");
  ok(/starts only in 1948/.test(M.STEPS[3]), "step 4 says when the household series starts");
  ok(M.solarLine(D).indexOf("1.0% of U.S. electricity in 2015 and 8.7% in 2025") > 0 && /our arithmetic/.test(M.solarLine(D)), "step 5 line, labelled as our arithmetic");
  ok(/not how fast the next one will/.test(M.SOLAR_SAW), "step 5 says the chart is history, not a forecast");
  ok(/almost half of farms had power by 1942, against 11% in 1932/.test(M.FARM_SAW) && /almost half of American farms had electricity, compared with 11 percent in 1932|1942, almost half of farms had electricity, against 11% in 1932/.test(D.sources["eia-kids-elec"].where), "step 2's EIA fact matches its source line");
  ok(/1950s and 1960s/.test(M.HEAT_SAW) && /1950s and 1960s/.test(D.sources["eia-pipelines"].where) && /EIA reported in March 2024/.test(M.HEAT_SAW) && /19 March 2024/.test(D.sources["eia-pipelines"].date), "step 3's pipeline fact matches its source line, dated where it is used");
  ok(!/today's mainline|mainline gas/.test(RAW.replace(/"where": "[^"]*"/g, "") + JS) && /long-distance gas pipeline network/.test(D.sort.cards.filter(c => c.id === "pipes")[0].why), "plain words: long-distance gas pipelines, not mainline");
  ok(!/utility gas/i.test(M.STEPS.join(" ") + M.heatLine(D) + M.ideasHTML(D) + D.timeline.map(e => e.text).join(" ") + D.facts.map(f => f.what).join(" ")), "the page says piped gas (the census's utility gas only in its measure and source)");
  // no year between published points: every year the reveals print is a published point's year
  const yrs = [M.guessLine(D, 2), M.farmLine(D), M.heatLine(D), M.carLine(D), M.solarLine(D)].join(" ").match(/\b(1[89]\d\d|20\d\d)\b/g).map(Number);
  const published = new Set([].concat(...D.series.map(s => M.pts(D, s.key).map(q => q[0])), [1910, 1930]));
  ok(yrs.every(y => published.has(y)), "every year in a reveal is a published point (" + yrs.filter(y => !published.has(y)).join(", ") + ")");
}

// ---------------- the chart spec and its text version
{
  const sp = M.spec(D, ["elec", "solar"], false);
  ok(sp.lines.length === 2 && sp.text.rows.length === 2 && sp.text.rows[1][1].indexOf("2025: 8.7%") >= 0 && sp.legend.length === 2 && sp.y.max === 100, "spec: lines, legend and a text version with every point");
  ok(sp.text.head[2] === "What is counted" && sp.text.rows[1][2] === D.series[6].measure && M.counted(D, ["gas"])[0].measure === D.series[3].measure, "the text version and the note under the chart say what each curve counts");
  ok(/cnt\.hidden = !keys\.length/.test(JS) && /counted\(D, keys\)\.forEach/.test(JS), "the curve viewer lists what is counted for every curve shown");
  const all = M.pointsHTML(D);
  ok(D.series.every(s => M.pts(D, s.key).every(q => all.indexOf(q[0] + ": " + M.pct(q[1])) >= 0) && all.indexOf(s.measure) >= 0) && /<details class="lx-textalt">/.test(all) && M.staticFallback(D).indexOf(all) >= 0, "the no-JS block opens every plotted point, with what each curve counts");
  ok(M.spec(D, ["solar"], true).y.max === 10 && M.spec(D, ["solar"], true).x.min === 2014 && M.solarPts(D).every(q => q[0] >= M.XZ.min && q[0] <= M.XZ.max), "the zoom shows 0 to 10%, 2014 to 2025, every solar point inside");
  ok(M.X.max === 2025 && M.X.ticks[M.X.ticks.length - 1][1] === "2025", "the x axis ends at the latest data year, labelled truly");
  ok(D.series.every(s => s.dash === null || typeof s.dash === "string") && new Set(D.series.map(s => s.color)).size === D.series.length, "each curve its own colour; dashes too where colours are close");
}

// ---------------- the sort, the timeline, the debate
{
  ok(D.sort.cards.length === 5 && D.sort.cards.every(c => ["fast", "slow"].includes(c.bin) && c.why) && D.sort.cards.filter(c => c.bin === "slow").length === 2, "five reasons, three that sped and two that held back, each with a reason");
  ok(/Fouquet \(2010, abstract\)/.test(D.sort.cards.filter(c => c.id === "service")[0].why) && /cheaper or better energy services/.test(D.sources.fouquet2010.where), "the service card reads Fouquet's abstract");
  const rf = D.sort.cards.filter(c => c.id === "refine")[0];
  ok(rf && rf.bin === "slow" && /refined, gradually, until it could compete/.test(rf.text) && /small early markets willing to pay more let new sources be refined gradually/.test(rf.why) && /over 100 years/.test(rf.why) &&
     /a niche market willing to pay more let new sources be refined gradually until they could compete/.test(D.sources.fouquet2010.where) && /more than 100 years/.test(D.sources.fouquet2010.where), "the refining card reads Fouquet's abstract: small early markets enabled refinement, and refining took long");
  ok(!D.sort.cards.some(c => /niche/i.test(c.text + c.why)) && !/niche/i.test(M.ideasHTML(D)), "no card says a niche market held a source back (Fouquet: it enabled refinement)");
  const ev = M.timelineEvents(D);
  ok(TL.validate(ev).length === 0 || TL.validate(ev) === true || TL.validate(ev) == null, "timeline events valid (" + JSON.stringify(TL.validate(ev)).slice(0, 120) + ")");
  ok(D.timeline.every(e => D.sources[e.src]) && D.timeline.every((e, i) => i === 0 || e.date > D.timeline[i - 1].date), "timeline in order, each event sourced");
  ok(PAGE.indexOf("<!-- x03-timeline:start") > PAGE.indexOf('id="x03-explain"') && PAGE.indexOf("<!-- x03-timeline:start") < PAGE.indexOf("<!-- x03-stop:start") && /<ol class="lx-tl-static">/.test(TL.staticHTML(M.timelineEvents(D))), "the dated timeline is in the no-JS explain block");
  ok(D.timeline.filter(e => e.date === "1970")[0].text.indexOf("55.2%") > 0 && D.timeline.filter(e => e.date === "2025")[0].text.indexOf(M.pct(M.last(D, "solar")[1])) > 0, "the timeline's numbers match the curves");
  ok(D.debate.sides.length === 2 && D.debate.sides.every(s => D.sources[s.src] && /abstract/.test(D.sources[s.src].where)) && /takes no side/.test(D.debate.note), "the debate: both sides from abstracts, no verdict");
  ok(Object.values(D.sources).every(s => s.url && s.date && s.where && s.short && s.publisher && s.title) && Object.values(D.sources).every(s => /\b(1[89]|20)\d\d\b/.test(s.date) || /undated page; read/.test(s.date)), "every source complete and dated (or read on a date)");
  const used = new Set([].concat(D.series.map(s => s.src), D.timeline.map(e => e.src), D.facts.map(f => f.src), D.debate.sides.map(s => s.src), ["fouquet2010", "eia-pipelines", "grubler2012"]));
  ok(Object.keys(D.sources).every(k => used.has(k)), "every source is used on the page");
  ok(/Grubler \(2012, abstract\)/.test(PAGE), "Grubler (2012) cited from its abstract");
}

// ---------------- the stop box
ok(S.problems(D.stop).length === 0, "the stop box has its parts: " + S.problems(D.stop).join("; "));
ok(/diffusion, a share over time/.test(D.stop.lede) && D.stop.leaves.some(t => /cost of any technology/.test(t)) && D.stop.leaves.some(t => /Forecasts/.test(t)), "the stop box states the curriculum's boundary (diffusion only; no cost curves, no forecasts)");
ok(/Energy and Civilization/.test(RAW) && /Energy Transitions: Global and National Perspectives/.test(RAW) && /ourworldindata\.org\/energy/.test(RAW), "the reading ladder is the curriculum's (its read-next list)");
// the stop box's and the timeline's parts are budgeted one by one above (each event: date, label, text, source) (its rungs carry a source line, so the page scan skips it)
ok(/<!-- x03-stop:start/.test(PAGE) && PAGE.indexOf("x03-stop:start") > PAGE.indexOf('id="x03-explain"'), "the stop box closes the explain section");

// ---------------- scope and links
// the page's own words: the generated learn:* blocks repeat other lessons' descriptions (a prerequisite's "does" line,
// e.g. F10's, which names nuclear among its accounting conventions), so the scope checks read the page without them
const OWNPAGE = PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?<!-- learn:\1:end -->/g, "");
const ALL = OWNPAGE + "\n" + RAW + "\n" + JS + "\n" + SIDE;
ok(!/nuclear|reactor|\bSMR\b|small modular|fission|uranium/i.test(ALL), "no nuclear term");
ok(!/\bAI\b|artificial intelligence/.test(ALL), "no 'AI'");
ok(!/projects\/|research\.html|smr-dc/.test(ALL), "no project page and no Research page");
ok(!/learning[- ](curve|rate)|cost (decline|reduction|fall|trajector)|cheaper over time|price of (solar|panels|modules)|\$\s?\d[\d,.]*\s?(\/|per) ?(W|kW|watt)/i.test(ALL), "no cost curve of any technology");
ok(!/\b(will|would) (reach|hit|spread|grow|rise|double|triple)\b|by 20[3-9]\d|in 20[3-9]\d/.test(ALL.replace(/\/\/[^\n]*/g, "")), "no forecast: no future year, no 'will reach'");
const hrefs = [...OWN.matchAll(/href="([^"]+)"/g)].map(m => m[1].replace(/&amp;/g, "&")).concat(Object.values(D.sources).map(s => s.url));
ok(hrefs.every(h => S.linkOK(h) || /^[0-9a-z-]+\.html(#[a-z-]+)?$/.test(h) || /^#/.test(h)), "links on the allow-list (" + hrefs.filter(h => !(S.linkOK(h) || /^[0-9a-z-]+\.html(#[a-z-]+)?$/.test(h) || /^#/.test(h))).join(", ") + ")");
["F10", "X2", "A20"].forEach(c => ok(new RegExp('\\["' + c + '",').test(JS), c + " is named through LX.lessonRefHTML"));
const ROW = PATHY.split("id: x03-transitions-history")[1].split("\n- ")[0];
ok(/code: X3/.test(ROW) && /\n  minutes: 12\n/.test(ROW) && !/practice_minutes|lab_minutes/.test(ROW) && /status: active/.test(ROW), "path.yml: X3 is 12 minutes guided, no practice time (curriculum 12 + 0 + 0)");

// ---------------- text budget
const nWords = S.nWords, nSent = S.nSent;
ok(M.STEPS.length === 6, "six step cards");
M.STEPS.forEach((t, i) => { const n = nWords(t); ok(n >= 18 && n <= 36, "step " + (i + 1) + ": " + n + " words"); ok(nSent(t) <= 2, "step " + (i + 1) + ": " + nSent(t) + " sentences"); });
const lines = [M.guessLine(D, 0), M.guessLine(D, 2), M.GUESS_SAW, M.farmLine(D), M.FARM_SAW, M.heatLine(D), M.HEAT_NOTE, M.HEAT_SAW, M.carLine(D), M.CAR_SAW, M.solarLine(D), M.SOLAR_SAW, M.SORT_NOTE, M.EXPLAIN_LEDE]
  .concat(D.series.map(s => s.measure))
  .concat(D.sort.cards.map(c => c.why), D.sort.cards.map(c => c.text), D.timeline.map(e => e.text), [].concat(...D.debate.sides.map(s => s.points)), [D.debate.note], D.stop.includes, D.stop.leaves, D.stop.ladder.map(r => r.text), D.facts.map(f => f.what));
lines.forEach(t => { ok(nWords(t) <= 36, "a text of " + nWords(t) + " words: " + S.plain(t).slice(0, 60)); ok(nSent(t) <= 2, "a text of " + nSent(t) + " sentences: " + S.plain(t).slice(0, 60)); });
const PROSE = OWN.replace(/^---[\s\S]*?\n---\n/, " ").replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<!-- x03-(sources|facts|stop|timeline):start[\s\S]*?:end -->/g, " ")
  .replace(/<!--[\s\S]*?-->/g, " ").replace(/^- (.*)$/gm, "<li>$1</li>");
PROSE.split(/<\/?(?:p|li|dd|dt|td|th|summary|br|caption|h3|h4)\b[^>]*>/).map(S.plain).filter(x => /[A-Za-z]/.test(x) && !/^[:{]/.test(x)).forEach(x => {
  const n = nWords(x); ok(n <= 40, "text element of " + n + " words: " + x.slice(0, 70)); ok(nSent(x) <= 2, "text element of " + nSent(x) + " sentences: " + x.slice(0, 70)); });

// ---------------- controls
ok(/aria-live/.test(JS) && (JS.match(/LX\.demo\(/g) || []).length === 1 && (JS.match(/demo\[\d\] = function/g) || []).length === 6, "live regions; a demo hook with an action for each of the six steps");
ok(/id: diffusion-curve\b/.test(SIDE) && /data-term=\\"diffusion-curve\\"/.test(JS), "the sidecar defines the term the ideas mark");
ok(/\[\[diffusion-curve\|diffusion curve\]\]/.test(M.STEPS[0]) && /\[\[diffusion-curve\|diffusion curve\]\]/.test(M.EXPLAIN_LEDE) && /html: LX\.rich\(EXPLAIN_LEDE\)/.test(JS), "the live page marks the diffusion curve in step 1 and in the explain layer's lede, not only in the fallback");
ok(/role: "group", "aria-label": "Curves to show"/.test(JS) && /"aria-label": "Scale of the chart"/.test(JS) && /text: "Text version of the chart"/.test(JS), "the curve viewer: labelled groups and a text version");

console.log((fails ? "FAILED " + fails + " of " : "ok: ") + checks + " checks (" + ID + ")");
process.exit(fails ? 1 : 0);
