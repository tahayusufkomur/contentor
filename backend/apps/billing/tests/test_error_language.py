"""An error is worded in the reader's language (Task 4.3b): a creator reads it in theirs."""

from datetime import UTC, datetime, timedelta

import jwt
import pytest
from django.conf import settings
from django.test import Client

from apps.accounts.models import User
from apps.core.tests.i18n_utils import translated

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
    owner = User.objects.create_user(email="owner@errorlang-b.com", name="Owner", password="x", role="owner")
    student = User.objects.create_user(email="student@errorlang-b.com", name="S", password="x", role="student")
    client = _creator_client(tenant_ctx, owner)

    # accounts: student_grant_access once had a throwaway `_` that would shadow gettext
    grant = client.post(
        f"/api/v1/auth/students/{student.pk}/grant-access/", {}, content_type="application/json", HTTP_HOST=HOST
    )
    assert grant.status_code == 400
    assert grant.json()["detail"] == translated("course_id is required.")

    gone = client.delete("/api/v1/auth/students/999999/", HTTP_HOST=HOST)
    assert gone.status_code == 404
    assert gone.json()["detail"] == translated("Student not found.")

    # billing: the machine code stays, the sentence follows the creator
    dashboard = client.get("/api/v1/billing/connect/dashboard/", HTTP_HOST=HOST)
    assert dashboard.status_code == 400
    assert dashboard.json() == {"error": "NOT_CONNECTED", "detail": translated("No connected account yet.")}
