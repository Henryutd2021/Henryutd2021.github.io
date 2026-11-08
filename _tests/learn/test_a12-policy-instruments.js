// test_a12-policy-instruments.js — Node tests for A12 (assets/learn/a12-policy-instruments.js on the planning LP of
// assets/learn/m06-carbon-in-models.js) with the vendored HiGHS.
//   - the instruments as edits of one LP: every slider setting solves to optimal; a carbon price, a production credit and an
//     investment credit never raise CO2 against no policy; the standard's share is met; transfers are recomputed from
//     first principles (carbon payments = price x CO2; credits = credit x new clean MWh, or the credit's share of annual
//     capital; certificates = certificate price x required clean MWh)
//   - ties: at every slider setting, every number the page shows is the same for every best plan: each is
//     minimized and maximized over the optimal face of the LP without the tie rule's hair costs, and both ends print the
//     same as the page's value; the certificate price is unique (both one-sided changes of the cost agree)
//   - claims: no battery is built at any slider setting (the page says so); the default settings cut CO2 by similar
//     shares; a larger production credit costs more per tonne
//   - the page's blocks (fallback, explain, check, rules) are written from the model (--write) and checked otherwise
//   - credit and threshold scope: instruments act on wind, solar, storage and gas only; no nuclear term; no break-even or threshold search
//     or wording; links only to allowed domains; text budget; the page on a stub document with a failing, then working, solver
//   - state and wording: a solve that ends after the reader left its step paints nothing; the investment credit's
//     yearly figure is an annual equivalent, with its cash up front (overnight capital x share, unique on the optimal face);
//     certificate spending is illustrative, with its market assumption; no battery is built, said with the reason the LP
//     gives; cost per tonne worked through; every line the page assembles, at every slider setting, within the budget
// Usage (from the site folder):  node _tests/learn/test_a12-policy-instruments.js [--write]
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ID = "a12-policy-instruments";
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const QMD = path.join(SITE, "learn", ID + ".qmd"), DPATH = L("data/" + ID + ".json");
const A12 = require(L(ID + ".js")), JS = fs.readFileSync(L(ID + ".js"), "utf8");
let PAGE = fs.readFileSync(QMD, "utf8"), D = JSON.parse(fs.readFileSync(DPATH, "utf8"));
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const f = A12.fmt;
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

(async () => {
  const F = await require("./plains_face.js")(), PP = F.PP, Y = F.Y;
  const base = F.run({}).R;
  ok(base.ok && base.Wn === 0 && base.Sn === 0 && base.Bn === 0, "no policy: optimal, nothing new built");
  const grid = []; D.instruments.forEach(x => { for (let v = x.min; v <= x.max + 1e-9; v += x.step) grid.push([x, v]); });
  const R = {}; grid.forEach(([x, v]) => { R[x.id + v] = F.run(A12.opts(x.id, v)).R; });
  // ---------------- every setting: optimal, first principles, direction
  grid.forEach(([x, v]) => {
    const r = R[x.id + v], o = A12.opts(x.id, v), C = Y.cost, tag = x.id + " " + v;
    ok(r.ok, tag + ": optimal");
    ok(Math.abs(r.carbonPay - (o.tau || 0) * r.co2) < 1e-6 && Math.abs(r.ptcPay - (o.ptc || 0) * r.newClean) < 1e-6 &&
       Math.abs(r.itcPay - (o.itc || 0) * (r.Wn * C.wind.cap + r.Sn * C.solar.cap + r.Bn * C.battery.cap)) < 1e-3, tag + ": transfers from first principles");
    ok(Math.abs(r.resource - (r.capital + r.fuel + r.unserved)) < 1e-6 && r.unMWh < 1e-6, tag + ": resource cost = capital and upkeep + gas + unserved (none)");
    if (x.id !== "ces") ok(r.co2 <= base.co2 + 1, tag + ": CO2 never above no policy");
    else ok(r.clean >= o.ces * Y.demandMWh - 1 && r.cesPrice >= -1e-9 && Math.abs(r.certPay - r.cesPrice * o.ces * Y.demandMWh) < 1e-3, tag + ": the standard is met; certificate payments = price x required MWh");
    ok(r.Bn < 1e-6, tag + ": no battery is built");
    ok(Math.abs(r.itcUpfront - (o.itc || 0) * (r.Wn * 1712e3 + r.Sn * 1484e3 + r.Bn * C.battery.kW * 1e3)) < 1e-3 && (!o.itc || Math.abs(r.itcPay - r.itcUpfront * (0.04 / (1 - Math.pow(1.04, -30)))) < 1e-3 * r.itcPay + 1e-3 || r.Bn > 0), tag + ": the investment credit up front = share x overnight capital; its yearly figure = the up-front amount x the capital recovery factor (4%, 30 years)");
  });
  // the capital costs from first principles (2025 dollars)
  { const crf = (r, n) => r / (1 - Math.pow(1 + r, -n)), defl = 128.989 / 125.43;
    ok(Math.abs(Y.cost.wind.cap - 1712e3 * crf(0.04, 30)) < 1e-6 && Math.abs(Y.cost.battery.kW - (372 + 4 * 241) * defl) < 1e-9 && Math.abs(Y.cost.battery.cap - Y.cost.battery.kW * 1e3 * crf(0.04, 15)) < 1e-6, "annual capital: capex x CRF; the battery moved from 2024 to 2025 dollars with the GDP deflator"); }
  // ---------------- ties: every shown number is the same for every best plan
  const SHOW = { co2: v => f.mt(v), cc: v => f.twh(v), ct: v => f.twh(v), clean: v => f.twh(v), Wn: v => f.mw(v), Sn: v => f.mw(v), Bn: v => f.mw(v), newClean: v => (v / 1e6).toFixed(3) };
  const FIELD = { cc: "ccMWh", ct: "ctMWh" };
  let tieBad = [];
  [[null, 0]].concat(grid).forEach(([x, v]) => {
    const o = x ? A12.opts(x.id, v) : {}, r = x ? R[x.id + v] : base, fc = F.face(o, Object.keys(SHOW), 0.01);   // within one cent of the optimum: the objective is very flat near some settings (itc 40%)
    Object.keys(SHOW).forEach(n => {
      if (n === "newClean" && !(x && x.id === "ptc")) return;   // new clean MWh are shown only as the production credit's payments
      const [lo, hi] = fc[n], val = r[FIELD[n] || n], s = SHOW[n];
      if (!(s(lo) === s(hi) && s(lo) === s(val))) tieBad.push((x ? x.id + v : "base") + " " + n + " " + s(lo) + ".." + s(hi) + " shown " + s(val));
    });
    // money and resource cost follow from unique quantities; the per-tonne cost from unique differences. The investment
    // credit's up-front cash is a positive mix of the three sizes, so it lies between the mix of their face minima and
    // of their maxima: both ends must print the same
    if (x && x.id === "itc") { const c = { Wn: 1712e3, Sn: 1484e3, Bn: Y.cost.battery.kW * 1e3 }, at = i => o.itc * ["Wn", "Sn", "Bn"].reduce((s, k) => s + c[k] * fc[k][i], 0);
      if (!(f.m(at(0)) === f.m(at(1)) && f.m(at(0)) === f.m(r.itcUpfront))) tieBad.push(x.id + v + " up front " + f.m(at(0)) + ".." + f.m(at(1))); }
  });
  ok(tieBad.length === 0, "every shown number is the same for every best plan at every slider setting:\n  " + tieBad.slice(0, 8).join("\n  "));
  // the certificate price: unique (one-sided changes of the cost)
  D.instruments.filter(x => x.id === "ces").forEach(x => { for (let v = x.min; v <= x.max; v += x.step) {
    const o = A12.opts("ces", v), b = F.solve(PP.build(Y, o)), d = 1000, up = F.solve(PP.build(Y, Object.assign({}, o, { delta: { ces: d } }))), dn = F.solve(PP.build(Y, Object.assign({}, o, { delta: { ces: -d } })));
    const s1 = (up.objective - b.objective) / d, s2 = (b.objective - dn.objective) / d;
    ok(Math.abs(s1 - s2) < 1e-3 && Math.abs(s1 - b.duals.ces) < 1e-3, `ces ${v}%: the certificate price $${b.duals.ces.toFixed(2)} is unique (one-sided ${s1.toFixed(3)}, ${s2.toFixed(3)})`);
  } });
  // ---------------- claims on the page
  const defs = D.instruments.map(x => ({ x, r: R[x.id + x.def], c: A12.compare(base, R[x.id + x.def]) }));
  const cuts = defs.map(z => z.c.cutPct), pers = defs.map(z => z.c.perT);
  ok(Math.max(...cuts) - Math.min(...cuts) < 0.06 && Math.max(...pers) - Math.min(...pers) < 3, "defaults: similar cuts (within 6 points) at similar cost per tonne (within $3)");
  ok(A12.compare(base, R.ptc30).perT > A12.compare(base, R.ptc10).perT + 10 && R.ptc30.curtailed > 1e6, "a $30 production credit costs much more per tonne than $10, and curtails over 1 TWh");
  ok(f.m(R.itc30.itcUpfront) === "$681.3M" && f.m(R.itc30.itcPay) === "$39.4M", "the default investment credit: $681.3M up front, $39.4M a year as its annual equivalent");
  // no battery: building one is not worth its annual cost here (the reduced cost of a battery MW is positive at every setting)
  grid.concat([[null, 0]]).forEach(([x, v]) => { const o = x ? A12.opts(x.id, v) : {}, r0 = F.run(o).r.objective, r1 = F.solve(PP.build(Y, Object.assign({}, o, { fix: { Bn: 1 } }))).objective;
    ok(r1 > r0 + 1, (x ? x.id + " " + v : "no policy") + ": a 1 MW battery raises the year's cost (its energy shifting saves less than its annual cost): +$" + Math.round(r1 - r0).toLocaleString("en-US")); });

  // ---------------- the page's generated blocks
  const ROWS = defs.map(z => `<tr><td>${z.x.label}, ${f.val(z.x, z.x.def)}</td><td data-label="CO₂">${f.mt(z.r.co2)}</td><td data-label="Cut">${f.pct(z.c.cutPct)}</td><td data-label="Resource cost">${f.dm(z.c.dRes)}</td><td data-label="Per tonne">${f.pt(z.c.perT)}</td><td data-label="Money moved, a year">${A12.moneyCell(z.x.id, z.r)}</td></tr>`).join("\n");
  const t0 = defs[0];
  const FALLBACK = `<p class="lx-hint">No policy: nothing new is built; CO₂ ${f.mt(base.co2)} a year, resource cost ${f.m(base.resource)}, wind and sun ${f.pct(base.shareClean)} of demand.</p>
<table class="lx-facts a12-fb">
<thead><tr><th scope="col">Instrument, default setting</th><th scope="col">CO₂</th><th scope="col">Cut</th><th scope="col">Resource cost</th><th scope="col">Per tonne avoided</th><th scope="col">Money that changes hands, a year</th></tr></thead>
<tbody>
${ROWS}
</tbody>
</table>
<p class="lx-hint">Per tonne avoided = the change in resource cost ÷ the CO₂ avoided, from unrounded values: at ${f.val(t0.x, t0.x.def)}, ${f.dm(t0.c.dRes).replace("+", "")} ÷ ${f.mt(t0.c.cut)} = ${f.pt(t0.c.perT)}.</p>
<p class="lx-hint">Similar cuts at similar cost per tonne; the money that changes hands, and who pays it, differs. Certificate spending assumes certificates trade at the model's marginal compliance cost.</p>`;
  const per = defs.map(z => z.c.perT), lo = Math.min(...per), hi = Math.max(...per);
  const EXPLAIN = `<dl class="lx-ideas">
<dt>Same lever, different hands</dt><dd>At the defaults each instrument cuts ${f.pct(Math.min(...cuts))} to ${f.pct(Math.max(...cuts))} of CO₂ for ${f.pt(lo).replace(" per t", "")} to ${f.pt(hi)} avoided; the money that changes hands runs from ${f.m(Math.min(...defs.map(z => A12.moneyOf(z.x.id, z.r))))} to ${f.m(Math.max(...defs.map(z => A12.moneyOf(z.x.id, z.r))))} a year.</dd>
<dt>Per tonne avoided</dt><dd>The change in resource cost ÷ the CO₂ avoided, both against no policy: at ${f.val(t0.x, t0.x.def)}, ${f.dm(t0.c.dRes).replace("+", "")} ÷ ${f.mt(t0.c.cut)} = ${f.pt(t0.c.perT)}. Carbon payments are left out.</dd>
<dt>Carbon price</dt><dd>Raises every gas MWh's cost; gas plants pay ${f.m(defs[0].r.carbonPay)} a year at ${f.val(defs[0].x, defs[0].x.def)}.</dd>
<dt>Credits</dt><dd>Lower the cost of new wind and solar; taxpayers pay. A $30 production credit costs ${f.pt(A12.compare(base, R.ptc30).perT)} avoided, against ${f.pt(A12.compare(base, R.ptc10).perT)} at $10.</dd>
<dt>Investment credit</dt><dd>Paid up front: ${f.m(R.itc30.itcUpfront)} at 30%, or ${f.m(R.itc30.itcPay)} a year spread over the plants' life at 4%.</dd>
<dt>Standard</dt><dd>Requires a clean share. If certificates trade at the marginal compliance cost, ${"$" + R.ces65.cesPrice.toFixed(2)} per MWh at 65%, customers would spend ${f.m(R.ces65.certPay)} a year, wind that ran anyway included.</dd>
<dt>Real costs and transfers</dt><dd>The resource cost changes only with the plan; payments between groups are transfers.</dd>
</dl>`;
  const c30 = A12.compare(base, R.ptc30), c10 = A12.compare(base, R.ptc10), dc = defs[3];
  const CHECK = `<div class="lx-myths" data-quiz="a12-myth">
<div class="lx-qq" data-id="same-cut" data-answer="fact">
<p class="lx-qtext">Myth or fact? “Here, instruments that cut about the same CO₂ cost society about the same; they differ most in who pays.”</p>
<ul class="lx-choices"><li data-value="myth">Myth</li><li data-value="fact">Fact</li></ul>
<details class="lx-answer"><summary>Answer</summary><p>Fact, in this model. The defaults cut ${f.pct(Math.min(...cuts))} to ${f.pct(Math.max(...cuts))} for ${f.pt(lo).replace(" per t", "")} to ${f.pt(hi)} avoided, while the money that changes hands runs from ${f.m(Math.min(...defs.map(z => A12.moneyOf(z.x.id, z.r))))} to ${f.m(Math.max(...defs.map(z => A12.moneyOf(z.x.id, z.r))))}.</p></details>
</div>
<div class="lx-qq" data-id="bigger-credit" data-answer="myth">
<p class="lx-qtext">Myth or fact? “A bigger production credit buys each tonne as cheaply as a small one.”</p>
<ul class="lx-choices"><li data-value="myth">Myth</li><li data-value="fact">Fact</li></ul>
<details class="lx-answer"><summary>Answer</summary><p>Myth. At $10 per MWh the plan avoids CO₂ at ${f.pt(c10.perT)}; at $30, at ${f.pt(c30.perT)}, with ${f.twh(R.ptc30.curtailed)} of wind and sun curtailed.</p></details>
</div>
<div class="lx-qq" data-id="standard-free" data-answer="myth">
<p class="lx-qtext">Myth or fact? “A clean-energy standard costs nothing, because it costs taxpayers nothing.”</p>
<ul class="lx-choices"><li data-value="myth">Myth</li><li data-value="fact">Fact</li></ul>
<details class="lx-answer"><summary>Answer</summary><p>Myth. At 65% the resource cost rises by ${f.dm(dc.c.dRes).replace("+", "")} a year. If customers fund certificates at the marginal compliance cost, they spend ${f.m(dc.r.certPay)}.</p></details>
</div>
<div class="lx-qq" data-id="battery" data-answer="myth">
<p class="lx-qtext">Myth or fact? “Any policy that favors clean power gets batteries built.”</p>
<ul class="lx-choices"><li data-value="myth">Myth, here</li><li data-value="fact">Fact</li></ul>
<details class="lx-answer"><summary>Answer</summary><p>Myth, here. No slider setting builds a battery: under these costs and six representative days, its energy-shifting savings do not cover its annual cost. Reserves and other reliability services are not valued.</p></details>
</div>
</div>
<div class="lx-quiz" data-quiz="a12">
<div class="lx-qq" data-id="price" data-answer="a">
<p class="lx-qtext">A combined-cycle plant emits ${Y.G.cc.rate.toFixed(2)} t of CO₂ per MWh. By how much does a $30 carbon price raise its cost per MWh?</p>
<ul class="lx-choices"><li data-value="a">$${(30 * Math.round(Y.G.cc.rate * 100) / 100).toFixed(2)}</li><li data-value="b">$30.00</li><li data-value="c">$75.00</li><li data-value="d">$${(Math.round(Y.G.cc.rate * 100) / 100).toFixed(2)}</li></ul>
<details class="lx-answer"><summary>Answer</summary><p>$${(30 * Math.round(Y.G.cc.rate * 100) / 100).toFixed(2)}: $30 per t × ${Y.G.cc.rate.toFixed(2)} t per MWh. $30 forgets the rate; $75 divides by it.</p></details>
</div>
</div>`;
  const RULES = `<div class="lx-card lx-real">
<p class="lx-eyebrow">In the real world: one rule of each kind</p>
<ul class="a12-rules">
${D.rules.map(r => { const src = x => `<p class="lx-hint">Source: ${x.url ? `<a href="${esc(x.url)}">${esc(x.label)}</a>` : esc(x.label)}, ${esc(x.asOf)}.</p>`;
    return `<li><p><b>${esc(r.kind)} · ${esc(r.where)}.</b> ${esc(r.name)}.</p><p>${esc(r.text)}</p>${src(r.source)}${r.context ? `<p>${esc(r.context.text)}</p>${src(r.context.source)}` : ""}</li>`; }).join("\n")}
</ul>
<p class="lx-hint">The model's instruments are simpler than these rules: no phase-outs, eligibility tests or trading.</p>
</div>`;
  const blocks = { "a12-fallback": FALLBACK, "a12-explain": EXPLAIN, "a12-check": CHECK, "a12-rules": RULES };
  const reference = { about: "Results of the Plains Grid's planning LP, solved with HiGHS 1.15.4: CO2 and resource cost with no policy, and each instrument at its default setting.", base: { co2: base.co2, resource: base.resource },
    defaults: {} };
  defs.forEach(z => { reference.defaults[z.x.id] = { cut: f.pct(z.c.cutPct), per: f.pt(z.c.perT), co2: z.r.co2, resource: z.r.resource }; });
  const blockRx = k => new RegExp("(<!-- " + k + ":start[^>]*-->\\n)[\\s\\S]*?(<!-- " + k + ":end -->)");
  if (process.argv.includes("--write")) {
    Object.keys(blocks).forEach(k => { PAGE = PAGE.replace(blockRx(k), "$1" + blocks[k].replace(/\$/g, "$$$$") + "\n$2"); });
    fs.writeFileSync(QMD, PAGE); D.reference = reference; fs.writeFileSync(DPATH, JSON.stringify(D, null, 1) + "\n");
    console.log("wrote the page's blocks and the reference block");
  }
  Object.keys(blocks).forEach(k => { const m = PAGE.match(blockRx(k)); ok(m && PAGE.includes(m[1] + blocks[k] + "\n<!-- " + k + ":end -->"), "the page's block " + k + " is written from the model (run --write)"); });
  Object.keys(reference.defaults).forEach(k => ok(JSON.stringify(D.reference.defaults[k]) === JSON.stringify(reference.defaults[k]), "reference block: " + k));

  // ---------------- scope (credit and threshold exercises: wind, solar, storage and gas only), links, text
  const OWN = PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?learn:\1:end -->/g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/^---[\s\S]*?\n---\n/, "");
  const ALLTXT = OWN + JS + JSON.stringify(D);
  ok(!/nuclear|reactor|\bSMR\b|small modular/i.test(ALLTXT), "no nuclear term in the lesson's own files");
  ok(!/break[- ]?even|breaks even|threshold|zero[- ]credit|at which .* (pays|starts)/i.test(ALLTXT), "credit scope: no break-even or threshold search or wording");
  ok(!/data cent/i.test(ALLTXT) && !/\bAI\b/.test(ALLTXT), "no data centers, no AI wording");
  ok(D.instruments.map(x => x.id).join() === "tau,ptc,itc,ces" && /wind, solar and batteries/.test(D.instruments[2].unit) && /new wind and solar/.test(D.instruments[1].unit), "credits act on new wind, solar and batteries only");
  const hrefs = [...OWN.matchAll(/href="([^"]+)"/g)].map(m => m[1]).concat(D.rules.map(r => r.source.url).filter(Boolean));
  ok(D.rules.filter(r => r.id === "ptc" || r.id === "itc").every(r => /Notice 2025-42, Internal Revenue Bulletin 2025-36/.test(r.source.label) && /2 September 2025/.test(r.source.asOf) && /begin construction after 4 July 2026 and enter service after 31 December 2027|same end dates/.test(r.text)), "the credits' end dates cite IRS Notice 2025-42 (IRB 2025-36, 2 September 2025)");
  const ALLOW = /^(https:\/\/(doi\.org|www\.eia\.gov|docs\.nlr\.gov|atb\.nlr\.gov|climate\.ec\.europa\.eu|eta-publications\.lbl\.gov|ergo-code\.github\.io)\/|[0-9a-z-]+\.html|\.\.\/assets\/|#)/;
  ok(hrefs.every(h => ALLOW.test(h.replace(/&amp;/g, "&"))), "links only to allowed domains and learn pages: " + hrefs.filter(h => !ALLOW.test(h)).join(", "));
  const stepTexts = [...JS.matchAll(/\{ text: "([^\n]+)",\n\s+build:|instrumentStep\("\w+", "([^"]+)"\)/g)].map(m => (m[1] || m[2]).replace(/\[\[[^|]+\|([^\]]+)\]\]/g, "$1"));
  const sent2 = t => t.split(/(?<=[.?!])\s+(?=[A-Z])/).length;
  ok(stepTexts.length === 6 && stepTexts.every(t => t.split(/\s+/).length <= 40 && sent2(t) <= 2), "six step texts of 40 words and two sentences at most: " + stepTexts.map(t => t.split(/\s+/).length + "/" + sent2(t)).join(","));
  { const O2 = OWN.replace(/<div class="lx-card lx-sources">[\s\S]*?<\/div>/, "").replace(/<style>[\s\S]*?<\/style>/g, "");
    const els = O2.replace(/^- (.*)$/gm, "<li>$1</li>").split(/<\/?(?:p|li|dd|dt|td|th|summary|footer)\b[^>]*>/i).map(x => x.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()).filter(x => /[A-Za-z]/.test(x));
    const long = els.filter(x => x.split(" ").length > 40);
    ok(long.length === 0, "every page element is 40 words or fewer: " + long.map(x => x.slice(0, 60) + " (" + x.split(" ").length + ")").join(" | ")); }
  const SIDE = fs.readFileSync(path.join(SITE, "learn/_w1", ID + ".yml"), "utf8");
  ["investment-credit", "clean-energy-standard", "resource-cost", "transfer-payment"].forEach(id => ok(new RegExp("id: " + id + "\\b").test(SIDE) && JS.includes("[[" + id + "|"), "sidecar defines and the page marks " + id));
  ok(["heat-rate", "net-demand", "shadow-price"].every(id => PAGE.includes('data-term="' + id + '"') || PAGE.includes('term="' + id + '"')) && JS.includes("[[curtailment|curtailed]]") && JS.includes("Mt = million tonnes of CO₂; TWh = million MWh"), "course glossary terms marked (heat rates, net load, curtailed, shadow price); Mt and TWh spelled out");
  ok(/\*\*Symbols\.\*\* \$t\$: an hour of the six days; \$w_t\$: the days it stands for/.test(PAGE), "the Modeler box's symbols, with units");
  { const ca = D.rules.find(r => r.id === "ces"); ok(ca.where === "California" && /Senate Bill 100 \(2018\)/.test(ca.text) && /60% of retail electricity sales by 2030/.test(ca.text) && /California Public Utilities Commission/.test(ca.source.label) && /read 5 November 2026/.test(ca.source.asOf) && /16 states/.test(ca.context.text) && /lbl\.gov/.test(ca.context.source.url), "the standard's real rule: California's RPS (SB 100, 2018: 60% by 2030; CPUC page), the LBNL count as context"); }
  ok(PAGE.indexOf("m06-carbon-in-models.js\" defer") < 0 && PAGE.indexOf("learn.js\" defer") > 0 && PAGE.indexOf("learn.js\" defer") < PAGE.indexOf("a12-policy-instruments.js\" defer"), "the shared planning LP comes with the bundle (components/plainsplan.js); the page loads no other lesson's script");
  { const PY = fs.readFileSync(path.join(SITE, "learn/path.yml"), "utf8"), r = PY.slice(PY.indexOf("id: " + ID), PY.indexOf("id: " + ID) + 1600);
    ok(/status: active/.test(r.split("- kind:")[0]) && r.includes("after: [A1, 12]") && PAGE.includes('subtitle: "' + (r.match(/subtitle: "([^"]+)"/) || [])[1] + '"'), "path.yml: active, after A1 and lesson 12, subtitle equal to the page's"); }

  // ---------------- the page on a stub document: a solve that fails, then works
  {
    const { env, load } = require("./stubdom.js");
    const E = env();
    E.LX.ready = () => {}; E.LX.progress.guess = () => null; E.LX.visible = E.LX.visible || (() => false); E.LX.onTheme = E.LX.onTheme || (() => {}); E.LX.reduced = E.LX.reduced || (() => true);
    ["solver", "cards", "controls", "plot", "profiles", "solvestep", "costsplit", "ledger", "table", "causal", "boundary", "plainsplan"].forEach(n => load(n, E));
    let failing = true, hold = false; const held = [];
    const slv = E.LX.solver; slv.preload = () => Promise.resolve("worker"); slv.mode = "worker";
    slv.solve = m => { if (failing) return Promise.resolve({ status: "time-limit", ok: false, values: null, ms: { roundTrip: 10000 } }); const r = F.solve(m);
      if (hold) return new Promise(res => held.push(() => res(r))); return Promise.resolve(r); };
    let init = null, demo = null;
    E.LX.mount = (slug, fn) => { if (slug === ID) init = fn; };
    E.LX.demo = (root, fn, cards) => { demo = { fn, cards }; return () => null; };
    const ctx = { window: E.window, document: E.document, location: E.location, navigator: {}, console, module: { exports: {} }, performance: E.window.performance, setTimeout: () => 0, clearTimeout: () => {} };
    vm.runInNewContext(JS, Object.assign({}, ctx, { module: { exports: {} } }));
    const xp = E.LX.H("div", { id: "a12-explain" }, E.body);
    const root = E.LX.H("div", { class: "lx-interactive", "data-learn": ID }, E.body), live = E.LX.H("div", { class: "lx-live" }, root);
    let threw = null;
    try { init(live, { a12_policy_instruments: D, a10_emissions_questions: F.A, m06_carbon_in_models: F.M, town_year: F.year, cf_targets: F.T }, root); } catch (e) { threw = e.stack; }
    ok(!threw && demo && demo.cards, "the page mounts on the stub document" + (threw ? ": " + threw : ""));
    const tick = () => new Promise(r => setImmediate(r));
    try {
      const card = () => demo.cards.el, btns = re => card().querySelectorAll("button").filter(b => re.test(b.textContent));
      btns(/Solve the plan/)[0].click(); for (let i = 0; i < 6; i++) await tick();
      ok(card().querySelectorAll(".a12-fail").length === 1 && btns(/Try again/).length === 1, "a failed solve shows a note and Try again");
      failing = false; btns(/Try again/)[0].click(); for (let i = 0; i < 6; i++) await tick();
      ok(card().querySelectorAll(".a12-fail").length === 0 && live.textContent.includes(f.mt(base.co2)), "after Try again the plan is solved: CO₂ " + f.mt(base.co2));
      demo.cards.go(1); for (let i = 0; i < 8; i++) await tick();
      const d0 = R["tau" + D.instruments[0].def];
      ok(card().textContent.includes(f.mt(d0.co2)) && card().textContent.includes(f.pct(A12.compare(base, d0).cutPct)), "step 2 solves the default carbon price on entry");
      demo.cards.go(5); for (let i = 0; i < 20; i++) await tick();
      ok(card().textContent.includes("EU Emissions Trading System") && card().textContent.includes(f.m(R["ces" + D.instruments[3].def].certPay)), "step 6: the ledger of all four and the real rules");
      ok(xp.textContent.includes("Four instruments, one plan"), "explain: the comparison table");
      ok(card().textContent.includes("California") && card().textContent.includes("16 states") && card().querySelectorAll(".a12-rules li").every(li => li.querySelectorAll("p").length >= 3), "step 6: each real rule as name, mechanism and source, the LBNL count as context");
      // a solve that ends after the reader has left its step paints nothing: enter the production
      // credit at a new setting, go Back to step 1 before the solve ends, then let it end
      const ttl = () => live.querySelector("h3").textContent;
      demo.cards.go(2); for (let i = 0; i < 6; i++) await tick();
      hold = true; card().querySelectorAll("button").filter(b => /^Raise/.test(b.getAttribute("aria-label") || ""))[0].click(); await tick();
      demo.cards.go(0); for (let i = 0; i < 4; i++) await tick();
      const before = ttl(); hold = false; held.splice(0).forEach(f => f()); for (let i = 0; i < 8; i++) await tick();
      ok(/no policy/.test(before) && ttl() === before && !/production credit/.test(ttl()) && !card().textContent.includes("Taxpayers pay"), "a late solve does not paint step 1: " + ttl());
      // every line the page assembles, at every slider setting: 40 words and two sentences at most
      const said = [], over = [], sentences = t => t.replace(/\*\*/g, "").split(/(?<=[.?!])\s+(?=[A-Z0-9“"$])/).filter(x => /[A-Za-z]/.test(x)).length;
      const grab = () => card().querySelectorAll(".lx-saw, .lx-hint, p, li, td, th").forEach(e => { if (!e.querySelectorAll("p").length) said.push(e.textContent.replace(/\s+/g, " ").trim()); });
      for (let k = 1; k <= 4; k++) {
        const x = D.instruments[k - 1]; demo.cards.go(k); for (let i = 0; i < 8; i++) await tick();
        const lower = () => card().querySelectorAll("button").filter(b => /^Lower/.test(b.getAttribute("aria-label") || ""))[0], raise = () => card().querySelectorAll("button").filter(b => /^Raise/.test(b.getAttribute("aria-label") || ""))[0];
        for (let v = x.def; v > x.min; v -= x.step) { lower().click(); for (let i = 0; i < 6; i++) await tick(); }
        for (let v = x.min; v <= x.max; v += x.step) { grab(); if (v < x.max) { raise().click(); for (let i = 0; i < 6; i++) await tick(); } }
      }
      demo.cards.go(5); for (let i = 0; i < 20; i++) await tick(); grab();
      const saws = said.filter(t => /[A-Za-z]/.test(t));
      saws.forEach(t => { if (t.split(" ").length > 40 || (sentences(t) > 2 && !/^Source:/.test(t))) over.push(t.slice(0, 70) + " (" + t.split(" ").length + "/" + sentences(t) + ")"); });
      ok(saws.length > 60 && over.length === 0, "every assembled line (" + saws.length + ") is 40 words and two sentences at most: " + over.slice(0, 4).join(" | "));
      ok(saws.some(t => /Taxpayers pay \$681\.3M up front: \$39\.4M a year as an annual equivalent\./.test(t)) && saws.some(t => /customers would spend \$\d+\.\dM a year \(illustrative\)/.test(t)) && saws.some(t => /per tonne avoided, \$41\.6M ÷ 1\.83 Mt = \$23 per t/.test(t)), "the money lines: the credit up front and as an annual equivalent; certificate spending illustrative; per tonne avoided worked");
    } catch (e) { ok(false, "the stub page test threw: " + (e && e.stack || e)); }
  }

  console.log(`test_a12-policy-instruments: ${checks - fails}/${checks} checks passed`);
  process.exit(fails ? 1 : 0);
})();
