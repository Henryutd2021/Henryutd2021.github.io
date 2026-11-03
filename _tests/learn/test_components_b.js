// test_components_b.js — Node tests for the components promoted from lessons 6, 7, 8, 12 and 13 at the W1 merge (group B):
//   tornado, costsplit, supplystack, frontier, steelman, boundary, share.
//   Each component file defines its LX.<Name> when run with a stub window.LX, and the bundle holds it; the pure parts
//   (tornado layout, cost split segments and text, supply-stack clearing and axes, frontier axis top and equal-score line,
//   share links) match what the lessons drew before; no lesson still defines its own copy.
// Usage (from the site folder):  node _tests/learn/test_components_b.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const J = p => JSON.parse(fs.readFileSync(L(p), "utf8"));
let checks = 0, fails = 0;
function ok(cond, msg) { checks++; if (!cond) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, e) => Math.abs(a - b) <= (e == null ? 1e-9 : e);

// ---------------- each file defines its component (stub window.LX), and the bundle holds it
const NAMES = { tornado: ["Tornado"], costsplit: ["CostSplit"], supplystack: ["SupplyStack"], frontier: ["Frontier"], steelman: ["Steelman"],
                boundary: ["Boundary"], share: ["Share", "copyText"] };
const bundle = fs.readFileSync(L("learn.js"), "utf8"), bcss = fs.readFileSync(L("learn.css"), "utf8");
Object.keys(NAMES).forEach(f => {
  const src = fs.readFileSync(L("components/" + f + ".js"), "utf8");
  const ctx = { window: { LX: {} } };
  try { vm.runInNewContext(src, ctx); ok(true, `${f}.js runs`); } catch (e) { ok(false, `${f}.js runs: ${e.message}`); }
  NAMES[f].forEach(n => {
    ok(typeof ctx.window.LX[n] === "function", `${f}.js defines LX.${n}`);
    ok(bundle.indexOf("LX." + n + " = ") >= 0, `bundle defines LX.${n}`);
  });
  ok(fs.existsSync(L("components/" + f + ".css")) && bcss.indexOf(fs.readFileSync(L("components/" + f + ".css"), "utf8").trim().slice(0, 120)) >= 0, `${f}.css is in learn.css`);
  ok(/^\/\* [a-z]+\.js — LX\./.test(src), `${f}.js: header comment names the file and the component`);
  const css = fs.readFileSync(L("components/" + f + ".css"), "utf8");
  ok(!/#[0-9a-f]{3,6}\b|rgba?\(/i.test(css.replace(/\/\*[\s\S]*?\*\//g, "")), `${f}.css: colours from tokens only`);
});
function mod(f) { const ctx = { module: { exports: {} } }; vm.runInNewContext(fs.readFileSync(L("components/" + f + ".js"), "utf8"), ctx); return ctx.module.exports; }

// ---------------- tornado: the layout of lesson 7's tornado, as the lesson drew it before
const TO = mod("tornado"), M7 = require(L("07-cost.js")), D7 = J("data/07-cost.json");
M7.TECHS.forEach(k => {
  const tw = M7.tornado(D7, k), Lo = TO.tornadoLayout(tw.rows, tw.base);
  ok(Lo.rows.map(r => r.name).join() === tw.rows.map(r => r.name).join(), `${k} tornado: the component keeps the model's order (sorted by swing)`);
  ok(Lo.rows.every((r, i) => i === 0 || Lo.rows[i - 1].swing >= r.swing), `${k} tornado: rows sorted by swing`);
  ok(Lo.rows.every((r, i) => near(r.min, tw.rows[i].min) && near(r.max, tw.rows[i].max) && near(r.swing, tw.rows[i].swing)), `${k} tornado: min, max and swing as the model's`);
  const lo = Math.min(...tw.rows.map(r => r.min)), hi = Math.max(...tw.rows.map(r => r.max)), pad = (hi - lo) * 0.28 + 1;
  ok(near(Lo.a, lo - pad) && near(Lo.b, hi + pad), `${k} tornado: axis padded as before (${Lo.a.toFixed(2)} to ${Lo.b.toFixed(2)})`);
  ok(near(Lo.x(Lo.a), 0) && near(Lo.x(Lo.b), 100) && Lo.x(tw.base) > 0 && Lo.x(tw.base) < 100, `${k} tornado: x maps the axis to 0..100% and the base inside`);
  ok(Lo.rows.every(r => Lo.x(r.min) <= Lo.x(tw.base) + 1e-9 && Lo.x(r.max) >= Lo.x(tw.base) - 1e-9), `${k} tornado: every bar straddles the base line`);
});
const tie = TO.tornadoLayout([{ label: "a", atLo: 1, atHi: 3 }, { label: "b", atLo: 5, atHi: 3 }, { label: "c", atLo: 0, atHi: 9 }], 3);
ok(tie.rows.map(r => r.label).join("") === "cab", "tornado: equal swings keep their order (stable sort)");
ok(TO.tornadoLayout(tie.rows.slice().reverse(), 3, { sort: false }).rows.map(r => r.label).join("") === "bac", "tornado: sort: false keeps the given order");
ok(TO.tornadoLayout([], 5).a < 5 && TO.tornadoLayout([], 5).b > 5, "tornado: no rows still gives an axis around the base");

// ---------------- cost split: segments and text as lesson 7's bar() and splitText()
const CS = mod("costsplit");
const PARTS = [{ key: "capital", label: "Building the plant", color: "var(--lx-tier-2)" }, { key: "fom", label: "Fixed upkeep", color: "var(--lx-tier-5)" },
               { key: "fuel", label: "Fuel", color: "var(--lx-tier-4)" }, { key: "vom", label: "Upkeep per MWh", color: "var(--lx-ink-3)", words: "upkeep per MWh" }];
const usd = v => "$" + v.toFixed(2);
M7.TECHS.forEach(k => {
  const Lk = M7.lcoe(M7.inputs(D7, k)), segs = CS.segments(PARTS, Lk, 100);
  const old = [["capital", "building the plant"], ["fom", "fixed upkeep"], ["fuel", "fuel"], ["vom", "upkeep per MWh"]].filter(c => Lk[c[0]] > 0.005);
  ok(segs.map(s => s.key).join() === old.map(c => c[0]).join(), `${k} split: the same parts drawn (above $0.005)`);
  ok(near(segs.reduce((a, s) => a + s.pct, 0), Lk.total, 1e-6), `${k} split: segment widths add up to the total at scale 100`);
  ok(CS.splitText(PARTS, Lk, usd) === old.map(c => c[1] + " " + usd(Lk[c[0]])).join(", "), `${k} split: text as before ("${CS.splitText(PARTS, Lk, usd).slice(0, 40)}...")`);
});
ok(M7.lcoe(M7.inputs(D7, "wind")).fuel === 0 && CS.segments(PARTS, M7.lcoe(M7.inputs(D7, "wind")), 1).every(s => s.key !== "fuel"), "split: wind has no fuel segment");

// ---------------- supply stack: the default clearing equals lesson 8's model; the axes
const SS = mod("supplystack"), M8 = require(L("08-merit-order.js"));
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
let same = 0;
for (let n = 0; n < 500; n++) {
  const keys = ["wind", "solar", "nuclear", "cc", "peaker"];
  const blocks = keys.map(k => ({ key: k, mw: Math.round(rnd() * 200), offer: Math.round((rnd() * 140 - 25) * 4) / 4 }))
    .sort((a, b) => a.offer - b.offer || keys.indexOf(a.key) - keys.indexOf(b.key));
  if (blocks[0].mw === 0) blocks[0].mw = 10;
  const d = n % 50 === 0 ? 0 : Math.round(rnd() * 600), a = SS.clear(blocks, d), b = M8.clear(blocks, d);
  if (JSON.stringify(a) === JSON.stringify(b)) same++;
}
ok(same === 500, `supply stack: the component's clearing equals lesson 8's on 500 random hours (${same})`);
const sc0 = SS.scaleOf([{ offer: 0 }, { offer: 10 }, { offer: 40 }, { offer: 100 }], 450), scN = SS.scaleOf([{ offer: -25 }, { offer: 10 }, { offer: 110.44 }], 750);
ok(sc0.yMin === 0 && sc0.yMax === 120 && sc0.step === 20 && sc0.xStep === 100, "supply stack: axes $0 to $120 every $20, MW every 100");
ok(scN.yMin === -40 && scN.yMax === 160 && scN.xStep === 150 && scN.yMin <= -25 && scN.yMax >= 110.44, "supply stack: a negative offer opens the axis below zero; xMax 750 ticks every 150");

// ---------------- frontier: the cost axis top and the equal-score line
const FR = mod("frontier");
ok(FR.yTop([{ cost: 120e6 }, { cost: 131.4e6 }], 200) === 200, "frontier: the cost axis keeps its lowest top ($200M)");
ok(FR.yTop([{ cost: 268.5e6 }], 200) === 290, "frontier: a dear point raises the top to the next 40 plus 10 ($290M)");
const p0 = { co2: 400e3, cost: 140e6 }, sl = FR.scoreLine(44, p0, 850e3);
const yAt = x => sl.y0 + (sl.y1 - sl.y0) * (x - sl.x0) / (sl.x1 - sl.x0);
ok(near(yAt(p0.co2), p0.cost, 1e-3) && near((sl.y1 - sl.y0) / (sl.x1 - sl.x0), -44, 1e-9), "frontier: the equal-score line passes through the point with slope −price");
ok(FR.sortFrontier([{ co2: 3 }, { co2: 1 }, { co2: 2 }]).map(p => p.co2).join("") === "123", "frontier: points sorted by CO₂");

// ---------------- share: links
const SH = mod("share");
ok(SH.isNameSafe("plan-w530-s160-g220-p70-n0-b10-e50-fuel385-nk8255") && !SH.isNameSafe("plan w1") && !SH.isNameSafe(""), "share: lesson 13's plan hash is name-safe; spaces and empty are not");
ok(SH.shareUrl("https://x.org/learn/13-capstone.html#explain", "#plan-w1") === "https://x.org/learn/13-capstone.html#plan-w1", "share: the link replaces the page's hash");
ok(SH.cleanHash("a b/c") === "a%20b%2Fc", "share: unsafe characters are percent-encoded");

// ---------------- no lesson keeps its own copy
const lessons = fs.readdirSync(L(".")).filter(f => f.endsWith(".js") && f !== "learn.js");
const COPIES = [/function Steelman\b/, /function StackChart\b/, /function FrontierChart\b/, /function Boundary\b/, /function Slider\b/, /lx[0-9]+-steel/, /lx7-(?:split|srow|bar|key|torn|trow|tbar)\b/,
                /lx8-chart\b/, /lx13-(?:bound|share|fc|alt)\b/, /navigator\.clipboard/];
lessons.forEach(f => {
  const src = fs.readFileSync(L(f), "utf8");
  if (f === "ck-f-estimate.js") return;   // its copy button belongs to the checkpoint runner (another group's component)
  COPIES.forEach(re => ok(!re.test(src), `${f}: no lesson-local copy (${re.source})`));
});
fs.readdirSync(path.join(SITE, "learn")).filter(f => /^(06|07|08|12|13)-.*\.qmd$/.test(f)).forEach(f => {
  const src = fs.readFileSync(path.join(SITE, "learn", f), "utf8");
  ok(!/lx6-(?:steel|side)|lx13-bound/.test(src), `${f}: no promoted lesson-local CSS left`);
});
ok(/LX\.Frontier\(/.test(fs.readFileSync(L("12-trade-offs.js"), "utf8")) && !/ui\.FrontierChart|FrontierChart:/.test(fs.readFileSync(L("12-trade-offs.js"), "utf8") + fs.readFileSync(L("13-capstone.js"), "utf8")), "lesson 12 draws with LX.Frontier; LX.townPlan.ui no longer carries a chart");

console.log(`${checks} checks, ${fails} failed`);
process.exit(fails ? 1 : 0);
