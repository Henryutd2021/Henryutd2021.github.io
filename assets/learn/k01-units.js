// k01-units.js — Toolbox K1, "Units and orders of magnitude" (step cards).
//
// Just-in-time math for lesson 1 (power against energy, kWh), lesson 5 (MW held for the hours of a year) and lesson 7
// ($ per kW against $ per MWh). Six step cards, an explain layer and a practice drill.
//
// Data (read through data-src, so the numbers stay in step with the lessons that use them):
//   assets/learn/data/town.json, town_year.json  Prairie Town's day, 3 September 2025: the real SPP shape (EIA-930) cut
//                                               and scaled exactly as lesson 0's prepare() does (the test checks it), so
//                                               the day's demand adds up to 6,957 MWh, as in K7; busiest hour of 2025 =
//                                               450 MW (the town's scale, illustrative); gas running cost $40/MWh
//                                               (illustrative, as in K7)
//   assets/learn/data/01-power-energy.json      lesson 1's sourced anchors: a phone charge (EPA), an average U.S. home's
//                                               year (EIA, 2022 data), the U.S. year 2025 (EIA)
//   assets/learn/data/town_days.json            `stats`: the Southwest Power Pool's 2025 demand, 298.6 TWh (EIA-930)
//
// Model (closed form):
//   prefixes        k = 10^3, M = 10^6, G = 10^9, T = 10^12 (SI): each rung of the ladder is a factor of 1,000
//   energy          MWh = MW x h; one row per hour, so the day's MWh = the sum of its 24 hourly MW values
//   bounds          lowest hour x 24 h <= the day's MWh <= highest hour x 24 h
//   scientific      x = a x 10^n with 1 <= a < 10, n = floor(log10 x)
//   ratio           (a1 x 10^n1) / (a2 x 10^n2) = (a1 / a2) x 10^(n1 - n2); "powers of ten apart" = round(log10 ratio)
// Every number the page states comes from this model or the data files; _tests/learn/test_k01-units.js checks them
// against lesson 0's and lesson 1's models and against the page (it also writes the no-JS table: --write).
// Shared pieces: the number boxes are LX.NumAnswer (its parser is parseNum here) and the practice drill is LX.Drill
// (rng and the seeded series), components/numanswer.js and drill.js.
(function () {
  "use strict";
  var NA = (typeof window !== "undefined" && window.LX && window.LX.NumAnswer) || require("./components/numanswer.js");
  var DR = (typeof window !== "undefined" && window.LX && window.LX.Drill) || require("./components/drill.js");

  // ---------------------------------------------------------------- pure model (no DOM; exported for Node)
  var PREFIX = [{ p: "", name: "", exp: 0 }, { p: "k", name: "kilo", exp: 3 }, { p: "M", name: "mega", exp: 6 }, { p: "G", name: "giga", exp: 9 }, { p: "T", name: "tera", exp: 12 }];
  var SUP = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "-": "⁻" };
  function sup(n) { return String(n).split("").map(function (c) { return SUP[c]; }).join(""); }
  function num(v, d) { return v.toLocaleString("en-US", { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
  function plain(v) {   // a number as people write it: commas, no trailing zeros, up to 9 decimals
    var s = (+v.toPrecision(12)).toLocaleString("en-US", { maximumFractionDigits: 9 });
    return s;
  }
  function expOf(x) { var n = Math.floor(Math.log10(x)); if (x / Math.pow(10, n) >= 10 - 1e-12) n++; if (x / Math.pow(10, n) < 1 - 1e-12) n--; return n; }
  function mant(x) { return x / Math.pow(10, expOf(x)); }
  function sig(v, d) { return String(+v.toPrecision(d)); }
  function sci(x, d) { return sig(mant(x), d || 3) + " × 10" + sup(expOf(x)); }
  // "=" when the shown form is exact, "≈" when it is rounded (the page never puts "=" across a rounding)
  function isExact(shown, x) { return Math.abs(shown - x) <= Math.abs(x) * 1e-12; }
  function eqSci(x, d) { return (isExact(+sig(mant(x), d || 3) * Math.pow(10, expOf(x)), x) ? "= " : "≈ ") + sci(x, d); }
  function eqNum(x, d) { var t = num(x, d); return (isExact(+t.replace(/,/g, ""), x) ? "= " : "≈ ") + t; }
  function convert(v, fromExp, toExp) { return +(v * Math.pow(10, fromExp - toExp)).toPrecision(12); }
  function powersApart(a, b) { return Math.round(Math.log10(Math.max(a, b) / Math.min(a, b))); }
  function ratio(a, b) { return Math.max(a, b) / Math.min(a, b); }

  // the real day, scaled as in lesson 0 (the same cut and rounding as lesson 0's prepare() and K4's townDay)
  function townDay(town, year, key) {
    var sc = town.scenarios[key || "lesson0"], f = town.fleet;
    var t0 = Date.parse(year.start_utc + "Z"), d0 = Date.parse(sc.date + "T00:00:00Z");
    var i = Math.round((d0 - t0) / 3600000) + 1 - (sc.utcOffsetHours || 0);
    var cut = function (a) { return a.slice(i, i + 24); };
    var wind = cut(year.wind).map(function (v) { return Math.round(v / 1000 * f.wind.mw); });
    var solar = cut(year.solar).map(function (v) { return Math.round(v / 1000 * f.solar.mw); });
    var raw = cut(year.demand).map(function (v) { return v / 1000 * sc.demandPeakMW; });
    var need = raw.map(function (v, t) { return Math.round((v - f.nuclear.mw - wind[t] - solar[t]) / sc.step) * sc.step; });
    var demand = need.map(function (n, t) { return n + f.nuclear.mw + wind[t] + solar[t]; });
    return { date: sc.date, dateLabel: sc.dateLabel, fleet: f, peakMW: sc.demandPeakMW, demand: demand, need: need };
  }
  var sum = function (a) { return a.reduce(function (x, y) { return x + y; }, 0); };
  function hh(t) { return (t < 10 ? "0" : "") + t + ":00"; }

  // the page's story numbers
  function story(town, year, days, D1) {
    var D = townDay(town, year), A = D1.anchors, st = days.stats, s = { D: D };
    s.peak = D.peakMW; s.peakKW = s.peak * 1000; s.peakW = s.peak * 1e6; s.peakGW = s.peak / 1000; s.peakTW = s.peak / 1e6;
    s.dayMWh = sum(D.demand); s.dayGWh = s.dayMWh / 1000; s.dayKWh = s.dayMWh * 1000;
    s.hiMW = Math.max.apply(null, D.demand); s.loMW = Math.min.apply(null, D.demand);
    s.hiAt = D.demand.indexOf(s.hiMW); s.loAt = D.demand.indexOf(s.loMW);
    s.hiBound = s.hiMW * 24; s.loBound = s.loMW * 24; s.avgMW = s.dayMWh / 24;
    // a flat-price product, not a schedule: every MWh of the day's gas need priced at the combined-cycle plant's $40/MWh
    s.gasMWh = sum(D.need); s.gasCost = D.fleet.cc.cost; s.gasDollars = s.gasMWh * s.gasCost;
    s.h19 = 19; s.need19 = D.need[19]; s.ramp = D.fleet.cc.ramp; s.pkCost = D.fleet.peaker.cost;
    // step 4: the worked example of scientific notation is the town's day in Wh
    s.dayWh = s.dayMWh * 1e6;
    s.items = [
      { id: "phone", label: "Charging a smartphone once", short: "Phone charge", given: num(A.phone_charge.value, 3) + " kWh", wh: A.phone_charge.value * 1000, src: "EPA", url: A.phone_charge.url, asOf: "checked 2 Nov 2026" },
      { id: "home", label: "An average U.S. home's year", short: "Home's year", given: num(A.home_year.value) + " kWh", wh: A.home_year.value * 1000, src: "EIA", url: A.home_year.url, asOf: "2022 data" },
      { id: "town", label: "Prairie Town's day, 3 September 2025", short: "Town's day", given: num(s.dayMWh) + " MWh", wh: s.dayMWh * 1e6, src: "this page", url: null, asOf: "EIA-930 shape, scaled" },
      { id: "spp", label: "The Southwest Power Pool's year, 2025", short: "SPP's year", given: st.annual_demand_TWh + " TWh", wh: st.annual_demand_TWh * 1e12, src: "EIA-930", url: "https://www.eia.gov/electricity/gridmonitor/", asOf: "2025 data" },
      { id: "us", label: "The United States' year, 2025", short: "U.S. year", given: "about " + num(A.us_year.value / 1e9) + " TWh", wh: A.us_year.value * 1000, src: "EIA", url: A.us_year.url, asOf: "2025 data" }];
    s.items.forEach(function (it) { it.exp = expOf(it.wh); it.mant = mant(it.wh); it.sci = sci(it.wh) + " Wh"; });
    s.byId = {}; s.items.forEach(function (it) { s.byId[it.id] = it; });
    var P = s.byId.phone, U = s.byId.us;
    s.span = powersApart(P.wh, U.wh); s.spanRatio = ratio(P.wh, U.wh);
    // the step-5 claims: within the bounds, or off by a power of ten
    s.claims = [
      { key: "giga", text: num(s.dayMWh) + " GWh", mwh: s.dayMWh * 1000 },
      { key: "small", text: "about " + (Math.round(s.dayGWh) * 10) + " MWh", mwh: Math.round(s.dayGWh) * 10 },
      { key: "right", text: "about " + Math.round(s.dayGWh) + " GWh", mwh: Math.round(s.dayGWh) * 1000 }];
    s.claims.forEach(function (c) { c.ok = c.mwh >= s.loBound && c.mwh <= s.hiBound; c.off = c.ok ? 0 : Math.round(Math.log10(c.mwh / s.dayMWh)); });
    // the quiz: SPP's year in GWh; powers of ten from a home's year to SPP's year
    s.sppGWh = st.annual_demand_TWh * 1000; s.homeToSpp = powersApart(s.byId.home.wh, s.byId.spp.wh);
    s.homeToSppRatio = ratio(s.byId.home.wh, s.byId.spp.wh);
    return s;
  }

  // one pair of items: the ratio worked as (a1 / a2) x 10^(n1 - n2). The ratio is then a x 10^k (1 <= a < 10); its
  // nearest power of ten is 10^k when a < 3.16 (half a power of ten: sqrt 10) and 10^(k+1) from 3.16 up, which is
  // round(log10 ratio), the same rule as powersApart
  var HALF = Math.sqrt(10);
  function pairText(s, a, b) {
    var A = s.byId[a], B = s.byId[b]; if (!A || !B || a === b) return null;
    var big = A.wh >= B.wh ? A : B, small = big === A ? B : A, r = big.wh / small.wh, m = big.mant / small.mant, dn = big.exp - small.exp;
    return { big: big, small: small, ratio: r, mratio: m, dexp: dn, apart: powersApart(big.wh, small.wh),
             rexp: expOf(r), rmant: mant(r), up: mant(r) >= HALF,
             ratioText: r >= 1e6 ? sci(r, 2) : num(r) };
  }
  // the reader-facing reason for the nearest power, e.g. "6.45 is above 3.16 (half a power of ten), so 10³"
  function nearestWhy(p) {
    return sig(p.rmant, p.ratio >= 1e6 ? 2 : 3) + (p.up ? " is above" : " is below") + " 3.16, half a power of ten, so the nearest power is 10" + sup(p.apart) + ".";
  }

  // ---------------------------------------------------------------- the no-JS table (written into the page by the test)
  function staticTable(s) {
    var rows = s.items.map(function (it) {
      return "<tr><td>" + it.label + "</td><td>" + it.given + '</td><td class="k1-wh">' + plain(it.wh) + "</td><td>" + it.sci + "</td></tr>";
    }).join("\n");
    return '<table class="k1-static" aria-label="Five amounts of energy in watt-hours and in scientific notation">\n' +
      '<thead><tr><th scope="col">Amount of energy</th><th scope="col">As published</th><th scope="col" class="k1-wh">In Wh</th><th scope="col">Scientific notation (3 figures)</th></tr></thead>\n<tbody>\n' + rows + "\n</tbody></table>";
  }

  // ---------------------------------------------------------------- practice drill items (seeded by LX.Drill, so tests can replay them)
  var KINDS = ["prefix", "energy", "unit", "sci", "average", "apart"];
  var UNITS = [   // [expression, unit left, why]
    ["MW × h", "MWh", "power times time: the units multiply into MWh."], ["MWh ÷ h", "MW", "h on top of MWh cancels the h underneath."],
    ["$/MWh × MWh", "$", "MWh on top cancels the MWh underneath."], ["$ ÷ MWh", "$/MWh", "nothing cancels: dollars per MWh, a price."],
    ["kWh ÷ kW", "h", "kW on top of kWh cancels the kW underneath."], ["MWh ÷ MW", "h", "MW on top of MWh cancels the MW underneath."],
    ["kW × h", "kWh", "power times time: the units multiply into kWh."], ["GWh ÷ h", "GW", "h on top of GWh cancels the h underneath."],
    ["$/kW × kW", "$", "kW on top cancels the kW underneath."]];
  var POOL = ["MW", "MWh", "$", "$/MWh", "h", "kWh", "GW", "kW"];
  function drillItem(D, k, r) {
    var kind = KINDS[k % KINDS.length], pick = function (a) { return a[Math.floor(r() * a.length)]; };
    if (kind === "prefix") {
      var energy = r() < 0.5, base = energy ? "Wh" : "W", i1 = 1 + Math.floor(r() * 4), step = pick([-2, -1, 1, 2]), i2 = i1 + step;
      if (i2 < 1 || i2 > 4) i2 = i1 - step;
      var v = pick([2.5, 45, 120, 450, 760, 3600, 0.8, 15]), ans = convert(v, PREFIX[i1].exp, PREFIX[i2].exp);
      if (ans < 1e-4 || ans > 1e8) { i2 = i1 + (ans < 1e-4 ? -1 : 1); if (i2 < 1 || i2 > 4) i2 = i1 + (ans < 1e-4 ? 1 : -1); ans = convert(v, PREFIX[i1].exp, PREFIX[i2].exp); }   // keep answers between 0.0001 and 10^8
      var u1 = PREFIX[i1].p + base, u2 = PREFIX[i2].p + base, n = Math.abs(i1 - i2);
      return { kind: kind, q: plain(v) + " " + u1 + " = ? " + u2, answer: ans, unit: u2,
               why: (i1 > i2 ? "A smaller unit, a bigger number: × " : "A bigger unit, a smaller number: ÷ ") + (n === 1 ? "1,000" : "1,000,000") + " gives " + plain(ans) + " " + u2 + "." };
    }
    if (kind === "energy") {
      if (r() < 0.5) {
        var t = Math.floor(r() * 24), mw = D.demand[t];
        return { kind: kind, q: "At " + hh(t) + " on " + D.dateLabel + ", Prairie Town drew " + mw + " MW for the whole hour. Energy in that hour, in kWh?", answer: mw * 1000, unit: "kWh",
                 why: mw + " MW × 1 h = " + mw + " MWh = " + num(mw * 1000) + " kWh." };
      }
      var w = pick([500, 1000, 1500, 2000, 3000]), mins = pick([15, 30, 45, 60, 90, 120]), kwh = w / 1000 * mins / 60;
      return { kind: kind, q: "A " + num(w) + " W heater runs for " + mins + " minutes. Energy, in kWh?", answer: +kwh.toPrecision(12), unit: "kWh",
               why: num(w) + " W = " + plain(w / 1000) + " kW; " + mins + " minutes = " + plain(mins / 60) + " h; " + plain(w / 1000) + " × " + plain(mins / 60) + " = " + plain(kwh) + " kWh." };
    }
    if (kind === "unit") {
      var u = pick(UNITS), others = POOL.filter(function (x) { return x !== u[1]; }), ch = [u[1]];
      while (ch.length < 4) { var o = pick(others); if (ch.indexOf(o) < 0) ch.push(o); }
      var order = ch.map(function (c) { return [r(), c]; }).sort(function (a, b) { return a[0] - b[0]; }).map(function (p) { return p[1]; });
      return { kind: kind, q: "What unit is left after " + u[0] + "?", choices: order, answer: order.indexOf(u[1]),
               why: u[0] + " = " + u[1] + ": " + u[2] };
    }
    if (kind === "sci") {
      var a = pick([1.2, 2.5, 3.6, 4.2, 6.96, 8.76, 1.08, 2.99]), e = 2 + Math.floor(r() * 14), x = a * Math.pow(10, e);
      return { kind: kind, q: "Written as a × 10ⁿ (a at least 1 and less than 10), " + plain(x) + " Wh has n = ?", answer: e,
               why: plain(x) + " = " + sig(a, 3) + " × 10" + sup(e) + ": move the decimal point " + e + " places." };
    }
    if (kind === "average") {
      var len = 3 + Math.floor(r() * 4), t0 = Math.floor(r() * (24 - len)), e2 = sum(D.demand.slice(t0, t0 + len)), avg = e2 / len;
      return { kind: kind, q: "From " + hh(t0) + " to " + hh(t0 + len) + " on " + D.dateLabel + ", Prairie Town used " + num(e2) + " MWh. Its average power over those " + len + " hours, to the nearest MW?",
               answer: Math.round(avg), tol: 0.5, unit: "MW", why: num(e2) + " MWh ÷ " + len + " h " + eqNum(avg, 1) + " MW: MWh ÷ h leaves MW." };
    }
    // apart: two numbers in scientific notation; how many powers of ten apart (mantissas close, so the count is clear)
    var m1 = pick([1.5, 2, 3, 4.5, 6]), m2 = +(m1 * pick([0.8, 1, 1.25])).toPrecision(3), n1 = 1 + Math.floor(r() * 7), gap = 2 + Math.floor(r() * 9), n2 = n1 + gap;
    return { kind: kind, q: "How many powers of ten apart are " + sig(m1, 3) + " × 10" + sup(n1) + " Wh and " + sig(m2, 3) + " × 10" + sup(n2) + " Wh?", answer: gap,
             why: "The exponents differ by " + n2 + " − " + n1 + " = " + gap + (m1 === m2 ? ", and the leading numbers are equal: " : ", and " + sig(m2, 3) + " ÷ " + sig(m1, 3) + " is close to 1: about ") + "10" + sup(gap) + " times." };
  }
  function drill(D, seed, n) { return DR.series(function (k, r) { return drillItem(D, k, r); }, seed, n); }
  function close(v, ans, tol) { if (v == null) return false; var t = tol != null ? tol + 1e-12 : Math.abs(ans) * 1e-9 + 1e-15; return Math.abs(v - ans) <= t; }
  var parseNum = NA.parse;   // "450,000", "0.45", "6.96e9", "6.96 × 10^9", "6.96x10^9", "−3" (LX.NumAnswer's parser)

  var model = { PREFIX: PREFIX, sup: sup, num: num, plain: plain, expOf: expOf, mant: mant, sci: sci, sig: sig, convert: convert,
                isExact: isExact, eqSci: eqSci, eqNum: eqNum, nearestWhy: nearestWhy, HALF: HALF,
                powersApart: powersApart, ratio: ratio, townDay: townDay, story: story, pairText: pairText, staticTable: staticTable,
                drill: drill, drillItem: drillItem, rng: DR.rng, close: close, parseNum: parseNum, KINDS: KINDS, UNITS: UNITS, hh: hh, sum: sum };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;

  // ================================================================ view
  var LX = window.LX, H = LX.H;

  // the page's number boxes (LX.NumAnswer), wide enough for answers such as 450,000 or 6.96e9
  var BOX = { width: "8.5em", widthPhone: "6.5em" };
  function numBox(host, o) { return LX.NumAnswer(host, Object.assign({}, BOX, o)); }
  function textAlt(host, title, items) {
    var d = H("details", { class: "lx-textalt" }, host); H("summary", { text: title || "Text version" }, d);
    var ul = H("ul", null, d); (items || []).forEach(function (t) { H("li", { html: LX.rich(t) }, ul); });
    return { el: d, set: function (list) { ul.innerHTML = ""; list.forEach(function (t) { H("li", { html: LX.rich(t) }, ul); }); } };
  }
  function seg(host, labels, onPick, aria) {
    var g = H("div", { class: "lx-seg", role: "group", "aria-label": aria || "Choose" }, host), bs = [];
    labels.forEach(function (l, i) {
      var b = H("button", { type: "button", "aria-pressed": "false", text: l }, g);
      b.addEventListener("click", function () { bs.forEach(function (x, j) { x.setAttribute("aria-pressed", j === i ? "true" : "false"); }); onPick(i); });
      bs.push(b);
    });
    return { el: g, buttons: bs };
  }

  function view(live, data, root) {
    var s = story(data.town, data.town_year, data.town_days, data["01_power_energy"]), D = s.D, steps = [], autos = {};

    // ---- step 1: the prefix ladder
    steps.push({
      text: "Each prefix is 1,000 times the one below: kilo (k), mega (M), giga (G), tera (T). Write Prairie Town's busiest hour of 2025, " + s.peak + " [[megawatt|MW]], in [[kilowatt|kW]] and in [[gigawatt|GW]].",
      build: function (act, api) {
        var lad = H("ol", { class: "k1-ladder", "aria-label": "The prefix ladder for " + s.peak + " MW" }, act), cells = {};
        var vals = [s.peakW, s.peakKW, s.peak, s.peakGW, s.peakTW];
        PREFIX.slice().reverse().forEach(function (P, j) {
          var i = PREFIX.length - 1 - j, li = H("li", { class: "k1-rung" + (i === 2 ? " given" : "") }, lad);
          H("span", { class: "k1-pfx", text: P.p + "W" }, li);
          H("span", { class: "k1-pname", text: (P.name || "watt") + (P.name ? " · 10" + sup(P.exp) : " · 1") }, li);
          cells[i] = H("b", { class: "k1-val", text: i === 2 || i === 0 || i === 4 ? plain(vals[i]) + " " + P.p + "W" : "?" }, li);
        });
        var got = {}, fb;
        function check(i, v, inp) {
          var right = close(v, vals[i]);
          got[i] = right; inp.classList.toggle("right", right); inp.classList.toggle("wrong", !right);
          if (right) cells[i].textContent = plain(vals[i]) + " " + PREFIX[i].p + "W";
          fb.textContent = right ? plain(s.peak) + " MW = " + plain(vals[i]) + " " + PREFIX[i].p + "W." : (i === 1 ? "kW is the smaller unit, so the number grows: × 1,000." : "GW is the bigger unit, so the number shrinks: ÷ 1,000.");
          if (got[1] && got[3]) { api.done(); api.saw("A step down the ladder multiplies by 1,000; a step up divides. " + s.peak + " MW = " + num(s.peakKW) + " kW = " + plain(s.peakGW) + " GW: the same power, three ways."); }
        }
        var a = numBox(act, { label: s.peak + " MW in kW:", unit: "kW", onCheck: function (v, inp) { check(1, v, inp); } });
        var b = numBox(act, { label: s.peak + " MW in GW:", unit: "GW", onCheck: function (v, inp) { check(3, v, inp); } });
        fb = H("p", { class: "k1-test", "aria-live": "polite" }, act);
        autos[0] = function () { a.input.value = String(s.peakKW); a.go(); b.input.value = String(s.peakGW); b.go(); };
      }
    });

    // ---- step 2: power x time = energy
    steps.push({
      text: "[[energy|Energy]] is power held over time: 1 MW for one hour is 1 [[megawatt-hour|MWh]]. Slide through " + D.dateLabel + " to add each hour's MW × 1 h, then write the day's total in GWh.",
      build: function (act, api) {
        var P = LX.Plot(act, { text: "Text version of the chart", box: true });
        var sl = LX.Slider(act, { label: "Hours added", color: "var(--lx-tier-2)", min: 0, max: 24, step: 1, value: 0, fmt: function (v) { return v + (v === 1 ? " hour" : " hours"); }, onChange: draw });
        var ro = H("p", { class: "k1-test", "aria-live": "polite" }, act);
        function draw() {
          var h = sl.val(), so = sum(D.demand.slice(0, h)), bars = D.demand.map(function (v, t) { return { x0: t + 0.1, x1: t + 0.9, y0: 0, y1: v, color: t < h ? "var(--lx-tier-2)" : "var(--lx-ink-3)", op: t < h ? 1 : 0.25 }; });
          ro.innerHTML = h === 0 ? "Slide to add the hours." : "First " + h + (h === 1 ? " hour" : " hours") + ": <b>" + num(so) + " MWh</b>" + (h === 24 ? ", the whole day." : ".");
          P.render({ x: { min: 0, max: 24, ticks: [[0, "00:00"], [6, "06:00"], [12, "12:00"], [18, "18:00"], [24, "24:00"]], ticksN: [[0, "0"], [6, "6"], [12, "12"], [18, "18"], [24, "24 h"]] },
            y: { min: 0, max: 400, step: 100, unit: "MW" }, height: 210, heightN: 180, bars: bars, legend: false,
            aria: "Prairie Town's demand each hour of " + D.dateLabel + ", from " + s.loMW + " MW to " + s.hiMW + " MW; the first " + h + " hours add up to " + num(so) + " MWh.",
            text: { head: ["Hour", "MW", "MWh in that hour"], rows: D.demand.map(function (v, t) { return [hh(t), String(v), String(v)]; }), note: "All 24 hours: " + num(s.dayMWh) + " MWh." } });
        }
        draw();
        var tries = 0;
        var n = numBox(act, { label: "Day's energy in GWh:", unit: "GWh", onCheck: function (v) {
          tries++;
          if (close(v, s.dayGWh, 0.006)) { LX.store.set("k1-day", { gwh: s.dayGWh }); api.done(); api.saw(num(s.dayMWh) + " MWh ÷ 1,000 = " + plain(s.dayGWh) + " GWh. One hour at 1 MW is 1 MWh, so a day of hourly MW adds straight up to MWh."); }
          else api.saw(tries < 2 ? "Not yet. Add all 24 hours (slide to the end), then step up one rung: ÷ 1,000." : num(s.dayMWh) + " MWh ÷ 1,000 = " + plain(s.dayGWh) + " GWh (" + sig(s.dayGWh, 3) + " is fine).", true);
        } });
        autos[1] = function () { sl.set(24, true); n.input.value = sig(s.dayGWh, 3); n.go(); };
      }
    });

    // ---- step 3: units cancel like numbers
    var CHAINS = [
      { eq: s.need19 + " MW × 1 h", note: "gas at " + hh(s.h19) + ", for one hour", ans: "MWh", res: s.need19 + " MWh" },
      { eq: num(s.gasMWh) + " MWh × $" + s.gasCost + "/MWh", note: "the day's gas need, all at one flat price", ans: "$", res: "$" + num(s.gasDollars) },
      { eq: num(s.dayMWh) + " MWh ÷ 24 h", note: "the day's energy over its hours", ans: "MW", res: "about " + Math.round(s.avgMW) + " MW" }];
    var CH = ["MW", "MWh", "$", "h"];
    steps.push({
      text: "Units multiply and cancel like numbers: MWh on top cancels MWh underneath. Pick the unit each result is left with.",
      build: function (act, api) {
        var right = {}, list = H("div", { class: "k1-rows" }, act);
        CHAINS.forEach(function (c, i) {
          var row = H("div", { class: "k1-row" }, list);
          H("p", { html: "<b>" + LX.esc(c.eq) + "</b> <span>" + LX.esc(c.note) + "</span>" }, row);
          var mark = H("span", { class: "k1-mark", "aria-live": "polite" }, row);
          seg(row, CH, function (k) {
            right[i] = CH[k] === c.ans; mark.textContent = right[i] ? "Right: " + c.res : "Not quite"; mark.className = "k1-mark " + (right[i] ? "good" : "bad");
            if (CHAINS.every(function (q, j) { return right[j]; })) { api.done(); api.saw("MW × h makes MWh; MWh cancels MWh; h cancels h. " + num(s.dayMWh) + " MWh ÷ 24 h " + eqNum(s.avgMW, 1) + " MW, the day's [[average-power|average power]]."); }
          }, "Unit of " + c.eq);
        });
        autos[2] = function () { list.querySelectorAll(".k1-row").forEach(function (row, i) { row.querySelectorAll(".lx-seg button")[CH.indexOf(CHAINS[i].ans)].click(); }); };
      }
    });

    // ---- step 4: scientific notation, worked before it is used (1,000 = 10^3; 19 Wh; then the reader's own: the town's day)
    var WORKED = [
      { x: 1000, text: "1,000 Wh = 1 × 10³ Wh", note: "the point moves 3 places" },
      { x: s.byId.phone.wh, text: plain(s.byId.phone.wh) + " Wh = " + sci(s.byId.phone.wh) + " Wh", note: "a phone charge: 1 place" }];
    steps.push({
      text: "[[scientific-notation|Scientific notation]] writes a number as a × 10ⁿ, with a at least 1 and less than 10: n counts the places the decimal point moves. Find n for the town's day in Wh.",
      build: function (act, api) {
        var list = H("div", { class: "k1-rows" }, act);
        WORKED.forEach(function (w) { var row = H("div", { class: "k1-row" }, list); H("p", { html: "<b>" + LX.esc(w.text) + "</b> <span>" + LX.esc(w.note) + "</span>" }, row); });
        var row = H("div", { class: "k1-row" }, list);
        H("p", { html: "<b>" + plain(s.dayWh) + " Wh ≈ " + sig(mant(s.dayWh), 3) + " × 10ⁿ Wh</b> <span>the town's day: n = ?</span>" }, row);
        var tries = 0;
        var n = numBox(act, { label: "Exponent n for the day in Wh:", onCheck: function (v) {
          tries++;
          if (v === s.byId.town.exp) { api.done(); api.saw(plain(s.dayWh) + " Wh " + eqSci(s.dayWh) + " Wh: the point moves " + s.byId.town.exp + " places. The leading number is rounded to 3 figures, so the sign is ≈."); }
          else api.saw(tries < 2 ? "Not yet. Count the digits after the first one, 6: each is one place." : "n = " + s.byId.town.exp + ": " + plain(s.dayWh) + " has " + s.byId.town.exp + " digits after its first.", true);
        } });
        autos[3] = function () { n.input.value = String(s.byId.town.exp); n.go(); };
      }
    });

    // ---- step 5: powers of ten apart, on a log scale
    steps.push({
      text: "On a [[log-scale|log scale]] each power of ten is one equal step, so a phone and a nation fit on one chart. How many powers of ten from a phone charge to the U.S. year?",
      build: function (act, api) {
        var rows = H("div", { class: "k1-mag" }, act), bars = {};
        s.items.forEach(function (it) {
          var rw = H("div", { class: "k1-magrow" }, rows);
          H("span", { class: "k1-maglab", text: it.short }, rw);
          var tr = H("span", { class: "k1-bar", "aria-hidden": "true" }, rw), fill = H("i", { style: "width:" + (it.exp + Math.log10(it.mant)) / 16 * 100 + "%" }, tr);
          H("b", { text: sci(it.wh) }, rw); bars[it.id] = { rw: rw, fill: fill };
        });
        H("p", { class: "k1-scale", text: "All in Wh, leading numbers to 3 figures; ratios use the unrounded amounts. Bar length: the power of ten, from 10⁰ = 1 Wh to 10¹⁶ Wh." }, act);
        var pk = H("div", { class: "k1-pick" }, act), selA = sel("Compare", "home"), selB = sel("with", "town");
        function sel(lab, v0) {
          var id = LX.uid("sel"), w = H("span", { class: "k1-selw" }, pk); H("label", { for: id, text: lab }, w);
          var e = H("select", { id: id, class: "k1-sel" }, w);
          s.items.forEach(function (it) { var o = H("option", { value: it.id, text: it.short }, e); if (it.id === v0) o.selected = true; });
          e.addEventListener("change", function () { pair(true); }); return e;
        }
        var out = H("p", { class: "k1-test", "aria-live": "polite" }, act);
        function pair(user) {
          var p = pairText(s, selA.value, selB.value);
          Object.keys(bars).forEach(function (k) { bars[k].rw.classList.toggle("on", k === selA.value || k === selB.value); });
          if (!p) { out.textContent = "Pick two different amounts."; return; }
          if (user) LX.store.set("k1-pair", { a: p.big.id, b: p.small.id });
          out.innerHTML = LX.esc(p.big.short) + " ÷ " + LX.esc(p.small.short) + " ≈ (" + sig(p.big.mant, 3) + " ÷ " + sig(p.small.mant, 3) + ") × 10<sup>" + p.big.exp + " − " + p.small.exp + "</sup> ≈ <b>" + p.ratioText + "</b>. " + LX.esc(nearestWhy(p));
        }
        pair();
        var tries = 0, PU = pairText(s, "phone", "us");
        var n = numBox(act, { label: "Powers of ten, phone to U.S. year:", onCheck: function (v) {
          tries++;
          if (v === s.span) { api.done(); api.saw("10" + sup(s.byId.us.exp) + " ÷ 10" + sup(s.byId.phone.exp) + " = 10" + sup(s.span) + ": the U.S. year is about " + sci(s.spanRatio, 2) + " phone charges. " + nearestWhy(PU)); }
          else api.saw(tries < 2 ? "Not yet. Subtract the exponents: " + s.byId.phone.sci + " and " + s.byId.us.sci + "." : s.byId.us.exp + " − " + s.byId.phone.exp + " = " + s.span + ".", true);
        } });
        autos[4] = function () { n.input.value = String(s.span); n.go(); };
      }
    });

    // ---- step 6: check a number by its order of magnitude
    steps.push({
      text: "Bound the day by its lowest hour (" + s.loMW + " MW) and its highest (" + s.hiMW + " MW), each held for 24 h. Which reports of its energy fit, and which slipped a prefix, a factor of 1,000?",
      build: function (act, api) {
        H("p", { class: "k1-eq", text: s.loMW + " MW × 24 h = " + num(s.loBound) + " MWh  ≤  the day  ≤  " + s.hiMW + " MW × 24 h = " + num(s.hiBound) + " MWh" }, act);
        var right = {}, list = H("div", { class: "k1-rows" }, act);
        s.claims.forEach(function (c, i) {
          var row = H("div", { class: "k1-row" }, list);
          H("p", { html: "“Prairie Town used <b>" + LX.esc(c.text) + "</b> on " + LX.esc(D.dateLabel) + ".”" }, row);
          var mark = H("span", { class: "k1-mark", "aria-live": "polite" }, row);
          seg(row, ["Fits", "Off"], function (k) {
            right[i] = (k === 0) === c.ok;
            var why = c.ok ? "inside the bounds" : (c.off > 0 ? "10" + sup(c.off) + " times too big" : "10" + sup(-c.off) + " times too small");
            mark.textContent = (right[i] ? "Right: " : "Not quite: ") + why; mark.className = "k1-mark " + (right[i] ? "good" : "bad");
            if (s.claims.every(function (q, j) { return right[j]; })) { api.done(); api.saw("Only about " + Math.round(s.dayGWh) + " GWh lies between " + num(s.loBound) + " and " + num(s.hiBound) + " MWh. Fitting the bounds makes a number plausible, not proven; missing them by an [[order-of-magnitude|order of magnitude]] points to a slip."); }
          }, "Does " + c.text + " fit?");
        });
        autos[5] = function () { list.querySelectorAll(".k1-row").forEach(function (row, i) { row.querySelectorAll(".lx-seg button")[s.claims[i].ok ? 0 : 1].click(); }); };
      }
    });

    var cards = LX.StepCards(live, { id: "k1-steps", steps: steps, onStep: function () { LX.emit("layout"); } });
    LX.demo(root, function (state) {   // "mid" = step 3 done; "step-N" = card N with its action done; "done" = the last card (6) done
      var k = state === "mid" ? 2 : state === "done" ? steps.length - 1 : /^step-(\d+)$/.test(state) ? Math.max(0, Math.min(steps.length - 1, +state.slice(5) - 1)) : -1;
      if (k < 0) return null;
      cards.go(k); if (autos[k]) autos[k]();
      return { view: "step " + (k + 1) };
    }, cards);

    explain(s);
    drillView(D);
  }

  // ---------------------------------------------------------------- explain layer
  function explain(s) {
    var x = document.getElementById("k1-explain"); if (!x) return; x.innerHTML = "";
    LX.CompareTable(H("div", { class: "lx-xcard" }, x), {
      title: "The prefix ladder", text: true,
      columns: [{ key: "name", label: "Prefix", main: true }, { key: "times", label: "Times the unit" }, { key: "ex", label: "On this page" }],
      rows: [
        { key: "k", color: "var(--lx-tier-1)", name: "k, kilo", note: "10³", times: "1,000", ex: s.peak + " MW = " + num(s.peakKW) + " kW" },
        { key: "M", color: "var(--lx-tier-2)", name: "M, mega", note: "10⁶", times: "1,000,000", ex: s.hiMW + " MW: the busiest hour of " + s.D.dateLabel },
        { key: "G", color: "var(--lx-tier-3)", name: "G, giga", note: "10⁹", times: "1,000,000,000", ex: plain(s.dayGWh) + " GWh: Prairie Town's day" },
        { key: "T", color: "var(--lx-tier-4)", name: "T, tera", note: "10¹²", times: "1,000,000,000,000", ex: s.byId.spp.given + ": the Southwest Power Pool's year" }]
    });
    // the reader's own pair from step 5 (else a home's year against the town's day); "≈" because the leading numbers are rounded
    var card = H("div", { class: "lx-xcard" }, x), hd = H("header", { class: "lx-x-head" }, card);
    H("h3", { text: "Divide by subtracting exponents" }, hd);
    var lede = H("p", { class: "lx-lede" }, card), uc = LX.UnitChain(H("div", null, card), { label: "Unit chain: one amount divided by another" });
    function drawPair() {
      var o = LX.store.get("k1-pair"), p = o && pairText(s, o.a, o.b), own = !!p;
      if (!p) p = pairText(s, "town", "home");
      lede.textContent = (own ? "Your pair from step 5: " : "Prairie Town's day against an average U.S. home's year: ") + "divide the leading numbers, subtract the exponents. " + nearestWhy(p);
      uc.set([{ v: p.big.sci, u: p.big.short }, { op: "÷" }, { v: p.small.sci, u: p.small.short }, { op: "≈" },
              { v: "(" + sig(p.big.mant, 3) + " ÷ " + sig(p.small.mant, 3) + ") × 10" + sup(p.dexp), u: "leading numbers, exponents" }, { op: "≈" },
              { v: p.ratioText, u: "nearest power of ten: 10" + sup(p.apart), out: true }]);
    }
    drawPair();
    var sec = document.getElementById("explain");
    if (sec && "IntersectionObserver" in window) new IntersectionObserver(function (es) { if (es[0].isIntersecting) drawPair(); }).observe(sec);
    LX.Flowchart(H("div", { class: "lx-xcard" }, x), {
      title: "Check a number in four moves", lede: "Two of step 6's reports, traced.",
      nodes: {
        start: { t: "A number with a unit", tN: ["A number", "with a unit"], k: "end" },
        one: { t: "Put it in one unit", s: "climb the ladder: × or ÷ 1,000", sN: "× or ÷ 1,000" },
        sci: { t: "Write it as a × 10ⁿ", tN: ["Write it", "as a × 10ⁿ"] },
        q: { t: "Inside a bound?", tN: ["Inside a", "bound?"], k: "q" },
        fits: { t: "Plausible", s: "keep checking", k: "end" },
        slip: { t: "Look for a slip", s: "a prefix, a unit, the hours", sN: "prefix, unit, hours", k: "end" }
      },
      cols: 3, at: { start: [1, 0], one: [1, 1], sci: [1, 2], q: [1, 3], fits: [0, 4], slip: [2, 4] },
      colsN: 2, atN: { start: [0.5, 0], one: [0.5, 1], sci: [0.5, 2], q: [0.5, 3], fits: [0, 4], slip: [1, 4] },
      edges: [["start", "one"], ["one", "sci"], ["sci", "q"], ["q", "fits", "yes"], ["q", "slip", "no"]],
      traces: [
        { label: s.claims[0].text, path: ["start", "one", "sci", "q", "slip"], text: "**" + s.claims[0].text + " = " + num(s.claims[0].mwh) + " MWh " + eqSci(s.claims[0].mwh * 1e6) + " Wh.** The bounds are " + num(s.loBound) + "–" + num(s.hiBound) + " MWh: 1,000 times too big. GWh was written for MWh." },
        { label: s.claims[2].text, path: ["start", "one", "sci", "q", "fits"], text: "**" + s.claims[2].text + " = " + num(s.claims[2].mwh) + " MWh " + eqSci(s.claims[2].mwh * 1e6) + " Wh.** Inside " + num(s.loBound) + "–" + num(s.hiBound) + " MWh: plausible. The sum of the hours gives " + num(s.dayMWh) + " MWh." }],
      sel: 0
    });
  }

  // ---------------------------------------------------------------- practice drill (LX.Drill; this visit only)
  function drillView(D) {
    var host = document.getElementById("k1-drill"); if (!host) return; host.innerHTML = "";
    LX.Drill(host, { hint: "Six kinds of item in rotation, new numbers each time. Aim for ten, about 10 minutes. Large numbers can be typed as 6.96e9.",
                     width: BOX.width, widthPhone: BOX.widthPhone, empty: "Type a number first.",
                     item: function (k, r) { return drillItem(D, k, r); }, check: function (v, it) { return close(v, it.answer, it.tol); } });
  }

  LX.mount("k01", function (live, data, root) { view(live, data, root); });
})();
