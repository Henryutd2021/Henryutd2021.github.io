// Mutations must be caught before render: new front-matter fields cannot bypass source or wording checks.
"use strict";
const assert = require("assert"), path = require("path"), {execFileSync} = require("child_process");
const PRIV = require("./private_sources.js"), X = require("./excerpt_check.js");
assert.equal(typeof X.frontmatter, "function", "excerpt checks share a parser covering search fields");
assert.deepEqual(X.frontmatter('---\ntitle: "Title"\npagetitle: "The study claims a result."\ndescription-meta: "A \\"quoted\\" claim."\n---\nBody.'),
  ["Title", "The study claims a result.", 'A "quoted" claim.']);
const BUILD = PRIV.path("build");
if (!BUILD) { console.log("note: source mutation tests need LEARN_SOURCES build; not run"); process.exit(0); }
const py = String.raw`
import copy, json, shutil, subprocess, sys, tempfile
from pathlib import Path
sys.path.insert(0, sys.argv[1])
import learn_search as M
import learn_scope_scan as S
import learn_spelling_scan as P
import learn_surface_check as U
g = {i: {"term": i, "href": "lesson.html", "lesson": 1} for i in ("power", "energy", "efficiency")}
g["alias"] = {"term": "power", "alias": "power"}
g["held"] = {"term": "Held", "short": "A held term.", "lesson": None}
g["upcoming"] = {"term": "Upcoming", "short": "An upcoming term.", "lesson": "QA1", "href": "index.html#foundations"}
row = {"pagetitle": "Power and energy", "description-meta": "Read about power and energy in a worked example.", "concepts": ["power", "energy", "efficiency"]}
data = {"version": 1, "pages": {"index.qmd": row}}
assert M.validate_registry(data, g, ["index.qmd"]) == {"index.qmd": row}
for field, value in [("concepts", ["power", "energy"]), ("concepts", ["power", "energy", "alias"]), ("concepts", ["power", "power", "energy"]), ("concepts", ["power", "energy", "missing"]), ("concepts", ["power", "energy", "held"]), ("concepts", ["power", "energy", "upcoming"]), ("pagetitle", "<b>Keyword</b>"), ("description-meta", "short")]:
    bad = copy.deepcopy(data); bad["pages"]["index.qmd"][field] = value
    try: M.validate_registry(bad, g, ["index.qmd"])
    except ValueError: pass
    else: raise AssertionError("accepted bad " + field + str(value))
try: M.validate_registry(data, g, ["index.qmd", "lesson.qmd"])
except ValueError: pass
else: raise AssertionError("accepted a missing page")
src = '---\ntitle: "Original"\nsubtitle: "Approved subtitle"\ndescription: "Approved description"\n---\n\nOriginal body.\n'
actual = M.search_frontmatter(src, row)
for social in ("open-graph", "twitter-card"):
    assert social + ': {"description": "Read about power and energy in a worked example."}' in actual
stripped = actual.replace('pagetitle: "Power and energy"\n', '').replace('description-meta: "Read about power and energy in a worked example."\n', '')
for social in ("open-graph", "twitter-card"):
    stripped = stripped.replace(social + ': {"description": "Read about power and energy in a worked example."}\n', '')
assert stripped == src
assert M.search_frontmatter(actual, row) == actual
root = Path(tempfile.mkdtemp(prefix="learn-search-check-")); (root / "learn/_drafts").mkdir(parents=True)
rules = S.load_rules()
for folder in ("learn", "learn/_drafts"):
    for key in M.SEARCH_KEYS:
        f = root / folder / "probe.qmd"
        f.write_text('---\ntitle: "Example"\n' + key + ': "FOAK"\n---\n\nExample.\n')
        findings, _ = S.scan_site(str(root), rules)
        assert any("deny" in reason for _, reason, _ in findings), folder + " " + key + " not scope-scanned"
        f.write_text('---\ntitle: "Example"\n' + key + ': "colour"\n---\n\nExample.\n')
        hits = P.scan_file(f, str(f.relative_to(root)), f.read_text(), [])
        assert any(h["word"] == "colour" and not h["allowed"] for h in hits), key + " not spelling-scanned"
        f.write_text('---\ntitle: "Example"\n---\nExample.\n')
(root / "learn/search-metadata.json").write_text(json.dumps({"version": 1, "pages": {"probe.qmd": {"pagetitle": "FOAK"}}}))
findings, _ = S.scan_site(str(root), rules)
assert any("deny" in reason for _, reason, _ in findings), "registry not scope-scanned"
(root / "learn/search-metadata.json").write_text(json.dumps(data))
(root / "_quarto.yml").write_text('website:\n  site-url: "https://example.org"\n')
(root / "assets/learn/data").mkdir(parents=True)
export = root / "assets/learn/data/glossary-export.json"
export.write_text(json.dumps({"url": "https://example.org/learn/glossary.html#power"}))
findings, _ = S.scan_site(str(root), rules)
assert not findings, "glossary export must allow its canonical public Learn URL"
for url in ("https://example.org/publications/private.html", "https://example.org/learn/../publications/private.html", "https://example.org/learn/%2e%2e/publications/private.html", "https://unlisted.example/learn/glossary.html"):
    export.write_text(json.dumps({"url": url}))
    findings, _ = S.scan_site(str(root), rules)
    assert findings, "glossary export allowed an out-of-scope destination: " + url
scan = S.Scan(rules, str(root)); scan.site_url = "https://example.org"
scan.json_value("resource", {"@id": "https://example.org/learn/cf4-existing-reactors-hydrogen.html#learningresource"}, ctx="json")
assert not scan.out, "a stable resource ID is not a nuclear learning-cost claim"
scan.json_value("resource", {"description": "Nuclear learning curves reduce costs."}, ctx="json")
assert scan.out, "prose claims must still be scope-scanned"
page = '<title>Power and energy – Honglin Li</title><meta name="description" content="Read about power and energy in a worked example."><meta property="og:description" content="Read about power and energy in a worked example.">'
assert not U.search_metadata_problems(actual, page, row)
assert U.search_metadata_problems(actual, page.replace('Power and energy –', 'Wrong title –'), row)
assert U.search_metadata_problems(actual, page.replace('content="Read about power', 'content="Wrong description'), row)
assert U.search_metadata_problems(actual.replace('pagetitle: "Power and energy"', 'pagetitle: "Edited by hand"'), page, row)
# Exercise the real generator's supported draft lifecycle without putting draft metadata in the public registry.
site = Path(sys.argv[2]); fixture = Path(tempfile.mkdtemp(prefix="learn-search-drafts-"))
shutil.copytree(site / "learn", fixture / "learn")
shutil.copytree(site / "assets/learn/components", fixture / "assets/learn/components")
(fixture / "assets/learn/data").mkdir()
shutil.copy2(site / "_quarto.yml", fixture / "_quarto.yml")
(fixture / "scripts").mkdir()
for script in ("build_learn.py", "learn_search.py"):
    shutil.copy2(Path(sys.argv[1]) / script, fixture / "scripts" / script)
(fixture / "learn/_drafts").mkdir(exist_ok=True)
for status in ("upcoming", "hold"):
    name = "qa-" + status; code = "QA-" + status.upper(); title = "Draft " + status
    with (fixture / "learn/path.yml").open("a") as f:
        f.write('\n- kind: lesson\n  id: ' + name + '\n  code: ' + code + '\n  title: "' + title + '"\n  tier: foundations\n  status: ' + status + '\n')
    (fixture / "learn/_drafts" / (name + ".qmd")).write_text('---\ntitle: "' + title + '"\ndescription: "A draft test page."\n---\n\n<!-- learn:meta:start -->\n<!-- learn:meta:end -->\n<!-- learn:next:start -->\n<!-- learn:next:end -->\n<!-- learn:footer:start -->\n<!-- learn:footer:end -->\n')
    (fixture / "learn/_w1" / (name + ".yml")).write_text('lesson: ' + code + '\nglossary:\n  - id: ' + name + '\n    term: "' + title + ' concept"\n    def: "A test concept for a draft."\n')
built = subprocess.run([sys.executable, str(fixture / "scripts/build_learn.py"), "--site", str(fixture)], capture_output=True, text=True)
assert built.returncode == 0, built.stdout + built.stderr
for status in ("upcoming", "hold"):
    draft = (fixture / "learn/_drafts" / ("qa-" + status + ".qmd")).read_text()
    assert '"@type": "LearningResource"' in draft and "pagetitle:" not in draft
    assert '"qa-' + status + '"' not in (fixture / "assets/learn/data/glossary-export.json").read_text()
    assert 'id="qa-' + status + '"' not in (fixture / "learn/glossary.qmd").read_text()
assert '"qa-hold"' in (fixture / "assets/learn/data/glossary.json").read_text()
assert "Draft hold" not in (fixture / "assets/learn/data/path.json").read_text()
print("search sources: registry, idempotence, metadata scope/spelling/surface mutations and real upcoming/held draft generation passed")
`;
process.stdout.write(execFileSync("python3", ["-c", py, path.dirname(BUILD), path.resolve(__dirname, "../..")], {encoding: "utf8", env: {...process.env, PYTHONDONTWRITEBYTECODE: "1"}}));
