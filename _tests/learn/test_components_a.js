// test_components_a.js — Node tests for the shared chart components plot.js (LX.Plot,
// LX.PlotCard), scatter.js (LX.Scatter) and pricechart.js (LX.PriceChart, LX.HourPicker). Checks their pure helpers,
// that each file defines its components when run with a stub window.LX, that the bundle holds them, and that no lesson
// still carries the copies they replace (lessons 2, 3, 4, 6, M1, B2).
// Usage (from the site folder):  node _tests/learn/test_components_a.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const read = p => fs.readFileSync(p, "utf8");
let checks = 0, fails = 0;
function ok(cond, msg) { checks++; if (!cond) { fails++; console.log("FAIL:", msg); } }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---------------- plot.js: pure helpers
const plot = require(L("components/plot.js"));
ok(same(plot.ticks(0, 0.3, 0.1).map(t => t[0]), [0, 0.1, 0.2, 0.3]), "plot ticks: decimal-safe steps (0, 0.1, 0.2, 0.3)");
ok(same(plot.ticks(-100, 500, 100, v => v + " MW").map(t => t[1]), ["-100 MW", "0 MW", "100 MW", "200 MW", "300 MW", "400 MW", "500 MW"]), "plot ticks: from a negative min, labels from fmt");
ok(same(plot.ticks(0, 150, 37.5).map(t => t[0]), [0, 37.5, 75, 112.5, 150]), "plot ticks: a quarter step reaches the top exactly");
ok(plot.ticks(0, 1, 0).length === 0, "plot ticks: no step, no ticks");
const tk = [[0, "00:00"], [6, "06:00"], [24, "24:00"]];
ok(same(tk.map((t, i, l) => plot.anchor(t, i, l, 0, 24)), ["start", "middle", "end"]), "plot anchor: the first tick at min starts, the last at max ends");
ok(plot.anchor([0.5, "Mon"], 0, [[0.5, "Mon"]], 0, 168) === "middle" && plot.anchor([3, "x", "end"], 1, [[0], [3]], 0, 3) === "end", "plot anchor: off-edge ticks centred; explicit anchors kept");
ok(same(plot.points({ values: [5, 6, 7], x0: 0.5 }), [[0.5, 5], [1.5, 6], [2.5, 7]]), "plot points: values at x0 + i (mid-hour)");
ok(same(plot.points({ values: [1, 2], dx: 2 }), [[0, 1], [2, 2]]) && same(plot.points({ pts: [[3, 4]] }), [[3, 4]]), "plot points: dx, and pts as given");
const X = v => 10 * v, Y = v => 100 - v;
ok(plot.linePath([[0, 10], [1, 20]], X, Y) === "M0.0 90.0 L10.0 80.0", "plot linePath: a plain line");
ok(plot.linePath([[0, 10], [1, 20]], X, Y, 1) === "M0.0 90.0 H10.0 L10.0 80.0 H20.0", "plot linePath: a step line holds each value for its hour");
ok(plot.linePath([[0, 10], [1, 20]], X, Y, 1, 1.6) === "M0.0 91.6 H10.0 L10.0 81.6 H20.0", "plot linePath: an offset moves the line down in pixels");
ok(plot.linePath([[0, 10], [1, null], [2, 30]], X, Y) === "M0.0 90.0 M20.0 70.0", "plot linePath: a missing value leaves a gap");
ok(plot.column(0, 0, 24, 24) === 0 && plot.column(23.99, 0, 24, 24) === 23 && plot.column(24, 0, 24, 24) === 23 && plot.column(12.5, 0, 24, 24) === 12, "plot column: x to one of n columns, clamped");

// ---------------- pricechart.js: pure helpers
const pc = require(L("components/pricechart.js"));
ok(pc.priceTop([{ v: [0, 40, 80] }]) === 100, "price top: at least $100");
ok(pc.priceTop([{ v: [0, 40, 101] }]) === 150 && pc.priceTop([{ v: [40] }], [0, 230]) === 250, "price top: rounded up to $50, the ghost run included");
ok(same(pc.offsets(3), [-1.6, 0, 1.6]) && same(pc.offsets(1), [0]) && same(pc.offsets(2), [-0.8, 0.8]), "price offsets: 1.6 px apart, centred on the middle line");
{ const tt = pc.textTable([{ label: "North", v: [10, 20] }, { label: "South", v: [30.4, 40] }], [5, 25.6], "With the ramp rule");
  ok(same(tt.head, ["Hour", "North ($/MWh)", "South ($/MWh)", "With the ramp rule, dashed ($/MWh)"]) && same(tt.rows[1], ["01:00", 20, 40, 26]),
     "price text version: the dashed earlier run is a column of its own");
  const t0 = pc.textTable([{ label: "Price", v: [1] }], null, null, "$/kWh"); ok(same(t0.head, ["Hour", "Price ($/kWh)"]) && t0.rows[0].length === 2, "price text version: no ghost, no extra column"); }
ok(pc.hh(0) === "00:00" && pc.hh(19) === "19:00" && pc.hh(24) === "00:00" && pc.hh(-1) === "23:00", "price hh: hours wrap round midnight");

// ---------------- scatter.js: pure helpers
const sc = require(L("components/scatter.js"));
ok(same(sc.size(800), { phone: false, W: 560, H: 330 }), "scatter size: desktop drawing 560 x 330");
ok(same(sc.size(375), { phone: true, W: 375, H: 300 }) && sc.size(200).W === 300, "scatter size: phones at real width (at least 300), 300 high");
const lp1 = sc.labelPos(100, 50, "Wind", 46, 544), lp2 = sc.labelPos(530, 50, "Nuclear", 46, 544), lp3 = sc.labelPos(150, 50, "A very long label for a small chart", 46, 260);
ok(lp1.anchor === "start" && lp1.x === 116 && lp1.y === 55, "scatter label: right of the dot when it fits");
ok(lp2.anchor === "end" && lp2.x === 514, "scatter label: left of the dot near the right edge");
ok(lp3.anchor === "middle" && lp3.y === 33 && Math.abs(lp3.x - (46 + 35 * 7.4 / 2)) < 1e-9, "scatter label: above the dot when neither side fits, kept inside the chart");

// ---------------- each file defines its components with a stub window.LX (as the bundle runs them)
[["plot.js", ["Plot", "PlotCard"]], ["scatter.js", ["Scatter"]], ["pricechart.js", ["PriceChart", "HourPicker"]]].forEach(([f, names]) => {
  const src = read(L("components/" + f));
  ok(/^\/\* /.test(src) && src.split("\n")[0].indexOf(f) >= 0, `${f}: the header comment names the file`);
  const LX = { H: () => ({}), S: () => ({}), onTheme: () => {}, esc: String, rich: String, clamp: (x, a, b) => Math.max(a, Math.min(b, x)) };
  const ctx = { window: { LX } };
  try { vm.runInNewContext(src, ctx); } catch (e) { ok(false, `${f}: runs with a stub window.LX (${e.message})`); return; }
  names.forEach(n => ok(typeof LX[n] === "function" && new RegExp("LX\\." + n + " = ").test(src), `${f}: defines LX.${n}`));
  ok(!/#[0-9a-f]{3,6}\b/i.test(src.replace(/\/\*[\s\S]*?\*\//, "")), `${f}: no hard-coded colours (tokens only)`);
});
["plot.css", "scatter.css", "pricechart.css"].forEach(f => {
  const css = read(L("components/" + f));
  ok(css.split("\n")[0].indexOf(f) >= 0, `${f}: the header comment names the file`);
  ok(!/#[0-9a-f]{3,6}\b/i.test(css.replace(/\/\*[\s\S]*?\*\//g, "")) && !/rgba?\(/.test(css), `${f}: colours from --lx- tokens only`);
});
const bundle = read(L("learn.js")), bcss = read(L("learn.css"));
["Plot", "PlotCard", "Scatter", "PriceChart", "HourPicker"].forEach(n => ok(bundle.indexOf("LX." + n + " = ") >= 0, `bundle defines LX.${n}`));
[".lx-plotcard", ".lx-readout", ".lx-scatter-dot", ".lx-hours"].forEach(c => ok(bcss.indexOf(c) >= 0, `learn.css holds ${c}`));
ok(bundle.indexOf("LX.Plot = ") < bundle.indexOf("LX.PriceChart = "), "bundle: plot.js comes before pricechart.js (built on it)");
// ".lx-chip" already means a tappable chip (explain.css); the value chips are .lx-readout, so the two never clash
ok(!/\.lx-chip\b/.test(read(L("components/plot.css"))), "plot.css: does not reuse .lx-chip");

// ---------------- no lesson keeps a copy of what the shared components now do
const js = id => read(L(id + ".js")), qmd = id => read(path.join(SITE, "learn", id + ".qmd"));
ok(!/function plot\(/.test(js("03-balancing")) && !/function plot\(/.test(js("04-forecasts")), "lessons 3 and 4: no lesson-local plot()");
ok(/LX\.PlotCard\(/.test(js("03-balancing")) && /LX\.PlotCard\(/.test(js("04-forecasts")), "lessons 3 and 4: the chart card is LX.PlotCard");
ok(!/function LineChart\(/.test(js("02-demand")) && /LX\.Plot\(/.test(js("02-demand")), "lesson 2: no LineChart; its hourly charts use LX.Plot");
ok(!/function Scatter\(/.test(js("06-three-jobs")) && /LX\.Scatter\(/.test(js("06-three-jobs")), "lesson 6: no lesson-local Scatter; LX.Scatter");
ok(/LX\.PriceChart\(/.test(js("m01-dispatch-to-lmp")) && /LX\.HourPicker\(/.test(js("m01-dispatch-to-lmp")) && !/createElementNS|S\("svg"/.test(js("m01-dispatch-to-lmp").slice(js("m01-dispatch-to-lmp").indexOf("function PriceChart"), js("m01-dispatch-to-lmp").indexOf("function HourPicker"))), "M1: the price chart and hour picker are LX.PriceChart and LX.HourPicker");
ok(/LX\.Plot\(/.test(js("b02-python-data")) && !/S\("svg"/.test(js("b02-python-data")), "B2: its charts are drawn by LX.Plot");
[["03-balancing", /\.w1-(stage|chips?|plot)\b/], ["04-forecasts", /\.w1-(stage|chips?|plot)\b/], ["02-demand", /\.t2-(cv|chart|ax|mk|num)\b(?!-)/], ["06-three-jobs", /\.lx6-(scatter|ax|axt|dl|dot)\b/]].forEach(([id, re]) =>
  ok(!re.test(qmd(id)), `${id}.qmd: no lesson-local copy of the shared styles in its style block`));
ok(!/m1-chart|m1-hours/.test(js("m01-dispatch-to-lmp")) && !/b2-chart/.test(js("b02-python-data")), "M1 and B2: no lesson-local copy of the shared chart CSS");
[["02-demand", "02-demand"], ["03-balancing", "03-balancing"], ["04-forecasts", "04-forecasts"]].forEach(([id]) => ok(/LX\.demo\(root,/.test(js(id)), `${id}: registers its demo states (LX.demo)`));

console.log(`${checks} checks, ${fails} failed`);
process.exit(fails ? 1 : 0);
