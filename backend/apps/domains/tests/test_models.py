import pytest
from django.db import IntegrityError

from apps.domains.models import CustomDomain, DomainSubscription

pytestmark = pytest.mark.django_db


def test_create_custom_domain(restore_public):
    cd = CustomDomain.objects.create(
        tenant=restore_public,
        domain="freecoach.com",
        cost_minor=999,
        price_minor=1200,
        currency="EUR",
    )
    assert cd.provisioning_status == "pending"
    assert cd.auto_renew is True
    assert cd.is_primary is True
    assert str(cd) == "freecoach.com"


def test_domain_is_unique(restore_public):
    CustomDomain.objects.create(tenant=restore_public, domain="dupe.com", cost_minor=1, price_minor=1, currency="EUR")
    with pytest.raises(IntegrityError):
        CustomDomain.objects.create(
            tenant=restore_public, domain="dupe.com", cost_minor=1, price_minor=1, currency="EUR"
        )


def test_subscription_one_to_one(restore_public):
    cd = CustomDomain.objects.create(
        tenant=restore_public, domain="sub.com", cost_minor=1, price_minor=1, currency="EUR"
    )
    sub = DomainSubscription.objects.create(tenant=restore_public, custom_domain=cd)
    assert cd.subscription == sub
    assert sub.status == "incomplete"


def test_customdomain_mailbox_field_defaults(db):
    from apps.core.models import Tenant
    from apps.domains.models import CustomDomain

    tenant = Tenant.objects.create(
        schema_name="mbx_defaults",
        name="MBX",
        slug="mbx-defaults",
        owner_email="o@mbx.com",
        subdomain="mbx-defaults",
    )
    cd = CustomDomain.objects.create(
        tenant=tenant,
        domain="mbxdefaults.com",
        cost_minor=1000,
        price_minor=1200,
        currency="usd",
    )
    assert cd.mailbox_local_part == "info"
    assert cd.mailbox_enabled is False
