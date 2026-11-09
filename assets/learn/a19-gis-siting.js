/* a19-gis-siting.js — lesson A19 "Where should it go? Siting with maps, from layers to a suitability score" (Analyst,
   step cards, spatial). Prairie City is fictional; its numbers are illustrative.
   The map and its model are assets/learn/components/siting.js (LX.A19, LX.SiteMap, in learn.js). This file holds the
   lesson's own numbers and words (pure, exported for Node: _tests/learn/test_a19-gis-siting.js checks every one), the
   eight step cards, the demo states and the explain layer.
   Data: data/a19-gis-siting.json, data/cf_targets.json (EIA's 2025 capacity factors) and data/prairie-city.json (the
   shared Prairie City data: the data-center campus's contract MW, read through A19.withCity).
   Shared components: LX.StepCards, LX.Slider, LX.Toggle, LX.Flowchart, LX.CompareTable, LX.Boundary; lesson links through LX.rich. */
(function () {
  "use strict";
  var A19 = (typeof window !== "undefined" && window.LX && window.LX.A19) || (typeof require === "function" ? require("./components/siting.js") : null);

  // ---------------------------------------------------------------- formats
  function comma(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
  function km2(v) { return comma(Math.round(v)) + " km²"; }
  function musd(v) { return "$" + (v / 1e6).toFixed(1) + " million"; }
  function musdS(v) { return "$" + (v / 1e6).toFixed(1) + "M"; }
  function pct(v) { return Math.round(100 * v) + "%"; }
  function sc(v) { return String(Math.round(100 * v)); }
  function km(v) { return v.toFixed(1) + " km"; }
  function gwh(v) { return comma(Math.round(v / 1000)) + " GWh"; }
  function usd100(v) { return "$" + comma(Math.round(v / 100) * 100); }
  function subName(D, id) { var s = D.substations.filter(function (x) { return x.id === id; })[0]; return s ? s.name + " (" + s.id + ")" : "none"; }
  function subOf(D, id) { return D.substations.filter(function (x) { return x.id === id; })[0]; }

  // ---------------------------------------------------------------- the lesson's model: runs with caches
  var LAYERS = [["base", "Land use"], ["protected", "Protected land"], ["slope", "Slope"], ["homes", "Homes"], ["flood", "Flood zones"],
    ["grid", "Lines and substations"], ["roads", "Roads"], ["wind", "Wind"], ["sun", "Sunshine"], ["land", "Land price"]];
  var EXKEYS = ["protected", "flood", "slope", "setback"];
  function model(D, CF) {
    var R = A19.build(D, {}), Rn = null, C2 = null, cache = {}, pcache = {}, ncache = 0;
    var cft = { solar: CF.targets.solar.cf, wind: CF.targets.wind.cf };
    function region(o) {
      if (o && o.newer) return Rn || (Rn = A19.build(D, { newer: true }));
      if (o && o.coarse) return C2 || (C2 = A19.coarsen(R, 2));
      return R;
    }
    function paths(Rx, prot, need) {
      var k = (Rx === R ? "R" : "Rn") + prot + need;
      return pcache[k] || (pcache[k] = A19.paths(Rx, D, A19.surface(Rx, D, { protected: prot }), need));
    }
    function run(type, over, o) {
      o = o || {};
      var key = JSON.stringify([type, over || {}, o]);
      if (cache[key]) return cache[key];
      if (++ncache > 80) { cache = {}; ncache = 1; }
      var Rx = region(o), c = A19.cfg(D, type, over), X = A19.exclude(Rx, D, type, c), CR = A19.criteria(Rx, D, type, c);
      var BL = A19.blocks(Rx, D, type, c, X, CR), top = A19.sites(Rx, D, type, c, 5, X, CR, BL);
      var P = o.coarse ? null : paths(Rx, o.protected || "forbid", A19.needMW(D, type, c));
      var costs = top.map(function (s) { return A19.cost(Rx, D, type, s, c, P, cft); });
      return (cache[key] = { type: type, over: over || {}, o: o, c: c, R: Rx, X: X, CR: CR, BL: BL, top: top, P: P, costs: costs });
    }
    function shares(type, over) {
      var r = run(type, over), S = D.sensitivity;
      return r.sharesCache || (r.sharesCache = A19.shares(r.R, D, type, r.c, r.top, S.draws, S.seed, r.BL, r.CR));
    }
    function solo(type, key, strict) {   // land left with one exclusion on (or none: key null)
      var ex = { protected: false, flood: false, slope: false, setback: false };
      if (key) ex[key] = true;
      return run(type, Object.assign({ exclusions: ex }, strictOver(D, type, strict))).X.areaKm2;
    }
    return { D: D, R: R, cft: cft, region: region, run: run, shares: shares, solo: solo, paths: paths };
  }
  function strictOver(D, type, strict) {
    var T = D.types[type];
    return strict ? { slopeMax: T.slopeOptions[1], setbackM: T.setbackOptions[1] } : {};
  }
  // the solar runs of steps 3 and 8 and the explain layer: the reader's rules (step 2) with the reader's weights (step 3)
  function solarOver(D, st) { return Object.assign({ exclusions: st.ex, weights: weightsOf(D, "solar", st.w) }, strictOver(D, "solar", st.strict)); }
  function weightsOf(D, type, w) {
    var T = D.types[type], out = {};
    T.criteria.forEach(function (k) { out[k] = w && w[k] != null ? w[k] : T.weights[k]; });
    return out;
  }
  function presetW(D, type, p) { var P = D.presets[p], out = {}; D.types[type].criteria.forEach(function (k) { out[k] = P[k]; }); return out; }
  function critLabel(D, type, k) { var c = D.criteria[k]; return typeof c === "string" ? c : c[type]; }

  // ---------------------------------------------------------------- words (pure; the test checks them for every input)
  var NOWEIGHTS = "Choose a criterion before ranking sites: with every weight at 0, no block scores above another.";
  function hints(M) {
    var D = M.D, T = D.types;
    return {
      always: "Always out: the river, built-up land, the industrial park and substations. Stricter rules: NREL's limited case, slopes over " + T.solar.slopeOptions[1] + "% and " + T.solar.setbackOptions[1] + " m from buildings.",
      slope: "Slope is rise over run: a " + T.solar.slopeMax + "% slope climbs " + T.solar.slopeMax + " m over 100 m across the ground.",
      weights: "A weight of 0 drops a criterion, but one at least must be above 0; only the ratios between weights matter. Scores run from 0 to 100 for land that is left.",
      energy: T.solar.mw + " MW is the farm's size, a rate of [[power|power]]; GWh a year is the energy it makes: MW × 8,760 hours × its [[capacity-factor|capacity factor]] ÷ 1,000.",
      random: "Each draw picks five weights at random that sum to 1, all mixes equally likely; seed " + D.sensitivity.seed + ".",
      rules4: "This step keeps the default rules, all four exclusions at NREL's reference case, whatever you set in step 2.",
      wind: "Turbines go on the buildable cells; the farm's total area includes the farmland between them, as NREL's 34.5 ha per MW average does.",
      corridor: "Costs: NREL's 138 kV baseline, $" + comma(D.costs.lineUSDperMile) + " a mile in 2022 dollars ($" + comma(Math.round(A19.usd(D, D.costs.lineUSDperMile, D.costs.lineYear))) + " in 2025 dollars), times " + D.costs.mult.wet + " in flood zones, " + D.costs.mult.built + " through built-up land.",
      dc: "A data center here is a load and a building: Prairie City's " + T.dc.mw + " MW campus (shared city data), with its water, land and road. Its cooling sets its water need, left out here.",
      limits: "The 2 km check runs on the solar farm with your step 2 rules and default weights. The newer homes are acreages along the north county road."
    };
  }
  function exLabels(D, strict) {
    var T = D.types.solar, sl = strict ? T.slopeOptions[1] : T.slopeMax, sb = strict ? T.setbackOptions[1] : T.setbackM;
    return { protected: "Protected land", flood: "Flood zones", slope: "Slope over " + sl + "%", setback: sb + " m from homes" };
  }
  function ruleWords(D, strict) {
    var L = exLabels(D, strict);
    return "Thresholds now: " + L.slope.toLowerCase().replace("slope over", "slopes over") + " and " + L.setback + ", NREL's " + (strict ? "limited" : "reference") + " case.";
  }
  function s1Saw(M) {
    var R = M.R, lo = Infinity, hi = -Infinity, wmax = -Infinity;
    for (var n = 0; n < R.N; n++) { if (R.sun[n] < lo) lo = R.sun[n]; if (R.sun[n] > hi) hi = R.sun[n]; if (R.wind[n] > wmax) wmax = R.wind[n]; }
    return "Wind is fastest on the western ridge, up to **" + wmax.toFixed(1) + " m/s**, while sunshine differs by only **" + (100 * (hi - lo) / lo).toFixed(1) + "%** across the region. Land costs most next to the city.";
  }
  function s2Saw(M, st) {
    var strict = !!st.strict, r = M.run("solar", Object.assign({ exclusions: st.ex }, strictOver(M.D, "solar", strict))), none = M.solo("solar", null, strict);
    var drops = EXKEYS.map(function (k) { return none - M.solo("solar", k, strict); });
    var names = ["protected land", "flood zones", "steep slopes", "setbacks"];
    return "Your rules leave **" + km2(r.X.areaKm2) + "**, " + pct(r.X.share) + " of the region. On its own, " + names.map(function (nm, i) { return (i === 3 ? "[[setback|setbacks]]" : nm) + " remove" + (i === 0 ? "s " : " ") + km2(drops[i]); }).join(", ") + ".";
  }
  function s3Saw(M, st) {
    var r = M.run("solar", solarOver(M.D, st)), s = r.top[0], k = r.costs[0];
    if (r.top.noWeights) return NOWEIGHTS;
    if (!s) return "No block has room with these rules.";
    return "Site **A** scores **" + sc(s.score) + "** of 100, " + A19.place(r.R, s.i, s.j, s.k) + " of the center: " + musd(k.upfront) + " up front and " + gwh(k.mwh) + " a year. A score ranks sites; it is not a cost.";
  }
  function s4Saw(M) {
    var D = M.D, dev = M.run("solar", { weights: presetW(D, "solar", "developer") }).top[0], nb = M.run("solar", { weights: presetW(D, "solar", "neighbours") }).top[0];
    var sh = M.shares("solar"), r0 = M.run("solar");
    return "A developer's best site is " + A19.place(M.R, dev.i, dev.j, dev.k) + "; neighbors' is " + A19.place(M.R, nb.i, nb.j, nb.k) + ". Of " + sh.draws + " random weightings, default site A is the winning block in **" + pct(sh.wins.A / sh.draws) + "**; other blocks win " + pct(sh.other / sh.draws) + ".";
  }
  function sharesNote(M) {
    var sh = M.shares("solar");
    return "A win counts for a site only when the winner is that very block; " + sh.near + " of the " + sh.other + " other wins went to blocks that overlap one of the five.";
  }
  function windAt(M, sb) { return M.run("wind", { setbackM: sb }); }
  function s5Saw(M, sb) {
    var T = M.D.types.wind, a = windAt(M, T.setbackM), b = windAt(M, sb);
    var you = sb === T.setbackM ? "" : "; at your " + comma(sb) + " m, **" + km2(b.X.areaKm2) + "** and " + comma(b.BL.length) + " blocks";
    return "At " + T.setbackM + " m, " + km2(a.X.areaKm2) + " is buildable and " + comma(a.BL.length) + " blocks have room" + you + ". Local rules set setbacks, county by county.";
  }
  function corridor(M, sb, prot) {
    var r = windAt(M, sb), s = r.top[0]; if (!s) return null;
    var P = M.paths(M.R, prot, M.D.types.wind.mw), rt = A19.route(M.R, P, s.cell);
    return rt ? { site: s, route: rt, prot: prot } : null;
  }
  function s6Saw(M, sb) {
    var f = corridor(M, sb, "forbid"), a = corridor(M, sb, "allow");
    if (!f || !a) return "No path reaches a substation with room.";
    var through = a.route.parts.protected || 0;
    return "Forbidden, the line runs **" + km(f.route.km) + "** for **" + musd(f.route.cost) + "**. Allowed, it runs " + km(a.route.km) + " for " + musd(a.route.cost) + (through > 0 ? ", " + km(through) + " of it through protected land: " + mitWords(M.D) + " barely deters it." : ", avoiding protected land anyway.");
  }
  // NREL's mitigation cost in the page's dollars (2025), with the source's 2022 figure
  function mitWords(D) { return "about " + usd100(A19.usd(D, D.costs.mitigationUSDperMile, D.costs.mitigationYear)) + " a mile (NREL's $" + comma(D.costs.mitigationUSDperMile) + " in " + D.costs.mitigationYear + " dollars)"; }
  function dcRun(M, any) { return M.run("dc", { anySub: !!any }); }
  function s7Saw(M) {
    var D = M.D, mw = D.types.dc.mw, a = dcRun(M, false), b = dcRun(M, true), s = a.top[0], k = a.costs[0];
    var short = b.top.map(function (p, i) { return { p: p, k: b.costs[i] }; }).filter(function (x) { return x.k.sub && subOf(D, x.k.sub).headroomMW < mw; })[0];
    var tail = short ? " With any substation, site " + short.p.id + " would use " + subName(D, short.k.sub) + ", which has only " + subOf(D, short.k.sub).headroomMW + " MW spare: an upgrade, and a wait." : " With any substation, the top five need no upgrade.";
    return "Needing " + mw + " MW spare, site A sits by " + subName(D, k.sub) + ": **" + musd(k.upfront) + "** up front." + tail;
  }
  function limits(M, ex, strict) {
    var over = Object.assign({ exclusions: ex || M.D.types.solar.exclusions }, strictOver(M.D, "solar", strict));
    var f = M.run("solar", over), c = M.run("solar", over, { coarse: true }), n = M.run("solar", over, { newer: true });
    var A = f.top[0], nA = n.top.filter(function (s) { return A && s.i === A.i && s.j === A.j; })[0];
    var stillHas = A ? n.BL.some(function (b) { return b.i === A.i && b.j === A.j; }) : false;
    return { fine: f, coarse: c, newer: n, A: A, nA: nA, stillHas: stillHas, nNewer: M.R.nNewer };
  }
  function s8Saw(M, ex, strict) {
    var L = limits(M, ex, strict);
    var fate = !L.A ? "" : !L.stillHas ? "site A loses its room: setbacks now cover it" : L.nA ? "site A stays in the top five, as " + L.nA.id : "site A keeps its room but drops out of the top five";
    return "At 2 km cells, **" + km2(L.coarse.X.areaKm2) + "** is buildable instead of " + km2(L.fine.X.areaKm2) + ". With the " + L.nNewer + " homes built since " + M.D.homes.vintage + ", " + fate + ".";
  }

  // ---------------------------------------------------------------- the no-JS block and the explain layer's rows
  function rowsFor(M, type, over, o) {
    var r = M.run(type, over, o);
    return r.top.map(function (s, i) {
      var k = r.costs[i];
      var priced = !!r.P;
      var sb = priced && k.sub ? subOf(M.D, k.sub) : null, up = !!(sb && sb.headroomMW < A19.needMW(M.D, type, {}));
      return { id: s.id, where: A19.place(r.R, s.i, s.j, s.k), score: sc(s.score), upfront: !priced ? "–" : isFinite(k.upfront) ? musdS(k.upfront) + (up ? " + upgrade" : "") : "no path", upgrade: up, sub: priced && k.sub ? subName(M.D, k.sub) : "–", subId: priced && k.sub ? k.sub : "–", energy: k.mwh ? gwh(k.mwh) : null, water: type === "dc" ? km(k.waterKm) : null };
    });
  }
  function staticFallback(M) {
    var D = M.D, T = D.types, out = [];
    out.push('<p class="lx-eyebrow">The default runs, from the same model (' + D.fictional + ')</p>');
    [["solar", "Solar farm, " + T.solar.mw + " MW: the five best 2 km × 2 km blocks"], ["wind", "Wind farm, " + T.wind.mw + " MW: the five best 7 km × 7 km blocks"], ["dc", "Data-center campus, " + T.dc.mw + " MW: the five best 1 km cells, at least 2 km apart"]].forEach(function (t) {
      var rows = rowsFor(M, t[0]), r = M.run(t[0]);
      out.push('<p class="a19-fb-h"><b>' + t[1] + "</b>. Land left after exclusions: " + km2(r.X.areaKm2) + ".</p>");
      var head = ["Site", "Where (from the center)", "Score", "Up front", "Substation", t[0] === "dc" ? "Water main" : "Energy a year"];
      out.push('<div class="lx-scroll-x"><table class="lx-facts a19-fb"><thead><tr>' + head.map(function (h) { return '<th scope="col">' + h + "</th>"; }).join("") + "</tr></thead><tbody>" +
        rows.map(function (x) { return '<tr><th scope="row">' + x.id + "</th><td>" + x.where + "</td><td>" + x.score + "</td><td>" + x.upfront + "</td><td>" + x.sub + "</td><td>" + (t[0] === "dc" ? x.water : x.energy) + "</td></tr>"; }).join("") + "</tbody></table></div>");
    });
    var f = corridor(M, T.wind.setbackM, "forbid"), a = corridor(M, T.wind.setbackM, "allow");
    out.push("<p><b>Corridor</b> from wind site A to " + subName(D, f.route.sub) + ": " + km(f.route.km) + " for " + musd(f.route.cost) + " with protected land forbidden; " + km(a.route.km) + " for " + musd(a.route.cost) + " when it is allowed at NREL's mitigation cost (" + km(a.route.parts.protected || 0) + " through it).</p>");
    out.push("<p>Up-front costs are 2025 dollars (NREL's 2022 line costs converted with BEA's GDP deflator): the new line, an access road, land and, for the data center, a water main. Energy is a year's output; the two are never added.</p>");
    return out.join("\n");
  }
  function limitRows(M, st) {
    var D = M.D, L = limits(M, st.ex, st.strict), sh = M.shares("solar"), f = corridor(M, st.sb, "forbid"), a = corridor(M, st.sb, "allow");
    var r = M.run("solar", solarOver(D, st));
    return [
      { key: "weights", name: "Weights are value choices", here: "Default site A is the winning block in " + pct(sh.wins.A / sh.draws) + " of " + sh.draws + " random weightings; " + (r.top.noWeights ? "your weights are all 0, so they rank no site." : "your weights put A " + (r.top[0] ? A19.place(M.R, r.top[0].i, r.top[0].j, r.top[0].k) : "nowhere") + "."), study: "Publish the weights, test other sets, and report which sites survive most of them." },
      { key: "exclude", name: "Exclude or weight?", here: f && a ? "Forbidding protected land adds " + musd(f.route.cost - a.route.cost) + " to the line; priced at " + mitWords(D) + ", it would cut through." : "No path in one of the two cases.", study: "Exclude only what a rule forbids; weight what people trade off, and say which is which." },
      { key: "res", name: "Resolution", here: "1 km cells leave " + km2(L.fine.X.areaKm2) + " for solar; 2 km cells, " + km2(L.coarse.X.areaKm2) + ". Setbacks are smaller than a cell.", study: "Use cells finer than the rules: NREL's supply curves work at 90 m." },
      { key: "vintage", name: "Data vintage", here: L.nNewer + " homes built since " + D.homes.vintage + " are missing from the dated layer" + (L.A && !L.stillHas ? "; one costs site A its room" : "") + ".", study: "Date every layer; check the leading sites on newer imagery and on the ground." },
      { key: "who", name: "Who was asked", here: "A developer's and the neighbors' weights pick different sites; nobody in this map was asked.", study: "Set criteria and weights with the people affected, and record whose they are." }
    ];
  }

  var lesson = { model: model, hints: hints, s1Saw: s1Saw, s2Saw: s2Saw, s3Saw: s3Saw, s4Saw: s4Saw, s5Saw: s5Saw, s6Saw: s6Saw, s7Saw: s7Saw, s8Saw: s8Saw,
    corridor: corridor, limits: limits, rowsFor: rowsFor, staticFallback: staticFallback, limitRows: limitRows, weightsOf: weightsOf, presetW: presetW,
    strictOver: strictOver, solarOver: solarOver, exLabels: exLabels, ruleWords: ruleWords, sharesNote: sharesNote, mitWords: mitWords, NOWEIGHTS: NOWEIGHTS,
    LAYERS: LAYERS, EXKEYS: EXKEYS, fmt: { comma: comma, km2: km2, musd: musd, musdS: musdS, pct: pct, sc: sc, km: km, gwh: gwh, usd100: usd100 } };
  if (typeof module !== "undefined" && module.exports) module.exports = lesson;
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H;
  var UPNOTE = "Up front: the site's own costs in 2025 dollars (the new line, an access road, land and a water main). “+ upgrade”: the substation's upgrade and the wait are not priced, so that total is not comparable.";

  function seg(host, label, items, sel, onPick) {
    var g = H("div", { class: "lx-seg a19-seg", role: "group", "aria-label": label }, host), bs = {};
    items.forEach(function (it) {
      var b = H("button", { type: "button", "aria-pressed": it[0] === sel ? "true" : "false", text: it[1] }, g);
      b.addEventListener("click", function () { set(it[0]); onPick(it[0]); });
      bs[it[0]] = b;
    });
    function set(k) { Object.keys(bs).forEach(function (x) { bs[x].setAttribute("aria-pressed", x === k ? "true" : "false"); }); }
    return { set: set, el: g };
  }
  function readouts(host, pairs) {
    host.innerHTML = "";
    pairs.forEach(function (p) { var d = H("div", { class: "lx-readout" }, host); H("span", { class: "k", text: p[0] }, d); H("b", { text: p[1] }, d); });
  }
  // the top-sites table: the map's text version (cf-two: labelled lines on phones); a row's button highlights its site
  function SitesTable(host, onSel) {
    var box = H("div", { class: "a19-sites-box" }, host), cap = H("p", { class: "a19-tcap" }, box);
    var tbl = H("table", { class: "a19-tbl" }, H("div", { class: "lx-scroll-x" }, box)), note = H("p", { class: "a19-tnote" }, box), sel = null, btns = {};
    function set(rows, opts) {
      opts = opts || {};
      cap.textContent = opts.caption || "The five best sites, the map's text version (km from the city center)";
      note.textContent = opts.note || "Up front: the site's own costs in 2025 dollars (the new line, an access road" + (opts.lastKey === "water" ? ", land and a water main); the campus itself" : " and land); the plant itself") + " costs the same anywhere and is left out.";
      var head = ["Site", "Where", "Score", "Up front", "Grid", opts.last || "Energy a year"];
      tbl.innerHTML = ""; btns = {};
      var th = H("thead", null, tbl), tr = H("tr", null, th);
      head.forEach(function (h) { H("th", { scope: "col", text: h }, tr); });
      var tb = H("tbody", null, tbl);
      if (!rows.length) { var e = H("tr", null, tb); H("td", { colspan: "6", text: opts.empty || "No block has room with these rules." }, e); return; }
      rows.forEach(function (r) {
        var row = H("tr", { class: r.id === sel ? "on" : "" }, tb), h = H("th", { scope: "row" }, row);
        var b = H("button", { type: "button", class: "a19-pick", "aria-pressed": r.id === sel ? "true" : "false", "aria-label": "Show site " + r.id + " on the map", text: r.id }, h);
        btns[r.id] = b;
        b.addEventListener("click", function () { sel = sel === r.id ? null : r.id; onSel(sel); set(rows, opts); if (btns[r.id]) btns[r.id].focus(); });
        [r.where, r.score, r.upfront, r.subId + (r.upgrade ? ", needs an upgrade" : ""), opts.lastKey ? r[opts.lastKey] : r.energy].forEach(function (c, i) { H("td", { class: i === 1 || i === 2 ? "n" : null, text: c == null ? "–" : c }, row); });
      });
    }
    return { set: set, sel: function (v) { if (v !== undefined) sel = v; return sel; } };
  }

  function view(live, data, root) {
    var D = A19.withCity(data.a19_gis_siting, data.prairie_city), M = model(D, data.cf_targets), TX = hints(M), T = D.types;
    var log = LX.store.get("a19-log", {}) || {}, refreshT = null;
    function keep(k, v) { log[k] = v; LX.store.set("a19-log", log); clearTimeout(refreshT); refreshT = setTimeout(buildExplain, 150); }
    function st() { return { ex: Object.assign({}, T.solar.exclusions, log.ex || {}), strict: !!log.strict, w: weightsOf(D, "solar", log.w), sb: log.sb || T.wind.setbackM }; }
    H("p", { class: "a19-fict", text: D.fictional }, live);

    function mapIn(act, label) { return LX.SiteMap(H("div", { class: "a19-mapbox" }, act), { R: M.R, D: D, label: label }); }
    function drawRun(map, r, extra) {
      var suit = A19.suitability(r.R, D, r.type, r.c, r.X, r.CR);
      map.draw(Object.assign({ layer: "suit", R: r.R, suit: suit, X: r.X, sites: r.top }, extra || {}));
    }
    function tableRows(r) { return rowsFor(M, r.type, r.over, r.o); }

    var steps = [
      // 1 the layers
      { text: "Prairie City's region is a grid of 1 km cells, " + D.grid.W + " by " + D.grid.H + ": " + comma(D.grid.W * D.grid.H) + " km². A siting study stacks layers on that grid, one number or class per cell. Open three layers.",
        build: function (act, api) {
          var map = mapIn(act, "Map of the region around Prairie City, one layer at a time"), seen = {};
          (log.layers || []).forEach(function (k) { seen[k] = true; });
          var cur = "base";
          var sg = seg(H("div", { class: "a19-ctl" }, act), "Layer to show", LAYERS, cur, function (k) { show(k); });
          var ro = H("p", { class: "lx-hint", "aria-live": "polite" }, act);
          function show(k) {
            cur = k; sg.set(k); map.draw({ layer: k, homes: k === "homes" });
            if (k !== "base") seen[k] = true;
            keep("layers", Object.keys(seen));
            var n = Object.keys(seen).length;
            ro.textContent = n >= 3 ? "Three or more layers seen. Use the arrow keys on the map to read any cell." : "Layers opened: " + n + " of 3.";
            if (n >= 3) { api.done(); api.saw(s1Saw(M)); }
          }
          show("base");
          act.lxSet = function (k) { show(k); };
        } },
      // 2 exclusions
      { text: "A solar farm cannot go everywhere. [[exclusion-layer|Exclusion layers]] remove land outright: protected land, [[flood-zone|flood zones]], steep slopes and a [[setback|setback]] from homes. Switch them and watch the land left.",
        build: function (act, api) {
          var map = mapIn(act, "Map of the solar farm's exclusions: hatched cells are excluded, shaded ones lose land to setbacks"), s = st(), moved = !!log.exMoved;
          var tg = H("div", { class: "lx-toggles a19-ctl", role: "group", "aria-label": "Exclusions for the solar farm" }, act), ts = {};
          var names = exLabels(D, s.strict);
          EXKEYS.forEach(function (k) { ts[k] = LX.Toggle(tg, { label: names[k], on: s.ex[k], onChange: function (on) { s.ex[k] = on; keep("ex", s.ex); touched(); } }); });
          var strictT = LX.Toggle(tg, { label: "Stricter rules", on: s.strict, onChange: function (on) { s.strict = on; keep("strict", on); touched(); } });
          var ro = H("div", { class: "lx-readouts", "aria-live": "polite" }, act);
          var rules = H("p", { class: "lx-hint", "aria-live": "polite" }, act);
          H("p", { class: "lx-hint", text: TX.always }, act);
          H("p", { class: "lx-hint", text: TX.slope }, act);
          function paint() {
            var r = M.run("solar", Object.assign({ exclusions: s.ex }, strictOver(D, "solar", s.strict)));
            // the switches name the thresholds in force: "Stricter rules" changes the slope limit and the setback
            var lb = exLabels(D, s.strict);
            ["slope", "setback"].forEach(function (k) { var sp = ts[k].el.querySelector("span"); if (sp) sp.textContent = lb[k]; });
            rules.textContent = ruleWords(D, s.strict);
            map.draw({ layer: "base", X: r.X, homes: true });
            readouts(ro, [["Land left", km2(r.X.areaKm2)], ["Share of the region", pct(r.X.share)], ["2 km blocks with room", comma(r.BL.length)]]);
          }
          function touched() { moved = true; keep("exMoved", true); paint(); api.done(); api.saw(s2Saw(M, s)); }
          paint();
          if (moved) { api.done(); api.saw(s2Saw(M, s)); }
          act.lxSet = function (k, on) { if (k === "strict") { strictT.set(on); s.strict = on; keep("strict", on); } else { ts[k].set(on); s.ex[k] = on; keep("ex", s.ex); } touched(); };
        } },
      // 3 weights
      { text: "What is left gets a score. Each criterion becomes 0 to 1, and a [[weighted-overlay|weighted overlay]] adds them with your weights. Move a weight and watch the five best sites, A to E.",
        build: function (act, api) {
          var map = mapIn(act, "Suitability map for the solar farm, darker is better, with the five best sites outlined"), s = st(), moves = 0, sel = null;
          var grid = H("div", { class: "a19-sliders" }, act), sl = {};
          var tbl = SitesTable(act, function (id) { sel = id; paint(true); });
          H("p", { class: "lx-hint", text: TX.weights }, act);
          H("p", { class: "lx-hint", html: LX.rich(TX.energy) }, act);
          T.solar.criteria.forEach(function (k) {
            sl[k] = LX.Slider(grid, { label: critLabel(D, "solar", k), min: 0, max: 100, step: 5, value: s.w[k], color: "var(--lx-accent)",
              fmt: function (v) { return String(v); }, onChange: function (v) { s.w[k] = v; keep("w", s.w); moves++; paint(); if (moves >= 1) { api.done(); api.saw(s3Saw(M, s)); } } });
          });
          function paint(keepSel) {
            var r = M.run("solar", solarOver(D, s));
            if (!keepSel) { sel = null; tbl.sel(null); }
            if (r.top.noWeights) map.draw({ layer: "base", X: r.X });   // no weights, no scores: the land left only
            else drawRun(map, r, { sel: sel });
            tbl.set(tableRows(r), { empty: NOWEIGHTS });
          }
          paint();
          if (log.w) { api.done(); api.saw(s3Saw(M, s)); }
          act.lxSet = function (k, v) { sl[k].set(v); s.w[k] = v; keep("w", s.w); paint(); api.done(); api.saw(s3Saw(M, s)); };
        } },
      // 4 who sets the weights
      { text: "Weights are value choices, not physics. With the default rules, pick whose weights to use; then see how often each site wins when " + D.sensitivity.draws + " sets of weights are drawn at random.",
        build: function (act, api) {
          var map = mapIn(act, "Suitability map for the solar farm under the chosen weights, with the default rules"), seen = log.presets || {}, cur = "developer";
          var sg = seg(H("div", { class: "a19-ctl" }, act), "Whose weights", [["developer", D.presets.developer.label], ["neighbours", D.presets.neighbours.label], ["equal", D.presets.equal.label]], cur, function (k) { pick(k); });
          var ro = H("div", { class: "lx-readouts", "aria-live": "polite" }, act);
          var bars = H("div", { class: "a19-bars" }, act);
          H("p", { class: "lx-hint", text: TX.rules4 }, act);
          H("p", { class: "lx-hint", text: TX.random }, act);
          (function drawShares() {
            var sh = M.shares("solar"), r0 = M.run("solar");
            H("p", { class: "a19-tcap", text: "With the default rules: how often each default site is the winning block under " + sh.draws + " random weightings" }, bars);
            var list = H("ul", { class: "a19-barlist" }, bars);
            r0.top.map(function (s) { return [s.id + " (" + A19.place(M.R, s.i, s.j, s.k) + ")", sh.wins[s.id]]; }).concat([["Another block", sh.other]]).forEach(function (row) {
              var li = H("li", null, list); H("span", { class: "a19-bl", text: row[0] }, li);
              var tr = H("span", { class: "a19-bt", "aria-hidden": "true" }, li); H("i", { style: "width:" + (100 * row[1] / sh.draws).toFixed(1) + "%" }, tr);
              H("b", { text: pct(row[1] / sh.draws) }, li);
            });
            H("p", { class: "a19-tnote", text: sharesNote(M) }, bars);
          })();
          function pick(k) {
            cur = k; sg.set(k); seen[k] = true; keep("presets", seen);
            var r = M.run("solar", { weights: presetW(D, "solar", k) }), s = r.top[0];
            drawRun(map, r, { sites: s ? [Object.assign({}, s, { id: "best", label: "Best" })] : [], sel: "best", sitesKey: "The best site under these weights" });
            readouts(ro, [["Rules", "the defaults"], ["Best site", s ? A19.place(M.R, s.i, s.j, s.k) : "none"], ["Its score", s ? sc(s.score) : "–"], ["Up front", s ? musd(r.costs[0].upfront) : "–"]]);
            if (Object.keys(seen).length >= 2) { api.done(); api.saw(s4Saw(M)); }
          }
          pick(cur);
          act.lxSet = function (k) { pick(k); };
        } },
      // 5 the wind farm
      { text: "A wind farm needs room: a 7 km by 7 km block, at least half of it buildable. Slide the [[setback|setback]] from homes, starting at NREL's median of local rules, " + T.wind.setbackM + " m.",
        build: function (act, api) {
          var map = mapIn(act, "Suitability map for the wind farm, with the five best 7 km blocks"), sb = log.sb || T.wind.setbackM, tried = {};
          var ctl = H("div", { class: "a19-ctl" }, act);
          var slider = LX.Slider(ctl, { label: "Setback from homes", min: 100, max: T.wind.setbackMaxM, step: 20, value: sb, color: "var(--lx-wind)",
            fmt: function (v) { return comma(v) + " m"; }, onChange: function (v) { set(v); } });
          var ro = H("div", { class: "lx-readouts", "aria-live": "polite" }, act);
          H("p", { class: "lx-hint", text: TX.wind + " NREL's limited case uses " + T.wind.setbackOptions[1] + " m." }, act);
          var tbl = SitesTable(act, function (id) { draw(id); });
          function draw(sel) { var r = windAt(M, sb); drawRun(map, r, { sel: sel }); }
          function set(v) {
            sb = v; tried[v] = true; keep("sb", v);
            var r = windAt(M, v); draw(null); tbl.sel(null);
            tbl.set(tableRows(r));
            readouts(ro, [["Land left", km2(r.X.areaKm2)], ["7 km blocks with room", comma(r.BL.length)], ["Site A's wind", r.top[0] ? r.top[0].res.toFixed(1) + " m/s" : "–"]]);
            if (Object.keys(tried).length >= 2) { api.done(); api.saw(s5Saw(M, v)); }
          }
          set(sb);
          if (log.sb && log.sb !== T.wind.setbackM) { api.done(); api.saw(s5Saw(M, sb)); }
          act.lxSet = function (v) { slider.set(v); set(v); };
        } },
      // 6 the corridor
      { text: "Wind site A needs a line to a substation with " + T.wind.mw + " MW to spare. It follows a [[least-cost-path|least-cost path]] over a [[cost-surface|cost surface]]. Forbid protected land, or allow it at a price.",
        build: function (act, api) {
          var map = mapIn(act, "Map of the new line from wind site A to a substation"), sb = log.sb || T.wind.setbackM, seen = log.corr || {}, cur = "forbid";
          var sg = seg(H("div", { class: "a19-ctl" }, act), "Protected land for the line", [["forbid", "Forbid protected land"], ["allow", "Allow it, at a mitigation cost"]], cur, function (k) { pick(k); });
          var ro = H("div", { class: "lx-readouts", "aria-live": "polite" }, act);
          var parts = H("p", { class: "lx-hint", "aria-live": "polite" }, act);
          H("p", { class: "lx-hint", text: TX.corridor }, act);
          function pick(k) {
            cur = k; sg.set(k); seen[k] = true; keep("corr", seen);
            var c = corridor(M, sb, k), r = windAt(M, sb);
            if (!c) { readouts(ro, [["Line", "no path"]]); return; }
            map.draw({ layer: "protected", sites: [c.site], sel: "A", path: c.route.cells, sitesKey: "Wind site A", grid: true });
            readouts(ro, [["Length", km(c.route.km)], ["Cost", musd(c.route.cost)], ["To", subName(D, c.route.sub)]]);
            var pn = { farmland: "farmland", fringe: "the rural fringe", built: "built-up land", wet: "flood zones", hilly: "slopes over 5%", protected: "protected land" };
            parts.textContent = "Along the way: " + Object.keys(c.route.parts).map(function (p) { return km(c.route.parts[p]) + " of " + pn[p]; }).join(", ") + ".";
            if (seen.forbid && seen.allow) { api.done(); api.saw(s6Saw(M, sb)); }
          }
          pick(cur);
          act.lxSet = function (k) { pick(k); };
        } },
      // 7 the data center
      { text: "A [[data-center|data-center]] campus is a load and a building: " + T.dc.mw + " MW from the grid, water, a road, dry land. Compare substations with " + T.dc.mw + " MW of [[spare-capacity|spare capacity]] against any substation.",
        build: function (act, api) {
          var map = mapIn(act, "Suitability map for the data-center campus, with the five best 1 km cells"), seen = log.dc || {}, cur = "spare";
          var sg = seg(H("div", { class: "a19-ctl" }, act), "Which substations count", [["spare", "Only with " + T.dc.mw + " MW spare"], ["any", "Any substation"]], cur, function (k) { pick(k); });
          var ro = H("div", { class: "lx-readouts", "aria-live": "polite" }, act);
          H("p", { class: "lx-hint", text: TX.dc }, act);
          var tbl = SitesTable(act, function (id) { var r = dcRun(M, cur === "any"); drawRun(map, r, { sel: id, grid: true }); });
          function pick(k) {
            cur = k; sg.set(k); seen[k] = true; keep("dc", seen);
            var r = dcRun(M, k === "any"); drawRun(map, r, { grid: true }); tbl.sel(null);
            var rows = tableRows(r), anyUp = rows.some(function (x) { return x.upgrade; });
            tbl.set(rows, { last: "Water main", lastKey: "water", note: anyUp ? UPNOTE : null });
            var k0 = r.costs[0], up0 = rows[0] && rows[0].upgrade;
            readouts(ro, [["Site A, up front" + (up0 ? " + upgrade" : ""), k0 ? musd(k0.upfront) : "–"], ["Line", k0 ? musd(k0.connect) : "–"], ["Water main", k0 ? musd(k0.water) : "–"], ["Land", k0 ? musd(k0.land) : "–"]]);
            if (seen.spare && seen.any) { api.done(); api.saw(s7Saw(M)); }
          }
          pick(cur);
          act.lxSet = function (k) { pick(k); };
        } },
      // 8 limits: resolution and data vintage
      { text: "Two checks on the data itself. Coarser 2 km cells average away thin features; a homes layer dated " + D.homes.vintage + " misses newer houses. Switch each and watch the solar sites.",
        build: function (act, api) {
          var map = mapIn(act, "Suitability map for the solar farm at the chosen resolution and homes layer"), s = st(), seen = log.lim || {}, coarse = false, newer = false;
          var tg = H("div", { class: "lx-toggles a19-ctl", role: "group", "aria-label": "Checks on the data" }, act);
          var tc = LX.Toggle(tg, { label: "2 km cells", on: false, onChange: function (on) { set("coarse", on); } });
          var tn = LX.Toggle(tg, { label: "Add the homes built since " + D.homes.vintage, on: false, onChange: function (on) { set("newer", on); } });
          // one check at a time: switching one on switches the other off
          function set(k, on) {
            if (k === "coarse") { coarse = on; tc.set(on); if (on) { seen.coarse = true; newer = false; tn.set(false); } }
            else { newer = on; tn.set(on); if (on) { seen.newer = true; coarse = false; tc.set(false); } }
            paint();
          }
          var ro = H("div", { class: "lx-readouts", "aria-live": "polite" }, act);
          H("p", { class: "lx-hint", text: TX.limits }, act);
          // a row's button highlights its site on the current map (the cells and homes layer in force); a switch clears it
          var shown = null, tbl = SitesTable(act, function (id) { if (shown) drawRun(map, shown.r, { homes: newer, ghost: shown.ghost, sel: id }); });
          function paint() {
            keep("lim", seen);
            var over = Object.assign({ exclusions: s.ex }, strictOver(D, "solar", s.strict));
            var r = M.run("solar", over, coarse ? { coarse: true } : newer ? { newer: true } : {}), A0 = M.run("solar", over).top[0], f = coarse ? 2 : 1;
            var ghost = (coarse || newer) && A0 ? { i: A0.i / f, j: A0.j / f, k: A0.k / f, label: "was A", key: "Site A before the change (dashed)" } : null;
            shown = { r: r, ghost: ghost }; tbl.sel(null);
            drawRun(map, r, { homes: newer, ghost: ghost });
            tbl.set(tableRows(r), { caption: coarse ? "The five best sites on 2 km cells (km from the city center)" : "The five best sites (km from the city center)", note: coarse ? "Costs need the 1 km cost surface, so this table leaves them out." : null });
            readouts(ro, [["Cells", coarse ? "2 km" : "1 km"], ["Homes layer", newer ? M.D.homes.newer.year : String(D.homes.vintage)], ["Land left", km2(r.X.areaKm2)]]);
            if (seen.coarse && seen.newer) { api.done(); api.saw(s8Saw(M, s.ex, s.strict)); }
          }
          paint();
          act.lxSet = function (k, on) { set(k, on); };
        } }
    ];
    var cards = LX.StepCards(live, { id: "a19-steps", steps: steps });

    LX.demo(root, function (state) {
      var n = state === "mid" ? 3 : +((/^step-(\d+)$/.exec(state) || [])[1] || 0); if (!n) return null;
      var i = Math.max(0, Math.min(steps.length - 1, n - 1));
      cards.go(i);
      setTimeout(function () {
        var host = live.querySelector(".lx-step-act");
        if (!host || !host.lxSet) return;
        if (i === 0) { host.lxSet("protected"); host.lxSet("wind"); host.lxSet("grid"); }   // ends on the grid layer: its table shows
        if (i === 1) host.lxSet("setback", true);
        if (i === 2) host.lxSet("homes", 40);
        if (i === 3) { host.lxSet("neighbours"); host.lxSet("developer"); }
        if (i === 4) { host.lxSet(400); host.lxSet(800); }
        if (i === 5) { host.lxSet("allow"); host.lxSet("forbid"); }
        if (i === 6) { host.lxSet("any"); host.lxSet("spare"); }
        if (i === 7) { host.lxSet("coarse", true); host.lxSet("newer", true); }
        buildExplain();
      }, 60);
      return { view: "step " + (i + 1) };
    }, cards);

    // ---------------------------------------------------------------- the explain layer (the reader's own numbers)
    function buildExplain() {
      var host = document.getElementById("a19-explain"); if (!host) return;
      host.innerHTML = ""; host.classList.add("is-live");
      var s = st(), r = M.run("solar", solarOver(D, s)), top = r.top[0], k0 = r.costs[0];
      var c1 = H("div", { class: "lx-xcard" }, host);
      LX.Flowchart(c1, {
        title: "From layers to a short list", lede: "A screen narrows the map; people and studies take it from there.",
        nodes: { layers: { t: "Layers on one grid", tN: ["Layers on", "one grid"], s: LAYERS.length - 1 + " here, 1 km cells", sN: "1 km cells" },
                 excl: { t: "Exclusions", tN: ["Exclusions"], s: "rules remove land", sN: "rules remove land" },
                 score: { t: "Scores and weights", tN: ["Scores and", "weights"], s: "a weighted overlay", sN: "weighted overlay" },
                 sites: { t: "Sites with room", tN: ["Sites with", "room"], s: "blocks, ranked", sN: "blocks, ranked" },
                 cost: { t: "Costs and checks", tN: ["Costs and", "checks"], s: "line, land, energy", sN: "line, land, energy" },
                 ask: { t: "People agree?", tN: ["People", "agree?"], k: "q" },
                 field: { t: "Field studies, permits", tN: ["Field studies,", "permits"], k: "end" },
                 back: { t: "Back to the weights", tN: ["Back to", "the weights"], k: "end" } },
        cols: 3, colsN: 2,
        at: { layers: [0, 0], excl: [1, 0], score: [2, 0], sites: [2, 1], cost: [1, 1], ask: [1, 2], field: [0, 2], back: [2, 2] },
        atN: { layers: [0, 0], excl: [1, 0], score: [1, 1], sites: [0, 1], cost: [0, 2], ask: [0, 3], back: [1, 3], field: [0, 4] },
        edges: [["layers", "excl"], ["excl", "score"], ["score", "sites"], ["sites", "cost"], ["cost", "ask"], ["ask", "field", "yes"], ["ask", "back", "no"]],
        traces: [{ label: "Your solar run", path: ["layers", "excl", "score", "sites", "cost"], text: top ? "Your rules leave " + km2(r.X.areaKm2) + "; your weights rank site A " + A19.place(M.R, top.i, top.j, top.k) + " first, at " + sc(top.score) + ": " + musd(k0.upfront) + " up front, " + gwh(k0.mwh) + " a year." : r.top.noWeights ? "Your rules leave " + km2(r.X.areaKm2) + "; your weights are all 0, so no site is ranked." : "No block has room with your rules." },
                 { label: "When people disagree", path: ["sites", "cost", "ask", "back"], text: "Neighbors' weights pick another site: the screen goes back to its weights, not to a new map." }]
      });
      var c2 = H("div", { class: "lx-xcard" }, host);
      LX.CompareTable(c2, { title: "Five limits of a suitability map", text: true,
        columns: [{ key: "name", label: "Limit", main: true }, { key: "here", label: "In this lesson" }, { key: "study", label: "What a careful study does" }],
        rows: limitRows(M, s), caption: "The numbers are yours where you changed a setting." });
      var c3 = H("div", { class: "lx-xcard" }, host);
      LX.Boundary(c3, { title: "Where this screen holds",
        lede: "A suitability map is a screening tool: it finds places worth a closer look.",
        holds: ["the layers are current and finer than the rules they apply;", "the exclusions are real rules, and the weights are stated as choices;", "costs are first estimates: a straight new line along the cheapest path, land at a typical price, 2025 dollars."],
        leaves: ["the people who live there, and what they would accept;", "grid studies: whether the network can take the power or the load ([[lesson:a06-interconnection|A6]]);", "two projects sharing one substation's spare capacity, wildlife surveys, title and permits."],
        source: "Prairie City is fictional; its numbers are illustrative. Land per MW, setbacks, slope rules and line costs: NREL and LBNL (Sources)." });
    }
    buildExplain();
  }

  LX.mount("siting", function (live, data, root) { view(live, data, root); });
})();
