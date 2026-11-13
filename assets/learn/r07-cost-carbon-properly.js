/* r07-cost-carbon-properly.js — research studio R7, "Cost and carbon done properly: one boundary, a fair baseline, a
   stated counterfactual".
   Data: assets/learn/data/r07-cost-carbon-properly.json (a fictional study of electric buses in a fictional city, its
   illustrative inputs in 2025 dollars, the four flaws, the exemplars, the evidence ladder, the rubric line and the
   checklist; two real dated numbers: diesel's 10.19 kg CO2 per gallon and the U.S. grid's 1.53 billion tonnes of CO2 over
   4.18 trillion kWh in 2023, both EIA) and path.json (lesson links).
   Page: learn/r07-cost-carbon-properly.qmd (studio form: Task, Exemplars, Self-check, Sources).

   The model (closed form, one year of a 12-year bus life; annual equivalents at a 3% real rate, CRF = r / (1 − (1 + r)^−n)):
     electric  capital (buses + chargers − the credit, up front) × CRF + energy (miles × kWh per mile × price; kWh at the
               depot meter, charging losses in) + repairs
               + [grid fix] demand charges (peak kW × $ per kW-month × 12) + depot connection × CRF; each of the two grid
               costs also enters alone (F.depot, F.demand: step 4's switches); F.grid is both
               − [no credit fix] the credit counted again as income (credit / life, a year)
     diesel    capital (buses, up front) × CRF + fuel (miles / mpg × price) + repairs; mpg and repairs per mile of the
               2009 buses (the study's baseline) or of new buses ([baseline fix])
     CO2       diesel: gallons × 10.19 kg; electric: 0 at the tailpipe, or [boundary fix] MWh × the grid's average factor
               (EIA 2023 U.S. average, or a reader's choice of 0.10 or 0.70 t per MWh)
     saving = diesel − electric (a year); cut = diesel CO2 − electric CO2, attributed operating CO2 (average-factor
     accounting: the system's real change needs a consequential analysis, A10); cost per attributed tonne = −saving / cut
     (only when electric costs more). Society's view: the credit moves money from the state to the agency, so it leaves
     out the credit altogether. Every fix is independent of the others' order: the test runs all 16 combinations. The
     waterfall is built from the fixes that are on.
   Task (step cards): read the study; find the boundary mismatch; state the counterfactual; add the grid costs; count the
   credit once; watch the conclusion change (waterfall on LX.Plot, each fix on or off, the grid factor); write the audit
   note (form-only checks, then the strong exemplar). Exemplars: LX.Exemplars, the who-pays ledger (LX.Ledger, i-ledger),
   where the conclusion holds (LX.Boundary, e-boundary) and the evidence ladder (LX.EvidenceLadder). Self-check:
   LX.Rubric (accounting, realism) and LX.Checklist (e-checklist).
   Node: module.exports = the pure model; _tests/learn/test_r07-cost-carbon-properly.js checks it and writes the no-JS
   blocks. Sourcing rule: the study is not the course author's, and resembles none of his studies in its technology or its story. */
(function () {
  "use strict";
  var FIX = ["boundary", "baseline", "grid", "credit"];
  // ---------------------------------------------------------------- pure model (no DOM; exported for Node)
  function crf(r, n) { return r === 0 ? 1 / n : r / (1 - Math.pow(1 + r, -n)); }
  function gridUS(D) { return D.co2.gridTonnes2023 / D.co2.gridKWh2023 * 1000; }   // t per kWh x 1,000 = t per MWh
  function gridFactor(D, id) { var c = D.co2.gridChoices.filter(function (x) { return x.id === id; })[0]; return c && c.v != null ? c.v : gridUS(D); }
  function all(on) { var f = {}; FIX.forEach(function (k) { f[k] = !!on; }); return f; }
  function run(D, F, gid) {
    var I = D.inputs, N = I.buses, miles = N * I.milesPerBus, k = crf(I.rate, I.life), E = I.electric, G = I.diesel, R = I.grid, C = I.credit;
    var e = { upfront: N * (E.price + E.charger) - N * C.perBus, mwh: miles * E.kWhPerMile / 1000 };
    e.capital = e.upfront * k; e.energy = miles * E.kWhPerMile * E.energyPrice; e.maint = miles * E.maintPerMile;
    e.depotUpfront = F.grid || F.depot ? R.depotUpgrade : 0; e.depot = e.depotUpfront * k; e.demand = F.grid || F.demand ? R.peakKW * R.demandCharge * 12 : 0;
    e.creditTwice = F.credit ? 0 : N * C.perBus / I.life;
    e.total = e.capital + e.energy + e.maint + e.depot + e.demand - e.creditTwice;
    var d = { upfront: N * G.price, mpg: F.baseline ? G.newMpg : G.oldMpg, mm: F.baseline ? G.newMaintPerMile : G.oldMaintPerMile };
    d.capital = d.upfront * k; d.gallons = miles / d.mpg; d.fuel = d.gallons * G.fuelPrice; d.maint = miles * d.mm; d.total = d.capital + d.fuel + d.maint;
    var f = gridFactor(D, gid || "us"), co2 = { d: d.gallons * D.co2.dieselKgPerGal / 1000, e: F.boundary ? e.mwh * f : 0, factor: f };
    co2.cut = co2.d - co2.e; co2.pct = co2.cut / co2.d * 100;
    var saving = d.total - e.total, credit = N * C.perBus * k;
    var society = e.total + e.creditTwice + credit - d.total;   // extra cost for the agency and the state together (the credit nets out)
    return { e: e, d: d, co2: co2, saving: saving, extra: -saving, crf: k, miles: miles, creditYear: credit, creditTwiceYear: N * C.perBus / I.life,
      perTonne: saving < 0 && co2.cut > 0 ? -saving / co2.cut : null, society: society, societyPerTonne: society > 0 && co2.cut > 0 ? society / co2.cut : null };
  }
  // the conclusion as the fixes that are on (Fx; all four if left out) are added in the page's order: one bar per cost fix
  // that is on, then the result now (the boundary moves CO2 only); a grid fix with one of its two costs is labeled by it
  function gridOn(Fx) { return !!(Fx.grid || Fx.depot || Fx.demand); }
  function waterfall(D, gid, Fx) {
    Fx = Fx || all(true);
    var F = all(false), out = [{ id: "study", label: "The study", saving: run(D, F, gid).saving }];
    if (Fx.baseline) { F.baseline = true; out.push({ id: "baseline", label: "A fair baseline", saving: run(D, F, gid).saving }); }
    if (gridOn(Fx)) { F.grid = !!Fx.grid; F.depot = !!(Fx.grid || Fx.depot); F.demand = !!(Fx.grid || Fx.demand);
      out.push({ id: "grid", label: Fx.grid || (F.depot && F.demand) ? "Grid costs" : F.depot ? "Depot connection" : "Demand charges", saving: run(D, F, gid).saving }); }
    if (Fx.credit) { F.credit = true; out.push({ id: "credit", label: "The credit once", saving: run(D, F, gid).saving }); }
    var done = FIX.every(function (k) { return k === "grid" ? F.depot && F.demand : Fx[k]; });
    F.boundary = !!Fx.boundary; out.push({ id: done ? "audit" : "now", label: done ? "Audited" : "Now", saving: run(D, F, gid).saving });
    return out;
  }
  // formats
  function grp(n) { return Math.round(n).toLocaleString("en-US"); }
  function money(v) { return "$" + (Math.abs(v) / 1e6).toFixed(2) + " million"; }
  function usd(v) { return "$" + grp(Math.abs(v)); }
  function thou(v) { var r = Math.round(v / 1000); return (r < 0 ? "−" : "") + Math.abs(r).toLocaleString("en-US"); }
  function t(v) { return grp(v) + " t"; }
  function pct(v) { return Math.round(v) + "%"; }
  function fillT(s, F) { return String(s).replace(/\{([a-zA-Z0-9]+)\}/g, function (m, k) { return k in F ? F[k] : m; }); }
  function fillDeep(x, F) {
    if (typeof x === "string") return fillT(x, F);
    if (Array.isArray(x)) return x.map(function (y) { return fillDeep(y, F); });
    if (x && typeof x === "object") { var o = {}; Object.keys(x).forEach(function (k) { o[k] = fillDeep(x[k], F); }); return o; }
    return x;
  }
  // every number the page's texts name, from the model
  function facts(D) {
    var S0 = run(D, all(false)), A = run(D, all(true)), I = D.inputs;
    return { saving: money(S0.saving), cutPct: pct(S0.co2.pct), eCO2: t(A.co2.e), dCO2: t(A.co2.d), oldCO2: t(S0.co2.d), newMpg: I.diesel.newMpg, oldMpg: I.diesel.oldMpg,
      depot: money(I.grid.depotUpgrade), demand: usd(A.e.demand), creditYear: usd(S0.creditTwiceYear), extra: money(A.extra), cut: t(A.co2.cut),
      cutPctA: pct(A.co2.pct), credit: money(I.buses * I.credit.perBus), perTonne: "$" + grp(A.perTonne), societyPerTonne: "$" + grp(A.societyPerTonne), society: money(A.society), factor: gridUS(D).toFixed(3),
      buses: I.buses, oldYear: I.diesel.oldYear, newMaint: "$" + I.diesel.newMaintPerMile.toFixed(2), kWhPerMile: I.electric.kWhPerMile, lossPct: Math.round(D.co2.tdLoss * 100) + "%" };
  }
  function verdict(r) {
    return r.saving >= 0 ? "Electric saves " + money(r.saving) + " a year and lowers attributed CO₂ by " + t(r.co2.cut) + " (" + pct(r.co2.pct) + ")."
      : "Electric costs " + money(r.extra) + " a year more and lowers attributed CO₂ by " + t(r.co2.cut) + " (" + pct(r.co2.pct) + "): about $" + grp(r.perTonne) + " per attributed tonne.";
  }
  // the lines the page assembles (checked for every input in the test)
  function lineBoundary(D, gid) { var r = run(D, { boundary: true }, gid); return "**One boundary:** charging " + grp(r.e.mwh) + " MWh a year at " + r.co2.factor.toFixed(3) + " t per MWh is attributed " + t(r.co2.e) + ". The CO₂ cut falls from 100% to " + pct(r.co2.pct) + "."; }
  function lineBaseline(D) { var a = run(D, {}), b = run(D, { baseline: true }); return "**Fair baseline:** new diesel buses burn " + grp(b.d.gallons) + " gallons a year, not " + grp(a.d.gallons) + ". Diesel's yearly cost falls by " + money(a.d.total - b.d.total) + "."; }
  function lineGrid(D) { var r = run(D, { grid: true }); return "**Grid costs:** " + usd(r.e.demand) + " a year in demand charges, and " + money(r.e.depotUpfront) + " up front for the depot (" + usd(r.e.depot) + " a year as an annual equivalent)."; }
  function lineCredit(D) { var r = run(D, {}); return "**The credit once:** the " + money(D.inputs.buses * D.inputs.credit.perBus) + " stays off the price up front; the second count, " + usd(r.creditTwiceYear) + " a year, goes."; }
  function lineGridPart(D, which) { var r = run(D, which === "depot" ? { depot: true } : { demand: true });
    return which === "depot" ? "**Depot connection:** " + money(r.e.depotUpfront) + " up front, " + usd(r.e.depot) + " a year as an annual equivalent. The demand charges are still missing."
      : "**Demand charges:** " + usd(r.e.demand) + " a year. The depot connection is still missing."; }
  function lineVerdict(D, F, gid) { return "**Now:** " + verdict(run(D, F, gid)); }
  // the step's audited line: all four fixes at the grid factor chosen (so it never disagrees with the readout), and the
  // reader's prediction (the audit makes electric cost more at every grid factor; the factor moves CO2 only)
  function auditLine(D, gid, predicted) {
    var A = run(D, all(true), gid), v = verdict(A), head = "audited (all four fixes, grid at " + A.co2.factor.toFixed(3) + " t per MWh), ";
    return predicted ? (predicted === "more" ? "You predicted it: " : "You predicted otherwise: ") + head + v.charAt(0).toLowerCase() + v.slice(1) : "A" + head.slice(1) + v.charAt(0).toLowerCase() + v.slice(1);
  }
  // the study's inputs, its fleet plan and two numbers worked from them; the units key
  function inputRows(D) {
    var E = D.inputs.electric, G = D.inputs.diesel, C = D.inputs.credit;
    return [["Price per bus", usd(E.price) + " + " + usd(E.charger) + " charger", usd(G.price)],
      ["Energy per mile", E.kWhPerMile + " kWh, " + E.meter, G.oldMpg + " mpg (the " + G.oldYear + " buses)"],
      ["Energy price", "$" + E.energyPrice.toFixed(2) + " per kWh, energy rate only", "$" + G.fuelPrice.toFixed(2) + " per gallon"],
      ["Repairs per mile", "$" + E.maintPerMile.toFixed(2), "$" + G.oldMaintPerMile.toFixed(2) + " (the " + G.oldYear + " buses)"],
      ["Purchase credit", usd(C.perBus) + " per bus, " + C.name, "none"]];
  }
  function fleetLine(D) { var I = D.inputs; return "Both fleets: " + I.buses + " buses, " + grp(I.milesPerBus) + " miles each a year, a " + I.life + "-year life, a " + Math.round(I.rate * 100) + "% real discount rate."; }
  function planText(D) { return fillT(D.study.plan.text, facts(D)); }
  function worked(D) {
    var I = D.inputs, S0 = run(D, all(false)), miles = S0.miles;
    return ["Charging energy: " + I.buses + " buses × " + grp(I.milesPerBus) + " miles × " + I.electric.kWhPerMile + " kWh per mile = " + grp(S0.e.mwh * 1000) + " kWh = " + grp(S0.e.mwh) + " MWh a year.",
      "Its bill: " + grp(S0.e.mwh * 1000) + " kWh × $" + I.electric.energyPrice.toFixed(2) + " per kWh = " + usd(S0.e.energy) + " a year.",
      "Diesel fuel, as the study runs it: " + grp(miles) + " miles ÷ " + I.diesel.oldMpg + " mpg = " + grp(S0.d.gallons) + " gallons a year; at $" + I.diesel.fuelPrice.toFixed(2) + " per gallon, " + usd(S0.d.fuel) + " a year."];
  }

  // ---- the no-JS blocks (written by the test's --write mode)
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function rich(s) { return esc(s).replace(/\[\[([a-z0-9-]+)\|([^\]]+)\]\]/g, function (m, id, w) { return '<span class="lx-term" data-term=' + '"' + id + '">' + w + "</span>"; }); }
  function ledgerRows(D, gid, Fx) {   // [line, study, audited (or the fixes Fx), note]
    var S0 = run(D, all(false), gid), A = run(D, Fx ? Fx : all(true), gid);
    return [
      ["Electric: buses and chargers, net of the credit", S0.e.capital, A.e.capital, "up front " + money(S0.e.upfront)],
      ["Electric: electricity", S0.e.energy, A.e.energy, null],
      ["Electric: demand charges", S0.e.demand, A.e.demand, null],
      ["Electric: depot connection", S0.e.depot, A.e.depot, "up front " + money(A.e.depotUpfront)],
      ["Electric: repairs", S0.e.maint, A.e.maint, null],
      ["Electric: the credit again, as income", -S0.e.creditTwice, -A.e.creditTwice, null],
      ["Electric, total", S0.e.total, A.e.total, null],
      ["Diesel: buses", S0.d.capital, A.d.capital, "up front " + money(S0.d.upfront)],
      ["Diesel: fuel", S0.d.fuel, A.d.fuel, S0.d.mpg + " then " + A.d.mpg + " miles per gallon"],
      ["Diesel: repairs", S0.d.maint, A.d.maint, null],
      ["Diesel, total", S0.d.total, A.d.total, null]
    ];
  }
  function staticTask(D) {
    var F = facts(D), S0 = run(D, all(false)), A = run(D, all(true)), h = [];
    h.push('<p class="lx-eyebrow">The study (fictional)</p>');
    h.push("<p><b>" + esc(D.study.title) + "</b>. " + esc(D.study.authors) + ".</p>");
    h.push("<p>" + esc(fillT(D.study.headline, F)) + "</p>");
    h.push(inputsHTML(D));
    h.push('<details class="lx-textalt"><summary>Four flaws, each fixed, and the conclusion after each</summary><div class="lx-scroll-x"><table class="lx-facts"><thead><tr><th scope="col">Fix</th><th scope="col">What it changes</th><th scope="col">Saving a year, electric against diesel</th><th scope="col">Attributed CO₂ cut</th></tr></thead><tbody>');
    var Fx = all(false);
    h.push("<tr><td>The study as published</td><td>none</td><td>" + money(S0.saving) + "</td><td>" + t(S0.co2.cut) + " (" + pct(S0.co2.pct) + ")</td></tr>");
    [["boundary", lineBoundary(D)], ["baseline", lineBaseline(D)], ["grid", lineGrid(D)], ["credit", lineCredit(D)]].forEach(function (x) {
      Fx[x[0]] = true; var r = run(D, Fx), f = D.fixes.filter(function (y) { return y.id === x[0]; })[0];
      h.push("<tr><td>" + esc(f.label) + "</td><td>" + esc(x[1].replace(/\*\*/g, "")) + "</td><td>" + (r.saving >= 0 ? money(r.saving) : "−" + money(r.saving).slice(1)) + "</td><td>" + t(r.co2.cut) + " (" + pct(r.co2.pct) + ")</td></tr>");
    });
    h.push("</tbody></table></div></details>");
    h.push("<p><b>Audited:</b> " + esc(verdict(A)) + " That is for the transit agency, with charging at EIA's 2023 U.S. average factor.</p>");
    return h.join("\n");
  }
  function inputsHTML(D) {
    var w = worked(D);
    return '<p class="lx-eyebrow">Its inputs (illustrative)</p><div class="lx-scroll-x"><table class="lx-facts r07-in"><thead><tr><th scope="col">Input</th><th scope="col">Electric</th><th scope="col">Diesel</th></tr></thead><tbody>'
      + inputRows(D).map(function (r) { return '<tr><th scope="row">' + esc(r[0]) + '</th><td data-l="Electric">' + esc(r[1]) + '</td><td data-l="Diesel">' + esc(r[2]) + "</td></tr>"; }).join("") + "</tbody></table></div>"
      + '<p class="lx-hint">' + esc(fleetLine(D)) + "</p>"
      + '<p class="r07-plan"><b>From ' + esc(D.study.plan.source) + ":</b> " + esc(planText(D)) + "</p>"
      + '<p class="lx-hint">' + esc(D.units) + "</p>"
      + '<details class="lx-textalt"><summary>Two numbers worked from these inputs</summary><ul><li>' + esc(w[0]) + "</li><li>" + esc(w[1]) + "</li></ul></details>";
  }
  function ledgerHTML(D) {
    var h = ['<p class="lx-eyebrow">The study against the audit, thousands of 2025 dollars a year (rounded)</p><div class="lx-scroll-x"><table class="lx-facts"><thead><tr><th scope="col">Line</th><th scope="col">Study</th><th scope="col">Audited</th></tr></thead><tbody>'];
    ledgerRows(D).forEach(function (r) { h.push("<tr><th scope=\"row\">" + esc(r[0]) + (r[3] ? '<br><span class="lx-hint">' + esc(r[3]) + "</span>" : "") + "</th><td>" + thou(r[1]) + "</td><td>" + thou(r[2]) + "</td></tr>"); });
    h.push("</tbody></table></div>");
    return h.join("");
  }
  function whoRows(D) {
    var A = run(D, all(true)), N = D.inputs.buses * D.inputs.credit.perBus;
    return [
      { head: "Port Alder Transit", sub: "the agency's budget", cells: ["+" + money(A.extra) + " a year", "$" + grp(A.perTonne) + " per attributed tonne (about)"] },
      { head: "The state", sub: "pays the credit", cells: [money(N) + " up front (" + money(A.creditYear) + " a year as an annual equivalent)", "a transfer to the agency"] },
      { head: "Agency and state together", sub: "the credit nets out", cells: ["+" + money(A.society) + " a year", "$" + grp(A.societyPerTonne) + " per attributed tonne (about)"] },
      { head: "Attributed CO₂", sub: "operating energy, charging at EIA's 2023 U.S. grid average", cells: ["−" + t(A.co2.cut) + " a year", pct(A.co2.pct) + " of the diesel fleet's"] }
    ];
  }
  function boundarySpec(D) {
    return { title: "Where the audited conclusion holds",
      holds: ["the inputs are this fictional study's, in 2025 dollars, over a 12-year life at 3%;", "costs are the agency's, with the state's credit once; CO₂ is each fleet's operating energy, at the tailpipe or the power plant;",
        "charging's CO₂ is attributed at the grid's average factor (EIA, 2023): what the grid really emits less needs a consequential analysis (A10);",
        D.inputs.electric.kWhPerMile + " kWh per mile is " + D.inputs.electric.meter + ";", "the agency pays the depot connection; both fleets run the same routes and miles."],
      leaves: ["making the buses and batteries: embodied CO₂ is outside both fleets' counts (a life-cycle boundary, A11);", "grid losses between plant and depot (EIA: about " + Math.round(D.co2.tdLoss * 100) + "%), which would raise charging's CO₂ a little;",
        "tailpipe air pollution and noise in the streets, which electric buses cut;", "a grid that gets cleaner over the 12 years, and battery replacement;", "federal grants, fuel and power price changes."],
      source: "Illustrative inputs; real fleets differ. EIA: 10.19 kg CO₂ per U.S. gallon of diesel (2024); 1.53 billion tonnes over 4.18 trillion kWh generated, U.S. 2023." };
  }
  function boundaryHTML(D) {
    var b = boundarySpec(D);
    return '<p class="lx-eyebrow">' + esc(b.title) + '</p><div class="lx-scroll-x"><table class="lx-facts"><thead><tr><th scope="col">It holds when</th><th scope="col">It leaves out</th></tr></thead><tbody><tr><td><ul>'
      + b.holds.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul></td><td><ul>" + b.leaves.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul></td></tr></tbody></table></div>";
  }
  function exemplarsSpec(D) { return fillDeep(D.exemplars, facts(D)); }
  function whoHTML(D) {
    return '<p class="lx-eyebrow">Who pays, who gains: the audited plan, a year, against new diesel buses</p><div class="lx-scroll-x"><table class="lx-facts"><thead><tr><th scope="col">Who</th><th scope="col">Cost or change</th><th scope="col">Per attributed tonne of CO₂</th></tr></thead><tbody>'
      + whoRows(D).map(function (r) { return '<tr><th scope="row">' + esc(r.head) + '<br><span class="lx-hint">' + esc(r.sub) + "</span></th><td>" + esc(r.cells[0]) + "</td><td>" + esc(r.cells[1]) + "</td></tr>"; }).join("") + "</tbody></table></div>";
  }
  function ladderHTML(D) {
    var L = D.ladder, lab = {}; L.rungs.forEach(function (r) { lab[r.id] = r.label; }); lab[L.off.id] = L.off.label;
    return '<p class="lx-eyebrow">' + esc(L.title) + "</p><ul>" + L.items.map(function (it) { return "<li>" + esc(it.text) + " <b>" + esc(lab[it.answer[0]]) + ".</b> " + esc(it.note) + "</li>"; }).join("") + "</ul>";
  }
  function checksOf(D, text) { var s = String(text || ""); return D.writeChecks.map(function (c) { return { id: c.id, label: c.label, ok: new RegExp(c.re, "i").test(s) }; }); }

  var model = { FIX: FIX, crf: crf, gridUS: gridUS, gridFactor: gridFactor, all: all, run: run, waterfall: waterfall, gridOn: gridOn, grp: grp, money: money, usd: usd, thou: thou, t: t, pct: pct,
    fillT: fillT, fillDeep: fillDeep, facts: facts, verdict: verdict, lineBoundary: lineBoundary, lineBaseline: lineBaseline, lineGrid: lineGrid, lineGridPart: lineGridPart, lineCredit: lineCredit, lineVerdict: lineVerdict, auditLine: auditLine,
    inputRows: inputRows, fleetLine: fleetLine, planText: planText, worked: worked, inputsHTML: inputsHTML,
    ledgerRows: ledgerRows, staticTask: staticTask, whoHTML: whoHTML, ladderHTML: ladderHTML, ledgerHTML: ledgerHTML, whoRows: whoRows, boundarySpec: boundarySpec, boundaryHTML: boundaryHTML, exemplarsSpec: exemplarsSpec, checksOf: checksOf, esc: esc, rich: rich };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX || !window.LX.H) return;

  // ================================================================ the page
  var LX = window.LX, H = LX.H, SLUG = "r07-cost-carbon-properly";
  LX.mount(SLUG, function (live, data, root) {
    var D = data.r07_cost_carbon_properly, P = data.path;
    var saved = LX.store.get("r07", {}) || {};
    var S = { fx: Object.assign(all(false), saved.fx || {}), grid: saved.grid || "us", note: saved.note || "" };
    function keep() { LX.store.set("r07", { fx: S.fx, grid: S.grid, note: S.note }); }
    function ref(code) { return LX.lessonRefHTML ? LX.lessonRefHTML(P, code) : code; }
    var F0 = facts(D);

    // ---------- the scene: the study as published, and the audit's conclusion now
    var stage = H("div", { class: "lx-stage r07-stage" }, live), cols = H("div", { class: "r07-cols" }, stage);
    var paper = H("article", { class: "r07-paper", "aria-label": "The study, as published (fictional)" }, cols);
    H("p", { class: "lx-eyebrow", text: "The study, as published · fictional" }, paper);
    H(LX.hTag(3, paper), { text: D.study.title }, paper);   // an h2 when the scene sits right under the page title
    H("p", { class: "r07-by", text: D.study.authors }, paper);
    H("p", { class: "r07-head", text: fillT(D.study.headline, F0) }, paper);
    H("p", { class: "lx-hint", text: D.study.method }, paper);
    var S0 = run(D, all(false));
    var tb = H("table", { class: "lx-facts r07-tab" }, paper); H("caption", { text: "Its tables: a year, 2025 dollars." }, tb);
    var hr0 = H("tr", null, H("thead", null, tb)); ["", "Electric", "Diesel"].forEach(function (x) { H("th", { scope: "col", text: x }, hr0); });
    var tbd = H("tbody", null, tb);
    [["Cost", money(S0.e.total), money(S0.d.total)], ["CO₂", t(S0.co2.e), t(S0.co2.d)]].forEach(function (r) { var tr = H("tr", null, tbd); H("th", { scope: "row", text: r[0] }, tr); H("td", { text: r[1], "data-l": "Electric" }, tr); H("td", { text: r[2], "data-l": "Diesel" }, tr); });
    H("div", { class: "r07-inputs", html: inputsHTML(D) }, paper);   // the study's inputs, its fleet plan, the units and two worked numbers
    var audit = H("section", { class: "r07-audit", "aria-label": "Your audit" }, cols);
    H("p", { class: "lx-eyebrow", text: "Your audit" }, audit);
    var chips = H("div", { class: "lx-readouts", "aria-live": "polite" }, audit), fixList = H("ul", { class: "r07-fixes" }, audit), verdictEl = H("p", { class: "r07-verdict" }, audit);
    H("p", { class: "lx-hint", html: LX.rich("[[attributed-emissions|Attributed]] CO₂: diesel at the tailpipe and, once the boundary is fixed, charging at the grid's [[average-emission-factor|average factor]]. What the grid really emits less needs a [[consequential-analysis|consequential analysis]]: ") + ref("A10") + "." }, audit);
    function chip(label, value, tone) { var c = H("div", { class: "lx-readout" + (tone ? " " + tone : "") }, chips); H("span", { text: label }, c); H("b", { text: value }, c); }
    function paint() {
      var r = run(D, S.fx, S.grid);
      chips.innerHTML = "";
      chip(r.saving >= 0 ? "Electric saves, a year" : "Electric costs more, a year", money(r.saving), r.saving >= 0 ? "good" : "bad");
      chip("Attributed CO₂ cut, a year", t(r.co2.cut) + " (" + pct(r.co2.pct) + ")");
      chip("Cost per attributed tonne", r.perTonne ? "about $" + grp(r.perTonne) : "none: electric saves money");
      fixList.innerHTML = "";
      D.fixes.forEach(function (f) {
        var part = f.id === "grid" && !S.fx.grid && (S.fx.depot || S.fx.demand) ? (S.fx.depot ? "depot connection added; demand charges still missing" : "demand charges added; depot connection still missing") : null;
        var li = H("li", { class: S.fx[f.id] ? "on" : "" }, fixList); H("span", { class: "r07-tick", "aria-hidden": "true", html: LX.icon(S.fx[f.id] ? "check" : "cross") }, li); H("span", { text: f.label + ": " + (S.fx[f.id] ? f.short : part || "not fixed yet") }, li); });
      verdictEl.textContent = verdict(r) + (S.fx.boundary ? " CO₂ at " + r.co2.factor.toFixed(3) + " t per MWh of charging." : "");
      buildExplain();
    }
    function fix(id, on) { S.fx[id] = on; if (id === "grid") { S.fx.depot = on; S.fx.demand = on; } keep(); paint(); }

    function choice(act, items, onRight) {   // a row of options with feedback; the right one applies its fix
      var g = H("div", { class: "r07-opts", role: "group" }, act), out = H("div", { class: "lx-predict-out", "aria-live": "polite" }, act);
      items.forEach(function (it) {
        var b = H("button", { type: "button", class: "lx-choice", "aria-pressed": "false" }, g); H("span", { text: fillT(it.label, F0) }, b);
        b.addEventListener("click", function () {
          g.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
          out.innerHTML = ""; H("div", { class: "lx-saw" + (it.right ? "" : " no"), html: LX.icon(it.right ? "check" : "question") + "<div><b>" + (it.right ? "Right:" : "Not quite:") + "</b> " + LX.rich(fillT(it.fb, F0)) + "</div>" }, out);
          if (it.right) onRight();
        });
      });
    }
    var predicted = null;
    var steps = [
      { text: "A consultancy says Port Alder's new electric buses are cheaper and carbon-free. Read its summary and tables above; before auditing, predict what an audit will leave of the saving.",
        build: function (act, api) {
          var p = LX.Predict(act, { id: "r07-predict", q: "After the audit, the electric fleet will…", answer: "more",
            options: [{ value: "same", label: "still save about as much" }, { value: "less", label: "save less" }, { value: "more", label: "cost more" }],
            onPick: function (v) { predicted = v; api.saw("Locked in. Four flaws follow; fix each and watch the conclusion on the right."); api.done(); } });
          if (p.picked()) { predicted = p.picked(); api.done(); }
        } },
      { text: "Flaw 1, two boundaries: one item is inside the cost but outside the CO₂ count, for one fleet only. Which is it?",
        build: function (act, api) {
          var b = H("div", { class: "lx-xcard r07-bcard" }, act);
          LX.Boundary(b, { title: "What the study counts", cols: [{ title: "In its cost", items: D.boundaryItems.filter(function (x) { return x.cost; }).map(function (x) { return x.label; }) },
            { title: "In its CO₂", items: D.boundaryItems.filter(function (x) { return x.co2; }).map(function (x) { return x.label; }).concat(["the buses' tailpipes"]) }] });
          choice(act, D.boundaryItems.map(function (x) { return { label: x.label, fb: x.fb, right: x.right }; }), function () { fix("boundary", true); api.saw(lineBoundary(D, S.grid)); api.done(); });
          H("p", { class: "lx-hint", html: "Case file " + ref("CF5") + ": where should a cogeneration study's boundary be drawn?" }, act);
          if (S.fx.boundary) api.done();
        } },
      { text: "Flaw 2, a convenient [[baseline|baseline]]: the study prices new diesel buses but runs them like its 2009 buses. Without the project, what would the agency do?",
        build: function (act, api) {
          choice(act, D.counterfactuals, function () { fix("baseline", true); api.saw(lineBaseline(D)); api.done(); });
          H("p", { class: "lx-hint", html: LX.rich("State the [[counterfactual|counterfactual]] in one sentence: without the project, Port Alder Transit buys 40 new diesel buses in 2026 and runs them 12 years.") }, act);
          if (S.fx.baseline) api.done();
        } },
      { text: "Flaw 3, missing grid costs: the study prices charging at an energy rate alone. Add the depot's new connection and the [[demand-charge|demand charges]] for charging 40 buses at once.",
        build: function (act, api) {
          var I = D.inputs.grid, tg = H("div", { class: "lx-toggles", role: "group", "aria-label": "Grid costs" }, act), on = { a: !!(S.fx.grid || S.fx.depot), b: !!(S.fx.grid || S.fx.demand) };
          function upd() {   // each cost enters on its own; the fix is done when both are in
            S.fx.depot = on.a; S.fx.demand = on.b; S.fx.grid = on.a && on.b; keep(); paint();
            if (S.fx.grid) { api.saw(lineGrid(D)); api.done(); } else if (on.a || on.b) api.saw(lineGridPart(D, on.a ? "depot" : "demand"));
          }
          LX.Toggle(tg, { label: "Depot connection: " + money(I.depotUpgrade) + " up front", on: on.a, onChange: function (v) { on.a = v; upd(); } });
          LX.Toggle(tg, { label: "Demand charges: " + grp(I.peakKW) + " kW at $" + I.demandCharge + " per kW-month", on: on.b, onChange: function (v) { on.b = v; upd(); } });
          H("p", { class: "lx-hint", html: "Up front and annual stay apart: the connection is paid once and shown a year as an annual equivalent at 3% over 12 years. Demand charges: " + ref("A4") + "." }, act);
          if (S.fx.grid) api.done();
        } },
      { text: "Flaw 4, a credit counted twice: the state's " + money(D.inputs.buses * D.inputs.credit.perBus) + " credit appears in two lines. Which line should go?",
        build: function (act, api) {
          var led = H("div", null, act);
          function drawLed() {
            led.innerHTML = "";
            LX.Ledger(led, { cls: "r07-led", caption: "The electric fleet's lines, thousands of 2025 dollars a year (rounded).", columns: ["Line", "Study", "Now"],
              rows: ledgerRows(D, S.grid).slice(0, 7).map(function (r, i) { var now = ledgerRows(D, S.grid, S.fx)[i]; return { head: r[0], sub: r[3] || null, total: i === 6, cells: [thou(r[1]), thou(now[2])].map(function (c) { return i === 0 || i === 5 ? { text: c, cls: "r07-pick" } : c; }) }; }) });
          }
          drawLed();
          choice(act, D.creditLines, function () { fix("credit", true); drawLed(); api.saw(lineCredit(D)); api.done(); });
          H("p", { class: "lx-hint", html: LX.rich("For the agency and the state together the credit is a [[transfer-payment|transfer]], not a saving: see the ledger under Exemplars.") + " " + ref("A12") + " shows why." }, act);
          if (S.fx.credit) api.done();
        } },
      { text: "The conclusion has changed: each bar is one cost fix that is on, then the result now. Turn any fix off and the chart follows; try the grid's CO₂ factor too.",
        build: function (act, api) {
          var plotHost = H("div", null, act), P1 = LX.Plot(plotHost, { text: "Text version of the chart", box: true });
          function draw() {
            var w = waterfall(D, S.grid, S.fx), bars = [], prev = 0, ticks = [], ticksN = [], SH = { study: "Study", baseline: "Base", grid: "Grid", credit: "Credit", audit: "Audit", now: "Now" }, last = w[w.length - 1];
            w.forEach(function (s, i) {
              var y0 = i === 0 || i === w.length - 1 ? 0 : prev, y1 = s.saving / 1e6;
              bars.push({ x0: i + 0.15, x1: i + 0.85, y0: Math.min(y0, y1), y1: Math.max(y0, y1), color: i === 0 || i === w.length - 1 ? "var(--lx-accent)" : y1 < y0 ? "var(--lx-bad)" : "var(--lx-good)", op: 0.85, rx: 3 });
              ticks.push([i + 0.5, s.label]); ticksN.push([i + 0.5, SH[s.id]]); prev = y1;
            });
            P1.render({ x: { min: 0, max: w.length, ticks: ticks, ticksN: ticksN }, y: { min: -1, max: 1.5, step: 0.5, fmt: function (v) { return (v < 0 ? "−" : "") + "$" + Math.abs(v).toFixed(1) + "M"; }, unit: "saving a year", zero: true },
              height: 250, heightN: 220, bars: bars, legend: [{ label: "A fix that lowers the saving", color: "var(--lx-bad)" }, { label: "The study and the result now", color: "var(--lx-accent)" }],
              marks: w.map(function (s, i) { return { x: i + 0.5, y: s.saving / 1e6, label: (s.saving < 0 ? "−" : "+") + (Math.abs(s.saving) / 1e6).toFixed(2), kind: "dot", pos: s.saving < 0 ? "below" : "above" }; }),
              aria: "The electric fleet's yearly saving against diesel, from the study's " + money(w[0].saving) + " to " + (last.id === "audit" ? "the audited " : "the result now, ") + (last.saving < 0 ? "an extra cost of " : "") + money(last.saving) + ", one bar per fix that is on.",
              text: { head: ["After", "Saving a year, electric against diesel"], rows: w.map(function (s) { return [s.label, (s.saving < 0 ? "−" : "") + money(s.saving)]; }), note: "Only the fixes that are on; the boundary fix changes CO₂ only." } });
          }
          var tg = H("div", { class: "lx-toggles", role: "group", "aria-label": "Fixes" }, act), tgs = {};
          D.fixes.forEach(function (f) { tgs[f.id] = LX.Toggle(tg, { label: f.label, on: S.fx[f.id], onChange: function (v) { fix(f.id, v); draw(); api.saw(lineVerdict(D, S.fx, S.grid)); api.done(); } }); });
          var w = H("div", { class: "cf-ctl" }, act), id = LX.uid("r07g"); H("p", { class: "cf-ctl-l", id: id, text: "The grid's CO₂ factor, t per MWh" }, w);
          var g = H("div", { class: "lx-seg", role: "group", "aria-labelledby": id }, w), gb = {};
          D.co2.gridChoices.forEach(function (c) {
            var b = H("button", { type: "button", text: c.v != null ? c.label : gridUS(D).toFixed(3) + ", " + c.label }, g); gb[c.id] = b;
            b.addEventListener("click", function () { S.grid = c.id; keep(); Object.keys(gb).forEach(function (k) { gb[k].setAttribute("aria-pressed", String(k === S.grid)); }); paint(); draw(); if (ah) aud(); api.saw(lineVerdict(D, S.fx, S.grid)); api.done(); });
          });
          Object.keys(gb).forEach(function (k) { gb[k].setAttribute("aria-pressed", String(k === S.grid)); });
          draw();
          var ah = H("p", { class: "lx-hint r07-audited", "aria-live": "polite" }, act);
          function aud() { ah.textContent = auditLine(D, S.grid, predicted); }
          aud();
          H("p", { class: "lx-hint", html: "The same audit inside an optimization model, where the plan itself responds: " + ref("M11") + "." }, act);
        } },
      { text: "Write your audit note: each flaw, its fix and its effect, then the corrected conclusion with its condition. The checks see only whether each part is there; compare with the strong note under Exemplars.",
        build: function (act, api) {
          var id = LX.uid("r07n"); H("label", { for: id, class: "cf-ctl-l", text: "Your audit note" }, act);
          var ta = H("textarea", { id: id, class: "r07-note", rows: "7" }, act); ta.value = S.note;
          var ul = H("ul", { class: "r07-checks", "aria-live": "polite" }, act), row = H("div", { class: "cf-row" }, act);
          var cp = H("button", { type: "button", class: "lx-btn small", text: "Copy my note" }, row), st = H("p", { class: "lx-hint", "aria-live": "polite" }, act);
          function check() {
            var c = checksOf(D, ta.value), n = c.filter(function (x) { return x.ok; }).length; ul.innerHTML = "";
            c.forEach(function (x) { var li = H("li", { class: x.ok ? "on" : "" }, ul); H("span", { "aria-hidden": "true", html: LX.icon(x.ok ? "check" : "cross") }, li); H("span", { text: x.label + (x.ok ? ": there" : ": still to write") }, li); });
            if (n === c.length) { api.saw("All " + c.length + " parts are there. Now rate the note against the rubric under Self-check."); api.done(); }
          }
          ta.addEventListener("input", function () { S.note = ta.value; keep(); check(); });
          cp.addEventListener("click", function () { LX.copyText(ta.value, { select: ta }).then(function (okc) { st.textContent = okc ? "Copied." : "Select the text and copy it."; }); });
          check();
        } }
    ];
    var cards = LX.StepCards(live, { steps: steps });

    // ---------- exemplars and self-check
    var xhost = document.getElementById("r07-exemplars");
    function buildExplain() {
      if (!xhost) return;
      if (!xhost.classList.contains("is-live")) {
        xhost.innerHTML = ""; xhost.classList.add("is-live");
        LX.Exemplars(H("div", { class: "lx-xcard" }, xhost), Object.assign({ lines: true }, exemplarsSpec(D)));
        xhost._who = H("div", { class: "lx-xcard" }, xhost);
        LX.Boundary(H("div", { class: "lx-xcard" }, xhost), boundarySpec(D));
        LX.EvidenceLadder(H("div", { class: "lx-xcard" }, xhost), { title: D.ladder.title, lede: D.ladder.lede, rungs: D.ladder.rungs, off: D.ladder.off, items: D.ladder.items });
      }
      var h = xhost._who; h.innerHTML = "";
      var hd = H("header", { class: "lx-x-head" }, h); H("h3", { text: "Who pays, who gains: the audited plan" }, hd);
      LX.Ledger(h, { cls: "r07-who", caption: "A year, against new diesel buses; 2025 dollars, rounded.", columns: ["Who", "Cost or change", "Per attributed tonne of CO₂"],
        rows: whoRows(D).map(function (r) { return { head: r.head, sub: r.sub, cells: r.cells.map(function (c) { return { text: c, cls: "who" }; }) }; }) });
    }
    var rhost = document.getElementById("r07-rubric");
    if (rhost) {
      rhost.innerHTML = ""; rhost.classList.add("is-live");
      LX.Rubric(H("div", { class: "lx-xcard" }, rhost), D.rubric);
      LX.Checklist(H("div", { class: "lx-xcard" }, rhost), { id: "r07-checklist", title: "Cost and carbon, before you trust a result", items: D.checklist, doneText: "Write what each check found into your audit note." });
    }
    paint();
    LX.demo(root, function (state) {
      if (state === "mid") { S.fx = { boundary: true, baseline: true, grid: false, credit: false }; keep(); cards.go(3); paint(); return { view: "two flaws fixed" }; }
      if (state === "done") { S.fx = all(true); keep(); cards.go(5); paint(); return { view: "all four fixed" }; }
      if (state === "depot") { S.fx = { boundary: true, baseline: true, grid: false, credit: false, depot: true, demand: false }; keep(); cards.go(3); paint(); return { view: "one grid cost in" }; }
      if (state === "nogrid") { S.fx = { boundary: true, baseline: true, grid: false, credit: true }; keep(); cards.go(5); paint(); return { view: "every fix but the grid costs" }; }
      return null;
    }, cards);
    root.lxLesson = { model: model, D: D, S: S, cards: cards };
  });
})();
