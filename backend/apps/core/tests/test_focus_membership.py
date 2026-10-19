"""A membership in focus mode (apps.core.focus.kinds.membership): its draft is
a SubscriptionPlan off sale at price 0 from her first answer (G4, G18); what
members get is ticked from her published items and linked through the ways
(apps.billing.ways), never taking away an item's own price; the price is only
ever her tap or her words; it goes on sale only with items and a price, by
her finish tap, and only the site owner can make one."""

import json
from datetime import timedelta
from decimal import Decimal
from unittest import mock

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.billing.models import SubscriptionPlan, SubscriptionPlanAccess
from apps.core import tasks
from apps.core.access import ContentAccessService
from apps.core.focus import copywriter, flow, jobs, pricing
from apps.core.focus.kinds import membership
from apps.courses.models import Course
from apps.downloads.models import DownloadFile
from apps.live.models import LiveClass, ZoomClass
from apps.tenant_config.models import CopilotChat, FocusCreation, TenantConfig

pytestmark = pytest.mark.django_db(transaction=True)

HOST = "shared-test.localhost"
URL = "/api/v1/admin/focus/"
TIER = "Digital membership"


def _user(email, role):
    return User.objects.create_user(
        email=email,
        name="U",
        password="x",  # noqa: S106
        role=role,
        is_staff=role == "owner",
    )


@pytest.fixture()
def owner(tenant_ctx):
    TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="Studio")
    return _user("focus-membership@x.com", "owner")


@pytest.fixture()
def student(tenant_ctx):
    return _user("member-student@x.com", "student")


@pytest.fixture(autouse=True)
def on(settings):
    settings.FOCUS_MODE_ENABLED = True
    settings.FOCUS_KINDS = ["course", "membership"]
    with mock.patch.object(tasks.run_focus_job, "delay"):
        yield


def _client(user):
    client = APIClient(HTTP_HOST=HOST)
    client.force_authenticate(user=user)
    return client


def _course(owner, title="Yoga basics", **kw):
    kw.setdefault("is_published", True)
    return Course.objects.create(title=title, slug=title.lower().replace(" ", "-"), instructor=owner, **kw)


def _plan(creation) -> SubscriptionPlan:
    return SubscriptionPlan.objects.get(pk=creation.record_id)


def _linked(plan) -> set:
    return {(a.content_type.model, a.object_id) for a in SubscriptionPlanAccess.objects.filter(plan=plan)}


def _values(creation) -> list[str]:
    return [o["value"] for o in flow.state(creation)["question"]["options"]]


def _at_finish(owner, *, price="month:9", included=True):
    """A membership answered up to the finish step; ``included``: one course ticked."""
    course = _course(owner)
    creation = flow.start(owner, "membership", value=TIER)
    assert flow.current_field(creation) == "included"
    creation = flow.answer(creation, "included", value=f"course:{course.pk}")
    if not included:  # she took it off on the page
        SubscriptionPlanAccess.objects.filter(plan_id=creation.record_id).delete()
    assert flow.current_field(creation) == "review"
    creation.answers = {**creation.answers, "review": "ok"}
    creation.save()
    if price:
        creation = flow.answer(creation, "access", value=price)
    else:
        creation.answers = {**creation.answers, "access": "delegate"}
        creation.save()
    assert flow.current_field(creation) == "finish"
    return creation


# ── The brief's tests ───────────────────────────────────────────────────────


def test_a_draft_plan_is_not_on_the_pricing_page_and_cannot_be_bought(owner, student):
    creation = _at_finish(owner)
    plan = _plan(creation)
    assert (plan.is_active, plan.price) == (False, Decimal("9.00"))
    client = _client(student)
    assert plan.pk not in [p["id"] for p in client.get("/api/v1/billing/plans/").json()]
    assert client.get(f"/api/v1/billing/plans/{plan.pk}/").status_code == 404
    assert client.post("/api/v1/billing/subscribe/", {"plan_id": plan.pk}, format="json").status_code == 404
    # Her own view still lists it, as switched off.
    assert plan.pk in [p["id"] for p in _client(owner).get("/api/v1/billing/plans/?all=1").json()]


def test_the_draft_plan_has_no_price_until_her_tap(owner):
    creation = flow.start(owner, "membership", value=TIER)
    plan = _plan(creation)
    assert (plan.name, plan.price, plan.is_active, plan.billing_interval_months) == (TIER, 0, False, 1)
    assert plan.currency == "USD"
    assert flow.state(creation)["record"] == {
        "id": plan.pk,
        "kind": "membership",
        "title": TIER,
        "path": f"/admin/store/plans/{plan.pk}",
    }
    creation = flow.answer(creation, "access", value="year:90")  # not the question yet: nothing
    assert _plan(creation).price == 0
    creation = _at_finish(owner, price="year:90")
    plan = _plan(creation)
    assert (plan.price, plan.billing_interval_months, plan.is_active) == (Decimal("90.00"), 12, False)


def test_just_draft_it_leaves_the_price_to_her_finish_tap(owner):
    course = _course(owner)
    creation = flow.start(owner, "membership", value=TIER, rest=True)
    assert creation.answers["access"] == flow.DELEGATE
    assert flow.current_field(creation) == "included"  # what members get is hers to tick
    creation = flow.answer(creation, "included", value=f"course:{course.pk}")
    creation.answers = {**creation.answers, "review": "ok"}
    creation.save()
    assert flow.current_field(creation) == "finish"
    assert _plan(creation).price == 0
    asked = flow.state(creation)["question"]
    assert asked["why"].startswith("Set its price first.")
    assert "on_sale" not in [o["value"] for o in asked["options"]]
    sell = next(o for o in asked["options"] if o["value"].startswith("price:"))
    assert sell == {"value": "price:9", "label": "Sell it for $9 a month", "hint": pricing.FALLBACK}
    creation = flow.answer(creation, "finish", value="price:9")
    # Her access line: the price she tapped, with the plan's cycle.
    assert flow.state(creation)["answered"][-1]["label"] == "$9 a month"
    assert CopilotChat.objects.get(pk=creation.chat_id).entries[-1]["text"] == "Sell it for $9 a month"
    assert (_plan(creation).price, _plan(creation).billing_interval_months) == (Decimal("9.00"), 1)
    with mock.patch("apps.core.monetization.can_monetize", return_value=True):
        assert _values(creation) == ["on_sale", "off_sale"]
        creation = flow.finish(creation, publish=True)
    assert _plan(creation).is_active
    assert creation.answers["finish"] == "on_sale"


def test_named_items_are_ticked_and_nothing_else(owner):
    basics = _course(owner, "Yoga basics")
    _course(owner, "Yoga for runners")
    _course(owner, "Pilates core")
    workbook = DownloadFile.objects.create(title="Breathing workbook", is_published=True)
    with mock.patch("apps.core.onboarding.ai_compose.compose_available", return_value=True):
        creation = flow.start(owner, "membership", text="Members get my yoga basics and the breathing workbook")
    assert creation.pending["field"] == "topic"  # read by the analysis first
    found = membership.FOUND(included=["yoga basics", "Breathing", "Yoga"])  # "Yoga": not a unique prefix
    flow.apply(creation, found)
    creation.save()
    asked = flow.state(creation)["question"]
    assert asked["field"] == "included" and asked["kind"] == "pick"
    assert asked["ticked"] == [f"course:{basics.pk}", f"download:{workbook.pk}"]
    assert _linked(_plan(creation)) == set()  # ticked on the question; linked with her answer
    creation = flow.answer(creation, "included", value=",".join(asked["ticked"]))
    assert _linked(_plan(creation)) == {("course", basics.pk), ("downloadfile", workbook.pk)}
    assert flow.state(creation)["answered"][-1] == {
        "field": "included",
        "label": "Yoga basics, Breathing workbook",
    }


def test_a_coach_who_is_not_the_owner_cannot_start_one(owner):
    coach = _user("focus-coach@x.com", "coach")
    client = _client(coach)
    res = client.post(URL, {"kind": "membership", "value": TIER}, format="json")
    assert (res.status_code, res.json()) == (403, {"detail": "owner_only"})
    assert not SubscriptionPlan.objects.exists()
    with pytest.raises(flow.FlowError, match="owner_only"):
        flow.start(coach, "membership", value=TIER)
    # Driven by her too: a creation of the kind she holds (made while she was the owner) answers 403.
    for kind in ("membership", "bundle"):
        cid = FocusCreation.objects.create(kind=kind, actor=coach, answers={}).pk
        assert client.get(f"{URL}{cid}/").status_code == 403
        assert client.post(f"{URL}{cid}/answer/", {"field": "topic", "value": TIER}, format="json").status_code == 403
        assert client.post(f"{URL}{cid}/finish/", {"publish": True}, format="json").status_code == 403
        assert client.post(f"{URL}{cid}/leave/", {"abandon": True}, format="json").status_code == 403
    assert "membership" not in client.get(URL).json()["kinds"]
    assert "membership" in _client(owner).get(URL).json()["kinds"]
    # The owner starts one.
    res = _client(owner).post(URL, {"kind": "membership", "value": TIER}, format="json")
    assert res.status_code == 201


def test_on_sale_is_refused_with_nothing_included(owner):
    creation = _at_finish(owner, included=False)
    assert membership.not_ready(_plan(creation)) == "Add what members get first"
    with mock.patch("apps.core.monetization.can_monetize", return_value=True):
        assert _values(creation) == ["off_sale"]
        creation = flow.finish(creation, publish=True)
    assert not _plan(creation).is_active
    assert creation.answers["finish"] == "off_sale"


def test_on_sale_is_refused_without_a_price(owner):
    creation = _at_finish(owner, price=None)
    assert membership.not_ready(_plan(creation)) == "Set its price first"
    with mock.patch("apps.core.monetization.can_monetize", return_value=True):
        creation = flow.finish(creation, publish=True)
    assert not _plan(creation).is_active


def test_the_trial_offers_start_selling(owner):
    creation = _at_finish(owner)
    with (
        mock.patch("apps.core.monetization.is_paid_active", return_value=False),
        mock.patch("apps.core.monetization.can_monetize", return_value=False),
    ):
        asked = flow.state(creation)["question"]
        assert [o["value"] for o in asked["options"]] == ["start_selling", "off_sale"]
        assert asked["paid_active"] is False
        creation = flow.finish(creation, publish=True)  # a stale screen still asking
    assert not _plan(creation).is_active
    assert creation.answers["finish"] == "off_sale"


# ── What members get (Rulings 1, 3, 7) ──────────────────────────────────────


def test_a_ticked_paid_course_keeps_its_one_time_price(owner):
    paid = _course(owner, "Paid course", pricing_type="paid", price=Decimal("49.00"))
    free = _course(owner, "Free course")
    creation = flow.start(owner, "membership", value=TIER)
    creation = flow.answer(creation, "included", value=f"course:{paid.pk},course:{free.pk}")
    paid.refresh_from_db()
    free.refresh_from_db()
    assert (paid.pricing_type, paid.price) == ("paid", Decimal("49.00"))
    assert free.pricing_type == "free"
    assert _linked(_plan(creation)) == {("course", paid.pk), ("course", free.pk)}
    # Unticked (E2's page sends the new ticks; here the answer is set as it would): out the same way.
    creation.answers = {**creation.answers, "included": [f"course:{free.pk}"]}
    membership.sync(creation)
    paid.refresh_from_db()
    assert (paid.pricing_type, paid.price) == ("paid", Decimal("49.00"))
    assert _linked(_plan(creation)) == {("course", free.pk)}


def test_linking_items_to_a_draft_plan_gives_nobody_access(owner, student):
    members_only = _course(owner, "Members only", pricing_type="subscription")
    creation = flow.start(owner, "membership", value=TIER)
    creation = flow.answer(creation, "included", value=f"course:{members_only.pk}")
    assert _linked(_plan(creation)) == {("course", members_only.pk)}
    service = ContentAccessService()
    info = service.get_access_info(student, members_only)
    assert (info.has_access, info.unlock_methods) == (False, None)
    assert "plans" not in service.get_unlock_options(members_only)  # never "Included in <plan>"
    page = _client(student).get(f"/api/v1/courses/{members_only.slug}/").json()
    assert "plans" not in page["unlock_options"]
    assert "subscribe" not in (page["access_info"]["unlock_methods"] or [])
    # On sale, it is named there.
    SubscriptionPlan.objects.filter(pk=creation.record_id).update(is_active=True, price=19)
    assert [p["id"] for p in service.get_unlock_options(members_only)["plans"]] == [creation.record_id]


def test_the_tiles_list_only_what_students_can_see(owner):
    course = _course(owner, "Yoga basics")
    _course(owner, "Draft course", is_published=False)
    workbook = DownloadFile.objects.create(title="Breathing workbook", is_published=True)
    DownloadFile.objects.create(title="Hidden workbook", is_published=False)
    soon = timezone.now() + timedelta(days=1)
    weekly = [
        LiveClass.objects.create(
            title="Morning flow",
            instructor=owner,
            scheduled_at=soon + timedelta(days=7 * i),
            status="draft" if i == 2 else "scheduled",
        )
        for i in range(3)
    ]
    LiveClass.objects.create(title="Held class", instructor=owner, scheduled_at=soon, status="draft")
    past = timezone.now() - timedelta(days=3)
    LiveClass.objects.create(title="Last spring", instructor=owner, scheduled_at=past, status="ended")
    ZoomClass.objects.create(title="Zoom chat", instructor=owner, scheduled_at=soon, status="scheduled")
    creation = flow.start(owner, "membership", value=TIER)
    asked = flow.state(creation)["question"]
    assert asked["options"] == [
        {"value": f"course:{course.pk}", "label": "Yoga basics", "hint": "Course"},
        {"value": f"event:live:{weekly[0].pk}", "label": "Morning flow", "hint": "Live class"},
        {"value": f"download:{workbook.pk}", "label": "Breathing workbook", "hint": "Download"},
    ]
    assert asked["ticked"] == []
    creation = flow.answer(creation, "included", value=f"event:live:{weekly[0].pk},course:99999")
    assert _linked(_plan(creation)) == {("liveclass", row.pk) for row in weekly}  # the whole series
    assert creation.answers["included"] == [f"event:live:{weekly[0].pk}"]


def test_her_words_at_the_question_answer_it(owner):
    basics = _course(owner, "Yoga basics")
    _course(owner, "Pilates core")
    creation = flow.start(owner, "membership", value=TIER)
    with mock.patch("apps.core.onboarding.ai_compose.compose_available", return_value=True):
        creation = flow.answer(creation, "included", text="just yoga basics")
    flow.apply(creation, membership.FOUND(included=["Yoga basics"]))
    creation.save()
    assert creation.answers["included"] == [f"course:{basics.pk}"]
    assert _linked(_plan(creation)) == {("course", basics.pk)}
    assert flow.current_field(creation) == "review"


def test_a_tick_the_ways_cannot_take_is_asked_again(owner):
    broken = _course(owner, "Broken", pricing_type="paid", price=Decimal("0"))  # the ways refuse a paid 0
    creation = flow.start(owner, "membership", value=TIER)
    creation = flow.answer(creation, "included", value=f"course:{broken.pk}")
    assert flow.current_field(creation) == "included"
    assert _linked(_plan(creation)) == set()
    good = _course(owner, "Good")
    creation = flow.answer(creation, "included", value=f"course:{broken.pk},course:{good.pk}")
    assert creation.answers["included"] == [f"course:{good.pk}"]  # only what was linked
    assert _linked(_plan(creation)) == {("course", good.pk)}
    assert flow.state(creation)["answered"][-1] == {"field": "included", "label": "Good"}


def test_an_untick_that_would_leave_no_way_in_keeps_the_link(owner):
    members_only = _course(owner, "Members only", pricing_type="subscription")
    creation = flow.start(owner, "membership", value=TIER)
    creation = flow.answer(creation, "included", value=f"course:{members_only.pk}")
    creation.answers = {**creation.answers, "included": []}  # unticked: her only way in would go
    membership.sync(creation)
    assert _linked(_plan(creation)) == {("course", members_only.pk)}
    assert creation.answers["included"] == [f"course:{members_only.pk}"]  # still ticked
    members_only.refresh_from_db()
    assert members_only.pricing_type == "subscription"


def test_a_tap_with_nothing_valid_has_a_plain_line(owner):
    assert membership.label("included", "course:99999," + "x" * 3000) == "Nothing ticked"
    recipe = membership.RECIPE
    question = next(q for q in recipe.questions if q.id == "included")
    long = ",".join(f"course:{n}" for n in range(1000, 2000))
    picked = flow._pick(recipe, question, long, None, False)
    assert len(picked) <= flow.MULTI_MAX and long.startswith(picked) and long[len(picked)] == ","


def test_one_item_is_one_item(owner):
    assert membership.label("included", ["course:99999"]) == "1 item"
    assert membership.label("included", ["course:99998", "course:99999"]) == "2 items"


def test_her_typed_amount_reads_with_the_yearly_cycle(owner):
    creation = _at_finish(owner, price="year:90")
    creation.answers.pop("access")
    creation.save()
    with mock.patch("apps.core.onboarding.ai_compose.compose_available", return_value=False):
        creation = flow.answer(creation, "access", text="80")
    creation.refresh_from_db()
    assert creation.answers["access"].startswith("paid:80")  # her amount, not a tile
    assert flow.state(creation)["answered"][-1] == {"field": "access", "label": "$80 a year"}


def test_nothing_ticked_is_asked_again(owner):
    _course(owner)
    creation = flow.start(owner, "membership", value=TIER)
    creation = flow.answer(creation, "included", value="course:99999")
    assert flow.current_field(creation) == "included"


# ── The price (Ruling 5) ────────────────────────────────────────────────────


def test_the_price_tiles_are_a_month_and_a_year_at_ten_months(owner):
    creation = _at_finish(owner)
    creation.answers.pop("access")
    creation.save()
    asked = flow.state(creation)["question"]
    assert asked["field"] == "access" and asked["question"] == "What should it cost?"
    assert asked["options"] == [
        {"value": "month:9", "label": "$9 a month", "hint": pricing.FALLBACK},
        {"value": "year:90", "label": "$90 a year", "hint": "Two months free"},
    ]
    assert (asked["suggested"], asked["say"]) == ("month:9", "Say an amount")
    creation = flow.answer(creation, "access", value="month:12")  # not one of her tiles
    assert flow.current_field(creation) == "access"
    creation = flow.answer(creation, "access", value="month:9")
    assert flow.state(creation)["answered"][-1] == {"field": "access", "label": "$9 a month"}


def test_her_typed_amount_is_kept_exactly(owner):
    creation = _at_finish(owner)
    creation.answers.pop("access")
    creation.save()
    with mock.patch("apps.core.onboarding.ai_compose.compose_available", return_value=False):
        creation = flow.answer(creation, "access", text="24.50")
    creation.refresh_from_db()
    assert (_plan(creation).price, _plan(creation).billing_interval_months) == (Decimal("24.50"), 1)
    assert flow.current_field(creation) == "finish"


def test_a_new_cycle_in_her_words_asks_the_price_again(owner):
    creation = _at_finish(owner, price="year:90")
    creation.pending = {"field": "review", "text": "make it monthly"}
    flow.apply(creation, membership.FOUND(cycle="month", change="make it monthly"))
    creation.save()
    plan = _plan(creation)
    assert (plan.price, plan.billing_interval_months) == (0, 1)  # never $90 a month
    assert "access" not in creation.answers and flow.current_field(creation) == "access"
    # With a price, her words set both.
    creation.pending = {"field": "access", "text": "monthly, 12"}
    flow.apply(creation, membership.FOUND(cycle="month", price="12"))
    creation.save()
    assert (_plan(creation).price, _plan(creation).billing_interval_months) == (Decimal("12.00"), 1)
    # The same cycle again changes nothing.
    flow.apply(creation, membership.FOUND(cycle="month"))
    assert _plan(creation).price == Decimal("12.00")


def test_her_words_set_the_cycle(owner):
    creation = flow.start(owner, "membership", value=TIER)
    creation.pending = {"field": "topic", "text": "a yearly membership for 120"}
    flow.apply(creation, membership.FOUND(cycle="year", price="120"))
    creation.save()
    assert (_plan(creation).price, _plan(creation).billing_interval_months) == (Decimal("120.00"), 12)


def test_suggest_price_reads_her_plans_then_setup_then_the_tier(owner):
    draft = SubscriptionPlan.objects.create(name="Online membership", price=0, is_active=False)
    s = membership.suggest_price(draft)
    assert (s.amount, s.reason) == (19, pricing.FALLBACK)  # the catalogue's online tier
    with mock.patch(
        "apps.core.focus.kinds.membership.answers_of",
        return_value={"memberships": ["online"], "membership_prices": {"online": 25}},
    ):
        assert (membership.suggest_price(draft).amount, membership.suggest_price(draft).reason) == (
            25,
            pricing.SETUP,
        )
    SubscriptionPlan.objects.create(name="Basic", price=Decimal("10"), is_active=True)
    SubscriptionPlan.objects.create(name="Off", price=Decimal("99"), is_active=False)
    s = membership.suggest_price(draft)
    assert s.amount == 10 and s.reason.startswith("Basic costs $10 a month")
    draft.billing_interval_months = 12  # her words made it yearly: "Sell it for" is the year's price
    yearly = membership.suggest_price(draft)
    assert (yearly.amount, yearly.reason) == (100, "Two months free on $10 a month")
    assert membership.amount_label(draft, "100.00") == "$100 a year"


def test_the_copy_job_writes_the_plan_name_over_its_working_title(owner):
    course = _course(owner)
    creation = flow.start(owner, "membership", value=TIER)
    creation = flow.answer(creation, "included", value=f"course:{course.pk}")
    assert copywriter.drafts("membership")
    run_id = creation.runs["copy"]  # the copy job waits for what is included, then drafts
    copy = copywriter.output_for("membership")(name="Calm Yoga Club", description="Every course, any time.")
    with (
        mock.patch("apps.core.focus.copywriter.ai_compose.compose_available", return_value=True),
        mock.patch("apps.core.focus.copywriter.ai_compose.record_spend"),
        mock.patch("apps.core.focus.copywriter.core_ai.structured", return_value=(copy, Decimal(0), "x")) as model,
    ):
        jobs.execute("shared_test", run_id)
    turn = json.loads(model.call_args.kwargs["user"])
    assert turn["included"] == ["Yoga basics (course)"]
    assert turn["current"] == {"name": TIER, "description": ""}
    plan = _plan(creation)
    assert (plan.name, plan.description, plan.is_active, plan.price) == (
        "Calm Yoga Club",
        "Every course, any time.",
        False,
        0,
    )
    assert membership.announce_facts(plan)["link"] == f"/plans/{plan.pk}"
