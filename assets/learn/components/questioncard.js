/* questioncard.js — LX.QuestionCard: a structured research-question card (the course's question types and question
   studio; R1, R10, the capstone research project): the question in one sentence, its type, its audience or decision-maker, a metric with
   units, the counterfactual, scale and boundary, an "I would be wrong if" statement and the main uncertainty. Each part
   is checked for rigour; the card copies as plain text and can travel in a link.
   var qc = LX.QuestionCard(host, {
     id: "r10-card",             the draft stays in this browser under this key (optional)
     code: "R10",                in the copied text's first line
     title: "Your question card", lede: "One sentence.",
     values: { type: "evaluative", question: "Did ...?", audience: "...", metric: "...", units: "...", counterfactual:
               "...", scale: "S1", boundary: "...", wrong: "...", uncertainty: "..." },   a starting card (an example); a
                                 stored draft or a #q-... link wins over it. A link is applied once: its card becomes the
                                 stored draft and the hash leaves the address (history.replaceState), so a card built
                                 again later (a step card after Back and Next) shows the reader's edits, not the link's
                                 card; a hash this page wrote itself ("Share this card") is not applied again
     fix: { metric: { href: "a01-....html", label: "A1" } },   per check, the lesson that helps (a link in the warning)
     share: true,                a "Share this card" button: the card travels in the link's #q-... hash (LX.Share)
     onChange: function (values, checks) {} });
   Returns { el, get(), set(values), text(), checks() }.
   Fields: native, labelled controls with a one-line hint; the type is a set of five radio buttons (the course's question types) that shows the
   chosen type's template and typical methods (one method family among several). Checks: eight lines (the question
   written, with no bracketed placeholder such as "[…]" left from a draft, then the seven parts that the question
   studio's rigour checks need), each "filled in" or "to do" in words and with an icon, never colour alone. The head counts "N of 8
   parts filled in": the checks see only whether a part is there, not how rigorous it is (the rubric does that); they
   never block (a learner may type any question) and never judge originality, importance or novelty.
   Node: module.exports = { TYPES, SCALES, FIELDS, CHECKS, check, text, encode, decode, clean } (pure). */
(function () {
  "use strict";
  var TYPES = [
    { id: "descriptive", label: "Descriptive", template: "How much / how often / where …?", methods: "data analysis, accounting, GIS" },
    { id: "explanatory", label: "Explanatory", template: "Why did … happen?", methods: "statistics, econometrics, case studies, simulation" },
    { id: "evaluative", label: "Evaluative", template: "Did … achieve …, compared with …?", methods: "difference-in-differences, matched comparisons, ex-post review" },
    { id: "predictive", label: "Predictive", template: "What will … be, with what uncertainty?", methods: "forecasting, scenarios, Monte Carlo" },
    { id: "prescriptive", label: "Prescriptive", template: "What should [decision-maker] do about … to achieve …, compared with …?", methods: "optimization, decision analysis, MCDA" }
  ];
  var SCALES = [["S0", "device and plant"], ["S1", "microgrid and community"], ["S2", "regional grid"], ["S3", "city and region"], ["S4", "nation"]];
  // the card's fields, in order; `short` names the field in links (the #q- hash) and `max` caps its length there
  var FIELDS = [
    { key: "question", short: "q", label: "The question, in one sentence", hint: "End it with a question mark.", rows: 2 },
    { key: "type", short: "t", label: "Type of question" },
    { key: "audience", short: "a", label: "Audience or decision-maker", hint: "Who would use the answer, and who it affects: a co-op board, a regulator or a city council; low-income renters, farmers…" },
    { key: "metric", short: "m", label: "Metric", hint: "What you would measure or compute." },
    { key: "units", short: "u", label: "Units", hint: "MWh, $/MWh, t CO₂ a year, hours without heat…" },
    { key: "counterfactual", short: "c", label: "Compared with (the counterfactual)", hint: "What happens otherwise: the baseline you compare against." },
    { key: "scale", short: "s", label: "Scale" },
    { key: "boundary", short: "b", label: "Boundary", hint: "What is inside the study, and what is left out." },
    { key: "wrong", short: "w", label: "I would be wrong if…", hint: "A result that would show your expectation false." },
    { key: "uncertainty", short: "x", label: "The uncertainty that matters most", hint: "The input or assumption that could change the answer most." }
  ];
  var MAX = 600;
  var CHECKS = [
    { id: "question", label: "The question is written as one sentence ending in a question mark" },
    { id: "type", label: "The question type is named" },
    { id: "audience", label: "An audience or decision-maker" },
    { id: "metric", label: "A measurable metric with units" },
    { id: "counterfactual", label: "A counterfactual" },
    { id: "scale", label: "Scale and boundary" },
    { id: "wrong", label: "An “I would be wrong if…” statement" },
    { id: "uncertainty", label: "The uncertainty that matters most" }
  ];
  var WARN = {
    question: "Write the question as one sentence that ends with a question mark.",
    brackets: "Replace the parts in brackets, such as […], with your own words.",
    type: "Name the type: descriptive, explanatory, evaluative, predictive or prescriptive.",
    audience: "Name who would use the answer.",
    metric: "Name what you would measure.",
    units: "Give the metric's units.",
    counterfactual: "Say what you compare against.",
    scale: "Pick a scale.",
    boundary: "Say what is inside the study and what is left out.",
    wrong: "Say what result would show you wrong.",
    uncertainty: "Name the uncertainty that matters most."
  };

  // ---------------------------------------------------------------- pure (no DOM; exported for Node)
  function str(v) { return v == null ? "" : String(v).trim(); }
  // keep only known fields, as trimmed text within the length cap; type and scale only from their lists
  function clean(v) {
    var o = {};
    FIELDS.forEach(function (f) {
      var s = str(v && v[f.key]).slice(0, MAX);
      if (f.key === "type" && !TYPES.some(function (t) { return t.id === s; })) s = "";
      if (f.key === "scale" && !SCALES.some(function (x) { return x[0] === s; })) s = "";
      o[f.key] = s;
    });
    return o;
  }
  function check(values) {
    var v = clean(values);
    function line(id, ok, why) { var c = CHECKS.filter(function (x) { return x.id === id; })[0]; return { id: id, label: c.label, ok: ok, why: ok ? "" : why }; }
    var out = [
      // a draft with a bracketed placeholder ("compared with […]", "[decision-maker]") is not yet written
      line("question", /\?\s*$/.test(v.question) && v.question.split(/\s+/).length >= 4 && !/\[[^\]]*\]/.test(v.question),
        /\[[^\]]*\]/.test(v.question) ? WARN.brackets : WARN.question),
      line("type", !!v.type, WARN.type),
      line("audience", !!v.audience, WARN.audience),
      line("metric", !!(v.metric && v.units), !v.metric ? WARN.metric + " " + WARN.units : WARN.units),
      line("counterfactual", !!v.counterfactual, WARN.counterfactual),
      line("scale", !!(v.scale && v.boundary), !v.scale ? WARN.scale + (v.boundary ? "" : " " + WARN.boundary) : WARN.boundary),
      line("wrong", !!v.wrong, WARN.wrong),
      line("uncertainty", !!v.uncertainty, WARN.uncertainty)
    ];
    var pass = out.filter(function (c) { return c.ok; }).length;
    return { items: out, pass: pass, total: out.length, all: pass === out.length };
  }
  function typeOf(id) { return TYPES.filter(function (t) { return t.id === id; })[0] || null; }
  function scaleOf(id) { var s = SCALES.filter(function (x) { return x[0] === id; })[0]; return s ? s[0] + " " + s[1] : ""; }
  // the card as plain text (what "Copy as text" copies)
  function text(values, opt) {
    var v = clean(values), t = typeOf(v.type), c = check(v), dash = "(not yet)";
    var lines = [
      "Learn · " + (opt && opt.code ? opt.code + " " : "") + "question card",
      "Question: " + (v.question || dash),
      "Type: " + (t ? t.label + " (" + t.template + ")" : dash),
      "Audience or decision-maker: " + (v.audience || dash),
      "Metric: " + (v.metric || dash) + (v.units ? " (units: " + v.units + ")" : ""),
      "Compared with: " + (v.counterfactual || dash),
      "Scale: " + (scaleOf(v.scale) || dash) + "; boundary: " + (v.boundary || dash),
      "I would be wrong if: " + (v.wrong || dash),
      "Main uncertainty: " + (v.uncertainty || dash),
      "Parts filled in: " + c.pass + " of " + c.total + (c.all ? "." : "; to do: " + c.items.filter(function (x) { return !x.ok; }).map(function (x) { return x.label.charAt(0).toLowerCase() + x.label.slice(1); }).join("; ") + ".")
    ];
    return lines.join("\n");
  }
  // the card in a name-safe link hash: "q-" + base64url(UTF-8 JSON of the filled fields, by short name)
  var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  function utf8(s) {
    var e = encodeURIComponent(s), out = [];
    for (var i = 0; i < e.length; i++) {
      if (e.charAt(i) === "%") { out.push(parseInt(e.substr(i + 1, 2), 16)); i += 2; } else out.push(e.charCodeAt(i));
    }
    return out;
  }
  function fromUtf8(bytes) { return decodeURIComponent(bytes.map(function (b) { return "%" + (b < 16 ? "0" : "") + b.toString(16); }).join("")); }
  function b64(bytes) {
    var s = "";
    for (var i = 0; i < bytes.length; i += 3) {
      var n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0), k = Math.min(3, bytes.length - i) + 1;
      for (var j = 0; j < k; j++) s += B64.charAt((n >> (18 - 6 * j)) & 63);
    }
    return s;
  }
  function unb64(s) {
    var bytes = [], buf = 0, bits = 0;
    for (var i = 0; i < s.length; i++) {
      var v = B64.indexOf(s.charAt(i)); if (v < 0) throw new Error("bad link");
      buf = (buf << 6) | v; bits += 6;
      if (bits >= 8) { bits -= 8; bytes.push((buf >> bits) & 255); }
    }
    return bytes;
  }
  function encode(values) {
    var v = clean(values), o = {};
    FIELDS.forEach(function (f) { if (v[f.key]) o[f.short] = v[f.key]; });
    return "q-" + b64(utf8(JSON.stringify(o)));
  }
  function decode(hash) {
    var m = /^#?q-([A-Za-z0-9_-]+)$/.exec(String(hash || ""));
    if (!m) return null;
    try {
      var o = JSON.parse(fromUtf8(unb64(m[1]))), v = {};
      if (!o || typeof o !== "object") return null;
      FIELDS.forEach(function (f) { if (typeof o[f.short] === "string") v[f.key] = o[f.short]; });
      return clean(v);
    } catch (e) { return null; }
  }
  var api = { TYPES: TYPES, SCALES: SCALES, FIELDS: FIELDS, CHECKS: CHECKS, check: check, text: text, encode: encode, decode: decode, clean: clean };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H;
  var own = {};   // link hashes this page has applied or written itself: never applied (again) over the reader's edits
  function hashNow() { return typeof location !== "undefined" ? String(location.hash || "").replace(/^#/, "") : ""; }
  // apply a shared #q- link once: keep its card as the draft and take the hash out of the address
  function takeLink(id) {
    var h = hashNow(), card = own[h] ? null : decode(h);
    if (!card) return null;
    own[h] = true;
    if (id) LX.store.set(id, card);
    try {
      var hist = window.history;
      if (hist && hist.replaceState) hist.replaceState(hist.state, "", String(location.href).split("#")[0]);
    } catch (e) { /* the address keeps the hash; the stored draft still wins next time, as own[] remembers the link */ }
    return card;
  }
  LX.QuestionCard = function (host, o) {
    var fromLink = takeLink(o.id);
    var stored = o.id ? LX.store.get(o.id) : null;
    var v = clean(fromLink || stored || o.values || {});
    var box = H("div", { class: "lx-qc" }, host), ctl = {};
    if (o.title) { var hd = H("header", { class: "lx-x-head" }, box); H("h3", { text: o.title }, hd); }
    if (o.lede) H("p", { class: "lx-qc-lede", html: LX.rich(o.lede) }, box);
    if (fromLink) H("p", { class: "lx-hint", text: "This card came with the link you opened. Your changes stay in this browser." }, box);
    var form = H("div", { class: "lx-qc-form" }, box);
    function field(f, wide) {
      var w = H("div", { class: "lx-qc-field" + (wide ? " wide" : "") + " f-" + f.key }, form), id = LX.uid("qc");
      H("label", { for: id, text: f.label }, w);
      var inp = f.rows ? H("textarea", { id: id, rows: String(f.rows) }, w) : H("input", { id: id, type: "text" }, w);
      inp.setAttribute("maxlength", String(MAX));
      if (f.hint) { var hid = id + "-h"; H("p", { id: hid, class: "lx-hint", text: f.hint }, w); inp.setAttribute("aria-describedby", hid); }
      inp.value = v[f.key];
      inp.addEventListener("input", function () { v[f.key] = inp.value; changed(); });
      ctl[f.key] = { set: function (x) { inp.value = x; } };
    }
    var F = {}; FIELDS.forEach(function (f) { F[f.key] = f; });
    field(F.question, true);
    // type: five radio buttons, with the chosen type's template and methods
    var tf = H("fieldset", { class: "lx-qc-field wide lx-qc-types" }, form), tname = LX.uid("qct");
    H("legend", { text: F.type.label }, tf);
    var trow = H("div", { class: "lx-qc-typerow" }, tf), tinfo = H("p", { class: "lx-qc-tinfo", "aria-live": "polite" }, tf), tin = {};
    TYPES.forEach(function (t) {
      var lab = H("label", { class: "lx-qc-type" }, trow), inp = H("input", { type: "radio", name: tname, value: t.id }, lab);
      H("span", { text: t.label }, lab);
      inp.addEventListener("change", function () { if (inp.checked) { v.type = t.id; changed(); } });
      tin[t.id] = { input: inp, label: lab };
    });
    ctl.type = { set: function () {} };
    field(F.audience, true);
    field(F.metric); field(F.units);
    field(F.counterfactual, true);
    var sw = H("div", { class: "lx-qc-field f-scale" }, form), sid = LX.uid("qcs");
    H("label", { for: sid, text: F.scale.label }, sw);
    var sel = H("select", { id: sid }, sw);
    H("option", { value: "", text: "Pick a scale" }, sel);
    SCALES.forEach(function (s) { H("option", { value: s[0], text: s[0] + " · " + s[1] }, sel); });
    sel.value = v.scale;
    sel.addEventListener("change", function () { v.scale = sel.value; changed(); });
    ctl.scale = { set: function (x) { sel.value = x; } };
    field(F.boundary);
    field(F.wrong, true);
    field(F.uncertainty, true);

    var ck = H("div", { class: "lx-qc-checks" }, box);
    var ckHead = H("p", { class: "lx-qc-ckhead", "aria-live": "polite" }, ck);
    var ckList = H("ul", { class: "lx-qc-cklist" }, ck);
    H("p", { class: "lx-hint", text: "The checks only see which parts are filled in, not how good they are: rate that against the rubric. They never judge whether a question is new or important." }, ck);
    var bar = H("div", { class: "lx-qc-foot" }, box);
    var copyBtn = H("button", { class: "lx-btn ghost small", type: "button", text: "Copy as text" }, bar);
    var sh = null;
    if (o.share && LX.Share) sh = LX.Share(box, { button: bar, buttonText: "Share this card", hash: function () { var h = encode(v); own[h] = true; return h; },
      note: "Anyone who opens this link sees this card. Nothing is stored on a server." });
    var copyBox = H("div", { class: "lx-qc-copy", hidden: true }, box);
    var area = H("textarea", { readonly: true, rows: "10", "aria-label": "Your question card as text" }, copyBox);
    var msg = H("p", { class: "lx-hint", "aria-live": "polite" }, copyBox);
    copyBtn.addEventListener("click", function () {
      copyBox.hidden = false; area.value = text(v, { code: o.code });
      (LX.copyText ? LX.copyText(area.value, { select: area }) : Promise.resolve(false)).then(function (ok) {
        msg.textContent = ok ? "Copied to the clipboard." : "Select the text and copy it.";
      });
      if (LX.emit) LX.emit("layout");
    });

    function paintType() {
      var t = typeOf(v.type);
      TYPES.forEach(function (x) { tin[x.id].input.checked = x.id === v.type; tin[x.id].label.classList.toggle("on", x.id === v.type); });
      tinfo.innerHTML = t ? "<b>Template:</b> " + LX.esc(t.template) + " <span>Typical methods: " + LX.esc(t.methods) + ".</span>"
        : "Five types, each with its own template and typical methods.";
    }
    function paintChecks() {
      var c = check(v);
      ckHead.textContent = c.pass + " of " + c.total + " parts filled in" + (c.all ? "." : ": the rest are marked to do.");
      ckList.innerHTML = "";
      c.items.forEach(function (it) {
        var li = H("li", { class: it.ok ? "ok" : "warn" }, ckList);
        li.innerHTML = LX.icon(it.ok ? "check" : "question") + '<span><span class="lx-sr">' + (it.ok ? "Filled in: " : "To do: ") + "</span>" + LX.esc(it.label)
          + (it.ok ? "" : '<span class="why">' + LX.esc(it.why)
            + (o.fix && o.fix[it.id] ? ' <a href="' + LX.esc(o.fix[it.id].href) + '">See ' + LX.esc(o.fix[it.id].label) + ".</a>" : "") + "</span>") + "</span>";
      });
      return c;
    }
    function changed() {
      v = clean(v);
      if (o.id) LX.store.set(o.id, v);
      paintType();
      var c = paintChecks();
      if (!copyBox.hidden) area.value = text(v, { code: o.code });
      if (o.onChange) o.onChange(clean(v), c);
    }
    paintType(); paintChecks();
    return {
      el: box,
      get: function () { return clean(v); },
      set: function (values) {
        v = clean(values);
        FIELDS.forEach(function (f) { if (ctl[f.key]) ctl[f.key].set(v[f.key]); });
        changed();
      },
      text: function () { return text(v, { code: o.code }); },
      checks: function () { return check(v); },
      share: sh
    };
  };
  Object.keys(api).forEach(function (k) { LX.QuestionCard[k] = api[k]; });
})();
