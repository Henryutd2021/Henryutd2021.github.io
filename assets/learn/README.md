# Learn component library

Every Learn page is built from these parts and nothing else. Pages load two files:

- `assets/learn/learn.css` (via `css:` in the front matter);
- `assets/learn/learn.js` (a `<script defer>` at the end of the page).

Both are **generated**: `scripts/build_learn.py` joins `components/*.js` and `components/*.css`. Edit the components, never the bundle.

## Start a new lesson

1. Add the lesson to `learn/path.yml`: `id`, `starter`, `tier`, `form: cards` (or `play` for lessons 0 and 13), `icon`, `title`, `subtitle`, `short`, `minutes`, `does`, `outcome`, `after`. The lesson goes live (linked, with its generated header, next box and footer) when you set `status: active`; its page is then `learn/<id>.qmd` (or the file named by `path:`). Until then keep `status: upcoming`, or leave the status out: it shows as coming soon.
   - Lessons off the starter path (N1, B1–B3, M1, CK-F, toolbox K4 and K7) are already listed with their `code` and `id`. They take prerequisites as starter numbers or codes (`after: [10, K4]`) and name what follows (`next: B2`). `form: checkpoint` gives a checkpoint page the steps Task, Worked solution, Rubric and Sources; `form: studio` and `form: case` are described under "Studios and case files", `form: sandbox` and `form: capstone` under "Sandboxes and capstones".
   - New glossary terms and requests for shared files go in a sidecar, `learn/_w1/<id>.yml` (wave W1):

     ```yaml
     glossary:
       - term: capacity factor
         def: "One plain sentence."
     requests:
       - "Plain text for the coordinator."
     ```

     `build_learn.py` merges the terms into `glossary.json` (if an id is already in `glossary.yml`, that definition wins and the clash is printed) and prints every request.
2. Copy `learn/_template-cards.qmd` (or `_template-play.qmd`; for a research studio `_template-studio.qmd`, for a case file `_template-case.qmd`, see "Studios and case files"; for a sandbox `_template-sandbox.qmd`, for a capstone `_template-capstone.qmd`, see "Sandboxes and capstones") to `learn/<id>.qmd`. Write `assets/learn/<id>.js` from the skeleton below, with a pure model exported for Node.
3. In the ResearchPortfolio folder, run `python3 scripts/build_learn.py --site <site>`. Add `_tests/learn/test_<id>.js`, which checks every number on the page against the model.

Then render, take screenshots (`node scripts/learn_screenshots.mjs`), and check the result at 1280 px and 375 px, in day and night mode.

## Text budget (Henry, 2026-11-02)

- **One or two sentences per text element**: card text, notes, node details, captions, hints, myths, answers.
- **No paragraphs of prose.**
  - Structure the ideas as a concept map, a flowchart, a comparison table, a causal chain or an energy chain.
  - Depth goes in collapsed **Go deeper** boxes.
- **Playful but professional.** The floor is high school and early undergraduate:
  - no mascots, no exclamation marks, no baby talk;
  - name things precisely and define them with the glossary.
- **Every number** comes from the lesson's model, or carries a source and a date.
- **Every lesson ends with the explain layer.** The layer uses the reader's own numbers where it can (keep them with `LX.store`).
- **Mark glossary terms**, at most once or twice per element.
  - In Markdown: `[frequency]{.lx-term term="frequency"}`.
  - In HTML: `<span class="lx-term" data-term="frequency">`.
  - In JS text: `[[frequency|frequency]]`.
  - Ids live in `learn/glossary.yml`; the build fails on an unknown id.

## Page skeleton (both forms)

```
::: {#play .lx-sec}            (or #steps for the cards form)
<div class="lx-interactive" data-learn="<slug>" data-src="../assets/learn/data/a.json ../assets/learn/data/b.json">
  <div class="lx-fallback">static figure + one sentence (what readers without JS see)</div>
</div>
<p class="lx-datanote">where the numbers come from, with a date</p>
:::
::: {#explain .lx-sec}  <div id="<slug>-explain" class="lx-xgrid"> no-JS list of ideas </div>  Go deeper boxes  :::
::: {#check .lx-sec}    myth-or-fact cards, one or two quick questions  :::
::: {#sources .lx-sec}  numbers to remember, next lesson (generated), real world, sources  :::
```

The section ids `play`/`steps`, `explain`, `check` and `sources` match the header's step links. `build_learn.py` writes the header, the next-lesson box and the footer between the `learn:meta`, `learn:next` and `learn:footer` markers.

## Studios and case files (wave W2)

Two more forms, each with a template. `form:` in `path.yml` sets the header's step links, and each step link is the id of a section on the page.

| `form:` | Template | Sections (step links) | Header badge | For |
|---|---|---|---|---|
| `studio` | `learn/_template-studio.qmd` | `#task` Task · `#exemplars` Exemplars · `#selfcheck` Self-check · `#sources` Sources | Research studio | R1–R10 (curriculum v2 §11) |
| `case` | `learn/_template-case.qmd` | `#case` The case · `#explain` Explain · `#check` Check · `#sources` Sources | Case file | CF1–CF8 (§13) |

The older forms keep their sections: `cards` (`#steps`, `#explain`, `#check`, `#sources`), `play` (`#play`, ...) and `checkpoint` (`#task`, `#solution`, `#rubric`, `#sources`).

**Research studio.**

- **Order.** The task comes first: what to produce, from what, and when it is done. Then the exemplars: a good and a weak answer to the same task, side by side, with tap-to-reveal notes (`LX.Exemplars`). Then a self-check against the course rubric (`LX.Rubric`). R1 and R10 also give the reader a question card (`LX.QuestionCard`).
- **The task card.** Put the task (Produce, From, Done when, and the time) in `div.lx-card.lx-studio-brief` above the interactive, outside its `.lx-fallback`: the fallback is hidden once the interactive mounts, so a task inside it never reaches readers with JavaScript. The fallback keeps the static version of the steps.
- **Links to other lessons.** Load `data/path.json` with the page's `data-src` and name lessons with `LX.lessonRef` or `LX.lessonRefHTML`: a lesson is linked once it is live and named "upcoming" until then, with no edit. In static text, link only live lessons and name the rest "(upcoming)".
- **Time.** Give `minutes` (the guided part) and `practice_minutes` (the independent work) in `path.yml`; the header then shows both. Be honest: R2's literature matrix is 240 minutes.
- **Method-neutral.** Per §11.2, optimization is one method family among several. The rubric's words are the course's own (§3.4): pick the competences a studio builds and add a "look for" line, never reword the levels.
- **Fallbacks.** The exemplars and rubric fallbacks are written from the data by the components' `staticHTML` (see the components below), between `<!-- <slug>-exemplars:start -->` and `:end` markers, by the test's `--write` mode. The test then checks that they are still the same. Answers written as a card, one field per line, take `lines: true`.

**Case file** (about 10 minutes; §13).

- **Order.** The case comes first, as static parts in `.lx-case`: the puzzle; the question in one sentence; scale and boundary, with what was left out; decisions, goal and rules, in words; data and method; and what came out, with its boundary conditions. Then the study's dated steps (`LX.Timeline`, from the data file). Then the explain section (`LX.Boundary`, and an allow-listed explainer if there is one), the check with "Try it yourself" (toy variations with the allow-listed repository), and the sources. There is no list of open questions.
- **Approved sources only (guard G-SRC).** Henry's research enters only through approved excerpts, allow-listed repositories, allow-listed explainers and citations (doi.org). Never link a project page or the Research page.
  - Quote each excerpt as `<blockquote class="lx-excerpt" data-source="excerpt:<key>">`. Give every sentence, with its source, in `reports/learn/excerpts_for_approval.md`.
  - Every sentence about the study, the front matter's `description` included, is approved excerpt wording, word for word. "Allow-listed" is the course's internal term: on the page a repository is "open code".
  - The scope scan fails on a `data-source` key that is not in the curriculum's `ALLOWED_SOURCES`, and on a script from `assets/explainers/` other than `common.js` and the allow-listed explainers (`ghg`, `txh2`, `wind-hydrogen`, `uq-mfgpr`). It also scans the strings of every explainer a Learn page loads.
- **Drafts.** Until Henry approves every excerpt sentence, the page lives in `learn/_drafts/<id>.qmd`, and its `path.yml` row stays `status: upcoming`.
  - Quarto does not render `learn/_drafts/`: the render list names `learn/*.qmd` only, and `_` folders are never rendered.
  - `build_learn.py` still fills the draft's three blocks exactly as they will read once the page is live, and checks its title, subtitle and glossary marks. `learn_scope_scan.py` scans the draft's source (front matter, text, Markdown and HTML links, scripts).
  - `learn_qa.sh` renders a preview of a draft named on its command line (see Checks).
  - Write links for the page's live place, `learn/<id>.html` (`../assets/...`, `index.html`).
  - After approval: `git mv learn/_drafts/<id>.qmd learn/<id>.qmd` and set `status: active`. The build fails while a live page and a draft share an id.
- **Screenshots.** `scripts/learn_screenshots.mjs --states top,explain,sec-selfcheck` works for both forms. On a studio, `explain` (and `open`) show `#exemplars`; `sec-<id>` scrolls to any section and clips the shot to it (`sec-task`, `sec-selfcheck`, `sec-case`, `sec-check`, `sec-sources`). A draft needs a rendered preview first: `learn_qa.sh` makes one.
- **The `path.yml` row.** A case file is a `kind: lesson` row with `form: case`, its `code` and `id` from `reports/learn/learn_map_v2.yml` (for example `CF7`, `cf7-cost-of-waiting`), a `tier` (every lesson row needs one; the coordinator confirms which), `minutes: 10`, `after:` its prerequisites, and `status: upcoming`.

## Sandboxes and capstones (wave W3)

Two more forms (curriculum v2 §16.3, §16.4, §7.9), each with a template. `scripts/build_learn.py` gives them five step links each, and checks that the page (or its draft) has a section for every one of them.

| `form:` | Template | Sections (step links) | Header badge | schema.org type | For |
|---|---|---|---|---|---|
| `sandbox` | `learn/_template-sandbox.qmd` | `#brief` Brief · `#bench` Bench · `#results` Results · `#explain` Explain · `#sources` Sources | Sandbox | Simulation | SB0–SB4 |
| `capstone` | `learn/_template-capstone.qmd` | `#brief` Brief · `#plan` Plan · `#note` Note · `#selfcheck` Self-check · `#sources` Sources | Capstone | Capstone project | C0–C4 |

**Sandbox** (an open-ended engine page).

- **Order.** The brief comes first, in `div.lx-card.lx-sb-brief` above the interactive (seen with and without JavaScript): the site, what the reader decides, what the engine works out and what it leaves out, as `dl.lx-sb-facts`. Then the bench (`div.lx-sb`: groups of controls in `fieldset.lx-sb-group`, beside the run box `div.lx-sb-side` from 960 px: presets, `LX.BenchRun`, readouts, `LX.ShareState`). Then the results (`#<slug>-results`: BenchRun's stale line, the readouts and charts in `div.lx-sb-results`, each chart with its text version). Then how the engine works (`LX.Boundary` and a Modeler "Go deeper"), and the sources.
- **The engine** is a shared component the sandbox builder writes (`components/<engine>.js`: E0 for SB0, E1 for SB1), so capstones and lessons run the same model. The page expects `engine.schema` (an `LX.ShareState` schema), `engine.presets`, `engine.solve(state, data, { signal, timeLimit, attempt })` (a Promise of `{ status, ok, message, hint, results }` that never rejects; LX.solver's statuses; `ok` only for optimal; `hint` after an infeasible plan), `engine.summarize` (pure: every number the page shows), `engine.note` (the `LX.ReportNote` input) and `engine.fallback` (the default plan's precomputed results for the no-JS block). The template's header comment has the full contract.
- **The W2 review findings, built in.** Failure states go through `LX.BenchRun` (a message and "Try again", the busy state cleared, earlier results kept and marked). State a tie rule or report only what every optimum shares, and prove it in the test. "Optimal" only for status optimal; a MILP shows its gap; an early stop never says best. Presets fill the controls and never reset hidden parts.
- **Fallbacks.** The bench's no-JS table comes from the schema (`LX.ShareState.staticHTML`), the results' from the engine's precomputed default run, each between `<!-- <slug>-bench:start -->`/`<!-- <slug>-results:start -->` markers written by the test's `--write` mode.

**Capstone** (a brief, a deliverable and a self-check, built on a sandbox).

- **Order.** The brief (`div.lx-card.lx-cap-brief`: the decision in one sentence, then Hand in, From and Done when as `ol.lx-studio-task`, and the time). Then the plan: the sandbox's engine with the capstone's choices (the same bench frame, BenchRun, ShareState) and its results and sensitivity chart in `#<slug>-results`. Then the note (`LX.ReportNote` in `#<slug>-note`): the reader's own words, the plan's numbers, the assumptions, the sensitivity line and the limits as a one-page note to copy; its checks are the deliverable's "done when". Then the self-check: `LX.Exemplars` (a weak and a strong note for the same brief, in `div#exemplars`, so the screenshot tool's `explain` and `open` states show it) and `LX.Rubric` (the competences the capstone builds: accounting, uncertainty, realism and communication for C0 and C1, each with a "look for" line). Then the sources.
- **Built on a sandbox.** The `path.yml` row names it: `sandbox: SB0` (the build checks that it is the code of a `form: sandbox` row). Use the engine; never fork it.
- **The deliverable** (§7.9): the plan link, the one-page note with its sensitivity line and table (the chart stays on the page), and for the Modeler version the notebook, in a Go deeper box under the note. Nothing is saved or sent: the reader copies the note and the link, and the page says so.
- **Time.** `minutes` is the whole capstone (C0 60, C1 90); `lab_minutes` the Modeler notebook.

**Both forms.**

- **The `path.yml` row.** A `kind: lesson` row with `form: sandbox` or `form: capstone`, its `code` and `id` from `reports/learn/learn_map_v2.yml` (for example `C0`, `c0-behind-one-meter`), a `tier` (`tier2` when the curriculum gives two), `minutes`, `after:` its prerequisites, `sandbox:` for a capstone, and `status` (`upcoming` until the page is done). A capstone that quotes an excerpt waiting for Henry's approval is held in `learn/_drafts/` like a case file.
- **Screenshots.** `--states top,mid,explain,sec-bench,sec-results` (sandbox) or `top,mid,explain,sec-plan,sec-note,sec-selfcheck` (capstone). A plan link works as a page: `--pages "learn/<id>.html#sb0-v2-..."` shows the link applied and announced; a damaged one shows the refusal.
- **Phones.** Five step links fit at 375 px: on these forms each link stays on one line with narrower padding (`forms.css`).

## Lesson JS skeleton

```js
(function () {
  "use strict";
  // ---- pure model: no DOM; exported for Node tests
  function prepare(town, year) { /* scale real shapes to the town */ }
  var model = { prepare: prepare };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  if (typeof window === "undefined" || !window.LX) return;
  // ---- view
  var LX = window.LX, H = LX.H;
  LX.mount("<slug>", function (live, data, root) {   // data = {town: ..., town_year: ...} from data-src
    var W = prepare(data.town, data.town_year);
    var scene = LX.Scene(live, { max: { wind: 150, solar: 200, cc: 150, pk: 100, demand: 360 } });
    LX.StepCards(live, { steps: [ /* see "Step cards" */ ] });
    var x = document.getElementById("<slug>-explain"); x.innerHTML = "";
    LX.ConceptMap(H("div", { class: "lx-xcard" }, x), { /* ... */ });
  });
})();
```

## Components

The header comment of each file in `components/` gives the full options.

**Core** (`core.js`)
- `LX.H(tag, attrs, parent)` and `LX.S(...)`: HTML and SVG elements.
- `LX.icon(name)` and `LX.IC`: the icon names.
- `LX.rich(text)`: glossary marks.
- `LX.fmt.money`, `.tonnes`, `.mw`, `.mwh`, `.hh`.
- `LX.progress.done(id)`, `.guess`, `.answer`, and `LX.store.get/set`: this browser only.
- `LX.mount(slug, init)`, `LX.json(url)`, `LX.onTheme(fn)`, `LX.reduced()`.
- `LX.lessonRef(P, code)` → `{ href, ready, label }` and `LX.lessonRefHTML(P, code)`: a lesson by starter number (`3`, "lesson 3") or code (`"R2"`), from `data/path.json` (`P`, loaded with the page's `data-src`). The HTML is a link when the lesson is live and "R2 (upcoming)" otherwise, so links appear by themselves when a lesson goes live. Node: `require("components/core.js")` gives both (pure).
- The back-to-top guard: the site's button (`.to-top`) steps aside (`body.lx-totop-off`) while it would cover lesson controls, or any text under it (the footer and the last notes at the end of a page, where no scrolling uncovers them).
- `LX.demo(root, fn, cards)`: the lesson's demo states, for screenshots and curious readers. `fn(state)` puts the page into a
  state and returns `{view}` when it handled it, or `null`. Every lesson accepts `"mid"` (one interaction done) and
  `"step-N"` (step card N open, its action done where the lesson knows how; with `cards`, an unhandled `step-N` simply
  opens the card, clamped to the number of cards) and may add its own names (`band`, `milp`, ...). `window.lxDemo(state)`
  runs it, and so do `?demo=<state>`, `#lx-demo-<state>`, `#lx-demo-<N>` or `#lx-step-<N>` (step N) and `#lx-demo` ("mid").
  `scripts/learn_screenshots.mjs --states mid,step-3,band` uses it for any lesson.
- Technology colours beyond lesson 0's fleet: `--lx-bat` (battery storage), `--lx-hyd` (hydro), `--lx-geo` (geothermal),
  `--lx-dr` (demand response), day and night; icons `atom`, `flame`, `drop`, `geo`, `dial` in `LX.IC`.
- **Colour as text** (layout audit, W3). The day values of `--lx-good`, `--lx-warn` and `--lx-bad` (#18784A, #965800,
  #B82B2A) read at 4.5:1 on white, on `--lx-surface-2` and on their own `-soft` fills. A technology or tier colour used for
  text is taken toward the ink, `color-mix(in srgb, <colour> 70%, var(--lx-ink))`: darker by day, lighter by night, at
  least 4.5:1 for every token except solar (use the ink for text on solar). Captions (`caption`, `figcaption`) take
  `--lx-ink-3` (Quarto's caption grey is 4.1:1). `scripts/learn_layout_audit.mjs` checks contrast, clipping, overlap and
  tap targets on every page in every state.
- `.lx-choice` hyphenates (`hyphens: auto`): a long single word ("Counterfactual") breaks inside a narrow button instead of running out of it.

**Scene** (`scene.js`): the Prairie Town picture.

```js
var sc = LX.Scene(host, { max: {wind, solar, cc, pk, demand} });
sc.set({h: 14.5, demand, wind, solar, nuclear, cc, pk, unserved, cloud});
sc.highlight(["cc"]);  sc.labels(false);  sc.tappable(true, fn);  sc.event("Clouds: 149 → 112 MW");
```

**Balance beam and 60 Hz dial** (`meters.js`)

```js
var m = LX.Meters(host, { maxMW: 360 });
m.set({nuclear, solar, wind, cc, pk, demand, freq, curtailed});
```

**Slider** (`controls.js`)

```js
var s = LX.Slider(host, {label, color: "var(--lx-cc)", min: 0, max: 150, step: 5, value: 60, hint: fn(lo, hi, max, val), onChange,
                         fmt: function (v) { return "$" + v.toLocaleString("en-US") + "/kW"; }});
s.range(lo, hi);  s.set(v[, fire]);  s.val();
```

- Decimal-safe: values snap to `min + k × step` and are rounded to the step's decimals (a 0.05 step never shows 0.30000000000000004).
- `fmt` formats the output, the spoken value and the reachable range; without it the output is `value + " " + unit`.
- `downLabel` / `upLabel` name the − / + buttons for screen readers. It replaces the lesson-local sliders of lessons 7, 8 and 10.

**Step cards** (`cards.js`)

```js
LX.StepCards(host, { steps: [{ text: "One or two sentences.", build: function (act, api) { /* controls in act */ api.done(); api.saw("What you saw."); } }] });
```

"Next" waits for `api.done()`. Use `free: true` for a card without an action. `api.saw(text)` takes glossary marks and
`**bold**`. `api.busy(true)` holds Next shut while a solve runs (the card is `aria-busy`), even after `api.done()`;
`api.busy(false)` releases it (M1 step 8). A late call from a card that is no longer shown changes nothing. The returned
object has `go(i)` (clamped), `index()` and `count`. On phones the progress dots shrink so "Step 8 of 10" stays on one line.
The card's children and the action area's children may shrink (`min-width: 0`), so a wide table or chart in a step scrolls
or shrinks in its own box instead of widening the card (give a wide table its own `.lx-scroll-x`).

**Coach tour** (`coach.js`)

```js
var t = LX.Coach(root, [{el, text}, ...], {key: "<slug>-coach"});
t.start();          // first visit only
t.start(0, true);   // show it again
```

`root` needs `position: relative`.

**Missions, stars, notes** (`missions.js`)

```js
LX.Missions(host, [{id, label, short, main}]).set(id, {frac, text, fail, won});
LX.Stars(host, [{label, n: 0-3, value}]);
LX.Notes(host, [{icon, title, text, moment, got, lock, link}]);
```

The CSS frame for the play form (stage and panel, clock, hour strip, events, tallies, debrief) is in `play.css`.

**Hourly chart** (`daychart.js`)

```js
LX.DayChart(host, {series: [{key, label, color}], demand: [24], rows: fn, yMax}).render();
```

It comes with a text-version table.

**Predict, then reveal** (`predict.js`)

```js
LX.Predict(host, {id, q, options: [{value, label, color}], answer, feedback: {}, onPick}).reveal("your numbers");
LX.Guess(host, {id, q, ticks: [...], answer, onLock});   // a guess on an ordered scale
```

Markup also works without JS: `.lx-predict[data-predict]` with `ul.lx-choices`, plus `.lx-reveal[data-reveal][data-answer]`.

**Myth or fact, quick questions** (`myth.js`): markup only, see `learn/00-grid-operator.qmd`.

```html
<div class="lx-myths" data-quiz="id"><div class="lx-qq" data-id="a" data-answer="myth">
  <p class="lx-qtext">…</p><ul class="lx-choices"><li data-value="myth">Myth</li><li data-value="fact">Fact</li></ul>
  <details class="lx-answer"><summary>Answer</summary><p>Myth. One or two sentences.</p></details></div></div>
```

Use `class="lx-quiz"` for a question with more options.

**Go deeper** (`deeper.css`): CSS only. Its body is one column that can shrink, so text wraps at the card on a 375 px
phone; wide display equations, code and tables scroll on their own.

```html
<details class="lx-deeper"><summary><span class="k">Go deeper · Modeler</span>Title</summary>
  <div class="lx-deeper-body">…</div></details>
```

In a `.qmd`, open and close these tags in raw HTML blocks and write Markdown and math between them.

**Glossary tooltip** (`glossary.js`): automatic for every `.lx-term[data-term]`, including terms added later by JS. Definitions come from `learn/glossary.yml` and the sidecars; `build_learn.py` writes each term's `lesson` (a starter number or a module code such as B2) and `href`, so the popover links "Taught in lesson 3" or "Taught in B2" to the page itself.

**Concept map** (`conceptmap.js`)

```js
LX.ConceptMap(host, {title, lede, groups: {k: [name, color]}, nodes: [{id, g, label, lines, text, game, at: [c, r], atN, later}],
  edges: [[from, to, label]], cols, rows, colsN, rowsN, sel, moment: fn(id), gameLabel});
```

`gameLabel` heads each node's `game` line; the default is "In the game" on play-form pages and "In this lesson" elsewhere.
Nodes and links away from the selection fade their shapes only; their words stay readable (`--lx-ink-3`, 4.5:1). A link's label sits at the middle of its line, or, where two links cross, at 40, 60, 30 or 70% of the way, whichever first meets no other label.

**Flowchart** (`flowchart.js`)

```js
LX.Flowchart(host, {title, lede, nodes: {k: {t, tN, s, sN, k: "q"|"end"}}, at, atN, cols, colsN,
  edges: [[a, b, label, {v, d, dN, l, lN}]], traces: [{label, path: [...], text}], sel});
```

Routing is automatic; give a hand-made path only for a crossing. Returns `{ build, run(i, quick), update(traces) }`:
`update` changes the traces without redrawing (relabelled buttons; the selected trace shows its new path and text at
once), e.g. lesson 3's "Your settings" trace.

**Comparison table** (`table.js`)

```js
LX.CompareTable(host, {title, columns: [{key, label, main, num, bar, phoneHide}], rows: [...], sorts: [{label, order, ranked, note}], text});
```

`text: true` for rows of words rather than numbers: on phones each row becomes a card of left-aligned labelled lines
(lessons 1, 2 and M1).

**Causal chain** (`causal.js`)

```js
LX.CausalChain(host, {title, links: [{title, text, value}], note});
```

**Energy chain** (`energychain.js`)

```js
LX.EnergyChain(host, {title, aside, lede, stops: [{icon, title, text, value}]});
```

**Course map** (`metro.js`): `<div data-lx-metro>` on `learn/index.qmd` draws from `data/path.json`.

- Use `LX.metroLayout(path, "h"|"v")` for tests.
- It supports any number of tiers: give each tier a colour `slot` 1–5. Four tiers, all live (the Researcher tier since W2); a tier with `status: upcoming` gets a dashed door and line ("coming later").
- Each line's "+N more" label opens the tier card, which links the tier's live lessons off the starter path.

**Solver** (`solver.js`): linear and mixed-integer programs in the browser with HiGHS.

```js
var r = await LX.solver.solve({
  sense: "min",
  variables: [{ name: "coal", ub: 50, cost: 10 }, { name: "gas", ub: 50, cost: 30 }, { name: "on", type: "binary", cost: 500 }],
  constraints: [{ name: "demand", terms: { coal: 1, gas: 1 }, eq: 80 }]   // or le, ge, lb/ub, op + rhs
}, { timeLimit: 1, key: "slider" });
// r.status ("optimal", "infeasible", "unbounded", "time-limit", "cancelled", ...), r.objective, r.values, r.rows,
// r.duals (LP only: dObjective/dRHS), r.reducedCosts (LP only), r.mipGap (MILP), r.ms.roundTrip
var p = await LX.solver.fixAndReprice(model, r);   // MILP: fix the integers, re-solve the LP; p.conditional === true
var st = LX.SolverStatus(host); st.set("solving"); st.set(r);   // live status line in plain words
```

- **Loading.** Nothing is fetched until the first `solve()` or `preload()`. Then a Web Worker loads `vendor/highs-1.15.4/` (about 3.5 MB, once) and every solve runs there, so the page stays responsive. `LX.solver.cancel()` stops the running and queued solves. A newer solve with the same `key` replaces an older queued one (slider sweeps). An `AbortSignal` works too. `opts.timeLimit` (seconds) goes to HiGHS and a watchdog backs it up.
- **Prices.** For an LP, `r.duals[name]` is the change of the optimal objective per unit increase of that constraint's bound. A demand-balance dual is the marginal cost of one more MWh: say "marginal value under stated assumptions" (fixed capacities, a convex model, the modelled market), not "the market price".
- **MILP.** A MILP returns `duals: null`: HiGHS returns no duals for a MILP. For prices conditional on the integer decisions (a commitment), call `fixAndReprice`; label them *conditional on the commitment*, and say that start-up and no-load costs need uplift payments.
- **Errors.** It never throws for a bad model: `status: "error"` with a `message` (unknown or repeated names, a constraint without a bound).
- **Early stops.** Only `"optimal"` sets `ok`. HiGHS's early stops get statuses of their own: `"time-limit"`, `"iteration-limit"`, and `"objective-bound"` and `"objective-target"` (model statuses 11 and 12, reached only when a bound or target is set in HiGHS's options; no lesson sets one). A plan found before the stop stays in `values`, but it is not proved optimal and has no duals; `describe(r)` says so.
- **Benchmark.** `node scripts/learn_solver_bench.mjs --site <worktree> [--only t13week,t13full] [--runs 20]` (ResearchPortfolio folder) times, in headless Chrome, the generic W1 set (24-hour dispatch LP, 168-hour storage LP, 24-hour unit-commitment MILP from `_tests/learn/solver_models.js`) and the lesson instances built by the lessons' own models (`lessonSet`: T11's day LP, M1's congested three-bus day, T13's seven-week planning LP at 200 kt and its full-year check, B3's four-hour dispatch; from W2, M2's unit commitment, M3's planning LPs, storage rules and full-year checks, and A22's per-slider re-solve and limits LP; the script's usage line lists every `--only` id), with CPU slowed 4× and 6× as a phone stand-in (the slowed runs solve on the throttled page thread, a pessimistic stand-in). It also checks the page API (duals, conditional prices, time limit, cancel, and an AbortSignal stopping a running solve). On an Apple M5 (2 Nov 2026) the p95 solve times were: T11 1.5 ms (4×: 7.9 ms, 6×: 9.5 ms); M1 3.1 ms (9.8, 10.1); T13 seven-week optimizer, 5,953 columns × 8,389 rows, 436 ms (2,216, 2,386); T13 full-year check, 52,560 × 17,520, 294 ms (909, 1,417); the generic set at most 24 ms (100 ms at 6×). The W1 budget is 1 s on a laptop and 3 s on phones; T13's optimizer is the closest to it. Run the large T13 models with `--only` and fewer runs (a combined 20-run pass over every model at 4× did not finish within 25 minutes). Real devices still need to be measured for the W1 report. W2 instances (Apple M5, 3 Nov 2026; 30 runs for M2, 10 for M3 and A22, 5 for `m3wk11` and `a22lim`; load averages 1.4 to 5.0 while other branches rendered; first-run or load outliers rerun), p95 at 1×, 4× and 6× in ms: M2 unit commitment MILP, 264 × 264, 29, 66, 96; its root relaxation 3, 9, 11; the LP with switches fixed 2, 7, 9. M3 plan LP on 4 typical weeks, 3,427 × 4,861, 166, 590, 871; on 8 typical weeks, 6,795 × 9,565, 381, 1,445, 2,161; the storage what-if on seven weeks (linked, cyclic, no link; 5,953 × 8,389) up to 477, 1,847, 3,055; the full-year checks of a plan on 2025 or 2024 (52,560 × 17,520) 249 to 344, 744 to 1,133, 1,201 to 1,928. M3's 8 + 3 weeks (9,321 × 13,093; precomputed on the page, as are 12 + 3 weeks and the full-year optimum) 856, 3,232, 4,895. A22's per-slider full-year re-solve (a battery plan, 52,560 × 17,520) 272, 813, 1,257; its limits LP (5,953 × 8,391) 435, 1,744, 2,620. Only M3's no-link storage LP reaches the 3 s phone budget at 6× (about 3.0 s), in a step that runs six solves in a row.
- **Vendored code.** `vendor/highs-1.15.4/` holds `highs.js`, `highs.wasm` and `LICENSE` (MIT) from the npm package `highs` 1.15.4 (HiGHS 1.15, published 16 Oct 2026). The tarball was checked against the registry: `sha512-vsC03XHDqWAVrEFUt22h8e4CDDMb+LAFa0bycjPUq2kadRigK5pNLVIlwspKvMxxVtrr4NAucZHP/CAgigxiDQ==`, shasum `2ce13b7a543a564ab5449cae215736fdbd484a57`. File SHA-256: `highs.js` 0bd23843…b5c7c, `highs.wasm` f13134e3…f8acd, `LICENSE` 9f8d8dcf…98bfa. To update, repeat the check on a version at least 14 days old and change `VERSION` in `solver.js`.

**Wind and solar output** (`profiles.js`, data `data/cf_targets.json`).

- **The data convention.** The wind and solar shapes in `town_days.json` and `town_year.json` are each normalised to their own 2025 maximum hour. Their mean/max (wind 0.53, solar 0.24) is **not** a capacity factor.
- **Sized output.** To give a plant of a given size a realistic year, scale the shape to a sourced annual capacity factor: `cf_targets.json` holds EIA, Electric Power Monthly, Table 6.07.B, 2025 (U.S. utility scale): wind 33.8%, solar PV 24.0%. It also has nuclear 91.1% and hydro 34.4% for reference.

```js
var p = LX.townProfile("wind", 150, { year: data.town_year, targets: data.cf_targets });          // method "scale"
var q = LX.townProfile("wind", 150, { year: data.town_year, targets: data.cf_targets, method: "power" });
// p.mw (8760 MW values), p.cf (= target), p.k or q.gamma, p.peakFrac, p.clippedHours, p.scaleDay(day.wind), p.source
```

- **`scale`** (default): output = capacity × min(1, k × shape). If the target is above the shape's mean, the best hours are clipped at capacity. If it is below, output never reaches capacity; for SPP wind against 33.8%, the windiest hour reaches 64% of capacity.
- **`power`**: output = capacity × shape^g. The best hour stays at capacity and no hour is clipped.
- **`monthlyCF`**: `true` (EIA's 2025 monthly values, `cf_targets.json` `monthly`, with source and access date) or 12
  fractions. Each calendar month of the shape is first brought to that month's capacity factor with the same method, then
  the year to the annual target; the result's `monthly` lists the 12 values. Use it when a lesson shows months or seasons:
  the SPP shapes carry the fleets' growth during 2025 (solar's January maximum is 0.56 of its November maximum), so an
  annual-only scaling gives December solar about 22% against EIA's 13.1% (lesson 5).
- Night-time solar is zero in `town_year.json` itself (`scripts/build_learn_town_data.py`); lessons do not clean it again.
- Say on the page which method a lesson uses. Lesson 0 keeps its single real day scaled to farm size, labelled as such.

### Promoted at the W1 merge (2026-11-02)

These components began as lesson-local code in wave W1 and replace every copy. The build bundles them after the core set
(`W1_PROMOTED` in `scripts/build_learn.py`); Node tests: `_tests/learn/test_components_{a,b,c,d,e}.js`.

**Model-lab stage** (`plot.css`, markup only): `.lx-stage` (a card) with `.lx-stage-head` (an `h3` and `.lx-readouts`),
`.lx-ctls` (a grid of sliders), `.lx-stage-status` and `.lx-goals` / `.lx-goal.won`. Lessons 10 and 11. Its one column shrinks, so a wide text-version table scrolls inside its box.

#### Charts

**XY chart** (`plot.js`): one SVG chart for lines, step lines, areas, bars, bands, reference lines and marks, with a readout and a text version.

```js
var P = LX.Plot(host, { caption: true, text: "Text version of the chart", box: true });
P.render({ x: {min: 0, max: 24, ticks: [[0, "00:00"], [12, "12:00"], [24, "24:00"]], ticksN: [...]},
           y: {min: 0, max: 400, step: 100, fmt: LX.fmt.int, unit: "MW"},
           lines: [{values: demand, x0: 0.5, color: "var(--lx-cc)", area: 0.12, anim: true}],
           refs: [{y: 59.3, label: "Relays cut customers", labelN: "59.3 Hz", dash: "5 4"}],
           marks: [{x: 16.5, y: 450, label: "Peak 450 MW"}], legend: [{label, color, dash}],
           tip: function (x) { return "<div><b>…</b></div>"; }, aria: "…", text: {head: [...], rows: [[...]]} }, true);
```

- A spec also takes `spans` (full-height shading), `hbands` (below zero), `bars`, `pick: {n, sel, onPick}` (clickable columns), `title`, `height`/`heightN`, `margin`/`ml`. Lines take `pts` or `values`, `step` (each value holds for an hour), `offset` (px, to show equal lines side by side), `dash`, `width`, `dots`, `cap`.
- Marks: `kind: "ring"` (default: hollow, bold label beside), `"dot"` (filled, centred label; `pos`), `n: "1"` (a numbered disc), `vline: true`. A ring's `above` label goes below the point when the point is within 21 px of the plot's top, so it stays out of the y unit's row. A span's label is drawn in `--lx-ink-2` (it sits on the span's shading).
- It draws once visible, redraws on resize and on the day/night toggle; `anim` lines draw on (not under reduced motion).
- Keyboard: a chart with a `tip` or `pick` takes focus; ← → Home End move the readout or the picked column.
- `LX.PlotCard(host, {text})` is the chart card with value chips: `c.title`, `c.chip(label, value, "good"|"bad"|"warn")`, `c.clear()`, `c.plot`, `c.text`.
- Replaces: the lesson-local `plot()` of lessons 3 and 4 (and their `.w1-stage`/`.w1-chips`/`.w1-chip` styles, now `.lx-plotcard`/`.lx-readouts`/`.lx-readout`), lesson 2's `LineChart` (its `hourly()` now only builds a spec), and B2's light chart (`chart()` now only builds a spec).

**Dot chart of two measures** (`scatter.js`): labelled dots that are buttons, a dashed y = x line, a text version.

```js
LX.Scatter(host, { points: [{key, label, x, y, color, aria, text}], x: {ticks, fmt, title, titleN}, y: {...},
  diagonal: {label, labelN, at: [x, y], atN}, aria: "…", onPick: function (key) {} });   // .select(key)
```

- Dots are in the tab order (Enter or Space picks; an accent ring shows focus). On phones the drawing is laid out at its real width; labels go right, left or above a dot.
- The diagonal's label starts at `at`; when it would run past the plot's right edge it ends there instead (lesson 6's label was cut off on desktop).
- Replaces: lesson 6's `Scatter` (capacity factor against firm share) and its `.lx6-scatter`/`.lx6-dot` styles.

**Hourly prices** (`pricechart.js`, on `LX.Plot`): step lines per bus, an earlier run dashed, the picked hour shaded; and an hour picker.

```js
var ch = LX.PriceChart(host, { label: "…", ghostLabel: "With the ramp rule", onPick: function (t) {} });
ch.set({ series: [{id, label, color, v: [24 prices]}], ghost: [24 prices], sel: 12 });
var hp = LX.HourPicker(host, { start: 12, jumps: [[19, "19:00"]], onChange: function (t) {} });   // hp.set(t), hp.val()
```

- Equal prices at several buses stay visible (each line 1.6 px from its neighbour); the axis runs from $0 to a round top (at least $100); hovering shows the hour's prices; the text version lists every hour.
- Replaces: M1's `PriceChart` and `HourPicker` (M1 keeps a small adapter that turns a solved day into series) and the `.m1-chart`/`.m1-hours` styles.

**Tornado chart** (`tornado.js`): which input moves a result most. Each row swings one input from low to high, the others at their defaults; rows sorted by swing.

```js
var t = LX.Tornado(host, { fmt: function (v) { return "$" + Math.round(v); }, fmtAlt: usd, measure: "LCOE" });
t.draw({ base: 37.52, rows: [{ label: "Capacity factor", loText: "25%", hiText: "45%", atLo: 50.7, atHi: 28.2 }],
         lede: "**Wind farm**: $37.52/MWh at the defaults (black line).", note: "One sentence." });
```

- Below the base in `--lx-good`, above in `--lx-bad` (`below` / `above` swap them). Both bar ends labelled; the text version lists every row.
- `sort: false` keeps your order; `LX.Tornado.layout` (Node: `tornadoLayout`) gives the axis and the sorted rows.
- Replaces lesson 7's tornado (step 7).

**Cost split** (`costsplit.js`): stacked bars that split a total into parts, one row per item, with a colour key.

```js
var cs = LX.CostSplit(host, { parts: [{ key: "capital", label: "Building the plant", color: "var(--lx-tier-2)" }, ...],
  rows: [{ key: "wind", label: "Wind", color: "var(--lx-wind)", values: L, total: L.total, aria: "..." }],
  fmt: function (v) { return "$" + Math.round(v); }, onPick: function (key) {} });
cs.set(rows, scale);  cs.key(host);
LX.CostSplit.bar(host, [{ color, value }], scale, { height: 14 });  LX.CostSplit.fill(bar, segs, scale);  LX.CostSplit.text(parts, values, usd);
```

- `onPick` makes the rows toggle buttons; without it they are plain rows (a calculator). `key: false` lets you place the key yourself.
- Screen readers: a button row is named by `row.aria`. A plain row is read from a visually hidden sentence (`.lx-sr`): `row.aria`, or by default its name, total and parts ("Gas CC: $41.00; building the plant $12.00, fuel $25.00, …"); its drawn name and total are hidden, so nothing is read twice (`test_components_b.js`).
- `LX.CostSplit.text` writes the parts as a sentence for text versions and spoken labels (`words` names a part inside a sentence).
- Replaces lesson 7's `lx7-split` rows, `bar()`, `key()` and `splitText()` (steps 2 and 6), and its single bars (steps 3 and 4).

**Supply stack** (`supplystack.js`): one hour's offers as blocks as wide as their MW and as high as their price, cheapest first, with the demand line, the clearing price, the marginal block outlined, the unused or spilled part pale, and negative offers below zero.

```js
var ch = LX.SupplyStack(host, { series: { wind: { name: "Wind farm", short: "Wind", color: "var(--lx-wind)" }, ... }, clear: model.clear });
var res = ch.draw(blocks /* [{key, mw, offer}], cheapest first */, demandMW, { xMax: 750, hideDemand: false });
```

- `clear` is the lesson's market clearing; the default (`LX.SupplyStack.clear`) is uniform price, cheapest first, the lower block marginal at an edge.
- The legend and text version follow the step's controls (`later: false` puts them right under the chart); `noLegend: true` hides the legend.
- The price label sits just above the price line; when a block's label is at the same height there (a $0 block next to the axis, on phones), it moves up a line.
- Replaces lesson 8's `StackChart` (steps 1 to 7). Candidates: A3, M1.

**Cost and CO₂ frontier** (`frontier.js`): the cheapest plan at each CO₂ level as a line over an "out of reach (approximately)" shade (straight lines join the solved points), labelled plan dots, and an equal-score line for a carbon price.

```js
var fc = LX.Frontier(host, { label: "Six plans for Prairie Town, cost against CO₂" });
fc.frontier([{ co2, cost, cap, solved }], "Frontier you traced");   // co2 in t, cost in $ (axes in kt and $M)
fc.plans([{ id: "A", label, co2, cost, color, kind: "plan" | "you" | ..., mark: "dominated" | "never", ring, legend, note }]);
fc.price(44, { co2, cost });   fc.pick(function (id) {});   fc.focusDot("A");
```

- `pick` makes the plan dots buttons (Tab, Enter, Space). Axis texts, scales and labels have options (`xMax`, `yMin`, `xLabel`, `fmtX`, ...).
- Layout: the shade's label is kept inside the plot (phones); a plan's letter goes up and right of its dot, or to the first free corner (up-left, down-right, down-left) when it would touch another letter or dot.
- Replaces lesson 13's `FrontierChart`, which lesson 12 read as `LX.townPlan.ui.FrontierChart` (gone from `ui`). With the planning engine (`planengine.js`, W2), it is the i-pareto pair: `LX.townPlan` solves, `LX.Frontier` draws.

#### Cards for the explain layer and contested points

**Steelman card** (`steelman.js`): the strongest case on each side of a contested point.

```js
LX.Steelman(host, { title: "Is LCOE a fair yardstick? The strongest case on each side",
  sides: [{ key: "for", title: "For: ...", points: ["..."] }, { key: "against", title: "Against: ...", points: ["..."] }],
  note: "One sentence." });
```

- In an explain card the title is an `h3` header (lessons 7 and 8). In a step card: `heading: "h4", eyebrow: "Steelman card", frame: true`.
- `reveal: "button"` (lesson 6) or `reveal: "details"` (lesson 12) makes the reader open each side; `onOpen(key)` and `opened` track it.
- `text` gives paragraphs instead of `points`; `wide: true` spans both columns; `**bold**` and glossary marks work.
- Replaces the Steelman cards of lessons 6, 7, 8 and 12.

**Where it holds** (`boundary.js`): a model's limits as two lists, with a source line.

```js
LX.Boundary(H("div", { class: "lx-xcard" }, x), { title: "Where this answer holds", lede: "...",
  holds: ["..."], leaves: ["..."], source: "Data: ..." });
```

- Column titles default to "It holds when" and "It leaves out"; `cols: [{ title, items }]` for other columns.
- Replaces lesson 13's `Boundary`.

**Share link** (`share.js`): share a state of the page as a link, copied to the clipboard.

```js
var sh = LX.Share(panel, { button: row, buttonText: "Share this plan", note: "Anyone who opens this link sees your plan.",
  hash: function () { return model.encodePlan(plan); } });
sh.share();                                  // also from another button
LX.copyText(text, { select: field });        // Promise of true or false
```

- The state stays in a name-safe `#hash` (the lesson keeps its own encoder and decoder); `replace: false` leaves the address bar alone.
- Clipboard first, then select the field and `execCommand("copy")`; the status line says which worked.
- Replaces lesson 13's `share()`. The checkpoint runner (`ck-f-estimate.js`, "Copy my results") can use `LX.copyText`.

**Slider formats** (no new file): lessons 7 and 8 now use `LX.Slider` with `fmt`; lesson 1's "Average draw of a home" prints "1,230 W".

#### Linear programs and formulation

**Linear-program plane** (`lpplane.js`): one two-variable LP plane (rules as lines plus a side, the region, the cost line, best corners or a tied edge, an unbounded arrow, a simplex walk, a plan dot), and `LX.lp2`, its pure rule algebra (Node: `require("assets/learn/components/lpplane.js")`).

```js
// B1, K4: a fixed 440 × 380 drawing, drawn with primitives
var pl = LX.LPPlane(host, { view: [0, 160, 0, 140], ticks: [0, 20, 40], xLabel: "x: combined-cycle output, MW", yLabel: "y: peaker output, MW", aria: "..." });
pl.clear(); pl.region(rules, "ghost" | "pick"); pl.rule(r, { label, cls: "on" | "hot" }); pl.iso(c, value, label); pl.point([x, y], { label, cls: "good" | "bad" | "trail" });
pl.outside(r); pl.onPick(function (p) {}, 5);
// lessons 10, 11: a fluid drawing at the box's width, drawn as a whole scene
var plane = LX.LPPlane(host, { fluid: true, view: { x: [0, 240], y: [0, 160] }, xLabel, yLabel, describe: fn(state),
  styles: { demand: { color: "var(--lx-ink)", label: "Demand", place: "foot", drag: true } }, onDrag: fn(id, value), onDot: fn(x, y) });
plane.render({ rows, c, sol: LX.lp2.solve(m), level, dot: { x, y }, hi, walk: LX.lp2.simplexWalk(m), walkAt, showBest });
// pure: m = {sense: "min" | "max", c: [c1, c2], rows: [{id, a: [a1, a2], op: "<=" | ">=" | "=", b}]}
LX.lp2.solve(m);            // exact: "optimal" | "tied" (edge or ray) | "infeasible" | "unbounded", corners, best, binding, ray
LX.lp2.optimum(m, view);    // any rules (also a learner's half-written model, no corner needed): the best corner in a big box
LX.lp2.region(rules, view); LX.lp2.segment(a, b, view); LX.lp2.holds(r, p); LX.lp2.le(r); LX.lp2.simplexWalk(m)
```

- `solve()` needs a region with a corner when it is not empty (true with x ≥ 0 and y ≥ 0); `optimum()` works for any rules.
- A rule without a style shapes the region and draws no line (x ≥ 0, y ≥ 0). Rule labels in `render()`: `place` "start", "top", "end" or "foot"; a label takes its line's colour toward the ink (4.5:1, see "Colour as text").
- Keyboard: the plan dot is a slider (arrow keys); every dragged line also has a slider in the lesson. Text version: `describe` (fluid), or the lesson's own list.
- `.lx-lp-walk` and `.lx-lp-walk-out` style a row of walk controls under a plane. Static fallback figures use the classes `lx-lp-grid`, `-tick`, `-axlab`, `-region`, `-rule on`, `-iso`, `-fbpt`, `-plab`.
- Replaces: `Plane()` and the rule algebra in B1 and K4 (`w1h-*` styles), `W1F.LPPlot`, the exact solver and the simplex walk in lesson 10 (lesson 11's "peek inside the solver" uses it too).

**Card sort** (`cardsort.js`): sort cards into bins, check, one-line reasons; two modes.

```js
LX.CardSort(host, { bins: [{id, label, sub, color}], cards: [{id, text, bin, why}], onCheck: fn(g) });          // tap a card, tap a bin
LX.CardSort(host, { mode: "toggles", bins: [{key, label, short, icon}], items: [{key, label, color, ref: {bin: "yes" | "no" | "partly"}, why: {bin}}],
  marks, onChange: fn(marks), onCheck: fn(res), checked, checkLabel: "Check my sort", cls });                  // several bins per item
LX.CardSort.grade(cards, placed);  LX.CardSort.score(marks, items, binKeys);  LX.CardSort.reference(items, binKeys)   // pure, also in Node
```

- A "partly" cell accepts either answer. Any other reference value than "yes" and "partly" is a clear "off" cell: "no", or a word such as "not stated" (R2), which the "Why" list shows as written. Keep a fourth bin, Given (data), next to Decisions, Goal and Rules.
- Replaces: `W1F.CardSort` (lesson 10) and `JobSorter` (lesson 6, whose `score()` now calls `LX.CardSort.score`).

**Linked views** (`linkedviews.js`): one model in words, in symbols and as a table; tap a line and the same part lights up everywhere.

```js
var lv = LX.LinkedViews(host, { panels: [{ title: "In words", items: [{ key: "demand", html: "..." }, { html: "not linked" }] }],
  table: { title: "As a table", head: [...], rows: [{ key, cells: [...] }] }, hint: "One sentence.", onPick: fn(key) });
lv.update({ panels, table });  lv.pick(key);
```

- Symbols: `<span class="lx-lv-sym">` with `<var>` letters. Two columns, one under 640 px.
- Replaces: `W1F.Views` (lesson 10, step 8).

**Toggle** (`toggle.js`): an on/off switch button.

```js
LX.Toggle(H("div", { class: "lx-toggles", role: "group", "aria-label": "Rules on or off" }, host), { label: "CO₂ cap", on: true, onChange: fn(on) });   // -> {el, set, val}
```

- Replaces: `W1F.Toggle` (lesson 10). Lesson 10's and 11's `W1F.Ctl` sliders are now `LX.Slider`.

**Equation card** (`equation.js`): an equation whose symbols are buttons; each opens its words, unit, the reader's own numbers, a story line and code (e-equation).

```js
LX.EquationCard(host, { title, lede, rows: [{ parts: [{ k: "cf" }, "=", { k: "E" }, "÷", { frac: [[{ k: "P" }], [{ k: "T" }]] }], say, note, tag }],
  symbols: { cf: { sym: "CF", name, unit, color, label, words, you: fn | text, story, code } },
  fields: [{ key: "you", label: "In this lesson" }, { key: "code", label: "In code", code: true }], sel: "cf", aside, eyebrow, hint, code, codeLabel });
var sym = LX.EquationCard.sym;   // html rows: { html: "min " + sym("c", "40") + " …", tag: "goal" }, with dense: true for a whole model
```

- A part is a string (an operator or word), `{k}` (a symbol button), `{html}` or `{frac: [num, den]}`; or the row is `html` with `<button data-s>` symbols.
- `fields` lists the lines under the words (default: you, story, code). `label: null` shows the value bold with no label; `alt` copies a line into the text version.
- `dense: true` is a formula box with dotted-underlined symbols (long models); the default is large symbol buttons. `aside: true` puts the panel beside the equation on wide cards. A dense row's `note` sits on its own line under the formula.
- A symbol's `unit` follows its name in the panel heading and in the text version: "Capacity factor (%)".
- Used by lessons 5 (capacity factor), 7 (LCOE, a fraction), 10 and 11 (dense model and price), B1 (cᵀx, Ax ≤ b) and B3 (the balance row).

**Formulate box** (`formulate.js`): "Formulate it", a model's parts in words, with the symbols on request (e-formulate).

```js
LX.FormulateBox(host, { title, lede, parts: [{ k: "Decisions", color: "var(--lx-tier-2)", text }, { k: "Goal", color: "var(--lx-good)", text },
  { k: "Rules", color: "var(--lx-warn)", text }, { k: "Given", color: "var(--lx-ink-3)", text }], symbols: "html; <span class=\"tag\">balance</span>", symbolsLabel });
```

- Four parts in a row, two by two under 860 px, stacked under 520 px. Keep the colours: Decisions tier-2, Goal good, Rules warn, Given ink-3 (lesson 8's "What comes back" uses accent).
- Used by lessons 8, 9 and 10.

**Formulation viewer** (`formulation.js`): a model's rules in words, in symbols and as a table, linked by the selected rule (i-formulation).

```js
var F = LX.Formulation(host, { rules: [{ id, name, words, sym, symBase, rows: fn(full, hours) | text, dual, extra, tag }], legend: [["t", "hour"]],
  views: ["words", "symbols", "table"], view: "table", sel: "bal", full: true, showLater, extraNote, hours, columns, tagWidth });
F.set({ sel, view, full });
// one view with picks: a published-style formulation read line by line, or a bug hunt
var B = LX.Formulation(host, { views: ["symbols"], rules: [{ id, name, tag: "(1)", sym }], aria, onPick: function (id, el) { B.mark(); B.mark(id, "right"); } });
```

- `full: false` leaves out the rules marked `extra` (or greys them with `extraNote` when `showLater`) and shows `symBase`. The table becomes labelled cards under 640 px.
- Used by M1 (the model in full) and B3 (steps 5 and 6: the seven lines, and the bug hunt's suspect models).

**Network** (`network.js`): buses with prices, lines with flows, limits and congestion; tap a bus (i-network).

```js
var net = LX.Network(host, { buses: [{ id, name, short, color, at: [x, y], note, desc }], lines: [{ id, from, to, name, labelAt }],
  plants: [{ bus, color, label }], size: [360, 300], label, onPick: fn(busId), money, unit: "/MWh" });
net.set({ h: { price, flow, full }, lim, sel, transfer });
```

- Line labels go beside the line, away from the network's centre, unless `labelAt` places them. Full lines turn red with "full". The text version lists every bus and line.
- Used by M1 (steps 6 to 10 and the annotated map in the explain layer, through a small adapter that sets M1's layout).

#### News lens, data checks, checkpoints and spreadsheets

**Checklist** (`checklist.js`): a list of tick boxes the reader keeps for their own work; the ticks stay in this browser.

```js
LX.Checklist(host, { id: "b2-checklist", title: "A data check you can reuse", lede: "One sentence.",
  items: [{ id: "rows", label: "Rows and span", text: "One sentence.", note: "len(df)" }], doneText: "Write a data note.", code: true });
LX.Checklist(host, { id: "b3-check", title: "Check a model in eight moves", count: "head", soft: true, inline: true, ordered: true,
  items: [{ label: "Units", text: "Every term in one unit." }] });   // no id: stored by position, as B3 and K7 always were
```

- `count: "foot"` (default) puts "N of M checked." and a "Clear the ticks" button under the list; `count: "head"` puts "N of M ticked" in the header.
- `soft` and `inline` give the B3/K7 look (soft rows, label and text on one line, `sep` between them); `columns: 2` gives two columns on wide screens; `code` sets the notes in the monospace font.
- Returns `{ el, state(), count(), set(id, on), clear() }`.
- Replaces the copies in N1 and B2 (`LX.Checklist = LX.Checklist || ...`) and the `.b3-list` tick lists in B3 and K7. Storage keys unchanged (`n1-checklist`, `b2-checklist`, `b3-check`, `k7-check`).

**Evidence ladder** (`evidence.js`): the stages a project climbs (announced ... at design output), highest rung on top, with claims the reader places on it.

```js
LX.EvidenceLadder(host, { title: "The evidence ladder", lede: "One or two sentences.",
  rungs: [{ id: "announced", label: "Announced", text: "One line." }],       // lowest first
  off: { id: "projection", label: "A projection is not on the ladder" },   // optional box for claims on no rung
  items: [{ id: "a", text: "A claim", answer: ["operating"], note: "One or two sentences." }] });
```

- Each claim gets a labelled select; the chosen rung lights up and the claim's note says "Right." or "Not quite.". Text version included.
- Returns `{ el, place(itemId, rungId) }`; pure `LX.EvidenceLadder.check(item, rungId)` (Node: `require("components/evidence.js").check`).
- Replaces N1's explain-layer ladder.

**Phrase tagger** (`tagger.js`): the "dissector". The reader tags the highlighted phrases of a short text with the question each raises, names the question the text leaves unanswered, and compares with a researcher's tags.

```js
LX.PhraseTagger(act, { key: "n1-tags-a", tags: D.lens,                    // [{id, n, label, sub, color}]
  kicker: "Story 1 of 3 · Data centers", title: "Headline", framing: "One line.", sources: [{ label, url, as_of }],
  parts: ["Text ", { p: "a1", text: "a phrase", tag: "scale", also: ["time"], note: "One sentence." }, " text."],
  missing: { answer: "pays", also: [], note: "One sentence." },
  onCompare: function (score) { api.done(); api.saw("You matched ... on " + score.same + " of " + score.total + " phrases."); } });
```

- Verdicts per phrase: same, fair (in `also`), other, none. Picks stay in this browser under `key`.
- Phrases are inline spans with button semantics (Tab, Enter, Space), so long phrases wrap with their sentence; chips carry a number badge, so colour is never the only cue. The badge's fill is its colour 86% toward the ink, so the number reads at 4.5:1 day and night.
- Returns `{ el, picks(), select(id), tag(id, tagId), miss(tagId), compare() }`; pure `phrases`, `judge`, `score`, `badge` (also on `LX.PhraseTagger`).
- Replaces N1's three story steps.

**Unit chain and evidence clock** (`unitchain.js`): a back-of-envelope chain of numbers with units, and a timeline of how long the evidence took.

```js
var uc = LX.UnitChain(host, { label: "Unit chain", steps: [{ v: "649 TWh", u: "a year (energy)" }, { op: "÷ 8,760 h =" }, { v: "74.1 GW", u: "average power", out: true }] });
uc.set(steps);   // redraw when a slider or a choice changes a number
LX.EvidenceClock(host, { label: "Timeline: ...", marks: [{ d: 0, label: "Blackout", value: "28 Apr 2025" },
  { d: 1, label: "One-cause claim", value: "within a day", warn: true, anchor: "start", dx: 4 }, { d: 326, label: "Final report", value: "326 days" }] });
```

- The chain is an ordered list, `ol.lx-uchain` (it reads as text and wraps on phones); `.lx-chain` is the causal chain's class, and both can sit on one page. The clock is an SVG with a label and a "Text version of the timeline".
- Replaces N1's envelope checks (steps 3, 5) and its evidence clock (step 7).

**Checkpoint** (`checkpoint.js`): the checkpoint runner for CK-F, and next for CK-A, CK-M and CK-R. One task at a time; a clock that runs only while the task is on screen and the tab is visible; first-try recording; five task kinds (choice, order, number with a unit, open-short, estimate); a rubric self-rating read from the page's rubric table; a results view; a plain-text summary to copy (clipboard, else select-and-copy).

```js
var cp = LX.Checkpoint(live, { data: D, key: "ckf-v1", code: "CK-F", lessonId: "ck-f-estimate",
  intro: ["Nine tasks, about 40 minutes: ...", "..."], rubric: "#ckf-rubric", lock: "#ckf-lock", solution: "#ckf-solution-body",
  chart: function (t, body) { LX.Checkpoint.lineChart(body, D.charts[t.chart], series, label); }, estimateNote: "HTML" });
cp.show(0); cp.results();   // for the lesson's LX.demo states
```

- Data: `version`, `rule` ({auto, autoProficient, autoStrong, autoDeveloping (default 3), criteria, levels}) and `tasks` (fields per kind in the header comment).
- In the page, mark the worked-solution block `class="lx-ck-gated"` (shut with JavaScript until the estimate is submitted or opened early, open without it; "Start again" shuts it again) and the lock box `class="lx-ck-lock"`; rubric rows are `<tr data-c="criterion">`.
- An estimate needs a high above its low (one number is not submitted, and the reader is told why). Solutions, points and choice feedback take `[[glossary-id|words]]` marks.
- Keep `key` and the summary format fixed once testers use a checkpoint: summaries are compared across versions. The summary's first line is "Learn · <code> results (<version>)".
- Pure (Node: `require("components/checkpoint.js")`): `task`, `checkChoice`, `checkOrder`, `checkNumeric`, `checkEstimate`, `level`, `describe`, `summary(D, st, env, {code})`, `fmtMs`, `firstWord`. `checks`, `level` and `summary` options replace them for a checkpoint with other units or another rule.
- **Options added for CK-M (W2 integration).**
  - `describe(D, L)` writes the results view's sentence under the level (default: CK-F's parts).
  - `submitTask: id` names the task whose answer opens the page's worked solution (default: the estimate); its own early button, and the lock box's button, open it early, recorded on that task.
  - `onAnswer(taskId, record, state)` runs after each answer and each early opening.
  - A numeric task with `answer: { value, tol, show }` takes any unit (`units: [[name, factor to the answer's unit]]`, `null` for the wrong kind, with `unitNote`; `checkValue`); `answer: { mwh, tol }` keeps CK-F's MWh check (`checkMWh`). `checkNumeric` picks by the answer's form.
  - `destroy()` stops the clock, saves the attempt and removes the runner's listeners and markup, so a page can swap runners (CK-M changes variant this way). `solutionNow()` opens the worked solution early, recorded.
- **Shared fixes after the CK-M review (W2).**
  - A number task shows its tolerance under the answer field, before the first answer, tied to the field (`aria-describedby`): the task's `tolNote`, else "Within 0.5% of the right value counts as right." from `answer.tol` (`tolText`). `tolerance: false` hides it. CK-M's runner tasks carry their prompt's last sentence as `tolNote`, so it is said once.
  - `openFirst: "not-right"` (or `rule.openFirst` in the data) makes the shared level rule count a task whose worked solution was opened before its first answer as not right; the results sentence says how many. The default, `"counts"`, keeps CK-F's published rule. `firstRight(record, openFirst)` is the rule for pages with their own level (CK-M).
  - Each task's record gets `at`, the time of its first answer. The runner records when the page's worked solution first opened, per runner key (`<key>-sol-open`, the submit task's `at` when submitting opened it), and keeps it across "Start again"; `LX.Checkpoint.solOpened(key)` reads it. An early opening is recorded before `onAnswer` runs. No data version changes: stored attempts keep working (CK-M v2 still reads its older `ckm-sol-open` record too).
- Replaces the runner in `ck-f-estimate.js`, which now holds only CK-F's configuration, its two charts, `worked()` and the mount. CK-M (`ck-m-unseen-problem.js`) holds its two variants' tasks, its level rule, `describe` and summary, and the supplied model.

**Spreadsheet** (`sheet.js`): a small working spreadsheet: a formula engine and a view with a formula bar, a grid that moves with the arrow keys, and fill-down.

```js
var sh = LX.Sheet(host, { cells: { E1: "100", E5: "=B5-C5-D5-$E$1" }, rows: 31, cols: 6, labels: { 30: 1 }, lock: function (n) { ... } },
  { start: "B5", fillRows: [5, 28], fillCols: "EF", prefix: { F: "$" }, wide: "F", headRow: 4, todo: ["E33"], label: "Spreadsheet of ...",
    onSelect: function (name) {}, onChange: function (sheet, name, how) {} });
sh.set("E5", "=B5-C5-D5-E1"); sh.select("E5"); sh.fill();
```

- Engine: numbers, + − × ÷ ^ (as Excel: −2^2 = 4), addresses with $, ranges, SUM, AVERAGE, MIN, MAX, COUNT, ABS, ROUND; errors #DIV/0!, #VALUE!, #NAME?, #REF!, #CYCLE!.
- Pure engine (Node: `require("components/sheet.js")`; page: `LX.Sheet.engine`): `tokenize`, `parse`, `value(sheet, name)`, `changed(sheet)`, `shift(raw, rows, cols)`, `refsIn`, `colName`, `colNum`, `isErr`, `show`.
- "Fill down" follows the selected cell: it turns on as soon as a formula is entered there (Enter or `set()`), and off for a value.
- Replaces K7's engine and SheetView (K7 keeps its day, layout, steps and practice tasks). B2 or T7 can use it for an in-page sheet.

Tests: `node _tests/learn/test_components_e.js` (each file defines its `LX.<Name>` with a stub `window.LX`; the pure parts; no lesson keeps a copy).
The shared fixes after the W1 reviews (checkpoint solution lock and ranges, fill-down state, `api.busy`, `Flowchart.update`, the unit chain's class) run on a stub document in `node _tests/learn/test_components_shared.js`.

**Faded practice** (`practice.js`, `practice.css`): sets of exercises that fade from a worked example to a blank page, with
two or three staged hints and an automatic check with a one-line reason.

```js
var P = LX.Practice(host, { id: "b1-practice", title: "Practice", lede: "One sentence.", blank: "Enter an answer first.",
  tracks: [{ label: "Best corner", intro: "One sentence.", items: [{ key: "c14", kind: "worked" | "partly" | "scratch", minutes: 3,
    title: "14:00", build: function (area, api) { api.hints([...]); api.check(function () { return {ok, why} | null; }); api.answer(fn); } }] }] });
```

- The header counts done exercises and adds up `minutes` (state honest times); done marks stay in this browser (`id`).
- "Show the answer" appears after the last hint; an exercise with its own check calls `api.done()`.
- Exercise pieces in `practice.css`: `.lx-fp-model` (a model in symbols), `.lx-fp-tab` (a table, `tr.best`, `tr.ask`),
  `.lx-fp-pt`, `.lx-fp-ans`, `.lx-fp-ask`, `.lx-fp-worked`, `.lx-fp-choices`. Used by B1 and B3.

**Number box and practice drill** (`numanswer.js`, `drill.js`, each with its `.css`; promoted from the toolbox at the W2 merge, 2026-11-03): `LX.NumAnswer(host, { label, unit, accept, button, width, widthPhone, onCheck(v, input) })` is a labelled number box with its unit (tied to the box with `aria-describedby`) and a Check button (Enter checks too; `v` is null when the box is empty) and returns `{ row, input, button, msg, go }`. An entry that is not just a number is refused and never graded: another unit ("450,000 MW" in a kW box), words or left-over text get the box's own live note, "Type just the number: the box is in kW." (`.lx-na-msg`, with `aria-invalid`), and `onCheck` is not called. After the number the reader may type the box's unit (case, spaces, $ and % ignored; "/" for "per") or one of `accept`. `LX.Drill(host, { item(k, r), hint, seed, unit(it), check(v, it), empty, focus, width, cls, choicesClass })` is the seeded practice drill: items in rotation from the page's `item(k, r)` (`{ q, why, choices, answer }` or a number `answer` with `unit` and `tol`), a running score and a reason after each answer, all in live regions. `empty` is a message (the item stays open), `false` (graded wrong, K4) or left out (nothing happens); `focus` is `"question"` (default), `"answer"` (K8) or `false` (K4). Pure (Node: `require("components/numanswer.js")`, `require("components/drill.js")`): `parse(text, unit)` (commas, $, %, minus signs, 6.96e9, 6.96 × 10^9, 6.96 × 10⁹ and 10⁹; null for left-over text other than the unit), `read(text, unit)` (`{ value, why }`, why `"empty"` or `"text"`), `close(v, ans, tol)`, `rng(seed)`, `series(item, seed, n)` (the page's `drill()` for tests), `newSeed()`. K1 to K5 and K8 use them and keep no copy; their per-seed items are unchanged (`node _tests/learn/test_components_w2_toolbox.js`).

### Added in wave W2 (2026-11-03): studios and case files

The build bundles these after the W1 set (`W2_JS`, `W2_CSS` in `scripts/build_learn.py`), the planning engine last. Node tests: `_tests/learn/test_components_w2.js`, which also compares the rubric's words with curriculum v2 §3.4 when `LEARN_CURRICULUM=<path to curriculum_v2.md>` is set, or when the curriculum sits at `../reports/learn/` from the site folder. `_tests/learn/stubdom.js` is a small stub document for testing a view in Node (`env()`, `load(name, E)`, `buttons()`); it is not a test itself.

Each component's pure part has a `staticHTML` that writes the no-JS fallback from the same data. A lesson's test can write it between markers in `--write` mode and check it otherwise, as CK-F does.

**Exemplars** (`exemplars.js`, e-exemplars): a good and a weak answer to the same task, side by side, with tap-to-reveal notes on the phrases that make the difference.

```js
LX.Exemplars(H("div", { class: "lx-xcard" }, x), { title: "Two answers to the same brief", task: "The task, in one line.",
  answers: [{ key: "weak", label: "Weak answer", level: "Developing", parts: ["Is ", { text: "community solar", note: "No type and no metric." }, " good?"] },
            { key: "good", label: "Strong answer", level: "Proficient", parts: ["Did ", { text: "renters' energy burden", note: "A metric with units." }, " fall ...?"] }],
  diff: [{ label: "Type", weak: "None", good: "Evaluative" }], id: "r1-ex", lines: true, note: "Both answers are illustrative." });   // -> { el, open(key, n), openAll(), opened() }
```

- Each marked phrase is a button (`role="button"`, Tab, Enter, Space) with a number badge. It opens or shuts its note under the answer (`aria-expanded`, `aria-controls`), and the note is read out.
- "Show all notes" opens every note. Notes start with "Falls short:" (weak) or "Works:" (good); `lead` changes the word.
- With `id`, the open notes are remembered in this browser.
- `lines: true` keeps an answer's line breaks (an answer written as a card, one field per line: R1, R3, R4, R5, R9, R10), in the view and in `staticHTML`'s `<p class="lx-ex-lines">`, and sets each line's leading field label ("Funding:", up to 40 characters, in plain text) in bold (`linesHTML`). No page style is needed.
- Two columns from 700 px. The "What made the difference" table becomes labelled lines on phones.
- Pure (Node: `require("components/exemplars.js")`): `marks`, `plain` (text with `[n]`), `validate` (the view throws on a malformed pair), `staticHTML`.

**Rubric self-check** (`rubric.js`): the course rubric (§3.4) as a self-check.

```js
LX.Rubric(H("div", { class: "lx-xcard" }, x), { id: "r1-rubric", code: "R1", title: "Rate your card against the rubric",
  competences: [{ id: "framing", look: "All eight checks pass, and the card says why the question matters." }, "method"] });   // -> { el, picks(), set(id, level), clear(), summary() }
```

- **Competences.** The ids are `framing`, `positioning`, `method`, `trust`, `uncertainty`, `accounting`, `realism`, `communication` and `integrity`. Their words are §3.4's, word for word.
- **Levels.** Not yet, Developing, Proficient (the bar) and Strong. "Not yet" reads "Developing is not reached yet."
- **Do not reword.** A studio picks its competences and adds a `look` line; it never rewords the levels.
- **Controls.** Each competence is a fieldset of native radios whose labels carry the anchored descriptions. The result line counts competences at Proficient or above.
- **Copy.** "Copy my self-check" copies a plain-text summary whose first line is "Learn · R1 self-check (rubric v1 ...)". Without a clipboard, the summary shows in a box to select. Keep `VERSION` fixed once testers send summaries.
- **Pure.** `LEVELS`, `COMPETENCES`, `competence`, `count`, `summary`, `staticHTML` (also on `LX.Rubric`).

**Question card** (`questioncard.js`, the card of i-studio and i-share): a structured research question.

```js
var qc = LX.QuestionCard(H("div", { class: "lx-xcard" }, live), { id: "r10-card", code: "R10", title: "Your question card", share: true,
  values: { type: "evaluative", question: "Did ...?", audience: "...", metric: "...", units: "...", counterfactual: "...", scale: "S1",
            boundary: "...", wrong: "...", uncertainty: "..." },
  fix: { metric: { href: "a01-....html", label: "A1" } }, onChange: function (values, checks) {} });   // -> { el, get(), set(values), text(), checks(), share }
```

- **Fields.** The question in one sentence, then the type (five radios, §11.2, each showing its template and typical methods), audience, metric and units, counterfactual, scale (S0–S4) and boundary, "I would be wrong if…", and the main uncertainty.
- **Checks.** Eight: the question is written (one sentence ending in a question mark, with no bracketed placeholder such as "[…]" left from a draft), then the seven parts that §11.3's rigour checks need. Each is filled in or marked to do, in words and with an icon, with an optional fix link; the head reads "N of 8 parts filled in" and the copied text "Parts filled in: N of 8". The checks see only whether a part is there, not how rigorous it is (the rubric does that, and the card's note says so). They never block a question, and they never judge originality, importance or novelty (R10 rule, §11.3). The audience hint names users and an affected group.
- **Pickers.** R10's pickers fill the card with `set()`.
- **Saving and sharing.** With `id`, the draft stays in this browser. `share: true` adds "Share this card": the card travels in a `#q-...` hash (base64url JSON, through `LX.Share`), and opening such a link loads that card. Link text only ever goes into form fields.
- **A link is applied once.** The first card built takes the link's card as its stored draft and drops the hash from the address (`history.replaceState`). A card built again later (R10's step 3 after Back and Next) shows the reader's edits, and a hash the page wrote itself ("Share this card") is never applied over them. Pages need no workaround.
- **Pure.** `TYPES`, `SCALES`, `FIELDS`, `CHECKS`, `check`, `text`, `encode`, `decode`, `clean`.

**Timeline** (`timeline.js`, e-timeline): dated events, each with its source, for case files (and A1, X3).

```js
LX.Timeline(H("div", { class: "lx-card" }, live), { title: "The study in time",
  events: [{ date: "2024", label: "Data year", kind: "data", text: "One sentence.", source: { label: "EIA-930", url: "https://www.eia.gov/...", as_of: "2025-11-01" } },
           { date: "2026-06", label: "Paper accepted", kind: "study", key: true, source: { label: "Conference paper" }, deeper: "Longer text." }] });
```

- **Dates.** `YYYY`, `YYYY-MM` or `YYYY-MM-DD`. They show as "2024", "June 2026" or "14 March 2025", in `<time datetime>`.
- **Gaps.** The time between events appears above each one ("15 months later"; `gaps: false` drops it), at the coarser precision of the two dates.
- **Kinds.** Study, data, policy or event, written in words beside the date. `key: true` rings the marker and adds a "Key step" tag.
- **Sources.** Every event needs a source (a label; an http(s) `url` and an `as_of` date are optional). The view throws on a malformed event.
- **Layout.** An ordered list, so it is its own text version. The date column sits on the left from 760 px.
- **Pure.** `parse`, `fmt`, `sortEvents`, `gap`, `validate`, `staticHTML` (the page's `<ol class="lx-tl-static">`).

**Scale strip** (`scalestrip.js`, e-scale-strip): the five scales of §5.3 side by side, S0 device and plant to S4 nation, one card each (F1's explain layer, R3's self-check; lesson 1's `t1-strip` is a later user).

```js
var ss = LX.ScaleStrip(H("div", { class: "lx-xcard" }, x), { title: "Five scales at a glance", lede: "One sentence.", scales: D.scales,
  power: true, flow: true, ticks: { S0: { who: true, what: false, physics: null } },        // F1: power range, what passes down and up, the reader's sorts
  lessons: { S2: [{ code: 8 }, { code: "M2", note: "unit commitment" }] }, path: data.path });   // lessons per scale, linked when live
var r3 = LX.ScaleStrip(card, { title: "...", scales: D.scales, decides: true, steps: true, color: "var(--lx-tier-4)",   // R3: who decides what, step and horizon
  mark: "S1", markText: "Your brief sits here." });   // -> { el, update({ mark, markText, ticks, ... }) }
```

- **Scales.** `{ id: "S0", name, power, who, decides, step, horizon }`, in order. Each card's top edge takes its scale's colour, `--lx-scale-0` ... `--lx-scale-4` (day and night, defined in `scalestrip.css`: use these tokens wherever a page colours a scale), or one `color` for all.
- **Parts on request.** `power` (top right), `decides` ("Decides …; who."), `steps` (time step and horizon), `flow` (chips for what passes down and up; `{ down, up }` changes the words), `ticks` (the reader's sorts, right, elsewhere or not sorted, in words and icons, summed up in one sentence for screen readers; `tickKeys` names them), `lessons` with `path` ("Go further:", through `LX.lessonRef`; an `{ href, label }` item is always linked), `mark` and `markText` (one scale outlined, with a line of text).
- **Layout.** Five columns from 861 px, one card per row below. The list is its own text version. A scale's code (S0 ... S4) is in its colour toward the ink (4.5:1). `update(patch)` redraws the cards (R3 moves the mark when the reader picks a brief).
- **Pure.** `scaleIndex`, `colorOf`, `lessonParts`, `tickSummary`, `TICKS` (Node: `require("components/scalestrip.js")`; also on `LX.ScaleStrip`).

**Planning engine** (`planengine.js`, `planengine.css`; a one-region capacity-expansion LP): `LX.townPlan`, Prairie Town's capacity plan as a linear program, promoted unchanged from lesson 13. Lessons 12, 13, M3 and A22 use this shared copy; lesson 12 no longer loads `13-capstone.js`. At the W2 integration, M3's rules for storage between representative weeks, its full-year check and its error measures moved in too (`link`, `readCheck`, `errors`).

```js
var TP = LX.townPlan;   // Node: require("assets/learn/components/planengine.js"); require("13-capstone.js") returns the same object
var Y = TP.prepareYear(data.town_year, data.cf_targets, cfg), RW = TP.selectWeeks(Y, cfg.weeks), C = TP.costs(cfg, {});
LX.solver.solve(TP.weekModel(C, RW, { cap: 200e3 }), { timeLimit: 10 }).then(function (r) { var s = TP.summarize(C, TP.periodsOf(RW), r, { cap: 200e3 }); });
TP.fullYearModel(C, Y, { plan: plan });   // the same LP on all 8,760 hours (a plan fixed, or optimized: slow)
var m = TP.link(TP.weekModel(C, RW, { cap: 200e3 }), RW, "cyclic");   // or "linked" (as built), "free"
var chk = TP.readCheck(C, Y, r, plan), e = TP.errors(est, chk, 200e3, ref);   // r: the fixed plan's full-year run; ref: {cost} or null
```

- **Model.** Seven representative weeks of 2025 with linked battery states (or the full year), a CO₂ cap or a carbon price, and wind and solar scaled to EIA's 2025 capacity factors. `cfg` is `data/13-capstone.json`, with costs from primary sources and dates. The model, the time representation and the checks are described in the file's header.
- **Pure helpers.** `summarize`, `encodePlan` and `decodePlan` (`#plan-...` links), `weekSeries`, `frontierAt`, `ceilPlan`, `stars`, `capReading`, `fullVerdict`, `crf`, `fixedCost`, `build`, `KEYS`.
- **Storage between representative weeks** (from M3). `link(model, RW, mode)` takes a `weekModel` and sets the battery's rule between weeks: `"linked"` returns it as built (one calendar chain of 52 start levels, Kotzur et al. 2018); `"cyclic"` adds `s<p>_167 = 0` for each representative week, so no energy moves between weeks; `"free"` drops the 52 chain rows, so each week may start at any level and stored energy can appear from nothing. Say which rule a page uses.
- **The full-year check and its error measures** (from M3). `readCheck(C, Y, r, plan)` reads a fixed plan's run on all 8,760 hours (`fullYearModel(C, Y, { plan })`): cost, CO₂, unserved MWh, hours short by more than 0.05 MW, the largest shortfall (`maxShort`) and `byWeek`, the MWh unserved in each calendar week (31 December counts in week 52). `errors(est, full, cap, ref)` gives the stated measures: `costGap` = full-year cost ÷ the weeks' estimate − 1; `co2Over` = full-year CO₂ ÷ cap − 1; `estErr` = estimate ÷ the full-year optimum − 1 (with `ref`, else null); `served` (under 0.5 MWh unserved) and `co2ok` (within the cap). `yearPeriods(Y)` is the year as one period, for `summarize`.
- **Page kit.** `LX.townPlan.ui` holds `TECH` (names and colours), `fm` (`musd`, `kt`, `pct`, `mwh`, `k`), `Num` (a numeric control in the slider look), `TextTable` (a table of words that becomes cards on phones) and `css()`, now a no-op because the styles are in `planengine.css`. They keep their `lx13-` class names, because both lessons use them.
- **Tests.** `node _tests/learn/test_13-capstone.js [--full]`, `test_12-trade-offs.js`, `test_m03-capacity-expansion.js` and `test_a22-tradeoff-explorer.js` load the component; `test_components_w2_plan.js` tests `link`, `readCheck` and `errors`. Their numbers were identical before and after each move. `_tests/learn/solver_models.js` (the solver benchmark) loads it too.
- **Building on it (M3, A22).** Use `LX.townPlan` for the model and `LX.Frontier` for the frontier chart. Keep MILP duals out (§9.2): this LP's cap dual is a marginal value under its stated assumptions. A different planning model belongs in its own component, not in a fork of this one.

**Week strip** (`weekstrip.js`, `weekstrip.css`; promoted from M3 at the W2 integration): `LX.WeekStrip`, a year's 52 calendar weeks in four rows of 13, each coloured by the representative week that stands for it, with a red dot on each week that is short in a full-year check. It reads the planning engine's objects.

```js
var ws = LX.WeekStrip(host, Y);                      // Y: TP.prepareYear(...); opts: { year } (default: Y's own year)
ws.draw(RW, null);                                   // RW: TP.selectWeeks(...): which week stands for each calendar week
ws.draw(RW, TP.readCheck(C, Y, r, plan).byWeek);     // after a check: a dot on each week short by more than 0.05 MWh
```

- **Colours and letters.** A typical week takes its season's colour (W, Sp, Su, F; numbered, and mixed toward the ink, when a season has several); extremes are outlined in their own colour (P peak demand, N peak net load, C least wind, X cold, still winter). Tokens only; the letters keep colour from being the only cue.
- **Text.** The grid is `role="img"` with a sentence naming each representative week and the weeks it stands for (and, after a check, how many weeks are short). "Text version" holds a table of the 52 weeks: start date, the week standing in, and unserved MWh after a check.
- **Contrast.** Summer is amber (`--lx-warn`), not solar yellow; cells and keys take their colour 86% toward the ink, so each letter in the page colour reads at 4.5:1 day and night (`color()` still returns the token).
- **Pure** (Node: `require("assets/learn/components/weekstrip.js")`; also on `LX.WeekStrip`): `weekName`, `letter`, `color`, `number`, `dateOf`, `yearOf`, `label`, `rows`. Tests: `_tests/learn/test_components_w2_plan.js`. M3 uses it; M13 and C2 can reuse it.

**Stakeholders** (`stakeholders.js`, `stakeholders.css`; e-stakeholders, promoted from A22 and R9 at the W2 integration; F8, F9, F11 and A13 can reuse them): who decides, who pays, who benefits.

```js
var t = LX.Stakeholders(H("div", { class: "lx-xcard" }, x), { title: "Who decides, who pays, who benefits", lede: "One sentence.",
  cols: [{ key: "dec", label: "Decides" }, { key: "pay", label: "Pays" }],
  rows: [{ key: "homes", name: "Households", note: "including low-income homes", cells: { dec: { v: "part", t: "comment at hearings" }, pay: { v: "yes", t: "through bills" } } }],
  note: "Illustrative roles." });              // -> { el, set(rowKey, colKey, text) }   (A22)
LX.StakeholderMap(H("div", { class: "lx-xcard" }, x), { rings: [{ ring: "The study team", items: [{ id: "coauthors", label: "Co-authors", owed: "credit and a say", also: ["A co-author's data"] }] }],
  prompt: "Tap a group to see what your study owes it.", onOpen: function (ringsSeen) {} });   // -> { el, open(id) }   (R9)
```

- **Role table.** A cell's `v` (`yes`, `part`, `no`) draws a filled, half or empty dot beside the word Yes, Partly or No, so colour is never the only cue; `t` adds a line with glossary marks. On phones (640 px) each role becomes a card of labelled lines.
- **Map.** Rings of groups, the first drawn solid; each group is a button (`aria-pressed`) that opens what the study owes it, and where it appears (`also`), in an `aria-live` line. "Text version of the map" lists every group.
- **Pure** (Node: `require("components/stakeholders.js")`; also on `LX.Stakeholders`): `WORD`, `cellText`, `staticHTML` (the role table as a plain table for a no-JS fallback), `mapItems`, `mapStaticHTML(o)` (the map as a plain table for a no-JS fallback: group, ring, what it is owed and where it appears; `staticTitle`, `owedHead` and `alsoHead` name its parts; R9's fallback is this table). Tests: `_tests/learn/test_components_w2_int.js`.

**Form pieces** (`forms.css`, CSS only): `.lx-studio-brief` (the studio's task card, a `div.lx-card` above the interactive and outside its fallback; no page style needed) and `.lx-studio-task` (its task list; the myth cards under a studio's self-check are spaced too), `.lx-case` and `.lx-case-part` (`.wide`) (the case file's numbered parts), `.lx-case-q`, `blockquote.lx-excerpt` with `data-source="excerpt:<key>"` (an approved excerpt, checked by the scope scan), `.lx-case-try` (the Try-it box: its code and text wrap on phones), and the fallback lists `.lx-tl-static`, `.lx-ex-static` and `.lx-rb-static`. Promoted from the three case files at the W2 integration (they keep no page style): `.cf-ctl` with its label `.cf-ctl-l` (a labelled control), `.cf-row` (a row of buttons), `.cf-selects` of `.cf-sel` (two selects side by side, stacked on phones) and `table.cf-two` (a comparison table, `th` per row and `td data-l="…"`, that becomes labelled lines below 560 px). An allow-listed explainer on a Learn page takes the Learn accent as its theme colour (`body.page-learn` sets `--t`, `.page-learn .explainer` the helpers `--t-ink`, `--t-soft`, `--t-line`), so a page needs no `theme-*` body class.

### Added in wave W3 (2026-11-03): sandboxes and capstones

The build bundles these after the W2 set (`W3_JS`, `W3_CSS` in `scripts/build_learn.py`; `sharestate` after `share`, which it uses). Node tests: `_tests/learn/test_components_w3.js` (it also checks the step ids against `STEPS` in `build_learn.py` when `LEARN_BUILD=<path>` is set, or when the script sits at `../scripts/` from the site folder).

**Plan link** (`sharestate.js`, `sharestate.css`; i-share): a sandbox's or capstone's plan kept in the address, compact, versioned and checked on load, with a "Copy plan link" button.

```js
var S = { key: "sb0", version: 2, title: "Site Bench plan",
  fields: [{ id: "site", short: "s", type: "enum", values: ["home", "farm"], names: { home: "Prairie Town home", farm: "Ridge wind farm" }, def: "home", label: "Site" },
           { id: "pv", short: "pv", type: "num", min: 0, max: 20, step: 0.5, def: 6, label: "Solar PV", unit: "kW" },
           { id: "bat", short: "b", type: "int", min: 0, max: 40, def: 10, label: "Battery", unit: "kWh" }],
  check: function (s) { return null; },                                         // a rule across fields: null or a short phrase
  old: [{ version: 1, fields: [/* v1's fields */], note: "Battery sizes are now in kWh.", up: function (s1) { return s2; } }] };
var ss = LX.ShareState(side, { schema: S, onLoad: function (plan, result) { /* a link opened later: refill the controls */ } });
var plan = ss.state;          // the link's plan (ss.result.status "ok" or "migrated") or the defaults
ss.set(plan);                 // on every change: [] when valid (then the address follows, 250 ms later), else the problems
ss.url(); ss.copy(); ss.reset(); side.insertBefore(ss.status, side.firstChild);   // the announcement can sit anywhere
```

- **The hash.** `#sb0-v2-s0-pv6d5-b10`: the key, the version, then each field's short name and value in the schema's order (`d` for a decimal point, a leading `_` for a minus; a choice by its index; a set as a bitmask; an order as its indexes). Letters, digits, `-` and `_` only, so `LX.Share` copies it unchanged. Any other hash (`#explain`, `#lx-demo-mid`) is left alone.
- **No server, no personal data.** The link holds only the numbers and choices the schema declares; there is no free-text type, so nothing a reader types travels in it.
- **Checked on load.** A damaged link, a value out of range or off its step, a part missing, unknown or twice, a bad choice, a link over 1,500 characters or one that breaks the schema's `check` is refused: the page starts from the defaults, says why in the status line (`role="status"`, filled just after mounting) and takes the hash out of the address. A link from a newer version of the page is refused too. A link from an older version with an `old` entry is decoded with that version's fields, brought up through each `up()` and announced with each step's `note`; without an entry it is "old" and refused. Bump `version` whenever a field, a range, a step or a meaning changes.
- **Later links.** A plan link opened in the same tab (the address changes) is applied and passed to `onLoad`; a damaged one keeps the reader's plan and says so. The page's own hash is never applied again.
- **Copy.** Through `LX.Share`: the clipboard, else the link in a field to select. `sync: false` writes the address only when the reader copies.
- **Pure** (Node: `require("components/sharestate.js")`; also on `LX.ShareState`): `defaults`, `validate`, `encode`, `decode` (`status` none, ok, migrated, bad, newer or old, with `state`, `from`, `reason`, `notes`), `message`, `same`, `checkSchema` (a malformed schema throws: keys, short names, types, ranges, defaults, old versions), `fmtValue`, `staticHTML` (the bench's no-JS table: each control, its value and its range).

**Run box** (`benchrun.js`, `benchrun.css`): the Run button, its status line and its failure states.

```js
var stale = H("p", null, resultsHost), res = H("div", { class: "lx-sb-results" }, resultsHost);
var run = LX.BenchRun(side, { label: "Run the year", state: function () { return plan; },
  solve: function (plan, ctx) { return engine.solve(plan, data, { signal: ctx.signal, timeLimit: ctx.attempt > 1 ? 30 : 10 }); },
  render: function (results, plan, r) { /* draw into res and the readouts */ }, results: [res, readouts], stale: stale, busy: api && api.busy,
  words: { ok: "Done: the cheapest way to run this plan over the year (the solver reports optimal)." } });
run.changed(plan);            // on every change of the plan: the drawn results are marked as an earlier plan's
run.run(plan);                // also from a preset or the demo hook; run.last(), run.cancel(), run.running()
```

- **One run at a time.** A new run aborts the one before (its `AbortSignal`) and a late answer from it is ignored.
- **While it runs.** The button reads "Running…" and is `aria-disabled` (not `disabled`, which would drop the keyboard focus of a reader who pressed it; presses are ignored), every results area is `aria-busy`, and `busy(true)` is called (pass a step card's `api.busy` to hold Next).
- **After it.** The status line says what happened, in words. "Optimal" appears only for status optimal, with a MILP's gap; a time limit or another early stop never says best (with `partial: true` a plan kept by an early stop is drawn as "the best found so far, not proven best"). An infeasible plan adds the engine's `hint`. A rejected or throwing solve, or a render that throws, is a failed run. Every outcome but a solved one offers "Try again", which re-runs the same plan with `attempt` 2, 3, ... so the engine can raise its time limit. The busy state is always released, and results already drawn stay, marked "for an earlier plan" (or "from your last run that finished") in the `stale` line; in every `results` area (pass readouts beside the controls too) only the graphics (an SVG's shapes, `canvas`) dim while stale or busy, so text, chart labels included, keeps its 4.5:1 contrast (W3 layout audit).
- **Pure:** `classify(r, words, partial)` → `{ kind, draw, retry, text }` (also on `LX.BenchRun`).

**Report template** (`reportnote.js`, `reportnote.css`): the reader's plan and results as a one-page note, with the deliverable's checks.

```js
var rn = LX.ReportNote(H("div", { class: "lx-xcard" }, noteHost), { id: "c0-note", code: "C0", title: "Your one-page note",
  fields: [{ key: "recommend", label: "Recommendation", hint: "Two sentences: what to install, and why.", rows: 3, need: true, at: "top", min: 8 },
           { key: "alone", label: "What the site cannot do alone", rows: 2, need: true }],
  get: function () { var last = run.last(); if (!last) return null;
    var n = engine.note(last.state, last.r.results);                    // heading, made, plan, results, assumptions, sensitivity, limits
    n.link = ss.url(); n.run = { ok: true, stale: !LX.ShareState.same(S, last.state, plan), text: "one year, hour by hour" };
    return n; } });
rn.refresh();                 // after each run (and when the plan changes, so the stale warning shows)
```

- **The note.** A title (code and heading), the plan link, "Made with … on <date>" and what the results cover; the reader's top fields; the plan and the results (tables in Markdown, lines in text); the assumptions, one sentence each; the sensitivity line (from `{ metric, input, held, base: { at, value }, cases: [...] }`, or a sentence), with its table in Markdown; the reader's other fields; the limits; a footer saying it is a teaching model with illustrative assumptions. When the results are stale or not from a finished run, the note carries a warning line.
- **Copy.** "Copy as text" and "Copy as Markdown": the clipboard, else the text in a box to select, and the line says which. Nothing is saved or sent: the privacy line says the note is built in the page, the reader's words stay in this browser (under `id`) and are not part of the plan link. No string in the component claims otherwise (`CLAIMS`, tested).
- **Checks** (the deliverable's "done when"; they never block copying): a plan link, results from a finished run of this plan, each `need` field in the reader's words (at least `min` words, 5 by default, and no "[…]" placeholder), the assumptions, a sensitivity line, and one page (at most 550 words). A page can pass its own `{ id, label, test(note, words) }`.
- **Pure:** `compose(note, words, fields, { format: "text" | "md", date, code })`, `html` (the preview, all text escaped; the link as text, not a link), `outlineHTML(fields)` (the no-JS fallback: the note's headings in order with what goes under each), `sensitivityLine`, `checks`, `headText`, `countWords`, `PAGE_WORDS`, `CLAIMS`, `FOOTER` (also on `LX.ReportNote`).

**Engine E0** (`engine-e0.js`, `engine-e0.css`; `LX.E0`; data `data/e0.json`): one site behind one meter, sized and run hour by hour as a linear program (curriculum v2 §16.4). Used by the Site Bench (SB0) and capstone C0. Lesson A8 keeps its own week LP (`a08-storage-duration.js`): least unserved energy on the Plains Grid with firm output, four stores each with its own round trip and standing loss, starting the week full; E0 prices one site's bill with cyclic storage, one 85% round trip and no unserved energy, so A8 on E0 would need a second model inside the engine. Two fictional sites: the Prairie Town home (household use and a heating need, illustrative; rooftop solar, a battery, a heat pump, flat or time-of-use tariff, an export credit) and the ridge wind farm (wind, a sell-only line, a 4-hour battery, an electrolyzer, a hydrogen tank, a buyer with a set price and hourly take). Every cost is in 2025 dollars, converted in `costs()` with EIA's GDP price index.

```js
var P = LX.E0.prepare(D, town_year, cf_targets);          // once per page: the sites' 8,760 hours and representative weeks
var s = LX.E0.withPreset(LX.E0.defaults(), LX.E0.presets[1]);  // a plan: the fields of LX.E0.schema (an LX.ShareState schema)
LX.E0.solve(s, P, { signal: ac.signal, timeLimit: 10 })    // Promise, never rejects:
  .then(function (r) { /* { status, ok, message, hint, results, raw, ms }; results = LX.E0.summarize(s, r.raw) */ });
LX.E0.solve(s, P, { size: true })                          // "Size it for me": r.results.sizes, r.results.snapped (to the steps)
LX.E0.sensitivity(s, P, r, { signal })                     // Promise of { base, rows } for LX.Tornado (the equipment held fixed)
LX.E0.sensWords(s, sens)                                   // { line: every bar in one paragraph (a note's sensitivity), note: the chart's note }
LX.E0.note(s, r.results)                                   // the LX.ReportNote input (heading, plan, results with their notes, assumptions, limits)
var B = LX.E0.ui.bench(live, { P: P, resultsHost: el, schema: LX.E0.schemaFor("c0"), onDone: fn, onDraw: fn });   // the page kit
```

- **Time.** A run is the 52 calendar weeks of 2025 and 31 December, one small LP each (53 solves through `LX.solver`), with storage cyclic inside each period: every hour of the year once. `{ full: true }` is one LP on all 8,760 hours with storage cyclic over the year (the test's check; too slow for phones); `{ size: true }` sizes on representative weeks (one medoid per season plus extremes), then the page runs the snapped plan through the 53 periods.
- **Pure, for Node** (`require("components/engine-e0.js")`): `build(P, s, { periods | mode, size })` (the model for `LX.solver`), `read` / `start`, `add`, `finish` (a solved model's flows), `summarize` (every number a page shows: readouts, flows, money with the year-by-year cash flow, CO₂, the 52 weeks' series), `cashflow`, `costs`, `usd`, `crf`, `weeks`, `periods`, `snap`, `sensRows`, `recost`, `sensWords`, `split`, `stores`, `captions`, `heading`, `planRows`, and the no-JS builders `fallback(D)` (from `D.reference`, written by the SB0 test), `resultsHTML`, `inputsHTML(D, P)`, `sourcesHTML(D)`, `checkHTML(check)`.
- **Tie rule.** A wear charge on battery charge and discharge, and on the farm a hair's preference for selling earlier in the week; both are left out of the reported numbers. The SB0 test checks that each reported total, own solar's share and the spilled share are the same on the whole optimal face. With storage, hourly schedules still tie: the hours at the grid, the line or the buyer's limit, the busiest grid hour and the hourly chart then carry `LX.E0.SCHED` ("on the schedule shown"); `stores(s)` says when.
- **Changes after the Codex review (2026-11-03; the API is unchanged, these are additions or corrections).**
  - `split(site, S, h)`: one hour followed by a stated rule (home: solar serves the home first, then the battery, then the grid; the battery serves the home; the grid the rest, then the battery; farm: the battery's output is sold first). The week chart draws the home's use by source under its line and charging and power sent back above it (the farm: where the wind went under the line, the battery's output above it), so the bars no longer overshoot the line when the grid charges the battery.
  - Own solar's share (`tot.selfShare`, the "Own solar covers" tile) = (solar used at once + 85% of the solar stored) ÷ the home's use: never negative (it was 1 − bought ÷ use, −4% for a battery charged from the grid). The week strip shades the share not from own solar.
  - CO₂: the home's tile is bought power and gas (`co2.plan`, never negative); power sent back is a separate credit (`co2.credit`) and `co2.net` is labelled as a net. The farm gains a "Potential CO₂ avoided" tile (it leaves out the grid power the electrolyzer's MWh no longer replace). `note()` keeps every readout's note, so these boundaries reach the copied note.
  - Sensitivity: the farm's equipment cost is re-run when it has an electrolyzer (its stack wear is a share of the cost per MWh); `recost()` prices the farm's wear and revenue again. The farm's line row is "Line limit (cost not counted)", a connection-limit scenario (`limit: true`). Every case not re-run equals a fresh solve (SB0 test).
  - A week that stops says why and where ("The run reached its time limit in the week of …, so no new result is shown"); a rejected solve names its week.
  - The view: "Size it for me" writes sizes only onto the plan it sized (a change of plan while it runs stops it; "Try again" on a plan no longer on the controls stops at once); hints for the export credit, the rate, the tariff, the heat pumps (seasonal COP) and the power contract; the cash flow's key as short lines (`captions()`); `num()` writes a minus sign.
  - Stack wear is labelled an illustrative throughput allowance based on DOE's hours-based replacement; the solar and wind profiles are labelled SPP's hourly patterns reshaped to EIA's capacity factors.
- **Units inside the LP.** Home costs in cents, farm costs in thousands of dollars and hydrogen in tonnes (for HiGHS's speed); `read()` converts back.
- **Tests and bench.** `_tests/learn/test_sb0-site-bench.js` (identities, closed forms, the 52-week run against one full-year LP, ties, sizing, failure states, the plan link) and `_tests/learn/test_c0-behind-one-meter.js`; `scripts/learn_solver_bench.mjs` times `e0wk*`, `e0size*` and whole runs `e0run-*` on the page path.

**Form pieces** (`forms.css`, W3 part): `.lx-sb-brief`, `.lx-sb-facts`, `.lx-cap-brief`, the bench frame `.lx-sb` (`.lx-sb-controls`, `.lx-sb-group`, `.lx-sb-side`, `.lx-sb-presets`), the results `.lx-sb-results`, `.lx-sb-charts` (`.two` for two charts side by side from 960 px) and `.lx-sb-chart` (no overflow clipping, so chart tips and popovers stay visible), and `.lx-sb-static` for the no-JS tables.

**Engine E1** (`engine-e1.js`, `engine-e1.css`; LX.E1; builder learn-w3-h): a campus microgrid sized and run through outage scenarios with a small mixed-integer program, with the host feeder's import and export limits and three owners. Used by the Microgrid Workbench (SB1), capstone C1 and Modeler lesson M5. Data: `data/e1-prairie-campus.json` (written by `scripts/build_learn_e1_data.mjs`; lesson F7's Prairie Campus, real 2025 SPP solar per kW of panels by F7's method, EIA's tariff level, diesel price and CO₂ factors, illustrative costs in 2025 dollars, the outage scenarios, the seeded winter outages, the precomputed no-JS runs and M5's notebook reference).

```js
var P = LX.E1.prepare(data.e1_prairie_campus);                        // scenarios with their sun, the seeded outages
var S = LX.E1.schema;                                                // the plan (LX.ShareState): sizes, priorities, outages, limits, tariff, owner
LX.E1.solve(plan, P, { task: "run" | "size", check: false, scenarios, signal, timeLimit, attempt, solver })
  // -> Promise of { status, ok, kind: "milp", message, hint, results, mipGap, ms }; never rejects
var B = LX.E1.Bench(live, { P, slug, resultsHost, schema, hide: { out, allow, owner }, scenarios(plan, task), draw(host, R, plan, r, sizeNote), solver(task) });
LX.E1.Results(host, R, { P, sizeNote });  LX.E1.HourChart(host, P, R, outage);  LX.E1.Line(host, { P, plan, editable, island });
```

- **Two models.** *Run* (sizes fixed): an LP for the grid-connected year (12 average days, one per month, weighted by its days), then one MILP per outage as an island: whole 200 kW sets on per hour, each at 30% to 100%, 0.07 gallons per kWh within the diesel on site, every load partly servable; the objective is a priority order (unserved kWh weigh 1,000, 10, 1 for must stay on, keep if possible, shed first), not money. *Size*: one MILP picks solar, battery and whole sets at the least annual cost (capital recovery at the owner's rate, upkeep, the tank, the year's bill) with every must-stay-on load served in every chosen outage; it leaves out the 30% minimum, the sizes are rounded up to the bench's steps and *Run* checks them. `check: false` returns the sizes only (the bench then runs them through BenchRun, so its stale marks stay right).
- **No prices** (§9.2): the engine never reads a dual; "what a resource is worth" is the difference of two solved plans, said so on the page.
- **Statuses.** `ok` only when every solve of a run is optimal (sizing gap 1e-6, `mip_rel_gap`); a time limit returns the best plan found with status `time-limit`, its gap and "not proven optimal" (BenchRun with `partial: true` draws it); an infeasible sizing returns a `hint`. Attempt 1 gives each solve 3 s, a retry 10 s.
- **Tie rule.** The check adds a 0.5% step between loads of one priority (the list order), up to 2% for earlier hours, 0.01 per gallon and 0.0001 per kWh through the battery; the year LP $0.0001 per kWh through the battery. The pages report totals these fix (unserved kWh per load, gallons, the bill); the hourly schedule drawn is one of possibly several. `test_e1-engine.js` re-solves with other tie weights.
- **Also pure:** `bb` (branch and bound on the sizing model's whole numbers, M2's rules: a node whose LP fails stays unresolved and the tree is then not proven), `roll` (the rolling horizon: re-plan every 6 hours on a forecast, balance each real hour with `realTime`), `forecast`, `seeded` (mulberry32, seed 7), `lengths` (one storm cut or stretched), `costs`, `crf`, `note`, `fallback(P, "sb1" | "c1")`.
- **Bench** (`node scripts/learn_solver_bench.mjs --site <wt> --set lessons --only e1size,e1size3,e1year,e1out,e1outf7,e1run-default,e1run-size`; Apple M5, 3 Nov 2026, 20 runs, p95 at 1×, 4× and 6× CPU slowdown, in ms): sizing MILP for the storm (2,163 × 2,233, one integer) 142, 378, 572; for three outages with 650 kW that must stay on (2,739 × 2,907) 138, 499, 767; the year LP 10, 25, 47; the outage check MILP (720 × 289, 72 integers) 10 to 37, 37 to 100, 55 to 152. Whole page runs (10 runs; several solves each): Run the outages with three outages 111, 306, 499; Size it 139, 376, 584. All within the 3 s phone budget; each solve has a 3 s time limit (10 s on Try again).

### Promoted at the W3 integration (2026-11-03)

Promoted only where two pages or more had the same thing; each page keeps its own class on what it draws, so its tests and the layout audit find it as before.

**Ledger** (`ledger.js`, `ledger.css`; from A4's tariff ledger, A7's earnings and trade ledgers and A14's microgrid ledger): `LX.Ledger`, a "who pays, who earns" table. One row per customer, party, device or line, a column per amount; the row header can carry a small second line; numbers in tabular figures; an optional total row. It is the two-sided table of `forms.css` (`table.cf-two`), so on a phone each row becomes a card and each cell is labelled by its column (`data-l`).

```js
LX.Ledger(host, { caption: "Bill minus the cost of serving each customer, a month.", columns: ["Customer", "Flat", "Time-of-use"],
  rows: [{ head: "Renter", sub: "cost $61.20", cells: ["+$4.10 above", { text: "−$2.00 below", cls: "down" }] },
         { head: "= Net", cells: ["", "+$2.10"], total: true }], cls: "a4-led" });   // returns the table (in a div.lx-scroll-x)
```

- Every text is set as text. A cell is a string or `{ text, cls, l }` (`l`: its own phone label). On a phone an empty cell (a total row's blank column) is left out of the card.
- A4 (`a4-led`), A7 (`a7-led`, two tables) and A14 (`a14-ledger`, a total row; its "Who" column in body type, `td.who`) use it. Tests: `_tests/learn/test_components_w3_int.js`.

**Solver step** (`solvestep.js`, `solvestep.css`; from M3, A8 and M4, which had the same code): `LX.SolveStep`, a step card's solver action and its failure note (W2 review finding 3). The step disables its own button, shows its `LX.SolverStatus` and holds the page's busy state (so Next waits); a failed solve, a time limit or a solver that would not load gets a plain message with "Try again", the busy state cleared and the results already solved kept.

```js
var go = LX.SolveStep.action({ api: api, st: LX.SolverStatus(row), host: act, go: button, job: function () { return solveAll(); },   // job may resolve to the failed result
  failed: function () { return firstFail(); },   // optional (M3's form): the first failed result, read after job()
  show: function () { draw(); }, cls: "a8-fail", kept: " Results already solved are kept." });
button.addEventListener("click", go);           // "Try again" calls the same function
LX.SolveStep.failNote(host, r, again, { cls, kept });   // the note alone (role="alert")
```

- Not `LX.BenchRun`: a sandbox's run box owns its Run button and status line, never disables them, and marks drawn results stale when the plan changes; a step card keeps its own button, its SolverStatus and Next. The note keeps each page's class (`m3-fail`, `a8-fail`, `m4-fail`) and M3 its own last sentence.

**Seeded generator** (`core.js`; from M7 and engine E1, which each had a copy): `LX.mulberry32(seed)` returns a function giving numbers in [0, 1); the same seed gives the same numbers on every page, in Node (`require("components/core.js").mulberry32`) and in the notebooks' Python ports (M5, M7). M7's `rng` and E1's seeded outages call it; their numbers are unchanged. `_tests/learn/stubdom.js` sets it on its stub `LX`.

**Sankey** (`sankey.js`, `sankey.css`; i-sankey, e-sankey; from F3, whose script F4 loaded for it): `LX.Sankey`, energy flows as bands whose width keeps the value, one scale for the whole drawing. The code is F3's, unchanged; its styles, which F3 injected, are now `sankey.css`, and F4 no longer loads F3's script.

```js
var sk = LX.Sankey(host, { label: "A year of energy in the home, in kWh", unit: "kWh", fmt: fmtK, height: 300, heightN: 340, onPick: fn });
sk.set({ nodes: [{ id: "gas", label: "Gas", col: 0 }, { id: "heat", label: "Space heat", col: 1 }, { id: "lost", label: "Lost", col: 2, kind: "loss" }],
         links: [{ from: "gas", to: "heat", value: 9000 }, { from: "heat", to: "lost", value: 1500 }] });   // tweens from the last spec
```

- Nodes are buttons (Tab, Enter, Space): picking one dims the other flows and says what flows in and out (`aria-live`); a "loss" node is pale and hatched. Labels sit right of their bars, with a reserved right margin for the last column; under 560 px with three or more columns each node gets a numbered badge and a key. Redraws at its width on resize; no tween under reduced motion. A text version lists every flow.
- **Pure** (Node: `require("assets/learn/components/sankey.js")`; also `LX.Sankey.layout`, `.band`, `.flows`): `layout(spec, W, H, { nodeW, gap })`, `band(x0, sy, x1, ty, w)`, `flows(spec)`. F3's model keeps them as `.sankey`. Tests: `_tests/learn/test_f03-energy-services.js` (layout), `test_f04-power-plants.js` (every plant's 100 units balance), `test_components_w3_int.js`. F9 and F10 can reuse it.

**Kept lesson-local, and why** (promote when a second page needs the same thing):

- M7's seeded Latin hypercube (strata, the repeat error and its tie rule) and its rank-correlation bars: only M7 samples or ranks inputs.
- A1's cash-flow steps (i-cashflow): they build one project's flows by hand, step by step, on `LX.Plot`. Engine E0 (SB0, C0) has its own cash flow (replacements, residual value, a discounted running total) and chart; the two models differ.
- A2's Monte Carlo histogram (i-montecarlo) and M7's: both on `LX.Plot`, but A2 clamps 200 price years into $0.25M bins with P10, median and P90 readouts and a no-contract band, and M7 counts in-range runs in $5M bins with a shaded tail and a static SVG. One component would have to carry both; the shared part is the type-7 percentile (also K5's), three lines each.
- F7's `CampusLine` and E1's `E1.Line`: the same campus, two jobs. F7's is an SVG explainer (the storm, the switch, which source forms the island, lit wires, numbered parts for the explain layer); `E1.Line` is an HTML control panel (the plan's sizes, a priority per load, the feeder's limits). They share the campus data (E1's data builder reads F7's), not code.
- M5's `TreeView` and M2's: M2 draws its own engine's nodes (switches fixed, inherited bounds, a grid layout, marks for best and pruned); M5 draws `E1.bb`'s nodes (whole sets ≥ or ≤, a halving layout, a reading panel). A shared tree would take both node schemas and layouts.
- A8's week LP stays off engine E0 (see Engine E0 above).
- F4's `PlantExplorer` (six plant cutaways), F5's `PlantDiagram` (fuel to steam) and `HeatLadder` (outlet temperature against uses), F6's `GridNet` (the east side's one-line diagram with hazards) and `VoltPath` (the voltage staircase): each is drawn by one page only.

**Scope and QA** (ResearchPortfolio folder).

- `python3 scripts/learn_scope_scan.py --site <worktree>` runs the curriculum v2 §20 scan on the rendered `_site/learn/` pages, the data files and the scripts. `build_learn.py --check` runs it whenever a rendered site exists, and fails on any violation.
- `scripts/learn_qa.sh <worktree> [lesson ids]` runs the whole pipeline: build check, Node tests, render, link check, scope scan, and screenshots at 1280 and 375 px in light and dark. A case file that is still a draft is named by its id like any page: the script copies `learn/_drafts/<id>.qmd` to `learn/<id>.qmd`, renders that one page into `_site/`, and moves the copy out of the worktree into its output folder, so the link check, scope scan and screenshots see a preview while the worktree stays unchanged.
- `scripts/learn_codex_review.sh <worktree> <lesson id>…` runs the read-only two-persona review.

Every diagram ships a "Text version" and keyboard focus. Use colours from tokens only (`--lx-*` in `base.css`); day and night both work. Animations stop under `prefers-reduced-motion`. Inline `code` takes the tokens by itself (`base.css`, at zero specificity, so a page's own code rule still wins): a page needs no night-theme override for it.

## Checks before handing a lesson to Henry

Run:

```
python3 scripts/build_learn.py --site <site> --check
node _tests/learn/test_<id>.js
node _tests/learn/test_learn_components.js
python3 scripts/check_site.py
```

Or all of it at once: `scripts/learn_qa.sh <worktree> <lesson id>`.

Then render, and take screenshots at 1280 and 375 px, in light and dark, with `scripts/learn_screenshots.mjs`. Look at them. Finally, check that there is no horizontal scroll at 375 px; the screenshot tool prints the overflow.
