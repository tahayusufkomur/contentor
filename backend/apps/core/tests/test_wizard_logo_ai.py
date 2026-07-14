import pytest
from django.db import connection
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.accounts.tokens import create_wizard_token
from apps.core.models import PlatformPlan, PlatformSubscription, Tenant

pytestmark = pytest.mark.django_db(transaction=True)

SHARED_DOMAIN = "shared-test.localhost"


def _client():
    return APIClient(HTTP_HOST=SHARED_DOMAIN)


def _token():
    return create_wizard_token("coach@x.com", "Coach", "Ai Logo Studio")


@pytest.fixture()
def tenant(restore_public):
    connection.set_schema_to_public()
    t, _ = Tenant.objects.get_or_create(
        schema_name="ai_logo_studio",
        defaults={
            "name": "Ai Logo Studio",
            "slug": "ai-logo-studio",
            "subdomain": "ai-logo-studio",
            "owner_email": "coach@x.com",
        },
    )
    t.provisioning_status = "pending"
    t.wizard_state = {"answers": {"niche": "yoga", "theme": "forest", "description": "Calm vinyasa."}}
    t.save(update_fields=["provisioning_status", "wizard_state"])
    yield t
    connection.set_schema_to_public()
    # Raw delete, not the ORM cascade: this tenant's schema is never
    # physically created (auto_create_schema=False, pre-provision), so a
    # cascading PlatformSubscription delete tries to UPDATE tenant-only
    # tables (e.g. billing_payment) that don't exist under the public
    # search path — same gotcha documented in test_logo_ai_views.py, but
    # there's no tenant schema to switch into here to work around it.
    with connection.cursor() as cursor:
        cursor.execute("DELETE FROM core_platformsubscription WHERE tenant_id = %s", [t.id])
    Tenant.objects.filter(schema_name="ai_logo_studio").delete()


@pytest.fixture()
def paid(tenant):
    plan, _ = PlatformPlan.objects.get_or_create(
        name="starter-wiz-test", defaults={"price_monthly": 19, "transaction_fee_pct": 8}
    )
    owner, _ = User.objects.get_or_create(email="wizlogo-owner@x.com", defaults={"name": "Owner", "role": "owner"})
    PlatformSubscription.objects.update_or_create(
        tenant=tenant, defaults={"user": owner, "plan": plan, "status": "active"}
    )
    return tenant


def test_logo_status_unpaid(tenant):
    resp = _client().post("/api/v1/onboarding/wizard/logo-status/", {"token": _token()}, format="json")
    assert resp.status_code == 200
    body = resp.json()
    assert body["paid"] is False
    assert body["reason"] == "upgrade_required"


def test_converse_unpaid_returns_upgrade_required(tenant, monkeypatch):
    from apps.tenant_config import logo_api

    monkeypatch.setattr(logo_api.core_ai, "available", lambda: (True, None))
    resp = _client().post(
        "/api/v1/onboarding/wizard/logo-converse/",
        {"token": _token(), "stage": "icon", "message": "a lotus"},
        format="json",
    )
    assert resp.status_code == 200
    assert resp.json()["source"] == "upgrade_required"


def test_converse_paid_builds_brief_from_wizard_answers(paid, monkeypatch):
    from apps.core.onboarding import wizard_logo
    from apps.tenant_config import logo_api

    seen = {}

    def fake_converse(tenant, brief, data):
        seen.update(brief)
        return {"phase": "final", "message": "ok", "designs": [], "source": "ai", "turns_remaining": 39}

    monkeypatch.setattr(wizard_logo.logo_api, "converse", fake_converse)
    assert logo_api  # imported for parity with the view module
    resp = _client().post(
        "/api/v1/onboarding/wizard/logo-converse/",
        {"token": _token(), "stage": "icon", "message": "a lotus", "brief": {"style_chips": ["minimal"]}},
        format="json",
    )
    assert resp.status_code == 200
    assert resp.json()["source"] == "ai"
    assert seen["brand_name"] == "Ai Logo Studio"
    assert seen["primary_hex"] == "#15803d"  # forest
    assert seen["niche"] == "yoga"
    assert seen["vibe"] == "Calm vinyasa."
    assert seen["style_chips"] == "minimal"


def test_finish_and_refine_delegate(paid, monkeypatch):
    from apps.core.onboarding import wizard_logo

    monkeypatch.setattr(
        wizard_logo.logo_api,
        "converse_finish",
        lambda tenant, data: {"phase": "final", "message": "", "designs": [], "source": "draft", "turns_remaining": 1},
    )
    monkeypatch.setattr(
        wizard_logo.logo_api,
        "refine",
        lambda tenant, data: {"design": None, "source": "error", "refine_remaining": 5},
    )
    assert (
        _client()
        .post("/api/v1/onboarding/wizard/logo-converse/finish/", {"token": _token(), "token_draft": "x"}, format="json")
        .json()["source"]
        == "draft"
    )
    assert (
        _client()
        .post("/api/v1/onboarding/wizard/logo-refine/", {"token": _token(), "instruction": "bolder"}, format="json")
        .json()["refine_remaining"]
        == 5
    )


def test_bad_token_rejected(tenant):
    resp = _client().post("/api/v1/onboarding/wizard/logo-status/", {"token": "junk"}, format="json")
    assert resp.status_code == 400


PNG_1PX = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01"
    b"\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
)


def _upload(kind="logo", content=PNG_1PX, token=None):
    from django.core.files.uploadedfile import SimpleUploadedFile

    return _client().post(
        "/api/v1/onboarding/wizard/logo-upload/",
        {"token": token or _token(), "kind": kind, "file": SimpleUploadedFile("x.png", content, "image/png")},
        format="multipart",
    )


def test_upload_requires_paid(tenant):
    assert _upload().status_code == 403


def test_upload_stores_under_wizard_prefix(paid, monkeypatch):
    from apps.core.onboarding import wizard_logo

    puts = {}
    monkeypatch.setattr(wizard_logo, "_put_wizard_png", lambda key, blob: puts.setdefault(key, blob))
    resp = _upload()
    assert resp.status_code == 200, resp.content
    assert resp.json()["key"] == "wizard/ai_logo_studio/logo.png"
    assert list(puts) == ["wizard/ai_logo_studio/logo.png"]

    resp2 = _upload(kind="icon")
    assert resp2.json()["key"] == "wizard/ai_logo_studio/icon.png"


def test_upload_rejects_bad_kind_magic_and_size(paid, monkeypatch):
    from apps.core.onboarding import wizard_logo

    monkeypatch.setattr(wizard_logo, "_put_wizard_png", lambda key, blob: None)
    assert _upload(kind="banner").status_code == 400
    assert _upload(content=b"GIF89a not a png").status_code == 400
    assert _upload(content=PNG_1PX + b"\x00" * (1_048_577)).status_code == 400
