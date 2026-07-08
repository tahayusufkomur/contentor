import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.media.models import Photo
from apps.tenant_config.logo_recipe import upgrade_recipe
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
    # v1 payload is upgraded to v2 on write.
    assert config.logo_recipe["version"] == 2
    assert config.logo_recipe["layout"] == "horizontal"


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
    # A bad *v2* layout is rejected. (A bad v1 layout would instead be
    # coerced to "horizontal" by upgrade_recipe — v1 upgrade is lenient by
    # design; hard-400 enforcement lives in the v2 validator.)
    bad = dict(upgrade_recipe(VALID_RECIPE), layout="freeform-chaos")
    resp = coach_client.patch("/api/v1/admin/config/", {"logo_recipe": bad}, format="json")
    assert resp.status_code == 400


def test_recipe_validation_clamps_and_strips(coach_client):
    # v1 payload with noisy values; upgraded to v2 then clamped by the
    # validator. Assert against the v2 shape (colors.badge fill, elements.*).
    noisy = dict(
        VALID_RECIPE,
        name="x" * 500,
        colors={"badge_bg": "javascript:alert(1)", "mark_fg": "#fff", "text": "#111827"},
        overrides={"mark_offset": [9999, -9999], "mark_scale": 99, "name_offset": [0, 0], "name_scale": 1},
    )
    resp = coach_client.patch("/api/v1/admin/config/", {"logo_recipe": noisy}, format="json")
    assert resp.status_code == 200, resp.content
    saved = TenantConfig.objects.first().logo_recipe
    assert saved["version"] == 2
    assert len(saved["name"]) <= 80
    assert saved["colors"]["badge"] == {"type": "solid", "color": "#111827"}  # invalid hex -> safe default
    assert saved["elements"]["mark"]["offset"] == [120, -120]  # clamped
    assert saved["elements"]["mark"]["scale"] == 3.0  # clamped (v2 range 0.4..3.0)


def test_empty_recipe_clears(coach_client):
    resp = coach_client.patch("/api/v1/admin/config/", {"logo_recipe": {}}, format="json")
    assert resp.status_code == 200
    assert TenantConfig.objects.first().logo_recipe == {}


def test_image_mark_url_is_signed_from_photo_id_on_read(coach_client):
    mark_photo = Photo.objects.create(s3_key="photos/mark.png", title="mark")
    recipe = dict(VALID_RECIPE, mark={"type": "image", "photo_id": str(mark_photo.id)})
    resp = coach_client.patch("/api/v1/admin/config/", {"logo_recipe": recipe}, format="json")
    assert resp.status_code == 200, resp.content
    resp = coach_client.get("/api/v1/admin/config/")
    assert resp.status_code == 200
    mark = resp.data["logo_recipe"]["mark"]
    assert mark["url"]
    assert "photos/mark.png" in mark["url"]


def test_image_mark_with_malformed_photo_id_is_clamped_not_500(coach_client):
    # photo_id isn't UUID-shaped. Photo.id is a UUIDField, so an unvalidated
    # value reaching Photo.objects.filter(pk=...) on read would raise
    # Django's ValidationError (uncaught by DRF -> 500) instead of a clean
    # response. The validator must clamp this at write time, and to_representation
    # must tolerate it defensively at read time regardless.
    bad = dict(VALID_RECIPE, mark={"type": "image", "photo_id": "not-a-uuid"})
    resp = coach_client.patch("/api/v1/admin/config/", {"logo_recipe": bad}, format="json")
    assert resp.status_code == 200, resp.content
    assert resp.data["logo_recipe"]["mark"]["photo_id"] == ""
    resp = coach_client.get("/api/v1/admin/config/")
    assert resp.status_code == 200
    assert resp.data["logo_recipe"]["mark"]["photo_id"] == ""
    assert resp.data["logo_recipe"]["mark"]["url"] == ""


def test_image_mark_read_tolerates_preexisting_malformed_photo_id(coach_client):
    config = TenantConfig.objects.first()
    config.logo_recipe = dict(VALID_RECIPE, mark={"type": "image", "photo_id": "not-a-uuid", "url": ""})
    config.save()
    resp = coach_client.get("/api/v1/admin/config/")
    assert resp.status_code == 200
    assert resp.data["logo_recipe"]["mark"]["url"] == ""


def test_fallback_suggestions_are_not_rate_limited(coach_client, settings):
    settings.ANTHROPIC_API_KEY = ""
    for _ in range(12):  # > the 10/hr AI budget
        resp = coach_client.post("/api/v1/admin/config/logo-suggestions/")
        assert resp.status_code == 200
        assert resp.json()["source"] == "fallback"


def test_fallback_fonts_exist_in_v2_catalog():
    from apps.tenant_config.logo_ai import FONTS

    # Task 3's catalog keeps all 8 v1 families, so fallback recipes stay valid.
    v2_fonts = {
        "Inter", "Geist", "DM Sans", "Plus Jakarta Sans", "Playfair Display", "Lora",
        "EB Garamond", "Cormorant Garamond", "Poppins", "Montserrat", "Archivo",
        "Space Grotesk", "Nunito", "Quicksand", "Baloo 2", "Fredoka",
        "Work Sans", "Manrope", "Sora", "Outfit",
    }
    for font in FONTS:
        assert font in v2_fonts
