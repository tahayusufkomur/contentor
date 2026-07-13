# Contentor — LOC Reduction & Component Reuse Audit

_Generated 2026-07-12. Read-only analysis of where lines of code live, what is duplicated,
what can be shared, and what documentation can be archived — all without changing any
functionality. Companion to [AUDIT-FINDINGS.md](AUDIT-FINDINGS.md) (security/correctness audit)._

## How to read this

Every duplication claim below was measured, not eyeballed: byte-identical files were found
by content hashing, near-duplicates by `diff` line counts. "Diverged N%" = differing lines
as a share of both files' combined length (0% = identical, 100% = nothing shared).

Effort/risk tags: 🟢 mechanical, zero functional risk · 🟡 contained refactor, needs
verification · 🔴 real feature work disguised as refactoring — do deliberately or not at all.

---

## 0. Where the lines actually are

| Area | Lines | Composition |
|---|---:|---|
| `docs/` | 83,872 md | 73,248 in `superpowers/plans/` (70 files) · 5,421 active specs (24) · 5,218 archived specs (32) · ~1,260 top-level docs |
| `backend/` | 59,873 py | 23,160 tests (39%) · ~7,300 demo-seed content · rest product code. +4,828 migration lines (untouchable) |
| `frontend-customer/` | 56,656 ts/tsx | components 32k · app 12.7k · lib 10.3k |
| `frontend-main/` | 14,727 ts/tsx | |
| `e2e/` | 3,433 ts | fine as-is |
| `tools/flowmap/` | 1,426 js | fine as-is |

Non-findings worth stating:
- The ~29k lines of JS under `backend/staticfiles/` are gitignored `collectstatic` output — not repo code.
- Backend test volume (39% of backend Python) is healthy, not a reduction target.
- Backend storage/presign logic is already centralized in `apps.core.storage` — all 16 call
  sites import the shared helpers. No backend-wide duplication problem exists.
- `blog/views.py` vs `blog/platform_views.py` look like a copy-pair but are genuinely
  different code (219 differing lines of 299 combined).

---

## 1. Docs — the single biggest reduction (🟢, −45–55k lines of active docs)

`docs/superpowers/plans/` is **87% of all documentation** and has no archive, unlike
`specs/` (archived in commit `da2bcd5`). Plans for shipped features are dead weight in the
active doc surface.

**Measured:** 26 plans totaling **19,557 lines** match an already-archived spec by exact
slug — i.e., the feature is confirmed shipped:

```
2026-03-19-per-tenant-zoom-oauth (957)      2026-06-19-video-upload-library (252)
2026-03-19-zoom-meeting-settings (748)      2026-06-20-coach-publish-app (309)
2026-03-22-course-form-consolidation (1228) 2026-06-20-course-categories (175)
2026-03-22-inline-edit-panel (1190)         2026-06-20-custom-filters (121)
2026-03-24-email-campaigns (2172)           2026-06-21-announcements-lab (1709)
2026-03-25-email-panel-improvements (1148)  2026-06-21-install-guide (510)
2026-05-11-bilingual-tr-en (303)            2026-06-22-announcements-templates-recurring-email (1262)
2026-05-12-platform-subscription-payments (283)  2026-07-02-local-runnability-e2e (1397)
2026-06-19-caddy-unification (472)          2026-07-03-login-code-pwa (425)
2026-06-19-core-subpackages (517)           2026-07-03-one-step-creation (975)
2026-06-19-courses-block-display-options (486)   2026-07-03-product-owner-advisor (209)
2026-06-19-niche-example-content (133)      2026-07-06-public-navbar-redesign (1670)
2026-06-19-site-builder-fixes (187)         2026-07-06-superadmin-platform-inbox (719)
```

Looser matching (plans whose spec is archived under a different slug: community phases 1–3,
coach-mailbox phases 1–2, custom-domain wizard, student-PWA phases, setup-assistant,
inbox-gmail-upgrade, screenshot-map, shipped logo-studio work) pushes the shipped total to
an estimated **45–55k lines**.

**Options** (increasing aggressiveness):
1. Create `docs/superpowers/plans/archive/` mirroring the specs convention; move shipped
   plans there. Active-doc surface shrinks; nothing is lost.
2. Delete shipped plans outright. Git history keeps them recoverable and the archived
   *spec* remains the historical record. Only this truly reduces working-tree LOC.

**Also stale:** several top-level specs whose plans are shipped should move to
`specs/archive/`: `student-pwa`, `pwa-usage-tracking`, `custom-domain-onboarder`,
`inbox-gmail-upgrade`, `setup-assistant`, `community-feature`, `onboarding-smoothing`,
`shared-ai-provider` (verify each against PRODUCT.md before moving — CLAUDE.md defines
top-level specs as in-progress).

---

## 2. Cross-frontend duplication — biggest code win (🟡, −~5,500 lines)

The two Next.js apps share **no workspace or package**; shared UI was copy-pasted between
`frontend-main/` and `frontend-customer/` and is already drifting. 68 files exist at the
identical path in both apps.

### 2a. admin-kit: 1,885 lines byte-identical today (🟢 to extract)

Content-hash-identical in both apps:

```
src/lib/admin-kit/client.ts (113)        src/components/admin-kit/model-list.tsx (175)
src/lib/admin-kit/types.ts (142)         src/components/admin-kit/model-form.tsx (246)
src/components/admin-kit/primitives.tsx (170)  src/components/admin-kit/widgets.tsx (353)
src/components/admin-kit/model-index.tsx (98)  src/components/admin-kit/model-page.tsx (451)
+ src/components/ui/modal-portal.tsx (24), src/components/shared/theme-toggle.tsx (49),
  src/components/admin/mailbox/folder-rail.tsx (47), src/types/api.ts (10),
  src/app/admin/inbox/page.tsx (7)
```

Zero divergence means extraction is mechanical. It also means any future edit to one copy
is a silent bug in the other — this is the drift most likely to bite next.

### 2b. Mailbox suite: ~1,540 lines/side at 0–8% divergence

`conversation-list` (0%), `message-editor` (0%), `attachment-list` (1%), `compose-card`
(1%), `thread-view` (1%), `inbox-client` (8%). Measured diffs are almost entirely the
import path (`@/lib/platform-mailbox-api` in main vs `@/lib/mailbox` in customer) plus one
real feature delta: the send-only banner in customer's
`src/components/admin/mailbox/inbox-client.tsx` (~50 lines). The API clients themselves
(126 vs 135 lines) are ~70% identical.

### 2c. Email-campaigns suite: ~2,100 lines/side at 0–6% divergence

`template-grid` (0%), `template-card` (2%), `email-builder-iframe` (2%),
`app/admin/email/page.tsx` (2%), `campaigns/[id]` (2%), `templates` (3%), `compose` (6%).
Same import-path pattern.

### Recommended shape

npm workspaces with a `packages/shared` consumed by both apps:
- The API-client difference becomes a small per-app adapter (base path + endpoint names)
  passed into the shared components.
- The inbox-client banner delta becomes a prop/slot.
- Cost: touches both Dockerfiles (each currently builds one app in isolation) — the one
  real piece of work. Both build in-repo, so the change is contained.
- Minimum viable alternative (no build changes): declare one app canonical and add a CI
  check that copies are byte-identical. Prevents drift, saves zero lines.

### Explicit non-target

`src/components/ui/*` primitives (button, card, input, table…) and the two
`tailwind.config.ts` files have legitimately diverged 30–90% — different themes and
branding per app. Do **not** unify them; that would change functionality.

---

## 3. frontend-customer internal reuse (🟡, −500–1,000 lines)

- **`video-picker.tsx` (301) vs `photo-picker.tsx` (277): 67% identical** → one
  `media-picker` with a `kind` prop saves ~250 lines. Contained, testable.
- **Hand-rolled admin CRUD pages** (`videos` 618, `downloads` 514, `photos` 341,
  `students` 178, …) predate admin-kit; `ModelPage` (451 lines, already shared) is used
  only by `/admin/m/*`. Migrating the simplest pages to admin-kit config is the long-term
  lever, 🔴 but it changes rendered UI — treat as feature work, not refactoring.
- **`app/admin/live/page.tsx` is 1,743 lines** — wants decomposition into components.
  Maintainability, not LOC reduction.
- `videos` vs `photos` pages are only ~40% similar (569 differing of 959 combined) —
  partial extraction at most, low priority.

---

## 4. Backend demo seed data (🟡 optional, −~2,500 lines)

`backend/apps/core/management/commands/demo_data/` holds 7 vertical files
(fitness 749, yoga 741, pilates 741, belly_dance 735, face_yoga 706, makeup 702,
pole_dance 698) that are ~59% line-identical pairwise (yoga↔pilates: 612 differing lines
of 1,482 combined). A shared base dict + per-vertical overrides would cut ~2,500 lines.
It's pure seed content exercised only by `seed_demo_tenant`, so risk is low — but so is
the value. Rank last.

---

## 5. Repo hygiene (bytes, not lines)

- **`frontend-customer/public/logos/` is 69MB and untracked.** `seed_curated_logos`
  loads the catalog into DB+S3; committing this directory would permanently bloat the
  repo. Decide explicitly: gitignore it (S3 is the source of truth) or move to LFS.
- `e2e/screenshots/` (untracked) and `docs/screenshot-map/` (3.7MB on disk, only 1 file
  tracked) are generated artifacts — gitignore candidates.

---

## Suggested execution order

| # | Action | Saves | Risk |
|---|---|---|---|
| 1 | Archive (or delete) shipped plans + stale specs | 45–55k lines active docs | 🟢 none |
| 2 | Extract admin-kit into `packages/shared` (npm workspaces) | ~1,900 dup lines + stops drift | 🟢 byte-identical today; Docker builds need updating |
| 3 | Fold mailbox + email suites into shared package behind API adapter | ~3,600 dup lines | 🟡 one real feature delta to parameterize |
| 4 | Merge video/photo pickers into `media-picker` | ~250 lines | 🟡 contained |
| 5 | gitignore decisions: `public/logos`, screenshot artifacts | 69MB+ repo weight | 🟢 |
| 6 | (Optional) demo_data base + overrides | ~2,500 lines | 🟡 seed-only |
| — | (Deliberate, later) migrate simple admin CRUD pages to admin-kit | 1–3k lines long-term | 🔴 UI changes |

Net effect if 1–5 land: active documentation drops ~60%, cross-frontend TS/TSX duplication
(~5.5k lines) collapses to one copy with drift structurally prevented, and the repo stops
growing by megabytes of generated assets.
