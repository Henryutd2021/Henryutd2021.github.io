// x05-project-finance.js — Side topic X5, "How are big energy projects actually financed?" (step cards, Analyst,
// side line, D1, closed form; wave W7, builder learn-w7-a, 2026-11-07). Guard G-FIN: every contract and offtake
// example is wind, solar, storage or gas (here a wind PPA and a battery tolling agreement).
//
// Data (read through data-src, never retyped):
//   data/x05-project-finance.json   the lender's settings (illustrative, inside the 2025 ATB's ranges), the slider
//                                   ranges, the bad year, the four layers, the facts, the stop box and the sources
//   data/07-cost.json               the wind farm's building cost ($/kW), fixed upkeep ($/kW-yr) and capacity factor
//   data/13-capstone.json           the battery's cost per kW and per kWh (2025 dollars) and its fixed upkeep share
//   data/a02-contracts-risk.json    A2's battery: 50 MW, 4 hours, one discharge a day, and its margin's distribution
//   data/a01-project-tea.json       A1's contract price for the wind farm's output ($/MWh, illustrative)
//   data/town.json                  Prairie Town's wind farm size (MW)
//   data/path.json                  lesson links that appear once a lesson is live
//
// Model (closed form, one typical year in 2025 dollars):
//   cost        C = wind MW × 1,000 × $/kW + battery MW × 1,000 × $/kW + battery MWh × 1,000 × $/kWh
//   revenue     R = wind MWh × price + battery MWh discharged × expected margin, where wind MWh = MW × 8,760 × CF and
//               the expected margin of A2's lognormal is median × exp(σ²/2) (the battery's fair toll in A2)
//   cash        CFADS = R − upkeep (wind $/kW-yr × kW + battery share × battery cost): the cash available for debt service
//   payment     a level loan at rate r over n years: payment = loan × r ÷ (1 − (1 + r)^−n)
//   loan        the lender's largest loan: [s × CFADS ÷ DSCRc + (1 − s) × CFADS ÷ DSCRm] ÷ (payment per $ of loan), where
//               s is the share sold under contract (same expected revenue either way), DSCRc and DSCRm the coverage
//               the lender asks from contracted and from market cash
//   bad year    contracted cash keeps its price (the PPA is paid as generated, so wind output still falls); market cash
//               loses both output and price
//   stack       debt (the lender's loan) + tax equity + grant (shares of C you set) + sponsor equity (what is left, > 0)
// Every number the page shows comes from these functions; _tests/learn/test_x05-project-finance.js checks them.
//
// Shared components: LX.StepCards, LX.Predict, LX.UnitChain, LX.Slider, LX.Toggle, LX.EnergyChain, LX.Boundary,
// LX.lessonRefHTML, LX.demo. Lesson-local: the capital stack (StackBar), a layered bar of buttons.
(function () {
  "use strict";
  var KEY = "x05_project_finance";

  // ---------------------------------------------------------------- pure model (no DOM; exported for Node)
  function inputs(data) {
    return { X: data[KEY], C7: data["07_cost"], C13: data["13_capstone"], A2: data.a02_contracts_risk, A1: data.a01_project_tea, T: data.town };
  }
  function project(I) {
    var w = I.C7.techs.wind, b = I.C13.techs.battery, pl = I.A2.plant, sp = I.A2.sim.spread;
    var P = { windMW: I.T.fleet.wind.mw, batMW: pl.batteryMW, batH: pl.batteryHours, cycles: pl.cyclesPerYear,
      wCapex: w.capex, wFom: w.fom, wCF: w.cf, bPow: b.powerCapex, bEn: b.energyCapex, bFom: b.fomShare, price: I.A1.price };
    P.batMWh = P.batMW * P.batH;
    P.capexWind = P.windMW * 1000 * P.wCapex;
    P.capexBat = P.batMW * 1000 * P.bPow + P.batMWh * 1000 * P.bEn;
    P.capex = P.capexWind + P.capexBat;
    P.windMWh = P.windMW * 8760 * P.wCF / 100;
    P.windRev = P.windMWh * P.price;
    P.discharged = P.batMWh * P.cycles;
    P.margin = sp.median * Math.exp(sp.sigma * sp.sigma / 2);
    P.batRev = P.discharged * P.margin;
    P.toll = P.batRev / (P.batMW * 1000);   // $ per kW-year: the battery's fair toll (A2)
    P.rev = P.windRev + P.batRev;
    P.opex = P.windMW * 1000 * P.wFom + P.bFom * P.capexBat;
    P.cf = P.rev - P.opex;
    return P;
  }
  function payRate(L) { var r = L.rate / 100; return r / (1 - Math.pow(1 + r, -L.term)); }   // payment per $ of loan, per year
  function payment(L, loan) { return loan * payRate(L); }
  function debtMax(P, L, s) { return (s * P.cf / L.dscrContract + (1 - s) * P.cf / L.dscrMerchant) / payRate(L); }
  function yearCF(P, s, B) {   // cash available for debt service: a typical year (B null) or a bad year
    if (!B) return P.cf;
    var c = s * (P.windRev * B.outputFactor + P.batRev), m = (1 - s) * (P.windRev * B.outputFactor * B.priceFactor + P.batRev * B.priceFactor);
    return c + m - P.opex;
  }
  function dscr(cf, loan, L) { return loan > 0 ? cf / payment(L, loan) : Infinity; }
  function largestLoanM(P, L) { return Math.floor(debtMax(P, L, 1) / 1e6 + 1e-9); }   // whole $M, fully contracted
  function stack(P, L, s, te, g) {   // s, te, g as fractions; amounts in $
    var debt = debtMax(P, L, s), t = te * P.capex, gr = g * P.capex, sp = P.capex - debt - t - gr;
    return { debt: debt, te: t, grant: gr, sponsor: sp, capex: P.capex, share: { debt: debt / P.capex, te: te, grant: g, sponsor: sp / P.capex } };
  }
  function deflate(X, v) { return v * X.deflator.index["2025"] / X.deflator.index["2023"]; }

  // ---------------------------------------------------------------- formats
  function fmtN(v, d) { return Number(v).toLocaleString("en-US", { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
  function M(v) { return "$" + fmtN(v / 1e6, 1) + "M"; }
  function pct(x, d) { return fmtN(100 * x, d || 0) + "%"; }
  function x2(v) { return fmtN(v, 2); }
  function usd(v, d) { return "$" + fmtN(v, d || 0); }

  // ---------------------------------------------------------------- the words the page shows (pure, tested)
  function steps(P, L) {
    return [
      "Prairie Town's " + P.windMW + " MW wind farm and a " + P.batMW + " MW, " + P.batH + "-hour battery cost about $" + fmtN(P.capex / 1e6) + " million to build, in 2025 dollars. Who usually puts in most of that money?",
      "That money comes in layers, a [[capital-stack|capital stack]], each paid back in a set order. Tap all four layers to see who provides it, what it gets and when it is paid.",
      "Lenders size the loan from the [[cash-flow-available-for-debt-service|cash available for debt service]]: revenue minus operating costs. Slide the loan; find the largest one whose [[debt-service-coverage-ratio|coverage ratio]] stays at " + x2(L.dscrContract) + " or above.",
      "Now sell less of the output under contract: on average the project earns the same, but the lender counts market cash at a stricter " + x2(L.dscrMerchant) + ". Slide the share, then switch on a bad year.",
      "Fill the rest of the stack with [[tax-equity|tax equity]] and a grant, if the project can get them. Watch the [[sponsor-equity|sponsor's]] own share shrink.",
      "A bad year arrives and cash falls short of what everyone expected. Who loses money first?"
    ];
  }
  var Q1 = { options: [{ value: "sponsor", label: "The owner, from its own money" }, { value: "others", label: "Lenders and tax-equity investors" }, { value: "grant", label: "A government grant" }], answer: "others",
    feedback: {
      sponsor: "Not usually: the sponsor's own equity is typically a small part of a U.S. wind project's stack (NREL, 2017).",
      others: "Yes: in a typical U.S. wind deal, debt and tax equity supply most of the money; the sponsor's own equity is often a small slice (NREL, 2017).",
      grant: "Not usually: U.S. federal support for wind has come mainly through the tax code, used through tax equity, rather than grants (NREL, 2017)."
    } };
  function costChain(P) {
    return [{ v: fmtN(P.windMW * 1000) + " kW × $" + fmtN(P.wCapex) + "/kW", u: "the wind farm" }, { op: "=" }, { v: M(P.capexWind), u: "wind farm" }, { op: "+" },
            { v: M(P.capexBat), u: "battery: " + fmtN(P.batMW * 1000) + " kW × $" + fmtN(P.bPow, 2) + " + " + fmtN(P.batMWh * 1000) + " kWh × $" + fmtN(P.bEn, 2) }, { op: "=" },
            { v: M(P.capex), u: "to build, 2025 dollars", out: true }];
  }
  function costSaw(P) { return "The money: " + M(P.capexWind) + " for the wind farm and " + M(P.capexBat) + " for the battery, " + M(P.capex) + " in all (building costs from lessons 7 and 13)."; }
  function layerHTML(X, k) {   // a layer's card: who, what it gets, when it is paid (three short lines)
    var l = X.layers.filter(function (y) { return y.key === k; })[0];
    return "<b>" + esc(l.label) + "</b><dl class=\"x5-dl\"><dt>Who</dt><dd>" + esc(l.who) + "</dd><dt>Gets</dt><dd>" + esc(l.gets) + "</dd><dt>Paid</dt><dd>" + esc(l.paid) + "</dd></dl>";
  }
  var LAYER_SAW = "Order of payment: operating costs, then the loan, then tax equity, then the sponsor. A grant is never paid back.";
  function cashLine(P, L, loanM) {
    var pay = payment(L, loanM * 1e6), d = dscr(P.cf, loanM * 1e6, L);
    return isFinite(d) ? "DSCR = " + M(P.cf) + " ÷ " + M(pay) + " = **" + fmtN(d, 3) + "**" : "DSCR: no loan, no payment to cover.";
  }
  function loanVerdict(P, L, loanM) {
    var d = dscr(P.cf, loanM * 1e6, L);
    if (!isFinite(d)) return "No loan yet: the owners would pay for everything.";
    return d >= L.dscrContract ? "At or above " + x2(L.dscrContract) + ": the lender would lend " + usd(loanM) + "M." : "Below " + x2(L.dscrContract) + ": the cushion is too thin, so the lender would not lend " + usd(loanM) + "M.";
  }
  function loanSaw(P, L) {
    var D = debtMax(P, L, 1);
    return "The largest loan in whole millions is " + usd(largestLoanM(P, L)) + "M (" + M(D) + " before rounding): about " + pct(D / P.capex) + " of the cost. One more million would push the coverage below " + x2(L.dscrContract) + ".";
  }
  function contractLine(P, L, s, X) {
    var D = debtMax(P, L, s), B = X.bad;
    return "At " + pct(s) + " contracted the lender offers **" + M(D) + "** (" + pct(D / P.capex) + " of the cost); in a bad year the cash covers its payment " + x2(dscr(yearCF(P, s, B), D, L)) + " times.";
  }
  function contractSaw(P, L, X) {
    var B = X.bad, D1 = debtMax(P, L, 1), D0 = debtMax(P, L, 0);
    return "Fully contracted: " + M(D1) + " of debt, and a bad year still covers the payment " + x2(dscr(yearCF(P, 1, B), D1, L)) + " times. Fully merchant: " + M(D0) + ", and a bad year covers it only " + x2(dscr(yearCF(P, 0, B), D0, L)) + " times.";
  }
  function stackSaw(P, L, s, te, g) {
    var S = stack(P, L, s, te, g);
    return "At " + pct(s) + " contracted, with " + pct(te) + " tax equity and a " + pct(g) + " grant, the sponsor puts in " + M(S.sponsor) + " (" + pct(S.share.sponsor) + " of the cost).";
  }
  function badLine(P, L, s, X) {
    var D = debtMax(P, L, s), cf = yearCF(P, s, X.bad), pay = payment(L, D);
    return "At " + pct(s) + " contracted, a bad year leaves " + M(cf) + " after operating costs against a loan payment of " + M(pay) + ": " +
      (cf >= pay ? "the loan is paid, and the owners get the " + M(cf - pay) + " left." : "the loan is short by " + M(pay - cf) + ", and the owners get nothing.");
  }

  // ---------------------------------------------------------------- the no-JS block, ideas, check, facts and sources
  function esc(t) { return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  var SHARES = [1, 0.5, 0];
  function staticFallback(P, L, X) {
    return "<p class=\"lx-eyebrow\">One wind and storage project, one typical year, 2025 dollars (illustrative)</p>" +
      "<p>" + P.windMW + " MW of wind and a " + P.batMW + " MW, " + P.batH + "-hour battery cost " + M(P.capex) + " to build. A typical year brings " + M(P.rev) + " of revenue; after " + M(P.opex) + " of operating costs, " + M(P.cf) + " is the cash available for debt service.</p>" +
      "<div class=\"lx-scroll-x\"><table class=\"lx-mini-table x5-fbt\"><thead><tr><th scope=\"col\">Sold under contract</th><th scope=\"col\">Largest loan</th><th scope=\"col\">Share of the cost</th><th scope=\"col\">Sponsor's share with no tax equity or grant</th><th scope=\"col\">Bad-year coverage</th></tr></thead><tbody>" +
      SHARES.map(function (s) { var D = debtMax(P, L, s); return "<tr><td>" + pct(s) + "</td><td>" + M(D) + "</td><td>" + pct(D / P.capex) + "</td><td>" + pct(1 - D / P.capex) + "</td><td>" + x2(dscr(yearCF(P, s, X.bad), D, L)) + "</td></tr>"; }).join("") +
      "</tbody></table></div>" +
      "<p class=\"lx-hint\">The lender asks " + x2(L.dscrContract) + " times the payment from contracted cash and " + x2(L.dscrMerchant) + " from market cash; loan at " + fmtN(L.rate, 1) + "% over " + L.term + " years. Bad year: 10% less wind and market prices 40% lower. Illustrative settings.</p>" +
      "<p class=\"lx-hint\">With JavaScript on, you build the stack step by step: tap its layers, size the loan, sell less under contract, add tax equity and a grant, and see who loses first in a bad year.</p>";
  }
  function ideasHTML(P, L, X) {
    var D1 = debtMax(P, L, 1), D0 = debtMax(P, L, 0);
    return "<dl class=\"lx-ideas\">" +
      "<dt>A capital stack</dt><dd>A big project's money comes in layers: senior debt, tax equity, the sponsor's own equity and sometimes a grant.</dd>" +
      "<dt>Order of payment</dt><dd>Cash pays operating costs, then the loan, then tax equity, then the sponsor; the sponsor is paid last and loses first.</dd>" +
      "<dt>Coverage</dt><dd>A lender sizes the loan so the cash available for debt service covers each payment by a margin, the debt-service coverage ratio.</dd>" +
      "<dt>Why contracts matter</dt><dd>With the same expected revenue, this project supports " + M(D1) + " of debt fully contracted and " + M(D0) + " fully merchant.</dd>" +
      "<dt>Illustrative</dt><dd>One typical year in 2025 dollars, settings inside the dated ranges of NREL's 2025 ATB; no taxes, flips or reserves.</dd></dl>";
  }
  function checkHTML(P, L) {
    var pay = payment(L, debtMax(P, L, 1)), d = P.cf / pay;
    return "<div class=\"lx-myths\" data-quiz=\"x05-myth\">" +
      "<div class=\"lx-qq\" data-id=\"debtcost\" data-answer=\"myth\"><p class=\"lx-qtext\">Myth or fact? “Debt is the most expensive money in a project's capital stack.”</p><ul class=\"lx-choices\"><li data-value=\"myth\">Myth</li><li data-value=\"fact\">Fact</li></ul><details class=\"lx-answer\"><summary>Answer</summary><p>Myth. Debt is paid first and protected by collateral, so it asks the lowest return: the 2025 ATB assumes " + fmtN(L.rate, 1) + "% for term debt and more for equity.</p></details></div>" +
      "</div><div class=\"lx-quiz\" data-quiz=\"x05\">" +
      "<div class=\"lx-qq\" data-id=\"dscr\" data-answer=\"b\"><p class=\"lx-qtext\">A project's cash available for debt service is " + M(P.cf) + " a year and its loan payment is " + M(pay) + ". What is its debt-service coverage ratio?</p><ul class=\"lx-choices\"><li data-value=\"a\">About " + x2(pay / P.cf) + "</li><li data-value=\"b\">About " + x2(d) + "</li><li data-value=\"c\">About " + x2(d + 1) + "</li></ul><details class=\"lx-answer\"><summary>Answer</summary><p>" + M(P.cf) + " ÷ " + M(pay) + " = " + x2(d) + ": the cash covers the payment " + x2(d) + " times. The ratio is cash over payment, not payment over cash (" + x2(pay / P.cf) + ").</p></details></div>" +
      "</div>";
  }
  // the Go deeper box: the sizing rule in symbols, with the arithmetic as displayed (each line from the line before)
  function sizing(P, L) {
    var cfM = Math.round(P.cf / 1e3) / 1e3, A = Math.round(1e4 / payRate(L)) / 1e4, prod = Math.round(cfM * A * 1e3) / 1e3;
    return { cfM: cfM, A: A, prod: prod, c: Math.round(prod / L.dscrContract * 100) / 100, m: Math.round(prod / L.dscrMerchant * 100) / 100 };
  }
  function deeperHTML(P, L) {
    var z = sizing(P, L);
    return "<p>The lender's largest loan <var>D</var> ($), for a share <var>s</var> of the output sold under contract:</p>" +
      "<p class=\"x5-eq\">D = A × [ s × CFADS ÷ DSCR<sub>c</sub> + (1 − s) × CFADS ÷ DSCR<sub>m</sub> ]</p>" +
      "<ul><li><b>CFADS</b>: cash available for debt service in a typical year, $ (revenue minus operating costs): $" + fmtN(z.cfM, 3) + "M here.</li>" +
      "<li><b>DSCR<sub>c</sub>, DSCR<sub>m</sub></b>: the coverage the lender asks from contracted and from market cash, " + x2(L.dscrContract) + " and " + x2(L.dscrMerchant) + " (illustrative).</li>" +
      "<li><b>A</b> = (1 − (1 + r)<sup>−n</sup>) ÷ r: the loan, in $, that $1 a year repays at rate r over n years; at " + fmtN(L.rate, 1) + "% and " + L.term + " years, A = " + fmtN(z.A, 4) + ".</li></ul>" +
      "<p>Here CFADS × A = $" + fmtN(z.cfM, 3) + "M × " + fmtN(z.A, 4) + " = $" + fmtN(z.prod, 3) + "M, the loan the whole cash could repay with no cushion. Fully contracted: ÷ " + x2(L.dscrContract) + " = $" + fmtN(z.c, 2) + "M. Fully merchant: ÷ " + x2(L.dscrMerchant) + " = $" + fmtN(z.m, 2) + "M.</p>";
  }
  function factsHTML(X) {
    return "<table class=\"lx-facts\"><thead><tr><th scope=\"col\">Number</th><th scope=\"col\">What it means</th><th scope=\"col\">Source</th></tr></thead><tbody>" +
      X.facts.map(function (f) {
        var s = X.sources[f.src], extra = f.dollars ? " About $" + fmtN(deflate(X, f.dollars.lo)) + " to $" + fmtN(deflate(X, f.dollars.hi)) + "/MWh in 2025 dollars." : "";
        return "<tr><td class=\"n\">" + esc(f.n) + "</td><td>" + esc(f.what) + extra + "</td><td class=\"s\"><a href=\"" + esc(s.url) + "\">" + esc(s.text.split(":")[0].split(" (")[0]) + "</a>" + (f.where ? ", " + esc(f.where) : "") + " · " + esc(s.asOf.split(";")[0]) + "</td></tr>";
      }).join("") + "</tbody></table>";
  }
  // the project's own inputs, each from the data file that holds it
  var BORROWED = [["07_cost", "eia-aeo2026-emm", "wind farm: building cost and fixed upkeep (lesson 7)"], ["07_cost", "eia-epa-cf", "wind farm: capacity factor (lesson 7)"], ["13_capstone", "nrel-battery-2025", "battery: building cost and upkeep (lesson 13)"], ["13_capstone", "bea-nipa-119", "battery: 2024 to 2025 dollars (lesson 13)"]];
  function srcLi(s) { return "<li>" + esc(s.text) + (s.url ? ". <a href=\"" + esc(s.url) + "\">Link</a>" : "") + (s.asOf ? ". " + esc(s.asOf.charAt(0).toUpperCase() + s.asOf.slice(1)) : "") + ".</li>"; }
  function sourcesHTML(I) {
    var X = I.X, own = Object.keys(X.sources).map(function (k) { return srcLi(X.sources[k]); }).join("");
    var lent = BORROWED.map(function (b) { var s = I[b[0] === "07_cost" ? "C7" : "C13"].sources[b[1]]; return srcLi({ text: s.text + " (" + b[2] + ")", url: s.url, asOf: s.asOf }); }).join("");
    return "<p class=\"lx-hint\">Finance:</p><ul>" + own + "</ul><p class=\"lx-hint\">The project's costs and output, read from other lessons' data:</p><ul>" + lent +
      "<li>Battery size, daily cycle and margin: lesson A2's illustrative plant and simulation. Contract price: lesson A1's illustrative $" + I.A1.price + "/MWh. Wind farm size: Prairie Town (fictional, illustrative).</li></ul>";
  }

  var model = { inputs: inputs, project: project, payRate: payRate, payment: payment, debtMax: debtMax, yearCF: yearCF, dscr: dscr, largestLoanM: largestLoanM, stack: stack, deflate: deflate,
    steps: steps, Q1: Q1, costChain: costChain, costSaw: costSaw, layerHTML: layerHTML, LAYER_SAW: LAYER_SAW, cashLine: cashLine, loanVerdict: loanVerdict, loanSaw: loanSaw,
    contractLine: contractLine, contractSaw: contractSaw, stackSaw: stackSaw, badLine: badLine, staticFallback: staticFallback, ideasHTML: ideasHTML, checkHTML: checkHTML, sizing: sizing, deeperHTML: deeperHTML,
    factsHTML: factsHTML, sourcesHTML: sourcesHTML, BORROWED: BORROWED, SHARES: SHARES, fmtN: fmtN, M: M, pct: pct, x2: x2 };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H;
  function bold(t) { return LX.rich(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>"); }
  function readouts(host, labels) {
    var box = H("div", { class: "lx-readouts", "aria-live": "polite" }, host), out = {};
    labels.forEach(function (l) { var d = H("div", { class: "lx-readout" }, box); H("span", { text: l[1] }, d); out[l[0]] = H("b", null, d); });
    return out;
  }
  // the capital stack: layers bottom to top (grant, debt, tax equity, sponsor), each a button; scaled or schematic
  var ORDER = ["sponsor", "te", "debt", "grant"];   // top to bottom on screen
  function StackBar(host, X, o) {
    var wrap = H("div", { class: "x5-stack" + (o.scaled ? " scaled" : "") }, host), btn = {};
    H("p", { class: "x5-stack-cap", text: o.caption }, wrap);
    var col = H("div", { class: "x5-stack-col", role: o.onPick ? "group" : null, "aria-label": o.label }, wrap);
    ORDER.forEach(function (k) {
      var l = X.layers.filter(function (y) { return y.key === k; })[0];
      var b = H(o.onPick ? "button" : "div", o.onPick ? { type: "button", class: "x5-layer", "data-k": k, "aria-pressed": "false", style: "--c:" + l.color } : { class: "x5-layer", "data-k": k, style: "--c:" + l.color }, col);
      H("span", { class: "nm", text: l.label }, b); H("span", { class: "v" }, b);
      if (o.onPick) b.addEventListener("click", function () { o.onPick(k); });
      btn[k] = b;
    });
    var side = H("div", { class: "x5-stack-side", "aria-hidden": "true" }, wrap);
    H("span", { text: "Paid last, most risk" }, side); H("span", { text: "Paid first, least risk" }, side);
    function set(S) {   // S: { key: [amount, share] } or null (schematic)
      ORDER.forEach(function (k) {
        var b = btn[k], v = b.querySelector(".v");
        if (!S) { b.style.flexGrow = "1"; v.textContent = k === "grant" ? "never repaid" : ""; b.hidden = false; return; }
        var sh = S[k][1];
        b.style.flexGrow = String(Math.max(sh, 0) * 100); b.hidden = sh <= 1e-9;
        v.textContent = M(S[k][0]) + " · " + pct(sh);
      });
    }
    function mark(k) { ORDER.forEach(function (j) { btn[j].setAttribute("aria-pressed", String(j === k)); btn[j].classList.toggle("on", j === k); }); }
    set(null);
    return { el: wrap, set: set, mark: mark };
  }
  function stackSpec(S) { return { debt: [S.debt, S.share.debt], te: [S.te, S.share.te], grant: [S.grant, S.share.grant], sponsor: [S.sponsor, S.share.sponsor] }; }

  LX.mount("x05", function (live, data, root) {
    var I = inputs(data), X = I.X, L = X.lender, P = project(I), Pth = data.path, STEPS = steps(P, L), demo = [];
    var st = { s: X.contract.start / 100, te: X.taxEquity.start / 100, g: X.grant.start / 100 };
    var cards = LX.StepCards(live, { id: "x5-steps", steps: [
      { text: STEPS[0], build: function (act, api) {
          var res = H("div", { class: "x5-res" });
          var pr = LX.Predict(act, { id: "x5-who", q: "Who puts in most of the money", title: false, answer: Q1.answer, options: Q1.options, feedback: Q1.feedback, onPick: function () { show(); } });
          act.appendChild(res);
          function show() { pr.reveal(); res.innerHTML = ""; LX.UnitChain(res, { label: "From sizes to the cost of building", steps: costChain(P) }); api.done(); api.saw(costSaw(P)); }
          if (pr.picked()) show();
          demo[0] = function () { if (!pr.picked()) { var b = act.querySelectorAll(".lx-choice")[1]; if (b) b.click(); } };
        } },
      { text: STEPS[1], build: function (act, api) {
          var seen = {}, line = H("p", { class: "lx-step-line", "aria-live": "polite", text: "Tap a layer." }), cnt = H("p", { class: "lx-hint", "aria-live": "polite" });
          var sb = StackBar(act, X, { caption: "The capital stack, schematic (not to scale)", label: "The four layers of the capital stack", onPick: pick });
          act.appendChild(line); act.appendChild(cnt);
          function pick(k) {
            seen[k] = true; sb.mark(k); line.innerHTML = layerHTML(X, k);
            var n = Object.keys(seen).length; cnt.textContent = "Layers opened: " + n + " of 4.";
            if (n === 4) { api.done(); api.saw(LAYER_SAW); }
          }
          demo[1] = function () { ORDER.forEach(pick); };
        } },
      { text: STEPS[2], build: function (act, api) {
          var ro = readouts(act, [["rev", "Revenue, typical year"], ["opex", "Operating costs"], ["cf", "Cash for debt service"], ["pay", "Loan payment a year"]]);
          var eq = H("p", { class: "lx-step-line x5-eq", "aria-live": "polite" }, act), verdict = H("p", { class: "lx-hint", "aria-live": "polite" }, act);
          var target = largestLoanM(P, L), moved = false;
          var sl = LX.Slider(act, { label: "Loan", color: "var(--lx-wind)", min: X.loan.range[0], max: X.loan.range[1], step: X.loan.step, value: 60, fmt: function (v) { return "$" + v + "M"; }, onChange: function () { moved = true; draw(); } });
          H("p", { class: "lx-hint", html: LX.rich("Fully contracted here. A level payment at " + fmtN(L.rate, 1) + "% over " + L.term + " years; one typical year in 2025 dollars stands for every year (simplified). " + L.dscrNote) }, act);
          var show = H("button", { type: "button", class: "lx-btn small", text: "Show me the largest loan" }, act);
          show.addEventListener("click", function () { sl.set(target, true); });
          ro.rev.textContent = M(P.rev); ro.opex.textContent = M(P.opex); ro.cf.textContent = M(P.cf);
          function draw() {
            var v = sl.val(); ro.pay.textContent = M(payment(L, v * 1e6)); eq.innerHTML = bold(cashLine(P, L, v)); verdict.textContent = loanVerdict(P, L, v);
            if (moved && v === target) { api.done(); api.saw(loanSaw(P, L)); }
          }
          draw();
          demo[2] = function () { sl.set(target, true); };
        } },
      { text: STEPS[3], build: function (act, api) {
          var ro = readouts(act, [["loan", "Loan the lender offers"], ["spon", "Sponsor's share, no tax equity or grant"], ["bad", "Bad-year coverage"]]);
          var line = H("p", { class: "lx-step-line", "aria-live": "polite" }, act), low = false, tried = false;
          var sl = LX.Slider(act, { label: "Sold under contract", color: "var(--lx-tier-2)", min: X.contract.range[0], max: X.contract.range[1], step: X.contract.step, value: Math.round(st.s * 100), fmt: function (v) { return v + "%"; }, onChange: function () { draw(); } });
          var tg = LX.Toggle(H("div", { class: "lx-toggles", role: "group", "aria-label": "The year" }, act), { label: "A bad year", on: false, onChange: function () { tried = tried || tg.val(); draw(); } });
          H("p", { class: "lx-hint", text: X.contract.note + " " + X.bad.note }, act);
          function draw() {
            var s = sl.val() / 100, D = debtMax(P, L, s), cf = yearCF(P, s, tg.val() ? X.bad : null);
            st.s = s; low = low || s <= 0.5;
            ro.loan.textContent = M(D); ro.spon.textContent = pct(1 - D / P.capex);
            ro.bad.textContent = x2(dscr(yearCF(P, s, X.bad), D, L));
            line.innerHTML = bold(contractLine(P, L, s, X)) + (tg.val() ? " This year: " + M(cf) + " of cash against a " + M(payment(L, D)) + " payment." : "");
            if (low && tried) { api.done(); api.saw(contractSaw(P, L, X)); }
          }
          draw();
          demo[3] = function () { sl.set(0, true); if (!tg.val()) tg.el.click(); };
        } },
      { text: STEPS[4], build: function (act, api) {
          var sb = StackBar(act, X, { scaled: true, caption: "The capital stack, to scale", label: "The capital stack" });
          var line = H("p", { class: "lx-step-line", "aria-live": "polite" }, act), moved = false;
          var c = H("div", { class: "x5-ctls" }, act);
          var a = LX.Slider(c, { label: "Tax equity, share of the cost", color: "var(--lx-tier-2)", min: X.taxEquity.range[0], max: X.taxEquity.range[1], step: X.taxEquity.step, value: Math.round(st.te * 100), fmt: function (v) { return v + "%"; }, onChange: function () { moved = true; draw(); } });
          var g = LX.Slider(c, { label: "Grant, share of the cost", color: "var(--lx-good)", min: X.grant.range[0], max: X.grant.range[1], step: X.grant.step, value: Math.round(st.g * 100), fmt: function (v) { return v + "%"; }, onChange: function () { moved = true; draw(); } });
          H("p", { class: "lx-hint", html: LX.rich(X.taxEquity.note.replace("lesson A12", LX.lessonRef(Pth, "A12").ready ? "[[lesson:a12-policy-instruments|lesson A12]]" : "lesson A12") + " " + X.grant.note + " The loan stays sized on the whole project's cash; in a real partnership tax equity takes a share of the cash first, so the loan would be smaller.") }, act);
          function draw() {
            st.te = a.val() / 100; st.g = g.val() / 100;
            var S = stack(P, L, st.s, st.te, st.g); sb.set(stackSpec(S)); line.innerHTML = bold(stackSaw(P, L, st.s, st.te, st.g));
            if (moved) { api.done(); api.saw(stackSaw(P, L, st.s, st.te, st.g)); }
          }
          draw();
          demo[4] = function () { a.set(30, true); g.set(2, true); };
        } },
      { text: STEPS[5], build: function (act, api) {
          var R = X.risks, res = H("p", { class: "lx-step-line", "aria-live": "polite" });
          var pr = LX.Predict(act, { id: "x5-first", q: "Who loses money first", title: false, answer: R.answer, options: R.options, feedback: R.feedback, onPick: function () { show(); } });
          act.appendChild(res);
          function show() { pr.reveal(); res.innerHTML = bold(badLine(P, L, st.s, X)); api.done(); buildExplain(); }
          if (pr.picked()) show();
          H("a", { class: "lx-btn small", style: "justify-self:start;margin-top:10px", href: "#explain", html: "The stack and its cash, as diagrams" + LX.icon("arrow") }, act);
          demo[5] = function () { if (!pr.picked()) { var b = act.querySelectorAll(".lx-choice")[2]; if (b) b.click(); } };
        } }
    ] });

    // ---------------------------------------------------------------- the explain layer (the reader's last stack)
    var xhost = document.getElementById("x05-explain");
    function buildExplain() {
      if (!xhost) return;
      xhost.innerHTML = ""; xhost.classList.add("is-live");
      var S = stack(P, L, st.s, st.te, st.g), D = S.debt, pay = payment(L, D);
      var c1 = H("div", { class: "lx-xcard" }, xhost);
      H("h3", { text: "Your capital stack, annotated" }, c1);
      H("p", { class: "lx-lede", text: pct(st.s) + " sold under contract, " + pct(st.te) + " tax equity, a " + pct(st.g) + " grant; 2025 dollars, illustrative." }, c1);
      StackBar(c1, X, { scaled: true, caption: "To scale: " + M(P.capex) + " in all", label: "Your capital stack" }).set(stackSpec(S));
      var ol = H("ol", { class: "x5-notes" }, c1);
      [["Senior debt, " + M(D), "sized so typical-year cash covers each payment by the lender's margin; paid first."],
       ["Tax equity, " + M(S.te), "only where tax credits apply; takes most tax benefits and some cash, ahead of the sponsor."],
       ["Grant, " + M(S.grant), "public money under a program's rules; never repaid."],
       ["Sponsor equity, " + M(S.sponsor), "what is left to find; paid last, so it carries the most risk."]].forEach(function (n) { H("li", { html: "<b>" + LX.esc(n[0]) + ":</b> " + LX.esc(n[1]) }, ol); });
      LX.EnergyChain(H("div", { class: "lx-xcard" }, xhost), { title: "Where a typical year's cash goes", aside: "Your stack, 2025 dollars", lede: "Each layer is paid from what the one before it leaves.",
        stops: [{ icon: "coin", title: "Revenue", text: "contract and market sales", value: M(P.rev) },
                { icon: "plant", title: "Operating costs", text: "paid first", value: "− " + M(P.opex) },
                { icon: "lock", title: "Loan payment", text: "coverage " + x2(dscr(P.cf, D, L)), value: "− " + M(pay) },
                { icon: "check", title: "Left for the owners", text: "tax equity, then sponsor", value: M(P.cf - pay) }] });
      LX.Boundary(H("div", { class: "lx-xcard" }, xhost), { title: "Where this stack holds",
        holds: ["one typical year stands for every year of the loan, in 2025 dollars;", "contracted and market sales earn the same on average;", "the lender's coverage ratios are illustrative values inside the 2025 ATB's range."],
        leaves: ["taxes, depreciation and the tax-equity flip;", "construction loans, reserve accounts and loan fees;", "P50 and P99 energy cases, inflation and the battery's replacement."],
        source: "Costs: lessons 7 and 13 (EIA, NREL); battery and price: lessons A2 and A1 (illustrative); finance ranges: NREL ATB 2025 and NREL (2017)." });
      var nx = H("div", { class: "lx-xcard" }, xhost);
      H("h3", { text: "Where this connects" }, nx);
      var ul = H("ul", { class: "x5-next" }, nx);
      [["A1", "net present value and the cost of capital"], ["A2", "who carries price, volume and basis risk under each contract"], ["A12", "the tax credits that make tax equity possible, and the 2025 changes"], ["M11", "a project's cash flows inside an optimization model"]]
        .forEach(function (x) { H("li", { html: LX.lessonRefHTML(Pth, x[0]) + ": " + LX.esc(x[1]) + "." }, ul); });
    }
    buildExplain();

    LX.demo(root, function (state) {
      var n = state === "mid" ? 4 : +((/^step-(\d+)$/.exec(state) || [])[1] || 0); if (!n) return null;
      var k = Math.max(0, Math.min(5, n - 1));
      for (var j = 0; j <= k; j++) { cards.go(j); if (demo[j]) demo[j](); }
      return { view: "step " + (k + 1) };
    }, cards);
    root.lxLesson = { model: model, P: P, cards: cards, state: st };
  });
})();
