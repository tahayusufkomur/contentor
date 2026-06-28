# Screenshot Map — Miro-style Graph Board

**Date:** 2026-06-28
**Status:** Approved design, pending implementation plan
**Builds on:** `2026-06-27-screenshot-map-design.md` (the lanes-based generator, now shipped)

## Problem

The shipped screenshot-map renders screens as static lanes grouped by frontend/area.
The user actually wants a **Miro-style board**: a single big pannable/zoomable canvas
where each screenshot is a node and edges draw the **real navigation graph** between
screens, with screens **clustered by role/area**. This makes "how the app connects"
legible at a glance, not just "what screens exist".

## Goal

Replace the lanes layout with an interactive graph board in the same single
self-contained `docs/screenshot-map/index.html`, produced by the same
`make screenshot-map`. Nodes are screenshots; edges are real in-app navigation links;
nodes are grouped into role/area clusters; the canvas pans/zooms and nodes drag.

## Decisions (from brainstorming)

- **Edges = real navigation links.** An edge A→B means A's rendered page contains an
  `<a href>` that resolves to B's route. (Not route hierarchy.)
- **Layout = clustered by role/area.** Each `frontend · role` is a cluster
  (compound parent) neighborhood; the force layout packs clusters and draws edges
  within and between them.
- **Global-nav edges omitted.** Links to a target reachable from ≥70% of a frontend's
  pages (navbar/sidebar/footer chrome) are suppressed so the board shows meaningful
  page-to-page flow. A suppressed-count is kept and surfaced in the header.
- **Node interaction:** single-click highlights the node's incoming/outgoing edges and
  dims the rest; double-click opens a lightbox with the full-size screenshot.
- **Single self-contained file** stays the constraint: the graph library and all
  thumbnails are inlined.

## Scope

**In scope:** harvesting in-app links during capture; building the nav graph + clusters
+ global-nav suppression; rendering the interactive Cytoscape board; replacing the lanes
renderer; tests.

**Out of scope (v1):** cross-frontend edges (a customer page linking to the apex
marketing host) — resolved links are matched within the page's own frontend; others are
dropped (counted). Route-hierarchy edges. Manual node-position persistence between runs.
Separate hi-res capture — the existing 1440×900 viewport PNG is the asset shown both as
the node thumbnail and in the lightbox.

## Architecture

Reuses the existing pipeline (`discover → auth → capture → render`, wired by `index.js`).
Three touches plus one new unit:

```
scripts/screenshot-map/
  capture.js     # MODIFY: harvest in-app links -> result.links
  graph.js       # NEW: results -> { nodes, edges, suppressedCount } (pure)
  graph.test.js  # NEW
  render.js      # MODIFY: render(graph, meta) -> Cytoscape board HTML (was lanes)
  render.test.js # MODIFY: assert board structure
  index.js       # MODIFY: build graph, pass to render
  package.json   # MODIFY: add cytoscape dependency (inlined at build time)
  vendor.js      # NEW: reads node_modules/cytoscape dist and returns its JS to inline
```

### Unit contracts

- **capture.js (modify `capturePage`)** — after the screenshot, run
  `page.evaluate(() => Array.from(document.querySelectorAll("a[href]")).map(a => a.href))`
  to collect absolute link URLs, and add `links: string[]` to the returned result.
  Skipped/error results get `links: []`. Everything else in the result is unchanged:
  `{ ...route, resolvedUrl, status, note, png, links }`. (Pure helpers `resolveUrl` /
  `classify` are untouched.)

- **graph.js (new, pure)** — exports:
  - `resolveLinkToRoute(href, routes)` → a node id (`"<frontend>|<routeUrl>"`) or
    `null`. `routes` are one frontend's discovered route records (each carries
    `frontend`, `host`, `url`); the frontend's host is taken from `routes[0].host`.
    Parses `href`; if its host ≠ that host, returns `null` (cross-frontend, out of
    scope). Otherwise normalizes the path (strip query/hash, strip trailing slash) and
    matches it against `routes`: exact match for static routes; for dynamic routes,
    match by equal segment count where every non-`[..]` segment is identical (so
    `/admin/courses/123` → `/admin/courses/[id]`). Returns `"<frontend>|<url>"` of the
    matched route, or `null` if unmatched.
  - `clusterLabel(result)` → a human cluster name, `"<frontend> · <role>"` where role is
    title-cased (`coach`→"Coach", `student`→"Student", `superadmin`→"Superadmin",
    `anon`→"Public"). Used as the compound parent id/label.
  - `buildGraph(results, routesByFrontend)` → `{ nodes, edges, suppressedCount }`.
    `routesByFrontend` maps each frontend name → that frontend's discovered route
    records (used to resolve links per frontend via `resolveLinkToRoute`):
    - **nodes:** one per result that produced a node (every captured route, including
      `skipped`/`error` — they're still real screens/states), id `"<frontend>|<url>"`,
      with `{ id, label: url, role, status, cluster, png }` and the cluster parent nodes
      synthesized from distinct `clusterLabel`s.
    - **edges:** for each result A, resolve each `link` via `resolveLinkToRoute` to a
      target id B (using A's frontend + that frontend's routes). Drop `null`,
      drop self-loops (A===B), dedupe (A,B) pairs.
    - **global-nav suppression:** per frontend, P = count of source pages. For each
      target B, distinctSources = number of distinct A's linking to B. If
      `distinctSources / P >= 0.70`, drop ALL edges into B and increment
      `suppressedCount`. (The node B remains; only its incoming chrome edges go.)

- **render.js (modify)** — `render(graph, meta)` → a single self-contained HTML string:
  - inlines the vendored Cytoscape JS (from `vendor.js`),
  - embeds `graph.nodes`/`graph.edges` as JSON; each screen node carries its thumbnail
    as a base64 `data:` URI used for the node `background-image`; cluster parents are
    compound nodes,
  - boots Cytoscape with the built-in compound-aware `cose` force layout,
  - styles: node border colored by status (ok/error/skipped), directed edge arrows,
    cluster parent boxes labeled,
  - interactions: pan/zoom/drag (Cytoscape defaults); `tap` on a node → highlight its
    closed neighborhood (incoming+outgoing edges + adjacent nodes), dim the rest; tap on
    background → clear; `dbltap`/`dblclick` on a node → lightbox overlay showing the
    node's full PNG with route + role,
  - header bar: title, `meta.generatedAt`, `meta.commit`, status summary counts, and
    "(N global-nav links hidden)".
  - keeps and reuses `escapeHtml` and `summarize` (still exported). The lanes-specific
    `card`/lane code is removed.

- **vendor.js (new, pure-ish)** — `cytoscapeSource()` reads
  `node_modules/cytoscape/dist/cytoscape.min.js` and returns it as a string for
  inlining. Throws a clear error if missing (so the Makefile's `npm install` step is the
  obvious fix). Keeping this in its own tiny unit keeps `render.js` free of filesystem
  concerns and makes render unit-testable with a stub.

- **index.js (modify)** — collect `results` as today while also accumulating
  `routesByFrontend[fe.name] = routes` inside the existing per-frontend loop. Then
  `const graph = buildGraph(results, routesByFrontend)` and
  `render(graph, { generatedAt, commit, summary: summarize(results) })`.

### Why Cytoscape + built-in `cose`

Cytoscape natively supports image nodes, compound (cluster) parent nodes, pan/zoom/drag,
neighborhood highlighting, and a compound-aware force layout (`cose`) — all without
extra layout extensions, so vendoring is just the one `cytoscape.min.js`. `fcose` would
give nicer compound packing but needs extra packages to inline; it's a noted future
upgrade, not v1.

## Data flow

```
discover ─ routes ─┐
                   ├─> capture (screenshot + links) ─ results ─> buildGraph ─ {nodes,edges} ─> render ─> index.html
auth ─ contexts ───┘
```

## Testing

- **graph.js (unit, the core):**
  - `resolveLinkToRoute`: exact static match; dynamic pattern match
    (`/admin/courses/123` → `/admin/courses/[id]`); trailing-slash/query/hash
    normalization; foreign-host → `null`; unmatched path → `null`.
  - `buildGraph`: node-per-result + synthesized cluster parents; edge dedupe; self-loop
    drop; cross-frontend/unresolved drop; **global-nav suppression** — a target linked
    from ≥70% of a frontend's pages has its incoming edges removed and `suppressedCount`
    incremented, while a target linked from <70% keeps its edges.
  - `clusterLabel`: role title-casing and `frontend · role` format.
- **render.js (unit):** given a small `{nodes,edges}` with one base64 png, the output is
  a single self-contained HTML string that (a) contains the inlined Cytoscape source
  (stub it via a `vendor` injection or assert the call site), (b) embeds the nodes/edges
  JSON, (c) inlines the thumbnail as a `data:image/png;base64,` background with NO
  external `<img src="/...">`/`<script src>` refs, (d) escapes a hostile route string.
- **capture.js:** the link-harvest is Playwright-bound → verified in the e2e; no new pure
  helper to unit-test there.
- **e2e:** `make screenshot-map` against the seeded stack renders a board with cluster
  parents, nodes carrying thumbnails, visible edges, and a non-zero or explained
  suppressed-count; single-click highlights, double-click opens the lightbox.

## Risks & mitigations

- **Hairball even after suppression** → the 70% rule removes global chrome; if specific
  areas still over-connect, the threshold is a single constant to tune. Surfaced count
  lets the user judge.
- **Link resolution false negatives** (a real link that doesn't match a captured route,
  e.g. a route we skipped) → dropped silently is acceptable; the node still appears, it
  just has fewer edges. Dynamic-pattern matching covers the common `/x/123` case.
- **File size** (Cytoscape ~300–400 KB inlined + thumbnails already ~tens of MB) →
  negligible relative to the existing base64 image payload; still one portable file.
- **`cose` layout aesthetics** on ~70 nodes → acceptable for v1; `fcose` is the noted
  upgrade path if clustering looks loose.
