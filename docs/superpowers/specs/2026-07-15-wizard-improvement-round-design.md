# Wizard Improvement Round — Design

**Date:** 2026-07-15
**Status:** Approved design, pending spec review
**Scope:** Eight improvements to the pre-provision onboarding wizard (`frontend-main/src/app/signup/verify/wizard/`, `backend/apps/core/onboarding/`), from the owner's second live-testing round.

## Goal

Make the wizard's previews big enough to actually read, make every choice honestly change the generated site, and let the coach's own words shape the copy through AI follow-up questions.

## Two corrections to the verbally-approved design

Facts found after approval that change two items — both make the wiring *more* honest, not less:

1. **There is no blog on/off gate.** `apps/blog` has `BlogPost`, `BlogTopicIdea`, and `BlogAutopilot` — the `is_enabled` field belongs to `BlogAutopilot` (the hands-off AI generation schedule), which must NOT be silently enabled at provisioning (it spends AI budget on the coach's behalf). The public Blog nav link already appears automatically once the first post is published (`frontend-customer/src/app/(public)/layout.tsx`: `blogEnabled = posts.length > 0`). So the `write_blog` goal wires into the **setup assistant checklist** ("Write your first blog post"), not a config flag or a static nav link (which would render an empty page until a post exists).
2. **No static Community nav link from compose.** `public-header.tsx` already appends a Community entry dynamically for signed-in members of a community-enabled tenant. A second, static link in `navbar_config.links` would duplicate it for members and dead-end anonymous visitors (community views require login). The community fix is therefore: live-verify the existing provisioning enable + a goal-driven setup item + the review step naming what gets enabled (§3).

## Current state (verified in code)

- `WizardShell` is one centered column: 520px for list steps, 760px (`wide`) for pages steps. Steps auto-advance on single-select picks.
- `wizard_catalog.py` is the single source of truth; frontend renders from `GET /onboarding/wizard/catalog/`; `validate_answers` rejects unknown keys.
- `PAGE_LAYOUTS`: exactly 2 options per page × 6 pages. Layout thumbnails are real screenshots from `tools/wizard-mockups/` (scratch tenant `wizard_mockups`, yoga niche) with `MiniPageSketch` fallback.
- `NAVBAR_LAYOUTS` = 3 of the 5 presets the serializer accepts (`classic, centered, split, minimal, pill`).
- `HERO_STYLES` (`centered, split, minimal`) preview via the abstract `MiniHero`.
- Themes preview as 3 color swatches; ranked 3 + "show all".
- `description` feeds `ai_compose._brief()` at provisioning (AI rewrite of page copy; static fallback when AI unavailable). No follow-up questions exist.
- `build_community` → `community` in `enabled_modules` (inert) AND `provision_tenant` flips `CommunitySettings.is_enabled` (`tasks.py:118-124`). Members-only nav entry. The owner's "community not enabled" report is most plausibly the stale-celery-worker gotcha (celery does not hot-reload; documented in memory) — must be re-verified live with a fresh worker.
- Curated logos: `LogoStep` renders a niche-ranked grid of up to 8 when `CuratedLogo` rows exist; `make seed` already runs `seed_curated_logos`. The owner's empty-section report matches a never-seeded local DB.
- Existing wizard AI endpoints (`wizard_logo.py`) set the guard pattern: wizard-token auth, `ipblock.blocked_response`, `WizardLogoThrottle` (ClientIpAnonThrottle subclass), spend recorded per tenant-schema.

---

## 1. Roomier layout, bigger previews (all steps)

**Frontend only** (`WizardShell.tsx`, step components).

- Column widths: list steps 520 → ~640px; `wide` steps 760 → ~1100px capped at ~94vw. The framer `layout` morph between them stays.
- `wide` now applies to: pages steps (as today) + theme + hero (both gain screenshot previews, §4/§6). Navbar and font steps stay at list width but with larger previews (a 1100px-wide navbar bar preview would look stretched-empty).
- Option grids with 3+ visual options render `grid-cols-2 md:grid-cols-3`; the shell's existing `overflow-y-auto` provides scrolling. FAQ and all other pages steps inherit automatically.
- `MiniNavbar` / `MiniHero` scale up proportionally (exact px chosen at implementation; MiniHero roughly h-20 → h-28+).
- Acceptance: at 1440×900 the pages-step screenshots render ≥ ~480px wide each and the text inside captured screenshots is legible; no horizontal scrolling at 375px mobile width.

## 2. AI follow-up questions after "Describe what you do"

**New backend endpoint.** `POST /api/v1/onboarding/wizard/describe-followups/` in `apps/core/onboarding/` (views or a sibling module, matching `wizard_logo.py` structure):

- Auth/guards: wizard-token verification (same as other wizard endpoints), `@authentication_classes([])`, `ipblock.blocked_response`, a new `WizardFollowupThrottle` (ClientIpAnonThrottle, ~10/min).
- Input: `{description: str}` (≤ `DESCRIPTION_MAX_LEN`). Output: `{questions: [str]}` with 0–2 items, each ≤ 200 chars.
- Implementation: one `core_ai.structured()` call (pydantic schema `{questions: list[str]}`), locale-aware (EN/TR from the wizard token's tenant locale, same source `ai_compose` uses). Prompt: given the coach's self-description, ask up to 2 short, concrete questions whose answers would let a copywriter personalize the site (e.g. audience, differentiator); never ask for facts already stated.
- Returns `{questions: []}` (HTTP 200, never an error the UI must handle) whenever: `compose_available()` is false (AI off / budget hit), description is empty, the AI call fails, or it times out (short cap, ~15s server-side).
- Spend recorded in `OnboardingAiUsage` (same table/monthly budget as ai_compose — this endpoint must respect and count toward `ONBOARDING_AI_MONTHLY_BUDGET_USD`).

**Answers schema** (`wizard_catalog.py`): new key
`description_followups: {"for": str, "items": [{"q": str, "a": str}]}`
- `for` = the description text that produced the questions (≤ `DESCRIPTION_MAX_LEN`) — lets the client decide whether to regenerate.
- `items`: max 2; `q` ≤ 200 chars, `a` ≤ 500 chars. Validated in `validate_answers`; `recommended_answers` includes it as absent/empty (finalize-with-gaps unaffected).

**Frontend flow** (`machine.ts`, `WizardFlow.tsx`, `steps.tsx`):
- New step `business.followups` (chapter `business`), present in `buildSteps` only when `answers.description_followups?.items?.length > 0`.
- On Continue from describe with a non-empty description: if stored `description_followups.for` equals the current description, go straight to the stored followups step (or goals if none). Otherwise call the endpoint (client timeout ~20s with the Continue button in its busy state); non-empty questions → commit `description_followups = {for, items: [{q, a: ""}]}` and advance to `business.followups`; empty questions → commit the description and advance to goals as today.
- The followups step renders each question as a labeled optional text input + Continue (no auto-advance — free text). Answers commit into `description_followups.items[].a`. Empty answers are fine.
- Resume: stored questions re-render on reload; "finish the rest for me" leaves them as-is.
- E2e/dev: with no AI provider configured the endpoint returns `[]`, the step never appears, and existing signup specs pass unchanged — confirm this explicitly.

**AI brief** (`ai_compose._brief`): after the "In their own words" line, append one line per answered item:
`Asked: "<q>" — coach answered: "<a>"` (skip items with empty `a`).

## 3. Offers step: community visibility + new goals

**New goals** in `wizard_catalog.GOALS` (+ EN/TR labels in `wizard.json`):
- `write_blog` ("Share articles & tips") — no module/flag change at provisioning (see correction #1); adds a **setup assistant item** "Write your first blog post".
- `send_announcements` ("Send announcements & updates") — maps to the always-on announcements feature; adds a setup item "Send your first announcement". Honest label: picking it changes the checklist, not the site.

**Setup assistant** (`apps/tenant_config/setup_items.py`): `compute_setup_state` gains goal-driven optional items sourced from `tenant.wizard_state` answers: `write_blog` → blog item (auto-done when a `BlogPost` exists), `send_announcements` → announcement item (auto-done when an `Announcement` exists), `build_community` → "Say hello in your community" item (auto-done when the coach has posted; exact auto-signal chosen at implementation from the community models). Tenants provisioned before this change (or without those goals) see no new items.

**Community verification (not new code):** with a freshly-restarted celery worker, run a wizard signup picking `build_community` and verify `CommunitySettings.is_enabled` is true in the new tenant schema and the Community nav entry appears for a signed-in member. If this fails on fresh code, root-cause before adding anything (systematic-debugging), and record the finding in the plan.

**Review step:** the goals row already lists picked goals; no change needed beyond the new goal labels appearing there automatically.

## 4. Colors step: real screenshot per theme

**Capture tooling** (`tools/wizard-mockups/`, `backend/.../management/commands/`):
- Extend the scratch-tenant tooling with a way to set the **theme** (either a new `set_wizard_mockup_theme <theme>` command or a generalized `set_wizard_mockup_state` — implementer's choice, but it must reuse the two cache workarounds already documented in the 2026-07-14 plan: `cache.delete(f"tenant:<schema>:config")` after ORM writes, and one extra `Domain` row per capture target for the frontend-customer 60s config cache; `seed_wizard_mockup_tenant` grows `wm-theme-<id>.<CONTENTOR_DOMAIN>` domains).
- `capture.mjs` captures the home page (recommended layout, default hero) once per theme → `frontend-main/public/wizard-mockups/theme-<id>.png` (6 files, same 800px-wide downscale spec as layouts). Capture order note: theme captures must reset the theme afterwards (or run last) so layout/hero captures stay on the yoga niche's default theme.

**Frontend** (`ThemeStep`): each card renders `theme-<id>.png` inside `BrowserFrame`, with the current 3-swatch strip as the `onError` fallback AND kept as a small strip below/beside the screenshot (the swatch is the color-truth; the screenshot is the vibe). Ranked-3 + "show all" behavior unchanged; step becomes `wide` with a 2/3-col grid.

## 5. Menu step: all 5 navbar presets

- `wizard_catalog.NAVBAR_LAYOUTS` → `("classic", "centered", "split", "minimal", "pill")` (matches `_NAVBAR_LAYOUTS` in `apps/tenant_config/serializers.py`).
- `MiniNavbar` gains `split` and `pill` renderings that visually match what the customer frontend's header actually does for those presets (check `public-header.tsx` before drawing them — the preview must not misrepresent the choice, cf. the Split-hero centering gotcha).
- EN/TR labels `navbarLayouts.split` / `navbarLayouts.pill` in `wizard.json`.
- `recommended_answers` keeps `classic`.

## 6. Welcome (hero) step: real screenshots

- Capture tooling: set `hero_style` on the scratch tenant (same command family + cache workarounds + `wm-hero-<style>` domains); capture the **top of the home page** (viewport-clipped to the hero region, exact clip chosen at implementation) per style → `hero-<style>.png` (3 files).
- `HeroStep`: cards render the screenshot in `BrowserFrame` with `MiniHero` as fallback; step becomes `wide`, 3-col grid on desktop. Labels/desc strings stay (they now caption a real image instead of substituting for one).

## 7. One new layout per page (2 → 3 options × 6 pages)

New `PAGE_LAYOUTS` entries composed **only from existing block builders** in `compose.py` (no new block types). Working set (final block mixes may be tuned during implementation, staying within existing builders):

| Page | New layout id | Blocks |
|---|---|---|
| home | `home-complete` | hero, imageText, courseGrid, testimonials, faq, cta |
| about | `about-warm` | imageText, richText, faq |
| courses | `courses-social` | courseGrid, testimonials, cta |
| pricing | `pricing-trust` | pricingPlans, testimonials, cta |
| faq | `faq-support` | faq, contact |
| contact | `contact-reassure` | contact, faq |

Each requires: catalog entry, `_build_pages` branch, EN/TR label `layouts.<id>`, capture entry in `capture.mjs` `LAYOUTS`, captured PNG. Home-goal blocks still splice after `courseGrid` (`thumbnailBlocks` + compose `_goal_blocks` handle this without change). The pages steps render 3 cards (`md:grid-cols-3` at the new `wide` width). `home_goal_blocks` thumbnails and the recommended-first badge behavior are unchanged.

Block-id caution: layouts that repeat a block type on one page must keep ids unique (existing builders parametrize `block_id` — reuse that; e.g. faq on the contact page needs a non-default id).

## 8. Curated logos: verify + prominence

- `make seed` already seeds the catalog — no seeding code change. Verify in dev that after `make seed` the wizard's curated grid renders with images.
- `LogoStep`: bump the shown grid 8 → 12 to fill the wider column.
- Ops note (not this change): prod must have run `seed_curated_logos` (part of `make seed`) or the section hides itself — record in deploy checklist.

---

## Data & compatibility

- `Tenant.wizard_state.answers` gains `description_followups` and the two new goal values — both optional; existing in-flight wizards (7-day tokens) resume fine because `validate_answers` only sees keys the client sends and old clients never send the new ones.
- No DB migrations. No changes to `creator_signup`, verification, checkout, or the logo AI flow.
- Screenshot assets: 6 theme + 3 hero + 6 new layout PNGs added; existing 12 layout PNGs kept (800px-wide spec already sufficient for the larger rendering).

## Testing & verification

- **Backend pytest:** `validate_answers` for `description_followups` (shape, caps, unknown-key rejection still intact); followups endpoint (mocked `core_ai`: questions returned, empty on AI-off/budget/failure, throttle + ipblock wired — mirror the wizard_logo endpoint tests); compose: new-goal module mapping unchanged for old goals, new layout block sequences per page; setup items: goal-driven items appear/auto-complete; `set_wizard_mockup_*` additions (mirror `test_set_wizard_mockup_layout.py`).
- **AI brief:** unit test that answered follow-ups appear in `_brief` output and empty answers are skipped.
- **Frontend:** `docker compose exec nextjs-main npm run build` (no test runner exists in frontend-main — per the 2026-07-14 plan precedent, component behavior verifies via build + browser).
- **Browser walk:** full wizard click-through in dev (AI off → followups step absent) covering the wider layout at desktop + 375px, all-new screenshots rendering, 5 navbar options, 3 layouts per page, curated logo grid after `make seed`.
- **Screenshot review:** every generated PNG (15 new + any recaptures) individually viewed, not sampled.
- **Community live-verify:** fresh celery worker, wizard signup with `build_community`, assert `CommunitySettings.is_enabled` + member nav entry.
- **E2e:** `make e2e` signup specs must pass unchanged (followups step absent with AI off; auto-advance semantics untouched). Update selectors only if the goals list growth breaks a substring match (known trap: `getByRole` name matching is substring — check new goal labels don't collide).
- `make lint` clean on all touched files.

## Out of scope

- New block types (community teaser block etc.), prod deploy, prod AI keys, enabling `BlogAutopilot`, iyzico, any change to the post-launch admin's own pickers.

## Risks

- **Follow-ups latency:** the describe→followups call blocks the Continue press up to the client timeout. Mitigation: busy state on the button, hard client timeout, server returns `[]` on any failure.
- **Prompt quality:** bad follow-up questions are worse than none. The prompt forbids questions already answered by the description; cap at 2; EN/TR reviewed by the owner before launch (TR native review caveat, same as other wizard strings).
- **Capture drift:** theme/hero/layout captures mutate shared scratch-tenant state; the capture script must be strictly sequential and reset state between capture groups (documented caching gotchas apply).
- **Goals list growth** makes the goals step taller; the shell scrolls, but verify 375px mobile.
