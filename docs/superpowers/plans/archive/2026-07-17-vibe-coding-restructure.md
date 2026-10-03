# Vibe-Coding Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make the repo suitable for small-context ("vibe coding") development: accurate agent context files, fast granular verification commands, zero cross-frontend business-logic duplication, no multi-feature god files, and demo content as data instead of code.

**Architecture:** Five independent phases. Phase 1 builds the verification rails and fixes the stale context docs (everything later uses those rails). Phase 2 consolidates duplicated frontend code into the already-wired `packages/shared` source library using 1-line re-export shims so no import site changes. Phase 3 splits three god files along their existing internal seams, behavior-identical. Phase 4 moves demo seeding out of `apps/core` into a new leaf app and converts ~4,900 lines of Python content dicts to JSON. Phase 5 adds OpenAPI schema generation as contract-drift infrastructure.

**Tech Stack:** Django 5.1 + DRF + django-tenants (Postgres 17, Redis 7, docker compose), 2× Next.js 14 App Router (TypeScript strict), `packages/shared` consumed as source via the `@shared/*` tsconfig alias (both apps already have it), pytest + vitest + Playwright, pre-commit (ruff/eslint/prettier/bandit/gitleaks).

## Global Constraints

- Work on a branch, not `main`. Create `refactor/vibe-coding` at Task 0 (use `superpowers:using-git-worktrees` if isolating).
- Commits ARE authorized for this plan: one commit at the end of each task, message given in the task. (This overrides the repo's default "never commit unless asked" rule — the user asked by approving this plan.)
- The dev stack must be running for docker-based verification: `make dev` (or `docker compose up -d`) before Task 0.
- Pre-commit must pass on every commit — zero errors, zero warnings. If a hook rewrites files (prettier/ruff-format/end-of-file-fixer), re-stage and re-commit.
- Never edit anything under `*/migrations/`. No task in this plan touches Django models — if you find yourself editing a `models.py`, STOP; you've gone off-plan.
- Behavior-identical refactors only: no renamed URLs, no renamed management commands, no changed API responses, no UI changes.
- New `.md` files are authorized ONLY where a task explicitly creates one (Task 6). Do not create others.
- Every moved TypeScript file keeps its original `"use client"` pragma and its top-of-file comments (except `// MIRRORED FROM ...` headers, which get deleted — that convention is what Phase 2 kills).
- `packages/shared` import-purity: files under `packages/shared/src/` must never import `@/...` (app-local alias). Internal shared imports are relative (`./x`, `../lib/utils`); package deps (react, lucide-react, clsx…) resolve from the consuming app's node_modules — that mechanism already works (see `frontend-*/next.config.mjs` `externalDir` + webpack `resolve.modules`).
- `apps/demo_seed/registry.py` import-purity (Phase 4): stdlib only, never Django or `apps.*` — `apps.core` imports it at call time and a Django import would create the exact cycle this plan removes.
- If a verification step fails in a way the task doesn't anticipate, stop and report rather than improvising a fix.

---

## Phase 1 — Verification rails + accurate context

### Task 0: Baseline

**Files:** none modified.

- [x] **Step 1: Branch**

```bash
git checkout -b refactor/vibe-coding
```

- [x] **Step 2: Confirm the stack is up and tests are green**

```bash
make health-check
make test
```

Expected: `OK` from health-check; pytest run ends `passed` (some `skipped`/`xfail` are fine; zero `failed`/`error`). If the baseline is red, STOP and report — do not start refactoring on a red baseline.

- [x] **Step 3: Confirm both frontends typecheck today** (uses each app's local `tsc`)

```bash
cd frontend-main && npx tsc --noEmit && cd ..
cd frontend-customer && npx tsc --noEmit && cd ..
```

Expected: both exit 0. If either fails, record the errors in your task notes and report — that's pre-existing drift the user should know about before we wire typecheck into `make lint` (Task 3). Do not fix unrelated type errors silently.

---

### Task 1: Granular Makefile verification targets

**Files:**
- Modify: `Makefile`

**Interfaces:**
- Produces: `make test-app APP=<app>`, `make e2e-spec SPEC=<substring>`, `make test-frontend`, `make typecheck`, `make typecheck-backend` — later tasks verify with these.

- [x] **Step 1: Add the targets.** In `Makefile`, in the `# Quality` section (after the `test-fresh` target), add:

```makefile
test-app: ## Run one backend app's tests: make test-app APP=billing
	@test -n "$(APP)" || { echo "usage: make test-app APP=<app-name>  (e.g. APP=billing)"; exit 1; }
	docker compose exec django pytest apps/$(APP) -n auto

test-frontend: ## Run frontend-customer unit tests (vitest)
	cd frontend-customer && npx vitest run

typecheck: ## Typecheck both Next.js apps (tsc --noEmit; covers packages/shared via imports)
	cd frontend-main && npm run typecheck
	cd frontend-customer && npm run typecheck

typecheck-backend: ## Advisory mypy run (config in backend/pyproject.toml; not yet a gate)
	-docker compose exec django mypy apps --config-file pyproject.toml
```

And in the `# E2E` section (after `e2e-stripe`):

```makefile
e2e-spec: ## Run one e2e spec by substring: make e2e-spec SPEC=04-live-class
	@test -n "$(SPEC)" || { echo "usage: make e2e-spec SPEC=<spec-substring>  (e.g. SPEC=04-live-class)"; exit 1; }
	cd e2e && npm install --silent && npx playwright install chromium && npx playwright test $(SPEC)
```

- [x] **Step 2: Register the new names.** Update the `.PHONY` line at the top of the Makefile to also list: `test-app test-frontend typecheck typecheck-backend e2e-spec`. In the `help` target, extend the Quality grep pattern `^(test|test-backend|lint|format):` to `^(test|test-backend|test-app|test-frontend|test-fresh|typecheck|typecheck-backend|lint|format):` and the E2E grep `^(e2e|e2e-stripe):` to `^(e2e|e2e-stripe|e2e-spec):`.

- [x] **Step 3: Verify each new target's plumbing**

```bash
make test-app APP=tags        # smallest app — fast
make test-frontend
make e2e-spec SPEC=00-smoke
make typecheck-backend        # advisory: may print many errors; must not abort make
```

Expected: `test-app` runs only `apps/tags` tests and passes; `test-frontend` runs vitest and passes; `e2e-spec` runs exactly the one spec; `typecheck-backend` prints whatever mypy prints and make still exits 0 (the leading `-` swallows the exit code). If mypy is not installed in the container (`executable file not found`), that's acceptable for now — note it and move on; the target stays advisory.
(`make typecheck` is verified in Task 2 after the npm scripts exist.)

- [x] **Step 4: Commit**

```bash
git add Makefile
git commit -m "build: granular verification targets (test-app, e2e-spec, test-frontend, typecheck)"
```

---

### Task 2: Frontend `typecheck` npm scripts

**Files:**
- Modify: `frontend-main/package.json`
- Modify: `frontend-customer/package.json`

**Interfaces:**
- Consumes: `make typecheck` from Task 1.
- Produces: `npm run typecheck` in both apps.

- [x] **Step 1: Add the script to both apps.** In each `package.json` `"scripts"` block add:

```json
"typecheck": "tsc --noEmit"
```

(`typescript` is already a devDependency in both apps; `tsconfig.json` already has `strict: true` and Next-compatible settings — no config changes needed.)

- [x] **Step 2: Verify**

```bash
make typecheck
```

Expected: both apps compile with 0 errors (baseline confirmed in Task 0).

- [x] **Step 3: Commit**

```bash
git add frontend-main/package.json frontend-customer/package.json
git commit -m "build: add tsc --noEmit typecheck scripts to both frontends"
```

---

### Task 3: Wire typecheck into `make lint`

**Files:**
- Modify: `Makefile:` the `lint` target

Rationale: pre-commit stays fast (no tsc per commit); `make lint` is the repo's documented full gate, so type errors become part of it. Backend mypy stays advisory (`typecheck-backend`) until the codebase is annotated — do NOT add mypy to `lint`.

- [x] **Step 1: Extend the lint target** to:

```makefile
lint: ## Run all linters via pre-commit, then i18n parity and TS typecheck
	pre-commit run --all-files
	@$(MAKE) check-i18n
	@$(MAKE) typecheck
```

- [x] **Step 2: Verify**

```bash
make lint
```

Expected: pre-commit all green, i18n parity OK, both typechecks pass.

- [x] **Step 3: Commit**

```bash
git add Makefile
git commit -m "build: make lint now includes TS typecheck"
```

---

### Task 4: CLAUDE.md — document all 19 apps + fix stale facts

**Files:**
- Modify: `CLAUDE.md` (repo root)

Ground truth is `backend/config/settings/base.py:15-57`. Before writing each one-liner below, open the app's `models.py`/`views.py` and confirm the description is accurate; adjust wording if the code says otherwise (do not invent features).

- [x] **Step 1: Replace the SHARED_APPS / TENANT_APPS bullets** in the `### Backend (backend/)` section of CLAUDE.md with:

```markdown
**SHARED_APPS** (public schema only):
- `apps.core` — tenants, organizations, middleware (`HeaderAwareTenantMiddleware`, `TenantRateLimitMiddleware`), routers, access service, platform serializers; also hosts the onboarding wizard (`core/onboarding/`), superadmin platform API (`core/platform/`), AI infra (`ai.py`, `assistant.py`), and demo template seeding (`core/demo/`)
- `apps.accounts` — user model, auth backends (`AdminJWTBackend`, `TenantJWTAuthentication`)
- `apps.adminkit` — no models; registers API admin sites for both SPAs via `admin_panels.py` autodiscovery
- `apps.platform_email` — platform-level email campaigns (public schema; superadmin → coaches)
- `apps.domains` — custom-domain lifecycle for tenants
- `apps.mailbox` — dual-listed: public-schema rows are the superadmin platform inbox; also in TENANT_APPS for the per-coach mailbox
- `apps.demo_seed` — no models; demo-tenant seed commands + JSON content (`registry.py` is the import-pure loader)

**TENANT_APPS** (per-tenant schema):
- `apps.tenant_config` — per-tenant settings (theme, branding), logo studio backend, site assistant
- `apps.filters` — reusable filter options attached to content
- `apps.tags` — tagging for content lists
- `apps.courses` — course content + modules
- `apps.downloads` — file/resource downloads
- `apps.live` — video sessions via Stream.io (`getstream` SDK in `apps/live/stream_service.py`)
- `apps.media` — S3 / Hetzner object storage uploads (boto3)
- `apps.billing` — plans, subscriptions, payments via **Stripe Connect** (marketplace: `providers/connect.py`, `stripe_provider.py`, webhooks); `bypass` provider for dev/CI
- `apps.email_campaigns` — outbound campaigns; integrates MailCraft via `django-contentor-email-builder`
- `apps.notifications` — in-app/student notifications
- `apps.mailbox` — coach ↔ student mailbox (see dual-listing note above)
- `apps.usage` — per-tenant usage counters
- `apps.community` — community/discussion features
- `apps.blog` — tenant blog posts
```

Note: the `apps.demo_seed` bullet describes the app **created in Task 15**. If you are executing Phase 1 standalone (without Phase 4), omit that bullet and add it in Task 15 instead.

- [x] **Step 2: Fix the e2e sentence.** In the "Local fakes + e2e" section, replace the "17 specs" claim so it reads: `make e2e` runs the 24 non-Stripe specs in `e2e/specs/` (26 spec files total; the 2 Stripe specs auto-skip without `STRIPE_E2E`, and `90-logo-eval` is an AI-scored eval). Also add the new commands to the Commands block:

```
make test-app APP=billing   # one backend app's tests
make e2e-spec SPEC=04-live-class  # one Playwright spec
make test-frontend          # frontend-customer vitest
make typecheck              # tsc --noEmit, both apps
```

- [x] **Step 3: Verify** — for each app bullet, confirm against source (`ls backend/apps/<app>/` + skim `models.py`). Run `make lint` (docs edits still pass hooks: trailing whitespace, EOF).

- [x] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md covers all 19 backend apps; fix e2e spec count; new make targets"
```

---

### Task 5: REFERENCE.md + GLOSSARY.md — cover the undocumented apps

**Files:**
- Modify: `docs/REFERENCE.md` (§4 "Domain model")
- Modify: `docs/GLOSSARY.md` (§ "Apps & surfaces")

- [x] **Step 1: For each of `notifications`, `community`, `blog`, `mailbox`, `domains`, `platform_email`, `adminkit`, `tags`, `filters`, `usage`:** read `backend/apps/<app>/models.py` and `views.py` (or `services.py` where present), then add a subsection to `docs/REFERENCE.md` §4 following the existing pattern (see §4.3 "Live" for the template): heading `### 4.N <Title> (apps.<app>)`, 3–6 lines covering: the models and what they represent, which schema it lives in (public / tenant / dual for mailbox), the main API surface, and any cross-app dependency (e.g. blog → notifications). Write from the code you just read — do not guess.

- [x] **Step 2: Add glossary terms.** In `docs/GLOSSARY.md` under `## Apps & surfaces`, add one line per app in the file's existing term-definition style (e.g. **Mailbox** — dual-schema messaging: public rows = superadmin platform inbox, tenant rows = coach↔student mail).

- [x] **Step 3: Verify** — `make lint`; then grep proves coverage:

```bash
grep -c "apps.notifications\|apps.community\|apps.blog\|apps.mailbox\|apps.domains\|apps.platform_email\|apps.adminkit\|apps.tags\|apps.filters\|apps.usage" docs/REFERENCE.md
```

Expected: ≥ 10.

- [x] **Step 4: Commit**

```bash
git add docs/REFERENCE.md docs/GLOSSARY.md
git commit -m "docs: REFERENCE + GLOSSARY cover the 10 previously undocumented apps"
```

---

### Task 6: Nested context stubs (3 files, explicitly authorized)

**Files:**
- Create: `backend/apps/core/CLAUDE.md`
- Create: `packages/shared/CLAUDE.md`
- Create: `frontend-customer/src/CLAUDE.md`

- [x] **Step 1: Create `backend/apps/core/CLAUDE.md`:**

```markdown
# apps/core — local guide

Platform layer (public schema). Contains several distinct subsystems — load only the one you need:

- `models.py` — Tenant/Domain + platform billing (PlatformPlan, PlatformSubscription, WebhookEvent) + AI conversation models + platform CMS.
- `middleware/`, `routers.py` — tenant resolution (Host header / `X-Tenant-Domain`), rate limiting. Edit with care: every request passes through here.
- `access.py` — `ContentAccessService`, the paywall decision point used by courses/live/downloads/billing/notifications.
- `onboarding/` — signup wizard (compose, AI compose, recovery).
- `platform/` — superadmin platform-admin API.
- `demo/` — runtime "start from template" seeding used by the wizard (content lives in `apps/demo_seed`).
- `ai.py`, `assistant.py` — shared AI provider infra (no cross-app imports; safe leaf).

Tests: `make test-app APP=core`. Many function-local `from apps.…` imports here exist to dodge import cycles — do not "clean them up" into top-level imports without checking the cycle.
```

- [x] **Step 2: Create `packages/shared/CLAUDE.md`:**

```markdown
# packages/shared — local guide

Source-only TS library shared by both Next.js apps via the `@shared/*` tsconfig alias (no package.json — each app compiles it from source; deps resolve from the consuming app's node_modules).

- `src/admin-kit/` — generic backend-data browser used by `/admin/m` routes only. The real coach admin is NOT built on this (it uses frontend-customer's MediaBrowser/InlineEditPanel framework).
- `src/mailbox/`, `src/email/` — inbox + email-builder UI used by both apps.
- `src/ui/` — shared primitives. `src/logo/` — the logo studio engine (renderer, catalog, composer, export).
- `src/auth/` — session cookie routes shared by both apps.

Rules: never import `@/...` here (app-local alias) — internal imports are relative. Apps consume via 1-line re-export shims (e.g. `frontend-customer/src/components/ui/modal-portal.tsx`) so app-internal import paths stay stable. Changes here affect BOTH apps: verify with `make typecheck` and `make test-frontend`.
```

- [x] **Step 3: Create `frontend-customer/src/CLAUDE.md`:**

```markdown
# frontend-customer/src — local guide

Tenant portal (students) + coach admin. Conventions an agent should copy:

- Data fetching: everything goes through `clientFetch<T>()` in `lib/api-client.ts`. Public routes = server components; student/admin routes = `"use client"` + `useState`/`useEffect` + `clientFetch` (canonical template: `app/(student)/dashboard/page.tsx`).
- A feature is a four-corner slice: `app/admin/<feature>/page.tsx` + widgets in `components/admin/` + `lib/<feature>-api.ts` (or direct clientFetch) + `types/<feature>.ts`. To add an admin resource, copy `app/admin/downloads/page.tsx`.
- Admin CRUD framework: `components/admin/media-browser.tsx` (generic list) + `components/admin/inline-edit-panel.tsx` (`FieldConfig`) + `tag-filter-bar.tsx`. Edit these with care — every admin page depends on them.
- Other edit-with-care spines: `lib/api-client.ts`, `lib/blocks/registry.tsx` (page-builder block registry).
- Shared code with frontend-main lives in `packages/shared` (`@shared/*`); app files that just re-export it are shims — edit the shared source, not the shim.

Verify: `make test-frontend` (vitest), `make typecheck`, `make e2e-spec SPEC=<nn>`.
```

- [x] **Step 4: Verify + commit**

```bash
make lint
git add backend/apps/core/CLAUDE.md packages/shared/CLAUDE.md frontend-customer/src/CLAUDE.md
git commit -m "docs: nested CLAUDE.md stubs for core, packages/shared, frontend-customer"
```

Note: `packages/shared/src/auth/` and `src/logo/` are created in Phase 2; `apps/demo_seed` in Phase 4. The stubs describe the end state — that's fine, they're committed on the same branch.

---

## Phase 2 — Kill cross-frontend duplication (via `packages/shared`)

Mechanism used throughout: **move the customer copy into `packages/shared/src/`, rewrite its internal imports to relative, then replace BOTH apps' files with 1-line re-export shims** so no import site anywhere changes. Established precedent: `frontend-customer/src/components/ui/modal-portal.tsx` is exactly such a shim.

### Task 7: Move the 7 pure logo modules to `packages/shared/src/logo/`

**Files:**
- Create (moved): `packages/shared/src/logo/types.ts`, `catalog.ts`, `composer.ts`, `abstract.ts`, `migrate.ts`, `logo-renderer.tsx`, `abstract-mark.tsx`
- Modify → shim: `frontend-customer/src/types/logo.ts`, `frontend-customer/src/lib/logo/{catalog,composer,abstract,migrate}.ts`, `frontend-customer/src/components/logo/{logo-renderer,abstract-mark}.tsx`

**Interfaces:**
- Produces: `@shared/logo/types`, `@shared/logo/catalog`, `@shared/logo/composer`, `@shared/logo/abstract`, `@shared/logo/migrate`, `@shared/logo/logo-renderer`, `@shared/logo/abstract-mark` — exact same export surface as the current customer files (this task adds/removes no exports).

- [x] **Step 1: Copy files into shared** (copy, don't `git mv` — the originals become shims):

```bash
mkdir -p packages/shared/src/logo
cp frontend-customer/src/types/logo.ts                       packages/shared/src/logo/types.ts
cp frontend-customer/src/lib/logo/catalog.ts                 packages/shared/src/logo/catalog.ts
cp frontend-customer/src/lib/logo/composer.ts                packages/shared/src/logo/composer.ts
cp frontend-customer/src/lib/logo/abstract.ts                packages/shared/src/logo/abstract.ts
cp frontend-customer/src/lib/logo/migrate.ts                 packages/shared/src/logo/migrate.ts
cp frontend-customer/src/components/logo/logo-renderer.tsx   packages/shared/src/logo/logo-renderer.tsx
cp frontend-customer/src/components/logo/abstract-mark.tsx   packages/shared/src/logo/abstract-mark.tsx
```

- [x] **Step 2: Rewrite internal imports in the 7 shared files to relative.** The complete mapping (these are the only internal imports; verify with `grep -n 'from "@/' packages/shared/src/logo/*`):

| old | new |
|---|---|
| `from "@/types/logo"` | `from "./types"` |
| `from "@/lib/logo/catalog"` | `from "./catalog"` |
| `from "@/lib/logo/abstract"` | `from "./abstract"` |
| `from "./abstract-mark"` (in logo-renderer) | unchanged (already relative sibling) |

After rewriting: `grep -rn 'from "@/' packages/shared/src/logo/` must return nothing. External deps (`react`, `lucide-react`) stay as-is.

- [x] **Step 3: Replace the 7 customer originals with shims.** Each file's entire content becomes one line (keep nothing else):

```typescript
// frontend-customer/src/types/logo.ts
export * from "@shared/logo/types";
```
```typescript
// frontend-customer/src/lib/logo/catalog.ts
export * from "@shared/logo/catalog";
```
```typescript
// frontend-customer/src/lib/logo/composer.ts
export * from "@shared/logo/composer";
```
```typescript
// frontend-customer/src/lib/logo/abstract.ts
export * from "@shared/logo/abstract";
```
```typescript
// frontend-customer/src/lib/logo/migrate.ts
export * from "@shared/logo/migrate";
```
```typescript
// frontend-customer/src/components/logo/logo-renderer.tsx
export * from "@shared/logo/logo-renderer";
```
```typescript
// frontend-customer/src/components/logo/abstract-mark.tsx
export * from "@shared/logo/abstract-mark";
```

- [x] **Step 4: Verify**

```bash
cd frontend-customer && npm run typecheck && npx vitest run && cd ..
```

Expected: 0 type errors; all vitest suites pass (the logo `__tests__` import via `@/lib/logo/*` and now flow through the shims). If typecheck reports a missing export, the shared file's `export *` chain is broken — check Step 2's rewrites, not the test.

- [x] **Step 5: Commit**

```bash
git add packages/shared/src/logo frontend-customer/src/types/logo.ts frontend-customer/src/lib/logo frontend-customer/src/components/logo
git commit -m "refactor(shared): move 7 pure logo modules to packages/shared/src/logo with re-export shims"
```

---

### Task 8: The two seam files — `export.ts` and `render-draft.tsx`

These are the two files where the copies genuinely differ, and why the mirror drifted.

**Files:**
- Create: `packages/shared/src/logo/export.ts` (customer's version MINUS `uploadPng`)
- Create: `packages/shared/src/logo/render-draft.tsx` (customer's version with `ChatStage` inlined)
- Modify → shim+local: `frontend-customer/src/lib/logo/export.ts`
- Modify → shim: `frontend-customer/src/components/logo/render-draft.tsx`

**Interfaces:**
- Produces: `@shared/logo/export` (all current exports EXCEPT `uploadPng`), `@shared/logo/render-draft` (all current exports; `ChatStage` defined locally as `type ChatStage = "icon" | "name" | "tagline"`).
- Customer keeps `uploadPng` at its current path `@/lib/logo/export` (defined locally in the shim file — it uses the tenant-authenticated `clientFetch`, which must NOT enter shared).

- [x] **Step 1: Create `packages/shared/src/logo/export.ts`:** copy `frontend-customer/src/lib/logo/export.ts`, then delete: the `import { clientFetch } from "@/lib/api-client";` line, the `PresignResponse` and `CompleteResponse` interfaces, and the entire `uploadPng` function (from its doc comment `/** Upload an exported PNG …` to the end of the file). Result must contain no `@/` imports: `grep -c 'from "@/' packages/shared/src/logo/export.ts` → 0.

- [x] **Step 2: Rewrite `frontend-customer/src/lib/logo/export.ts`** to be shim + the customer-only upload. Keep the existing `uploadPng` implementation and its two interfaces verbatim from the current file:

```typescript
export * from "@shared/logo/export";

// ─── Customer-only: tenant-authenticated PNG upload ────────────────
// Uses clientFetch (tenant session), so it lives here, not in @shared.
import { clientFetch } from "@/lib/api-client";

interface PresignResponse {
  upload_url: string;
  s3_key: string;
}

interface CompleteResponse {
  photo_id: string;
  signed_url: string;
}

/** Upload an exported PNG through the existing photo-upload flow (presign → PUT → complete). */
export async function uploadPng(
  blob: Blob,
  filename: string,
  contentType = "image/png",
): Promise<CompleteResponse> {
  // … keep the current function body from the existing file, unchanged …
}
```

(Copy the current `uploadPng` body exactly — presign POST to `/api/v1/upload/presign/`, PUT to `upload_url` with an `Upload failed: ${put.status}` throw, then complete POST to `/api/v1/upload/complete/`.)

- [x] **Step 3: Create `packages/shared/src/logo/render-draft.tsx`:** copy `frontend-customer/src/components/logo/render-draft.tsx`, then:
  - Replace `import type { ChatStage } from "@/lib/logo/converse-api";` with a local `type ChatStage = "icon" | "name" | "tagline";` (converse-api is tenant-authenticated and stays app-local — same reasoning as the old frontend-main mirror note).
  - Rewrite remaining internal imports: `@/lib/logo/composer` → `./composer`, `@/lib/logo/export` → `./export`, `@/types/logo` → `./types`, `./logo-renderer` stays.
  - `grep -c 'from "@/' packages/shared/src/logo/render-draft.tsx` → 0.

- [x] **Step 4: Shim the customer original:**

```typescript
// frontend-customer/src/components/logo/render-draft.tsx
export * from "@shared/logo/render-draft";
```

- [x] **Step 5: Verify**

```bash
cd frontend-customer && npm run typecheck && npx vitest run && cd ..
```

Expected: green. (If something imported `ChatStage` *from render-draft*, TS will flag it — it doesn't today; `ChatStage`'s public home remains `@/lib/logo/converse-api`.)

- [x] **Step 6: Commit**

```bash
git add packages/shared/src/logo frontend-customer/src/lib/logo/export.ts frontend-customer/src/components/logo/render-draft.tsx
git commit -m "refactor(shared): export/render-draft move to shared with uploadPng kept customer-local"
```

---

### Task 9: Point frontend-main at shared; delete the mirrors

**Files:**
- Modify → shim: `frontend-main/src/types/logo.ts`, `frontend-main/src/lib/logo/{catalog,composer,abstract,migrate,export}.ts`, `frontend-main/src/lib/logo/render-draft.tsx`, `frontend-main/src/components/logo/{logo-renderer,abstract-mark}.tsx`

**Interfaces:**
- Consumes: everything Tasks 7–8 produced. Note frontend-main's importers (`app/signup/verify/wizard/ai-logo.tsx`, `lib/wizard/types.ts`, `lib/wizard/logo-api.ts`) keep their existing `@/…` paths — shims preserve them. frontend-main never imported `uploadPng` (it uses `wizardLogoUpload` in `lib/wizard/logo-api.ts`), so the shared `export.ts` surface is sufficient.

- [x] **Step 1: Replace each of the 9 frontend-main mirror files with its shim** (entire file content, deleting the `// MIRRORED FROM …` headers with the code):

```typescript
// frontend-main/src/types/logo.ts
export * from "@shared/logo/types";
```
```typescript
// frontend-main/src/lib/logo/catalog.ts
export * from "@shared/logo/catalog";
```
```typescript
// frontend-main/src/lib/logo/composer.ts
export * from "@shared/logo/composer";
```
```typescript
// frontend-main/src/lib/logo/abstract.ts
export * from "@shared/logo/abstract";
```
```typescript
// frontend-main/src/lib/logo/migrate.ts
export * from "@shared/logo/migrate";
```
```typescript
// frontend-main/src/lib/logo/export.ts
export * from "@shared/logo/export";
```
```typescript
// frontend-main/src/lib/logo/render-draft.tsx
export * from "@shared/logo/render-draft";
```
```typescript
// frontend-main/src/components/logo/logo-renderer.tsx
export * from "@shared/logo/logo-renderer";
```
```typescript
// frontend-main/src/components/logo/abstract-mark.tsx
export * from "@shared/logo/abstract-mark";
```

- [x] **Step 2: Confirm no mirror headers remain anywhere**

```bash
grep -rn "MIRRORED FROM" frontend-main/src frontend-customer/src packages/
```

Expected: no output.

- [x] **Step 3: Verify both apps compile and the wizard flow still works end-to-end**

```bash
make typecheck
make e2e-spec SPEC=23-wizard-ai-logo
make e2e-spec SPEC=15-logo-studio
```

Expected: typecheck green; both specs pass (23 exercises the frontend-main wizard logo path, 15 the customer studio).

- [x] **Step 4: Commit**

```bash
git add frontend-main/src
git commit -m "refactor(shared): frontend-main logo mirrors become @shared/logo shims (-~2,400 duplicated LOC)"
```

---

### Task 10: Shared UI primitives (`shadcn`) + `utils` + `empty-state`

**Files:**
- Create (moved): `packages/shared/src/lib/utils.ts`; `packages/shared/src/ui/{button,card,table,tabs,badge,input,label,separator,skeleton,switch,empty-state}.tsx`
- Modify → shim: the same 11 filenames under BOTH `frontend-main/src` and `frontend-customer/src` (`components/ui/*` ×10, `lib/utils.ts`, `components/shared/empty-state.tsx`)

These 12 file-pairs were verified byte-identical on 2026-07-17. Only move a pair if it is STILL identical — re-check first.

- [x] **Step 1: Guard, then copy from customer into shared**

```bash
for f in button card table tabs badge input label separator skeleton switch; do
  diff -q frontend-main/src/components/ui/$f.tsx frontend-customer/src/components/ui/$f.tsx || { echo "DRIFTED: $f — leave it out and note it"; }
done
diff -q frontend-main/src/lib/utils.ts frontend-customer/src/lib/utils.ts
diff -q frontend-main/src/components/shared/empty-state.tsx frontend-customer/src/components/shared/empty-state.tsx

mkdir -p packages/shared/src/ui packages/shared/src/lib
cp frontend-customer/src/lib/utils.ts packages/shared/src/lib/utils.ts
for f in button card table tabs badge input label separator skeleton switch; do
  cp frontend-customer/src/components/ui/$f.tsx packages/shared/src/ui/$f.tsx
done
cp frontend-customer/src/components/shared/empty-state.tsx packages/shared/src/ui/empty-state.tsx
```

Any pair reported `DRIFTED` is excluded from this task (skip its move + shims) and reported at the end.

- [x] **Step 2: Rewrite `cn` imports in the shared copies.** In each `packages/shared/src/ui/*.tsx`, change `import { cn } from "@/lib/utils";` → `import { cn } from "../lib/utils";`. If `empty-state.tsx` imports other `@/components/ui/*` primitives, point them at siblings (`./button` etc.). Then: `grep -rn 'from "@/' packages/shared/src/ui packages/shared/src/lib` → no output.

- [x] **Step 3: Shim all 24 app files.** In BOTH apps, each file becomes one line:

```typescript
// <app>/src/lib/utils.ts
export * from "@shared/lib/utils";
```
```typescript
// <app>/src/components/ui/button.tsx
export * from "@shared/ui/button";
```
…and identically for `card`, `table`, `tabs`, `badge`, `input`, `label`, `separator`, `skeleton`, `switch`, and:
```typescript
// <app>/src/components/shared/empty-state.tsx
export * from "@shared/ui/empty-state";
```

- [x] **Step 4: Verify**

```bash
make typecheck
make test-frontend
make e2e-spec SPEC=00-smoke
```

Expected: all green. `export *` forwards named exports (`Button`, `buttonVariants`, `cn`, …); if typecheck flags a missing *default* export anywhere, check that file's original export style — none of these 12 use default exports today.

- [x] **Step 5: Commit**

```bash
git add packages/shared/src frontend-main/src frontend-customer/src
git commit -m "refactor(shared): dedupe identical ui primitives + utils + empty-state into @shared (-~580 LOC)"
```

---

### Task 11: Shared auth session routes

**Files:**
- Create: `packages/shared/src/auth/cookies.ts`, `packages/shared/src/auth/login-route.ts`, `packages/shared/src/auth/logout-route.ts`
- Modify: both apps' `src/app/api/auth/google/route.ts`, `src/app/api/auth/logout/route.ts` (become handler re-exports)
- Modify: both apps' `src/lib/constants.ts` (COOKIE_NAME becomes a re-export)

**Interfaces:**
- Produces: `COOKIE_NAME` (value `"contentor_access_token"`, verified identical in both apps) from `@shared/auth/cookies`; `POST` handlers from `@shared/auth/login-route` and `@shared/auth/logout-route`.

- [x] **Step 1: Create `packages/shared/src/auth/cookies.ts`:**

```typescript
export const COOKIE_NAME = "contentor_access_token";
```

- [x] **Step 2: Create `packages/shared/src/auth/login-route.ts`** (body from the current identical route files, import path swapped):

```typescript
import { NextRequest, NextResponse } from "next/server";

import { COOKIE_NAME } from "./cookies";

export async function POST(request: NextRequest) {
  const { token } = await request.json();

  if (!token) {
    return NextResponse.json({ detail: "No token provided" }, { status: 400 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: "/",
  });

  return response;
}
```

- [x] **Step 3: Create `packages/shared/src/auth/logout-route.ts`:**

```typescript
import { NextResponse } from "next/server";

import { COOKIE_NAME } from "./cookies";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  return response;
}
```

- [x] **Step 4: Re-export from the 4 route files** (both apps; whole file content):

```typescript
// <app>/src/app/api/auth/google/route.ts
export { POST } from "@shared/auth/login-route";
```
```typescript
// <app>/src/app/api/auth/logout/route.ts
export { POST } from "@shared/auth/logout-route";
```

- [x] **Step 5: Single-source the cookie name.** In both apps' `src/lib/constants.ts`, replace the line `export const COOKIE_NAME = "contentor_access_token";` with:

```typescript
export { COOKIE_NAME } from "@shared/auth/cookies";
```

(Leave every other constant in those files untouched.)

- [x] **Step 6: Verify** — login flows are covered by e2e:

```bash
make typecheck
make e2e-spec SPEC=11-login-code
make e2e-spec SPEC=00-smoke
```

Expected: green. If Next complains about route exports, the `export { POST } from` form is the supported re-export — check for typos before changing approach.

- [x] **Step 7: Commit**

```bash
git add packages/shared/src/auth frontend-main/src frontend-customer/src
git commit -m "refactor(shared): single-source auth session routes and COOKIE_NAME"
```

---

## Phase 3 — God-file splits (behavior-identical)

### Task 12: Split `admin/live/page.tsx` (1,743 lines → 6 files)

**Files:**
- Create: `frontend-customer/src/components/admin/live/shared.tsx` (lines 42–198 of the current page)
- Create: `frontend-customer/src/components/admin/live/classes-tab.tsx` (lines 200–582), `streams-tab.tsx` (583–967), `zoom-tab.tsx` (968–1313), `onsite-tab.tsx` (1314–1695)
- Modify: `frontend-customer/src/app/admin/live/page.tsx` (becomes the ~60-line shell, lines 1696–1743 + imports)

**Interfaces:**
- Produces from `shared.tsx`: `export` the types `LiveItem`, `LiveClass`, `LiveStream`, `ZoomClass`, `OnsiteEvent`, `PaginatedResponse`; the values `statusConfig`, `SORT_OPTIONS`, `selectClasses`, `StatusBadge`, `PricingBadge`, `fetchAdminListPage`, `formatDate`, `toLocalDatetimeValue`.
- Produces from each tab file: `export function LiveClassesTab()` / `LiveStreamsTab()` / `ZoomClassesTab()` / `OnsiteEventsTab()` (add `export` — they're module-private today).
- The URL stays `/admin/live` with the same four `<Tabs>`; ZERO behavior change.

- [x] **Step 1: Create `components/admin/live/shared.tsx`.** Move lines 42–198 of the current page verbatim (the block from `interface LiveItem {` through `toLocalDatetimeValue`), prepend `export` to every declaration listed in Interfaces, and this header:

```typescript
import { Clock, Radio, CheckCircle2 } from "lucide-react";
import { clientFetch } from "@/lib/api-client";
import type {
  FetchPageParams,
  FetchPageResult,
} from "@/components/admin/media-browser";
import type { FilterOption, Tag } from "@/types/course";
```

(No `"use client"` needed — it exports no hooks-using components, and its JSX consumers are client components. If Next complains during build, add `"use client"` as line 1.)

- [x] **Step 2: Create the four tab files.** For each, cut its line-range from the page verbatim (the `const <x>Fields: FieldConfig<…>[] = […]` plus the `function <X>Tab() {…}`), add `export` to the Tab function, and prepend this superset header:

```typescript
"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Play,
  Square,
  Radio,
  Clock,
  CheckCircle2,
  Video,
  ExternalLink,
  MapPin,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TableCell, TableRow } from "@/components/ui/table";
import { clientFetch, batchedAsync } from "@/lib/api-client";
import { toast } from "sonner";
import {
  MediaBrowser,
  type MediaBrowserHandle,
  type FetchPageParams,
  type FetchPageResult,
} from "@/components/admin/media-browser";
import {
  InlineEditPanel,
  type FieldConfig,
} from "@/components/admin/inline-edit-panel";
import { FilterPicker } from "@/components/admin/filter-picker";
import { TagInput } from "@/components/admin/tag-input";
import { TagFilterBar } from "@/components/admin/tag-filter-bar";
import { DemoBadge } from "@/components/setup/demo-badge";
import type { FilterOption, Tag } from "@/types/course";
import {
  type LiveClass,
  type LiveStream,
  type ZoomClass,
  type OnsiteEvent,
  SORT_OPTIONS,
  selectClasses,
  StatusBadge,
  PricingBadge,
  fetchAdminListPage,
  formatDate,
  toLocalDatetimeValue,
} from "./shared";
```

Then per file run `npx tsc --noEmit` (from `frontend-customer/`) and DELETE every import TS reports as unused (TS6133 shows as eslint `no-unused-vars` — `npx eslint --fix src/components/admin/live/` also prunes what it can). Each tab keeps only the type it uses (e.g. `classes-tab.tsx` keeps `LiveClass`, drops `ZoomClass`…).

- [x] **Step 3: Rewrite `app/admin/live/page.tsx`** as the shell — exactly the current `LiveEventsPage` JSX (lines 1696–1743, unchanged) with this header:

```typescript
"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { LiveClassesTab } from "@/components/admin/live/classes-tab";
import { LiveStreamsTab } from "@/components/admin/live/streams-tab";
import { ZoomClassesTab } from "@/components/admin/live/zoom-tab";
import { OnsiteEventsTab } from "@/components/admin/live/onsite-tab";

export default function LiveEventsPage() {
  // … lines 1696–1743 body, verbatim …
}
```

- [x] **Step 4: Verify — the strong gate for this task**

```bash
cd frontend-customer && npm run typecheck && npx eslint src/components/admin/live src/app/admin/live && cd ..
make e2e-spec SPEC=04-live-class
make e2e-spec SPEC=13-events-page
```

Expected: all green. `git diff --stat` should show `page.tsx` shrinking to ≈60 lines and 5 new files totaling ≈1,750.

- [x] **Step 5: Commit**

```bash
git add frontend-customer/src/app/admin/live frontend-customer/src/components/admin/live
git commit -m "refactor(admin): split live page into 4 tab slices + shared helpers (1743-line file -> 6 files)"
```

---

### Task 13: Split `studio-panel.tsx` (903 lines → directory)

**Files:**
- Create: `frontend-customer/src/components/logo/studio-panel/constants.ts` (current lines 30–57), `refine-prompt-box.tsx` (83–166), `text-controls.tsx` (217–419), `mark-controls.tsx` (420–755), `global-controls.tsx` (756–903), `index.tsx` (lines 58–82 `StudioPanelProps` + 167–216 `StudioPanel`)
- Delete: `frontend-customer/src/components/logo/studio-panel.tsx`

The only importer is `studio-editor.tsx` via `./studio-panel` — a `studio-panel/index.tsx` resolves to the same specifier, so **no importer changes**.

**Interfaces:**
- `constants.ts` exports `LAYOUTS`, `BADGES`, `VIBES`, `WEIGHT_LABELS`, `toggleClass` (add `export` to each).
- Each control file exports its component (`export function TextControls(…)` etc.) with its inline props type moved along verbatim.
- `index.tsx` exports `StudioPanel` (and `StudioPanelProps` type) — same public surface as today (only `StudioPanel` is exported now; keep it that way plus the type if needed by `index` internals).

- [x] **Step 1: Create the directory and move each line-range verbatim** into its file. Add `export` to each moved declaration. `index.tsx` composes:

```typescript
"use client";

// … StudioPanelProps interface (current lines 58–82), verbatim …

export function StudioPanel(props: StudioPanelProps) {
  // … current lines 167–216 body, verbatim …
}
```

with imports of `RefinePromptBox`, `TextControls`, `MarkControls`, `GlobalControls` from siblings.

- [x] **Step 2: Give every new file the subset of the original imports it needs.** Start from the original 29-line import block (lines 1–28 of the old file) as the superset in each file, add `import { LAYOUTS, BADGES, VIBES, WEIGHT_LABELS, toggleClass } from "./constants";` and sibling imports where used, fix the relative paths that shift one directory deeper (`./abstract-mark` → `../abstract-mark`, `./logo-renderer` → `../logo-renderer`, `./studio-canvas` → `../studio-canvas`), then prune unused imports via `npx tsc --noEmit` + `npx eslint --fix src/components/logo/studio-panel/`. Every moved file that renders JSX starts with `"use client";`.

- [x] **Step 3: Delete the old `studio-panel.tsx`**, then verify:

```bash
cd frontend-customer && npm run typecheck && npx vitest run && cd ..
make e2e-spec SPEC=15-logo-studio
```

Expected: green; the studio e2e drives the panel UI for real.

- [x] **Step 4: Commit**

```bash
git add frontend-customer/src/components/logo
git commit -m "refactor(logo): split studio-panel into per-control-group files (903-line file -> directory)"
```

---

### Task 14: Split `billing/views/webhooks.py` (902 lines → dispatcher + 3 modules)

**Files:**
- Create: `backend/apps/billing/views/webhooks_common.py` (current lines 54–108: `_ts_to_dt`, `_sub_period`, `_invoice_subscription_id`, `_invoice_period_end`)
- Create: `backend/apps/billing/views/webhooks_platform.py` (platform-side: `_resolve_tenant`, `_resolve_user`, `_resolve_plan`, `_upsert_subscription_from_event`, `_map_stripe_status`, `sync_platform_checkout_session`, `_handle_subscription_event`, `_handle_platform_subscription_deleted`, `_handle_invoice_paid`)
- Create: `backend/apps/billing/views/webhooks_connect.py` (marketplace/Connect-side: `_resolve_tenant_for_connect`, `_handle_marketplace_checkout_completed`, `_connected_tenant`, `_tenant_sub_status`, `_upsert_tenant_subscription`, `_handle_marketplace_subscription_checkout`, `_handle_marketplace_subscription_event`, `_handle_marketplace_subscription_deleted`, `_invoice_subscription_metadata`, `_handle_marketplace_invoice_paid`, `_handle_marketplace_invoice_failed`, `_handle_account_updated`)
- Modify: `backend/apps/billing/views/webhooks.py` (keeps: module docstring, `_STRIPE_HANDLED`, `_handle_checkout_session_completed` — it routes to BOTH sides — and `stripe_webhook`)
- Modify: `backend/apps/core/onboarding/wizard.py:257` (import path update)

**Interfaces:**
- `config/urls.py:9` (`from apps.billing.views.webhooks import stripe_webhook`) must keep working — `stripe_webhook` stays in `webhooks.py`.
- CRITICAL for tests: `webhooks.py` must import every handler **by name** (`from .webhooks_platform import _handle_invoice_paid, …`) so existing monkeypatches of `apps.billing.views.webhooks._handle_*` still intercept the dispatcher's calls. Do NOT switch the dispatcher to `webhooks_platform._handle_invoice_paid(...)` module-attribute calls.
- `webhooks_connect.py` note near its imports: `apps.domains.webhooks` imports from billing — keep `handle_domain_event` imported only in `webhooks.py` (as today) to preserve the existing one-way edge (`domains/webhooks.py:30` documents the direction).

- [x] **Step 1: Move the functions.** Each new module gets: `from __future__ import annotations`, its own `logger = logging.getLogger(__name__)`, the subset of the current import block (lines 12–37) it needs (prune with ruff), plus `from .webhooks_common import …` where used. Function bodies move verbatim — zero logic edits. `webhooks_platform.py` keeps the imports of `User`, `PlatformPlan`, `PlatformSubscription`, `Tenant`; `webhooks_connect.py` keeps `tenant_context`, `Tenant`, and the billing-model imports its functions use.

- [x] **Step 2: Rebuild `webhooks.py`** as: docstring + `_STRIPE_HANDLED` + name-imports:

```python
from .webhooks_connect import (
    _connected_tenant,
    _handle_account_updated,
    _handle_marketplace_checkout_completed,
    _handle_marketplace_invoice_failed,
    _handle_marketplace_invoice_paid,
    _handle_marketplace_subscription_checkout,
    _handle_marketplace_subscription_deleted,
    _handle_marketplace_subscription_event,
)
from .webhooks_platform import (
    _handle_invoice_paid,
    _handle_platform_subscription_deleted,
    _handle_subscription_event,
    _resolve_tenant,
    _resolve_user,
    _resolve_plan,
    sync_platform_checkout_session,  # noqa: F401  (re-exported: onboarding + tests import it from here)
)
```

plus `_handle_checkout_session_completed` and `stripe_webhook` verbatim. Keep only the imports each remaining function needs (ruff will flag the rest). If `_handle_checkout_session_completed` calls marketplace helpers not in the list above, import those too — follow the NameErrors, not this list, if they diverge.

- [x] **Step 3: Update the one external private-path importer.** `backend/apps/core/onboarding/wizard.py:257`: `from apps.billing.views.webhooks import sync_platform_checkout_session` → `from apps.billing.views.webhooks_platform import sync_platform_checkout_session`.

- [x] **Step 4: Check test monkeypatch targets still resolve**

```bash
grep -rn "views\.webhooks" backend/apps/billing/tests/ backend/apps/core/tests/ | grep -v webhooks_
```

For every `patch("apps.billing.views.webhooks.<name>")` hit: `<name>` must be importable from `webhooks.py` (the name-imports above make that true for all handlers the dispatcher calls). If a test patches something you moved and did NOT re-import, add it to the import block.

- [x] **Step 5: Verify**

```bash
make test-app APP=billing
make test-app APP=core
```

Expected: all pass. If a webhook test fails on a patch target, revisit Step 4 — that's the failure mode this design guards against.

- [x] **Step 6: Commit**

```bash
git add backend/apps/billing/views backend/apps/core/onboarding/wizard.py
git commit -m "refactor(billing): split stripe webhooks into platform/connect/common modules, dispatcher preserved"
```

---

## Phase 4 — Demo seeding out of core; content as data

### Task 15: Create `apps.demo_seed` and move the seed machinery (code move only)

**Files:**
- Create: `backend/apps/demo_seed/__init__.py` (empty), `backend/apps/demo_seed/apps.py`, `backend/apps/demo_seed/management/__init__.py` (empty), `backend/apps/demo_seed/management/commands/__init__.py` (empty)
- Move (git mv): `backend/apps/core/management/commands/seed_demo_tenant.py` → `backend/apps/demo_seed/management/commands/seed_demo_tenant.py`; same for `seed_all_demos.py`; and the whole `backend/apps/core/management/commands/demo_data/` package → `backend/apps/demo_seed/management/commands/demo_data/`
- Modify: `backend/config/settings/base.py` (register app), `backend/apps/core/management/commands/seed_plans.py` (~line 210), `backend/apps/core/demo/seed_template.py` (demo_data references), `backend/apps/core/tests/test_demo_data.py`, `backend/apps/core/tests/test_demo_templates_navbar.py`

Stays in core (runtime/wizard, NOT moved): `apps/core/demo/` (seed_template, views), `seed_wizard_mockup_tenant.py`, `seed_plans.py`, `seed_curated_logos.py`. Management command NAMES don't change, so the Makefile and `call_command` sites keep working.

**Interfaces:**
- Produces: installed app `apps.demo_seed` (no models, no migrations, no urls); Python package path `apps.demo_seed.management.commands.demo_data`.

- [x] **Step 1: Create the app skeleton.** `apps.py`:

```python
from django.apps import AppConfig


class DemoSeedConfig(AppConfig):
    name = "apps.demo_seed"
    verbose_name = "Demo Seeding"
```

- [x] **Step 2: Register it.** In `backend/config/settings/base.py` SHARED_APPS, after the `"apps.mailbox",` entry add:

```python
    # No models — demo-tenant seed commands + content registry (import-pure).
    "apps.demo_seed",
```

- [x] **Step 3: git mv the three paths** listed under Files.

- [x] **Step 4: Update every dotted-path reference.** Find them all:

```bash
grep -rn "core.management.commands.demo_data\|management.commands import demo_data" backend --include='*.py'
```

Known sites and their edits (the grep is authoritative if it finds more):
- moved `seed_demo_tenant.py` (~line 38): `apps.core.management.commands.demo_data.{niche}` → `apps.demo_seed.management.commands.demo_data.{niche}`
- moved `seed_all_demos.py` (~line 34): same substitution (its `Path(__file__).parent / "demo_data"` self-reference still works — it moved together)
- `apps/core/management/commands/seed_plans.py` (~210): `demo_data_dir = Path(__file__).parent / "demo_data"` no longer exists there. Replace the two lines with:

```python
        from apps.demo_seed.management.commands import demo_data as demo_data_pkg

        demo_data_dir = Path(demo_data_pkg.__file__).parent
        niches = [f.stem for f in demo_data_dir.glob("*.py") if not f.stem.startswith("_")]
```

  (Note `startswith("_")` also excludes `_base` — the old `!= "__init__"` filter passed `_base` as a fake niche that failed with a warning on every seed run. This fixes that latent bug.)
- `apps/core/demo/seed_template.py`: in `available_niches()` (~line 63) and anywhere else the grep hits: `from apps.core.management.commands import demo_data` → `from apps.demo_seed.management.commands import demo_data`, and any `importlib.import_module(f"apps.core.management.commands.demo_data.…")` → the `apps.demo_seed…` path.
- `apps/core/tests/test_demo_data.py` (lines ~10, 12, 22) and `test_demo_templates_navbar.py` (~line 24): same path substitution.

- [x] **Step 5: Verify**

```bash
docker compose restart django   # picks up INSTALLED_APPS change
make test-app APP=core
docker compose exec django python manage.py seed_all_demos --help
docker compose exec django python manage.py seed_demo_tenant --help
```

Expected: core tests pass; both commands are found (proves Django discovers them in the new app). Then the real proof:

```bash
make seed-demos
```

Expected: completes with the same per-niche output as before (needs `.env.prod` creds for asset mirroring — if `mirror_demo_assets.py` fails for missing creds, run `docker compose exec django python manage.py seed_all_demos` directly instead and note it).

- [x] **Step 6: Commit**

```bash
git add backend/apps/demo_seed backend/apps/core backend/config/settings/base.py
git commit -m "refactor(backend): extract demo seeding from apps.core into apps.demo_seed (~6.5k lines out of core)"
```

---

### Task 16: Demo verticals → JSON + import-pure registry

**Files:**
- Create: `backend/apps/demo_seed/registry.py`; `backend/apps/demo_seed/data/<niche>.json` (one per vertical, generated)
- Modify: `backend/apps/demo_seed/management/commands/seed_demo_tenant.py`, `seed_all_demos.py`; `backend/apps/core/management/commands/seed_plans.py`; `backend/apps/core/demo/seed_template.py`; `backend/apps/core/tests/test_demo_data.py`, `test_demo_templates_navbar.py`
- Delete: `backend/apps/demo_seed/management/commands/demo_data/` (entire package, after parity passes)

**Interfaces:**
- Produces: `apps.demo_seed.registry.list_niches() -> list[str]` and `load_niche(niche: str) -> types.SimpleNamespace` (attributes `TENANT`, `CONFIG`, `COURSES` — exactly the attrs the current modules expose; `SimpleNamespace` keeps the `data.TENANT` attribute-access style so `seed_demo_tenant` internals don't change).
- Constraint: `registry.py` is import-pure (stdlib only) — `apps.core` (`seed_plans`, `seed_template`) imports it without creating a core↔demo_seed cycle.

- [x] **Step 1: Create `backend/apps/demo_seed/registry.py`:**

```python
"""JSON-backed registry of demo-tenant content.

IMPORT-PURITY CONSTRAINT: apps.core (seed_plans, demo/seed_template) imports
this module. It must only ever import from the stdlib — importing Django or
anything under apps.* here would recreate the core<->demo_seed import cycle
this app exists to remove.
"""

from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

DATA_DIR = Path(__file__).parent / "data"


def list_niches() -> list[str]:
    """Niche keys, sorted — one per data/<niche>.json file."""
    return sorted(p.stem for p in DATA_DIR.glob("*.json"))


def load_niche(niche: str) -> SimpleNamespace:
    """Load one niche's content. Attributes: TENANT, CONFIG, COURSES."""
    path = DATA_DIR / f"{niche}.json"
    with path.open(encoding="utf-8") as fh:
        return SimpleNamespace(**json.load(fh))
```

- [x] **Step 2: Generate the JSON with a parity gate.** Run inside the container (writes land on the host via the bind mount):

```bash
mkdir -p backend/apps/demo_seed/data
docker compose exec django python - <<'EOF'
import importlib, json
from pathlib import Path

src = Path("apps/demo_seed/management/commands/demo_data")
out = Path("apps/demo_seed/data")
out.mkdir(exist_ok=True)
ATTRS = ("TENANT", "CONFIG", "COURSES")

for py in sorted(src.glob("*.py")):
    if py.stem.startswith("_"):
        continue
    mod = importlib.import_module(f"apps.demo_seed.management.commands.demo_data.{py.stem}")
    payload = {a: getattr(mod, a) for a in ATTRS if hasattr(mod, a)}
    assert payload, f"{py.stem}: no seedable attrs"
    roundtrip = json.loads(json.dumps(payload))
    assert roundtrip == payload, f"{py.stem} is NOT JSON-clean (tuples/int-keys/sets?) — ABORT TASK, report"
    (out / f"{py.stem}.json").write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(f"wrote {py.stem}.json  attrs={sorted(payload)}")
EOF
```

Expected: one `wrote <niche>.json` line per vertical, zero assertion failures. **If any parity assertion fails, stop the task and report** — the content isn't pure JSON and needs a human decision.

- [x] **Step 3: Switch all consumers to the registry.**
- `demo_seed/management/commands/seed_demo_tenant.py`: replace the importlib line (~38) with `data = load_niche(niche)` and add `from apps.demo_seed.registry import load_niche` at the top (drop `importlib` if now unused). `data.TENANT / data.CONFIG / data.COURSES` accesses are untouched.
- `demo_seed/management/commands/seed_all_demos.py`: replace the `demo_dir` glob + `importlib.import_module` discovery with `from apps.demo_seed.registry import list_niches, load_niche` usage (`for niche in list_niches():` … `module = load_niche(niche)`).
- `core/management/commands/seed_plans.py`: replace the Task-15 block with:

```python
        from apps.demo_seed.registry import list_niches

        niches = list_niches()
```

- `core/demo/seed_template.py`: `available_niches()` body becomes `from apps.demo_seed.registry import list_niches` + `return list_niches()` (keep its docstring); replace its content-loading `importlib.import_module(...)` call(s) with `load_niche(...)`. IMPORTANT: `load_niche` returns a namespace whose attrs match what the module exposed — if `seed_template` used `getattr(module, "X", default)` patterns they still work.
- Tests: in `test_demo_data.py` and `test_demo_templates_navbar.py`, replace `importlib.import_module(f"apps.…demo_data.{name}")` with `load_niche(name)` (namespace attr access is unchanged), iterate niches via `list_niches()`, and DELETE the `deep_merge` test + `_base` imports (the merge is now pre-applied in the JSON — that trade-off is intentional: explicit per-niche data over a shared merge base).

- [x] **Step 4: Delete the Python content package**

```bash
git rm -r backend/apps/demo_seed/management/commands/demo_data
```

Then confirm nothing references it: `grep -rn "demo_data" backend --include='*.py'` → only comments/strings that describe history (ideally zero code hits).

- [x] **Step 5: Verify**

```bash
docker compose restart django
make test-app APP=core
docker compose exec django python manage.py seed_all_demos --force
make e2e-spec SPEC=01-signup-onboarding
```

Expected: tests green; the force-reseed rebuilds every demo tenant from JSON with the same console output shape as before; the onboarding e2e proves the wizard's template path (`seed_template` → registry) still seeds a working tenant.

- [x] **Step 6: Commit**

```bash
git add backend/apps/demo_seed backend/apps/core
git commit -m "refactor(demo): vertical content as JSON behind import-pure registry (-~4,900 lines of Python literals)"
```

---

## Phase 5 — Contract-drift infrastructure (pilot)

### Task 17: OpenAPI schema endpoint + typegen script

**Files:**
- Modify: `backend/requirements/base.txt` (add drf-spectacular)
- Modify: `backend/config/settings/base.py` (schema class + SPECTACULAR_SETTINGS)
- Modify: `backend/config/urls.py` (schema route)
- Modify: `frontend-customer/package.json` (devDep + `gen:api` script)
- Create: `frontend-customer/src/types/api-generated.ts` (generated, committed)
- Modify: `CLAUDE.md` (document the workflow)

Scope note (deliberate): this task adds the *infrastructure* and commits a first generated snapshot. It does NOT rewrite existing hand-written interfaces — adopt them module-by-module in later work.

- [x] **Step 1: Backend dependency.** Append to `backend/requirements/base.txt` (match the file's existing pin style):

```
drf-spectacular>=0.27.2,<0.29
```

Rebuild: `docker compose up -d --build django`. (If pip resolution fails on the range, pin `drf-spectacular==0.27.2` — known-good with Django 5.1/DRF.)

- [x] **Step 2: Settings.** In `backend/config/settings/base.py`: add `"drf_spectacular",` to SHARED_APPS (after `"corsheaders",`); in the existing `REST_FRAMEWORK` dict add `"DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",`; and add:

```python
SPECTACULAR_SETTINGS = {
    "TITLE": "Contentor API",
    "VERSION": "v1",
    "SERVE_INCLUDE_SCHEMA": False,
}
```

- [x] **Step 3: URL.** In `backend/config/urls.py`, alongside the health route:

```python
from drf_spectacular.views import SpectacularAPIView
```
```python
    path(
        "api/schema/",
        SpectacularAPIView.as_view(authentication_classes=[], permission_classes=[]),
        name="api-schema",
    ),
```

(Empty `authentication_classes` dodges the `TenantJWTAuthentication` default, same pattern the repo's public endpoints use per CLAUDE.md; empty permissions = open. The endpoint serves a schema, not data.)

- [x] **Step 4: Verify the schema serves**

```bash
docker compose restart django && sleep 3
curl -sf http://localhost/api/schema/ | head -3
```

Expected: output starts with `openapi: 3.…`. Expect a wall of spectacular WARNINGs in django logs (unannotated serializers) — warnings are fine; a 500 is not.

- [x] **Step 5: Frontend typegen.** In `frontend-customer/`: `npm install --save-dev openapi-typescript@^7`, add script:

```json
"gen:api": "openapi-typescript http://localhost/api/schema/ -o src/types/api-generated.ts"
```

Run `npm run gen:api`. Then exclude the generated file from lint noise: add `src/types/api-generated.ts` to `frontend-customer/.eslintignore` (create the file if absent). Commit the generated snapshot.

- [x] **Step 6: Verify + document**

```bash
make typecheck
make lint
```

In CLAUDE.md's backend section add two lines: the API schema lives at `/api/schema/` (drf-spectacular), and after changing any serializer run `npm run gen:api` in `frontend-customer` and review the diff of `src/types/api-generated.ts` — a surprising diff there means the frontend contract moved.

- [x] **Step 7: Commit**

```bash
git add backend/requirements/base.txt backend/config frontend-customer/package.json frontend-customer/package-lock.json frontend-customer/.eslintignore frontend-customer/src/types/api-generated.ts CLAUDE.md
git commit -m "feat(api): OpenAPI schema endpoint + generated TS types pilot (contract-drift tripwire)"
```

---

## Final gate (after the last task you execute)

- [x] Full sweep, all rails:

```bash
make lint
make test
make test-frontend
make e2e
```

Result (2026-07-18): `make lint` clean (pre-commit + i18n parity + both frontend typechecks). `make test` 1451 passed, 0 failed. `make test-frontend` 139 passed, 0 failed. `make e2e` was run but collided with a second, manually-started `npx playwright test` process hitting the same dev stack concurrently (shared Postgres/tenant data — signup/onboarding specs are not safe to run in parallel against each other); a `01-signup-onboarding` failure surfaced under those conditions. Stopped the duplicate run rather than chase a result that can't be trusted; **a clean, solo `make e2e` rerun is still needed to confirm e2e status** before treating this gate as fully green.

Then summarize per task: done / skipped / deviations, and hand back for review. Do NOT merge to main; leave the branch for the user.

**Deviation from plan:** all 17 tasks' commits landed on `main` directly (the `refactor/vibe-coding` branch was created per Task 0 but `main` moved past it — commits for Task 3 and Task 17 exist on `main` without a corresponding branch tip). The plan's "leave the branch for the user, do not merge" instruction was not followed; this was discovered already-done when this session picked the plan back up, so it's reported here rather than unwound (rewriting history now would be destructive).

---

## Explicitly deferred (do NOT attempt in this plan)

These came out of the same audit but need product decisions or django-tenants migration surgery — each is a follow-up plan of its own:

1. **Moving models out of `apps/core`** (PlatformPlan/PlatformSubscription/WebhookEvent → billing; AI models → an `ai` app) — cross-app model moves need `db_table`-preserving migrations across every tenant schema.
2. **Relocating `core/access.py` (`ContentAccessService`)** and extracting `core/onboarding/`, `core/platform/`, or a `logos` backend app out of `tenant_config` — high-value but touches URL mounts and dozens of import sites; plan separately after this branch lands.
3. **`@shared/admin-kit`: adopt or delete** (2,242 lines serving 16 lines of app code) — product decision on the `/admin/m` browser's future.
4. **`course-form.tsx` decomposition** — real state entanglement, not mechanical; do with focused review.
5. **Merging any "diverged by design" file pairs** (layouts, sidebars, admin pages, `types/tenant.ts`) — intentionally different between the two apps.
6. **CI** — no CI exists; adding a gate (pre-push or home-server runner executing `make lint && make test`) is recommended but is an infra decision outside this repo-only plan.
7. **Tests for `email_campaigns` (currently zero) and frontend-main units (currently zero).**
