/* reportnote.js — LX.ReportNote: the report template of a sandbox or capstone. It turns
   the reader's plan and results into a one-page note to copy as plain text or Markdown, with the stated assumptions, a
   sensitivity line and the limits, plus the deliverable's checks (a capstone's "done when"). It never saves or sends
   anything: the note is built in the page, the reader's own words stay in this browser (when it allows storage) and are
   never put in the plan link, and the only way out is the reader's own copy.
   var rn = LX.ReportNote(host, {
     id: "c0-note",                 the reader's words are kept in this browser under this key
     code: "C0", title: "Your one-page note", lede: "One sentence.",
     fields: [{ key: "recommend", label: "Recommendation", hint: "Two sentences: what to install, and why.", rows: 3,
                need: true, at: "top", min: 8 },     at "top": right after the head (else after the sensitivity line);
              { key: "alone", label: "What the site cannot do alone", rows: 2, need: true }],   need: a check; min words
     get: function () { return note; },             the page's current plan and results (called by refresh())
     checks: ["link", "run", "fields", "assumptions", "sensitivity", "page", { id, label, test: function (note, words) {} }],
     onChange: function (checks, words) {} });
   Returns { el, refresh(), note(), text(format), checks(), values(), set(words) }; format "text" or "md".
   The note (from get(); null before the first run shows "Run your plan first"):
     heading      "The Prairie Town home: solar, a battery and a heat pump"
     link         the plan link (LX.ShareState's url())
     made         "the Site Bench (engine E0, a linear program)"
     run          { ok: true, stale: false, text: "one year, hour by hour (8,760 hours)" }   ok only for a finished,
                  optimal run of the plan on the controls; otherwise the note carries a warning line
     plan         [{ label: "Solar PV", value: "6 kW" }]                       what the reader chose
     results      [{ label: "Net present value, 20 years", value: "$4,210", note: "2025 dollars" }]
     assumptions  ["All money in 2025 dollars.", ...]                          one sentence each
     sensitivity  { metric: "Net present value", input: "the battery price", held: "the plan held fixed",
                    base: { at: "$400/kWh", value: "$4,210" }, cases: [{ at: "$300/kWh", value: "$5,000" }, ...] }
                  or one sentence (a string)
     limits       ["It leaves out ...", ...]
     footer       optional; default: a teaching model with illustrative assumptions, not advice for a real site
   Pure (Node: require("components/reportnote.js"); also on LX.ReportNote): compose(note, words, fields, { format, date,
     code, title }), html(note, words, fields, opt) (the preview), sensitivityLine(s), checks(note, words, fields, list,
     opt), outlineHTML(fields, opt) (the no-JS fallback: the note's headings in order, with what goes under each),
     countWords(text), PAGE_WORDS (550), CLAIMS (words the component never uses: it saves and sends nothing). */
(function () {
  "use strict";
  // ---------------------------------------------------------------- pure (no DOM; exported for Node)
  var PAGE_WORDS = 550, MAX_FIELD = 700;
  var CLAIMS = /\b(saved|submitted|uploaded|sent|stored on|delivered)\b/i;
  var FOOTER = "From a teaching model with stated, illustrative assumptions: not advice for a real site.";
  var PLACEHOLDER = /\[\s*(…|\.\.\.)?\s*\]/;
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function countWords(t) { return (String(t || "").match(/[^\s|#*\-]+/g) || []).length; }
  function oneLine(s) { return String(s == null ? "" : s).replace(/\s+/g, " ").trim(); }
  function mdCell(s) { return oneLine(s).replace(/\|/g, "\\|"); }
  function sentence(s) { s = oneLine(s); return s && !/[.!?]$/.test(s) ? s + "." : s; }
  function list(a) { return Array.isArray(a) ? a.filter(function (x) { return x != null && x !== ""; }) : []; }
  function joinAnd(a) { return a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1]; }
  // "Net present value is $4,210 with the battery price at $400/kWh (this plan), $5,000 at $300/kWh and $3,100 at
  // $500/kWh, with the plan held fixed."
  function sensitivityLine(s) {
    if (!s) return "";
    if (typeof s === "string") return sentence(s);
    if (!s.metric || !s.base || !list(s.cases).length) return "";
    var parts = [s.base.value + " with " + s.input + " at " + s.base.at + " (this plan)"].concat(s.cases.map(function (c) { return c.value + " at " + c.at; }));
    return sentence(s.metric + " is " + joinAnd(parts) + (s.held ? ", with " + s.held : ""));
  }
  function value(words, k) { return oneLine(words && words[k]); }
  function warning(note) {
    var r = note && note.run;
    if (r && r.ok && !r.stale) return "";
    if (r && r.stale) return "Warning: these results are for an earlier plan than the one in the link; run the plan again before you share this note.";
    return "Warning: these results are not from a finished run of this plan; run it again before you share this note.";
  }
  // the note's parts in order: [{ h: heading or null, lines: [...], list: [...], table: {head, rows}, para }]
  function parts(note, words, fields, opt) {
    opt = opt || {}; fields = fields || [];
    var n = note || {}, out = [], date = opt.date || new Date().toISOString().slice(0, 10);
    var title = (opt.code ? opt.code + " · " : "") + (n.heading || opt.title || "My plan");
    var head = [];
    if (n.link) head.push({ k: "Plan link", v: n.link });
    head.push({ v: "Made with " + (n.made || "this page") + " on " + date + "." + (n.run && n.run.text ? " Results: " + oneLine(n.run.text) + "." : "") });
    var w = warning(n);
    if (w) head.push({ v: w, warn: true });
    out.push({ title: title, head: head });
    function field(f) { var v = value(words, f.key); out.push({ h: f.heading || f.label, para: v || "(not written yet)", empty: !v }); }
    fields.filter(function (f) { return f.at === "top"; }).forEach(field);
    if (list(n.plan).length) out.push({ h: "The plan", table: { head: ["Choice", "Value"], rows: n.plan.map(function (p) { return [p.label, p.value]; }) } });
    if (list(n.results).length) out.push({ h: "Results", table: { head: ["Result", "Value"], rows: n.results.map(function (r) { return [r.label, r.value + (r.note ? " (" + r.note + ")" : "")]; }) } });
    out.push({ h: "Assumptions", list: list(n.assumptions).map(sentence), none: "(none stated)" });
    var sl = sensitivityLine(n.sensitivity), s = n.sensitivity;
    var st = s && typeof s === "object" && s.base && list(s.cases).length ? { head: [s.inputLabel || oneLine(s.input).replace(/^the /, ""), s.metric],
      rows: [[s.base.at + " (this plan)", s.base.value]].concat(s.cases.map(function (c) { return [c.at, c.value]; })) } : null;
    out.push({ h: "Sensitivity", para: sl || "(no sensitivity line yet)", empty: !sl, table: st, tableMdOnly: true });
    fields.filter(function (f) { return f.at !== "top"; }).forEach(field);
    if (list(n.limits).length) out.push({ h: "Limits of this analysis", list: list(n.limits).map(sentence) });
    out.push({ foot: n.footer || FOOTER });
    return out;
  }
  function compose(note, words, fields, opt) {
    var md = opt && opt.format === "md", L = [];
    parts(note, words, fields, opt).forEach(function (p) {
      if (p.title) {
        L.push(md ? "## " + oneLine(p.title) : oneLine(p.title));
        L.push("");
        p.head.forEach(function (h) { L.push((h.k ? (md ? "**" + h.k + ":** " : h.k + ": ") : "") + (md && h.warn ? "**" + h.v + "**" : h.v) + (md ? "  " : "")); });
        return;
      }
      if (p.foot) { L.push(""); L.push(md ? "*" + p.foot + "*" : p.foot); return; }
      L.push("");
      L.push(md ? "### " + p.h : p.h.toUpperCase());
      if (p.table && (md || !p.tableMdOnly)) {
        if (md) {
          L.push("| " + p.table.head.map(mdCell).join(" | ") + " |");
          L.push("|" + p.table.head.map(function () { return "---"; }).join("|") + "|");
          p.table.rows.forEach(function (r) { L.push("| " + r.map(mdCell).join(" | ") + " |"); });
        } else p.table.rows.forEach(function (r) { L.push("- " + oneLine(r[0]) + ": " + oneLine(r[1])); });
        if (p.para) L.push("");
      }
      if (p.list) { if (p.list.length) p.list.forEach(function (x) { L.push("- " + x); }); else L.push(p.none); }
      if (p.para) L.push(p.para);
    });
    return L.join("\n").replace(/ +\n/g, function (m) { return md ? m : "\n"; }).replace(/\n{3,}/g, "\n\n").trim() + "\n";
  }
  function html(note, words, fields, opt) {
    var h = [];
    parts(note, words, fields, opt).forEach(function (p) {
      if (p.title) {
        h.push('<h4 class="lx-rn-title">' + esc(p.title) + "</h4>");
        p.head.forEach(function (x) {
          h.push('<p class="lx-rn-meta' + (x.warn ? " warn" : "") + '">' + (x.k ? "<b>" + esc(x.k) + ":</b> " : "") + (x.k === "Plan link" ? "<code>" + esc(x.v) + "</code>" : esc(x.v)) + "</p>");
        });
        return;
      }
      if (p.foot) { h.push('<p class="lx-rn-foot-line">' + esc(p.foot) + "</p>"); return; }
      h.push("<h5>" + esc(p.h) + "</h5>");
      if (p.table && !p.tableMdOnly) h.push('<table class="lx-rn-table"><tbody>' + p.table.rows.map(function (r) { return '<tr><th scope="row">' + esc(r[0]) + "</th><td>" + esc(r[1]) + "</td></tr>"; }).join("") + "</tbody></table>");
      if (p.list) h.push(p.list.length ? "<ul>" + p.list.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" : '<p class="lx-rn-empty">' + esc(p.none) + "</p>");
      if (p.para) h.push("<p" + (p.empty ? ' class="lx-rn-empty"' : "") + ">" + esc(p.para) + "</p>");
    });
    return h.join("");
  }
  var CHECK_LABELS = { link: "A plan link that opens this plan", run: "Results from a finished run of this plan", assumptions: "The assumptions, stated",
    sensitivity: "A sensitivity line", page: "Fits on one page (about " + PAGE_WORDS + " words)" };
  function checks(note, words, fields, which, opt) {
    which = which || ["link", "run", "fields", "assumptions", "sensitivity", "page"];
    var n = note || {}, items = [];
    which.forEach(function (c) {
      if (c && typeof c === "object") { items.push({ id: c.id, label: c.label, ok: !!c.test(n, words || {}), fix: c.fix || null }); return; }
      if (c === "fields") {
        (fields || []).filter(function (f) { return f.need; }).forEach(function (f) {
          var v = value(words, f.key);
          items.push({ id: "field-" + f.key, label: f.label + ", in your words", ok: countWords(v) >= (f.min || 5) && !PLACEHOLDER.test(v) });
        });
        return;
      }
      var ok = c === "link" ? /^https?:\/\/\S+#\S+$/.test(String(n.link || ""))
        : c === "run" ? !!(n.run && n.run.ok && !n.run.stale && list(n.results).length)
        : c === "assumptions" ? list(n.assumptions).length > 0
        : c === "sensitivity" ? !!sensitivityLine(n.sensitivity)
        : c === "page" ? countWords(compose(note, words, fields, opt)) <= PAGE_WORDS
        : null;
      if (ok === null) throw new Error("LX.ReportNote: unknown check " + c);
      items.push({ id: c, label: CHECK_LABELS[c], ok: ok });
    });
    var pass = items.filter(function (x) { return x.ok; }).length;
    return { items: items, pass: pass, total: items.length, all: pass === items.length };
  }
  // the no-JS version: the note's outline, in order, with what goes under each heading (one line each)
  var OUTLINE = { head: "Title and plan link: the plan's link from the bench, and the date", plan: "The plan: each choice, with its unit",
    results: "Results: each result, with its unit and boundary", assumptions: "Assumptions: one sentence each",
    sensitivity: "Sensitivity: how one result moves when one input changes, and whether the plan was held fixed",
    limits: "Limits of this analysis: what the model leaves out" };
  function outlineHTML(fields, opt) {
    opt = opt || {}; fields = fields || [];
    var w = function (f) { return "<li><b>" + esc(f.heading || f.label) + ":</b> " + esc(f.hint || "in your words") + "</li>"; };
    var t = function (k) { var x = (opt[k] || OUTLINE[k]).split(": "); return "<li><b>" + esc(x[0]) + ":</b> " + esc(x.slice(1).join(": ")) + "</li>"; };
    return '<ol class="lx-rn-outline">' + t("head") + fields.filter(function (f) { return f.at === "top"; }).map(w).join("") + t("plan") + t("results")
      + t("assumptions") + t("sensitivity") + fields.filter(function (f) { return f.at !== "top"; }).map(w).join("") + t("limits") + "</ol>";
  }
  function headText(c) { return c.pass + " of " + c.total + " parts in place" + (c.all ? ": the note is ready to copy." : ". You can copy the note at any time."); }
  var api = { compose: compose, html: html, outlineHTML: outlineHTML, sensitivityLine: sensitivityLine, checks: checks, countWords: countWords, headText: headText,
              PAGE_WORDS: PAGE_WORDS, MAX_FIELD: MAX_FIELD, CLAIMS: CLAIMS, FOOTER: FOOTER };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H;
  LX.ReportNote = function (host, o) {
    var fields = o.fields || [], words = {}, note = null;
    var saved = (o.id && LX.store.get(o.id)) || {};
    fields.forEach(function (f) { words[f.key] = typeof saved[f.key] === "string" ? saved[f.key].slice(0, f.max || MAX_FIELD) : ""; });
    var box = H("div", { class: "lx-rn" }, host);
    if (o.title) { var hd = H("header", { class: "lx-x-head" }, box); H("h3", { text: o.title }, hd); }
    if (o.lede) H("p", { class: "lx-rn-lede", html: LX.rich(o.lede) }, box);
    var grid = H("div", { class: "lx-rn-grid" }, box);
    var side = H("div", { class: "lx-rn-side" }, grid);
    var form = H("div", { class: "lx-rn-form" }, side);
    fields.forEach(function (f) {
      var w = H("div", { class: "lx-rn-field" }, form), id = LX.uid("rn");
      H("label", { for: id, text: f.label }, w);
      var ta = H("textarea", { id: id, rows: String(f.rows || 3), maxlength: String(f.max || MAX_FIELD) }, w);
      ta.value = words[f.key];
      if (f.hint) { var hid = id + "-h"; H("p", { id: hid, class: "lx-hint", text: f.hint }, w); ta.setAttribute("aria-describedby", hid); }
      ta.addEventListener("input", function () {
        words[f.key] = String(ta.value).slice(0, f.max || MAX_FIELD);
        if (o.id) LX.store.set(o.id, words);
        paint();
      });
    });
    var chk = H("div", { class: "lx-rn-checks" }, side);
    var chkHead = H("p", { class: "lx-rn-checks-h", "aria-live": "polite" }, chk);
    var chkList = H("ul", { class: "lx-rn-list" }, chk);
    var page = H("article", { class: "lx-rn-page", "aria-label": "Preview of your note" }, grid);
    var foot = H("div", { class: "lx-rn-actions" }, box);
    var bText = H("button", { class: "lx-btn small", type: "button", text: "Copy as text" }, foot);
    var bMd = H("button", { class: "lx-btn ghost small", type: "button", text: "Copy as Markdown" }, foot);
    var msg = H("p", { class: "lx-hint lx-rn-msg", "aria-live": "polite" }, box);
    var copyBox = H("div", { class: "lx-rn-copy", hidden: true }, box);
    var area = H("textarea", { readonly: true, rows: "12", "aria-label": "Your note as text" }, copyBox);
    H("p", { class: "lx-hint", text: o.privacy || "The note is built in this page from your plan. Nothing leaves the page unless you copy it; your own words stay in this browser and are not part of the plan link." }, box);
    function opt(format) { return { format: format, code: o.code, title: o.title, date: new Date().toISOString().slice(0, 10) }; }
    function current() { return checks(note, words, fields, o.checks, opt("text")); }
    function paint() {
      if (!note) page.innerHTML = '<p class="lx-rn-empty">' + LX.esc(o.empty || "Run your plan first: the note fills in from its results.") + "</p>";
      else page.innerHTML = html(note, words, fields, opt("text"));
      var c = current();
      chkHead.textContent = headText(c);
      chkList.innerHTML = "";
      c.items.forEach(function (it) {
        var li = H("li", { class: it.ok ? "ok" : "todo" }, chkList);
        li.innerHTML = LX.icon(it.ok ? "check" : "question") + '<span><span class="lx-sr">' + (it.ok ? "In place: " : "To do: ") + "</span>" + LX.esc(it.label) + "</span>";
      });
      if (!copyBox.hidden && area.getAttribute("data-format")) area.value = compose(note, words, fields, opt(area.getAttribute("data-format")));
      if (o.onChange) o.onChange(c, JSON.parse(JSON.stringify(words)));
      if (LX.emit) LX.emit("layout");
    }
    function copy(format) {
      var t = compose(note, words, fields, opt(format));
      copyBox.hidden = false; area.value = t; area.setAttribute("data-format", format);
      var label = format === "md" ? "Markdown" : "plain text";
      return (LX.copyText ? LX.copyText(t, { select: area }) : Promise.resolve(false)).then(function (ok) {
        msg.textContent = ok ? "Copied to the clipboard as " + label + "." : "Your browser did not allow copying: select the text below and copy it (" + label + ").";
        if (LX.emit) LX.emit("layout");
        return ok;
      });
    }
    bText.addEventListener("click", function () { copy("text"); });
    bMd.addEventListener("click", function () { copy("md"); });
    function refresh() { note = o.get ? o.get() : null; paint(); }
    refresh();
    return {
      el: box, refresh: refresh, note: function () { return note; },
      text: function (format) { return compose(note, words, fields, opt(format || "text")); },
      checks: current, values: function () { return JSON.parse(JSON.stringify(words)); },
      set: function (v) {
        fields.forEach(function (f) { if (v && typeof v[f.key] === "string") words[f.key] = v[f.key].slice(0, f.max || MAX_FIELD); });
        form.querySelectorAll("textarea").forEach(function (ta, i) { ta.value = words[fields[i].key]; });
        if (o.id) LX.store.set(o.id, words);
        paint();
      },
      copy: copy
    };
  };
  Object.keys(api).forEach(function (k) { LX.ReportNote[k] = api[k]; });
})();
