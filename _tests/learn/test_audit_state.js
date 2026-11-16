// test_audit_state.js — retries use current controls; section navigation keeps the plan without sending it in a query.
"use strict";
const assert = require("assert"), fs = require("fs"), path = require("path"), vm = require("vm");
const { env, load } = require("./stubdom.js");
const SS = require("../../assets/learn/components/sharestate.js");
const schema = { key: "audit", version: 1, fields: [{ id: "size", short: "s", type: "int", min: 0, max: 100, def: 10, label: "Size" }] };
let checks = 0, failed = 0;
async function test(name, fn) { checks++; try { await fn(); } catch (e) { failed++; console.log("FAIL:", name, e.message); } }
const tick = () => new Promise(r => setImmediate(r));
function page(options = {}) {
  const E = env({ hash: options.hash }), events = {}, timers = new Map(); let timer = 0;
  const epoch = options.epoch || { value: null };
  E.LX.store.resetMark = () => epoch.value; E.LX.store.persistent = () => !options.blocked;
  E.window.addEventListener = (name, fn) => (events[name] = events[name] || []).push(fn);
  E.window.history = { state: options.state || null, replaceState(state, title, url) {
    this.state = state; E.location.href = String(url); E.location.hash = new URL(url).hash;
  } };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, "../../assets/learn/components/sharestate.js"), "utf8"), {
    window: E.window, document: E.document, location: E.location, console,
    setTimeout: fn => { timers.set(++timer, fn); return timer; }, clearTimeout: id => timers.delete(id)
  });
  let loads = 0;
  const ss = E.LX.ShareState(E.body, { schema, sync: options.sync, onLoad: () => loads++ });
  return { E, ss, epoch, loads: () => loads,
    flush() { const jobs = [...timers.values()]; timers.clear(); jobs.forEach(fn => fn()); },
    navigate(hash, state = null) { E.location.hash = hash; E.location.href = E.location.href.split("#")[0] + hash; E.window.history.state = state;
      ["popstate", "hashchange"].forEach(ev => (events[ev] || []).forEach(fn => fn({ state }))); }
  };
}
(async () => {
  await test("Try again reads changed controls and starts a new attempt", async () => {
    const E = env(); load("benchrun", E); let plan = { size: 10 }, release; const calls = [];
    const run = E.LX.BenchRun(E.body, { state: () => plan, solve: (state, ctx) => {
      calls.push([state.size, ctx.attempt]); return new Promise(r => { release = r; });
    } });
    run.button.click(); run.cancel(); plan = { size: 20 }; run.changed(plan); run.again.click();
    assert.deepStrictEqual(calls, [[10, 1], [20, 1]]);
    release({ status: "time-limit" }); await tick(); run.again.click();
    assert.deepStrictEqual(calls[2], [20, 2]);
    release({ status: "optimal", ok: true, results: {} }); await tick();
    assert.strictEqual(run.last().state.size, 20);
  });
  await test("a completed older run stays stale after controls change in flight", async () => {
    const E = env(); load("benchrun", E); let release;
    const area = E.LX.H("div", null, E.body);
    const run = E.LX.BenchRun(E.body, { results: area, solve: () => new Promise(r => { release = r; }) });
    const done = run.run({ size: 10 }); run.changed({ size: 20 });
    release({ status: "optimal", ok: true, results: {} }); await done;
    assert.strictEqual(area.getAttribute("data-stale"), "true");
  });
  await test("section navigation and reload retain the plan and other history state", () => {
    const P = page(); P.ss.set({ size: 25 }); P.flush(); P.navigate("#explain", { owner: "quarto" });
    const state = P.E.window.history.state; assert.strictEqual(state.owner, "quarto");
    const R = page({ hash: "#explain", state });
    assert.strictEqual(R.ss.get().size, 25); assert.strictEqual(R.E.location.hash, "#explain");
    assert.ok(R.ss.url().endsWith("#audit-v1-s25"));
  });
  await test("native null-state navigation during debounce keeps the latest plan and section", () => {
    const P = page(); P.ss.set({ size: 35 }); P.navigate("#results"); P.flush();
    assert.strictEqual(P.ss.get().size, 35); assert.strictEqual(P.E.location.hash, "#results");
    assert.strictEqual(page({ hash: "#results", state: P.E.window.history.state }).ss.get().size, 35);
  });
  await test("Back and Forward restore their own entries once each", () => {
    const P = page(); P.ss.set({ size: 20 }); P.flush(); P.navigate("#results"); const a = P.E.window.history.state;
    P.ss.set({ size: 40 }); P.flush(); P.navigate("#explain"); const b = P.E.window.history.state;
    P.navigate("#results", a); assert.strictEqual(P.ss.get().size, 20); assert.strictEqual(P.loads(), 1);
    P.navigate("#explain", b); assert.strictEqual(P.ss.get().size, 40); assert.strictEqual(P.loads(), 2);
  });
  await test("explicit plan links beat cached plans; damaged links do not restore the cache", () => {
    const P = page(); P.ss.set({ size: 20 }); P.flush(); P.navigate("#results"); const state = P.E.window.history.state;
    assert.strictEqual(page({ hash: "#" + SS.encode(schema, { size: 60 }), state }).ss.get().size, 60);
    assert.strictEqual(page({ hash: "#audit-v1-s999", state }).ss.get().size, 10);
  });
  await test("refused links cannot resurrect an old cache on a second reload", () => {
    const P = page(); P.ss.set({ size: 25 }); P.flush(); P.navigate("#results");
    const R = page({ hash: "#audit-v1-s999", state: P.E.window.history.state });
    assert.strictEqual(R.ss.get().size, 10);
    assert.strictEqual(page({ hash: R.E.location.hash, state: R.E.window.history.state }).ss.get().size, 10);
  });
  await test("a refused link during debounce keeps the edited plan", () => {
    for (const sync of [true, false]) {
      const P = page({ hash: "#audit-v1-s20", sync }); P.ss.set({ size: 35 }); P.navigate("#audit-v1-s999");
      assert.strictEqual(P.ss.get().size, 35);
    }
  });
  await test("Clear all invalidates the cache, including later navigation from an old tab", () => {
    const epoch = { value: null }, P = page({ epoch }); P.ss.set({ size: 45 }); P.flush(); P.navigate("#results"); const old = P.E.window.history.state;
    epoch.value = "reset";
    assert.strictEqual(page({ hash: "#results", state: old, epoch }).ss.get().size, 10);
    P.navigate("#explain");
    assert.strictEqual(page({ hash: "#explain", state: P.E.window.history.state, epoch }).ss.get().size, 10);
  });
  await test("sync false and blocked storage do not acquire history persistence", () => {
    for (const options of [{ sync: false }, { blocked: true }]) {
      const P = page(options); P.ss.set({ size: 25 }); P.navigate("#explain"); P.flush();
      assert.strictEqual(page({ ...options, hash: "#explain", state: P.E.window.history.state }).ss.get().size, 10);
    }
  });
  console.log(`${checks} state regression checks, ${failed} failed`); process.exitCode = failed ? 1 : 0;
})();
