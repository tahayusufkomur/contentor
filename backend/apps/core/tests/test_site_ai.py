"""AI site-edit metering (mirrors apps/blog/ai.py's accounting contract) +
the recompose-with-instruction preview/apply engine (Plan 5 — reveal chat +
site-AI quota)."""

import json
from decimal import Decimal
from types import SimpleNamespace
from unittest import mock

import pytest
from django.db import connection
from django_tenants.utils import tenant_context
from rest_framework.test import APIClient

from apps.core.models import PlatformPlan, SiteAiUpdateUsage, Tenant
from apps.core.onboarding import site_ai
from apps.core.tasks import provision_tenant_schema

pytestmark = pytest.mark.django_db(transaction=True)

SCHEMA = "site_ai_test"


@pytest.fixture()
def client():
    return APIClient()


def _prov(schema):
    connection.set_schema_to_public()
    t = Tenant.objects.create(
        schema_name=schema, name=schema, slug=schema, subdomain=schema, owner_email=f"{schema}@e.com", region="global"
    )
    provision_tenant_schema(t, t.owner_email, "Owner", "en")
    return t


def _drop(schema):
    connection.set_schema_to_public()
    with connection.cursor() as cur:
        cur.execute(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE')
    Tenant.objects.filter(schema_name=schema).delete()
    connection.set_schema_to_public()


def _tenant(limit, paid=True):
    plan = PlatformPlan.objects.create(
        name=f"sa-{limit}-{paid}", price_monthly=1, transaction_fee_pct=1, max_site_ai_updates=limit
    )
    return SimpleNamespace(
        schema_name=SCHEMA, platform_subscription=SimpleNamespace(plan=plan), has_paid_platform_plan=paid
    )


def test_availability_counts_remaining(settings):
    settings.ANTHROPIC_API_KEY = "k"
    SiteAiUpdateUsage.objects.create(tenant_schema=SCHEMA, month=site_ai.current_month(), updates_used=1)
    a = site_ai.availability(_tenant(3))
    assert a["remaining"] == 2 and a["limit"] == 3


def test_record_update_increments_only_the_counter():
    site_ai.record_attempt_cost(SCHEMA, Decimal("0.02"))
    site_ai.record_update(SCHEMA)
    row = site_ai.tenant_usage(SCHEMA)
    assert row.updates_used == 1 and row.usd_spent == Decimal("0.02")


# ── Site-edit engine (preview + apply) ──────────────────────────────────────


def test_apply_edit_persists_pages(restore_public):
    t = _prov("site_ai_apply")
    try:
        with tenant_context(t):
            from apps.tenant_config.models import TenantConfig

            cfg = TenantConfig.objects.first()
            new_pages = {"home": {"blocks": []}, "marker": True}
            site_ai.apply_edit(t, new_pages, extras=None)
            cfg.refresh_from_db()
            assert cfg.pages == new_pages
    finally:
        _drop("site_ai_apply")


def test_preview_edit_threads_the_instruction_as_a_followup_pair(restore_public):
    """compose_pages' `followups` are {q, a} dicts (ai_compose._brief calls
    .get("q")/.get("a") on each) — preview_edit must not pass the coach's raw
    instruction string straight through as a followup element, or the very
    first call would blow up with AttributeError."""
    t = _prov("site_ai_preview")
    try:
        with mock.patch("apps.core.onboarding.ai_compose.compose_pages", return_value=({"home": {}}, {})) as compose:
            pages, extras, cost = site_ai.preview_edit(t, "make it warmer")
        assert pages == {"home": {}}
        assert extras == {}
        assert cost == Decimal("0")
        followups = compose.call_args.kwargs["followups"]
        assert len(followups) == 1
        assert followups[0]["q"] and followups[0]["a"] == "make it warmer"
    finally:
        _drop("site_ai_preview")


# ── Reveal chat endpoints (preview SSE + apply with free counter) ──────────


def test_reveal_apply_decrements_free_counter(restore_public, client):
    from apps.accounts.tokens import create_wizard_token

    t = _prov("site_ai_reveal")
    token = create_wizard_token(t.owner_email, t.name, t.slug, region=t.region or "global")
    try:
        with mock.patch("apps.core.onboarding.wizard._apply_last_preview") as apply_fn:
            for expected_remaining in (2, 1, 0):
                r = client.post(
                    "/api/v1/onboarding/wizard/site-edit/apply/",
                    {"token": token, "pages": {"home": {"blocks": []}}},
                    format="json",
                )
                assert r.status_code == 200
                assert r.json()["remaining"] == expected_remaining
            assert apply_fn.call_count == 3
            r = client.post(
                "/api/v1/onboarding/wizard/site-edit/apply/",
                {"token": token, "pages": {"home": {"blocks": []}}},
                format="json",
            )
            assert r.status_code == 402
            assert apply_fn.call_count == 3  # the 4th call never reaches apply
    finally:
        _drop("site_ai_reveal")


def _sse_frames(response):
    body = b"".join(response.streaming_content).decode()
    return [json.loads(line[len("data: ") :]) for line in body.splitlines() if line.startswith("data: ")]


def test_reveal_preview_streams_and_charges_the_attempt(restore_public, client):
    """Regression: the preview endpoint MUST negotiate `Accept:
    text/event-stream` (EventStreamRenderer registered) or DRF 406s before the
    view body ever runs — the frontend's streamAi() always sends that header."""
    from apps.accounts.tokens import create_wizard_token
    from apps.core.onboarding import site_ai

    t = _prov("site_ai_preview_ep")
    token = create_wizard_token(t.owner_email, t.name, t.slug, region=t.region or "global")
    try:
        # The streaming body is lazily evaluated on iteration, so the frames
        # must be drained INSIDE the mock's scope (mirrors
        # apps/blog/tests/test_admin_api.py's _sse_frames(_stream_post(...))
        # pattern) — draining it after the `with` exits would run the real
        # (unmocked) preview_edit and hit a live, unconfigured AI call.
        with mock.patch.object(site_ai, "preview_edit", return_value=({"home": {}}, {}, Decimal("0.01"))):
            r = client.post(
                "/api/v1/onboarding/wizard/site-edit/preview/",
                {"token": token, "instruction": "make it warmer"},
                format="json",
                HTTP_ACCEPT="text/event-stream",
            )
            assert r.status_code == 200
            assert r["Content-Type"] == "text/event-stream"
            frames = _sse_frames(r)
        assert frames[0] == {"type": "phase", "phase": "thinking"}
        assert frames[-1] == {"type": "done", "pages": {"home": {}}}
        assert site_ai.tenant_usage(t.schema_name).usd_spent == Decimal("0.01")
    finally:
        _drop("site_ai_preview_ep")
