// cf1-supply-chain-microgrids.js — Case file CF1, "Where should a factory go when sun and wind are part of the decision?"
// (case form, wave W3, 2026-11-03).
//
// Data: assets/learn/data/cf1-supply-chain-microgrids.json: the studies' dated steps (LX.Timeline), where the result holds
// (LX.Boundary) and the illustrative toy ("idea"); assets/learn/data/town_year.json for the toy's wind and sun shapes.
// The research text in the data file is approved excerpt wording (reports/learn/excerpts_for_approval.md, E8); this
// script adds none of its own.
//
// The idea (illustrative; invented round numbers in 2025 dollars, not the studies' inputs or results): one factory, two
// candidate sites. Each site has a yearly cost for the site and building and for shipping to the stores, and its own
// wind and sun: SPP's 2025 hourly shapes scaled to the site's capacity factors with LX.townProfile (method "scale").
// The factory draws a flat load. With on-site energy allowed, each site may build whole MW of wind and solar, up to the
// room it has; every hour
//   made_t   = W × wind_t + P × solar_t                MW from the site's own turbines and panels
//   bought_t = max(0, load − made_t)                   MW bought from the grid at the buying price
//   sold_t   = max(0, made_t − load)                   MW sold to the grid at the selling price (0: spilled)
// and a year costs site + shipping + W × wind cost + P × solar cost + price × Σ bought − sale price × Σ sold. Each site
// takes its cheapest (W, P) (ties: fewer MW; none occurs, tested); the cheaper site wins. With nothing to sell the near
// site wins; when spare energy earns enough, the windy site's lower energy bill outweighs its higher site and shipping
// costs. No storage, no outages, one weather year; the grid takes every spare unit at the chosen price, with no
// connection limit or extra charge (the page says so). energy() is a site's energy cost net of sales: on-site plants +
// energy bought − energy sold; the windy site's is lower in every setting with on-site energy (tested).
// Every number on the page is checked by _tests/learn/test_cf1-supply-chain-microgrids.js.
(function () {
  "use strict";

  // ---------------------------------------------------------------- pure model (no DOM; exported for Node)
  // shapes: {siteKey: {wind: [8760 MW per MW], solar: [8760]}} from LX.townProfile (or the test's copy of it)
  function siteYear(I, site, shp, W, P, sell) {
    var bought = 0, sold = 0, made = 0, L = I.loadMW;
    for (var t = 0; t < shp.wind.length; t++) {
      var m = W * shp.wind[t] + P * shp.solar[t]; made += m;
      if (m < L) bought += L - m; else sold += m - L;
    }
    var parts = { site: site.site, shipping: site.shipping, onsite: W * I.windPerMW + P * I.solarPerMW, bought: bought * I.buyPrice, sold: -sold * sell };
    return { W: W, P: P, bought: bought, sold: sold, made: made, parts: parts, total: parts.site + parts.shipping + parts.onsite + parts.bought + parts.sold };
  }
  function energy(x) { return x.parts.onsite + x.parts.bought + x.parts.sold; }
  function bestSite(I, site, shp, onsite, sell) {
    var b = null, R = onsite ? I.roomMW : 0;
    for (var W = 0; W <= R; W++) for (var P = 0; P <= R; P++) {
      var x = siteYear(I, site, shp, W, P, sell);
      if (!b || x.total < b.total - 1e-6) b = x;
    }
    return b;
  }
  // every setting of the controls: {onsite, sell} -> {sites: [best per site], winner}
  function settings(I) {
    var out = [{ key: "none", onsite: false, sell: 0 }];
    I.sell.forEach(function (s) { out.push({ key: "sell" + s, onsite: true, sell: s }); });
    return out;
  }
  function solve(I, shapes) {
    var R = {};
    settings(I).forEach(function (st) {
      var sites = I.sites.map(function (s) { return bestSite(I, s, shapes[s.key], st.onsite, st.sell); });
      var w = sites[0].total <= sites[1].total ? 0 : 1;
      R[st.key] = { st: st, sites: sites, winner: w, gap: Math.abs(sites[0].total - sites[1].total) };
    });
    return R;
  }
  function shapesFrom(I, year, townProfile) {
    var out = {};
    I.sites.forEach(function (s) {
      out[s.key] = { wind: townProfile("wind", 1, { year: year, annualCF: s.windCF }).mw, solar: townProfile("solar", 1, { year: year, annualCF: s.solarCF }).mw };
    });
    return out;
  }
  function usdM(v) { var a = Math.abs(v) / 1e6; return (v < -5e3 ? "−$" : "$") + a.toFixed(2) + "M"; }
  function usdK(v) { return (v < -500 ? "−$" : "$") + Math.round(Math.abs(v) / 1000).toLocaleString("en-US") + "k"; }
  function int(v) { return Math.round(v).toLocaleString("en-US"); }
  function sellLabel(s) { return s ? "$" + s + "/MWh" : "nothing"; }

  // the toy's no-JS version: the sites' assumptions and the winner in every setting
  function staticIdea(I, R) {
    var a = "<table class=\"lx-facts cf1-assume\"><caption class=\"lx-hint\">The toy's two sites (illustrative, 2025 dollars)</caption><thead><tr><th scope=\"col\"></th>" +
      I.sites.map(function (s) { return "<th scope=\"col\">" + s.name + "</th>"; }).join("") + "</tr></thead><tbody>" +
      [["Site and building, a year", function (s) { return usdM(s.site); }], ["Shipping to the stores, a year", function (s) { return usdM(s.shipping); }],
       ["Wind " + rich("[[capacity-factor|capacity factor]]"), function (s) { return Math.round(s.windCF * 100) + "%"; }], ["Solar capacity factor", function (s) { return Math.round(s.solarCF * 100) + "%"; }]]
        .map(function (r) { return "<tr><th scope=\"row\">" + r[0] + "</th>" + I.sites.map(function (s) { return "<td class=\"n\">" + r[1](s) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table>";
    var b = "<p class=\"lx-hint\">Both: a flat " + I.loadMW + " " + rich("[[megawatt|MW]]") + " factory load; grid power bought at $" + I.buyPrice + "/" + rich("[[megawatt-hour|MWh]]") + "; wind $" + int(I.windPerMW) + " and solar $" + int(I.solarPerMW) + " per MW a year; room for up to " + I.roomMW + " MW of each.</p>";
    var rows = settings(I).map(function (st) {
      var r = R[st.key], w = I.sites[r.winner], built = function (i) { return st.onsite ? r.sites[i].W + " MW wind · " + r.sites[i].P + " MW solar" : "–"; };
      return "<tr><th scope=\"row\">" + (st.onsite ? "Spare energy sold for " + sellLabel(st.sell) : "No on-site energy") + "</th><td>" + w.name + ", by " + usdK(r.gap) + " a year</td><td>" + built(0) + "</td><td>" + built(1) + "</td></tr>";
    }).join("");
    return "<p class=\"lx-eyebrow\">" + I.title + " (illustrative)</p>" + a + b +
      "<div class=\"lx-scroll-x\"><table class=\"lx-mini-table cf1-res\"><caption class=\"lx-hint\">Which site wins, and what each builds (the toy, a year)</caption><thead><tr><th scope=\"col\">Setting</th><th scope=\"col\">Cheaper site</th><th scope=\"col\">" + I.sites[0].name + " builds</th><th scope=\"col\">" + I.sites[1].name + " builds</th></tr></thead><tbody>" + rows + "</tbody></table></div>";
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
  // the live status, one idea per line
  function statusLines(I, R, key) {
    var r = R[key], w = I.sites[r.winner], o = I.sites[1 - r.winner], x = r.sites[r.winner], y = r.sites[1 - r.winner];
    if (!r.st.onsite) return ["Grid power only: both sites pay the same energy bill, so <b>" + w.name + "</b> wins on site and shipping costs, by " + usdK(r.gap) + " a year."];
    var one = "<b>" + w.name + "</b> wins by " + usdK(r.gap) + " a year.";
    var two = r.st.sell ? "Spare energy earns " + sellLabel(r.st.sell) + ": " + w.name + " sells " + int(x.sold) + " MWh a year, " + o.name + " " + int(y.sold) + "." :
      "Spare energy earns nothing, so each site builds little more than it can use itself.";
    return [one, two];
  }

  var model = { siteYear: siteYear, energy: energy, bestSite: bestSite, settings: settings, solve: solve, shapesFrom: shapesFrom, staticIdea: staticIdea, staticBoundary: staticBoundary,
                status: statusLines, usdM: usdM, usdK: usdK, int: int, sellLabel: sellLabel };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H, KEY = "cf1_supply_chain_microgrids";

  // the case: the studies in time, and the explain layer's boundary
  LX.mount("cf1", function (live, data) {
    var D = data[KEY];
    LX.Timeline(H("div", { class: "lx-card" }, live), D.timeline);
    var x = document.getElementById("cf1-explain");
    if (x) { x.innerHTML = ""; x.classList.add("is-live"); LX.Boundary(H("div", { class: "lx-xcard" }, x), D.boundary); }
  });

  // the idea: two sites, with and without on-site energy, and what spare energy earns
  LX.mount("cf1-idea", function (live, data, root) {
    var D = data[KEY], I = D.idea, R = solve(I, shapesFrom(I, data.town_year, LX.townProfile));
    var St = { onsite: false, sell: I.sell[0] }, acted = 0;
    var stage = H("div", { class: "lx-stage" }, live);
    H("h3", { text: I.title }, H("div", { class: "lx-stage-head" }, stage));
    H("p", { class: "lx-hint", text: I.note }, stage);
    var ctl = H("div", { class: "lx-ctls" }, stage);
    var tg = LX.Toggle(H("div", { class: "cf-ctl" }, ctl), { label: "Let each site build its own wind and solar", on: St.onsite, onChange: function (on) { St.onsite = on; acted++; paint(true); } });
    var sc = H("div", { class: "cf-ctl" }, ctl);
    H("p", { class: "cf-ctl-l", id: "cf1-sell-l", text: "What spare energy earns from the grid" }, sc);
    var seg = H("div", { class: "lx-seg", role: "group", "aria-labelledby": "cf1-sell-l" }, sc);
    var sb = I.sell.map(function (s) {
      var b = H("button", { type: "button", text: sellLabel(s), "aria-pressed": String(s === St.sell) }, seg);
      b.addEventListener("click", function () { if (!St.onsite) return; St.sell = s; acted++; paint(true); });   // aria-disabled while there is no on-site energy
      return b;
    });
    var tbl = H("div", { class: "lx-scroll-x" }, stage);
    var status = H("div", { class: "lx-stage-status", "aria-live": "polite", style: "display:grid;gap:4px" }, stage);
    var why = H("details", { class: "lx-textalt" }, stage); H("summary", { text: "The toy's assumptions" }, why);
    H("div", { html: staticIdea(I, R).replace(/<div class="lx-scroll-x"><table class="lx-mini-table cf1-res">[\s\S]*$/, "") }, why);
    function key() { return St.onsite ? "sell" + St.sell : "none"; }
    function paint(save) {
      var r = R[key()];
      sb.forEach(function (b, i) { b.setAttribute("aria-pressed", String(I.sell[i] === St.sell)); b.setAttribute("aria-disabled", String(!St.onsite)); });
      var rows = [["Site and building", "site"], ["Shipping to the stores", "shipping"], ["On-site wind and solar", "onsite"], ["Grid power bought", "bought"], ["Spare energy sold", "sold"]];
      tbl.innerHTML = "<table class=\"cf-two cf1-tab\"><thead><tr><th scope=\"col\">A year</th>" + I.sites.map(function (s, i) { return "<th scope=\"col\"" + (i === r.winner ? " class=\"win\"" : "") + ">" + s.name + "</th>"; }).join("") + "</tr></thead><tbody>" +
        (St.onsite ? "<tr><th scope=\"row\">Builds</th>" + r.sites.map(function (x, i) { return "<td data-l=\"" + I.sites[i].name + "\">" + x.W + " MW wind · " + x.P + " MW solar</td>"; }).join("") + "</tr>" : "") +
        rows.filter(function (q) { return St.onsite || (q[1] !== "onsite" && q[1] !== "sold"); }).map(function (q) {
          return "<tr><th scope=\"row\">" + q[0] + "</th>" + r.sites.map(function (x, i) { return "<td class=\"n\" data-l=\"" + I.sites[i].name + "\">" + usdM(x.parts[q[1]]) + "</td>"; }).join("") + "</tr>";
        }).join("") +
        "<tr class=\"tot\"><th scope=\"row\">Total</th>" + r.sites.map(function (x, i) { return "<td class=\"n\" data-l=\"" + I.sites[i].name + "\"><b>" + usdM(x.total) + "</b>" + (i === r.winner ? " · cheaper" : "") + "</td>"; }).join("") + "</tr></tbody></table>";
      status.innerHTML = statusLines(I, R, key()).map(function (t) { return "<p>" + t + "</p>"; }).join("");
      if (save) LX.store.set("cf1-idea", { onsite: St.onsite, sell: St.sell });
    }
    var saved = LX.store.get("cf1-idea");
    if (saved && typeof saved.onsite === "boolean" && I.sell.indexOf(saved.sell) >= 0) { St.onsite = saved.onsite; St.sell = saved.sell; tg.set(St.onsite); }
    paint(false);
    // demo states (core.js LX.demo): "mid" = on-site energy with nothing to sell; "sell" = the highest selling price
    LX.demo(root, function (state) {
      if (state === "mid") { St.onsite = true; St.sell = I.sell[0]; tg.set(true); paint(false); return { view: "on-site energy, nothing sold" }; }
      if (state === "sell") { St.onsite = true; St.sell = I.sell[I.sell.length - 1]; tg.set(true); paint(false); return { view: "on-site energy, sold at the highest price" }; }
      return null;
    });
    root.lxLesson = { model: model, R: R };
  });
})();
