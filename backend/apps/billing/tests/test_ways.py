"""The one writer for an item's ways in: reading today's items, writing, refusing, and plain words."""

from decimal import Decimal

import pytest

from apps.accounts.models import User
from apps.billing.models import AccessWindow, Bundle, SubscriptionPlan, SubscriptionPlanAccess
from apps.billing.ways import WaysError, apply_shorthand, describe, item_for, kind_of, set_ways, ways_of
from apps.courses.models import Course
from apps.live.models import ZoomClass

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture(autouse=True)
def euro(tenant_ctx):
    """The tenant charges in EUR, so prices read "€49"."""
    was = tenant_ctx.billing_currency
    tenant_ctx.billing_currency = "EUR"
    yield
    tenant_ctx.billing_currency = was


@pytest.fixture()
def owner(tenant_ctx):
    return User.objects.create_user(email="owner@ways.test", name="Owner", password="secret123", role="owner")


@pytest.fixture()
def coach(tenant_ctx):
    return User.objects.create_user(email="coach@ways.test", name="Coach", password="secret123", role="coach")


@pytest.fixture()
def course(tenant_ctx, owner):
    return Course.objects.create(
        title="Ways Course", slug="ways-course", instructor=owner, pricing_type="paid", price=Decimal("49.00")
    )


@pytest.fixture()
def gold(tenant_ctx):
    return SubscriptionPlan.objects.create(name="Gold", price=Decimal("29.00"), currency="EUR")


@pytest.fixture()
def silver(tenant_ctx):
    return SubscriptionPlan.objects.create(name="Silver", price=Decimal("19.00"), currency="EUR")


@pytest.fixture()
def bundle(tenant_ctx):
    return Bundle.objects.create(name="Pack", price=Decimal("99.00"), currency="EUR")


@pytest.fixture()
def zoom(tenant_ctx, owner):
    return ZoomClass.objects.create(title="Zoom", instructor=owner)


def buy_only(price="49", window=None):
    return {"free": None, "buy": {"price": price, "window": window}, "plans": []}


def test_ways_of_reads_todays_items(course):
    assert ways_of(course) == {"free": None, "buy": {"price": "49.00", "window": None}, "plans": []}


def test_ways_of_reads_a_bundle_as_sold_once_and_a_free_item_as_free(bundle, owner):
    assert ways_of(bundle) == {"free": None, "buy": {"price": "99.00", "window": None}, "plans": []}
    free = Course.objects.create(title="F", slug="f", instructor=owner, pricing_type="free")
    assert ways_of(free) == {"free": {"window": None}, "buy": None, "plans": []}


def test_kind_and_item_round_trip(course, bundle):
    assert kind_of(course) == "course" and kind_of(bundle) == "bundle"
    assert item_for("course", course.pk) == course
    for kind, pk in (("course", 0), ("nonsense", 1)):
        with pytest.raises(WaysError) as e:
            item_for(kind, pk)
        assert e.value.code == "not_found"


def test_sell_once_with_a_year_and_two_plans_after_a_month(course, gold, silver, owner):
    w = set_ways(
        course,
        {
            "free": None,
            "buy": {"price": "49", "window": {"closes_after_days": 365}},
            "plans": [
                {"plan_id": gold.pk, "window": {"opens_after_days": 30}},
                {"plan_id": silver.pk, "window": {"opens_after_days": 30}},
            ],
        },
        actor=owner,
    )
    course.refresh_from_db()
    assert (course.pricing_type, course.price) == ("paid", Decimal("49.00"))
    assert w["plans"][0]["window"] == {"opens_after_days": 30}
    assert w["buy"]["window"] == {"closes_after_days": 365}
    assert ways_of(course) == w


def test_free_always_covers_and_keeps_the_other_settings(course, gold, owner):
    set_ways(
        course,
        {
            "free": {"window": None},
            "buy": {"price": "49", "window": None},
            "plans": [{"plan_id": gold.pk, "window": None}],
        },
        actor=owner,
    )
    course.refresh_from_db()
    assert course.pricing_type == "free" and course.price == Decimal("49.00")
    assert ways_of(course)["buy"] == {"price": "49.00", "window": None}


def test_a_free_window_sits_beside_a_price(course, owner):
    set_ways(
        course,
        {"free": {"window": {"closes_on": "2026-10-26"}}, "buy": {"price": "29", "window": None}, "plans": []},
        actor=owner,
    )
    course.refresh_from_db()
    assert course.pricing_type == "paid"
    assert ways_of(course)["free"] == {"window": {"closes_on": "2026-10-26"}}


def test_a_windowed_free_way_alone_is_free_and_plans_alone_are_subscription(course, gold, owner):
    set_ways(course, {"free": {"window": {"closes_after_days": 7}}, "buy": None, "plans": []}, actor=owner)
    course.refresh_from_db()
    assert (course.pricing_type, course.price) == ("free", Decimal("0"))
    set_ways(course, {"free": None, "buy": None, "plans": [{"plan_id": gold.pk, "window": None}]}, actor=owner)
    course.refresh_from_db()
    assert course.pricing_type == "subscription"
    assert not AccessWindow.objects.filter(object_id=course.pk).exists()


def test_a_bundle_never_gets_a_pricing_type_column_written(bundle, owner):
    set_ways(bundle, buy_only("120", {"closes_after_days": 365}), actor=owner)
    bundle.refresh_from_db()
    assert bundle.price == Decimal("120.00") and bundle.pricing_type == "paid"
    assert ways_of(bundle)["buy"] == {"price": "120.00", "window": {"closes_after_days": 365}}


def test_nothing_set_is_refused(course, owner):
    with pytest.raises(WaysError) as e:
        set_ways(course, {"free": None, "buy": None, "plans": []}, actor=owner)
    assert e.value.code == "no_way"


def test_a_price_must_be_above_zero(course, owner):
    for bad in ("0", "", "-5", "abc", None, "NaN", "nan", "inf", "-Infinity", "1e30"):
        with pytest.raises(WaysError) as e:
            set_ways(course, buy_only(bad), actor=owner)
        assert e.value.code == "price"
    assert set_ways(course, buy_only("49,90"), actor=owner)["buy"]["price"] == "49.90"


def test_a_missing_plan_is_refused(course, owner):
    with pytest.raises(WaysError) as e:
        set_ways(course, {"free": None, "buy": None, "plans": [{"plan_id": 99999, "window": None}]}, actor=owner)
    assert e.value.code == "plan"


def test_a_coach_cannot_change_which_plans_include_it(course, gold, silver, owner, coach):
    with pytest.raises(WaysError) as e:
        set_ways(course, {**buy_only(), "plans": [{"plan_id": gold.pk, "window": None}]}, actor=coach)
    assert e.value.code == "owner_only"
    set_ways(course, {**buy_only(), "plans": [{"plan_id": gold.pk, "window": None}]}, actor=owner)
    # The same plans as they are is a coach's to save (her other edits go through); adding or dropping
    # one, or moving a plan's window (live for every member, Ruling 18), is not.
    set_ways(course, {**buy_only("59"), "plans": [{"plan_id": gold.pk, "window": None}]}, actor=coach)
    assert ways_of(course)["buy"]["price"] == "59.00"
    for plans in (
        [],
        [{"plan_id": gold.pk, "window": None}, {"plan_id": silver.pk, "window": None}],
        [{"plan_id": gold.pk, "window": {"opens_after_days": 7}}],
    ):
        with pytest.raises(WaysError) as e:
            set_ways(course, {**buy_only(), "plans": plans}, actor=coach)
        assert e.value.code == "owner_only"


def test_a_coach_cannot_change_a_bundle(bundle, coach):
    with pytest.raises(WaysError) as e:
        set_ways(bundle, buy_only("10"), actor=coach)
    assert e.value.code == "owner_only"


def test_a_zoom_class_is_free_only(zoom, gold, owner):
    with pytest.raises(WaysError) as e:
        set_ways(zoom, buy_only(), actor=owner)
    assert e.value.code == "not_allowed"
    with pytest.raises(WaysError) as e:
        set_ways(zoom, {"free": None, "buy": None, "plans": [{"plan_id": gold.pk, "window": None}]}, actor=owner)
    assert e.value.code == "not_allowed"
    assert set_ways(zoom, {"free": {"window": None}, "buy": None, "plans": []}, actor=owner)["free"] == {"window": None}


def test_a_bundle_is_sold_once_only(bundle, owner):
    with pytest.raises(WaysError) as e:
        set_ways(bundle, {"free": {"window": None}, "buy": None, "plans": []}, actor=owner)
    assert e.value.code == "not_allowed"
    with pytest.raises(WaysError) as e:
        set_ways(bundle, {**buy_only(), "free": {"window": None}}, actor=owner)
    assert e.value.code == "not_allowed"


def test_windows_outside_the_rules_are_refused(course, owner):
    for bad in (
        {"closes_after_days": 0},
        {"closes_after_days": -3},
        {"closes_after_days": 3651},
        {"closes_after_days": 1.5},
        {"closes_on": "26/10/2026"},
        {"closes_on": "2026-02-30"},
        {"closes_after_days": 30, "closes_on": "2026-12-31"},
        {"opens_after_days": 30, "opens_on": "2026-12-31"},
        {"opens_after_days": 30, "closes_after_days": 30},
        {"opens_on": "2026-12-31", "closes_on": "2026-12-30"},
        {"nonsense": 5},
    ):
        with pytest.raises(WaysError) as e:
            set_ways(course, buy_only(window=bad), actor=owner)
        assert e.value.code == "window", bad
    course.refresh_from_db()
    assert course.price == Decimal("49.00") and not AccessWindow.objects.exists()


def test_validate_writes_nothing(course, gold, owner):
    from apps.billing.ways import validate

    validate(course, {"free": {"window": None}, "buy": None, "plans": [{"plan_id": gold.pk, "window": None}]})
    course.refresh_from_db()
    assert course.pricing_type == "paid" and not SubscriptionPlanAccess.objects.exists()


def test_saving_keeps_a_kept_links_row_and_its_window(course, gold, silver, owner):
    set_ways(course, {**buy_only(), "plans": [{"plan_id": gold.pk, "window": None}]}, actor=owner)
    before = SubscriptionPlanAccess.objects.get(plan=gold, object_id=course.pk).pk
    set_ways(
        course,
        {
            **buy_only(),
            "plans": [
                {"plan_id": gold.pk, "window": {"closes_on": "2026-12-31"}},
                {"plan_id": silver.pk, "window": None},
            ],
        },
        actor=owner,
    )
    link = SubscriptionPlanAccess.objects.get(plan=gold, object_id=course.pk)
    assert link.pk == before and str(link.closes_on) == "2026-12-31"
    set_ways(course, buy_only(), actor=owner)
    assert not SubscriptionPlanAccess.objects.exists()


def test_a_dropped_way_loses_its_window_row(course, owner):
    set_ways(course, buy_only(window={"closes_after_days": 365}), actor=owner)
    assert AccessWindow.objects.filter(way="buy").exists()
    set_ways(course, {"free": {"window": None}, "buy": None, "plans": []}, actor=owner)
    assert not AccessWindow.objects.exists()


def test_shorthand_price_edit_keeps_the_plans(course, gold, owner):
    set_ways(course, {"free": None, "buy": None, "plans": [{"plan_id": gold.pk, "window": None}]}, actor=owner)
    apply_shorthand(course, price="39", actor=owner)
    assert ways_of(course)["plans"] and ways_of(course)["buy"]["price"] == "39.00"


def test_shorthand_pricing_types(course, gold, owner):
    apply_shorthand(course, pricing_type="free", actor=owner)
    course.refresh_from_db()
    assert course.pricing_type == "free" and ways_of(course)["buy"]["price"] == "49.00"
    apply_shorthand(course, pricing_type="paid", price="25", actor=owner)
    course.refresh_from_db()
    assert (course.pricing_type, course.price) == ("paid", Decimal("25.00"))
    assert ways_of(course)["free"] is None
    with pytest.raises(WaysError) as e:
        apply_shorthand(course, pricing_type="subscription", actor=owner)
    assert e.value.code == "plan"
    set_ways(course, {**buy_only(), "plans": [{"plan_id": gold.pk, "window": None}]}, actor=owner)
    apply_shorthand(course, pricing_type="subscription", actor=owner)
    course.refresh_from_db()
    assert course.pricing_type == "subscription" and ways_of(course)["buy"] is None


def test_shorthand_price_zero_drops_buy_and_falls_back_to_free(course, gold, owner):
    apply_shorthand(course, price="0", actor=owner)
    course.refresh_from_db()
    assert (course.pricing_type, course.price) == ("free", Decimal("0"))
    assert ways_of(course) == {"free": {"window": None}, "buy": None, "plans": []}
    for bad in ("0", "NaN", "inf", "-inf", "abc"):
        with pytest.raises(WaysError) as e:
            apply_shorthand(course, pricing_type="paid" if bad == "0" else None, price=bad, actor=owner)
        assert e.value.code == "price", bad


def test_a_span_phrase_uses_the_largest_exact_unit():
    from apps.billing.ways import _span_phrase

    assert [_span_phrase("free_opens", d) for d in (365, 730, 30, 60, 14, 7, 10, 1)] == [
        "after 1 year of joining",
        "after 2 years of joining",
        "after 1 month of joining",
        "after 2 months of joining",
        "after 2 weeks of joining",
        "after 1 week of joining",
        "after 10 days of joining",
        "after 1 day of joining",
    ]


def test_describe_says_it_in_plain_words(gold, silver):
    assert describe({"free": {"window": None}, "buy": None, "plans": []}) == "Free for everyone."
    assert describe({"free": None, "buy": {"price": "29", "window": None}, "plans": []}) == "€29 once, theirs to keep."
    assert (
        describe(
            {
                "free": None,
                "buy": {"price": "49", "window": {"closes_after_days": 365}},
                "plans": [
                    {"plan_id": gold.pk, "window": {"opens_after_days": 30}},
                    {"plan_id": silver.pk, "window": {"opens_after_days": 30}},
                ],
            }
        )
        == "€49 once with 1 year of access; in Gold and Silver after 1 month of membership."
    )
    assert (
        describe(
            {
                "free": {"window": {"closes_on": "2026-10-26"}},
                "buy": {"price": "29", "window": None},
                "plans": [],
            }
        )
        == "Free until 26 Oct 2026; €29 once, theirs to keep."
    )
    assert describe({"free": None, "buy": None, "plans": [{"plan_id": gold.pk, "window": None}]}) == "In Gold."
    # With an opening, the close (counted from when they got in) is a point, not a length.
    both = {"opens_after_days": 30, "closes_after_days": 90}
    assert (
        describe(
            {"free": None, "buy": {"price": "49", "window": both}, "plans": [{"plan_id": gold.pk, "window": both}]}
        )
        == "€49 once opening 1 month after purchase, until 3 months after purchase;"
        " in Gold after 1 month of membership until 3 months into membership."
    )
    assert describe({"free": {"window": both}, "buy": None, "plans": []}) == (
        "Free after 1 month of joining until 3 months after joining."
    )
