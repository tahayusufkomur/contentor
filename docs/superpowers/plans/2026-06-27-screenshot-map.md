# Screenshot Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `make screenshot-map` generator that boots the seeded local stack, logs in as each role, crawls both Next.js frontends, screenshots every page, and emits one self-contained HTML visual sitemap.

**Architecture:** A standalone Node + Playwright project at `scripts/screenshot-map/` with four pure-ish units (`discover` → `auth` → `capture` → `render`) wired by `index.js`, driven by a `frontends.js` config and a hand-maintained `targets.json`. Authentication uses a new dev-only Django management command `issue_login_token` that prints a session JWT (`create_jwt(user, tenant)`); the crawler injects it as the `contentor_access_token` cookie — no email round-trip.

**Tech Stack:** Node 22 (built-in `node:test` runner), Playwright (Chromium), Django management command (Python), Docker Compose.

## Global Constraints

- **Node 22 on host.** Use the built-in `node:test` + `node:assert/strict`. Playwright is the ONLY runtime dependency. Do not add jest/vitest.
- **JS module style:** CommonJS (`require` / `module.exports`) throughout `scripts/screenshot-map/`.
- **Session cookie:** name `contentor_access_token`, `httpOnly: true`, `secure: false`, `sameSite: "Lax"`, `path: "/"`. (Copied from `backend/apps/accounts/views.py:146`.)
- **Session JWT:** minted via `create_jwt(user, tenant)` from `apps.accounts.tokens` (signature `create_jwt(user, tenant, region=None, extra_claims=None)`).
- **Seeded logins:** coach = `demo-coach@contentor.app`, student = `demo-student@contentor.app` (both live in the tenant schema; constants in `backend/apps/core/demo/views.py`). Superadmin = first `User.objects.filter(is_superuser=True)` (public schema).
- **`apps.accounts` is in BOTH SHARED_APPS and TENANT_APPS** → the User table exists per-schema. Resolve coach/student users inside `django_tenants.utils.tenant_context(tenant)`. Resolve superadmin in the default (public) schema.
- **Hosts:** `frontend-main` → `localhost`; `frontend-customer` → `<slug>.localhost` (default slug `yoga`). Chromium resolves `*.localhost` to loopback automatically; macOS `curl` does NOT, so preflight curls `http://localhost/` with a `Host:` header instead.
- **Backend tests run in Docker:** `docker compose exec -T django pytest <path> -v`. Management commands run via `docker compose exec -T django python manage.py <cmd>`.
- **Output:** `docs/screenshot-map/index.html`, gitignored.
- **Repo rules (from CLAUDE.md):** pre-commit must pass with zero issues — run `make format` before committing backend changes; do not create stray `.md` files; the commit steps in this plan ARE the explicit authorization to commit while executing it. After the final task, run the end-to-end verification before claiming done.

---

### Task 1: `issue_login_token` Django management command

**Files:**
- Create: `backend/apps/accounts/management/commands/issue_login_token.py`
- Test: `backend/apps/accounts/tests/test_issue_login_token.py`

**Interfaces:**
- Consumes: `apps.accounts.tokens.create_jwt(user, tenant)`, `apps.core.models.Tenant`, `apps.accounts.models.User`, `apps.core.demo.views.{DEMO_COACH_EMAIL, DEMO_STUDENT_EMAIL}`.
- Produces: CLI `python manage.py issue_login_token --role {superadmin|coach|student} [--tenant <slug>]` that prints a single session JWT line to stdout. Used by `auth.js` (Task 3).

- [ ] **Step 1: Write the failing test**

```python
# backend/apps/accounts/tests/test_issue_login_token.py
from io import StringIO

import jwt
import pytest
from django.conf import settings
from django.core.management import call_command
from django.core.management.base import CommandError

from apps.accounts.models import User


@pytest.mark.django_db
def test_refuses_when_not_debug(settings):
    settings.DEBUG = False
    with pytest.raises(CommandError):
        call_command("issue_login_token", "--role", "superadmin")


@pytest.mark.django_db
def test_superadmin_token_is_a_decodable_jwt(settings):
    settings.DEBUG = True
    User.objects.create_user(email="root@contentor.app", name="Root", is_superuser=True, is_staff=True)
    out = StringIO()
    call_command("issue_login_token", "--role", "superadmin", stdout=out)
    token = out.getvalue().strip()
    assert token
    payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
    assert isinstance(payload, dict)


@pytest.mark.django_db
def test_no_superuser_raises(settings):
    settings.DEBUG = True
    with pytest.raises(CommandError):
        call_command("issue_login_token", "--role", "superadmin")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec -T django pytest apps/accounts/tests/test_issue_login_token.py -v`
Expected: FAIL — `Unknown command: 'issue_login_token'`.

- [ ] **Step 3: Write the command**

```python
# backend/apps/accounts/management/commands/issue_login_token.py
"""Dev-only: print a session JWT for a seeded user.

Used by the screenshot-map crawler (scripts/screenshot-map) to log in as each
role without an email round-trip. Mints the same session token the magic-link
verify flow produces, then the crawler injects it as the contentor_access_token
cookie. Refuses to run outside DEBUG so it can never mint a login in prod.
"""

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django_tenants.utils import tenant_context

from apps.accounts.models import User
from apps.accounts.tokens import create_jwt
from apps.core.demo.views import DEMO_COACH_EMAIL, DEMO_STUDENT_EMAIL
from apps.core.models import Tenant


class Command(BaseCommand):
    help = "Print a session JWT for a seeded user (dev only)."

    def add_arguments(self, parser):
        parser.add_argument("--role", required=True, choices=["superadmin", "coach", "student"])
        parser.add_argument("--tenant", default="", help="Tenant slug (required for coach/student)")

    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError("issue_login_token is dev-only (DEBUG must be True).")

        role = options["role"]
        slug = options["tenant"]

        if role == "superadmin":
            tenant = Tenant.objects.get(schema_name="public")
            user = User.objects.filter(is_superuser=True).order_by("id").first()
            if user is None:
                raise CommandError("No superuser found. Run `make seed` with CONTENTOR_SUPERUSERS set.")
            self.stdout.write(create_jwt(user, tenant))
            return

        if not slug:
            raise CommandError(f"--tenant is required for role={role}")
        tenant = Tenant.objects.get(slug=slug)
        email = DEMO_COACH_EMAIL if role == "coach" else DEMO_STUDENT_EMAIL
        with tenant_context(tenant):
            user = User.objects.filter(email=email).first()
            if user is None:
                raise CommandError(f"No {role} user '{email}' in tenant '{slug}'. Run `make seed-demos`.")
            self.stdout.write(create_jwt(user, tenant))
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose exec -T django pytest apps/accounts/tests/test_issue_login_token.py -v`
Expected: 3 passed.

- [ ] **Step 5: Format and commit**

```bash
make format
git add backend/apps/accounts/management/commands/issue_login_token.py backend/apps/accounts/tests/test_issue_login_token.py
git commit -m "feat(accounts): dev-only issue_login_token command for screenshot-map"
```

---

### Task 2: JS scaffold + `frontends.js` config + `discover.js`

**Files:**
- Create: `scripts/screenshot-map/package.json`
- Create: `scripts/screenshot-map/targets.json`
- Create: `scripts/screenshot-map/frontends.js`
- Create: `scripts/screenshot-map/discover.js`
- Test: `scripts/screenshot-map/discover.test.js`

**Interfaces:**
- Produces: `discover(frontend, repoRoot)` → array of route records
  `{ frontend, host, url, area, role, dynamic, segments }`. `url` keeps dynamic
  segments literal (e.g. `/admin/tenants/[slug]`); groups `(...)` are dropped from
  the URL. `frontends.js` exports an array of `{ name, appDir, host, areaRole }`.
  `targets.json` exports `{ tenantSlug, tenantHost, mainHost, dynamic }`.

- [ ] **Step 1: Create the config + scaffold files**

```json
// scripts/screenshot-map/package.json
{
  "name": "screenshot-map",
  "private": true,
  "type": "commonjs",
  "scripts": {
    "start": "node index.js",
    "test": "node --test"
  },
  "dependencies": {
    "playwright": "^1.48.0"
  }
}
```

```json
// scripts/screenshot-map/targets.json
{
  "tenantSlug": "yoga",
  "tenantHost": "yoga.localhost",
  "mainHost": "localhost",
  "dynamic": {
    "/admin/tenants/[slug]": "/admin/tenants/yoga",
    "/dashboard/domain/[slug]": "/dashboard/domain/yoga"
  }
}
```

```js
// scripts/screenshot-map/frontends.js
const targets = require("./targets.json");

module.exports = [
  {
    name: "main",
    appDir: "frontend-main/src/app",
    host: targets.mainHost,
    areaRole: {
      admin: "superadmin",
      dashboard: "superadmin",
      signup: "anon",
      pricing: "anon",
      demo: "anon",
      "(auth)": "anon",
      "": "anon",
    },
  },
  {
    name: "customer",
    appDir: "frontend-customer/src/app",
    host: targets.tenantHost,
    areaRole: {
      admin: "coach",
      "(student)": "student",
      "(public)": "anon",
      "(auth)": "anon",
      impersonate: "anon",
      live: "anon",
      "live-stream": "anon",
      "": "anon",
    },
  },
];
```

- [ ] **Step 2: Write the failing test**

```js
// scripts/screenshot-map/discover.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { discover } = require("./discover");

function fixtureRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "smap-"));
  const page = (rel) => {
    const dir = path.join(root, "app", rel);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "page.tsx"), "export default null");
  };
  page("admin/courses");
  page("(student)/dashboard");
  page("(public)/about");
  page("admin/tenants/[slug]");
  page("api/ignored"); // must be skipped
  page(""); // root marketing page
  return root;
}

test("discover derives url, area, role, and dynamic flags", () => {
  const root = fixtureRoot();
  const fe = {
    name: "t",
    appDir: "app",
    host: "h",
    areaRole: { admin: "coach", "(student)": "student", "(public)": "anon", "": "anon" },
  };
  const byUrl = Object.fromEntries(discover(fe, root).map((r) => [r.url, r]));

  assert.equal(byUrl["/admin/courses"].role, "coach");
  assert.equal(byUrl["/dashboard"].role, "student");
  assert.equal(byUrl["/about"].role, "anon");
  assert.equal(byUrl["/"].role, "anon");
  assert.equal(byUrl["/admin/tenants/[slug]"].dynamic, true);
  assert.deepEqual(byUrl["/admin/tenants/[slug]"].segments, ["slug"]);
  assert.equal(byUrl["/admin/courses"].frontend, "t");
  assert.equal(byUrl["/admin/courses"].host, "h");
  assert.equal(byUrl["/api/ignored"], undefined); // api dir skipped
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd scripts/screenshot-map && node --test discover.test.js`
Expected: FAIL — `Cannot find module './discover'`.

- [ ] **Step 4: Write `discover.js`**

```js
// scripts/screenshot-map/discover.js
const fs = require("node:fs");
const path = require("node:path");

const isGroup = (s) => s.startsWith("(") && s.endsWith(")");
const isDynamic = (s) => s.startsWith("[") && s.endsWith("]");

function findPageDirs(absAppDir) {
  const out = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "api") continue; // route handlers, not pages
        walk(full);
      } else if (entry.name === "page.tsx") {
        out.push(path.relative(absAppDir, dir));
      }
    }
  })(absAppDir);
  return out;
}

function discover(frontend, repoRoot) {
  const absAppDir = path.join(repoRoot, frontend.appDir);
  return findPageDirs(absAppDir).map((relDir) => {
    const segs = relDir === "" ? [] : relDir.split(path.sep).filter(Boolean);
    const urlSegs = segs.filter((s) => !isGroup(s));
    const url = urlSegs.length ? "/" + urlSegs.join("/") : "/";

    let area = "";
    for (const s of segs) {
      if (Object.prototype.hasOwnProperty.call(frontend.areaRole, s)) {
        area = s;
        break;
      }
    }
    const role = frontend.areaRole[area] ?? "anon";
    const dynSegs = segs.filter(isDynamic).map((s) => s.slice(1, -1));

    return {
      frontend: frontend.name,
      host: frontend.host,
      url,
      area,
      role,
      dynamic: dynSegs.length > 0,
      segments: dynSegs,
    };
  });
}

module.exports = { discover, findPageDirs, isGroup, isDynamic };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd scripts/screenshot-map && node --test discover.test.js`
Expected: PASS (1 test).

- [ ] **Step 6: Commit**

```bash
git add scripts/screenshot-map/package.json scripts/screenshot-map/targets.json scripts/screenshot-map/frontends.js scripts/screenshot-map/discover.js scripts/screenshot-map/discover.test.js
git commit -m "feat(screenshot-map): route discovery + frontend config"
```

---

### Task 3: `auth.js` — role → authenticated Playwright context

**Files:**
- Create: `scripts/screenshot-map/auth.js`
- Test: `scripts/screenshot-map/auth.test.js`

**Interfaces:**
- Consumes: the `issue_login_token` command (Task 1) via `docker compose exec`.
- Produces:
  - `sessionCookie(jwt, host)` → Playwright cookie object (pure).
  - `mintSessionJwt(role, tenantSlug)` → string JWT (shells out to docker).
  - `getContext(browser, { role, host, tenantSlug })` → Playwright `BrowserContext`
    (anonymous when `role === "anon"`, else carries the session cookie). Used by `index.js` (Task 6).

- [ ] **Step 1: Write the failing test**

```js
// scripts/screenshot-map/auth.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { sessionCookie } = require("./auth");

test("sessionCookie builds a contentor cookie scoped to the host", () => {
  const c = sessionCookie("jwt123", "yoga.localhost");
  assert.equal(c.name, "contentor_access_token");
  assert.equal(c.value, "jwt123");
  assert.equal(c.domain, "yoga.localhost");
  assert.equal(c.path, "/");
  assert.equal(c.httpOnly, true);
  assert.equal(c.secure, false);
  assert.equal(c.sameSite, "Lax");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd scripts/screenshot-map && node --test auth.test.js`
Expected: FAIL — `Cannot find module './auth'`.

- [ ] **Step 3: Write `auth.js`**

```js
// scripts/screenshot-map/auth.js
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const REPO_ROOT = path.resolve(__dirname, "..", "..");

function sessionCookie(jwt, host) {
  return {
    name: "contentor_access_token",
    value: jwt,
    domain: host,
    path: "/",
    httpOnly: true,
    secure: false,
    sameSite: "Lax",
  };
}

function mintSessionJwt(role, tenantSlug) {
  const args = [
    "compose", "exec", "-T", "django",
    "python", "manage.py", "issue_login_token", "--role", role,
  ];
  if (tenantSlug) args.push("--tenant", tenantSlug);
  return execFileSync("docker", args, { cwd: REPO_ROOT, encoding: "utf8" }).trim();
}

async function getContext(browser, { role, host, tenantSlug }) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  if (role !== "anon") {
    const jwt = mintSessionJwt(role, role === "superadmin" ? "" : tenantSlug);
    await context.addCookies([sessionCookie(jwt, host)]);
  }
  return context;
}

module.exports = { sessionCookie, mintSessionJwt, getContext, REPO_ROOT };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd scripts/screenshot-map && node --test auth.test.js`
Expected: PASS (1 test). (`mintSessionJwt`/`getContext` need docker + browser; exercised in Task 6 e2e.)

- [ ] **Step 5: Commit**

```bash
git add scripts/screenshot-map/auth.js scripts/screenshot-map/auth.test.js
git commit -m "feat(screenshot-map): per-role authenticated browser contexts"
```

---

### Task 4: `capture.js` — route → screenshot + status

**Files:**
- Create: `scripts/screenshot-map/capture.js`
- Test: `scripts/screenshot-map/capture.test.js`

**Interfaces:**
- Consumes: route records from `discover` (Task 2), `targets.json`, a Playwright `BrowserContext` from `auth` (Task 3).
- Produces:
  - `resolveUrl(route, targets)` → `{ resolvedUrl, status, note? }` (pure).
  - `classify({ httpStatus, finalUrl, role })` → `{ status, note? }` (pure).
  - `capturePage(context, route, targets)` → capture result
    `{ ...route, resolvedUrl, status: "ok"|"error"|"skipped", note, png: Buffer|null }`. Used by `index.js` (Task 6).

- [ ] **Step 1: Write the failing test**

```js
// scripts/screenshot-map/capture.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { classify, resolveUrl } = require("./capture");

test("classify flags HTTP errors and auth redirects, passes good pages", () => {
  assert.equal(classify({ httpStatus: 500, finalUrl: "http://h/x", role: "anon" }).status, "error");
  assert.equal(classify({ httpStatus: 200, finalUrl: "http://h/login", role: "coach" }).status, "error");
  assert.equal(classify({ httpStatus: 200, finalUrl: "http://h/admin", role: "coach" }).status, "ok");
  assert.equal(classify({ httpStatus: 200, finalUrl: "http://h/login", role: "anon" }).status, "ok");
});

test("resolveUrl skips unmapped dynamic routes and resolves mapped ones", () => {
  assert.equal(resolveUrl({ url: "/admin/about", dynamic: false }, { dynamic: {} }).resolvedUrl, "/admin/about");
  assert.equal(resolveUrl({ url: "/admin/courses/[id]", dynamic: true }, { dynamic: {} }).status, "skipped");
  const r = resolveUrl(
    { url: "/admin/tenants/[slug]", dynamic: true },
    { dynamic: { "/admin/tenants/[slug]": "/admin/tenants/yoga" } },
  );
  assert.equal(r.status, "ok");
  assert.equal(r.resolvedUrl, "/admin/tenants/yoga");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd scripts/screenshot-map && node --test capture.test.js`
Expected: FAIL — `Cannot find module './capture'`.

- [ ] **Step 3: Write `capture.js`**

```js
// scripts/screenshot-map/capture.js
function resolveUrl(route, targets) {
  if (!route.dynamic) return { resolvedUrl: route.url, status: "ok" };
  const mapped = targets.dynamic && targets.dynamic[route.url];
  if (!mapped) {
    return { resolvedUrl: route.url, status: "skipped", note: "no target in targets.json" };
  }
  return { resolvedUrl: mapped, status: "ok" };
}

function classify({ httpStatus, finalUrl, role }) {
  if (httpStatus >= 400) return { status: "error", note: `HTTP ${httpStatus}` };
  if (role !== "anon" && /\/login(\/|$|\?)/.test(finalUrl)) {
    return { status: "error", note: "redirected to login (auth failed)" };
  }
  return { status: "ok", note: "" };
}

async function capturePage(context, route, targets) {
  const resolved = resolveUrl(route, targets);
  if (resolved.status === "skipped") {
    return { ...route, resolvedUrl: resolved.resolvedUrl, status: "skipped", note: resolved.note, png: null };
  }

  const page = await context.newPage();
  const url = `http://${route.host}${resolved.resolvedUrl}`;
  try {
    const resp = await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    const httpStatus = resp ? resp.status() : 0;
    const finalUrl = page.url();
    const png = await page.screenshot({ fullPage: false });
    const c = classify({ httpStatus, finalUrl, role: route.role });
    return { ...route, resolvedUrl: resolved.resolvedUrl, status: c.status, note: c.note || "", png };
  } catch (e) {
    return { ...route, resolvedUrl: resolved.resolvedUrl, status: "error", note: String(e.message || e), png: null };
  } finally {
    await page.close();
  }
}

module.exports = { resolveUrl, classify, capturePage };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd scripts/screenshot-map && node --test capture.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/screenshot-map/capture.js scripts/screenshot-map/capture.test.js
git commit -m "feat(screenshot-map): page capture with status classification"
```

---

### Task 5: `render.js` — results → self-contained HTML map

**Files:**
- Create: `scripts/screenshot-map/render.js`
- Test: `scripts/screenshot-map/render.test.js`

**Interfaces:**
- Consumes: array of capture results from `capture.js` (Task 4).
- Produces:
  - `summarize(results)` → `{ ok, error, skipped }` (pure).
  - `render(results, meta)` → HTML string with base64-inlined thumbnails, grouped
    by frontend then area. `meta = { generatedAt, commit, summary }`. Used by `index.js` (Task 6).

- [ ] **Step 1: Write the failing test**

```js
// scripts/screenshot-map/render.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { render, summarize } = require("./render");

test("summarize counts statuses", () => {
  const s = summarize([{ status: "ok" }, { status: "ok" }, { status: "error" }, { status: "skipped" }]);
  assert.deepEqual(s, { ok: 2, error: 1, skipped: 1 });
});

test("render produces self-contained html with both frontends and inlined thumbnails", () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  const results = [
    { frontend: "main", area: "admin", role: "superadmin", url: "/admin/tenants", status: "ok", note: "", png },
    { frontend: "customer", area: "admin", role: "coach", url: "/admin/courses", status: "ok", note: "", png: null },
    { frontend: "customer", area: "admin", role: "coach", url: "/admin/courses/[id]", status: "skipped", note: "no target", png: null },
  ];
  const html = render(results, { generatedAt: "2026-06-27T00:00:00Z", commit: "abc1234", summary: summarize(results) });

  assert.match(html, /<!doctype html>/i);
  assert.match(html, /Contentor screenshot map/);
  assert.match(html, /data:image\/png;base64,/); // thumbnail inlined
  assert.match(html, />main</);
  assert.match(html, />customer</);
  assert.match(html, /skipped/);
  assert.match(html, /abc1234/);
  assert.ok(!/<img src="\/[^"]/.test(html)); // no external image refs
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd scripts/screenshot-map && node --test render.test.js`
Expected: FAIL — `Cannot find module './render'`.

- [ ] **Step 3: Write `render.js`**

```js
// scripts/screenshot-map/render.js
const CSS = `
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 14px/1.45 system-ui, sans-serif; background: #0f1115; color: #e7e9ee; }
  header { padding: 20px 24px; border-bottom: 1px solid #262a33; position: sticky; top: 0; background: #0f1115; }
  header h1 { margin: 0 0 4px; font-size: 18px; }
  header p { margin: 0; color: #9aa1ad; }
  section { padding: 16px 24px 8px; }
  section > h2 { font-size: 15px; text-transform: uppercase; letter-spacing: .08em; color: #9aa1ad; margin: 24px 0 12px; }
  .lanes { display: flex; gap: 16px; overflow-x: auto; align-items: flex-start; padding-bottom: 12px; }
  .lane { min-width: 260px; background: #161922; border: 1px solid #262a33; border-radius: 12px; padding: 12px; }
  .lane > h3 { margin: 0 0 10px; font-size: 13px; color: #c7ccd6; }
  .card { background: #1b1f2a; border: 1px solid #2b3040; border-radius: 10px; overflow: hidden; margin-bottom: 12px; }
  .card img { display: block; width: 100%; height: 150px; object-fit: cover; object-position: top; background: #0c0e12; }
  .card .noimg { height: 150px; display: flex; align-items: center; justify-content: center; color: #6b7280; background: #0c0e12; }
  .card .meta { padding: 8px 10px; }
  .card .title { font-size: 12px; word-break: break-all; color: #e7e9ee; }
  .card .row { display: flex; gap: 6px; margin-top: 6px; }
  .badge { font-size: 10px; padding: 1px 6px; border-radius: 999px; background: #2b3040; color: #c7ccd6; }
  .pill { font-size: 10px; padding: 1px 6px; border-radius: 999px; }
  .pill.ok { background: #16331f; color: #4ade80; }
  .pill.error { background: #3a1620; color: #f87171; }
  .pill.skipped { background: #33301a; color: #fbbf24; }
  .note { font-size: 11px; color: #9aa1ad; margin-top: 4px; }
  .card.status-error { border-color: #5b2330; }
  .card.status-skipped { border-color: #5b531f; }
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

function card(r) {
  const img = dataUri(r.png);
  const thumb = img
    ? `<img src="${img}" loading="lazy" alt="">`
    : `<div class="noimg">${escapeHtml(r.status)}</div>`;
  return `<div class="card status-${escapeHtml(r.status)}">
    ${thumb}
    <div class="meta">
      <div class="title">${escapeHtml(r.url)}</div>
      <div class="row"><span class="badge">${escapeHtml(r.role)}</span><span class="pill ${escapeHtml(r.status)}">${escapeHtml(r.status)}</span></div>
      ${r.note ? `<div class="note">${escapeHtml(r.note)}</div>` : ""}
    </div>
  </div>`;
}

function render(results, meta) {
  const frontends = [...new Set(results.map((r) => r.frontend))];
  let body = "";
  for (const fe of frontends) {
    const feResults = results.filter((r) => r.frontend === fe);
    const areas = [...new Set(feResults.map((r) => r.area))];
    body += `<section><h2>${escapeHtml(fe)}</h2><div class="lanes">`;
    for (const area of areas) {
      const lane = feResults
        .filter((r) => r.area === area)
        .sort((a, b) => a.url.localeCompare(b.url));
      body += `<div class="lane"><h3>${escapeHtml(area || "root")}</h3>${lane.map(card).join("")}</div>`;
    }
    body += `</div></section>`;
  }
  const s = meta.summary;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Contentor screenshot map</title><style>${CSS}</style></head><body>
<header><h1>Contentor screenshot map</h1>
<p>${escapeHtml(meta.generatedAt)} · ${escapeHtml(meta.commit)} · ${s.ok} ok / ${s.error} error / ${s.skipped} skipped</p></header>
${body}</body></html>`;
}

module.exports = { render, summarize, escapeHtml };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd scripts/screenshot-map && node --test render.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/screenshot-map/render.js scripts/screenshot-map/render.test.js
git commit -m "feat(screenshot-map): self-contained HTML map renderer"
```

---

### Task 6: `index.js` orchestrator + `make` target + gitignore + e2e

**Files:**
- Create: `scripts/screenshot-map/index.js`
- Modify: `Makefile` (append a `screenshot-map` target)
- Modify: `.gitignore` (ignore `docs/screenshot-map/`)

**Interfaces:**
- Consumes: `discover` (Task 2), `getContext` (Task 3), `capturePage` (Task 4),
  `render`/`summarize` (Task 5), `frontends.js`, `targets.json`.
- Produces: `docs/screenshot-map/index.html`. No exported API — this is the entrypoint.

- [ ] **Step 1: Write `index.js`**

```js
// scripts/screenshot-map/index.js
const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");
const { chromium } = require("playwright");

const frontends = require("./frontends");
const targets = require("./targets.json");
const { discover } = require("./discover");
const { getContext } = require("./auth");
const { capturePage } = require("./capture");
const { render, summarize } = require("./render");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const OUT_DIR = path.join(REPO_ROOT, "docs", "screenshot-map");

function preflight() {
  for (const host of new Set(frontends.map((f) => f.host))) {
    try {
      // Caddy routes by Host header; curl localhost so we don't depend on *.localhost DNS.
      execSync(`curl -sf -o /dev/null -H "Host: ${host}" http://localhost/`, { timeout: 10000 });
    } catch {
      console.error(`✗ ${host} not reachable via Caddy. Run: make dev && make seed && make seed-demos`);
      process.exit(1);
    }
  }
}

async function main() {
  preflight();
  const browser = await chromium.launch();
  const results = [];

  for (const fe of frontends) {
    const routes = discover(fe, REPO_ROOT);
    const roles = [...new Set(routes.map((r) => r.role))];
    const contexts = {};
    for (const role of roles) {
      contexts[role] = await getContext(browser, { role, host: fe.host, tenantSlug: targets.tenantSlug });
    }
    for (const route of routes) {
      process.stdout.write(`· ${fe.name} ${route.url} … `);
      const res = await capturePage(contexts[route.role], route, targets);
      console.log(res.status);
      results.push(res);
    }
    for (const role of roles) await contexts[role].close();
  }

  await browser.close();

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const commit = execSync("git rev-parse --short HEAD", { cwd: REPO_ROOT }).toString().trim();
  const html = render(results, {
    generatedAt: new Date().toISOString(),
    commit,
    summary: summarize(results),
  });
  const outFile = path.join(OUT_DIR, "index.html");
  fs.writeFileSync(outFile, html);
  console.log(`\n✓ Map written to ${outFile}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Add the `Makefile` target**

Append to `Makefile` (keep the existing tab-indented recipe style):

```makefile
screenshot-map: ## Generate the visual sitemap of both frontends (docs/screenshot-map/index.html)
	cd scripts/screenshot-map && npm install --silent && npx playwright install chromium && node index.js
```

- [ ] **Step 3: Ignore generated output**

Append to `.gitignore`:

```
# Generated screenshot map (regenerate with `make screenshot-map`)
docs/screenshot-map/
```

- [ ] **Step 4: Run the unit suite for the whole script**

Run: `cd scripts/screenshot-map && npm install --silent && node --test`
Expected: all tests from Tasks 2–5 PASS.

- [ ] **Step 5: End-to-end verification (manual)**

```bash
# 1. Ensure CONTENTOR_SUPERUSERS is set in the backend dev env (at least one email).
# 2. Boot + seed:
make dev          # wait until healthy
make seed
make seed-demos
make health-check # expect OK
# 3. Confirm the demo tenant slug in targets.json matches a seeded demo
#    (default "yoga"); edit scripts/screenshot-map/targets.json if not.
# 4. Generate:
make screenshot-map
# 5. Open the result and eyeball it:
open docs/screenshot-map/index.html
```

Expected: the map opens showing both frontends. Confirm at least one captured (status `ok`, real thumbnail) screen in EACH of: superadmin (`frontend-main /admin/*`), coach (`frontend-customer /admin/*`), student (`(student)/*`), and public/marketing. Auth-gated screens that fail show `error` with a note; unmapped dynamic routes show `skipped` — both are expected, not failures.

- [ ] **Step 6: Commit**

```bash
git add scripts/screenshot-map/index.js Makefile .gitignore
git commit -m "feat(screenshot-map): orchestrator, make target, gitignore"
```

---

## Notes / Known limitations (v1)

- **Dynamic content routes** (`/admin/courses/[id]`, videos, live, etc.) render as
  `skipped` until you add a concrete path to `targets.json`'s `dynamic` map. After the
  first run, copy a real id from the seeded data and add e.g.
  `"/admin/courses/[id]": "/admin/courses/<id>"`.
- **`*.localhost` resolution:** Chromium resolves it to loopback automatically. If a
  future tool in the pipeline needs host DNS, add `127.0.0.1 yoga.localhost` to
  `/etc/hosts`.
- **Superadmin session scope:** the superadmin JWT is minted against the public tenant
  and the cookie is set on `localhost`. If `frontend-main /admin/*` comes back as
  `error` (redirected to login), verify the superuser exists (`make seed` with
  `CONTENTOR_SUPERUSERS`) before assuming a code bug.
- Desktop viewport only (1440×900). Mobile is a deliberate v2 follow-up.
