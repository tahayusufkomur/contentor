# Access: Ways In and Windows — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace each sellable item's single "Pricing Type" dropdown with an Access section where every way in (sell it once, in subscriptions, free, and "Give access" per student) can be combined, each with its own window, and have the paywall, the student pages, the assistant and focus mode all use that one model.

**Architecture:**
- One backend module, `apps/billing/ways.py`, owns a JSON description of an item's ways (§5.4 of the spec) and is the only writer of `pricing_type`, `price`, plan links and windows.
- `ContentAccessService` (`apps/core/access.py`) stays the only gate. It learns windows: purchases and grants are stamped per student, while subscription and free windows are read live.
- The frontend gets one `AccessSection` component and pure helpers in `lib/access/`. Both backend and frontend describe a setup in the same plain words.

**Tech Stack:** Django 5.1 + DRF + django-tenants, pytest. Next.js 14 + vitest, Playwright e2e. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-19-access-rights-design.md` (approved 2026-10-19). Mockup: `.superpowers/brainstorm/82250-1792409654/content/access-section.html`. It is git-ignored, so open it from the main checkout.

**When to build:** the owner chose focus mode for every kind first. Phases A–D touch no focus-mode file except where a task says so, but they still change the course/event/download forms that focus mode uses. Start Phase A only once the owner says go. Start Phase E only after every stage of `docs/superpowers/plans/2026-10-19-focus-mode-every-kind.md` has shipped, and begin it with Task E0.

## Global Constraints

**Rules from the spec:**
- Months are 30 days and a year is 365. Store days only. Display in the largest exact unit: `days % 365 == 0` gives years, else `% 30` gives months, else `% 7` gives weeks, else days.
- Calendar dates are read in the creator's time zone (`TenantConfig.timezone`). `opens_on` starts at 00:00 of that day and `closes_on` ends at 23:59:59 of that day.
- A purchase keeps its terms: its window is stamped when the payment completes. Subscription and free windows are live.
- Free with no window covers everyone. The other ways keep their stored settings but do nothing while it is on.
- At least one way is always set. `set_ways` refuses an empty set.
- Owner-only: which subscriptions include an item, and a bundle's terms. A coach can change Free, Sell it once and the windows.
- Per kind:
  - Zoom classes are Free only.
  - A bundle is Sell it once only, with an optional window.
  - "Give access" is for courses only.
- Copy for creators uses plain words with no codes or ids. In assistant replies say "creator" and "Creator studio", never coach, teacher or admin.
- A price only ever comes from the creator's numbers or words. Neither the assistant nor focus mode invents a price or a subscription.

**Repo conventions:**
- **Frontend feedback:** `<Button loading>` and `useAsyncAction`, sonner toasts, inline field errors, `<NavLink>` and `useNavigate()`, motion only behind `motion-safe:`. `make lint` enforces this.
- **Shared checkout:**
  - Other agent sessions commit to `main` on the same stack. Stage by explicit path and run `pre-commit run --files <paths>` first, then `git commit --no-verify`.
  - Before any test run, check that no other run holds the test database:
    `docker compose exec -T postgres psql -U "$(docker compose exec -T postgres printenv POSTGRES_USER | tr -d '\r')" -d postgres -tAc "select count(*) from pg_stat_activity where datname like 'test%'"` must print `0`. Also run `pgrep -fl 'playwright test'`.
  - Run one heavy job at a time.
- **Payment-path gaps:** a separate session is fixing them in `apps/billing/views/payments.py` and `webhooks*.py`. Rebase onto its commits before Task A3 and read `grant_access_for_payment` as it is then.
- **GitNexus:** run `impact` before editing `ContentAccessService.get_access_info`, `bulk_check_access`, `grant_access_for_payment` and `apply_access`. `get_access_info` was HIGH risk (14 direct callers) on 2026-10-19.
- **Commands:**
  - One backend test: `docker compose exec -T django pytest apps/<app>/tests/<file>.py::<name> -q -p no:cacheprovider`
  - One frontend test: `cd frontend-customer && npx vitest run <path>`
  - The e2e spec while iterating: `make e2e-spec SPEC=40-access`
  - At the end of each phase: `make test-changed` and `make e2e-changed`
- After a serializer change, run `cd frontend-customer && npm run gen:api` and read the `src/types/api-generated.ts` diff.
- Migrations take the next free number in each app as it is then, since focus-mode stages add their own. After the first new migration the test database needs `--create-db` once; `make test-changed` plans that.

## Review Focus

1. **Time-zone edges.** A creator in `Europe/Istanbul` sets "free until 30 Nov". It must close at 23:59:59 Istanbul time (20:59:59 UTC), not at UTC midnight. Pinned in Task A4: `test_a_calendar_close_ends_at_the_end_of_that_day_in_the_creators_zone`.
2. **An off-sale plan that still links an item.** Its existing members keep access. Visitors are never offered that plan. Pinned in Task A4: `test_members_of_an_off_sale_plan_keep_access_but_visitors_are_not_offered_it`.
3. **Buying again after a window closes.** A second purchase opens access again. Checkout refuses only while a purchase is open or not yet open. "My courses" lists the course once. Pinned in Task A5: `test_buying_again_after_the_window_closed_opens_it_again`.
4. **Bad window numbers.** 0, negative, more than 3650 days, a malformed date, or both bounds of one pair set are refused with a creator-readable error, never a 500. Pinned in Task A2: `test_windows_outside_the_rules_are_refused`.
5. **European price input.** "49,90" in the Access section reads as 49.90. "0", "", "-5" and "abc" show "Add a price above 0" and nothing is sent. Pinned in Task B2: `parsePrice` tests.

---

## Phase A — The ways, and a paywall that honours windows (backend only)

Phase A ships on its own. No screen changes, and every existing item keeps its access.

### Task A1: Storage for windows

**Files:**
- Modify: `backend/apps/billing/models/core.py`:
  - add an abstract `AccessWindowFields` base
  - `SubscriptionPlanAccess` extends it
  - new `AccessWindow` model
  - `PaymentItem` gets two fields
- Modify: `backend/apps/billing/models/__init__.py` (export `AccessWindow`)
- Modify: `backend/apps/courses/models.py` (`Enrollment` gets two fields)
- Modify: `backend/apps/live/models.py:120-124` (`LiveStream.pricing_type` gets the `("subscription", "Included in subscription")` choice)
- Create: migrations in `billing`, `courses` and `live` (next free numbers)
- Test: `backend/apps/billing/tests/test_ways_storage.py`

**Interfaces:**
- Produces:
  - `AccessWindowFields`, abstract, with `opens_after_days`, `opens_on`, `closes_after_days`, `closes_on`. The two `*_days` fields are `PositiveIntegerField(null=True, blank=True)` and the two `*_on` fields are `DateField(null=True, blank=True)`.
  - `AccessWindow(AccessWindowFields)` with `content_type` (FK to ContentType), `object_id` (PositiveIntegerField), and `way` (CharField, choices `free` / `buy`). `unique_together = ("content_type", "object_id", "way")`.
  - `SubscriptionPlanAccess` carries the same four fields.
  - `PaymentItem.access_starts_at` and `PaymentItem.access_ends_at`, both `DateTimeField(null=True, blank=True)`.
  - `Enrollment.access_starts_at` and `Enrollment.access_ends_at`, same type.

- [ ] **Step 1: Write the failing tests**
```python
def test_an_item_has_at_most_one_window_per_way(tenant_ctx, course):
    AccessWindow.objects.create(content_type=ct(course), object_id=course.pk, way="buy", closes_after_days=365)
    with pytest.raises(IntegrityError):
        AccessWindow.objects.create(content_type=ct(course), object_id=course.pk, way="buy")

def test_plan_links_and_purchases_carry_window_fields(tenant_ctx, course, plan):
    link = SubscriptionPlanAccess.objects.create(plan=plan, content_type=ct(course), object_id=course.pk, opens_after_days=30)
    assert link.closes_on is None and link.opens_after_days == 30

def test_a_live_stream_can_be_members_only(tenant_ctx, owner):
    stream = LiveStream.objects.create(title="S", instructor=owner, pricing_type="subscription")
    stream.full_clean(exclude=["room_name"])
```
- [ ] **Step 2: Run them.** `... pytest apps/billing/tests/test_ways_storage.py -q`. Expected: fail (no `AccessWindow`).
- [ ] **Step 3:** Add the models and fields, then run `docker compose exec -T django python manage.py makemigrations billing courses live`.
- [ ] **Step 4: Run them.** Expected: pass. Then run `make migrate`.
- [ ] **Step 5: Commit** the models, the three migrations and the test: `feat(billing): storage for access windows`.

### Task A2: `apps/billing/ways.py`, the one writer

**Files:**
- Create: `backend/apps/billing/ways.py`
- Test: `backend/apps/billing/tests/test_ways.py`

**Interfaces:**
- Consumes: Task A1's models; `apps.tenant_config.interview_brief.money` (amount → "€49"); `apps.core.permissions.IsOwner` semantics (`user.role == "owner"`).
- Produces:
  - `KINDS: dict[str, str]`:
    ```python
    {"course": "courses.course", "download": "downloads.downloadfile",
     "live_class": "live.liveclass", "live_stream": "live.livestream",
     "onsite_event": "live.onsiteevent", "zoom_class": "live.zoomclass",
     "bundle": "billing.bundle"}
    ```
  - `ALLOWED: dict[str, tuple[str, ...]]`: `zoom_class` gets `("free",)`, `bundle` gets `("buy",)`, and every other kind gets `("free", "buy", "plans")`.
  - `class WaysError(Exception)`. Its `code` is one of `not_found`, `not_allowed`, `no_way`, `price`, `plan`, `window` or `owner_only`. `str(error)` is a creator-readable sentence.
  - `item_for(kind: str, pk: int) -> Model` (raises `WaysError("not_found")`) and `kind_of(item) -> str`.
  - `ways_of(item) -> dict`. Shape:
    ```python
    {"free": {"window": W | None} | None,
     "buy": {"price": "49.00", "window": W | None} | None,
     "plans": [{"plan_id": int, "window": W | None}]}
    ```
    `W` is `{"opens_after_days"?, "opens_on"? (ISO date), "closes_after_days"?, "closes_on"?}` with only the keys that are set.
  - `validate(item, ways: dict, *, actor=None) -> None`. It raises `WaysError` and writes nothing. The assistant's card (Task D2) calls it alone.
  - `set_ways(item, ways: dict, *, actor=None) -> dict`. It calls `validate`, then writes in one transaction and returns `ways_of(item)`. `actor=None` means system writes such as /setup.
  - `apply_shorthand(item, *, pricing_type: str | None = None, price=None, actor=None) -> dict`, the legacy item-payload mapping below.
  - `describe(ways: dict) -> str` and `span_text(days: int) -> str`.
- Reading the storage (spec §5.5):
  - **free** is set if `pricing_type == "free"` or an `AccessWindow(way="free")` row exists. That row is its window.
  - **buy** is set if `pricing_type == "paid"`, or if Free is set with no window and `price > 0`. In the second case the buy setting is kept but covered. Its window is the `AccessWindow(way="buy")` row.
  - **plans** are the item's `SubscriptionPlanAccess` rows, each with its own window.
- Writing it:
  - `pricing_type` is `free` when Free has no window, else `paid` when buy is set, else `subscription` when plans are set, else `free` (only a windowed free way).
  - `price` is buy's price, otherwise `0`.
  - Delete window rows that are no longer sent.
  - Keep links whose plan is still listed (update their window), add new links, and delete the rest.
- `apply_shorthand` mapping:
  - `"free"` → Free with no window, keeping buy and plans (covered).
  - `"paid"` + price → buy at that price with the current buy window, current plans, no free.
  - `"subscription"` → current plans only. If there are none, raise `WaysError("plan")`.
  - Price alone → set buy to that price if it is above 0, keeping everything else. At 0, drop buy, and if no way is left, use Free with no window.

- [ ] **Step 1: Write the failing tests** (fixtures: `owner`, `coach`, `course` paid €49, plans `gold` and `silver`, a bundle, a Zoom class)
```python
def test_ways_of_reads_todays_items(course):
    assert ways_of(course) == {"free": None, "buy": {"price": "49.00", "window": None}, "plans": []}

def test_sell_once_with_a_year_and_two_plans_after_a_month(course, gold, silver, owner):
    w = set_ways(course, {"free": None, "buy": {"price": "49", "window": {"closes_after_days": 365}},
                          "plans": [{"plan_id": gold.pk, "window": {"opens_after_days": 30}},
                                    {"plan_id": silver.pk, "window": {"opens_after_days": 30}}]}, actor=owner)
    course.refresh_from_db()
    assert (course.pricing_type, course.price) == ("paid", Decimal("49.00"))
    assert w["plans"][0]["window"] == {"opens_after_days": 30}

def test_free_always_covers_and_keeps_the_other_settings(course, gold, owner):
    set_ways(course, {"free": {"window": None}, "buy": {"price": "49", "window": None},
                      "plans": [{"plan_id": gold.pk, "window": None}]}, actor=owner)
    course.refresh_from_db()
    assert course.pricing_type == "free" and course.price == Decimal("49.00")
    assert ways_of(course)["buy"] == {"price": "49.00", "window": None}

def test_a_free_window_sits_beside_a_price(course, owner):
    set_ways(course, {"free": {"window": {"closes_on": "2026-10-26"}}, "buy": {"price": "29", "window": None}, "plans": []}, actor=owner)
    course.refresh_from_db()
    assert course.pricing_type == "paid"

def test_nothing_set_is_refused(course, owner):
    with pytest.raises(WaysError) as e: set_ways(course, {"free": None, "buy": None, "plans": []}, actor=owner)
    assert e.value.code == "no_way"

def test_a_price_must_be_above_zero(course, owner): ...          # buy price "0" -> code "price"
def test_a_coach_cannot_change_which_plans_include_it(course, gold, coach): ...  # code "owner_only"; same plans list passes
def test_a_zoom_class_is_free_only(zoom, owner): ...             # buy -> code "not_allowed"
def test_a_bundle_is_sold_once_only(bundle, owner): ...          # free -> code "not_allowed"
def test_windows_outside_the_rules_are_refused(course, owner):   # Review Focus 4
    for bad in ({"closes_after_days": 0}, {"closes_after_days": -3}, {"closes_after_days": 3651},
                {"closes_on": "26/10/2026"}, {"closes_after_days": 30, "closes_on": "2026-12-31"}):
        with pytest.raises(WaysError) as e:
            set_ways(course, {"free": None, "buy": {"price": "49", "window": bad}, "plans": []}, actor=owner)
        assert e.value.code == "window"
def test_saving_keeps_a_kept_links_row_and_its_window(course, gold, owner): ...  # same pk before and after
def test_shorthand_price_edit_keeps_the_plans(course, gold, owner):
    set_ways(course, {"free": None, "buy": None, "plans": [{"plan_id": gold.pk, "window": None}]}, actor=owner)
    apply_shorthand(course, price="39", actor=owner)
    assert ways_of(course)["plans"] and ways_of(course)["buy"]["price"] == "39.00"
def test_describe_says_it_in_plain_words(gold, silver):
    assert describe({"free": {"window": None}, "buy": None, "plans": []}) == "Free for everyone."
    assert describe({"free": None, "buy": {"price": "29", "window": None}, "plans": []}) == "€29 once, theirs to keep."
    assert describe({"free": None, "buy": {"price": "49", "window": {"closes_after_days": 365}},
                     "plans": [{"plan_id": gold.pk, "window": {"opens_after_days": 30}},
                               {"plan_id": silver.pk, "window": {"opens_after_days": 30}}]}
                    ) == "€49 once with 1 year of access; in Gold and Silver after 1 month of membership."
    assert describe({"free": {"window": {"closes_on": "2026-10-26"}}, "buy": {"price": "29", "window": None}, "plans": []}
                    ) == "Free until 26 Oct 2026; €29 once, theirs to keep."
```
(The tenant charges in EUR in these fixtures. Set the tenant currency the way `apps/core/tests` already do.)
- [ ] **Step 2: Run them.** Expected: fail on import.
- [ ] **Step 3: Implement `ways.py`.** Plan names in `describe` come from `SubscriptionPlan.name`. Plans with the same window are joined with " and ". A missing plan id raises `WaysError("plan")`. The window limits are 1 ≤ days ≤ 3650, at most one of each pair, and ISO dates only.
- [ ] **Step 4: Run them.** Expected: pass.
- [ ] **Step 5: Commit** `ways.py` and its test: `feat(billing): one writer for an item's ways in`.

### Task A3: Stamping a purchase's window

**Files:**
- Modify: `backend/apps/billing/ways.py` (add `window_bounds` and `stamp`)
- Modify: `backend/apps/billing/views/payments.py` (`grant_access_for_payment`, ~line 534)
- Test: `backend/apps/billing/tests/test_ways_stamp.py`

**Interfaces:**
- Produces:
  - `window_bounds(window: dict | None, anchor: datetime) -> tuple[datetime, datetime | None]`:
    - start is `anchor`, plus `opens_after_days` if set, or `max(anchor, 00:00 of opens_on in the tenant zone)` if `opens_on` is set
    - end is `anchor + closes_after_days`, or 23:59:59 of `closes_on` in the tenant zone, or `None`
  - `stamp(item, paid_at: datetime) -> tuple[datetime, datetime | None]`: `window_bounds` of the item's buy window.
- `grant_access_for_payment` sets `access_starts_at` and `access_ends_at` on every PaymentItem it completes, the bundle's included. It only writes rows whose `access_starts_at` is null, so a webhook replay is a no-op.

- [ ] **Step 1: Write the failing tests**
```python
def test_a_years_access_ends_a_year_after_payment(...): # buy window closes_after_days=365, paid 2026-07-19 -> ends 2027-07-19
def test_a_calendar_close_ends_at_the_end_of_that_day(...): # tenant zone Europe/Istanbul, closes_on 2026-12-31 -> 2026-12-31 20:59:59 UTC
def test_a_presale_opens_on_its_date(...): # opens_on 2026-11-01, paid 2026-10-19 -> starts 2026-11-01 00:00 local
def test_editing_the_item_later_leaves_the_purchase_as_bought(...): # set_ways after grant -> PaymentItem unchanged
def test_a_bundle_purchase_is_stamped_from_the_bundles_window(...):
def test_replaying_the_webhook_keeps_the_first_stamp(...):
```
- [ ] **Step 2: Run them.** Expected: fail.
- [ ] **Step 3: Implement.** Run GitNexus `impact` on `grant_access_for_payment` first.
- [ ] **Step 4: Run them,** plus `apps/billing/tests/test_marketplace_checkout.py` and `test_payments.py`. Expected: pass.
- [ ] **Step 5: Commit:** `feat(billing): a purchase keeps the window it was bought with`.

### Task A4: The paywall reads windows

**Files:**
- Modify: `backend/apps/core/access.py` (`AccessInfo`, `get_access_info`, `bulk_check_access`, `get_unlock_options`, the helpers)
- Modify: `backend/apps/courses/tests/test_views.py`. Rewrite `TestSubscriptionPricingType`: the "any active subscription" rule is gone.
- Test: `backend/apps/core/tests/test_access_windows.py`; existing `backend/apps/core/tests/test_access_service.py`

**Interfaces:**
- Consumes: `ways.ways_of`, `ways.window_bounds`.
- Produces:
  - `AccessInfo` gains `access_ends_at: datetime | None = None` and `opens_at: datetime | None = None`.
  - `get_access_info(user, content)` accepts an anonymous user. That user only gets an open calendar free window.
  - Order of checks: owner/coach → free way open → an open purchase (direct or bundle, from the stamps) → an open grant (`Enrollment.granted`, from its stamps) → an open plan link (`window_bounds(link window, subscription.created_at)` for the user's active subscription to that plan) → no access.
  - `opens_at` is the earliest future start among the student's ways. `access_ends_at` is the end of the way that opened it. A forever way wins over a dated one.
  - `get_unlock_options(content)` adds `"window"` (the stored window or `None`) to `purchase`, to each plan and to a new `"free"` key (present only when a free window exists). It offers active plans only.
  - `bulk_check_access` returns the same answer as `get_access_info` for every item.
- Remove `_is_in_any_plan`, `_batch_plan_linked*` and every `pricing_type == "subscription"` branch that meant "any active subscription".

- [ ] **Step 1: Write the failing tests.** Control "now" the way the repo already does: `with mock.patch("django.utils.timezone.now", return_value=...)` (see `apps/core/tests/test_copilot_context.py:203`). Set `Subscription.created_at` and `User.date_joined` with `.update()` after creating the row, because both are `auto_now_add`.
```python
def test_a_gold_member_waits_until_their_window_opens(...):   # joined 2026-10-09, opens_after_days=30, now 2026-10-19
    info = service.get_access_info(member, course)            # course is also sold once at €49
    assert not info.has_access and info.opens_at.date() == date(2026, 11, 8)
    assert "purchase" in info.unlock_methods                  # a waiting member can still buy it
def test_items_reached_through_a_bundle_follow_the_bundles_window(...):  # bundle stamp ended -> no access via "bundle"
def test_a_gold_member_after_the_wait_is_in(...):             # joined 2026-09-04 -> has_access, reason "subscription"
def test_a_purchase_ends_with_its_stamp(...):                 # access_ends_at in the past -> no access, unlock_methods ["purchase"]
def test_a_buyer_sees_when_their_access_ends(...):            # info.access_ends_at == stamped end
def test_a_free_window_opens_it_to_everyone_until_it_closes(...):  # anonymous: has_access until 2026-10-26 23:59:59 local, not after
def test_first_days_after_joining_is_free_for_new_students(...):    # free window opens on joining, closes_after_days 7 from date_joined
def test_a_calendar_close_ends_at_the_end_of_that_day_in_the_creators_zone(...):  # Review Focus 1
def test_members_of_an_off_sale_plan_keep_access_but_visitors_are_not_offered_it(...):  # Review Focus 2
def test_a_granted_course_honours_its_window(...):            # Enrollment.granted with access_ends_at past -> no access
def test_bulk_matches_single_for_every_setup(...):            # parametrize over the setups above; compare has_access, access_reason, dates
def test_unlock_options_carry_each_ways_window(...):          # purchase.window == {"closes_after_days": 365}; plans[0].window == {"opens_after_days": 30}
```
- [ ] **Step 2: Run them.** Expected: fail.
- [ ] **Step 3: Implement.** Run GitNexus `impact` on `get_access_info` and `bulk_check_access` first. Keep the batched queries in `bulk_check_access`, at one query per source.
- [ ] **Step 4: Run them, then `make test-changed`.** It plans the full backend suite, since this is shared runtime. Expected: all pass. Rewrite every test that relied on "any active subscription" so that it links the plan explicitly.
- [ ] **Step 5: Commit:** `feat(access): the paywall honours each way's window`.

### Task A5: Every gate asks the paywall; checkout and subscribe follow windows

**Files:**
- Modify:
  - `backend/apps/courses/serializers.py` (the anonymous branches in `CourseListSerializer.get_access_info` ~140 and `CourseDetailSerializer.get_access_info` ~222)
  - `backend/apps/downloads/serializers.py:32-51`
  - `backend/apps/live/serializers.py`: `_viewer_has_access` (15-29) and the two anonymous branches (~179, ~302)
  - `backend/apps/live/views.py:~546` (`calendar_event_detail`)
  - `backend/apps/notifications/services.py:159-175` (`subscriptions_with_access`)
  - `backend/apps/billing/views/store.py` (`_unauthenticated_access_info`, for items, not bundles)
- Modify:
  - `backend/apps/billing/views/payments.py` (`payment_initialize`'s "already owned" check, ~139)
  - `subscribe`'s duplicate check (~612): add `current_period_end__gt=timezone.now()`
- Test: `backend/apps/core/tests/test_access_gates.py`, `backend/apps/billing/tests/test_payments.py`

**Interfaces:**
- Consumes: Task A4's `get_access_info` (anonymous-safe).
- Every branch above calls `ContentAccessService().get_access_info(request_user_or_None, obj)`. None decides from `pricing_type == "free"` any more.
- Checkout refuses an item while the student has an open or not-yet-open purchase of it, directly or through a bundle. It allows a new purchase once that purchase's window has closed.

- [ ] **Step 1: Write the failing tests**
```python
def test_a_closed_free_window_hides_an_events_zoom_link_from_visitors(...):
def test_a_closed_free_window_shows_the_paywall_on_the_course_list(...):
def test_live_reminders_skip_students_whose_window_closed(...):
def test_buying_again_after_the_window_closed_opens_it_again(...):   # Review Focus 3; "My courses" lists it once
def test_a_presale_purchase_cannot_be_bought_twice(...):
def test_an_expired_subscription_does_not_block_subscribing_again(...):
```
- [ ] **Step 2: Run them.** Expected: fail.
- [ ] **Step 3: Implement.** Re-buying a course reuses the existing `Enrollment` row (`update_or_create`, `is_active=True`). Coordinate with the payment-gaps commit if it already changed that line.
- [ ] **Step 4: Run them,** plus `make test-changed`. Expected: pass.
- [ ] **Step 5: Commit:** `fix(access): every gate asks the paywall, and checkout follows windows`.

### Task A6: Item endpoints and the data migration go through the writer

**Files:**
- Modify:
  - `backend/apps/courses/serializers.py` (`CourseCreateUpdateSerializer`: drop its own price zeroing at 320-337; after `save()`, if the payload had `pricing_type` or `price`, call `ways.apply_shorthand(...)` with the request user)
  - `backend/apps/downloads/serializers.py:65-71`
  - `backend/apps/live/serializers.py` (the four create/update serializers)
  - `backend/apps/billing/serializers/bundles.py` (price via `apply_shorthand`)
- Modify: `backend/apps/billing/ways.py` (`link_unlinked_members_only() -> int`)
- Create: the billing data migration that calls `link_unlinked_members_only` for every tenant schema it runs in. It is a RunPython that depends on the latest courses, downloads and live migrations.
- Test: `backend/apps/billing/tests/test_ways_shorthand.py`; adjust `backend/apps/courses/tests/test_views.py::TestCourseListCreate::test_switching_to_free_clears_price`. It becomes `test_switching_to_free_covers_the_price`: the price is kept and covered, and `ways_of` shows Free with no window plus the €49 buy.

**Interfaces:**
- Produces: `link_unlinked_members_only() -> int`. Every item with `pricing_type="subscription"` and no plan link gets a link to every active plan, so its behaviour is unchanged. It returns the count. On 2026-10-19 prod had 0 such items.

- [ ] **Step 1: Write the failing tests**
```python
def test_posting_a_paid_course_goes_through_the_writer(...): # POST pricing_type "paid", price "49" -> ways_of buy 49
def test_a_price_put_on_a_members_only_course_keeps_its_plans(...):
def test_an_unlinked_members_only_item_gets_every_active_plan(...):  # link_unlinked_members_only() == 1
```
- [ ] **Step 2: Run them.** Expected: fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them,** plus `make test-changed`. Expected: pass. Run `npm run gen:api` and read the diff, which should show no shape change.
- [ ] **Step 5: Commit:** `refactor(access): item endpoints write through the ways`. Then run `make e2e-changed` once for Phase A. The specs that POST `pricing_type` (02, 12, 21, 32, 33) keep working through the shorthand.

---

## Phase B — The Access section (creator)

### Task B1: The access endpoint

**Files:**
- Create: `backend/apps/billing/views/access.py`, `backend/apps/billing/access_urls.py`
- Modify: `backend/config/urls.py` (`path("api/v1/admin/access/", include("apps.billing.access_urls"))`, next to the other `api/v1/admin/` lines ~55-65)
- Test: `backend/apps/billing/tests/test_access_endpoint.py`

**Interfaces:**
- Produces: `GET` / `PUT /api/v1/admin/access/<kind>/<pk>/`, `IsCoachOrOwner`. `PUT` takes `{"ways": {...}}`. Both answer:
  ```json
  {"kind": "course", "id": 12, "ways": {...}, "describe": "...", "currency": "EUR",
   "allowed": ["free","buy","plans"], "can_edit_plans": true,
   "plans": [{"id": 3, "name": "Gold", "price": "19.00", "billing_interval_months": 1, "is_active": true}],
   "bundles": [{"id": 2, "name": "Starter pack", "price": "79.00"}]}
  ```
  `WaysError` gives 400 `{"code", "detail"}`. An unknown kind or id gives 404. `can_edit_plans` is `request.user.role == "owner"`.
  `GET .../<kind>/0/?choices=1` serves a form for an item that does not exist yet. It returns the same payload with `id: null`, `describe: ""` and the default ways `{"free": {"window": null}, "buy": null, "plans": []}`.

- [ ] **Step 1: Write the failing tests:** `test_get_returns_the_ways_and_the_choices`, `test_choices_for_a_new_item`, `test_put_saves_and_answers_with_plain_words`, `test_a_coach_gets_can_edit_plans_false_and_cannot_change_them`, `test_a_student_is_refused`, `test_an_unknown_kind_is_a_404`, `test_a_bad_window_is_a_400_with_its_sentence`.
- [ ] **Step 2: Run them.** Expected: fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them.** Expected: pass. Then `npm run gen:api` and read the diff.
- [ ] **Step 5: Commit:** `feat(access): the access endpoint for every kind`.

### Task B2: Frontend helpers `lib/access/ways.ts`

**Files:**
- Create: `frontend-customer/src/lib/access/ways.ts`
- Test: `frontend-customer/src/lib/__tests__/access-ways.test.ts`

**Interfaces:**
- Produces:
  - Types `Window`, `Ways` and `AccessPayload`, mirroring Task B1.
  - `spanText(days: number): string`, using the unit rule in Global Constraints.
  - `describe(ways: Ways, plans: AccessPayload["plans"], currency: string): string`, which says the same sentences as the backend's `describe`.
  - `buyPill(w: Window | null): string`, giving "Forever", "1 year from purchase" or "Until 31 Dec 2026", prefixed with "Opens 1 Nov 2026 · " for a pre-sale.
  - `linkPill(w)`, giving "Right away · never closes" or "After 1 month of membership · never closes".
  - `freePill(w)`, giving "Always", "Until 26 Oct 2026", "20 Oct 2026 – 2 Nov 2026" or "First 1 week after joining".
  - `problems(ways: Ways, allowed: string[]): {way: "buy" | "plans" | "all"; text: string}[]`, with the texts "Add a price above 0.", "Tick at least one subscription." and "Keep at least one way ticked.".
  - `parsePrice(input: string): string | null`.
  - Dates are formatted with `toLocaleDateString("en-GB", {day: "numeric", month: "short", year: "numeric"})`.

- [ ] **Step 1: Write the failing tests.** Use the four `describe` cases from Task A2 with identical expected strings, plus:
```ts
expect(spanText(365)).toBe("1 year"); expect(spanText(30)).toBe("1 month"); expect(spanText(14)).toBe("2 weeks"); expect(spanText(10)).toBe("10 days");
expect(parsePrice("49,90")).toBe("49.90"); for (const bad of ["0", "", "-5", "abc"]) expect(parsePrice(bad)).toBeNull();   // Review Focus 5
expect(problems({free: null, buy: null, plans: []}, ["free","buy","plans"])).toContainEqual({way: "all", text: "Keep at least one way ticked."});
```
- [ ] **Step 2: Run them.** `npx vitest run src/lib/__tests__/access-ways.test.ts`. Expected: fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them.** Expected: pass.
- [ ] **Step 5: Commit:** `feat(access): shared helpers for the Access section`.

### Task B3: `AccessSection`, `WindowEditor` and `useAccess`

**Files:**
- Create:
  - `frontend-customer/src/components/admin/access/access-section.tsx`
  - `frontend-customer/src/components/admin/access/window-editor.tsx`
  - `frontend-customer/src/lib/access/use-access.ts`
- Test: e2e in Task B6. The logic lives in Task B2's tested helpers.

**Interfaces:**
- Consumes: Task B1's endpoint and Task B2's helpers.
- Produces:
  - `useAccess(kind: string, id: number | null)` returns `{payload, ways, setWays, loading, error, save: (id: number) => Promise<void>}`. With a null id it loads Task B1's `?choices=1` payload.
  - `<AccessSection kind value onChange payload />` is controlled, renders the mockup's layout and behaviour, and follows the loading conventions.
- Verification for B3–B5 is the e2e spec in Task B6, plus the tested helpers of Task B2. The repo has no DOM testing library.

- Behaviour to match the mockup:
  - Each way's timing sits in a pill, which opens its panel.
  - The pre-sale option hides behind "It opens later (a pre-sale)".
  - Free with no window covers the other ways with the note: "Free for everyone covers every student, so the ways above do nothing while this is on. Their settings are kept for when you untick Free."
  - Unticking the last way is refused with: "Keep at least one way ticked. A draft is hidden from students anyway, so you never need to untick them all."
  - A coach sees the subscriptions read-only with the line "Only the site owner changes which subscriptions include this."
  - Under a subscription's panel: "This applies to current {plan} members too, including those who already have it."
  - Under the buy panel: "A purchase keeps these terms. Changing them later only affects new buyers."
  - The bundles line, then "In short" with `describe`.
  - Off-sale plans show an "Off sale" tag.
  - "+ New subscription" navigates to the membership flow (`KIND_ROUTES.membership` from `lib/focus/kinds.ts` if present, otherwise `/admin/store/plans/new`).
- [ ] **Step 1: Build the three files,** then `make lint` and `make typecheck` for the frontend.
- [ ] **Step 2: Commit:** `feat(access): the Access section`.

### Task B4: The course form uses the Access section

**Files:**
- Modify: `frontend-customer/src/components/admin/course-form.tsx`:
  - remove the `pricing_type` select and price block (~686-745) and `pricing_type` / `price` from `createForm` and both payloads (~364-365, ~413-414)
  - mount `<AccessSection kind="course" ...>`
  - save: `handleSave` posts or puts the course, then `access.save(courseId)`
  - focus mode: reload the access state where `loadCourse` reloads (the `settled` effect, ~444-453)
- Modify: `e2e/specs/33-focus-course.spec.ts:529` (`#pricing_type` → the Access section's "Sell it once" tick and price field)

- [ ] **Step 1: Make the change.** Typecheck, lint, then `make e2e-spec SPEC=33-focus-course`. Expected: pass.
- [ ] **Step 2: Commit:** `feat(access): the course page sets access in its Access section`.

### Task B5: Events, downloads and bundles use it

**Files:**
- Modify:
  - `frontend-customer/src/components/admin/live/event-form.tsx` (~60-110 and ~260-290; Zoom gets Free only through `payload.allowed`)
  - `frontend-customer/src/components/admin/download-form.tsx` (stage D creates this file; if stage D has not shipped, `app/admin/downloads/page.tsx`)
  - `frontend-customer/src/app/admin/store/bundles/new/page.tsx` and `[id]/page.tsx` (the price field moves into the section: price plus the buyers-keep-it window)
- Modify: `frontend-customer/src/components/admin/live/kinds.ts` (`membersOnly` is gone; the payload's `allowed` decides)

- [ ] **Step 1: Make the change.** Typecheck, lint, then `make e2e-spec SPEC=12-downloads` and `make e2e-spec SPEC=04-live-class`. Expected: pass.
- [ ] **Step 2: Commit:** `feat(access): events, downloads and bundles set access the same way`.

### Task B6: Plan page windows, "Give access" for a time, and the e2e spec

**Files:**
- Modify:
  - `backend/apps/billing/views/plans.py` (`_access_payload`: each item gets `"window_text"` via `ways.span_text` / `describe`)
  - `frontend-customer/src/app/admin/store/plans/[id]/page.tsx` (show each item's line)
  - `frontend-customer/src/components/billing/content-picker.tsx` if the line renders there
- Modify:
  - `backend/apps/accounts/views.py:421-452` (`student_grant_access` takes `for_days` (int) or `until` (ISO date), stamps the enrollment's `access_starts_at=now` and `access_ends_at`, and with neither it is forever)
  - `frontend-customer/src/components/admin/students/student-drawer.tsx:98-110, ~395` ("For how long": Forever / 1 month / 3 months / 1 year / Until a date)
- Create: `e2e/specs/40-access.spec.ts`
- Modify: `e2e/impact-map.json`. Add `40-access` to the entries for `apps/billing`, `apps/core/access.py` (or its folder entry), `src/components/admin/access`, `src/lib/access`, `src/components/public` and `src/components/admin/students`.
- Test: `backend/apps/billing/tests/test_plan_access.py`, `backend/apps/accounts/tests/test_views.py`

- [ ] **Step 1: Write the failing backend tests:** `test_saving_the_plan_page_keeps_each_links_window`, `test_the_plan_page_shows_each_items_window`, `test_give_access_for_a_month_ends_after_30_days`, `test_give_access_until_a_date_ends_that_day`.
- [ ] **Step 2: Write the e2e spec.**
  - The owner sets a course to Sell it once at €49 with 1 year, plus Gold after 1 month, and saves.
  - A visitor sees "Buy for €49" with "1 year of access" and Gold with "Opens after 1 month of membership".
  - Free, Always covers the other ways.
  - Unticking the last way shows the refusal note.
  - A coach sees the subscriptions read-only.
- [ ] **Step 3: Run them.** Expected: fail.
- [ ] **Step 4: Implement,** then run them. Expected: pass.
- [ ] **Step 5: Commit:** `feat(access): windows on the plan page, Give access for a time, and the access e2e`. Then run `make test-changed` and `make e2e-changed` for Phase B.

---

## Phase C — What students see

### Task C1: Terms and dates on the site

**Files:**
- Modify: `backend/apps/live/views.py` (`calendar_event_detail` adds `unlock_options` from `get_unlock_options`)
- Create: `frontend-customer/src/lib/access/terms.ts`
- Test: `frontend-customer/src/lib/__tests__/access-terms.test.ts`
- Modify:
  - `frontend-customer/src/types/billing.ts` (`AccessInfo.access_ends_at`, `AccessInfo.opens_at`)
  - `frontend-customer/src/types/course.ts` (window on `UnlockOption`, `UnlockPlanOption`, and a new `free`)
- Modify:
  - `frontend-customer/src/components/public/enroll-button.tsx`
  - `frontend-customer/src/components/public/calendar/event-detail-client.tsx:~260-310`
  - `frontend-customer/src/components/billing/price-badge.tsx` and `store-item-card.tsx`
- Modify: `e2e/specs/40-access.spec.ts`. Add a buyer whose access ends: seed the PaymentItem stamp through the dev API used by the other specs, or the ORM in a fixture helper, and expect "Your access ends on".

**Interfaces:**
- Produces:
  - `purchaseTerms(w)`, giving "Lifetime access", "1 year of access" or "Access until 31 Dec 2026"
  - `planTerms(w)`, giving "Included right away" or "Opens after 1 month of membership", plus ", for 3 months" or ", until …"
  - `freeTerms(w)`
  - `stateLine(info: AccessInfo, viewerPlanName?: string)`, giving "Your access ends on 19 Jul 2027", "Opens for you on 8 Nov 2026 with your Gold membership" or "Your access ended on …"

- [ ] **Step 1: Write the failing vitest cases** for each output above, plus a backend test `test_event_detail_offers_each_way_with_its_window`.
- [ ] **Step 2: Run them.** Expected: fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them,** plus `make e2e-spec SPEC=40-access`. Expected: pass.
- [ ] **Step 5: Commit:** `feat(access): students see each way's terms and their own dates`.

### Task C2: The docs say what the code does

**Files:**
- Modify:
  - `docs/GLOSSARY.md` (replace "Dual-access pricing" and "pricing_type — free or paid (only these two)" with ways in, window and the headline meaning)
  - `docs/REFERENCE.md` §4.4 (`AccessWindow`), §6 (the new order of checks and windows)

- [ ] **Step 1: Edit both.** **Step 2: Commit:** `docs: access is ways in with windows`.

---

## Phase D — The assistant and /setup

### Task D1: The assistant sees subscriptions and each item's ways

**Files:**
- Modify:
  - `backend/apps/core/copilot/context.py:~66-87` (`_course_record`: replace `price {course.price}` with `access: {ways.describe(ways.ways_of(course))}`)
  - `backend/apps/core/copilot/engine.py` (the course and event lists in the user turn, ~711: the price column becomes the short ways; add a block `Subscriptions (id | name | price | cycle | on sale | items):`)
- Test: `backend/apps/core/tests/test_copilot_access.py`

- [ ] **Step 1: Write the failing tests:** `test_the_user_turn_lists_her_subscriptions` and `test_an_open_course_shows_its_ways_in_plain_words`.
- [ ] **Step 2: Run them.** Expected: fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them.** Expected: pass.
- [ ] **Step 5: Commit:** `feat(copilot): the assistant sees her subscriptions and each item's access`.

### Task D2: `set_access`, a confirmable card with undo

**Files:**
- Modify:
  - `backend/apps/core/copilot/engine.py`:
    - `SetAccessAction(kind="set_access", item_kind, item_id, ways: dict, reason: str = "")`
    - add it to `CopilotAction`
    - `_card(tenant, action, actor=None)` gains `actor`. For `set_access` it calls `ways.validate(item, ways, actor=actor)`, then returns a card with title "Set access for {title}", detail `describe(ways)` and why `reason`.
    - `run_turn(..., actor=None)` gains the same keyword and passes it to `_card` (engine.py ~1580).
    - Its two chat callers pass the user: `apps/core/copilot/views.py:~125` passes `request.user`, and `apps/core/copilot/runs.py:~102` passes `run.actor` (the `CopilotRun.actor` FK).
    - `/setup`'s call (`apps/tenant_config/interview.py:548`) leaves it `None`. That is the system, which may change plans.
    - the system prompt's action list and the guidance in Step 3
- Modify:
  - `backend/apps/core/copilot/views.py`:
    - `_CREATORS["set_access"]` → `ways.set_ways(item, ways, actor=user)`
    - the inverse `{"kind": "restore_ways", "item_kind", "item_id", "ways": <before>}`
    - `_restored_state` (`ways.ways_of`)
    - `_apply_inverse` (`ways.set_ways(item, inverse["ways"])`)
    - the History label
- Test: `backend/apps/core/tests/test_copilot_access.py`

**Interfaces:**
- Consumes: `ways.item_for`, `set_ways`, `ways_of`, `describe`, `WaysError`. A `WaysError` becomes `content.ContentOpError(str(e))`, so the card fails with her sentence.

- [ ] **Step 1: Write the failing tests:**
```python
def test_a_set_access_card_says_the_setup_and_why(...): # detail == "€49 once with 1 year of access; in Gold after 1 month of membership."
def test_applying_it_sets_the_ways(...):
def test_undo_puts_the_old_ways_back(...):
def test_a_coach_cannot_change_plans_through_the_assistant(...):  # card error mentions the site owner
```
- [ ] **Step 2: Run them.** Expected: fail.
- [ ] **Step 3: Implement.** Add these system prompt lines:
  - `set_access` (item kind and id from the lists, ways, and a one-line reason she would agree with)
  - The goal-to-setup table from spec §5.6:
    - steady monthly income → a subscription
    - sell to everyone and reward members → both
    - a programme with an end → sell once with 3–12 months of access
    - keep members subscribed → a subscription that opens after N days
    - grow the list → free
    - a launch push → a free or calendar window
  - "Use only her own prices and her own subscriptions; never invent either. If the right setup needs a subscription she does not have, offer to start one in focus mode."
- [ ] **Step 4: Run them.** Expected: pass.
- [ ] **Step 5: Commit:** `feat(copilot): the assistant proposes and sets access`.

### Task D3: Price edits and creations keep the other ways

**Files:**
- Modify: `backend/apps/core/copilot/content.py`:
  - `edit_course` (131-163) and `edit_event` (166-...) send `price` through `ways.apply_shorthand(item, price=..., actor=user)` and no longer set `pricing_type`
  - `create_course` and `create_event` take an optional `params["access"]` (ways) applied with `set_ways` after creation
- Modify: `backend/apps/core/copilot/engine.py` (`CreateCourseAction.access: dict | None = None`, `CreateEventAction.access: dict | None = None`; the card detail uses `describe` when given)
- Test: `backend/apps/core/tests/test_copilot_access.py`

- [ ] **Step 1: Write the failing tests:** `test_a_price_edit_on_a_members_only_course_keeps_its_plans` and `test_create_course_with_access_sets_the_ways`.
- [ ] **Step 2: Run them.** Expected: fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them.** Expected: pass.
- [ ] **Step 5: Commit:** `fix(copilot): a price edit never drops a course from its subscriptions`.

### Task D4: /setup and the weekly series write through the ways

**Files:**
- Modify:
  - `backend/apps/tenant_config/interview_milestones.py:528-565` (`apply_access` builds the ways from `brief.access_of` and calls `ways.set_ways(row, ways)`; no direct `pricing_type` / `SubscriptionPlanAccess` writes)
  - `backend/apps/live/series.py:~28-40` (copy with `ways.copy_ways(first, row)`)
- Modify: `backend/apps/billing/ways.py` (`copy_ways(source, target) -> None`: links with their windows plus `AccessWindow` rows, then `pricing_type` and `price`)
- Test: the existing `/setup` access tests (`grep -rn "apply_access" backend/apps/tenant_config/tests`), `backend/apps/live/tests/test_series.py`

- [ ] **Step 1: Write the failing test:** `test_later_sessions_copy_the_first_ones_windows`. The existing `/setup` tests stay as they are.
- [ ] **Step 2: Run them.** Expected: the new test fails.
- [ ] **Step 3: Implement.** Run GitNexus `impact` on `apply_access` first.
- [ ] **Step 4: Run** the tenant_config and live tests, then `make test-changed`. Expected: pass. Restart celery after editing `interview_milestones.py`.
- [ ] **Step 5: Commit:** `refactor(access): /setup and the weekly series write through the ways`. Then run `make e2e-changed` for Phase D.

---

## Phase E — Focus mode's access step (only after every focus stage has shipped)

### Task E0: Re-read before planning the steps

- [ ] Read the current `apps/core/focus/flow.py` (`_price_tiles`, `_access`, `_set_price`, `_sell_for`, `_finish_options`), each kind adapter's `set_price`, `put_in_plan`, `price_tiles`, `cannot_sell` and `suggest_price`, and the `pick` question kind stage E built. Read `components/focus/` for how a question renders and answers.
- [ ] Rewrite E1–E3 below against that code (names and line numbers), keeping their behaviour. Commit the revised plan before E1.

### Task E1: "Tick every way in" with a suggested combination

**Files (as of 2026-10-19; recheck in E0):**
- Modify: `backend/apps/core/focus/flow.py`, `backend/apps/core/focus/analysis.py`, `backend/apps/billing/ways.py` (`common_setup(kind: str, exclude_pk: int | None = None) -> dict | None`)
- Test: `backend/apps/core/tests/test_focus_access.py`

**Interfaces:**
- Produces:
  - The access question for kinds using the shared tiles is a multi-select `pick`. Its tiles are Free, Sell it once at the suggested price with the reason as hint, and each active plan. `suggested` is the list of tile values from `common_setup(kind)`, the most common combination among her other items of that kind. Otherwise it is `["paid:<suggested amount>"]`.
  - A tile answer is turned into ways that keep the record's current windows, then `ways.set_ways(record, ways, actor=creation.actor)`.
  - Typed answers: `analysis` reads ways and windows from her words. "€49 once, free for Gold members after their first month" gives buy 49 forever plus Gold with `opens_after_days: 30`. A paid price still comes only from her words or taps.
  - A window is asked only when her words mention time or she taps "Add a time limit". That tile focuses the page's Access section pill instead of asking in the dock.
  - `cannot_sell(record)` is True while any paid way (buy or plans) is set and selling is not open.

- [ ] **Step 1: Write the failing tests:** `test_the_access_step_offers_every_way_and_pretics_her_usual_setup`, `test_her_words_set_a_price_and_a_members_window_in_one_go`, `test_ticking_two_ways_sets_both`, and `test_a_members_only_course_cannot_go_live_before_she_can_sell`.
- [ ] **Step 2: Run them.** Expected: fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them,** plus the existing `test_focus_*.py`. Expected: pass.
- [ ] **Step 5: Commit:** `feat(focus): the access step takes every way in`.

### Task E2: The guide renders the multi-select and the page follows

**Files (recheck in E0):** `frontend-customer/src/components/focus/focus-guide.tsx`, the `pick` question component, and `course-form.tsx` / `event-form.tsx` / `download-form.tsx` (their Access section reloads after the access answer, as `loadCourse` does today).
- Test: `e2e/specs/33-focus-course.spec.ts`. Change its access step to tick two ways and assert the Access section shows both.

- [ ] **Step 1: Make the change.** **Step 2: Run** `make e2e-spec SPEC=33-focus-course`. Expected: pass. **Step 3: Commit:** `feat(focus): the guide's access step ticks several ways`.

### Task E3: Adapters stop pricing on their own

**Files (recheck in E0):** `backend/apps/core/focus/kinds/course.py`, `event.py` and `download.py` drop `set_price` / `put_in_plan` in favour of the flow calling `ways.set_ways(adapter.record(id), ...)`. Membership and bundle keep their own `price_tiles`. Update the `kinds/__init__.py` docstring.
- Test: the existing `test_focus_kinds.py` and `test_focus_*.py`.

- [ ] **Step 1: Make the change.** **Step 2: Run** `make test-changed`, then `make e2e-changed`. Expected: pass. **Step 3: Commit:** `refactor(focus): every kind prices through the ways`.
