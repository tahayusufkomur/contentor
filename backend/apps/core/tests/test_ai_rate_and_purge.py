from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.core import assistant
from apps.core.models import AiTranscript
from apps.core.tasks import purge_ai_transcripts

pytestmark = pytest.mark.django_db

# The tenant middleware 404s any Host it can't resolve to a Domain row (no
# SHOW_PUBLIC_IF_NO_TENANT_FOUND fallback configured), so HTTP-hitting tests
# need a real domain + tenant context like every other public-endpoint test
# in this suite (see test_contact_mailbox.py, test_help_public.py).
HOST = "shared-test.localhost"


def _row(**kw):
    defaults = {
        "feature": "help_bot",
        "audience": "coach",
        "tenant_schema": "t",
        "session_id": "s",
        "question": "q",
        "answer": "a",
        "cost_usd": Decimal("0"),
        "provider": "cli",
        "model": "haiku",
        "prompt_version": 1,
    }
    return AiTranscript.objects.create(**{**defaults, **kw})


def test_rate_happy_path_and_overwrite(tenant_ctx):
    row = _row()
    client = APIClient(HTTP_HOST=HOST)
    body = {"transcript_id": row.id, "rate_token": assistant.rate_token(row.id), "rating": "up"}
    assert client.post("/api/v1/ai/rate/", body, format="json").status_code == 204
    row.refresh_from_db()
    assert row.rating == "up"
    body["rating"] = "down"
    assert client.post("/api/v1/ai/rate/", body, format="json").status_code == 204
    row.refresh_from_db()
    assert row.rating == "down"


def test_rate_rejects_bad_token_and_bad_rating(tenant_ctx):
    row = _row()
    client = APIClient(HTTP_HOST=HOST)
    assert (
        client.post(
            "/api/v1/ai/rate/", {"transcript_id": row.id, "rate_token": "forged", "rating": "up"}, format="json"
        ).status_code
        == 400
    )
    other = _row()
    assert (
        client.post(
            "/api/v1/ai/rate/",
            {"transcript_id": row.id, "rate_token": assistant.rate_token(other.id), "rating": "up"},
            format="json",
        ).status_code
        == 400
    )
    assert (
        client.post(
            "/api/v1/ai/rate/",
            {"transcript_id": row.id, "rate_token": assistant.rate_token(row.id), "rating": "meh"},
            format="json",
        ).status_code
        == 400
    )


def test_purge_deletes_only_expired(settings):
    settings.AI_TRANSCRIPT_RETENTION_DAYS = 90
    old, fresh = _row(), _row()
    AiTranscript.objects.filter(pk=old.pk).update(created_at=timezone.now() - timedelta(days=91))
    purge_ai_transcripts()
    assert set(AiTranscript.objects.values_list("id", flat=True)) == {fresh.id}
