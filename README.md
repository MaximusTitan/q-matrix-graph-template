# q-matrix-graph-template

> A 3D knowledge-graph viewer for a Q-Matrix curriculum export — pairs with
> [q-matrix-agents](https://github.com/MaximusTitan/q-matrix-agents) and your own clone of
> [q-matrix-kb-template](https://github.com/MaximusTitan/q-matrix-kb-template).

This repo is the **viewer**, not the data. It renders concepts, wired together by
prerequisite links, stacked into one layer per grade so a curriculum reads top to bottom —
whatever curriculum you point it at.

**This repo ships with no real curriculum data.** `public/graph/` contains placeholder
JSON with the right shape and zero content — a fresh clone runs and shows a clear "no
data yet" screen instead of a graph. The data comes from **your own** knowledge base via
`scripts/export_graph.py`, which lives in
[q-matrix-agents](https://github.com/MaximusTitan/q-matrix-agents), not in this repo — see
[Updating the data](#updating-the-data).

**No backend.** The site is a static export over three JSON files — deployable to Vercel,
Netlify, Cloudflare Pages or GitHub Pages with nothing running server-side.

## Open source, and meant to be forked

This is a **template**, and forking it is the point. Clone it, point it at your own
curriculum, restyle it, rip out the parts you don't want — it's yours to build a graph
viewer from. Everything here is Apache-2.0 (see [LICENSE](LICENSE)), so use it in personal,
academic or commercial work freely.

**We're not taking pull requests on this repo right now.** Not because contributions aren't
welcome — they genuinely are — but because a template is most useful when downstream forks
diverge rather than converge, and we'd rather you shape your copy than negotiate ours. Issues
and questions are fine; if you find something plainly broken, opening an issue is the fastest
way to get it fixed here.

If you'd like to contribute to the Q-Matrix project itself, the open repo is
**[q-matrix-dataset](https://github.com/MaximusTitan/q-matrix-dataset)** — that's where
curriculum data lands and where contributions are actively wanted. See
[Related](#related) for the rest of the family.

## Paper

This repo implements the visualization tooling described in *Curriculum Brain: A Semi-Automated Framework for Q-Matrix Creation* — [read the draft](https://prickly-gopher-95e.notion.site/Curriculum-Brain-3a3527ed7aee80cc97f7ee52e302249e).

## Quick start

```bash
npm install
npm run dev            # http://localhost:3000
```

With the placeholder data in place, this shows the empty state. To see your own
curriculum, populate `public/graph/` first — see [Updating the data](#updating-the-data).

The full set of scripts, all of them from `package.json`:

```bash
npm run dev            # next dev
npm run build          # static export -> out/
npm run serve:out      # serve out/ via npx serve, no backend
npm run typecheck      # tsc --noEmit
npm run lint           # eslint
npm run sync:graph     # regenerate public/graph/ from your KB (see below)
```

There is no test suite in this repo.

## The three files

| File | Loaded | Contents |
|---|---|---|
| `graph-core.json` | on page load | nodes and links — everything needed to draw a frame |
| `concept-details.json` | on first node click | skills and prerequisite rationales |
| `meta.json` | on page load | provenance, inventory, integrity report |

The two data files are **joined by node id**, and the split is purely by access pattern.
`graph-core.json` holds what every frame needs; `concept-details.json` holds the prose,
which is most of the bytes and none of the pixels — so it is fetched only when a concept is
actually opened, then memoised.

The relationship the exporter emits is 1:1 in both directions:

```
graph-core.nodes[i].id  ─────────▶  concept-details.details[id]
                                      ├── skills:  [ "…", "…" ]
                                      └── prereqs: [ { from, level, reason, derived } ]
                                                        │
graph-core.links[j] {s, t, l}  ◀──────────────────────┘
```

Every node has a detail entry, and each `prereqs` entry corresponds to exactly one link —
`prereqs[k].from` is the link's `s`, the detail's own key is the `t`, and `level` is the
`l`. So `concept-details.json` is an **annotation layer over the same edge set**, not a
second graph. The detail panel resolves `from` back through `graph-core`'s nodes to render
a clickable prerequisite, and skips any `from` it cannot resolve rather than failing — a
hand-edited or truncated details file degrades to a thinner panel, not a crash.

## Where the data comes from

The curriculum content is meant to be **LLM-authored**, by the agent pipeline in
[q-matrix-agents](https://github.com/MaximusTitan/q-matrix-agents): agents read chapter
PDFs and board documentation and write concept/skill rows and prerequisite edges into
per-chapter CSVs in **your own** knowledge base, with evaluation, repair and human
escalation in the loop.

The **export is not** LLM-driven. `scripts/export_graph.py`, in the agents repo, makes no
LLM or network calls of any kind — it is deterministic parsing, exact string resolution and
graph algorithms (Tarjan SCC, longest-path) run against your KB. Given the same KB it always
produces the same bytes. So the *content* is model-generated by your pipeline, the
*structure* is mechanically derived, and re-exporting can never change a judgement.

Within the graph, edges carry that distinction explicitly. `derived: true` (`d` in
`graph-core.json`) marks an edge **lifted in code**, not asserted by a model: if skill A
precedes skill B, then concept(A) precedes concept(B) — filterable in the UI via *Hide
inferred links*. The remaining edges are each judged by an agent and may carry written
reasoning, which is what the detail panel shows.

## Updating the data

Run this **from this repo**. The exporter lives in `q-matrix-agents` and writes straight
into `public/graph/` here, so with both repos checked out as siblings:

```bash
npm run sync:graph
git add public/graph && git commit
```

Paths resolve like this, and none of them live in an env file here:

| Path | Where it comes from |
|---|---|
| the exporter script | `../q-matrix-agents` — override with `QM_AGENTS` |
| the Python interpreter | that repo's `.venv` — override with `QM_PYTHON` |
| **the KB to read** | `KB_ROOT` in `q-matrix-agents/.env`, pointed at your own KB clone |
| **the JSON to write** | the `--out` argument, not configuration |

Only the *input* is configured; the *output* is passed in, which is why this repo needs no
env file. `KB_ROOT` is resolved by the agents repo (see `skills/kb_access.py` there) by
walking up from its own code, not from your working directory, so it is found no matter
where you invoke the command. A plain environment variable wins over the `.env` file, so CI
can pass `KB_ROOT=… npm run sync:graph` directly.

The interpreter matters: the exporter imports `skills.kb_access`, which needs
`python-dotenv`. A bare system `python3` will fail with `ModuleNotFoundError: No module
named 'dotenv'`.

Then commit the three regenerated files. `graph-core.json` and `concept-details.json`
carry no timestamp, so re-running against an unchanged KB leaves them byte-identical and
only `meta.json` shows a diff.

`src/lib/types.ts` mirrors the exporter's contract and pins `SCHEMA_VERSION`. The loader
refuses data at a different version rather than rendering a subtly wrong graph — if you see
that error, the two repos are out of step.

### What each kind of KB change costs

Every sync is a **full rebuild** — there is no incremental mode. It re-reads every chapter
CSV in your KB and rewrites all three files, so there is nothing to gain from incremental
logic and a cache to get wrong.

A full rebuild still gives a small diff. Output is sorted deterministically (nodes by id,
links by source then target), so unchanged content lands byte-identically in the same
place.

| Change in the KB | Effect on the JSON |
|---|---|
| nothing | only `meta.json` (its timestamp) — safe to discard |
| reword a skill | a couple of lines in `concept-details.json`, none in `graph-core.json` |
| add or remove a skill | small — `skillCount` plus the details entry |
| add or remove a concept | one node block and its links |
| rename a concept | node re-ids, **and `--check` fails** — see below |
| rename a chapter folder | every concept in that chapter re-ids |
| re-run the pipeline | **none** — `run/` artifacts are not read |

That last row matters: the exporter only reads `confirmed_curriculum.csv`. Re-running the
pipeline, new run records, escalations and reports never reach the graph. Re-syncing after
a pipeline run that did not change a confirmed CSV is a no-op.

### When `--check` fails on unresolved references

Node ids are `sha1(subject|grade|chapter|concept)[:12]` — derived from content, because the
KB has no ids of its own. Renaming a concept therefore gives it a new id, and any other row
still naming it the old way now points at nothing:

```
error: N unresolved references
```

This is the guard working. The KB stores prerequisites as exact free-text names, so a
rename in one place does not propagate — those references have to be updated too. Because
`--check` is part of `sync:graph`, a rename that breaks references fails the sync instead of
quietly shipping a graph with missing edges.

Two related consequences of content-derived ids: renaming a concept **breaks existing
`?node=…` links** to it, and renaming a chapter folder re-ids every concept inside it at
once.

### Adding a new subject

The exporter needs **no changes** — it discovers any `textbooks/{board}/{subject}/{grade}/
{chapter}/confirmed_curriculum.csv` in your KB, and a new subject appears in `meta.json`
automatically.

This repo does need changes, and the failure mode is silent. Node visibility is gated on
`filters.subjects.has(node.subject)`, and the default filter is seeded from
`SUBJECT_ORDER` in `src/lib/palette.ts` — shipped here with the same three example subjects
(Maths, Science, Environmental Science) as a working default. A subject missing from that
list is **filtered out entirely** — you get a successful sync, `unresolved refs: 0`, and
nothing on screen. An unknown subject also has no layout anchor, so it would pile at the
origin even if shown.

Add it to all three constants in `src/lib/palette.ts` — `SUBJECT_COLORS`, `SUBJECT_ORDER`,
`SUBJECT_SHORT`. That one file feeds the default filter, the legend, the controls and the
layout anchors. Grade sliders and layer rings adapt on their own. Note that anchor angle is
`i / order.length`, so adding a subject repositions the existing lobes.

**Budget real time for the colour.** The three shipped hues are the validated prefix of a
categorical palette, stepped for the dark canvas, and no fourth hue from that ramp can join
them without redoing the gates — the gate results and worst-pair ΔE figures are recorded in
`src/lib/palette.ts`'s header comment. A fourth subject means **re-stepping all four colours
together**. The validator itself is not vendored here; it ships with the `dataviz` skill as
`scripts/validate_palette.js`. Re-run it against your canvas surface colour with
`--pairs all` before committing to any set, or substitute an equivalent all-pairs check.

### Other things a fork will want to change

Two strings are hardcoded to the example curriculum and will read wrong against yours:

- the header subtitle in `src/components/graph-explorer.tsx` ends with a literal
  `Grades 1–10`. The grade *sliders* and the layer rings derive their range from the data
  and adapt on their own — this one line does not.
- `src/app/layout.tsx` sets the page `<title>` and description. The on-screen heading uses
  `meta.board`, so it follows your export, but the tab title does not.

## How to read the graph

| Channel | Encodes |
|---|---|
| **Colour** | subject |
| **Height** | grade (lowest grade at the top) — or prerequisite depth, also descending |
| **Node size** | skills taught under the concept by default; switchable to concepts unlocked, or total connections |
| **Link brightness** | prerequisite scope — L1 faintest, L3 brightest |

Links point **from a prerequisite to what it unlocks**. Every layered mode runs top-down,
so a prerequisite is always drawn above the thing it unlocks and links read consistently
downward.

**Click any concept** for its skills, its prerequisites with the reasoning behind each, and
what it unlocks. **Focus this chain** isolates everything upstream and downstream of a
concept and dims the rest. Search matches concept names, from two characters up.

Two URL parameters, both written back as you explore, so the address bar is always a
shareable link to the current view: `?node=<id>` selects and flies to one concept, and
`?mode=layered|depth|free` picks the layout.

### Navigating

Two canvas tools, in the Excalidraw sense — one acts on the contents, one moves the
viewport over them:

- **Select** (`V` / `1`) — hover and click concepts; left-drag orbits the camera.
- **Move** (`H` / `2`) — left-drag pans: the viewpoint slides while the graph stays exactly
  where it is, keeping the mental map you just built. Picking is off in this mode, so a pan
  that starts on a node does not select it.

Hold **space** to pan temporarily from either tool and spring back on release. Press **`R`**
to re-fit the graph — panning is unbounded, so this is the way back if you slide the graph
off screen. **Spin** toggles a slow idle rotation, on by default.

**The graph cannot be tilted off its standing axis.** The camera uses OrbitControls rather
than the library's default trackball, because trackball rotates freely about any axis — an
ordinary sideways drag rolls the whole graph and the grade stack stops being vertical,
which throws away the layout's entire point. Orbit keeps the up-vector fixed: horizontal
drag swings around the standing axis, vertical drag changes elevation, and nothing rolls.
In the layered modes elevation is additionally clamped to roughly ±40° of the horizon, so
the view cannot flip over the top either. Free 3D lifts that clamp.

The idle spin is OrbitControls' own `autoRotate`, so it suspends itself while you drag. It
is also suspended whenever a concept is open — drifting the view while someone reads the
panel or traces a focused chain is unhelpful, and it would fight the fly-to animation.

| Key | Action |
|---|---|
| `V` / `1` | Select tool |
| `H` / `2` | Move tool |
| hold `Space` | Temporary pan |
| `R` | Fit graph to view |
| `Esc` | Clear selection and focus |

(Spin has no shortcut — it is a toolbar toggle.)

Shortcuts are suppressed while a text field has focus, so typing "heat" into search does
not flip the tool on the `h`.

### Layouts

Both layered modes run **top-down**, the way a dependency tree is conventionally drawn:
the lowest grade sits at the top, and depth starts at the entry concepts and descends.
Because the direction is shared, switching modes never reverses the reading direction, and
a prerequisite is drawn above what it unlocks in both.

- **By grade** (default) — Y pinned to grade, force acting only in X/Z, subjects settling
  into separate lobes. This is the point of the visualisation: an unconstrained 3D force
  layout of a large concept graph is a hairball that throws away the strongest structure in
  the data.
- **By depth** — Y pinned to prerequisite depth. **Step N means the longest chain of
  prerequisites reaching that concept is N links long**, so Step 0 is a concept nothing in
  the graph is a prerequisite for. It is deliberately independent of grade — one step holds
  concepts from several years at once, which is what makes it a different view rather than
  a rearrangement of the first.
- **Free 3D** — unconstrained, for comparison.

Layer rings are positioned with the same index function that pins the nodes
(`descendingLayerIndex`), so a ring cannot drift away from the band it labels — which is
otherwise exactly what happens when the visible layers are not a contiguous run.

Depth is computed on the **condensation** — every strongly-connected component collapsed to
one vertex — rather than on the graph directly, because a real curriculum corpus is rarely
a strict DAG. Running Kahn's algorithm on the raw graph does not merely mishandle the
concepts inside cycles: nothing downstream of a cycle ever reaches in-degree zero either, so
a large share of concepts can fail to resolve. The condensation is always a DAG, so every
concept gets a real depth. Concepts inside one cycle share a step, which is honest — their
mutual prerequisites make any ordering between them arbitrary.

Depth is recomputed against the current filters, since restricting to a grade range
genuinely changes what counts as a starting point.

## Design notes

**The palette is validated, not chosen.** The three shipped subject hues are the first
three slots of a categorical palette stepped for the dark canvas — specifically the prefix
that clears every gate under an *all-pairs* comparison, which is the right test when all
subjects are on screen at once. `src/lib/palette.ts` records which gates were checked, the
surface colour they were checked against, and the worst-pair ΔE under normal and deutan
vision.

Do not add a fourth hue without re-validating — the next slot in that ramp fails the
all-pairs floors against a hue already in use. A fourth distinction belongs in another
channel: a filter, opacity, or size.

**Dark only.** Faint prerequisite links disappear on a light background, and the palette is
stepped for this surface.

**Node sizing defaults to skill count**, and is deliberately exaggerated. A strict
area-proportional encoding (radius ∝ √metric) is the textbook choice but tends to read as
nearly uniform on curricula where most concepts teach very few skills — so the honest curve
leaves most of the graph at the floor with too little spread above it to see at the zoom the
whole graph is viewed at.

Radius is therefore `5 × metric^0.75`, clamped to 26 so the rare extremes cannot swell into
blobs that swallow their neighbours. Sizes here are **comparative, not measurable** — exact
counts live in the tooltip and the detail panel.

### Performance

A curriculum-scale graph — thousands of concepts and prerequisite links — renders
comfortably, but three choices are load-bearing:

- **Links are GL lines, not cylinders.** Any positive `linkWidth` switches the renderer to
  cylinder meshes, one per link. Prerequisite level is encoded in opacity instead.
- **Labels appear on hover only.** Sprite labels on every node destroy the frame rate.
- **Directional particles are allocated only inside a focus subgraph**, never across the
  whole graph.

One library quirk worth knowing if you touch `graph-canvas.tsx`: `d3ReheatSimulation()`
flips the engine-running flag, but the simulation it ticks is not created until the first
`graphData` flush. Calling it during mount kills the render loop with
`Cannot read properties of undefined (reading 'tick')`. The first force setup deliberately
skips the reheat.

## Layout

```
src/app/                 root layout (dark-only, system fonts) and the single page
src/lib/types.ts         contract mirror + SCHEMA_VERSION guard
src/lib/graph.ts         loading, adjacency, focus traversal, search
src/lib/layout.ts        grade layers, subject anchoring, SCC + depth
src/lib/nav.ts           canvas tools and their shortcuts
src/lib/palette.ts       subject hues, level styling, size metrics
src/components/
  graph-explorer.tsx     the one stateful component: load, filter, select, focus
  graph-canvas.tsx       three.js / react-force-graph, camera, layer rings
  detail-panel.tsx       skills, prerequisites with rationale, dependents
  controls.tsx           layout mode, size metric, subject/grade/level filters
  nav-toolbar.tsx        select · move · fit · spin
  search-box.tsx         concept search with keyboard navigation
  legend.tsx             encoding key + integrity summary
public/graph/            placeholder data (committed) — replace via npm run sync:graph
```

There is no `src/app/api/`, no server component that reads data, and no database. `page.tsx`
renders one client component; every byte of curriculum comes from `fetch("graph/…")` against
the three static files.

## Security

`npm audit` may report advisories transitively pinned inside `next` with no non-breaking
fix available. Before reaching for `audit fix --force` (which can downgrade Next.js), check
whether the advisory is actually reachable in a static-export app with no server-side image
optimisation and no third-party CSS input — both common false positives here.

Concept and skill text is escaped (`escapeHtml` in `graph-canvas.tsx`) before being injected
into the graph tooltip, which the graph library renders outside React. Fonts are system
fonts, not fetched — the build has no network dependency and the page loads no third-party
assets. Keep this escaping in place if you extend the tooltip; it is the one place in this
codebase that builds HTML as a string instead of through React.

## A note on publishing

A static export makes the **entire curriculum corpus you sync in publicly downloadable** —
concepts, skills and prerequisite rationales for every chapter in your KB — from whatever
host serves the site. That may be fine for material you're licensed to redistribute, and a
problem otherwise. Decide the hosting visibility deliberately, and see the rights notice in
[q-matrix-kb-template](https://github.com/MaximusTitan/q-matrix-kb-template) before you publish a
deployment of your own data.

## Related

- **[q-matrix-agents](https://github.com/MaximusTitan/q-matrix-agents)** — orchestrator,
  agents, skills, dashboard, and `scripts/export_graph.py` (the code layer). Open source,
  not taking PRs.
- **[q-matrix-kb-template](https://github.com/MaximusTitan/q-matrix-kb-template)** — empty
  knowledge-base skeleton; `KB_ROOT` points at your clone of this. Open source, not taking
  PRs.
- **[q-matrix-dataset](https://github.com/MaximusTitan/q-matrix-dataset)** — a released,
  point-in-time snapshot of curriculum data this viewer can render. **This is the repo open
  for community contribution.**
- **[Curriculum Brain (paper draft)](https://prickly-gopher-95e.notion.site/Curriculum-Brain-3a3527ed7aee80cc97f7ee52e302249e)**
  — the framework these repos implement.

## License

Apache License 2.0 — see [LICENSE](LICENSE). Copyright 2026 Intelliana.
