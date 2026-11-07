// a21-security-minerals.js — Lesson A21, "What makes a nation's energy secure? Imports, minerals, supply chains and
// factories" (step cards, Analyst, D3; wave W6, 2026-11-07, builder learn-w6-b).
//
// Data: assets/learn/data/prairieland.json (imports, stocks, minerals, the battery factory, the shocks, fuel prices, GDP,
// primary energy and its conventions, the real-world numbers; read, never retyped), assets/learn/data/a21-security-minerals.json
// (the levers' ranges, each stress test's assumptions, the thresholds, the lever sort, the USGS context) and path.json.
//
// Model (closed form; no optimization):
//   import dependence = net imports / primary energy (Eurostat's indicator; here gross available energy = primary energy);
//     by fuel: imports / that fuel's primary energy; through the strait: (oil imports x share + LNG x share) / primary
//   concentration: HHI = sum of (100 x share)^2, 0 to 10,000; a cap on any one refiner moves the excess to the others in
//     proportion to their shares (repeated until no share is above the cap)
//   LNG price spike (a year): extra paid abroad = LNG bought x LNG price x (multiplier - 1); extra at home = domestic gas x
//     gas price x (multiplier - 1), a transfer from gas users to domestic producers; a cut in gas use comes off LNG first
//   strait closure: oil lost = oil imports x through-strait share x days / 365; stocks = days of net imports x imports / 365;
//     restraint saves that share of the crude used over the closure; gap = lost - stocks - saving (at least 0); LNG lost =
//     LNG x its through-strait share x days / 365 against gas storage (a share of a year's gas use, half full)
//   export restriction (L years): each mineral's supply share a = r + (1 - r)(1 - s_R) (r recycled, s_R the stopped
//     refiner's share after any cap); over L years the factory can make q = min over minerals of min(1, (L a + days/365)/L)
//     of its output; lost = output x L x (1 - q)
//   factory fire (m months): lost = m/12 x max(0, output - capacity x split) (a second site with that share of capacity runs
//     up to full); job-years with no work at the burned site = jobs x (1 - split) x m/12
//   stress board: the shocks on or off, with the reader's levers or the 2025 settings; a restriction and a fire in the same
//     two years overlap: the factory loses the larger of the two
// Every number on the page comes from this model or the two data files; _tests/learn/test_a21-security-minerals.js checks
// them over every input.
//
// Shared components: LX.StepCards, LX.Predict, LX.NumAnswer, LX.Slider, LX.Toggle, LX.Ledger, LX.CardSort (toggles),
// LX.ConceptMap, LX.CompareTable, LX.CausalChain, LX.Boundary. Lesson-local: the supply rows (a21-rows).
(function () {
  "use strict";
  var KEY = "a21_security_minerals";

  // ---------------------------------------------------------------- the pure model (no DOM; exported for Node)
  function list(w) { return w.length < 2 ? w.join("") : w.slice(0, -1).join(", ") + " and " + w[w.length - 1]; }
  function shockOf(PL, key) { return PL.shocks.filter(function (s) { return s.key === key; })[0]; }
  function lever(PL, D, k) {
    var L = D.levers[k], st = L.start;
    if (st === "shock") st = shockOf(PL, "straitClosure").params.weeks;
    if (st === "data") st = k === "stockDays" ? PL.imports.oil.stocksDays : k === "recycled" ? 100 * PL.factories.battery.recycledShare : PL.factories.battery.mineralStockDays;
    return { min: L.min, max: L.max, step: L.step, start: st, unit: L.unit, what: L.what };
  }
  function defaults(PL, D) { var S = {}; Object.keys(D.levers).forEach(function (k) { S[k] = lever(PL, D, k).start; }); return S; }
  function dependence(PL, conv) {
    var I = PL.imports, B = PL.balance, prim = conv === "substitution" ? B.conventions.substitution.primaryPJ : B.conventions.physicalContent.primaryPJ;
    var oilP = B.primary.oil.imported + B.primary.oil.domestic, gasP = B.primary.gas.lng + B.primary.gas.domestic;
    var strait = I.oil.importPJ * I.oil.throughStraitShare + I.lng.importPJ * I.lng.throughStraitShare;
    return { primary: prim, net: I.dependence.netImportsPJ, total: I.dependence.netImportsPJ / prim, oil: I.oil.importPJ / oilP, gas: I.lng.importPJ / gasP, coal: I.coal.importShare,
      straitPJ: strait, strait: strait / prim, oilPJ: oilP, gasPJ: gasP, coalPJ: B.primary.coal };
  }
  function hhi(shares) { return shares.reduce(function (s, x) { return s + Math.pow(100 * x, 2); }, 0); }
  // cap every share at `cap`: the capped suppliers hold exactly the cap; the rest of the supply is shared by the others in
  // proportion to their original shares; repeat while one of them would go above the cap (exact, at most n rounds)
  function capShares(shares, cap) {
    var n = shares.length, capped = shares.map(function () { return false; }), s = shares.slice();
    for (var it = 0; it < n; it++) {
      var k = capped.filter(Boolean).length, rest = 1 - cap * k, free = shares.reduce(function (a, x, i) { return capped[i] ? a : a + x; }, 0), more = false;
      s = shares.map(function (x, i) { return capped[i] ? cap : x * rest / free; });
      s.forEach(function (x, i) { if (!capped[i] && x > cap + 1e-12) { capped[i] = true; more = true; } });
      if (!more) break;
    }
    return s;
  }
  function minerals(PL, cap) {
    var M = PL.imports.minerals;
    return Object.keys(M.items).map(function (k) {
      var it = M.items[k], sh = cap == null ? it.shares.slice() : capShares(it.shares, cap / 100);
      return { key: k, label: it.label, shares: sh, hhi: hhi(sh), lead: Math.max.apply(null, sh), leadIdx: sh.indexOf(Math.max.apply(null, sh)), t: PL.factories.battery.mineralsT[k], tPerGWh: it.tPerGWh };
    });
  }
  function spike(PL, cut) {
    var sh = shockOf(PL, "gasSpike").params, F = PL.costs.fuels, B = PL.balance.primary.gas;
    var use = (B.lng + B.domestic) * (1 - cut / 100), dom = Math.min(B.domestic, use), lng = use - dom;
    var abroad = lng * F.lng.def * (sh.lngX - 1) / 1000, home = dom * F.gas.def * (sh.gasX - 1) / 1000;   // $bn (PJ x $/GJ = $M)
    return { use: use, dom: dom, lng: lng, abroad: abroad, home: home, total: abroad + home, gdp: (abroad + home) / PL.nation.gdpBillionUSD, lngX: sh.lngX, gasX: sh.gasX, lngPrice: F.lng.def, gasPrice: F.gas.def };
  }
  function closure(PL, D, o) {
    var I = PL.imports, days = o.weeks * 7, crude = PL.balance.primary.oil.imported + PL.balance.primary.oil.domestic;
    var oilLost = I.oil.importPJ * I.oil.throughStraitShare * days / 365, stocks = o.stockDays * I.oil.importPJ / 365, saving = o.restraint / 100 * crude * days / 365;
    var gap = Math.max(0, oilLost - stocks - saving), left = Math.max(0, stocks + saving - oilLost);
    var daily = (I.oil.importPJ * I.oil.throughStraitShare - o.restraint / 100 * crude) / 365, lastDays = daily > 0 ? stocks / daily : Infinity;
    var gasYear = PL.balance.primary.gas.lng + PL.balance.primary.gas.domestic, lngLost = I.lng.importPJ * I.lng.throughStraitShare * days / 365;
    var gasAvail = I.lng.storageShareOfYear * gasYear * D.assume.gasStorageFull, gasGap = Math.max(0, lngLost - gasAvail);
    return { days: days, oilLost: oilLost, stocks: stocks, saving: saving, gap: gap, left: left, lastDays: lastDays, covered: gap <= 1e-9, lngLost: lngLost, gasAvail: gasAvail, gasGap: gasGap, lost: oilLost + lngLost };
  }
  function ban(PL, o) {
    var sh = shockOf(PL, "mineralBan").params, Fb = PL.factories.battery, L = sh.years, r = o.recycled / 100, R = sh.supplier;
    var rows = minerals(PL, o.cap).map(function (m) {
      var a = r + (1 - r) * (1 - m.shares[R]), q = Math.min(1, (L * a + o.mineralDays / 365) / L);
      return { key: m.key, label: m.label, sR: m.shares[R], a: a, q: q, hhi: m.hhi };
    });
    var q = Math.min.apply(null, rows.map(function (x) { return x.q; })), binds = rows.filter(function (x) { return x.q <= q + 1e-12; }), bind = rows.filter(function (x) { return x.q === q; })[0];
    return { years: L, rows: rows, q: q, bind: bind, binds: binds, bindWords: list(binds.map(function (x) { return x.label.toLowerCase(); })), made: Fb.output2025GWh * L * q, lost: Fb.output2025GWh * L * (1 - q), output: Fb.output2025GWh * L, capexX: sh.batteryCapexX };
  }
  function fire(PL, o) {
    var sh = shockOf(PL, "factoryFire").params, Fb = PL.factories.battery, f = sh.months / 12, s = o.split / 100;
    var lost = f * Math.max(0, Fb.output2025GWh - Fb.capacityGWh * s);
    return { months: sh.months, lost: lost, premium: sh.importPremium, jobYears: Fb.jobs * (1 - s) * f, cover: f * Math.min(Fb.output2025GWh, Fb.capacityGWh * s) };
  }
  // the stress board: on = {spike, closure, ban, fire}; S = the levers (the reader's, or the 2025 settings)
  function board(PL, D, on, S) {
    var sp = spike(PL, S.gasCut), cl = closure(PL, D, S), bn = ban(PL, S), fr = fire(PL, S);
    var banLost = on.ban ? bn.lost : 0, fireLost = on.fire ? fr.lost : 0;
    return { oilGap: on.closure ? cl.gap : 0, gasGap: on.closure ? cl.gasGap : 0, abroad: on.spike ? sp.abroad : 0, home: on.spike ? sp.home : 0,
      cellsLost: Math.max(banLost, fireLost), cellsSum: banLost + fireLost, overlap: on.ban && on.fire, jobYears: on.fire ? fr.jobYears : 0, sp: sp, cl: cl, bn: bn, fr: fr };
  }

  // ---------------------------------------------------------------- formats and words (pure)
  function fmtN(v, d) { return Number(v).toLocaleString("en-US", { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
  function pct(v, d) { return fmtN(100 * v, d == null ? 0 : d) + "%"; }
  function pj(v) { return fmtN(v, 1) + " PJ"; }
  function bn(v) { return "$" + fmtN(v, 2) + " billion"; }
  function gwh(v) { return fmtN(v, 1) + " GWh"; }
  function refiner(PL, i) { return PL.imports.minerals.suppliers[i].replace(/ \(.*\)$/, ""); }
  var PREDICT = {
    q: "Suppose Prairieland stopped importing energy altogether. Would it then be secure?",
    answer: "no",
    options: [{ value: "yes", label: "Yes: nothing left to cut off" }, { value: "no", label: "No: risk also sits in prices, routes, suppliers and single sites" }, { value: "demand", label: "Only if it also used less energy" }],
    feedback: {
      yes: "Coal is all domestic, yet it comes from one county; prices are set on world markets; batteries need imported minerals.",
      no: "Imports are one risk among several: world prices, a single route, a dominant supplier and a single factory.",
      demand: "Using less helps against price spikes, but a single route, supplier or factory can still fail."
    }
  };
  function depLine(PL, conv) {
    var d = dependence(PL, conv);
    return "Net imports " + fmtN(d.net, 0) + " PJ ÷ primary energy " + fmtN(d.primary, 1) + " PJ = **" + pct(d.total, 1) + "** import dependence" + (conv === "substitution" ? ", counting non-fossil electricity by the substitution method." : ".");
  }
  function depSaw(PL) {
    var a = dependence(PL, "physical"), b = dependence(PL, "substitution");
    return "Same imports, another denominator: " + pct(a.total, 1) + " or " + pct(b.total, 1) + ". Say which convention a dependence figure uses, as for any primary-energy share.";
  }
  function straitAnswer(PL) { var d = dependence(PL); return Math.round(1000 * d.strait) / 10; }
  function straitSaw(PL) {
    var d = dependence(PL), I = PL.imports;
    return fmtN(I.oil.importPJ * I.oil.throughStraitShare, 0) + " PJ of crude and " + fmtN(I.lng.importPJ * I.lng.throughStraitShare, 0) + " PJ of LNG pass one strait: " + fmtN(d.straitPJ, 0) + " ÷ " + fmtN(d.primary, 0) + " = **" + pct(d.strait, 1) + "** of primary energy on one route.";
  }
  function hhiLine(PL, D, cap) {
    var M = minerals(PL, cap), hi = M.filter(function (m) { return m.hhi > D.thresholds.hhiHigh; }).length, over = M.filter(function (m) { return m.lead > D.thresholds.oneCountry + 1e-9; }).length;
    return "With no refiner above " + fmtN(cap) + "%: HHI from **" + fmtN(Math.min.apply(null, M.map(function (m) { return m.hhi; }))) + "** to **" + fmtN(Math.max.apply(null, M.map(function (m) { return m.hhi; }))) + "**; " + hi + " of " + M.length + " above " + fmtN(D.thresholds.hhiHigh) + ", " + over + " with one refiner above " + pct(D.thresholds.oneCountry) + ".";
  }
  function hhiSaw(PL, D, cap) {
    var n = PL.imports.minerals.suppliers.length, floor = 10000 / n;
    return "Shares are squared, so capping the largest one cuts the HHI fastest; with " + n + " refiners it cannot fall below " + fmtN(floor) + (floor > D.thresholds.hhiHigh ? ", above the " + fmtN(D.thresholds.hhiHigh) + " line" : "") + ". An HHI measures concentration, not intent.";
  }
  function spikeLine(PL, cut) {
    var s = spike(PL, cut);
    return "LNG at " + fmtN(s.lngX, 0) + "× and domestic gas at " + fmtN(s.gasX, 1) + "× for a year: **" + bn(s.abroad) + "** more paid abroad and " + bn(s.home) + " moved at home, " + pct(s.gdp, 2) + " of GDP in all.";
  }
  function spikeSaw(PL, cut) {
    var s = spike(PL, cut);
    if (s.lng <= 1e-9) return "With gas use cut this far, no LNG is bought: only the domestic price rise remains, a transfer from gas users to producers inside Prairieland.";
    return "Whose number: the " + bn(s.abroad) + " leaves the country, while the " + bn(s.home) + " moves from gas users to domestic producers, a transfer. Storage and more LNG sellers do not help against a year-long world price.";
  }
  function closureLine(PL, D, o) {
    var c = closure(PL, D, o);
    return o.weeks + " weeks closed: " + pj(c.oilLost) + " of crude lost; stocks " + pj(c.stocks) + (c.saving > 0 ? " and restraint " + pj(c.saving) : "") + (c.covered ? ": covered, " + pj(c.left) + " to spare." : ": **" + pj(c.gap) + " short**.");
  }
  function closureSaw(PL, D, o) {
    var c = closure(PL, D, o), gas = c.gasGap > 1e-9 ? " Gas storage falls " + pj(c.gasGap) + " short of the lost LNG." : " Half-full gas storage covers the " + pj(c.lngLost) + " of LNG lost.";
    return (c.covered ? "The stocks bridge this closure." : isFinite(c.lastDays) ? "The stocks last about " + fmtN(Math.floor(c.lastDays)) + " days of the " + c.days + " days closed." : "Restraint alone covers the lost crude.") + gas;
  }
  function banLine(PL, o) {
    var b = ban(PL, o);
    var head = refiner(PL, shockOf(PL, "mineralBan").params.supplier) + " stops for " + b.years + " years: the factory can make **" + pct(b.q) + "** of its output, " + gwh(b.made) + " of " + gwh(b.output);
    return head + (b.q >= 1 ? "; no mineral runs short." : b.binds.length > 1 ? "; " + b.bindWords + " run short together." : "; the first to run short is " + b.bindWords + ".");
  }
  function banSaw(PL, o) {
    var b = ban(PL, o);
    if (b.q >= 1) return "With these levers, the factory runs at its 2025 output through the whole restriction.";
    if (b.binds.length > 1) return "The scarcest minerals set the output: " + b.bindWords + " each cover " + pct(b.bind.a) + " of the need from others and recycling. Raise all of them, or none helps.";
    return "The scarcest mineral sets the output: " + b.bindWords + " covers " + pct(b.bind.a) + " of the need from others and recycling. Diversify, recycle or stock that one first.";
  }
  function fireLine(PL, o) {
    var f = fire(PL, o);
    return "The main site stops for " + f.months + " months: **" + gwh(f.lost) + "** of cells lost, to be imported at " + pct(f.premium) + " more" + (o.split > 0 ? "; the second site makes " + gwh(f.cover) : "") + ". " + fmtN(f.jobYears, 0) + " job-years with no work at the burned site.";
  }
  function fireSaw(PL, o) {
    var f = fire(PL, o);
    if (f.lost <= 1e-9) return "A second site with this much capacity covers the whole loss: spare capacity in a second place is what makes a factory resilient.";
    return "Making cells at home trades cell imports for mineral imports and adds a single-site risk; a second site with spare capacity spreads it.";
  }
  function boardLine(PL, D, on, S) {
    var b = board(PL, D, on, S), n = Object.keys(on).filter(function (k) { return on[k]; }).length;
    if (!n) return "Switch on one or more shocks.";
    return n + (n === 1 ? " shock" : " shocks") + ": oil short " + pj(b.oilGap) + ", extra paid abroad " + bn(b.abroad) + ", cells lost **" + gwh(b.cellsLost) + "**.";
  }
  function boardSaw(PL, D, on, S) {
    var b = board(PL, D, on, S);
    if (b.overlap && b.cellsSum - b.cellsLost > 1e-9) return "Together, the restriction and the fire overlap: the factory loses " + gwh(b.cellsLost) + ", not " + gwh(b.cellsSum) + ". Combined shocks are not simply added.";
    return "Each shock hits a different part: a price, a route, a supplier, a site. No single lever covers them all.";
  }
  // the no-JS block, the ideas, the myths and the practice set (written by the test's --write)
  function staticFallback(PL, D) {
    var d = dependence(PL), M = minerals(PL), S = defaults(PL, D), sp = spike(PL, 0), cl = closure(PL, D, S), b = ban(PL, S), f = fire(PL, S);
    return "<p class=\"lx-eyebrow\">The idea in one table: four ways Prairieland's supply can fail</p>" +
      "<div class=\"lx-scroll-x\"><table class=\"lx-mini-table a21-fbt\"><caption class=\"lx-hint\">" + PL.about.line + " With 2025's settings.</caption>" +
      "<thead><tr><th scope=\"col\">Shock</th><th scope=\"col\">What it hits</th><th scope=\"col\">Result</th></tr></thead><tbody>" +
      "<tr><td>LNG price spike</td><td>Prices</td><td>" + bn(sp.abroad) + " more paid abroad in a year; " + bn(sp.home) + " moved at home</td></tr>" +
      "<tr><td>Strait closed " + S.weeks + " weeks</td><td>A route</td><td>" + pj(cl.oilLost) + " of crude lost; " + S.stockDays + " days of stocks (" + pj(cl.stocks) + ") " + (cl.covered ? "cover it" : "fall " + pj(cl.gap) + " short") + "</td></tr>" +
      "<tr><td>Mineral export restriction</td><td>A supplier</td><td>the factory makes " + pct(b.q) + " of its output for " + b.years + " years; the first to run short is " + b.bind.label.toLowerCase() + "</td></tr>" +
      "<tr><td>Factory fire</td><td>A site</td><td>" + gwh(f.lost) + " of cells lost in " + f.months + " months</td></tr></tbody></table></div>" +
      "<ul><li><b>Import dependence.</b> " + fmtN(d.net, 0) + " ÷ " + fmtN(d.primary, 0) + " PJ = " + pct(d.total, 1) + "; " + pct(d.strait, 1) + " of primary energy passes one strait.</li>" +
      "<li><b>Concentration.</b> Refining HHI from " + fmtN(Math.min.apply(null, M.map(function (m) { return m.hhi; }))) + " to " + fmtN(Math.max.apply(null, M.map(function (m) { return m.hhi; }))) + " (0 to 10,000).</li></ul>" +
      "<p class=\"lx-hint\">With JavaScript on, you test stockpiles, diversification, recycling and a second factory site yourself.</p>";
  }
  function ideas(PL, D) {
    var d = dependence(PL), b = ban(PL, defaults(PL, D)), S = defaults(PL, D), bd = board(PL, D, { spike: false, closure: false, ban: true, fire: true }, S);
    var items = [
      ["Dependence is a ratio", "Net imports ÷ primary energy: " + pct(d.total, 1) + " for Prairieland; its value depends on how primary energy is counted."],
      ["Concentration is separate", "Coal is 0% imported, yet all of it comes from one county; " + pct(d.strait, 1) + " of primary energy passes one strait."],
      ["The scarcest input sets output", b.bind.label + " limits the factory to " + pct(b.q) + " of its output during the restriction."],
      ["Whose money", "A price spike sends money abroad for imports and moves money at home between users and producers."],
      ["Shocks overlap", "A restriction and a fire together cost " + gwh(bd.cellsLost) + " of cells, not " + gwh(bd.cellsSum) + "."]
    ];
    return "<dl class=\"lx-ideas\">" + items.map(function (x) { return "<dt>" + x[0] + "</dt><dd>" + x[1] + "</dd>"; }).join("") + "</dl>";
  }
  function myths(PL, D) {
    var S = defaults(PL, D), c = closure(PL, D, S), sp = spike(PL, 0);
    var M = [
      ["independence", "myth", "“A country that imports no energy is secure.”", "Myth. Risk also sits in world prices, single routes, dominant suppliers and single sites: Prairieland's coal is all domestic and all from one county."],
      ["days", "myth", "“Ninety days of oil stocks means ninety days of all the oil a country uses.”", "Myth. The IEA counts days of net imports: Prairieland's " + S.stockDays + " days are " + pj(c.stocks) + ", not " + S.stockDays + " days of all its crude."],
      ["sellers", "myth", "“More LNG sellers protect a country from a world price spike.”", "Myth. A world price rise reaches every seller: Prairieland would still pay " + bn(sp.abroad) + " more abroad, and only using less gas helps."],
      ["hhi", "myth", "“A high HHI shows that a supplier is likely to cut a country off.”", "Myth. It measures how concentrated supply is, not anyone's intentions; it says how much is at stake if one supplier stops."]
    ];
    return M.map(function (m) {
      return "<div class=\"lx-qq\" data-id=\"" + m[0] + "\" data-answer=\"" + m[1] + "\">\n<p class=\"lx-qtext\">Myth or fact? " + m[2] + "</p>\n<ul class=\"lx-choices\"><li data-value=\"myth\">Myth</li><li data-value=\"fact\">Fact</li></ul>\n<details class=\"lx-answer\"><summary>Answer</summary><p>" + m[3] + "</p></details>\n</div>";
    }).join("\n");
  }
  // the facts table and the real-world card (written by the test's --write)
  function srcCell(src) { return "<td class=\"s\">" + (src.url && src.url !== "no link" ? "<a href=\"" + src.url + "\">" + src.publisher + "</a>" : src.publisher) + " · " + src.date.replace(/;.*$/, "") + "</td>"; }
  function facts(PL, D) {
    var rows = D.facts.prairieland.map(function (k) { var r = PL.realWorld.filter(function (x) { return x.src === k; })[0]; return "<tr><td>" + r.what + "</td><td>" + r.value + "</td>" + srcCell(PL.sources[k]) + "</tr>"; });
    D.facts.own.forEach(function (k) { var r = D.realWorld.filter(function (x) { return x.id === k; })[0]; rows.push("<tr><td>" + r.what + "</td><td>" + r.value + "</td>" + srcCell(D.sources[r.src]) + "</tr>"); });
    var T = D.thresholds;
    rows.push("<tr><td>Highly concentrated, in U.S. merger review</td><td>an HHI above " + fmtN(T.hhiHigh) + "</td>" + srcCell(D.sources[T.hhiSrc]) + "</tr>");
    rows.push("<tr><td>The EU's benchmark for one third country</td><td>at most " + pct(T.oneCountry) + " of yearly use of each strategic raw material, by 2030</td>" + srcCell(D.sources[T.oneCountrySrc]) + "</tr>");
    return rows.join("\n");
  }
  function real(PL, D) {
    var h = D.realWorld.filter(function (x) { return x.id === "hormuz"; })[0], a = D.realWorld.filter(function (x) { return x.id === "iea400"; })[0];
    return "<p>" + h.what + ": " + h.value + " (" + D.sources[h.src].publisher.replace("U.S. Energy Information Administration", "EIA") + ", " + D.sources[h.src].date.replace(/;.*$/, "") + ").</p><p>" + a.what + ": " + a.value + ".</p>";
  }
  function r1(v) { return Math.round(v * 10) / 10; }
  function practice(PL, D) {
    var d = dependence(PL), I = PL.imports, g = PL.imports.minerals.items.graphite, S = defaults(PL, D), sp = spike(PL, 0), Fb = PL.factories.battery, b = ban(PL, S), gr = b.rows.filter(function (x) { return x.key === "graphite"; })[0];
    var c9 = closure(PL, D, Object.assign({}, S, { weeks: 9 })), f = fire(PL, S), f30 = fire(PL, Object.assign({}, S, { split: 30 }));
    var sh = g.shares.map(function (x) { return fmtN(100 * x); });
    var items = [
      ["Through the strait.", "Prairieland imports " + fmtN(I.oil.importPJ) + " PJ of crude (all through the strait) and " + fmtN(I.lng.importPJ) + " PJ of LNG (" + pct(I.lng.throughStraitShare) + " through it). Primary energy is " + fmtN(d.primary) + " PJ. What share passes the strait?",
       fmtN(I.oil.importPJ) + " + " + fmtN(I.lng.importPJ) + " × " + fmtN(I.lng.throughStraitShare, 2) + " = " + fmtN(d.straitPJ) + " PJ; ÷ " + fmtN(d.primary) + " = " + pct(d.strait, 1) + "."],
      ["An HHI by hand.", "Graphite's refiners hold " + sh.join("%, ") + "%. What is the HHI?",
       sh.map(function (x) { return x + "²"; }).join(" + ") + " = " + sh.map(function (x) { return fmtN(x * x); }).join(" + ") + " = " + fmtN(hhi(g.shares)) + "."],
      ["Whose money.", "LNG costs $" + fmtN(sp.lngPrice, 2) + " per GJ and triples for a year; Prairieland buys " + fmtN(sp.lng) + " PJ. How much more does it pay abroad?",
       fmtN(sp.lng) + " PJ × $" + fmtN(sp.lngPrice, 2) + " × (" + fmtN(sp.lngX) + " − 1) = $" + fmtN(sp.lng * sp.lngPrice * (sp.lngX - 1)) + " million, " + bn(sp.abroad) + "."],
      ["Stocks against a closure.", "With " + S.stockDays + " days of stocks, does a 9-week closure leave Prairieland short? Oil imports are " + fmtN(I.oil.importPJ) + " PJ a year.",
       "Lost: " + fmtN(I.oil.importPJ) + " × 63 ÷ 365 = " + pj(c9.oilLost) + "; stocks: " + fmtN(I.oil.importPJ) + " × " + S.stockDays + " ÷ 365 = " + pj(c9.stocks) + "; short by " + pj(r1(c9.oilLost) - r1(c9.stocks)) + "."],
      ["The scarcest mineral.", "Country R refines " + pct(gr.sR) + " of graphite; " + pct(S.recycled / 100) + " is recycled; stocks last " + S.mineralDays + " days. Over a " + b.years + "-year restriction, what share of output can graphite support?",
       pct(S.recycled / 100) + " + " + fmtN(100 - S.recycled) + "% × " + fmtN(100 * (1 - gr.sR)) + "% = " + pct(gr.a, 1) + " a year; (" + b.years + " × " + fmtN(gr.a, 3) + " + " + S.mineralDays + "/365) ÷ " + b.years + " = " + fmtN(gr.q, 3) + ", about " + pct(gr.q) + "."],
      ["A second site.", "The factory makes " + fmtN(Fb.output2025GWh) + " GWh a year with " + fmtN(Fb.capacityGWh) + " GWh of capacity. A fire stops the main site for " + f.months + " months. How much is lost with no second site, and with 30% of the capacity elsewhere?",
       "None elsewhere: " + f.months + "/12 × " + fmtN(Fb.output2025GWh) + " = " + gwh(f.lost) + ". With 30%: " + f.months + "/12 × (" + fmtN(Fb.output2025GWh) + " − " + fmtN(Fb.capacityGWh) + " × 0.3) = " + gwh(f30.lost) + "."]
    ];
    return "<p class=\"lx-eyebrow\">Practice · about 30 minutes on your own</p><ol class=\"lx-fb-practice\">" + items.map(function (x) {
      return "<li><p><b>" + x[0] + "</b> " + x[1] + "</p><details class=\"lx-answer\"><summary>Answer</summary><p>" + x[2] + "</p></details></li>";
    }).join("") + "</ol><p class=\"lx-hint\">" + PL.about.line + " Every number here comes from the page's model.</p>";
  }

  var model = { KEY: KEY, shockOf: shockOf, lever: lever, defaults: defaults, dependence: dependence, hhi: hhi, capShares: capShares, minerals: minerals, spike: spike, closure: closure,
    ban: ban, fire: fire, board: board, fmtN: fmtN, pct: pct, pj: pj, bn: bn, gwh: gwh, refiner: refiner, PREDICT: PREDICT, depLine: depLine, depSaw: depSaw, straitAnswer: straitAnswer,
    straitSaw: straitSaw, hhiLine: hhiLine, hhiSaw: hhiSaw, spikeLine: spikeLine, spikeSaw: spikeSaw, closureLine: closureLine, closureSaw: closureSaw, banLine: banLine, banSaw: banSaw,
    fireLine: fireLine, fireSaw: fireSaw, boardLine: boardLine, boardSaw: boardSaw, staticFallback: staticFallback, ideas: ideas, myths: myths, practice: practice, r1: r1, facts: facts, real: real };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H;
  function bold(t) { return LX.rich(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>"); }

  LX.mount("security-minerals", function (live, data, root) {
    var PL = data.prairieland, D = data[KEY], LINE = PL.about.line, S = defaults(PL, D), ON = { spike: true, closure: true, ban: false, fire: false }, mine = true, conv = "physical";
    var saved = LX.store.get("a21");
    if (saved) Object.keys(D.levers).forEach(function (k) { var r = lever(PL, D, k); if (typeof saved[k] === "number" && saved[k] >= r.min && saved[k] <= r.max) S[k] = saved[k]; });
    function keep() { LX.store.set("a21", S); }
    var demo = [];
    function chips(host, list) { host.innerHTML = ""; list.forEach(function (x) { var c = H("div", { class: "lx-readout" + (x[2] ? " " + x[2] : "") }, host); H("span", { text: x[0] }, c); H("b", { text: x[1] }, c); }); }
    function slider(host, k, label, fmt, color, after) {
      var r = lever(PL, D, k);
      return LX.Slider(host, { label: label, color: color || "var(--lx-tier-2)", min: r.min, max: r.max, step: r.step, value: S[k], fmt: fmt, onChange: function (v) { S[k] = v; keep(); after(); } });
    }
    // the supply rows: one bar per fuel or input, split by where it comes from
    function rows(host) {
      var I = PL.imports, B = PL.balance.primary, M = minerals(PL), avg = PL.imports.minerals.leadingShareAverage;
      var R = [
        { name: "Crude oil", parts: [[I.oil.importPJ * I.oil.throughStraitShare, "Imported through the strait", "var(--lx-bad)"], [I.oil.importPJ * (1 - I.oil.throughStraitShare), "Imported by other routes", "var(--lx-warn)"], [I.oil.domesticPJ, "Domestic", "var(--lx-good)"]], unit: "PJ" },
        { name: "Natural gas", parts: [[I.lng.importPJ * I.lng.throughStraitShare, "LNG through the strait", "var(--lx-bad)"], [I.lng.importPJ * (1 - I.lng.throughStraitShare), "LNG by other routes", "var(--lx-warn)"], [I.lng.domesticPJ, "Domestic", "var(--lx-good)"]], unit: "PJ" },
        { name: "Coal", parts: [[B.coal, "Domestic, all from Ridge County", "var(--lx-good)"]], unit: "PJ" },
        { name: "Battery minerals", parts: [[avg, "From " + refiner(PL, 0) + " (average of four)", "var(--lx-bad)"], [1 - avg, "From other refiners", "var(--lx-warn)"]], unit: "share" }
      ];
      var w = H("div", { class: "a21-rows", role: "list" }, host);
      R.forEach(function (r) {
        var tot = r.parts.reduce(function (s, p) { return s + p[0]; }, 0), row = H("div", { class: "a21-row", role: "listitem" }, w);
        H("b", { text: r.name }, row);
        var bar = H("div", { class: "a21-bar", "aria-hidden": "true" }, row);
        r.parts.forEach(function (p) { if (p[0] > 0) H("i", { style: "width:" + (100 * p[0] / tot).toFixed(2) + "%;background:" + p[2], title: p[1] }, bar); });
        H("span", { class: "lx-hint", text: r.parts.filter(function (p) { return p[0] > 0; }).map(function (p) { return p[1] + " " + (r.unit === "PJ" ? fmtN(p[0], 0) + " PJ" : pct(p[0])); }).join("; ") }, row);
      });
      H("p", { class: "lx-hint", text: LINE + " Crude, gas and coal in PJ a year (2025); minerals as shares of the battery factory's refined supply." }, host);
      void M;
    }

    var steps = [
      { text: "Prairieland's supply, fuel by fuel: where it comes from and by which route. Before you measure anything: would ending all imports make it secure?",
        build: function (act, api) {
          rows(act);
          var pr = LX.Predict(act, { id: "a21-indep", q: PREDICT.q, answer: PREDICT.answer, options: PREDICT.options, feedback: PREDICT.feedback, onPick: function () { show(); } });
          function show() { pr.reveal(); api.done(); api.saw("Security has several parts: how much is imported, how concentrated each supply is, how long stocks last, and whether one site can stop everything."); }
          if (pr.picked()) show();
          demo[0] = function () { if (!pr.picked()) { var b = act.querySelectorAll(".lx-choice")[1]; if (b) b.click(); } };
        } },
      { text: "[[import-dependence|Import dependence]] is net imports divided by primary energy. Read it for the nation and fuel by fuel, then count primary energy another way.",
        build: function (act, api) {
          var ro = H("div", { class: "lx-readouts", "aria-live": "polite" }, act), line = H("p", { class: "lx-step-line", "aria-live": "polite" }, act);
          function paint() { var d = dependence(PL, conv); chips(ro, [["Nation", pct(d.total, 1)], ["Oil", pct(d.oil)], ["Gas", pct(d.gas)], ["Coal", pct(d.coal)]]); line.innerHTML = bold(depLine(PL, conv)); }
          var tg = LX.Toggle(H("div", { class: "lx-toggles", role: "group", "aria-label": "Accounting convention" }, act), { label: "Count primary energy by the substitution method", on: conv === "substitution", onChange: function (on) { conv = on ? "substitution" : "physical"; paint(); api.done(); api.saw(depSaw(PL)); } });
          H("p", { class: "lx-hint", text: "Eurostat divides net imports by gross available energy; with no exports or bunkers, Prairieland's is its primary energy. " + LINE }, act);
          paint();
          demo[1] = function () { tg.set(true); conv = "substitution"; paint(); api.done(); api.saw(depSaw(PL)); };
        } },
      { text: "A single route matters too: all imported crude and a quarter of the LNG pass one strait. What share of all primary energy passes it?",
        build: function (act, api) {
          var out = H("p", { class: "lx-step-line", "aria-live": "polite" }, act), ans = straitAnswer(PL);
          var na = LX.NumAnswer(act, { label: "Share of primary energy through the strait", unit: "%", onCheck: function (v) {
            if (v == null) return;
            var good = Math.abs(v - ans) <= 0.6;
            out.innerHTML = bold((good ? "Right. " : "Not quite: " + fmtN(v, 1) + "%. ") + straitSaw(PL)); api.done(); api.saw("A route is a supply of its own: diversifying sellers does not help if they all ship through one strait.");
          } });
          H("p", { class: "lx-hint", text: "Round to one decimal. " + LINE }, act);
          demo[2] = function () { na.input.value = String(ans); na.go(); };
        } },
      { text: "Concentration is a second measure: the [[hhi|HHI]] adds each supplier's squared share, 10,000 for a single supplier. Read the battery minerals, then cap any one refiner's share.",
        build: function (act, api) {
          var tb = H("div", null, act), line = H("p", { class: "lx-step-line", "aria-live": "polite" }, act), sup = PL.imports.minerals.suppliers;
          function paint() {
            var M = minerals(PL, S.cap); tb.innerHTML = "";
            LX.Ledger(tb, { caption: "Refining shares and HHI (0 to 10,000), with no refiner above " + fmtN(S.cap) + "%. " + LINE, columns: ["Mineral"].concat(sup.map(function (s, i) { return refiner(PL, i); })).concat(["HHI"]),
              rows: M.map(function (m) { return { head: m.label, cells: m.shares.map(function (x) { return pct(x, 1); }).concat([{ text: fmtN(m.hhi), cls: m.hhi > D.thresholds.hhiHigh ? "up" : "" }]) }; }), cls: "a21-led" });
            line.innerHTML = bold(hhiLine(PL, D, S.cap)); api.done(); api.saw(hhiSaw(PL, D, S.cap));
          }
          var sl = slider(act, "cap", "No refiner above (diversification, set beforehand)", function (v) { return fmtN(v) + "%"; }, "var(--lx-tier-2)", paint);
          H("p", { class: "lx-hint", text: D.thresholds.hhiWhat + " " + D.thresholds.oneCountryWhat }, act);
          paint();
          demo[3] = function () { sl.set(65, true); };
        } },
      { text: "Stress test one: LNG costs three times as much for a year, and domestic gas half as much again. Cut gas use and see where the money goes.",
        build: function (act, api) {
          var ro = H("div", { class: "lx-readouts", "aria-live": "polite" }, act), line = H("p", { class: "lx-step-line", "aria-live": "polite" }, act);
          function paint() { var s = spike(PL, S.gasCut); chips(ro, [["Paid abroad, extra", bn(s.abroad), "bad"], ["Moved at home (a transfer)", bn(s.home)], ["Share of GDP", pct(s.gdp, 2)]]); line.innerHTML = bold(spikeLine(PL, S.gasCut)); api.done(); api.saw(spikeSaw(PL, S.gasCut)); }
          var sl = slider(act, "gasCut", "Gas use cut this year (efficiency, electrification)", function (v) { return fmtN(v) + "%"; }, "var(--lx-wind)", paint);
          H("p", { class: "lx-hint", text: D.assume.spike + " " + LINE }, act);
          paint();
          demo[4] = function () { sl.set(20, true); };
        } },
      { text: "Stress test two: ships cannot pass the strait. Set how long it stays closed, the oil stocks in days of imports and any cut in oil use.",
        build: function (act, api) {
          var ro = H("div", { class: "lx-readouts", "aria-live": "polite" }, act), line = H("p", { class: "lx-step-line", "aria-live": "polite" }, act);
          function paint() { var c = closure(PL, D, S); chips(ro, [["Crude lost", pj(c.oilLost)], ["Stocks", pj(c.stocks)], [c.covered ? "To spare" : "Short", pj(c.covered ? c.left : c.gap), c.covered ? "good" : "bad"], ["LNG lost", pj(c.lngLost)]]); line.innerHTML = bold(closureLine(PL, D, S)); api.done(); api.saw(closureSaw(PL, D, S)); }
          var sl = slider(act, "weeks", "Strait closed", function (v) { return v + (v === 1 ? " week" : " weeks"); }, "var(--lx-bad)", paint);
          slider(act, "stockDays", "Oil stocks, days of net imports (IEA benchmark " + PL.imports.oil.benchmarkDays + ")", function (v) { return v + " days"; }, "var(--lx-tier-3)", paint);
          slider(act, "restraint", "Oil use cut during the closure", function (v) { return v + "%"; }, "var(--lx-wind)", paint);
          H("p", { class: "lx-hint", text: D.assume.closure + " " + D.assume.gasStorageWhat + " " + LINE }, act);
          paint();
          demo[5] = function () { sl.set(12, true); };
        } },
      { text: "Stress test three: the leading refiner stops exporting battery minerals for two years. Diversify beforehand, recycle more or hold bigger stocks, and watch the factory's output.",
        build: function (act, api) {
          var ro = H("div", { class: "lx-readouts", "aria-live": "polite" }, act), tb = H("div", null, act), line = H("p", { class: "lx-step-line", "aria-live": "polite" }, act);
          function paint() {
            var b = ban(PL, S); chips(ro, [["Output kept", pct(b.q), b.q >= 1 ? "good" : "bad"], ["Cells lost", gwh(b.lost)]]);
            tb.innerHTML = ""; LX.Ledger(tb, { caption: "Over the " + b.years + " years; supply share = recycled + the others' share of the rest. " + LINE, columns: ["Mineral", refiner(PL, 0) + "'s share", "Supply share", "Output it allows"],
              rows: b.rows.map(function (x) { return { head: x.label, cells: [pct(x.sR), pct(x.a), { text: pct(x.q), cls: b.binds.indexOf(x) >= 0 && x.q < 1 ? "up" : "" }] }; }), cls: "a21-led" });
            line.innerHTML = bold(banLine(PL, S)); api.done(); api.saw(banSaw(PL, S));
          }
          var sl = slider(act, "cap", "No refiner above (diversification)", function (v) { return fmtN(v) + "%"; }, "var(--lx-tier-2)", paint);
          slider(act, "recycled", "Recycled at home", function (v) { return v + "%"; }, "var(--lx-good)", paint);
          slider(act, "mineralDays", "Mineral stocks", function (v) { return v + " days of use"; }, "var(--lx-tier-3)", paint);
          H("p", { class: "lx-hint", text: D.assume.ban + " New grid batteries bought that year cost " + fmtN(ban(PL, S).capexX, 1) + " times as much. " + LINE }, act);
          paint();
          demo[6] = function () { sl.set(60, true); };
        } },
      { text: "Stress test four: a fire stops the cell factory for six months. Making cells at home is itself a security choice: put some capacity at a second site.",
        build: function (act, api) {
          var ro = H("div", { class: "lx-readouts", "aria-live": "polite" }, act), line = H("p", { class: "lx-step-line", "aria-live": "polite" }, act);
          function paint() { var f = fire(PL, S); chips(ro, [["Cells lost", gwh(f.lost), f.lost > 0 ? "bad" : "good"], ["Imported at", "+" + pct(f.premium)], ["Job-years with no work", fmtN(f.jobYears, 0)]]); line.innerHTML = bold(fireLine(PL, S)); api.done(); api.saw(fireSaw(PL, S)); }
          var sl = slider(act, "split", "Cell-making capacity at a second site", function (v) { return v + "%"; }, "var(--lx-bat)", paint);
          H("p", { class: "lx-hint", text: D.assume.fire + " Jobs at each site in proportion to its capacity; job-years before any work elsewhere. " + LINE }, act);
          paint();
          demo[7] = function () { sl.set(30, true); };
        } },
      { text: "Now combine them. Switch shocks on together, with your levers or with 2025's settings, and read what fails: a price, a route, a supplier or a site.",
        build: function (act, api) {
          var tg = H("div", { class: "lx-toggles", role: "group", "aria-label": "Shocks" }, act), tb = H("div", null, act), line = H("p", { class: "lx-step-line", "aria-live": "polite" }, act), T = {};
          [["spike", "LNG price spike"], ["closure", "Strait closed"], ["ban", "Mineral export restriction"], ["fire", "Factory fire"]].forEach(function (x) { T[x[0]] = LX.Toggle(tg, { label: x[1], on: ON[x[0]], onChange: function (on) { ON[x[0]] = on; paint(); } }); });
          var lv = LX.Toggle(H("div", { class: "lx-toggles", role: "group", "aria-label": "Levers" }, act), { label: "Use my levers from the earlier steps", on: mine, onChange: function (on) { mine = on; paint(); } });
          function paint() {
            var L = mine ? S : defaults(PL, D), b = board(PL, D, ON, L); tb.innerHTML = "";
            LX.Ledger(tb, { caption: (mine ? "With your levers. " : "With 2025's settings. ") + LINE, columns: ["What fails", "Measure", "Result"],
              rows: [{ head: "Oil", sub: "strait closed", cells: ["short after stocks", pj(b.oilGap)] }, { head: "Gas", sub: "strait closed", cells: ["short after storage", pj(b.gasGap)] },
                     { head: "Money", sub: "LNG price spike", cells: ["extra paid abroad", bn(b.abroad)] }, { head: "Cells", sub: "restriction or fire", cells: ["output lost", gwh(b.cellsLost)] },
                     { head: "Work", sub: "factory fire", cells: ["job-years with no work", fmtN(b.jobYears, 0)] }], cls: "a21-led" });
            line.innerHTML = bold(boardLine(PL, D, ON, L)); api.done(); api.saw(boardSaw(PL, D, ON, L));
          }
          paint();
          demo[8] = function () { ["ban", "fire"].forEach(function (k) { ON[k] = true; T[k].set(true); }); paint(); };
          void lv;
        } },
      { text: "Last, sort the levers: which ones help against which shock? Tick each cell where the lever helps, then check against the stress tests.",
        build: function (act, api) {
          var cs = LX.CardSort(act, { mode: "toggles", bins: D.sort.bins, items: D.sort.items, checkLabel: "Check my sort", onCheck: function (res) {
            api.done(); api.saw(res.agree + " of " + res.clear + " clear cells agree. Stocks bridge time, more suppliers spread a supplier risk, a second site spreads a site risk; using less helps against prices and routes.");
          } });
          demo[9] = function () { cs.check(); };
        } }
    ];
    var cards = LX.StepCards(live, { id: "a21-steps", steps: steps });

    // ---------------------------------------------------------------- the explain layer
    var xhost = document.getElementById("a21-explain");
    if (xhost) {
      xhost.innerHTML = ""; xhost.classList.add("is-live");
      var d = dependence(PL), b0 = ban(PL, defaults(PL, D)), sp0 = spike(PL, 0);
      LX.ConceptMap(H("div", { class: "lx-xcard" }, xhost), { title: "What energy security is made of", lede: "Four parts, each with its own measure and its own levers.",
        groups: { risk: ["What can fail", "var(--lx-bad)"], meas: ["How it is measured", "var(--lx-tier-2)"], lev: ["What helps", "var(--lx-good)"] },
        nodes: [{ id: "price", g: "risk", label: "Prices", text: "World prices move for everyone who buys.", game: "Step 5: " + bn(sp0.abroad) + " more abroad.", at: [0, 0], atN: [0, 0] },
                { id: "route", g: "risk", label: "Routes", text: "One strait, one terminal, one line.", game: "Step 3: " + pct(d.strait, 1) + " of primary energy.", at: [0, 1], atN: [0, 1] },
                { id: "sup", g: "risk", label: "Suppliers", text: "One refiner for most of a mineral.", game: "Step 7: output " + pct(b0.q) + ".", at: [0, 2], atN: [0, 2] },
                { id: "site", g: "risk", label: "Sites", text: "One factory, one mine, one county.", game: "Step 8: a fire.", at: [0, 3], atN: [0, 3] },
                { id: "dep", g: "meas", label: "Import dependence", text: "Net imports ÷ primary energy.", at: [1, 0], atN: [1, 0] },
                { id: "hhi", g: "meas", label: "HHI", text: "Sum of squared shares.", at: [1, 2], atN: [1, 2] },
                { id: "days", g: "meas", label: "Days of stocks", text: "Days of net imports.", at: [1, 1], atN: [1, 1] },
                { id: "less", g: "lev", label: "Use less", text: "Efficiency and electrification.", at: [2, 0], atN: [2, 0] },
                { id: "stock", g: "lev", label: "Stockpiles", text: "Oil, gas and minerals.", at: [2, 1], atN: [2, 1] },
                { id: "div", g: "lev", label: "More suppliers, recycling", text: "Spread the supply.", at: [2, 2], atN: [2, 2] },
                { id: "two", g: "lev", label: "A second site", text: "Spare capacity elsewhere.", at: [2, 3], atN: [2, 3] }],
        edges: [["price", "dep"], ["route", "days"], ["sup", "hhi"], ["dep", "less"], ["days", "stock"], ["hhi", "div"], ["site", "two"]], cols: 3, rows: 4, colsN: 3, rowsN: 4 });
      LX.CompareTable(H("div", { class: "lx-xcard" }, xhost), { title: "Which lever helps against which shock", text: true, caption: "From the stress tests on this page; “partly” where it helps only in part.",
        columns: [{ key: "name", label: "Lever", main: true }].concat(D.sort.bins.map(function (b) { return { key: b.key, label: b.label }; })),
        rows: D.sort.items.map(function (it) { var r = { key: it.key, color: it.color, name: it.label }; D.sort.bins.forEach(function (b) { r[b.key] = it.ref[b.key]; }); return r; }) });
      LX.CausalChain(H("div", { class: "lx-xcard" }, xhost), { title: "Cause and effect: a mineral export restriction",
        links: [{ title: refiner(PL, 0) + " stops exporting", text: "For " + b0.years + " years, as set for teaching.", value: pct(PL.imports.minerals.leadingShareAverage) + " of the minerals, on average" },
                { title: b0.bind.label + " runs short first", text: "Others and recycling cover only part of it.", value: pct(b0.bind.a) + " a year, plus stocks" },
                { title: "The factory slows", text: "The scarcest input sets the output.", value: gwh(b0.made) + " of " + gwh(b0.output) },
                { title: "Cells are imported or go unmade", text: "And new grid batteries cost more that year.", value: fmtN(b0.capexX, 1) + "× their cost" }],
        note: "Concentration upstream becomes a shortage downstream: the factory moved the risk from cells to minerals." });
      LX.Boundary(H("div", { class: "lx-xcard" }, xhost), { title: "Where these stress tests hold",
        holds: ["Prairieland, a fictional nation, with 2025's volumes and prices;", "each shock alone or combined as stated, with fixed volumes;", "other suppliers ship only their usual shares during a restriction;", "money in 2025 dollars, counted where it is paid."],
        leaves: ["How prices and demand respond during a shock;", "shipping, insurance and the cost of holding stocks;", "trade law, diplomacy and any judgement of a country;", "the odds of any shock: these are stress tests, not forecasts."],
        source: "Model: this page's closed-form stress tests. Data: Prairieland (course data)." });
    }

    LX.demo(root, function (state) {
      var n = state === "mid" ? 5 : +((/^step-(\d+)$/.exec(state) || [])[1] || 0); if (!n) return null;
      var k = Math.max(0, Math.min(steps.length - 1, n - 1));
      cards.go(k); if (demo[k]) demo[k]();
      return { view: "step " + (k + 1) };
    }, cards);
    root.lxLesson = { model: model, S: S, cards: cards };
  });
})();
