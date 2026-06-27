# Screenshot Map — Visual Sitemap Generator

**Date:** 2026-06-27
**Status:** Approved design, pending implementation plan

## Problem

Contentor has grown large and its current state is hard to hold in your head: two
Next.js frontends, a student area, a coach-admin area, public/marketing pages, and
many in-flight features. There is no single place to *see* what the app looks like
right now. The goal is a visual sitemap — real screenshots of every screen, laid out
and grouped so you can open one file and orient yourself ("Stitch-style"). This is to
make vibe-coding contentor easier by removing the "what does this even look like now"
friction.

## Goal

A repeatable generator, run via `make screenshot-map`, that boots the seeded local
stack, logs in as each role, crawls the routes, screenshots them, and emits **one
self-contained HTML file** that is the visual map. Re-run anytime to get a fresh
current-status view. Auto-discovery of routes keeps the map honest as the app grows.

## Scope (v1)

**In scope — `frontend-customer` only:**
- Coach-Admin: `/admin/*` (settings, design, courses, videos, live, students, photos,
  downloads, pages, notifications, payouts, email, billing, live-streams, `m`)
- Student: `(student)/*` (dashboard, learn, checkout, subscriptions, live-classes,
  orders) and `(public)/*` (about, contact, faq, plans, courses, store, calendar,
  install)
- Auth: `(auth)/login`, `(auth)/callback`, `impersonate` landing

**Out of scope (v1):**
- `frontend-main` (marketing, pricing, signup, superadmin panel, domain wizard)
- Mobile viewport (desktop only for v1)
- Navigation arrows between screens (grouped lanes instead; arrows can come later)
- Committing the generated output to git

## Key findings (from codebase exploration)

- **Routing is multi-tenant by hostname.** Caddy fronts everything on port 80 and
  routes by Host header → tenant schema. The customer app is reached per-tenant
  (a demo tenant's host); the magic-link verify flow sets a Django session cookie
  scoped to that host.
- **Auth is passwordless magic-link.** Seeded users have unusable passwords. Tokens
  are JWTs signed with `SECRET_KEY` via
  `backend/apps/accounts/tokens.py::create_magic_link_token(email, tenant_schema, tenant_slug)`.
  This means a session can be minted in a Django shell — no email round-trip — then
  exchanged at the frontend `/api/auth/verify` endpoint for a session cookie.
- **Seed infrastructure exists.** `make seed` (plans, public tenant, superusers),
  `make seed-demos` (per-niche demo tenants via
  `backend/apps/core/management/commands/demo_data/*`). `seed_demo_tenant.py` creates a
  tenant owner (coach), additional admins, and students — exactly the roles needed.
- **Routes are discoverable.** Each frontend's `src/app/` tree of `page.tsx` files maps
  directly to URLs; route groups (`(public)`, `(student)`, `admin`, `(auth)`) give the
  area grouping for free.

## Architecture

A self-contained Node + Playwright project at `scripts/screenshot-map/`, invoked by a
`make screenshot-map` target. Four independent, separately-testable units plus one
hand-maintained config:

```
scripts/screenshot-map/
  index.js        # orchestrator: wires the pipeline, prints progress, fails fast
  discover.js     # pure: src/app dir  ->  [{ url, area, role, dynamic? }]
  auth.js         # role -> Playwright BrowserContext with a valid session cookie
  capture.js      # (route, context) -> PNG buffer + status (ok|error|skipped)
  render.js       # results -> single self-contained index.html (base64-inlined PNGs)
  targets.json    # hand-maintained: dynamic-segment -> known seed entity
  package.json    # playwright dependency, "start" script
```

Plus one new Django management command:
`backend/apps/accounts/management/commands/issue_login_token.py` — prints a magic-link
JWT for a given `--email` and `--tenant` (slug). Used by `auth.js`. Dev-only guard:
refuse to run unless `DEBUG`/`settings.ENVIRONMENT == "local"` so it can never mint a
login token in production.

### Unit contracts

- **discover.js** — Input: the `frontend-customer/src/app` path. Output: an array of
  route records `{ url, area, role, dynamic: bool, segments: [...] }`. Pure filesystem
  walk; no network. Area derived from the route group; role derived from area
  (`admin` → coach, `(student)` → student, `(public)`/`(auth)` → anonymous).
- **auth.js** — Input: a role and the demo-tenant host. Output: a Playwright
  `BrowserContext` carrying a valid session cookie (or an anonymous context for public
  routes). Internally: shell out to `issue_login_token`, POST the token to
  `/api/auth/verify` on the tenant host, capture the `set-cookie`, seed it into the
  context. One context per role, reused across that role's routes.
- **capture.js** — Input: a route record + the matching context. Output: PNG buffer +
  status. Navigates on the correct tenant host, waits for network idle / a content
  selector, screenshots full desktop viewport. Auth-failures and error pages are
  captured and flagged (`status: "error"`), never silently dropped.
- **render.js** — Input: the array of capture results. Output: a single `index.html`
  string with every thumbnail base64-inlined. No external asset dependencies.

### Dynamic segments

Routes containing `[id]`, `[slug]`, `[token]`, etc. are resolved from `targets.json`,
which maps each parameterized route (or segment) to a concrete seed entity (e.g. demo
tenant slug, a seeded course id, a seeded live id). A dynamic route with no mapping is
emitted with `status: "skipped"` and a "needs a target" note in the map — visible, not
hidden, so coverage gaps are obvious.

## Pipeline (`make screenshot-map`)

1. **Preflight.** Check the stack is up and the demo tenant is reachable. If not, print
   the exact commands to fix it (`make dev`, `make seed`, `make seed-demos`) and exit
   non-zero. Do not attempt to boot the stack automatically (avoids destructive
   surprises); just guide.
2. **Discover** routes from `frontend-customer/src/app`.
3. **Authenticate** once per role via `auth.js` (coach + student contexts; anonymous
   context for public/auth).
4. **Resolve** dynamic segments from `targets.json`.
5. **Capture** every route at desktop viewport, collecting PNG + status.
6. **Render** `docs/screenshot-map/index.html` (single self-contained file). Print its
   path on success.

## The HTML map

One file, opened directly in a browser. Layout:

- **Header:** title, generation timestamp, git commit short SHA, capture summary
  (N ok / N error / N skipped).
- **Lanes:** vertical columns grouped by area — Public · Student · Coach-Admin · Auth.
- **Cards:** each screen is a card with desktop thumbnail, screen title, route path,
  role badge, and a status pill (ok / error / skipped). Cards within a lane ordered by
  route tree (parent before children, children indented).
- Thumbnails are base64-inlined so the single HTML file is fully portable.

This is the deliverable. Not a folder of screenshots to click through — one map.

## Output & git

- Generated output lives at `docs/screenshot-map/index.html` and is **gitignored**
  (one disposable, regenerate-on-demand artifact).
- Committed to git: the generator (`scripts/screenshot-map/*`), `targets.json`, the
  `issue_login_token` management command, the `make screenshot-map` target, and the
  `.gitignore` entry.

## Testing

- **discover.js** — unit tests over a small fixture `app/` tree asserting correct URL,
  area, and role derivation, including route groups and dynamic segments.
- **render.js** — unit test that given a fixed results array it produces valid
  self-contained HTML (thumbnails inlined, all lanes present, statuses rendered).
- **issue_login_token** — backend test that it mints a verifiable token in dev and
  refuses to run when not in the local environment.
- **End-to-end** — manual: run `make screenshot-map` against the seeded stack and
  confirm the map opens with coach, student, public, and auth screens captured.

## Risks & mitigations

- **Stack not running / not seeded** → preflight fails fast with exact fix commands.
- **Tenant host scheme locally** (how demo tenants are addressed on localhost) → to be
  pinned during implementation from the Caddyfile + seed; `auth.js`/`capture.js` take
  the host as config, not hardcoded.
- **Heavy/slow pages or auth redirects** → capture.js treats redirect-to-login and
  error pages as flagged statuses rather than failures, so one bad route never aborts
  the run.
- **Map rot** → route auto-discovery means new pages appear automatically; only dynamic
  targets need manual upkeep, and missing ones are surfaced as "skipped".
