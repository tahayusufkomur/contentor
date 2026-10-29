"""An error is worded in the reader's language (Task 4.3c): a creator reads it in theirs."""

import pytest

from apps.accounts.models import User
from apps.community.models import CommunityMember, CommunitySettings, Post
from apps.core.tests.i18n_utils import creator_client, translated
from apps.email_campaigns.models import CampaignStatus, EmailCampaign

pytestmark = pytest.mark.django_db(transaction=True)

HOST = "shared-test.localhost"


def test_errors_follow_the_creator_language(tenant_ctx):
    owner = User.objects.create_user(email="owner@errorlang-c.com", name="Owner", password="x", role="owner")
    client = creator_client(tenant_ctx, owner)

    # email_campaigns
    draft = EmailCampaign.objects.create(subject="", status=CampaignStatus.DRAFT, sender=owner)
    send = client.post(f"/api/v1/email/campaigns/{draft.pk}/send/", {}, content_type="application/json", HTTP_HOST=HOST)
    assert send.status_code == 400
    assert send.json()["detail"] == translated("Give your email a subject first.")
    # a serializer error, caught from the request's language
    count = client.post(
        "/api/v1/email/recipients/count/",
        {"recipient_filter": "nope"},
        content_type="application/json",
        HTTP_HOST=HOST,
    )
    assert count.status_code == 400
    assert translated("recipient_filter must be an object.") in str(count.json())

    # mailbox
    upload = client.post("/api/v1/mailbox/attachments/", {}, HTTP_HOST=HOST)
    assert upload.status_code == 400
    assert upload.json()["detail"] == translated("No file provided.")

    # community: _handle_reaction once had a throwaway `_` that would shadow gettext
    settings_row = CommunitySettings.load()
    settings_row.is_enabled = True
    settings_row.save()
    author = CommunityMember.objects.create(
        user=User.objects.create_user(email="a@errorlang-c.com", name="A", password="x"), display_name="A"
    )
    post = Post.objects.create(author=author, body="a post")
    react = client.put(
        f"/api/v1/community/posts/{post.pk}/reaction/",
        {"emoji": "nope"},
        content_type="application/json",
        HTTP_HOST=HOST,
    )
    assert react.status_code == 400
    assert react.json() == {"emoji": [translated("Invalid emoji.")]}


def test_event_labels_follow_the_active_language():
    """The item cards are built at send time under the site's language: the labels must not freeze at import."""
    from django.utils import translation

    from apps.email_campaigns import catalog

    with translation.override("tr"):
        assert str(catalog._EVENT_LABELS["live"]) == translated("Live session")
    with translation.override("en"):
        assert str(catalog._EVENT_LABELS["live"]) == "Live session"


def _creator(tenant_ctx):
    owner = User.objects.create_user(
        email="designer@errorlang-c.com", name="Owner", password="x", role="owner", preferred_locale="tr"
    )
    return owner, creator_client(tenant_ctx, owner)


def test_a_designer_failure_is_worded_in_the_creator_language(tenant_ctx):
    """The run happens in a worker (English by default); what it stores is read back by a Turkish creator."""
    from unittest import mock

    from apps.email_campaigns import designer
    from apps.email_campaigns.models import EmailDesignJob
    from apps.email_campaigns.starters import blank_design

    owner, client = _creator(tenant_ctx)
    draft = EmailCampaign.objects.create(status=CampaignStatus.DRAFT, design=blank_design(), sender=owner)
    job = EmailDesignJob.objects.create(campaign=draft, brief="x", mode="new", created_by=owner)

    def nothing_usable(**_kwargs):
        yield ("delta", "I can't help with that.")
        yield ("done", {"cost_usd": 0, "provider": "test", "model": "m"})

    with mock.patch("apps.core.ai.stream_text", side_effect=nothing_usable):
        designer.execute(tenant_ctx, job.pk)

    got = client.get(f"/api/v1/email/designer/{job.pk}/", HTTP_HOST=HOST)
    assert got.json()["error"] == translated(
        "The Designer's draft didn't come out right. Try again, or say it differently."
    )


def test_a_stale_designer_run_fails_in_the_creator_language(tenant_ctx):
    from datetime import timedelta

    from django.utils import timezone

    from apps.email_campaigns.models import EmailDesignJob

    owner, client = _creator(tenant_ctx)
    job = EmailDesignJob.objects.create(brief="x", mode="new", status="working", created_by=owner)
    EmailDesignJob.objects.filter(pk=job.pk).update(updated_at=timezone.now() - timedelta(hours=2))
    got = client.get(f"/api/v1/email/designer/{job.pk}/", HTTP_HOST=HOST)
    assert got.json()["error"] == translated("The Designer stopped before finishing. Try again.")


def test_the_slot_labels_follow_the_creator_language(tenant_ctx):
    from apps.courses.models import Course

    owner, client = _creator(tenant_ctx)
    Course.objects.create(title="Newest", slug="newest-errorlang", instructor=owner, is_published=True)
    got = client.get("/api/v1/email/catalog/", HTTP_HOST=HOST)
    labels = {s["slotLabel"] for s in got.json()["slots"]}
    assert translated("Your newest course") in labels
