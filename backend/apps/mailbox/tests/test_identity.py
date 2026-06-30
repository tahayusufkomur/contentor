import pytest
from django.test import override_settings

from apps.domains.models import CustomDomain
from apps.mailbox.identity import sending_identity

pytestmark = pytest.mark.django_db(transaction=True)


@override_settings(RESEND_FROM_EMAIL="no_reply@contentor.app")
def test_identity_without_custom_domain_is_no_reply(tenant_ctx):
    from_email, can_receive = sending_identity(tenant_ctx)
    assert from_email == "no_reply@contentor.app"
    assert can_receive is False


def test_identity_with_live_enabled_domain(tenant_ctx):
    CustomDomain.objects.create(
        tenant=tenant_ctx, domain="coach.com",
        cost_minor=1, price_minor=1, currency="usd",
        provisioning_status="live", mailbox_enabled=True, mailbox_local_part="support",
    )
    from_email, can_receive = sending_identity(tenant_ctx)
    assert from_email == "support@coach.com"
    assert can_receive is True


@override_settings(RESEND_FROM_EMAIL="no_reply@contentor.app")
def test_identity_domain_not_yet_live_is_no_reply(tenant_ctx):
    CustomDomain.objects.create(
        tenant=tenant_ctx, domain="coach.com",
        cost_minor=1, price_minor=1, currency="usd",
        provisioning_status="pending", mailbox_enabled=True,
    )
    from_email, can_receive = sending_identity(tenant_ctx)
    assert from_email == "no_reply@contentor.app"
    assert can_receive is False
