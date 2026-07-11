"""navbar_config serializer validation: layout enum, flag coercion, unsafe-href
stripping, and the guarantee that navbar-only edits never flip pages_edited."""

import pytest
from rest_framework import serializers
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.tenant_config.models import TenantConfig
from apps.tenant_config.serializers import TenantConfigSerializer

pytestmark = pytest.mark.django_db(transaction=True)

HOST = "shared-test.localhost"


def _validate(payload):
    return TenantConfigSerializer().validate_navbar_config(payload)


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
    cfg.navbar_config = {"links": [], "cta": None, "show_login": True}
    cfg.save()
    return cfg


def _patch_navbar(client, payload):
    return client.patch("/api/v1/admin/config/", {"navbar_config": payload}, format="json")


def _nav(config):
    config.refresh_from_db()
    return config.navbar_config


def test_valid_layout_persists(client, config):
    resp = _patch_navbar(client, {"links": [], "cta": None, "show_login": True, "layout": "pill"})
    assert resp.status_code == 200, resp.content
    assert _nav(config)["layout"] == "pill"


def test_missing_layout_defaults_to_classic(client, config):
    resp = _patch_navbar(client, {"links": [], "cta": None, "show_login": True})
    assert resp.status_code == 200, resp.content
    assert _nav(config)["layout"] == "classic"


def test_invalid_layout_rejected(client, config):
    resp = _patch_navbar(client, {"links": [], "cta": None, "show_login": True, "layout": "mega"})
    assert resp.status_code == 400
    assert "layout" in str(resp.content)


def test_non_dict_rejected(client, config):
    resp = _patch_navbar(client, ["not", "a", "dict"])
    assert resp.status_code == 400


def test_unsafe_hrefs_stripped(client, config):
    resp = _patch_navbar(
        client,
        {
            "links": [{"label": "Evil", "href": "javascript:alert(1)"}],
            "cta": {"text": "Go", "href": " VBSCRIPT:bad"},
            "show_login": True,
        },
    )
    assert resp.status_code == 200, resp.content
    nav = _nav(config)
    assert nav["links"][0]["href"] == ""
    assert nav["cta"]["href"] == ""


def test_flags_coerced_and_defaulted(client, config):
    resp = _patch_navbar(
        client,
        {"links": [], "cta": None, "show_login": 1, "transparent_over_hero": 1},
    )
    assert resp.status_code == 200, resp.content
    nav = _nav(config)
    assert nav["show_login"] is True
    assert nav["transparent_over_hero"] is True
    assert nav["show_install"] is True  # defaulted


def test_link_label_capped_and_junk_links_dropped(client, config):
    resp = _patch_navbar(
        client,
        {"links": [{"label": "x" * 200, "href": "/courses"}, "junk", 42], "cta": None, "show_login": True},
    )
    assert resp.status_code == 200, resp.content
    nav = _nav(config)
    assert len(nav["links"]) == 1
    assert len(nav["links"][0]["label"]) == 80


def test_navbar_edit_does_not_flip_pages_edited(client, config):
    resp = _patch_navbar(
        client,
        {"links": [{"label": "Events", "href": "/events"}], "cta": None, "show_login": True, "layout": "centered"},
    )
    assert resp.status_code == 200, resp.content
    config.refresh_from_db()
    assert config.setup_progress.get("pages_edited", []) == []


class TestNavbarLogoControls:
    def test_logo_size_defaults_to_md(self):
        cleaned = _validate({"links": []})
        assert cleaned["logo_size"] == "md"

    def test_logo_size_accepts_presets(self):
        for size in ("sm", "md", "lg", "xl"):
            assert _validate({"logo_size": size})["logo_size"] == size

    def test_logo_size_rejects_unknown(self):
        with pytest.raises(serializers.ValidationError):
            _validate({"logo_size": "huge"})

    def test_show_brand_name_defaults_false_and_coerces(self):
        assert _validate({})["show_brand_name"] is False
        assert _validate({"show_brand_name": 1})["show_brand_name"] is True
