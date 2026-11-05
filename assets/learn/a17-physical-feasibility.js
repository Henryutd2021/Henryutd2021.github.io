// a17-physical-feasibility.js — A17, "Will it work on the wires? Voltage, reactive power, inertia, ramps and hosting
// capacity" (step cards, Analyst, wave W4, 2026-11-05). Recognition at depth D2 (curriculum v2 §9.4): what each physical
// limit is, when it binds, and how a plan that balances every hour can miss it.
//
// Data (data-src): a17-physical-feasibility.json (this lesson's illustrative line, feeder, ramp and inertia settings, the
// voltage band with its source, the real-world anchors), m01-dispatch-to-lmp.json (M1's day and its precomputed 12:00
// dispatch with the Ridge–Town limit at 110 MW), 03-balancing.json (lesson 3's Plains Grid) and path.json (lesson links).
//
// Closed-form first estimates only; no power flow is solved beyond M1's DC flows on three buses:
//   apparent power   S = sqrt(P^2 + Q^2) (MVA); current in each wire of a three-phase line I = S / (sqrt(3) V) (A,
//                    with S in MVA and V the line-to-line voltage in kV: I = 1000 S / (sqrt(3) V))
//   feeder voltage   one lumped load (P MW, Q Mvar) at the far end of a feeder with R and X ohms in all:
//                    V_end = V_sub - (R P + X Q) / V^2 per unit (V in kV), the usual linear estimate of the drop; a
//                    negative P (rooftop solar making more than the load) makes it a rise
//   hosting capacity the rooftop solar at the far end that brings V_end to the band's top (1.05 per unit):
//                    pv = (R P_L + X Q_L + (1.05 - V_sub) V^2) / (R - X q), with q = 0 at unity power factor and
//                    q = tan(acos(pf)) when the inverters absorb reactive power at power factor pf
//   AC check         the same feeder solved exactly for its one lumped load (the two-bus quadratic, closed form): it
//                    gives Go deeper's comparison; the gauges show the first estimate and, within band.margin (0.01 per
//                    unit) of a limit, say "near the limit: an AC check decides" (the test checks that every "within" or
//                    "outside" verdict agrees with the AC check)
//   ramp             M1's one-bus day without the ramp rule: the gas plant takes what the flat plant, wind and sun leave
//                    (merit order; M1's linear program gives the same plan, checked in the test); the hour-to-hour changes
//                    against the plant's 40 MW limit
//   inertia          starting rate of change of frequency (lesson 3's rocof) = f0 (dP - help) / (2 E), E in MW·s; the
//                    first-second sketch keeps that slope (no load relief, no governors: lesson 3 bends the line); two
//                    assumed response profiles, not properties of the inverter types: the battery's 50 MW at t = 0
//                    (grid-forming) or after a 0.5 s measurement (grid-following)
// The network values are illustrative (data file); the band is ANSI C84.1 Range A (NREL 2021, Table 1, p. 4).
//
// Lesson-local components (candidates for promotion): LimitGauge (i-gauge: a value on a track with its allowed band,
// role="meter", the value and its state in words) and LimitMap (e-annotated: a one-line diagram with five numbered
// limits and a list of buttons that open what each is, when it binds and what the plan assumed; two layouts).
// Shared components: LX.StepCards, LX.Predict, LX.Slider, LX.Toggle, LX.Plot, LX.Network, LX.CardSort,
// LX.CausalChain, LX.CompareTable, LX.lessonRefHTML.
(function () {
  "use strict";

  // ---------------------------------------------------------------- pure model
  var SQ3 = Math.sqrt(3);
  function apparent(P, Q) { return Math.sqrt(P * P + Q * Q); }
  function amps(S, kV) { return 1000 * S / (SQ3 * kV); }
  function lineCheck(L, P, Q) {
    var S = apparent(P, Q);
    return { P: P, Q: Q, S: S, I: amps(S, L.kV), Irated: amps(L.ratingMVA, L.kV), pct: 100 * S / L.ratingMVA, pf: S > 0 ? P / S : 1, over: S > L.ratingMVA + 1e-9 };
  }
  function qRoom(L, P) { return Math.sqrt(Math.max(0, L.ratingMVA * L.ratingMVA - P * P)); }
  function tanphi(pf) { return Math.sqrt(1 - pf * pf) / pf; }
  function ohms(F) { return { R: F.rOhmPerKm * F.km, X: F.xOhmPerKm * F.km }; }
  function endVolt(F, P, Q) { var z = ohms(F); return F.vSub - (z.R * P + z.X * Q) / (F.kV * F.kV); }
  function evening(F, P) { var Q = P * tanphi(F.loadPF); return { P: P, Q: Q, v: endVolt(F, P, Q) }; }
  function eveningLimit(F, lo) { var z = ohms(F); return (F.vSub - lo) * F.kV * F.kV / (z.R + z.X * tanphi(F.loadPF)); }
  function noon(F, pv, absorb) {
    var QL = F.noonLoadMW * tanphi(F.loadPF), qa = absorb ? pv * tanphi(F.pvAbsorbPF) : 0, P = F.noonLoadMW - pv, Q = QL + qa;
    return { pv: pv, P: P, Q: Q, qa: qa, v: endVolt(F, P, Q) };
  }
  function hosting(F, hi, absorb) {
    var z = ohms(F), QL = F.noonLoadMW * tanphi(F.loadPF), q = absorb ? tanphi(F.pvAbsorbPF) : 0, den = z.R - z.X * q;
    return den > 0 ? (z.R * F.noonLoadMW + z.X * QL + (hi - F.vSub) * F.kV * F.kV) / den : Infinity;
  }
  // the AC check of the same feeder: exact for one constant-power load P + jQ at the far end of R + jX, the substation
  // holding V_sub. |V_end|^2 solves the two-bus quadratic V^4 + (2(RP + XQ) - V_sub^2) V^2 + (R^2 + X^2)(P^2 + Q^2) = 0
  // (kV, MW, Mvar, ohms); the higher root is the normal operating point. NaN past the feeder's maximum transfer.
  function acEnd(F, P, Q) {
    var z = ohms(F), Vs = F.vSub * F.kV, b = Vs * Vs - 2 * (z.R * P + z.X * Q), c = (z.R * z.R + z.X * z.X) * (P * P + Q * Q), disc = b * b - 4 * c;
    return disc >= 0 ? Math.sqrt((b + Math.sqrt(disc)) / 2) / F.kV : NaN;
  }
  function bisect(f, lo, hi) { for (var k = 0; k < 100; k++) { var m = (lo + hi) / 2; if (f(lo) * f(m) <= 0) hi = m; else lo = m; } return (lo + hi) / 2; }
  // the evening load at which the AC check reaches the band's bottom, and the solar at which it reaches the top (null when
  // it does not within the slider's range)
  function acEveningLimit(F, lo) { return bisect(function (p) { var e = evening(F, p); return acEnd(F, e.P, e.Q) - lo; }, 0, 20); }
  function acHosting(F, hi, absorb) {
    var f = function (pv) { var n = noon(F, pv, absorb); return acEnd(F, n.P, n.Q) - hi; };
    return f(F.pv.max) > 0 ? bisect(f, 0, F.pv.max) : null;
  }
  // a first estimate's verdict: within 'margin' per unit of a limit it cannot decide (the AC check does)
  function verdict(v, B) {
    if (v < B.lo - B.margin || v > B.hi + B.margin) return "out";
    if (v < B.lo + B.margin || v > B.hi - B.margin) return "near";
    return "in";
  }
  var STATE = { "in": "within the limit", near: "near the limit: an AC check decides", out: "outside the limit" };
  // DC flows (M1's network): angles with the reference bus at 0, B theta = injections, flow = b (theta_from - theta_to)
  function dcFlows(buses, lines, inj, ref) {
    var ids = buses.filter(function (b) { return b !== ref; }), n = ids.length, A = [], k;
    for (var i = 0; i < n; i++) { A.push([]); for (k = 0; k < n; k++) A[i].push(0); A[i].push(inj[ids[i]] || 0); }
    lines.forEach(function (l) {
      var a = ids.indexOf(l.from), c = ids.indexOf(l.to);
      if (a >= 0) A[a][a] += l.b; if (c >= 0) A[c][c] += l.b;
      if (a >= 0 && c >= 0) { A[a][c] -= l.b; A[c][a] -= l.b; }
    });
    for (i = 0; i < n; i++) {   // Gaussian elimination (the reduced susceptance matrix is positive definite)
      for (var r = i + 1; r < n; r++) { var m = A[r][i] / A[i][i]; for (k = i; k <= n; k++) A[r][k] -= m * A[i][k]; }
    }
    var th = {}; th[ref] = 0;
    for (i = n - 1; i >= 0; i--) { var s = A[i][n]; for (k = i + 1; k < n; k++) s -= A[i][k] * th[ids[k]]; th[ids[i]] = s / A[i][i]; }
    var f = {}; lines.forEach(function (l) { f[l.id] = l.b * (th[l.from] - th[l.to]); });
    return f;
  }
  function flatMW(M1) { var k = Object.keys(M1.fleet).filter(function (g) { return M1.fleet[g].flat; })[0]; return { key: k, mw: M1.fleet[k].mw, bus: M1.fleet[k].bus }; }
  function refBus(M1) { return M1.buses.filter(function (b) { return b.reference; })[0].id; }
  // M1's precomputed 12:00 dispatch as injections per bus: Ridge's wind and sun, the Gas Hub's gas, the town's flat plant
  // minus its demand
  function m1Injections(M1) {
    var R = M1.reference, d = M1.day.demand[R.hour], fl = flatMW(M1), inj = {};
    M1.buses.forEach(function (b) { inj[b.id] = 0; });
    inj[fl.bus] += fl.mw - d; inj[M1.fleet.wind.bus] += R.ridge; inj[M1.fleet.cc.bus] += d - fl.mw - R.ridge;
    return { inj: inj, demand: d, flat: fl.mw, ridge: R.ridge, gas: d - fl.mw - R.ridge, hour: R.hour, limit: R.limit };
  }
  // M1's one-bus day without the ramp rule, by merit order (wind and sun cost nothing, the gas plant $40, the peaker $100)
  function noRamp(M1) {
    var fl = flatMW(M1).mw, cap = M1.fleet.cc.mw;
    return M1.day.demand.map(function (d, t) {
      var need = d - fl - M1.day.wind[t] - M1.day.solar[t], cc = Math.max(0, Math.min(cap, need));
      return { t: t, need: need, cc: cc, pk: Math.max(0, need - cap), spill: Math.max(0, -need) };
    });
  }
  function changes(plan) { return plan.slice(1).map(function (h, i) { return { from: i, to: i + 1, d: h.cc - plan[i].cc }; }); }
  function overs(plan, lim) { return changes(plan).filter(function (c) { return Math.abs(c.d) > lim + 1e-9; }); }
  // inertia: E in GW·s; help in MW
  function rocof(G, E, help) { return G.f0 * (G.tripMW - (help || 0)) / (2 * E * 1000); }
  function startRocof(G, E, mode) { return rocof(G, E, mode === "gfm" ? G.ffrMW : 0); }
  function sketch(G, I, E, mode, t) {
    var r0 = rocof(G, E, 0), r1 = rocof(G, E, G.ffrMW);
    if (mode === "none") return G.f0 - r0 * t;
    if (mode === "gfm") return G.f0 - r1 * t;
    return G.f0 - r0 * Math.min(t, I.delayS) - r1 * Math.max(0, t - I.delayS);
  }
  function fmtN(v, d) { return (v < 0 ? "−" : "") + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
  function pu(v) { return v.toFixed(3); }
  function hh(t) { return (t < 10 ? "0" : "") + t + ":00"; }
  function signed(v) { return (v > 0 ? "+" : v < 0 ? "−" : "") + fmtN(Math.abs(v)); }
  // the reader's numbers in one place (defaults when a step was not done): every figure of the explain layer. A solar
  // setting of 0 is the reader's own; with none set, the chain shows the hosting capacity of the chosen inverter setting.
  function summary(A, M1, G, st) {
    st = st || {};
    var L = A.line, F = A.feeder, B = A.band, inj = m1Injections(M1);
    var q = st.q != null ? st.q : L.q.start, ln = lineCheck(L, inj.limit, q);
    var ev = evening(F, st.ev != null ? st.ev : F.evening.start), absorb = !!st.absorb;
    var h0 = hosting(F, B.hi, false), h1 = hosting(F, B.hi, true), E = st.E != null ? st.E : G.inertia.start;
    var pvSet = st.pv != null, pvv = pvSet ? st.pv : (absorb ? h1 : h0);
    var plan = noRamp(M1), ov = overs(plan, A.ramp.limitMWh);
    return { inj: inj, line: ln, qRoom: qRoom(L, inj.limit), ev: ev, evState: verdict(ev.v, B), evLimit: eveningLimit(F, B.lo), pv: pvv, pvSet: pvSet, absorb: absorb,
             noon: noon(F, pvv, absorb), host: h0, hostAbsorb: h1, E: E, r0: rocof(G, E, 0), r1: rocof(G, E, G.ffrMW), plan: plan, overs: ov };
  }

  // ---------------------------------------------------------------- the words the page shows (pure, tested for every input)
  function heatSaw(A, M1, q) {
    var L = A.line, inj = m1Injections(M1), c = lineCheck(L, inj.limit, q);
    return "At **" + q + " Mvar** the line carries **" + fmtN(c.S, 1) + " MVA, " + fmtN(c.pct) + "% of its rating**" +
      (c.over ? ": past its assumed continuous rating, though the DC plan shows " + inj.limit + " MW. Kept up, that can overheat the wires." :
                ". Above about " + fmtN(qRoom(L, inj.limit)) + " Mvar it would pass its rating, though the DC plan would still show " + inj.limit + " MW.");
  }
  function heatRev(A, M1, pred) {
    var L = A.line, inj = m1Injections(M1);
    return "Your prediction: " + (pred ? (pred === "q" ? "right." : "not quite.") : "none.") + " The DC plan counts MW only; heating follows MVA. Up to about " + fmtN(qRoom(L, inj.limit)) + " Mvar, " + inj.limit + " MW fits within " + L.ratingMVA + " MVA.";
  }
  function sagSaw(A, p) {
    var F = A.feeder, B = A.band, e = evening(F, p), s = verdict(e.v, B);
    return "At **" + fmtN(p, 1) + " MW** the first estimate reads **" + pu(e.v) + " per unit**" +
      (s === "out" ? (e.v < B.lo ? ", below the band." : ", above the band.") : s === "near" ? ", too close to " + (e.v < 1 ? B.lo : B.hi).toFixed(2) + " to call: an AC check decides." : ", within the band.") +
      " It puts the limit near " + fmtN(eveningLimit(F, B.lo), 1) + " MW, though the energy plan serves every MW.";
  }
  function noonSaw(A, pv) {
    var F = A.feeder, B = A.band, n = noon(F, pv, false);
    return "The first estimate puts the [[hosting-capacity|hosting capacity]] near **" + fmtN(hosting(F, B.hi, false), 1) + " MW** of solar: above it, the far end leaves the band" +
      (n.v > B.hi ? " (now " + pu(n.v) + " per unit)." : ".") + " The substation's " + F.vSub.toFixed(2) + ", chosen for the evening, leaves little room at noon.";
  }
  function absorbSaw(A) {
    var F = A.feeder, B = A.band;
    return "Absorbing reactive power moves the first estimate of the hosting capacity from **" + fmtN(hosting(F, B.hi, false), 1) + " to " + fmtN(hosting(F, B.hi, true), 1) + " MW** here. The cost: more current in the feeder's wires, and a voltage check the energy plan never ran.";
  }
  function rampSaw(A, M1) {
    var ov = overs(noRamp(M1), A.ramp.limitMWh);
    return "**" + ov.length + " changes** break the " + A.ramp.limitMWh + " MW limit: " + ov.map(function (c) { return signed(c.d) + " MW into " + hh(c.to); }).join(", ") +
      ". [[lesson:m01-dispatch-to-lmp|M1]]'s ramp rule fixes them: climbs start earlier, the peaker runs, or wind and sun are spilled.";
  }
  function rocofSaw(G, E) {
    return "At **" + E + " GW·s** frequency starts falling at **" + rocof(G, E).toFixed(2) + " Hz per second**. With " + G.inertia.min + " GW·s it would fall " + fmtN(rocof(G, G.inertia.min) / rocof(G, G.inertia.max)) + " times as fast as with " + G.inertia.max + " GW·s.";
  }
  function invSaw(G, I, E) {
    return "With these assumed responses at " + E + " GW·s, the grid-forming battery halves the starting fall, to **" + rocof(G, E, G.ffrMW).toFixed(2) + " Hz per second**; the grid-following one helps only after " + I.delayS + " s.";
  }
  function sortSaw(right, total) {
    return "**" + right + " of " + total + "** in the right box. Three need an AC check of voltage and reactive power, one a ramp check, one a check of the first seconds.";
  }
  // the hints under each step's controls
  function hints(A, M1, G) {
    var L = A.line, F = A.feeder, B = A.band, inj = m1Injections(M1);
    return {
      plan: "From [[lesson:m01-dispatch-to-lmp|M1]]: its precomputed plan for " + hh(inj.hour) + ", with the Ridge–Town line limited to " + inj.limit + " MW.",
      reactive: "[[reactive-power|Reactive power]], counted in Mvar (megavolt-amperes reactive), flows back and forth with the MW: it moves no net energy, but it adds current.",
      line: "Illustrative: a " + L.kV + " kV line rated " + L.ratingMVA + " MVA, about " + fmtN(amps(L.ratingMVA, L.kV)) + " A in each wire. [[power-factor|Power factor]] = MW ÷ MVA.",
      band: "The band is ANSI's normal range, [[service-voltage-range|" + B.volts[0] + " to " + B.volts[1] + " V]] on a " + B.nominalV + " V service: " + B.lo.toFixed(2) + " to " + B.hi.toFixed(2) + " [[per-unit|per unit]].",
      estimate: "The gauge shows a first estimate: within " + B.margin.toFixed(2) + " per unit of a limit, only an AC check can decide.",
      noon: "Same feeder: the substation holds " + F.vSub.toFixed(2) + " per unit, set for the evening peak. Load at noon: " + fmtN(F.noonLoadMW, 1) + " MW at a power factor of " + F.loadPF.toFixed(2) + " (illustrative).",
      ramp: "The gas plant can change its output by at most " + A.ramp.limitMWh + " MW from one hour to the next (lesson 0's town, illustrative). Day: " + M1.day.label + ", Southwest Power Pool shapes scaled to Prairie Town.",
      sketch: "A sketch of the first second: the starting slope held, before load relief and governors bend the line (lesson 3).",
      inverters: "Assumed responses, not guarantees: a real inverter's help depends on its controls, its spare power and its current limits.",
      stored: function (E) { return "Stored energy: " + E + " GW·s, from the last step."; }
    };
  }
  // the explain layer's map: what each limit is, when it binds here, what the plan assumed
  function mapItems(A, M1, G, s) {
    var B = A.band, evWords = { "in": "within the band", near: "near the limit", out: "below the band" };
    return [
      { key: "thermal", title: "A line's heating", what: "A wire's [[thermal-rating|thermal rating]] caps the current it can carry, so it counts MVA, not MW.",
        binds: "Above about " + fmtN(s.qRoom) + " Mvar with " + s.inj.limit + " MW; at your " + s.line.Q + " Mvar it runs at " + fmtN(s.line.pct) + "%.", missed: "M1's DC plan carries MW only, with every voltage at 1.0 [[per-unit|per unit]]." },
      { key: "sag", title: "Voltage sag on a feeder", what: "Power drawn through a feeder's resistance and reactance lowers the voltage toward its far end.",
        binds: "Near " + fmtN(s.evLimit, 1) + " MW by the first estimate; at your " + fmtN(s.ev.P, 1) + " MW it reads " + pu(s.ev.v) + " per unit, " + (s.ev.v > B.hi ? "above the band" : evWords[s.evState]) + ".", missed: "M1's plan omits feeders: every MW served counts the same." },
      { key: "rise", title: "Voltage rise: hosting capacity", what: "Rooftop solar that makes more than the homes use sends power back up the feeder, and the far end's voltage rises.",
        binds: "Near " + fmtN(s.host, 1) + " MW of solar by the first estimate (" + fmtN(s.hostAbsorb, 1) + " MW with absorbing inverters).", missed: "The plan adds rooftop solar as MW in a zone, not on a feeder." },
      { key: "ramp", title: "A ramp the plan assumed", what: "A plant can change its output only so fast.",
        binds: s.overs.length + " hour-to-hour changes over " + A.ramp.limitMWh + " MW on " + M1.day.label + " without the rule.", missed: "Without a ramp rule, an hourly plan lets output jump from one hour to the next." },
      { key: "rocof", title: "The first seconds after a trip", what: "[[inertia|Inertia]] and fast inverters set how fast frequency falls before governors act.",
        binds: "At your " + s.E + " GW·s: " + s.r0.toFixed(2) + " Hz per second, or " + s.r1.toFixed(2) + " with a battery assumed to answer at once.", missed: "An hourly plan balances MWh; the first seconds are not in it." }
    ];
  }
  // the explain layer's chain for midday solar, true for the reader's setting (zero included)
  function solarChain(A, s) {
    var F = A.feeder, B = A.band, n = s.noon, st = verdict(n.v, B), back = n.P < 0, rise = n.v > F.vSub;
    var links = [
      { title: "Sun at noon", text: s.pv > 0 ? "Panels at the feeder's far end make " + fmtN(s.pv, 2) + " MW." : "No rooftop solar runs at the far end.", value: fmtN(s.pv, 2) + " MW" },
      back ? { title: "More than the homes use", text: "The far end uses " + fmtN(F.noonLoadMW, 1) + " MW, so the rest flows back up the feeder.", value: fmtN(-n.P, 2) + " MW back" } :
             { title: "No more than the homes use", text: "The far end uses " + fmtN(F.noonLoadMW, 1) + " MW, so power still flows out to it.", value: "none back" },
      rise ? { title: "Voltage rises", text: "Power flowing back through the wires lifts the far end above the substation's " + F.vSub.toFixed(2) + ".", value: pu(n.v) + " per unit" } :
             { title: "Voltage stays lower", text: (back ? "The reactive power drawn outweighs the solar's lift" : "With power still flowing out") + ", the far end stays below the substation's " + F.vSub.toFixed(2) + ".", value: pu(n.v) + " per unit" },
      st === "out" ? { title: "Past the band's top", text: "Above " + B.hi.toFixed(2) + " per unit (" + B.volts[1] + " V on a " + B.nominalV + " V service), the voltage leaves ANSI's normal range.", value: "outside" } :
      st === "near" ? { title: "Close to the band's top", text: "Within " + B.margin.toFixed(2) + " per unit of " + B.hi.toFixed(2) + ", a first estimate cannot decide; an AC check would.", value: "near" } :
                      { title: "Inside the band", text: "Below " + B.hi.toFixed(2) + " per unit (" + B.volts[1] + " V on a " + B.nominalV + " V service), the voltage stays in ANSI's normal range.", value: "within" },
      { title: "The hosting capacity", text: "By the first estimate this feeder takes about this much solar; more needs absorbing inverters, a new regulator plan or new wires.", value: fmtN(s.absorb ? s.hostAbsorb : s.host, 1) + " MW" }
    ];
    var note = (s.pvSet ? "Your solar: " + fmtN(s.pv, 2) + " MW" : "No solar set yet: the chain shows the hosting capacity") + (s.absorb ? ", with inverters absorbing reactive power." : ", inverters at a power factor of 1.");
    return { links: links, note: note };
  }
  // the no-JS block: the five checks at the lesson's default settings
  function staticFallback(A, M1, G) {
    var L = A.line, F = A.feeder, B = A.band, inj = m1Injections(M1), ln = lineCheck(L, inj.limit, 50), room = qRoom(L, inj.limit);
    var evL = eveningLimit(F, B.lo), h0 = hosting(F, B.hi, false), h1 = hosting(F, B.hi, true), ov = overs(noRamp(M1), A.ramp.limitMWh);
    var lo = G.inertia.min, hi = G.inertia.max;
    var rows = [
      ["A line's heating", "M1's Ridge–Town line carries " + inj.limit + " MW at 12:00, its MW limit. Rated " + L.ratingMVA + " MVA at " + L.kV + " kV (illustrative), it passes that rating above " + fmtN(room) + " Mvar of reactive power (at 50 Mvar: " + fmtN(ln.S, 1) + " MVA, " + fmtN(ln.pct) + "%)."],
      ["Voltage drop", "A " + F.kV + " kV feeder, " + F.km + " km long (illustrative): a first estimate puts its far end below " + B.lo.toFixed(2) + " per unit (" + B.volts[0] + " V of " + B.nominalV + " V) above " + fmtN(evL, 1) + " MW of evening load. An AC check puts that limit near " + fmtN(acEveningLimit(F, B.lo), 1) + " MW."],
      ["Hosting capacity", "At noon (" + fmtN(F.noonLoadMW, 1) + " MW of load), a first estimate puts the far end over " + B.hi.toFixed(2) + " per unit (" + B.volts[1] + " V) above " + fmtN(h0, 1) + " MW of rooftop solar; inverters absorbing reactive power (power factor " + F.pvAbsorbPF.toFixed(2) + ") raise that to " + fmtN(h1, 1) + " MW."],
      ["A ramp", "Without M1's ramp rule the gas plant is asked to change by " + ov.map(function (c) { return signed(c.d) + " MW into " + hh(c.to); }).join(", ") + "; it can change by " + A.ramp.limitMWh + " MW an hour (illustrative)."],
      ["Inertia", "After a " + G.tripMW + " MW trip on lesson 3's Plains Grid, frequency starts falling at " + fmtN(rocof(G, hi), 2) + " Hz per second with " + hi + " GW·s of stored rotational energy, and at " + fmtN(rocof(G, lo), 2) + " with " + lo + " GW·s."],
      ["Inertia: inverters' help", "A battery assumed to give " + G.ffrMW + " MW at once (grid-forming) halves that starting fall; one assumed to wait " + A.inertia.delayS + " s (grid-following) helps only after that. Real responses depend on controls, spare power and current limits."]
    ];
    return "<p class=\"lx-eyebrow\">Five checks a plan that balances every hour can still fail (illustrative network)</p><div class=\"lx-scroll-x\"><table class=\"lx-facts a17-fb\"><thead><tr><th scope=\"col\">Limit</th><th scope=\"col\">In this lesson</th></tr></thead><tbody>" +
      rows.map(function (r) { return "<tr><th scope=\"row\">" + r[0] + "</th><td>" + r[1] + "</td></tr>"; }).join("") + "</tbody></table></div>";
  }
  var model = { apparent: apparent, amps: amps, lineCheck: lineCheck, qRoom: qRoom, tanphi: tanphi, ohms: ohms, endVolt: endVolt, evening: evening, eveningLimit: eveningLimit,
    noon: noon, hosting: hosting, dcFlows: dcFlows, flatMW: flatMW, refBus: refBus, m1Injections: m1Injections, noRamp: noRamp, changes: changes, overs: overs,
    rocof: rocof, startRocof: startRocof, sketch: sketch, summary: summary, staticFallback: staticFallback, fmtN: fmtN, pu: pu, hh: hh, signed: signed,
    acEnd: acEnd, acEveningLimit: acEveningLimit, acHosting: acHosting, verdict: verdict, STATE: STATE, heatSaw: heatSaw, heatRev: heatRev, sagSaw: sagSaw,
    noonSaw: noonSaw, absorbSaw: absorbSaw, rampSaw: rampSaw, rocofSaw: rocofSaw, invSaw: invSaw, sortSaw: sortSaw, hints: hints, mapItems: mapItems, solarChain: solarChain };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H, S = LX.S;

  // ---- LimitGauge (i-gauge, lesson-local): a value on a track; the allowed band shaded; the state said in words
  // o: { label, min, max, lo, hi (null for one-sided; both null: no limit, no state words), margin (a first estimate's
  //      undecided band around each limit: "near the limit"), unit, fmt(v), tick(v), ticks: [v] }; set(v) returns
  //      "in", "near" or "out"
  function LimitGauge(host, o) {
    var w = H("div", { class: "a17g" }, host), id = LX.uid("g");
    var head = H("div", { class: "a17g-h" }, w);
    H("span", { class: "a17g-l", id: id, text: o.label }, head);
    var val = H("b", { class: "a17g-v" }, head), st = H("span", { class: "a17g-s" }, head);
    var svg = S("svg", { class: "a17g-svg", viewBox: "0 0 300 40", role: "meter", "aria-labelledby": id, "aria-valuemin": o.min, "aria-valuemax": o.max }, w);
    var X = function (v) { return 8 + 284 * (LX.clamp(v, o.min, o.max) - o.min) / (o.max - o.min); };
    S("rect", { class: "a17g-track", x: 8, y: 10, width: 284, height: 10, rx: 5 }, svg);
    var lo = o.lo == null ? o.min : o.lo, hi = o.hi == null ? o.max : o.hi, free = o.lo == null && o.hi == null;
    if (free) w.classList.add("free");
    else S("rect", { class: "a17g-band", x: X(lo), y: 10, width: Math.max(0, X(hi) - X(lo)), height: 10, rx: 3 }, svg);
    [o.lo, o.hi].forEach(function (b) { if (b != null) S("path", { class: "a17g-lim", d: "M" + X(b) + " 6 V24" }, svg); });
    (o.ticks || []).forEach(function (t) { S("text", { class: "a17g-t", x: X(t), y: 37 }, svg).textContent = (o.tick || o.fmt)(t); });
    var needle = S("path", { class: "a17g-n", d: "" }, svg);
    function set(v) {
      var m = o.margin || 0, x = X(v);
      var state = free ? "in" : m ? verdict(v, { lo: o.lo == null ? -Infinity : o.lo, hi: o.hi == null ? Infinity : o.hi, margin: m }) :
        ((o.lo != null && v < o.lo - 1e-9) || (o.hi != null && v > o.hi + 1e-9) ? "out" : "in");
      needle.setAttribute("d", "M" + x + " 4 V26 M" + (x - 5) + " 2 H" + (x + 5) + " L" + x + " 8 Z");
      w.classList.toggle("bad", state === "out"); w.classList.toggle("near", state === "near");
      var u = o.unit ? (o.unit === "%" ? "%" : " " + o.unit) : "";
      val.textContent = o.fmt(v) + u;
      st.textContent = free ? "" : STATE[state];
      svg.setAttribute("aria-valuenow", String(Math.round(v * 1000) / 1000));
      svg.setAttribute("aria-valuetext", o.fmt(v) + u + (free ? "" : ", " + st.textContent));
      return state;
    }
    return { el: w, set: set };
  }
  function readouts(host, rows) {
    host.innerHTML = "";
    rows.forEach(function (r) { var c = H("div", { class: "lx-readout" + (r[2] ? " " + r[2] : "") }, host); H("span", { text: r[0] }, c); H("b", { text: r[1] }, c); });
  }
  function seg(host, label, items, sel, onPick) {
    var g = H("div", { class: "lx-seg", role: "group", "aria-label": label }, host), btns = {};
    items.forEach(function (it) {
      var b = H("button", { type: "button", text: it.label, "aria-pressed": String(it.key === sel) }, g);
      b.addEventListener("click", function () { onPick(it.key); });
      btns[it.key] = b;
    });
    return { el: g, set: function (k) { Object.keys(btns).forEach(function (x) { btns[x].setAttribute("aria-pressed", String(x === k)); }); } };
  }

  // ---- LimitMap (e-annotated, lesson-local): one line diagram, five numbered limits, a list of buttons beside it
  var MAP = {
    wide: { w: 620, h: 240, R: [60, 60], G: [60, 170], T: [250, 115], sub: [360, 115], end: [540, 115], dial: [250, 190],
      n: { thermal: [155, 70], sag: [450, 85], rise: [540, 70], ramp: [100, 190], rocof: [300, 190] } },
    narrow: { w: 340, h: 360, R: [50, 50], G: [290, 50], T: [170, 140], sub: [170, 205], end: [170, 320], dial: [290, 205],
      n: { thermal: [95, 110], sag: [140, 265], rise: [215, 305], ramp: [305, 85], rocof: [245, 205] } }
  };
  function LimitMap(host, o) {
    var w = H("div", { class: "a17m" }, host), fig = H("div", { class: "a17m-fig" }, w), side = H("div", { class: "a17m-side" }, w);
    var list = H("ol", { class: "a17m-list" }, side), panel = H("div", { class: "a17m-panel", "aria-live": "polite" }, side), sel = o.sel || o.items[0].key, btns = {}, mode = null;
    o.items.forEach(function (it, i) {
      var b = H("button", { type: "button", class: "a17m-b", "aria-pressed": "false" }, H("li", null, list));
      H("span", { class: "a17m-k", text: String(i + 1) }, b); H("span", { text: it.title }, b);
      b.addEventListener("click", function () { pick(it.key); if (o.onPick) o.onPick(it.key); });
      btns[it.key] = b;
    });
    function draw() {
      var L = fig.clientWidth < 520 ? MAP.narrow : MAP.wide, s = "";
      mode = L === MAP.narrow;
      var ln = function (a, b, cls) { return '<path class="' + cls + '" d="M' + a[0] + " " + a[1] + " L" + b[0] + " " + b[1] + '"/>'; };
      s += ln(L.R, L.T, "a17m-tx" + (sel === "thermal" ? " on" : "")) + ln(L.G, L.T, "a17m-tx") + ln(L.R, L.G, "a17m-tx");
      s += ln(L.T, L.sub, "a17m-xf") + ln(L.sub, L.end, "a17m-fd" + (sel === "sag" || sel === "rise" ? " on" : ""));
      [["R", "Wind Ridge"], ["G", "Gas Hub"], ["T", "Town"]].forEach(function (b) { var p = L[b[0]]; s += '<circle class="a17m-bus" cx="' + p[0] + '" cy="' + p[1] + '" r="9"/><text class="a17m-lab" x="' + p[0] + '" y="' + (p[1] - 15) + '">' + b[1] + "</text>"; });
      s += '<rect class="a17m-sub" x="' + (L.sub[0] - 14) + '" y="' + (L.sub[1] - 14) + '" width="28" height="28" rx="4"/><text class="a17m-lab" x="' + L.sub[0] + '" y="' + (L.sub[1] - 20) + '">Substation</text>';
      s += '<path class="a17m-home" d="M' + (L.end[0] - 14) + " " + (L.end[1] + 14) + " V" + L.end[1] + " L" + L.end[0] + " " + (L.end[1] - 12) + " L" + (L.end[0] + 14) + " " + L.end[1] + " V" + (L.end[1] + 14) + ' Z"/><text class="a17m-lab" x="' + L.end[0] + '" y="' + (L.end[1] + 32) + '">Far end: homes, solar</text>';
      s += '<circle class="a17m-dial" cx="' + L.dial[0] + '" cy="' + L.dial[1] + '" r="16"/><path class="a17m-dn" d="M' + L.dial[0] + " " + L.dial[1] + " l8 -8" + '"/><text class="a17m-lab" x="' + L.dial[0] + '" y="' + (L.dial[1] + 32) + '">Frequency</text>';
      o.items.forEach(function (it, i) { var p = L.n[it.key]; s += '<g class="a17m-num' + (it.key === sel ? " on" : "") + '"><circle cx="' + p[0] + '" cy="' + p[1] + '" r="12"/><text x="' + p[0] + '" y="' + (p[1] + 4.5) + '">' + (i + 1) + "</text></g>"; });
      fig.innerHTML = '<svg class="a17m-svg" viewBox="0 0 ' + L.w + " " + L.h + '" role="img" aria-label="' + LX.esc(o.aria) + '">' + s + "</svg>";
    }
    function pick(k) {
      sel = k; Object.keys(btns).forEach(function (x) { btns[x].setAttribute("aria-pressed", String(x === k)); });
      var it = o.items.filter(function (x) { return x.key === k; })[0];
      panel.innerHTML = "";
      H("p", { class: "a17m-t", html: "<b>" + LX.esc(it.title) + "</b>" }, panel);
      var dl = H("dl", { class: "a17m-dl" }, panel);
      [["What it is", it.what], ["When it binds here", it.binds], ["What the plan assumed", it.missed]].forEach(function (r) { H("dt", { text: r[0] }, dl); H("dd", { html: LX.rich(r[1]) }, dl); });
      draw();
    }
    pick(sel);
    var ro = window.ResizeObserver ? new ResizeObserver(function () { var nw = fig.clientWidth < 520; if (nw !== mode) draw(); }) : null;
    if (ro) ro.observe(fig);
    var alt = H("details", { class: "lx-textalt" }, w); H("summary", { text: "Text version of the diagram" }, alt);
    var ol = H("ol", null, alt);
    o.items.forEach(function (it) { H("li", { html: "<b>" + LX.esc(it.title) + ".</b> " + LX.rich(it.what + " " + it.binds + " " + it.missed) }, ol); });
    return { el: w, pick: pick, sel: function () { return sel; }, stop: function () { if (ro) ro.disconnect(); } };
  }

  function view(live, data, root) {
    var A = data.a17_physical_feasibility, M1 = data.m01_dispatch_to_lmp, G = data["03_balancing"].grid, P = data.path;
    var L = A.line, F = A.feeder, B = A.band, I = A.inertia, R = A.real;
    var log = LX.store.get("a17-log", {}) || {}, refreshT = null, TX = hints(A, M1, G);
    // every saved setting refreshes the explain layer, so it never shows stale numbers (debounced while a slider moves)
    function keep(k, v) { log[k] = v; LX.store.set("a17-log", log); clearTimeout(refreshT); refreshT = setTimeout(buildExplain, 120); }
    var inj = m1Injections(M1), room = qRoom(L, inj.limit), evL = eveningLimit(F, B.lo), h0 = hosting(F, B.hi, false), h1 = hosting(F, B.hi, true);
    var plan = noRamp(M1), ov = overs(plan, A.ramp.limitMWh), flows = dcFlows(M1.buses.map(function (b) { return b.id; }), M1.lines, inj.inj, refBus(M1));
    var POS = { R: [78, 62], G: [282, 62], T: [180, 238] };
    function volts(v) { return fmtN(v * B.nominalV, 1) + " V"; }

    function network(host, full) {
      var net = LX.Network(host, { label: "M1's three buses at 12:00: Wind Ridge, Gas Hub and Prairie Town, joined by three lines, with each line's flow.",
        buses: M1.buses.map(function (b) {
          return { id: b.id, name: b.name, short: b.short, color: b.color, at: POS[b.id],
            note: b.id === "R" ? "sends " + inj.ridge + " MW" : b.id === "G" ? "sends " + inj.gas + " MW" : "uses " + inj.demand + " MW", desc: b.id === "T" ? "uses " + inj.demand + " MW and makes " + inj.flat : null };
        }),
        lines: M1.lines.map(function (l) {
          var a = POS[l.from], c = POS[l.to], mx = (a[0] + c[0]) / 2, my = (a[1] + c[1]) / 2;
          return { id: l.id, from: l.from, to: l.to, name: l.name, labelAt: l.id === "RT" ? [mx - 14, my - 4, "end"] : l.id === "GT" ? [mx + 14, my - 4, "start"] : [mx, 18, "middle"] };
        }) });
      var lim = {}; M1.lines.forEach(function (l) { lim[l.id] = l.id === L.id ? inj.limit : l.limit; });
      var fl = {}; Object.keys(flows).forEach(function (k) { fl[k] = Math.round(flows[k]); });
      net.set({ h: { flow: fl, full: full || {} }, lim: lim });
      return net;
    }

    var steps = [
      { text: "A plan for noon balances on three [[bus|buses]], the network's connection points. Its [[dc-power-flow|DC power flow]], a model that counts MW only, puts the Ridge–Town line exactly at its " + Math.round(flows[L.id]) + " MW limit. Will it hold?",
        build: function (act, api) {
          var full = {}; full[L.id] = Math.abs(flows[L.id]) >= inj.limit - 1e-6; network(H("div", { class: "a17-net" }, act), full);
          readouts(H("div", { class: "lx-readouts" }, act), [["Wind Ridge", inj.ridge + " MW"], ["Gas Hub", inj.gas + " MW"], ["Town's own plant", inj.flat + " MW"], ["Town's demand", inj.demand + " MW"]]);
          H("p", { class: "lx-hint", html: LX.rich(TX.plan) }, act);
          H("p", { class: "lx-hint", html: LX.rich(TX.reactive) }, act);
          LX.Predict(act, { id: "a17-hold", answer: "q", lockText: "Locked in. The next step shows the answer.",
            options: [{ value: "yes", label: "Yes: it is within its limit" }, { value: "q", label: "Only if little reactive power flows with it" }, { value: "no", label: "No: a line at its limit always fails" }],
            onPick: function (v) { keep("pred", v); api.done(); } });
          if (log.pred) api.done();
        } },
      { text: "Wires heat with [[electric-current|current]], and [[reactive-power|reactive power]] adds current just as MW do. This line's rating, " + L.ratingMVA + " MVA of [[apparent-power|apparent power]], is its current limit at " + L.kV + " kV. Slide the reactive power on it.",
        build: function (act, api) {
          var tried = {}, box = H("div", { class: "a17-box" }, act);
          var gauge = LimitGauge(box, { label: "Share of the line's thermal rating", min: 0, max: 130, hi: 100, unit: "%", fmt: function (v) { return fmtN(v); }, ticks: [0, 50, 100, 130] });
          var ro = H("div", { class: "lx-readouts", "aria-live": "polite" }, box);
          var sl = LX.Slider(box, { label: "Reactive power on the line", color: "var(--lx-tier-2)", min: L.q.min, max: L.q.max, step: L.q.step, value: log.q != null ? log.q : L.q.start,
            fmt: function (v) { return v + " Mvar"; }, onChange: function (v) { paint(v, true); } });
          H("p", { class: "lx-hint", html: LX.rich(TX.line) }, box);
          var rev = H("p", { class: "a17-rev", "aria-live": "polite" }, act);
          function paint(q, user) {
            var c = lineCheck(L, inj.limit, q); gauge.set(c.pct);
            readouts(ro, [["Real power", fmtN(c.P) + " MW"], ["Apparent power", fmtN(c.S, 1) + " MVA", c.over ? "bad" : ""], ["Current in each wire", fmtN(c.I) + " A of " + fmtN(c.Irated) + " A", c.over ? "bad" : ""], ["Power factor", c.pf.toFixed(2)]]);
            if (user) { keep("q", q); tried[q] = true; }
            if (Object.keys(tried).length >= 2) {
              api.done();
              api.saw(heatSaw(A, M1, q));
              rev.innerHTML = LX.rich(heatRev(A, M1, log.pred)).replace(/^(Your prediction: [a-z ]+\.)/, "<b>$1</b>");
            }
          }
          paint(sl.val(), false);
          act.lxSet = function (v) { sl.set(v); paint(v, true); };
        } },
      { text: "Down on a [[feeder|feeder]], [[voltage|voltage]] sags with distance: power drawn through the wires' resistance and [[reactance|reactance]] pulls the far end down. Raise the evening load at the far end of Prairie Town's north feeder.",
        build: function (act, api) {
          var tried = {}, box = H("div", { class: "a17-box" }, act);
          var z = ohms(F);
          readouts(H("div", { class: "lx-readouts" }, box), [["North feeder (illustrative)", F.kV + " kV, " + F.km + " km"], ["Resistance, reactance", fmtN(z.R, 1) + " Ω, " + fmtN(z.X, 1) + " Ω"], ["Substation holds", F.vSub.toFixed(2) + " per unit"], ["Load power factor", F.loadPF.toFixed(2)]]);
          var gauge = LimitGauge(box, { label: "Voltage at the far end, first estimate, in per unit", min: 0.9, max: 1.1, lo: B.lo, hi: B.hi, margin: B.margin, fmt: function (v) { return v.toFixed(3); }, tick: function (v) { return v.toFixed(2); }, ticks: [0.9, 0.95, 1, 1.05, 1.1] });
          var ro = H("div", { class: "lx-readouts", "aria-live": "polite" }, box);
          var sl = LX.Slider(box, { label: "Evening load at the far end", color: "var(--lx-demand)", min: F.evening.min, max: F.evening.max, step: F.evening.step, value: log.ev != null ? log.ev : F.evening.start,
            fmt: function (v) { return fmtN(v, 1) + " MW"; }, onChange: function (v) { paint(v, true); } });
          H("p", { class: "lx-hint", html: LX.rich(TX.band) }, box);
          H("p", { class: "lx-hint", html: LX.rich(TX.estimate) }, box);
          function paint(p, user) {
            var e = evening(F, p), state = gauge.set(e.v), cls = state === "out" ? "bad" : state === "near" ? "warn" : "";
            readouts(ro, [["Load", fmtN(e.P, 1) + " MW + " + fmtN(e.Q, 2) + " Mvar"], ["Far end, first estimate", pu(e.v) + " per unit", cls], ["On a " + B.nominalV + " V service", volts(e.v), cls]]);
            if (user) { keep("ev", p); tried[p] = true; }
            if (Object.keys(tried).length >= 2) { api.done(); api.saw(sagSaw(A, p)); }
          }
          paint(sl.val(), false);
          act.lxSet = function (v) { sl.set(v); paint(v, true); };
        } },
      { text: "At noon the feeder serves only " + fmtN(F.noonLoadMW, 1) + " MW, and homes at its far end add rooftop solar. Their surplus flows back up the feeder and lifts the far end's voltage. Add solar until it tops " + B.hi.toFixed(2) + ".",
        build: function (act, api) { noonStep(act, api, false); } },
      { text: "Smart [[inverter|inverters]] can also absorb reactive power, which pulls voltage down. Set the solar inverters to absorb it at a [[power-factor|power factor]] of " + F.pvAbsorbPF.toFixed(2) + " and watch the [[hosting-capacity|hosting capacity]] move.",
        build: function (act, api) { noonStep(act, api, true); } },
      { text: "Now M1's whole day on one bus, with no [[ramp-rate|ramp]] rule: the gas plant takes whatever wind, sun and the town's flat " + inj.flat + " MW plant leave. Pick an hour: what change must it make?",
        build: function (act, api) { rampStep(act, api); } },
      { text: "A " + G.tripMW + " MW plant trips on lesson 3's Plains Grid. [[inertia|Inertia]], energy stored in spinning machines, sets how fast frequency starts to fall. Cut it, as when inverter-based plants replace spinning ones.",
        build: function (act, api) { inertiaStep(act, api, false); } },
      { text: "A battery with " + G.ffrMW + " MW to spare can help. A [[grid-following|grid-following]] inverter acts on the change it measures; a [[grid-forming|grid-forming]] one holds its own voltage and can answer at once. Compare two assumed responses.",
        build: function (act, api) { inertiaStep(act, api, true); } },
      { text: "Each of these limits was invisible to a plan that balanced every hour. Sort them by the check that would have caught each.",
        build: function (act, api) {
          var cs = LX.CardSort(act, { bins: A.sort.bins, cards: A.sort.cards, checkLabel: "Check my sort",
            onCheck: function (g) {
              keep("sorted", g.right); api.done();
              api.saw(sortSaw(g.right, g.total), g.right < g.total);
              tail.innerHTML = LX.rich("Before a plant connects, interconnection studies run checks like these: ") + LX.lessonRefHTML(P, "A6") + ".";
            } });
          var tail = H("p", { class: "lx-hint" }, act);
          act.lxSort = cs;
          if (log.sorted != null) api.done();
        } }
    ];

    // ---- steps 4 and 5: midday solar and the hosting capacity; step 5 adds inverters that absorb reactive power
    function noonStep(act, api, withToggle) {
      var box = H("div", { class: "a17-box" }, act), absorb = withToggle ? !!log.absorb : false, crossed = false;
      var gauge = LimitGauge(box, { label: "Voltage at the far end, first estimate, in per unit", min: 0.9, max: 1.1, lo: B.lo, hi: B.hi, margin: B.margin, fmt: function (v) { return v.toFixed(3); }, tick: function (v) { return v.toFixed(2); }, ticks: [0.9, 0.95, 1, 1.05, 1.1] });
      var ro = H("div", { class: "lx-readouts", "aria-live": "polite" }, box);
      var start = log.pv != null ? log.pv : F.pv.start;
      var sl = LX.Slider(box, { label: "Rooftop solar at the far end", color: "var(--lx-solar)", min: F.pv.min, max: F.pv.max, step: F.pv.step, value: start,
        fmt: function (v) { return fmtN(v, 2) + " MW"; }, onChange: function (v) { paint(v, true); } });
      var tg = null;
      if (withToggle) {
        var tw = H("div", { class: "lx-toggles", role: "group", "aria-label": "Solar inverters" }, box);
        tg = LX.Toggle(tw, { label: "Inverters absorb reactive power (power factor " + F.pvAbsorbPF.toFixed(2) + ")", on: absorb, onChange: function (on) { absorb = on; keep("absorb", on); toggled = true; paint(sl.val(), false); } });
      }
      var toggled = false;
      H("p", { class: "lx-hint", html: LX.rich(TX.noon) }, box);
      H("p", { class: "lx-hint", html: LX.rich(TX.estimate) }, box);
      function paint(pv, user) {
        var n = noon(F, pv, absorb), state = gauge.set(n.v), hc = absorb ? h1 : h0, cls = state === "out" ? "bad" : state === "near" ? "warn" : "";
        readouts(ro, [["Flowing back up the feeder", n.P < 0 ? fmtN(-n.P, 2) + " MW" : "none"], ["Far end, first estimate", pu(n.v) + " per unit", cls], ["Hosting capacity, first estimate", fmtN(hc, 1) + " MW of solar"]]);
        if (user) keep("pv", pv);
        if (n.v > B.hi) crossed = true;
        if (!withToggle && crossed) { api.done(); api.saw(noonSaw(A, pv)); }
        if (withToggle && toggled) { api.done(); api.saw(absorbSaw(A)); }
      }
      paint(sl.val(), false);
      if (withToggle && log.absorb != null) { toggled = true; paint(sl.val(), false); }
      act.lxSet = function (v, on) { if (tg && on != null) { tg.set(on); absorb = on; keep("absorb", on); toggled = true; } sl.set(v); paint(v, true); };
    }

    // ---- step 6: the ramp an hourly plan assumed
    function rampStep(act, api) {
      var box = H("div", { class: "a17-box" }, act), sel = log.hour != null ? log.hour : A.ramp.start, lim = A.ramp.limitMWh;
      var ch = H("div", null, box), Pl = LX.Plot(ch, { text: "Text version of the chart", legend: true });
      var gauge = LimitGauge(box, { label: "Change from the hour before", min: -60, max: 60, lo: -lim, hi: lim, unit: "MW", fmt: function (v) { return signed(v); }, ticks: [-60, -40, 0, 40, 60] });
      var ro = H("div", { class: "lx-readouts", "aria-live": "polite" }, box);
      var hp = LX.HourPicker(box, { start: sel, jumps: ov.map(function (c) { return [c.to, hh(c.to)]; }), onChange: function (t) { paint(t, true); } });
      H("p", { class: "lx-hint", html: LX.rich(TX.ramp) }, box);
      function paint(t, user) {
        sel = LX.clamp(t, 0, plan.length - 1);
        var d = sel > 0 ? plan[sel].cc - plan[sel - 1].cc : 0, bad = gauge.set(d);
        readouts(ro, [["Hour", hh(sel)], ["Gas plant", plan[sel].cc + " MW"], ["Asked to change", sel > 0 ? signed(d) + " MW" : "first hour", bad ? "bad" : ""]]);
        var bars = plan.map(function (h, k) { return { x0: k + 0.15, x1: k + 0.85, y0: 0, y1: h.cc, color: "var(--lx-cc)", op: k === sel ? 1 : 0.55, rx: 2 }; });
        Pl.render({ x: { min: 0, max: 24, ticks: [[0, "00:00"], [6, "06:00"], [12, "12:00"], [18, "18:00"], [24, "24:00"]], ticksN: [[0, "0"], [12, "12"], [24, "24"]] },
          y: { min: 0, max: 160, step: 40, fmt: LX.fmt.int, unit: "MW" }, bars: bars, height: 200, heightN: 180,
          marks: ov.map(function (c) { return { x: c.to + 0.5, y: plan[c.to].cc + 4, label: signed(c.d), kind: "dot", pos: "above" }; }),
          pick: { n: plan.length, sel: sel, onPick: function (k) { hp.set(k); paint(k, true); } },
          aria: "The gas plant's output hour by hour on " + M1.day.label + " without the ramp rule; changes over " + lim + " MW are marked",
          text: { head: ["Hour", "Gas plant (MW)", "Change from the hour before (MW)"], rows: plan.map(function (h, k) { return [hh(k), String(h.cc), k > 0 ? signed(h.cc - plan[k - 1].cc) : "–"]; }) } });
        if (user) keep("hour", sel);
        api.done();
        api.saw(rampSaw(A, M1));
      }
      paint(sel, false);
      act.lxSet = function (t) { hp.set(t); paint(t, true); };
    }

    // ---- steps 7 and 8: the first second after a trip
    function inertiaStep(act, api, inverters) {
      var box = H("div", { class: "a17-box" }, act), E = log.E != null ? log.E : G.inertia.start, mode = inverters ? (log.mode || "gfl") : "none", seen = log.modes || {}, tried = {};
      var sg = inverters ? seg(box, "Battery inverter", I.modes, mode, function (k) { mode = k; seen[k] = true; keep("mode", k); keep("modes", seen); paint(true); }) : null;
      var gauge = LimitGauge(box, { label: "Starting rate of change of frequency", min: 0, max: 0.6, unit: "Hz/s", fmt: function (v) { return v.toFixed(2); }, ticks: [0, 0.2, 0.4, 0.6] });
      var ro = H("div", { class: "lx-readouts", "aria-live": "polite" }, box);
      var ch = H("div", null, box), Pl = LX.Plot(ch, { text: "Text version of the chart", legend: true });
      var sl = inverters ? null : LX.Slider(box, { label: "Stored rotational energy", color: "var(--lx-cc)", min: G.inertia.min, max: G.inertia.max, step: G.inertia.step, value: E,
        fmt: function (v) { return v + " GW·s"; }, onChange: function (v) { E = v; keep("E", v); tried[v] = true; paint(true); } });
      if (inverters) { H("p", { class: "lx-hint", text: TX.inverters }, box); H("p", { class: "lx-hint", text: TX.stored(E) }, box); }
      else H("p", { class: "lx-hint", text: TX.sketch }, box);
      function paint(user) {
        var r = startRocof(G, E, mode), f1 = sketch(G, I, E, mode, I.sketchS);
        gauge.set(r);
        readouts(ro, [["Stored energy", E + " GW·s"], ["Starting fall", r.toFixed(2) + " Hz per second"], ["Sketch after " + I.sketchS + " s", f1.toFixed(2) + " Hz"]]);
        var ts = []; for (var k = 0; k <= 20; k++) ts.push(k * I.sketchS / 20);
        var cols = { none: "var(--lx-ink-3)", gfl: "var(--lx-tier-2)", gfm: "var(--lx-bat)" };
        var lines = (inverters ? I.modes.map(function (m) { return m.key; }) : ["none"]).map(function (m) {
          return { pts: ts.map(function (t) { return [t, sketch(G, I, E, m, t)]; }), color: cols[m], width: m === mode ? 3 : 1.6, dash: m === mode ? null : "5 4" };
        });
        Pl.render({ x: { min: 0, max: I.sketchS, ticks: [[0, "0 s"], [0.5, "0.5 s"], [1, "1 s"]] }, y: { min: 59.4, max: 60, step: 0.1, fmt: function (v) { return v.toFixed(1); }, unit: "Hz" },
          lines: lines, legend: inverters ? I.modes.map(function (m) { return { label: m.label, color: cols[m.key], dash: m.key === mode ? null : "5 4" }; }) : [{ label: "Frequency, first-second sketch", color: cols.none }],
          height: 190, heightN: 170, aria: "Frequency in the first second after a " + G.tripMW + " MW trip, sketched at its starting slope, with " + E + " GW·s of stored energy",
          text: { head: ["Time (s)"].concat(lines.map(function (l, i) { return inverters ? I.modes[i].label + " (Hz)" : "Frequency (Hz)"; })), rows: [0, 0.25, 0.5, 0.75, 1].map(function (t) { return [String(t)].concat((inverters ? I.modes.map(function (m) { return m.key; }) : ["none"]).map(function (m) { return sketch(G, I, E, m, t).toFixed(3); })); }) } });
        if (!inverters && Object.keys(tried).length >= 2) { api.done(); api.saw(rocofSaw(G, E)); }
        if (inverters && seen.gfl && seen.gfm) { api.done(); api.saw(invSaw(G, I, E)); }
        if (inverters && sg) sg.set(mode);
      }
      if (inverters) { seen[mode] = true; keep("modes", seen); }
      paint(false);
      act.lxSet = function (v) { if (inverters) { mode = v; seen[v] = true; keep("mode", v); keep("modes", seen); } else { E = v; sl.set(v); keep("E", v); tried[v] = true; } paint(true); };
    }

    var cards = LX.StepCards(live, { id: "a17-steps", steps: steps });

    // demo states: "step-N" opens step N with its action done; "mid" = step 4 past the hosting capacity
    LX.demo(root, function (state) {
      var n = state === "mid" ? 4 : +((/^step-(\d+)$/.exec(state) || [])[1] || 0); if (!n) return null;
      var i = Math.max(0, Math.min(steps.length - 1, n - 1));
      if (i >= 1 && !log.pred) keep("pred", "yes");
      cards.go(i);
      setTimeout(function () {
        var host = live.querySelector(".lx-step-act");
        if (!host || !(host.lxSet || host.lxSort)) return;
        if (i === 1) { host.lxSet(40); host.lxSet(55); }
        if (i === 2) { host.lxSet(3); host.lxSet(4.5); }
        if (i === 3) host.lxSet(3.5);
        if (i === 4) host.lxSet(3.5, true);
        if (i === 5) host.lxSet(14);
        if (i === 6) { host.lxSet(10); host.lxSet(6); }
        if (i === 7) { host.lxSet("gfl"); host.lxSet("gfm"); }
        if (i === 8 && host.lxSort) { var map = {}; A.sort.cards.forEach(function (c) { map[c.id] = c.bin; }); host.lxSort.place(map); host.lxSort.check(); }
        buildExplain();
      }, 60);
      return { view: "step " + (i + 1) };
    }, cards);

    // ---------------------------------------------------------------- the explain layer (the reader's own numbers)
    // Rebuilt after every saved setting (keep), so it always shows the reader's current numbers; the map keeps its selection.
    var map = null;
    function buildExplain() {
      var host = document.getElementById("a17-explain"); if (!host) return;
      var sel = map ? map.sel() : null; if (map) map.stop();
      host.innerHTML = ""; host.classList.add("is-live");
      var s = summary(A, M1, G, { q: log.q, ev: log.ev, pv: log.pv, absorb: log.absorb, E: log.E });
      var c1 = H("div", { class: "lx-xcard" }, host);
      H("header", { class: "lx-x-head", html: "<h3>Five limits on one map</h3>" }, c1);
      H("p", { class: "lx-lede", text: "Tap a number for what each limit is, when it binds here and what the plan assumed. Your settings where you made them." }, c1);
      map = LimitMap(c1, { items: mapItems(A, M1, G, s), sel: sel, aria: "One-line diagram: Wind Ridge and the Gas Hub feed Prairie Town over three lines; the town's substation feeds a feeder whose far end has homes and rooftop solar; a frequency dial for the whole grid. Five numbered limits sit on the line, the feeder, its far end, the gas plant and the dial." });
      var c2 = H("div", { class: "lx-xcard" }, host), ch = solarChain(A, s);
      LX.CausalChain(c2, { title: "Cause and effect: rooftop solar at noon", links: ch.links, note: ch.note });
      var c3 = H("div", { class: "lx-xcard" }, host);
      LX.CompareTable(c3, { title: "Which check catches which limit", text: true,
        columns: [{ key: "name", label: "Limit", main: true }, { key: "unit", label: "Measured in" }, { key: "band", label: "Limit here" }, { key: "check", label: "Check that catches it" }],
        rows: [{ key: "thermal", color: "var(--lx-tier-2)", name: "A line's heating", unit: "MVA or amperes", band: L.ratingMVA + " MVA (illustrative)", check: "AC: voltage and reactive power" },
               { key: "sag", color: "var(--lx-demand)", name: "Voltage sag", unit: "per unit of nominal voltage", band: "at least " + B.lo.toFixed(2), check: "AC: voltage and reactive power" },
               { key: "rise", color: "var(--lx-solar)", name: "Voltage rise (hosting capacity)", unit: "per unit; MW of solar", band: "at most " + B.hi.toFixed(2), check: "AC: voltage and reactive power" },
               { key: "ramp", color: "var(--lx-cc)", name: "Ramp", unit: "MW per hour or per minute", band: A.ramp.limitMWh + " MW an hour (illustrative)", check: "Ramp limits at each time step; finer steps for moves inside the hour" },
               { key: "rocof", color: "var(--lx-bat)", name: "Inertia", unit: "GW·s; Hz per second", band: "set by the grid's relays and reserves", check: "Dynamics: the first seconds" }],
        caption: "An hourly energy plan checks none of these by itself." });
    }
    buildExplain();
  }

  LX.mount("wires", function (live, data, root) { view(live, data, root); });
})();
