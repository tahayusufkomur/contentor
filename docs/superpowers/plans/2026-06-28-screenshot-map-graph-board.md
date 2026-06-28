# Screenshot Map Graph Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the screenshot-map lanes layout with an interactive Miro-style graph board — screenshots as nodes, real navigation links as edges, clustered by role/area — in the same single self-contained `docs/screenshot-map/index.html`.

**Architecture:** Reuse the shipped pipeline (`discover → auth → capture → render`, wired by `index.js`). Add link-harvesting to `capture.js`; a new pure `graph.js` turns capture results into `{ nodes, edges, suppressedCount }` (resolving links to route nodes, clustering, omitting global-nav edges); a new `vendor.js` inlines Cytoscape; `render.js` becomes a Cytoscape board renderer; `index.js` wires graph-build + the new render signature.

**Tech Stack:** Node 22 (built-in `node:test`), Playwright, Cytoscape.js (inlined), Docker Compose.

## Global Constraints

- **CommonJS** throughout `scripts/screenshot-map/`; tests use built-in `node:test` + `node:assert/strict` only. Playwright and Cytoscape are the only runtime deps.
- **Single self-contained output**: `docs/screenshot-map/index.html` with Cytoscape JS and all thumbnails inlined — no external `<script src>` / `<img src="/...">` refs.
- **Edges = real nav links**: A→B iff A's page has an `<a href>` resolving to B's route (concrete URLs map to patterns: `/admin/courses/123` → `/admin/courses/[id]`). Cross-frontend links (foreign host) are dropped (v1).
- **Clusters** = `"<frontend> · <RoleTitle>"` where coach→Coach, student→Student, superadmin→Superadmin, anon→Public.
- **Global-nav suppression**: per frontend with P source pages, drop ALL edges into any target reached from ≥70% (`distinctSources / P >= 0.70`) of pages; count dropped edges in `suppressedCount`.
- **Node interaction**: single-click (`tap`) highlights the node's closed neighborhood and fades the rest; click background clears; double-click (`dbltap`) opens a lightbox with the node's full PNG + route + role.
- **Node id format**: `"<frontend>|<url>"`.
- **Script-embedding safety**: graph JSON embedded in a `<script>` is escaped via `JSON.stringify(...).replace(/</g, "\\u003c")`; header text uses `escapeHtml`.
- Work from `/Users/tahayusufkomur/ws/projects-active/home-server/contentor`. The Docker dev stack is running. Output is gitignored; `package-lock.json` is gitignored; commit only source files with explicit `git add <paths>` (never `git add -A`).

---

### Task 1: `vendor.js` — inline Cytoscape

**Files:**
- Modify: `scripts/screenshot-map/package.json` (add `cytoscape` dependency)
- Create: `scripts/screenshot-map/vendor.js`
- Test: `scripts/screenshot-map/vendor.test.js`

**Interfaces:**
- Produces: `cytoscapeSource()` → the Cytoscape minified JS as a string (read from `node_modules/cytoscape/dist/cytoscape.min.js`); throws a clear error if the package isn't installed. Consumed by `render.js` (Task 4).

- [ ] **Step 1: Add the dependency and install it**

```bash
cd scripts/screenshot-map && npm install cytoscape@^3.30.0 --save
```

Confirm `package.json` now lists `cytoscape` under `dependencies` and `node_modules/cytoscape/dist/cytoscape.min.js` exists:

```bash
ls scripts/screenshot-map/node_modules/cytoscape/dist/cytoscape.min.js
```
Expected: the path prints (file exists).

- [ ] **Step 2: Write the failing test**

```js
// scripts/screenshot-map/vendor.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { cytoscapeSource } = require("./vendor");

test("cytoscapeSource returns the inlinable cytoscape library", () => {
  const src = cytoscapeSource();
  assert.equal(typeof src, "string");
  assert.ok(src.length > 50000, "expected a substantial library string");
  assert.ok(/cytoscape/i.test(src), "expected the source to mention cytoscape");
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd scripts/screenshot-map && node --test vendor.test.js`
Expected: FAIL — `Cannot find module './vendor'`.

- [ ] **Step 4: Write `vendor.js`**

```js
// scripts/screenshot-map/vendor.js
const fs = require("node:fs");
const path = require("node:path");

function cytoscapeSource() {
  const p = path.join(__dirname, "node_modules", "cytoscape", "dist", "cytoscape.min.js");
  if (!fs.existsSync(p)) {
    throw new Error(
      "cytoscape is not installed — run `npm install` in scripts/screenshot-map (the `make screenshot-map` target does this automatically).",
    );
  }
  return fs.readFileSync(p, "utf8");
}

module.exports = { cytoscapeSource };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd scripts/screenshot-map && node --test vendor.test.js`
Expected: PASS (1 test).

- [ ] **Step 6: Commit**

```bash
git add scripts/screenshot-map/package.json scripts/screenshot-map/vendor.js scripts/screenshot-map/vendor.test.js
git commit -m "feat(screenshot-map): vendor Cytoscape for inlining"
```

---

### Task 2: `graph.js` — link resolution + cluster labels

**Files:**
- Create: `scripts/screenshot-map/graph.js`
- Test: `scripts/screenshot-map/graph.test.js`

**Interfaces:**
- Produces:
  - `nodeId(frontend, url)` → `"<frontend>|<url>"`.
  - `clusterLabel(result)` → `"<frontend> · <RoleTitle>"`.
  - `resolveLinkToRoute(href, routes)` → a node id or `null`. `routes` is one frontend's discovered route records (each `{ frontend, host, url, dynamic }`); host taken from `routes[0].host`. Foreign host / non-http / unmatched → `null`.
- Consumed by `buildGraph` (Task 3).

- [ ] **Step 1: Write the failing test**

```js
// scripts/screenshot-map/graph.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { resolveLinkToRoute, clusterLabel } = require("./graph");

const routes = [
  { frontend: "customer", host: "demo-yoga.localhost", url: "/admin/courses", dynamic: false },
  { frontend: "customer", host: "demo-yoga.localhost", url: "/admin/courses/[id]", dynamic: true },
  { frontend: "customer", host: "demo-yoga.localhost", url: "/", dynamic: false },
];

test("resolveLinkToRoute: static, dynamic, normalization, foreign host, unmatched", () => {
  assert.equal(resolveLinkToRoute("http://demo-yoga.localhost/admin/courses", routes), "customer|/admin/courses");
  assert.equal(resolveLinkToRoute("http://demo-yoga.localhost/admin/courses/123?x=1#h", routes), "customer|/admin/courses/[id]");
  assert.equal(resolveLinkToRoute("http://demo-yoga.localhost/admin/courses/", routes), "customer|/admin/courses");
  assert.equal(resolveLinkToRoute("http://demo-yoga.localhost/", routes), "customer|/");
  assert.equal(resolveLinkToRoute("http://localhost/admin/courses", routes), null); // foreign host
  assert.equal(resolveLinkToRoute("mailto:x@y.com", routes), null);
  assert.equal(resolveLinkToRoute("http://demo-yoga.localhost/nope", routes), null);
});

test("clusterLabel: frontend + title-cased role", () => {
  assert.equal(clusterLabel({ frontend: "customer", role: "coach" }), "customer · Coach");
  assert.equal(clusterLabel({ frontend: "main", role: "anon" }), "main · Public");
  assert.equal(clusterLabel({ frontend: "main", role: "superadmin" }), "main · Superadmin");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd scripts/screenshot-map && node --test graph.test.js`
Expected: FAIL — `Cannot find module './graph'`.

- [ ] **Step 3: Write `graph.js` (helpers)**

```js
// scripts/screenshot-map/graph.js
const ROLE_TITLES = { coach: "Coach", student: "Student", superadmin: "Superadmin", anon: "Public" };

function nodeId(frontend, url) {
  return `${frontend}|${url}`;
}

function clusterLabel(result) {
  const role = ROLE_TITLES[result.role] || (result.role.charAt(0).toUpperCase() + result.role.slice(1));
  return `${result.frontend} · ${role}`;
}

function normalizePath(p) {
  return p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p;
}

function routeMatches(routeUrl, dynamic, p) {
  if (!dynamic) return routeUrl === p;
  const a = routeUrl.split("/");
  const b = p.split("/");
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const seg = a[i];
    if (seg.startsWith("[") && seg.endsWith("]")) continue;
    if (seg !== b[i]) return false;
  }
  return true;
}

function resolveLinkToRoute(href, routes) {
  if (!routes || routes.length === 0) return null;
  let url;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.host !== routes[0].host) return null;
  const p = normalizePath(url.pathname);
  for (const r of routes) {
    if (routeMatches(r.url, r.dynamic, p)) return nodeId(r.frontend, r.url);
  }
  return null;
}

module.exports = { nodeId, clusterLabel, normalizePath, routeMatches, resolveLinkToRoute };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd scripts/screenshot-map && node --test graph.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/screenshot-map/graph.js scripts/screenshot-map/graph.test.js
git commit -m "feat(screenshot-map): link-to-route resolution + cluster labels"
```

---

### Task 3: `graph.js` — `buildGraph`

**Files:**
- Modify: `scripts/screenshot-map/graph.js` (add `buildGraph`, export it)
- Modify: `scripts/screenshot-map/graph.test.js` (append buildGraph tests)

**Interfaces:**
- Consumes: `nodeId`, `clusterLabel`, `resolveLinkToRoute` (Task 2); capture results `{ frontend, host, url, role, status, png, links }` (Task 5); `routesByFrontend` (a map `name → route records`).
- Produces: `buildGraph(results, routesByFrontend)` → `{ nodes, edges, suppressedCount }`. `nodes`: `{ id, label, role, status, cluster, png }` per result. `edges`: `{ source, target }` deduped, no self-loops, global-nav-suppressed. Consumed by `render` (Task 4) and `index.js` (Task 5).

- [ ] **Step 1: Append the failing tests**

```js
// append to scripts/screenshot-map/graph.test.js
const { buildGraph } = require("./graph");

function res(frontend, host, url, links, opts = {}) {
  return {
    frontend, host, url,
    role: opts.role || "coach",
    status: opts.status || "ok",
    png: opts.png ?? null,
    dynamic: !!opts.dynamic,
    links,
  };
}

test("buildGraph: node per result, deduped edges, no self-loops, cross-frontend dropped", () => {
  const routesByFrontend = {
    customer: [
      { frontend: "customer", host: "h", url: "/a", dynamic: false },
      { frontend: "customer", host: "h", url: "/b", dynamic: false },
    ],
  };
  const results = [
    res("customer", "h", "/a", ["http://h/b", "http://h/b", "http://h/a", "http://other/b"]),
    res("customer", "h", "/b", []),
  ];
  const g = buildGraph(results, routesByFrontend);
  assert.equal(g.nodes.length, 2);
  assert.equal(g.nodes[0].cluster, "customer · Coach");
  assert.deepEqual(g.edges, [{ source: "customer|/a", target: "customer|/b" }]);
  assert.equal(g.suppressedCount, 0);
});

test("buildGraph: suppresses edges into a target linked from >=70% of pages", () => {
  const routes = [
    { frontend: "customer", host: "h", url: "/hub", dynamic: false },
    { frontend: "customer", host: "h", url: "/p1", dynamic: false },
    { frontend: "customer", host: "h", url: "/p2", dynamic: false },
    { frontend: "customer", host: "h", url: "/p3", dynamic: false },
  ];
  const routesByFrontend = { customer: routes };
  const results = [
    res("customer", "h", "/hub", []),
    res("customer", "h", "/p1", ["http://h/hub"]),
    res("customer", "h", "/p2", ["http://h/hub"]),
    res("customer", "h", "/p3", ["http://h/hub", "http://h/p1"]),
  ];
  // /hub: 3 distinct sources of 4 pages = 75% >= 70% -> 3 edges suppressed.
  // /p1: 1 of 4 = 25% -> kept.
  const g = buildGraph(results, routesByFrontend);
  assert.equal(g.suppressedCount, 3);
  assert.deepEqual(g.edges, [{ source: "customer|/p3", target: "customer|/p1" }]);
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `cd scripts/screenshot-map && node --test graph.test.js`
Expected: FAIL — `buildGraph is not a function` (the Task 2 tests still pass).

- [ ] **Step 3: Add `buildGraph` to `graph.js`**

Insert before `module.exports`:

```js
function buildGraph(results, routesByFrontend) {
  const nodes = results.map((r) => ({
    id: nodeId(r.frontend, r.url),
    label: r.url,
    role: r.role,
    status: r.status,
    cluster: clusterLabel(r),
    png: r.png || null,
  }));

  // Resolve links to edges (deduped, no self-loops). Keep frontend on each edge
  // for per-frontend suppression, then drop it from the returned shape.
  const seen = new Set();
  const raw = [];
  for (const r of results) {
    const src = nodeId(r.frontend, r.url);
    const routes = routesByFrontend[r.frontend] || [];
    for (const href of r.links || []) {
      const tgt = resolveLinkToRoute(href, routes);
      if (!tgt || tgt === src) continue;
      const key = `${src}->${tgt}`;
      if (seen.has(key)) continue;
      seen.add(key);
      raw.push({ source: src, target: tgt, frontend: r.frontend });
    }
  }

  // Global-nav suppression, per frontend.
  let suppressedCount = 0;
  const edges = [];
  for (const fe of [...new Set(results.map((r) => r.frontend))]) {
    const feEdges = raw.filter((e) => e.frontend === fe);
    const P = new Set(results.filter((r) => r.frontend === fe).map((r) => nodeId(r.frontend, r.url))).size;
    const sourcesByTarget = {};
    for (const e of feEdges) (sourcesByTarget[e.target] ||= new Set()).add(e.source);
    for (const e of feEdges) {
      const distinct = sourcesByTarget[e.target].size;
      if (P > 0 && distinct / P >= 0.7) {
        suppressedCount++;
      } else {
        edges.push({ source: e.source, target: e.target });
      }
    }
  }

  return { nodes, edges, suppressedCount };
}
```

And add `buildGraph` to the exports:

```js
module.exports = { nodeId, clusterLabel, normalizePath, routeMatches, resolveLinkToRoute, buildGraph };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd scripts/screenshot-map && node --test graph.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/screenshot-map/graph.js scripts/screenshot-map/graph.test.js
git commit -m "feat(screenshot-map): build nav graph with global-nav suppression"
```

---

### Task 4: `render.js` → Cytoscape board

**Files:**
- Modify: `scripts/screenshot-map/render.js` (replace lanes renderer with the board; keep `summarize`/`escapeHtml`/`dataUri`)
- Modify: `scripts/screenshot-map/render.test.js` (replace lanes assertions with board assertions)

**Interfaces:**
- Consumes: `cytoscapeSource()` (Task 1); a graph `{ nodes, edges, suppressedCount }` (Task 3).
- Produces: `render(graph, meta, opts = {})` → self-contained HTML string. `meta = { generatedAt, commit, summary }`. `opts.cytoscapeSrc` (optional) overrides the inlined library (for tests). `summarize(results)` and `escapeHtml(str)` remain exported with unchanged behavior. Consumed by `index.js` (Task 5).

- [ ] **Step 1: Replace the test file**

```js
// scripts/screenshot-map/render.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { render, summarize } = require("./render");

test("summarize counts statuses", () => {
  assert.deepEqual(
    summarize([{ status: "ok" }, { status: "error" }, { status: "ok" }, { status: "skipped" }]),
    { ok: 2, error: 1, skipped: 1 },
  );
});

test("render builds a self-contained cytoscape board", () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  const graph = {
    nodes: [
      { id: "customer|/a", label: "/a", role: "coach", status: "ok", cluster: "customer · Coach", png },
      { id: "customer|/b", label: "</script><img>", role: "coach", status: "skipped", cluster: "customer · Coach", png: null },
    ],
    edges: [{ source: "customer|/a", target: "customer|/b" }],
    suppressedCount: 2,
  };
  const html = render(
    graph,
    { generatedAt: "2026-06-28", commit: "abc1234", summary: { ok: 1, error: 0, skipped: 1 } },
    { cytoscapeSrc: "/*CYTO_STUB*/" },
  );

  assert.match(html, /<!doctype html>/i);
  assert.match(html, /CYTO_STUB/); // library inlined (stub)
  assert.match(html, /id="cy"/); // canvas container
  assert.match(html, /cytoscape\(/); // boots cytoscape
  assert.match(html, /data:image\/png;base64,/); // thumbnail inlined
  assert.match(html, /abc1234/);
  assert.match(html, /2 global-nav links hidden/);
  // hostile label is escaped inside the JSON, not emitted raw
  assert.ok(!html.includes("</script><img>"), "raw hostile label must not appear");
  assert.match(html, /\\u003c\/script>\\u003cimg>/);
  // no external resource refs
  assert.ok(!/<script\s+src=/.test(html));
  assert.ok(!/<img\s+src="\/[^"]/.test(html));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd scripts/screenshot-map && node --test render.test.js`
Expected: FAIL — `render` still emits the old lanes HTML (no `id="cy"`, no `CYTO_STUB`), so the board assertions fail.

- [ ] **Step 3: Replace `render.js`**

```js
// scripts/screenshot-map/render.js
const { cytoscapeSource } = require("./vendor");

const BOARD_CSS = `
  html, body { margin: 0; height: 100%; background: #0f1115; color: #e7e9ee; font: 14px system-ui, sans-serif; }
  header { position: fixed; top: 0; left: 0; right: 0; z-index: 5; padding: 10px 16px; background: rgba(15,17,21,.92); border-bottom: 1px solid #262a33; }
  header h1 { margin: 0; font-size: 15px; display: inline; }
  header span { color: #9aa1ad; margin-left: 10px; font-size: 12px; }
  #cy { position: absolute; inset: 0; }
  #lb { position: fixed; inset: 0; z-index: 10; background: rgba(0,0,0,.85); display: none; align-items: center; justify-content: center; flex-direction: column; gap: 10px; cursor: zoom-out; }
  #lb img { max-width: 92vw; max-height: 82vh; border: 1px solid #2b3040; border-radius: 8px; }
  #lb .cap { color: #c7ccd6; font-size: 13px; }
`;

function escapeHtml(str) {
  return String(str).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function dataUri(png) {
  if (!png) return null;
  return "data:image/png;base64," + Buffer.from(png).toString("base64");
}

function summarize(results) {
  const s = { ok: 0, error: 0, skipped: 0 };
  for (const r of results) s[r.status] = (s[r.status] || 0) + 1;
  return s;
}

function buildElements(graph) {
  const elements = [];
  for (const c of [...new Set(graph.nodes.map((n) => n.cluster))]) {
    elements.push({ data: { id: c, label: c, isCluster: 1 } });
  }
  for (const n of graph.nodes) {
    elements.push({
      data: { id: n.id, parent: n.cluster, label: n.label, role: n.role, status: n.status, img: dataUri(n.png) || "" },
    });
  }
  graph.edges.forEach((e, i) => elements.push({ data: { id: `e${i}`, source: e.source, target: e.target } }));
  return elements;
}

function render(graph, meta, opts = {}) {
  const cyto = opts.cytoscapeSrc != null ? opts.cytoscapeSrc : cytoscapeSource();
  const elementsJson = JSON.stringify(buildElements(graph)).replace(/</g, "\\u003c");
  const s = meta.summary;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Contentor screenshot map</title><style>${BOARD_CSS}</style></head><body>
<header><h1>Contentor screenshot map</h1>
<span>${escapeHtml(meta.generatedAt)} · ${escapeHtml(meta.commit)} · ${s.ok} ok / ${s.error} error / ${s.skipped} skipped · ${graph.suppressedCount} global-nav links hidden · click a node to trace links, double-click to enlarge</span>
</header>
<div id="cy"></div>
<div id="lb"><img id="lbimg" alt=""><div class="cap" id="lbcap"></div></div>
<script>${cyto}</script>
<script>
const elements = ${elementsJson};
const cy = cytoscape({
  container: document.getElementById('cy'),
  elements,
  style: [
    { selector: 'node[?isCluster]', style: { 'background-opacity': 0.05, 'background-color': '#7aa2f7', 'border-width': 1, 'border-color': '#2b3040', 'shape': 'round-rectangle', 'padding': 18, 'label': 'data(label)', 'color': '#9aa1ad', 'font-size': 12, 'text-valign': 'top', 'text-halign': 'center' } },
    { selector: 'node[img]', style: { 'width': 120, 'height': 75, 'shape': 'round-rectangle', 'background-fit': 'cover', 'background-image': 'data(img)', 'background-color': '#1b1f2a', 'border-width': 3, 'border-color': '#3b4252', 'label': 'data(label)', 'font-size': 7, 'color': '#c7ccd6', 'text-valign': 'bottom', 'text-margin-y': 3, 'text-max-width': 120, 'text-wrap': 'ellipsis' } },
    { selector: 'node[status = "ok"]', style: { 'border-color': '#4ade80' } },
    { selector: 'node[status = "error"]', style: { 'border-color': '#f87171' } },
    { selector: 'node[status = "skipped"]', style: { 'border-color': '#fbbf24' } },
    { selector: 'edge', style: { 'width': 1, 'line-color': '#3b4252', 'target-arrow-color': '#3b4252', 'target-arrow-shape': 'triangle', 'arrow-scale': 0.8, 'curve-style': 'bezier', 'opacity': 0.7 } },
    { selector: '.faded', style: { 'opacity': 0.12 } },
  ],
  layout: { name: 'cose', animate: false, nodeRepulsion: 8000, idealEdgeLength: 90, nestingFactor: 1.2, padding: 30, randomize: true },
});
cy.on('tap', 'node', (e) => {
  const n = e.target;
  if (n.data('isCluster')) return;
  cy.elements().addClass('faded');
  n.closedNeighborhood().removeClass('faded');
});
cy.on('tap', (e) => { if (e.target === cy) cy.elements().removeClass('faded'); });
cy.on('dbltap', 'node', (e) => {
  const img = e.target.data('img');
  if (!img) return;
  document.getElementById('lbimg').src = img;
  document.getElementById('lbcap').textContent = e.target.data('label') + '  ·  ' + e.target.data('role');
  document.getElementById('lb').style.display = 'flex';
});
document.getElementById('lb').addEventListener('click', () => { document.getElementById('lb').style.display = 'none'; });
</script>
</body></html>`;
}

module.exports = { render, summarize, escapeHtml };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd scripts/screenshot-map && node --test render.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/screenshot-map/render.js scripts/screenshot-map/render.test.js
git commit -m "feat(screenshot-map): Cytoscape graph board renderer"
```

---

### Task 5: Harvest links in `capture.js` + wire `index.js` + e2e

**Files:**
- Modify: `scripts/screenshot-map/capture.js` (add `links` to each result)
- Modify: `scripts/screenshot-map/index.js` (accumulate `routesByFrontend`, build graph, new render signature)

**Interfaces:**
- Consumes: `buildGraph` (Task 3), `render` (Task 4).
- Produces: capture results now include `links: string[]`; `index.js` writes the board to `docs/screenshot-map/index.html`.

- [ ] **Step 1: Add link harvesting to `capturePage`**

In `scripts/screenshot-map/capture.js`, update the three return paths of `capturePage` to include `links`:

- The skipped branch (currently returns without `links`) — add `links: []`:

```js
  if (resolved.status === "skipped") {
    return { ...route, resolvedUrl: resolved.resolvedUrl, status: "skipped", note: resolved.note, png: null, links: [] };
  }
```

- The success path — harvest anchors after the screenshot and include `links`:

```js
    const png = await page.screenshot({ fullPage: false });
    const links = await page.evaluate(() =>
      Array.from(document.querySelectorAll("a[href]")).map((a) => a.href),
    );
    const c = classify({ httpStatus, finalUrl, role: route.role });
    return { ...route, resolvedUrl: resolved.resolvedUrl, status: c.status, note: c.note || "", png, links };
```

- The catch branch — add `links: []`:

```js
  } catch (e) {
    return { ...route, resolvedUrl: resolved.resolvedUrl, status: "error", note: String(e.message || e), png: null, links: [] };
  } finally {
```

- [ ] **Step 2: Confirm the existing capture unit tests still pass**

Run: `cd scripts/screenshot-map && node --test capture.test.js`
Expected: PASS (2 tests — `classify`/`resolveUrl` are unchanged; the link harvest is browser-bound and verified by the e2e in Step 5).

- [ ] **Step 3: Wire `index.js` to build the graph**

In `scripts/screenshot-map/index.js`:

Change the require line:

```js
const { render, summarize } = require("./render");
```
to:
```js
const { render, summarize } = require("./render");
const { buildGraph } = require("./graph");
```

In `main()`, declare `routesByFrontend` next to `results`, populate it in the loop, and replace the render call. Replace this block:

```js
  const results = [];

  try {
    for (const fe of frontends) {
      const routes = discover(fe, REPO_ROOT);
```
with:
```js
  const results = [];
  const routesByFrontend = {};

  try {
    for (const fe of frontends) {
      const routes = discover(fe, REPO_ROOT);
      routesByFrontend[fe.name] = routes;
```

Then replace:

```js
  const html = render(results, {
    generatedAt: new Date().toISOString(),
    commit,
    summary: summarize(results),
  });
```
with:
```js
  const graph = buildGraph(results, routesByFrontend);
  const html = render(graph, {
    generatedAt: new Date().toISOString(),
    commit,
    summary: summarize(results),
  });
```

- [ ] **Step 4: Syntax-check and run the full unit suite**

Run: `cd scripts/screenshot-map && node --check index.js && node --check capture.js && node --test`
Expected: `node --check` prints nothing (OK); `node --test` reports all tests passing (vendor 1 + graph 4 + render 2 + capture 2 + discover 1 + auth 1 = 11).

- [ ] **Step 5: End-to-end run**

```bash
# Stack must be running + seeded (idempotent):
make dev          # if not already up
make seed && make seed-demos
make screenshot-map
open docs/screenshot-map/index.html
```

Verify (also assert programmatically from the run output + file):
- The pipeline completes and writes `docs/screenshot-map/index.html`.
- The file contains `id="cy"`, `cytoscape(`, at least one `data:image/png;base64,` node image, and the `global-nav links hidden` header text.
- The board opens to a pannable/zoomable canvas: screenshots as nodes inside `frontend · role` cluster boxes, directed edges between linked screens, single-click fades non-neighbors, double-click opens the full-screenshot lightbox.
- `git status` does NOT show `docs/screenshot-map/` (gitignored).

`error`/`skipped` nodes are expected (auth bounces, unmapped dynamic routes) and appear as bordered label boxes without thumbnails — not failures. If the board is a hairball, note the observed `suppressedCount`; the 70% threshold in `graph.js` is the single tuning knob.

- [ ] **Step 6: Commit**

```bash
git add scripts/screenshot-map/capture.js scripts/screenshot-map/index.js
git commit -m "feat(screenshot-map): harvest nav links and render the graph board"
```

---

## Notes / Known limitations (v1)

- **Cross-frontend edges** (a tenant page linking to the apex marketing host) are dropped — `resolveLinkToRoute` only matches within the page's own frontend host.
- **Unresolved links** (a real link to a route that wasn't captured, or an external URL) are silently dropped; the node still appears with whatever edges did resolve.
- **Layout** uses Cytoscape's built-in `cose` force layout; `fcose` (better compound packing) is a future upgrade needing extra vendored extensions.
- The lightbox shows the captured 1440×900 viewport PNG (the same asset as the node thumbnail) — there is no separate hi-res capture.
