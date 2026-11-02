# Learn component library

Every Learn page is built from these parts and nothing else. Pages load two files:

- `assets/learn/learn.css` (via `css:` in the front matter);
- `assets/learn/learn.js` (a `<script defer>` at the end of the page).

Both are **generated**: `scripts/build_learn.py` joins `components/*.js` and `components/*.css`. Edit the components, never the bundle.

## Start a new lesson

1. Add the lesson to `learn/path.yml`: `id`, `starter`, `tier`, `form: cards` (or `play` for a capstone), `icon`, `title`, `subtitle`, `short`, `minutes`, `does`, `outcome`, `after`. The lesson goes live (linked, with its generated header, next box and footer) when you set `status: active`; its page is then `learn/<id>.qmd` (or the file named by `path:`). Until then keep `status: upcoming`, or leave the status out: it shows as coming soon.
   - Lessons off the starter path (N1, B1–B3, M1, CK-F, toolbox K4 and K7) are already listed with their `code` and `id`. They take prerequisites as starter numbers or codes (`after: [10, K4]`) and name what follows (`next: B2`). `form: checkpoint` gives a checkpoint page the steps Task, Worked solution, Rubric and Sources.
   - New glossary terms and requests for shared files go in a sidecar, `learn/_w1/<id>.yml` (wave W1):

     ```yaml
     glossary:
       - term: capacity factor
         def: "One plain sentence."
     requests:
       - "Plain text for the coordinator."
     ```

     `build_learn.py` merges the terms into `glossary.json` (if an id is already in `glossary.yml`, that definition wins and the clash is printed) and prints every request.
2. Copy `learn/_template-cards.qmd` (or `_template-play.qmd`) to `learn/<id>.qmd`. Write `assets/learn/<id>.js` from the skeleton below, with a pure model exported for Node.
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
var s = LX.Slider(host, {label, color: "var(--lx-cc)", max: 150, step: 5, hint: fn(lo, hi, max), onChange});
s.range(lo, hi);  s.set(v);  s.val();
```

**Step cards** (`cards.js`)

```js
LX.StepCards(host, { steps: [{ text: "One or two sentences.", build: function (act, api) { /* controls in act */ api.done(); api.saw("What you saw."); } }] });
```

"Next" waits for `api.done()`. Use `free: true` for a card without an action.

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

**Go deeper** (`deeper.css`): CSS only.

```html
<details class="lx-deeper"><summary><span class="k">Go deeper · Modeler</span>Title</summary>
  <div class="lx-deeper-body">…</div></details>
```

In a `.qmd`, open and close these tags in raw HTML blocks and write Markdown and math between them.

**Glossary tooltip** (`glossary.js`): automatic for every `.lx-term[data-term]`, including terms added later by JS. Definitions come from `learn/glossary.yml`.

**Concept map** (`conceptmap.js`)

```js
LX.ConceptMap(host, {title, lede, groups: {k: [name, color]}, nodes: [{id, g, label, lines, text, game, at: [c, r], atN, later}],
  edges: [[from, to, label]], cols, rows, colsN, rowsN, sel, moment: fn(id)});
```

**Flowchart** (`flowchart.js`)

```js
LX.Flowchart(host, {title, lede, nodes: {k: {t, tN, s, sN, k: "q"|"end"}}, at, atN, cols, colsN,
  edges: [[a, b, label, {v, d, dN, l, lN}]], traces: [{label, path: [...], text}], sel});
```

Routing is automatic; give a hand-made path only for a crossing.

**Comparison table** (`table.js`)

```js
LX.CompareTable(host, {title, columns: [{key, label, main, num, bar, phoneHide}], rows: [...], sorts: [{label, order, ranked, note}]});
```

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
- It supports any number of tiers: give each tier a colour `slot` 1–5. Four tiers now; Researcher has `status: upcoming` (a dashed door and line, "coming later").
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
- **MILP.** A MILP returns `duals: null`: a mixed-integer program has no shadow prices. For prices after a commitment, call `fixAndReprice`; label them *conditional on the commitment*, and say that start-up and no-load costs need uplift payments.
- **Errors.** It never throws for a bad model: `status: "error"` with a `message` (unknown or repeated names, a constraint without a bound).
- **Benchmark.** `node scripts/learn_solver_bench.mjs --site <worktree>` (ResearchPortfolio folder) times the W1 set in headless Chrome (24-hour dispatch LP, 168-hour storage LP, 24-hour unit-commitment MILP, from `_tests/learn/solver_models.js`), with CPU slowed 4× and 6× as a phone stand-in. It also checks the page API (duals, conditional prices, time limit, cancel). On an Apple M5 (2 Nov 2026) the worst p95 was 24 ms at full speed and 100 ms at 6× slowdown; the W1 budget is 1 s on a laptop and 3 s on phones. Real devices still need to be measured for the W1 report.
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
- Say on the page which method a lesson uses. Lesson 0 keeps its single real day scaled to farm size, labelled as such.

**Scope and QA** (ResearchPortfolio folder).

- `python3 scripts/learn_scope_scan.py --site <worktree>` runs the curriculum v2 §20 scan on the rendered `_site/learn/` pages, the data files and the scripts. `build_learn.py --check` runs it whenever a rendered site exists, and fails on any violation.
- `scripts/learn_qa.sh <worktree> [lesson ids]` runs the whole pipeline: build check, Node tests, render, link check, scope scan, and screenshots at 1280 and 375 px in light and dark.
- `scripts/learn_codex_review.sh <worktree> <lesson id>…` runs the read-only two-persona review.

Every diagram ships a "Text version" and keyboard focus. Use colours from tokens only (`--lx-*` in `base.css`); day and night both work. Animations stop under `prefers-reduced-motion`.

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
