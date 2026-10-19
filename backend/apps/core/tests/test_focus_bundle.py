"""A bundle in focus mode (apps.core.focus.kinds.bundle): its draft is an
unpublished Bundle at price 0 from her first answer (G4); what goes in it is
ticked from what she sells on its own and kept as BundleItem rows; its price
is a quarter off what the items cost bought apart, or the sum, or her own
amount, and only ever her tap or her words; it is published only with two
items and a price, by her finish tap or the page's Publish, and only the site
owner can make one."""

import json
from datetime import timedelta
from decimal import Decimal
from unittest import mock

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.billing.models import Bundle, BundleItem
from apps.core import tasks
from apps.core.focus import copywriter, flow, jobs
from apps.core.focus.kinds import bundle
from apps.courses.models import Course
from apps.downloads.models import DownloadFile
from apps.live.models import LiveClass, ZoomClass
from apps.tenant_config.models import FocusCreation, TenantConfig

pytestmark = pytest.mark.django_db(transaction=True)

HOST = "shared-test.localhost"
URL = "/api/v1/admin/focus/"


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
    return _user("focus-bundle@x.com", "owner")


@pytest.fixture(autouse=True)
def on(settings):
    settings.FOCUS_MODE_ENABLED = True
    settings.FOCUS_KINDS = ["course", "bundle"]
    with mock.patch.object(tasks.run_focus_job, "delay"):
        yield


def _client(user):
    client = APIClient(HTTP_HOST=HOST)
    client.force_authenticate(user=user)
    return client


def _course(owner, title="Yoga basics", price="40", **kw):
    kw.setdefault("is_published", True)
    kw.setdefault("pricing_type", "paid" if Decimal(price) > 0 else "free")
    return Course.objects.create(
        title=title, slug=title.lower().replace(" ", "-"), instructor=owner, price=Decimal(price), **kw
    )


def _bundle(creation) -> Bundle:
    return Bundle.objects.get(pk=creation.record_id)


def _items(row) -> set:
    return {(i.content_type.model, i.object_id) for i in BundleItem.objects.filter(bundle=row)}


def _values(creation) -> list[str]:
    return [o["value"] for o in flow.state(creation)["question"]["options"]]


def _at_finish(owner, *, count=2, price="paid:75"):
    """A bundle of ``count`` of her courses ($40, $60, …; she sells at least two) answered up to the finish step."""
    courses = [_course(owner, f"Course {n}", price=str(40 + 20 * n)) for n in range(max(count, 2))]
    creation = flow.start(owner, "bundle", value=",".join(f"course:{c.pk}" for c in courses[:count]))
    assert flow.current_field(creation) == "review"
    creation.answers = {**creation.answers, "review": "ok"}
    creation.save()
    if price:
        creation = flow.answer(creation, "access", value=price)
    else:
        creation.answers = {**creation.answers, "access": flow.DELEGATE}
        creation.save()
    assert flow.current_field(creation) == "finish"
    return creation


# ── The brief's tests ───────────────────────────────────────────────────────


def test_the_suggested_bundle_price_is_a_quarter_off_the_items(owner):
    basics = _course(owner, "Yoga basics", price="40")
    flow_ = _course(owner, "Vinyasa flow", price="60")
    soon = timezone.now() + timedelta(days=1)
    weekly = [
        LiveClass.objects.create(
            title="Morning flow",
            instructor=owner,
            scheduled_at=soon + timedelta(days=7 * i),
            status="scheduled",
            pricing_type="paid",
            price=Decimal("10"),
        )
        for i in range(2)
    ]
    picked = f"course:{basics.pk},course:{flow_.pk},event:live:{weekly[0].pk}"
    creation = flow.start(owner, "bundle", value=picked)
    creation.answers = {**creation.answers, "review": "ok"}
    creation.save()
    asked = flow.state(creation)["question"]
    assert asked["field"] == "access" and asked["question"] == "What should it cost?"
    # $40 + $60 + two sessions at $10 (a series counts each row it adds) = $120 bought apart.
    assert asked["options"] == [
        {"value": "paid:90", "label": "$90", "hint": "$120 bought apart; 25% off"},
        {"value": "paid:120.00", "label": "$120", "hint": "the same as buying them apart"},
    ]
    assert (asked["suggested"], asked["say"]) == ("paid:90", "Say an amount")
    assert _bundle(creation).price == 0  # nothing until her tap
    creation = flow.answer(creation, "access", value="paid:90")
    assert _bundle(creation).price == Decimal("90.00")
    assert flow.state(creation)["answered"][-1] == {"field": "access", "label": "$90"}
    # Priced: "Sell it for" is no longer hers to see.
    assert bundle.suggest_price(_bundle(creation)) is None


def test_publish_is_refused_under_two_items(owner):
    creation = _at_finish(owner, count=1, price="paid:30")
    row = _bundle(creation)
    assert bundle.not_ready(row) == "Add at least two items"
    with mock.patch("apps.core.monetization.can_monetize", return_value=True):
        asked = flow.state(creation)["question"]
        assert asked["why"].startswith("Add at least two items.")
        assert asked["specialist"] == "finance"
        assert [o["value"] for o in asked["options"]] == ["draft"]
        creation = flow.finish(creation, publish=True)  # a stale screen still offering Publish
    assert not _bundle(creation).is_published
    assert creation.answers["finish"] == "draft"


def test_named_items_are_matched_by_title(owner):
    basics = _course(owner, "Yoga basics")
    _course(owner, "Yoga for runners")
    vinyasa = _course(owner, "Vinyasa flow", price="60")
    with mock.patch("apps.core.onboarding.ai_compose.compose_available", return_value=True):
        creation = flow.start(owner, "bundle", text="A bundle of my yoga basics and vinyasa courses")
    assert creation.pending["field"] == "items"  # read by the analysis first
    row = _bundle(creation)
    assert (row.name, row.price, row.is_published) == ("New bundle", 0, False)
    found = bundle.FOUND(items=["vinyasa", "YOGA BASICS", "Yoga"], topic="Yoga starter pack")  # "Yoga": two
    flow.apply(creation, found)
    creation.save()
    asked = flow.state(creation)["question"]
    assert (asked["field"], asked["kind"]) == ("items", "pick")
    assert sorted(asked["ticked"]) == sorted([f"course:{basics.pk}", f"course:{vinyasa.pk}"])  # in tile order
    assert _items(_bundle(creation)) == set()  # ticked on the question; added with her answer
    assert _bundle(creation).name == "Yoga starter pack"  # her words, read
    creation = flow.answer(creation, "items", value=",".join(asked["ticked"]))
    assert _items(_bundle(creation)) == {("course", basics.pk), ("course", vinyasa.pk)}
    line = flow.state(creation)["answered"][0]
    assert line["field"] == "items" and set(line["label"].split(", ")) == {"Yoga basics", "Vinyasa flow"}


# ── Rule 1: the owner's alone ───────────────────────────────────────────────


def test_a_coach_who_is_not_the_owner_cannot_start_one(owner):
    course = _course(owner)
    other = _course(owner, "Vinyasa flow", price="60")
    coach = _user("focus-bundle-coach@x.com", "coach")
    client = _client(coach)
    res = client.post(URL, {"kind": "bundle", "value": f"course:{course.pk}"}, format="json")
    assert (res.status_code, res.json()) == (403, {"detail": "owner_only"})
    assert not Bundle.objects.exists()
    cid = FocusCreation.objects.create(kind="bundle", actor=coach, answers={}).pk
    assert client.get(f"{URL}{cid}/").status_code == 403
    overview = client.get(URL).json()
    assert "bundle" not in overview["kinds"] and "bundle" not in overview["first"]
    mine = _client(owner).get(URL).json()
    assert "bundle" in mine["kinds"]
    # Her first question's tiles are her items, before any creation exists.
    assert {o["value"] for o in mine["first"]["bundle"]["options"]} == {f"course:{course.pk}", f"course:{other.pk}"}
    res = _client(owner).post(URL, {"kind": "bundle", "value": f"course:{course.pk}"}, format="json")
    assert res.status_code == 201


# ── Rule 2: the draft ───────────────────────────────────────────────────────


def test_the_draft_is_hidden_at_price_0_with_her_ticks_in_it(owner):
    basics, vinyasa = _course(owner, "Yoga basics"), _course(owner, "Vinyasa flow", price="60")
    creation = flow.start(owner, "bundle", value=f"course:{basics.pk},course:{vinyasa.pk}")
    row = _bundle(creation)
    assert (row.name, row.price, row.is_published, row.is_active) == ("New bundle", 0, False, True)
    assert _items(row) == {("course", basics.pk), ("course", vinyasa.pk)}
    assert flow.current_field(creation) == "review"
    assert creation.runs.get("copy")  # the copy job drafts its name and description
    assert flow.state(creation)["record"] == {
        "id": row.pk,
        "kind": "bundle",
        "title": "New bundle",
        "path": f"/admin/store/bundles/{row.pk}",
    }
    store = APIClient(HTTP_HOST=HOST).get("/api/v1/billing/store/?type=bundle").json()
    assert store == []


def test_just_draft_it_never_sets_a_price(owner):
    creation = _at_finish(owner, price=None)
    assert _bundle(creation).price == 0
    asked = flow.state(creation)["question"]
    assert asked["why"].startswith("Set its price first.")
    sell = next(o for o in asked["options"] if o["value"].startswith("price:"))
    assert sell == {"value": "price:75", "label": "Sell it for $75", "hint": "$100 bought apart; 25% off"}


# ── Rule 3: what goes in it ─────────────────────────────────────────────────


def test_the_tiles_are_what_she_sells_on_its_own(owner):
    course = _course(owner, "Yoga basics")
    _course(owner, "Free intro", price="0")
    _course(owner, "Draft course", is_published=False)
    workbook = DownloadFile.objects.create(
        title="Breathing workbook", is_published=True, pricing_type="paid", price=Decimal("9"), file_url="a.pdf"
    )
    DownloadFile.objects.create(title="No file yet", is_published=True, pricing_type="paid", price=Decimal("9"))
    DownloadFile.objects.create(title="Free sheet", is_published=True, file_url="b.pdf")
    soon = timezone.now() + timedelta(days=1)
    paid = {"pricing_type": "paid", "price": Decimal("15"), "status": "scheduled"}
    weekly = [
        LiveClass.objects.create(
            title="Morning flow", instructor=owner, scheduled_at=soon + timedelta(days=7 * i), **paid
        )
        for i in range(2)
    ]
    LiveClass.objects.create(title="Free circle", instructor=owner, scheduled_at=soon, status="scheduled")
    LiveClass.objects.create(title="Held class", instructor=owner, scheduled_at=soon, **{**paid, "status": "draft"})
    past = timezone.now() - timedelta(days=3)
    LiveClass.objects.create(title="Last spring", instructor=owner, scheduled_at=past, **{**paid, "status": "ended"})
    ZoomClass.objects.create(title="Zoom chat", instructor=owner, scheduled_at=soon, **paid)
    Bundle.objects.create(name="Old bundle", price=Decimal("20"))
    asked = flow.question("bundle", "items")
    assert asked["options"] == [
        {"value": f"course:{course.pk}", "label": "Yoga basics", "hint": "Course"},
        {"value": f"event:live:{weekly[0].pk}", "label": "Morning flow", "hint": "Live class"},
        {"value": f"download:{workbook.pk}", "label": "Breathing workbook", "hint": "Download"},
    ]
    creation = flow.start(owner, "bundle", value="all")
    assert _items(_bundle(creation)) == {
        ("course", course.pk),
        ("downloadfile", workbook.pk),
        *{("liveclass", row.pk) for row in weekly},  # the whole series
    }


def test_what_cannot_join_is_named_with_the_reason(owner):
    basics = _course(owner, "Yoga basics")
    free = _course(owner, "Free intro", price="0")
    _course(owner, "Pilates core", price="30")
    with mock.patch("apps.core.onboarding.ai_compose.compose_available", return_value=True):
        creation = flow.start(owner, "bundle", text="yoga basics and the free intro")
    flow.apply(creation, bundle.FOUND(items=["Yoga basics", "Free intro"]))
    creation.save()
    asked = flow.state(creation)["question"]
    assert asked["ticked"] == [f"course:{basics.pk}"]
    assert asked["why"].startswith(f"Free intro could not be added: {bundle.REFUSED} ")
    # A tile that stopped being on sale before her tap (made free in another tab) is named at the next question.
    vinyasa = _course(owner, "Vinyasa flow", price="60")
    Course.objects.filter(pk=vinyasa.pk).update(pricing_type="free", price=0)
    creation = flow.answer(creation, "items", value=f"course:{basics.pk},course:{vinyasa.pk},course:{free.pk}")
    assert _items(_bundle(creation)) == {("course", basics.pk)}
    assert creation.answers["items"] == [f"course:{basics.pk}"]
    asked = flow.state(creation)["question"]
    assert asked["field"] == "review"
    assert asked["why"].startswith(f"Vinyasa flow and Free intro could not be added: {bundle.REFUSED} ")


def test_an_untick_takes_it_out_and_nothing_ticked_is_asked_again(owner):
    basics, vinyasa = _course(owner, "Yoga basics"), _course(owner, "Vinyasa flow", price="60")
    creation = flow.start(owner, "bundle", value=f"course:{basics.pk},course:{vinyasa.pk}")
    creation.answers = {**creation.answers, "items": [f"course:{vinyasa.pk}"]}
    bundle.sync(creation)
    assert _items(_bundle(creation)) == {("course", vinyasa.pk)}
    creation = flow.start(owner, "bundle", value="course:99999")
    assert flow.current_field(creation) == "items"
    assert bundle.label("items", "course:99999") == "Nothing ticked"


# ── Rule 4: her price ───────────────────────────────────────────────────────


def test_a_price_she_set_on_the_page_stands_over_sell_it_for(owner):
    creation = _at_finish(owner, price=None)
    assert "price:75" in _values(creation)
    Bundle.objects.filter(pk=creation.record_id).update(price=Decimal("80"))  # her PATCH
    with mock.patch("apps.core.monetization.can_monetize", return_value=True):
        assert _values(creation) == ["publish", "draft"]
        creation = flow.answer(creation, "finish", value="price:75")  # the button she saw before
        assert (_bundle(creation).price, creation.answers["access"]) == (Decimal("80.00"), flow.DELEGATE)
        creation = flow.finish(creation, publish=True)
    assert (_bundle(creation).price, _bundle(creation).is_published) == (Decimal("80.00"), True)


def test_her_words_set_the_price_and_free_is_asked_again(owner):
    basics = _course(owner, "Yoga basics")
    _course(owner, "Pilates core", price="30")
    with mock.patch("apps.core.onboarding.ai_compose.compose_available", return_value=True):
        creation = flow.start(owner, "bundle", text="yoga basics for 35")
    flow.apply(creation, bundle.FOUND(items=["Yoga basics"], price="35"))
    creation.save()
    assert (_bundle(creation).price, creation.answers["access"]) == (Decimal("35.00"), "paid:35.00")
    creation = flow.answer(creation, "items", value=f"course:{basics.pk}")
    assert creation.answers["access"] == "paid:35.00"
    other = flow.start(owner, "bundle", value=f"course:{basics.pk}")
    other.answers = {**other.answers, "price": "free", "access": "free"}
    bundle.sync(other)
    assert "access" not in other.answers and _bundle(other).price == 0


# ── Rule 5: ready, selling, live ────────────────────────────────────────────


def test_publish_is_refused_without_a_price(owner):
    creation = _at_finish(owner, price=None)
    assert bundle.not_ready(_bundle(creation)) == "Set its price first"
    with mock.patch("apps.core.monetization.can_monetize", return_value=True):
        creation = flow.finish(creation, publish=True)
    assert not _bundle(creation).is_published


def test_a_kept_draft_says_what_it_still_needs(owner):
    creation = flow.finish(_at_finish(owner, price=None), publish=False)
    assert flow.closing_line(creation) == "Saved as a draft. Set its price first, then publish it from this page."
    Bundle.objects.filter(pk=creation.record_id).update(price=75)  # ready: only her Publish is left
    assert flow.closing_line(creation) == "Saved as a draft. Publish it from this page when you're ready."


def test_start_selling_only_once_it_has_a_price(owner):
    creation = _at_finish(owner, price=None)
    with (
        mock.patch("apps.core.monetization.is_paid_active", return_value=False),
        mock.patch("apps.core.monetization.can_monetize", return_value=False),
    ):
        assert _values(creation) == ["draft", "price:75"]
        creation = flow.answer(creation, "finish", value="price:75")
        assert _values(creation) == ["start_selling", "draft"]
        creation = flow.finish(creation, publish=True)
    assert not _bundle(creation).is_published


def test_publish_puts_it_in_the_store(owner):
    creation = _at_finish(owner)
    with mock.patch("apps.core.monetization.can_monetize", return_value=True):
        assert _values(creation) == ["publish", "draft"]
        creation = flow.finish(creation, publish=True)
    row = _bundle(creation)
    assert (row.is_published, row.price, creation.answers["finish"]) == (True, Decimal("75.00"), "publish")
    store = APIClient(HTTP_HOST=HOST).get("/api/v1/billing/store/?type=bundle").json()
    assert [i["id"] for i in store] == [row.pk]


# ── Rule 6: who writes it ───────────────────────────────────────────────────


def test_the_copy_job_writes_the_bundle_name_over_new_bundle(owner):
    basics, vinyasa = _course(owner, "Yoga basics"), _course(owner, "Vinyasa flow", price="60")
    creation = flow.start(owner, "bundle", value=f"course:{basics.pk},course:{vinyasa.pk}")
    copy = copywriter.output_for("bundle")(name="Yoga Starter Pack", description="Two courses to begin with.")
    with (
        mock.patch("apps.core.focus.copywriter.ai_compose.compose_available", return_value=True),
        mock.patch("apps.core.focus.copywriter.ai_compose.record_spend"),
        mock.patch("apps.core.focus.copywriter.core_ai.structured", return_value=(copy, Decimal(0), "x")) as model,
    ):
        jobs.execute("shared_test", creation.runs["copy"])
    turn = json.loads(model.call_args.kwargs["user"])
    assert sorted(turn["items"]) == ["Vinyasa flow (course)", "Yoga basics (course)"]
    assert turn["current"] == {"name": "New bundle", "description": ""}
    row = _bundle(creation)
    assert (row.name, row.description, row.is_published, row.price) == (
        "Yoga Starter Pack",
        "Two courses to begin with.",
        False,
        0,
    )
    assert bundle.announce_facts(row)["link"] == "/store"


# ── Rule 8: publishing a kept draft later, from its page ───────────────────


def test_the_page_cannot_publish_a_bundle_that_is_not_ready(owner):
    creation = _at_finish(owner, count=1, price="paid:30")
    client = _client(owner)
    url = f"/api/v1/billing/bundles/{creation.record_id}/"
    with mock.patch("apps.core.monetization.can_monetize", return_value=True):
        res = client.patch(url, {"is_published": True}, format="json")
        assert (res.status_code, res.json()) == (400, {"is_published": ["Add at least two items."]})
        two = Course.objects.exclude(pk__in=[i.object_id for i in _bundle(creation).items.all()]).get()
        items = [{"content_type": "course", "object_id": i.object_id} for i in _bundle(creation).items.all()]
        body = {"is_published": True, "price": "0", "items": [*items, {"content_type": "course", "object_id": two.pk}]}
        res = client.patch(url, body, format="json")
        assert (res.status_code, res.json()) == (400, {"is_published": ["Set its price first."]})
        assert len(_items(_bundle(creation))) == 1 and _bundle(creation).price == Decimal("30.00")  # rolled back
    with mock.patch("apps.core.monetization.can_monetize", return_value=False):
        res = client.patch(url, {**body, "price": "40"}, format="json")
        assert (res.status_code, res.json()) == (400, {"is_published": [Bundle.NOT_SELLING]})
    with mock.patch("apps.core.monetization.can_monetize", return_value=True):
        res = client.patch(url, {**body, "price": "40"}, format="json")
    assert res.status_code == 200 and res.json()["is_published"] is True
    assert _bundle(creation).is_published


# ── Fold-in round ───────────────────────────────────────────────────────────


def test_what_her_later_words_cannot_add_is_still_named(owner):
    """R1: her words at the review name one item that can go in and one that cannot: the one is added,
    and the other is named there, not dropped by the sync that adds the first."""
    creation = _at_finish(owner, price=None)
    creation.answers = {k: v for k, v in creation.answers.items() if k not in ("review", "access")}  # at the review
    creation.save()
    workbook = DownloadFile.objects.create(
        title="Breathing workbook", is_published=True, pricing_type="paid", price=Decimal("9"), file_url="a.pdf"
    )
    _course(owner, "Free intro", price="0")
    with mock.patch("apps.core.onboarding.ai_compose.compose_available", return_value=True):
        creation = flow.answer(creation, "review", text="also add Breathing workbook and Free intro")
    flow.apply(creation, bundle.FOUND(items=["Breathing workbook", "Free intro"]))
    creation.save()
    assert ("downloadfile", workbook.pk) in _items(_bundle(creation))
    asked = flow.state(creation)["question"]
    assert asked["field"] == "review"
    assert asked["why"].startswith(f"Free intro could not be added: {bundle.REFUSED} ")


def test_a_series_alone_is_one_item(owner):
    """R2 (G19): a class series counts once, wherever it would be published; its held sessions not at all."""
    soon = timezone.now() + timedelta(days=1)
    paid = {"pricing_type": "paid", "price": Decimal("15"), "status": "scheduled"}
    weekly = [
        LiveClass.objects.create(
            title="Morning flow", instructor=owner, scheduled_at=soon + timedelta(days=7 * i), **paid
        )
        for i in range(3)
    ]
    LiveClass.objects.filter(pk=weekly[2].pk).update(status="draft")  # a held session
    _course(owner, "Yoga basics")
    creation = flow.start(owner, "bundle", value=f"event:live:{weekly[0].pk}")
    assert len(_items(_bundle(creation))) == 3  # every session is in it
    creation.answers = {**creation.answers, "review": "ok"}
    creation.save()
    creation = flow.answer(creation, "access", value=flow.state(creation)["question"]["options"][0]["value"])
    row = _bundle(creation)
    assert (row.item_count(), row.not_ready()) == (1, "Add at least two items")
    with mock.patch("apps.core.monetization.can_monetize", return_value=True):
        assert _values(creation) == ["draft"]
        res = _client(owner).patch(f"/api/v1/billing/bundles/{row.pk}/", {"is_published": True}, format="json")
        assert (res.status_code, res.json()) == (400, {"is_published": ["Add at least two items."]})
        # The page's line where Publish would be.
        assert _client(owner).get(f"/api/v1/billing/bundles/{row.pk}/").json()["not_ready"] == "Add at least two items"
        creation = flow.finish(creation, publish=True)
    assert not _bundle(creation).is_published


def test_with_fewer_than_two_items_to_sell_no_draft_is_made(owner):
    """R6: one item she sells (and a free one) cannot make a bundle: no draft that could never be published."""
    course = _course(owner)
    _course(owner, "Free intro", price="0")
    assert [o["value"] for o in flow.question("bundle", "items")["options"]] == [f"course:{course.pk}"]
    with pytest.raises(flow.FlowError, match=bundle.TOO_FEW):
        flow.start(owner, "bundle", text="a bundle of my yoga course")
    res = _client(owner).post(URL, {"kind": "bundle", "value": f"course:{course.pk}"}, format="json")
    assert (res.status_code, res.json()) == (400, {"detail": bundle.TOO_FEW})
    assert not Bundle.objects.exists() and not FocusCreation.objects.exists()


def test_the_publish_rule_lives_in_billing(owner):
    """R4: the PATCH guard and the focus adapter read one rule, on the Bundle model; billing imports no focus code."""
    import inspect

    from apps.billing.models import core
    from apps.billing.serializers import bundles as serializers

    assert "apps.core.focus" not in inspect.getsource(serializers) + inspect.getsource(core)
    creation = _at_finish(owner, count=1, price="paid:30")
    row = _bundle(creation)
    assert bundle.not_ready(row) == row.not_ready() == Bundle.NO_ITEMS
    with mock.patch("apps.core.monetization.can_monetize", return_value=False):
        Bundle.objects.filter(pk=row.pk).update(price=0)
        row.refresh_from_db()
        assert (bundle.cannot_sell(row), row.cannot_sell()) == (False, False)


# ── The adapter ─────────────────────────────────────────────────────────────


def test_finance_asks_and_marketing_writes(owner):
    specialists = bundle.RECIPE.specialists
    assert [q.id for q in bundle.RECIPE.questions] == ["items", "review", "access", "finish", "announce"]
    assert (specialists["items"], specialists["access"], specialists["finish"]) == ("finance",) * 3
    assert (specialists["review"], bundle.ANNOUNCER, bundle.FINISH_SPECIALIST) == ("marketing", "marketing", "finance")
    assert (bundle.COVER, bundle.put_in_plan, bundle.COPY_FIELDS) == (None, None, ("name", "description"))
