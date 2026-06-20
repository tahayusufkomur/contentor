import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.usage.models import UsageEvent

pytestmark = pytest.mark.django_db(transaction=True)
SHARED_DOMAIN = "shared-test.localhost"


def _client(user):
    c = APIClient(HTTP_HOST=SHARED_DOMAIN)
    c.force_authenticate(user=user)
    return c


def test_student_usage_recorded_and_denormalized(tenant_ctx):
    student = User.objects.create_user(email="s@u.com", name="S", password="x", role="student")
    res = _client(student).post(
        "/api/v1/me/usage/", {"mode": "pwa", "platform": "ios"}, format="json"
    )
    assert res.status_code == 204
    assert UsageEvent.objects.filter(user=student, mode="pwa", platform="ios").count() == 1
    student.refresh_from_db()
    assert student.last_display_mode == "pwa"
    assert student.last_platform == "ios"
    assert student.first_pwa_at is not None


def test_usage_idempotent_per_day(tenant_ctx):
    student = User.objects.create_user(email="s2@u.com", name="S2", password="x", role="student")
    client = _client(student)
    body = {"mode": "browser", "platform": "android"}
    client.post("/api/v1/me/usage/", body, format="json")
    client.post("/api/v1/me/usage/", body, format="json")
    assert UsageEvent.objects.filter(user=student).count() == 1


def test_invalid_mode_returns_400(tenant_ctx):
    student = User.objects.create_user(email="s3@u.com", name="S3", password="x", role="student")
    res = _client(student).post(
        "/api/v1/me/usage/", {"mode": "nope", "platform": "ios"}, format="json"
    )
    assert res.status_code == 400


def test_invalid_platform_returns_400(tenant_ctx):
    student = User.objects.create_user(email="s4@u.com", name="S4", password="x", role="student")
    res = _client(student).post(
        "/api/v1/me/usage/", {"mode": "pwa", "platform": "nope"}, format="json"
    )
    assert res.status_code == 400


def test_missing_fields_returns_400(tenant_ctx):
    student = User.objects.create_user(email="s5@u.com", name="S5", password="x", role="student")
    res = _client(student).post("/api/v1/me/usage/", {}, format="json")
    assert res.status_code == 400
    assert UsageEvent.objects.filter(user=student).count() == 0


def test_non_student_records_nothing(tenant_ctx):
    coach = User.objects.create_user(email="c@u.com", name="C", password="x", role="owner")
    res = _client(coach).post(
        "/api/v1/me/usage/", {"mode": "pwa", "platform": "desktop"}, format="json"
    )
    assert res.status_code == 204
    assert UsageEvent.objects.filter(user=coach).count() == 0
