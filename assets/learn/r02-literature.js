// r02-literature.js — Research studio R2, "How do you find out what is already known?" (W2, 2026-11-03).
//
// Data:
//   assets/learn/data/r02-literature-openalex.json  a dated OpenAlex snapshot (scripts/build_learn_r02_snapshot.py): five
//                                                   search strings with their counts, the follow-up search, the five
//                                                   most-cited hits, the twelve matrix papers, the review used for
//                                                   snowballing and the three papers the follow-up search brings in
//                                                   (metadata only), and which papers each route finds
//   assets/learn/data/r02-literature.json           the studio's own text: concept blocks, the ladder questions, one-line
//                                                   summaries and the first-pass coding of the twelve papers, the
//                                                   three-pass worked example, practice plan, exemplars, rubric line
// No live API call: the page reads the snapshot and links the same searches on OpenAlex (W2 brief §3).
//
// What the reader does (step cards): build two concept blocks into a search string; climb a ladder of five strings and
// predict each count; log the searches; snowball backward and forward from one review and see which papers each route
// finds; code four papers into a twelve-paper concept matrix (LX.CardSort, toggles); find the empty cell of storage
// against extreme periods; decide whether it is a gap; search the cell directly; do a first pass on the closest paper;
// draft a gap statement. The exemplars (LX.Exemplars), the rubric (LX.Rubric, positioning), a flowchart, a comparison
// table and a checklist follow. No originality judgement is made: an empty cell is a lead, not a gap (curriculum §11.3).
//
// The pure model is exported for Node: _tests/learn/test_r02-literature.js checks every number on the page against the
// two data files and writes the no-JS fallbacks (task, exemplars, rubric) in its --write mode.
(function () {
  "use strict";
  var KEYS = ["storage", "extreme", "full"];

  // ---------------------------------------------------------------- pure model
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function f0(v) { return Math.round(v).toLocaleString("en-US"); }
  function dateText(iso) {
    var M = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"], p = iso.split("-");
    return (+p[2]) + " " + M[+p[1] - 1] + " " + p[0];
  }
  // a string from the reader's picks: phrases quoted, OR inside a block, AND between blocks
  function queryString(blocks, picks) {
    var parts = blocks.map(function (b) {
      var t = (picks[b.id] || []).filter(function (x) { return b.terms.indexOf(x) >= 0; }).map(function (x) { return /\s/.test(x) ? '"' + x + '"' : x; });
      return !t.length ? "" : t.length === 1 ? t[0] : "(" + t.join(" OR ") + ")";
    }).filter(Boolean);
    return parts.join(" AND ");
  }
  // percent-encoded as Python's urllib.parse.quote(q, safe="") does in the snapshot script, so the addresses are identical
  function apiURL(q) {
    return "https://api.openalex.org/works?filter=title_and_abstract.search:" + encodeURIComponent(q).replace(/[!'()*]/g, function (c) { return "%" + c.charCodeAt(0).toString(16).toUpperCase(); });
  }
  // the snapshot's count for a string, if the snapshot holds that exact string (ladder or follow-up)
  function knownCount(S, q) {
    var hit = S.ladder.concat([S.targeted]).filter(function (r) { return r.query === q || "(" + r.query + ")" === q; })[0];
    return hit ? hit.count : null;
  }
  // which of the twelve papers each route finds: the "model" search string, backward and forward snowballing
  function routes(S) {
    var all = S.matrix.map(function (p) { return p.doi; }), search = S.found_by.model, back = S.snowball.backward, fwd = S.snowball.forward;
    var has = function (l, d) { return l.indexOf(d) >= 0; };
    var snow = all.filter(function (d) { return has(back, d) || has(fwd, d); });
    var union = all.filter(function (d) { return has(search, d) || has(snow, d); });
    return { all: all, search: search, backward: back, forward: fwd, snow: snow, union: union,
             onlySnow: all.filter(function (d) { return has(snow, d) && !has(search, d); }),
             onlySearch: all.filter(function (d) { return has(search, d) && !has(snow, d); }) };
  }
  // the reference marks of the matrix (yes cells on), and the starting marks: every row coded except the reader's four
  function refMarks(D) { var m = {}; D.matrix.forEach(function (p) { m[p.key] = {}; KEYS.forEach(function (k) { m[p.key][k] = p.ref[k] === "yes"; }); }); return m; }
  function startMarks(D) { var m = refMarks(D); D.matrix.forEach(function (p) { if (p.code) KEYS.forEach(function (k) { m[p.key][k] = false; }); }); return m; }
  // the two-by-two of storage against extreme periods, from any marks
  function cross(D, marks) {
    var c = { yy: [], yn: [], ny: [], nn: [] };
    D.matrix.forEach(function (p) { var m = marks[p.key] || {}; c[(m.storage ? "y" : "n") + (m.extreme ? "y" : "n")].push(p.key); });
    return c;
  }
  function emptyCells(c) { return Object.keys(c).filter(function (k) { return !c[k].length; }); }
  // the snapshot paper for a DOI (matrix, fillers, top or review)
  function paper(S, doi) {
    var all = S.matrix.concat(S.fillers, S.top, [S.review]);
    return all.filter(function (p) { return p.doi.toLowerCase() === doi.toLowerCase(); })[0] || null;
  }
  function cite(p) {
    var a = p.authors, who = a.length === 1 ? a[0].split(" ").pop() : a.length === 2 ? a[0].split(" ").pop() + " and " + a[1].split(" ").pop() : a[0].split(" ").pop() + " et al.";
    return who + " (" + p.year + ")";
  }
  // the no-JS version of the task (what to produce is the page's task card, above the interactive): the ladder, the
  // routes, the matrix and the follow-up search, as HTML
  function staticTask(D, S) {
    var h = [], date = dateText(S.meta.as_of), R = routes(S);
    h.push('<p><b>The worked question:</b> ' + esc(D.question) + "</p>");
    h.push('<p class="lx-eyebrow">Five search strings, OpenAlex titles and abstracts, ' + date + "</p>");
    h.push('<div class="lx-scroll-x"><table class="lx-facts"><thead><tr><th scope="col">Change</th><th scope="col">String</th><th scope="col">Works</th></tr></thead><tbody>');
    S.ladder.concat([S.targeted]).forEach(function (r) {
      h.push('<tr><td>' + esc(r.label) + '</td><td><code>' + esc(r.query) + '</code></td><td class="n"><a href="' + esc(r.url) + '">' + f0(r.count) + "</a></td></tr>");
    });
    h.push("</tbody></table></div>");
    h.push("<p>Snowballing from " + esc(cite(S.review)) + ": " + f0(S.snowball.references) + " references (backward) and " + f0(S.snowball.cited_by) + " citing works (forward) on " + date +
      ". Of the 12 matrix papers, the AND-the-model string finds " + R.search.length + ", backward snowballing " + R.backward.length + " and forward snowballing " + R.forward.length +
      "; together, all " + R.union.length + ".</p>");
    h.push('<p class="lx-eyebrow">The concept matrix, coded from the abstracts (first pass)</p>');
    h.push('<div class="lx-scroll-x"><table class="lx-facts"><thead><tr><th scope="col">Paper</th>' + D.bins.map(function (b) { return '<th scope="col">' + esc(b.label) + "</th>"; }).join("") + "</tr></thead><tbody>");
    D.matrix.forEach(function (p) {
      h.push('<tr><td><a href="https://doi.org/' + esc(p.doi) + '">' + esc(p.name) + "</a><br><span class=\"lx-hint\">" + esc(p.summary) + "</span></td>" +
        KEYS.map(function (k) { return "<td>" + esc(p.ref[k]) + "</td>"; }).join("") + "</tr>");
    });
    h.push("</tbody></table></div>");
    var c = cross(D, refMarks(D));
    h.push("<p>Storage linked and extreme periods kept: " + c.yy.length + " papers (the empty cell). Storage only: " + c.yn.length + ". Extremes only: " + c.ny.length + ". Neither: " + c.nn.length + ".</p>");
    h.push("<p>Searching that cell directly (" + esc(S.targeted.label.toLowerCase()) + ") gave " + f0(S.targeted.count) + " works on " + date + "; at least " + S.fillers.length + " of them do both, by their abstracts: " +
      S.fillers.map(function (p) { return '<a href="https://doi.org/' + esc(p.doi) + '">' + esc(D.fillers.filter(function (f) { return f.doi === p.doi; })[0].name) + "</a>"; }).join("; ") +
      ". An empty cell is a lead, not a gap.</p>");
    return h.join("\n");
  }
  var model = { KEYS: KEYS, queryString: queryString, apiURL: apiURL, knownCount: knownCount, routes: routes, refMarks: refMarks, startMarks: startMarks,
                cross: cross, emptyCells: emptyCells, paper: paper, cite: cite, dateText: dateText, staticTask: staticTask, f0: f0 };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H;
  function injectCSS() {
    if (document.getElementById("r2-css")) return;
    var css = [
      ".r2-q{font-family:var(--lx-f-display);font-weight:500;font-size:15.5px;color:var(--lx-ink);margin:0}",
      ".r2-block{display:grid;gap:6px;padding:10px 12px;border:1px solid var(--lx-line);border-radius:12px;background:var(--lx-surface)}",
      ".r2-block .lx-eyebrow{display:flex;gap:8px;align-items:center}",
      ".r2-chips{display:flex;flex-wrap:wrap;gap:6px}",
      ".r2-chip{font:inherit;font-size:14px;min-height:36px;padding:4px 12px;border-radius:999px;border:1px solid var(--lx-line-2);background:var(--lx-surface);color:var(--lx-ink-2);cursor:pointer}",
      ".r2-chip[aria-pressed=true]{background:var(--lx-ink);color:var(--lx-bg);border-color:var(--lx-ink)}",
      ".r2-string{display:grid;gap:6px;padding:10px 12px;border-radius:12px;background:var(--lx-surface-2);border:1px solid var(--lx-line)}",
      ".r2-string code{font-family:var(--lx-f-mono);font-size:13.5px;line-height:1.5;color:var(--lx-ink);white-space:pre-wrap;word-break:break-word;background:transparent;padding:0}",
      ".r2-row{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center}",
      ".r2-ladder{list-style:none;margin:0;padding:0;display:grid;gap:8px}",
      ".r2-ladder li{display:grid;gap:6px;padding:10px 12px;border:1px solid var(--lx-line);border-radius:12px;background:var(--lx-surface)}",
      ".r2-ladder li.locked{opacity:.55}",
      ".r2-ladder .top{display:flex;justify-content:space-between;gap:10px;align-items:baseline;flex-wrap:wrap}",
      ".r2-ladder code{font-family:var(--lx-f-mono);font-size:12.5px;white-space:pre-wrap;word-break:break-word;color:var(--lx-ink-2);background:transparent;padding:0}",
      ".r2-n{font-family:var(--lx-f-mono);font-weight:600;font-size:18px;color:var(--lx-ink)}",
      ".r2-list{list-style:none;margin:0;padding:0;display:grid;gap:6px}",
      ".r2-list li{padding:8px 10px;border-radius:10px;border:1px solid var(--lx-line);background:var(--lx-surface);font-size:14px;color:var(--lx-ink-2)}",
      ".r2-list li b{color:var(--lx-ink);font-family:var(--lx-f-display);font-weight:500}",
      ".r2-list li.hit{border-color:var(--lx-good);box-shadow:inset 3px 0 0 var(--lx-good)}",
      ".r2-tags{display:inline-flex;gap:4px;flex-wrap:wrap;margin-left:6px}",
      ".r2-tag{font-size:11.5px;padding:1px 7px;border-radius:999px;border:1px solid var(--lx-line-2);color:var(--lx-ink-3)}",
      ".r2-tag.on{border-color:var(--lx-good);color:var(--lx-ink)}",
      ".r2-sum{display:block;font-size:13px;color:var(--lx-ink-3);font-family:var(--lx-f-body,inherit);font-weight:400;line-height:1.35;flex-basis:100%}",
      ".r2-matrix .lx-cs-row.head{font-size:10.5px;letter-spacing:0}",
      ".r2-x{border-collapse:collapse;font-size:14px;width:100%;max-width:520px}",
      ".page-learn .r2-x>:not(caption)>*>*{background:transparent!important;color:inherit;box-shadow:none!important}",
      ".r2-x th,.r2-x td{border:1px solid var(--lx-line);padding:6px 8px;text-align:center}",
      ".r2-x th{font-family:var(--lx-f-display);font-weight:500;font-size:12.5px;color:var(--lx-ink-3)}",
      ".r2-x td button{font:inherit;width:100%;min-height:48px;border-radius:8px;border:1px dashed var(--lx-line-2);background:var(--lx-surface);color:var(--lx-ink);cursor:pointer}",
      ".r2-x td button b{font-family:var(--lx-f-mono);font-size:18px}",
      ".r2-x td button.right{border:2px solid var(--lx-good)} .r2-x td button.wrong{border:2px solid var(--lx-warn)}",
      ".r2-passes{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}",
      ".r2-passes div{padding:10px;border-radius:12px;border:1px solid var(--lx-line);background:var(--lx-surface);font-size:13.5px;color:var(--lx-ink-2);display:grid;gap:4px;align-content:start}",
      ".r2-passes b{font-family:var(--lx-f-display);font-weight:500;color:var(--lx-ink);font-size:14.5px}",
      ".r2-sheet{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:4px 12px;margin:0;font-size:14px}",
      ".r2-sheet dt{font-family:var(--lx-f-display);font-weight:500;color:var(--lx-ink)} .r2-sheet dd{margin:0;color:var(--lx-ink-2)}",
      ".r2-ta{font:inherit;font-size:15px;min-height:96px;padding:8px 10px;border-radius:10px;border:1px solid var(--lx-line-2);background:var(--lx-surface);color:var(--lx-ink);resize:vertical;width:100%}",
      ".r2-plan{margin:0;padding-left:1.2rem;font-size:14px;color:var(--lx-ink-2)} .r2-plan li{margin:3px 0}",
      "@media (max-width:640px){.r2-passes{grid-template-columns:minmax(0,1fr)}.r2-sheet{grid-template-columns:minmax(0,1fr)}.r2-sheet dd{margin-bottom:6px}}"
    ].join("\n");
    H("style", { id: "r2-css", text: css }, document.head);
  }
  var bold = function (t) { return LX.rich(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>"); };
  function doiLink(doi, text, parent) { return H("a", { href: "https://doi.org/" + doi, text: text }, parent); }
  function saw(host, ok, html) { host.innerHTML = ""; H("div", { class: "lx-saw" + (ok ? "" : " no"), html: LX.icon(ok ? "check" : "question") + "<div>" + html + "</div>" }, host); }

  // ---- step 1: two concept blocks into one string
  function blocksStep(D, S) {
    return function (act, api) {
      var picks = LX.store.get("r2-blocks", null) || {};
      D.blocks.forEach(function (b) { if (!picks[b.id]) picks[b.id] = b.start.slice(); });
      H("p", { class: "r2-q", text: "“" + D.question + "”" }, act);
      D.blocks.forEach(function (b) {
        var box = H("div", { class: "r2-block" }, act);
        H("p", { class: "lx-eyebrow", text: "Block " + b.id + " · " + b.label + " (OR inside the block)" }, box);
        var row = H("div", { class: "r2-chips", role: "group", "aria-label": "Block " + b.id + ": " + b.label }, box);
        b.terms.forEach(function (t) {
          var on = picks[b.id].indexOf(t) >= 0, c = H("button", { type: "button", class: "r2-chip", "aria-pressed": on ? "true" : "false", text: t }, row);
          c.addEventListener("click", function () {
            var l = picks[b.id], i = l.indexOf(t);
            if (i >= 0) l.splice(i, 1); else l.push(t);
            c.setAttribute("aria-pressed", i >= 0 ? "false" : "true");
            LX.store.set("r2-blocks", picks); draw();
          });
        });
      });
      var out = H("div", { class: "r2-string" }, act);
      H("p", { class: "lx-eyebrow", text: "Your string (AND between the blocks)" }, out);
      var code = H("code", null, out), info = H("p", { class: "lx-hint", "aria-live": "polite" }, out), row = H("div", { class: "r2-row" }, out);
      var copy = H("button", { class: "lx-btn small ghost", type: "button", text: "Copy the string" }, row), link = H("a", { class: "lx-btn small ghost", text: "Run it on OpenAlex (raw results)" }, row);
      var st = H("span", { class: "lx-hint", "aria-live": "polite" }, row);
      copy.addEventListener("click", function () { LX.copyText(code.textContent).then(function (ok) { st.textContent = ok ? "Copied." : "Select the string and copy it."; }); });
      function draw() {
        var q = queryString(D.blocks, picks), n = knownCount(S, q);
        code.textContent = q || "(pick at least one term in each block)";
        link.setAttribute("href", q ? apiURL(q) : "https://openalex.org/");
        info.innerHTML = n != null ? "OpenAlex matched <b>" + f0(n) + "</b> works for this exact string on " + dateText(S.meta.as_of) + " (titles and abstracts)." :
          "No stored count for this string: run it yourself and write the date and the count in your log.";
        var ready = D.blocks.every(function (b) { return picks[b.id].length >= 2; });
        if (ready) { api.done(); api.saw("Synonyms go inside a block with OR; blocks join with AND. Quotes keep a phrase together. Next: watch how each change moves the count."); }
      }
      draw();
    };
  }

  // ---- step 2: the ladder of five strings, predict each change
  function ladderStep(D, S) {
    return function (act, api) {
      var ol = H("ol", { class: "r2-ladder" }, act), got = 0, right = 0, lis = [];
      S.ladder.forEach(function (r, i) {
        var li = H("li", { class: i ? "locked" : "" }, ol), top = H("div", { class: "top" }, li);
        H("b", { text: (i + 1) + ". " + r.label }, top);
        var n = H("span", { class: "r2-n", text: i ? "?" : f0(r.count) }, top);
        H("code", { text: r.query }, li);
        var q = i ? D.ladder_q[i - 1] : null, fb;
        if (q) {
          H("p", { class: "lx-hint", text: q.q }, li);
          var g = H("div", { class: "lx-qbtns", role: "group", "aria-label": q.q }, li);
          fb = H("div", { "aria-live": "polite" }, li);
          g.parentNode.insertBefore(fb, g.nextSibling);
          [["more", "More"], ["fewer", "Fewer"]].forEach(function (o) {
            var b = H("button", { class: "lx-choice", type: "button", "aria-pressed": "false", text: o[1], disabled: i > 1 }, g);
            b.addEventListener("click", function () {
              if (n.textContent !== "?") return;
              var ok = o[0] === q.answer; b.setAttribute("aria-pressed", "true"); b.classList.add(ok ? "right" : "wrong");
              n.textContent = f0(r.count); li.classList.remove("locked"); got++; if (ok) right++;
              saw(fb, ok, "<b>" + (ok ? "Right." : "Not quite.") + "</b> " + f0(S.ladder[i - 1].count) + " → " + f0(r.count) + ". " + LX.esc(q.why));
              if (lis[i + 1]) [].forEach.call(lis[i + 1].querySelectorAll("button"), function (x) { x.disabled = false; });
              if (got === D.ladder_q.length) {
                api.done();
                api.saw("You called " + right + " of " + got + ". Counts are as of " + dateText(S.meta.as_of) + " and grow every day: log the date with every count.");
              }
            });
          });
        }
        lis.push(li);
      });
      H("p", { class: "lx-hint", html: "Counts: OpenAlex titles and abstracts, " + dateText(S.meta.as_of) + ". Each count links the same search: " +
        S.ladder.map(function (r, i) { return '<a href="' + LX.esc(r.url) + '">' + (i + 1) + "</a>"; }).join(" · ") + " (raw results)." }, act);
    };
  }

  // ---- step 3: what came back, and the log
  function hitsStep(D, S) {
    return function (act, api) {
      var last = S.ladder[S.ladder.length - 1];
      H("p", { class: "lx-eyebrow", text: "The five most-cited of " + f0(last.count) + " works for string 5 (citations as of " + dateText(S.meta.as_of) + ")" }, act);
      var ul = H("ul", { class: "r2-list" }, act);
      S.top.forEach(function (p) {
        var li = H("li", null, ul); doiLink(p.doi, p.title, H("b", null, li));
        H("span", { text: " · " + cite(p) + ", " + p.venue + " · cited by " + f0(p.cited_by) }, li);
      });
      var inM = S.found_by.storage.length, inModel = S.found_by.model.length;
      H("p", { class: "lx-hint", html: "Of the 12 papers in this studio's matrix, string 4 finds <b>" + inModel + "</b> and string 5 only <b>" + inM +
        "</b>: an extra AND can drop papers whose abstracts use other words." }, act);
      var row = H("div", { class: "r2-row" }, act), b = H("button", { class: "lx-btn small", type: "button", text: "Add the five searches to my log" }, row);
      var log = H("div", { hidden: true, class: "lx-scroll-x" }, act);
      b.addEventListener("click", function () {
        log.hidden = false; log.innerHTML = "";
        var t = H("table", { class: "lx-facts" }, log), hr = H("tr", null, H("thead", null, t));
        ["Database and field", "String", "Date", "Works"].forEach(function (x) { H("th", { scope: "col", text: x }, hr); });
        var tb = H("tbody", null, t);
        S.ladder.forEach(function (r) { var tr = H("tr", null, tb); H("td", { text: "OpenAlex, title and abstract" }, tr); H("td", null, tr).appendChild(H("code", { text: r.query })); H("td", { text: S.meta.as_of }, tr); H("td", { class: "n", text: f0(r.count) }, tr); });
        LX.store.set("r2-log", S.ladder.map(function (r) { return [r.query, S.meta.as_of, r.count]; }));
        api.done(); api.saw("A search log is four things per line: where, what, when and how many. With it, a reviewer can repeat your search and see what changed since.");
      });
    };
  }

  // ---- step 4: snowball from one review
  function snowStep(D, S) {
    return function (act, api) {
      var R = routes(S), rev = S.review;
      H("p", { html: "The review: " + '<a href="https://doi.org/' + rev.doi + '">' + LX.esc(rev.title) + "</a>, " + LX.esc(cite(rev)) + ", " + LX.esc(rev.venue) + " (open access). " + LX.esc(D.review_summary) }, act);
      H("p", { class: "lx-hint", html: "On " + dateText(S.meta.as_of) + ": <b>" + f0(S.snowball.references) + "</b> references (backward: <a href=\"" + LX.esc(S.snowball.backward_url) + "\">list</a>) and <b>" +
        f0(S.snowball.cited_by) + "</b> citing works (forward: <a href=\"" + LX.esc(S.snowball.forward_url) + "\">list</a>)." }, act);
      var seg = H("div", { class: "lx-seg", role: "group", "aria-label": "Which route found each paper" }, act), seen = {}, cur = null;
      var ul = H("ul", { class: "r2-list" }, act), out = H("p", { class: "lx-hint", "aria-live": "polite" }, act), rows = {};
      S.matrix.forEach(function (p) {
        var li = H("li", null, ul), d = D.matrix.filter(function (x) { return x.doi === p.doi; })[0];
        H("b", { text: d.name }, li); var tags = H("span", { class: "r2-tags" }, li);
        rows[p.doi] = { li: li, tags: tags };
      });
      var opts = [["search", "Search (string 4)", R.search], ["backward", "Backward", R.backward], ["forward", "Forward", R.forward]];
      var btns = opts.map(function (o) {
        var b = H("button", { type: "button", "aria-pressed": "false", text: o[1] }, seg);
        b.addEventListener("click", function () { show(o); });
        return b;
      });
      function show(o) {
        cur = o[0]; seen[o[0]] = true;
        btns.forEach(function (b, i) { b.setAttribute("aria-pressed", opts[i][0] === cur ? "true" : "false"); });
        S.matrix.forEach(function (p) {
          var r = rows[p.doi], hit = o[2].indexOf(p.doi) >= 0; r.li.classList.toggle("hit", hit);
          r.tags.innerHTML = ""; opts.forEach(function (x) { if (seen[x[0]]) H("span", { class: "r2-tag" + (x[2].indexOf(p.doi) >= 0 ? " on" : ""), text: (x[2].indexOf(p.doi) >= 0 ? "✓ " : "– ") + x[1].split(" ")[0] }, r.tags); });
        });
        out.textContent = o[1] + " finds " + o[2].length + " of the 12.";
        if (Object.keys(seen).length === 3) {
          api.done();
          api.saw("Search found **" + R.search.length + "**, backward snowballing **" + R.backward.length + "**, forward **" + R.forward.length + "**; together all **" + R.union.length +
            "**. Search alone missed " + R.onlySnow.length + "; snowballing alone missed " + R.onlySearch.length + ". Use both, and log both.");
        }
      }
    };
  }

  // ---- step 5: code four papers into the matrix
  function matrixStep(D, S, state) {
    return function (act, api) {
      var marks = LX.store.get("r2-marks", null) || startMarks(D);
      state.marks = marks;
      var toCode = D.matrix.filter(function (p) { return p.code; }).map(function (p) { return p.name; });
      H("p", { class: "lx-hint", text: "Eight rows are coded for you; “Why” opens their reasons after a check. Code the four marked “to code”: tick a cell only when the summary says so (the coding rule)." }, act);
      var cs = LX.CardSort(act, { mode: "toggles", bins: D.bins, checkLabel: "Check my coding", cls: "r2-matrix",
        items: D.matrix.map(function (p) { return { key: p.key, label: p.name + (p.code ? " · to code" : ""), color: p.code ? "var(--lx-accent)" : "var(--lx-ink-3)", ref: p.ref, why: p.why }; }),
        marks: marks, onChange: function (m) { LX.store.set("r2-marks", m); state.marks = m; },
        onCheck: function (res) {
          var mine = D.matrix.filter(function (p) { return p.code; }), agree = 0, total = 0;
          mine.forEach(function (p) { KEYS.forEach(function (k) { if (p.ref[k] !== "partly") { total++; if (res.cells[p.key][k] === "agree") agree++; } }); });
          api.done();
          api.saw("Your four rows agree with the course's coding on **" + agree + " of " + total + "** clear cells. Open “Why” on any row: mentioning storage is not the same as linking it. Coding from abstracts is a first pass; a second pass can change a cell.", agree < total - 2);
        } });
      // the one-line summary under each paper's name (the toggles list shows names only)
      var rowsEl = cs.el.querySelectorAll(".lx-cs-row:not(.head) .nm");
      D.matrix.forEach(function (p, i) { if (rowsEl[i] && p.code) { var s = H("span", { class: "r2-sum" }, rowsEl[i]); s.appendChild(document.createTextNode(p.summary + " ")); doiLink(p.doi, "DOI", s); } });
      H("p", { class: "lx-hint", text: D.toCodeNote || ("To code: " + toCode.join("; ") + ".") }, act);
    };
  }

  // ---- step 6: the empty cell, and is it a gap?
  function crossStep(D, S, state) {
    return function (act, api) {
      var c = cross(D, state.marks || LX.store.get("r2-marks", null) || refMarks(D)), empty = emptyCells(c), picked = false;
      var t = H("table", { class: "r2-x" }, H("div", { class: "lx-scroll-x" }, act)), hr = H("tr", null, H("thead", null, t));
      H("th", { scope: "col", text: "" }, hr); H("th", { scope: "col", text: "Extremes kept" }, hr); H("th", { scope: "col", text: "No extremes" }, hr);
      var tb = H("tbody", null, t), fb = H("div", { "aria-live": "polite" }, act), q = H("div", { hidden: true }, act);
      [["y", "Storage linked"], ["n", "No storage link"]].forEach(function (r) {
        var tr = H("tr", null, tb); H("th", { scope: "row", text: r[1] }, tr);
        ["y", "n"].forEach(function (e) {
          var k = r[0] + e, td = H("td", null, tr), names = c[k].map(function (key) { return D.matrix.filter(function (p) { return p.key === key; })[0].name; });
          var b = H("button", { type: "button", html: "<b>" + c[k].length + "</b>", "aria-label": r[1] + ", " + (e === "y" ? "extremes kept" : "no extremes") + ": " + c[k].length + " papers" + (names.length ? " (" + names.join("; ") + ")" : "") }, td);
          b.addEventListener("click", function () {
            var ok = empty.indexOf(k) >= 0; b.classList.add(ok ? "right" : "wrong");
            saw(fb, ok, ok ? "<b>That is the empty cell.</b> No paper in your twelve both links storage between periods and keeps extreme periods." :
              "<b>Not that one.</b> " + c[k].length + " paper" + (c[k].length === 1 ? "" : "s") + " here: " + LX.esc(names.join("; ") || "none") + ".");
            if (ok && !picked) { picked = true; q.hidden = false; }
          });
        });
      });
      if (!empty.length) H("p", { class: "lx-hint", text: "Your coding leaves no cell empty: check the four rows you coded, or go on with the course's coding." }, act);
      H("p", { class: "r2-q", text: D.gap_q.q }, q);
      var g = H("div", { class: "lx-qbtns", role: "group", "aria-label": D.gap_q.q }, q), qf = H("div", { "aria-live": "polite" }, q);
      D.gap_q.options.forEach(function (o) {
        var b = H("button", { class: "lx-choice", type: "button", "aria-pressed": "false", text: o[1] }, g);
        b.addEventListener("click", function () {
          [].forEach.call(g.children, function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); x.classList.remove("right", "wrong"); });
          var ok = o[0] === D.gap_q.answer; b.classList.add(ok ? "right" : "wrong");
          saw(qf, ok, LX.esc(D.gap_q.feedback[o[0]]));
          if (ok) api.done();
        });
      });
      if (!empty.length) { q.hidden = false; }
    };
  }

  // ---- step 7: search the empty cell directly
  function targetedStep(D, S) {
    return function (act, api) {
      var T = S.targeted;
      var box = H("div", { class: "r2-string" }, act);
      H("p", { class: "lx-eyebrow", text: "String 6 · " + T.label }, box);
      H("code", { text: T.query }, box);
      H("p", { class: "lx-hint", html: "<b>" + f0(T.count) + "</b> works on " + dateText(S.meta.as_of) + " (<a href=\"" + LX.esc(T.url) + "\">raw results</a>). Among them, at least three do both, by their abstracts:" }, box);
      var ul = H("ul", { class: "r2-list" }, act);
      D.fillers.forEach(function (f) { var li = H("li", null, ul); doiLink(f.doi, f.name, H("b", null, li)); H("span", { text: " · " + f.summary }, li); });
      var h = D.fillers[0], hs = S.snowball.fillers_citing_review.indexOf(h.doi) >= 0;
      H("p", { class: "r2-q", text: "Which two of your twelve papers does " + h.name + " build on?" }, act);
      var g = H("div", { class: "r2-chips", role: "group", "aria-label": "Pick two papers" }, act), fb = H("div", { "aria-live": "polite" }, act), want = ["p04", "p11"], picks = [];
      D.matrix.forEach(function (p) {
        var b = H("button", { type: "button", class: "r2-chip", "aria-pressed": "false", text: p.name }, g);
        b.addEventListener("click", function () {
          if (picks.indexOf(p.key) >= 0) return;
          picks.push(p.key); b.setAttribute("aria-pressed", "true");
          var hit = picks.filter(function (k) { return want.indexOf(k) >= 0; }).length;
          if (hit === 2 || picks.length >= 4) {
            api.done();
            saw(fb, hit === 2, "<b>" + (hit === 2 ? "Both." : "The two are:") + "</b> Kotzur et al. (2018) for linked storage and Teichgraeber, Küpper and Brandt (2021) for extreme periods: the two cells either side of your empty one. " +
              (hs ? "It also cites the review, so forward snowballing would have found it." : ""));
            api.saw("The empty cell did not survive the search. That is a good result: you now know the closest prior work, and your question must say what it adds to these three.");
          }
        });
      });
    };
  }

  // ---- step 8: three passes on the closest paper
  function passStep(D, S) {
    return function (act, api) {
      var h = D.fillers[0];
      var grid = H("div", { class: "r2-passes" }, act);
      D.passes.forEach(function (p) { var d = H("div", null, grid); H("b", { text: p.label + " · " + p.time }, d); H("span", { text: p.read }, d); H("span", { class: "lx-hint", text: "Out: " + p.out }, d); });
      H("p", { class: "lx-hint", text: "Its headings (open preprint, October 2022), for your first pass: " + D.headings.join(" · ") + "." }, act);
      var c0 = D.five_cs[0];
      H("p", { class: "r2-q", text: "First pass on " + h.name + ": " + c0.q }, act);
      var g = H("div", { class: "lx-qbtns", role: "group", "aria-label": c0.q }, act), fb = H("div", { "aria-live": "polite" }, act);
      var more = H("details", { class: "lx-textalt", hidden: true }, act); H("summary", { text: "The five Cs and the second-pass sheet, worked" }, more);
      var dl = H("dl", { class: "r2-sheet" }, more);
      D.five_cs.forEach(function (c) { H("dt", { text: c.c }, dl); H("dd", { text: c.worked }, dl); });
      var dl2 = H("dl", { class: "r2-sheet" }, more); H("p", { class: "lx-hint", text: "Second pass: the extraction sheet" }, more); more.appendChild(dl2);
      D.sheet.forEach(function (s) { H("dt", { text: s.k }, dl2); H("dd", { text: s.v }, dl2); });
      H("p", { class: "lx-hint", text: "Worked from the open preprint (October 2022); the published version is at the DOI above." }, more);
      c0.options.forEach(function (o) {
        var b = H("button", { class: "lx-choice", type: "button", "aria-pressed": "false", text: o[1] }, g);
        b.addEventListener("click", function () {
          [].forEach.call(g.children, function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); x.classList.remove("right", "wrong"); });
          var ok = o[0] === c0.answer; b.classList.add(ok ? "right" : "wrong");
          saw(fb, ok, ok ? "<b>Right.</b> " + LX.esc(c0.worked) : "<b>Not quite.</b> The headings show a method section and simulation studies on a test system.");
          more.hidden = false; api.done();
          api.saw("Pass one takes minutes and tells you whether to go on. For the closest prior work, always do pass two: fill the extraction sheet, then compare it with your own question.");
        });
      });
    };
  }

  // ---- step 9: the gap statement, and the plan for the practice
  function writeStep(D, S) {
    return function (act, api) {
      var lab = H("label", { class: "r2-q", text: "Draft your gap statement: what you searched (where, when, strings), what the matrix shows, what the direct search found, and how your question differs." }, act);
      var ta = H("textarea", { class: "r2-ta", rows: 4 }, act); ta.setAttribute("aria-label", "Your gap statement");
      ta.value = LX.store.get("r2-gap", "") || "";
      var row = H("div", { class: "r2-row" }, act), cmp = H("a", { class: "lx-btn small", href: "#exemplars", text: "Compare with two answers" }, row);
      H("span", { class: "lx-hint", text: "Your draft stays in this browser." }, row);
      ta.addEventListener("input", function () { LX.store.set("r2-gap", ta.value); if (ta.value.trim().length > 40) api.done(); });
      cmp.addEventListener("click", function () { api.done(); });
      if (ta.value.trim().length > 40) api.done();
      var pl = H("details", { class: "lx-textalt" }, act); H("summary", { text: "Your own literature map: about 4 hours of practice" }, pl);
      var ol = H("ol", { class: "r2-plan" }, pl);
      D.practice.forEach(function (p) { H("li", { text: p.task + " (" + p.min + " min)" }, ol); });
    };
  }

  // ---- exemplars and explain layer (#exemplars), rubric and checklist (#selfcheck)
  function exemplarsSpec(D) {
    var E = D.exemplars;
    return { title: "Two gap statements for the same question", task: E.task, id: "r2-ex",
      answers: [{ key: "weak", label: "Weak answer", level: "Developing", parts: E.weak }, { key: "good", label: "Strong answer", level: "Proficient", parts: E.good }],
      diff: E.diff, note: E.note };
  }
  function explain(D, S) {
    var x = document.getElementById("r02-exemplars"); if (!x) return;
    x.innerHTML = "";
    LX.Exemplars(H("div", { class: "lx-xcard" }, x), exemplarsSpec(D));
    var R = routes(S), c = cross(D, refMarks(D));
    LX.Flowchart(H("div", { class: "lx-xcard" }, x), {
      title: "From a search to a gap you can defend", lede: "The studio's route as a flowchart. Trace the worked question through it.",
      nodes: {
        q: { t: "Question and blocks", tN: ["Question", "and blocks"], s: "synonyms, OR and AND", sN: "OR and AND", k: "end" },
        s: { t: "Search and log", tN: ["Search", "and log"], s: "two databases, dated", sN: "dated" },
        b: { t: "Snowball a review", tN: ["Snowball", "a review"], s: "backward and forward", sN: "both ways" },
        m: { t: "Code a matrix", tN: ["Code a", "matrix"], s: "12+ papers, one rule", sN: "12+ papers" },
        e: { t: "An empty cell?", tN: ["An empty", "cell?"], k: "q" },
        t: { t: "Search the cell", tN: ["Search", "the cell"], s: "log the count", sN: "log it" },
        f: { t: "Still empty?", tN: ["Still", "empty?"], k: "q" },
        r: { t: "Read the closest work", tN: ["Read the", "closest work"], s: "two passes", sN: "two passes" },
        g: { t: "State the gap with evidence", tN: ["State the gap", "with evidence"], k: "end" }
      },
      cols: 3, at: { q: [1, 0], s: [0, 1], b: [2, 1], m: [1, 2], e: [1, 3], t: [2, 4], f: [2, 5], r: [1, 6], g: [2, 7] },
      colsN: 2, atN: { q: [0, 0], s: [0, 1], b: [1, 1], m: [0, 2], e: [0, 3], t: [1, 4], f: [1, 5], r: [0, 6], g: [1, 7] },
      edges: [["q", "s"], ["q", "b"], ["s", "m"], ["b", "m"], ["m", "e"], ["e", "t", "yes"], ["e", "r", "no"], ["t", "f"], ["f", "r", "no"], ["f", "g", "yes"], ["r", "g"]],
      traces: [
        { label: "The worked question", path: ["q", "s", "b", "m", "e", "t", "f", "r", "g"], text: "Five logged strings and one review gave **" + R.union.length + "** papers; the storage-and-extremes cell held **" + c.yy.length +
          "**; a direct search found at least **" + S.fillers.length + "** that do both. Read them, then state what your question adds." },
        { label: "A cell that stays empty", path: ["q", "s", "m", "e", "t", "f", "g"], text: "If the direct search finds nothing, the gap is a candidate: state it with the strings, dates and counts, and still say why it matters. Scarcity alone is not evidence of importance." }
      ], sel: 0 });
    LX.CompareTable(H("div", { class: "lx-xcard" }, x), { title: "Search, snowball or both?", text: true,
      lede: "Each route finds papers the others miss. Log what you did with each.",
      columns: [{ key: "name", label: "Route", main: true }, { key: "finds", label: "Good at" }, { key: "misses", label: "Misses" }, { key: "log", label: "Log" }],
      rows: [
        { key: "oa", name: "Open database search", note: "OpenAlex, Semantic Scholar", finds: "Broad, repeatable searches with exact strings and counts", misses: "Papers that use other words; the worked string 4 missed 3 of the 12", log: "String, field, date, count" },
        { key: "gs", name: "Google Scholar", finds: "The widest coverage and a “cited by” list", misses: "No API and uneven metadata; hard to repeat exactly", log: "String, date, how many results you screened" },
        { key: "bw", name: "Backward snowballing", note: "a paper's references", finds: "The classics a field builds on", misses: "Anything newer than the paper", log: "Seed paper, how many references you screened" },
        { key: "fw", name: "Forward snowballing", note: "works that cite a paper", finds: "Newer work that engages the seed", misses: "Work that never cites the seed", log: "Seed, date (the list grows)" },
        { key: "lib", name: "Curated databases", note: "Scopus, Web of Science", finds: "Cleaner records and subject filters", misses: "Access depends on your library", log: "Database, string, date, count" }
      ] });
  }
  function selfcheck(D) {
    var x = document.getElementById("r02-rubric"); if (!x) return;
    x.innerHTML = "";
    LX.Rubric(H("div", { class: "lx-xcard" }, x), { id: "r2-rubric", code: "R2", title: "Rate your literature map against the rubric",
      lede: "Use your own matrix and gap statement, not the worked one.", competences: D.rubric });
    LX.Checklist(H("div", { class: "lx-xcard" }, x), { id: "r2-checklist", title: "A literature map you can defend", columns: 2,
      lede: "Tick each line for your own topic before you write the gap statement.", doneText: "Now write the gap statement.",
      items: [
        { id: "blocks", label: "Concept blocks", text: "Two or three blocks of synonyms, joined with AND." },
        { id: "log", label: "Search log", text: "Database, field, string, date and count for every search, in two databases." },
        { id: "snow", label: "Snowballing", text: "Backward and forward from at least one review." },
        { id: "screen", label: "Screening", text: "Why each dropped paper was dropped, in a word or two." },
        { id: "matrix", label: "Concept matrix", text: "At least 12 papers, coded by a written rule." },
        { id: "cell", label: "Empty cell", text: "Searched directly, with the string and count logged." },
        { id: "closest", label: "Closest work", text: "Named, and read in a second pass with the extraction sheet." },
        { id: "claim", label: "No originality claim", text: "Say what your question adds; leave “first” and “novel” to the evidence." }
      ] });
  }

  LX.mount("r02", function (live, data, root) {
    injectCSS();
    var D = data["r02_literature"], S = data["r02_literature_openalex"], state = {};
    D.toCodeNote = "To code: " + D.matrix.filter(function (p) { return p.code; }).map(function (p) { return p.name; }).join("; ") + ". Years as OpenAlex lists them.";
    var steps = [
      { text: "Start from the question below. Split it into concept blocks: pick at least two synonyms for each block and watch the search string build itself.", build: blocksStep(D, S) },
      { text: "Five strings, each one change from the one before. Before each count appears, predict: more results, or fewer?", build: ladderStep(D, S) },
      { text: "Look at what string 5 returns, then put all five searches in a search log: where, what, when and how many.", build: hitsStep(D, S) },
      { text: "Now [[snowballing|snowball]] from one review: its references point backward, the works that cite it point forward. Switch between the three routes.", build: snowStep(D, S) },
      { text: "A [[concept-matrix|concept matrix]] puts papers in rows and ideas in columns. Code the four rows marked “to code”, then check.", build: matrixStep(D, S, state) },
      { text: "Count your matrix in two by two: storage linked against extreme periods kept. Tap the empty cell, then decide what it means.", build: crossStep(D, S, state) },
      { text: "Turn the empty cell into a search string of its own. Then look at what it finds, and which of your papers the closest one builds on.", build: targetedStep(D, S) },
      { text: "Read the closest paper in three passes. A first pass takes 5 to 10 minutes: title, abstract, headings, conclusions. Start with the first C.", build: passStep(D, S) },
      { text: "Write your [[research-gap|gap]] statement in your own words, from your log and matrix, then compare it with two answers below.", build: writeStep(D, S) }
    ];
    var cards = LX.StepCards(live, { id: "r2-steps", steps: steps });
    explain(D, S); selfcheck(D);
    root.lxLesson = { data: D, snapshot: S, model: model };
    // demo states: "mid" = step 2 with every prediction made; "matrix" = step 5 checked
    LX.demo(root, function (st) {
      var card = live.querySelector(".lx-stepcard");
      if (st === "mid") {
        cards.go(1);
        setTimeout(function () { for (var i = 0; i < 4; i++) { var li = card.querySelectorAll(".r2-ladder li")[i + 1], b = li && li.querySelector(".lx-choice"); if (b) b.click(); } }, 40);
        return { view: "step 2, predictions made" };
      }
      if (st === "matrix") {
        cards.go(4);
        setTimeout(function () { var b = card.querySelector(".lx-cs-grid .lx-step-foot .lx-btn"); if (b) b.click(); }, 40);
        return { view: "step 5, checked" };
      }
      return null;
    }, cards);
  });
})();
