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
- `LX.demo(root, fn, cards)`: the lesson's demo states, for screenshots and curious readers. `fn(state)` puts the page into a
  state and returns `{view}` when it handled it, or `null`. Every lesson accepts `"mid"` (one interaction done) and
  `"step-N"` (step card N open, its action done where the lesson knows how; with `cards`, an unhandled `step-N` simply
  opens the card, clamped to the number of cards) and may add its own names (`band`, `milp`, ...). `window.lxDemo(state)`
  runs it, and so do `?demo=<state>`, `#lx-demo-<state>`, `#lx-demo-<N>` or `#lx-step-<N>` (step N) and `#lx-demo` ("mid").
  `scripts/learn_screenshots.mjs --states mid,step-3,band` uses it for any lesson.
- Technology colours beyond lesson 0's fleet: `--lx-bat` (battery storage), `--lx-hyd` (hydro), `--lx-geo` (geothermal),
  `--lx-dr` (demand response), day and night; icons `atom`, `flame`, `drop`, `geo`, `dial` in `LX.IC`.

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
- **Benchmark.** `node scripts/learn_solver_bench.mjs --site <worktree> [--only t13week,t13full] [--runs 20]` (ResearchPortfolio folder) times, in headless Chrome, the generic W1 set (24-hour dispatch LP, 168-hour storage LP, 24-hour unit-commitment MILP from `_tests/learn/solver_models.js`) and the lesson instances built by the lessons' own models (`lessonSet`: T11's day LP, M1's congested three-bus day, T13's seven-week planning LP at 200 kt and its full-year check, B3's four-hour dispatch), with CPU slowed 4× and 6× as a phone stand-in (the slowed runs solve on the throttled page thread, a pessimistic stand-in). It also checks the page API (duals, conditional prices, time limit, cancel). On an Apple M5 (2 Nov 2026) the p95 solve times were: T11 1.5 ms (4×: 7.9 ms, 6×: 9.5 ms); M1 3.1 ms (9.8, 10.1); T13 seven-week optimizer, 5,953 columns × 8,389 rows, 436 ms (2,216, 2,386); T13 full-year check, 52,560 × 17,520, 294 ms (909, 1,417); the generic set at most 24 ms (100 ms at 6×). The W1 budget is 1 s on a laptop and 3 s on phones; T13's optimizer is the closest to it. Run the large T13 models with `--only` and fewer runs (a combined 20-run pass over every model at 4× did not finish within 25 minutes). Real devices still need to be measured for the W1 report.
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
- Marks: `kind: "ring"` (default: hollow, bold label beside), `"dot"` (filled, centred label; `pos`), `n: "1"` (a numbered disc), `vline: true`.
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
- `LX.CostSplit.text` writes the parts as a sentence for text versions and spoken labels (`words` names a part inside a sentence).
- Replaces lesson 7's `lx7-split` rows, `bar()`, `key()` and `splitText()` (steps 2 and 6), and its single bars (steps 3 and 4).

**Supply stack** (`supplystack.js`): one hour's offers as blocks as wide as their MW and as high as their price, cheapest first, with the demand line, the clearing price, the marginal block outlined, the unused or spilled part pale, and negative offers below zero.

```js
var ch = LX.SupplyStack(host, { series: { wind: { name: "Wind farm", short: "Wind", color: "var(--lx-wind)" }, ... }, clear: model.clear });
var res = ch.draw(blocks /* [{key, mw, offer}], cheapest first */, demandMW, { xMax: 750, hideDemand: false });
```

- `clear` is the lesson's market clearing; the default (`LX.SupplyStack.clear`) is uniform price, cheapest first, the lower block marginal at an edge.
- The legend and text version follow the step's controls (`later: false` puts them right under the chart); `noLegend: true` hides the legend.
- Replaces lesson 8's `StackChart` (steps 1 to 7). Candidates: A3, M1.

**Cost and CO₂ frontier** (`frontier.js`): the cheapest plan at each CO₂ level as a line over an "out of reach (approximately)" shade (straight lines join the solved points), labelled plan dots, and an equal-score line for a carbon price.

```js
var fc = LX.Frontier(host, { label: "Six plans for Prairie Town, cost against CO₂" });
fc.frontier([{ co2, cost, cap, solved }], "Frontier you traced");   // co2 in t, cost in $ (axes in kt and $M)
fc.plans([{ id: "A", label, co2, cost, color, kind: "plan" | "you" | ..., mark: "dominated" | "never", ring, legend, note }]);
fc.price(44, { co2, cost });   fc.pick(function (id) {});   fc.focusDot("A");
```

- `pick` makes the plan dots buttons (Tab, Enter, Space). Axis texts, scales and labels have options (`xMax`, `yMin`, `xLabel`, `fmtX`, ...).
- Replaces lesson 13's `FrontierChart`, which lesson 12 read as `LX.townPlan.ui.FrontierChart` (gone from `ui`).

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
- A rule without a style shapes the region and draws no line (x ≥ 0, y ≥ 0). Rule labels in `render()`: `place` "start", "top", "end" or "foot".
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

- A "partly" cell accepts either answer. Keep a fourth bin, Given (data), next to Decisions, Goal and Rules.
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
- Phrases are inline spans with button semantics (Tab, Enter, Space), so long phrases wrap with their sentence; chips carry a number badge, so colour is never the only cue.
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
- Pure (Node: `require("components/checkpoint.js")`): `task`, `checkChoice`, `checkOrder`, `checkNumeric`, `checkEstimate`, `level`, `summary(D, st, env, {code})`, `fmtMs`, `firstWord`. `checks`, `level` and `summary` options replace them for a checkpoint with other units or another rule.
- Replaces the runner in `ck-f-estimate.js`, which now holds only CK-F's configuration, its two charts, `worked()` and the mount.

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
