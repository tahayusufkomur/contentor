"""An error is worded in the reader's language (Task 4.3c): a creator reads it in theirs."""

from datetime import UTC, datetime, timedelta

import jwt
import pytest
from django.conf import settings
from django.test import Client

from apps.accounts.models import User
from apps.community.models import CommunityMember, CommunitySettings, Post
from apps.core.tests.i18n_utils import translated
from apps.email_campaigns.models import CampaignStatus, EmailCampaign

pytestmark = pytest.mark.django_db(transaction=True)

HOST = "shared-test.localhost"


def _creator_client(tenant_ctx, owner):
    now = datetime.now(tz=UTC)
    token = jwt.encode(
        {
            "user_id": owner.id,
            "tenant_id": tenant_ctx.schema_name,
            "role": owner.role,
            "iat": now,
            "exp": now + timedelta(days=1),
        },
        settings.SECRET_KEY,
        algorithm="HS256",
    )
    client = Client()
    client.cookies["contentor_access_token"] = token
    client.cookies["user-locale"] = "tr"
    return client


def test_errors_follow_the_creator_language(tenant_ctx):
    owner = User.objects.create_user(email="owner@errorlang-c.com", name="Owner", password="x", role="owner")
    client = _creator_client(tenant_ctx, owner)

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
