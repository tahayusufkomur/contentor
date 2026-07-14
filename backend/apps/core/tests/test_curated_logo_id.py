import pytest
from django.db import connection
from rest_framework.test import APIClient

from apps.core.models import CuratedLogo

pytestmark = pytest.mark.django_db(transaction=True)

# Tenant routing requires a registered domain — same host restore_public seeds
# (see conftest.py SHARED_DOMAIN); a bare APIClient() 404s before it can see
# the "id" key, per apps/core/tests/test_curated_logos.py's own convention.
SHARED_DOMAIN = "shared-test.localhost"


def test_curated_catalog_rows_include_id(restore_public):
    connection.set_schema_to_public()
    row = CuratedLogo.objects.create(
        title="Lotus",
        prompt="a lotus",
        tags="yoga",
        image_key="platform/curated-logos/lotus.png",
        enabled=True,
    )
    try:
        resp = APIClient(HTTP_HOST=SHARED_DOMAIN).get("/api/v1/logos/curated/")
        assert resp.status_code == 200
        match = [r for r in resp.json() if r.get("id") == row.id]
        assert match and match[0]["title"] == "Lotus"
    finally:
        row.delete()
