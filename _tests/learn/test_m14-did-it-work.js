// test_m14-did-it-work.js — Node tests for Modeler lesson M14 (assets/learn/m14-did-it-work.js, its settings file and
// the page learn/m14-did-it-work.qmd):
//   - the generator: LX.mulberry32 and the Irwin-Hall normal (arithmetic only), the panels' shapes and the opt-in rule
//   - first principles: the naive gap equals least squares with no controls; the DiD of means equals the two-way
//     fixed-effects regression (within transformation, balanced panel); the event study's post mean minus pre mean is the
//     DiD; the standard errors by hand
//   - claims: the naive gap and before-after miss the truth and DiD's interval holds it; controls help only partly; each
//     threat's interval misses the truth; only trend-type threats show before the start; the default effect is smaller;
//     the regions: DiD holds +10, a boom shows before 2021, displacement does not, and its gross and net numbers
//   - every number the page states (step cards on a stub document, the no-JS block, myths, quiz, numbers to remember,
//     Go deeper, the explain layer, the DOE card against the settings file) matches the model or the source record
//   - scope: no nuclear term, no "AI", no deny-listed term; links: learn pages, downloads, doi.org and energy.gov only;
//     every dataset labelled simulated; the notebook asserts the reference block
// Usage (from the site folder):  node _tests/learn/test_m14-did-it-work.js [--write]
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ID = "m14-did-it-work";
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const M = require(L(ID + ".js"));
const DPATH = L("data/" + ID + ".json"), QPATH = path.join(SITE, "learn", ID + ".qmd");
const NBPATH = path.join(SITE, "learn/notebooks", ID + ".ipynb"), SIDE = path.join(SITE, "learn/_w1", ID + ".yml");
const readOr = p => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "");
let D = JSON.parse(fs.readFileSync(DPATH, "utf8"));
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-9 : t);
const text = s => s.replace(/\\\$/g, "$").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/\*\*/g, "").replace(/\[\[[a-z0-9-]+\|([^\]]+)\]\]/g, "$1").replace(/\s+/g, " ").trim();
const { kw, mwy, band, ci, covers } = M;
function between(q, name) {
  const a = q.match(new RegExp("<!-- " + name + ":start[^>]*-->\\n")), b = q.indexOf("<!-- " + name + ":end -->");
  if (!a || b < a.index) throw new Error(name + " markers missing in " + QPATH);
  return { from: a.index + a[0].length, to: b };
}
if (process.argv.includes("--write")) {
  D.reference = M.reference(D);
  fs.writeFileSync(DPATH, JSON.stringify(D, null, 1) + "\n");
  let q = fs.readFileSync(QPATH, "utf8"); const r = between(q, "m14-fallback");
  q = q.slice(0, r.from) + M.staticFallback(D) + "\n" + q.slice(r.to);
  fs.writeFileSync(QPATH, q);
  console.log("wrote the reference block and the no-JS block");
  D = JSON.parse(fs.readFileSync(DPATH, "utf8"));
}
const PAGE = fs.readFileSync(QPATH, "utf8"), RAW = fs.readFileSync(DPATH, "utf8"), JS = fs.readFileSync(L(ID + ".js"), "utf8");
const NB = readOr(NBPATH), SIDEYML = readOr(SIDE);
{ const r = between(PAGE, "m14-fallback"); ok(PAGE.slice(r.from, r.to) === M.staticFallback(D) + "\n", "the no-JS block is up to date (run with --write)"); }
{ const ref = M.reference(D); ok(JSON.stringify(ref) === JSON.stringify(D.reference), "the settings file's reference block is up to date (run with --write)"); }

// ---------------- the generator and the panels
const t0 = Date.now(), F = M.facts(D), factsMs = Date.now() - t0, E = F.E, T = D.tou, R = D.regions, truth = F.truth;
{
  const core = require(L("components/core.js")), r1 = core.mulberry32(78), r2 = M.mulberry32(78);
  ok([0, 1, 2, 3, 4].every(() => r1() === r2()), "the page's generator is LX.mulberry32");
  // Irwin-Hall: 12 uniforms minus 6; over 200,000 draws mean ~0 and variance ~1
  const r = core.mulberry32(12345); let s = 0, s2 = 0; const n = 200000;
  for (let k = 0; k < n; k++) { const g = M.gauss(r); s += g; s2 += g * g; }
  ok(Math.abs(s / n) < 0.01 && Math.abs(s2 / n - 1) < 0.01, "the normal draw: mean " + (s / n).toFixed(4) + ", variance " + (s2 / n).toFixed(4));
  ok(!/Math\.(log|exp|sin|cos|sqrt)\(/.test(M.touPanel.toString() + M.regionPanel.toString() + M.gauss.toString()), "the panels use only + - x / (exact in the Python port)");
}
ok(F.hh.length === 400 && F.hh.every(h => h.y.length === 24) && E.nOn === 92 && E.nOff === 308, "panel 1: 400 homes, 24 months, 92 opt in");
{
  // redraw the stream here, in the documented order (ac, size, engagement, selection noise, then 24 months of noise),
  // and apply the opt-in rule from its inputs: an independent fixture for the page's assignments
  const r = require(L("components/core.js")).mulberry32(T.seed), g = () => { let x = 0; for (let k = 0; k < 12; k++) x += r(); return x - 6; };
  let same = 0, flips = 0;
  for (let i = 0; i < T.n; i++) {
    const ac = r() < T.acShare ? 1 : 0, size = T.size[0] + (T.size[1] - T.size[0]) * r(), e = g(), z = g();
    for (let t = 0; t < T.months; t++) g();
    const on = e - 0.6 * (size - 2) + 0.6 * z > 1 ? 1 : 0, h = F.hh[i];
    if (h.ac === ac && h.size === size && h.e === e && h.on === on) same++;
    if (on !== (e > 1 ? 1 : 0)) flips++;
  }
  ok(same === T.n && T.select.size === -0.6 && T.select.noise === 0.6 && T.select.cut === 1, "panel 1: every home's draws and opt-in decision match an independent redraw with the stated rule (e - 0.6 (s - 2) + 0.6 z > 1)");
  ok(flips > 20, "the size and noise terms of the rule matter: " + flips + " homes would decide otherwise on engagement alone");
}
ok(F.hh.every(h => h.tau <= 0) && F.hh.every(h => h.size >= 1 && h.size <= 3), "panel 1: every effect at or below zero; sizes 1 to 3 thousand sq ft");
// physically possible peaks: every home-month above zero in the default panel and in every threat's panel
{
  const lows = [null].concat(D.threats.map(x => x.key)).map(k => Math.min(...M.touPanel(T, k).flatMap(h => h.y)));
  ok(lows.every(v => v > 0.25) && Math.min(...lows).toFixed(2) === "0.27" && /lowest about 0\.27 kW/.test(T.level.note), "every home-month's evening peak is above zero in every panel (lowest " + Math.min(...lows).toFixed(3) + " kW, as the settings say)");
  const rl = [null].concat(R.threats.map(x => x.key)).map(k => Math.min(...M.regionPanel(R, k).flatMap(x => x.y)));
  ok(rl.every(v => v > 5), "new solar is positive in every region-year of every regions panel (lowest " + Math.min(...rl).toFixed(1) + " MW)");
}
ok(E.share.onE > E.share.offE + 0.8 && E.share.onSize < E.share.offSize - 0.2 && Math.abs(E.share.onAC - E.share.offAC) < 0.12, "selection: TOU homes are more engaged and smaller; air conditioning about equal (" + E.share.onAC.toFixed(2) + " against " + E.share.offAC.toFixed(2) + ")");
ok(near(E.att, F.hh.filter(h => h.on).reduce((s, h) => s + h.tau, 0) / 92, 1e-12) && kw(E.att) === "−0.29 kW" && kw(E.ate) === "−0.20 kW" && E.ate > E.att, "the truth: −0.29 kW on those who opted in; −0.20 kW over all homes (smaller)");
ok(F.rg.length === 30 && F.R.nOn === 14 && F.R.nOff === 16, "panel 2: 30 regions, 14 adopt");
// a threat changes only what it says: the draws are the same
{
  const sp = M.touPanel(T, "spill"), bu = M.touPanel(T, "bundle"), tr = M.touPanel(T, "trend");
  ok(sp.every((h, i) => h.on === F.hh[i].on && h.y.every((v, t) => near(v, F.hh[i].y[t] + (!h.on && t >= 12 ? T.threats.spill : 0), 1e-12))), "spill: flat homes −0.08 kW from month 13, nothing else changes");
  ok(bu.every((h, i) => h.y.every((v, t) => near(v, F.hh[i].y[t] + (h.on && t >= 12 && h.e > T.threats.bundleCut ? T.threats.bundle : 0), 1e-12))), "bundle: engaged TOU homes −0.15 kW from month 13");
  ok(tr.every((h, i) => h.y.every((v, t) => near(v, F.hh[i].y[t] + (h.on ? T.threats.trend * (t - 11) : 0), 1e-12))), "trend: TOU homes drift −0.012 kW a month, zero at month 12");
}

// ---------------- first principles
{
  ok(near(M.regress(T, F.hh, {}), E.naive.est, 1e-9), "least squares with only a TOU dummy is the naive gap");
  // two-way fixed effects by the within transformation (balanced panel): equals the DiD of means
  const N = 400, TT = 24, yb = new Array(N).fill(0), tb = new Array(TT).fill(0), db = new Array(N).fill(0), dt = new Array(TT).fill(0); let ya = 0, da = 0;
  const Dv = (h, t) => (h.on && t >= 12 ? 1 : 0);
  F.hh.forEach((h, i) => h.y.forEach((v, t) => { yb[i] += v / TT; tb[t] += v / N; ya += v / (N * TT); const d = Dv(h, t); db[i] += d / TT; dt[t] += d / N; da += d / (N * TT); }));
  let num = 0, den = 0;
  F.hh.forEach((h, i) => h.y.forEach((v, t) => { const yy = v - yb[i] - tb[t] + ya, dd = Dv(h, t) - db[i] - dt[t] + da; num += dd * yy; den += dd * dd; }));
  ok(near(num / den, E.did.est, 1e-9), "two-way fixed effects (within transformation) = the DiD of means: " + (num / den).toFixed(6));
  const pre = E.es.slice(0, 12).reduce((s, x) => s + x.est, 0) / 12, post = E.es.slice(12).reduce((s, x) => s + x.est, 0) / 12;
  ok(near(post - pre, E.did.est, 1e-9) && E.es[11].ref && E.es[11].est === 0 && E.es.length === 24, "event study: month 12 is the reference; its post mean minus pre mean is the DiD");
  const on = F.hh.filter(h => h.on), off = F.hh.filter(h => !h.on), m = a => a.reduce((s, v) => s + v, 0) / a.length;
  const chg = h => m(h.y.slice(12)) - m(h.y.slice(0, 12)), v = a => { const q = m(a); return a.reduce((s, x) => s + (x - q) * (x - q), 0) / (a.length - 1); };
  const a = on.map(chg), b = off.map(chg);
  ok(near(E.did.est, m(a) - m(b), 1e-12) && near(E.did.se, Math.sqrt(v(a) / 92 + v(b) / 308), 1e-12), "DiD and its standard error by hand (home-level changes)");
  ok(near(E.cells.onPost - E.cells.onPre - (E.cells.offPost - E.cells.offPre), E.did.est, 1e-12) && near(E.ba.est, E.cells.onPost - E.cells.onPre, 1e-12), "the 2 × 2 table's cells give before-after and DiD");
}
// ---------------- claims
ok(!covers(E.naive, truth) && !covers(E.ba, truth) && covers(E.did, truth), "the naive gap and before-after miss the truth; DiD's interval holds it");
ok(Math.abs(E.reg.size - truth) < Math.abs(E.naive.est - truth) && Math.abs(E.reg.size - truth) > 0.3 && Math.abs(E.reg.ac - E.naive.est) < 0.05 && Math.abs(E.reg.both - E.reg.size) < 0.05, "controls: size helps partly, air conditioning moves it little");
ok(kw(E.naive.est) === "−0.85 kW" && kw(E.reg.size) === "−0.73 kW" && kw(E.reg.both) === "−0.70 kW" && kw(E.ba.est) === "−0.36 kW" && kw(E.did.est) === "−0.30 kW" && kw(F.flatChange) === "−0.06 kW" && band(E.did, kw) === "−0.33 to −0.27 kW", "the page's tariff numbers");
ok(E.preMax < 0.05 && kw(E.preMax) === "0.04 kW", "before the start every monthly gap is within 0.04 kW of zero");
ok(E.es.filter(x => x.k < -1).every(x => Math.abs(x.est) <= 1.96 * x.se), "before the start zero is inside every monthly interval");
D.threats.forEach(x => ok(!covers(F.threat[x.key].did, truth), "threat " + x.key + ": the interval misses the truth (" + kw(F.threat[x.key].did.est) + ")"));
ok(F.threat.trend.preMax > 0.1 && F.threat.anticipate.preMax > 0.1 && F.threat.spill.preMax === E.preMax && F.threat.bundle.preMax === E.preMax, "only already-cutting and early cuts show before the start");
ok(kw(F.threat.trend.did.est) === "−0.44 kW" && kw(F.threat.anticipate.did.est) === "−0.26 kW" && kw(F.threat.spill.did.est) === "−0.22 kW" && kw(F.threat.bundle.did.est) === "−0.42 kW", "the threats' DiD estimates");
ok(covers(F.R.did, R.effect) && !covers(F.rthreat.boom.did, R.effect) && !covers(F.rthreat.border.did, R.effect) && F.R.naive.est > F.R.did.est + 4, "regions: DiD holds +10; a boom and moved projects miss it; adopters are sunnier (naive " + F.R.naive.est.toFixed(1) + ")");
ok(F.rthreat.boom.preMax > 5 && F.rthreat.border.preMax === F.R.preMax && F.R.preMax < 2, "regions: a boom shows before 2021, moved projects do not");
ok(mwy(F.R.did.est) === "10.0 MW a year" && mwy(F.rthreat.boom.did.est) === "22.5 MW a year" && mwy(F.rthreat.border.did.est) === "14.0 MW a year" && Math.round(F.border.claimed) === 196 && F.border.net === 76 && F.border.gross === 140 && F.border.lost === 64, "regions: 10.0, 22.5 and 14.0 MW a year; 196 claimed against a net 76");

// ---------------- the page's own text
const OWN = PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?<!-- learn:\1:end -->/g, ""), TX = text(OWN);
const has = (s, what) => ok(TX.includes(s), "page: " + what + ": '" + s + "'");
const k2 = v => kw(v).replace(" kW", "");
has("home size and air conditioning moved the estimate from " + k2(E.naive.est) + " to " + kw(E.reg.both) + "; the truth was " + kw(truth), "myth 1");
has("the months before stayed flat while DiD read " + k2(F.threat.spill.did.est) + " and " + kw(F.threat.bundle.did.est) + " against a truth of " + k2(truth) + ". Similar earlier trends support a comparison; they never prove it.", "myth 2");
ok(!/flat pre-period is necessary/.test(PAGE), "myth 2 no longer calls a flat pre-period necessary");
has("the numbers of TOU and flat homes: " + E.nOn + " and " + E.nOff, "Go deeper: the symbol table's group sizes");
has("explain why the untreated trends would have matched", "Go deeper: natural experiments need a case for the untreated trend, not random assignment");
has("Here volunteers cut " + kw(-truth).replace(" kW", "") + " kW, the average home would cut " + (-E.ate).toFixed(2), "myth 3");
has("(1.70 − 2.00) − (2.00 − 2.10) = −0.30 + 0.10", "quiz 1"); ok(near((1.70 - 2.00) - (2.00 - 2.10), -0.2, 1e-12), "quiz 1: −0.20 kW");
ok(/\$-0\.36 - \(-0\.06\) = -0\.30\$ kW \(rounded\)/.test(PAGE) && k2(E.cells.onPost - E.cells.onPre) === "−0.36" && k2(F.flatChange) === "−0.06" && near(-0.36 + 0.06, -0.30, 1e-12), "Go deeper: the DiD of means with the page's rounded changes");
has("The DiD estimate on the simulated homes; the truth was " + kw(truth) + ", the naive gap " + kw(E.naive.est) + ".", "numbers to remember 1");
ok(OWN.includes('<td class="n">' + kw(E.did.est) + "</td>"), "numbers to remember: −0.30 kW");
has("About 40 guided minutes in ten steps.", "the time line");
has("Seeds: 78 for the homes, 233 for the regions", "data note: the seeds");
ok(T.seed === 78 && R.seed === 233, "the seeds in the settings");
ok((TX.match(/[Ss]imulated/g) || []).length >= 6, "the page says 'simulated' throughout (" + (TX.match(/[Ss]imulated/g) || []).length + ")");
// the DOE card: every number from the settings file's record of the report
{
  const f = D.doe.facts;
  has("ten utilities ran eleven consumer behaviour studies", "DOE: 10 utilities, 11 studies"); ok(f.utilities === 10 && f.studies === 11, "DOE record: 10 and 11");
  has("(" + f.optOutEnroll + "% against " + f.optInEnroll + "%)", "DOE: enrolment"); has("(" + f.optOutTOU + "% against " + f.optInTOU + "% for TOU)", "DOE: TOU cuts");
  has("(" + f.optOutRetain + "% against " + f.optInRetain + "%) (p. vi)", "DOE: retention, page vi");
  ok(OWN.includes('<td class="n">' + f.optInTOU + "% and " + f.optOutTOU + "%</td>") && OWN.includes('<td class="n">' + f.touLow + "% and " + f.touHigh + "%</td>"), "numbers to remember: 12% and 6%; 6% and 18%");
  has("DOE's studies reported peak cuts of " + f.optInTOU + "% for opt-in TOU customers and " + f.optOutTOU + "% for opt-out (2016)", "myth 3: DOE");
  ok(PAGE.includes(D.doe.url) && D.doe.date === "November 2016", "the DOE report's address and date");
}

// ---------------- the page on a stub document
(async () => {
  const { env, load, El } = require("./stubdom.js");
  if (!El.prototype.getBoundingClientRect) El.prototype.getBoundingClientRect = () => ({ top: 0, left: 0, width: 0, height: 0, bottom: 0, right: 0 });
  const Ev = env();
  Ev.LX.ready = () => {}; Ev.LX.progress.guess = () => null; Ev.LX.isDark = () => false;
  Ev.LX.lessonRefHTML = require(L("components/core.js")).lessonRefHTML;
  Ev.LX.mulberry32 = require(L("components/core.js")).mulberry32;
  const plotSpecs = [];
  ["cards", "predict", "table", "boundary", "flowchart", "toggle", "numanswer"].forEach(n => load(n, Ev));
  Ev.LX.Plot = (host, o) => { const box = Ev.LX.H("div", { class: "stub-plot" }, host); return { box, render: spec => { plotSpecs.push(spec); }, text: null }; };
  let init = null, demo = null, fcOpts = null;
  { const FC = Ev.LX.Flowchart; Ev.LX.Flowchart = (h, o) => { fcOpts = o; return FC(h, o); }; }
  Ev.LX.mount = (slug, f) => { if (slug === "m14") init = f; };
  Ev.LX.demo = (root, fn, cards) => { demo = { fn, cards }; return () => null; };
  const mctx = { window: Ev.window, document: Ev.document, location: Ev.location, navigator: {}, console, module: { exports: {} }, performance: Ev.window.performance, setTimeout: f => { f(); return 0; }, clearTimeout: () => {} };
  const xp = Ev.LX.H("div", { id: "m14-explain" }, Ev.body);
  vm.runInNewContext(JS, mctx);
  const root = Ev.LX.H("div", { class: "lx-interactive", "data-learn": "m14" }, Ev.body), live = Ev.LX.H("div", { class: "lx-live" }, root);
  const PATHJ = JSON.parse(fs.readFileSync(L("data/path.json"), "utf8"));
  let threw = null;
  try { init(live, { m14_did_it_work: D, path: PATHJ }, root); } catch (err) { threw = err.stack; }
  ok(!threw && demo && demo.cards, "the page mounts on the stub document" + (threw ? ": " + threw : ""));
  if (threw) return finish();
  const cards = demo.cards, card = () => live.querySelector(".lx-stepcard");
  const next = () => card().querySelectorAll(".lx-step-foot button").filter(x => /Next/.test(x.textContent))[0];
  const saw = () => { const a = card().querySelectorAll(".lx-saw"); return text((a[a.length - 1] || { innerHTML: "" }).innerHTML); };
  const stepText = () => text(card().querySelector(".lx-step-text").innerHTML);
  const btns = re => card().querySelectorAll("button").filter(x => re.test(x.textContent));
  const words = s => s.split(/\s+/).filter(Boolean).length, sents = s => s.split(/(?<=[.?!])\s+(?=[A-Z0-9“"])/).length;
  const budget = (where, s, w) => ok(words(s) <= w && sents(s) <= 2, where + ": " + words(s) + " words, " + sents(s) + " sentences (at most " + w + " and 2): " + s.slice(0, 70));
  ok(cards.count === 10, "ten step cards");
  for (let i = 0; i < cards.count; i++) { cards.go(i); budget("step " + (i + 1) + " text", stepText(), 36); ok(next() && (i === cards.count - 1 || next().disabled), "step " + (i + 1) + ": Next waits for the action"); }
  const sawIs = (i, s) => { ok(!next().disabled && saw() === s, "step " + i + " (" + saw() + ")"); budget("step " + i + " result", saw(), 36); };
  cards.go(0); card().querySelectorAll(".lx-choice")[2].click();
  sawIs(1, "Every number here is simulated, so the true effect on the 92 homes is known: −0.29 kW. Real studies never see this line; here it lets you score each method.");
  ok(/Simulated data: seed 78/.test(text(card().innerHTML)), "step 1: the chart is labelled simulated");
  { const sp = plotSpecs[plotSpecs.length - 1]; ok(sp.text.rows.length === 24 && sp.text.rows.every((r, t) => r[1] === E.gm.on[t].toFixed(2) && r[2] === E.gm.off[t].toFixed(2)), "step 1: the text version lists every month's two means"); }
  cards.go(1); btns(/Compare months/)[0].click();
  sawIs(2, "The gap is 2.9 times the truth. Homes that opted in were smaller and more engaged before any tariff: selection, not effect.");
  ok((E.naive.est / truth).toFixed(1) === "2.9", "step 2: 2.9 times");
  cards.go(2); btns(/^Fit$/)[0].click();
  ok(next().disabled, "step 3: one fit is not enough");
  card().querySelectorAll(".lx-toggle")[0].click(); btns(/^Fit$/)[0].click(); card().querySelectorAll(".lx-toggle")[1].click(); btns(/^Fit$/)[0].click();
  sawIs(3, "Home size moves it to −0.73 kW; air conditioning moves it little, since it did not drive sign-up. Engagement did, and no meter records it: you cannot control for what you cannot see.");
  ok(card().querySelectorAll("tbody tr").length === 3, "step 3: three fits in the table");
  cards.go(3); btns(/Compare before/)[0].click();
  sawIs(4, "Flat homes, with no new tariff, changed by −0.06 kW: the second summer was cooler (simulated). Before–after credits the tariff with the weather.");
  cards.go(4);
  { const inp = card().querySelector("input"), go = card().querySelector(".lx-na button");
    inp.value = "-0.36"; go.click(); ok(next().disabled && /Not quite/.test(saw()), "step 5: the TOU change alone is not the DiD");
    inp.value = "−0.30"; go.click(); }
  sawIs(5, "DiD: −0.30 kW, about 95% interval −0.33 to −0.27 kW, around the truth −0.29 kW. It removes fixed differences between homes and changes common to both groups.");
  { const sp = plotSpecs[plotSpecs.length - 1]; ok(sp.text.rows.length === 4 && sp.marks.length === 4 && sp.refs[0].y === truth, "step 5: the estimate ladder has four estimates and the truth"); }
  cards.go(5); card().querySelectorAll(".lx-seg button")[1].click();
  ok(next().disabled && /Look again/.test(saw()), "step 6: 'not parallel' is not accepted");
  ok(/Each dot is that month's TOU–flat gap minus the month-12 gap: the change in the gap\. Zero means the gap stayed the same\./.test(text(card().innerHTML)), "step 6: what each dot is, said before the chart");
  card().querySelectorAll(".lx-seg button")[0].click();
  sawIs(6, "Before month 13 the change in the gap stays within 0.04 kW of zero, inside every interval. Similar earlier trends support the comparison; they do not prove what would have happened after.");
  { const sp = plotSpecs.filter(x => x.text && x.text.head[0] === "Months from the start").pop();
    ok(sp && sp.text.rows.length === 24 && sp.text.rows[11][2] === "reference" && sp.text.rows[0][0] === "Month 1 (−12)" && sp.text.rows[23][0] === "Month 24 (+11)" && sp.text.head[1] === "Change in the gap", "step 6: the event study's text version, month 12 the reference, the column named the change in the gap"); }
  cards.go(6); const sg7 = () => card().querySelectorAll(".lx-seg button");
  sg7()[1].click(); sg7()[2].click(); ok(next().disabled, "step 7: two threats are not enough");
  sg7()[3].click();
  sawIs(7, "None of these intervals holds the truth. Only a trend that starts before month 13 (already cutting, early cuts) shows in the months before; spillovers and a second change hide.");
  sg7()[4].click(); ok(card().querySelectorAll("tbody tr").length === 5 && /no$/.test(text(card().querySelectorAll("tbody tr")[4].innerHTML)), "step 7: the table, every threat 'no'");
  cards.go(7); card().querySelectorAll(".lx-choice")[2].click();
  sawIs(8, "Smaller: −0.20 kW per home on average, against −0.29 kW for those who chose it; engaged owners respond more. A result holds for the group it was measured on.");
  cards.go(8); const sg9 = () => card().querySelectorAll(".lx-seg button");
  sg9()[1].click(); ok(next().disabled, "step 9: one threat is not enough");
  sg9()[2].click();
  { const rows = card().querySelectorAll("tbody tr").map(tr => text(tr.innerHTML));
    ok(rows.length === 4 && rows[0] === "Claimed by DiD: 14 regions × 14.0196" && rows[1] === "Gross gain in the 14 adopting regions (14 × 10)140" && rows[2] === "of which moved from the 16 others (16 × 4)64" && rows[3] === "New across all 30 regions76", "step 9: the border case's accounting: 196 claimed; 140 gross, of which 64 moved; 76 new: " + rows.join(" | "));
    ok(F.border.gross - F.border.lost === F.border.net && F.border.lost === -R.border * F.R.nOff, "the moved projects are inside the adopters' gross gain: 140 − 64 = 76"); }
  ok(/Those projects are part of the adopters' \+10 MW/.test(text(card().innerHTML)), "step 9: the border threat says the moved projects are inside the adopters' gain");
  sawIs(9, "A boom shows before 2021; moved projects do not. They shrink the comparison group, so DiD reads 14.0 MW a year a region, while 76 MW a year is new in all.");
  sg9()[0].click(); ok(card().querySelectorAll("tbody tr").length === 0, "step 9: the accounting table shows only for the border case"); sg9()[2].click();
  { const sp = plotSpecs.filter(x => x.text && x.text.head[0] === "Year").pop(); ok(sp && sp.text.rows.length === 10 && sp.text.rows[4][2] === "reference" && sp.text.rows[4][0] === "2020", "step 9: the regions' event study, 2020 the reference"); }
  cards.go(9);
  { const segs = card().querySelectorAll(".m14-case .lx-seg"), kinds = Object.keys(D.kinds);
    ok(segs.length === 4, "step 10: four cases");
    D.classify.forEach((c, k) => segs[k].querySelectorAll("button")[(kinds.indexOf(c.answer) + 1) % 4].click());
    ok(next().disabled && /Not all right yet/.test(saw()), "step 10: wrong names are not accepted");
    D.classify.forEach((c, k) => segs[k].querySelectorAll("button")[kinds.indexOf(c.answer)].click()); }
  sawIs(10, "Selection, confounding, spillover, anticipation: four reasons a comparison group stops being the counterfactual. Write them down before the estimate, not after.");
  ok(live.querySelectorAll("[aria-live]").length >= 2, "results are announced in aria-live regions");
  ["mid", "step-1", "step-3", "step-5", "step-7", "step-9", "step-10"].forEach(sname => { let q = null; try { q = demo.fn(sname); } catch (err) { q = null; } ok(q && q.view === sname, "demo state " + sname + " runs"); });
  const XT = text(xp.innerHTML);
  const TR = (fcOpts && fcOpts.traces || []).map(x => x.text);
  ok(TR[0] === "DiD " + kw(E.did.est) + " (" + band(E.did, kw) + ") for the 92 homes that opted in; truth " + kw(truth) + ".", "explain: the flowchart's reference trace: " + TR[0]);
  ok(TR[1] === "The months before drift: DiD " + kw(F.threat.trend.did.est) + " would overstate the cut." && XT.includes("Truth on this page: " + kw(truth)), "explain: the threat trace and the table's note");
  ok(XT.includes("two simulated panels with known effects (seeds 78 and 233)") && XT.includes("real households, tariffs or regions: only the DOE studies cited below are real"), "explain: the boundary says simulated");
  finish();
})().catch(err => { ok(false, "the stub page test threw: " + (err && err.stack || err)); finish(); });

function finish() {
  ok(NB.length > 0, "the lab notebook exists (learn/notebooks/" + ID + ".ipynb; written by its notebook build step)");
  if (NB) {
    const nb = JSON.parse(NB), src = nb.cells.map(c => c.source.join("")).join("\n");
    ok(nb.cells.every(c => c.cell_type === "markdown" || (c.outputs.length === 0 && c.execution_count === null)), "the notebook is stored without outputs");
    ok(/m14-did-it-work\.json/.test(src) && /REF\["tou"\]/.test(src) && /REF\["regions"\]/.test(src) && /import numpy/.test(src) && !/import pandas|from sklearn|import scipy/.test(src), "the notebook asserts the reference block, with NumPy only");
    ok(/about 60 minutes, plus 90 minutes of practice/.test(src) && /[Ss]imulated/.test(src), "the notebook's times; it says simulated");
  }
  const ALL = [PAGE, RAW, JS, SIDEYML, NB].join("\n");
  ok(!/nuclear|reactor|\bSMR\b|small modular|fission|uranium/i.test(ALL), "no nuclear term");
  ok(!/\bAI\b|artificial intelligence/.test(ALL), "no 'AI' anywhere");
  ok(!/\bFOAK\b|\bNOAK\b|first[- ]of[- ]a[- ]kind|learning[- ](curve|rate)|order[- ]book|anchor[- ](customer|buyer)|subsidy[- ]free|smr-dc|projects\/|research\.(html|qmd)/i.test(ALL), "no deny-listed term");
  const OKH = h => /^https:\/\/doi\.org\/10\./.test(h) || /^https:\/\/www\.energy\.gov\//.test(h) || /^(\.\.\/assets\/learn\/data\/[a-z0-9_-]+\.json|notebooks\/[a-z0-9-]+\.ipynb|[0-9a-z-]+\.html(#[a-z0-9-]+)?)$/.test(h);
  const OWN = PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?<!-- learn:\1:end -->/g, "");
  const hrefs = [...OWN.matchAll(/href="([^"]+)"/g)].map(m => m[1]).concat([...NB.matchAll(/https?:\/\/[^\s"'<>)\]]+/g)].map(m => m[0]), [...PAGE.matchAll(/\]\(([^)]+)\)/g)].map(m => m[1]));
  ok(hrefs.length > 5 && hrefs.every(OKH), "links: learn pages, downloads, doi.org and energy.gov only: " + hrefs.filter(h => !OKH(h)).join(" "));
  ok(!/data-source="excerpt:/.test(PAGE), "no excerpt of the course author's research on this page");
  const PY = fs.readFileSync(path.join(SITE, "learn/path.yml"), "utf8"), entry = PY.split(/\n- kind: /).find(x => new RegExp("\\n  id: " + ID + "\\n").test(x)) || "";
  ok(/\n  status: active\n/.test(entry) && /\n  minutes: 40\n/.test(entry) && /lab_minutes: 60/.test(entry) && /practice_minutes: 90/.test(entry) && /after: \[B2, K5\]/.test(entry), "path.yml: active, 40 + 60 + 90 minutes, after B2 and K5");
  const fm = k => ((PAGE.match(new RegExp("^" + k + ': "(.*)"$', "m")) || [])[1]), py = k => ((entry.match(new RegExp("\\n  " + k + ': "(.*)"')) || [])[1]);
  ok(fm("title") === py("title") && fm("subtitle") === py("subtitle") && fm("title") === "Did it work? Learning from data with regression and natural experiments", "the page's title and subtitle equal path.yml's");
  const GJ = JSON.parse(fs.readFileSync(L("data/glossary.json"), "utf8")), marks = [...JS.matchAll(/\[\[([a-z0-9-]+)\|/g)].map(m => m[1]);
  ok(marks.length >= 8 && marks.every(m => GJ[m]), "every glossary mark has a definition (glossary.json, built from glossary.yml and the sidecars): " + marks.filter(m => !GJ[m]).join(", "));
  ["selection-bias", "parallel-trends", "event-study", "confounding", "spillover-effect", "anticipation-effect"].forEach(k => ok(GJ[k] && new RegExp("id: " + k + "\\n").test(SIDEYML), "the sidecar defines " + k));
  ok(factsMs < 1500, "speed in Node: the facts (seven panels) take " + factsMs + " ms");
  console.log((fails ? "FAILED " + fails + " of " : "ok: ") + checks + " checks (" + ID + ")");
  process.exit(fails ? 1 : 0);
}
