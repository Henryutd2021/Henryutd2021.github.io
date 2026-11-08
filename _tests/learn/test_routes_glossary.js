// test_routes_glossary.js — Node tests of two course-wide rules:
//   - routes: a recommended "Next" never skips a prerequisite silently. Every prerequisite of `next` that the route to a
//     lesson has not met is named in path.yml's `next_needs`, and the hand-off says "Needs first: ..." with links. The
//     course build step's rule (route_problems) is run on the real course, and on copies with a hand-off's list removed
//     or padded, which it must catch (needs the build step's source: LEARN_SOURCES "build"; skipped, and said, without it)
//   - glossary: one entry per concept. No two entries share a display name; an alias id repeats its concept's term,
//     definition and "Taught in" lesson; the pairs once defined twice (time-of-use tariff, transfer) resolve to one
// Usage (from the site folder):  node _tests/learn/test_routes_glossary.js
"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const PRIV = require("./private_sources.js");
const SITE = path.resolve(__dirname, "..", "..");
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const read = p => fs.readFileSync(path.join(SITE, p), "utf8");
const PJ = JSON.parse(read("assets/learn/data/path.json"));
const live = [].concat(PJ.starter, PJ.more, PJ.toolbox);

// ---------------- the hand-offs the reviews named, as pages show them
const next = id => { const t = read("learn/" + id + ".qmd"), m = /<div class="lx-next lx-card"[\s\S]*?<\/div>/.exec(t); return m ? m[0] : ""; };
ok(/CK-M · /.test(next("m03-capacity-expansion")) && /Needs first: <a href="r05-build-validate\.html">R5 · [^<]+<\/a>\./.test(next("m03-capacity-expansion")),
  "M3 hands off to CK-M and names R5 first (CK-M needs R5)");
ok(/R6 · /.test(next("r05-build-validate")) && /Needs first: <a href="m07-monte-carlo\.html">M7 · [^<]+<\/a> and <a href="m08-stochastic-robust\.html">M8 · [^<]+<\/a>\./.test(next("r05-build-validate")),
  "R5 hands off to R6 and names M7 and M8 first (R6 needs them)");
{ // every "Needs first" link reaches a live page
  const hrefs = fs.readdirSync(path.join(SITE, "learn")).filter(f => f.endsWith(".qmd")).flatMap(f => {
    const m = /<p class="lx-next-d lx-next-needs">([\s\S]*?)<\/p>/.exec(read("learn/" + f)); return m ? [...m[1].matchAll(/href="([^"]+)"/g)].map(x => x[1]) : []; });
  ok(hrefs.length >= 30 && hrefs.every(h => live.some(l => l.href === h && l.ready)), "every 'Needs first' link reaches a live lesson (" + hrefs.length + ")");
}

// ---------------- the build step's rule
const BUILD = PRIV.path("build");
if (!BUILD) console.log("note: LEARN_SOURCES has no 'build' entry; the route rule itself is not run here (the build step runs it)");
else {
  const py = `
import sys, json, copy
sys.path.insert(0, ${JSON.stringify(path.dirname(BUILD))})
import build_learn as B
tiers, tmap, lessons, starter, tools, scales = B.load_path(${JSON.stringify(SITE)})
by_code = {l["code"]: l for l in lessons + tools if l.get("code")}
out = {"real": B.route_problems(lessons, tools, starter, by_code)}
def variant(code, value):
    L = copy.deepcopy(lessons); T = copy.deepcopy(tools)
    for l in L + T:
        if l.get("code") == code:
            if value is None: l.pop("next_needs", None)
            else: l["next_needs"] = value
    bc = {l["code"]: l for l in L + T if l.get("code")}
    st = sorted([l for l in L if l.get("starter") is not None], key=lambda l: l["starter"])
    return B.route_problems(L, T, st, bc)
out["m3_unnamed"] = variant("M3", None)
out["r5_partial"] = variant("R5", ["M7"])
out["m3_padded"] = variant("M3", ["R5", "R1"])
print(json.dumps(out))
`;
  const R = JSON.parse(execFileSync("python3", ["-c", py], { encoding: "utf8" }));
  ok(R.real.length === 0, "the course as it is: no route skips a prerequisite unnamed: " + R.real.join("; "));
  ok(R.m3_unnamed.length === 1 && /^M3 -> CK-M: the route has not met R5; next_needs lists nothing/.test(R.m3_unnamed[0]), "rule: M3 without next_needs fails, naming R5: " + R.m3_unnamed[0]);
  ok(R.r5_partial.length === 1 && /^R5 -> R6: the route has not met M7, M8; next_needs lists M7/.test(R.r5_partial[0]), "rule: R5 naming only M7 fails: " + R.r5_partial[0]);
  ok(R.m3_padded.length === 1 && /next_needs lists R5, R1/.test(R.m3_padded[0]), "rule: a hand-off naming a met prerequisite fails too (stale): " + R.m3_padded[0]);
}

// ---------------- glossary: one entry per concept
const G = JSON.parse(read("assets/learn/data/glossary.json"));
const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
{
  const byName = {};
  Object.keys(G).filter(k => !G[k].alias).forEach(k => { (byName[norm(G[k].term)] = byName[norm(G[k].term)] || []).push(k); });
  const dup = Object.keys(byName).filter(n => byName[n].length > 1);
  ok(dup.length === 0, "no two glossary entries share a display name: " + dup.map(n => byName[n].join("/")).join(", "));
  const al = Object.keys(G).filter(k => G[k].alias);
  ok(al.every(k => G[G[k].alias] && !G[G[k].alias].alias && ["term", "short", "lesson", "href"].every(f => G[k][f] === G[G[k].alias][f])),
    "every alias repeats its concept's term, definition and lesson: " + al.join(", "));
  ok(G["time-of-use"] && G["time-of-use"].alias === "time-of-use-tariff" && G["time-of-use-tariff"].lesson === "A4" && G["time-of-use-tariff"].href === "a04-retail-tariffs.html",
    "time-of-use is an alias of time-of-use-tariff, taught in A4");
  ok(G["transfer"] && G["transfer"].alias === "transfer-payment" && G["transfer-payment"].lesson === "A12" && G["transfer-payment"].href === "a12-policy-instruments.html",
    "transfer is an alias of transfer-payment, taught in A12");
}
console.log((fails ? "FAILED " + fails + " of " : "ok: ") + checks + " checks (routes and glossary)");
process.exit(fails ? 1 : 0);
