"""Authenticated platform creation — a logged-in coach spins up an additional
platform without the email-verification round-trip (POST
/api/v1/onboarding/signup/authenticated/)."""

from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.accounts.tokens import verify_signup_token

SHARED_DOMAIN = "shared-test.localhost"

pytestmark = pytest.mark.django_db


@pytest.fixture()
def coach_user(restore_public):
    return User.objects.create(email="coach@onb.test", name="Coach Carter", region="global", role="coach")


@pytest.fixture()
def student_user(restore_public):
    return User.objects.create(email="student@onb.test", name="Sam Student", region="global", role="student")


def _client(user=None):
    client = APIClient(HTTP_HOST=SHARED_DOMAIN)
    if user is not None:
        client.force_authenticate(user=user)
    return client


def test_authenticated_coach_gets_signup_token_without_email(coach_user):
    resp = _client(coach_user).post(
        "/api/v1/onboarding/signup/authenticated/",
        {"brand_name": "Brand New Studio"},
        format="json",
    )
    assert resp.status_code == 200, resp.content
    token = resp.json()["token"]
    payload = verify_signup_token(token)
    # Token is minted for the logged-in coach — they never re-enter their email.
    assert payload["email"] == coach_user.email
    assert payload["name"] == coach_user.name
    assert payload["brand_name"] == "Brand New Studio"
    assert payload["region"] == "global"


def test_requires_authentication(restore_public):
    resp = _client().post(
        "/api/v1/onboarding/signup/authenticated/",
        {"brand_name": "Anon Studio"},
        format="json",
    )
    assert resp.status_code in (401, 403)


def test_students_cannot_provision(student_user):
    resp = _client(student_user).post(
        "/api/v1/onboarding/signup/authenticated/",
        {"brand_name": "Student Studio"},
        format="json",
    )
    assert resp.status_code == 403


def test_blank_brand_name_rejected(coach_user):
    resp = _client(coach_user).post(
        "/api/v1/onboarding/signup/authenticated/",
        {"brand_name": "   "},
        format="json",
    )
    assert resp.status_code == 400


def test_taken_brand_name_rejected(coach_user):
    # The shared test tenant already owns the "shared-test" slug.
    resp = _client(coach_user).post(
        "/api/v1/onboarding/signup/authenticated/",
        {"brand_name": "Shared Test"},
        format="json",
    )
    assert resp.status_code == 400
