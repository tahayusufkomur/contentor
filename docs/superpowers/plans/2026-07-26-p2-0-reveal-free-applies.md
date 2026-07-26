# P2-0: Reveal Free-Applies 3 → 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tighten the onboarding reveal from three free AI refinement applies to one, so "one free AI design" is the honest framing: the reveal still auto-generates the site free for everyone, plus a single free refinement.

**Architecture:** One backend constant governs the reveal's free-apply budget (`REVEAL_FREE_APPLIES` in `wizard.py`), and the frontend mirrors it in `reveal-chat.tsx` (there is no shared source — the mirror is deliberate and commented). This plan changes both, updates the copy that says "refinements" plural, and rewrites the one existing test that asserts the old three-apply budget.

**Tech Stack:** Django 5.1, DRF, pytest, Next.js 14, next-intl.

## Why this plan exists

Phase 2 (`docs/superpowers/specs/2026-07-26-onboarding-phase2-design.md`, decision 4) reduces the reveal grant to one free refinement now that the admin Site AI panel (P2-2) carries the ongoing monetized quota. The reveal must stay generous enough to feel magical (the auto-design is still free and automatic) without giving away three edits before the coach ever sees a paywall.

**Verified facts** (file:line):
- `REVEAL_FREE_APPLIES = 3` — `backend/apps/core/onboarding/wizard.py:30`; used by `wizard_site_edit_apply` (same file, ~line 362-388) which 402s once `wizard_state["reveal_applies_used"]` reaches it.
- The frontend mirrors it: `const REVEAL_FREE_APPLIES = 3;` — `frontend-main/src/app/signup/verify/wizard/reveal-chat.tsx:19`, with a comment at line 16 noting there is no shared source.
- The existing test loops `for expected_remaining in (2, 1, 0)` then asserts a 402 — `backend/apps/core/tests/test_site_ai.py:116-130`.
- Copy lives in `frontend-main/messages/{en,tr}/wizard.json` under `wizard.revealChat`: `"remaining": "Free refinements left: {count}"`, `"exhausted": "You've used your free refinements for now — you can still publish anytime."`

## Global Constraints

- **Both constants must move together.** A backend/frontend mismatch shows the coach a wrong "left" count until their first apply. The frontend comment at `reveal-chat.tsx:16` documents this coupling — keep it accurate.
- **Exhaustion must never block Publish.** The 402 path is a soft stop for further refinement only; the Publish button stays available (existing behavior — do not change it).
- **Copy must read singular.** With a budget of one, "Free refinements left: 1" is clumsy — the copy changes to a singular framing in both locales.
- Tests run in Docker: `docker compose exec django pytest <path> -n auto` with the dev stack up (`make dev`). Frontend typecheck: `make typecheck`.

## File Structure

| File | Change | Responsibility |
|------|--------|----------------|
| `backend/apps/core/onboarding/wizard.py:30` | modify | `REVEAL_FREE_APPLIES = 1` + docstring wording. |
| `backend/apps/core/tests/test_site_ai.py:110-130` | modify | Rewrite the apply-budget test for a one-apply budget. |
| `frontend-main/src/app/signup/verify/wizard/reveal-chat.tsx:19` | modify | Mirror constant → 1. |
| `frontend-main/messages/en/wizard.json` | modify | Singular `revealChat.remaining` / `exhausted` copy. |
| `frontend-main/messages/tr/wizard.json` | modify | Same, Turkish. |

---

### Task 1: Reduce the reveal budget to one free apply

**Files:**
- Modify: `backend/apps/core/onboarding/wizard.py:30` and the `wizard_site_edit_apply` docstring
- Modify: `backend/apps/core/tests/test_site_ai.py` (the apply-budget test)
- Modify: `frontend-main/src/app/signup/verify/wizard/reveal-chat.tsx:16-19`
- Modify: `frontend-main/messages/en/wizard.json`, `frontend-main/messages/tr/wizard.json`

**Interfaces:**
- Consumes: nothing new.
- Produces: `REVEAL_FREE_APPLIES == 1` on both sides. `POST /api/v1/onboarding/wizard/site-edit/apply/` returns `{"remaining": 0}` on the first apply and `402 {"detail": "reveal_quota_exhausted", "remaining": 0}` on the second.

- [ ] **Step 1: Rewrite the failing test**

In `backend/apps/core/tests/test_site_ai.py`, replace the existing apply-budget test (the one that loops `for expected_remaining in (2, 1, 0):` and then asserts 402 — around lines 110-130) with this. Keep the file's existing fixtures/helpers (`_prov`, `_drop`, `client`) exactly as they are; only this test body changes:

```python
def test_reveal_apply_allows_exactly_one_free_apply(restore_public, client):
    """One free refinement at the reveal (Phase 2 decision 4): the first apply
    succeeds and reports 0 left; the second is a soft 402 that never blocks
    Publish."""
    from apps.accounts.tokens import create_wizard_token

    t = _prov("site_ai_reveal_one")
    try:
        token = create_wizard_token(t.owner_email, t.name, t.slug, region=t.region)
        with mock.patch("apps.core.onboarding.wizard._apply_last_preview"):
            first = client.post(
                "/api/v1/onboarding/wizard/site-edit/apply/",
                {"token": token, "pages": {"home": {"blocks": []}}},
                format="json",
            )
            assert first.status_code == 200, first.content
            assert first.json()["remaining"] == 0

            second = client.post(
                "/api/v1/onboarding/wizard/site-edit/apply/",
                {"token": token, "pages": {"home": {"blocks": []}}},
                format="json",
            )
            assert second.status_code == 402
            assert second.json()["remaining"] == 0
    finally:
        _drop("site_ai_reveal_one")
```

If the existing test's name differs, replace it by name rather than by line number — search for `reveal_apply` in the file. Do not leave the old three-apply test in place; it asserts behavior this plan intentionally changes.

- [ ] **Step 2: Run the test to verify it fails**

Run: `docker compose exec django pytest apps/core/tests/test_site_ai.py -k reveal_apply -v`

Expected: FAIL — the first apply returns `remaining: 2` (not `0`) because the budget is still 3, so the `== 0` assertion fails.

- [ ] **Step 3: Change the backend constant**

In `backend/apps/core/onboarding/wizard.py`, line 30:

```python
# One free AI refinement at the reveal (Phase 2 decision 4). The auto-generated
# design itself is always free; this budgets follow-up chat edits. The ongoing
# monthly allowance lives on the plan (max_site_ai_updates) and is enforced by
# the admin Site AI panel, not here.
REVEAL_FREE_APPLIES = 1
```

Then update the `wizard_site_edit_apply` docstring, which currently says "decrementing the reveal's 3 free applies":

```python
    """Persist the last-previewed pages, decrementing the reveal's single free
    apply. 402 (not a hard block — Publish stays available) once spent; the
    admin Site AI panel enforces the monthly plan quota separately."""
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `docker compose exec django pytest apps/core/tests/test_site_ai.py -k reveal_apply -v`

Expected: PASS.

- [ ] **Step 5: Mirror the constant on the frontend**

In `frontend-main/src/app/signup/verify/wizard/reveal-chat.tsx`, update the mirrored constant and keep its comment accurate (lines 16-19):

```tsx
// Mirrors apps/core/onboarding/wizard.py's REVEAL_FREE_APPLIES — there is no
// shared source between the Django app and this bundle, so the two must be
// changed together; a mismatch shows a wrong "left" count until the first apply.
const REVEAL_FREE_APPLIES = 1;
```

Also update the file's header comment (lines 6-8), which says "spends one of the reveal's 3 free applies" — change "3 free applies" to "single free apply".

- [ ] **Step 6: Update the copy in both locales**

In `frontend-main/messages/en/wizard.json`, under `wizard.revealChat`:

```json
      "remaining": "Free refinements left: {count}",
      "exhausted": "That was your free refinement — you can still publish anytime, and unlock more with a paid plan.",
```

Keep the `remaining` key parameterized (the component passes `{count}`) — with a budget of 1 it renders "Free refinements left: 1" before the apply and is replaced by `exhausted` after, so it stays correct.

In `frontend-main/messages/tr/wizard.json`, the same keys:

```json
      "remaining": "Kalan ücretsiz düzenleme: {count}",
      "exhausted": "Bu ücretsiz düzenlemenizdi — istediğiniz zaman yayınlayabilir, daha fazlası için ücretli plana geçebilirsiniz.",
```

- [ ] **Step 7: Verify the frontend**

Run: `make typecheck`

Expected: PASS, both apps.

Run: `cd frontend-main && node ../scripts/check-i18n-parity.mjs` — or, if that script is invoked differently, simply `make lint` (which includes the i18n parity check).

Expected: no missing-key errors between `en` and `tr`.

- [ ] **Step 8: Verify nothing else regressed**

Run: `docker compose exec django pytest apps/core/tests/test_site_ai.py -v`

Expected: PASS (all site-AI tests, including the monthly-metering ones which are unaffected).

Run: `make lint`

Expected: exit 0.

- [ ] **Step 9: Commit**

```bash
git add backend/apps/core/onboarding/wizard.py backend/apps/core/tests/test_site_ai.py frontend-main/src/app/signup/verify/wizard/reveal-chat.tsx frontend-main/messages/en/wizard.json frontend-main/messages/tr/wizard.json
git commit -m "feat(reveal): one free AI refinement at the reveal, down from three"
```

---

## Verification before calling this plan done

- [ ] `docker compose exec django pytest apps/core/tests/test_site_ai.py -n auto` passes.
- [ ] `make typecheck` and `make lint` pass.
- [ ] `grep -rn "REVEAL_FREE_APPLIES = " backend frontend-main` shows `1` in both places.
- [ ] Manual (optional, needs a dev signup at the reveal): the chat shows one free refinement, and after applying it the exhausted copy appears while the Publish button stays enabled.

## Where this sits in Phase 2

| Plan | Scope | Depends on |
|------|-------|------------|
| **P2-0 — Reveal free-applies 3→1** (this one) | constant + copy + test | Phase 1 (merged) |
| P2-1 — Nav stage-gating | Marketing lock, unlock celebration, Content "+ More" | Phase 1 Plan 2 (merged) |
| P2-2 — Admin Site AI panel | `/admin/site-ai`, monthly quota enforcement | Phase 1 Plan 5 (merged) |
| P2-3 — Conditional editor de-emphasis | My Site "Advanced editing" for paid coaches | P2-1 |
