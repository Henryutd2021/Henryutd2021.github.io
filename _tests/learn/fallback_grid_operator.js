// fallback_grid_operator.js — writes the static fallback figure of Lesson 0 (the cheapest-first rule's day, as inline SVG,
// with a text-version table of every hour) into learn/00-grid-operator.qmd between the "fallback-svg" markers, so readers
// without JavaScript, and screen-reader users, still get the day.
// Colours are the Learn tokens (assets/learn/components/base.css), so the figure follows day and night mode.
// Usage (from the site folder):  node _tests/learn/fallback_grid_operator.js          (rewrite)
//                                node _tests/learn/fallback_grid_operator.js --check  (exit 1 if out of date)
"use strict";
const fs = require("fs");
const path = require("path");
const SITE = path.resolve(__dirname, "..", "..");
const M = require(path.join(SITE, "assets/learn/grid-operator.js"));
const town = JSON.parse(fs.readFileSync(path.join(SITE, "assets/learn/data/town.json"), "utf8"));
const year = JSON.parse(fs.readFileSync(path.join(SITE, "assets/learn/data/town_year.json"), "utf8"));
const world = M.prepare(town, year, "lesson0");
const QMD = path.join(SITE, "learn/00-grid-operator.qmd");
const C = { nuclear: "--lx-nuc", solar: "--lx-solar", wind: "--lx-wind", cc: "--lx-cc", pk: "--lx-pk" };
const NAMES = { nuclear: "Nuclear", solar: "Solar", wind: "Wind", cc: "Gas combined-cycle", pk: "Gas peaker" };

function svg() {
  const ex = M.expert(world), W = 720, H = 280, Mg = { l: 46, r: 8, t: 14, b: 28 }, YMAX = 400;
  const pw = W - Mg.l - Mg.r, ph = H - Mg.t - Mg.b;
  const x = t => Mg.l + pw * t / 24, y = v => Mg.t + ph * (1 - v / YMAX), f = v => v.toFixed(1);
  const peak = Math.max(...ex.hours.map(r => r.demand)), pkH = ex.hours.filter(r => r.pk > 0).map(r => r.t);
  const out = [];
  out.push(`<svg viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="lx-static-title">`);
  out.push(`<title id="lx-static-title">Prairie Town's day under the cheapest-first rule: hourly supply stacked by plant, with demand as a dashed line. ` +
           `Demand peaks at ${peak} MW; the peaker runs at ${pkH.map(t => (t < 10 ? "0" : "") + t + ":00").join(" and ")}.</title>`);
  out.push("<g>" + [0, 100, 200, 300, 400].map(v => `<line x1="${Mg.l}" x2="${Mg.l + pw}" y1="${f(y(v))}" y2="${f(y(v))}" stroke="var(--lx-line)"/>` +
           `<text x="${Mg.l - 6}" y="${f(y(v) + 4)}" text-anchor="end" font-size="13" fill="var(--lx-ink-3)">${v}</text>`).join("") +
           [0, 6, 12, 18, 24].map(v => `<text x="${f(x(v))}" y="${H - 8}" text-anchor="${v === 0 ? "start" : v === 24 ? "end" : "middle"}" font-size="13" fill="var(--lx-ink-3)">${(v < 10 ? "0" : "") + v}:00</text>`).join("") + "</g>");
  const cw = x(1) - x(0), bw = cw * 0.8, off = (cw - bw) / 2, bars = [];
  ex.hours.forEach((r, t) => {
    let base = 0;
    ["nuclear", "solar", "wind", "cc", "pk"].forEach(k => {
      const v = r[k]; if (v <= 0) return;
      bars.push(`<rect x="${f(x(t) + off)}" y="${f(y(base + v))}" width="${f(bw)}" height="${f(y(base) - y(base + v))}" fill="var(${C[k]})"/>`);
      base += v;
    });
  });
  out.push("<g>" + bars.join("") + "</g>");
  let d = `M${f(x(0))},${f(y(ex.hours[0].demand))}`;
  ex.hours.forEach((r, t) => { d += `V${f(y(r.demand))}H${f(x(t + 1))}`; });
  out.push(`<path d="${d}" fill="none" stroke="var(--lx-ink)" stroke-width="2" stroke-dasharray="5 3"/>`);
  out.push("</svg>");
  const legend = ["nuclear", "solar", "wind", "cc", "pk"].map(k => `<span><i style="--c:var(${C[k]})"></i>${NAMES[k]}</span>`).join("") +
    '<span><i class="line"></i>Demand</span>';
  // text version: the same day as a table, one row per hour, in MW (the figure's title alone is not the data)
  const hh = t => (t < 10 ? "0" : "") + t + ":00";
  const rows = ex.hours.map(r => `<tr><td>${hh(r.t)}</td><td>${r.demand}</td>` +
    ["nuclear", "wind", "solar", "cc", "pk"].map(k => `<td>${Math.round(r[k])}</td>`).join("") + `<td>${Math.round(r.curtailed)}</td></tr>`).join("");
  const table = `<details class="lx-textalt"><summary>Text version: the day as a table, in MW</summary><div class="lx-scroll-x"><table class="lx-mini-table">` +
    `<thead><tr><th scope="col">Hour</th><th scope="col">Demand</th><th scope="col">Nuclear</th><th scope="col">Wind used</th><th scope="col">Solar used</th>` +
    `<th scope="col">Gas combined-cycle</th><th scope="col">Gas peaker</th><th scope="col">Wind and solar spilled</th></tr></thead><tbody>${rows}</tbody></table></div></details>`;
  return out.join("\n") + `\n<div class="lx-legend" aria-hidden="true">${legend}</div>\n${table}`;
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
