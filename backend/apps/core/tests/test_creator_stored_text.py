"""What the studio records or sends for the creator is in the creator's language (Task 4.6).

The site is Turkish and the owner reads German: every text below has the owner as its one reader,
whatever language the request (a visitor on the site, a Celery task) happens to run in.
"""

from unittest import mock

import pytest
from django.core.cache import cache
from django.utils import translation
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.tests.i18n_utils import creator_client, gettext_in, translated
from apps.tenant_config.models import TenantConfig

pytestmark = pytest.mark.django_db(transaction=True)

HOST = "shared-test.localhost"
SCHEMA = "shared_test"


@pytest.fixture(params=["de", "pl"])
def owner(request, tenant_ctx):
    """An owner who reads German or Polish, on a Turkish site."""
    config = TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="Glow")
    config.default_locale = "tr"
    config.save()
    cache.delete(f"tenant:{SCHEMA}:config")
    user = User.objects.create_user(
        email="owner@storedtext.com",
        name="Owner",
        password="x",  # noqa: S106
        role="owner",
        is_staff=True,
        preferred_locale=request.param,
    )
    yield user
    config.default_locale = "en"
    config.save()
    cache.delete(f"tenant:{SCHEMA}:config")


def test_audit_summary_is_in_the_creators_language(tenant_ctx, owner):
    from apps.core.copilot.views import _record_audit
    from apps.tenant_config.models import CopilotAudit

    with translation.override("tr"):  # a request on the Turkish site
        audit_id = _record_audit(tenant_ctx, owner, {"kind": "edit_navbar"}, {}, {})
        assert translation.get_language() == "tr"  # and only for the write
    assert CopilotAudit.objects.get(pk=audit_id).summary == translated("Updated the navbar", owner.preferred_locale)


def test_audit_summary_without_an_acting_user_follows_the_owner(tenant_ctx, owner):
    from apps.core.copilot.views import _record_audit
    from apps.tenant_config.models import CopilotAudit

    with translation.override("tr"):
        audit_id = _record_audit(tenant_ctx, None, {"kind": "set_logo"}, {}, {})
    assert CopilotAudit.objects.get(pk=audit_id).summary == translated("Set a new logo", owner.preferred_locale)
    with translation.override("tr"):
        titled = _record_audit(tenant_ctx, owner, {"kind": "create_course"}, {"title": "Pads"}, {})
    assert CopilotAudit.objects.get(pk=titled).summary == translated(
        "Created draft course '%(title)s'", owner.preferred_locale
    ) % {"title": "Pads"}


def test_audit_summary_counts_and_titles_are_whole_messages():
    from apps.core.copilot.views import _audit_summary

    with translation.override("de"):
        one = _audit_summary({"kind": "edit_pages"}, {"changes_count": 1})
        many = _audit_summary({"kind": "edit_pages"}, {"changes_count": 3})
        titled = _audit_summary({"kind": "publish_course"}, {"title": "Pads"})
    assert "1" in one and "3" in many and one != many.replace("3", "1")
    assert "Pads" in titled and "Published" not in titled


def test_contact_subject_and_body_are_in_the_owners_language(tenant_ctx, owner):
    from apps.mailbox.models import Message

    res = APIClient(HTTP_HOST=HOST).post(
        "/api/v1/contact/",
        {"name": "Sam", "email": "sam@x.com", "message": "When is class?", "phone": "555-1234"},
        format="json",
    )
    assert res.status_code == 200
    message = Message.objects.get(direction="inbound")
    assert message.conversation.subject == gettext_in("New message from %(name)s", owner.preferred_locale) % {
        "name": "Sam"
    }
    assert gettext_in("Phone: %(phone)s", owner.preferred_locale) % {"phone": "555-1234"} in message.text
    assert message.text.startswith("When is class?")
    translated("Phone: %(phone)s", owner.preferred_locale)


def test_contact_email_fallback_is_in_the_owners_language(tenant_ctx, owner):
    with (
        mock.patch("apps.mailbox.inbound.receive_inbound", side_effect=RuntimeError("storage down")),
        mock.patch("apps.core.contact.views.send_email") as send,
    ):
        APIClient(HTTP_HOST=HOST).post(
            "/api/v1/contact/", {"name": "Sam", "email": "sam@x.com", "message": "Hi"}, format="json"
        )
    html = send.call_args.kwargs["html"]
    assert translated("New contact message", owner.preferred_locale) in html
    assert gettext_in("via %(brand)s", owner.preferred_locale).split("%(brand)s")[0] in html


def test_campaign_recipient_summary_is_in_the_senders_language(tenant_ctx, owner):
    from apps.courses.models import Course
    from apps.email_campaigns import tasks
    from apps.email_campaigns.models import CampaignStatus, EmailCampaign
    from apps.email_campaigns.starters import compose

    User.objects.create_user(email="ada@storedtext.com", name="Ada", password="x", role="student")  # noqa: S106
    course = Course.objects.create(title="Pads", slug="pads", instructor=owner)
    campaigns = [
        EmailCampaign.objects.create(
            subject="Spring",
            design=compose(None, heading="Spring", body_html="<p>Hi</p>"),
            sender=owner,
            recipient_filter=flt,
            recipient_count=1,
            status=CampaignStatus.SENDING,
        )
        for flt in ({"type": "all"}, {"type": "individual", "user_ids": [1, 2]}, {"type": "course", "course_ids": []})
    ]
    with mock.patch.object(tasks, "send_email", return_value=True):
        for campaign in campaigns:
            tasks.send_campaign_emails(campaign.id, SCHEMA)
    summaries = [EmailCampaign.objects.get(pk=c.pk).recipient_summary for c in campaigns]
    assert summaries[0] == translated("All students", owner.preferred_locale)
    assert summaries[2] == translated("No courses selected", owner.preferred_locale)
    assert "2" in summaries[1] and summaries[1] != "2 selected student(s)"
    assert course.title not in summaries[0]


def test_each_blog_push_is_in_the_language_of_the_person_it_goes_to(tenant_ctx, owner):
    from apps.blog import tasks
    from apps.blog.models import BlogPost
    from apps.notifications.models import PushSubscription

    coach = User.objects.create_user(
        email="coach@storedtext.com",
        name="Coach",
        password="x",
        role="coach",
        preferred_locale="tr",
    )
    for user in (owner, coach):
        PushSubscription.objects.create(user=user, endpoint=f"https://push.test/{user.pk}", p256dh="k", auth="a")
    post = BlogPost.objects.create(slug="s", title="Pads", body_html="<p>b</p>", status="published")
    sent = {}

    def send(subs, payload):
        for sub in subs:
            sent.setdefault(sub.user.preferred_locale, []).append(payload)

    with translation.override("en"), mock.patch("apps.notifications.services.send_to_subscriptions", side_effect=send):
        tasks.notify_autopilot_result(post, published=True)
        tasks.notify_autopilot_result(post, published=False)
        tasks.notify_autopilot_paused()
    for language in (owner.preferred_locale, "tr"):
        titles = [p["title"] for p in sent[language]]
        assert titles == [
            translated("New blog post published", language),
            translated("Your new blog post is ready", language),
            translated("Blog autopilot paused", language),
        ]
        assert all("Pads" in p["body"] for p in sent[language][:2])


def test_a_schedule_summary_is_in_the_readers_language_and_english_for_the_model(tenant_ctx):
    from apps.tenant_config import interview_milestones as ms
    from apps.tenant_config import interview_schedule as schedule

    picked = schedule.parse(
        '{"mode": "recurring", "start": "2026-10-12", "end": "2026-12-07", "days": [4, 2], "times": ["18:30"]}'
    )
    english = "Tuesdays and Thursdays at 6:30 PM, from 12 Oct to 7 Dec 2026"
    assert schedule.summary(picked) == english
    assert schedule.summary(picked, language="en") == english
    german = schedule.summary(picked, language="de")
    assert german != english and "18:30" in german and "Dienstag" in german and "PM" not in german
    assert "Salı" in schedule.summary(picked, language="tr")
    polish = schedule.summary(picked, language="pl")
    assert "Wtorki" in polish and "18:30" in polish and "PM" not in polish and polish != english
    assert "18:30" in schedule.summary({"mode": "once", "at": "2026-10-13T18:30"}, language="pl")
    assert schedule.summary({"mode": "once", "at": "2026-10-13T18:30"}, language="de").startswith("Dienstag")

    answers = {"delegated": []}
    with translation.override("tr"):  # the creator picks it on a Turkish studio
        ms.choose(tenant_ctx, answers, "live_when", picked)
        stored = answers["live_when"]
        golive = schedule.when_text(answers, "live")
        prompt = ms.draft_prompt({**answers, "offers": ["course", "live"], "live_topic": "Pads"}, "event")
    assert stored == schedule.summary(picked, language="tr") and golive == stored
    assert english in prompt  # the writing model reads English, from the structure, never the stored text
    assert (
        schedule.when_text({"live_when": "Salı 19:00"}, "live", language="en") == "Salı 19:00"
    )  # no structure: as stored


@pytest.mark.parametrize("lang", ["tr", "pl"])
def test_a_creator_gets_the_studio_panels_in_their_language(tenant_ctx, lang):
    owner = User.objects.create_user(
        email=f"{lang}owner@storedtext.com",
        name="Owner",
        password="x",
        role="owner",
        preferred_locale=lang,
    )
    client = creator_client(tenant_ctx, owner, lang)

    index = client.get("/api/v1/studio-admin/meta/", HTTP_HOST=HOST).json()
    by_key = {m["key"]: m for m in index["models"]}
    assert by_key["courses"]["label"] == translated("Course", lang)
    assert by_key["courses"]["description"] == translated(
        "Quick edits and publishing. Build course content in Content → Courses.", lang
    )
    assert by_key["users"]["label_plural"] == translated("Users", lang)

    courses = client.get("/api/v1/studio-admin/courses/meta/", HTTP_HOST=HOST).json()
    actions = {a["name"]: a for a in courses["actions"]}
    assert actions["publish"]["label"] == translated("Publish", lang)
    assert actions["unpublish"]["confirm"] == translated(
        "Unpublish selected courses? Students lose access to them.", lang
    )
    assert {c["name"]: c["label"] for c in courses["list_display"]}["is_published"] == translated("Published", lang)

    users = client.get("/api/v1/studio-admin/users/meta/", HTTP_HOST=HOST).json()
    assert users["actions"][0]["label"] == translated("Log in as", lang)
    assert users["description"] == translated(
        "Students and staff in this studio. Log in as a student to see exactly what they see.", lang
    )
    # the keys (urls) never follow the language
    assert set(by_key) >= {"courses", "users", "subscription-plans", "community-posts"}


# Words that are the same in German, Turkish or Polish too.
SAME_IN_ANY_LANGUAGE = {
    "Name",
    "Status",
    "Slug",
    "Bundle",
    "Bundles",
    "Text",
    "Details",
    "Tags",
    "Provider",
    "Email",
    "Type",
    "Order",
}


@pytest.mark.parametrize("lang", ["tr", "de", "pl"])
def test_every_studio_panel_string_is_translated_and_keys_are_stable(lang):
    from apps.adminkit.sites import studio_site

    def words(admin):
        out = [admin.label, admin.label_plural, admin.description, *admin.field_labels.values()]
        for meta in admin.get_actions().values():
            out += [meta["label"], meta["confirm"] or ""]
        return [str(w) for w in out if w]

    for key, admin in studio_site._registry.items():
        with translation.override(lang):
            read = words(admin)
        with translation.override("en"):
            english = words(admin)
        untranslated = [e for e, r in zip(english, read, strict=True) if e == r and e not in SAME_IN_ANY_LANGUAGE]
        assert not untranslated, f"{lang} {key}: {untranslated}"
        assert key == admin.key


def test_a_comment_panels_post_column_is_a_noun_not_the_publish_button():
    from apps.adminkit.sites import studio_site

    admin = studio_site.get_admin("community-comments")
    for lang, noun in (("de", "Beitrag"), ("tr", "Gönderi"), ("pl", "Wpis")):
        with translation.override(lang):
            assert str(admin.field_labels["post"]) == noun


@pytest.mark.parametrize("lang", ["tr", "de", "pl"])
def test_what_this_task_added_has_a_translation_in_every_language(lang):
    """Nothing in the files this task touched is left without a msgstr."""
    import polib
    from django.conf import settings

    mine = (
        "copilot/views.py",
        "contact/views.py",
        "email_campaigns/tasks.py",
        "blog/tasks.py",
        "interview_schedule.py",
        "accounts/admin_panels.py",
        "billing/admin_panels.py",
        "community/admin_panels.py",
        "courses/admin_panels.py",
    )
    po = polib.pofile(str(settings.BASE_DIR / "locale" / lang / "LC_MESSAGES" / "django.po"))
    empty = [
        e.msgid
        for e in po
        if any(o[0].endswith(mine) for o in e.occurrences) and not (e.msgstr or any(e.msgstr_plural.values()))
    ]
    assert not empty, f"{lang}: {empty}"


def test_the_composer_reads_the_session_time_in_english_from_the_schedule(tenant_ctx):
    from apps.tenant_config import interview_brief as brief
    from apps.tenant_config import interview_schedule as schedule

    picked = schedule.parse({"mode": "once", "at": "2026-10-13T18:30"})
    with translation.override("tr"):
        stored = schedule.summary(picked)
        facts = brief.composer_facts({"live_when": stored, "live_schedule": picked})
    assert stored != "Tuesday 13 Oct 2026 at 6:30 PM"
    assert {"q": "Live session schedule", "a": "Tuesday 13 Oct 2026 at 6:30 PM"} in facts
    # an answer saved before the schedule was kept goes as stored
    assert {"q": "Live session schedule", "a": "Evenings"} in brief.composer_facts({"live_when": "Evenings"})
