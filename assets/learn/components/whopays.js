/* whopays.js — LX.A13: the accounting layer of lesson A13 ("Who pays and who benefits?"), written as a small pure model
   (no DOM) so that sandbox SB3 (City Planner, engine E3) and capstone C3 (Prairie City 2040) can use it for their
   household and jobs outputs. Written for A13 (wave W5, builder learn-w5-b, as assets/learn/a13-who-pays-and-benefits.js)
   and promoted at the W5 integration (2026-11-06), its code unchanged.
   Browser: in the learn.js bundle; it sets window.LX.A13 (no page loads a separate file for it).
   Node:    const A13 = require("assets/learn/components/whopays.js").

   An energy model does not produce these outcomes by itself: it gives a cost, energy use and MW built; this layer turns
   them into who pays and who gains, with stated assumptions. Every output is a SCREENING ESTIMATE: coefficients are the
   caller's inputs, not predictions (curriculum v2 §9.6: transfers against real costs, job-years against permanent jobs,
   gross against net, and how households are grouped, each kept apart).

   Households (Prairie City's groups, from assets/learn/data/prairie-city.json; never retyped)
     rows = A13.groupsFrom(pc)            -> [{ key, label, households, income ($ a year), kWh (a year), spend ($ a year of
                                              home energy: electricity, gas, propane) }]
     a = A13.allocate(rows, cost, design, opts)
       cost    $ a year recovered from the households (a real cost of the plan, annual amount)
       design  "kwh" (per kWh: rate = cost / sum households x kWh), "fixed" (cost / households), "income" (each household
               pays the same share of its income: cost x income / sum households x income)
       opts    { kWh: { g1: kWh a year after the plan, ... } (the per-kWh design and kWhAfter use it; default rows' kWh),
                 spendDelta: { g1: $ a year per household, ... } (other changes in home energy spending from the plan,
                 such as gas no longer bought; default 0) }
       -> { design, cost, rate: { perKWh ($/kWh), perHousehold ($), shareOfIncome }, total ($, = cost),
            rows: [{ key, label, households, income, kWh, kWhAfter, spend, charge ($ a year per household), group ($ a year
                     for the whole group), spendAfter (spend + spendDelta + charge), burden (spend / income), burdenAfter,
                     delta (burdenAfter - burden) }] }
     A13.transfers(a, b)  -> { rows: [{ key, perHousehold (b - a, $), group (b - a, $) }], sum } : moving the same cost
                             between groups; sum is 0 within rounding when a and b recover the same cost (a transfer)
     A13.regroup(a, bands, labels) -> merged groups: [{ label, keys, households, income (mean), spend (mean), charge
                             (mean), burden and burdenAfter as total spending / total income of the merged group }]
     A13.above(a, line, after) -> { groups, households, total, share }: households in groups whose (after) burden is above
                             line (group averages; households inside a group are not resolved)
   Jobs (Ridge County when its coal plant retires; any plant and any build)
     j = A13.jobs({ staff, mineJobs, multiplier, newMW, capexPerKW, localShare, jobYearsPerM, buildYears, omPer100MW,
                    displacement (0-1), horizonYears })
       -> { lostDirect, lostTotal (x multiplier), capexM ($M), localM ($M spent in the county), buildJobYearsDirect,
            buildJobYears (x multiplier), buildJobsAvg (per building year), newPermDirect, newPermGross (x multiplier),
            newPermNet (gross x (1 - displacement)), netPerm (newPermNet - lostTotal), horizon: { years, build, newPerm,
            lostPerm, net } (job-years over the horizon) }
       Assumptions (A13.ASSUME.jobs): lost jobs are counted in full (no re-employment assumed); the multiplier turns direct
       jobs into direct + supplier + spending jobs on both sides; displacement applies to the new work only.
   Tax base
     t = A13.taxBase({ plantValueM, rate (0-1), newCapexM, taxableShare (0-1), otherRevenueM, mineCoalTaxM })
       -> { plantTaxM, newTaxM, changeM, revenueBeforeM, revenueAfterM, changeShare, coalShareBefore, coalShareAfter }
       Property tax is a transfer (owner to county): the county's change is real for its budget, not a resource cost.
   A13.ASSUME (the assumptions to print beside each result), A13.SCREENING (the label), A13.VERSION. */
(function () {
  "use strict";
  var VERSION = "a13-accounting-1";
  var SCREENING = "Screening estimate: your inputs and the stated assumptions, not a prediction.";
  var ASSUME = {
    split: ["The plan's yearly cost is recovered in full from households; businesses are left out.",
            "Each group is its average household; households within a group differ.",
            "Use does not change when the price changes (no response to the charge)."],
    jobs: ["Lost jobs count in full: no re-employment of the plant's or mines' workers is assumed.",
           "The multiplier turns on-site jobs into on-site, supplier and spending jobs, the same on both sides.",
           "Displacement applies to the new work only: local jobs that would have existed anyway."],
    tax: ["One property tax rate for the plant and the new farms; the county's other revenue does not change.",
          "Property tax is a transfer from owners to the county: its budget changes, the region's resources do not."]
  };
  function sum(a, f) { return a.reduce(function (s, x) { return s + f(x); }, 0); }

  function groupsFrom(pc) {
    return pc.groups.map(function (g) {
      return { key: g.key, label: g.label, households: g.households, income: g.income, kWh: g.use.electricityKWh, spend: g.homeEnergy };
    });
  }

  function allocate(rows, cost, design, opts) {
    opts = opts || {};
    var kAfter = function (r) { return opts.kWh && opts.kWh[r.key] != null ? opts.kWh[r.key] : r.kWh; };
    var sd = function (r) { return opts.spendDelta && opts.spendDelta[r.key] != null ? opts.spendDelta[r.key] : 0; };
    var H = sum(rows, function (r) { return r.households; }), E = sum(rows, function (r) { return r.households * kAfter(r); }), Y = sum(rows, function (r) { return r.households * r.income; });
    var rate = { perKWh: E > 0 ? cost / E : 0, perHousehold: H > 0 ? cost / H : 0, shareOfIncome: Y > 0 ? cost / Y : 0 };
    if (design !== "kwh" && design !== "fixed" && design !== "income") throw new Error("A13.allocate: unknown design " + design);
    var out = rows.map(function (r) {
      var c = design === "kwh" ? rate.perKWh * kAfter(r) : design === "fixed" ? rate.perHousehold : rate.shareOfIncome * r.income;
      var after = r.spend + sd(r) + c;
      return { key: r.key, label: r.label, households: r.households, income: r.income, kWh: r.kWh, kWhAfter: kAfter(r), spend: r.spend,
               charge: c, group: c * r.households, spendAfter: after, burden: r.spend / r.income, burdenAfter: after / r.income,
               delta: after / r.income - r.spend / r.income };
    });
    return { design: design, cost: cost, rate: rate, total: sum(out, function (r) { return r.group; }), rows: out };
  }

  function transfers(a, b) {
    var rows = a.rows.map(function (r, i) { var s = b.rows[i]; return { key: r.key, perHousehold: s.charge - r.charge, group: s.group - r.group }; });
    return { rows: rows, sum: sum(rows, function (r) { return r.group; }) };
  }

  function regroup(a, bands, labels) {
    return bands.map(function (keys, i) {
      var rs = a.rows.filter(function (r) { return keys.indexOf(r.key) >= 0; });
      var h = sum(rs, function (r) { return r.households; }), y = sum(rs, function (r) { return r.households * r.income; });
      var s = sum(rs, function (r) { return r.households * r.spend; }), s2 = sum(rs, function (r) { return r.households * r.spendAfter; }), c = sum(rs, function (r) { return r.group; });
      return { label: labels && labels[i] != null ? labels[i] : rs.map(function (r) { return r.label; }).join(" + "), keys: keys.slice(), households: h,
               income: y / h, spend: s / h, charge: c / h, burden: s / y, burdenAfter: s2 / y };
    });
  }

  function above(a, line, after) {
    var rs = a.rows || a, h = 0, n = 0, g = 0;
    rs.forEach(function (r) { n += r.households; if ((after ? r.burdenAfter : r.burden) > line) { h += r.households; g++; } });
    return { groups: g, households: h, total: n, share: n ? h / n : 0 };
  }

  function jobs(J) {
    var m = J.multiplier, lostDirect = J.staff + J.mineJobs, capexM = J.newMW * J.capexPerKW / 1000, localM = capexM * J.localShare;
    var bd = localM * J.jobYearsPerM, bt = bd * m, npd = J.newMW / 100 * J.omPer100MW, npg = npd * m, npn = npg * (1 - J.displacement);
    var lost = lostDirect * m, Hy = J.horizonYears;
    return { lostDirect: lostDirect, lostTotal: lost, capexM: capexM, localM: localM, buildJobYearsDirect: bd, buildJobYears: bt,
             buildJobsAvg: J.buildYears > 0 ? bt / J.buildYears : 0, newPermDirect: npd, newPermGross: npg, newPermNet: npn, netPerm: npn - lost,
             horizon: { years: Hy, build: bt, newPerm: npn * Hy, lostPerm: lost * Hy, net: bt + npn * Hy - lost * Hy } };
  }

  function taxBase(T) {
    var plant = T.plantValueM * T.rate, nw = T.newCapexM * T.taxableShare * T.rate;
    var before = T.otherRevenueM + plant, after = T.otherRevenueM + nw;
    return { plantTaxM: plant, newTaxM: nw, changeM: nw - plant, revenueBeforeM: before, revenueAfterM: after, changeShare: (after - before) / before,
             coalShareBefore: (T.mineCoalTaxM + plant) / before, coalShareAfter: T.mineCoalTaxM / after };
  }

  var A13 = { VERSION: VERSION, SCREENING: SCREENING, ASSUME: ASSUME, groupsFrom: groupsFrom, allocate: allocate, transfers: transfers,
              regroup: regroup, above: above, jobs: jobs, taxBase: taxBase };
  if (typeof module !== "undefined" && module.exports) module.exports = A13;
  if (typeof window !== "undefined" && window.LX) window.LX.A13 = A13;
})();
