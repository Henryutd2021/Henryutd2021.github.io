// test_solve_progress.js — Node tests of the progress line for long solves (assets/learn/components/solver.js:
// LX.SolveProgress, its words, and its use in LX.SolverStatus, LX.BenchRun and LX.SolveStep), on the stub document with a
// clock the test moves by hand. What it checks:
//   - the words: seconds elapsed, "step k of n" (or the page's unit), "usually about N s"; never a percentage
//   - the line stays hidden for the first two seconds, then shows the bar and the words in place (inside the host it was
//     given, next to the control), counts the seconds, follows step(k, n), and is announced once (a polite live region
//     beside it, whose text does not change while the line runs)
//   - it disappears on completion, on an error and at a time limit, and the status words of the outcome stay
//   - LX.SolverStatus starts it on "loading" or "solving" and stops it on any outcome; LX.BenchRun has one under its Run
//     button, takes the page's expected time and step count (ctx.step), and stops it on cancel; LX.SolveStep stops it
//     when its job ends
//   - the stylesheet: reduced motion draws no bar (text only), and nothing animates the text
// Usage (from the site folder): node _tests/learn/test_solve_progress.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { env, buttons } = require("./stubdom.js");
const SITE = path.resolve(__dirname, "..", "..");
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }

// a clock the test moves: setTimeout and setInterval run when advance() passes their time
function clock() {
  let t = 0, seq = 0; const jobs = new Map();
  const add = (fn, ms, every) => { const id = ++seq; jobs.set(id, { at: t + Math.max(0, ms || 0), fn, every }); return id; };
  return {
    now: () => t,
    setTimeout: (fn, ms) => add(fn, ms, 0), clearTimeout: id => jobs.delete(id),
    setInterval: (fn, ms) => add(fn, ms, ms), clearInterval: id => jobs.delete(id),
    advance(ms) {
      const end = t + ms;
      for (;;) {
        let next = null;
        jobs.forEach((j, id) => { if (j.at <= end && (!next || j.at < next[1].at)) next = [id, j]; });
        if (!next) break;
        const [id, j] = next; t = j.at;
        if (j.every) j.at += j.every; else jobs.delete(id);
        j.fn();
      }
      t = end;
    },
    pending: () => jobs.size
  };
}
function setup() {
  const E = env(), C = clock();
  E.window.performance = { now: C.now };
  const ctx = { window: E.window, document: E.document, location: E.location, history: { replaceState() {} }, performance: E.window.performance,
    navigator: {}, setTimeout: C.setTimeout, clearTimeout: C.clearTimeout, setInterval: C.setInterval, clearInterval: C.clearInterval, console, module: { exports: {} },
    URL, Promise, JSON, Math, Date, Object, Array, String, Number, Boolean, Error, isNaN, isFinite };
  const load = name => { ctx.module = { exports: {} }; vm.runInNewContext(fs.readFileSync(path.join(SITE, "assets/learn/components", name + ".js"), "utf8"), ctx); return ctx.module.exports; };
  const S = load("solver"); load("benchrun"); load("solvestep");
  return { E, C, S, LX: E.LX, H: E.LX.H };
}
const tick = () => new Promise(r => setImmediate(r));
const visible = el => !el.hidden;

(async () => {
  // ---------------- the words (pure)
  {
    const { S } = setup(), P = S.progress;
    ok(P.AFTER === 2000, "the line waits two seconds before it appears");
    ok(P.text({ secs: 7.9 }) === "Still solving · 7 s", "words: the whole seconds elapsed");
    ok(P.text({ secs: 12, k: 3, n: 14 }) === "Still solving · 12 s · step 3 of 14", "words: step k of n when a click runs several solves");
    ok(P.text({ secs: 12, k: 5, n: 26, unit: "day", usual: 14.6 }) === "Still solving · 12 s · day 5 of 26 · usually about 15 s", "words: the page's unit and its usual time");
    ok(P.text({ secs: 3, k: 9, n: 8 }) === "Still solving · 3 s · step 8 of 8", "words: a step count never runs past n");
    ok(P.text({ secs: 3, k: 1, n: 1 }) === "Still solving · 3 s", "words: no step count for a single solve");
    ok(P.say({ n: 8, unit: "LP", usual: 6 }) === "Still solving: the page is working, 8 LPs in all; this usually takes about 6 s.", "words: the one announcement names the count and the usual time");
    ok(P.say({}) === "Still solving: the page is working.", "words: the announcement without a count or a usual time");
    const all = [P.text({ secs: 40, k: 2, n: 3, usual: 20 }), P.say({ n: 3, usual: 20 })].join(" ");
    ok(!/%|percent/.test(all), "words: never a percentage (the solver cannot know one)");
  }

  // ---------------- the line in place: hidden for two seconds, then the bar, the seconds and the steps; announced once
  {
    const { C, LX, H, E } = setup();
    const row = H("div", { class: "row" }, E.body), btn = H("button", { text: "Solve" }, row);
    const pg = LX.SolveProgress(row, { unit: "cap", usual: 25 });
    const el = row.querySelector(".lx-solve-prog"), sr = row.querySelector(".lx-sr");
    ok(el && el.parentNode === row && btn.parentNode === row, "in place: the line sits in the host beside the control that started the solve (no modal)");
    ok(el.hidden && sr && sr.getAttribute("aria-live") === "polite" && sr.textContent === "", "before a solve: hidden; the polite live region is already in the page, empty");
    ok(el.querySelector(".lx-solve-prog-bar") && el.querySelector(".lx-solve-prog-bar").getAttribute("aria-hidden") === "true", "the moving bar is decoration (aria-hidden)");
    pg.start({ steps: 14 });
    C.advance(1900);
    ok(el.hidden && sr.textContent === "" && pg.running() && !pg.shown(), "a solve shorter than two seconds never shows the line");
    C.advance(200);
    ok(visible(el) && pg.shown() && /^Still solving · 2 s · cap 1 of 14 · usually about 25 s$/.test(el.querySelector(".lx-solve-prog-text").textContent), "after two seconds: the bar, the seconds, cap 1 of 14 and the usual time");
    const said = sr.textContent;
    ok(said === "Still solving: the page is working, 14 caps in all; this usually takes about 25 s.", "announced once when it appears: " + said);
    pg.step(4, 14); C.advance(3000);
    ok(/· 5 s · cap 4 of 14 ·/.test(el.textContent), "the seconds count on and the step follows step(k, n): " + el.textContent);
    ok(sr.textContent === said, "the live region does not change while the line runs (one announcement, no chatter)");
    pg.stop();
    ok(el.hidden && sr.textContent === "" && !pg.running() && C.pending() === 0, "stop(): hidden, the live region cleared, every timer stopped");
    pg.start({}); pg.stop(); C.advance(5000);
    ok(el.hidden && sr.textContent === "", "stopped before two seconds: it never appears");
  }

  // ---------------- LX.SolverStatus: starts on loading or solving, stops on any outcome; the outcome's words stay
  {
    const { C, LX, H, E } = setup();
    const host = H("div", null, E.body), st = LX.SolverStatus(host);
    st.set("solving", { usual: 12, steps: 3, unit: "set" });
    C.advance(2500);
    const el = host.querySelector(".lx-solve-prog");
    ok(el && visible(el) && /set 1 of 3 · usually about 12 s/.test(el.textContent) && st.el.textContent === "Solving…", "SolverStatus: the line appears under the pill after two seconds, with the page's count and usual time");
    st.step(2, 3); C.advance(1000);
    ok(/set 2 of 3/.test(el.textContent), "SolverStatus: step(k, n) moves the count");
    st.set("solving"); C.advance(1000);
    ok(/· 4 s ·/.test(el.textContent), "SolverStatus: a second 'solving' while one runs keeps the clock (one click, one count)");
    st.set({ status: "optimal", ms: { roundTrip: 4321 } });
    ok(el.hidden && /^Optimal: the best plan that meets every rule\. · 4321 ms$/.test(st.el.textContent), "SolverStatus: gone on completion; the outcome's words stay");
    st.set("solving"); C.advance(2500); st.set({ status: "time-limit" });
    ok(el.hidden && /Stopped at the time limit/.test(st.el.textContent), "SolverStatus: gone at a time limit, with the time-limit words");
    st.set("loading"); C.advance(2500);
    ok(visible(el) && /Loading the solver/.test(st.el.textContent), "SolverStatus: a slow first load shows the line too");
    st.set({ status: "error" });
    ok(el.hidden && /error/.test(st.el.textContent), "SolverStatus: gone on an error, with the error words");
    st.set("solving"); st.done(); C.advance(5000);
    ok(el.hidden && C.pending() === 0, "SolverStatus: done() stops the line");
  }

  // ---------------- LX.BenchRun: the line under the Run button, the page's usual time and steps, stopped by the outcome
  {
    const { C, LX, H, E } = setup();
    const host = H("div", null, E.body), res = H("div", null, E.body);
    let release = null, seen = null;
    const run = LX.BenchRun(host, { label: "Run the year", state: () => ({ conn: 300 }), results: [res], render: () => {},
      progress: { unit: "day", usual: st => st.conn === 300 ? 15 : null },
      solve: (s, ctx) => { seen = ctx; return new Promise(r => { release = r; }); } });
    const el = host.querySelector(".lx-solve-prog"), btn = buttons(host, /^Run the year$/)[0];
    ok(el && el.hidden, "BenchRun: a hidden progress line in its box");
    btn.click(); await tick();
    ok(typeof seen.step === "function", "BenchRun: the solve's ctx carries step(k, n)");
    seen.step(1, 26); C.advance(2100);
    ok(visible(el) && /day 1 of 26 · usually about 15 s/.test(el.textContent), "BenchRun: after two seconds, the day count and the usual time for this plan: " + el.textContent);
    seen.step(9, 26); C.advance(1000);
    ok(/day 9 of 26/.test(el.textContent), "BenchRun: ctx.step moves the count");
    release({ status: "optimal", ok: true, results: {}, ms: { roundTrip: 3100 } }); await tick(); await tick();
    ok(el.hidden && run.status.getAttribute("data-kind") === "ok" && /optimal/.test(run.status.textContent), "BenchRun: gone on completion; the status line keeps its words");
    btn.click(); await tick(); C.advance(2100);
    ok(visible(el), "BenchRun: shown again on the next long run");
    release({ status: "time-limit", ok: false }); await tick(); await tick();
    ok(el.hidden && /time limit/.test(run.status.textContent), "BenchRun: gone at a time limit, with its words");
    btn.click(); await tick(); C.advance(2100);
    release({ status: "error", ok: false }); await tick(); await tick();
    ok(el.hidden && run.status.getAttribute("data-kind") === "error", "BenchRun: gone on an error");
    btn.click(); await tick(); C.advance(2100); run.cancel();
    ok(el.hidden && run.status.getAttribute("data-kind") === "cancelled", "BenchRun: gone when the run is cancelled");
    const stale = seen; btn.click(); await tick(); stale.step(5, 9); C.advance(2100);
    ok(!/5 of 9/.test(el.textContent), "BenchRun: a superseded run's step count does not reach the line");
    release({ status: "optimal", ok: true, results: {} }); await tick(); await tick();
    ok(C.pending() === 0, "BenchRun: no timer left after the last run");
  }

  // ---------------- LX.SolveStep: the step's status shows the line while its job runs; it stops when the job ends
  {
    const { C, LX, H, E } = setup();
    LX.solver.mode = "worker";
    const host = H("div", null, E.body), st = LX.SolverStatus(host), go = H("button", { text: "Run" }, host);
    let release = null, busy = [];
    const act = LX.SolveStep.action({ api: { busy: on => busy.push(on) }, st, host, go, progress: { usual: 20, steps: 6, unit: "solve" },
      job: () => new Promise(r => { release = r; }), show: () => {} });
    act(); await tick(); C.advance(2100);
    const el = host.querySelector(".lx-solve-prog");
    ok(el && visible(el) && /solve 1 of 6 · usually about 20 s/.test(el.textContent), "SolveStep: the line with the step's solve count and usual time: " + (el && el.textContent));
    release(null); await tick(); await tick();
    ok(el.hidden && go.disabled === false && busy.join() === "true,false", "SolveStep: gone when the job ends, even if the page draws no outcome");
  }

  // ---------------- the stylesheet: reduced motion draws no bar; the text never moves
  {
    const css = fs.readFileSync(path.join(SITE, "assets/learn/components/solver.css"), "utf8");
    const rm = css.match(/@media \(prefers-reduced-motion: reduce\) \{[^}]*\.lx-solve-prog-bar \{ display: none; \}/);
    ok(!!rm, "CSS: with reduced motion the bar is not drawn (text only)");
    ok(/\.lx-solve-prog\[hidden\] \{ display: none; \}/.test(css), "CSS: the hidden line takes no room");
    ok(!/\.lx-solve-prog-text[^{]*\{[^}]*animation/.test(css), "CSS: the words never animate");
  }

  console.log(checks + " checks, " + fails + " failed");
  process.exit(fails ? 1 : 0);
})();
