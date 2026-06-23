# backend/apps/domains/tests/test_webhooks.py
import pytest

from apps.core.models import Domain
from apps.domains.models import CustomDomain, DomainSubscription
from apps.domains.webhooks import handle_domain_event

pytestmark = pytest.mark.django_db


def _cd(restore_public, **kw):
    return CustomDomain.objects.create(
        tenant=restore_public, domain=kw.pop("domain", "hook.com"), cost_minor=1, price_minor=1200,
        currency="EUR", contact={"Email": "c@x.com"}, **kw
    )


def test_checkout_completed_enqueues_provision(restore_public, settings, monkeypatch):
    settings.DOMAINS_BYPASS_ENABLED = True
    cd = _cd(restore_public)
    DomainSubscription.objects.create(tenant=restore_public, custom_domain=cd)
    calls = []
    from apps.domains import webhooks
    monkeypatch.setattr(webhooks.provision_domain, "delay", lambda cid: calls.append(cid))

    event = {
        "type": "checkout.session.completed",
        "data": {"object": {
            "metadata": {"domains_custom_domain_id": str(cd.id)},
            "subscription": "sub_123", "customer": "cus_123",
        }},
    }
    assert handle_domain_event(event) is True
    cd.subscription.refresh_from_db()
    assert cd.subscription.status == "active"
    assert cd.subscription.provider_subscription_id == "sub_123"
    assert calls == [cd.id]


def test_non_domain_event_ignored(restore_public):
    event = {"type": "checkout.session.completed", "data": {"object": {"metadata": {}}}}
    assert handle_domain_event(event) is False


def test_subscription_deleted_lapses(restore_public, settings):
    settings.DOMAINS_BYPASS_ENABLED = True
    cd = _cd(restore_public, domain="lapse.com", provisioning_status="live")
    DomainSubscription.objects.create(tenant=restore_public, custom_domain=cd, provider_subscription_id="sub_9")
    Domain.objects.create(domain="lapse.com", tenant=restore_public, is_primary=False)
    event = {"type": "customer.subscription.deleted", "data": {"object": {
        "id": "sub_9", "metadata": {"domains_custom_domain_id": str(cd.id)}}}}
    assert handle_domain_event(event) is True
    cd.refresh_from_db()
    assert cd.provisioning_status == "lapsed"
    assert not Domain.objects.filter(domain="lapse.com").exists()
