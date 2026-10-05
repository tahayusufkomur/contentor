# Community Feature — Design

**Date:** 2026-07-06
**Status:** Approved (brainstorm complete, pending implementation plan)

## Summary

A private, per-tenant **community feed** that a coach can switch on. One scrolling
feed (Skool/Facebook-group style): members post text + photos, react with a small
emoji set, and comment. Members are all logged-in students of the tenant. Posts
appear instantly (post-moderation); members report bad content; the coach and
tenant staff moderate from a simple queue; platform superadmins get a
cross-tenant safety net.

Built in-house as a new Django **TENANT_APP `apps.community`** — private by
schema isolation, fully white-label, no per-user vendor cost. Every building
block reuses an existing pattern: media presign uploads (`apps.media`), web push
(`apps.notifications`), DRF + `TenantJWTAuthentication`, adminkit for the
superadmin panel.

## Decisions log

| Decision | Choice | Alternatives considered |
|---|---|---|
| Structure | Single feed per tenant | Feed + topic channels; classic forum (categories/threads) |
| Membership | All logged-in students | Paying students only; coach-configurable |
| Content types (v1) | Text + images | Text only; text + images + video |
| Moderation model | Post-moderation (instant publish, report + remove) | Pre-moderation; coach-selectable mode |
| "Staff" moderators | Both tenant staff (owner/coach/`is_staff`) and platform superadmins | Tenant-only; platform-only |
| Build approach | In-house Django tenant app | GetStream Activity Feeds; embedded third-party (Circle) |
| Plan gating | Available on all plans in v1 | Entitlement-gated (possible later) |

Why not GetStream Feeds despite the SDK already being integrated for live video:
per-MAU pricing scales cost with every tenant's students, community data would
leave the tenant schema (isolation becomes token-scoping discipline instead of
being structural), coaches would still need a custom moderation UI, and e2e
would need a second fake alongside `LIVE_FAKE`.

## 1. Enablement & access

- **Gate:** new `CommunitySettings` singleton per tenant with `is_enabled`
  (default **off**); the coach flips it in the admin. The existing `"community"`
  entry in `enabled_modules` defaults is inert today — every tenant already has
  it, so it cannot serve as an opt-in gate. `CommunitySettings.is_enabled` is
  the single source of truth; `enabled_modules` is left alone.
- **Access:** any authenticated tenant user (student/coach/owner). All endpoints
  behind `TenantJWTAuthentication`; no anonymous route. The student nav shows
  "Community" only when enabled.
- **Moderators:** tenant users with role `owner`/`coach` or `is_staff=True`.
- **Plans:** available on all plans in v1; no entitlement check.

## 2. Data model (tenant schema, new app `apps.community`)

- **CommunitySettings** — singleton: `is_enabled` (default false),
  `welcome_message` (shown at the top of the feed), `notify_on_coach_post`
  (default true).
- **CommunityMember** — lazy-created on a user's first visit:
  `display_name` (defaults from `user.name`), `avatar_url` (defaults from
  `user.avatar_url`), `joined_at`, `last_seen_at`; moderation state:
  `is_banned`, `muted_until`, `requires_approval` (per-member troublemaker
  flag — their subsequent posts wait for approval).
- **Post** — author FK, plain-text body (URLs linkified and line breaks
  preserved at render time; no HTML or rich-text editor in v1), up to 4 image
  keys (existing media/MinIO presign pipeline, keys namespaced `community/`),
  `is_pinned`, `status` (`visible` / `pending` / `hidden` / `removed`),
  denormalized `comment_count` and `reaction_count`, `created_at`,
  `edited_at` (authors may edit; edits are marked).
- **Comment** — post FK, author FK, plain-text body, same `status` field,
  flat (no nesting in v1).
- **Reaction** — one per user per target (changeable), emoji from a fixed set
  (❤️ 👍 🎉 💪 😂), attaches to posts and comments.
- **Report** — reporter FK, target (post or comment), `reason` (spam /
  inappropriate / harassment / other + free text), `status` (open/resolved),
  `action_taken` (removed/kept), `resolved_by`, timestamps. Unique per
  reporter + target (prevents report-spamming).
- **Auto-hide:** a target with 3 open reports from distinct members flips to
  `hidden` pending review.

Status semantics:

- `visible` — normal.
- `pending` — author has `requires_approval`; visible only to the author and
  moderators until approved.
- `hidden` — auto-hidden by reports; visible only to moderators until resolved.
- `removed` — soft-removed by a moderator; hidden from the feed, visible in the
  admin under a "removed" filter. No purge job in v1.

## 3. API surface (`/api/v1/community/`)

All endpoints require tenant JWT auth. Moderation endpoints require moderator
permission (owner/coach role or `is_staff`).

**Member-facing**

- Feed: cursor-paginated post list (pinned first), create post, edit/delete own
  post.
- Comments: paginated list per post, create, delete own.
- Reactions: put/delete own reaction on a post or comment.
- Reports: report a post or comment with a reason.
- Profile: get/update own community profile (display name, avatar via the
  existing media presign flow).
- Settings (read): whether community is enabled + welcome message (drives nav
  visibility).

**Moderation**

- Reports queue: open reports, plus auto-hidden targets and pending-approval
  posts, in one list.
- Resolve report: **remove** (target → `removed`) or **keep** (target restored
  to `visible`, all open reports on it resolved).
- Pin/unpin post; remove any post or comment directly.
- Members: list with search; ban / unban; mute-until timestamp; toggle
  `requires_approval`; approve pending posts.
- Settings (write): enable/disable, welcome message, notify toggle.

**Enforcement semantics**

- **Banned** member → 403 on all community endpoints; nav hidden for them.
- **Muted** member → read-only (can view, cannot post/comment/react) until
  `muted_until` passes.
- Anti-spam throttles (DRF per-user scopes): 10 posts/hour and 60
  comments/hour (settings-tunable constants), on top of the existing
  `TenantRateLimitMiddleware`.

## 4. Student UI (`/community` in the `(student)` area)

- **First-visit join step:** an "Introduce yourself" card/modal — confirm
  display name, upload a photo, optional "Say hi 👋" first-post prompt. This
  delivers the "share names and photos" requirement and seeds engagement.
- **Feed:** composer at the top (textarea + up to 4 photos), pinned posts
  first, infinite scroll (cursor pagination). Welcome message banner from
  settings.
- **Post card:** avatar, display name, **coach badge** on owner/coach posts,
  relative timestamp, linkified body, image grid with lightbox, reaction bar
  (tap for ❤️, pick from the 5-emoji set), inline flat comments with a comment
  box, overflow menu (report / delete own / edit own).
- **Unread:** dot on the "Community" nav item when posts are newer than
  `last_seen_at`; visiting the feed updates `last_seen_at`.
- Mobile-first (student PWA context); empty/loading states per the house
  design system ("Be the first to post").

## 5. Coach UI (`/admin/community`)

Coaches are non-technical: moderation happens in context, with binary choices.

- **Feed tab** — the same feed rendered with inline moderator affordances
  (pin, remove, ban author). No separate abstract moderation tool for normal
  use.
- **Reports tab** — queue of open reports + auto-hidden targets + pending
  posts. Each card shows the content, the reporter's reason, and two buttons:
  **Remove** / **Keep**. Resolving clears all open reports on that target.
  Badge count on the tab and the admin nav item.
- **Members tab** — searchable list, post counts, per-member actions: ban,
  mute, require-approval.
- **Settings** — enable/disable toggle, welcome message, notify-on-coach-post
  toggle.
- Admin nav: a "Community Feed" item joins the existing "Community" nav
  section (currently Students / Notifications / Inbox), with the reports badge.

## 6. Platform staff (superadmin)

- Register community models (posts, comments, reports, members) in adminkit
  (`admin_panels.py`) for cross-tenant browse and removal via the existing
  framework.
- A small open-reports rollup view iterating tenant schemas (same pattern as
  the PWA usage-tracking platform dashboards).
- Impersonation remains the escalation path for hands-on moderation. No
  bespoke superadmin UI beyond this.

## 7. Notifications

Reuses the existing web-push infrastructure (`PushSubscription`) and Celery
task patterns from the announcements work:

- Coach/staff creates a post → push to community members (when
  `notify_on_coach_post` is on).
- Comment on your post → push to the post author.
- Moderation actions are silent to the affected member in v1.
- Weekly email digest is an explicit phase-2 idea (via the existing email
  infrastructure), **not** in v1 scope.

## 8. Privacy & lifecycle

- Private by construction: tenant schema isolation + JWT-only endpoints; the
  student area is already non-public/noindex.
- Images live under a `community/` key namespace; presigned URLs are only
  handed out through authenticated API responses.
- User deletion hard-deletes their community content (true erasure; cleaner
  for small communities than anonymization).
- Moderator-removed content is soft-removed and remains visible in the admin
  "removed" filter for audit; no automatic purge in v1.

## 9. Testing & verification

- **pytest** (per existing app test patterns): permissions matrix (student vs
  moderator vs banned/muted), feed pagination, report auto-hide threshold,
  resolve semantics (remove/keep), `requires_approval` flow, throttles,
  settings gating.
- **e2e Playwright** (one journey in `e2e/`): student joins + posts with
  photo → second student reacts and comments → three students report →
  auto-hide → coach sees the badge, removes from the queue → post gone from
  the student feed → coach pins a post → banned student is blocked.
- **Flowmap:** add a community flow after implementation.

## 10. Phases (each independently shippable)

1. **Backend** — `apps.community` (models, migrations, API, permissions,
   throttles, tests).
2. **Student UI** — join step, feed, composer, reactions, comments, report.
3. **Moderation** — coach tabs (feed powers, reports queue, members),
   settings + enable toggle, superadmin adminkit registration + rollup.
4. **Engagement** — push notifications, unread dot, polish.

**Non-goals for v1:** video posts, topic channels, DMs, gamification/points,
search, @mentions, comment threading, email digests.

## 11. Risks & notes

- **Deploy note:** `apps.community` is a TENANT_APP. The prod entrypoint runs
  `migrate_schemas --tenant` (fix committed as `973d0cf`), so tenant
  migrations apply on deploy — just confirm that commit is part of the deploy
  that ships Phase 1.
- The inert `"community"` entry in `enabled_modules` defaults/demo data should
  not be repurposed as the gate (it would silently enable the feature for all
  existing tenants); it can be cleaned up opportunistically.
- Denormalized counters (comments/reactions) must be updated transactionally
  with their source rows to avoid drift.
- Empty-success moderation endpoints must return **204** (not empty 200) per
  the known clientFetch/Cloudflare gotcha.
