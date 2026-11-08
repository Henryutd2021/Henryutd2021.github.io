// test_components_w3_int.js — Node tests for the shared ledger, solve-step, random-number and Sankey pieces:
//   - LX.Ledger (components/ledger.js, ledger.css; from A4, A7, A14): caption, header row, row headers with their second
//     line, each cell labelled by its column for the phone layout, cell classes, a total row, text never read as HTML;
//     the three pages call it and keep no copy of the table code or its CSS
//   - LX.SolveStep (components/solvestep.js, solvestep.css; from M3, A8, M4): a stubbed solve that fails, then works,
//     in both forms (job() resolves to the failed result; failed() read after job()), a throw, the busy state and the
//     step's button released, the note's class and last sentence, "Try again"; the three pages call it and keep no copy
//   - LX.mulberry32 (components/core.js; from M7 and engine E1): the same numbers as the copy the two files had, and
//     both now call the shared one
//   - LX.Sankey (components/sankey.js, sankey.css; from F3, whose script F4 loaded for it): the pure layout on a small
//     spec, F3's model keeps it as .sankey, F3 keeps no copy, F4 no longer loads F3's script
//   - the bundle: both components listed after the engines, each file names itself, tokens only
//   - contrast: LX.BenchRun dims only graphics while stale or busy; LX.ReportNote's small headings
//     use --lx-ink-2
// Usage (from the site folder):  node _tests/learn/test_components_w3_int.js
"use strict";
const fs = require("fs");
const path = require("path");
const { env, load, buttons } = require("./stubdom.js");
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const rd = p => fs.readFileSync(L(p), "utf8");
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const flush = async () => { for (let i = 0; i < 8; i++) await new Promise(r => setImmediate(r)); };
const code = s => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'])\/\/.*$/gm, "$1");

(async () => {
  // ---------------------------------------------------------------- the files and the bundle
  const bundleJS = rd("learn.js"), bundleCSS = rd("learn.css");
  ["ledger", "solvestep", "sankey"].forEach(n => {
    const js = rd("components/" + n + ".js"), css = rd("components/" + n + ".css");
    ok(js.indexOf(n + ".js — LX.") === 3 && css.indexOf(n + ".css — LX.") === 3, `${n}: the files name themselves and their component`);
    ok(!/#[0-9a-fA-F]{3,6}\b/.test(code(css)) && /var\(--lx-/.test(css), `${n}.css: colours from --lx-* tokens only`);
    ok(bundleJS.indexOf(js.trim()) > 0 && bundleCSS.indexOf(css.trim()) > 0, `${n}: in learn.js and learn.css as written`);
  });
  const head = bundleJS.split("\n")[0];
  ok(/engine-e1, ledger, solvestep, sankey(, engine-e2)?(, adequacy, gp, plainsplan, scenario)?(, lifebox, siting, whopays)?(, engine-e3)?(, engine-e4)?\)/.test(head), "bundle order: ledger, solvestep and sankey after engines E0 and E1 (engine-e2, the next shared components, engine E3 and engine E4 may follow) (" + head.slice(-60) + ")");

  // ---------------------------------------------------------------- LX.Ledger
  {
    const E = env(); load("ledger", E);
    const host = E.LX.H("div", null, E.body);
    const tb = E.LX.Ledger(host, { cls: "a4-led", caption: "Bill minus cost, a month.", columns: ["Customer", "Flat", "Time-of-use"],
      rows: [{ head: "Renter", sub: "cost $61", cells: ["+$4 above", { text: "−$2 below", cls: "down" }] },
             { head: "<b>Mill</b>", cells: [{ text: "x", l: "Own label" }, { text: "", cls: "who" }] },
             { head: "= Net", cells: ["", "+$2"], total: true }] });
    ok(tb.tagName === "TABLE" && tb.getAttribute("class") === "cf-two lx-ledger a4-led" && tb.parentNode.getAttribute("class") === "lx-scroll-x" && tb.parentNode.parentNode === host,
       "ledger: a cf-two table with its page class, in a scroll box");
    ok(tb.querySelector("caption").textContent === "Bill minus cost, a month." && tb.querySelector("caption").getAttribute("class") === "lx-hint", "ledger: the caption");
    const ths = tb.querySelectorAll("thead th");
    ok(ths.map(t => t.textContent).join("|") === "Customer|Flat|Time-of-use" && ths.every(t => t.getAttribute("scope") === "col"), "ledger: the header row");
    const rows = tb.querySelectorAll("tbody tr"), r0 = rows[0];
    ok(rows.length === 3 && r0.querySelector("th").getAttribute("scope") === "row" && r0.querySelector("th small").textContent === "cost $61", "ledger: row headers with their second line");
    const td0 = r0.querySelectorAll("td");
    ok(td0.map(t => t.getAttribute("data-l")).join("|") === "Flat|Time-of-use" && td0[0].textContent === "+$4 above" && td0[1].getAttribute("class") === "down",
       "ledger: each cell labelled by its column (the phone layout), with its class");
    ok(rows[1].querySelector("th").textContent === "<b>Mill</b>" && !rows[1].querySelector("th b") && rows[1].querySelectorAll("td")[0].getAttribute("data-l") === "Own label",
       "ledger: text stays text; a cell can carry its own label");
    ok(rows[2].getAttribute("class") === "tot" && !rows[0].getAttribute("class"), "ledger: the total row");
    const t2 = E.LX.Ledger(host, { rows: [{ head: "A", cells: ["1"] }] });
    ok(!t2.querySelector("thead") && !t2.querySelector("caption") && !t2.querySelector("td").getAttribute("data-l"), "ledger: no columns, no header row or labels");
    const css = rd("components/ledger.css");
    ok(/\.lx-ledger td \{ font-family: var\(--lx-f-mono\); font-variant-numeric: tabular-nums; \}/.test(css) && /\.lx-ledger tr\.tot th/.test(css) && /td:empty \{ display: none; \}/.test(css),
       "ledger.css: tabular figures, the total rule, empty cells out of the phone card");
    [["a04-retail-tariffs.js", "a4-led"], ["a07-flexible-demand.js", "a7-led"], ["a14-microgrid-value.js", "a14-ledger"]].forEach(([f, c]) => {
      const js = rd(f);
      ok(/LX\.Ledger\(/.test(js) && js.indexOf('cls: "' + c + '"') > 0 && !/H\("table"[^)]*cf-two/.test(js) && js.indexOf("." + c + " td{") < 0 && !/a14-ledger" \}, c2\)/.test(js),
         `${f}: the ledger through LX.Ledger (class ${c}), no table code or ledger CSS of its own`);
    });
    ok(!/\.a14-ledger (th|td)[ ,]/.test(fs.readFileSync(path.join(SITE, "learn/a14-microgrid-value.qmd"), "utf8")), "A14's page keeps only its who-column rule for the ledger");
  }

  // ---------------------------------------------------------------- LX.SolveStep
  {
    const E = env();
    E.LX.solver = { mode: "worker", describe: r => r.status === "infeasible" ? "No plan meets every rule." : "" };
    load("solvestep", E);
    const SS = E.LX.SolveStep;
    ok(SS && typeof SS.action === "function" && typeof SS.failNote === "function", "solvestep: LX.SolveStep.action and failNote");
    ok(SS.why({ status: "time-limit" }) === "The solver stopped at its time limit before it finished." && SS.why({ status: "cancelled" }) === "The run was stopped before it finished." &&
       SS.why({ status: "infeasible" }) === "No plan meets every rule." && SS.why({ status: "error", message: "boom" }) === "The solver did not finish. (boom)", "solvestep: the reasons in words");
    // form 1 (A8, M4): job() resolves to the failed result, else null
    const host = E.LX.H("div", null, E.body), go = E.LX.H("button", { text: "Run" }, host), busy = [], st = [];
    let fail = true, shown = 0, jobs = 0;
    const api = { busy: on => busy.push(on) }, status = { set: v => st.push(v) };
    const run = SS.action({ api, st: status, host, go, cls: "a8-fail", show: () => { shown++; },
      job: () => { jobs++; return Promise.resolve(fail ? { r: { status: "time-limit", ok: false } } : null); } });
    const p = run(); ok(go.disabled === true && busy.join() === "true" && st[0] === "solving", "solvestep: while it runs, the button is disabled, the page busy, the status solving");
    await p; await flush();
    let note = host.querySelector(".lx-solve-fail");
    ok(note && note.getAttribute("class") === "lx-solve-fail a8-fail" && note.getAttribute("role") === "alert" && /^No result to show\. The solver stopped at its time limit/.test(note.textContent) &&
       /Results already solved are kept\./.test(note.textContent) && buttons(note, /Try again/).length === 1, "solvestep: a failed solve gives a note with its class, the reason and Try again");
    ok(go.disabled === false && busy.join() === "true,false" && st[st.length - 1] === "" && shown === 0, "solvestep: the busy state and the button are released; nothing drawn");
    fail = false; buttons(note, /Try again/)[0].click(); await flush();
    ok(!host.querySelector(".lx-solve-fail") && shown === 1 && jobs === 2 && go.disabled === false, "solvestep: Try again runs the job again, removes the note and draws");
    // form 2 (M3): failed() read after job(); a throw
    const host2 = E.LX.H("div", null, E.body);
    let bad = { status: "infeasible", ok: false }, shown2 = 0;
    const run2 = SS.action({ api, st: status, host: host2, go: null, cls: "m3-fail", kept: " What you did before is kept.", show: () => { shown2++; },
      job: () => Promise.resolve(), failed: () => bad });
    await run2(); await flush();
    note = host2.querySelector(".m3-fail");
    ok(note && /No plan meets every rule\. What you did before is kept\.$/.test(note.textContent.replace(/Try again$/, "")) && shown2 === 0, "solvestep: failed() is read after the job; the page's own last sentence");
    bad = null; await run2(); await flush();
    ok(!host2.querySelector(".m3-fail") && shown2 === 1, "solvestep: a retry that solves removes the note");
    const host3 = E.LX.H("div", null, E.body);
    await SS.action({ api, st: status, host: host3, go: null, show: () => {}, job: () => { throw new Error("worker gone"); } })(); await flush();
    ok(/The solver did not finish\. \(worker gone\)/.test((host3.querySelector(".lx-solve-fail") || { textContent: "" }).textContent), "solvestep: a throw is a failed solve with its message");
    [["m03-capacity-expansion.js", "m3-fail"], ["a08-storage-duration.js", "a8-fail"], ["m04-storage-multienergy.js", "m4-fail"]].forEach(([f, c]) => {
      const js = rd(f);
      ok(/LX\.SolveStep\.action\(o\)/.test(js) && js.indexOf('"' + c + '"') > 0 && js.indexOf("No result to show") < 0 && js.indexOf("." + c + "{") < 0,
         `${f}: its steps solve through LX.SolveStep (note class ${c}); no copy of the note or its CSS`);
    });
    ok(/What you did before is kept; on a slow device, close other tabs first\./.test(rd("m03-capacity-expansion.js")), "M3 keeps its own last sentence");
  }

  // ---------------------------------------------------------------- LX.mulberry32
  {
    const CORE = require(L("components/core.js"));
    function old(seed) {   // the copy M7 and engine E1 each had before the shared one
      let a = seed >>> 0;
      return function () { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    }
    let same = true;
    [0, 1, 7, 2025, 123456789, 4294967295].forEach(s => { const g = CORE.mulberry32(s), h = old(s); for (let i = 0; i < 2000; i++) if (g() !== h()) same = false; });
    ok(same, "mulberry32: the shared generator gives the same numbers as the old copies (6 seeds, 2,000 draws each)");
    const M7 = require(L("m07-monte-carlo.js")), E1 = require(L("components/engine-e1.js"));
    ok(M7.rng === CORE.mulberry32, "M7's rng is LX.mulberry32");
    const e1 = rd("components/engine-e1.js"), m7 = rd("m07-monte-carlo.js");
    ok(/LX\.mulberry32/.test(e1) && e1.indexOf("0x6D2B79F5") < 0 && m7.indexOf("0x6D2B79F5") < 0 && /LX\.mulberry32 = mulberry32;/.test(rd("components/core.js")),
       "engine E1 and M7 call the shared generator and keep no copy");
    ok(typeof E1.prepare === "function", "engine E1 still loads in Node");
  }

  // ---------------------------------------------------------------- LX.Sankey
  {
    const SK = require(L("components/sankey.js")), F3 = require(L("f03-energy-services.js"));
    const spec = { nodes: [{ id: "a", col: 0 }, { id: "b", col: 1 }, { id: "c", col: 1, kind: "loss" }], links: [{ from: "a", to: "b", value: 30 }, { from: "a", to: "c", value: 10 }] };
    const Ly = SK.layout(spec, 400, 200, { gap: 10 }), Fl = SK.flows(spec);
    ok(Math.abs(Ly.nodes.a.h - (Ly.nodes.b.h + Ly.nodes.c.h)) < 1e-9 && Fl.a.vout === 40 && Fl.b.vin === 30 && /Z$/.test(SK.band(0, 0, 100, 50, 10)), "sankey: one scale for every column; flows in and out; a closed band");
    ok(F3.sankey.layout === SK.layout && F3.sankey.flows === SK.flows && F3.sankey.band === SK.band, "F3's model keeps the shared layout as .sankey");
    const f3 = rd("f03-energy-services.js"), f4q = fs.readFileSync(path.join(SITE, "learn/f04-power-plants.qmd"), "utf8");
    ok(!/function sankeyLayout|LX\.Sankey = function|lx-sankey-css/.test(f3) && /LX\.Sankey = function/.test(rd("components/sankey.js")), "F3 keeps no copy of the Sankey (code or injected styles)");
    ok(/\n  var LX = window\.LX, H = LX\.H, S = LX\.S;/.test(f3.slice(f3.indexOf("F3: view"))), "F3's view declares LX, H and S itself (they left with the Sankey's view)");
    ok(f4q.indexOf("f03-energy-services.js") < 0 && /LX\.Sankey\(/.test(rd("f04-power-plants.js")), "F4 draws LX.Sankey from the bundle and no longer loads F3's script");
  }

  // ---------------------------------------------------------------- contrast
  {
    const br = code(rd("components/benchrun.css")), rn = code(rd("components/reportnote.css"));
    const G = ":is(path, rect, circle, ellipse, line, polyline, polygon, image, use)";
    ok(br.indexOf('.lx-br-results[data-stale="true"] svg ' + G + ', .lx-br-results[data-stale="true"] canvas { opacity: .62; }') >= 0 &&
       br.indexOf('.lx-br-results[aria-busy="true"] svg ' + G + ', .lx-br-results[aria-busy="true"] canvas { opacity: .5;') >= 0 && !/:not\(\.lx-br-stale\) \{ opacity/.test(br) &&
       !/svg(, | \{)/.test(br.replace(/svg :is\([^)]*\)/g, "")), "BenchRun: only graphics (an SVG's shapes, canvas) dim while stale or busy; text, chart labels included, keeps its contrast");
    ok(/\.lx-rn-page h5 \{[^}]*color: var\(--lx-ink-2\); \}/.test(rn), "ReportNote: the small headings use --lx-ink-2");
  }

  console.log(fails ? `FAILED ${fails} of ${checks} checks (test_components_w3_int)` : `ok ${checks}/${checks} checks (test_components_w3_int)`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("FAIL: test crashed:", e && e.stack); process.exit(1); });
