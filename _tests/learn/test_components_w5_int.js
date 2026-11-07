// test_components_w5_int.js — Node tests for what the W5 integration (2026-11-06, batch 1) promoted and wired:
//   - three components promoted from W5 lessons that a second page uses (README, "Promoted at the W5 integration"):
//     lifebox.js + lifebox.css (LX.LifeBox, i-boundary, from A11's life-cycle box), siting.js + siting.css (LX.A19 and
//     LX.SiteMap, from A19's a19.js; capstone C3 sites a solar farm on it) and whopays.js (LX.A13, from A13's
//     a13-who-pays-and-benefits.js; SB3, M12, C3 and engine E3). Each is in the bundle after the W4 promotions and names
//     itself; each sets its LX name on a page and exports its pure part in Node; the old files are gone and no page loads
//     them; the lesson scripts read the components and keep no copy; the map's styles left A19's page for siting.css
//   - LX.LifeBox's rules (tap, keys, drag) and the box on a stub document (stages, classes, slider attributes, presets)
//   - the batch-1 path.yml wiring (A11 after F11, A19 after A11, CK-A after A13, R6 next R7) and scope-2 for a city
//   - checkpoint.js (final integration, from CK-A's review): the gateAll option (the page's worked solution opens only once
//     every task is answered, in any order; early openings recorded on the attempt) and the shared late-answer rule (late
//     "practice": an answer given after the solution opened counts as practice, not as right; said in the intro), pure
//     and on a stub runner; CK-F keeps its rule (neither option)
//   - predict.js (final integration, from the A13 review): with title: false the choices are named by q as plain text
// Usage (from the site folder):  node _tests/learn/test_components_w5_int.js
"use strict";
const fs = require("fs");
const path = require("path");
const { env, load, buttons } = require("./stubdom.js");
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const rd = p => fs.readFileSync(L(p), "utf8");
const page = id => fs.readFileSync(path.join(SITE, "learn", id + ".qmd"), "utf8");
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }

// ---------------------------------------------------------------- the three promotions
const bundleJS = rd("learn.js"), bundleCSS = rd("learn.css");
const PROMO = [
  { file: "lifebox", lx: "LifeBox", old: null, css: true, users: ["a11-lca-nexus"], keys: ["tap", "key", "drag"] },
  { file: "siting", lx: "A19", lx2: "SiteMap", old: "a19.js", css: true, users: ["a19-gis-siting", "c3-prairie-city-2040"],
    keys: ["build", "coarsen", "cfg", "exclude", "criteria", "suitability", "blocks", "sites", "surface", "paths", "route", "cost", "shares", "withCity", "usd"] },
  { file: "whopays", lx: "A13", old: "a13-who-pays-and-benefits.js", css: false, users: ["a13-fairness-jobs", "sb3-city-planner", "m12-city-model", "c3-prairie-city-2040"],
    keys: ["groupsFrom", "allocate", "transfers", "regroup", "above", "jobs", "taxBase", "SCREENING", "ASSUME"] }
];
const w4end = bundleJS.indexOf("window.LX.m08 = model");
for (const P of PROMO) {
  const src = rd("components/" + P.file + ".js");
  ok(src.startsWith("/* " + P.file + ".js — LX." + P.lx + ":"), P.file + ".js names itself and its LX name");
  const tail = src.trim().split("\n").slice(-3).join("\n"), at = bundleJS.indexOf(tail);
  ok(at > 0 && at > w4end && w4end > 0, P.file + ".js is in the bundle, after the W4 promotions");
  if (P.css) {
    const css = rd("components/" + P.file + ".css"), last = css.trim().split("\n").slice(-2).join("\n");
    ok(bundleCSS.includes(last) && bundleCSS.indexOf(last) > bundleCSS.indexOf(".lx-seg {"), P.file + ".css is in learn.css, after the shared controls");
  }
  // Node: the pure part
  const C = require(L("components/" + P.file + ".js"));
  ok(P.keys.every(k => C[k] !== undefined), P.file + ".js exports " + P.keys.join(", ") + " in Node");
  // a page: the stub LX gets the name from the component file alone
  const E = env(); load(P.file, E);
  ok(E.LX[P.lx] && (!P.lx2 || E.LX[P.lx2]), "on a page, components/" + P.file + ".js sets LX." + P.lx + (P.lx2 ? " and LX." + P.lx2 : ""));
  // the old file is gone and nothing loads or requires it
  if (P.old) {
    ok(!fs.existsSync(L(P.old)), "assets/learn/" + P.old + " moved to components/" + P.file + ".js");
    const live = fs.readdirSync(path.join(SITE, "learn")).filter(f => f.endsWith(".qmd")).map(f => "learn/" + f)
      .concat(fs.readdirSync(L(".")).filter(f => f.endsWith(".js") && f !== "learn.js").map(f => "assets/learn/" + f))
      .concat(fs.readdirSync(L("components")).filter(f => f.endsWith(".js") && f !== P.file + ".js").map(f => "assets/learn/components/" + f));
    const re = new RegExp("(src=\"[^\"]*|require\\([^)]*)" + P.old.replace(/[.-]/g, "\\$&"));
    const hits = live.filter(f => re.test(fs.readFileSync(path.join(SITE, f), "utf8")));
    ok(hits.length === 0, "no page loads and no script requires " + P.old + ": " + hits.join(" "));
  }
  // the lesson pages load learn.js and their own script only
  P.users.forEach(u => {
    const scripts = [...page(u).matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
    ok(scripts.length === 2 && /learn\.js$/.test(scripts[0]) && scripts[1] === "../assets/learn/" + u + ".js", u + ": loads learn.js and its own script only: " + scripts.join(" "));
  });
}
// the lesson scripts read the components and keep no copy of them
{
  const a11 = rd("a11-lca-nexus.js"), a19 = rd("a19-gis-siting.js"), a13 = rd("a13-fairness-jobs.js");
  ok(/LX\.LifeBox\(wrap, \{/.test(a11) && !/role: "slider"/.test(a11) && !/pointerdown/.test(a11), "A11 draws its box with LX.LifeBox and keeps no copy of the handles");
  ok(/require\("\.\/components\/siting\.js"\)/.test(a19) && !/^\s*function (lattice|noise|fbm|riverY|exclude|suitability|Heap)\(/m.test(a19), "A19's script requires components/siting.js in Node and keeps no copy of the map model");
  ok(/require\("\.\/components\/whopays\.js"\)/.test(a13) && !/^\s*function (allocate|transfers|jobs|taxBase)\(/m.test(a13), "A13's script requires components/whopays.js in Node and keeps no copy of the accounting");
  ok(!/require\(|document\.|innerHTML/.test(rd("components/whopays.js").replace(/\/\*[\s\S]*?\*\//, "")), "whopays.js is pure (no DOM, no require)");
}
// the map's styles: every class the map draws is styled in siting.css, none of them in A19's page any more
{
  const css = rd("components/siting.css"), mapjs = rd("components/siting.js"), q = page("a19-gis-siting");
  const own = (q.match(/<style>([\s\S]*?)<\/style>/) || [, ""])[1];
  const styled = new Set([...css.matchAll(/\.(a19-[a-z0-9-]+)/g)].map(m => m[1])), drawn = new Set([...mapjs.matchAll(/"(a19-[a-z0-9-]+)/g)].map(m => m[1]));
  const pageStyled = new Set([...own.matchAll(/\.(a19-[a-z0-9-]+)/g)].map(m => m[1]));
  ok(["a19-map", "a19-fig", "a19-svg", "a19-legend", "a19-cell", "a19-site", "a19-route", "a19-cur", "a19-sw", "a19-hatch-ln"].every(c => styled.has(c)), "siting.css styles the map, its legend and the line under it");
  ok([...pageStyled].every(c => !styled.has(c)), "A19's page keeps only its own styles: " + [...pageStyled].filter(c => styled.has(c)).join(" "));
  ok([...drawn].filter(c => pageStyled.has(c)).length === 0, "no class the map draws is styled on A19's page");
}

// ---------------------------------------------------------------- LX.LifeBox: rules and the box
{
  const LB = require(L("components/lifebox.js"));
  let S = { L: 2, R: 2 };
  ok(LB.tap(S, 0) && S.L === 0 && S.R === 2, "tap: a stage outside comes in with everything between");
  ok(LB.tap(S, 0) && S.L === 1, "tap: an end stage inside moves out");
  ok(LB.tap(S, 1) && S.L === 2 && S.R === 2 && LB.tap(S, 2) === false, "tap: the last stage inside stays inside");
  S = { L: 1, R: 1 }; ok(LB.tap(S, 1) === false && S.L === 1 && S.R === 1, "tap: a one-stage boundary cannot empty");
  S = { L: 1, R: 2 }; ok(LB.tap(S, 1) && S.L === 2 && S.R === 2, "tap: the left end inside moves out");
  S = { L: 0, R: 3 }; ok(LB.tap(S, 1) === false, "tap: a stage in the middle does nothing");
  S = { L: 2, R: 2 };
  ok(LB.key(S, "l", "ArrowLeft", 4) && S.L === 1, "key: ArrowLeft moves the left edge one stage back");
  ok(LB.key(S, "r", "End", 4) && S.R === 3, "key: End takes the right edge to the last stage");
  ok(LB.key(S, "l", "End", 4) && S.L === 3, "key: End takes the left edge up to the right edge");
  ok(LB.key(S, "l", "ArrowRight", 4) === false && S.L === 3, "key: the left edge cannot pass the right edge (no move, still handled)");
  ok(LB.key(S, "l", "Tab", 4) === null, "key: other keys are left alone (null)");
  S = { L: 1, R: 2 }; ok(LB.drag(S, "r", 0) && S.L === 1 && S.R === 1 && LB.drag(S, "r", 0) === false, "drag: the right edge stops at the left edge");
  S = { L: 1, R: 2 }; ok(LB.drag(S, "l", 3) && S.L === 2 && S.R === 2, "drag: the left edge stops at the right edge");
  // the box on a stub document
  const E = env(); load("lifebox", E);
  const host = E.LX.H("div", null, E.body), St = { L: 1, R: 1 }, seen = [];
  const box = E.LX.LifeBox(host, { stages: [{ label: "Mine" }, { label: "Plant" }, { label: "Scrap" }], state: St, cls: "zz",
    presets: [["all", "All", 0, 2]], tile: (el, i, inB) => { el.textContent = "stage " + i + (inB ? " in" : " out"); }, onChange: s => seen.push(s.L + "-" + s.R) });
  ok(box.tiles.length === 3 && box.handles.length === 2 && box.el.className === "lx-life-chain zz-chain", "the box: three tiles, two handles, its own and the page's classes");
  ok(box.tiles[0].className.split(" ").join() === "lx-life-tile,zz-tile,out" && box.tiles[1].getAttribute("aria-pressed") === "true", "tiles: out and aria-pressed follow the boundary");
  ok(box.handles[1].getAttribute("aria-valuemax") === "3" && box.handles[0].getAttribute("aria-valuetext") === "starts at Plant, stage 2 of 3", "handles: sliders over the stages, with words");
  box.handles[1].fire("keydown", { key: "End" });
  ok(St.R === 2 && box.tiles[2].textContent === "stage 2 in" && seen.join() === "1-2", "a key moves the edge, repaints the tiles and tells the page");
  box.tiles[0].click(); ok(St.L === 0 && seen.join() === "1-2,0-2" && box.presets.all[0].getAttribute("aria-pressed") === "true", "a tap brings a stage in; the matching preset is pressed");
  box.tiles[1].click(); ok(St.L === 0 && seen.length === 2, "a tap on a middle stage changes nothing");
}

// ---------------------------------------------------------------- Sankey badges on phones (sankey.css; batch 2, from F9)
{
  const css = rd("components/sankey.css"), rule = (css.match(/^\.lx-sk circle\.badge \{([^}]*)\}/m) || [, ""])[1];
  ok(/display: inline;/.test(rule) && bundleCSS.includes(".lx-sk circle.badge { display: inline;"), "sankey.css shows the badge discs (Bootstrap's .badge:empty would hide them), in learn.css too");
  const pages = fs.readdirSync(path.join(SITE, "learn")).filter(f => f.endsWith(".qmd")).filter(f => /circle\.badge/.test(page(f.slice(0, -4))));
  ok(pages.length === 0, "no page keeps its own copy of the badge rule: " + pages.join(" "));
}

// ---------------------------------------------------------------- the batch-1 wiring
{
  const PY = fs.readFileSync(path.join(SITE, "learn/path.yml"), "utf8");
  const row = id => { const i = PY.indexOf("  id: " + id + "\n"); return i < 0 ? "" : PY.slice(i, PY.indexOf("\n- ", i)); };
  ok(/\n  after: \[F11\]/.test(row("a11-lca-nexus")), "A11 after F11");
  ok(/\n  after: \[A11\]/.test(row("a19-gis-siting")), "A19 after A11");
  ok(/\n  after: \[A1, A4, A13\b/.test(row("ck-a-spreadsheet")), "CK-A after A1, A4, A13");
  ok(/\n  next: R7\n/.test(row("r06-uncertainty-properly") + "\n") && /\n  next: R8/.test(row("r07-cost-carbon-properly")), "R6 next R7, R7 next R8 (the curriculum's order)");
  const G = JSON.parse(rd("data/glossary.json")), g = (G.terms || G).filter ? (G.terms || G).filter(t => t.id === "scope-2")[0] : (G.terms || G)["scope-2"];
  const def = g && (g.short || g.def || "");
  ok(/company/.test(def) && /city/.test(def) && (def.match(/[.!?](\s|$)/g) || []).length === 1, "scope-2: one plain sentence for a company and a city");
  ok(/\[\[scope-2\|scope 2\]\]/.test(rd("a18-city-plan.js")), "A18 marks scope 2 with the glossary term");
}

// ---------------------------------------------------------------- checkpoint.js: gateAll and the late-answer rule
{
  const CP = require(L("components/checkpoint.js"));
  const rule = { autoProficient: 1, autoStrong: 2, autoDeveloping: 1, criteria: [], levels: ["Not yet", "Developing", "Proficient", "Strong"] };
  const D = { version: "ck-g v1", rule, tasks: [
    { id: "c1", kind: "choice", title: "Pick", lesson: "M1", skill: "read", prompt: "Which?", options: [["a", "A"], ["b", "B"]], answer: "a", why: {}, solution: "A." },
    { id: "c2", kind: "choice", title: "Pick again", lesson: "M1", skill: "read", prompt: "And?", options: [["a", "A"], ["b", "B"]], answer: "b", why: {}, solution: "B." },
    { id: "f1", kind: "open-short", title: "Explain", lesson: "R5", skill: "explain", prompt: "Why?", solution: "Two points.", points: ["One.", "Two."] }] };
  const T0 = "2026-11-06T10:00:00.000Z", T1 = "2026-11-06T10:05:00.000Z";
  ok(!CP.lateAnswer({ at: T0 }, T0) && CP.lateAnswer({ at: T1 }, T0) && !CP.lateAnswer({ at: T1 }, null) && !CP.lateAnswer(null, T0), "checkpoint: an answer is late only after the opening; the one that opened it is not");
  const st = at => ({ tasks: { c1: { first: true, at: at[0] }, c2: { first: true, at: at[1] }, f1: { first: true, answer: "x", points: [true, true], at: at[2] } } });
  const s1 = st([T1, T1, T0]), L0 = CP.level(D, s1, { solOpen: T0 }), L1 = CP.level(D, s1, { late: "practice", solOpen: T0 });
  ok(L0.auto === 2 && L0.late === 0 && L1.auto === 0 && L1.late === 2 && L1.lateIds.join() === "c1,c2" && L1.explainOk && L1.level === "Not yet",
     "checkpoint: late practice counts answers after the opening as not right (0 of 2, Not yet); off by default, CK-F's rule (2 of 2)");
  ok(!CP.level(D, st([T0, T0, T1]), { late: "practice", solOpen: T0 }).explainOk && CP.level(D, st([T0, T0, T1]), { solOpen: T0 }).explainOk, "checkpoint: a written task submitted after the opening earns no points");
  ok(/counted as practice \(not right, no points\): 2 tasks\./.test(CP.describe(D, L1)) && !/practice/.test(CP.describe(D, L0)), "checkpoint: the results sentence names the late tasks");
  ok(/\| yes \(the worked solution section\)$/m.test(CP.summary(D, s1, {}, { late: "practice", solOpen: T0 })) && !/worked solution section/.test(CP.summary(D, s1, {}, { solOpen: T0 })), "checkpoint: the copied summary marks late answers");
  ok(CP.allAnswered(D, s1) && !CP.allAnswered(D, { tasks: { c1: { first: true }, c2: { first: true } } }) && CP.lastAnswerAt(D, s1) === T1, "checkpoint: allAnswered and lastAnswerAt");
  ok(CP.lateRule({ gateAll: true, n: 3 }) === "The worked solution section opens once all three tasks are answered, in any order; opening it earlier is recorded. An answer given after it opens counts as practice, not as right, and a written task then earns no points.",
     "checkpoint: the rule in words (gateAll)");
  // the runner with gateAll and the rule (a page: the lock box, the worked-solution body, the runner)
  const mount = store => {
    const E = env({ store }); load("checkpoint", E); E.window.confirm = () => true;
    const LX = E.LX, H = LX.H, pg = E.body;
    const lock = H("div", { id: "g-lock", class: "lx-ck-lock" }, pg), lb = H("button", { type: "button", text: "Open it anyway" }, lock), body = H("div", { id: "g-sol", class: "lx-ck-gated" }, pg);
    const host = H("div", null, pg), cp = LX.Checkpoint(host, { data: D, key: "ckg", code: "CK-G", lock: "#g-lock", solution: "#g-sol", gateAll: true, late: "practice", openFirst: "not-right" });
    const pick = (i, v) => { cp.show(i); host.querySelectorAll(".lx-choice").filter(b => b.textContent === v)[0].click(); };
    const explain = () => { cp.show(2); host.querySelector("textarea").value = "Because."; buttons(host, /^Submit my explanation/)[0].click(); };
    return { E, LX, lb, host, cp, pick, explain, shut: () => !lock.hidden && !body.classList.contains("is-open"), opened: () => lock.hidden && body.classList.contains("is-open") };
  };
  let P = mount({});
  ok(P.host.textContent.includes(CP.lateRule({ gateAll: true, n: 3 })) && P.shut(), "checkpoint runner: the intro says the rule up front; the worked solution starts shut");
  P.explain();
  ok(P.shut() && !P.LX.Checkpoint.solOpened("ckg"), "gateAll: the last task answered first opens nothing");
  P.pick(0, "A");
  ok(P.shut(), "gateAll: two of three answered, still shut");
  P.cp.show(1); buttons(P.host, /^Show the worked solution now/)[0].click();
  ok(P.shut() && P.cp.state().tasks.c2.solFirst && !P.cp.state().solEarly, "gateAll: a task's own early button opens only its own solution");
  P.pick(1, "B");
  ok(P.opened() && P.LX.Checkpoint.solOpened("ckg") === P.cp.state().tasks.c2.at, "gateAll: the last answer opens the worked solution, recorded at that answer's time");
  P.cp.results();
  const d1 = P.host.querySelector(".lx-ck-describe").textContent;
  ok(!/practice/.test(d1) && /1 of 2/.test(d1), "gateAll: nothing late; the task opened first counts as not right (" + d1.slice(0, 60) + ")");
  P = mount(P.E.store);   // a reload
  ok(P.opened(), "gateAll: a finished attempt reloads with the solution open");
  P.cp.results(); buttons(P.host, /^Start again/)[0].click();
  ok(P.shut() && !P.cp.state().solEarly, "Start again shuts it");
  P.lb.click();
  ok(P.opened() && P.cp.state().solEarly, "gateAll: the lock button opens it early, recorded on the attempt (solEarly)");
  P.LX.store.set("ckg-sol-open", "2026-01-01T00:00:00.000Z");   // the first opening, well before the answers below
  P.pick(0, "A"); P.pick(1, "B"); P.explain();
  P.cp.results();
  const d2 = P.host.querySelector(".lx-ck-describe").textContent, cells = P.host.querySelectorAll(".lx-ck-res td").map(td => td.textContent);
  ok(/counted as practice \(not right, no points\): 3 tasks\./.test(d2) && /0 of 2/.test(d2) && cells.filter(x => x === "yes (worked solution open)").length === 3, "the late-answer rule on the runner: results sentence and table");
  // CK-F keeps its published rule: neither option on its page
  const ckf = fs.readFileSync(L("ck-f-estimate.js"), "utf8");
  ok(!/gateAll|late:/.test(ckf), "CK-F keeps its rule: its worked solution covers only the estimate, so the options are not used");
}

// ---------------------------------------------------------------- predict.js: the choices named by q when title is false
{
  const E = env(); E.LX.progress.guess = () => null; E.LX.ready = () => {}; load("predict", E);
  const H = E.LX.H, row = p => p.el.querySelector(".lx-choices-row"), opts = [{ value: "a", label: "Yes" }, { value: "b", label: "No" }];
  const hidden = E.LX.Predict(H("div", null, E.body), { id: "p1", q: "Does the **core's** peak fit its [[substation|substation]]?", title: false, answer: "a", options: opts });
  ok(!hidden.el.querySelector(".lx-q") && row(hidden).getAttribute("aria-label") === "Does the core's peak fit its substation?" && !row(hidden).getAttribute("aria-labelledby"), "predict: title false names the choices by q as plain text (marks to words)");
  const shown = E.LX.Predict(H("div", null, E.body), { id: "p2", q: "Who fills the gap?", answer: "a", options: opts }), qe = shown.el.querySelector(".lx-q");
  ok(qe && row(shown).getAttribute("aria-labelledby") === qe.id && !row(shown).getAttribute("aria-label"), "predict: with its heading, the choices are labelled by it");
  ok(row(E.LX.Predict(H("div", null, E.body), { id: "p3", q: "", title: false, answer: "a", options: opts })).getAttribute("aria-label") === "Your prediction" &&
     row(E.LX.Predict(H("div", null, E.body), { id: "p4", q: "Your pick:", title: false, answer: "a", options: opts })).getAttribute("aria-label") === "Your pick", "predict: no q keeps 'Your prediction'; a trailing colon is dropped");
  const users = fs.readdirSync(L("")).filter(f => /\.js$/.test(f) && f !== "learn.js" && /title: false/.test(rd(f)));
  ok(users.length >= 20, "predict: " + users.length + " lesson scripts pass title: false and now get named choices");
}

console.log(fails ? `FAILED ${fails} of ${checks} checks (test_components_w5_int)` : `ok ${checks}/${checks} checks (test_components_w5_int)`);
process.exit(fails ? 1 : 0);
