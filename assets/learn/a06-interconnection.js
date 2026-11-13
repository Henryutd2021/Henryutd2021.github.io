// a06-interconnection.js — Lesson A6, "Why does it take years to connect a power plant or a data center?" (step cards,
// Analyst tier). Data centers appear only as loads.
//
// Data: assets/learn/data/a06-interconnection.json (the two paths through the queue, Prairie Town's cluster, the east
// substation, ERCOT's large-load numbers, the ladder, the numbers to remember and the sources), cf7-cost-of-waiting.json
// (case file CF7's toy, used unchanged for the money: a 100 MW load, invented round numbers, not the study's inputs,
// equations or results) and path.json (lesson links that appear once a lesson is live).
//
// Model (closed form; no solver):
//   cluster(C, {forced, readiness})   Prairie Town's cluster study (illustrative). Each generator request i has MW m_i and
//       an impact factor d_i: the share of its output that would flow on one line (a distribution factor, as in M1's
//       PTDFs). The cluster's added flow is F = sum m_i d_i (every project at full output). If F exceeds the line's
//       headroom H, one upgrade costing U is needed, split by proportional impact: share_i = U m_i d_i / F (Order 2023's
//       pro forma uses a proportional-impact method; MISO slide 6). A project withdraws when its share per kW is
//       strictly above the most it would pay (its limit); every withdrawal in a round happens together, then the rest
//       are restudied. A forced project (the reader's choice) withdraws after the first study. With the readiness rule
//       on, a request without site control never enters (Order 2023: site control for 90% of the site at the request).
//       Each study round takes 150 days (the pro forma cluster study; the toy gives restudies the same length).
//       Tie rule: a share equal to the limit stays. The test checks that no number shown sits on a tie, in every case
//       the page offers (no withdrawal or one forced, readiness on or off).
//   n1(N, c, third)   the east substation's lines (illustrative): two (or, after the upgrade, three) identical lines
//       share the east side's peak E plus the campus c equally (equal reactance, a DC-flow picture as in M1); with one
//       line out (N-1) the others carry E + c. It fits when (E + c) / (lines - 1) <= the line limit L. The largest new
//       load without an upgrade is L (lines - 1) - E.
//   ledgers(I, tau, s, bridge)   CF7's toy, the same formulas as cf7-cost-of-waiting.js (the test checks they agree):
//       present values at a monthly rate i = (1 + r)^(1/12) - 1, annuity A(tau) = (1 - (1 + i)^-tau) / i;
//       developer: lost margin m P (1 - b) A, carrying cost K i A, tariff share s of the utility's costs, bridge premium;
//       other customers: (1 - s) of the carrying cost U i A and of the expected stranded upgrades q(tau) U (1 + i)^-tau;
//       society: bridge power's CO2 above grid power, valued per tonne.
//   staged(I, tau, s, bridge, st)   this lesson's addition to the toy: a share g of the load, with the same share of its
//       capital and upgrades, connects at month a (a <= tau), the rest waits tau. Every part of the toy is linear in the
//       load, the capital and the upgrades, so the accounts are g L(a) + (1 - g) L(tau).
//   avoided(I, tau, k, ...)   the developer's cost at tau minus at tau - k: the most worth paying for a connection k
//       months sooner, before other risks or costs (CF7's Go deeper).
// Every number on the page is checked against this model by _tests/learn/test_a06-interconnection.js.
(function () {
  "use strict";

  // ---------------------------------------------------------------- pure model (no DOM; exported for Node)
  function byId(list) { var o = {}; list.forEach(function (x) { o[x.id] = x; }); return o; }
  function cluster(C, opt) {
    opt = opt || {};
    var forced = opt.forced || null, P = byId(C.projects), rounds = [];
    var act = C.projects.filter(function (p) { return !(opt.readiness && !p.site); }).map(function (p) { return p.id; });
    var barred = C.projects.filter(function (p) { return opt.readiness && !p.site; }).map(function (p) { return p.id; });
    for (var guard = 0; guard < 10 && act.length; guard++) {
      var flow = 0; act.forEach(function (id) { flow += P[id].mw * P[id].dfax; });
      var up = flow > C.headroomMW, per = up ? C.upgradeUSD / flow : 0, row = [], leave = [];
      act.forEach(function (id) {
        var p = P[id], impact = p.mw * p.dfax, share = per * impact, kw = share / (p.mw * 1000);
        var over = kw > p.limitPerKW, f = rounds.length === 0 && forced === id, go = over || f;
        if (go) leave.push(id);
        row.push({ id: id, impact: impact, share: share, perKW: kw, limit: p.limitPerKW, over: over, forced: f && !over, leaves: go });
      });
      rounds.push({ n: rounds.length + 1, active: act.slice(), flow: flow, upgrade: up, perMW: per, rows: row, leave: leave });
      if (!leave.length) break;
      act = act.filter(function (id) { return leave.indexOf(id) < 0; });
    }
    var last = rounds[rounds.length - 1], stays = last.leave.length ? [] : last.active;
    var mw = 0; stays.forEach(function (id) { mw += P[id].mw; });
    var fin = {}; if (!last.leave.length) last.rows.forEach(function (r) { fin[r.id] = r; });
    return { rounds: rounds, studies: rounds.length, days: rounds.length * C.studyDays, connected: stays, connectedMW: mw,
             requestedMW: C.projects.reduce(function (t, p) { return t + p.mw; }, 0), barred: barred, final: fin, upgrade: last.upgrade && !last.leave.length };
  }
  // the smallest distance between a project's share per kW and its limit, and between the flow and the headroom, in a run
  function margins(C, run) {
    var m = { kw: Infinity, flow: Infinity };
    run.rounds.forEach(function (r) {
      m.flow = Math.min(m.flow, Math.abs(r.flow - C.headroomMW));
      r.rows.forEach(function (x) { if (r.upgrade) m.kw = Math.min(m.kw, Math.abs(x.perKW - x.limit)); });
    });
    return m;
  }
  function n1(N, c, third) {
    var lines = third ? N.lines + 1 : N.lines, load = N.eastMW + c;
    var normal = load / lines, cont = load / (lines - 1);
    return { lines: lines, load: load, normal: normal, cont: cont, fits: cont <= N.lineMW, over: Math.max(0, cont - N.lineMW), maxNew: N.lineMW * (lines - 1) - N.eastMW };
  }
  function security(mw, perMW) { return mw * perMW; }
  // CF7's toy, the same formulas as cf7-cost-of-waiting.js
  function monthly(I) { return Math.pow(1 + I.discountPerYear, 1 / 12) - 1; }
  function annuity(I, tau) { var i = monthly(I); return tau > 0 ? (1 - Math.pow(1 + i, -tau)) / i : 0; }
  function ledgers(I, tau, s, bridge) {
    var i = monthly(I), A = annuity(I, tau), disc = Math.pow(1 + i, -tau), b = bridge ? I.bridgeShare : 0;
    var bridgeMWh = b * I.loadMW * I.hoursPerMonth;
    var util = { carry: I.upgradeCost * i * A, strand: Math.min(I.strandCap, I.strandPerMonth * tau) * I.upgradeCost * disc };
    var dev = { margin: I.marginPerMWMonth * I.loadMW * (1 - b) * A, capital: I.capitalCommitted * i * A,
                tariff: s * (util.carry + util.strand), bridge: bridgeMWh * I.bridgePremiumPerMWh * A };
    var rate = { carry: (1 - s) * util.carry, strand: (1 - s) * util.strand };
    var soc = { co2: bridgeMWh * I.bridgeExtraCO2PerMWh * I.socialCostPerTon * A };
    var sum = function (o) { return Object.keys(o).reduce(function (t, k) { return t + o[k]; }, 0); };
    var D = sum(dev), R = sum(rate), Sx = sum(soc);
    return { tau: tau, s: s, bridge: !!bridge, i: i, A: A, dev: dev, rate: rate, soc: soc, developer: D, ratepayers: R, society: Sx, total: D + R + Sx,
             dci: tau > 0 ? D / (I.loadMW * tau) : null };
  }
  function mix(a, b, g) {   // g a + (1 - g) b, part by part
    var m = function (x, y) { var o = {}; Object.keys(x).forEach(function (k) { o[k] = g * x[k] + (1 - g) * y[k]; }); return o; };
    return { dev: m(a.dev, b.dev), rate: m(a.rate, b.rate), soc: m(a.soc, b.soc), developer: g * a.developer + (1 - g) * b.developer,
             ratepayers: g * a.ratepayers + (1 - g) * b.ratepayers, society: g * a.society + (1 - g) * b.society, total: g * a.total + (1 - g) * b.total };
  }
  function staged(I, tau, s, bridge, st) {
    var full = ledgers(I, tau, s, bridge);
    if (!st) return full;
    var at = Math.min(st.at, tau), early = ledgers(I, at, s, bridge), L = mix(early, full, st.share);
    L.tau = tau; L.s = s; L.bridge = !!bridge; L.staged = { share: st.share, at: at };
    L.dci = tau > 0 ? L.developer / (I.loadMW * tau) : null;
    return L;
  }
  function avoided(I, tau, k, s, bridge, st) {
    var a = staged(I, tau, s, bridge, st), b = staged(I, Math.max(0, tau - k), s, bridge, st);
    return { from: a.developer, to: b.developer, saves: a.developer - b.developer };
  }
  // formats
  function musd(v) { var r = Math.round(v / 1e5) / 10; return "$" + r.toFixed(1) + "M"; }
  function kusd(v) { return "$" + (Math.round(v / 100) / 10).toFixed(1) + "k"; }
  function perkw(v) { return "$" + Math.round(v) + "/kW"; }
  function fmtN(v, d) { return v.toLocaleString("en-US", { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
  function esc(t) { return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function rich(t) {   // glossary marks to spans (the attribute is built in pieces so the build's term scanner reads only real ids)
    return esc(t).replace(/\[\[([a-z0-9-]+)\|([^\]]+)\]\]/g, function (m, id, w) { return '<span class="lx-term" data-term=' + '"' + id + '">' + w + "</span>"; });
  }
  var SHARE_LABEL = { 0: "Other customers", 0.5: "Half each", 1: "The waiting load" };
  var LEDGER_NOTE = "One total would hide who pays. A tariff reallocates the utility's costs; earlier service and bridge power change costs differently across the accounts.";
  // the ledger's words, defined where they first appear (step 9)
  // society's account, in CF7's words: what it counts, and what it leaves out
  var SOCIETY_NOTE = "Society's account here counts only bridge power's CO₂ above grid power for the same energy; any CO₂ change from the idle months is left out.";
  var LEDGER_WORDS = [
    ["[[present-value|Present value]]", "future costs stated in today's dollars"],
    ["Lost [[margin|margin]]", "revenue minus operating costs that the load cannot earn while it waits"],
    ["[[carrying-cost|Carrying cost]]", "interest on money spent and idle while it waits"],
    ["Expected [[stranded-cost|stranded]] upgrades", "wires built for a load that may never arrive, weighted by that chance"],
    ["[[bridge-power|Bridge power]]", "temporary on-site generators that serve part of the load while it waits"]
  ];
  var PARTS = {
    dev: [["margin", "lost margin"], ["capital", "carrying cost of idle capital"], ["tariff", "utility costs it is charged"], ["bridge", "bridge power premium"]],
    rate: [["carry", "carrying cost of the upgrades"], ["strand", "expected stranded upgrades"]],
    soc: [["co2", "CO₂ damage above grid power"]]
  };
  function partsText(o, list) {
    var t = list.filter(function (p) { return o[p[0]] > 5e3; }).map(function (p) { return p[1] + " " + musd(o[p[0]]); });
    return t.length ? t.join(", ") : "nothing";
  }
  // the ledger's rows (the explain layer and step 9 use the same)
  function ledgerRows(L) {
    return [{ head: "Developer", sub: "private", what: partsText(L.dev, PARTS.dev), v: L.developer },
            { head: "Other customers", sub: "ratepayers", what: partsText(L.rate, PARTS.rate), v: L.ratepayers },
            { head: "Society", sub: "external costs", what: partsText(L.soc, PARTS.soc), v: L.society }];
  }
  function roundWords(C, r) {
    var P = byId(C.projects);
    var head = "Study " + r.n + ": added flow " + fmtN(r.flow) + " MW " + (r.upgrade ? "> " : "≤ ") + "headroom " + C.headroomMW + " MW, " + (r.upgrade ? "upgrade " + musd(C.upgradeUSD) + " needed" : "no upgrade needed") + ".";
    var gone = r.leave.map(function (id) { return P[id].short; });
    return head + (gone.length ? " Withdraws: " + gone.join(", ") + "." : " Nobody withdraws.");
  }
  // why a run ended as it did, after the reader's withdrawal: who followed, and whether the line still needs the upgrade
  function forcedWords(C, run, forced) {
    var P = byId(C.projects), out = [], last = run.rounds[run.rounds.length - 1];
    var followed = [];
    run.rounds.forEach(function (r, k) { r.rows.forEach(function (x) { if (x.over && k > 0) followed.push(P[x.id].called); }); });
    if (followed.length) out.push("Then " + followed.join(" and ") + " left too: " + (followed.length > 1 ? "their shares" : "its share") + " passed what " + (followed.length > 1 ? "they" : "it") + " would pay.");
    out.push(last.upgrade ? "The " + run.connected.length + " that stay share the upgrade." : "With " + fmtN(last.flow) + " MW of added flow, under the " + C.headroomMW + " MW headroom, the line has room: no upgrade.");
    return out.join(" ");
  }
  function runWords(C, run) {
    var P = byId(C.projects), names = run.connected.map(function (id) { return P[id].short; });
    return run.studies + (run.studies === 1 ? " study" : " studies") + ", " + fmtN(run.days) + " days; " + (names.length ? names.join(", ") + " connect" + (names.length === 1 ? "s" : "") + ", " + run.connectedMW + " MW" : "nobody connects") +
      (run.upgrade ? ", with the " + musd(C.upgradeUSD) + " upgrade." : ", with no upgrade.");
  }

  // the money's live lines, one idea each (staged: whether the step offers staged service)
  function moneyLines(I, T, st8, withStaged) {
    var st = withStaged && st8.stagedOn ? T.staged : null, L = staged(I, st8.tau, st8.s, st8.bridge, st), out = [];
    if (!st8.tau) return ["No wait, no delay cost in any account. Slide the wait up."];
    if (st8.s > 0) out.push("The tariff moves " + musd(st8.s * staged(I, st8.tau, 0, st8.bridge, st).ratepayers) + " from other customers to the developer; it does not shrink the cost.");
    if (st8.bridge) out.push("Bridge power saves the developer " + musd(staged(I, st8.tau, st8.s, false, st).developer - L.developer) + "; its CO₂ above grid power for the same energy is " + musd(L.society) + " of damage, for society.");
    if (st && st8.tau > st.at) out.push("Staged service cuts the developer's cost from " + musd(staged(I, st8.tau, st8.s, st8.bridge, null).developer) + " to " + musd(L.developer) + ".");
    if (st && st8.tau <= st.at) out.push("The whole load connects by month " + st8.tau + ", so staged service changes nothing here.");
    if (withStaged && st8.tau >= T.shorter) out.push("Full service " + T.shorter + " months sooner is worth up to " + musd(avoided(I, st8.tau, T.shorter, st8.s, st8.bridge, st).saves) + " to the developer, before other risks.");
    if (!out.length) out.push("Try the tariff, then bridge power: watch which account each one changes.");
    return out;
  }
  function n1Words(N, c, third) {
    var r = n1(N, c, third), where = third ? "With the third line" : "Without new wires";
    return r.fits ? "Fits: with any one line out, the others stay within " + N.lineMW + " MW. " + where + ", up to " + r.maxNew + " MW of new load fits." :
      "Does not fit: with one line out, the other" + (r.lines > 2 ? "s carry " : " carries ") + fmtN(r.cont) + " MW, " + fmtN(r.over) + " MW over its limit. " + where + ", up to " + r.maxNew + " MW fits.";
  }
  // the money step's caption: the staged month is the model's effective month (at most the wait)
  function moneyCaption(I, L, tau, st) {
    var eff = st && tau > st.at ? st.at : null;
    return "Present value of a " + tau + "-month wait for a " + I.loadMW + " MW load" + (eff != null ? ", half served at month " + eff : "") + ". The accounts are kept apart.";
  }
  // one month of the wait, worked out (CF7's toy): what the developer loses each month, then its present value
  function workedMonth(I, tau) {
    var i = monthly(I), m = I.marginPerMWMonth * I.loadMW, k = I.capitalCommitted * i, A = annuity(I, tau), L = ledgers(I, tau, 0, false);
    return [
      "Monthly rate: 8% a year is " + (100 * i).toFixed(3) + "% a month.",
      "Margin lost each month: " + I.loadMW + " MW × $" + fmtN(I.marginPerMWMonth) + " = " + musd2(m) + ".",
      "Interest on idle capital each month: $" + fmtN(I.capitalCommitted / 1e6) + "M × " + (100 * i).toFixed(3) + "% = " + musd2(k) + ".",
      tau + " months in today's dollars: " + musd2(m + k) + " × " + A.toFixed(2) + " = " + musd(L.developer) + " for the developer."
    ];
  }
  function musd2(v) { return "$" + (Math.round(v / 1e4) / 100).toFixed(2) + "M"; }

  // ---------------------------------------------------------------- no-JS blocks (written into the page by the test's --write)
  function staticSteps(D, I7) {
    var C = D.cluster, P = byId(C.projects), run = cluster(C), N = D.n1, nn = n1(N, N.campusMW, false), E = D.ercot, T = D.toy;
    var L = ledgers(I7, T.startWait, 0, false), S = staged(I7, T.startWait, 0, false, T.staged), av = avoided(I7, T.startWait, T.shorter, 0, false, null);
    var out = "<p class=\"lx-eyebrow\">Two paths through the queue (Prairie Town, illustrative)</p><div class=\"lx-scroll-x\"><table class=\"lx-mini-table a6-fbt\"><thead><tr><th scope=\"col\">Step</th>" +
      D.walk.tracks.map(function (t) { return "<th scope=\"col\">" + esc(t.name) + "</th>"; }).join("") + "</tr></thead><tbody>";
    var n = Math.max.apply(null, D.walk.tracks.map(function (t) { return t.stages.length; }));
    for (var k = 0; k < n; k++) {
      out += "<tr><td>" + (k + 1) + "</td>" + D.walk.tracks.map(function (t) { var s = t.stages[k]; return "<td>" + (s ? "<b>" + esc(s.name) + ".</b> " + rich(s.what) : "") + "</td>"; }).join("") + "</tr>";
    }
    out += "</tbody></table></div>";
    out += "<p class=\"lx-eyebrow\">A cluster of four requests shares one upgrade (illustrative)</p><div class=\"lx-scroll-x\"><table class=\"lx-mini-table a6-fbt\"><thead><tr><th scope=\"col\">Request</th><th scope=\"col\">MW</th><th scope=\"col\">Flow on the line</th>" +
      run.rounds.map(function (r) { return "<th scope=\"col\">Study " + r.n + ": share</th>"; }).join("") + "<th scope=\"col\">Most it would pay</th></tr></thead><tbody>";
    C.projects.forEach(function (p) {
      out += "<tr><td>" + esc(p.name) + "</td><td>" + p.mw + "</td><td>" + fmtN(p.mw * p.dfax) + " MW</td>" + run.rounds.map(function (r) {
        var x = r.rows.filter(function (q) { return q.id === p.id; })[0];
        return "<td>" + (x ? perkw(x.perKW) + (x.leaves ? ", withdraws" : "") : "gone") + "</td>";
      }).join("") + "<td>" + perkw(p.limitPerKW) + "</td></tr>";
    });
    out += "</tbody></table></div><ul>" +
      "<li><b>Study 1.</b> " + esc(roundWords(C, run.rounds[0]).replace(/^Study 1: /, "")) + "</li>" +
      "<li><b>Study 2, a restudy.</b> " + esc(roundWords(C, run.rounds[1]).replace(/^Study 2: /, "")) + "</li>" +
      "<li><b>In all.</b> " + esc(runWords(C, run)) + "</li>" +
      "<li><b>Order 2023's readiness rule.</b> Normally, a request without site control cannot enter: " + esc(runWords(C, cluster(C, { readiness: true }))) + "</li>" +
      "<li><b>The data center.</b> Two " + N.lineMW + " MW lines feed the east substation (own peak " + N.eastMW + " MW). With one out, the other carries it all: only " + nn.maxNew + " MW of the " + N.campusMW + " MW campus fits before a third line.</li>" +
      "<li><b>Texas.</b> ERCOT's large-load requests total " + fmtN(E.requestsGW, 1) + " GW, against a record demand near " + fmtN(E.peakMW / 1000, 1) + " GW. At $" + fmtN(E.securityPerMW) + " per MW in its first batch study, the " + N.campusMW + " MW campus would hold " + musd(security(N.campusMW, E.securityPerMW)) + " of security in all.</li>" +
      "<li><b>The money.</b> Case file CF7's toy: a " + I7.loadMW + " MW load and invented round numbers. In present value, a " + T.startWait + "-month wait costs the developer " + musd(L.developer) + ", other customers " + musd(L.ratepayers) + " and society " + musd(L.society) + ".</li>" +
      "<li><b>Society's account.</b> " + esc(SOCIETY_NOTE.replace(/^Society's account here counts/, "It counts")) + "</li>" +
      "<li><b>Staged service.</b> Half the load served at month " + T.staged.at + ": the developer's cost falls to " + musd(S.developer) + ".</li>" +
      "<li><b>A faster connection.</b> " + T.shorter + " months sooner is worth up to " + musd(av.saves) + " to the developer.</li></ul>" +
      "<details class=\"lx-textalt\"><summary>The money worked out, with the toy's inputs (case file CF7)</summary><ol>" + workedMonth(I7, T.startWait).map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ol>" +
      "<div class=\"lx-scroll-x\"><table class=\"lx-mini-table a6-fbt\"><caption class=\"lx-hint\">Case file CF7's inputs, invented round numbers.</caption><thead><tr><th scope=\"col\">Input</th><th scope=\"col\">Value</th></tr></thead><tbody>" +
      I7.assumptions.map(function (a) { return "<tr><td>" + esc(a[0]) + "</td><td>" + esc(a[1]) + "</td></tr>"; }).join("") + "</tbody></table></div></details>";
    return out;
  }
  function staticPractice(D, I7) {
    var C = D.cluster, P = byId(C.projects), run = cluster(C), r1 = run.rounds[0], r2 = run.rounds[1], W = r2.rows.filter(function (x) { return x.id === "W"; })[0];
    var N = D.n1, alt = n1({ lineMW: 400, lines: 2, eastMW: N.eastMW }, 0, false), E = D.ercot, T = D.toy;
    var L = ledgers(I7, T.startWait, 0, false), av = avoided(I7, T.startWait, T.shorter, 0, false, null), A = annuity(I7, T.startWait);
    var items = [
      ["Split an upgrade by impact.", "A $" + fmtN(C.upgradeUSD / 1e6) + "M upgrade is needed, and four requests put " + C.projects.map(function (p) { return fmtN(p.mw * p.dfax) + " MW"; }).join(", ").replace(/, ([^,]*)$/, " and $1") + " of flow on the line. What does the " + P.W.mw + " MW wind farm, with " + fmtN(P.W.mw * P.W.dfax) + " MW of flow, pay?",
        "$" + fmtN(C.upgradeUSD / 1e6) + "M × " + fmtN(P.W.mw * P.W.dfax) + " ÷ " + fmtN(r1.flow) + " = " + musd(r1.rows[0].share) + ", or " + perkw(r1.rows[0].perKW) + " for its " + P.W.mw + " MW."],
      ["After a withdrawal.", "The " + P.X.mw + " MW placeholder, which puts " + fmtN(P.X.mw * P.X.dfax) + " MW of flow on the line, withdraws. Recompute the wind farm's share.",
        "$" + fmtN(C.upgradeUSD / 1e6) + "M × " + fmtN(P.W.mw * P.W.dfax) + " ÷ " + fmtN(r2.flow) + " = " + musd(W.share) + ", or " + perkw(W.perKW) + ": up " + perkw(W.perKW - r1.rows[0].perKW) + ", and " + C.studyDays + " more days of study."],
      ["N−1 with stronger lines.", "Two 400 MW lines feed a substation whose own peak is " + N.eastMW + " MW. How much new load fits before an upgrade?",
        "With one line out, the other must carry everything: 400 − " + N.eastMW + " = " + alt.maxNew + " MW."],
      ["Security in Texas.", "At $" + fmtN(E.securityPerMW) + " per MW, what total security does a 120 MW load hold in ERCOT's first batch study?",
        "120 × $" + fmtN(E.securityPerMW) + " = " + musd(security(120, E.securityPerMW)) + "."],
      ["Present value of a wait.", "In CF7's toy, lost margin is $" + fmtN(I7.marginPerMWMonth * I7.loadMW / 1e6, 1) + "M a month, discounted at 8% a year, month by month. What is " + T.startWait + " months of it worth today?",
        "$" + fmtN(I7.marginPerMWMonth * I7.loadMW / 1e6, 1) + "M × " + A.toFixed(2) + " = " + musd(L.dev.margin) + " (the annuity factor for " + T.startWait + " months)."],
      ["What a faster queue is worth.", "Cut the wait from " + T.startWait + " to " + (T.startWait - T.shorter) + " months. What is the most the developer should pay for that?",
        "Its cost falls from " + musd(av.from) + " to " + musd(av.to) + ": up to " + musd(av.saves) + ", before other risks or costs."],
      ["Read a claim critically.", "A headline says: “Texas needs 475 GW more power.” Name three questions you would ask.",
        "Are these requests or signed loads, and how many are duplicates or placeholders? By which year, and against a peak of about " + fmtN(E.peakMW / 1000, 1) + " GW?"],
      ["Match the reform.", "A cluster keeps losing placeholder requests after each study. Which Order 2023 rule aims at that?",
        "Site control and study deposits at the request (readiness), backed by withdrawal penalties."]
    ];
    return "<p class=\"lx-eyebrow\">Practice · about 30 minutes on your own</p><ol class=\"lx-fb-practice\">" + items.map(function (x) {
      // the exercise's name on its own line, then what is given and the question (two sentences at most)
      return "<li><p><b>" + esc(x[0]) + "</b></p><p>" + esc(x[1]) + "</p><details class=\"lx-answer\"><summary>Answer</summary><p>" + esc(x[2]) + "</p></details></li>";
    }).join("") + "</ol>";
  }

  function staticFacts(D) {
    return "<table class=\"lx-facts\">\n<thead><tr><th scope=\"col\">Number</th><th scope=\"col\">What it means</th><th scope=\"col\">Source</th></tr></thead>\n<tbody>\n" + D.facts.map(function (f) {
      return "<tr><td class=\"n\">" + esc(f.n) + "</td><td>" + esc(f.what) + "</td><td class=\"s\">" + (f.url ? "<a href=\"" + esc(f.url) + "\">" + esc(f.source) + "</a>" : esc(f.source)) + " · " + esc(f.asof) + "</td></tr>";
    }).join("\n") + "\n</tbody>\n</table>";
  }
  function staticSources(D) {
    return "<ul>\n" + D.sources.map(function (x) {
      return "<li>" + esc(x.text) + (x.url ? " <a href=\"" + esc(x.url) + "\">" + esc(x.label) + "</a>." : "") + "</li>";
    }).join("\n") + "\n</ul>";
  }

  var model = { moneyLines: moneyLines, n1Words: n1Words, moneyCaption: moneyCaption, workedMonth: workedMonth, musd2: musd2, LEDGER_NOTE: LEDGER_NOTE, SOCIETY_NOTE: SOCIETY_NOTE, LEDGER_WORDS: LEDGER_WORDS, staticFacts: staticFacts, staticSources: staticSources, cluster: cluster, margins: margins, n1: n1, security: security, monthly: monthly, annuity: annuity, ledgers: ledgers, staged: staged, mix: mix, avoided: avoided,
                ledgerRows: ledgerRows, forcedWords: forcedWords, roundWords: roundWords, runWords: runWords, staticSteps: staticSteps, staticPractice: staticPractice,
                musd: musd, kusd: kusd, perkw: perkw, fmtN: fmtN, SHARE_LABEL: SHARE_LABEL, PARTS: PARTS, byId: byId };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H, KEY = "a06_interconnection";

  LX.mount("interconnection", function (live, data, root) {
    var D = data[KEY], I7 = data.cf7_cost_of_waiting.idea, P = data.path, C = D.cluster, PJ = byId(C.projects), N = D.n1, E = D.ercot, T = D.toy;
    var saved = LX.store.get("a06") || {};
    var S = { forced: null, ready: false, campus: N.campusMW, third: false, tau: T.startWait, s: 0, bridge: false, stagedOn: false };
    if (C.forceable.indexOf(saved.forced) >= 0) S.forced = saved.forced;
    S.ready = !!saved.ready; S.bridge = !!saved.bridge; S.stagedOn = !!saved.stagedOn;
    if (saved.tau >= 0 && saved.tau <= I7.delays.max && saved.tau % I7.delays.step === 0) S.tau = saved.tau;
    if (I7.tariffShares.indexOf(saved.s) >= 0) S.s = saved.s;
    function keep() { LX.store.set("a06", { forced: S.forced, ready: S.ready, tau: S.tau, s: S.s, bridge: S.bridge, stagedOn: S.stagedOn }); }
    function chip(host, label, value, cls) { var c = H("div", { class: "lx-readout" + (cls ? " " + cls : "") }, host); H("span", { text: label }, c); H("b", { text: value }, c); }
    function ref(code) { return LX.lessonRefHTML(P, code); }

    // ---- QueueWalk: two tracks of stages, a rail of buttons and one panel (lesson-local; i-stepper)
    function QueueWalk(host, o) {
      var seen = {}, track = 0, sel = 0, w = H("div", { class: "a6w" }, host);
      var tc = H("div", { class: "cf-ctl" }, w);
      H("p", { class: "cf-ctl-l", id: "a6w-t", text: "Whose path?" }, tc);
      var seg = H("div", { class: "lx-seg", role: "group", "aria-labelledby": "a6w-t" }, tc);
      var tb = D.walk.tracks.map(function (t, k) { var b = H("button", { type: "button", text: t.short }, seg); b.addEventListener("click", function () { track = k; sel = 0; paint(true); }); return b; });
      var note = H("p", { class: "lx-hint" }, w);
      var rail = H("div", { class: "a6w-rail", role: "group", "aria-label": "Steps on the path" }, w);
      var panel = H("div", { class: "a6w-panel", "aria-live": "polite" }, w);
      var nav = H("div", { class: "a6w-nav" }, w);
      var bNext = H("button", { type: "button", class: "lx-btn small", html: "Next step on the path" + LX.icon("arrow") }, nav);
      var count = H("span", { class: "lx-hint" }, nav);
      bNext.addEventListener("click", function () { var t = D.walk.tracks[track]; if (sel < t.stages.length - 1) { sel++; paint(true); } else if (track < D.walk.tracks.length - 1) { track++; sel = 0; paint(true); } });
      function paint(user) {
        var t = D.walk.tracks[track], st = t.stages[sel]; seen[t.key + sel] = true;
        tb.forEach(function (b, k) { b.setAttribute("aria-pressed", String(k === track)); });
        note.innerHTML = LX.rich(t.note);
        rail.innerHTML = "";
        t.stages.forEach(function (s, k) {
          var b = H("button", { type: "button", class: "a6w-stop" + (seen[t.key + k] ? " seen" : ""), "aria-pressed": String(k === sel), "aria-label": "Step " + (k + 1) + ": " + s.name }, rail);
          H("span", { class: "n", text: String(k + 1) }, b); H("span", { class: "t", text: s.name }, b);
          b.addEventListener("click", function () { sel = k; paint(true); var x = rail.children[k]; if (x) x.focus({ preventScroll: true }); });
        });
        panel.innerHTML = "";
        H("h4", { class: "a6w-h", text: (sel + 1) + " · " + st.name }, panel);
        var dl = H("dl", { class: "a6w-dl" }, panel);
        H("dt", { text: "Who acts" }, dl); H("dd", { text: st.who }, dl);
        H("dt", { text: "What happens" }, dl); H("dd", { html: LX.rich(st.what) }, dl);
        if (st.time) { H("dt", { text: "How long" }, dl); H("dd", { text: st.time }, dl); }
        var extra = o.extra && o.extra(t.key, st.key); if (extra) { H("dt", { text: "In this lesson" }, dl); H("dd", { text: extra }, dl); }
        var nSeen = D.walk.tracks.reduce(function (a, tt) { return a + tt.stages.filter(function (s, k) { return seen[tt.key + k]; }).length; }, 0);
        var total = D.walk.tracks.reduce(function (a, tt) { return a + tt.stages.length; }, 0);
        count.textContent = nSeen + " of " + total + " steps opened, on both paths.";
        bNext.hidden = track === D.walk.tracks.length - 1 && sel === t.stages.length - 1;
        if (o.onSeen) o.onSeen(D.walk.tracks.map(function (tt) { return tt.stages.every(function (s, k) { return seen[tt.key + k]; }); }));
      }
      paint(false);
      return { go: function (k, s) { track = k; sel = s; paint(true); }, seeAll: function () { D.walk.tracks.forEach(function (tt, k) { tt.stages.forEach(function (s, j) { seen[tt.key + j] = true; }); }); paint(true); } };
    }

    // ---- ClusterBoard: the cluster's studies, round by round (lesson-local)
    function ClusterBoard(host, o) {
      var w = H("div", { class: "a6c" }, host), shown = o.progressive ? 0 : 99;
      var head = H("p", { class: "lx-hint", html: LX.rich("Upgrade: " + C.upgrade + ", " + musd(C.upgradeUSD) + ". Line [[headroom|headroom]] (spare capacity) before it: " + C.headroomMW + " MW. Each study takes " + C.studyDays + " days.") }, w);
      var ro = H("div", { class: "lx-readouts", "aria-live": "polite" }, w);
      var tables = H("div", { class: "a6c-rounds" }, w);
      var foot = H("div", { class: "a6c-foot" }, w);
      var go = o.progressive ? H("button", { type: "button", class: "lx-btn small" }, foot) : null;
      var status = H("p", { class: "lx-stage-status", "aria-live": "polite" }, w);
      if (go) go.addEventListener("click", function () { shown++; paint(); if (o.onRound) o.onRound(shown, current()); });
      function current() { return cluster(C, { forced: S.forced, readiness: S.ready }); }
      function paint() {
        var run = current(), n = Math.min(shown, run.rounds.length);
        ro.innerHTML = "";
        chip(ro, "Studies so far", n + " · " + fmtN(n * C.studyDays) + " days");
        var r = n ? run.rounds[n - 1] : null;
        if (r) chip(ro, "Upgrade", r.upgrade ? "needed, " + musd(C.upgradeUSD) : "not needed", r.upgrade ? "" : "good");
        else chip(ro, "Asked to connect", run.requestedMW + " MW, " + C.projects.length + " requests");
        if (n === run.rounds.length) chip(ro, "Connecting", run.connectedMW + " of " + run.requestedMW + " MW asked");
        tables.innerHTML = "";
        run.rounds.slice(0, n).forEach(function (rd) {
          var box = H("div", { class: "a6c-round" }, tables);
          LX.Ledger(box, { cls: "a6c-led", caption: "Study " + rd.n + (rd.n > 1 ? " (a restudy)" : "") + ": " + (rd.upgrade ? "the upgrade is needed" : "no upgrade needed") + ".", columns: ["Request", "Flow on the line", "Share of the upgrade", "Per kW (most it would pay)", "Then"],
            rows: rd.rows.map(function (x) {
              var p = PJ[x.id];
              return { head: p.name, sub: p.mw + " MW", cells: [fmtN(x.impact) + " MW", rd.upgrade ? musd(x.share) : "$0", { text: perkw(x.perKW) + " (" + perkw(x.limit) + ")", cls: x.over ? "up" : "" },
                       { text: x.over ? "withdraws: too dear" : x.forced ? "withdraws: your choice" : "stays", cls: "a6-what " + (x.leaves ? "up" : "down") }] };
            }) });
        });
        if (run.barred.length) H("p", { class: "lx-hint", text: run.barred.map(function (id) { return PJ[id].name; }).join(", ") + ": no site control, so not let in." }, tables);
        if (go) { go.hidden = n >= run.rounds.length; go.textContent = n === 0 ? "Run the cluster study" : "Run the restudy"; }
        status.textContent = !r ? "Four requests wait for their cluster study." : n >= run.rounds.length ? "In all: " + runWords(C, run) : roundWords(C, r) + " The rest must be restudied.";
        return run;
      }
      paint();
      return { paint: function () { shown = 99; return paint(); }, run: current };
    }

    // ---- N−1 picture of the east substation (lesson-local; i-gauge in words)
    function N1View(host, o) {
      var w = H("div", { class: "a6n" }, host), fig = H("div", { class: "a6n-fig" }, w);
      var ro = H("div", { class: "lx-readouts", "aria-live": "polite" }, w);
      var sl = LX.Slider(w, { label: "Data center campus", color: "var(--lx-accent)", min: N.slider.min, max: N.slider.max, step: N.slider.step, value: S.campus,
        fmt: function (v) { return v + " MW"; }, onChange: function (v) { S.campus = v; paint(); if (o.onChange) o.onChange(v); } });
      var tg = LX.Toggle(H("div", { class: "lx-toggles", role: "group", "aria-label": "The upgrade" }, w), { label: "Third line built (the upgrade)", on: S.third, onChange: function (on) { S.third = on; paint(); if (o.onChange) o.onChange(S.campus); } });
      var verdict = H("p", { class: "lx-stage-status", "aria-live": "polite" }, w);
      function paint() {
        var r = n1(N, S.campus, S.third), Wd = 360, Hh = 60 + 40 * r.lines, svg = "";
        svg += '<rect class="box" x="8" y="20" width="76" height="' + (Hh - 40) + '" rx="6"/><text class="lb" x="46" y="' + (Hh / 2 + 4) + '">Grid</text>';
        svg += '<rect class="box" x="250" y="20" width="102" height="' + (Hh - 40) + '" rx="6"/><text class="lb" x="301" y="' + (Hh / 2 - 4) + '">East</text><text class="lb" x="301" y="' + (Hh / 2 + 12) + '">substation</text>';
        for (var k = 0; k < r.lines; k++) {
          var y = 40 + k * 40, out = k === 0, flow = out ? 0 : r.cont, hot = !out && !r.fits;
          svg += '<path class="ln' + (out ? " out" : hot ? " hot" : "") + '" d="M84 ' + y + ' H250"/>';
          svg += '<text class="fl' + (hot ? " hot" : "") + '" x="182" y="' + (y - 7) + '">' + (out ? "out of service" : fmtN(flow) + " of " + N.lineMW + " MW") + "</text>";
          if (out) svg += '<path class="x" d="M100 ' + (y - 7) + ' l14 14 M114 ' + (y - 7) + ' l-14 14"/>';
        }
        fig.innerHTML = '<svg viewBox="0 0 ' + Wd + " " + Hh + '" role="img" aria-label="' + esc("East substation with one of its " + r.lines + " lines out: each remaining line carries " + fmtN(r.cont) + " MW against a limit of " + N.lineMW + " MW.") + '">' + svg + "</svg>";
        ro.innerHTML = "";
        chip(ro, "Load at the substation", fmtN(r.load) + " MW");
        chip(ro, "Each line, all in service", fmtN(r.normal) + " MW");
        chip(ro, "Each line, one out (N−1)", fmtN(r.cont) + " MW", r.fits ? "good" : "bad");
        verdict.textContent = n1Words(N, S.campus, S.third);
        return r;
      }
      paint();
      return { set: function (v, third) { if (third != null) { S.third = third; tg.set(third); } S.campus = v; sl.set(v); paint(); } };
    }

    // ---- the money (CF7's toy; this lesson adds staged service)
    function MoneyView(host, o) {
      var w = H("div", { class: "a6m" }, host);
      H("p", { class: "lx-hint", text: "Case file CF7's toy, unchanged: a " + I7.loadMW + " MW load. " + I7.note }, w);
      var ctl = H("div", { class: "lx-ctls" }, w);
      var sl = LX.Slider(H("div", null, ctl), { label: "Months of waiting", color: "var(--lx-accent)", min: I7.delays.min, max: I7.delays.max, step: I7.delays.step, value: S.tau,
        fmt: function (v) { return v + " months"; }, onChange: function (v) { S.tau = v; paint(true); } });
      var tc = H("div", { class: "cf-ctl" }, ctl);
      H("p", { class: "cf-ctl-l", id: LX.uid("a6t") , text: "Large-load tariff: who pays the utility's costs while the load waits?" }, tc);
      var seg = H("div", { class: "lx-seg", role: "group", "aria-labelledby": tc.firstChild.id }, tc);
      var sb = I7.tariffShares.map(function (s) { var b = H("button", { type: "button", text: SHARE_LABEL[s] }, seg); b.addEventListener("click", function () { S.s = s; paint(true); }); return b; });
      var tgs = H("div", { class: "lx-toggles", role: "group", "aria-label": "Options while it waits" }, ctl);
      var tB = LX.Toggle(tgs, { label: "Bridge power for half the load", on: S.bridge, onChange: function (on) { S.bridge = on; paint(true); } });
      var tS = o.staged ? LX.Toggle(tgs, { label: "Staged service: half the load at month " + T.staged.at, on: S.stagedOn, onChange: function (on) { S.stagedOn = on; paint(true); } }) : null;
      var ro = H("div", { class: "lx-readouts", "aria-live": "polite" }, w);
      var led = H("div", null, w);
      var status = H("div", { class: "lx-stage-status", "aria-live": "polite", style: "display:grid;gap:4px" }, w);
      H("p", { class: "lx-hint", text: SOCIETY_NOTE }, w);
      if (o.staged) H("p", { class: "lx-hint", text: "Staged service is this lesson's addition to the toy: that half brings half the capital and half the upgrades." }, w);
      if (!o.staged) {
        // the words of the ledger, one month worked out, then the toy's inputs (CF7's own table, unchanged)
        var dl = H("dl", { class: "a6m-words" }, w);
        LEDGER_WORDS.forEach(function (x) { H("dt", { html: LX.rich(x[0]) }, dl); H("dd", { text: x[1] }, dl); });
        var wk = H("div", { class: "a6m-wk" }, w);
        H("p", { class: "lx-eyebrow", text: "One month of a " + T.startWait + "-month wait, worked out (no bridge power, no tariff share)" }, wk);
        var ol = H("ol", { class: "a6m-work" }, wk);
        workedMonth(I7, T.startWait).forEach(function (t) { H("li", { text: t }, ol); });
        var inp = H("details", { class: "lx-textalt a6m-in" }, w); H("summary", { text: "The toy's inputs (case file CF7)" }, inp);
        LX.Ledger(inp, { cls: "a6m-tab", caption: "Case file CF7's inputs, invented round numbers.", columns: ["Input", "Value"], rows: I7.assumptions.map(function (a) { return { head: a[0], cells: [a[1]] }; }) });
      }
      function paint(acted) {
        var st = o.staged && S.stagedOn ? T.staged : null, L = staged(I7, S.tau, S.s, S.bridge, st);
        sb.forEach(function (b, k) { b.setAttribute("aria-pressed", String(I7.tariffShares[k] === S.s)); });
        ro.innerHTML = "";
        chip(ro, "Developer", musd(L.developer)); chip(ro, "Other customers", musd(L.ratepayers)); chip(ro, "Society", musd(L.society));
        led.innerHTML = "";
        LX.Ledger(led, { cls: "a6-led", caption: moneyCaption(I7, L, S.tau, st),
          columns: ["Account", "What the wait costs them", "Present value"],
          rows: ledgerRows(L).map(function (r) { return { head: r.head, sub: r.sub, cells: [{ text: r.what, cls: "a6-what" }, musd(r.v)] }; }) });
        status.innerHTML = ""; moneyLines(I7, T, S, !!o.staged).forEach(function (t) { H("p", { text: t }, status); });
        if (acted) { keep(); if (o.onChange) o.onChange(L); }
        buildExplain();
        return L;
      }
      paint(false);
      return { set: function (o2) { if (o2.tau != null) { S.tau = o2.tau; sl.set(o2.tau); } if (o2.bridge != null) { S.bridge = o2.bridge; tB.set(o2.bridge); } if (o2.staged != null && tS) { S.stagedOn = o2.staged; tS.set(o2.staged); } paint(true); } };
    }

    // ---------- step cards
    var hooks = {};
    var steps = [
      { text: "Prairie Town gets two requests: a 200 MW wind farm wants to send power in, and a 300 MW data center campus wants to draw power out. First, a guess about the U.S. queue.",
        build: function (act, api) {
          var g = LX.Guess(act, { id: "a6-wait", q: "For projects built in 2025, what was the median time from interconnection request to commercial operation?", ticks: D.guess.ticks, answer: D.guess.answer, start: D.guess.start,
            onLock: function (v, out) {
              H("p", { class: "lx-saw-p", html: LX.rich("**" + (v === D.guess.answer ? "Right" : "The answer") + ": over five years**, where data exist. Of the capacity that asked to connect in 2000–2020, only 13% was operating by the end of 2025; about 75% withdrew.").replace(/\*\*(.+?)\*\*/g, "<b>$1</b>") }, out);
              H("p", { class: "lx-hint", text: "Berkeley Lab, Queued Up: 2026 Edition (May 2026)." }, out);
              api.done();
            } });
          if (LX.progress.guess("a6-wait") != null) api.done();
          return g;
        } },
      { text: "Walk both requests through their paths. Tap each step to see who acts and what happens; a generator and a large load follow different rules.",
        build: function (act, api) {
          var q = QueueWalk(act, { extra: function (track, key) {
              var run = cluster(C), Wf = run.final.W;
              if (track === "gen" && key === "agr" && Wf) return "The wind farm's share is " + musd(Wf.share) + ": its deposits must total " + musd(0.2 * Wf.share) + ". With 10% held since the facilities study, it adds " + musd(0.1 * Wf.share) + ".";
              if (track === "load" && key === "req") return "For 300 MW, that is " + musd(security(N.campusMW, E.securityPerMW)) + " of security in all.";
              if (track === "load" && key === "stage") return "Two " + N.lineMW + " MW lines, a " + N.eastMW + " MW east side: step 7.";
              return null; },
            onSeen: function (done) { if (done[0] && done[1]) { api.done(); api.saw("A generator's path has a shared study and shared costs; a large load's path runs through its utility, its tariff and the wires near it."); } } });
          hooks.walk = q;
        } },
      { text: "Four generator requests reached the window together, so one [[cluster-study|cluster study]] covers them; their added flow overloads one line. Run the study and watch who stays.",
        build: function (act, api) {
          S.forced = null; S.ready = false;
          var b = ClusterBoard(act, { progressive: true, onRound: function (n, run) {
            if (n >= run.rounds.length) {
              var r1 = run.rounds[0].rows.filter(function (x) { return x.id === "W"; })[0], f = run.final.W;
              api.done(); api.saw("The placeholder's share was above what it would pay, so it left. The wind farm's share rose from **" + perkw(r1.perKW) + "** to **" + perkw(f.perKW) + "**, after " + fmtN(run.days) + " days of study.");
            } } });
          hooks.cluster = b;
        } },
      { text: "Now one more withdrawal, by your choice. Pick a project and see how the shares, the need for the upgrade and the days of study change.",
        build: function (act, api) {
          S.ready = false;
          var cc = H("div", { class: "cf-ctl" }, act);
          H("p", { class: "cf-ctl-l", id: "a6-f-l", text: "Also withdraw, after the first study:" }, cc);
          var seg = H("div", { class: "lx-seg", role: "group", "aria-labelledby": "a6-f-l" }, cc);
          var opts = [null].concat(C.forceable), btns = opts.map(function (id) {
            var bt = H("button", { type: "button", text: id ? PJ[id].short : "Nobody" }, seg);
            bt.addEventListener("click", function () { S.forced = id; keep(); paint(); if (id) { var run = board.paint(); api.done(); api.saw(forcedWords(C, run, id)); } });
            return bt;
          });
          var board = ClusterBoard(act, { progressive: false });
          function paint() { btns.forEach(function (bt, k) { bt.setAttribute("aria-pressed", String(opts[k] === S.forced)); }); board.paint(); }
          paint();
          if (S.forced) api.done();
          hooks.force = function (id) { btns[opts.indexOf(id)].click(); };
        } },
      { text: "FERC's Order 2023 (July 2023) changed the federal rules for connecting generators. Match each reform to the queue problem it aims at.",
        build: function (act, api) {
          LX.CardSort(act, {
            bins: [{ id: "spec", label: "Placeholder requests crowd the queue" }, { id: "serial", label: "One request at a time is slow" },
                   { id: "late", label: "Studies run late" }, { id: "shift", label: "A withdrawal shifts cost and time onto others" }],
            cards: [{ id: "site", text: "Control of 90% of the site, and a deposit by MW, at the request", bin: "spec", why: "Normally a request without land and money behind it cannot enter; a deposit can stand in for land only where regulations block it." },
                    { id: "cluster", text: "Cluster studies: every request in a window studied together, 150 days", bin: "serial", why: "One study for the group replaces a chain of single studies." },
                    { id: "pen", text: "Penalties on the transmission provider when a study runs late, after a grace period, with caps and exceptions", bin: "late", why: "After a 10-business-day grace period, $1,000 a business day for a late cluster study, capped at the study deposits." },
                    { id: "wd", text: "Withdrawal penalties that grow the later a project leaves", bin: "shift", why: "Leaving late costs the leaver, not only those who stay." },
                    { id: "ia", text: "Deposits that reach 20% of the upgrade costs by the agreement", bin: "spec", why: "Money at stake before construction filters out projects that are not ready; earlier deposits count toward the 20%." }],
            onCheck: function (g) { api.done(); api.saw("Order 2023's pro forma rules, as MISO summarized them in August 2023; grid operators adapt them in their own rules."); } });
        } },
      { text: "Turn on Order 2023's readiness rule: a request must normally control its site to enter, and the placeholder has none. What changes in the cluster?",
        build: function (act, api) {
          S.forced = null;
          var tg = LX.Toggle(H("div", { class: "lx-toggles", role: "group", "aria-label": "Rules" }, act), { label: "Readiness rule: site control at the request", on: S.ready,
            onChange: function (on) { S.ready = on; keep(); var run = board.paint(); if (on) { api.done(); var off = cluster(C); api.saw("Same three projects connect, at the same shares, after **" + fmtN(run.days) + " days** of study instead of " + fmtN(off.days) + ": no placeholder to withdraw."); } } });
          var board = ClusterBoard(act, { progressive: false });
          if (S.ready) api.done();
          hooks.ready = function () { if (!S.ready) tg.el.click(); };
        } },
      { text: "Now the campus: two 350 MW lines feed the east substation, whose own peak is 150 MW. How much of the 300 MW fits before new wires?",
        build: function (act, api) {
          var nn = n1(N, N.campusMW, false), view = null, more = null;
          var p = LX.Predict(act, { id: "a6-n1", answer: String(nn.maxNew),
            options: [{ value: String(N.lineMW * N.lines - N.eastMW), label: (N.lineMW * N.lines - N.eastMW) + " MW" }, { value: String(nn.maxNew), label: nn.maxNew + " MW" }, { value: "300", label: "All 300 MW" }, { value: "0", label: "None" }],
            feedback: { "550": "Two lines hold 700 MW, but the [[n-minus-one|N−1]] rule plans for one line out: the other must carry it all." },
            onPick: function () { show(); } });
          function show() {
            p.reveal("With one line out, the other carries the east side's " + N.eastMW + " MW plus the campus: " + N.lineMW + " − " + N.eastMW + " = " + nn.maxNew + " MW.");
            if (!view) view = N1View(act, {});
            api.done();
            api.saw("The study, not the lines' total, sets what fits: **" + nn.maxNew + " MW** now, the rest after a third line.");
            if (!more) more = H("p", { class: "lx-hint", html: "Voltage, reactive power and stability can bind before a line's limit does: " + ref("A17") + "." }, act);
          }
          if (p.picked()) show();
          hooks.n1 = function (v, third) { if (!p.picked()) { var b = act.querySelectorAll(".lx-choice")[1]; if (b) b.click(); } if (view) view.set(v, third); };
        } },
      { text: "Large loads have their own process: in Texas, a large load in ERCOT's first batch study holds $50,000 of [[financial-security|security]] per MW. What total security would the 300 MW campus hold?",
        build: function (act, api) {
          var want = security(N.campusMW, E.securityPerMW) / 1e6;
          var na = LX.NumAnswer(act, { label: "Security for 300 MW", unit: "$ million", accept: ["million", "M", "$M"], onCheck: function (v, input) {
            if (v == null) return;
            var ok = Math.abs(v - want) < 1e-9; input.classList.toggle("right", ok); input.classList.toggle("wrong", !ok);
            if (ok) { api.done(); api.saw("**$" + want + " million.** ERCOT's list of large loads seeking to connect totals " + fmtN(E.requestsGW, 1) + " GW, about " + fmtN(E.requestsGW / (E.peakMW / 1000), 1) + " times its record demand; " + fmtN(E.noStudyGW, 1) + " GW had no studies submitted, " + fmtN(E.energizedGW, 1) + " GW were energized."); }
            else api.saw("Not yet: 300 MW × $" + fmtN(E.securityPerMW) + " per MW, the total in millions of dollars.", true);
          } });
          H("p", { class: "lx-hint", html: LX.rich("ERCOT, slides to the Texas Senate, 29 July 2026; requests as of June 2026. In October 2025 the Secretary of Energy also asked FERC to start a rulemaking on connecting large loads to the interstate transmission system.") }, act);
          hooks.sec = function () { na.input.value = String(want); na.go(); };
        } },
      { text: "A wait costs money, and three accounts carry it. Using case file CF7's toy, price a 36-month wait, then move the tariff and switch on [[bridge-power|bridge power]].",
        build: function (act, api) {
          var m = MoneyView(act, { staged: false, onChange: function () { api.done(); } });
          hooks.money = m;
          if (S.s > 0 || S.bridge) api.done();
        } },
      { text: "Two ways to shorten the developer's wait: serve part of the load early, or connect sooner. Switch on [[staged-energization|staged service]] and read what a faster connection is worth.",
        build: function (act, api) {
          var m = MoneyView(act, { staged: true, onChange: function () { api.done(); } });
          hooks.staged = m;
          if (S.stagedOn) api.done();
          H("a", { class: "lx-btn small", style: "justify-self:start", href: "#explain", html: "The queue and the ledger, as diagrams" + LX.icon("arrow") }, act);
        } }
    ];
    var cards = LX.StepCards(live, { id: "a6-steps", steps: steps });

    // ---------- the explain layer (the reader's own numbers where it can)
    var xhost = document.getElementById("a06-explain");
    function buildExplain() {
      if (!xhost) return;
      xhost.innerHTML = ""; xhost.classList.add("is-live");
      var run = cluster(C), Wf = run.final.W, nn = n1(N, N.campusMW, false), small = { c: 150 };
      LX.Flowchart(H("div", { class: "lx-xcard" }, xhost), {
        title: "A generator cluster: the questions in order", lede: "The page's original cluster, whatever you chose above: no withdrawal of yours, no readiness rule. Projects whose share is too high leave; the others are restudied.",
        nodes: { req: { t: "Requests filed", tN: ["Requests", "filed"], s: "site control, deposit", sN: "site, deposit" },
                 study: { t: "Study: overload found?", tN: ["Overload", "found?"], k: "q" },
                 up: { t: "Upgrades and shares", tN: ["Upgrades", "and shares"], s: "by impact on the line", sN: "by impact" },
                 dear: { t: "Any share too high?", tN: ["A share", "too high?"], k: "q" },
                 wd: { t: "Those projects leave", tN: ["Those", "projects leave"], s: "the too-dear ones exit", sN: "too-dear ones exit", k: "end" },
                 rest: { t: "The rest: restudy", tN: ["The rest:", "restudy"], s: C.studyDays + " more days", sN: C.studyDays + " more days" },
                 agr: { t: "Agreement and security", tN: ["Agreement", "and security"] },
                 on: { t: "Built, then operating", tN: ["Built, then", "operating"], k: "end" } },
        cols: 3, colsN: 2,
        at: { req: [0, 0], study: [0, 1], up: [1, 1], dear: [1, 2], wd: [2, 3], rest: [2, 1], agr: [0, 3], on: [0, 4] },
        atN: { req: [0, 0], study: [0, 1], up: [1, 1], dear: [1, 2], wd: [1, 3], rest: [1, 4], agr: [0, 4], on: [0, 5] },
        // the too-dear projects leave (their path ends); the others go on to the restudy (narrow: around the leavers' box)
        edges: [["req", "study"], ["study", "up", "yes"], ["study", "agr", "no", { v: true }], ["up", "dear"], ["dear", "wd", "yes", { v: true }], ["dear", "agr", "no"],
                ["dear", "rest", "the rest", { dN: "M330 218 H352 V370 H300 V378", lN: [326, 210] }],
                ["rest", "study", "back to study", { d: "M570 100 V78 H200 V103", l: [385, 72], dN: "M323 402 H360 V80 H130 V111", lN: [240, 75] }], ["agr", "on"]],
        // the wind farm stays: its trace goes from the question straight to the restudy, never through "leave"
        traces: [{ label: "Wind farm", path: ["req", "study", "up", "dear", "rest", "study", "up", "dear", "agr", "on"], text: "In study 1 the placeholder's share was too high and it left; the wind farm stayed and was restudied, and its share rose to " + perkw(Wf.perKW) + ", still under the " + perkw(PJ.W.limitPerKW) + " it would pay." },
                 { label: "Placeholder", path: ["req", "study", "up", "dear", "wd"], text: "Its share, " + perkw(run.rounds[0].rows.filter(function (x) { return x.id === "X"; })[0].perKW) + ", was above the " + perkw(PJ.X.limitPerKW) + " it would pay: it left the queue after study 1." }],
        sel: 0 });
      LX.Flowchart(H("div", { class: "lx-xcard" }, xhost), {
        title: "A large load: its utility's process", lede: "The page's original " + N.campusMW + " MW campus, whatever the slider shows. Steps differ by utility and state; Order 2023's generator rules do not apply.",
        nodes: { lreq: { t: "Request for service", tN: ["Request for", "service"], s: "to the utility", sN: "to the utility" },
                 lfit: { t: "Fits, one line out?", tN: ["Fits, one", "line out?"], k: "q" },
                 lcon: { t: "Service contract", tN: ["Service", "contract"], s: "minimum bill, collateral", sN: "bill, collateral" },
                 lup: { t: "Upgrades and contract", tN: ["Upgrades and", "contract"], s: "the tariff sets who pays", sN: "tariff: who pays" },
                 lstage: { t: "Staged energization", tN: ["Staged", "energization"], s: "part now, the rest later", sN: "part now" },
                 lon: { t: "Full service", tN: ["Full", "service"], k: "end" } },
        cols: 3, colsN: 2,
        at: { lreq: [0, 0], lfit: [0, 1], lcon: [0, 2], lon: [0, 3], lup: [1.5, 1], lstage: [1.5, 2] },
        atN: { lreq: [0, 0], lfit: [0, 1], lcon: [0, 2], lon: [0, 3], lup: [1, 1], lstage: [1, 2] },
        edges: [["lreq", "lfit"], ["lfit", "lcon", "yes"], ["lfit", "lup", "no"], ["lup", "lstage"], ["lcon", "lon"], ["lstage", "lon", null, { v: true }]],
        traces: [{ label: "The " + N.campusMW + " MW campus", path: ["lreq", "lfit", "lup", "lstage", "lon"], text: "With one line out only " + nn.maxNew + " MW fits, so a third line is needed and the large-load tariff sets who pays; " + nn.maxNew + " MW can be served first, the rest after the line." },
                 { label: "A " + small.c + " MW load", path: ["lreq", "lfit", "lcon", "lon"], text: "With one line out, " + small.c + " MW fits within the " + nn.maxNew + " MW the two lines can carry: no upgrade, a contract, then service." }],
        sel: 0 });
      // the ledger with the reader's settings
      var st = S.stagedOn ? T.staged : null, L = staged(I7, S.tau, S.s, S.bridge, st), lc = H("div", { class: "lx-xcard" }, xhost);
      H("h3", { text: "Ledger: who carries the wait" }, H("header", { class: "lx-x-head" }, lc));
      LX.Ledger(lc, { cls: "a6-led", caption: "Your settings: a " + S.tau + "-month wait, tariff: " + SHARE_LABEL[S.s].toLowerCase() + (S.bridge ? ", bridge power" : "") + (st ? ", staged service" : "") + ". CF7's toy, a " + I7.loadMW + " MW load.",
        columns: ["Account", "What the wait costs them", "Present value"], rows: ledgerRows(L).map(function (r) { return { head: r.head, sub: r.sub, cells: [{ text: r.what, cls: "a6-what" }, musd(r.v)] }; }) });
      H("p", { class: "lx-hint", text: LEDGER_NOTE }, lc);
      LX.EvidenceLadder(H("div", { class: "lx-xcard" }, xhost), { title: "Requested is not connected", rungs: D.ladder.rungs, items: D.ladder.items, off: D.ladder.off,
        lede: "A project climbs these rungs. Place each claim on the rung it has reached." });
    }
    buildExplain();

    // demo states (core.js LX.demo): "mid" = the cluster, both studies run; "force" = step 4 with the battery withdrawn;
    // "ready" = step 6 with the readiness rule on; "n1" = step 7 answered at 300 MW; "money" = step 9 with bridge power;
    // "staged" = step 10 with staged service on
    LX.demo(root, function (state) {
      if (state === "mid") { cards.go(2); for (var k = 0; k < 3; k++) { var b = live.querySelector(".a6c-foot .lx-btn"); if (b && !b.hidden) b.click(); } return { view: "the cluster, studied twice" }; }
      if (state === "force") { cards.go(3); hooks.force("B"); return { view: "the battery withdraws" }; }
      if (state === "ready") { cards.go(5); hooks.ready(); return { view: "readiness rule on" }; }
      if (state === "n1") { cards.go(6); hooks.n1(300, false); return { view: "the campus at 300 MW" }; }
      if (state === "money") { cards.go(8); hooks.money.set({ tau: 36, bridge: true }); return { view: "the money, bridge power on" }; }
      if (state === "staged") { cards.go(9); hooks.staged.set({ tau: 36, bridge: false, staged: true }); return { view: "staged service on" }; }
      if (state === "walk") { cards.go(1); hooks.walk.seeAll(); hooks.walk.go(1, 4); return { view: "the data center's path" }; }
      return null;
    }, cards);
    root.lxLesson = { model: model, S: S, cards: cards };
  });
})();
