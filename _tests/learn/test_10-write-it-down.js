// test_10-write-it-down.js — Node tests for Lesson 10 (assets/learn/10-write-it-down.js), its data
// (assets/learn/data/10-write-it-down.json) and every number the page (learn/10-write-it-down.qmd) states.
//   - the hour is lesson 0's 19:00 (grid-operator.js prepare()), and its gas need is the page's 145 MW
//   - solve2() (exact two-variable LP) agrees with HiGHS on 3,000 random cases: status and best cost
//   - the four outcomes appear where the page says (slack, binding, infeasible, tied, unbounded, lights out)
//   - the binding cap is a value the cap slider can reach (its 0.05 t step, snapped as controls.js snaps) and the
//     step's "best plan's CO2" button sets exactly that value; one step either side is slack or infeasible
//   - the tie step's positive cost range ties along the same edge for every equal cost, and only for equal costs;
//     a cost line parallel to an edge without a tie (cx 40, cy 0) is a unique corner
//   - the fixed-output plant's constant cost ($1,000 an hour) and the hour's total stated on the page
//   - the simplex walk (LX.lp2.simplexWalk on the hour's model) goes downhill corner by corner and ends at the best corner
//   - the card sort's answer key (LX.CardSort.grade); the page's numbers, the one-line formulation in the Modeler box,
//     its forward links, the corner rule's qualification and the fallback figure
// What it does not check: the browser view (step-card wording, the equation card's spoken rows); those are read in
// the screenshots and by review.
// Usage (from the site folder):  node _tests/learn/test_10-write-it-down.js [--write]   (--write: the fallback figure)
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
const M = require(L("10-write-it-down.js"));
const LP = require(L("components/lpplane.js"));
const CS = require(L("components/cardsort.js"));
const M0 = require(L("grid-operator.js"));
const town = JSON.parse(fs.readFileSync(L("data/town.json"), "utf8"));
const year = JSON.parse(fs.readFileSync(L("data/town_year.json"), "utf8"));
const D = JSON.parse(fs.readFileSync(L("data/10-write-it-down.json"), "utf8"));
const QPATH = path.join(SITE, "learn/10-write-it-down.qmd");
let checks = 0, fails = 0;
function ok(cond, msg) { checks++; if (!cond) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 1e-6 : tol);
const money = v => "$" + Math.round(v).toLocaleString("en-US");
let seed = 20261102;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

(async () => {
  const highs = await loadHighs();
  const day = M.dayOf(town, year), W0 = M0.prepare(town, year, "lesson0"), f = town.fleet, h = D.hour;
  ["demand", "wind", "solar", "need"].forEach(k => ok(day[k].join() === W0[k].join(), `day: ${k} equals lesson 0's`));
  const p = M.params(town, day, D), s = M.solve2(p);
  ok(p.D === 145 && day.need[h] === 145, `hour: gas needed at ${h}:00 is 145 MW (${p.D})`);
  ok(day.wind[h] + day.solar[h] === 86, `hour: 86 MW of wind and sun could be spilled at ${h}:00`);
  ok(s.status === "optimal" && near(s.x, 145) && near(s.y, 0) && near(s.cost, 5800), `default: one best corner (145, 0) at $5,800 (${s.status} ${s.x} ${s.y} ${s.cost})`);
  ok(near(s.co2, 53.65) && !s.binding.co2 && s.binding.demand, "default: 53.65 t of CO2, cap slack, demand binding");
  ok(s.corners.length === 5, `default: the region is a pentagon (${s.corners.length} corners)`);

  // ---------------- exact two-variable LP against HiGHS
  const hi = q => {
    const m = { sense: "min", variables: [{ name: "x", ub: q.on.cc ? q.X : Infinity, cost: q.cx }, { name: "y", ub: q.on.pk ? q.Y : Infinity, cost: q.cy }], constraints: [] };
    if (q.on.demand) m.constraints.push({ name: "demand", terms: { x: 1, y: 1 }, ge: q.D });
    if (q.on.co2) m.constraints.push({ name: "co2", terms: { x: q.ex, y: q.ey }, le: q.cap });
    if (!m.constraints.length) m.constraints.push({ name: "dummy", terms: { x: 1 }, ge: 0 });
    return core.solveWith(highs, m, {});
  };
  let agree = 0, n = 0;
  for (let k = 0; k < 3000; k++) {
    const q = M.params(town, day, D, { D: Math.round(rnd() * 240), cap: Math.round(rnd() * 150), cx: Math.round(rnd() * 34 - 4) * 5, cy: Math.round(rnd() * 34 - 4) * 5,
      on: { demand: rnd() > 0.1, cc: rnd() > 0.25, pk: rnd() > 0.25, co2: rnd() > 0.25 } });
    const a = M.solve2(q), b = hi(q); n++;
    const same = (a.status === "infeasible" && b.status === "infeasible") ||
      (a.status === "unbounded" && (b.status === "unbounded" || b.status === "infeasible-or-unbounded")) ||
      ((a.status === "optimal" || a.status === "tied") && b.status === "optimal" && near(a.cost, b.objective, 1e-6 * (1 + Math.abs(b.objective))));
    if (same) agree++; else if (n - agree <= 3) console.log("  mismatch:", JSON.stringify({ D: q.D, cap: q.cap, cx: q.cx, cy: q.cy, on: q.on }), a.status, a.cost, b.status, b.objective);
  }
  ok(agree === n, `solve2 agrees with HiGHS on ${agree} of ${n} random cases`);

  // ---------------- the steps' outcomes
  const s200 = M.solve2(M.params(town, day, D, { D: 200 }));
  ok(s200.status === "optimal" && near(s200.x, 150) && near(s200.y, 50) && near(s200.cost, 11000), `demand 200: the corner jumps to (150, 50), $11,000 (${s200.x}, ${s200.y}, ${s200.cost})`);
  ok(M.solve2(M.params(town, day, D, { D: 150 })).y === 0 && M.solve2(M.params(town, day, D, { D: 155 })).y > 0, "demand: the peaker enters just above 150 MW");
  const minCO2 = f.cc.co2 * 145;
  ok(M.solve2(M.params(town, day, D, { cap: Math.ceil(minCO2) })).status === "optimal" && !M.solve2(M.params(town, day, D, { cap: Math.ceil(minCO2) })).binding.co2, "cap 54 t: still feasible and slack");
  ok(M.solve2(M.params(town, day, D, { cap: minCO2 })).binding.co2, "cap 53.65 t: binding at the best corner");
  ok(M.solve2(M.params(town, day, D, { cap: Math.floor(minCO2) })).status === "infeasible", "cap 53 t: infeasible");
  ok(D.ranges.cap[0] < minCO2 && D.cap > minCO2, "cap slider: starts slack and can reach infeasible");
  // the binding state through the real control: the slider snaps to min + k x step (controls.js snap())
  const capStep = D.ranges.capStep, dec = (String(capStep).split(".")[1] || "").length;
  const snap = v => +((Math.round((v - D.ranges.cap[0]) / capStep) * capStep + D.ranges.cap[0]).toFixed(dec));
  const bc = M.bindingCap(p);
  ok(near(bc, minCO2) && near(bc, s.co2), `binding cap: the button's value is the best plan's CO2 (${bc} t)`);
  ok(snap(bc) === bc, `binding cap: ${bc} t is on the cap slider's ${capStep} t grid`);
  ok(M.solve2(M.params(town, day, D, { cap: snap(bc) })).status === "optimal" && M.solve2(M.params(town, day, D, { cap: snap(bc) })).binding.co2, "binding cap: the slider's value at the button is feasible and binding");
  ok(!M.solve2(M.params(town, day, D, { cap: snap(bc + capStep) })).binding.co2 && M.solve2(M.params(town, day, D, { cap: snap(bc - capStep) })).status === "infeasible", "binding cap: one slider step up is slack, one step down infeasible");
  ok(snap(D.cap) === D.cap, "cap slider: the default cap is on its grid");
  // the tie step: positive costs only; equal costs tie along the demand edge, unequal ones never tie
  const tr = D.ranges.costTie; let tieAll = true, tieOnlyEqual = true;
  ok(tr[0] > 0, "tie step: its cost sliders stay positive");
  for (let a = tr[0]; a <= tr[1]; a += 5) for (let b = tr[0]; b <= tr[1]; b += 5) {
    const q = M.solve2(M.params(town, day, D, { cx: a, cy: b }));
    if (a === b && !(q.status === "tied" && q.best.some(v => near(v.x, 45) && near(v.y, 100)) && q.best.some(v => near(v.x, 145) && near(v.y, 0)) && near(q.cost, a * 145))) tieAll = false;
    if (a !== b && q.status === "tied") tieOnlyEqual = false;
  }
  ok(tieAll && tieOnlyEqual, "tie step: every equal positive cost ties along (45, 100)-(145, 0); no unequal pair ties");
  const z = M.solve2(M.params(town, day, D, { cx: 0, cy: 0 })), neg = M.solve2(M.params(town, day, D, { cx: -10, cy: -10 }));
  ok(z.status === "tied" && neg.status === "optimal", `tie step: why the range excludes zero and negative costs (0: ${z.status}; -10: ${neg.status} at (${neg.x}, ${neg.y.toFixed(2)}))`);
  const par = M.solve2(M.params(town, day, D, { cx: 40, cy: 0 }));
  ok(par.status === "optimal" && near(par.x, 45) && near(par.y, 100), "flowchart: a cost line parallel to an edge (cx 40, cy 0) can still have one best corner (45, 100)");
  const tie = M.solve2(M.params(town, day, D, { cy: f.cc.cost }));
  ok(tie.status === "tied" && tie.best.length === 2 && near(tie.cost, 5800), `equal costs: tied along an edge (${tie.best.map(v => "(" + v.x + "," + v.y + ")")}) at $5,800`);
  ok(tie.best.some(v => near(v.x, 45) && near(v.y, 100)) && tie.best.some(v => near(v.x, 145) && near(v.y, 0)), "equal costs: the tied edge runs from (45, 100) to (145, 0)");
  const unb = M.solve2(M.params(town, day, D, { cx: -10, on: { cc: false, co2: false } }));
  ok(unb.status === "unbounded" && unb.ray && unb.ray[0] > 0, "paid to run, no size, no cap: unbounded along +x");
  ok(M.solve2(M.params(town, day, D, { cx: -10, on: { cc: false } })).status === "optimal", "paid to run, no size but the CO2 cap on: still bounded");
  ok(M.solve2(M.params(town, day, D, { cx: -10, on: { co2: false } })).status === "optimal", "paid to run, cap off but the size rule on: still bounded");
  const dark = M.solve2(M.params(town, day, D, { on: { demand: false } }));
  ok(dark.status === "optimal" && dark.x === 0 && dark.y === 0, "no demand rule: the cheapest plan makes nothing");
  ok(D.ranges.cost[0] < 0, "cost slider reaches below $0");
  ok(M.fixedCost(town, 1) === 1000 && M.fixedCost(town, 24) === 24000 && day.startCC === 115 && day.startCC === W0.game.startCC, "constants: the fixed-output plant's $1,000 an hour ($24,000 a day); the combined-cycle starts at 115 MW");
  // the explain layer's ramp rule states where it starts (p_cc(-1) = day.startCC, 115 MW): in words, in symbols, read aloud
  const SRC = fs.readFileSync(L("10-write-it-down.js"), "utf8");
  ok(/c0 = day\.startCC\b/.test(SRC) && /"The combined-cycle changes at most " \+ f\.cc\.ramp \+ " MW from the hour before \(" \+ c0 \+ " MW before midnight\)\."/.test(SRC),
     "explain: the Rules list gives the ramp's starting value (" + day.startCC + " MW before midnight)");
  ok(/sym\("p0", "<var>p<\/var><sub>cc<\/sub>\(−1\) = " \+ c0\)/.test(SRC) && /p0: \{ name: "p_cc\(−1\) = " \+ c0, label: "p cc of minus 1 equals " \+ c0, words: "[^"]*" \+ c0 \+ " MW: given/.test(SRC),
     "explain: the ramp row shows p_cc(−1) = " + day.startCC + " as a symbol, with words (and so in the text version)");
  ok(/say: "Ramp limit, every hour: [^"]*" \+ f\.cc\.ramp \+ " MW, up or down\. In the hour before midnight it ran at " \+ c0 \+ " MW\."/.test(SRC),
     "explain: the ramp row's spoken text (text version) gives the starting value");
  const lv = D.level0; ok(lv > s.cost && lv <= D.ranges.level[1], "cost line starts above the best cost");
  ok(M.check(p, { x: D.dot[0], y: D.dot[1] }).ok === false, "the plan dot starts outside the region (so the reader moves it in)");

  // ---------------- simplex walk
  const walk = LP.simplexWalk(M.problem(p));
  ok(walk.length >= 2 && near(walk[walk.length - 1].value, s.cost) && near(walk[walk.length - 1].x, 145), `walk: ends at the best corner (${walk.map(v => Math.round(v.value)).join(" > ")})`);
  ok(walk.every((v, i) => !i || v.value < walk[i - 1].value - 1e-9), "walk: every step is downhill");
  ok(walk.slice(1).every(v => v.along), "walk: every step follows an edge (a rule line)");
  ok(near(walk[0].value, Math.max(...s.corners.map(v => M.costOf(p, v)))), "walk: starts at the most expensive corner");

  // ---------------- card sort
  const key = {}; D.cards.forEach(c => { key[c.id] = c.bin; });
  const g = CS.grade(D.cards, key);
  ok(g.right === 10 && g.total === 10, "cards: the answer key grades 10 of 10");
  const byBin = {}; D.cards.forEach(c => { byBin[c.bin] = (byBin[c.bin] || 0) + 1; });
  ok(byBin.decision === 3 && byBin.goal === 1 && byBin.rule === 3 && byBin.given === 3, `cards: 3 decisions, 1 goal, 3 rules, 3 given (${JSON.stringify(byBin)})`);
  ok(D.bins.map(b => b.id).join() === "decision,goal,rule,given" && D.cards.every(c => c.why && c.why.length < 140), "cards: four bins and a short reason on every card");
  ok(CS.grade(D.cards, {}).placed === 0, "cards: grading an empty sort");

  // ---------------- the page
  if (fs.existsSync(QPATH)) {
    let Q = fs.readFileSync(QPATH, "utf8");
    const svg = fallbackSVG(p, s);
    if (WRITE) { Q = Q.replace(/<!-- fallback-svg:start -->[\s\S]*?<!-- fallback-svg:end -->/, "<!-- fallback-svg:start -->\n" + svg + "\n<!-- fallback-svg:end -->"); fs.writeFileSync(QPATH, Q); console.log("wrote the fallback figure"); }
    ok(Q.includes(svg), "page: the static fallback figure matches the model");
    ["145 MW", money(s.cost).replace("$", "\\$"), "53.65 t", money(s200.cost).replace("$", "\\$"), "86 MW", "$x = 150$, $y = 50$", "$11,000"].forEach(x => ok(Q.includes(x), `page: states ${x}`));
    ok(Q.includes(`\\min\\ ${p.cx}x + ${p.cy}y`) && Q.includes(`x + y \\ge ${p.D}`) && Q.includes(`x \\le ${p.X}`) && Q.includes(`y \\le ${p.Y}`) && Q.includes(`${p.ex}x + ${p.ey}y \\le ${D.cap}`), "page: the Modeler box's one-line formulation uses the model's numbers");
    ok(!/A_ub|pmatrix|linprog/.test(Q) && ["11-solver.html", "b01-algebra-to-lp.html", "m01-dispatch-to-lmp.html"].every(u => Q.includes(`(${u})`)), "page: no matrix or code in this D2 lesson; the Modeler box links forward to lesson 11, B1 and M1");
    const fixH = M.fixedCost(town, 1);
    ok(Q.includes(`constant \\${money(fixH)} for the hour`) && Q.includes(`costs \\${money(s.cost + fixH)} in all`) && Q.includes(`constant ${money(fixH)} makes ${money(s.cost + fixH)} in all`), `page: gas cost ${money(s.cost)} plus the fixed-output plant's ${money(fixH)} is ${money(s.cost + fixH)}`);
    ok(Q.includes("for this two-plant model") && Q.includes("When this lesson's two-plant model has a best plan"), "page: the corner rule is stated for this model, in the box and the quiz");
    ok(!/learning[- ]curve|FOAK|NOAK/i.test(Q), "page: no excluded terms");
  } else ok(false, "page: learn/10-write-it-down.qmd missing");

  console.log(`${checks} checks, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("FAIL:", e && e.stack || e); process.exit(1); });

// the static figure for readers without JavaScript: the region, the rule lines and the best corner
function fallbackSVG(p, s) {
  const view = D.view, Wd = 720, Hh = 400, m = { l: 50, r: 12, t: 14, b: 44 }, iw = Wd - m.l - m.r, ih = Hh - m.t - m.b;
  const sx = x => (m.l + (x - view.x[0]) / (view.x[1] - view.x[0]) * iw).toFixed(1), sy = y => (m.t + ih - (y - view.y[0]) / (view.y[1] - view.y[0]) * ih).toFixed(1);
  const out = [`<svg viewBox="0 0 ${Wd} ${Hh}" role="img" aria-labelledby="w10-static-title">`,
    `<title id="w10-static-title">Plans for the two gas plants at 19:00: combined-cycle output across, peaker output up. The shaded region meets every rule; the best plan is the corner x = ${s.x} MW, y = ${s.y} MW, with a gas cost of $${Math.round(s.cost).toLocaleString("en-US")}.</title>`];
  let g = "<g>";
  for (let x = 0; x <= view.x[1]; x += 40) g += `<line x1="${sx(x)}" x2="${sx(x)}" y1="${sy(0)}" y2="${sy(view.y[1])}" stroke="var(--lx-line)"/><text x="${sx(x)}" y="${Hh - 24}" text-anchor="middle" font-size="13" fill="var(--lx-ink-3)">${x}</text>`;
  for (let y = 0; y <= view.y[1]; y += 40) g += `<line x1="${sx(0)}" x2="${sx(view.x[1])}" y1="${sy(y)}" y2="${sy(y)}" stroke="var(--lx-line)"/><text x="${m.l - 6}" y="${(+sy(y) + 4).toFixed(1)}" text-anchor="end" font-size="13" fill="var(--lx-ink-3)">${y}</text>`;
  g += `<text x="${sx(view.x[1])}" y="${Hh - 6}" text-anchor="end" font-size="13" fill="var(--lx-ink-2)">Combined-cycle x (MW)</text><text x="${m.l + 4}" y="${m.t + 12}" font-size="13" fill="var(--lx-ink-2)">Peaker y (MW)</text>`;
  out.push(g + "</g>");
  const poly = LP.region(M.problem(p).rows, view);
  out.push(`<polygon points="${poly.map(v => sx(v[0]) + "," + sy(v[1])).join(" ")}" fill="color-mix(in srgb, var(--lx-accent) 16%, transparent)"/>`);
  const col = { demand: "var(--lx-ink)", cc: "var(--lx-cc)", pk: "var(--lx-pk)", co2: "var(--lx-warn)" }, lab = { demand: "Demand", cc: "Combined-cycle size", pk: "Peaker size", co2: "CO₂ cap" };
  M.rulesOf(p).forEach(r => {
    const seg = LP.segment(r.a, r.b, view); if (!seg) return;
    out.push(`<line x1="${sx(seg[0][0])}" y1="${sy(seg[0][1])}" x2="${sx(seg[1][0])}" y2="${sy(seg[1][1])}" stroke="${col[r.id]}" stroke-width="2"${r.id === "cc" || r.id === "pk" ? ' stroke-dasharray="6 4"' : ""}/>`);
    const f = r.id === "demand" ? 0.82 : r.id === "co2" ? 0.2 : 0.5, lx = seg[0][0] + f * (seg[1][0] - seg[0][0]), ly = seg[0][1] + f * (seg[1][1] - seg[0][1]);
    out.push(`<text x="${(+sx(lx) + 6).toFixed(1)}" y="${(+sy(ly) - 6).toFixed(1)}" font-size="13" fill="${col[r.id]}">${lab[r.id]}</text>`);
  });
  out.push(`<circle cx="${sx(s.x)}" cy="${sy(s.y)}" r="8" fill="var(--lx-good)" stroke="var(--lx-surface)" stroke-width="2.5"/>`);
  out.push(`<text x="${(+sx(s.x) - 10).toFixed(1)}" y="${(+sy(s.y) - 14).toFixed(1)}" text-anchor="end" font-size="13" fill="var(--lx-good)">Best: $${Math.round(s.cost).toLocaleString("en-US")}</text>`);
  out.push("</svg>");
  return out.join("\n");
}
