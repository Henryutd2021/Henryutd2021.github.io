// plains_face.js — shared by test_a12-policy-instruments.js and test_m06-carbon-in-models.js (not a test itself).
// Loads the Plains Grid's planning LP (assets/learn/components/plainsplan.js, M6's and A12's) with the vendored HiGHS, and proves that a
// reported number is the same for every best plan: it minimizes and maximizes that number over the LP's optimal face (the
// LP as the pages solve it, with no tie-breaking costs, its cost held within `tol` dollars of the optimum).
//   const F = await require("./plains_face.js")();   // { PP, Y, solve, run(o), face(o, quantities, tol), A, M, year, T }
//   quantities: { name: { terms: {var: coef}, tol } }   built by F.q(...) helpers: co2, gas, clean, builds
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
module.exports = async function () {
  const sctx = { window: { LX: {} }, module: { exports: {} }, performance };
  vm.runInNewContext(fs.readFileSync(L("components/solver.js"), "utf8"), sctx);
  const { core, VERSION } = sctx.module.exports;
  const pctx = { window: { LX: {} }, module: { exports: {} } };
  vm.runInNewContext(fs.readFileSync(L("components/profiles.js"), "utf8"), pctx);
  const PR = pctx.module.exports;
  const J = p => JSON.parse(fs.readFileSync(L("data/" + p), "utf8"));
  const PP = require(L("components/plainsplan.js"));
  const A = J("a10-emissions-questions.json"), M = J("m06-carbon-in-models.json"), year = J("town_year.json"), T = J("cf_targets.json");
  const highs = await require(L(`vendor/highs-${VERSION}/highs.js`))();
  const solve = m => core.solveWith(highs, m, { timeLimit: 120 });
  const Y = PP.prepare(A.plains, M, year, T, PR.townProfile);
  const run = o => { const m = PP.build(Y, o), r = solve(m); return { m, r, R: PP.read(Y, o, r) }; };
  // the reported quantities as linear functions of the LP's variables
  function quantities(o) {
    const G = Y.G, q = { co2: {}, cc: {}, ct: {}, clean: {}, newClean: {} };
    Y.days.forEach((d, k) => { for (let t = 0; t < 24; t++) { const j = k * 24 + t, w = d.weight;
      q.co2["cc" + j] = w * G.cc.rate; q.co2["ct" + j] = w * G.ct.rate; q.cc["cc" + j] = w; q.ct["ct" + j] = w;
      ["we", "se", "wn", "sn"].concat(o && o.buy ? ["wb", "sb"] : []).forEach(v => { q.clean[v + j] = w; });
      ["wn", "sn"].concat(o && o.buy ? ["wb", "sb"] : []).forEach(v => { q.newClean[v + j] = w; });
      q.un = q.un || {}; q.un["un" + j] = w; } });
    const out = { co2: [q.co2, 1], cc: [q.cc, 1], ct: [q.ct, 1], clean: [q.clean, 1], newClean: [q.newClean, 1], un: [q.un, 0.5],
      Wn: [{ Wn: 1 }, 0.05], Sn: [{ Sn: 1 }, 0.05], Bn: [{ Bn: 1 }, 0.05] };
    if (o && o.buy) { out.Wb = [{ Wb: 1 }, 0.05]; out.Sb = [{ Sb: 1 }, 0.05]; out.Bb = [{ Bb: 1 }, 0.05]; out.Wall = [{ Wn: 1, Wb: 1 }, 0.05]; out.Sall = [{ Sn: 1, Sb: 1 }, 0.05]; }
    return out;
  }
  // min and max of each quantity over the optimal face of the LP without hair costs; returns { name: [lo, hi] } and fails
  function face(o, names, tol) {
    const oo = Object.assign({}, o, { tie: false }), m0 = PP.build(Y, oo), r0 = solve(m0);
    if (!r0.ok) return { error: r0.status };
    const cost = {}; m0.variables.forEach(v => { if (v.cost) cost[v.name] = v.cost; });
    const Q = quantities(o), out = { opt: r0.objective };
    (names || Object.keys(Q)).forEach(n => {
      const [terms] = Q[n], res = [];
      [1, -1].forEach(s => {
        const m = { sense: "min", variables: m0.variables.map(v => Object.assign({}, v, { cost: s * (terms[v.name] || 0) })),
          constraints: m0.constraints.concat([{ name: "face", terms: cost, le: r0.objective + (tol == null ? 1 : tol) }]) };
        const r = solve(m); res.push(r.ok ? s * r.objective : NaN);
      });
      out[n] = [res[0], res[1]];
    });
    return out;
  }
  // the quantity's tolerance: the spread allowed for "the same for every best plan"
  function tolOf(o, n) { return quantities(o)[n][1]; }
  return { PP, Y, solve, run, face, tolOf, A, M, year, T, PR, SITE };
};
