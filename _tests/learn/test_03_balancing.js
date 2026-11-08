// test_03_balancing.js — Node tests for Lesson 3 (assets/learn/03-balancing.js): the frequency model's identities and
// edge cases, the Uri data, and every number the lesson page states.
// Usage (from the site folder):  node _tests/learn/test_03_balancing.js            run the checks
//                                node _tests/learn/test_03_balancing.js --fallback  also rewrite the page's static figure
// Folders starting with "_" are not rendered or published by Quarto.
"use strict";
const fs = require("fs");
const path = require("path");
const SITE = path.resolve(__dirname, "..", "..");
const M = require(path.join(SITE, "assets/learn/03-balancing.js"));
const D = JSON.parse(fs.readFileSync(path.join(SITE, "assets/learn/data/03-balancing.json"), "utf8"));
const QMD_PATH = path.join(SITE, "learn/03-balancing.qmd");
let QMD = fs.readFileSync(QMD_PATH, "utf8");
const JS = fs.readFileSync(path.join(SITE, "assets/learn/03-balancing.js"), "utf8");
const G = D.grid, U = D.uri;

let checks = 0, fails = 0;
function ok(cond, msg) { checks++; if (!cond) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const has = (s, msg) => ok(QMD.indexOf(s) >= 0, "page states " + (msg || JSON.stringify(s)));

// ---------------- data
ok(G.f0 === 60 && G.tripMW > 0 && G.loadMW > G.tripMW, "grid: 60 Hz, a trip smaller than the load");
ok(G.inertia.min <= G.inertia.start && G.inertia.start <= G.inertia.max && G.reserve.min <= G.reserve.start && G.reserve.start <= G.reserve.max, "grid: slider starts within range");
ok(G.reserve.start >= G.tripMW, "grid: the starting reserve covers the largest plant (N-1)");
const mins = U.points.map(p => M.clock(p[0]));
ok(mins.every((m, i) => i === 0 || m > mins[i - 1]), "uri: readings in time order");
ok(U.events.every((e, i) => i === 0 || M.clock(e.at) > M.clock(U.events[i - 1].at)), "uri: events in time order");
ok(U.events.every((e, i) => i === 0 || e.shedMW >= U.events[i - 1].shedMW), "uri: customer demand ordered off never decreases");
U.events.forEach(e => { const p = U.points.find(q => q[0] === e.at); ok(!p || p[1] === e.hz, `uri: event ${e.at} frequency ${e.hz} matches the reading`); });
// threshold crossings (the report gives no reading at 1:51 and 2:02 a.m.) are not plotted as readings and are shown as crossings
const crossings = U.events.filter(e => e.cross);
ok(crossings.map(e => e.at + " " + M.hzEvent(e)).join("; ") === "1:51 below 59.4 Hz; 2:02 above 60 Hz", "uri: 1:51 and 2:02 a.m. shown as 'below 59.4 Hz' and 'above 60 Hz'");
crossings.forEach(e => ok(!U.points.some(p => p[0] === e.at), `uri: no reading invented at the ${e.at} crossing`));
ok(M.hzEvent(U.events.find(e => e.at === "1:54")) === "59.304 Hz", "uri: a reading keeps three decimals");
// the automatic relay trip near 59.3 Hz at 1:54 a.m. (FERC-NERC report, p. 137)
ok(U.uflsTripMW === 276 && /276 MW tripped by under-frequency relays at 1:54 a\.m\., p\. 137/.test(U.source), "uri: about 276 MW tripped by relays, sourced to p. 137");
ok(/about 276 MW of load automatically/.test(U.events.find(e => e.at === "1:54").text), "uri: the 1:54 event card names the relay trip");
ok(/path: \["trip", "inertia", "gov", "q1", "ufls", "ops", "agc", "end"\]/.test(JS) && /U\.uflsTripMW/.test(JS), "explain: the Texas trace passes the relays and the operators, with the 276 MW");
ok(Math.min(...U.points.map(p => p[1])) === U.lowestHz && U.lowestHz === 59.304, "uri: the lowest reading is 59.304 Hz");
ok(U.events[U.events.length - 1].shedMW === 10500 && U.peakShedMW === 20000, "uri: 10,500 MW by 2:02 a.m., 20,000 MW peak");
ok(M.clock("1:51") + 4 + 23 / 60 <= M.clock("1:55") + 1, "uri: 4 min 23 s below 59.4 Hz fits between 1:51 and 1:55 a.m.");
ok(D.ufls_real.ercot_first_step.hz === G.uflsHz && D.ufls_real.spp_first_step.hz === G.uflsHz, "data: the toy's 59.3 Hz is the real first step (ERCOT, SPP)");
ok(G.uflsPct === D.ufls_real.ercot_first_step.pct, "data: the toy's 5% block equals ERCOT's minimum first step");

// ---------------- model identities and edge cases
const sim = o => M.simulate(G, o);
[6, 8, 12, 16, 20, 24, 30].forEach(E => {
  const r = M.rocof(G, E), s = sim({ inertia: E, reserve: 0, tEnd: 0.05, sample: 0.01 });
  const slope = (s.pts[s.pts.length - 1][1] - 60) / s.pts[s.pts.length - 1][0];
  ok(near(-slope, r, 0.02 * r), `E=${E}: simulated first-50-ms slope ${(-slope).toFixed(4)} matches f0*dP/(2E) = ${r.toFixed(4)}`);
  const Mh = 2 * E * 1000 / G.f0, tStar = -(Mh / G.reliefMWperHz) * Math.log(1 - (60 - G.uflsHz) * G.reliefMWperHz / G.tripMW);
  const st = M.story(G, E, G.reserve.start);
  ok(near(st.hitT, tStar, 0.02), `E=${E}: inertia-only time to 59.3 Hz ${st.hitT.toFixed(2)} s matches the closed form ${tStar.toFixed(2)} s`);
  ok(st.ufls === null && st.nadir.f > G.uflsHz, `E=${E}: with the starting reserve the relays stay out (nadir ${st.nadir.f.toFixed(3)} Hz)`);
  ok(st.back !== null && near(st.end, 60, 0.002), `E=${E}: AGC restores 60 Hz (${st.end.toFixed(4)})`);
  const ffr = sim({ inertia: E, reserve: G.reserve.start, gov: true, ffr: true, tEnd: G.secondsWindow });
  ok(ffr.nadir.f > st.nadir.f, `E=${E}: the battery raises the nadir (${st.nadir.f.toFixed(3)} -> ${ffr.nadir.f.toFixed(3)} Hz)`);
});
const nad = [6, 10, 16, 24, 30].map(E => M.story(G, E, 150).nadir.f), hit = [6, 10, 16, 24, 30].map(E => M.story(G, E, 150).hitT);
ok(nad.every((v, i) => i === 0 || v > nad[i - 1]), "more inertia, higher nadir: " + nad.map(v => v.toFixed(3)).join(" < "));
ok(hit.every((v, i) => i === 0 || v > hit[i - 1]), "more inertia, more time before 59.3 Hz");
for (let R = G.reserve.min; R <= G.reserve.max; R += G.reserve.step) {
  const g = sim({ inertia: 16, reserve: R, gov: true, tEnd: 400, sample: 1 }), gap = M.settleGap(G, R), st = M.story(G, 16, R);
  if (60 - gap > G.uflsHz + 0.05 && g.uflsAt === null) ok(near(g.end, 60 - gap, 0.003), `R=${R}: governors only settle at ${g.end.toFixed(4)} = 60 - settleGap ${(60 - gap).toFixed(4)}`);
  if (60 - gap < G.uflsHz) ok(g.uflsAt !== null && g.shedMW === G.loadMW * G.uflsPct / 100, `R=${R}: settling below 59.3 Hz means the relays cut ${G.loadMW * G.uflsPct / 100} MW`);
  if (st.ufls === null && R >= G.tripMW) ok(st.back !== null && near(st.reserveUsed, G.tripMW, 0.5), `R=${R}: AGC restores 60 Hz with ${st.reserveUsed.toFixed(1)} MW of reserve in use = the lost ${G.tripMW} MW`);
  if (st.ufls === null && R < G.tripMW) ok(st.back === null && near(st.end, 60 - (G.tripMW - R) / G.reliefMWperHz, 0.003), `R=${R}: reserve used up, AGC cannot restore (${st.end.toFixed(3)} Hz)`);
  if (st.ufls !== null) ok(st.peak.f > 60 && st.back !== null, `R=${R}: after the relays cut ${st.shedMW} MW the frequency overshoots, then AGC turns plants down`);
  ok(g.upMax <= R + 1e-9, `R=${R}: upward help never exceeds the reserve`);
}
// the reader's case is judged on the whole run, not the 30-second chart: inertia 30 GW·s, reserve
// 40 MW is still above 59.3 Hz at 30 s but reaches it at 31.9 s, with or without AGC
const late = M.story(G, 30, 40), late30 = sim({ inertia: 30, reserve: 40, gov: true, tEnd: G.secondsWindow });
ok(late30.uflsAt === null && late30.end > G.uflsHz, `E=30 R=40: no shedding inside the 30-second chart (${late30.end.toFixed(3)} Hz at 30 s)`);
ok(late.ufls !== null && late.late === true && late.ufls > G.secondsWindow && near(late.ufls, 31.86, 0.05) && late.shedMW === 200,
  `E=30 R=40: story reports the relays at ${late.ufls && late.ufls.toFixed(2)} s (after the chart), 200 MW`);
ok(late.peak.f > 60 && late.back !== null, "E=30 R=40: overshoot, then AGC turns plants down to 60 Hz");
ok(sim({ inertia: 30, reserve: 40, gov: true, agc: true, tEnd: G.minutesWindow, sample: 1 }).uflsAt !== null, "E=30 R=40: the AGC run sheds too");
let consistent = true, sinkOk = true, lateOk = true;
for (let E = G.inertia.min; E <= G.inertia.max; E += G.inertia.step) for (let R = G.reserve.min; R <= G.reserve.max; R += G.reserve.step) {
  const st = M.story(G, E, R), agcRun = sim({ inertia: E, reserve: R, gov: true, agc: true, tEnd: G.minutesWindow, sample: 1 });
  if ((st.ufls === null) !== (agcRun.uflsAt === null)) { consistent = false; console.log("  shed mismatch E", E, "R", R); }
  if (st.sinking && !(R < G.tripMW && st.ufls === null)) sinkOk = false;
  if (st.late !== (st.ufls !== null && st.ufls > G.secondsWindow)) lateOk = false;
}
ok(consistent, "every slider setting: governors-only and AGC runs agree on whether the relays act");
ok(sinkOk, "every slider setting: 'still sinking' only when the reserve is below the lost plant and no relays act");
ok(lateOk, "every slider setting: 'late' exactly when the relays act after the 30-second chart");
ok(M.story(G, 16, 60).sinking && !M.story(G, 16, 150).sinking, "sinking: 60 MW of reserve has no lowest point inside the chart; 150 MW does");
const noResp = sim({ inertia: 16, reserve: G.reserve.start, tEnd: 5 });
ok(noResp.uflsAt === null || noResp.uflsAt > 5, "edge: with nothing switched on, nothing but inertia acts in the first 5 s");
const zero = sim({ inertia: 16, reserve: 0, gov: true, agc: true, tEnd: 600, sample: 1 });
ok(zero.uflsAt !== null && near(zero.end, 60, 0.002), "edge: zero reserve: the relays act, then AGC turns plants down to 60 Hz");

// ---------------- numbers the page states (Go deeper, quiz, numbers to remember)
const st0 = M.story(G, G.inertia.start, G.reserve.start);
has("\\frac{60 \\times 100}{2 \\times 16{,}000} \\approx -0.19", "the first-second fall rate formula");
ok(st0.rocof.toFixed(2) === "0.19" && G.tripMW === 100 && G.inertia.start === 16, "Go deeper: 60 x 100 / (2 x 16,000) = 0.19 Hz/s with the model's numbers");
has("\\frac{100}{600 + 80} \\approx 0.15", "the settling formula");
ok(G.govMWperHz === 600 && G.reliefMWperHz === 80 && (100 / 680).toFixed(2) === "0.15" && (60 - M.settleGap(G, 150)).toFixed(2) === "59.85", "Go deeper: 100/(600+80) = 0.15 Hz, f = 59.85 Hz");
has("f \\approx 59.85");
ok(G.govMWperHz === 1800 / (0.05 * 60), "Go deeper: 5% droop on 1,800 MW gives 600 MW/Hz"); has("1,800 MW");
has("\\text{drop} = \\frac{\\Delta P}{K + D}", "the settling drop as a positive quantity (one sign convention)");
has("about 8 s behind"); ok(G.govT === 8, "Modeler preview: governors about 8 s behind");
has("at 59.3 Hz relays cut one block of 5% of load"); ok(G.uflsPct === 5 && G.uflsHz === 59.3, "Modeler preview: 5% of load at 59.3 Hz");
ok(!/T_g|\\beta|K_b|\\operatorname\{clip\}/.test(QMD), "Modeler preview: no implementation equations (depth)");
has("[Lesson 10](10-write-it-down.qmd)"); has("[lesson 11](11-solver.qmd)");
has("Plains Grid's 6–30 GW·s"); ok(G.inertia.min === 6 && G.inertia.max === 30, "Go deeper: the Plains Grid's inertia range 6-30 GW·s");
has("20 GW·s (20,000 MW·s)");
has("a 4,000 MW region"); ok(G.loadMW === 4000, "data note: 4,000 MW");
has("from 254 to 349 GW·s"); ok(U.inertiaRangeGWs.join() === "254,349" && U.inertiaMinOpsGWs === 100, "Go deeper: ERCOT inertia 254-349 GW·s, 100 GW·s minimum"); has("100 GW·s as a minimum");
ok((60 * 200 / (2 * 20000)).toFixed(1) === "0.3", "quiz: 60 x 200 / (2 x 20,000) = 0.3 Hz/s"); has("60 × 200 ÷ (2 × 20,000) = 0.3");
has("<td class=\"n\">59.304 Hz</td>"); has("below 59.4 Hz for 4 min 23 s of the 9 minutes"); ok(U.below594 === "4 min 23 s" && U.relayMinutes === 9, "numbers: 4 min 23 s of 9 minutes");
has("<td class=\"n\">20,000 MW</td>"); has("<td class=\"n\">4.5 million</td>"); ok(U.customersMillion === 4.5, "numbers: 4.5 million customers");
has("ERCOT, at least 5% of load) and in the Southwest Power Pool (at least 10%)"); ok(D.ufls_real.spp_first_step.pct === 10, "numbers: SPP 10%");
has("0–12 s · 1–10 min"); ok(D.layers.rows[0].time === "0–12 s" && D.layers.rows[2].time === "1–10 min", "numbers: NERC time frames");
has("1,045 generating units had 4,124 outages"); has("58% were gas-fired, 27% wind and 6% coal: shares of units, not of lost MW"); has("across ERCOT, SPP and MISO South");

// ---------------- wording the reviews asked for (the no-controls trace includes load relief; overlap; the stage rule)
ok(/"No controls \(inertia and load relief\)"/.test(JS) && !/Inertia only \(nothing else acts\)/.test(JS), "chart: the no-controls trace is labelled with its load relief");
has("No controls (inertia and load relief)");
ok(/gov = S_\.gov && S_\.stage >= 3/.test(JS) && /ffr = S_\.ffr && S_\.stage === 6/.test(JS), "cards: a card shows only the controls introduced so far");
ok(/LX\.on\("l3-change", function \(\) \{\s*mineTrace\(\); fc\.update\(traces\);/.test(JS) && !/lx-ftrace button/.test(JS), "explain: the 'Your settings' trace follows changes (LX.Flowchart's update)");
ok(/label: "Typical time scale"/.test(JS) && /The layers overlap/.test(JS), "explain: time scales overlap, not a relay race");
// every glossary mark on the page and in the script names a known term (glossary.yml or a sidecar)
const GIDS = new Set();
[path.join(SITE, "learn/glossary.yml")].concat(fs.readdirSync(path.join(SITE, "learn/_w1")).filter(f => f.endsWith(".yml")).map(f => path.join(SITE, "learn/_w1", f)))
  .forEach(f => (fs.readFileSync(f, "utf8").match(/^\s*-\s+id:\s*([\w-]+)/gm) || []).forEach(m => GIDS.add(m.replace(/^\s*-\s+id:\s*/, ""))));
const marks = [...(JS.match(/\[\[([\w-]+)\|/g) || []).map(m => m.slice(2, -1)), ...(QMD.match(/term="([\w-]+)"/g) || []).map(m => m.slice(6, -1))];
marks.forEach(id => ok(GIDS.has(id), "glossary: known term " + id));

// ---------------- scope and wording (the page and the script)
const DENY = [/\bFOAK\b/, /\bNOAK\b/, /first[- ]of[- ]a[- ]kind/i, /learning[- ](curve|rate)/i, /order[- ]book/i, /anchor[- ](customer|buyer)/i, /subsidy[- ]free/i,
  /smr-dc/i, /projects\//, /research\.(html|qmd)/, /\bAI\b/, /artificial intelligence/i, /\bnuclear\b/i, /\bSMR\b/, /ChatGPT|Claude/];
const visible = QMD.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?learn:\1:end -->/g, "").replace(/<!--[\s\S]*?-->/g, "");   // own text only: the generated blocks come from path.yml
DENY.forEach(rx => { ok(!rx.test(visible), "page: no " + rx); ok(!rx.test(JS.replace(/\/\/.*$/gm, "")), "script: no " + rx); });
(visible.match(/href="([^"]+)"/g) || []).forEach(h => {
  const u = h.slice(6, -1);
  ok(/^(https:\/\/(www\.)?(eia\.gov|nerc\.com|ferc\.gov|creativecommons\.org\/licenses|opensource\.org\/license)\/|#|\.\.\/assets\/|index\.html|\d\d-[a-z-]+\.(html|qmd)|[a-z]\d\d-[a-z0-9-]+\.(html|qmd)|mailto:)/.test(u), "page: allowed link " + u);
});

// ---------------- the static figure (what readers without JavaScript see)
function fallbackSvg() {
  const W = 720, Hh = 280, m = { l: 52, r: 14, t: 14, b: 30 }, iw = W - m.l - m.r, ih = Hh - m.t - m.b, ymin = 59.2, ymax = 60.2, T = G.secondsWindow;
  const X = t => (m.l + t / T * iw).toFixed(1), Y = f => (m.t + ih - (f - ymin) / (ymax - ymin) * ih).toFixed(1);
  const only = sim({ inertia: G.inertia.start, reserve: 0, tEnd: 60, stopAt: G.uflsHz });
  const pr = sim({ inertia: G.inertia.start, reserve: G.reserve.start, gov: true, tEnd: T, sample: 0.25 });
  const path = pts => pts.map((p, i) => (i ? "L" : "M") + X(p[0]) + " " + Y(p[1])).join(" ");
  let s = `<svg viewBox="0 0 ${W} ${Hh}" role="img" aria-labelledby="l3-static-title">\n`;
  s += `<title id="l3-static-title">The Plains Grid's frequency after a ${G.tripMW} MW plant trips (illustrative). With no controls acting (inertia and load relief only) it would fall to ${G.uflsHz} Hz after ${only.stopT.toFixed(1)} s; with governors it stops at ${pr.nadir.f.toFixed(2)} Hz after ${pr.nadir.t.toFixed(1)} s and levels off near ${(60 - M.settleGap(G, G.reserve.start)).toFixed(2)} Hz.</title>\n<g>`;
  for (let f = 59.2; f <= 60.2001; f += 0.2) s += `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(f)}" y2="${Y(f)}" stroke="var(--lx-line)"/><text x="${m.l - 6}" y="${(+Y(f) + 4).toFixed(1)}" text-anchor="end" font-size="13" fill="var(--lx-ink-3)">${f.toFixed(1)}</text>`;
  [0, 10, 20, 30].forEach((t, i) => { s += `<text x="${X(t)}" y="${Hh - 8}" text-anchor="${i === 0 ? "start" : i === 3 ? "end" : "middle"}" font-size="13" fill="var(--lx-ink-3)">${t} s</text>`; });
  s += `</g>\n<line x1="${m.l}" x2="${W - m.r}" y1="${Y(G.uflsHz)}" y2="${Y(G.uflsHz)}" stroke="var(--lx-bad)" stroke-dasharray="5 4"/><text x="${W - m.r - 4}" y="${(+Y(G.uflsHz) + 15).toFixed(1)}" text-anchor="end" font-size="13" fill="var(--lx-bad)">Relays cut customers · ${G.uflsHz} Hz</text>\n`;
  s += `<path d="${path(only.pts.filter((p, i) => i % 5 === 0 || i === only.pts.length - 1))}" fill="none" stroke="var(--lx-ink-3)" stroke-width="2" stroke-dasharray="6 4"/>\n`;
  s += `<path d="${path(pr.pts)}" fill="none" stroke="var(--lx-accent)" stroke-width="2.6"/>\n`;
  s += `<circle cx="${X(pr.nadir.t)}" cy="${Y(pr.nadir.f)}" r="5" fill="var(--lx-surface)" stroke="var(--lx-accent)" stroke-width="2.4"/><text x="${(+X(pr.nadir.t) + 9).toFixed(1)}" y="${(+Y(pr.nadir.f) + 18).toFixed(1)}" font-size="13" fill="var(--lx-ink)">Lowest ${pr.nadir.f.toFixed(2)} Hz</text>\n</svg>\n`;
  s += `<div class="lx-legend" aria-hidden="true"><span><i class="line" style="border-top-color:var(--lx-ink-3)"></i>No controls (inertia and load relief)</span><span><i style="--c:var(--lx-accent)"></i>With governors (reserve ${G.reserve.start} MW)</span></div>`;
  return s;
}
const FB = fallbackSvg(), re = /(<!-- fallback-svg:start -->\n)([\s\S]*?)(<!-- fallback-svg:end -->)/;
if (process.argv.includes("--fallback")) { QMD = QMD.replace(re, (m0, a, b, c) => a + FB + "\n" + c); fs.writeFileSync(QMD_PATH, QMD); console.log("wrote the static figure into learn/03-balancing.qmd"); }
const cur = re.exec(QMD);
ok(cur && cur[2].trim() === FB.trim(), "page: the static figure matches the model (run with --fallback to rewrite it)");

console.log(`default case: rocof ${st0.rocof.toFixed(3)} Hz/s, inertia-only 59.3 Hz at ${st0.hitT.toFixed(2)} s, nadir ${st0.nadir.f.toFixed(3)} Hz at ${st0.nadir.t.toFixed(2)} s, AGC back at ${(st0.back / 60).toFixed(2)} min`);
console.log(`${checks} checks, ${fails} failures`);
process.exit(fails ? 1 : 0);
