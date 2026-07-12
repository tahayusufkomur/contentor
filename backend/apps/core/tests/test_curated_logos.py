"""Curated logo library (Phase 2): model, admin registration, catalog endpoint,
platform upload, dev mirror sync, seed command."""

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import CuratedLogo

SHARED_DOMAIN = "shared-test.localhost"

pytestmark = pytest.mark.django_db


@pytest.fixture()
def superuser(restore_public):
    return User.objects.create(
        email="root@curated.test", region="global", role="owner", is_staff=True, is_superuser=True
    )


def make_client(user=None, host=SHARED_DOMAIN):
    client = APIClient(HTTP_HOST=host)
    if user is not None:
        client.force_authenticate(user=user)
    return client


class TestCuratedLogoModel:
    def test_position_defaults_to_max_plus_one(self, restore_public):
        a = CuratedLogo.objects.create(title="A", image_key="platform/curated-logos/a.png")
        b = CuratedLogo.objects.create(title="B", image_key="platform/curated-logos/b.png")
        assert (a.position, b.position) == (1, 2)

    def test_explicit_position_kept(self, restore_public):
        row = CuratedLogo.objects.create(title="C", image_key="platform/curated-logos/c.png", position=7)
        assert row.position == 7


class TestCuratedLogoAdmin:
    def test_registered_and_crud(self, superuser):
        client = make_client(superuser)
        meta = client.get("/api/v1/platform-admin/meta/").json()
        assert "curated-logos" in {m["key"] for m in meta["models"]}

        resp = client.post(
            "/api/v1/platform-admin/curated-logos/",
            {
                "title": "Zen",
                "prompt": "a zen logo",
                "tags": "zen, yoga",
                "image_key": "platform/curated-logos/zen.png",
                "enabled": True,
            },
            format="json",
        )
        assert resp.status_code == 201, resp.content
        pk = resp.json()["id"]

        resp = client.patch(f"/api/v1/platform-admin/curated-logos/{pk}/", {"enabled": False}, format="json")
        assert resp.status_code == 200
        assert CuratedLogo.objects.get(pk=pk).enabled is False

    def test_requires_superuser(self, restore_public):
        anon = APIClient(HTTP_HOST=SHARED_DOMAIN)
        assert anon.get("/api/v1/platform-admin/curated-logos/").status_code in (401, 403)
