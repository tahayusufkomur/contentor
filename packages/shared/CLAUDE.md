# packages/shared — local guide

Source-only TS library shared by both Next.js apps via the `@shared/*` tsconfig alias (no package.json — each app compiles it from source; deps resolve from the consuming app's node_modules).

- `src/admin-kit/` — generic backend-data browser used by `/admin/m` routes only. The real coach admin is NOT built on this (it uses frontend-customer's MediaBrowser/InlineEditPanel framework).
- `src/mailbox/`, `src/email/` — inbox + email-builder UI used by both apps.
- `src/ui/` — shared primitives. `src/logo/` — the logo studio engine (renderer, catalog, composer, export).
- `src/auth/` — session cookie routes shared by both apps.

Rules: never import `@/...` here (app-local alias) — internal imports are relative. Apps consume via 1-line re-export shims (e.g. `frontend-customer/src/components/ui/modal-portal.tsx`) so app-internal import paths stay stable. Changes here affect BOTH apps: verify with `make typecheck` and `make test-frontend`.
