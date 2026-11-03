// test_k08-git-notebooks.js — Node tests for toolbox K8 (assets/learn/k08-git-notebooks.js): the day agrees with lesson 0
// and K7; the project's run (gas, cost, balance) and the planted sign error; the Git state machine (status, add, commit,
// restore, branches, switching, detaching, merge, revert, pull, clone, .gitignore, ids, diffs); the bug hunt by halving;
// the notebook's hidden state; the step states; the drill answers over many seeds (re-derived here independently); every
// number the page states; the no-JS blocks; scope (no repository links, no excluded wording).
// Usage (from the site folder):  node _tests/learn/test_k08-git-notebooks.js [--write]   (--write rewrites the no-JS blocks)
"use strict";
const fs = require("fs");
const path = require("path");
const SITE = path.resolve(__dirname, "..", "..");
const K = require(path.join(SITE, "assets/learn/k08-git-notebooks.js"));
const G0 = require(path.join(SITE, "assets/learn/grid-operator.js"));
const K7 = require(path.join(SITE, "assets/learn/k07-spreadsheets.js"));
const town = JSON.parse(fs.readFileSync(path.join(SITE, "assets/learn/data/town.json"), "utf8"));
const year = JSON.parse(fs.readFileSync(path.join(SITE, "assets/learn/data/town_year.json"), "utf8"));
const QPATH = path.join(SITE, "learn/k08-git-notebooks.qmd");
const D = K.townDay(town, year), S = K.story(D);
const BLOCKS = { "k8-steps": () => K.staticFallback(S).steps, "k8-history": () => K.staticFallback(S).history, "k8-drill": () => K.staticDrill(S) };
function blockRe(name) { return [new RegExp("<!-- " + name + ":start[^>]*-->\\n"), "<!-- " + name + ":end -->"]; }
if (process.argv.includes("--write")) {
  let q = fs.readFileSync(QPATH, "utf8");
  Object.keys(BLOCKS).forEach(name => {
    const [ra, end] = blockRe(name), a = q.match(ra), b = q.indexOf(end);
    if (!a || b < a.index) throw new Error(name + " markers missing");
    q = q.slice(0, a.index + a[0].length) + BLOCKS[name]() + q.slice(b);
  });
  fs.writeFileSync(QPATH, q); console.log("no-JS blocks written");
}
const QMD = fs.readFileSync(QPATH, "utf8");
const JS = fs.readFileSync(path.join(SITE, "assets/learn/k08-git-notebooks.js"), "utf8");
const PATHYML = fs.readFileSync(path.join(SITE, "learn/path.yml"), "utf8");

let checks = 0, fails = 0;
function ok(cond, msg) { checks++; if (!cond) { fails++; console.log("FAIL:", msg); } }
const has = (s, msg) => ok(QMD.indexOf(s) >= 0, "page states " + (msg || JSON.stringify(s)));
const sum = a => a.reduce((x, y) => x + y, 0), int = v => Math.round(v).toLocaleString("en-US");

// ---------------- the day: lesson 0's cut and scaling, K7's numbers
{
  const W = G0.prepare(town, year, "lesson0"), D7 = K7.townDay(town, year);
  ["demand", "wind", "solar", "need"].forEach(k => ok(D[k].join() === W[k].join() && D[k].join() === D7[k].join(), `data: ${k} equals lesson 0's prepare() and K7's day`));
  ok(sum(D.demand) === 6957 && sum(D.wind) === 1181 && sum(D.solar) === 1411 && sum(D.need) === 1965 && D.flat === 100, "data: the day's energy 6,957 = 2,400 + 1,181 + 1,411 + 1,965 MWh");
  ok(D.dateLabel === "3 September 2025", "data: the named day");
}

// ---------------- running the project
{
  const R = S.R1;
  ok(R.gasMWh === 1965 && R.cost === 78600 && R.gasCost === 40 && R.ok && R.balance === 0, "run: commit 1 gives 1,965 MWh, $78,600 and a passing balance");
  ok(R.demandMWh === 24 * R.flat + R.windMWh + R.solarMWh + R.gasMWh, "run: the balance identity");
  ok(S.Rhigh.cost === 1965 * 55 && S.Rhigh.cost === 108075, "run: gas at $55/MWh gives $108,075 (K7's what-if)");
  const B = S.hist[3].R;
  ok(B.gasMWh === 4787 && B.balance === -2822 && B.balance === -2 * R.solarMWh && !B.ok, "run: the sign error adds the solar: 4,787 MWh, balance off by 2 × 1,411 = 2,822 MWh");
  ok(B.gasMWh === sum(D.demand.map((d, t) => d - D.wind[t] + D.solar[t] - 100)), "run: the buggy line is demand − wind + solar − flat, hour by hour");
  const env = { day: { a: [1, 2], b: [10, 20] }, p: { k: 3 }, consts: { c: 5 } };
  ok(K.evalLine("day.a - (day.b - day.a) - c", env).join() === [-13, -21].join() && K.evalLine("day.a - day.b + day.a - c", env).join() === [-13, -21].join(), "evalLine: parentheses flip the inner sign");
  ok(K.evalLine('-(day.a) + p["k"]', env).join() === "2,1", "evalLine: unary minus and params");
  ok(/NameError/.test(K.run(Object.assign({}, S.base.work, { "model.py": S.base.work["model.py"].replace('p["flat_mw"]', "nope") })).error), "run: an unknown name is a NameError");
  ok(K.runText(R).join("|") === "1965 MWh of gas, $ 78600|balance OK" && /AssertionError: energy balance is off \(by 2,822 MWh\)/.test(K.runText(B)[1]), "runText: what model.py and check.py print");
}

// ---------------- the Git state machine
{
  const r0 = S.base;
  ok(K.status(r0).clean && K.log(r0).length === 3 && K.headId(r0) === S.ids.c3, "git: the project starts clean with three commits");
  let r = K.edit(r0, "params.yml", K.params(55)), st = K.status(r);
  ok(st.modified.join() === "params.yml" && !st.staged.length && !st.clean, "git: an edit is modified, not staged");
  ok(K.commit(r, "x").err === "nothing added to commit" && K.log(K.commit(r, "x").repo).length === 3, "git: commit with nothing staged records nothing");
  const d = K.diffText(r.index, r.work).filter(x => x.t === "-" || x.t === "+");
  ok(d.length === 2 && d[0].t === "-" && /gas_cost: 40/.test(d[0].s) && d[1].t === "+" && /gas_cost: 55/.test(d[1].s), "git: the diff is one line out, then one line in");
  r = K.add(r, "params.yml"); st = K.status(r);
  ok(st.staged.join() === "params.yml" && !st.modified.length, "git: add stages the file");
  const c = K.commit(r, "Raise"); r = c.repo;
  ok(K.status(r).clean && K.log(r).length === 4 && r.branches.main === c.id && K.log(r)[0].parents[0] === S.ids.c3, "git: commit records, moves the branch, links the parent");
  // edit, add, edit: the commit records the first edit (the page's quiz)
  let q = K.edit(r0, "model.py", "A"); q = K.add(q, "model.py"); q = K.edit(q, "model.py", "B");
  st = K.status(q); const qc = K.commit(q, "m").repo;
  ok(st.staged.join() === "model.py" && st.modified.join() === "model.py" && K.treeOf(qc)["model.py"] === "A" && qc.work["model.py"] === "B", "git: edit, add, edit: the commit holds the first edit; the second waits");
  ok(K.restore(K.edit(r0, "model.py", "Z"), "model.py").work["model.py"] === r0.work["model.py"], "git: restore brings back the staged version");
  ok(K.restoreStaged(K.add(K.edit(r0, "model.py", "Z"), "model.py"), "model.py").index["model.py"] === r0.index["model.py"], "git: restore --staged unstages");
  // ids
  const t = { a: "1" };
  ok(K.newRepo(t, "m").branches.main === K.newRepo(t, "m").branches.main && K.newRepo(t, "m").branches.main !== K.newRepo(t, "n").branches.main && K.newRepo(t, "m").branches.main !== K.newRepo({ a: "2" }, "m").branches.main, "git: ids are fingerprints of content and message");
  ok(/^[0-9a-f]{7}$/.test(S.ids.c1) && new Set(Object.values(S.ids)).size === 6, "git: six distinct 7-hex ids");
  // branches and switching
  let b = K.switchCreate(K.edit(r0, "params.yml", K.params(55)), "high-gas").repo;
  ok(b.head.branch === "high-gas" && K.status(b).modified.join() === "params.yml" && b.branches["high-gas"] === S.ids.c3, "git: switch -c keeps uncommitted changes and starts at the same commit");
  ok(K.switchCreate(b, "high-gas").err && K.switchTo(b, "main").err, "git: no duplicate branch; no moving with uncommitted changes (this page's rule)");
  b = K.commit(K.add(b, "params.yml"), "Raise").repo;
  let m = K.switchTo(b, "main").repo;
  ok(m.work["params.yml"] === K.params(40) && K.run(m.work).cost === 78600 && K.run(K.switchTo(m, "high-gas").repo.work).cost === 108075, "git: switching swaps the files: main $78,600, high-gas $108,075");
  const u = K.switchTo(K.edit(b, "notes.txt", "n"), "main").repo;
  ok(u.work["notes.txt"] === "n" && K.status(u).untracked.join() === "notes.txt", "git: untracked files stay when switching");
  ok(K.detach(b, S.ids.c1).repo.head.detached === S.ids.c1 && !K.detach(b, S.ids.c1).repo.work["params.yml"], "git: detach shows an old snapshot (no params.yml in commit 1)");
  // merge: fast-forward, a true merge, a conflict
  const ff = K.merge(m, "high-gas");
  ok(ff.ff && ff.repo.branches.main === b.branches["high-gas"] && ff.repo.work["params.yml"] === K.params(55), "git: merge fast-forwards main when it has not moved");
  let mm = K.commit(K.add(K.edit(m, "README.md", m.work["README.md"] + "\nmore"), "README.md"), "Doc").repo;
  const mg = K.merge(mm, "high-gas");
  ok(mg.id && mg.repo.commits[mg.id].parents.length === 2 && mg.repo.work["params.yml"] === K.params(55) && /more$/.test(mg.repo.work["README.md"]), "git: a true merge keeps both changes, with two parents");
  ok(K.mergeBase(mm, mm.branches.main, b.branches["high-gas"]) === S.ids.c3, "git: the merge base is commit 3");
  const mc = K.merge(K.commit(K.add(K.edit(m, "params.yml", K.params(30)), "params.yml"), "Lower").repo, "high-gas");
  ok(mc.err && mc.conflicts.join() === "params.yml", "git: both branches changed params.yml: a conflict");
  ok(K.merge(ff.repo, "high-gas").note === "Already up to date.", "git: merging again changes nothing");
  // .gitignore and clone
  const F = K.finalRepo(S), C = K.cloneRepo(F);
  ok(K.ignored(F, ".env") && K.ignored(F, "data/raw/EIA930_BALANCE_2025.csv") && K.ignored(F, "gas_day.png") && !K.ignored(F, "model.py"), "git: .gitignore patterns (name, folder/, *.ext)");
  ok(K.status(F).clean && !K.status(F).untracked.length && K.status(F).ignored.length === 2, "git: the shared project is clean; .env and the raw data are ignored");
  ok(!C.work[".env"] && !C.work["data/raw/EIA930_BALANCE_2025.csv"] && C.work["requirements.txt"] === K.REQS && C.work["day.ipynb"], "clone: no .env and no raw data; requirements and the notebook come along");
  const Rc = K.run(C.work);
  ok(Rc.gasMWh === 1965 && Rc.cost === 78600 && Rc.ok && C.work["README.md"].indexOf("Expected: 1965 MWh of gas, $78,600 a day") >= 0, "clone: reruns to 1,965 MWh, $78,600 and a passing check, as its README says");
  // diffLines reconstructs both sides
  let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (let k = 0; k < 300; k++) {
    const A = Array.from({ length: Math.floor(rnd() * 8) }, () => "l" + Math.floor(rnd() * 5)), B = Array.from({ length: Math.floor(rnd() * 8) }, () => "l" + Math.floor(rnd() * 5));
    const dd = K.diffLines(A.join("\n"), B.join("\n")), a2 = dd.filter(x => x.t !== "+").map(x => x.s), b2 = dd.filter(x => x.t !== "-").map(x => x.s);
    ok((A.length ? a2.join("\n") === A.join("\n") : a2.join("") === "") && (B.length ? b2.join("\n") === B.join("\n") : b2.join("") === ""), `diffLines: random case ${k} rebuilds both files`);
  }
  ok(K.logText(K.stepStart(S, 3))[1] === S.ids.c3 + " (main) " + K.MSG.c3 && /^[0-9a-f]{7} \(HEAD -> high-gas\) Raise the gas cost/.test(K.logText(K.stepStart(S, 3))[0]), "git: log --oneline decorations");
}

// ---------------- the story, the steps and the bug hunt
{
  const H = S.hist;
  ok(H.map(h => h.ok).join() === "true,true,true,false,false,false", "story: commits 1-3 pass, 4-6 fail");
  ok(K.diffText(S.team.commits[S.ids.c3].tree, S.team.commits[S.ids.c4].tree).filter(x => x.t !== " " && x.t !== "h").map(x => x.t + x.s).join("|") === "-" + K.GOOD3 + "|+" + K.BUG, "story: commit 4 changes only the gas line");
  const B = K.bisect(H.map(h => h.id), id => !K.run(S.team.commits[id].tree).ok);
  ok(B.id === S.ids.c4 && B.first === 3 && B.checks.length === 2 && B.checks[0].i === 2 && !B.checks[0].bad && B.checks[1].i === 3 && B.checks[1].bad, "hunt: halving checks commit 3 (passes), then 4 (fails): commit 4 in 2 checks");
  // halving is right and needs at most maxChecks(n) checks for every position of the first bad commit
  for (let n = 2; n <= 130; n++) {
    let worst = 0;
    for (let f = 1; f < n; f++) { const r = K.bisect([...Array(n).keys()], i => i >= f); ok(r.first === f, `bisect n=${n} first=${f}`); worst = Math.max(worst, r.checks.length); }
    ok(worst === K.maxChecks(n), `maxChecks(${n}) = ${K.maxChecks(n)} is the worst case`);
  }
  ok(K.maxChecks(6) === 3 && K.maxChecks(9) === 3 && K.maxChecks(1000) === 10, "maxChecks: 3 for the page's 6 commits and the quiz's 9, 10 for 1,000");
  // one by one (newest first, or oldest first) can take n − 2 checks with n commits
  ok(9 - 2 === 7, "quiz: one by one can take 7 checks for commits 2-8");
  const s2 = K.stepStart(S, 2), s3 = K.stepStart(S, 3), s4 = K.stepStart(S, 4), s5 = K.stepStart(S, 5);
  ok(K.status(K.stepStart(S, 0)).clean && K.status(s2).modified.join() === "params.yml", "steps: 1 starts clean, 3 starts with the edit");
  ok(s3.head.branch === "high-gas" && s3.branches.main === S.ids.c3 && K.status(s3).clean, "steps: after 3, high-gas has the commit and main is untouched");
  ok(s4.branches.main === S.ids.c6 && !K.run(s4.work).ok && s4.branches["high-gas"] === s3.branches["high-gas"], "steps: after the pull, main is at commit 6 and fails; high-gas is kept");
  ok(K.run(s5.work).ok && K.run(s5.work).gasMWh === 1965 && s5.work["model.py"] === S.team.commits[S.ids.c3].tree["model.py"] && s5.work["plot.py"] && K.log(s5).length === 7, "steps: the revert brings back commit 3's model and keeps the chart: 7 commits");
  ok(K.revert(s4, S.ids.c4).repo.commits[K.headId(K.revert(s4, S.ids.c4).repo)].msg === 'Revert "' + K.MSG.c4 + '"', "steps: the revert's message");
  K.COMMIT_MSGS.forEach(c => ok(K.stepStart(S, 3, c.m).commits[K.stepStart(S, 3, c.m).branches["high-gas"]].msg === c.m, "steps: the chosen message carries on"));
  ok(K.pull(K.stepStart(S, 3), S.team).repo.branches.main === S.ids.c6, "pull: fast-forwards main");
}

// ---------------- the notebook
{
  let nb = K.nbNew();
  [0, 1, 2, 3].forEach(i => { nb = K.nbRun(nb, D, i); });
  ok(nb.cells.map(c => c.n).join() === "1,2,3,4" && nb.cells[3].out === 78600 && !K.nbStale(nb, D), "notebook: top to bottom: 78600");
  nb = K.nbEdit(nb, 55); nb = K.nbRun(nb, D, 3);
  ok(nb.cells[3].out === 78600 && nb.cells[3].n === 5 && nb.cells[1].n === 2 && K.nbStale(nb, D) && K.nbClean(nb, D) === 108075, "notebook: edit cell 2, run only cell 4: still 78600 (stale); counters 2 and 5");
  nb = K.nbRestartRunAll(nb, D);
  ok(nb.cells.map(c => c.n).join() === "1,2,3,4" && nb.cells[3].out === 108075 && !K.nbStale(nb, D), "notebook: restart and run all: 108075, counters 1-4");
  ok(K.nbRun(K.nbNew(), D, 3).cells[3].err === "NameError: name 'gas_mwh' is not defined" && K.nbRun(K.nbNew(), D, 2).cells[2].err === "NameError: name 'day' is not defined", "notebook: out of order: NameErrors");
  ok(K.nbSrc(K.nbEdit(K.nbNew(), 55), 1).indexOf("gas_cost = 55") === 0, "notebook: the cell shows what is written");
}

// ---------------- what the Git stage calls each file: staged is not committed
{
  const r0 = S.base, st = r => K.status(r);
  ok(K.fileState(st(r0), "params.yml") === "matches the last commit", "labels: a clean file matches the last commit");
  const e = K.edit(r0, "params.yml", K.params(55)), a = K.add(e, "params.yml"), e2 = K.edit(a, "params.yml", K.params(60));
  ok(K.fileState(st(e), "params.yml") === "edited", "labels: an unstaged edit is edited");
  ok(K.fileState(st(a), "params.yml") === "staged, not committed", "labels: after git add the file is staged, not committed");
  ok(K.fileState(st(e2), "params.yml") === "edited after staging", "labels: an edit after git add is edited after staging");
  ok(K.fileState(st(K.commit(a, "m").repo), "params.yml") === "matches the last commit", "labels: after the commit it matches the last commit");
  const F = K.finalRepo(S);
  ok(K.fileState(st(K.edit(r0, "notes.txt", "n")), "notes.txt") === "new, untracked" && K.fileState(st(F), ".env") === "ignored", "labels: untracked and ignored files");
  ok(!/"as committed"/.test(JS) && /fileState\(st, k\)/.test(JS), "labels: the view uses fileState, and nothing staged is called committed");
}

// ---------------- the shared project (steps 8 and 9): the fixes are in its files, and step 9 runs its notebook
{
  const all = K.allFixed(), F = K.finalRepo(S), C = K.cloneRepo(F), inst = K.installFrom(C.work), X = K.nbExecute(C.work, inst, 1);
  const nb = JSON.parse(C.work["day.ipynb"]);
  ok(nb.nbformat === 4 && nb.nbformat_minor === 4 && nb.metadata.kernelspec.name === "python3" && nb.cells.length === 6 && nb.cells.every(c => c.cell_type === "code" && Array.isArray(c.source) && Array.isArray(c.outputs) && c.execution_count === null && typeof c.metadata === "object"),
     "notebook file: valid nbformat 4 JSON, six code cells, a Python 3 kernel");
  ok(nb.cells.map(c => c.source.join("")).join("\n--\n") === K.shareCells(all).join("\n--\n"), "notebook file: its cells are shareCells()");
  ok(K.shareCells(all).slice(1, 4).join("|") === [K.nbSrc(K.nbNew(), 1), K.nbSrc(K.nbNew(), 2), K.nbSrc(K.nbNew(), 3)].join("|") && K.nbSrc(K.nbNew(), 0).replace(K.PATH_LAPTOP, K.PATH_PROJECT) === K.shareCells(all)[0], "notebook file: cells 1 to 4 are step 7's cells (cell 1 with the fixed path)");
  ok(/assert day\.demand_mw\.sum\(\) == supply/.test(K.shareCells(all)[5]) && /random_state=1/.test(K.shareCells(all)[4]), "notebook file: cell 5 is the seeded draw, cell 6 the balance assert");
  ok(["pandas", "yaml", "matplotlib", "nbconvert", "ipykernel"].every(m => inst[m] && inst[m] !== "newest") && K.REQS.split("\n").every(l => /^[a-z]+==\d+\.\d+\.\d+$/.test(l)), "install: every package pinned, with nbconvert and its Python kernel (ipykernel)");
  ok(X.ok && !X.error && X.cells.length === 6 && X.mem.gas_mwh === 1965 && X.cells[3].out === 78600 && X.cells[5].stdout.join() === "balance OK", "execute: the clone's notebook runs top to bottom: 1,965 MWh, 78600, balance OK");
  const Rc = K.run(C.work);
  ok(Rc.gasMWh === X.mem.gas_mwh && Rc.cost === X.cells[3].out && Rc.ok, "execute: the notebook and model.py agree");
  let nb7 = K.nbNew(); [0, 1, 2, 3].forEach(i => { nb7 = K.nbRun(nb7, D, i); }); ok(nb7.cells[3].out === X.cells[3].out, "execute: step 7's kernel model and the executed file agree");
  ok(/nbconvert/.test(K.nbExecute(C.work, {}, 1).error) && /No such kernel/.test(K.nbExecute(C.work, Object.assign({}, inst, { ipykernel: undefined }), 1).error) && /ModuleNotFoundError: No module named 'pandas'/.test(K.nbExecute(C.work, Object.assign({}, inst, { pandas: undefined }), 1).error), "execute: needs nbconvert, a kernel and pandas");
  ok(/NotJSONError/.test(K.nbExecute(Object.assign({}, C.work, { "day.ipynb": "cell 1: import pandas" }), inst, 1).error), "execute: a plain-text day.ipynb is not a notebook");
  const bugNb = K.notebookJSON(K.shareCells(all).map((c, i) => i === 2 ? c.replace("- day.solar_mw", "+ day.solar_mw") : c));
  const XB = K.nbExecute(Object.assign({}, C.work, { "day.ipynb": bugNb }), inst, 1);
  ok(!XB.ok && /CellExecutionError in cell 6: AssertionError: energy balance is off/.test(XB.error) && XB.cells[3].out === 4787 * 40, "execute: a sign error in cell 3 stops at cell 6's assert");
  ok(K.nbEval("2 + 3 * 4 - (1 - 2)", {}) === 15 && K.nbEval("-(2) * 3", {}) === -6, "nbEval: precedence and parentheses");
  // each fix matters, and the shown before/after texts are the files' own
  const without = k => { const f = Object.assign({}, all); delete f[k]; return f; };
  const P = K.shareFiles(S, undefined, {}).work, Q = K.shareFiles(S, undefined, all).work;
  const fx = k => K.FIXES.find(f => f.key === k);
  ok(P["requirements.txt"] === fx("pin").before && Q["requirements.txt"] === K.fixAfter(S, fx("pin")), "fix pin: requirements.txt before and after");
  ok(JSON.parse(P["day.ipynb"]).cells[0].source.join("").indexOf(fx("path").before) >= 0 && JSON.parse(Q["day.ipynb"]).cells[0].source.join("").indexOf(K.fixAfter(S, fx("path"))) >= 0, "fix path: cell 1 before and after");
  ok(P["README.md"].indexOf(fx("data").before) >= 0 && Q["README.md"].indexOf(K.fixAfter(S, fx("data"))) >= 0 && /downloaded 2 Nov 2026, SHA-256 fac4bb99… and 1146158b…/.test(Q["README.md"]), "fix data: the README's source, date and checksums (from the data's metadata)");
  ok(year.meta.accessed === "2026-11-02" && year.meta.files[0].sha256.indexOf("fac4bb99") === 0 && year.meta.files[1].sha256.indexOf("1146158b") === 0, "fix data: date and checksums are town_year.json's");
  ok(JSON.parse(P["day.ipynb"]).cells[4].source.join("") === fx("seed").before && JSON.parse(Q["day.ipynb"]).cells[4].source.join("") === K.fixAfter(S, fx("seed")), "fix seed: cell 5 before and after");
  ok(P[".gitignore"] == null && Q[".gitignore"] === K.fixAfter(S, fx("secret")), "fix secret: no .gitignore before; the shown one after");
  const CP = K.cloneRepo(K.shareRepo(S, undefined, without("path")));
  ok(/FileNotFoundError: \[Errno 2\] No such file or directory: '\/Users\/me\/Desktop\/town_day\.csv'/.test(K.nbExecute(CP.work, K.installFrom(CP.work), 1).error), "fix path matters: without it the clone stops at cell 1");
  const CS = K.cloneRepo(K.shareRepo(S, undefined, without("secret")));
  ok(CS.work[".env"] === K.ENV && CS.work[K.RAW] != null && C.work[".env"] == null && C.work[K.RAW] == null, "fix secret matters: without .gitignore, git add . commits .env and the raw data into every clone");
  const CN = K.cloneRepo(K.shareRepo(S, undefined, without("seed")));
  const s1 = K.nbExecute(CN.work, K.installFrom(CN.work), 1).sample, s2 = K.nbExecute(CN.work, K.installFrom(CN.work), 2).sample;
  const f1 = K.nbExecute(C.work, inst, 1).sample, f2 = K.nbExecute(C.work, inst, 2).sample;
  ok(s1.sample.join() !== s2.sample.join() && !s1.seeded && f1.sample.join() === f2.sample.join() && f1.seeded && f1.sample.length === 6 && new Set(f1.sample).size === 6, "fix seed matters: unseeded draws change between runs; seeded ones do not");
  const CU = K.cloneRepo(K.shareRepo(S, undefined, without("pin")));
  ok(Object.values(K.installFrom(CU.work)).every(v => v === "newest"), "fix pin matters: without pins pip installs whatever is newest");
  ok(K.cloneRepo(K.shareRepo(S, undefined, without("data"))).work["README.md"].indexOf("SHA-256") < 0, "fix data matters: without it the README has no checksum");
  // ignore rules do not untrack a file already committed
  let g = K.commit(K.add(K.edit(S.base, ".env", K.ENV), ".env"), "oops").repo;
  g = K.commit(K.add(K.edit(g, ".gitignore", K.IGNORE), "."), "ignore").repo;
  ok(K.ignored(g, ".env") && K.treeOf(g)[".env"] === K.ENV && K.cloneRepo(g).work[".env"] === K.ENV, "gitignore: a file committed before the rule stays tracked and in every clone");
  ok(/do not remove a file already committed/.test(K.FIXES.find(f => f.key === "secret").why) && /does not remove files already committed/.test(fs.readFileSync(path.join(SITE, "learn/_w1/k08-git-notebooks.yml"), "utf8")) && /ignoring does not remove a file already committed/.test(JS), "gitignore: step 8, the glossary and the checklist say so");
  // the view: step 8 feeds step 9, which runs the notebook file and reports its outputs
  ok(/finalRepo\(S, chosen\.msg, fixedKeys \|\| allFixed\(\)\)/.test(JS) && /X = nbExecute\(C\.work, inst, 1\)/.test(JS) && /JSON\.parse\(C\.work\["day\.ipynb"\]\)/.test(JS), "view: step 9 clones step 8's project and executes its notebook file");
  ok(/if \(n < FIXES\.length\) show\(\)/.test(JS), "view: step 8 shows its fixes one at a time");
  ok(/Installing " \+ reqs\.join\(", "\) \+ \(reqs\.every\(function \(l\) \{ return \/==\/\.test\(l\); \}\) \? " \(version numbers illustrative\)"/.test(JS) && /illustrative/.test(K.FIXES[0].file), "pins: the install output and step 8's file label say the versions are illustrative");
}

// ---------------- step 7's feedback comes from what the reader did; the flowchart loops back after each repair
{
  ok(/if \(i === 3 && nbStale\(nb, D\)\) saw = \{ out: nb\.cells\[3\]\.out, v: nb\.v/.test(JS) && /"Cell 4 showed " \+ saw\.out \+ " under a cell that says " \+ saw\.v/.test(JS) && !/sawOdd/.test(JS), "step 7: completion needs a stale cell 4 and quotes the reader's own numbers (an error alone does not count)");
  ok(/\["a1", "q1", "fixed"/.test(JS) && /\["a2", "q2", "fixed"/.test(JS) && !/\["a1", "q2"/.test(JS) && !/\["a2", "end"/.test(JS), "flowchart: each repair returns to its own check; sharing only after both pass");
  ok(/path: \["start", "q1", "a1", "q1", "q2", "end"\]/.test(JS) && /path: \["start", "q1", "q2", "a2", "q2", "end"\]/.test(JS), "flowchart: the traces go back through the check after a repair");
}

// ---------------- drill items, re-derived independently
{
  // a tiny independent model of the three places, for one file
  function where(ops) {
    let w = "v0", i = "v0", h = "v0", last = null, k = 0;
    ops.forEach(op => { if (op === "edit") { k++; w = last = "e" + k; } else if (op === "add") i = w; else if (op === "commit") { if (i !== h) h = i; } else if (op === "restore") w = i; });
    return w !== last ? 3 : h === last ? 2 : i === last ? 1 : 0;
  }
  function nbIndep(seq) {
    const mem = {}; let v = 40, out = null;
    seq.forEach(s => {
      if (s === "e") { v = 55; return; }
      if (s === 0) mem.day = 1; else if (s === 1) mem.cost = v; else if (s === 2) { if (mem.day) mem.mwh = 1965; }
      else out = mem.mwh == null || mem.cost == null ? "err" : mem.mwh * mem.cost;
    });
    return out;
  }
  const kinds = new Set();
  [1, 2, 3, 42, 777, 9999].forEach(seed => {
    K.drill(S, seed, 210).forEach((it, n) => {
      kinds.add(it.kind);
      const tag = `drill seed ${seed} item ${n} (${it.kind})`;
      if (it.choices) ok(it.answer >= 0 && it.answer < it.choices.length && new Set(it.choices).size === it.choices.length, tag + ": answer among distinct choices");
      if (it.kind === "where") ok(it.answer === where(it.ops) && it.choices[it.answer] === K.WHERE[it.answer], tag);
      if (it.kind === "next") ok(it.staged.length === 1 && it.modified.length === 1 && it.choices[it.answer] === it.staged[0] && it.modified[0] !== it.staged[0], tag);
      if (it.kind === "cost") { const c = +/\+ gas_cost: (\d+)/.exec(it.q)[1]; ok(it.answer === 1965 * c, tag); }
      if (it.kind === "halve") { let worst = 0; for (let f = 1; f < it.n; f++) worst = Math.max(worst, K.bisect([...Array(it.n).keys()], i => i >= f).checks.length); ok(it.answer === worst, tag); }
      if (it.kind === "notebook") { const o = nbIndep(it.seq); ok(it.choices[it.answer] === (o === "err" ? "an error: a name is not defined" : String(o)), tag); }
      if (it.kind === "repro") ok(K.REPRO.some(p => p.q === it.q && p.a === it.choices[it.answer]), tag);
      if (it.kind === "order") ok(K.ORDERS.some(p => it.q.indexOf(p.q) === 0 && p.a.join("  →  ") === it.choices[it.answer]), tag);
    });
  });
  ok(kinds.size === 7, "drill: all seven kinds appear");
  ok(K.WHERE.length === 4, "drill: four places");
}

// ---------------- the page
{
  const sub = /^subtitle: "(.*)"$/m.exec(QMD)[1], ent = PATHYML.slice(PATHYML.indexOf("id: k08-git-notebooks"));
  ok(ent.indexOf('subtitle: "' + sub + '"') > 0 && /status: active/.test(ent.slice(0, 400)), "page: subtitle equals path.yml; the entry is active");
  Object.keys(BLOCKS).forEach(name => {
    const [ra, end] = blockRe(name), a = QMD.match(ra), b = QMD.indexOf(end);
    ok(a && b > a.index && QMD.slice(a.index + a[0].length, b) === BLOCKS[name](), `page: the ${name} block is the generated one (run with --write)`);
  });
  const R = S.R1;
  has("make in one day, 1,965 MWh: what demand leaves after wind, solar and a 100 MW plant that runs flat. At $40/MWh it costs $78,600", "the result in the fallback lede");
  ok(R.gasMWh === 1965 && R.cost === 78600, "page: the lede's numbers from the model");
  has("1,000 commits need at most 10 checks"); ok(K.maxChecks(1000) === 10, "page: 10 checks for 1,000 commits");
  has("cell 4 showed 78600 under a cell that says 55"); ok(K.nbStale(K.nbRun(K.nbEdit(K.nbRestartRunAll(K.nbNew(), D), 55), D, 3), D), "page: the stale 78600");
  has("gave 4,787 MWh every time"); ok(S.hist[3].R.gasMWh === 4787, "page: 4,787 MWh from the model");
  has("Checking one by one can take 7");
  has("eight suspects (commits 2 to 9), halved three times"); ok(K.maxChecks(9) === 3, "page: 3 checks for 9 commits");
  has("40-character SHA-1"); has("7-character fingerprints");
  has("3 September 2025");
  has("[R5](r05-build-validate.html) puts a whole model through planted bugs");
  // a commit holds the staged versions of tracked files, not every file; halving assumes the bug stays
  ok(!/snapshot of every file/.test(QMD + JS + fs.readFileSync(path.join(SITE, "learn/_w1/k08-git-notebooks.yml"), "utf8")) && /records the staged versions of the project's/.test(QMD) && /records the staged versions of its \[\[tracked-file\|tracked files\]\]/.test(JS), "commit: defined as the staged versions of tracked files");
  has("once the bug appears, every later commit fails. Checking the middle each time");
  has("if every commit after the first bad one also fails");
  ok(/once a commit fails, every later one fails too/.test(JS) && /and once the bug appears every later commit fails/.test(JS) && /Once the bug appears it stays/.test(JS), "halving: the assumption is stated in step 5, the drill and the causal chain");
  ["tracked-file", "git-head", "notebook", "api-key", "assert", "megawatt"].forEach(t => ok(new RegExp("\\[\\[" + t + "\\|").test(JS) || new RegExp('data-term="' + t + '"').test(QMD), "glossary: " + t + " is marked"));
  ["tracked-file", "git-head", "notebook", "api-key"].forEach(t => ok(new RegExp("- id: " + t + "\\n").test(fs.readFileSync(path.join(SITE, "learn/_w1/k08-git-notebooks.yml"), "utf8")), "glossary: " + t + " is defined in the sidecar"));
  // the version pins are illustrative wherever they show: step 8's fix, step 9's install, the drill item, the fallback, the data note
  ok(K.FIXES[0].key === "pin" && /illustrative/.test(K.FIXES[0].label) && /illustrative/.test(K.FIXES[0].why), "pins: step 8's fix and the fallback row say the version is illustrative");
  ok(/install the pinned versions \(illustrative numbers\)/.test(JS), "pins: step 9 says the installed versions are illustrative");
  ok(K.REPRO.filter(p => /==/.test(p.a)).every(p => /illustrative/.test(p.why)), "pins: the drill's pin item says the version is illustrative");
  has("The version numbers in requirements.txt (pandas==2.2.3 and the others) are illustrative");
  ok((QMD.match(/\d+\.\d+\.\d+/g) || []).length === (QMD.match(/pandas==2\.2\.3[^<]{0,40}illustrative/g) || []).length, "pins: every version number on the page sits next to the word illustrative");
  // the quiz: only the first (staged) edit is committed
  { let q = K.edit(S.base, "model.py", "first"); q = K.add(q, "model.py"); q = K.edit(q, "model.py", "second"); ok(K.treeOf(K.commit(q, "m").repo)["model.py"] === "first", "quiz: only the first edit"); }
  // the step texts and saw lines carry model numbers, not typed ones
  ok(/usd\(R1\.cost\)/.test(JS) && /usd\(S\.Rhigh\.cost\)/.test(JS) && /int\(Math\.abs\(bugR\.balance\)\)/.test(JS) && /maxChecks\(1000\)/.test(JS), "view: numbers come from the model");
  ok(/Still to do: /.test(JS) && /Checks used: /.test(JS) && /aria-live/.test(JS) && /role: "log"/.test(JS), "view: progress is said and announced; the terminal is a live log");
  ok(/data-k/.test(JS) && /f\.focus\(\)/.test(JS), "view: the notebook keeps keyboard focus when it redraws");
  ok(/LX\.demo\(root/.test(JS) && /finish\[k\]/.test(JS), "view: demo hook for mid and step-N");
  ok(/Reproduced is not the same as right/.test(JS), "view: a clean rerun is not called proof of correctness");
  // scope: no repository or notebook-host links, no excluded wording, links only to learn pages, eia.gov and doi.org
  const own = QMD.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?<!-- learn:\1:end -->/g, "");   // the generated blocks carry the step links, licences and mailto
  const hrefs = [...own.matchAll(/href="([^"]+)"/g)].map(m => m[1]).concat([...own.matchAll(/\]\(([^)]+)\)/g)].map(m => m[1]));
  ok(hrefs.length > 0 && hrefs.every(h => /^[a-z0-9-]+\.html(#.*)?$/.test(h) || /^https:\/\/(www\.)?eia\.gov\//.test(h) || /^https:\/\/doi\.org\//.test(h)), "scope: links only to learn pages, eia.gov and doi.org: " + hrefs.filter(h => !/^[a-z0-9-]+\.html/.test(h)).join(" "));
  ok(!/github\.com|colab|gitlab|git-scm|jupyter\.org/i.test(QMD + JS), "scope: no repository or documentation-site links");
  ok(!/nuclear|reactor|\bSMR\b|data cent|\bAI\b|Claude|ChatGPT|Copilot/i.test(QMD.replace(/<!--[\s\S]*?-->/g, "") + JS.replace(/^\s*\/\/.*$/gm, "").replace(/f\.nuclear\.mw/g, "")), "scope: no nuclear, data-center or production wording");
}

console.log(`k08-git-notebooks: ${checks - fails} of ${checks} checks passed`);
process.exit(fails ? 1 : 0);
