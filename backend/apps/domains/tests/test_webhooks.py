# backend/apps/domains/tests/test_webhooks.py
import pytest

from apps.core.models import Domain
from apps.domains.models import CustomDomain, DomainSubscription
from apps.domains.webhooks import handle_domain_event

pytestmark = pytest.mark.django_db


def _cd(restore_public, **kw):
    return CustomDomain.objects.create(
        tenant=restore_public,
        domain=kw.pop("domain", "hook.com"),
        cost_minor=1,
        price_minor=1200,
        currency="EUR",
        contact={"Email": "c@x.com"},
        **kw,
    )


def test_checkout_completed_enqueues_provision(
    restore_public, settings, monkeypatch, django_capture_on_commit_callbacks
):
    settings.DOMAINS_BYPASS_ENABLED = True
    cd = _cd(restore_public)
    DomainSubscription.objects.create(tenant=restore_public, custom_domain=cd)
    calls = []
    from apps.domains import webhooks

    monkeypatch.setattr(webhooks.provision_domain, "delay", lambda cid: calls.append(cid))

    event = {
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "metadata": {"domains_custom_domain_id": str(cd.id)},
                "subscription": "sub_123",
                "customer": "cus_123",
            }
        },
    }
    # Provisioning is now enqueued via transaction.on_commit, so capture+run the
    # committed callbacks to observe the enqueue.
    with django_capture_on_commit_callbacks(execute=True):
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
    event = {
        "type": "customer.subscription.deleted",
        "data": {"object": {"id": "sub_9", "metadata": {"domains_custom_domain_id": str(cd.id)}}},
    }
    assert handle_domain_event(event) is True
    cd.refresh_from_db()
    assert cd.provisioning_status == "lapsed"
    assert not Domain.objects.filter(domain="lapse.com").exists()


def test_subscription_created_returns_true_and_updates_sub(restore_public):
    """customer.subscription.created with metadata carries domains_custom_domain_id → handled."""
    cd = _cd(restore_public, domain="created.com")
    DomainSubscription.objects.create(tenant=restore_public, custom_domain=cd)
    event = {
        "type": "customer.subscription.created",
        "data": {
            "object": {
                "id": "sub_new_999",
                "customer": "cus_abc",
                "status": "active",
                "metadata": {"domains_custom_domain_id": str(cd.id)},
            }
        },
    }
    result = handle_domain_event(event)
    assert result is True
    cd.subscription.refresh_from_db()
    assert cd.subscription.provider_subscription_id == "sub_new_999"
    assert cd.subscription.provider_customer_id == "cus_abc"
    assert cd.subscription.status == "active"


def test_invoice_paid_via_subscription_id_calls_renew(restore_public, monkeypatch):
    """invoice.paid with no metadata but matching provider_subscription_id → renew_domain.delay called."""
    cd = _cd(restore_public, domain="renew.com", provisioning_status="live")
    DomainSubscription.objects.create(
        tenant=restore_public,
        custom_domain=cd,
        provider_subscription_id="sub_renew_111",
        status="active",
    )
    renew_calls = []
    from apps.domains import webhooks

    monkeypatch.setattr(webhooks.renew_domain, "delay", lambda cid: renew_calls.append(cid))

    event = {
        "type": "invoice.paid",
        "data": {
            "object": {
                # No domains_custom_domain_id in metadata — must resolve via subscription id.
                "metadata": {},
                "subscription": "sub_renew_111",
            }
        },
    }
    result = handle_domain_event(event)
    assert result is True
    assert renew_calls == [cd.id]
