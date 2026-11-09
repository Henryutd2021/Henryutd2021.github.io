// x05-project-finance.js — Side topic X5, "How are big energy projects actually financed?" (step cards, Analyst,
// side line, D1, closed form). Every contract and offtake
// example is wind, solar, storage or gas (here a wind PPA and a battery tolling agreement).
//
// Data (read through data-src, never retyped):
//   data/x05-project-finance.json   the lender's settings (illustrative, inside the 2025 ATB's ranges), the slider
//                                   ranges, the bad year, the payment structure, the four layers, the facts, the stop
//                                   box and the sources (each a citation, a date and the short claims it supports)
//   data/x05-inputs.json            the finance-only projection of the other lessons' data, written by the X5 test
//                                   (--write) and checked against its sources on every run (the page loads
//                                   only the fields it uses):
//     from 07-cost.json             the wind farm's building cost ($/kW), fixed upkeep ($/kW-yr) and capacity factor
//     from 13-capstone.json         the battery's cost per kW and per kWh (2025 dollars) and its fixed upkeep share
//     from a02-contracts-risk.json  A2's battery: 50 MW, 4 hours, one discharge a day, and its margin's distribution
//     from a01-project-tea.json     A1's contract price for the wind farm's output ($/MWh, illustrative)
//     from town.json                Prairie Town's wind farm size (MW)
//   data/path.json                  lesson links that appear once a lesson is live
//
// Model (closed form, one typical year in 2025 dollars):
//   cost        C = wind MW × 1,000 × $/kW + battery MW × 1,000 × $/kW + battery MWh × 1,000 × $/kWh
//   earnings    R = wind sales + battery earnings after charging = wind MWh × price + battery MWh discharged × expected
//               margin, where wind MWh = MW × 8,760 × CF and the expected margin (after paying for charging and losses) of
//               A2's lognormal is median × exp(σ²/2) (the battery's fair toll in A2)
//   cash        CFADS = R − remaining operating costs (fixed upkeep: wind $/kW-yr × kW + battery share × battery cost)
//   structure   project-level debt, paid before either equity investor (one stated structure throughout)
//   payment     a level loan at rate r over n years: payment = loan × r ÷ (1 − (1 + r)^−n); no inflation, so the ATB's
//               nominal 6.5% is used as the toy's rate on 2025-dollar cash (stated on the page)
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
    var Y = data.x05_inputs;
    return { X: data[KEY], C7: Y.C7, C13: Y.C13, A2: Y.A2, A1: Y.A1, T: Y.T };
  }
  // the finance-only projection of the other lessons' files: only the fields X5 reads (the test writes and checks it)
  var PROJ = { C7: { techs: { wind: ["capex", "fom", "cf"] }, sources: ["eia-aeo2026-emm", "eia-epa-cf"] }, C13: { techs: { battery: ["powerCapex", "energyCapex", "fomShare", "source", "note"] }, sources: ["nrel-battery-2025", "bea-nipa-119"] },
    A2: { plant: ["batteryMW", "batteryHours", "cyclesPerYear"], sim: { spread: ["median", "sigma"] } }, A1: ["price"], T: { fleet: { wind: ["mw"] } } };
  function projectInputs(full) {   // full: { C7, C13, A2, A1, T } as the lessons' files hold them
    function pick(src, spec) {   // a list names the fields (or sources) to copy whole; an object recurses
      if (Array.isArray(spec)) { var o = {}; spec.forEach(function (k) { o[k] = src[k]; }); return o; }
      var r = {}; Object.keys(spec).forEach(function (k) { r[k] = pick(src[k], spec[k]); }); return r;
    }
    var out = {}; Object.keys(PROJ).forEach(function (k) { out[k] = pick(full[k], PROJ[k]); }); return out;
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
  function M3(v) { return "$" + fmtN(v / 1e6, 3) + "M"; }   // to the nearest $1,000
  function pct(x, d) { return fmtN(100 * x, d || 0) + "%"; }
  function x2(v) { return fmtN(v, 2); }
  function usd(v, d) { return "$" + fmtN(v, d || 0); }

  // ---------------------------------------------------------------- the words the page shows (pure, tested)
  function steps(P, L) {
    return [
      "Prairie Town's " + P.windMW + " MW wind farm and a " + P.batMW + " MW, " + P.batH + "-hour battery cost about $" + fmtN(P.capex / 1e6) + " million to build, in 2025 dollars. Who usually puts in most of that money?",
      "That money comes in layers, a [[capital-stack|capital stack]]: lenders and investors are repaid in a set order; a grant is not repaid. Tap each of the four layers to see who provides it.",
      "Lenders size the loan from the [[cash-flow-available-for-debt-service|cash available for debt service]]: revenue minus operating costs. Slide the loan; find the largest one whose [[debt-service-coverage-ratio|coverage ratio]] stays at " + x2(L.dscrContract) + " or above.",
      "Now sell less output under contract: the project earns the same on average, but the lender asks a stricter " + x2(L.dscrMerchant) + " from market cash. Slide the share to " + pct(LOW) + " or less, then switch on a bad year.",
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
            { v: M(P.capexBat), u: "battery: " + fmtN(P.batMW * 1000) + " kW × $" + fmtN(P.bPow, 2) + "/kW + " + fmtN(P.batMWh * 1000) + " kWh × $" + fmtN(P.bEn, 2) + "/kWh" }, { op: "=" },
            { v: M(P.capex), u: "to build, 2025 dollars", out: true }];
  }
  function costSaw(P) { return "The money: " + M(P.capexWind) + " for the wind farm and " + M(P.capexBat) + " for the battery, " + M(P.capex) + " in all (building costs from lessons 7 and 13)."; }
  function layerHTML(X, k) {   // a layer's card: who, what it gets, when it is paid (three short lines)
    var l = X.layers.filter(function (y) { return y.key === k; })[0];
    return "<b>" + esc(l.label) + "</b><dl class=\"x5-dl\"><dt>Who</dt><dd>" + esc(l.who) + "</dd><dt>Gets</dt><dd>" + esc(l.gets) + "</dd><dt>Paid</dt><dd>" + esc(l.paid) + "</dd></dl>";
  }
  var LAYER_SAW = "Order of payment in this example: operating costs, then the loan, then tax equity, then the sponsor. A grant is never paid back.";
  var LOW = 0.5;   // step 4 asks for a contracted share of 50% or less before it counts as done
  // where a typical year's cash comes from (the battery's earnings are already net of its charging costs)
  function ledgerRows(P) {
    return [["Wind sales", fmtN(P.windMWh) + " MWh × $" + fmtN(P.price) + "/MWh", P.windRev], ["Battery earnings after charging", fmtN(P.discharged) + " MWh discharged × $" + fmtN(P.margin, 2) + "/MWh margin", P.batRev],
            ["Remaining operating costs", "fixed upkeep of the wind farm and the battery", -P.opex], ["Cash available for debt service", "what is left to pay the loan", P.cf]];
  }
  function ledgerHTML(P) {
    return "<table class=\"lx-mini-table x5-led\"><tbody>" + ledgerRows(P).map(function (r, i) { return "<tr" + (i === 3 ? " class=\"tot\"" : "") + "><th scope=\"row\">" + esc(r[0]) + "</th><td>" + esc(r[1]) + "</td><td class=\"n\">" + (r[2] < 0 ? "− " : "") + M(Math.abs(r[2])) + "</td></tr>"; }).join("") + "</tbody></table>";
  }
  function cashLine(P, L, loanM) {
    var pay = payment(L, loanM * 1e6), d = dscr(P.cf, loanM * 1e6, L);
    // the amounts are rounded to $1,000 and the ratio comes from the unrounded ones, hence "≈"
    return isFinite(d) ? "DSCR = " + M3(P.cf) + " ÷ " + M3(pay) + " ≈ **" + fmtN(d, 3) + "**" : "DSCR: no loan, no payment to cover.";
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
  // the toy lender's rule for a part-contracted project: a loan on each share of the cash at its own coverage, added
  function ruleLine(L) { return "The toy lender sizes one loan on the contracted share of the cash, at " + x2(L.dscrContract) + ", and one on the market share, at " + x2(L.dscrMerchant) + ", then adds them; both ratios are illustrative."; }
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
  var REPAID = ["sponsor", "te", "debt"];   // the repaid layers, top to bottom on screen (paid last to paid first)
  var ORDER = REPAID.concat(["grant"]);      // and the grant, drawn apart below them
  // every layer keeps a minimum height so its label fits, so a scaled stack is not exactly to scale
  var SCALED_CAP = "Heights approximate (each layer keeps a minimum height); read the percentages for exact shares.";
  // the explain layer's opening line: the reader's own settings (refreshed whenever they change)
  function explainLede(st) { return pct(st.s) + " sold under contract, " + pct(st.te) + " tax equity, a " + pct(st.g) + " grant; 2025 dollars, illustrative."; }
  function staticFallback(P, L, X) {
    return "<p class=\"lx-eyebrow\">One wind and storage project, one typical year, 2025 dollars (illustrative)</p>" +
      "<p>" + P.windMW + " MW of wind and a " + P.batMW + " MW, " + P.batH + "-hour battery cost " + M(P.capex) + " to build. A typical year's cash:</p>" + ledgerHTML(P) +
      "<p class=\"lx-eyebrow\">The capital stack: three layers in the order they are repaid, then a grant, which is not</p><ul class=\"x5-fbl\">" +
      ["debt", "te", "sponsor", "grant"].map(function (k) { var l = X.layers.filter(function (y) { return y.key === k; })[0]; return "<li><b>" + esc(l.label) + "</b><ul><li>Who: " + esc(l.who) + "</li><li>Gets: " + esc(l.gets) + "</li><li>Paid: " + esc(l.paid) + "</li></ul></li>"; }).join("") +
      "</ul><p class=\"lx-hint\">" + esc(X.structure) + "</p>" +
      "<div class=\"lx-scroll-x\"><table class=\"lx-mini-table x5-fbt\"><thead><tr><th scope=\"col\">Sold under contract</th><th scope=\"col\">Largest loan</th><th scope=\"col\">Share of the cost</th><th scope=\"col\">Sponsor's share with no tax equity or grant</th><th scope=\"col\">Bad-year coverage</th></tr></thead><tbody>" +
      SHARES.map(function (s) { var D = debtMax(P, L, s); return "<tr><td>" + pct(s) + "</td><td>" + M(D) + "</td><td>" + pct(D / P.capex) + "</td><td>" + pct(1 - D / P.capex) + "</td><td>" + x2(dscr(yearCF(P, s, X.bad), D, L)) + "</td></tr>"; }).join("") +
      "</tbody></table></div>" +
      "<p class=\"lx-hint\">" + esc(ruleLine(L)) + "</p>" +
      "<p class=\"lx-hint\">Loan at " + fmtN(L.rate, 1) + "% over " + L.term + " years, no inflation. " + esc(X.bad.note.split(". ")[0]) + ".</p>" +
      "<p class=\"lx-hint\">With JavaScript on, you build the stack step by step: tap its layers, size the loan, sell less under contract, add tax equity and a grant, and see who loses first in a bad year.</p>";
  }
  function ideasHTML(P, L, X) {
    var D1 = debtMax(P, L, 1), D0 = debtMax(P, L, 0);
    return "<dl class=\"lx-ideas\">" +
      "<dt>A capital stack</dt><dd>A big project's money comes in layers: senior debt, tax equity, the sponsor's own equity and sometimes a grant.</dd>" +
      "<dt>Order of payment</dt><dd>With project-level debt, as here, cash pays operating costs, then the loan, then tax equity, then the sponsor; the sponsor is paid last and loses first.</dd>" +
      "<dt>Coverage</dt><dd>A lender sizes the loan so the cash available for debt service covers each payment by a margin, the debt-service coverage ratio.</dd>" +
      "<dt>Why contracts matter</dt><dd>With the same expected revenue, this project supports " + M(D1) + " of debt fully contracted and " + M(D0) + " fully merchant.</dd>" +
      "<dt>Illustrative</dt><dd>One typical year in 2025 dollars with no inflation; the lender's coverage ratios are the toy's own; no taxes, tax-equity terms or reserve accounts.</dd></dl>";
  }
  function checkHTML(P, L) {
    var pay = payment(L, debtMax(P, L, 1)), d = P.cf / pay;
    return "<div class=\"lx-myths\" data-quiz=\"x05-myth\">" +
      "<div class=\"lx-qq\" data-id=\"debtcost\" data-answer=\"myth\"><p class=\"lx-qtext\">Myth or fact? “Debt is the most expensive money in a project's capital stack.”</p><ul class=\"lx-choices\"><li data-value=\"myth\">Myth</li><li data-value=\"fact\">Fact</li></ul><details class=\"lx-answer\"><summary>Answer</summary><p>Myth. Debt is paid first and protected by the project's assets pledged as security, so it asks a lower return than equity: the 2025 ATB assumes " + fmtN(L.rate, 1) + "% for term debt and more for equity.</p></details></div>" +
      "</div><div class=\"lx-quiz\" data-quiz=\"x05\">" +
      "<div class=\"lx-qq\" data-id=\"dscr\" data-answer=\"b\"><p class=\"lx-qtext\">A project's cash available for debt service is " + M(P.cf) + " a year and its loan payment is " + M(pay) + ". What is its debt-service coverage ratio?</p><ul class=\"lx-choices\"><li data-value=\"a\">About " + x2(pay / P.cf) + "</li><li data-value=\"b\">About " + x2(d) + "</li><li data-value=\"c\">About " + x2(d + 1) + "</li></ul><details class=\"lx-answer\"><summary>Answer</summary><p>" + M(P.cf) + " ÷ " + M(pay) + " = " + x2(d) + ": the cash covers the payment " + x2(d) + " times. The ratio is cash over payment, not payment over cash (" + x2(pay / P.cf) + ").</p></details></div>" +
      "</div>";
  }
  // the Go deeper box (D1, so the coverage rule in words with one symbolic line, the payment, and a link to A1
  // for how a rate and a term turn a payment into a loan); every shown number follows from the ones shown before it
  function sizing(P, L) {
    var cfM = Math.round(P.cf / 1e3) / 1e3, payC = Math.round(cfM / L.dscrContract * 1e3) / 1e3, payM = Math.round(cfM / L.dscrMerchant * 1e3) / 1e3;
    var c = Math.round(payC / payRate(L) * 100) / 100, m = Math.round(payM / payRate(L) * 100) / 100;
    return { cfM: cfM, payC: payC, payM: payM, c: c, m: m, half: Math.round((c + m) / 2 * 100) / 100 };
  }
  function deeperHTML(P, L) {
    var z = sizing(P, L);
    return "<p>The lender's rule in words: the yearly loan payment may be at most the cash available for debt service divided by the coverage it asks.</p>" +
      "<p class=\"x5-eq\">largest payment = <span class=\"lx-term\" data-term=\"cash-flow-available-for-debt-service\">CFADS</span> ÷ <span class=\"lx-term\" data-term=\"debt-service-coverage-ratio\">DSCR</span></p>" +
      "<ul><li><b>Fully contracted:</b> $" + fmtN(z.cfM, 3) + "M ÷ " + x2(L.dscrContract) + " = $" + fmtN(z.payC, 3) + "M a year; at " + fmtN(L.rate, 1) + "% over " + L.term + " years that payment repays a loan of $" + fmtN(z.c, 2) + "M.</li>" +
      "<li><b>Fully merchant:</b> $" + fmtN(z.cfM, 3) + "M ÷ " + x2(L.dscrMerchant) + " = $" + fmtN(z.payM, 3) + "M a year, which repays $" + fmtN(z.m, 2) + "M.</li>" +
      "<li><b>In between:</b> each share of the cash carries its own loan; at 50% contracted, half of each: ($" + fmtN(z.c, 2) + "M + $" + fmtN(z.m, 2) + "M) ÷ 2 = $" + fmtN(z.half, 2) + "M.</li>" +
      "<li><b>From a payment to a loan:</b> lesson <a href=\"a01-project-tea.html\">A1</a> shows how a rate and a term turn a yearly amount into an amount today.</li></ul>";
  }
  function factsHTML(X) {
    return "<table class=\"lx-facts\"><thead><tr><th scope=\"col\">Number</th><th scope=\"col\">What it means</th><th scope=\"col\">Source</th></tr></thead><tbody>" +
      X.facts.map(function (f) {
        var s = X.sources[f.src], extra = f.dollars ? " About $" + fmtN(deflate(X, f.dollars.lo)) + " to $" + fmtN(deflate(X, f.dollars.hi)) + "/MWh in 2025 dollars." : "";
        return "<tr><td class=\"n\">" + esc(f.n) + "</td><td>" + esc(f.what) + extra + "</td><td class=\"s\"><a href=\"" + esc(s.url) + "\">" + esc(s.cite) + "</a>" + (f.where ? ", " + esc(f.where) : "") + " · " + esc(cap(s.asOf)) + "</td></tr>";
      }).join("") + "</tbody></table>";
  }
  // the project's own inputs, each from the data file that holds it
  var BORROWED = [["07_cost", "eia-aeo2026-emm", "wind farm: building cost and fixed upkeep (lesson 7)"], ["07_cost", "eia-epa-cf", "wind farm: capacity factor (lesson 7)"], ["13_capstone", "nrel-battery-2025", "battery: building cost and upkeep (lesson 13)"], ["13_capstone", "bea-nipa-119", "battery: 2024 to 2025 dollars (lesson 13)"]];
  function cap(t) { return t.charAt(0).toUpperCase() + t.slice(1); }
  // a source: its citation, link and date, then the short claims it supports, one per line (citation
  // metadata apart from the teaching claims)
  function srcLi(s) { return "<li>" + esc(s.cite) + (s.url ? ". <a href=\"" + esc(s.url) + "\">Link</a>" : "") + (s.asOf ? ". " + esc(cap(s.asOf)) : "") + ".<ul class=\"x5-used\">" + s.used.map(function (u) { return "<li>" + esc(u) + "</li>"; }).join("") + "</ul></li>"; }
  function sourcesHTML(I) {
    var X = I.X, own = Object.keys(X.sources).map(function (k) { return srcLi(X.sources[k]); }).join("");
    var lent = BORROWED.map(function (b) { var s = I[b[0] === "07_cost" ? "C7" : "C13"].sources[b[1]]; return srcLi({ cite: s.text.split(" (")[0], used: [cap(b[2])], url: s.url, asOf: s.asOf }); }).join("");
    return "<p class=\"lx-hint\">Finance:</p><ul>" + own + "</ul><p class=\"lx-hint\">The project's costs and output, read from other lessons' data:</p><ul>" + lent +
      "<li>Battery size, daily cycle and margin: lesson A2's illustrative plant and simulation. Contract price: lesson A1's illustrative $" + I.A1.price + "/MWh. Wind farm size: Prairie Town (fictional, illustrative).</li></ul>";
  }

  var model = { inputs: inputs, projectInputs: projectInputs, PROJ: PROJ, ledgerRows: ledgerRows, ledgerHTML: ledgerHTML, explainLede: explainLede, SCALED_CAP: SCALED_CAP, project: project, payRate: payRate, payment: payment, debtMax: debtMax, yearCF: yearCF, dscr: dscr, largestLoanM: largestLoanM, stack: stack, deflate: deflate,
    steps: steps, Q1: Q1, costChain: costChain, costSaw: costSaw, layerHTML: layerHTML, LAYER_SAW: LAYER_SAW, cashLine: cashLine, loanVerdict: loanVerdict, loanSaw: loanSaw,
    contractLine: contractLine, ruleLine: ruleLine, LOW: LOW, M3: M3, contractSaw: contractSaw, stackSaw: stackSaw, badLine: badLine, staticFallback: staticFallback, ideasHTML: ideasHTML, checkHTML: checkHTML, sizing: sizing, deeperHTML: deeperHTML,
    factsHTML: factsHTML, sourcesHTML: sourcesHTML, BORROWED: BORROWED, SHARES: SHARES, REPAID: REPAID, ORDER: ORDER, fmtN: fmtN, M: M, pct: pct, x2: x2 };
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
  // the capital stack: the repaid layers bottom to top (debt, tax equity, sponsor) in one column, beside the order of
  // repayment, and the grant in a row of its own below (paid in at the start, outside that order); each a button in
  // step 2; scaled or schematic
  function StackBar(host, X, o) {
    var wrap = H("div", { class: "x5-stack" + (o.scaled ? " scaled" : ""), role: o.onPick ? "group" : null, "aria-label": o.label }, host), btn = {};
    H("p", { class: "x5-stack-cap", text: o.caption }, wrap);
    var col = H("div", { class: "x5-stack-col" }, wrap);
    function layer(k, parent) {
      var l = X.layers.filter(function (y) { return y.key === k; })[0];
      var b = H(o.onPick ? "button" : "div", o.onPick ? { type: "button", class: "x5-layer", "data-k": k, "aria-pressed": "false", style: "--c:" + l.color } : { class: "x5-layer", "data-k": k, style: "--c:" + l.color }, parent);
      H("span", { class: "nm", text: l.label }, b); H("span", { class: "v" }, b);
      if (o.onPick) b.addEventListener("click", function () { o.onPick(k); });
      btn[k] = b;
    }
    REPAID.forEach(function (k) { layer(k, col); });
    var side = H("div", { class: "x5-stack-side", "aria-hidden": "true" }, wrap);
    H("span", { text: "Repaid last, most risk" }, side); H("span", { text: "Repaid first, least risk" }, side);
    var grow = H("div", { class: "x5-grant-row" }, wrap); layer("grant", grow);
    var gside = H("div", { class: "x5-stack-side x5-gside", "aria-hidden": "true" }, wrap); H("span", { text: "Paid in at the start, never repaid" }, gside);
    function set(S) {   // S: { key: [amount, share] } or null (schematic)
      ORDER.forEach(function (k) {
        var b = btn[k], v = b.querySelector(".v");
        if (!S) { b.style.flexGrow = "1"; v.textContent = k === "grant" ? "never repaid" : ""; b.hidden = false; return; }
        var sh = S[k][1];
        b.style.flexGrow = String(Math.max(sh, 0) * 100); b.hidden = sh <= 1e-9;
        v.textContent = M(S[k][0]) + " · " + pct(sh);
      });
      grow.hidden = btn.grant.hidden; gside.hidden = btn.grant.hidden;
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
          act.appendChild(line); act.appendChild(cnt); H("p", { class: "lx-hint", text: X.structure }, act);
          function pick(k) {
            seen[k] = true; sb.mark(k); line.innerHTML = layerHTML(X, k);
            var n = Object.keys(seen).length; cnt.textContent = "Layers opened: " + n + " of 4.";
            if (n === 4) { api.done(); api.saw(LAYER_SAW); }
          }
          demo[1] = function () { ORDER.forEach(pick); };
        } },
      { text: STEPS[2], build: function (act, api) {
          var ro = readouts(act, [["rev", "Wind sales + battery earnings after charging"], ["opex", "Remaining operating costs"], ["cf", "Cash for debt service"], ["pay", "Loan payment a year"]]);
          var led = H("details", { class: "x5-ledd" }, act); H("summary", { text: "Where these numbers come from" }, led); led.insertAdjacentHTML("beforeend", ledgerHTML(P));
          led.addEventListener("toggle", function () { LX.emit("layout"); });
          var eq = H("p", { class: "lx-step-line x5-eq", "aria-live": "polite" }, act), verdict = H("p", { class: "lx-hint", "aria-live": "polite" }, act);
          var target = largestLoanM(P, L), moved = false;
          var sl = LX.Slider(act, { label: "Loan", color: "var(--lx-wind)", min: X.loan.range[0], max: X.loan.range[1], step: X.loan.step, value: 60, fmt: function (v) { return "$" + v + "M"; }, onChange: function () { moved = true; draw(); } });
          H("p", { class: "lx-hint", text: "Fully contracted here. The loan is repaid in equal yearly payments at " + fmtN(L.rate, 1) + "% over " + L.term + " years." }, act);
          H("p", { class: "lx-hint", text: L.dscrNote }, act);
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
          H("p", { class: "lx-hint", html: LX.rich(X.contract.note) }, act); H("p", { class: "lx-hint", text: ruleLine(L) }, act); H("p", { class: "lx-hint", text: X.bad.note }, act);
          function draw() {
            var s = sl.val() / 100, D = debtMax(P, L, s), cf = yearCF(P, s, tg.val() ? X.bad : null);
            st.s = s; low = low || s <= LOW + 1e-9;
            ro.loan.textContent = M(D); ro.spon.textContent = pct(1 - D / P.capex);
            ro.bad.textContent = x2(dscr(yearCF(P, s, X.bad), D, L));
            line.innerHTML = bold(contractLine(P, L, s, X)) + (tg.val() ? " This year: " + M(cf) + " of cash against a " + M(payment(L, D)) + " payment." : "");
            if (low && tried) { api.done(); api.saw(contractSaw(P, L, X)); }
            refreshExplain();
          }
          draw();
          demo[3] = function () { sl.set(0, true); if (!tg.val()) tg.el.click(); };
        } },
      { text: STEPS[4], build: function (act, api) {
          var sb = StackBar(act, X, { scaled: true, caption: SCALED_CAP, label: "The capital stack" });
          var line = H("p", { class: "lx-step-line", "aria-live": "polite" }, act), moved = false;
          var c = H("div", { class: "x5-ctls" }, act);
          var a = LX.Slider(c, { label: "Tax equity, share of the cost", color: "var(--lx-tier-2)", min: X.taxEquity.range[0], max: X.taxEquity.range[1], step: X.taxEquity.step, value: Math.round(st.te * 100), fmt: function (v) { return v + "%"; }, onChange: function () { moved = true; draw(); } });
          var g = LX.Slider(c, { label: "Grant, share of the cost", color: "var(--lx-good)", min: X.grant.range[0], max: X.grant.range[1], step: X.grant.step, value: Math.round(st.g * 100), fmt: function (v) { return v + "%"; }, onChange: function () { moved = true; draw(); } });
          H("p", { class: "lx-hint", html: LX.rich(X.taxEquity.note.replace("lesson A12", LX.lessonRef(Pth, "A12").ready ? "[[lesson:a12-policy-instruments|lesson A12]]" : "lesson A12") + " Both shares are yours to set, illustrative.") }, act);
          H("p", { class: "lx-hint", text: X.structure }, act);
          function draw() {
            st.te = a.val() / 100; st.g = g.val() / 100;
            var S = stack(P, L, st.s, st.te, st.g); sb.set(stackSpec(S)); line.innerHTML = bold(stackSaw(P, L, st.s, st.te, st.g));
            if (moved) { api.done(); api.saw(stackSaw(P, L, st.s, st.te, st.g)); }
            refreshExplain();
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
    var xhost = document.getElementById("x05-explain"), xTimer = null;
    // the explain layer follows the reader's settings: rebuilt (debounced) whenever step 4 or 5 changes them, so a reader
    // who jumps to Explain never sees an older stack
    function refreshExplain() { if (!xhost) return; clearTimeout(xTimer); xTimer = setTimeout(buildExplain, 120); }
    function buildExplain() {
      if (!xhost) return;
      xhost.innerHTML = ""; xhost.classList.add("is-live");
      var S = stack(P, L, st.s, st.te, st.g), D = S.debt, pay = payment(L, D);
      var c1 = H("div", { class: "lx-xcard" }, xhost);
      H("h3", { text: "Your capital stack, annotated" }, c1);
      H("p", { class: "lx-lede", text: explainLede(st) }, c1);
      StackBar(c1, X, { scaled: true, caption: M(P.capex) + " in all. " + SCALED_CAP, label: "Your capital stack" }).set(stackSpec(S));
      var ol = H("ol", { class: "x5-notes" }, c1);
      [["Senior debt, " + M(D), "project-level debt, sized so typical-year cash covers each payment by the lender's margin; paid first, after operating costs."],
       ["Tax equity, " + M(S.te), "only where tax credits apply; takes most tax benefits and some cash, ahead of the sponsor."],
       ["Sponsor equity, " + M(S.sponsor), "what is left to find; paid last, so it carries the most risk."],
       ["Grant, " + M(S.grant), "public money under a program's rules, paid in at the start; outside the order of repayment, never repaid."]].forEach(function (n) { H("li", { html: "<b>" + LX.esc(n[0]) + ":</b> " + LX.esc(n[1]) }, ol); });
      LX.EnergyChain(H("div", { class: "lx-xcard" }, xhost), { title: "Where a typical year's cash goes", aside: "Your stack, 2025 dollars", lede: "Each layer is paid from what the one before it leaves.",
        stops: [{ icon: "coin", title: "Sales and earnings", text: "wind sales + battery earnings after charging", value: M(P.rev) },
                { icon: "plant", title: "Remaining operating costs", text: "fixed upkeep, paid first", value: "− " + M(P.opex) },
                { icon: "lock", title: "Loan payment", text: "coverage " + x2(dscr(P.cf, D, L)), value: "− " + M(pay) },
                { icon: "check", title: "Left for the owners", text: "tax equity, then sponsor", value: M(P.cf - pay) }] });
      LX.Boundary(H("div", { class: "lx-xcard" }, xhost), { title: "Where this stack holds",
        holds: ["project-level debt, paid before either equity investor;", "one typical year stands for every year of the loan, in 2025 dollars with no inflation, so the ATB's nominal rate is used as it is: " + fmtN(L.rate, 1) + "%;", "contracted and market sales earn the same on average;", "the lender sizes a loan on each share of the cash and adds them; its two coverage ratios are illustrative (the ATB's differ by technology, not by contract)."],
        leaves: ["taxes, depreciation, inflation and the terms of a tax-equity partnership;", "other deal structures, such as a loan to the sponsor alone;", "construction loans, reserve accounts and loan fees;", "lenders' low-wind cases, sized to be beaten in most years, and the battery's replacement."],
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
