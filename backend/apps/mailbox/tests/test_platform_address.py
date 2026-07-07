"""Platform mailbox tier — paid coaches claim `<x>@PLATFORM_MAIL_DOMAIN`.

Covers sending_identity's paid tier, resolve_platform_recipient, the inbound
webhook's second resolution path, and the settings claim API (reserved /
taken / upgrade-gated).
"""

import json

import pytest
from django.test import override_settings
from django_tenants.utils import schema_context
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import PlatformPlan, PlatformSubscription
from apps.domains.models import CustomDomain, PlatformMailboxAddress
from apps.mailbox import signing
from apps.mailbox.identity import (
    platform_address,
    resolve_platform_recipient,
    sending_identity,
)
from apps.mailbox.models import Conversation, Message

pytestmark = pytest.mark.django_db(transaction=True)

SECRET = "topsecret"
HOST = "shared-test.localhost"
DOMAIN = "contentor.app"


SHARED_SCHEMA = "shared_test"


@pytest.fixture(autouse=True)
def _clean_shared():
    # CustomDomain / PlatformMailboxAddress / platform subscription rows are
    # public-schema and NOT cleaned by tenant_ctx teardown — scrub around each.
    def _scrub():
        # Run inside the tenant schema: deletes of these public-schema rows
        # cascade into tenant-only tables (PlatformSubscription→billing_payment,
        # User→courses_course, …), which are only visible with the tenant on the
        # search_path. Order respects PROTECT (subscription before user/plan).
        from apps.core.models import Tenant

        with schema_context(SHARED_SCHEMA):
            PlatformSubscription.objects.all().delete()
            PlatformMailboxAddress.objects.all().delete()
            CustomDomain.objects.all().delete()
            Tenant.objects.filter(slug="other-pa").delete()
            User.objects.filter(email="owner-pa@x.com").delete()
            # Deleting the subscription above mirrors Tenant.plan onto the Free
            # plan (subscription_mirror_plan_on_delete). Null the FK first —
            # PlatformPlan.plan is PROTECT, so a lingering Tenant.plan would
            # block the delete for the `free=True` tests (which seed a "Free" plan).
            Tenant.objects.all().update(plan=None)
            PlatformPlan.objects.all().delete()

    _scrub()
    yield
    _scrub()


def _make_paid(tenant, *, free=False):
    # PlatformPlan/Subscription/User are public-schema; create them under the
    # public schema explicitly so the subscription's user FK resolves (tests
    # otherwise run inside tenant_ctx, which would write the user to the tenant
    # schema and break the cross-schema FK).
    with schema_context("public"):
        plan = PlatformPlan.objects.create(
            name="Free" if free else "Starter",
            price_monthly=0 if free else 19,
            transaction_fee_pct=5,
        )
        owner = User.objects.filter(email="owner-pa@x.com").first() or User.objects.create_user(
            email="owner-pa@x.com",
            name="Owner",
            password="secret123",
            role="owner",  # noqa: S106
        )
        PlatformSubscription.objects.create(tenant=tenant, user=owner, plan=plan, status="active", provider="bypass")
    tenant.refresh_from_db()
    return tenant


def _client(tenant_ctx):
    coach = User.objects.create_user(
        email="coach@x.com",
        name="Coach",
        password="secret123",
        role="owner",
        is_staff=True,  # noqa: S106
    )
    c = APIClient(HTTP_HOST=HOST)
    c.force_authenticate(user=coach)
    return c


def _post_inbound(body: dict, *, sign=True):
    raw = json.dumps(body).encode()
    headers = {"HTTP_HOST": HOST}
    if sign:
        headers["HTTP_X_MAILBOX_SIGNATURE"] = signing.sign_payload(raw, SECRET)
    return APIClient().post("/api/v1/mailbox/inbound/", data=raw, content_type="application/json", **headers)


# ── sending_identity / platform_address ──────────────────────────────────────


@override_settings(PLATFORM_MAIL_DOMAIN=DOMAIN, RESEND_FROM_EMAIL="noreply@contentor.app")
def test_paid_with_claimed_address_can_receive(tenant_ctx):
    _make_paid(tenant_ctx)
    PlatformMailboxAddress.objects.create(tenant=tenant_ctx, local_part="jane")
    from_email, can_receive = sending_identity(tenant_ctx)
    assert from_email == "jane@contentor.app"
    assert can_receive is True


@override_settings(PLATFORM_MAIL_DOMAIN=DOMAIN, RESEND_FROM_EMAIL="noreply@contentor.app")
def test_paid_without_claim_is_send_only(tenant_ctx):
    _make_paid(tenant_ctx)
    from_email, can_receive = sending_identity(tenant_ctx)
    assert from_email == "noreply@contentor.app"
    assert can_receive is False


@override_settings(PLATFORM_MAIL_DOMAIN=DOMAIN, RESEND_FROM_EMAIL="noreply@contentor.app")
def test_free_plan_with_claimed_row_does_not_resolve(tenant_ctx):
    # A lapsed/free coach keeps a reserved row but the address stops resolving.
    _make_paid(tenant_ctx, free=True)
    PlatformMailboxAddress.objects.create(tenant=tenant_ctx, local_part="jane")
    assert platform_address(tenant_ctx) is None
    _, can_receive = sending_identity(tenant_ctx)
    assert can_receive is False


@override_settings(PLATFORM_MAIL_DOMAIN="", RESEND_FROM_EMAIL="noreply@contentor.app")
def test_feature_off_ignores_claimed_row(tenant_ctx):
    _make_paid(tenant_ctx)
    PlatformMailboxAddress.objects.create(tenant=tenant_ctx, local_part="jane")
    assert platform_address(tenant_ctx) is None


@override_settings(PLATFORM_MAIL_DOMAIN=DOMAIN)
def test_custom_domain_takes_precedence_over_platform(tenant_ctx):
    _make_paid(tenant_ctx)
    PlatformMailboxAddress.objects.create(tenant=tenant_ctx, local_part="jane")
    CustomDomain.objects.create(
        tenant=tenant_ctx,
        domain="coach.com",
        cost_minor=1,
        price_minor=1,
        currency="usd",
        provisioning_status="live",
        mailbox_enabled=True,
        mailbox_local_part="hi",
    )
    from_email, _ = sending_identity(tenant_ctx)
    assert from_email == "hi@coach.com"


# ── resolve_platform_recipient ───────────────────────────────────────────────


@override_settings(PLATFORM_MAIL_DOMAIN=DOMAIN)
def test_resolve_recipient_paid(tenant_ctx):
    _make_paid(tenant_ctx)
    PlatformMailboxAddress.objects.create(tenant=tenant_ctx, local_part="jane")
    assert resolve_platform_recipient("jane@contentor.app") == tenant_ctx
    # plus-addressing folds onto the base local part
    assert resolve_platform_recipient("jane+news@contentor.app") == tenant_ctx


@override_settings(PLATFORM_MAIL_DOMAIN=DOMAIN)
def test_resolve_recipient_unknown_or_wrong_domain(tenant_ctx):
    _make_paid(tenant_ctx)
    PlatformMailboxAddress.objects.create(tenant=tenant_ctx, local_part="jane")
    assert resolve_platform_recipient("nobody@contentor.app") is None
    assert resolve_platform_recipient("jane@elsewhere.com") is None


@override_settings(PLATFORM_MAIL_DOMAIN=DOMAIN)
def test_resolve_recipient_free_plan_none(tenant_ctx):
    _make_paid(tenant_ctx, free=True)
    PlatformMailboxAddress.objects.create(tenant=tenant_ctx, local_part="jane")
    assert resolve_platform_recipient("jane@contentor.app") is None


# ── inbound webhook second tier ──────────────────────────────────────────────


@override_settings(MAILBOX_INBOUND_SECRET=SECRET, PLATFORM_MAIL_DOMAIN=DOMAIN)
def test_inbound_stores_for_platform_address(tenant_ctx):
    _make_paid(tenant_ctx)
    PlatformMailboxAddress.objects.create(tenant=tenant_ctx, local_part="jane")
    resp = _post_inbound(
        {"from": "s@x.com", "to": "jane@contentor.app", "subject": "Hi", "text": "hello", "message_id": "<m@x.com>"}
    )
    assert resp.status_code == 200
    conv = Conversation.objects.get(counterparty_email="s@x.com")
    assert conv.messages.filter(direction="inbound").count() == 1


@override_settings(MAILBOX_INBOUND_SECRET=SECRET, PLATFORM_MAIL_DOMAIN=DOMAIN)
def test_inbound_unclaimed_platform_address_drops(tenant_ctx):
    _make_paid(tenant_ctx)
    resp = _post_inbound(
        {"from": "s@x.com", "to": "ghost@contentor.app", "subject": "Hi", "text": "hello", "message_id": "<m2@x.com>"}
    )
    assert resp.status_code == 200
    assert Message.objects.count() == 0


# ── settings claim API ───────────────────────────────────────────────────────


@override_settings(PLATFORM_MAIL_DOMAIN=DOMAIN)
def test_settings_exposes_platform_fields(tenant_ctx):
    _make_paid(tenant_ctx)
    resp = _client(tenant_ctx).get("/api/v1/mailbox/settings/")
    data = resp.json()
    assert data["platform_domain"] == DOMAIN
    assert data["platform_eligible"] is True
    assert data["platform_local_part"] == ""


@override_settings(PLATFORM_MAIL_DOMAIN=DOMAIN)
def test_claim_platform_address(tenant_ctx):
    _make_paid(tenant_ctx)
    resp = _client(tenant_ctx).put("/api/v1/mailbox/settings/", {"platform_local_part": "Jane"}, format="json")
    assert resp.status_code == 200
    assert resp.json()["platform_local_part"] == "jane"
    assert PlatformMailboxAddress.objects.filter(local_part="jane", tenant=tenant_ctx).exists()


@override_settings(PLATFORM_MAIL_DOMAIN=DOMAIN)
def test_claim_reserved_rejected(tenant_ctx):
    _make_paid(tenant_ctx)
    resp = _client(tenant_ctx).put("/api/v1/mailbox/settings/", {"platform_local_part": "support"}, format="json")
    assert resp.status_code == 400
    assert resp.json()["detail"] == "reserved_local_part"


@override_settings(PLATFORM_MAIL_DOMAIN=DOMAIN)
def test_claim_taken_rejected(tenant_ctx):
    _make_paid(tenant_ctx)
    # Another tenant already owns "jane". Tenant.auto_create_schema is False on
    # the model, so this inserts a bare row without provisioning a schema.
    from apps.core.models import Tenant

    with schema_context("public"):
        other = Tenant.objects.create(
            schema_name="other_pa",
            name="Other",
            slug="other-pa",
            owner_email="o@x.com",
            subdomain="other-pa",
        )
        PlatformMailboxAddress.objects.create(tenant=other, local_part="jane")
    resp = _client(tenant_ctx).put("/api/v1/mailbox/settings/", {"platform_local_part": "jane"}, format="json")
    assert resp.status_code == 400
    assert resp.json()["detail"] == "taken"


@override_settings(PLATFORM_MAIL_DOMAIN=DOMAIN)
def test_claim_requires_paid_plan(tenant_ctx):
    # No subscription at all → free tier → upgrade required.
    resp = _client(tenant_ctx).put("/api/v1/mailbox/settings/", {"platform_local_part": "jane"}, format="json")
    assert resp.status_code == 400
    assert resp.json()["detail"] == "upgrade_required"
