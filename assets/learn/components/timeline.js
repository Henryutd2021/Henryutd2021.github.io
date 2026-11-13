/* timeline.js — LX.Timeline: dated events, each with its source, in order (e-timeline; case files CF1-CF8, also A1 and
   X3).
   var tl = LX.Timeline(host, {
     title: "The study in time",  lede: "One sentence.",   both optional (the title is an h3 in .lx-x-head; an h2 right under the page title)
     events: [{ date: "2023" | "2023-05" | "2023-05-14",   ISO, to the year, month or day
                label: "Data year ends",                    a few words
                text: "One sentence.",                      optional ([[glossary|marks]] and **bold** work)
                source: { label: "EIA-930", url: "https://www.eia.gov/...", as_of: "2025-11-01" }   or a list of them;
                                                            every event needs one (url optional, http(s) only)
                kind: "study" | "data" | "policy" | "event",   a tag in words beside the date (default "event")
                key: true,                                  an accent ring and a "Key step" tag (keyLabel: other words)
                deeper: "Optional longer text, in a details box." }],
     gaps: true,           between events, the time that passed ("14 months later"; default true)
     order: "asc",         "asc" (default) or "desc"
     kinds: { study: "Study" },   other words for the kind tags
     note: "One sentence." });
   Returns { el, events } (events as drawn, sorted).
   An ordered list with <time datetime> dates: it reads in order as text, so it is its own text version; markers on a
   rule, the kind in words (colour is never the only cue), sources as links. One column; on wide screens the date sits
   left of the event.
   Node: module.exports = { parse, fmt, sortEvents, gap, validate, staticHTML, KINDS } (pure). staticHTML(events, opt)
   is the page's no-JS list (<ol class="lx-tl-static">), for a test's --write mode. */
(function () {
  "use strict";
  var MON = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var KINDS = { study: "Study", data: "Data", policy: "Policy", event: "Event" };
  // ---------------------------------------------------------------- pure (no DOM; exported for Node)
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function rich(t) {
    return esc(t).replace(/\[\[([a-z0-9-]+)\|([^\]]+)\]\]/g, '<span class="lx-term" data-term="$1">$2</span>').replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  }
  // "2023", "2023-05" or "2023-05-14" -> {y, m, d, p: "year" | "month" | "day", t (sortable)}; null when invalid
  function parse(s) {
    var m = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(String(s == null ? "" : s).trim());
    if (!m) return null;
    var y = +m[1], mo = m[2] ? +m[2] : null, d = m[3] ? +m[3] : null;
    if (mo != null && (mo < 1 || mo > 12)) return null;
    if (d != null) { var last = new Date(Date.UTC(y, mo, 0)).getUTCDate(); if (d < 1 || d > last) return null; }
    return { y: y, m: mo, d: d, p: d != null ? "day" : mo != null ? "month" : "year", t: y * 10000 + (mo || 0) * 100 + (d || 0) };
  }
  // "2023", "May 2023", "14 May 2023"
  function fmt(s) { var x = typeof s === "object" && s ? s : parse(s); if (!x) return String(s); return (x.d ? x.d + " " : "") + (x.m ? MON[x.m - 1] + " " : "") + x.y; }
  function sortEvents(events, order) {
    var ev = events.map(function (e, i) { return { e: e, i: i, t: (parse(e.date) || { t: 0 }).t }; });
    ev.sort(function (a, b) { return a.t - b.t || a.i - b.i; });
    if (order === "desc") ev.reverse();
    return ev.map(function (x) { return x.e; });
  }
  // the time from date a to date b (b later), in words at the coarser of the two precisions
  function gap(a, b) {
    var A = parse(a), B = parse(b);
    if (!A || !B) return "";
    if (A.p === "year" || B.p === "year") {
      var dy = B.y - A.y;
      return dy <= 0 ? "the same year" : dy === 1 ? "1 year later" : dy + " years later";
    }
    var mo = (B.y - A.y) * 12 + (B.m - A.m);
    if (A.p === "day" && B.p === "day" && mo < 2) {
      var dd = Math.round((Date.UTC(B.y, B.m - 1, B.d) - Date.UTC(A.y, A.m - 1, A.d)) / 864e5);
      return dd <= 0 ? "the same day" : dd === 1 ? "1 day later" : dd + " days later";
    }
    if (mo <= 0) return "the same month";
    if (mo === 1) return "1 month later";
    if (mo < 24) return mo + " months later";
    return "about " + Math.round(mo / 12) + " years later";
  }
  function sources(e) { return e.source == null ? [] : Array.isArray(e.source) ? e.source : [e.source]; }
  function validate(events) {
    var out = [];
    if (!Array.isArray(events) || !events.length) return ["no events"];
    events.forEach(function (e, i) {
      var name = "event " + (i + 1) + (e && e.label ? " (" + e.label + ")" : "");
      if (!parse(e.date)) out.push(name + ": date " + JSON.stringify(e.date) + " is not YYYY, YYYY-MM or YYYY-MM-DD");
      if (!e.label) out.push(name + ": no label");
      if (e.kind && !KINDS[e.kind]) out.push(name + ": unknown kind " + e.kind);
      var S = sources(e);
      if (!S.length) out.push(name + ": no source");
      S.forEach(function (s) {
        if (!s || !s.label) out.push(name + ": a source without a label");
        else if (s.url && !/^https?:\/\//.test(s.url)) out.push(name + ": source URL is not http(s)");
        if (s && s.as_of && !parse(s.as_of)) out.push(name + ": as_of " + JSON.stringify(s.as_of) + " is not a date");
      });
    });
    return out;
  }
  function srcHTML(e) {
    return sources(e).map(function (s) {
      return (s.url ? '<a href="' + esc(s.url) + '">' + esc(s.label) + "</a>" : esc(s.label)) + (s.as_of ? ", as of " + esc(fmt(s.as_of)) : "");
    }).join("; ");
  }
  // the no-JS list: each event's date, label, finding and source on lines of their own (as the live timeline sets them)
  function staticHTML(events, opt) {
    opt = opt || {};
    return '<ol class="lx-tl-static">' + sortEvents(events, opt.order).map(function (e) {
      return "<li><b>" + esc(fmt(e.date)) + "</b><br> " + esc(e.label) + "." + (e.text ? "<br> " + rich(e.text) : "")
        + '<br> <span class="lx-hint">Source: ' + srcHTML(e) + "</span></li>";
    }).join("") + "</ol>";
  }
  var api = { parse: parse, fmt: fmt, sortEvents: sortEvents, gap: gap, validate: validate, staticHTML: staticHTML, KINDS: KINDS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H;
  LX.Timeline = function (host, o) {
    var bad = validate(o.events);
    if (bad.length) throw new Error("LX.Timeline: " + bad.join("; "));
    var kinds = {}; Object.keys(KINDS).forEach(function (k) { kinds[k] = (o.kinds && o.kinds[k]) || KINDS[k]; });
    var ev = sortEvents(o.events, o.order), box = H("div", { class: "lx-tl" }, host);
    if (o.title) { var hd = H("header", { class: "lx-x-head" }, box); H(LX.hTag(3, hd), { text: o.title }, hd); }
    if (o.lede) H("p", { class: "lx-tl-lede", html: rich(o.lede) }, box);
    var ol = H("ol", { class: "lx-tl-list", "aria-label": o.title || "Timeline" }, box);
    ev.forEach(function (e, i) {
      var kind = e.kind || "event", li = H("li", { class: "lx-tl-ev k-" + kind + (e.key ? " key" : "") }, ol);
      if (o.gaps !== false && i > 0) {
        var g = o.order === "desc" ? gap(e.date, ev[i - 1].date).replace(" later", " earlier") : gap(ev[i - 1].date, e.date);
        if (g) H("span", { class: "lx-tl-gap", text: g.charAt(0).toUpperCase() + g.slice(1) }, li);
      }
      H("span", { class: "lx-tl-dot", "aria-hidden": "true" }, li);
      var when = H("div", { class: "lx-tl-when" }, li);
      H("time", { datetime: String(e.date), class: "lx-tl-date", text: fmt(e.date) }, when);
      H("span", { class: "lx-tl-kind", text: kinds[kind] }, when);
      if (e.key) H("span", { class: "lx-tl-keytag", text: o.keyLabel || "Key step" }, when);
      var body = H("div", { class: "lx-tl-body" }, li);
      H("p", { class: "lx-tl-label", text: e.label }, body);
      if (e.text) H("p", { class: "lx-tl-text", html: rich(e.text) }, body);
      if (e.deeper) {
        var d = H("details", { class: "lx-tl-more" }, body);
        H("summary", { text: "More" }, d); H("p", { html: rich(e.deeper) }, d);
        d.addEventListener("toggle", function () { if (LX.emit) LX.emit("layout"); });
      }
      H("p", { class: "lx-tl-src", html: "Source: " + srcHTML(e) }, body);
    });
    if (o.note) H("p", { class: "lx-hint", html: rich(o.note) }, box);
    return { el: box, events: ev };
  };
  Object.keys(api).forEach(function (k) { LX.Timeline[k] = api[k]; });
})();
