"""Wizard drop-off recovery: candidates, email send, beat task, recover endpoint."""

from datetime import timedelta

import pytest
from django.db import connection
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.tokens import create_wizard_token, verify_wizard_token
from apps.core.models import DevOutboundEmail, Tenant
from apps.core.onboarding import recovery

pytestmark = pytest.mark.django_db(transaction=True)

SHARED_DOMAIN = "shared-test.localhost"


@pytest.fixture(autouse=True)
def _clean_throttle_cache():
    """The recover endpoint is throttled 5/hour per IP and the throttle
    bucket lives in the shared cache — without this, the module's earlier
    endpoint tests exhaust the default 127.0.0.1 bucket and later ones 429."""
    from django.core.cache import cache

    cache.clear()
    yield


def _client(**extra):
    return APIClient(HTTP_HOST=SHARED_DOMAIN, **extra)


def _token(email="coach@x.com", brand="Rec Studio", region="global"):
    return create_wizard_token(email, "Coach", brand, region=region)


def _make_tenant(schema, name, slug, **overrides):
    """Row-only tenant (no schema): recovery never enters the tenant schema.
    Mirrors apps/core/tests/test_onboarding_handoff.py."""
    connection.set_schema_to_public()
    original = Tenant.auto_create_schema
    Tenant.auto_create_schema = False
    try:
        defaults = {"name": name, "slug": slug, "subdomain": slug, "owner_email": "coach@x.com"}
        # region is immutable after creation, so it must be in defaults
        if "region" in overrides:
            defaults["region"] = overrides.pop("region")
        t, _ = Tenant.objects.get_or_create(
            schema_name=schema,
            defaults=defaults,
        )
        t.provisioning_status = overrides.pop("provisioning_status", "pending")
        t.template_seed_status = overrides.pop("template_seed_status", "pending")
        t.wizard_state = overrides.pop("wizard_state", {})
        t.recovery_email_sent_at = overrides.pop("recovery_email_sent_at", None)
        for field, value in overrides.items():
            setattr(t, field, value)
        t.save()
    finally:
        Tenant.auto_create_schema = original
    return t


@pytest.fixture()
def tenant(restore_public):
    t = _make_tenant("rec_studio", "Rec Studio", "rec-studio")
    yield t
    connection.set_schema_to_public()
    DevOutboundEmail.objects.filter(to="coach@x.com").delete()
    Tenant.objects.filter(schema_name="rec_studio").delete()


def test_recovery_email_sent_at_defaults_to_null(tenant):
    tenant.refresh_from_db()
    assert tenant.recovery_email_sent_at is None


def _age(tenant, *, hours=0, days=0):
    """Backdate created_at (auto_now_add ignores assignment on create)."""
    Tenant.objects.filter(pk=tenant.pk).update(created_at=timezone.now() - timedelta(hours=hours, days=days))
    tenant.refresh_from_db()


def test_candidates_pick_only_idle_pending_tenants(tenant):
    _age(tenant, hours=30)
    assert tenant in recovery.recovery_candidates()

    fresh = _make_tenant("rec_fresh", "Rec Fresh", "rec-fresh")
    assert fresh not in recovery.recovery_candidates()  # < 24h old
    Tenant.objects.filter(schema_name="rec_fresh").delete()


def test_recent_step_activity_excludes_despite_old_signup(tenant):
    _age(tenant, days=3)
    tenant.wizard_state = {"step_timestamps": {"theme": timezone.now().isoformat()}}
    tenant.save(update_fields=["wizard_state"])
    assert tenant not in recovery.recovery_candidates()


@pytest.mark.parametrize(
    "overrides",
    [
        {"recovery_email_sent_at": "SENTINEL_NOW"},  # already nudged
        {"template_seed_status": "seeding"},  # finalized
        {"template_seed_status": "ready"},
        {"template_seed_status": "skipped"},
        {"provisioning_status": "ready"},
        {"is_demo": True},
    ],
)
def test_candidates_exclusions(tenant, overrides):
    _age(tenant, hours=30)
    for field, value in overrides.items():
        setattr(tenant, field, timezone.now() if value == "SENTINEL_NOW" else value)
    tenant.save()
    assert tenant not in recovery.recovery_candidates()


def test_too_old_signups_never_nudged(tenant):
    _age(tenant, days=8)
    assert tenant not in recovery.recovery_candidates()


def test_send_recovery_email_links_a_fresh_wizard_token(tenant, settings):
    settings.EMAIL_SINK_ENABLED = True
    settings.SITE_SCHEME = "https"
    assert recovery.send_recovery_email(tenant) is True

    mail = DevOutboundEmail.objects.filter(to="coach@x.com").latest("id")
    assert f"https://{settings.CONTENTOR_DOMAIN}/signup/verify?token=" in mail.html
    token = mail.html.split("/signup/verify?token=")[1].split('"')[0]
    assert verify_wizard_token(token)["purpose"] == "wizard"
    assert verify_wizard_token(token)["email"] == "coach@x.com"

    tenant.refresh_from_db()
    assert tenant.recovery_email_sent_at is not None


def test_send_recovery_email_tr_region_uses_tr_host_and_copy(restore_public, settings):
    settings.EMAIL_SINK_ENABLED = True
    settings.SITE_SCHEME = "https"
    t = _make_tenant("tr_rec_studio", "Rec Studio TR", "rec-studio-tr", region="tr")
    try:
        assert recovery.send_recovery_email(t) is True
        mail = DevOutboundEmail.objects.filter(to="coach@x.com").latest("id")
        assert f"https://tr.{settings.CONTENTOR_DOMAIN}/signup/verify?token=" in mail.html
        assert "Kald" in mail.subject  # "Kaldığınız yerden devam edin"
    finally:
        connection.set_schema_to_public()
        DevOutboundEmail.objects.filter(to="coach@x.com").delete()
        Tenant.objects.filter(schema_name="tr_rec_studio").delete()


def test_send_recovery_email_refuses_renamed_tenant(tenant, settings):
    settings.EMAIL_SINK_ENABLED = True
    # Superadmin can rename a tenant; the token's brand_name must still
    # slugify back to the tenant slug or the resume link dead-ends.
    tenant.name = "Totally Different Name"
    tenant.save(update_fields=["name"])
    assert recovery.send_recovery_email(tenant) is False
    tenant.refresh_from_db()
    assert tenant.recovery_email_sent_at is None


def test_beat_task_sends_once_and_only_once(tenant, settings):
    settings.EMAIL_SINK_ENABLED = True
    _age(tenant, hours=30)

    from apps.core.tasks import send_wizard_recovery_emails

    assert send_wizard_recovery_emails() == 1
    assert send_wizard_recovery_emails() == 0  # stamped -> not a candidate anymore
    assert DevOutboundEmail.objects.filter(to="coach@x.com").count() == 1


RECOVER_URL = "/api/v1/onboarding/wizard/recover/"


def _recover(token, **client_kwargs):
    return _client(**client_kwargs).post(RECOVER_URL, {"token": token}, format="json")


def test_recover_sends_with_valid_token(tenant, settings):
    settings.EMAIL_SINK_ENABLED = True
    resp = _recover(_token())
    assert resp.status_code == 200, resp.content
    assert resp.json()["detail"] == "sent"
    assert DevOutboundEmail.objects.filter(to="coach@x.com").count() == 1
    tenant.refresh_from_db()
    assert tenant.recovery_email_sent_at is not None


def test_recover_accepts_expired_token(tenant, settings):
    settings.EMAIL_SINK_ENABLED = True
    settings.WIZARD_TOKEN_EXPIRY_DAYS = -1
    expired = _token()
    settings.WIZARD_TOKEN_EXPIRY_DAYS = 7  # fresh token in the email must be valid
    resp = _recover(expired)
    assert resp.status_code == 200, resp.content
    mail = DevOutboundEmail.objects.filter(to="coach@x.com").latest("id")
    new_token = mail.html.split("/signup/verify?token=")[1].split('"')[0]
    assert verify_wizard_token(new_token)["purpose"] == "wizard"


def test_recover_cooldown_suppresses_second_send(tenant, settings):
    settings.EMAIL_SINK_ENABLED = True
    assert _recover(_token()).status_code == 200
    assert _recover(_token()).status_code == 200  # still "sent" — idempotent UX
    assert DevOutboundEmail.objects.filter(to="coach@x.com").count() == 1


def test_recover_rejects_garbage_and_wrong_owner(tenant):
    assert _recover("garbage").status_code == 400
    assert _recover(_token(email="mallory@x.com")).status_code == 403


def test_recover_404_when_tenant_gone(restore_public):
    connection.set_schema_to_public()
    assert _recover(_token(brand="Never Existed")).status_code == 404


def test_recover_409_once_wizard_closed(tenant):
    tenant.template_seed_status = "seeding"
    tenant.save(update_fields=["template_seed_status"])
    resp = _recover(_token())
    assert resp.status_code == 409
    assert resp.json()["detail"] == "wizard_closed"


def test_recover_is_throttled_per_ip(tenant, settings):
    # Sink off: we only care about the 429, not the email rows.
    settings.EMAIL_SINK_ENABLED = False
    settings.RESEND_API_KEY = ""
    statuses = [_recover("garbage", REMOTE_ADDR="9.9.9.1").status_code for _ in range(6)]
    assert 429 in statuses, statuses
