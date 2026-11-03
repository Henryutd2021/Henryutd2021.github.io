// test_f02-systems-and-map.js — Node tests for F2 (assets/learn/f02-systems-and-map.js), its data
// (assets/learn/data/f02-systems-and-map.json) and every number the page states.
// Usage (from the site folder):  node _tests/learn/test_f02-systems-and-map.js
"use strict";
const fs = require("fs");
const path = require("path");
const SITE = path.resolve(__dirname, "..", "..");
const rd = p => fs.readFileSync(path.join(SITE, p), "utf8");
const M = require(path.join(SITE, "assets/learn/f02-systems-and-map.js"));
const D = JSON.parse(rd("assets/learn/data/f02-systems-and-map.json"));
const QMD = rd("learn/f02-systems-and-map.qmd");
const JS = rd("assets/learn/f02-systems-and-map.js");
const PATH = rd("learn/path.yml");
const L9 = JSON.parse(rd("assets/learn/data/09-storage.json"));
const SF = D.stockflow, RS = SF.reservoir, B = SF.battery, C = SF.carbon, R = D.ripple;

let checks = 0, fails = 0;
function ok(cond, msg) { checks++; if (!cond) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, e) => Math.abs(a - b) <= (e || 1e-6);
const fx = v => Math.round(v).toLocaleString("en-US");
const range = (a, b, s) => { const o = []; for (let v = a; v <= b + 1e-9; v += s) o.push(+v.toFixed(6)); return o; };

// ---------------- the stock identity and the floor and ceiling
{
  const a = M.stepStock(10, 5, 3, 20); ok(a.s === 12 && a.spill === 0 && a.short === 0, "step: 10 + 5 − 3 = 12");
  const b = M.stepStock(18, 5, 1, 20); ok(b.s === 20 && near(b.spill, 2), "step: above the ceiling spills");
  const c = M.stepStock(2, 0, 5, 20); ok(c.s === 0 && near(c.short, 3), "step: below the floor cuts the outflow short");
}

// ---------------- reservoir
{
  const inf = M.reservoirInflow(RS);
  ok(inf.length === 52 && near(inf[RS.inflow.peak], RS.inflow.base + RS.inflow.amp) && inf.every(v => v >= RS.inflow.base - 1e-9), "inflow: 52 weeks, peak in week 20, never below the base");
  const avg = M.simReservoir(RS, 0).avgIn;
  ok(Math.round(avg) === 101, `average inflow ${avg.toFixed(2)} MW rounds to 101`);
  const win = range(RS.release.min, RS.release.max, RS.release.step).filter(r => M.simReservoir(RS, r).won);
  ok(win.join() === "100,105,110,115", `winning releases on the slider: ${win.join(", ")} MW`);
  ok(!M.simReservoir(RS, RS.release.start).won && M.simReservoir(RS, RS.release.start).firstDry >= 0, "the slider starts at a release that runs dry");
  range(0, 200, 5).forEach(r => {
    const x = M.simReservoir(RS, r), k = RS.hours / 1000;
    // conservation: start + inflow − release delivered − spill = end
    const tin = x.inMW.reduce((s, v) => s + v * k, 0), tout = x.outMW.reduce((s, v) => s + v * k, 0);
    ok(near(RS.start + tin - tout - x.spill, x.end, 1e-4), `reservoir ${r} MW: water balance closes`);
    ok(x.stock.every(s => s >= -1e-9 && s <= RS.capacity + 1e-9), `reservoir ${r} MW: stock stays between empty and full`);
    if (r > 115) ok(x.firstDry >= 0, `reservoir ${r} MW: above the window it runs dry`);
    if (r < 100) ok(x.firstSpill >= 0, `reservoir ${r} MW: below the window it spills`);
  });
  ok(/fed by a river averaging 101 MW/.test(QMD) && /holding up to 350 GWh/.test(QMD) && /from 100 to 115 MW \(the slider moves in 5 MW steps\)/.test(QMD), "fallback: 350 GWh, 101 MW, 100 to 115 MW in 5 MW steps");
  ok(RS.capacity === 350 && RS.release.step === 5, "data: capacity 350 GWh, 5 MW steps");
}

// ---------------- battery (lesson 9's battery)
{
  ok(B.P === L9.battery.P && B.E === L9.battery.E && B.eta === L9.battery.eta, "battery: same 25 MW, 100 MWh, 80% as lesson 9");
  const x = M.simBattery(B, 25, 25);
  ok(x.won && x.bought === 125 && x.stored === 100 && x.lost === 25 && x.delivered === 100 && x.short === 0 && x.refused === 0, "25 MW in, 25 MW out: buy 125, store 100, lose 25, deliver 100");
  const winners = [];
  range(0, 25, 5).forEach(c => range(0, 25, 5).forEach(d => {
    const r = M.simBattery(B, c, d);
    ok(near(r.bought * B.eta, r.stored) && near(r.stored - r.delivered, r.left), `battery ${c}/${d}: stored = 80% of bought; stored − delivered = left`);
    ok(r.stock.every(s => s >= -1e-9 && s <= B.E + 1e-9), `battery ${c}/${d}: state of charge within 0 and 100 MWh`);
    if (r.won) winners.push(c + "/" + d);
  }));
  ok(winners.join() === "25/25", "only 25 MW / 25 MW delivers the full 100 MWh");
  const s = M.simBattery(B, B.chargeMW.start, B.dischargeMW.start);
  ok(!s.won && s.short === 40 && s.emptyAt === 20 && s.stored === 60, "start: 15 MW in stores 60 MWh; empty at 20:00, 40 MWh short");
  ok(/must buy 125 MWh to deliver 100/.test(QMD) && /25 MW, 100 MWh battery that loses 20% on charging/.test(QMD), "fallback: 125 MWh to deliver 100");
}

// ---------------- carbon budget
{
  const h = M.simCarbon(C, C.predict.l35, C.predict.nz);
  ok(h.at(2035) === 825 && h.end === 2575 && h.over === 2049 && !h.won, "halve and hold: 825 Mt by 2035, 2,575 Mt by 2070, over the budget in 2049");
  ok(/from 825 Mt to 2,575 Mt by 2070, past a 1,500 Mt budget/.test(QMD) && /halves its 100 Mt a year by 2035/.test(QMD), "fallback states the model's numbers");
  ok(C.predict.answer === "rises" && h.stock.slice(12).every((v, i, a) => i === 0 || v > a[i - 1]), "the prediction's answer: the stock keeps rising after 2035");
  const w = M.simCarbon(C, 50, 2060); ok(w.won && w.end === 1425, "50% by 2035, net zero 2060: 1,425 Mt, within the budget");
  ok(M.simCarbon(C, 100, C.nz.never).end === 4600, "flat forever: 4,600 Mt by 2070");
  range(C.l35.min, C.l35.max, C.l35.step).forEach(l => range(C.nz.min, C.nz.max, C.nz.step).forEach(n => {
    const r = M.simCarbon(C, l, n);
    ok(r.stock.every((v, i, a) => i === 0 || v >= a[i - 1] - 1e-9), `carbon ${l}%/${n}: the stock never falls (no outflow)`);
    ok(r.e.every((v, i) => (C.start_year + i < n || n >= C.nz.never) ? true : v === 0), `carbon ${l}%/${n}: zero from the net-zero year`);
    const flatAfter = r.e.every((v, i) => C.start_year + i < n || v === 0);
    if (n < C.nz.never) ok(flatAfter && r.stock.slice(n - C.start_year + 1).every(v => v === r.end), `carbon ${l}%/${n}: the stock stops rising only at net zero`);
    ok(r.won === (r.end <= C.budget + 1e-9), `carbon ${l}%/${n}: won means within the budget`);
  }));
  ok(C.e0 === 100 && C.budget === 1500, "data: 100 Mt in 2025, 1,500 Mt budget");
}

// ---------------- causal loops
{
  ["ev", "rebound"].forEach(k => {
    const L = D.loops[k], ref = {}; L.links.forEach(l => { ref[l.id] = l.sign; });
    const ids = new Set(L.nodes.map(n => n.id));
    L.links.forEach(l => ok(ids.has(l.from) && ids.has(l.to) && (l.sign === "+" || l.sign === "-") && l.why.split(/(?<=[.!?])\s+/).length <= 2, `${k}.${l.id}: valid link with a short reason`));
    L.loops.forEach(lp => {
      const ls = M.loopLinks(L, lp);
      ok(ls.every(Boolean) && ls.length === lp.path.length, `${k}.${lp.id}: every step of the loop is a link`);
      const t = M.loopType(L, lp, ref);
      ok(t && t.type === lp.type, `${k}.${lp.id}: ${t && t.minus} minus links make it ${lp.type}`);
      ok(!/^[RB]\d/.test(lp.id), `${k}.${lp.id}: the loop's name does not give away its type`);
    });
    const g = M.gradeSigns(L, ref); ok(g.right === g.total && g.set === g.total, `${k}: the reference signs grade full`);
    ok(M.loopType(L, L.loops[0], {}) === null, `${k}: an unsigned loop has no type yet`);
    // flipping any one link of a loop flips its type
    L.loops.forEach(lp => M.loopLinks(L, lp).forEach(l => { const s = Object.assign({}, ref); s[l.id] = ref[l.id] === "+" ? "-" : "+"; ok(M.loopType(L, lp, s).type !== lp.type, `${k}.${lp.id}: flipping ${l.id} flips the loop`); }));
  });
  ok(D.loops.ev.loops.map(l => l.type).join() === "R,B" && D.loops.rebound.loops.map(l => l.type).join() === "B", "EVs: one R, one B; rebound: one B");
  const RB = D.loops.rebound.rebound, src = D.sources.sorrell_rebound;
  ok(M.reboundKept(100, 30) === 70 && RB.mark === src.value && src.value === 30 && RB.engineering === 100, "rebound: 30% takes back 30 of 100 units; the slider's mark is Sorrell et al.'s 30%");
  ok(D.sources.li_ev.value === 353 && /353 U\.S\. metro areas/.test(QMD) && /2011 to 2013/.test(QMD), "Li et al. (2017): 353 metro areas, 2011 to 2013");
}

// ---------------- the ripple map
{
  const nodes = new Set(R.nodes.map(n => n.id)), dims = new Set(R.dims.map(d => d.id));
  R.nodes.forEach(n => ok(dims.has(n.dim), `${n.id}: dimension ${n.dim}`));
  ok(R.levers.length === 4 && R.levers.every(l => l.waves.length === 3), "four levers, three waves each");
  R.levers.forEach(lv => {
    const seen = new Set();
    lv.waves.forEach((w, i) => w.effects.forEach(e => {
      ok(nodes.has(e.node) && R.dirs[e.dir], `${lv.id} wave ${i + 1}: ${e.node} ${e.dir}`);
      ok(e.why.split(/(?<=[.!?])\s+/).length <= 2 && e.why.split(/\s+/).length <= 30, `${lv.id}.${e.node}: reason in one or two short sentences`);
    }));
    lv.waves.forEach(w => w.effects.forEach(e => seen.add(e.node)));
    // a "from" is the lever or a card reached before it: in an earlier wave, or earlier in the same wave
    const before = new Set();
    lv.waves.forEach(w => w.effects.forEach(e => { ok(e.from === "lever" || before.has(e.from), `${lv.id}: ${e.from} → ${e.node} follows the waves`); before.add(e.node); }));
    ok(lv.waves.slice(1).every(w => w.effects.every(e => e.from !== "lever")) || lv.id === "carbon", `${lv.id}: only the first wave comes straight from the lever`);
    ok(M.dimsReached(R, lv).length === 5, `${lv.id}: reaches all five dimensions`);
    const first = M.ripple(lv, 2).by[lv.predict.node];
    ok(first && first[0] === lv.predict.answer, `${lv.id}: the prediction's answer is the map's direction for ${lv.predict.node}`);
  });
  const hb = M.hubs(R), all = Object.keys(hb).filter(k => hb[k] === 4).sort();
  ok(all.join() === "bill,build,co2,mix,whp", `hubs (all four levers): ${all.join(", ")}`);
  ok(/The wholesale price, household bills, the plant mix, CO₂ and what gets built moved under all four levers/.test(JS), "the concept map names the same hubs");
  // the no-JS table says what the data say
  const fb = (QMD.match(/<table class="lx-mini-table">[\s\S]*?<\/table>/) || [""])[0];
  R.levers.forEach(lv => ok(fb.indexOf("<td>" + lv.label + "</td>") >= 0, `fallback table: ${lv.label}`));
  const mixed = []; R.levers.forEach(lv => lv.waves.forEach(w => w.effects.forEach(e => { if (e.dir === "mixed") mixed.push(lv.id + ":" + e.node); })));
  ok(mixed.sort().join() === "carbon:burden,carbon:margin,dc:bill,dc:co2,dc:local,gas:co2", `"depends" cells: ${mixed.join(", ")}`);
  ok(/CO₂ depends on what replaces gas/.test(fb) && /the burden depends on the revenue/.test(fb) && /CO₂ depends on what serves it/.test(fb) && /cooling water depends on the design/.test(fb) && /who pays for upgrades depends on the tariff/.test(fb), "fallback table: the 'depends' cells");
  ok(/Each of four levers reaches technology, cost, emissions, people and security within three waves/.test(QMD), "fallback: four levers, five dimensions, three waves");
  // G-DC: data centers only as a load
  const dc = R.levers.find(l => l.id === "dc");
  ok(/300 MW data-center campus, an illustrative large load/.test(dc.about) && /illustrative 300 MW load/.test(QMD), "the data center is an illustrative 300 MW load");
}

// ---------------- numbers on the page, sources, path.yml
{
  const strip = s => s.replace(/^---[\s\S]*?\n---/, "").replace(/<!-- learn:(meta|next|footer):start[\s\S]*?learn:\1:end -->/g, "").replace(/<style>[\s\S]*?<\/style>/, "")
    .replace(/<!--[\s\S]*?-->/g, "").replace(/<div class="lx-card lx-sources">[\s\S]*?<\/div>/, " ").replace(/https?:\/\/[^\s"')]+/g, " ").replace(/\$\$[\s\S]*?\$\$/g, " ");
  const prose = strip(QMD);
  const allowed = new Set(["350 GWh", "101 MW", "115 MW", "5 MW", "25 MW", "100 MWh", "20%", "125 MWh", "100 Mt", "825 Mt", "2,575 Mt", "1,500 Mt", "300 MW",
    "0.45 °C", "0.63 °C", "1,000 Gt", "30%", "759,180 MW", "4.4%"]);
  const rx = /(\d[\d,]*(?:\.\d+)?)\s*(MWh|MW|GWh|Mt|Gt|%|°C)/g;
  let m, n = 0;
  while ((m = rx.exec(prose))) { n++; ok(allowed.has(m[1] + " " + m[2]) || allowed.has(m[1] + m[2]), `page states "${m[0]}": from the model or a source`); }
  ok(n >= 20, `${n} numbers with units on the page checked`);
  const S = D.sources;
  ok(S.ipcc_tcre.value === 0.45 && S.ipcc_tcre.low === 0.27 && S.ipcc_tcre.high === 0.63 && S.ipcc_tcre.per_gt === 1000 && /D\.1\.1, p\. 28/.test(S.ipcc_tcre.source), "IPCC: 0.45 °C (0.27 to 0.63) per 1,000 Gt, D.1.1, p. 28");
  ok(/0\.27 to 0\.63 °C/.test(QMD) && /D\.1\.1, p\. 28/.test(QMD), "page: the IPCC range and page");
  ok(S.eia_peak.value === 759180 && S.doe_dc.value === 4.4 && /759,180 MW/.test(QMD) && /4\.4%/.test(QMD), "EIA record and DOE data-center share on the page");
  Object.keys(S).forEach(k => { ok(/^https:\/\//.test(S[k].url) && S[k].as_of && QMD.indexOf(S[k].url) >= 0, `source ${k}: URL, date, cited on the page`); });
  const facts = (QMD.match(/<table class="lx-facts">[\s\S]*?<\/table>/) || [""])[0];
  ok((facts.match(/<tr>/g) || []).length - 1 === 4 && (facts.match(/<td class="s"><a href="https:/g) || []).length === 4, "facts table: four rows, each linked");
  const fm = QMD.match(/^---\n([\s\S]*?)\n---/)[1];
  const blk = PATH.slice(PATH.indexOf("id: f02-systems-and-map"), PATH.indexOf("# ---------- the rest of each tier"));
  const sub = (blk.match(/subtitle: "([^"]+)"/) || [])[1];
  ok(sub && fm.indexOf('subtitle: "' + sub + '"') >= 0, "front-matter subtitle = path.yml subtitle");
  ok(/code: F2/.test(blk) && /form: play/.test(blk) && /minutes: 25/.test(blk) && /practice_minutes: 10/.test(blk) && /status: active/.test(blk) && /after: \[F1, 6\]/.test(blk), "path.yml: F2, play, 25 + 10 min, after F1 and lesson 6");
  ok((QMD.match(/class="lx-qq"/g) || []).length === 9, "practice: four myths and five questions");
  ok(/id="f2-explain"/.test(QMD) && /data-learn="systems-map"/.test(QMD) && /LX\.mount\("systems-map"/.test(JS), "mount points match");
}

// ---------------- scope
{
  const deny = [/\bFOAK\b/i, /\bNOAK\b/i, /first[- ]of[- ]a[- ]kind/i, /nth[- ]of[- ]a[- ]kind/i, /learning[- ](curve|rate)/i, /order[- ]book/i, /anchor[- ](customer|buyer)/i,
    /subsidy[- ]free/i, /parity capital/i, /break[- ]even capital/i, /smr-dc/i, /smr-datacenter/i, /projects\//i, /research\.(html|qmd)/i, /\bAI\b/, /artificial intelligence/i, /ChatGPT|Claude/, /generated by/i];
  const page = QMD.replace(/<!-- learn:meta:start[\s\S]*?learn:meta:end -->/, "").replace(/<style>[\s\S]*?<\/style>/, "").replace(/<!--[\s\S]*?-->/g, "");
  const lits = [...JS.matchAll(/"((?:[^"\\\n]|\\.)*)"/g)].map(x => x[1]);
  const vals = []; (function walk(o) { if (typeof o === "string") vals.push(o); else if (o && typeof o === "object") Object.values(o).forEach(walk); })(D);
  const visible = [page.replace(/<[^>]+>/g, " ")].concat(lits, vals).join("\n");
  deny.forEach(r => ok(!r.test(visible), `scope: no ${r}`));
  const NUC = /nuclear|reactor|\bSMR\b|small modular/i;
  const RISK = /cost (trajector|decline|reduction|fall)|learning|commerciali|subsid|credit|threshold|break[- ]even|parity|siting|site selection|suitab|screen|deliver|timing|order|anchor|buyer|data[- ]cent/i;
  visible.split(/(?<=[.!?])\s+|\n+/).forEach(s => ok(!(NUC.test(s) && RISK.test(s)), `scope: nuclear term with a risk term in "${s.slice(0, 90)}"`));
  ok(!NUC.test(visible), "F2 names no nuclear technology at all");
  const own = QMD.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?learn:\1:end -->/g, "");
  const ALLOW = /^(https:\/\/(www\.|docs\.)?(eia\.gov|energy\.gov|ferc\.gov|nerc\.com|nlr\.gov|nrel\.gov|doi\.org|ipcc\.ch)\/|#|\.\.\/assets\/|[0-9a-z-]+\.(qmd|html)(#[a-z0-9-]*)?$)/;
  let nl = 0;
  for (const h of own.matchAll(/href="([^"]+)"|\]\(([^)]+)\)/g)) { const u = (h[1] || h[2]).replace(/&amp;/g, "&"); nl++; ok(ALLOW.test(u), `link on the allow-list: ${u}`);
    if (/^[0-9a-z-]+\.html/.test(u)) ok(fs.existsSync(path.join(SITE, "learn", u.replace(/\.html.*$/, ".qmd"))), `internal link ${u} is a live page`); }
  ok(nl >= 12, `${nl} lesson links checked`);
  ok(!/creativecommons|opensource/.test(own), "no licence domains in the lesson's own content");
}

console.log(`${checks} checks, ${fails} failed`);
process.exit(fails ? 1 : 0);
