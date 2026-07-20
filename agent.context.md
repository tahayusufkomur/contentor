# Agent Context: Contentor

## System Architecture
- **Multi-tenant SaaS**: Coach (tenant owner), Student (end user), Superadmin (platform owner).
- **Database Tenant Isolation**: `django-tenants` (schema-per-tenant, routed by Caddy).
- **Production Stack**: Django 5.1 + DRF + django-tenants + Postgres 17 + Redis 7 + Celery + Next.js 14.

## Adminkit UI & List View Updates (Current Task Context)
- **Frontend Location**: `packages/shared/src/admin-kit/`.
- **Completed Implementations**:
  1. Button Select Filter.
  2. Item Count Meta Information.
  3. Infinite Scroll & Bug Fix (stabilized `IntersectionObserver`).
  4. Gallery Navigation boundaries integrated.
  5. Fixed `ReferenceError: hasMore is not defined` in `JsonRecordModal`.

## Invariants & Routing Rules
- Browser API calls `/api/v1/*` go directly to Django.
- Next.js server-side `fetch()` to Django **must** pass `X-Tenant-Domain` header.
- Construct tenant domain dynamically using `${slug}.${BASE_DOMAIN}`.
- Work exclusively on the `main` branch as requested.

## CLI / Development Commands
- Dev server: `make dev`
- DB sync: `make migrate-shared` & `make migrate`
- Sync API types: `npm run gen:api` in `frontend-customer/`
