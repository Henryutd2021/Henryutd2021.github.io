/* solver.js — LX.solver: linear programs (LP) and mixed-integer programs (MILP) solved in the browser by HiGHS
   (WebAssembly build of the npm package "highs" 1.15.4, MIT; vendored in assets/learn/vendor/highs-1.15.4/).
   Nothing is downloaded until a lesson first calls LX.solver.solve() or .preload(): then a Web Worker (built from a Blob,
   so it is part of this bundle) fetches highs.js and highs.wasm (about 3.5 MB) once, and every solve runs there, so the
   page stays responsive. Without Worker support it falls back to the page itself (LX.solver.mode tells which). The wasm
   bytes are fetched here and handed over with emscripten's instantiateWasm hook (this build ignores `wasmBinary`).

   Model (a plain object; names are any strings):
     { sense: "min" | "max",                                           default "min"
       variables: [{ name, lb = 0, ub = Infinity, type: "continuous" | "integer" | "binary", cost = 0 }],
                  (or an object {name: {lb, ub, type, cost}}; lb: -Infinity for a free variable)
       objective: { terms: {name: coef}, constant = 0 },               optional; added to the variables' cost
                  (a plain {name: coef} map works too)
       constraints: [{ name, terms: {name: coef} or [[name, coef], ...], and one of
                       eq: v | le: v | ge: v | lb: v, ub: v | op: "<=" | ">=" | "=", rhs: v }] }
   LX.solver.solve(model, opts) -> Promise of a result (it never rejects; problems come back as status "error"):
     { status: "optimal" | "infeasible" | "unbounded" | "infeasible-or-unbounded" | "time-limit" | "iteration-limit"
               | "objective-bound" | "objective-target" | "interrupted" | "cancelled" | "superseded" | "error",
               (objective-bound and objective-target are HiGHS early stops at a bound or target set in its options:
               the plan, if any, is not proved optimal)
       ok (status is optimal), kind: "lp" | "milp", sense, objective, values: {var: x}, rows: {constraint: activity},
       duals: {constraint: y} | null, reducedCosts: {var: d} | null, mipGap (MILP), conditional, fixed, message,
       ms: { build, solve, total (inside the solver), load (first call only), queued, roundTrip (what the page waited) } }
     opts: timeLimit (s, default 5; passed to HiGHS and enforced by a watchdog), signal (an AbortSignal),
           key (a newer queued solve with the same key supersedes an older queued one: slider sweeps), gap (MILP
           relative gap, default HiGHS's 1e-4)
   Duals (LP only): duals[c] = change of the optimal objective per unit increase of constraint c's binding bound
     (dObjective/dRHS, same sign convention for min and max). For a demand balance row in a cost-minimizing dispatch
     this is the marginal cost of one more MWh: a marginal value under stated assumptions (fixed capacities, a convex
     model, the modeled market), not a market price. reducedCosts[v] = dObjective per unit increase of v's active bound.
   MILP: no duals and no reduced costs (null): HiGHS returns no duals for a MILP. For prices conditional on the integer
     decisions (for example a unit-commitment schedule), call
     LX.solver.fixAndReprice(model, milpResult, opts): it fixes every integer and binary variable at its MILP value,
     re-solves the remaining LP and returns its duals with conditional: true and the fixed values in `fixed`. Such
     prices do not cover start-up or no-load costs (those need uplift payments); say so on the page.
   Also: LX.solver.useWorker = false before the first call forces the page fallback (benchmarks: Chrome's CPU
     throttling slows the page thread, not workers); LX.solver.preload() (start loading, e.g. when a lesson scrolls into view), .cancel() (stop the running and
     queued solves: the worker is terminated and restarted on the next call), .stats(label) ({n, p50, p95, max} of
     roundTrip ms, optionally for opts.label only), .timings (raw records), .describe(result) (one plain sentence),
     .fixedModel(model, values) (the pure LP behind fixAndReprice), .core (the pure functions, also used by Node tests),
     LX.SolverStatus(host) (a live status pill: .set("loading" | "solving" | result), with the progress line below).
   Progress for a long solve: LX.SolveProgress(host, { usual, unit, after }) -> { start(o), step(k, n), stop(), running(),
     el }. A line in place, next to the control that started the solve (never a modal): hidden for the first `after` ms
     (2,000), then a moving bar, the seconds elapsed, "step k of n" when a click runs several solves (the page passes its
     count: start({ steps: n }) or step(k, n); `unit` names a step, e.g. "day"), and "usually about N s" when the page
     gives the click's expected time (`usual`, seconds, from the solver bench at 6x: a phone stand-in). It never shows a
     percentage. When it appears it is announced once (a polite live region beside it); with reduced motion the bar is
     not drawn (text only). stop() hides it: the status words of the outcome (optimal, time limit, error) stay where they
     were. LX.SolverStatus starts it on "loading" or "solving" and stops it on any outcome (set(x, { usual, steps,
     unit }), .step(k, n), .done()); a second "solving" while it runs continues the same count (one click, several
     solves). A control whose status line is shared with others keeps its own line (LX.SolveProgress beside it) and
     calls set("solving", { progress: false }). LX.BenchRun has one under its Run button.
   Node: module.exports = { solverCore, core } — tests load the vendored highs.js with require() and call
     core.solveWith(highs, model, opts) synchronously (_tests/learn/test_solver.js). */
(function () {
  "use strict";
  var VERSION = "1.15.4";

  // ---------------------------------------------------------------- the pure core (no outer references: it is also
  // serialized with toString() into the worker, so keep everything it needs inside this function)
  function solverCore() {
    // HiGHS model status -> ours. 11 (objective bound reached) and 12 (objective target reached) are early stops, not
    // proofs of optimality, so they get statuses of their own and ok stays false (a plan found before the stop is kept).
    var STATUS = { 6: "optimal", 7: "optimal", 8: "infeasible", 9: "infeasible-or-unbounded", 10: "unbounded", 11: "objective-bound",
      12: "objective-target", 13: "time-limit", 14: "iteration-limit", 15: "error", 16: "time-limit", 17: "interrupted" };
    function num(v, dflt, what) {
      if (v === undefined || v === null) return dflt;
      if (typeof v !== "number" || isNaN(v)) throw new Error(what + ": not a number (" + v + ")");
      return v;
    }
    function terms(t, where) {
      var out = [];
      if (Array.isArray(t)) t.forEach(function (p) { out.push([String(p[0]), p[1]]); });
      else if (t && typeof t === "object") Object.keys(t).forEach(function (k) { out.push([k, t[k]]); });
      else if (t !== undefined) throw new Error(where + ": terms must be an object {name: coef} or a list [[name, coef], ...]");
      out.forEach(function (p) { if (typeof p[1] !== "number" || !isFinite(p[1])) throw new Error(where + ": coefficient of " + p[0] + " is not a finite number"); });
      return out;
    }
    // normalize a model into index form; throws on authoring errors (unknown or repeated names, bad numbers)
    function normalize(model) {
      if (!model || typeof model !== "object") throw new Error("model: expected an object");
      var sense = String(model.sense || "min").toLowerCase();
      if (sense === "minimize" || sense === "minimise") sense = "min";
      if (sense === "maximize" || sense === "maximise") sense = "max";
      if (sense !== "min" && sense !== "max") throw new Error("model.sense must be min or max");
      var vlist = model.variables || [];
      if (!Array.isArray(vlist)) vlist = Object.keys(vlist).map(function (k) { var v = vlist[k] || {}, o = { name: k }; for (var q in v) o[q] = v[q]; return o; });
      var vars = [], idx = {};
      vlist.forEach(function (v, j) {
        var name = String(v.name == null ? "x" + j : v.name);
        if (idx[name] !== undefined) throw new Error("variable " + name + " is defined twice");
        var type = v.type || (v.binary ? "binary" : v.integer ? "integer" : "continuous");
        if (["continuous", "integer", "binary"].indexOf(type) < 0) throw new Error("variable " + name + ": type must be continuous, integer or binary");
        var lb = num(v.lb, 0, "variable " + name + " lb"), ub = num(v.ub, Infinity, "variable " + name + " ub");
        if (type === "binary") { lb = Math.max(lb, 0); ub = Math.min(ub, 1); }
        idx[name] = vars.length;
        vars.push({ name: name, lb: lb, ub: ub, int: type !== "continuous", type: type, cost: num(v.cost, 0, "variable " + name + " cost") });
      });
      var obj = model.objective, offset = num(model.offset, 0, "model.offset");
      if (obj) {
        var ot = obj.terms !== undefined ? obj.terms : obj;
        if (obj.terms !== undefined) offset += num(obj.constant, 0, "objective.constant");
        terms(ot, "objective").forEach(function (p) {
          if (idx[p[0]] === undefined) throw new Error("objective: unknown variable " + p[0]);
          vars[idx[p[0]]].cost += p[1];
        });
      }
      var rows = [], ridx = {};
      (model.constraints || []).forEach(function (c, i) {
        var name = String(c.name == null ? "c" + i : c.name), where = "constraint " + name;
        if (ridx[name] !== undefined) throw new Error(where + " is defined twice");
        var lb = -Infinity, ub = Infinity, op = c.op;
        if (c.eq !== undefined) { lb = ub = num(c.eq, 0, where + " eq"); }
        else if (op !== undefined) {
          var rhs = num(c.rhs, 0, where + " rhs");
          if (op === "=" || op === "==") lb = ub = rhs; else if (op === "<=") ub = rhs; else if (op === ">=") lb = rhs;
          else throw new Error(where + ": op must be <=, >= or =");
        } else {
          if (c.le !== undefined) ub = num(c.le, 0, where + " le");
          if (c.ge !== undefined) lb = num(c.ge, 0, where + " ge");
          if (c.ub !== undefined) ub = num(c.ub, Infinity, where + " ub");
          if (c.lb !== undefined) lb = num(c.lb, -Infinity, where + " lb");
        }
        if (lb === -Infinity && ub === Infinity) throw new Error(where + ": no bound (give eq, le, ge, lb/ub or op and rhs)");
        var acc = {};
        terms(c.terms, where).forEach(function (p) {
          var j = idx[p[0]];
          if (j === undefined) throw new Error(where + ": unknown variable " + p[0]);
          acc[j] = (acc[j] || 0) + p[1];
        });
        var tl = Object.keys(acc).map(Number).sort(function (a, b) { return a - b; }).map(function (j) { return [j, acc[j]]; });
        ridx[name] = rows.length;
        rows.push({ name: name, lb: lb, ub: ub, terms: tl });
      });
      return { sense: sense, vars: vars, rows: rows, offset: offset, kind: vars.some(function (v) { return v.int; }) ? "milp" : "lp" };
    }
    // the same model with every integer and binary variable fixed at its (rounded) value: an LP
    function fixedModel(model, values) {
      var N = normalize(model), fixed = {};
      var vars = N.vars.map(function (v) {
        if (!v.int) return { name: v.name, lb: v.lb, ub: v.ub, cost: v.cost };
        if (!values || typeof values[v.name] !== "number") throw new Error("fixedModel: no value for integer variable " + v.name);
        var x = Math.round(values[v.name]); fixed[v.name] = x;
        return { name: v.name, lb: x, ub: x, cost: v.cost };
      });
      var cons = N.rows.map(function (r) {
        var o = { name: r.name, terms: r.terms.map(function (p) { return [N.vars[p[0]].name, p[1]]; }) };
        if (r.lb > -Infinity) o.lb = r.lb; if (r.ub < Infinity) o.ub = r.ub;
        return o;
      });
      return { model: { sense: N.sense, variables: vars, constraints: cons, offset: N.offset }, fixed: fixed };
    }
    function now() { return typeof performance !== "undefined" ? performance.now() : Date.now(); }
    // solve with a loaded HiGHS module (synchronous); opts: timeLimit (s), gap
    function solveWith(highs, model, opts) {
      opts = opts || {};
      var t0 = now(), N;
      try { N = normalize(model); } catch (e) { return { status: "error", ok: false, message: e.message, ms: { build: 0, solve: 0, total: 0 } }; }
      var nC = N.vars.length, nR = N.rows.length, starts = [0], indices = [], values = [];
      N.rows.forEach(function (r) { r.terms.forEach(function (p) { indices.push(p[0]); values.push(p[1]); }); starts.push(indices.length); });
      var C = highs.constants;
      var data = { numCols: nC, numRows: nR, sense: N.sense === "max" ? C.objectiveSense.maximize : C.objectiveSense.minimize, offset: N.offset,
        colCost: N.vars.map(function (v) { return v.cost; }), colLower: N.vars.map(function (v) { return v.lb; }), colUpper: N.vars.map(function (v) { return v.ub; }),
        rowLower: N.rows.map(function (r) { return r.lb; }), rowUpper: N.rows.map(function (r) { return r.ub; }),
        matrix: { format: "csr", numRows: nR, numCols: nC, starts: starts, indices: indices, values: values } };
      if (N.kind === "milp") data.integrality = N.vars.map(function (v) { return v.int ? C.variableType.integer : C.variableType.continuous; });
      var res = { status: "error", ok: false, kind: N.kind, sense: N.sense, objective: null, values: null, rows: null, duals: null, reducedCosts: null,
        mipGap: null, conditional: false, fixed: null, message: "", ms: {} };
      var t1 = now(), t2 = t1, m = null;
      try {
        m = highs.createModel(data);
        var o = { output_flag: false, time_limit: num(opts.timeLimit, 5, "timeLimit") };
        if (N.kind === "milp" && opts.gap != null) o.mip_rel_gap = num(opts.gap, 1e-4, "gap");
        m.options.set(o);
        t1 = now(); m.run(); t2 = now();
        var code = m.getModelStatus();
        res.status = STATUS[code] || "error";
        if (res.status === "error") res.message = "HiGHS model status " + code;
        var pss = m.info.get("primal_solution_status"), dss = m.info.get("dual_solution_status");
        if (pss === 2) {   // a feasible primal solution exists (optimal, or the best one found before a limit)
          var sol = m.getSolution(), x = {}, act = {};
          N.vars.forEach(function (v, j) { x[v.name] = sol.colValue[j]; });
          N.rows.forEach(function (r, i) { act[r.name] = sol.rowValue[i]; });
          res.values = x; res.rows = act; res.objective = m.getObjectiveValue();
          if (N.kind === "lp" && res.status === "optimal" && dss === 2) {
            var y = {}, d = {};
            N.rows.forEach(function (r, i) { y[r.name] = sol.rowDual[i] + 0; });
            N.vars.forEach(function (v, j) { d[v.name] = sol.colDual[j] + 0; });
            res.duals = y; res.reducedCosts = d;
          }
          if (N.kind === "milp") { try { var g = m.info.get("mip_gap"); res.mipGap = isFinite(g) ? g : null; } catch (e) { res.mipGap = null; } }
        }
      } catch (e) {
        res.status = "error"; res.message = String(e && e.message || e);
      } finally {
        if (m) try { m.dispose(); } catch (e) { /* already gone */ }
      }
      res.ok = res.status === "optimal";
      res.ms = { build: t1 - t0, solve: t2 - t1, total: now() - t0 };
      return res;
    }
    return { normalize: normalize, fixedModel: fixedModel, solveWith: solveWith, STATUS: STATUS };
  }

  var core = solverCore();
  // ---------------------------------------------------------------- the words of the progress line (pure; Node tests)
  // o: { secs (elapsed, whole seconds), k, n (step k of n, when a click runs several solves), unit ("step"), usual (s) }
  var PROGRESS_AFTER = 2000;
  function progressText(o) {
    o = o || {};
    var t = "Still solving · " + Math.max(0, Math.floor(o.secs || 0)) + " s";
    if (o.n > 1 && o.k >= 1) t += " · " + (o.unit || "step") + " " + Math.min(o.k, o.n) + " of " + o.n;
    if (o.usual > 0) t += " · usually about " + Math.max(1, Math.round(o.usual)) + " s";
    return t;
  }
  // the one sentence a screen reader hears when the line appears
  function progressSay(o) {
    o = o || {};
    return "Still solving: the page is working" + (o.n > 1 ? ", " + o.n + " " + (o.unit || "step") + "s in all" : "") + (o.usual > 0 ? "; this usually takes about " + Math.max(1, Math.round(o.usual)) + " s" : "") + ".";
  }
  var progress = { text: progressText, say: progressSay, AFTER: PROGRESS_AFTER };
  if (typeof module !== "undefined" && module.exports) module.exports = { solverCore: solverCore, core: core, VERSION: VERSION, progress: progress };
  if (typeof document === "undefined" || typeof window === "undefined" || !window.LX || !window.LX.H) return;

  // ---------------------------------------------------------------- the page side: lazy worker, queue, watchdog
  var LX = window.LX, H = LX.H;
  var S = LX.solver = { version: VERSION, core: core, mode: null, timings: [] };
  var vendor = null;
  function vendorUrl() { if (!vendor) vendor = new URL("vendor/highs-" + VERSION + "/", new URL(LX.base, location.href)).href; return vendor; }
  function now() { return performance.now(); }
  // worker source: the core plus a loader; everything it needs is in this string
  function workerSource(url) {
    return "\"use strict\";var core=(" + solverCore.toString() + ")();var URLV=" + JSON.stringify(url) + ";var loading=null;" +
      "function load(){if(!loading){loading=fetch(URLV+'highs.wasm').then(function(r){if(!r.ok)throw new Error('highs.wasm: HTTP '+r.status);return r.arrayBuffer();})" +
      ".then(function(bin){importScripts(URLV+'highs.js');return Module(opts(bin));});}return loading;}" +
      "function opts(bin){return{print:function(){},printErr:function(){},instantiateWasm:function(imp,done){WebAssembly.instantiate(bin,imp).then(function(r){done(r.instance);});return{};}};}" +
      "onmessage=function(e){var q=e.data,t0=performance.now(),first=!loading;load().then(function(h){var lt=first?performance.now()-t0:0;" +
      "if(q.type==='load'){postMessage({id:q.id,ready:true,load:lt});return;}var r=core.solveWith(h,q.model,q.opts);r.ms.load=lt;postMessage({id:q.id,result:r});})" +
      "['catch'](function(err){postMessage({id:q.id,error:String(err&&err.message||err)});});};";
  }
  var worker = null, wready = null, queue = [], current = null, seq = 0, mainHighs = null;
  function spawn() {
    if (wready) return wready;
    wready = new Promise(function (resolve, reject) {
      var t0 = now();
      try {
        if (S.useWorker === false || typeof Worker === "undefined" || typeof Blob === "undefined") throw new Error("no Worker");
        var blob = new Blob([workerSource(vendorUrl())], { type: "text/javascript" });
        worker = new Worker(URL.createObjectURL(blob));
        S.mode = "worker";
      } catch (e) { worker = null; }
      if (!worker) {   // fallback: load HiGHS into the page itself
        S.mode = "page";
        var go = function () {
          fetch(vendorUrl() + "highs.wasm").then(function (r) { if (!r.ok) throw new Error("highs.wasm: HTTP " + r.status); return r.arrayBuffer(); }).then(function (bin) {
            return new Promise(function (ok, bad) {
              var s = document.createElement("script"); s.src = vendorUrl() + "highs.js";
              s.onload = function () {
                var M = window.Module; try { delete window.Module; } catch (e) { window.Module = undefined; }
                ok(M({ print: function () {}, printErr: function () {},
                  instantiateWasm: function (imp, done) { WebAssembly.instantiate(bin, imp).then(function (r) { done(r.instance); }); return {}; } }));
              };
              s.onerror = function () { bad(new Error("highs.js could not be loaded")); };
              document.head.appendChild(s);
            });
          }).then(function (h) { mainHighs = h; S.loadMs = now() - t0; resolve(); }, reject);
        };
        go(); return;
      }
      var timer = setTimeout(function () { fail(new Error("the solver did not load within 30 s")); }, 30000);
      function fail(err) { clearTimeout(timer); try { worker.terminate(); } catch (e) { /* gone */ } worker = null; reject(err); }
      worker.onmessage = function (e) {
        var m = e.data;
        if (m.ready) { clearTimeout(timer); S.loadMs = m.load; worker.onmessage = onResult; resolve(); }
        else if (m.error) fail(new Error(m.error));
      };
      worker.onerror = function (e) { fail(new Error(e.message || "worker error")); };
      worker.postMessage({ id: 0, type: "load" });
    });
    wready.then(null, function () { wready = null; });
    return wready;
  }
  function finish(job, res) {
    res.ms = res.ms || {};
    res.ms.queued = job.tStart != null ? job.tStart - job.t0 : now() - job.t0;
    res.ms.roundTrip = job.tStart != null ? now() - job.tStart : 0;
    if (res.ms.load == null) res.ms.load = 0;
    if (job.extra) for (var k in job.extra) res[k] = job.extra[k];
    if (res.status !== "cancelled" && res.status !== "superseded" && res.status !== "error")
      S.timings.push({ label: job.opts.label || null, kind: res.kind, status: res.status, roundTrip: res.ms.roundTrip, solve: res.ms.solve, total: res.ms.total, load: res.ms.load });
    if (S.timings.length > 500) S.timings.splice(0, S.timings.length - 500);
    if (job.signal && job.onAbort) job.signal.removeEventListener("abort", job.onAbort);
    job.resolve(res);
  }
  function errorResult(job, msg, status) { return { status: status || "error", ok: false, kind: job.kind, message: msg, objective: null, values: null, rows: null, duals: null, reducedCosts: null, mipGap: null, conditional: false, fixed: null, ms: { build: 0, solve: 0, total: 0 } }; }
  function onResult(e) {
    var m = e.data, job = current;
    if (!job || m.id !== job.id) return;
    clearTimeout(job.watch); current = null;
    finish(job, m.error ? errorResult(job, m.error) : m.result);
    pump();
  }
  function pump() {
    if (current || !queue.length) return;
    spawn().then(function () {
      if (current || !queue.length) return;
      var job = current = queue.shift();
      job.tStart = now();
      if (S.mode === "page") {
        setTimeout(function () {
          var r = core.solveWith(mainHighs, job.model, job.opts);
          if (current === job) { current = null; finish(job, r); pump(); }
        }, 0);
        return;
      }
      job.watch = setTimeout(function () {   // HiGHS honors time_limit; this catches a solve that does not return at all
        if (current !== job) return;
        restart(); current = null;
        finish(job, errorResult(job, "stopped by the watchdog after " + Math.round(job.opts.timeLimit * 1000 + 2000) + " ms", "time-limit"));
        pump();
      }, job.opts.timeLimit * 1000 + 2000);
      worker.postMessage({ id: job.id, type: "solve", model: job.model, opts: { timeLimit: job.opts.timeLimit, gap: job.opts.gap } });
    }, function (err) {
      queue.splice(0).forEach(function (job) { finish(job, errorResult(job, "the solver could not be loaded: " + err.message)); });
    });
  }
  function restart() { if (worker) { try { worker.terminate(); } catch (e) { /* gone */ } } worker = null; wready = null; }

  S.preload = function () { return spawn().then(function () { return S.mode; }); };
  S.solve = function (model, opts) {
    opts = opts || {};
    var o = { timeLimit: opts.timeLimit != null ? +opts.timeLimit : 5, gap: opts.gap, label: opts.label, key: opts.key };
    return new Promise(function (resolve) {
      var job = { id: ++seq, model: model, opts: o, resolve: resolve, t0: now(), signal: opts.signal, extra: opts._extra };
      try { job.kind = core.normalize(model).kind; } catch (e) { finish(job, errorResult(job, e.message)); return; }
      if (o.key != null) queue = queue.filter(function (q) { if (q.opts.key === o.key) { finish(q, errorResult(q, "a newer solve replaced this one", "superseded")); return false; } return true; });
      if (job.signal) {
        if (job.signal.aborted) { finish(job, errorResult(job, "cancelled", "cancelled")); return; }
        job.onAbort = function () { cancelJob(job); };
        job.signal.addEventListener("abort", job.onAbort);
      }
      queue.push(job); pump();
    });
  };
  function cancelJob(job) {
    var i = queue.indexOf(job);
    if (i >= 0) { queue.splice(i, 1); finish(job, errorResult(job, "cancelled", "cancelled")); return; }
    if (current === job) { clearTimeout(job.watch); if (S.mode === "worker") restart(); current = null; finish(job, errorResult(job, "cancelled", "cancelled")); pump(); }
  }
  S.cancel = function () { queue.splice(0).forEach(function (j) { finish(j, errorResult(j, "cancelled", "cancelled")); }); if (current) cancelJob(current); };
  S.fixedModel = core.fixedModel;
  S.fixAndReprice = function (model, milp, opts) {
    var job0 = { kind: "lp", opts: {} };
    if (!milp || !milp.values) return Promise.resolve(errorResult(job0, "fixAndReprice needs a MILP result with values"));
    var f;
    try { f = core.fixedModel(model, milp.values); } catch (e) { return Promise.resolve(errorResult(job0, e.message)); }
    opts = opts || {}; var o = {}; for (var k in opts) o[k] = opts[k];
    o._extra = { conditional: true, fixed: f.fixed };
    return S.solve(f.model, o);
  };
  S.stats = function (label) {
    var a = S.timings.filter(function (t) { return label == null || t.label === label; }).map(function (t) { return t.roundTrip; }).sort(function (x, y) { return x - y; });
    var q = function (p) { return a.length ? a[Math.min(a.length - 1, Math.ceil(p * a.length) - 1)] : null; };
    return { n: a.length, p50: q(0.5), p95: q(0.95), max: a.length ? a[a.length - 1] : null, load: S.loadMs == null ? null : S.loadMs };
  };
  var SAY = { optimal: "Optimal: the best plan that meets every rule.", infeasible: "Infeasible: no plan meets every rule.",
    unbounded: "Unbounded: the objective can improve without limit, so a rule is missing.",
    "infeasible-or-unbounded": "No answer: the rules either cannot all hold or leave the objective without limit.",
    "time-limit": "Stopped at the time limit; the plan shown, if any, may not be the best.", "iteration-limit": "Stopped at the iteration limit.",
    "objective-bound": "Stopped at the objective bound set for this run; the plan shown, if any, may not be the best.",
    "objective-target": "Stopped on reaching the objective target set for this run; the plan shown may not be the best.",
    interrupted: "Interrupted.", cancelled: "Canceled.", superseded: "Replaced by a newer run.", error: "The solver reported an error." };
  S.describe = function (r) {
    if (!r) return "";
    var s = SAY[r.status] || r.status;
    if (r.kind === "milp" && r.ok) s += r.mipGap ? " Optimality gap " + (r.mipGap * 100).toFixed(2) + "%." : "";
    if (r.conditional) s += " Prices are conditional on the fixed integer decisions.";
    return s;
  };
  // progress for a long solve (see the header): o = { usual (s), unit, after (ms) }; start(o2) takes the same fields
  // plus steps; every timer stops on stop()
  S.progress = progress;
  LX.SolveProgress = function (host, o) {
    o = o || {};
    var el = H("div", { class: "lx-solve-prog", hidden: true }, host);
    H("span", { class: "lx-solve-prog-bar", "aria-hidden": "true" }, el);
    var txt = H("span", { class: "lx-solve-prog-text" }, el);
    // the live region lives beside the line, always in the page, so the one announcement is heard when the line appears
    var sr = H("span", { class: "lx-sr", "aria-live": "polite" }, host);
    var t0 = 0, shown = false, wait = null, tick = null, cur = {};
    function paint() { txt.textContent = progressText({ secs: (now() - t0) / 1000, k: cur.k, n: cur.n, unit: cur.unit, usual: cur.usual }); }
    function show() {
      wait = null; shown = true; el.hidden = false; paint();
      sr.textContent = progressSay(cur);
      tick = setInterval(paint, 1000);
      if (LX.emit) LX.emit("layout");
    }
    var api = {
      el: el,
      start: function (s2) {
        s2 = s2 || {};
        api.stop();
        cur = { usual: s2.usual != null ? s2.usual : o.usual, unit: s2.unit || o.unit, n: s2.steps || null, k: s2.steps ? 1 : null };
        t0 = now();
        wait = setTimeout(show, s2.after != null ? s2.after : o.after != null ? o.after : PROGRESS_AFTER);
      },
      step: function (k, n) {
        if (n != null) cur.n = n;
        cur.k = k;
        if (shown) paint();
      },
      update: function (s2) { s2 = s2 || {}; if (s2.usual != null) cur.usual = s2.usual; if (s2.unit) cur.unit = s2.unit; if (s2.steps) { cur.n = s2.steps; if (!cur.k) cur.k = 1; } if (shown) paint(); },
      stop: function () {
        if (wait) clearTimeout(wait); if (tick) clearInterval(tick);
        wait = tick = null;
        var was = shown; shown = false; el.hidden = true; txt.textContent = ""; sr.textContent = "";
        if (was && LX.emit) LX.emit("layout");
      },
      running: function () { return !!wait || shown; },
      shown: function () { return shown; }
    };
    return api;
  };
  // a small live status line: "Loading the solver...", "Solving...", "Optimal · 12 ms"; the progress line below it
  // appears when a solve runs past two seconds (set(x, { usual, steps, unit }) passes the page's expected time and steps)
  LX.SolverStatus = function (host) {
    var el = H("p", { class: "lx-solver-status", role: "status", "aria-live": "polite" }, host);
    var prog = null;
    function pg() { if (!prog) prog = LX.SolveProgress(host); return prog; }
    return { el: el, set: function (x, po) {
      var st = typeof x === "string" ? x : x && x.status;
      el.setAttribute("data-status", st || "");
      if (st === "loading") el.textContent = "Loading the solver (about 3.5 MB, once)…";
      else if (st === "solving") el.textContent = "Solving…";
      else if (x && typeof x === "object") el.textContent = (SAY[st] || st) + (x.ms && x.ms.roundTrip ? " · " + Math.max(1, Math.round(x.ms.roundTrip)) + " ms" : "");
      else el.textContent = "";
      if ((st === "loading" || st === "solving") && !(po && po.progress === false)) { if (prog && prog.running()) { if (po) prog.update(po); } else pg().start(po); }
      else if (prog) prog.stop();
    },
      step: function (k, n) { if (prog && prog.running()) prog.step(k, n); },
      done: function () { if (prog) prog.stop(); },
      progress: function () { return pg(); } };
  };
})();
