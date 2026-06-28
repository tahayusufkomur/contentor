# Flowmap — Local Flow-Visualization Service

**Date:** 2026-06-28
**Status:** Approved design, pending implementation plan
**Supersedes:** the static-HTML board from `2026-06-27-screenshot-map-design.md` and
`2026-06-28-screenshot-map-graph-board-design.md`. The crawler/thumbnail/graph code is
reused; the static `render.js` board is replaced by this service.

## Problem

A single big node-link board of the whole app is not legible — it blobs, overlaps, and
doesn't convey **user flows**. What's wanted instead: the app's distinct user journeys,
each shown as its own small, readable DAG of screenshots, browsable in a webpage —
"subsets, not everything in one window."

## Goal

A small local tool — **SQLite + a web server** — that stores screens and flows and
serves a webpage visualizing them. **Claude** is the author: it captures the
screenshots, identifies the flows, and **registers** screens + flows into the tool over
an HTTP API. When the user opens the tool's webpage they see every flow Claude
registered, each as a left→right DAG of real screenshots.

## Roles

- **Tool** = passive store + visualizer (SQLite, web server, REST API).
- **Claude** = author. Captures screens, identifies flows, registers both (crawler +
  `claude -p` for flow identification; ad-hoc edits via curl).
- **User** = viewer. Opens the page, browses flows.

## Decisions (from brainstorming)

- Per-flow DAGs, not one global graph. Each flow is a coherent journey, possibly
  **spanning roles** (e.g. a checkout flow crosses Public→Student).
- Claude identifies flows (analyzes the captured screens + nav graph) and registers
  definitions — it does not need to live-drive a browser to "record" them.
- Claude talks to the tool via **HTTP API (curl)**.
- Layout per flow: **dagre** `rankDir: LR` (layered, directional, no overlaps).
- Keep downscaled thumbnails + double-click lightbox.

## Architecture

A self-contained Node service at `tools/flowmap/`:

```
tools/flowmap/
  db.js          # node:sqlite open + schema + typed query helpers
  server.js      # node:http server: REST API + static web UI
  register.js    # populate: crawl -> screens, claude-CLI -> flows (writes DB)
  flows.js       # build the claude-CLI prompt from the nav graph + parse/validate the JSON
  crawler/       # MOVED from scripts/screenshot-map: discover, auth, capture, thumbnail, graph
  web/
    index.html   # the flow-explorer page shell
    app.js       # fetches the API, renders the sidebar + per-flow dagre DAG + lightbox
    styles.css
    vendor/      # cytoscape.min.js, dagre.min.js, cytoscape-dagre.js (served as static)
  package.json   # deps: playwright (crawl), cytoscape + cytoscape-dagre + dagre (UI)
  flowmap.db     # the SQLite database (gitignored)
```

Node 22's built-in `node:sqlite` (`DatabaseSync`) is used with the
`--experimental-sqlite` flag — **no native DB dependency**. The server uses `node:http`
with a tiny hand-rolled router — **no web framework dependency**. SQLite runs in WAL
mode so `register.js` (writer) and `server.js` (reader/writer) can share the file.

### Data model (SQLite)

```sql
CREATE TABLE screens (
  key        TEXT PRIMARY KEY,   -- "<frontend>|<url>", e.g. "customer|/admin/courses"
  url        TEXT NOT NULL,
  role       TEXT,
  frontend   TEXT,
  title      TEXT,
  thumb      TEXT,               -- data: URL (≈360px JPEG) used as the node image
  full       TEXT,               -- data: URL (≈1100px JPEG) used in the lightbox
  updated_at TEXT NOT NULL
);
CREATE TABLE flows (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  description TEXT,
  created_at  TEXT NOT NULL
);
CREATE TABLE flow_steps (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  flow_id  INTEGER NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
  from_key TEXT NOT NULL,        -- references screens.key
  to_key   TEXT NOT NULL,
  ord      INTEGER NOT NULL,
  label    TEXT
);
```

A flow's node set is the union of `from_key`/`to_key` over its steps; its edges are the
steps. The page resolves each key to a screen row for the thumbnail.

### REST API (`server.js`)

- `POST /api/screens` — body is one screen or an array; **upsert** by `key`.
- `GET /api/screens` — list (key, url, role, frontend, title, thumb; **no** `full`).
- `GET /api/screens/:key` — one screen including `full`.
- `POST /api/flows` — body `{ name, description?, steps: [{from, to, label?}] }`; creates
  the flow + steps; unknown screen keys are accepted but reported in the response
  `warnings` (so a flow can reference a not-yet-registered screen). Returns `{ id }`.
- `GET /api/flows` — list `[{ id, name, description, stepCount }]`.
- `GET /api/flows/:id` — `{ id, name, description, steps, screens }` where `screens` are
  the involved rows (key, url, role, title, thumb) — enough to render the DAG.
- `DELETE /api/flows/:id`.
- `POST /api/reset` — clear all screens + flows (for a clean re-register).
- `GET /` → `web/index.html`; `GET /app.js`, `/styles.css`, `/vendor/*` → static files;
  served with correct content types. JSON bodies parsed with a size cap.

### Populate pipeline (`register.js`)

Reuses the crawler. Steps:
1. Preflight + crawl every route (reuse `discover` / `auth` / `capture`); `capture` now
   also harvests the page `<title>` for flow-identification semantics.
2. For each captured screen, make `thumb`/`full` (reuse `thumbnail.js`) and write the row
   into `screens` (direct DB write).
3. Build the nav graph (`buildGraph`) and a compact textual description (screens: key,
   url, role, title; plus the real edges). `flows.js` builds the `claude -p` prompt
   asking for a JSON array of flows (`{ name, description, steps:[{from,to,label}] }`)
   that are coherent user journeys (DAGs), using screen keys; shell out to
   `claude -p --output-format text` (or json), parse, validate keys exist, write each
   flow + steps into the DB.
4. Print a summary (N screens, M flows). Idempotent: a `--reset` clears first.

`register.js` writes the DB directly (no server needed during crawl). The HTTP API is
for the live page and for Claude/manual flow edits while the server runs.

### Web UI (`web/`, served live from SQLite)

- **Sidebar:** `GET /api/flows` → list of flows (name + step count); the first is
  selected by default; clicking selects.
- **Canvas:** on select, `GET /api/flows/:id` → build Cytoscape elements (nodes = the
  flow's screens with `thumb` backgrounds; edges = steps with `label`) and run the
  **dagre** layout (`rankDir: 'LR'`); pan/zoom/drag.
- **Lightbox:** double-click a node → `GET /api/screens/:key` for `full` → overlay.
- Vendored cytoscape + cytoscape-dagre + dagre served as static `/vendor/*` (no
  base64 inlining — the page is served, not a single file).
- Empty state: if no flows, show "No flows registered yet — run `make flowmap-register`".

### Run

- `make flowmap` → `node --experimental-sqlite tools/flowmap/server.js` → serves
  `http://localhost:7878` (configurable). Open it.
- `make flowmap-register` → `node --experimental-sqlite tools/flowmap/register.js`
  (optionally `-- --reset`) → crawls + identifies flows + fills the DB. Reopen the page.

## Reuse vs replace

- **Reuse (move to `tools/flowmap/crawler/`):** `discover.js`, `auth.js`, `capture.js`
  (+ a `<title>` harvest), `thumbnail.js`, `graph.js`, `frontends.js`, `targets.json`,
  and the `issue_login_token` Django command (unchanged, already merged).
- **Replace:** `render.js` (static board) and `index.js` (static orchestrator) are
  superseded by `server.js` + `register.js`. The old `scripts/screenshot-map/` static
  generator and its `make screenshot-map` target are removed.

## Testing

- **db.js (unit, node:test):** schema creates; screen upsert is idempotent; flow insert
  with steps round-trips; `GET flow` assembles steps + involved screens; cascade delete.
- **flows.js (unit):** prompt builder includes every screen + edge; the JSON parser
  accepts a well-formed flows array, drops malformed entries, and flags steps that
  reference unknown keys.
- **server.js (unit/integration):** spin the server on an ephemeral port against a temp
  DB; assert each endpoint's status + shape (POST screen → GET screen; POST flow → GET
  flow; DELETE; reset); bad JSON → 400; unknown route → 404.
- **register.js / claude-CLI / crawl:** environment-bound → verified in the end-to-end
  run, not unit-tested.
- **End-to-end (manual):** `make flowmap-register` against the seeded stack, then
  `make flowmap`, open the page: a sidebar of named flows, each rendering a clean
  left→right DAG of real screenshots, lightbox works.

## Risks & mitigations

- **`claude -p` output not valid JSON** → instruct "output ONLY a JSON array"; parse
  defensively (extract the first `[...]`); on failure, register screens only and report
  that no flows were produced — the page still shows an empty-flows state, not a crash.
- **`node:sqlite` is experimental** → it ships in Node 22.5+ and is used read/write
  synchronously here; the `--experimental-sqlite` flag + a stderr warning are the only
  cost. Pinned via the `make` targets.
- **Flow references a screen the crawl skipped** (dynamic route with no target) → the
  API records the step with a `warning`; the page renders the node as a labeled box
  without a thumbnail (same treatment as the old skipped nodes).
- **DB write contention** (register + server) → WAL mode + short-lived statements;
  register is typically run while the server is down or between views.
- **Scope:** three loosely-coupled parts (service, populate, UI); built and verified in
  that order so each is independently runnable.
