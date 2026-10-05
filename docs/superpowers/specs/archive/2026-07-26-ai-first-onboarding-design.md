# AI-First Onboarding — Design

**Date:** 2026-07-26
**Status:** Approved design (rev. 2 after adversarial review), pre-plan
**Owner:** Taha

## Summary

Rework the signup wizard from a design-questionnaire into a content-first,
achievement-style journey: the coach confirms their real first content, picks a
logo, and AI decides every design element (theme, font, navbar, hero, page
layouts, page copy) in one final compose. AI also seeds a **complete** site —
niche-specific starter posts, page copy, and curated stock photography — so the
reveal shows a finished business, not an empty shell. The wizard ends with the
site on screen, a chat box to refine it, a "Get paid" card, and a Publish
button. The refinement chat becomes a metered paid feature; the manual editor is
hidden rather than removed. The admin the coach lands in is refocused too:
18 nav items consolidate into 7 job-stage destinations.

## Decisions (settled during brainstorm + review)

1. **Real content in the wizard** — the coach confirms an actual course (and,
   where their goals call for it, an event and a blog post) during signup; AI
   designs the site around them. Every content step is skippable; skipping
   defers the item to the admin checklist.
2. **Coach still picks the logo** — one screen, AI-ranked curated catalog +
   AI generation. All other design decisions move to AI.
3. **Reveal = chat refinement** — no shuffle buttons, no variant picker. The
   coach tells the AI what to change in natural language.
4. **Quota model (paid tiers)** — first generation free for all; **3 free
   refinements inside the wizard reveal session**; afterwards metered monthly:
   starter = 3 updates/month, pro = 5 updates/month. **The free-tier allowance
   is an OPEN decision** (see "Open decisions").
5. **The manual site editor is hidden, not removed** — it stays fully
   functional and reachable; only its prominence drops as the chat matures.
   Whether it eventually retires is deferred.
6. **Publish gate is goal- and entitlement-conditional** — never demands
   content the coach's declared goals or their plan's entitlements don't
   support (see "Publish gate").
7. **"Get paid" is a section, not a wizard step** — a card on the reveal
   screen (required when priced content exists, optional otherwise), repeated
   as an admin-checklist milestone if skipped.
8. **Admin nav: consolidate + stage-gate** — 18 flat items collapse into 7
   job-stage destinations. Only **Marketing** is stage-gated (on publish);
   Audience is open from day one.
9. **AI seeding replaces static demo templates** — the site is populated with
   niche-specific AI content and curated photography so it reads as a complete
   website. Products seed as drafts; no fabricated social proof.
10. **Free plan gets one lifetime AI blog generation** — a one-off grant, not a
    monthly allowance, redeemable whenever the coach wants it (most will spend
    it in the wizard). The plan's `max_ai_blog_posts` stays 0.

## Open decisions (deliberately deferred)

- **Free-tier site-AI allowance.** Options: 0/month (chat is purely paid),
  1–2/month (taste + upgrade pull), or unlimited-but-slow. Constraint agreed
  during review: because the manual editor is only *hidden*, a free coach
  always retains a way to fix their own site — that escape hatch must not be
  removed while the allowance is 0.
- **Eventual fate of the manual editor.** Revisit after Phase 2 usage data.

## Wizard flow (Phase 1)

Chapters: **Business → Content → Logo → Launch** (Look and Pages chapters
deleted).

| # | Step | Behavior |
|---|------|----------|
| 1 | `business.niche` | unchanged |
| 2 | `business.describe` (+ conditional `business.followups`) | unchanged |
| 3 | `business.goals` ("what you offer") | unchanged |
| 4 | `content.course` | AI drafts **three course outlines** from their niche and description; the coach picks one, edits title/price/description, confirms. Cover auto-picked from `CuratedPhoto`. Published on confirm. First-video upload offered but skippable. Choosing beats inventing: less effort than the old design steps, not more. |
| 5 | `content.event` | **Only when goals include live classes or in-person events, and the plan's `live` entitlement allows it.** Type, title, date; AI suggests a title and a date ~1 week out. |
| 6 | `content.blog` | **Only when goals include blogging.** AI drafts the post from a topic the coach chooses; they review and approve. Free-plan coaches spend their one lifetime AI grant here (see below) — no template fallback needed. |
| 7 | `logo` | Kept as today, single screen. |
| 8 | `launch.reveal` | AI composes the whole site from answers + real content + seeded content. Chat box for refinements (3 free this session). "To get paid" card. Publish button. |

Steps 4–6 each carry a visible achievement affordance — the wizard IS the first
achievements run, and the admin checklist continues the same visual language.

## AI seeding — "a complete website"

Static demo templates are replaced by AI generation contextual to the coach's
niche and description, combined with the existing curated media libraries.

**Seeded and published (safe — content, not commerce):**

- 2–3 starter blog posts generated from *their* description and niche, so
  inputs (and therefore outputs) are unique per tenant.
- Full page copy for every core page (home, about, courses, pricing, FAQ,
  contact) — this is the existing `ai_compose.py` output.
- Photography from `CuratedPhoto` (hero covers, spot illustrations, textures)
  matched to niche and theme.

**Seeded as drafts (never publicly purchasable):**

- Additional course and download outlines beyond the one the coach confirmed
  in step 4. They appear in the admin as ready-to-finish drafts ("we outlined
  3 more courses for you"), invisible on the public site. This prevents a
  student buying a product with no content behind it.

**Never seeded:**

- Testimonials, reviews, ratings, student counts, or any other social proof.
  Fabricated social proof on a published site is deceptive, full stop.

**SEO safeguard:** seeded blog posts carry `noindex` until the coach opens and
saves them. Visitors see a complete site; search engines only index content a
human has reviewed. This defuses the scaled-content risk of many tenants
publishing model-generated articles in overlapping niches.

### Blog AI on the free plan

Two distinct things generate blog content, and they must not be confused:

- **Seeding (platform-initiated, never metered).** The 2–3 starter posts above
  are part of composing a complete site. The platform chooses the topics; no
  coach quota is touched. Cost is bounded per tenant and tracked through the
  existing AI usage logging.
- **The free grant (coach-initiated, one-off).** The coach types their *own*
  topic and gets a real AI draft — a genuine taste of the paid feature at the
  moment they most want it.

Implementation: `BlogAiUsage` is keyed `(tenant_schema, month)` and
`availability()` computes `remaining = limit - used_this_month`
([`blog/ai.py`](../../../backend/apps/blog/ai.py)), so a monthly plan quota
cannot express "once". The grant is therefore a per-tenant consumed-flag
(alongside `setup_progress`) that `availability()` checks: when the plan limit
is 0 and the grant is unspent, report `remaining: 1` with a distinct reason so
the UI can label it ("your free AI post"). Spending it sets the flag; it never
resets, and a plan upgrade simply makes it irrelevant. Charging follows the
existing rule — committed at first model output, not on completion.

Rejected alternative: setting the free plan's `max_ai_blog_posts` to 1. That
reads as "one time" but means one *every month* forever, which both dilutes the
upgrade pull and multiplies the scaled-content risk across free tenants.

**Consequences:** `demo_cleanup` stops being a chore — seeded content is
niche-appropriate and reusable, so the checklist item softens to "review your
starter posts" and never blocks publishing. `_has_own` fingerprinting still
distinguishes seeded rows from the coach's own, which is what the publish gate
reads.

## Structural change: lazy tenant provisioning

Content steps write real tenant-schema rows, so the schema must exist before
step 4 — but **not** at email verification. Provisioning happens on the **first
content write** (entering step 4).

- Rationale: schema-per-tenant provisioning runs every tenant migration. Doing
  it at verification would give every tire-kicker a full schema, permanently
  slowing every future `migrate_schemas` and forcing a destructive cleanup job.
  Lazy provisioning means coaches who bounce during steps 1–3 never touch the
  database.
- A much smaller cleanup job still handles tenants provisioned at step 4 whose
  wizard never reached the reveal, after **14 days** of owner inactivity, with
  a recoverable soft-delete window before schema drop (builds on
  `core/onboarding/recovery.py`). Returning coaches inside the window resume
  where they left off.

## Publish gate

`publish_blockers` (in `apps/tenant_config/setup_items.py`) becomes
goal- and entitlement-aware. Hard blockers for every coach:

- `first_product` — ≥1 own published course **or** download
- `look` — logo set (auto-satisfied by wizard step 7)
- `payouts` — `can_monetize(tenant)`, only when any own item is priced > 0

Conditional blockers, applied only when *both* the coach's declared goals ask
for them *and* their plan entitles them:

- `first_event` — goals include `run_live_classes` or `in_person_events`, and
  the plan's `live` entitlement is on
- `first_blog_post` — goals include `write_blog`

Everything else (announcements, community, email) stays a checklist nudge, never
a blocker.

**Why this changed from rev. 1:** the free plan
([`seed_plans.py`](../../../backend/apps/core/management/commands/seed_plans.py))
sets `max_ai_blog_posts: 0` and `is_live_enabled: False`, and entitlements
derive `ai_blog` from *paid plan AND quota > 0* and `live` from
`is_live_enabled`
([`billing/views/platform.py`](../../../backend/apps/billing/views/platform.py)).
An unconditional "1 course + 1 event + 1 blog" gate was therefore unsatisfiable
on the free plan without forcing a hand-written article and a phantom in-person
event. The one-off free blog grant now makes `first_blog_post` reachable on the
free plan for coaches who *chose* blogging, but the blocker stays conditional on
that goal — a coach who never asked to blog is still never gated on it. Real
state only, as before — manual ticks never satisfy a blocker.

## Reveal chat + quotas

- **Engine:** same composition structures `ai_compose.py` emits, applied
  through the existing blocks registry. Streaming via `core/ai_sse.py`.
- **Operations:** retheme, font change, hero swap, copy edits, block
  add/remove/reorder, page layout swap, section regenerate.
- **One "update" = one applied change-set.** The AI previews the change on the
  rendered site; only "Apply" consumes quota. Clarifications and rejected
  previews are free.
- **Metering:** new `site_ai_updates` counter in `apps.usage`, monthly window
  aligned to the billing period. Starter 3 / pro 5; free-tier allowance is an
  open decision. The wizard-reveal session grants 3 free applies outside the
  counter.
- **Exhaustion UX:** chat stays open and still answers questions; "Apply" shows
  the upgrade prompt with the reset date **and** a link to the (hidden but
  live) manual editor, so no coach is ever unable to change their own site.
- **Compose failure path:** if the reveal compose errors or times out, the
  wizard falls back to the deterministic template compose
  (`core/onboarding/compose.py`) and surfaces a retry. The coach never reaches
  the end of the wizard and gets nothing.

## "Get paid" section

- Reveal screen card: *"To get paid — connect your Stripe account."* Links to
  the existing Stripe Connect onboarding (`apps/billing/providers/connect.py`).
  Required styling when priced content exists (publish blocked until done);
  optional styling ("connect later to start selling") when everything is free.
- If skipped, the admin checklist shows a **Get paid** milestone until
  connected.

## Admin focus — navigation redesign

The admin shell (`frontend-customer/src/components/admin/admin-shell.tsx`)
currently exposes 18 items in 6 sections from day zero. The redesign makes the
menu mirror the coach's job stages instead of our app modules.

### Target IA (7 destinations)

| Item | Absorbs | Notes |
|------|---------|-------|
| **Home** | Dashboard | Leads with the current milestone card ("what to do next"), recent activity below. |
| **Content** | Courses, Live + Calendar, Downloads | Sub-items; only wizard-goal modules visible initially, "+ more" enables others. |
| **My Site** | Edit site, Design, Assistant | Single destination; becomes the Site AI surface in Phase 2, and hosts the hidden-but-live manual editor under an "Advanced" affordance. |
| **Audience** | Students, Community, Inbox | Open from day one. |
| **Marketing** | Blog, Email, Announcements | Stage-gated on publish. Blog lives here: for a coach it is marketing. |
| **Money** | Payouts, Billing, Store | Tabbed hub; doubles as the persistent "Get paid" section. |
| **Settings** | Settings | Also hosts a "browse all features" view. |

Photos/Videos lose top-level status: media is reached from within content
editors (pickers), the ⌘K command palette, and a "Library" link under Content.
All existing routes stay unchanged.

### Stage-gating (teasers, not hiding)

- Pre-publish nav shows six items: Home, Content, My Site, Audience, Money,
  Settings.
- **Marketing** renders locked: greyed but clickable — the click explains the
  unlock ("Publish your site to open Marketing") and links to the milestone.
- **Audience is never gated.** Rev. 1 gated it on "first student joined", which
  was circular: the tools to invite or import students live inside Audience, so
  a coach migrating an existing student list could not reach them.
- Unlock is computed from real tenant state, so already-published tenants see
  the full nav immediately — no regression.
- Escape hatches: ⌘K searches every screen regardless of lock state;
  Settings → "All features" lists everything.

### Migration blast radius

Consolidation is not just a nav file. It touches:

- 18 `admin/…` references in `backend/apps/tenant_config/help_kb.md` — the help
  bot will otherwise give directions to a menu that no longer exists.
- 20 deep links in `frontend-customer/src/components/setup/catalog.ts`.
- ~20 e2e specs that navigate via nav or `/admin/*` routes.
- Flowmap screen keys (`customer|/admin/*`) and any captured screenshots.

All four must be updated in the same change as the nav itself.

### Sequencing

- Consolidation (18 → 7, media demotion, Money hub) ships with **Phase 1**.
- Marketing gating, lock teasers, and unlock celebrations ship with **Phase 2**.

## Admin checklist after this change

The wizard absorbs the old "site" and "content" achievements. The post-signup
checklist (Setup Assistant) reduces to:

1. **Finish what you skipped** — any skipped wizard content step, first-video
   upload if deferred, "review your starter posts".
2. **Get paid** — Stripe Connect (if not done at reveal).
3. **Go live** — publish (if not done at reveal), share your link.
4. **Grow** — first student joined, first announcement, first email campaign,
   first sale (all auto-detected), goal-driven extras, paid teasers (studio
   email, custom domain).

(The "Grow" milestone is new detection work: first non-owner tenant user,
first `email_campaigns` send, first `billing` payment.)

## Phasing

- **Phase 1 — new wizard + AI seeding + reveal chat + consolidated nav.**
  Includes lazy provisioning, the goal-conditional publish gate, quota infra,
  the Get-paid card, and the compose fallback path. Manual editor untouched.
- **Phase 2 — "Site AI" in the admin + Marketing gating.** Same chat, monthly
  quotas active, entry points in the admin shell; the manual editor moves
  behind an "Advanced" affordance in **My Site** but stays fully functional.
  Instrument which editor operations coaches actually perform — that data is
  what any future decision about the editor depends on.
- **Phase 3 — revisit.** With Phase 2 data, decide the free-tier allowance and
  whether the editor's prominence changes further. No removal is scheduled.

## Rollout and measurement

This replaces the entire acquisition funnel, so it ships behind a **holdout**:

- 50/50 split of new signups between the old and new wizard for the first
  **two weeks or 200 signups**, whichever comes later.
- **Primary metric:** verify → publish rate. **Guardrail:** 30-day retention.
- **Rollback trigger:** new-flow verify→publish more than 10% relative below
  the control at the end of the window, or any guardrail regression.
- Secondary: time-to-reveal, per-step skip rate (esp. 4–6), refinements per
  signup, quota exhaustion → upgrade conversion, seeded-post edit rate.

## Testing

- **Unit:** wizard machine order/skip logic; publish blockers across every
  goal × entitlement combination (explicitly including the free plan, which
  must be able to publish); quota accounting (window rollover, plan change
  mid-month, reveal-session grant); **the free blog grant** — spendable once,
  never resets across month boundaries, unaffected by upgrade then downgrade,
  and not consumed by seeding; lazy-provisioning trigger; cleanup-job selection
  and the soft-delete window; seeded-vs-own fingerprint separation.
- **E2e:** rework wizard specs for the new step order; reveal chat refinement →
  apply → publish-from-reveal; compose-failure → template fallback; quota
  exhaustion → upgrade prompt + editor link; skipped-steps → checklist pickup;
  nav consolidation (selectors, media reachable via Content / ⌘K); Phase 2
  Marketing lock/unlock.
- **Compose quality:** extend the `90-logo-eval` pattern with a site-compose
  eval scoring theme/copy coherence against the brief, and a seeding eval
  checking starter posts are niche-appropriate and non-duplicative.

## Risks

- **Effort moved, not removed** — the wizard trades cheap design taps for
  content decisions. Mitigated by AI drafting everything (pick-one-of-three
  rather than blank fields) and by every content step being skippable. The
  holdout exists precisely to catch this if the mitigation fails.
- **Seeded content quality** — a bad AI starter post is worse than none.
  Mitigated by `noindex`-until-reviewed and the seeding eval.
- **Reveal latency** — one large compose at the highest-stakes moment.
  Mitigated by streaming progress and the template fallback.
- **Nav migration misses a surface** — mitigated by the explicit blast-radius
  checklist above.
- **AI cost per signup** (compose + seeding + 3 free refinements) — bounded per
  tenant; monitor via existing AI usage logging.
