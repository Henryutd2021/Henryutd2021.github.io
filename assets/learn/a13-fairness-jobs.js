// a13-fairness-jobs.js — Lesson A13, "Who pays and who benefits? Energy burden, fairness and jobs" (step cards, Analyst,
// D3).
//
// Data: assets/learn/data/a13-fairness-jobs.json (the plan's yearly cost as a learner input, the three designs, the
// groupings, Ridge County with its note, the job and tax coefficients as learner inputs, the sources),
// prairie-city.json (Prairie City's five household groups: households, incomes, electricity use and home energy spending;
// never retyped) and path.json.
// Accounting: assets/learn/components/whopays.js (LX.A13, in the learn.js bundle), a shared pure model that SB3 and C3 use; this file
// holds only the lesson's words and view. Every output is a screening estimate with its assumptions beside it.
//
// Model (closed form; no optimization), all in LX.A13:
//   split      per kWh: rate = cost / sum(households x kWh); fixed: cost / households; by income: cost x income /
//              sum(households x income); burden after = (home energy + charge) / income
//   transfer   design B minus design A, per group: sums to 0 (the same cost moved), so not a real cost
//   grouping   merged groups' burden = their total spending / their total income (five groups against two)
//   jobs       lost = (plant staff + mine jobs) x multiplier; building job-years = MW x $/kW x local share x direct
//              job-years per $M x multiplier (gross), over two building years; permanent = MW / 100 x direct jobs per
//              100 MW x multiplier (gross); net = gross x (1 - displacement), the same share for building and running;
//              the 20 years from retirement: building in years 1-2, running in years 3-20, the lost jobs in all 20
//   tax        plant tax = taxable value x rate; new tax = cost of the farms x taxable share x rate; county revenue =
//              other revenue + tax, the mines' coal taxes held fixed (a plant-property-tax comparison); the change if
//              they ended too is shown beside it
// Every number on the page comes from LX.A13 or the data files; _tests/learn/test_a13-fairness-jobs.js checks them.
//
// Shared components: LX.StepCards, LX.Predict, LX.Slider, LX.Plot, LX.Ledger, LX.Stakeholders, LX.Boundary,
// LX.lessonRefHTML. Lesson-local: the assumptions list (a13-assume) and the design buttons.
(function () {
  "use strict";
  var KEY = "a13_fairness_jobs";
  var A13 = typeof module !== "undefined" && module.exports ? require("./components/whopays.js") : (window.LX && window.LX.A13);

  // ---------------------------------------------------------------- pure helpers and words (no DOM; exported for Node)
  function fmtN(v, d) { return Number(v).toLocaleString("en-US", { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
  function pct(v, d) { return fmtN(100 * v, d == null ? 1 : d) + "%"; }
  function money(v) { return (v < -0.5 ? "−$" : "$") + fmtN(Math.abs(v)); }
  function moneyM(v, d) { var r = Number(Math.abs(v).toFixed(d == null ? 2 : d)); return (v < 0 && r > 0 ? "−$" : "$") + fmtN(r, d == null ? 2 : d) + "M"; }
  function signed(v, d) { var r = Number(Math.abs(v).toFixed(d == null ? 2 : d)); return (r === 0 ? "" : v < 0 ? "−" : "+") + "$" + fmtN(r, d == null ? 2 : d) + "M"; }
  function signed0(v, d) { return signed(v, d) || "$" + fmtN(0, d == null ? 2 : d) + "M"; }
  function pts(v) { return (v >= 0 ? "+" : "−") + fmtN(Math.abs(100 * v), 1) + " points"; }
  function cents(v) { return fmtN(100 * v, 2) + "¢"; }
  function sgn(v) { var r = Math.round(v); return (r < 0 ? "−" : r > 0 ? "+" : "") + fmtN(Math.abs(r)); }
  function shortOf(PC) { return PC.groups.map(function (g) { return g.amiPct[1] == null ? g.amiPct[0] + "%+" : g.amiPct[0] + "–" + g.amiPct[1] + "%"; }); }
  function design(D, key) { return D.designs.filter(function (x) { return x.key === key; })[0]; }
  function rows(PC) { return A13.groupsFrom(PC); }
  function split(D, PC, costM, key) { return A13.allocate(rows(PC), costM * 1e6, key); }
  function jobInputs(D, PC, S) {
    var R = D.ridgeCounty, J = D.jobs;
    return { staff: R.plant.staff, mineJobs: R.plant.mineJobs, multiplier: S.m, newMW: S.mw, capexPerKW: S.capex, localShare: J.localShare, jobYearsPerM: S.jy,
             buildYears: J.buildYears, omPer100MW: S.om, displacement: S.disp / 100, buildDisplacement: S.disp / 100, horizonYears: J.horizonYears };
  }
  function taxInputs(D, S) {
    var R = D.ridgeCounty;
    return { plantValueM: R.plant.valueM, rate: S.rate / 100, newCapexM: S.mw * S.capex / 1000, taxableShare: S.taxable / 100, otherRevenueM: R.otherRevenueM, mineCoalTaxM: R.mineCoalTaxM };
  }
  function defaults(D) {
    var J = D.jobs, T = D.tax;
    return { design: "kwh", costM: D.plan.costM.start, versus: "fixed", bands: "five", m: J.multiplier.start, mw: J.newMW.start, capex: J.capexPerKW.start,
             jy: J.jobYearsPerM.start, om: J.omPer100MW.start, disp: J.displacement.start, rate: T.rate.start, taxable: T.taxableShare.start };
  }

  var RISE = {
    q: "Charged per kWh, which group's energy burden rises the most?",
    answer: "g1",
    feedback: {
      g1: "Its homes use the least electricity, but each dollar weighs most against its small income.",
      g2: "The 0–30% group's rises more: it pays fewer dollars, but each weighs more against its small income.",
      g3: "The 0–30% group's rises most: it pays fewer dollars, but each weighs more against its small income.",
      g4: "The 0–30% group's rises most: it pays fewer dollars, but each weighs more against its small income.",
      g5: "The top group pays the most dollars, yet its burden rises least; the 0–30% group's rises most."
    }
  };
  function riseSaw(D, PC, costM) {
    var a = split(D, PC, costM, "kwh"), lo = a.rows[0], hi = a.rows[a.rows.length - 1];
    return "At " + cents(a.rate.perKWh) + " a kWh the poorest group pays " + money(lo.charge) + " a year, **" + pts(lo.delta) + "** of burden; the top group pays " + money(hi.charge) + ", " + pts(hi.delta) + ".";
  }
  function designLine(D, PC, costM, key) {
    var a = split(D, PC, costM, key), lo = a.rows[0], hi = a.rows[a.rows.length - 1];
    var how = key === "kwh" ? cents(a.rate.perKWh) + " on every kWh" : key === "fixed" ? money(a.rate.perHousehold) + " for every household" : pct(a.rate.shareOfIncome, 2) + " of every household's income";
    return design(D, key).name + ": " + how + ". The poorest group pays " + money(lo.charge) + " a year (" + pts(lo.delta) + "), the top group " + money(hi.charge) + " (" + pts(hi.delta) + ").";
  }
  function designSaw(D, PC, costM) {
    if (costM === 0) return "With no cost to recover, every design charges nothing and no burden moves.";
    var d = ["kwh", "fixed", "income"].map(function (k) { return split(D, PC, costM, k).rows[0].delta; });
    return "At " + moneyM(costM, 0) + " a year the poorest group's burden rises **" + fmtN(100 * d[0], 1) + "** points per kWh, " + fmtN(100 * d[1], 1) + " with a fixed charge and " + fmtN(100 * d[2], 1) + " by income.";
  }
  function moved(D, PC, costM, key) {
    var t = A13.transfers(split(D, PC, costM, "kwh"), split(D, PC, costM, key));
    var up = t.rows.filter(function (r) { return r.group > 0; }).reduce(function (s, r) { return s + r.group; }, 0);
    return { t: t, up: up };
  }
  function transferLine(D, PC, costM, key) {
    if (costM === 0) return "With no cost, nothing moves between groups.";
    var x = moved(D, PC, costM, key), gain = x.t.rows.filter(function (r) { return r.group > 0; }).length;
    return "Against per kWh, " + design(D, key).lower + " moves **" + moneyM(x.up / 1e6) + "** a year onto " + (["no group", "one group", "two groups", "three groups", "four groups"][gain]) + "; the total stays " + moneyM(costM, 0) + ", so the money moved adds up to zero.";
  }
  var TRANSFER_SAW = "Who pays changes; what the plan costs does not. A [[transfer|transfer]] moves money between groups and uses up nothing, so it never adds to the plan's real cost.";
  function groupLine(D, PC, costM, key, bands) {
    var a = split(D, PC, costM, key), B = D.bands[bands], g = A13.regroup(a, B.groups, B.labels || null);
    if (bands === "two") return "Merged, the households below 80% of area median income average **" + pct(g[0].burdenAfter) + "** after the plan; the poorest group alone averages " + pct(a.rows[0].burdenAfter) + ".";
    return "Five groups: from **" + pct(a.rows[0].burdenAfter) + "** in the poorest to " + pct(a.rows[a.rows.length - 1].burdenAfter) + " in the top group, after the plan.";
  }
  function groupSaw(D, PC) {
    var a = A13.allocate(rows(PC), 0, "kwh"), g = A13.regroup(a, D.bands.two.groups, D.bands.two.labels);
    return "Before any plan, the merged group averages " + pct(g[0].burden) + ", near LEAD's national average of about 6%, while the poorest group averages " + pct(a.rows[0].burden) + ". Say how you grouped households.";
  }
  function lostLine(D, PC, S) {
    var j = A13.jobs(jobInputs(D, PC, S)), P = D.ridgeCounty.plant;
    return fmtN(P.staff) + " plant jobs and " + fmtN(P.mineJobs) + " mine jobs end: " + fmtN(j.lostDirect) + " on site, about **" + fmtN(Math.round(j.lostTotal)) + "** with suppliers and spending, at a multiplier of " + fmtN(S.m, 1) + ".";
  }
  function lostSaw(D, PC, S) {
    var R = D.ridgeCounty, j = A13.jobs(jobInputs(D, PC, S)), wf = R.prairielandWorkforce * R.workforceShare;
    return "About " + fmtN(Math.round(j.lostTotal)) + " jobs is " + pct(j.lostTotal / wf, 2) + " of Ridge County's " + fmtN(wf) + " workers: permanent jobs, lost for as long as the plant would have run.";
  }
  function buildLine(D, PC, S) {
    var j = A13.jobs(jobInputs(D, PC, S));
    if (S.mw === 0) return "No new farms: no building work, against about " + fmtN(Math.round(j.lostTotal)) + " permanent jobs lost.";
    return moneyM(j.localM, 0) + " spent in the county × " + fmtN(S.jy, 1) + " = " + fmtN(Math.round(j.buildJobYearsDirect)) + " direct job-years; × " + fmtN(S.m, 1) + " = about **" + fmtN(Math.round(j.buildJobYears)) + " job-years** in all: about " + fmtN(Math.round(j.buildJobsAvg)) + " jobs for " + D.jobs.buildYears + " years, then none.";
  }
  function buildSaw(D, PC, S) {
    var j = A13.jobs(jobInputs(D, PC, S));
    return "Building gives about " + fmtN(Math.round(j.horizon.build)) + " [[job-year|job-years]] before any displacement; the jobs lost add up to about " + fmtN(Math.round(j.horizon.lostPerm)) + " job-years over " + j.horizon.years + " years. Compare job-years with job-years, never with jobs.";
  }
  function permLine(D, PC, S) {
    var j = A13.jobs(jobInputs(D, PC, S));
    return "Running the farms: " + fmtN(Math.round(j.newPermDirect)) + " direct jobs × " + fmtN(S.m, 1) + " = about **" + fmtN(Math.round(j.newPermGross)) + "** permanent jobs gross, " + fmtN(Math.round(j.newPermNet)) + " net of " + fmtN(S.disp) + "% displacement; against " + fmtN(Math.round(j.lostTotal)) + " lost, a net change of " + (j.netPerm < 0 ? "−" : "+") + fmtN(Math.abs(Math.round(j.netPerm))) + ".";
  }
  function permSaw(D, PC, S) {
    var j = A13.jobs(jobInputs(D, PC, S));
    return "Gross counts only the new jobs; net subtracts the jobs lost and the new work that would have existed anyway, building and running alike. Over the " + j.horizon.years + " years from retirement: **" + sgn(j.horizon.net) + "** job-years net.";
  }
  // the 20 years from retirement on one timeline (the ledger in step 7, the fallback, the explain layer)
  function timelineLine(D) {
    var b = D.jobs.buildYears, h = D.jobs.horizonYears;
    return "Timeline, set for teaching: the plant retires as year 1 begins; the farms are built in years 1–" + b + " and run in years " + (b + 1) + "–" + h + ".";
  }
  function timelineRows(D, PC, S) {
    var j = A13.jobs(jobInputs(D, PC, S)), x = j.horizon, b = D.jobs.buildYears, h = D.jobs.horizonYears;
    return [{ head: "Building the farms", years: "1–" + b, gross: x.build, net: x.buildNet },
            { head: "Running the farms", years: (b + 1) + "–" + h, gross: x.newPermGross, net: x.newPerm },
            { head: "Jobs lost", sub: "plant, mines, suppliers, spending", years: "1–" + h, gross: -x.lostPerm, net: -x.lostPerm },
            { head: "= Change", years: "", gross: x.gross, net: x.net, total: true }];
  }
  function taxLine(D, S) {
    var t = A13.taxBase(taxInputs(D, S));
    return "The plant paid " + moneyM(t.plantTaxM, 1) + " a year; the new farms pay " + moneyM(t.newTaxM, 1) + ". The county's revenue changes by **" + signed0(t.changeM, 1) + "**, " + (t.changeShare < 0 ? "−" : "+") + fmtN(Math.abs(100 * t.changeShare), 1) + "% of its " + moneyM(t.revenueBeforeM, 0) + ".";
  }
  function taxSaw(D, S) {
    var t = A13.taxBase(taxInputs(D, S));
    return "Holding the mines' taxes fixed, coal's share of county revenue goes from " + pct(t.coalShareBefore, 0) + " to " + pct(t.coalShareAfter, 0) + ". The tax itself uses up nothing; what the county's budget change does to its services, this model does not estimate.";
  }
  function mineLine(D, S) {
    var t = A13.taxBase(taxInputs(D, S)), sh = (t.ifMinesCloseShare < 0 ? "−" : "+") + fmtN(Math.abs(100 * t.ifMinesCloseShare), 1) + "%";
    return "The mines' " + moneyM(D.ridgeCounty.mineCoalTaxM, 0) + " a year of coal taxes is held fixed, as if they sold their coal elsewhere; if it ended too, revenue would change by " + signed0(t.ifMinesCloseM, 1) + " (" + sh + ").";
  }
  var FICTION_PC = "Prairie City is fictional; its numbers are illustrative.";
  var POINTS = "Burden changes are in percentage points: from 15% to 17% of income is +2 points.";
  // who pays what, in words, for the explain layer's stakeholder map: the lower-income groups (below 80% of AMI) against
  // the higher-income ones, under the reader's design and cost (the test checks the words for every design and cost)
  function payWords(a) {
    if (!(a.cost > 0)) return { low: "nothing: no cost to recover", high: "nothing: no cost to recover", none: true };
    var lo = a.rows[0], hi = a.rows[a.rows.length - 1];
    var dollars = function (r, o) { return Math.abs(r.charge - o.charge) < 0.005 ? "the same dollars" : r.charge < o.charge ? "fewer dollars" : "more dollars"; };
    var share = function (r, o) { return Math.abs(r.delta - o.delta) < 1e-12 ? "the same share of income" : r.delta > o.delta ? "a larger share of income" : "a smaller share of income"; };
    return { low: dollars(lo, hi) + ", " + share(lo, hi), high: dollars(hi, lo) + ", " + share(hi, lo) };
  }
  // the county's cells: it pays only when its revenue falls
  function countyCells(t) {
    return { pay: t.changeM < -1e-9 ? { v: "part", t: "a smaller tax base: " + signed0(t.changeM, 1) + " a year" } : { v: "no", t: t.changeM > 1e-9 ? "none: its revenue grows " + signed0(t.changeM, 1) + " a year" : "none: its revenue does not change" },
             ben: t.newTaxM > 1e-9 ? { v: "part", t: "tax from the new farms" } : { v: "no" } };
  }
  function staticFallback(D, PC) {
    var c = D.plan.costM.start, sh = shortOf(PC), A = ["kwh", "fixed", "income"].map(function (k) { return split(D, PC, c, k); });
    var head = "<thead><tr><th scope=\"col\">Group (share of area median income)</th><th scope=\"col\">Households</th>" + D.designs.map(function (d) { return "<th scope=\"col\">" + d.name + ": charge, burden after</th>"; }).join("") + "</tr></thead>";
    var body = A[0].rows.map(function (r, i) {
      return "<tr><td>" + sh[i] + " (burden before " + pct(r.burden) + ")</td><td>" + fmtN(r.households) + "</td>" + A.map(function (a) { return "<td>" + money(a.rows[i].charge) + ", " + pct(a.rows[i].burdenAfter) + "</td>"; }).join("") + "</tr>";
    }).join("");
    var S = defaults(D), j = A13.jobs(jobInputs(D, PC, S)), t = A13.taxBase(taxInputs(D, S));
    return "<p class=\"lx-eyebrow\">The idea in one table: a " + moneyM(c, 0) + " yearly plan cost split three ways (screening estimate)</p>" +
      "<div class=\"lx-scroll-x\"><table class=\"lx-mini-table a13-fbt\"><caption class=\"lx-hint\">" + FICTION_PC + " A year, per household; burden = home energy spending ÷ income.</caption>" + head + "<tbody>" + body + "</tbody></table></div>" +
      "<div class=\"lx-scroll-x\"><table class=\"lx-mini-table a13-fbt\"><caption class=\"lx-hint\">The groups' inputs, a year per household, before the plan.</caption><thead><tr><th scope=\"col\">Group</th><th scope=\"col\">Income</th><th scope=\"col\">Electricity</th><th scope=\"col\">Home energy spending</th></tr></thead><tbody>" +
      rows(PC).map(function (r, i) { return "<tr><td>" + sh[i] + "</td><td>" + money(r.income) + "</td><td>" + fmtN(r.kWh) + " kWh</td><td>" + money(r.spend) + "</td></tr>"; }).join("") + "</tbody></table></div>" +
      "<ul><li><b>A transfer.</b> Every design recovers the same " + moneyM(c, 0) + "; moving from per kWh to a fixed charge shifts " + moneyM(moved(D, PC, c, "fixed").up / 1e6) + " a year onto lower-income groups, and the money moved adds up to zero.</li>" +
      "<li><b>Ridge County (fictional).</b> Its coal plant retires: " + fmtN(j.lostDirect) + " jobs on site, about " + fmtN(Math.round(j.lostTotal)) + " with suppliers and spending (multiplier " + fmtN(S.m, 1) + ").</li>" +
      "<li><b>Job-years against jobs.</b> " + fmtN(S.mw) + " MW of wind and solar at " + money(S.capex) + " per kW give about " + fmtN(Math.round(j.buildJobYears)) + " job-years of building gross (" + fmtN(Math.round(j.buildJobYearsNet)) + " net of " + S.disp + "% displacement), and about " + fmtN(Math.round(j.newPermGross)) + " permanent jobs gross, " + fmtN(Math.round(j.newPermNet)) + " net.</li>" +
      "<li><b>One timeline.</b> Building in years 1–" + D.jobs.buildYears + " and running in years " + (D.jobs.buildYears + 1) + "–" + D.jobs.horizonYears + ", net of displacement, against " + D.jobs.horizonYears + " years of lost jobs: " + sgn(j.horizon.net) + " job-years.</li>" +
      "<li><b>Tax base.</b> The plant paid " + moneyM(t.plantTaxM, 1) + " a year at " + fmtN(S.rate, 1) + "%; the new farms pay " + moneyM(t.newTaxM, 1) + ": " + signed0(t.changeM, 1) + " for the county's budget, the mines' coal taxes held fixed. The payment is a transfer: it uses up nothing.</li></ul>" +
      "<p class=\"lx-hint\">Every coefficient is an illustrative input, not a prediction. With JavaScript on, you set them yourself, step by step.</p>";
  }
  function practice(D, PC) {
    var c = D.plan.costM.start, a = split(D, PC, c, "kwh"), f = split(D, PC, c, "fixed"), inc = split(D, PC, c, "income"), S = defaults(D);
    var E = a.rows.reduce(function (s, r) { return s + r.households * r.kWh; }, 0), j = A13.jobs(jobInputs(D, PC, S)), t = A13.taxBase(taxInputs(D, S));
    var two = A13.regroup(A13.allocate(rows(PC), 0, "kwh"), D.bands.two.groups, D.bands.two.labels);
    var items = [
      ["The per-kWh rate by hand.", "Prairie City's households use " + fmtN(E) + " kWh a year. What rate recovers " + moneyM(c, 0) + "?",
       moneyM(c, 0) + " ÷ " + fmtN(E) + " kWh = $" + fmtN(a.rate.perKWh, 4) + ", about " + cents(a.rate.perKWh) + " a kWh."],
      ["A fixed charge against income.", "Split " + moneyM(c, 0) + " equally over " + fmtN(f.rows.reduce(function (s, r) { return s + r.households; }, 0)) + " households. How much does it add to the burden of a household earning " + money(f.rows[0].income) + "?",
       money(f.rate.perHousehold) + " a year each; " + fmtN(f.rate.perHousehold, 2) + " ÷ " + fmtN(f.rows[0].income) + " = " + pct(f.rows[0].delta, 2) + ", so " + pts(f.rows[0].delta) + "."],
      ["The same share of income.", "Prairie City's households earn " + moneyM(inc.rows.reduce(function (s, r) { return s + r.households * r.income; }, 0) / 1e6, 0) + " a year in all. Charged by income, what share of its income does every household pay?",
       moneyM(c, 0) + " ÷ total household income " + moneyM(inc.rows.reduce(function (s, r) { return s + r.households * r.income; }, 0) / 1e6, 0) + " = " + pct(inc.rate.shareOfIncome, 3) + "; " + pts(inc.rows[0].delta) + " for every group."],
      ["Group, then read.", "Households below 80% of area median income: how does their merged burden compare with the poorest group's, before the plan?",
       "Merged: total spending ÷ total income = " + pct(two[0].burden) + "; the 0–30% group alone: " + pct(a.rows[0].burden) + ". The merged average hides the tail."],
      ["Job-years against jobs.", money(S.capex) + " per kW for " + fmtN(S.mw) + " MW, " + pct(D.jobs.localShare, 0) + " spent locally, " + fmtN(S.jy, 1) + " direct job-years per $M, multiplier " + fmtN(S.m, 1) + ". Compare with " + fmtN(Math.round(j.lostTotal)) + " permanent jobs lost over " + D.jobs.horizonYears + " years.",
       moneyM(j.capexM, 0) + " × " + pct(D.jobs.localShare, 0) + " = " + moneyM(j.localM, 0) + "; × " + fmtN(S.jy, 1) + " = " + fmtN(Math.round(j.buildJobYearsDirect)) + " direct job-years; × " + fmtN(S.m, 1) + " = " + fmtN(Math.round(j.buildJobYears)) + " job-years in all (gross), against " + fmtN(Math.round(j.lostTotal)) + " × " + D.jobs.horizonYears + " = " + fmtN(Math.round(j.horizon.lostPerm)) + " job-years lost."],
      ["The county's budget.", "Plant value " + moneyM(D.ridgeCounty.plant.valueM, 0) + ", new farms " + moneyM(j.capexM, 0) + " with " + S.taxable + "% taxable, rate " + fmtN(S.rate, 1) + "%. What changes for the county's budget, and what does this model leave open?",
       moneyM(t.plantTaxM, 0) + " lost, " + moneyM(t.newTaxM, 0) + " gained: " + signed0(t.changeM, 0) + " a year for the county's budget, the mines' taxes held fixed. The payments use up nothing; what a smaller budget does to services, and to the region, is not estimated."]
    ];
    return "<p class=\"lx-eyebrow\">Practice · about 30 minutes on your own</p><ol class=\"lx-fb-practice\">" + items.map(function (x) {
      return "<li><p><b>" + x[0] + "</b> " + x[1] + "</p><details class=\"lx-answer\"><summary>Answer</summary><p>" + x[2] + "</p></details></li>";
    }).join("") + "</ol><p class=\"lx-hint\">" + A13.SCREENING + " " + FICTION_PC + " " + D.ridgeCounty.fiction + "</p>";
  }

  var model = { A13: A13, fmtN: fmtN, pct: pct, money: money, moneyM: moneyM, signed: signed, signed0: signed0, pts: pts, cents: cents, shortOf: shortOf, design: design, rows: rows, split: split,
    jobInputs: jobInputs, taxInputs: taxInputs, defaults: defaults, RISE: RISE, riseSaw: riseSaw, designLine: designLine, designSaw: designSaw, moved: moved,
    transferLine: transferLine, TRANSFER_SAW: TRANSFER_SAW, groupLine: groupLine, groupSaw: groupSaw, lostLine: lostLine, lostSaw: lostSaw, buildLine: buildLine,
    buildSaw: buildSaw, permLine: permLine, permSaw: permSaw, timelineLine: timelineLine, timelineRows: timelineRows, taxLine: taxLine, taxSaw: taxSaw, mineLine: mineLine,
    sgn: sgn, POINTS: POINTS, payWords: payWords, countyCells: countyCells, FICTION_PC: FICTION_PC, staticFallback: staticFallback, practice: practice };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H;
  function bold(t) { return LX.rich(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>"); }

  LX.mount("fairness-jobs", function (live, data, root) {
    if (!A13) throw new Error("A13 needs LX.A13 (components/whopays.js, in learn.js)");
    var D = data[KEY], PC = data.prairie_city, P = data.path, SH = shortOf(PC), S = defaults(D);
    var saved = LX.store.get("a13");
    function inRange(v, r) { return typeof v === "number" && v >= r.min - 1e-9 && v <= r.max + 1e-9; }
    if (saved) {
      if (inRange(saved.costM, D.plan.costM)) S.costM = saved.costM;
      ["m", "mw", "capex", "jy", "om", "disp"].forEach(function (k) { var r = { m: "multiplier", mw: "newMW", capex: "capexPerKW", jy: "jobYearsPerM", om: "omPer100MW", disp: "displacement" }[k]; if (inRange(saved[k], D.jobs[r])) S[k] = saved[k]; });
      if (inRange(saved.rate, D.tax.rate)) S.rate = saved.rate;
      if (inRange(saved.taxable, D.tax.taxableShare)) S.taxable = saved.taxable;
      if (design(D, saved.design)) S.design = saved.design;
    }
    // every change is kept in this browser and, a moment later, redrawn in the explain layer (it follows the reader's settings)
    var xTimer = null;
    function keep() { LX.store.set("a13", S); if (xTimer) clearTimeout(xTimer); xTimer = setTimeout(paintExplain, 200); }
    var demo = [];
    function chips(host, list) {
      host.innerHTML = "";
      list.forEach(function (x) { var c = H("div", { class: "lx-readout" + (x[2] ? " " + x[2] : "") }, host); H("span", { text: x[0] }, c); H("b", { text: x[1] }, c); });
    }
    function assume(host, list, extra) {
      var d = H("details", { class: "a13-assume" }, host);
      H("summary", { text: "Assumptions behind this screening estimate" }, d);
      var ul = H("ul", null, d); list.concat(extra || []).forEach(function (t) { H("li", { text: t }, ul); });
    }
    function slider(host, label, r, key, fmt, color, after) {
      return LX.Slider(host, { label: label, color: color || "var(--lx-tier-2)", min: r.min, max: r.max, step: r.step, value: S[key], fmt: fmt,
        onChange: function (v) { S[key] = v; keep(); if (after) after(v); } });
    }
    function designSeg(host, keys, cur, onPick) {
      var seg = H("div", { class: "lx-seg", role: "group", "aria-label": "How the cost is split" }, host), b = {};
      keys.forEach(function (k) { b[k] = H("button", { type: "button", text: design(D, k).name }, seg); b[k].addEventListener("click", function () { onPick(k); }); });
      return function (k) { keys.forEach(function (j) { b[j].setAttribute("aria-pressed", String(j === k)); }); };
    }
    function burdenChart(Pl, a) {
      var bs = [], w = 0.34;
      a.rows.forEach(function (r, i) {
        bs.push({ x0: i + 0.5 - w, x1: i + 0.5, y0: 0, y1: 100 * r.burden, color: "var(--lx-ink-3)", op: 0.55 });
        bs.push({ x0: i + 0.5, x1: i + 0.5 + w, y0: 0, y1: 100 * r.burdenAfter, color: "var(--lx-tier-2)" });
      });
      Pl.render({
        x: { min: 0, max: a.rows.length, ticks: a.rows.map(function (r, i) { return [i + 0.5, SH[i]]; }), ticksN: a.rows.map(function (r, i) { return [i + 0.5, SH[i].replace("%", "")]; }) },
        y: { min: 0, max: 20, step: 5, fmt: function (v) { return v + "%"; }, unit: "share of income" }, height: 220, heightN: 200, bars: bs,
        refs: [{ y: 100 * D.lines.high, label: "6%", dash: "5 4", color: "var(--lx-warn)" }, { y: 100 * D.lines.severe, label: "10%", dash: "5 4", color: "var(--lx-bad)" }],
        legend: [{ label: "Burden before", color: "var(--lx-ink-3)" }, { label: "After the plan's charge (" + design(D, a.design).lower + ")", color: "var(--lx-tier-2)" }],
        aria: "Energy burden by income group before and after the charge: " + a.rows.map(function (r, i) { return SH[i] + " " + pct(r.burden) + " to " + pct(r.burdenAfter); }).join(", ") + ".",
        text: { head: ["Group", "Before", "After"], rows: a.rows.map(function (r, i) { return [SH[i], pct(r.burden), pct(r.burdenAfter)]; }) }
      });
    }
    // the groups' inputs, so every charge and burden can be worked by hand: households, income, use and spending
    function inputs(host) {
      var d = H("details", { class: "lx-textalt" }, host); H("summary", { text: "The groups' inputs: income, electricity use and home energy spending" }, d);
      LX.Ledger(H("div", null, d), { caption: "A year, per household, before the plan. " + FICTION_PC, columns: ["Group", "Households", "Income", "Electricity", "Home energy spending"],
        rows: rows(PC).map(function (r, i) { return { head: SH[i], sub: "of area median income", cells: [fmtN(r.households), money(r.income), fmtN(r.kWh) + " kWh", money(r.spend)] }; }), cls: "a13-led" });
    }
    function splitLedger(host, a) {
      host.innerHTML = "";
      LX.Ledger(host, { caption: "A year, per household; " + design(D, a.design).long + ". Screening estimate.", columns: ["Group", "Households", "Charge", "Burden before", "Burden after"],
        rows: a.rows.map(function (r, i) { return { head: SH[i], sub: "of area median income", cells: [fmtN(r.households), money(r.charge), pct(r.burden), { text: pct(r.burdenAfter) + " (" + pts(r.delta) + ")", cls: r.delta > 0 ? "up" : "" }] }; })
          .concat([{ head: "= All", cells: [fmtN(a.rows.reduce(function (s, r) { return s + r.households; }, 0)), moneyM(a.total / 1e6) + " in all", "", ""], total: true }]), cls: "a13-led" });
    }

    var steps = [
      { text: "Prairie City's plan recovers a yearly cost through its households' electricity bills, charged per kWh. Its households fall in five income groups, by their share of [[area-median-income|area median income]] (AMI).",
        build: function (act, api) {
          var pr = LX.Predict(act, { id: "a13-rise", q: RISE.q, answer: RISE.answer, options: PC.groups.map(function (g, i) { return { value: g.key, label: SH[i] }; }), feedback: RISE.feedback, onPick: function () { show(); } });
          var res = H("div", { class: "a13-res" }, act); res.hidden = true;
          var Pl = LX.Plot(H("div", null, res), { text: "Text version of the chart", legend: true });
          H("p", { class: "lx-hint", text: FICTION_PC + " The plan's cost is set for teaching. " + POINTS }, res);
          function show() { pr.reveal(); res.hidden = false; burdenChart(Pl, split(D, PC, D.plan.costM.start, "kwh")); api.done(); api.saw(riseSaw(D, PC, D.plan.costM.start)); }
          if (pr.picked()) show();
          demo[0] = function () { if (!pr.picked()) { var b = act.querySelector(".lx-choice"); if (b) b.click(); } };
        } },
      { text: "Now try the other two designs: the same charge for every household, and a charge in proportion to income. Set the plan's yearly cost and read each group's dollars and burden.",
        build: function (act, api) {
          var seen = {}, paintSeg = designSeg(act, ["kwh", "fixed", "income"], S.design, function (k) { S.design = k; seen[k] = true; keep(); paint(); });
          slider(act, "The plan's yearly cost from households", D.plan.costM, "costM", function (v) { return moneyM(v, 0) + " a year"; }, "var(--lx-tier-2)", function () { paint(); });
          var Pl = LX.Plot(H("div", null, act), { text: "Text version of the chart", legend: true });
          var lg = H("div", null, act), line = H("p", { class: "lx-step-line", "aria-live": "polite" }, act);
          inputs(act);
          assume(act, A13.ASSUME.split, [FICTION_PC]);
          function paint() {
            paintSeg(S.design); var a = split(D, PC, S.costM, S.design);
            burdenChart(Pl, a); splitLedger(lg, a); line.innerHTML = bold(designLine(D, PC, S.costM, S.design));
            if (seen.kwh && seen.fixed && seen.income) { api.done(); api.saw(designSaw(D, PC, S.costM)); }
          }
          seen[S.design] = true; paint();
          demo[1] = function () { ["fixed", "income", "kwh"].forEach(function (k) { S.design = k; seen[k] = true; }); paint(); };
        } },
      { text: "Switching designs moves money between groups, but the plan still costs the same. Pick a design and read the column of money moved against per kWh: it adds up to zero.",
        build: function (act, api) {
          var paintSeg = designSeg(act, ["fixed", "income"], S.versus, function (k) { S.versus = k; paint(); });
          var lg = H("div", null, act), line = H("p", { class: "lx-step-line", "aria-live": "polite" }, act);
          function paint() {
            paintSeg(S.versus); var a = split(D, PC, S.costM, "kwh"), b = split(D, PC, S.costM, S.versus), t = A13.transfers(a, b);
            lg.innerHTML = "";
            LX.Ledger(lg, { caption: "Each group's yearly total, $M (rounded); money moved = " + design(D, S.versus).lower + " minus per kWh.", columns: ["Group", "Per kWh", design(D, S.versus).name, "Money moved"],
              rows: a.rows.map(function (r, i) { return { head: SH[i], cells: [moneyM(r.group / 1e6), moneyM(b.rows[i].group / 1e6), { text: signed0(t.rows[i].group / 1e6), cls: t.rows[i].group > 0 ? "up" : "down" }] }; })
                .concat([{ head: "= All", cells: [moneyM(a.total / 1e6), moneyM(b.total / 1e6), signed0(t.sum / 1e6)], total: true }]), cls: "a13-led" });
            line.innerHTML = bold(transferLine(D, PC, S.costM, S.versus));
            api.done(); api.saw(TRANSFER_SAW);
          }
          paint();
          demo[2] = function () { S.versus = "income"; paint(); };
        } },
      { text: "How you group households changes what you see. Merge the three groups below 80% of [[area-median-income|area median income]] into one, and compare its burden with the poorest group's.",
        build: function (act, api) {
          var seg = H("div", { class: "lx-seg", role: "group", "aria-label": "Grouping" }, act), b = {}, seen = {};
          ["five", "two"].forEach(function (k) { b[k] = H("button", { type: "button", text: D.bands[k].name }, seg); b[k].addEventListener("click", function () { pick(k); }); });
          var tb = H("div", null, act), line = H("p", { class: "lx-step-line", "aria-live": "polite" }, act);
          function pick(k) {
            S.bands = k; seen[k] = true; Object.keys(b).forEach(function (j) { b[j].setAttribute("aria-pressed", String(j === k)); });
            var a = split(D, PC, S.costM, S.design), B = D.bands[k], g = A13.regroup(a, B.groups, k === "five" ? SH : B.labels);
            tb.innerHTML = "";
            LX.Ledger(tb, { caption: "Burden = the group's total home energy spending ÷ its total income; after: with the plan's charge (" + design(D, S.design).lower + ", " + moneyM(S.costM, 0) + ").",
              columns: ["Group", "Households", "Burden before", "Burden after"], rows: g.map(function (x) { return { head: x.label, cells: [fmtN(x.households), pct(x.burden), pct(x.burdenAfter)] }; }), cls: "a13-led" });
            line.innerHTML = bold(groupLine(D, PC, S.costM, S.design, k));
            if (seen.five && seen.two) { api.done(); api.saw(groupSaw(D, PC)); }
          }
          pick("five");
          demo[3] = function () { pick("two"); };
        } },
      { text: "Ridge County, Prairieland's coal county, is losing its coal plant. Count the jobs that end: the plant's staff, the mine jobs that supply it, and the jobs their spending supports ([[employment-multiplier|multiplier]]).",
        build: function (act, api) {
          var ro = H("div", { class: "lx-readouts", "aria-live": "polite" }, act), line = H("p", { class: "lx-step-line", "aria-live": "polite" }, act);
          slider(act, "Multiplier: all jobs per direct (on-site) job (illustrative)", D.jobs.multiplier, "m", function (v) { return fmtN(v, 1) + "×"; }, "var(--lx-tier-4)", function () { paint(); api.done(); api.saw(lostSaw(D, PC, S)); });
          H("p", { class: "lx-hint", html: "Real multipliers come from regional input-output tables, accounts of what each industry buys from the others, such as BEA's RIMS II. " + LX.rich(D.ridgeCounty.fiction) }, act);
          assume(act, [A13.ASSUME.jobs[0], A13.ASSUME.jobs[1]]);
          function paint() {
            var j = A13.jobs(jobInputs(D, PC, S));
            chips(ro, [["On site (plant and mines)", fmtN(j.lostDirect)], ["With suppliers and spending", fmtN(Math.round(j.lostTotal)), "bad"]]);
            line.innerHTML = bold(lostLine(D, PC, S));
          }
          paint(); api.done(); api.saw(lostSaw(D, PC, S));
          demo[4] = function () { paint(); };
        } },
      { text: "Wind and solar farms built in the county bring construction work. Set their size, their cost and the direct [[job-year|job-years]] each million dollars spent locally creates, then compare.",
        build: function (act, api) {
          var ro = H("div", { class: "lx-readouts", "aria-live": "polite" }, act), line = H("p", { class: "lx-step-line", "aria-live": "polite" }, act);
          var J = D.jobs, go = function () { paint(); api.done(); api.saw(buildSaw(D, PC, S)); };
          var sl = slider(act, "New wind and solar in the county", J.newMW, "mw", function (v) { return fmtN(v) + " MW"; }, "var(--lx-wind)", go);
          slider(act, "Building cost (illustrative)", J.capexPerKW, "capex", function (v) { return money(v) + " per kW"; }, "var(--lx-tier-3)", go);
          slider(act, "Direct job-years per $M spent locally (illustrative)", J.jobYearsPerM, "jy", function (v) { return fmtN(v, 1); }, "var(--lx-tier-4)", go);
          H("p", { class: "lx-hint", text: "Local share of the spending " + pct(J.localShare, 0) + "; building takes " + J.buildYears + " years. NREL's JEDI models count a construction job as one full-time year. Displacement comes in the next step." }, act);
          function paint() {
            var j = A13.jobs(jobInputs(D, PC, S));
            chips(ro, [["Spent in the county", moneyM(j.localM, 0)], ["Direct building job-years", fmtN(Math.round(j.buildJobYearsDirect))], ["With the multiplier (gross)", fmtN(Math.round(j.buildJobYears))], ["Jobs lost, over " + j.horizon.years + " years", fmtN(Math.round(j.horizon.lostPerm)) + " job-years", "bad"]]);
            line.innerHTML = bold(buildLine(D, PC, S));
          }
          paint(); api.done(); api.saw(buildSaw(D, PC, S));
          demo[5] = function () { sl.set(3000, true); };
        } },
      { text: "Building ends; running the farms needs a permanent crew. Set the direct jobs per 100 MW and the share of new work that would have existed anyway: [[gross-jobs|gross]] against [[net-jobs|net]].",
        build: function (act, api) {
          var ro = H("div", { class: "lx-readouts", "aria-live": "polite" }, act), line = H("p", { class: "lx-step-line", "aria-live": "polite" }, act);
          var J = D.jobs, go = function () { paint(); api.done(); api.saw(permSaw(D, PC, S)); };
          var sl = slider(act, "Direct permanent jobs per 100 MW (illustrative)", J.omPer100MW, "om", function (v) { return fmtN(v); }, "var(--lx-wind)", go);
          slider(act, "Displacement: new work, building and running, that would have existed anyway", J.displacement, "disp", function (v) { return fmtN(v) + "%"; }, "var(--lx-tier-5)", go);
          var tl = H("div", null, act);
          H("p", { class: "lx-hint", text: timelineLine(D) + " NREL's JEDI models report gross jobs only; net effects subtract displaced activity (JEDI limitations page)." }, act);
          assume(act, A13.ASSUME.jobs);
          function paint() {
            var j = A13.jobs(jobInputs(D, PC, S));
            chips(ro, [["New permanent, gross", fmtN(Math.round(j.newPermGross))], ["New permanent, net", fmtN(Math.round(j.newPermNet))], ["Net change in permanent jobs", sgn(j.netPerm), j.netPerm < 0 ? "bad" : "good"]]);
            line.innerHTML = bold(permLine(D, PC, S));
            tl.innerHTML = "";
            LX.Ledger(tl, { caption: "Job-years over the " + D.jobs.horizonYears + " years from the plant's retirement (screening estimate).", columns: ["Part", "Years", "Gross", "Net of " + fmtN(S.disp) + "% displacement"],
              rows: timelineRows(D, PC, S).map(function (r) { return { head: r.head, sub: r.sub, cells: [r.years, sgn(r.gross), sgn(r.net)], total: !!r.total }; }), cls: "a13-led" });
          }
          paint(); api.done(); api.saw(permSaw(D, PC, S));
          demo[6] = function () { sl.set(12, true); };
        } },
      { text: "The plant paid property tax to Ridge County: part of its [[tax-base|tax base]]. Set the tax rate and how much of the new farms' cost is taxable, then read the county's budget.",
        build: function (act, api) {
          var ro = H("div", { class: "lx-readouts", "aria-live": "polite" }, act), line = H("p", { class: "lx-step-line", "aria-live": "polite" }, act), mines = H("p", { class: "lx-hint" }, act);
          var T = D.tax, go = function () { paint(); api.done(); api.saw(taxSaw(D, S)); };
          var sl = slider(act, "Property tax rate (illustrative)", T.rate, "rate", function (v) { return fmtN(v, 1) + "% a year"; }, "var(--lx-tier-5)", go);
          slider(act, "Taxable share of the new farms' cost", T.taxableShare, "taxable", function (v) { return fmtN(v) + "%"; }, "var(--lx-tier-5)", go);
          H("p", { class: "lx-hint", text: "Real rates, assessments (the value set for tax) and abatements (tax reductions) are set by each state and county. " + D.ridgeCounty.fiction }, act);
          assume(act, A13.ASSUME.tax);
          function paint() {
            var t = A13.taxBase(taxInputs(D, S));
            chips(ro, [["Plant's tax", moneyM(t.plantTaxM, 1)], ["New farms' tax", moneyM(t.newTaxM, 1)], ["County revenue, plant tax only", signed0(t.changeM, 1), t.changeM < 0 ? "bad" : t.changeM > 0 ? "good" : ""], ["If the mines' taxes ended too", signed0(t.ifMinesCloseM, 1), "bad"]]);
            line.innerHTML = bold(taxLine(D, S)); mines.textContent = mineLine(D, S);
          }
          paint(); api.done(); api.saw(taxSaw(D, S));
          demo[7] = function () { sl.set(1.5, true); };
        } },
      { text: "Every number on this page is a [[screening-estimate|screening estimate]]: your inputs, stated assumptions, no prediction. An energy model gives costs and MW; this accounting turns them into who pays and who gains.",
        build: function (act, api) {
          var box = H("div", null, act);
          function paint() {
            var a = split(D, PC, S.costM, S.design), j = A13.jobs(jobInputs(D, PC, S)), t = A13.taxBase(taxInputs(D, S));
            box.innerHTML = "";
            LX.Ledger(box, { caption: "Who pays and who gains, a year, with your inputs. Screening estimate. The jobs count the supplying mines closing; the budget row holds their taxes fixed, with the case where they end beside it.", columns: ["Who", "Pays or gains", "Kind"],
              rows: [{ head: "Prairie City, poorest group", sub: SH[0] + " of area median income", cells: ["pays " + money(a.rows[0].charge) + " a household (" + pts(a.rows[0].delta) + ")", "a share of a real cost"] },
                     { head: "Prairie City, top group", sub: SH[SH.length - 1] + " of area median income", cells: ["pays " + money(a.rows[a.rows.length - 1].charge) + " a household (" + pts(a.rows[a.rows.length - 1].delta) + ")", "a share of a real cost"] },
                     { head: "Ridge County's workers", sub: "the plant and its supplying mines close", cells: [sgn(j.netPerm) + " permanent jobs, net", "employment, in jobs; earnings and labour costs not valued here"] },
                     { head: "Construction workers", sub: "for " + D.jobs.buildYears + " years", cells: [fmtN(Math.round(j.buildJobYears)) + " job-years gross, " + fmtN(Math.round(j.buildJobYearsNet)) + " net", "temporary"] },
                     { head: "Ridge County's budget", sub: "plant tax only; the mines' held fixed", cells: [signed0(t.changeM, 1) + " a year; " + signed0(t.ifMinesCloseM, 1) + " if the mines' taxes end too", "a transfer"] }], cls: "a13-led" });
          }
          paint(); api.done();
          H("a", { class: "lx-btn small", style: "justify-self:start;margin-top:10px", href: "#explain", html: "Who decides, pays and benefits, as diagrams" + LX.icon("arrow") }, act);
          demo[8] = function () { paint(); };
        } }
    ];
    var cards = LX.StepCards(live, { id: "a13-steps", steps: steps });

    // ---------------------------------------------------------------- the explain layer
    var xhost = document.getElementById("a13-explain");
    function paintExplain() {
      if (!xhost) return;
      xhost.innerHTML = ""; xhost.classList.add("is-live");
      var a = split(D, PC, S.costM, S.design), w = payWords(a), t = A13.taxBase(taxInputs(D, S)), cc = countyCells(t), farms = S.mw > 0;
      var pv = w.none ? "no" : "yes";
      LX.Stakeholders(H("div", { class: "lx-xcard" }, xhost), {
        title: "Who decides, who pays, who benefits",
        lede: "Typical roles, with your settings: " + moneyM(S.costM, 0) + " a year recovered " + design(D, S.design).lower + ", and Ridge County's plant retiring.",
        cols: [{ key: "dec", label: "Decides" }, { key: "pay", label: "Pays" }, { key: "ben", label: "Benefits" }],
        rows: [
          { key: "reg", name: "State regulators", cells: { dec: { v: "yes", t: "how the cost is split: the [[tariff|tariff]]" }, pay: { v: "no" }, ben: { v: "no" } } },
          { key: "low", name: "Low-income households", note: "below 80% of area median income", cells: { dec: { v: "part", t: "comment at rate hearings" }, pay: { v: pv, t: w.low }, ben: { v: "part", t: "if the plan lowers bills or a design protects them" } } },
          { key: "high", name: "Higher-income households", cells: { dec: { v: "part", t: "comment at rate hearings" }, pay: { v: pv, t: w.high }, ben: { v: "part", t: "from what the plan delivers" } } },
          { key: "work", name: "Ridge County's workers", cells: { dec: { v: "no" }, pay: { v: "yes", t: "jobs lost unless re-employed" }, ben: farms ? { v: "part", t: "some farm and building jobs" } : { v: "no" } } },
          { key: "county", name: "Ridge County's government", cells: { dec: { v: "part", t: "rates, abatements, permits" }, pay: cc.pay, ben: cc.ben } },
          { key: "owners", name: "Plant and farm owners", cells: { dec: { v: "yes", t: "when to retire, where to build" }, pay: { v: "yes", t: farms ? "building costs and taxes" : "the plant's closing costs" }, ben: { v: "yes", t: "their returns" } } }],
        note: "Illustrative roles for fictional places; real arrangements vary by state. Redrawn from your settings." });
      var la = split(D, PC, S.costM, "kwh"), lf = split(D, PC, S.costM, "fixed"), li = split(D, PC, S.costM, "income");
      var lw = H("div", { class: "lx-xcard" }, xhost); H("header", { class: "lx-x-head" }, lw).appendChild(H("h3", { text: "Ledger: the same cost, three designs" }));
      LX.Ledger(lw, { caption: "Yearly charge per household at your " + moneyM(S.costM, 0) + " (screening estimate); every column recovers the same total.", columns: ["Group", "Per kWh", "Fixed charge", "By income"],
        rows: la.rows.map(function (r, i) { return { head: SH[i], cells: [money(r.charge), money(lf.rows[i].charge), money(li.rows[i].charge)] }; })
          .concat([{ head: "= All", cells: [moneyM(la.total / 1e6), moneyM(lf.total / 1e6), moneyM(li.total / 1e6)], total: true }]), cls: "a13-led" });
      var lt = H("div", { class: "lx-xcard" }, xhost); H("header", { class: "lx-x-head" }, lt).appendChild(H("h3", { text: "Ledger: jobs on one timeline" }));
      LX.Ledger(lt, { caption: timelineLine(D) + " With your inputs; net of " + fmtN(S.disp) + "% displacement.", columns: ["Part", "Years", "Gross job-years", "Net job-years"],
        rows: timelineRows(D, PC, S).map(function (r) { return { head: r.head, sub: r.sub, cells: [r.years, sgn(r.gross), sgn(r.net)], total: !!r.total }; }), cls: "a13-led" });
      LX.Boundary(H("div", { class: "lx-xcard" }, xhost), { title: "Where these estimates hold",
        holds: ["The coefficients you set are right for the place and the year.", "Each group's average stands for its households.", "Lost jobs are not refilled elsewhere in the county.", "The mines' coal taxes stay as they are."],
        leaves: ["Responses to prices, moves, retraining and new firms.", "Health, emissions and what the plan delivers to each group.", "What a smaller county budget does to its services.", "Who gets a say: procedure, not only money."],
        source: "Accounting: this page's screening model. Prairie City from the course's shared city data; Ridge County fictional." });
    }
    paintExplain();

    LX.demo(root, function (state) {
      var n = state === "mid" ? 2 : +((/^step-(\d+)$/.exec(state) || [])[1] || 0); if (!n) return null;
      var k = Math.max(0, Math.min(steps.length - 1, n - 1));
      cards.go(k); if (demo[k]) demo[k]();
      return { view: "step " + (k + 1) };
    }, cards);
    root.lxLesson = { model: model, D: D, S: S, cards: cards };
  });
})();
