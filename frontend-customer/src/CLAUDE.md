# frontend-customer/src — local guide

Tenant portal (students) + coach admin. Conventions an agent should copy:

- Data fetching: everything goes through `clientFetch<T>()` in `lib/api-client.ts`. Public routes = server components; student/admin routes = `"use client"` + `useState`/`useEffect` + `clientFetch` (canonical template: `app/(student)/dashboard/page.tsx`).
- A feature is a four-corner slice: `app/admin/<feature>/page.tsx` + widgets in `components/admin/` + `lib/<feature>-api.ts` (or direct clientFetch) + `types/<feature>.ts`. To add an admin resource, copy `app/admin/downloads/page.tsx`.
- Admin CRUD framework: `components/admin/media-browser.tsx` (generic list) + `components/admin/inline-edit-panel.tsx` (`FieldConfig`) + `tag-filter-bar.tsx`. Edit these with care — every admin page depends on them.
- Other edit-with-care spines: `lib/api-client.ts`, `lib/blocks/registry.tsx` (page-builder block registry).
- Shared code with frontend-main lives in `packages/shared` (`@shared/*`); app files that just re-export it are shims — edit the shared source, not the shim.
- Navigation, loading states, and refinement/overlay feedback follow the root `CLAUDE.md` "Loading & feedback conventions" section — `<NavLink>`/`useNavigate()`, per-segment `loading.tsx`, `<StaleContainer>`.

Verify: `make test-frontend` (vitest), `make typecheck`, `make e2e-spec SPEC=<nn>`.
