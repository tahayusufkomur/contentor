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


@pytest.fixture()
def owner(tenant_ctx):
    """A German-reading owner on a Turkish site."""
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
        preferred_locale="de",
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
    assert CopilotAudit.objects.get(pk=audit_id).summary == translated("Updated the navbar", "de")


def test_audit_summary_without_an_acting_user_follows_the_owner(tenant_ctx, owner):
    from apps.core.copilot.views import _record_audit
    from apps.tenant_config.models import CopilotAudit

    with translation.override("tr"):
        audit_id = _record_audit(tenant_ctx, None, {"kind": "set_logo"}, {}, {})
    assert CopilotAudit.objects.get(pk=audit_id).summary == translated("Set a new logo", "de")


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
    assert message.conversation.subject == gettext_in("New message from %(name)s", "de") % {"name": "Sam"}
    assert gettext_in("Phone: %(phone)s", "de") % {"phone": "555-1234"} in message.text
    assert message.text.startswith("When is class?")
    translated("Phone: %(phone)s", "de")


def test_contact_email_fallback_is_in_the_owners_language(tenant_ctx, owner):
    with (
        mock.patch("apps.mailbox.inbound.receive_inbound", side_effect=RuntimeError("storage down")),
        mock.patch("apps.core.contact.views.send_email") as send,
    ):
        APIClient(HTTP_HOST=HOST).post(
            "/api/v1/contact/", {"name": "Sam", "email": "sam@x.com", "message": "Hi"}, format="json"
        )
    html = send.call_args.kwargs["html"]
    assert translated("New contact message", "de") in html
    assert gettext_in("via %(brand)s", "de").split("%(brand)s")[0] in html


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
    assert summaries[0] == translated("All students", "de")
    assert summaries[2] == translated("No courses selected", "de")
    assert "2" in summaries[1] and summaries[1] != "2 selected student(s)"
    assert course.title not in summaries[0]


def test_blog_pushes_are_in_the_owners_language(tenant_ctx, owner):
    from apps.blog import tasks
    from apps.blog.models import BlogPost

    post = BlogPost.objects.create(slug="s", title="Pads", body_html="<p>b</p>", status="published")
    sent = []
    with (
        translation.override("tr"),
        mock.patch.object(tasks, "_notify_coach", side_effect=lambda t, b: sent.append((t, b))),
    ):
        tasks.notify_autopilot_result(post, published=True)
        tasks.notify_autopilot_result(post, published=False)
        tasks.notify_autopilot_paused()
    assert sent[0][0] == translated("New blog post published", "de")
    assert sent[1][0] == translated("Your new blog post is ready", "de")
    assert sent[2][0] == translated("Blog autopilot paused", "de")
    assert all("Pads" in b for _t, b in sent[:2])


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


def test_a_tr_creator_gets_the_studio_panels_in_turkish(tenant_ctx):
    owner = User.objects.create_user(
        email="trowner@storedtext.com",
        name="Owner",
        password="x",
        role="owner",
        preferred_locale="tr",  # noqa: S106
    )
    client = creator_client(tenant_ctx, owner)

    index = client.get("/api/v1/studio-admin/meta/", HTTP_HOST=HOST).json()
    by_key = {m["key"]: m for m in index["models"]}
    assert by_key["courses"]["label"] == translated("Course")
    assert by_key["courses"]["description"] == translated(
        "Quick edits and publishing. Build course content in Content → Courses."
    )
    assert by_key["users"]["label_plural"] == translated("Users")

    courses = client.get("/api/v1/studio-admin/courses/meta/", HTTP_HOST=HOST).json()
    actions = {a["name"]: a for a in courses["actions"]}
    assert actions["publish"]["label"] == translated("Publish")
    assert actions["unpublish"]["confirm"] == translated("Unpublish selected courses? Students lose access to them.")
    assert {c["name"]: c["label"] for c in courses["list_display"]}["is_published"] == translated("Published")

    users = client.get("/api/v1/studio-admin/users/meta/", HTTP_HOST=HOST).json()
    assert users["actions"][0]["label"] == translated("Log in as")
    assert users["description"] == translated(
        "Students and staff in this studio. Log in as a student to see exactly what they see."
    )
    # the keys (urls) never follow the language
    assert set(by_key) >= {"courses", "users", "subscription-plans", "community-posts"}


def test_every_studio_panel_label_is_translatable_and_keys_are_stable():
    from apps.adminkit.sites import studio_site

    for key, admin in studio_site._registry.items():
        with translation.override("tr"):
            tr = (str(admin.label), str(admin.label_plural), str(admin.description))
        with translation.override("en"):
            en = (str(admin.label), str(admin.label_plural), str(admin.description))
        assert tr[0] != en[0] and tr[1] != en[1], f"{key}: label is not translated"
        assert key == admin.key
