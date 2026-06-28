# Flowmap Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A local SQLite + web-server tool that stores screens and user flows and serves a webpage visualizing each flow as a left→right DAG of screenshots; Claude captures screens, identifies flows, and registers both.

**Architecture:** Reuse the existing crawler (moved to `tools/flowmap/crawler/`). A `node:sqlite` DB layer (`db.js`), a `node:http` server with a REST API + static web UI (`server.js`), a flow-identification helper that prompts the `claude` CLI (`flows.js`), a populate script (`register.js`), and a Cytoscape + dagre web UI (`web/`).

**Tech Stack:** Node 22 (built-in `node:test`, `node:http`, `node:sqlite` via `--experimental-sqlite`), Playwright (crawl), Cytoscape + cytoscape-dagre + dagre (UI), the `claude` CLI (flow identification).

## Global Constraints

- CommonJS throughout `tools/flowmap/`; tests use built-in `node:test` + `node:assert/strict`.
- `node:sqlite` requires the `--experimental-sqlite` node flag — every run/test command that touches the DB uses it. Server uses `node:http` (no web framework). No native DB dependency.
- Runtime deps: `playwright` (register only), `cytoscape` + `cytoscape-dagre` + `dagre` (served to the browser). `tools/flowmap/node_modules`, `package-lock.json`, and `flowmap.db*` are gitignored — never commit them; commit only source with explicit `git add <paths>`.
- Screen `key` format: `"<frontend>|<url>"` (e.g. `customer|/admin/courses`).
- Thumbnails: `thumb` ≈360px JPEG data URL (node texture), `full` ≈1100px JPEG data URL (lightbox).
- Per-flow layout: dagre `rankDir: 'LR'`. Flows may span roles.
- Work from `/Users/tahayusufkomur/ws/projects-active/home-server/contentor`. The Docker dev stack is running (for the register e2e).

---

### Task 1: Scaffold `tools/flowmap/` + move the crawler

**Files:**
- Create: `tools/flowmap/package.json`
- Move: `scripts/screenshot-map/{discover,auth,capture,thumbnail,graph,frontends}.js`, their `*.test.js`, and `targets.json` → `tools/flowmap/crawler/`
- Modify (after move): `tools/flowmap/crawler/auth.js` (REPO_ROOT depth), `tools/flowmap/crawler/capture.js` (harvest `<title>`)
- Delete: the rest of `scripts/screenshot-map/` (`render.js`, `index.js`, `vendor.js`, their tests, `package.json`)
- Modify: `Makefile` (remove `screenshot-map` target), `.gitignore`

**Interfaces:**
- Produces the relocated crawler. `capturePage` now returns `{ ...route, resolvedUrl, status, note, png, links, title }`. `discover(frontend, repoRoot)`, `getContext(browser, {role,host,tenantSlug})`, `makeImages(page, pngBuffer)`, `buildGraph(results, routesByFrontend)` keep their signatures.

- [ ] **Step 1: Create the package + move the crawler files**

```bash
mkdir -p tools/flowmap/crawler
git mv scripts/screenshot-map/discover.js       tools/flowmap/crawler/discover.js
git mv scripts/screenshot-map/discover.test.js  tools/flowmap/crawler/discover.test.js
git mv scripts/screenshot-map/auth.js           tools/flowmap/crawler/auth.js
git mv scripts/screenshot-map/auth.test.js      tools/flowmap/crawler/auth.test.js
git mv scripts/screenshot-map/capture.js        tools/flowmap/crawler/capture.js
git mv scripts/screenshot-map/capture.test.js   tools/flowmap/crawler/capture.test.js
git mv scripts/screenshot-map/thumbnail.js      tools/flowmap/crawler/thumbnail.js
git mv scripts/screenshot-map/graph.js          tools/flowmap/crawler/graph.js
git mv scripts/screenshot-map/graph.test.js     tools/flowmap/crawler/graph.test.js
git mv scripts/screenshot-map/frontends.js      tools/flowmap/crawler/frontends.js
git mv scripts/screenshot-map/targets.json      tools/flowmap/crawler/targets.json
git rm -r scripts/screenshot-map          # removes the tracked remainder (render/index/vendor + tests + package.json)
rm -rf scripts/screenshot-map             # clears untracked leftovers (node_modules, package-lock.json)
```

```json
// tools/flowmap/package.json
{
  "name": "flowmap",
  "private": true,
  "type": "commonjs",
  "scripts": {
    "test": "node --experimental-sqlite --test",
    "start": "node --experimental-sqlite server.js"
  },
  "dependencies": {
    "playwright": "^1.48.0",
    "cytoscape": "^3.30.0",
    "cytoscape-dagre": "^2.5.0",
    "dagre": "^0.8.5"
  }
}
```

- [ ] **Step 2: Fix `auth.js` REPO_ROOT depth (now three levels under repo root)**

In `tools/flowmap/crawler/auth.js`, change:
```js
const REPO_ROOT = path.resolve(__dirname, "..", "..");
```
to:
```js
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
```

- [ ] **Step 3: Harvest the page `<title>` in `capture.js`**

In `tools/flowmap/crawler/capture.js`, update the three return paths of `capturePage`:

- skipped branch — add `title: null`:
```js
    return { ...route, resolvedUrl: resolved.resolvedUrl, status: "skipped", note: resolved.note, png: null, links: [], title: null };
```
- success path — harvest title alongside links:
```js
    const png = await page.screenshot({ fullPage: false });
    const links = await page.evaluate(() =>
      Array.from(document.querySelectorAll("a[href]")).map((a) => a.href),
    );
    const title = await page.evaluate(() => document.title || "");
    const c = classify({ httpStatus, finalUrl, role: route.role });
    return { ...route, resolvedUrl: resolved.resolvedUrl, status: c.status, note: c.note || "", png, links, title };
```
- catch branch — add `title: null`:
```js
    return { ...route, resolvedUrl: resolved.resolvedUrl, status: "error", note: String(e.message || e), png: null, links: [], title: null };
```

- [ ] **Step 4: Remove the old Makefile target and update .gitignore**

In `Makefile`, delete the `screenshot-map:` target (the recipe that runs `scripts/screenshot-map`).

In `.gitignore`, replace the old screenshot-map block:
```
# Generated screenshot map (regenerate with `make screenshot-map`)
docs/screenshot-map/
# npm regenerates this on every `make screenshot-map`; keep the working tree clean
scripts/screenshot-map/package-lock.json
```
with:
```
# flowmap tool
tools/flowmap/node_modules/
tools/flowmap/package-lock.json
tools/flowmap/flowmap.db
tools/flowmap/flowmap.db-wal
tools/flowmap/flowmap.db-shm
```

- [ ] **Step 5: Install deps and verify the moved crawler tests pass**

```bash
cd tools/flowmap && npm install --silent
node --test crawler/discover.test.js crawler/auth.test.js crawler/capture.test.js crawler/graph.test.js
```
Expected: all pass (discover 1, auth 1, capture 2, graph 4 = 8). `node --check crawler/capture.js && node --check crawler/auth.js` → parse OK.

- [ ] **Step 6: Commit**

The `git mv` and `git rm` in Step 1 already staged the moves and deletions. Stage the new + modified files and commit them together:

```bash
git add tools/flowmap/package.json tools/flowmap/crawler Makefile .gitignore
git status --short | grep -E '^R|^D|^A|^M' | grep -E 'screenshot-map|flowmap|Makefile|gitignore' | head
git commit -m "refactor(flowmap): scaffold tools/flowmap and relocate the crawler"
```
Expected: the status shows the crawler files renamed (`R`) into `tools/flowmap/crawler/`, the static files deleted (`D`), and the new `package.json` + modified `Makefile`/`.gitignore` added.

---

### Task 2: `db.js` — SQLite layer

**Files:**
- Create: `tools/flowmap/db.js`
- Test: `tools/flowmap/db.test.js`

**Interfaces:**
- Produces `open(dbPath)` → a handle with: `upsertScreen(s)`, `getScreens()`, `getScreen(key)`, `createFlow({name,description,steps})→id`, `listFlows()`, `getFlow(id)`, `deleteFlow(id)`, `reset()`, `close()`. Screen `s = {key,url,role,frontend,title,thumb,full}`; step `{from,to,label}`. Consumed by `server.js` (Task 4) and `register.js` (Task 6).

- [ ] **Step 1: Write the failing test**

```js
// tools/flowmap/db.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os"), path = require("node:path"), fs = require("node:fs");
const { open } = require("./db");

const tmpDb = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "fm-")), "t.db");

test("screens upsert is idempotent and getScreens omits full", () => {
  const db = open(tmpDb());
  db.upsertScreen({ key: "customer|/a", url: "/a", role: "coach", frontend: "customer", title: "A", thumb: "T", full: "F" });
  db.upsertScreen({ key: "customer|/a", url: "/a", role: "coach", frontend: "customer", title: "A2", thumb: "T2", full: "F2" });
  const list = db.getScreens();
  assert.equal(list.length, 1);
  assert.equal(list[0].title, "A2");
  assert.equal(list[0].full, undefined);
  assert.equal(db.getScreen("customer|/a").full, "F2");
  assert.equal(db.getScreen("nope"), null);
  db.close();
});

test("flow round-trips with steps + involved screens, and cascades on delete", () => {
  const db = open(tmpDb());
  for (const k of ["main|/", "main|/plans", "main|/checkout"]) {
    db.upsertScreen({ key: k, url: k.split("|")[1], role: "anon", frontend: "main", title: k, thumb: "t" });
  }
  const id = db.createFlow({ name: "Subscribe", description: "d", steps: [
    { from: "main|/", to: "main|/plans", label: "see plans" },
    { from: "main|/plans", to: "main|/checkout" },
  ] });
  const list = db.listFlows();
  assert.equal(list.length, 1);
  assert.equal(list[0].stepCount, 2);
  const flow = db.getFlow(id);
  assert.equal(flow.steps.length, 2);
  assert.equal(flow.steps[0].from, "main|/");
  assert.equal(flow.steps[0].label, "see plans");
  assert.equal(flow.screens.length, 3);
  db.deleteFlow(id);
  assert.equal(db.listFlows().length, 0);
  assert.equal(db.getFlow(id), null);
  db.close();
});

test("reset clears everything", () => {
  const db = open(tmpDb());
  db.upsertScreen({ key: "a", url: "/a" });
  db.createFlow({ name: "f", steps: [] });
  db.reset();
  assert.equal(db.getScreens().length, 0);
  assert.equal(db.listFlows().length, 0);
  db.close();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tools/flowmap && node --experimental-sqlite --test db.test.js`
Expected: FAIL — `Cannot find module './db'`.

- [ ] **Step 3: Write `db.js`**

```js
// tools/flowmap/db.js
const { DatabaseSync } = require("node:sqlite");

function open(dbPath) {
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS screens (
      key TEXT PRIMARY KEY, url TEXT NOT NULL, role TEXT, frontend TEXT, title TEXT,
      thumb TEXT, full TEXT, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS flows (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS flow_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      flow_id INTEGER NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
      from_key TEXT NOT NULL, to_key TEXT NOT NULL, ord INTEGER NOT NULL, label TEXT
    );
  `);

  const now = () => new Date().toISOString();
  return {
    upsertScreen(s) {
      db.prepare(`
        INSERT INTO screens (key, url, role, frontend, title, thumb, full, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          url = excluded.url, role = excluded.role, frontend = excluded.frontend,
          title = excluded.title, thumb = excluded.thumb, full = excluded.full, updated_at = excluded.updated_at
      `).run(s.key, s.url, s.role ?? null, s.frontend ?? null, s.title ?? null, s.thumb ?? null, s.full ?? null, now());
    },
    getScreens() {
      return db.prepare(`SELECT key, url, role, frontend, title, thumb FROM screens ORDER BY key`).all();
    },
    getScreen(key) {
      return db.prepare(`SELECT key, url, role, frontend, title, thumb, full FROM screens WHERE key = ?`).get(key) ?? null;
    },
    createFlow({ name, description, steps }) {
      const info = db.prepare(`INSERT INTO flows (name, description, created_at) VALUES (?, ?, ?)`).run(name, description ?? null, now());
      const flowId = Number(info.lastInsertRowid);
      const ins = db.prepare(`INSERT INTO flow_steps (flow_id, from_key, to_key, ord, label) VALUES (?, ?, ?, ?, ?)`);
      (steps || []).forEach((st, i) => ins.run(flowId, st.from, st.to, i, st.label ?? null));
      return flowId;
    },
    listFlows() {
      return db.prepare(`
        SELECT f.id, f.name, f.description,
          (SELECT COUNT(*) FROM flow_steps s WHERE s.flow_id = f.id) AS stepCount
        FROM flows f ORDER BY f.id
      `).all();
    },
    getFlow(id) {
      const flow = db.prepare(`SELECT id, name, description FROM flows WHERE id = ?`).get(id);
      if (!flow) return null;
      const steps = db.prepare(`SELECT from_key AS "from", to_key AS "to", ord, label FROM flow_steps WHERE flow_id = ? ORDER BY ord`).all(id);
      const keys = [...new Set(steps.flatMap((s) => [s.from, s.to]))];
      const screens = keys.length
        ? db.prepare(`SELECT key, url, role, title, thumb FROM screens WHERE key IN (${keys.map(() => "?").join(",")})`).all(...keys)
        : [];
      return { ...flow, steps, screens };
    },
    deleteFlow(id) {
      db.prepare(`DELETE FROM flows WHERE id = ?`).run(id);
    },
    reset() {
      db.exec(`DELETE FROM flow_steps; DELETE FROM flows; DELETE FROM screens;`);
    },
    close() {
      db.close();
    },
  };
}

module.exports = { open };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd tools/flowmap && node --experimental-sqlite --test db.test.js`
Expected: PASS (3 tests). (An `ExperimentalWarning` on stderr is expected and harmless.)

- [ ] **Step 5: Commit**

```bash
git add tools/flowmap/db.js tools/flowmap/db.test.js
git commit -m "feat(flowmap): node:sqlite screens + flows store"
```

---

### Task 3: `flows.js` — claude-CLI prompt + parser

**Files:**
- Create: `tools/flowmap/flows.js`
- Test: `tools/flowmap/flows.test.js`

**Interfaces:**
- Produces `buildPrompt(screens, edges)` → string (screens: `{key,url,role,title}`; edges: `{source,target}`); `parseFlows(text, validKeys)` → `{ flows: [{name,description,steps:[{from,to,label}]}], warnings: [string] }`. Consumed by `register.js` (Task 6).

- [ ] **Step 1: Write the failing test**

```js
// tools/flowmap/flows.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildPrompt, parseFlows } = require("./flows");

test("buildPrompt includes every screen and edge and asks for JSON", () => {
  const p = buildPrompt(
    [{ key: "main|/", url: "/", role: "anon", title: "Home" }, { key: "main|/plans", url: "/plans", role: "anon", title: "Plans" }],
    [{ source: "main|/", target: "main|/plans" }],
  );
  assert.match(p, /main\|\//);
  assert.match(p, /main\|\/plans/);
  assert.match(p, /main\|\/ -> main\|\/plans/);
  assert.match(p, /JSON array/i);
});

test("parseFlows extracts a valid array, drops malformed, flags unknown keys", () => {
  const valid = ["main|/", "main|/plans"];
  const text =
    'sure:\n[{"name":"Subscribe","description":"d","steps":[{"from":"main|/","to":"main|/plans","label":"go"},{"from":"main|/plans","to":"main|/ghost"}]},{"name":"bad"}]\ndone';
  const { flows, warnings } = parseFlows(text, valid);
  assert.equal(flows.length, 1);
  assert.equal(flows[0].name, "Subscribe");
  assert.equal(flows[0].steps.length, 2);
  assert.ok(warnings.some((w) => w.includes("main|/ghost")));
  assert.ok(warnings.some((w) => w.toLowerCase().includes("malformed")));
});

test("parseFlows handles non-JSON gracefully", () => {
  const { flows, warnings } = parseFlows("no json here", []);
  assert.equal(flows.length, 0);
  assert.ok(warnings.length > 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tools/flowmap && node --test flows.test.js`
Expected: FAIL — `Cannot find module './flows'`.

- [ ] **Step 3: Write `flows.js`**

```js
// tools/flowmap/flows.js
function buildPrompt(screens, edges) {
  const screenLines = screens
    .map((s) => `${s.key} [${s.role || "?"}] ${s.title ? `"${s.title}" ` : ""}${s.url}`)
    .join("\n");
  const edgeLines = edges.map((e) => `${e.source} -> ${e.target}`).join("\n");
  return [
    "You are mapping the user flows of a web app from its screens and navigation links.",
    "",
    "Screens (key [role] \"title\" url):",
    screenLines,
    "",
    "Navigation links (source -> target):",
    edgeLines,
    "",
    "Identify the distinct, coherent USER FLOWS — real journeys a user takes (e.g. sign up & subscribe,",
    "browse & buy a course, coach creates a course). A flow may span roles. Aim for 4-10 focused flows.",
    "",
    "Return ONLY a JSON array, no prose, no markdown fences. Each element:",
    '{ "name": string, "description": string, "steps": [ { "from": <screen key>, "to": <screen key>, "label": <short action> } ] }',
    "Use only the screen keys listed above. Order the steps in the direction the user progresses.",
  ].join("\n");
}

function parseFlows(text, validKeys) {
  const valid = new Set(validKeys);
  const warnings = [];
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  let arr;
  try {
    arr = JSON.parse(start >= 0 && end > start ? text.slice(start, end + 1) : text);
  } catch {
    return { flows: [], warnings: ["could not parse a JSON array from claude output"] };
  }
  if (!Array.isArray(arr)) return { flows: [], warnings: ["claude output was not a JSON array"] };

  const flows = [];
  for (const f of arr) {
    if (!f || typeof f.name !== "string" || !Array.isArray(f.steps)) {
      warnings.push("dropped a malformed flow");
      continue;
    }
    const steps = [];
    for (const st of f.steps) {
      if (!st || typeof st.from !== "string" || typeof st.to !== "string") {
        warnings.push(`flow "${f.name}": dropped a malformed step`);
        continue;
      }
      if (!valid.has(st.from)) warnings.push(`flow "${f.name}": unknown screen ${st.from}`);
      if (!valid.has(st.to)) warnings.push(`flow "${f.name}": unknown screen ${st.to}`);
      steps.push({ from: st.from, to: st.to, label: typeof st.label === "string" ? st.label : null });
    }
    if (steps.length) flows.push({ name: f.name, description: typeof f.description === "string" ? f.description : null, steps });
    else warnings.push(`flow "${f.name}": no valid steps, dropped`);
  }
  return { flows, warnings };
}

module.exports = { buildPrompt, parseFlows };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd tools/flowmap && node --test flows.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add tools/flowmap/flows.js tools/flowmap/flows.test.js
git commit -m "feat(flowmap): claude-CLI flow-identification prompt + parser"
```

---

### Task 4: `server.js` — HTTP API + static server

**Files:**
- Create: `tools/flowmap/server.js`
- Create: `tools/flowmap/web/index.html` (stub; replaced in Task 5)
- Test: `tools/flowmap/server.test.js`

**Interfaces:**
- Consumes `open` from `db.js` (Task 2).
- Produces `createServer(db)` → a non-listening `http.Server`. Routes per the spec's REST API. When run directly (`node server.js`) it opens `flowmap.db` and listens on `FLOWMAP_PORT` (default 7878). Consumed by the web UI (Task 5) and `register.js` shares the same DB file (Task 6).

- [ ] **Step 1: Create the stub page**

```html
<!-- tools/flowmap/web/index.html -->
<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Flowmap</title></head>
<body><p>flowmap</p></body></html>
```

- [ ] **Step 2: Write the failing test**

```js
// tools/flowmap/server.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os"), path = require("node:path"), fs = require("node:fs");
const { open } = require("./db");
const { createServer } = require("./server");

async function withServer(fn) {
  const dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "fm-")), "t.db");
  const db = open(dbPath);
  const srv = createServer(db);
  await new Promise((r) => srv.listen(0, r));
  const base = `http://localhost:${srv.address().port}`;
  try { await fn(base); } finally { srv.close(); db.close(); }
}
const post = (base, p, body) =>
  fetch(base + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

test("screens + flows round-trip over HTTP", async () => {
  await withServer(async (base) => {
    let r = await post(base, "/api/screens", [
      { key: "main|/", url: "/", role: "anon", frontend: "main", title: "Home", thumb: "t1", full: "f1" },
      { key: "main|/plans", url: "/plans", role: "anon", frontend: "main", title: "Plans", thumb: "t2", full: "f2" },
    ]);
    assert.equal(r.status, 200);
    const screens = await (await fetch(base + "/api/screens")).json();
    assert.equal(screens.length, 2);
    assert.equal(screens[0].full, undefined);
    const one = await (await fetch(base + "/api/screens/" + encodeURIComponent("main|/"))).json();
    assert.equal(one.full, "f1");
    const { id } = await (await post(base, "/api/flows", { name: "Subscribe", steps: [{ from: "main|/", to: "main|/plans", label: "go" }] })).json();
    const flows = await (await fetch(base + "/api/flows")).json();
    assert.equal(flows.length, 1);
    assert.equal(flows[0].stepCount, 1);
    const flow = await (await fetch(base + "/api/flows/" + id)).json();
    assert.equal(flow.steps.length, 1);
    assert.equal(flow.screens.length, 2);
    assert.equal((await fetch(base + "/api/flows/" + id, { method: "DELETE" })).status, 200);
    assert.equal((await (await fetch(base + "/api/flows")).json()).length, 0);
  });
});

test("bad json -> 400, unknown route -> 404, index served", async () => {
  await withServer(async (base) => {
    let r = await fetch(base + "/api/flows", { method: "POST", headers: { "content-type": "application/json" }, body: "{not json" });
    assert.equal(r.status, 400);
    assert.equal((await fetch(base + "/api/nope")).status, 404);
    r = await fetch(base + "/");
    assert.equal(r.status, 200);
    assert.match(await r.text(), /flowmap/i);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd tools/flowmap && node --experimental-sqlite --test server.test.js`
Expected: FAIL — `Cannot find module './server'`.

- [ ] **Step 4: Write `server.js`**

```js
// tools/flowmap/server.js
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const WEB = path.join(__dirname, "web");
const VENDOR = {
  "/vendor/cytoscape.min.js": path.join(__dirname, "node_modules/cytoscape/dist/cytoscape.min.js"),
  "/vendor/dagre.min.js": path.join(__dirname, "node_modules/dagre/dist/dagre.min.js"),
  "/vendor/cytoscape-dagre.js": path.join(__dirname, "node_modules/cytoscape-dagre/cytoscape-dagre.js"),
};
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };

function send(res, status, body, type = "application/json") {
  res.writeHead(status, { "content-type": type });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "", size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > 64 * 1024 * 1024) { reject(new Error("body too large")); req.destroy(); return; }
      data += c;
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function createServer(db) {
  return http.createServer(async (req, res) => {
    const { pathname } = new URL(req.url, "http://localhost");
    const method = req.method;
    let m;
    try {
      if (pathname === "/api/screens" && method === "POST") {
        const body = JSON.parse(await readBody(req));
        const arr = Array.isArray(body) ? body : [body];
        for (const s of arr) db.upsertScreen(s);
        return send(res, 200, { ok: true, count: arr.length });
      }
      if (pathname === "/api/screens" && method === "GET") return send(res, 200, db.getScreens());
      if ((m = pathname.match(/^\/api\/screens\/(.+)$/)) && method === "GET") {
        const s = db.getScreen(decodeURIComponent(m[1]));
        return s ? send(res, 200, s) : send(res, 404, { error: "not found" });
      }
      if (pathname === "/api/flows" && method === "POST") {
        const body = JSON.parse(await readBody(req));
        if (!body || typeof body.name !== "string") return send(res, 400, { error: "name required" });
        return send(res, 200, { id: db.createFlow({ name: body.name, description: body.description, steps: body.steps || [] }) });
      }
      if (pathname === "/api/flows" && method === "GET") return send(res, 200, db.listFlows());
      if ((m = pathname.match(/^\/api\/flows\/(\d+)$/)) && method === "GET") {
        const f = db.getFlow(Number(m[1]));
        return f ? send(res, 200, f) : send(res, 404, { error: "not found" });
      }
      if ((m = pathname.match(/^\/api\/flows\/(\d+)$/)) && method === "DELETE") {
        db.deleteFlow(Number(m[1]));
        return send(res, 200, { ok: true });
      }
      if (pathname === "/api/reset" && method === "POST") {
        db.reset();
        return send(res, 200, { ok: true });
      }
      if (VENDOR[pathname]) return send(res, 200, fs.readFileSync(VENDOR[pathname]), "text/javascript");
      const rel = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
      const fp = path.join(WEB, rel);
      if (fp.startsWith(WEB) && fs.existsSync(fp) && fs.statSync(fp).isFile()) {
        return send(res, 200, fs.readFileSync(fp), TYPES[path.extname(fp)] || "application/octet-stream");
      }
      return send(res, 404, { error: "not found" });
    } catch (e) {
      return send(res, 400, { error: String(e.message || e) });
    }
  });
}

if (require.main === module) {
  const { open } = require("./db");
  const PORT = process.env.FLOWMAP_PORT || 7878;
  const db = open(path.join(__dirname, "flowmap.db"));
  createServer(db).listen(PORT, () => console.log(`flowmap → http://localhost:${PORT}`));
}

module.exports = { createServer };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd tools/flowmap && node --experimental-sqlite --test server.test.js`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add tools/flowmap/server.js tools/flowmap/server.test.js tools/flowmap/web/index.html
git commit -m "feat(flowmap): http server with screens/flows REST API + static serving"
```

---

### Task 5: Web UI — flow explorer

**Files:**
- Modify: `tools/flowmap/web/index.html` (full page)
- Create: `tools/flowmap/web/styles.css`
- Create: `tools/flowmap/web/app.js`

**Interfaces:**
- Consumes the REST API (Task 4) and the vendored libs at `/vendor/*`. No exports (browser entrypoint); verified by serving + a seeded DB.

- [ ] **Step 1: Write the full `index.html`**

```html
<!-- tools/flowmap/web/index.html -->
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Flowmap</title>
  <link rel="stylesheet" href="/styles.css" />
</head>
<body>
  <aside id="sidebar"><h1>Flows</h1><div id="flows"></div></aside>
  <main id="cy"></main>
  <div id="lb"><img id="lbimg" alt="" /><div class="cap" id="lbcap"></div></div>
  <script src="/vendor/cytoscape.min.js"></script>
  <script src="/vendor/dagre.min.js"></script>
  <script src="/vendor/cytoscape-dagre.js"></script>
  <script src="/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write `styles.css`**

```css
/* tools/flowmap/web/styles.css */
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; background: #0f1115; color: #e7e9ee; font: 14px system-ui, sans-serif; }
body { display: flex; height: 100vh; }
#sidebar { width: 260px; flex: 0 0 260px; border-right: 1px solid #262a33; overflow-y: auto; padding: 12px; }
#sidebar h1 { font-size: 13px; text-transform: uppercase; letter-spacing: .08em; color: #9aa1ad; margin: 4px 6px 12px; }
.flow { display: flex; justify-content: space-between; align-items: center; width: 100%; text-align: left; background: none; border: 1px solid transparent; color: #c7ccd6; padding: 8px 10px; border-radius: 8px; cursor: pointer; font-size: 13px; margin-bottom: 4px; }
.flow:hover { background: #161922; }
.flow.active { background: #1b1f2a; border-color: #2b3040; color: #e7e9ee; }
.flow .count { font-size: 11px; color: #6b7280; background: #0c0e12; border-radius: 999px; padding: 1px 7px; }
.empty { color: #9aa1ad; font-size: 12px; padding: 10px; }
.empty code { color: #c7ccd6; }
#cy { flex: 1; height: 100%; }
#lb { position: fixed; inset: 0; z-index: 10; background: rgba(0,0,0,.85); display: none; align-items: center; justify-content: center; flex-direction: column; gap: 10px; cursor: zoom-out; }
#lb img { max-width: 92vw; max-height: 82vh; border: 1px solid #2b3040; border-radius: 8px; }
#lb .cap { color: #c7ccd6; font-size: 13px; }
```

- [ ] **Step 3: Write `app.js`**

```js
// tools/flowmap/web/app.js
cytoscape.use(cytoscapeDagre);

const flowsEl = document.getElementById("flows");
const cyEl = document.getElementById("cy");
const lb = document.getElementById("lb");
let cy = null;

async function loadFlows() {
  const flows = await (await fetch("/api/flows")).json();
  flowsEl.innerHTML = "";
  if (!flows.length) {
    flowsEl.innerHTML = '<div class="empty">No flows registered yet. Run <code>make flowmap-register</code>.</div>';
    return;
  }
  flows.forEach((f, i) => {
    const btn = document.createElement("button");
    btn.className = "flow";
    btn.append(document.createTextNode(f.name));
    const c = document.createElement("span");
    c.className = "count";
    c.textContent = f.stepCount;
    btn.append(c);
    btn.onclick = () => {
      document.querySelectorAll(".flow").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      showFlow(f.id);
    };
    flowsEl.append(btn);
    if (i === 0) btn.click();
  });
}

async function showFlow(id) {
  const flow = await (await fetch("/api/flows/" + id)).json();
  const byKey = Object.fromEntries(flow.screens.map((s) => [s.key, s]));
  const elements = [];
  const seen = new Set();
  const addNode = (k) => {
    if (seen.has(k)) return;
    seen.add(k);
    const s = byKey[k] || { key: k, url: k, role: "" };
    const data = { id: k, label: s.url || k, role: s.role || "" };
    if (s.thumb) data.img = s.thumb;
    elements.push({ data });
  };
  flow.steps.forEach((st, i) => {
    addNode(st.from);
    addNode(st.to);
    elements.push({ data: { id: "e" + i, source: st.from, target: st.to, label: st.label || "" } });
  });

  if (cy) cy.destroy();
  cy = cytoscape({
    container: cyEl,
    elements,
    style: [
      { selector: "node[img]", style: { width: 150, height: 94, shape: "round-rectangle", "background-fit": "cover", "background-image": "data(img)", "background-color": "#1b1f2a", "border-width": 2, "border-color": "#3b4252", label: "data(label)", "font-size": 8, color: "#c7ccd6", "text-valign": "bottom", "text-margin-y": 4, "text-max-width": 150, "text-wrap": "ellipsis" } },
      { selector: "node[!img]", style: { width: 150, height: 94, shape: "round-rectangle", "background-color": "#222a3a", "border-width": 2, "border-color": "#3b4252", label: "data(label)", "font-size": 8, color: "#9aa1ad", "text-valign": "bottom", "text-margin-y": 4, "text-max-width": 150, "text-wrap": "ellipsis" } },
      { selector: "edge", style: { width: 1.5, "line-color": "#5b6477", "target-arrow-color": "#5b6477", "target-arrow-shape": "triangle", "arrow-scale": 0.9, "curve-style": "bezier", label: "data(label)", "font-size": 8, color: "#9aa1ad", "text-background-color": "#0f1115", "text-background-opacity": 1, "text-background-padding": 2 } },
    ],
    layout: { name: "dagre", rankDir: "LR", nodeSep: 30, rankSep: 80, padding: 30 },
  });

  cy.on("dbltap", "node", async (e) => {
    const s = await (await fetch("/api/screens/" + encodeURIComponent(e.target.id))).json();
    if (!s || !s.full) return;
    document.getElementById("lbimg").src = s.full;
    document.getElementById("lbcap").textContent = (s.url || "") + "  ·  " + (s.role || "");
    lb.style.display = "flex";
  });
}

lb.addEventListener("click", () => { lb.style.display = "none"; });
loadFlows();
```

- [ ] **Step 4: Verify the page renders a seeded flow (manual, in a browser)**

```bash
cd tools/flowmap
# seed a tiny DB so the page has something to draw:
node --experimental-sqlite -e '
const {open}=require("./db"); const db=open("flowmap.db"); db.reset();
for (const [k,u] of [["main|/","/"],["main|/plans","/plans"],["main|/checkout","/checkout"]]) db.upsertScreen({key:k,url:u,role:"anon",frontend:"main",title:u});
db.createFlow({name:"Sign up & subscribe",description:"demo",steps:[{from:"main|/",to:"main|/plans",label:"see plans"},{from:"main|/plans",to:"main|/checkout",label:"subscribe"}]});
db.close(); console.log("seeded");'
node --experimental-sqlite server.js &
sleep 1 && open http://localhost:7878
```
Expected: the sidebar lists "Sign up & subscribe (2)"; the canvas shows a left→right dagre flow of 3 boxes connected by labelled arrows ("see plans", "subscribe"). Stop the server (`kill %1`) and remove the scratch DB (`rm -f flowmap.db flowmap.db-*`) before committing.

- [ ] **Step 5: Commit**

```bash
git add tools/flowmap/web/index.html tools/flowmap/web/styles.css tools/flowmap/web/app.js
git commit -m "feat(flowmap): flow-explorer web UI (sidebar + per-flow dagre DAG + lightbox)"
```

---

### Task 6: `register.js` + Makefile targets + end-to-end

**Files:**
- Create: `tools/flowmap/register.js`
- Modify: `Makefile` (add `flowmap` and `flowmap-register` targets)

**Interfaces:**
- Consumes the crawler (Task 1), `makeImages` (Task 1), `buildGraph` (Task 1), `buildPrompt`/`parseFlows` (Task 3), `open` (Task 2). Produces a populated `flowmap.db`.

- [ ] **Step 1: Write `register.js`**

```js
// tools/flowmap/register.js
const path = require("node:path");
const { execSync, execFileSync } = require("node:child_process");
const { chromium } = require("playwright");

const frontends = require("./crawler/frontends");
const targets = require("./crawler/targets.json");
const { discover } = require("./crawler/discover");
const { getContext } = require("./crawler/auth");
const { capturePage } = require("./crawler/capture");
const { makeImages } = require("./crawler/thumbnail");
const { buildGraph } = require("./crawler/graph");
const { buildPrompt, parseFlows } = require("./flows");
const { open } = require("./db");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const DB_PATH = path.join(__dirname, "flowmap.db");

function preflight() {
  for (const host of new Set(frontends.map((f) => f.host))) {
    try {
      execSync(`curl -s --max-time 8 -o /dev/null -H "Host: ${host}" http://localhost/`, { timeout: 10000 });
    } catch {
      console.error(`✗ ${host} not reachable via Caddy. Run: make dev && make seed && make seed-demos`);
      process.exit(1);
    }
  }
}

async function main() {
  preflight();
  const db = open(DB_PATH);
  if (process.argv.includes("--reset")) db.reset();

  const browser = await chromium.launch();
  const resizePage = await browser.newPage();
  const results = [];
  const routesByFrontend = {};
  try {
    for (const fe of frontends) {
      const routes = discover(fe, REPO_ROOT);
      routesByFrontend[fe.name] = routes;
      const roles = [...new Set(routes.map((r) => r.role))];
      const contexts = {};
      for (const role of roles) contexts[role] = await getContext(browser, { role, host: fe.host, tenantSlug: targets.tenantSlug });
      for (const route of routes) {
        const res = await capturePage(contexts[route.role], route, targets);
        let thumb = null, full = null;
        if (res.png) { const imgs = await makeImages(resizePage, res.png); thumb = imgs.thumb; full = imgs.full; }
        const key = `${res.frontend}|${res.url}`;
        db.upsertScreen({ key, url: res.url, role: res.role, frontend: res.frontend, title: res.title || null, thumb, full });
        results.push(res);
        process.stdout.write(`· ${key} ${res.status}\n`);
      }
      for (const role of roles) await contexts[role].close();
    }
  } finally {
    await browser.close();
  }

  const graph = buildGraph(results, routesByFrontend);
  const titleByKey = Object.fromEntries(results.map((r) => [`${r.frontend}|${r.url}`, r.title || ""]));
  const screens = graph.nodes.map((n) => ({ key: n.id, url: n.label, role: n.role, title: titleByKey[n.id] || "" }));
  const prompt = buildPrompt(screens, graph.edges);

  console.log(`\nAsking claude to identify flows over ${screens.length} screens / ${graph.edges.length} links …`);
  let out = "";
  try {
    out = execFileSync("claude", ["-p", prompt], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  } catch (e) {
    console.error("claude CLI failed:", String((e && e.stderr) || (e && e.message) || e));
  }
  const { flows, warnings } = parseFlows(out, screens.map((s) => s.key));
  for (const f of flows) db.createFlow(f);
  warnings.slice(0, 12).forEach((w) => console.warn("  ⚠ " + w));
  console.log(`\n✓ Registered ${screens.length} screens and ${flows.length} flows into ${DB_PATH}`);
  db.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Add the Makefile targets**

Append to `Makefile` (tab-indented recipes):

```makefile
flowmap: ## Serve the flow visualizer at http://localhost:7878
	cd tools/flowmap && npm install --silent && node --experimental-sqlite server.js

flowmap-register: ## Crawl, identify flows via Claude, and fill the flowmap DB (use ARGS=--reset to wipe first)
	cd tools/flowmap && npm install --silent && npx playwright install chromium && node --experimental-sqlite register.js $(ARGS)
```

- [ ] **Step 3: Run the full unit suite**

Run: `cd tools/flowmap && node --experimental-sqlite --test`
Expected: all pass — crawler (discover 1, auth 1, capture 2, graph 4) + db 3 + flows 3 + server 2 = 16 tests.

- [ ] **Step 4: End-to-end run**

```bash
# stack up + seeded:
make dev && make seed && make seed-demos
make flowmap-register ARGS=--reset    # crawls, asks claude for flows, fills the DB
make flowmap                          # serve
open http://localhost:7878
```
Expected (assert from the run output + the page):
- `register` prints per-screen lines, then `✓ Registered N screens and M flows`.
- The page sidebar lists the identified flows; selecting one renders a clean left→right dagre DAG of real screenshots with labelled arrows; double-click opens the full screenshot.
- `git status` does NOT show `tools/flowmap/flowmap.db` (gitignored).

If `claude -p` yields no parseable flows, `register` still registers the screens and prints `0 flows`; the page shows the empty-flows hint. That's a claude-output issue, not a code failure — re-run, or register a flow by hand via `curl -X POST .../api/flows`.

- [ ] **Step 5: Commit**

```bash
git add tools/flowmap/register.js Makefile
git commit -m "feat(flowmap): crawl + claude flow identification populate pipeline"
```

---

## Notes / Known limitations (v1)

- Flow identification quality depends on `claude -p`; the prompt asks for 4-10 focused flows. The `GLOBAL_NAV_THRESHOLD` suppression in `graph.js` keeps the edge list (Claude's input) free of nav-chrome noise.
- Screens a flow references but the crawl skipped (unmapped dynamic routes) render as labelled boxes without thumbnails.
- The DB is local and gitignored; re-run `make flowmap-register ARGS=--reset` to rebuild. Claude/you can also add or edit flows live via the HTTP API while the server runs.
- `node:sqlite` is experimental in Node 22; the `--experimental-sqlite` flag (in the make targets and the `test` script) is required and prints a harmless stderr warning.
