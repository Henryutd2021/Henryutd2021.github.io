// cf7-cost-of-waiting.js — Case file CF7, "What does waiting for the grid cost, and who pays?" (case form).
// Delay economics only; data centers appear only as loads.
//
// Data: assets/learn/data/cf7-cost-of-waiting.json: the question's dated steps (LX.Timeline: two public events with
// their primary sources, then the study), where the study's result holds (LX.Boundary), the illustrative toy ("idea")
// and the numbers to remember. The research text in the data file is approved excerpt wording
// (E7, with its revisions); this script adds none of its own.
//
// The idea (illustrative; invented round numbers, not the study's inputs, equations or results): a P MW load waits tau
// months for its grid connection. Money is discounted monthly at i = (1 + r)^(1/12) - 1; a cost c every month of the
// wait is worth c x A(tau) today, A(tau) = (1 - (1 + i)^-tau) / i, and a cost C at the end of the wait C x (1 + i)^-tau.
//   developer (private)   lost margin m x P x (1 - b x bridge) a month; carrying cost K x i a month on the committed
//                         capital K; the share s of the utility's costs that a large-load tariff makes it pay; with
//                         bridge power, a premium b x P x 730 h x p_b a month
//   other customers       the rest, (1 - s), of the utility's costs: carrying cost U x i a month on the upgrades U built
//   (ratepayers)          for the load, and the expected stranded cost q(tau) x U at the end of the wait, where
//                         q(tau) = min(cap, 0.5% x tau) is the chance that the load never arrives
//   society               with bridge power, its CO2 above what grid power would have emitted had the load been connected on
//                         time (b x P x 730 h x e a month), valued at a social cost per tonne; no CO2 change while it sits idle
// The three accounts are reported separately and never simply added (the study's rule); the toy shows the total only
// to make the point that a tariff moves cost between accounts without changing it.
// Every number on the page is checked by _tests/learn/test_cf7-cost-of-waiting.js.
(function () {
  "use strict";

  // ---------------------------------------------------------------- pure model (no DOM; exported for Node)
  function monthly(I) { return Math.pow(1 + I.discountPerYear, 1 / 12) - 1; }
  function annuity(I, tau) { var i = monthly(I); return tau > 0 ? (1 - Math.pow(1 + i, -tau)) / i : 0; }
  // the three accounts for a wait of tau months, a tariff share s (0..1) and bridge power on or off; present values in $
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
             dci: tau > 0 ? D / (I.loadMW * tau) : null, co2t: bridgeMWh * I.bridgeExtraCO2PerMWh * tau };
  }
  function musd(v) { var r = Math.round(v / 1e5) / 10; return "$" + r.toFixed(1) + "M"; }
  function kusd(v) { return "$" + (Math.round(v / 100) / 10).toFixed(1) + "k"; }
  function pct(s) { return Math.round(s * 100) + "%"; }
  var SHARE_LABEL = { 0: "Other customers", 0.5: "Half each", 1: "The waiting load" };
  // the no-JS version: the three accounts by delay (no tariff, no bridge), and what a tariff and bridge power change
  function staticIdea(I) {
    var taus = [];
    for (var t = I.delays.step; t <= I.delays.max; t += 2 * I.delays.step) taus.push(t);
    var rows = taus.map(function (t) {
      var L = ledgers(I, t, 0, false);
      return "<tr><td>" + t + " months</td><td class=\"n\">" + musd(L.developer) + "</td><td class=\"n\">" + musd(L.ratepayers) + "</td><td class=\"n\">" + musd(L.society) + "</td><td class=\"n\">" + kusd(L.dci) + "</td></tr>";
    }).join("");
    var t0 = I.delays.start, base = ledgers(I, t0, 0, false), tar = ledgers(I, t0, 1, false), br = ledgers(I, t0, 0, true);
    return "<p class=\"lx-eyebrow\">" + I.title + " (illustrative)</p>" + staticAssume(I) +
      "<table class=\"lx-facts\"><caption class=\"lx-hint\">Present values of a " + I.loadMW + " MW load's wait, other customers paying the utility's costs, no bridge power.</caption>" +
      "<thead><tr><th scope=\"col\">Wait</th><th scope=\"col\">Developer</th><th scope=\"col\">Other customers</th><th scope=\"col\">Society</th><th scope=\"col\">Developer per MW-month</th></tr></thead><tbody>" + rows + "</tbody></table>" +
      "<ul><li>At " + t0 + " months, a tariff that makes the waiting load pay all of the utility's costs moves " + musd(base.ratepayers) + " from other customers to the developer; the total stays " + musd(tar.total) + ".</li>" +
      "<li>Bridge power for half the load saves the developer " + musd(base.developer - br.developer) + "; its CO₂ above grid power for the same energy is " + musd(br.society) + " of damage, for society.</li></ul>";
  }
  var PARTS = [
    { key: "margin", label: "Lost margin", color: "var(--lx-accent)" },
    { key: "capital", label: "Carrying cost of idle capital", color: "var(--lx-tier-5)" },
    { key: "tariff", label: "Utility costs it is charged", color: "var(--lx-tier-4)" },
    { key: "bridge", label: "Bridge power premium", color: "var(--lx-pk)" },
    { key: "carry", label: "Carrying cost of the upgrades", color: "var(--lx-tier-3)" },
    { key: "strand", label: "Expected stranded upgrades", color: "var(--lx-bad)" },
    { key: "co2", label: "CO₂ damage above grid power", color: "var(--lx-warn)" }
  ];
  // the toy's assumptions and one worked month (shown live and in the no-JS version)
  function staticAssume(I) {
    var L = ledgers(I, I.delays.start, 0, false), m = I.marginPerMWMonth * I.loadMW;
    var rows = I.assumptions.map(function (a) { return "<tr><th scope=\"row\">" + a[0] + "</th><td>" + a[1] + "</td></tr>"; }).join("");
    return "<table class=\"lx-facts cf7-assume\"><caption class=\"lx-hint\">The toy's assumptions (illustrative)</caption><tbody>" + rows + "</tbody></table>" +
      "<p class=\"lx-hint\">Worked month: the lost margin is $" + I.marginPerMWMonth.toLocaleString("en-US") + " × " + I.loadMW + " MW = " + musd(m) + " a month. Over " + I.delays.start +
      " months, discounted month by month, that is " + musd(m) + " × " + L.A.toFixed(2) + " = " + musd(L.dev.margin) + " today.</p>" + workedMore(I).map(function (t) { return "<p class=\"lx-hint\">" + t + "</p>"; }).join("");
  }
  // two more worked lines: bridge power's energy in a month, and the developer's cost per MW-month
  function workedMore(I) {
    var L = ledgers(I, I.delays.start, 0, false), half = I.bridgeShare * I.loadMW, mwh = half * I.hoursPerMonth;
    return ["The load runs around the clock, so a month is " + I.hoursPerMonth + " hours: bridge power for " + half + " MW is " + half + " MW × " + I.hoursPerMonth + " h = " + mwh.toLocaleString("en-US") + " MWh a month, " + musd(mwh * I.bridgePremiumPerMWh) + " above grid power.",
      "Per MW-month: " + musd(L.developer) + " ÷ " + I.loadMW + " MW ÷ " + I.delays.start + " months = " + kusd(L.dci) + " of the developer's cost."];
  }
  // each account and its parts, as text (the bars' text version)
  function accountLines(L) {
    var f = function (o) { return PARTS.filter(function (p) { return o[p.key] > 5e3; }).map(function (p) { return (/^CO₂/.test(p.label) ? p.label : p.label.charAt(0).toLowerCase() + p.label.slice(1)) + " " + musd(o[p.key]); }).join(", "); };
    return [["Developer", L.developer, f(L.dev)], ["Other customers", L.ratepayers, f(L.rate)], ["Society", L.society, f(L.soc)]].map(function (r) {
      return r[0] + ": " + musd(r[1]) + (r[2] ? " (" + r[2] + ")" : "");
    });
  }
  // the live status, one idea per line: the three accounts, then what the tariff and bridge power change
  function statusLines(I, tau, s, bridge) {
    if (!tau) return ["No wait, no delay cost in any account. <b>Slide the wait up.</b>"];
    var L = ledgers(I, tau, s, bridge), base = ledgers(I, tau, 0, false), out = [];
    out.push("A " + tau + "-month wait, in present value: developer <b>" + musd(L.developer) + "</b>, other customers <b>" + musd(L.ratepayers) + "</b>, society <b>" + musd(L.society) + "</b>.");
    if (s > 0) out.push("The tariff moves " + musd(s * base.ratepayers) + " from other customers to the developer; it does not shrink the cost.");
    if (bridge) out.push("Bridge power saves the developer " + musd(ledgers(I, tau, s, false).developer - L.developer) + "; its CO₂ above grid power is " + musd(L.society) + " of damage.");
    if (!s && !bridge) out.push("Try the tariff, then bridge power: watch which account each one changes.");
    return out;
  }
  function rich(t) {
    // glossary marks to spans (the attribute is built in pieces so the build's term scanner does not read "$1" as an id)
    return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\[\[([a-z0-9-]+)\|([^\]]+)\]\]/g, function (m, id, w) {
      return '<span class="lx-term" data-term=' + '"' + id + '">' + w + "</span>";
    });
  }
  function staticBoundary(b) {
    var ul = function (a) { return "<ul>" + a.map(function (t) { return "<li>" + rich(t) + "</li>"; }).join("") + "</ul>"; };
    return "<p class=\"lx-eyebrow\">" + rich(b.title) + "</p><dl class=\"lx-ideas\"><dt>It holds when</dt><dd>" + ul(b.holds) + "</dd><dt>It leaves out</dt><dd>" + ul(b.leaves) + "</dd></dl>" +
      "<p class=\"lx-hint\">" + rich(b.source) + "</p>";
  }
  var model = { monthly: monthly, annuity: annuity, ledgers: ledgers, musd: musd, kusd: kusd, pct: pct, SHARE_LABEL: SHARE_LABEL, PARTS: PARTS,
                staticAssume: staticAssume, workedMore: workedMore, accountLines: accountLines, statusLines: statusLines, staticIdea: staticIdea, staticBoundary: staticBoundary };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H, KEY = "cf7_cost_of_waiting";

  LX.mount("cf7", function (live, data) {
    var D = data[KEY];
    LX.Timeline(H("div", { class: "lx-card" }, live), D.timeline);
    var x = document.getElementById("cf7-explain");
    if (x) { x.innerHTML = ""; x.classList.add("is-live"); LX.Boundary(H("div", { class: "lx-xcard" }, x), D.boundary); }
  });

  LX.mount("cf7-idea", function (live, data, root) {
    var D = data[KEY], I = D.idea;
    var S = { tau: I.delays.start, s: I.startShare, bridge: false };
    var saved = LX.store.get("cf7-idea");
    if (saved && saved.tau >= I.delays.min && saved.tau <= I.delays.max && I.tariffShares.indexOf(saved.s) >= 0) { S.tau = saved.tau; S.s = saved.s; S.bridge = !!saved.bridge; }

    var stage = H("div", { class: "lx-stage" }, live);
    H("h3", { text: I.title + " (" + I.loadMW + " MW)" }, H("div", { class: "lx-stage-head" }, stage));
    H("p", { class: "lx-hint", text: I.note }, stage);
    var ctl = H("div", { class: "lx-ctls" }, stage);
    var sl = LX.Slider(H("div", null, ctl), { label: "Months of waiting", color: "var(--lx-accent)", min: I.delays.min, max: I.delays.max, step: I.delays.step, value: S.tau,
      fmt: function (v) { return v + " months"; }, onChange: function (v) { S.tau = v; paint(true); } });
    var tc = H("div", { class: "cf-ctl" }, ctl);
    H("p", { class: "cf-ctl-l", id: "cf7-tariff-l", text: "Large-load tariff: who pays the utility's costs while the load waits?" }, tc);
    var seg = H("div", { class: "lx-seg", role: "group", "aria-labelledby": "cf7-tariff-l" }, tc);
    var sbtn = I.tariffShares.map(function (s) {
      var b = H("button", { type: "button", text: SHARE_LABEL[s] }, seg);
      b.addEventListener("click", function () { S.s = s; paint(true); });
      return b;
    });
    var bc = H("div", { class: "cf-ctl" }, ctl);
    H("p", { class: "cf-ctl-l", text: "While it waits: on-site generators?" }, bc);
    var tg = LX.Toggle(bc, { label: "Bridge power for half the load", on: S.bridge, onChange: function (on) { S.bridge = on; paint(true); } });
    var chips = H("div", { class: "lx-readouts" }, stage);
    var cs = LX.CostSplit(stage, { parts: PARTS, rows: [], fmt: musd, key: true });
    // the bars' text version: each account and its parts, kept up to date (the bars themselves are decorative)
    var alt = H("details", { class: "lx-textalt" }, stage); H("summary", { text: "Text version of the bars" }, alt);
    var altList = H("ul", null, alt);
    // one idea per line, read out together when the state changes
    var status = H("div", { class: "lx-stage-status", "aria-live": "polite", style: "display:grid;gap:4px" }, stage);
    // the numbers behind the accounts, after the interaction (the no-JS version shows them in full)
    var why = H("details", { class: "lx-textalt" }, stage); H("summary", { text: "The toy's assumptions and one worked month" }, why);
    H("div", { html: staticAssume(I) }, why);

    function chip(label, value, cls) { var c = H("div", { class: "lx-readout" + (cls ? " " + cls : "") }, chips); H("span", { text: label }, c); H("b", { text: value }, c); }
    function rowsOf(L) {
      var one = function (key, label, color, values, total) {
        var v = {}; PARTS.forEach(function (p) { v[p.key] = values[p.key] || 0; });
        return { key: key, label: label, color: color, values: v, total: total, aria: label + ": " + musd(total) + (total > 0 ? "; " + LX.CostSplit.text(PARTS, v, musd) : "") };
      };
      return [one("dev", "Developer", "var(--lx-accent)", L.dev, L.developer), one("rate", "Other customers (ratepayers)", "var(--lx-tier-3)", L.rate, L.ratepayers),
              one("soc", "Society", "var(--lx-warn)", L.soc, L.society)];
    }
    function paint(acted) {
      var L = ledgers(I, S.tau, S.s, S.bridge), max = ledgers(I, I.delays.max, 1, false).developer;
      sbtn.forEach(function (b, k) { b.setAttribute("aria-pressed", String(I.tariffShares[k] === S.s)); });
      chips.innerHTML = "";
      chip("Developer", musd(L.developer));
      chip("Other customers", musd(L.ratepayers));
      chip("Society", musd(L.society));
      chip("Developer per MW-month", L.dci == null ? "none" : kusd(L.dci));
      cs.set(rowsOf(L), max * 1.04);
      altList.innerHTML = ""; accountLines(L).forEach(function (t) { H("li", { text: t }, altList); });
      status.innerHTML = statusLines(I, S.tau, S.s, S.bridge).map(function (t) { return "<p>" + t + "</p>"; }).join("");
      if (acted) LX.store.set("cf7-idea", { tau: S.tau, s: S.s, bridge: S.bridge });
    }
    paint(false);
    // demo states (core.js LX.demo): "mid" = the waiting load pays all; "bridge" = bridge power on as well
    LX.demo(root, function (state) {
      if (state !== "mid" && state !== "bridge") return null;
      S.tau = I.delays.start; S.s = 1; S.bridge = state === "bridge"; sl.set(S.tau); tg.set && tg.set(S.bridge); paint(false);
      return { view: state };
    });
  });
})();
