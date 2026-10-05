# Design-page navbar consolidation — design

**Date:** 2026-07-23
**Status:** Approved

## Goal

Make `/admin/design` the single "Website" settings hub by adding navbar
management to it, and retire the redundant `/admin/pages` launcher page. Coaches
get full navbar-link management (see available destinations, add/remove/reorder,
CTA, toggles) from the admin, not only from the live-editor sidebar.

## Background

- `frontend-customer/src/components/owner/navbar-tab.tsx` (`NavbarTab`) is a
  complete navbar editor already used in the live editor's `EditSidebar`:
  layout presets (classic/centered/split/minimal/pill), logo size, show-brand-name
  toggle, transparent-over-hero, links with up/down reorder, `LinkPickerModal`
  (site pages / courses / events / custom URL), capability suggestion chips
  ("Add Store", "Add Live Classes"), CTA button, show-login and show-install
  toggles. It emits partial `TenantConfig` patches via `onChange`.
- `/admin/design` (`app/admin/design/page.tsx`) stages a `TenantConfig` locally
  and persists on a manual **Save Changes** button via
  `PATCH /api/v1/admin/config/`. `navbar_config` is already accepted and
  validated by `TenantConfigSerializer.validate_navbar_config` — no backend work.
- `/admin/pages` (`app/admin/pages/page.tsx`) only lists buttons linking to the
  live editor's pages; it holds no unique functionality.
- Admin sidebar (`components/admin/admin-shell.tsx`) has a "Pages" item
  (`nav.items.pages`) → `/admin/pages`; the command palette
  (`components/admin/command-palette.tsx`) has a "Storefront Pages" entry.
- `EditSidebar` (`components/owner/edit-sidebar.tsx`) enables edit mode from
  component state/localStorage only; the design page already demonstrates the
  query-param deep-link pattern (`/admin/design?studio=1`).

## Decisions

1. **Reuse `NavbarTab`, don't rebuild.** One component serves both the live
   editor and the admin design page, so the two surfaces can't drift.
2. **Page-editor discoverability moves to an "Edit site" nav link** (user
   decision): no page list remains in the admin; the sidebar item opens the live
   editor directly.

## Changes

### 1. Navbar card on `/admin/design`

- Add a fifth card ("Navbar", `Navigation` icon from lucide) to the existing
  `lg:grid-cols-2` card grid in `app/admin/design/page.tsx`, rendering:
  `<NavbarTab config={config} onChange={(patch) => setConfig({ ...config, ...patch })} />`
- Changes are staged in the page's local `config` state like every other field
  and saved by the existing Save Changes button. No autosave on this page
  (unchanged page-level behavior; the live editor keeps its debounced autosave).
- The card occupies a normal half-width grid cell; `NavbarTab` is designed for a
  380px sidebar and fits without style changes. Card order: appended after the
  existing four cards (Branding, Theme Controls, Typography, Preview).
- Card description mentions that the same controls are available while editing
  the live site.

### 2. Retire `/admin/pages`

- Delete `app/admin/pages/page.tsx` (the route directory).
- Admin sidebar (`admin-shell.tsx`): replace the "Pages" item with an
  **"Edit site"** item linking to `/?edit=1`, opened in a new tab with the
  external-link affordance, mirroring the header's "View Site" button
  (`target="_blank" rel="noopener noreferrer"`). The generic nav-item renderer
  gains whatever minimal support this needs (e.g. an `external`/`newTab` flag;
  no active-state highlight for it).
- Command palette: repoint the `nav-pages` entry — label "Edit site", category
  "Website & Media", href `/?edit=1`, opened in a new tab; keywords updated
  (e.g. "pages", "site", "editor", "builder").
- i18n: in `messages/en/admin.json` and `messages/tr/admin.json`, replace
  `nav.items.pages` ("Pages"/"Sayfalar") with an edit-site label
  ("Edit site"/"Siteyi düzenle"). Key may be renamed (`editSite`) since it is
  referenced only from `admin-shell.tsx`.

### 3. `?edit=1` deep link into the live editor

- `EditSidebar` gains a mount effect reading `window.location.search` (same
  pattern as the design page's `?studio=1` — not `useSearchParams`, to avoid the
  Next 14 client Suspense bailout): if `edit=1`, call the existing
  `toggleEditMode(true)` path so edit mode turns on, the panel opens, and the
  choice persists to localStorage exactly as if the coach clicked "Edit site".
- Applies on any tenant page that renders `EditSidebar` (it wraps the public
  site), though only `/?edit=1` is linked from the admin.
- Visitors passing `?edit=1` see nothing: `EditSidebar` is only mounted for the
  authenticated owner.

### 4. Navbar-link management

No new work — satisfied by embedding `NavbarTab`: available destinations come
from `LinkPickerModal` (static site pages, live course list, live event list,
custom URL) and the capability suggestion chips.

## Error handling

- Design page save keeps its existing behavior (errors logged to console,
  button re-enables). `navbar_config` validation errors surface as a failed
  PATCH — unchanged from how the live editor handles them today.
- `NavbarTab`'s suggestion fetches already swallow errors (chips simply don't
  appear); nothing new needed.

## Testing & verification

- `make typecheck` and `make test-frontend` (existing `lib/__tests__/navbar.test.ts`
  continues to cover navbar presentation rules; no new pure logic is introduced).
- e2e: check `e2e/impact-map.json` — add/adjust entries so
  `app/admin/design` and `app/admin/pages` / `admin-shell` touch-points map to
  sensible specs (`14-navbar-layouts` covers navbar rendering); the selector
  self-test in `make lint` must stay green.
- Manual verification on the running dev stack (demo-yoga tenant): navbar edits
  on `/admin/design` save and render on the public site; `/admin/pages` is gone
  (404); sidebar "Edit site" opens the live editor in a new tab with the panel
  open.

## Out of scope

- No backend/serializer/migration changes.
- No changes to the live editor's autosave or its Navbar section.
- No redesign of `NavbarTab` styling for wide layouts.
