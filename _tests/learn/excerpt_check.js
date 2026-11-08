// excerpt_check.js — research wording against the approved excerpts (the course's sourcing rule), shared by the tests
// of M9, M10 and CF8. Not a test itself (the test runner runs test_*.js only). The same rule as CF2's and M7's tests:
// every sentence about the course author's studies is an approved sentence of the excerpt wording, word for word, or a
// clause of one where the page breaks it; a short list of provenance labels (NOT_RESEARCH, given by each test) may
// name a study without describing it.
//   const X = require("./excerpt_check.js");
//   const R = X.register(["E1", "E12", "E13"]);   // { units: [...normalized sentences], raw: {E12.5: "..."}, ack, found }
//   X.approved(R, segment) -> bool;  X.elements(html) -> text segments;  X.norm(s)
// The wording's rows: "| E12.5 | sentence | where | source |" in the sections "## E1." and "### E12." / "### E13."; E1 is
// the blockquote under "## E1."; the prefixes "Timeline, <date>: ", "Citations: " and "Source: " are labels, not wording.
// The acknowledgement sentence of E13 is matched against the approved text itself.
// The wording is read through private_sources.js ("excerpts"); register() gives null when it is not available.
"use strict";
const fs = require("fs");
const PRIV = require("./private_sources.js");
const ACK = "This work was developed based upon funding from the Alliance for Sustainable Energy, LLC, Managing and Operating Contractor for the National Renewable Energy Laboratory for the U.S. Department of Energy.";
function norm(s) {
  return String(s).replace(/\[\[[a-z0-9:-]+\|([^\]]+)\]\]/g, "$1").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\\\$/g, "$").replace(/\s+/g, " ").replace(/ ([.,;:?!)])/g, "$1").replace(/\( /g, "(").trim();
}
// the approved units of the named sources; null when the approved wording is not available (the caller says so)
function register(keys) {
  const RP = PRIV.path("excerpts");
  if (!RP) return null;
  const md = fs.readFileSync(RP, "utf8"), raw = {};
  let sec = null;
  const strip = t => t.replace(/^(Timeline, [^:]+|Citations|Source): /, "");
  md.split("\n").forEach(line => {
    const h = line.match(/^#{2,3} (E\d+)\./); if (h) { sec = h[1]; return; }
    if (/^#{1,3} /.test(line)) { sec = null; return; }
    if (!sec || keys.indexOf(sec) < 0) return;
    if (sec === "E1") { const q = line.match(/^> (.*)$/); if (q) raw.E1 = q[1].replace(/\[([^\]]+)\]\([^)]*\)/g, "$1"); return; }   // the citation stays, as text
    const m = line.match(/^\| (E\d+\.\d+) \| (.*?) \| /);
    if (m) raw[m[1]] = strip(m[2]);
  });
  const units = Object.keys(raw).map(k => norm(raw[k]));
  const ack = md.indexOf(ACK) >= 0;
  if (ack && keys.indexOf("E13") >= 0) units.push(norm(ACK));
  return { units, raw, ack, found: RP, md };
}
// a segment is approved when it is a whole unit, or a run of whole sentences or clauses of one unit
function approved(R, seg) {
  const s = norm(seg);
  return s.length > 0 && R.units.some(u => {
    for (let i = u.indexOf(s); i >= 0; i = u.indexOf(s, i + 1)) {
      const pre = u.slice(0, i), post = u.slice(i + s.length);
      if ((i === 0 || /[:;.?!] $/.test(pre)) && (post === "" || /^[:;.]/.test(post) || (/^ /.test(post) && /[.;:?!]$/.test(s)))) return true;
    }
    return false;
  });
}
// text segments of an HTML or Markdown fragment, split at block tags
function elements(html) {
  return html.replace(/<!--[\s\S]*?-->/g, " ").replace(/^- (.*)$/gm, "<li>$1</li>").replace(/\[([^\]]+)\]\{[^}]*\}/g, "$1").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .split(/<\/?(?:p|li|ul|ol|dl|dt|dd|div|blockquote|footer|table|thead|tbody|tr|td|th|caption|details|summary|header|h[1-6]|section|nav|script|style)\b[^>]*>|```[^\n]*\n?/i)
    .map(norm).filter(s => s && !/^(:::|\{=html\})/.test(s) && /[A-Za-z]/.test(s));
}
const sentencesOf = s => norm(s).split(/(?<=[.?!])\s+(?=[A-Z“"])/);
// the first sentence of seg that is neither approved nor a listed label; null when all are
function offending(R, notResearch, seg) {
  const listed = x => notResearch.some(r => r[0].test(norm(x)));
  if (approved(R, seg) || listed(seg)) return null;
  // a "Label: sentence" row, as the approved wording has some (Inputs:, Targets:, Try it yourself:) is checked whole above
  return sentencesOf(seg).find(x => !approved(R, x) && !listed(x)) || null;
}
module.exports = { ACK, norm, register, approved, elements, offending, sentencesOf };
