"""Campaign emails carry an unsubscribe link and honour the opt-outs announcements already use."""

from unittest import mock

import pytest

from apps.accounts.models import User
from apps.email_campaigns import tasks
from apps.email_campaigns.models import CampaignStatus, EmailCampaign
from apps.email_campaigns.recipients import get_recipient_count, resolve_recipients
from apps.notifications.models import EmailOptOut
from apps.tenant_config.models import TenantConfig

pytestmark = pytest.mark.django_db(transaction=True)

UNSUBSCRIBE = "https://shared-test.localhost/api/v1/notifications/email/unsubscribe/?t="


def _user(email, role="student"):
    return User.objects.create_user(
        email=email,
        name=email.split("@")[0],
        password="secret123",  # noqa: S106  # pragma: allowlist secret
        role=role,
    )


@pytest.fixture()
def campaign(tenant_ctx):
    cfg = TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="Glow")
    cfg.brand_name = "Glow"
    cfg.emailcraft_api_key = "mc_test_key"  # noqa: S105  # pragma: allowlist secret
    cfg.save()
    _user("ada@glow.test")
    return EmailCampaign.objects.create(
        subject="Spring",
        template_id="tpl_1",
        sender=_user("coach@glow.test", role="owner"),
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


def _send(tenant, html_for):
    with (
        mock.patch(
            "apps.email_campaigns.emailcraft_client.render_template",
            side_effect=lambda key, template_id, variables: {"html": html_for(variables)},
        ) as render,
        mock.patch.object(tasks, "send_email", return_value=True) as send,
    ):
        tasks.send_campaign_emails(EmailCampaign.objects.get().id, tenant.schema_name)
    return render.call_args.args[2], send.call_args.kwargs


def test_every_email_carries_its_own_unsubscribe_link_and_one_click_headers(tenant_ctx, campaign):
    variables, sent = _send(tenant_ctx, lambda v: "<html><body><p>Hello</p></body></html>")
    link = variables["UnsubscribeUrl"]
    assert link.startswith(UNSUBSCRIBE)
    assert sent["headers"] == {"List-Unsubscribe": f"<{link}>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"}
    assert f'href="{link}"' in sent["html"]
    assert sent["html"].index(link) < sent["html"].index("</body>")


def test_a_template_that_already_links_to_it_gets_no_second_one(tenant_ctx, campaign):
    _, sent = _send(tenant_ctx, lambda v: f'<html><body><a href="{v["UnsubscribeUrl"]}">Leave</a></body></html>')
    assert sent["html"].count(UNSUBSCRIBE) == 1
