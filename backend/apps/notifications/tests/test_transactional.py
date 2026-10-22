"""Transactional emails: the three styles as engine blocks, the plain fallback, and the events that
send them (purchases, memberships, class changes, the /setup pick)."""

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from unittest.mock import patch

import pytest
from django.contrib.contenttypes.models import ContentType
from django.test import override_settings
from django.utils import timezone
from django_tenants.utils import tenant_context

from apps.accounts.models import User
from apps.billing.models import Payment, PaymentItem, Subscription, SubscriptionPlan
from apps.billing.tests.test_subscriptions_connect import _FakeEvent, _post_webhook
from apps.core.models import Tenant
from apps.email_campaigns import brand
from apps.notifications import transactional as tx
from apps.tenant_config.models import TenantConfig

pytestmark = pytest.mark.django_db

_PW = "secret123"  # noqa: S106
KIT = {
    "name": "<b>Zen</b>",
    "site": "https://zen.example.com",
    "host": "zen.example.com",
    "logo": "https://zen.example.com/pwa-icon?size=192",
    "colours": {**brand.FALLBACK_COLORS, "mutedForeground": brand.FALLBACK_COLORS["muted"]},
    "heading_font": "Georgia, serif",
    "body_font": "Arial, sans-serif",
    "radius": 8,
}


def _config():
    return TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="Zen")


def _walk(node):
    if isinstance(node, dict):
        yield node
        for v in node.values():
            yield from _walk(v)
    elif isinstance(node, list):
        for v in node:
            yield from _walk(v)


@pytest.mark.parametrize("style", sorted(tx.STYLE_IDS))
def test_every_style_carries_the_link_as_is_and_escapes_her_words(style):
    email = tx.sign_in("<b>Zen</b>", "https://zen.example.com/callback?token=a&b=1", "123456", 15)
    data = tx.blocks(KIT, style, email)
    buttons = [b for b in _walk(data) if b.get("type") == "button"]
    assert [b["data"]["url"] for b in buttons] == ["https://zen.example.com/callback?token=a&b=1"]
    texts = " ".join(b["data"]["html"] for b in _walk(data) if b.get("type") == "text")
    assert "<b>Zen</b>" not in texts and "&lt;b&gt;Zen&lt;/b&gt;" in texts
    assert any(b.get("data", {}).get("text") == "123 456" for b in _walk(data))
    assert "{{" not in repr(data)  # values are in place: nothing is left for a merge


def test_render_draws_with_the_engine_and_falls_back_when_it_fails(tenant_ctx):
    cfg = _config()
    email = tx.welcome("Zen", "https://zen.example.com")
    html = tx.render(email, tenant_ctx, cfg=cfg)
    assert 'role="presentation"' in html and "Welcome to Zen" in html  # the engine's table email
    assert "https://zen.example.com/dashboard" in html and "brand:" not in html
    with patch("apps.email_campaigns.render.render", side_effect=RuntimeError("boom")):
        plain = tx.render(email, tenant_ctx, cfg=cfg)
    assert "Welcome to Zen" in plain and 'role="presentation"' not in plain


def test_a_sign_in_link_is_carried_as_is(tenant_ctx):
    html = tx.render(tx.sign_in("Zen", "https://x.test/cb?token=a&b=1", "123456", 15), tenant_ctx, cfg=_config())
    assert 'href="https://x.test/cb?token=a&amp;b=1"' in html and "123 456" in html


def test_the_style_comes_from_her_setup_answer(tenant_ctx):
    tenant = Tenant.objects.get(pk=tenant_ctx.pk)
    tenant.wizard_state = {"flow": "interview", "answers": {"email_style": "bold"}}
    assert tx.style_of(tenant) == "bold"
    tenant.wizard_state = {"flow": "interview", "answers": {"email_style": "neon"}}
    assert tx.style_of(tenant) == tx.DEFAULT_STYLE


def test_choosing_the_email_style_in_setup(tenant_ctx):
    from apps.tenant_config import interview_brief as brief
    from apps.tenant_config import interview_milestones as milestones

    answers = {}
    milestones.choose(tenant_ctx, answers, "email_style", "letter")
    assert answers["email_style"] == "letter"
    with pytest.raises(milestones.ChoiceError):
        milestones.choose(tenant_ctx, answers, "email_style", "neon")
    answers = {}
    milestones.choose(tenant_ctx, answers, "email_style", brief.DELEGATE)
    assert answers["email_style"] == tx.DEFAULT_STYLE


def test_setup_cards_preview_each_style(tenant_ctx):
    from apps.tenant_config import interview_milestones as milestones

    with patch.object(tx, "render", side_effect=lambda email, tenant, style="", **kw: f"<p>{style}</p>"):
        cards = milestones.cards_for(tenant_ctx, {}, "email_style")
    assert cards["kind"] == "email"
    assert [(o["value"], o["html"]) for o in cards["options"]] == [(s, f"<p>{s}</p>") for s, _, _ in tx.STYLES]


def test_deliver_waits_for_the_commit_and_queues_the_send(tenant_ctx):
    with (
        patch("apps.notifications.tasks.send_transactional.delay") as delay,
        patch("django.db.transaction.on_commit", side_effect=lambda fn: fn()),
    ):
        tx.deliver("a@b.com", tx.welcome("Zen", "https://zen.example.com"))
        tx.deliver("", tx.welcome("Zen", "https://zen.example.com"))
    assert delay.call_count == 1
    schema, to, payload = delay.call_args.args
    assert (schema, to, payload["subject"]) == (tenant_ctx.schema_name, "a@b.com", "Welcome to Zen")


def _sub(tenant, sub_id, **fields):
    with tenant_context(tenant):
        student = User.objects.create_user(email=f"{sub_id}@tx.test", name="S", password=_PW, role="student")
        plan = SubscriptionPlan.objects.create(name="Gold", price=Decimal("20.00"), currency="USD")
        return Subscription.objects.create(
            student=student,
            plan=plan,
            billing_amount=plan.price,
            billing_currency="USD",
            provider="stripe",
            provider_subscription_id=sub_id,
            current_period_start=datetime(2026, 6, 1, tzinfo=UTC),
            current_period_end=datetime(2026, 7, 1, tzinfo=UTC),
            **{"status": "active", **fields},
        )


def _invoice(event_type, account, sub_id, **extra):
    return _FakeEvent(
        {
            "id": f"evt_{sub_id}_{event_type}",
            "type": event_type,
            "account": account,
            "data": {
                "object": {
                    "subscription": sub_id,
                    "amount_paid": 2000,
                    "amount_due": 2000,
                    "currency": "usd",
                    "id": f"in_{sub_id}",
                    "hosted_invoice_url": "https://invoice.stripe.com/i/x",
                    **extra,
                }
            },
        }
    )


@override_settings(BILLING_BYPASS_ENABLED=False, STRIPE_WEBHOOK_SECRET="whsec_tx")  # noqa: S106
@pytest.mark.parametrize(
    ("reason", "subject"),
    [("subscription_create", "Welcome to Gold"), ("subscription_cycle", "Gold: payment received"), ("manual", None)],
)
def test_a_paid_invoice_starts_or_renews_a_membership(restore_public, reason, subject):
    tenant = restore_public
    Tenant.objects.filter(pk=tenant.pk).update(stripe_account_id="acct_tx_paid")
    _sub(tenant, f"sub_tx_{reason}")
    with patch.object(tx, "deliver") as deliver:
        assert (
            _post_webhook(
                _invoice("invoice.paid", "acct_tx_paid", f"sub_tx_{reason}", billing_reason=reason)
            ).status_code
            == 200
        )
    assert [c.args[1].subject for c in deliver.call_args_list] == ([subject] if subject else [])


@override_settings(BILLING_BYPASS_ENABLED=False, STRIPE_WEBHOOK_SECRET="whsec_tx")  # noqa: S106
def test_a_failed_payment_emails_once(restore_public):
    tenant = restore_public
    Tenant.objects.filter(pk=tenant.pk).update(stripe_account_id="acct_tx_fail")
    _sub(tenant, "sub_tx_fail")
    with patch.object(tx, "deliver") as deliver:
        _post_webhook(_invoice("invoice.payment_failed", "acct_tx_fail", "sub_tx_fail"))
        _post_webhook(_invoice("invoice.payment_failed", "acct_tx_fail", "sub_tx_fail"))  # Stripe's retry
    assert deliver.call_count == 1
    to, email = deliver.call_args.args
    assert to == "sub_tx_fail@tx.test" and email.link == "https://invoice.stripe.com/i/x"


@override_settings(BILLING_BYPASS_ENABLED=False, STRIPE_WEBHOOK_SECRET="whsec_tx")  # noqa: S106
def test_a_paid_checkout_sends_one_receipt(restore_public):
    tenant = restore_public
    Tenant.objects.filter(pk=tenant.pk).update(stripe_account_id="acct_tx_buy")
    with tenant_context(tenant):
        from apps.downloads.models import DownloadFile as Download

        student = User.objects.create_user(email="buyer@tx.test", name="B", password=_PW, role="student")
        item = Download.objects.create(title="Breath ebook", price=Decimal("9.00"))
        payment = Payment.objects.create(
            student=student,
            payment_type="one_time",
            status="pending",
            amount=Decimal("9.00"),
            platform_fee=Decimal("0"),
            submerchant_payout=Decimal("9.00"),
            currency="EUR",
        )
        PaymentItem.objects.create(
            payment=payment,
            content_type=ContentType.objects.get_for_model(Download),
            object_id=item.pk,
            item_price=Decimal("9.00"),
            submerchant_payout=Decimal("9.00"),
        )
    event = _FakeEvent(
        {
            "id": "evt_tx_buy",
            "type": "checkout.session.completed",
            "account": "acct_tx_buy",
            "data": {
                "object": {
                    "mode": "payment",
                    "payment_status": "paid",
                    "id": "cs_tx_buy",
                    "metadata": {"payment_id": str(payment.pk), "tenant_id": str(tenant.pk)},
                }
            },
        }
    )
    with patch.object(tx, "deliver") as deliver:
        _post_webhook(event)
        _post_webhook(event)  # a replay
    assert deliver.call_count == 1
    to, email = deliver.call_args.args
    assert to == "buyer@tx.test"
    assert ("Breath ebook", "9 EUR") in [tuple(r) for r in email.rows]


def test_ticket_holders_hear_when_their_class_moves_or_is_cancelled(tenant_ctx):
    from apps.live.models import OnsiteEvent

    owner = User.objects.create_user(email="coach@tx.test", name="C", password=_PW, role="owner")
    holder = User.objects.create_user(email="holder@tx.test", name="H", password=_PW, role="student")
    at = timezone.now() + timedelta(days=3)
    event = OnsiteEvent.objects.create(title="Retreat", instructor=owner, scheduled_at=at, status="scheduled")
    payment = Payment.objects.create(
        student=holder,
        payment_type="one_time",
        status="completed",
        amount=Decimal("50"),
        platform_fee=Decimal("0"),
        submerchant_payout=Decimal("50"),
    )
    PaymentItem.objects.create(
        payment=payment,
        content_type=ContentType.objects.get_for_model(OnsiteEvent),
        object_id=event.pk,
        item_price=Decimal("50"),
        submerchant_payout=Decimal("50"),
    )
    with patch.object(tx, "deliver") as deliver:
        event.title = "Retreat!"  # not a new time: nothing
        event.save()
        event.scheduled_at = at + timedelta(hours=2)
        event.save()
        event.delete()
    assert [(c.args[0], c.args[1].subject) for c in deliver.call_args_list] == [
        ("holder@tx.test", "New time: Retreat!"),
        ("holder@tx.test", "Cancelled: Retreat!"),
    ]
