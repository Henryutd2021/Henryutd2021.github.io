/* sharestate.js — LX.ShareState (i-share): a sandbox's or capstone's plan kept in the address (#hash): compact,
   versioned and checked when a page opens it, with a "Copy plan link" button (W3, curriculum v2 §16.1, §16.3). There is
   no server and no personal data: the link holds only the numbers and choices that the page's schema declares (there is
   no free-text type), and nothing leaves the page unless the reader copies the link.

   The hash:  <key>-v<version>-<short><value>-<short><value>...      e.g. #sb0-v2-s0-pv6d5-b10-h1-o5-r3021
     key      the schema's key, [a-z][a-z0-9]*; any other hash (#explain, #lx-demo-mid, a Quarto anchor) is left alone
     short    each field's short name, [a-z]+; every field appears once, in the schema's order
     value    num, int  the number, with "d" for the decimal point and a leading "_" for a minus (6.5 -> 6d5, -2 -> _2)
              bool      1 or 0
              enum      the index of the value in `values`
              set       a bitmask of `values` (1 = the first; at most 30 values)
              order     the indexes in their order ("3021"; at most 10 values)
     Every character is a letter, a digit, "-" or "_", so LX.Share copies the link unchanged.

   Schema (one per page, usually the engine's):
     { key: "sb0", version: 2, title: "Site Bench plan",        title names the plan in the announcements
       fields: [
         { id: "site", short: "s",  type: "enum",  values: ["home", "farm"], def: "home", label: "Site",
           names: { home: "Prairie Town home", farm: "Ridge wind farm" } },   names: shown words (optional)
         { id: "pv",   short: "pv", type: "num",   min: 0, max: 20, step: 0.5, def: 6, label: "Solar PV", unit: "kW" },
         { id: "bat",  short: "b",  type: "int",   min: 0, max: 40, def: 10, label: "Battery", unit: "kWh" },
         { id: "hp",   short: "h",  type: "bool",  def: false, label: "Heat pump" },
         { id: "out",  short: "o",  type: "set",   values: ["storm", "ice", "heat"], def: ["storm"], label: "Outages" },
         { id: "prio", short: "r",  type: "order", values: ["hospital", "dorms", "labs", "offices"],
           def: ["hospital", "dorms", "labs", "offices"], label: "Load order" }],
       check: function (state) { return null; },   a rule across fields: null, or a short phrase on what is wrong
       old: [{ version: 1, fields: [...], note: "Battery sizes are now in kWh.", up: function (s) { return {...}; } }] }
         older versions this page can still read: each is decoded with its own fields, then `up` turns its state into
         the next version's (the next older entry's, or the current one), until the current version; a version without
         an entry is "old" and cannot be read. Bump `version` whenever a field, a range, a step or a meaning changes.
   A schema that breaks these rules throws when a page or test first uses it (checkSchema).

   Pure (Node: require("components/sharestate.js"); also on LX.ShareState):
     defaults(S), validate(S, state) -> [problems] (short phrases; [] when valid), encode(S, state) -> hash (throws on
     an invalid state), decode(S, hash) -> { status, state, from, version, reason, notes }, message(S, result, {keep}),
     same(S, a, b), checkSchema(S), fmtValue(field, value), staticHTML(S, state, { head, planHead, labels }) (the
     bench's no-JS table: each control, its value and its range; a field's `range` text replaces the generated one)
     status  "none"      not this schema's hash (empty or another anchor): the defaults, nothing to announce
             "ok"        the link's plan
             "migrated"  a plan from an older version, brought up to this one (`from`, `notes`)
             "bad"       damaged, out of range, a part missing or unknown (`reason`): the defaults
             "newer"     made by a newer version of the page than this one: the defaults
             "old"       made by an older version this page can no longer read: the defaults
   View:
     var ss = LX.ShareState(host, { schema: S,
       onLoad: function (state, result) {},   a plan link opened later in the same tab (the address changed)
       button: rowElement,                    where the "Copy plan link" button goes (default: a row in the box)
       buttonText: "Copy plan link", note: "...",   the label above the copied link
       sync: true,                            keep the address up to date as the plan changes (history.replaceState,
                                              250 ms after the last change); false: only when the reader copies
       id: "sb0-link" });
     ss.state, ss.result      the plan to start from (the link's, or the defaults) and the decode result on load
     ss.set(state, { write: false }) -> problems ([] when valid; then the plan is kept and, with sync, written to the
                              address, and a link notice is cleared)
     ss.get(), ss.hash(), ss.url(), ss.copy() (Promise of true or false), ss.reset() (the defaults; returns them),
     ss.announce(text, kind), ss.el (the box), ss.status (the status line), ss.share (the LX.Share object)
   Announcements: an opened, updated or refused link is said in the status line (role="status", filled just after the
   page mounts so screen readers read it) and stays until the plan changes. A refused link on load is taken out of the
   address; a link opened later that cannot be read keeps the reader's current plan. */
(function () {
  "use strict";
  // ---------------------------------------------------------------- pure (no DOM; exported for Node)
  var KEY_RX = /^[a-z][a-z0-9]*$/, SHORT_RX = /^[a-z]+$/, PAIR_RX = /^([a-z]+)([_0-9][0-9d]*)$/, MAX_HASH = 1500;
  var TYPES = ["num", "int", "bool", "enum", "set", "order"];
  function fail(msg) { throw new Error("LX.ShareState: " + msg); }
  function decimals(x) { var s = String(x), i = s.indexOf("."); return i < 0 ? 0 : s.length - i - 1; }
  function stepOf(f) { return f.type === "int" ? (f.step || 1) : f.step; }
  function fmtNum(f, v) {
    var d = Math.max(decimals(stepOf(f)), decimals(f.min));
    var s = (+v).toFixed(d);
    if (s.indexOf(".") >= 0) s = s.replace(/0+$/, "").replace(/\.$/, "");
    return s === "-0" ? "0" : s;
  }
  function fmtValue(f, v) {
    if (f.type === "num" || f.type === "int") return Number(v).toLocaleString("en-US", { maximumFractionDigits: 6 }) + (f.unit ? " " + f.unit : "");
    if (f.type === "bool") return v ? "on" : "off";
    var nm = function (x) { return f.names && f.names[x] != null ? String(f.names[x]) : String(x); };
    if (f.type === "set" || f.type === "order") return (v || []).map(nm).join(", ") || "none";
    return nm(v);
  }
  function name(f) { return f.label || f.id; }
  // one field's value: null when it is valid, else a short phrase (used in link messages and by the page)
  function fieldProblem(f, v) {
    if (f.type === "num" || f.type === "int") {
      if (typeof v !== "number" || !isFinite(v)) return name(f) + " is not a number";
      var lo = fmtValue(f, f.min).replace(/ .*$/, ""), hi = fmtValue(f, f.max);
      if (v < f.min - 1e-9 || v > f.max + 1e-9) return name(f) + " is " + fmtValue(f, v) + ", outside " + lo + " to " + hi;
      var k = (v - f.min) / stepOf(f);
      if (Math.abs(k - Math.round(k)) > 1e-6) return name(f) + " must be in steps of " + fmtValue(f, stepOf(f));
      return null;
    }
    if (f.type === "bool") return typeof v === "boolean" ? null : name(f) + " must be on or off";
    if (f.type === "enum") return f.values.indexOf(v) >= 0 ? null : name(f) + " is not one of: " + f.values.join(", ");
    if (!Array.isArray(v)) return name(f) + " must be a list";
    var seen = {};
    for (var i = 0; i < v.length; i++) {
      if (f.values.indexOf(v[i]) < 0) return name(f) + " has an unknown item";
      if (seen[v[i]]) return name(f) + " lists an item twice";
      seen[v[i]] = true;
    }
    if (f.type === "order" && v.length !== f.values.length) return name(f) + " must list all " + f.values.length + " items";
    return null;
  }
  function checkFields(F, where) {
    if (!Array.isArray(F) || !F.length) fail(where + ": fields must be a non-empty list");
    var ids = {}, shorts = {};
    F.forEach(function (f) {
      if (!f || typeof f.id !== "string" || !f.id) fail(where + ": every field needs an id");
      if (ids[f.id]) fail(where + ": field id " + f.id + " repeats");
      ids[f.id] = true;
      if (!SHORT_RX.test(f.short || "")) fail(where + ": field " + f.id + ": short must be lower-case letters");
      if (shorts[f.short]) fail(where + ": short name " + f.short + " repeats");
      shorts[f.short] = true;
      if (TYPES.indexOf(f.type) < 0) fail(where + ": field " + f.id + ": type must be one of " + TYPES.join(", "));
      if (f.type === "num" || f.type === "int") {
        if (typeof f.min !== "number" || typeof f.max !== "number" || !(f.min < f.max)) fail(where + ": field " + f.id + ": needs min < max");
        if (f.type === "num" && !(f.step > 0)) fail(where + ": field " + f.id + ": a num needs step > 0");
        if (f.type === "int" && (f.min % 1 || f.max % 1 || (f.step && f.step % 1))) fail(where + ": field " + f.id + ": an int has whole min, max and step");
      }
      if (["enum", "set", "order"].indexOf(f.type) >= 0) {
        if (!Array.isArray(f.values) || !f.values.length) fail(where + ": field " + f.id + ": needs values");
        if (f.values.some(function (x, i) { return typeof x !== "string" || f.values.indexOf(x) !== i; })) fail(where + ": field " + f.id + ": values must be unique strings");
        if (f.type === "set" && f.values.length > 30) fail(where + ": field " + f.id + ": a set takes at most 30 values");
        if (f.type === "order" && f.values.length > 10) fail(where + ": field " + f.id + ": an order takes at most 10 values");
      }
      var p = fieldProblem(f, f.def);
      if (p) fail(where + ": field " + f.id + ": its default is invalid (" + p + ")");
    });
  }
  function checkSchema(S) {
    if (!S || typeof S !== "object") fail("no schema");
    if (S._checked) return S;
    if (!KEY_RX.test(S.key || "")) fail("the key must be a lower-case letter, then letters or digits");
    if (!(S.version >= 1 && S.version % 1 === 0)) fail("the version must be a whole number from 1");
    checkFields(S.fields, "v" + S.version);
    var vs = {};
    (S.old || []).forEach(function (o) {
      if (!o || !(o.version >= 0 && o.version % 1 === 0 && o.version < S.version)) fail("an old entry needs a whole version below " + S.version);
      if (vs[o.version]) fail("old version " + o.version + " repeats");
      vs[o.version] = true;
      checkFields(o.fields, "v" + o.version);
      if (typeof o.up !== "function") fail("old version " + o.version + " needs up(state)");
    });
    var d = defaults(S), p = S.check ? S.check(d) : null;
    if (p) fail("the defaults break the schema's check (" + p + ")");
    try { Object.defineProperty(S, "_checked", { value: true }); } catch (e) { /* a frozen schema is checked again next time */ }
    return S;
  }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function defaultsOf(F) { var s = {}; F.forEach(function (f) { s[f.id] = clone(f.def); }); return s; }
  function defaults(S) { return defaultsOf(S.fields); }
  function problemsOf(F, check, state) {
    if (!state || typeof state !== "object") return ["the plan is missing"];
    var out = [];
    F.forEach(function (f) { if (!(f.id in state)) out.push("a part is missing: " + name(f)); else { var p = fieldProblem(f, state[f.id]); if (p) out.push(p); } });
    Object.keys(state).forEach(function (k) { if (!F.some(function (f) { return f.id === k; })) out.push("an unknown part: " + k); });
    if (!out.length && check) { var c = check(state); if (c) out.push(c); }
    return out;
  }
  function validate(S, state) { checkSchema(S); return problemsOf(S.fields, S.check, state); }
  function encodeValue(f, v) {
    if (f.type === "num" || f.type === "int") return fmtNum(f, v).replace("-", "_").replace(".", "d");
    if (f.type === "bool") return v ? "1" : "0";
    if (f.type === "enum") return String(f.values.indexOf(v));
    if (f.type === "set") return String(v.reduce(function (n, x) { return n + Math.pow(2, f.values.indexOf(x)); }, 0));
    return v.map(function (x) { return f.values.indexOf(x); }).join("");
  }
  function encode(S, state) {
    var p = validate(S, state);
    if (p.length) fail("cannot encode an invalid plan (" + p.join("; ") + ")");
    return [S.key, "v" + S.version].concat(S.fields.map(function (f) { return f.short + encodeValue(f, state[f.id]); })).join("-");
  }
  // a value from the link: the value, or undefined when its text is not a value of this field's type
  function decodeValue(f, t) {
    if (f.type === "num" || f.type === "int") {
      if (!/^_?\d+(d\d+)?$/.test(t)) return undefined;
      return parseFloat(t.replace("_", "-").replace("d", "."));
    }
    if (!/^\d+$/.test(t)) return undefined;
    if (f.type === "bool") return t === "1" ? true : t === "0" ? false : undefined;
    if (f.type === "enum") { var i = +t; return i < f.values.length ? f.values[i] : undefined; }
    if (f.type === "set") {
      var n = +t; if (n >= Math.pow(2, f.values.length)) return undefined;
      return f.values.filter(function (x, k) { return Math.floor(n / Math.pow(2, k)) % 2 === 1; });
    }
    var ix = t.split("").map(Number);
    if (ix.length !== f.values.length || ix.some(function (k, j) { return k >= f.values.length || ix.indexOf(k) !== j; })) return undefined;
    return ix.map(function (k) { return f.values[k]; });
  }
  function parsePairs(F, parts) {
    var st = {}, seen = {};
    for (var i = 0; i < parts.length; i++) {
      var m = PAIR_RX.exec(parts[i]);
      if (!m) return { reason: "the link is damaged" };
      var f = F.filter(function (x) { return x.short === m[1]; })[0];
      if (!f) return { reason: "it has a part this page does not know (" + m[1] + ")" };
      if (seen[f.id]) return { reason: "a part appears twice: " + name(f) };
      seen[f.id] = true;
      var v = decodeValue(f, m[2]);
      if (v === undefined) return { reason: "the link is damaged at " + name(f) };
      st[f.id] = v;
    }
    return { state: st };
  }
  function decode(S, hash) {
    checkSchema(S);
    var h = String(hash == null ? "" : hash).replace(/^#/, ""), base = { state: defaults(S), version: S.version };
    function out(status, extra) { var r = clone(base); r.status = status; for (var k in extra) r[k] = extra[k]; return r; }
    if (h.indexOf(S.key + "-") !== 0) return out("none", {});
    if (h.length > MAX_HASH) return out("bad", { reason: "the link is too long" });
    var m = /^[a-z][a-z0-9]*-v(\d+)(?:-(.*))?$/.exec(h);
    if (!m) return out("bad", { reason: "the link is damaged" });
    var from = +m[1];
    if (from > S.version) return out("newer", { from: from });
    var old = (S.old || []).slice().sort(function (a, b) { return a.version - b.version; });
    var entry = from === S.version ? { fields: S.fields } : old.filter(function (o) { return o.version === from; })[0];
    if (!entry) return out("old", { from: from });
    var parsed = parsePairs(entry.fields, m[2] ? m[2].split("-") : []);
    if (parsed.reason) return out("bad", { from: from, reason: parsed.reason });
    var st = parsed.state, notes = [];
    var p = problemsOf(entry.fields, from === S.version ? S.check : null, st);
    if (p.length) return out("bad", { from: from, reason: p[0] });
    if (from < S.version) {
      for (var i = old.indexOf(entry); i < old.length; i++) {
        try { st = old[i].up(clone(st)); } catch (e) { return out("bad", { from: from, reason: "it could not be updated from version " + from }); }
        if (old[i].note) notes.push(old[i].note);
        var nextF = i + 1 < old.length ? old[i + 1].fields : S.fields;
        var q = problemsOf(nextF, i + 1 < old.length ? null : S.check, st);
        if (q.length) return out("bad", { from: from, reason: "after updating it, " + q[0] });
      }
      return out("migrated", { from: from, state: st, notes: notes });
    }
    return out("ok", { from: from, state: st });
  }
  function message(S, r, opt) {
    var t = (S && S.title) || "plan", fallback = opt && opt.keep ? "so the page keeps the plan you had" : "so the page starts from its default plan";
    if (!r) return "";
    if (r.status === "ok") return "Opened the " + t + " from your link.";
    if (r.status === "migrated") return "Opened the " + t + " from a link made with an earlier version of this page (v" + r.from + "), updated to v" + r.version + "."
      + (r.notes && r.notes.length ? " " + r.notes.join(" ") : "") + " Check it before you run it.";
    if (r.status === "bad") return "This link could not be read (" + r.reason + "), " + fallback + ".";
    if (r.status === "newer") return "This link was made with a newer version of this page (v" + r.from + "; this page is v" + r.version + "), " + fallback + ".";
    if (r.status === "old") return "This link was made with an old version of this page (v" + r.from + ") that it can no longer read, " + fallback + ".";
    return "";
  }
  function same(S, a, b) { return encode(S, a) === encode(S, b); }
  // the no-JS version of a bench's controls: each field, its value in `state` (default: the defaults) and what it can be
  function rangeText(f) {
    if (f.type === "num" || f.type === "int") return fmtValue(f, f.min).replace(/ .*$/, "") + " to " + fmtValue(f, f.max) + ", in steps of " + fmtValue(f, stepOf(f));
    if (f.type === "bool") return "on or off";
    var all = f.values.map(function (x) { return fmtValue(f, f.type === "enum" ? x : [x]); }).join(", ");
    if (f.type === "enum") return "one of: " + all;
    if (f.type === "set") return "any of: " + all;
    return "an order of: " + all;
  }
  function escH(t) { return String(t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function staticHTML(S, state, opt) {
    checkSchema(S); opt = opt || {};
    var st = state || defaults(S), labels = opt.labels || {};
    return '<table class="lx-facts"><thead><tr><th scope="col">' + escH(opt.head || "Control") + '</th><th scope="col">' + escH(opt.planHead || "Default plan")
      + '</th><th scope="col">Range</th></tr></thead><tbody>' + S.fields.map(function (f) {
        var v = labels[f.id] ? labels[f.id](st[f.id]) : fmtValue(f, st[f.id]);
        return "<tr><td>" + escH(name(f)) + '</td><td class="n">' + escH(v) + "</td><td>" + escH(f.range || rangeText(f)) + "</td></tr>";
      }).join("") + "</tbody></table>";
  }
  var api = { defaults: defaults, validate: validate, encode: encode, decode: decode, message: message, same: same, checkSchema: checkSchema,
              fmtValue: fmtValue, staticHTML: staticHTML, TYPES: TYPES };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H;
  function hashNow() { return typeof location !== "undefined" ? String(location.hash || "") : ""; }
  function hist() { return (window.history) || (typeof history !== "undefined" ? history : null); }
  function baseUrl() { return String(location.href).split("#")[0]; }
  LX.ShareState = function (host, o) {
    var S = checkSchema(o.schema), sync = o.sync !== false;
    var box = H("div", { class: "lx-ss" }, host);
    var status = H("p", { class: "lx-ss-msg", role: "status", "aria-live": "polite" }, box);
    var row = o.button ? null : H("div", { class: "lx-ss-row" }, box);
    var r0 = decode(S, hashNow()), cur = clone(r0.state), written = null, timer = null, said = 0, showing = false;
    function put(h) {   // the address, without a new history entry; h null takes the hash out
      try { var x = hist(); if (x && x.replaceState) x.replaceState(x.state, "", h ? baseUrl() + "#" + h : baseUrl()); } catch (e) { /* not allowed here */ }
    }
    function write() { written = encode(S, cur); put(written); }
    function later() { if (timer) clearTimeout(timer); timer = setTimeout(function () { timer = null; write(); }, 250); }
    function announce(text, kind) {   // filled a moment later, so a region present at load is still read out
      var my = ++said;
      showing = !!text;
      status.className = "lx-ss-msg" + (kind ? " " + kind : "");
      status.textContent = "";
      if (text) setTimeout(function () { if (my === said) { status.textContent = text; LX.emit("layout"); } }, 120);
    }
    if (r0.status === "ok" || r0.status === "migrated") write();   // the link as this version writes it
    else if (r0.status !== "none") put(null);                     // a refused link leaves the address
    if (r0.status !== "none") announce(message(S, r0), r0.status === "ok" ? "ok" : (r0.status === "migrated" ? "note" : "warn"));
    var share = LX.Share ? LX.Share(box, { button: o.button || row, buttonText: o.buttonText || "Copy plan link", id: o.id,
      note: o.note || "Anyone who opens this link sees this plan and can run it themselves. It holds only the plan's numbers and choices.",
      replace: sync, hash: function () { written = encode(S, cur); return written; } }) : null;
    if (window.addEventListener) window.addEventListener("hashchange", function () {
      var h = hashNow().replace(/^#/, "");
      if (!h || h === written) return;
      var r = decode(S, h);
      if (r.status === "none") return;
      if (r.status === "ok" || r.status === "migrated") {
        cur = clone(r.state); write();
        announce(message(S, r), r.status === "ok" ? "ok" : "note");
        if (o.onLoad) o.onLoad(clone(cur), r);
      } else {
        put(written || null);   // the damaged hash leaves the address; the reader's plan stays
        announce(message(S, r, { keep: true }), "warn");
      }
    });
    return {
      el: box, status: status, share: share, schema: S, state: clone(cur), result: r0,
      get: function () { return clone(cur); },
      set: function (state, opt) {
        var p = validate(S, state);
        if (p.length) return p;
        var changed = encode(S, state) !== encode(S, cur);
        cur = clone(state);
        if (changed && showing) announce("", null);   // a link notice goes once the reader changes the plan
        if (sync && !(opt && opt.write === false)) later();
        return [];
      },
      reset: function () { cur = defaults(S); if (sync) later(); announce("", null); return clone(cur); },
      hash: function () { return encode(S, cur); },
      url: function () { return baseUrl() + "#" + encode(S, cur); },
      copy: function () { return share ? share.share() : (LX.copyText ? LX.copyText(baseUrl() + "#" + encode(S, cur), {}) : Promise.resolve(false)); },
      announce: announce
    };
  };
  Object.keys(api).forEach(function (k) { LX.ShareState[k] = api[k]; });
})();
