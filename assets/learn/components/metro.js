/* metro.js — LX.Metro: the course map as a transit map, drawn from assets/learn/data/path.json (built from learn/path.yml).
   LX.Metro(host, path)                 entry doors (one per tier), a progress bar, the map, the math-toolbox shelf, a legend
                                        and a card for every station, line label and tool
   LX.metroLayout(path, "h"|"v", opts)  pure layout (also used by the Node tests); opts.W the drawing width in px (the SVG is
                                        drawn 1:1, so text keeps its CSS size), opts.measure(text, font) a text measurer
                                        (fonts "label", "code", "tier", "text", "sub"; default: an estimate)
   What is drawn (map v2, 2026-11-03): every lesson in path.json is one station.
     - The starter path (path.starter) is the named route across the tier lines, as before: large stations with icons
       and names, the route drawn thick; a lesson with tier2 bridges two lines (a capsule "to A").
     - Each tier is one line (thinner, in the tier's colour) carrying all its lessons: its starter stops first, then
       its lessons off the starter path (path.more) in curriculum order: modules by number, then unnumbered ones,
       bridges (B), the news lens (N), side topics (X), case files (CF), sandboxes (SB), the checkpoint (CK) and
       capstones (C, CR); path.yml order breaks ties. Live stations are filled; upcoming ones hollow and quiet. Each
       station shows its code; an upcoming lesson without a code is a hollow dot. A label at the left names the tier and
       counts what is drawn on its line ("7 open · 3 coming soon"); it opens the tier's card. A bridge lesson's two
       tiers read in order, lower first ("Analyst to Modeler").
     - Kinds by shape, not colour: lesson circle, studio hexagon, case file square, checkpoint diamond, sandbox
       triangle, capstone star (from `form`; for an upcoming row without one, from its code: CK- checkpoint, CF case
       file, SB sandbox, C0-C4 and CR capstone, R studio). The legend shows the kinds on the map.
     - The math toolbox (path.toolbox, K1-K8) is a shelf of chips under the lines, inside the map's box.
   Wide (drawing width >= 720 px and every starter name fits its slot): lines run left to right, first tier at the
   bottom. A tier's line starts at its first starter stop (a tier without one: at the left) and goes on after its last
   starter stop; when the row is full it turns at the map's edge onto a further row and runs back, and so on (rows on
   the side of the route that the route crosses least: Foundations and Analyst below, Modeler above). Stations step
   around the places where the route crosses a row; codes take a second row under a station when they are close.
   Narrower: the starter path runs top to bottom on one column per tier, then each tier's line continues down its
   column, one station per row with code and title on the right (drawn at most 560 px wide).
   Keyboard: the starter path's stations 0-13 in order, then each tier line (its label, then its stations), then the
   toolbox; arrow keys also step along a line. Every station, label and tool is a named button; its card is a dialog
   named by its heading. A card stays inside the map's box and the window below the site's sticky navbar (its body
   scrolls, with a "More below" cue), and the window scrolls just enough to show it; Escape closes it from anywhere in
   the map and focus goes back to what opened it. Progress ticks come from this browser only; only the next open
   starter station pulses (none under reduced motion).
   Tests: _tests/learn/test_metro_layout.js (layout, in Node), _tests/learn/test_metro_browser.js (in Chrome). */
(function () {
  "use strict";
  var LX = window.LX;
  function slot(t, i) { return "var(--lx-tier-" + (t.slot || i + 1) + ")"; }

  // ---------------------------------------------------------------- kinds and curriculum order (pure)
  var FORM_KIND = { cards: "lesson", play: "lesson", studio: "studio", "case": "case", checkpoint: "checkpoint", sandbox: "sandbox", capstone: "capstone" };
  var KIND_NAME = { lesson: "Lesson", studio: "Studio", "case": "Case file", checkpoint: "Checkpoint", sandbox: "Sandbox", capstone: "Capstone" };
  var KIND_ICON = { studio: "pencil", "case": "question", checkpoint: "target", sandbox: "blocks", capstone: "star" };
  var KINDS = ["lesson", "studio", "case", "checkpoint", "sandbox", "capstone"];
  function kindOf(m) {
    if (m.form && FORM_KIND[m.form]) return FORM_KIND[m.form];
    var c = m.code || "";
    return /^CK-/.test(c) ? "checkpoint" : /^CF\d/.test(c) ? "case" : /^SB\d/.test(c) ? "sandbox"
      : /^(C\d+|CR)$/.test(c) ? "capstone" : /^R\d/.test(c) ? "studio" : "lesson";
  }
  var FAM = { B: 2, N: 3, X: 4, CF: 5, SB: 6, C: 8 };
  function rankOf(m) {
    var c = m.code || "", g = /^([A-Z]+)(\d+)$/.exec(c);
    if (!c) return [1, 0];
    if (/^CK-/.test(c)) return [7, 0];
    if (c === "CR") return [8, 99];
    if (!g) return [4.5, 0];
    return [g[1].length === 1 && "FAMR".indexOf(g[1]) >= 0 ? 0 : FAM[g[1]] != null ? FAM[g[1]] : 4.5, +g[2]];
  }
  // a tier's lessons off the starter path, in curriculum order ({m, j: index in path.more})
  function ordered(more, tierId) {
    var out = [];
    (more || []).forEach(function (m, j) { if (m.tier === tierId) out.push({ m: m, j: j, r: rankOf(m) }); });
    out.sort(function (a, b) { return a.r[0] - b.r[0] || a.r[1] - b.r[1] || a.j - b.j; });
    return out;
  }
  // what a tier line's label says about the stations drawn on it
  function summary(t, own) {
    var live = own.filter(function (o) { return o.m.ready; }).length, up = own.length - live;
    if (!own.length) return t.status === "upcoming" ? "coming later" : "in preparation";
    return [live ? live + " open" : "", up ? up + " coming soon" : ""].filter(Boolean).join(" · ");
  }

  // ---------------------------------------------------------------- text: estimate, wrap, shorten
  var EM = { label: [12.5, 0.57], code: [12, 0.6], tier: [12, 0.76], text: [12, 0.53], sub: [11.5, 0.6] };
  function estimate(t, font) { var e = EM[font] || EM.label; return String(t).length * e[0] * e[1]; }
  function shorten(t, max, meas, font) {
    if (meas(t, font) <= max) return t;
    var w = t.split(" ");
    while (w.length > 1 && meas(w.join(" ") + "…", font) > max) w.pop();
    var s = w.join(" ");
    while (s.length > 1 && meas(s + "…", font) > max) s = s.slice(0, -1);
    return s.replace(/[\s,:;.]+$/, "") + "…";
  }
  // words into lines of at most max px; with maxLines, the last line is shortened with "…" when the text runs over
  // (indent: px taken from the first line, e.g. by a code drawn before it)
  function wrap(text, max, meas, font, maxLines, indent) {
    var words = String(text).split(/\s+/), lines = [], cur = "", lim = function () { return max - (lines.length ? 0 : indent || 0); };
    words.forEach(function (x) { var t = cur ? cur + " " + x : x; if (cur && meas(t, font) > lim()) { lines.push(cur); cur = x; } else cur = t; });
    if (cur) lines.push(cur);
    if (maxLines) {
      if (lines.length > maxLines) lines = lines.slice(0, maxLines - 1).concat([lines.slice(maxLines - 1).join(" ")]);
      lines = lines.map(function (l, j) { return shorten(l, max - (j ? 0 : indent || 0), meas, font); });
      if (lines.length === maxLines && meas(lines[maxLines - 1], font) > max - (maxLines > 1 ? 0 : indent || 0)) lines[maxLines - 1] = shorten(lines[maxLines - 1], max, meas, font);
    }
    return lines;
  }

  // the line each starter stop sits on: a bridge lesson stays on the previous stop's line when that is one of its two tiers
  function routeRows(st, ti) {
    var row = [];
    st.forEach(function (l, i) {
      var r = ti[l.tier];
      if (l.tier2 != null && ti[l.tier2] != null && i > 0 && row[i - 1] === ti[l.tier2]) r = ti[l.tier2];
      row.push(r);
    });
    return row;
  }
  function stopRecord(l, i, row, tiers, ti) { var k = ti[l.tier]; return { key: "s" + i, i: i, lesson: l, row: row, tier: k, color: slot(tiers[k], k), r: 17, kind: "stop" }; }
  function bridges(stops, tiers, ti) {
    var out = [];
    stops.forEach(function (s) {
      var l = s.lesson; if (l.tier2 == null || ti[l.tier2] == null) return;
      var other = s.row === ti[l.tier] ? ti[l.tier2] : ti[l.tier];
      if (other !== s.row) out.push({ s: s, other: other, up: other > s.row, text: "to " + tiers[other].title.charAt(0) });
    });
    return out;
  }

  // ---------------------------------------------------------------- wide layout: lines left to right
  // Each tier is one line: from its first starter stop (or from the left, for a tier without any) its starter stops,
  // then its other lessons after the last one; a line that runs out of room turns at the map's edge onto the next row
  // (a row on the side of the route that the route crosses least) and runs back, and so on.
  function layoutH(path, o) {
    var tiers = path.tiers, nT = tiers.length, st = path.starter, n = st.length, W = o.W, meas = o.measure;
    var ti = {}; tiers.forEach(function (t, k) { ti[t.id] = k; });
    var PADX = 16, x0 = PADX + 30, xEnd = W - PADX - 30, dx = n > 1 ? Math.min(84, (xEnd - x0) / (n - 1)) : 0;
    var EDGE = W - 9, RC = 12, PMIN = 24, PCALM = 32, PMAX = 84, XA = PADX + 18, XB = W - PADX - 18, XBT = EDGE - RC - 16, XAT = 9 + RC + 16;
    var row = routeRows(st, ti), L = { mode: "h", W: W, tiers: [], stops: [], own: [], segs: [], caps: [], fits: true, why: [] };
    st.forEach(function (l, i) {
      var s = stopRecord(l, i, row[i], tiers, ti);
      s.x = x0 + i * dx; s.lines = wrap(l.short, Math.max(36, dx - 8), meas, "label");
      s.half = Math.max.apply(null, s.lines.map(function (t) { return meas(t, "label"); })) / 2;
      L.stops.push(s);
    });
    // starter names side by side on one line must not touch (else the narrow layout is used)
    var i, q;
    for (i = 0; i + 1 < n; i++) {
      var a = L.stops[i], b = L.stops.filter(function (s, j) { return j > i && s.row === a.row; })[0];
      if (!b) continue;
      for (q = 0; q < Math.min(a.lines.length, b.lines.length); q++)
        if ((meas(a.lines[q], "label") + meas(b.lines[q], "label")) / 2 + 4 > b.x - a.x) { L.fits = false; L.why.push("names of stops " + a.i + " and " + b.i); }
    }
    var caps = bridges(L.stops, tiers, ti);
    // the side of its route row where a tier's further rows go: the one the route crosses less (ties: below)
    var cross = tiers.map(function () { return { above: 0, below: 0 }; });
    function link(p, p2) { var lo = Math.min(p, p2), hi = Math.max(p, p2); cross[lo].above++; cross[hi].below++; for (var k2 = lo + 1; k2 < hi; k2++) { cross[k2].above++; cross[k2].below++; } }
    for (i = 0; i + 1 < n; i++) if (row[i] !== row[i + 1]) link(row[i], row[i + 1]);
    caps.forEach(function (c) { link(c.s.row, c.other); });
    // per tier: its stops, its other lessons, how many fit on the route row after its last stop, the rows for the rest
    var plan = tiers.map(function (t, k) {
      var own = ordered(path.more, t.id), mine = L.stops.filter(function (s) { return s.row === k; }), P = { k: k, own: own, mine: mine, side: "below" };
      if (mine.length) {
        P.side = cross[k].above < cross[k].below ? "above" : "below";
        var last = mine[mine.length - 1], start = last.x + Math.max(21 + 22, last.half + 16);
        // a route run that leaves this row to the right (level to its turn, then the climb or drop) keeps the row clear
        for (var j = 0; j + 1 < n; j++) {
          var p1 = L.stops[j], p2 = L.stops[j + 1]; if (p1.row === p2.row) continue;
          [[p1, p2], [p2, p1]].forEach(function (pr) { var s = pr[0], ot = pr[1]; if (s.row === k && ot.x > s.x) start = Math.max(start, s.x + Math.max(30, s.half + 7) + 0.42 * (ot.x - s.x) + 22); });
        }
        P.start = start;
      } else P.start = XA;
      // a row holds stations at least PCALM apart (closer only when blocked stretches take room); the rest turn onto
      // further rows, and the first row takes a share at about the spacing the others get
      var cap = function (hi) { return Math.max(0, Math.floor((hi - P.start) / PCALM) + 1); };
      if (own.length <= cap(XB)) { P.rows = [own]; }
      else {
        var capM = Math.max(1, Math.floor((XBT - XAT) / PCALM) + 1 - 2), nr = Math.max(1, Math.ceil((own.length - cap(XBT)) / capM));
        var pitch = Math.max(PMIN, Math.min(PMAX, (Math.max(0, XBT - P.start) + nr * (XBT - XA)) / Math.max(1, own.length)));
        var c1 = Math.min(cap(XBT), XBT >= P.start ? Math.floor((XBT - P.start) / pitch) + 1 : 0);
        var more2 = own.slice(c1), size = Math.ceil(more2.length / nr);
        P.rows = [own.slice(0, c1)];
        for (var r = 0; r < nr; r++) P.rows.push(more2.slice(r * size, (r + 1) * size));
      }
      P.tw = meas(t.title, "tier"); P.summary = summary(t, own); P.sw = meas(P.summary, "text");
      return P;
    });
    // stack the rows from the top, last tier first; the tier's label sits above its top row, at the left
    var GAP = 10, BAND = 14, y = 4, lastRoute = null;
    for (var k = nT - 1; k >= 0; k--) {
      var P = plan[k], rows = P.rows.map(function (lst, r) { return { r: r, list: lst, route: r === 0 && P.mine.length > 0 }; });
      var order = P.mine.length && P.side === "above" ? rows.slice(1).reverse().concat([rows[0]]) : rows, hw = P.tw + 10 + P.sw;
      // the label goes above the first row (from the top) whose line reaches the left side, where the label sits
      var reach = function (R) {
        if (R.route) return P.mine[0].x - 21;
        if (R.r === 0) return P.start - 14;
        return R.r % 2 ? Math.max(XA, XBT - (R.list.length - 1) * PMAX) - 14 : XAT - 14;
      };
      var hq = 0; for (q = 0; q < order.length; q++) if (reach(order[q]) < PADX + hw + 40) { hq = q; break; }
      order.forEach(function (R, qq) {
        var top, bot;
        if (R.route) {
          var ml = Math.max.apply(null, P.mine.map(function (s) { return s.lines.length; }));
          var up = caps.filter(function (c) { return c.s.row === k && c.up; }), down = caps.some(function (c) { return c.s.row === k && !c.up; });
          top = 25 + (up.length ? 34 : 0);
          R.hy = -30;
          if (qq === hq) {   // the label above a route row: clear of the stops' rings, and of a capsule when one is under it
            var hit = up.some(function (c) { return c.s.x - 21 < PADX + hw + 6; });
            if (hit) { R.hy = -64; top = Math.max(top, 76); } else top = Math.max(top, 42);
          }
          bot = Math.max(36 + (down ? 34 : 0) + 15 + 14 * (ml - 1) + 6, R.list.length ? 44 : 0);
          R.lab0 = 36 + (down ? 34 : 0);
        } else { top = qq === hq ? 36 : 16; bot = 44; R.hy = -22; }
        var yl = y + top;
        // a route row right under another one: as close as the names above and the rings, capsules and label below allow
        if (R.route && lastRoute) {
          var dy = 108;
          lastRoute.mine.forEach(function (p) {
            var pa = p.x - Math.max(21, p.half), pb = p.x + Math.max(21, p.half), pbot = p.lab0 + 15 + 14 * (p.lines.length - 1) + 6;
            var items = P.mine.map(function (s) { return [s.x - 21, s.x + 21, 21]; })
              .concat(caps.filter(function (c) { return c.s.row === k && c.up; }).map(function (c) { return [c.s.x - 21, c.s.x + 21, 55]; }))
              .concat(qq === hq ? [[PADX, PADX + hw, -R.hy + 10]] : []);
            items.forEach(function (it) { if (it[0] < pb + 6 && it[1] > pa - 6) dy = Math.max(dy, pbot + it[2] + 8); });
          });
          yl = lastRoute.y + dy;
        }
        if (R.route) { P.mine.forEach(function (s) { s.y = yl; s.lab0 = R.lab0; }); }
        R.y = yl; y = Math.max(y, yl + bot + GAP);
        lastRoute = R.route ? { y: yl, mine: P.mine } : null;
      });
      P.rowsY = rows; P.top = order[hq];
      y += BAND;
    }
    L.H = Math.round(y - BAND - GAP + 6);
    // the route: consecutive stops; between lines a steep run that turns level just before the upper stop, clear of its
    // name (names hang below the stops)
    for (i = 0; i + 1 < n; i++) {
      var A = L.stops[i], B = L.stops[i + 1], pts;
      if (A.y === B.y) pts = [[A.x, A.y], [B.x, B.y]];
      else {
        var U = A.y < B.y ? A : B, d = U.x - (U === A ? B : A).x, e = Math.min(Math.abs(d) - 12, Math.max(30, U.half + 7)), xe = U.x - (d >= 0 ? e : -e);
        pts = U === A ? [[A.x, A.y], [xe, A.y], [B.x, B.y]] : [[A.x, A.y], [xe, B.y], [B.x, B.y]];
      }
      L.segs.push({ pts: pts, color: B.color, tier: B.lesson.tier });
    }
    caps.forEach(function (c) {
      var s = c.s;
      L.caps.push({ i: s.i, x: s.x - 21, y: c.up ? s.y - 55 : s.y - 21, w: 42, h: 76, tx: s.x, ty: c.up ? s.y - 34 : s.y + 42, text: c.text, dashed: !c.up });
    });
    // what blocks a row: route runs, capsules and stops that cross its band
    function xAt(p1, p2, yy) { return p1[0] + (p2[0] - p1[0]) * (yy - p1[1]) / (p2[1] - p1[1]); }
    function blocked(yt, yb, pad) {
      var iv = [];
      L.segs.forEach(function (sg) {
        for (var q2 = 0; q2 + 1 < sg.pts.length; q2++) {
          var p1 = sg.pts[q2], p2 = sg.pts[q2 + 1], lo = Math.min(p1[1], p2[1]), hi = Math.max(p1[1], p2[1]);
          if (hi < yt || lo > yb) continue;
          if (p1[1] === p2[1]) iv.push([Math.min(p1[0], p2[0]), Math.max(p1[0], p2[0])]);
          else { var u = xAt(p1, p2, Math.max(lo, yt)), v = xAt(p1, p2, Math.min(hi, yb)); iv.push([Math.min(u, v), Math.max(u, v)]); }
        }
      });
      L.caps.forEach(function (c) { if (c.y + c.h >= yt && c.y <= yb) iv.push([c.x, c.x + c.w]); });
      L.stops.forEach(function (s) { if (s.y + 21 >= yt && s.y - 21 <= yb) iv.push([s.x - Math.max(21, s.half), s.x + Math.max(21, s.half)]); });
      iv = iv.map(function (v) { return [v[0] - pad, v[1] + pad]; }).sort(function (p, p2) { return p[0] - p2[0]; });
      var out = [];
      iv.forEach(function (v) { var last = out[out.length - 1]; if (last && v[0] <= last[1]) last[1] = Math.max(last[1], v[1]); else out.push(v); });
      return out;
    }
    // evenly spaced stations from one end, stepping over blocked stretches; the widest spacing that fits
    function place(cnt, dir, lo0, hi0, bl) {
      function skip(x) { for (var q2 = 0; q2 < bl.length; q2++) { var bb = bl[q2]; if (x > bb[0] && x < bb[1]) return dir > 0 ? bb[1] : bb[0]; } return x; }
      function run(p) { var x = dir > 0 ? lo0 : hi0, out = []; for (var q2 = 0; q2 < cnt; q2++) { x = skip(x); out.push(x); x += dir * p; } return out; }
      function ok(r) { return !r.length || (dir > 0 ? r[r.length - 1] <= hi0 + 0.01 : r[r.length - 1] >= lo0 - 0.01); }
      var lo = 18, hi = PMAX, best = run(lo);
      if (ok(run(hi))) return run(hi);
      for (var it = 0; it < 28; it++) { var mid = (lo + hi) / 2, r = run(mid); if (ok(r)) { best = r; lo = mid; } else hi = mid; }
      return best;
    }
    plan.forEach(function (P, k) {
      var t = tiers[k], rows = P.rowsY, nr = rows.length, T = { k: k, id: t.id, title: t.title, color: slot(t, k), side: P.mine.length ? P.side : "none",
        upcoming: t.status === "upcoming", summary: P.summary, n: P.own.length, live: P.own.filter(function (x) { return x.m.ready; }).length, tw: P.tw, sw: P.sw, rows: [] };
      rows.forEach(function (R, r) {
        var dir = r % 2 ? -1 : 1, right = (r < nr - 1 && dir > 0) || (r > 0 && dir < 0), left = (r < nr - 1 && dir < 0) || (r > 0 && dir > 0);
        var lo0 = r === 0 ? P.start : left ? XAT : XA, hi0 = right ? XBT : XB;
        var bl = blocked(R.y - (R.route ? 21 : 16), R.y + 44, 22), xs = place(R.list.length, dir, lo0, hi0, bl);
        if (R.list.length && !(dir > 0 ? xs[xs.length - 1] <= hi0 + 0.5 : xs[xs.length - 1] >= lo0 - 0.5)) { L.fits = false; L.why.push(t.title + " line row " + r + " overflows"); }
        R.list.forEach(function (x, q2) {
          var m = x.m;
          L.own.push({ key: "m" + x.j, j: x.j, m: m, lesson: m, kind: kindOf(m), tier: k, row: r, x: xs[q2], y: R.y, r: 8.5, color: T.color,
            code: m.code || "", cw: m.code ? meas(m.code, "code") : 0 });
        });
        var ends = R.list.length ? [Math.min(xs[0], xs[xs.length - 1]), Math.max(xs[0], xs[xs.length - 1])] : null;
        T.rows.push({ y: R.y, dir: dir, route: R.route, a: ends ? ends[0] : null, b: ends ? ends[1] : null, turnR: right, turnL: left });
      });
      // codes: under their station, on a second row when they would touch the one before
      var mine = L.own.filter(function (s) { return s.tier === k; });
      rows.forEach(function (R, r) {
        var endN = -1e9, endF = -1e9;
        mine.filter(function (s) { return s.row === r; }).sort(function (p, p2) { return p.x - p2.x; }).forEach(function (s) {
          s.ly = s.y + 24;
          if (!s.code) return;
          var l0 = s.x - s.cw / 2;
          if (l0 >= endN + 6) { s.far = false; endN = s.x + s.cw / 2; }
          else { if (l0 < endF + 6) { L.fits = false; L.why.push("codes near " + s.code); } s.far = true; endF = s.x + s.cw / 2; s.ly = s.y + 39; }
        });
      });
      // the line: row by row, with rounded turns at the map's edge
      var d2 = "", first = P.mine.length ? P.mine[0].x : (T.rows[0].a != null ? T.rows[0].a - 14 : XA - 14);
      T.rows.forEach(function (rw, r) {
        if (r === 0) d2 += "M" + first + " " + rw.y;
        else {
          var pv = T.rows[r - 1], xT = pv.dir > 0 ? EDGE : 9, sg = rw.y > pv.y ? 1 : -1, ins = pv.dir > 0 ? -RC : RC;
          d2 += " H" + (xT + ins) + " Q" + xT + " " + pv.y + " " + xT + " " + (pv.y + sg * RC) + " V" + (rw.y - sg * RC) + " Q" + xT + " " + rw.y + " " + (xT + ins) + " " + rw.y;
        }
        if (r === nr - 1) {
          var endX = rw.a == null ? (rw.route ? P.mine[P.mine.length - 1].x : XA + 120) : rw.dir > 0 ? rw.b + 14 : rw.a - 14;
          d2 += " H" + endX;
        }
      });
      T.path = d2; T.empty = !P.own.length;
      T.hx = PADX; T.hy = P.top.y + P.top.hy;
      L.tiers.push(T);
    });
    return L;
  }

  // ---------------------------------------------------------------- narrow layout: columns top to bottom
  function layoutV(path, o) {
    var tiers = path.tiers, nT = tiers.length, st = path.starter, W = o.W, meas = o.measure;
    var ti = {}; tiers.forEach(function (t, k) { ti[t.id] = k; });
    var cw = nT > 4 ? 30 : nT > 3 ? 34 : 44, c0 = nT > 3 ? 26 : 34, tx = function (k) { return c0 + k * cw; };
    var textX = tx(nT - 1) + 31, avail = Math.max(60, W - textX - 6), row = routeRows(st, ti);
    var L = { mode: "v", W: W, textX: textX, tiers: [], stops: [], own: [], segs: [], caps: [], fits: true, why: [], top: 22 };
    var y = 40;
    st.forEach(function (l, i) {
      var s = stopRecord(l, i, row[i], tiers, ti), lines = wrap(i + "  " + l.short, avail, meas, "label", 2), two = lines.length > 1;
      s.x = tx(row[i]); s.y = y + (two ? 28 : 24); s.lines = lines; s.ty = s.y - (two ? 9 : 2); s.subY = s.ty + 15 * lines.length + 2; s.textX = textX;
      s.top = y; s.h = two ? 80 : 66;
      L.stops.push(s); y += s.h;
    });
    for (var i = 0; i + 1 < L.stops.length; i++) { var a = L.stops[i], b = L.stops[i + 1]; L.segs.push({ pts: [[a.x, a.y], [b.x, b.y]], color: b.color, tier: b.lesson.tier }); }
    bridges(L.stops, tiers, ti).forEach(function (c) {
      var s = c.s, x2 = tx(c.other);
      L.caps.push({ i: s.i, x: Math.min(s.x, x2) - 19, y: s.y - 19, w: Math.abs(s.x - x2) + 38, h: 38, tx: x2, ty: s.y + 4, text: tiers[c.other].title.charAt(0), dashed: !c.up });
    });
    y += 8;
    tiers.forEach(function (t, k) {
      var own = ordered(path.more, t.id), T = { k: k, id: t.id, title: t.title, color: slot(t, k), x: tx(k), upcoming: t.status === "upcoming",
        summary: summary(t, own), n: own.length, live: own.filter(function (x) { return x.m.ready; }).length };
      T.hx = textX; T.hy = y + 22; T.sum = wrap(T.summary, avail, meas, "text", 2);
      T.head = meas(t.title + " line", "tier") <= avail ? t.title + " line" : shorten(t.title, avail, meas, "tier");
      T.y0 = T.hy - 15; y = T.hy + 16 + 14 * (T.sum.length - 1) + 10;
      own.forEach(function (x) {
        // the code first (in the code font), then the title, wrapped beside and under it
        var m = x.m, cwd = m.code ? meas(m.code, "code") + 7 : 0, lines = wrap(m.title, avail, meas, "label", m.ready ? 2 : 1, cwd), sy = y + 14;
        L.own.push({ key: "m" + x.j, j: x.j, m: m, lesson: m, kind: kindOf(m), tier: k, x: tx(k), y: sy, r: 8, color: T.color, code: m.code || "",
          cwd: cwd, lines: lines, ty: sy + 4.5, textX: textX, top: y, h: 30 + 15 * (lines.length - 1) });
        y += 30 + 15 * (lines.length - 1);
      });
      var last = L.own.filter(function (s) { return s.tier === k; }).pop();
      T.y1 = last ? last.y : T.hy + 12;
      y += 12;
      L.tiers.push(T);
    });
    L.H = Math.round(y + 6);
    return L;
  }

  LX.metroLayout = function (path, mode, opts) {
    opts = opts || {};
    var o = { W: opts.W || (mode === "h" ? 1100 : 330), measure: opts.measure || estimate };
    var L = mode === "h" ? layoutH(path, o) : layoutV(path, o);
    L.stations = L.stops.concat(L.own);
    L.tools = (path.toolbox || []).map(function (t, j) { return { key: "k" + j, j: j, lesson: t, kind: "tool" }; });
    return L;
  };
  LX.metroKind = kindOf; LX.metroOrder = ordered;
  if (typeof module !== "undefined" && module.exports) module.exports = { metroLayout: LX.metroLayout, kindOf: kindOf, ordered: ordered, summary: summary };
  if (typeof document === "undefined") return;

  // ---------------------------------------------------------------- drawing
  var H = LX.H, S = LX.S, clamp = LX.clamp, uid = 0, VMAX = 560, HMIN = 720;
  // the shape of a station of each kind, centred on x, y (s: the size; a lesson is a circle)
  function shapeD(kind, x, y, s) {
    var p = [], k;
    if (kind === "studio") { for (k = 0; k < 6; k++) p.push([x + 1.08 * s * Math.cos(Math.PI / 6 + k * Math.PI / 3), y + 1.08 * s * Math.sin(Math.PI / 6 + k * Math.PI / 3)]); }
    else if (kind === "case") { var h = 0.86 * s; p = [[x - h, y - h], [x + h, y - h], [x + h, y + h], [x - h, y + h]]; }
    else if (kind === "checkpoint") { var dd = 1.2 * s; p = [[x, y - dd], [x + dd, y], [x, y + dd], [x - dd, y]]; }
    else if (kind === "sandbox") { var R = 1.25 * s; p = [[x, y - R], [x + R * 0.866, y + R * 0.5], [x - R * 0.866, y + R * 0.5]]; }
    else if (kind === "capstone") { for (k = 0; k < 10; k++) { var rr = k % 2 ? 0.55 * s : 1.32 * s, an = -Math.PI / 2 + k * Math.PI / 5; p.push([x + rr * Math.cos(an), y + rr * Math.sin(an)]); } }
    else return null;
    return "M" + p.map(function (q) { return q[0].toFixed(1) + " " + q[1].toFixed(1); }).join(" L") + " Z";
  }
  function shapeInto(g, kind, x, y, s, cls) {
    var d = shapeD(kind, x, y, s);
    return d ? S("path", { d: d, class: cls, "stroke-linejoin": "round" }, g) : S("circle", { cx: x, cy: y, r: s, class: cls }, g);
  }
  LX.metroShape = function (kind, size) {   // a legend swatch
    var d = shapeD(kind, 12, 12, size || 7);
    return '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">' + (d ? '<path d="' + d + '" stroke-linejoin="round"/>' : '<circle cx="12" cy="12" r="' + (size || 7) + '"/>') + "</svg>";
  };
  // the site's navbar is sticky and covers the top of the window: cards keep clear of it (0 on a page without one)
  function topInset() {
    var h = document.getElementById("quarto-header"); if (!h) return 0;
    var p = getComputedStyle(h).position; return p === "sticky" || p === "fixed" ? h.offsetHeight : 0;
  }
  function winH() { return window.innerHeight || document.documentElement.clientHeight; }
  // scroll the window as little as possible so el is in full view below the navbar ("auto" is at once under reduced
  // motion: the site turns smooth scrolling on only without it; "instant" is not in every browser's scroll options)
  function reveal(el) {
    var r = el.getBoundingClientRect(), t = topInset() + 8, b = winH() - 8, d = 0;
    if (r.top < t) d = r.top - t; else if (r.bottom > b) d = Math.min(r.bottom - b, r.top - t);
    if (Math.abs(d) >= 1) window.scrollBy({ top: d, behavior: LX.reduced() ? "auto" : "smooth" });
  }
  // text widths in the map's own fonts (the layout keeps names and codes apart with them)
  function measurer(host) {
    var cv = document.createElement("canvas").getContext("2d"), cs = getComputedStyle(host), v = function (n, d) { return cs.getPropertyValue(n).trim() || d; };
    var disp = v("--lx-f-display", "sans-serif"), mono = v("--lx-f-mono", "monospace"), body = v("--lx-f-body", "sans-serif");
    var F = { label: "500 12.5px " + disp, code: "600 12px " + mono, tier: "600 12px " + disp, text: "400 12px " + body, sub: "400 11.5px " + mono };
    if (!cv) return estimate;
    return function (t, font) {
      t = String(t); cv.font = F[font] || F.label;
      return font === "tier" ? cv.measureText(t.toUpperCase()).width + 0.96 * t.length : cv.measureText(t).width;
    };
  }

  LX.Metro = function (host, path) {
    var tiers = path.tiers, st = path.starter, more = path.more || [], tools = path.toolbox || [], M = { tier: null, sel: null }, hid = "lx-metro-" + (++uid) + "-h";
    var tIdx = {}; tiers.forEach(function (t, k) { tIdx[t.id] = k; });
    var doors = H("div", { class: "lx-doors", role: "group", "aria-label": "Where do you start?", style: "--n:" + tiers.length }, host);
    var bar = H("div", { class: "lx-mapbar" }, host);
    var prog = H("div", { class: "lx-progress" }, bar), pt = H("span", null, prog), pf = H("i", null, H("span", { class: "pbar", "aria-hidden": "true" }, prog));
    // the time is the starter path's (path.minutes sums it), not the whole course's
    H("span", { class: "lx-hint", text: (path.minutes ? "Starter path: " + st.length + " lessons, about " + Math.round(path.minutes / 30) / 2 + " hours" : "") }, bar);
    var wrap = H("div", { class: "lx-mapwrap" }, host), svgHost = H("div", { class: "lx-mapsvg" }, wrap);
    var shelf = H("div", { class: "lx-toolshelf" }, wrap);
    // the legend: the lines, then the kinds on the map and what filled and hollow mean
    var lg = H("div", { class: "lx-mlegend" }, host);
    tiers.forEach(function (t, k) { var s = H("span", null, lg); H("i", { style: "--c:" + slot(t, k) }, s); H("span", { text: t.title + " line" }, s); });
    var sp = H("span", null, lg); H("i", { class: "route" }, sp); H("span", { text: "Starter path" }, sp);
    var lk = H("div", { class: "lx-mlegend kinds" }, host), present = { lesson: true };
    more.forEach(function (m) { present[kindOf(m)] = true; });
    KINDS.forEach(function (kd) { if (!present[kd]) return; var s = H("span", { class: "k" }, lk); H("span", { class: "sw", html: LX.metroShape(kd) }, s); H("span", { text: KIND_NAME[kd] }, s); });
    [["fill", "Open now"], ["done", "Done"], ["hollow", "Coming soon"]].forEach(function (x) { var s = H("span", { class: "st" }, lk); H("i", { class: "o " + x[0] }, s); H("span", { text: x[1] }, s); });
    tiers.forEach(function (t, k) {
      var soon = t.status === "upcoming";
      var d = H("button", { class: "lx-door" + (soon ? " soon" : ""), type: "button", "aria-pressed": "false", style: "--c:" + slot(t, k) }, doors);
      H("span", { class: "ic", html: LX.icon(t.icon || "bulb") }, d);
      H("b", { text: t.door || t.title }, d); H("small", { text: t.title + (soon ? " · later" : "") }, d); H("span", { class: "knob", "aria-hidden": "true" }, d);
      d.addEventListener("click", function () {
        var on = M.tier !== t.id; M.tier = on ? t.id : null;
        [].forEach.call(doors.children, function (c) { c.setAttribute("aria-pressed", c === d && on ? "true" : "false"); });
        close(); render();
        if (on) { opener = { el: d }; var first = st.filter(function (l) { return l.tier === t.id; })[0]; if (first) open("s" + first.starter, true); else openTier(k); }
      });
    });
    // Escape closes the open card from anywhere in the map (a door keeps focus when it opens one); arrow keys step along a line
    host.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && card) { e.preventDefault(); close(true); return; }
      var cur = e.target.closest && e.target.closest("[data-line]");
      if (!cur || !/^Arrow(Left|Right|Up|Down)$/.test(e.key) || card) return;
      var line = [].slice.call(host.querySelectorAll('[data-line="' + cur.getAttribute("data-line") + '"]')), i = line.indexOf(cur);
      var nx = line[i + (/Right|Down/.test(e.key) ? 1 : -1)];
      if (nx) { e.preventDefault(); nx.focus(); }
    });
    function state(l) { return l.id && LX.progress.isDone(l.id) ? "done" : l.ready ? "open" : "up"; }
    // opener: the element that opened the card, and a selector that finds it again after the map is redrawn
    var card = null, anchor = null, opener = null, svg = null, Lc = null, ro = null, meas = measurer(host);
    function setOpener(sel) { var a = document.activeElement; opener = { el: a && a !== document.body && host.contains(a) ? a : null, sel: sel }; }
    function mark() { host.querySelectorAll("[data-key]").forEach(function (s) { s.classList.toggle("sel", s.getAttribute("data-key") === M.sel); }); }
    function close(refocus) {
      if (ro) ro.disconnect(); ro = null;
      if (card) card.remove(); card = null; anchor = null; M.sel = null; mark();
      if (refocus && opener) {
        var el = opener.el && opener.el.isConnected ? opener.el : opener.sel ? host.querySelector(opener.sel) : null;
        if (el) { el.focus({ preventScroll: true }); reveal(el); }
      }
    }
    // "More below" shows while the card's body hides more than it shows
    function cue() { if (!card) return; var b = card.querySelector(".bd"); card.classList.toggle("more", b.scrollHeight - b.scrollTop - b.clientHeight > 2); }
    // inside the map's box and the window: the card is never taller than either (8 px margins); below or above its
    // anchor when it fits there (a station's card in the tall phone map: beside it), preferring the side already in view
    // (off: the gap to the anchor, sized to what opened the card: a starter station, a small station, a label)
    function place(px, side, again, off) {
      off = off || 30;
      var m = 8, W = wrap.clientWidth, Hh = wrap.clientHeight, wt = wrap.getBoundingClientRect().top;
      card.style.maxHeight = Math.max(0, Math.min(Hh - 2 * m, winH() - topInset() - 2 * m)) + "px";
      var cw = card.offsetWidth, ch = card.offsetHeight, left, top;
      var inBox = function (t) { return t >= m && t + ch <= Hh - m; }, inWin = function (t) { return wt + t >= topInset() + 8 && wt + t + ch <= winH() - 8; };
      if (side) { left = px[0] + off - 4; top = px[1] - 30; if (!inWin(top) && inWin(px[1] + 30 - ch)) top = px[1] + 30 - ch; }
      else {
        left = px[0] - cw / 2;
        var below = px[1] + off, above = px[1] - ch - off;
        top = inBox(below) && inWin(below) ? below : inBox(above) && inWin(above) ? above : inBox(below) ? below : above;
      }
      card.style.left = clamp(left, m, W - cw - m) + "px"; card.style.top = clamp(top, m, Hh - ch - m) + "px";
      anchor = [px, side, ch, off]; cue();
      if (!again) reveal(card);
    }
    function vb(x, y) { var v = svg.viewBox.baseVal, r = svg.getBoundingClientRect(), wr = wrap.getBoundingClientRect(); return [r.left - wr.left + x / v.width * r.width, r.top - wr.top + y / v.height * r.height]; }
    // a card: the close button, a fixed header (icon, kicker, heading that names the dialog), a body that scrolls, the cue
    function frame(color, kind, icon, kicker, title) {
      if (ro) ro.disconnect();
      if (card) card.remove();
      card = H("div", { class: "lx-preview " + kind, role: "dialog", "aria-labelledby": hid, style: "--c:" + color }, wrap);
      H("button", { class: "x", type: "button", "aria-label": "Close", text: "×", onclick: function () { close(true); } }, card);
      var ph = H("div", { class: "ph" }, card);
      H("div", { class: "ic", html: LX.icon(icon) }, ph);
      var tt = H("div", null, ph); H("div", { class: "k", text: kicker }, tt); H("h3", { id: hid, text: title }, tt);
      var bd = H("div", { class: "bd" }, card);
      H("div", { class: "cue", "aria-hidden": "true", html: "<span>More below" + LX.icon("arrow") + "</span>" }, card);
      bd.addEventListener("scroll", cue, { passive: true });
      // a late font or a reflow that changes the card's height places it again (without scrolling the window)
      if (window.ResizeObserver) { var c0 = card; ro = new ResizeObserver(function () { if (card === c0 && anchor && card.offsetHeight !== anchor[2]) place(anchor[0], anchor[1], true, anchor[3]); }); ro.observe(card); }
      return bd;
    }
    // the footer every lesson card ends with: Start (or Done and Play again), or Coming soon
    function footer(c, l, s, hint) {
      var f = H("div", { class: "pf" }, c);
      if (s === "open") { H("a", { class: "lx-btn small", href: l.href, html: "Start" + LX.icon("arrow") }, f); if (hint) H("span", { class: "lx-hint", text: hint }, f); }
      else if (s === "done") { H("span", { class: "lx-pill good", html: LX.icon("check") + "Done" }, f); H("a", { href: l.href, text: "Open again" }, f); }
      else H("span", { class: "lx-pill neutral", html: LX.icon("lock") + "Coming soon" }, f);
    }
    // a bridge lesson's two tiers in reading order, lower tier first ("Analyst to Modeler" for lesson 13)
    function tierName(l) {
      var a = tIdx[l.tier], b = l.tier2 != null ? tIdx[l.tier2] : null;
      return b == null ? tiers[a].title : tiers[Math.min(a, b)].title + " to " + tiers[Math.max(a, b)].title;
    }
    // a station's card, by key: s<N> a starter-path lesson, m<j> path.more[j], k<j> path.toolbox[j]
    function open(key, fromDoor) {
      var kind = key.charAt(0), n = +key.slice(1), sel = kind === "k" ? '.lx-tool[data-key="' + key + '"]' : '.stn[data-key="' + key + '"]';
      if (!fromDoor) setOpener(sel);
      M.sel = key; mark();
      var c, p, l, s;
      if (kind === "s") {
        l = st[n]; s = state(l);
        var k = tIdx[l.tier];
        c = frame(slot(tiers[k], k), "stop", l.icon || "map", "Lesson " + n + " · " + tierName(l) + " · " + l.minutes + " min", l.title);
        if (l.does) H("p", { text: l.does }, c);
        footer(c, l, s, l.after && l.after.length ? "Builds on lesson " + l.after.map(function (a) { return a.starter; }).join(" and ") : "No prerequisites");
        p = Lc.stops[n]; place(vb(p.x, p.y), Lc.mode === "v");
      } else if (kind === "m") {
        l = more[n]; s = state(l);
        var kd = kindOf(l), k2 = tIdx[l.tier];
        c = frame(slot(tiers[k2], k2), "stop", KIND_ICON[kd] || tiers[k2].icon || "map",
          [l.code, tierName(l) + (kd === "lesson" ? "" : " " + KIND_NAME[kd].toLowerCase()), l.minutes ? l.minutes + " min" : ""].filter(Boolean).join(" · "), l.title);
        footer(c, l, s, "");
        p = Lc.own.filter(function (o) { return o.key === key; })[0]; place(vb(p.x, p.y), Lc.mode === "v", false, 18);
      } else {
        l = tools[n]; s = state(l);
        c = frame("var(--lx-ink-2)", "stop tool", "dial", [l.code, "Math toolbox", l.minutes ? l.minutes + " min" : ""].filter(Boolean).join(" · "), l.title);
        H("p", { text: "A short math refresher: open it whenever a lesson needs it." }, c);
        footer(c, l, s, "");
        var b = shelf.querySelector(sel), br = b.getBoundingClientRect(), wr = wrap.getBoundingClientRect();
        place([br.left - wr.left + br.width / 2, br.top - wr.top + br.height / 2], false, false, br.height / 2 + 6);
      }
      var f = card.querySelector("a, button.x"); if (f && !fromDoor) f.focus({ preventScroll: true });
    }
    // a tier's card: its goal and its open lessons off the starter path
    function openTier(k, fromKey) {
      if (fromKey) setOpener('.mext[data-k="' + k + '"]');
      var T = tiers[k], c = frame(slot(T, k), "tier", T.icon || "map", T.title + (T.level ? " · " + T.level : "") + (T.status === "upcoming" ? " · coming later" : ""), T.door || T.title);
      if (T.goal) H("p", { text: T.goal }, c);
      var mine = ordered(more, T.id).map(function (x) { return x.m; }), openL = mine.filter(function (m) { return m.ready; }), cnt = mine.length - openL.length;
      if (openL.length) {
        var ul = H("ul", { class: "lx-preview-list" }, c);
        openL.forEach(function (m) { var li = H("li", null, ul); if (m.code) H("span", { class: "lx-code", text: m.code }, li); H("a", { href: m.href, text: m.title }, li); });
      }
      H("div", { class: "pf", html: '<span class="lx-pill neutral">' + LX.icon("lock") + (cnt ? cnt + (openL.length ? " more" : "") + " coming soon" : (openL.length ? "More lessons in preparation" : "In preparation")) + "</span>" }, c);
      var t = Lc.tiers[k];
      place(vb(t.hx + 40, t.hy - 4), false, false, 12);
      if (fromKey) { var f = card.querySelector("a, button.x"); if (f) f.focus({ preventScroll: true }); }
    }
    function ariaStop(l, s) { return "Lesson " + l.starter + ": " + l.short + (s === "up" ? ", coming soon" : s === "done" ? ", done" : ", open now"); }
    function ariaOwn(l, s) {
      var kd = kindOf(l);
      return (l.code ? l.code + ", " : "") + tiers[tIdx[l.tier]].title + " " + KIND_NAME[kd].toLowerCase() + ": " + l.title + (s === "up" ? ". Coming soon" : s === "done" ? ". Done" : ". Open now");
    }
    function onActivate(el, fn) {
      el.addEventListener("click", fn);
      el.addEventListener("keydown", function (ev) { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); fn(); } });
    }
    function badge(g, x, y, r) {
      S("circle", { cx: x, cy: y, r: r, fill: "var(--lx-good)", stroke: "var(--lx-surface)", "stroke-width": 2 }, g);
      S("path", { d: "M" + (x - r * 0.44) + " " + y + " l" + r * 0.31 + " " + r * 0.31 + " l" + r * 0.56 + " " + (-r * 0.62), fill: "none", stroke: "var(--lx-surface)", "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round" }, g);
    }
    function render() {
      var cs = getComputedStyle(wrap), avail = Math.floor(wrap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)), L = null;
      if (avail >= HMIN) { L = LX.metroLayout(path, "h", { W: avail, measure: meas }); if (!L.fits) L = null; }
      if (!L) L = LX.metroLayout(path, "v", { W: Math.min(avail, VMAX), measure: meas });
      Lc = L; var mode = L.mode;
      var done = st.filter(function (l) { return state(l) === "done"; }).length;
      pt.textContent = done + " of " + st.length + " done"; pf.style.width = (done / Math.max(1, st.length) * 100) + "%";
      svgHost.innerHTML = ""; wrap.setAttribute("data-mode", mode);
      svg = S("svg", { viewBox: "0 0 " + L.W + " " + L.H, role: "group", style: mode === "v" ? "width:" + L.W + "px" : null,
        "aria-label": "Course map: the " + st.length + "-lesson starter path across " + tiers.length + " tier lines, and every lesson on its tier's line" }, svgHost);
      var dim = function (tid, tid2) { return M.tier && tid !== M.tier && tid2 !== M.tier; };
      var next = st.filter(function (l) { return state(l) === "open"; })[0];
      // 1 the tier lines (under the route)
      var lines = S("g", { fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round" }, svg);
      if (mode === "h") L.tiers.forEach(function (t) {
        S("path", { d: t.path, class: "mown" + (t.upcoming || t.empty ? " soon" : "") + (dim(t.id) ? " seg-dim" : ""), stroke: t.color }, lines);
      });
      else {
        L.tiers.forEach(function (t) { S("text", { x: t.x, y: L.top, class: "mtier", fill: t.color, "text-anchor": "middle", "aria-hidden": "true" }, svg).textContent = t.title.charAt(0); });
        L.tiers.forEach(function (t) {
          S("path", { d: "M" + t.x + " 32 L" + t.x + " " + t.y0, class: "mcol" + (dim(t.id) ? " seg-dim" : ""), stroke: t.color }, lines);
          S("path", { d: "M" + t.x + " " + t.y0 + " L" + t.x + " " + t.y1, class: "mown" + (t.upcoming || !t.n ? " soon" : "") + (dim(t.id) ? " seg-dim" : ""), stroke: t.color }, lines);
        });
      }
      // 2 the starter route, its start and its bridge capsules
      var rg = S("g", { fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round" }, svg);
      L.segs.forEach(function (sg) {
        var d = "M" + sg.pts.map(function (q) { return q[0] + " " + q[1]; }).join(" L");
        S("path", { d: d, stroke: "var(--lx-surface)", "stroke-width": 13 }, rg);
        S("path", { d: d, stroke: sg.color, "stroke-width": 7, class: "mroute", opacity: dim(sg.tier) ? .25 : 1 }, rg);
      });
      if (L.stops.length) { var f0 = L.stops[0]; S("path", { d: mode === "h" ? "M" + (f0.x - 28) + " " + f0.y + " L" + f0.x + " " + f0.y : "M" + f0.x + " " + (f0.y - 24) + " L" + f0.x + " " + f0.y, stroke: f0.color, "stroke-width": 7, "stroke-linecap": "round", opacity: .5 }, rg); }
      L.caps.forEach(function (c) {
        S("rect", { x: c.x, y: c.y, width: c.w, height: c.h, rx: Math.min(c.w, c.h) / 2, fill: "var(--lx-surface)", stroke: "var(--lx-line-2)", "stroke-width": 2, "stroke-dasharray": c.dashed ? "3 4" : null }, svg);
        S("text", { x: c.tx, y: c.ty, "text-anchor": "middle", class: "mlabel sub", "aria-hidden": "true" }, svg).textContent = c.text;
      });
      // 3 the starter stations, 0 to 13
      L.stops.forEach(function (p) {
        var l = p.lesson, s = state(l), g = S("g", { class: dim(l.tier, l.tier2) ? "seg-dim" : "" }, svg);
        var stn = S("g", { class: "stn " + s + (M.sel === p.key ? " sel" : ""), tabindex: 0, role: "button", "aria-haspopup": "dialog", "data-i": p.i, "data-key": p.key, "data-line": "route",
          style: "--c:" + p.color, "aria-label": ariaStop(l, s) }, g);
        if (next === l) S("circle", { cx: p.x, cy: p.y, r: 17, class: "pulse" }, stn);
        S("circle", { cx: p.x, cy: p.y, r: 21, class: "ring" }, stn);
        S("circle", { cx: p.x, cy: p.y, r: 17, class: "face" }, stn);
        LX.iconInto(stn, l.icon || "map", p.x, p.y, 18);
        if (s === "done") badge(stn, p.x + 13, p.y - 13, 8);
        onActivate(stn, function () { open(p.key); });
        if (mode === "h") {
          var y0 = p.y + p.lab0;
          S("text", { x: p.x, y: y0, "text-anchor": "middle", class: "mlabel sub", "aria-hidden": "true" }, g).textContent = p.i;
          p.lines.forEach(function (ln, j) { S("text", { x: p.x, y: y0 + 15 + j * 14, "text-anchor": "middle", class: "mlabel" + (s === "up" ? " up" : ""), "aria-hidden": "true" }, g).textContent = ln; });
        } else {
          p.lines.forEach(function (ln, j) { S("text", { x: p.textX, y: p.ty + j * 15, class: "mlabel" + (s === "up" ? " up" : ""), "aria-hidden": "true" }, g).textContent = ln; });
          S("text", { x: p.textX, y: p.subY, class: "mlabel sub", "aria-hidden": "true" }, g).textContent = l.minutes + " min · " + (s === "open" ? "open now" : s === "done" ? "done" : "coming soon");
          var hit = S("rect", { x: p.textX - 6, y: p.top + 4, width: L.W - p.textX + 6, height: p.h - 8, class: "mhit", "aria-hidden": "true" }, g);
          hit.addEventListener("click", function () { open(p.key); });
        }
      });
      // 4 each tier line: its label (opens the tier card), then its stations in curriculum order
      L.tiers.forEach(function (t) {
        var T = tiers[t.k], gl = S("g", { class: dim(t.id) ? "seg-dim" : "" }, svg);
        var hd = S("g", { class: "mext", tabindex: 0, role: "button", "aria-haspopup": "dialog", "data-k": t.k, "data-line": t.id,
          "aria-label": T.title + " line: " + (t.n ? t.n + " lessons beyond the starter path, " : "") + t.summary.replace(/ · /g, ", ") + ". Open the tier card" }, gl);
        if (mode === "h") {
          S("rect", { x: t.hx - 5, y: t.hy - 15, width: t.tw + t.sw + 22, height: 21, rx: 6, class: "mhit" }, hd);
          var tx = S("text", { x: t.hx, y: t.hy, class: "mhead" }, hd);
          S("tspan", { class: "mtier", fill: t.color }, tx).textContent = T.title.toUpperCase();
          S("tspan", { class: "mtext", dx: 10 }, tx).textContent = t.summary;
        } else {
          S("rect", { x: t.hx - 6, y: t.hy - 15, width: L.W - t.hx + 4, height: 22 + 14 * t.sum.length, rx: 6, class: "mhit" }, hd);
          S("text", { x: t.hx, y: t.hy, class: "mtier", fill: t.color }, hd).textContent = t.head.toUpperCase();
          t.sum.forEach(function (ln, j) { S("text", { x: t.hx, y: t.hy + 16 + 14 * j, class: "mtext" }, hd).textContent = ln; });
        }
        onActivate(hd, function () { openTier(t.k, true); });
        L.own.filter(function (o) { return o.tier === t.k; }).forEach(function (o) {
          var l = o.m, s = state(l), g = S("g", { class: "mown-st" + (dim(l.tier, l.tier2) ? " seg-dim" : "") }, gl);
          var stn = S("g", { class: "stn own " + s + " k-" + o.kind + (M.sel === o.key ? " sel" : ""), tabindex: 0, role: "button", "aria-haspopup": "dialog", "data-key": o.key,
            "data-line": t.id, style: "--c:" + o.color, "aria-label": ariaOwn(l, s) }, g);
          S("circle", { cx: o.x, cy: o.y, r: 15, class: "hit" }, stn);
          S("circle", { cx: o.x, cy: o.y, r: 14, class: "ring" }, stn);
          shapeInto(stn, o.kind, o.x, o.y, o.r, "face");
          if (s === "done") badge(stn, o.x + 9, o.y - 9, 6);
          onActivate(stn, function () { open(o.key); });
          var lab = function (el) { el.addEventListener("click", function () { open(o.key); }); return el; };
          if (mode === "h") {
            if (o.code) lab(S("text", { x: o.x, y: o.ly, "text-anchor": "middle", class: "mlabel code" + (s === "up" ? " up" : ""), "aria-hidden": "true" }, g)).textContent = o.code;
          } else {
            if (o.code) lab(S("text", { x: o.textX, y: o.ty, class: "mlabel code" + (s === "up" ? " up" : ""), "aria-hidden": "true" }, g)).textContent = o.code;
            o.lines.forEach(function (ln, j) {
              lab(S("text", { x: o.textX + (j ? 0 : o.cwd), y: o.ty + j * 15, class: "mlabel" + (s === "up" ? " up" : ""), "aria-hidden": "true" }, g)).textContent = ln;
            });
            lab(S("rect", { x: o.textX - 6, y: o.top + 2, width: L.W - o.textX + 6, height: o.h - 4, class: "mhit", "aria-hidden": "true" }, g));
          }
        });
      });
      // 5 the math toolbox shelf
      shelf.innerHTML = ""; shelf.hidden = !tools.length;
      if (tools.length) {
        var sid = hid + "-tools", hd2 = H("div", { class: "hd" }, shelf);
        H("span", { class: "tt", id: sid, text: "Math toolbox" }, hd2); H("span", { class: "lx-hint", text: "not a line: open a tool whenever a lesson needs it" }, hd2);
        var chips = H("div", { class: "chips", role: "group", "aria-labelledby": sid }, shelf);
        tools.forEach(function (t, j) {
          var s = state(t), key = "k" + j;
          var b = H("button", { type: "button", class: "lx-tool " + s + (M.sel === key ? " sel" : ""), "data-key": key, "data-line": "toolbox", "aria-haspopup": "dialog",
            "aria-label": (t.code ? t.code + ", " : "") + "math toolbox: " + t.title + (s === "up" ? ". Coming soon" : s === "done" ? ". Done" : ". Open now") }, chips);
          H("span", { class: "sh", "aria-hidden": "true" }, b); H("b", { text: t.code || "" }, b); H("span", { class: "nm", text: t.title }, b);
          b.addEventListener("click", function () { open(key); });
        });
      }
    }
    var lastW = 0;
    if (window.ResizeObserver) new ResizeObserver(function () { var w = wrap.clientWidth; if (LX.visible(wrap) && Math.abs(w - lastW) > 4) { lastW = w; close(); render(); } }).observe(wrap);
    LX.on("progress", render);
    render();
    // names and codes are kept apart with the map's own fonts: measure again once they have loaded
    if (document.fonts && document.fonts.status !== "loaded") document.fonts.ready.then(function () { meas = measurer(host); if (!card) render(); });
    return { render: render, open: open, close: close, layout: function () { return Lc; } };
  };
  LX.ready(function () {
    document.querySelectorAll("[data-lx-metro]").forEach(function (host) {
      LX.json(host.getAttribute("data-src") || LX.base + "data/path.json").then(function (p) {
        host.lxMetro = LX.Metro(host, p); host.classList.add("is-live");
        var list = document.querySelector(host.getAttribute("data-list") || ".lx-listview"); if (list) list.open = false;
      }, function (e) { console.error("Learn course map: path.json could not be loaded", e); });
    });
  });
})();
