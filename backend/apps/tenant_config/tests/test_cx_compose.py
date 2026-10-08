"""AI components service: gating, metering, one repair round, photos, and
the registry. The model (core_ai.structured) and photo search are mocked."""

import copy
import re
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

import pytest
from django_tenants.utils import schema_context

from apps.accounts.models import User
from apps.core import ai as core_ai
from apps.core.models import CxComponent, CxVersion, PlatformPlan, PlatformSubscription, SiteAiUpdateUsage
from apps.core.onboarding import site_ai, site_composer
from apps.tenant_config.cx import compose
from apps.tenant_config.cx import prompt as cx_prompt
from apps.tenant_config.cx.draft import CxDraft

pytestmark = pytest.mark.django_db(transaction=True)

REF = re.compile(r"^cx_[0-9a-f]{8}@\d+$")
PLAN = "CX Test Plan"
ASK = "A day-by-day plan of my retreat"


@pytest.fixture()
def tenant(tenant_ctx):
    with schema_context("public"):
        plan = PlatformPlan.objects.create(name=PLAN, price_monthly=19, transaction_fee_pct=5, max_site_ai_updates=5)
        owner = User.objects.create_user(email="cx-owner@x.com", name="Owner", password="x", role="owner")  # noqa: S106
        PlatformSubscription.objects.create(
            tenant=tenant_ctx, user=owner, plan=plan, status=PlatformSubscription.STATUS_ACTIVE, provider="manual"
        )
    tenant_ctx.refresh_from_db()
    return tenant_ctx


@pytest.fixture(autouse=True)
def _clean_public():
    def scrub():
        # Tenant schema on the search path: deleting the owner cascades into
        # tenant tables (billing_payment, courses_course) that public lacks.
        with schema_context("shared_test"):
            CxComponent.objects.all().delete()
            SiteAiUpdateUsage.objects.all().delete()
            PlatformSubscription.objects.filter(plan__name=PLAN).delete()
            PlatformPlan.objects.filter(name=PLAN).delete()
            User.objects.filter(email="cx-owner@x.com").delete()

    scrub()
    yield
    scrub()


@pytest.fixture()
def ai(monkeypatch):
    state = SimpleNamespace(replies=[], calls=[])

    def fake(**kwargs):
        state.calls.append(kwargs)
        reply = state.replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return reply, Decimal("0.01"), "test-model"

    monkeypatch.setattr(core_ai, "structured", fake)
    monkeypatch.setattr(core_ai, "available", lambda: (True, "ok"))
    return state


@pytest.fixture(autouse=True)
def photos(monkeypatch):
    found = []

    def fake(queries, aspect, used, ctx):
        found.append(aspect)
        return SimpleNamespace(asset_id=f"asset-{len(found)}", description="A quiet beach at dawn"), SimpleNamespace(
            pk=uuid4()
        )

    monkeypatch.setattr(site_composer, "_find_photo", fake)
    return found


def draft(**changes):
    data = copy.deepcopy(cx_prompt.EXEMPLAR)
    data.update(changes)
    return CxDraft.model_validate(data)


def flawed():
    """The timeline names an undeclared list: still renderable once it is dropped, but with errors."""
    nodes = copy.deepcopy(cx_prompt.EXEMPLAR["nodes"])
    nodes[2]["props"][0]["value"] = "nope"  # Timeline.each
    return draft(nodes=nodes)


def usage(tenant):
    return site_ai.tenant_usage(tenant.schema_name)


def test_compose_builds_a_block_saves_it_and_meters_it(tenant, ai, photos):
    ai.replies.append(draft())
    res = compose.compose(tenant, ASK, "about")
    assert res["source"] == "ai" and res["remaining"] == 4 and res["missing"] == []
    block = res["block"]
    assert block["type"] == "cx" and REF.match(block["cx"]["ref"])
    assert block["heading"] == "How the week unfolds"
    assert all(day["image"]["photo_id"] for day in block["days"])
    assert photos == ["3:2", "3:2", "3:2"]
    component = CxComponent.objects.get(author_tenant_schema=tenant.schema_name)
    assert component.latest_version == 1 and component.name == "Retreat itinerary"
    assert CxVersion.objects.get(component=component).content["heading"] == "How the week unfolds"
    assert usage(tenant).updates_used == 1 and usage(tenant).usd_spent == Decimal("0.01")
    assert f"BUILD THIS SECTION: {ASK}" in ai.calls[0]["user"]
    assert "PAGE: about" in ai.calls[0]["user"]


def test_a_flawed_answer_gets_one_repair_round(tenant, ai):
    ai.replies.extend([flawed(), draft()])
    res = compose.compose(tenant, ASK)
    assert res["source"] == "ai" and len(ai.calls) == 2
    assert "PROBLEMS" in ai.calls[1]["user"] and "nope" in ai.calls[1]["user"]
    assert usage(tenant).usd_spent == Decimal("0.02")


def test_a_still_flawed_answer_is_used_in_its_cleaned_form(tenant, ai):
    ai.replies.extend([flawed(), flawed()])
    res = compose.compose(tenant, ASK)
    assert res["source"] == "ai"
    assert [n["t"] for n in res["block"]["cx"]["spec"]["tree"]["children"]] == ["Opener"]


def test_nothing_usable_is_a_friendly_error_that_costs_no_credit(tenant, ai):
    ai.replies.extend([draft(nodes=[]), core_ai.AiError("timeout", cost_usd=Decimal("0.03"))])
    res = compose.compose(tenant, ASK)
    assert res == {"block": None, "source": "error", "remaining": 5, "missing": []}
    assert usage(tenant).updates_used == 0 and usage(tenant).usd_spent == Decimal("0.04")
    assert not CxComponent.objects.exists()


def test_an_exhausted_quota_refuses_before_any_ai_call(tenant, ai):
    SiteAiUpdateUsage.objects.update_or_create(
        tenant_schema=tenant.schema_name, month=site_ai.current_month(), defaults={"updates_used": 5}
    )
    assert compose.compose(tenant, ASK)["source"] == "quota_exhausted"
    assert ai.calls == []


def test_a_too_short_request_is_refused_without_ai(tenant, ai):
    assert compose.compose(tenant, "hi")["source"] == "error"
    assert ai.calls == []


def test_ai_unavailable_reads_disabled(tenant, monkeypatch):
    monkeypatch.setattr(core_ai, "available", lambda: (False, "no_api_key"))
    assert compose.compose(tenant, ASK)["source"] == "disabled"


def test_refine_keeps_photos_and_adds_a_version(tenant, ai, photos):
    ai.replies.append(draft())
    first = compose.compose(tenant, ASK)["block"]
    texts = [{"field": "heading", "value": "Your week, day by day"}] + [
        t for t in cx_prompt.EXEMPLAR["texts"] if t["field"] != "heading"
    ]
    ai.replies.append(draft(texts=texts))
    res = compose.refine(tenant, first, "Make the heading warmer")
    block = res["block"]
    assert res["source"] == "ai" and block["id"] == first["id"]
    assert block["heading"] == "Your week, day by day"
    assert [d["image"]["photo_id"] for d in block["days"]] == [d["image"]["photo_id"] for d in first["days"]]
    assert len(photos) == 3  # no new searches
    assert block["cx"]["ref"].split("@") == [first["cx"]["ref"].split("@")[0], "2"]
    assert "CHANGE THIS SECTION: Make the heading warmer" in ai.calls[1]["user"]


def test_refining_someone_elses_component_starts_a_new_one(tenant, ai):
    CxComponent.objects.create(pk="cx_00000000", name="Theirs", author_tenant_schema="other_school", latest_version=1)
    ai.replies.append(draft())
    block = compose.compose(tenant, ASK)["block"]
    block["cx"]["ref"] = "cx_00000000@1"
    ai.replies.append(draft())
    res = compose.refine(tenant, block, "Shorter please")
    assert not res["block"]["cx"]["ref"].startswith("cx_00000000")
    assert CxComponent.objects.get(pk="cx_00000000").latest_version == 1


def test_refine_rejects_a_broken_block_without_ai(tenant, ai):
    assert compose.refine(tenant, {"type": "cx", "cx": None}, "Shorter please")["source"] == "error"
    assert ai.calls == []


def test_my_components_lists_only_this_tenants(tenant, ai):
    CxComponent.objects.create(pk="cx_00000000", name="Theirs", author_tenant_schema="other_school", latest_version=0)
    ai.replies.append(draft())
    compose.compose(tenant, ASK)
    rows = compose.my_components(tenant)["components"]
    assert [r["name"] for r in rows] == ["Retreat itinerary"]
    assert REF.match(rows[0]["ref"])
    assert rows[0]["spec"]["tree"]["t"] == "Section"
    assert rows[0]["content"]["heading"] == "How the week unfolds"


@pytest.fixture()
def slow_model(ai, monkeypatch):
    """Every model call takes `seconds` of (fake) wall clock."""
    clock = {"t": 0.0, "seconds": 60.0}
    monkeypatch.setattr(compose, "_now", lambda: clock["t"])
    inner = core_ai.structured

    def slow(**kwargs):
        clock["t"] += clock["seconds"]
        return inner(**kwargs)

    monkeypatch.setattr(core_ai, "structured", slow)
    return clock


def test_a_slow_first_answer_skips_the_repair_round(tenant, ai, slow_model):
    # One request must finish inside Cloudflare's ~100 s edge cap, or the coach is charged for a lost result.
    ai.replies.extend([flawed(), draft()])
    res = compose.compose(tenant, ASK)
    assert res["source"] == "ai" and len(ai.calls) == 1


def test_photo_searches_stop_when_the_time_budget_is_spent(tenant, ai, slow_model, photos):
    slow_model["seconds"] = 80.0
    ai.replies.append(draft())
    res = compose.compose(tenant, ASK)
    assert res["source"] == "ai" and photos == []
    assert all(not day["image"]["photo_id"] for day in res["block"]["days"])
