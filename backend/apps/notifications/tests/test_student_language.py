"""Students get every email, push and the unsubscribe page in the site's language (Task 1.5).

Every test runs with English active (what a creator-role request or a Celery worker has) on a site whose
language is not English: the words must follow the site, not the active language. The studio's previews
are drawn the same way, so a creator sees what her students get.
"""

import re
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from html import unescape
from types import SimpleNamespace
from unittest.mock import patch

import polib
import pytest
from django.conf import settings
from django.core.cache import cache
from django.db import connection
from django.utils.html import escape
from django.utils.translation import get_language, override
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.accounts.models import User
from apps.core.tests.i18n_utils import translated
from apps.courses.models import Course, Enrollment
from apps.email_campaigns import views as campaign_views
from apps.email_campaigns.models import CampaignStatus, EmailCampaign
from apps.email_campaigns.starters import compose
from apps.live.models import LiveClass
from apps.notifications import email_render, tasks
from apps.notifications import transactional as tx
from apps.notifications.views import email_unsubscribe
from apps.tenant_config.models import TenantConfig

pytestmark = pytest.mark.django_db

NS = SimpleNamespace

CLASS_AT = datetime(2030, 11, 5, 17, 0, tzinfo=UTC)  # 18:00 in Europe/Berlin


def _site(tenant, lang):
    cfg = TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="Glow")
    cfg.brand_name, cfg.default_locale, cfg.timezone = "Glow", lang, "Europe/Berlin"
    cfg.save()
    cache.delete(f"tenant:{tenant.schema_name}:config")
    return cfg


@pytest.fixture()
def tr_site(tenant_ctx):
    return _site(tenant_ctx, "tr")


@pytest.fixture()
def student(tenant_ctx):
    return User.objects.create_user(email="sam@glow.test", name="Sam", password="x", role="student")  # noqa: S106


def _emails(student):
    """Every transactional email, built by the hook that sends it, as the emails to be delivered."""
    sent = []
    item = NS(content_object=NS(title="Yoga basics"), item_price=Decimal("49"), access_ends_at=CLASS_AT)
    payment = NS(
        items=NS(all=lambda: [item]),
        student_id=student.pk,
        currency="eur",
        amount=Decimal("49"),
        metadata={"receipt_url": "https://receipts.test/r"},
    )
    plan = NS(name="Studio", billing_interval_months=3)
    sub = NS(
        plan=plan, student_id=student.pk, current_period_end=CLASS_AT, billing_amount=Decimal("12.5"),
        billing_currency="eur",
    )  # fmt: skip
    event = NS(title="Morning flow", scheduled_at=CLASS_AT, pk=7)
    comment = NS(
        post=NS(body="My first post", author=NS(user=NS(email=student.email), user_id=student.pk)),
        author=NS(display_name="Lee"),
        body="Nice one",
    )
    course = Course.objects.create(title="Yoga basics", slug="yoga-basics", instructor=student)
    Enrollment.objects.create(
        user=student, course=course, access_ends_at=datetime.now(UTC) + timedelta(days=3) - timedelta(hours=1)
    )
    with (
        patch.object(tx, "deliver", lambda to, email: sent.append(email)),
        patch.object(tx, "ticket_holders", return_value=[student.email]),
    ):
        tx.welcome_student(student.email)
        tx.purchase_done(payment)
        tx.refund_done(payment, [item], NS(amount=Decimal("49"), currency="eur"))
        tx.access_opened(student.email, "Yoga basics", CLASS_AT)
        for kind in ("started", "renewed", "failed", "cancelled", "ended"):
            # the webhook's call shape: the raw sum and its currency, written by the hook
            tx.membership_event(
                kind, sub, invoice_url="https://invoices.test/i", amount=Decimal("12.5"), currency="eur"
            )
        for kind in ("reminder", "changed", "cancelled"):
            tx.class_event(kind, event)
        tx.comment_replied(comment)
        tx.access_ending_soon()
    sent.append(tx.sign_in("Glow", "https://glow.test/cb", "123456", 15))
    sent.append(tx.sign_in("Glow", "https://glow.test/cb", "", 15))
    return sent


def _po_entries(lang, source):
    po = polib.pofile(str(settings.BASE_DIR / "locale" / lang / "LC_MESSAGES" / "django.po"))
    return [e for e in po if any(path.endswith(source) for path, _line in e.occurrences)]


def _pattern(msgid):
    parts = re.split(r"%\(\w+\)[sd]", msgid)
    return re.compile(r"(?<!\w)" + ".+?".join(re.escape(p) for p in parts) + r"(?!\w)")


def _english_msgids(lang, source):
    """The English texts of `source` that `lang` really translates, singular and plural forms, as regexes
    (placeholders match anything). A text with no translation at all is a failure, not a skip."""
    found = []
    for entry in _po_entries(lang, source):
        forms = [entry.msgid, entry.msgid_plural] if entry.msgid_plural else [entry.msgid]
        translations = list(entry.msgstr_plural.values()) if entry.msgid_plural else [entry.msgstr]
        assert all(translations), f"{lang}: {entry.msgid!r} has no translation"
        if all(t in forms for t in translations):  # the same in both languages: nothing to leak
            continue
        found += [(msgid, _pattern(msgid)) for msgid in forms]
    return found


def _leaks(known, call_args):
    shown = " ".join([call_args["subject"], _visible(call_args["html"]), call_args["text"]])
    return [msgid for msgid, pattern in known if pattern.search(shown)]


OFFER = {
    "ref": "course:1", "kind": "course", "kindLabel": "Course", "title": "Yoga basics", "summary": "", "image": "",
    "url": "https://glow.test/courses/yoga-basics", "meta": "49 EUR",
}  # fmt: skip


def _visible(html):
    html = re.sub(r"(?is)<(head|style)\b.*?</\1>|<!--.*?-->", " ", html)
    return unescape(re.sub(r"<[^>]+>", " ", html))


@pytest.mark.parametrize("lang", ["tr", "de", "pl"])
def test_every_transactional_email_has_no_english_template_string(tenant_ctx, student, lang):
    _site(tenant_ctx, lang)
    emails = _emails(student)
    assert len(emails) == 16  # none swallowed by a hook: 4 + 5 memberships + 3 classes + reply + ending + 2 sign-ins
    known = _english_msgids(lang, "notifications/transactional.py")
    assert len(known) > 70
    with patch("apps.core.email.send_email") as out:
        for email in emails:
            tx.send(student.email, email, tenant_ctx)
    assert out.call_count == len(emails)
    for call in out.call_args_list:
        leaked = _leaks(known, call.kwargs)
        assert not leaked, f"{lang}: English left in {call.kwargs['subject']!r}: {leaked}"
        assert f'lang="{lang}"' in call.kwargs["html"]
    # the setup samples carry an offer: its "Take a look" button
    with override(lang):
        html = tx.render(tx.welcome("Glow", "https://glow.test"), tenant_ctx, offer=OFFER)
    assert not _leaks(known, {"subject": "", "html": html, "text": ""})
    assert translated("Take a look", lang) in html


def test_the_leak_check_can_fail_on_plurals_the_offer_and_full_stops(tenant_ctx):
    """The same check over English emails on a Turkish site: it must find the sign-in minutes line (a plural),
    a membership price (a plural) and the offer button, and a sentence ending in a full stop."""
    known = _english_msgids("tr", "notifications/transactional.py")
    english = tx.sign_in("Glow", "https://glow.test/cb", "123456", 15)
    html = tx.render(english, tenant_ctx, offer=OFFER)
    leaked = _leaks(known, {"subject": english.subject, "html": html, "text": tx.plain_text(english)})
    for msgid in (
        "Tap the button to sign in to %(brand)s. The link works for %(minutes)d minutes.",
        "If you didn't ask for this, you can ignore this email.",
        "Take a look",
    ):
        assert msgid in leaked, msgid
    price = tx.membership_started("Glow", "https://glow.test", "Studio", "12.50 EUR / 3 months", "5 November 2030")
    assert "Membership" in _leaks(known, {"subject": "", "html": tx.render(price, tenant_ctx), "text": ""})


def test_class_reminder_date_is_turkish(tenant_ctx, tr_site, student):
    sent = []
    event = NS(title="Morning flow", scheduled_at=CLASS_AT, pk=7)
    with (
        patch.object(tx, "deliver", lambda to, email: sent.append(email)),
        patch.object(tx, "ticket_holders", return_value=[student.email]),
    ):
        tx.class_event("reminder", event)
    (email,) = sent
    assert "Kasım" in " ".join(v for _label, v in email.rows)
    assert email.rows[0][1].endswith("18:00 (Europe/Berlin)")  # her clock and its label stay
    assert email.subject == translated("Starting soon: %(title)s") % {"title": "Morning flow"}


def test_dates_and_money_follow_the_language_and_english_is_unchanged(tenant_ctx, tr_site):
    assert tx.when(CLASS_AT) == "Tuesday 5 November 2030, 18:00 (Europe/Berlin)"  # English is active
    assert tx.money(Decimal("49"), "eur") == "49 EUR" and tx.money(12.5, "usd") == "12.50 USD"
    with override("tr"):
        assert tx.when(CLASS_AT) == "Salı 5 Kasım 2030, 18:00 (Europe/Berlin)"
        assert tx.day(CLASS_AT) == "5 Kasım 2030"
        assert tx.money(Decimal("12.5"), "usd") == "12,50 USD"
    with override("pl"):
        assert tx.day(CLASS_AT) == "5 listopada 2030"


def test_unsubscribe_page_is_in_the_site_language(tenant_ctx, tr_site):
    token = email_render.unsubscribe_url(tenant_ctx, email="a@b.test").split("t=")[1]
    ok = email_unsubscribe(APIRequestFactory().get("/", {"t": token}))
    assert ok.status_code == 200 and ok["Content-Type"].startswith("text/html")
    page = ok.content.decode()
    assert '<html lang="tr">' in page and escape(translated("You've been unsubscribed from these emails.")) in page
    bad = email_unsubscribe(APIRequestFactory().get("/", {"t": "garbage"}))
    assert bad.status_code == 400
    assert '<html lang="tr">' in bad.content.decode() and translated("Invalid or expired link.") in bad.content.decode()


def test_live_reminder_push_is_in_the_site_language(tenant_ctx, tr_site):
    coach = User.objects.create_user(email="coach@glow.test", name="Coach", password="x", role="owner")  # noqa: S106
    LiveClass.objects.create(
        title="Morning flow",
        instructor=coach,
        scheduled_at=datetime.now(UTC) + timedelta(minutes=10),
        duration_minutes=60,
        status="scheduled",
    )
    with patch.object(tasks, "send_to_subscriptions") as push, patch.object(tx, "deliver"):
        tasks._send_reminders_for_current_tenant()
    payload = push.call_args.args[1]
    assert payload["body"] == translated("Starting soon: %(title)s") % {"title": "Morning flow"}
    assert payload["title"] == "Glow"


def test_new_content_push_and_announcement_email_are_in_the_site_language(tenant_ctx, tr_site):
    from apps.notifications.models import PushSubscription

    coach = User.objects.create_user(email="coach@glow.test", name="Coach", password="x", role="owner")  # noqa: S106
    Course.objects.create(title="Yoga basics", slug="yoga-basics", instructor=coach)
    with patch.object(tasks, "broadcast_to_tenant") as push:
        tasks.fanout_new_content(Course.objects.get().pk, connection.schema_name)
    assert push.call_args.args[0]["body"] == translated("New: %(title)s") % {"title": "Yoga basics"}
    assert PushSubscription.objects.count() == 0
    with override("tr"):
        untitled = email_render.announcement_email(NS(title="", body="<p>x</p>", link="/a"), "https://glow.test", "u")
    assert untitled.subject == translated("News") and untitled.button == translated("Open")


# --- the studio's previews draw student emails in the site's language ------------------------------


def _owner(tenant):
    return User.objects.create_user(email="owner@glow.test", name="Mara Lind", password="x", role="owner")  # noqa: S106


def _studio_call(view, owner, method="post", data=None, **kwargs):
    """The view as a creator's request reaches it: her own language (English) active."""
    request = getattr(APIRequestFactory(), method)("/", data or {}, format="json")
    force_authenticate(request, user=owner)
    with override("en"):
        return view(request, **kwargs)


FOOTER_DESIGN = compose(None, heading="Spring", body_html="<p>Hi {{FirstName}}</p>")


def test_the_editor_preview_is_drawn_in_the_site_language(tenant_ctx, tr_site):
    response = _studio_call(
        campaign_views.render_view, _owner(tenant_ctx), data={"design": FOOTER_DESIGN, "subject": "S", "preheader": ""}
    )
    assert response.status_code == 200, response.data
    html = response.data["html"]
    assert 'lang="tr"' in html and translated("Unsubscribe") in html and ">Unsubscribe<" not in html


def test_template_card_previews_are_drawn_in_the_site_language_and_cached_per_language(
    tenant_ctx, tr_site, monkeypatch
):
    from django.core.cache.backends.locmem import LocMemCache

    from apps.email_campaigns import brand

    monkeypatch.setattr(campaign_views, "cache", LocMemCache("student-language-cards", {}))  # not the shared Redis'

    with override("en"):
        tr_html = campaign_views._preview(FOOTER_DESIGN, brand.kit(tenant_ctx), "S")
    assert translated("Unsubscribe") in tr_html and 'lang="tr"' in tr_html
    _site(tenant_ctx, "en")
    en_html = campaign_views._preview(FOOTER_DESIGN, brand.kit(tenant_ctx), "S")  # not the Turkish card
    assert ">Unsubscribe<" in en_html and 'lang="en"' in en_html


def test_a_test_send_is_in_the_site_language(tenant_ctx, tr_site):
    owner = _owner(tenant_ctx)
    draft = EmailCampaign.objects.create(
        status=CampaignStatus.DRAFT, subject="Spring, {{FirstName}}", design=FOOTER_DESIGN, sender=owner
    )
    with patch("apps.email_campaigns.tasks.send_email") as out:
        response = _studio_call(campaign_views.campaign_test, owner, pk=draft.pk)
    assert response.status_code == 200, response.data
    mail = out.call_args.kwargs
    assert translated("Unsubscribe") in mail["html"] and 'lang="tr"' in mail["html"]
    assert mail["from_name"] == translated("%(coach)s via %(brand)s") % {"coach": "Mara Lind", "brand": "Glow"}


def test_the_setup_email_style_cards_are_drawn_in_the_site_language(tenant_ctx, tr_site, monkeypatch):
    from django.core.cache.backends.locmem import LocMemCache

    monkeypatch.setattr(tx, "cache", LocMemCache("student-language-previews", {}))
    with override("en"):
        cards = tx.previews(tenant_ctx)
    assert all(translated("Go to your dashboard") in c["html"] for c in cards)
    assert all(escape(translated("Welcome to %(brand)s") % {"brand": "Glow"}) in c["html"] for c in cards)
    _site(tenant_ctx, "en")
    assert all("Go to your dashboard" in c["html"] for c in tx.previews(tenant_ctx))  # not the Turkish cards


def test_a_campaign_to_a_turkish_site_says_there_in_turkish(tenant_ctx, tr_site):
    from apps.email_campaigns.tasks import _with_unsubscribe, first_name

    with override("tr"):
        assert first_name("") == translated("there") and first_name("Ana Lind") == "Ana"
        footer = _with_unsubscribe("<body>x</body>", "https://u.test", "Glow")
    assert translated("Unsubscribe") in footer


# --- the review's findings ------------------------------------------------------------------------


def test_a_membership_amount_is_written_in_the_site_language_like_the_price_row(tenant_ctx, tr_site, student):
    sent = []
    sub = NS(
        plan=NS(name="Studio", billing_interval_months=1), student_id=student.pk, current_period_end=CLASS_AT,
        billing_amount=Decimal("12.5"), billing_currency="eur",
    )  # fmt: skip
    with patch.object(tx, "deliver", lambda to, email: sent.append(email)):
        tx.membership_event("renewed", sub, amount=Decimal("12.5"), currency="eur")  # English is active
        tx.membership_event("started", sub)
    renewed, started = sent
    assert dict(renewed.rows)[translated("Paid")] == "12,50 EUR"
    assert "12,50 EUR" in dict(started.rows)[translated("Price")]


def test_the_plain_text_button_fallback_is_in_the_site_language(tenant_ctx, tr_site):
    from apps.email_campaigns import brand

    design = {"version": 1, "body": {"blocks": [{"id": "b", "type": "button", "data": {"url": "https://x.test"}}]}}
    with override("en"):
        _html, text, _warnings = brand.build(design, tenant_ctx)
    assert f"{translated('Open')}: https://x.test" in text


def test_item_card_prices_are_written_in_the_site_language(tenant_ctx, tr_site):
    from apps.email_campaigns import catalog

    assert catalog._money(12.5).endswith("12.50") and catalog._money(49).endswith("49")  # English is active
    with override("tr"):
        assert catalog._money(12.5).endswith("12,50") and catalog._money(49).endswith("49")
        plan = NS(id=1, name="Studio", billing_interval_months=1, price=Decimal("12.5"), description="")
        assert catalog._plan(plan, "https://glow.test")["meta"] == translated("%(price)s a month") % {
            "price": catalog._money(12.5)
        }


def test_a_failing_language_lookup_does_not_break_the_hook_that_triggered_it(tenant_ctx, student):
    def broken():
        raise RuntimeError("no config")

    with (
        patch.object(tx, "site_language_context", broken),
        patch.object(tx, "deliver") as deliver,
        patch.object(tx.logger, "exception") as logged,
    ):
        tx.welcome_student(student.email)  # a hook never breaks what triggered it
    deliver.assert_not_called()
    logged.assert_called_once()


def test_a_send_inside_a_fan_out_does_not_look_the_language_up_again(tenant_ctx, tr_site, student):
    from apps.core import languages

    email = tx.welcome("Glow", "https://glow.test")
    with (
        patch("apps.core.email.send_email"),
        patch.object(languages, "site_language", wraps=languages.site_language) as look,
        languages.site_language_context(),
    ):
        for _n in range(3):
            tx.send(student.email, email, tenant_ctx)
    assert look.call_count == 1


def test_a_test_send_changes_only_the_email_language_not_her_replies(tenant_ctx, tr_site):
    owner = _owner(tenant_ctx)
    draft = EmailCampaign.objects.create(status=CampaignStatus.DRAFT, subject="S", design=FOOTER_DESIGN, sender=owner)
    seen = []
    with patch("apps.email_campaigns.tasks.send_one", side_effect=lambda *a, **k: seen.append(get_language()) or True):
        response = _studio_call(campaign_views.campaign_test, owner, pk=draft.pk)
    assert response.status_code == 200 and seen == ["tr"]
    cache.set(f"email-tests:{connection.schema_name}:{owner.pk}:{datetime.now(UTC):%Y%m%d%H}", 99, 3600)
    with override("en"):
        assert _studio_call(campaign_views.campaign_test, owner, pk=draft.pk).status_code == 429
