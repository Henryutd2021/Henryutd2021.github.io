// k08-git-notebooks.js — Toolbox K8, "Git and reproducible notebooks" (step cards, Learn W2, 2026-11-03).
//
// Just-in-time skills for B2 (the first notebook), M1 (a notebook that asserts the browser's prices) and R5 (verification).
// Everything is simulated in the browser: no repository is created and nothing is fetched. Commands are shown
// as text, and a small state machine plays what each one does to the working folder, the staging area and the history.
//
// The project is a tiny model of Prairie Town's day (3 September 2025, cut and scaled exactly as in lesson 0 and K7, from
// town.json and town_year.json): gas MW each hour = demand − wind − solar − the 100 MW plant that runs flat all day; the
// day's gas is 1,965 MWh and at $40/MWh it costs $78,600 (K7's numbers). run(files) reads the project's own files (the
// CSV, params.yml and the gas_mw line of model.py, parsed by a tiny expression evaluator) and returns the result and the
// energy-balance check of check.py. A teammate's commit 4 "tidies" the gas line into −(wind − solar), which adds the
// solar instead of subtracting it: 2 × 1,411 = 2,822 MWh too much gas, and the balance check fails by that amount.
//
// Pure model (exported for Node, no DOM): townDay; the project's files and history (story()); the Git state machine
// (newRepo, edit, add, commit, restore, switchCreate, switchTo, detach, merge, revert, pull, cloneRepo, status, log,
// diffLines and the text each command prints); bisect() and maxChecks(); step 7's notebook (nbNew, nbRun, nbEdit,
// nbRestartRunAll); the shared project of steps 8 and 9 (shareFiles, shareRepo, finalRepo: step 8's five fixes applied to
// the files one by one), its notebook file day.ipynb (valid nbformat 4 JSON, notebookJSON) and what
// `pip install -r requirements.txt` and `jupyter nbconvert --to notebook --execute day.ipynb` do with it (installFrom,
// nbExecute: a small kernel that runs the notebook's own cells, top to bottom, including cell 6's balance assert); the
// practice drill's items (seeded by the shared LX.Drill, components/drill.js, which also draws the drill; its number box
// is LX.NumAnswer); staticFallback() for the page's no-JS blocks.
// Commit ids are 7-hex fingerprints this page computes (FNV-1a of parents, message and files), not Git's SHA-1 ids.
// Every number on the page is checked by node _tests/learn/test_k08-git-notebooks.js, which also writes the no-JS
// blocks (--write).
(function () {
  "use strict";
  var DR = (typeof window !== "undefined" && window.LX && window.LX.Drill) || require("./components/drill.js");

  // ---------------------------------------------------------------- the real day, scaled as in lesson 0 (and K4, K7)
  function townDay(town, year, key) {
    var sc = town.scenarios[key || "lesson0"], f = town.fleet;
    var t0 = Date.parse(year.start_utc + "Z"), d0 = Date.parse(sc.date + "T00:00:00Z");
    var i = Math.round((d0 - t0) / 3600000) + 1 - (sc.utcOffsetHours || 0);
    var cut = function (a) { return a.slice(i, i + 24); };
    var wind = cut(year.wind).map(function (v) { return Math.round(v / 1000 * f.wind.mw); });
    var solar = cut(year.solar).map(function (v) { return Math.round(v / 1000 * f.solar.mw); });
    var raw = cut(year.demand).map(function (v) { return v / 1000 * sc.demandPeakMW; });
    var need = raw.map(function (v, t) { return Math.round((v - f.nuclear.mw - wind[t] - solar[t]) / sc.step) * sc.step; });
    var demand = need.map(function (n, t) { return n + f.nuclear.mw + wind[t] + solar[t]; });
    return { date: sc.date, dateLabel: sc.dateLabel, flat: f.nuclear.mw, demand: demand, wind: wind, solar: solar, need: need, meta: year.meta };
  }

  function copy(o) { return JSON.parse(JSON.stringify(o)); }
  function int(v) { return Math.round(v).toLocaleString("en-US"); }
  function usd(v) { return "$" + int(v); }
  function sum(a) { return a.reduce(function (x, y) { return x + y; }, 0); }
  // a commit id: FNV-1a (32 bit) of the parents, the message and the files, as 7 hex digits
  function fp(s) {
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return ("0000000" + h.toString(16)).slice(-7);
  }

  // ---------------------------------------------------------------- the project's files
  var GAS_COST = 40, HIGH = 55;
  function csv(D) {
    var L = ["hour,demand_mw,wind_mw,solar_mw"];
    for (var t = 0; t < 24; t++) L.push([t, D.demand[t], D.wind[t], D.solar[t]].join(","));
    return L.join("\n");
  }
  function params(cost) { return "flat_mw: 100      # the plant that runs flat all day, MW\ngas_cost: " + cost + "      # running cost of gas, $/MWh"; }
  var GOOD1 = "gas_mw = day.demand_mw - day.wind_mw - day.solar_mw - flat_mw";
  var GOOD3 = 'gas_mw = day.demand_mw - day.wind_mw - day.solar_mw - p["flat_mw"]';
  var BUG = 'gas_mw = day.demand_mw - (day.wind_mw - day.solar_mw) - p["flat_mw"]';
  function model1() {
    return ["import pandas as pd", "flat_mw = 100      # the plant that runs flat all day, MW", "gas_cost = 40      # $/MWh",
            'day = pd.read_csv("data/town_day.csv")', GOOD1, "gas_mwh = gas_mw.sum() * 1      # each row lasts 1 h",
            'print(gas_mwh, "MWh of gas, $", gas_mwh * gas_cost)'].join("\n");
  }
  function model3(line) {
    return ["import pandas as pd", "import yaml", 'p = yaml.safe_load(open("params.yml"))', 'day = pd.read_csv("data/town_day.csv")',
            line || GOOD3, "gas_mwh = gas_mw.sum() * 1      # each row lasts 1 h", 'print(gas_mwh, "MWh of gas, $", gas_mwh * p["gas_cost"])'].join("\n");
  }
  var CHECK1 = ["from model import day, gas_mwh, flat_mw", "supply = 24 * flat_mw + day.wind_mw.sum() + day.solar_mw.sum() + gas_mwh",
                'assert day.demand_mw.sum() == supply, "energy balance is off"', 'print("balance OK")'].join("\n");
  var CHECK3 = ["from model import day, gas_mwh, p", 'supply = 24 * p["flat_mw"] + day.wind_mw.sum() + day.solar_mw.sum() + gas_mwh',
                'assert day.demand_mw.sum() == supply, "energy balance is off"', 'print("balance OK")'].join("\n");
  function readme(R, v) {
    var L = ["# Prairie Town's gas day", "Run: python model.py, then python check.py", "Data: data/town_day.csv, the town's 3 September 2025",
             "Expected: " + R.gasMWh + " MWh of gas, " + usd(R.cost) + " a day"];
    if (v >= 2) L.splice(2, 0, "Chart: python plot.py (writes gas_day.png)");
    if (v >= 3) L.splice(1, 0, "Install: pip install -r requirements.txt");
    return L.join("\n");
  }
  var PLOT = ["import matplotlib.pyplot as plt", "from model import day, gas_mw", 'plt.step(day.hour, gas_mw, where="post")',
              'plt.ylabel("Gas, MW")', 'plt.savefig("gas_day.png")'].join("\n");
  // requirements.txt before and after step 8's first fix. The pins are illustrative (the page says so wherever they show):
  // they show what an exact pin looks like. nbconvert runs a notebook without a browser; ipykernel is its Python kernel.
  var REQS_LOOSE = "pandas\npyyaml\nmatplotlib\nnbconvert\nipykernel";
  var REQS = "pandas==2.2.3\npyyaml==6.0.2\nmatplotlib==3.9.2\nnbconvert==7.16.4\nipykernel==6.29.5";
  var MODULE = { pandas: "pandas", pyyaml: "yaml", matplotlib: "matplotlib", nbconvert: "nbconvert", ipykernel: "ipykernel" };   // pip name -> import name
  var IGNORE = ".env\ndata/raw/\n*.png";
  var ENV = "EIA_API_KEY=(your own key, never committed)", RAW = "data/raw/EIA930_BALANCE_2025.csv";

  // ---------------------------------------------------------------- running the project: what model.py and check.py print
  // tokens of the right-hand side of the gas_mw line: day.<column>, p["<key>"], a name, a number, + − ( )
  function evalLine(rhs, env) {
    var tk = [], rx = /\s*(day\.\w+|p\["\w+"\]|[A-Za-z_]\w*|\d+(?:\.\d+)?|[-+()])/g, m, k = 0;
    while ((m = rx.exec(rhs)) && m[0].length) tk.push(m[1]);
    function bin(a, b, s) {
      var A = Array.isArray(a), B = Array.isArray(b);
      if (!A && !B) return a + s * b;
      var n = A ? a.length : b.length, out = [];
      for (var i = 0; i < n; i++) out.push((A ? a[i] : a) + s * (B ? b[i] : b));
      return out;
    }
    function atom() {
      var t = tk[k++];
      if (t === "(") { var v = expr(); if (tk[k++] !== ")") throw new Error("missing )"); return v; }
      if (t === "-") return bin(0, atom(), -1);
      if (/^\d/.test(t)) return +t;
      if (/^day\./.test(t)) { var c = env.day[t.slice(4)]; if (!c) throw new Error("KeyError: " + t.slice(4)); return c; }
      var pm = /^p\["(\w+)"\]$/.exec(t);
      if (pm) { if (!env.p || env.p[pm[1]] == null) throw new Error("KeyError: " + pm[1]); return env.p[pm[1]]; }
      if (env.consts[t] == null) throw new Error("NameError: name '" + t + "' is not defined");
      return env.consts[t];
    }
    function expr() {
      var v = atom();
      while (tk[k] === "+" || tk[k] === "-") { var s = tk[k++] === "+" ? 1 : -1; v = bin(v, atom(), s); }
      return v;
    }
    var v = expr();
    if (k !== tk.length) throw new Error("SyntaxError");
    return v;
  }
  function readCSV(text) {
    var L = text.split("\n"), head = L[0].split(","), day = {};
    head.forEach(function (h) { day[h] = []; });
    L.slice(1).forEach(function (row) { row.split(",").forEach(function (v, j) { day[head[j]].push(+v); }); });
    return day;
  }
  function readYml(text) {
    var p = {};
    (text || "").split("\n").forEach(function (l) { var m = /^(\w+):\s*(-?[\d.]+)/.exec(l); if (m) p[m[1]] = +m[2]; });
    return p;
  }
  function run(files) {
    try {
      var day = readCSV(files["data/town_day.csv"]), code = files["model.py"], consts = {}, p = files["params.yml"] ? readYml(files["params.yml"]) : null;
      code.split("\n").forEach(function (l) { var m = /^(\w+) = (-?\d+(?:\.\d+)?)\b/.exec(l); if (m) consts[m[1]] = +m[2]; });
      var line = code.split("\n").filter(function (l) { return /^gas_mw = /.test(l); })[0];
      var gas = evalLine(line.slice("gas_mw = ".length), { day: day, p: p, consts: consts });
      var usesP = /p\["gas_cost"\]/.test(code), cost = usesP ? p.gas_cost : consts.gas_cost;
      var flat = /p\["flat_mw"\]/.test(code) ? p.flat_mw : consts.flat_mw;
      var R = { gasMWh: sum(gas) * 1, gasCost: cost, flat: flat, demandMWh: sum(day.demand_mw), windMWh: sum(day.wind_mw), solarMWh: sum(day.solar_mw),
                peak: Math.max.apply(null, gas), line: line };
      R.cost = R.gasMWh * cost;
      R.balance = R.demandMWh - 24 * flat - R.windMWh - R.solarMWh - R.gasMWh;   // what check.py asserts is 0
      R.ok = R.balance === 0;
      return R;
    } catch (e) { return { error: e.message }; }
  }
  function runText(R) {   // what `python model.py` then `python check.py` print
    if (R.error) return [R.error];
    return [R.gasMWh + " MWh of gas, $ " + R.cost, R.ok ? "balance OK" : "AssertionError: energy balance is off (by " + int(Math.abs(R.balance)) + " MWh)"];
  }

  // ---------------------------------------------------------------- the Git state machine (pure; every call returns a new repo)
  // repo: commits {id: {id, parents, msg, tree, n}}, branches {name: id}, head {branch} or {detached: id},
  //       index {path: text} (the staging area, as Git keeps it: a full copy of the next snapshot), work {path: text}
  function commitId(parents, msg, tree) {
    return fp(parents.join(",") + "\n" + msg + "\n" + Object.keys(tree).sort().map(function (k) { return k + "\n" + tree[k]; }).join("\n"));
  }
  function newRepo(tree, msg) {
    var id = commitId([], msg, tree), r = { commits: {}, branches: { main: id }, head: { branch: "main" }, index: copy(tree), work: copy(tree), seq: 1 };
    r.commits[id] = { id: id, parents: [], msg: msg, tree: copy(tree), n: 1 };
    return r;
  }
  function headId(r) { return r.head.branch ? r.branches[r.head.branch] : r.head.detached; }
  function treeOf(r, id) { return r.commits[id || headId(r)].tree; }
  function ignored(r, path) {
    var g = r.work[".gitignore"];
    if (g == null) return false;
    return g.split("\n").some(function (p) {
      p = p.trim(); if (!p) return false;
      if (p.slice(-1) === "/") return path.indexOf(p) === 0;
      if (p.indexOf("*.") === 0) return path.slice(-(p.length - 1)) === p.slice(1);
      return path === p;
    });
  }
  function keys() { var s = {}; for (var i = 0; i < arguments.length; i++) Object.keys(arguments[i]).forEach(function (k) { s[k] = 1; }); return Object.keys(s).sort(); }
  function status(r) {
    var T = treeOf(r), st = { staged: [], modified: [], untracked: [], ignored: [] };
    keys(T, r.index).forEach(function (k) { if (T[k] !== r.index[k]) st.staged.push(k); });
    keys(r.index, r.work).forEach(function (k) {
      if (r.index[k] == null) { (ignored(r, k) ? st.ignored : st.untracked).push(k); return; }
      if (r.work[k] !== r.index[k]) st.modified.push(k);
    });
    st.clean = !st.staged.length && !st.modified.length;
    return st;
  }
  // a working-folder file's label: staged and committed are different places, so they get different words
  function fileState(st, k) {
    var stg = st.staged.indexOf(k) >= 0, mod = st.modified.indexOf(k) >= 0;
    if (st.untracked.indexOf(k) >= 0) return "new, untracked";
    if (st.ignored.indexOf(k) >= 0) return "ignored";
    if (stg && mod) return "edited after staging";
    if (stg) return "staged, not committed";
    if (mod) return "edited";
    return "matches the last commit";
  }
  function kind(a, b) { return a == null ? "new file" : b == null ? "deleted" : "modified"; }
  function statusText(r) {
    var st = status(r), T = treeOf(r), L = [r.head.branch ? "On branch " + r.head.branch : "HEAD detached at " + r.head.detached];
    if (st.staged.length) { L.push("Changes to be committed:"); st.staged.forEach(function (k) { L.push("  " + kind(T[k], r.index[k]) + ":   " + k); }); }
    if (st.modified.length) { L.push("Changes not staged for commit:"); st.modified.forEach(function (k) { L.push("  " + kind(r.index[k], r.work[k]) + ":   " + k); }); }
    if (st.untracked.length) { L.push("Untracked files:"); st.untracked.forEach(function (k) { L.push("  " + k); }); }
    if (st.clean && !st.untracked.length) L.push("nothing to commit, working tree clean");
    return L;
  }
  function edit(r, path, text) { r = copy(r); if (text == null) delete r.work[path]; else r.work[path] = text; return r; }
  function add(r, path) {
    r = copy(r);
    var ps = path === "." ? keys(r.work, r.index).filter(function (k) { return !ignored(r, k) || r.index[k] != null; }) : [path];
    ps.forEach(function (k) { if (r.work[k] == null) delete r.index[k]; else r.index[k] = r.work[k]; });
    return r;
  }
  function commit(r, msg) {
    if (!status(r).staged.length) return { repo: r, err: "nothing added to commit" };
    r = copy(r);
    var par = headId(r), id = commitId([par], msg, r.index);
    r.seq++; r.commits[id] = { id: id, parents: [par], msg: msg, tree: copy(r.index), n: r.seq };
    if (r.head.branch) r.branches[r.head.branch] = id; else r.head.detached = id;
    return { repo: r, id: id };
  }
  function restore(r, path) { r = copy(r); if (r.index[path] == null) delete r.work[path]; else r.work[path] = r.index[path]; return r; }
  function restoreStaged(r, path) { r = copy(r); var T = treeOf(r); if (T[path] == null) delete r.index[path]; else r.index[path] = T[path]; return r; }
  function switchCreate(r, name) {   // a new branch at the same commit: uncommitted changes come along untouched
    if (r.branches[name]) return { repo: r, err: "a branch named '" + name + "' already exists" };
    r = copy(r); r.branches[name] = headId(r); r.head = { branch: name };
    return { repo: r };
  }
  function moveTo(r, id, head) {
    // this page asks for a clean folder before moving to another commit (Git itself carries changes along when they do
    // not clash); untracked and ignored files stay where they are, as in Git
    if (!status(r).clean) return { repo: r, err: "commit or restore your changes first" };
    r = copy(r);
    var old = treeOf(r), T = r.commits[id].tree;
    Object.keys(old).forEach(function (k) { delete r.work[k]; });
    Object.keys(T).forEach(function (k) { r.work[k] = T[k]; });
    r.index = copy(T); r.head = head;
    return { repo: r };
  }
  function switchTo(r, name) { if (!r.branches[name]) return { repo: r, err: "invalid reference: " + name }; return moveTo(r, r.branches[name], { branch: name }); }
  function detach(r, id) { if (!r.commits[id]) return { repo: r, err: "invalid reference: " + id }; return moveTo(r, id, { detached: id }); }
  function ancestors(r, id) { var seen = {}, q = [id]; while (q.length) { var c = q.shift(); if (seen[c]) continue; seen[c] = 1; q = q.concat(r.commits[c].parents); } return seen; }
  function isAncestor(r, a, b) { return !!ancestors(r, b)[a]; }   // a is reachable from b
  function mergeBase(r, a, b) {
    var A = ancestors(r, a), best = null;
    Object.keys(ancestors(r, b)).forEach(function (c) { if (A[c] && (!best || r.commits[c].n > r.commits[best].n)) best = c; });
    return best;
  }
  function merge(r, name) {
    var h = headId(r), t = r.branches[name];
    if (!t) return { repo: r, err: "invalid reference: " + name };
    if (!status(r).clean) return { repo: r, err: "commit or restore your changes first" };
    if (isAncestor(r, t, h)) return { repo: r, note: "Already up to date." };
    if (isAncestor(r, h, t)) {   // fast-forward: the branch label moves up to the other branch's commit
      var f = moveTo(r, t, r.head.branch ? { branch: r.head.branch } : { detached: t }).repo;
      if (f.head.branch) f.branches[f.head.branch] = t;
      return { repo: f, note: "Fast-forward", ff: true };
    }
    var O = treeOf(r, mergeBase(r, h, t)), A = treeOf(r, h), B = treeOf(r, t), M = {}, clash = [];
    keys(O, A, B).forEach(function (k) {
      var a = A[k], b = B[k], o = O[k];
      if (a === b) { if (a != null) M[k] = a; } else if (a === o) { if (b != null) M[k] = b; } else if (b === o) { if (a != null) M[k] = a; } else clash.push(k);
    });
    if (clash.length) return { repo: r, err: "merge conflict in " + clash.join(", "), conflicts: clash };
    r = copy(r);
    var msg = "Merge branch '" + name + "'", id = commitId([h, t], msg, M);
    r.seq++; r.commits[id] = { id: id, parents: [h, t], msg: msg, tree: M, n: r.seq };
    if (r.head.branch) r.branches[r.head.branch] = id; else r.head.detached = id;
    r.index = copy(M); Object.keys(A).forEach(function (k) { delete r.work[k]; }); Object.keys(M).forEach(function (k) { r.work[k] = M[k]; });
    return { repo: r, id: id };
  }
  function revert(r, id) {   // a new commit that undoes commit id's changes (files it changed must not have moved since)
    if (!status(r).clean) return { repo: r, err: "commit or restore your changes first" };
    var C = r.commits[id], P = treeOf(r, C.parents[0]), T = copy(treeOf(r)), bad = [];
    keys(P, C.tree).forEach(function (k) { if (P[k] === C.tree[k]) return; if (T[k] !== C.tree[k]) bad.push(k); else if (P[k] == null) delete T[k]; else T[k] = P[k]; });
    if (bad.length) return { repo: r, err: "could not revert: " + bad.join(", ") + " changed since" };
    var s = copy(r);
    Object.keys(treeOf(r)).forEach(function (k) { delete s.work[k]; });
    Object.keys(T).forEach(function (k) { s.work[k] = T[k]; });
    s.index = copy(T);
    return commit(s, 'Revert "' + C.msg + '"');
  }
  function pull(r, other, branch) {   // bring another copy's commits; fast-forward this branch when it has not moved
    branch = branch || "main";
    var t = other.branches[branch];
    r = copy(r); Object.keys(other.commits).forEach(function (k) { if (!r.commits[k]) r.commits[k] = copy(other.commits[k]); });
    r.seq = Math.max(r.seq, other.seq);
    if (!isAncestor(r, r.branches[branch], t)) return { repo: r, err: "diverged: merge needed" };
    if (r.head.branch === branch) { var s = moveTo(r, t, { branch: branch }); if (s.err) return s; r = s.repo; }
    r.branches[branch] = t;
    return { repo: r, ff: true };
  }
  function cloneRepo(r) {   // a fresh copy: the history and branches, files as committed on main; nothing untracked or ignored
    var c = { commits: copy(r.commits), branches: copy(r.branches), head: { branch: "main" }, seq: r.seq };
    c.index = copy(c.commits[c.branches.main].tree); c.work = copy(c.index);
    return c;
  }
  function log(r, from) {   // first-parent history, newest first
    var out = [], id = from || headId(r);
    while (id) { out.push(r.commits[id]); id = r.commits[id].parents[0]; }
    return out;
  }
  function logText(r) {
    var labels = {};
    Object.keys(r.branches).forEach(function (b) { (labels[r.branches[b]] = labels[r.branches[b]] || []).push(b); });
    return log(r).map(function (c) {
      var L = (labels[c.id] || []).slice().sort(function (a, b) { return a === r.head.branch ? -1 : b === r.head.branch ? 1 : a < b ? -1 : 1; });
      var dec = L.map(function (b) { return b === r.head.branch ? "HEAD -> " + b : b; });
      if (r.head.detached === c.id) dec.unshift("HEAD");
      return c.id + (dec.length ? " (" + dec.join(", ") + ")" : "") + " " + c.msg;
    });
  }
  // line diff by longest common subsequence: [{t: " " | "-" | "+", s: line}]
  function diffLines(a, b) {
    var A = a == null ? [] : a.split("\n"), B = b == null ? [] : b.split("\n"), n = A.length, m = B.length, L = [];
    for (var i = 0; i <= n; i++) { L.push([]); for (var j = 0; j <= m; j++) L[i].push(0); }
    for (i = n - 1; i >= 0; i--) for (j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    var out = []; i = 0; j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && A[i] === B[j]) { out.push({ t: " ", s: A[i] }); i++; j++; }
      else if (i < n && (j === m || L[i + 1][j] >= L[i][j + 1])) { out.push({ t: "-", s: A[i] }); i++; }
      else { out.push({ t: "+", s: B[j] }); j++; }
    }
    return out;
  }
  // `git diff` text between two snapshots: changed files, each with one line of context around its changes
  function diffText(T0, T1) {
    var out = [];
    keys(T0, T1).forEach(function (k) {
      if (T0[k] === T1[k]) return;
      var d = diffLines(T0[k], T1[k]);
      out.push({ t: "h", s: "--- a/" + k }); out.push({ t: "h", s: "+++ b/" + k });
      d.forEach(function (x, i) {
        var near = x.t !== " " || (d[i - 1] && d[i - 1].t !== " ") || (d[i + 1] && d[i + 1].t !== " ");
        if (near) out.push(x);
      });
    });
    return out;
  }

  // ---------------------------------------------------------------- the story: the project's history, step by step
  var MSG = {
    c1: "Add Prairie Town's day and the gas model", c2: "Add a README: how to run, expected numbers",
    c3: "Read the gas cost and flat output from params.yml", c4: "Tidy the model: net demand in one line",
    c5: "Add a chart of the gas hours", c6: "README: how to make the chart",
    c8: "Pin versions, ignore secrets and raw data, add the notebook"
  };
  var COMMIT_MSGS = [
    { m: "Raise the gas cost to $55/MWh for a high-price case", ok: true },
    { m: "update", ok: false, why: "Git accepts it, but in six months “update” says nothing. Pick the message that says what changed and why." },
    { m: "params", ok: false, why: "This names the file, which the commit already shows. Say what changed and why." }];
  function story(D) {
    var T1 = { "data/town_day.csv": csv(D), "model.py": model1(), "check.py": CHECK1 };
    var R1 = run(T1);
    var r = newRepo(T1, MSG.c1), ids = { c1: headId(r) };
    r = add(edit(r, "README.md", readme(R1, 1)), "README.md"); r = commit(r, MSG.c2).repo; ids.c2 = headId(r);
    r = edit(edit(edit(r, "params.yml", params(GAS_COST)), "model.py", model3()), "check.py", CHECK3);
    r = commit(add(r, "."), MSG.c3).repo; ids.c3 = headId(r);
    var base = r;
    // the teammate's three commits, made on their own copy
    var t = cloneRepo(base);
    t = commit(add(edit(t, "model.py", model3(BUG)), "model.py"), MSG.c4).repo; ids.c4 = headId(t);
    t = commit(add(edit(t, "plot.py", PLOT), "plot.py"), MSG.c5).repo; ids.c5 = headId(t);
    t = commit(add(edit(t, "README.md", readme(R1, 2)), "README.md"), MSG.c6).repo; ids.c6 = headId(t);
    var hist = ["c1", "c2", "c3", "c4", "c5", "c6"].map(function (k, i) { var R = run(t.commits[ids[k]].tree); return { key: k, n: i + 1, id: ids[k], msg: MSG[k], R: R, ok: R.ok }; });
    return { D: D, base: base, team: t, ids: ids, hist: hist, R1: R1, Rhigh: run(edit(base, "params.yml", params(HIGH)).work) };
  }
  // the repository at the start of each step card (k = 0 .. 8), replaying the earlier cards' actions;
  // msg: the commit message the reader chose in step 3 (any of COMMIT_MSGS; the good one by default)
  function stepStart(S, k, msg) {
    var r = S.base;
    if (k <= 1) return r;
    r = edit(r, "params.yml", params(HIGH));
    if (k === 2) return r;
    r = commit(add(switchCreate(r, "high-gas").repo, "params.yml"), msg || COMMIT_MSGS[0].m).repo;
    if (k === 3) return r;
    r = pull(switchTo(r, "main").repo, S.team).repo;
    if (k === 4) return r;
    r = revert(r, S.ids.c4).repo;
    return r;
  }
  // the shared project of steps 8 and 9: after step 5's revert, the notebook day.ipynb, requirements.txt and a README that
  // says how to run it, with step 8's fixes applied to the files one by one (fixed: {pin, path, data, seed, secret}, each
  // true or false). A .env with an API key and a raw download sit in the folder, untracked.
  function dataLine(D, fixed) {
    if (!fixed) return "Raw data: downloaded from EIA";
    var M = D.meta || {}, F = M.files || [], a = /^(\d{4})-(\d\d)-(\d\d)$/.exec(M.accessed || "");
    var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return "Raw data: EIA-930 BALANCE files, SWPP, 2025, downloaded " + (a ? +a[3] + " " + MON[+a[2] - 1] + " " + a[1] : "(date)") +
      ", SHA-256 " + F.map(function (f) { return f.sha256.slice(0, 8) + "…"; }).join(" and ");
  }
  function shareFiles(S, msg, fixed) {
    fixed = fixed || {};
    var r = stepStart(S, 5, msg), R = run(r.work);
    r = edit(r, "requirements.txt", fixed.pin ? REQS : REQS_LOOSE);
    r = edit(r, "day.ipynb", notebookJSON(shareCells(fixed)));
    var L = readme(R, 3).split("\n"), iRun = L.findIndex(function (l) { return /^Run: /.test(l); });
    L.splice(iRun + 1, 0, "Notebook: jupyter nbconvert --to notebook --execute day.ipynb");
    L.splice(L.findIndex(function (l) { return /^Data: /.test(l); }) + 1, 0, dataLine(S.D, fixed.data));
    r = edit(r, "README.md", L.join("\n"));
    if (fixed.secret) r = edit(r, ".gitignore", IGNORE);
    return edit(edit(r, ".env", ENV), RAW, "(a large raw download)");
  }
  // `git add .` and a commit: with the .gitignore in place, .env and the raw data stay untracked; without it they go in
  function shareRepo(S, msg, fixed) { return commit(add(shareFiles(S, msg, fixed), "."), MSG.c8).repo; }
  function allFixed() { var f = {}; FIXES.forEach(function (x) { f[x.key] = true; }); return f; }
  function finalRepo(S, msg, fixed) { return shareRepo(S, msg, fixed || allFixed()); }

  // ---------------------------------------------------------------- finding the first bad commit by halving
  // ids oldest first; ids[0] is known good and the last is known bad; isBad(id) runs the check
  function bisect(ids, isBad) {
    var lo = 0, hi = ids.length - 1, checks = [];
    while (hi - lo > 1) {
      var mid = Math.floor((lo + hi) / 2), bad = isBad(ids[mid]);
      checks.push({ i: mid, id: ids[mid], bad: bad });
      if (bad) hi = mid; else lo = mid;
    }
    return { first: hi, id: ids[hi], checks: checks };
  }
  // the most checks halving needs when commit 1 is good and commit n is bad (n − 1 suspects)
  function maxChecks(n) { var k = 0; while (Math.pow(2, k) < n - 1) k++; return k; }

  // ---------------------------------------------------------------- the notebook: four cells and a kernel's memory (step 7)
  // Step 7's notebook is the project's day.ipynb as it runs on your laptop: cell 1 still reads a file on your Desktop
  // (step 8 fixes that). Its cells 1 to 4 are run here by a model of the kernel's memory.
  var PATH_LAPTOP = "/Users/me/Desktop/town_day.csv", PATH_PROJECT = "data/town_day.csv";
  var CELLS = [
    'import pandas as pd\nday = pd.read_csv("{path}")',
    "gas_cost = {v}      # $/MWh",
    "gas_mwh = (day.demand_mw - day.wind_mw - day.solar_mw - 100).sum()   # MWh from gas; 100 MW runs flat",
    "gas_mwh * gas_cost"];
  function nbNew() { return { v: GAS_COST, mem: {}, count: 0, cells: [{}, {}, {}, {}], log: [] }; }
  function nbSrc(nb, i) { return CELLS[i].replace("{v}", nb.v).replace("{path}", PATH_LAPTOP); }
  function nbEdit(nb, v) { nb = copy(nb); nb.v = v; nb.log.push("edit:" + v); return nb; }
  function nbRun(nb, D, i) {
    nb = copy(nb); nb.count++;
    var c = nb.cells[i], m = nb.mem;
    c.n = nb.count; c.out = null; c.err = null;
    if (i === 0) m.day = true;
    else if (i === 1) m.gas_cost = nb.v;
    else if (i === 2) { if (!m.day) c.err = "NameError: name 'day' is not defined"; else m.gas_mwh = sum(D.need); }
    else {
      if (m.gas_mwh == null) c.err = "NameError: name 'gas_mwh' is not defined";
      else if (m.gas_cost == null) c.err = "NameError: name 'gas_cost' is not defined";
      else { c.out = m.gas_mwh * m.gas_cost; c.used = m.gas_cost; }
    }
    nb.log.push("run:" + (i + 1));
    return nb;
  }
  function nbRestartRunAll(nb, D) {
    var r = copy(nb); r.mem = {}; r.count = 0; r.cells = [{}, {}, {}, {}]; r.log.push("restart");
    for (var i = 0; i < 4; i++) r = nbRun(r, D, i);
    r.clean = true;
    return r;
  }
  function nbClean(nb, D) { return sum(D.need) * nb.v; }   // what a fresh top-to-bottom run of the cells as written gives
  // cell 4 shows a number the cells as written would not give (memory older than the code)
  function nbStale(nb, D) { var c = nb.cells[3]; return c.out != null && c.out !== nbClean(nb, D); }

  // ---------------------------------------------------------------- the shared notebook file and a clean execution (steps 8, 9)
  // day.ipynb as shared: step 7's four cells (gas cost $40), a test draw of six hours (cell 5) and the balance check
  // (cell 6, the same assert as check.py). Step 8's path and seed fixes change cells 1 and 5.
  var CELL5 = { laptop: "test = day.sample(6)   # six hours to spot-check", fixed: "test = day.sample(6, random_state=1)   # six hours to spot-check" };
  var CELL6 = 'supply = 24 * 100 + day.wind_mw.sum() + day.solar_mw.sum() + gas_mwh\nassert day.demand_mw.sum() == supply, "energy balance is off"\nprint("balance OK")';
  function shareCells(fixed) {
    fixed = fixed || {};
    return [CELLS[0].replace("{path}", fixed.path ? PATH_PROJECT : PATH_LAPTOP), CELLS[1].replace("{v}", GAS_COST), CELLS[2], CELLS[3],
            fixed.seed ? CELL5.fixed : CELL5.laptop, CELL6];
  }
  // a valid notebook file (nbformat 4): code cells with their source lines, no outputs yet, a Python 3 kernel
  function notebookJSON(cells) {
    return JSON.stringify({
      cells: cells.map(function (src) {
        var L = src.split("\n");
        return { cell_type: "code", execution_count: null, metadata: {}, outputs: [], source: L.map(function (l, i) { return i < L.length - 1 ? l + "\n" : l; }) };
      }),
      metadata: { kernelspec: { display_name: "Python 3", language: "python", name: "python3" }, language_info: { name: "python" } },
      nbformat: 4, nbformat_minor: 4 }, null, 1);
  }
  // what `pip install -r requirements.txt` puts in a fresh environment: {import name: version or "newest"}
  function installFrom(files) {
    var out = {};
    (files["requirements.txt"] || "").split("\n").forEach(function (l) {
      var m = /^([A-Za-z0-9_.-]+)(?:==([\w.]+))?\s*$/.exec(l.trim()); if (m) out[MODULE[m[1]] || m[1]] = m[2] || "newest";
    });
    return out;
  }
  // an expression in a cell: numbers, names, day.<column>, .sum(), * + − and parentheses
  function nbEval(src, mem) {
    var tk = [], rx = /\s*(\d+(?:\.\d+)?|[A-Za-z_]\w*|\.\w+|[-+*()])/y, m, k = 0;
    src = src.trim(); rx.lastIndex = 0;
    while (rx.lastIndex < src.length) { m = rx.exec(src); if (!m) throw new Error("SyntaxError: invalid syntax"); tk.push(m[1]); }
    function bin(a, b, f) {
      var A = Array.isArray(a), B = Array.isArray(b);
      if (!A && !B) return f(a, b);
      var n = A ? a.length : b.length, o = [];
      for (var i = 0; i < n; i++) o.push(f(A ? a[i] : a, B ? b[i] : b));
      return o;
    }
    function post(v) {
      while (tk[k] && tk[k].charAt(0) === ".") {
        var a = tk[k++].slice(1);
        if (tk[k] === "(" && tk[k + 1] === ")") { k += 2; if (a !== "sum" || !Array.isArray(v)) throw new Error("AttributeError: " + a); v = sum(v); }
        else { if (!v || !v.frame || !v.frame[a]) throw new Error("AttributeError: no column '" + a + "'"); v = v.frame[a]; }
      }
      return v;
    }
    function atom() {
      var t = tk[k++];
      if (t === "(") { var v = expr(); if (tk[k++] !== ")") throw new Error("SyntaxError: missing )"); return post(v); }
      if (t === "-") return bin(0, atom(), function (a, b) { return a - b; });
      if (/^\d/.test(t)) return +t;
      if (/^[A-Za-z_]/.test(t)) { if (!Object.prototype.hasOwnProperty.call(mem, t)) throw new Error("NameError: name '" + t + "' is not defined"); return post(mem[t]); }
      throw new Error("SyntaxError: invalid syntax");
    }
    function term() { var v = atom(); while (tk[k] === "*") { k++; v = bin(v, atom(), function (a, b) { return a * b; }); } return v; }
    function expr() { var v = term(); while (tk[k] === "+" || tk[k] === "-") { var s = tk[k++] === "+" ? 1 : -1; v = bin(v, term(), function (a, b) { return a + s * b; }); } return v; }
    var v = expr();
    if (k !== tk.length) throw new Error("SyntaxError: invalid syntax");
    return v;
  }
  // `jupyter nbconvert --to notebook --execute day.ipynb` in a fresh environment: it needs nbconvert and a Python kernel
  // (ipykernel), reads the file as notebook JSON, then runs every code cell top to bottom in one new kernel and stops at
  // the first error, as nbconvert does. installed: installFrom(...); run: a number that changes the draw of an unseeded
  // sample from one run to the next. Returns {cells: [{n, out, stdout, err}], mem, ok, error, sample}.
  function nbExecute(files, installed, run) {
    var res = { cells: [], mem: {}, ok: false };
    installed = installed || {};
    if (!installed.nbconvert) { res.error = "Jupyter command `jupyter-nbconvert` not found."; return res; }
    var nb;
    try { nb = JSON.parse(files["day.ipynb"]); } catch (e) { res.error = "NotJSONError: Notebook does not appear to be JSON"; return res; }
    if (!nb || nb.nbformat !== 4 || !Array.isArray(nb.cells)) { res.error = "NotJSONError: Notebook does not appear to be JSON"; return res; }
    var ks = nb.metadata && nb.metadata.kernelspec && nb.metadata.kernelspec.name;
    if (ks !== "python3" || !installed.ipykernel) { res.error = "No such kernel named " + (ks || "python3"); return res; }
    var mem = res.mem, n = 0;
    function line(l, last, cell) {
      l = l.replace(/\s+#.*$/, "").trim(); if (!l) return;
      var m;
      if ((m = /^import (\w+)(?: as (\w+))?$/.exec(l))) { if (!installed[m[1]]) throw new Error("ModuleNotFoundError: No module named '" + m[1] + "'"); mem[m[2] || m[1]] = { module: m[1] }; return; }
      if ((m = /^(\w+) = (\w+)\.read_csv\("([^"]+)"\)$/.exec(l))) {
        if (!mem[m[2]] || mem[m[2]].module !== "pandas") throw new Error("NameError: name '" + m[2] + "' is not defined");
        if (files[m[3]] == null) throw new Error("FileNotFoundError: [Errno 2] No such file or directory: '" + m[3] + "'");
        mem[m[1]] = { frame: readCSV(files[m[3]]) }; return;
      }
      if ((m = /^(\w+) = (\w+)\.sample\((\d+)(?:, random_state=(\d+))?\)$/.exec(l))) {
        var f = mem[m[2]]; if (!f || !f.frame) throw new Error("NameError: name '" + m[2] + "' is not defined");
        var seeded = m[4] != null, r = DR.rng(seeded ? +m[4] + 1 : 1000 + (run || 0) * 7919), hrs = f.frame.hour.slice(), pickd = [];
        for (var j = 0; j < +m[3]; j++) pickd.push(hrs.splice(Math.floor(r() * hrs.length), 1)[0]);
        mem[m[1]] = { sample: pickd, seeded: seeded }; res.sample = mem[m[1]]; return;
      }
      if ((m = /^assert (.+) == (.+), "([^"]*)"$/.exec(l))) { if (nbEval(m[1], mem) !== nbEval(m[2], mem)) throw new Error("AssertionError: " + m[3]); return; }
      if ((m = /^print\("([^"]*)"\)$/.exec(l))) { cell.stdout.push(m[1]); return; }
      if ((m = /^(\w+) = (.+)$/.exec(l))) { mem[m[1]] = nbEval(m[2], mem); return; }
      var v = nbEval(l, mem); if (last) cell.out = v;
    }
    for (var i = 0; i < nb.cells.length; i++) {
      var c = nb.cells[i]; if (c.cell_type !== "code") continue;
      var src = Array.isArray(c.source) ? c.source.join("") : String(c.source || ""), L = src.split("\n"), cell = { n: ++n, out: null, stdout: [] };
      res.cells.push(cell);
      try { L.forEach(function (l, j) { line(l, j === L.length - 1, cell); }); }
      catch (e) { cell.err = e.message; res.error = "CellExecutionError in cell " + cell.n + ": " + e.message; return res; }
    }
    res.ok = true;
    return res;
  }

  // ---------------------------------------------------------------- step 8: five things that stop a stranger's rerun
  // Each fix changes the shared project's files (shareFiles): before is what the file says on your laptop, after what it
  // says once fixed. title (with glossary marks) and file show in the view; label in the no-JS table.
  var FIXES = [
    { key: "pin", title: "Exact versions", label: "exact versions (pandas==2.2.3, an illustrative version)", file: "requirements.txt (version numbers illustrative)",
      before: REQS_LOOSE, after: REQS, why: "Exact versions: a later pandas may change a default, and the numbers with it. These version numbers are illustrative, not a recommendation." },
    { key: "path", title: "A path inside the project", label: "a path inside the project", file: "day.ipynb, cell 1",
      before: 'day = pd.read_csv("' + PATH_LAPTOP + '")', after: 'day = pd.read_csv("' + PATH_PROJECT + '")', why: "A path inside the project works on every computer, not only yours." },
    { key: "data", title: "The raw data's source, download date and [[checksum|checksum]]", label: "the raw data's source, download date and checksum", file: "README.md",
      before: "Raw data: downloaded from EIA", after: null, why: "Source, date and checksum let anyone confirm they have the same files." },
    { key: "seed", title: "A fixed [[random-seed|random seed]]", label: "a fixed random seed", file: "day.ipynb, cell 5",
      before: CELL5.laptop, after: CELL5.fixed, why: "A fixed seed draws the same six hours on every run." },
    { key: "secret", title: "Ignore rules before you stage", label: ".env, data/raw/ and charts in .gitignore before anything is staged", file: ".gitignore · .env holds your [[api-key|API key]]",
      before: "(no .gitignore yet: git add . would stage .env and the raw data)", after: IGNORE,
      why: "Ignore rules keep untracked matching files out of git add, so add them before you stage. They do not remove a file already committed." }];

  function fixAfter(S, f) { return f.key === "data" ? dataLine(S.D, true) : f.after; }   // the README's line comes from the data's own metadata

  // ---------------------------------------------------------------- practice drill items (seeded by LX.Drill, so tests can replay them)
  var KINDS = ["where", "next", "cost", "halve", "notebook", "repro", "order"];
  var WHERE = ["Only in the working folder", "Staged, not yet committed", "Committed in the history", "Gone: thrown away"];
  var SEQS = [["edit"], ["edit", "add"], ["edit", "add", "commit"], ["edit", "add", "edit"], ["edit", "commit"], ["edit", "add", "commit", "edit"], ["edit", "restore"], ["edit", "add", "commit", "edit", "restore"]];
  function whereOf(r0, path, ops) {   // apply the ops; where does the latest edit of path live?
    var r = r0, last = null, k = 0;
    ops.forEach(function (op) {
      if (op === "edit") { k++; last = r.work[path] + "\n# edit " + k; r = edit(r, path, last); }
      else if (op === "add") r = add(r, path);
      else if (op === "commit") r = commit(r, "Change " + path).repo;
      else if (op === "restore") r = restore(r, path);
    });
    if (r.work[path] !== last) return 3;
    if (treeOf(r)[path] === last) return 2;
    if (r.index[path] === last) return 1;
    return 0;
  }
  function opText(op, path) { return op === "edit" ? "You change " + path + " and save it." : op === "add" ? "git add " + path : op === "commit" ? 'git commit -m "Change ' + path + '"' : "git restore " + path; }
  var REPRO = [
    { q: "requirements.txt says only “pandas”. What makes a rerun install the version you used?", a: "pandas==2.2.3", w: ["pandas>=1.0", "the newest pandas", "no requirements file"],
      why: "“pandas==2.2.3”: an exact version (the number is illustrative)." },
    { q: "Which of these files should stay out of the repository?", a: ".env, which holds an API key", w: ["model.py", "requirements.txt", "README.md"] },
    { q: "A notebook reads /Users/me/Desktop/town_day.csv. What lets it run on another computer?", a: "data/town_day.csv, inside the project", w: ["a copy of the file on the Desktop", "an absolute path with C:\\", "a screenshot of the data"] },
    { q: "A cell draws six random hours as a test set. What keeps the draw the same on every run?", a: "a fixed random seed", w: ["running the cell twice", "a faster computer", "restart and run all"] },
    { q: "The agency may revise its raw data. What lets a reader check they have your file?", a: "its source, download date and checksum", w: ["its file name", "its size in rows", "the date of your commit"] },
    { q: "Before you share a notebook, what shows its outputs come from the cells as written?", a: "Restart the kernel and run all cells", w: ["Save the notebook", "Run the last cell again", "Commit it"] }];
  var ORDERS = [
    { q: "See what you changed in params.yml since the last commit, then record it.", a: ["git diff", "git add params.yml", 'git commit -m "Raise the gas cost"'] },
    { q: "Start a what-if on its own branch and record your edited params.yml there.", a: ["git switch -c high-gas", "git add params.yml", 'git commit -m "Raise the gas cost"'] },
    { q: "Look at an older version of the project, then come back.", a: ["git log --oneline", "git switch --detach 1a2b3c4", "git switch main"] },
    { q: "Rerun a shared project on a new laptop.", a: ["git clone ../prairie-day && cd prairie-day", "pip install -r requirements.txt", "jupyter nbconvert --to notebook --execute day.ipynb"] },
    { q: "Undo a bad commit that others already have.", a: ["git log --oneline", "git diff 1a2b3c4 5d6e7f8", "git revert 5d6e7f8"] }];
  function shuffle(a, r) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function drillItem(S, k, r) {
    var kind = KINDS[k % KINDS.length], pick = function (n) { return Math.floor(r() * n); };
    if (kind === "where") {
      var path = ["model.py", "params.yml", "README.md"][pick(3)], ops = SEQS[pick(SEQS.length)], w = whereOf(S.base, path, ops);
      return { kind: kind, q: "Starting from a clean folder: " + ops.map(function (o, i) { return (i + 1) + ". " + opText(o, path); }).join(" ") + " Where is your latest edit now?",
               choices: WHERE, answer: w, ops: ops, path: path,
               why: ["Saved in the working folder, but never staged.", "git add put it in the staging area; no commit has recorded it yet.", "git add then git commit recorded it in the history.", "git restore copied the staged version back over it."][w] };
    }
    if (kind === "next") {
      var files = ["model.py", "params.yml", "README.md", "check.py"], a = files[pick(4)], b = shuffle(files.filter(function (f) { return f !== a; }), r)[0];
      var x = add(edit(S.base, a, S.base.work[a] + "\n# staged edit"), a); x = edit(x, b, S.base.work[b] + "\n# unstaged edit");
      var st = status(x), ch = shuffle([a, b, a + " and " + b, "nothing"], r);
      return { kind: kind, q: "git status prints: “" + statusText(x).join(" / ") + "”. What does the next git commit record?", choices: ch, answer: ch.indexOf(a), staged: st.staged, modified: st.modified,
               why: "Only staged changes go into a commit: " + a + ". The edit to " + b + " waits in the working folder until you run git add " + b + "." };
    }
    if (kind === "cost") {
      var c = [30, 35, 45, 50, 55, 60, 65, 70][pick(8)], R = S.R1;
      return { kind: kind, q: "A commit's diff shows “- gas_cost: 40” and “+ gas_cost: " + c + "” in params.yml. The model makes " + int(R.gasMWh) + " MWh of electricity from gas. What is the day's gas cost after this commit, in $?",
               answer: R.gasMWh * c, unit: "$", why: int(R.gasMWh) + " MWh × $" + c + "/MWh = " + usd(R.gasMWh * c) + " (it was " + usd(R.cost) + ")." };
    }
    if (kind === "halve") {
      var n = 5 + pick(60), m = maxChecks(n);
      return { kind: kind, q: "Commit 1 of " + n + " passes the check; commit " + n + " fails it, and once the bug appears every later commit fails. Checking the middle commit each time, at most how many commits must you check to find the first bad one?",
               answer: m, n: n, why: n - 1 + " suspects; each check halves them: 2^" + m + " = " + Math.pow(2, m) + " ≥ " + (n - 1) + (m > 0 ? " > 2^" + (m - 1) + " = " + Math.pow(2, m - 1) : "") + ", so " + m + " checks." };
    }
    if (kind === "notebook") {
      var SC = [[0, 1, 2, "e", 3], [0, 2, 3], [1, 3], [0, "e", 1, 2, 3], [0, 1, 2, 3, "e", 1, 3], [0, 1, 2, 3, "e", 3], [0, 1, "e", 2, 3], [2, 0, 1, 3]][pick(8)];
      var nb = nbNew(), D = S.D;
      SC.forEach(function (s) { nb = s === "e" ? nbEdit(nb, HIGH) : nbRun(nb, D, s); });
      var c4 = nb.cells[3], ans = c4.err ? 2 : c4.out === sum(D.need) * GAS_COST ? 0 : 1;
      var steps = SC.map(function (s) { return s === "e" ? "edit cell 2 to gas_cost = " + HIGH : "run cell " + (s + 1); });
      return { kind: kind, q: "Fresh kernel. Cells: (1) load the day, (2) gas_cost = 40, (3) gas_mwh = … (" + int(sum(D.need)) + "), (4) gas_mwh * gas_cost. You: " + steps.join(", ") + ". What does cell 4 show?",
               choices: [String(sum(D.need) * GAS_COST), String(sum(D.need) * HIGH), "an error: a name is not defined"], answer: ans, seq: SC,
               why: c4.err ? c4.err + ": a cell it needs has not run yet." : "Memory held gas_cost = " + c4.used + " when cell 4 ran: " + int(sum(D.need)) + " × " + c4.used + " = " + c4.out + (nbStale(nb, D) ? ", although cell 2 now says " + HIGH + "." : ".") };
    }
    if (kind === "repro") {
      var it = REPRO[pick(REPRO.length)], chs = shuffle([it.a].concat(it.w), r);
      return { kind: kind, q: it.q, choices: chs, answer: chs.indexOf(it.a), why: it.why || "“" + it.a + "”." };
    }
    var o = ORDERS[pick(ORDERS.length)], right = o.a.join("  →  "), wrong = [];
    [[1, 0, 2], [2, 1, 0], [0, 2, 1], [1, 2, 0], [2, 0, 1]].forEach(function (p) { var s = p.map(function (j) { return o.a[j]; }).join("  →  "); if (s !== right && wrong.indexOf(s) < 0) wrong.push(s); });
    var cs = shuffle([right].concat(shuffle(wrong, r).slice(0, 2)), r);
    return { kind: "order", q: o.q + " Which order works?", choices: cs, answer: cs.indexOf(right), why: right + "." };
  }
  function drill(S, seed, n) { return DR.series(function (k, r) { return drillItem(S, k, r); }, seed, n); }

  // ---------------------------------------------------------------- the page's no-JS blocks (written by the test's --write mode)
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function staticFallback(S) {
    var H = S.hist, R1 = S.R1, bug = H[3].R, B = bisect(H.map(function (h) { return h.id; }), function (id) { return !run(S.team.commits[id].tree).ok; });
    var C = cloneRepo(finalRepo(S)), X = nbExecute(C.work, installFrom(C.work), 1);
    var o = '<table class="k8-static" aria-label="The steps of this page: command and what it shows">\n<thead><tr><th scope="col">Step</th><th scope="col">Command</th><th scope="col">What it shows</th></tr></thead>\n<tbody>\n';
    var rows = [
      ["1", "git log --oneline", "Three commits, newest first: " + H.slice(0, 3).reverse().map(function (h) { return h.id + " " + h.msg; }).join("; ") + "."],
      ["2", "git status, git diff", "After gas_cost 40 → " + HIGH + " in params.yml: one modified file, the line “−gas_cost: 40” and “+gas_cost: " + HIGH + "”; the day's cost goes from " + usd(R1.cost) + " to " + usd(S.Rhigh.cost) + "."],
      ["3", "git switch -c high-gas, git add params.yml, git commit -m", "A new branch, the change staged, then recorded as a commit on high-gas only."],
      ["4", "git switch main", "params.yml says 40 again and the result is " + usd(R1.cost) + "; git switch high-gas brings back " + HIGH + "."],
      ["5", "git pull, then git switch --detach &lt;id&gt; and python check.py", "A teammate's three commits arrive; the balance check fails by " + int(Math.abs(bug.balance)) + " MWh. Halving the history (once a commit fails, every later one fails too): commit " + (B.checks[0].i + 1) + " passes, commit " + (B.checks[1].i + 1) + " fails, so commit " + (B.first + 1) + " (" + B.id + ") is the first bad one, found in " + B.checks.length + " checks."],
      ["6", "git diff " + H[2].id + " " + H[3].id + ", git revert " + H[3].id, "The line became −(wind − solar): solar is added, not subtracted, so gas is " + int(bug.gasMWh) + " MWh instead of " + int(R1.gasMWh) + " (2 × " + int(R1.solarMWh) + " MWh too much). The revert commit brings back " + int(R1.gasMWh) + " MWh."],
      ["7", "a notebook: edit cell 2, run only cell 4", "Cell 4 still shows " + R1.cost + " (memory holds gas_cost = 40) under a cell that says " + HIGH + "; Restart and run all gives " + S.Rhigh.cost + "."],
      ["8", "five fixes", "Before sharing: " + FIXES.map(function (f) { return f.label; }).join("; ") + "."],
      ["9", "git clone, pip install -r requirements.txt, jupyter nbconvert --to notebook --execute day.ipynb", "The fresh copy has no .env and no raw data. Its notebook runs top to bottom: cell 3 gives " + int(X.mem.gas_mwh) + " MWh, cell 4 shows " + X.cells[3].out + " (dollars), and cell 6's balance assert prints “" + X.cells[5].stdout[0] + "”, as the README says."]];
    rows.forEach(function (x) { o += '<tr><td data-label="Step">' + x[0] + '</td><td class="k8-mono">' + x[1] + "</td><td>" + x[2] + "</td></tr>\n"; });
    o += "</tbody></table>\n";
    var h = '<table class="k8-static" aria-label="The project\'s history after the teammate\'s commits">\n<thead><tr><th scope="col">Commit</th><th scope="col">Message</th><th scope="col">Gas, MWh</th><th scope="col">Balance check</th></tr></thead>\n<tbody>\n';
    H.forEach(function (x) { h += '<tr><td class="k8-mono" data-label="Commit">' + x.n + " · " + x.id + "</td><td>" + esc(x.msg) + '</td><td data-label="Gas, MWh">' + int(x.R.gasMWh) + '</td><td data-label="Balance check">' + (x.ok ? "passes" : "fails by " + int(Math.abs(x.R.balance)) + " MWh") + "</td></tr>\n"; });
    h += "</tbody></table>\n";
    return { steps: o, history: h };
  }
  function staticDrill(S) {   // three worked items for readers without JavaScript (seed 7)
    var it = drill(S, 7, 7).filter(function (x) { return x.kind === "cost" || x.kind === "halve" || x.kind === "notebook"; });
    var o = '<ol class="k8-static-drill">\n';
    it.forEach(function (x) {
      var a = x.choices ? x.choices[x.answer] : (x.unit === "$" ? usd(x.answer) : String(x.answer));
      o += "<li><p>" + esc(x.q) + "</p><p><b>Answer: " + esc(a) + ".</b></p><p>Why: " + esc(x.why) + "</p></li>\n";
    });
    return o + "</ol>\n";
  }

  var model = { townDay: townDay, fp: fp, csv: csv, params: params, run: run, runText: runText, evalLine: evalLine, readYml: readYml,
                newRepo: newRepo, headId: headId, treeOf: treeOf, status: status, fileState: fileState, statusText: statusText, edit: edit, add: add, commit: commit,
                restore: restore, restoreStaged: restoreStaged, switchCreate: switchCreate, switchTo: switchTo, detach: detach, merge: merge,
                revert: revert, pull: pull, cloneRepo: cloneRepo, log: log, logText: logText, diffLines: diffLines, diffText: diffText,
                ignored: ignored, isAncestor: isAncestor, mergeBase: mergeBase, story: story, stepStart: stepStart, finalRepo: finalRepo,
                bisect: bisect, maxChecks: maxChecks, nbNew: nbNew, nbSrc: nbSrc, nbEdit: nbEdit, nbRun: nbRun, nbRestartRunAll: nbRestartRunAll,
                nbClean: nbClean, nbStale: nbStale, shareCells: shareCells, notebookJSON: notebookJSON, installFrom: installFrom, nbEval: nbEval,
                nbExecute: nbExecute, shareFiles: shareFiles, shareRepo: shareRepo, allFixed: allFixed, dataLine: dataLine, fixAfter: fixAfter,
                CELLS: CELLS, CELL5: CELL5, CELL6: CELL6, PATH_LAPTOP: PATH_LAPTOP, PATH_PROJECT: PATH_PROJECT, REQS_LOOSE: REQS_LOOSE, ENV: ENV, RAW: RAW, FIXES: FIXES, COMMIT_MSGS: COMMIT_MSGS, MSG: MSG, KINDS: KINDS, WHERE: WHERE, REPRO: REPRO,
                ORDERS: ORDERS, drill: drill, drillItem: drillItem, rng: DR.rng, whereOf: whereOf, staticFallback: staticFallback, staticDrill: staticDrill,
                GAS_COST: GAS_COST, HIGH: HIGH, BUG: BUG, GOOD3: GOOD3, REQS: REQS, IGNORE: IGNORE };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;

  // ================================================================ view
  var LX = window.LX, H = LX.H;

  function textAlt(host, title, items) {
    var d = H("details", { class: "lx-textalt" }, host); H("summary", { text: title }, d);
    var ul = H("ul", null, d); items.forEach(function (t) { H("li", { html: LX.rich(t) }, ul); });
    return d;
  }
  function seg(host, labels, sel, onPick, aria) {
    var g = H("div", { class: "lx-seg", role: "group", "aria-label": aria || "Choose" }, host), bs = [];
    labels.forEach(function (l, i) {
      var b = H("button", { type: "button", "aria-pressed": i === sel ? "true" : "false", text: l }, g);
      b.addEventListener("click", function () { bs.forEach(function (x, j) { x.setAttribute("aria-pressed", j === i ? "true" : "false"); }); onPick(i); });
      bs.push(b);
    });
    return { el: g, set: function (i) { bs.forEach(function (x, j) { x.setAttribute("aria-pressed", j === i ? "true" : "false"); }); } };
  }

  // ---- the Git stage: working folder, staging area, history; a terminal; the snapshot's result
  function GitStage(host, o) {
    var box = H("div", { class: "k8-git" }, host);
    var only = o.only || ["w", "s", "h"], zones = H("div", { class: "k8-zones", style: "--k8-cols:" + only.length }, box);
    var zW = zone("w", "Working folder", "your files as you edit them"), zS = zone("s", "Staging area", "picked for the next commit"),
        zH = zone("h", "History", "commits, newest first; [[git-head|HEAD]] marks the one you are on");
    function zone(k, t, s) {
      var z = H("section", { class: "k8-zone" }, only.indexOf(k) >= 0 ? zones : null); H("h4", { text: t }, z); H("p", { class: "k8-zsub", html: LX.rich(s) }, z);
      return H("ul", { class: "k8-list" }, z);
    }
    var res = H("p", { class: "k8-result", "aria-live": "polite" }, box);
    var cmds = H("div", { class: "k8-cmds", role: "group", "aria-label": "Commands" }, box);
    var term = H("div", { class: "k8-term", role: "log", "aria-live": "polite", "aria-label": "Terminal" }, box);
    function draw(r) {
      var st = status(r), T = treeOf(r);
      zW.innerHTML = ""; zS.innerHTML = ""; zH.innerHTML = "";
      Object.keys(r.work).sort().forEach(function (k) {
        var li = H("li", { class: "k8-file" + (st.modified.indexOf(k) >= 0 ? " mod" : st.ignored.indexOf(k) >= 0 ? " ign" : "") }, zW); H("span", { text: k }, li);
        H("small", { text: fileState(st, k) }, li);
      });
      if (!st.staged.length) H("li", { class: "k8-empty", text: "nothing staged" }, zS);
      st.staged.forEach(function (k) { var li = H("li", { class: "k8-file stg" }, zS); H("span", { text: k }, li); H("small", { text: kind(T[k], r.index[k]) }, li); });
      var labels = {};
      Object.keys(r.branches).forEach(function (b) { (labels[r.branches[b]] = labels[r.branches[b]] || []).push(b); });
      var shown = {};
      // every commit reachable from a branch label, newest first
      Object.keys(r.commits).map(function (k) { return r.commits[k]; }).filter(function (c) {
        return Object.keys(r.branches).some(function (b) { return isAncestor(r, c.id, r.branches[b]); }) || c.id === headId(r);
      }).sort(function (a, b) { return b.n - a.n; }).forEach(function (c) {
        if (shown[c.id]) return; shown[c.id] = 1;
        var li = H("li", { class: "k8-commit" + (c.id === headId(r) ? " head" : "") }, zH);
        H("code", { text: c.id }, li); H("span", { text: c.msg }, li);
        var tags = (labels[c.id] || []).slice();
        if (c.id === headId(r)) tags.unshift(r.head.branch ? "HEAD → " + r.head.branch : "HEAD (detached)");
        tags.filter(function (t) { return !r.head.branch || t !== r.head.branch; }).forEach(function (t) { H("b", { class: "k8-tag", text: t }, li); });
      });
      if (o.result) { res.innerHTML = o.result(r); return; }
      var R = run(r.work);
      res.innerHTML = R.error ? "Running these files: <b>" + LX.esc(R.error) + "</b>" :
        "Running these files gives <b>" + int(R.gasMWh) + " MWh</b> of electricity from gas, at $" + R.gasCost + "/MWh: <b>" + usd(R.cost) + "</b>. Balance check: <b>" + (R.ok ? "passes" : "fails by " + int(Math.abs(R.balance)) + " MWh") + "</b>.";
    }
    function say(cmd, lines, cls) {
      var blk = H("div", { class: "k8-blk" }, term);
      if (cmd) H("div", { class: "k8-cmdline", text: "$ " + cmd }, blk);
      (lines || []).forEach(function (l) {
        var t = typeof l === "string" ? { s: l } : l;
        H("div", { class: "k8-out" + (t.t === "-" ? " del" : t.t === "+" ? " ins" : t.t === "h" ? " hd" : "") + (cls ? " " + cls : ""), text: t.t && t.t !== "h" ? t.t + t.s : t.s }, blk);
      });
      while (term.children.length > 6) term.removeChild(term.firstChild);
      term.scrollTop = term.scrollHeight;
    }
    function button(label, fn, extra) {
      var b = H("button", { type: "button", class: "lx-btn ghost small k8-cmd" + (extra ? " " + extra : ""), text: label }, cmds);
      b.addEventListener("click", fn);
      return b;
    }
    return { el: box, draw: draw, say: say, button: button, cmds: cmds, term: term };
  }

  function diffView(host, lines) {
    var d = H("div", { class: "k8-term k8-diff", role: "group", "aria-label": "Diff" }, host);
    lines.forEach(function (x) { H("div", { class: "k8-out" + (x.t === "-" ? " del" : x.t === "+" ? " ins" : x.t === "h" ? " hd" : ""), text: x.t === "h" ? x.s : x.t + x.s }, d); });
    return d;
  }
  function diffAlt(lines) { return lines.filter(function (x) { return x.t === "-" || x.t === "+"; }).map(function (x) { return (x.t === "-" ? "Removed: " : "Added: ") + x.s; }); }

  function view(live, data, root) {
    var D = townDay(data.town, data.town_year), S = story(D), R1 = S.R1, steps = [], finish = [], chosen = { msg: COMMIT_MSGS[0].m };
    var H6 = S.hist, bugR = H6[3].R;
    LX.store.set("k8-story", { gas: R1.gasMWh, cost: R1.cost });

    // ---- step 1: the history
    steps.push({
      text: "A [[repository|repository]] is a project folder plus its history. Each [[commit|commit]] records the staged versions of its [[tracked-file|tracked files]], with a message and a short id. Run both commands.",
      build: function (act, api) {
        H("p", { class: "k8-prog", html: LX.rich("The project: each hour, gas fills the [[megawatt|MW]] that demand leaves after wind, solar and a 100 MW plant that runs flat. model.py adds the day's hours into MWh of electricity from gas; check.py [[assert|asserts]] that supply equals demand.") }, act);
        var r = stepStart(S, 0), g = GitStage(act, {}), did = {};
        g.draw(r);
        function check() { if (did.log && did.status) { api.done(); api.saw("Three commits, newest first. “Working tree clean”: your files match the last commit, which gives " + int(R1.gasMWh) + " MWh and " + usd(R1.cost) + "."); } }
        g.button("git log --oneline", function () { g.say("git log --oneline", logText(r)); did.log = 1; check(); });
        g.button("git status", function () { g.say("git status", statusText(r)); did.status = 1; check(); });
        finish[0] = function () { g.cmds.querySelectorAll("button").forEach(function (b) { b.click(); }); };
      }
    });

    // ---- step 2: edit, status, diff
    steps.push({
      text: "Try a what-if: change the gas cost in params.yml from $40 to $" + HIGH + " per [[megawatt-hour|MWh]]. Then ask Git what changed: git status names the file, git [[diff|diff]] shows the line.",
      build: function (act, api) {
        var r = stepStart(S, 1), did = {};
        var ed = H("div", { class: "k8-edit" }, act);
        H("span", { class: "k8-mono", text: "params.yml   gas_cost:" }, ed);
        var g;
        seg(ed, ["40", String(HIGH)], 0, function (i) { r = edit(S.base, "params.yml", params(i ? HIGH : GAS_COST)); did.edit = i === 1; g.draw(r); check(); }, "Gas cost in params.yml, $/MWh");
        g = GitStage(act, {});
        g.draw(r);
        var prog = H("p", { class: "k8-prog" }, act);
        function check() {
          var left = [did.edit ? null : "set gas_cost to " + HIGH, did.status ? null : "run git status", did.diff ? null : "run git diff"].filter(Boolean);
          prog.textContent = left.length ? "Still to do: " + left.join("; ") + "." : "All done: Next is open.";
          if (!left.length) { api.done(); api.saw("Saving changed only the working folder. The diff shows one line out, one line in; the result moves from " + usd(R1.cost) + " to " + usd(S.Rhigh.cost) + ". Nothing is recorded yet."); }
        }
        g.button("git status", function () { g.say("git status", statusText(r)); did.status = did.edit; check(); });
        g.button("git diff", function () { var d = diffText(r.index, r.work); g.say("git diff", d.length ? d : ["(no output: nothing changed)"]); did.diff = did.edit; check(); });
        check();
        finish[1] = function () { ed.querySelectorAll("button")[1].click(); g.cmds.querySelectorAll("button").forEach(function (b) { b.click(); }); };
      }
    });

    // ---- step 3: branch, stage, commit
    steps.push({
      text: "Keep main as it is and put the what-if on a [[branch|branch]]. Create it, stage the file in the [[staging-area|staging area]], then commit with a message that says why.",
      build: function (act, api) {
        var r = stepStart(S, 2), g = GitStage(act, {}), bSw, bAdd, mb = [];
        g.draw(r);
        bSw = g.button("git switch -c high-gas", function () { var x = switchCreate(r, "high-gas"); if (x.err) { g.say("git switch -c high-gas", ["fatal: " + x.err]); return; } r = x.repo; g.say("git switch -c high-gas", ["Switched to a new branch 'high-gas'"]); g.draw(r); upd(); });
        bAdd = g.button("git add params.yml", function () { r = add(r, "params.yml"); g.say("git add params.yml", []); g.draw(r); upd(); });
        COMMIT_MSGS.forEach(function (M) {
          mb.push(g.button('git commit -m "' + M.m + '"', function () {
            if (!M.ok) { api.saw(M.why, true); return; }
            var x = commit(r, M.m);
            if (x.err) { g.say('git commit -m "' + M.m + '"', [x.err]); return; }
            r = x.repo; chosen.msg = M.m;
            g.say('git commit -m "' + M.m + '"', ["[high-gas " + x.id + "] " + M.m, " 1 file changed, 1 insertion(+), 1 deletion(-)"]); g.draw(r); upd();
            api.done(); api.saw("Commit " + x.id + " records the staged snapshot, its message and its parent. main still points at " + S.ids.c3 + ", where gas costs $40.");
          }, "k8-msg"));
        });
        function upd() {
          var onB = r.head.branch === "high-gas", st = status(r);
          bSw.disabled = onB; bAdd.disabled = !onB || !st.modified.length;
          mb.forEach(function (b) { b.disabled = !st.staged.length; });
        }
        upd();
        finish[2] = function () { bSw.click(); bAdd.click(); mb[0].click(); };
      }
    });

    // ---- step 4: switch branches
    steps.push({
      text: "Switch back to main, then to high-gas again. Watch params.yml and the result change with the branch: each branch is a label on its own line of commits.",
      build: function (act, api) {
        var r = stepStart(S, 3, chosen.msg), g = GitStage(act, {}), seen = {};
        g.draw(r);
        ["main", "high-gas"].forEach(function (b) {
          g.button("git switch " + b, function () {
            var x = switchTo(r, b);
            if (x.err) { g.say("git switch " + b, ["error: " + x.err]); return; }
            r = x.repo; seen[b] = 1; g.say("git switch " + b, ["Switched to branch '" + b + "'"]); g.draw(r);
            if (seen.main && seen["high-gas"]) { api.done(); api.saw("On main: gas_cost 40 and " + usd(R1.cost) + ". On high-gas: " + HIGH + " and " + usd(S.Rhigh.cost) + ". Git swaps the files; neither line of work is lost."); }
          });
        });
        finish[3] = function () { g.cmds.querySelectorAll("button").forEach(function (b) { b.click(); }); };
      }
    });

    // ---- step 5: find the first bad commit
    steps.push({
      text: "A teammate's three commits arrive on main (git pull), and the balance check fails. Commit 1 passed; here, once a commit fails, every later one fails too. Check commits to find the first bad one.",
      build: function (act, api) {
        var r = stepStart(S, 4, chosen.msg), checked = {}, n = 0;
        H("p", { class: "k8-term k8-mono", text: "$ python check.py   →   AssertionError: energy balance is off (by " + int(Math.abs(bugR.balance)) + " MWh)" }, act);
        var ul = H("ul", { class: "k8-hunt", "aria-label": "The history, newest first" }, act), out = H("p", { class: "k8-result", "aria-live": "polite" }, act);
        var prog = H("p", { class: "k8-prog" }, act);
        H6.slice().reverse().forEach(function (h) {
          var li = H("li", { class: "k8-hrow" }, ul);
          var b = H("button", { type: "button", class: "lx-btn ghost small k8-cmd", "aria-pressed": "false" }, li);
          H("code", { text: h.n + " · " + h.id }, b); H("span", { text: " " + h.msg }, b);
          var mark = H("span", { class: "k8-mark" }, li);
          if (h.n === 1) { mark.textContent = "passed when written"; mark.className = "k8-mark good"; }
          if (h.n === 6) { mark.textContent = "fails now"; mark.className = "k8-mark bad"; }
          b.addEventListener("click", function () {
            if (!checked[h.key] && h.n > 1 && h.n < 6) n++;
            checked[h.key] = 1; b.setAttribute("aria-pressed", "true");
            mark.textContent = h.ok ? "passes" : "fails"; mark.className = "k8-mark " + (h.ok ? "good" : "bad");
            out.innerHTML = "$ git switch --detach " + h.id + " &nbsp;then&nbsp; python check.py → <b>" + (h.ok ? "balance OK" : "fails by " + int(Math.abs(h.R.balance)) + " MWh") + "</b> (gas " + int(h.R.gasMWh) + " MWh).";
            LX.store.set("k8-hunt", { checks: n });
            var found = checked.c3 && checked.c4;
            prog.textContent = found ? "Checks used: " + n + "." : "Checks used: " + n + ". Find two neighbours: one that passes, the next that fails.";
            if (found) { api.done(); api.saw("Commit 3 passes and commit 4 fails: **commit 4 (" + S.ids.c4 + ")** broke it. Checking the middle each time needs at most " + maxChecks(6) + " checks here, and only " + maxChecks(1000) + " for 1,000 commits."); }
          });
        });
        prog.textContent = "Checks used: 0. Find two neighbours: one that passes, the next that fails.";
        finish[4] = function () { ul.querySelectorAll("button").forEach(function (b, i) { if (i === 2 || i === 3) b.click(); }); };
        void r;
      }
    });

    // ---- step 6: read the diff, fix with a new commit
    var CHOICES = [
      { t: "A sign flip: the solar is now added", ok: true },
      { t: "A unit error: solar in kW, not MW", ok: false, why: "The units did not change; look at the signs inside the parentheses." },
      { t: "The data file changed", ok: false, why: "Only model.py changed in this commit." },
      { t: "The gas cost changed", ok: false, why: "params.yml is untouched; the MWh changed, not the price." }];
    steps.push({
      text: "Read what commit 4 changed with git diff. What went wrong? Then fix it with git revert, which adds a new commit that undoes it.",
      build: function (act, api) {
        var r = stepStart(S, 4, chosen.msg), d = diffText(S.team.commits[S.ids.c3].tree, S.team.commits[S.ids.c4].tree), right = false;
        H("p", { class: "k8-mono k8-cmdline", text: "$ git diff " + S.ids.c3 + " " + S.ids.c4 }, act);
        diffView(act, d);
        textAlt(act, "Text version of the diff", diffAlt(d));
        var row = H("div", { class: "lx-qbtns k8-choices", role: "group", "aria-label": "What went wrong?" }, act);
        var g = GitStage(act, { only: ["h"] }), bRev;
        CHOICES.forEach(function (c) {
          var b = H("button", { type: "button", class: "lx-choice", text: c.t }, row);
          b.addEventListener("click", function () {
            row.querySelectorAll("button").forEach(function (x) { x.classList.remove("right", "wrong"); });
            b.classList.add(c.ok ? "right" : "wrong");
            if (c.ok) { right = true; bRev.disabled = false; api.saw("−(wind − solar) is −wind **+ solar**: " + int(R1.solarMWh) + " MWh of solar counted twice over, " + int(Math.abs(bugR.balance)) + " MWh too much gas. Now run git revert."); }
            else api.saw(c.why, true);
          });
        });
        g.draw(r);
        bRev = g.button("git revert " + S.ids.c4, function () {
          var x = revert(r, S.ids.c4);
          if (x.err) { g.say("git revert " + S.ids.c4, ["error: " + x.err]); return; }
          r = x.repo; bRev.disabled = true;
          g.say("git revert " + S.ids.c4, ["[main " + x.id + '] Revert "' + MSG.c4 + '"', " 1 file changed, 1 insertion(+), 1 deletion(-)"]); g.draw(r);
          api.done(); api.saw("The new commit " + x.id + " undoes commit 4: " + int(R1.gasMWh) + " MWh and a passing check. The history keeps both, so anyone can see what happened.");
        });
        bRev.disabled = true;
        finish[5] = function () { row.querySelector("button").click(); bRev.click(); };
        void right;
      }
    });

    // ---- step 7: a notebook's hidden state
    steps.push({
      text: "A [[notebook|notebook]] runs code in cells, one at a time; its [[notebook-kernel|kernel]] keeps the variables in memory. Run cells 1 to 4, change cell 2 to $" + HIGH + ", run only cell 4. Then restart and run all.",
      build: function (act, api) {
        // saw: what the reader actually made cell 4 show (a stale number, or an error); the feedback is built from it
        var nb = nbNew(), saw = null, after = null, focusKey = null;
        var wrap = H("div", { class: "k8-nb" }, act), mem = H("p", { class: "k8-mem", "aria-live": "polite" }, act), prog = H("p", { class: "k8-prog" }, act);
        var bar = H("div", { class: "k8-cmds" }, act);
        var rr = H("button", { type: "button", class: "lx-btn small", text: "Restart and run all" }, bar);
        function restart() { nb = nbRestartRunAll(nb, D); if (saw) after = { out: nb.cells[3].out, v: nb.v }; focusKey = null; draw(); }
        function runCell(i) {
          nb = nbRun(nb, D, i);
          if (i === 3 && nbStale(nb, D)) saw = { out: nb.cells[3].out, v: nb.v, clean: nbClean(nb, D) };
          draw();
        }
        rr.addEventListener("click", restart);
        function draw() {
          var active = document.activeElement && document.activeElement.getAttribute && document.activeElement.getAttribute("data-k");
          if (active) focusKey = active;
          wrap.innerHTML = "";
          for (var i = 0; i < 4; i++) (function (i) {
            var c = nb.cells[i], cell = H("div", { class: "k8-cell" }, wrap);
            var top = H("div", { class: "k8-cell-top" }, cell);
            H("span", { class: "k8-in", text: "In [" + (c.n || " ") + "]:" }, top);
            var rb = H("button", { type: "button", class: "lx-btn ghost small", "data-k": "run" + i, "aria-label": "Run cell " + (i + 1), html: LX.icon("play") + "Run" }, top);
            rb.addEventListener("click", function () { runCell(i); });
            if (i === 1) {
              var s = seg(top, ["40", String(HIGH)], nb.v === HIGH ? 1 : 0, function (k) { nb = nbEdit(nb, k ? HIGH : GAS_COST); draw(); }, "Value written in cell 2, $/MWh");
              s.el.querySelectorAll("button").forEach(function (b, k) { b.setAttribute("data-k", "v" + k); });
            }
            H("pre", { class: "k8-code", text: nbSrc(nb, i) }, cell);
            if (c.err) H("div", { class: "k8-cell-out bad", text: c.err }, cell);
            else if (c.out != null) H("div", { class: "k8-cell-out", text: "Out[" + c.n + "]: " + c.out }, cell);
          })(i);
          if (focusKey) { var f = wrap.querySelector('[data-k="' + focusKey + '"]'); if (f) f.focus(); }
          var m = nb.mem, vars = [m.day ? "day (24 rows)" : null, m.gas_cost != null ? "gas_cost = " + m.gas_cost : null, m.gas_mwh != null ? "gas_mwh = " + m.gas_mwh : null].filter(Boolean);
          var note = nbStale(nb, D) ? " Cell 4 shows " + nb.cells[3].out + ", but the cells as written give " + nbClean(nb, D) + "." :
                     nb.cells[3].err ? " Cell 4 stopped: a cell it needs has not run yet. An error is easy to spot; hidden state shows none." : "";
          mem.innerHTML = "Kernel memory: <b>" + (vars.length ? LX.esc(vars.join(", ")) : "empty") + "</b>." + LX.esc(note);
          var left = [saw ? null : "make cell 4 show a number the cells as written would not give", after ? null : (saw ? "now restart and run all" : "then restart and run all")].filter(Boolean);
          prog.textContent = left.length ? "Still to do: " + left.join("; ") + "." : "Both done: Next is open.";
          if (!left.length) { api.done(); api.saw("Cell 4 showed " + saw.out + " under a cell that says " + saw.v + ": it used the memory, not the page. Restart and run all gave " + after.out + ", from the cells as written, counters 1 to 4."); }
        }
        draw();
        textAlt(act, "Text version", ["Cells: (1) load the day; (2) gas_cost = 40 or " + HIGH + "; (3) gas_mwh = " + R1.gasMWh + "; (4) gas_mwh * gas_cost.",
          "Run 1 to 4, edit cell 2 to " + HIGH + ", run only cell 4: it shows " + R1.cost + ", because memory still holds gas_cost = 40.",
          "Run cell 4 in a fresh kernel and it stops with a NameError: gas_mwh is not defined yet.", "Restart and run all: counters 1, 2, 3, 4 and " + S.Rhigh.cost + "."]);
        finish[6] = function () { [0, 1, 2, 3].forEach(function (i) { runCell(i); }); nb = nbEdit(nb, HIGH); runCell(3); restart(); };
      }
    });

    // ---- step 8: five fixes before sharing, one at a time; each changes the shared project's files (shareFiles), which
    // step 9 clones and runs
    var fixedKeys = null;   // null until step 8 is built in this visit (step 9 then uses all five fixes)
    steps.push({
      text: "The project now has a notebook, day.ipynb: step 7's cells (gas cost $40), a test draw and a balance check. It runs on your laptop. Fix, one by one, five things that would stop it on a stranger's.",
      build: function (act, api) {
        var list = H("ol", { class: "k8-fixes" }, act), prog = H("p", { class: "k8-prog", "aria-live": "polite" }, act), shown = 0;
        function show() {
          var f = FIXES[shown], li = H("li", { class: "k8-fix" }, list); shown++;
          H("p", { class: "k8-ftitle", html: LX.rich(shown + " of " + FIXES.length + " · " + f.title) }, li);
          H("p", { class: "k8-ffile", html: LX.rich(f.file) }, li);
          var code = H("pre", { class: "k8-code", text: f.before }, li);
          var why = H("p", { class: "k8-why" }, li);
          var b = H("button", { type: "button", class: "lx-btn ghost small", "aria-pressed": "false", text: "Fix it" }, li);
          b.addEventListener("click", function () {
            if (fixedKeys[f.key]) return;
            fixedKeys[f.key] = true; code.textContent = fixAfter(S, f); code.classList.add("ok"); why.innerHTML = LX.rich(f.why); b.textContent = "Fixed"; b.setAttribute("aria-pressed", "true");
            var n = Object.keys(fixedKeys).length;
            prog.textContent = n + " of " + FIXES.length + " fixed." + (n < FIXES.length ? " The next one is below." : "");
            if (n < FIXES.length) show();
            else { api.done(); api.saw("Pinned versions, a path inside the project, a checksum, a seed and a [[gitignore|.gitignore]] made before staging: each removes one thing that lived only on your computer. Step 9 runs these files."); }
          });
          return b;
        }
        fixedKeys = {};
        show();
        prog.textContent = "0 of " + FIXES.length + " fixed.";
        finish[7] = function () { var b; while ((b = list.querySelector("button[aria-pressed=false]"))) b.click(); };
      }
    });

    // ---- step 9: a clean clone reruns the notebook itself
    steps.push({
      text: "The real test: a fresh copy. [[clone|Clone]] the project, install the pinned versions (illustrative numbers), run the notebook top to bottom, and compare with the README.",
      build: function (act, api) {
        var F = finalRepo(S, chosen.msg, fixedKeys || allFixed()), C = cloneRepo(F), inst = null, X = null, k = 0, cloned = false;
        var left = Object.keys(F.work).filter(function (f) { return C.work[f] == null; }).sort(), reqs = C.work["requirements.txt"].split("\n");
        var g = GitStage(act, { only: ["w", "h"], result: function () {
          if (X) return X.ok ? "The notebook in the fresh copy: cell 3 gives <b>" + int(X.mem.gas_mwh) + " MWh</b> of electricity from gas, cell 4 shows <b>" + X.cells[3].out + "</b> (dollars), cell 6 prints <b>" + LX.esc(X.cells[5].stdout[0]) + "</b>." : "The notebook stopped: <b>" + LX.esc(X.error) + "</b>";
          return cloned ? "A fresh copy, nothing installed or run yet." : "Your project, committed and ready to share.";
        } });
        var CMD = ["git clone ../prairie-day fresh-copy && cd fresh-copy", "pip install -r requirements.txt", "jupyter nbconvert --to notebook --execute day.ipynb"];
        g.draw(F);
        var bs = CMD.map(function (c, i) {
          var b = g.button(c, function () {
            if (i !== k) return;
            k++; bs.forEach(function (x, j) { x.disabled = j !== k; });
            if (i === 0) { cloned = true; g.say(c, ["Cloning into 'fresh-copy'...", "In the copy: " + Object.keys(C.work).sort().join(", "), left.length ? "Not in the copy: " + left.join(", ") + " (ignored, never committed)" : "Nothing left behind: .env and the raw data were committed, so every copy has your key"]); g.draw(C); }
            if (i === 1) { inst = installFrom(C.work); g.say(c, ["Installing " + reqs.join(", ") + (reqs.every(function (l) { return /==/.test(l); }) ? " (version numbers illustrative)" : " (whatever versions are newest today)")]); }
            if (i === 2) {
              X = nbExecute(C.work, inst, 1);
              g.say(c, ["[NbConvertApp] Converting notebook day.ipynb to notebook"].concat(X.ok ?
                ["Ran cells 1 to " + X.cells.length + " in a new kernel; cell 6: " + X.cells[5].stdout[0], "[NbConvertApp] Writing day.nbconvert.ipynb (the notebook with its outputs)"] : [X.error]));
              g.draw(C);
              if (X.ok) api.done();
              api.saw(X.ok ? "Fresh copy, fresh install, notebook run top to bottom: " + int(X.mem.gas_mwh) + " MWh, " + usd(X.cells[3].out) + " and “" + X.cells[5].stdout[0] + "”, as the README says. Reproduced is not the same as right: R5's checks test that." : X.error, !X.ok);
            }
          });
          b.disabled = i !== 0;
          return b;
        });
        var cells = JSON.parse(C.work["day.ipynb"]).cells.map(function (c) { return c.source.join(""); });   // the file the run reads
        textAlt(act, "day.ipynb in the copy: its " + cells.length + " cells", cells.map(function (c, i) { return "Cell " + (i + 1) + ": " + c.split("\n").join(" · "); }));
        finish[8] = function () { bs.forEach(function (b) { b.click(); }); };
      }
    });

    var cards = LX.StepCards(live, { id: "k8-steps", steps: steps, onStep: function () { LX.emit("layout"); } });
    LX.demo(root, function (state) {   // "mid" = step 2 done; "step-N" = card N with its action done
      var m = /^step-(\d+)$/.exec(state), k = state === "mid" ? 1 : m ? Math.max(0, Math.min(steps.length - 1, +m[1] - 1)) : -1;
      if (k < 0) return null;
      cards.go(k); if (finish[k]) finish[k]();
      return { view: "step " + (k + 1) };
    }, cards);

    explain(S);
    drillView(S);
  }

  function explain(S) {
    var x = document.getElementById("k8-explain"); if (!x) return; x.innerHTML = "";
    var R1 = S.R1, hist = S.hist, B = bisect(hist.map(function (h) { return h.id; }), function (id) { return !run(S.team.commits[id].tree).ok; });
    LX.CompareTable(LX.H("div", { class: "lx-xcard" }, x), {
      title: "Three places a change can be", text: true,
      columns: [{ key: "name", label: "Place", main: true }, { key: "holds", label: "Holds" }, { key: "in", label: "Gets there by" }, { key: "undo", label: "Undo" }],
      rows: [
        { key: "w", color: "var(--lx-warn)", name: "Working folder", holds: "your files as you edit them", in: "edit and save", undo: "git restore <file> throws an edit away" },
        { key: "s", color: "var(--lx-accent)", name: "Staging area", holds: "the changes picked for the next commit", in: "git add <file>", undo: "git restore --staged <file>" },
        { key: "h", color: "var(--lx-good)", name: "History", holds: "every commit: the staged snapshot, a message, a parent", in: "git commit -m \"why\"", undo: "git revert <id> adds an undoing commit" }]
    });
    LX.CausalChain(LX.H("div", { class: "lx-xcard" }, x), {
      title: "Halving the history: the bug hunt",
      links: [
        { title: "Two ends known", text: "Commit 1 passes; commit 6 fails the balance check. Once the bug appears it stays, so the first bad one is among commits 2–6.", value: (hist.length - 1) + " suspects" },
        { title: "Check the middle", text: "Commit " + (B.checks[0].i + 1) + " " + (B.checks[0].bad ? "fails" : "passes") + ".", value: "commits " + (B.checks[0].i + 2) + "–6 left" },
        { title: "Check the middle again", text: "Commit " + (B.checks[1].i + 1) + " " + (B.checks[1].bad ? "fails" : "passes") + ": it sits next to a passing one.", value: B.checks.length + " checks" },
        { title: "Read its diff", text: "−(wind − solar) adds the solar instead of subtracting it.", value: "+" + int(Math.abs(hist[3].R.balance)) + " MWh" },
        { title: "Fix forward", text: "git revert adds a commit that undoes it; the history keeps both.", value: int(R1.gasMWh) + " MWh again" }],
      note: "Git can run the halving for you: git bisect. Halving needs at most " + maxChecks(1000) + " checks for 1,000 commits, as long as every commit after the first bad one also fails."
    });
    // each repair loops back to the check it failed; sharing comes only after both checks pass. Checks sit in column 0.5,
    // repairs in column 2; the two back edges are drawn by hand (up from the repair, then across into the line above
    // its check), at the rows set here (wide: x = 255 and 570, y = 34 + 88 * row; phones: x = 92 and 268, y = 34 + 92 * row)
    LX.Flowchart(LX.H("div", { class: "lx-xcard" }, x), {
      title: "Does it rerun? Check before you share", lede: "Two reruns, each catching a different problem; after a repair, run the same check again. Trace three cases from this page.",
      nodes: {
        start: { t: "Your notebook", k: "end" },
        q1: { t: "Restart, run all: same numbers?", tN: ["Restart, run all:", "same numbers?"], k: "q" },
        a1: { t: "Hidden state", s: "fix the cells", sN: "fix the cells" },
        q2: { t: "Clean clone: same numbers?", tN: ["Clean clone run:", "same numbers?"], k: "q" },
        a2: { t: "Something lives outside", s: "path, version, data or seed", tN: ["Something", "lives outside"], sN: "fix it" },
        end: { t: "Share, with the commit id", tN: ["Share, with", "the commit id"], k: "end" }
      },
      cols: 3, at: { start: [0.5, 0], q1: [0.5, 1.25], a1: [2, 1.25], q2: [0.5, 2.6], a2: [2, 2.6], end: [0.5, 3.7] },
      colsN: 2, atN: { start: [0, 0], q1: [0, 1.25], a1: [1, 1.25], q2: [0, 2.6], a2: [1, 2.6], end: [0, 3.7] },
      edges: [["start", "q1"], ["q1", "a1", "no"], ["q1", "q2", "yes"], ["q2", "a2", "no"], ["q2", "end", "yes"],
              ["a1", "q1", "fixed", { d: "M570 121.5 V80 H259", l: [420, 72], dN: "M268 126.5 V92 H96", lN: [182, 84] }],
              ["a2", "q2", "fixed", { d: "M570 240.3 V212 H259", l: [420, 204], dN: "M268 242.7 V215 H96", lN: [182, 207] }]],
      traces: [
        { label: "Cell 4 after the edit", path: ["start", "q1", "a1", "q1", "q2", "end"], text: "**Cell 4 showed " + R1.cost + " under a cell that says " + HIGH + ".** Restart and run all gives " + S.Rhigh.cost + ": hidden state. Run from the top again and the numbers match." },
        { label: "A path on one laptop", path: ["start", "q1", "q2", "a2", "q2", "end"], text: "**/Users/me/Desktop/town_day.csv runs at home, fails in the clone.** A path inside the project fixes it; a second clone then reruns." },
        { label: "The fresh clone", path: ["start", "q1", "q2", "end"], text: "**" + int(R1.gasMWh) + " MWh and " + usd(R1.cost) + " again, as the README says.** Same code and inputs, same result." }],
      sel: 0
    });
    LX.Checklist(LX.H("div", { class: "lx-xcard" }, x), {
      id: "k8-repro", title: "Before you share a model project", count: "head", soft: true, inline: true, sep: ". ",
      lede: "A reusable list; the ticks stay in this browser.",
      items: [
        { id: "pin", label: "Versions pinned", text: "requirements.txt or environment.yml lists exact versions." },
        { id: "data", label: "Data traceable", text: "Small processed data committed; raw data has a source, a date and a [[checksum|checksum]]." },
        { id: "paths", label: "Relative paths", text: "Every path starts inside the project folder." },
        { id: "seed", label: "Seeds fixed", text: "Every random draw has a fixed [[random-seed|seed]]." },
        { id: "secret", label: "Secrets out", text: "Keys and large raw files are in .gitignore before anything is staged; ignoring does not remove a file already committed." },
        { id: "order", label: "Runs top to bottom", text: "Restart and run all gives the shared numbers." },
        { id: "assert", label: "Checks that fail loudly", text: "An assert stops the run if a balance or total is off." },
        { id: "readme", label: "README", text: "How to install and run, and the key numbers to expect." },
        { id: "clone", label: "Clean clone", text: "A fresh copy and install give the same numbers." }]
    });
  }

  // ---- practice drill: a seeded stream of short items with instant feedback (LX.Drill; this visit only); after "Next
  // item", focus goes to the new item's first button or box
  function drillView(S) {
    var host = document.getElementById("k8-drill"); if (!host) return; host.innerHTML = "";
    LX.Drill(host, { hint: "Seven kinds of item in rotation, new details each time, about two minutes each. Fifteen items take about 30 minutes.",
                     focus: "answer", width: "8em", choicesClass: "k8-choices", unit: function (it) { return it.unit === "$" ? "dollars" : "checks"; },
                     item: function (k, r) { return drillItem(S, k, r); } });
  }

  LX.mount("k08", function (live, data, root) { view(live, data, root); });
})();
