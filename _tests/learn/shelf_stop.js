// shelf_stop.js — the side-topic shelf's "where we stop" box (curriculum v2 §16.2 e-stop: where the course stops, plus
// a three-rung reading ladder; §4.4 says what each side topic includes and excludes), shared by the W7 tests of X1, X4,
// X5 and X6 (builder learn-w7-a, 2026-11-07). Not a test itself (the QA runs test_*.js only).
//   const S = require("./shelf_stop.js");
//   S.stopHTML(D.stop, "x05")  -> the box's static HTML (each test writes it between <!-- x05-stop:start --> markers)
//   S.problems(D.stop)         -> [] when the box has its parts: a title, what the topic covers, what it leaves to
//                                 specialists, and exactly three rungs, each with a source label and an "as of" date
//   S.ALLOW, S.linkOK(url)     -> the allow-list used by the four tests (curriculum §20.3)
//   S.plain, S.nWords, S.nSent -> the text-budget counters the four tests share
// The box is static HTML (it reads the same with and without JavaScript); its styles are the page's xs-* rules, the
// same block on each of the four pages (to promote to forms.css as one shared rule).
"use strict";
const ALLOW = /^https:\/\/([a-z0-9.-]+\.)?(eia\.gov|energy\.gov|ferc\.gov|nerc\.com|lbl\.gov|nrel\.gov|nlr\.gov|epa\.gov|usgs\.gov|bea\.gov|census\.gov|bls\.gov|noaa\.gov|irs\.gov|kcc\.ks\.gov|iea\.org|irena\.org|ipcc\.ch|ourworldindata\.org|openalex\.org|doi\.org|spp\.org)\//;
function linkOK(u) { return u == null || ALLOW.test(u); }
function esc(t) { return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
// a source in a rung: a link when it is on the allow-list, else the name alone ("cited by name, without a link")
function src(s) {
  const name = s.url ? '<a href="' + esc(s.url) + '">' + esc(s.label) + "</a>" : esc(s.label);
  return '<span class="xs-src">' + name + (s.asof ? ", " + esc(s.asof) : "") + "</span>";
}
function stopHTML(stop, p) {
  return '<div class="lx-card xs-stop" id="' + p + '-stop">' +
    '<p class="lx-eyebrow">Where we stop</p>' +
    "<h3>" + esc(stop.title) + "</h3>" +
    '<p class="xs-stop-lede">' + esc(stop.lede) + "</p>" +
    '<div class="xs-stop-cols">' +
    '<div><h4 class="xs-h">' + esc(stop.inLabel || "This side topic covers") + "</h4><ul>" + stop.includes.map(t => "<li>" + esc(t) + "</li>").join("") + "</ul></div>" +
    '<div><h4 class="xs-h">' + esc(stop.outLabel || "Left to specialists") + "</h4><ul>" + stop.leaves.map(t => "<li>" + esc(t) + "</li>").join("") + "</ul></div>" +
    "</div>" +
    '<h4 class="xs-h">Read next, three rungs</h4>' +
    '<ol class="xs-ladder">' + stop.ladder.map(r => '<li><b>' + esc(r.rung) + ".</b> " + esc(r.text) + " " + src(r.source) + "</li>").join("") + "</ol>" +
    "</div>";
}
function problems(stop) {
  const out = [];
  if (!stop || !stop.title || !stop.lede) out.push("title and lede");
  if (!stop.includes || stop.includes.length < 2) out.push("at least two items the topic covers");
  if (!stop.leaves || stop.leaves.length < 2) out.push("at least two items left to specialists");
  if (!stop.ladder || stop.ladder.length !== 3) out.push("exactly three rungs");
  (stop.ladder || []).forEach((r, i) => {
    if (!r.rung || !r.text || !r.source || !r.source.label) out.push("rung " + (i + 1) + " needs a name, a line and a source");
    else if (!r.source.asof) out.push("rung " + (i + 1) + " needs an 'as of' date");
    else if (!linkOK(r.source.url)) out.push("rung " + (i + 1) + " links off the allow-list: " + r.source.url);
  });
  return out;
}
// text budget (the counting rules of the W5 tests)
const plain = t => String(t).replace(/<[^>]+>/g, " ").replace(/\[\[[^|\]]+\|([^\]]+)\]\]/g, "$1").replace(/\*\*/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
const nWords = t => plain(t).split(/\s+/).filter(w => /[A-Za-z0-9$]/.test(w)).length;
const nSent = t => plain(t).replace(/U\.S\./g, "US").replace(/e\.g\./g, "eg").replace(/i\.e\./g, "ie").replace(/[0-9]\.[0-9]/g, "0").replace(/\bp\. /g, "p ").replace(/\bpp\. /g, "pp ").replace(/\bNo\. /g, "No ")
  .split(/(?<=[.?!])\s+(?=[A-Z“$0-9])/).filter(x => /[A-Za-z]/.test(x)).length;
module.exports = { stopHTML, problems, ALLOW, linkOK, esc, plain, nWords, nSent };
