# /setup: In-Person Class Address and What a Membership Covers: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In /setup, a coach who teaches in person gives the place and street address inside the class section and reviews that class; and for her first course, class and article she chooses who gets it (free, bought on its own, or included in the memberships she picked), and the paywall honours that choice.

**Architecture:** Phase A moves the `location` question into the class section as a two-box address screen that only code can fill, and gives the in-person class drafted beside an online one its own review field. Phase B adds one fixed-option question per section (`course_access`, `event_access`); the answer drives each draft's pricing type and its `SubscriptionPlanAccess` rows through one idempotent `sync_access()`, the paywall learns that members-only content linked to plans is unlocked only by those plans, classes get a members-only pricing type, and the plan editor is fixed so it shows and keeps what is linked. Phase C gives `BlogPost` the same `pricing_type` field so the same paywall gates it, serves a teaser to everyone else, and adds `post_access`.

**Tech Stack:** Django 5.1, DRF and pytest (run in the `django` container); Next.js 14 with vitest; Playwright for e2e. The repo has no DOM testing library: frontend tests cover pure functions in `lib/`, and click behaviour is checked in the browser at each phase gate.

**Spec:** the owner's two points of 2026-10-10 (given in chat) and the three decisions below. There is no separate spec file.

## Decisions

Taken by the owner on 2026-10-10:

| Question | Decision |
|---|---|
| Coach offers online and in person | One pass: topic, schedule and price asked once, plus the address. Both classes are drafted and each has a review screen. |
| How the interview asks what a membership covers | Per item: "How do students get this?" on the first course, class and article. |
| Members-only articles | In this plan, as the last phase. |

Defaults chosen while planning. Each is one line to flip; say so before the phase starts:

1. The access question is asked only when she picked at least one membership. Without one, nothing changes from today.
2. One access answer covers both classes. A membership built on one format (Online, Studio) takes only the class of that format.
3. The place name stays public; the street address is stored on the class and shown only to students who can attend (what `OnsiteEventSerializer` already does). The address is not put on the Contact page.
4. The in-person class beside an online one still picks its own date (the schedule is the online class's). She changes it on its review screen.
5. An article is free or members-only. There is no one-off purchase of an article.
6. "Pick for me" on an access question gives what the membership catalogue means: a course in every membership with courses, a class in the membership of its format, an article free.
7. **Behaviour change:** a course that is in a membership and not sold on its own is created members-only (`pricing_type="subscription"`). Today it is created free, so anyone can open it without subscribing.
8. **Behaviour change:** `LiveClass` and `OnsiteEvent` get a third pricing type, `subscription` ("Members only"). Migration `live/0015_simplify_pricing_type` folded that value into `paid`; this brings it back for these two models only (not `LiveStream`, not `ZoomClass`).

## Found while planning

- **The plan editor wipes memberships today.** `GET /api/v1/billing/plans/<id>/access/` returns a list, and `admin/billing/plans/[id]/page.tsx` reads `accessData.items`, which is always undefined. The editor opens with nothing ticked, and Save replaces every link with an empty list. Task 5 and Task 6 fix it, because the interview's links are what this plan builds.
- **A paid in-person class cannot be bought online.** The event page shows "Buy Access" linking to `/store`, and the store, checkout and bundles do not know the `OnsiteEvent` type. Not in this plan: "Pay per class" on an in-person class sets and shows a price, as it does today. It needs its own change.
- **Membership descriptions stay the catalogue's.** A plan's description is written from its tier's perks when the plan is created. If she takes her course out of the Digital membership, its description still says "Every digital course". Not in this plan.

## Before Task 1: the shared working tree

`git status` on 2026-10-10 shows a peer's uncommitted work in `backend/apps/core/` (`copilot/photos.py`, `curated_images/client.py`, `onboarding/ai_photos.py`, `onboarding/site_composer.py`, `tasks.py` and their tests) and in `AGENTS.md` and `CLAUDE.md`. This plan edits none of those files. Stage by explicit path in every commit and check `git diff --cached --stat` first. Never run a formatter over files you did not change.

## Global Constraints

- Coaches are non-technical. UI copy has no raw codes, slugs or field ids.
- Guide copy is plain and warm, with no exclamation marks and no flattery (`interview.SYSTEM`).
- Loading and feedback follow root `CLAUDE.md`: `<Button loading>`, `useAsyncAction`, sonner toasts, inline field errors, `<NavLink>` for internal links, CSS-only motion gated by `motion-safe:`.
- Setup-flow colours come from the `--sf-*` tokens in `tokens.ts`. The only exception is `text-destructive` for inline field errors.
- Commit by path, and only once the owner has said to commit (`CLAUDE.md`). Ask at the Phase A gate; the answer covers the rest of the plan.
- One heavy job at a time. Per task run the focused test file. Run `make test-changed`, `make test-frontend`, `make typecheck` and `make lint` once per phase, at its gate.
- Backend single test: `docker compose exec django pytest apps/<app>/tests/<file>.py::<name> -q`. Frontend single file: `cd frontend-customer && npx vitest run <path>`.
- After any serializer change: `cd frontend-customer && npm run gen:api`, then read the `src/types/api-generated.ts` diff.
- After a new migration: `make migrate`, then `make test-fresh` once to rebuild the test database.
- `apps/core/access.py` is shared runtime code. Run GitNexus `impact` on `ContentAccessService.get_access_info` before Task 4 and report the blast radius.
- If a celery worker is running, restart it after editing `interview_milestones.py` or `setup_flow.py` (`docker compose restart celery-worker`); a stale worker drafts with the old code.

## Review Focus

1. **She mentioned her studio earlier in the chat.** The address screen still appears, and the model can never fill it. Pinned by Task 1 (`test_the_model_cannot_fill_the_address`).
2. **A student on a different membership.** A student on the Community membership opens a course that only the Digital membership includes: no access, and only the Digital plan is offered. Pinned by Task 4.
3. **She goes back and changes who gets the course after it was drafted.** Its pricing and its plan links follow on the next turn, nothing is doubled, and content she linked to a plan by hand is untouched. Pinned by Task 8.
4. **She opens a membership in the admin and presses Save.** What the interview linked is shown ticked and survives the save. Pinned by Task 5's API test; the save itself is walked in the browser at the Phase B gate.
5. **A members-only article.** Its full text is in no anonymous response and not in the page's HTML for a visitor. Pinned by Task 9.

---

## File map

| File | Phase | What changes |
|---|---|---|
| `backend/apps/tenant_config/interview_brief.py` | A, B, C | `location` becomes the address field; `onsite_review`; the access fields, their options and `access_of()` |
| `backend/apps/tenant_config/interview_milestones.py` | A, B, C | address pick, in-person review card, `sync_access()` replaces `grant_membership()` |
| `backend/apps/tenant_config/interview.py` | A, B | `address` guide key, `prefill_for()`, access wording |
| `backend/apps/tenant_config/setup_flow.py` | A, B, C | drafts carry the address and the pricing type her answer means |
| `backend/apps/tenant_config/interview_golive.py` | B | "costs money" means not free, not only paid |
| `backend/apps/core/access.py` | B | linked members-only content is unlocked only by its plans |
| `backend/apps/live/models.py` + migration | B | `subscription` pricing type on `LiveClass`, `OnsiteEvent` |
| `backend/apps/billing/serializers/plans.py`, `views/plans.py`, `views/store.py` | B, C | in-person classes and articles in plans; the editor's read shape; linkable products |
| `backend/apps/blog/models.py` + migration, `serializers.py`, `views.py`, `urls.py` | C | `pricing_type`, teaser, members' full text |
| `frontend-customer/src/lib/setup-flow.ts`, `lib/interview.ts` | A, B, C | types, `SECTIONS`, `addressOk` |
| `frontend-customer/src/components/setup-flow/question-screen.tsx`, `draft-review.tsx` | A | address boxes, in-person review |
| `frontend-customer/src/app/admin/billing/plans/[id]/page.tsx`, `components/billing/content-picker.tsx` | B, C | read what is linked; new types |
| `frontend-customer/src/components/public/calendar/event-detail-client.tsx`, `public/events/events-list.tsx`, `admin/live/*` | B | "Members only" label and option |
| `frontend-customer/src/app/(public)/blog/[slug]/page.tsx`, `lib/blog-public.ts`, `app/admin/blog/[id]/page.tsx` | C | teaser and paywall, members-only switch |
| `e2e/specs/01-signup-onboarding.spec.ts` | A | the robot fills the address boxes if it meets them |

---

# Phase A: the in-person class

### Task 1: The address question, in the class section (backend)

**Files:**
- Modify: `backend/apps/tenant_config/interview_brief.py` (`CARD_KINDS` line 25, the `live_topic` field near line 692, the `location` field at lines 758-764)
- Modify: `backend/apps/tenant_config/interview_milestones.py` (`DRAFT_NEEDS` lines 34-40, `choose()` after the schedule branch near line 887)
- Modify: `backend/apps/tenant_config/setup_flow.py` (`_create`, the `event_kind == "onsite"` branch near line 519)
- Modify: `backend/apps/tenant_config/interview.py` (`GUIDE_KEYS`, `guide_for`, `contact_prefill`, `interview_state`)
- Test: `backend/apps/tenant_config/tests/test_interview_brief.py`, `test_interview_milestones.py`, `test_interview.py`

**Interfaces:**
- Produces: `answers["location"]` (place name, public) and `answers["address"]` (street address); the guide key `address: bool`; `interview.prefill_for(field_id, answers) -> dict`; `interview_milestones.apply_address(answers) -> None`. The address choice value is the JSON object `{"Place": str, "Address": str}`.

- [ ] **Step 1: Write the failing tests**

In `test_interview_brief.py`:

```python
def test_the_address_is_asked_in_the_class_section_for_in_person_coaches():
    answers = {"offers": ["onsite"], "payments": ["free"]}
    ids = [f.id for f in brief.required(answers)]
    assert ids.index("live_when") < ids.index("location") < ids.index("event_review")
    assert "location" not in [f.id for f in brief.required({"offers": ["live"], "payments": ["free"]})]
    # Skipping the class skips its address.
    assert "location" not in [f.id for f in brief.required({**answers, "skipped": ["event"]})]


def test_the_model_cannot_fill_the_address():
    answers = {"offers": ["onsite"]}
    assert brief.apply_fact(answers, "location", "My studio in Kreuzberg") is False
    assert "location" not in answers
```

In `test_interview_milestones.py` (below the `HOME` constant, add `IN_PERSON`; the tests go at the end of the file):

```python
IN_PERSON = {
    **HOME,
    "offers": ["course", "onsite"],
    "payments": ["free"],
    "live_topic": "Pad work",
    "live_when": "Saturdays at 10",
}
ADDRESS = '{"Place": "Studio 4", "Address": "Hauptstr. 12, 10827 Berlin"}'


def test_the_class_draft_waits_for_the_address(tenant_ctx, config, side_effects, django_capture_on_commit_callbacks):
    with django_capture_on_commit_callbacks(execute=True):
        assert "draft:event" not in ms.fire(tenant_ctx, dict(IN_PERSON))
        fired = ms.fire(tenant_ctx, {**IN_PERSON, "location": "Studio 4", "address": "Hauptstr. 12"})
    assert "draft:event" in fired


def test_the_address_pick_needs_both_boxes(tenant_ctx, config):
    answers = {"offers": ["onsite"]}
    ms.choose(tenant_ctx, answers, "location", ADDRESS)
    assert (answers["location"], answers["address"]) == ("Studio 4", "Hauptstr. 12, 10827 Berlin")
    with pytest.raises(ms.ChoiceError, match="invalid_address"):
        ms.choose(tenant_ctx, {"offers": ["onsite"]}, "location", '{"Place": "Studio 4", "Address": " "}')


def test_the_in_person_class_carries_the_address_and_follows_a_change(tenant_ctx, config, owner):
    from apps.live.models import OnsiteEvent

    answers = {**IN_PERSON, "location": "Studio 4", "address": "Hauptstr. 12, 10827 Berlin"}
    brief.save_answers(tenant_ctx, answers)
    with mock.patch("apps.core.copilot.content._give_cover"):
        setup_flow.create_fallback_draft(tenant_ctx, owner, "event", answers)
    row = OnsiteEvent.objects.get()
    assert (row.location, row.address) == ("Studio 4", "Hauptstr. 12, 10827 Berlin")
    # She goes back and moves it: the drafted class moves too.
    ms.choose(tenant_ctx, answers, "location", '{"Place": "The Loft", "Address": "Kanalstr. 3"}')
    row.refresh_from_db()
    assert (row.location, row.address) == ("The Loft", "Kanalstr. 3")
```

In `test_interview.py`:

```python
def test_the_address_question_is_two_boxes_and_opens_on_what_she_gave():
    guide = interview.guide_for(brief.FIELD_BY_ID["location"], answers={"offers": ["onsite"]})
    assert guide["address"] is True and guide["options"] == [] and guide["can_delegate"] is False
    assert interview.prefill_for("location", {"location": "Studio 4", "address": "Hauptstr. 12"}) == {
        "Place": "Studio 4",
        "Address": "Hauptstr. 12",
    }
```

- [ ] **Step 2: Run them and see them fail**

Run: `docker compose exec django pytest apps/tenant_config/tests/test_interview_brief.py apps/tenant_config/tests/test_interview_milestones.py apps/tenant_config/tests/test_interview.py -q -k "address or in_person"`
Expected: FAIL (`location` sits after `event_review`; `apply_fact` returns True; `KeyError: 'address'`; `prefill_for` does not exist).

- [ ] **Step 3: Move the field and close it to the model (`interview_brief.py`)**

Line 25:

```python
# "address" is asked like a card: by code, in order, and never filled by the
# model (a place she mentioned in passing is not the address of her class).
CARD_KINDS = ("style", "logo", "course", "event", "address")
```

Delete the `location` field at the end of `FIELDS` and put this one between `live_when` and `event_price`:

```python
    Field(
        "location",
        "Where the in-person class happens",
        "Where does your in-person class take place?",
        kind="address",  # two boxes: the place, and its street address
        needs=("onsite",),
        group="event",
        why="The place shows on your site. The street address goes only to students who can attend.",
    ),
```

The class may be in person, so `live_topic` loses the word "live":

```python
        "Let's set up your first class. What should it focus on?",
```

`coerce()` already returns `None` for every `CARD_KINDS` field, so no change there.

- [ ] **Step 4: Take the pick and make the draft wait for it (`interview_milestones.py`)**

```python
DRAFT_NEEDS = {
    "course": ("course_topic", "payments", "course_price"),
    "event": ("live_topic", "live_when", "location", "payments", "event_price"),
    # An in-person class, drafted beside an online one (see _due).
    "onsite": ("live_topic", "live_when", "location", "payments", "event_price"),
    "post": ("article_topic",),
}
```

`brief.settled()` ignores fields that are not required, so an online-only coach is not held up.

In `choose()`, after the `field.kind == "schedule"` branch:

```python
    if field is not None and field.kind == "address":
        # The place and its street address: {"Place": "Studio 4", "Address": "Hauptstr. 12, Berlin"}.
        try:
            picked = json.loads(value) if isinstance(value, str) else value
        except ValueError:
            picked = None
        picked = picked if isinstance(picked, dict) else {}
        place = str(picked.get("Place") or "").strip()[: brief.TEXT_MAX]
        street = str(picked.get("Address") or "").strip()[: brief.TEXT_MAX]
        if not place or not street:
            raise ChoiceError("invalid_address")
        answers["location"], answers["address"] = place, street
        apply_address(answers)
        return
```

Below `apply_schedule()`:

```python
def apply_address(answers: dict) -> None:
    """An in-person class already drafted moves with its address (she went back)."""
    flow = TenantConfig.objects.first().setup_flow or {}
    for key in ("event", "onsite"):
        row = _draft_row(flow, key)
        if row is not None and hasattr(row, "address"):
            row.location, row.address = answers.get("location") or "", answers.get("address") or ""
            row.save(update_fields=["location", "address"])
```

- [ ] **Step 5: Write the address onto the draft (`setup_flow.py`, `_create`)**

Replace the `if event_kind == "onsite":` branch:

```python
        if event_kind == "onsite":
            from .interview_brief import answers_of

            # Where she said it happens: the model never writes an address.
            stated = answers_of(tenant)
            params["location"] = str(stated.get("location") or draft.location)[:500]
            params["address"] = str(stated.get("address") or "")
```

- [ ] **Step 6: Tell the screen it is an address (`interview.py`)**

Add `"address"` to `GUIDE_KEYS`. In `guide_for`, add `"address": False,` to the `field is None` dict and this to the main dict:

```python
        # The answer is a place and its street address, each in its own box.
        "address": field.kind == "address",
```

Replace `contact_prefill` with:

```python
def prefill_for(field_id, answers) -> dict:
    """What a question's boxes start with: the coach's signup email on the
    contact question, the address she gave when she goes back to it."""
    from apps.accounts.models import User

    if field_id == "location":
        return {k: v for k, v in (("Place", answers.get("location")), ("Address", answers.get("address"))) if v}
    if field_id != "contact":
        return {}
    owner = User.objects.filter(role="owner").order_by("id").first()
    return {"Email": owner.email} if owner and owner.email else {}
```

Update its two callers (`run_turn` and `interview_state`) to `prefill_for(guide["field"], answers)`. Run `grep -rn contact_prefill backend/` and update any test that names it.

In `interview_state`, the line that refreshes membership prices on past turns becomes:

```python
    # Membership prices and the address as she set them last, also on a question gone back to.
    priced = membership_prices("memberships", answers)
    address = prefill_for("location", answers)
    turns = [
        {**t, **priced}
        if t.get("role") == "guide" and t.get("field") == "memberships"
        else {**t, "prefill": address}
        if t.get("role") == "guide" and t.get("field") == "location"
        else t
        for t in turns
    ]
```

- [ ] **Step 7: Run the tests**

Run: `docker compose exec django pytest apps/tenant_config/tests/test_interview_brief.py apps/tenant_config/tests/test_interview_milestones.py apps/tenant_config/tests/test_interview.py -q`
Expected: PASS. A test that expected `location` to be the last question, or to take typed text, now fails for the right reason: update it to the new order and to the JSON pick.

- [ ] **Step 8: Commit**

```bash
git add backend/apps/tenant_config/interview_brief.py backend/apps/tenant_config/interview_milestones.py backend/apps/tenant_config/setup_flow.py backend/apps/tenant_config/interview.py backend/apps/tenant_config/tests/test_interview_brief.py backend/apps/tenant_config/tests/test_interview_milestones.py backend/apps/tenant_config/tests/test_interview.py
git commit -m "feat(setup): the in-person class asks for its place and address"
```

### Task 2: A review screen for the in-person class beside an online one (backend)

**Files:**
- Modify: `backend/apps/tenant_config/interview_brief.py` (`FIELDS` after `event_review`, `_NOT_FACTS`, `required()`)
- Modify: `backend/apps/tenant_config/interview_milestones.py` (`REVIEW_FIELDS` line 43, `review_card()` near line 753)
- Test: `test_interview_brief.py`, `test_interview_milestones.py`

**Interfaces:**
- Consumes: `IN_PERSON` and the address answers from Task 1.
- Produces: the field `onsite_review`; a review card with `kind: "onsite"`; `item.address` on every class review card.

- [ ] **Step 1: Write the failing tests**

`test_interview_brief.py`:

```python
def test_the_in_person_class_has_its_own_review_only_beside_an_online_one():
    both = [f.id for f in brief.required({"offers": ["live", "onsite"], "payments": ["free"]})]
    assert both.index("event_review") < both.index("onsite_review")
    for offers in (["onsite"], ["live"]):
        assert "onsite_review" not in [f.id for f in brief.required({"offers": offers, "payments": ["free"]})]
```

`test_interview_milestones.py`:

```python
def test_each_class_is_reviewed_as_its_own_draft(tenant_ctx, config, owner):
    answers = {**IN_PERSON, "offers": ["course", "live", "onsite"], "location": "Studio 4", "address": "Hauptstr. 12"}
    brief.save_answers(tenant_ctx, answers)
    with mock.patch("apps.core.copilot.content._give_cover"):
        setup_flow.create_fallback_draft(tenant_ctx, owner, "event", answers)
        setup_flow.create_fallback_draft(tenant_ctx, owner, "onsite", answers)
    for kind in ("event", "onsite"):
        ms._set_draft_status(tenant_ctx, kind, "ready")
    with mock.patch("apps.tenant_config.interview_milestones._cover_images", return_value=[]):
        online = ms.cards_for(tenant_ctx, answers, "event_review")
        in_person = ms.cards_for(tenant_ctx, answers, "onsite_review")
    assert (online["kind"], online["item"]["event_kind"], online["item"]["address"]) == ("event", "live", "")
    assert (in_person["kind"], in_person["status"]) == ("onsite", "ready")
    assert (in_person["item"]["event_kind"], in_person["item"]["address"]) == ("onsite", "Hauptstr. 12")
```

- [ ] **Step 2: Run them and see them fail**

Run: `docker compose exec django pytest apps/tenant_config/tests -q -k "own_review or reviewed_as_its_own"`
Expected: FAIL (`'onsite_review' is not in list`; `cards_for` returns `None`).

- [ ] **Step 3: Add the field (`interview_brief.py`)**

After the `event_review` field:

```python
    # Only beside an online class (see required()): alone, the first class is the in-person one.
    Field(
        "onsite_review",
        "In-person class",
        "And here's your in-person class. Happy with it?",
        kind="event",
        needs=("onsite",),
        group="event",
    ),
```

Add `"onsite_review"` to `_NOT_FACTS`. In `required()`, add this condition to the comprehension:

```python
        # The in-person class has its own review only beside an online one.
        and (f.id != "onsite_review" or {"live", "onsite"} <= offers)
```

- [ ] **Step 4: Serve its card (`interview_milestones.py`)**

```python
REVIEW_FIELDS = {"course_review": "course", "event_review": "event", "onsite_review": "onsite"}
```

In `review_card()`, the `else:` branch reads the draft of the kind asked for and adds the address:

```python
    else:
        ref = (flow.get("drafts") or {}).get(kind) or {}
        detail.update(when=item.scheduled_at.isoformat(), event_kind=ref.get("kind", "live"))
        detail["location"] = getattr(item, "location", "") or ""
        detail["address"] = getattr(item, "address", "") or ""
        # A weekly class says so, not only its first date (audit G6). The
        # schedule is the first class's; the in-person one beside it has its own date.
        picked = brief.answers_of(tenant).get("live_schedule")
        if kind == "event" and isinstance(picked, dict) and picked.get("mode") == "recurring":
            detail["repeats"] = schedule.summary(picked)
```

`choose()`, `redraft()`, `set_cover()`, `drop_draft()` and `interview_state` already work by `REVIEW_FIELDS` and draft kind, so they need no change.

- [ ] **Step 5: Run the tests**

Run: `docker compose exec django pytest apps/tenant_config/tests/test_interview_brief.py apps/tenant_config/tests/test_interview_milestones.py -q`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/tenant_config/interview_brief.py backend/apps/tenant_config/interview_milestones.py backend/apps/tenant_config/tests/test_interview_brief.py backend/apps/tenant_config/tests/test_interview_milestones.py
git commit -m "feat(setup): the in-person class beside an online one gets its own review"
```

### Task 3: The address boxes and the in-person review (frontend), then the Phase A gate

**Files:**
- Modify: `frontend-customer/src/lib/setup-flow.ts` (`ReviewKind`, `BuilderKind`, `ReviewItem`, `isReview`, `GuideTurn`)
- Modify: `frontend-customer/src/lib/interview.ts` (`SECTIONS`, new `ADDRESS_BOXES` and `addressOk`)
- Modify: `frontend-customer/src/components/setup-flow/question-screen.tsx` (lines 122-183, 291-302, 603-623, 666)
- Modify: `frontend-customer/src/components/setup-flow/draft-review.tsx` (`NOUN`, `DRAFTING`, the class chips near line 285)
- Modify: `e2e/specs/01-signup-onboarding.spec.ts`
- Test: `frontend-customer/src/lib/__tests__/interview.test.ts`

**Interfaces:**
- Consumes: the guide key `address`, `prefill` `{Place, Address}`, a review card with `kind: "onsite"` and `item.address`.
- Produces: the choice value `JSON.stringify({Place, Address})` that Task 1's `choose()` reads.

- [ ] **Step 1: Write the failing test** (`interview.test.ts`)

```ts
import { ADDRESS_BOXES, SECTIONS, addressOk, sectionOf } from "@/lib/interview";

describe("the address question", () => {
  it("sits in the class section, with the in-person review", () => {
    const fields = SECTIONS[sectionOf("live_when")].fields;
    expect(fields.indexOf("location")).toBeGreaterThan(fields.indexOf("live_when"));
    expect(fields.indexOf("onsite_review")).toBeGreaterThan(fields.indexOf("event_review"));
    expect(sectionOf("location")).toBe(sectionOf("live_when"));
  });
  it("takes a filled box and refuses an empty one", () => {
    expect(ADDRESS_BOXES).toEqual(["Place", "Address"]);
    expect(addressOk("Hauptstr. 12")).toBe(true);
    expect(addressOk("  ")).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `cd frontend-customer && npx vitest run src/lib/__tests__/interview.test.ts`
Expected: FAIL (`ADDRESS_BOXES` is not exported).

- [ ] **Step 3: Types and helpers**

`lib/setup-flow.ts`:

```ts
export type ReviewKind = "course" | "event" | "onsite";
export type BuilderKind = "course" | "event" | "membership";
```

```ts
export const isReview = (c: GuideCards | null | undefined): c is ReviewCard =>
  c?.kind === "course" || c?.kind === "event" || c?.kind === "onsite";
```

Add to `ReviewItem`:

```ts
  /** The street address of an in-person class. */
  address?: string;
```

Add to `GuideTurn`:

```ts
  /** The answer is a place and its street address, each in its own box. */
  address?: boolean;
```

`lib/interview.ts`: in `SECTIONS`, the "Pricing & content" fields become `[..., "live_topic", "live_when", "location", "event_price", "event_review", "onsite_review", "article_topic"]`, and Contact becomes `["socials", "contact"]`. Then:

```ts
/** The boxes of the address question, as interview_milestones.choose reads them. */
export const ADDRESS_BOXES = ["Place", "Address"];

/** Whether an address box is filled in enough to send. */
export const addressOk = (raw: string): boolean => raw.trim().length >= 3;
```

- [ ] **Step 4: The screen (`question-screen.tsx`)**

The address question reuses the contact question's boxes (`SocialsPicker`, `draft.details`, `step.prefill`). Import `ADDRESS_BOXES` and `addressOk` from `@/lib/interview`.

The answer of an address step never goes back in the answer box. In `typed`, add `step.address ||` to the first condition:

```tsx
  const typed =
    live ||
    cards ||
    zoneWas ||
    step.address ||
    !step.answer ||
    step.answer === DELEGATE_TEXT
      ? ""
      : picked.length
        ? noteOf(step.answer)
        : step.answer;
```

A changed box counts as a change (so going back and editing it is sent):

```tsx
    note !== typed.trim() ||
    !!draft.prices ||
    !!draft.details;
```

Replace the `ways` and `details` lines:

```tsx
  // A contact question: an email address or number for each way that needs
  // one. An address question: the place and its street address, no tiles.
  const ways = step.address
    ? ADDRESS_BOXES
    : step.contact
      ? ticked.filter((k) => k in CONTACT_DETAILS)
      : [];
  const details =
    step.contact || step.address
      ? { ...(step.prefill ?? {}), ...(draft.details ?? {}) }
      : null;
  const detailOk = (w: string, raw: string) =>
    step.address ? addressOk(raw) : contactOk(w, raw);
```

In `canContinue`, the `details` branch:

```tsx
          : details
            ? (!!step.address || ticked.length > 0) &&
              ways.every((w) => detailOk(w, details[w] ?? ""))
```

In `proceed`, the `details && field` branch:

```tsx
            : details && field
              ? {
                  message: step.address
                    ? ways.map((w) => (details[w] ?? "").trim()).join(", ")
                    : ticked.join(", "),
                  choice: {
                    field,
                    value: JSON.stringify(
                      Object.fromEntries(
                        (step.address ? ways : ticked).map((w) => [
                          w,
                          (details[w] ?? "").trim(),
                        ]),
                      ),
                    ),
                  },
                }
```

The boxes:

```tsx
              {details && ways.length > 0 && (
                <SocialsPicker
                  networks={ways}
                  value={details}
                  onChange={(v) => onDraft((d) => ({ ...d, details: v }))}
                  disabled={sending}
                  placeholder={(w) =>
                    step.address
                      ? w === "Place"
                        ? "Studio Lumen, Kreuzberg"
                        : "Hauptstraße 12, 10827 Berlin"
                      : CONTACT_DETAILS[w] === "email"
                        ? "you@example.com"
                        : "+49 170 1234567"
                  }
                  ok={detailOk}
                  problem={(w) =>
                    step.address
                      ? w === "Place"
                        ? "Add the name of the place."
                        : "Add the street address."
                      : CONTACT_DETAILS[w] === "email"
                        ? "That doesn’t look like an email address."
                        : "Add the number with its country code, like +49 170 1234567."
                  }
                  reads={() => null}
                  className="mt-4 motion-safe:animate-[sf-pop_.6s_var(--sf-spring)_both]"
                />
              )}
```

An address step has no tiles, so the Continue button needs its own reason to show (line 666):

```tsx
                    {(cards ||
                      step.options.length > 0 ||
                      zone ||
                      step.address) && (
```

- [ ] **Step 5: The review (`draft-review.tsx`)**

```tsx
const NOUN: Record<ReviewKind, string> = {
  course: "course",
  event: "class",
  onsite: "in-person class",
};
const DRAFTING: Record<ReviewKind, string[]> = {
  course: ["Outlining the modules", "Writing the lessons", "Choosing a cover"],
  event: ["Planning the session", "Finding a good time", "Choosing a cover"],
  onsite: ["Planning the session", "Finding a good time", "Choosing a cover"],
};
```

The class chips show for both class kinds, and the place carries its address. Change `kind === "event" && item.when` to `kind !== "course" && item.when`, add `item.address` to that block's `key`, and replace the place chip's text:

```tsx
              {item.event_kind === "onsite"
                ? [item.location, item.address].filter(Boolean).join(" · ") ||
                  "In person"
                : "Online, live"}
```

Run `cd frontend-customer && npx tsc --noEmit` and fix every `Record<ReviewKind, …>` or `kind === "event"` the compiler or `grep -rn '"event"' src/components/setup-flow` shows (the review placeholder in `question-screen.tsx` line 773 already treats everything that is not a course as a class).

- [ ] **Step 6: The robot (`e2e/specs/01-signup-onboarding.spec.ts`)**

Today the robot picks the first tile of "How will you teach", so it never meets this screen. If the tile order changes it would loop on it, so it learns the screen now. Beside the `zone` locator:

```ts
  // The in-person class asks for its place and address: two boxes, no tiles.
  const place = guide.getByPlaceholder("Studio Lumen, Kreuzberg");
```

Add `.or(place)` to `action`, and before the `if (await tile.isVisible())` block:

```ts
    if (await place.isVisible()) {
      await place.fill("E2E Studio");
      await guide.getByPlaceholder("Hauptstraße 12, 10827 Berlin").fill("Teststr. 1, 10115 Berlin");
      await cont.click();
      continue;
    }
```

- [ ] **Step 7: Run the frontend checks**

Run: `cd frontend-customer && npx vitest run src/lib/__tests__/interview.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 8: Phase A gate**

1. `make health-check` (start with `make dev-d` if it is down). `docker compose restart celery-worker`.
2. `make test-changed`, then `make test-frontend`, `make typecheck`, `make lint`. Expected: all green.
3. Walk it in the browser on a fresh interview (the Browser-pane coach login is in memory `reference-browser-pane-coach-login`): pick "Live online classes" and "In-person sessions". Check, in order: the class topic question says "first class"; after the schedule the address screen shows two boxes and no tiles; Continue is disabled until both are filled; the online class review shows "Online, live"; the next screen is "And here's your in-person class" with "Studio name · street address"; typing "make it Saturday at 10" there redrafts only the in-person class; Back to the address screen shows both boxes filled, and changing the street changes the review.
4. Walk it again with "In-person sessions" only: one class, one review, with the address.
5. `make e2e-spec SPEC=01-signup-onboarding`. Expected: green.

- [ ] **Step 9: Commit**

```bash
git add frontend-customer/src/lib/setup-flow.ts frontend-customer/src/lib/interview.ts frontend-customer/src/lib/__tests__/interview.test.ts frontend-customer/src/components/setup-flow/question-screen.tsx frontend-customer/src/components/setup-flow/draft-review.tsx e2e/specs/01-signup-onboarding.spec.ts
git commit -m "feat(setup): address boxes and a review for the in-person class"
```

---

# Phase B: what a membership covers (courses and classes)

### Task 4: A membership unlocks only what it includes (`apps/core/access.py`)

Today `pricing_type="subscription"` content is unlocked by **any** active subscription, even when it is linked to specific plans, while `get_unlock_options()` already advertises only the linked plans. With several memberships that is wrong: the Community member would get the Digital course.

**Files:**
- Modify: `backend/apps/core/access.py` (`get_access_info` step 5 near line 76, `bulk_check_access` near line 185)
- Test: `backend/apps/core/tests/test_access_service.py`

**Interfaces:**
- Produces: the rule every later task relies on. Members-only content linked to at least one active plan is unlocked only by those plans; members-only content that no active plan names stays open to every active subscriber (unchanged).

- [ ] **Step 1: Blast radius**

Run GitNexus `impact({target: "get_access_info", direction: "upstream"})` and `impact({target: "bulk_check_access", direction: "upstream"})`. Report the callers and the risk level to the owner before editing; stop if it reports CRITICAL.

- [ ] **Step 2: Write the failing tests** (end of `test_access_service.py`)

```python
@pytest.fixture()
def members_only_course(tenant_ctx, coach):
    return Course.objects.create(title="Deep", slug="deep", instructor=coach, pricing_type="subscription")


def _subscribe(student, plan):
    now = timezone.now()
    Subscription.objects.create(
        student=student,
        plan=plan,
        billing_amount=plan.price,
        billing_currency="USD",
        status="active",
        current_period_start=now - timedelta(days=1),
        current_period_end=now + timedelta(days=29),
    )


@pytest.mark.django_db
class TestMembersOnlyByPlan:
    def test_another_membership_does_not_unlock_it(self, service, student, members_only_course):
        digital = SubscriptionPlan.objects.create(name="Digital", price=Decimal("9"), currency="USD")
        community = SubscriptionPlan.objects.create(name="Community", price=Decimal("5"), currency="USD")
        ct = ContentType.objects.get_for_model(Course)
        SubscriptionPlanAccess.objects.create(plan=digital, content_type=ct, object_id=members_only_course.pk)
        _subscribe(student, community)
        info = service.get_access_info(student, members_only_course)
        assert info.has_access is False and info.unlock_methods == ["subscribe"]
        assert service.bulk_check_access(student, [members_only_course])[members_only_course.pk].has_access is False
        # Only the plan that includes it is offered.
        assert [p["name"] for p in service.get_unlock_options(members_only_course)["plans"]] == ["Digital"]

    def test_its_own_membership_unlocks_it(self, service, student, members_only_course):
        digital = SubscriptionPlan.objects.create(name="Digital", price=Decimal("9"), currency="USD")
        ct = ContentType.objects.get_for_model(Course)
        SubscriptionPlanAccess.objects.create(plan=digital, content_type=ct, object_id=members_only_course.pk)
        _subscribe(student, digital)
        assert service.get_access_info(student, members_only_course).access_reason == "subscription"
        assert service.bulk_check_access(student, [members_only_course])[members_only_course.pk].has_access is True

    def test_content_no_plan_names_stays_open_to_every_member(self, service, student, members_only_course):
        community = SubscriptionPlan.objects.create(name="Community", price=Decimal("5"), currency="USD")
        _subscribe(student, community)
        assert service.check_access(student, members_only_course) is True
        assert service.bulk_check_access(student, [members_only_course])[members_only_course.pk].has_access is True
```

If the other tests in this file carry no class-level mark, drop `@pytest.mark.django_db` and match them.

- [ ] **Step 3: Run them and see the first one fail**

Run: `docker compose exec django pytest apps/core/tests/test_access_service.py -q -k MembersOnlyByPlan`
Expected: `test_another_membership_does_not_unlock_it` FAILS (`has_access is True`); the other two pass.

- [ ] **Step 4: Change the rule**

`get_access_info`, step 5:

```python
        # 5. Active subscription: a plan that includes it. Members-only
        # content that no plan names is open to every member.
        if self._has_subscription_access(user, content) or (
            pricing_type == "subscription"
            and not self._is_in_any_plan(content)
            and self._has_any_active_subscription(user)
        ):
```

`bulk_check_access`, the subscription branch (it already has `plan_linked_ids`):

```python
            elif item.pk in subscription_ids or (
                pricing_type == "subscription" and has_any_subscription and item.pk not in plan_linked_ids
            ):
```

- [ ] **Step 5: Run the file, then the apps that read the paywall**

Run: `docker compose exec django pytest apps/core/tests/test_access_service.py apps/courses apps/live/tests/test_access_gating.py apps/billing/tests/test_plan_access.py -q`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/core/access.py backend/apps/core/tests/test_access_service.py
git commit -m "fix(access): a membership unlocks only the members-only content it includes"
```

### Task 5: Members-only classes, in-person classes in plans, and an editor read that works (backend)

**Files:**
- Modify: `backend/apps/live/models.py` (`LiveClass.pricing_type` line 52, `OnsiteEvent.pricing_type` line 249)
- Create: `backend/apps/live/migrations/0018_*.py` (generated)
- Modify: `backend/apps/billing/serializers/plans.py`
- Modify: `backend/apps/billing/views/plans.py` (`_resolve_access_items`)
- Modify: `backend/apps/billing/views/store.py` (`products_list`)
- Test: `backend/apps/billing/tests/test_plan_access.py`, `backend/apps/billing/tests/test_store.py`

**Interfaces:**
- Produces: `pricing_type="subscription"` valid on `LiveClass` and `OnsiteEvent`; the plan access item gains `type` (the picker's type string: `course`, `download`, `live_class`, `live_stream`, `onsite_event`) and `title`; `PUT` accepts `onsite_event`; `GET /api/v1/billing/products/?linkable=1` also lists what a plan can include but the store does not sell.

- [ ] **Step 1: Write the failing tests**

`test_plan_access.py`, inside `TestPlanAccess`:

```python
    def test_get_names_each_item_the_way_the_editor_picks_it(self, plan, course, owner_client):
        owner_client.put(
            f"/api/v1/billing/plans/{plan.pk}/access/",
            data={"items": [{"content_type": "course", "object_id": course.pk}]},
            format="json",
        )
        item = owner_client.get(f"/api/v1/billing/plans/{plan.pk}/access/").json()[0]
        assert (item["type"], item["object_id"], item["title"]) == ("course", course.pk, course.title)

    def test_an_in_person_class_can_be_in_a_plan(self, plan, owner, owner_client):
        from django.utils import timezone

        from apps.live.models import OnsiteEvent

        event = OnsiteEvent.objects.create(
            title="Pads", instructor=owner, pricing_type="subscription", scheduled_at=timezone.now()
        )
        response = owner_client.put(
            f"/api/v1/billing/plans/{plan.pk}/access/",
            data={"items": [{"content_type": "onsite_event", "object_id": event.pk}]},
            format="json",
        )
        assert response.status_code == 200, response.content
        assert response.json()[0]["type"] == "onsite_event"
        products = owner_client.get("/api/v1/billing/products/?linkable=1").json()
        assert ("onsite_event", event.pk) in {(p["type"], p["id"]) for p in products}
        # The store itself still lists only what it can sell.
        assert "onsite_event" not in {p["type"] for p in owner_client.get("/api/v1/billing/products/").json()}
```

- [ ] **Step 2: Run them and see them fail**

Run: `docker compose exec django pytest apps/billing/tests/test_plan_access.py -q`
Expected: FAIL (`KeyError: 'type'`; `"onsite_event" is not a valid choice`; the model refuses `subscription` only at validation, so the create passes and the PUT fails).

- [ ] **Step 3: The pricing type (`live/models.py`)**

On `LiveClass` and on `OnsiteEvent` only:

```python
    pricing_type = models.CharField(
        max_length=20,
        # "subscription": only members get in (0015 folded it into "paid"; back for these two).
        choices=[("free", "Free"), ("paid", "Paid"), ("subscription", "Members only")],
        default="free",
    )
```

Run: `make makemigrations && make migrate`
Expected: one new file `backend/apps/live/migrations/0018_….py` with two `AlterField` operations and no data migration. Then `make test-fresh` once.

- [ ] **Step 4: Plans know the in-person class (`billing/serializers/plans.py`)**

```python
class PlanAccessItemSerializer(serializers.ModelSerializer):
    content_type_name = serializers.SerializerMethodField()
    type = serializers.SerializerMethodField()
    title = serializers.SerializerMethodField()

    class Meta:
        model = SubscriptionPlanAccess
        fields = ["id", "content_type", "object_id", "content_type_name", "type", "title"]
        read_only_fields = ["id"]

    def get_content_type_name(self, obj):
        return f"{obj.content_type.app_label}.{obj.content_type.model}"

    def get_type(self, obj):
        """The name the plan editor picks it by ("course", "onsite_event")."""
        name = self.get_content_type_name(obj)
        return next((k for k, v in PlanAccessWriteItemSerializer.CONTENT_TYPE_MAP.items() if v == name), "")

    def get_title(self, obj):
        return str(getattr(obj.content_object, "title", "") or "")


class PlanAccessWriteItemSerializer(serializers.Serializer):
    CONTENT_TYPE_MAP = {
        "course": "courses.course",
        "download": "downloads.downloadfile",
        "live_class": "live.liveclass",
        "live_stream": "live.livestream",
        "onsite_event": "live.onsiteevent",
    }
```

`PlanAccessItemSerializer` now refers to `PlanAccessWriteItemSerializer` at call time, so the class order in the file can stay.

In `billing/views/plans.py`, `_resolve_access_items.model_map` gains (so the public plan page lists it):

```python
        "onsiteevent": ("live", "onsiteevent", "title", None),
```

- [ ] **Step 5: What a plan can include but the store does not sell (`billing/views/store.py`)**

Above `products_list`:

```python
def _plan_only_items():
    """What a plan can include but the store does not sell: members-only
    courses and classes, and every in-person class that is not free (there is
    no online checkout for those)."""
    from apps.live.models import OnsiteEvent

    currency = tenant_charge_currency()
    rows = [
        *(("course", c) for c in Course.objects.filter(pricing_type="subscription").select_related("thumbnail")),
        *(("live_class", c) for c in LiveClass.objects.filter(pricing_type="subscription").select_related("thumbnail")),
        *(("onsite_event", e) for e in OnsiteEvent.objects.exclude(pricing_type="free").select_related("thumbnail")),
    ]
    return [
        {
            "id": obj.pk,
            "title": obj.title,
            "description": obj.description,
            "type": kind,
            "price": obj.price,
            "currency": currency,
            "thumbnail_url": _thumbnail_url(obj),
            "is_active": True,
            "item_count": 0,
            "original_price": None,
            "_obj": obj,
        }
        for kind, obj in rows
    ]
```

`tenant_charge_currency`, `Course` and `LiveClass` are already imported at the top of this file. In `products_list`:

```python
    items = _collect_store_items()
    if request.query_params.get("linkable"):
        items += _plan_only_items()
```

and add `"onsite_event": OnsiteEvent` to `type_to_model` (import `OnsiteEvent` beside `LiveClass` at the top of the file).

- [ ] **Step 6: Run the tests**

Run: `docker compose exec django pytest apps/billing/tests/test_plan_access.py apps/billing/tests/test_store.py apps/live -q`
Expected: PASS.

- [ ] **Step 7: Regenerate the API types and commit**

Run: `cd frontend-customer && npm run gen:api`
Expected diff in `src/types/api-generated.ts`: `subscription` in the two pricing enums, `type` and `title` on the plan access item. Anything else is a surprise: stop and read it.

```bash
git add backend/apps/live/models.py backend/apps/live/migrations/0018_*.py backend/apps/billing/serializers/plans.py backend/apps/billing/views/plans.py backend/apps/billing/views/store.py backend/apps/billing/tests/test_plan_access.py frontend-customer/src/types/api-generated.ts
git commit -m "feat(billing): members-only classes, in-person classes in plans, and an access read the editor can use"
```

### Task 6: The plan editor keeps what is linked; "Members only" on the site and in the admin (frontend)

**Files:**
- Modify: `frontend-customer/src/app/admin/billing/plans/[id]/page.tsx` (lines 26-33, 66-80)
- Modify: `frontend-customer/src/components/billing/content-picker.tsx`
- Modify: `frontend-customer/src/components/public/calendar/event-detail-client.tsx` (price line near 148)
- Modify: `frontend-customer/src/components/public/events/events-list.tsx` (line 91)
- Modify: `frontend-customer/src/components/admin/live/onsite-tab.tsx` (lines 50-52, 287-288), the live-classes tab beside it, `shared.tsx` (`PricingBadge`, line 108)
- Test: `frontend-customer/src/lib/__tests__/plan-access.test.ts` (new), `frontend-customer/src/lib/plan-access.ts` (new)

**Interfaces:**
- Consumes: Task 5's access item `{type, object_id, title}` and `?linkable=1`.
- Produces: `selectedFromAccess(rows) -> SelectedItem[]` in `lib/plan-access.ts`; `<ContentPicker linkable>`; `priceLabel(pricingType, price, currency?)` in `lib/plan-access.ts`.

- [ ] **Step 1: Write the failing test** (`src/lib/__tests__/plan-access.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import { priceLabel, selectedFromAccess } from "@/lib/plan-access";

describe("plan access", () => {
  it("reads the list the API returns, in the picker's names", () => {
    expect(
      selectedFromAccess([
        { type: "onsite_event", object_id: 4, title: "Pads" },
        { type: "", object_id: 9, title: "Unknown kind" },
      ]),
    ).toEqual([
      { content_type: "onsite_event", object_id: 4, title: "Pads", price: "0" },
    ]);
    // The old page read `.items` of a list: never again an empty editor.
    expect(selectedFromAccess(undefined)).toEqual([]);
  });
  it("names a price the way a student reads it", () => {
    expect(priceLabel("free", "0.00")).toBe("Free");
    expect(priceLabel("subscription", "0.00")).toBe("Members only");
    expect(priceLabel("paid", "15.00", "EUR")).toBe("15.00 EUR");
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `cd frontend-customer && npx vitest run src/lib/__tests__/plan-access.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: The helpers** (`src/lib/plan-access.ts`)

```ts
import type { SelectedItem } from "@/components/billing/content-picker";

export interface PlanAccessRow {
  /** The picker's name for the kind of content ("course", "onsite_event"). */
  type: string;
  object_id: number;
  title?: string;
}

/** What a plan includes, as the content picker holds it. A row of a kind
 * the picker cannot name is left out. */
export function selectedFromAccess(
  rows: PlanAccessRow[] | undefined,
): SelectedItem[] {
  return (Array.isArray(rows) ? rows : [])
    .filter((r) => r.type)
    .map((r) => ({
      content_type: r.type,
      object_id: r.object_id,
      title: r.title || `Item ${r.object_id}`,
      price: "0",
    }));
}

/** A price as a student reads it: "Free", "Members only" or the amount. */
export function priceLabel(
  pricingType: string,
  price: string | number,
  currency = "",
): string {
  if (pricingType === "free") return "Free";
  if (pricingType === "subscription") return "Members only";
  return `${price} ${currency}`.trim();
}
```

`content-picker.tsx` is a client component; importing only its type keeps this file free of runtime imports.

- [ ] **Step 4: The editor reads what is linked** (`plans/[id]/page.tsx`)

Delete the `PlanAccess` interface. Import `selectedFromAccess` and `type PlanAccessRow` from `@/lib/plan-access`, then:

```tsx
          clientFetch<PlanAccessRow[]>(`/api/v1/billing/plans/${id}/access/`),
```

```tsx
        setSelectedItems(selectedFromAccess(accessData));
```

and pass `linkable` to the picker: `<ContentPicker linkable selected={…} onChange={…} />`.

- [ ] **Step 5: The picker lists what a plan can include** (`content-picker.tsx`)

```tsx
const TYPE_FILTERS = [
  { label: "All", value: "all" },
  { label: "Course", value: "course" },
  { label: "Download", value: "download" },
  { label: "Live Class", value: "live_class" },
  { label: "Live Stream", value: "live_stream" },
  { label: "In-person class", value: "onsite_event" },
];
```

Add `onsite_event: "In-person class"` to `TYPE_LABEL_MAP` and `onsite_event: "outline"` to `TYPE_BADGE_VARIANT`.

```tsx
interface ContentPickerProps {
  selected: SelectedItem[];
  onChange: (items: SelectedItem[]) => void;
  /** Also list what a plan can include but the store does not sell
   * (members-only content, in-person classes). Bundles leave it off. */
  linkable?: boolean;
}

export function ContentPicker({
  selected,
  onChange,
  linkable = false,
}: ContentPickerProps) {
```

```tsx
    clientFetch<Product[]>(
      `/api/v1/billing/products/${linkable ? "?linkable=1" : ""}`,
    )
```

- [ ] **Step 6: "Members only" where a price shows**

`event-detail-client.tsx`, the price paragraph:

```tsx
                  {priceLabel(
                    event.pricing_type,
                    access.price || event.price,
                    access.currency || "",
                  )}
```

`events-list.tsx`, line 91:

```tsx
                        {event.pricing_type === "paid"
                          ? `$${event.price}`
                          : priceLabel(event.pricing_type, event.price)}
```

Both import `priceLabel` from `@/lib/plan-access`.

Admin: run `grep -rn 'value="paid"\|value: "paid"' frontend-customer/src/components/admin/live`. At every hit (the create form and the `FieldConfig` options in `onsite-tab.tsx`, and the same two in the live-classes tab), add the third option after Paid:

```tsx
                <option value="subscription">Members only</option>
```

```tsx
      { label: "Members only", value: "subscription" },
```

The price input already shows only for `paid` in the edit panel (`showWhen: (v) => v.pricing_type === "paid"`); in the create forms change `pricingType !== "free"` to `pricingType === "paid"` so "Members only" asks for no price. In `shared.tsx`, `PricingBadge` gets a branch before the paid one:

```tsx
  if (pricingType === "subscription") {
    return <Badge variant="secondary">Members only</Badge>;
  }
```

Match the `Badge` usage of the free branch right above it (same import, same size props).

- [ ] **Step 7: Run the checks**

Run: `cd frontend-customer && npx vitest run src/lib/__tests__/plan-access.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 8: Commit**

```bash
git add frontend-customer/src/lib/plan-access.ts frontend-customer/src/lib/__tests__/plan-access.test.ts "frontend-customer/src/app/admin/billing/plans/[id]/page.tsx" frontend-customer/src/components/billing/content-picker.tsx frontend-customer/src/components/public/calendar/event-detail-client.tsx frontend-customer/src/components/public/events/events-list.tsx frontend-customer/src/components/admin/live
git commit -m "fix(billing): the plan editor shows and keeps what a membership includes"
```

### Task 7: The access question (interview brief)

**Files:**
- Modify: `backend/apps/tenant_config/interview_brief.py` (`FIXED_KINDS`, constants below `MEMBERSHIP_TIERS`, `FIELDS`, `_NOT_FACTS`, `coerce`, `required`, `options_for`)
- Modify: `backend/apps/tenant_config/interview.py` (`SYSTEM`, `NOTED_NAMES`, `picked_note`)
- Modify: `frontend-customer/src/lib/interview.ts` (`SECTIONS`)
- Test: `backend/apps/tenant_config/tests/test_interview_brief.py`

**Interfaces:**
- Produces, all in `interview_brief`:
  - `ACCESS_FREE = "free"`, `ACCESS_BUY = "buy"`
  - `picked_tiers(answers) -> list[dict]`
  - `access_of(answers, kind) -> list[str]` where `kind` is `"course" | "event" | "post"`; the result holds `"free"`, `"buy"` and tier ids
  - `access_tiers(answers, kind, event_kind="") -> list[str]` (tier ids only; for a class, only the tiers that take its format)
  - `sold_on_its_own(answers, kind) -> bool`
  - `access_labels(answers, kind) -> list[str]`
  - stored answers `answers["course_access"]`, `answers["event_access"]`: lists of those ids

- [ ] **Step 1: Write the failing tests** (`test_interview_brief.py`)

```python
PAID = {"offers": ["course", "live"], "payments": ["course", "membership"], "memberships": ["digital", "online"]}


def test_the_access_question_is_asked_only_with_a_membership():
    ids = [f.id for f in brief.required(PAID)]
    assert ids.index("course_topic") < ids.index("course_access") < ids.index("course_price")
    assert ids.index("live_when") < ids.index("event_access") < ids.index("event_review")
    without = [f.id for f in brief.required({**PAID, "payments": ["course"], "memberships": []})]
    assert "course_access" not in without and "course_price" in without


def test_access_tiles_are_her_ways_to_sell():
    field = brief.FIELD_BY_ID["course_access"]
    assert brief.options_for(field, PAID)[0] == (
        "Buy it once",
        "Digital membership",
        "Online membership",
        "Free for everyone",
    )
    # No one-off sale when she does not sell courses that way.
    assert brief.options_for(field, {**PAID, "payments": ["membership"]})[0][0] == "Digital membership"
    assert brief.options_for(brief.FIELD_BY_ID["event_access"], {**PAID, "payments": ["event", "membership"]})[0][0] == (
        "Pay per class"
    )


def test_access_reads_her_tiles_and_falls_back_to_the_catalogue():
    answers = dict(PAID)
    assert brief.apply_fact(answers, "course_access", "Buy it once, Online membership")
    assert answers["course_access"] == ["buy", "online"]
    assert brief.access_of(answers, "course") == ["buy", "online"]
    assert brief.apply_fact(answers, "course_access", "Free for everyone") and answers["course_access"] == ["free"]
    # Not answered: a course is in every membership with courses, a class in the one of its format.
    assert brief.access_of(PAID, "course") == ["buy", "digital", "online"]
    assert brief.access_of(PAID, "event") == ["online"]
    # An answer from before she dropped the membership no longer counts.
    assert brief.access_of({**PAID, "payments": ["course"], "course_access": ["digital"]}, "course") == ["buy"]
    assert brief.access_of({"offers": ["articles"], "payments": ["free"]}, "post") == ["free"]


def test_a_membership_of_one_format_takes_only_its_class():
    both = {
        "offers": ["live", "onsite"],
        "payments": ["membership"],
        "memberships": ["online", "studio", "all"],
        "event_access": ["online", "studio", "all"],
    }
    assert brief.access_tiers(both, "event", "live") == ["online", "all"]
    assert brief.access_tiers(both, "event", "onsite") == ["studio", "all"]


def test_a_price_is_asked_only_for_what_is_sold_on_its_own():
    assert "course_price" not in [f.id for f in brief.required({**PAID, "course_access": ["digital"]})]
    assert "course_price" in [f.id for f in brief.required({**PAID, "course_access": ["buy", "digital"]})]
```

- [ ] **Step 2: Run them and see them fail**

Run: `docker compose exec django pytest apps/tenant_config/tests/test_interview_brief.py -q -k "access or sold_on_its_own or one_format"`
Expected: FAIL (`'course_access' is not in list`, `KeyError`, `AttributeError`).

- [ ] **Step 3: The answers and what they mean** (`interview_brief.py`, below `default_tier`)

```python
# How students get one thing she makes: free, bought on its own, or with a
# membership she picked (its tier id).
ACCESS_FREE, ACCESS_BUY = "free", "buy"
ACCESS_FREE_LABEL = "Free for everyone"
# kind → (the tile, its icon, its hint). An article is never sold on its own.
ACCESS_BUY_TILES = {
    "course": ("Buy it once", "book-open", "One payment, theirs to keep"),
    "event": ("Pay per class", "ticket", "One payment for each class"),
}


def picked_tiers(answers: dict) -> list[dict]:
    """The memberships she has: the ones she ticked, or the one a "pick for me" gets."""
    if "membership" not in (answers.get("payments") or []):
        return []
    allowed = {t["id"]: t for t in tiers_for(answers)}
    ids = [i for i in (answers.get("memberships") or []) if i in TIER_BY_ID] or [default_tier(answers)]
    return [allowed.get(i) or TIER_BY_ID[i] for i in ids]


def access_options(kind: str, answers: dict) -> list[tuple[str, str, str]]:
    """The ways students can get a course, a class or an article, as (label,
    icon, hint): on its own when she sells that way, each membership she
    has, or free."""
    rows = [ACCESS_BUY_TILES[kind]] if kind in ACCESS_BUY_TILES and kind in (answers.get("payments") or []) else []
    rows += [(t["label"], t["icon"], f"{money(tier_price(answers, t['id']))} a month") for t in picked_tiers(answers)]
    return [*rows, (ACCESS_FREE_LABEL, "gift", "No payment, no membership")]


def parse_access(raw) -> list[str]:
    """The ways named in the coach's words: "free" alone, or "buy" and membership ids."""
    if isinstance(raw, list | tuple):
        raw = " ".join(map(str, raw))
    text = str(raw or "").lower()
    if re.search(r"\bfree\b", text):
        return [ACCESS_FREE]
    buy = [ACCESS_BUY] if re.search(r"buy it once|pay per class|\bbuy\b|on its own", text) else []
    return buy + parse_memberships(text)


def tier_takes(tier: dict, event_kind: str) -> bool:
    """A membership built on one format (online, in person) takes only the class of that format."""
    formats = set(tier["needs"]) & {"live", "onsite"}
    return not formats or event_kind in formats


def access_of(answers: dict, kind: str) -> list[str]:
    """How students get the first course, class ("event") or article
    ("post"): "buy", "free" and the ids of the memberships that include it.
    Her answer while she has a membership; else what the catalogue means: a
    course in every membership with courses, a class in the memberships of
    its format, an article free."""
    tiers = picked_tiers(answers)
    have = {t["id"] for t in tiers}
    sells = kind in ACCESS_BUY_TILES and kind in (answers.get("payments") or [])
    field_id = f"{kind}_access"
    said = [] if field_id in (answers.get("delegated") or []) else answers.get(field_id) or []
    kept = [w for w in said if w == ACCESS_FREE or (w == ACCESS_BUY and sells) or w in have]
    if tiers and kept:
        return kept
    ways = [ACCESS_BUY] if sells else []
    if kind == "course":
        ways += [t["id"] for t in tiers if t["courses"]]
    elif kind == "event":
        ways += [t["id"] for t in tiers if not t["needs"] or set(t["needs"]) & {"live", "onsite"}]
    return ways or [ACCESS_FREE]


def access_tiers(answers: dict, kind: str, event_kind: str = "") -> list[str]:
    """The memberships that include it; for a class, the ones that take its format."""
    ids = [w for w in access_of(answers, kind) if w in TIER_BY_ID]
    return [i for i in ids if not event_kind or tier_takes(TIER_BY_ID[i], event_kind)]


def sold_on_its_own(answers: dict, kind: str) -> bool:
    return ACCESS_BUY in access_of(answers, kind)


def access_labels(answers: dict, kind: str) -> list[str]:
    """Her access as the tiles name it ("Buy it once", "Digital membership")."""
    own = {ACCESS_FREE: ACCESS_FREE_LABEL, ACCESS_BUY: ACCESS_BUY_TILES.get(kind, ("",))[0]}
    return [own.get(w) or TIER_BY_ID[w]["label"] for w in access_of(answers, kind)]
```

`money` and `re` are already in this module (`money` is defined further down; the functions call it at run time, so the order is fine).

- [ ] **Step 4: The fields**

Add `"access"` to `FIXED_KINDS`. Between `course_topic` and `course_price`:

```python
    Field(
        "course_access",
        "Who gets the first course",
        "How do students get this course?",
        kind="access",  # options come from access_options()
        needs=("course",),
        pays=("membership",),
        group="course",
        multi=True,
        alone="Free for everyone",
        delegable=True,
        why="A membership covers what you tick here. Anything you leave out stays outside it.",
    ),
```

Between `location` and `event_price`:

```python
    Field(
        "event_access",
        "Who gets the classes",
        "How do students get your classes?",
        kind="access",
        needs=("live", "onsite"),
        pays=("membership",),
        group="event",
        multi=True,
        alone="Free for everyone",
        delegable=True,
        why="A membership covers what you tick here. Anything you leave out stays outside it.",
    ),
```

Add `"course_access"` and `"event_access"` to `_NOT_FACTS` (their value is a list of ids, not copy).

- [ ] **Step 5: Parsing, options, and when a price is asked**

`coerce()`, beside the memberships line:

```python
    if field.kind == "access":
        return parse_access(raw) or None
```

`options_for()`, before the `if field.kind == "memberships":` branch:

```python
    if field.kind == "access":
        rows = access_options(field.id.removesuffix("_access"), answers)
        return tuple(r[0] for r in rows), tuple(r[1] for r in rows), tuple(r[2] for r in rows)
```

`required()`, one more condition:

```python
        # A price is asked only for what is sold on its own.
        and (f.kind != "price" or sold_on_its_own(answers, f.group))
```

`course_price` has `group="course"` and `event_price` has `group="event"`, which are the two kinds. Without a membership, `sold_on_its_own` is exactly the old `pays` rule, so nothing moves for those coaches.

- [ ] **Step 6: The guide's words** (`interview.py`)

In `SYSTEM`, after the `For "payments"…` lines of point 1:

```
   For "course_access" and "event_access" give the matching ids from: free (free for
   everyone), buy (sold on its own), and the membership ids digital, online, studio,
   community, all.
```

`NOTED_NAMES` gains:

```python
    "course_access": "who gets your course",
    "event_access": "who gets your classes",
```

`picked_note()`, before the final `return ""`:

```python
    if field_id in ("course_access", "event_access", "post_access"):
        labels = brief.access_labels(brief.answers_of(tenant), field_id.removesuffix("_access"))
        return f"I set it to: {', '.join(labels)}. You can change it any time."
```

`frontend-customer/src/lib/interview.ts`, `SECTIONS`: put `"course_access"` after `"course_topic"` and `"event_access"` after `"location"`. The screen itself needs no change: it is a multi-pick tile question with an "alone" tile and hints, like "How will students pay you?".

- [ ] **Step 7: Run the tests**

Run: `docker compose exec django pytest apps/tenant_config/tests/test_interview_brief.py apps/tenant_config/tests/test_interview.py -q && cd frontend-customer && npx vitest run src/lib/__tests__/interview.test.ts`
Expected: PASS. A test that pins the exact field order or the `SYSTEM` text may need the two new ids added.

- [ ] **Step 8: Commit**

```bash
git add backend/apps/tenant_config/interview_brief.py backend/apps/tenant_config/interview.py backend/apps/tenant_config/tests/test_interview_brief.py frontend-customer/src/lib/interview.ts
git commit -m "feat(setup): ask how students get the first course and the classes"
```

### Task 8: The answer takes effect: pricing, plan links, go-live; then the Phase B gate

**Files:**
- Modify: `backend/apps/tenant_config/setup_flow.py` (`brief_price` near line 429, `_create` near line 488)
- Modify: `backend/apps/tenant_config/interview_milestones.py` (`fire`, `run_draft`, `create_memberships`, `grant_membership` → `sync_access`)
- Modify: `backend/apps/tenant_config/interview_golive.py` (lines 161, 220, 228, 278, 334, 349, 357)
- Test: `backend/apps/tenant_config/tests/test_interview_milestones.py`, `test_interview_golive.py`

**Interfaces:**
- Consumes: `brief.access_of`, `brief.access_tiers`, `brief.sold_on_its_own` (Task 7); the paywall rule (Task 4); `subscription` on classes (Task 5).
- Produces: `interview_milestones.sync_access(tenant, answers: dict | None = None) -> None`. `grant_membership` is deleted.

- [ ] **Step 1: Write the failing tests** (`test_interview_milestones.py`)

```python
MEMBERS = {
    **HOME,
    "sells": "paid",
    "offers": ["course", "community"],
    "payments": ["course", "membership"],
    "memberships": ["digital", "community"],
    "course_topic": "Desk yoga",
    "course_price": 39.0,
}


def _links():
    from apps.billing.models import SubscriptionPlanAccess

    return {(a.plan.name, a.content_type.model, a.object_id) for a in SubscriptionPlanAccess.objects.all()}


def _course_with_memberships(tenant_ctx, owner, answers):
    brief.save_answers(tenant_ctx, answers)
    with mock.patch("apps.core.copilot.content._give_cover"):
        setup_flow.create_fallback_draft(tenant_ctx, owner, "course", answers)
    ms.create_memberships(tenant_ctx, answers)
    return Course.objects.get()


def test_her_answer_decides_which_memberships_include_the_course(tenant_ctx, config, owner, side_effects):
    course = _course_with_memberships(tenant_ctx, owner, {**MEMBERS, "course_access": ["community"]})
    assert course.pricing_type == "subscription" and course.price == 0  # members only
    assert _links() == {("Community membership", "course", course.pk)}


def test_a_changed_answer_moves_the_course_and_leaves_hand_made_links(tenant_ctx, config, owner, side_effects):
    from django.contrib.contenttypes.models import ContentType

    from apps.billing.models import SubscriptionPlan, SubscriptionPlanAccess

    answers = {**MEMBERS, "course_access": ["buy", "digital"]}
    course = _course_with_memberships(tenant_ctx, owner, answers)
    assert (course.pricing_type, course.price) == ("paid", Decimal("39.00"))
    other = Course.objects.create(
        title="By hand", slug="by-hand", instructor=owner, pricing_type="paid", price=Decimal("10")
    )
    digital = SubscriptionPlan.objects.get(name="Digital membership")
    SubscriptionPlanAccess.objects.create(
        plan=digital, content_type=ContentType.objects.get_for_model(Course), object_id=other.pk
    )
    answers["course_access"] = ["free"]
    ms.sync_access(tenant_ctx, answers)
    ms.sync_access(tenant_ctx, answers)  # every turn runs it: nothing doubles
    course.refresh_from_db()
    assert (course.pricing_type, course.price) == ("free", Decimal("0"))
    assert _links() == {("Digital membership", "course", other.pk)}


def test_each_class_goes_into_the_membership_of_its_format(tenant_ctx, config, owner, side_effects):
    from apps.live.models import LiveClass, OnsiteEvent

    answers = {
        **HOME,
        "sells": "paid",
        "offers": ["live", "onsite"],
        "payments": ["membership"],
        "memberships": ["online", "studio"],
        "live_topic": "Flow",
        "live_when": "Mondays at 7",
        "location": "Studio 4",
        "address": "Hauptstr. 12",
        "event_access": ["online", "studio"],
    }
    brief.save_answers(tenant_ctx, answers)
    with mock.patch("apps.core.copilot.content._give_cover"):
        setup_flow.create_fallback_draft(tenant_ctx, owner, "event", answers)
        setup_flow.create_fallback_draft(tenant_ctx, owner, "onsite", answers)
    ms.create_memberships(tenant_ctx, answers)
    live, onsite = LiveClass.objects.get(), OnsiteEvent.objects.get()
    assert (live.pricing_type, onsite.pricing_type) == ("subscription", "subscription")
    assert _links() == {
        ("Online membership", "liveclass", live.pk),
        ("Studio membership", "onsiteevent", onsite.pk),
    }
```

`test_membership_plans_are_created_once_per_tier_with_the_course_in_them` (line 324) asserts `course.pricing_type == "free"`. That was default 7's hole. Change its assertion to:

```python
    assert course.pricing_type == "subscription"  # members get it; not sold on its own
```

and add `"sells": "paid"` to that test's `answers` and to the dict it passes to `create_fallback_draft`, and save them first with `brief.save_answers(tenant_ctx, answers)` (the pricing now reads the saved brief).

In `test_interview_golive.py`, beside the existing `make_free` tests (the file has a `config` fixture and imports `User`, `Course`, `brief` and `mock`; add `from apps.tenant_config import interview_golive, setup_flow` if they are missing):

```python
def test_going_free_opens_what_was_members_only(tenant_ctx, config):
    owner = User.objects.create_user(email="owner@free.test", name="O", password="x", role="owner", is_staff=True)  # noqa: S106
    answers = {
        "teaches": "Yoga",
        "audience": "Desk workers",
        "outcome": "No back pain",
        "pitch": "Yoga for desks",
        "sells": "paid",
        "offers": ["course"],
        "payments": ["membership"],
        "memberships": ["digital"],
        "course_access": ["digital"],
    }
    brief.save_answers(tenant_ctx, answers)
    with mock.patch("apps.core.copilot.content._give_cover"):
        setup_flow.create_fallback_draft(tenant_ctx, owner, "course", answers)
    assert Course.objects.get().pricing_type == "subscription"
    interview_golive.make_free(tenant_ctx)
    assert Course.objects.get().pricing_type == "free"
    assert "course_access" not in brief.answers_of(tenant_ctx)
```

- [ ] **Step 2: Run them and see them fail**

Run: `docker compose exec django pytest apps/tenant_config/tests/test_interview_milestones.py apps/tenant_config/tests/test_interview_golive.py -q -k "her_answer or changed_answer or its_format or members_only or created_once"`
Expected: FAIL (`sync_access` does not exist; the course is `free`).

- [ ] **Step 3: Drafts are priced the way she said** (`setup_flow.py`)

In `brief_price`, the "not sold on its own" line reads her access:

```python
    from . import interview_brief as brief

    if not brief.sold_on_its_own(answers, kind):  # free, or only in a membership
        return 0.0
```

(replacing `if kind not in ways: return 0.0`; keep the legacy `ways is None` block above it as it is).

Below `_may_price`:

```python
def _members_only(tenant, kind: str, event_kind: str = "") -> bool:
    """Only members get it: in a membership she has, and not sold on its own."""
    from . import interview_brief as brief

    answers = brief.answers_of(tenant)
    return not brief.sold_on_its_own(answers, kind) and bool(brief.access_tiers(answers, kind, event_kind))
```

In `_create`, the course branch:

```python
        paid = _may_price(tenant) and draft.pricing_type == "paid" and draft.price > 0
        members_only = not paid and _may_price(tenant) and _members_only(tenant, "course")
        params = {
            "title": draft.title[:200],
            "description": draft.description,
            "pricing_type": "paid" if paid else "subscription" if members_only else "free",
            "price": f"{min(draft.price, MAX_PRICE):.2f}" if paid else "0.00",
```

and the class branch:

```python
        price = (_brief_price(tenant, "event") or 0) if _may_price(tenant) else 0
        members_only = price <= 0 and _may_price(tenant) and _members_only(tenant, "event", event_kind)
        params = {
            "title": draft.title[:200],
            "description": draft.description,
            "price": f"{min(price, MAX_PRICE):.2f}",
            "pricing_type": "paid" if price > 0 else "subscription" if members_only else "free",
```

- [ ] **Step 4: One function keeps plans and drafts in step** (`interview_milestones.py`)

Replace `grant_membership` with:

```python
ACCESS_DRAFTS = {"course": "course", "event": "event", "onsite": "event"}  # draft key → access kind


def sync_access(tenant, answers: dict | None = None) -> None:
    """The interview's memberships include exactly what she said: each of
    its plans is linked to the drafts her answers put in it, and each draft
    is priced to match (sold on its own, members only, or free). Runs on
    every turn and after every draft. It writes only what changed, and it
    touches only the interview's own plans and drafts: what she linked by
    hand stays."""
    from decimal import Decimal

    from django.contrib.contenttypes.models import ContentType

    from apps.billing.models import SubscriptionPlanAccess

    from .setup_flow import MAX_PRICE, _may_price, brief_price

    flow = TenantConfig.objects.first().setup_flow or {}
    drafts = flow.get("drafts") or {}
    rows = {key: row for key in ACCESS_DRAFTS if (row := _draft_row(flow, key)) is not None}
    if not rows:
        return
    answers = brief.answers_of(tenant) if answers is None else answers
    plans = drafts.get("plans") or ({DEFAULT_TIER: drafts["plan"]} if drafts.get("plan") else {})
    selling = _may_price(tenant) and answers.get("payments") is not None
    want, ours = set(), set()
    for key, row in rows.items():
        kind = ACCESS_DRAFTS[key]
        event_kind = (drafts.get(key) or {}).get("kind", "live") if kind == "event" else ""
        tiers = brief.access_tiers(answers, kind, event_kind)
        ct = ContentType.objects.get_for_model(type(row)).pk
        ours.add((ct, row.pk))
        want |= {(plans[t], ct, row.pk) for t in tiers if t in plans}
        if answers.get("payments") is None:
            continue  # an interview from before the payments question: its drafts keep their pricing
        price = (brief_price(answers, kind) or 0) if selling else 0
        pricing = "paid" if price > 0 else "subscription" if tiers and selling else "free"
        if row.pricing_type != pricing:
            # Only a change of kind is written: a price she set by hand since stays.
            amount = Decimal(f"{min(price, MAX_PRICE):.2f}") if pricing == "paid" else Decimal("0")
            type(row).objects.filter(pk=row.pk).update(pricing_type=pricing, price=amount)
    have = {
        (a.plan_id, a.content_type_id, a.object_id): a.pk
        for a in SubscriptionPlanAccess.objects.filter(plan_id__in=plans.values())
        if (a.content_type_id, a.object_id) in ours
    }
    if gone := [pk for link, pk in have.items() if link not in want]:
        SubscriptionPlanAccess.objects.filter(pk__in=gone).delete()
    SubscriptionPlanAccess.objects.bulk_create(
        SubscriptionPlanAccess(plan_id=p, content_type_id=c, object_id=o) for p, c, o in want - set(have)
    )
```

Call it in three places:

- `fire()`: right after `sync_site(tenant, answers)`, add `sync_access(tenant, answers)`.
- `run_draft()`: replace the final block with

```python
    sync_access(tenant)
    if kind == "course":
        setup_flow.start_page_build(tenant, "courses")
```

- `create_memberships()`: replace `grant_membership(tenant)` with `sync_access(tenant, answers)`.

Run `grep -rn grant_membership backend/` and update every remaining mention (tests call it by name).

- [ ] **Step 5: "Costs money" means not free** (`interview_golive.py`)

A members-only draft is held, released and made free like a paid one. Change each of these:

| Line | From | To |
|---|---|---|
| 161 | `Course.objects.filter(pk=drafts["course"], pricing_type="paid").first()` | `Course.objects.filter(pk=drafts["course"]).exclude(pricing_type="free").first()` |
| 220 | `Course.objects.filter(pk=drafts.get("course"), pricing_type="paid", is_published=False)` | `Course.objects.filter(pk=drafts.get("course"), is_published=False).exclude(pricing_type="free")` |
| 228 | `row.pricing_type == "paid" and not can_monetize(tenant)` | `row.pricing_type != "free" and not can_monetize(tenant)` |
| 278 | `row.pricing_type == "paid" and not selling` | `row.pricing_type != "free" and not selling` |
| 349 | `Course.objects.filter(pk=drafts["course"], pricing_type="paid").update(…)` | `Course.objects.filter(pk=drafts["course"]).exclude(pricing_type="free").update(pricing_type="free", price=0)` |
| 357 | `model.objects.filter(pk=event["id"], pricing_type="paid").update(…)` | `model.objects.filter(pk=event["id"]).exclude(pricing_type="free").update(pricing_type="free", price=0)` |

In `make_free`, the answers that go with the prices go too (line 334):

```python
    for key in ("course_price", "memberships", "event_price", "course_access", "event_access", "post_access"):
```

Then run `grep -rn 'pricing_type' backend/apps/tenant_config --include='*.py' | grep -v /tests/` and read every other hit: where it means "costs money", make it `!= "free"`; where it means "has a price of its own" (`review_card`'s price line, `_summary`), leave it.

- [ ] **Step 6: Run the tests**

Run: `docker compose exec django pytest apps/tenant_config/tests -q`
Expected: PASS.

- [ ] **Step 7: Phase B gate**

1. `docker compose restart celery-worker`. Then `make test-changed` (it runs the full backend suite because `apps/core/access.py` changed), `make test-frontend`, `make typecheck`, `make lint`. Expected: green.
2. Browser, fresh interview, "Digital Courses" + "Live online classes", "One-time course purchases" + "Monthly membership", two memberships:
   - After the course topic: "How do students get this course?" shows "Buy it once", one tile per membership with its monthly price, and "Free for everyone". Ticking "Free for everyone" clears the rest.
   - Tick one membership only: the price question is skipped, and the course review shows no price.
   - Go Back, add "Buy it once": the price question appears.
   - "Pick for me" says what it set.
3. Admin, after go-live: Billing → Plans → open a membership. The course the interview linked shows ticked. Press Save, reload: it is still ticked. (Review Focus 4.)
4. As a student subscribed to the other membership (use `issue_login_token` for a second student and a bypass subscription in the shell), open the course: locked, and the plan offered is the one that includes it. (Review Focus 2.)
5. A members-only class on `/events` and its page reads "Members only", never "0.00".
6. `make e2e-changed`. Expected: green.

- [ ] **Step 8: Commit**

```bash
git add backend/apps/tenant_config/setup_flow.py backend/apps/tenant_config/interview_milestones.py backend/apps/tenant_config/interview_golive.py backend/apps/tenant_config/tests/test_interview_milestones.py backend/apps/tenant_config/tests/test_interview_golive.py
git commit -m "feat(setup): memberships include what she ticked, and nothing else"
```

---

# Phase C: members-only articles

### Task 9: An article can be for members (backend)

**Files:**
- Modify: `backend/apps/blog/models.py` (`BlogPost`)
- Create: `backend/apps/blog/migrations/00NN_blogpost_pricing_type.py` (generated)
- Modify: `backend/apps/blog/serializers.py`, `backend/apps/blog/views.py`, `backend/apps/blog/urls.py`
- Modify: `backend/apps/billing/serializers/plans.py`, `backend/apps/billing/views/plans.py`, `backend/apps/billing/views/store.py`
- Test: `backend/apps/blog/tests/test_public_api.py`

**Interfaces:**
- Produces: `BlogPost.pricing_type` (`"free" | "subscription"`, default `"free"`), the same field name the paywall reads on every other content model; the public list item gains `members_only: bool`; the public detail gains `locked: bool` and, when locked, a teaser in `body_html`; `GET /api/v1/blog/posts/<slug>/full/` (signed in, with access) returns the full post; the plan access type `"article"`.

- [ ] **Step 1: Write the failing tests** (end of `test_public_api.py`; the module already has `HOST`, `APIClient`, `BlogPost`, `timezone` and a module-level `django_db` mark)

```python
BODY = "<p>The first paragraph.</p><h2>More</h2><p>The secret part.</p>"


@pytest.fixture()
def members_post(tenant_ctx):
    return BlogPost.objects.create(
        title="Members",
        slug="members",
        body_html=BODY,
        excerpt="A short line.",
        status="published",
        published_at=timezone.now(),
        pricing_type="subscription",
    )


def _signed_in(role):
    from apps.accounts.models import User

    user = User.objects.create_user(email=f"{role}@blog.test", name=role, password="x", role=role)  # noqa: S106
    client = APIClient(HTTP_HOST=HOST)
    client.force_authenticate(user)
    return client


def test_a_visitor_gets_the_teaser_and_never_the_rest(members_post):
    visitor = APIClient(HTTP_HOST=HOST)
    data = visitor.get("/api/v1/blog/posts/members/").data
    assert data["locked"] is True
    assert "The first paragraph." in data["body_html"] and "secret" not in data["body_html"]
    assert visitor.get("/api/v1/blog/posts/").data["results"][0]["members_only"] is True


def test_the_full_text_is_for_members_only(members_post):
    assert APIClient(HTTP_HOST=HOST).get("/api/v1/blog/posts/members/full/").status_code in (401, 403)
    assert _signed_in("student").get("/api/v1/blog/posts/members/full/").status_code == 403
    assert "secret" in _signed_in("owner").get("/api/v1/blog/posts/members/full/").data["body_html"]


def test_a_free_article_is_untouched(members_post):
    BlogPost.objects.filter(pk=members_post.pk).update(pricing_type="free")
    data = APIClient(HTTP_HOST=HOST).get("/api/v1/blog/posts/members/").data
    assert data["locked"] is False and "secret" in data["body_html"]
```

- [ ] **Step 2: Run them and see them fail**

Run: `docker compose exec django pytest apps/blog/tests/test_public_api.py -q -k "teaser or members_only or untouched"`
Expected: FAIL (`BlogPost() got unexpected keyword 'pricing_type'`).

- [ ] **Step 3: The field** (`blog/models.py`, in `BlogPost` after `status`)

```python
    # Named like every other content model's, so ContentAccessService gates it.
    pricing_type = models.CharField(
        max_length=20,
        choices=[("free", "Free"), ("subscription", "Members only")],
        default="free",
    )
```

Run: `make makemigrations && make migrate`, then `make test-fresh` once.

- [ ] **Step 4: The teaser and the list flag** (`blog/serializers.py`)

```python
import re

_FIRST_PARAGRAPH = re.compile(r"<p[\s>].*?</p>", re.S)


def teaser(post) -> str:
    """What a visitor reads of a members-only article: its first paragraph,
    or its excerpt when the body does not open with one."""
    from html import escape

    found = _FIRST_PARAGRAPH.search(post.body_html or "")
    return found.group() if found else f"<p>{escape(post.excerpt)}</p>"
```

`BlogPostListSerializer`:

```python
    members_only = serializers.SerializerMethodField()

    class Meta:
        model = BlogPost
        fields = ("slug", "title", "excerpt", "tags", "published_at", "cover_photo_url", "members_only")

    def get_members_only(self, obj):
        return obj.pricing_type != "free"
```

`BlogPostDetailSerializer`: add `"locked"` to `fields` and

```python
    locked = serializers.SerializerMethodField()

    def get_locked(self, obj):
        """Whether this response holds only the teaser. A view that has
        checked the reader passes ``full=True`` in the context."""
        return obj.pricing_type != "free" and not self.context.get("full")

    def get_body_html(self, obj):
        if self.get_locked(obj):
            return teaser(obj)
        return inject_placement_images(obj.body_html, resolve_placements(obj))
```

`BlogPostAdminSerializer`: add `"pricing_type"` to its `fields` (writable).

- [ ] **Step 5: The full text, for those who may read it** (`blog/views.py`, `blog/urls.py`)

`OwnerPostPreview` shows the coach her own post in full: give it

```python
    def get_serializer_context(self):
        return {**super().get_serializer_context(), "full": True}
```

Below it:

```python
class MemberPostDetail(generics.RetrieveAPIView):
    """A published post in full, for a signed-in reader the paywall lets in
    (a member of a plan that includes it, or the coach)."""

    permission_classes = [IsAuthenticated]
    serializer_class = BlogPostDetailSerializer
    lookup_field = "slug"

    def get_queryset(self):
        return BlogPost.objects.filter(status="published").select_related("cover_photo")

    def get_object(self):
        from rest_framework.exceptions import PermissionDenied

        from apps.core.access import ContentAccessService

        post = super().get_object()
        if not ContentAccessService().check_access(self.request.user, post):
            raise PermissionDenied
        return post

    def get_serializer_context(self):
        return {**super().get_serializer_context(), "full": True}
```

Import `IsAuthenticated` beside `AllowAny`. In `urls.py`, before the `posts/<slug:slug>/` line is not needed (the paths differ), so add after it:

```python
    path("posts/<slug:slug>/full/", MemberPostDetail.as_view(), name="blog-member-detail"),
```

Then prove nothing else serves the body to a visitor. Run: `grep -rn "body_html" backend/apps --include='*.py' | grep -v -E "/tests/|migrations/"`. Expected: the two serializers above, the admin and AI writers (coach only), and `PlatformBlogPost` code (a different model). Any other anonymous reader of `BlogPost.body_html` must go through `BlogPostDetailSerializer`.

- [ ] **Step 6: Plans can include an article** (`billing/`)

`PlanAccessWriteItemSerializer.CONTENT_TYPE_MAP` gains `"article": "blog.blogpost"`. `_resolve_access_items.model_map` gains `"blogpost": ("blog", "blogpost", "title", "slug")`. In `store.py`, `_plan_only_items()` gains the members-only posts (a post has no price, description or thumbnail in this shape):

```python
    from apps.blog.models import BlogPost

    posts = [
        {
            "id": p.pk,
            "title": p.title,
            "description": p.excerpt,
            "type": "article",
            "price": 0,
            "currency": currency,
            "thumbnail_url": "",
            "is_active": p.status == "published",
            "item_count": 0,
            "original_price": None,
            "_obj": p,
        }
        for p in BlogPost.objects.filter(pricing_type="subscription")
    ]
```

returned after the other rows, and `type_to_model` gains `"article": BlogPost`.

- [ ] **Step 7: Run the tests, regenerate types, commit**

Run: `docker compose exec django pytest apps/blog apps/billing/tests/test_plan_access.py apps/billing/tests/test_store.py -q`
Expected: PASS.

Run: `cd frontend-customer && npm run gen:api` and read the diff (`pricing_type` on the admin post, `locked`, `members_only`).

```bash
git add backend/apps/blog backend/apps/billing/serializers/plans.py backend/apps/billing/views/plans.py backend/apps/billing/views/store.py frontend-customer/src/types/api-generated.ts
git commit -m "feat(blog): an article can be for members, with a teaser for everyone else"
```

### Task 10: The article page, the editor switch, the picker (frontend)

**Files:**
- Modify: `frontend-customer/src/lib/blog-public.ts`
- Modify: `frontend-customer/src/app/(public)/blog/[slug]/page.tsx`, `frontend-customer/src/app/(public)/blog/page.tsx`
- Modify: `frontend-customer/src/app/admin/blog/[id]/page.tsx`
- Modify: `frontend-customer/src/components/billing/content-picker.tsx`

**Interfaces:**
- Consumes: Task 9's `locked`, `members_only`, `/full/` and the `article` type.

- [ ] **Step 1: Fetch helpers** (`lib/blog-public.ts`)

Add to `BlogPostPublic`:

```ts
  /** A members-only article of which this response holds only the teaser. */
  locked?: boolean;
  members_only?: boolean;
```

```ts
/** A members-only post in full, for the signed-in reader who may read it
 *  (null for everyone else). */
export async function fetchMemberPost(
  slug: string,
): Promise<BlogPostPublic | null> {
  try {
    return await serverFetch<BlogPostPublic>(
      `/api/v1/blog/posts/${encodeURIComponent(slug)}/full/`,
      { cache: "no-store" },
    );
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: The page** (`blog/[slug]/page.tsx`)

After the `Promise.all`:

```tsx
  // A members-only post: its full text for a reader who may read it, else
  // the teaser. Drafts are visible to the coach only (guided setup preview).
  const full = published?.locked ? await fetchMemberPost(slug) : null;
  const post = full ?? published ?? (await fetchOwnerPreviewPost(slug));
  if (!post) notFound();
```

In `jsonLd`, tell search engines the truth about the paywall:

```tsx
    ...(post.locked ? { isAccessibleForFree: false } : {}),
```

Directly after the element that renders the article body (the one with `className={PROSE}`), add:

```tsx
        {post.locked && (
          <aside className="mt-10 rounded-xl border bg-muted/30 p-6 text-center">
            <p className="text-lg font-semibold">
              The rest of this article is for members.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Join to read it, with everything else the membership includes.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-3">
              <NavLink
                href="/plans"
                className="inline-flex h-10 items-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground"
              >
                See memberships
              </NavLink>
              <NavLink
                href="/login"
                className="inline-flex h-10 items-center rounded-full border px-5 text-sm font-medium"
              >
                I’m a member, sign in
              </NavLink>
            </div>
          </aside>
        )}
```

`/login` is the sign-in link the public event page uses (`event-detail-client.tsx`, line 201). The teaser has no headings, so `headings` is empty: check in the browser that the contents box does not render empty, and wrap it in `headings.length > 0 &&` if it does.

In `blog/page.tsx`, a members-only post says so beside its date (after the `<time>` element at line 44):

```tsx
              {post.members_only && (
                <span className="ml-2 rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                  Members
                </span>
              )}
```

- [ ] **Step 3: The editor switch** (`admin/blog/[id]/page.tsx`)

The page keeps the post in `post` (`useState<BlogPostAdmin | null>`, line 39) and changes fields with `patch({...})` (line 64). Add `pricing_type: "free" | "subscription"` to the `BlogPostAdmin` type, make sure the save at line 70-77 sends it (add it to the field list if the save names its fields), and put this above the body editor at line 207:

```tsx
            <label className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <span>
                <span className="block text-sm font-medium">Members only</span>
                <span className="block text-xs text-muted-foreground">
                  Visitors read the first paragraph. Choose the memberships
                  that include it under Billing, Plans.
                </span>
              </span>
              <Switch
                checked={post.pricing_type === "subscription"}
                onCheckedChange={(on) =>
                  patch({ pricing_type: on ? "subscription" : "free" })
                }
              />
            </label>
```

`Switch` comes from `@/components/ui/switch`.

- [ ] **Step 4: The picker** (`content-picker.tsx`)

Add `{ label: "Article", value: "article" }` to `TYPE_FILTERS`, `article: "Article"` to `TYPE_LABEL_MAP` and `article: "secondary"` to `TYPE_BADGE_VARIANT`.

- [ ] **Step 5: Run the checks and commit**

Run: `cd frontend-customer && npx tsc --noEmit && npx vitest run src/lib`
Expected: PASS.

```bash
git add frontend-customer/src/lib/blog-public.ts "frontend-customer/src/app/(public)/blog" "frontend-customer/src/app/admin/blog/[id]/page.tsx" frontend-customer/src/components/billing/content-picker.tsx
git commit -m "feat(blog): members-only articles on the site and in the editor"
```

### Task 11: The interview asks who reads the first article; then the Phase C gate

**Files:**
- Modify: `backend/apps/tenant_config/interview_brief.py` (`FIELDS`, `_NOT_FACTS`)
- Modify: `backend/apps/tenant_config/interview.py` (`SYSTEM`, `NOTED_NAMES`)
- Modify: `backend/apps/tenant_config/interview_milestones.py` (`ACCESS_DRAFTS`, `_draft_row`, `sync_access`)
- Modify: `backend/apps/tenant_config/setup_flow.py` (`_create`, the post branch)
- Modify: `frontend-customer/src/lib/interview.ts` (`SECTIONS`)
- Test: `test_interview_brief.py`, `test_interview_milestones.py`

**Interfaces:**
- Consumes: `access_of(answers, "post")`, `access_tiers(answers, "post")` (Task 7, already kind-agnostic), `BlogPost.pricing_type` (Task 9).
- Produces: `answers["post_access"]`; `sync_access` covers the article draft.

- [ ] **Step 1: Write the failing tests**

`test_interview_brief.py`:

```python
def test_the_article_is_free_or_for_members_and_never_sold_on_its_own():
    answers = {"offers": ["articles", "community"], "payments": ["membership"], "memberships": ["community"]}
    ids = [f.id for f in brief.required(answers)]
    assert ids.index("article_topic") < ids.index("post_access")
    assert brief.options_for(brief.FIELD_BY_ID["post_access"], answers)[0] == (
        "Community membership",
        "Free for everyone",
    )
    assert brief.access_of(answers, "post") == ["free"]  # left to the guide: free, it brings readers in
    assert brief.access_of({**answers, "post_access": ["community"]}, "post") == ["community"]
```

`test_interview_milestones.py`:

```python
def test_a_members_article_is_linked_to_her_membership(tenant_ctx, config, owner, side_effects):
    from apps.blog.models import BlogPost

    answers = {
        **HOME,
        "sells": "paid",
        "offers": ["articles", "community"],
        "payments": ["membership"],
        "memberships": ["community"],
        "article_topic": "Desk stretches",
        "post_access": ["community"],
    }
    brief.save_answers(tenant_ctx, answers)
    with mock.patch("apps.core.copilot.content._give_cover"):
        setup_flow.create_fallback_draft(tenant_ctx, owner, "post", answers)
    ms.create_memberships(tenant_ctx, answers)
    post = BlogPost.objects.get()
    assert post.pricing_type == "subscription"
    assert _links() == {("Community membership", "blogpost", post.pk)}
    ms.sync_access(tenant_ctx, {**answers, "post_access": ["free"]})
    post.refresh_from_db()
    assert post.pricing_type == "free" and _links() == set()
```

- [ ] **Step 2: Run them and see them fail**

Run: `docker compose exec django pytest apps/tenant_config/tests -q -k "article_is_free or members_article"`
Expected: FAIL (`'post_access' is not in list`).

- [ ] **Step 3: The field** (`interview_brief.py`, after `article_topic`)

```python
    Field(
        "post_access",
        "Who reads the first article",
        "Who can read this article?",
        kind="access",
        needs=("articles",),
        pays=("membership",),
        group="post",
        multi=True,
        alone="Free for everyone",
        delegable=True,
        why="Free articles bring new readers in from search. Members-only ones show their first paragraph.",
    ),
```

Add `"post_access"` to `_NOT_FACTS`. In `interview.py`, name `"post_access"` in the `SYSTEM` line Task 7 added (`For "course_access", "event_access" and "post_access" give…`) and add `"post_access": "who reads your article"` to `NOTED_NAMES`. In `lib/interview.ts`, put `"post_access"` after `"article_topic"` in `SECTIONS`.

- [ ] **Step 4: The draft and the links**

`setup_flow.py`, `_create`, the post branch:

```python
    params = {
        "title": draft.title[:200],
        "excerpt": draft.excerpt[:300],
        "body_html": draft.body_html,
        "pricing_type": "subscription" if _may_price(tenant) and _members_only(tenant, "post") else "free",
    }
    return content.create_blog_post(user, params)["id"]
```

`interview_milestones.py`:

```python
ACCESS_DRAFTS = {"course": "course", "event": "event", "onsite": "event", "post": "post"}
```

`_draft_row` learns the article (its ref is an id, like the course's):

```python
    if kind == "post":
        from apps.blog.models import BlogPost

        return BlogPost.objects.filter(pk=ref).first()
```

placed right after the `if kind == "course":` branch. An article has no price column, so in `sync_access` the write becomes:

```python
        if row.pricing_type != pricing:
            # Only a change of kind is written: a price she set by hand since stays.
            amount = Decimal(f"{min(price, MAX_PRICE):.2f}") if pricing == "paid" else Decimal("0")
            changed = {"pricing_type": pricing, **({"price": amount} if hasattr(row, "price") else {})}
            type(row).objects.filter(pk=row.pk).update(**changed)
```

`brief_price(answers, "post")` returns `0.0` (an article is never sold on its own), so `pricing` is `subscription` or `free`.

- [ ] **Step 5: Run the tests**

Run: `docker compose exec django pytest apps/tenant_config/tests apps/blog -q`
Expected: PASS.

- [ ] **Step 6: Phase C gate**

1. `docker compose restart celery-worker`. `make test-changed`, `make test-frontend`, `make typecheck`, `make lint`. Expected: green.
2. Browser, fresh interview with "Articles" + "Community" and "Monthly membership": after the article topic, "Who can read this article?" shows her membership and "Free for everyone". Pick the membership and go live.
3. Signed out, open the article: the first paragraph, then "The rest of this article is for members" with both buttons. View the page source and search for a sentence from the second section: not there. (Review Focus 5.)
4. Signed in as a subscriber of that membership: the whole article, no box.
5. Admin → Blog → the post: "Members only" is on. Turn it off, save, reload signed out: the whole article.
6. Admin → Billing → Plans → the membership: the article shows ticked under "Article".
7. `make e2e-changed`. Expected: green.

- [ ] **Step 7: Commit**

```bash
git add backend/apps/tenant_config/interview_brief.py backend/apps/tenant_config/interview.py backend/apps/tenant_config/interview_milestones.py backend/apps/tenant_config/setup_flow.py backend/apps/tenant_config/tests/test_interview_brief.py backend/apps/tenant_config/tests/test_interview_milestones.py frontend-customer/src/lib/interview.ts
git commit -m "feat(setup): ask who reads the first article"
```

---

## After the last phase

- Deploy only from a clean worktree: `make deploy` ships the working tree, and this one is shared (memory `reference-ha-deploy-standby-race`). Two tenant migrations ship (`live/0018`, the blog one).
- On prod, check with the one test tenant (`demo-yoga`, through superadmin impersonation): an interview finished before this plan is asked the new questions on its next visit to /setup (in-person review, access); answering them must not redraft or republish anything.
- `docs/wiki/` refreshes itself after the commits; commit its diff with the next commit.
