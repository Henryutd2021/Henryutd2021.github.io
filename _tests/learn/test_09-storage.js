// test_09-storage.js — Node tests for Lesson 9 (assets/learn/09-storage.js), its data (assets/learn/data/09-storage.json)
// and every number the page (learn/09-storage.qmd) states. Solves with the vendored HiGHS, the same core as the page.
//   - the day: 9 June 2025 cut from the year as lesson 0 cuts its day; the prices and the cost without a battery
//   - the hand schedule: energy bookkeeping (stored = 0.8 x in - out), saving = cost without - cost with, clipping
//   - the best schedule (LP): beats every hand schedule; charges only spilled sun; the sizes 1, 2, 4 and 8 hours
//   - the data file's precomputed block, the page's numbers and its static figure
// Usage (from the site folder):  node _tests/learn/test_09-storage.js [--write]   (--write: precomputed block + figure)
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const WRITE = process.argv.includes("--write");
const ctx = { window: { LX: {} }, module: { exports: {} }, performance };
vm.runInNewContext(fs.readFileSync(L("components/solver.js"), "utf8"), ctx);
const { core, VERSION } = ctx.module.exports;
const loadHighs = require(L(`vendor/highs-${VERSION}/highs.js`));
const M = require(L("09-storage.js"));
const M0 = require(L("grid-operator.js"));
const town = JSON.parse(fs.readFileSync(L("data/town.json"), "utf8"));
const year = JSON.parse(fs.readFileSync(L("data/town_year.json"), "utf8"));
const DPATH = L("data/09-storage.json"), D = JSON.parse(fs.readFileSync(DPATH, "utf8"));
const QPATH = path.join(SITE, "learn/09-storage.qmd");
let checks = 0, fails = 0;
function ok(cond, msg) { checks++; if (!cond) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 1e-6 : tol);
const money = v => "$" + Math.round(v).toLocaleString("en-US");
const r6 = v => Math.round(v * 1e6) / 1e6;
let seed = 909;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

(async () => {
  const highs = await loadHighs();
  const W = M.prepare(town, year, D), f = town.fleet, B = D.battery, V = D.penalty;

  // ---------------- the day
  const probe = { scenarios: { p: { date: D.day.date, utcOffsetHours: D.day.utcOffsetHours, demandPeakMW: D.day.demandPeakMW, step: 1 } }, fleet: f };
  const W0 = M0.prepare(probe, year, "p");
  ok(W0.wind.join() === W.wind.join() && W0.solar.join() === W.solar.join(), "day: wind and solar sliced and scaled as lesson 0 does");
  ok(W.demand.every((d, t) => Math.abs(d - W0.rawDemand[t]) <= 0.5), "day: demand = shape x 450 MW, rounded to whole MW");
  const zero = W.price.map((p, t) => p === 0 ? t : -1).filter(t => t >= 0), hundred = W.price.map((p, t) => p === f.peaker.cost ? t : -1).filter(t => t >= 0);
  ok(zero.join() === "8,9,10,11,12,13,14,15,16" && hundred.join() === "20,21,22", `prices: $0 from 08:00 to 16:00 and $100 at 20:00-22:00 (${zero}; ${hundred})`);
  ok(W.price.every(p => [0, f.cc.cost, f.peaker.cost].includes(p)), "prices: only $0, $40 and $100 (no hour short)");
  const spill = W.gap.filter(g => g < 0).reduce((a, g) => a - g, 0), pkMWh = W.gap.reduce((a, g) => a + Math.max(0, g - f.cc.mw), 0);
  ok(spill === 128 && pkMWh === 59 && W.gap[8] === -3, `day: 128 MWh of sun spilled, 59 MWh from the peaker, 3 MW spilled at 08:00 (${spill}, ${pkMWh}, ${W.gap[8]})`);
  ok(W.base === 80460, `day: running cost without a battery $80,460 (${W.base})`);
  ok(near(W.base, M.cost(W, W.gap, V)) && near(M.hour(f, -5, V).cost, 0) && near(M.hour(f, 160, V).cost, 150 * 40 + 10 * 100), "hour(): spill, combined-cycle, then peaker");

  // ---------------- the hand schedule
  const idle = M.simulate(W, B, new Array(24).fill(0), V);
  ok(near(idle.totals.save, 0) && near(idle.totals.cost, W.base), "hand: idle all day saves nothing");
  for (let k = 0; k < 2000; k++) {
    const plan = Array.from({ length: 24 }, () => [-1, 0, 0, 1][Math.floor(rnd() * 4)]), r = M.simulate(W, B, plan, V), T = r.totals;
    const okE = near(r.hours[23].soc, B.eta * T.in - T.out, 1e-9) && r.hours.every(h => h.soc >= -1e-9 && h.soc <= B.E + 1e-9 && h.ch <= B.P + 1e-9 && h.dis <= B.P + 1e-9);
    const gaps = W.gap.map((g, t) => g + r.hours[t].ch - r.hours[t].dis);
    const okS = near(T.save, W.base - M.cost(W, gaps, V), 1e-6) && near(T.fromSpill + T.fromGas, T.in) && near(T.lost, T.in * (1 - B.eta));
    if (!okE || !okS) { ok(false, `hand: bookkeeping fails for plan ${plan.join("")}`); break; }
  }
  ok(true, "hand: 2,000 random schedules keep stored = 0.8 x in - out, the limits, and saving = cost without - cost with");
  const one = M.simulate(W, B, [-1].concat(new Array(23).fill(0)), V);
  ok(near(one.hours[0].ch, 25) && near(one.hours[0].soc, 20), "hand: one hour at full power: 25 MWh in, 20 MWh stored");
  ok(near(B.E / B.P, 4) && near(B.E / B.eta, 125) && near(B.E / B.eta / B.P, 5), "hand: 4 hours flat out; 125 MWh and 5 hours to fill");
  const full = M.simulate(W, B, [-1, -1, -1, -1, -1, -1].concat(new Array(18).fill(0)), V);
  ok(near(full.hours[3].soc, 80) && near(full.hours[4].soc, B.E) && near(full.hours[4].ch, B.P) && near(full.hours[5].ch, 0) && near(full.hours[5].soc, B.E), "hand: five full hours fill 100 MWh; a sixth charges nothing");
  const half = M.simulate(W, B, [-1, -1, -1, -1, 1, -1, -1, -1].concat(new Array(16).fill(0)), V);
  ok(near(half.hours[6].soc, 95) && near(half.hours[7].ch, 5 / B.eta) && near(half.hours[7].soc, B.E), "hand: an hour that would overfill charges only what fits");
  // the best schedule a reader can tap (full power), by brute force over midday charging and evening discharging hours
  let bestHand = { save: -Infinity };
  const CH = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16], DH = [17, 18, 19, 20, 21, 22, 23];
  for (let a = 0; a < (1 << CH.length); a++) for (let b = 0; b < (1 << DH.length); b++) {
    const plan = new Array(24).fill(0); CH.forEach((t, i) => { if (a >> i & 1) plan[t] = -1; }); DH.forEach((t, i) => { if (b >> i & 1) plan[t] = 1; });
    const r = M.simulate(W, B, plan, V); if (r.totals.save > bestHand.save) bestHand = { save: r.totals.save, plan };
  }
  ok(bestHand.save === 6360, `hand: the best full-power schedule saves $6,360 (${bestHand.save}: ${bestHand.plan.join(" ")})`);
  const naive = M.simulate(W, B, W.price.map((p, t) => t >= 8 && t <= 12 ? -1 : t >= 19 && t <= 22 ? 1 : 0), V);
  ok(naive.totals.fromGas > 0 && naive.totals.save < bestHand.save, `hand: charging 08:00-12:00 takes ${naive.totals.fromGas} MWh from gas and saves only ${naive.totals.save}`);
  const g8 = M.simulate(W, B, W.price.map((p, t) => t === 8 ? -1 : 0), V).hours[8];
  ok(near(g8.fromSpill, 3) && near(g8.fromGas, 22), "hand: at 08:00 full-power charging takes 3 MW of spilled sun and 22 MW of gas");

  // step 4's feedback names the hour's actual charging power: with 95 MWh stored, 09:00 can take only 6.25 MW (3 MW of
  // spilled sun and 3.25 MW of gas), not the 25 MW rating
  {
    const plan = new Array(24).fill(0); [0, 1, 2, 3, 4, 6, 9].forEach(t => { plan[t] = -1; }); plan[5] = 1;
    const r = M.simulate(W, B, plan, V), h9 = r.hours[9];
    ok(near(r.hours[6].soc, 95) && near(h9.ch, 6.25) && near(h9.fromSpill, 3) && near(h9.fromGas, 3.25), `hand: with 95 MWh stored, 09:00 charges 6.25 MW: 3 from spilled sun, 3.25 from gas (${h9.ch}, ${h9.fromSpill}, ${h9.fromGas})`);
    const first = r.hours.filter(x => x.fromGas > 0.5 && W.marginal[x.t] === "spill")[0];
    ok(first && first.t === 9, "hand: 09:00 is the hour the feedback describes");
  }
  const JS9 = fs.readFileSync(L("09-storage.js"), "utf8");
  ok(/so charging " \+ f1\(gas\.ch\) \+ " MW" \+ \(gas\.ch < B\.P - 0\.05 \? " \(slower: the battery is nearly full\)" : ""\)/.test(JS9), "step 4: the feedback states the hour's actual charging power, and why it is lower");
  // the strip's prices are the cost of one more MWh without the battery; savings re-run the plants
  ok(/"Without the battery, one more MWh costs, \$: 0 \(sun spilled\)"/.test(JS9) && /"One more MWh without the battery, \$"/.test(JS9) && /Savings re-run the plants with the battery\./.test(JS9) && /: without the battery, one more MWh costs \$" \+ W\.price\[t\]/.test(JS9),
     "prices: labelled 'without the battery' in the legend, the tiles' names and the text version");
  // "best" only from an optimal solve; otherwise the precomputed optimum, labelled as such
  ok(/var o = r && r\.status === "optimal" \? parseLP\(W, b, r, V\) : null;/.test(JS9) && /The solver stopped before proving the best plan/.test(JS9), "best: only an optimal status counts; an early stop shows the precomputed best, labelled");
  // both predictions carry their question as an accessible name; the size comparison hides the 100 MWh scene
  ok(!/q: "", title: false/.test(JS9) && /id: "w9-hours", q: "Flat out, how long can it discharge\?", title: false/.test(JS9) && /id: "w9-when", q: "When should the battery charge\?", title: false/.test(JS9), "predictions: each names its question for assistive technology");
  ok(/mode = "best"; hook = null; stage\.hidden = true;/.test(JS9) && /"Each bar is a separate " \+ B\.P \+ " MW battery, solved for its own best schedule on "/.test(JS9), "sizes: the scene is hidden and each bar is labelled a separate battery");
  // midday: the sun alone never exceeds demand; the surplus comes from sun, wind and the flat plant together
  ok(W.solar.every((s, t) => s < W.demand[t]) && W.gap.some(g => g < 0), "day: the sun alone never exceeds demand, yet some hours have a surplus");
  ok(!/the sun gives more than the town needs|Sun floods the town/i.test(JS9) && /sun, wind and the flat nuclear plant together make more than the town needs/.test(JS9), "midday: the surplus is named as sun, wind and the flat plant together");

  // step 1's feedback: 15 minutes would need E / 0.25 h = 400 MW, 16 times 25 MW
  const hq = M.hoursQuiz(B);
  ok(hq.fast === 400 && hq.fast / B.P === 16 && hq.feedback.a.includes("400 MW, 16 times") && hq.feedback.b.startsWith("4 hours"), `step 1: 15 minutes needs 400 MW, 16 times the rating (${hq.feedback.a})`);
  // the day's windows as clock intervals (hour t runs from t:00 to t+1:00)
  const win = M.windows(W);
  ok(win.label(win.mid) === "08:00–17:00" && win.label(win.night) === "00:00–08:00" && win.label(win.eve) === "19:00–23:00" && win.label(win.peak) === "20:00–23:00", `windows: midday 08:00–17:00, overnight 00:00–08:00, evening 19:00–23:00 (${win.label(win.mid)}, ${win.label(win.night)}, ${win.label(win.eve)})`);
  ok(zero.every(t => t >= win.mid[0] && t < win.mid[1]) && zero.length === win.mid[1] - win.mid[0] && W.price.slice(0, 8).every(p => p === f.cc.cost), "windows: every midday hour is $0, every overnight hour $40");
  // the quiz: earn = 100 x 0.8 x $60 - 100 x $20; break-even = $40 / 0.8; $45 x 0.8
  ok(100 * 0.8 * 60 - 100 * 20 === 2800 && near(40 / B.eta, 50) && near(45 * B.eta, 36), "quiz: $2,800 earned; break-even $50; $36 back from $45");

  // ---------------- the best schedule (LP)
  const sols = {};
  D.durations.forEach(h => {
    const b = { P: B.P, E: B.P * h, eta: B.eta }, m = M.buildLP(W, b, V), r = core.solveWith(highs, m, {}), o = M.parseLP(W, b, r, V);
    ok(r.status === "optimal" && r.kind === "lp", `LP ${h} h: optimal LP`);
    ok(Array.from({ length: 24 }, (_, t) => r.values["un_" + t]).every(u => Math.abs(u) < 1e-7), `LP ${h} h: no unserved demand (the $${V}/MWh penalty is never used)`);
    o.gaps = W.gap.map((g, t) => g + o.ch[t] - o.dis[t]);
    const tie = M.TIE * 24 * 2 * B.P;
    ok(Math.abs(r.objective - o.cost) <= tie, `LP ${h} h: tie-breaks move the objective by under $${tie.toFixed(2)} (${(r.objective - o.cost).toFixed(4)})`);
    ok(near(o.soc[23], 0, 1e-6) || o.soc[23] < 1e-3, `LP ${h} h: ends the day empty (${o.soc[23]})`);
    ok(o.ch.every((c, t) => !(c > 1e-6 && o.dis[t] > 1e-6)), `LP ${h} h: never charges and discharges in the same hour`);
    let s = 0; o.ch.forEach((c, t) => { s += B.eta * c - o.dis[t]; ok(near(s, o.soc[t], 1e-6), `LP ${h} h: state of charge at ${t}`); });
    sols[h] = o;
  });
  const b4 = sols[4];
  ok(near(b4.save, 7240, 1e-6), `LP 4 h: saves $7,240 (${b4.save})`);
  ok(near(b4.fromGas, 0, 1e-6) && near(b4.fromSpill, 125, 1e-6) && near(b4.out, 100, 1e-6), `LP 4 h: 125 MWh in, all spilled sun; 100 MWh out (${b4.fromSpill}, ${b4.fromGas}, ${b4.out})`);
  ok(b4.ch.every((c, t) => c <= Math.max(0, -W.gap[t]) + 1e-6), "LP 4 h: charges at most what each hour spills (part power)");
  ok(b4.save >= bestHand.save && Math.round(bestHand.save / b4.save * 100) === 88, `LP 4 h: beats the best tapped schedule, which reaches 88% (${(bestHand.save / b4.save * 100).toFixed(1)}%)`);
  ok(near(sols[1].save, 2500) && near(sols[2].save, 5000) && near(sols[8].save, 7336), `sizes: $2,500, $5,000, $7,240, $7,336 (${D.durations.map(h => sols[h].save).join(", ")})`);
  ok(near(sols[8].save - sols[4].save, 96), "sizes: 4 to 8 hours adds only $96");
  // why 4 -> 8 hours adds only $96: the 8-hour battery stores the last 3 MWh of spilled sun (2.4 MWh back, at $40);
  // both leave the same 5 MWh of peaker output, because both discharge at most 25 MW
  const pkAfter = o => o.gaps.reduce((a, g) => a + Math.max(0, g - f.cc.mw), 0);
  const left4 = spill - sols[4].fromSpill, back8 = sols[8].out - sols[4].out;
  ok(near(left4, 3) && near(sols[8].fromSpill - sols[4].fromSpill, 3) && near(back8, 2.4) && near(back8 * f.cc.cost, 96), `sizes: 4 h leaves 3 MWh of spill; 8 h stores it and returns 2.4 MWh at $40 = $96 (${left4}, ${back8})`);
  ok(near(pkAfter(sols[4]), 5) && near(pkAfter(sols[8]), 5) && sols[8].dis.every(d => d <= B.P + 1e-9), `sizes: 5 MWh of peaker remain with 4 h and 8 h (${pkAfter(sols[4])}, ${pkAfter(sols[8])})`);
  ok(near(sols[1].save / 25, 100) && near(sols[2].save / 50, 100) && Math.round(sols[4].save / 100) === 72 && Math.round(sols[8].save / 200) === 37, "sizes: per MWh of storage $100, $100, $72, $37");
  const per = D.durations.map(h => sols[h].save / (B.P * h));
  ok(per.every((v, i) => !i || v <= per[i - 1] + 1e-9), `sizes: saving per MWh of storage never rises (${per.map(v => v.toFixed(1)).join(", ")})`);
  // a crude check that the LP is the town's real optimum: random part-power schedules never beat it
  let beat = 0;
  for (let k = 0; k < 500; k++) {
    const ch = new Array(24).fill(0), dis = new Array(24).fill(0); let soc = 0, gaps = W.gap.slice();
    for (let t = 0; t < 24; t++) {
      const x = rnd(); if (x < 0.35) { ch[t] = Math.min(B.P, (B.E - soc) / B.eta) * rnd(); soc += B.eta * ch[t]; } else if (x < 0.6) { dis[t] = Math.min(B.P, soc) * rnd(); soc -= dis[t]; }
      gaps[t] += ch[t] - dis[t];
    }
    if (W.base - M.cost(W, gaps, V) > b4.save + 1e-6) beat++;
  }
  ok(beat === 0, "LP 4 h: 500 random part-power schedules never save more");

  // ---------------- the data file's precomputed block
  const want = {};
  D.durations.forEach(h => { const o = sols[h]; want[String(B.P * h)] = { save: r6(o.save), in: r6(o.in), out: r6(o.out), fromSpill: r6(o.fromSpill), fromGas: r6(o.fromGas), ch: o.ch.map(r6), dis: o.dis.map(r6), soc: o.soc.map(r6) }; });
  if (WRITE) { D.precomputed = want; fs.writeFileSync(DPATH, JSON.stringify(D, null, 2) + "\n"); console.log("wrote", path.relative(SITE, DPATH)); }
  Object.keys(want).forEach(k => ["save", "in", "out", "fromSpill", "fromGas", "ch", "dis", "soc"].forEach(fld =>
    ok(D.precomputed[k] && JSON.stringify(D.precomputed[k][fld]) === JSON.stringify(want[k][fld]), `data: precomputed ${k} MWh, field ${fld}, matches a fresh solve`)));

  // ---------------- the page
  if (fs.existsSync(QPATH)) {
    let Q = fs.readFileSync(QPATH, "utf8");
    const svg = fallbackSVG(W, B, b4);
    if (WRITE) { Q = Q.replace(/<!-- fallback-svg:start -->[\s\S]*?<!-- fallback-svg:end -->/, "<!-- fallback-svg:start -->\n" + svg + "\n<!-- fallback-svg:end -->"); fs.writeFileSync(QPATH, Q); console.log("wrote the fallback figure"); }
    ok(Q.includes(svg), "page: the static fallback figure matches the model");
    [money(b4.save), money(W.base), money(bestHand.save).replace("$", "\\$"), money(b4.save).replace("$", "\\$"), "$96", money(sols[8].save), "only 3 MW of sun is spilled", "takes 22 MW",
     "above \\$50", "four hours", "9 June 2025", "25 MW, 100 MWh", "80%", "$2,800", "80 × $60 = $4,800", "$2,000", "$36 at $45", "selling price above $50",
     "last 3 MWh of spilled sun", "returns 2.4 MWh at $40", "last 5 MWh remain", "at most 25 MW", "Buying 1 MWh for charging at", "lets this battery sell 0.8 MWh later",
     "the cost of one more MWh without the battery", "Over a full charge and discharge, a battery delivers more electrical energy than it takes in.", "\\$24,000", `\\$${V.toLocaleString("en-US")}/MWh`,
     ...D.durations.map(h => money(sols[h].save)), "$72", "$37", "utility-scale battery storage capacity", "utility-scale battery capacity"].forEach(x => ok(Q.includes(x), `page: states ${x}`));
    ok(24 * f.nuclear.mw * f.nuclear.cost === 24000, "page: the nuclear plant's $24,000 a day");
    D.facts.forEach(fc => ok(Q.includes(fc.url) && Q.includes(fc.n) && Q.includes(fc.asof), `page: number to remember ${fc.n} with its source and date`));
    ok(!/learning[- ]curve|FOAK|NOAK/i.test(Q), "page: no excluded terms");
  } else ok(false, "page: learn/09-storage.qmd missing");

  console.log(`  best tapped schedule ${bestHand.save}; LP ${D.durations.map(h => h + " h " + sols[h].save).join(", ")}`);
  console.log(`${checks} checks, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("FAIL:", e && e.stack || e); process.exit(1); });

// the static figure: the price of one more MWh each hour (bars) and the best schedule's state of charge (line)
function fallbackSVG(W, B, o) {
  const Wd = 720, Hh = 300, m = { l: 46, r: 46, t: 14, b: 30 }, iw = Wd - m.l - m.r, ih = Hh - m.t - m.b, bw = iw / 24;
  const col = { spill: "var(--lx-solar)", cc: "var(--lx-cc)", pk: "var(--lx-pk)" };
  const w = M.windows(W);
  const yP = v => (m.t + ih - v / 100 * ih).toFixed(1), yE = v => (m.t + ih - v / B.E * ih).toFixed(1), x = t => (m.l + t * bw).toFixed(1);
  const out = [`<svg viewBox="0 0 ${Wd} ${Hh}" role="img" aria-labelledby="w9-static-title">`,
    `<title id="w9-static-title">${W.dateLabel}, hour by hour: one more MWh costs $0 from ${M.hm(w.spill[0])} to ${M.hm(w.spill[1])} (sun spilled; shaded, no bar), $100 from ${M.hm(w.peak[0])} to ${M.hm(w.peak[1])} (peaker) and $40 otherwise. The best schedule fills the ${B.E} MWh battery with spilled sun by ${M.fullAt(o.soc, B.E)} and empties it in the evening, saving the town $${Math.round(o.save).toLocaleString("en-US")}.</title>`];
  let g = "<g>";
  [0, 50, 100].forEach(v => { g += `<line x1="${m.l}" x2="${Wd - m.r}" y1="${yP(v)}" y2="${yP(v)}" stroke="var(--lx-line)"/><text x="${m.l - 6}" y="${(+yP(v) + 4).toFixed(1)}" text-anchor="end" font-size="13" fill="var(--lx-ink-3)">$${v}</text><text x="${Wd - m.r + 6}" y="${(+yP(v) + 4).toFixed(1)}" font-size="13" fill="var(--lx-good)">${v / 100 * B.E}</text>`; });
  [0, 6, 12, 18, 24].forEach(h => { g += `<text x="${x(h)}" y="${Hh - 8}" text-anchor="${h === 0 ? "start" : h === 24 ? "end" : "middle"}" font-size="13" fill="var(--lx-ink-3)">${String(h).padStart(2, "0")}:00</text>`; });
  out.push(g + "</g>");
  let bars = "<g>";
  // a $0 hour has no bar (its height is zero): a pale band over the whole hour keeps it visible
  W.price.forEach((p, t) => {
    if (p === 0) bars += `<rect x="${x(t)}" y="${m.t}" width="${bw.toFixed(1)}" height="${ih}" fill="${col[W.marginal[t]]}" opacity="0.18"/>`;
    else bars += `<rect x="${(+x(t) + 1).toFixed(1)}" y="${yP(p)}" width="${(bw - 2).toFixed(1)}" height="${(+yP(0) - +yP(p)).toFixed(1)}" fill="${col[W.marginal[t]]}" opacity="0.75"/>`;
  });
  out.push(bars + "</g>");
  const pts = [0].concat(o.soc).map((v, t) => x(t) + "," + yE(v)).join(" ");
  out.push(`<polyline points="${pts}" fill="none" stroke="var(--lx-good)" stroke-width="3"/>`);
  out.push("</svg>");
  out.push('<div class="lx-legend" aria-hidden="true"><span><i style="--c:var(--lx-solar);opacity:.35"></i>$0: sun spilled (shaded hours)</span><span><i style="--c:var(--lx-cc)"></i>$40: combined-cycle</span><span><i style="--c:var(--lx-pk)"></i>$100: peaker</span><span><i style="--c:var(--lx-good)"></i>Best schedule: MWh stored (right scale)</span></div>');
  return out.join("\n");
}
