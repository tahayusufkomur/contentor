import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.media.models import Photo
from apps.tenant_config.models import TenantConfig

pytestmark = pytest.mark.django_db(transaction=True)

HOST = "shared-test.localhost"


def test_tenant_config_has_logo_studio_fields(tenant_ctx):
    config = TenantConfig.objects.create(brand_name="Test Brand")
    assert config.icon is None
    assert config.icon_url == ""
    assert config.logo_recipe == {}


@pytest.fixture()
def coach(tenant_ctx):
    return User.objects.create_user(
        email="coach@logostudiotest.com",
        name="Coach",
        password="x",  # noqa: S106
        role="owner",
        is_staff=True,
    )


@pytest.fixture()
def coach_client(coach):  # reuse the existing coach/owner auth fixture pattern from test_navbar_config.py
    client = APIClient(HTTP_HOST=HOST)
    client.force_authenticate(user=coach)
    return client


@pytest.fixture(autouse=True)
def _ensure_config(tenant_ctx):
    """Guarantee a clean, uncached TenantConfig row exists before any PATCH.

    TenantConfigView.perform_update() dereferences serializer.instance
    unconditionally (old_pages = instance.pages...), so a PATCH against an
    empty table raises AttributeError instead of 404/creating one. TenantConfig
    also isn't in conftest's TENANT_CLEANUP_MODELS, so neither its presence
    nor its field values across tests/runs are guaranteed by tenant_ctx alone
    (a prior run can leave a row whose logo/icon FK dangles once its Photo was
    cleaned up) — reset the Logo Studio fields explicitly, mirroring the
    `TenantConfig.objects.first() or .create(...)` + explicit-field-reset
    convention already used by test_setup_status.py / test_navbar_config.py.

    TenantConfigView.get_object() also caches the instance for 300s under
    ``tenant:<schema>:config`` — a stale pickled instance from an earlier run
    (possibly with a since-deleted logo/icon FK) would otherwise be served
    straight back out and re-saved verbatim, independent of the DB reset
    above. Clear it too (same gotcha documented in test_setup_status.py).
    """
    from django.core.cache import cache
    from django.db import connection

    config = TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="Test Brand")
    config.logo = None
    config.icon = None
    config.logo_recipe = {}
    config.save()
    cache.delete(f"tenant:{connection.tenant.schema_name}:config")
    return config


VALID_RECIPE = {
    "version": 1,
    "layout": "badge_name",
    "name": "Zeynep Yoga",
    "mark": {"type": "icon", "icon": "flower-2"},
    "badge": "circle",
    "font": "Playfair Display",
    "colors": {"badge_bg": "#7c3aed", "mark_fg": "#ffffff", "text": "#111827"},
    "overrides": {"mark_offset": [0, 0], "mark_scale": 1, "name_offset": [0, 0], "name_scale": 1},
}


def test_patch_writes_logo_and_icon_fks_and_recipe(coach_client):
    logo_photo = Photo.objects.create(s3_key="photos/logo.png", title="logo")
    icon_photo = Photo.objects.create(s3_key="photos/icon.png", title="icon")
    resp = coach_client.patch(
        "/api/v1/admin/config/",
        {
            "logo_id": str(logo_photo.id),
            "icon_id": str(icon_photo.id),
            "logo_recipe": VALID_RECIPE,
        },
        format="json",
    )
    assert resp.status_code == 200, resp.content
    config = TenantConfig.objects.first()
    assert config.logo_id == logo_photo.id
    assert config.icon_id == icon_photo.id
    assert config.logo_recipe["layout"] == "badge_name"


def test_icon_url_is_signed_from_fk_on_read(coach_client):
    # _ensure_config already cleared the config cache for this test, so this
    # GET is guaranteed to hit the DB and see the icon set below.
    icon_photo = Photo.objects.create(s3_key="photos/icon.png", title="icon")
    config = TenantConfig.objects.first()
    config.icon = icon_photo
    config.save()
    resp = coach_client.get("/api/v1/admin/config/")
    assert resp.status_code == 200
    assert "photos/icon.png" in resp.data["icon_url"]


def test_recipe_validation_rejects_bad_layout(coach_client):
    bad = dict(VALID_RECIPE, layout="freeform-chaos")
    resp = coach_client.patch("/api/v1/admin/config/", {"logo_recipe": bad}, format="json")
    assert resp.status_code == 400


def test_recipe_validation_clamps_and_strips(coach_client):
    noisy = dict(
        VALID_RECIPE,
        name="x" * 500,
        colors={"badge_bg": "javascript:alert(1)", "mark_fg": "#fff", "text": "#111827"},
        overrides={"mark_offset": [9999, -9999], "mark_scale": 99, "name_offset": [0, 0], "name_scale": 1},
    )
    resp = coach_client.patch("/api/v1/admin/config/", {"logo_recipe": noisy}, format="json")
    assert resp.status_code == 200, resp.content
    saved = TenantConfig.objects.first().logo_recipe
    assert len(saved["name"]) <= 80
    assert saved["colors"]["badge_bg"] == "#111827"  # invalid hex -> safe default
    assert saved["overrides"]["mark_offset"] == [120, -120]  # clamped
    assert saved["overrides"]["mark_scale"] == 2.0  # clamped


def test_empty_recipe_clears(coach_client):
    resp = coach_client.patch("/api/v1/admin/config/", {"logo_recipe": {}}, format="json")
    assert resp.status_code == 200
    assert TenantConfig.objects.first().logo_recipe == {}
