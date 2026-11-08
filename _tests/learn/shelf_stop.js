// shelf_stop.js — the side-topic shelf's "where we stop" box (the explain layer's e-stop: where the course stops, plus
// a three-rung reading ladder; the depth budget says what each side topic includes and excludes), the writer shared by
// the tests of X1 to X6. Not a test itself (the test runner runs test_*.js only).
//   const S = require("./shelf_stop.js");
//   S.stopHTML(D.stop, "x05")  -> the box's static HTML (each test writes it between <!-- x05-stop:start --> markers)
//   S.problems(D.stop)         -> [] when the box has its parts: a title, what the topic covers, what it leaves to
//                                 specialists, and exactly three rungs, each with a source label and an "as of" date
//   S.ALLOW, S.linkOK(url)     -> the allow-list used by the four tests (the course's allowed destinations)
//   S.plain, S.nWords, S.nSent -> the text-budget counters the six tests share (nSent reads "U.S.", "K.S.A.", "e.g.",
//                                 "i.e.", "p.", "pp." and "No." as one word, not a sentence end)
// The box is static HTML (it reads the same with and without JavaScript); its styles are the xs- rules in
// assets/learn/components/explain.css (shared by the six pages; see the README's component list).
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
// text budget (the counting rules the step-card tests share)
const plain = t => String(t).replace(/<[^>]+>/g, " ").replace(/\[\[[^|\]]+\|([^\]]+)\]\]/g, "$1").replace(/\*\*/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
const nWords = t => plain(t).split(/\s+/).filter(w => /[A-Za-z0-9$]/.test(w)).length;
const nSent = t => plain(t).replace(/U\.S\./g, "US").replace(/K\.S\.A\./g, "KSA").replace(/e\.g\./g, "eg").replace(/i\.e\./g, "ie").replace(/[0-9]\.[0-9]/g, "0").replace(/\bp\. /g, "p ").replace(/\bpp\. /g, "pp ").replace(/\bNo\. /g, "No ")
  .split(/(?<=[.?!])\s+(?=[A-Z“$0-9])/).filter(x => /[A-Za-z]/.test(x)).length;
module.exports = { stopHTML, problems, ALLOW, linkOK, esc, plain, nWords, nSent };
