"""Read-only adminkit browsers for the AI audit trail + spend meters
(platform-admin site, public schema): AiTranscript, HelpBotUsage,
StudentBotUsage, BlogAiUsage, LogoAiUsage, OnboardingAiUsage. No create/edit/
delete path is reachable — every capability is verified over real HTTP
verbs, not just asserted from the class definition."""

from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import (
    AiTranscript,
    BlogAiUsage,
    HelpBotUsage,
    LogoAiUsage,
    OnboardingAiUsage,
    StudentBotUsage,
)

SHARED_DOMAIN = "shared-test.localhost"

pytestmark = pytest.mark.django_db


def make_client(user=None, host=SHARED_DOMAIN):
    client = APIClient(HTTP_HOST=host)
    if user is not None:
        client.force_authenticate(user=user)
    return client


@pytest.fixture()
def superuser(restore_public):
    return User.objects.create(
        email="root-ai-admin@contentor.app", region="global", role="owner", is_staff=True, is_superuser=True
    )


def test_transcripts_listed_and_read_only(superuser):
    AiTranscript.objects.create(
        feature="student_bot",
        audience="student",
        tenant_schema="demo_yoga",
        question="q",
        answer="a",
        cost_usd=Decimal("0.003"),
        provider="anthropic",
        model="claude-haiku-4-5",
    )
    client = make_client(superuser)
    rows = client.get("/api/v1/platform-admin/ai-transcripts/", {"q": "demo_yoga"}).json()
    assert rows["results"][0]["feature"] == "student_bot"
    pk = rows["results"][0]["id"]
    assert (
        client.patch(f"/api/v1/platform-admin/ai-transcripts/{pk}/", {"answer": "x"}, format="json").status_code == 405
    )
    assert client.delete(f"/api/v1/platform-admin/ai-transcripts/{pk}/").status_code == 405
    assert client.post("/api/v1/platform-admin/ai-transcripts/", {}, format="json").status_code == 405


_USAGE_MODELS_BY_KEY = {
    "help-bot-usage": HelpBotUsage,
    "student-bot-usage": StudentBotUsage,
    "blog-ai-usage": BlogAiUsage,
    "logo-ai-usage": LogoAiUsage,
    "onboarding-ai-usage": OnboardingAiUsage,
}


@pytest.mark.parametrize(
    "key", ["help-bot-usage", "student-bot-usage", "blog-ai-usage", "logo-ai-usage", "onboarding-ai-usage"]
)
def test_usage_meters_browsable_and_read_only(superuser, key):
    model = _USAGE_MODELS_BY_KEY[key]
    row = model.objects.create(tenant_schema="demo_yoga", month="2026-07")
    client = make_client(superuser)

    rows = client.get(f"/api/v1/platform-admin/{key}/").json()
    assert rows["results"][0]["tenant_schema"] == "demo_yoga"

    assert client.post(f"/api/v1/platform-admin/{key}/", {}, format="json").status_code == 405
    assert (
        client.patch(f"/api/v1/platform-admin/{key}/{row.pk}/", {"tenant_schema": "x"}, format="json").status_code
        == 405
    )
    assert client.delete(f"/api/v1/platform-admin/{key}/{row.pk}/").status_code == 405
