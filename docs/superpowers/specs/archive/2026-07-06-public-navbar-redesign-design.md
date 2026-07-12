# Public Navbar Redesign — Design

Date: 2026-07-06
Status: approved (brainstorming session with owner)
Scope: frontend-customer public site header + new /events page + template seeds + navbar builder tab

## Problem

The coach's public site navbar (`frontend-customer/src/components/shared/public-header.tsx`)
does not represent what the app can do:

- All 8 demo templates seed **"Programs" → /courses**, Calendar, About, FAQ. A visitor
  to a yoga coach's site sees nothing that says "I teach live classes" or "I run
  events" — the beachhead ICP's core offering. Downloads (/store) are invisible in
  template seeds.
- The only destination for live/onsite events is `/calendar`, a month grid — a weak
  selling surface for a nav link.
- There is exactly one hardcoded layout (logo left, flat links, hardcoded
  "Install app", auth cluster). `NavbarConfig` has no layout concept.
- The navbar builder tab (`components/owner/navbar-tab.tsx`) cannot reorder links and
  gives no hints when the coach has content (events, downloads) with no link to it.

## Decisions made with the owner

1. Scope = **public site navbar** (admin sidebar IA issues noted separately, not here).
2. Events get a **new public /events listing page**; /calendar stays as alternate view.
3. Defaults: **truthful template seeds** + convenient editing (reorder, suggestion
   chips). No silent auto-changes to a coach's navbar.
4. Layout presets: **classic, centered, split, minimal, pill** (all 5) + a
   **transparent-over-hero** modifier toggle. Next-event ribbon was considered and
   declined; sidebar/bottom-tab layouts are out (page-shell changes).
5. Architecture: **config-driven single header component** (option A) — not
   component-per-preset, not header-as-builder-block.

## 1. Schema — NavbarConfig (additive; JSONField, no DB migration)

```ts
interface NavbarConfig {
  links: NavLink[];                  // existing
  cta: { text: string; href: string } | null;  // existing
  show_login: boolean;               // existing
  layout?: "classic" | "centered" | "split" | "minimal" | "pill"; // default "classic"
  transparent_over_hero?: boolean;   // default false
  show_install?: boolean;            // default true (replaces hardcoded Install app)
}
```

Backend (`apps/tenant_config/serializers.py`): light validation — `layout` must be in
the enum if present; booleans coerced. Additionally (found during planning):
`navbar_config` is currently persisted with NO sanitation, unlike `pages` — the new
`validate_navbar_config` also shapes links/cta (string caps, list cap) and strips
unsafe URL schemes (`javascript:`/`vbscript:`), matching the serializer's existing
defence-in-depth. Frontend treats unknown/missing `layout` as `classic`, so stale
configs degrade safely.

## 2. Renderer — one config-driven PublicHeader

Shared across all presets (identical markup/logic): auth cluster (sign in / user /
subscribe / admin link), announcement bell, theme toggle, "Install app" link (now
gated on `show_install`), and the mobile hamburger + mobile menu. Presets change
desktop arrangement only.

- **classic** — current layout, byte-for-byte the default.
- **centered** — brand row on top, centered link row below (~2-row header).
- **split** — links split evenly left/right of a centered brand; auth cluster
  compresses to icons far right.
- **minimal** — brand + CTA + hamburger on desktop too.
- **pill** — floating detached rounded capsule, backdrop-blur, page scrolls under it.
  Styling uses theme tokens as `var(--token)` directly (never `hsl(var(--token))` —
  oklch tokens).
- **transparent_over_hero** (modifier, any preset except pill which is inherently
  floating): v1 activates on the home page (`/`) only — absolute, transparent over the
  hero, becomes solid + sticky after ~40px scroll. All other routes solid. Detecting
  hero blocks on other builder pages is a noted follow-up, NOT in scope.

## 3. New public /events page

`frontend-customer/src/app/(public)/events/page.tsx`, server component. Fetches the
EXISTING calendar API — `/api/v1/calendar/?from=<today>&to=<+90d>` — no new backend
endpoint. `CalendarEvent` already provides: `type`
(live_class | live_stream | zoom_class | onsite_event), title, description,
`pricing_type`/`price`, `scheduled_at`, `location`, `thumbnail_signed_url`.

- Card list grouped by day: "Today", "This week", then explicit dates. Card =
  thumbnail, type badge (Live class / Livestream / Zoom / In person), time in tenant
  timezone, location (onsite only), price/Free chip, link to the existing
  `/calendar/[type]/[id]` detail pages (reused — they already handle access/join).
- Cross-links: /events header row → "View as calendar" (/calendar); /calendar gains a
  reciprocal "List view" link.
- Empty state: "No upcoming events scheduled"; when the signed-in viewer is the
  coach/owner, add a hint linking to `/admin/live`.

## 4. Seeds — truthful defaults

- **Provisioning default** (`apps/core/tasks.py`): links = Courses → /courses,
  Events → /events, About → /about. CTA unchanged.
- **8 demo templates** (`apps/core/management/commands/demo_data/*.py`): drop
  "Programs"; each seeds Courses → /courses, Live Classes → /events,
  Store → /store (ONLY templates that seed downloads), About, FAQ. Template layout
  assignments (fixed): yoga → centered, pilates → split, makeup → pill,
  face_yoga → minimal, pole_dance → pill, fitness → classic, belly_dance → centered,
  general → classic — so the /demo gallery shows the full range.
- **Code fallback** in `public-header.tsx` aligned to the provisioning default
  (Courses, Events, About).
- Existing tenants untouched: seeds apply only at provision/demo-seed time.
- Setup assistant: `pages_edited` diff is pages-scoped; navbar_config edits must not
  false-flag it — covered by a test.

## 5. Navbar builder tab (components/owner/navbar-tab.tsx)

Top to bottom:

1. **Layout picker** — 5 clickable visual thumbnails (mini-wireframes), autosaves via
   the existing tenant_config pipeline.
2. **Transparent-over-hero toggle** — hidden when layout = pill.
3. **Links** — existing rows plus ↑/↓ reorder buttons (no drag dependency) and the
   existing link-picker; picker's Pages tab gains an "Events" entry (/events).
4. **Suggestion chips** — shown when the tenant has upcoming events but no link whose
   href is /events (chip: "Add Live Classes"), or has downloads but no /store link
   (chip: "Add Store"). One click appends the link. Convenience only — never
   automatic.
5. Existing CTA + show-login blocks; new **Show "Install app"** toggle.

## 6. i18n & testing

- Coach link labels are tenant data — not translated. New UI strings (navbar tab,
  /events page, badges, empty states) are hardcoded English, matching the existing
  convention of the entire public surface (calendar page) and edit sidebar — a
  repo-wide i18n retrofit of frontend-customer is a separate task, not this one.
  (Corrected 2026-07-06 during planning; the original "EN+TR" line predated checking
  the codebase convention.)
- Tests (corrected: frontend-customer has no unit-test runner, so preset coverage is
  e2e + typecheck, not component render tests): serializer validation tests (layout
  enum, coercion, unsafe-href stripping); setup-status regression (navbar edit does
  not flip `pages_edited`); demo-template invariants test (valid layout, /events
  link present, no "Programs" label); Playwright e2e: (a) switch layout in builder →
  public site reflects it, (b) /events renders upcoming seeded events; `tsc` +
  builds clean; manual browser walkthrough before merge.

## 7. Out of scope (recorded)

- Next-event ribbon above the navbar (declined for now).
- Left-sidebar / mobile bottom-tab layouts (page-shell rework).
- Admin sidebar IA fixes (Live Events placement, Email under Content, untranslated
  "Data") — separate small task, tracked in PRODUCT.md.
- Transparent-over-hero on non-home builder pages.

## Effort

~3.5–4.5 agent-days: schema + renderer 1d, /events 1d, seeds 0.5d, navbar tab 1d,
i18n + tests 0.5–1d.
