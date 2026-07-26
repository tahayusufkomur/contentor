# AI-First Onboarding — Phase 2 Design

**Date:** 2026-07-26
**Status:** Approved design, pre-plan
**Owner:** Taha
**Builds on:** [2026-07-26-ai-first-onboarding-design.md](2026-07-26-ai-first-onboarding-design.md) (Phase 1, shipped & merged `b2743537`)

## Summary

Phase 1 shipped the content-first wizard, the consolidated 7-destination admin nav, and the reveal chat. Phase 2 makes the admin **grow with the coach** and turns the site-AI engine into an ongoing, monetized admin feature — three subsystems in one spec:

- **A. Nav stage-gating** — Marketing locks until the site is published (with an unlock celebration); Content shows only the coach's goal-matched modules first, with a "+ More" disclosure for the rest. The menu itself becomes part of the achievement loop.
- **B. Admin "Site AI" panel** — the reveal chat, resurfaced in the admin under **My Site**, metered monthly (`site_ai_updates`): free 0 / starter 3 / pro 5. Free coaches get an upgrade surface; manual editing stays free and one click away.
- **C. Conditional editor de-emphasis** — for **paid** coaches (who have AI), the manual "Edit site"/"Design" entries collapse under an "Advanced editing" disclosure with Site AI leading; **free coaches keep the manual editor prominent**.

## Decisions (settled during brainstorm)

1. **Free-tier ongoing AI = 0/month; manual editing stays free and first-class.** AI is the paid convenience, never the only way to change your own site. This resolves the Phase-1 "free-tier allowance" open decision.
2. **Editor de-emphasis is conditional on plan.** Only coaches who actually have AI (paid) see the manual editor moved under "Advanced." Free coaches — who have no AI alternative — keep it prominent. This resolves the Phase-1 "manual editor fate" open decision: hidden-for-paid, not removed, never hidden from those who need it.
3. **All three subsystems ship in this Phase-2 spec**, decomposed into independent plans.
4. **Reveal free AI drops from 3 refinements to 1** (a Phase-1 tweak folded in): the reveal still auto-designs the site free for all, plus **one** free refinement apply. `REVEAL_FREE_APPLIES = 3 → 1` (`wizard.py:30`).
5. **Marketing is the only nav lock; Audience stays ungated** (the Phase-1 circularity fix stands).

## Open decision (deferred, flagged for spec-review)

- **Editor-operation instrumentation.** The Phase-1 vision included logging which manual-editor operations coaches use, to gate a future editor-retirement call. Given decision 1 (manual editing stays free forever), retirement is no longer on the table, so this data would have **no consumer**. **Recommendation: drop it** (YAGNI). Subsystem C becomes conditional de-emphasis only. Confirm at review.

## A. Nav stage-gating

Extends the pure `buildAdminNav(t)` module (`frontend-customer/src/lib/admin-nav.ts`, shipped Plan 2) with a gating layer. The gating is a set of **pure predicates** over real tenant state — never manual ticks — so it stays unit-testable and never regresses existing tenants.

### Signals (already available client-side)

- **Published?** from `useSetupStatus()` — `publish_blockers` empty AND the `publish` item done, or `is_published` on the tenant config.
- **Wizard goals** — from the tenant config / wizard state, already read for the setup checklist.
- **Plan / entitlements** — from the existing `EntitlementsProvider`.

### Rules

- **Marketing** (Blog, Email, Announcements): rendered **locked** (greyed, still clickable) until published. Click opens a small explainer — "Publish your site to open Marketing" — linking to the publish milestone (the setup assistant's `publish` item). On first publish, Marketing unlocks with a **one-time celebration**: a highlight dot on the nav item + a sonner toast ("🎉 Marketing is now open"). The celebration fires once (a `marketing_unlock_seen` flag in the setup progress JSON).
- **Content** sub-items: show only goal-matched modules initially — Courses always; Live + Calendar when goals include `run_live_classes`/`in_person_events`; Downloads when goals include `sell_downloads`. A **"+ More"** disclosure at the bottom of Content reveals the hidden modules (and remembers the choice via a `content_expanded` UI flag). Library stays under "+ More".
- **Audience**, **Money**, **My Site**, **Home**, **Settings**: never gated.
- **Existing tenants**: any published tenant computes as fully unlocked, and any tenant with content across modules shows them — so nothing disappears for current coaches. This is a computed property of real state, not a migration.

### Shape

A new `gateAdminNav(sections, state)` pure function wraps `buildAdminNav`, returning sections annotated with `locked?: {reason, href}` and filtered/expandable Content items. `AppSidebar`/`MobileHeader` render the locked affordance and the "+ More" toggle. All gating logic is unit-tested against a `state` object; no network in the pure layer.

## B. Admin "Site AI" panel

The reveal chat, resurfaced for ongoing use in the admin. The **backend engine is already built** (`apps/core/onboarding/site_ai.py`: `availability`, `preview_edit`, `apply_edit`, `record_update`); Phase 2 adds the admin-facing surface + **monthly** enforcement (the reveal used a per-session `wizard_state` counter; the admin uses the monthly `SiteAiUpdateUsage` model + `site_ai.availability`, both shipped Plan 5).

### Surface

A new page at **`/admin/site-ai`**, listed under **My Site**. Chat input → streamed preview (free, SSE, reusing the `streamAi` reader) → **Apply**. Apply calls a new admin endpoint (`IsCoachOrOwner`, tenant JWT) that:
- checks `site_ai.availability(tenant)`; if `remaining <= 0`, returns the upgrade reason (never applies),
- else `apply_edit` + `record_update` (commit-on-apply, USD accrues on every attempt — the shipped pattern).

### Per-plan UX

- **Free (0/mo):** the panel is an **upgrade surface** — the coach can type and see a preview, but Apply shows the upgrade prompt with the plan comparison. A prominent "Edit manually instead" link sits next to it (manual editing is free).
- **Starter (3/mo) / Pro (5/mo):** a remaining-count chip ("2 of 3 left this month") and the reset date; Apply consumes one unit; exhaustion shows the upgrade prompt but the coach can still edit manually.

### Reuse note

The reveal chat lives in `frontend-main` (`reveal-chat.tsx`); the admin app is `frontend-customer`. The **UI is rebuilt** in the admin app (different app, different shell), but the **backend engine, SSE frames, and metering are shared** — no new AI logic.

## C. Conditional editor de-emphasis

Small nav-presentation change in **My Site**, driven by whether the coach has AI (paid):

- **Has AI (paid):** My Site leads with **Site AI**; "Edit site" (`/?edit=1`) and "Design" (`/?edit=1&section=brand`) collapse under an **"Advanced editing"** disclosure. Site assistant stays where it is.
- **No AI (free):** "Edit site" and "Design" stay top-level and prominent; **Site AI is shown as a paid-badged My Site item** that opens the upgrade surface (subsystem B) — consistent with how the panel treats free coaches, so the feature is discoverable without being a wall.

No editor code changes; no instrumentation (per the deferred decision). Purely which My Site items are primary vs. under "Advanced," computed from the `logo_studio`/AI entitlement already in `EntitlementsProvider`.

## The Phase-1 tweak (reveal free applies)

Change `REVEAL_FREE_APPLIES = 3 → 1` in `wizard.py`. Update the shipped reveal-chat copy ("1 free refinement" / "your free AI redesign") and the `test_site_ai`/reveal-apply test expectations (the apply test currently asserts remaining `2,1,0` over three applies → now asserts one apply then exhaustion). Small, self-contained.

## Decomposition into plans

Four plans, the first three buildable in parallel (disjoint files):

| Plan | Scope | Depends on |
|------|-------|------------|
| **P2-0 — Reveal free-apply tweak** | `REVEAL_FREE_APPLIES 3→1` + copy + test updates | Phase 1 (merged) |
| **P2-1 — Nav stage-gating** | `gateAdminNav` predicate layer, Marketing lock + unlock celebration, Content "+ More", sidebar/mobile rendering, i18n | Plan 2 (merged) |
| **P2-2 — Admin Site AI panel** | `/admin/site-ai` page, apply endpoint w/ monthly enforcement, per-plan UX, upgrade prompt | Plan 5 (merged) |
| **P2-3 — Conditional editor de-emphasis** | My Site "Advanced editing" disclosure gated on AI entitlement | P2-1 (shares nav rendering) |

## Testing

- **P2-0:** reveal-apply test asserts 1 free then 402; copy updated.
- **P2-1:** `gateAdminNav` unit tests (Marketing locked pre-publish / unlocked post-publish / published-tenant-unlocked; Content goal-matched + "+ More" reveals rest; Audience never gated; celebration fires once). e2e: a fresh unpublished tenant sees Marketing locked; after publish it unlocks.
- **P2-2:** apply endpoint enforcement (free → upgrade, starter → decrements, exhausted → upgrade), availability wiring; e2e: paid coach applies an edit from `/admin/site-ai` and sees the remaining count drop.
- **P2-3:** nav-item placement unit test (paid → Edit/Design under Advanced; free → prominent).

## Risks

- **Nav gating hides a tool a coach wants** — mitigated: locks are clickable + explained, "+ More" always reveals everything, and ⌘K reaches every route regardless.
- **Free coach confused by a Site AI panel they can't use** — mitigated: preview works, Apply clearly shows the upgrade, and manual editing is offered inline.
- **Monthly quota edge cases** (window rollover, plan change mid-month) — covered by the shipped `site_ai`/`SiteAiUpdateUsage` tests; P2-2 adds the admin-path enforcement tests.
