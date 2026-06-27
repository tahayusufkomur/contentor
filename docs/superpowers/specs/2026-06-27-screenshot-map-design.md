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
stack, logs in as each role, crawls the routes of **both frontends**, screenshots
them, and emits **one self-contained HTML file** that is the visual map. Re-run anytime
to get a fresh current-status view. Auto-discovery of routes keeps the map honest as
the app grows.

## Scope (v1)

**In scope — both frontends.**

`frontend-customer` (tenant-facing, reached on a demo tenant host):
- Coach-Admin: `/admin/*` (settings, design, courses, videos, live, students, photos,
  downloads, pages, notifications, payouts, email, billing, live-streams, `m`)
- Student: `(student)/*` (dashboard, learn, checkout, subscriptions, live-classes,
  orders) and `(public)/*` (about, contact, faq, plans, courses, store, calendar,
  install)
- Auth: `(auth)/login`, `(auth)/callback`, `impersonate` landing

`frontend-main` (platform, reached on `localhost` apex):
- Marketing: root, `pricing`, `demo`
- Signup: `signup`, `signup/verify`
- Superadmin: `admin/*` (settings, health, tenants, `tenants/[slug]`, email, `m`)
- Dashboard: `dashboard/domain`, `dashboard/domain/[slug]` (custom-domain wizard)
- Auth: `(auth)/login`, `(auth)/callback`

**Out of scope (v1):**
- Mobile viewport (desktop only for v1)
- Navigation arrows between screens (grouped lanes instead; arrows can come later)
- Committing the generated output to git

## Key findings (from codebase exploration)

- **Routing is by hostname.** Caddy fronts everything on port 80. In dev,
  `Host(localhost)` / `Host(tr.localhost)` → `frontend-main`; every other host (tenant
  subdomains, e.g. `<slug>.localhost`) → `frontend-customer` (catch-all). The
  magic-link verify flow sets a Django session cookie scoped to whichever host it was
  called on, so each role's session is captured on its correct host.
- **Auth is passwordless magic-link on both frontends.** Seeded users have unusable
  passwords. Tokens are JWTs signed with `SECRET_KEY` via
  `backend/apps/accounts/tokens.py::create_magic_link_token(email, tenant_schema, tenant_slug)`.
  A session can be minted in a Django shell — no email round-trip — then exchanged at
  the frontend `/api/auth/verify` endpoint for a session cookie. Both `frontend-main`
  and `frontend-customer` expose this verify route.
- **Seed infrastructure exists.** `make seed` (plans, public tenant, **superusers** from
  `CONTENTOR_SUPERUSERS`), `make seed-demos` (per-niche demo tenants via
  `backend/apps/core/management/commands/demo_data/*`). `seed_demo_tenant.py` creates a
  tenant owner (coach), additional admins, and students. So all three roles exist:
  superadmin (public-schema superuser), coach (demo-tenant owner), student.
- **Routes are discoverable.** Each frontend's `src/app/` tree of `page.tsx` files maps
  directly to URLs; route groups (`(public)`, `(student)`, `admin`, `dashboard`,
  `(auth)`) give the area grouping for free.

## Architecture

A self-contained Node + Playwright project at `scripts/screenshot-map/`, invoked by a
`make screenshot-map` target. Four independent, separately-testable units plus one
hand-maintained config:

```
scripts/screenshot-map/
  index.js        # orchestrator: wires the pipeline, prints progress, fails fast
  discover.js     # pure: a frontend's src/app dir -> [{ url, area, role, dynamic? }]
  auth.js         # role -> Playwright BrowserContext with a valid session cookie
  capture.js      # (route, context) -> PNG buffer + status (ok|error|skipped)
  render.js       # results -> single self-contained index.html (base64-inlined PNGs)
  frontends.js    # config: the two frontends (name, app-dir, host, role for each area)
  targets.json    # hand-maintained: dynamic-segment -> known seed entity
  package.json    # playwright dependency, "start" script
```

`frontends.js` declares the two crawl targets so the pipeline iterates them uniformly:
`frontend-customer` (host `<demo-slug>.localhost`, areas → student/coach/anon) and
`frontend-main` (host `localhost`, areas → marketing/signup/superadmin/dashboard/anon).
Hosts are config, never hardcoded in the units.

Plus one new Django management command:
`backend/apps/accounts/management/commands/issue_login_token.py` — prints a magic-link
JWT for a given `--email` and `--tenant` (slug; the public tenant for the superadmin).
Used by `auth.js`. Dev-only guard: refuse to run unless `DEBUG`/`settings.ENVIRONMENT
== "local"` so it can never mint a login token in production.

### Unit contracts

- **discover.js** — Input: one frontend's `src/app` path + its area→role mapping.
  Output: an array of route records `{ url, area, role, dynamic: bool, segments: [...] }`.
  Pure filesystem walk; no network. Area derived from the route group; role derived
  from the frontend's mapping (customer: `admin`→coach, `(student)`→student,
  `(public)`/`(auth)`→anon; main: `admin`→superadmin, `dashboard`→superadmin,
  `signup`/`pricing`/`demo`/`(auth)`/root→anon). Called once per frontend.
- **auth.js** — Input: a role and the host it lives on. Output: a Playwright
  `BrowserContext` carrying a valid session cookie (or an anonymous context for public
  routes). Internally: shell out to `issue_login_token`, POST the token to
  `/api/auth/verify` on that host, capture the `set-cookie`, seed it into the context.
  Three authed contexts total — superadmin (on `localhost`), coach and student (on the
  demo-tenant host) — plus anonymous contexts. One context per role, reused across that
  role's routes.
- **capture.js** — Input: a route record + the matching context + the route's host.
  Output: PNG buffer + status. Navigates on the correct host, waits for network idle /
  a content selector, screenshots full desktop viewport. Auth-failures and error pages
  are captured and flagged (`status: "error"`), never silently dropped.
- **render.js** — Input: the combined capture results from both frontends. Output: a
  single `index.html` string with every thumbnail base64-inlined. No external asset
  dependencies.

### Dynamic segments

Routes containing `[id]`, `[slug]`, `[token]`, etc. are resolved from `targets.json`,
which maps each parameterized route (or segment) to a concrete seed entity (e.g. demo
tenant slug, a seeded course id, a seeded live id). A dynamic route with no mapping is
emitted with `status: "skipped"` and a "needs a target" note in the map — visible, not
hidden, so coverage gaps are obvious.

## Pipeline (`make screenshot-map`)

1. **Preflight.** Check the stack is up and both the `localhost` apex and the demo
   tenant host are reachable. If not, print the exact commands to fix it (`make dev`,
   `make seed`, `make seed-demos`) and exit non-zero. Do not attempt to boot the stack
   automatically (avoids destructive surprises); just guide.
2. **Discover** routes from each frontend in `frontends.js` (customer + main).
3. **Authenticate** once per role via `auth.js` (superadmin + coach + student contexts;
   anonymous contexts for public/auth/marketing).
4. **Resolve** dynamic segments from `targets.json`.
5. **Capture** every route at desktop viewport on its host, collecting PNG + status.
6. **Render** `docs/screenshot-map/index.html` (single self-contained file). Print its
   path on success.

## The HTML map

One file, opened directly in a browser. Layout:

- **Header:** title, generation timestamp, git commit short SHA, capture summary
  (N ok / N error / N skipped).
- **Sections by frontend** (`frontend-main` · `frontend-customer`), each split into
  **lanes** grouped by area — main: Marketing · Signup · Superadmin · Dashboard · Auth;
  customer: Public · Student · Coach-Admin · Auth.
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

- **discover.js** — unit tests over small fixture `app/` trees (one per frontend)
  asserting correct URL, area, and role derivation for both frontends' route groups
  and dynamic segments.
- **render.js** — unit test that given a fixed results array spanning both frontends it
  produces valid self-contained HTML (thumbnails inlined, both frontend sections and
  all lanes present, statuses rendered).
- **issue_login_token** — backend test that it mints a verifiable token (tenant and
  public-schema/superadmin) in dev and refuses to run when not in the local environment.
- **End-to-end** — manual: run `make screenshot-map` against the seeded stack and
  confirm the map opens with superadmin, coach, student, marketing, public, and auth
  screens captured across both frontends.

## Risks & mitigations

- **Stack not running / not seeded** → preflight fails fast with exact fix commands.
- **Host scheme locally** — `frontend-main` is on `localhost`; demo tenants on
  `<slug>.localhost`. Whether `<slug>.localhost` resolves without an `/etc/hosts` entry
  is pinned during implementation; hosts come from `frontends.js`/`targets.json` config,
  never hardcoded in the units.
- **Superadmin session scope** — the superadmin magic-link is minted against the public
  tenant and verified on `localhost`; confirmed during implementation that the resulting
  cookie authorizes `frontend-main`'s `admin/*`.
- **Heavy/slow pages or auth redirects** → capture.js treats redirect-to-login and
  error pages as flagged statuses rather than failures, so one bad route never aborts
  the run.
- **Map rot** → route auto-discovery means new pages appear automatically; only dynamic
  targets need manual upkeep, and missing ones are surfaced as "skipped".
