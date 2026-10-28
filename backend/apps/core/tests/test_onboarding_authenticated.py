"""Authenticated platform creation — a logged-in coach spins up an additional
platform without the email-verification round-trip (POST
/api/v1/onboarding/signup/authenticated/)."""

from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.accounts.tokens import verify_signup_token
from apps.core.constants import SITE_PLACEHOLDER_PREFIX

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
    resp = _client(coach_user).post("/api/v1/onboarding/signup/authenticated/", {}, format="json")
    assert resp.status_code == 200, resp.content
    token = resp.json()["token"]
    payload = verify_signup_token(token)
    # Token is minted for the logged-in coach — they never re-enter their email.
    assert payload["email"] == coach_user.email
    assert payload["name"] == coach_user.name
    # The site is named in /setup: until then it has a temporary address.
    assert payload["site"].startswith(SITE_PLACEHOLDER_PREFIX)
    assert payload["region"] == "global"


def test_each_new_site_gets_its_own_temporary_address(coach_user):
    sites = {
        verify_signup_token(
            _client(coach_user).post("/api/v1/onboarding/signup/authenticated/", {}, format="json").json()["token"]
        )["site"]
        for _ in range(2)
    }
    assert len(sites) == 2


def test_requires_authentication(restore_public):
    resp = _client().post("/api/v1/onboarding/signup/authenticated/", {}, format="json")
    assert resp.status_code in (401, 403)


def test_students_cannot_provision(student_user):
    resp = _client(student_user).post("/api/v1/onboarding/signup/authenticated/", {}, format="json")
    assert resp.status_code == 403
