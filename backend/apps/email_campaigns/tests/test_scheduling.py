"""Scheduled email campaigns.

The beat sweep (`dispatch_due_email_campaigns`) mirrors
`apps.blog.tasks.dispatch_due_blog_autopilot`: per-tenant, a due SCHEDULED
campaign is atomically claimed (SCHEDULED→SENDING) exactly once and handed to
the existing `send_campaign_emails` worker. Future-dated campaigns are left
alone. The serializer + view gate scheduling at request time.
"""

from datetime import timedelta
from unittest import mock

import pytest
from django.utils import timezone
from django_tenants.utils import get_tenant_model, schema_context
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.email_campaigns import tasks
from apps.email_campaigns.models import CampaignStatus, EmailCampaign
from apps.tenant_config.models import TenantConfig

SHARED_DOMAIN = "shared-test.localhost"

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture()
def owner(tenant_ctx):
    return User.objects.create_user(
        email="owner@emailsched.com",
        name="Sched Owner",
        password="secret123",  # noqa: S106  # pragma: allowlist secret
        role="owner",
    )


@pytest.fixture()
def student(tenant_ctx):
    return User.objects.create_user(
        email="student@emailsched.com",
        name="Sched Student",
        password="secret123",  # noqa: S106  # pragma: allowlist secret
        role="student",
    )


@pytest.fixture()
def email_config(tenant_ctx):
    """A TenantConfig carrying an EmailCraft key so _get_api_key skips provisioning."""
    cfg = TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="Sched Brand")
    cfg.emailcraft_api_key = "mc_test_key"  # noqa: S105  # pragma: allowlist secret
    cfg.save()
    return cfg


def make_client(user=None):
    client = APIClient(HTTP_HOST=SHARED_DOMAIN)
    if user is not None:
        client.force_authenticate(user=user)
    return client


def _make_campaign(owner, **kw):
    defaults = {
        "subject": "Scheduled Blast",
        "template_id": "tpl_1",
        "sender": owner,
        "recipient_filter": {"type": "all"},
        "recipient_count": 3,
        "status": CampaignStatus.SCHEDULED,
        "scheduled_at": timezone.now() - timedelta(minutes=1),
    }
    defaults.update(kw)
    return EmailCampaign.objects.create(**defaults)


class TestDispatchDueCampaigns:
    def test_due_scheduled_campaign_is_claimed_and_dispatched_once(self, tenant_ctx, owner):
        campaign = _make_campaign(owner, scheduled_at=timezone.now() - timedelta(minutes=1))

        with mock.patch.object(tasks.send_campaign_emails, "delay") as spawn:
            tasks._dispatch_email_for_current_tenant(tenant_ctx.schema_name)
            # Second sweep: the campaign is no longer SCHEDULED, so no re-dispatch.
            tasks._dispatch_email_for_current_tenant(tenant_ctx.schema_name)

        campaign.refresh_from_db()
        assert campaign.status == CampaignStatus.SENDING
        assert spawn.call_count == 1
        spawn.assert_called_once_with(campaign.id, tenant_ctx.schema_name)

    def test_future_scheduled_campaign_is_left_alone(self, tenant_ctx, owner):
        campaign = _make_campaign(owner, scheduled_at=timezone.now() + timedelta(hours=1))

        with mock.patch.object(tasks.send_campaign_emails, "delay") as spawn:
            tasks._dispatch_email_for_current_tenant(tenant_ctx.schema_name)

        campaign.refresh_from_db()
        assert campaign.status == CampaignStatus.SCHEDULED
        assert spawn.call_count == 0

    def test_sweep_only_visits_ready_tenants(self, tenant_ctx):
        """The beat entrypoint must skip non-ready tenants (no provisioned schema)."""

        def _swept_schemas():
            with mock.patch.object(tasks, "_dispatch_email_for_current_tenant") as dispatch:
                tasks.dispatch_due_email_campaigns()
            return {call.args[0] for call in dispatch.call_args_list}

        with schema_context("public"):
            get_tenant_model().objects.filter(pk=tenant_ctx.pk).update(provisioning_status="pending")
        assert tenant_ctx.schema_name not in _swept_schemas()

        with schema_context("public"):
            get_tenant_model().objects.filter(pk=tenant_ctx.pk).update(provisioning_status="ready")
        assert tenant_ctx.schema_name in _swept_schemas()


class TestSendCampaignScheduling:
    def _payload(self, **kw):
        payload = {
            "template_id": "tpl_1",
            "subject": "Newsletter",
            "recipient_filter": {"type": "all"},
        }
        payload.update(kw)
        return payload

    def test_future_scheduled_at_creates_scheduled_campaign_without_dispatch(
        self, tenant_ctx, owner, student, email_config
    ):
        when = timezone.now() + timedelta(days=2)
        client = make_client(owner)

        with mock.patch.object(tasks.send_campaign_emails, "delay") as spawn:
            resp = client.post(
                "/api/v1/email/send/",
                self._payload(scheduled_at=when.isoformat()),
                format="json",
            )

        assert resp.status_code == 201, resp.content
        assert resp.json()["status"] == CampaignStatus.SCHEDULED
        campaign = EmailCampaign.objects.get(pk=resp.json()["id"])
        assert campaign.status == CampaignStatus.SCHEDULED
        assert campaign.scheduled_at is not None
        # A scheduled campaign must NOT be dispatched at request time.
        assert spawn.call_count == 0

    def test_send_now_still_dispatches_immediately(self, tenant_ctx, owner, student, email_config):
        client = make_client(owner)

        with mock.patch.object(tasks.send_campaign_emails, "delay") as spawn:
            resp = client.post("/api/v1/email/send/", self._payload(), format="json")

        assert resp.status_code == 201, resp.content
        assert resp.json()["status"] == CampaignStatus.SENDING
        assert spawn.call_count == 1

    def test_past_scheduled_at_is_rejected(self, tenant_ctx, owner, student, email_config):
        when = timezone.now() - timedelta(minutes=5)
        client = make_client(owner)

        with mock.patch.object(tasks.send_campaign_emails, "delay") as spawn:
            resp = client.post(
                "/api/v1/email/send/",
                self._payload(scheduled_at=when.isoformat()),
                format="json",
            )

        assert resp.status_code == 400, resp.content
        assert spawn.call_count == 0
        assert EmailCampaign.objects.count() == 0


class TestCancelScheduledCampaign:
    def test_cancel_scheduled_campaign_deletes_it(self, tenant_ctx, owner):
        campaign = _make_campaign(owner, scheduled_at=timezone.now() + timedelta(days=1))
        resp = make_client(owner).delete(f"/api/v1/email/campaigns/{campaign.pk}/")
        assert resp.status_code == 204, resp.content
        assert not EmailCampaign.objects.filter(pk=campaign.pk).exists()

    def test_cannot_cancel_a_sent_campaign(self, tenant_ctx, owner):
        campaign = _make_campaign(owner, status=CampaignStatus.SENT, scheduled_at=None)
        resp = make_client(owner).delete(f"/api/v1/email/campaigns/{campaign.pk}/")
        assert resp.status_code == 400, resp.content
        assert EmailCampaign.objects.filter(pk=campaign.pk).exists()

    def test_cancel_requires_coach(self, tenant_ctx, owner, student):
        campaign = _make_campaign(owner, scheduled_at=timezone.now() + timedelta(days=1))
        resp = make_client(student).delete(f"/api/v1/email/campaigns/{campaign.pk}/")
        assert resp.status_code == 403, resp.content
        assert EmailCampaign.objects.filter(pk=campaign.pk).exists()
