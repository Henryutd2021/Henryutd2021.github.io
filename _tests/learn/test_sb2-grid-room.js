// test_sb2-grid-room.js — Node tests for SB2, the Grid Room (learn/sb2-grid-room.qmd, assets/learn/sb2-grid-room.js), on
// engine E2 (its own tests: test_e2-engine.js). What it checks:
//   - the no-JS blocks: the bench's table is LX.ShareState.staticHTML of the plan's defaults; the results table is the
//     engine's precomputed run of the default plan and the 300 MW preset (data file, `precomputed.sb2`), equal to a
//     fresh run; the inputs table is E2.inputsHTML of the data file
//   - every number the page states (the brief, the data note, the periods, the tie rule) against the data and the engine
//   - the run's words (says, notes, readouts): true for every preset on every period and for plans with a link set to
//     0 MW (open: nothing flows, each side priced on its own), never more than the run shows; the
//     large load's served energy and its share of a shortfall
//   - the page frame: the sandbox sections, scripts, data-src, the engine in the bundle; prices named as conditional on
//     the commitment; no nuclear term on the page, in its script, the engine or the data; no AI wording;
//     links only to live lessons and allowed sources (the scope scan checks the rest)
// --write: recomputes `precomputed.sb2` in the data file and writes the marker blocks.
// Usage (from the site folder):  node _tests/learn/test_sb2-grid-room.js [--write]
"use strict";
const fs = require("fs");
const path = require("path");
const X = require("./e2_harness.js");
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const QPATH = path.join(X.SITE, "learn/sb2-grid-room.qmd"), DPATH = X.L("data/e2-plains-grid.json");
const RUN_DATE = "5 November 2026";
function moneyK(v) { const r = Math.round(v / 1000) * 1000; return (r < 0 ? "−$" : "$") + Math.abs(r).toLocaleString("en-US"); }
function rowsOf(E2, P, R, tag) {
  const T = R.tot;
  return [
    [tag + ": production cost (running, no-load and start-up; 2025 dollars)", moneyK(T.prod)],
    [tag + ": average price per MWh served, " + P.zones.map(z => z.name).join(" · ") + " (energy payments over the MWh used, so busy hours weigh more; conditional on the commitment)", R.avgPrice.map(v => E2.priceTxt(v)).join(" · ") + " /MWh"],
    [tag + ": highest price in any zone", E2.priceTxt(Math.max.apply(null, R.maxPrice)) + "/MWh"],
    [tag + ": hours at the limit, Ridge–Town · Town–Metro", E2.kilo(T.cong.WT) + " · " + E2.kilo(T.cong.TM) + " of " + R.hours],
    [tag + ": unserved · reserve short (missing reserve MW added up hour by hour)", E2.kilo(T.shed) + " MWh · " + E2.kilo(T.rshort) + " MW·h"],
    [tag + ": uplift (make-whole payments)", moneyK(T.upliftAll)]];
}

(async () => {
  const { E2, cfg, P, SS, solver } = await X.load();
  const PG = require(X.L("sb2-grid-room.js"));
  const def = SS.defaults(E2.schema), withLoad = Object.assign({}, def, E2.presets.filter(p => p.id === "load")[0].state);
  const r0 = await E2.solve(def, P, { solver }), r1 = await E2.solve(withLoad, P, { solver });
  ok(r0.ok && r1.ok, "the default plan and the 300 MW preset run optimal on the summer peak day");
  const pre = { head: "Result: summer peak day, 29 July 2025 (the default plan, then a 300 MW data center at Prairie Town)",
    rows: rowsOf(E2, P, r0.results, "Today's grid").concat(rowsOf(E2, P, r1.results, "With the 300 MW load")),
    note: "Precomputed with HiGHS on " + RUN_DATE + ": a mixed-integer program commits the plants each day; the dispatch linear program, with that commitment fixed, gives the prices. With JavaScript on, the bench runs your own plan." };
  const withPre = { cfg: Object.assign({}, cfg, { precomputed: Object.assign({}, cfg.precomputed, { sb2: pre }) }) };
  const BLOCKS = { "sb2-bench": () => SS.staticHTML(E2.schema, def), "sb2-results": () => E2.fallback(withPre, "sb2"), "sb2-inputs": () => E2.inputsHTML(P) };
  if (process.argv.includes("--write")) {
    const d = JSON.parse(fs.readFileSync(DPATH, "utf8")); d.precomputed = Object.assign({}, d.precomputed, { sb2: pre });
    fs.writeFileSync(DPATH, JSON.stringify(d, null, 1) + "\n");
    X.writeBlocks(QPATH, { "sb2-bench": BLOCKS["sb2-bench"](), "sb2-results": BLOCKS["sb2-results"](), "sb2-inputs": BLOCKS["sb2-inputs"]() });
    console.log("wrote precomputed.sb2 and the sb2-bench, sb2-results and sb2-inputs blocks");
  }
  const PAGE = fs.readFileSync(QPATH, "utf8"), D = JSON.parse(fs.readFileSync(DPATH, "utf8"));
  ok(JSON.stringify(D.precomputed && D.precomputed.sb2) === JSON.stringify(pre), "the data file's precomputed runs equal fresh runs (run with --write after a change)");
  Object.keys(BLOCKS).forEach(k => { const r = X.between(PAGE, k); ok(r && r.text === BLOCKS[k]() + "\n", k + " block is up to date (run with --write)"); });
  const T = X.norm(PAGE), JS = fs.readFileSync(X.L("sb2-grid-room.js"), "utf8"), ENG = fs.readFileSync(X.L("components/engine-e2.js"), "utf8");
  const has = (s, why) => ok(T.indexOf(s) >= 0, "page states " + JSON.stringify(s) + (why ? " (" + why + ")" : ""));

  // ---------------- the page's numbers
  has("4,000 MW at the 2025 peak", "the zones' peaks add to " + cfg.zones.reduce((s, z) => s + z.peak, 0));
  has("the $5,000/MWh penalty for unserved load and the $1,000/MWh for reserve short"); ok(cfg.voll === 5000 && cfg.reserveShort === 1000, "penalties as stated");
  E2.sb2Schema().fields[0].values.forEach(id => { const p = P.periods[id]; ok(T.indexOf(p.label) >= 0, "the periods table names " + p.label); });
  [["Summer peak day, 29 July 2025", "The 2025 summer day with the highest hourly demand"], ["Winter peak day, 21 January 2025", "The 2025 winter day with the highest hourly demand, among days with no repaired hours"],
    ["Windy spring day, 17 April 2025", "The 2025 spring day with the most wind energy"], ["Peak-demand week, 14–20 August 2025", "The 2025 week with the highest average daily demand peak"],
    ["Low-wind winter week, 2–8 January 2025", "One of the two calmest weeks of winter 2025 by mean wind; lesson A8's week"]].forEach(([a, b]) => ok(PAGE.indexOf("<tr><td>" + a + "</td><td>" + b + "</td></tr>") >= 0, "the periods table row: " + a + " (the engine test checks each claim)"));
  ok(cfg.tie.spill[0] < cfg.tie.spill[1] && cfg.tie.spill[1] < cfg.tie.spill[2] && cfg.zones.map(z => z.id).join() === "W,T,M", "tie rule as the page says: Wind Ridge's spill first, then Prairie Town's, then Metro's");
  ok(cfg.tie.shed[2] < cfg.tie.shed[1] && cfg.tie.shed[1] < cfg.tie.shed[0], "tie rule as the page says: Metro's load shed first, then Prairie Town's, then Wind Ridge's");
  ok(Math.max(...cfg.tie.spill, ...cfg.tie.shed, cfg.tie.reserve, cfg.tie.battery + 23 * cfg.tie.batteryHour) < 0.01, "every tie cost is below a cent per MWh, as the page says");
  const ET = fs.readFileSync(path.join(X.SITE, "_tests/learn/test_e2-engine.js"), "utf8"), nCases = (ET.slice(ET.indexOf("const cases = ["), ET.indexOf("const shown")).match(/\["(SB2|C2) /g) || []).length;
  has("runs seven benchmark plans again with the tie weights ×10 and ×0.1: every number shown stays the same", "the engine test's cases");
  ok(nCases === 7 && /for \(const k of \[10, 0\.1\]\)/.test(ET), "the engine test runs seven benchmark plans with the ties ×10 and ×0.1 (" + nCases + ")");
  has("moves 0.001 MWh up and when it moves down: no price sits on a corner. Your own plans are not checked this way.", "the engine test's step; the claim covers the benchmark runs only");
  ok(/bump: \{ row, d: 1e-3 \}/.test(ET), "the engine test moves each row by 0.001 MWh");

  // ---------------- the run's words, for every preset on every period, and for plans with a link open (0 MW)
  let wordsOk = true, notes = [], nRuns = 0, seen = { open: 0, cent: 0, llShed: 0, curtail: 0 };
  const OPEN = [["both links open, 600 MW at Town", { ll: 600, llz: "T", wt: 0, tm: 0 }], ["Town–Metro open, 300 MW at Town", { ll: 300, llz: "T", tm: 0 }],
    ["Ridge–Town open", { wt: 0 }], ["both open, 300 MW in Metro, 30% flexible", { ll: 300, llz: "M", flex: 30, bid: 200, wt: 0, tm: 0 }]];
  const plans = [];
  for (const per of P.periodList) for (const pr of E2.presets) plans.push([per + "/" + pr.id, Object.assign({}, def, pr.state, { per })]);
  for (const per of ["peak", "hot"]) for (const [nm, x] of OPEN) plans.push([per + "/" + nm, Object.assign({}, def, x, { per })]);
  for (const [nm, st] of plans) {
    const r = await E2.solve(st, P, { solver }); nRuns++;
    if (!r.ok) { wordsOk = false; notes.push(nm + " " + r.status); continue; }
    const R = r.results, S = PG.says(R, P), txt = S.map(s => s.text).join(" "), bad = w => { wordsOk = false; notes.push(nm + " " + w); };
    const shed = R.tot.shed > 0.5;
    if (shed !== /MWh unserved/.test(txt) || (!shed && !/Every MWh served/.test(txt))) bad("shed");
    let open = 0;
    P.links.forEach(l => {
      const n = R.tot.cong[l.id], cap = R.sys.caps[l.id], a = P.zix[l.from], b = P.zix[l.to];
      let split = 0; R.days.forEach(d => d.hours.forEach(h => { if ((cap === 0 || Math.abs(h.f[l.id]) >= cap - 1e-6) && Math.abs(h.z[a].price - h.z[b].price) >= 1 - 1e-6) split++; }));
      if (cap === 0) {
        open++; seen.open++;
        if (!txt.includes(l.name + " is open (set to 0 MW):** nothing flows on it") || !txt.includes("differ by $1/MWh or more in " + E2.kilo(split) + " of " + R.hours + " hours") || /at its limit for/.test(txt.split(l.name)[1] || "")) bad("open " + l.id);
        if (R.days.some(d => d.hours.some(h => Math.abs(h.f[l.id]) > 1e-9))) bad("flow on an open link");
      } else if ((n > 0) !== new RegExp(l.name + " at its limit for " + n + " of").test(txt)) bad(l.id);
    });
    const sp = PG.spread(R), cent = /within a cent/.test(txt);
    if (cent) seen.cent++;
    if (cent !== (!open && P.links.every(l => R.tot.cong[l.id] === 0) && sp < 0.01)) bad("cent " + sp);
    if (/within a cent/.test(txt) && !(sp < 0.01)) bad("spread " + sp);
    if (R.tot.rshort > 0.5 !== /Reserve short: [\d,]+ MW·h\*\* over [\d,]+ hours, the missing reserve MW added up hour by hour, not demand unserved\./.test(txt)) bad("reserve");
    // the money card's notes: the large load's served energy never above its zone's, its share of a shortfall stated
    const N = PG.notes(R, P).join(" "), zi = P.zix[R.sys.llz];
    if (R.sys.ll > 0) {
      if (!N.includes("The large load: " + E2.kilo(R.tot.llMWh) + " MWh served") || R.tot.llMWh > R.served[zi] + 1e-6) bad("ll served");
      if ((R.tot.llShed > 0.5) !== N.includes(E2.kilo(R.tot.llShed) + " MWh of it unserved, its share of " + P.zones[zi].name + "'s shortfall in proportion to load")) bad("ll shed");
      if ((R.tot.curtail > 0.5) !== N.includes("it curtailed " + E2.kilo(R.tot.curtail) + " MWh at its $" + E2.kilo(R.sys.bid) + "/MWh bid")) bad("curtail");
      if (R.tot.llShed > 0.5) seen.llShed++;
      if (R.tot.curtail > 0.5) seen.curtail++;
    }
    if (/above its|when the price is above/.test(N + txt)) bad("strict curtailment claim");
    const ro = PG.readouts(R, P);
    if (ro[0][1] !== moneyK(R.tot.prod) || ro[2][1] !== E2.kilo(R.tot.shed) + " MWh" || ro[3][1] !== (R.sys.caps.TM === 0 ? "open (0 MW)" : E2.kilo(R.tot.cong.TM) + " h")) bad("readouts");
  }
  ok(wordsOk, "the run's words, notes and readouts are true for all " + nRuns + " runs: every preset on every period and eight with a link open (" + notes.slice(0, 4).join("; ") + ")");
  ok(seen.open >= 8 && seen.cent > 0 && seen.llShed > 0 && seen.curtail > 0, "the runs cover open links, equal prices, the large load's share of a shortfall and curtailment at its bid (" + JSON.stringify(seen) + ")");
  // review 1: "differ by $1/MWh or more" counts unrounded gaps of $1 or more (the review's case: summer peak day,
  // 300 MW at Prairie Town, Town–Metro at 100 MW, gas $3.60; at 20:00 the gap is about $0.75, which counted before)
  { const st = Object.assign({}, def, { ll: 300, llz: "T", tm: 100, gas: 3.6 }), r = await E2.solve(st, P, { solver }), R = r.results, l = P.links.find(x => x.id === "TM"), a = P.zix[l.from], b = P.zix[l.to];
    const atCap = R.days[0].hours.filter(h => Math.abs(h.f.TM) >= R.sys.caps.TM - 1e-6), gaps = atCap.map(h => Math.abs(h.z[a].price - h.z[b].price));
    const n1 = gaps.filter(g => g >= 1 - 1e-6).length, nHalf = gaps.filter(g => g >= 0.5).length, txt = PG.says(R, P).map(s => s.text).join(" ");
    ok(r.ok && nHalf > n1 && gaps.some(g => g > 0.5 && g < 1) && new RegExp("Town–Metro at its limit for " + atCap.length + " of " + R.hours + " hours;\\*\\* in " + (n1 === atCap.length ? "all of them" : n1 + " of them") + " the prices on its two sides differ by \\$1/MWh or more").test(txt),
      "the price-gap count: " + n1 + " of " + atCap.length + " hours at the limit differ by $1/MWh or more (the old $0.50 threshold counted " + nHalf + ")"); }
  // review 2 and 3: the average price is per MWh served, weighted by use; the reserve shortfall is in MW·h
  { const R = r1.results, N = PG.notes(R, P).join(" "), ro = PG.readouts(R, P);
    ok(ro[1][0] === "Average price per MWh served, Prairie Town" && /so hours with more use weigh more; uplift and reserve payments are not in it/.test(N) && /\[\[congestion-rent\|Congestion rent\]\] [^:]+: loads' energy payments minus plants' energy earnings/.test(N) && /html: LX\.rich\(t\)/.test(JS),
      "the average price is per MWh served, weighted by use, energy only; congestion rent is the energy settlement, marked for the glossary");
    // offline peakers count toward the region-wide reserve, so no bench plan runs short of it: the words are checked on
    // a run's results with 10 MW short for two hours put in by hand
    const RS = Object.assign({}, R, { tot: Object.assign({}, R.tot, { rshort: 20 }), rshortHours: 2 }), say = PG.says(RS, P).map(s => s.text).join(" ");
    ok(/\*\*Reserve short: 20 MW·h\*\* over 2 hours, the missing reserve MW added up hour by hour, not demand unserved\. Each MW·h short costs the model \$1,000\./.test(say) && !/Reserve short by/.test(say + JS), "reserve short is said in MW·h, the missing reserve added up hour by hour, not unserved demand: " + (say.match(/\*\*Reserve short[^.]*\./) || [""])[0]); }
  // curtailment at the bid: a hard case (peak-demand week, 400 MW, 20% flexible, $300/MWh): hours that curtail at
  // exactly the bid exist, so the page never says "above"
  { const r = await E2.solve(Object.assign({}, def, { per: "hot", ll: 400, flex: 20, bid: 300 }), P, { solver }), R = r.results, zi = P.zix.T;
    const atBid = R.days.reduce((a, d) => a + d.hours.filter(h => h.cl > 1e-6 && Math.abs(h.z[zi].price - 300) < 1e-6).length, 0);
    ok(r.ok && atBid > 0 && E2.schema.fields.filter(f => f.id === "bid")[0].label === "Curtailment bid" && /a partial cut can set the price equal to the bid/.test(JSON.stringify(PG.GROUPS)), "curtailment can happen at exactly the bid (" + atBid + " hours at $300/MWh): the control is the curtailment bid, and the hint says a partial cut can set the price"); }

  // ---------------- the page frame
  ["brief", "bench", "results", "explain", "sources"].forEach(id => ok(new RegExp("::: \\{#" + id + " \\.lx-sec\\}").test(PAGE), "section #" + id));
  ok(/data-learn="sb2" data-src="\.\.\/assets\/learn\/data\/e2-plains-grid\.json \.\.\/assets\/learn\/data\/town_year\.json \.\.\/assets\/learn\/data\/cf_targets\.json \.\.\/assets\/learn\/data\/path\.json"/.test(PAGE) && /<script src="\.\.\/assets\/learn\/sb2-grid-room\.js" defer><\/script>/.test(PAGE), "data-src and the page script");
  const bundle = fs.readFileSync(X.L("learn.js"), "utf8");
  ok(bundle.indexOf("/* engine-e2.js — LX.E2") >= 0 && bundle.indexOf("/* engine-e2.js") > bundle.indexOf("/* benchrun.js") && bundle.indexOf("/* engine-e2.js") > bundle.indexOf("/* plot.js"), "engine E2 is in the bundle, after BenchRun and Plot");
  ok(/conditional on the commitment/.test(ENG) && (ENG.match(/conditional on the commitment/g) || []).length >= 3 && /Prices, conditional on the commitment/.test(JS), "the prices are labelled conditional on the commitment (chart caption, map note, card title)");
  ok(!/\b(nuclear|reactor|SMR|small modular)\b/i.test(PAGE + JS + ENG + fs.readFileSync(DPATH, "utf8")), "no nuclear term on the page, in its script, the engine or the data");
  ok(!/\bAI\b|artificial intelligence|Claude|ChatGPT|generated by/i.test(T + JS), "no AI wording");
  ["mixed-integer-program", "unit-commitment", "linear-program", "transport-model", "reserves", "shadow-price"].forEach(id => ok(new RegExp('data-term="' + id + '"').test(PAGE), "glossary mark: " + id));
  ["demand-response", "reserves", "mmbtu", "peaker", "no-load-cost", "uplift"].forEach(id => ok(new RegExp("\\[\\[" + id + "\\|").test(JS), "the bench marks the term at first use: " + id));
  ok(/data-term=\\"mmbtu\\"/.test(ENG) && /One <span[^>]*>MMBtu<\/span> is a million British thermal units/.test(PAGE), "the inputs table defines MMBtu");
  ok(/Starting conditions:\*\* the first day assumes any units on at 00:00 were already running, so their earlier start-up costs are left out/.test(JS) && /whether the reserve could reach a zone after a failure/.test(JS) && /whether the reserve can reach each zone/.test(PAGE),
    "the first day's free start and the reserve's deliverability are stated");
  [PG.TABLE_HINT, PG.UNIT_HINT, PG.START_HINT, PG.GROUPS[1].hint, PG.GROUPS[3].hint].concat(PG.notes(r1.results, P)).forEach(t => { const n = t.replace(/\[\[[a-z-]+\|([^\]]+)\]\]/g, "$1").replace(/\*\*/g, "").split(/\s+/).length; ok(n <= 35, "within the 35-word budget (" + n + "): " + t.slice(0, 40)); });
  // review 4: the page's own elements, the inputs table's cells and the plants' notes, each within 35 words
  { const OWN = PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?learn:\1:end -->/g, "").replace(/<!--[\s\S]*?-->/g, " ").replace(/^---[\s\S]*?\n---\n/, "").replace(/<style>[\s\S]*?<\/style>/g, "").replace(/<div class="lx-card lx-sources">[\s\S]*?<\/div>/, "");
    const els = OWN.replace(/^- (.*)$/gm, "<li>$1</li>").split(/<\/?(?:p|li|dd|dt|td|th|summary)\b[^>]*>/i).map(x => x.replace(/<[^>]+>/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/\s+/g, " ").trim()).filter(x => /[A-Za-z]/.test(x) && !/^```/.test(x));
    const long = els.filter(x => x.split(" ").length > 35);
    ok(els.length > 80 && !long.length, "every element of the page within 35 words (" + els.length + "): " + long.map(x => x.slice(0, 50) + " (" + x.split(" ").length + ")").join(" | ")); }
  ok(/data-term="heat-rate"/.test(PAGE) && /data-term="combined-cycle"/.test(PAGE) && /\[\[combined-cycle\|/.test(JS) && /national figures, not SPP's own/.test(PAGE) && /national, not SPP's own/.test(PAGE), "heat rate and combined cycle defined and marked; the capacity factors named as U.S. national figures rescaling SPP's timing (review 5 and 6)");
  const desc = (PAGE.match(/^description: "([^"]+)"/m) || [])[1] || "";
  ok(desc.split(/\s+/).length <= 35, "the description is within the 35-word budget (" + desc.split(/\s+/).length + " words)");
  const hrefs = [...PAGE.matchAll(/href="([^"]+)"/g)].map(m => m[1]).filter(h => !/^(https?:|mailto:|#|\.\.\/)/.test(h) && !/^index\.html(#|$)/.test(h));
  const P2 = JSON.parse(fs.readFileSync(X.L("data/path.json"), "utf8")), live = new Set([].concat(P2.starter || [], P2.more || [], P2.toolbox || []).filter(l => l.ready).map(l => l.href));
  ok(hrefs.every(h => live.has(h.replace(/#.*$/, ""))), "internal links go to live lessons only: " + hrefs.filter(h => !live.has(h.replace(/#.*$/, ""))).join(", "));
  console.log(`test_sb2-grid-room: ${checks - fails}/${checks} checks pass`);
  process.exit(fails ? 1 : 0);
})();
