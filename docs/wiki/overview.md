# contentor — Wiki

# Contentor

Contentor is a multi-tenant SaaS for content creators — we call them **coaches**. A coach signs up on the marketing site, answers an AI-guided setup interview, and ends up with their own branded site on `theirname.contentor.app` (or a custom domain) where they sell courses, downloads, live sessions and memberships to their **students**. We — the platform owners — are the **superadmins**.

Three words you'll see everywhere, and they always mean those three roles.

What makes the codebase distinctive is that a coach's site is _authored by the system_: the setup interview, the site composer, the copilot and the Designer all write real content into real pages. Most of the AI surface area exists to make that first hour feel like hiring a studio rather than filling in a form.

## The shape of the system

```mermaid
graph TD
    Browser[Browser]) --> Caddy[Caddy router]
    Caddy -->|apex host| Main["frontend-main<br/>marketing · signup · superadmin"]
    Caddy -->|tenant hosts| Customer["frontend-customer<br/>coach site · student · studio"]
    Caddy -->|/api/*| API["Django + DRF<br/>/api/v1"]
    Main --> Shared["packages/shared<br/>UI + hooks"]
    Customer --> Shared
    Main -.fetch.-> API
    Customer -.fetch.-> API
    API --> Core["apps.core<br/>tenancy · auth · AI"]
    Core --> PG[("Postgres 17<br/>one schema per tenant")]
    Core --> Workers["Celery + Redis<br/>sends · builds · video"]
```

Everything else is a Django app behind that API or a route group inside one of the two Next.js apps.

## The one idea to hold onto: schema-per-tenant

There is a single Postgres database with one **schema per tenant**, plus a **public schema** for platform-level data. `django-tenants` switches the active schema per request, and [Core Platform & Multi-Tenancy](core-platform-multi-tenancy.md) owns that machinery — host resolution, the tenant middleware, the router that keeps tenant apps out of public, plus shared primitives like storage, email and throttling.

Django apps are declared as either `SHARED_APPS` (public schema) or `TENANT_APPS` (per-tenant). Which list an app is in determines what its models can even see, so it's the first thing to check when something "can't find" a row.

Two consequences bite new developers almost immediately:

- **Server-side `fetch()` from Next.js must send an `X-Tenant-Domain` header.** Node's undici silently drops a custom `Host`, so without the header the request resolves against the public schema and you get confusingly empty data.
- **DRF defaults to JWT auth.** A genuinely public endpoint (magic link, OAuth callback, signup) needs `@authentication_classes([])` — `AllowAny` alone is not enough.

[Authentication & Accounts](authentication-accounts.md) explains the rest: the `User` model lives in _every_ schema (coaches and superadmins in public, students and staff inside each tenant), there are no server-side sessions, and every login flow ends in a signed JWT.

## Where the code lives

The repo is a monorepo with four top-level homes.

**`backend/`** is the Django project: `config/` for settings (split base/dev/prod) and `apps/` for everything else. Feature apps sit on top of core — [Courses, Downloads & Media Library](courses-downloads-media-library.md) for the content a coach publishes and gates, [Live Events & Calendar](live-events-calendar.md) for anything that happens at a _time_ (live classes, streams, in-person events; the video itself is embedded from the sibling LiveCraft product), [Community](community.md) for the in-tenant social feed, [Blog & AI Content](blog-ai-content.md) for the one blog engine that serves both coach sites and the platform blog, and [Email Campaigns](email-campaigns.md) for coach→student and superadmin→coach sends. [Mailbox & Notifications](mailbox-notifications.md) covers the other two directions of reach: real threaded email, and broadcast announcements plus Web Push.

**`frontend-main/`** is the apex-host Next.js 14 app — marketing pages, auth entry points, coach signup and the "my platforms" dashboard, plus the [Superadmin Platform Console](superadmin-platform-console.md). See [Marketing Site App (frontend-main)](marketing-site-app-frontend-main.md).

**`frontend-customer/`** is everything else. Every non-apex host lands here, and one codebase serves three audiences from three route groups: visitors browsing the public site, students in their dashboard and courses, and the coach in their studio at `/admin`. See [Student Portal App (frontend-customer)](student-portal-app-frontend-customer.md).

**`packages/shared/`** holds the UI primitives, the navigation-feedback layer and the async-action hooks that both apps import. It is by far the most depended-on module in the repo — if you change something in [Shared UI Library](shared-ui-library.md), assume both apps are affected and run the wider test set. The loading, toast and navigation conventions it encodes are lint-enforced, so reading its page before writing UI saves a round-trip.

Rounding things out: [Billing & Payments](billing-payments.md) runs two independent money flows (coach→us for the platform subscription, student→coach via Stripe Connect) through one webhook; [Tenant Config & Site Builder](tenant-config-site-builder.md) backs a coach's whole site from a single `TenantConfig` resource; [Logo Studio & Brand Identity](logo-studio-brand-identity.md) treats a logo as versioned JSON that renders to SVG, never as an uploaded bitmap; [Custom Domains](custom-domains.md) owns the buy→DNS→SSL→registered-domain lifecycle; [Admin Kit Framework](admin-kit-framework.md) turns one Python declaration per model into both a CRUD API and the metadata a generic React renderer builds the screen from; and [Observability & Usage Analytics](observability-usage-analytics.md) is the in-app logbook that _is_ our observability stack — there is no Prometheus or Grafana.

Finally, [AI Infrastructure & Assistants](ai-infrastructure-assistants.md) is the single provider layer, SSE convention and conversation kernel (with cost governance) that every AI feature in the product sits on. Repo-level scaffolding — the selective test runner, the lint guards, the e2e suite, the agent instruction files — is covered by [Developer Tooling & Flowmap](developer-tooling-flowmap.md) and [Other](other.md).

## Key end-to-end flows

**A coach gets a site.** Signup on `frontend-main` provisions a tenant and creates the user in _both_ the public schema (role `coach`) and the new tenant schema (role `owner`). The coach then walks the AI setup interview in [Onboarding Wizard & Site AI](onboarding-wizard-site-ai.md), choosing a look, a palette and the offers they'll sell. Pressing go-live runs the flow that is worth tracing once by hand: `setup_flow_golive` → `publish` → `act` → `_queue_page_builds` → `start_page_build`, which hands each page to the site composer (`set_build_status` → `_update_config` → `save`) and finishes in `restyle_pages`, where the chosen style is applied section by section. That one chain crosses the onboarding package, the tenant config app and core, and it explains most of what you'll see in `TenantConfig`.

**A student buys something.** A student arrives on the tenant host, is routed by Caddy to `frontend-customer`, and registers via magic link (which auto-creates them in that tenant's schema). Checkout runs as a Stripe direct charge on the coach's connected account with a platform application fee; the webhook grants access, and the content apps gate every subsequent read against that grant.

**The coach keeps changing things.** After go-live nothing is frozen. The studio copilot edits the live site through the same doors the composer used — so every change lands in the coach's audit trail with an undo — and the specialist agents (Designer and friends) draw covers, compose emails and cut video on top of the same AI layer.

## Getting started

```bash
make health-check     # the stack is often already running — check first
make dev-d            # start it detached; returns when Django is healthy
make migrate && make seed
```

Dev runs behind Caddy on `localhost` (apex → `frontend-main`) and `<slug>.localhost` (tenant → `frontend-customer`). Object storage, email and a few paid services have local fakes; the per-area wiki pages say which.

For day-to-day verification, prefer the cheapest level that covers your change:

```bash
make test-changed              # default: only what the diff affects (PLAN=1 to preview)
make test-app APP=billing      # one backend app
make e2e-spec SPEC=04-live-class
make lint
```

`make help` lists the rest. The end-to-end suite is the slowest gate and shares one stack with other sessions, so check whether a run is already going before starting one.

## Reading further

Each area has its own page in this wiki, generated from the code and named `<area>[-<location>].md`. Read the page for the area you're about to touch before you touch it — the pages carry the design intent and the traps, and they'll save you from rediscovering the tenancy gotchas the hard way. `docs/REFERENCE.md` holds the cross-cutting detail (domain model, auth flows, billing, deploy) and `docs/GLOSSARY.md` settles what a word means when two of them seem to fit.
