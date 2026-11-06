// test_f09-city-energy.js — Node tests for lesson F9 (assets/learn/f09-city-energy.js, its data file, prairie-city.json
// and the page, learn/f09-city-energy.qmd):
//   - Prairie City's flows are read from prairie-city.json, never copied: the lesson's data file holds no GWh value and
//     the script retypes none
//   - the Sankey: the detailed spec is the file's own flows; the four-sector spec merges the users into groups and every
//     node still balances; carriers, sectors, losses and the city's own electricity recomputed here from the links
//   - every prediction, guess and reveal true against the data (the carrier, the biggest sector for every tap, the
//     sector that loses most, the share made in the city); the lens lights only the actor's nodes
//   - who decides what: every lever has a bin among the five actors, a reason and a source with a date in the data
//     file; each reason says "typically" or names its source's fact; the roles table covers every actor and sector
//   - the no-JS block, ideas, check, facts and sources equal what the model writes (--write rewrites them)
//   - scope (guard G-DC): the data-center campus appears only as a load; no nuclear term; no "AI"; links on the
//     allow-list (a source not on it is cited by name, without a link); the fictional line on every interactive
//   - text budget of the step cards, reveals and the page's prose
// Usage (from the site folder):  node _tests/learn/test_f09-city-energy.js [--write]
"use strict";
const fs = require("fs");
const path = require("path");
const ID = "f09-city-energy";
const SITE = path.resolve(__dirname, "..", "..");
const L = p => path.join(SITE, "assets/learn", p);
const M = require(L(ID + ".js"));
const RAW = fs.readFileSync(L("data/" + ID + ".json"), "utf8");
const F = JSON.parse(RAW);
const C = require(L("data/prairie-city.json"));
const JS = fs.readFileSync(L(ID + ".js"), "utf8");
const SIDE = fs.readFileSync(path.join(SITE, "learn/_w1/" + ID + ".yml"), "utf8");
const QPATH = path.join(SITE, "learn", ID + ".qmd");
let checks = 0, fails = 0;
function ok(c, msg) { checks++; if (!c) { fails++; console.log("FAIL:", msg); } }
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-9 : t);
const sum = a => a.reduce((s, v) => s + v, 0);

// ---------------- the generated blocks
const BLOCKS = { "f09-fallback": () => M.staticFallback(C, F), "f09-ideas": () => M.ideasHTML(C, F), "f09-check": () => M.checkHTML(C, F), "f09-facts": () => M.factsHTML(F), "f09-sources": () => M.sourcesHTML(C, F) };
function between(q, name) {
  const a = q.match(new RegExp("<!-- " + name + ":start[^>]*-->\\n")), b = q.indexOf("<!-- " + name + ":end -->");
  if (!a || b < a.index) throw new Error(name + " markers missing in " + QPATH);
  return { from: a.index + a[0].length, to: b };
}
if (process.argv.includes("--write")) {
  let q = fs.readFileSync(QPATH, "utf8");
  Object.keys(BLOCKS).forEach(k => { const r = between(q, k); q = q.slice(0, r.from) + BLOCKS[k]() + "\n" + q.slice(r.to); });
  fs.writeFileSync(QPATH, q);
  console.log("blocks written: " + Object.keys(BLOCKS).join(", "));
}
const PAGE = fs.readFileSync(QPATH, "utf8");
Object.keys(BLOCKS).forEach(k => { const r = between(PAGE, k); ok(PAGE.slice(r.from, r.to) === BLOCKS[k]() + "\n", k + " block is up to date (run with --write)"); });
const OWN = PAGE.replace(/<!-- learn:(meta|next|footer):start[\s\S]*?<!-- learn:\1:end -->/g, "");
const text = s => s.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

// ---------------- read, never retyped
ok(!/"gwh"\s*:|\b[0-9],?[0-9]{3}\.[0-9]\b/i.test(RAW) && !/3,?477|3,?446|2,?859|3,?167|3,?994|3,?517|165\.6|30\.8/.test(JS.replace(/\/\/[^\n]*/g, "")), "no Prairie City flow copied into the data file or the script");

// ---------------- the Sankey from first principles
const into = id => sum(C.flows.links.filter(l => l.to === id).map(l => l.value)), outOf = id => sum(C.flows.links.filter(l => l.from === id).map(l => l.value));
const det = M.detailed(C, F);
ok(det.nodes.length === C.flows.nodes.length && det.links.length === C.flows.links.length && det.links.every((l, i) => l.value === C.flows.links[i].value), "the detailed Sankey is the file's own flows");
const g = M.grouped(C, F), gb = M.balance(g);
ok(Object.keys(gb).every(k => !(gb[k].inn && gb[k].out) || near(gb[k].inn, gb[k].out, 0.11)), "every node of the four-sector Sankey balances (within the file's 0.1 GWh rounding)");
ok(near(sum(g.links.map(l => l.value)), sum(C.flows.links.map(l => l.value)), 0.5), "grouping keeps every GWh");
const members = F.groups.reduce((a, x) => a.concat(x.members), []), sectorIds = C.flows.nodes.filter(n => n.kind === "sector").map(n => n.id);
ok(members.slice().sort().join() === sectorIds.slice().sort().join(), "every sector of the file is in exactly one group");
const cs = M.carriers(C);
ok(cs[0].id === "el" && near(cs[0].gwh, into("el")) && cs.every((c, i) => i === 0 || c.gwh <= cs[i - 1].gwh) && cs.every(c => c.id !== "air"), "carriers recomputed and sorted; the outdoor air is not a bought carrier");
F.groups.forEach(x => {
  const s = M.sectors(C, F).filter(y => y.key === x.key)[0], inn = sum(x.members.map(into)), lost = sum(C.flows.links.filter(l => x.members.includes(l.from) && l.to === "losses").map(l => l.value));
  ok(near(s.gwh, inn, 0.11) && near(s.lost, lost, 0.11) && near(s.lossShare, s.lost / s.gwh), x.key + ": " + inn.toFixed(1) + " GWh in, " + lost.toFixed(1) + " lost");
});
const P = M.power(C);
ok(near(P.own, outOf("src_solar") / into("el")) && near(P.lost, C.flows.links.filter(l => l.from === "el" && l.to === "grid_losses")[0].value) && P.meters === C.balance.totals.el, "the city's own electricity and the wires' losses");
ok(near(P.meters * P.lossShare, P.lost, 0.1), "the wires lose 5% of what the meters take (the file's teaching value)");

// ---------------- every prediction and reveal true
{
  const Q = M.carrierQ(C);
  ok(Q.answer === cs[0].id && M.Q_CARRIER.options.every(o => Q.feedback[o.value] && Q.feedback[o.value].indexOf(M.gwh(into(o.value))) >= 0), "step 1: answer and feedback follow the data");
  const big = M.sectors(C, F).slice().sort((a, b) => b.gwh - a.gwh)[0];
  F.groups.forEach(x => { const t = M.sectorLine(C, F, x.key); ok(t.indexOf(x.key === big.key ? "the biggest sector" : "the biggest is " + big.short.toLowerCase()) >= 0, "step 2 line true for a tap on " + x.key); });
  ok(M.sectorLine(C, F, "useful") === null, "step 2: a tap on a non-sector bar gives no verdict");
  const LQ = M.lossQ(C, F), worst = M.sectors(C, F).filter(x => x.key !== "datacenter").sort((a, b) => b.lossShare - a.lossShare)[0];
  ok(LQ.answer === worst.key && worst.key === "transport" && M.Q_LOSS.options.every(o => LQ.feedback[o.value].indexOf(M.pct(M.sectors(C, F).filter(x => x.key === o.value)[0].lossShare)) >= 0), "step 3: the sector that loses most, from the data");
  ok(M.lossLine(C, F).indexOf(M.pct(C.transport.engineEfficiency)) >= 0 && C.transport.engineEfficiency === 0.3, "step 3: engines' 30% from the city data (DOE)");
  ok(M.OWN_TICKS[M.ownTick(P.own)] === "About 1%", "step 4: the right mark is about 1%");
  ok(M.powerLine(C).indexOf("**" + M.pct(P.own, 1) + "**") >= 0 && M.powerLine(C).indexOf(M.gwh(P.grid)) >= 0, "step 4 line");
  F.actors.forEach(a => {
    const Lz = M.lens(C, F, a.key);
    ok(Lz.spec.nodes.every(n => (a.nodes.includes(n.id) ? n.color === a.color : n.color === "var(--lx-line-2)")) && a.nodes.every(id => C.flows.nodes.some(n => n.id === id)), "step 6: the lens lights only " + a.key + "'s nodes");
    ok(a.levers && a.levers.split(/\s+/).length <= 30, "step 6: " + a.key + "'s levers line");
  });
  ok(M.muniSaw(C, F, "rates") === F.muni.feedback.rates && F.muni.answer === "rates" && F.muni.options.every(o => F.muni.feedback[o.value]), "step 7: feedback for every choice");
}

// ---------------- who decides what: bins, reasons, sources
const ACT = F.actors.map(a => a.key);
ok(ACT.join() === "city,utility,regulator,owners,federal", "five actors: the city, the utility, the state regulator, owners, federal rules");
F.levers.forEach(l => {
  ok(ACT.includes(l.bin) && l.why && l.src.every(s => F.sources[s]), "lever " + l.id + ": a bin, a reason, sources in the file");
});
ACT.forEach(a => ok(F.levers.some(l => l.bin === a), "at least one lever for " + a));
Object.entries(F.sources).forEach(([k, s]) => {
  ok(s.title && s.publisher && s.date && s.url && s.where, "source " + k + " complete");
  ok(/20[0-9]{2}/.test(s.date), "source " + k + " is dated");
});
ok(F.roles.rows.map(r => r.key).join() === ACT.join() && F.roles.rows.every(r => F.roles.cols.every(c => r.cells[c.key] && ["yes", "part", "no"].includes(r.cells[c.key].v))), "the roles table: every actor, every sector");
ok(/Typical U\.S\. roles, not universal/.test(F.roles.note) && /typical/i.test(OWN) && /not universal/.test(OWN), "roles are labelled typical, not universal");
ok(/In 2017, 1,958 publicly owned utilities served about 12,100 customers each/.test(F.muni.extra) && /1,958 publicly owned utilities averaging 12,100 customers/.test(F.sources["eia-iou-2019"].where), "step 7's EIA fact matches its source line");
ok(/72% in 2017/.test(F.facts[0].what) && /three out of every four/.test(F.sources["eia-iou-2019"].where), "the IOU share fact matches its source");
ok(/industry's activities include manufacturing, agriculture/.test(F.sources["eia-industry"].where) && F.groups[2].src === "eia-industry", "farms grouped with industry, as EIA does");

// ---------------- scope and links
const ALL = PAGE + "\n" + RAW + "\n" + JS + "\n" + SIDE;
ok(!/nuclear|reactor|\bSMR\b|small modular|fission|uranium/i.test(ALL), "no nuclear term");
ok(!/\bAI\b|artificial intelligence/.test(ALL), "no 'AI'");
ok(!/projects\/|research\.html|smr-dc/.test(ALL), "no project page and no Research page");
const PROSE_ALL = text(OWN) + " " + RAW + " " + JS.replace(/\/\/[^\n]*/g, "");
ok(!/data[- ]cent\w*[^.]{0,80}\b(supply|supplies|supplied|power plant|builds? (a|its own) (plant|generat)|generat\w*|buyer|order)/i.test(PROSE_ALL), "the data-center campus appears as a load only");
ok(/one large load kept apart/.test(F.groups[3].label), "the campus is labelled one large load");
const hrefs = [...OWN.matchAll(/href="([^"]+)"/g)].map(m => m[1].replace(/&amp;/g, "&")).concat(Object.values(F.sources).map(s => s.url).filter(u => u !== "no link"), F.facts.map(f => f.url));
const ALLOW = /^https:\/\/([a-z0-9.-]+\.)?(eia\.gov|energy\.gov|ferc\.gov|dot\.gov|spp\.org|epa\.gov|nlr\.gov|nrel\.gov|lbl\.gov|census\.gov|noaa\.gov)\//;
ok(hrefs.every(h => ALLOW.test(h) || /^[0-9a-z-]+\.html(#[a-z-]+)?$/.test(h) || /^#/.test(h)), "links on the allow-list (" + hrefs.filter(h => !(ALLOW.test(h) || /^[0-9a-z-]+\.html(#[a-z-]+)?$/.test(h) || /^#/.test(h))).join(", ") + ")");
ok(F.sources["kcc-role"].url === "no link" && F.sources["energycodes-ks"].url === "no link" && F.sources["dot-cafe"].url === "no link", "sources off the allow-list are cited by name without a link");
ok((JS.match(/fictional\((act|res)\)/g) || []).length === 5 && (JS.match(/text: C\.about\.line/g) || []).length >= 2, "the fictional line on every interactive that shows Prairie City (steps 1-4, 6 and the explain Sankey; steps 5 and 7 show none of its numbers), read from prairie-city.json");
ok(/Prairie City is fictional; its numbers are illustrative\./.test(PAGE), "the page's data note and fallback carry the fictional line");
ok(!/\(via [a-z0-9_.-]+\.json/.test(PAGE), "no internal file names in the page's source lines");
["A15", "A18", "F11", "SB3", "A4"].forEach(c => ok(new RegExp('\\["' + c + '",').test(JS), c + " is named through LX.lessonRefHTML"));

// ---------------- text budget
const plain = t => String(t).replace(/<[^>]+>/g, " ").replace(/\$\$[\s\S]*?\$\$/g, " ").replace(/\[\[[^|\]]+\|([^\]]+)\]\]/g, "$1").replace(/\*\*/g, "").replace(/&amp;/g, "&").trim();
const nWords = t => plain(t).split(/\s+/).filter(w => /[A-Za-z0-9$]/.test(w)).length;
const nSent = t => plain(t).replace(/U\.S\./g, "US").replace(/[0-9]\.[0-9]/g, "0").split(/(?<=[.?!])\s+(?=[A-Z“$0-9])/).filter(x => /[A-Za-z]/.test(x)).length;
ok(M.STEPS.length === 7, "seven step cards");
M.STEPS.forEach((t, i) => { const n = nWords(t); ok(n >= 18 && n <= 36, "step " + (i + 1) + ": " + n + " words"); ok(nSent(t) <= 3, "step " + (i + 1) + ": " + nSent(t) + " sentences"); });
const lines = [M.lossLine(C, F), M.powerLine(C), M.POWER_SAW, M.LENS_SAW, M.sectorSaw(C, F), F.muni.extra].concat(Object.values(M.carrierQ(C).feedback), Object.values(M.lossQ(C, F).feedback), Object.values(F.muni.feedback),
  F.groups.map(x => M.sectorLine(C, F, x.key)), F.levers.map(l => l.why), F.actors.map(a => M.lensLine(F, a.key)));
lines.forEach(t => { ok(nWords(t) <= 36, "a reveal of " + nWords(t) + " words: " + plain(t).slice(0, 60)); ok(nSent(t) <= 2, "a reveal of " + nSent(t) + " sentences: " + plain(t).slice(0, 60)); });
const PROSE = OWN.replace(/^---[\s\S]*?\n---\n/, " ").replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<!-- f09-(fallback|sources|facts):start[\s\S]*?:end -->/g, " ")
  .replace(/<!--[\s\S]*?-->/g, " ").replace(/^- (.*)$/gm, "<li>$1</li>");
PROSE.split(/<\/?(?:p|li|dd|dt|td|th|summary|br|caption)\b[^>]*>/).map(plain).filter(x => /[A-Za-z]/.test(x) && !/^[:{]/.test(x)).forEach(x => {
  const n = nWords(x); ok(n <= 40, "text element of " + n + " words: " + x.slice(0, 70)); ok(nSent(x) <= 3, "text element of " + nSent(x) + " sentences: " + x.slice(0, 70)); });

// ---------------- controls
ok(/aria-live/.test(JS) && (JS.match(/LX\.demo\(/g) || []).length === 1 && (JS.match(/demo\[\d\] = function/g) || []).length === 7, "live regions; a demo hook with an action for each of the seven steps");
["public-utility-commission", "investor-owned-utility", "public-power-utility", "ferc"].forEach(t => ok(new RegExp("id: " + t + "\\b").test(SIDE), "the sidecar defines " + t));

console.log((fails ? "FAILED " + fails + " of " : "ok: ") + checks + " checks (" + ID + ")");
process.exit(fails ? 1 : 0);
