from unittest.mock import patch

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.courses.models import Course
from apps.tenant_config.models import SeededObject, TenantConfig
from apps.tenant_config.seeding import register_seeded

pytestmark = pytest.mark.django_db(transaction=True)

HOST = "shared-test.localhost"


@pytest.fixture()
def coach(tenant_ctx):
    return User.objects.create_user(
        email="coach@x.com",
        name="Coach",
        password="x",  # noqa: S106
        role="owner",
        is_staff=True,
    )


@pytest.fixture()
def client(coach):
    c = APIClient(HTTP_HOST=HOST)
    c.force_authenticate(user=coach)
    return c


@pytest.fixture()
def config(tenant_ctx):
    cfg = TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="T")
    cfg.setup_progress = {}
    cfg.setup_guide_dismissed = False
    cfg.enabled_modules = ["courses", "downloads"]
    cfg.save()
    yield cfg
    SeededObject.objects.all().delete()


def _items(body):
    return {i["key"]: i for i in body["items"]}


def test_core_items_present_and_progress(client, config):
    with patch("apps.tenant_config.setup_items.can_monetize", return_value=False):
        body = client.get("/api/v1/admin/setup-status/").json()
    items = _items(body)
    for key in ("page_home", "page_faq", "look", "first_course", "payouts", "publish"):
        assert key in items, key
        assert items[key]["done"] is False
    assert "demo_cleanup" not in items  # never seeded
    assert body["progress"]["total"] == len([i for i in body["items"] if not i["optional"]])
    assert body["demo_present"] is False


def test_pages_edited_marks_page_items(client, config):
    config.setup_progress = {"pages_edited": ["home", "faq"]}
    config.save(update_fields=["setup_progress"])
    with patch("apps.tenant_config.setup_items.can_monetize", return_value=False):
        items = _items(client.get("/api/v1/admin/setup-status/").json())
    assert items["page_home"]["done"] is True
    assert items["page_home"]["source"] == "auto"
    assert items["page_about"]["done"] is False


def test_first_course_ignores_untouched_demo(client, coach, config):
    demo = Course.objects.create(title="D", slug="d-setupv2", instructor=coach)
    register_seeded([demo], niche="general")
    with patch("apps.tenant_config.setup_items.can_monetize", return_value=False):
        items = _items(client.get("/api/v1/admin/setup-status/").json())
    assert items["first_course"]["done"] is False  # only demo content exists
    assert items["demo_cleanup"]["done"] is False  # registry non-empty
    demo.title = "Coach renamed me"
    demo.save()
    with patch("apps.tenant_config.setup_items.can_monetize", return_value=False):
        items = _items(client.get("/api/v1/admin/setup-status/").json())
    assert items["first_course"]["done"] is True  # edited demo counts as own
    demo.delete()


def test_manual_override_roundtrip(client, config):
    with patch("apps.tenant_config.setup_items.can_monetize", return_value=False):
        body = client.patch("/api/v1/admin/setup-status/", {"item": "page_faq", "done": True}, format="json").json()
    assert _items(body)["page_faq"] == {
        "key": "page_faq",
        "group": "site",
        "done": True,
        "source": "manual",
        "optional": False,
    }
    with patch("apps.tenant_config.setup_items.can_monetize", return_value=False):
        body = client.patch("/api/v1/admin/setup-status/", {"item": "page_faq", "done": False}, format="json").json()
    assert _items(body)["page_faq"]["done"] is False


def test_manual_unknown_key_400(client, config):
    resp = client.patch("/api/v1/admin/setup-status/", {"item": "hack_me", "done": True}, format="json")
    assert resp.status_code == 400


def test_dismiss_roundtrip(client, config):
    with patch("apps.tenant_config.setup_items.can_monetize", return_value=False):
        body = client.patch("/api/v1/admin/setup-status/", {"dismissed": True}, format="json").json()
    assert body["dismissed"] is True
    config.refresh_from_db()
    assert config.setup_guide_dismissed is True


def test_config_save_tracks_page_and_look_edits(client, config):
    from django.core.cache import cache
    from django.db import connection

    config.pages = {"home": {"blocks": []}, "about": {"blocks": []}}
    config.save(update_fields=["pages"])
    # TenantConfigView.get_object may serve a cached instance with stale pages
    # from an earlier test — clear it so the diff compares against the DB row.
    cache.delete(f"tenant:{connection.tenant.schema_name}:config")
    client.patch(
        "/api/v1/admin/config/",
        {
            "pages": {"home": {"blocks": [{"id": "b1", "type": "richText", "enabled": True}]}, "about": {"blocks": []}},
            "theme": "ember",
        },
        format="json",
    )
    config.refresh_from_db()
    assert config.setup_progress.get("pages_edited") == ["home"]  # about unchanged
    assert config.setup_progress.get("look_edited") is True


def test_resigned_photo_url_does_not_count_as_page_edit(client, config):
    """Reproduces the false-positive bug: opening the builder (no real edits)
    triggers a debounced autosave that round-trips a photo block's ``url``
    field. The serializer re-derives a fresh presigned URL for every GET
    (see ``TenantConfigSerializer._sign_tree``), so the *same* ``photo_id``
    serializes to a *different* ``url`` string on every read. If that
    autosave PATCHes the re-signed url back verbatim, the naive before/after
    JSON diff must not treat it as the coach having edited the page.
    """
    from django.core.cache import cache
    from django.db import connection

    hero_block = {
        "id": "blk_hero",
        "type": "hero",
        "enabled": True,
        "heading": "Welcome",
        "subheading": "",
        "ctaText": "",
        "ctaHref": "",
        "bgImage": {
            "url": "https://s3.example.com/bucket/photo.jpg?X-Amz-Date=A",
            "photo_id": "6c9b6e0e-1c2b-4a3d-9f2e-8b7a6c5d4e3f",
        },
    }
    config.pages = {"home": {"blocks": [hero_block]}, "about": {"blocks": []}}
    config.save(update_fields=["pages"])
    cache.delete(f"tenant:{connection.tenant.schema_name}:config")

    # Same photo_id, same everything else — only the presigned url string
    # differs, simulating a re-signed URL round-tripped by an autosave.
    resigned_block = {
        **hero_block,
        "bgImage": {
            "url": "https://s3.example.com/bucket/photo.jpg?X-Amz-Date=B",
            "photo_id": "6c9b6e0e-1c2b-4a3d-9f2e-8b7a6c5d4e3f",
        },
    }
    client.patch(
        "/api/v1/admin/config/",
        {"pages": {"home": {"blocks": [resigned_block]}, "about": {"blocks": []}}},
        format="json",
    )
    config.refresh_from_db()
    assert config.setup_progress.get("pages_edited", []) == []  # no real content changed
