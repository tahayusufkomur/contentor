"""An error is worded in the reader's language (Task 4.3a): a creator reads it in theirs."""

from datetime import UTC, datetime, timedelta

import jwt
import pytest
from django.conf import settings
from django.test import Client

from apps.accounts.models import User
from apps.core.tests.i18n_utils import translated
from apps.downloads.models import DownloadFile

pytestmark = pytest.mark.django_db(transaction=True)


def test_errors_follow_the_creator_language(tenant_ctx):
    owner = User.objects.create_user(email="owner@errorlang.com", name="Owner", password="x", role="owner")
    download = DownloadFile.objects.create(title="Not uploaded yet", file_url="", is_published=True)
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

    response = client.get(f"/api/v1/downloads/{download.pk}/url/", HTTP_HOST="shared-test.localhost")

    assert response.status_code == 404
    assert response.json()["detail"] == translated("File not yet available.")
