# LOC Reduction & Component Reuse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute steps 1–6 of [docs/AUDIT-LOC-REUSE.md](../../AUDIT-LOC-REUSE.md): archive shipped docs, extract the cross-frontend duplicated code (admin-kit, mailbox, email suites) into a shared source directory, merge the media pickers, fix gitignore hygiene, and dedupe demo seed data — **with zero functional change**.

**Architecture:** Shared frontend code moves to `packages/shared/src/` — a plain shared *source directory*, NOT an npm workspace. Each app keeps its own `package.json`/`package-lock.json` untouched (no dependency drift). Apps reach shared code via a new `@shared/*` tsconfig path; shared code reaches app-specific modules (ui primitives, API clients) via the existing `@/*` alias, which each app resolves to its *own* `src/` — dependency injection by alias. Docker build contexts move to the repo root so images can copy `packages/`.

**Tech Stack:** Next.js 14 (both apps, `output: "standalone"`), TypeScript path aliases, docker compose (dev + prod), git mv (preserve history), Python (demo-data generator).

## Global Constraints

- **Zero functional change.** Every task ends with the app behaving byte-for-byte identically (UI, network calls, seed output). Where a task has an equality gate, the gate is the acceptance criterion.
- Pre-commit must pass with zero issues on every commit (`pre-commit run --files <changed files>`).
- After each task: `make dev` must come up healthy (`make health-check` returns ok) before claiming done.
- Never create new `.md` files (this plan file itself was explicitly requested).
- `frontend-customer/public/logos/` is 69MB — Task 2 must land **before** any task that could `git add -A` near it.
- Use `git mv` for every file move so history follows.
- Do not commit `flowmap.db`, `.next/`, `node_modules/`, or anything already gitignored.
- Both apps' import alias contract: shared code may import `@/lib/mailbox`, `@/lib/email-api`, `@/components/ui/*`, `@/components/shared/empty-state`, `@/components/admin/email/recipient-selector`, `@/types/api` — each app MUST provide a module at that path. Task 3 establishes this; Tasks 4–5 rely on it.

---

## File structure overview (end state)

```
packages/shared/src/
  admin-kit/            client.ts, types.ts, primitives.tsx, widgets.tsx,
                        model-form.tsx, model-list.tsx, model-index.tsx, model-page.tsx
  mailbox/              conversation-list.tsx, message-editor.tsx, thread-view.tsx,
                        attachment-list.tsx, compose-card.tsx, folder-rail.tsx,
                        inbox-client.tsx
  email/                template-card.tsx, template-grid.tsx, email-builder-iframe.tsx,
                        email-home-page.tsx, templates-page.tsx, campaign-detail-page.tsx,
                        compose-page.tsx (conditional — see Task 5)
  ui/                   modal-portal.tsx, theme-toggle.tsx
frontend-main/src/lib/  mailbox.ts (new 1-line re-export), email-api.ts (new 1-line re-export)
frontend-customer/src/components/admin/mailbox/inbox-client.tsx  (becomes thin wrapper w/ banner)
frontend-customer/src/components/admin/media-picker-base.tsx     (new, Task 6)
backend/apps/core/management/commands/demo_data/_base.py         (new, Task 7)
docs/superpowers/plans/archive/                                  (53 moved plans, Task 1)
```

---

### Task 1: Archive shipped plans and stale specs

**Files:**
- Create dir: `docs/superpowers/plans/archive/`
- Move: 53 plan files (exact list below) into it
- Move: 5 spec files from `docs/superpowers/specs/` to `docs/superpowers/specs/archive/`

**Interfaces:**
- Consumes: nothing
- Produces: nothing code-facing; `docs/superpowers/plans/` afterwards contains only the 17 in-progress/living plans

Rationale per group was verified against `docs/PRODUCT.md` feature inventory (rows marked `live-in-prod`), `docs/superpowers/specs/archive/` contents, and git log. **Do not archive** these 17 plans (active/unmerged/pending): `2026-06-07-marketplace-and-feature-completeness` (money path is the open launch gate), `2026-06-24-custom-domain-wizard-frontend` (phases 2–4 not built), `2026-06-28-flowmap-service` (referenced by CLAUDE.md), `2026-07-07-community-phase-4-notifications` (not built), `2026-07-09-shared-ai-provider` (branch unmerged), `2026-07-10-ai-assistants-governance`, `2026-07-10-ai-assistants-v2` (owner review pending), `2026-07-11-ai-nav-grouping-and-blog-images`, all seven `2026-07-10/11-logo-*` plans (merged but prod-deploy unconfirmed), and the three `2026-07-12-logo-curated-*` plans (active work, uncommitted files in tree).

- [ ] **Step 1: Confirm no live doc references the files being moved**

Run:
```bash
cd /Users/tahayusufkomur/ws/projects-active/home-server/contentor
grep -rn "plans/2026-" CLAUDE.md docs/*.md docs/superpowers/specs/*.md | grep -v "plans/archive" | grep -vE "flowmap-service|marketplace-and-feature|custom-domain-wizard|community-phase-4|shared-ai-provider|ai-assistants|ai-nav-grouping|logo-(brand-pack-quality|studio-ai-trigger|studio-session|creative-freedom|image-mark|traced-mark|vision-critique|curated)"
```
Expected: no output (CLAUDE.md's only plan reference is flowmap-service, which stays). If a hit appears, update that reference to the `plans/archive/` path in the same commit.

- [ ] **Step 2: Move the 53 shipped plans**

```bash
cd /Users/tahayusufkomur/ws/projects-active/home-server/contentor/docs/superpowers/plans
mkdir -p archive
git mv \
  2026-03-19-per-tenant-zoom-oauth.md 2026-03-19-zoom-meeting-settings.md \
  2026-03-22-course-form-consolidation.md 2026-03-22-inline-edit-panel.md \
  2026-03-24-email-campaigns.md 2026-03-25-email-panel-improvements.md \
  2026-05-11-bilingual-tr-en.md 2026-05-12-platform-subscription-payments.md \
  2026-06-19-caddy-unification.md 2026-06-19-core-subpackages.md \
  2026-06-19-courses-block-display-options.md 2026-06-19-niche-example-content.md \
  2026-06-19-site-builder-fixes.md 2026-06-19-video-upload-library.md \
  2026-06-20-coach-publish-app.md 2026-06-20-course-categories.md \
  2026-06-20-custom-filters.md \
  2026-06-20-pwa-usage-tracking-phase-a.md 2026-06-20-pwa-usage-tracking-phase-b.md \
  2026-06-20-pwa-usage-tracking-phase-c.md \
  2026-06-20-student-pwa-phase-1-installable.md 2026-06-20-student-pwa-phase-2-offline.md \
  2026-06-20-student-pwa-phase-3-web-push.md \
  2026-06-21-announcements-lab.md 2026-06-21-install-guide.md \
  2026-06-22-announcements-templates-recurring-email.md \
  2026-06-23-custom-domain-onboarder-phase1-backend.md \
  2026-06-27-screenshot-map.md 2026-06-28-screenshot-map-graph-board.md \
  2026-06-30-coach-mailbox-phase1-backend.md 2026-06-30-coach-mailbox-phase2-inbound.md \
  2026-06-30-coach-mailbox-phase3-ui.md \
  2026-07-02-local-runnability-e2e.md 2026-07-03-login-code-pwa.md \
  2026-07-03-one-step-creation.md 2026-07-03-product-owner-advisor.md \
  2026-07-04-inbox-gmail-upgrade.md 2026-07-05-launch-copy-truth-fixes.md \
  2026-07-05-onboarding-smoothing-handoff.md 2026-07-05-onboarding-smoothing.md \
  2026-07-05-setup-assistant.md \
  2026-07-06-community-phase-1-backend.md 2026-07-06-public-navbar-redesign.md \
  2026-07-06-superadmin-platform-inbox.md \
  2026-07-07-community-phase-2-student-ui.md 2026-07-07-community-phase-3-moderation-ui.md \
  2026-07-07-logo-studio.md \
  2026-07-08-logo-studio-v2-phase-1.md 2026-07-08-logo-studio-v2-phase-2.md \
  2026-07-08-logo-studio-v2-phase-3.md 2026-07-08-logo-studio-v2-phase-4.md \
  2026-07-09-ai-blog-system.md 2026-07-09-coach-help-bot.md \
  archive/
```

- [ ] **Step 3: Move the 5 stale specs**

These specs' features are `live-in-prod` per PRODUCT.md (their plans were archived in Step 2):
```bash
cd /Users/tahayusufkomur/ws/projects-active/home-server/contentor/docs/superpowers/specs
git mv 2026-06-20-student-pwa-design.md 2026-06-20-pwa-usage-tracking-design.md \
  2026-07-04-inbox-gmail-upgrade-design.md 2026-07-05-setup-assistant-design.md \
  2026-07-05-onboarding-smoothing-design.md archive/
```
Keep top-level: `custom-domain-onboarder-design` (phases 2–4 in Later), `community-feature-design` (phase 4 unbuilt), `shared-ai-provider-design` (unmerged), both `ai-assistants-*`, all `logo-*` from 07-10 onward, `flowmap-service-design` + both `screenshot-map` specs (CLAUDE.md living tooling reference).

- [ ] **Step 4: Verify counts and repo state**

Run: `ls docs/superpowers/plans/*.md | wc -l && ls docs/superpowers/plans/archive/*.md | wc -l && ls docs/superpowers/specs/*.md | wc -l`
Expected: `17`, `53`, `19`. Then `git status` shows only renames.

- [ ] **Step 5: Commit**

```bash
git add -A docs/superpowers
git commit -m "docs: archive 53 shipped plans + 5 stale specs (audit LOC-1)"
```

---

### Task 2: gitignore hygiene — logos catalog, screenshot artifacts

**Files:**
- Modify: `.gitignore`

**Interfaces:**
- Consumes: nothing
- Produces: guarantees later tasks can't accidentally stage 69MB of PNGs

Background: `frontend-customer/public/logos/` (33 files, 69MB, untracked) is the Phase-1 curated-logo seed source read by `backend/apps/core/management/commands/seed_curated_logos.py` via `CURATED_LOGO_SYNC_DIR`. Since Phase 2, the DB+S3 catalog is the live source of truth (superadmin upload endpoint + dev-only DB→repo mirror sync). The directory stays on disk for `make seed`; it must simply never enter git. `docs/screenshot-map/` has exactly one tracked file (`index.html`); the rest is generated crawl output. `e2e/screenshots/` is Playwright output.

- [ ] **Step 1: Add ignore rules**

Append to `.gitignore` after the existing `test-results/` line:

```gitignore
# Curated-logo seed catalog: DB+S3 is the source of truth (Phase 2);
# this dir is a local seed source / dev mirror only — 69MB of PNGs.
frontend-customer/public/logos/

# Generated crawl/e2e artifacts
e2e/screenshots/
docs/screenshot-map/*
!docs/screenshot-map/index.html
```

- [ ] **Step 2: Verify nothing tracked is newly ignored and the untracked noise disappears**

Run: `git status --short` → `frontend-customer/public/logos/` and `e2e/screenshots/` no longer listed.
Run: `git ls-files -i -c --exclude-standard` → expected: empty (no *tracked* file is ignored; `docs/screenshot-map/index.html` stays tracked via the negation).

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: gitignore curated-logo seed catalog + generated screenshot artifacts (audit LOC-5)"
```

---

### Task 3: Shared-code infrastructure + admin-kit extraction

**Files:**
- Create: `packages/shared/src/admin-kit/` (8 files via `git mv` from frontend-customer)
- Modify: `frontend-main/tsconfig.json`, `frontend-customer/tsconfig.json`
- Modify: `frontend-main/next.config.mjs`, `frontend-customer/next.config.mjs`
- Modify: `frontend-main/Dockerfile`, `frontend-customer/Dockerfile`
- Modify: `docker-compose.yml` (nextjs-main + nextjs-customer), `docker-compose.prod.yml` (same)
- Modify: `frontend-customer/vitest.config.ts`, `Makefile` (format target)
- Modify: `frontend-main/src/app/admin/admin-shell.tsx`, `frontend-main/src/app/admin/m/page.tsx`, `frontend-main/src/app/admin/m/[model]/page.tsx`, `frontend-customer/src/app/admin/m/page.tsx`, `frontend-customer/src/app/admin/m/[model]/page.tsx`
- Delete: `frontend-main/src/lib/admin-kit/` (2 files), `frontend-main/src/components/admin-kit/` (6 files)

**Interfaces:**
- Consumes: nothing
- Produces: the `@shared/*` alias (maps to `packages/shared/src/*`) working in dev + prod builds of BOTH apps; `@shared/admin-kit/{client,types,primitives,widgets,model-form,model-list,model-index,model-page}` exporting exactly what `@/lib/admin-kit/*` and `@/components/admin-kit/*` export today (`createAdminClient`, `kitIcon`, `SiteMeta`, `AdminModelPage`, `AdminModelIndex`, …). Tasks 4–6 depend on this infrastructure.

Why safe: the 8 admin-kit files are **byte-identical** between the two apps (verified by content hash). They import only `react`, `lucide-react`, `next/link`, and each other — no `@/components/ui/*` dependency.

- [ ] **Step 1: Baseline — record that both apps build today**

```bash
make dev   # wait until healthy
docker compose exec nextjs-main npx tsc --noEmit
docker compose exec nextjs-customer npx tsc --noEmit
```
Expected: both exit 0. If not, STOP — fix the pre-existing break first or report it.

- [ ] **Step 2: Move the canonical copies (from frontend-customer) into packages/shared**

```bash
cd /Users/tahayusufkomur/ws/projects-active/home-server/contentor
mkdir -p packages/shared/src/admin-kit
git mv frontend-customer/src/lib/admin-kit/client.ts        packages/shared/src/admin-kit/client.ts
git mv frontend-customer/src/lib/admin-kit/types.ts         packages/shared/src/admin-kit/types.ts
git mv frontend-customer/src/components/admin-kit/primitives.tsx  packages/shared/src/admin-kit/primitives.tsx
git mv frontend-customer/src/components/admin-kit/widgets.tsx     packages/shared/src/admin-kit/widgets.tsx
git mv frontend-customer/src/components/admin-kit/model-form.tsx  packages/shared/src/admin-kit/model-form.tsx
git mv frontend-customer/src/components/admin-kit/model-list.tsx  packages/shared/src/admin-kit/model-list.tsx
git mv frontend-customer/src/components/admin-kit/model-index.tsx packages/shared/src/admin-kit/model-index.tsx
git mv frontend-customer/src/components/admin-kit/model-page.tsx  packages/shared/src/admin-kit/model-page.tsx
git rm frontend-main/src/lib/admin-kit/client.ts frontend-main/src/lib/admin-kit/types.ts
git rm frontend-main/src/components/admin-kit/*.tsx
```

- [ ] **Step 3: Rewrite the moved files' internal imports to relative paths**

The moved files import `@/lib/admin-kit/types` and `@/lib/admin-kit/client` — inside `packages/shared` the `@/` alias must NOT be used for admin-kit's own modules (it now points at each consuming app's src). All 8 files live flat in one directory, so:

```bash
cd packages/shared/src/admin-kit
sed -i '' 's|@/lib/admin-kit/types|./types|g; s|@/lib/admin-kit/client|./client|g' *.ts *.tsx
grep -rn "@/lib/admin-kit\|@/components/admin-kit" . && echo "LEFTOVER — fix" || echo "clean"
```
Expected final line: `clean`. (Imports of `./primitives`, `./widgets`, `./types`, `./model-list`, `./model-form` were already relative and are untouched. Imports of `react`, `lucide-react`, `next/link` are untouched.)

- [ ] **Step 4: Add the `@shared` alias + node_modules fallback to both tsconfigs**

In BOTH `frontend-main/tsconfig.json` and `frontend-customer/tsconfig.json`, replace the `paths` block:

```json
    "paths": {
      "@/*": ["./src/*"],
      "@shared/*": ["../packages/shared/src/*"],
      "*": ["./node_modules/*"]
    }
```

The `"*"` catch-all lets `tsc` resolve bare imports (`react`, `lucide-react`) from *inside* `../packages/shared`, which has no `node_modules` ancestor. For app files it is a no-op (same resolution result).

- [ ] **Step 5: Teach Next.js/webpack about external files + module fallback**

`frontend-main/next.config.mjs` — add `experimental.externalDir` and a webpack hook (the file currently has neither):

```js
import path from "path";
import { fileURLToPath } from "url";
import createNextIntlPlugin from 'next-intl/plugin';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  experimental: { externalDir: true },
  webpack: (config) => {
    // packages/shared has no node_modules ancestor — fall back to this app's.
    config.resolve.modules = [...(config.resolve.modules ?? ["node_modules"]),
      path.resolve(__dirname, "node_modules")];
    return config;
  },
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_URL || "http://django:8000"}/api/v1/:path*`,
      },
    ];
  },
};
export default withNextIntl(nextConfig);
```

`frontend-customer/next.config.mjs` — add to the EXISTING config object (it already has a webpack fn and `__dirname`):
```js
  experimental: { externalDir: true },
```
and inside the existing `webpack: (config) => { ... }` before `return config;`:
```js
    config.resolve.modules = [...(config.resolve.modules ?? ["node_modules"]),
      path.resolve(__dirname, "node_modules")];
```

- [ ] **Step 6: Docker — repo-root build contexts + copy packages/**

`docker-compose.yml`: in `nextjs-customer.build` set `context: .` and add `dockerfile: frontend-customer/Dockerfile`; in `nextjs-main.build` set `context: .` and add `dockerfile: frontend-main/Dockerfile`. Add to BOTH services' `volumes:` list:
```yaml
      - ./packages:/packages
```

`docker-compose.prod.yml`: same two `context: .` + `dockerfile:` changes (args/env untouched; no volumes in prod).

`frontend-main/Dockerfile` — dev and deps/builder stages must copy from the new root context and place `packages` as a **sibling** of `/app` (so `../packages/shared` resolves identically on host and in container):

```dockerfile
# --- Dev target (used by docker-compose.yml) ---
FROM node:20-alpine AS dev
WORKDIR /app
COPY frontend-main/package.json frontend-main/package-lock.json* ./
RUN npm ci || npm install
COPY packages /packages
COPY frontend-main .
EXPOSE 3000
CMD ["npm", "run", "dev"]

# --- Production build ---
FROM node:20-alpine AS deps
WORKDIR /app
COPY frontend-main/package.json frontend-main/package-lock.json* ./
RUN npm ci || npm install

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY packages /packages
COPY frontend-main .
```
(rest of builder + runner stages unchanged — the standalone output layout does not change because the project root is still the app dir; shared code is compiled into the bundles, never needed at runtime.)

`frontend-customer/Dockerfile` — same transformation, keeping its extra lines:
```dockerfile
FROM node:20-alpine AS dev
WORKDIR /app
COPY frontend-customer/package.json frontend-customer/package-lock.json* ./
COPY frontend-customer/scripts/ ./scripts/
RUN npm ci || npm install
COPY packages /packages
COPY frontend-customer .
EXPOSE 3000
CMD ["npm", "run", "dev"]

FROM node:20-alpine AS deps
WORKDIR /app
COPY frontend-customer/package.json frontend-customer/package-lock.json* ./
COPY frontend-customer/scripts/ ./scripts/
RUN npm ci || npm install

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY packages /packages
COPY frontend-customer .
```
(builder env/ARG lines and runner stage unchanged.)

**Context-size guard:** the root context now uploads the whole repo to the docker daemon. Create `.dockerignore` at the repo root (a config file, not markdown — allowed):
```
.git
**/node_modules
**/.next
backend
docs
e2e
tools
monitoring
scripts
test-results
frontend-customer/public/logos
```
Note: `frontend-customer/scripts` is NOT ignored (only root `scripts/`); the `backend` exclusion does not affect the django image because its compose context is still `./backend`.

- [ ] **Step 7: Rewrite the 5 app-side import sites**

`frontend-main/src/app/admin/admin-shell.tsx` (lines 17–19):
```ts
import { createAdminClient } from "@shared/admin-kit/client";
import { kitIcon } from "@shared/admin-kit/primitives";
import type { SiteMeta } from "@shared/admin-kit/types";
```
`frontend-main/src/app/admin/m/page.tsx` line 1: `import { AdminModelIndex } from '@shared/admin-kit/model-index'`
`frontend-main/src/app/admin/m/[model]/page.tsx` line 1: `import { AdminModelPage } from '@shared/admin-kit/model-page'`
`frontend-customer/src/app/admin/m/page.tsx` line 1: `import { AdminModelIndex } from "@shared/admin-kit/model-index";`
`frontend-customer/src/app/admin/m/[model]/page.tsx` line 1: `import { AdminModelPage } from "@shared/admin-kit/model-page";`

Then verify no stale references anywhere:
```bash
grep -rn "components/admin-kit\|lib/admin-kit" frontend-main/src frontend-customer/src
```
Expected: no output.

- [ ] **Step 8: Tooling — vitest alias + Makefile format coverage**

`frontend-customer/vitest.config.ts` — extend the alias map:
```ts
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@shared": path.resolve(__dirname, "../packages/shared/src"),
    },
  },
```
`Makefile` format target — append one line so shared code is prettier-formatted (runs via frontend-customer's install):
```make
	cd frontend-customer && npx prettier --write ../packages/shared
```

- [ ] **Step 9: Rebuild and verify dev**

```bash
docker compose build nextjs-main nextjs-customer
make dev
make health-check
docker compose exec nextjs-main npx tsc --noEmit
docker compose exec nextjs-customer npx tsc --noEmit
```
Expected: builds succeed, health ok, both tsc exit 0.
Browser check (both adminkit surfaces): load the superadmin model index on frontend-main (`http://localhost/admin/m` on the apex host, logged in as superadmin) and the coach model index on a tenant subdomain (`http://<tenant>.localhost/admin/m`). Both render the model list; open one model page each; no console errors.
Hot-reload check: append a comment line to `packages/shared/src/admin-kit/model-index.tsx`, confirm the page hot-reloads in the browser, then remove the comment.

- [ ] **Step 10: Verify prod-target builds**

```bash
docker compose -f docker-compose.prod.yml build nextjs-main nextjs-customer
```
Expected: both `next build` runs complete (type-check + lint + standalone output). This is the gate that `externalDir` + alias config survive production compilation.

- [ ] **Step 11: Run the adminkit e2e spec**

```bash
cd e2e && npx playwright test specs/ --grep -i "curated|adminkit" || make -C .. e2e
```
The superadmin curated CRUD spec exercises adminkit end-to-end (list, form, image widget). Expected: pass (Stripe specs auto-skip). If no grep match, run the full `make e2e`.

- [ ] **Step 12: Commit**

```bash
pre-commit run --files $(git diff --name-only --cached; git diff --name-only) || true  # then fix + re-run to zero issues
git add -A
git commit -m "refactor(shared): extract byte-identical admin-kit to packages/shared (audit LOC-2)"
```

---

### Task 4: Mailbox suite → packages/shared

**Files:**
- Create: `packages/shared/src/mailbox/` — 7 files
- Create: `frontend-main/src/lib/mailbox.ts` (1-line re-export)
- Modify: `frontend-customer/src/components/admin/mailbox/inbox-client.tsx` (becomes thin wrapper)
- Modify: `frontend-main/src/app/admin/inbox/page.tsx` (import path)
- Delete: `frontend-main/src/components/admin/mailbox/` — 7 files
- Delete: `frontend-customer/src/components/admin/mailbox/{conversation-list,message-editor,thread-view,attachment-list,compose-card,folder-rail}.tsx` (moved)

**Interfaces:**
- Consumes: `@shared/*` alias from Task 3; alias contract `@/lib/mailbox` (each app provides `listConversations`, `getConversation`, `sendNewMessage`, `replyToConversation`, `uploadAttachment`, `markConversation`, `deleteConversation` + types `ConversationListItem`, `ConversationDetail`, `MailboxMessage`, `OutgoingMessage` — same names in both apps today, verified by diff).
- Produces: `@shared/mailbox/inbox-client` exporting `InboxClient` with the customer version's current props **plus** `topBanner?: React.ReactNode`; sibling components at `@shared/mailbox/*` with unchanged exports.

Divergence facts (measured): 6 of 7 components differ ONLY by the import path `@/lib/platform-mailbox-api` (main) vs `@/lib/mailbox` (customer) plus comments; `folder-rail.tsx` is byte-identical. `inbox-client.tsx` additionally has one real customer-only feature: a dismissible "send-only" banner driven by `getSettings()` (`MailboxSettings.can_receive/platform_eligible/from_email`), lines ~86–96 and 239–285. Settings are used **nowhere else** in the file (verified by grep).

- [ ] **Step 1: Baseline — run the mailbox e2e spec**

```bash
cd e2e && npx playwright test specs/07-mailbox.spec.ts
```
Expected: pass (dev stack up). Record the result.

- [ ] **Step 2: Give frontend-main the alias-contract module**

Create `frontend-main/src/lib/mailbox.ts`:
```ts
// Alias contract for packages/shared/src/mailbox/* — resolves to the platform client here.
export * from "./platform-mailbox-api";
```

- [ ] **Step 3: Move the six mechanical components (customer copies are canonical)**

```bash
mkdir -p packages/shared/src/mailbox
cd /Users/tahayusufkomur/ws/projects-active/home-server/contentor
for f in conversation-list message-editor thread-view attachment-list compose-card folder-rail; do
  git mv frontend-customer/src/components/admin/mailbox/$f.tsx packages/shared/src/mailbox/$f.tsx
  git rm frontend-main/src/components/admin/mailbox/$f.tsx
done
```
Their `@/lib/mailbox`, `@/components/ui/*`, `@/types/api` imports stay **verbatim** — the alias resolves per consuming app (that's the injection mechanism). Fix only imports of each other: any `@/components/admin/mailbox/<sibling>` import inside the moved files becomes `./<sibling>`:
```bash
cd packages/shared/src/mailbox && sed -i '' 's|@/components/admin/mailbox/|./|g' *.tsx
```

- [ ] **Step 4: Create the shared InboxClient from the MAIN version (the no-settings variant)**

```bash
git mv frontend-main/src/components/admin/mailbox/inbox-client.tsx packages/shared/src/mailbox/inbox-client.tsx
sed -i '' 's|@/lib/platform-mailbox-api|@/lib/mailbox|g; s|@/components/admin/mailbox/|./|g' packages/shared/src/mailbox/inbox-client.tsx
```
Then add the banner slot. In the component's props interface add:
```ts
  /** Rendered between the header and the conversation list (e.g. send-only upsell). */
  topBanner?: React.ReactNode;
```
destructure `topBanner` alongside the existing props, and render `{topBanner}` at the exact position where the customer version renders its banner block (immediately inside the root container, before the search/toolbar row — cross-check against the customer file before it is rewritten in Step 5).

- [ ] **Step 5: Rewrite customer's inbox-client as a thin wrapper (keeps its path + export name)**

Replace the entire contents of `frontend-customer/src/components/admin/mailbox/inbox-client.tsx` with the wrapper. Lift the banner JSX and copy VERBATIM from the current file (the `settings && !canReceive && !bannerDismissed` block, including the `platform_eligible` copy split, `settings.from_email`, and the `/admin/settings` vs plans link) — do not re-write the copy:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Mail, X } from "lucide-react";

import { InboxClient as SharedInboxClient } from "@shared/mailbox/inbox-client";
import { getSettings, type MailboxSettings } from "@/lib/mailbox";

export function InboxClient() {
  const [settings, setSettings] = useState<MailboxSettings | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  useEffect(() => {
    getSettings()
      .then(setSettings)
      .catch(() => setSettings(null));
  }, []);

  const canReceive = settings?.can_receive ?? true;

  const banner =
    settings && !canReceive && !bannerDismissed ? (
      /* PASTE the existing banner JSX block here verbatim from the pre-refactor file */
      <div className="flex flex-wrap items-center gap-3 border-b bg-muted/50 px-4 py-2.5 text-sm">
        {/* ...existing content unchanged... */}
      </div>
    ) : null;

  return <SharedInboxClient topBanner={banner} />;
}
```
Match the shared component's actual export name/props when wiring (`InboxClient` may take other props today — pass them through unchanged if so). Note the behavioral nuance: today customer fetches settings inside `Promise.all` with conversations; the wrapper fetches settings in parallel via its own effect — same two HTTP requests, same rendered states.

- [ ] **Step 6: Fix remaining import sites**

`frontend-main/src/app/admin/inbox/page.tsx`: change `@/components/admin/mailbox/inbox-client` → `@shared/mailbox/inbox-client`.
`frontend-customer` pages keep importing the wrapper path (unchanged). Then sweep:
```bash
grep -rn "components/admin/mailbox" frontend-main/src | grep -v node_modules
```
Expected: no output (customer hits are fine — wrapper + `mailbox-settings.tsx` remain there).

- [ ] **Step 7: Verify**

```bash
docker compose exec nextjs-main npx tsc --noEmit && docker compose exec nextjs-customer npx tsc --noEmit
make health-check
cd e2e && npx playwright test specs/07-mailbox.spec.ts
```
Expected: tsc 0/0, spec passes. Manual: open coach inbox on a FREE tenant (banner shows with "See plans" copy), dismiss it (X works), open superadmin inbox on the apex (no banner, list loads).

- [ ] **Step 8: Prod build gate + commit**

```bash
docker compose -f docker-compose.prod.yml build nextjs-main nextjs-customer
pre-commit run --files $(git diff --name-only) # fix to zero
git add -A
git commit -m "refactor(shared): single mailbox suite, banner as slot prop (audit LOC-3a)"
```

---

### Task 5: Email-campaigns suite → packages/shared

**Files:**
- Create: `packages/shared/src/email/` — 3 components + up to 4 page components
- Create: `packages/shared/src/ui/modal-portal.tsx`, `packages/shared/src/ui/theme-toggle.tsx` (byte-identical singles)
- Create: `frontend-main/src/lib/email-api.ts` (1-line re-export)
- Modify: both apps' `src/components/ui/modal-portal.tsx` + `src/components/shared/theme-toggle.tsx` → 1-line re-export stubs
- Modify: both apps' `src/app/admin/email/{page,templates/page,campaigns/[id]/page}.tsx` → thin re-exports
- Delete: `frontend-main/src/components/admin/email/{template-card,template-grid,email-builder-iframe}.tsx`

**Interfaces:**
- Consumes: `@shared/*` alias; alias contract `@/lib/email-api` (customer already has this exact path; main gains a re-export of `platform-email-api`). Both export the same function names (`createSession`, `setup`, template list/get/delete, gallery, send — verified by diff) and the shared types `EmailTemplate`, `EmailSession`, `EmailCampaign`; `RecipientFilter` differs per app BY DESIGN and type-checks per-app through the alias.
- Produces: `@shared/email/{template-card,template-grid,email-builder-iframe}` and page components; `@shared/ui/modal-portal`, `@shared/ui/theme-toggle`.

Divergence facts (measured): `template-grid` 0%, `template-card` 2%, `email-builder-iframe` 2% — differences are the type-import path + comment lines only. Pages: index 2%, campaigns/[id] 2%, templates 3%, compose 6%. `recipient-selector.tsx` is 45% diverged (genuinely different: coaches/plans/tenants vs all/course) and **stays per-app**; the alias contract covers it since both apps define it at `@/components/admin/email/recipient-selector`.

- [ ] **Step 1: Alias-contract module for main**

Create `frontend-main/src/lib/email-api.ts`:
```ts
// Alias contract for packages/shared/src/email/* — resolves to the platform client here.
export * from "./platform-email-api";
```

- [ ] **Step 2: Move the three components (customer canonical), delete main's copies**

```bash
mkdir -p packages/shared/src/email
for f in template-card template-grid email-builder-iframe; do
  git mv frontend-customer/src/components/admin/email/$f.tsx packages/shared/src/email/$f.tsx
  git rm frontend-main/src/components/admin/email/$f.tsx
done
cd packages/shared/src/email && sed -i '' 's|@/components/admin/email/template-card|./template-card|g' *.tsx
```
All `@/lib/email-api`, `@/components/ui/*` imports stay verbatim (alias contract).

- [ ] **Step 3: Dedupe the byte-identical singles with re-export stubs**

```bash
mkdir -p packages/shared/src/ui
git mv frontend-customer/src/components/ui/modal-portal.tsx packages/shared/src/ui/modal-portal.tsx
git mv frontend-customer/src/components/shared/theme-toggle.tsx packages/shared/src/ui/theme-toggle.tsx
```
Then create four 1-line stubs so the 17 existing import sites keep working unchanged —
`frontend-customer/src/components/ui/modal-portal.tsx` and `frontend-main/src/components/ui/modal-portal.tsx`:
```ts
export * from "@shared/ui/modal-portal";
```
`frontend-customer/src/components/shared/theme-toggle.tsx` and `frontend-main/src/components/shared/theme-toggle.tsx`:
```ts
export * from "@shared/ui/theme-toggle";
```
(Overwrite main's originals with the stubs — they were byte-identical.) If either module has a `default` export, add `export { default } from ...` too — check first with `grep -n "export default" packages/shared/src/ui/*.tsx`.

- [ ] **Step 4: Share the email pages — inspect, then move what is import-only**

For each of index/templates/campaigns pages, confirm the diff is import/comment-only, then convert. Decision rule: a page whose remaining diff (after normalizing the api import) touches JSX/logic is left per-app; expected from measurements: index/templates/campaigns qualify, compose needs the same check (6%) — if its extra diff is only the `recipient-selector` usage both apps already share by path, it qualifies too.

```bash
diff <(sed 's|@/lib/platform-email-api|@/lib/email-api|g' frontend-main/src/app/admin/email/page.tsx) frontend-customer/src/app/admin/email/page.tsx
```
For each qualifying page: `git mv` the CUSTOMER page body to `packages/shared/src/email/<name>-page.tsx` (index → `email-home-page.tsx`, templates → `templates-page.tsx`, campaigns/[id] → `campaign-detail-page.tsx`, compose → `compose-page.tsx`), fix its `@/components/admin/email/<moved component>` imports to `./<component>`, keep everything else verbatim, and replace BOTH apps' `page.tsx` with a thin re-export, e.g. `frontend-customer/src/app/admin/email/templates/page.tsx`:
```ts
export { default } from "@shared/email/templates-page";
```
(if the page uses a named export, mirror it: `export { EmailTemplatesPage as default } from ...`). For any page that does NOT qualify, leave both copies in place and note it in the commit message.

- [ ] **Step 5: Verify**

```bash
docker compose exec nextjs-main npx tsc --noEmit && docker compose exec nextjs-customer npx tsc --noEmit
docker compose -f docker-compose.prod.yml build nextjs-main nextjs-customer
```
Expected: all pass. Manual walk (dev stack): coach `/admin/email` → templates grid renders, open compose, pick recipients (course-based selector), send to the email sink and read it back via `GET /api/v1/dev/emails/latest/?to=...`; superadmin `/admin/email` on apex → templates render, compose shows the coaches/plans/tenants selector. Both `/admin/email/campaigns/<id>` detail pages load.

- [ ] **Step 6: Full e2e + commit**

```bash
make e2e   # 17 specs, Stripe auto-skip — the email/builder/mailbox specs are the signal
pre-commit run --files $(git diff --name-only) # fix to zero
git add -A
git commit -m "refactor(shared): single email-campaigns suite + ui singles (audit LOC-3b)"
```

---

### Task 6: Merge video-picker / photo-picker into a shared shell (frontend-customer only)

**Files:**
- Create: `frontend-customer/src/components/admin/media-picker-base.tsx`
- Modify: `frontend-customer/src/components/admin/video-picker.tsx`
- Modify: `frontend-customer/src/components/admin/photo-picker.tsx`

**Interfaces:**
- Consumes: nothing new (app-internal refactor; `clientFetch`, `@/components/ui/*` as today)
- Produces: `MediaPickerBase<T>` (props below). `VideoPicker` and `PhotoPicker` keep their EXACT current exported names and prop types (`VideoPickerProps`: `value: number | null`, `previewUrl`, `onChange(videoId, signedUrl)`, `allowUrl?`; `PhotoPickerProps`: `value?`, `previewUrl?`, `onSelect(photo)`, `onClear?`, `label?`) — zero call-site changes.

Measured: 188 differing lines of 578 combined (~67% shared). The shared part is the modal shell (open state, 300ms-debounced search, loading, item grid, file-input upload trigger + progress). The genuinely different parts stay in the wrappers: item types, list endpoints (`/api/v1/courses/videos/` vs `/api/v1/photos/`), upload flows (video: create record → presign → PUT → complete with extracted duration; photo: presign → PUT → complete), item card rendering, and selection payloads.

- [ ] **Step 1: Baseline**

```bash
cd e2e && npx playwright test specs/05-media.spec.ts specs/02-courses.spec.ts
```
Expected: pass (course spec exercises the video picker; media spec the photo flows). Record results.

- [ ] **Step 2: Write the base shell**

Create `frontend-customer/src/components/admin/media-picker-base.tsx`. Extract the shell **from the current picker code** — reuse their exact modal/markup/classNames so rendering is pixel-identical; the skeleton (fill each region by lifting the corresponding lines from `video-picker.tsx`, which is the superset):

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

export interface MediaPickerBaseProps<T> {
  open: boolean;
  onClose: () => void;
  title: string;
  accept: string; // file-input accept attr, e.g. "video/*" / "image/*"
  fetchItems: (search: string) => Promise<T[]>;
  uploadFile: (file: File) => Promise<void>; // wrapper owns the full upload flow
  renderItem: (item: T) => ReactNode; // wrapper owns card markup + its onClick select
  emptyState: ReactNode;
}

export function MediaPickerBase<T>({
  open, onClose, title, accept, fetchItems, uploadFile, renderItem, emptyState,
}: MediaPickerBaseProps<T>) {
  const [items, setItems] = useState<T[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await fetchItems(search));
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [fetchItems, search]);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(refresh, 300);
    return () => clearTimeout(timer);
  }, [open, refresh]);

  async function handleFile(file: File) {
    setUploading(true);
    try {
      await uploadFile(file);
      await refresh();
    } finally {
      setUploading(false);
    }
  }

  /* modal markup: lift the existing overlay/panel/search-input/upload-button/grid
     JSX verbatim from video-picker.tsx, replacing the video-card map with
     {items.map(renderItem)} and the empty branch with {emptyState}. */
}
```
Wire `search`/`setSearch`, `loading`, `uploading`, `fileInputRef`, `accept`, `onClose` into that lifted markup exactly where the originals used them.

- [ ] **Step 3: Rewrite both wrappers on top of the base**

`video-picker.tsx` keeps: `VideoItem`, `extractDuration`, its fetch (`/api/v1/courses/videos/?limit=20&offset=0&search=`), its 3-step upload (create video record → presign PUT → `/api/v1/upload/complete/` with `video_id` + `duration_seconds`), its card JSX (duration badge via `formatDuration`), its `onChange(videoId, signedUrl)` selection and `allowUrl` extra section — all passed into/around `MediaPickerBase`. `photo-picker.tsx` keeps: `Photo` type usage, `/api/v1/photos/?search=` fetch, its presign→PUT→complete upload returning `photo_id/s3_key/signed_url`, its card JSX, `onSelect(photo)`/`onClear`/`label`. Public exports and prop interfaces of both files: byte-for-byte unchanged.

- [ ] **Step 4: Verify types + behavior**

```bash
docker compose exec nextjs-customer npx tsc --noEmit
cd e2e && npx playwright test specs/05-media.spec.ts specs/02-courses.spec.ts
```
Expected: 0 errors, both specs pass. Manual: in a course lesson, open the video picker → search filters after ~300ms, upload a small mp4, select it; in design/branding, open photo picker → upload + select a PNG. Line check: `wc -l frontend-customer/src/components/admin/{video-picker,photo-picker,media-picker-base}.tsx` — combined total meaningfully below the original 578.

- [ ] **Step 5: Commit**

```bash
pre-commit run --files $(git diff --name-only) # fix to zero
git add frontend-customer/src/components/admin
git commit -m "refactor(customer): shared MediaPickerBase shell under video/photo pickers (audit LOC-4)"
```

---

### Task 7: demo_data — computed base + per-vertical overrides (equality-gated)

**Files:**
- Create: `backend/apps/core/management/commands/demo_data/_base.py`
- Modify: the 7 vertical modules (`fitness.py`, `yoga.py`, `pilates.py`, `belly_dance.py`, `face_yoga.py`, `makeup.py`, `pole_dance.py`) — `CONFIG` only
- Test: `backend/apps/core/tests/test_demo_data.py`
- Scratch (not committed): dump + generator scripts in the session scratchpad

**Interfaces:**
- Consumes: nothing
- Produces: `demo_data._base.deep_merge(base: dict, override: dict) -> dict` and `demo_data._base.CONFIG_BASE: dict`. Each vertical still exposes the same module-level attrs (`TENANT`, `CONFIG`, `COURSES`, …) with **identical values** — `seed_demo_tenant.py` (which reads `data.TENANT/CONFIG/COURSES` via importlib) is untouched.

Scope note: only `CONFIG` (~140 lines/file) is merged; `COURSES`/`DOWNLOADS`/etc. are vertical-specific content and stay verbatim. Realistic saving ≈ 600–900 lines. The acceptance gate is byte-equality of a canonical JSON dump before vs after.

- [ ] **Step 1: Write the failing structural test**

Create `backend/apps/core/tests/test_demo_data.py`:
```python
import importlib

import pytest

NICHES = ["fitness", "yoga", "pilates", "belly_dance", "face_yoga", "makeup", "pole_dance"]


@pytest.mark.parametrize("niche", NICHES)
def test_vertical_config_is_built_on_the_shared_base(niche):
    from apps.core.management.commands.demo_data import _base

    mod = importlib.import_module(f"apps.core.management.commands.demo_data.{niche}")
    # Every key in the shared base must exist in the merged CONFIG …
    for key in _base.CONFIG_BASE:
        assert key in mod.CONFIG, f"{niche}.CONFIG lost base key {key!r}"
    # … and the seed contract attrs must all still be present.
    for attr in ("TENANT", "CONFIG", "COURSES"):
        assert hasattr(mod, attr)


def test_deep_merge_semantics():
    from apps.core.management.commands.demo_data._base import deep_merge

    base = {"a": 1, "nested": {"x": 1, "y": 2}, "lst": [1, 2]}
    out = deep_merge(base, {"nested": {"y": 3}, "lst": [9]})
    assert out == {"a": 1, "nested": {"x": 1, "y": 3}, "lst": [9]}
    assert base == {"a": 1, "nested": {"x": 1, "y": 2}, "lst": [1, 2]}  # no mutation
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `docker compose exec django pytest apps/core/tests/test_demo_data.py -v`
Expected: FAIL — `No module named 'apps.core.management.commands.demo_data._base'`.

- [ ] **Step 3: Snapshot the current output (the equality gate's "before")**

Write to the scratchpad (NOT the repo) `dump_demo.py`:
```python
import importlib
import json

ATTRS = ["TENANT", "CONFIG", "COURSES", "DOWNLOADS", "STUDENTS", "SUBSCRIPTION_PLANS",
         "BUNDLES", "LIVE_CLASSES", "RECURRING_LIVE_CLASS", "LIVE_STREAMS",
         "ZOOM_CLASSES", "ONSITE_EVENTS", "STUDENT_BILLING"]
NICHES = ["fitness", "yoga", "pilates", "belly_dance", "face_yoga", "makeup", "pole_dance", "general"]

for niche in NICHES:
    m = importlib.import_module(f"apps.core.management.commands.demo_data.{niche}")
    data = {a: getattr(m, a, None) for a in ATTRS}
    with open(f"/tmp/demo_before_{niche}.json", "w") as f:
        json.dump(data, f, sort_keys=True, indent=1, default=str)
print("dumped")
```
Run: `docker compose cp <scratchpad>/dump_demo.py django:/tmp/ && docker compose exec django python /tmp/dump_demo.py`
Expected: `dumped`.

- [ ] **Step 4: Create `_base.py` with deep_merge + the computed CONFIG_BASE**

Create `backend/apps/core/management/commands/demo_data/_base.py`:
```python
"""Shared skeleton for the demo verticals. CONFIG_BASE holds every CONFIG
value identical across all 7 verticals; each vertical deep-merges its
overrides on top. Lists are atomic (replaced, never merged)."""

import copy


def deep_merge(base: dict, override: dict) -> dict:
    out = copy.deepcopy(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(out.get(key), dict):
            out[key] = deep_merge(out[key], value)
        else:
            out[key] = copy.deepcopy(value)
    return out


CONFIG_BASE: dict = {}  # filled by the generator in Step 5
```

Then compute the common subset mechanically. Scratchpad `gen_base.py`:
```python
import importlib
import pprint

NICHES = ["fitness", "yoga", "pilates", "belly_dance", "face_yoga", "makeup", "pole_dance"]
configs = [importlib.import_module(f"apps.core.management.commands.demo_data.{n}").CONFIG
           for n in NICHES]


def common(dicts):
    keys = set(dicts[0])
    for d in dicts[1:]:
        keys &= set(d)
    out = {}
    for k in sorted(keys):
        vals = [d[k] for d in dicts]
        if all(isinstance(v, dict) for v in vals):
            sub = common(vals)
            if sub:
                out[k] = sub
        elif all(v == vals[0] for v in vals[1:]) or len(set(map(repr, vals))) == 1:
            out[k] = vals[0]
    return out


def delta(full, base):
    out = {}
    for k, v in full.items():
        if k not in base:
            out[k] = v
        elif isinstance(v, dict) and isinstance(base[k], dict):
            sub = delta(v, base[k])
            if sub:
                out[k] = sub
        elif v != base[k]:
            out[k] = v
    return out


base = common(configs)
print("# CONFIG_BASE ="); pprint.pprint(base, width=100, sort_dicts=True)
for n, c in zip(NICHES, configs):
    print(f"\n# ---- {n} CONFIG override ----")
    pprint.pprint(delta(c, base), width=100, sort_dicts=True)
```
Run it inside the django container; paste the printed `CONFIG_BASE` into `_base.py`, and rewrite each vertical's `CONFIG = {...}` as:
```python
from . import _base

CONFIG = _base.deep_merge(_base.CONFIG_BASE, {
    # the printed override dict for this vertical, verbatim
})
```
Caveat the generator can't see: keys present in a vertical but **absent** from `CONFIG_BASE`-covered keys of others are emitted in the delta (handled); keys present in base but *missing* from one vertical cannot exist (base is an intersection). `general.py` is excluded (different shape) and untouched.

- [ ] **Step 5: The equality gate**

Re-run the Step 3 dump with `demo_before_` → `demo_after_` in the filename, then:
```bash
docker compose exec django bash -c 'for n in fitness yoga pilates belly_dance face_yoga makeup pole_dance general; do diff -q /tmp/demo_before_$n.json /tmp/demo_after_$n.json || echo "MISMATCH $n"; done'
```
Expected: no `MISMATCH` lines. Any mismatch = fix the override (the diff of the two JSON files pinpoints the key) — do not proceed until byte-equal.

- [ ] **Step 6: Run the tests + seed smoke**

```bash
docker compose exec django pytest apps/core/tests/test_demo_data.py -v
docker compose exec django python manage.py seed_demo_tenant --help
```
Expected: all tests PASS; the command still imports (`--help` exits 0). Then run one real seed against dev (use the same invocation `make seed` / entrypoint uses for demo tenants — check `git grep -n seed_demo_tenant Makefile backend/entrypoint.sh` and run that form for the `yoga` niche) and confirm it completes without error.

- [ ] **Step 7: Line-count check + ruff + commit**

```bash
docker compose exec django ruff format apps/core/management/commands/demo_data/
docker compose exec django ruff check apps/core/management/commands/demo_data/
wc -l backend/apps/core/management/commands/demo_data/*.py
pre-commit run --files $(git diff --name-only) # fix to zero
git add backend/apps/core/management/commands/demo_data backend/apps/core/tests/test_demo_data.py
git commit -m "refactor(seed): demo verticals share CONFIG_BASE via deep_merge, output byte-identical (audit LOC-6)"
```

---

## Final verification (after all tasks)

- [ ] `make dev-reset && make dev && make health-check` — cold rebuild from scratch works with the new Docker contexts.
- [ ] `make e2e` — full suite green (Stripe specs auto-skip).
- [ ] `docker compose -f docker-compose.prod.yml build` — every image builds.
- [ ] `make lint` — pre-commit clean over the whole tree.
- [ ] LOC delta report: `git diff --stat main@{start}..HEAD | tail -3` and note the numbers against the audit's estimates (docs −~50k active, frontends −~5.5k dup, pickers −~200, demo_data −~600–900).
