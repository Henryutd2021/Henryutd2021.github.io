// fallback_grid_operator.js — writes the static fallback figure of Lesson 0 (the expert rule's day, as inline SVG) into
// learn/00-grid-operator.qmd between the "fallback-svg" markers, so readers without JavaScript still see the day.
// Colours come from CSS classes (assets/learn/learn.css), so the figure follows day and night mode.
// Usage (from the site folder):  node _tests/learn/fallback_grid_operator.js          (rewrite)
//                                node _tests/learn/fallback_grid_operator.js --check  (exit 1 if out of date)
"use strict";
const fs = require("fs");
const path = require("path");
const SITE = path.resolve(__dirname, "..", "..");
const M = require(path.join(SITE, "assets/learn/grid-operator.js"));
const town = JSON.parse(fs.readFileSync(path.join(SITE, "assets/learn/data/town.json"), "utf8"));
const QMD = path.join(SITE, "learn/00-grid-operator.qmd");

function svg() {
  const ex = M.expert(town, "spring"), W = 720, H = 300, Mg = { l: 52, r: 10, t: 30, b: 34 }, YMAX = 400;
  const pw = W - Mg.l - Mg.r, ph = H - Mg.t - Mg.b;
  const x = t => Mg.l + pw * t / 24, y = v => Mg.t + ph * (1 - v / YMAX), f = v => v.toFixed(1);
  const out = [];
  out.push(`<svg class="lx-static" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="lx-static-title">`);
  out.push(`<title id="lx-static-title">Prairie Town's day under the expert rule: stacked hourly supply from nuclear, wind, solar, ` +
           `the combined-cycle gas plant and the gas peaker, with demand as a line. Demand peaks at ${Math.max(...ex.hours.map(r => r.demand))} MW at 19:00.</title>`);
  out.push('<g class="ex-grid">' + [0, 100, 200, 300, 400].map(v => `<line x1="${Mg.l}" x2="${Mg.l + pw}" y1="${f(y(v))}" y2="${f(y(v))}"/>`).join("") + "</g>");
  out.push('<g class="ex-axis">' + [0, 100, 200, 300, 400].map(v => `<text x="${Mg.l - 8}" y="${f(y(v) + 5)}" text-anchor="end">${v}</text>`).join("") +
           `<text x="${Mg.l - 8}" y="14" text-anchor="end">MW</text>` +
           [0, 6, 12, 18, 24].map(v => `<text x="${f(x(v))}" y="${H - 8}" text-anchor="${v === 0 ? "start" : v === 24 ? "end" : "middle"}">${(v < 10 ? "0" : "") + v}:00</text>`).join("") + "</g>");
  const cw = x(1) - x(0), bw = cw * 0.74, off = (cw - bw) / 2, bars = [];
  ex.hours.forEach((r, t) => {
    let base = 0;
    [["nuclear", r.nuclear], ["wind", r.wind], ["solar", r.solar], ["cc", r.cc], ["pk", r.pk]].forEach(([k, v]) => {
      if (v <= 0) return;
      bars.push(`<rect class="lx-fill-${k}" x="${f(x(t) + off)}" y="${f(y(base + v))}" width="${f(bw)}" height="${f(y(base) - y(base + v))}"/>`);
      base += v;
    });
    if (r.curtailed > 0) bars.push(`<rect class="lx-spilled" x="${f(x(t) + off + 0.5)}" y="${f(y(base + r.curtailed))}" width="${f(bw - 1)}" height="${f(y(base) - y(base + r.curtailed))}"/>`);
  });
  out.push("<g>" + bars.join("") + "</g>");
  let d = `M${f(x(0))},${f(y(ex.hours[0].demand))}`;
  ex.hours.forEach((r, t) => { d += `V${f(y(r.demand))}H${f(x(t + 1))}`; });
  out.push(`<path class="lx-demand" d="${d}"/>`);
  out.push("</svg>");
  const legend = [["nuclear", "Nuclear"], ["wind", "Wind"], ["solar", "Solar"], ["cc", "Gas combined-cycle"], ["pk", "Gas peaker"]]
    .map(([k, s]) => `<li><span class="ex-swatch lx-bg-${k}" aria-hidden="true"></span>${s}</li>`).join("") +
    '<li><span class="lx-swatch-line" aria-hidden="true"></span>Demand</li><li><span class="ex-swatch lx-sw-spilled" aria-hidden="true"></span>Spilled wind</li>';
  return out.join("\n") + `\n<ul class="ex-legend lx-legend">${legend}</ul>`;
}

const START = "<!-- fallback-svg:start -->", END = "<!-- fallback-svg:end -->";
const text = fs.readFileSync(QMD, "utf8"), a = text.indexOf(START), b = text.indexOf(END);
if (a < 0 || b < a) { console.error("markers not found in " + QMD); process.exit(2); }
const want = text.slice(0, a + START.length) + "\n" + svg() + "\n" + text.slice(b);
if (process.argv.includes("--check")) {
  const same = want === text;
  console.log(same ? "fallback figure: up to date" : "fallback figure: OUT OF DATE (run without --check)");
  process.exit(same ? 0 : 1);
}
fs.writeFileSync(QMD, want);
console.log("wrote the fallback figure into " + path.relative(SITE, QMD));
