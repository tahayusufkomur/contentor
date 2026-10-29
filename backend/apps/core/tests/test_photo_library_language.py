"""The photo library's errors, and the 429 of the rate limit, are worded in the reader's language (Task 4.3d fix 1)."""

from unittest import mock

import pytest
from django.test import Client
from django.utils.translation import override

from apps.accounts.models import User
from apps.core.curated_images import cache as curated_cache
from apps.core.curated_images import client, views
from apps.core.tests.i18n_utils import creator_client, translated
from apps.tenant_config.models import TenantConfig

pytestmark = pytest.mark.django_db(transaction=True)

HOST = "shared-test.localhost"


def _use(tenant_ctx):
    owner = User.objects.create_user(email="owner@photolang.com", name="Owner", password="x", role="owner")
    return creator_client(tenant_ctx, owner).post("/api/v1/curated-images/abc/use/", HTTP_HOST=HOST)


def test_the_photo_librarys_503_follows_the_creator_language(tenant_ctx):
    with mock.patch.object(client, "get", side_effect=client.CuratedImageError(client.UNAVAILABLE)):
        response = _use(tenant_ctx)

    assert response.status_code == 503
    assert response.json()["detail"] == translated("the photo library is unavailable right now")


def test_the_credits_message_follows_the_creator_language(tenant_ctx):
    with mock.patch.object(client, "get", side_effect=client.CuratedImageError(client.OUT_OF_CREDITS)):
        response = _use(tenant_ctx)

    assert response.json()["detail"] == translated("image credits are used up for now")


def test_a_photo_that_could_not_be_saved_follows_the_creator_language(tenant_ctx):
    with (
        mock.patch.object(client, "get", return_value=object()),
        mock.patch.object(views, "cache_remote_image", side_effect=client.CuratedImageError(curated_cache.FAILED)),
    ):
        response = _use(tenant_ctx)

    assert response.json()["detail"] == translated("that photo could not be saved to your library")


def test_an_unconfigured_library_follows_the_creator_language(tenant_ctx, settings):
    settings.CURATED_IMAGE_API_FAKE = False
    settings.CURATED_IMAGE_API_URL = ""

    response = _use(tenant_ctx)

    assert response.status_code == 503
    assert response.json()["detail"] == translated("the photo library is not configured")


def test_an_empty_generation_prompt_is_worded_in_the_active_language():
    with override("tr"), pytest.raises(client.CuratedImageError) as raised:
        client.generate("  ", idempotency_key="k")

    with override("tr"):
        assert str(raised.value) == translated("describe the image you want")


def test_a_rate_limited_visitor_reads_the_429_in_the_site_language(tenant_ctx):
    """Creators are exempt from the limit; the visitor and the student read it, in the site's language."""
    TenantConfig.objects.all().delete()
    TenantConfig.objects.create(brand_name="Studio", default_locale="tr")
    over = mock.MagicMock()
    over.return_value.pipeline.return_value.execute.return_value = [None, None, 10_000, None]

    with mock.patch("apps.core.middleware.rate_limit.get_redis_connection", over):
        response = Client().get("/api/v1/auth/users/me/", HTTP_HOST=HOST, HTTP_ACCEPT_LANGUAGE="en")

    assert response.status_code == 429
    assert response.json()["detail"] == translated("Rate limit exceeded")
