# AI-First Onboarding — Design

**Date:** 2026-07-26
**Status:** Approved design, pre-plan
**Owner:** Taha

## Summary

Rework the signup wizard from a design-questionnaire into a content-first,
achievement-style journey: the coach creates their real first content (course,
event, blog post) during signup, picks a logo, and AI decides every design
element (theme, font, navbar, hero, page layouts, page copy) in one final
compose. The wizard ends with the finished site on screen, a chat box to refine
it, a "Get paid" card, and a Publish button. The refinement chat becomes a
metered paid feature and — in the final phase — replaces the manual site editor.

## Decisions (settled during brainstorm)

1. **Real content in the wizard** — coaches create actual course/event/blog
   rows during signup; AI designs the site around them. Every content step is
   skippable; skipping defers the item to the admin checklist and blocks
   publishing, never the wizard itself.
2. **Coach still picks the logo** — one screen, AI-ranked curated catalog +
   AI generation. All other design decisions move to AI.
3. **Reveal = chat refinement** — no shuffle buttons, no variant picker. The
   coach tells the AI what to change in natural language.
4. **Quota model** — first generation free for all; **3 free refinements
   inside the wizard reveal session only**; afterwards metered monthly:
   free = 0, starter = 3 updates/month, pro = 5 updates/month.
5. **AI chat replaces the manual site editor** (Phase 3, after usage data).
6. **Publish gate** — at least 1 own course published, 1 own event scheduled,
   1 own blog post published, logo set, and Stripe Connect completed when any
   content is priced > 0. Real-state checks only; manual ticks never satisfy it.
7. **"Get paid" is a section, not a wizard step** — a card on the reveal
   screen (required when priced content exists, optional otherwise), repeated
   as an admin-checklist milestone if skipped.

## Wizard flow (Phase 1)

Chapters: **Business → Content → Logo → Launch** (Look and Pages chapters
deleted; ~14 steps become ~8).

| # | Step | Behavior |
|---|------|----------|
| 1 | `business.niche` | unchanged |
| 2 | `business.describe` (+ conditional `business.followups`) | unchanged |
| 3 | `business.goals` ("what you offer") | unchanged |
| 4 | `content.course` | Create first course: title, description, price — all pre-suggested by AI from niche/description; coach edits and confirms. Cover auto-picked from curated photos. First-video upload offered but skippable (becomes an admin achievement). Created as published. |
| 5 | `content.event` | Schedule first event: type (live class / onsite), title, date. AI suggests title and a date ~1 week out. |
| 6 | `content.blog` | AI drafts the full post (extend `core/onboarding/starter_post.py`); coach reads, tweaks, approves. Created as published. |
| 7 | `logo` | Kept as today, single screen. |
| 8 | `launch.reveal` | AI composes the entire site from answers + real content. Coach sees their actual course/event/post rendered. Chat box for refinements (3 free in this session). "To get paid" card. Publish button (enabled when blockers are green). |

Steps 4–6 each carry a visible achievement affordance (check animation on
completion) — the wizard IS the first achievements run; the admin checklist
continues the same visual language afterwards.

## Structural change: early tenant provisioning

Content steps write real tenant-schema rows, so provisioning moves from
wizard-end ("Create my platform") to **immediately after email verification**.

- Wizard content steps become thin authenticated APIs writing into the real
  tenant (courses, live, blog apps).
- **Demo template seeding is dropped for new signups** — real content replaces
  it. `demo_cleanup` disappears from the journey. Seeding code stays for dev
  tenants (`seed_dev_tenants`) and existing tenants.
- Abandoned signups leave partial tenants: a nightly job deletes tenants whose
  wizard never reached the reveal and whose owner has been inactive for
  **14 days** (builds on `core/onboarding/recovery.py` partial-state handling).

## Publish gate

`publish_blockers` (in `apps/tenant_config/setup_items.py`) becomes:

- `first_course` — ≥1 own (non-demo-fingerprint) published course
- `first_event` — ≥1 own LiveClass/LiveStream/ZoomClass/OnsiteEvent
- `first_blog_post` — ≥1 own published blog post
- `look` — logo set (auto-satisfied by wizard step 7)
- `payouts` — `can_monetize(tenant)`, required only when any own course or
  download has price > 0

The gate is unconditional across goal segments (accepted risk: downloads-only
coaches still publish a blog post and schedule an event; AI drafts make each
~30 seconds). If funnel data shows segment drop-off, softening the gate is a
one-function change.

## Reveal chat + quotas

- **Engine:** same composition structures `ai_compose.py` emits, applied
  through the existing blocks registry. Streaming via `core/ai_sse.py`.
- **Operations:** retheme, font change, hero swap, copy edits, block
  add/remove/reorder, page layout swap, section regenerate.
- **One "update" = one applied change-set.** The AI previews the change on the
  rendered site; only "Apply" consumes quota. Clarifications and rejected
  previews are free.
- **Metering:** new `site_ai_updates` counter in `apps.usage`, monthly window
  aligned to the billing period. Plan limits: free 0 / starter 3 / pro 5.
  Wizard-reveal session grants 3 free applies outside the counter.
- **Exhaustion UX:** chat stays open, AI answers questions, but "Apply" shows
  the upgrade prompt with the reset date.

## "Get paid" section

- Reveal screen card: *"To get paid — connect your Stripe account."* Links to
  the existing Stripe Connect onboarding (`apps/billing/providers/connect.py`).
  Required styling when priced content exists (publish blocked until done);
  optional styling ("connect later to start selling") when everything is free.
- If skipped, the admin checklist shows a **Get paid** milestone with the same
  item until connected.

## Admin checklist after this change

The wizard absorbs the old "site" and "content" achievements. The post-signup
checklist (Setup Assistant) reduces to:

1. **Finish what you skipped** — any of steps 4–6 skipped in the wizard,
   plus first-video upload if deferred.
2. **Get paid** — Stripe Connect (if not done at reveal).
3. **Go live** — publish (if not done at reveal), share your link.
4. **Grow** — first student joined, first announcement, first email campaign,
   first sale (all auto-detected), goal-driven extras (community post), paid
   teasers (studio email, custom domain).

(The "Grow" milestone is new detection work: first non-owner tenant user,
first `email_campaigns` send, first `billing` payment.)

## Phasing

- **Phase 1 — new wizard + reveal chat.** Includes early provisioning, publish
  gate change, quota infra (the reveal already meters free applies), Get-paid
  card. Manual site editor untouched.
- **Phase 2 — "Site AI" in the admin.** Same chat, monthly quotas active,
  entry points in the admin shell and site editor. Manual editor de-emphasized
  (moved behind an "advanced" affordance in the editor entry).
- **Phase 3 — retire the manual editor** behind an advanced/legacy flag, only
  after Phase 2 data shows chat covers real editing operations (target: chat
  handles ≥90% of observed editor operation types). Not scheduled yet.

## Testing

- **Unit:** wizard machine order/skip logic; publish blockers (each
  combination, priced vs free); quota accounting (window rollover, plan
  upgrade/downgrade mid-month, reveal-session grant); orphan-tenant cleanup
  selection.
- **E2e:** rework wizard specs for the new step order; new spec: reveal chat
  refinement → apply → publish-from-reveal; quota exhaustion → upgrade prompt;
  skipped-steps → admin checklist pickup → publish gate enforcement.
- **Compose quality:** extend the existing AI-eval pattern (`90-logo-eval`)
  with a site-compose eval scoring theme/copy coherence against the brief.

## Metrics

Verify→reveal completion rate, time-to-reveal, per-step skip rate (esp. 4–6),
reveal→publish rate, refinements per signup, quota exhaustion → upgrade
conversion, 7/30-day retention by cohort vs the old wizard.

## Risks

- **Content friction before value** — mitigated by AI pre-drafting every field
  and every content step being skippable.
- **Early provisioning orphans** — mitigated by the 14-day cleanup job.
- **Chat coverage gaps** — manual editor stays through Phases 1–2; retirement
  is data-gated.
- **AI cost per signup** (compose + 3 free refinements) — bounded per tenant;
  monitor via existing AI usage logging.
