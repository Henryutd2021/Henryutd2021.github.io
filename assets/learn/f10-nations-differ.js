// f10-nations-differ.js — Lesson F10, "Why does every country's energy system look different?" (step cards, Foundations,
// D2, closed-form; wave W6, builder learn-w6-a, 2026-11-07).
//
// Data: data/f10-nations-differ.json (six real balances as their statistics offices published them, one data year each,
// with the rows, units and conversions; the conventions; the four lenses; the numbers to remember), data/prairieland.json
// (Prairieland's 2025 balance, read at run time, never retyped: primary energy, final and useful energy, its conventions,
// import dependence), data/regions.json (the regional cards the last step opens) and data/path.json (lesson links).
//
// The model is arithmetic on the published rows:
//   to PJ          each country's rows × its unit's PJ (UN IRES conventional factors; Brazil's tep from EPE's manual)
//   conventions    physical energy content (as published by all but China): nuclear = reactor heat, hydro, wind and solar
//                  = their electricity (TWh × 3.6); substitution: every TWh from nuclear, hydro, wind and solar × 3.6 ÷ η
//                  (η = 40% for the real countries, set for teaching; Prairieland's own fleet efficiency from its file);
//                  direct equivalent: every such TWh × 3.6. What is not electricity in a row (solar heat, imported power)
//                  stays as published. China publishes coal equivalent; its physical-content figures are the page's
//                  estimate (fossil fuels as published plus the four sources' TWh; NBS's unsplit "other energy" left out)
//   before meter   primary − final − non-energy use − international shipping fuel (conversion, own use, grid losses and
//                  statistical differences; boundaries differ by publisher, said on the page)
//   useful         an illustrative estimate: final energy by sector × Prairieland's sector efficiencies (its useful ÷ its
//                  final, by sector); official statistics stop at final energy. China: not drawn (its final energy counts
//                  electricity at the coal burned to make it)
//   lenses         import dependence (published, or net imports ÷ supply from the published rows), production at home,
//                  buildings' share of final energy, institutions (from the regional cards' survey)
// Every number on the page comes from these files; _tests/learn/test_f10-nations-differ.js recomputes them.
//
// Shared components: LX.StepCards, LX.Sankey, LX.Predict, LX.Toggle, LX.CompareTable, LX.lessonRefHTML, LX.demo.
(function () {
  "use strict";
  var KEY = "f10_nations_differ";
  var SECTORS = ["industry", "transport", "buildings", "other"];
  var PL_SECTOR = { industry: "industry", transport: "transport", buildings: "buildings", other: "agriculture" };

  // ---------------------------------------------------------------- pure (no DOM; exported for Node)
  function sum(a) { return a.reduce(function (s, v) { return s + v; }, 0); }
  function fmtN(v, d) { return Number(v).toLocaleString("en-US", { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
  function pct(v, d) { return fmtN(100 * v, d) + "%"; }
  function ejNum(pj) { var e = pj / 1000; return fmtN(e, e >= 10 ? 1 : 2); }
  function ej(pj) { return ejNum(pj) + " EJ"; }
  function rows(P, list) { return sum((list || []).map(function (r) { return r.charAt(0) === "-" ? -P[r.slice(1)] : P[r]; })); }
  function get(o, path) { return path.split(".").reduce(function (x, k) { return x[k]; }, o); }
  function nameOf(N) { return N.short || N.name; }
  function theName(N) { return (N.c && N.c.the ? "the " : "") + nameOf(N); }
  function poss(N) { var t = theName(N); return t + (/s$/.test(t) ? "'" : "'s"); }

  // a country's published rows, with Brazil's split of its remaining final uses by their published shares
  function pubOf(c) {
    var P = {}; Object.keys(c.pub || {}).forEach(function (k) { P[k] = c.pub[k]; });
    if (c.finalShares) {   // BEN: final energy use less transport, industry and homes = the energy sector, services and farms
      var fs = c.finalShares, rest = P[fs.of] - P.industry - P.transport - P.residential, tot = sum(fs.rest.map(function (k) { return fs.shares[k]; }));
      fs.rest.forEach(function (k) { P[k] = rest * fs.shares[k] / tot; });
    }
    return P;
  }
  // one real country, normalized to PJ
  function nation(D, c) {
    var k = D.units[c.unit].pj, P = pubOf(c), src = {}, N;
    if (c.coalEquivalent) {
      var ce = c.coalEquivalent, tot = ce.total * k;
      src = { coal: tot * ce.shares.coal, oil: tot * ce.shares.oil, gas: tot * ce.shares.gas,
              nuclear: c.twh.nuclear * D.pjPerTWh / D.nuclearHeatEff, hydro: c.twh.hydro * D.pjPerTWh, wind: c.twh.wind * D.pjPerTWh, solar: c.twh.solar * D.pjPerTWh };
      N = { src: src, other: 0, total: sum(Object.keys(src).map(function (s) { return src[s]; })), published: tot, final: null, finalTotal: null, nonEnergy: 0, bunkers: 0 };
    } else {
      Object.keys(c.primary).forEach(function (s) { src[s] = c.primary[s] * k; });
      var listed = sum(Object.keys(src).map(function (s) { return src[s]; })), total = c.total != null ? c.total * k : listed, other = total - listed;
      if (Math.abs(other) < 1e-6) other = 0;
      var fin = {}; SECTORS.forEach(function (s) { fin[s] = c.final[s] ? rows(P, c.final[s]) * k : 0; });
      N = { src: src, other: other, total: total, published: total, final: fin, finalTotal: sum(SECTORS.map(function (s) { return fin[s]; })),
            nonEnergy: rows(P, c.nonEnergy) * k, bunkers: rows(P, c.bunkers) * k };
    }
    N.key = c.key; N.name = c.name; N.short = c.short; N.year = c.year; N.card = c.card; N.c = c; N.P = P; N.k = k;
    N.twh = c.twh; N.subEff = D.subEff; N.noFinal = c.noFinal || null; N.negOther = c.negOther || null;
    // lenses
    var den = function (of) { return of === "total" ? c.total : of === "coalTotal" ? c.coalEquivalent.total : sum(Object.keys(c.primary).map(function (s) { return c.primary[s]; })); };
    N.importDep = c.importDep == null ? null : c.importDep.value != null ? c.importDep.value : rows(P, c.importDep.rows) / den(c.importDep.of);
    N.importKind = c.importDep ? c.importDep.kind : null;
    N.prodShare = c.production ? rows(P, c.production.rows) / den(c.production.of) : null;
    return N;
  }
  // Prairieland from its own file (every number read here at run time)
  function prairie(D, PL) {
    var b = PL.balance, m = D.prairieland.map, src = {};
    Object.keys(m.primary).forEach(function (s) { src[s] = sum(m.primary[s].map(function (p) { return get(b.primary, p); })); });
    var fin = {}, use = {};
    SECTORS.forEach(function (s) { var x = b.final[PL_SECTOR[s]] || {}; fin[s] = sum(Object.keys(x).map(function (q) { return x[q]; })); use[s] = b.useful.bySector[PL_SECTOR[s]] || 0; });
    var total = PL.nation.primaryPJ, listed = sum(Object.keys(src).map(function (s) { return src[s]; })), other = total - listed;
    if (Math.abs(other) < 1e-6) other = 0;
    var dep = PL.imports.dependence;
    return { key: D.prairieland.key, name: D.prairieland.name, year: String(b.year), card: null, fictional: PL.about.line, src: src, other: other, total: total, published: total,
             final: fin, finalTotal: sum(SECTORS.map(function (s) { return fin[s]; })), nonEnergy: 0, bunkers: 0, useful: use,
             twh: { nuclear: b.conventions.directEquivalent.nuclearPJ / D.pjPerTWh, hydro: src.hydro / D.pjPerTWh, wind: src.wind / D.pjPerTWh, solar: src.solar / D.pjPerTWh },
             subEff: b.conventions.substitutionEfficiency, noFinal: null, negOther: null,
             importDep: dep.share, importKind: "file", prodShare: (dep.primaryPJ - dep.netImportsPJ) / dep.primaryPJ, PL: PL };
  }
  function nations(D, PL) {
    var out = D.countries.map(function (c) { return nation(D, c); });
    if (PL) out.push(prairie(D, PL));
    return out;
  }
  function byKey(L, key) { return L.filter(function (n) { return n.key === key; })[0]; }
  // sector efficiencies for the useful-energy estimate: Prairieland's useful ÷ its final, by sector
  function effs(PL) {
    if (!PL) return null;
    var e = {}, b = PL.balance;
    SECTORS.forEach(function (s) { var x = b.final[PL_SECTOR[s]], f = sum(Object.keys(x).map(function (q) { return x[q]; })); e[s] = b.useful.bySector[PL_SECTOR[s]] / f; });
    return e;
  }
  function useful(N, E) {
    if (N.noFinal || !E) return null;
    var u = {};
    SECTORS.forEach(function (s) { u[s] = N.useful ? N.useful[s] : N.final[s] * E[s]; });
    var tot = sum(SECTORS.map(function (s) { return u[s]; }));
    return { bySector: u, total: tot, share: tot / N.finalTotal, ofPrimary: tot / N.total, estimate: !N.useful };
  }

  // primary energy under a convention: each node's value, the total and the shares
  function primaryAs(D, N, conv) {
    var eta = N.subEff, v = {}, per = D.pjPerTWh;
    Object.keys(N.src).forEach(function (s) {
      var t = N.twh && N.twh[s];
      if (t == null) { v[s] = N.src[s]; return; }
      var e = t * per;
      if (s === "nuclear") v[s] = conv === "pec" ? N.src.nuclear : conv === "de" ? e : e / eta;
      else v[s] = N.src[s] - e + (conv === "sub" ? e / eta : e);
    });
    var keys = Object.keys(v), total = sum(keys.map(function (s) { return v[s]; })) + N.other;
    var share = function (f) { return sum(keys.filter(function (s) { return f(D.nodes[s]); }).map(function (s) { return v[s]; })) / total; };
    return { v: v, total: total, other: N.other, fossil: share(function (n) { return n.fossil; }), elec: share(function (n) { return n.elec; }),
             renewable: share(function (n) { return n.renewable; }), eta: eta };
  }
  function largest(D, N) {   // the largest source (physical energy content), and the next
    var s = Object.keys(N.src).sort(function (a, b) { return N.src[b] - N.src[a]; });
    return { first: s[0], second: s[1], share: N.src[s[0]] / N.total, share2: N.src[s[1]] / N.total };
  }
  function srcLabel(D, s) { var t = D.nodes[s].say || D.nodes[s].label; return t.charAt(0).toLowerCase() + t.slice(1); }

  // ---------------------------------------------------------------- the Sankeys
  var HUB = "var(--lx-ink-2)", SECT = "var(--lx-tier-2)";
  function srcNodes(D, P) {
    var nodes = Object.keys(P.v).filter(function (s) { return P.v[s] > 0; }).map(function (s) { return { id: s, label: D.nodes[s].label, short: D.nodes[s].short, note: D.nodes[s].note, col: 0, color: D.nodes[s].color }; });
    if (P.other > 0) nodes.push({ id: "other", label: D.nodes.other.label, short: D.nodes.other.short, col: 0, color: D.nodes.other.color });
    return nodes;
  }
  function beforeOf(N, P) { return P.total - N.finalTotal - N.nonEnergy - N.bunkers; }
  // primary view: sources -> primary energy -> sectors, non-energy use, shipping fuel, exports and what is lost before the meter
  function primarySpec(D, N, conv) {
    var P = primaryAs(D, N, conv), nodes = srcNodes(D, P), links = [];
    nodes.forEach(function (n) { links.push({ from: n.id, to: "hub", value: n.id === "other" ? P.other : P.v[n.id] }); });
    nodes.push({ id: "hub", label: "Primary energy", short: "Primary", col: 1, color: HUB });
    if (!N.noFinal) {
      SECTORS.forEach(function (s) { if (N.final[s] > 0) { nodes.push({ id: "s_" + s, label: D.sectors[s].label, short: D.sectors[s].short, col: 2, color: SECT }); links.push({ from: "hub", to: "s_" + s, value: N.final[s] }); } });
      if (N.nonEnergy > 0) { nodes.push({ id: "nonenergy", label: "Non-energy use (feedstocks)", short: "Feedstocks", col: 2, color: "var(--lx-tier-4)" }); links.push({ from: "hub", to: "nonenergy", value: N.nonEnergy }); }
      if (N.bunkers > 0) { nodes.push({ id: "bunkers", label: "Fuel for international shipping", short: "Shipping fuel", col: 2, color: "var(--lx-ink-3)" }); links.push({ from: "hub", to: "bunkers", value: N.bunkers }); }
      if (P.other < 0) { nodes.push({ id: "exports", label: N.negOther || "Net exports", short: "Exports", col: 2, color: "var(--lx-ink-3)" }); links.push({ from: "hub", to: "exports", value: -P.other }); }
      nodes.push({ id: "before", label: "Lost or used before the meter", short: "Before the meter", col: 2, kind: "loss" });
      links.push({ from: "hub", to: "before", value: beforeOf(N, P) });
    }
    return { nodes: nodes, links: links };
  }
  // final view: final energy -> sectors; useful view: -> useful energy and what is lost at the point of use (estimates)
  function finalSpec(D, N, E, withUseful) {
    if (N.noFinal) return null;
    var nodes = [{ id: "final", label: "Final energy", short: "Final", col: 0, color: HUB }], links = [], U = withUseful ? useful(N, E) : null;
    SECTORS.forEach(function (s) {
      if (!(N.final[s] > 0)) return;
      nodes.push({ id: "s_" + s, label: D.sectors[s].label, short: D.sectors[s].short, col: 1, color: SECT });
      links.push({ from: "final", to: "s_" + s, value: N.final[s] });
      if (U) { links.push({ from: "s_" + s, to: "useful", value: U.bySector[s] }); links.push({ from: "s_" + s, to: "endloss", value: N.final[s] - U.bySector[s] }); }
    });
    if (U) {
      nodes.push({ id: "useful", label: U.estimate ? "Useful energy (estimate)" : "Useful energy", short: "Useful", col: 2, color: "var(--lx-good)" });
      nodes.push({ id: "endloss", label: U.estimate ? "Lost at the point of use (estimate)" : "Lost at the point of use", short: "Lost in use", col: 2, kind: "loss" });
    }
    return { nodes: nodes, links: links };
  }
  function balanceOf(spec) {   // in − out per node that has both
    var o = {}; spec.nodes.forEach(function (n) { o[n.id] = { inn: 0, out: 0 }; });
    spec.links.forEach(function (l) { o[l.from].out += l.value; o[l.to].inn += l.value; });
    return o;
  }

  // ---------------------------------------------------------------- the words the page shows (pure, tested)
  var STEPS = [
    "A country's year of energy, drawn as a [[sankey-diagram|Sankey diagram]]: sources on the left, the energy's uses on the right. This one hides its name. Whose 2025 energy is it?",
    "Now the names are on. Switch between the countries and tap any bar to read its flows. Compare at least three.",
    "[[primary-energy|Primary energy]] enters a country; [[final-energy|final energy]] is what its users buy; [[useful-energy|useful energy]] is the heat, motion and light they get. Switch between the three: where does most energy go missing?",
    "How should a reactor's or a wind farm's electricity count as primary energy? [[physical-energy-content|Physical energy content]] and [[substitution-method|substitution]] differ. Predict: count Norway's hydro as the fuel a thermal plant would burn.",
    "Why do the mixes differ? Turn on the lenses: [[import-dependence|import dependence]], resources, climate and institutions. Each adds a column. Turn on at least two.",
    "Each country sits in a region with its own institutions and research questions. Open the regional card of one country you compared."
  ];
  function mysteryQ(D, L) {
    var M = D.mystery, N = byKey(L, M.key), g = largest(D, N), fb = {};
    M.options.forEach(function (k) {
      var X = byKey(L, k), gx = largest(D, X);
      fb[k] = k === M.key ? "Yes: " + nameOf(N) + ". Its largest source is " + srcLabel(D, g.first) + ", " + pct(g.share) + " of its supply; " + srcLabel(D, g.second) + " comes next, " + pct(g.share2) + "."
        : "No: in " + theName(X) + " the largest source is " + srcLabel(D, gx.first) + " (" + pct(gx.share) + "). This one is " + nameOf(N) + ": " + srcLabel(D, g.first) + ", " + pct(g.share) + ".";
    });
    return { answer: M.key, feedback: fb, options: M.options.map(function (k) { return { value: k, label: nameOf(byKey(L, k)) }; }), nation: N };
  }
  function viewLine(D, N) {   // step 2's line under the Sankey
    var P = primaryAs(D, N, "pec"), g = largest(D, N);
    return "**" + N.name + ", " + N.year + "**: " + ejNum(P.total) + " [[exajoule|EJ]] of primary energy; " + srcLabel(D, g.first) + " the largest source (" + pct(g.share) + "); fossil fuels " + pct(P.fossil) + ".";
  }
  function largestSaw(D, L) {
    var by = {};
    L.forEach(function (N) { var f = largest(D, N).first; (by[f] = by[f] || []).push(theName(N)); });
    return "Largest source: " + Object.keys(by).map(function (s) { return srcLabel(D, s) + " for " + listAnd(by[s]); }).join("; ") + ". No two mixes are the same.";
  }
  function listAnd(a) { return a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1]; }
  var COMPARE_MIN = 3;
  function countLine(n) { return n >= COMPARE_MIN ? "Countries compared: " + n + "." : "Countries compared: " + n + " of at least " + COMPARE_MIN + "."; }
  function accountLine(D, N, E) {
    if (N.noFinal) return N.noFinal;
    var P = primaryAs(D, N, "pec"), U = useful(N, E);
    return "**" + nameOf(N) + "**: primary " + ej(P.total) + "; final " + ej(N.finalTotal) + " (" + pct(N.finalTotal / P.total) + " of primary); useful " + (U.estimate ? "about " : "") + ej(U.total) +
      " (" + pct(U.share) + " of final" + (U.estimate ? ", an estimate" : "") + ").";
  }
  function accountSaw(D, L, E) {
    var F = L.filter(function (N) { return !N.noFinal; });
    var bm = F.map(function (N) { return beforeOf(N, primaryAs(D, N, "pec")) / N.total; }), us = F.map(function (N) { return useful(N, E).share; });
    return "Before the meter " + pct(Math.min.apply(null, bm)) + " to " + pct(Math.max.apply(null, bm)) + " of primary energy is lost or used; then about " +
      pct(1 - Math.max.apply(null, us)) + " to " + pct(1 - Math.min.apply(null, us)) + " of final energy is lost at the point of use (an estimate).";
  }
  var USEFUL_NOTE = "Useful energy is not in official statistics: for the real countries it is an estimate, final energy by sector times Prairieland's sector efficiencies (illustrative).";
  var FINAL_NOTE = "Final energy here leaves out [[non-energy-use|non-energy use]] (feedstocks) and the energy industry's own use.";
  var BEFORE_NOTE = "\"Before the meter\" holds conversion losses, the energy industry's own use, grid losses and statistical differences; publishers draw these boundaries differently.";
  var Q_CONV = { options: [{ value: "falls", label: "It falls" }, { value: "same", label: "It stays about the same" }, { value: "rises", label: "It rises sharply" }] };
  function convQ(D, L) {
    var N = byKey(L, D.mystery.key), a = primaryAs(D, N, "pec"), b = primaryAs(D, N, "sub"), fb = {}, line = poss(N) + " renewable share is " + pct(a.renewable) + " by physical energy content and " + pct(b.renewable) + " by substitution at " + pct(b.eta) + ".";
    Q_CONV.options.forEach(function (o) { fb[o.value] = (o.value === "rises" ? "Yes: " : "No: ") + line; });
    return { answer: b.renewable - a.renewable > 0.1 ? "rises" : b.renewable > a.renewable ? "same" : "falls", feedback: fb };
  }
  function convRows(D, L) {   // nuclear, hydro, wind and solar's share of primary energy under each convention
    return L.map(function (N) { var r = { key: N.key, name: nameOf(N) }; D.conventions.forEach(function (cv) { r[cv.key] = primaryAs(D, N, cv.key).elec; }); return r; });
  }
  function convLine(D, N, conv) {
    var P = primaryAs(D, N, conv), cv = D.conventions.filter(function (x) { return x.key === conv; })[0];
    return "**" + cv.label + "**: " + poss(N) + " primary energy is " + ej(P.total) + "; nuclear, hydro, wind and solar " + pct(P.elec) + ", fossil fuels " + pct(P.fossil) + "." + (conv === "sub" ? " Assumed thermal efficiency " + pct(P.eta, P.eta === 0.4 ? 0 : 1) + "." : "");
  }
  function chinaLine(D, L) {
    var N = byKey(L, "cn"); if (!N) return "";
    var c = N.c, P = primaryAs(D, N, "pec");
    return "China publishes " + pct(c.coalEquivalent.shares.nonFossil, 1) + " for " + c.coalEquivalent.label + ", in coal equivalent, a kind of substitution; by physical energy content its nuclear, hydro, wind and solar come to about " + pct(P.elec, 1) + " (the page's estimate).";
  }
  var CONV_SAW = "Same plants, same year, different shares: never compare primary-energy shares from two sources without checking their method.";
  // the lenses
  function importText(N) {
    var v = N.importDep;
    if (v == null) return "not on the pages read";
    if (v >= 0) return pct(v) + " of its supply imported";
    return -v >= 1 ? "net exporter: net exports " + fmtN(-v, 1) + " times its own supply" : "net exporter: net exports " + pct(-v) + " of its supply";
  }
  function prodText(N) {
    var v = N.prodShare;
    if (v == null) return "";
    return v >= 2 ? "produces about " + fmtN(v, 0) + " times the energy it uses at home" : v >= 1 ? "produces " + pct(v) + " of the energy it uses" : "produces " + pct(v) + " of its supply at home";
  }
  function factText(N, f) {
    var num = rows(N.P, f.num), den = f.den[0] === "@total" ? N.c.total : rows(N.P, f.den);
    return f.label + ": " + pct(num / den) + " " + f.of + ".";
  }
  function resourcesText(D, N) {
    if (N.PL) return "Coal from Ridge County, with domestic oil and gas; " + prodText(N) + ".";
    var c = N.c, parts = c.resources ? [c.resources] : [];
    var p = prodText(N); if (p) parts.push(p.charAt(0).toUpperCase() + p.slice(1) + (c.production && c.production.split ? "; " + c.production.split : "") + ".");
    if (c.production && c.production.coal) parts.push("Coal and lignite: " + pct(N.P[c.production.coal] / N.P.production) + " of its production.");
    if (c.production && c.production.fossil) parts.push("Oil and gas: " + pct(N.P[c.production.fossil] / N.P.production) + " of its production.");
    if (N.P.coalShareOfProduction) parts.push("Raw coal: " + pct(N.P.coalShareOfProduction, 1) + " of its production.");
    (c.resFacts || []).forEach(function (f) { parts.push(factText(N, f)); });
    return parts.join(" ");
  }
  function climateText(N) {
    if (N.noFinal) return "not drawn: see step 3";
    var s = N.final.buildings / N.finalTotal, extra = N.key === "no" ? " (homes only: services sit in 'other')" : "";
    if (N.PL) {
      var dd = N.PL.regions.map(function (r) { return r.climate.hdd; });
      extra = "; heating degree days " + fmtN(Math.min.apply(null, dd)) + " to " + fmtN(Math.max.apply(null, dd)) + " by region";
    }
    return pct(s) + " of final energy goes to buildings" + extra;
  }
  function institutionsText(D, N) { return N.PL ? D.prairieland.institutions : N.c.institutions; }
  function lensCell(D, N, key) {
    return key === "imports" ? importText(N) : key === "resources" ? resourcesText(D, N) : key === "climate" ? climateText(N) : institutionsText(D, N);
  }
  var LENS_MIN = 2;
  var LENS_SAW = "No single lens explains a mix: Norway and the United States both produce more than they use, yet their mixes differ. Each lens lines up with part of the picture; none is the cause on its own.";
  function cardOf(R, id) { return R ? R.cards.filter(function (x) { return x.id === id; })[0] : null; }
  function cardLine(R, N) {
    var C = cardOf(R, N.card); if (!C) return null;
    var n = C.numbers[0], s = R.sources[n.src];
    return "**" + C.title + "**: " + C.structure[0] + " One key number: " + n.text.charAt(0).toLowerCase() + n.text.slice(1, -1) + " (" + s.publisher.split(",")[0] + ", " + s.date.split(";")[0] + ").";
  }

  // ---------------------------------------------------------------- blocks written into the page (by the test's --write)
  function esc(t) { return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }
  function richStatic(t) { return esc(t).replace(/\[\[([a-z0-9-]+)\|([^\]]+)\]\]/g, "<span class=\"lx-term\" data-term=\"$1\">$2</span>").replace(/\*\*(.+?)\*\*/g, "<b>$1</b>"); }
  function tableRows(D, L, E) {
    return L.map(function (N) {
      var a = primaryAs(D, N, "pec"), b = primaryAs(D, N, "sub"), U = useful(N, E);
      return { N: N, primary: a.total, fossil: a.fossil, renPec: a.renewable, renSub: b.renewable, final: N.noFinal ? null : N.finalTotal, fp: N.noFinal ? null : N.finalTotal / a.total, useful: U, imports: importText(N) };
    });
  }
  function staticFallback(D, L, E) {
    var T = tableRows(D, L, E), PLn = L.filter(function (N) { return N.PL; })[0];
    return "<p class=\"lx-eyebrow\">Seven energy systems, one data year each, in EJ (1 EJ = 1,000 PJ, about 278 TWh)</p>" +
      "<div class=\"lx-scroll-x\"><table class=\"lx-mini-table f10-fbt\"><thead><tr><th scope=\"col\">Country</th><th scope=\"col\">Year</th><th scope=\"col\">Primary energy</th><th scope=\"col\">Fossil share</th><th scope=\"col\">Renewable share: physical content / substitution</th><th scope=\"col\">Final energy</th><th scope=\"col\">Imports</th></tr></thead><tbody>" +
      T.map(function (r) { return "<tr><td>" + esc(r.N.name) + "</td><td>" + esc(r.N.year) + "</td><td>" + ej(r.primary) + (r.N.key === "cn" ? " (estimate)" : "") + "</td><td>" + pct(r.fossil) + "</td><td>" + pct(r.renPec) + " / " + pct(r.renSub) + "</td><td>" + (r.final == null ? "not comparable" : ej(r.final)) + "</td><td>" + esc(r.imports) + "</td></tr>"; }).join("") +
      "</tbody></table></div>" + (PLn ? "<p class=\"lx-hint\">" + esc(PLn.fictional) + "</p>" : "") +
      "<ul><li><b>Conventions.</b> " + esc(D.conventions.map(function (c) { return c.label + ": " + c.text; }).join(" ")) + "</li>" +
      "<li><b>China.</b> " + esc(chinaLine(D, L)) + "</li>" +
      "<li><b>Useful energy.</b> " + esc(USEFUL_NOTE) + "</li></ul>" +
      "<p class=\"lx-hint\">With JavaScript on, you guess a country from its mix, switch between countries and conventions, turn on four lenses and open the regional cards.</p>";
  }
  function ideasHTML(D, L, E) {
    var T = tableRows(D, L, E).filter(function (r) { return r.fp != null; }), fp = T.map(function (r) { return r.fp; });
    var no = byKey(L, "no"), a = primaryAs(D, no, "pec"), b = primaryAs(D, no, "sub");
    return "<dl class=\"lx-ideas\">" +
      "<dt>One picture per country</dt><dd>A national Sankey shows where energy comes from and where it goes; no two of these seven look alike.</dd>" +
      "<dt>Primary, final, useful</dt><dd>Final energy is " + pct(Math.min.apply(null, fp)) + " to " + pct(Math.max.apply(null, fp)) + " of primary energy here; useful energy is less again, and only an estimate.</dd>" +
      "<dt>Conventions</dt><dd>Norway's renewable share is " + pct(a.renewable) + " by physical energy content and " + pct(b.renewable) + " by substitution: the method moves the number.</dd>" +
      "<dt>Why mixes differ</dt><dd>Resources, imports, climate and institutions each line up with part of a mix; none explains it alone.</dd>" +
      "<dt>Regions</dt><dd>The regional cards set each country in its grid, its institutions and its open research questions.</dd></dl>";
  }
  function checkHTML(D, L, E) {
    var no = byKey(L, "no"), a = primaryAs(D, no, "pec"), b = primaryAs(D, no, "sub"), ind = byKey(L, "in"), iP = primaryAs(D, ind, "pec"), cn = byKey(L, "cn"), cP = primaryAs(D, cn, "pec");
    var F = L.filter(function (N) { return !N.noFinal && !N.PL; }), op = F.map(function (N) { return useful(N, E).ofPrimary; });   // the real countries
    var q = function (id, ans, text, ansText) { return "<div class=\"lx-qq\" data-id=\"" + id + "\" data-answer=\"" + ans + "\"><p class=\"lx-qtext\">Myth or fact? “" + text + "”</p><ul class=\"lx-choices\"><li data-value=\"myth\">Myth</li><li data-value=\"fact\">Fact</li></ul><details class=\"lx-answer\"><summary>Answer</summary><p>" + ansText + "</p></details></div>"; };
    var qq = function (id, ans, text, opts, ansText) { return "<div class=\"lx-qq\" data-id=\"" + id + "\" data-answer=\"" + ans + "\"><p class=\"lx-qtext\">" + text + "</p><ul class=\"lx-choices\">" + opts.map(function (o) { return "<li data-value=\"" + o[0] + "\">" + o[1] + "</li>"; }).join("") + "</ul><details class=\"lx-answer\"><summary>Answer</summary><p>" + ansText + "</p></details></div>"; };
    var per = D.pjPerTWh, eta = D.subEff, sub1 = per / eta;
    return "<div class=\"lx-myths\" data-quiz=\"f10-myth\">" +
      q("share", "myth", "A country's renewable share of primary energy is a single, fixed number.", "Myth. Norway's is " + pct(a.renewable) + " by physical energy content and " + pct(b.renewable) + " by substitution, for the same plants in the same year.") +
      q("exporter", "myth", "A country that produces more energy than it uses imports none.", "Myth. Norway produced " + fmtN(no.P.production) + " TWh in 2025 and still imported " + fmtN(no.P.imports) + " TWh, while exporting " + fmtN(no.P.exports) + " TWh.") +
      q("useful", "myth", "Most of a country's primary energy ends up as useful heat, motion and light.", "Myth, by this page's estimate: in the five real countries drawn here, about " + pct(Math.min.apply(null, op)) + " to " + pct(Math.max.apply(null, op)) + " of primary energy becomes useful energy.") +
      "</div><div class=\"lx-quiz\" data-quiz=\"f10\">" +
      qq("which", "a", "Which of the seven gets " + pct(iP.v.coal / iP.total) + " of its primary energy from coal and lignite and imports " + pct(ind.importDep) + " of its supply?", [["a", "India"], ["b", "The European Union"], ["c", "Brazil"]],
        "India (fiscal year " + esc(ind.year.replace(/^fiscal year /, "").replace(/ \(provisional\)$/, "")) + "): coal and lignite " + pct(iP.v.coal / iP.total) + "; net import dependency " + pct(ind.importDep, 2) + ", as MoSPI publishes it.") +
      qq("mult", "b", "By substitution at " + pct(eta) + " efficiency, 1 TWh of wind electricity (" + fmtN(per, 1) + " PJ) counts as how many PJ of primary energy?", [["a", fmtN(per, 1) + " PJ"], ["b", fmtN(sub1, 0) + " PJ"], ["c", fmtN(per / 0.33, 1) + " PJ"]],
        fmtN(per, 1) + " ÷ " + fmtN(eta, 2) + " = " + fmtN(sub1, 1) + " PJ: the fuel a thermal plant at " + pct(eta) + " would burn to make it, " + fmtN(1 / eta, 1) + " times the electricity.") +
      qq("dep", "a", "The EU's import dependency was " + pct(byKey(L, "eu").importDep, 1) + " in 2024. What does Eurostat divide by what?", [["a", "Net imports ÷ gross available energy"], ["b", "Imports ÷ production"], ["c", "Production ÷ gross available energy"]],
        "Net imports (imports less exports) ÷ gross available energy, the EU's primary energy.") +
      qq("china", "c", "China publishes " + pct(cn.c.coalEquivalent.shares.nonFossil, 1) + " for primary electricity and other energy, in coal equivalent. By physical energy content, nuclear, hydro, wind and solar come to about…", [["a", "the same"], ["b", "a little more"], ["c", "about half as much"]],
        "About " + pct(cP.elec, 1) + " (the page's estimate): coal equivalent counts each kWh as the coal a thermal plant would burn, so NBS's figure is " + fmtN(cnRatio(D, cn), 1) + " times the four sources' electricity (it also holds some other energy).") +
      "</div>";
  }
  function cnRatio(D, N) {   // NBS's coal-equivalent "primary electricity and other energy" ÷ the four sources' electricity
    var ce = N.c.coalEquivalent, t = N.twh;
    return ce.total * N.k * ce.shares.nonFossil / ((t.nuclear + t.hydro + t.wind + t.solar) * D.pjPerTWh);
  }
  function factsHTML(D) {
    return "<table class=\"lx-facts\"><thead><tr><th scope=\"col\">Number</th><th scope=\"col\">What it means</th><th scope=\"col\">Source</th></tr></thead><tbody>" +
      D.facts.map(function (f) { return "<tr><td class=\"n\">" + esc(f.n) + "</td><td>" + esc(f.what) + "</td><td class=\"s\">" + (f.url && f.url !== "no link" ? "<a href=\"" + esc(f.url) + "\">" + esc(f.source) + "</a>" : esc(f.source)) + " · " + esc(f.asof) + "</td></tr>"; }).join("") + "</tbody></table>";
  }
  function notesHTML(D) {
    return "<ul class=\"f10-notes\">" + D.countries.map(function (c) {
      return "<li><b>" + esc(c.name) + ", " + esc(c.year) + ".</b> " + esc(c.published) + " " + esc(c.notes.join(" ")) + "</li>";
    }).join("") + "</ul>";
  }
  var PL_SRC = ["dossier-card", "iea-faq", "owid-primary"];
  function srcItem(s) {
    var t = s.url && s.url !== "no link" ? "<a href=\"" + esc(s.url) + "\">" + esc(s.title) + "</a>" : esc(s.title) + " (no link)";
    return "<li>" + esc(s.publisher) + ". " + t + ". " + esc(s.date.charAt(0).toUpperCase() + s.date.slice(1)) + ". " + esc(s.where.charAt(0).toUpperCase() + s.where.slice(1)) + ".</li>";
  }
  function sourcesHTML(D, PL) {
    return "<p class=\"lx-hint\">The six balances, as published (one data year each):</p><ul>" + Object.keys(D.sources).map(function (k) { return srcItem(D.sources[k]); }).join("") + "</ul>" +
      (PL ? "<p class=\"lx-hint\">Prairieland (fictional; the course's shared national data), the parts used here:</p><ul>" + PL_SRC.map(function (k) { return srcItem(PL.sources[k]); }).join("") + "</ul>" : "");
  }

  var model = { SECTORS: SECTORS, nation: nation, prairie: prairie, nations: nations, byKey: byKey, effs: effs, useful: useful, primaryAs: primaryAs, largest: largest,
    primarySpec: primarySpec, finalSpec: finalSpec, balanceOf: balanceOf, beforeOf: beforeOf, pubOf: pubOf,
    STEPS: STEPS, mysteryQ: mysteryQ, viewLine: viewLine, largestSaw: largestSaw, COMPARE_MIN: COMPARE_MIN, countLine: countLine, accountLine: accountLine, accountSaw: accountSaw,
    USEFUL_NOTE: USEFUL_NOTE, BEFORE_NOTE: BEFORE_NOTE, FINAL_NOTE: FINAL_NOTE, Q_CONV: Q_CONV, convQ: convQ, convRows: convRows, convLine: convLine, chinaLine: chinaLine, CONV_SAW: CONV_SAW,
    importText: importText, prodText: prodText, resourcesText: resourcesText, climateText: climateText, institutionsText: institutionsText, lensCell: lensCell, LENS_MIN: LENS_MIN, LENS_SAW: LENS_SAW,
    cardOf: cardOf, cardLine: cardLine, tableRows: tableRows, staticFallback: staticFallback, ideasHTML: ideasHTML, checkHTML: checkHTML, factsHTML: factsHTML, notesHTML: notesHTML, sourcesHTML: sourcesHTML, PL_SRC: PL_SRC,
    cnRatio: cnRatio, fmtN: fmtN, pct: pct, ej: ej, ejNum: ejNum, richStatic: richStatic, nameOf: nameOf, theName: theName, poss: poss };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H;
  function bold(t) { return LX.rich(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>"); }

  LX.mount("f10", function (live, data, root) {
    var D = data[KEY], PL = data.prairieland || null, R = data.regions || null, Pth = data.path, demo = [];
    var L = nations(D, PL), E = effs(PL), last = { key: "us", view: "primary", conv: "pec", lenses: {} };
    var opts = { unit: "EJ", fmt: ejNum, textHead: ["From", "To", "EJ"], colNames: ["Sources", "Primary", "Uses"] };
    var UNIT_LEDE = "In [[exajoule|EJ]]: 1 EJ = 1,000 PJ, about 278 TWh.";
    function sankey(host, label, h) { return LX.Sankey(host, { label: label, lede: UNIT_LEDE, unit: opts.unit, fmt: opts.fmt, height: h || 340, heightN: 440, textHead: opts.textHead, colNames: opts.colNames }); }
    function fictional(host, N) { if (N && N.PL) H("p", { class: "lx-hint f10-fict", text: N.fictional }, host); }
    function seg(host, label, items, onPick) {
      var g = H("div", { class: "lx-seg f10-seg", role: "group", "aria-label": label }, host), b = {};
      items.forEach(function (it) { b[it.value] = H("button", { type: "button", text: it.label, "aria-pressed": "false" }, g); b[it.value].addEventListener("click", function () { onPick(it.value); }); });
      return { el: g, set: function (v) { Object.keys(b).forEach(function (k) { b[k].setAttribute("aria-pressed", String(k === v)); }); } };
    }
    var countryItems = L.map(function (N) { return { value: N.key, label: nameOf(N) }; });

    var steps = [
      { text: STEPS[0], build: function (act, api) {
          var Q = mysteryQ(D, L), sk = sankey(H("div", null, act), "A country's primary energy in 2025, by source and use, in EJ; the country is hidden");
          sk.set(primarySpec(D, Q.nation, "pec"));
          var pr = LX.Predict(act, { id: "f10-mystery", q: "Which country is it?", title: false, answer: Q.answer, options: Q.options, feedback: Q.feedback, onPick: function () { pr.reveal(); api.done(); } });
          if (pr.picked()) { pr.reveal(); api.done(); }
          demo[0] = function () { if (!pr.picked()) { var b = act.querySelector(".lx-choice"); if (b) b.click(); } };
        } },
      { text: STEPS[1], build: function (act, api) {
          var seen = {}, s = seg(act, "Country", countryItems, show), host = H("div", null, act);
          var sk = sankey(host, "Primary energy by source and use, in EJ, for the chosen country");
          var ln = H("p", { class: "lx-step-line", "aria-live": "polite" }, act), fict = H("div", null, act), cnt = H("p", { class: "lx-hint", "aria-live": "polite" }, act);
          function show(k) {
            seen[k] = true; last.key = k; s.set(k);
            var N = byKey(L, k); sk.set(primarySpec(D, N, "pec")); ln.innerHTML = bold(viewLine(D, N)); fict.innerHTML = ""; fictional(fict, N);
            var n = Object.keys(seen).length; cnt.textContent = countLine(n);
            if (n >= COMPARE_MIN) { api.done(); api.saw(largestSaw(D, L)); }
          }
          show(last.key);
          demo[1] = function () { ["us", "cn", "no"].forEach(show); };
        } },
      { text: STEPS[2], build: function (act, api) {
          var tried = {}, cs = seg(act, "Country", countryItems, function (k) { last.key = k; draw(); });
          var vs = seg(act, "Accounting", [{ value: "primary", label: "Primary" }, { value: "final", label: "Final" }, { value: "useful", label: "Useful" }], function (v) { last.view = v; tried[v] = true; draw(); });
          var host = H("div", null, act), sk = null, skView = null, msg = H("p", { class: "lx-hint" }, act);
          var ln = H("p", { class: "lx-step-line", "aria-live": "polite" }, act), note = H("p", { class: "lx-hint" }, act), fict = H("div", null, act);
          function draw() {
            var N = byKey(L, last.key); cs.set(last.key); vs.set(last.view);
            var spec = last.view === "primary" ? primarySpec(D, N, "pec") : finalSpec(D, N, E, last.view === "useful");
            host.hidden = !spec; msg.textContent = spec ? "" : N.noFinal;
            if (spec && skView !== last.view) {   // each view has its own columns (the phone key names them)
              host.innerHTML = ""; skView = last.view;
              sk = LX.Sankey(host, { label: "The chosen country's energy, from the chosen starting point, in EJ", lede: UNIT_LEDE, unit: "EJ", fmt: ejNum, height: 340, heightN: 440, textHead: opts.textHead,
                colNames: last.view === "primary" ? opts.colNames : last.view === "final" ? ["Final", "Sectors"] : ["Final", "Sectors", "Becomes"] });
            }
            if (spec) sk.set(spec);
            ln.innerHTML = bold(accountLine(D, N, E));
            note.innerHTML = LX.rich(last.view === "primary" ? BEFORE_NOTE : last.view === "useful" ? (N.PL ? N.PL.balance.useful.note : USEFUL_NOTE) : FINAL_NOTE);
            fict.innerHTML = ""; fictional(fict, N);
            if (tried.primary && tried.final && tried.useful) { api.done(); api.saw(accountSaw(D, L, E)); }
          }
          tried[last.view] = true; draw();
          demo[2] = function () { ["final", "useful", "primary"].forEach(function (v) { last.view = v; tried[v] = true; draw(); }); };
        } },
      { text: STEPS[3], build: function (act, api) {
          var Q = convQ(D, L), res = H("div", { class: "f10-res" }, act);
          var pr = LX.Predict(act, { id: "f10-conv", q: "Norway's renewable share, counted by substitution", title: false, answer: Q.answer, options: Q_CONV.options, feedback: Q.feedback, onPick: function () { show(); } });
          act.appendChild(res);
          var shown = false, pickAll = null;
          function show() {
            pr.reveal(); if (shown) return; shown = true;
            var tried = {}, s = seg(res, "Convention", D.conventions.map(function (c) { return { value: c.key, label: c.short }; }), pick);
            var who = H("p", { class: "lx-hint", "aria-live": "polite" }, res), ln = H("p", { class: "lx-step-line", "aria-live": "polite" }, res);
            var tbHost = H("div", { class: "lx-scroll-x" }, res);
            H("p", { class: "lx-hint", text: chinaLine(D, L) }, res);
            H("p", { class: "lx-hint", text: D.subEffNote }, res);
            function pick(cv) {
              last.conv = cv; tried[cv] = true; s.set(cv);
              var C = D.conventions.filter(function (x) { return x.key === cv; })[0];
              who.textContent = C.text + (C.who ? " Used by " + C.who + "." : " " + C.note);
              ln.innerHTML = bold(convLine(D, byKey(L, last.key), cv));
              tbHost.innerHTML = convTable(cv) + plLine();
              if (Object.keys(tried).length === D.conventions.length) { api.done(); api.saw(CONV_SAW); }
            }
            pick(last.conv);
            pickAll = function () { D.conventions.forEach(function (c) { pick(c.key); }); };
          }
          if (pr.picked()) show();
          demo[3] = function () { if (!pr.picked()) { var b = act.querySelectorAll(".lx-choice")[2]; if (b) b.click(); } else show(); if (pickAll) pickAll(); };
        } },
      { text: STEPS[4], build: function (act, api) {
          var tg = H("div", { class: "lx-toggles", role: "group", "aria-label": "Lenses on or off" }, act), host = H("div", null, act), ln = H("p", { class: "lx-hint", "aria-live": "polite" }, act), T = {};
          D.lenses.forEach(function (l) { T[l.key] = LX.Toggle(tg, { label: l.label, on: !!last.lenses[l.key], onChange: function (on) { last.lenses[l.key] = on; draw(); } }); });
          function draw() {
            var on = D.lenses.filter(function (l) { return last.lenses[l.key]; });
            host.innerHTML = lensTable(on);
            ln.innerHTML = on.map(function (l) { return "<b>" + LX.esc(l.label) + "</b>: " + LX.esc(l.text); }).join("<br>");
            if (on.length >= LENS_MIN) { api.done(); api.saw(LENS_SAW); }
          }
          draw();
          demo[4] = function () { ["imports", "resources"].forEach(function (k) { last.lenses[k] = true; T[k].set(true); }); draw(); };
        } },
      { text: STEPS[5], build: function (act, api) {
          var withCard = L.filter(function (N) { return cardOf(R, N.card); }), out = H("div", { class: "f10-card", "aria-live": "polite" }, act);
          var s = seg(act, "Regional card", withCard.map(function (N) { return { value: N.key, label: nameOf(N) }; }), open);
          act.insertBefore(s.el, out);
          function open(k) {
            s.set(k); var N = byKey(L, k), C = cardOf(R, N.card);
            out.innerHTML = "";
            H("p", { class: "lx-step-line", html: bold(cardLine(R, N)) }, out);
            H("a", { class: "lx-btn small", style: "justify-self:start", href: "regions.html#" + C.id, html: "Open the " + LX.esc(C.title) + " card" + LX.icon("arrow") }, out);
            api.done(); api.saw("Every card has the same six parts: system, institutions, challenges, research questions, key numbers with their sources, and the date they were read.");
          }
          H("a", { class: "lx-btn ghost small", style: "justify-self:start;margin-top:10px", href: "regions.html", html: "All twelve regional cards" + LX.icon("arrow") }, act);
          demo[5] = function () { open(withCard[0].key); };
        } }
    ];
    function convTable(cv) {
      var rowsC = convRows(D, L);
      return "<table class=\"lx-mini-table f10-conv\"><caption>Nuclear, hydro, wind and solar's share of primary energy</caption><thead><tr><th scope=\"col\">Country</th>" +
        D.conventions.map(function (c) { return "<th scope=\"col\"" + (c.key === cv ? " class=\"on\"" : "") + ">" + LX.esc(c.short) + "</th>"; }).join("") + "</tr></thead><tbody>" +
        rowsC.map(function (r) { return "<tr><th scope=\"row\">" + LX.esc(r.name) + (r.key === "cn" ? " (estimate)" : "") + "</th>" + D.conventions.map(function (c) { return "<td" + (c.key === cv ? " class=\"on\"" : "") + ">" + pct(r[c.key]) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table>";
    }
    function lensTable(on) {
      if (!on.length) return "<p class=\"lx-hint\">Turn on a lens to add its column.</p>";
      return "<table class=\"cf-two f10-lens\"><thead><tr><th scope=\"col\">Country</th>" + on.map(function (l) { return "<th scope=\"col\">" + LX.esc(l.label) + "</th>"; }).join("") + "</tr></thead><tbody>" +
        L.map(function (N) { return "<tr><th scope=\"row\">" + LX.esc(nameOf(N)) + "</th>" + on.map(function (l) { return "<td data-l=\"" + LX.esc(l.label) + "\">" + LX.esc(lensCell(D, N, l.key)) + "</td>"; }).join("") + "</tr>"; }).join("") +
        "</tbody></table>" + (PL ? "<p class=\"lx-hint\">" + LX.esc(PL.about.line) + "</p>" : "");
    }
    function plLine() { return PL ? "<p class=\"lx-hint\">" + LX.esc(PL.about.line) + "</p>" : ""; }
    var cards = LX.StepCards(live, { id: "f10-steps", steps: steps });

    // ---------------------------------------------------------------- the explain layer
    var xhost = document.getElementById("f10-explain");
    function buildExplain() {
      if (!xhost) return;
      xhost.innerHTML = ""; xhost.classList.add("is-live");
      var c1 = H("div", { class: "lx-xcard" }, xhost), N = byKey(L, "us");
      H("h3", { text: "Reading a national Sankey" }, c1);
      sankey(c1, "The United States' primary energy in 2025, by source and use, in EJ", 320).set(primarySpec(D, N, "pec"));
      var ol = H("ol", { class: "f10-guide" }, c1);
      ["Each band's width is its energy: one scale for the whole drawing, so widths compare within a country.",
       "Left: sources as primary energy. Middle: the country's whole supply. Right: final energy by sector, feedstocks, and what goes before the meter.",
       "Each country is drawn to its own scale: compare countries by shares and by the totals, not by band widths."].forEach(function (t) { H("li", { text: t }, ol); });
      var T = tableRows(D, L, E);
      LX.CompareTable(H("div", { class: "lx-xcard" }, xhost), { title: "Seven energy systems side by side", text: true,
        columns: [{ key: "name", label: "Country and data year", main: true }, { key: "primary", label: "Primary energy" }, { key: "fossil", label: "Fossil share" }, { key: "ren", label: "Renewable share (physical content / substitution)" }, { key: "fp", label: "Final ÷ primary" }, { key: "imp", label: "Imports" }],
        rows: T.map(function (r) { return { key: r.N.key, color: r.N.PL ? "var(--lx-tier-1)" : "var(--lx-tier-2)", name: r.N.name, note: r.N.year, primary: ej(r.primary) + (r.N.key === "cn" ? " (estimate)" : ""), fossil: pct(r.fossil), ren: pct(r.renPec) + " / " + pct(r.renSub), fp: r.fp == null ? "not comparable" : pct(r.fp), imp: r.imports }; }),
        sorts: [{ label: "As listed", order: T.map(function (r) { return r.N.key; }) },
                { label: "By fossil share", order: T.slice().sort(function (a, b) { return b.fossil - a.fossil; }).map(function (r) { return r.N.key; }), ranked: true, note: "Fossil share of primary energy, by physical energy content (China: the page's estimate)." }] });
      var nx = H("div", { class: "lx-xcard" }, xhost);
      H("h3", { text: "Where this goes next" }, nx);
      var ul = H("ul", { class: "f10-next" }, nx);
      [["A20", "why national scenarios disagree"], ["A21", "what makes a nation's energy secure"], ["M13", "a nation's pathway as a model"], ["X3", "how fast past transitions were"], ["X2", "gas, coal and oil systems in a transition"]]
        .forEach(function (x) { H("li", { html: LX.lessonRefHTML(Pth, x[0]) + ": " + LX.esc(x[1]) + "." }, ul); });
      H("li", { html: "<a href=\"regions.html\">The twelve regional cards</a>: each region's system, institutions and open questions." }, ul);
      if (PL) H("p", { class: "lx-hint", text: PL.about.line }, nx);
    }
    buildExplain();
    // Go deeper: Prairieland in full (its own file's Sankey: refinery, power plants, carriers, sectors, useful energy)
    var full = document.getElementById("f10-pl-full");
    if (full && PL) {
      full.innerHTML = "";
      var sp = PL.balance.sankey;
      LX.Sankey(full, { label: "Prairieland's 2025 energy in full, in PJ", unit: "PJ", badges: true,   // six columns: numbered badges and a key at every width, so no label crosses a column fmt: function (v) { return fmtN(v); }, height: 380, heightN: 460, textHead: ["From", "To", "PJ"],
        colNames: ["Sources", "Primary", "Conversion", "Carriers", "Sectors", "Becomes"] }).set({ nodes: sp.nodes.map(function (n) { return { id: n.id, label: n.label, short: n.short, col: n.col, kind: n.kind === "loss" ? "loss" : n.kind, color: n.kind === "loss" ? null : "var(--lx-ink-2)" }; }), links: sp.links });
      H("p", { class: "lx-hint", text: PL.about.line + " " + sp.note }, full);
    }

    LX.demo(root, function (state) {
      var n = state === "mid" ? 2 : +((/^step-(\d+)$/.exec(state) || [])[1] || 0); if (!n) return null;
      var k = Math.max(0, Math.min(steps.length - 1, n - 1));
      cards.go(k); if (demo[k]) demo[k]();
      return { view: "step " + (k + 1) };
    }, cards);
    root.lxLesson = { model: model, D: D, L: L, cards: cards };
  });
})();
