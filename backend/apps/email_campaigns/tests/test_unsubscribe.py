"""Campaign emails carry an unsubscribe link and honour the opt-outs announcements already use."""

from unittest import mock

import pytest

from apps.accounts.models import User
from apps.email_campaigns import tasks
from apps.email_campaigns.models import CampaignStatus, EmailCampaign
from apps.email_campaigns.recipients import get_recipient_count, resolve_recipients
from apps.email_campaigns.starters import compose
from apps.notifications.models import EmailOptOut
from apps.tenant_config.models import TenantConfig

pytestmark = pytest.mark.django_db(transaction=True)

UNSUBSCRIBE = "http://shared-test.localhost/api/v1/notifications/email/unsubscribe/?t="


def _user(email, role="student", name=None):
    return User.objects.create_user(
        email=email,
        name=name if name is not None else email.split("@")[0],
        password="secret123",  # noqa: S106  # pragma: allowlist secret
        role=role,
    )


def _campaign(design):
    cfg = TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="Glow")
    cfg.brand_name = "Glow"
    cfg.save()
    _user("ada@glow.test", name="Ada Lovelace")
    return EmailCampaign.objects.create(
        subject="Spring",
        design=design,
        sender=_user("coach@glow.test", role="owner", name="Mara"),
        recipient_filter={"type": "all"},
        recipient_count=1,
        status=CampaignStatus.SENDING,
    )


def test_students_who_opted_out_are_no_recipients(tenant_ctx):
    _user("ada@glow.test")
    _user("Bea@Glow.test")
    EmailOptOut.objects.create(email="bea@glow.test")
    assert list(resolve_recipients({"type": "all"}).values_list("email", flat=True)) == ["ada@glow.test"]
    assert get_recipient_count({"type": "all"}) == 1


def _send(tenant):
    with mock.patch.object(tasks, "send_email", return_value=True) as send:
        tasks.send_campaign_emails(EmailCampaign.objects.get().id, tenant.schema_name)
    return send.call_args.kwargs


def test_every_email_is_personal_and_carries_its_own_unsubscribe_link(tenant_ctx):
    campaign = _campaign(compose(None, heading="Spring", body_html="<p>Hi {{FirstName}}</p>"))
    sent = _send(tenant_ctx)
    link = sent["headers"]["List-Unsubscribe"][1:-1]
    assert link.startswith(UNSUBSCRIBE)
    assert sent["headers"]["List-Unsubscribe-Post"] == "List-Unsubscribe=One-Click"
    assert sent["html"].count(f'href="{link.replace("&", "&amp;")}"') == 1  # her brand footer's link, once
    assert "Hi Ada" in sent["html"] and "{{" not in sent["html"]
    assert sent["from_name"] == "Mara via Glow" and sent["subject"] == "Spring"
    assert "Spring" in sent["text"]
    campaign.refresh_from_db()
    assert campaign.status == CampaignStatus.SENT and "Hi Ada" in campaign.rendered_html
    assert link not in campaign.rendered_html  # the stored preview's link is inert


def test_a_design_without_her_footer_still_gets_an_unsubscribe_line(tenant_ctx):
    design = compose(None, heading="Spring", body_html="<p>Hello</p>")
    design["footer"]["blocks"] = []
    _campaign(design)
    sent = _send(tenant_ctx)
    link = sent["headers"]["List-Unsubscribe"][1:-1]
    assert sent["html"].count("Unsubscribe") == 1 and link.replace("&", "&amp;") in sent["html"]
