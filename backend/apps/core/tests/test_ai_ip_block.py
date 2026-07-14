"""IP blocklist: guard 403s, expiry, auto-block threshold."""

from datetime import timedelta

import pytest
from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APIClient

from apps.core import ipblock
from apps.core.models import AiIpBlock

pytestmark = pytest.mark.django_db(transaction=True)

# Plain APIClient() sends Host: testserver, which this repo's
# TenantMainMiddleware 404s on (no Domain row for it, no
# SHOW_PUBLIC_IF_NO_TENANT_FOUND) — mirrors the anon_client pattern in
# apps/core/tests/test_help_public.py. The guarded views are host-agnostic
# (marketing/rate endpoints don't touch connection.tenant), so routing
# through a registered tenant host doesn't change what's under test.
HOST = "shared-test.localhost"


@pytest.fixture(autouse=True)
def _clean_cache():
    cache.delete(ipblock.BLOCKLIST_CACHE_KEY)
    yield
    cache.clear()


def test_blocked_ip_gets_403_everywhere(tenant_ctx):
    AiIpBlock.objects.create(ip="6.6.6.6", source="manual")
    client = APIClient(HTTP_HOST=HOST, REMOTE_ADDR="6.6.6.6")
    assert client.get("/api/v1/help/status/").status_code == 403
    assert client.post("/api/v1/help/chat/", {"messages": []}, format="json").status_code == 403
    assert client.post("/api/v1/ai/rate/", {}, format="json").status_code == 403


def test_expired_block_is_ignored(tenant_ctx):
    AiIpBlock.objects.create(ip="6.6.6.7", expires_at=timezone.now() - timedelta(hours=1))
    assert APIClient(HTTP_HOST=HOST, REMOTE_ADDR="6.6.6.7").get("/api/v1/help/status/").status_code == 200


def test_auto_block_after_threshold(settings):
    settings.AI_IP_AUTOBLOCK_THRESHOLD = 5
    for _ in range(4):
        ipblock.record_throttle_denial("7.7.7.7")
    assert not AiIpBlock.objects.filter(ip="7.7.7.7").exists()
    ipblock.record_throttle_denial("7.7.7.7")
    row = AiIpBlock.objects.get(ip="7.7.7.7")
    assert row.source == "auto" and row.expires_at is not None


def test_cf_header_beats_remote_addr(tenant_ctx):
    AiIpBlock.objects.create(ip="1.2.3.4")
    client = APIClient(HTTP_HOST=HOST, REMOTE_ADDR="10.0.0.1", HTTP_CF_CONNECTING_IP="1.2.3.4")
    assert client.get("/api/v1/help/status/").status_code == 403


WIZARD_AI_URLS = [
    "/api/v1/onboarding/wizard/logo-status/",
    "/api/v1/onboarding/wizard/logo-converse/",
    "/api/v1/onboarding/wizard/logo-converse/finish/",
    "/api/v1/onboarding/wizard/logo-refine/",
    "/api/v1/onboarding/wizard/logo-upload/",
    "/api/v1/onboarding/wizard/recover/",
]


def test_blocked_ip_gets_403_on_wizard_ai_endpoints(tenant_ctx):
    # The guard runs BEFORE token resolution, so no valid token is needed.
    AiIpBlock.objects.create(ip="6.6.6.8", source="manual")
    client = APIClient(HTTP_HOST=HOST, REMOTE_ADDR="6.6.6.8")
    for url in WIZARD_AI_URLS:
        assert client.post(url, {}, format="json").status_code == 403, url


def test_wizard_logo_endpoints_throttle_per_ip(tenant_ctx):
    client = APIClient(HTTP_HOST=HOST, REMOTE_ADDR="8.8.8.1")
    statuses = [
        client.post("/api/v1/onboarding/wizard/logo-status/", {}, format="json").status_code
        for _ in range(21)  # rate is 20/min
    ]
    assert 429 in statuses, statuses
